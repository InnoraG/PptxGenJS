import { hashPayload, hashStableId } from './ledger-store.mjs'
import { configuredPayramEnvironment, paymentNetworkReadiness } from './base-network.mjs'

export class PayRamClientError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'PayRamClientError'
		this.code = code
		this.details = details
	}
}

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])
const PAYRAM_TERMINAL_PAID = new Set(['FILLED', 'OVER_FILLED'])
const PAYRAM_TERMINAL_CANCELLED = new Set(['CANCELLED', 'CANCELED', 'EXPIRED'])

function enabled(name, env = process.env) {
	return ENABLED_VALUES.has(String(env[name] || '').trim().toLowerCase())
}

function configuredTimeoutMs(env = process.env) {
	const n = Number(env.BETTERPPTX_PAYRAM_TIMEOUT_MS)
	if (!Number.isFinite(n) || n <= 0) return 5000
	return Math.max(1000, Math.min(30000, Math.round(n)))
}

function normalizeBaseUrl(value, env = process.env) {
	const text = String(value || '').trim().replace(/\/+$/, '')
	if (!text) return null
	try {
		const url = new URL(text)
		const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
		if (url.username || url.password || url.search || url.hash) return null
		if (url.protocol === 'https:' || (url.protocol === 'http:' && isLocal && enabled('BETTERPPTX_ALLOW_LOCAL_PAYMENT_HTTP', env))) return text
	} catch {}
	return null
}

function apiKey(env = process.env) {
	return String(env.BETTERPPTX_PAYRAM_API_KEY || '').trim()
}

function invalidResponse() {
	return new PayRamClientError('PAYRAM_RESPONSE_INVALID', 'PayRam returned inconsistent payment evidence.')
}

function responseObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse()
	return value
}

function aliasValue(value, keys, normalize = item => {
	if (typeof item !== 'string' && typeof item !== 'number') throw invalidResponse()
	return String(item).trim()
}) {
	const values = keys.filter(key => value[key] !== undefined).map(key => normalize(value[key]))
	if (values.some(item => item !== values[0])) throw invalidResponse()
	return values[0]
}

function paymentNumber(value) {
	if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') throw invalidResponse()
	if (typeof value === 'string' && !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value.trim())) throw invalidResponse()
	const number = Number(value)
	if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER / 1e6) throw invalidResponse()
	return number
}

function customerIdFrom(value) {
	return aliasValue(value, ['customerID', 'customerId', 'customer_id']) || ''
}

function amountFrom(value) {
	return aliasValue(value, ['amountInUSD', 'amount_in_usd', 'amount'], paymentNumber)
}

