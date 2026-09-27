#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { callBetterPptxTool } from './engine.mjs'

function fail(message, detail = {}) {
	console.error('EXPORT SPEC ROUNDTRIP VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value))
}

function wavSilence(durationMs = 500, sampleRate = 8000) {
	const samples = Math.max(1, Math.round(sampleRate * durationMs / 1000))
	const dataBytes = samples * 2
	const buffer = Buffer.alloc(44 + dataBytes)
	buffer.write('RIFF', 0)
	buffer.writeUInt32LE(36 + dataBytes, 4)
	buffer.write('WAVE', 8)
	buffer.write('fmt ', 12)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(1, 22)
	buffer.writeUInt32LE(sampleRate, 24)
	buffer.writeUInt32LE(sampleRate * 2, 28)
	buffer.writeUInt16LE(2, 32)
	buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36)
	buffer.writeUInt32LE(dataBytes, 40)
	return buffer
}

function collectStrings(value, out = []) {
	if (typeof value === 'string') out.push(value)
	else if (Array.isArray(value)) value.forEach(item => collectStrings(item, out))
	else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, out))
	return out
}

function textLeaks(value) {
	const strings = collectStrings(value)
	const patterns = [
		/(^|[^A-Za-z0-9_])[A-Za-z]:[\\/](?![\\/])/,
		/\/Users\//,
		/\/tmp\//,
		/\bnode_modules\b/i,
		/\bengine\.mjs\b/i,
		/\bspec-compiler\.mjs\b/i,
		/\bPptxGenJS\b/i,
		/<(?:p|a|r|pkg):/i,
	]
	return patterns.filter(rx => strings.some(text => rx.test(text))).map(String)
}

function findBlock(spec, kind, predicate = () => true) {
	for (const slide of spec.slides || []) {
		for (const block of slide.content || []) {
			if (block.kind === kind && predicate(block, slide)) return { block, slide }
		}
	}
	return null
}

