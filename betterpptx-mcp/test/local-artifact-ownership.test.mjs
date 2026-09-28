import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { artifactTtlMs, createArtifactStore, isPermittedBrowserGrantQuery, sweepLocalArtifactRoot, verifyLocalArtifactBrowserGrant, verifyLocalArtifactOwner } from '../storage/artifact-store.mjs'
import { resourceOwnerForContext, withResourceAuthorization } from '../auth/resource-authorization.mjs'

// Synthetic server contexts only. No engine, HTTP server, credentials or cloud.
const alice = { installHash: `install_${'a'.repeat(64)}`, sessionId: 'issued-a' }
const bob = { installHash: `install_${'b'.repeat(64)}`, sessionId: 'issued-b' }
const as = (context, fn) => withResourceAuthorization(context, fn)
const sidecarOf = artifact => path.join(path.dirname(artifact.target), '.owner.json')
const requestFor = (root, artifact, context = alice) => ({
	root, token: artifact.objectName.split('/')[0], name: artifact.downloadName, context,
})

async function fixture(t) {
	const previous = { BETTERPPTX_ARTIFACT_STORE: process.env.BETTERPPTX_ARTIFACT_STORE, BETTERPPTX_REQUIRE_SHARED_STORES: process.env.BETTERPPTX_REQUIRE_SHARED_STORES }
	process.env.BETTERPPTX_ARTIFACT_STORE = 'local'
	process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-owner-test-'))
	t.after(async () => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
		assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
		assert.ok(path.basename(root).startsWith('betterpptx-owner-test-'))
		await fs.rm(root, { recursive: true, force: true })
	})
	const store = createArtifactStore({ root, base: 'https://audit.invalid', budgetBytes: 0 })
	return { root, store }
}

async function publish(store, context = alice, generic = false) {
	return as(context, async () => {
		const artifact = generic
			? await store.prepareArtifactTarget({ fileName: 'preview.png', extension: '.png' })
			: await store.prepareSaveTarget({ fileName: 'deck.pptx' })
		await fs.writeFile(artifact.target, 'offline synthetic artifact')
		return store.finalizeSaveTarget(artifact)
	})
}

test('new publications and browser links default to the same 12-hour expiry', async t => {
	const prior = process.env.BETTERPPTX_ARTIFACT_TTL_MS
	delete process.env.BETTERPPTX_ARTIFACT_TTL_MS
	try {
		assert.equal(artifactTtlMs(), 12 * 60 * 60 * 1000)
		const { store } = await fixture(t)
		const artifact = await publish(store)
		const remaining = Date.parse(artifact.expiresAt) - Date.now()
		assert.ok(remaining > 12 * 60 * 60 * 1000 - 5000)
		assert.ok(remaining <= 12 * 60 * 60 * 1000)
		assert.equal(artifact.downloadLinkExpiresAt, artifact.expiresAt)
	} finally {
		if (prior === undefined) delete process.env.BETTERPPTX_ARTIFACT_TTL_MS
		else process.env.BETTERPPTX_ARTIFACT_TTL_MS = prior
	}
})

test('storage capacity rejects a new publication without evicting a retained deck', async t => {
	const { root } = await fixture(t)
	const store = createArtifactStore({ root, base: 'https://audit.invalid', budgetBytes: 128 })
	const first = await publish(store)
	await assert.rejects(as(alice, () => store.prepareSaveTarget({ fileName: 'next.pptx' })),
		{ code: 'ARTIFACT_STORAGE_CAPACITY' })
	assert.equal(verifyLocalArtifactOwner(requestFor(root, first)), true)
	assert.equal(await fs.readFile(first.target, 'utf8'), 'offline synthetic artifact')
})