function asNumber(value) {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

function hashEmail(value) {
	const text = String(value || '').trim().toLowerCase()
	return text ? hashStableId('email', text) : null
}

function extractReferenceId(value = {}) {
	const ref = aliasValue(value, ['reference_id', 'referenceID', 'referenceId'])
		?? aliasValue(value, ['invoiceID', 'invoice_id', 'id']) ?? ''
	if (ref && (ref.length > 256 || /[\s\x00-\x1f\x7f]/.test(ref))) throw invalidResponse()
	return ref
}

function extractPaymentUrl(value = {}) {
	return aliasValue(value, ['url', 'paymentUrl', 'payment_url', 'checkoutUrl', 'checkout_url']) || null
}

function extractPaymentState(value = {}) {
	return aliasValue(value, ['paymentState', 'payment_state', 'status', 'state'], item => {
		if (typeof item !== 'string' || item.length > 80) throw invalidResponse()
		return item.trim().toUpperCase()
	}) || ''
}

export function validatePayramPaymentUrl(value, referenceId, { env = process.env } = {}) {
	try {
		const base = new URL(normalizeBaseUrl(env.BETTERPPTX_PAYRAM_BASE_URL, env))
		const url = new URL(value)
		// PayRam documents checkout on the same host, including API :8443 and
		// checkout :443. Do not follow arbitrary provider-supplied destinations.
		if (url.hostname !== base.hostname || url.username || url.password || url.hash
			|| (url.protocol !== 'https:' && !(base.protocol === 'http:' && url.protocol === 'http:'))) throw invalidResponse()
		for (const key of ['reference_id', 'referenceID', 'referenceId']) {
			if (url.searchParams.getAll(key).some(ref => ref !== referenceId)) throw invalidResponse()
		}
		if (url.searchParams.getAll('host').some(host => host !== base.origin)) throw invalidResponse()
		return url.href
	} catch {
		throw new PayRamClientError('PAYRAM_PAYMENT_URL_INVALID', 'PayRam returned an invalid payment URL.')
	}
}

async function parseJsonResponse(response, action) {
	const text = await response.text()
	let data = null
	try {
		data = text ? JSON.parse(text) : {}
	} catch {
		throw new PayRamClientError('PAYRAM_INVALID_JSON', `PayRam ${action} returned invalid JSON.`, {
			status: response.status,
			bodyHash: hashPayload({ text }),
		})
	}
	if (!response.ok) {
		throw new PayRamClientError('PAYRAM_HTTP_ERROR', `PayRam ${action} failed with HTTP ${response.status}.`, {
			status: response.status,
			bodyHash: hashPayload(data),
		})
	}
	return responseObject(data)
}

async function callPayRam(url, { method = 'GET', apiKeyValue, body, fetchFn = fetch, timeoutMs = 5000, action = 'request' } = {}) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetchFn(url, {
			method,
			redirect: 'error',
			headers: {
				'API-Key': apiKeyValue,
				'Content-Type': 'application/json',
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: controller.signal,
		})
		return await parseJsonResponse(response, action)
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw new PayRamClientError('PAYRAM_TIMEOUT', `PayRam ${action} timed out.`, { timeoutMs })
		}
		if (error instanceof PayRamClientError) throw error
		throw new PayRamClientError('PAYRAM_NETWORK_ERROR', `PayRam ${action} could not be reached.`)
	} finally {
		clearTimeout(timer)
	}
}

export function payramReadiness({ env = process.env } = {}) {
	const payramEnabled = enabled('BETTERPPTX_PAYRAM_ENABLED', env)
	const baseUrl = normalizeBaseUrl(env.BETTERPPTX_PAYRAM_BASE_URL, env)
	const key = apiKey(env)
	const baseNetwork = paymentNetworkReadiness({ env, payramEnabled: false })
	let payramEnvironment = null
	let networkError = null
	if (payramEnabled) {
		const strictNetworkSelection = new Set(['1', 'true', 'yes', 'on']).has(String(env.BETTERPPTX_REQUIRE_EXPLICIT_PAYMENT_NETWORK || '').trim().toLowerCase())
			|| String(env.BETTERPPTX_DEPLOYMENT_STAGE || '').trim().toLowerCase() === 'testnet'
			|| baseNetwork.selected?.id === 'base-sepolia'
		try {
			payramEnvironment = configuredPayramEnvironment(env, { requireExplicit: strictNetworkSelection })
			// Preserve the historical mainnet default for non-strict development
			// fixtures. A testnet or explicitly strict deployment must name both
			// sides of the provider/network binding and never inherit mainnet.
			if (!payramEnvironment && !strictNetworkSelection) payramEnvironment = baseNetwork.selected?.payramEnvironment || null
		} catch (error) {
			networkError = error.code || 'PAYRAM_NETWORK_INVALID'
		}
	}
	const networkMatches = Boolean(payramEnvironment && baseNetwork.selected
		&& payramEnvironment === baseNetwork.selected.payramEnvironment)
	const reconcileTokenReady = String(env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN || env.BETTERPPTX_PAYRAM_RECONCILE_TOKEN || '').trim().length >= 16
	const missing = []
	if (!payramEnabled) missing.push('BETTERPPTX_PAYRAM_ENABLED')
	if (!baseUrl) missing.push('BETTERPPTX_PAYRAM_BASE_URL')
	if (key.length < 16) missing.push('BETTERPPTX_PAYRAM_API_KEY')
	if (payramEnabled && !payramEnvironment) missing.push('BETTERPPTX_PAYRAM_NETWORK')
	if (payramEnabled && !baseNetwork.ready) missing.push(...baseNetwork.missing, ...baseNetwork.errors)
	if (payramEnabled && payramEnvironment && baseNetwork.selected && !networkMatches) missing.push('PAYMENT_NETWORK_MISMATCH')
	return {
		enabled: payramEnabled,
		configured: payramEnabled && Boolean(baseUrl) && key.length >= 16 && baseNetwork.ready && networkMatches,
		authenticationStatus: 'unverified',
		baseUrl: baseUrl ? '[configured]' : null,
		apiKeyFingerprint: key ? hashPayload({ apiKey: key }).slice(0, 16) : null,
		webhookAuth: key.length >= 16 ? 'payram-api-key' : 'unavailable',
		reconcileTokenConfigured: reconcileTokenReady,
		// Compatibility alias: this refers to BetterPPTX's internal token, not
		// the provider webhook credential, which is the PayRam API key above.
		webhookTokenConfigured: reconcileTokenReady,
		internalReconcileReady: reconcileTokenReady,
		paymentNetwork: baseNetwork.selected,
		network: payramEnvironment,
		networkMatches,
		networkError,
		missing,
		optionalMissing: reconcileTokenReady ? [] : ['BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN'],
		timeoutMs: configuredTimeoutMs(env),
	}
}

