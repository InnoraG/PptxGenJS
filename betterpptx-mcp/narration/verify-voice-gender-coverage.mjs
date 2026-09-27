#!/usr/bin/env node
// Report whether the Piper inventory or the approved runtime has both a
// female and male profile for every locale. Use --strict in a build gate.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enrichVoiceWithProfile, genderCoverage, loadVoiceProfiles } from './voiceProfiles.mjs'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const manifestPath = path.resolve(process.env.BETTERPPTX_VOICE_MANIFEST_SOURCE || path.join(MODULE_DIR, 'voices', 'manifest.json'))
const profiles = loadVoiceProfiles()
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const voices = (manifest.voices || []).map(voice => enrichVoiceWithProfile(voice, profiles))
const approved = voices.filter(voice => voice.reviewStatus === 'approved' && ['allowed', 'attribution'].includes(voice.commercialUse))
const runtimePath = process.env.BETTERPPTX_RUNTIME_VOICES_MANIFEST
const runtime = runtimePath && fs.existsSync(runtimePath)

function summary(coverage) {
	return {
		localeCount: coverage.localeCount,
		pairComplete: coverage.pairComplete,
		completeLocales: coverage.localesWithPair,
		missingPairs: coverage.localesMissingPair.map(row => ({
			locale: row.locale,
			availableGenders: row.availableGenders,
			missingGenders: row.missingGenders,
		})),
	}
}

const result = {
	manifest: manifestPath,
	voiceCount: voices.length,
	approvedVoiceCount: approved.length,
	inventory: summary(genderCoverage(voices, ['female', 'male'], profiles)),
	approved: summary(genderCoverage(approved, ['female', 'male'], profiles)),
}

if (runtime) {
	const runtimeManifest = JSON.parse(fs.readFileSync(runtimePath, 'utf8'))
	const runtimeVoices = (runtimeManifest.voices || []).map(voice => enrichVoiceWithProfile(voice, profiles))
	result.runtime = { voiceCount: runtimeVoices.length, ...summary(genderCoverage(runtimeVoices, ['female', 'male'], profiles)) }
}

console.log(JSON.stringify(result, null, 2))
if (process.argv.includes('--strict') && !result.inventory.pairComplete) process.exit(2)
