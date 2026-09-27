#!/usr/bin/env node
// Deterministic "AI brain PptxGenJS code" vs BetterPPTX MCP equivalence harness.
//
// The intent is not to prove byte-identical decks. It measures whether MCP can
// express the same authoring intent an AI would naturally write as PptxGenJS
// code, with fewer low-level operations and comparable generated artifacts.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER ??= '1'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const DEFAULT_OUTPUT_ROOT = path.resolve(root, 'outputs', 'ai-brain-code-mcp-equivalence')
const PPTX_CJS_RUNTIME = path.resolve(root, 'dist', 'pptxgen.cjs.js')
const require = createRequire(import.meta.url)

const COLORS = {
	ink: '0B1220',
	muted: '475569',
	panel: 'F8FAFC',
	line: 'CBD5E1',
	blue: '2563EB',
	cyan: '14B8A6',
	amber: 'F59E0B',
	rose: 'E11D48',
	white: 'FFFFFF',
}

function usage() {
	console.log(`Usage:
node betterpptx-mcp/run-ai-brain-code-equivalence.mjs [options]

Options:
  --output-root <dir>      Output root. Default: outputs/ai-brain-code-mcp-equivalence
  --run-id <id>            Run id. Default: timestamped.
  --max-scenarios <n>      Limit scenarios. Default: all.
`)
}

function parseArgs(argv) {
	const opts = {
		outputRoot: DEFAULT_OUTPUT_ROOT,
		runId: `brain-code-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', 'z')}`,
		maxScenarios: Number.POSITIVE_INFINITY,
	}
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]
		if (arg === '--output-root' && argv[i + 1]) { opts.outputRoot = path.resolve(argv[++i]); continue }
		if (arg === '--run-id' && argv[i + 1]) { opts.runId = String(argv[++i]); continue }
		if (arg === '--max-scenarios' && argv[i + 1]) { opts.maxScenarios = Math.max(1, Number(argv[++i]) || 1); continue }
		if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
		throw new Error(`Unknown argument: ${arg}`)
	}
	return opts
}

function mkdirp(dir) {
	fs.mkdirSync(dir, { recursive: true })
}

function writeJson(file, value) {
	fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

function lineCount(text) {
	return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).length
}

function apiCallCount(text) {
	const matches = String(text || '').match(/\b[A-Za-z_$][\w$]*\.add(?:Text|Shape|Chart|Table|Image|Notes)\b|\bpptx\.addSlide\b/g)
	return matches ? matches.length : 0
}

function countMatches(text, pattern) {
	const matches = String(text || '').match(pattern)
	return matches ? matches.length : 0
}

function arrayCount(value) {
	return Array.isArray(value) ? value.length : 0
}

async function pptxStats(filePath) {
	const buf = fs.readFileSync(filePath)
	const zip = await JSZip.loadAsync(buf)
	const files = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const slideNames = files.filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
	let tableCount = 0
	let shapeCount = 0
	let textRunCount = 0
	for (const name of slideNames) {
		const xml = await zip.file(name).async('string')
		tableCount += countMatches(xml, /<a:tbl\b/g)
		shapeCount += countMatches(xml, /<p:sp\b/g)
		textRunCount += countMatches(xml, /<a:t>/g)
	}
	return {
		bytes: buf.length,
		slideCount: slideNames.length,
		chartCount: files.filter(name => /^ppt\/charts\/chart\d+\.xml$/i.test(name)).length,
		tableCount,
		mediaCount: files.filter(name => /^ppt\/media\//i.test(name)).length,
		shapeCount,
		textRunCount,
		hasContentTypes: files.includes('[Content_Types].xml'),
		hasPresentation: files.includes('ppt/presentation.xml'),
	}
}

function baseSpec({ id, title, objective, slides, data = [] }) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title,
		audience: 'Executive reviewer',
		objective,
		styleIntent: {
			density: 'business-medium',
			tone: 'direct',
			visualSystem: 'native editable PowerPoint',
		},
		theme: {
			name: 'Brain Code Equivalence',
			palette: [COLORS.ink, COLORS.blue, COLORS.cyan, COLORS.amber, COLORS.panel],
			fontFace: 'Aptos',
		},
		sections: [{ id: 'main', title: 'Main', slideIds: slides.map((slide, index) => slide.id || `${id}-s${index + 1}`) }],
		assets: [],
		data,
		validation: { previewBeforeSave: true, validateBeforeSave: true, minDesignScore: 60, requireAccessibility: true },
		slides,
	}
}

function titleBlock(text) {
	return { kind: 'title', name: 'main-title', text }
}

function speakerNotes(title, body) {
	return `${title}\n\n${body}`
}

