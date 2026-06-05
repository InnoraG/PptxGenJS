import * as crypto from 'node:crypto'

import { createBillingLedgerStore, hashCustomerId } from './ledger-store.mjs'
import { extractDodoBillingIds } from './customer-map.mjs'

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000

export class DodoWebhookError extends Error {
	constructor(code, message, statusCode = 400, details = {}) {
		super(message)
		this.name = 'DodoWebhookError'
		this.code = code
		this.statusCode = statusCode
		this.details = details
	}
}

function webhookSecret() {
	return process.env.DODO_PAYMENTS_WEBHOOK_SECRET || process.env.BETTERPPTX_DODO_WEBHOOK_SECRET || ''
}

function configuredToleranceMs() {
	const configured = Number(process.env.BETTERPPTX_DODO_WEBHOOK_TOLERANCE_MS)
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TOLERANCE_MS
}

function customHeaderName() {
	return String(process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_HEADER || process.env.DODO_PAYMENTS_WEBHOOK_CUSTOM_HEADER || '').trim()
}

function customHeaderToken() {
	return process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_TOKEN || process.env.DODO_PAYMENTS_WEBHOOK_CUSTOM_TOKEN || ''
}

function headerValue(headers, name) {
	const wanted = String(name || '').toLowerCase()
	if (!headers) return ''
	if (typeof headers.get === 'function') return headers.get(name) || headers.get(wanted) || ''
	for (const [key, value] of Object.entries(headers)) {
		if (String(key).toLowerCase() !== wanted) continue
		if (Array.isArray(value)) return String(value[0] || '')
		return String(value || '')
	}
	return ''
}

function signatureCandidates(header) {
	return String(header || '')
		.split(/[\s,]+/)
		.map(part => part.trim())
		.filter(Boolean)
		.map(part => part.toLowerCase().startsWith('v1=') ? part.slice(3) : part)
		.filter(part => !/^v\d+$/i.test(part))
}

function timingSafeStringEqual(a, b) {
	const left = Buffer.from(String(a || ''), 'utf8')
	const right = Buffer.from(String(b || ''), 'utf8')
	return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function pushUniqueBuffer(list, candidate) {
	if (!candidate || !candidate.length) return
	if (list.some(existing => existing.length === candidate.length && crypto.timingSafeEqual(existing, candidate))) return
	list.push(candidate)
}

function decodeStandardWebhookSecret(secret) {
	const text = String(secret || '').trim()
	if (!text.toLowerCase().startsWith('whsec_')) return null
	const encoded = text.slice(6).replace(/-/g, '+').replace(/_/g, '/')
	const padded = encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), '=')
	try {
		return Buffer.from(padded, 'base64')
	} catch {
		return null
	}
}

function webhookSecretKeys(secret) {
	const text = String(secret || '').trim()
	const keys = []
	pushUniqueBuffer(keys, decodeStandardWebhookSecret(text))
	pushUniqueBuffer(keys, Buffer.from(text, 'utf8'))
	return keys
}

function hmacBase64(key, payload) {
	return crypto
		.createHmac('sha256', key)
		.update(payload, 'utf8')
		.digest('base64')
}

function verifyCustomHeaderIfConfigured(headers) {
	const name = customHeaderName()
	const token = customHeaderToken()
	if (!name && !token) return { ok: true, configured: false }
	if (!name || !token) {
		throw new DodoWebhookError('DODO_WEBHOOK_CUSTOM_SECRET_MISCONFIGURED', 'Dodo webhook custom-header verification is not fully configured.', 503)
	}
	const provided = headerValue(headers, name)
	if (!provided || !timingSafeStringEqual(provided, token)) {
		throw new DodoWebhookError('DODO_WEBHOOK_CUSTOM_SECRET_INVALID', 'Invalid Dodo webhook custom-header secret.', 401)
	}
	return { ok: true, configured: true, header: name }
}

function parseEventTimeMs(timestamp) {
	const text = String(timestamp || '').trim()
	const numeric = Number(text)
	if (Number.isFinite(numeric)) return numeric > 1e12 ? Math.round(numeric) : Math.round(numeric * 1000)
	const parsed = Date.parse(text)
	return Number.isFinite(parsed) ? parsed : null
}

