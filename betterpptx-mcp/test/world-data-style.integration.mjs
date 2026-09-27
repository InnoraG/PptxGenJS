// World-aware data-language regression: table/chart surfaces and default depth
// must follow the selected Director World, including corrected mode polarity.
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { DATA_STYLE_CARD_RULES, dataLanguageForAxes, paletteHealth, themeColorSchemeForSpec } from '../ir/layout-engine.mjs'

const flatWorlds = new Set(['editorial', 'blueprint', 'brutalist', 'observatory', 'horizon', 'mono'])
const worlds = ['editorial', 'blueprint', 'brutalist', 'observatory', 'horizon', 'mono', 'luxe', 'aurora', 'candy']
let failures = 0

for (const [card, rule] of Object.entries(DATA_STYLE_CARD_RULES)) {
	const resolved = dataLanguageForAxes({ card, headFontFace: 'Aptos', bodyFontFace: 'Aptos' })
	const pass = resolved.grid === rule.grid && resolved.tableStyle === rule.tableStyle
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'} card-axis-${card.padEnd(8)} grid=${resolved.grid} tableStyle=${resolved.tableStyle}`)
}

function specFor(world, extra = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: `World data style ${world}`,
		styleIntent: { artDirection: world },
		slides: [{ id: 'data', title: 'Data', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Data' },
			{ kind: 'chart-panel', name: 'chart', data: [{ name: 'Signal', labels: ['A', 'B'], values: [1, 2] }], verified: true, evidenceSource: 'synthetic fixture' },
			{ kind: 'table-panel', name: 'table', header: ['Signal', 'Readout'], rows: [['A', '1']], verified: true, evidenceSource: 'synthetic fixture' },
			{ kind: 'timeline', name: 'timeline', items: [{ name: 'step', text: 'One step' }], verified: true, evidenceSource: 'synthetic fixture' },
			{ kind: 'metric-grid', name: 'metrics', items: [{ name: 'm', label: 'Signal', value: '1' }], verified: true, evidenceSource: 'synthetic fixture' },
			{ kind: 'diagram', name: 'diagram', items: [{ name: 'step', text: 'One step' }], verified: true, evidenceSource: 'synthetic fixture' },
		] }],
		...extra,
	}
}

function shadowedOperations(plan) {
	return plan.operations.filter(operation => {
		const options = operation.args?.options || {}
		return options.shadow || options.style?.shadow
	})
}

for (const world of worlds) {
	const plan = buildSpecOperationPlan(specFor(world))
	const shadows = shadowedOperations(plan)
	const flat = flatWorlds.has(world)
	const table = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_table')
	const tableHeader = table?.args?.rows?.[0]?.[0]?.options || {}
	const metricCardFills = plan.operations
		.filter(operation => String(operation.args?.options?.objectName || '').includes('.metric-card.'))
		.map(operation => operation.args?.options?.fill)
	const semanticSurfacePass = flat
		? metricCardFills.every(fill => !fill || fill.type !== 'gradient')
		: true
	const ruleHeader = ['editorial', 'luxe'].includes(world)
	const bodyFillPass = world === 'brutalist' ? !table?.args?.options?.fill : !!table?.args?.options?.fill?.color
	const dataStylePass = plan.appliedDefaults.dataStyle?.tableStyle === (['editorial', 'luxe'].includes(world) ? 'rule' : plan.appliedDefaults.dataStyle?.tableStyle)
	const pass = (flat ? plan.appliedDefaults.depthPolicy.shadow === 'none' && shadows.length === 0 : shadows.length >= 4)
		&& bodyFillPass
		&& dataStylePass
		&& semanticSurfacePass
		&& (!ruleHeader || tableHeader.fill === undefined)
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'} ${world.padEnd(11)} depth=${plan.appliedDefaults.depthPolicy.shadow} shadows=${shadows.length} tableFill=${table?.args?.options?.fill?.color || 'none'} metricSurface=${semanticSurfacePass ? 'flat-safe' : 'gradient'} ruleHeaderFill=${tableHeader.fill?.color || 'none'}`)
}

// An explicit AI-authored theme owns native data typography. World-derived
// chart/table fonts remain the fallback only when both theme faces are omitted.
for (const { world, theme, source } of [
	{ world: 'editorial', theme: { bodyFontFace: 'Aptos' }, source: 'bodyFontFace' },
	{ world: 'luxe', theme: { fontFace: 'Aptos' }, source: 'fontFace' },
]) {
	const plan = buildSpecOperationPlan(specFor(world, { theme }))
	const chart = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_chart')
	const table = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_table')
	const chartOptions = chart?.args?.options || {}
	const pass = chartOptions.dataLabelFontFace === 'Aptos'
		&& chartOptions.catAxisLabelFontFace === 'Aptos'
		&& chartOptions.valAxisLabelFontFace === 'Aptos'
		&& chartOptions.titleFontFace === 'Aptos'
		&& chartOptions.titleColor === chartOptions.catAxisLabelColor
		&& table?.args?.options?.fontFace === 'Aptos'
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'} explicit-theme-data-font-${world} source=${source} chart=${chartOptions.dataLabelFontFace || 'none'}/${chartOptions.catAxisLabelFontFace || 'none'}/${chartOptions.valAxisLabelFontFace || 'none'}/${chartOptions.titleFontFace || 'none'} titleColor=${chartOptions.titleColor || 'none'} table=${table?.args?.options?.fontFace || 'none'}`)
}

