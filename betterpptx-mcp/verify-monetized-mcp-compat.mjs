import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'monetized-mcp-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_X402_STORE = 'local'
process.env.BETTERPPTX_X402_FILE = path.join(outputDir, 'quotes.json')
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(outputDir, 'ledger.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x4000000000000000000000000000000000000001'
process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-monetized-mcp-envelope-0123456789abcdef'
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'verify-monetized-mcp-install-0123456789abcdef'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_LOG = 'debug'
process.env.BETTERPPTX_LOG_FILE = path.join(outputDir, 'events.ndjson')
delete process.env.BETTERPPTX_LOG_SECRETS

const {
	MONETIZED_MCP_GENERATE_DECK_ITEM_ID,
	MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID,
	listMonetizedMcpPaymentMethods,
	listMonetizedMcpPrices,
	makeMonetizedMcpPurchase,
} = await import('./billing/monetized-mcp-adapter.mjs')
const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { createX402QuoteStore } = await import('./billing/x402-packs.mjs')
const { buildSpecPremiumPresentationQuote } = await import('./billing/premium-quote.mjs')
const { publicToolList } = await import('./blackbox.mjs')
const { executeMonetizedMcpPaidItem } = await import('./engine.mjs')
const { generateInstallToken } = await import('./auth/install-identity.mjs')
const { logEvent } = await import('./logger.mjs')
const { startBetterPptxHttp } = await import('./server-http.mjs')
const { TOOLS } = await import('./tools.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function freePort() {
	const server = net.createServer()
	await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
	const port = server.address().port
	await new Promise(resolve => server.close(resolve))
	return port
}

function parseRpcBody(text) {
	const trimmed = String(text || '').trim()
	if (!trimmed) return null
	if (trimmed.startsWith('{')) return JSON.parse(trimmed)
	for (const event of trimmed.split(/\r?\n\r?\n/)) {
		const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('')
		if (data) return JSON.parse(data)
	}
	return null
}

async function rpc(base, token, method, params = {}, sessionId = '') {
	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
		'x-betterpptx-device': token,
		...(sessionId ? { 'mcp-session-id': sessionId } : {}),
	}
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 100000), method, params }),
	})
	const text = await response.text()
	return {
		status: response.status,
		sessionId: response.headers.get('mcp-session-id') || sessionId,
		body: parseRpcBody(text),
	}
}

const installHash = 'install_monetized_mcp_verify'
const catalog = listMonetizedMcpPrices({}, { installHash })
expect(Array.isArray(catalog.items) && catalog.items.length === 1, 'Price listing should expose one premium presentation item.', { catalog })
const premiumItem = catalog.items.find(item => item.id === MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID)
expect(premiumItem?.price?.amount === 5 && premiumItem.price.paymentMethod === 'USDC_BASE_MAINNET', 'Catalog price must follow the dynamic premium presentation wire shape.', { premiumItem })
expect(premiumItem?.params?.purchaseContext?.startsWith('bpte1.'), 'Catalog item must include an opaque installation-bound purchase context.', { premiumItem })
expect(premiumItem?.metadata?.kind === 'premium_presentation' && premiumItem.metadata?.pricingModel === 'deck_dynamic_quote', 'Catalog should expose one premium presentation item with quote metadata.', { premiumItem })
expect(!JSON.stringify(catalog).includes(installHash), 'Catalog must not expose the anonymous install hash.', {})

const customQuoteCatalog = listMonetizedMcpPrices({ quoteCapCredits: 123, rateCardVersion: 'verify-dynamic-rate-card', deckId: 'deck_dynamic_verify' }, { installHash })
const customQuoteItem = customQuoteCatalog.items[0]
expect(customQuoteItem?.price?.amount === 1.23 && customQuoteItem?.metadata?.quoteCapCredits === 123, 'Premium presentation price-listing must reflect the deck-specific quote cap.', { customQuoteItem })
expect(customQuoteItem?.metadata?.packId !== premiumItem.metadata?.packId, 'Dynamic premium quotes should bind distinct quote pack ids.', { premiumItem, customQuoteItem })

