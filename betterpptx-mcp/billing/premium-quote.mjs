import * as crypto from 'node:crypto'

import { applyPowerpointNiceties, buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { rememberLockedCompilePlan } from '../ir/compile-plan-store.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'
import { classifyBillingTool } from './classifier.mjs'
import { collectDeckBillingMetrics, estimateBillingForTool } from './estimator.mjs'
import {
	currentRateCard,
	currentRateCardVersion,
	estimateCalibrationMultiplier,
	roundCredits,
} from './rate-card.mjs'
import { creditsPerUsdc } from './crypto-packs.mjs'
import {
	PREMIUM_QUOTE_BINDING_SCHEMA_VERSION,
	PREMIUM_QUOTE_SCHEMA_VERSION,
} from './premium-quote-contract.mjs'

export { PREMIUM_QUOTE_BINDING_SCHEMA_VERSION, PREMIUM_QUOTE_SCHEMA_VERSION } from './premium-quote-contract.mjs'
export const PREMIUM_PRESENTATION_PRICING_MODEL = 'deck_dynamic_quote'

// Execution-phase flags are deliberately excluded from the priced-input
// identity.  The quote is for the authored operation and its measured media,
// not for whether the caller asked for dryRun/commit or which retry key it
// used to deliver that operation.
const QUOTE_EXECUTION_ONLY_FIELDS = new Set([
	'phase', 'dryRun', 'commitMode', 'billingConfirmed', 'billingOverride',
	'idempotencyKey', 'idempotency_key', 'planId', 'lockedPlanId', 'planDigest',
	'quoteBinding', 'premiumQuoteBinding', 'detail', 'includeCallPlan',
	'validateAfterCompile', 'saveAfterCommit',
	'alternativeAuthorization',
	// Opaque uploaded-source handles and connector envelopes are transport
	// identities. The canonical spec/plan digests below bind their semantic
	// content, so equivalent inline and uploaded forms must price identically.
	'specHandle', 'specArtifact',
	// Spec quotes are already bound to the canonical compiled spec and plan
	// digests below. Hashing the raw authored object a second time makes a
	// legitimate replay fail whenever deterministic precompile normalization
	// (for example visual-reference coordinate lowering or nicety expansion)
	// has occurred between estimate and commit.
	'spec',
])

function stableForHash(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stableForHash)
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableForHash(value[key])]))
}

function sha256Hex(value) {
	return crypto.createHash('sha256').update(JSON.stringify(stableForHash(value))).digest('hex')
}

function quoteInputForPricing(args = {}) {
	if (!args || typeof args !== 'object' || Array.isArray(args)) return {}
	return Object.fromEntries(Object.entries(args).filter(([key]) => !QUOTE_EXECUTION_ONLY_FIELDS.has(key)))
}

export function projectedCheckpointResult(entry = {}) {
	const metrics = collectDeckBillingMetrics(entry, {})
	const estimatedMb = Math.max(
		0.25,
		0.15 + metrics.slideCount * 0.08 + metrics.finalObjectCount * 0.015 + metrics.richObjectCount * 0.30,
	)
	return {
		slideCount: metrics.slideCount,
		bytes: Math.round(estimatedMb * 1048576),
		projectionModel: 'betterpptx.checkpoint-output-size.v1',
	}
}

function amountAtomicForCredits(credits, ratio = creditsPerUsdc()) {
	const raw = Number(credits || 0) / Number(ratio || 1)
	if (!Number.isFinite(raw) || raw <= 0) return 0
	return Math.ceil(raw * 1e6)
}

