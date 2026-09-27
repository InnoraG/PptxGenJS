import * as crypto from 'node:crypto'

import { configuredCryptoPacks } from './crypto-packs.mjs'
import { createBillingLedgerStore, hashPayload } from './ledger-store.mjs'
import { createPaymentIntentStore, paymentIntentContinuation } from './payment-intents.mjs'
import { verifyPaymentEnvelope } from './payment-envelope.mjs'
import { assertProductionBillingConfiguration } from './security-policy.mjs'
import {
	createPayramPayment,
	getPayramPaymentStatus,
	payramReadiness,
	PayRamClientError,
	validatePayramPaymentInput,
	validatePayramPaymentUrl,
} from './payram-client.mjs'
import {
	PRODUCT_ID,
	productCustomerId,
	productFromCustomerId,
	isForeignProductCustomerId,
} from './payment-product-registry.mjs'
import { completePromoRedemption, redeemPromoTopup, releasePromoRedemption } from './promo-codes.mjs'

const OPEN_PAYRAM_STATES = new Set([
	'created',
	'provider_pending',
	'awaiting_customer_completion',
	'open',
	'detected',
	'partial',
	'paid',
	'verification_pending',
])

function packById(packId) {
	const pack = configuredCryptoPacks().find(item => item.id === String(packId || ''))
	if (!pack) {
		const error = new Error('Credit pack was not found.')
		error.code = 'CRYPTO_PACK_NOT_FOUND'
		throw error
	}
	return pack
}

function bearerToken(req) {
	const authorization = String(req.headers.authorization || '')
	return authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
}

function suppliedInternalToken(req) {
	return String(
		req.headers['x-betterpptx-payram-token']
		|| req.headers['x-betterpptx-webhook-token']
		|| bearerToken(req)
		|| (process.env.BETTERPPTX_PAYRAM_ALLOW_QUERY_TOKEN === '1' ? req.query?.token : '')
		|| '',
	).trim()
}

function requireInternalToken(req, res) {
	const configured = String(
		process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN
		|| process.env.BETTERPPTX_PAYRAM_RECONCILE_TOKEN
		|| process.env.BETTERPPTX_SCANNER_TOKEN
		|| '',
	).trim()
	const supplied = suppliedInternalToken(req)
	if (!tokensEqual(configured, supplied)) {
		res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } })
		return false
	}
	return true
}

function tokensEqual(expected, supplied) {
	if (!expected || !supplied) return false
	const left = crypto.createHash('sha256').update(expected).digest()
	const right = crypto.createHash('sha256').update(supplied).digest()
	return crypto.timingSafeEqual(left, right)
}

function publicIntentResponse(intent) {
	return {
		intentId: intent.intentId,
		purpose: intent.purpose,
		provider: intent.provider,
		rail: intent.rail,
		packId: intent.packId || null,
		quoteId: intent.quoteId || null,
		requestedCredits: intent.requestedCredits,
		requestedAmountUsd: intent.requestedAmountUsd,
		providerReferenceId: intent.providerReferenceId || null,
		providerStatus: intent.providerStatus || null,
		creditedCredits: intent.creditedCredits,
		state: intent.state,
		status: intent.status || intent.state,
		createdAt: intent.createdAt,
		updatedAt: intent.updatedAt,
	}
}

function payramUrlFromIntent(intent = {}) {
	const url = String(intent.metadata?.payramPaymentUrl || '').trim()
	return url ? validatePayramPaymentUrl(url, intent.providerReferenceId) : null
}

function continuationFor(intent = {}) {
	return paymentIntentContinuation(intent)
}

function wantsHtml(req) {
	const accept = String(req.headers.accept || '')
	const contentType = String(req.headers['content-type'] || '')
	return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded')
}

function htmlEscape(value) {
	return String(value ?? '').replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[character]))
}

function promoCreditGrantedHtml(result = {}) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BetterPPTX credits added</title></head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem"><h1>BetterPPTX credits added</h1><p>${htmlEscape(result.creditedCredits || 0)} credits were added to this installation. You can return to the AI client and retry the requested operation.</p></body></html>`
}

