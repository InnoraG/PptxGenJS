import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createChatterboxHttpProvider } from '../narration/providers/chatterboxHttp.mjs'

function fixtureWav(seconds = 0.1) {
	const bytes = Math.round(24000 * seconds) * 2
	const buffer = Buffer.alloc(44 + bytes)
	buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8)
	buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
	buffer.writeUInt32LE(24000, 24); buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40)
	for (let offset = 44; offset < buffer.length; offset += 2) buffer.writeInt16LE(1000, offset)
	return buffer
}

function cloudEnvironment(t, url = 'https://speech-test.run.app/private') {
	const values = { BETTERPPTX_TTS_AUTH: 'cloud-run', BETTERPPTX_CHATTERBOX_URL: url }
	const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
	Object.assign(process.env, values)
	t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value })
}

test('private cloud runtime authorizes health, voices, registration, and synthesis with cached service identity', async t => {
	cloudEnvironment(t)
	const reference = fixtureWav(3)
	const voice = { id: `voice_${'a'.repeat(64)}`, customReferenceBuffer: reference, referenceDigest: `sha256:${crypto.createHash('sha256').update(reference).digest('hex')}`, languages: ['en'], language: 'en' }
	const token = `fixture.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`
	let metadataCalls = 0
	const routes = []
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		if (String(url).startsWith('http://metadata.google.internal/')) {
			metadataCalls++
			assert.equal(new URL(url).searchParams.get('audience'), 'https://speech-test.run.app')
			assert.equal(options.headers['Metadata-Flavor'], 'Google')
			return new Response(token)
		}
		assert.equal(options.headers['X-Serverless-Authorization'], `Bearer ${token}`)
		routes.push(new URL(url).pathname)
		if (String(url).endsWith('/health')) return Response.json({ ready: true })
		if (String(url).endsWith('/voices')) return Response.json({ voices: [] })
		if (String(url).endsWith('/voices/register')) return Response.json({ id: voice.id, referenceDigest: voice.referenceDigest })
		return new Response(fixtureWav())
	})
	const provider = createChatterboxHttpProvider()
	assert.equal(await provider.probe(), true)
	await provider.listVoices()
	await provider.synthesize({ text: 'Hello.', voice })
	assert.equal(metadataCalls, 1)
	assert.deepEqual(routes, ['/private/health', '/private/voices', '/private/voices/register', '/private/synthesize'])
})

test('cloud identity cannot be sent to an insecure or unrelated runtime', t => {
	cloudEnvironment(t, 'http://127.0.0.1:5001')
	assert.throws(() => createChatterboxHttpProvider(), { code: 'NARRATION_SYNTHESIS_RUNTIME_CONFIGURATION' })
	process.env.BETTERPPTX_CHATTERBOX_URL = 'https://example.test'
	assert.throws(() => createChatterboxHttpProvider(), { code: 'NARRATION_SYNTHESIS_RUNTIME_CONFIGURATION' })
})

test('metadata identity failure is sanitized and never calls the speech upstream', async t => {
	cloudEnvironment(t)
	let upstreamCalls = 0
	t.mock.method(globalThis, 'fetch', async url => {
		if (String(url).startsWith('http://metadata.google.internal/')) throw new Error('private metadata diagnostics')
		upstreamCalls++
		return new Response(fixtureWav())
	})
	await assert.rejects(createChatterboxHttpProvider().synthesize({ text: 'Hello.', voice: 'narrator' }), error => error.code === 'NARRATION_SYNTHESIS_RUNTIME_UNAVAILABLE' && !/metadata|diagnostics/.test(error.message))
	assert.equal(upstreamCalls, 0)
})
