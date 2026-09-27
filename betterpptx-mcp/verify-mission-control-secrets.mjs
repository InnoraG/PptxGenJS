import assert from 'node:assert/strict'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'

process.env.BETTERPPTX_MISSION_CONTROL = '1'
process.env.BETTERPPTX_MC_SECRET_BACKEND = 'env'
process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN = 'owner-admin-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_MISSION_CONTROL_ACCESS_TOKEN = 'owner-access-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_MISSION_CONTROL_ADMIN_TOKEN = 'owner-admin-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_AVATAR_WORKER_CREDENTIALS = JSON.stringify({ schemaVersion: 'betterpptx.avatar-worker-credentials.v1', accounts: [{ id: 'w1' }, { id: 'w2' }] })
process.env.BETTERPPTX_MC_SECRET_INSTALL_HMAC_SECRET = 'install-hmac-secret-for-mc2-verifier-0123456789'
process.env.BETTERPPTX_MC_SECRET_MCP_V2_STATE_SECRET = 'continuation-secret-for-mc2-verifier-0123456789'
process.env.BETTERPPTX_MC_SECRET_PAYMENT_ENVELOPE_SECRET = 'payment-envelope-secret-for-mc2-verifier-012345'
process.env.BETTERPPTX_MC_SECRET_TREASURY_EVM_ADDRESS = '0x1000000000000000000000000000000000000001'
process.env.BETTERPPTX_MC_SECRET_BASE_RPC_URL = 'https://base-rpc.example.test'
process.env.BETTERPPTX_MC_SECRET_X402_FACILITATOR_URL = 'https://x402.example.test'
process.env.BETTERPPTX_MC_SECRET_X402_FACILITATOR_TOKEN = 'x402-facilitator-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_SCANNER_TOKEN = 'payment-scanner-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_PAYRAM_BASE_URL = 'https://payram.example.test'
process.env.BETTERPPTX_MC_SECRET_PAYRAM_API_KEY = 'payram-api-key-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_PAYRAM_WEBHOOK_CUSTOM_TOKEN = 'payram-webhook-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_PAYRAM_PROJECT_ID = 'payram-project-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_MESHY_API_KEY = 'meshy-api-key-for-mc2-verifier-012345'
process.env.BETTERPPTX_MC_SECRET_PAYRAM_HOT_WALLET_PRIVATE_KEY = `0x${'33'.repeat(32)}`
process.env.BETTERPPTX_MC_SECRET_FORWARDER_FACTORY_ADDRESS = '0x4000000000000000000000000000000000000004'
process.env.BETTERPPTX_MC_SECRET_FORWARDER_CODEHASH = `0x${'55'.repeat(32)}`
process.env.BETTERPPTX_MC_SECRET_SETTLEMENT_COLLECTOR_EVM_ADDRESS = '0x5000000000000000000000000000000000000005'
process.env.BETTERPPTX_MC_SECRET_FORWARDER_SALT_SECRET = 'forwarder-salt-secret-for-mc2-verifier-0123456789'
process.env.BETTERPPTX_MC_SECRET_FORWARDER_SWEEPER_KEY = `0x${'66'.repeat(32)}`
process.env.BETTERPPTX_MC_SECRET_X402_SETTLEMENT_MODE = 'self_settle'
process.env.BETTERPPTX_MC_SECRET_X402_GAS_RELAYER_KEY = `0x${'22'.repeat(32)}`
process.env.BETTERPPTX_MC_SECRET_DEPOSIT_XPUB = JSON.stringify({
	schema: 'betterpptx.deposit-xpub.v1',
	xpub: HDKey.fromMasterSeed(mnemonicToSeedSync('test test test test test test test test test test test junk')).derive("m/44'/60'/0'/0").publicExtendedKey,
	pathPrefix: "m/44'/60'/0'/0",
	startIndex: 0,
	labelPrefix: 'mc',
})
process.env.BETTERPPTX_MC_SECRET_DEPOSIT_ADDRESS_INVENTORY = JSON.stringify([
	'0x2000000000000000000000000000000000000001',
	'0x2000000000000000000000000000000000000002',
])

