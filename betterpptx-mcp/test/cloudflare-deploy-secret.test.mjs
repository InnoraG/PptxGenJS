import assert from 'node:assert/strict'
import test from 'node:test'

import {
	listMissionControlSecretDefinitions,
	rotateMissionControlSecret,
	testMissionControlSecret,
	updateMissionControlSecret,
} from '../mission-control-secrets.mjs'

test('Cloudflare deployment token is owner-managed, non-auto-rotatable, and redacted', async t => {
	const previous = {
		backend: process.env.BETTERPPTX_MC_SECRET_BACKEND,
		secretIds: process.env.BETTERPPTX_MISSION_CONTROL_SECRET_IDS,
		log: process.env.BETTERPPTX_LOG,
		trace: process.env.BETTERPPTX_TRACE,
	}
	process.env.BETTERPPTX_MC_SECRET_BACKEND = 'memory'
	process.env.BETTERPPTX_LOG = 'off'
	process.env.BETTERPPTX_TRACE = '0'
	t.after(() => {
		for (const [name, value] of Object.entries({
			BETTERPPTX_MC_SECRET_BACKEND: previous.backend,
			BETTERPPTX_MISSION_CONTROL_SECRET_IDS: previous.secretIds,
			BETTERPPTX_LOG: previous.log,
			BETTERPPTX_TRACE: previous.trace,
		})) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})

	const id = 'cloudflare_worker_deploy_token'
	const token = `synthetic-cloudflare-token-${'x'.repeat(40)}`
	const definition = listMissionControlSecretDefinitions().find(item => item.id === id)
	assert.equal(definition.secretName, 'betterpptx-cloudflare-worker-deploy-token')
	assert.deepEqual(definition.actions, { reveal: true, update: true, rotate: false, test: true })
	assert.match(definition.description, /Workers Scripts edit/)
	assert.match(definition.description, /Workers Routes edit only on the BetterPPTX product zone\(s\) \(x4ai\.si; xmcpx\.com while it redirects\)/)
	assert.ok(definition.dependentServices.includes('betterpptx-cloudrun-deploy'))

	const updated = await updateMissionControlSecret(id, { value: token, confirm: `UPDATE ${id}` })
	assert.equal(updated.secret.fingerprint, `sha256:${(await import('node:crypto')).createHash('sha256').update(token).digest('hex').slice(0, 16)}`)
	assert.equal(updated.secret.source.type, 'local-env-test')
	assert.match(updated.secret.description, /permissions/)
	assert.ok(updated.secret.dependentServices.includes('betterpptx-cloudflare-edge-worker'))
	assert.equal(JSON.stringify(updated).includes(token), false)
	await assert.rejects(rotateMissionControlSecret(id, { confirm: `ROTATE ${id}` }), { code: 'MC_SECRET_ACTION_UNAVAILABLE' })

	let request
	const valid = await testMissionControlSecret(id, {
		fetchImpl: async (url, options) => {
			request = { url, method: options.method, authorization: options.headers.Authorization }
			return new Response(JSON.stringify({ success: true, result: { id: 'synthetic-id', status: 'active' } }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		},
	})
	assert.equal(valid.ok, true)
	assert.equal(valid.test.ok, true)
	assert.equal(valid.test.check, 'cloudflare-api-token-active')
	assert.equal(valid.test.httpStatus, 200)
	assert.equal(valid.test.status, 'active')
	assert.equal(valid.test.permissions, 'not-enumerated-by-token-verification')
	assert.equal(valid.test.configurationOnly, true)
	assert.equal(valid.test.runtimeVerified, false)
	assert.equal(valid.test.activation.persisted, false)
	assert.deepEqual(request, {
		url: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
		method: 'GET',
		authorization: `Bearer ${token}`,
	})
	assert.equal(JSON.stringify(valid).includes(token), false)
	assert.equal(JSON.stringify(valid).includes('synthetic-id'), false)

	const disabled = await testMissionControlSecret(id, {
		fetchImpl: async () => new Response(JSON.stringify({ success: true, result: { status: 'disabled' } }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		}),
	})
	assert.equal(disabled.ok, false)
	assert.equal(disabled.test.status, 'disabled')
	assert.equal(JSON.stringify(disabled).includes(token), false)
})

test('Cloudflare token validation fails closed without returning provider payloads or credential data', async t => {
	const previous = {
		backend: process.env.BETTERPPTX_MC_SECRET_BACKEND,
		log: process.env.BETTERPPTX_LOG,
		trace: process.env.BETTERPPTX_TRACE,
	}
	process.env.BETTERPPTX_MC_SECRET_BACKEND = 'memory'
	process.env.BETTERPPTX_LOG = 'off'
	process.env.BETTERPPTX_TRACE = '0'
	t.after(() => {
		for (const [name, value] of Object.entries({
			BETTERPPTX_MC_SECRET_BACKEND: previous.backend,
			BETTERPPTX_LOG: previous.log,
			BETTERPPTX_TRACE: previous.trace,
		})) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})

	const id = 'cloudflare_worker_deploy_token'
	await assert.rejects(
		updateMissionControlSecret(id, { value: 'not a single token value', confirm: `UPDATE ${id}` }),
		{ code: 'MC_SECRET_VALUE_INVALID' },
	)
	const token = `synthetic-cloudflare-token-${'y'.repeat(40)}`
	await updateMissionControlSecret(id, { value: token, confirm: `UPDATE ${id}` })

	const failed = await testMissionControlSecret(id, {
		fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ message: token }] }), {
			status: 403,
			headers: { 'content-type': 'application/json' },
		}),
	})
	assert.equal(failed.ok, false)
	assert.equal(failed.test.httpStatus, 403)
	assert.equal(JSON.stringify(failed).includes(token), false)
	assert.equal(JSON.stringify(failed).includes('must not fetch'), false)

	const networkFailure = await testMissionControlSecret(id, { fetchImpl: async () => { throw new Error(token) } })
	assert.equal(networkFailure.test.reason, 'verification-request-failed')
	assert.equal(JSON.stringify(networkFailure).includes(token), false)
})

