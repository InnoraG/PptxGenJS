import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { isCustomVoiceId, resolveCustomVoice, listCustomVoices } from './customVoices.mjs'
import {
	enrichVoiceWithProfile,
	genderCoverage,
	loadVoiceProfiles,
	normalizeGender,
	voiceGenderOptions,
	voiceMatchesGender,
} from './voiceProfiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CANDIDATE_MANIFEST = path.resolve(__dirname, 'voices', 'manifest.json')
const VOICE_PROFILES = loadVoiceProfiles()

function readJsonIfExists(filePath) {
	try {
		if (!filePath || !fs.existsSync(filePath)) return null
		return JSON.parse(fs.readFileSync(filePath, 'utf8'))
	} catch {
		throw new Error('The narration voice catalog could not be read.')
	}
}

export function narrationMode() {
	return String(process.env.BETTERPPTX_NARRATION_MODE || 'development').toLowerCase()
}

export function effectiveVoiceProvider(provider) {
	const name = String(provider || process.env.BETTERPPTX_TTS_PROVIDER || 'piper-http').toLowerCase()
	return name === 'piper' ? 'piper-http' : name === 'chatterbox' ? 'chatterbox-http' : name
}

function manifestForProvider(data, source, runtime, provider) {
	if (!data || !Array.isArray(data.voices)) throw new Error('The narration voice catalog is invalid.')
	const declared = data?.provider ? effectiveVoiceProvider(data.provider) : null
	if ((declared && declared !== provider) || (provider === 'chatterbox-http' && declared !== provider)
		|| (data?.voices || []).some(voice => voice.provider && effectiveVoiceProvider(voice.provider) !== provider)) {
		throw new Error('The narration voice catalog does not match the selected synthesis runtime.')
	}
	return {
		source, runtime, provider,
		identity: `sha256:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`,
		voices: Array.isArray(data?.voices) ? data.voices.map(voice => enrichVoiceWithProfile({ ...voice, provider, modelDigest: voice.modelDigest || data.modelDigest || null, referenceDigest: voice.referenceDigest || null }, VOICE_PROFILES)) : [],
	}
}

export function loadVoiceManifest({ provider: requestedProvider } = {}) {
	const provider = effectiveVoiceProvider(requestedProvider)
	const runtimePath = process.env.BETTERPPTX_RUNTIME_VOICES_MANIFEST || process.env.BETTERPPTX_VOICES_MANIFEST
	if (provider === 'chatterbox-http') {
		const dedicatedPath = process.env.BETTERPPTX_CHATTERBOX_VOICES_MANIFEST
		const source = dedicatedPath || runtimePath
		const data = readJsonIfExists(source)
		if (!data) throw new Error('The selected narration runtime requires its own configured voice catalog.')
		return manifestForProvider(data, source, true, provider)
	}
	const runtime = readJsonIfExists(runtimePath)
	if (runtime) return manifestForProvider(runtime, runtimePath, true, provider)
	const broad = readJsonIfExists(DEFAULT_CANDIDATE_MANIFEST)
	return manifestForProvider(broad, DEFAULT_CANDIDATE_MANIFEST, false, provider)
}

function normalizeLanguage(value) {
	return String(value || '').replace(/-/g, '_').toLowerCase()
}

function voiceMatchesLanguage(voice, requested) {
	if (!requested) return true
	const candidates = [voice?.locale, voice?.language, ...(Array.isArray(voice?.languages) ? voice.languages : [])].map(normalizeLanguage).filter(Boolean)
	return candidates.some(candidate => candidate === requested || candidate.startsWith(`${requested}_`) || requested.startsWith(`${candidate}_`))
}

function isCommerciallyUsable(voice) {
	return voice?.commercialUse === 'allowed' || voice?.commercialUse === 'attribution'
}

function isApprovedForProduction(voice) {
	return voice?.reviewStatus === 'approved' && isCommerciallyUsable(voice)
}