function buildPremiumQuoteFromEstimate({
	name = 'betterpptx.deck.save',
	args = {},
	source = 'deck',
	deckId = '',
	deckVersion = null,
	specDigest = '',
	estimate,
	projectedResult = {},
	rateCard = currentRateCard(),
	nowMs = Date.now(),
	quoteBindingSeed = null,
} = {}) {
	const resolvedDeckVersion = deckVersion !== null && deckVersion !== undefined ? Number(deckVersion) : null
	const calibrationMultiplier = estimateCalibrationMultiplier()
	const estimatedCredits = Number(estimate.estimatedCredits || 0)
	const quoteCapCredits = roundCredits(estimatedCredits * calibrationMultiplier)
	const ratio = creditsPerUsdc()
	const amountAtomic = amountAtomicForCredits(quoteCapCredits, ratio)
	// priceUsdc = customer PRICE in USDC derived from the credit quote (credits / creditsPerUsdc);
	// distinct from costUsd metrology — this is a price, never a cost, and never feeds costing.
	const priceUsdc = Number((amountAtomic / 1e6).toFixed(6))
	const rateCardVersion = estimate.rateCardVersion || currentRateCardVersion()
	const metrics = estimate.metrics || {}
	const pricingInput = {
		schemaVersion: PREMIUM_QUOTE_SCHEMA_VERSION,
		pricingModel: PREMIUM_PRESENTATION_PRICING_MODEL,
		source,
		toolName: name,
		deckId: deckId ? String(deckId) : null,
		deckVersion: resolvedDeckVersion,
		specDigest: specDigest || null,
		args: stableForHash(quoteInputForPricing(args)),
		result: stableForHash(projectedResult || {}),
		metrics,
		rateCardVersion,
		calibrationMultiplier,
		quoteCapCredits,
		creditsPerUsdc: ratio,
		amountAtomic,
		...(quoteBindingSeed && typeof quoteBindingSeed === 'object' ? { quoteBindingSeed: stableForHash(quoteBindingSeed) } : {}),
	}
	const pricingInputDigest = sha256Hex(pricingInput)
	return {
		quoteSchemaVersion: PREMIUM_QUOTE_SCHEMA_VERSION,
		pricingModel: PREMIUM_PRESENTATION_PRICING_MODEL,
		toolName: name,
		source,
		...(deckId ? { deckId: String(deckId) } : {}),
		...(resolvedDeckVersion !== null && resolvedDeckVersion !== undefined && Number.isFinite(resolvedDeckVersion) ? { deckVersion: resolvedDeckVersion } : {}),
		...(specDigest ? { specDigest: String(specDigest) } : {}),
		billingCategory: estimate.classification?.category || 'free',
		billingMode: estimate.classification?.mode || 'free',
		estimatedCredits,
		quoteCapCredits,
		calibrationMultiplier,
		calibrated: calibrationMultiplier !== 1,
		rateCardVersion,
		confirmationRequired: quoteCapCredits > Number(rateCard.thresholds?.confirmationRequiredAbove || Infinity),
		confirmationThresholdCredits: Number(rateCard.thresholds?.confirmationRequiredAbove || Infinity),
		hardBlockThresholdCredits: Number(rateCard.thresholds?.hardBlockAboveWithoutExplicitOverride || Infinity),
		metrics,
		projectedResult,
		projectedOutputBytes: Number(projectedResult?.bytes || metrics.outputBytes || 0) || 0,
		creditsPerUsdc: ratio,
		priceUsdc,
		amountAtomic: String(amountAtomic),
		pricingInputDigest,
		issuedAt: new Date(nowMs).toISOString(),
		estimate: {
			...estimate,
			quoteCapCredits,
			calibrationMultiplier,
			calibrated: calibrationMultiplier !== 1,
			pricingInputDigest,
			projectedOutputBytes: Number(projectedResult?.bytes || metrics.outputBytes || 0) || 0,
			priceUsdc,
			amountAtomic: String(amountAtomic),
		},
	}
}

function specQuoteBinding({ quote, specDigest, estimatedPlanDigest, planDigest, preparedTimelineDigest, manifestDigests = [], quoteReadiness = 'ready-for-authorization' } = {}) {
	const binding = {
		schemaVersion: PREMIUM_QUOTE_BINDING_SCHEMA_VERSION,
		quoteSchemaVersion: PREMIUM_QUOTE_SCHEMA_VERSION,
		quoteId: null,
		pricingInputDigest: String(quote?.pricingInputDigest || ''),
		specDigest: String(specDigest || ''),
		estimatedPlanDigest: String(estimatedPlanDigest || ''),
		planDigest: String(planDigest || ''),
		preparedTimelineDigest: String(preparedTimelineDigest || ''),
		manifestDigests: [...new Set((Array.isArray(manifestDigests) ? manifestDigests : []).map(value => String(value)).filter(Boolean))],
		quoteCapCredits: Number(quote?.quoteCapCredits || 0),
		estimatedCredits: Number(quote?.estimatedCredits || 0),
		rateCardVersion: String(quote?.rateCardVersion || ''),
		quoteReadiness: String(quoteReadiness || 'ready-for-authorization'),
	}
	// quoteId is deterministic for this exact priced input and measured timing
	// spine. It is an opaque identity, not a payment receipt.
	const quoteBindingDigest = sha256Hex({ ...binding, quoteId: undefined })
	const quoteId = `bpptx_quote_${quoteBindingDigest.slice(0, 32)}`
	return {
		...binding,
		quoteId,
		quoteBindingDigest,
	}
}

