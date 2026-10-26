// Production rotation contract for the six owner Modal avatar accounts: deterministic
// selection, budget/staleness skips, failover order on error, and the public error when
// every account is unavailable. No network beyond a loopback mock worker.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-avatar-rotation-'))
Object.assign(process.env, {
	BETTERPPTX_AVATAR_ROTATION_MODE: 'deterministic',
	BETTERPPTX_AVATAR_BUDGET_STORE: 'local',
	BETTERPPTX_REQUIRE_AVATAR_BUDGET: '0',
	BETTERPPTX_AVATAR_BUDGET_STATE_FILE: path.join(tmp, 'budget.json'),
	BETTERPPTX_AVATAR_WORKER_ESTIMATED_RENDER_USD: '0.50',
	BETTERPPTX_AVATAR_WORKER_STATE_STORE: 'disabled',
})
for (const name of ['BETTERPPTX_PUBLIC_BLACK_BOX', 'BETTERPPTX_CREDENTIAL_STORE', 'BETTERPPTX_REQUIRE_PROVIDER_METROLOGY', 'BETTERPPTX_AVATAR_QUOTA_STATE_STORE']) delete process.env[name]

const { avatarWorkerAccounts, avatarWorkerHealthUrl, avatarWorkerStartIndex, renderMuseTalkHttp } = await import('../avatar/providers/musetalkHttp.mjs')
const { createAvatarWorkerBudgetStore } = await import('../storage/avatar-worker-budget-store.mjs')
const { publicAvatarError } = await import('../avatar/errors.mjs')

// The production account ids, in Secret Manager bundle order.
const IDS = ['telcomgapp', 'betterpptx-fluxworkerai', 'betterxavatar2', 'betterxavatar1', 'betterpptx', 'betterpptx-flux']
const behaviour = new Map()
const hits = []
const health = new Map()
const healthHits = []
const server = http.createServer((req, res) => {
	const id = req.url.split('/')[1]
	if (req.url.endsWith('/health')) {
		healthHits.push(id)
		const mode = health.get(id) || 'ok'
		if (mode === 'http-404' || mode === 'http-503') { res.writeHead(mode === 'http-404' ? 404 : 503); return res.end() }
		res.writeHead(200, { 'content-type': 'application/json' })
		return res.end(JSON.stringify({ ok: true, service: 'betterpptx-avatar-worker', gpu: false, authConfigured: true, authorized: mode !== 'unauthorized' }))
	}
	hits.push(id)
	req.resume().on('end', () => {
		const mode = behaviour.get(id) || 'ok'
		if (mode === 'ok') {
			res.writeHead(200, { 'content-type': 'video/mp4', 'x-gpu-seconds': '50', 'x-idempotency-state': 'completed', 'x-pipeline': 'test' })
			return res.end(Buffer.from('mp4'))
		}
		const status = { 'http-503': 503, 'http-401': 401, 'http-429': 429, 'http-400': 400 }[mode]
		res.writeHead(status, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ detail: mode }))
	})
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
// "unreachable" points at a closed loopback port, so fetch fails at connect time.
const closedPort = await new Promise(resolve => { const probe = http.createServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)) }) })
const pool = (unreachable, healthDown = new Set()) => IDS.map(id => ({ id, token: 't', url: unreachable.has(id) ? `http://127.0.0.1:${closedPort}/${id}` : `${base}/${id}`, healthUrl: unreachable.has(id) || healthDown.has(id) ? `http://127.0.0.1:${closedPort}/${id}/health` : `${base}/${id}/health` }))
const budget = createAvatarWorkerBudgetStore()
const jobDir = await fs.mkdtemp(path.join(tmp, 'job-'))
await fs.writeFile(path.join(jobDir, 'a.png'), Buffer.from('png'))
await fs.writeFile(path.join(jobDir, 'a.wav'), Buffer.from('wav'))

async function reset({ billed = {}, unreachable = new Set(), healthDown = new Set() } = {}) {
	behaviour.clear()
	health.clear()
	hits.length = 0
	healthHits.length = 0
	await fs.rm(process.env.BETTERPPTX_AVATAR_BUDGET_STATE_FILE, { force: true })
	const now = new Date().toISOString()
	for (const id of IDS) {
		const entry = billed[id] ?? 1
		if (entry === 'stale') await budget.recordBilled(id, 1, new Date(Date.now() - 7 * 3600000).toISOString())
		else if (entry !== 'missing') await budget.recordBilled(id, entry, now)
	}
	process.env.BETTERPPTX_AVATAR_WORKER_POOL = JSON.stringify(pool(unreachable, healthDown))
}
const render = key => renderMuseTalkHttp({ avatarImagePath: path.join(jobDir, 'a.png'), audioPath: path.join(jobDir, 'a.wav'), jobDir, provider: 'musetalk', idempotencyKey: key })
const startFor = key => IDS[crypto.createHash('sha256').update(key).digest().readUInt32BE(0) % IDS.length]
const orderFrom = start => IDS.slice(IDS.indexOf(start)).concat(IDS.slice(0, IDS.indexOf(start)))
// A key whose deterministic first choice is the given account.
const keyStartingAt = id => { for (let i = 0; ; i++) if (startFor(`job-${i}`) === id) return `job-${i}` }