export function payramConfigured(options = {}) {
	return payramReadiness(options).configured
}

function requirePayRamConfig({ env = process.env } = {}) {
	const readiness = payramReadiness({ env })
	if (!readiness.configured) {
		throw new PayRamClientError('PAYRAM_NOT_CONFIGURED', 'PayRam is not configured.', { missing: readiness.missing })
	}
	return {
		baseUrl: normalizeBaseUrl(env.BETTERPPTX_PAYRAM_BASE_URL, env),
		apiKeyValue: apiKey(env),
		timeoutMs: configuredTimeoutMs(env),
	}
}

export async function createPayramPayment(input = {}, options = {}) {
	const env = options.env || process.env
	const config = requirePayRamConfig({ env })
	const body = validatePayramPaymentInput(input)
	const { customerEmail, customerID: customerId, amountInUSD: amountUsd } = body
	const data = await callPayRam(`${config.baseUrl}/api/v1/payment`, {
		method: 'POST',
		apiKeyValue: config.apiKeyValue,
		body,
		fetchFn: options.fetchFn ?? globalThis.fetch,
		timeoutMs: options.timeoutMs || config.timeoutMs,
		action: 'create-payment',
	})
	const referenceId = extractReferenceId(data)
	const url = extractPaymentUrl(data)
	if (!referenceId || !url) {
		throw new PayRamClientError('PAYRAM_CREATE_RESPONSE_INVALID', 'PayRam create-payment response is missing reference id or payment URL.', {
			responseHash: hashPayload(data),
		})
	}
	if ((customerIdFrom(data) && customerIdFrom(data) !== customerId)
		|| (amountFrom(data) !== undefined && amountFrom(data) !== amountUsd)) throw invalidResponse()
	validatePayramPaymentUrl(url, referenceId, { env })
	return publicPayramPayment({
		...data,
		referenceId,
		reference_id: referenceId,
		url,
		requestedAmountUsd: amountUsd,
		customerIdHash: hashStableId('payram_customer', customerId),
		customerEmailHash: hashEmail(customerEmail),
	})
}

// Preflight before reserving a durable checkout: validation errors must not
// leave an otherwise retryable purchase stuck in provider_pending.
export function validatePayramPaymentInput(input = {}) {
	const customerEmail = typeof input.customerEmail === 'string' ? input.customerEmail.trim() : ''
	const suppliedCustomer = input.customerId ?? input.customerID
	const customerId = typeof suppliedCustomer === 'string' ? suppliedCustomer.trim() : ''
	const amount = input.amountUsd ?? input.amountInUSD
	if (!customerEmail || customerEmail.length > 320 || /[\r\n\x00]/.test(customerEmail)) throw new PayRamClientError('PAYRAM_CUSTOMER_EMAIL_MISSING', 'PayRam requires a customer email for card checkout.')
	if (!customerId || customerId.length > 256) throw new PayRamClientError('PAYRAM_CUSTOMER_ID_MISSING', 'PayRam requires a customer id for card checkout.')
	let amountUsd
	try { amountUsd = paymentNumber(amount) } catch { amountUsd = 0 }
	if (amountUsd <= 0) throw new PayRamClientError('PAYRAM_AMOUNT_INVALID', 'PayRam amount must be positive.')
	return { customerEmail, customerID: customerId, amountInUSD: amountUsd }
}

