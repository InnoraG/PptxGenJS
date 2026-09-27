#!/usr/bin/env node
// Day-zero AI capability parity baseline.
// Compares a raw pptxgenjs-style code path with the BetterPPTX MCP tool path
// and records an explicit resident-skill arm placeholder for later agent-driver wiring.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { runBrainCodeEquivalence } from './run-ai-brain-code-equivalence.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER ??= '1'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const DEFAULT_OUTPUT_ROOT = path.resolve(root, 'outputs', 'ai-capability-parity-baseline')
const PPTX_CJS_RUNTIME = path.resolve(root, 'dist', 'pptxgen.cjs.js')
const require = createRequire(import.meta.url)

const SCENARIOS = [
	{
		id: 'track-a-executive-5',
		track: 'creation',
		title: 'Executive Growth Review',
		slides: [
			['Executive Growth Review', 'Revenue acceleration, risk concentration, and operating priorities.'],
			['Signal Summary', 'Pipeline is healthy, but late-stage conversion risk needs immediate action.'],
			['Operating Metrics', 'Quality, speed, and margin are moving in the right direction.'],
			['Decision Path', 'Focus the next 30 days on conversion, renewal, and support readiness.'],
			['Next Steps', 'Assign owners, freeze the operating cadence, and review weekly.'],
		],
	},
	{
		id: 'track-b-native-data',
		track: 'rich-native',
		title: 'Data Story Baseline',
		slides: [
			['Data Story Baseline', 'A compact chart and table deck for native PowerPoint validation.'],
			['Quarterly Trend', 'Growth is steady across Q1-Q4 with stronger Q4 expansion.'],
			['Risk Table', 'Two risks need owner assignment before the next review.'],
		],
	},
	{
		id: 'track-c-edit-existing',
		track: 'editing',
		title: 'Existing Deck Edit Baseline',
		slides: [
			['Original Title', 'This title is intentionally edited in the MCP arm.'],
			['Editable KPI', 'The KPI block is updated by object name.'],
		],
		edit: true,
	},
]

function usage() {
	console.log(`Usage:
node betterpptx-mcp/run-ai-capability-parity-baseline.mjs [options]

Options:
  --output-root <dir>      Output root. Default: outputs/ai-capability-parity-baseline
  --run-id <id>            Run id. Default: timestamped.
  --max-scenarios <n>      Limit scenarios. Default: all.
  --arms <list>            Comma list: raw,mcp,skill. Default: raw,mcp,skill.
  --skill-version <text>   Optional resident presentation skill version label.
  --include-brain-code     Run Track E: AI brain PptxGenJS code vs MCP spec equivalence.
  --brain-code-max-scenarios <n>
                            Limit Track E scenarios. Default: all.
`)
}

function parseArgs(argv) {
	const opts = {
		outputRoot: DEFAULT_OUTPUT_ROOT,
		runId: `parity-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', 'z')}`,
		maxScenarios: SCENARIOS.length,
		arms: ['raw', 'mcp', 'skill'],
		skillVersion: '',
		includeBrainCode: false,
		brainCodeMaxScenarios: Number.POSITIVE_INFINITY,
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--output-root' && argv[i + 1]) { opts.outputRoot = path.resolve(argv[++i]); continue }
		if (arg === '--run-id' && argv[i + 1]) { opts.runId = String(argv[++i]); continue }
		if (arg === '--max-scenarios' && argv[i + 1]) { opts.maxScenarios = Math.max(1, Number(argv[++i]) || 1); continue }
		if (arg === '--arms' && argv[i + 1]) { opts.arms = String(argv[++i]).split(',').map(s => s.trim()).filter(Boolean); continue }
		if (arg === '--skill-version' && argv[i + 1]) { opts.skillVersion = String(argv[++i]); continue }
		if (arg === '--include-brain-code') { opts.includeBrainCode = true; continue }
		if (arg === '--brain-code-max-scenarios' && argv[i + 1]) { opts.brainCodeMaxScenarios = Math.max(1, Number(argv[++i]) || 1); continue }
		if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
		throw new Error(`Unknown argument: ${arg}`)
	}
	return opts
}

