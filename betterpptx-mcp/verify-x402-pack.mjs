import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'x402-verify', `run-${Date.now()}-${process.pid}`)
const quoteFile = path.join(outputDir, 'quotes.json')
const ledgerFile = path.join(outputDir, 'ledger.json')
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_X402_STORE = 'local'
process.env.BETTERPPTX_X402_FILE = quoteFile
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = ledgerFile
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x4000000000000000000000000000000000000001'
process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-x402-payment-envelope-0123456789abcdef'
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'verify-x402-install-secret-0123456789abcdef'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'

const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { generateInstallToken } = await import('./auth/install-identity.mjs')
const { mintPaymentEnvelope } = await import('./billing/payment-envelope.mjs')
const { startBetterPptxHttp } = await import('./server-http.mjs')
const { getBillingTelemetrySummary } = await import('./telemetry.mjs')
const {
	createX402QuoteStore,
	publicX402Quote,
	settleX402Quote,
} = await import('./billing/x402-packs.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function expectCode(code, fn) {
	try {
		await fn()
	} catch (error) {
		if (error?.code === code) return error
		throw error
	}
	throw new Error(`Expected ${code}.`)
}

async function freePort() {
	const server = net.createServer()
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const port = server.address().port
	await new Promise(resolve => server.close(resolve))
	return port
}

const store = createX402QuoteStore()
const ledger = createBillingLedgerStore()
const installHash = 'install_x402_verify'
const quote = await store.createQuote({
	installHash,
	packId: 'starter_500',
	envelopeJti: 'x402_envelope_1',
})
const publicQuote = publicX402Quote(quote)
expect(publicQuote.accepts[0].amount === '5000000', 'x402 quote should bind the configured pack amount.', { publicQuote })
expect(publicQuote.accepts[0].payTo === process.env.BETTERPPTX_TREASURY_EVM_ADDRESS.toLowerCase(), 'x402 quote should bind treasury.', { publicQuote })
expect(!JSON.stringify(publicQuote).includes(installHash), 'Public x402 quote exposed install identity.', { publicQuote })

await expectCode('PAYMENT_ENVELOPE_REPLAYED', () => store.createQuote({
	installHash,
	packId: 'starter_500',
	envelopeJti: 'x402_envelope_1',
}))

const calls = []
const facilitator = {
	async verify(input) {
		calls.push({ phase: 'verify', input })
		expect(input.paymentRequirements.quoteId === quote.quoteId, 'Facilitator verification received the wrong quote.', { input })
		expect(input.paymentRequirements.accepts[0].amount === '5000000', 'Client payload altered the stored quote amount.', { input })
		return { isValid: true, payer: 'redacted-by-verifier' }
	},
	async settle(input) {
		calls.push({ phase: 'settle', input })
		expect(calls[0].phase === 'verify', 'x402 settle ran before verify.', { calls })
		return { settlementId: 'settlement_x402_verify_1', network: 'eip155:8453' }
	},
}

const settled = await settleX402Quote({
	quoteId: quote.quoteId,
	paymentPayload: { amount: '1', packId: 'studio_5000', arbitraryClientEcho: true },
	store,
	ledger,
	facilitator,
})
expect(settled.creditedCredits === 500, 'x402 settlement must credit the stored pack, not client-echoed values.', { settled })
expect(calls.map(call => call.phase).join(',') === 'verify,settle', 'x402 facilitator ordering is invalid.', { calls })

let customer = await ledger.getCustomer(installHash)
expect(customer.availableBalanceCredits === 500, 'x402 settlement did not credit the provider-neutral ledger.', { customer })

const replay = await settleX402Quote({
	quoteId: quote.quoteId,
	paymentPayload: { replay: true },
	store,
	ledger,
	facilitator: {
		verify() { throw new Error('Facilitator should not run on settled replay.') },
		settle() { throw new Error('Facilitator should not run on settled replay.') },
	},
})
expect(replay.idempotent === true && replay.creditedCredits === 500, 'Settled x402 quote should replay idempotently.', { replay })
customer = await ledger.getCustomer(installHash)
expect(customer.availableBalanceCredits === 500, 'Settled x402 replay double-credited the install.', { customer })

const secondQuote = await store.createQuote({
	installHash: 'install_x402_verify_2',
	packId: 'starter_500',
	envelopeJti: 'x402_envelope_2',
})
await expectCode('BILLING_IDEMPOTENCY_CONFLICT', () => settleX402Quote({
	quoteId: secondQuote.quoteId,
	paymentPayload: {},
	store,
	ledger,
	facilitator: {
		verify: async () => ({ isValid: true }),
		settle: async () => ({ settlementId: 'settlement_x402_verify_1' }),
	},
}))

const port = await freePort()
const server = await startBetterPptxHttp({
	host: '127.0.0.1',
	port,
	open: true,
	publicBase: `http://127.0.0.1:${port}`,
	downloadRoot: path.join(outputDir, 'downloads'),
})
const base = `http://127.0.0.1:${port}`
try {
	const missingBinding = await fetch(`${base}/pay/x402/credit-packs/starter_500`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	})
	expect(missingBinding.status === 400, 'x402 route must reject missing install binding before returning payment requirements.', { status: missingBinding.status })

	const deviceToken = generateInstallToken()
	const headerQuote = await fetch(`${base}/pay/x402/credit-packs/starter_500`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-device': deviceToken,
		},
		body: '{}',
	})
	const headerQuoteBody = await headerQuote.json()
	expect(headerQuote.status === 402 && headerQuoteBody.accepts?.[0]?.amount === '5000000', 'x402 route should return stored pack requirements after device binding.', { status: headerQuote.status, headerQuoteBody })
	expect(!JSON.stringify(headerQuoteBody).includes(deviceToken) && !JSON.stringify(headerQuoteBody).includes('install_'), 'x402 requirements exposed install identity.', { headerQuoteBody })

	const envelope = mintPaymentEnvelope({ installHash: 'install_x402_http_envelope', purpose: 'topup' })
	const envelopeQuote = await fetch(`${base}/pay/x402/credit-packs/builder_1500?token=${encodeURIComponent(envelope)}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	})
	expect(envelopeQuote.status === 402, 'x402 route should accept an opaque install-bound envelope.', { status: envelopeQuote.status })
	const envelopeQuoteBody = await envelopeQuote.json()
	const envelopeReplay = await fetch(`${base}/pay/x402/credit-packs/builder_1500?token=${encodeURIComponent(envelope)}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	})
	const envelopeReplayBody = await envelopeReplay.json()
	expect(
		envelopeReplay.status === 402 && envelopeReplayBody.quoteId === envelopeQuoteBody.quoteId,
		'x402 route should return the original quote for an idempotent envelope retry.',
		{ status: envelopeReplay.status, envelopeQuoteBody, envelopeReplayBody },
	)
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}

const telemetry = getBillingTelemetrySummary()
expect(telemetry.creditedVolumeCredits === 500, 'x402 telemetry should record settled credit volume once.', { telemetry })
expect(telemetry.creditsBySource.x402_settlement === 500, 'x402 credit source telemetry is missing.', { telemetry })

console.log(`X402 PACK: PASS quote=${quote.quoteId} credits=${settled.creditedCredits} ordering=${calls.map(call => call.phase).join('>')} routeBinding=1`)
