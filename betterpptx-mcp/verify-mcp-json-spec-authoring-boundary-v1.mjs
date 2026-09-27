#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { callBetterPptxTool, createMcpToolDispatcher } from './engine.mjs'
import { TOOLS } from './tools.mjs'
import { publicToolList } from './blackbox.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'

function fail(message, detail = {}) {
	console.error('MCP JSON-SPEC AUTHORING BOUNDARY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

async function expectCode(label, call, code, detailCode = null) {
	const result = await call()
	if (result?.ok !== false || result.error?.code !== code) {
		fail(`${label}: expected ${code}.`, result)
	}
	if (detailCode && result.error?.details?.code !== detailCode) {
		fail(`${label}: expected detail code ${detailCode}.`, result)
	}
	return result.error
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'MCP-only Authoring Boundary Proof',
	audience: 'BetterPPTX maintainers',
	objective: 'Prove that a running MCP transport and one governed JSON spec are mandatory.',
	layout: 'LAYOUT_WIDE',
	authoringContract: {
		workflow: 'authoring-excellence-director-v1',
		level: 'deterministic',
		coordinateSystem: 'inches',
		layerModel: 'flat-object-array',
		objectIdentity: 'stable-names-required',
	},
	contentStory: {
		audience: 'BetterPPTX maintainers',
		outcome: 'Verify the single supported presentation authoring path.',
		remember: 'MCP discovery plus generate_from_spec is the only authoring capability.',
	},
	visualDesign: {
		world: 'Editorial verification sheet',
		framing: 'One clear proof statement on a quiet high-contrast canvas.',
	},
	motionTime: {
		masterClock: 'authored slide timeline',
		timingSource: 'Authoring Excellence Motion/Time plan',
		syncPolicy: 'One clock governs slide transition and object builds.',
	},
	theme: {
		name: 'Boundary proof',
		palette: ['0F172A', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'],
		fontFace: 'Aptos',
	},
	showSettings: {
		useTimings: true,
		showAnimation: true,
		showNarration: true,
		showMediaControls: true,
	},
	slides: [{
		id: 'boundary-proof',
		title: 'One governed authoring path',
		role: 'proof',
		message: 'The MCP transport compiles the Director-authored JSON spec atomically.',
		layoutIntent: 'title-body',
		notes: 'This slide is intentionally simple because the test verifies the authoring boundary.',
		transition: { type: 'fade', duration: 350, advanceAfterTime: 3000, advanceOnClick: true },
		content: [
			{ kind: 'title', name: 'proof-title', text: 'MCP → Authoring Excellence JSON spec → PPTX' },
			{
				kind: 'textShape',
				name: 'proof-statement',
				text: 'Direct imports, deck.new, slide primitives, and maintainer flags are rejected.',
				shapeName: 'roundRect',
				options: {
					fontSize: 24,
					bold: true,
					color: '0F172A',
					fill: { color: 'FFFFFF' },
					line: { color: '2563EB', width: 2 },
					shadow: { type: 'outer', color: '64748B', opacity: 0.18, blur: 2, angle: 45, distance: 1 },
					margin: 0.18,
					align: 'center',
					valign: 'middle',
				},
			},
		],
	}],
	validation: {
		validateBeforeSave: true,
		requireAccessibility: true,
	},
}

const directContext = {
	sessionId: `direct-import-${Date.now()}`,
	clientInfo: { name: 'forbidden-direct-import', version: '1' },
}

await expectCode(
	'direct generate_from_spec import',
	() => callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, dryRun: true }, directContext),
	'MCP_AUTHORING_PIPELINE_REQUIRED',
)
await expectCode(
	'direct deck.new import with maintainer/env bypasses',
	() => callBetterPptxTool('betterpptx.deck.new', { title: 'must fail', directorMode: 'primitive-direct' }, directContext),
	'MCP_AUTHORING_PIPELINE_REQUIRED',
)

const visible = new Set(publicToolList(TOOLS).map(tool => tool.name))
for (const forbidden of [
	'betterpptx.deck.new',
	'betterpptx.deck.define_message_architecture',
	'betterpptx.deck.assign_slide_roles',
	'betterpptx.deck.define_design_system',
	'betterpptx.deck.set_show_settings',
	'betterpptx.slide.add',
	'betterpptx.slide.add_text',
]) {
	if (visible.has(forbidden)) fail(`Discovery exposed forbidden tool ${forbidden}.`)
}
if (!visible.has('betterpptx.deck.generate_from_spec')) fail('Discovery omitted generate_from_spec.')

// Keep the maintained narration/avatar smoke entry points honest as well as
// the public tool surface.  A local smoke may use stdio/HTTP MCP, but it must
// not quietly grow a direct-engine or hand-authored-geometry escape hatch.
const semanticSmokeFiles = [
	'smoke-avatar-job.mjs',
	'smoke-avatar-narration.mjs',
	'smoke-narration.mjs',
	'smoke-live-narration.mjs',
	'demo-runner.mjs',
]
for (const file of semanticSmokeFiles) {
	const text = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), file), 'utf8')
	if (!/betterpptx\.deck\.generate_from_spec/.test(text)) fail(`Semantic smoke ${file} does not use generate_from_spec.`)
	for (const [label, pattern] of [
		['direct engine import', /(?:from|import\()\s*['"].*engine\.mjs['"]/],
		['direct engine helper', /callBetterPptxTool/],
		['primitive deck/slide construction', /betterpptx\.(?:deck\.new|slide\.add(?:_text|_shape|_avatar_narration)?)/],
		['hand-authored placement options', /options\s*:\s*\{[^}]*\b(?:x|y|w|h)\s*:/s],
	]) {
		if (pattern.test(text)) fail(`Semantic smoke ${file} contains ${label}.`)
	}
}

const mcp = createMcpToolDispatcher({
	sessionId: `mcp-boundary-${Date.now()}`,
	clientInfo: { name: 'cold-mcp-client-verifier', version: '1' },
	blackBox: false,
})

const localCapabilities = okResult('MCP local capability discovery', await mcp.call('betterpptx.help.capabilities', {
	intent: 'semantic authoring boundary proof',
	detail: 'full',
}))
if (localCapabilities.authoringApi?.contractVersion !== 'authoring-excellence.api.v1' || localCapabilities.authoringSurface !== 'mcp-generate-from-spec-only') {
	fail('Local maintainer MCP discovery did not expose the governed Authoring Excellence contract.', {
		contract: localCapabilities.authoringApi?.contractVersion,
		authoringSurface: localCapabilities.authoringSurface,
	})
}
if (!localCapabilities.authoringPrinciples?.decisionGuide || !localCapabilities.authoringApi?.forbiddenInputs?.includes('bbox')) {
	fail('Local maintainer MCP discovery omitted the AI decision guide or forbidden-input policy.', localCapabilities)
}

await expectCode(
	'MCP deck.new',
	() => mcp.call('betterpptx.deck.new', { title: 'must fail' }),
	'JSON_SPEC_AUTHORING_REQUIRED',
)

const incompleteSpec = structuredClone(spec)
delete incompleteSpec.authoringContract.workflow
await expectCode(
	'MCP non-Director spec',
	() => mcp.call('betterpptx.deck.generate_from_spec', { spec: incompleteSpec, dryRun: true }),
	'DIRECTOR_PLAN_INVALID',
	'AUTHORING_EXCELLENCE_CONTRACT_REQUIRED',
)

const dryRun = okResult('MCP generate_from_spec dryRun', await mcp.call('betterpptx.deck.generate_from_spec', {
	spec,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'premium',
	detail: 'summary',
}))
if (dryRun.dryRun !== true || dryRun.mutationFree !== true || dryRun.deckId) {
	fail('Dry-run was not mutation-free.', dryRun)
}

const committed = okResult('MCP generate_from_spec commit', await mcp.call('betterpptx.deck.generate_from_spec', {
	spec,
	phase: 'commit',
	commitMode: 'createNew',
	plan: 'premium',
	detail: 'summary',
}))
if (!committed.deckId || committed.slideCount !== 1) fail('Commit did not create the proof deck.', committed)

for (const [name, args] of [
	['betterpptx.slide.add', { deckId: committed.deckId, background: { color: 'FFFFFF' } }],
	['betterpptx.slide.add_text', { deckId: committed.deckId, slideIndex: 0, text: 'must fail', options: { x: 1, y: 1, w: 2, h: 1 } }],
	['betterpptx.deck.set_show_settings', { deckId: committed.deckId, useTimings: false }],
]) {
	await expectCode(`MCP direct mutation ${name}`, () => mcp.call(name, args), 'JSON_SPEC_AUTHORING_REQUIRED')
}

const summary = okResult('MCP deck.summary', await mcp.call('betterpptx.deck.summary', { deckId: committed.deckId }))
if (summary.slideCount !== 1) fail('Read-only summary failed after governed compilation.', summary)

const quality = okResult('MCP deck.validate_quality', await mcp.call('betterpptx.deck.validate_quality', {
	deckId: committed.deckId,
	profile: 'modern',
}))
if (quality.ok !== true) fail('Governed deck did not pass the required verification gate.', quality)

const saved = okResult('MCP deck.save', await mcp.call('betterpptx.deck.save', {
	deckId: committed.deckId,
	deckVersion: committed.deckVersion,
	fileName: 'verify-mcp-json-spec-authoring-boundary-v1.pptx',
}))
if (saved.slideCount !== 1 || !saved.bytes) fail('Governed MCP deck did not save.', saved)

await expectCode(
	'direct save import',
	() => callBetterPptxTool('betterpptx.deck.save', { deckId: committed.deckId, fileName: 'must-not-save.pptx' }, directContext),
	'MCP_AUTHORING_PIPELINE_REQUIRED',
)

okResult('MCP deck.dispose', await mcp.call('betterpptx.deck.dispose', { deckId: committed.deckId }))

console.log('MCP JSON-SPEC AUTHORING BOUNDARY: PASS')
console.log(JSON.stringify({
	transport: 'MCP required',
	authoringTool: 'betterpptx.deck.generate_from_spec',
	contract: 'authoring-excellence-director-v1',
	discoveryToolCount: visible.size,
	dryRunPlanDigest: dryRun.planDigest,
	savedBytes: saved.bytes,
	rejected: [
		'direct engine generate_from_spec',
		'direct engine deck.new',
		'MCP deck.new',
		'MCP slide.add',
		'MCP slide.add_text',
		'MCP deck.set_show_settings',
		'direct engine save',
	],
}, null, 2))