function providerEventId(prefix, referenceId, state, payload = {}) {
	return `${prefix}_${crypto.createHash('sha256').update(`${referenceId}:${state}:${hashPayload(payload)}`).digest('hex').slice(0, 32)}`
}

function extractReferenceId(value = {}) {
	const keys = ['reference_id', 'referenceID', 'referenceId'].some(key => value[key] !== undefined)
		? ['reference_id', 'referenceID', 'referenceId'] : ['invoice_id', 'invoiceID', 'id']
	const refs = keys.filter(key => value[key] !== undefined).map(key => value[key])
	if (refs.some(ref => typeof ref !== 'string' || ref.length > 256 || !ref.trim() || ref.trim() !== refs[0].trim())) throw new PayRamClientError('PAYRAM_REQUEST_INVALID', 'Payment reference is invalid.')
	return refs[0]?.trim() || ''
}

function identityFromRequest(req, requestInstallIdentity) {
	const envelopeToken = String(req.body?.token || req.query?.token || '').trim()
	if (envelopeToken) {
		const envelope = verifyPaymentEnvelope(envelopeToken, { purpose: 'topup' })
		return { installHash: envelope.installHash, customerHash: envelope.installHash, envelopeJti: envelope.jti, packId: envelope.packId || '', intentId: envelope.metadata?.intentId || '' }
	}
	const identity = requestInstallIdentity(req)
	if (!identity?.installHash) throw new PayRamClientError('PAYRAM_IDENTITY_REQUIRED', 'A billing identity is required.')
	return { installHash: identity.installHash, customerHash: identity.installHash, envelopeJti: '' }
}

function isPayramIntent(intent) {
	return intent?.provider === 'payram' && intent.productId === PRODUCT_ID && intent.purpose === 'credit_topup'
}

function authorizedIntent(intent, identity) {
	return isPayramIntent(intent) && intent.customerHash === identity.customerHash
		&& (!identity.packId || identity.packId === intent.packId)
		&& (!identity.intentId || identity.intentId === intent.intentId)
}

function notFound(res) {
	return res.status(404).json({ error: { code: 'PAYRAM_INTENT_NOT_FOUND', message: 'PayRam payment intent was not found.' } })
}

function sendCheckout(req, res, intent, idempotent) {
	const paymentUrl = payramUrlFromIntent(intent)
	const continuation = continuationFor(intent)
	if (wantsHtml(req)) {
		if (paymentUrl) return res.redirect(303, continuation.startUrl)
		return res.status(202).type('html').send(`<!doctype html><html lang="en"><title>Payment verification pending</title><p>Your checkout is being verified. Please keep this payment request for recovery.</p><a href="${htmlEscape(continuation.statusUrl)}">Check payment status</a></html>`)
	}
	return res.status(paymentUrl ? (idempotent ? 200 : 201) : 202).json({ ok: true, idempotent, intent: publicIntentResponse(intent), ...continuation, paymentUrl })
}

async function findOpenPayramIntent(store, { customerHash, pack }) {
	const intents = await store.listOpenIntents({ limit: Number(process.env.BETTERPPTX_PAYRAM_OPEN_INTENT_SCAN_LIMIT || 100) })
	return intents.find(intent =>
		isPayramIntent(intent)
		&& intent.customerHash === customerHash
		&& intent.packId === pack.id
		&& intent.requestedCredits === pack.credits
		&& intent.requestedAmountUsd === pack.priceUsdc
		&& intent.metadata?.mode === 'fixed_credit_pack'
		&& !intent.metadata?.promoRedemptionId
		&& OPEN_PAYRAM_STATES.has(intent.state)
	) || null
}

