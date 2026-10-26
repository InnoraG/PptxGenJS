import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadVoiceManifest, resolveVoice, listVoices } from '../narration/licenseGate.mjs'
import { prepareNarrationAudio } from '../narration/preparation.mjs'
import { writeToneWav } from '../narration/audio.mjs'
import { synthesizeNarration } from '../narration/service.mjs'
import { sanitizePublicResult } from '../blackbox.mjs'
import { findTechStackInText } from '../blackbox-vocabulary.mjs'

async function fixture(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-cb-manifest-'))
	const keys = ['BETTERPPTX_CHATTERBOX_VOICES_MANIFEST', 'BETTERPPTX_RUNTIME_VOICES_MANIFEST', 'BETTERPPTX_VOICES_MANIFEST', 'BETTERPPTX_TTS_PROVIDER', 'BETTERPPTX_TTS_RUNTIME_VERSION']
	const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
	for (const key of keys) delete process.env[key]
	t.after(async () => {
		for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]
		await fs.rm(root, { recursive: true, force: true })
	})
	const manifest = path.join(root, 'voices.json')
	const voice = { id: 'cb-default-en', language: 'en', locale: 'en-US', isDefaultForLocale: true, commercialUse: 'allowed', reviewStatus: 'approved' }
	const write = data => fs.writeFile(manifest, JSON.stringify(data))
	return { root, manifest, voice, write }
}

test('Chatterbox never falls back to the Piper catalog or an undeclared runtime catalog', async t => {
	const { manifest, voice, write } = await fixture(t)
	assert.throws(() => loadVoiceManifest({ provider: 'chatterbox' }), /requires its own/)
	await write({ voices: [voice] })
	process.env.BETTERPPTX_RUNTIME_VOICES_MANIFEST = manifest
	assert.throws(() => loadVoiceManifest({ provider: 'chatterbox-http' }), /does not match/)
	await write({ provider: 'chatterbox-http', voices: [voice] })
	assert.equal(resolveVoice({ provider: 'chatterbox' }).voice.id, 'cb-default-en')
	assert.throws(() => resolveVoice({ provider: 'piper-http' }), /does not match/)
})

test('dedicated manifest preserves declared model/reference digests without inventing hashes', async t => {
	const { manifest, voice, write } = await fixture(t)
	process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST = manifest
	process.env.BETTERPPTX_TTS_PROVIDER = 'chatterbox-http'
	await write({ provider: 'chatterbox-http', voices: [voice] })
	assert.equal(listVoices().voices[0].id, voice.id)
	assert.equal(resolveVoice().voice.modelDigest, null)
	assert.equal(resolveVoice().voice.referenceDigest, null)
	await write({ provider: 'chatterbox-http', modelDigest: 'sha256:model-fixture', voices: [{ ...voice, referenceDigest: 'sha256:reference-fixture' }] })
	assert.equal(resolveVoice().voice.modelDigest, 'sha256:model-fixture')
	assert.equal(resolveVoice().voice.referenceDigest, 'sha256:reference-fixture')
	await write({ provider: 'chatterbox-http', voices: [{ ...voice, provider: 'piper-http' }] })
	assert.throws(() => resolveVoice(), /does not match/)
})

test('preparation identity changes with provider, runtime version, and catalog identity', async t => {
	const { root, manifest, voice, write } = await fixture(t)
	const source = path.join(root, 'fixture.wav')
	writeToneWav(source, 0.1)
	const generated = []
	t.after(async () => { for (const file of generated) await fs.rm(file, { force: true }) })
	const prepare = async provider => {
		const result = await prepareNarrationAudio({ provider, text: 'Identical text.' }, { synthesize: async () => ({ wavPath: source, voice: { id: 'fixture' } }) })
		generated.push(result.assembled.filePath)
		return result.requestDigest
	}
	const piperDigest = await prepare('piper-http')
	process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST = manifest
	await write({ provider: 'chatterbox-http', voices: [voice] })
	const first = await prepare('chatterbox-http')
	assert.notEqual(first, piperDigest)
	assert.equal(first, await prepare('chatterbox'))
	process.env.BETTERPPTX_TTS_RUNTIME_VERSION = 'test-v2'
	assert.notEqual(first, await prepare('chatterbox-http'))
	delete process.env.BETTERPPTX_TTS_RUNTIME_VERSION
	await write({ provider: 'chatterbox-http', modelDigest: 'sha256:new-model-fixture', voices: [voice] })
	assert.notEqual(first, await prepare('chatterbox-http'))
})

