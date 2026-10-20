import assert from 'node:assert/strict'
import test from 'node:test'
import { createPiperHttpProvider } from '../narration/providers/piperHttp.mjs'

const jwt = exp => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`

function withEnv(values, fn) {
	const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
	Object.assign(process.env, values)
	return Promise.resolve(fn()).finally(() => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	})
}

test('a private Cloud Run narration runtime is called with the service identity token', () => withEnv({
	BETTERPPTX_TTS_URL: 'https://betterpptx-narration-abc-uc.a.run.app',
	BETTERPPTX_TTS_AUTH: 'cloud-run',
}, async () => {
	const originalFetch = globalThis.fetch
	const calls = []
	globalThis.fetch = async (url, options = {}) => {
		calls.push({ url: String(url), headers: options.headers || {} })
		if (String(url).startsWith('http://metadata.google.internal/')) return new Response(jwt(Math.floor(Date.now() / 1000) + 3600))
		if (String(url).endsWith('/voices')) return Response.json([{ id: 'en_US-ljspeech-high' }])
		return new Response(Buffer.from('RIFF'), { headers: { 'Content-Type': 'audio/wav' } })
	}
	try {
		const provider = createPiperHttpProvider()
		assert.equal(await provider.probe(), true)
		const audio = await provider.synthesize({ text: 'Hello', voice: 'en_US-ljspeech-high' })
		assert.equal(audio.wav.toString(), 'RIFF')
		const metadata = calls.filter(call => call.url.startsWith('http://metadata.google.internal/'))
		assert.equal(metadata.length, 1, 'the identity token is cached across calls')
		assert.match(metadata[0].url, /audience=https%3A%2F%2Fbetterpptx-narration-abc-uc\.a\.run\.app/)
		const runtimeCalls = calls.filter(call => call.url.startsWith('https://betterpptx-narration-abc-uc.a.run.app'))
		assert.deepEqual(runtimeCalls.map(call => call.url), ['https://betterpptx-narration-abc-uc.a.run.app/voices', 'https://betterpptx-narration-abc-uc.a.run.app/'])
		for (const call of runtimeCalls) assert.match(call.headers['X-Serverless-Authorization'], /^Bearer h\./)
	} finally {
		globalThis.fetch = originalFetch
	}
}))

test('Cloud Run narration authentication refuses a non-Cloud Run runtime URL', () => withEnv({
	BETTERPPTX_TTS_URL: 'http://127.0.0.1:5000',
	BETTERPPTX_TTS_AUTH: 'cloud-run',
}, () => {
	assert.throws(() => createPiperHttpProvider(), /run\.app/)
}))

test('the local Piper runtime is called without any identity header', () => withEnv({
	BETTERPPTX_TTS_URL: 'http://127.0.0.1:5000',
	BETTERPPTX_TTS_AUTH: '',
}, async () => {
	const originalFetch = globalThis.fetch
	let seen
	globalThis.fetch = async (_url, options) => { seen = options.headers; return Response.json([]) }
	try {
		assert.equal(await createPiperHttpProvider().probe(), true)
		assert.equal(seen['X-Serverless-Authorization'], undefined)
	} finally {
		globalThis.fetch = originalFetch
	}
}))
