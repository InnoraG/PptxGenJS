const originalEnv = { ...process.env }
const proofEnvNames = [
	'BETTERPPTX_PAYRAM_OCI_HOST_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_OCI_HOST_EVIDENCE_FILE',
	'BETTERPPTX_PAYRAM_DNS_HTTPS_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_DNS_HTTPS_EVIDENCE_FILE',
	'BETTERPPTX_PAYRAM_BACKUP_RESTORE_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_OCI_ALARMS_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_PHASE0_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_PHASE0_EVIDENCE_FILE',
	'BETTERPPTX_FORWARDER_CUSTODY_VERIFIED_AT',
	'BETTERPPTX_FORWARDER_CUSTODY_EVIDENCE_FILE',
	'BETTERPPTX_FORWARDER_PROOF_VERIFIED_AT',
	'BETTERPPTX_FORWARDER_PROOF_EVIDENCE_FILE',
	'BETTERPPTX_FORWARDER_REVIEW_VERIFIED_AT',
	'BETTERPPTX_FORWARDER_REVIEW_EVIDENCE_FILE',
]

function resetEnv() {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) delete process.env[key]
	}
	for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value
}

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const { paymentSurfaceReadiness } = await import('./billing/payment-surfaces.mjs')

function configurePaymentReadyBase() {
	for (const name of proofEnvNames) delete process.env[name]
	process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
	process.env.BETTERPPTX_BILLING_ENFORCE = '1'
	process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = '1'
	process.env.BETTERPPTX_PUBLIC_BASE = 'https://betterpptx.example.test'
	process.env.BETTERPPTX_PAYMENT_BASE_URL = 'https://betterpptx.example.test'
	process.env.BETTERPPTX_PUBLIC_MCP_URL = 'https://betterpptx.example.test/mcp'
	process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'public-production-gate-envelope-0123456789abcdef'
	process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'public-production-gate-install-0123456789abcdef'
	process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x4000000000000000000000000000000000000001'
	process.env.BETTERPPTX_BASE_RPC_URL = 'https://rpc.example.test'
	process.env.BETTERPPTX_X402_RELAYER_PRIVATE_KEY = `0x${'11'.repeat(32)}`
	process.env.BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON = JSON.stringify(['0x3000000000000000000000000000000000000001'])
	process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'firestore'
	process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'firestore'
	process.env.BETTERPPTX_X402_STORE = 'firestore'
	process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'firestore'
	process.env.BETTERPPTX_INSTALL_USAGE_STORE = 'firestore'
	process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '1'
	process.env.BETTERPPTX_MCP_MAX_INSTANCES = '1'
	process.env.BETTERPPTX_EDIT_STATE_SINGLE_INSTANCE_ACCEPTED = '1'
}