const methods = listMonetizedMcpPaymentMethods()
expect(methods.length === 1 && methods[0].paymentMethod === 'USDC_BASE_MAINNET' && methods[0].walletAddress, 'Payment methods should advertise Base mainnet USDC.', { methods })

const visibleToolNames = new Set(publicToolList(TOOLS).map(tool => tool.name))
for (const name of ['price-listing', 'pricing-listing', 'payment-methods', 'make-purchase']) {
	expect(visibleToolNames.has(name), `Public tool list should expose ${name} when compatibility is enabled.`, {})
}
expect(!TOOLS.find(tool => tool.name === 'price-listing')?.outputSchema, 'Raw protocol tools should not advertise the BetterPPTX result envelope.', {})

const store = createX402QuoteStore()
const ledger = createBillingLedgerStore()
let verifyCalls = 0
let settleCalls = 0
const facilitator = {
	async verify() {
		verifyCalls += 1
		return { isValid: true }
	},
	async settle() {
		settleCalls += 1
		return {
			settlementId: `verify_monetized_mcp_settlement_${settleCalls}`,
			transaction: `0x${String(settleCalls).padStart(64, 'a')}`,
			route: 'test_facilitator',
		}
	},
}
const signedTransaction = {
	signature: `0x${'11'.repeat(65)}`,
	authorization: {
		from: '0x5000000000000000000000000000000000000001',
		to: process.env.BETTERPPTX_TREASURY_EVM_ADDRESS,
		value: '5000000',
		validAfter: '0',
		validBefore: String(Math.floor(Date.now() / 1000) + 600),
		nonce: `0x${'22'.repeat(32)}`,
	},
}
const purchaseArgs = {
	itemId: premiumItem.id,
	params: { purchaseContext: premiumItem.params.purchaseContext },
	signedTransaction: JSON.stringify(signedTransaction),
	paymentMethod: 'USDC_BASE_MAINNET',
}
const first = await makeMonetizedMcpPurchase(purchaseArgs, { store, ledger, facilitator })
expect(first.purchase?.creditedCredits === 500 && first.purchase?.idempotent === false && first.purchase?.kind === 'premium_presentation', 'First purchase should unlock the quoted premium presentation pass.', { first })
expect(first.makePurchaseRequest?.signedTransaction === '[redacted]' && first.makePurchaseRequest?.params?.purchaseContext === '[redacted]', 'Purchase response should echo only a redacted request shape.', { first })
const retry = await makeMonetizedMcpPurchase(purchaseArgs, { store, ledger, facilitator })
expect(retry.purchase?.creditedCredits === 500 && retry.purchase?.idempotent === true, 'Premium pass purchase retry should resolve idempotently.', { retry })
expect(verifyCalls === 1 && settleCalls === 1, 'Idempotent retry must not invoke settlement again.', { verifyCalls, settleCalls })

const customer = await ledger.getCustomer(installHash)
expect(customer?.availableBalanceCredits === 500, 'Anonymous install ledger should receive exactly one credit grant.', { customer })