// A corrected dark World must use the corrected canvas for chart contrast while
// retaining the authored accent. The same check catches regression to raw theme.bg.
{
	const spec = specFor('luxe', {
		styleIntent: { artDirection: 'luxe', mode: 'dark' },
		theme: { palette: ['F5ECD9', 'F5F5F5', 'D0D0D0', 'C0C0C0', 'FFFFFF'] },
	})
	const plan = buildSpecOperationPlan(spec)
	const chart = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_chart')
	const color = chart?.args?.options?.chartColors?.[0]
	const pass = plan.appliedDefaults.paletteHealth?.modeCorrection?.appliedBackground === '141008' && color === 'D0D0D0'
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'} corrected-chart-canvas applied=${plan.appliedDefaults.paletteHealth?.modeCorrection?.appliedBackground || 'none'} color=${color || 'none'}`)
}

// Palette readback must describe the resolved, engine-nudged accent rather than
// treating a successful visibility correction as a failure.
{
	const spec = specFor({ label: 'low accent', mode: 'dark', palette: ['F8FAFC', '111111', '22B8A8', 'F59E0B', '101010'], card: 'glass' })
	const health = paletteHealth(spec)
	const themeRamp = themeColorSchemeForSpec(spec)
	const pass = health.accentOnCanvas?.visible === true
		&& health.accentOnCanvas?.note?.includes('auto-nudge to')
		&& themeRamp.accent1 === '474747'
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'} resolved-accent-visibility visible=${health.accentOnCanvas?.visible} themeAccent1=${themeRamp.accent1} note=${health.accentOnCanvas?.note || 'none'}`)
}

// Bespoke glass Worlds keep gradient-native treatment while correcting a
// contradictory palette to a polarity-safe neutral canvas.
for (const mode of ['dark', 'light']) {
	const contradictoryBg = mode === 'dark' ? 'FFFFFF' : '000000'
	const spec = specFor('bespoke', {
		styleIntent: { artDirection: { label: 'Bespoke glass', mode, palette: ['111111', 'FF00AA', '00CC88', 'FFCC00', contradictoryBg], card: 'glass' } },
	})
	const plan = buildSpecOperationPlan(spec)
	const background = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add')?.args?.background
	const stops = background?.gradientStops || []
	const last = stops.at(-1)?.color || ''
	const pass = plan.appliedDefaults.gradientPolicy.expected === true
		&& (mode === 'dark' ? Number.parseInt(last.slice(0, 2), 16) < 110 : Number.parseInt(last.slice(0, 2), 16) > 180)
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'} bespoke-${mode.padEnd(5)} gradient=${plan.appliedDefaults.gradientPolicy.expected} lastStop=${last || 'none'}`)
}

// Cold public capability proof: the AI must be able to discover the same
// data-language rule that the compiler just applied, without implementation
// vocabulary or a second private geometry contract.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
const { createMcpToolDispatcher } = await import('../engine.mjs')
const mcp = createMcpToolDispatcher({
	sessionId: `world-data-style-capability-${Date.now()}`,
	clientInfo: { name: 'world-data-style-contract', version: '1' },
	blackBox: true,
})
const capabilities = await mcp.call('betterpptx.help.capabilities', { detail: 'full', intent: 'semantic data styling' })
const principles = capabilities?.data?.authoringPrinciples || capabilities?.authoringPrinciples || {}
const policy = principles.dataStylePolicy || {}
const capabilityPass = policy.contractVersion === 'authoring-excellence.data-style.v1'
	&& policy.cardAxisMapping?.outline?.tableStyle === 'grid'
	&& policy.cardAxisMapping?.thin?.tableStyle === 'rule'
	&& policy.cardAxisMapping?.solid?.tableStyle === 'bold-flat'
	&& policy.readback?.includes('appliedDefaults.dataStyle')
	&& !JSON.stringify(policy).match(/PptxGenJS|node\.js|provider|filesystem|path/i)
if (!capabilityPass) failures++
console.log(`${capabilityPass ? 'PASS' : 'FAIL'} public-data-style-policy contract=${policy.contractVersion || 'none'}`)

console.log(`\n${failures === 0 ? 'ALL WORLD DATA STYLE CASES PASS' : `${failures} WORLD DATA STYLE CASE(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