test.after(() => { server.close(); delete process.env.BETTERPPTX_AVATAR_WORKER_POOL })

test('deterministic selection is a stable sha256 of the idempotency key over the six accounts', () => {
	const accounts = IDS.map(id => ({ id }))
	for (let i = 0; i < 200; i++) {
		const key = `deck-${i}:talking-head:0`
		assert.equal(IDS[avatarWorkerStartIndex(accounts, key)], startFor(key))
		assert.equal(avatarWorkerStartIndex(accounts, key), avatarWorkerStartIndex(accounts, key))
	}
	const seen = new Set(Array.from({ length: 200 }, (_, i) => startFor(`deck-${i}:talking-head:0`)))
	assert.equal(seen.size, IDS.length, 'every account receives first-choice traffic')
})

test('a healthy start account serves the render and an exact retry returns to it', async () => {
	await reset()
	const key = keyStartingAt('betterxavatar1')
	assert.equal((await render(key)).ok, true)
	assert.equal((await render(key)).ok, true)
	assert.deepEqual(hits, ['betterxavatar1', 'betterxavatar1'])
})

for (const [label, billed] of [['over budget', 28.0], ['billing stale', 'stale'], ['never synced', 'missing']]) {
	test(`an account ${label} is skipped without a provider call, in failover order`, async () => {
		const start = 'betterxavatar2'
		const next = orderFrom(start)[1]
		await reset({ billed: { [start]: billed } })
		const result = await render(keyStartingAt(start))
		assert.equal(result.ok, true)
		assert.deepEqual(hits, [next])
	})
}

for (const mode of ['http-503', 'http-401', 'http-429', 'unreachable']) {
	test(`a ${mode} start account fails over to the next account in order`, async () => {
		const start = 'betterpptx'
		const order = orderFrom(start)
		await reset({ unreachable: mode === 'unreachable' ? new Set([start]) : new Set() })
		if (mode !== 'unreachable') behaviour.set(start, mode)
		const result = await render(keyStartingAt(start))
		assert.equal(result.ok, true)
		assert.deepEqual(hits, mode === 'unreachable' ? [order[1]] : [start, order[1]])
		assert.match(result.warnings.join(' '), /failed over to endpoint 2\/6/)
	})
}

test('failover walks the full order, skipping budget-blocked accounts, and settles on the first healthy one', async () => {
	const start = 'telcomgapp'
	const order = orderFrom(start)
	await reset({ billed: { [order[1]]: 29 }, unreachable: new Set([order[2]]) })
	behaviour.set(order[0], 'http-503')
	behaviour.set(order[3], 'http-503')
	assert.equal((await render(keyStartingAt(start))).ok, true)
	assert.deepEqual(hits, [order[0], order[3], order[4]])
	assert.ok((await budget.get(order[4])).spentUsd > 1, 'the serving account is charged')
	assert.equal((await budget.get(order[1])).spentUsd, 29, 'the skipped account is not charged')
})

test('a non-retryable worker rejection stops failover instead of spending on other accounts', async () => {
	await reset()
	behaviour.set('betterxavatar1', 'http-400')
	await assert.rejects(render(keyStartingAt('betterxavatar1')), error => error.code === 'AVATAR_UNAVAILABLE')
	assert.deepEqual(hits, ['betterxavatar1'])
})

test('every account over budget or stale gives one actionable capacity error and no provider call', async () => {
	await reset({ billed: { telcomgapp: 28, 'betterpptx-fluxworkerai': 'stale', betterxavatar2: 29.4, betterxavatar1: 'missing', betterpptx: 28.5, 'betterpptx-flux': 30 } })
	await assert.rejects(render('any-key'), error => {
		assert.equal(error.code, 'AVATAR_CAPACITY_EXHAUSTED')
		assert.equal(error.details.retryable, true)
		assert.deepEqual(error.details.reasons, ['billing-stale', 'monthly-budget'])
		assert.match(error.message, /No video was rendered and no talking-head allowance was used\. Retry later, or continue with voice-only narration\./)
		assert.match(publicAvatarError(error), /Retry later/)
		return true
	})
	assert.deepEqual(hits, [])
})

