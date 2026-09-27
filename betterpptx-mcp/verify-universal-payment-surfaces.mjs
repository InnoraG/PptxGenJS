import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'

const outputDir = path.resolve('outputs', 'universal-payment-surfaces', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_ENFORCE = '1'
process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = '1'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(outputDir, 'ledger.json')
process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local'
process.env.BETTERPPTX_CRYPTO_ORDER_FILE = path.join(outputDir, 'orders.json')
process.env.BETTERPPTX_X402_STORE = 'local'
process.env.BETTERPPTX_X402_FILE = path.join(outputDir, 'quotes.json')
process.env.BETTERPPTX_INSTALL_USAGE_STORE = 'local'
process.env.BETTERPPTX_INSTALL_USAGE_FILE = path.join(outputDir, 'usage.json')
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'universal-surface-install-secret-0123456789abcdef'
process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'universal-surface-envelope-secret-0123456789abcdef'
process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x4000000000000000000000000000000000000001'
process.env.BETTERPPTX_BASE_RPC_URL = 'https://rpc.example.test'
process.env.BETTERPPTX_X402_RELAYER_PRIVATE_KEY = `0x${'11'.repeat(32)}`
process.env.BETTERPPTX_DEPOSIT_XPUB_JSON = JSON.stringify({
	schema: 'betterpptx.deposit-xpub.v1',
	xpub: HDKey.fromMasterSeed(mnemonicToSeedSync('test test test test test test test test test test test junk')).derive("m/44'/60'/0'/0").publicExtendedKey,
	pathPrefix: "m/44'/60'/0'/0",
	startIndex: 0,
	labelPrefix: 'surface',
})
delete process.env.BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON
process.env.BETTERPPTX_MCP_MAX_INSTANCES = '1'
process.env.BETTERPPTX_EDIT_STATE_MODE = 'process-local'
process.env.BETTERPPTX_EDIT_STATE_SINGLE_INSTANCE_ACCEPTED = '1'
process.env.BETTERPPTX_ALLOW_LOCAL_PAYMENT_HTTP = '1'

const { generateInstallToken } = await import('./auth/install-identity.mjs')
const { paymentSurfaceReadiness } = await import('./billing/payment-surfaces.mjs')
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
	await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
	const port = server.address().port
	await new Promise(resolve => server.close(resolve))
	return port
}

const port = await freePort()
const base = `http://127.0.0.1:${port}`
process.env.BETTERPPTX_PUBLIC_BASE = base
process.env.BETTERPPTX_PAYMENT_BASE_URL = base
process.env.BETTERPPTX_PUBLIC_MCP_URL = `${base}/mcp`
const readiness = paymentSurfaceReadiness({ includeRequirements: true })
expect(readiness.readiness.privateCanaryReady === true && readiness.readiness.launchReady === true, 'Configured universal payment deployment should be private-canary ready.', { readiness })
expect(readiness.readiness.publicProductionReady === false, 'Process-local edit state must not report public production readiness.', { readiness })
expect(readiness.surfaces.agentic.operatorGasFundingRequired === true, 'Independent self-settlement should expose the isolated relayer gas-reserve requirement.', { readiness })
expect(readiness.surfaces.web.methods.payramCardOnramp === false && readiness.readiness.cardOnrampReady === false, 'PayRam card rail should be disabled by default.', { readiness })

delete process.env.BETTERPPTX_DEPOSIT_XPUB_JSON
process.env.BETTERPPTX_RAW_SEND_RAIL = 'forwarder'
process.env.BETTERPPTX_FORWARDER_FACTORY_ADDRESS = '0x2000000000000000000000000000000000000002'
process.env.BETTERPPTX_FORWARDER_CODEHASH = `0x${'12'.repeat(32)}`
process.env.BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS = '0x3000000000000000000000000000000000000003'
process.env.BETTERPPTX_FORWARDER_SALT_SECRET = 'universal-surface-forwarder-salt-secret-0123456789abcdef'
process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY = `0x${'22'.repeat(32)}`
const forwarderOnlyReadiness = paymentSurfaceReadiness({ includeRequirements: true })
expect(forwarderOnlyReadiness.surfaces.web.methods.directUsdcTransfer === true, 'CREATE2 forwarders should satisfy direct raw-send readiness without xpub or inventory.', { forwarderOnlyReadiness })
expect(forwarderOnlyReadiness.readiness.webReady === true && forwarderOnlyReadiness.readiness.appReady === true, 'Forwarder-only raw-send should keep web/app payment surfaces ready.', { forwarderOnlyReadiness })

