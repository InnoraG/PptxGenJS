import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import * as asyncHooks from 'node:async_hooks'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import * as authorization from '../auth/resource-authorization.mjs'

// Run: node --experimental-vm-modules --test betterpptx-mcp/test/avatar-job-ownership-security.test.mjs
// Execute the actual job manager and serializer with an isolated synthetic env.
// No inherited environment, credentials, engine, media, billing service or network
// is read or invoked. The only dynamic cloud import resolves to the fake below.
const jobUrl = new URL('../avatar/jobs.mjs', import.meta.url).href
const storeUrl = new URL('../storage/avatar-job-store.mjs', import.meta.url).href
const authUrl = new URL('../auth/resource-authorization.mjs', import.meta.url).href
const sources = new Map(await Promise.all([jobUrl, storeUrl].map(async url => [url, await fs.readFile(new URL(url), 'utf8')])))
const engineSource = await fs.readFile(new URL('../engine.mjs', import.meta.url), 'utf8')
const alice = Object.freeze({ installHash: `install_${'a'.repeat(64)}`, sessionId: 'issued-session-a' })
const bob = Object.freeze({ installHash: `install_${'b'.repeat(64)}`, sessionId: 'issued-session-b' })
const reconnect = Object.freeze({ ...alice, sessionId: 'issued-session-a-reconnect' })
const as = (context, fn) => authorization.withResourceAuthorization(context, fn)
const ownerOf = context => authorization.resourceOwnerForContext(context)
const plain = value => structuredClone(value)
const missing = { code: 'AVATAR_JOB_NOT_FOUND', message: 'The avatar job is unavailable.' }
const video = () => ({ publicVideo: { ref: 'asset://locked/video/synthetic', posterRef: 'asset://locked/poster/synthetic', durationMs: 1200, extn: 'mp4', cacheHit: false } })

function deferred() {
	let resolve, reject
	const promise = new Promise((yes, no) => { resolve = yes; reject = no })
	return { promise, resolve, reject }
}

function backend() {
	const records = new Map()
	const writes = []
	const reads = []
	const state = { records, writes, reads, beforeCreate: null, afterCreate: null, beforeSet: null, afterGet: null }
	state.Firestore = class {
		collection() {
			return { doc(id) {
				return {
					async create(record) {
						await state.beforeCreate?.(record)
						if (records.has(id)) throw Object.assign(new Error('Synthetic existing record'), { code: 6 })
						records.set(id, plain(record))
						writes.push({ action: 'create', record: plain(record), owner: authorization.currentResourceOwner() })
						await state.afterCreate?.(record)
					},
					async set(record) {
						await state.beforeSet?.(record)
						records.set(id, plain(record))
						writes.push({ action: 'set', record: plain(record), owner: authorization.currentResourceOwner() })
					},
					async get() {
						reads.push(id)
						const record = await state.afterGet?.(records.get(id)) ?? records.get(id)
						return { exists: !!record, data: () => plain(record) }
					},
				}
			} }
		}
	}
	return state
}

async function runtime({ provider = 'disabled', remote = backend(), file, extraEnv = {} } = {}) {
	const context = createContext({
		process: { pid: 1, env: Object.freeze({
			BETTERPPTX_AVATAR_JOB_STORE: provider,
			BETTERPPTX_AVATAR_JOB_STORE_FILE: file,
			BETTERPPTX_AVATAR_MAX_CONCURRENCY: '1',
			BETTERPPTX_AVATAR_JOB_TTL_MS: '86400000',
			...extraEnv,
		}) },
		structuredClone, setTimeout, clearTimeout,
	})
	const modules = new Map()
	const allowed = new Map([
		['node:crypto', crypto], ['node:async_hooks', asyncHooks], ['node:fs/promises', fs], ['node:path', path],
		[authUrl, authorization], ['@google-cloud/firestore', { Firestore: remote.Firestore }],
	])
	function moduleFor(id) {
		if (modules.has(id)) return modules.get(id)
		let module
		if (sources.has(id)) {
			module = new SourceTextModule(sources.get(id), {
				context, identifier: id,
				importModuleDynamically: async specifier => {
					assert.equal(specifier, '@google-cloud/firestore', 'Unexpected dynamic dependency')
					const dependency = moduleFor(specifier)
					if (dependency.status === 'unlinked') await dependency.link(link)
					if (dependency.status === 'linked') await dependency.evaluate()
					return dependency
				},
			})
		} else {
			assert.ok(allowed.has(id), `Forbidden dependency: ${id}`)
			const exports = allowed.get(id)
			module = new SyntheticModule(Object.keys(exports), function () {
				for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
			}, { context, identifier: id })
		}
		modules.set(id, module)
		return module
	}
	function link(specifier, referencing) {
		return moduleFor(specifier.startsWith('.') ? new URL(specifier, referencing.identifier).href : specifier)
	}
	const main = moduleFor(jobUrl)
	await main.link(link)
	await main.evaluate()
	return { jobs: main.namespace, store: modules.get(storeUrl).namespace, remote }
}

