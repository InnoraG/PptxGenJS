import * as crypto from 'node:crypto'

import { createBaseSelfSettleChain } from './x402-self-settle.mjs'
import { readRelayerLeaseStatus, relayerLeaseProviderName } from './relayer-lease.mjs'
import { paymentSurfaceReadiness } from './payment-surfaces.mjs'
import { payramReadiness } from './payram-client.mjs'
import { forwarderReadiness } from './deposit-forwarders.mjs'
import { createBaseForwarderSweepChain } from './deposit-forwarder-sweeper.mjs'
import { getBillingTelemetrySummary } from '../telemetry.mjs'

// Owner-private payment health (plan 24A.11 / 31.4). This is for authenticated
// Mission Control only. It exposes redacted relayer identity, Base ETH balance,
// estimated settlements remaining, lease state, and readiness booleans. It must
// never expose the raw relayer private key, RPC URLs, or facilitator secrets,
// and balance/address detail must never be served on a public surface.

function redactAddress(address) {
	const a = String(address || '').toLowerCase()
	if (!/^0x[0-9a-f]{40}$/.test(a)) return null
	return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function addressFingerprint(address) {
	const a = String(address || '').toLowerCase()
	if (!/^0x[0-9a-f]{40}$/.test(a)) return null
	return crypto.createHash('sha256').update(a).digest('hex').slice(0, 12)
}

function withTimeout(value, ms, label) {
	return Promise.race([
		Promise.resolve().then(() => value),
		new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms)),
	])
}

function bigintEnv(name, fallback) {
	const configured = String(process.env[name] || '').trim()
	if (configured) {
		try {
			const value = BigInt(configured)
			if (value >= 0n) return value
		} catch {}
	}
	return fallback
}

// ~0.000000866 ETH median observed for canonical Base USDC transferWithAuthorization (plan 25.4).
function sampleSettlementFeeWei() {
	return bigintEnv('BETTERPPTX_X402_SAMPLE_SETTLEMENT_FEE_WEI', 866_000_000_000n)
}

// Alert below 0.001 ETH (plan 25.4).
function lowBalanceThresholdWei() {
	return bigintEnv('BETTERPPTX_X402_RELAYER_LOW_BALANCE_WEI', 1_000_000_000_000_000n)
}

function forwarderSweeperLowBalanceThresholdWei() {
	return bigintEnv('BETTERPPTX_FORWARDER_SWEEPER_LOW_BALANCE_WEI', lowBalanceThresholdWei())
}

function sampleForwarderSweepFeeWei() {
	return bigintEnv('BETTERPPTX_FORWARDER_SWEEP_SAMPLE_FEE_WEI', 2_000_000_000_000n)
}

function formatEth(wei) {
	const text = wei.toString().padStart(19, '0')
	const intPart = text.slice(0, -18).replace(/^0+(?=\d)/, '')
	const frac = text.slice(-18).replace(/0+$/, '')
	return frac ? `${intPart}.${frac}` : intPart
}

function formatUsdcAtoms(atoms) {
	let value = 0n
	try { value = BigInt(String(atoms || '0')) } catch {}
	if (value <= 0n) return '0'
	const intPart = value / 1_000_000n
	const frac = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
	return frac ? `${intPart}.${frac}` : intPart.toString()
}

function classifyError(error) {
	if (error?.code) return String(error.code)
	const message = String(error?.message || '')
	if (message.startsWith('timeout:')) return 'TIMEOUT'
	return 'PROBE_FAILED'
}

function forwarderSweeperTelemetry() {
	const billing = getBillingTelemetrySummary()
	return {
		runs: Number(billing.forwarderSweeperRuns || 0),
		failures: Number(billing.forwarderSweeperFailures || 0),
		lastSuccessAt: billing.forwarderSweeperLastSuccessAt || null,
		lastFailureAt: billing.forwarderSweeperLastFailureAt || null,
		lastDryRun: billing.forwarderSweeperLastDryRun === true,
		lastScanned: Number(billing.forwarderSweeperLastScanned || 0),
		lastEligible: Number(billing.forwarderSweeperLastEligible || 0),
		lastBatches: Number(billing.forwarderSweeperLastBatches || 0),
		lastSubmitted: Number(billing.forwarderSweeperLastSubmitted || 0),
		lastFailed: Number(billing.forwarderSweeperLastFailed || 0),
		lastTokenUsdcQueued: formatUsdcAtoms(billing.forwarderSweeperLastTokenAtomsQueued || '0'),
		stalledFloatUsdcEstimate: formatUsdcAtoms(billing.forwarderSweeperStalledTokenAtomsEstimate || '0'),
	}
}

