import { configuredCryptoPacks } from './crypto-packs.mjs'
import { tryMintPaymentEnvelope } from './payment-envelope.mjs'
import { forwarderReadiness } from './deposit-forwarders.mjs'
import { relayerLeaseProviderName } from './relayer-lease.mjs'
import { lockedAssetStoreReadiness } from '../storage/locked-asset-store.mjs'
import { deckSnapshotReadiness } from '../storage/deck-snapshot-store.mjs'
import { deckStateReadiness } from '../storage/deck-state-store.mjs'
import { operationStoreReadiness } from '../storage/operation-store.mjs'
import { operationDispatcherReadiness } from '../queue/operation-dispatcher.mjs'
import { paymentPublicEnableReady } from './payment-launch-evidence.mjs'
import { promoReadiness } from './promo-codes.mjs'
import { payramReadiness } from './payram-client.mjs'
import { paymentNetworkReadiness } from './base-network.mjs'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])

function enabled(name) {
	return ENABLED_VALUES.has(String(process.env[name] || '').trim().toLowerCase())
}

function present(name, minimumLength = 1) {
	return String(process.env[name] || '').trim().length >= minimumLength
}

function httpsUrl(value) {
	const text = String(value || '').trim().replace(/\/+$/, '')
	if (/^https:\/\//i.test(text)) return text
	try {
		const url = new URL(text)
		const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
		return local && process.env.BETTERPPTX_ALLOW_LOCAL_PAYMENT_HTTP === '1' ? text : null
	} catch {
		return null
	}
}

function validAddress(value) {
	return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim())
}

function validPrivateKey(value) {
	return /^0x[0-9a-fA-F]{64}$/.test(String(value || '').trim())
}

function configuredPaymentBase(explicitBase = '') {
	return httpsUrl(explicitBase)
		|| httpsUrl(process.env.BETTERPPTX_PAYMENT_BASE_URL)
		|| httpsUrl(process.env.BETTERPPTX_PUBLIC_BASE)
}

function configuredMcpUrl(paymentBase = '') {
	return httpsUrl(process.env.BETTERPPTX_PUBLIC_MCP_URL)
		|| (paymentBase ? `${paymentBase}/mcp` : null)
}

function topUpUrl({ paymentBase, installHash }) {
	if (!paymentBase || !installHash) return null
	const token = tryMintPaymentEnvelope({ purpose: 'topup', installHash })
	return token ? `${paymentBase}/pay/orders/new?token=${encodeURIComponent(token)}` : null
}

function requirement(id, ready, description) {
	return { id, ready: Boolean(ready), description }
}