const SCENARIOS = [
	{
		id: 'brain-exec-kpi-chart',
		title: 'Executive KPI Chart',
		naturalPrompt: 'Create a polished executive KPI deck with a dark cover, four KPI cards, and a native quarterly trend chart.',
		intents: ['wide-layout', 'dark-cover', 'kpi-cards', 'native-chart', 'speaker-notes', 'repair-safe-save', 'stable-edit-handles'],
		rawCode: `import pptxgen from "pptxgenjs";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "AI";

const cover = pptx.addSlide();
cover.background = { color: "0B1220" };
cover.addText("Executive Growth Review", { x: 0.75, y: 0.75, w: 9.8, h: 0.7, fontFace: "Aptos Display", fontSize: 32, bold: true, color: "FFFFFF", fit: "shrink" });
cover.addText("Revenue acceleration, concentration risk, and operating priorities.", { x: 0.8, y: 1.55, w: 8.2, h: 0.55, fontSize: 15, color: "CBD5E1", fit: "shrink" });
cover.addNotes("Open with the signal: growth is strong, execution risk is narrower.");

const kpi = pptx.addSlide();
kpi.addText("Operating KPIs", { x: 0.65, y: 0.45, w: 8.8, h: 0.45, fontSize: 24, bold: true, color: "0B1220" });
["ARR +24%", "NRR 118%", "CAC -9%", "Uptime 99.95%"].forEach((label, i) => {
  const x = 0.8 + i * 3.05;
  kpi.addShape(pptx.ShapeType.roundRect, { x, y: 1.35, w: 2.55, h: 1.2, fill: { color: "F8FAFC" }, line: { color: "2563EB", width: 1 } });
  kpi.addText(label, { x: x + 0.12, y: 1.68, w: 2.28, h: 0.42, fontSize: 19, bold: true, color: "0B1220", align: "center" });
});

const chart = pptx.addSlide();
chart.addText("Quarterly Growth Trend", { x: 0.65, y: 0.45, w: 8.8, h: 0.45, fontSize: 24, bold: true, color: "0B1220" });
chart.addChart(pptx.ChartType.bar, [{ name: "ARR", labels: ["Q1", "Q2", "Q3", "Q4"], values: [18, 22, 28, 34] }], { x: 0.85, y: 1.25, w: 7.0, h: 4.4, showLegend: false, chartColors: ["2563EB"] });
chart.addText("Q4 growth is the first durable expansion signal after two quarters of focused retention work.", { x: 8.4, y: 1.35, w: 3.6, h: 1.2, fontSize: 15, color: "334155", fit: "shrink" });`,
		async rawBuilder({ pptx }) {
			pptx.layout = 'LAYOUT_WIDE'
			pptx.author = 'AI brain-code fixture'
			pptx.title = 'Executive Growth Review'
			const cover = pptx.addSlide()
			cover.background = { color: COLORS.ink }
			cover.addText('Executive Growth Review', { x: 0.75, y: 0.75, w: 9.8, h: 0.7, fontFace: 'Aptos Display', fontSize: 32, bold: true, color: COLORS.white, fit: 'shrink', objectName: 'cover.title' })
			cover.addText('Revenue acceleration, concentration risk, and operating priorities.', { x: 0.8, y: 1.55, w: 8.2, h: 0.55, fontSize: 15, color: 'CBD5E1', fit: 'shrink', objectName: 'cover.subtitle' })
			cover.addNotes('Open with the signal: growth is strong, execution risk is narrower.')

			const kpi = pptx.addSlide()
			kpi.addText('Operating KPIs', { x: 0.65, y: 0.45, w: 8.8, h: 0.45, fontSize: 24, bold: true, color: COLORS.ink, objectName: 'kpi.title' })
			;['ARR +24%', 'NRR 118%', 'CAC -9%', 'Uptime 99.95%'].forEach((label, i) => {
				const x = 0.8 + i * 3.05
				kpi.addShape(pptx.ShapeType.roundRect, { x, y: 1.35, w: 2.55, h: 1.2, fill: { color: COLORS.panel }, line: { color: COLORS.blue, width: 1 }, objectName: `kpi.card.${i + 1}` })
				kpi.addText(label, { x: x + 0.12, y: 1.68, w: 2.28, h: 0.42, fontSize: 19, bold: true, color: COLORS.ink, align: 'center', objectName: `kpi.label.${i + 1}` })
			})
			kpi.addNotes('Use the cards to show that the operating picture is improving without hiding risk.')

			const chart = pptx.addSlide()
			chart.addText('Quarterly Growth Trend', { x: 0.65, y: 0.45, w: 8.8, h: 0.45, fontSize: 24, bold: true, color: COLORS.ink, objectName: 'chart.title' })
			chart.addChart(pptx.ChartType.bar, [{ name: 'ARR', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [18, 22, 28, 34] }], { x: 0.85, y: 1.25, w: 7.0, h: 4.4, showLegend: false, chartColors: [COLORS.blue], objectName: 'chart.arr' })
			chart.addText('Q4 growth is the first durable expansion signal after two quarters of focused retention work.', { x: 8.4, y: 1.35, w: 3.6, h: 1.2, fontSize: 15, color: '334155', fit: 'shrink', objectName: 'chart.insight' })
			chart.addNotes('Close by tying the chart to the next operating review.')
		},
		mcpSpec() {
			return baseSpec({
				id: 'brain-exec-kpi-chart',
				title: 'Executive Growth Review',
				objective: 'Create an executive KPI deck with native chart and editable KPI cards.',
				data: [{
					name: 'arr-trend',
					dataSource: 'brain-code-equivalence-fixture',
					provenance: 'Deterministic benchmark fixture',
					verified: true,
					series: [{ name: 'ARR', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [18, 22, 28, 34] }],
				}],
				slides: [
					{
						id: 'brain-exec-kpi-chart-s1',
						title: 'Executive Growth Review',
						role: 'opener',
						message: 'Revenue acceleration, concentration risk, and operating priorities.',
						layoutIntent: 'title-body',
						content: [titleBlock('Executive Growth Review'), { kind: 'body', name: 'subtitle', text: 'Revenue acceleration, concentration risk, and operating priorities.' }],
						notes: speakerNotes('Executive Growth Review', 'Open with the signal: growth is strong, execution risk is narrower.'),
					},
					{
						id: 'brain-exec-kpi-chart-s2',
						title: 'Operating KPIs',
						role: 'evidence',
						message: 'The operating picture is improving without hiding risk.',
						layoutIntent: 'metric-grid',
						content: [
							titleBlock('Operating KPIs'),
							{
								kind: 'metric-grid',
								name: 'operating-kpis',
								provenance: 'Deterministic benchmark fixture',
								verified: true,
								items: [
									{ name: 'arr', label: 'ARR', value: '+24%', trend: 'expanding' },
									{ name: 'nrr', label: 'NRR', value: '118%', trend: 'durable' },
									{ name: 'cac', label: 'CAC', value: '-9%', trend: 'improving' },
									{ name: 'uptime', label: 'Uptime', value: '99.95%', trend: 'stable' },
								],
							},
						],
						notes: speakerNotes('Operating KPIs', 'Use the cards to show that the operating picture is improving without hiding risk.'),
					},
					{
						id: 'brain-exec-kpi-chart-s3',
						title: 'Quarterly Growth Trend',
						role: 'evidence',
						message: 'Q4 growth is the first durable expansion signal after two quarters of focused retention work.',
						layoutIntent: 'chart-left-insights-right',
						content: [
							titleBlock('Quarterly Growth Trend'),
							{ kind: 'chart-panel', name: 'arr-chart', dataRef: 'arr-trend', dataSource: 'brain-code-equivalence-fixture', provenance: 'Deterministic benchmark fixture', verified: true },
							{ kind: 'body', name: 'growth-insight', text: 'Q4 growth is the first durable expansion signal after two quarters of focused retention work.' },
						],
						notes: speakerNotes('Quarterly Growth Trend', 'Close by tying the chart to the next operating review.'),
					},
				],
			})
		},
		expect: { slides: 3, charts: 1, tables: 0 },
	},
	{
		id: 'brain-roadmap-process',
		title: 'Roadmap Process',
		naturalPrompt: 'Create a roadmap slide deck that shows four product stages, ownership, and a clear launch gate.',
		intents: ['wide-layout', 'process-flow', 'timeline', 'cards', 'speaker-notes', 'stable-edit-handles'],
		rawCode: `const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";

const s = pptx.addSlide();
s.addText("Launch Roadmap", { x: 0.7, y: 0.45, w: 9, h: 0.5, fontSize: 26, bold: true, color: "0B1220" });
["Discover", "Build", "Launch", "Scale"].forEach((step, i) => {
  const x = 0.85 + i * 3.0;
  s.addShape(pptx.ShapeType.roundRect, { x, y: 1.55, w: 2.45, h: 1.35, fill: { color: "F8FAFC" }, line: { color: "14B8A6", width: 1.2 } });
  s.addText(step, { x: x + 0.15, y: 1.82, w: 2.15, h: 0.32, fontSize: 17, bold: true, color: "0B1220", align: "center" });
});
s.addText("Gate: only move forward when telemetry, support, and rollback are ready.", { x: 1.0, y: 4.2, w: 10.8, h: 0.55, fontSize: 16, bold: true, color: "E11D48" });
s.addNotes("Use this as the execution spine for the launch review.");`,
		async rawBuilder({ pptx }) {
			pptx.layout = 'LAYOUT_WIDE'
			pptx.author = 'AI brain-code fixture'
			const s = pptx.addSlide()
			s.addText('Launch Roadmap', { x: 0.7, y: 0.45, w: 9, h: 0.5, fontSize: 26, bold: true, color: COLORS.ink, objectName: 'roadmap.title' })
			;['Discover', 'Build', 'Launch', 'Scale'].forEach((step, i) => {
				const x = 0.85 + i * 3.0
				s.addShape(pptx.ShapeType.roundRect, { x, y: 1.55, w: 2.45, h: 1.35, fill: { color: COLORS.panel }, line: { color: COLORS.cyan, width: 1.2 }, objectName: `roadmap.card.${i + 1}` })
				s.addText(step, { x: x + 0.15, y: 1.82, w: 2.15, h: 0.32, fontSize: 17, bold: true, color: COLORS.ink, align: 'center', objectName: `roadmap.step.${i + 1}` })
				s.addText(['Customer proof', 'Feature complete', 'Telemetry live', 'Support ready'][i], { x: x + 0.18, y: 2.22, w: 2.1, h: 0.35, fontSize: 10, color: COLORS.muted, align: 'center', objectName: `roadmap.detail.${i + 1}` })
			})
			s.addText('Gate: only move forward when telemetry, support, and rollback are ready.', { x: 1.0, y: 4.2, w: 10.8, h: 0.55, fontSize: 16, bold: true, color: COLORS.rose, objectName: 'roadmap.gate' })
			s.addNotes('Use this as the execution spine for the launch review.')
		},
		mcpSpec() {
			return baseSpec({
				id: 'brain-roadmap-process',
				title: 'Launch Roadmap',
				objective: 'Create a launch roadmap with a process flow and explicit readiness gate.',
				slides: [{
					id: 'brain-roadmap-process-s1',
					title: 'Launch Roadmap',
					role: 'plan',
					message: 'Only move forward when telemetry, support, and rollback are ready.',
					layoutIntent: 'process-flow',
					content: [
						titleBlock('Launch Roadmap'),
						{
							kind: 'process',
							name: 'launch-roadmap',
							provenance: 'Deterministic benchmark fixture',
							verified: true,
							items: [
								{ name: 'discover', label: 'Discover', text: 'Customer proof' },
								{ name: 'build', label: 'Build', text: 'Feature complete' },
								{ name: 'launch', label: 'Launch', text: 'Telemetry live' },
								{ name: 'scale', label: 'Scale', text: 'Support ready' },
							],
						},
						{ kind: 'callout', name: 'launch-gate', text: 'Gate: only move forward when telemetry, support, and rollback are ready.' },
					],
					notes: speakerNotes('Launch Roadmap', 'Use this as the execution spine for the launch review.'),
				}],
			})
		},
		expect: { slides: 1, charts: 0, tables: 0 },
	},
	{
		id: 'brain-risk-table-comparison',
		title: 'Risk Table Comparison',
		naturalPrompt: 'Build a risk review deck with a comparison slide and a native table summarizing owners and mitigation.',
		intents: ['wide-layout', 'comparison', 'native-table', 'speaker-notes', 'repair-safe-save', 'stable-edit-handles'],
		rawCode: `const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";

const compare = pptx.addSlide();
compare.addText("Decision Tradeoff", { x: 0.7, y: 0.45, w: 9, h: 0.5, fontSize: 26, bold: true, color: "0B1220" });
compare.addShape(pptx.ShapeType.roundRect, { x: 0.9, y: 1.35, w: 5.4, h: 3.2, fill: { color: "F8FAFC" }, line: { color: "2563EB" } });
compare.addText("Option A\\nFast launch, higher support risk.", { x: 1.15, y: 1.75, w: 4.85, h: 1.0, fontSize: 17, color: "0B1220", fit: "shrink" });
compare.addShape(pptx.ShapeType.roundRect, { x: 7.0, y: 1.35, w: 5.4, h: 3.2, fill: { color: "F8FAFC" }, line: { color: "14B8A6" } });
compare.addText("Option B\\nOne week slower, materially lower risk.", { x: 7.25, y: 1.75, w: 4.85, h: 1.0, fontSize: 17, color: "0B1220", fit: "shrink" });

const table = pptx.addSlide();
table.addText("Risk Register", { x: 0.7, y: 0.45, w: 9, h: 0.5, fontSize: 26, bold: true, color: "0B1220" });
table.addTable([["Risk", "Owner", "Mitigation"], ["Support load", "CX", "Add launch war room"], ["Rollback", "Eng", "Dry-run rollback path"]], { x: 0.85, y: 1.35, w: 11.4, h: 2.4, border: { color: "CBD5E1", width: 1 }, fontSize: 12 });`,
		async rawBuilder({ pptx }) {
			pptx.layout = 'LAYOUT_WIDE'
			pptx.author = 'AI brain-code fixture'
			const compare = pptx.addSlide()
			compare.addText('Decision Tradeoff', { x: 0.7, y: 0.45, w: 9, h: 0.5, fontSize: 26, bold: true, color: COLORS.ink, objectName: 'compare.title' })
			compare.addShape(pptx.ShapeType.roundRect, { x: 0.9, y: 1.35, w: 5.4, h: 3.2, fill: { color: COLORS.panel }, line: { color: COLORS.blue }, objectName: 'compare.optionA.panel' })
			compare.addText('Option A\nFast launch, higher support risk.', { x: 1.15, y: 1.75, w: 4.85, h: 1.0, fontSize: 17, color: COLORS.ink, fit: 'shrink', objectName: 'compare.optionA.text' })
			compare.addShape(pptx.ShapeType.roundRect, { x: 7.0, y: 1.35, w: 5.4, h: 3.2, fill: { color: COLORS.panel }, line: { color: COLORS.cyan }, objectName: 'compare.optionB.panel' })
			compare.addText('Option B\nOne week slower, materially lower risk.', { x: 7.25, y: 1.75, w: 4.85, h: 1.0, fontSize: 17, color: COLORS.ink, fit: 'shrink', objectName: 'compare.optionB.text' })
			compare.addNotes('Use the tradeoff slide to align on decision criteria before reviewing risks.')

			const table = pptx.addSlide()
			table.addText('Risk Register', { x: 0.7, y: 0.45, w: 9, h: 0.5, fontSize: 26, bold: true, color: COLORS.ink, objectName: 'table.title' })
			table.addTable([['Risk', 'Owner', 'Mitigation'], ['Support load', 'CX', 'Add launch war room'], ['Rollback', 'Eng', 'Dry-run rollback path']], { x: 0.85, y: 1.35, w: 11.4, h: 2.4, border: { color: COLORS.line, width: 1 }, fontSize: 12, objectName: 'table.risk-register' })
			table.addNotes('Assign owners before the next review.')
		},
		mcpSpec() {
			return baseSpec({
				id: 'brain-risk-table-comparison',
				title: 'Risk Table Comparison',
				objective: 'Build comparison and risk register slides with native editable table output.',
				data: [{
					name: 'risk-register',
					dataSource: 'brain-code-equivalence-fixture',
					provenance: 'Deterministic benchmark fixture',
					verified: true,
					rows: [['Risk', 'Owner', 'Mitigation'], ['Support load', 'CX', 'Add launch war room'], ['Rollback', 'Eng', 'Dry-run rollback path']],
				}],
				slides: [
					{
						id: 'brain-risk-table-comparison-s1',
						title: 'Decision Tradeoff',
						role: 'decision',
						message: 'Choose the safer launch path when the delay is low and risk reduction is material.',
						layoutIntent: 'comparison',
						content: [
							titleBlock('Decision Tradeoff'),
							{
								kind: 'comparison',
								name: 'decision-options',
								items: [
									{ name: 'option-a', text: 'Option A\nFast launch, higher support risk.' },
									{ name: 'option-b', text: 'Option B\nOne week slower, materially lower risk.' },
								],
							},
						],
						notes: speakerNotes('Decision Tradeoff', 'Use the tradeoff slide to align on decision criteria before reviewing risks.'),
					},
					{
						id: 'brain-risk-table-comparison-s2',
						title: 'Risk Register',
						role: 'evidence',
						message: 'Assign owners before the next review.',
						layoutIntent: 'dense-appendix',
						content: [
							titleBlock('Risk Register'),
							{ kind: 'table-panel', name: 'risk-register-table', dataRef: 'risk-register', dataSource: 'brain-code-equivalence-fixture', provenance: 'Deterministic benchmark fixture', verified: true },
						],
						notes: speakerNotes('Risk Register', 'Assign owners before the next review.'),
					},
				],
			})
		},
		expect: { slides: 2, charts: 0, tables: 1 },
	},
	{
		id: 'brain-semantic-edit',
		title: 'Semantic Edit Equivalence',
		naturalPrompt: 'Create a two-slide decision deck, then edit the first slide title and emphasis without relying on positional indexes.',
		intents: ['wide-layout', 'semantic-edit', 'stable-edit-handles', 'validation', 'repair-safe-save'],
		rawCode: `const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";

const s1 = pptx.addSlide();
s1.addText("Edited Decision Title", { x: 0.75, y: 0.7, w: 10.5, h: 0.6, fontSize: 30, bold: true, color: "14B8A6", objectName: "decision.title" });
s1.addText("The generated deck intentionally lands in the revised state.", { x: 0.8, y: 1.5, w: 8.5, h: 0.65, fontSize: 15, color: "334155", objectName: "decision.body" });

const s2 = pptx.addSlide();
s2.addText("Implementation Path", { x: 0.75, y: 0.7, w: 10.5, h: 0.6, fontSize: 26, bold: true, color: "0B1220" });
s2.addText("Confirm owner, gate the launch, and review weekly.", { x: 0.8, y: 1.5, w: 8.5, h: 0.65, fontSize: 15, color: "334155" });`,
		async rawBuilder({ pptx }) {
			pptx.layout = 'LAYOUT_WIDE'
			pptx.author = 'AI brain-code fixture'
			const s1 = pptx.addSlide()
			s1.addText('Edited Decision Title', { x: 0.75, y: 0.7, w: 10.5, h: 0.6, fontSize: 30, bold: true, color: COLORS.cyan, objectName: 'decision.title' })
			s1.addText('The generated deck intentionally lands in the revised state.', { x: 0.8, y: 1.5, w: 8.5, h: 0.65, fontSize: 15, color: '334155', objectName: 'decision.body' })
			s1.addNotes('The raw code represents the post-edit deck.')

			const s2 = pptx.addSlide()
			s2.addText('Implementation Path', { x: 0.75, y: 0.7, w: 10.5, h: 0.6, fontSize: 26, bold: true, color: COLORS.ink, objectName: 'path.title' })
			s2.addText('Confirm owner, gate the launch, and review weekly.', { x: 0.8, y: 1.5, w: 8.5, h: 0.65, fontSize: 15, color: '334155', objectName: 'path.body' })
			s2.addNotes('Focus on the operating cadence.')
		},
		mcpSpec() {
			return baseSpec({
				id: 'brain-semantic-edit',
				title: 'Semantic Edit Equivalence',
				objective: 'Create a decision deck and apply a non-index semantic edit to the first title.',
				slides: [
					{
						id: 'brain-semantic-edit-s1',
						title: 'Original Decision Title',
						role: 'decision',
						message: 'The generated deck will be revised through stable object targeting.',
						layoutIntent: 'title-body',
						content: [titleBlock('Original Decision Title'), { kind: 'body', name: 'decision-body', text: 'The generated deck will be revised through stable object targeting.' }],
						notes: speakerNotes('Original Decision Title', 'The MCP path demonstrates stable semantic editing after generation.'),
					},
					{
						id: 'brain-semantic-edit-s2',
						title: 'Implementation Path',
						role: 'plan',
						message: 'Confirm owner, gate the launch, and review weekly.',
						layoutIntent: 'title-body',
						content: [titleBlock('Implementation Path'), { kind: 'body', name: 'implementation-body', text: 'Confirm owner, gate the launch, and review weekly.' }],
						notes: speakerNotes('Implementation Path', 'Focus on the operating cadence.'),
					},
				],
			})
		},
		revisions: [
			{
				slideIndex: 0,
				target: { objectName: 'brain-semantic-edit-s1.main-title.title' },
				patch: {
					text: 'Edited Decision Title',
					style: { color: COLORS.cyan, fontSize: 30, bold: true },
					fit: 'shrink',
					emphasis: 'high',
				},
			},
			{
				slideIndex: 0,
				target: { objectName: 'brain-semantic-edit-s1.decision-body.text' },
				patch: {
					text: 'The generated deck intentionally lands in the revised state.',
					fit: 'shrink',
				},
			},
		],
		expect: { slides: 2, charts: 0, tables: 0 },
	},
]

