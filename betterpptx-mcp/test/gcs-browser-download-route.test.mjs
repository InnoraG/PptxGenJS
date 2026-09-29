import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import express from 'express'
import { createArtifactStore, isPublishedArtifactDownloadPair } from '../storage/artifact-store.mjs'
import { resourceOwnerForContext, withResourceAuthorization } from '../auth/resource-authorization.mjs'
import { sanitizePublicResult } from '../blackbox.mjs'
import worker from '../deploy/cloudflare-edge/src/index.mjs'

// Only synthetic settings may enter the HTTP bootstrap. In particular its
// provider-account probe must never read an owner-managed credential store.
for (const name of Object.keys(process.env)) {
  if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_|AWS_|AZURE_|OPENAI_|ANTHROPIC_|MODAL_|MESHY_|HF_|PAYRAM_|POLAR_|DODO_|K_SERVICE$|K_REVISION$)/i.test(name)
    || /(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(name)) delete process.env[name]
}
const suiteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-cloud-route-suite-'))
Object.assign(process.env, {
  NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test',
  BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_BILLING_PROVIDER: 'none',
  BETTERPPTX_BILLING_MODEL: 'free_publication', BETTERPPTX_MONETIZED_MCP_ENABLED: '0',
  BETTERPPTX_X402_STORE: 'local', BETTERPPTX_BILLING_LEDGER_STORE: 'local',
  BETTERPPTX_X402_FILE: path.join(suiteRoot, 'quotes.json'),
  BETTERPPTX_BILLING_LEDGER_FILE: path.join(suiteRoot, 'ledger.json'),
  BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local', BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(suiteRoot, 'leases'),
  BETTERPPTX_CREDENTIAL_STORE: path.join(suiteRoot, 'absent-credentials.json'),
  BETTERPPTX_LOG: '0', BETTERPPTX_TRACE: '0', BETTERPPTX_METROLOGY: '0',
  BETTERPPTX_COST_OBSERVATIONS: '0', BETTERPPTX_INSTALL_USAGE_STORE: 'local',
  BETTERPPTX_OAUTH_ISSUER: 'https://identity.example.test', BETTERPPTX_OAUTH_AUDIENCE: 'https://presentations.example.test',
})
after(async () => {
  assert.equal(path.dirname(path.resolve(suiteRoot)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(suiteRoot).startsWith('betterpptx-cloud-route-suite-'))
  await fs.rm(suiteRoot, { recursive: true, force: true })
})

// No SDK, credentials, engine execution or external network. Authorities and
// object generations persist in this fake bucket across independent stores.
const mockUrl = `data:text/javascript,${encodeURIComponent(`
  export const objects = new Map()
  export const signs = []
  export const reads = []
  export const saves = []
  export const controls = { afterMetadata: null }
  let generation = 0
  const missing = () => Object.assign(new Error('missing synthetic object'), { code: 404 })
  export class Storage {
    bucket(bucketName) {
      return { file: (objectName, fileOptions = {}) => ({
        save: async (data, options) => {
          if (options.preconditionOpts?.ifGenerationMatch !== 0) throw new Error('create-only required')
          if (objects.has(objectName)) throw Object.assign(new Error('exists'), { code: 412 })
          const bytes = Buffer.from(data)
          objects.set(objectName, { data: bytes, metadata: {
            ...structuredClone(options.metadata), generation: String(++generation), size: String(bytes.length),
          } })
          saves.push(objectName)
        },
        getMetadata: async () => {
          const object = objects.get(objectName)
          if (!object || (fileOptions.generation && fileOptions.generation !== object.metadata.generation)) throw missing()
          const metadata = structuredClone(object.metadata)
          if (controls.afterMetadata) controls.afterMetadata()
          return [metadata]
        },
        download: async () => {
          reads.push(objectName)
          if (!objects.has(objectName)) throw missing()
          return [Buffer.from(objects.get(objectName).data)]
        },
        getSignedUrl: async options => {
          signs.push(structuredClone(options))
          const start = Math.floor(Date.now() / 1000) * 1000
          const end = Math.floor(options.expires / 1000) * 1000
          const date = new Date(start).toISOString().replace(/[-:]/g, '').replace('.000', '')
          return ['https://storage.googleapis.com/' + bucketName + '/' + objectName.split('/').map(encodeURIComponent).join('/')
            + '?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=' + date + '&X-Goog-Expires=' + (end - start) / 1000
            + '&generation=' + options.queryParams.generation + '&response-content-type=' + encodeURIComponent(options.responseType)
            + '&X-Goog-Signature=exact%2Bsignature%2fbytes']
        },
        createReadStream: async function* ({ start, end }) {
          reads.push(objectName)
          const object = objects.get(objectName)
          if (!object || (fileOptions.generation && fileOptions.generation !== object.metadata.generation)) throw missing()
          yield object.data.subarray(start, end + 1)
        },
      }) }
    }
  }
`)}`
const engineStub = `data:text/javascript,${encodeURIComponent(`
  export const setDownloadConfig = () => {}
  export const getEngineStats = () => ({})
  export const runDurableOperationById = () => { throw new Error('engine execution forbidden') }
  export const createMcpToolDispatcher = () => { throw new Error('engine execution forbidden') }
`)}`
const serverStub = `data:text/javascript,${encodeURIComponent(`
  export const PUBLIC_INSTRUCTIONS = ''
  export const createBetterPptxMcpServer = () => { throw new Error('MCP execution forbidden') }
`)}`
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@google-cloud/storage') return { url: mockUrl, shortCircuit: true }
  if (['./engine.mjs', '../engine.mjs'].includes(specifier)) return { url: engineStub, shortCircuit: true }
  if (['./server.mjs', '../server.mjs'].includes(specifier)) return { url: serverStub, shortCircuit: true }
  return nextResolve(specifier, context)
} })
after(() => hooks.deregister())
const { objects, signs, reads, saves, controls } = await import(mockUrl)
const { registerGcsArtifactDownloadRoute, startBetterPptxHttp } = await import('../server-http.mjs')
const nativeFetch = globalThis.fetch.bind(globalThis)
const originalFetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  assert.equal(url.hostname, '127.0.0.1', 'external network is forbidden')
  return nativeFetch(input, { ...options, redirect: 'manual' })
}
after(() => { globalThis.fetch = originalFetch })

