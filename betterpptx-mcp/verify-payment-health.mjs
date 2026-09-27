import assert from 'node:assert'
import * as fs from 'node:fs'

import { buildPaymentHealth } from './billing/payment-health.mjs'
import { recordForwarderSweeperTelemetry } from './telemetry.mjs'

const FULL_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
const FULL_SWEEPER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const SWEEPER_KEY = `0x${'11'.repeat(32)}`

function fakeChain(balanceWei, {
	sweeperBalanceWei = '3000000000000000',
	sweeperAddress = FULL_SWEEPER_ADDRESS,
	chainId = 8453,
} = {}) {
	return {
		async relayerStatus() {
			return { relayerAddress: FULL_ADDRESS, balanceWei: String(balanceWei) }
		},
		async forwarderSweeperStatus() {
			return { sweeperAddress, balanceWei: String(sweeperBalanceWei), chainId }
		},
	}
}

function clearForwarderEnv() {
	for (const name of [
		'BETTERPPTX_RAW_SEND_RAIL',
		'BETTERPPTX_FORWARDER_FACTORY_ADDRESS',
		'BETTERPPTX_FORWARDER_CODEHASH',
		'BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS',
		'BETTERPPTX_FORWARDER_SALT_SECRET',
		'BETTERPPTX_FORWARDER_SWEEPER_KEY',
		'BETTERPPTX_FORWARDER_SWEEPER_LOW_BALANCE_WEI',
		'BETTERPPTX_FORWARDER_SWEEP_SAMPLE_FEE_WEI',
	]) delete process.env[name]
}

function enableForwarderEnv({ sweeperKey = SWEEPER_KEY } = {}) {
	process.env.BETTERPPTX_RAW_SEND_RAIL = 'forwarder'
	process.env.BETTERPPTX_FORWARDER_FACTORY_ADDRESS = '0x2222222222222222222222222222222222222222'
	process.env.BETTERPPTX_FORWARDER_CODEHASH = `0x${'33'.repeat(32)}`
	process.env.BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS = '0x4444444444444444444444444444444444444444'
	process.env.BETTERPPTX_FORWARDER_SALT_SECRET = 'forwarder-health-salt-secret-0123456789abcdef'
	if (sweeperKey === null) delete process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY
	else process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY = sweeperKey
}

// 1) Self-settle, healthy balance (0.005 ETH).
clearForwarderEnv()
process.env.BETTERPPTX_X402_SETTLEMENT_MODE = 'self_settle'
const healthy = await buildPaymentHealth({ chain: fakeChain('5000000000000000') })
assert.equal(healthy.settlementMode, 'self_settle', 'settlement mode reported')
assert.equal(healthy.relayer.configured, true, 'relayer configured')
assert.equal(healthy.relayer.ready, true, 'healthy balance is ready')
assert.equal(healthy.relayer.balanceEth, '0.005', 'balance formatted as ETH')
assert.equal(healthy.relayer.lowBalance, false, 'healthy balance not flagged low')
assert.ok(healthy.relayer.estimatedSettlementsRemaining > 5000, 'estimated settlements computed')
assert.equal(healthy.relayer.addressRedacted, '0x1234…5678', 'address redacted')
assert.match(healthy.relayer.addressFingerprint, /^[0-9a-f]{12}$/, 'address fingerprint present')

// Redaction: the raw relayer address must never appear anywhere in the payload.
assert.ok(!JSON.stringify(healthy).includes(FULL_ADDRESS), 'raw relayer address never serialized')
assert.equal(typeof healthy.paymentsReady, 'boolean', 'paymentsReady is a boolean')

// 2) Self-settle, low balance (0.0005 ETH) below the 0.001 ETH threshold.
clearForwarderEnv()
const low = await buildPaymentHealth({ chain: fakeChain('500000000000000') })
assert.equal(low.relayer.ready, false, 'low balance not ready')
assert.equal(low.relayer.lowBalance, true, 'low balance flagged')

// 3) Self-settle, relayer not configured -> probe error, never throws.
clearForwarderEnv()
const broken = await buildPaymentHealth({
	chain: { async relayerStatus() { const e = new Error('no key'); e.code = 'X402_RELAYER_NOT_CONFIGURED'; throw e } },
})
assert.equal(broken.relayer.ready, false, 'unconfigured relayer not ready')
assert.equal(broken.relayer.configured, false, 'unconfigured relayer reported as not configured')
assert.equal(broken.relayer.error, 'X402_RELAYER_NOT_CONFIGURED', 'probe error code surfaced')

