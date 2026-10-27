import * as crypto from 'node:crypto'

import { recordBillingDryRunTelemetry } from '../telemetry.mjs'
import { speechSecondsFromChars } from './evolving-model.mjs'
import {
	createBillingLedgerStore,
	hashDeckId,
	hashOperationId,
	hashSessionId,
} from './ledger-store.mjs'
import { classifyBillingTool, isBillingDryRunEnabled } from './classifier.mjs'
import {
	applyMinimumCharge,
	currentRateCard,
	currentRateCardVersion,
	roundCredits,
} from './rate-card.mjs'

const RICH_OBJECT_TYPES = new Set([
	'chart',
	'table',
	'image',
	'media',
	'video',
	'audio',
	'model3d',
	'smartart',
	'equation',
	'ole',
])

function stableString(value) {
	try { return JSON.stringify(value, Object.keys(value || {}).sort()) } catch { return String(value || '') }
}

function idempotencyKey(args = {}) {
	return String(args.idempotencyKey || args.idempotency_key || '').trim()
}

function sessionIdFor(context = {}) {
	return String(context.sessionId || 'stdio-default')
}

function bytesToMb(bytes) {
	return Math.max(0, Number(bytes) || 0) / 1048576
}

function textLength(value) {
	if (typeof value === 'string') return value.length
	if (Array.isArray(value)) return value.reduce((sum, item) => sum + textLength(item?.text ?? item), 0)
	if (value && typeof value === 'object') return Object.values(value).reduce((sum, item) => sum + textLength(item), 0)
	return 0
}

function objectKind(obj = {}) {
	return String(obj.type || obj._type || obj.kind || obj.shape || '').toLowerCase()
}

function slideObjects(slide = {}) {
	return Array.isArray(slide._slideObjects)
		? slide._slideObjects.filter(obj => objectKind(obj) !== 'notes')
		: []
}

function countRichObjects(objects = []) {
	let count = 0
	for (const obj of objects) {
		const kind = objectKind(obj)
		if (RICH_OBJECT_TYPES.has(kind)) count += 1
		else if (obj.chart || obj.data || obj.media || obj.imageSizingCrop || obj.hyperlink) count += 1
	}
	return count
}

function countAnimations(slide = {}) {
	return Array.isArray(slide._animations) ? slide._animations.length : 0
}

function countTransitions(slides = []) {
	return slides.filter(slide => slide?.transition).length
}

export function collectDeckBillingMetrics(entry = {}, result = {}) {
	const pptx = entry?.pptx || {}
	const slides = Array.isArray(pptx.slides) ? pptx.slides : []
	const objects = slides.flatMap(slideObjects)
	const outputBytes = Math.max(0, Number(result.bytes || result.artifact?.bytes || entry?.lastArtifact?.bytes || 0))
	const animationCount = slides.reduce((sum, slide) => sum + countAnimations(slide), 0)
	return {
		slideCount: Math.max(0, Number(result.slideCount || slides.length || 0)),
		finalObjectCount: objects.length,
		richObjectCount: countRichObjects(objects),
		transitionCount: countTransitions(slides),
		animationCount,
		outputBytes,
		outputMb: Number(bytesToMb(outputBytes).toFixed(2)),
	}
}

export function estimateCheckpointCost(metrics = {}, rateCard = currentRateCard()) {
	const c = rateCard.checkpoint
	const raw =
		c.deckSaveBase +
		Math.max(0, Number(metrics.slideCount) || 0) * c.perFinalSlide +
		Math.max(0, Number(metrics.finalObjectCount) || 0) * c.perFinalObject +
		Math.max(0, Number(metrics.richObjectCount) || 0) * c.perRichObject +
		Math.max(0, Number(metrics.outputMb) || 0) * c.perOutputMb
	return applyMinimumCharge(raw, rateCard)
}

function argByteEstimate(args = {}, result = {}) {
	return Math.max(
		0,
		Number(args.bytes || args.byteLength || args.sizeBytes || args.fileSizeBytes || result.bytes || result.sizeBytes || 0) || 0,
	)
}

