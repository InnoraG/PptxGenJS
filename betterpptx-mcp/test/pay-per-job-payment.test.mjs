import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { after, test } from 'node:test'

for (const name of Object.keys(process.env)) if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-pay-per-job-fixture-'))
Object.assign(process.env, {
	BETTERPPTX_MONETIZED_MCP_ENABLED: '1',
	BETTERPPTX_BILLING_MODEL: 'pay_per_job',
	BETTERPPTX_AUTH: 'none',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_X402_STORE: 'local',
	BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_BILLING_LEDGER_FILE: path.join(directory, 'legacy-ledger.json'),
	BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(directory, 'leases'),
	BETTERPPTX_X402_FILE: path.join(directory, 'quotes.json'),
	BETTERPPTX_TREASURY_EVM_ADDRESS: '0x4000000000000000000000000000000000000001',
	BETTERPPTX_PAYMENT_ENVELOPE_SECRET: 'disposable-pay-per-job-fixture-secret-not-real',
	BETTERPPTX_BASE_SAFE_DEPTH: '2',
})
const nativeFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async () => { throw new Error('Network forbidden in pay-per-job fixtures') }

after(() => fs.rmSync(directory, { recursive: true, force: true }))

const { createX402QuoteStore } = await import('../billing/x402-packs.mjs')
const { listMonetizedMcpPrices, makeMonetizedMcpPurchase, getMonetizedMcpJobStatus } = await import('../billing/monetized-mcp-adapter.mjs')
const { publicBillingStatus } = await import('../billing/checkout.mjs')
const { registerPayRamRoutes } = await import('../billing/payram-routes.mjs')
const { startBetterPptxHttp } = await import('../server-http.mjs')
const { buildSpecPremiumPresentationQuote } = await import('../billing/premium-quote.mjs')
const { signPayment, fakeChain, fakeLedger } = await import('./fixtures/x402-security-fixtures.mjs')

function serializable(payment) {
	return JSON.parse(JSON.stringify(payment, (_key, value) => typeof value === 'bigint' ? value.toString() : value))
}

test('pay-per-job status and legacy PayRam registration do not create reusable-credit state', async () => {
	const status = await publicBillingStatus({ installHash: 'fixture-install' })
	assert.equal(status.billingModel, 'pay_per_job')
	assert.equal(status.balance.reusableProductBalance, false)
	assert.equal(status.balance.legacyBalanceRetainedForMigration, false)
	assert.equal(fs.existsSync(path.join(directory, 'legacy-ledger.json')), false)

	const registered = []
	const app = {
		get: (...args) => registered.push(['get', ...args]),
		post: (...args) => registered.push(['post', ...args]),
	}
	const result = registerPayRamRoutes(app, { requestInstallIdentity: () => ({ installHash: 'fixture-install' }) })
	assert.deepEqual(result, { enabled: false, reason: 'pay-per-job-mode', paymentModel: 'one_payment_per_job' })
	assert.equal(registered.length, 0)
})

test('pay-per-job HTTP boot does not require legacy stores or expose credit-pack routes', async () => {
	const started = await startBetterPptxHttp({
		host: '127.0.0.1',
		port: 0,
		open: true,
		downloadRoot: path.join(directory, 'downloads'),
	})
	try {
		const port = started.httpServer.address().port
		const health = await nativeFetch(`http://127.0.0.1:${port}/health`)
		assert.equal(health.status, 200)
		for (const request of [
			{ method: 'GET', path: '/pay/orders/new' },
			{ method: 'POST', path: '/pay/x402/credit-packs/starter_500' },
		]) {
			const response = await nativeFetch(`http://127.0.0.1:${port}${request.path}`, {
				method: request.method,
				headers: { 'content-type': 'application/json' },
				body: request.method === 'POST' ? '{}' : undefined,
			})
			assert.equal(response.status, 410)
			assert.equal((await response.json()).error.code, 'PAY_PER_JOB_ROUTE_ONLY')
		}
		assert.equal(fs.existsSync(path.join(directory, 'legacy-ledger.json')), false)
	} finally {
		await new Promise(resolve => started.httpServer.close(resolve))
	}
})

