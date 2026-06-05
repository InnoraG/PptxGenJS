import assert from 'node:assert/strict'

process.env.BETTERPPTX_MISSION_CONTROL = '1'
process.env.BETTERPPTX_MC_SECRET_BACKEND = 'env'
process.env.BETTERPPTX_DODO_ENVIRONMENT = 'test'
process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN = 'route-owner-admin-token-for-mc2-verifier'
process.env.BETTERPPTX_MC_SECRET_DODO_TEST_API_KEY = 'route_dodo_test_key_for_mc2_verifier'
process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_SECRET = `whsec_${Buffer.from('route_mc2_webhook_secret').toString('base64url')}`
process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_CUSTOM_TOKEN = 'route-custom-webhook-token-for-mc2'
process.env.BETTERPPTX_MC_SECRET_MISSION_CONTROL_ADMIN_TOKEN = 'route-owner-admin-token-for-mc2-verifier'

const { startBetterPptxHttp } = await import('./server-http.mjs')

const server = await startBetterPptxHttp({
	host: '127.0.0.1',
	port: 3800 + Math.floor(Math.random() * 1000),
	open: true,
	mcpPath: '/mcp',
})

const address = server.httpServer.address()
const base = `http://127.0.0.1:${address.port}`

async function jsonFetch(pathname, options = {}) {
	const response = await fetch(`${base}${pathname}`, {
		...options,
		headers: {
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			...(options.headers || {}),
		},
	})
	const text = await response.text()
	let data = null
	try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
	return { response, data, text }
}

try {
	const dataRoute = await jsonFetch('/ops/mission-control/data')
	assert.equal(dataRoute.response.status, 200)
	assert.equal(dataRoute.data.mode, 'MC2_OWNER_SECRET_CONTROLS')

	const list = await jsonFetch('/ops/mission-control/secrets')
	assert.equal(list.response.status, 200)
	assert.equal(list.data.mode, 'MC2_OWNER_SECRET_CONTROLS')
	assert.equal(list.data.secrets.length, 4)
	assert(!list.text.includes(process.env.BETTERPPTX_MC_SECRET_DODO_TEST_API_KEY), 'Secret list leaked a raw API key.')

	const denied = await jsonFetch('/ops/mission-control/secrets/dodo_webhook_custom_token/reveal', {
		method: 'POST',
		body: JSON.stringify({ confirm: 'REVEAL dodo_webhook_custom_token' }),
	})
	assert.equal(denied.response.status, 403)
	assert.equal(denied.data.error.code, 'MC_ADMIN_REQUIRED')

	const adminHeaders = { 'x-betterpptx-mission-control-admin-token': process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN }
	const badConfirm = await jsonFetch('/ops/mission-control/secrets/dodo_webhook_custom_token/reveal', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify({ confirm: 'WRONG' }),
	})
	assert.equal(badConfirm.response.status, 400)
	assert.equal(badConfirm.data.error.code, 'MC_SECRET_CONFIRMATION_REQUIRED')

	const reveal = await jsonFetch('/ops/mission-control/secrets/dodo_webhook_custom_token/reveal', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify({ confirm: 'REVEAL dodo_webhook_custom_token' }),
	})
	assert.equal(reveal.response.status, 200)
	assert.equal(reveal.data.value, process.env.BETTERPPTX_MC_SECRET_DODO_WEBHOOK_CUSTOM_TOKEN)

	const update = await jsonFetch('/ops/mission-control/secrets/dodo_webhook_custom_token/update', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify({ value: 'route-updated-custom-token-for-mc2', confirm: 'UPDATE dodo_webhook_custom_token' }),
	})
	assert.equal(update.response.status, 200)
	assert(!JSON.stringify(update.data).includes('route-updated-custom-token-for-mc2'), 'Update route returned raw secret value.')

	const test = await jsonFetch('/ops/mission-control/secrets/dodo_webhook_custom_token/test', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify({}),
	})
	assert.equal(test.response.status, 200)
	assert.equal(test.data.ok, true)

	console.log('MC2 SECRET ROUTES VERIFY: PASS')
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}