async function terminal(api, id, context = alice) {
	return as(context, () => api.waitForAvatarJob(id, { timeoutMs: 2000, pollMs: 25, context }))
}

async function temporaryStore(t) {
	const base = path.resolve(os.tmpdir())
	const root = await fs.mkdtemp(path.join(base, 'betterpptx-avatar-security-'))
	t.after(async () => {
		assert.equal(path.dirname(path.resolve(root)), base)
		assert.ok(path.basename(root).startsWith('betterpptx-avatar-security-'))
		await fs.rm(root, { recursive: true, force: true })
	})
	return path.join(root, 'jobs.json')
}

class FixtureAssetGrantError extends Error {
	constructor(code, message) { super(message); this.name = 'AssetGrantError'; this.code = code }
}

function assetBoundary(grants = []) {
	// Explicit test-owned grants, independent of the job/result. Reading an
	// opaque handle or cached path never creates a grant in this fixture.
	const rows = new Map(grants.map(([handle, context]) => [handle, ownerOf(context)]))
	const events = []
	const assertGranted = handle => {
		const owner = authorization.currentResourceOwner()
		const grant = rows.get(handle)
		if (!grant || grant.kind !== owner.kind || grant.id !== owner.id) {
			throw new FixtureAssetGrantError('ASSET_NOT_FOUND', 'The asset handle is unavailable.')
		}
	}
	return {
		events,
		dependencies: {
			AssetGrantError: FixtureAssetGrantError,
			enforceAssetOwnership: () => true,
			authorizeAssetReferences: async result => {
				const handles = [result?.ref, result?.posterRef].filter(Boolean)
				events.push({ action: 'authorize', handles })
				for (const handle of handles) assertGranted(handle)
			},
			resolveGeneratedAssetRefs: handle => {
				assertGranted(handle)
				events.push({ action: 'resolve', handle })
				return 'synthetic-authorized-path'
			},
		},
	}
}

async function engineHandlers(jobs, overrides = {}) {
	// Run the repository's exact avatar integration functions, without evaluating
	// the full engine (which initializes unrelated stores/providers). These named
	// functions have top-level closing braces; no implementation is copied here.
	const names = ['finalizeAvatarJobBilling', 'handleAvatarRenderJob', 'handleAvatarJobStatus', 'avatarVideoFromCompletedResult']
	const functions = names.map(name => {
		const start = engineSource.indexOf(`\nasync function ${name}(`)
		assert.ok(start >= 0, `Missing engine integration ${name}`)
		const end = engineSource.indexOf('\n}', start)
		assert.ok(end > start)
		return engineSource.slice(start, end + 2)
	}).join('\n')
	const context = createContext({
		...Object.fromEntries(Object.entries(jobs)),
		process: { env: Object.freeze({ BETTERPPTX_USAGE_AUTO_FLUSH: '0', BETTERPPTX_AVATAR_DURABLE_WAIT_MS: '2000' }) },
		assertAvatarGenerationInput: () => {},
		renderAvatarFromToolArgs: async () => ({ avatarVideo: { normalizedVideoPath: 'synthetic-video', posterPath: 'synthetic-poster', durationMs: 1200, cacheHit: false } }),
		registerGeneratedAsset: (value, kind) => `asset://locked/${kind}/${value}`,
		publicAvatarVideo: value => ({ ref: value.ref, posterRef: value.posterRef, durationMs: value.durationMs, extn: 'mp4', cacheHit: !!value.cacheHit }),
		finalizeBillingReservation: async () => {}, releaseBillingReservation: async () => {},
		isPublicBlackBoxMode: () => true,
		...assetBoundary().dependencies, // Grant-free by default; asset access denies.
		coverDataUriFromPng: async () => 'synthetic-cover',
		...overrides,
	})
	const module = new SourceTextModule(`${functions}\nexport { ${names.join(', ')} }`, { context })
	await module.link(() => assert.fail('Unexpected engine dependency'))
	await module.evaluate()
	return module.namespace
}

