import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-avatar-budget-'))
Object.assign(process.env, {
	BETTERPPTX_AVATAR_BUDGET_STORE: 'local',
	// Required mode demands the distributed store; the local store runs unrequired here.
	BETTERPPTX_REQUIRE_AVATAR_BUDGET: '0',
	BETTERPPTX_AVATAR_BUDGET_STATE_FILE: path.join(tmp, 'budget.json'),
	BETTERPPTX_AVATAR_WORKER_MONTHLY_CAP_USD: '29.50',
	BETTERPPTX_AVATAR_WORKER_BUDGET_RESERVE_USD: '1.50',
	BETTERPPTX_AVATAR_WORKER_ESTIMATED_RENDER_USD: '0.50',
	BETTERPPTX_AVATAR_ROTATION_MODE: 'round-robin',
	BETTERPPTX_AVATAR_WORKER_STATE_STORE: 'local',
	BETTERPPTX_AVATAR_WORKER_STATE_FILE: path.join(tmp, 'state.json'),
})
delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX
delete process.env.BETTERPPTX_CREDENTIAL_STORE

const { avatarWorkerBudgetProductionConfig, avatarWorkerRenderCostUsd, createAvatarWorkerBudgetStore } = await import('../storage/avatar-worker-budget-store.mjs')
const { avatarWorkerAccounts, renderMuseTalkHttp } = await import('../avatar/providers/musetalkHttp.mjs')

test('an account without a fresh billing figure fails closed', async () => {
	const store = createAvatarWorkerBudgetStore()
	const result = await store.reserve('never-synced', 'r1', 0.5)
	assert.equal(result.ok, false)
	assert.equal(result.code, 'AVATAR_WORKER_BILLING_STALE')
})

test('billed spend plus unbilled renders stops an account before the $29.50 cap', async () => {
	const store = createAvatarWorkerBudgetStore()
	await store.recordBilled('near-cap', 27.2, new Date().toISOString())
	const first = await store.reserve('near-cap', 'a', 0.5)
	assert.equal(first.ok, true)
	assert.equal(first.spentUsd, 27.7)
	await store.settle('near-cap', 'a', 0.4)
	const second = await store.reserve('near-cap', 'b', 0.5)
	assert.equal(second.ok, false, 'limit is cap minus reserve: 27.6 + 0.5 > 28.0')
	assert.equal(second.code, 'AVATAR_WORKER_BUDGET_EXHAUSTED')
	assert.equal((await store.reserve('near-cap', 'a', 0.5)).ok, true, 'an exact retry is not counted twice')
})

test('a stale billing figure blocks even with headroom', async () => {
	const store = createAvatarWorkerBudgetStore()
	await store.recordBilled('stale', 1, new Date(Date.now() - 7 * 3600000).toISOString())
	assert.equal((await store.reserve('stale', 'x', 0.5)).code, 'AVATAR_WORKER_BILLING_STALE')
})

test('production config requires the distributed store and a positive cap', () => {
	assert.deepEqual(avatarWorkerBudgetProductionConfig({ provider: 'local', required: true, limitUsd: 28, estimatedRenderUsd: 0.5 }).errors, ['AVATAR_BUDGET_DISTRIBUTED_STORE_REQUIRED'])
	assert.equal(avatarWorkerBudgetProductionConfig({ provider: 'firestore', required: true, limitUsd: 28, estimatedRenderUsd: 0.5 }).ok, true)
	assert.equal(avatarWorkerRenderCostUsd(100, { usdPerGpuSecond: 0.0011, coldStartUsd: 0.1 }), 0.21)
})

test('the pool env accepts a credential-store document and skips disabled accounts', () => {
	process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL = JSON.stringify({
		schemaVersion: 'betterpptx.credential-store.v1',
		providers: { 'avatar-worker-commercial': { accounts: [
			{ id: 'a', enabled: true, env: { BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL: 'https://a.example/', BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE: '/', BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN: 't' } },
			{ id: 'b', enabled: false, env: { BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL: 'https://b.example' } },
		] } },
	})
	try {
		const accounts = avatarWorkerAccounts('liveportrait-musetalk-commercial')
		assert.deepEqual(accounts.map(account => [account.id, account.url, account.route]), [['a', 'https://a.example', '/']])
	} finally { delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL }
})

test('rotation skips an exhausted account and settles the render on the next one', async () => {
	const hits = []
	const server = http.createServer((req, res) => {
		hits.push(req.url)
		req.resume().on('end', () => {
			res.writeHead(200, { 'content-type': 'video/mp4', 'x-gpu-seconds': '100', 'x-render-seconds': '5', 'x-idempotency-state': 'completed', 'x-pipeline': 'test' })
			res.end(Buffer.from('mp4'))
		})
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const base = `http://127.0.0.1:${server.address().port}`
	process.env.BETTERPPTX_AVATAR_WORKER_POOL = JSON.stringify([{ id: 'full', url: `${base}/full` }, { id: 'open', url: `${base}/open` }])
	const store = createAvatarWorkerBudgetStore()
	await store.recordBilled('full', 28.9, new Date().toISOString())
	await store.recordBilled('open', 2, new Date().toISOString())
	const jobDir = await fs.mkdtemp(path.join(tmp, 'job-'))
	await fs.writeFile(path.join(jobDir, 'a.png'), Buffer.from('png'))
	await fs.writeFile(path.join(jobDir, 'a.wav'), Buffer.from('wav'))
	try {
		for (let attempt = 0; attempt < 2; attempt++) {
			const result = await renderMuseTalkHttp({ avatarImagePath: path.join(jobDir, 'a.png'), audioPath: path.join(jobDir, 'a.wav'), jobDir, provider: 'musetalk' })
			assert.equal(result.ok, true)
		}
		assert.ok(hits.every(url => url.startsWith('/open/')), 'the exhausted account never receives work')
		assert.equal((await store.get('open')).spentUsd, 2.42)
		await store.recordBilled('open', 28.5, new Date().toISOString())
		await assert.rejects(
			renderMuseTalkHttp({ avatarImagePath: path.join(jobDir, 'a.png'), audioPath: path.join(jobDir, 'a.wav'), jobDir, provider: 'musetalk' }),
			error => error.code === 'AVATAR_BUDGET_EXHAUSTED',
		)
		assert.equal(hits.length, 2)
	} finally {
		delete process.env.BETTERPPTX_AVATAR_WORKER_POOL
		server.close()
	}
})
