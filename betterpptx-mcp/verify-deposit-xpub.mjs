import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'

const outputDir = path.resolve('outputs', 'deposit-xpub-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

const { createCryptoOrderStore } = await import('./billing/crypto-orders.mjs')
const { deriveDepositAddress, normalizeDepositXpubConfig } = await import('./billing/deposit-xpub.mjs')

const mnemonic = 'test test test test test test test test test test test junk'
const xpub = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive("m/44'/60'/0'/0").publicExtendedKey
const config = {
	schema: 'betterpptx.deposit-xpub.v1',
	xpub,
	pathPrefix: "m/44'/60'/0'/0",
	startIndex: 7,
	labelPrefix: 'verify',
	fingerprint: 'verify-xpub',
}

const normalized = normalizeDepositXpubConfig(config)
const first = deriveDepositAddress(normalized, 7)
const second = deriveDepositAddress(normalized, 8)
assert.match(first.address, /^0x[0-9a-f]{40}$/)
assert.match(second.address, /^0x[0-9a-f]{40}$/)
assert.notEqual(first.address, second.address)

assert.throws(
	() => normalizeDepositXpubConfig({ xpub, seed: 'forbidden' }),
	error => error?.code === 'DEPOSIT_XPUB_SIGNING_MATERIAL_FORBIDDEN',
)

process.env.BETTERPPTX_DEPOSIT_XPUB_JSON = JSON.stringify(config)
delete process.env.BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON
process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local'
process.env.BETTERPPTX_CRYPTO_ORDER_FILE = path.join(outputDir, 'orders.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'

const store = createCryptoOrderStore()
await store.ensureAddressInventory()
const order1 = await store.createOrder({
	installHash: 'install_xpub_verify',
	envelopeJti: 'xpub-envelope-1',
	packId: 'starter_500',
})
const order2 = await store.createOrder({
	installHash: 'install_xpub_verify',
	envelopeJti: 'xpub-envelope-2',
	packId: 'starter_500',
})
assert.equal(order1.depositAddress, first.address)
assert.equal(order2.depositAddress, second.address)

const stored = JSON.parse(fs.readFileSync(path.join(outputDir, 'orders.json'), 'utf8'))
assert(!JSON.stringify(stored).includes(mnemonic), 'Local order store must not contain mnemonic.')
assert(!JSON.stringify(stored).includes('xprv'), 'Local order store must not contain xprv.')

console.log('DEPOSIT XPUB VERIFY: PASS first=' + first.address + ' second=' + second.address)