export function paymentSurfaceReadiness({
	installHash = '',
	publicBase = '',
	includeRequirements = false,
} = {}) {
	const cryptoBilling = String(process.env.BETTERPPTX_BILLING_PROVIDER || '').trim().toLowerCase() === 'crypto_credits'
	const payPerJob = String(process.env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'pay_per_job'
	const billingEnforced = enabled('BETTERPPTX_BILLING_ENFORCE')
	const monetizedMcp = enabled('BETTERPPTX_MONETIZED_MCP_ENABLED')
	const payramEnabled = enabled('BETTERPPTX_PAYRAM_ENABLED')
	const requireCardOnramp = enabled('BETTERPPTX_REQUIRE_CARD_ONRAMP')
	const payramExactQuoteEnabled = enabled('BETTERPPTX_PAYRAM_EXACT_QUOTE_ENABLED')
	const paymentBase = configuredPaymentBase(publicBase)
	const publicMcpUrl = configuredMcpUrl(paymentBase)
	const networkState = paymentNetworkReadiness({ env: process.env, payramEnabled: false })
	const paymentNetwork = networkState.selected
		|| { network: null, chainId: null, tokenContract: null, displayName: null, tokenSymbol: 'USDC' }
	const payramState = payramReadiness()
	const envelopeReady = present('BETTERPPTX_PAYMENT_ENVELOPE_SECRET', 32)
	const installIdentityReady = present('BETTERPPTX_INSTALL_HMAC_SECRET', 32)
	const treasuryReady = validAddress(process.env.BETTERPPTX_TREASURY_EVM_ADDRESS)
	const rpcReady = Boolean(httpsUrl(process.env.BETTERPPTX_BASE_RPC_URL))
	const settlementMode = String(process.env.BETTERPPTX_X402_SETTLEMENT_MODE || 'self_settle').trim().toLowerCase()
	const relayerReady = validPrivateKey(process.env.BETTERPPTX_X402_RELAYER_PRIVATE_KEY)
	const facilitatorUrl = httpsUrl(process.env.BETTERPPTX_X402_FACILITATOR_URL)
	const facilitatorAuthReady = !facilitatorUrl || present('BETTERPPTX_X402_FACILITATOR_TOKEN', 16)
	const facilitatorReady = settlementMode === 'cdp_facilitator' && Boolean(facilitatorUrl && facilitatorAuthReady)
	const selfSettlementReady = settlementMode === 'self_settle' && relayerReady
	const settlementReady = facilitatorReady || selfSettlementReady
	const inventoryReady = present('BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON')
	const xpubReady = present('BETTERPPTX_DEPOSIT_XPUB_JSON') || present('BETTERPPTX_DEPOSIT_XPUB')
	const rawSendForwarder = forwarderReadiness()
	const forwarderReady = rawSendForwarder.enabled === true && rawSendForwarder.configured === true
	const payramBaseReady = Boolean(httpsUrl(process.env.BETTERPPTX_PAYRAM_BASE_URL))
	const payramApiReady = present('BETTERPPTX_PAYRAM_API_KEY', 16)
	const payramWebhookReady = present('BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN', 16)
	const promotions = promoReadiness({ env: process.env })
	const sharedLedger = process.env.BETTERPPTX_BILLING_LEDGER_STORE === 'firestore'
	const sharedOrders = process.env.BETTERPPTX_CRYPTO_ORDER_STORE === 'firestore'
	const sharedQuotes = process.env.BETTERPPTX_X402_STORE === 'firestore'
	const sharedUsage = process.env.BETTERPPTX_INSTALL_USAGE_STORE === 'firestore'
	const sharedRelayerLease = settlementMode !== 'self_settle' || relayerLeaseProviderName() === 'firestore'
	const sharedStoresRequired = enabled('BETTERPPTX_REQUIRE_SHARED_STORES')
	const sharedJobPaymentState = sharedQuotes && sharedUsage && sharedRelayerLease
	const singleInstance = String(process.env.BETTERPPTX_MCP_MAX_INSTANCES || '') === '1'
	const processLocalAccepted = process.env.BETTERPPTX_EDIT_STATE_MODE === 'process-local'
		&& enabled('BETTERPPTX_EDIT_STATE_SINGLE_INSTANCE_ACCEPTED')
		&& singleInstance
	const deckState = deckStateReadiness()
	const deckSpecState = deckSnapshotReadiness()
	const lockedAssetState = lockedAssetStoreReadiness()
	const operationState = operationStoreReadiness()
	const operationDispatcherState = operationDispatcherReadiness()
	const statelessGatewayReady = enabled('BETTERPPTX_HTTP_STATELESS_MCP')
		|| String(process.env.BETTERPPTX_MCP_TRANSPORT_MODE || '').trim().toLowerCase() === 'stateless'
	const distributedRuntimeVerified = enabled('BETTERPPTX_DISTRIBUTED_RUNTIME_VERIFIED')
	const publicPaymentEvidenceReady = paymentPublicEnableReady()

	const directTransferReady = cryptoBilling && networkState.ready && paymentBase && envelopeReady && (forwarderReady || xpubReady || inventoryReady) && rpcReady
	const gaslessBrowserReady = cryptoBilling && networkState.ready && paymentBase && envelopeReady && treasuryReady && rpcReady && settlementReady
	// PayRam's project API key authenticates create/status calls and the
	// provider webhook. The custom token is a separate BetterPPTX-only guard
	// for the optional internal reconcile endpoint and must not make checkout
	// appear unavailable when the PayRam API integration itself is ready.
	const payramCardOnrampReady = Boolean(cryptoBilling && paymentBase && payramEnabled && payramState.configured && payramBaseReady && payramApiReady)
	const cardOnrampPolicyReady = !requireCardOnramp || payramCardOnrampReady
	const webReady = Boolean(directTransferReady || gaslessBrowserReady || payramCardOnrampReady)
	const appReady = Boolean(webReady && publicMcpUrl && installIdentityReady)
	const agenticReady = Boolean(
		(cryptoBilling || payPerJob)
		&& monetizedMcp
		&& (payPerJob || installIdentityReady)
		&& envelopeReady
		&& treasuryReady
		&& rpcReady
		&& networkState.ready
		&& settlementReady
	)
	// Pay-per-job does not need the legacy customer ledger or credit-order store
	// to authorize new work. It still needs shared quote, usage, and relayer
	// state so a restart or second instance cannot replay payment or execution.
	const storageReady = !sharedStoresRequired || (payPerJob ? sharedJobPaymentState : (sharedLedger && sharedOrders && sharedQuotes && sharedUsage && sharedRelayerLease))
	const paymentCoreReady = Boolean(
		(cryptoBilling || payPerJob)
		&& billingEnforced
		&& agenticReady
		&& storageReady
		&& (payPerJob || (webReady && appReady && cardOnrampPolicyReady))
	)
	const privateCanaryReady = Boolean(
		paymentCoreReady
		&& processLocalAccepted
	)
	const durableDeckStateReady = process.env.BETTERPPTX_EDIT_STATE_MODE === 'distributed'
		&& deckState.publicProductionEligible === true
		&& deckSpecState.publicProductionEligible === true
		&& lockedAssetState.publicProductionEligible === true
	const durableOperationStateReady = operationState.publicProductionEligible === true
	const durableOperationDispatchReady = operationDispatcherState.publicProductionEligible === true
	const publicProductionReady = Boolean(
		paymentCoreReady
		&& durableDeckStateReady
		&& durableOperationStateReady
		&& durableOperationDispatchReady
		&& statelessGatewayReady
		&& distributedRuntimeVerified
		&& publicPaymentEvidenceReady
	)

	const requirements = [
		requirement('payment-network', networkState.ready, networkState.ready
			? `Payment routes are bound to ${paymentNetwork.displayName} (chain ${paymentNetwork.chainId}) and ${paymentNetwork.tokenSymbol}.`
			: `Payment network configuration is unavailable: ${[...(networkState.missing || []), ...(networkState.errors || [])].join(', ') || 'unknown configuration error'}.`),
		requirement('crypto-billing', cryptoBilling || payPerJob, payPerJob ? 'Accountless x402 payment-per-bounded-job billing is active.' : 'Prepaid crypto-credit billing is active.'),
		requirement('billing-enforcement', billingEnforced, payPerJob ? 'Billable operations require an exact settled job payment.' : 'Billable operations enforce the credit balance.'),
		requirement('public-payment-origin', paymentBase, 'A public HTTPS payment origin is configured.'),
		requirement('anonymous-install-identity', payPerJob || installIdentityReady, payPerJob ? 'Payment-per-job recovery uses an opaque job credential; no reusable installation balance is required.' : 'Anonymous installations can be bound consistently.'),
		requirement('opaque-payment-links', envelopeReady, payPerJob ? 'Opaque job-bound payment contexts can be minted.' : 'Identity-bound payment links can be minted.'),
		requirement('treasury', treasuryReady, 'The USDC treasury destination is configured.'),
		requirement('base-rpc', rpcReady && networkState.ready, `${paymentNetwork.displayName || 'The configured Base network'} verification is configured.`),
		requirement('x402-settlement-route', settlementReady, 'A gas-sponsoring facilitator or self-hosted gas relayer is configured.'),
		requirement('gas-relayer', settlementMode !== 'self_settle' || relayerReady, settlementMode === 'self_settle'
			? 'The self-hosted EIP-3009 gas relayer is configured.'
			: 'A local gas relayer is not required in facilitator mode.'),
		requirement('facilitator', settlementMode !== 'cdp_facilitator' || facilitatorReady, settlementMode === 'cdp_facilitator'
			? 'The gas-sponsoring x402 facilitator and required authentication are configured.'
			: 'A hosted facilitator is not required in self-settlement mode.'),
		requirement('direct-transfer-addresses', payPerJob || forwarderReady || xpubReady || inventoryReady, payPerJob ? 'Direct-transfer top-ups are not required by the x402 job route.' : 'Single-use direct-transfer addresses are available through CREATE2 forwarders, xpub private canary, or inventory fallback.'),
		requirement('payram-card-onramp', (!payramEnabled && !requireCardOnramp) || payramCardOnrampReady, payPerJob
			? 'PayRam is an optional wallet-funding/onramp surface; it is not the x402 job-settlement rail.'
			: (payramEnabled || requireCardOnramp
				? 'PayRam card-to-crypto credits are enabled only when the HTTPS API origin, API key, and webhook verifier are configured.'
				: 'PayRam card-to-crypto credits are disabled by default.')),
		requirement('agentic-x402', monetizedMcp, 'Agent-native purchase discovery is enabled.'),
		requirement('shared-payment-state', storageReady, payPerJob
		? 'Shared x402 quote, usage, and fenced-settlement state meet the pay-per-job policy; legacy credit stores are retained only for migration evidence.'
		: 'Payment and usage state meet the shared-store policy.'),
		requirement('shared-relayer-lease', sharedRelayerLease, settlementMode === 'self_settle'
			? 'Self-settlement relayer broadcasts use a shared fenced lease.'
			: 'Hosted facilitator mode does not require a local relayer lease.'),
		requirement('stateless-mcp-gateway', statelessGatewayReady, 'Public production requires stateless Streamable HTTP MCP routing.'),
		requirement('durable-deck-state', durableDeckStateReady, 'Public production requires distributed deck heads, canonical deck specs, and shared locked assets.'),
		requirement('durable-operation-state', durableOperationStateReady, 'Public production requires a distributed operation ledger with idempotency, leases, and fencing.'),
		requirement('durable-operation-dispatch', durableOperationDispatchReady, 'Public production requires Cloud Tasks-compatible durable operation dispatch.'),
		requirement('distributed-runtime-verified', distributedRuntimeVerified, 'Public production requires the distributed runtime and failure campaign to pass before readiness is asserted.'),
		requirement('payment-public-enable-evidence', publicPaymentEvidenceReady, 'Public production requires PayRam, OCI, backup/restore, alert, forwarder custody, and forwarder proof evidence to be recorded.'),
		requirement('single-instance-edit-state', processLocalAccepted, 'Process-local edit state is pinned to one instance.'),
	]

	const surfaces = {
		web: {
			enabled: payPerJob ? Boolean(paymentBase) : webReady,
			entryUrl: payPerJob ? null : topUpUrl({ paymentBase, installHash }),
			methods: {
				gaslessEip3009: gaslessBrowserReady,
				directUsdcTransfer: directTransferReady,
				mobileWalletQr: directTransferReady,
				payramCardOnramp: payramCardOnrampReady,
			},
			cardOnramp: {
				enabled: payramCardOnrampReady,
				provider: payramEnabled ? 'payram' : null,
				mode: payPerJob ? 'wallet_funding_onramp_only_not_job_settlement' : 'fixed_credit_packs',
				exactQuoteEnabled: Boolean(payramCardOnrampReady && payramExactQuoteEnabled),
				requiredForProduction: requireCardOnramp,
				reconcileReady: payramWebhookReady,
				promotions: {
					...promotions,
					redemptionTool: payPerJob ? null : 'betterpptx.billing.redeem_promo',
					mode: payPerJob ? 'job-sponsorship-not-configured' : 'legacy-credit-pack-discount',
					payramHostedCouponField: 'not-assumed',
				},
			},
			recovery: payPerJob
				? 'Submit the exact x402 payment for the bounded job, keep its opaque job credential, and retry or poll that same job after reconnecting.'
				: 'Open the identity-bound payment page, approve with a wallet, then retry the interrupted operation.',
		},
		app: {
			enabled: appReady,
			mcpUrl: publicMcpUrl,
			connectorPackage: '@betterpptx/mcp-connector',
			installCommand: publicMcpUrl
				? `npx -y @betterpptx/mcp-connector install --url ${publicMcpUrl} --approve-auto-pay`
				: null,
			paymentTool: 'betterpptx.billing.payment_options',
			localWallet: {
				createdDuringExplicitInstallApproval: true,
				automaticTopUp: true,
				automaticFundingPopup: true,
				automaticResumeAfterFunding: true,
				keyStorage: 'operating-system credential store',
			},
			recovery: payPerJob
				? 'A funded approved local wallet authorizes the exact bounded job. If its USDC balance is short, the connector follows the configured funding route; an interrupted job is recovered with its same protected job credential, never by a second payment.'
				: 'A funded approved local wallet pays automatically. If its USDC balance is short, the connector opens the funding page, waits for Base confirmation, pays, and retries the interrupted tool call.',
		},
		agentic: {
			enabled: agenticReady,
			protocol: 'x402',
			version: 2,
			scheme: 'exact',
			network: paymentNetwork.network,
			asset: 'USDC',
			discoveryTools: ['price-listing', 'pricing-listing', 'payment-methods'],
			purchaseTool: 'make-purchase',
			httpEndpointTemplate: payPerJob ? null : (paymentBase ? `${paymentBase}/pay/x402/credit-packs/{packId}` : null),
			paymentSubmission: payPerJob ? 'make-purchase with the quoted job purchaseContext' : 'HTTP x402 credit-pack endpoint or make-purchase',
			settlement: facilitatorReady
				? 'gas-sponsoring x402 facilitator'
				: 'self-settled EIP-3009 with an operator-funded gas-only relayer',
			operatorGasFundingRequired: !facilitatorReady,
		},
	}

	return {
		version: 1,
		billingModel: payPerJob ? 'pay_per_job' : 'credit_compatibility',
		model: payPerJob ? 'anonymous one-payment-per-bounded-job' : 'anonymous prepaid crypto credits',
		network: paymentNetwork.displayName,
		asset: 'USDC',
		deckState,
		deckSpecState,
		lockedAssetState,
		operationState,
		operationDispatcherState,
		packs: payPerJob ? [] : configuredCryptoPacks(),
		surfaces,
		readiness: {
			launchReady: privateCanaryReady,
			privateCanaryReady,
			publicProductionReady,
			webReady,
			appReady,
			agenticReady,
			cardOnrampReady: payramCardOnrampReady,
			cardOnrampRequired: requireCardOnramp,
			...(includeRequirements ? {
				requirements,
				missing: requirements.filter(item => !item.ready).map(item => item.id),
			} : {}),
		},
		promotions: {
			...promotions,
			redemptionTool: payPerJob ? null : 'betterpptx.billing.redeem_promo',
			mode: payPerJob ? 'job-sponsorship-not-configured' : 'legacy-credit-pack-discount',
			payramHostedCouponField: 'not-assumed',
		},
	}
}