function quoteBindingMismatch(expected, supplied) {
	const fields = ['schemaVersion', 'quoteSchemaVersion', 'quoteId', 'quoteBindingDigest', 'pricingInputDigest', 'specDigest', 'estimatedPlanDigest', 'planDigest', 'preparedTimelineDigest', 'quoteCapCredits', 'rateCardVersion']
	return fields.filter(field => {
		const expectedValue = expected?.[field]
		const suppliedValue = supplied?.[field]
		if (typeof expectedValue === 'number') return Number(suppliedValue) !== expectedValue
		return String(suppliedValue ?? '') !== String(expectedValue ?? '')
	})
}

export function buildPremiumPresentationQuote({
	toolName = 'betterpptx.deck.save',
	args = {},
	entry = null,
	result = null,
	source = 'deck',
	deckId = args?.deckId || '',
	deckVersion = null,
	specDigest = '',
	rateCard = currentRateCard(),
	nowMs = Date.now(),
} = {}) {
	const name = String(toolName || 'betterpptx.deck.save')
	const classification = classifyBillingTool(name)
	const resolvedDeckVersion = deckVersion !== null && deckVersion !== undefined
		? Number(deckVersion)
		: entry && entry.deckVersion !== null && entry.deckVersion !== undefined
			? Number(entry.deckVersion)
			: null
	const projectedResult = result != null
		? result
		: classification.category === 'checkpoint'
			? projectedCheckpointResult(entry)
			: {}
	const estimate = estimateBillingForTool({ name, args, result: projectedResult, entry, rateCard })
	return buildPremiumQuoteFromEstimate({
		name,
		args,
		source,
		deckId,
		deckVersion: resolvedDeckVersion,
		specDigest,
		estimate,
		projectedResult,
		rateCard,
		nowMs,
	})
}

function normalizeSpecCommitMode(args = {}) {
	const raw = args.commitMode === undefined || args.commitMode === null || String(args.commitMode).trim() === ''
		? (args.deckId ? null : 'createNew')
		: String(args.commitMode).trim()
	const normalized = raw ? raw.toLowerCase().replace(/[-_\s]/g, '') : null
	if (normalized === 'createnew' || normalized === 'new') return 'createNew'
	if (normalized === 'append') return 'append'
	if (normalized === 'replacedeck' || normalized === 'replace') return 'replaceDeck'
	if (normalized === 'patch') return 'patch'
	return null
}

function specCompileOptions(args = {}, preparedNarrationTimingBySlide = null) {
	const specTemplate = args.spec?.template && typeof args.spec.template === 'object' ? args.spec.template : null
	const templateContract = args.templateContract
		|| args.spec?.layoutContract
		|| specTemplate?.layoutContract
		|| specTemplate?.contract
	return {
		plan: args.plan || args.accountPlan || 'free',
		accountPlan: args.accountPlan || args.plan || 'free',
		patchMode: normalizeSpecCommitMode(args) === 'patch',
		...(args.slideSize && typeof args.slideSize === 'object' ? { slideSize: args.slideSize } : {}),
		...(templateContract && typeof templateContract === 'object' ? { templateContract } : {}),
		...(preparedNarrationTimingBySlide && typeof preparedNarrationTimingBySlide === 'object'
			? { preparedNarrationTimingBySlide }
			: {}),
	}
}

