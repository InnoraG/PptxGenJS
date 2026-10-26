import test from 'node:test'
import assert from 'node:assert/strict'
import { listMissionControlSecretDefinitions, updateMissionControlSecret, testMissionControlSecret, getMissionControlSecretsSnapshot } from '../mission-control-secrets.mjs'

test('speech spending credentials have private owner update and redacted status without fabricated runtime proof', async t => {
	const env = { BETTERPPTX_MC_SECRET_BACKEND: 'memory', BETTERPPTX_MISSION_CONTROL_SECRET_IDS: 'speech_worker_credentials', BETTERPPTX_LOG: 'off', BETTERPPTX_TRACE: '0' }
	const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env)
	t.after(() => { for (const [k,v] of Object.entries(saved)) if (v == null) delete process.env[k]; else process.env[k] = v })
	const id = 'speech_worker_credentials'
	const def = listMissionControlSecretDefinitions().find(v => v.id === id)
	assert.equal(def.secretName, 'betterpptx-speech-worker-credentials')
	assert.ok(def.actions.reveal && def.actions.update && def.actions.test)
	assert.match(def.description, /Rotate.*Modal.*update.*redeploy/)
	assert.deepEqual(def.dependentServices, ['betterpptx-narration-modal', 'betterpptx-avatar-budget-sync'])
	assert.match(def.description, /execute the billing-sync job.*current Secret Manager version at startup/)
	for (const value of ['{}', '{"token_id":"private-only"}', '{"token_id":"ak-synthetic123","token_secret":"as-synthetic123","extra":true}']) await assert.rejects(updateMissionControlSecret(id, { value, confirm: `UPDATE ${id}` }), { code: 'MC_SECRET_VALUE_INVALID' })
	const value = JSON.stringify({ token_id: 'ak-synthetic123', token_secret: 'as-synthetic123' })
	const updated = await updateMissionControlSecret(id, { value, confirm: `UPDATE ${id}` })
	const tested = await testMissionControlSecret(id)
	assert.equal(tested.ok, true)
	assert.equal(tested.test.runtimeVerified, false)
	const snapshot = await getMissionControlSecretsSnapshot()
	assert.equal(JSON.stringify({ updated, tested, snapshot }).includes('as-synthetic123'), false)
	assert.match(updated.secret.fingerprint, /^sha256:[a-f0-9]{16}$/)
})