test('new jobs use stable install ownership, deny foreign caches and never project private metadata', async () => {
	const { jobs } = await runtime()
	const queued = await as(alice, () => jobs.createAvatarJob({ sessionId: alice.sessionId, task: async () => ({
		...video(), normalizedVideoPath: 'private-synthetic-path', resourceOwner: ownerOf(alice),
		publicVideo: { ...video().publicVideo, resourceOwner: ownerOf(alice), metadata: { private: true } },
	}) }))
	const finished = await terminal(jobs, queued.jobId)
	assert.deepEqual(finished.resourceOwner, ownerOf(alice))
	assert.equal(Object.getOwnPropertyDescriptor(finished, 'resourceOwner').writable, false)
	assert.equal(as(reconnect, () => jobs.getAvatarJob(queued.jobId)), finished)
	for (const context of [bob, { ...bob, sessionId: alice.sessionId }, { sessionId: alice.sessionId }]) {
		assert.throws(() => as(context, () => jobs.getAvatarJob(queued.jobId)), missing)
		await assert.rejects(as(context, () => jobs.getAvatarJobAsync(queued.jobId)), missing)
		assert.throws(() => as(context, () => jobs.publicAvatarJob(finished)), missing)
	}
	assert.throws(() => jobs.assertAvatarJobAccess(finished, {}), missing)
	const projected = as(reconnect, () => jobs.publicAvatarJob(finished))
	assert.deepEqual(plain(projected.video), video().publicVideo)
	for (const privateText of ['resourceOwner', 'metadata', 'normalizedVideoPath', alice.installHash, alice.sessionId, ownerOf(alice).id]) {
		assert.equal(JSON.stringify(projected).includes(privateText), false)
	}
})

test('legacy access requires a non-default server session and cannot override an active or malformed owner', async () => {
	const { jobs, store } = await runtime()
	const legacy = { id: 'avatar_job_legacy', sessionId: 'issued-legacy', status: 'succeeded', result: video() }
	const hashed = { id: legacy.id, _sessionHash: store.avatarSessionHash(legacy.sessionId) }
	for (const record of [legacy, hashed]) {
		assert.equal(jobs.assertAvatarJobAccess(record, { sessionId: legacy.sessionId }), record)
		assert.equal(as({ sessionId: legacy.sessionId }, () => jobs.assertAvatarJobAccess(record, { sessionId: legacy.sessionId })), record)
		for (const sessionId of ['', 'other-issued-session', 'anonymous', 'default', 'stdio-default']) {
			assert.throws(() => jobs.assertAvatarJobAccess(record, { sessionId }), missing)
		}
		assert.throws(() => as(bob, () => jobs.assertAvatarJobAccess(record, { ...alice, sessionId: legacy.sessionId })), missing)
	}
	for (const metadata of [{ resourceOwner: null }, { resourceOwner: {} }, { resourceOwner: ownerOf(bob) }]) {
		assert.throws(() => as(alice, () => jobs.assertAvatarJobAccess({ ...legacy, metadata }, { ...alice, sessionId: legacy.sessionId })), missing)
	}
	for (const record of [{}, { _sessionHash: store.avatarSessionHash('') }, { sessionId: 'anonymous' }]) {
		assert.throws(() => as(alice, () => jobs.assertAvatarJobAccess(record, alice)), missing)
	}
	assert.throws(() => as(alice, () => jobs.assertAvatarJobAccess({ ...legacy, resourceOwner: ownerOf(alice), metadata: { resourceOwner: ownerOf(bob) } }, alice)), missing)
})

test('queued tasks, persistence and settlement restore nested owner and other ALS scopes', async () => {
	const { jobs, remote } = await runtime({ provider: 'firestore' })
	const firstGate = deferred()
	const otherScope = new AsyncLocalStorage()
	const seen = []
	const record = phase => seen.push({ phase, owner: authorization.currentResourceOwner(), other: otherScope.getStore() })
	const first = await as(alice, () => otherScope.run('scope-a', () => jobs.createAvatarJob({
		task: async () => { record('a-task'); await firstGate.promise; return video() },
		onSuccess: () => record('a-success'),
	})))
	const mutable = { ...bob }
	const second = await as(alice, () => as(mutable, () => otherScope.run('scope-b', () => jobs.createAvatarJob({
		// The ambient verified install must win over even a matching foreign session.
		sessionId: alice.sessionId,
		task: async () => { record('b-task'); return video() }, onSuccess: () => record('b-success'),
	}))))
	mutable.installHash = alice.installHash
	assert.equal(as(bob, () => jobs.getAvatarJob(second.jobId)).status, 'queued')
	firstGate.resolve()
	await terminal(jobs, first.jobId)
	await terminal(jobs, second.jobId, bob)
	assert.deepEqual(seen, [
		{ phase: 'a-task', owner: ownerOf(alice), other: 'scope-a' },
		{ phase: 'a-success', owner: ownerOf(alice), other: 'scope-a' },
		{ phase: 'b-task', owner: ownerOf(bob), other: 'scope-b' },
		{ phase: 'b-success', owner: ownerOf(bob), other: 'scope-b' },
	])
	for (const write of remote.writes) assert.deepEqual(write.owner, write.record.metadata.resourceOwner)
	assert.equal(authorization.resourceAuthorizationActive(), false)
})