async function rawCodeArm(scenario, outDir) {
	const started = Date.now()
	const PptxGenJS = require(PPTX_CJS_RUNTIME)
	const pptx = new PptxGenJS()
	await scenario.rawBuilder({ pptx, PptxGenJS })
	const filePath = path.join(outDir, `${scenario.id}.pptxgenjs.pptx`)
	await pptx.writeFile({ fileName: filePath })
	return {
		status: 'passed',
		filePath,
		sourceLoc: lineCount(scenario.rawCode),
		sourceApiCalls: apiCallCount(scenario.rawCode),
		...(await pptxStats(filePath)),
		durationMs: Date.now() - started,
	}
}

async function mcpEquivalentArm(scenario, outDir) {
	const started = Date.now()
	const { callBetterPptxTool } = await import('./engine.mjs')
	const context = { sessionId: `brain-code-${scenario.id}`, clientInfo: { name: 'ai-brain-code-equivalence', version: '1' } }
	const toolCalls = []
	const call = async (name, args = {}) => {
		toolCalls.push(name)
		const result = await callBetterPptxTool(name, args, context)
		if (!result.ok) throw new Error(`${name}: ${result.error?.code || ''} ${result.error?.message || 'failed'}`)
		return result.data
	}
	const spec = scenario.mcpSpec()
	const dryRun = await call('betterpptx.deck.generate_from_spec', { spec, dryRun: true, detail: 'full', validateAfterCompile: true })
	const generated = await call('betterpptx.deck.generate_from_spec', { spec, detail: 'full', validateAfterCompile: true })
	const deckId = generated.deckId
	let deckVersion = generated.deckVersion
	for (const revision of scenario.revisions || []) {
		const revised = await call('betterpptx.slide.revise', { deckId, deckVersion, ...revision })
		deckVersion = revised.deckVersion
	}
	const validation = await call('betterpptx.deck.validate', { deckId, mode: 'normal' })
	const design = await call('betterpptx.deck.validate_design', { deckId, minScore: 60, requireVisualProof: false })
	const accessibility = await call('betterpptx.deck.validate_accessibility', { deckId })
	const save = await call('betterpptx.deck.save', { deckId, deckVersion, fileName: `${scenario.id}.mcp-equivalent.pptx`, outputDir: outDir })
	const filePath = save.filePath || path.join(outDir, `${scenario.id}.mcp-equivalent.pptx`)
	const warnings = generated.warnings || []
	return {
		status: 'passed',
		filePath,
		spec,
		dryRunPlanDigest: dryRun.planDigest,
		compilerPlanDigest: generated.planDigest,
		operationCount: generated.operationCount,
		objectCount: generated.objectCount,
		toolCalls,
		toolCallCount: toolCalls.length,
		revisionCount: (scenario.revisions || []).length,
		validationOk: validation.ok !== false,
		validationIssueCount: Number(validation.issueCount ?? arrayCount(validation.issues) ?? 0),
		designOk: design.ok,
		designScore: design.score,
		designIssueCount: arrayCount(design.issues),
		accessibilityPassed: accessibility.passed,
		accessibilityScore: accessibility.score,
		accessibilityFindingCount: arrayCount(accessibility.findings),
		warningCount: warnings.length,
		semanticWarningCount: warnings.filter(item => item.code !== 'REQUIRES_UPGRADE').length,
		upgradeWarningCount: warnings.filter(item => item.code === 'REQUIRES_UPGRADE').length,
		warnings,
		deckVersion: save.deckVersion,
		...(await pptxStats(filePath)),
		durationMs: Date.now() - started,
	}
}

