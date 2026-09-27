#!/usr/bin/env node
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

// Load the engine only after the public flags are set. This keeps the verifier a
// genuinely cold public-client check instead of relying on a late runtime toggle.
const { callBetterPptxTool } = await import('./engine.mjs')
const { isPublicBlackBoxMode, isPublicSpecFirstOnly } = await import('./blackbox.mjs')

function fail(message, detail = {}) {
	console.error('DIRECTOR WORKFLOW VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

const context = { sessionId: `verify-director-workflow-${Date.now()}`, clientInfo: { name: 'director-workflow-verifier', version: '1' } }
if (!isPublicBlackBoxMode() || !isPublicSpecFirstOnly()) fail('Verifier did not start in cold public spec-first mode.')
const workflow = okResult('help.workflow', await callBetterPptxTool('betterpptx.help.workflow', {
	intent: 'create a narrated aviation history deck with full design-system exploration, 3D, custom geometry, charts, timing, ink, and laser pointer',
	detail: 'full',
	features: ['theme/designSystem', 'narration', 'timing', 'animation', 'chart', 'table', '3d', 'customGeometry', 'ink', 'laser', 'accessibility', 'quality'],
	profile: 'narrated',
}, context))

const requiredStages = [
	'message-architecture',
	'functional-layout-assignment',
	'system-definition',
	'spec-compilation',
	'verification',
]
const stageKeys = (workflow.phases || []).map(phase => phase.key)
for (const key of requiredStages) {
	if (!stageKeys.includes(key)) fail(`Workflow is missing stage ${key}.`, { stageKeys, workflow })
}
if ((workflow.phases || []).length !== requiredStages.length) fail('Workflow should expose exactly the five director stages.', { stageKeys })
if (workflow.recommendedMode !== 'mcp-authoring-excellence-json-spec') fail('Workflow did not recommend the public Authoring Excellence JSON-spec route.', workflow)
if (workflow.authoringSurface !== 'mcp-generate-from-spec-only') fail('Workflow did not expose the governed generate_from_spec authoring surface.', workflow)

const text = JSON.stringify(workflow)
const forbidden = ['betterpptx.deck.analyze_reference', 'betterpptx.deck.recreate_reference', 'betterpptx.deck.compare_reference']
const forbiddenHits = forbidden.filter(value => text.includes(value))
if (forbiddenHits.length) fail('Workflow still routes through reference-only tools.', { forbiddenHits })
if (/\bprimitive(?:-direct)?\b/i.test(text)) fail('Workflow exposes obsolete low-level authoring vocabulary.', { stageKeys })

const requiredTools = [
	'betterpptx.auth.status',
	'betterpptx.help.capabilities',
	'betterpptx.help.tool_recipe',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.authoring.catalog',
	'betterpptx.options.catalog',
	'betterpptx.assets.catalog',
	'betterpptx.assets.generate_model3d',
	'betterpptx.custom_geometry.from_svg',
	'betterpptx.narration.voices',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_design',
	'betterpptx.deck.validate_accessibility',
	'betterpptx.deck.validate_narration',
	'betterpptx.deck.validate_quality',
	'betterpptx.deck.preview',
	'betterpptx.deck.save',
]
const missingTools = requiredTools.filter(tool => !text.includes(tool))
if (missingTools.length) fail('Workflow is missing expected semantic authoring/verification tools.', { missingTools })

const systemStage = (workflow.phases || []).find(phase => phase.key === 'system-definition')
if (!systemStage?.themeSystem?.pillars || systemStage.themeSystem.pillars.length < 7) {
	fail('System-definition stage does not expose seven-pillar theme guidance.', systemStage || {})
}
const compilationStage = (workflow.phases || []).find(phase => phase.key === 'spec-compilation')
if (!compilationStage || !(compilationStage.exitCriteria || []).some(value => /dry-run|JSON spec|generate_from_spec/i.test(value)) && !/dry-run|JSON spec|generate_from_spec/i.test(compilationStage.goal || '')) {
	fail('Spec-compilation stage does not explain the governed semantic dry-run/commit route.', compilationStage || {})
}

console.log('DIRECTOR WORKFLOW VERIFY: PASS')
console.log(JSON.stringify({
	stageKeys,
	recommendedMode: workflow.recommendedMode,
	themePillars: systemStage.themeSystem.pillars.length,
}, null, 2))
