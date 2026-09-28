import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { createArtifactStore, isPublishedArtifactDownloadPair } from '../storage/artifact-store.mjs'
import { resourceOwnerForContext, withResourceAuthorization } from '../auth/resource-authorization.mjs'

// The import hook replaces the entire cloud client. No credentials or network.
const mockUrl = `data:text/javascript,${encodeURIComponent(`
  export const objects = new Map()
  export const saves = []
  export const signedRequests = []
  export const controls = { fixedUrl: false, failAuthority: false, failSigning: false, beforeSave: null }
  let generation = 0
  const missing = () => Object.assign(new Error('missing mock object'), { code: 404 })
  export class Storage {
    bucket(bucketName) {
      return {
        file: (objectName, fileOptions = {}) => ({
          save: async (data, options) => {
            if (options.preconditionOpts?.ifGenerationMatch !== 0) throw new Error('create-only precondition missing')
            if (controls.failAuthority && options.metadata.metadata.artifactKind === 'delivery-authority') {
              controls.failAuthority = false
              throw Object.assign(new Error('mock authority failure'), { code: 503 })
            }
            if (controls.beforeSave) await controls.beforeSave(objectName, data, options)
            if (objects.has(objectName)) throw Object.assign(new Error('object already exists'), { code: 412 })
            const bytes = Buffer.from(data)
            const metadata = { ...structuredClone(options.metadata), generation: String(++generation), size: String(bytes.length) }
            objects.set(objectName, { data: bytes, metadata })
            saves.push({ objectName, options: structuredClone(options) })
          },
          getMetadata: async () => {
            const object = objects.get(objectName)
            if (!object || (fileOptions.generation && fileOptions.generation !== object.metadata.generation)) throw missing()
            return [structuredClone(object.metadata)]
          },
          download: async () => {
            const object = objects.get(objectName)
            if (!object) throw missing()
            return [Buffer.from(object.data)]
          },
          getSignedUrl: async options => {
            signedRequests.push({ objectName, options: structuredClone(options) })
            if (controls.failSigning) {
              controls.failSigning = false
              throw Object.assign(new Error('mock signing failure'), { code: 503 })
            }
            const base = 'https://signed.example.test/' + bucketName + '/' + objectName.split('/').map(encodeURIComponent).join('/')
            if (controls.fixedUrl) return [base + '?X-Goog-Signature=exact%2Bsignature%2fbytes']
            const start = Math.floor(Date.now() / 1000) * 1000
            const expiry = Math.floor(options.expires / 1000) * 1000
            if (expiry <= start) throw new Error('mock signer needs a future whole-second expiry')
            const date = new Date(start).toISOString().replace(/[-:]/g, '').replace('.000', '')
            return [base + '?X-Goog-Date=' + date + '&X-Goog-Expires=' + (expiry - start) / 1000
              + '&generation=' + options.queryParams.generation
              + '&response-content-type=' + encodeURIComponent(options.responseType)
              + '&X-Goog-Signature=exact%2Bsignature%2fbytes']
          },
          createReadStream: async function* ({ start, end }) {
            const object = objects.get(objectName)
            if (!object || (fileOptions.generation && fileOptions.generation !== object.metadata.generation)) throw missing()
            yield object.data.subarray(start, end + 1)
          },
        }),
      }
    }
  }
`)}`
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === '@google-cloud/storage' ? { url: mockUrl, shortCircuit: true } : nextResolve(specifier, context)
} })
after(() => hooks.deregister())
const { objects, saves, signedRequests, controls } = await import(mockUrl)