const base = 'https://presentations.example.test/tenant'
const alice = { installHash: `install_${'a'.repeat(64)}` }
const bob = { installHash: `install_${'b'.repeat(64)}` }
const as = (owner, fn) => withResourceAuthorization(owner, fn)
const hash = value => createHash('sha256').update(value).digest('hex')
const ttl = 12 * 60 * 60 * 1000
const conflict = { code: 'ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT' }

async function fixture(t, { direct = false, large = false } = {}) {
  objects.clear(); signs.length = 0; reads.length = 0; saves.length = 0
  controls.afterMetadata = null
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-cloud-route-'))
  const env = {
    BETTERPPTX_ARTIFACT_STORE: 'gcs', BETTERPPTX_GCS_BUCKET: 'synthetic-bucket',
    BETTERPPTX_GCS_PREFIX: 'artifacts', BETTERPPTX_GCS_TEMP_ROOT: root,
    BETTERPPTX_PUBLIC_BASE: '', BETTERPPTX_ARTIFACT_TTL_MS: String(ttl),
    BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_LOCAL_MAINTAINER: '0',
    BETTERPPTX_RESOURCE_METER_ENABLED: '0',
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('betterpptx-cloud-route-'))
    await fs.rm(root, { recursive: true, force: true })
  })
  const store = createArtifactStore({ base: direct ? '' : base })
  const artifact = await as(alice, () => store.prepareArtifactTarget({
    fileName: 'Mixamo Talk Review.png', extension: '.png', contentType: 'image/png',
  }))
  artifact.cleanupTarget = false
  await fs.writeFile(artifact.target, large ? Buffer.alloc(512 * 1024, 0x61) : 'synthetic immutable content')
  const published = await as(alice, () => store.finalizeSaveTarget(artifact))
  const authorityName = url => `artifacts/.delivery-authority/${hash(url)}.json`
  const record = url => JSON.parse(objects.get(authorityName(url)).data.toString('utf8'))
  const replace = (url, value) => { objects.get(authorityName(url)).data = Buffer.from(JSON.stringify(value)) }
  const coldStore = async () => {
    // Each instance gets its own ephemeral cache; the bucket remains unchanged.
    process.env.BETTERPPTX_GCS_TEMP_ROOT = path.join(root, `cold-${Math.random().toString(16).slice(2)}`)
    return createArtifactStore({ base })
  }
  const token = () => new URL(published.downloadUrl).pathname.split('/').at(-2)
  const resolve = async (cold = true) => (cold ? await coldStore() : store).resolveBrowserDownload({ token: token(), name: published.downloadName })
  return { root, store, artifact, published, authorityName, record, replace, coldStore, token, resolve }
}