test('pay-per-job catalog has no reusable balance and recovers the same paid result', async () => {
	const store = createX402QuoteStore()
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Accountless payment fixture',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'QA', outcome: 'Verify one job.', remember: 'One payment, one result.' },
		visualDesign: { world: 'Clear', framing: 'Minimal.' },
		motionTime: { masterClock: 'slide', timingSource: 'authored', syncPolicy: 'one clock' },
		validation: { validateBeforeSave: true },
		slides: [{ id: 'slide-1', title: 'One job', message: 'One payment, one result.', layoutIntent: 'title-only', content: [{ kind: 'title', name: 'headline', text: 'One payment, one result.' }] }],
	}
	const premiumQuote = buildSpecPremiumPresentationQuote({ spec, args: { fileName: 'fixture.pptx' } })
	const catalog = await listMonetizedMcpPrices({}, {}, { store, premiumQuote })
	const item = catalog.items[0]
	assert.equal(item.metadata.kind, 'job_payment')
	assert.equal(item.metadata.paymentModel, 'one_payment_per_job')
	assert.equal(Object.hasOwn(item.metadata, 'credits'), false)
	assert.equal(Object.hasOwn(item.metadata, 'includedCredits'), false)
	assert.equal(item.metadata.quoteRequiredForFinalPrice, false)
	assert.match(item.params.purchaseContext, /^bpte1\./)
	const quote = await store.getQuote(item.params.quoteId)
	assert.ok(quote.jobPayment)
	assert.notEqual(quote.jobPayment.binding.bindingDigest, quote.jobBindingDigest)
	const ledger = fakeLedger()
	const chain = fakeChain()
	let executions = 0
	const args = {
		itemId: item.id,
		params: { ...item.params, spec, fileName: 'fixture.pptx' },
		paymentMethod: 'USDC_BASE_MAINNET',
		signedTransaction: serializable(await signPayment(quote)),
	}
	const result = await makeMonetizedMcpPurchase(args, {
		store,
		ledger,
		chain,
		executePaidItem: async () => { executions += 1; return { ok: true, deckId: 'fixture-deck', downloadUrl: 'https://example.invalid/fixture.pptx' } },
	})
	assert.equal(result.purchase.status, 'fulfilled')
	assert.equal(result.purchase.paymentModel, 'one_payment_per_job')
	assert.equal(executions, 1)
	assert.equal(ledger.events.size, 0)
	const recovered = await getMonetizedMcpJobStatus({
		jobId: result.purchase.jobId,
		quoteId: result.orderId,
		purchaseContext: item.params.purchaseContext,
	}, { store })
	assert.equal(recovered.ok, true)
	assert.equal(recovered.state, 'succeeded')
	assert.equal(recovered.result.deckId, 'fixture-deck')
	assert.equal(recovered.recovery.transactionHashAloneInsufficient, true)
	const replay = await makeMonetizedMcpPurchase(args, {
		store,
		ledger,
		chain,
		executePaidItem: async () => { executions += 1; return { ok: true } },
	})
	assert.equal(replay.purchase.idempotent, true)
	assert.equal(executions, 1)
	const recoveredWithoutSignature = await makeMonetizedMcpPurchase({
		...args,
		signedTransaction: undefined,
		params: { ...args.params, resume: true },
	}, {
		store,
		ledger,
		chain,
		executePaidItem: async () => { executions += 1; return { ok: true, unexpected: true } },
	})
	assert.equal(recoveredWithoutSignature.purchase.status, 'fulfilled')
	assert.equal(recoveredWithoutSignature.purchase.idempotent, true)
	assert.equal(executions, 1)
})

test('pay-per-job discovery without an exact quote is not an executable legacy credit listing', async () => {
	const store = createX402QuoteStore()
	const listing = await listMonetizedMcpPrices({}, {}, { store })
	const item = listing.items[0]
	assert.equal(item.metadata.kind, 'job_payment')
	assert.equal(item.metadata.quoteRequiredForFinalPrice, true)
	assert.equal(item.price.amount, null)
	assert.equal(item.params.purchaseContext.startsWith('Provide the exact authored specification'), true)
})