let paidServiceExecutions = 0
const serviceCatalog = listMonetizedMcpPrices({ quoteCapCredits: 500, rateCardVersion: 'verify-rate-card' }, { installHash })
const serviceItem = serviceCatalog.items[0]
const serviceArgs = {
	itemId: serviceItem.id,
	params: {
		purchaseContext: serviceItem.params.purchaseContext,
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Fluora direct service verify',
			slides: [{
				id: 'verify-1',
				title: 'Paid result',
				layoutIntent: 'title-body',
				content: [
					{ kind: 'title', name: 'title', text: 'Paid result' },
					{ kind: 'textBox', name: 'body', text: 'make-purchase returned the BetterPPTX service result.' },
				],
			}],
		},
		fileName: 'fluora-direct-service.pptx',
	},
	signedTransaction: JSON.stringify(signedTransaction),
	paymentMethod: 'USDC_BASE_MAINNET',
}
const serviceFirst = await makeMonetizedMcpPurchase(serviceArgs, {
	store,
	ledger,
	facilitator,
	executePaidItem: async input => {
		paidServiceExecutions += 1
		expect(input.itemId === MONETIZED_MCP_GENERATE_DECK_ITEM_ID, 'Paid service executor received the wrong item id.', input)
		expect(input.params?.spec?.title === 'Fluora direct service verify', 'Paid service executor did not receive accepted spec params.', input.params)
		return { ok: true, downloadUrl: 'https://example.test/paid-service.pptx', deckId: 'deck_paid_service' }
	},
})
const parsedToolResult = JSON.parse(serviceFirst.toolResult)
expect(serviceFirst.purchase?.status === 'fulfilled' && parsedToolResult.downloadUrl, 'Direct service purchase should fulfill and return toolResult.', { serviceFirst })
expect(serviceFirst.makePurchaseRequest?.params?.spec === '[accepted]' && !serviceFirst.toolResult.includes(serviceItem.params.purchaseContext), 'Direct service response should not echo purchase context or full request payload.', { serviceFirst })
const persistedServiceResult = await store.getQuoteServiceResult(serviceFirst.orderId)
expect(persistedServiceResult?.downloadUrl === parsedToolResult.downloadUrl, 'Direct service purchase should persist toolResult on the quote for cross-instance retry.', { persistedServiceResult, serviceFirst })
const serviceRetry = await makeMonetizedMcpPurchase(serviceArgs, {
	store,
	ledger,
	facilitator,
	executePaidItem: async () => {
		paidServiceExecutions += 1
		return { ok: true, downloadUrl: 'https://example.test/duplicate.pptx' }
	},
})
expect(JSON.parse(serviceRetry.toolResult).downloadUrl === parsedToolResult.downloadUrl && paidServiceExecutions === 1, 'Direct paid service result should be cached for same-process idempotent retry.', { serviceRetry, paidServiceExecutions })

const customerAfterService = await ledger.getCustomer(installHash)
expect(customerAfterService?.availableBalanceCredits === 1000, 'Direct service purchase should settle through the dynamic premium quote grant for follow-up edits.', { customerAfterService })

const quotedSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Quoted spec verify',
	slides: [{
		id: 'quoted-1',
		title: 'Quoted',
		layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'title', text: 'Quoted spec' },
			{ kind: 'textBox', name: 'body', text: 'The paid service must fulfill exactly the priced spec.' },
		],
	}],
}
const quotedPremium = buildSpecPremiumPresentationQuote({ spec: quotedSpec, args: { fileName: 'quoted-spec.pptx' } })
const specCatalog = listMonetizedMcpPrices({ premiumQuote: quotedPremium }, { installHash })
const specItem = specCatalog.items[0]
expect(specItem?.metadata?.specDigest === quotedPremium.specDigest && specItem.metadata?.pricingInputDigest === quotedPremium.pricingInputDigest, 'Spec-priced listing must expose quote-bound spec and pricing digests.', { specItem, quotedPremium })

let specPaidExecutions = 0
const specPurchaseArgs = {
	itemId: specItem.id,
	params: {
		purchaseContext: specItem.params.purchaseContext,
		spec: quotedSpec,
		fileName: 'quoted-spec.pptx',
	},
	signedTransaction: JSON.stringify(signedTransaction),
	paymentMethod: 'USDC_BASE_MAINNET',
}
const specFirst = await makeMonetizedMcpPurchase(specPurchaseArgs, {
	store,
	ledger,
	facilitator,
	executePaidItem: async () => {
		specPaidExecutions += 1
		return { ok: true, downloadUrl: 'https://example.test/quoted-spec.pptx', deckId: 'deck_quoted_spec' }
	},
})
expect(specFirst.purchase?.status === 'fulfilled' && specPaidExecutions === 1, 'Spec-priced direct service purchase should fulfill exactly once.', { specFirst, specPaidExecutions })

