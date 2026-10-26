import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { genderCoverage, loadVoiceProfiles, enrichVoiceWithProfile, voiceGenderOptions } from '../narration/voiceProfiles.mjs'
import { resolveVoice } from '../narration/licenseGate.mjs'

const profiles = loadVoiceProfiles()
const manifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'narration', 'voices', 'manifest.json')

test('voice profiles distinguish a mixed Piper model from its selected speaker genders', () => {
	const voice = enrichVoiceWithProfile({ id: 'es_ES-sharvard-medium', language: 'es', locale: 'es_ES' }, profiles)
	assert.equal(voice.gender, 'mixed')
	assert.deepEqual(voice.speakerProfiles.map(speaker => [speaker.speaker, speaker.gender]), [[0, 'male'], [1, 'female']])
	assert.deepEqual(voiceGenderOptions(voice), ['female', 'male'])
})

test('inventory coverage reports the pair matrix instead of silently treating unknown voices as gendered', () => {
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
	const coverage = genderCoverage((manifest.voices || []).map(voice => enrichVoiceWithProfile(voice, profiles)), ['female', 'male'], profiles)
	assert.equal(coverage.localeCount, 58)
	assert.equal(coverage.localesWithPair.length, 23)
	assert.equal(coverage.pairComplete, false)
	assert.ok(coverage.localesMissingPair.some(row => row.locale === 'zh_CN' && row.missingGenders.includes('female') && row.missingGenders.includes('male')))
})

test('gender selection auto-selects the matching speaker profile', () => {
	const female = resolveVoice({ voice: 'es_ES-sharvard-medium', gender: 'female', allowUnreviewedVoices: true })
	assert.equal(female.voice.id, 'es_ES-sharvard-medium')
	assert.equal(female.gender, 'female')
	assert.equal(female.speaker, 1)

	const male = resolveVoice({ voice: 'cy_GB-bu_tts-medium', gender: 'male', allowUnreviewedVoices: true })
	assert.equal(male.gender, 'male')
	assert.equal(male.speaker, 2)
})

test('gender coverage sees a pair even when both genders are speaker profiles on one model', () => {
	const voice = enrichVoiceWithProfile({ id: 'kk_KZ-issai-high', language: 'kk', locale: 'kk_KZ' }, profiles)
	const coverage = genderCoverage([voice], ['female', 'male'], profiles)
	assert.equal(coverage.pairComplete, true)
	assert.deepEqual(coverage.localesWithPair, ['kk_KZ'])
})
