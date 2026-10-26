import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatterboxHttpProvider } from '../narration/providers/chatterboxHttp.mjs'
import { getProvider } from '../narration/providers/index.mjs'

function wav(sampleRate = 24000, channels = 1) {
	const dataBytes = sampleRate * channels * 2 / 10
	const buffer = Buffer.alloc(44 + dataBytes)
	buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8)
	buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels, 22)
	buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * channels * 2, 28)
	buffer.writeUInt16LE(channels * 2, 32); buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36); buffer.writeUInt32LE(dataBytes, 40)
	return buffer
}

test('adapter registers aliases while retaining the legacy default', () => {
	assert.equal(getProvider('chatterbox').name, 'chatterbox-http')
	assert.equal(getProvider('chatterbox-http').name, 'chatterbox-http')
	assert.equal(getProvider('piper-http').name, 'piper-http')
})

test('adapter sends voice/language and measures PCM format from returned bytes', async t => {
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		assert.ok(url.endsWith('/synthesize'))
		assert.deepEqual(JSON.parse(options.body), { text: 'A real request.', voice: 'narrator-1', language: 'en-US' })
		return new Response(wav(48000, 2), { headers: { 'content-type': 'audio/wav' } })
	})
	const result = await createChatterboxHttpProvider().synthesize({ text: 'A real request.', voice: { id: 'narrator-1', locale: 'en-US' }, lengthScale: 1 })
	assert.equal(result.sampleRate, 48000)
	assert.equal(result.channels, 2)
	assert.equal(result.bitsPerSample, 16)
})

test('adapter rejects incompatible controls and unsafe voice references before HTTP', async t => {
	let calls = 0
	t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('must not run') })
	const provider = createChatterboxHttpProvider()
	for (const setting of [{ speaker: 0 }, { noiseScale: 0 }, { noiseWScale: 0.8 }, { lengthScale: 1.1 }]) {
		await assert.rejects(provider.synthesize({ text: 'Hello', voice: 'narrator', ...setting }), { code: 'NARRATION_SYNTHESIS_UNSUPPORTED_SETTINGS' })
	}
	for (const voice of ['../private.wav', 'https://example.test/voice', '/private.wav', '']) {
		await assert.rejects(provider.synthesize({ text: 'Hello', voice }), { code: 'NARRATION_SYNTHESIS_INVALID_VOICE' })
	}
	for (const text of ['', ' ', 'x'.repeat(1001)]) {
		await assert.rejects(provider.synthesize({ text, voice: 'narrator' }), error => error.code === 'NARRATION_SYNTHESIS_TEXT_LIMIT' && error.message.includes('1000'))
	}
	assert.equal(calls, 0)
})

test('adapter forwards requested language ahead of a multilingual voice default locale', async t => {
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		assert.equal(JSON.parse(options.body).language, 'fr-FR')
		return new Response(wav())
	})
	await createChatterboxHttpProvider().synthesize({ text: 'Bonjour.', voice: { id: 'approved-speaker', locale: 'en-US', languages: ['en', 'fr'] }, language: 'fr-FR' })
})

test('readiness requires ready true; voice list uses its dedicated route', async t => {
	let ready = false
	t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(url.endsWith('/health') ? { ready } : { voices: [{ id: 'narrator' }] })))
	const provider = createChatterboxHttpProvider()
	assert.equal(await provider.probe(), false)
	ready = true
	assert.equal(await provider.probe(), true)
	assert.deepEqual(await provider.listVoices(), { voices: [{ id: 'narrator' }] })
})

test('adapter rejects invalid audio and sanitizes remote failures', async t => {
	let response = () => new Response('not a WAV')
	t.mock.method(globalThis, 'fetch', async () => response())
	const provider = createChatterboxHttpProvider()
	await assert.rejects(provider.synthesize({ text: 'Hello', voice: 'narrator' }), { code: 'NARRATION_SYNTHESIS_AUDIO_INVALID' })
	response = () => new Response('private path and traceback', { status: 500 })
	await assert.rejects(provider.synthesize({ text: 'Hello', voice: 'narrator' }), error => error.code === 'NARRATION_SYNTHESIS_RUNTIME_UNAVAILABLE' && error.retryable && !error.message.includes('private'))
	response = () => { throw new Error('secret host name') }
	await assert.rejects(provider.synthesize({ text: 'Hello', voice: 'narrator' }), error => error.code === 'NARRATION_SYNTHESIS_RUNTIME_UNAVAILABLE' && !error.message.includes('secret'))
	assert.equal(await provider.probe(), false)
})

test('adapter honors dedicated URL and sanitizes synthesis timeouts', async t => {
	const previousUrl = process.env.BETTERPPTX_CHATTERBOX_URL
	const previousTimeout = process.env.BETTERPPTX_TTS_TIMEOUT_MS
	process.env.BETTERPPTX_CHATTERBOX_URL = 'http://127.0.0.1:5001/private-runtime/'
	process.env.BETTERPPTX_TTS_TIMEOUT_MS = '10'
	t.after(() => {
		if (previousUrl === undefined) delete process.env.BETTERPPTX_CHATTERBOX_URL
		else process.env.BETTERPPTX_CHATTERBOX_URL = previousUrl
		if (previousTimeout === undefined) delete process.env.BETTERPPTX_TTS_TIMEOUT_MS
		else process.env.BETTERPPTX_TTS_TIMEOUT_MS = previousTimeout
	})
	t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
		assert.equal(url, 'http://127.0.0.1:5001/private-runtime/synthesize')
		return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('secret runtime details')), { once: true }))
	})
	await assert.rejects(createChatterboxHttpProvider().synthesize({ text: 'Hello', voice: 'narrator' }), error => error.code === 'NARRATION_SYNTHESIS_RUNTIME_TIMEOUT' && error.retryable && !error.message.includes('secret'))
})
