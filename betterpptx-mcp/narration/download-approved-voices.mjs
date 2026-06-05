#!/usr/bin/env node
// Download the human-approved Piper voices selected in voices/manifest.json.
// This script is intentionally strict: production images should contain only
// reviewed voices and a small runtime manifest.

import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(process.env.BETTERPPTX_VOICE_MANIFEST_SOURCE || path.join(__dirname, 'voices', 'manifest.json'))
const OUT_DIR = path.resolve(process.env.BETTERPPTX_VOICE_OUTPUT_DIR || path.join(__dirname, 'voices', 'runtime'))
const OUT = path.join(OUT_DIR, 'runtime-manifest.json')
const REQUIRE_LANGS = String(process.env.BETTERPPTX_REQUIRED_VOICE_LANGS || 'en,fr').split(',').map(s => s.trim()).filter(Boolean)
const INCLUDE_ATTRIBUTION = process.env.BETTERPPTX_ALLOW_ATTRIBUTION_VOICES === '1'

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

async function main() {
	const manifest = JSON.parse(await fs.readFile(SRC, 'utf8'))
	const selected = (manifest.voices || []).filter(usable)
	if (!selected.length) throw new Error(`No approved voices in ${SRC}. Set reviewStatus:"approved" on reviewed rows first.`)
	for (const lang of REQUIRE_LANGS) {
		if (!selected.some(v => v.language === lang || String(v.locale || '').toLowerCase().startsWith(`${lang.toLowerCase()}_`))) {
			throw new Error(`Missing approved required voice for language: ${lang}`)
		}
	}
	await fs.mkdir(OUT_DIR, { recursive: true })
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
		voices: runtime,
	}, null, 2))
	console.log(OUT)
}

main().catch(err => {
	console.error(`download-approved-voices failed: ${err.message}`)
	process.exit(1)
})