const {
	missionControlAccess,
	missionControlAdminAccess,
	buildMissionControlSnapshot,
} = await import('./mission-control.mjs')
const {
	getMissionControlSecretsSnapshot,
	MISSION_CONTROL_SECRET_DEFINITIONS,
	revealMissionControlSecret,
	rotateMissionControlSecret,
	testMissionControlSecret,
	updateMissionControlSecret,
} = await import('./mission-control-secrets.mjs')

function fakeReq(headers = {}) {
	return { headers, socket: { remoteAddress: '127.0.0.1' } }
}

async function expectCode(promise, code) {
	try {
		await promise
	} catch (err) {
		assert.equal(err.code, code)
		return
	}
	throw new Error(`Expected ${code}`)
}

const access = missionControlAccess(fakeReq())
assert.equal(access.allowed, true, 'Loopback Mission Control access should be allowed when enabled.')

const adminDenied = missionControlAdminAccess(fakeReq())
assert.equal(adminDenied.allowed, false, 'Admin access should require the owner admin token.')
assert.equal(adminDenied.code, 'MC_ADMIN_REQUIRED')

const adminAllowed = missionControlAdminAccess(fakeReq({ 'x-betterpptx-mission-control-admin-token': process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN }))
assert.equal(adminAllowed.allowed, true, 'Admin token should unlock owner actions.')

const mc = buildMissionControlSnapshot({ accessMode: 'loopback' })
assert.equal(mc.mode, 'MC2_OWNER_SECRET_CONTROLS')
assert.equal(mc.security.secretOwnerControls.status, 'ok')
assert.equal(mc.metrics.creditedVolumeCredits, 0)
assert.equal(mc.metrics.reservationFailures, 0)
assert.equal(mc.metrics.overrunCredits, 0)
assert.equal(mc.metrics.quoteCapReleaseCredits, 0)
assert.equal(mc.metrics.unmatchedPayments, 0)
assert.equal(mc.metrics.scannerLagSeconds, null)

const snapshot = await getMissionControlSecretsSnapshot()
assert.equal(snapshot.mode, 'MC2_OWNER_SECRET_CONTROLS')
assert.equal(snapshot.secrets.length, MISSION_CONTROL_SECRET_DEFINITIONS.length)
assert(snapshot.secrets.every(secret => !secret.value && (!secret.configured || secret.fingerprint)), 'Configured secrets must be fingerprinted, and every entry must remain redacted.')
assert(snapshot.secrets.some(secret => secret.id === 'mcp_v2_state_secret' && secret.configured && secret.fingerprint), 'The optional continuation signing key must use the private owner-control registry.')
for (const id of [
	'payram_base_url',
	'payram_api_key',
	'payram_webhook_custom_token',
	'payram_project_id',
	'payram_hot_wallet_private_key',
	'forwarder_factory_address',
	'forwarder_codehash',
	'settlement_collector_evm_address',
	'forwarder_salt_secret',
	'forwarder_sweeper_key',
]) {
	assert(snapshot.secrets.some(secret => secret.id === id && secret.configured), `PayRam secret ${id} should appear configured in Mission Control.`)
}
const payramHotWallet = snapshot.secrets.find(secret => secret.id === 'payram_hot_wallet_private_key')
assert.deepEqual(payramHotWallet.dependentServices, ['oci-payram'], 'PayRam hot wallet key must not be a Cloud Run dependency.')
const forwarderSalt = snapshot.secrets.find(secret => secret.id === 'forwarder_salt_secret')
assert(forwarderSalt.dependentServices.includes('betterpptx-payment-scanner'), 'Forwarder salt secret must be available to the payment scanner when forwarder rail is enabled.')
const serializedSnapshot = JSON.stringify(snapshot)
for (const definition of MISSION_CONTROL_SECRET_DEFINITIONS) {
	const raw = process.env[`BETTERPPTX_MC_SECRET_${definition.id.toUpperCase()}`]
	assert(!serializedSnapshot.includes(raw), 'Secret snapshot leaked a raw value.')
}

