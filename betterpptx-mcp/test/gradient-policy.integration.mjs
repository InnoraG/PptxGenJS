// World-treatment contracts: gradients, accents, and depth are governed by the
// selected World, not score-filler quotas. The Director must expose the same
// expectations it applies to the resolved canvas and quality readback.
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { gradientPolicyForArtDirection, depthPolicyForArtDirection, gradientStopPositionPercent } from '../ir/layout-engine.mjs'

const gradientWorlds = new Set(['aurora', 'luxe', 'candy'])
const singleAccentWorlds = new Set(['editorial', 'brutalist', 'luxe', 'mist', 'meridian', 'mono'])
const noDepthWorlds = new Set(['editorial', 'pulse', 'horizon', 'mono'])
const worlds = ['aurora', 'editorial', 'blueprint', 'brutalist', 'luxe', 'mist', 'atelier', 'meridian', 'chalkline', 'playbook', 'pulse', 'collage', 'observatory', 'storybook', 'candy', 'horizon', 'mono', 'botanical']

function specFor(artDirection) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'gradient-policy',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'make a visual decision legible', remember: 'World treatment follows intent' },
		visualDesign: { world: typeof artDirection === 'string' ? artDirection : 'bespoke surface', framing: 'engine-owned canvas and cards' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan' },
		styleIntent: { artDirection },
		slides: [{ id: 's', title: 'A governed surface', message: 'A governed surface.', layoutIntent: 'title-body', content: [{ kind: 'title', name: 'title', text: 'A governed surface' }] }],
	}
}

let failures = 0

// The serializer boundary must be explicit and directly testable: engine
// defaults use normalized positions, while library-facing callers may already
// provide percentages. Invalid values must remain finite and bounded.
const stopBoundaryCases = [
	{ value: 0, index: 0, count: 3, expected: 0 },
	{ value: 0.55, index: 1, count: 3, expected: 55 },
	{ value: 1, index: 2, count: 3, expected: 100 },
	{ value: 55, index: 1, count: 3, expected: 55 },
	{ value: 100, index: 2, count: 3, expected: 100 },
	{ value: Number.NaN, index: 1, count: 3, expected: 50 },
	{ value: Number.POSITIVE_INFINITY, index: 0, count: 3, expected: 0 },
	{ value: -10, index: 0, count: 3, expected: 0 },
	{ value: 250, index: 2, count: 3, expected: 100 },
]
for (const item of stopBoundaryCases) {
	const actual = gradientStopPositionPercent(item.value, item.index, item.count)
	const pass = actual === item.expected
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'}  gradient-stop-boundary value=${String(item.value)} actual=${actual} expected=${item.expected}`)
}

for (const world of worlds) {
	const plan = buildSpecOperationPlan(specFor(world))
	const expected = gradientWorlds.has(world)
	const expectedAccents = singleAccentWorlds.has(world) ? 1 : 2
	const expectedDepth = noDepthWorlds.has(world) ? 0 : 1
	const actual = plan.appliedDefaults.gradientPolicy.expected === true
	const sharedPolicy = gradientPolicyForArtDirection({ styleIntent: { artDirection: world } })
	const actualAccents = plan.appliedDefaults.accentPolicy.minimumDistinctAccents
	const actualDepth = plan.appliedDefaults.depthPolicy.minimumDepthObjectsPerSlide
	const backgroundKinds = new Set((plan.appliedDefaults.slides || []).map(slide => slide.background?.kind))
	const coherent = actual ? backgroundKinds.has('gradient') : !backgroundKinds.has('gradient')
	const backgroundOp = plan.operations?.find(op => op.tool === 'betterpptx.slide.add')
	const gradientPositions = backgroundOp?.args?.background?.gradientStops?.map(stop => stop.position) || []
	const stopsPass = expected
		? gradientPositions.length >= 2 && gradientPositions[0] === 0 && gradientPositions.at(-1) === 100 && gradientPositions.every((position, index) => index === 0 || position > gradientPositions[index - 1])
		: gradientPositions.length === 0
	const pass = actual === expected && actual === sharedPolicy.expected && coherent && stopsPass && actualAccents === expectedAccents && actualDepth === expectedDepth && plan.appliedDefaults.gradientPolicy.contractVersion === 'authoring-excellence.gradient.v1' && plan.appliedDefaults.accentPolicy.contractVersion === 'authoring-excellence.accent.v1' && plan.appliedDefaults.depthPolicy.contractVersion === 'authoring-excellence.depth.v1'
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${world.padEnd(11)} gradient=${expected}/${actual} stops=${gradientPositions.join(',') || 'none'} accents=${expectedAccents}/${actualAccents} depth=${expectedDepth}/${actualDepth} backgrounds=${[...backgroundKinds].join(',')}`)
}

// Explicit light/dark requests are still value variants of the same World
// contract.  A mode switch may change palette and polarity, but it must not
// make a flat World render a gradient (or vice versa).
for (const world of worlds) for (const mode of ['light', 'dark']) {
	const spec = specFor(world)
	spec.styleIntent = { artDirection: world, mode }
	const plan = buildSpecOperationPlan(spec)
	const expected = gradientWorlds.has(world)
	const expectedAccents = singleAccentWorlds.has(world) ? 1 : 2
	const expectedDepth = noDepthWorlds.has(world) ? 0 : 1
	const actual = plan.appliedDefaults.gradientPolicy.expected === true
	const actualAccents = plan.appliedDefaults.accentPolicy.minimumDistinctAccents
	const actualDepth = plan.appliedDefaults.depthPolicy.minimumDepthObjectsPerSlide
	const backgroundKinds = new Set((plan.appliedDefaults.slides || []).map(slide => slide.background?.kind))
	const coherent = actual ? backgroundKinds.has('gradient') : !backgroundKinds.has('gradient')
	const backgroundOp = plan.operations?.find(op => op.tool === 'betterpptx.slide.add')
	const gradientPositions = backgroundOp?.args?.background?.gradientStops?.map(stop => stop.position) || []
	const stopsPass = expected
		? gradientPositions.length >= 2 && gradientPositions[0] === 0 && gradientPositions.at(-1) === 100 && gradientPositions.every((position, index) => index === 0 || position > gradientPositions[index - 1])
		: gradientPositions.length === 0
	const pass = actual === expected && coherent && stopsPass && actualAccents === expectedAccents && actualDepth === expectedDepth
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${world.padEnd(11)} mode=${mode.padEnd(5)} gradient=${expected}/${actual} stops=${gradientPositions.join(',') || 'none'} accents=${expectedAccents}/${actualAccents} depth=${expectedDepth}/${actualDepth} backgrounds=${[...backgroundKinds].join(',')}`)
}