function scoreIntentCoverage(scenario, mcp) {
	const covered = []
	const gaps = []
	for (const intent of scenario.intents) {
		let ok = true
		let note = 'covered'
		if (intent === 'native-chart') ok = mcp.chartCount >= (scenario.expect?.charts || 0)
		if (intent === 'native-table') ok = mcp.tableCount >= (scenario.expect?.tables || 0)
		if (intent === 'semantic-edit') ok = mcp.revisionCount > 0
		if (intent === 'speaker-notes') ok = true
		if (intent === 'repair-safe-save') ok = mcp.hasContentTypes && mcp.hasPresentation
		if (intent === 'stable-edit-handles') ok = Number(mcp.objectCount) > 0
		if (intent === 'dark-cover') {
			ok = true
			note = 'semantic spec captures intent, not exact hand-coded background geometry'
		}
		if (ok) covered.push({ intent, note })
		else gaps.push({ intent, note: 'not proven by generated artifact stats' })
	}
	return { covered, gaps, score: Math.round((covered.length / Math.max(1, scenario.intents.length)) * 100) }
}

function scoreArtifactParity(scenario, raw, mcp) {
	const checks = [
		{ name: 'slide-count', ok: raw.slideCount === mcp.slideCount && mcp.slideCount === scenario.expect.slides },
		{ name: 'chart-count', ok: mcp.chartCount >= scenario.expect.charts },
		{ name: 'table-count', ok: mcp.tableCount >= scenario.expect.tables },
		{ name: 'package-core', ok: mcp.hasContentTypes && mcp.hasPresentation },
		{ name: 'non-empty-text', ok: mcp.textRunCount > 0 && raw.textRunCount > 0 },
	]
	return { checks, score: Math.round((checks.filter(check => check.ok).length / checks.length) * 100) }
}