function isAllowedInDevelopment(voice, allowUnreviewedVoices) {
	if (isApprovedForProduction(voice)) return true
	if (!allowUnreviewedVoices) return false
	return isCommerciallyUsable(voice) && voice?.commercialUse !== 'unknown' && voice?.commercialUse !== 'forbidden'
}

export function listVoices({ includeCandidates = false, allowUnreviewedVoices = false, gender, language, lang, query, provider } = {}) {
	const manifest = loadVoiceManifest({ provider })
	const mode = narrationMode()
	const requestedGender = String(gender || '').trim() ? normalizeGender(gender) : null
	const requestedLanguage = String(language || lang || '').trim() ? normalizeLanguage(language || lang) : null
	const requestedQuery = String(query || '').trim().toLowerCase()
	if (requestedGender && !['female', 'male'].includes(requestedGender)) {
		throw new Error(`Unsupported narration gender ${gender}. Use female or male.`)
	}
	const privateVoices = manifest.provider === 'chatterbox-http' ? listCustomVoices() : []
	const voices = [...manifest.voices, ...privateVoices].filter(v => {
		if (requestedGender && !voiceMatchesGender(v, requestedGender)) return false
		if (!voiceMatchesLanguage(v, requestedLanguage)) return false
		if (requestedQuery && ![v.id, v.name, v.language, v.locale].some(value => String(value || '').toLowerCase().includes(requestedQuery))) return false
		if (v.scope === 'private' || isApprovedForProduction(v)) return true
		if (mode !== 'production' && (includeCandidates || allowUnreviewedVoices)) return isAllowedInDevelopment(v, true)
		return false
	})
	return {
		manifest: { source: manifest.source, runtime: manifest.runtime, mode },
		filter: { gender: requestedGender, language: requestedLanguage, query: requestedQuery || null },
		count: voices.length,
		productionApprovedCount: voices.filter(v => isApprovedForProduction(v) && !v.lineageReview).length,
		lineageReviewCount: voices.filter(v => v.lineageReview).length,
		genderCoverage: genderCoverage(voices, ['female', 'male'], VOICE_PROFILES),
		voices: voices.map(v => ({
			id: v.id,
			...(v.scope === 'private' ? { scope: 'private', consentBasis: 'user-attested' } : {}),
			name: v.name,
			language: v.language,
			...(Array.isArray(v.languages) ? { languages: [...v.languages] } : {}),
			locale: v.locale,
			quality: v.quality,
			numSpeakers: v.numSpeakers,
			isDefaultForLocale: Boolean(v.isDefaultForLocale),
			license: v.license,
			rawLicense: v.rawLicense,
			commercialUse: v.commercialUse,
			reviewStatus: v.reviewStatus,
			attributionRequired: v.commercialUse === 'attribution',
			lineageReview: Boolean(v.lineageReview),
			gender: v.gender,
			genderSource: v.genderSource,
			genderConfidence: v.genderConfidence,
			availableGenders: voiceGenderOptions(v),
			...(v.speakerProfiles?.length ? { speakerProfiles: v.speakerProfiles } : {}),
		})),
	}
}