export function estimateHeavyCost(name, args = {}, result = {}, rateCard = currentRateCard()) {
	const h = rateCard.heavy
	const tool = String(name || '')
	if (tool === 'betterpptx.deck.open_uploaded' || tool === 'betterpptx.deck.open_existing' || tool === 'betterpptx.deck.load_template') {
		return applyMinimumCharge(h.openUploadedBase + bytesToMb(argByteEstimate(args, result)) * h.openUploadedPerMb, rateCard)
	}
	if (tool === 'betterpptx.narration.get_voice_timing' || tool === 'betterpptx.deck.add_narration' || tool === 'betterpptx.slide.add_narration') {
		if (tool === 'betterpptx.narration.get_voice_timing' && Array.isArray(args.segments) && args.segments.length) {
			const synthesized = args.segments.filter(segment => !/^asset:\/\/locked\/[^/]+\/[a-f0-9]{64}\.wav$/.test(String(segment?.audioRef || '')))
			if (!synthesized.length) return 0
			const chars = synthesized.reduce((sum, segment) => sum + textLength(segment?.text ?? segment?.script), 0)
			return applyMinimumCharge(h.narrationBase + (chars / 1000) * h.narrationPer1000Chars, rateCard)
		}
		// Attaching an existing clip is not a speech synthesis operation.
		if (tool === 'betterpptx.slide.add_narration') {
			const source = audio => typeof audio === 'string' ? Boolean(audio) : Boolean(audio && (audio.ref || audio.path || audio.handle || audio.data || audio.url))
			const segments = Array.isArray(args.segments) ? args.segments : []
			if (segments.length ? segments.every(segment => source(segment?.audio)) : source(args.audio)) return 0
		}
		// A final spec carrying a validated preparation manifest reuses the exact
		// measured audio. It must not be quoted or reserved as a second synthesis.
		if (tool === 'betterpptx.slide.add_narration' && args.preparedNarration) return 0
		if (tool === 'betterpptx.deck.add_narration' && Array.isArray(args.slides) && args.slides.length && args.slides.every(slide => slide?.preparedNarration)) return 0
		// Scripts without an owned audio source still consume speech compute.
		const chars = Math.max(textLength(args.text), textLength(args.script), textLength(args.slides), textLength(args.items), textLength(args.segments), textLength(args.narration))
		return applyMinimumCharge(h.narrationBase + (chars / 1000) * h.narrationPer1000Chars, rateCard)
	}
	if (tool === 'betterpptx.avatar.render_job' || tool === 'betterpptx.deck.add_avatar_narration' || tool === 'betterpptx.slide.add_avatar_narration') {
		const durationSeconds = Math.max(
			1,
			Number(result.durationSeconds || result.audioDurationSeconds || result.video?.durationSeconds || 0) ||
			(Number(result.durationMs || result.audio?.durationMs || result.video?.durationMs || 0) / 1000) ||
			Number(args.durationSeconds || args.audioDurationSeconds || 0) ||
			(Number(args.durationMs || args.audio?.durationMs || 0) / 1000) ||
			// Duration predicted from script length via the LEARNED per-voice speech rate
			// (evolving cost model; static 13 chars/second until observations exist).
			speechSecondsFromChars(Math.max(textLength(args.text), textLength(args.script), textLength(args.slides), textLength(args.items)), args.voice || args.ttsVoice || ''),
		)
		const quality = String(args.avatarQuality || args.quality || '').toLowerCase()
		const multiplier = quality === 'quality' || quality === 'high' ? Number(h.avatarQualityMultiplier || 1.5) : 1
		return applyMinimumCharge((h.avatarBase + durationSeconds * h.avatarPerSecond) * multiplier, rateCard)
	}
	if (tool === 'betterpptx.assets.generate_rigged3d') {
		if (result.cached === true) return 0
		// SERVER/SERVICE cost only (TRELLIS.2 + UniRig content is MIT = free): the real cost is GPU-seconds
		// on Modal L40S (generation + rigging + cold model-load), reported by the worker as result.gpuSeconds.
		// 'standard' quality raises the whole charge by the quality multiplier (mirrors the avatar pattern).
		const billing = result._billing && typeof result._billing === 'object' ? result._billing : {}
		const gpuSeconds = Math.max(0, Number(result.gpuSeconds || billing.gpuSeconds || args.gpuSeconds || 0))
		const providerCredits = Math.max(0, Number(result.providerCredits || billing.providerCredits || args.providerCredits || 0))
		const quality = String(args.quality || result.meshResolution || '').toLowerCase()
		const multiplier = quality === 'standard' ? Number(h.model3dGenQualityMultiplier || 1.2) : 1
		// Baker (presenter clip-baker) CPU-second term — added AFTER the mesh-quality multiplier (CPU bake time
		// is quality-independent) and priced at the CPU rate, NOT the GPU-fair one.
		const bakeCpuSeconds = Math.max(0, Number(result.bakeSeconds || billing.bakeSeconds || args.bakeSeconds || 0))
		const bakeCharge = bakeCpuSeconds * (h.model3dGenPerBakeCpuSecond ?? 0.02)
		const providerCharge = providerCredits * (h.model3dGenPerProviderCredit ?? 1)
		return applyMinimumCharge(((h.model3dGenBase ?? 5) + gpuSeconds * (h.model3dGenPerGpuSecond ?? 0.35)) * multiplier + bakeCharge + providerCharge, rateCard)
	}
	if (tool === 'betterpptx.assets.generate_image') {
		if (result.cached === true) return 0
		const imageCount = Math.max(1, Number(result.imageCount || result.images || args.imageCount || 1))
		const gpuSeconds = Math.max(0, Number(result.gpuSeconds || result._billing?.gpuSeconds || args.gpuSeconds || 0))
		return applyMinimumCharge(
			(h.imageGenBase ?? 3) + imageCount * (h.imageGenPerImage ?? 2) + gpuSeconds * (h.imageGenPerGpuSecond ?? 0.35),
			rateCard,
		)
	}
	if (tool === 'betterpptx.assets.generate_model3d' || tool === 'betterpptx.sketchfab.import') {
		// SERVER/SERVICE cost only: external model import (archive download + extract/convert).
		// The 3D content itself is free-licensed and contributes nothing here.
		const importMb = bytesToMb(Math.max(argByteEstimate(args, result), Number(result.sizeBytes || result.model3dImportBytes || result.asset?.sizeBytes || 0) || 0))
		return applyMinimumCharge((h.model3dImportBase ?? 1.5) + importMb * (h.model3dImportPerMb ?? 0.6), rateCard)
	}
	if (tool === 'betterpptx.slide.add_model3d') {
		return applyMinimumCharge(h.model3dBase + bytesToMb(argByteEstimate(args, result)) * h.model3dPerMb, rateCard)
	}
	if (tool === 'betterpptx.slide.add_media') {
		return applyMinimumCharge(h.mediaImportBase + bytesToMb(argByteEstimate(args, result)) * h.mediaImportPerMb, rateCard)
	}
	if (tool === 'betterpptx.deck.transform_shapes') {
		const objectCount = Number(args.objectCount || args.count || args.targets?.length || result.changed || result.updated || 0) || 0
		return applyMinimumCharge(h.batchTransformBase + Math.max(0, objectCount) * h.batchTransformPerObject, rateCard)
	}
	return applyMinimumCharge(h.mediaImportBase, rateCard)
}

