import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vm from 'node:vm'

// No inherited billing/provider configuration or actual network is used.
for (const name of Object.keys(process.env)) if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-quote-binding-fixture-'))
Object.assign(process.env, {
	BETTERPPTX_MONETIZED_MCP_ENABLED: '1', BETTERPPTX_X402_STORE: 'local', BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local', BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(directory, 'leases'),
	BETTERPPTX_TREASURY_EVM_ADDRESS: '0x4000000000000000000000000000000000000001',
	BETTERPPTX_PAYMENT_ENVELOPE_SECRET: 'disposable-fixture-secret-not-a-real-payment-credential',
	BETTERPPTX_BASE_SAFE_DEPTH: '2',
})
globalThis.fetch = async () => { throw new Error('Network forbidden in quote binding fixtures') }
after(() => fs.rmSync(directory, { recursive: true, force: true }))

const { createX402QuoteStore, publicX402Quote } = await import('../billing/x402-packs.mjs')
const { listMonetizedMcpPrices, makeMonetizedMcpPurchase, mintMonetizedMcpPurchaseContext } = await import('../billing/monetized-mcp-adapter.mjs')
const { renderOrderPage } = await import('../public/pay-order-page.mjs')
const { buildSpecPremiumPresentationQuote } = await import('../billing/premium-quote.mjs')
const { signPayment, fakeChain, fakeLedger, treasury, token, payer } = await import('./fixtures/x402-security-fixtures.mjs')
let sequence = 0
async function setup() {
	process.env.BETTERPPTX_X402_FILE = path.join(directory, `quotes-${++sequence}.json`)
	const store = createX402QuoteStore()
	const context = { installHash: `fixture-install-${sequence}` }
	const premiumQuote = { quoteCapCredits: 500, amountAtomic: '5000000', priceUsdc: 5 }
	const catalog = await listMonetizedMcpPrices({}, context, { store, premiumQuote })
	const item = catalog.items[0]
	const quote = await store.getQuote(item.params.quoteId)
	return { store, context, item, quote, ledger: fakeLedger(), chain: fakeChain() }
}
function serializable(payment) { return JSON.parse(JSON.stringify(payment, (_key, value) => typeof value === 'bigint' ? value.toString() : value)) }
async function purchaseArgs(input, patch = {}) {
	return { itemId: input.item.id, params: input.item.params, paymentMethod: 'USDC_BASE_MAINNET', signedTransaction: serializable(await signPayment(input.quote)), ...patch }
}

test('listing stores a bound immutable quote; purchase and retry reuse it and credit once', async () => {
	const input = await setup()
	const publicQuote = publicX402Quote(input.quote)
	assert.equal(input.item.metadata.authorizationNonce, publicQuote.accepts[0].extra.authorizationNonce)
	assert.equal(input.item.metadata.authorizationBinding, 'quote_nonce_v1')
	assert.equal(input.item.metadata.quoteId, input.quote.quoteId)
	assert.equal(input.item.metadata.expiresAt, input.quote.expiresAt)
	assert.equal(input.item.metadata.amountAtomic, input.quote.amountAtomic)
	const args = await purchaseArgs(input)
	assert.equal((await makeMonetizedMcpPurchase(args, input)).purchase.status, 'credited')
	assert.equal((await makeMonetizedMcpPurchase(args, input)).purchase.idempotent, true)
	assert.equal(input.chain.state.submitted.length, 1)
	assert.equal(input.ledger.events.size, 1)
	assert.equal(Object.keys(JSON.parse(fs.readFileSync(input.store.file, 'utf8')).quotes).length, 1)
})

test('unsigned request-side prices are rejected and stored quote cannot be repriced at purchase', async () => {
	const input = await setup()
	for (const field of ['premiumQuote', 'quoteCapCredits', 'estimatedCredits', 'amountAtomic', 'priceUsdc', 'price', 'credits']) {
		await assert.rejects(listMonetizedMcpPrices({ [field]: 1 }, input.context, { store: input.store }), { code: 'PURCHASE_PRICE_OVERRIDE_NOT_ALLOWED' })
	}
	await assert.rejects(listMonetizedMcpPrices({}, input.context, { store: input.store, premiumQuote: { quoteCapCredits: 500, amountAtomic: '1' } }), { code: 'PURCHASE_PRICE_MISMATCH' })
	const args = await purchaseArgs(input)
	for (const patch of [{ amountAtomic: '1' }, { price: { amount: 0.01 } }, { params: { ...args.params, amountAtomic: '1' } }]) {
		await assert.rejects(makeMonetizedMcpPurchase({ ...args, ...patch }, input), { code: 'PURCHASE_PRICE_MISMATCH' })
	}
	await assert.rejects(makeMonetizedMcpPurchase({ ...args, params: { ...args.params, premiumQuote: { priceUsdc: 0.01 } } }, input), { code: 'PURCHASE_PRICE_OVERRIDE_NOT_ALLOWED' })
	const undersigned = serializable(await signPayment(input.quote, { value: 1n }))
	await assert.rejects(makeMonetizedMcpPurchase({ ...args, signedTransaction: undersigned }, input), { code: 'PURCHASE_PRICE_MISMATCH' })
	assert.equal(input.chain.state.submitted.length, 0)
	assert.equal(input.ledger.events.size, 0)
})