async function buildForwarderSweeperHealth({ forwarderStatus, chain = null, probeTimeoutMs = 6000 } = {}) {
	const lastSweep = forwarderSweeperTelemetry()
	const base = {
		enabled: !!forwarderStatus?.enabled,
		configured: !!forwarderStatus?.configured,
		ready: !forwarderStatus?.enabled,
		missing: Array.isArray(forwarderStatus?.missing) ? forwarderStatus.missing : [],
		lastSweep,
	}
	if (!forwarderStatus?.enabled) return base
	if (!forwarderStatus.configured) return { ...base, ready: false }
	try {
		const resolvedChain = chain && typeof chain.forwarderSweeperStatus === 'function'
			? chain
			: createBaseForwarderSweepChain({ config: forwarderStatus.config })
		const status = await withTimeout(resolvedChain.forwarderSweeperStatus(), probeTimeoutMs, 'forwarder-sweeper-status')
		const balanceWei = (() => { try { return BigInt(status.balanceWei || '0') } catch { return 0n } })()
		const lowWei = forwarderSweeperLowBalanceThresholdWei()
		const feeWei = sampleForwarderSweepFeeWei()
		const chainId = Number(status.chainId || 0)
		const onBaseMainnet = chainId === 8453
		return {
			...base,
			configured: true,
			ready: balanceWei > lowWei && onBaseMainnet,
			addressRedacted: redactAddress(status.sweeperAddress),
			addressFingerprint: addressFingerprint(status.sweeperAddress),
			chainId,
			onBaseMainnet,
			balanceEth: formatEth(balanceWei),
			estimatedSweepBatchesRemaining: feeWei > 0n ? Number(balanceWei / feeWei) : null,
			lowBalance: balanceWei <= lowWei,
			lowBalanceThresholdEth: formatEth(lowWei),
		}
	} catch (error) {
		return { ...base, ready: false, error: classifyError(error) }
	}
}

export async function buildPaymentHealth({ probeTimeoutMs = 6000, chain = null } = {}) {
	const settlementMode = String(process.env.BETTERPPTX_X402_SETTLEMENT_MODE || 'self_settle').trim().toLowerCase()
	const forwarderStatus = forwarderReadiness()
	const readiness = (() => {
		try { return paymentSurfaceReadiness({ includeRequirements: true }).readiness }
		catch { return null }
	})()

	const health = {
		checkedAt: new Date().toISOString(),
		settlementMode,
		readiness: readiness ? {
			privateCanaryReady: !!readiness.privateCanaryReady,
			publicProductionReady: !!readiness.publicProductionReady,
			missing: Array.isArray(readiness.missing) ? readiness.missing : [],
		} : null,
		relayer: { configured: false, ready: false },
		lease: { provider: 'unknown', shared: false },
		payram: payramReadiness(),
		forwarder: forwarderStatus,
		forwarderSweeper: { enabled: false, configured: false, ready: true },
		paymentsReady: false,
	}

	if (settlementMode === 'self_settle') {
		try {
			const resolvedChain = chain || createBaseSelfSettleChain()
			const status = await withTimeout(resolvedChain.relayerStatus(), probeTimeoutMs, 'relayer-status')
			const balanceWei = (() => { try { return BigInt(status.balanceWei || '0') } catch { return 0n } })()
			const feeWei = sampleSettlementFeeWei()
			const lowWei = lowBalanceThresholdWei()
			health.relayer = {
				configured: true,
				ready: balanceWei > lowWei,
				addressRedacted: redactAddress(status.relayerAddress),
				addressFingerprint: addressFingerprint(status.relayerAddress),
				balanceEth: formatEth(balanceWei),
				estimatedSettlementsRemaining: feeWei > 0n ? Number(balanceWei / feeWei) : null,
				lowBalance: balanceWei <= lowWei,
				lowBalanceThresholdEth: formatEth(lowWei),
			}
		} catch (error) {
			const code = classifyError(error)
			health.relayer = { configured: code !== 'X402_RELAYER_NOT_CONFIGURED', ready: false, error: code }
		}
	} else {
		health.relayer = { configured: false, ready: true, note: 'facilitator-mode' }
	}

	try {
		const lease = await withTimeout(readRelayerLeaseStatus(), probeTimeoutMs, 'lease-status')
		health.lease = {
			provider: lease.provider,
			shared: !!lease.shared,
			state: lease.state || (lease.active ? 'active' : 'idle'),
		}
	} catch (error) {
		let provider = 'unknown'
		try { provider = relayerLeaseProviderName() } catch {}
		health.lease = { provider, shared: false, error: classifyError(error) }
	}

	health.forwarderSweeper = await buildForwarderSweeperHealth({
		forwarderStatus,
		chain,
		probeTimeoutMs,
	})

	const leaseOk = health.lease.shared || settlementMode !== 'self_settle'
	const relayerOk = settlementMode !== 'self_settle' || health.relayer.ready
	const forwarderSweeperOk = !forwarderStatus.enabled || health.forwarderSweeper.ready
	health.paymentsReady = Boolean(readiness?.privateCanaryReady) && relayerOk && leaseOk && forwarderSweeperOk
	return health
}