test('warm and cold polling cannot see a cached result until settlement completes', async () => {
	const remote = backend()
	const { jobs } = await runtime({ provider: 'firestore', remote })
	const cold = (await runtime({ provider: 'firestore', remote })).jobs
	const settling = deferred()
	const finishSettlement = deferred()
	const created = await as(alice, () => jobs.createAvatarJob({
		billing: { active: true },
		task: async () => ({ ...video(), cacheHit: true }),
		onSuccess: async () => { settling.resolve(); await finishSettlement.promise },
	}))
	await settling.promise
	for (const api of [jobs, cold]) {
		const job = await as(reconnect, () => api.getAvatarJobAsync(created.jobId))
		assert.equal(job.status, 'running')
		assert.equal(job.result, null)
		assert.equal(as(reconnect, () => api.publicAvatarJob(job)).video, null)
		await assert.rejects(as(bob, () => api.getAvatarJobAsync(created.jobId)), missing)
	}
	assert.equal(remote.writes.some(write => write.record.status === 'succeeded'), false)
	finishSettlement.resolve()
	await terminal(jobs, created.jobId)
	const persisted = await as(reconnect, () => cold.getAvatarJobAsync(created.jobId))
	assert.equal(persisted.status, 'succeeded')
	assert.equal(persisted.metadata.deliveryState, 'settled')
	assert.equal(as(reconnect, () => cold.publicAvatarJob(persisted)).video.ref, video().publicVideo.ref)
})

test('paid settlement failure withholds all results and preserves an uncertain reservation', async () => {
	const { jobs, remote } = await runtime({ provider: 'firestore' })
	let released = 0
	const uncertain = deferred()
	const created = await as(alice, () => jobs.createAvatarJob({
		billing: { active: true }, task: async () => video(),
		onSuccess: async () => { throw Object.assign(new Error('synthetic private settlement detail'), { code: 'SETTLEMENT_UNKNOWN' }) },
		onFailure: () => { released++ },
		onUncertain: (error, job) => uncertain.resolve({ error, job, owner: authorization.currentResourceOwner() }),
	}))
	const callback = await uncertain.promise
	const finished = await terminal(jobs, created.jobId)
	assert.equal(released, 0)
	assert.deepEqual(callback.owner, ownerOf(alice))
	assert.equal(finished.status, 'failed')
	assert.equal(finished.result, null)
	assert.equal(finished.metadata.failurePhase, 'settling')
	const result = as(alice, () => jobs.publicAvatarJob(finished))
	assert.deepEqual(plain(result.error), { code: 'SETTLEMENT_UNKNOWN', message: 'Avatar job failed.' })
	assert.equal(result.video, null)
	assert.equal(JSON.stringify(result).includes('private settlement'), false)
	assert.equal(remote.writes.some(write => write.record.status === 'succeeded' || write.record.result), false)
})

test('paid renderer uncertainty never invokes a refund callback and callback rejection does not strand the queue', async () => {
	const { jobs } = await runtime()
	let released = 0
	const uncertain = deferred()
	const first = await as(alice, () => jobs.createAvatarJob({
		billing: { active: true }, task: async () => { throw new Error('synthetic worker timeout') }, onSuccess: async () => {},
		onFailure: () => { released++ },
		onUncertain: () => { uncertain.resolve(authorization.currentResourceOwner()); throw new Error('synthetic reconciliation failure') },
	}))
	const second = await as(bob, () => jobs.createAvatarJob({ task: async () => video() }))
	assert.deepEqual(await uncertain.promise, ownerOf(alice))
	const failed = await terminal(jobs, first.jobId)
	assert.equal(failed.metadata.failureCallbackFailed, true)
	assert.equal(released, 0)
	assert.equal((await terminal(jobs, second.jobId, bob)).status, 'succeeded')
})

test('a confirmed no-cost render failure invokes the release callback under its captured owner', async () => {
	const { jobs } = await runtime()
	const released = deferred()
	const created = await as(bob, () => jobs.createAvatarJob({
		billing: { active: true }, onSuccess: async () => {},
		task: async () => { throw Object.assign(new Error('synthetic no-cost refusal'), { billingNoCostConfirmed: true }) },
		onFailure: () => released.resolve(authorization.currentResourceOwner()),
		onUncertain: () => assert.fail('No-cost failure marked uncertain'),
	}))
	assert.deepEqual(await released.promise, ownerOf(bob))
	assert.equal((await terminal(jobs, created.jobId, bob)).status, 'failed')
})