const mismatchCatalog = listMonetizedMcpPrices({ premiumQuote: quotedPremium }, { installHash: `${installHash}_mismatch` })
const mismatchItem = mismatchCatalog.items[0]
let mismatchSettled = false
await makeMonetizedMcpPurchase({
	itemId: mismatchItem.id,
	params: {
		purchaseContext: mismatchItem.params.purchaseContext,
		spec: {
			...quotedSpec,
			title: 'Tampered spec verify',
			slides: [{ ...quotedSpec.slides[0], title: 'Tampered' }],
		},
	},
	signedTransaction: JSON.stringify(signedTransaction),
	paymentMethod: 'USDC_BASE_MAINNET',
}, {
	store,
	ledger,
	facilitator: {
		verify: async () => {
			mismatchSettled = true
			return { isValid: true }
		},
		settle: async () => {
			mismatchSettled = true
			return { settlementId: 'mismatch_should_not_settle' }
		},
	},
	executePaidItem: async () => {
		throw new Error('Mismatched spec should not execute.')
	},
}).then(
	() => { throw new Error('Mismatched spec purchase should fail.') },
	error => expect(error?.code === 'PAID_SERVICE_SPEC_MISMATCH', 'Mismatched spec should fail before settlement.', { code: error?.code, error }),
)
expect(mismatchSettled === false, 'Mismatched spec must not call settlement.', { mismatchSettled })

const leaseCatalog = listMonetizedMcpPrices({ premiumQuote: quotedPremium }, { installHash: `${installHash}_lease` })
const leaseItem = leaseCatalog.items[0]
await makeMonetizedMcpPurchase({
	itemId: leaseItem.id,
	params: { purchaseContext: leaseItem.params.purchaseContext },
	signedTransaction: JSON.stringify(signedTransaction),
	paymentMethod: 'USDC_BASE_MAINNET',
}, { store, ledger, facilitator })
let leaseExecutions = 0
const leaseArgs = {
	itemId: leaseItem.id,
	params: {
		purchaseContext: leaseItem.params.purchaseContext,
		spec: quotedSpec,
		fileName: 'lease-quoted-spec.pptx',
	},
	signedTransaction: JSON.stringify(signedTransaction),
	paymentMethod: 'USDC_BASE_MAINNET',
}
const [leaseFirst, leaseSecond] = await Promise.all([
	makeMonetizedMcpPurchase(leaseArgs, {
		store,
		ledger,
		facilitator,
		executePaidItem: async () => {
			leaseExecutions += 1
			await new Promise(resolve => setTimeout(resolve, 100))
			return { ok: true, downloadUrl: 'https://example.test/lease-quoted-spec.pptx', deckId: 'deck_lease_quoted_spec' }
		},
	}),
	makeMonetizedMcpPurchase(leaseArgs, {
		store,
		ledger,
		facilitator,
		executePaidItem: async () => {
			leaseExecutions += 1
			return { ok: true, downloadUrl: 'https://example.test/duplicate-lease.pptx', deckId: 'deck_duplicate_lease' }
		},
	}),
])
expect(
	JSON.parse(leaseFirst.toolResult).downloadUrl === 'https://example.test/lease-quoted-spec.pptx'
	&& JSON.parse(leaseSecond.toolResult).downloadUrl === 'https://example.test/lease-quoted-spec.pptx'
	&& leaseExecutions === 1,
	'Concurrent paid service retries should share one persisted fulfillment result.',
	{ leaseFirst, leaseSecond, leaseExecutions },
)

const actualServiceResult = await executeMonetizedMcpPaidItem({
	itemId: MONETIZED_MCP_GENERATE_DECK_ITEM_ID,
	params: serviceArgs.params,
	envelope: { installHash, jti: 'verify_actual_paid_service' },
	quote: { quoteId: 'verify_actual_paid_service_quote' },
	settlementPack: { id: 'starter_500', credits: 500 },
}, { installHash, sessionId: 'verify-monetized-mcp-actual-service' })
expect(actualServiceResult?.ok === true && actualServiceResult.deckId && actualServiceResult.artifact, 'Actual direct service executor should generate and save a deck artifact.', { actualServiceResult })

