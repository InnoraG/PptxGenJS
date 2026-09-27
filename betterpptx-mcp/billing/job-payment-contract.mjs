import * as crypto from 'node:crypto'

/**
 * Accountless, one-payment-per-job contract.
 *
 * This module is deliberately pure.  It does not create a customer profile, hold a
 * balance, or decide whether a payment rail is enabled.  The durable quote/job store
 * owns the record; this file owns the meaning of the record and its safe transitions.
 */
export const JOB_PAYMENT_CONTRACT_VERSION = 'betterpptx.job-payment.v1'

export const JOB_PAYMENT_STATES = Object.freeze([
	'payment_pending',
	'settlement_uncertain',
	'paid',
	'admitted',
	'running',
	'succeeded',
	'failed',
	'reconciliation_required',
	'refund_pending',
	'refunded',
	'cancelled',
	'expired',
])

const TRANSITIONS = Object.freeze({
	payment_pending: ['settlement_uncertain', 'paid', 'cancelled', 'expired'],
	settlement_uncertain: ['paid', 'reconciliation_required', 'cancelled', 'expired'],
	paid: ['admitted', 'running', 'cancelled', 'refund_pending', 'reconciliation_required'],
	admitted: ['running', 'failed', 'reconciliation_required', 'refund_pending'],
	running: ['succeeded', 'failed', 'reconciliation_required', 'refund_pending'],
	succeeded: [],
	failed: ['refund_pending'],
	reconciliation_required: ['paid', 'admitted', 'failed', 'refund_pending', 'cancelled'],
	refund_pending: ['refunded', 'failed'],
	refunded: [],
	cancelled: [],
	expired: [],
})

const TERMINAL_STATES = new Set(['succeeded', 'refunded', 'cancelled', 'expired'])

function stable(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stable)
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function digest(value) {
	return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}

function text(value, name, { required = true, max = 256 } = {}) {
	const result = String(value ?? '').trim()
	if (required && !result) throw new JobPaymentContractError('JOB_PAYMENT_BINDING_INVALID', `${name} is required.`)
	if (result.length > max) throw new JobPaymentContractError('JOB_PAYMENT_BINDING_INVALID', `${name} is too long.`)
	return result
}

function positiveAtomic(value) {
	const result = String(value ?? '').trim()
	if (!/^\d+$/.test(result) || BigInt(result) <= 0n) {
		throw new JobPaymentContractError('JOB_PAYMENT_AMOUNT_INVALID', 'The quoted payment amount must be a positive integer in atomic units.')
	}
	return result
}

function futureIso(value, nowMs = Date.now()) {
	const timestamp = Date.parse(String(value ?? ''))
	if (!Number.isFinite(timestamp) || timestamp <= nowMs) {
		throw new JobPaymentContractError('JOB_PAYMENT_EXPIRY_INVALID', 'The job payment quote must have a future expiry.')
	}
	return new Date(timestamp).toISOString()
}

export class JobPaymentContractError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'JobPaymentContractError'
		this.code = code
		this.details = details
	}
}

export function jobInputDigest({ productId = 'betterpptx', operation, input, inputDigest = '' } = {}) {
	if (inputDigest) return text(inputDigest, 'inputDigest', { max: 128 })
	if (input === undefined) throw new JobPaymentContractError('JOB_PAYMENT_INPUT_DIGEST_REQUIRED', 'A stable digest of the exact job input is required.')
	return digest({ productId: text(productId, 'productId', { max: 64 }), operation: text(operation, 'operation', { max: 180 }), input: stable(input) })
}