function mkdirp(dir) {
	fs.mkdirSync(dir, { recursive: true })
}

function appendJsonl(file, row) {
	fs.appendFileSync(file, JSON.stringify(row) + '\n')
}

async function pptxStats(filePath) {
	const buf = fs.readFileSync(filePath)
	const zip = await JSZip.loadAsync(buf)
	const files = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	return {
		bytes: buf.length,
		slideCount: files.filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).length,
		chartCount: files.filter(name => /^ppt\/charts\/chart\d+\.xml$/i.test(name)).length,
		mediaCount: files.filter(name => /^ppt\/media\//i.test(name)).length,
		hasContentTypes: files.includes('[Content_Types].xml'),
		hasPresentation: files.includes('ppt/presentation.xml'),
	}
}

async function rawArm(scenario, outDir) {
	const started = Date.now()
	const PptxGenJS = require(PPTX_CJS_RUNTIME)
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	pptx.author = 'BetterPPTX parity baseline'
	pptx.company = 'BetterPPTX'
	pptx.subject = scenario.track
	pptx.title = scenario.title
	for (let i = 0; i < scenario.slides.length; i++) {
		const [title, body] = scenario.slides[i]
		const slide = pptx.addSlide()
		slide.background = { color: i === 0 ? '0B1220' : 'FFFFFF' }
		const dark = i === 0
		slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.12, fill: { color: '20D6E7' }, line: { color: '20D6E7', transparency: 100 } })
		slide.addText(title, { x: 0.72, y: 0.62, w: 11.8, h: 0.52, fontFace: 'Aptos Display', fontSize: i === 0 ? 30 : 24, bold: true, color: dark ? 'F7FAFC' : '0B1220', margin: 0.02, fit: 'shrink' })
		slide.addText(body, { x: 0.78, y: 1.42, w: 7.5, h: 0.86, fontSize: 15, color: dark ? 'CBD5E1' : '334155', margin: 0.04, fit: 'shrink' })
		slide.addShape(pptx.ShapeType.roundRect, { x: 9.0, y: 1.35, w: 2.55, h: 1.0, rectRadius: 0.08, fill: { color: dark ? '162E42' : 'F8FAFC' }, line: { color: '20D6E7', width: 1 } })
		slide.addText(`${85 + i * 2}%`, { x: 9.2, y: 1.55, w: 2.1, h: 0.35, fontSize: 20, bold: true, color: dark ? 'F7FAFC' : '0B1220', align: 'center', margin: 0 })
	}
	const filePath = path.join(outDir, `${scenario.id}.raw.pptx`)
	await pptx.writeFile({ fileName: filePath })
	return { status: 'passed', filePath, ...(await pptxStats(filePath)), durationMs: Date.now() - started }
}