function specOperationArgs(deckId, op = {}, extra = {}) {
	const args = op.tool === 'betterpptx.slide.add'
		? { deckId, ...(op.args || {}) }
		: {
			deckId,
			...(Number.isInteger(Number(op.slideIndex)) ? { slideIndex: Number(op.slideIndex) } : {}),
			...(op.args || {}),
		}
	return { ...args, ...extra }
}

function specOperationBillingArgs(deckId, op = {}, rootArgs = {}, operationIndex = 0) {
	const extra = {}
	if (rootArgs.billingConfirmed === true) extra.billingConfirmed = true
	if (rootArgs.billingOverride === true) extra.billingOverride = true
	if (rootArgs.idempotencyKey || rootArgs.idempotency_key) {
		const key = String(rootArgs.idempotencyKey || rootArgs.idempotency_key)
		extra.idempotencyKey = `${key}:spec:${operationIndex}:${op.tool}`
	}
	return specOperationArgs(deckId, op, extra)
}

function specObjectType(block = {}) {
	const kind = String(block.kind || block.type || '').toLowerCase()
	if (kind === 'chart-panel') return 'chart'
	if (kind === 'table-panel') return 'table'
	if (kind === 'image-feature') return 'image'
	if (kind === 'diagram') return 'smartart'
	if (kind === 'customgeometry' || kind === 'custom-geometry') return 'freeform'
	if (kind === 'avatarnarration') return 'media'
	return kind || 'shape'
}

function entryFromSpec(spec = {}) {
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	return {
		pptx: {
			slides: slides.map(slide => ({
				_slideObjects: (Array.isArray(slide?.content) ? slide.content : []).map(block => ({
					type: specObjectType(block),
					kind: block?.kind,
					text: block?.text || block?.title || block?.altText || '',
					...(block?.image || block?.imageUrl || block?.url ? { imageSizingCrop: true } : {}),
					...(block?.chartType || block?.series ? { chart: { type: block.chartType || 'chart' } } : {}),
					...(block?.rows ? { data: block.rows } : {}),
					...(block?.media || block?.mediaUrl ? { media: true } : {}),
				})),
				_animations: [
					...(Array.isArray(slide?.motion?.sequences) ? slide.motion.sequences : []),
					...(Array.isArray(slide?.timeline) ? slide.timeline : []),
					...(Array.isArray(slide?.content) ? slide.content.filter(block => block?.animation || block?.timing) : []),
				],
				transition: slide?.transition || spec.transitionPolicy || spec.transitionsAll || null,
			})),
		},
	}
}

export function estimateCompiledSpecBilling({ compiled = {}, args = {}, deckId, rateCard = currentRateCard() } = {}) {
	const byCategory = {}
	const operations = []
	let estimatedCredits = 0
	let rateCardVersion = currentRateCardVersion()
	for (let operationIndex = 0; operationIndex < (compiled.operations || []).length; operationIndex += 1) {
		const op = compiled.operations[operationIndex]
		const estimate = estimateBillingForTool({
			name: op.tool,
			args: specOperationBillingArgs(deckId, op, args, operationIndex),
			rateCard,
		})
		rateCardVersion = estimate.rateCardVersion || rateCardVersion
		const category = estimate.classification?.category || 'free'
		byCategory[category] = (byCategory[category] || 0) + 1
		if (category !== 'free') {
			estimatedCredits += Number(estimate.estimatedCredits || 0)
			operations.push({
				operationIndex,
				tool: op.tool,
				slideIndex: op.slideIndex,
				objectName: op.objectName,
				category,
				mode: estimate.classification?.mode,
				estimatedCredits: estimate.estimatedCredits,
			})
		}
	}
	return {
		mode: 'compiled_spec_operations',
		rateCardVersion,
		operationCount: (compiled.operations || []).length,
		billableOperationCount: operations.filter(item => Number(item.estimatedCredits || 0) > 0).length,
		estimatedCredits: roundCredits(estimatedCredits),
		byCategory,
		operations,
	}
}