test('running-state persistence failure stops before rendering and safely releases the reservation', async () => {
	const remote = backend()
	remote.beforeSet = record => { if (record.status === 'running') throw new Error('synthetic write failure') }
	const { jobs } = await runtime({ provider: 'firestore', remote })
	let renders = 0
	const released = deferred()
	const created = await as(alice, () => jobs.createAvatarJob({
		billing: { active: true }, task: async () => { renders++; return video() }, onSuccess: async () => {},
		onFailure: () => released.resolve(),
	}))
	await released.promise
	const failed = await terminal(jobs, created.jobId)
	assert.equal(renders, 0)
	assert.equal(failed.metadata.failurePhase, 'starting')
	assert.equal(failed.result, null)
})

test('terminal persistence failure after settlement does not expose or refund the rendered result', async () => {
	const remote = backend()
	remote.beforeSet = record => { if (record.status === 'succeeded') throw new Error('synthetic terminal write failure') }
	const { jobs } = await runtime({ provider: 'firestore', remote })
	let settled = 0, released = 0
	const uncertain = deferred()
	const created = await as(alice, () => jobs.createAvatarJob({
		billing: { active: true }, task: async () => video(), onSuccess: async () => { settled++ },
		onFailure: () => { released++ }, onUncertain: () => uncertain.resolve(),
	}))
	await uncertain.promise
	const failed = await terminal(jobs, created.jobId)
	assert.equal(settled, 1)
	assert.equal(released, 0)
	assert.equal(failed.metadata.failurePhase, 'publishing')
	assert.equal(as(alice, () => jobs.publicAvatarJob(failed)).video, null)
	assert.equal(remote.records.get(created.jobId).result, null)
})

test('same-owner concurrent admissions share one execution; another owner has a separate job', async () => {
	const { jobs } = await runtime()
	const gate = deferred()
	let renders = 0, settlements = 0
	const input = { executionKey: 'issued-reservation-fixture', task: async () => { renders++; await gate.promise; return video() }, onSuccess: () => { settlements++ } }
	const [one, two] = await Promise.all([as(alice, () => jobs.createAvatarJob(input)), as(reconnect, () => jobs.createAvatarJob(input))])
	assert.equal(one.jobId, two.jobId)
	const foreign = await as(bob, () => jobs.createAvatarJob(input))
	assert.notEqual(foreign.jobId, one.jobId)
	gate.resolve()
	await terminal(jobs, one.jobId)
	await terminal(jobs, foreign.jobId, bob)
	assert.equal(renders, 2)
	assert.equal(settlements, 2)
	const replay = await as(reconnect, () => jobs.createAvatarJob(input))
	assert.equal(replay.jobId, one.jobId)
	assert.equal(replay.status, 'succeeded')
	assert.equal(renders, 2)
})

test('atomic durable admission across fresh replicas renders and settles exactly once, including reconnect replay', async () => {
	const remote = backend()
	const first = (await runtime({ provider: 'firestore', remote })).jobs
	const second = (await runtime({ provider: 'firestore', remote })).jobs
	const gate = deferred()
	let renders = 0, settlements = 0
	const input = { executionKey: 'issued-distributed-reservation', billing: { active: true },
		task: async () => { renders++; await gate.promise; return video() }, onSuccess: () => { settlements++ } }
	const [one, two] = await Promise.all([as(alice, () => first.createAvatarJob(input)), as(reconnect, () => second.createAvatarJob(input))])
	assert.equal(one.jobId, two.jobId)
	gate.resolve()
	await terminal(first, one.jobId)
	await terminal(second, two.jobId, reconnect)
	const cold = (await runtime({ provider: 'firestore', remote })).jobs
	const replay = await as(reconnect, () => cold.createAvatarJob(input))
	assert.equal(replay.status, 'succeeded')
	assert.equal(renders, 1)
	assert.equal(settlements, 1)
	assert.equal(remote.writes.filter(write => write.action === 'create').length, 1)
})

test('an ambiguous initial write is never retried as a new costly job', async () => {
	const remote = backend()
	remote.afterCreate = () => { throw new Error('synthetic lost acknowledgement') }
	const { jobs } = await runtime({ provider: 'firestore', remote })
	let renders = 0
	const input = { executionKey: 'issued-uncertain-reservation', task: async () => { renders++; return video() } }
	await assert.rejects(as(alice, () => jobs.createAvatarJob(input)), /lost acknowledgement/)
	const cold = (await runtime({ provider: 'firestore', remote })).jobs
	const replay = await as(reconnect, () => cold.createAvatarJob(input))
	assert.equal(replay.status, 'queued')
	assert.equal(replay.video, null)
	assert.equal(renders, 0)
})

