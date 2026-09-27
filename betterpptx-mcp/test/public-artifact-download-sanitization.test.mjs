import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { spawnSync } from 'node:child_process'
import { createArtifactStore, isPublishedArtifactDownloadPair } from '../storage/artifact-store.mjs'
import { withResourceAuthorization } from '../auth/resource-authorization.mjs'
import { sanitizePublicResult } from '../blackbox.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'

const fileName = 'Talk-Enumerate-Mixamo Review.pptx'
const base = 'https://presentations.example.test/tenant'
const pairOf = artifact => ({ downloadUrl: artifact.downloadUrl, downloadName: artifact.downloadName })

async function temporaryRoot(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-download-boundary-test-'))
	t.after(async () => {
		assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
		assert.ok(path.basename(root).startsWith('betterpptx-download-boundary-test-'))
		await fs.rm(root, { recursive: true, force: true })
	})
	return root
}

async function localArtifact(t) {
	process.env.BETTERPPTX_ARTIFACT_STORE = 'local'
	const root = await temporaryRoot(t)
	const store = createArtifactStore({ base, root, budgetBytes: 0 })
	const artifact = await store.prepareSaveTarget({ fileName })
	assert.equal(isPublishedArtifactDownloadPair(artifact.downloadUrl, artifact.downloadName), false, 'a prepared but absent artifact is not published')
	await fs.writeFile(artifact.target, 'isolated artifact-store fixture; not a presentation')
	await store.finalizeSaveTarget(artifact)
	return { root, store, artifact }
}

