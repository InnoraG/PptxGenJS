import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'payram-routes', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_PAYMENT_INTENT_STORE = 'local'
process.env.BETTERPPTX_PAYMENT_INTENT_FILE = path.join(outputDir, 'payment-intents.json')
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(outputDir, 'ledger.json')
process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local'
process.env.BETTERPPTX_CRYPTO_ORDER_FILE = path.join(outputDir, 'orders.json')
process.env.BETTERPPTX_X402_STORE = 'local'
process.env.BETTERPPTX_X402_FILE = path.join(outputDir, 'quotes.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-payram-routes-envelope-0123456789abcdef'
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'verify-payram-routes-install-0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_ENABLED = '1'
process.env.BETTERPPTX_PAYRAM_BASE_URL = 'https://payram.example.test'
process.env.BETTERPPTX_PAYRAM_API_KEY = 'payram_route_key_0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN = 'payram_route_webhook_0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_TIMEOUT_MS = '1000'
process.env.BETTERPPTX_ALLOW_LOCAL_PAYMENT_HTTP = '1'

const { generateInstallToken, hashInstallToken } = await import('./auth/install-identity.mjs')
const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { mintPaymentEnvelope } = await import('./billing/payment-envelope.mjs')
const { startBetterPptxHttp } = await import('./server-http.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function freePort() {
	const server = net.createServer()
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const port = server.address().port
	await new Promise(resolve => server.close(resolve))
	return port
}

function jsonResponse(data, { status = 200, ok = status >= 200 && status < 300 } = {}) {
	return {
		status,
		ok,
		text: async () => JSON.stringify(data),
	}
}

const createCalls = []
const statusCalls = []
const payramStatusByReference = new Map()
let referenceCounter = 0
async function payramFetch(url, options) {
	if (url.endsWith('/api/v1/payment')) {
		referenceCounter += 1
		const referenceId = `payram_route_ref_${referenceCounter}`
		createCalls.push({ url, options, body: JSON.parse(options.body) })
		payramStatusByReference.set(referenceId, {
			referenceID: referenceId,
			paymentState: 'OPEN',
			amountInUSD: '5',
			filled_amount_in_usd: 0,
		})
		return jsonResponse({
			host: 'https://payram.example.test',
			reference_id: referenceId,
			url: `https://payram.example.test/payments?reference_id=${referenceId}`,
		})
	}
	const match = url.match(/\/api\/v1\/payment\/reference\/([^/?#]+)/)
	if (match) {
		const referenceId = decodeURIComponent(match[1])
		statusCalls.push({ url, options, referenceId })
		return jsonResponse(payramStatusByReference.get(referenceId) || {
			referenceID: referenceId,
			paymentState: 'OPEN',
			amountInUSD: '5',
		})
	}
	throw new Error(`Unexpected PayRam URL: ${url}`)
}

const port = await freePort()
const base = `http://127.0.0.1:${port}`
process.env.BETTERPPTX_PUBLIC_BASE = base
process.env.BETTERPPTX_PAYMENT_BASE_URL = base
const server = await startBetterPptxHttp({
	host: '127.0.0.1',
	port,
	open: true,
	publicBase: base,
	downloadRoot: path.join(outputDir, 'downloads'),
	payramFetch,
})

try {
	const device = generateInstallToken()
	const createResponse = await fetch(`${base}/pay/payram/intents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-device': device,
		},
		body: JSON.stringify({
			packId: 'starter_500',
			customerEmail: 'Buyer@Example.com',
		}),
	})
	const created = await createResponse.json()
	expect(createResponse.status === 201 && created.ok === true, 'PayRam intent create should succeed.', { status: createResponse.status, created })
	expect(created.intent.provider === 'payram' && created.intent.rail === 'payram_card_onramp', 'Created intent should be PayRam card rail.', { created })
	expect(created.intent.state === 'awaiting_customer_completion', 'Created intent should wait for customer completion.', { created })
	expect(created.paymentUrl.includes('payram_route_ref_1'), 'Create response should include PayRam payment URL.', { created })
	expect(createCalls.length === 1, 'PayRam create API should be called exactly once.', { createCalls })
expect(JSON.stringify(createCalls[0].body) === JSON.stringify({
	customerEmail: 'Buyer@Example.com',
	customerID: createCalls[0].body.customerID,
	amountInUSD: 5,
}), 'PayRam create request body should use documented fields.', { body: createCalls[0].body, created })
expect(/^betterpptx:install_[a-f0-9]{64}$/.test(createCalls[0].body.customerID), 'PayRam customerID should be a product-prefixed pseudonymous install hash.', { body: createCalls[0].body })
	expect(!JSON.stringify(created).includes('Buyer@Example.com'), 'Public route response leaked raw email.', { created })

	const formDevice = generateInstallToken()
	const formInstallHash = hashInstallToken(formDevice)
	const formToken = mintPaymentEnvelope({ installHash: formInstallHash, purpose: 'topup' })
	const packPageResponse = await fetch(`${base}/pay/orders/new?token=${encodeURIComponent(formToken)}`, {
		headers: { Accept: 'text/html' },
	})
	const packPage = await packPageResponse.text()
	expect(packPageResponse.status === 200 && packPage.includes('Add BetterPPTX credits by card'), 'Pack page should show card top-up when PayRam is configured.', { status: packPageResponse.status })
	expect(packPage.includes('Fund local companion wallet') && packPage.includes('action="/pay/payram/intents"'), 'Pack page should keep crypto rails and include the PayRam form.', {})
	expect(!packPage.includes(formInstallHash), 'Pack page must not expose raw install hash.', {})

	const formResponse = await fetch(`${base}/pay/payram/intents`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'text/html',
		},
		body: new URLSearchParams({
			token: formToken,
			packId: 'starter_500',
			customerEmail: 'FormBuyer@Example.com',
		}).toString(),
	})
	expect(formResponse.status === 303 && /^\/pay\/payram\/intents\/pi_[a-f0-9]+\/start$/.test(formResponse.headers.get('location') || ''), 'PayRam browser form should redirect to the start route.', { status: formResponse.status, location: formResponse.headers.get('location') })
	expect(createCalls.length === 2, 'PayRam browser form should create one additional PayRam payment.', { createCalls })

	const duplicateResponse = await fetch(`${base}/pay/payram/intents`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-device': device,
		},
		body: JSON.stringify({
			packId: 'starter_500',
			customerEmail: 'Buyer@Example.com',
		}),
	})
	const duplicate = await duplicateResponse.json()
	expect(duplicateResponse.status === 200 && duplicate.idempotent === true, 'Open PayRam intent should return continuation instead of creating a second payment.', { duplicate })
	expect(duplicate.intent.intentId === created.intent.intentId && duplicate.paymentUrl === created.paymentUrl, 'Continuation should reference the same intent and PayRam URL.', { duplicate, created })
	expect(createCalls.length === 2, 'Duplicate open intent must not call PayRam create again.', { createCalls })

	const startResponse = await fetch(`${base}${created.startUrl}`, { redirect: 'manual' })
	expect(startResponse.status === 303 && startResponse.headers.get('location') === created.paymentUrl, 'Start route should redirect to PayRam payment URL.', { status: startResponse.status, location: startResponse.headers.get('location'), created })

	const invalidWebhook = await fetch(`${base}/internal/payments/payram/webhook?reference_id=payram_route_ref_1`, { method: 'GET' })
	expect(invalidWebhook.status === 401, 'Webhook should reject missing token.', { status: invalidWebhook.status })

	const earlyWebhook = await fetch(`${base}/internal/payments/payram/webhook?reference_id=payram_route_ref_1&status=FILLED&amount=5`, {
		method: 'GET',
		headers: { 'x-betterpptx-payram-token': process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN },
	})
	const early = await earlyWebhook.json()
	expect(earlyWebhook.status === 200 && early.matched === true && early.credited === false, 'Webhook must not credit from webhook payload alone when status API remains OPEN.', { early })

	let statusResponse = await fetch(`${base}${created.statusUrl}`)
	let statusBody = await statusResponse.json()
	expect(statusResponse.status === 200 && statusBody.intent.state === 'open' && statusBody.credited === false, 'Status route should reflect verified OPEN state without credit.', { statusBody })

	payramStatusByReference.set('payram_route_ref_1', {
		referenceID: 'payram_route_ref_1',
		paymentState: 'FILLED',
		amountInUSD: '5',
		filled_amount_in_usd: 5,
		fee_in_usd: 0.12,
	})
	const paidWebhook = await fetch(`${base}/internal/payments/payram/webhook`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-payram-token': process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN,
		},
		body: JSON.stringify({
			reference_id: 'payram_route_ref_1',
			status: 'FILLED',
			amount: '5',
		}),
	})
	const paid = await paidWebhook.json()
	expect(paidWebhook.status === 200 && paid.credited === true && paid.intent.state === 'credited', 'Verified FILLED webhook should credit once.', { paid })

	const duplicatePaidWebhook = await fetch(`${base}/internal/payments/payram/webhook`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-payram-token': process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN,
		},
		body: JSON.stringify({
			reference_id: 'payram_route_ref_1',
			status: 'FILLED',
			amount: '5',
		}),
	})
	const duplicatePaid = await duplicatePaidWebhook.json()
	expect(duplicatePaidWebhook.status === 200 && duplicatePaid.intent.creditedCredits === 500, 'Duplicate webhook should not double-credit the intent.', { duplicatePaid })

	statusResponse = await fetch(`${base}${created.statusUrl}`)
	statusBody = await statusResponse.json()
	expect(statusBody.intent.creditedCredits === 500 && statusBody.intent.providerFilledAmountUsd === undefined, 'Public intent response should stay compact and credited.', { statusBody })

	const ledger = createBillingLedgerStore()
	const customer = await ledger.getCustomer(createCalls[0].body.customerID.replace('betterpptx:', ''))
	expect(customer.availableBalanceCredits === 500, 'PayRam settlement should credit the BetterPPTX ledger once.', { customer })

	const storeText = fs.readFileSync(process.env.BETTERPPTX_PAYMENT_INTENT_FILE, 'utf8')
	expect(!storeText.includes('Buyer@Example.com') && !storeText.includes(process.env.BETTERPPTX_PAYRAM_API_KEY), 'Payment intent route store leaked raw email or API key.', {})
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}

console.log('PAYRAM ROUTES: PASS create=1 continuation=1 redirect=1 webhookAuth=1 statusRecheck=1 creditOnce=1 ledger=1')