test('ChatGPT link decoration cannot alter the signed download authority', () => {
	const permit = `${Date.now() + 1000}.${'a'.repeat(43)}`
	assert.equal(isPermittedBrowserGrantQuery({ permit }), true)
	assert.equal(isPermittedBrowserGrantQuery({ permit, utm_source: 'chatgpt.com' }), true)
	assert.equal(isPermittedBrowserGrantQuery({ permit, utm_source: 'other.site' }), false)
	assert.equal(isPermittedBrowserGrantQuery({ permit, download: 'other-file' }), false)
	assert.equal(isPermittedBrowserGrantQuery({ permit: [permit] }), false)
})

test('scoped decks and generic artifacts persist private ownership and reject foreign or raw-header contexts', async t => {
	const { root, store } = await fixture(t)
	for (const generic of [false, true]) {
		const artifact = await publish(store, alice, generic)
		const record = JSON.parse(await fs.readFile(sidecarOf(artifact), 'utf8'))
		assert.deepEqual(record.resourceOwner, resourceOwnerForContext(alice))
		assert.equal(record.name, artifact.downloadName)
		assert.equal(record.expiresAt, artifact.expiresAt)
		assert.equal(JSON.stringify(artifact).includes('resourceOwner'), false)
		assert.equal(JSON.stringify(record).includes(alice.installHash), false)
		assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), true)
		assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact, { ...alice, sessionId: 'reconnected' })), true)
		for (const context of [bob, {}, { headers: { 'x-betterpptx-device': 'forged', 'x-openai-subject': 'forged' } }, { resourceOwner: record.resourceOwner }]) {
			assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact, context)), false)
		}
		assert.equal(store.resolveLocalDownload({ token: record.token, name: '.owner.json' }), null)
		assert.equal(verifyLocalArtifactOwner({ ...requestFor(root, artifact), name: '.owner.json' }), false)
	}
})

