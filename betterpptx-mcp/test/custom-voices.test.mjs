import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { withResourceAuthorization } from '../auth/resource-authorization.mjs'
import { createCustomVoice, listCustomVoices, resolveCustomVoice, removeCustomVoice, validateVoiceSample } from '../narration/customVoices.mjs'
import { resolveVoice, listVoices } from '../narration/licenseGate.mjs'
const owner = id => ({ installHash: `install_${id.repeat(64)}` })
function wav(seconds = 3, silent = false) {
	const samples = Math.round(8000 * seconds), buffer = Buffer.alloc(44 + samples * 2)
	buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8)
	buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
	buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40)
	if (!silent) for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(2000 * Math.sin(i / 4)), 44 + i * 2)
	return buffer
}
test('private voices enforce consent, ownership, integrity, persistence and removal', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'private-voice-test-'))
	const previous = { ...process.env }
	try {
		Object.assign(process.env, { BETTERPPTX_CUSTOM_VOICE_ROOT: directory, BETTERPPTX_TTS_PROVIDER: 'chatterbox-http', BETTERPPTX_CHATTERBOX_VOICES_MANIFEST: path.join(directory, 'catalog.json') })
		fs.writeFileSync(process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST, JSON.stringify({ modelDigest: `sha256:${'a'.repeat(64)}` }))
		const args = { name: 'My private narrator', language: 'en-US', gender: 'female', sampleBuffer: wav(), consent: { speakerPermission: true, usageRights: true } }
		await assert.rejects(withResourceAuthorization(owner('a'), () => createCustomVoice({ ...args, consent: {} })), { code: 'CUSTOM_VOICE_CONSENT_REQUIRED' })
		await assert.rejects(withResourceAuthorization(owner('a'), () => createCustomVoice({ ...args, language: 'xx' })), { code: 'CUSTOM_VOICE_LANGUAGE_UNSUPPORTED' })
		const created = await withResourceAuthorization(owner('a'), () => createCustomVoice(args))
		assert.match(created.voiceId, /^voice_[a-f0-9]{64}$/)
		assert.equal(created.consentBasis, 'user-attested')
		assert.equal(created.genderSource, 'user-declared')
		assert.equal(created.durationMs, 3000)
		assert.ok(!JSON.stringify(created).includes(directory))
		assert.deepEqual(await withResourceAuthorization(owner('a'), () => createCustomVoice(args)), created)
		assert.deepEqual(withResourceAuthorization(owner('b'), () => listCustomVoices()), [])
		assert.throws(() => withResourceAuthorization(owner('b'), () => resolveCustomVoice(created.voiceId)), { code: 'CUSTOM_VOICE_NOT_FOUND' })
		await assert.rejects(withResourceAuthorization(owner('b'), () => removeCustomVoice({ voiceId: created.voiceId })), { code: 'CUSTOM_VOICE_NOT_FOUND' })
		assert.equal(withResourceAuthorization(owner('a'), () => listCustomVoices()).length, 1)
		const resolved = withResourceAuthorization(owner('a'), () => resolveCustomVoice(created.voiceId))
		assert.deepEqual(resolved.customReferenceBuffer, args.sampleBuffer)
		const profileFile = path.join(directory, fs.readdirSync(directory).find(name => name.startsWith('install-')), `${created.voiceId}.json`)
		const tampered = JSON.parse(fs.readFileSync(profileFile, 'utf8'))
		tampered.referenceWavBase64 = wav(4).toString('base64')
		fs.writeFileSync(profileFile, JSON.stringify(tampered))
		assert.throws(() => withResourceAuthorization(owner('a'), () => resolveCustomVoice(created.voiceId)), { code: 'CUSTOM_VOICE_NOT_FOUND' })
		// Removal remains available after operators switch the synthesis engine.
		process.env.BETTERPPTX_TTS_PROVIDER = 'piper-http'
		await withResourceAuthorization(owner('a'), () => removeCustomVoice({ voiceId: created.voiceId }))
		assert.ok(!fs.existsSync(profileFile))
	} finally {
		for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
		Object.assign(process.env, previous)
		fs.rmSync(directory, { recursive: true, force: true })
	}
})
test('reference samples reject silence, truncation, incorrect PCM headers and duration bounds', () => {
	for (const bytes of [wav(2), wav(31), wav(3 - 1 / 8000), wav(30 + 1 / 8000), wav(3, true), wav().subarray(0, 100), Buffer.from('not audio')]) assert.throws(() => validateVoiceSample(bytes), { code: 'CUSTOM_VOICE_SAMPLE_INVALID' })
	const bad = wav(); bad.writeUInt32LE(44, 28)
	assert.throws(() => validateVoiceSample(bad), { code: 'CUSTOM_VOICE_SAMPLE_INVALID' })
	assert.equal(validateVoiceSample(wav()).channels, 1)
})