function safeArgSummary(args = {}) {
	return {
		hasDeckId: Boolean(args.deckId),
		hasIdempotencyKey: Boolean(idempotencyKey(args)),
		slideIndex: Number.isFinite(Number(args.slideIndex)) ? Number(args.slideIndex) : null,
		targetCount: Array.isArray(args.targets) ? args.targets.length : args.target ? 1 : 0,
		textChars: Math.min(500000, textLength(args.text ?? args.runs ?? args.script ?? args.slides ?? args.items)),
		hasUrl: Boolean(args.url || args.imageUrl || args.mediaUrl || args.modelUrl),
		hasFilePath: Boolean(args.filePath || args.path || args.pptxPath || args.outputDir),
	}
}

function operationKey({ name, args = {}, context = {} }) {
	const idem = idempotencyKey(args)
	const sessionId = sessionIdFor(context)
	if (idem) return `${sessionId}\0${name}\0idem\0${idem}`
	return `${sessionId}\0${name}\0${Date.now()}\0${crypto.randomBytes(8).toString('hex')}`
}

export function estimateBillingForTool({ name, args = {}, result = {}, entry = null, rateCard = currentRateCard() } = {}) {
	const classification = classifyBillingTool(name, args)
	const metrics = classification.category === 'checkpoint'
		? collectDeckBillingMetrics(entry, result)
		: {}
	let estimatedCredits = 0
	if (classification.category === 'checkpoint') estimatedCredits = estimateCheckpointCost(metrics, rateCard)
	else if (classification.category === 'heavy') estimatedCredits = estimateHeavyCost(name, args, result, rateCard)
	return {
		classification,
		metrics,
		estimatedCredits: roundCredits(estimatedCredits),
		rateCardVersion: currentRateCardVersion(),
	}
}