logEvent('verify.payment.redaction', {
	signedTransaction,
	paymentPayload: signedTransaction,
	purchaseContext: premiumItem.params.purchaseContext,
})
const logText = fs.readFileSync(process.env.BETTERPPTX_LOG_FILE, 'utf8')
expect(!logText.includes(signedTransaction.signature), 'Signed transaction leaked into logs.', {})
expect(!logText.includes(premiumItem.params.purchaseContext), 'Purchase context leaked into logs.', {})

const port = await freePort()
const httpServer = await startBetterPptxHttp({
	host: '127.0.0.1',
	port,
	open: true,
	publicBase: `http://127.0.0.1:${port}`,
	downloadRoot: path.join(outputDir, 'downloads'),
})
try {
	const deviceToken = generateInstallToken()
	const init = await rpc(`http://127.0.0.1:${port}`, deviceToken, 'initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'monetized-mcp-verifier', version: '1.0.0' },
		capabilities: {},
	})
	expect(init.status === 200 && init.sessionId, 'MCP initialize should succeed for an identity-bound connector.', { init })
	const listing = await rpc(`http://127.0.0.1:${port}`, deviceToken, 'tools/call', {
		name: 'price-listing',
		arguments: {},
	}, init.sessionId)
	const listingText = listing.body?.result?.content?.[0]?.text || ''
	const listingPayload = listingText ? JSON.parse(listingText) : null
	expect(listingPayload?.items?.length === 1 && listingPayload.ok === undefined, 'MCP price-listing must return the raw MonetizedMCP wire shape.', { listingPayload })
	expect(listingPayload.items[0].params?.purchaseContext?.startsWith('bpte1.'), 'Identity-bound MCP listing should include an opaque purchase context.', {})
	expect(listingPayload.items.some(item => item.id === MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID), 'MCP price-listing should include the premium presentation item.', { listingPayload })

	const specListing = await rpc(`http://127.0.0.1:${port}`, deviceToken, 'tools/call', {
		name: 'price-listing',
		arguments: { spec: quotedSpec },
	}, init.sessionId)
	const specListingText = specListing.body?.result?.content?.[0]?.text || ''
	const specListingPayload = specListingText ? JSON.parse(specListingText) : null
	expect(
		specListingPayload?.items?.[0]?.metadata?.specDigest
		&& specListingPayload.items[0].metadata.pricingModel === 'deck_dynamic_quote'
		&& specListingPayload.items[0].metadata.quoteRequiredForFinalPrice === false,
		'MCP price-listing should return a spec-bound dynamic premium quote when spec is supplied.',
		{ specListingPayload },
	)

	const paymentMethods = await rpc(`http://127.0.0.1:${port}`, deviceToken, 'tools/call', {
		name: 'payment-methods',
		arguments: {},
	}, init.sessionId)
	const methodsText = paymentMethods.body?.result?.content?.[0]?.text || ''
	const methodsPayload = methodsText ? JSON.parse(methodsText) : null
	expect(Array.isArray(methodsPayload) && methodsPayload[0]?.walletAddress, 'MCP payment-methods must return the raw array wire shape.', { methodsPayload })

	const portal = await rpc(`http://127.0.0.1:${port}`, deviceToken, 'tools/call', {
		name: 'betterpptx.billing.portal',
		arguments: {},
	}, init.sessionId)
	const portalText = portal.body?.result?.content?.[0]?.text || ''
	const portalPayload = portalText ? JSON.parse(portalText) : null
	expect(portalPayload?.data?.agentPurchase?.enabled === true, 'Billing recovery should expose identity-bound agent purchase contexts.', { portalPayload })
} finally {
	await new Promise(resolve => httpServer.httpServer.close(resolve))
}

process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = '0'
const hiddenToolNames = new Set(publicToolList(TOOLS).map(tool => tool.name))
expect(!hiddenToolNames.has('price-listing') && !hiddenToolNames.has('make-purchase'), 'Public compatibility tools should disappear when disabled.', {})

console.log('MONETIZED MCP COMPAT: PASS catalog=1 payment=USDC_BASE_MAINNET premium_pass=true dynamic_quote=true spec_bound=true direct_service=true fulfillment_lease=true logs=redacted')
