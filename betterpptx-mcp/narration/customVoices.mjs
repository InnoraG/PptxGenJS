import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { currentResourceOwner, bindNewResourceOwner, assertResourceAccess } from '../auth/resource-authorization.mjs'

export const MAX_VOICE_SAMPLE_BYTES = 8 * 1024 * 1024
const LANGUAGES = new Set('ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh'.split(' '))
const ID = /^voice_[a-f0-9]{64}$/
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
function fail(code, message) { const error = new Error(message); error.code = code; throw error }
function storageFailure(error) {
	if (/^(?:CUSTOM_|RESOURCE_)/.test(String(error?.code || ''))) throw error
	const safe = new Error('The private voice store is temporarily unavailable. Retry the same request later.')
	safe.code = 'CUSTOM_VOICE_STORE_UNAVAILABLE'
	safe.retryable = true
	throw safe
}
function unavailable() { fail('CUSTOM_VOICE_NOT_FOUND', 'The private voice is unavailable.') }
export function isCustomVoiceId(value) { return typeof value === 'string' && ID.test(value) }
export function customVoicesEnabled() {
	return ['chatterbox', 'chatterbox-http'].includes(String(process.env.BETTERPPTX_TTS_PROVIDER || '').toLowerCase()) && Boolean(process.env.BETTERPPTX_CUSTOM_VOICE_ROOT)
}
function ownerDirectory() {
	if (!process.env.BETTERPPTX_CUSTOM_VOICE_ROOT) fail('CUSTOM_VOICES_UNAVAILABLE', 'Private sample-based voices are not enabled in this deployment.')
	const owner = currentResourceOwner()
	return path.join(path.resolve(process.env.BETTERPPTX_CUSTOM_VOICE_ROOT), `${owner.kind}-${owner.id}`)
}
export function validateVoiceSample(buffer) {
	const bad = () => fail('CUSTOM_VOICE_SAMPLE_INVALID', 'Use a non-silent PCM16 WAV recording of 3–30 seconds, with one or two channels at 8–48 kHz and at most 8 MiB.')
	if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.length > MAX_VOICE_SAMPLE_BYTES || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(4) !== buffer.length - 8) bad()
	let format, audio
	for (let offset = 12; offset < buffer.length;) {
		if (offset + 8 > buffer.length) bad()
		const kind = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8
		if (start + size > buffer.length) bad()
		if (kind === 'fmt ') {
			if (format || size < 16) bad()
			format = { encoding: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), byteRate: buffer.readUInt32LE(start + 8), alignment: buffer.readUInt16LE(start + 12), bits: buffer.readUInt16LE(start + 14) }
		}
		if (kind === 'data') { if (audio) bad(); audio = buffer.subarray(start, start + size) }
		offset = start + size + (size % 2)
		if (offset > buffer.length) bad()
	}
	if (!format || !audio || format.encoding !== 1 || ![1, 2].includes(format.channels) || format.bits !== 16 || format.sampleRate < 8000 || format.sampleRate > 48000 || format.alignment !== format.channels * 2 || format.byteRate !== format.sampleRate * format.alignment || audio.length % format.alignment) bad()
	if (audio.length < 3 * format.byteRate || audio.length > 30 * format.byteRate) bad()
	const durationMs = Math.round(audio.length / format.byteRate * 1000)
	let energy = 0
	for (let offset = 0; offset < audio.length; offset += 2) energy += (audio.readInt16LE(offset) / 32768) ** 2
	if (!audio.length || Math.sqrt(energy / (audio.length / 2)) <= 0.0001) bad()
	return { durationMs, sampleRate: format.sampleRate, channels: format.channels, referenceDigest: `sha256:${sha(buffer)}` }
}
function publicVoice(record) {
	return { id: record.id, voiceId: record.id, name: record.name, language: record.language, locale: record.language, languages: [...(record.languages || [record.language.slice(0, 2)])], ...(record.gender ? { gender: record.gender, genderSource: 'user-declared' } : {}), durationMs: record.durationMs, scope: 'private', consentBasis: 'user-attested' }
}
function configuredModel() {
	let config
	try { config = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST, 'utf8')) } catch { fail('CUSTOM_VOICES_UNAVAILABLE', 'The private voice model configuration is unavailable.') }
	if (!/^sha256:[a-f0-9]{64}$/.test(config?.modelDigest || '')
		|| (config.provider && !['chatterbox', 'chatterbox-http'].includes(config.provider))
		|| !['english', 'multilingual'].includes(config.modelVariant || 'english')) fail('CUSTOM_VOICES_UNAVAILABLE', 'The private voice model configuration is unavailable.')
	const variant = config.modelVariant || 'english'
	return { digest: config.modelDigest, variant, languages: variant === 'multilingual' ? [...LANGUAGES].sort() : ['en'] }
}
function readRecord(voiceId) {
	if (!isCustomVoiceId(voiceId)) unavailable()
	let record
	try {
		const file = path.join(ownerDirectory(), `${voiceId}.json`)
		if (fs.statSync(file).size > 12 * 1024 * 1024) unavailable()
		record = JSON.parse(fs.readFileSync(file, 'utf8'))
	} catch (error) { if (error.code === 'CUSTOM_VOICES_UNAVAILABLE' || error.code === 'RESOURCE_IDENTITY_REQUIRED') throw error; unavailable() }
	assertResourceAccess(record)
	if (record.id !== voiceId || !/^sha256:[a-f0-9]{64}$/.test(record.referenceDigest || '')) unavailable()
	return record
}
export function listCustomVoices() {
	if (!customVoicesEnabled()) return []
	const directory = ownerDirectory()
	if (!fs.existsSync(directory)) return []
	return fs.readdirSync(directory).filter(name => /^voice_[a-f0-9]{64}\.json$/.test(name)).map(name => readRecord(name.slice(0, -5))).map(publicVoice)
}
async function createCustomVoiceInternal({ name, sampleBuffer, language, gender, consent } = {}) {
	if (!customVoicesEnabled()) fail('CUSTOM_VOICES_UNAVAILABLE', 'Private sample-based voices are not enabled in this deployment.')
	const directory = ownerDirectory()
	if (consent?.speakerPermission !== true || consent?.usageRights !== true) fail('CUSTOM_VOICE_CONSENT_REQUIRED', 'Confirm permission from the speaker and rights to use this recording for speech generation.')
	if (typeof name !== 'string' || !name.trim() || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) fail('CUSTOM_VOICE_NAME_INVALID', 'Give the private voice a name of 1–80 characters.')
	if (typeof language !== 'string' || !/^[a-z]{2}(?:[-_][A-Za-z]{2})?$/.test(language) || !LANGUAGES.has(language.slice(0, 2))) fail('CUSTOM_VOICE_LANGUAGE_UNSUPPORTED', 'The requested private voice language is unsupported.')
	if (gender != null && !['female', 'male'].includes(gender)) fail('CUSTOM_VOICE_GENDER_INVALID', 'Omit gender or select female or male.')
	const evidence = validateVoiceSample(sampleBuffer)
	const model = configuredModel()
	if (model.variant === 'english' && language.slice(0, 2) !== 'en') fail('CUSTOM_VOICE_LANGUAGE_UNSUPPORTED', 'The configured voice service does not support the requested language.')
	const modelDigest = model.digest
	const languages = model.languages
	const id = `voice_${sha(JSON.stringify([currentResourceOwner(), evidence.referenceDigest, name.trim(), language, gender || null, modelDigest, languages]))}`
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
	const recordFile = path.join(directory, `${id}.json`)
	if (fs.existsSync(recordFile)) return publicVoice(readRecord(id))
	if (listCustomVoices().length >= 16) fail('CUSTOM_VOICE_LIMIT', 'This private voice collection has reached its limit of 16 voices. Remove a voice before adding another.')
	// One private object keeps sample and metadata together on local or mounted
	// object storage. Removing a profile cannot delete another profile's sample.
	const record = bindNewResourceOwner({ schemaVersion: 'betterpptx.private-voice.v1', id, name: name.trim(), language, languages, gender, ...evidence, referenceWavBase64: sampleBuffer.toString('base64'), modelDigest, consent: { speakerPermission: true, usageRights: true, basis: 'user-attested', recordedAt: new Date().toISOString() }, createdAt: new Date().toISOString() })
	fs.writeFileSync(recordFile, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 })
	return publicVoice(record)
}
export async function createCustomVoice(args = {}) {
	try { return await createCustomVoiceInternal(args) } catch (error) { storageFailure(error) }
}
export function resolveCustomVoice(voiceId) {
	const record = readRecord(voiceId)
	const model = configuredModel()
	const languages = record.languages || [String(record.language || '').slice(0, 2)]
	if (record.modelDigest !== model.digest || !Array.isArray(languages) || !languages.length || languages.some(language => !model.languages.includes(language))) fail('CUSTOM_VOICE_MODEL_CHANGED', 'This private voice belongs to a different speech model. Create it again using the current voice service.')
	let bytes
	try { bytes = Buffer.from(record.referenceWavBase64, 'base64') } catch { unavailable() }
	if (`sha256:${sha(bytes)}` !== record.referenceDigest) unavailable()
	return { ...publicVoice(record), provider: 'chatterbox-http', customReferenceBuffer: bytes, referenceDigest: record.referenceDigest, modelDigest: record.modelDigest, languages: [...languages], quality: 'reference-conditioned', reviewStatus: 'user-authorized', commercialUse: 'user-attested', license: 'User-authorized recording', consentBasis: 'user-attested' }
}
async function removeCustomVoiceInternal({ voiceId } = {}) {
	readRecord(voiceId)
	const directory = ownerDirectory()
	fs.unlinkSync(path.join(directory, `${voiceId}.json`))
	return { removed: true, voiceId }
}
export async function removeCustomVoice(args = {}) {
	try { return await removeCustomVoiceInternal(args) } catch (error) { storageFailure(error) }
}