export function buildBillingOperationFact({ name, args = {}, context = {}, result = {}, entry = null, billingEntitlement = null } = {}) {
	const estimate = estimateBillingForTool({ name, args, result, entry })
	const sessionHash = hashSessionId(sessionIdFor(context))
	const rawDeckId = args.deckId || result.deckId || result.data?.deckId || null
	const deckHash = rawDeckId ? hashDeckId(rawDeckId) : null
	const opId = hashOperationId(operationKey({ name, args, context }))
	return {
		operationId: opId,
		sessionHash,
		deckHash,
		customerHash: billingEntitlement?.billingCustomerHash || null,
		toolName: String(name || 'unknown'),
		state: 'dry_run',
		billingMode: estimate.classification.mode,
		billingCategory: estimate.classification.category,
		estimatedCredits: estimate.estimatedCredits,
		rateCardVersion: estimate.rateCardVersion,
		classifierReason: estimate.classification.reason,
		argSummary: safeArgSummary(args),
		metrics: estimate.metrics,
		createdAt: new Date().toISOString(),
	}
}

export async function recordBillingDryRunOperation({ name, args = {}, context = {}, result = {}, entry = null, billingEntitlement = null, store = null } = {}) {
	if (!isBillingDryRunEnabled()) return { recorded: false, reason: 'dry-run-disabled' }
	const fact = buildBillingOperationFact({ name, args, context, result, entry, billingEntitlement })
	if (fact.billingCategory === 'free') return { recorded: false, reason: 'free-tool', fact }
	const ledger = store || createBillingLedgerStore()
	await ledger.recordSession(fact.sessionHash, {
		source: 'billing-dry-run',
		billingDryRun: true,
		rateCardVersion: fact.rateCardVersion,
		customerHash: fact.customerHash,
	})
	if (fact.deckHash) {
		await ledger.recordDeck(fact.deckHash, {
			source: 'billing-dry-run',
			sessionHash: fact.sessionHash,
			customerHash: fact.customerHash,
			lastToolName: fact.toolName,
		})
	}
	await ledger.recordOperation(fact.operationId, fact)
	recordBillingDryRunTelemetry(fact)
	return { recorded: true, fact }
}

export async function recordBillingDryRunAggregate({
	name,
	args = {},
	context = {},
	entry = null,
	billingEntitlement = null,
	store = null,
	operationCount = 1,
	estimatedCredits = 0,
	rateCardVersion = currentRateCardVersion(),
	billingCategory = 'aggregate',
	billingMode = 'aggregate',
	classifierReason = 'aggregate-dry-run',
	byCategory = {},
	metrics = {},
} = {}) {
	if (!isBillingDryRunEnabled()) return { recorded: false, reason: 'dry-run-disabled' }
	const sessionHash = hashSessionId(sessionIdFor(context))
	const rawDeckId = args.deckId || null
	const deckHash = rawDeckId ? hashDeckId(rawDeckId) : null
	const fact = {
		operationId: hashOperationId(operationKey({ name, args, context })),
		sessionHash,
		deckHash,
		customerHash: billingEntitlement?.billingCustomerHash || null,
		toolName: String(name || 'unknown'),
		state: 'dry_run',
		billingMode,
		billingCategory,
		estimatedCredits: roundCredits(estimatedCredits),
		rateCardVersion,
		classifierReason,
		argSummary: safeArgSummary(args),
		operationCount: Math.max(1, Number(operationCount) || 1),
		byCategory,
		metrics,
		createdAt: new Date().toISOString(),
	}
	const ledger = store || createBillingLedgerStore()
	await ledger.recordSession(fact.sessionHash, {
		source: 'billing-dry-run',
		billingDryRun: true,
		rateCardVersion: fact.rateCardVersion,
		customerHash: fact.customerHash,
	})
	if (fact.deckHash) {
		await ledger.recordDeck(fact.deckHash, {
			source: 'billing-dry-run',
			sessionHash: fact.sessionHash,
			customerHash: fact.customerHash,
			lastToolName: fact.toolName,
		})
	}
	await ledger.recordOperation(fact.operationId, fact)
	recordBillingDryRunTelemetry(fact)
	return { recorded: true, fact }
}

export function publicBillingDryRunSummary(summary = {}) {
	return {
		mode: isBillingDryRunEnabled() ? 'dry_run' : 'disabled',
		rateCardVersion: currentRateCardVersion(),
		operations: Number(summary.operations || 0),
		estimatedCredits: roundCredits(summary.estimatedCredits || 0),
		byCategory: summary.byCategory || {},
		lastOperationAt: summary.lastOperationAt || null,
	}
}
