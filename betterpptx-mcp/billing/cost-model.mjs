import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

const GIB = 1024 ** 3
const MILLION = 1_000_000
const HUNDRED_THOUSAND = 100_000

export class CostModelError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'CostModelError'
		this.code = code
		this.details = details
	}
}

function finiteNonNegative(value, field) {
	const number = Number(value)
	if (!Number.isFinite(number) || number < 0) {
		throw new CostModelError('COST_CATALOG_FIELD_INVALID', `Cost catalog field ${field} must be a non-negative number.`, { field })
	}
	return number
}

function requiredText(value, field) {
	const text = String(value || '').trim()
	if (!text) throw new CostModelError('COST_CATALOG_FIELD_MISSING', `Cost catalog field ${field} is required.`, { field })
	return text
}

export const CLOUD_RUN_BILLING_MODES = Object.freeze(['request_based', 'instance_based'])

function billingMode(value, { require = false } = {}) {
	const raw = value === undefined || value === null ? '' : String(value).trim()
	if (!raw) {
		if (require) {
			throw new CostModelError('COST_CATALOG_BILLING_MODE_MISSING', 'Cost catalog field cloudRunBillingMode is required for matrix-grade runs.', { field: 'cloudRunBillingMode' })
		}
		return 'request_based'
	}
	if (!CLOUD_RUN_BILLING_MODES.includes(raw)) {
		throw new CostModelError('COST_CATALOG_BILLING_MODE_INVALID', `Cost catalog field cloudRunBillingMode must be one of ${CLOUD_RUN_BILLING_MODES.join(', ')}.`, { field: 'cloudRunBillingMode', value: raw })
	}
	return raw
}