test('private Mission Control secret allowlist exposes and authorizes only selected controls', async t => {
	const previous = {
		backend: process.env.BETTERPPTX_MC_SECRET_BACKEND,
		secretIds: process.env.BETTERPPTX_MISSION_CONTROL_SECRET_IDS,
		log: process.env.BETTERPPTX_LOG,
		trace: process.env.BETTERPPTX_TRACE,
	}
	process.env.BETTERPPTX_MC_SECRET_BACKEND = 'memory'
	process.env.BETTERPPTX_MISSION_CONTROL_SECRET_IDS = 'cloudflare_worker_deploy_token'
	process.env.BETTERPPTX_LOG = 'off'
	process.env.BETTERPPTX_TRACE = '0'
	t.after(() => {
		for (const [name, value] of Object.entries({
			BETTERPPTX_MC_SECRET_BACKEND: previous.backend,
			BETTERPPTX_MISSION_CONTROL_SECRET_IDS: previous.secretIds,
			BETTERPPTX_LOG: previous.log,
			BETTERPPTX_TRACE: previous.trace,
		})) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})

	const { getMissionControlSecretsSnapshot } = await import('../mission-control-secrets.mjs')
	const id = 'cloudflare_worker_deploy_token'
	const token = `synthetic-allowlist-token-${'z'.repeat(36)}`
	await updateMissionControlSecret(id, { value: token, confirm: `UPDATE ${id}` })
	const definitions = listMissionControlSecretDefinitions()
	assert.deepEqual(definitions.map(item => item.id), [id])
	const snapshot = await getMissionControlSecretsSnapshot()
	assert.deepEqual(snapshot.secrets.map(item => item.id), [id])
	assert.equal(JSON.stringify(snapshot).includes(token), false)
	await assert.rejects(updateMissionControlSecret('payram_api_key', {
		value: 'not-allowed-by-private-mission-control',
		confirm: 'UPDATE payram_api_key',
	}), { code: 'MC_SECRET_NOT_ALLOWED' })
})
