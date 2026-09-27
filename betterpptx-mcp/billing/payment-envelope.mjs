import * as crypto from 'node:crypto'

export class PaymentEnvelopeError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'PaymentEnvelopeError'
		this.code = code
		this.details = details
	}
}

function envelopeSecret() {
	const secret = String(process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET || '').trim()
	if (secret.length < 32) {
		throw new PaymentEnvelopeError(
			'PAYMENT_ENVELOPE_SECRET_MISSING',
			'Payment links are not configured for this deployment.',
		)
	}
	return secret
}

function key() {
	return crypto.createHash('sha256').update(envelopeSecret()).digest()
}

function ttlSeconds() {
	const configured = Number(process.env.BETTERPPTX_PAYMENT_ENVELOPE_TTL_SECONDS)
	return Number.isFinite(configured) && configured >= 60 ? Math.round(configured) : 15 * 60
}

export function mintPaymentEnvelope({
	purpose = 'topup',
	installHash = '',
	jobId = '',
	bindingDigest = '',
	packId = '',
	metadata = null,
	nowMs = Date.now(),
} = {}) {
	if (!installHash && !jobId) throw new PaymentEnvelopeError('PAYMENT_ENVELOPE_IDENTITY_MISSING', 'Payment link identity is missing.')
	const nonce = crypto.randomBytes(12)
	const payload = {
		v: 1,
		purpose: String(purpose),
		...(installHash ? { installHash: String(installHash) } : {}),
		...(jobId ? { jobId: String(jobId) } : {}),
		...(bindingDigest ? { bindingDigest: String(bindingDigest) } : {}),
		packId: packId ? String(packId) : undefined,
		...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { metadata } : {}),
		jti: crypto.randomBytes(16).toString('hex'),
		iat: Math.floor(nowMs / 1000),
		exp: Math.floor(nowMs / 1000) + ttlSeconds(),
	}
	const cipher = crypto.createCipheriv('aes-256-gcm', key(), nonce)
	cipher.setAAD(Buffer.from('betterpptx.payment-envelope.v1'))
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(payload), 'utf8'),
		cipher.final(),
	])
	const tag = cipher.getAuthTag()
	return `bpte1.${Buffer.concat([nonce, tag, ciphertext]).toString('base64url')}`
}

export function verifyPaymentEnvelope(token, {
	purpose = 'topup',
	nowMs = Date.now(),
	allowExpired = false,
} = {}) {
	const text = String(token || '').trim()
	if (!text.startsWith('bpte1.')) throw new PaymentEnvelopeError('PAYMENT_ENVELOPE_INVALID', 'Payment link is invalid.')
	let packed
	try {
		packed = Buffer.from(text.slice(6), 'base64url')
	} catch {
		throw new PaymentEnvelopeError('PAYMENT_ENVELOPE_INVALID', 'Payment link is invalid.')
	}
	if (packed.length < 29) throw new PaymentEnvelopeError('PAYMENT_ENVELOPE_INVALID', 'Payment link is invalid.')
	const nonce = packed.subarray(0, 12)
	const tag = packed.subarray(12, 28)
	const ciphertext = packed.subarray(28)
	let payload
	try {
		const decipher = crypto.createDecipheriv('aes-256-gcm', key(), nonce)
		decipher.setAAD(Buffer.from('betterpptx.payment-envelope.v1'))
		decipher.setAuthTag(tag)
		payload = JSON.parse(Buffer.concat([
			decipher.update(ciphertext),
			decipher.final(),
		]).toString('utf8'))
	} catch {
		throw new PaymentEnvelopeError('PAYMENT_ENVELOPE_INVALID', 'Payment link is invalid.')
	}
	if (payload?.v !== 1 || payload?.purpose !== purpose || (!payload?.installHash && !payload?.jobId) || !payload?.jti) {
		throw new PaymentEnvelopeError('PAYMENT_ENVELOPE_INVALID', 'Payment link is invalid.')
	}
	if (!allowExpired && Number(payload.exp || 0) <= Math.floor(nowMs / 1000)) {
		throw new PaymentEnvelopeError('PAYMENT_ENVELOPE_EXPIRED', 'Payment link has expired.')
	}
	return payload
}

export function tryMintPaymentEnvelope(input = {}) {
	try {
		return mintPaymentEnvelope(input)
	} catch {
		return null
	}
}

export function mintJobPaymentEnvelope({ jobId, bindingDigest = '', packId = '', metadata = null, nowMs = Date.now() } = {}) {
	return mintPaymentEnvelope({
		purpose: 'monetized_mcp_job',
		jobId,
		bindingDigest,
		packId,
		metadata,
		nowMs,
	})
}

export function verifyJobPaymentEnvelope(token, options = {}) {
	return verifyPaymentEnvelope(token, { ...options, purpose: 'monetized_mcp_job' })
}

// Browser reloads may issue fresh encrypted envelopes, but never a fresh
// logical payment for the same order. Only server-authenticated envelope
// metadata reaches this helper; a request body orderId is not authority.
export function quoteKeyForPaymentEnvelope(envelope = {}) {
	const orderId = envelope.metadata?.gaslessOrderId
	if (!orderId) return String(envelope.jti || envelope.jobId || '')
	return `gasless_order_${crypto.createHash('sha256').update(JSON.stringify([
		'betterpptx.gasless-order.v1', String(orderId), String(envelope.installHash || ''), String(envelope.jobId || ''), String(envelope.packId || ''),
	])).digest('hex')}`
}
