import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'payram-reconciler', `run-${Date.now()}-${process.pid}`)
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
process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-payram-reconcile-envelope-0123456789abcdef'
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'verify-payram-reconcile-install-0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_ENABLED = '1'
process.env.BETTERPPTX_PAYRAM_BASE_URL = 'https://payram.example.test'
process.env.BETTERPPTX_PAYRAM_API_KEY = 'payram_reconcile_key_0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN = 'payram_reconcile_token_0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_TIMEOUT_MS = '1000'

const { generateInstallToken } = await import('./auth/install-identity.mjs')
const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { createPaymentIntentStore } = await import('./billing/payment-intents.mjs')
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

function jsonResponse(data) {
	return { status: 200, ok: true, text: async () => JSON.stringify(data) }
}

let referenceCounter = 0
const refs = []
const statusByRef = new Map()
const statusCalls = []

async function payramFetch(url, options) {
	if (url.endsWith('/api/v1/payment')) {
		referenceCounter += 1
		const referenceId = `payram_reconcile_ref_${referenceCounter}`
		refs.push(referenceId)
		statusByRef.set(referenceId, {
			referenceID: referenceId,
			paymentState: 'OPEN',
			amountInUSD: '5',
			filled_amount_in_usd: 0,
		})
		return jsonResponse({
			reference_id: referenceId,
			url: `https://payram.example.test/payments?reference_id=${referenceId}`,
		})
	}
	const match = url.match(/\/api\/v1\/payment\/reference\/([^/?#]+)/)
	if (!match) throw new Error(`Unexpected PayRam URL: ${url}`)
	const referenceId = decodeURIComponent(match[1])
	statusCalls.push({ referenceId, method: options.method })
	const value = statusByRef.get(referenceId)
	if (value === 'network_error') throw new Error('simulated PayRam outage')
	return jsonResponse(value || {
		referenceID: referenceId,
		paymentState: 'OPEN',
		amountInUSD: '5',
	})
}

async function createPayramIntent(base, device) {
	const response = await fetch(`${base}/pay/payram/intents`, {
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
	const body = await response.json()
	expect(response.status === 201, 'PayRam intent creation failed in reconciler verifier.', { status: response.status, body })
	return body
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
	const first = await createPayramIntent(base, generateInstallToken())
	const second = await createPayramIntent(base, generateInstallToken())
	expect(refs.length === 2 && first.intent.intentId !== second.intent.intentId, 'Verifier should create two independent PayRam intents.', { refs, first, second })

	statusByRef.set(refs[0], {
		referenceID: refs[0],
		paymentState: 'FILLED',
		amountInUSD: '5',
		filled_amount_in_usd: 5,
	})
	statusByRef.set(refs[1], 'network_error')

	const unauthorized = await fetch(`${base}/internal/payments/payram/reconcile`, { method: 'POST' })
	expect(unauthorized.status === 401, 'Reconciler must require its internal token.', { status: unauthorized.status })

	const reconcile = await fetch(`${base}/internal/payments/payram/reconcile`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-payram-token': process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN,
		},
		body: JSON.stringify({ limit: 10 }),
	})
	const body = await reconcile.json()
	expect(reconcile.status === 200 && body.summary.scanned === 2, 'Reconciler should scan both open PayRam intents.', { body })
	expect(body.summary.credited === 1 && body.summary.failed === 1, 'Reconciler should credit filled status and record unavailable status as failed.', { body })

	const store = createPaymentIntentStore()
	const firstStatus = await store.getIntent(first.intent.intentId)
	const secondStatus = await store.getIntent(second.intent.intentId)
	expect(firstStatus.state === 'credited' && firstStatus.creditedCredits === 500, 'Filled PayRam intent should be credited by reconciler.', { firstStatus })
	expect(secondStatus.state === 'verification_pending', 'Unavailable PayRam status should leave the intent verification_pending.', { secondStatus })

	const ledger = createBillingLedgerStore()
	const ledgerSnapshot = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, 'utf8'))
	expect(Object.keys(ledgerSnapshot.creditEvents || {}).length === 1, 'Ledger should contain one PayRam credit event after first reconcile.', { creditEvents: ledgerSnapshot.creditEvents })

	statusByRef.set(refs[1], {
		referenceID: refs[1],
		paymentState: 'OPEN',
		amountInUSD: '5',
		filled_amount_in_usd: 0,
	})
	const secondReconcile = await fetch(`${base}/internal/payments/payram/reconcile`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-payram-token': process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN,
		},
		body: JSON.stringify({ limit: 10 }),
	})
	const secondBody = await secondReconcile.json()
	expect(secondReconcile.status === 200 && secondBody.summary.credited === 0, 'Repeated reconciler should not double-credit already credited PayRam intent.', { secondBody })
	const firstCustomer = await ledger.getCustomer(JSON.parse(fs.readFileSync(process.env.BETTERPPTX_PAYMENT_INTENT_FILE, 'utf8')).intents[first.intent.intentId].customerHash)
	expect(firstCustomer.availableBalanceCredits === 500, 'Ledger balance should remain one PayRam pack after repeated reconcile.', { firstCustomer })
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}

console.log('PAYRAM RECONCILER: PASS externalTrigger=1 token=1 creditFilled=1 pendingOnTimeout=1 idempotent=1')