function payramErrorStatus(error) {
	const code = String(error?.code || '')
	if (code === 'BILLING_SETUP_INCOMPLETE') return 503
	if (code === 'PAYRAM_INTENT_NOT_FOUND') return 404
	if (code === 'PAYRAM_SCOPE_MISMATCH' || code === 'PROMO_ISSUANCE_SCOPE_REQUIRED') return 403
	if (code === 'PAYRAM_IDENTITY_REQUIRED' || code.startsWith('INSTALL_IDENTITY_') || (code.startsWith('PAYMENT_ENVELOPE_') && code !== 'PAYMENT_ENVELOPE_SECRET_MISSING')) return 401
	if (code === 'PAYMENT_INTENT_IDEMPOTENCY_CONFLICT' || code === 'PROMO_REDEMPTION_CONFLICT' || code === 'PROMO_REDEMPTION_RELEASED') return 409
	if (code === 'PAYRAM_REQUEST_INVALID' || code === 'PAYMENT_INTENT_ID_INVALID') return 400
	if (code === 'PAYRAM_NOT_CONFIGURED') return 503
	if (code === 'PAYRAM_CUSTOMER_EMAIL_MISSING' || code === 'PAYRAM_CUSTOMER_ID_MISSING' || code === 'PAYRAM_AMOUNT_INVALID'
		|| code === 'PROMO_CODE_INVALID' || code === 'PROMO_CODE_NOT_FOUND' || code === 'PROMO_CODE_NOT_ACTIVE'
		|| code === 'PROMO_CODE_EXPIRED' || code === 'PROMO_CODE_NOT_ELIGIBLE' || code === 'PROMO_CODE_EXHAUSTED'
		|| code === 'PROMO_CODE_ALREADY_REDEEMED' || code === 'PROMO_CUSTOMER_REQUIRED') return 400
	if (code === 'CRYPTO_PACK_NOT_FOUND') return 404
	if (code === 'PAYRAM_TIMEOUT' || code === 'PAYRAM_NETWORK_ERROR') return 503
	return error instanceof PayRamClientError ? 502 : 500
}

function sendPayramError(res, error) {
	const status = payramErrorStatus(error)
	return res.status(status).json({
		error: {
			code: error?.code || 'PAYRAM_ROUTE_FAILED',
			message: status >= 500 ? 'PayRam payment rail is temporarily unavailable.' : error?.message || 'PayRam request is invalid.',
		},
	})
}

async function creditVerifiedPayramIntent({ intent, status, store, ledger }) {
	if (!status.creditable) return { credited: false, intent }
	const amountCredits = Math.max(0, Math.floor(Number(intent.requestedCredits) || 0))
	if (amountCredits <= 0) return { credited: false, intent }
	const referenceId = status.referenceId || intent.providerReferenceId
	const creditEventId = `credit_payram_${crypto.createHash('sha256').update(String(referenceId)).digest('hex').slice(0, 32)}`
	const existingCredit = await store.getCreditEvent(creditEventId)
	if (existingCredit && (existingCredit.intentId !== intent.intentId || existingCredit.customerHash !== intent.customerHash || existingCredit.amountCredits !== amountCredits)) throw new PayRamClientError('PAYRAM_RESPONSE_INVALID', 'Payment credit evidence is inconsistent.')
	// Preserve historical proof on retry; new credits use stable settlement
	// identity, while changing status/fee observations remain separate events.
	const proofRef = existingCredit?.proofRef || {
		provider: 'payram',
		referenceId,
		intentId: intent.intentId,
		productId: PRODUCT_ID,
	}
	const promoRedemptionId = String(intent.metadata?.promoRedemptionId || '').trim()
	if (promoRedemptionId) await completePromoRedemption(promoRedemptionId, { intentId: intent.intentId, creditEventId }, { env: process.env })
	await ledger.creditCustomer({
		eventId: creditEventId,
		customerHash: intent.customerHash,
		source: 'payram_settlement',
		amountCredits,
		proofRef,
		metadata: {
			intentId: intent.intentId,
			packId: intent.packId,
			providerFilledAmountUsd: status.providerFilledAmountUsd,
			providerNetReceivedUsd: status.providerNetReceivedUsd,
			providerFeeUsd: status.providerFeeUsd,
		},
	})
	// Mark credited only after the durable ledger grant succeeds. If either
	// write loses its response, the immutable event id makes recovery safe.
	const credited = await store.creditIntent({ intentId: intent.intentId, creditEventId, amountCredits, proofRef })
	return { credited: !credited.idempotent, intent: credited.intent, creditEvent: credited.creditEvent }
}

