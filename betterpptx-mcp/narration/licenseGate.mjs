import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
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
	} catch (err) {
		throw new Error(`Failed to read voice manifest ${filePath}: ${err.message}`)
	}
}

export function narrationMode() {
	return String(process.env.BETTERPPTX_NARRATION_MODE || 'development').toLowerCase()
}

export function loadVoiceManifest() {
	const runtimePath = process.env.BETTERPPTX_RUNTIME_VOICES_MANIFEST || process.env.BETTERPPTX_VOICES_MANIFEST
	const runtime = readJsonIfExists(runtimePath)
	if (runtime) return {
		source: runtimePath,
		runtime: true,
		voices: Array.isArray(runtime.voices) ? runtime.voices.map(voice => enrichVoiceWithProfile(voice, VOICE_PROFILES)) : [],
	}
	const broad = readJsonIfExists(DEFAULT_CANDIDATE_MANIFEST)
	return {
		source: DEFAULT_CANDIDATE_MANIFEST,
		runtime: false,
		voices: Array.isArray(broad?.voices) ? broad.voices.map(voice => enrichVoiceWithProfile(voice, VOICE_PROFILES)) : [],
	}
}

function normalizeLanguage(value) {
	return String(value || '').replace(/-/g, '_').toLowerCase()
}

function voiceMatchesLanguage(voice, requested) {
	if (!requested) return true
	const candidates = [voice?.locale, voice?.language].map(normalizeLanguage).filter(Boolean)
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

export function listVoices({ includeCandidates = false, allowUnreviewedVoices = false, gender, language, lang, query } = {}) {
	const manifest = loadVoiceManifest()
	const mode = narrationMode()
	const requestedGender = String(gender || '').trim() ? normalizeGender(gender) : null
	const requestedLanguage = String(language || lang || '').trim() ? normalizeLanguage(language || lang) : null
	const requestedQuery = String(query || '').trim().toLowerCase()
	if (requestedGender && !['female', 'male'].includes(requestedGender)) {
		throw new Error(`Unsupported narration gender ${gender}. Use female or male.`)
	}
	const voices = manifest.voices.filter(v => {
		if (requestedGender && !voiceMatchesGender(v, requestedGender)) return false
		if (!voiceMatchesLanguage(v, requestedLanguage)) return false
		if (requestedQuery && ![v.id, v.name, v.language, v.locale].some(value => String(value || '').toLowerCase().includes(requestedQuery))) return false
		if (isApprovedForProduction(v)) return true
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
			name: v.name,
			language: v.language,
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

export function resolveVoice({ voice, lang, gender, speaker, allowUnreviewedVoices = false } = {}) {
	const manifest = loadVoiceManifest()
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
		// A bare language ("en", "es") prefers its designated voice over whichever locale sorts first.
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