export function resolveVoice({ voice, lang, gender, speaker, allowUnreviewedVoices = false, provider } = {}) {
	if (isCustomVoiceId(voice)) {
		if (effectiveVoiceProvider(provider) !== 'chatterbox-http') throw new Error('The selected synthesis runtime does not support private sample-based voices.')
		const custom = resolveCustomVoice(voice)
		if (lang && (typeof lang !== 'string' || !/^[a-z]{2}(?:[-_][a-z]{2})?$/i.test(lang) || !custom.languages.includes(normalizeLanguage(lang).split('_')[0]))) throw new Error('The private voice does not support the requested language.')
		if (gender && gender !== custom.gender) throw new Error('The private voice does not match the requested gender.')
		if (speaker != null) throw new Error('The private voice does not support a speaker index.')
		return { voice: custom, gender: custom.gender, warnings: ['PRIVATE_VOICE_USER_ATTESTED'], license: { spdx: null, commercialUse: 'user-attested', attributionRequired: false, reviewStatus: 'user-authorized', consentBasis: 'user-attested' } }
	}
	const manifest = loadVoiceManifest({ provider })
	const mode = narrationMode()
	const requested = normalizeLanguage(voice || lang || '')
	const requestedGender = String(gender || '').trim() ? normalizeGender(gender) : null
	if (requestedGender && !['female', 'male'].includes(requestedGender)) {
		throw new Error(`Unsupported narration gender ${gender}. Use female or male.`)
	}
	const usableVoices = manifest.voices.filter(v =>
		isApprovedForProduction(v)
		|| (mode !== 'production' && isAllowedInDevelopment(v, allowUnreviewedVoices))
	)
	const genderVoices = requestedGender ? usableVoices.filter(v => voiceMatchesGender(v, requestedGender)) : usableVoices
	let found = null
	if (voice) {
		found = manifest.voices.find(v => v.id === voice)
	} else if (lang) {
		found = genderVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.locale) === requested)
			|| genderVoices.find(v => v.isDefaultForLanguage && normalizeLanguage(v.language) === requested)
			|| genderVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.language) === requested)
			|| genderVoices.find(v => normalizeLanguage(v.locale) === requested)
			|| genderVoices.find(v => normalizeLanguage(v.language) === requested)
	} else {
		found = genderVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.locale) === 'en_us')
			|| genderVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.language) === 'en')
			|| genderVoices.find(v => normalizeLanguage(v.language) === 'en')
			|| genderVoices[0]
	}
	if (!found) throw new Error(`No narration voice found for ${voice || lang || 'default language'}`)

	const approved = isApprovedForProduction(found)
	const devAllowed = mode !== 'production' && isAllowedInDevelopment(found, allowUnreviewedVoices)
	if (!approved && !devAllowed) {
		throw new Error(`Voice ${found.id} is not approved for ${mode} narration use (reviewStatus=${found.reviewStatus}, commercialUse=${found.commercialUse}).`)
	}
	if (requestedGender && !voiceMatchesGender(found, requestedGender)) {
		throw new Error(`Voice ${found.id} does not provide a ${requestedGender} speaker profile.`)
	}
	let selectedSpeaker = speaker
	if (requestedGender && selectedSpeaker === undefined && found.gender !== requestedGender) {
		const matchingSpeaker = (found.speakerProfiles || []).find(candidate => candidate.gender === requestedGender)
		if (matchingSpeaker) selectedSpeaker = matchingSpeaker.speaker
	}
	if (requestedGender && selectedSpeaker !== undefined && found.speakerProfiles?.length) {
		const selectedProfile = found.speakerProfiles.find(candidate => candidate.speaker === Number(selectedSpeaker))
		if (!selectedProfile || selectedProfile.gender !== requestedGender) {
			throw new Error(`Speaker ${selectedSpeaker} on voice ${found.id} is not a ${requestedGender} profile.`)
		}
	}
	const selectedProfile = selectedSpeaker !== undefined
		? found.speakerProfiles?.find(candidate => candidate.speaker === Number(selectedSpeaker))
		: null
	const selectedGender = requestedGender || selectedProfile?.gender || found.gender
	const warnings = []
	if (!approved) warnings.push('UNREVIEWED_VOICE')
	if (found.lineageReview) warnings.push('VOICE_LINEAGE_REVIEW')
	if (found.commercialUse === 'attribution') warnings.push('ATTRIBUTION_REQUIRED')
	return {
		voice: found,
		speaker: selectedSpeaker,
		gender: selectedGender,
		warnings,
		license: {
			spdx: found.license,
			raw: found.rawLicense,
			commercialUse: found.commercialUse,
			attributionRequired: found.commercialUse === 'attribution',
			source: found.modelCardUrl || found.datasetUrl,
			...(found.commercialUse === 'attribution' ? { attribution: found.attributionText || null, datasetUrl: found.datasetUrl || null } : {}),
			reviewStatus: found.reviewStatus,
			lineageReview: Boolean(found.lineageReview),
		},
	}
}