function coldReplay(pair, config, extraEnv = {}) {
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
		import { createArtifactStore } from ${JSON.stringify(new URL('../storage/artifact-store.mjs', import.meta.url).href)};
		import { sanitizePublicResult } from ${JSON.stringify(new URL('../blackbox.mjs', import.meta.url).href)};
		let input = ''; for await (const chunk of process.stdin) input += chunk;
		const request = JSON.parse(input);
		const store = createArtifactStore(request.config);
		const result = sanitizePublicResult({ result: request.pair });
		process.stdout.write(JSON.stringify(result));
	`], {
		input: JSON.stringify({ pair, config }), encoding: 'utf8', timeout: 15000,
		env: { ...process.env, ...extraEnv },
	})
	assert.equal(child.status, 0, child.stderr || child.error?.message)
	return JSON.parse(child.stdout).result
}

test('issued URL and exact basename survive nested, repeated and cloned public result sanitation', async t => {
	const { artifact } = await localArtifact(t)
	const pair = pairOf(artifact)
	const raw = {
		ok: true, data: { ...pair, bytes: 51, artifact: { state: 'download_ready' },
			filePath: 'D:/private/engine.mjs', provider: 'Mixamo', sourcePath: '/srv/private/worker.mjs',
			metadata: { description: 'Mixamo Modal dependency at D:/private/engine.mjs', providerName: 'private-provider' },
		},
	}
	const safe = sanitizePublicResult(raw)
	assert.deepEqual(pairOf(safe.data), pair)
	assert.equal(safe.data.filePath, undefined)
	assert.equal(safe.data.sourcePath, undefined)
	assert.equal(safe.data.provider, undefined)
	assert.doesNotMatch(JSON.stringify(safe.data.metadata), /Mixamo|Modal|dependency|private-provider|D:\/private|engine\.mjs/)
	assert.deepEqual(sanitizePublicResult(safe), safe)
	assert.deepEqual(sanitizePublicResult(structuredClone(safe)), safe)
	assert.deepEqual(pairOf(raw.data), pair, 'the private result is not mutated')
	assert.notEqual(sanitizePublicResult({ downloadName: pair.downloadName }).downloadName, pair.downloadName, 'an unpaired filename has no delivery authority')
})

test('an existing local publication survives a fresh-process receipt replay without an allowlist', async t => {
	const { artifact, root } = await localArtifact(t)
	assert.deepEqual(coldReplay(pairOf(artifact), { base, root, budgetBytes: 0 }), pairOf(artifact))
	await fs.unlink(artifact.target)
	assert.equal(isPublishedArtifactDownloadPair(artifact.downloadUrl, artifact.downloadName), false, 'an evicted artifact no longer attests a pair')
	assert.notEqual(sanitizePublicResult(pairOf(artifact)).downloadName, artifact.downloadName)
})

test('the same exact publication rule covers non-deck preview and media artifacts', async t => {
	const { store } = await localArtifact(t)
	for (const extension of ['.png', '.json', '.wav']) {
		const artifact = await store.prepareArtifactTarget({ fileName: `Mixamo reference${extension}`, extension })
		await fs.writeFile(artifact.target, 'isolated generic artifact fixture')
		await store.finalizeSaveTarget(artifact)
		assert.deepEqual(sanitizePublicResult({ artifacts: [pairOf(artifact)] }).artifacts[0], pairOf(artifact))
	}
})

test('unissued, altered and provider URLs cannot gain privilege through shape or client flags', async t => {
	const { artifact } = await localArtifact(t)
	const pair = pairOf(artifact)
	const url = new URL(pair.downloadUrl)
	const invalidPairs = [
		{ ...pair, downloadUrl: pair.downloadUrl.replace('/files/', '/private/files/') },
		{ ...pair, downloadUrl: pair.downloadUrl.replace(url.host, 'mixamo-private.example.test') },
		{ ...pair, downloadUrl: pair.downloadUrl.replace('https://', 'https://owner:secret@') },
		{ ...pair, downloadUrl: `${pair.downloadUrl}?provider=Mixamo` },
		{ ...pair, downloadUrl: `${pair.downloadUrl}#Mixamo` },
		{ ...pair, downloadUrl: `${base}/files/${'X'.repeat(24)}/${encodeURIComponent(fileName)}` },
		{ ...pair, downloadUrl: pair.downloadUrl.replace('/files/', '/files/../files/') },
		{ ...pair, downloadUrl: pair.downloadUrl.replace('Talk-', 'Talk%2F') },
		{ ...pair, downloadUrl: pair.downloadUrl.replace('Mixamo', '%4Dixamo') },
		{ ...pair, downloadName: 'Other Mixamo Review.pptx' },
		{ ...pair, downloadName: '../Mixamo.pptx' },
		{ ...pair, downloadUrl: 'file:///D:/private/Mixamo.pptx' },
		{ ...pair, downloadUrl: 'https://provider.example.test/Mixamo/private-output.pptx' },
	]
	for (const forged of invalidPairs) {
		assert.equal(isPublishedArtifactDownloadPair(forged.downloadUrl, forged.downloadName), false)
		const safe = sanitizePublicResult({ ...forged, _issuedArtifact: true, trustedPublicArtifact: true })
		assert.notEqual(safe.downloadName, forged.downloadName, 'client flags do not register an artifact pair')
		assert.equal(safe._issuedArtifact, undefined)
	}
	assert.notEqual(sanitizePublicResult({ url: pair.downloadUrl }).url, pair.downloadUrl, 'only the structured delivery pair receives the exemption')
	assert.equal(sanitizePublicResult({ downloadUrl: 'D:/private/Mixamo.pptx', downloadName: fileName }).downloadUrl, undefined)
})

test('a live store configuration owns the exact origin, base prefix and publication root', async t => {
	const { artifact, store, root } = await localArtifact(t)
	store.configure({ base: 'https://new.example.test' })
	assert.equal(isPublishedArtifactDownloadPair(artifact.downloadUrl, artifact.downloadName), false)
	store.configure({ base, root: path.join(root, 'different-publication-root') })
	assert.equal(isPublishedArtifactDownloadPair(artifact.downloadUrl, artifact.downloadName), false)
	store.configure({ root })
	assert.equal(isPublishedArtifactDownloadPair(artifact.downloadUrl, artifact.downloadName), true)
})

