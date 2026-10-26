import fs from 'node:fs'
import { enrichVoiceWithProfile } from '../voiceProfiles.mjs'

function invalid() {
	const error = new Error('The narration fallback identity could not be verified.')
	error.code = 'NARRATION_SYNTHESIS_AUDIO_INVALID'
	return error
}

// Private bridge headers are evidence, never authority to select arbitrary voices.
// Both the owner-approved routing map and shipped commercial catalogue must agree.
export function resolveFallbackIdentity(headers, requestedVoice, language) {
	const used = headers.get('X-Speech-Fallback')
	if (used == null || used === '0') return null
	if (used !== '1' || !requestedVoice || typeof requestedVoice !== 'object' || requestedVoice.customReferenceBuffer || requestedVoice.scope === 'private') throw invalid()
	let map, catalog
	try {
		map = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_TTS_FALLBACK_MAP || new URL('../../deploy/narration/modal/fallback-map.json', import.meta.url), 'utf8'))
		catalog = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_TTS_FALLBACK_VOICES_MANIFEST || new URL('../voices/runtime-manifest.production.json', import.meta.url), 'utf8'))
	} catch { throw invalid() }
	const route = map.schemaVersion === 1 && map.mappings?.[requestedVoice.id]
	const actualId = headers.get('X-Speech-Voice-Id')
	const rawSpeaker = headers.get('X-Speech-Speaker')
	const speaker = rawSpeaker == null ? undefined : Number(rawSpeaker)
	if (!route || actualId !== route.voice || speaker !== route.speaker || (speaker !== undefined && !Number.isSafeInteger(speaker))) throw invalid()
	const found = catalog.voices?.find(v => v.id === actualId)
	if (!found || found.reviewStatus !== 'approved' || !['allowed', 'attribution'].includes(found.commercialUse)) throw invalid()
	const actual = enrichVoiceWithProfile(found)
	const gender = speaker == null ? actual.gender : actual.speakerProfiles?.find(p => p.speaker === speaker)?.gender
	const lang = value => String(value || '').replace(/-/g, '_').toLowerCase().split('_')[0]
	if (!gender || gender !== requestedVoice.gender || lang(language || requestedVoice.language) !== lang(actual.language)) throw invalid()
	if (actual.commercialUse === 'attribution' && !actual.attributionText) throw invalid()
	return {
		provider: 'piper-http', fallbackUsed: true, requestedVoiceId: requestedVoice.id,
		voice: { ...actual, gender, ...(speaker == null ? {} : { speaker }), modelDigest: actual.modelSha256 ? `sha256:${actual.modelSha256}` : null, referenceDigest: null },
		license: { spdx: actual.license, raw: actual.rawLicense, commercialUse: actual.commercialUse, attributionRequired: actual.commercialUse === 'attribution', source: actual.modelCardUrl || actual.datasetUrl, reviewStatus: actual.reviewStatus, lineageReview: Boolean(actual.lineageReview), ...(actual.commercialUse === 'attribution' ? { attribution: actual.attributionText, datasetUrl: actual.datasetUrl || null } : {}) },
		warnings: ['NARRATION_FALLBACK_USED: An approved alternative voice was used because the selected voice was temporarily unavailable.', ...(actual.commercialUse === 'attribution' ? ['ATTRIBUTION_REQUIRED'] : [])],
	}
}

// Only the shipped, production-approved catalogue may extend the primary runtime.
export function approvedLegacyVoices() {
	const catalog = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_TTS_FALLBACK_VOICES_MANIFEST || new URL('../voices/runtime-manifest.production.json', import.meta.url), 'utf8'))
	return (catalog.voices || []).filter(v => v.reviewStatus === 'approved' && ['allowed', 'attribution'].includes(v.commercialUse) && /^[a-f0-9]{64}$/.test(v.modelSha256 || ''))
		.map(v => enrichVoiceWithProfile({ ...v, provider: 'chatterbox-http', privateFallbackRoute: true, modelDigest: `sha256:${v.modelSha256}`, referenceDigest: null }))
}

export function resolveExplicitLegacyIdentity(headers, requestedVoice, language, selectedSpeaker) {
	if (!requestedVoice || requestedVoice.scope === 'private' || requestedVoice.customReferenceBuffer || requestedVoice.privateFallbackRoute !== true) throw invalid()
	const actual = approvedLegacyVoices().find(v => v.id === requestedVoice.id)
	if (!actual || requestedVoice.modelDigest !== actual.modelDigest) throw invalid()
	const raw = headers.get('X-Speech-Speaker')
	const speaker = raw == null ? undefined : Number(raw)
	if (headers.get('X-Speech-Fallback') !== '0' || headers.get('X-Speech-Selection') !== 'explicit' || headers.get('X-Speech-Voice-Id') !== actual.id || speaker !== selectedSpeaker || (speaker != null && !Number.isSafeInteger(speaker))) throw invalid()
	const lang = value => String(value || '').replace(/-/g, '_').toLowerCase()
	const requested = lang(language || actual.locale || actual.language)
	if (![actual.locale, actual.language].some(v => lang(v) === requested || lang(v).startsWith(`${requested}_`) || requested.startsWith(`${lang(v)}_`))) throw invalid()
	const profile = speaker == null ? null : actual.speakerProfiles?.find(p => p.speaker === speaker)
	if (speaker != null && (!Number.isSafeInteger(speaker) || speaker < 0 || speaker >= actual.numSpeakers)) throw invalid()
	if (actual.commercialUse === 'attribution' && !actual.attributionText) throw invalid()
	return {
		provider: 'piper-http', explicitLegacySelection: true, fallbackUsed: false,
		voice: { ...actual, gender: profile?.gender || actual.gender, ...(speaker == null ? {} : { speaker }) },
		license: { spdx: actual.license, raw: actual.rawLicense, commercialUse: actual.commercialUse, attributionRequired: actual.commercialUse === 'attribution', source: actual.modelCardUrl || actual.datasetUrl, reviewStatus: actual.reviewStatus, lineageReview: Boolean(actual.lineageReview), ...(actual.commercialUse === 'attribution' ? { attribution: actual.attributionText, datasetUrl: actual.datasetUrl || null } : {}) },
		warnings: actual.commercialUse === 'attribution' ? ['ATTRIBUTION_REQUIRED'] : [],
	}
}
