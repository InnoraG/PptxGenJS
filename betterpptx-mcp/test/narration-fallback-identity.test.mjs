import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { resolveFallbackIdentity, resolveExplicitLegacyIdentity, approvedLegacyVoices } from '../narration/providers/fallbackIdentity.mjs'
import { createChatterboxHttpProvider } from '../narration/providers/chatterboxHttp.mjs'
import { listVoices, resolveVoice, loadVoiceManifest } from '../narration/licenseGate.mjs'
import { synthesizeNarration } from '../narration/service.mjs'

async function fixture(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-fallback-'))
	const file = path.join(root, 'mapping.json')
	await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, mappings: {
		'narrator-en-female': { voice: 'en_US-ljspeech-high' },
		'narrator-en-male': { voice: 'en_US-norman-medium' },
		'narrator-fr-female': { voice: 'fr_FR-mls-medium', speaker: 88 },
	} }))
	const env = {
		BETTERPPTX_TTS_FALLBACK_MAP: file, BETTERPPTX_TTS_LEGACY_FALLBACK: '1',
		BETTERPPTX_CHATTERBOX_VOICES_MANIFEST: new URL('../deploy/narration/chatterbox/runtime-manifest.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
		BETTERPPTX_TTS_PROVIDER: 'chatterbox-http', BETTERPPTX_TTS_AUTH: '', BETTERPPTX_NARRATION_MODE: 'production',
	}
	const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]))
	Object.assign(process.env, env)
	t.after(async () => { for (const [k, v] of Object.entries(saved)) if (v == null) delete process.env[k]; else process.env[k] = v; await fs.rm(root, { recursive: true, force: true }) })
	return root
}
const headers = (voice, speaker) => new Headers({ 'X-Speech-Fallback': '1', 'X-Speech-Voice-Id': voice, ...(speaker == null ? {} : { 'X-Speech-Speaker': String(speaker) }) })
const requested = (language = 'en', gender = 'female') => ({ id: `narrator-${language}-${gender}`, language, gender })

test('fallback requires an approved mapping, matching language, gender, and exact speaker', async t => {
	await fixture(t)
	assert.equal(resolveFallbackIdentity(new Headers(), requested()), null)
	const en = resolveFallbackIdentity(headers('en_US-ljspeech-high'), requested(), 'en-US')
	assert.equal(en.voice.id, 'en_US-ljspeech-high')
	assert.equal(en.provider, 'piper-http')
	assert.equal(en.fallbackUsed, true)
	assert.match(en.voice.modelDigest, /^sha256:[a-f0-9]{64}$/)
	const fr = resolveFallbackIdentity(headers('fr_FR-mls-medium', 88), requested('fr'), 'fr')
	assert.equal(fr.voice.gender, 'female')
	assert.equal(fr.voice.speaker, 88)
	assert.equal(fr.license.attributionRequired, true)
	assert.match(fr.license.attribution, /Multilingual LibriSpeech/)
	for (const [h, v, lang] of [
		[headers('en_US-norman-medium'), requested(), 'en'],
		[headers('fr_FR-mls-medium', 8), requested('fr'), 'fr'],
		[headers('fr_FR-mls-medium', 88), requested('fr'), 'ar'],
		[headers('en_US-ljspeech-high'), { ...requested(), scope: 'private' }, 'en'],
		[headers('en_US-ljspeech-high'), requested('ar'), 'ar'],
	]) assert.throws(() => resolveFallbackIdentity(h, v, lang), { code: 'NARRATION_SYNTHESIS_AUDIO_INVALID' })
})