await expectCode(revealMissionControlSecret('payram_webhook_custom_token', { confirm: 'WRONG' }), 'MC_SECRET_CONFIRMATION_REQUIRED')
const revealed = await revealMissionControlSecret('payram_webhook_custom_token', { confirm: 'REVEAL payram_webhook_custom_token' })
assert.equal(revealed.value, process.env.BETTERPPTX_MC_SECRET_PAYRAM_WEBHOOK_CUSTOM_TOKEN)

const updatedValue = 'updated-payram-webhook-token-for-mc2-verifier'
const updated = await updateMissionControlSecret('payram_webhook_custom_token', {
	value: updatedValue,
	confirm: 'UPDATE payram_webhook_custom_token',
})
assert.equal(updated.ok, true)
assert(!JSON.stringify(updated).includes(updatedValue), 'Update response should not return the raw secret value.')
const updatedReveal = await revealMissionControlSecret('payram_webhook_custom_token', { confirm: 'REVEAL payram_webhook_custom_token' })
assert.equal(updatedReveal.value, updatedValue)

await expectCode(rotateMissionControlSecret('payram_api_key', { confirm: 'ROTATE payram_api_key' }), 'MC_SECRET_ACTION_UNAVAILABLE')
const rotated = await rotateMissionControlSecret('mission_control_admin_token', { confirm: 'ROTATE mission_control_admin_token' })
assert.equal(rotated.ok, true)
const rotatedReveal = await revealMissionControlSecret('mission_control_admin_token', { confirm: 'REVEAL mission_control_admin_token' })
assert(rotatedReveal.value.length >= 32)
assert(!JSON.stringify(rotated).includes(rotatedReveal.value), 'Rotate response should not return the generated raw token.')
const rotatedHmac = await rotateMissionControlSecret('install_hmac_secret', { confirm: 'ROTATE install_hmac_secret' })
assert.equal(rotatedHmac.ok, true)
const rotatedHmacReveal = await revealMissionControlSecret('install_hmac_secret', { confirm: 'REVEAL install_hmac_secret' })
assert(rotatedHmacReveal.value.length >= 48)