async function httpFixture(t, store) {
  const app = express()
  registerGcsArtifactDownloadRoute(app, { store, base })
  // A generic fallback ensures forbidden methods/extra path segments cannot
  // accidentally acquire a local route or framework diagnostic response.
  app.use((req, res) => res.status(404).json({ error: { code: 'ARTIFACT_NOT_FOUND' } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })
  // Raw HTTP preserves empty '?' and malformed escapes which Fetch may
  // normalize before sending; the server must decide against the wire input.
  return (pathname, options = {}) => new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port,
      path: pathname, method: options.method || 'GET', headers: options.headers }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode, headers: response.headers,
      })))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

test('large artifacts publish an opaque exact href, no GCS details or artifact bytes in the public receipt', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2031, 0, 2, 12, 0, 0, 375) })
  const f = await fixture(t, { large: true })
  assert.match(f.published.downloadUrl, /^https:\/\/presentations\.example\.test\/tenant\/files\/[A-Za-z0-9_-]{43}\/Mixamo%20Talk%20Review\.png$/)
  const wrapped = f.record(f.published.downloadUrl)
  assert.equal(wrapped.deliveryKind, 'browser-capability')
  assert.equal(wrapped.capabilitySha256, hash(f.token()))
  assert.deepEqual(wrapped.resourceOwner, resourceOwnerForContext(alice))
  assert.equal(wrapped.contentSha256, hash(objects.get(f.published.objectName).data))
  assert.equal(Date.parse(f.published.expiresAt) - Date.parse(f.published.downloadLinkExpiresAt), 375)
  assert.equal(Date.parse(f.published.expiresAt) - Date.now(), ttl)
  const pair = { downloadUrl: f.published.downloadUrl, downloadName: f.published.downloadName }
  assert.deepEqual(sanitizePublicResult({ result: pair }), { result: pair })
  assert.equal(isPublishedArtifactDownloadPair(pair.downloadUrl, pair.downloadName), true)
  const payload = JSON.stringify(sanitizePublicResult({ ...pair, expiresAt: f.published.expiresAt }))
  assert.ok(payload.length < 1024)
  assert.doesNotMatch(payload, /X-Goog|synthetic-bucket|artifacts\/|localPath|Buffer|YWFh/)
  const target = await f.resolve()
  assert.equal(target.downloadUrl, wrapped.signedDownloadUrl)
  assert.ok(reads.every(name => name.includes('/.delivery-authority/')), 'resolving a large link never reads artifact bytes')
})