const alice = { installHash: `install_${'a'.repeat(64)}` }
const bob = { installHash: `install_${'b'.repeat(64)}` }
const as = (owner, fn) => withResourceAuthorization(owner, fn)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const ttl = 12 * 60 * 60 * 1000
const conflict = { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' }

async function fixture(t) {
  objects.clear()
  saves.length = 0
  signedRequests.length = 0
  Object.assign(controls, { fixedUrl: false, failAuthority: false, failSigning: false, beforeSave: null })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-gcs-lifetime-'))
  const env = {
    BETTERPPTX_ARTIFACT_STORE: 'gcs', BETTERPPTX_GCS_BUCKET: 'fake-lifetime-bucket',
    BETTERPPTX_GCS_PREFIX: 'artifacts', BETTERPPTX_GCS_TEMP_ROOT: root,
    BETTERPPTX_ARTIFACT_TTL_MS: String(ttl),
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('betterpptx-gcs-lifetime-'))
    await fs.rm(root, { recursive: true, force: true })
  })
  const store = createArtifactStore()
  const prepare = async (generic = false) => {
    const artifact = await as(alice, () => generic
      ? store.prepareArtifactTarget({ fileName: 'preview.png', extension: '.png', contentType: 'image/png' })
      : store.prepareSaveTarget({ fileName: 'deck.pptx' }))
    artifact.cleanupTarget = false
    await fs.writeFile(artifact.target, 'immutable synthetic artifact bytes')
    return artifact
  }
  const finalize = artifact => as(alice, () => store.finalizeSaveTarget(artifact))
  const recordPath = url => path.join(root, '.public-delivery-records', `${sha256(url)}.json`)
  const authorityName = url => `artifacts/.delivery-authority/${sha256(url)}.json`
  return { root, store, prepare, finalize, recordPath, authorityName }
}

test('GCS preparation binds the owner and rejects altered targets before any cloud write', async t => {
  const { store, prepare, finalize } = await fixture(t)
  await assert.rejects(store.prepareSaveTarget({ fileName: 'unowned.pptx' }), { code: 'RESOURCE_IDENTITY_REQUIRED' })
  const artifact = await prepare()
  await assert.rejects(as(bob, () => store.finalizeSaveTarget(artifact)), conflict)
  for (const [key, value] of [
    ['expiresAt', new Date(Date.parse(artifact.expiresAt) + ttl).toISOString()],
    ['objectName', 'artifacts/foreign/deck.pptx'], ['target', artifact.target + '.foreign'],
    ['downloadName', 'other.pptx'], ['contentType', 'text/plain'],
  ]) {
    const original = artifact[key]
    artifact[key] = value
    await assert.rejects(finalize(artifact), conflict, key)
    artifact[key] = original
  }
  await assert.rejects(finalize({ ...artifact }), conflict, 'an unissued clone cannot claim a target')
  assert.equal(saves.length, 0)
  assert.equal(signedRequests.length, 0)
  await finalize(artifact)
  const tags = objects.get(artifact.objectName).metadata.metadata
  assert.deepEqual(JSON.parse(tags.artifactOwner), resourceOwnerForContext(alice))
  assert.equal(tags.artifactExpiresAt, artifact.expiresAt)
  assert.equal(tags.artifactSha256, sha256('immutable synthetic artifact bytes'))
})

test('expired preparation and finalization retries fail before upload or signing', async t => {
  const { prepare, finalize } = await fixture(t)
  const artifact = await prepare()
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(artifact.expiresAt) })
  await assert.rejects(finalize(artifact), conflict)
  assert.equal(saves.length, 0)
  assert.equal(signedRequests.length, 0)
  t.mock.timers.reset()
  await finalize(artifact)
  const writeCount = saves.length
  const signCount = signedRequests.length
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(artifact.expiresAt) + 1 })
  await assert.rejects(finalize(artifact), conflict)
  assert.equal(saves.length, writeCount)
  assert.equal(signedRequests.length, signCount)
})