export function createJobPaymentBinding({
	productId = 'betterpptx',
	jobId,
	operation,
	input,
	inputDigest: suppliedInputDigest = '',
	outputProfile = {},
	limits = {},
	amountAtomic,
	asset = 'USDC',
	assetContract = '',
	network,
	payTo,
	expiresAt,
	quoteId = '',
	preparationDigest = '',
	narrationDigest = '',
	nowMs = Date.now(),
} = {}) {
	const binding = {
		contractVersion: JOB_PAYMENT_CONTRACT_VERSION,
		productId: text(productId, 'productId', { max: 64 }),
		jobId: text(jobId, 'jobId', { max: 160 }),
		operation: text(operation, 'operation', { max: 180 }),
		inputDigest: jobInputDigest({ productId, operation, input, inputDigest: suppliedInputDigest }),
		outputProfile: stable(outputProfile && typeof outputProfile === 'object' && !Array.isArray(outputProfile) ? outputProfile : {}),
		limits: stable(limits && typeof limits === 'object' && !Array.isArray(limits) ? limits : {}),
		amountAtomic: positiveAtomic(amountAtomic),
		asset: text(asset, 'asset', { max: 32 }),
		network: text(network, 'network', { max: 96 }),
		payTo: text(payTo, 'payTo', { max: 180 }),
		expiresAt: futureIso(expiresAt, nowMs),
		...(assetContract ? { assetContract: text(assetContract, 'assetContract', { max: 180 }) } : {}),
		...(quoteId ? { quoteId: text(quoteId, 'quoteId', { max: 180 }) } : {}),
		...(preparationDigest ? { preparationDigest: text(preparationDigest, 'preparationDigest', { max: 128 }) } : {}),
		...(narrationDigest ? { narrationDigest: text(narrationDigest, 'narrationDigest', { max: 128 }) } : {}),
	}
	return {
		...binding,
		bindingDigest: digest(binding),
	}
}

export function createJobPaymentRecord({ binding, nowMs = Date.now(), recovery = null } = {}) {
	const normalized = validateJobPaymentBinding(binding, { nowMs, allowExpired: false })
	const timestamp = new Date(nowMs).toISOString()
	return {
		contractVersion: JOB_PAYMENT_CONTRACT_VERSION,
		productId: normalized.productId,
		jobId: normalized.jobId,
		binding: normalized,
		state: 'payment_pending',
		version: 1,
		payment: null,
		execution: null,
		...(recovery && typeof recovery === 'object' ? { recovery: stable(recovery) } : {}),
		createdAt: timestamp,
		updatedAt: timestamp,
	}
}

export function validateJobPaymentBinding(binding, { nowMs = Date.now(), allowExpired = false } = {}) {
	if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
		throw new JobPaymentContractError('JOB_PAYMENT_BINDING_INVALID', 'A job payment binding is required.')
	}
	const normalized = {
		contractVersion: text(binding.contractVersion, 'contractVersion', { max: 80 }),
		productId: text(binding.productId, 'productId', { max: 64 }),
		jobId: text(binding.jobId, 'jobId', { max: 160 }),
		operation: text(binding.operation, 'operation', { max: 180 }),
		inputDigest: text(binding.inputDigest, 'inputDigest', { max: 128 }),
		outputProfile: stable(binding.outputProfile && typeof binding.outputProfile === 'object' && !Array.isArray(binding.outputProfile) ? binding.outputProfile : {}),
		limits: stable(binding.limits && typeof binding.limits === 'object' && !Array.isArray(binding.limits) ? binding.limits : {}),
		amountAtomic: positiveAtomic(binding.amountAtomic),
		asset: text(binding.asset, 'asset', { max: 32 }),
		network: text(binding.network, 'network', { max: 96 }),
		payTo: text(binding.payTo, 'payTo', { max: 180 }),
		expiresAt: futureIso(binding.expiresAt, allowExpired ? 0 : nowMs),
		...(binding.assetContract ? { assetContract: text(binding.assetContract, 'assetContract', { max: 180 }) } : {}),
		...(binding.quoteId ? { quoteId: text(binding.quoteId, 'quoteId', { max: 180 }) } : {}),
		...(binding.preparationDigest ? { preparationDigest: text(binding.preparationDigest, 'preparationDigest', { max: 128 }) } : {}),
		...(binding.narrationDigest ? { narrationDigest: text(binding.narrationDigest, 'narrationDigest', { max: 128 }) } : {}),
	}
	if (normalized.contractVersion !== JOB_PAYMENT_CONTRACT_VERSION) {
		throw new JobPaymentContractError('JOB_PAYMENT_CONTRACT_UNSUPPORTED', 'The job payment contract version is not supported.')
	}
	const expectedDigest = digest(normalized)
	if (binding.bindingDigest && String(binding.bindingDigest) !== expectedDigest) {
		throw new JobPaymentContractError('JOB_PAYMENT_BINDING_DIGEST_INVALID', 'The job payment binding digest does not match its fields.')
	}
	return { ...normalized, bindingDigest: expectedDigest }
}