test('service reports only declared model hashes and includes runtime/model/reference in settings identity', async t => {
	const { root, manifest, voice, write } = await fixture(t)
	process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST = manifest
	await write({ provider: 'chatterbox-http', voices: [voice] })
	const source = path.join(root, 'service.wav')
	writeToneWav(source, 0.3)
	const bytes = await fs.readFile(source)
	t.mock.method(globalThis, 'fetch', async () => new Response(bytes))
	const generated = []
	t.after(async () => { for (const file of generated) await fs.rm(file, { force: true }) })
	const run = async () => {
		const result = await synthesizeNarration({ provider: 'chatterbox-http', text: 'A test narration.', voice: voice.id })
		generated.push(result.wavPath)
		return result.ttsExecution
	}
	const initial = await run()
	assert.equal(initial.modelDigest, null)
	assert.equal(initial.referenceDigest, null)
	process.env.BETTERPPTX_TTS_RUNTIME_VERSION = 'fixture-v2'
	assert.notEqual((await run()).deterministicSettingsDigest, initial.deterministicSettingsDigest)
	delete process.env.BETTERPPTX_TTS_RUNTIME_VERSION
	await write({ provider: 'chatterbox-http', modelDigest: 'sha256:declared-model-fixture', voices: [{ ...voice, referenceDigest: 'sha256:declared-reference-fixture' }] })
	const updated = await run()
	assert.equal(updated.modelDigest, 'sha256:declared-model-fixture')
	assert.equal(updated.referenceDigest, 'sha256:declared-reference-fixture')
	assert.notEqual(updated.deterministicSettingsDigest, initial.deterministicSettingsDigest)
})

test('public narration results hide engine and licensing provenance', t => {
	const previous = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	t.after(() => { if (previous === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX; else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previous })
	const sanitized = sanitizePublicResult({ provider: 'chatterbox-http', license: { source: 'https://example.test/chatterbox' }, message: 'Chatterbox TTS is unavailable.' })
	assert.equal(sanitized.provider, undefined)
	assert.equal(sanitized.license, undefined)
	assert.doesNotMatch(sanitized.message, /chatterbox/i)
	assert.ok(findTechStackInText('chatterbox-http').length > 0)
})

test('service forwards segment language for one approved multilingual speaker and hashes that language', async t => {
	const { root, manifest, voice, write } = await fixture(t)
	process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST = manifest
	await write({ provider: 'chatterbox-http', voices: [{ ...voice, languages: ['en', 'fr'] }] })
	const source = path.join(root, 'language.wav')
	writeToneWav(source, 0.3)
	const bytes = await fs.readFile(source)
	const languages = []
	t.mock.method(globalThis, 'fetch', async (url, options) => { languages.push(JSON.parse(options.body).language); return new Response(bytes) })
	const generated = []
	t.after(async () => { for (const file of generated) await fs.rm(file, { force: true }) })
	const identities = []
	for (const lang of ['en', 'fr']) {
		const result = await synthesizeNarration({ provider: 'chatterbox-http', text: 'Same text.', voice: voice.id, lang })
		generated.push(result.wavPath)
		identities.push(result.ttsExecution.deterministicSettingsDigest)
	}
	assert.deepEqual(languages, ['en', 'fr'])
	assert.notEqual(identities[0], identities[1])
})
