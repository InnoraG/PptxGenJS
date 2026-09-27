import * as fs from 'node:fs'
import * as path from 'node:path'

export class ChargingMatrixError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'ChargingMatrixError'
		this.code = code
		this.details = details
	}
}

const REQUIRED_CHECKPOINT_FIELDS = Object.freeze([
	'deckSaveBase',
	'perFinalSlide',
	'perFinalObject',
	'perRichObject',
	'perOutputMb',
])

// Cost basis (B2/C3): the active runtime coefficient block. `defer_until_owner_review` is a
// pre-adoption preflight policy only and is never a valid adopted runtime basis.
export const ADOPTABLE_COST_BASES = Object.freeze(['serial_ceiling', 'production_adjusted'])
export const OVERHEAD_POLICIES = Object.freeze(['coefficient_included', 'rate_card_overhead_term', 'multiplier_only'])

const REQUIRED_HEAVY_FIELDS = Object.freeze([
	'openUploadedBase',
	'openUploadedPerMb',
	'narrationBase',
	'narrationPer1000Chars',
	'avatarBase',
	'avatarPerSecond',
	'model3dBase',
	'model3dPerMb',
	'mediaImportBase',
	'mediaImportPerMb',
	'batchTransformBase',
	'batchTransformPerObject',
])

// OPTIONAL server/service families (measured free-content processing). In the charging matrix
// their rateCardUsd coefficients are PURE measured USD cost (multiplier-free, like every other
// family). They flow into the credit rate card WHEN the fit produces them, but are NOT REQUIRED
// gates — a matrix that never exercised imageOps/stock/3D-import still validates and adopts
// (backward compatible). At the DOWNSTREAM pricing conversion below they take the regular owner
// multiplier (not the avatar GPU cap); content licensing is never a cost line in the first place.
const OPTIONAL_CHECKPOINT_FIELDS = Object.freeze(['perImageOp', 'perResolvedAssetMb'])
// imageGen* = generated-image compute (Flux). A REAL external USD cost (unlike free stock),
// measured as an optional heavy family; flows into the credit card WHEN the fit produces it.
// model3dGen* = generated rigged-3D compute (TRELLIS.2 + UniRig on L40S). A REAL external GPU USD cost
// (like avatar), measured as an optional heavy family; flows into the credit card WHEN the fit produces
// it. Priced with the GPU-fair multiplier (see GPU_FAMILY_FIELDS below), not the CPU margin.
// model3dGenPerBakeCpuSecond = the Baker (presenter clip-baker) CPU-second cost. Optional-heavy, but
// DELIBERATELY NOT a GPU family (see GPU_FAMILY_FIELDS) — the Baker runs on a CPU Modal container, so it takes
// the NORMAL CPU margin, not the GPU-fair cap (only gen/rig run on the L40S).
const OPTIONAL_HEAVY_FIELDS = Object.freeze(['model3dImportBase', 'model3dImportPerMb', 'imageGenBase', 'imageGenPerImage', 'imageGenPerGpuSecond', 'semanticJudgePerGpuSecond', 'model3dGenBase', 'model3dGenPerGpuSecond', 'model3dGenPerProviderCredit', 'model3dGenPerBakeCpuSecond'])

function finitePositive(value, field) {
	const n = Number(value)
	if (!Number.isFinite(n) || n <= 0) {
		throw new ChargingMatrixError('CHARGING_MATRIX_FIELD_INVALID', `Charging matrix field ${field} must be positive.`, { field })
	}
	return n
}

function optionalNonNegative(value, fallback) {
	const n = Number(value)
	return Number.isFinite(n) && n >= 0 ? n : fallback
}

function matrixConfigFile() {
	const explicit = String(process.env.BETTERPPTX_CHARGING_MATRIX_FILE || '').trim()
	if (explicit) return path.resolve(explicit)
	if (process.env.BETTERPPTX_USE_CHARGING_MATRIX === '1') {
		return path.resolve('betterpptx-mcp', 'billing', 'charging-matrix-v1.json')
	}
	return ''
}

export function configuredOwnerPricingMultiplier() {
	const raw = process.env.BETTERPPTX_OWNER_PRICING_MULTIPLIER ?? process.env.BETTERPPTX_PRICING_MULTIPLIER
	const multiplier = Number(raw)
	if (!Number.isFinite(multiplier) || multiplier <= 0) {
		throw new ChargingMatrixError(
			'OWNER_PRICING_MULTIPLIER_REQUIRED',
			'Measured charging matrix mode requires BETTERPPTX_OWNER_PRICING_MULTIPLIER.',
		)
	}
	return multiplier
}