test('a real worker failure is reported instead of a capacity error when the rest are budget-blocked', async () => {
	const start = 'betterpptx-flux'
	await reset({ billed: Object.fromEntries(IDS.filter(id => id !== start).map(id => [id, 29])) })
	behaviour.set(start, 'http-503')
	await assert.rejects(render(keyStartingAt(start)), error => error.code === 'AVATAR_UNAVAILABLE' && error.details.status === 503)
	assert.deepEqual(hits, [start])
})

test('public black-box errors keep the code and retry hint but drop the private failover trace', async () => {
	const { publicErrorDetails } = await import('../engine.mjs')
	const error = { code: 'AVATAR_CAPACITY_EXHAUSTED', details: { retryable: true, reasons: ['monthly-budget'], attempts: [{ accountHash: 'a'.repeat(64), phase: 'budget' }], workerCode: 'x' } }
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try {
		assert.deepEqual(publicErrorDetails(error), { retryable: true })
		assert.deepEqual(publicErrorDetails({ code: 'AVATAR_UNAVAILABLE', details: { status: 503, attempts: [] } }), null)
		assert.deepEqual(publicErrorDetails({ code: 'SPEC_INVALID', details: { errors: [1] } }), { errors: [1] })
	} finally { delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX }
	assert.equal(publicErrorDetails(error), error.details, 'local maintainers keep the full trace')
})

test('health URL comes from the bundle, else from the lipsync host, and never from a non-Modal host', () => {
	assert.equal(avatarWorkerHealthUrl({ url: 'https://telcomgapp--betterpptx-avatar-commercial-lipsync.modal.run' }), 'https://telcomgapp--betterpptx-avatar-commercial-health.modal.run')
	assert.equal(avatarWorkerHealthUrl({ url: 'https://innorag--betterpptx-avatar-commercial-lipsync.us-east.modal.run/' }), 'https://innorag--betterpptx-avatar-commercial-health.us-east.modal.run')
	assert.equal(avatarWorkerHealthUrl({ url: 'https://x--betterpptx-avatar-commercial-lipsync.modal.run', healthUrl: 'https://x--betterpptx-avatar-commercial-health.us-east.modal.run' }), 'https://x--betterpptx-avatar-commercial-health.us-east.modal.run')
	assert.equal(avatarWorkerHealthUrl({ url: 'https://avatar.example.run.app' }), '')
	const previous = process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL
	process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL = JSON.stringify({ providers: { 'avatar-worker-commercial': { accounts: [{ id: 'a', env: { BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL: 'https://a--betterpptx-avatar-commercial-lipsync.modal.run', BETTERPPTX_COMMERCIAL_AVATAR_WORKER_HEALTH_URL: 'https://a--betterpptx-avatar-commercial-health.us-east.modal.run/' } }] } } })
	try { assert.equal(avatarWorkerAccounts('liveportrait-musetalk-commercial')[0].healthUrl, 'https://a--betterpptx-avatar-commercial-health.us-east.modal.run') }
	finally { if (previous === undefined) delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL; else process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL = previous }
})

test('with the health pre-check on, a healthy account is checked once and then serves the render', async () => {
	process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK = '1'
	try {
		await reset()
		assert.equal((await render(keyStartingAt('betterxavatar2'))).ok, true)
		assert.deepEqual(healthHits, ['betterxavatar2'])
		assert.deepEqual(hits, ['betterxavatar2'])
	} finally { delete process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK }
})

for (const mode of ['http-503', 'unauthorized', 'unreachable']) {
	test(`a ${mode} health check skips the account without any render request or charge`, async () => {
		process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK = '1'
		try {
			const start = 'betterpptx'
			const next = orderFrom(start)[1]
			await reset({ healthDown: mode === 'unreachable' ? new Set([start]) : new Set() })
			if (mode !== 'unreachable') health.set(start, mode)
			const result = await render(keyStartingAt(start))
			assert.equal(result.ok, true)
			assert.deepEqual(hits, [next], 'no render request reached the unhealthy account')
			assert.equal((await budget.get(start)).spentUsd, 1, 'the skipped account is not charged')
		} finally { delete process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK }
	})
}

test('a worker without the health route (404) is still tried', async () => {
	process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK = '1'
	try {
		await reset()
		health.set('telcomgapp', 'http-404')
		assert.equal((await render(keyStartingAt('telcomgapp'))).ok, true)
		assert.deepEqual(hits, ['telcomgapp'])
	} finally { delete process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK }
})

test('every account failing its health check reports the worker as unavailable, not capacity', async () => {
	process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK = '1'
	try {
		await reset()
		for (const id of IDS) health.set(id, 'http-503')
		await assert.rejects(render('all-unhealthy'), error => error.code === 'AVATAR_UNAVAILABLE' && error.details.retryable === true)
		assert.deepEqual(hits, [])
		assert.equal(healthHits.length, IDS.length)
	} finally { delete process.env.BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK }
})