const payramBaseTest = await testMissionControlSecret('payram_base_url')
assert.equal(payramBaseTest.ok, true)
const meshyApiKeyTest = await testMissionControlSecret('meshy_api_key')
assert.equal(meshyApiKeyTest.ok, true)
assert.equal(meshyApiKeyTest.test.check, 'meshy-api-key-format')
assert(!JSON.stringify(meshyApiKeyTest).includes(process.env.BETTERPPTX_MC_SECRET_MESHY_API_KEY), 'Meshy test must not return the raw API key.')
const payramWebhookTokenTest = await testMissionControlSecret('payram_webhook_custom_token')
assert.equal(payramWebhookTokenTest.ok, true)
const payramProjectTest = await testMissionControlSecret('payram_project_id')
assert.equal(payramProjectTest.ok, true)
const payramHotWalletTest = await testMissionControlSecret('payram_hot_wallet_private_key')
assert.equal(payramHotWalletTest.ok, true)
assert(payramHotWalletTest.test.derivedAddress, 'PayRam hot wallet key test should derive the gas wallet address.')
const forwarderFactoryTest = await testMissionControlSecret('forwarder_factory_address')
assert.equal(forwarderFactoryTest.ok, true)
const forwarderCodehashTest = await testMissionControlSecret('forwarder_codehash')
assert.equal(forwarderCodehashTest.ok, true)
assert.equal(forwarderCodehashTest.test.check, 'bytes32-format')
const collectorTest = await testMissionControlSecret('settlement_collector_evm_address')
assert.equal(collectorTest.ok, true)
const forwarderSaltTest = await testMissionControlSecret('forwarder_salt_secret')
assert.equal(forwarderSaltTest.ok, true)
assert.equal(forwarderSaltTest.test.check, 'forwarder-salt-hmac')
assert(!JSON.stringify(forwarderSaltTest).includes(process.env.BETTERPPTX_MC_SECRET_FORWARDER_SALT_SECRET), 'Forwarder salt test must not leak raw salt secret.')
const forwarderSweeperTest = await testMissionControlSecret('forwarder_sweeper_key')
assert.equal(forwarderSweeperTest.ok, true)
assert(forwarderSweeperTest.test.derivedAddress, 'Forwarder sweeper key test should derive the gas wallet address.')
const payramApiTest = await testMissionControlSecret('payram_api_key', {
	fetchImpl: async (_url, options = {}) => {
		assert.equal(options.redirect, 'error')
		if (!options.headers?.['API-Key']) return { ok: false, status: 401 }
		assert.equal(options.headers?.['API-Key'], process.env.BETTERPPTX_MC_SECRET_PAYRAM_API_KEY)
		return { ok: false, status: 404, text: async () => JSON.stringify({ error: 'not found' }) }
	},
})
assert.equal(payramApiTest.ok, true)
assert.equal(payramApiTest.test.authentication, 'accepted-by-status-probe')
assert.equal(payramApiTest.test.checkoutExecution, 'not-tested')
const rejectedApiTest = await testMissionControlSecret('payram_api_key', { fetchImpl: async () => ({ status: 401 }) })
assert.equal(rejectedApiTest.ok, false, 'HTTP 401 is never an accepted API key.')
assert.equal(rejectedApiTest.test.authentication, 'rejected')
for (const status of [200, 404, 302, 500]) {
	let calls = 0
	const unproven = await testMissionControlSecret('payram_api_key', { fetchImpl: async () => { calls++; return { status } } })
	assert.equal(unproven.ok, false, 'An unprotected or ambiguous endpoint cannot prove authentication.')
	assert.equal(unproven.test.authentication, 'unknown')
	assert.equal(calls, 1, 'Do not send credentials to a route without an established auth boundary.')
}
const continuationTest = await testMissionControlSecret('mcp_v2_state_secret')
assert.equal(continuationTest.ok, true)
const hmacTest = await testMissionControlSecret('payment_envelope_secret')
assert.equal(hmacTest.ok, true)
const treasuryTest = await testMissionControlSecret('treasury_evm_address')
assert.equal(treasuryTest.ok, true)
const facilitatorUrlTest = await testMissionControlSecret('x402_facilitator_url')
assert.equal(facilitatorUrlTest.ok, true)
const settlementModeTest = await testMissionControlSecret('x402_settlement_mode')
assert.equal(settlementModeTest.ok, true)
assert.equal(settlementModeTest.test.mode, 'self_settle')
const relayerKeyTest = await testMissionControlSecret('x402_gas_relayer_key')
assert.equal(relayerKeyTest.ok, true)
assert(relayerKeyTest.test.derivedAddress, 'Relayer key test should derive the relayer address.')
const depositXpubTest = await testMissionControlSecret('deposit_xpub')
assert.equal(depositXpubTest.ok, true)
assert.equal(depositXpubTest.test.check, 'deposit-xpub-public-derivation')
const inventoryTest = await testMissionControlSecret('deposit_address_inventory')
assert.equal(inventoryTest.ok, true)
assert.equal(inventoryTest.test.addressCount, 2)
const baseRpcTest = await testMissionControlSecret('base_rpc_url', {
	fetchImpl: async (_url, options = {}) => {
		const request = JSON.parse(options.body)
		assert.equal(request.method, 'eth_chainId')
		return {
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x2105' }),
		}
	},
})
assert.equal(baseRpcTest.ok, true)
assert(!JSON.stringify(MISSION_CONTROL_SECRET_DEFINITIONS).toLowerCase().includes('dodo'), 'Secret catalog must be PayRam-exclusive: no dodo entries.')

console.log('MC2 SECRET VERIFY: PASS')
