import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import worker from '../deploy/cloudflare-edge/src/index.mjs'

// Real Worker entry point; all origins, credentials and bytes are synthetic.
// Freeze only the validation clock: no cloud/provider accounts or network calls.
const now = Date.UTC(2031, 0, 2, 12)
const runOrigin = 'https://betterpptx-api-fixture-uc.a.run.app'
const publicOrigin = 'https://presentations.example'
const fileName = 'browser-fixture.pptx'
const filePath = `/files/${'a'.repeat(43)}/${fileName}`
const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const bucket = 'private-download-fixture'
const env = { BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin, BETTERPPTX_GCS_BUCKET: bucket, BETTERPPTX_GCS_PREFIX: 'artifacts' }
const source = Buffer.alloc(17_215_011)
for (let i = 0; i < source.length; i++) source[i] = i % 251
const sourceHash = createHash('sha256').update(source).digest('hex')
const originalFetch = globalThis.fetch, originalNow = Date.now

function signedTarget(patch = {}) {
	const url = new URL(`https://storage.googleapis.com/${bucket}/artifacts/2031/owner-fixture/${fileName}`)
	for (const [key, value] of Object.entries({
		'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
		'X-Goog-Credential': 'fixture@synthetic.iam.gserviceaccount.com/20310102/auto/storage/goog4_request',
		'X-Goog-Date': '20310102T120000Z', 'X-Goog-Expires': '43200',
		'X-Goog-SignedHeaders': 'host', 'X-Goog-Signature': 'a'.repeat(512), generation: '123456789',
		'response-content-type': mime, 'response-content-disposition': `attachment; filename="${fileName}"`,
	})) url.searchParams.set(key, value)
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) url.searchParams.delete(key); else url.searchParams.set(key, value)
	}
	return url.href
}

async function fixture(t, options = {}) {
	Date.now = () => now
	const calls = []
	let pulls = 0, cancelled = false, offset = 0
	const bytes = options.bytes || source
	const target = options.target || signedTarget()
	const gcsHeaders = new Headers({
		'Content-Type': mime, 'Content-Disposition': `attachment; filename="${fileName}"`,
		'Content-Length': String(bytes.length), 'Accept-Ranges': 'bytes', ETag: '"fixture-etag"',
		'Last-Modified': 'Thu, 02 Jan 2031 12:00:00 GMT',
		'Cache-Control': 'private, max-age=3600', 'Set-Cookie': 'private-storage-cookie',
		Location: 'https://storage.googleapis.com/private-unrelated-target',
		'X-Goog-Hash': 'private-provider-hash', 'X-Goog-Generation': '123456789',
		'X-Private-Object': 'owner-fixture', Server: 'private-provider',
		...options.gcsHeaders,
	})
	const body = new ReadableStream({
		pull(controller) {
			pulls++
			if (offset >= bytes.length) { controller.close(); return }
			const next = Math.min(offset + 64 * 1024, bytes.length)
			controller.enqueue(bytes.subarray(offset, next)); offset = next
		},
		cancel() { cancelled = true },
	}, { highWaterMark: 0 })
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init)
		calls.push(request)
		if (calls.length === 1) {
			assert.equal(new URL(request.url).origin, runOrigin)
			assert.equal(request.redirect, 'manual')
			return new Response(null, { status: 302, headers: { Location: target,
				'Set-Cookie': 'private-upstream-cookie', 'X-Private-Authority': 'private-authority' } })
		}
		assert.equal(calls.length, 2, 'no alternate target or provider redirect may be fetched')
		assert.equal(request.url, target, 'signed query bytes must be forwarded exactly, not reconstructed')
		assert.equal(request.method, 'GET', 'the signed GET URL must remain GET even for incoming HEAD')
		assert.equal(request.redirect, 'manual', 'provider redirects must never be followed')
		for (const header of ['authorization', 'cookie', 'host', 'mcp-session-id', 'x-openai-subject', 'x-openai-session', 'x-betterpptx-device', 'x-private-client']) {
			assert.equal(request.headers.get(header), null, `Private caller header reached GCS: ${header}`)
		}
		if (options.range) assert.equal(request.headers.get('range'), options.range)
		if (options.throwProvider) throw new Error('private-provider-error ' + target)
		return new Response(body, { status: options.gcsStatus || 200, headers: gcsHeaders })
	}
	t.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow })
	const request = new Request(publicOrigin + filePath + '?utm_source=chatgpt', {
		method: options.method || 'GET', headers: {
			Authorization: 'Bearer private-caller-auth', Cookie: 'private-caller-cookie',
			'Mcp-Session-Id': 'private-session', 'X-OpenAI-Subject': 'private-subject',
			'X-OpenAI-Session': 'private-chat-session', 'X-BetterPPTX-Device': 'private-device',
			'X-Private-Client': 'private-client', ...(options.range ? { Range: options.range } : {}),
		},
	})
	const response = await worker.fetch(request, options.env || env)
	return { response, calls, target, pulls: () => pulls, cancelled: () => cancelled }
}