test('anonymous GET/HEAD with only the exact ChatGPT decorator redirects to byte-identical issued GCS URL', async t => {
  const f = await fixture(t)
  const request = await httpFixture(t, await f.coldStore())
  const pathname = new URL(f.published.downloadUrl).pathname
  const exact = f.record(f.published.downloadUrl).signedDownloadUrl
  for (const method of ['GET', 'HEAD']) for (const query of ['', '?utm_source=chatgpt.com']) {
    const response = await request(pathname + query, { method, headers: { 'X-Forwarded-Host': 'attacker.example.test' } })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), exact)
    assert.equal(await response.text(), '')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  }
  assert.equal(isPublishedArtifactDownloadPair(f.published.downloadUrl + '?utm_source=chatgpt.com', f.published.downloadName), true)
  assert.ok(reads.every(name => name.includes('/.delivery-authority/')))
})

test('real HTTP bootstrap serves anonymous cold capabilities before OAuth and diagnostic capture', async t => {
  const f = await fixture(t)
  const exact = f.record(f.published.downloadUrl).signedDownloadUrl
  const logFile = path.join(f.root, 'http-test.ndjson')
  const env = { BETTERPPTX_LOG: 'full', BETTERPPTX_LOG_FILE: logFile, BETTERPPTX_LOG_PAYLOADS: '1' }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  process.env.BETTERPPTX_GCS_TEMP_ROOT = path.join(f.root, 'actual-http-cold-instance')
  let started
  try {
    started = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, publicBase: base,
      downloadRoot: path.join(f.root, 'downloads'),
      identityKeyResolver: async () => { throw new Error('download must not need OAuth') },
    })
    assert.equal(started.authMode, 'oauth')
    const url = `http://127.0.0.1:${started.httpServer.address().port}${new URL(f.published.downloadUrl).pathname}`
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(url + '?utm_source=chatgpt.com', { method })
      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), exact)
      assert.equal(await response.text(), '')
    }
    assert.equal((await fetch(url + '?utm_source=evil')).status, 404)
    assert.equal((await fetch(url + '/extra')).status, 404)
    const diagnostic = await fs.readFile(logFile, 'utf8')
    assert.ok(diagnostic.includes('server.http.ready'), 'diagnostics are really enabled')
    assert.ok(!diagnostic.includes(f.token()), 'opaque bearer token must not enter diagnostics')
    assert.ok(!diagnostic.includes('X-Goog-Signature'), 'signed destination must not enter diagnostics')
    assert.ok(!diagnostic.includes(exact))
  } finally {
    if (started) {
      started.httpServer.closeAllConnections()
      await new Promise(resolve => started.httpServer.close(resolve))
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('malformed/duplicate/extra query and path aliases fail without leaking signed URLs or diagnostic paths', async t => {
  const f = await fixture(t)
  const request = await httpFixture(t, f.store)
  const pathname = new URL(f.published.downloadUrl).pathname
  for (const query of ['?', '?utm_source=evil', '?utm_source=chatgpt.com&x=1', '?utm_source=chatgpt.com&utm_source=chatgpt.com',
    '?utm_source[]=chatgpt.com', '?utm%5Fsource=chatgpt.com', '?utm_source=chatgpt%2Ecom', '?utm_source=chatgpt.com&',
    '?url=https://attacker.example.test', '?permit=anything', '?utm_source=chatgpt.com?x=1']) {
    const response = await request(pathname + query)
    assert.equal(response.status, 404, query)
    assert.equal(response.headers.get('location'), null)
    assert.doesNotMatch(await response.text(), /X-Goog|storage\.googleapis|synthetic-bucket|\.mjs|Error:|[A-Z]:\\/)
    assert.equal(isPublishedArtifactDownloadPair(f.published.downloadUrl + query, f.published.downloadName), false, query)
  }
  for (const altered of [pathname + '/', pathname + '/extra', pathname.replace('Mixamo', '%4Dixamo'),
    pathname.replace('Mixamo', '%ZZ'), pathname.replace(f.token(), 'short'), pathname.replace('Review.png', 'Other.png')]) {
    const response = await request(altered)
    assert.equal(response.status, 404, altered)
    assert.equal(response.headers.get('location'), null)
    assert.doesNotMatch(await response.text(), /\.mjs|URIError|Failed to decode/)
  }
  assert.equal((await request(pathname, { method: 'POST' })).status, 404)
})

test('cold renewal retains exact original capability/expiry and still isolates owners and generation-bound reads', async t => {
  const f = await fixture(t)
  const cold = await f.coldStore()
  const beforeSigns = signs.length
  const beforeSaves = saves.length
  const decorated = { ...f.published, downloadUrl: f.published.downloadUrl + '?utm_source=chatgpt.com' }
  await assert.rejects(as(bob, () => cold.issueBrowserDownload(decorated)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  await assert.rejects(as(bob, () => cold.readArtifactChunk(decorated)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  process.env.BETTERPPTX_ARTIFACT_TTL_MS = String(ttl * 3)
  const renewed = await as(alice, () => cold.issueBrowserDownload(decorated))
  assert.deepEqual(renewed, { downloadUrl: f.published.downloadUrl, downloadLinkExpiresAt: f.published.downloadLinkExpiresAt })
  assert.equal(signs.length, beforeSigns)
  assert.equal(saves.length, beforeSaves)
  const chunk = await as(alice, () => cold.readArtifactChunk({ ...decorated, maxBytes: 9 }))
  assert.equal(chunk.bytes.toString(), 'synthetic')
  const object = objects.get(f.published.objectName)
  object.metadata.generation = '99999'
  await assert.rejects(f.resolve(), conflict)
  await assert.rejects(as(alice, () => cold.issueBrowserDownload(f.published)), conflict)
  await assert.rejects(as(alice, () => cold.readArtifactChunk(f.published)), { code: 404 })
})

test('altered shared wrapper or source authority cannot change owner, object, hash, bounds, MIME or exact signed query', async t => {
  const f = await fixture(t)
  const wrapper = f.record(f.published.downloadUrl)
  const source = f.record(wrapper.signedDownloadUrl)
  for (const patch of [
    { resourceOwner: resourceOwnerForContext(bob) }, { resourceOwner: null }, { bucket: 'foreign' }, { prefix: 'foreign' },
    { objectName: 'artifacts/foreign/file.png' }, { contentSha256: 'f'.repeat(64) }, { objectGeneration: '99999' },
    { contentType: 'text/plain' }, { artifactExpiresAt: new Date(Date.parse(wrapper.artifactExpiresAt) + ttl).toISOString() },
    { expiresAt: new Date(Date.parse(wrapper.expiresAt) + 1).toISOString() }, { expiresAt: 'invalid' },
    { capabilitySha256: 'f'.repeat(64) }, { signedDownloadUrl: wrapper.signedDownloadUrl.replace('%2f', '%2F') },
    { signedDownloadUrl: 'https://attacker.example.test/path' },
    { downloadUrl: f.published.downloadUrl + '?utm_source=chatgpt.com' },
  ]) {
    f.replace(f.published.downloadUrl, { ...wrapper, ...patch })
    await assert.rejects(f.resolve(), conflict, JSON.stringify(patch))
  }
  f.replace(f.published.downloadUrl, wrapper)
  for (const patch of [{ resourceOwner: resourceOwnerForContext(bob) }, { objectName: 'artifacts/foreign/file.png' },
    { contentSha256: 'f'.repeat(64) }, { expiresAt: 'invalid' }, { objectGeneration: '99999' }]) {
    f.replace(wrapper.signedDownloadUrl, { ...source, ...patch })
    await assert.rejects(f.resolve(), conflict, JSON.stringify(patch))
  }
  f.replace(wrapper.signedDownloadUrl, source)
  await f.resolve()
  objects.delete(f.authorityName(wrapper.signedDownloadUrl))
  await assert.rejects(f.resolve(), conflict)
})

test('even paired corrupted authorities cannot redirect to an arbitrary host/object/generation or form a cycle', async t => {
  const f = await fixture(t)
  const wrapper = f.record(f.published.downloadUrl)
  const source = f.record(wrapper.signedDownloadUrl)
  for (const destination of [
    wrapper.signedDownloadUrl.replace('storage.googleapis.com', 'attacker.example.test'),
    wrapper.signedDownloadUrl.replace('/synthetic-bucket/', '/foreign-bucket/'),
    wrapper.signedDownloadUrl.replace('generation=' + source.objectGeneration, 'generation=99999'),
    wrapper.signedDownloadUrl + '&generation=' + source.objectGeneration,
    wrapper.signedDownloadUrl.replace('https://', 'http://'),
  ]) {
    objects.set(f.authorityName(destination), { ...objects.get(f.authorityName(wrapper.signedDownloadUrl)),
      data: Buffer.from(JSON.stringify({ ...source, downloadUrl: destination })) })
    f.replace(f.published.downloadUrl, { ...wrapper, signedDownloadUrl: destination })
    await assert.rejects(f.resolve(), conflict)
  }
  // Two different capability records referring back to each other are rejected
  // at the direct-only source boundary, without recursive reads/hangs.
  const token = 'B'.repeat(43)
  const secondUrl = `${base}/files/${token}/${encodeURIComponent(f.published.downloadName)}`
  const second = { ...wrapper, downloadUrl: secondUrl, capabilitySha256: hash(token), signedDownloadUrl: f.published.downloadUrl }
  objects.set(f.authorityName(secondUrl), { data: Buffer.from(JSON.stringify(second)), metadata: {} })
  f.replace(f.published.downloadUrl, { ...wrapper, signedDownloadUrl: secondUrl })
  await assert.rejects(f.resolve(), conflict)
})

test('link boundary and metadata-await boundary fail closed without extending retention or fetching bytes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2031, 0, 2, 12, 0, 0, 375) })
  const f = await fixture(t)
  const deadline = Date.parse(f.published.downloadLinkExpiresAt)
  t.mock.timers.tick(deadline - Date.now() - 1)
  await f.resolve()
  controls.afterMetadata = () => t.mock.timers.tick(1)
  const beforeSigns = signs.length
  await assert.rejects(as(alice, () => f.store.issueBrowserDownload(f.published)), { code: 'ARTIFACT_NOT_AVAILABLE' }, 'expires while renewing metadata')
  assert.equal(signs.length, beforeSigns)
  t.mock.timers.setTime(deadline - 1)
  await assert.rejects(f.resolve(), conflict, 'expires while checking object metadata')
  controls.afterMetadata = null
  await assert.rejects(f.resolve(), conflict)
  await assert.rejects(as(alice, () => f.store.issueBrowserDownload(f.published)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  assert.equal(signs.length, beforeSigns, 'an expired capability cannot be re-signed into a later capability')
  assert.ok(reads.every(name => name.includes('/.delivery-authority/')))
  t.mock.timers.tick(375)
  await assert.rejects(as(alice, () => f.store.readArtifactChunk(f.published)), { code: 'ARTIFACT_NOT_AVAILABLE' })
})

test('existing direct URLs stay usable and recover to opaque links after public-base configuration', async t => {
  const f = await fixture(t, { direct: true })
  assert.ok(f.published.downloadUrl.startsWith('https://storage.googleapis.com/'))
  assert.equal(isPublishedArtifactDownloadPair(f.published.downloadUrl, f.published.downloadName), true)
  const original = f.record(f.published.downloadUrl)
  f.store.configure({ base })
  const issued = await as(alice, () => f.store.issueBrowserDownload(f.published))
  assert.ok(issued.downloadUrl.startsWith(base + '/files/'))
  const wrapped = f.record(issued.downloadUrl)
  for (const key of ['artifactExpiresAt', 'contentType', 'contentSha256', 'objectGeneration', 'resourceOwner']) {
    assert.deepEqual(wrapped[key], original[key], key)
  }
  assert.equal(isPublishedArtifactDownloadPair(f.published.downloadUrl, f.published.downloadName), true, 'old direct issuance is not invalidated')
  const request = await httpFixture(t, await f.coldStore())
  const response = await request(new URL(issued.downloadUrl).pathname)
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), wrapped.signedDownloadUrl)
})

test('old direct and .53 authority recovery can issue wrappers without requiring new legacy object tags', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2031, 0, 2, 12, 0, 0, 375) })
  const f = await fixture(t, { direct: true })
  const direct = f.record(f.published.downloadUrl)
  const oldUrl = f.published.downloadUrl.replace(/&generation=[0-9]+/, '')
  const legacy = { ...direct, downloadUrl: oldUrl }
  delete legacy.contentType; delete legacy.contentSha256; delete legacy.objectGeneration
  objects.delete(f.authorityName(f.published.downloadUrl))
  await fs.unlink(path.join(f.root, '.public-delivery-records', `${hash(f.published.downloadUrl)}.json`))
  const object = objects.get(f.published.objectName)
  delete object.metadata.metadata.artifactOwner; delete object.metadata.metadata.artifactSha256
  objects.set(f.authorityName(oldUrl), { data: Buffer.from(JSON.stringify(legacy)), metadata: {} })
  const cold = await f.coldStore()
  const request = { downloadUrl: oldUrl, downloadName: f.published.downloadName }
  await assert.rejects(as(bob, () => cold.issueBrowserDownload(request)), { code: 'ARTIFACT_NOT_AVAILABLE' })
  const renewed = await as(alice, () => cold.issueBrowserDownload(request))
  assert.ok(renewed.downloadUrl.startsWith(base + '/files/'))
  assert.equal(renewed.downloadLinkExpiresAt, f.published.downloadLinkExpiresAt)
  const wrapper = f.record(renewed.downloadUrl)
  assert.equal(wrapper.artifactExpiresAt, legacy.artifactExpiresAt)
  assert.equal(wrapper.contentType, 'image/png')
  assert.equal(wrapper.objectGeneration, object.metadata.generation)
  assert.deepEqual(wrapper.resourceOwner, legacy.resourceOwner)
  assert.equal((await cold.resolveBrowserDownload({ token: new URL(renewed.downloadUrl).pathname.split('/').at(-2), name: renewed.downloadName || request.downloadName })).downloadUrl, wrapper.signedDownloadUrl)
  assert.deepEqual(f.record(oldUrl), legacy, 'legacy authority is never replaced')
})

test('Cloudflare forwards prefixed capability GET/HEAD and decorator unchanged without following the final GCS redirect', async () => {
  const guardedFetch = globalThis.fetch
  const signed = 'https://storage.googleapis.com/synthetic-bucket/file?X-Goog-Signature=exact%2Bsignature%2fbytes'
  try {
    for (const method of ['GET', 'HEAD']) {
      let forwarded
      globalThis.fetch = async request => {
        forwarded = request
        return new Response(null, { status: 302, headers: { Location: signed, 'Cache-Control': 'private, no-store' } })
      }
      const pathname = '/tenant/files/' + 'A'.repeat(43) + '/Deck%20Review.pptx?utm_source=chatgpt.com'
      const response = await worker.fetch(new Request('https://presentations.example.test' + pathname, { method }), {
        BETTERPPTX_CLOUD_RUN_ORIGIN: 'https://synthetic-uc.a.run.app',
      })
      assert.equal(forwarded.url, 'https://synthetic-uc.a.run.app' + pathname)
      assert.equal(forwarded.method, method)
      assert.equal(forwarded.redirect, 'manual')
      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), signed)
      assert.equal(await response.text(), '')
    }
  } finally { globalThis.fetch = guardedFetch }
})