// GPU-family (avatar) coefficients carry real per-unit provider cost (Modal A10G), so they
// cannot bear the same margin multiple as CPU ops whose absolute costs are fractions of a
// cent. The avatar family gets its own owner multiplier; unset, it defaults to the smaller
// of the main multiplier and the GPU-fair cap below.
const GPU_FAIR_MULTIPLIER_CAP = 3
export function configuredAvatarPricingMultiplier(mainMultiplier) {
	const raw = Number(process.env.BETTERPPTX_OWNER_PRICING_MULTIPLIER_AVATAR)
	if (Number.isFinite(raw) && raw > 0) return raw
	return Math.min(mainMultiplier, GPU_FAIR_MULTIPLIER_CAP)
}

// GPU-backed families whose per-unit provider cost cannot bear the CPU margin multiple — they take the
// GPU-fair multiplier (avatar A10G + model3dGen L40S). avatar* uses the measured A10G basis; model3dGen*
// uses the measured L40S basis (owner sets external.model3dGenUsdPerGpuSecond post-measurement).
const GPU_FAMILY_FIELDS = new Set(['avatarBase', 'avatarPerSecond', 'model3dGenBase', 'model3dGenPerGpuSecond', 'model3dGenPerProviderCredit', 'imageGenPerGpuSecond', 'semanticJudgePerGpuSecond'])

export function configuredChargingMatrixFile() {
	return matrixConfigFile()
}

const REQUIRED_ADOPTION_WORKLOADS = Object.freeze(['W1', 'W2', 'W3', 'W4', 'W5'])

// Adoption guard (Stop Conditions / verifier): a matrix may only be promoted to the live
// billing path if it is measured-cloud provenance, declares a valid adopted costBasis, and
// carries non-synthetic W1-W5 evidence. Owner multiplier always stays external.
export function assertMatrixAdoptable(matrix = {}) {
	validateChargingMatrix(matrix)
	if (matrix.provenance !== 'measured-cloud') {
		throw new ChargingMatrixError('CHARGING_MATRIX_NOT_ADOPTABLE', 'Only measured-cloud matrices may be adopted; synthetic/fixture matrices are forbidden.', { provenance: matrix.provenance ?? null })
	}
	if (!ADOPTABLE_COST_BASES.includes(matrix.costBasis)) {
		throw new ChargingMatrixError('CHARGING_MATRIX_COST_BASIS_REQUIRED', 'Adopted matrix must declare costBasis (serial_ceiling or production_adjusted).', { costBasis: matrix.costBasis ?? null })
	}
	const covered = new Set(matrix.workloadsCovered || [])
	const missing = REQUIRED_ADOPTION_WORKLOADS.filter(w => !covered.has(w))
	if (missing.length) {
		throw new ChargingMatrixError('CHARGING_MATRIX_WORKLOAD_EVIDENCE_MISSING', `Adopted matrix is missing required workload evidence: ${missing.join(', ')}.`, { missing })
	}
	return true
}

function readMatrix(file) {
	if (!file || !fs.existsSync(file)) {
		throw new ChargingMatrixError('CHARGING_MATRIX_FILE_MISSING', 'Configured charging matrix file is missing.', { file })
	}
	let parsed
	try {
		parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
	} catch {
		throw new ChargingMatrixError('CHARGING_MATRIX_FILE_INVALID', 'Configured charging matrix file is not valid JSON.', { file })
	}
	return parsed
}