export function buildSpecPremiumPresentationQuote({
	spec = null,
	args = {},
	source = 'spec',
	deckId = args?.deckId || '',
	rateCard = currentRateCard(),
	nowMs = Date.now(),
	preparedNarrationTimingBySlide = null,
} = {}) {
	if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
		const err = new Error('A BetterPPTX spec object is required for spec premium pricing.')
		err.code = 'SPEC_REQUIRED'
		throw err
	}
	// Quote the same deterministic precompile form used by generation. Without
	// this, raw visual-reference pixels or unexpanded niceties produce a quote
	// whose spec/plan identity cannot be replayed by the normalized commit.
	// HTML package materialization is asynchronous and remains owned by the
	// generation route; ordinary, exact, and visual-reference specs are fully
	// canonicalized here.
	const expandedSpec = applyPowerpointNiceties(spec)
	const pricedSpec = spec.htmlConversion || expandedSpec.authoringContract?.placementPolicy === 'visual-reference-pixels-v1'
		? expandedSpec
		: normalizeVisualReferenceReconstruction(expandedSpec)
	const rootArgs = { ...args, spec: pricedSpec }
	const compiled = buildSpecOperationPlan(pricedSpec, specCompileOptions(rootArgs, preparedNarrationTimingBySlide))
	// Keep the exact read-only quote plan available for a same-process commit
	// using quoteBinding.planDigest/planId. This is an in-memory compilation lock,
	// not a deck mutation; a restart makes the quote stale and requires re-quote.
	rememberLockedCompilePlan(compiled)
	const resolvedDeckId = deckId || `__spec_pending_${String(compiled.estimatedPlanDigest || compiled.planDigest || 'plan').slice(0, 16)}`
	const specEstimate = estimateCompiledSpecBilling({ compiled, args: rootArgs, deckId: resolvedDeckId, rateCard })
	const narrationOperations = (compiled.operations || []).filter(operation => operation.tool === 'betterpptx.slide.add_narration' || operation.tool === 'betterpptx.deck.add_narration')
	const preparedNarrationRefs = narrationOperations.map(operation => operation.args?.preparedNarration || operation.args?.narrationPreparation || operation.args?.preparedAudio).filter(Boolean)
	const narrationPreparation = {
		narrationOperationCount: narrationOperations.length,
		preparedOperationCount: preparedNarrationRefs.length,
		missingPreparationCount: Math.max(0, narrationOperations.length - preparedNarrationRefs.length),
		manifestDigests: preparedNarrationRefs.map(value => value?.manifestDigest).filter(Boolean),
		validatedPreparationCount: preparedNarrationTimingBySlide ? Object.keys(preparedNarrationTimingBySlide).length : 0,
		measuredSegmentCount: preparedNarrationTimingBySlide
			? Object.values(preparedNarrationTimingBySlide).reduce((sum, value) => sum + (Array.isArray(value?.segments) ? value.segments.length : 0), 0)
			: 0,
		measuredDurationMs: preparedNarrationTimingBySlide
			? Object.values(preparedNarrationTimingBySlide).reduce((sum, value) => sum + Number(value?.audio?.durationMs || value?.durationMs || 0), 0)
			: 0,
		timingEvidence: preparedNarrationTimingBySlide
			? [...new Set(Object.values(preparedNarrationTimingBySlide).map(value => value?.timingEvidence?.kind || value?.timingEvidence || '').filter(Boolean))]
			: [],
		timelineBoundToMeasuredAudio: Boolean(preparedNarrationTimingBySlide && Object.keys(preparedNarrationTimingBySlide).length),
		finalGenerationReusesPreparedAudio: narrationOperations.length === 0 || preparedNarrationRefs.length === narrationOperations.length,
		note: 'Preparation is measured before quotation. Reusing a validated preparation manifest carries zero duplicate synthesis cost; a missing manifest must be prepared before a public narrated commit.',
	}
	const preparedTimelineDigest = sha256Hex({
		schemaVersion: 'betterpptx.prepared-narration-timeline.v1',
		planDigest: compiled.planDigest,
		timingSpine: (compiled.timingSpine?.slides || []).map(slide => ({
			slideId: slide.slideId,
			dwellMs: slide.dwellMs,
			timingSource: slide.timingSource,
			effectiveClock: slide.effectiveClock,
			timingEvidence: slide.timingEvidence,
		})),
	})
	const finalEntry = entryFromSpec(pricedSpec)
	const projectedResult = projectedCheckpointResult(finalEntry)
	const plannedObjects = (compiled.plan?.slides || []).flatMap(slide => slide.objects || [])
	const authoredTitles = (pricedSpec.slides || []).filter(slide => String(slide?.title || '').trim()).length
	const transitionCount = (pricedSpec.slides || []).filter(slide => Boolean(slide?.transition || pricedSpec.transitionPolicy || pricedSpec.transitionsAll)).length
	const costInputLedger = {
		schemaVersion: 'betterpptx.cost-input-ledger.v1',
		compiledPlan: {
			slideCount: (compiled.plan?.slides || []).length,
			authoredObjectCount: plannedObjects.length,
			operationCount: (compiled.operations || []).length,
			transitionCount,
		},
		materializedSupport: {
			accessibilityTitleCarrierCount: authoredTitles,
			pricingRole: 'excluded-support-object',
			note: 'One transparent native title placeholder is regenerated from each declared slide.title. It is not visible authored content and is excluded from object pricing.',
		},
		projectedSave: {
			contentObjectCount: collectDeckBillingMetrics(finalEntry, {}).finalObjectCount,
			projectedOutputBytes: projectedResult.bytes,
			projectionModel: projectedResult.projectionModel,
		},
		priceChangePolicy: 'A higher materialized price requires a fresh quote or an existing exact-input quote cap that covers it; an older quote is never a blank cheque.',
	}
	const saveEstimate = estimateBillingForTool({
		name: 'betterpptx.deck.save',
		args: { deckId: resolvedDeckId, idempotencyKey: args.idempotencyKey || args.idempotency_key },
		result: projectedResult,
		entry: finalEntry,
		rateCard,
	})
	const estimatedCredits = roundCredits(Number(specEstimate.estimatedCredits || 0) + Number(saveEstimate.estimatedCredits || 0))
	const estimate = {
		classification: {
			category: 'premium-presentation',
			billable: true,
			mode: 'spec_dynamic_quote',
			reason: 'compiled-spec-plus-final-save',
		},
		metrics: {
			...saveEstimate.metrics,
			costInputLedger,
			specOperationCount: specEstimate.operationCount,
			billableSpecOperationCount: specEstimate.billableOperationCount,
			specEstimatedCredits: specEstimate.estimatedCredits,
			finalSaveEstimatedCredits: saveEstimate.estimatedCredits,
			narrationPreparation,
		},
		estimatedCredits,
		rateCardVersion: specEstimate.rateCardVersion || saveEstimate.rateCardVersion || currentRateCardVersion(),
			spec: {
			specDigest: compiled.specDigest,
			estimatedPlanDigest: compiled.estimatedPlanDigest,
			planDigest: compiled.planDigest,
			operationCount: specEstimate.operationCount,
			billableOperationCount: specEstimate.billableOperationCount,
			byCategory: specEstimate.byCategory,
			operations: specEstimate.operations,
			narrationPreparation,
		},
	}
	const quote = buildPremiumQuoteFromEstimate({
		name: 'betterpptx.deck.generate_from_spec',
		args: {
			...args,
			specDigest: compiled.specDigest,
			estimatedPlanDigest: compiled.estimatedPlanDigest,
			slideCount: Array.isArray(pricedSpec.slides) ? pricedSpec.slides.length : 0,
		},
		source,
		deckId: resolvedDeckId,
		specDigest: compiled.specDigest,
		estimate,
		projectedResult,
		rateCard,
		nowMs,
		quoteBindingSeed: {
			schemaVersion: PREMIUM_QUOTE_BINDING_SCHEMA_VERSION,
			specDigest: compiled.specDigest,
			estimatedPlanDigest: compiled.estimatedPlanDigest,
			planDigest: compiled.planDigest,
			preparedTimelineDigest,
			manifestDigests: narrationPreparation.manifestDigests,
		},
	})
	const preparationReady = narrationPreparation.missingPreparationCount === 0
	const quoteBinding = specQuoteBinding({
		quote,
		specDigest: compiled.specDigest,
		estimatedPlanDigest: compiled.estimatedPlanDigest,
		planDigest: compiled.planDigest,
		preparedTimelineDigest,
		manifestDigests: narrationPreparation.manifestDigests,
		quoteReadiness: preparationReady ? 'ready-for-authorization' : 'preparation-required',
	})
	return {
		...quote,
		quoteId: quoteBinding.quoteId,
		quoteBindingDigest: quoteBinding.quoteBindingDigest,
		quoteBinding,
		specDigest: compiled.specDigest,
		estimatedPlanDigest: compiled.estimatedPlanDigest,
		planDigest: compiled.planDigest,
		preparedTimelineDigest,
		specOperationCount: specEstimate.operationCount,
		billableSpecOperationCount: specEstimate.billableOperationCount,
		specEstimatedCredits: specEstimate.estimatedCredits,
		finalSaveEstimatedCredits: saveEstimate.estimatedCredits,
		costInputLedger,
		specEstimate,
		narrationPreparation,
		quoteReadiness: preparationReady ? 'ready-for-authorization' : 'preparation-required',
		readyForExecution: preparationReady,
		remainingBlockers: preparationReady
			? []
			: [{
				code: 'NARRATION_PREPARATION_REQUIRED',
				message: 'Prepare and measure every narrated segment before treating this as the final executable quote.',
				nextAction: { tool: 'betterpptx.narration.synthesize', reason: 'Create the reusable measured narration manifest, then request this quote again.' },
			}],
		next: preparationReady
			? { tool: 'betterpptx.deck.generate_from_spec', reason: 'Authorize the quoted operation, then generate using the exact preparedNarration manifest.' }
			: { tool: 'betterpptx.narration.synthesize', reason: 'Prepare measured narration before requesting the final quote.' },
	}
}

