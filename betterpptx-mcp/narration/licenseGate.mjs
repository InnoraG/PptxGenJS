import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CANDIDATE_MANIFEST = path.resolve(__dirname, 'voices', 'manifest.json')

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
	if (runtime) return { source: runtimePath, runtime: true, voices: Array.isArray(runtime.voices) ? runtime.voices : [] }
	const broad = readJsonIfExists(DEFAULT_CANDIDATE_MANIFEST)
	return { source: DEFAULT_CANDIDATE_MANIFEST, runtime: false, voices: Array.isArray(broad?.voices) ? broad.voices : [] }
}

function normalizeLanguage(value) {
	return String(value || '').replace('-', '_').toLowerCase()
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

export function listVoices({ includeCandidates = false, allowUnreviewedVoices = false } = {}) {
	const manifest = loadVoiceManifest()
	const mode = narrationMode()
	const voices = manifest.voices.filter(v => {
		if (isApprovedForProduction(v)) return true
		if (mode !== 'production' && (includeCandidates || allowUnreviewedVoices)) return isAllowedInDevelopment(v, true)
		return false
	})
	return {
		manifest: { source: manifest.source, runtime: manifest.runtime, mode },
		count: voices.length,
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
		})),
	}
}

export function resolveVoice({ voice, lang, allowUnreviewedVoices = false } = {}) {
	const manifest = loadVoiceManifest()
	const mode = narrationMode()
	const requested = normalizeLanguage(voice || lang || '')
	const usableVoices = manifest.voices.filter(v =>
		isApprovedForProduction(v)
		|| (mode !== 'production' && isAllowedInDevelopment(v, allowUnreviewedVoices))
	)
	let found = null
	if (voice) {
		found = manifest.voices.find(v => v.id === voice)
	} else if (lang) {
		found = usableVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.locale) === requested)
			|| usableVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.language) === requested)
			|| usableVoices.find(v => normalizeLanguage(v.locale) === requested)
			|| usableVoices.find(v => normalizeLanguage(v.language) === requested)
	} else {
		found = usableVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.locale) === 'en_us')
			|| usableVoices.find(v => v.isDefaultForLocale && normalizeLanguage(v.language) === 'en')
			|| usableVoices.find(v => normalizeLanguage(v.language) === 'en')
			|| usableVoices[0]
	}
	if (!found) throw new Error(`No narration voice found for ${voice || lang || 'default language'}`)

	const approved = isApprovedForProduction(found)
	const devAllowed = mode !== 'production' && isAllowedInDevelopment(found, allowUnreviewedVoices)
	if (!approved && !devAllowed) {
		throw new Error(`Voice ${found.id} is not approved for ${mode} narration use (reviewStatus=${found.reviewStatus}, commercialUse=${found.commercialUse}).`)
	}
	const warnings = []
	if (!approved) warnings.push('UNREVIEWED_VOICE')
	if (found.lineageReview) warnings.push('VOICE_LINEAGE_REVIEW')
	if (found.commercialUse === 'attribution') warnings.push('ATTRIBUTION_REQUIRED')
	return {
		voice: found,
		warnings,
		license: {
			spdx: found.license,
			raw: found.rawLicense,
			commercialUse: found.commercialUse,
			attributionRequired: found.commercialUse === 'attribution',
			source: found.modelCardUrl || found.datasetUrl,
			reviewStatus: found.reviewStatus,
			lineageReview: Boolean(found.lineageReview),
		},
	}
}
