import assert from 'node:assert/strict'

process.env.BETTERPPTX_MISSION_CONTROL = '1'
process.env.BETTERPPTX_MC_SECRET_BACKEND = 'env'
process.env.BETTERPPTX_DODO_ENVIRONMENT = 'test'
process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN = 'owner-admin-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_DODO_TEST_API_KEY = 'dodo_test_key_for_mc2_verifier'
process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_SECRET = `whsec_${Buffer.from('mc2_webhook_secret_for_verifier').toString('base64url')}`
process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_CUSTOM_TOKEN = 'custom-webhook-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_MISSION_CONTROL_ADMIN_TOKEN = 'owner-admin-token-for-mc2-verifier'

const {
	missionControlAccess,
	missionControlAdminAccess,
	buildMissionControlSnapshot,
} = await import('./mission-control.mjs')
const {
	getMissionControlSecretsSnapshot,
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

const snapshot = await getMissionControlSecretsSnapshot()
assert.equal(snapshot.mode, 'MC2_OWNER_SECRET_CONTROLS')
assert.equal(snapshot.secrets.length, 4)
assert(snapshot.secrets.every(secret => secret.fingerprint && !secret.value), 'Secret list should be redacted and fingerprinted.')
const serializedSnapshot = JSON.stringify(snapshot)
for (const raw of [
	process.env.BETTERPPTX_MC_SECRET_DODO_TEST_API_KEY,
	process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_SECRET,
	process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_CUSTOM_TOKEN,
	process.env.BETTERPPTX_MC_SECRET_MISSION_CONTROL_ADMIN_TOKEN,
]) {
	assert(!serializedSnapshot.includes(raw), 'Secret snapshot leaked a raw value.')
}

await expectCode(revealMissionControlSecret('dodo_webhook_custom_token', { confirm: 'WRONG' }), 'MC_SECRET_CONFIRMATION_REQUIRED')
const revealed = await revealMissionControlSecret('dodo_webhook_custom_token', { confirm: 'REVEAL dodo_webhook_custom_token' })
assert.equal(revealed.value, process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_CUSTOM_TOKEN)

const updatedValue = 'updated-custom-webhook-token-for-mc2-verifier'
const updated = await updateMissionControlSecret('dodo_webhook_custom_token', {
	value: updatedValue,
	confirm: 'UPDATE dodo_webhook_custom_token',
})
assert.equal(updated.ok, true)
assert(!JSON.stringify(updated).includes(updatedValue), 'Update response should not return the raw secret value.')
const updatedReveal = await revealMissionControlSecret('dodo_webhook_custom_token', { confirm: 'REVEAL dodo_webhook_custom_token' })
assert.equal(updatedReveal.value, updatedValue)

await expectCode(rotateMissionControlSecret('dodo_test_api_key', { confirm: 'ROTATE dodo_test_api_key' }), 'MC_SECRET_ACTION_UNAVAILABLE')
const rotated = await rotateMissionControlSecret('mission_control_admin_token', { confirm: 'ROTATE mission_control_admin_token' })
assert.equal(rotated.ok, true)
const rotatedReveal = await revealMissionControlSecret('mission_control_admin_token', { confirm: 'REVEAL mission_control_admin_token' })
assert(rotatedReveal.value.length >= 32)
assert(!JSON.stringify(rotated).includes(rotatedReveal.value), 'Rotate response should not return the generated raw token.')

const webhookTest = await testMissionControlSecret('dodo_webhook_secret')
assert.equal(webhookTest.ok, true)
const tokenTest = await testMissionControlSecret('dodo_webhook_custom_token')
assert.equal(tokenTest.ok, true)
const dodoTest = await testMissionControlSecret('dodo_test_api_key', {
	fetchImpl: async (_url, options = {}) => {
		assert(String(options.headers?.Authorization || '').includes(process.env.BETTERPPTX_MC_SECRET_DODO_TEST_API_KEY))
		return { ok: true, status: 200, text: async () => '[]' }
	},
})
assert.equal(dodoTest.ok, true)

console.log('MC2 SECRET VERIFY: PASS')
