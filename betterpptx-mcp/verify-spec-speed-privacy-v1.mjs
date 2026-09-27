#!/usr/bin/env node

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { TOOLS } = await import('./tools.mjs')
const { publicToolList } = await import('./blackbox.mjs')
const { callBetterPptxTool } = await import('./engine.mjs')

function fail(message, detail = {}) {
	console.error('SPEC SPEED PRIVACY VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function byteLen(value) {
	return Buffer.byteLength(JSON.stringify(value), 'utf8')
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

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

const publicTools = publicToolList(TOOLS)
const publicNames = publicTools.map(tool => tool.name)
for (const required of [
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.export_spec',
	'betterpptx.deck.validate',
	'betterpptx.deck.save',
]) {
	if (!publicNames.includes(required)) fail('spec-first public tool list is missing required tool.', { required, publicNames })
}
const hiddenPrimitives = [
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_avatar_narration',
	'betterpptx.slide.passthrough_xml',
].filter(name => !publicNames.includes(name))
if (hiddenPrimitives.length !== 5) fail('spec-first public tool list still exposes direct generation primitives.', { publicNames })

const context = { sessionId: `verify-spec-speed-privacy-${Date.now()}` }
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Spec Speed Privacy Verification',
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
		id: 'privacy-1',
		title: 'Compact Public Spec',
		layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'title', text: 'Compact public spec' },
			{ kind: 'textBox', name: 'body', text: 'The public path exposes a single JSON spec, compact summaries, and opaque handles.' },
		],
	}],
}

const summary = okResult('summary dryRun', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
	spec,
	phase: 'dryRun',
	detail: 'summary',
}, context))
const full = okResult('full dryRun', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
	spec,
	phase: 'dryRun',
	detail: 'full',
	includeCallPlan: true,
}, context))

if (summary.capabilityMatrix?.detail !== 'summary' || !summary.capabilityMatrix?.counts) {
	fail('summary dryRun did not return compact capability matrix.', summary.capabilityMatrix)
}
if (!Array.isArray(full.capabilityMatrix?.specNative) || !full.operations?.length) {
	fail('full dryRun did not return full capability matrix and call plan.', full)
}
const summaryBytes = byteLen(summary)
const fullBytes = byteLen(full)
if (!(summaryBytes < fullBytes)) {
	fail('summary response is not smaller than full response.', { summaryBytes, fullBytes })
}
const leaks = [...textLeaks(summary), ...textLeaks(full)]
if (leaks.length) fail('public spec dry-run leaked private implementation details.', { leaks })

const blockedPrimitive = await callBetterPptxTool('betterpptx.slide.add_text', {
	deckId: 'deck_private_surface_probe',
	slideIndex: 0,
	text: 'should be blocked',
	options: { x: 0.5, y: 0.5, w: 2, h: 0.4 },
}, context)
if (blockedPrimitive.ok !== false || blockedPrimitive.error?.code !== 'BLACK_BOX') {
	fail('spec-first public mode did not block direct primitive call.', blockedPrimitive)
}

console.log('SPEC SPEED PRIVACY VERIFY: PASS')
console.log(JSON.stringify({
	publicToolCount: publicNames.length,
	hiddenPrimitiveCount: hiddenPrimitives.length,
	summaryBytes,
	fullBytes,
	reductionPct: Math.round((1 - summaryBytes / fullBytes) * 1000) / 10,
}, null, 2))