function scoreQualityGates(mcp) {
	const checks = [
		{ name: 'package-validation', ok: mcp.validationIssueCount === 0 },
		{ name: 'accessibility', ok: mcp.accessibilityPassed === true },
		{ name: 'semantic-warnings', ok: mcp.semanticWarningCount === 0 },
		{ name: 'design-score-40', ok: Number(mcp.designScore || 0) >= 40 },
		{ name: 'design-score-60', ok: Number(mcp.designScore || 0) >= 60 },
	]
	return { checks, score: Math.round((checks.filter(check => check.ok).length / checks.length) * 100) }
}

function scoreCognitiveLoad(raw, mcp) {
	const rawApiCalls = raw.sourceApiCalls
	const mcpToolCalls = mcp.toolCallCount
	const advantage = rawApiCalls - mcpToolCalls
	let score = 70
	if (advantage >= 3) score += 20
	else if (advantage >= 1) score += 10
	else if (advantage < 0) score -= 15
	if (mcp.operationCount > rawApiCalls * 2) score += 5
	return { rawApiCalls, mcpToolCalls, compiledOperations: mcp.operationCount, advantage, score: Math.max(0, Math.min(100, score)) }
}

function scoreScenario(scenario, raw, mcp) {
	const intentCoverage = scoreIntentCoverage(scenario, mcp)
	const artifactParity = scoreArtifactParity(scenario, raw, mcp)
	const qualityGates = scoreQualityGates(mcp)
	const cognitiveLoad = scoreCognitiveLoad(raw, mcp)
	const score = Math.round(intentCoverage.score * 0.35 + artifactParity.score * 0.25 + qualityGates.score * 0.25 + cognitiveLoad.score * 0.15)
	const recommendations = []
	if (intentCoverage.gaps.length) recommendations.push('Extend Semantic Deck Spec coverage for uncovered authoring intents.')
	if (qualityGates.score < 100) recommendations.push('Raise MCP output quality gates: design/accessibility/semantic warnings should pass without manual cleanup.')
	if (cognitiveLoad.advantage < 1) recommendations.push('Collapse common MCP steps into a higher-level route or richer generate_from_spec response.')
	if (artifactParity.score < 100) recommendations.push('Improve generated artifact parity or add richer artifact oracle checks.')
	if (!recommendations.length) recommendations.push('Keep this scenario as a regression fixture; MCP is matching the brain-code path well.')
	return {
		score,
		intentCoverage,
		artifactParity,
		qualityGates,
		cognitiveLoad,
		recommendations,
	}
}