// 4) Forwarder sweeper health is owner-private, redacted, and uses the keeper gas balance.
enableForwarderEnv()
recordForwarderSweeperTelemetry({
	ok: true,
	summary: {
		dryRun: false,
		scanned: 6,
		eligible: 2,
		batches: 1,
		submitted: 1,
		failed: 0,
		tokenAtomsQueued: '1234567',
	},
	at: '2026-06-17T13:00:00.000Z',
})
const forwarderHealthy = await buildPaymentHealth({ chain: fakeChain('5000000000000000', { sweeperBalanceWei: '3000000000000000' }) })
assert.equal(forwarderHealthy.forwarder.enabled, true, 'forwarder rail enabled')
assert.equal(forwarderHealthy.forwarderSweeper.configured, true, 'forwarder sweeper configured')
assert.equal(forwarderHealthy.forwarderSweeper.ready, true, 'funded sweeper is ready')
assert.equal(forwarderHealthy.forwarderSweeper.addressRedacted, '0xabcd…abcd', 'sweeper address redacted')
assert.match(forwarderHealthy.forwarderSweeper.addressFingerprint, /^[0-9a-f]{12}$/, 'sweeper address fingerprint present')
assert.equal(forwarderHealthy.forwarderSweeper.lowBalance, false, 'funded sweeper not low')
assert.equal(forwarderHealthy.forwarderSweeper.lastSweep.lastSuccessAt, '2026-06-17T13:00:00.000Z', 'last sweep time surfaced')
assert.equal(forwarderHealthy.forwarderSweeper.lastSweep.lastBatches, 1, 'last sweep batch count surfaced')
assert.equal(forwarderHealthy.forwarderSweeper.lastSweep.lastTokenUsdcQueued, '1.234567', 'queued USDC atoms formatted')
assert.equal(forwarderHealthy.forwarderSweeper.lastSweep.stalledFloatUsdcEstimate, '0', 'successful sweep has no stalled float estimate')
const forwarderHealthyJson = JSON.stringify(forwarderHealthy)
assert.ok(!forwarderHealthyJson.includes(FULL_SWEEPER_ADDRESS), 'raw sweeper address never serialized')
assert.ok(!forwarderHealthyJson.includes(SWEEPER_KEY), 'sweeper private key never serialized')

const forwarderLow = await buildPaymentHealth({ chain: fakeChain('5000000000000000', { sweeperBalanceWei: '500000000000000' }) })
assert.equal(forwarderLow.forwarderSweeper.ready, false, 'low sweeper gas not ready')
assert.equal(forwarderLow.forwarderSweeper.lowBalance, true, 'low sweeper gas flagged')

enableForwarderEnv({ sweeperKey: null })
const forwarderUnconfigured = await buildPaymentHealth({ chain: fakeChain('5000000000000000') })
assert.equal(forwarderUnconfigured.forwarderSweeper.ready, false, 'missing sweeper key is not ready')
assert(forwarderUnconfigured.forwarderSweeper.missing.includes('BETTERPPTX_FORWARDER_SWEEPER_KEY'), 'missing sweeper key surfaced')

// 5) Facilitator mode does not touch the relayer chain.
clearForwarderEnv()
process.env.BETTERPPTX_X402_SETTLEMENT_MODE = 'cdp_facilitator'
const facilitator = await buildPaymentHealth({
	chain: { async relayerStatus() { throw new Error('chain must not be called in facilitator mode') } },
})
assert.equal(facilitator.relayer.note, 'facilitator-mode', 'facilitator mode noted')
assert.equal(facilitator.relayer.ready, true, 'facilitator mode does not require relayer balance')
assert.ok(!facilitator.relayer.error, 'facilitator mode did not invoke the chain probe')

const missionControlSource = fs.readFileSync(new URL('./mission-control.mjs', import.meta.url), 'utf8')
assert(missionControlSource.includes('/ops/mission-control/payment-health'), 'Mission Control page should fetch live payment health.')
assert(missionControlSource.includes('Forwarder sweeper'), 'Mission Control page should render forwarder sweeper health.')
assert(missionControlSource.includes('PayRam hot wallet gas'), 'Mission Control page should explain the PayRam hot-wallet gas status boundary.')
assert(missionControlSource.includes('show-betterpptx-gas-wallet-status.ps1'), 'Mission Control page should point owner-private PayRam hot-wallet gas checks to the operator CLI.')
assert(!missionControlSource.includes('BETTERPPTX_FORWARDER_SWEEPER_KEY</'), 'Mission Control page must not render the sweeper key name as a value.')
assert(!missionControlSource.includes('BETTERPPTX_PAYRAM_HOT_WALLET_PRIVATE_KEY</'), 'Mission Control page must not render the PayRam hot-wallet key name as a value.')

process.env.BETTERPPTX_X402_SETTLEMENT_MODE = 'self_settle'
clearForwarderEnv()

console.log('PAYMENT HEALTH: PASS healthy=1 lowBalance=1 unconfigured=1 facilitator=1 forwarderSweeper=1 redacted=1')