async function refreshPayramIntent({ intent, store, ledger, fetchFn }) {
	if (!isPayramIntent(intent)) throw new PayRamClientError('PAYRAM_INTENT_NOT_FOUND', 'PayRam payment intent was not found.')
	if (!intent?.providerReferenceId) {
		throw new PayRamClientError('PAYRAM_REFERENCE_ID_MISSING', 'Missing PayRam reference id.', {})
	}
	const status = await getPayramPaymentStatus(intent.providerReferenceId, {
		fetchFn, expectedCustomerId: productCustomerId(intent.customerHash), expectedAmountUsd: intent.requestedAmountUsd,
	})
	await store.recordProviderEvent({
		intentId: intent.intentId,
		eventId: providerEventId('payram_status', intent.providerReferenceId, status.providerStatus, status),
		provider: 'payram',
		providerReferenceId: intent.providerReferenceId,
		eventType: 'status',
		providerStatus: status.providerStatus,
		state: status.state === 'paid' ? 'paid' : status.state,
		payload: {
			referenceId: status.referenceId,
			providerStatus: status.providerStatus,
			amountInUSD: status.amountInUSD,
			providerFilledAmountUsd: status.providerFilledAmountUsd,
			providerNetReceivedUsd: status.providerNetReceivedUsd,
			providerFeeUsd: status.providerFeeUsd,
			rawStatusHash: status.rawStatusHash,
		},
	})
	const updated = await store.updateIntent(intent.intentId, {
		providerStatus: status.providerStatus,
		providerFilledAmountUsd: status.providerFilledAmountUsd,
		providerNetReceivedUsd: status.providerNetReceivedUsd,
		providerFeeUsd: status.providerFeeUsd,
		state: status.state === 'paid' ? 'paid' : status.state,
	})
	const credited = await creditVerifiedPayramIntent({ intent: updated, status, store, ledger })
	const promoRedemptionId = String(updated.metadata?.promoRedemptionId || '').trim()
	if (promoRedemptionId) {
		if (status.cancelled) {
			await releasePromoRedemption(promoRedemptionId, 'payram_payment_cancelled', { env: process.env })
		}
	}
	return { intent: credited.intent || updated, status, credited: credited.credited === true }
}