try {
	configurePaymentReadyBase()
	process.env.BETTERPPTX_EDIT_STATE_MODE = 'process-local'
	delete process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE
	const canary = paymentSurfaceReadiness({ includeRequirements: true })
	expect(canary.readiness.privateCanaryReady === true, 'Fully configured payment path should be private-canary ready.', { canary })
	expect(canary.readiness.publicProductionReady === false, 'Process-local deck state must block public production readiness.', { canary })
	expect(canary.readiness.missing.includes('durable-deck-state'), 'Durable deck state must be reported as missing for production.', { canary })
	expect(canary.readiness.missing.includes('durable-operation-state'), 'Durable operation state must be reported as missing for production.', { canary })
	expect(canary.surfaces.web.methods.payramCardOnramp === false, 'PayRam card rail must be disabled by default.', { canary })

	process.env.BETTERPPTX_PAYRAM_ENABLED = '1'
	delete process.env.BETTERPPTX_PAYRAM_BASE_URL
	delete process.env.BETTERPPTX_PAYRAM_API_KEY
	delete process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN
	const payramEnabledIncomplete = paymentSurfaceReadiness({ includeRequirements: true })
	expect(payramEnabledIncomplete.surfaces.web.methods.payramCardOnramp === false, 'PayRam enabled with incomplete config must not advertise card checkout.', { payramEnabledIncomplete })
	expect(payramEnabledIncomplete.readiness.missing.includes('payram-card-onramp'), 'Incomplete PayRam config should be visible in requirements.', { payramEnabledIncomplete })
	expect(payramEnabledIncomplete.readiness.agenticReady === true, 'Agentic x402 readiness must not depend on PayRam.', { payramEnabledIncomplete })
	expect(payramEnabledIncomplete.readiness.privateCanaryReady === true, 'Optional incomplete PayRam should not break crypto private-canary readiness.', { payramEnabledIncomplete })

	process.env.BETTERPPTX_REQUIRE_CARD_ONRAMP = '1'
	const payramRequiredIncomplete = paymentSurfaceReadiness({ includeRequirements: true })
	expect(payramRequiredIncomplete.readiness.privateCanaryReady === false, 'Required but incomplete PayRam card rail must block launch readiness.', { payramRequiredIncomplete })
	expect(payramRequiredIncomplete.readiness.agenticReady === true, 'Required card rail must still not change x402 agentic readiness.', { payramRequiredIncomplete })

	process.env.BETTERPPTX_PAYRAM_BASE_URL = 'https://payram.betterpptx.example.test'
	process.env.BETTERPPTX_PAYRAM_API_KEY = 'payram_api_key_0123456789abcdef'
	process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN = 'payram_webhook_token_0123456789abcdef'
	process.env.BETTERPPTX_PAYRAM_EXACT_QUOTE_ENABLED = '1'
	const payramConfigured = paymentSurfaceReadiness({ includeRequirements: true })
	expect(payramConfigured.readiness.cardOnrampReady === true, 'Configured PayRam card rail should be ready.', { payramConfigured })
	expect(payramConfigured.surfaces.web.methods.payramCardOnramp === true, 'Configured PayRam card rail should be advertised as a web method.', { payramConfigured })
	expect(payramConfigured.surfaces.web.cardOnramp.exactQuoteEnabled === true, 'Exact PayRam quotes should require the explicit feature flag.', { payramConfigured })
	expect(!payramConfigured.readiness.missing.includes('payram-card-onramp'), 'Configured PayRam card rail should clear its readiness requirement.', { payramConfigured })

	delete process.env.BETTERPPTX_PAYRAM_ENABLED
	delete process.env.BETTERPPTX_REQUIRE_CARD_ONRAMP
	delete process.env.BETTERPPTX_PAYRAM_BASE_URL
	delete process.env.BETTERPPTX_PAYRAM_API_KEY
	delete process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN
	delete process.env.BETTERPPTX_PAYRAM_EXACT_QUOTE_ENABLED

	process.env.BETTERPPTX_EDIT_STATE_MODE = 'distributed'
	process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'firestore-gcs'
	process.env.BETTERPPTX_DECK_SNAPSHOT_STORE = 'gcs'
	process.env.BETTERPPTX_LOCKED_ASSET_STORE = 'gcs'
	const production = paymentSurfaceReadiness({ includeRequirements: true })
	expect(production.readiness.privateCanaryReady === false, 'Distributed mode should not reuse the process-local private-canary condition.', { production })
	expect(production.readiness.publicProductionReady === false, 'Public production must remain false until operation state, stateless routing, and distributed-runtime verification are explicit.', { production })
	expect(production.readiness.missing.includes('durable-operation-state'), 'Distributed operation ledger must be a public-production requirement.', { production })
	expect(production.readiness.missing.includes('durable-operation-dispatch'), 'Distributed operation dispatch must be a public-production requirement.', { production })
	expect(production.readiness.missing.includes('stateless-mcp-gateway'), 'Stateless MCP gateway must be a public-production requirement.', { production })
	expect(production.readiness.missing.includes('distributed-runtime-verified'), 'Distributed runtime/failure-campaign proof must be a public-production requirement.', { production })

	process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'firestore'
	process.env.BETTERPPTX_HTTP_STATELESS_MCP = '1'
	const statelessButUnverified = paymentSurfaceReadiness({ includeRequirements: true })
	expect(statelessButUnverified.readiness.publicProductionReady === false, 'Stateless routing alone must not claim public production readiness.', { statelessButUnverified })
	expect(!statelessButUnverified.readiness.missing.includes('durable-operation-state'), 'Durable operation state should clear when Firestore is configured.', { statelessButUnverified })
	expect(statelessButUnverified.readiness.missing.includes('durable-operation-dispatch'), 'Durable operation dispatch should remain missing before Cloud Tasks is configured.', { statelessButUnverified })
	expect(!statelessButUnverified.readiness.missing.includes('stateless-mcp-gateway'), 'Stateless requirement should clear when the flag is enabled.', { statelessButUnverified })
	expect(statelessButUnverified.readiness.missing.includes('distributed-runtime-verified'), 'Distributed runtime proof should remain missing.', { statelessButUnverified })

	process.env.BETTERPPTX_OPERATION_DISPATCHER = 'cloud-tasks'
	process.env.BETTERPPTX_GCP_PROJECT = 'betterpptx-test'
	process.env.BETTERPPTX_CLOUD_TASKS_LOCATION = 'us-central1'
	process.env.BETTERPPTX_OPERATION_WORKER_URL = 'https://worker.example.test'
	const dispatchedButUnverified = paymentSurfaceReadiness({ includeRequirements: true })
	expect(dispatchedButUnverified.readiness.publicProductionReady === false, 'Cloud Tasks dispatch alone must not claim public production before the distributed runtime proof.', { dispatchedButUnverified })
	expect(!dispatchedButUnverified.readiness.missing.includes('durable-operation-dispatch'), 'Durable operation dispatch should clear when Cloud Tasks config is present.', { dispatchedButUnverified })
	expect(dispatchedButUnverified.readiness.missing.includes('distributed-runtime-verified'), 'Distributed runtime proof should remain the final explicit gate.', { dispatchedButUnverified })

	process.env.BETTERPPTX_DISTRIBUTED_RUNTIME_VERIFIED = '1'
	const runtimeVerifiedButPaymentProofMissing = paymentSurfaceReadiness({ includeRequirements: true })
	expect(runtimeVerifiedButPaymentProofMissing.readiness.publicProductionReady === false, 'Distributed runtime proof alone must not claim public production before payment public-enable evidence is recorded.', { runtimeVerifiedButPaymentProofMissing })
	expect(!runtimeVerifiedButPaymentProofMissing.readiness.missing.includes('distributed-runtime-verified'), 'Distributed runtime requirement should clear when its proof flag is set.', { runtimeVerifiedButPaymentProofMissing })
	expect(runtimeVerifiedButPaymentProofMissing.readiness.missing.includes('payment-public-enable-evidence'), 'Payment public-enable evidence must be a public-production requirement.', { runtimeVerifiedButPaymentProofMissing })

	process.env.BETTERPPTX_PAYRAM_OCI_HOST_VERIFIED_AT = '2026-06-17T12:01:00.000Z'
	process.env.BETTERPPTX_PAYRAM_DNS_HTTPS_VERIFIED_AT = '2026-06-17T12:01:30.000Z'
	process.env.BETTERPPTX_PAYRAM_BACKUP_RESTORE_VERIFIED_AT = '2026-06-17T12:02:00.000Z'
	process.env.BETTERPPTX_PAYRAM_OCI_ALARMS_VERIFIED_AT = '2026-06-17T12:03:00.000Z'
	process.env.BETTERPPTX_PAYRAM_PHASE0_VERIFIED_AT = '2026-06-17T12:04:00.000Z'
	process.env.BETTERPPTX_FORWARDER_CUSTODY_VERIFIED_AT = '2026-06-17T12:05:00.000Z'
	process.env.BETTERPPTX_FORWARDER_PROOF_VERIFIED_AT = '2026-06-17T12:06:00.000Z'
	process.env.BETTERPPTX_FORWARDER_REVIEW_VERIFIED_AT = '2026-06-17T12:07:00.000Z'
	const publicReady = paymentSurfaceReadiness({ includeRequirements: true })
	expect(publicReady.readiness.publicProductionReady === true, 'Public production should become ready only after distributed runtime proof and payment public-enable evidence are both recorded.', { publicReady })
	expect(!publicReady.readiness.missing.includes('payment-public-enable-evidence'), 'Payment public-enable evidence requirement should clear after exact proof stamps.', { publicReady })

	console.log('PUBLIC PRODUCTION GATE: PASS processLocalBlocksProduction=1 durableDeckStateMissing=1 durableOperationStateMissing=1 durableOperationDispatchMissing=1 statelessRequired=1 distributedRuntimeProofRequired=1 paymentPublicEvidenceRequired=1')
} finally {
	resetEnv()
}