export async function getPayramPaymentStatus(referenceId, options = {}) {
	const env = options.env || process.env
	const config = requirePayRamConfig({ env })
	const ref = String(referenceId || '').trim()
	if (!ref) throw new PayRamClientError('PAYRAM_REFERENCE_ID_MISSING', 'Missing PayRam reference id.', {})
	const method = String(env.BETTERPPTX_PAYRAM_STATUS_METHOD || 'GET').trim().toUpperCase() === 'POST' ? 'POST' : 'GET'
	const data = await callPayRam(`${config.baseUrl}/api/v1/payment/reference/${encodeURIComponent(ref)}`, {
		method,
		apiKeyValue: config.apiKeyValue,
		body: method === 'POST' ? {} : undefined,
		fetchFn: options.fetchFn ?? globalThis.fetch,
		timeoutMs: options.timeoutMs || config.timeoutMs,
		action: 'payment-status',
	})
	if (extractReferenceId(data) !== ref) throw invalidResponse()
	if (options.expectedCustomerId !== undefined && customerIdFrom(data) !== options.expectedCustomerId) throw invalidResponse()
	const amount = amountFrom(data)
	if (options.expectedAmountUsd !== undefined && (amount === undefined || amount <= 0 || amount !== paymentNumber(options.expectedAmountUsd))) throw invalidResponse()
	const normalized = normalizePayramPaymentState(data)
	const filled = aliasValue(data, ['filled_amount_in_usd', 'filledAmountInUSD', 'filledAmountUsd'], paymentNumber)
	if (normalized.creditable && filled !== undefined && options.expectedAmountUsd !== undefined && filled < options.expectedAmountUsd) throw invalidResponse()
	return normalized
}

export function normalizePayramPaymentState(status = {}) {
	responseObject(status)
	const paymentState = extractPaymentState(status) || 'UNKNOWN'
	const referenceId = extractReferenceId(status)
	const amountInUSD = amountFrom(status) ?? 0
	const providerFilledAmountUsd = aliasValue(status, ['filled_amount_in_usd', 'filledAmountInUSD', 'filledAmountUsd'], paymentNumber) ?? 0
	const providerNetReceivedUsd = aliasValue(status, ['net_amount_in_usd', 'netAmountInUSD', 'providerNetReceivedUsd'], paymentNumber) ?? 0
	const providerFeeUsd = aliasValue(status, ['fee_in_usd', 'feeInUSD', 'providerFeeUsd'], paymentNumber) ?? 0
	const state = PAYRAM_TERMINAL_PAID.has(paymentState)
		? 'paid'
		: paymentState === 'PARTIALLY_FILLED'
			? 'partial'
			: PAYRAM_TERMINAL_CANCELLED.has(paymentState)
				? 'cancelled'
				: paymentState === 'OPEN'
					? 'open'
					: 'verification_pending'
	return {
		referenceId,
		provider: 'payram',
		providerStatus: paymentState,
		state,
		creditable: PAYRAM_TERMINAL_PAID.has(paymentState),
		partial: paymentState === 'PARTIALLY_FILLED',
		cancelled: PAYRAM_TERMINAL_CANCELLED.has(paymentState),
		amountInUSD,
		providerFilledAmountUsd,
		providerNetReceivedUsd,
		providerFeeUsd,
		rawStatusHash: hashPayload(status || {}),
		createdAt: typeof (status.createdAt ?? status.created_at) === 'string' ? (status.createdAt ?? status.created_at).slice(0, 80) : null,
	}
}

export function publicPayramPayment(payment = {}) {
	const normalized = normalizePayramPaymentState(payment)
	return {
		referenceId: payment.referenceId || normalized.referenceId || null,
		url: extractPaymentUrl(payment),
		provider: 'payram',
		providerStatus: normalized.providerStatus,
		state: normalized.state,
		creditable: normalized.creditable,
		amountInUSD: asNumber(payment.requestedAmountUsd ?? payment.amountInUSD ?? normalized.amountInUSD),
		providerFilledAmountUsd: normalized.providerFilledAmountUsd,
		providerNetReceivedUsd: normalized.providerNetReceivedUsd,
		providerFeeUsd: normalized.providerFeeUsd,
		customerIdHash: payment.customerIdHash || null,
		customerEmailHash: payment.customerEmailHash || null,
	}
}