test('retry after authority failure reuses original bytes, hash, generation and expiry', async t => {
  const { prepare, finalize } = await fixture(t)
  const artifact = await prepare()
  controls.failAuthority = true
  await assert.rejects(finalize(artifact), { code: 503 })
  const object = objects.get(artifact.objectName)
  const original = { data: Buffer.from(object.data), metadata: structuredClone(object.metadata) }
  const result = await finalize(artifact)
  await finalize(artifact)
  assert.deepEqual(objects.get(artifact.objectName), original)
  assert.equal(saves.filter(entry => entry.objectName === artifact.objectName).length, 1)
  assert.equal(result.expiresAt, artifact.expiresAt)
  await fs.writeFile(artifact.target, 'replacement bytes must not publish')
  await assert.rejects(finalize(artifact), conflict)
  assert.deepEqual(objects.get(artifact.objectName), original)
})

test('successful finalization can be retried after temporary cleanup without resurrection', async t => {
  const { prepare, finalize } = await fixture(t)
  const artifact = await prepare()
  artifact.cleanupTarget = true
  const published = await finalize(artifact)
  await assert.rejects(fs.stat(artifact.target), { code: 'ENOENT' })
  await finalize(published)
  assert.equal(saves.filter(entry => entry.objectName === artifact.objectName).length, 1)
  objects.delete(artifact.objectName)
  await assert.rejects(finalize(published), conflict)
  assert.equal(objects.has(artifact.objectName), false)
})

test('precondition collision cannot replace an existing object or rebind its owner', async t => {
  const { prepare, finalize } = await fixture(t)
  const artifact = await prepare()
  let foreign
  controls.beforeSave = async (objectName, data, options) => {
    if (objectName !== artifact.objectName) return
    foreign = { data: Buffer.from('foreign bytes'), metadata: {
      ...structuredClone(options.metadata), generation: '999', size: String(data.length),
    } }
    foreign.metadata.metadata.artifactOwner = JSON.stringify(resourceOwnerForContext(bob))
    objects.set(objectName, foreign)
  }
  await assert.rejects(finalize(artifact), conflict)
  assert.deepEqual(objects.get(artifact.objectName), foreign)
  assert.equal(saves.length, 0)
  assert.equal(signedRequests.length, 0)
})

test('uploaded hash describes the captured bytes even if the source changes during save', async t => {
  const { prepare, finalize } = await fixture(t)
  const artifact = await prepare()
  controls.beforeSave = async objectName => {
    if (objectName === artifact.objectName) await fs.writeFile(artifact.target, 'changed after the snapshot')
  }
  await finalize(artifact)
  const object = objects.get(artifact.objectName)
  assert.equal(object.data.toString(), 'immutable synthetic artifact bytes')
  assert.equal(object.metadata.metadata.artifactSha256, sha256(object.data))
})