function assertSafeHeaders(response) {
	for (const name of ['location', 'set-cookie', 'authorization', 'server', 'x-goog-hash', 'x-goog-generation', 'x-private-object', 'x-private-authority']) {
		assert.equal(response.headers.get(name), null, `Private response header was relayed: ${name}`)
	}
	assert.match(response.headers.get('cache-control') || '', /(?:^|,\s*)no-store(?:,|$)/)
}

async function assertGenericFailure(f, label) {
	assert.ok(f.response.status >= 400 && f.response.status < 600, `${label}: must fail closed, got ${f.response.status}`)
	assertSafeHeaders(f.response)
	const message = await f.response.text()
	assert.ok(message.length > 0 && message.length < 300, `${label}: bounded generic error required`)
	assert.doesNotMatch(message, /storage\.googleapis|private-|owner-fixture|X-Goog|Signature|generation|iam\.gserviceaccount|<Error|<Code|17_215_011/i)
}

test('GET relays the complete large presentation as a stream, with exact signed target and safe download headers', async t => {
	const f = await fixture(t)
	assert.equal(f.response.status, 200)
	assert.equal(f.calls.length, 2)
	assert.equal(f.pulls(), 0, 'the edge must not buffer a 17.2 MB publication before returning the response')
	assertSafeHeaders(f.response)
	assert.equal(f.response.headers.get('content-type'), mime)
	assert.equal(f.response.headers.get('content-disposition'), `attachment; filename="${fileName}"`)
	assert.equal(f.response.headers.get('content-length'), String(source.length))
	const downloaded = Buffer.from(await f.response.arrayBuffer())
	assert.equal(downloaded.length, source.length)
	assert.equal(createHash('sha256').update(downloaded).digest('hex'), sourceHash)
	assert.ok(f.pulls() > 1)
})

test('206 relay preserves safe range headers and exact bytes without forwarding caller credentials', async t => {
	const rangeBytes = source.subarray(100, 400)
	const f = await fixture(t, { bytes: rangeBytes, range: 'bytes=100-399', gcsStatus: 206,
		gcsHeaders: { 'Content-Range': `bytes 100-399/${source.length}` } })
	assert.equal(f.response.status, 206)
	assertSafeHeaders(f.response)
	assert.equal(f.response.headers.get('content-range'), `bytes 100-399/${source.length}`)
	assert.equal(f.response.headers.get('accept-ranges'), 'bytes')
	assert.equal(f.response.headers.get('content-length'), '300')
	assert.deepEqual(Buffer.from(await f.response.arrayBuffer()), rangeBytes)
})

test('HEAD validates using the signed GET method, cancels its stream and returns headers without bytes', async t => {
	const f = await fixture(t, { method: 'HEAD' })
	assert.equal(f.response.status, 200)
	assert.equal(f.calls[0].method, 'HEAD')
	assert.equal(f.calls[1].method, 'GET')
	assert.equal(f.response.body, null)
	assert.equal((await f.response.arrayBuffer()).byteLength, 0)
	assert.equal(f.cancelled(), true)
	assert.equal(f.pulls(), 0)
	assertSafeHeaders(f.response)
	assert.equal(f.response.headers.get('content-type'), mime)
	assert.equal(f.response.headers.get('content-length'), String(source.length))
})

test('omitted prefix uses artifacts; an explicit alternate prefix is pinned to its own boundary', async t => {
	const defaults = await fixture(t, { env: { BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin, BETTERPPTX_GCS_BUCKET: bucket } })
	assert.equal(defaults.response.status, 200)
	await defaults.response.body.cancel()
	const custom = await fixture(t, { env: { ...env, BETTERPPTX_GCS_PREFIX: 'private-issued' },
		target: signedTarget().replace('/artifacts/', '/private-issued/') })
	assert.equal(custom.response.status, 200)
	await custom.response.body.cancel()
})

