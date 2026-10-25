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

const { avatarWorkerStartIndex, renderMuseTalkHttp } = await import('../avatar/providers/musetalkHttp.mjs')
const { createAvatarWorkerBudgetStore } = await import('../storage/avatar-worker-budget-store.mjs')
const { publicAvatarError } = await import('../avatar/errors.mjs')

// The production account ids, in Secret Manager bundle order.
const IDS = ['telcomgapp', 'betterpptx-fluxworkerai', 'betterxavatar2', 'betterxavatar1', 'betterpptx', 'betterpptx-flux']
const behaviour = new Map()
const hits = []
const server = http.createServer((req, res) => {
	const id = req.url.split('/')[1]
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
const pool = unreachable => IDS.map(id => ({ id, url: unreachable.has(id) ? `http://127.0.0.1:${closedPort}/${id}` : `${base}/${id}` }))
const budget = createAvatarWorkerBudgetStore()
const jobDir = await fs.mkdtemp(path.join(tmp, 'job-'))
await fs.writeFile(path.join(jobDir, 'a.png'), Buffer.from('png'))
await fs.writeFile(path.join(jobDir, 'a.wav'), Buffer.from('wav'))

async function reset({ billed = {}, unreachable = new Set() } = {}) {
	behaviour.clear()
	hits.length = 0
	await fs.rm(process.env.BETTERPPTX_AVATAR_BUDGET_STATE_FILE, { force: true })
	const now = new Date().toISOString()
	for (const id of IDS) {
		const entry = billed[id] ?? 1
		if (entry === 'stale') await budget.recordBilled(id, 1, new Date(Date.now() - 7 * 3600000).toISOString())
		else if (entry !== 'missing') await budget.recordBilled(id, entry, now)
	}
	process.env.BETTERPPTX_AVATAR_WORKER_POOL = JSON.stringify(pool(unreachable))
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