export function validateChargingMatrix(matrix = {}, { allowIncomplete = false } = {}) {
	if (matrix.schemaVersion !== 'betterpptx.charging-matrix.v1') {
		throw new ChargingMatrixError('CHARGING_MATRIX_SCHEMA_INVALID', 'Charging matrix schema version is not supported.')
	}
	if (matrix.status !== 'measured') {
		throw new ChargingMatrixError('CHARGING_MATRIX_NOT_MEASURED', 'Charging matrix is not marked measured.')
	}
	if (matrix.currency !== 'USD') {
		throw new ChargingMatrixError('CHARGING_MATRIX_CURRENCY_INVALID', 'Charging matrix must use USD cost rows.')
	}
	const rateCardUsd = matrix.rateCardUsd || {}
	if (!rateCardUsd.checkpoint || !rateCardUsd.heavy) {
		throw new ChargingMatrixError('CHARGING_MATRIX_RATE_CARD_MISSING', 'Charging matrix is missing rateCardUsd.checkpoint/heavy.')
	}
	// C3/C6: a matrix-grade (cloud) matrix must declare a valid adopted cost basis. Fixture/test
	// matrices that predate cost-basis support may omit it only when explicitly marked.
	if (matrix.costBasis !== undefined && matrix.costBasis !== null) {
		if (!ADOPTABLE_COST_BASES.includes(matrix.costBasis)) {
			throw new ChargingMatrixError('CHARGING_MATRIX_COST_BASIS_INVALID', `Charging matrix costBasis must be one of ${ADOPTABLE_COST_BASES.join(', ')}.`, { costBasis: matrix.costBasis })
		}
	} else if (matrix.provenance === 'measured-cloud' || process.env.BETTERPPTX_REQUIRE_COST_BASIS === '1') {
		throw new ChargingMatrixError('CHARGING_MATRIX_COST_BASIS_REQUIRED', 'Matrix-grade charging matrix must declare costBasis (serial_ceiling or production_adjusted).')
	}
	if (matrix.overheadPolicy !== undefined && matrix.overheadPolicy !== null
		&& !OVERHEAD_POLICIES.includes(matrix.overheadPolicy)) {
		throw new ChargingMatrixError('CHARGING_MATRIX_OVERHEAD_POLICY_INVALID', `Charging matrix overheadPolicy must be one of ${OVERHEAD_POLICIES.join(', ')}.`, { overheadPolicy: matrix.overheadPolicy })
	}
	if (!allowIncomplete) {
		for (const field of REQUIRED_CHECKPOINT_FIELDS) finitePositive(rateCardUsd.checkpoint[field], `checkpoint.${field}`)
		for (const field of REQUIRED_HEAVY_FIELDS) finitePositive(rateCardUsd.heavy[field], `heavy.${field}`)
	}
	const lowFit = Object.entries(matrix.models || {})
		.filter(([_name, model]) => Number(model?.fitCoverageWithin15Pct) < 0.95)
		.map(([name]) => name)
	if (lowFit.length && process.env.BETTERPPTX_CHARGING_MATRIX_ALLOW_LOW_FIT !== '1') {
		throw new ChargingMatrixError('CHARGING_MATRIX_FIT_INSUFFICIENT', 'Charging matrix fit coverage is below the production threshold.', { lowFit })
	}
	return matrix
}

function usdToCreditCoefficient(usd, multiplier) {
	const credits = Number(usd) * multiplier * 100
	return Number.isFinite(credits) && credits > 0 ? Number(credits.toFixed(6)) : 0
}

export function measuredMatrixToRateCard(matrix = {}, {
	multiplier = configuredOwnerPricingMultiplier(),
	thresholds = {},
	defaultHeavy = {},
} = {}) {
	const allowIncomplete = process.env.BETTERPPTX_CHARGING_MATRIX_ALLOW_INCOMPLETE === '1'
	const checked = validateChargingMatrix(matrix, { allowIncomplete })
	const checkpointUsd = checked.rateCardUsd.checkpoint || {}
	const heavyUsd = checked.rateCardUsd.heavy || {}
	const avatarMultiplier = configuredAvatarPricingMultiplier(multiplier)
	const checkpoint = {}
	for (const field of [...REQUIRED_CHECKPOINT_FIELDS, ...OPTIONAL_CHECKPOINT_FIELDS]) {
		if (checkpointUsd[field] !== undefined) checkpoint[field] = usdToCreditCoefficient(checkpointUsd[field], multiplier)
	}
	const heavy = {}
	for (const field of [...REQUIRED_HEAVY_FIELDS, ...OPTIONAL_HEAVY_FIELDS]) {
		if (heavyUsd[field] !== undefined) heavy[field] = usdToCreditCoefficient(heavyUsd[field], GPU_FAMILY_FIELDS.has(field) ? avatarMultiplier : multiplier)
	}
	return {
		checkpoint,
		heavy: {
			...heavy,
			avatarQualityMultiplier: optionalNonNegative(heavyUsd.avatarQualityMultiplier, defaultHeavy.avatarQualityMultiplier ?? 1.5),
			model3dGenQualityMultiplier: optionalNonNegative(heavyUsd.model3dGenQualityMultiplier, defaultHeavy.model3dGenQualityMultiplier ?? 1.2),
		},
		thresholds,
		meta: {
			source: 'charging-matrix',
			matrixVersion: checked.version,
			pricingDecision: checked.pricingDecision,
			ownerMultiplier: multiplier,
			avatarMultiplier,
			catalogDigest: checked.catalogDigest || null,
			costBasis: checked.costBasis || 'serial_ceiling',
			overheadPolicy: checked.overheadPolicy || 'coefficient_included',
			productionAdjustment: checked.productionAdjustment || null,
			cloudRunBillingMode: checked.cloudRunBillingMode || null,
			formula: 'credits = costUsd * ownerMultiplier * 100; final operation totals are rounded by the estimator',
		},
	}
}

export function configuredMatrixRateCard(options = {}) {
	const file = matrixConfigFile()
	if (!file) return null
	const matrix = readMatrix(file)
	return measuredMatrixToRateCard(matrix, options)
}