test('unapproved or malformed signer target rejection table never fetches storage or exposes private authority', async t => {
	const valid = signedTarget()
	const cases = [
		['foreign host', valid.replace('storage.googleapis.com', 'attacker.example')],
		['hostname suffix trick', valid.replace('storage.googleapis.com', 'storage.googleapis.com.attacker.example')],
		['HTTP', valid.replace('https:', 'http:')],
		['credentials', valid.replace('https://', 'https://user:secret@')],
		['foreign bucket', valid.replace(`/${bucket}/`, '/foreign-bucket/')],
		['foreign prefix', valid.replace('/artifacts/', '/elsewhere/')],
		['prefix sibling', valid.replace('/artifacts/', '/artifacts-other/')],
		['encoded traversal', valid.replace('/artifacts/', '/artifacts/..%2fsecret/')],
		['encoded backslash', valid.replace('/artifacts/', '/artifacts/%5csecret/')],
		['filename mismatch', valid.replace(`/${fileName}?`, '/other.pptx?')],
		['expired', signedTarget({ 'X-Goog-Date': '20310101T000000Z' })],
		['exact expiry boundary', signedTarget({ 'X-Goog-Date': '20310102T000000Z' })],
		['over 12 hours', signedTarget({ 'X-Goog-Expires': '43201' })],
		['zero lifetime', signedTarget({ 'X-Goog-Expires': '0' })],
		['fractional lifetime', signedTarget({ 'X-Goog-Expires': '1.5' })],
		['malformed date', signedTarget({ 'X-Goog-Date': 'not-a-date' })],
		['invalid calendar date', signedTarget({ 'X-Goog-Date': '20310231T120000Z' })],
		['future issuance', signedTarget({ 'X-Goog-Date': '20310102T121000Z' })],
		['missing algorithm', signedTarget({ 'X-Goog-Algorithm': null })],
		['wrong algorithm', signedTarget({ 'X-Goog-Algorithm': 'GOOG4-HMAC-SHA256' })],
		['missing credential', signedTarget({ 'X-Goog-Credential': null })],
		['invalid credential scope', signedTarget({ 'X-Goog-Credential': 'fixture/20310102/auto/arbitrary/goog4_request' })],
		['missing signed headers', signedTarget({ 'X-Goog-SignedHeaders': null })],
		['wrong signed headers', signedTarget({ 'X-Goog-SignedHeaders': 'authorization;host' })],
		['missing signature', signedTarget({ 'X-Goog-Signature': null })],
		['nonhex signature', signedTarget({ 'X-Goog-Signature': 'not-a-signature' })],
		['missing generation', signedTarget({ generation: null })],
		['invalid generation', signedTarget({ generation: '-1' })],
		['wrong signed MIME', signedTarget({ 'response-content-type': 'text/html' })],
		['nonattachment signed disposition', signedTarget({ 'response-content-disposition': `inline; filename="${fileName}"` })],
		['duplicate expiry', valid + '&X-Goog-Expires=60'],
		['signed URL decorator', valid + '&utm_source=chatgpt'],
		['fragment', valid + '#private-fragment'],
	]
	for (const [label, target] of cases) {
		const f = await fixture(t, { target })
		await assertGenericFailure(f, label)
		assert.equal(f.calls.length, 1, `${label}: unapproved target must not be fetched`)
	}
	const missingBucket = await fixture(t, { env: { BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin } })
	await assertGenericFailure(missingBucket, 'missing bucket pin')
	assert.ok(missingBucket.calls.length <= 1)
})

test('unsafe provider responses, redirects and outages fail generically and are never followed', async t => {
	for (const [label, options] of [
		['provider redirect', { gcsStatus: 302, gcsHeaders: { Location: 'https://attacker.example/private-redirect' } }],
		['provider denial', { gcsStatus: 403 }], ['provider unavailable', { gcsStatus: 503 }],
		['wrong MIME', { gcsHeaders: { 'Content-Type': 'text/html' } }],
		['encoded body', { gcsHeaders: { 'Content-Encoding': 'gzip' } }],
		['not attachment', { gcsHeaders: { 'Content-Disposition': `inline; filename="${fileName}"` } }],
		['provider exception', { throwProvider: true }],
		['wrong attachment filename', { gcsHeaders: { 'Content-Disposition': 'attachment; filename="other.pptx"' } }],
	]) {
		const f = await fixture(t, options)
		await assertGenericFailure(f, label)
		assert.equal(f.calls.length, 2)
		if (!options.throwProvider) assert.equal(f.cancelled(), true, `${label}: rejected provider body must be cancelled`)
		assert.equal(f.pulls(), 0, `${label}: provider errors must not be buffered or exposed`)
	}
})

test('ordinary same-origin MCP redirects remain unchanged and are not treated as file download authority', async t => {
	const originalFetch = globalThis.fetch
	const calls = []
	globalThis.fetch = async input => {
		const request = new Request(input); calls.push(request)
		assert.equal(new URL(request.url).origin, runOrigin)
		return new Response(null, { status: 302, headers: { Location: `${publicOrigin}/mcp/continue` } })
	}
	t.after(() => { globalThis.fetch = originalFetch })
	const response = await worker.fetch(new Request(`${publicOrigin}/mcp`), env)
	assert.equal(response.status, 302)
	assert.equal(response.headers.get('location'), `${publicOrigin}/mcp/continue`)
	assert.equal(calls.length, 1)
})