function assertExportBlockCoverage(spec) {
	const typedChecks = [
		['chart-panel', block => block.chartType && Array.isArray(block.data) && block.data.length],
		['table-panel', block => Array.isArray(block.rows) && block.rows.length >= 2],
		['equation', block => block.source],
		['smartart', block => Array.isArray(block.nodes) && block.nodes.length >= 2],
	]
	const missing = []
	for (const [kind, predicate] of typedChecks) {
		if (!findBlock(spec, kind, predicate)) missing.push(kind)
	}
	if (missing.length) fail('export_spec did not preserve expected structured generation fields.', { missing, spec })
	const mediaOrOpaque = findBlock(spec, 'media', block => block.data || block.link || block.path || block.lockedMedia) ||
		findBlock(spec, 'opaqueNative', block => /^asset:\/\/locked\/opaque-native\//.test(String(block.preservationHandle || '')))
	if (!mediaOrOpaque) fail('export_spec did not preserve media as structured media or durable opaqueNative.', { spec })
}

function mutatePatchSpec(spec) {
	const patchSpec = cloneJson(spec)
	const chart = findBlock(patchSpec, 'chart-panel')?.block
	if (chart) {
		chart.chartType = 'line'
		chart.data = [{ name: 'Series 1', labels: ['Q1', 'Q2', 'Q3'], values: [3, 5, 8] }]
		chart.patch = { optionsPatch: { showLegend: false } }
	}
	const table = findBlock(patchSpec, 'table-panel')?.block
	if (table) {
		table.rows = [['Metric', 'Value'], ['Regenerated', 'yes'], ['Patch', 'typed']]
	}
	const equation = findBlock(patchSpec, 'equation')?.block
	if (equation) {
		equation.source = 'a^2+b^2=c^2'
		equation.sourceFormat = 'unicodeMath'
		equation.style = { ...(equation.style || {}), color: '2563EB', fontSize: 18 }
	}
	const smartart = findBlock(patchSpec, 'smartart')?.block
	if (smartart) {
		smartart.nodes = ['Export', 'Patch', 'Validate']
	}
	return patchSpec
}

async function main() {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-export-roundtrip-'))
	const sourcePath = path.join(tempDir, 'source-roundtrip.pptx')
	const replayPath = path.join(tempDir, 'replayed-roundtrip.pptx')
	const replacedPath = path.join(tempDir, 'replaced-roundtrip.pptx')
	const audioData = `data:audio/wav;base64,${wavSilence().toString('base64')}`
	const creationContext = { sessionId: `verify-export-source-${Date.now()}` }
	const sourceSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Export Spec Roundtrip Source',
		layout: 'LAYOUT_WIDE',
		authoringContract: {
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			textPolicy: 'shape is geometry-only; use textBox or textShape for text',
		},
		sections: [],
		assets: [],
		data: [],
		validation: { profile: 'standard' },
		slides: [{
			id: 'roundtrip-1',
			title: 'Roundtrip Coverage',
			layoutIntent: 'title-body',
			background: { color: 'FFFFFF' },
			content: [
				{ kind: 'title', name: 'title', text: 'JSON spec export roundtrip' },
				{ kind: 'textBox', name: 'body', text: 'Generated, uploaded, exported, regenerated, replaced, and patched through one JSON spec.' },
				{ kind: 'shape', name: 'signal', shapeName: 'roundRect', bbox: { x: 0.7, y: 1.1, w: 2.1, h: 0.55 }, style: { fill: { color: 'E0F2FE' }, line: { color: '0284C7', width: 1 } } },
				{
					kind: 'chart-panel',
					name: 'sales-chart',
					bbox: { x: 0.8, y: 2.0, w: 3.2, h: 1.5 },
					chartType: 'bar',
					data: [{ name: 'Series 1', labels: ['Q1', 'Q2', 'Q3'], values: [1, 2, 4] }],
					chartOptions: { showLegend: false },
					provenance: 'Synthetic verifier data',
					verified: true,
				},
				{
					kind: 'table-panel',
					name: 'status-table',
					bbox: { x: 4.3, y: 2.0, w: 3.0, h: 1.1 },
					rows: [['Step', 'State'], ['Export', 'ready'], ['Replay', 'ready']],
					tableOptions: { margin: 0.04 },
					provenance: 'Synthetic verifier data',
					verified: true,
				},
				{ kind: 'equation', name: 'equation-main', bbox: { x: 8.0, y: 1.2, w: 2.4, h: 0.6 }, source: 'x^2+y^2=z^2', sourceFormat: 'unicodeMath' },
				{ kind: 'smartart', name: 'process-flow', bbox: { x: 8.0, y: 2.1, w: 3.0, h: 1.2 }, layout: 'process', nodes: ['Generate', 'Export', 'Replay'] },
				{ kind: 'media', name: 'audio-clip', bbox: { x: 11.4, y: 0.45, w: 0.45, h: 0.35 }, mediaType: 'audio', data: audioData, extn: 'wav', mediaOptions: { type: 'audio', interactivePlayback: true } },
			],
		}],
	}

	const created = okResult('source generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: sourceSpec,
		phase: 'commit',
		detail: 'summary',
		validateAfterCompile: true,
	}, creationContext))
	okResult('source save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: created.deckId,
		fileName: sourcePath,
	}, creationContext))

	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
	const publicContext = { sessionId: `verify-export-public-${Date.now()}` }
	const bytes = await fs.readFile(sourcePath)
	const opened = okResult('open_uploaded', await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: 'source-roundtrip.pptx',
		preserveTiming: true,
	}, publicContext))
	const exported = okResult('export_spec', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: opened.deckId,
		detail: 'full',
	}, publicContext))
	if (exported.privacy?.rawXmlIncluded !== false || exported.privacy?.localPathsIncluded !== false) fail('export_spec privacy flags are not public-safe.', exported.privacy)
	const leaks = textLeaks(exported.spec)
	if (leaks.length) fail('exported spec leaked private implementation details.', { leaks, spec: exported.spec })
	assertExportBlockCoverage(exported.spec)

	const replayed = okResult('replay generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: exported.spec,
		phase: 'commit',
		detail: 'summary',
		validateAfterCompile: true,
	}, publicContext))
	okResult('replay validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId: replayed.deckId }, publicContext))
	okResult('replay save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: replayed.deckId,
		fileName: replayPath,
	}, publicContext))
	const replaySummary = okResult('replay summary', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: replayed.deckId,
	}, publicContext))

	const replaced = okResult('replaceDeck generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: replayed.deckId,
		deckVersion: replaySummary.deckVersion,
		commitMode: 'replaceDeck',
		phase: 'commit',
		spec: exported.spec,
		detail: 'summary',
		validateAfterCompile: true,
	}, publicContext))
	okResult('replace validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId: replayed.deckId }, publicContext))
	okResult('replace save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: replayed.deckId,
		fileName: replacedPath,
	}, publicContext))
	const replacedSummary = okResult('replace summary', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: replayed.deckId,
	}, publicContext))

	const patched = okResult('patch exported spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: replayed.deckId,
		deckVersion: replacedSummary.deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec: mutatePatchSpec(exported.spec),
		detail: 'summary',
	}, publicContext))
	if (!Array.isArray(patched.patchResults) || patched.patchResults.length < 3) fail('patch commit did not produce enough typed patch results.', patched)
	okResult('patch validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId: replayed.deckId }, publicContext))

	console.log('EXPORT SPEC ROUNDTRIP VERIFY: PASS')
	console.log(JSON.stringify({
		sourceDeckId: created.deckId,
		uploadedDeckId: opened.deckId,
		replayedDeckId: replayed.deckId,
		exportedSlides: exported.spec.slides.length,
		byTier: exported.byTier,
		patchResults: patched.patchResults.length,
		outputs: { sourcePath, replayPath, replacedPath },
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
