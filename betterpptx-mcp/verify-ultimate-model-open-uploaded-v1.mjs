#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { callBetterPptxTool, getBetterPptxDeckDiagnostics } from './engine.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '1'
process.env.BETTERPPTX_DECYPHER_ENGINE ??= 'ultimate'

function fail(message, detail = {}) {
	console.error('ULTIMATE MODEL OPEN_UPLOADED VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

function collectStringHits(value, predicate, currentPath = '$', hits = []) {
	if (typeof value === 'string') {
		if (predicate(value)) hits.push({ path: currentPath, value: value.slice(0, 500) })
	} else if (Array.isArray(value)) {
		value.forEach((item, index) => collectStringHits(item, predicate, `${currentPath}[${index}]`, hits))
	} else if (value && typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) collectStringHits(item, predicate, `${currentPath}.${key}`, hits)
	}
	return hits
}

function publicLeakHits(value) {
	const localPath = /(^|[\s"'([{,])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/]|\/(?:Users|home|tmp|var|mnt|workspace|app)\/)/i
	const internalName = /\b(?:PPTX_ULTIMATE_DECYPHER_TOOL|engine\.mjs|spec-compiler\.mjs|node_modules|betterpptx-mcp|dist[\\/]node|src[\\/])\b/i
	const rawXml = /<(?:p|a|r|pkg|Relationships|Types)[:\s>]/i
	return collectStringHits(value, text => localPath.test(text) || internalName.test(text) || rawXml.test(text))
}

function referencePath() {
	const candidates = [
		path.resolve('tmp_autonomous_test', '3DanimationFrozenReference.pptx'),
		path.resolve('3d-gradient-style-advertising-agency.pptx'),
	]
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate
	}
	fail('No reference PPTX found for ultimate model open_uploaded verifier.', { candidates })
}

async function main() {
	const pptxPath = referencePath()
	const context = { sessionId: `verify-ultimate-model-open-uploaded-${Date.now()}` }
	const data = fs.readFileSync(pptxPath).toString('base64')

	const opened = okResult('open_uploaded', await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data,
		fileName: path.basename(pptxPath),
		slideNumbers: [1, 2],
		preserveTiming: true,
	}, context))
	const diagnostics = getBetterPptxDeckDiagnostics(opened.deckId)
	if (diagnostics.decypherEngine !== 'ultimate') {
		fail('open_uploaded did not use the ultimate decypher model path.', { diagnostics })
	}

	const exported = okResult('export_spec', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: opened.deckId,
		detail: 'summary',
	}, context))
	if ((exported.spec?.slides || []).length !== opened.slideCount) {
		fail('export_spec slide count did not match uploaded deck.', { opened, exportedSlides: exported.spec?.slides?.length || 0 })
	}
	if (exported.privacy?.rawXmlIncluded !== false || exported.privacy?.localPathsIncluded !== false || exported.privacy?.privateImplementationIncluded !== false) {
		fail('export_spec privacy summary reports public leakage.', exported.privacy || {})
	}

	const leaks = publicLeakHits({ opened, exported })
	if (leaks.length) fail('Public upload/export response contains private implementation details.', { leaks: leaks.slice(0, 20) })

	console.log('ULTIMATE MODEL OPEN_UPLOADED VERIFY: PASS')
	console.log(JSON.stringify({
		decypherEngine: diagnostics.decypherEngine,
		slideCount: opened.slideCount,
		shapeCount: opened.shapeCount,
		exportedSlides: exported.spec.slides.length,
		editabilityCount: exported.editabilityMap?.length || 0,
	}, null, 2))
}

main().catch(err => fail(err?.message || String(err), { stack: err?.stack }))