function rawBodyToString(rawBody) {
	if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8')
	if (typeof rawBody === 'string') return rawBody
	if (rawBody === undefined || rawBody === null) return ''
	return ''
}

function rawPayloadHash(rawBody) {
	return crypto.createHash('sha256').update(String(rawBody || ''), 'utf8').digest('hex')
}

function publicEventType(event = {}) {
	return String(event.type || event.event_type || event.eventType || 'unknown').trim() || 'unknown'
}

function billingStatusForEvent(eventType) {
	switch (String(eventType || '').toLowerCase()) {
		case 'payment.succeeded':
		case 'subscription.active':
		case 'subscription.renewed':
		case 'subscription.updated':
		case 'subscription.plan_changed':
			return 'active'
		case 'payment.failed':
		case 'subscription.failed':
		case 'subscription.on_hold':
			return 'past_due'
		case 'payment.cancelled':
		case 'subscription.cancelled':
		case 'subscription.expired':
			return 'inactive'
		case 'refund.succeeded':
			return 'refunded'
		case 'dispute.opened':
			return 'disputed'
		default:
			return null
	}
}

function compactDefined(record) {
	return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== undefined && value !== null && value !== ''))
}

export function verifyDodoWebhookSignature({ rawBody, headers, secret = webhookSecret(), nowMs = Date.now(), toleranceMs = configuredToleranceMs() } = {}) {
	const body = rawBodyToString(rawBody)
	if (!body) throw new DodoWebhookError('DODO_WEBHOOK_BODY_MISSING', 'Missing webhook body.', 400)
	if (!secret) throw new DodoWebhookError('DODO_WEBHOOK_SECRET_MISSING', 'Dodo webhook secret is not configured.', 503)
	verifyCustomHeaderIfConfigured(headers)

	const webhookId = headerValue(headers, 'webhook-id')
	const signature = headerValue(headers, 'webhook-signature')
	const timestamp = headerValue(headers, 'webhook-timestamp')
	if (!webhookId || !signature || !timestamp) {
		throw new DodoWebhookError('DODO_WEBHOOK_HEADERS_MISSING', 'Missing Dodo webhook signature headers.', 401)
	}

	const eventTimeMs = parseEventTimeMs(timestamp)
	if (!eventTimeMs) throw new DodoWebhookError('DODO_WEBHOOK_TIMESTAMP_INVALID', 'Invalid Dodo webhook timestamp.', 401)
	if (Math.abs(Number(nowMs) - eventTimeMs) > toleranceMs) {
		throw new DodoWebhookError('DODO_WEBHOOK_TIMESTAMP_EXPIRED', 'Dodo webhook timestamp is outside the allowed tolerance.', 401)
	}

	const signedPayload = `${webhookId}.${timestamp}.${body}`
	const legacySignedPayload = `${timestamp}.${body}`
	const expectedSignatures = webhookSecretKeys(secret).flatMap(key => [
		hmacBase64(key, signedPayload),
		hmacBase64(key, legacySignedPayload),
	])
	const ok = signatureCandidates(signature).some(candidate => expectedSignatures.some(expected => timingSafeStringEqual(expected, candidate)))
	if (!ok) throw new DodoWebhookError('DODO_WEBHOOK_SIGNATURE_INVALID', 'Invalid Dodo webhook signature.', 401)

	return { ok: true, webhookId, timestamp, eventTimeMs, payloadHash: rawPayloadHash(body) }
}

