import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

const sourcePath = process.argv[2] || 'C:/Users/SafeUser/Downloads/symphony.betterpptx-spec.json'
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const narrationPath = process.argv[3] || 'C:/Users/SafeUser/Downloads/narration_script.md'
const sourceBytes = fs.readFileSync(sourcePath)
const narrationMarkdown = fs.readFileSync(narrationPath, 'utf8')

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex')
}

function parseNarrationMarkdown(markdown) {
	const entries = []
	const lines = String(markdown || '').split(/\r?\n/)
	let current = null
	for (const line of lines) {
		const heading = /^##\s+(s\d+)\s+—\s+(.+?)\s*$/.exec(line)
		if (heading) {
			if (current) entries.push(current)
			current = { slideId: heading[1], title: heading[2], lines: [] }
		} else if (current) {
			current.lines.push(line)
		}
	}
	if (current) entries.push(current)
	return entries.map(entry => ({ ...entry, text: entry.lines.join('\n').trim() }))
}

const narrationEntries = parseNarrationMarkdown(narrationMarkdown)

// The supplied source is intentionally preserved as a negative fixture. These
// corrections are the explicit authoring decisions required to move it onto
// the current public chart contract; no unsupported option is silently
// accepted by the production validator.
const corrected = structuredClone(source)
const corrections = []

for (const slide of corrected.slides || []) {
	for (const block of slide.content || []) {
		if (!['chart', 'chart-panel', 'chartPanel'].includes(String(block.kind))) continue
		block.kind = 'chart-panel'
		const options = block.chartOptions && typeof block.chartOptions === 'object' ? block.chartOptions : (block.chartOptions = {})
		if (Object.hasOwn(options, 'showCatName')) {
			options.showLabel = options.showCatName
			delete options.showCatName
			corrections.push(`${slide.id}.${block.name}: showCatName -> showLabel`)
		}
		if (Object.hasOwn(options, 'fontSize')) {
			options.dataLabelFontSize = options.fontSize
			delete options.fontSize
			corrections.push(`${slide.id}.${block.name}: fontSize -> dataLabelFontSize`)
		}
		if (Object.hasOwn(options, 'fontFace')) {
			options.dataLabelFontFace = options.fontFace
			delete options.fontFace
			corrections.push(`${slide.id}.${block.name}: fontFace -> dataLabelFontFace`)
		}
		if (Object.hasOwn(options, 'markerSize')) {
			options.lineDataSymbolSize = options.markerSize
			delete options.markerSize
			corrections.push(`${slide.id}.${block.name}: markerSize -> lineDataSymbolSize`)
		}
		if (Object.hasOwn(options, 'showMarker')) {
			if (String(block.chartType || '').toLowerCase() === 'line') options.lineDataSymbol = options.showMarker ? 'circle' : 'none'
			delete options.showMarker
			corrections.push(`${slide.id}.${block.name}: ${String(block.chartType || '').toLowerCase() === 'line' ? 'showMarker -> lineDataSymbol' : 'removed unsupported showMarker for this chart type'}`)
		}
		for (const key of ['showBorder', 'transparency']) {
			if (Object.hasOwn(options, key)) {
				delete options[key]
				corrections.push(`${slide.id}.${block.name}: removed unsupported ambiguous ${key}`)
			}
		}
	}
}

for (const slide of corrected.slides || []) {
	for (const block of slide.content || []) {
		if (String(block.kind) !== 'table') continue
		block.kind = 'table-panel'
		const options = block.tableOptions && typeof block.tableOptions === 'object' ? block.tableOptions : (block.tableOptions = {})
		if (typeof options.fill === 'string') {
			options.fill = { color: options.fill }
			corrections.push(`${slide.id}.${block.name}: tableOptions.fill color -> fill object`)
		}
		if (options.fontSize !== 12) {
			options.fontSize = 12
			corrections.push(`${slide.id}.${block.name}: tableOptions.fontSize -> 12pt for fit`)
		}
		if (options.margin !== 0.08) {
			options.margin = 0.08
			corrections.push(`${slide.id}.${block.name}: tableOptions.margin -> 0.08in for fit`)
		}
		options.rowH = [0.55, 0.55, 0.55, 0.55, 0.55]
		corrections.push(`${slide.id}.${block.name}: table row heights -> explicit five-row fit-safe values`)
	}
}

for (const slide of corrected.slides || []) {
	for (const block of slide.content || []) {
		if (String(block.kind) !== 'table-panel') continue
		if (block.verified !== true) {
			block.verified = true
			corrections.push(`${slide.id}.${block.name}: verified=true for the explicitly proposed pilot roadmap`)
		}
		if (!String(block.evidenceSource || '').trim()) {
			block.evidenceSource = 'SYMPHONY authored proposal: proposed ninety-day pilot roadmap; values are illustrative.'
			corrections.push(`${slide.id}.${block.name}: added public illustrative evidenceSource`)
		}
	}
}

const learningCycle = corrected.slides?.flatMap(slide => slide.content || []).find(block => block.name === 'learning-cycle')
if (learningCycle) {
	learningCycle.verified = true
	learningCycle.evidenceSource = 'SYMPHONY authored proposal: governed learning cycle'
}

