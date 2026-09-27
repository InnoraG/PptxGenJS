import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { createCryptoOrderStore } from './billing/crypto-orders.mjs'
import { deriveForwarderSalt, predictForwarderAddress } from './billing/deposit-forwarders.mjs'
import { sweepForwarderHotWindow } from './billing/deposit-forwarder-sweeper.mjs'

const outputDir = path.resolve('outputs', 'forwarder-sweeper-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

const saltSecret = 'forwarder sweeper verifier salt secret 0123456789abcdef'
const factoryAddress = '0x2000000000000000000000000000000000000002'
const initCodeHash = `0x${'12'.repeat(32)}`
const collector = '0x3000000000000000000000000000000000000003'

process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local'
process.env.BETTERPPTX_CRYPTO_ORDER_FILE = path.join(outputDir, 'orders.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'local'
process.env.BETTERPPTX_RAW_SEND_RAIL = 'forwarder'
process.env.BETTERPPTX_FORWARDER_FACTORY_ADDRESS = factoryAddress
process.env.BETTERPPTX_FORWARDER_CODEHASH = initCodeHash
process.env.BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS = collector
process.env.BETTERPPTX_FORWARDER_SALT_SECRET = saltSecret
process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY = `0x${'77'.repeat(32)}`
process.env.BETTERPPTX_FORWARDER_BATCH_SIZE = '1'
process.env.BETTERPPTX_FORWARDER_CANARY_MAX_USDC = '10'

const store = createCryptoOrderStore()
const paidOrder = await store.createOrder({
	orderId: 'order_forwarder_sweep_paid',
	installHash: 'install_forwarder_sweep',
	customerHash: 'customer_forwarder_sweep',
	envelopeJti: 'forwarder-sweep-envelope-paid',
	packId: 'starter_500',
})
const emptyOrder = await store.createOrder({
	orderId: 'order_forwarder_sweep_empty',
	installHash: 'install_forwarder_sweep',
	customerHash: 'customer_forwarder_sweep',
	envelopeJti: 'forwarder-sweep-envelope-empty',
	packId: 'starter_500',
})

await assert.rejects(
	() => store.createOrder({
		orderId: 'order_forwarder_sweep_over_cap',
		installHash: 'install_forwarder_sweep',
		customerHash: 'customer_forwarder_sweep',
		envelopeJti: 'forwarder-sweep-envelope-over-cap',
		packId: 'builder_1500',
	}),
	error => error?.code === 'FORWARDER_CANARY_CAP_EXCEEDED',
)

const paidSalt = deriveForwarderSalt({
	orderId: 'order_forwarder_sweep_paid',
	customerHash: 'customer_forwarder_sweep',
	packId: 'starter_500',
	nonce: 'forwarder-sweep-envelope-paid',
}, saltSecret)
const expectedPaidAddress = predictForwarderAddress({ factoryAddress, salt: paidSalt, initCodeHash })
assert.equal(paidOrder.depositAddress, expectedPaidAddress, 'Paid test order should expose the predicted forwarder address.')

const balances = new Map([
	[paidOrder.depositAddress, 5_000_000n],
	[emptyOrder.depositAddress, 0n],
])
const calls = []
const fakeChain = {
	async chainId() { return 8453 },
	async balanceOf(address) { return balances.get(String(address || '').toLowerCase()) || 0n },
	async sweepMany(salts) {
		calls.push(salts)
		return `0x${'ab'.repeat(32)}`
	},
}

const dryRun = await sweepForwarderHotWindow({ store, chain: fakeChain, dryRun: true })
assert.equal(dryRun.scanned, 2)
assert.equal(dryRun.eligible, 1)
assert.equal(dryRun.skippedEmpty, 1)
assert.equal(dryRun.tokenAtomsQueued, '5000000')
assert.equal(calls.length, 0, 'Dry run must not submit sweep transactions.')
assert(!JSON.stringify(dryRun).includes(saltSecret), 'Dry-run summary must not leak salt secret.')
assert(!JSON.stringify(dryRun).includes(process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY), 'Dry-run summary must not leak sweeper key.')

const submitted = await sweepForwarderHotWindow({ store, chain: fakeChain })
assert.equal(submitted.scanned, 2)
assert.equal(submitted.eligible, 1)
assert.equal(submitted.batches, 1)
assert.equal(submitted.submitted, 1)
assert.deepEqual(calls, [[paidSalt]], 'Sweeper should submit only funded eligible salts.')
assert(!JSON.stringify(submitted).includes(paidSalt), 'Submitted summary must not leak raw salts.')

process.env.BETTERPPTX_FORWARDER_CANARY_MAX_USDC = '1'
const capped = await sweepForwarderHotWindow({ store, chain: fakeChain })
assert.equal(capped.eligible, 0)
assert.equal(capped.skippedCanaryCap, 1)

const serverSource = fs.readFileSync(path.resolve('betterpptx-mcp', 'server-http.mjs'), 'utf8')
assert(serverSource.includes('/internal/payments/forwarders/sweep'), 'HTTP server must expose the internal forwarder sweep route.')
assert(serverSource.includes('x-betterpptx-scanner-token'), 'Forwarder sweep route must support a header token instead of query-string secrets.')
assert(serverSource.includes('sweepForwarderHotWindow'), 'Forwarder sweep route must call the sweeper module.')

const deploySource = fs.readFileSync(path.resolve('deploy', 'gcp', 'deploy-mcp-crypto-production.ps1'), 'utf8')
assert(deploySource.includes('Ensure-ForwarderSweepScheduler'), 'Deploy script must wire an external Scheduler trigger for forwarder sweeps.')
assert(deploySource.includes('/internal/payments/forwarders/sweep'), 'Deploy script must target the forwarder sweep route.')
assert(deploySource.includes('$EnableForwarderRawSend'), 'Forwarder sweep Scheduler must be gated by the explicit forwarder raw-send switch.')
assert(!deploySource.includes('x-betterpptx-scanner-token=$scannerToken`n'), 'Scanner token must not be printed directly.')

console.log('FORWARDER SWEEPER: PASS dryRun=1 fundedOnly=1 batched=1 cap=1 scheduler=1 redacted=1')