test('private profiles enforce current model identity and variant languages without leaking configuration', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'private-voice-model-'))
	const previous = { ...process.env }
	try {
		Object.assign(process.env, { BETTERPPTX_CUSTOM_VOICE_ROOT: directory, BETTERPPTX_TTS_PROVIDER: 'chatterbox-http', BETTERPPTX_CHATTERBOX_VOICES_MANIFEST: path.join(directory, 'catalog.json') })
		const configure = values => fs.writeFileSync(process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST, JSON.stringify({ voices: [], ...values }))
		const firstDigest = `sha256:${'a'.repeat(64)}`
		configure({ provider: 'chatterbox-http', modelDigest: firstDigest })
		const args = { name: 'Private speaker', language: 'en', sampleBuffer: wav(), consent: { speakerPermission: true, usageRights: true } }
		await assert.rejects(withResourceAuthorization(owner('a'), () => createCustomVoice({ ...args, language: 'fr' })), { code: 'CUSTOM_VOICE_LANGUAGE_UNSUPPORTED' })
		const created = await withResourceAuthorization(owner('a'), () => createCustomVoice(args))
		assert.deepEqual(created.languages, ['en'])
		assert.throws(() => withResourceAuthorization(owner('a'), () => resolveVoice({ voice: created.voiceId, lang: 'fr', provider: 'chatterbox-http' })), /does not support the requested language/)
		assert.equal(withResourceAuthorization(owner('a'), () => resolveCustomVoice(created.voiceId)).modelDigest, firstDigest)
		configure({ provider: 'chatterbox-http', modelDigest: `sha256:${'b'.repeat(64)}`, modelVariant: 'multilingual' })
		assert.throws(() => withResourceAuthorization(owner('a'), () => resolveCustomVoice(created.voiceId)), error => error.code === 'CUSTOM_VOICE_MODEL_CHANGED' && !error.message.includes(directory))
		const replacement = await withResourceAuthorization(owner('a'), () => createCustomVoice(args))
		assert.notEqual(replacement.voiceId, created.voiceId)
		assert.equal(replacement.language, 'en')
		assert.equal(replacement.languages.length, 23)
		for (const target of ['en', 'fr-FR', 'ar', 'sw-KE']) {
			const resolved = withResourceAuthorization(owner('a'), () => resolveVoice({ voice: replacement.voiceId, lang: target, provider: 'chatterbox-http' }))
			assert.equal(resolved.voice.id, replacement.voiceId)
			assert.ok(resolved.voice.languages.includes(target.split('-')[0]))
		}
		for (const target of ['xx', 'fr-invalid']) assert.throws(() => withResourceAuthorization(owner('a'), () => resolveVoice({ voice: replacement.voiceId, lang: target, provider: 'chatterbox-http' })), /does not support the requested language/)
		const frenchCatalog = withResourceAuthorization(owner('a'), () => listVoices({ language: 'fr', provider: 'chatterbox-http' }))
		assert.ok(frenchCatalog.voices.some(voice => voice.id === replacement.voiceId && voice.languages.includes('fr')))
		const french = await withResourceAuthorization(owner('a'), () => createCustomVoice({ ...args, language: 'fr-FR' }))
		assert.equal(withResourceAuthorization(owner('a'), () => resolveCustomVoice(french.voiceId)).languages.length, 23)
		configure({ provider: 'piper-http', modelDigest: firstDigest })
		await assert.rejects(withResourceAuthorization(owner('a'), () => createCustomVoice(args)), error => error.code === 'CUSTOM_VOICES_UNAVAILABLE' && !error.message.includes(directory))
	} finally {
		for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
		Object.assign(process.env, previous)
		fs.rmSync(directory, { recursive: true, force: true })
	}
})

test('private voice creation and removal sanitize storage failures while preserving policy errors', async t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'private-voice-failure-'))
	const previous = { ...process.env }
	try {
		Object.assign(process.env, { BETTERPPTX_CUSTOM_VOICE_ROOT: directory, BETTERPPTX_TTS_PROVIDER: 'chatterbox-http', BETTERPPTX_CHATTERBOX_VOICES_MANIFEST: path.join(directory, 'catalog.json') })
		fs.writeFileSync(process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST, JSON.stringify({ modelDigest: `sha256:${'a'.repeat(64)}` }))
		const args = { name: 'Existing voice', language: 'en', sampleBuffer: wav(), consent: { speakerPermission: true, usageRights: true } }
		const created = await withResourceAuthorization(owner('a'), () => createCustomVoice(args))
		const isSafe = error => error.code === 'CUSTOM_VOICE_STORE_UNAVAILABLE' && error.retryable === true
			&& !/private-voices|install-owner|EACCES|ESTALE/.test(error.message) && !error.path && !error.cause
		for (const [method, code] of [['mkdirSync', 'EACCES'], ['writeFileSync', 'ESTALE']]) {
			const mock = t.mock.method(fs, method, () => { const error = new Error(`${code}: storage failure, open '/private-voices/voice-profiles/install-owner/voice_example.json'`); error.code = code; error.path = '/private-voices/voice-profiles/install-owner/voice_example.json'; throw error })
			try {
				await assert.rejects(withResourceAuthorization(owner('a'), () => createCustomVoice({ ...args, name: `Fail at ${method}` })), isSafe)
			} finally { mock.mock.restore() }
		}
		const unlink = t.mock.method(fs, 'unlinkSync', () => { const error = new Error("ESTALE: stale file handle, unlink '/private-voices/voice-profiles/install-owner/voice_example.json'"); error.code = 'ESTALE'; throw error })
		try {
			await assert.rejects(withResourceAuthorization(owner('a'), () => removeCustomVoice({ voiceId: created.voiceId })), isSafe)
		} finally { unlink.mock.restore() }
		await assert.rejects(withResourceAuthorization(owner('a'), () => createCustomVoice({ ...args, consent: {} })), { code: 'CUSTOM_VOICE_CONSENT_REQUIRED' })
		await assert.rejects(withResourceAuthorization(owner('b'), () => removeCustomVoice({ voiceId: created.voiceId })), { code: 'CUSTOM_VOICE_NOT_FOUND' })
	} finally {
		for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
		Object.assign(process.env, previous)
		fs.rmSync(directory, { recursive: true, force: true })
	}
})
