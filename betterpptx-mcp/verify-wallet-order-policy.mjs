import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'

const outputDir = path.resolve('outputs', 'wallet-order-verify', `run-${Date.now()}-${process.pid}`)
const orderFile = path.join(outputDir, 'orders.json')
const ledgerFile = path.join(outputDir, 'ledger.json')
const logFile = path.join(outputDir, 'http.ndjson')
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-wallet-order-envelope-0123456789abcdef'
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'verify-wallet-order-install-0123456789abcdef'
process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local'
process.env.BETTERPPTX_CRYPTO_ORDER_FILE = orderFile
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = ledgerFile
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x4000000000000000000000000000000000000001'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_LOG = 'debug'
process.env.BETTERPPTX_LOG_FILE = logFile
delete process.env.BETTERPPTX_LOG_SECRETS

const { normalizeAddressInventory } = await import('./billing/address-inventory.mjs')
const { deriveDepositAddress, normalizeDepositXpubConfig } = await import('./billing/deposit-xpub.mjs')
const { mintPaymentEnvelope } = await import('./billing/payment-envelope.mjs')
const { startBetterPptxHttp } = await import('./server-http.mjs')

const mnemonic = 'test test test test test test test test test test test junk'
const xpub = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive("m/44'/60'/0'/0").publicExtendedKey
const depositXpub = {
	schema: 'betterpptx.deposit-xpub.v1',
	xpub,
	pathPrefix: "m/44'/60'/0'/0",
	startIndex: 0,
	labelPrefix: 'verify',
}
process.env.BETTERPPTX_DEPOSIT_XPUB_JSON = JSON.stringify(depositXpub)
delete process.env.BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON
const firstDerived = deriveDepositAddress(depositXpub, 0)
const secondDerived = deriveDepositAddress(depositXpub, 1)

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

let signingMaterialRejected = false
try {
	normalizeAddressInventory([{ address: firstDerived.address, privateKey: '0xsecret' }])
} catch (error) {
	signingMaterialRejected = error?.code === 'DEPOSIT_INVENTORY_SIGNING_MATERIAL_FORBIDDEN'
}
expect(signingMaterialRejected, 'Address inventory must reject signing material.', {})

let xpubSigningMaterialRejected = false
try {
	normalizeDepositXpubConfig({ xpub, mnemonic })
} catch (error) {
	xpubSigningMaterialRejected = error?.code === 'DEPOSIT_XPUB_SIGNING_MATERIAL_FORBIDDEN'
}
expect(xpubSigningMaterialRejected, 'Deposit xpub config must reject signing material.', {})

const port = await freePort()
const server = await startBetterPptxHttp({
	host: '127.0.0.1',
	port,
	open: true,
	publicBase: `http://127.0.0.1:${port}`,
	downloadRoot: path.join(outputDir, 'downloads'),
})
const base = `http://127.0.0.1:${port}`
const installHash = 'install_wallet_order_verify'
const firstToken = mintPaymentEnvelope({ installHash, purpose: 'topup' })
const secondToken = mintPaymentEnvelope({ installHash, purpose: 'topup' })

try {
	const selection = await fetch(`${base}/pay/orders/new?token=${encodeURIComponent(firstToken)}`, {
		headers: { Accept: 'text/html' },
	})
	const selectionHtml = await selection.text()
	expect(selection.status === 200 && selectionHtml.includes('starter_500'), 'Top-up envelope should open the pack selection page.', { status: selection.status })
	expect(!selectionHtml.includes(installHash), 'Pack selection page exposed the install hash.', {})

	const createFirst = await fetch(`${base}/pay/orders/new?token=${encodeURIComponent(firstToken)}&pack=starter_500`, {
		redirect: 'manual',
		headers: { Accept: 'text/html' },
	})
	const firstLocation = createFirst.headers.get('location')
	expect(createFirst.status === 303 && /^\/pay\/orders\/order_/.test(firstLocation || ''), 'Pack selection should create and redirect to an order.', { status: createFirst.status, firstLocation })
	const firstOrderId = firstLocation.split('/').pop()

	const firstPage = await fetch(`${base}${firstLocation}`, { headers: { Accept: 'text/html' } })
	const firstHtml = await firstPage.text()
	expect(firstPage.status === 200 && firstHtml.includes(firstDerived.address), 'Wallet page should show its single-use xpub-derived deposit address.', { status: firstPage.status })
	expect(firstHtml.includes('data:image/png;base64,'), 'Wallet page should contain a local QR code.', {})
	expect(firstHtml.includes('data-gasless-pay') && firstHtml.includes('eth_signTypedData_v4'), 'Wallet page should include the injected-wallet EIP-3009 payment path.', {})
	expect(firstHtml.includes('No Base ETH is required'), 'Gasless wallet path should explain that BetterPPTX pays network gas.', {})
	expect(firstHtml.includes('public and irreversible'), 'Wallet page should disclose public-chain and no-refund policy.', {})

	const status = await fetch(`${base}/pay/orders/${encodeURIComponent(firstOrderId)}/status`)
	const statusBody = await status.json()
	expect(status.status === 200 && statusBody.status === 'pending', 'New wallet order should begin pending.', { statusBody })
	expect(!JSON.stringify(statusBody).includes(installHash), 'Public order status exposed install identity.', { statusBody })

	const replay = await fetch(`${base}/pay/orders/new?token=${encodeURIComponent(firstToken)}&pack=starter_500`, {
		redirect: 'manual',
		headers: { Accept: 'text/html' },
	})
	expect(replay.status === 409, 'Consumed top-up envelope should fail closed on replay.', { status: replay.status })

	const createSecond = await fetch(`${base}/pay/orders/new?token=${encodeURIComponent(secondToken)}&pack=starter_500`, {
		redirect: 'manual',
		headers: { Accept: 'text/html' },
	})
	const secondLocation = createSecond.headers.get('location')
	expect(createSecond.status === 303, 'Second top-up envelope should create another order.', { status: createSecond.status })
	const secondPage = await fetch(`${base}${secondLocation}`, { headers: { Accept: 'text/html' } })
	const secondHtml = await secondPage.text()
	expect(secondHtml.includes(secondDerived.address) && !secondHtml.includes(firstDerived.address), 'Deposit addresses must be single-use across orders.', {})

	const scanner = await fetch(`${base}/internal/payments/base/scan`, { method: 'POST' })
	expect(scanner.status === 401, 'Scanner endpoint must fail closed without its private credential.', { status: scanner.status })
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}

const logText = fs.readFileSync(logFile, 'utf8')
expect(!logText.includes(firstToken) && !logText.includes(secondToken), 'Opaque payment token leaked into HTTP logs.', {})
expect(!/privateKey|0xsecret/.test(fs.readFileSync(orderFile, 'utf8')), 'Order store contains forbidden signing material.', {})

console.log('WALLET ORDER POLICY: PASS xpubSingleUseAddresses=2 envelopeReplay=blocked qr=local scanner=private')
