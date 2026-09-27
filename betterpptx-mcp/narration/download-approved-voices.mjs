#!/usr/bin/env node
// Download the human-approved Piper voices selected in voices/manifest.json.
// This script is intentionally strict: production images should contain only
// reviewed voices and a small runtime manifest.

import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { enrichVoiceWithProfile, genderCoverage, loadVoiceProfiles, normalizeRequiredGenders } from './voiceProfiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(process.env.BETTERPPTX_VOICE_MANIFEST_SOURCE || path.join(__dirname, 'voices', 'manifest.json'))
const OUT_DIR = path.resolve(process.env.BETTERPPTX_VOICE_OUTPUT_DIR || path.join(__dirname, 'voices', 'runtime'))
const OUT = path.join(OUT_DIR, 'runtime-manifest.json')
const REQUIRE_LANGS_RAW = String(process.env.BETTERPPTX_REQUIRED_VOICE_LANGS || 'en,fr').trim()
const REQUIRE_GENDERS_RAW = String(process.env.BETTERPPTX_REQUIRED_VOICE_GENDERS || '').trim()
const INCLUDE_ATTRIBUTION = process.env.BETTERPPTX_ALLOW_ATTRIBUTION_VOICES === '1'
const VOICE_PROFILES = loadVoiceProfiles()

function sha256(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex')
}

function md5(buffer) {
	return crypto.createHash('md5').update(buffer).digest('hex')
}

async function download(url) {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
	return Buffer.from(await res.arrayBuffer())
}

function usable(v) {
	if (v.reviewStatus !== 'approved') return false
	if (v.commercialUse === 'allowed') return true
	if (v.commercialUse === 'attribution') return INCLUDE_ATTRIBUTION
	return false
}

function requiredLanguages(manifest, selected) {
	if (!REQUIRE_LANGS_RAW) return []
	if (REQUIRE_LANGS_RAW.toLowerCase() === 'approved') {
		return [...new Set(selected.map(v => v.locale || v.language).filter(Boolean))].sort()
	}
	if (REQUIRE_LANGS_RAW.toLowerCase() === 'all') {
		return [...new Set((manifest.voices || []).map(v => v.locale || v.language).filter(Boolean))].sort()
	}
	return REQUIRE_LANGS_RAW.split(',').map(s => s.trim()).filter(Boolean)
}

function languageMatches(localeOrLanguage, required) {
	const value = String(localeOrLanguage || '').toLowerCase().replace('-', '_')
	const target = String(required || '').toLowerCase().replace('-', '_')
	return value === target || value.startsWith(`${target}_`) || target === value.split('_')[0]
}

function assertGenderCoverage(selected, requiredLanguagesList, requiredGenders) {
	if (!requiredGenders.length) return
	const coverage = genderCoverage(selected, requiredGenders, VOICE_PROFILES)
	const targetLocales = requiredLanguagesList.length
		? [...new Set(selected.flatMap(voice => [voice.locale, voice.language]).filter(value => requiredLanguagesList.some(required => languageMatches(value, required))))]
		: [...new Set(selected.map(voice => voice.locale || voice.language).filter(Boolean))]
	const missing = coverage.localesMissingPair
		.filter(row => targetLocales.some(target => languageMatches(row.locale, target)))
		.map(row => `${row.locale} missing ${row.missingGenders.join(' and ')}`)
	if (missing.length) {
		throw new Error(`Required gender coverage failed: ${missing.join('; ')}. Add reviewed Piper voices/speaker profiles or a licensed provider voice before building the runtime.`)
	}
}

async function main() {
	const manifest = JSON.parse(await fs.readFile(SRC, 'utf8'))
	const selected = (manifest.voices || []).map(voice => enrichVoiceWithProfile(voice, VOICE_PROFILES)).filter(usable)
	if (!selected.length) throw new Error(`No approved voices in ${SRC}. Set reviewStatus:"approved" on reviewed rows first.`)
	const REQUIRE_LANGS = requiredLanguages(manifest, selected)
	const REQUIRE_GENDERS = REQUIRE_GENDERS_RAW ? normalizeRequiredGenders(REQUIRE_GENDERS_RAW) : []
	if (REQUIRE_GENDERS_RAW && REQUIRE_GENDERS.length !== 2) throw new Error('BETTERPPTX_REQUIRED_VOICE_GENDERS must contain female,male when enabled.')
	for (const lang of REQUIRE_LANGS) {
		if (!selected.some(v => languageMatches(v.locale, lang) || languageMatches(v.language, lang))) {
			throw new Error(`Missing approved required voice for language: ${lang}`)
		}
	}
	assertGenderCoverage(selected, REQUIRE_LANGS, REQUIRE_GENDERS)
	const coverage = genderCoverage(selected, ['female', 'male'], VOICE_PROFILES)
	await fs.mkdir(OUT_DIR, { recursive: true })
	const selectedRuntimeFiles = new Set(selected.flatMap(voice => [`${voice.id}.onnx`, `${voice.id}.onnx.json`]))
	for (const entry of await fs.readdir(OUT_DIR, { withFileTypes: true }).catch(() => [])) {
		if (!entry.isFile()) continue
		if (entry.name === 'runtime-manifest.json') continue
		if (!entry.name.endsWith('.onnx') && !entry.name.endsWith('.onnx.json')) continue
		if (!selectedRuntimeFiles.has(entry.name)) {
			await fs.unlink(path.join(OUT_DIR, entry.name))
		}
	}
	const runtime = []
	for (const voice of selected) {
		if (voice.commercialUse === 'attribution' && !voice.attributionText && !voice.datasetUrl && !voice.modelCardUrl) {
			throw new Error(`Attribution voice ${voice.id} lacks attribution source text/url.`)
		}
		const modelBuffer = fsSync.existsSync(path.join(OUT_DIR, `${voice.id}.onnx`))
			? await fs.readFile(path.join(OUT_DIR, `${voice.id}.onnx`))
			: await download(voice.modelUrl)
		const configBuffer = fsSync.existsSync(path.join(OUT_DIR, `${voice.id}.onnx.json`))
			? await fs.readFile(path.join(OUT_DIR, `${voice.id}.onnx.json`))
			: await download(voice.configUrl)
		if (voice.modelMd5 && md5(modelBuffer) !== voice.modelMd5) throw new Error(`MD5 mismatch for ${voice.id}.onnx`)
		if (voice.configMd5 && md5(configBuffer) !== voice.configMd5) throw new Error(`MD5 mismatch for ${voice.id}.onnx.json`)
		const modelPath = path.join(OUT_DIR, `${voice.id}.onnx`)
		const configPath = path.join(OUT_DIR, `${voice.id}.onnx.json`)
		await fs.writeFile(modelPath, modelBuffer)
		await fs.writeFile(configPath, configBuffer)
		runtime.push({
			...voice,
			modelPath: `/voices/${voice.id}.onnx`,
			configPath: `/voices/${voice.id}.onnx.json`,
			modelSha256: sha256(modelBuffer),
			configSha256: sha256(configBuffer),
		})
		process.stderr.write(`voice ${voice.id}: ok\n`)
	}
	await fs.writeFile(OUT, JSON.stringify({
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		sourceManifest: SRC,
		requiredLanguages: REQUIRE_LANGS,
		requiredGenders: REQUIRE_GENDERS,
		genderCoverage: coverage,
		voices: runtime,
	}, null, 2))
	console.log(OUT)
}

main().catch(err => {
	console.error(`download-approved-voices failed: ${err.message}`)
	process.exit(1)
})