test('signed artifact URLs preserve exact signature bytes only through issuance, including cold replay and expiry', async t => {
	const root = await temporaryRoot(t)
	process.env.BETTERPPTX_ARTIFACT_STORE = 'gcs'
	process.env.BETTERPPTX_GCS_BUCKET = 'test-private-artifact-bucket'
	process.env.BETTERPPTX_GCS_PREFIX = 'issued'
	process.env.BETTERPPTX_GCS_TEMP_ROOT = root
	t.after(() => {
		process.env.BETTERPPTX_ARTIFACT_STORE = 'local'
		delete process.env.BETTERPPTX_GCS_BUCKET
		delete process.env.BETTERPPTX_GCS_PREFIX
		delete process.env.BETTERPPTX_GCS_TEMP_ROOT
	})
	const mockUrl = `data:text/javascript,${encodeURIComponent(`
		import fs from 'node:fs/promises'
		export const objects = new Map()
		export class Storage {
			bucket(name) { return {
				upload: async (source, options) => {
					const data = await fs.readFile(source)
					objects.set(options.destination, { data, metadata: { ...options.metadata, generation: '1', size: String(data.length) } })
				},
				file: objectName => ({
					getSignedUrl: async () => [
						'https://signed.example.test/' + name + '/' + objectName.split('/').map(encodeURIComponent).join('/')
						+ '?X-Goog-Signature=Mixamo%2BFLUX%2fBaker&response-content-disposition=attachment%3B%20filename%3D%22Mixamo.pptx%22'
					],
					save: async (data, options) => {
						if (objects.has(objectName)) throw Object.assign(new Error('already exists'), { code: 412 })
						objects.set(objectName, { data: Buffer.from(data), metadata: { ...options.metadata, generation: '1', size: String(Buffer.byteLength(data)) } })
					},
					download: async () => {
						if (!objects.has(objectName)) throw Object.assign(new Error('missing'), { code: 404 })
						return [objects.get(objectName).data]
					},
					getMetadata: async () => [objects.get(objectName)?.metadata],
					createReadStream: async function* ({ start, end }) { yield objects.get(objectName).data.subarray(start, end + 1) },
				}),
				getFiles: async ({ prefix }) => [
					[...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({
						metadata: object.metadata,
						delete: async options => {
							if (options.ifGenerationMatch !== object.metadata.generation) throw Object.assign(new Error('generation changed'), { code: 412 })
							objects.delete(key)
						},
					})),
					{},
				],
			} }
		}
	`)}`
	const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
		return specifier === '@google-cloud/storage' ? { url: mockUrl, shortCircuit: true } : nextResolve(specifier, context)
	} })
	t.after(() => hooks.deregister())
	const { objects } = await import(mockUrl)
	const store = createArtifactStore()
	const prepared = await store.prepareSaveTarget({ fileName })
	prepared.cleanupTarget = false
	await fs.writeFile(prepared.target, 'isolated signed-artifact fixture; no cloud request')
	const asOwner = fn => withResourceAuthorization({ installHash: `install_${'a'.repeat(64)}`, sessionId: 'gcs-fixture' }, fn)
	const published = await asOwner(() => store.finalizeSaveTarget(prepared))
	const pair = pairOf(published)
	assert.equal(isPublishedArtifactDownloadPair(pair.downloadUrl, pair.downloadName), true)
	assert.deepEqual(sanitizePublicResult({ data: pair }).data, pair)
	assert.deepEqual(sanitizePublicResult(structuredClone({ data: pair })).data, pair)
	assert.deepEqual(coldReplay(pair, {}), pair, 'trusted publication record survives a fresh process without contacting the signer')
	assert.equal(isPublishedArtifactDownloadPair(`${pair.downloadUrl}&extra=Mixamo`, pair.downloadName), false)
	assert.equal(isPublishedArtifactDownloadPair(pair.downloadUrl.replace('signed.example.test', 'provider.example.test'), pair.downloadName), false)
	const recordPath = path.join(root, '.public-delivery-records', `${createHash('sha256').update(pair.downloadUrl).digest('hex')}.json`)
	const record = JSON.parse(await fs.readFile(recordPath, 'utf8'))
	assert.equal(record.downloadUrl, pair.downloadUrl)
	assert.equal(record.artifactExpiresAt, published.expiresAt, 'artifact lifetime is distinct from signed-link expiry')
	assert.equal(record.expiresAt, published.downloadLinkExpiresAt)
	assert.ok(Date.parse(record.expiresAt) > Date.now())
	await fs.unlink(recordPath)
	assert.equal(isPublishedArtifactDownloadPair(pair.downloadUrl, pair.downloadName), false, 'a cold process has no local attestation')
	const renewed = await asOwner(() => store.issueBrowserDownload(pair))
	assert.equal(isPublishedArtifactDownloadPair(pair.downloadUrl, pair.downloadName), true, 'owner-bound authority is recovered from shared storage')
	assert.equal(renewed.downloadUrl, pair.downloadUrl, 'same mocked signer may issue the same link without changing authority')
	await fs.unlink(recordPath)
	await assert.rejects(withResourceAuthorization({ installHash: `install_${'b'.repeat(64)}` },
		() => store.issueBrowserDownload(pair)), { code: 'ARTIFACT_NOT_AVAILABLE' }, 'another owner cannot redeem durable authority after restart')
	const ownerRecovered = await asOwner(() => store.issueBrowserDownload(pair))
	assert.equal(ownerRecovered.downloadUrl, pair.downloadUrl)
	await fs.unlink(recordPath)
	const recoveredBytes = await asOwner(() => store.readArtifactChunk({ ...pair, offset: 0, maxBytes: 8 }))
	assert.equal(recoveredBytes.bytes.toString('utf8'), 'isolated')
	const repeated = await asOwner(() => store.finalizeSaveTarget(prepared))
	assert.deepEqual(pairOf(repeated), pair, 'the signer returned the same exact URL')
	assert.equal(repeated.expiresAt, published.expiresAt, 'repeated issuance does not extend the first record lifetime')
	assert.deepEqual(JSON.parse(await fs.readFile(recordPath, 'utf8')), record, 'EEXIST neither fails nor overwrites an identical issued record')
	const secondPrepared = await store.prepareSaveTarget({ fileName: 'Mixamo active.pptx' })
	await fs.writeFile(secondPrepared.target, 'isolated active signed-artifact fixture')
	const secondPublished = await asOwner(() => store.finalizeSaveTarget(secondPrepared))
	const unrelatedPath = path.join(root, '.public-delivery-records', 'unrelated.json')
	await fs.writeFile(unrelatedPath, JSON.stringify({ expiresAt: new Date(0).toISOString() }))
	const otherIssuerPath = path.join(root, '.public-delivery-records', `${'f'.repeat(64)}.json`)
	await fs.writeFile(otherIssuerPath, JSON.stringify({ ...record, bucket: 'other-private-bucket', expiresAt: new Date(0).toISOString() }))
	await fs.writeFile(recordPath, JSON.stringify({ ...record, expiresAt: new Date(0).toISOString(), artifactExpiresAt: new Date(0).toISOString() }))
	const authorityName = `issued/.delivery-authority/${createHash('sha256').update(pair.downloadUrl).digest('hex')}.json`
	for (const key of [prepared.objectName, authorityName]) objects.get(key).metadata.metadata.artifactExpiresAt = new Date(0).toISOString()
	objects.set('issued/unrelated', { data: Buffer.alloc(0), metadata: {
		generation: '1', metadata: { product: 'Other', artifactKind: 'presentation', artifactExpiresAt: new Date(0).toISOString() },
	} })
	assert.equal(isPublishedArtifactDownloadPair(pair.downloadUrl, pair.downloadName), false, 'the signed-link expiry is authoritative')
	assert.notEqual(sanitizePublicResult(pair).downloadName, pair.downloadName)
	assert.equal(await store.sweepExpired(), 3, 'expired local authority and both owned GCS objects are removed')
	assert.equal(objects.has(prepared.objectName), false)
	assert.equal(objects.has(authorityName), false)
	assert.equal(objects.has('issued/unrelated'), true, 'foreign objects are not deleted')
	await assert.rejects(fs.stat(recordPath), { code: 'ENOENT' })
	assert.equal(isPublishedArtifactDownloadPair(secondPublished.downloadUrl, secondPublished.downloadName), true, 'active signed records are not evicted')
	assert.ok((await fs.stat(unrelatedPath)).isFile(), 'unrelated private files are preserved')
	assert.ok((await fs.stat(otherIssuerPath)).isFile(), 'another configured issuer owns its own record lifetime')
	assert.equal(await store.sweepExpired(), 0, 'cleanup is idempotent')
})
