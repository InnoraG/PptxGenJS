import assert from 'node:assert/strict'
import test from 'node:test'

import {
	missionControlAccess,
	missionControlAdminAccess,
	missionControlOnlyPathAllowed,
	renderMissionControlPage,
} from '../mission-control.mjs'

const request = (remoteAddress = '203.0.113.8', headers = {}) => ({
	headers,
	socket: { remoteAddress },
})

test('private Cloud Run IAM can authorize Mission Control owner controls without browser bearer secrets', t => {
	const previous = {
		enabled: process.env.BETTERPPTX_MISSION_CONTROL,
		only: process.env.BETTERPPTX_MISSION_CONTROL_ONLY,
		trustIam: process.env.BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM,
		accessToken: process.env.BETTERPPTX_MISSION_CONTROL_TOKEN,
		adminToken: process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN,
	}
	process.env.BETTERPPTX_MISSION_CONTROL = '1'
	process.env.BETTERPPTX_MISSION_CONTROL_ONLY = '1'
	process.env.BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM = '1'
	delete process.env.BETTERPPTX_MISSION_CONTROL_TOKEN
	delete process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN
	t.after(() => {
		for (const [name, value] of Object.entries({
			BETTERPPTX_MISSION_CONTROL: previous.enabled,
			BETTERPPTX_MISSION_CONTROL_ONLY: previous.only,
			BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM: previous.trustIam,
			BETTERPPTX_MISSION_CONTROL_TOKEN: previous.accessToken,
			BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN: previous.adminToken,
		})) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})

	const access = missionControlAccess(request())
	assert.deepEqual(access, { allowed: true, mode: 'private-iam' })
	assert.deepEqual(missionControlAdminAccess(request()), { allowed: true, mode: 'private-iam', admin: true, adminMode: 'cloud-run-iam' })

	const page = renderMissionControlPage()
	assert.match(page, /Authenticated by the private Cloud Run IAM boundary/)
	assert.doesNotMatch(page, /id="appToken"|id="adminToken"/)
	assert.doesNotMatch(page, /<h2>Payment Health<\/h2>/)
	assert.match(page, /headers:missionControlHeaders\(\)/)
	assert.match(page, /<dialog id="secretActionDialog"/)
	assert.match(page, /id="secretValue" type="password"/)
	assert.match(page, /secretPost\(pending\.id,'update',\{value,confirm\}\)/)
	assert.doesNotMatch(page, /\bprompt\(/)
})

test('private-IAM trust is not a fallback on the public service when it is disabled', t => {
	const previous = {
		enabled: process.env.BETTERPPTX_MISSION_CONTROL,
		only: process.env.BETTERPPTX_MISSION_CONTROL_ONLY,
		trustIam: process.env.BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM,
		accessToken: process.env.BETTERPPTX_MISSION_CONTROL_TOKEN,
		adminToken: process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN,
	}
	process.env.BETTERPPTX_MISSION_CONTROL = '1'
	process.env.BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM = '0'
	delete process.env.BETTERPPTX_MISSION_CONTROL_TOKEN
	delete process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN
	t.after(() => {
		for (const [name, value] of Object.entries({
			BETTERPPTX_MISSION_CONTROL: previous.enabled,
			BETTERPPTX_MISSION_CONTROL_ONLY: previous.only,
			BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM: previous.trustIam,
			BETTERPPTX_MISSION_CONTROL_TOKEN: previous.accessToken,
			BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN: previous.adminToken,
		})) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})

	assert.deepEqual(missionControlAccess(request()), { allowed: false, status: 404, code: 'NOT_FOUND', message: 'not found' })
	assert.deepEqual(missionControlAdminAccess(request()), { allowed: false, status: 404, code: 'NOT_FOUND', message: 'not found' })
})

test('private Mission Control deployment path blocks MCP, files, health, and similarly named routes', () => {
	assert.equal(missionControlOnlyPathAllowed('/ops/mission-control', 'GET'), true)
	assert.equal(missionControlOnlyPathAllowed('/ops/mission-control/data', 'GET'), true)
	assert.equal(missionControlOnlyPathAllowed('/ops/mission-control/secrets', 'GET'), true)
	assert.equal(missionControlOnlyPathAllowed('/ops/mission-control/secrets/cloudflare_worker_deploy_token/update', 'POST'), true)
	for (const [path, method] of [
		['/mcp', 'POST'],
		['/files/token/deck.pptx', 'GET'],
		['/health', 'GET'],
		['/ops/mission-controller', 'GET'],
		['/ops/mission-control-extra', 'GET'],
		['/ops/mission-control/payment-health', 'GET'],
		['/ops/mission-control/../mcp', 'GET'],
		['/ops/mission-control/secrets/cloudflare_worker_deploy_token/update', 'GET'],
	]) {
		assert.equal(missionControlOnlyPathAllowed(path, method), false, `${method} ${path} must not reach a route on the secret-control service`)
	}
})

test('token-authenticated local Mission Control still asks for tokens and applies both headers', t => {
	const previous = {
		enabled: process.env.BETTERPPTX_MISSION_CONTROL,
		only: process.env.BETTERPPTX_MISSION_CONTROL_ONLY,
		trustIam: process.env.BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM,
		accessToken: process.env.BETTERPPTX_MISSION_CONTROL_TOKEN,
		adminToken: process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN,
	}
	process.env.BETTERPPTX_MISSION_CONTROL = '1'
	process.env.BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM = '0'
	process.env.BETTERPPTX_MISSION_CONTROL_TOKEN = 'synthetic-mc-access-token'
	process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN = 'synthetic-mc-admin-token'
	t.after(() => {
		for (const [name, value] of Object.entries({
			BETTERPPTX_MISSION_CONTROL: previous.enabled,
			BETTERPPTX_MISSION_CONTROL_ONLY: previous.only,
			BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM: previous.trustIam,
			BETTERPPTX_MISSION_CONTROL_TOKEN: previous.accessToken,
			BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN: previous.adminToken,
		})) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})

	const page = renderMissionControlPage()
	assert.match(page, /id="appToken"/)
	assert.match(page, /id="adminToken"/)
	assert.match(page, /x-betterpptx-mission-control-token/)
	assert.match(page, /x-betterpptx-mission-control-admin-token/)
	assert.doesNotMatch(page, /Authenticated by the private Cloud Run IAM boundary/)
	assert.match(page, /<dialog id="secretActionDialog"/)
	assert.doesNotMatch(page, /\bprompt\(/)
})