function diagnosticHash(value) {
	const text = String(value || '').trim()
	if (!text) return ''
	return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

function webhookRecord({ webhookId, eventType, payloadHash, event, ids }) {
	return {
		webhookId,
		eventType,
		payloadHash,
		provider: 'dodo',
		payload: compactDefined({
			type: eventType,
			businessId: event.business_id || event.businessId,
			timestamp: event.timestamp || event.created_at || event.createdAt,
			payloadType: event.data?.payload_type || event.data?.payloadType,
			providerCustomerId: ids.providerCustomerId,
			providerProductId: ids.providerProductId,
			providerSubscriptionId: ids.providerSubscriptionId,
			providerPaymentId: ids.providerPaymentId,
			providerLicenseId: ids.providerLicenseId,
			creditEntitlementId: ids.creditEntitlementId,
			hasBalanceSnapshot: ids.lastKnownCreditBalance !== null && ids.lastKnownCreditBalance !== undefined,
		}),
	}
}

async function upsertCustomerFromWebhook({ store, webhookId, eventType, payloadHash, ids }) {
	if (!ids.providerCustomerId) return { customer: null, customerHash: null }
	const customerHash = hashCustomerId(ids.providerCustomerId)
	const now = new Date().toISOString()
	const status = billingStatusForEvent(eventType)
	const patch = compactDefined({
		provider: 'dodo',
		providerCustomerId: ids.providerCustomerId,
		providerProductId: ids.providerProductId,
		providerSubscriptionId: ids.providerSubscriptionId,
		providerPaymentId: ids.providerPaymentId,
		providerLicenseId: ids.providerLicenseId,
		creditEntitlementId: ids.creditEntitlementId,
		billingStatus: status,
		lastDodoWebhookId: webhookId,
		lastDodoWebhookType: eventType,
		lastDodoWebhookPayloadHash: payloadHash,
		lastDodoWebhookAt: now,
		lastKnownDodoAvailableBalanceCredits: ids.lastKnownCreditBalance,
		lastBalanceSyncedAt: ids.lastKnownCreditBalance !== null && ids.lastKnownCreditBalance !== undefined ? now : null,
	})
	const customer = await store.upsertCustomer(customerHash, patch)
	return { customer, customerHash }
}

export async function processDodoWebhook({ rawBody, headers, store = createBillingLedgerStore(), secret = webhookSecret(), nowMs = Date.now(), toleranceMs = configuredToleranceMs() } = {}) {
	const body = rawBodyToString(rawBody)
	const verified = verifyDodoWebhookSignature({ rawBody: body, headers, secret, nowMs, toleranceMs })
	let event
	try {
		event = JSON.parse(body)
	} catch {
		throw new DodoWebhookError('DODO_WEBHOOK_JSON_INVALID', 'Dodo webhook body was not valid JSON.', 400)
	}
	const eventType = publicEventType(event)
	const ids = extractDodoBillingIds(event)
	const recorded = await store.recordWebhookEvent(webhookRecord({
		webhookId: verified.webhookId,
		eventType,
		payloadHash: verified.payloadHash,
		event,
		ids,
	}))
	if (!recorded.firstSeen && recorded.webhookEvent?.processed === true) {
		return {
			ok: true,
			duplicate: true,
			webhookId: verified.webhookId,
			eventType: recorded.webhookEvent.eventType || eventType,
			customerHash: recorded.webhookEvent.customerHash || null,
		}
	}

	const { customerHash } = await upsertCustomerFromWebhook({ store, webhookId: verified.webhookId, eventType, payloadHash: verified.payloadHash, ids })
	const processed = await store.markWebhookEventProcessed(verified.webhookId, compactDefined({
		eventType,
		customerHash,
		processedResult: customerHash ? 'customer-updated' : 'no-customer-in-payload',
	}))
	return {
		ok: true,
		duplicate: recorded.firstSeen === false,
		webhookId: verified.webhookId,
		eventType,
		customerHash,
		processed,
	}
}

export async function handleDodoWebhookHttp(req, res) {
	try {
		const rawBody = Buffer.isBuffer(req.body) ? req.body : req.rawBody
		const result = await processDodoWebhook({ rawBody, headers: req.headers })
		return res.status(200).json({
			ok: true,
			received: true,
			duplicate: result.duplicate === true,
		})
	} catch (err) {
		const status = err?.statusCode || 500
		const code = err?.code || 'DODO_WEBHOOK_PROCESSING_FAILED'
		const publicCode = status === 401 ? 'WEBHOOK_UNAUTHORIZED' : status === 503 ? 'WEBHOOK_NOT_CONFIGURED' : status >= 500 ? 'WEBHOOK_PROCESSING_FAILED' : 'WEBHOOK_REJECTED'
		console.warn(JSON.stringify({
			message: 'Dodo webhook rejected.',
			status,
			code,
			webhookIdHash: diagnosticHash(headerValue(req.headers, 'webhook-id')),
		}))
		return res.status(status).json({
			ok: false,
			error: {
				code: publicCode,
				message: status >= 500 ? 'Webhook could not be processed.' : 'Webhook rejected.',
				...(process.env.BETTERPPTX_DEBUG_WEBHOOK_ERRORS === '1' ? { internalCode: code } : {}),
			},
		})
	}
}