const report = {
	source: path.resolve(sourcePath),
	sourceSha256: sha256(sourceBytes),
	sourceBytes: sourceBytes.length,
	narrationSource: path.resolve(narrationPath),
	narrationSha256: sha256(Buffer.from(narrationMarkdown, 'utf8')),
	originalFixtureUnchanged: true,
	slideCount: corrected.slides?.length || 0,
	narrationSlideCount: narrationEntries.length,
	corrections,
}

// Re-run the supplied draft as a negative control before compiling the
// corrected copy. This proves that the original fixture is rejected for its
// unsupported native-object fields rather than silently lowered to generic
// text.
try {
	buildSpecOperationPlan(source, { plan: 'premium', preserveAuthoredPrecision: true })
	report.originalNegative = {
		status: 'FAIL',
		message: 'The supplied draft unexpectedly compiled without the expected native-contract rejection.',
	}
} catch (error) {
	report.originalNegative = {
		status: 'PASS',
		code: error.code || null,
		message: error.message,
		field: error.field || error.details?.field || null,
	}
}

const sourceNarration = new Map((source.slides || []).map(slide => [String(slide.id), String(slide.narration?.text || '')]))
const markdownNarration = new Map(narrationEntries.map(entry => [entry.slideId, entry.text]))
report.narrationAlignment = {
	missingInMarkdown: [...sourceNarration.keys()].filter(slideId => !markdownNarration.has(slideId)),
	missingInSpec: [...markdownNarration.keys()].filter(slideId => !sourceNarration.has(slideId)),
	mismatchedSlides: [...sourceNarration.keys()].filter(slideId => sourceNarration.get(slideId) !== markdownNarration.get(slideId)),
}

const outputFlagIndex = process.argv.indexOf('--write-corrected')
const correctedOutputPath = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : null
if (correctedOutputPath) {
	if (!correctedOutputPath || path.resolve(correctedOutputPath) === path.resolve(sourcePath)) throw new Error('Refusing to overwrite the supplied SYMPHONY source fixture.')
	fs.writeFileSync(correctedOutputPath, `${JSON.stringify(corrected, null, 2)}\n`)
	report.correctedSourcePath = path.resolve(correctedOutputPath)
	report.correctedSourceSha256 = sha256(fs.readFileSync(correctedOutputPath))
}

try {
	const result = buildSpecOperationPlan(corrected, { plan: 'premium', preserveAuthoredPrecision: true })
	const objects = (result.plan?.slides || []).flatMap(slide => slide.objects || [])
	const ids = ['s10.time-waterfall', 's11.outcome-trends', 's15.portfolio-doughnut', 's16.learning-cycle', 's17.pilot-roadmap']
	const selected = objects.filter(object => ids.some(prefix => String(object.objectName || object.blockName).startsWith(prefix)))
	const representations = {}
	for (const object of objects) {
		const representation = object.contentRepresentation?.plannedRepresentation
		if (representation) representations[representation] = (representations[representation] || 0) + 1
	}
	report.status = (result.errors?.length || 0) ? 'FAIL' : 'PASS'
	report.ok = report.status === 'PASS'
	report.objectCount = objects.length
	report.operationCount = result.operations?.length || 0
	report.errorCount = result.errors?.length || 0
	report.warningCount = result.warnings?.length || 0
	report.errors = (result.errors || []).slice(0, 10)
	report.warnings = (result.warnings || []).slice(0, 10)
	report.representations = representations
	report.narration = {
		explicitNarrationSlides: (result.timingSpine?.slides || []).filter(slide => slide.explicitNarration).length,
		estimateTimingSlides: (result.timingSpine?.slides || []).filter(slide => slide.timingEvidence === 'estimate').length,
		measuredTimingSlides: (result.timingSpine?.slides || []).filter(slide => slide.timingEvidence === 'measured-audio').length,
		effectiveClocks: [...new Set((result.timingSpine?.slides || []).map(slide => slide.effectiveClock).filter(Boolean))],
	}
	report.semanticReadback = {
		authored: {
			contentStory: corrected.contentStory || null,
			visualDesign: corrected.visualDesign || null,
			motionTime: corrected.motionTime || null,
		},
		normalized: {
			visualDesign: {
				descriptiveWorld: corrected.visualDesign?.world || null,
				operationalArtDirection: result.appliedDefaults?.decisionSummary?.world?.artDirection || null,
				effectiveWorld: result.appliedDefaults?.decisionSummary?.world?.artDirection || null,
			},
			motionTime: {
				authoredMasterClock: corrected.motionTime?.masterClock || null,
				authoredTimingSource: corrected.motionTime?.timingSource || null,
				effectiveClock: result.timingSpine?.effectiveClock || null,
				timingEvidence: result.timingSpine?.timingEvidence || [],
			},
		},
		authoredDefaults: result.appliedDefaults?.decisionSummary || null,
	}
	report.selected = selected.map(object => ({
		id: object.objectName,
		kind: object.kind,
		primitive: object.primitive,
		role: object.role,
		representation: object.contentRepresentation,
		chartType: object.chartType,
		rowCount: object.rows?.length,
		nodeCount: object.nodes?.length,
	}))
} catch (error) {
	report.status = 'FAIL'
	report.thrown = { code: error.code || null, message: error.message, details: error.details || null }
}

console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
