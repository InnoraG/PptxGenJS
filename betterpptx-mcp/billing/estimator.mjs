import * as crypto from 'node:crypto'

import { recordBillingDryRunTelemetry } from '../telemetry.mjs'
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
	if (tool === 'betterpptx.narration.synthesize' || tool === 'betterpptx.deck.add_narration' || tool === 'betterpptx.slide.add_narration') {
		const chars = Math.max(textLength(args.text), textLength(args.script), textLength(args.slides), textLength(args.items))
		return applyMinimumCharge(h.narrationBase + (chars / 1000) * h.narrationPer1000Chars, rateCard)
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
	const classification = classifyBillingTool(name)
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