/**
 * Verify the caller is committing the same public quote that was produced for
 * the same spec and server-validated measured narration. This is deterministic
 * and read-only: it performs no synthesis, reservation, payment, or mutation.
 */
export function verifySpecPremiumQuoteBinding({ spec = null, args = {}, quoteBinding = null, preparedNarrationTimingBySlide = null } = {}) {
	if (!quoteBinding || typeof quoteBinding !== 'object' || Array.isArray(quoteBinding)) {
		const error = new Error('A final premium presentation commit requires the quoteBinding returned by betterpptx.billing.estimate.')
		error.code = 'QUOTE_BINDING_REQUIRED'
		error.details = {
			status: 'quote_binding_required',
			nextAction: { tool: 'betterpptx.billing.estimate', reason: 'Request the final quote with the exact prepared narration manifest, then pass its quoteBinding unchanged to generate_from_spec.' },
		}
		throw error
	}
	const expected = buildSpecPremiumPresentationQuote({
		spec,
		args,
		preparedNarrationTimingBySlide,
	})
	if (expected.quoteReadiness !== 'ready-for-authorization') {
		const error = new Error('The final quote is not executable because measured narration preparation is missing or stale.')
		error.code = 'NARRATION_PREPARATION_REQUIRED'
		error.details = {
			status: 'preparation_required_before_final_generation',
			quoteReadiness: expected.quoteReadiness,
			narrationPreparation: expected.narrationPreparation,
			nextAction: expected.next,
		}
		throw error
	}
	const mismatches = quoteBindingMismatch(expected.quoteBinding, quoteBinding)
	if (mismatches.length) {
		const error = new Error('The supplied quoteBinding is stale or belongs to different authored inputs or measured narration.')
		error.code = 'QUOTE_BINDING_MISMATCH'
		error.details = {
			status: 'quote_binding_mismatch',
			mismatchedFields: mismatches,
			expected: {
				quoteId: expected.quoteId,
				quoteBindingDigest: expected.quoteBindingDigest,
				pricingInputDigest: expected.pricingInputDigest,
				specDigest: expected.specDigest,
				estimatedPlanDigest: expected.estimatedPlanDigest,
				planDigest: expected.planDigest,
				preparedTimelineDigest: expected.preparedTimelineDigest,
				quoteCapCredits: expected.quoteCapCredits,
				rateCardVersion: expected.rateCardVersion,
			},
			nextAction: { tool: 'betterpptx.billing.estimate', reason: 'Request a new quote after preserving the exact authored spec and prepared narration manifest.' },
		}
		throw error
	}
	return expected
}