export function transitionJobPayment(record, state, patch = {}, { nowMs = Date.now(), expectedVersion = null } = {}) {
	if (!record || typeof record !== 'object') throw new JobPaymentContractError('JOB_PAYMENT_RECORD_INVALID', 'A job payment record is required.')
	if (!JOB_PAYMENT_STATES.includes(state)) throw new JobPaymentContractError('JOB_PAYMENT_STATE_INVALID', 'The requested job payment state is not supported.')
	if (expectedVersion !== null && Number(record.version) !== Number(expectedVersion)) {
		throw new JobPaymentContractError('JOB_PAYMENT_VERSION_CONFLICT', 'The job payment changed while it was being processed.')
	}
	if (record.state !== state && !(TRANSITIONS[record.state] || []).includes(state)) {
		throw new JobPaymentContractError('JOB_PAYMENT_TRANSITION_INVALID', `Job payment cannot transition from ${record.state} to ${state}.`, { from: record.state, to: state })
	}
	const next = {
		...record,
		...stable(patch),
		state,
		version: Number(record.version || 0) + (record.state === state ? 0 : 1),
		updatedAt: new Date(nowMs).toISOString(),
	}
	return next
}

export function isTerminalJobPaymentState(state) {
	return TERMINAL_STATES.has(String(state || ''))
}

export function assertJobPaymentInput(record, { productId = 'betterpptx', operation, inputDigest, bindingDigest = '' } = {}) {
	const binding = validateJobPaymentBinding(record?.binding, { allowExpired: true })
	if (binding.productId !== productId || binding.operation !== operation) {
		throw new JobPaymentContractError('JOB_PAYMENT_BINDING_MISMATCH', 'The payment is bound to a different product or operation.')
	}
	if (inputDigest && binding.inputDigest !== String(inputDigest)) {
		throw new JobPaymentContractError('JOB_PAYMENT_INPUT_MISMATCH', 'The job input changed after payment was quoted.')
	}
	if (bindingDigest && binding.bindingDigest !== String(bindingDigest)) {
		throw new JobPaymentContractError('JOB_PAYMENT_BINDING_MISMATCH', 'The supplied job payment binding is not the quoted binding.')
	}
	return binding
}

export function publicJobPayment(record = {}) {
	const binding = record.binding || {}
	return {
		contractVersion: record.contractVersion || JOB_PAYMENT_CONTRACT_VERSION,
		productId: record.productId || binding.productId || null,
		jobId: record.jobId || binding.jobId || null,
		state: record.state || 'unknown',
		version: Number(record.version || 0),
		binding: {
			operation: binding.operation || null,
			inputDigest: binding.inputDigest || null,
			outputProfile: binding.outputProfile || {},
			limits: binding.limits || {},
			amountAtomic: binding.amountAtomic || null,
			asset: binding.asset || null,
			network: binding.network || null,
			payTo: binding.payTo || null,
			expiresAt: binding.expiresAt || null,
			bindingDigest: binding.bindingDigest || null,
		},
		payment: record.payment ? {
			settlementId: record.payment.settlementId || null,
			txHash: record.payment.txHash || null,
			payer: record.payment.payer || null,
			settledAt: record.payment.settledAt || null,
		} : null,
		execution: record.execution ? {
			operationId: record.execution.operationId || null,
			resultDigest: record.execution.resultDigest || null,
			updatedAt: record.execution.updatedAt || null,
		} : null,
		createdAt: record.createdAt || null,
		updatedAt: record.updatedAt || null,
	}
}