async function mcpArm(scenario, outDir) {
	const started = Date.now()
	const { callBetterPptxTool } = await import('./engine.mjs')
	const context = { sessionId: `parity-${scenario.id}`, clientInfo: { name: 'ai-capability-parity-baseline', version: '1' } }
	const call = async (name, args = {}) => {
		const result = await callBetterPptxTool(name, args, context)
		if (!result.ok) throw new Error(`${name}: ${result.error?.code || ''} ${result.error?.message || 'failed'}`)
		return result.data
	}
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: scenario.title,
		audience: 'Benchmark reviewer',
		objective: `Benchmark ${scenario.track} deck generation through BetterPPTX MCP.`,
		styleIntent: { density: 'benchmark-medium', tone: 'direct', visualSystem: 'native editable PowerPoint' },
		theme: { name: 'Parity Benchmark', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		sections: [{ id: 'main', title: 'Main', slideIds: scenario.slides.map((_slide, i) => `${scenario.id}-s${i + 1}`) }],
		assets: [],
		data: scenario.track === 'rich-native' ? [{
			name: 'quarterly-trend',
			dataSource: 'benchmark-fixture',
			provenance: 'Deterministic benchmark fixture',
			verified: true,
			series: [{ name: 'growth', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [12, 16, 19, 24] }],
		}] : [],
		validation: { previewBeforeSave: true, validateBeforeSave: true, minDesignScore: 60, requireAccessibility: true },
		slides: scenario.slides.map(([title, body], i) => {
			const slideId = `${scenario.id}-s${i + 1}`
			const content = [
				{ kind: 'title', name: 'main-title', text: title },
				{ kind: 'body', name: 'main-body', text: body },
			]
			if (scenario.track === 'rich-native' && i === 1) {
				return {
					id: slideId,
					title,
					role: 'evidence',
					message: body,
					layoutIntent: 'chart-left-insights-right',
					content: [
						{ kind: 'chart-panel', name: 'trend-chart', dataRef: 'quarterly-trend', dataSource: 'benchmark-fixture', provenance: 'Deterministic benchmark fixture', verified: true },
						{ kind: 'body', name: 'right-insights', items: [{ name: 'growth', text: body, provenance: 'Deterministic benchmark fixture', verified: true }] },
					],
					notes: body,
				}
			}
			return { id: slideId, title, role: i === 0 ? 'opener' : 'content', message: body, layoutIntent: 'title-body', content, notes: body }
		}),
	}
	const generated = await call('betterpptx.deck.generate_from_spec', { spec, detail: 'full', validateAfterCompile: true })
	const deckId = generated.deckId
	let deckVersion = generated.deckVersion
	if (scenario.edit) {
		const edited = await call('betterpptx.slide.revise', {
			deckId,
			deckVersion,
			slideIndex: 0,
			target: { objectName: `${scenario.id}-s1.main-title.title` },
			patch: { text: 'Edited Title', style: { color: '20D6E7' }, fit: 'shrink' },
		})
		deckVersion = edited.deckVersion
	}
	const validation = await call('betterpptx.deck.validate', { deckId, mode: 'normal' })
	const design = await call('betterpptx.deck.validate_design', { deckId, minScore: 60, requireVisualProof: false })
	const accessibility = await call('betterpptx.deck.validate_accessibility', { deckId })
	const save = await call('betterpptx.deck.save', { deckId, deckVersion, fileName: `${scenario.id}.mcp.pptx`, outputDir: outDir })
	const filePath = save.filePath || path.join(outDir, `${scenario.id}.mcp.pptx`)
	return {
		status: 'passed',
		filePath,
		validationOk: validation.ok,
		designOk: design.ok,
		designScore: design.score,
		accessibilityPassed: accessibility.passed,
		compilerPlanDigest: generated.planDigest,
		deckVersion: save.deckVersion,
		...(await pptxStats(filePath)),
		durationMs: Date.now() - started,
	}
}

async function skillArm(scenario, _outDir, opts) {
	return {
		status: 'not_run',
		reason: 'resident presentation skill requires an interactive agent driver; placeholder arm records the benchmark slot until that driver is wired',
		skillVersion: opts.skillVersion || 'unrecorded',
		slideCount: scenario.slides.length,
	}
}

async function runArm(arm, scenario, outDir, opts) {
	if (arm === 'raw') return rawArm(scenario, outDir)
	if (arm === 'mcp') return mcpArm(scenario, outDir)
	if (arm === 'skill') return skillArm(scenario, outDir, opts)
	throw new Error(`Unknown arm: ${arm}`)
}