export function registerPayRamRoutes(app, {
	requestInstallIdentity,
	store = null,
	ledger = null,
	fetchFn = null,
} = {}) {
	if (typeof requestInstallIdentity !== 'function') {
		throw new Error('registerPayRamRoutes requires requestInstallIdentity.')
	}
	if (String(process.env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'pay_per_job') {
		return { enabled: false, reason: 'pay-per-job-mode', paymentModel: 'one_payment_per_job' }
	}
	store ||= createPaymentIntentStore()
	ledger ||= createBillingLedgerStore()

	app.post('/pay/payram/intents', async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		try {
			const identity = identityFromRequest(req, requestInstallIdentity)
			assertProductionBillingConfiguration()
			const pack = packById(req.body?.packId || req.body?.pack || req.query?.pack)
			if ((identity.packId && identity.packId !== pack.id) || (identity.intentId && req.body?.intentId && identity.intentId !== req.body.intentId)) throw new PayRamClientError('PAYRAM_SCOPE_MISMATCH', 'Payment link does not authorize this purchase.')
			const requestedIntentId = req.body?.intentId || identity.intentId || undefined
			const idempotencyKey = req.body?.idempotencyKey || req.body?.idempotency_key || ''
			if (typeof idempotencyKey !== 'string' || idempotencyKey.length > 180) throw new PayRamClientError('PAYRAM_REQUEST_INVALID', 'Checkout idempotency key is invalid.')
			const promoCode = String(req.body?.promoCode || req.body?.promo || req.query?.promoCode || '').trim()
			if (promoCode) {
				const promoResult = await redeemPromoTopup({
					code: promoCode,
					packId: pack.id,
					customerHash: identity.customerHash,
					customerEmail: req.body?.customerEmail,
					idempotencyKey,
					intentId: requestedIntentId || '',
					env: process.env,
					payramFetch: fetchFn,
					ledger,
					paymentIntents: store,
				})
				if (wantsHtml(req)) {
					if (promoResult.paymentUrl) return res.redirect(303, promoResult.startUrl)
					if (promoResult.payment) return sendCheckout(req, res, promoResult.payment, true)
					return res.status(200).type('html').send(promoCreditGrantedHtml(promoResult))
				}
				return res.status(promoResult.paymentUrl ? (promoResult.idempotent ? 200 : 201) : promoResult.payment ? 202 : 200).json(promoResult)
			}
			const readiness = payramReadiness()
			if (!readiness.configured) {
				throw new PayRamClientError('PAYRAM_NOT_CONFIGURED', 'PayRam is not configured.', { missing: readiness.missing })
			}
			const checkoutInput = validatePayramPaymentInput({ customerEmail: req.body?.customerEmail, customerId: productCustomerId(identity.customerHash), amountUsd: pack.priceUsdc })
			const resolvedIntentId = requestedIntentId || (idempotencyKey.trim() ? `pi_checkout_${hashPayload({ productId: PRODUCT_ID, customerHash: identity.customerHash, idempotencyKey: idempotencyKey.trim() }).slice(0, 32)}` : undefined)
			const existing = !resolvedIntentId ? await findOpenPayramIntent(store, { customerHash: identity.customerHash, pack }) : null
			if (existing) {
				return sendCheckout(req, res, existing, true)
			}
			const created = await store.createIntent({
				intentId: resolvedIntentId,
				reuseOpenKey: hashPayload({ productId: PRODUCT_ID, customerHash: identity.customerHash, packId: pack.id, amount: pack.priceUsdc, mode: 'fixed_credit_pack' }),
				installHash: identity.installHash,
				productId: PRODUCT_ID,
				customerHash: identity.customerHash,
				purpose: 'credit_topup',
				provider: 'payram',
				rail: 'payram_card_onramp',
				packId: pack.id,
				requestedCredits: pack.credits,
				requestedAmountUsd: pack.priceUsdc,
				requestedAmountUsdc: pack.priceUsdc,
				minimumCreditableUsd: pack.priceUsdc,
				customerEmail: req.body?.customerEmail,
				state: 'provider_pending',
				metadata: {
					mode: 'fixed_credit_pack',
					envelopeJti: identity.envelopeJti || null,
				},
			})
			if (created.idempotent) return sendCheckout(req, res, created.intent, true)
			let payment
			try {
				payment = await createPayramPayment(checkoutInput, { fetchFn })
			} catch (error) {
				await store.updateIntent(created.intent.intentId, { state: 'verification_pending' }).catch(() => {})
				throw error
			}
			const initialProviderStatus = payment.providerStatus && payment.providerStatus !== 'UNKNOWN' ? payment.providerStatus : 'OPEN'
			const updated = await store.updateIntent(created.intent.intentId, {
				providerReferenceId: payment.referenceId,
				providerStatus: initialProviderStatus,
				state: 'awaiting_customer_completion',
				metadata: {
					...(created.intent.metadata || {}),
					payramPaymentUrl: payment.url,
				},
			})
			await store.recordProviderEvent({
				intentId: updated.intentId,
				eventId: `payram_create_${crypto.createHash('sha256').update(payment.referenceId).digest('hex').slice(0, 32)}`,
				provider: 'payram',
				providerReferenceId: payment.referenceId,
				eventType: 'create_payment',
				providerStatus: initialProviderStatus,
				state: 'awaiting_customer_completion',
				payload: {
					referenceId: payment.referenceId,
					amountInUSD: payment.amountInUSD,
				},
			})
			return sendCheckout(req, res, updated, false)
		} catch (error) {
			return sendPayramError(res, error)
		}
	})

	app.get('/pay/payram/intents/:intentId/start', async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		res.setHeader('Referrer-Policy', 'no-referrer')
		try {
			const identity = identityFromRequest(req, requestInstallIdentity)
			const intent = await store.getIntent(req.params.intentId)
			if (!authorizedIntent(intent, identity)) return notFound(res)
			assertProductionBillingConfiguration()
			const paymentUrl = payramUrlFromIntent(intent)
			if (!paymentUrl) return res.status(409).json({ error: { code: 'PAYRAM_PAYMENT_URL_MISSING', message: 'PayRam payment URL is not available.' } })
			return res.redirect(303, paymentUrl)
		} catch (error) {
			return sendPayramError(res, error)
		}
	})

	app.get('/pay/payram/intents/:intentId/status', async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		try {
			const identity = identityFromRequest(req, requestInstallIdentity)
			const intent = await store.getIntent(req.params.intentId)
			if (!authorizedIntent(intent, identity)) return notFound(res)
			if (!intent.providerReferenceId) return res.json({ ok: true, intent: publicIntentResponse(intent), status: null, credited: false })
			const refreshed = await refreshPayramIntent({ intent, store, ledger, fetchFn })
			return res.json({ ok: true, intent: publicIntentResponse(refreshed.intent), status: refreshed.status, credited: refreshed.credited })
		} catch (error) {
			if (error?.code === 'PAYRAM_TIMEOUT' || error?.code === 'PAYRAM_NETWORK_ERROR') {
				try {
					const intent = await store.getIntent(req.params.intentId)
					if (intent) await store.updateIntent(intent.intentId, { state: 'verification_pending' })
				} catch {}
			}
			return sendPayramError(res, error)
		}
	})

	app.get('/pay/payram/return', async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		const intentId = String(req.query.intentId || '').trim()
		try {
			const identity = identityFromRequest(req, requestInstallIdentity)
			const referenceId = extractReferenceId(req.query || {})
			const intent = intentId
				? await store.getIntent(intentId)
				: referenceId
					? await store.getIntentByProviderReference('payram', referenceId)
					: null
			if (!authorizedIntent(intent, identity) || (referenceId && referenceId !== intent.providerReferenceId)) return notFound(res)
			return res.json({ ok: true, intent: publicIntentResponse(intent), ...continuationFor(intent) })
		} catch (error) {
			return sendPayramError(res, error)
		}
	})

	async function handleWebhook(req, res) {
		res.setHeader('Cache-Control', 'no-store')
		// PayRam sends the project API key as API-Key. Internal reconcile callers
		// still use BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN (or its configured
		// scanner/reconcile equivalent) and cannot use the provider key.
		const payramApiKey = String(process.env.BETTERPPTX_PAYRAM_API_KEY || '').trim()
		const suppliedApiKey = String(req.headers['api-key'] || '').trim()
		const webhookToken = String(
			req.headers['x-betterpptx-payram-token']
			|| req.headers['x-betterpptx-webhook-token']
			|| bearerToken(req)
			|| (process.env.BETTERPPTX_PAYRAM_ALLOW_QUERY_TOKEN === '1' ? req.query?.token : '')
			|| '',
		).trim()
		const configuredInternalToken = String(
			process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN
			|| process.env.BETTERPPTX_PAYRAM_RECONCILE_TOKEN
			|| process.env.BETTERPPTX_SCANNER_TOKEN
			|| '',
		).trim()
		if (!(tokensEqual(payramApiKey, suppliedApiKey) || tokensEqual(configuredInternalToken, webhookToken))) {
			res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } })
			return
		}
		const payload = req.method === 'GET' ? req.query || {} : req.body || {}
		let referenceId
		try { referenceId = extractReferenceId(payload) } catch (error) { return sendPayramError(res, error) }
		if (!referenceId) return res.status(400).json({ error: { code: 'PAYRAM_REFERENCE_ID_MISSING', message: 'Missing PayRam reference id.' } })
		// Shared-gateway product isolation: reject references that explicitly belong to another product.
		const payloadCustomerId = String(payload.customerID || payload.customerId || payload.customer_id || '').trim()
		const refHash = crypto.createHash('sha256').update(referenceId).digest('hex').slice(0, 12)
		if (payloadCustomerId && isForeignProductCustomerId(payloadCustomerId)) {
			console.warn(`[payram-webhook] rejected cross-product reference product=${productFromCustomerId(payloadCustomerId)} refHash=${refHash}`)
			return res.status(409).json({ error: { code: 'PAYRAM_CROSS_PRODUCT_REFERENCE', message: 'Reference belongs to a different product.' } })
		}
		try {
			const intent = await store.getIntentByProviderReference('payram', referenceId)
			if (!isPayramIntent(intent) || intent.providerReferenceId !== referenceId) {
				console.warn(`[payram-webhook] unmatched reference not in ${PRODUCT_ID} store refHash=${refHash}`)
				return res.status(202).json({ ok: true, accepted: true, matched: false })
			}
			if (['customerID', 'customerId', 'customer_id'].some(key => payload[key] !== undefined && payload[key] !== productCustomerId(intent.customerHash))) return res.status(409).json({ error: { code: 'PAYRAM_CUSTOMER_MISMATCH', message: 'Payment customer does not match.' } })
			const observation = { referenceId, notification: 'status_recheck_requested' }
			await store.recordProviderEvent({
				intentId: intent.intentId,
				eventId: providerEventId('payram_webhook', referenceId, 'notification', observation),
				provider: 'payram',
				providerReferenceId: referenceId,
				eventType: 'webhook',
				payload: observation,
			})
			const refreshed = await refreshPayramIntent({ intent, store, ledger, fetchFn })
			return res.json({ ok: true, accepted: true, matched: true, intent: publicIntentResponse(refreshed.intent), credited: refreshed.credited })
		} catch (error) {
			if (error?.code === 'PAYRAM_TIMEOUT' || error?.code === 'PAYRAM_NETWORK_ERROR') {
				try {
					const intent = await store.getIntentByProviderReference('payram', referenceId)
					if (intent) await store.updateIntent(intent.intentId, { state: 'verification_pending' })
				} catch {}
			}
			return sendPayramError(res, error)
		}
	}

	app.get('/internal/payments/payram/webhook', handleWebhook)
	app.post('/internal/payments/payram/webhook', handleWebhook)

	app.post('/internal/payments/payram/reconcile', async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		if (!requireInternalToken(req, res)) return
		try {
			const intents = await store.listOpenIntents({ limit: Math.max(1, Math.min(500, Number(req.body?.limit || 100))) })
			const payram = intents.filter(intent => isPayramIntent(intent) && intent.providerReferenceId && OPEN_PAYRAM_STATES.has(intent.state))
			const summary = { scanned: 0, credited: 0, pending: 0, failed: 0 }
			for (const intent of payram) {
				summary.scanned += 1
				try {
					const refreshed = await refreshPayramIntent({ intent, store, ledger, fetchFn })
					if (refreshed.credited) summary.credited += 1
					if (!refreshed.credited && refreshed.intent.state !== 'credited') summary.pending += 1
				} catch (error) {
					summary.failed += 1
					if (error?.code === 'PAYRAM_TIMEOUT' || error?.code === 'PAYRAM_NETWORK_ERROR') {
						try { await store.updateIntent(intent.intentId, { state: 'verification_pending' }) } catch {}
					}
				}
			}
			return res.json({ ok: true, summary })
		} catch (error) {
			return sendPayramError(res, error)
		}
	})
}