test('verification survives a fresh process without a cache or a store instance', async t => {
	const { root, store } = await fixture(t)
	const artifact = await publish(store)
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
		import { verifyLocalArtifactOwner } from ${JSON.stringify(new URL('../storage/artifact-store.mjs', import.meta.url).href)};
		let input = ''; for await (const chunk of process.stdin) input += chunk;
		process.stdout.write(JSON.stringify(verifyLocalArtifactOwner(JSON.parse(input))));
	`], { input: JSON.stringify(requestFor(root, artifact)), encoding: 'utf8', timeout: 15000 })
	assert.equal(child.status, 0, child.stderr || child.error?.message)
	assert.equal(JSON.parse(child.stdout), true)
})

test('browser delivery grants are bounded, scoped to one owned artifact, and owner-refreshable', async t => {
	const { root, store } = await fixture(t)
	const artifact = await publish(store)
	const url = new URL(artifact.downloadUrl)
	const token = artifact.objectName.split('/')[0]
	const permit = url.searchParams.get('permit')
	assert.ok(permit)
	assert.equal(verifyLocalArtifactBrowserGrant({ root, token, name: artifact.downloadName, permit }), true)
	assert.equal(verifyLocalArtifactBrowserGrant({ root, token, name: 'other.pptx', permit }), false)
	assert.equal(verifyLocalArtifactBrowserGrant({ root, token, name: artifact.downloadName,
		permit: `${permit.slice(0, -1)}${permit.endsWith('A') ? 'B' : 'A'}` }), false)
	await assert.rejects(as(bob, () => store.issueBrowserDownload(artifact)), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
	const refreshed = await as(alice, () => store.issueBrowserDownload(artifact))
	assert.equal(verifyLocalArtifactBrowserGrant({ root, token, name: artifact.downloadName,
		permit: new URL(refreshed.downloadUrl).searchParams.get('permit') }), true)
	assert.ok(Date.parse(refreshed.downloadLinkExpiresAt) <= Date.now() + 12 * 60 * 60 * 1000)
	assert.ok(Date.parse(refreshed.downloadLinkExpiresAt) <= Date.parse(artifact.expiresAt))
})

test('12-hour browser access and late renewal stop at the immutable file expiry', async t => {
	const prior = process.env.BETTERPPTX_ARTIFACT_TTL_MS
	delete process.env.BETTERPPTX_ARTIFACT_TTL_MS
	t.after(() => {
		if (prior === undefined) delete process.env.BETTERPPTX_ARTIFACT_TTL_MS
		else process.env.BETTERPPTX_ARTIFACT_TTL_MS = prior
	})
	const { root, store } = await fixture(t)
	const artifact = await publish(store)
	const grant = { root, token: artifact.objectName.split('/')[0], name: artifact.downloadName,
		permit: new URL(artifact.downloadUrl).searchParams.get('permit') }
	t.mock.timers.enable({ apis: ['Date'], now: Date.parse(artifact.expiresAt) - 60 * 1000 })
	assert.equal(verifyLocalArtifactBrowserGrant(grant), true, 'original link remains valid after almost 12 hours')
	process.env.BETTERPPTX_ARTIFACT_TTL_MS = String(30 * 24 * 60 * 60 * 1000)
	const renewed = await as(alice, () => store.issueBrowserDownload(artifact))
	assert.equal(renewed.downloadLinkExpiresAt, artifact.expiresAt, 'configuration changes and late renewal do not extend a file')
	t.mock.timers.tick(59999)
	assert.equal(verifyLocalArtifactBrowserGrant(grant), true)
	t.mock.timers.tick(1)
	assert.equal(verifyLocalArtifactBrowserGrant(grant), false)
	assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), false)
	await assert.rejects(as(alice, () => store.issueBrowserDownload(artifact)), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
	assert.ok((await fs.stat(artifact.target)).isFile(), 'access expires before asynchronous physical cleanup')
})

test('configured shorter retention caps browser links without changing already issued expiry', async t => {
	const prior = process.env.BETTERPPTX_ARTIFACT_TTL_MS
	process.env.BETTERPPTX_ARTIFACT_TTL_MS = String(60 * 60 * 1000)
	t.after(() => {
		if (prior === undefined) delete process.env.BETTERPPTX_ARTIFACT_TTL_MS
		else process.env.BETTERPPTX_ARTIFACT_TTL_MS = prior
	})
	const { store } = await fixture(t)
	const artifact = await publish(store)
	assert.equal(artifact.downloadLinkExpiresAt, artifact.expiresAt)
	assert.ok(Date.parse(artifact.expiresAt) <= Date.now() + 60 * 60 * 1000)
	delete process.env.BETTERPPTX_ARTIFACT_TTL_MS
	const renewed = await as(alice, () => store.issueBrowserDownload(artifact))
	assert.equal(renewed.downloadLinkExpiresAt, artifact.expiresAt)
})

test('store and HTTP cleanup use recorded expiry, not file age or later retention settings', async t => {
	const { root, store } = await fixture(t)
	const expired = await publish(store)
	t.mock.timers.enable({ apis: ['Date'], now: Date.parse(expired.expiresAt) - 1000 })
	const live = await publish(store)
	const old = new Date(0)
	await fs.utimes(path.dirname(live.target), old, old)
	assert.equal(await store.sweepExpired({ ttlMs: 1 }), 0, 'shorter configuration does not delete a live issued artifact')
	t.mock.timers.tick(1000)
	await fs.utimes(path.dirname(expired.target), new Date(Date.now()), new Date(Date.now()))
	assert.equal(await sweepLocalArtifactRoot(root, { ttlMs: 30 * 24 * 60 * 60 * 1000 }), 1,
		'touching the directory or increasing retention does not extend an expired artifact')
	await assert.rejects(fs.stat(expired.target), { code: 'ENOENT' })
	assert.ok((await fs.stat(live.target)).isFile())
	assert.equal(await store.sweepExpired({ ttlMs: 1 }), 0)
	assert.equal(await sweepLocalArtifactRoot(path.parse(root).root), 0, 'a broad filesystem root is never a cleanup target')
})

test('saved bytes are readable in bounded chunks by the owner without a browser URL fetch', async t => {
	const { store } = await fixture(t)
	const artifact = await publish(store)
	const first = await as(alice, () => store.readArtifactChunk({
		downloadUrl: artifact.downloadUrl, downloadName: artifact.downloadName, offset: 0, maxBytes: 7,
	}))
	const second = await as(alice, () => store.readArtifactChunk({
		downloadUrl: artifact.downloadUrl, downloadName: artifact.downloadName, offset: 7, maxBytes: 32768,
	}))
	assert.equal(Buffer.concat([first.bytes, second.bytes]).toString(), 'offline synthetic artifact')
	assert.equal(first.totalBytes, second.totalBytes)
	await assert.rejects(as(bob, () => store.readArtifactChunk(artifact)), { code: 'ARTIFACT_NOT_AVAILABLE' })
	await assert.rejects(as(alice, () => store.readArtifactChunk({
		downloadUrl: artifact.downloadUrl, downloadName: 'other.pptx',
	})), { code: 'ARTIFACT_NOT_AVAILABLE' })
})

test('prepare captures ownership and finalize neither rebinds nor extends the private record', async t => {
	const { root, store } = await fixture(t)
	const artifact = await as(alice, () => store.prepareSaveTarget({ fileName: 'deck.pptx', resourceOwner: resourceOwnerForContext(bob) }))
	const initial = await fs.readFile(sidecarOf(artifact), 'utf8')
	assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), false, 'missing payload denies')
	await fs.writeFile(artifact.target, 'offline artifact')
	await assert.rejects(as(bob, () => store.finalizeSaveTarget(artifact)), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
	artifact.expiresAt = new Date(Date.now() + 999999999).toISOString()
	const finalized = await store.finalizeSaveTarget(artifact)
	assert.equal(finalized.expiresAt, JSON.parse(initial).expiresAt, 'captured scope survives deferred finalization')
	await as(alice, () => store.finalizeSaveTarget(finalized))
	assert.equal(await fs.readFile(sidecarOf(artifact), 'utf8'), initial)
	await fs.unlink(sidecarOf(artifact))
	await assert.rejects(as(alice, () => store.finalizeSaveTarget(artifact)), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
	await assert.rejects(fs.stat(sidecarOf(artifact)), { code: 'ENOENT' })
})

test('expiry is enforced at request time even when the artifact has not been swept', async t => {
	const { root, store } = await fixture(t)
	const artifact = await publish(store)
	t.mock.timers.enable({ apis: ['Date'], now: Date.parse(artifact.expiresAt) - 1 })
	assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), true)
	t.mock.timers.tick(1)
	assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), false)
	assert.ok((await fs.stat(artifact.target)).isFile())
	await assert.rejects(as(alice, () => store.finalizeSaveTarget(artifact)), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
})

test('unscoped local publication remains usable privately but cannot be claimed or pass the ownership gate', async t => {
	const { root, store } = await fixture(t)
	const artifact = await store.prepareSaveTarget({ fileName: 'legacy.pptx' })
	await fs.writeFile(artifact.target, 'unscoped fixture')
	assert.equal(await store.finalizeSaveTarget(artifact), artifact)
	assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), false)
	await assert.rejects(as(alice, () => store.finalizeSaveTarget(artifact)), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
	await assert.rejects(fs.stat(sidecarOf(artifact)), { code: 'ENOENT' })
	const privateStore = createArtifactStore()
	const privateArtifact = await as(alice, () => privateStore.prepareSaveTarget({ outputDir: root, fileName: 'private.pptx' }))
	await fs.writeFile(privateArtifact.target, 'private fixture')
	assert.equal(await as(alice, () => privateStore.finalizeSaveTarget(privateArtifact)), privateArtifact)
	assert.equal(privateArtifact.remote, false)
})

test('malformed, conflicting, expired and transplanted records fail closed without overwrites', async t => {
	const { root, store } = await fixture(t)
	const artifact = await publish(store)
	const original = JSON.parse(await fs.readFile(sidecarOf(artifact), 'utf8'))
	for (const record of [null, {}, { ...original, resourceOwner: null },
		{ ...original, metadata: { resourceOwner: resourceOwnerForContext(bob) } },
		{ ...original, schemaVersion: 'unknown' }, { ...original, token: 'B'.repeat(24) },
		{ ...original, name: 'other.pptx' }, { ...original, expiresAt: 'invalid' },
		{ ...original, expiresAt: new Date(0).toISOString() }]) {
		await fs.writeFile(sidecarOf(artifact), JSON.stringify(record))
		assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), false)
		await assert.rejects(as(alice, () => store.finalizeSaveTarget(artifact)), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
		assert.deepEqual(JSON.parse(await fs.readFile(sidecarOf(artifact), 'utf8')), record)
	}
	for (const bytes of ['{', 'x'.repeat(16385)]) {
		await fs.writeFile(sidecarOf(artifact), bytes)
		assert.equal(verifyLocalArtifactOwner(requestFor(root, artifact)), false)
	}
	await fs.writeFile(sidecarOf(artifact), JSON.stringify(original))
	const other = await publish(store)
	await fs.copyFile(sidecarOf(artifact), sidecarOf(other))
	assert.equal(verifyLocalArtifactOwner(requestFor(root, other)), false)
})

test('names and tokens cannot escape the root, alias private metadata or authorize sibling files', async t => {
	const { root, store } = await fixture(t)
	const artifact = await publish(store)
	const valid = requestFor(root, artifact)
	for (const name of ['../deck.pptx', '..\\deck.pptx', '.OWNER.JSON', '.owner.json ', '.owner.json.', 'deck.pptx:stream', 'deck.pptx.', 'deck.pptx ', '%2eowner.json', '/deck.pptx', 'sibling.pptx']) {
		assert.equal(verifyLocalArtifactOwner({ ...valid, name }), false)
	}
	for (const token of ['../', '..\\', 'A'.repeat(23), `${valid.token}/..`, `${valid.token}:stream`, null]) {
		assert.equal(verifyLocalArtifactOwner({ ...valid, token }), false)
	}
	await fs.writeFile(path.join(path.dirname(artifact.target), 'sibling.pptx'), 'unbound sibling')
	assert.equal(verifyLocalArtifactOwner({ ...valid, name: 'sibling.pptx' }), false)
	await assert.rejects(as(alice, () => store.prepareArtifactTarget({ fileName: '.owner.json', extension: '.json' })), { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' })
})

for (const target of ['root', 'ancestor', 'token', 'artifact', 'sidecar']) {
	test(`rejects ${target} symlinks or junctions`, async t => {
		const { root, store } = await fixture(t)
		const artifact = await publish(store)
		const request = requestFor(root, artifact)
		const directories = ['root', 'ancestor', 'token'].includes(target)
		const linkType = directories ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file'
		try {
			if (target === 'root' || target === 'ancestor') {
				const link = path.join(root, 'root-alias')
				await fs.symlink(root, link, linkType)
				request.root = target === 'root' ? link : path.join(link, 'nested')
				if (target === 'ancestor') {
					await fs.mkdir(path.join(root, 'nested'))
					await fs.rename(path.dirname(artifact.target), path.join(root, 'nested', request.token))
				}
			} else {
				const original = target === 'token' ? path.dirname(artifact.target) : target === 'artifact' ? artifact.target : sidecarOf(artifact)
				const moved = `${original}-real`
				await fs.rename(original, moved)
				await fs.symlink(moved, original, linkType)
			}
		} catch (error) {
			if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Host does not permit creating this symlink fixture.'); return }
			throw error
		}
		assert.equal(verifyLocalArtifactOwner(request), false)
	})
}
