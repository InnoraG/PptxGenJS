import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROFILE_PATH = path.join(MODULE_DIR, 'voices', 'voice-profiles.json')
const VALID_GENDERS = new Set(['female', 'male'])

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeGender(value) {
  const normalized = asText(value).toLowerCase()
  if (VALID_GENDERS.has(normalized)) return normalized
  if (normalized === 'mixed') return 'mixed'
  return 'unknown'
}

export function normalizeRequiredGenders(value = 'female,male') {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(values.map(normalizeGender).filter((gender) => VALID_GENDERS.has(gender)))]
}

export function loadVoiceProfiles(profilePath = process.env.BETTERPPTX_VOICE_PROFILES || DEFAULT_PROFILE_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
    return {
      ...parsed,
      source: parsed.source || 'maintained voice profile data',
      voiceFamilies: parsed.voiceFamilies || {},
      voices: parsed.voices || {},
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { schemaVersion: 1, source: 'no voice profile data', voiceFamilies: {}, voices: {} }
    }
    throw new Error(`Unable to read Piper voice profiles at ${profilePath}: ${error.message}`)
  }
}

function familyKey(voiceId) {
  const parts = asText(voiceId).split('-')
  return parts.length > 1 ? parts.slice(0, -1).join('-') : asText(voiceId)
}

function profileForVoice(profiles, voiceId) {
  const exact = profiles?.voices?.[voiceId]
  const family = profiles?.voiceFamilies?.[familyKey(voiceId)]
  if (!family && !exact) return null
  return {
    ...(family || {}),
    ...(exact || {}),
    ...(exact?.speakerProfiles === undefined && family?.speakerProfiles
      ? { speakerProfiles: family.speakerProfiles }
      : {}),
  }
}

function normalizeSpeakerProfiles(rawProfiles) {
  if (!rawProfiles) return []
  const entries = Array.isArray(rawProfiles)
    ? rawProfiles.map((profile) => [profile?.speaker, profile])
    : Object.entries(rawProfiles)

  return entries
    .map(([speaker, profile]) => {
      const speakerNumber = Number(speaker)
      if (!Number.isInteger(speakerNumber) || !profile || typeof profile !== 'object') return null
      const gender = normalizeGender(profile.gender)
      return {
        speaker: speakerNumber,
        ...(asText(profile.name) ? { name: asText(profile.name) } : {}),
        gender,
        genderSource: asText(profile.genderSource || profile.source) || 'unresolved',
        genderConfidence: asText(profile.genderConfidence || profile.confidence) || 'unresolved',
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.speaker - right.speaker)
}

export function enrichVoiceWithProfile(voice, profiles = loadVoiceProfiles()) {
  if (!voice || typeof voice !== 'object') return voice
  const profile = profileForVoice(profiles, voice.id)
  const speakerProfiles = normalizeSpeakerProfiles(profile?.speakerProfiles)
  const speakerGenders = new Set(speakerProfiles.map((speaker) => speaker.gender).filter((gender) => VALID_GENDERS.has(gender)))
  const declaredGender = normalizeGender(profile?.gender || voice.gender)
	const gender = declaredGender !== 'unknown'
		? declaredGender
		: speakerGenders.size > 1
			? 'mixed'
			: speakerGenders.size === 1
				? [...speakerGenders][0]
				: 'unknown'
	const availableGenders = new Set(speakerGenders)
	if (VALID_GENDERS.has(gender)) availableGenders.add(gender)

	return {
		...voice,
		gender,
		genderSource: asText(profile?.genderSource || profile?.source || voice.genderSource) || 'unresolved',
		genderConfidence: asText(profile?.genderConfidence || profile?.confidence || voice.genderConfidence) || 'unresolved',
		availableGenders: [...availableGenders].sort(),
		...(speakerProfiles.length ? { speakerProfiles } : {}),
  }
}

export function voiceGenderOptions(voice) {
  const options = new Set()
  if (VALID_GENDERS.has(voice?.gender)) options.add(voice.gender)
  for (const speaker of voice?.speakerProfiles || []) {
    if (VALID_GENDERS.has(speaker.gender)) options.add(speaker.gender)
  }
  return [...options].sort()
}

export function voiceMatchesGender(voice, gender) {
  const normalized = normalizeGender(gender)
  return VALID_GENDERS.has(normalized) && voiceGenderOptions(voice).includes(normalized)
}

function genderSource(voice, gender) {
  if (voice?.gender === gender) {
    return { voiceId: voice.id, genderSource: voice.genderSource, genderConfidence: voice.genderConfidence }
  }
  const speaker = (voice?.speakerProfiles || []).find((candidate) => candidate.gender === gender)
  return speaker
    ? {
        voiceId: voice.id,
        speaker: speaker.speaker,
        ...(speaker.name ? { name: speaker.name } : {}),
        genderSource: speaker.genderSource,
        genderConfidence: speaker.genderConfidence,
      }
    : null
}

export function genderCoverage(voices = [], requiredGenders = ['female', 'male'], profiles = loadVoiceProfiles()) {
  const required = normalizeRequiredGenders(requiredGenders)
  const locales = new Map()

	for (const rawVoice of voices) {
		const voice = enrichVoiceWithProfile(rawVoice, profiles)
    const locale = asText(voice?.locale || voice?.language) || 'unknown'
    if (!locales.has(locale)) locales.set(locale, { locale, availableGenders: new Set(), sources: {} })
    const row = locales.get(locale)
    for (const gender of voiceGenderOptions(voice)) {
      row.availableGenders.add(gender)
      row.sources[gender] ||= []
      const source = genderSource(voice, gender)
      if (source && !row.sources[gender].some((candidate) => candidate.voiceId === source.voiceId && candidate.speaker === source.speaker)) {
        row.sources[gender].push(source)
      }
    }
  }

  const rows = [...locales.values()]
    .sort((left, right) => left.locale.localeCompare(right.locale))
    .map((row) => {
      const availableGenders = [...row.availableGenders].sort()
      const missingGenders = required.filter((gender) => !row.availableGenders.has(gender))
      return {
        locale: row.locale,
        availableGenders,
        missingGenders,
        pairComplete: missingGenders.length === 0,
        sources: Object.fromEntries(Object.entries(row.sources).sort(([left], [right]) => left.localeCompare(right))),
      }
    })

	return {
		requiredGenders: required,
		localeCount: rows.length,
		pairComplete: rows.length > 0 && rows.every((row) => row.pairComplete),
		locales: rows,
		localesWithPair: rows.filter((row) => row.pairComplete).map((row) => row.locale),
    localesMissingPair: rows.filter((row) => !row.pairComplete),
  }
}
