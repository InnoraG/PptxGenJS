import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createChatterboxHttpProvider } from '../narration/providers/chatterboxHttp.mjs'

function sampleWav() {
	const bytes = 8000 * 3 * 2, wav = Buffer.alloc(44 + bytes)
	wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
	wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
	wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
	wav.write('data', 36); wav.writeUInt32LE(bytes, 40)
	for (let offset = 44; offset < wav.length; offset += 2) wav.writeInt16LE(1000, offset)
	return wav
}
function setup(t) {
	const env = { BETTERPPTX_TTS_AUTH: '', BETTERPPTX_CHATTERBOX_URL: 'http://127.0.0.1:5001' }
	const old = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
	Object.assign(process.env, env)
	t.after(() => { for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value })
	const sample = sampleWav()
	return { id: `voice_${'a'.repeat(64)}`, customReferenceBuffer: sample, referenceDigest: `sha256:${crypto.createHash('sha256').update(sample).digest('hex')}`, languages: ['fr'], language: 'fr' }
}

test('buffer-based custom voice registers exact sample and rehydrates idempotently before synthesis', async t => {
	const voice = setup(t)
	const sequence = []
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		sequence.push(new URL(url).pathname)
		const body = JSON.parse(options.body)
		if (url.endsWith('/voices/register')) {
			assert.deepEqual(Object.keys(body).sort(), ['languages', 'referenceDigest', 'referenceWavBase64', 'rightsConfirmed', 'voice'].sort())
			assert.equal(body.voice, voice.id)
			assert.equal(body.referenceDigest, voice.referenceDigest)
			assert.deepEqual(Buffer.from(body.referenceWavBase64, 'base64'), voice.customReferenceBuffer)
			assert.deepEqual(body.languages, ['fr'])
			assert.equal(body.rightsConfirmed, true)
			return Response.json({ id: voice.id, referenceDigest: voice.referenceDigest })
		}
		assert.deepEqual(body, { text: 'Bonjour.', voice: voice.id, language: 'fr' })
		return new Response(sampleWav())
	})
	const provider = createChatterboxHttpProvider()
	await provider.synthesize({ text: 'Bonjour.', voice })
	await provider.synthesize({ text: 'Bonjour.', voice })
	assert.deepEqual(sequence, ['/voices/register', '/synthesize', '/voices/register', '/synthesize'])
})

test('custom reference digest mismatch makes no HTTP requests', async t => {
	const voice = setup(t)
	let calls = 0
	t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('must not run') })
	await assert.rejects(createChatterboxHttpProvider().synthesize({ text: 'Hello.', voice: { ...voice, referenceDigest: `sha256:${'b'.repeat(64)}` } }), { code: 'NARRATION_SYNTHESIS_INVALID_VOICE' })
	assert.equal(calls, 0)
})

test('custom reference registration mismatch, malformed reply, and rejection remain generic and never synthesize', async t => {
	const voice = setup(t)
	let reply = () => Response.json({ id: voice.id, referenceDigest: `sha256:${'b'.repeat(64)}` })
	t.mock.method(globalThis, 'fetch', async url => { assert.ok(url.endsWith('/voices/register')); return reply() })
	const provider = createChatterboxHttpProvider()
	await assert.rejects(provider.synthesize({ text: 'Hello.', voice }), { code: 'NARRATION_SYNTHESIS_INVALID_VOICE' })
	reply = () => Response.json(null)
	await assert.rejects(provider.synthesize({ text: 'Hello.', voice }), { code: 'NARRATION_SYNTHESIS_INVALID_VOICE' })
	reply = () => new Response('private path /app/reference.wav and traceback', { status: 400 })
	await assert.rejects(provider.synthesize({ text: 'Hello.', voice }), error => error.code === 'NARRATION_SYNTHESIS_FAILED' && !/private|reference.wav|traceback/.test(error.message))
})