const server = await startBetterPptxHttp({
	host: '127.0.0.1',
	port,
	open: true,
	publicBase: base,
	downloadRoot: path.join(outputDir, 'downloads'),
	walletBalanceReader: async ({ address, requiredAtomic }) => ({
		address,
		network: 'Base',
		chainId: 8453,
		asset: 'USDC',
		tokenContract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
		decimals: 6,
		balanceAtomic: '2500000',
		balanceUsdc: '2.5',
		requiredAtomic,
		requiredUsdc: '5',
		shortfallAtomic: '2500000',
		shortfallUsdc: '2.5',
		funded: false,
		checkedAt: new Date().toISOString(),
	}),
})
try {
	const token = generateInstallToken()
	const capabilitiesResponse = await fetch(`${base}/payments/capabilities`, {
		headers: { 'x-betterpptx-device': token },
	})
	const capabilities = await capabilitiesResponse.json()
	expect(capabilitiesResponse.status === 200, 'Payment capability discovery should be public.', { capabilities })
	expect(capabilities.surfaces.web.enabled && capabilities.surfaces.app.enabled && capabilities.surfaces.agentic.enabled, 'All payment surfaces should be enabled.', { capabilities })
	expect(capabilities.surfaces.web.methods.payramCardOnramp === false, 'Card onramp should not appear enabled before PayRam is configured.', { capabilities })
	expect(!Object.hasOwn(capabilities.surfaces.web, 'rawSendRail'), 'Public capabilities should not expose internal raw-send implementation names.', { capabilities })
	expect(!JSON.stringify(capabilities).toLowerCase().includes('dodo'), 'Public payment capabilities must not advertise Dodo after crypto-credit migration.', { capabilities })
	expect(/^http:\/\/127\.0\.0\.1:\d+\/pay\/orders\/new\?token=bpte1\./.test(capabilities.surfaces.web.entryUrl), 'Identity-bound web payment URL should be returned.', { entryUrl: capabilities.surfaces.web.entryUrl })
	expect(capabilities.surfaces.agentic.version === 2, 'Agentic discovery should advertise x402 v2.', { agentic: capabilities.surfaces.agentic })

	const quoteResponse = await fetch(`${base}/pay/x402/credit-packs/starter_500`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-betterpptx-device': token,
		},
		body: '{}',
	})
	const quoteBody = await quoteResponse.json()
	const encodedHeader = quoteResponse.headers.get('payment-required')
	const headerBody = encodedHeader ? JSON.parse(Buffer.from(encodedHeader, 'base64').toString('utf8')) : null
	expect(quoteResponse.status === 402, 'Unpaid agent request should return HTTP 402.', { quoteBody })
	expect(quoteBody.x402Version === 2 && headerBody?.x402Version === 2, 'HTTP quote should use x402 v2 in the body and PAYMENT-REQUIRED header.', { quoteBody, headerBody })
	expect(quoteBody.accepts?.[0]?.extra?.quoteId === quoteBody.quoteId, 'x402 v2 requirement should carry its opaque quote binding.', { quoteBody })

	const fundingAddress = '0x5000000000000000000000000000000000000001'
	const balanceResponse = await fetch(`${base}/payments/wallet-balance/${fundingAddress}?requiredAtomic=5000000`)
	const balance = await balanceResponse.json()
	expect(balanceResponse.status === 200 && balance.funded === false && balance.shortfallUsdc === '2.5', 'Public balance polling should report the exact Base USDC shortfall.', { balance })
	const fundingPageResponse = await fetch(`${base}/fund-wallet?address=${fundingAddress}&requiredAtomic=5000000`, {
		headers: { Accept: 'text/html' },
	})
	const fundingPage = await fundingPageResponse.text()
	expect(fundingPageResponse.status === 200, 'Wallet funding page should render.', { status: fundingPageResponse.status })
	expect(fundingPage.includes('Fund your BetterPPTX wallet') && fundingPage.includes(fundingAddress), 'Wallet funding page should show the local address and recovery behavior.', {})
	expect(fundingPage.includes('/payments/wallet-balance/') && fundingPage.includes('resume automatically'), 'Wallet funding page should poll balance and explain automatic resume.', {})

	const tools = await (await fetch(`${base}/tools`)).json()
	expect(tools.tools.some(tool => tool.name === 'betterpptx.billing.payment_options'), 'Public tools should expose payment-surface discovery.', {})
	for (const name of ['price-listing', 'payment-methods', 'make-purchase']) {
		expect(tools.tools.some(tool => tool.name === name), `Public tools should expose ${name}.`, {})
	}
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}

console.log('UNIVERSAL PAYMENT SURFACES: PASS web=1 app=1 agentic=x402v2 funding_popup=1')