test('real local serialization preserves the private owner on every write and fresh hydration', async t => {
	const file = await temporaryStore(t)
	const { jobs } = await runtime({ provider: 'local', file })
	const created = await as(alice, () => jobs.createAvatarJob({ sessionId: alice.sessionId, deckId: 'private-fixture-deck', task: async () => video() }))
	await terminal(jobs, created.jobId)
	const bytes = await fs.readFile(file, 'utf8')
	const saved = JSON.parse(bytes).jobs[created.jobId]
	assert.deepEqual(saved.metadata.resourceOwner, ownerOf(alice))
	assert.equal(saved.metadata.deliveryState, 'settled')
	assert.equal(bytes.includes(alice.installHash), false)
	assert.equal(bytes.includes(alice.sessionId), false)
	assert.equal(bytes.includes('private-fixture-deck'), false)
	assert.equal(Object.hasOwn(saved.result, 'resourceOwner'), false)
	const cold = (await runtime({ provider: 'local', file })).jobs
	const loaded = await as(reconnect, () => cold.getAvatarJobAsync(created.jobId))
	assert.deepEqual(loaded.metadata.resourceOwner, ownerOf(alice))
	assert.equal(loaded.status, 'succeeded')
	await assert.rejects(as(bob, () => cold.getAvatarJobAsync(created.jobId)), missing)
})

test('an unreadable local ledger fails closed instead of starting an untracked render', async t => {
	const file = await temporaryStore(t)
	await fs.writeFile(file, '{synthetic truncated ledger', 'utf8')
	const { jobs } = await runtime({ provider: 'local', file })
	let renders = 0
	await assert.rejects(as(alice, () => jobs.createAvatarJob({ executionKey: 'issued-same-reservation', task: async () => { renders++; return video() } })), { code: 'AVATAR_JOB_PERSISTENCE_FAILED' })
	assert.equal(renders, 0)
	assert.equal(await fs.readFile(file, 'utf8'), '{synthetic truncated ledger')
})

test('cold legacy reads use only the validated server session and retain the same unavailable error', async () => {
	const { jobs, remote, store } = await runtime({ provider: 'firestore' })
	const id = 'avatar_job_legacy_durable'
	remote.records.set(id, { jobId: id, status: 'succeeded', sessionHash: store.avatarSessionHash(alice.sessionId), result: video().publicVideo })
	const legacy = await as(alice, () => jobs.getAvatarJobAsync(id, alice))
	assert.equal(as(alice, () => jobs.publicAvatarJob(legacy, alice)).video.ref, video().publicVideo.ref)
	await assert.rejects(as(reconnect, () => jobs.getAvatarJobAsync(id, reconnect)), missing)
	await assert.rejects(as(bob, () => jobs.getAvatarJobAsync(id, alice)), missing)
	await assert.rejects(as(alice, () => jobs.getAvatarJobAsync(id)), missing)
	assert.throws(() => as(alice, () => jobs.assertAvatarJobAccess(null)), missing)
})

test('cold hydration rejects malformed, foreign, conflicting, ownerless and expired records before returning a result', async () => {
	const { jobs, remote } = await runtime({ provider: 'firestore' })
	const id = 'avatar_job_cold_corrupt'
	const base = { jobId: id, status: 'succeeded', result: video().publicVideo }
	for (const extra of [
		{}, { metadata: { resourceOwner: null } }, { metadata: { resourceOwner: {} } },
		{ metadata: { resourceOwner: ownerOf(bob) } },
		{ resourceOwner: ownerOf(alice), metadata: { resourceOwner: ownerOf(bob) } },
		{ metadata: { resourceOwner: ownerOf(alice) }, expiresAt: 'not-a-date' },
		{ metadata: { resourceOwner: ownerOf(alice) }, expiresAt: new Date(0).toISOString() },
		{ metadata: { resourceOwner: ownerOf(alice) }, jobId: 'avatar_job_wrong_record' },
	]) {
		remote.records.set(id, { ...base, ...extra })
		await assert.rejects(as(alice, () => jobs.getAvatarJobAsync(id)), missing)
	}
	const reads = remote.reads.length
	for (const id of ['', '../private', 'avatar_job_a/b', {}, 'avatar_job_' + 'a'.repeat(200)]) {
		assert.equal(await as(alice, () => jobs.getAvatarJobAsync(id)), null)
	}
	assert.equal(remote.reads.length, reads, 'Invalid handles must not reach storage')
})

test('the durable serializer rejects contradictory ownership and never adds owner data to public results', async () => {
	const { store } = await runtime()
	const job = { id: 'avatar_job_record', status: 'succeeded', resourceOwner: ownerOf(alice), metadata: { retention: 'fixture' }, result: video() }
	const saved = store.durableAvatarJobRecord(job)
	assert.deepEqual(saved.metadata.resourceOwner, ownerOf(alice))
	assert.equal(saved.metadata.retention, 'fixture')
	assert.equal(JSON.stringify(saved.result).includes('resourceOwner'), false)
	for (const resourceOwner of [null, {}, ownerOf(bob)]) {
		assert.throws(() => store.durableAvatarJobRecord({ ...job, metadata: { resourceOwner } }), { code: 'AVATAR_JOB_PERSISTENCE_FAILED' })
	}
})