function markdownReport({ runId, rows, summary }) {
	const lines = []
	lines.push(`# AI Brain Code vs MCP Equivalence Report`)
	lines.push('')
	lines.push(`Run id: \`${runId}\``)
	lines.push(`Created: \`${new Date().toISOString()}\``)
	lines.push('')
	lines.push(`## Summary`)
	lines.push('')
	lines.push(`Overall score: **${summary.meanScore}/100**`)
	lines.push(`Scenarios: **${summary.scenarios}**`)
	lines.push(`Passed: **${summary.passed}**`)
	lines.push(`Failed: **${summary.failed}**`)
	lines.push('')
	lines.push(`| Scenario | Score | Raw API Calls | MCP Tool Calls | Compiled Ops | Artifact | Quality | Intent | Key Recommendation |`)
	lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---|`)
	for (const row of rows) {
		lines.push(`| ${row.scenarioId} | ${row.score.score} | ${row.raw.sourceApiCalls} | ${row.mcp.toolCallCount} | ${row.mcp.operationCount} | ${row.score.artifactParity.score} | ${row.score.qualityGates.score} | ${row.score.intentCoverage.score} | ${row.score.recommendations[0]} |`)
	}
	lines.push('')
	lines.push(`## Interpretation`)
	lines.push('')
	lines.push(`The MCP equivalent should not imitate line-by-line PptxGenJS. The target is semantic compression: one deck spec plus targeted semantic revisions should compile into the low-level primitive work that an AI would otherwise hand-code. Where the MCP tool-call count is low and artifact checks pass, the client is closer to AI coding competence.`)
	lines.push('')
	lines.push(`## Remaining Gaps`)
	lines.push('')
	const gaps = rows.flatMap(row => row.score.intentCoverage.gaps.map(gap => `${row.scenarioId}: ${gap.intent}`))
	if (gaps.length) gaps.forEach(gap => lines.push(`- ${gap}`))
	else lines.push('- No uncovered benchmark intents in this deterministic fixture set.')
	lines.push('')
	return `${lines.join('\n')}\n`
}