test('missing and unknown quote IDs or unlisted contexts never create a quote at purchase', async () => {
	const input = await setup()
	const args = await purchaseArgs(input)
	for (const quoteId of [undefined, 'x402q_unknown-fixture']) {
		await assert.rejects(makeMonetizedMcpPurchase({ ...args, params: { ...args.params, quoteId } }, input), { code: 'PURCHASE_QUOTE_NOT_FOUND' })
	}
	const purchaseContext = mintMonetizedMcpPurchaseContext({ installHash: input.context.installHash, packId: 'starter_500' })
	await assert.rejects(makeMonetizedMcpPurchase({ ...args, itemId: 'betterpptx.credit_pack.starter_500', params: { purchaseContext, quoteId: 'unknown' } }, input), { code: 'PURCHASE_QUOTE_NOT_FOUND' })
	assert.equal(input.chain.state.submitted.length, 0)
	assert.equal(Object.keys(JSON.parse(fs.readFileSync(input.store.file, 'utf8')).quotes).length, 1)
})

test('another identity cannot substitute its quote for a previously signed authorization', async () => {
	const input = await setup()
	const other = (await listMonetizedMcpPrices({}, { installHash: 'another-fixture-owner' }, { store: input.store, premiumQuote: { quoteCapCredits: 500 } })).items[0]
	const args = await purchaseArgs(input, { params: other.params })
	await assert.rejects(makeMonetizedMcpPurchase(args, input), { code: 'X402_PAYMENT_INVALID' })
	assert.equal(input.ledger.events.size, 0)
})

test('discovery without a service-derived price stays indicative and cannot authorize generation', async () => {
	const input = await setup()
	const listing = await listMonetizedMcpPrices({}, input.context, { store: input.store })
	assert.equal(listing.items[0].metadata.quoteRequiredForFinalPrice, true)
	assert.equal(listing.items[0].metadata.authorizationNonce, undefined)
	await assert.rejects(makeMonetizedMcpPurchase(await purchaseArgs(input, { params: { ...input.item.params, spec: { slides: [] } } }), input), { code: 'PAID_SERVICE_SPEC_QUOTE_REQUIRED' })
	assert.equal(input.chain.state.submitted.length, 0)
})

test('server-priced spec still fulfills once and rejects a changed spec', async () => {
	const input = await setup()
	const spec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Fixture', slides: [{ id: 'fixture-slide', title: 'Fixture', layoutIntent: 'title-body', content: [{ kind: 'textBox', name: 'fixture-text', text: 'A locally quoted presentation.' }] }] }
	const premiumQuote = buildSpecPremiumPresentationQuote({ spec, args: { fileName: 'fixture.pptx' } })
	const item = (await listMonetizedMcpPrices({}, input.context, { store: input.store, premiumQuote })).items[0]
	const quote = await input.store.getQuote(item.params.quoteId)
	const args = { itemId: item.id, params: { ...item.params, spec, fileName: 'fixture.pptx' }, paymentMethod: 'USDC_BASE_MAINNET', signedTransaction: serializable(await signPayment(quote)) }
	let executions = 0
	const options = { ...input, executePaidItem: async () => { executions++; return { ok: true, deckId: 'fixture-deck' } } }
	await assert.rejects(makeMonetizedMcpPurchase({ ...args, params: { ...args.params, spec: { ...spec, title: 'Changed' } } }, options), { code: 'PAID_SERVICE_SPEC_MISMATCH' })
	assert.equal(executions, 0)
	assert.equal((await makeMonetizedMcpPurchase(args, options)).purchase.status, 'fulfilled')
	assert.equal((await makeMonetizedMcpPurchase(args, options)).purchase.status, 'fulfilled')
	assert.equal(executions, 1)
})