test('actual fallback identity and attribution reach stored narration; V3 identity is not retained', async t => {
	await fixture(t)
	const rate = 24000, n = rate / 2
	const wav = Buffer.alloc(44 + n * 2)
	wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
	wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24)
	wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40)
	for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 200 / rate) * 2500), 44 + i * 2)
	t.mock.method(globalThis, 'fetch', async () => new Response(wav, { headers: headers('fr_FR-mls-medium', 88) }))
	const adapter = await createChatterboxHttpProvider().synthesize({ text: 'Bonjour.', voice: requested('fr'), language: 'fr' })
	assert.equal(adapter.voice.speaker, 88)
	const result = await synthesizeNarration({ text: 'Bonjour.', voice: 'narrator-fr-female', lang: 'fr', gender: 'female' })
	t.after(() => fs.rm(result.wavPath, { force: true }))
	assert.equal(result.voice.id, 'fr_FR-mls-medium')
	assert.equal(result.voice.gender, 'female')
	assert.equal(result.voice.speaker, 88)
	assert.equal(result.provider, 'piper-http')
	assert.equal(result.license.attributionRequired, true)
	assert.equal(result.ttsExecution.fallbackUsed, true)
	assert.equal(result.ttsExecution.referenceDigest, null)
	assert.equal(result.ttsExecution.requestedVoiceId, 'narrator-fr-female')
	assert.ok(result.warnings.some(w => w.startsWith('NARRATION_FALLBACK_USED')))
})

test('primary catalogue retains every approved legacy ID, truthful model identities, and language defaults', async t => {
	await fixture(t)
	process.env.BETTERPPTX_TTS_LEGACY_FALLBACK = '0'
	assert.equal(listVoices().voices.length, 8)
	assert.throws(() => resolveVoice({ voice: 'fr_FR-mls-medium' }), /No narration voice/)
	process.env.BETTERPPTX_TTS_LEGACY_FALLBACK = '1'
	const voices = listVoices().voices
	const legacy = approvedLegacyVoices()
	assert.equal(legacy.length, 51)
	assert.equal(voices.length, 59)
	for (const old of legacy) {
		assert.ok(voices.some(v => v.id === old.id), old.id)
		const resolved = resolveVoice({ voice: old.id }).voice
		assert.equal(resolved.privateFallbackRoute, true)
		assert.equal(resolved.modelDigest, `sha256:${old.modelSha256}`)
		assert.equal(resolved.referenceDigest, null)
	}
	for (const lang of ['en', 'fr', 'ar', 'sw']) assert.match(resolveVoice({ lang }).voice.id, new RegExp(`^narrator-${lang}-`))
	assert.match(resolveVoice({ lang: 'en-GB' }).voice.id, /^narrator-en-/)
	assert.equal(resolveVoice({ lang: 'de' }).voice.id, resolveVoice({ lang: 'de', provider: 'piper-http' }).voice.id)
	const fr = resolveVoice({ voice: 'fr_FR-mls-medium', gender: 'female' })
	assert.equal(fr.speaker, 88)
	assert.throws(() => resolveVoice({ voice: 'fr_FR-mls-medium', gender: 'female', speaker: 8 }), /not a female/)
	assert.ok(voices.every(v => !('privateFallbackRoute' in v)))
	// Primary-provider catalogue mismatches still fail before legacy merging.
	const file = process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST
	process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST = new URL('../narration/voices/runtime-manifest.production.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
	assert.throws(() => loadVoiceManifest(), /does not match/)
	process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST = file
})

test('explicit legacy response identity cannot alias another voice, speaker, language, or private sample', async t => {
	await fixture(t)
	const voice = resolveVoice({ voice: 'fr_FR-mls-medium', gender: 'female' }).voice
	const h = new Headers({ 'X-Speech-Fallback': '0', 'X-Speech-Selection': 'explicit', 'X-Speech-Voice-Id': voice.id, 'X-Speech-Speaker': '88' })
	const result = resolveExplicitLegacyIdentity(h, voice, 'fr-FR', 88)
	assert.equal(result.fallbackUsed, false)
	assert.equal(result.voice.gender, 'female')
	assert.equal(result.license.attributionRequired, true)
	for (const [name, value] of [['X-Speech-Fallback','1'], ['X-Speech-Selection','automatic'], ['X-Speech-Voice-Id','en_US-ljspeech-high'], ['X-Speech-Speaker','8']]) {
		const bad = new Headers(h); bad.set(name, value)
		assert.throws(() => resolveExplicitLegacyIdentity(bad, voice, 'fr', 88), { code: 'NARRATION_SYNTHESIS_AUDIO_INVALID' })
	}
	for (const v of [{ ...voice, scope: 'private' }, { ...voice, modelDigest: 'sha256:wrong' }, { ...voice, customReferenceBuffer: Buffer.from('sample') }]) assert.throws(() => resolveExplicitLegacyIdentity(h, v, 'fr', 88))
	assert.throws(() => resolveExplicitLegacyIdentity(h, voice, 'de', 88))
})

test('explicit legacy adapter supports Piper controls and records actual identity without outage warning', async t => {
	await fixture(t)
	const rate = 24000, n = rate / 2
	const wav = Buffer.alloc(44 + n * 2)
	wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
	wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24)
	wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40)
	for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 200 / rate) * 2500), 44 + i * 2)
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		assert.ok(url.endsWith('/fallback/synthesize'))
		assert.deepEqual(JSON.parse(options.body), { text: 'Bonjour.', voice: 'fr_FR-mls-medium', speaker: 88, length_scale: 1.1, noise_scale: 0.4, noise_w_scale: 0.5 })
		return new Response(wav, { headers: { 'X-Speech-Fallback': '0', 'X-Speech-Selection': 'explicit', 'X-Speech-Voice-Id': 'fr_FR-mls-medium', 'X-Speech-Speaker': '88' } })
	})
	const result = await synthesizeNarration({ text: 'Bonjour.', voice: 'fr_FR-mls-medium', lang: 'fr', gender: 'female', lengthScale: 1.1, noiseScale: 0.4, noiseWScale: 0.5 })
	t.after(() => fs.rm(result.wavPath, { force: true }))
	assert.equal(result.provider, 'piper-http'); assert.equal(result.voice.id, 'fr_FR-mls-medium'); assert.equal(result.voice.speaker, 88)
	assert.equal(result.ttsExecution.referenceDigest, null)
	assert.match(result.ttsExecution.modelDigest, /^sha256:[a-f0-9]{64}$/)
	assert.equal(result.ttsExecution.fallbackUsed, undefined)
	assert.ok(result.warnings.includes('ATTRIBUTION_REQUIRED'))
	assert.ok(!result.warnings.some(w => w.startsWith('NARRATION_FALLBACK_USED')))
})