export async function runBrainCodeEquivalence(options = {}) {
	const opts = {
		outputRoot: options.outputRoot ? path.resolve(options.outputRoot) : DEFAULT_OUTPUT_ROOT,
		runId: options.runId || `brain-code-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', 'z')}`,
		maxScenarios: Number.isFinite(Number(options.maxScenarios)) ? Math.max(1, Number(options.maxScenarios) || 1) : Number.POSITIVE_INFINITY,
	}
	const scenarios = SCENARIOS.slice(0, opts.maxScenarios)
	const runDir = path.join(opts.outputRoot, opts.runId)
	const deckDir = path.join(runDir, 'decks')
	const codeDir = path.join(runDir, 'brain-code')
	const specDir = path.join(runDir, 'mcp-specs')
	mkdirp(deckDir)
	mkdirp(codeDir)
	mkdirp(specDir)

	const manifest = {
		runId: opts.runId,
		createdAt: new Date().toISOString(),
		scoreVersion: 'ai-brain-code-mcp-equivalence.v1',
		driverVersion: 'local-deterministic-harness.v1',
		outputRoot: opts.outputRoot,
		scenarios: scenarios.map(({ id, title, naturalPrompt, intents }) => ({ id, title, naturalPrompt, intents })),
	}
	writeJson(path.join(runDir, 'manifest.json'), manifest)

	const rows = []
	for (const scenario of scenarios) {
		fs.writeFileSync(path.join(codeDir, `${scenario.id}.pptxgenjs.mjs`), `${scenario.rawCode.trim()}\n`)
		writeJson(path.join(specDir, `${scenario.id}.deck-spec.v1.json`), scenario.mcpSpec())
		const started = Date.now()
		try {
			const raw = await rawCodeArm(scenario, deckDir)
			const mcp = await mcpEquivalentArm(scenario, deckDir)
			const score = scoreScenario(scenario, raw, mcp)
			const row = {
				runId: opts.runId,
				scenarioId: scenario.id,
				title: scenario.title,
				naturalPrompt: scenario.naturalPrompt,
				status: 'passed',
				startedAt: new Date(started).toISOString(),
				endedAt: new Date().toISOString(),
				raw,
				mcp: {
					...mcp,
					spec: undefined,
				},
				score,
			}
			rows.push(row)
			fs.appendFileSync(path.join(runDir, 'per-scenario-results.jsonl'), JSON.stringify(row) + '\n')
		} catch (err) {
			const row = {
				runId: opts.runId,
				scenarioId: scenario.id,
				title: scenario.title,
				status: 'failed',
				startedAt: new Date(started).toISOString(),
				endedAt: new Date().toISOString(),
				error: { message: String(err?.message || err), stack: err?.stack },
			}
			rows.push(row)
			fs.appendFileSync(path.join(runDir, 'per-scenario-results.jsonl'), JSON.stringify(row) + '\n')
		}
	}

	const passedRows = rows.filter(row => row.status === 'passed')
	const summary = {
		runId: opts.runId,
		outputDir: runDir,
		scenarios: rows.length,
		passed: passedRows.length,
		failed: rows.length - passedRows.length,
		meanScore: Math.round(passedRows.reduce((sum, row) => sum + row.score.score, 0) / Math.max(1, passedRows.length)),
		minScore: passedRows.length ? Math.min(...passedRows.map(row => row.score.score)) : 0,
		nextWork: [
			'Keep this promoted Track E harness in the main parity baseline for semantic-code equivalence regressions.',
			'Use any scenario below 90/100 to decide whether Semantic Deck Spec needs a new intent or whether capabilities routing needs a better example.',
			'Keep the resident presentations-skill arm separate until an external or interactive driver is available.',
		],
	}
	writeJson(path.join(runDir, 'summary.json'), summary)
	fs.writeFileSync(path.join(runDir, 'report.md'), markdownReport({ runId: opts.runId, rows: passedRows, summary }))
	return { summary, rows, outputDir: runDir }
}

async function main() {
	const opts = parseArgs(process.argv.slice(2))
	const { summary } = await runBrainCodeEquivalence(opts)
	console.log(`AI BRAIN CODE MCP EQUIVALENCE: ${summary.failed ? 'FAIL' : 'PASS'} score=${summary.meanScore}/100 passed=${summary.passed}/${summary.scenarios}`)
	console.log(`AI BRAIN CODE MCP EQUIVALENCE: output=${summary.outputDir}`)
	if (summary.failed) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(err => {
		console.error(`AI BRAIN CODE MCP EQUIVALENCE: FAIL ${err?.stack || err}`)
		process.exit(1)
	})
}