async function main() {
	const opts = parseArgs(process.argv.slice(2))
	const runDir = path.join(opts.outputRoot, opts.runId)
	const deckDir = path.join(runDir, 'decks')
	mkdirp(deckDir)
	const resultsFile = path.join(runDir, 'per-arm-results.jsonl')
	const scenarios = SCENARIOS.slice(0, opts.maxScenarios)
	const manifest = {
		runId: opts.runId,
		createdAt: new Date().toISOString(),
		scoreVersion: 'ai-capability-parity-baseline.v1',
		driverVersion: 'local-deterministic-harness.v2-semantic-spec',
		outputRoot: opts.outputRoot,
		arms: opts.arms,
		scenarios: scenarios.map(({ id, track, title }) => ({ id, track, title })),
		trackE: opts.includeBrainCode ? {
			id: 'track-e-ai-brain-code-equivalence',
			status: 'scheduled',
			maxScenarios: Number.isFinite(opts.brainCodeMaxScenarios) ? opts.brainCodeMaxScenarios : 'all',
		} : {
			id: 'track-e-ai-brain-code-equivalence',
			status: 'not_run',
			reason: 'Pass --include-brain-code to run the promoted brain-code MCP equivalence lane.',
		},
	}
	fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

	const rows = []
	for (const scenario of scenarios) {
		for (const arm of opts.arms) {
			const started = Date.now()
			let row
			try {
				const result = await runArm(arm, scenario, deckDir, opts)
				row = { runId: opts.runId, scenarioId: scenario.id, track: scenario.track, arm, startedAt: new Date(started).toISOString(), endedAt: new Date().toISOString(), ...result }
			} catch (err) {
				row = { runId: opts.runId, scenarioId: scenario.id, track: scenario.track, arm, status: 'failed', startedAt: new Date(started).toISOString(), endedAt: new Date().toISOString(), error: { message: String(err?.message || err), stack: err?.stack } }
			}
			rows.push(row)
			appendJsonl(resultsFile, row)
		}
	}
	let trackE = {
		id: 'track-e-ai-brain-code-equivalence',
		status: 'not_run',
		reason: 'Pass --include-brain-code to run the promoted brain-code MCP equivalence lane.',
	}
	if (opts.includeBrainCode) {
		const trackEResult = await runBrainCodeEquivalence({
			outputRoot: path.join(runDir, 'track-e'),
			runId: 'ai-brain-code-mcp-equivalence',
			maxScenarios: opts.brainCodeMaxScenarios,
		})
		trackE = {
			id: 'track-e-ai-brain-code-equivalence',
			status: trackEResult.summary.failed ? 'failed' : 'passed',
			outputDir: trackEResult.summary.outputDir,
			scenarios: trackEResult.summary.scenarios,
			passed: trackEResult.summary.passed,
			failed: trackEResult.summary.failed,
			meanScore: trackEResult.summary.meanScore,
			minScore: trackEResult.summary.minScore,
		}
	}
	const summary = {
		runId: opts.runId,
		outputDir: runDir,
		total: rows.length,
		passed: rows.filter(r => r.status === 'passed').length,
		failed: rows.filter(r => r.status === 'failed').length,
		notRun: rows.filter(r => r.status === 'not_run').length,
		byArm: Object.fromEntries(opts.arms.map(arm => {
			const armRows = rows.filter(r => r.arm === arm)
			return [arm, {
				total: armRows.length,
				passed: armRows.filter(r => r.status === 'passed').length,
				failed: armRows.filter(r => r.status === 'failed').length,
				notRun: armRows.filter(r => r.status === 'not_run').length,
				meanDurationMs: Math.round(armRows.filter(r => Number.isFinite(r.durationMs)).reduce((sum, r) => sum + r.durationMs, 0) / Math.max(1, armRows.filter(r => Number.isFinite(r.durationMs)).length)),
			}]
		})),
		trackE,
		nextWork: [
			'Replace the skill placeholder with an interactive resident-skill agent driver.',
			'Add repair oracle integration for generated decks.',
			opts.includeBrainCode
				? 'Use Track E scenarios below 90/100 to decide whether Semantic Deck Spec needs a new intent or stronger compiler defaults.'
				: 'Run with --include-brain-code to evaluate Track E brain-code MCP equivalence inside this baseline.',
			'Add reference-recreation scenarios once public-safe tools exist.',
		],
	}
	fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2))
	const runFailed = Boolean(summary.failed || (summary.trackE?.status === 'failed'))
	const trackEText = summary.trackE?.status === 'passed' ? ` trackE=${summary.trackE.meanScore}/100` : ` trackE=${summary.trackE.status}`
	console.log(`AI CAPABILITY PARITY BASELINE: ${runFailed ? 'FAIL' : 'PASS'} passed=${summary.passed}/${summary.total} notRun=${summary.notRun}${trackEText}`)
	console.log(`AI CAPABILITY PARITY BASELINE: output=${runDir}`)
	if (runFailed) process.exit(1)
}

main().catch(err => {
	console.error(`AI CAPABILITY PARITY BASELINE: FAIL ${err?.stack || err}`)
	process.exit(1)
})