async function browserHarness(quote, { endpoint = '/pay/x402/credit-packs/starter_500', receipt = null, storage = new Map(), storageFailure = false, rejectApproval = false } = {}) {
	const order = { orderId: 'fixture-order', expectedCredits: 500, displayUsdc: 5, tokenContract: token, chainId: 8453, depositAddress: treasury, status: 'created' }
	const html = await renderOrderPage(order, { nonce: 'fixture-nonce', gasless: { endpoint, token: 'fixture-browser-envelope' } })
	const script = html.match(/<script nonce="fixture-nonce">([\s\S]*?)<\/script>/)[1]
	const nodes = new Map()
	let clicked
	for (const selector of ['[data-gasless-pay]', '[data-gasless-status]']) nodes.set(selector, { dataset: {}, textContent: '', addEventListener: (_event, fn) => { clicked = fn } })
	const signed = []
	const requests = []
	const sandbox = {
		sessionStorage: { getItem: key => storage.get(key) || null, removeItem: key => storage.delete(key), setItem: (key, value) => { if (storageFailure) throw new Error('fixture storage unavailable'); storage.set(key, value) } },
		URL, Date, console: { log() {} }, location: { href: 'https://payments.example.test/pay/orders/fixture-order', origin: 'https://payments.example.test' },
		document: { querySelector: selector => nodes.get(selector) || null }, setInterval() {}, setTimeout: callback => callback(),
		ethereum: { request: async ({ method, params }) => {
			if (method === 'eth_requestAccounts') return [payer.address]
			if (method === 'eth_chainId') return '0x2105'
			if (method === 'eth_signTypedData_v4') { if (rejectApproval) throw Object.assign(new Error('Fixture user declined'), { code: 4001 }); signed.push(JSON.parse(params[1])); return 'synthetic-browser-signature' }
			throw new Error('Unexpected wallet request')
		} },
		fetch: async (url, options) => {
			requests.push({ url, options })
			if (options.body === '{}') return new Response(JSON.stringify(quote), { status: 402 })
			return new Response(JSON.stringify(receipt || { settled: true, creditedCredits: 500 }), { status: 200 })
		},
	}
	vm.runInNewContext(script, sandbox, { timeout: 1000 })
	await clicked()
	return { signed, requests, html, click: clicked, status: nodes.get('[data-gasless-status]').textContent }
}

test('browser signs exact bound nonce and keeps same payment on inconclusive receipt retry', async () => {
	const input = await setup()
	const publicQuote = publicX402Quote(input.quote)
	const browser = await browserHarness(publicQuote, { receipt: { creditedCredits: 500 } })
	assert.equal(browser.signed.length, 1)
	assert.equal(browser.signed[0].message.nonce, publicQuote.accepts[0].extra.authorizationNonce)
	assert.ok(Number(browser.signed[0].message.validBefore) <= Math.floor(Date.parse(publicQuote.expiresAt) / 1000))
	assert.ok(browser.requests.every(request => request.options.redirect === 'error'))
	await browser.click()
	assert.equal(browser.signed.length, 1)
	assert.equal(browser.requests.length, 3)
})

test('browser reload resumes saved authorization and completed payment never asks for a second signature', async () => {
	const input = await setup()
	const quote = publicX402Quote(input.quote)
	const storage = new Map()
	const first = await browserHarness(quote, { storage, receipt: { creditedCredits: 500 } })
	assert.equal(first.signed.length, 1)
	const resumed = await browserHarness(quote, { storage })
	assert.equal(resumed.signed.length, 0)
	assert.equal(resumed.requests.length, 1)
	const completed = await browserHarness(quote, { storage })
	assert.equal(completed.signed.length, 0)
	assert.equal(completed.requests.length, 0)
	const unavailable = await browserHarness(quote, { storageFailure: true })
	assert.equal(unavailable.signed.length, 0)
	const canceledStorage = new Map()
	const declined = await browserHarness(quote, { storage: canceledStorage, rejectApproval: true })
	assert.equal(declined.signed.length, 0)
	assert.equal(canceledStorage.size, 0)
	assert.equal((await browserHarness(quote, { storage: canceledStorage })).signed.length, 1)
})

test('browser refuses unbound, expired, substituted terms or external endpoint before asking for signature', async () => {
	const input = await setup()
	const original = publicX402Quote(input.quote)
	for (const mutate of [
		quote => { delete quote.accepts[0].extra.authorizationNonce },
		quote => { quote.accepts[0].extra.authorizationBinding = 'unknown' },
		quote => { quote.accepts[0].amount = '500000000000' },
		quote => { quote.accepts[0].network = 'eip155:1' },
		quote => { quote.accepts[0].asset = treasury },
		quote => { quote.accepts[0].extra.name = 'Attacker Token' },
		quote => { quote.expiresAt = new Date(Date.now() - 1000).toISOString() },
	]) {
		const quote = structuredClone(original)
		mutate(quote)
		const browser = await browserHarness(quote)
		assert.equal(browser.signed.length, 0)
	}
	const external = await browserHarness(original, { endpoint: 'https://untrusted.example.test/pay' })
	assert.equal(external.signed.length, 0)
	assert.equal(external.requests.length, 0)
})