test('billing setup and shared-default identities fail before provider work; local unscoped jobs still work', async () => {
	const { jobs } = await runtime()
	await assert.rejects(as(alice, () => jobs.createAvatarJob({ billing: { active: true }, task: async () => assert.fail('rendered') })), { code: 'AVATAR_JOB_INVALID', billingNoCostConfirmed: true })
	await assert.rejects(jobs.createAvatarJob({ billing: { active: true }, task: async () => assert.fail('rendered'), onSuccess: async () => {} }), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	for (const sessionId of ['anonymous', 'default', 'stdio-default']) {
		await assert.rejects(jobs.createAvatarJob({ sessionId, task: async () => assert.fail('rendered') }), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	}
	for (const executionKey of [{}, 'a'.repeat(513)]) {
		await assert.rejects(as(alice, () => jobs.createAvatarJob({ executionKey, task: async () => assert.fail('rendered') })), { code: 'AVATAR_JOB_INVALID' })
	}
	const local = await jobs.createAvatarJob({ task: async () => video() })
	const finished = await jobs.waitForAvatarJob(local.jobId, { timeoutMs: 2000, pollMs: 25 })
	assert.equal(finished.status, 'succeeded')
	assert.throws(() => as(alice, () => jobs.getAvatarJob(local.jobId)), missing)
	assert.throws(() => as(alice, () => jobs.publicAvatarJob(finished)), missing)
})

test('integrated engine handlers reuse the server reservation, settle before delivery, and guard cold status/attach', async () => {
	const remote = backend()
	const { jobs } = await runtime({ provider: 'firestore', remote })
	const settling = deferred(), finish = deferred()
	let renders = 0, settlements = 0
	const gate = { active: true, amountCredits: 10, reservation: { reservationId: 'issued-engine-reservation' } }
	const handlers = await engineHandlers(jobs, {
		renderAvatarFromToolArgs: async (args, context) => {
			renders++
			assert.equal(context.installHash, alice.installHash)
			assert.deepEqual(authorization.currentResourceOwner(), ownerOf(alice))
			return { avatarVideo: { normalizedVideoPath: 'synthetic-video', durationMs: 1200 } }
		},
		finalizeBillingReservation: async ({ gate: actual }) => { assert.equal(actual, gate); settlements++; settling.resolve(); await finish.promise },
	})
	const args = { avatar: 'synthetic-source', executionKey: 'untrusted-caller-key', idempotencyKey: 'client-fixture' }
	const first = await as(alice, () => handlers.handleAvatarRenderJob(args, { ...alice, __billingGate: gate }))
	await settling.promise
	const repeated = await as(reconnect, () => handlers.handleAvatarRenderJob({ ...args, executionKey: 'different-untrusted-key' }, { ...reconnect, __billingGate: gate }))
	assert.equal(repeated.jobId, first.jobId)
	assert.equal(repeated.video, null)
	assert.equal((await as(reconnect, () => handlers.handleAvatarJobStatus(first, reconnect))).status, 'running')
	await assert.rejects(as(bob, () => handlers.handleAvatarJobStatus(first, bob)), missing)
	finish.resolve()
	await terminal(jobs, first.jobId)
	const cold = (await runtime({ provider: 'firestore', remote })).jobs
	const assets = assetBoundary([['asset://locked/avatar-video/synthetic-video', alice]])
	const coldHandlers = await engineHandlers(cold, assets.dependencies)
	const status = await as(reconnect, () => coldHandlers.handleAvatarJobStatus(first, reconnect))
	assert.equal(status.status, 'succeeded')
	assert.equal(JSON.stringify(status).includes('resourceOwner'), false)
	await assert.rejects(as(bob, () => coldHandlers.avatarVideoFromCompletedResult(first, bob)), missing)
	assert.equal(assets.events.length, 0, 'Foreign job access must fail before grant lookup or file resolution')
	assert.equal((await as(reconnect, () => coldHandlers.avatarVideoFromCompletedResult(first, reconnect))).normalizedVideoPath, 'synthetic-authorized-path')
	assert.deepEqual(assets.events, [
		{ action: 'authorize', handles: ['asset://locked/avatar-video/synthetic-video'] },
		{ action: 'resolve', handle: 'asset://locked/avatar-video/synthetic-video' },
	])
	assert.equal(renders, 1)
	assert.equal(settlements, 1)
})

test('integrated engine uncertainty hook retains the server reservation when settlement cannot be confirmed', async () => {
	const { jobs } = await runtime()
	const uncertainty = deferred()
	let releases = 0
	const gate = { active: true, reservation: { reservationId: 'issued-engine-uncertain' }, store: {
		markReservationUncertain: async input => uncertainty.resolve({ input, owner: authorization.currentResourceOwner() }),
	} }
	const handlers = await engineHandlers(jobs, {
		finalizeBillingReservation: async () => { throw Object.assign(new Error('synthetic unknown settlement'), { code: 'FIXTURE_UNCERTAIN' }) },
		releaseBillingReservation: async () => { releases++ },
	})
	const created = await as(alice, () => handlers.handleAvatarRenderJob({ avatar: 'synthetic-source' }, { ...alice, __billingGate: gate }))
	const marked = await uncertainty.promise
	assert.deepEqual(plain(marked.input), { reservationId: gate.reservation.reservationId, reason: 'FIXTURE_UNCERTAIN' })
	assert.deepEqual(marked.owner, ownerOf(alice))
	const status = await as(reconnect, () => handlers.handleAvatarJobStatus(created, reconnect))
	assert.equal(status.status, 'failed')
	assert.equal(status.video, null)
	assert.equal(releases, 0)
})

test('integrated engine status preserves trusted legacy-session authorization through the final public projection', async () => {
	const { jobs, remote, store } = await runtime({ provider: 'firestore' })
	const handlers = await engineHandlers(jobs)
	const jobId = 'avatar_job_engine_legacy'
	remote.records.set(jobId, { jobId, status: 'succeeded', sessionHash: store.avatarSessionHash(alice.sessionId), result: video().publicVideo })
	const status = await as(alice, () => handlers.handleAvatarJobStatus({ jobId }, alice))
	assert.equal(status.status, 'succeeded')
	assert.equal(status.video.ref, video().publicVideo.ref)
	await assert.rejects(as(reconnect, () => handlers.handleAvatarJobStatus({ jobId }, reconnect)), missing)
	await assert.rejects(as(bob, () => handlers.handleAvatarJobStatus({ jobId }, bob)), missing)
})

test('integrated attachment requires independent video and poster grants even when the caller owns the warm or cold job', async () => {
	const remote = backend()
	const { jobs } = await runtime({ provider: 'firestore', remote })
	const cachedPath = 'untrusted-cached-result-path'
	const created = await as(alice, () => jobs.createAvatarJob({ task: async () => ({
		publicVideo: { ...video().publicVideo, normalizedVideoPath: cachedPath, posterPath: cachedPath },
	}) }))
	await terminal(jobs, created.jobId)
	const cold = (await runtime({ provider: 'firestore', remote })).jobs
	const { ref, posterRef } = video().publicVideo
	for (const api of [jobs, cold]) {
		for (const grants of [[], [[ref, alice]], [[ref, alice], [posterRef, bob]], [[ref, bob], [posterRef, alice]]]) {
			const assets = assetBoundary(grants)
			const handlers = await engineHandlers(api, assets.dependencies)
			await assert.rejects(as(reconnect, () => handlers.avatarVideoFromCompletedResult(created, reconnect)), {
				code: 'ASSET_NOT_FOUND', message: 'The asset handle is unavailable.',
			})
			assert.equal(assets.events.filter(event => event.action === 'resolve').length, 0)
		}
		const assets = assetBoundary([[ref, alice], [posterRef, alice]])
		const handlers = await engineHandlers(api, assets.dependencies)
		const attached = await as(reconnect, () => handlers.avatarVideoFromCompletedResult(created, reconnect))
		assert.equal(attached.normalizedVideoPath, 'synthetic-authorized-path')
		assert.equal(attached.posterPath, 'synthetic-authorized-path')
		assert.equal(attached.coverDataUri, 'synthetic-cover')
		assert.equal(JSON.stringify(attached).includes(cachedPath), false, 'Granted refs replace cached file paths')
		assert.deepEqual(assets.events.map(event => event.action), ['authorize', 'resolve', 'resolve'])
	}
})

test('integrated public attachment rejects an owned completed job containing only a cached path', async () => {
	const { jobs } = await runtime()
	const created = await as(alice, () => jobs.createAvatarJob({ task: async () => ({ normalizedVideoPath: 'untrusted-cached-result-path' }) }))
	await terminal(jobs, created.jobId)
	const assets = assetBoundary()
	const handlers = await engineHandlers(jobs, assets.dependencies)
	await assert.rejects(as(alice, () => handlers.avatarVideoFromCompletedResult(created, alice)), {
		code: 'ASSET_NOT_FOUND', message: 'The asset handle is unavailable.',
	})
	assert.equal(assets.events.filter(event => event.action === 'resolve').length, 0)
})