function stableJson(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

export function catalogDigest(catalog) {
	return crypto.createHash('sha256').update(stableJson(catalog)).digest('hex')
}

export function validateCloudBillingCatalogSnapshot(input = {}, { requireBillingMode = false } = {}) {
	const mode = billingMode(input.cloudRunBillingMode, { require: requireBillingMode })
	const catalog = {
		schemaVersion: requiredText(input.schemaVersion, 'schemaVersion'),
		currency: requiredText(input.currency, 'currency'),
		region: requiredText(input.region, 'region'),
		effectiveAt: requiredText(input.effectiveAt, 'effectiveAt'),
		retrievedAt: requiredText(input.retrievedAt, 'retrievedAt'),
		cloudRunBillingMode: mode,
		cpuAlwaysAllocated: input.cpuAlwaysAllocated === undefined ? (mode === 'instance_based') : Boolean(input.cpuAlwaysAllocated),
		source: {
			type: requiredText(input.source?.type, 'source.type'),
			reference: requiredText(input.source?.reference, 'source.reference'),
		},
		cloudRun: {
			vcpuUsdPerSecond: finiteNonNegative(input.cloudRun?.vcpuUsdPerSecond, 'cloudRun.vcpuUsdPerSecond'),
			gibUsdPerSecond: finiteNonNegative(input.cloudRun?.gibUsdPerSecond, 'cloudRun.gibUsdPerSecond'),
			requestUsdPerMillion: finiteNonNegative(input.cloudRun?.requestUsdPerMillion, 'cloudRun.requestUsdPerMillion'),
		},
		gcs: {
			classAUsdPer1000: finiteNonNegative(input.gcs?.classAUsdPer1000, 'gcs.classAUsdPer1000'),
			classBUsdPer1000: finiteNonNegative(input.gcs?.classBUsdPer1000, 'gcs.classBUsdPer1000'),
			storageUsdPerGibMonth: finiteNonNegative(input.gcs?.storageUsdPerGibMonth, 'gcs.storageUsdPerGibMonth'),
			egressUsdPerGib: finiteNonNegative(input.gcs?.egressUsdPerGib, 'gcs.egressUsdPerGib'),
		},
		firestore: {
			readUsdPer100k: finiteNonNegative(input.firestore?.readUsdPer100k, 'firestore.readUsdPer100k'),
			writeUsdPer100k: finiteNonNegative(input.firestore?.writeUsdPer100k, 'firestore.writeUsdPer100k'),
			deleteUsdPer100k: finiteNonNegative(input.firestore?.deleteUsdPer100k, 'firestore.deleteUsdPer100k'),
		},
		external: {
			ttsUsdPerMillionCharacters: finiteNonNegative(input.external?.ttsUsdPerMillionCharacters, 'external.ttsUsdPerMillionCharacters'),
			avatarUsdPerGpuSecond: finiteNonNegative(input.external?.avatarUsdPerGpuSecond, 'external.avatarUsdPerGpuSecond'),
			// Measured Modal L40S basis for generated rigged-3D (TRELLIS.2 + UniRig). Owner sets this
			// post-measurement; `?? 0` keeps every pre-existing catalog snapshot valid (attributes $0 to
			// model3dGen until a real L40S $/GPU-second is measured) instead of failing validation.
			model3dGenUsdPerGpuSecond: finiteNonNegative(input.external?.model3dGenUsdPerGpuSecond ?? 0, 'external.model3dGenUsdPerGpuSecond'),
			model3dGenProviderUsdPerCredit: finiteNonNegative(input.external?.model3dGenProviderUsdPerCredit ?? 0, 'external.model3dGenProviderUsdPerCredit'),
			// Measured Modal CPU-container basis for the presenter clip-baker (Baker). CPU seconds, NOT GPU — a
			// separate USD lever the CEO sets post-measurement; `?? 0` keeps every pre-existing catalog valid.
			model3dGenBakeUsdPerCpuSecond: finiteNonNegative(input.external?.model3dGenBakeUsdPerCpuSecond ?? 0, 'external.model3dGenBakeUsdPerCpuSecond'),
			// Measured Modal L40S basis for Flux image generation (0 for the Cloudflare edge host). Owner sets
			// post-measurement; `?? 0` back-compat like the model3dGen basis above.
			imageGenUsdPerGpuSecond: finiteNonNegative(input.external?.imageGenUsdPerGpuSecond ?? 0, 'external.imageGenUsdPerGpuSecond'),
			// Private Qwen semantic review runs on the same Modal L40S family. Older
			// catalogs inherit the measured image-generation basis until a dedicated
			// owner-reviewed rate is supplied; the field remains separate for ledger
			// attribution and future rate-card changes.
			semanticJudgeUsdPerGpuSecond: finiteNonNegative(
				input.external?.semanticJudgeUsdPerGpuSecond ?? input.external?.imageGenUsdPerGpuSecond ?? 0,
				'external.semanticJudgeUsdPerGpuSecond',
			),
			otherUsdPerCall: finiteNonNegative(input.external?.otherUsdPerCall, 'external.otherUsdPerCall'),
		},
	}
	if (catalog.currency !== 'USD') {
		throw new CostModelError('COST_CATALOG_CURRENCY_UNSUPPORTED', 'Cost metrology currently requires a USD catalog snapshot.', { currency: catalog.currency })
	}
	return { ...catalog, digest: catalogDigest(catalog) }
}

export function loadCloudBillingCatalogSnapshot(file) {
	const resolved = path.resolve(String(file || ''))
	if (!resolved || !fs.existsSync(resolved)) {
		throw new CostModelError('COST_CATALOG_FILE_MISSING', 'Cloud Billing Catalog snapshot file is missing.', { file: resolved })
	}
	let parsed
	try {
		parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'))
	} catch {
		throw new CostModelError('COST_CATALOG_FILE_INVALID', 'Cloud Billing Catalog snapshot is not valid JSON.', { file: resolved })
	}
	return validateCloudBillingCatalogSnapshot(parsed)
}

function roundUsd(value) {
	return Number(Math.max(0, Number(value) || 0).toFixed(12))
}

function positive(value, fallback = 0) {
	const number = Number(value)
	return Number.isFinite(number) && number >= 0 ? number : fallback
}

export function estimateResourceRowCost(row = {}, {
	catalog,
	serviceShape = {},
	artifactRetentionDays = 1,
	fixedOverheadUsdPerOperation = 0,
} = {}) {
	const prices = validateCloudBillingCatalogSnapshot(catalog)
	const vcpu = Math.max(0.001, positive(serviceShape.vcpu, 1))
	const memoryGiB = Math.max(0.001, positive(serviceShape.memoryGiB, 1))
	const wallSeconds = positive(row.wallMs) / 1000
	const storageGibMonths = (positive(row.storageWriteBytes) / GIB) * (positive(artifactRetentionDays, 1) / 30)
	// Instance-based billing has no Cloud Run per-request fee; the instance lifetime / idle
	// cost is not modeled here per-operation. It is allocated as overhead during reconciliation
	// (B3/B4). Request-based billing charges per request as before.
	const requestUsd = prices.cloudRunBillingMode === 'instance_based'
		? 0
		: prices.cloudRun.requestUsdPerMillion / MILLION
	const breakdown = {
		cloudRunCpuUsd: wallSeconds * vcpu * prices.cloudRun.vcpuUsdPerSecond,
		cloudRunMemoryUsd: wallSeconds * memoryGiB * prices.cloudRun.gibUsdPerSecond,
		cloudRunRequestUsd: requestUsd,
		gcsClassAUsd: positive(row.gcsClassAOps) * prices.gcs.classAUsdPer1000 / 1000,
		gcsClassBUsd: positive(row.gcsClassBOps) * prices.gcs.classBUsdPer1000 / 1000,
		gcsStorageUsd: storageGibMonths * prices.gcs.storageUsdPerGibMonth,
		egressUsd: (positive(row.egressBytes) / GIB) * prices.gcs.egressUsdPerGib,
		firestoreReadUsd: positive(row.firestoreReads) * prices.firestore.readUsdPer100k / HUNDRED_THOUSAND,
		firestoreWriteUsd: positive(row.firestoreWrites) * prices.firestore.writeUsdPer100k / HUNDRED_THOUSAND,
		firestoreDeleteUsd: positive(row.firestoreDeletes) * prices.firestore.deleteUsdPer100k / HUNDRED_THOUSAND,
		ttsUsd: positive(row.ttsCharacters) * prices.external.ttsUsdPerMillionCharacters / MILLION,
		avatarGpuUsd: positive(row.gpuSeconds) * prices.external.avatarUsdPerGpuSecond,
		// Generated rigged-3D GPU cost — its OWN line off the dedicated model3dGenGpuSeconds counter, so
		// TRELLIS.2+UniRig L40S time is never conflated with avatar A10G time (they share no counter). The
		// per-stage model3dGenGen/RigGpuSeconds are informational sub-drivers of this same total — they are
		// DELIBERATELY given NO USD line here (their sum is model3dGenGpuSeconds; charging both would double-count).
		model3dGenGpuUsd: positive(row.model3dGenGpuSeconds) * prices.external.model3dGenUsdPerGpuSecond,
		model3dGenProviderUsd: positive(row.model3dGenProviderCredits) * prices.external.model3dGenProviderUsdPerCredit,
		// Baker (presenter clip-baker) CPU cost — a SEPARATE request-linear line off the CPU-second counter, so
		// the CPU-only bake never inflates the L40S GPU basis. Request-linear → stays outside amortizableInstanceUsd.
		model3dGenBakeCpuUsd: positive(row.model3dGenBakeCpuSeconds) * prices.external.model3dGenBakeUsdPerCpuSecond,
		// Flux image-gen GPU cost — its OWN line off imageGenGpuSeconds (Modal L40S; 0 for the Cloudflare edge
		// host). Keeps Flux L40S time separate from model3dGen/avatar GPU (they share no counter).
		imageGenGpuUsd: positive(row.imageGenGpuSeconds) * prices.external.imageGenUsdPerGpuSecond,
		// Private Qwen semantic review GPU cost — separate from Flux creation/edit
		// even though both currently use Modal L40S, preventing attribution drift.
		semanticJudgeGpuUsd: positive(row.semanticJudgeGpuSeconds) * prices.external.semanticJudgeUsdPerGpuSecond,
		otherExternalUsd: positive(row.externalCalls) * prices.external.otherUsdPerCall,
		fixedOverheadUsd: positive(fixedOverheadUsdPerOperation),
	}
	const roundedBreakdown = Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, roundUsd(value)]))
	const totalUsd = roundUsd(Object.values(breakdown).reduce((sum, value) => sum + value, 0))
	// B3 split: only amortizable instance-time cost may be scaled by a W6 concurrency factor.
	// Request-linear cost (per-request fee, Firestore, GCS, storage, egress, external/TTS/GPU,
	// fixed per-op overhead) must never be discounted by concurrency.
	const amortizableInstanceUsd = roundUsd(breakdown.cloudRunCpuUsd + breakdown.cloudRunMemoryUsd)
	const requestLinearUsd = roundUsd(totalUsd - amortizableInstanceUsd)
	return {
		schemaVersion: 'betterpptx.cost-row.v1',
		toolName: String(row.toolName || row.eventType || 'unknown'),
		workload: String(row.workload || ''),
		callId: String(row.callId || ''),
		catalogDigest: prices.digest,
		catalogEffectiveAt: prices.effectiveAt,
		region: prices.region,
		cloudRunBillingMode: prices.cloudRunBillingMode,
		serviceShape: { vcpu, memoryGiB },
		meterSource: row.meterSource || null,
		includesChildProcesses: Boolean(row.includesChildProcesses),
		wallMs: positive(row.wallMs),
		cpuUsec: positive(row.cpuUsec),
		breakdownUsd: roundedBreakdown,
		amortizableInstanceUsd,
		requestLinearUsd,
		measuredUsd: totalUsd,
	}
}