test('V4 second precision is reported honestly and late MIME renewal keeps file expiry', async t => {
  const { store, prepare, finalize, recordPath } = await fixture(t)
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2031, 0, 2, 12, 0, 0, 375) })
  const artifact = await prepare(true)
  const published = await finalize(artifact)
  const fileExpiry = Date.parse(published.expiresAt)
  const linkExpiry = Date.parse(published.downloadLinkExpiresAt)
  assert.equal(fileExpiry - linkExpiry, 375)
  assert.equal(signedRequests.at(-1).options.responseType, 'image/png')
  assert.equal(signedRequests.at(-1).options.queryParams.generation, objects.get(artifact.objectName).metadata.generation)
  const record = JSON.parse(await fs.readFile(recordPath(published.downloadUrl), 'utf8'))
  assert.equal(record.expiresAt, published.downloadLinkExpiresAt)
  assert.equal(record.contentType, 'image/png')
  t.mock.timers.tick(ttl - 60000)
  process.env.BETTERPPTX_ARTIFACT_TTL_MS = String(ttl * 3)
  const renewed = await as(alice, () => store.issueBrowserDownload(published))
  assert.equal(renewed.downloadLinkExpiresAt, published.downloadLinkExpiresAt)
  assert.equal(signedRequests.at(-1).options.expires, fileExpiry)
  assert.equal(signedRequests.at(-1).options.responseType, 'image/png')
  t.mock.timers.tick(60000 - 376)
  assert.equal(isPublishedArtifactDownloadPair(published.downloadUrl, published.downloadName), true)
  t.mock.timers.tick(1)
  assert.equal(isPublishedArtifactDownloadPair(published.downloadUrl, published.downloadName), false)
  t.mock.timers.tick(375)
  const signCount = signedRequests.length
  await assert.rejects(as(alice, () => store.issueBrowserDownload(published)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  await assert.rejects(as(alice, () => store.readArtifactChunk(published)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  assert.equal(signedRequests.length, signCount)
})

test('signed authority rejects malformed bounds, missing owners and changed signature bytes', async t => {
  const { prepare, finalize, recordPath } = await fixture(t)
  const published = await finalize(await prepare())
  const location = recordPath(published.downloadUrl)
  const original = JSON.parse(await fs.readFile(location, 'utf8'))
  for (const patch of [
    { expiresAt: 'invalid' }, { artifactExpiresAt: 'invalid' }, { resourceOwner: null },
    { artifactExpiresAt: new Date(Date.parse(original.expiresAt) - 1).toISOString() },
    { expiresAt: new Date(Date.parse(original.expiresAt) + 1).toISOString() },
    { contentSha256: 'invalid' }, { objectGeneration: 'invalid' },
  ]) {
    await fs.writeFile(location, JSON.stringify({ ...original, ...patch }))
    assert.equal(isPublishedArtifactDownloadPair(published.downloadUrl, published.downloadName), false)
  }
  await fs.writeFile(location, JSON.stringify(original))
  assert.equal(isPublishedArtifactDownloadPair(published.downloadUrl, published.downloadName), true)
  assert.equal(isPublishedArtifactDownloadPair(published.downloadUrl + '&extra=1', published.downloadName), false)
  assert.equal(isPublishedArtifactDownloadPair(published.downloadUrl.replace('%2f', '%2F'), published.downloadName), false)
})

test('local EEXIST and shared 412 records must agree on immutable owner/object identity', async t => {
  const { prepare, finalize, recordPath, authorityName } = await fixture(t)
  controls.fixedUrl = true
  const artifact = await prepare()
  const published = await finalize(artifact)
  const location = recordPath(published.downloadUrl)
  const original = JSON.parse(await fs.readFile(location, 'utf8'))
  for (const patch of [
    { resourceOwner: resourceOwnerForContext(bob) }, { objectName: 'artifacts/foreign/deck.pptx' },
    { artifactExpiresAt: new Date(Date.parse(original.artifactExpiresAt) + ttl).toISOString() },
    { contentSha256: 'f'.repeat(64) }, { objectGeneration: '999' }, { contentType: 'text/plain' },
  ]) {
    await fs.writeFile(location, JSON.stringify({ ...original, ...patch }))
    await assert.rejects(finalize(artifact), conflict)
  }
  await fs.writeFile(location, JSON.stringify(original))
  const authority = objects.get(authorityName(published.downloadUrl))
  authority.data = Buffer.from(JSON.stringify({ ...original, resourceOwner: resourceOwnerForContext(bob) }))
  await assert.rejects(finalize(artifact), conflict)
  authority.data = Buffer.from(JSON.stringify(original))
  await finalize(artifact)
  assert.equal(saves.filter(entry => entry.objectName === artifact.objectName).length, 1)
})

test('cold cache renewal and chunk verification remain owner- and generation-bound', async t => {
  const { root, store, prepare, finalize } = await fixture(t)
  const published = await finalize(await prepare(true))
  await fs.rm(path.join(root, '.public-delivery-records'), { recursive: true })
  const coldRoot = path.join(root, 'cold-instance')
  process.env.BETTERPPTX_GCS_TEMP_ROOT = coldRoot
  const coldStore = createArtifactStore()
  await assert.rejects(as(bob, () => coldStore.issueBrowserDownload(published)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  const renewed = await as(alice, () => coldStore.issueBrowserDownload(published))
  assert.equal(new URL(renewed.downloadUrl).searchParams.get('response-content-type'), 'image/png')
  const chunk = await as(alice, () => coldStore.readArtifactChunk({ ...published, maxBytes: 9 }))
  assert.equal(chunk.bytes.toString(), 'immutable')
  objects.get(published.objectName).metadata.generation = '999'
  const signCount = signedRequests.length
  await assert.rejects(as(alice, () => store.issueBrowserDownload(published)), conflict)
  await assert.rejects(as(alice, () => coldStore.readArtifactChunk(published)), { code: 404 })
  assert.equal(signedRequests.length, signCount)
})

test('.53 owner-bound authority renews without requiring new owner/hash/MIME tags', async t => {
  const { store, prepare, finalize, recordPath, authorityName } = await fixture(t)
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2031, 0, 2, 12, 0, 0, 375) })
  const published = await finalize(await prepare(true))
  const newRecord = JSON.parse(await fs.readFile(recordPath(published.downloadUrl), 'utf8'))
  // Replace the simulated publication's authority, not its retained bytes.
  // Keeping the .54 authority would contradict the .53 object tags below,
  // especially when renewal returns the identical URL in the same second.
  objects.delete(authorityName(published.downloadUrl))
  await fs.unlink(recordPath(published.downloadUrl))
  const legacyUrl = published.downloadUrl.replace(/&generation=[0-9]+/, '')
  const legacy = { ...newRecord, downloadUrl: legacyUrl }
  delete legacy.contentType
  delete legacy.contentSha256
  delete legacy.objectGeneration
  const object = objects.get(published.objectName)
  delete object.metadata.metadata.artifactOwner
  delete object.metadata.metadata.artifactSha256
  objects.set(authorityName(legacyUrl), {
    data: Buffer.from(JSON.stringify(legacy)), metadata: { generation: '999', size: '1' },
  })
  // No local record: production recovery must use the unchanged .53 authority.
  const request = { downloadUrl: legacyUrl, downloadName: published.downloadName }
  await assert.rejects(as(bob, () => store.issueBrowserDownload(request)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  const renewed = await as(alice, () => store.issueBrowserDownload(request))
  assert.notEqual(renewed.downloadUrl, legacyUrl)
  assert.equal(renewed.downloadUrl, published.downloadUrl, 'frozen signer second reproduces the original URL')
  assert.equal(renewed.downloadLinkExpiresAt, published.downloadLinkExpiresAt)
  assert.equal(signedRequests.at(-1).options.responseType, 'image/png')
  const recovered = JSON.parse(await fs.readFile(recordPath(renewed.downloadUrl), 'utf8'))
  assert.equal(recovered.artifactExpiresAt, legacy.artifactExpiresAt)
  assert.deepEqual(recovered.resourceOwner, legacy.resourceOwner)
  assert.equal(recovered.objectGeneration, object.metadata.generation)
  const writeCount = saves.length
  const repeated = await as(alice, () => store.issueBrowserDownload(request))
  assert.deepEqual(repeated, renewed, 'repeated legacy recovery in the same signer second is idempotent')
  assert.equal(saves.length, writeCount, 'the matching authority is reused without an overwrite')
  assert.deepEqual(JSON.parse(await fs.readFile(recordPath(renewed.downloadUrl), 'utf8')), recovered)
  assert.deepEqual(JSON.parse(objects.get(authorityName(legacyUrl)).data.toString('utf8')), legacy)
  await assert.rejects(as(bob, () => store.issueBrowserDownload(renewed)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  const chunk = await as(alice, () => store.readArtifactChunk({ ...request, maxBytes: 9 }))
  assert.equal(chunk.bytes.toString(), 'immutable')
})