test('legacy route requires explicit enablement and rejects invalid controls without network calls', async t => {
	await fixture(t)
	const voice = resolveVoice({ voice: 'fr_FR-mls-medium', gender: 'female' }).voice
	let calls = 0
	t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('must not call') })
	const provider = createChatterboxHttpProvider()
	for (const controls of [{ lengthScale: 0 }, { noiseScale: Infinity }, { noiseWScale: -1 }, { speaker: 125 }, { speaker: 0.5 }]) await assert.rejects(provider.synthesize({ text: 'Bonjour.', voice, ...controls }), { code: 'NARRATION_SYNTHESIS_UNSUPPORTED_SETTINGS' })
	process.env.BETTERPPTX_TTS_LEGACY_FALLBACK = '0'
	await assert.rejects(provider.synthesize({ text: 'Bonjour.', voice }), { code: 'NARRATION_SYNTHESIS_INVALID_VOICE' })
	assert.equal(calls, 0)
})

test('explicit valid legacy speaker indices retain mixed gender when no curated profile exists', async t => {
	await fixture(t)
	const voice = resolveVoice({ voice: 'fr_FR-mls-medium', speaker: 13 }).voice
	const result = resolveExplicitLegacyIdentity(new Headers({ 'X-Speech-Fallback': '0', 'X-Speech-Selection': 'explicit', 'X-Speech-Voice-Id': voice.id, 'X-Speech-Speaker': '13' }), voice, 'fr', 13)
	assert.equal(result.voice.speaker, 13)
	assert.equal(result.voice.gender, 'mixed')
	assert.throws(() => resolveVoice({ voice: voice.id, speaker: 13, gender: 'female' }), /not a female profile/)
})