export function percentile(values = [], pct = 0.5) {
	const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
	if (!sorted.length) return 0
	const position = Math.min(1, Math.max(0, Number(pct) || 0)) * (sorted.length - 1)
	const lower = Math.floor(position)
	const upper = Math.ceil(position)
	if (lower === upper) return sorted[lower]
	const fraction = position - lower
	return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction
}

export function coefficientOfVariation(values = []) {
	const clean = values.map(Number).filter(Number.isFinite)
	if (clean.length < 2) return 0
	const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length
	if (mean === 0) return 0
	const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1)
	return Math.sqrt(variance) / mean
}

export function summarizeCostRows(rows = []) {
	const costs = rows.map(row => Number(row.measuredUsd)).filter(Number.isFinite)
	return {
		count: costs.length,
		measuredUsdMean: roundUsd(costs.length ? costs.reduce((sum, value) => sum + value, 0) / costs.length : 0),
		measuredUsdMedian: roundUsd(percentile(costs, 0.5)),
		measuredUsdP95: roundUsd(percentile(costs, 0.95)),
		coefficientOfVariation: Number(coefficientOfVariation(costs).toFixed(6)),
		totalUsd: roundUsd(costs.reduce((sum, value) => sum + value, 0)),
	}
}

export function reconcileCostLayers({ l1Usd, l2Usd, l3Usd, overheadUsd = 0, toleranceRatio = 0.10 } = {}) {
	const l1Raw = positive(l1Usd)
	const overhead = positive(overheadUsd)
	// L1 captures per-operation active processing only. Instance lifetime, startup, warm idle,
	// and inter-request overhead are structural and must be added to L1 before comparing to L3
	// (B3/M7). Under instance_based billing this term dominates; without it the run fails
	// tolerance by construction. Overhead must be measured independently (W0 idle, W5 cold start),
	// not back-fit from L3.
	const l1 = roundUsd(l1Raw + overhead)
	const l2 = positive(l2Usd)
	const l3 = positive(l3Usd)
	if (l3 <= 0) throw new CostModelError('COST_RECONCILIATION_L3_REQUIRED', 'BigQuery billing export total must be positive for reconciliation.')
	const ratio = value => Number(((value - l3) / l3).toFixed(6))
	const l1DeltaRatio = ratio(l1)
	const l2DeltaRatio = ratio(l2)
	const tolerance = Math.max(0, Number(toleranceRatio) || 0)
	return {
		ok: Math.abs(l1DeltaRatio) <= tolerance && Math.abs(l2DeltaRatio) <= tolerance,
		toleranceRatio: tolerance,
		l1Usd: roundUsd(l1),
		l1RawUsd: roundUsd(l1Raw),
		overheadUsd: roundUsd(overhead),
		l2Usd: roundUsd(l2),
		l3Usd: roundUsd(l3),
		l1DeltaRatio,
		l2DeltaRatio,
		unexplainedResidualUsd: roundUsd(l3 - l1),
	}
}