const bespokeCases = [
	{ name: 'bespoke-glass', fill: 'glass', expected: true },
	{ name: 'bespoke-flat', fill: 'flat', expected: false },
]
for (const item of bespokeCases) {
	const artDirection = { label: item.name, mode: 'light', palette: ['202020', '0EA5E9', '14B8A6', 'F59E0B', 'F8FAFC'], card: 'panel', surface: { fill: item.fill } }
	const plan = buildSpecOperationPlan(specFor(artDirection))
	const actual = plan.appliedDefaults.gradientPolicy.expected === true
	const accentPass = plan.appliedDefaults.accentPolicy.minimumDistinctAccents === 2
	const depthExpected = item.fill === 'flat' ? 0 : 1
	const depthActual = plan.appliedDefaults.depthPolicy.minimumDepthObjectsPerSlide
	const backgroundKinds = new Set((plan.appliedDefaults.slides || []).map(slide => slide.background?.kind))
	const backgroundPass = item.expected ? backgroundKinds.has('gradient') : !backgroundKinds.has('gradient')
	const pass = actual === item.expected && accentPass && depthActual === depthExpected && backgroundPass
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${item.name.padEnd(11)} gradient=${item.expected}/${actual} accents=2/${plan.appliedDefaults.accentPolicy.minimumDistinctAccents} depth=${depthExpected}/${depthActual}`)
}

// BrandKit must preserve a continuous surface object even when a separate card
// preset is supplied. A bare card plus an explicit glass surface is intentionally
// gradient-native; dropping `surface` would silently flatten the author's choice.
{
	const brandSpec = specFor({})
	delete brandSpec.styleIntent
	const plan = buildSpecOperationPlan({
		...brandSpec,
		brandKit: {
			label: 'Brand surface override',
			mode: 'dark',
			palette: ['F8FAFC', '2DD4BF', '38BDF8', 'F59E0B', '0B1120'],
			card: 'bare',
			surface: { fill: 'glass', corner: 0.08, border: 'lifted', elevation: 'glass' },
		},
		slides: [{ id: 's', title: 'A governed surface', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'A governed surface' },
			{ kind: 'metric-grid', name: 'metrics', items: [{ name: 'one', label: 'Signal', value: '1' }], verified: true, evidenceSource: 'synthetic fixture' },
		]}],
	})
	const metric = plan.operations.find(operation => String(operation.args?.options?.objectName || '').includes('.metric-card.'))
	const fill = metric?.args?.options?.fill
	const pass = plan.appliedDefaults.gradientPolicy.expected === true
		&& fill?.type === 'gradient'
		&& plan.appliedDefaults.artDirectionNote?.includes('card:bare')
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'}  brandKit-surface-override gradient=${plan.appliedDefaults.gradientPolicy.expected} metricFill=${fill?.type || 'none'}`)
}

// The compatibility `theme.artDirection` form must resolve through the same
// World policy as the public `styleIntent.artDirection` form. In particular,
// an inline glass surface is gradient-native even when supplied through the
// theme compatibility lane.
for (const item of bespokeCases) {
	const themeSpec = specFor({})
	delete themeSpec.styleIntent.artDirection
	themeSpec.theme = { artDirection: { label: item.name, mode: 'light', card: 'panel', surface: { fill: item.fill } } }
	const policy = gradientPolicyForArtDirection(themeSpec)
	const depthPolicy = depthPolicyForArtDirection(themeSpec)
	const plan = buildSpecOperationPlan(themeSpec)
	const actual = policy.expected === true
	const compiled = plan.appliedDefaults.gradientPolicy.expected === true
	const expectedDepth = item.fill === 'flat' ? 0 : 1
	const backgroundKinds = new Set((plan.appliedDefaults.slides || []).map(slide => slide.background?.kind))
	const backgroundPass = item.expected ? backgroundKinds.has('gradient') : !backgroundKinds.has('gradient')
	const pass = actual === item.expected && compiled === item.expected
		&& depthPolicy.minimumDepthObjectsPerSlide === expectedDepth
		&& plan.appliedDefaults.depthPolicy.minimumDepthObjectsPerSlide === expectedDepth
		&& backgroundPass
	if (!pass) failures++
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${item.name.padEnd(11)} theme.artDirection gradient=${item.expected}/${actual} compiled=${compiled} depth=${expectedDepth}/${depthPolicy.minimumDepthObjectsPerSlide}/${plan.appliedDefaults.depthPolicy.minimumDepthObjectsPerSlide} backgrounds=${[...backgroundKinds].join(',')}`)
}

console.log(`\n${failures === 0 ? 'ALL WORLD TREATMENT POLICY CASES PASS' : `${failures} WORLD TREATMENT POLICY CASE(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
