#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { artCompositionForSpec, deterministicPlanDigest, estimateRichTextFit, estimateTextFit, planDeckLayout, recommendSlideLayouts, textColorRolesForSpec, validateLayoutPlan, LAYOUT_INTENT_CONTRACTS, AUTHORING_REGION_ALIASES } from './ir/layout-engine.mjs'
import { expandPresenterDirective } from './ir/presenter-director.mjs'
import { collectCompositionIssues } from './engine.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const examplesDir = path.join(__dirname, 'ir', 'examples')
const spikePath = path.join(__dirname, 'ir', 'placeholder-authoring-spike-2026-06-06.md')

function fail(message, detail = {}) {
	console.error('LAYOUT ENGINE V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

async function loadExamples() {
	const names = (await fs.readdir(examplesDir)).filter(name => name.endsWith('.v1.json')).sort()
	const specs = []
	for (const name of names) {
		specs.push({ name, spec: JSON.parse(await fs.readFile(path.join(examplesDir, name), 'utf8')) })
	}
	return specs
}

function assertNoBlockingIssues(fileName, result) {
	const blocking = result.issues.filter(issue => [
		'MISSING_OBJECT_NAME',
		'DUPLICATE_OBJECT_NAME',
		'OFF_SLIDE_OBJECT',
		'TEXT_OVERFLOW_RISK',
	].includes(issue.code) && !(issue.code === 'TEXT_OVERFLOW_RISK' && issue.severity === 'warning'))
	if (blocking.length) fail('Layout invariants failed.', { fileName, blocking })
}

function assertTextEstimatorFixtures() {
	const short = estimateTextFit({ text: 'Short executive headline', rect: { w: 7, h: 0.8 }, fontSize: 28 })
	if (short.overflow || short.fontSize !== 28) fail('Text estimator shrank a short headline unexpectedly.', short)
	const long = estimateTextFit({
		text: 'A long operating update with enough words to require wrapping and font-size compression inside a deliberately compact text frame.',
		rect: { w: 3.2, h: 0.62 },
		fontSize: 18,
		minFontSize: 10,
	})
	if (long.fontSize >= 18) fail('Text estimator did not attempt shrink for compact text.', long)
	if (!Number.isInteger(long.lines) || long.lines < 2) fail('Text estimator line count is not plausible.', long)
	const blankLines = estimateTextFit({ text: 'First\n\nThird', rect: { w: 4, h: 2 }, fontSize: 16, minFontSize: 16 })
	if (blankLines.lines !== 3) fail('Plain-text estimator collapsed an explicit blank line.', blankLines)
	const adjacentRuns = estimateRichTextFit({ runs: [
		{ text: 'Alpha123', options: { fontSize: 16 } },
		{ text: 'Beta4567', options: { fontSize: 16 } },
	], rect: { w: 1.2, h: 1 }, margin: 0.08, fontFace: 'Aptos' })
	if (adjacentRuns.lines !== 2) fail('Rich-run estimator did not accumulate adjacent runs inside one serializer paragraph.', adjacentRuns)
	const richBlankLine = estimateRichTextFit({ runs: [
		{ text: 'First\n\n', options: { fontSize: 16 } },
		{ text: 'Third', options: { fontSize: 16 } },
	], rect: { w: 4, h: 2 }, margin: 0.08, fontFace: 'Aptos' })
	if (richBlankLine.lines !== 3) fail('Rich-run estimator collapsed an embedded serializer blank line.', richBlankLine)
	const overflow = validateLayoutPlan({ slideSize: { w: 13.333, h: 7.5 }, slides: [{ slideId: 'overflow', objects: [{
		objectName: 'overflow-copy', primitive: 'text', text: 'A deliberately very long semantic paragraph that cannot fit inside this tiny text frame even at the configured minimum font size.', rect: { x: 1, y: 1, w: 1, h: 0.25 }, fit: estimateTextFit({ text: 'A deliberately very long semantic paragraph that cannot fit inside this tiny text frame even at the configured minimum font size.', rect: { w: 1, h: 0.25 }, fontSize: 18, minFontSize: 10 }),
	}] }] }).issues.find(issue => issue.code === 'TEXT_OVERFLOW_RISK')
	if (!overflow || !overflow.reason || !overflow.fix || overflow.evidence?.textCharacters <= 0 || overflow.evidence?.lineCount < 2 || overflow.evidence?.estimatedHeightIn <= overflow.evidence?.availableHeightIn) fail('Text overflow validation did not expose actionable measured evidence.', { overflow })
	const offSlide = validateLayoutPlan({ slideSize: { w: 13.333, h: 7.5 }, slides: [{ slideId: 'off-slide', objects: [{
		objectName: 'off-slide-copy', primitive: 'text', rect: { x: -0.5, y: 1, w: 4, h: 2 }, placementSource: 'author',
	}] }] }).issues.find(issue => issue.code === 'OFF_SLIDE_OBJECT')
	if (!offSlide || offSlide.severity !== 'error' || !offSlide.reason || !offSlide.fix || offSlide.evidence?.edges?.left !== 0.5 || offSlide.evidence?.allowed !== false || offSlide.evidence?.placementSource !== 'author') fail('Off-slide validation did not expose actionable edge evidence.', { offSlide })
}

function assertWorldModePaletteCorrection() {
	const contradictory = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'World mode palette correction',
		styleIntent: { artDirection: 'candy', mode: 'dark' },
		theme: { palette: ['171226', 'F472B6', 'A78BFA', '2DD4BF', 'FFF7ED'] },
		slides: [{ id: 'mode', title: 'Mode', layoutIntent: 'title-body', content: [{ kind: 'title', name: 'title', text: 'Mode' }] }],
	}
	const plan = planDeckLayout(contradictory)
	const background = plan.slides[0]?.background
	const stops = background?.gradientStops || []
	const last = stops[stops.length - 1]?.color
	if (!background || background.type !== 'gradient' || !last || !/^[0-9A-F]{6}$/i.test(last) || parseInt(last.slice(0, 2), 16) > 110) {
		fail('Contradictory dark World/light palette was not corrected to a dark gradient canvas.', { background })
	}
	if (plan.slides[0]?.visualSystem?.tone !== 'dark') fail('Corrected World mode did not remain dark.', { visualSystem: plan.slides[0]?.visualSystem })
}

function assertDiagramDoesNotRepeatSlideTitle() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Diagram title ownership',
		slides: [{ id: 'diagram', title: 'One title', layoutIntent: 'process-flow', content: [
			{ kind: 'title', name: 'title', text: 'One title' },
			{ kind: 'diagram', name: 'flow', nodes: [{ name: 'one', label: 'One', text: 'First' }, { name: 'two', label: 'Two', text: 'Second' }] },
		] }],
	}
	const diagram = planDeckLayout(spec).slides[0].objects.find(object => object.role === 'smartart')
	if (!diagram || diagram.title !== null) fail('Semantic diagram inherited slide metadata as a duplicate visible title.', { diagram })
}

function assertSemanticColumnArrangement() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Semantic columns',
		slides: [{
			id: 'cols',
			title: 'Balanced semantic columns',
			layoutIntent: 'title-body',
			arrange: { cols: 2 },
			content: [
				{ kind: 'title', name: 'title', text: 'Balanced semantic columns' },
				{ kind: 'stat', name: 'one', value: '1', label: 'One', verified: true },
				{ kind: 'stat', name: 'two', value: '2', label: 'Two', verified: true },
				{ kind: 'stat', name: 'three', value: '3', label: 'Three', verified: true },
				{ kind: 'stat', name: 'four', value: '4', label: 'Four', verified: true },
			],
		}],
	}
	const plan1 = planDeckLayout(spec)
	const plan2 = planDeckLayout(spec)
	const digest1 = deterministicPlanDigest(plan1)
	const digest2 = deterministicPlanDigest(plan2)
	if (digest1 !== digest2) fail('Semantic column arrangement is not deterministic.', { digest1, digest2 })
	const result = validateLayoutPlan(plan1)
	assertNoBlockingIssues('semantic-column-arrangement', result)
	const cards = plan1.slides[0].objects.filter(object => ['one', 'two', 'three', 'four'].includes(object.blockName))
	if (cards.length !== 4) fail('Semantic column arrangement did not retain all cards.', { cards: cards.map(c => c.blockName) })
	const xs = [...new Set(cards.map(card => card.rect.x))].sort((a, b) => a - b)
	const ys = [...new Set(cards.map(card => card.rect.y))].sort((a, b) => a - b)
	if (xs.length !== 2 || ys.length !== 2) fail('Semantic column arrangement did not produce a 2x2 grid.', { xs, ys })
	if (cards.some(card => card.rect.w <= 0 || card.rect.h <= 0)) fail('Semantic column arrangement produced an empty card.', { cards })
	const balance = plan1.slides[0].visualBalance
	if (balance?.mode !== 'arrange-grid' || !balance.regions?.grid1 || !balance.regions?.grid2 || balance.totalRegionCount !== 2 || balance.arrangementApplied !== true) fail('Semantic column arrangement did not expose engine balance readback for its generated columns.', { balance })
}

function assertSplitCopyAndCalloutStack() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Split copy stack',
		slides: [{ id: 'split', title: 'Split copy stack', layoutIntent: 'image-left-copy-right', content: [
			{ kind: 'title', name: 'title', text: 'Split copy stack' },
			{ kind: 'image', name: 'stage-proof', visualIntent: { mode: 'generate', concept: 'an empty community theater stage with warm lights', consistencyGroup: 'split-stack-test' }, altText: 'Empty theater stage' },
			{ kind: 'textBox', name: 'body', text: 'Body copy explains the funding need and the audience impact.' },
			{ kind: 'callout', name: 'callout', text: 'Target $50,000 representative goal' },
		]}],
	}
	const plan = planDeckLayout(spec)
	const slide = plan.slides[0]
	const body = slide.objects.find(object => object.blockName === 'body')
	const callout = slide.objects.find(object => object.blockName === 'callout')
	if (!body || !callout) fail('Split copy/callout regression fixture did not retain both semantic blocks.', { objects: slide.objects })
	if (body.rect.y + body.rect.h > callout.rect.y - 0.02) fail('Split copy and callout still overlap.', { body: body.rect, callout: callout.rect })
	const overlap = validateLayoutPlan(plan).issues.find(issue => issue.code === 'OBJECT_OVERLAP' && [issue.objectName, issue.otherObjectName].includes('body') && [issue.objectName, issue.otherObjectName].includes('callout'))
	if (overlap) fail('Split copy/callout semantic stack emitted an OBJECT_OVERLAP warning.', { overlap, body: body.rect, callout: callout.rect })
}

function assertComparisonCalloutReservesBand() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Comparison callout band',
		slides: [{ id: 'comparison', title: 'Comparison callout band', layoutIntent: 'comparison', content: [
			{ kind: 'title', name: 'title', text: 'Comparison callout band' },
			{ kind: 'comparison', name: 'alternatives', items: [
				{ name: 'try', label: 'Try', text: 'Test the next customer step.', verified: true, evidenceSource: 'verification-fixture' },
				{ name: 'shape', label: 'Shape', text: 'Use evidence to decide what follows.', verified: true, evidenceSource: 'verification-fixture' },
			] },
			{ kind: 'callout', name: 'decision', text: 'Choose the next horizon from evidence.', verified: true, evidenceSource: 'verification-fixture' },
		]}],
	}
	const plan = planDeckLayout(spec)
	const slide = plan.slides[0]
	const panels = slide.objects.filter(object => object.role === 'comparison-panel')
	const callout = slide.objects.find(object => object.role === 'callout')
	if (panels.length !== 2 || !callout) fail('Comparison callout regression fixture did not retain both panels and the callout.', { objects: slide.objects })
	const panelBottom = Math.max(...panels.map(panel => panel.rect.y + panel.rect.h))
	if (callout.rect.y < panelBottom + 0.02) fail('Comparison callout still overlaps a composite comparison panel.', { panels: panels.map(panel => panel.rect), callout: callout.rect })
	const overlap = validateLayoutPlan(plan).issues.find(issue => issue.code === 'OBJECT_OVERLAP' && issue.evidence?.objects?.some(name => String(name).includes('callout')))
	if (overlap) fail('Comparison callout semantic band emitted an OBJECT_OVERLAP warning.', { overlap, panels: panels.map(panel => panel.rect), callout: callout.rect })
}

function assertParentProofPropagatesToExpandedSteps() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Parent proof propagation',
		slides: [{ id: 'process', title: 'Parent proof propagation', layoutIntent: 'process-flow', content: [
			{ kind: 'title', name: 'title', text: 'Parent proof propagation' },
			{ kind: 'process', name: 'rhythm', verified: true, evidenceSource: 'verification-fixture', items: [
				{ name: 'one', label: 'One', text: 'First step.' },
				{ name: 'two', label: 'Two', text: 'Second step.' },
			] },
		]}],
	}
	const plan = planDeckLayout(spec)
	const warnings = plan.warnings.filter(item => item.code === 'UNVERIFIED_DATA')
	if (warnings.length) fail('Verified parent proof was not propagated to expanded process steps.', { warnings })
}

function assertKpiReadingOrder() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'KPI reading order',
		styleIntent: { artDirection: 'blueprint', mode: 'dark' },
		theme: { palette: ['0B1120', '0E7490', '22D3EE', 'F59E0B', 'F8FAFC'] },
		slides: [{ id: 'kpi', title: 'KPI', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'KPI' },
			{ kind: 'stat', name: 'metric', value: '248', label: 'ARR', delta: '+22% YoY', verified: true },
		] }],
	}
	const stat = planDeckLayout(spec).slides[0].objects.find(object => object.blockName === 'metric')
	const order = Array.isArray(stat?.text) ? stat.text.map(run => run.text) : []
	if (JSON.stringify(order) !== JSON.stringify(['248', 'ARR', '+22% YoY'])) fail('KPI text order is not value → label → delta.', { order })
	if (stat?.text?.[2]?.options?.color !== '22D3EE') fail('Positive KPI delta did not use the readable proof-text role on a dark surface.', { text: stat?.text })
}

function assertEffectReadback() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Effect readback',
		slides: [{ id: 'effect', title: 'Effect', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Effect' },
			{ kind: 'textShape', name: 'soft', text: 'Soft edge', options: { softEdges: { radius: 4 } }, verified: true },
		] }],
	}
	const effectObject = planDeckLayout(spec).slides[0].objects.find(object => object.blockName === 'soft')
	if (effectObject?.style?.softEdges?.radius !== 4) fail('Dry-run style readback lost the softEdges contract.', { style: effectObject?.style })
}

function assertText3dFocalSizingAndAuthorControl() {
	const base = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Text3D focal sizing',
		slides: [{ id: 'text3d', title: 'Decide', layoutIntent: 'two-column', content: [
			{ kind: 'title', name: 'title', text: 'Decide' },
			{ kind: 'text3d', name: 'decision-mark', text: 'GO', region: 'right' },
		] }],
	}
	const focal = planDeckLayout(base).slides[0].objects.find(object => object.blockName === 'decision-mark')
	if (!focal || focal.style?.fontSize < 90 || focal.style?.align !== 'center' || focal.style?.valign !== 'mid' || focal.fit?.overflow) {
		fail('Short semantic Text3D did not use its solved host as a focal display mark.', { focal })
	}
	const authored = structuredClone(base)
	authored.slides[0].content[1].style = { fontSize: 64, align: 'left', valign: 'top' }
	const exact = planDeckLayout(authored).slides[0].objects.find(object => object.blockName === 'decision-mark')
	if (exact?.style?.fontSize !== 64 || exact?.fit?.requestedFontSize !== 64 || exact?.style?.align !== 'left' || exact?.style?.valign !== 'top') {
		fail('Authored Text3D typography did not remain authoritative.', { exact })
	}
}

function assertArrangementBoundary() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Arrangement boundary',
		slides: [{ id: 'boundary', title: 'Boundary', layoutIntent: 'title-body', arrange: { cols: 1 }, content: [
			{ kind: 'title', name: 'title', text: 'Boundary' },
			{ kind: 'stat', name: 'metric', value: '1', label: 'Fallback', verified: true },
		] }],
	}
	const plan = planDeckLayout(spec)
	const warning = plan.warnings.find(item => item.code === 'ARRANGE_COLS_OUT_OF_RANGE')
	if (!warning || warning.severity !== 'warning' || !warning.reason || !warning.fix || warning.evidence?.allowed?.minimum !== 2 || !warning.suggestions.some(item => item?.cols === 2) || !warning.suggestions.includes('stack')) {
		fail('Invalid semantic column count did not produce an actionable warning.', { warnings: plan.warnings })
	}
}

function assertSplitBoundary() {
	const invalidSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Split boundary',
		slides: [{ id: 'split-invalid', title: 'Split', layoutIntent: 'title-body', arrange: { split: [60, -40] }, content: [
			{ kind: 'title', name: 'title', text: 'Split' },
			{ kind: 'stat', name: 'metric', value: '1', label: 'Fallback', verified: true },
		] }],
	}
	const invalidPlan = planDeckLayout(invalidSpec)
	const invalidWarning = invalidPlan.warnings.find(item => item.code === 'ARRANGE_SPLIT_INVALID')
	if (!invalidWarning || !invalidWarning.reason || !invalidWarning.fix || invalidWarning.evidence?.minimumLaneIn !== 0.01 || !invalidWarning.suggestions.some(item => Array.isArray(item?.split) && item.split.length === 2)) fail('Invalid semantic split did not produce an actionable warning.', { warnings: invalidPlan.warnings })
	for (const split of [[1e308, 1e308], [Number.MIN_VALUE, 1]]) {
		const unstablePlan = planDeckLayout({ ...invalidSpec, slides: [{ ...invalidSpec.slides[0], id: `split-unstable-${String(split[0])}`, arrange: { split } }] })
		const unstableWarning = unstablePlan.warnings.find(item => item.code === 'ARRANGE_SPLIT_INVALID')
		const objects = unstablePlan.slides[0].objects.filter(object => object.blockName === 'metric')
		if (!unstableWarning || objects.some(object => !Number.isFinite(object.rect.w) || !Number.isFinite(object.rect.h) || object.rect.w <= 0 || object.rect.h <= 0)) fail('Numerically unstable semantic split was not rejected before rectangle math.', { split, warnings: unstablePlan.warnings, objects })
	}
	const validSpec = { ...invalidSpec, slides: [{ ...invalidSpec.slides[0], id: 'split-valid', arrange: { split: [60, 40] }, content: [
		{ kind: 'title', name: 'title', text: 'Split' },
		{ kind: 'stat', name: 'left', value: '1', label: 'Left', verified: true },
		{ kind: 'stat', name: 'right', value: '2', label: 'Right', verified: true },
	] }] }
	const validPlan = planDeckLayout(validSpec)
	if (validPlan.warnings.some(item => item.code === 'ARRANGE_SPLIT_INVALID')) fail('Valid semantic split was rejected.', { warnings: validPlan.warnings })
	const cards = validPlan.slides[0].objects.filter(object => ['left', 'right'].includes(object.blockName))
	if (cards.length !== 2 || cards.some(card => card.rect.w <= 0 || card.rect.h <= 0)) fail('Valid semantic split produced invalid rectangles.', { cards })
	const balance = validPlan.slides[0].visualBalance
	if (balance?.mode !== 'arrange-split' || !balance.regions?.split1 || !balance.regions?.split2 || balance.arrangementApplied !== true) fail('Valid semantic split did not expose engine balance readback for its generated columns.', { balance })
}

function assertDenseStackFallsBackSafely() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Dense stack boundary',
		slides: [{ id: 'dense-stack', title: 'Dense stack', layoutIntent: 'title-body', arrange: 'stack', content: [
			{ kind: 'title', name: 'title', text: 'Dense stack' },
			...Array.from({ length: 40 }, (_, index) => ({ kind: 'textShape', name: `body-${index}`, text: `Body ${index + 1}` })),
		]}],
	}
	const plan = planDeckLayout(spec)
	const warning = plan.warnings.find(item => item.code === 'ARRANGE_STACK_TOO_DENSE')
	const objects = plan.slides[0].objects.filter(object => object.blockName.startsWith('body-'))
	if (!warning || warning.severity !== 'warning' || !warning.reason || !warning.fix || warning.evidence?.fallback !== 'engine-grid' || !warning.suggestions.some(item => item?.cols === 3)) {
		fail('Dense semantic stack did not expose an actionable bounded-grid correction.', { warnings: plan.warnings })
	}
	if (objects.length !== 40 || objects.some(object => !Number.isFinite(object.rect.x) || !Number.isFinite(object.rect.y) || !Number.isFinite(object.rect.w) || !Number.isFinite(object.rect.h) || object.rect.x < 0 || object.rect.y < 0 || object.rect.x + object.rect.w > 13.333 + 0.001 || object.rect.y + object.rect.h > 7.5 + 0.001 || object.rect.w <= 0 || object.rect.h <= 0)) {
		fail('Dense semantic stack fallback produced invalid or off-slide rectangles.', { objects: objects.map(object => ({ name: object.blockName, rect: object.rect })) })
	}
	const blocking = validateLayoutPlan(plan).issues.filter(issue => ['OFF_SLIDE_OBJECT', 'OBJECT_OVERLAP'].includes(issue.code))
	if (blocking.length) fail('Dense semantic stack fallback still violates layout invariants.', { blocking })
}

function assertDenseSplitAndSidebarFallBackSafely() {
	const makeSpec = (layoutIntent, arrange = null) => ({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: `Dense ${layoutIntent}`,
		slides: [{ id: `dense-${layoutIntent}`, title: `Dense ${layoutIntent}`, layoutIntent, ...(arrange ? { arrange } : {}), content: [
			{ kind: 'title', name: 'title', text: 'Dense composition' },
			...Array.from({ length: 40 }, (_, index) => ({ kind: 'textShape', name: `body-${index}`, text: `Body ${index + 1}` })),
		]}],
	})
	for (const [label, spec, code, fallback] of [
		['split', makeSpec('title-body', { split: [60, 40] }), 'ARRANGE_SPLIT_TOO_DENSE', 'engine-grid'],
		['sidebar', makeSpec('sidebar-left'), 'ARRANGE_SIDEBAR_TOO_DENSE', 'lane-grid'],
	]) {
		const plan = planDeckLayout(spec)
		const warning = plan.warnings.find(item => item.code === code)
		const objects = plan.slides[0].objects.filter(object => object.blockName.startsWith('body-'))
		if (!warning || warning.severity !== 'warning' || !warning.reason || !warning.fix || warning.evidence?.fallback !== fallback) {
			fail(`Dense semantic ${label} did not expose an actionable bounded fallback.`, { warnings: plan.warnings })
		}
		if (objects.length !== 40 || objects.some(object => !Number.isFinite(object.rect.x) || !Number.isFinite(object.rect.y) || !Number.isFinite(object.rect.w) || !Number.isFinite(object.rect.h) || object.rect.x < 0 || object.rect.y < 0 || object.rect.x + object.rect.w > 13.333 + 0.001 || object.rect.y + object.rect.h > 7.5 + 0.001 || object.rect.w <= 0 || object.rect.h <= 0)) {
			fail(`Dense semantic ${label} fallback produced invalid or off-slide rectangles.`, { objects: objects.map(object => ({ name: object.blockName, rect: object.rect })) })
		}
		const blocking = validateLayoutPlan(plan).issues.filter(issue => ['OFF_SLIDE_OBJECT', 'OBJECT_OVERLAP'].includes(issue.code))
		if (blocking.length) fail(`Dense semantic ${label} fallback still violates layout invariants.`, { blocking })
	}
}

function assertDenseColumnGridFallsBackSafely() {
	for (const requested of [2, 3, 4]) {
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: `Dense cols ${requested}`,
			slides: [{ id: `dense-cols-${requested}`, title: 'Dense columns', layoutIntent: 'title-body', arrange: { cols: requested }, content: [
				{ kind: 'title', name: 'title', text: 'Dense columns' },
				...Array.from({ length: 40 }, (_, index) => ({ kind: 'textShape', name: `body-${index}`, text: `Body ${index + 1}` })),
			] }],
		}
		const plan = planDeckLayout(spec)
		const warning = plan.warnings.find(item => item.code === 'ARRANGE_COLS_TOO_DENSE')
		const objects = plan.slides[0].objects.filter(object => object.blockName.startsWith('body-'))
		if (!warning || warning.severity !== 'warning' || !warning.reason || !warning.fix || warning.evidence?.fallback !== 'engine-grid' || warning.evidence?.resolvedColumns !== 4) {
			fail(`Dense semantic cols:${requested} did not expose an actionable bounded-grid correction.`, { warnings: plan.warnings })
		}
		if (objects.length !== 40 || objects.some(object => !Number.isFinite(object.rect.x) || !Number.isFinite(object.rect.y) || !Number.isFinite(object.rect.w) || !Number.isFinite(object.rect.h) || object.rect.x < 0 || object.rect.y < 0 || object.rect.x + object.rect.w > 13.333 + 0.001 || object.rect.y + object.rect.h > 7.5 + 0.001 || object.rect.w <= 0 || object.rect.h <= 0)) {
			fail(`Dense semantic cols:${requested} fallback produced invalid or off-slide rectangles.`, { objects: objects.map(object => ({ name: object.blockName, rect: object.rect })) })
		}
		const blocking = validateLayoutPlan(plan).issues.filter(issue => ['OFF_SLIDE_OBJECT', 'OBJECT_OVERLAP'].includes(issue.code))
		if (blocking.length) fail(`Dense semantic cols:${requested} fallback still violates layout invariants.`, { blocking })
	}
}

function assertRegionPlanBoundary() {
	const invalidSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Region plan boundary',
		slides: [{ id: 'region-invalid', title: 'Region plan', layoutIntent: 'title-body', regionPlan: { hero: { x: 1, y: 1, w: 4, h: 2 } }, content: [
			{ kind: 'title', name: 'title', text: 'Region plan' },
			{ kind: 'text', name: 'hero-copy', region: 'hero', text: 'Semantic fallback', verified: true },
		] }],
	}
	const invalidPlan = planDeckLayout(invalidSpec)
	const forbidden = invalidPlan.warnings.find(item => item.code === 'REGION_PLAN_GEOMETRY_FORBIDDEN')
	if (!forbidden || forbidden.severity !== 'error') fail('Coordinate-driven regionPlan was not rejected.', { warnings: invalidPlan.warnings })
	const semanticSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Region plan semantic split',
		slides: [{ id: 'region-valid', title: 'Region plan', layoutIntent: 'title-body', regionPlan: { split: 'columns', names: ['left', 'right'], weights: [60, 40] }, content: [
			{ kind: 'title', name: 'title', text: 'Region plan' },
			{ kind: 'text', name: 'left-copy', region: 'left', text: 'Left semantic region', verified: true },
			{ kind: 'text', name: 'right-copy', region: 'right', text: 'Right semantic region', verified: true },
		] }],
	}
	const semanticPlan = planDeckLayout(semanticSpec)
	if (semanticPlan.warnings.some(item => item.code === 'REGION_PLAN_GEOMETRY_FORBIDDEN' || item.code === 'REGION_PLAN_INVALID')) {
		fail('Semantic regionPlan split was rejected.', { warnings: semanticPlan.warnings })
	}
	const objects = semanticPlan.slides[0].objects.filter(object => ['left-copy', 'right-copy'].includes(object.blockName))
	if (objects.length !== 2 || objects.some(object => object.rect.w <= 0 || object.rect.h <= 0)) fail('Semantic regionPlan split did not produce positive engine rectangles.', { objects })
	for (const [label, regionPlan, expected] of [
		['invalid-axis', { split: 'diagonal', names: ['left', 'right'] }, 'not supported'],
		['invalid-weights', { split: 'columns', names: ['left', 'right'], weights: [1, -2] }, 'finite positive'],
		['invalid-gap', { split: 'columns', names: ['left', 'right'], gap: 999 }, 'no usable column span'],
		['duplicate-names', { split: 'columns', names: ['left', 'left'] }, 'unique semantic region names'],
	]) {
		const plan = planDeckLayout({ ...semanticSpec, slides: [{ ...semanticSpec.slides[0], id: label, regionPlan }] })
		const warning = plan.warnings.find(item => item.code === 'REGION_PLAN_INVALID')
		if (!warning || !warning.message.includes(expected) || !warning.reason || !warning.fix) fail(`Malformed ${label} regionPlan did not fail closed with actionable evidence.`, { warnings: plan.warnings })
	}
}

function assertActionableFindingCoverage() {
	const cases = [
		{
			code: 'REGION_PLAN_INVALID',
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Invalid region grammar', slides: [{ id: 'region-grammar', title: 'Region', regionPlan: { hero: { role: 'hero' } }, content: [{ kind: 'textBox', name: 'copy', text: 'Copy' }] }] },
		},
		{
			code: 'REGION_PLAN_GEOMETRY_FORBIDDEN',
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Forbidden region geometry', slides: [{ id: 'region-geometry', title: 'Region', regionPlan: { hero: { x: 1, y: 1, w: 2, h: 2 } }, content: [{ kind: 'textBox', name: 'copy', text: 'Copy' }] }] },
		},
		{
			code: 'UNSTABLE_HANDLE',
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Missing semantic name', slides: [{ id: 'name', title: 'Name', content: [{ kind: 'textBox', text: 'Copy' }] }] },
		},
		{
			code: 'DUPLICATE_HANDLE',
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Duplicate identity', slides: [{ id: 'duplicate', title: 'Duplicate', content: [{ kind: 'textBox', name: 'one', editHandle: 'same', text: 'One' }, { kind: 'textBox', name: 'two', editHandle: 'same', text: 'Two' }] }] },
		},
		{
			code: 'SHAPE_TEXT_FORBIDDEN',
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Shape text', slides: [{ id: 'shape-text', title: 'Shape', content: [{ kind: 'shape', name: 'bad-shape', text: 'Text in geometry' }] }] },
		},
		{
			code: 'MODEL3D_ASSET_MISSING',
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Missing model intent', slides: [{ id: 'model', title: 'Model', content: [{ kind: 'model3d', name: 'hero' }] }] },
		},
		{
			code: 'MORPH_NO_PAIRED_OBJECTS',
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Unpaired morph', slides: [{ id: 'before', title: 'Before', content: [{ kind: 'textBox', name: 'before-copy', text: 'Before' }] }, { id: 'after', title: 'After', transition: { type: 'morph', option: 'byObject' }, content: [{ kind: 'textBox', name: 'after-copy', text: 'After' }] }] },
		},
	]
	for (const item of cases) {
		const plan = planDeckLayout(item.spec)
		const finding = plan.warnings.find(warning => warning.code === item.code)
		if (!finding || typeof finding.reason !== 'string' || typeof finding.fix !== 'string' || !finding.evidence || typeof finding.evidence !== 'object') {
			fail(`Finding ${item.code} is not actionable for a cold AI client.`, { finding, warnings: plan.warnings })
		}
	}
}

function assertIntentContentMismatchReadback() {
	const missingProofSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Intent/content mismatch',
		slides: [{
			id: 'mismatch',
			title: 'Missing visual proof',
			layoutIntent: 'image-left-copy-right',
			content: [{ kind: 'title', name: 'title', text: 'Missing visual proof' }, { kind: 'textBox', name: 'copy', text: 'Explanation only.' }],
		}],
	}
	const missingPlan = planDeckLayout(missingProofSpec)
	const mismatch = missingPlan.warnings.find(item => item.code === 'LAYOUT_INTENT_CONTENT_MISMATCH')
	if (!mismatch || mismatch.severity !== 'warning' || !mismatch.evidence?.contentKinds?.includes('textBox') || !mismatch.suggestions.includes('title-body')) {
		fail('Missing semantic proof did not produce an actionable layout mismatch readback.', { warnings: missingPlan.warnings })
	}
	if (!mismatch.reason || !mismatch.fix || !mismatch.evidence?.expected) fail('Layout mismatch readback is missing reason/fix/evidence.', { mismatch })
	const validSpec = {
		...missingProofSpec,
		slides: [{ ...missingProofSpec.slides[0], id: 'valid', content: [
			{ kind: 'title', name: 'title', text: 'Visual proof' },
			{ kind: 'image-feature', name: 'proof-image', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Proof image' },
			{ kind: 'textBox', name: 'copy', text: 'Explanation paired with proof.' },
		] }],
	}
	const validPlan = planDeckLayout(validSpec)
	if (validPlan.warnings.some(item => item.code === 'LAYOUT_INTENT_CONTENT_MISMATCH')) fail('Compatible image split produced a false mismatch warning.', { warnings: validPlan.warnings })
}

function assertIntentContractsStayAligned() {
	const required = {
		'image-left-copy-right': 'image/image-feature',
		'copy-left-image-right': 'image/image-feature',
		'chart-left-insights-right': 'chart/chart-panel',
		'insights-left-chart-right': 'chart/chart-panel',
		'metric-grid': 'stat/kpi',
	}
	for (const [intent, requiredProof] of Object.entries(required)) {
		if (LAYOUT_INTENT_CONTRACTS[intent]?.requiredProof !== requiredProof) fail('Public layout contract drifted from the runtime mismatch guard.', { intent, requiredProof, contract: LAYOUT_INTENT_CONTRACTS[intent] })
	}
	if (Object.keys(LAYOUT_INTENT_CONTRACTS).length !== 19) fail('Layout intent contract catalog is incomplete.', { count: Object.keys(LAYOUT_INTENT_CONTRACTS).length })
}

function assertUnderfilledRegionReadback() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Misassigned semantic regions',
		slides: [{ id: 'misassigned', title: 'Misassigned', layoutIntent: 'image-left-copy-right', content: [
			{ kind: 'title', name: 'title', text: 'Misassigned' },
			{ kind: 'image-feature', name: 'proof-image', image: 'data:image/png;base64,iVBORw0KGgo=', region: 'left' },
			{ kind: 'textBox', name: 'copy', text: 'Both blocks were pinned to the left region.', region: 'left' },
		] }],
	}
	const plan = planDeckLayout(spec)
	const warning = plan.warnings.find(item => item.code === 'LAYOUT_REGION_UNDERFILLED')
	if (!warning || warning.severity !== 'warning' || warning.evidence?.occupancy?.right?.area !== 0 || !warning.reason || !warning.fix || !warning.evidence?.occupancy) {
		fail('Misassigned semantic regions did not produce actionable underfill readback.', { warnings: plan.warnings })
	}
	const valid = planDeckLayout({ ...spec, slides: [{ ...spec.slides[0], id: 'balanced', content: [
		{ kind: 'title', name: 'title', text: 'Balanced' },
		{ kind: 'image-feature', name: 'proof-image', image: 'data:image/png;base64,iVBORw0KGgo=' },
		{ kind: 'textBox', name: 'copy', text: 'Engine assigns copy to the right region.' },
	] }] })
	if (valid.warnings.some(item => item.code === 'LAYOUT_REGION_UNDERFILLED')) fail('Balanced semantic split produced a false underfill warning.', { warnings: valid.warnings })
}

function assertNamedRegionStackingAndBalanceReadback() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Named-region balance',
		slides: [{ id: 'stacked', title: 'Named-region balance', layoutIntent: 'image-left-copy-right', content: [
			{ kind: 'title', name: 'title', text: 'Named-region balance' },
			{ kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=', region: 'left' },
			{ kind: 'textBox', name: 'copy-one', text: 'First explanation block.', region: 'right' },
			{ kind: 'textBox', name: 'copy-two', text: 'Second explanation block.', region: 'right' },
			{ kind: 'textBox', name: 'copy-three', text: 'Third explanation block.', region: 'right' },
		] }],
	}
	const plan = planDeckLayout(spec)
	const copy = plan.slides[0].objects.filter(object => ['copy-one', 'copy-two', 'copy-three'].includes(object.blockName))
	if (copy.length !== 3 || new Set(copy.map(object => object.rect.y)).size !== 3 || copy.some((object, index) => index > 0 && object.rect.y <= copy[index - 1].rect.y)) {
		fail('Multiple substantive blocks pinned to one semantic region were not stacked by the engine.', { copy })
	}
	const rightRegion = plan.slides[0].regions.right
	const stackTop = Math.min(...copy.map(object => object.rect.y))
	const stackBottom = Math.max(...copy.map(object => object.rect.y + object.rect.h))
	const topMargin = stackTop - rightRegion.y
	const bottomMargin = rightRegion.y + rightRegion.h - stackBottom
	if (stackBottom - stackTop >= rightRegion.h * 0.9 || topMargin < 0.2 || bottomMargin < 0.2) {
		fail('Named-region stacking did not create a compact centered reading group.', { rightRegion, copy, stackTop, stackBottom, topMargin, bottomMargin })
	}
	const layoutIssues = validateLayoutPlan(plan).issues.filter(issue => issue.code === 'OBJECT_OVERLAP')
	if (layoutIssues.length) fail('Named-region stacking produced overlap.', { layoutIssues, copy })
	const overlapReadback = validateLayoutPlan({ slideSize: { w: 13.333, h: 7.5 }, slides: [{ slideId: 'overlap', objects: [
		{ objectName: 'proof-image', primitive: 'image', rect: { x: 1, y: 1, w: 4, h: 3 } },
		{ objectName: 'proof-copy', primitive: 'text', rect: { x: 3, y: 2, w: 4, h: 2 } },
	] }] }).issues.find(issue => issue.code === 'OBJECT_OVERLAP')
	if (!overlapReadback || overlapReadback.severity !== 'warning' || !overlapReadback.reason || !overlapReadback.fix || overlapReadback.evidence?.objects?.includes('proof-image') !== true || overlapReadback.evidence?.overlapArea <= 0 || overlapReadback.evidence?.textVisualCollision !== true || overlapReadback.evidence?.engineAction !== 'report-only' || overlapReadback.evidence?.authoringAuthority !== 'ai') {
		fail('Overlap validation did not expose actionable semantic evidence.', { overlapReadback })
	}
	if (plan.warnings.some(item => item.code === 'LAYOUT_BALANCE_IMBALANCE')) {
		fail('A full proof lane beside a full, correctly stacked explanation lane was falsely classified as imbalanced from block count alone.', { warnings: plan.warnings })
	}
	const balanced = planDeckLayout({ ...spec, slides: [{ ...spec.slides[0], id: 'balanced', content: [
			{ kind: 'title', name: 'title', text: 'Balanced' },
			{ kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=' },
			{ kind: 'textBox', name: 'copy', text: 'One explanation block.' },
		] }] })
	if (balanced.warnings.some(item => item.code === 'LAYOUT_BALANCE_IMBALANCE')) fail('Balanced proof/explanation split produced a false imbalance warning.', { warnings: balanced.warnings })
	const explicit = planDeckLayout({ ...spec, slides: [{ ...spec.slides[0], id: 'explicit', content: [
			{ kind: 'title', name: 'title', text: 'Explicit geometry' },
			{ kind: 'textBox', name: 'copy', text: 'Maintainer-only explicit geometry.', region: 'right', options: { x: 7, y: 2, w: 4, h: 1 } },
		] }] })
	const explicitObject = explicit.slides[0].objects.find(object => object.blockName === 'copy')
	if (explicitObject?.placementSource !== 'author' || explicitObject?.placementIntentSource !== 'author-geometry') {
		fail('Explicit geometry was not distinguished from semantic region intent.', { explicitObject })
	}
}

function assertChartExplanationStacking() {
	const make = reversed => ({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Chart explanation stack',
		slides: [{
			id: reversed ? 'chart-stack-reversed' : 'chart-stack',
			layoutIntent: 'chart-left-insights-right',
			content: [
				{ kind: 'title', name: 'title', text: 'Economics bridge' },
				{ kind: 'chart-panel', name: 'proof', chartType: 'bar', data: [{ name: 'Case', labels: ['Base', 'Target'], values: [72, 94] }], verified: true, evidenceSource: 'fixture', altText: 'Illustrative economics bridge' },
				...(reversed ? [
					{ kind: 'callout', name: 'disclaimer', text: 'Illustrative only.' },
					{ kind: 'body', name: 'reading', text: 'The premium buys resilience and preserves the option to scale.' },
					{ kind: 'equation', name: 'formula', latex: 'NPV=\\sum_{t=1}^{n}\\frac{CF_t}{(1+r)^t}-I_0', altText: 'Net present value equation' },
				] : [
					{ kind: 'equation', name: 'formula', latex: 'NPV=\\sum_{t=1}^{n}\\frac{CF_t}{(1+r)^t}-I_0', altText: 'Net present value equation' },
					{ kind: 'body', name: 'reading', text: 'The premium buys resilience and preserves the option to scale.' },
					{ kind: 'callout', name: 'disclaimer', text: 'Illustrative only.' },
				]),
			],
		}],
	})
	for (const reversed of [false, true]) {
		const plan = planDeckLayout(make(reversed))
		const objects = Object.fromEntries(plan.slides[0].objects.filter(item => ['formula', 'reading', 'disclaimer'].includes(item.blockName)).map(item => [item.blockName, item]))
		const overlap = validateLayoutPlan(plan).issues.filter(issue => issue.code === 'OBJECT_OVERLAP' && (issue.objects || issue.evidence?.objects || []).some(name => /(?:formula|reading|disclaimer)/.test(name)))
		if (overlap.length || !objects.formula || !objects.reading || !objects.disclaimer
			|| !(objects.formula.rect.y < objects.reading.rect.y && objects.reading.rect.y < objects.disclaimer.rect.y)) {
			fail('Chart proof/explanation layout did not produce a stable non-overlapping formula → reading → disclaimer stack.', { reversed, objects, overlap, warnings: plan.warnings })
		}
		if (plan.warnings.some(item => item.code === 'LAYOUT_BALANCE_IMBALANCE')) fail('A filled chart/explanation pair produced a false balance warning.', { reversed, warnings: plan.warnings })
	}
}

function assertPresenterAwareIntentMatrix() {
	const source = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Presenter-aware layout matrix',
		presenter: {
			model: 'gen://trellis/rigged3d/layout-contract',
			stage: 'right',
			choreography: 'subtle',
			clipMap: { talk: 0, emphasize: 1, point: 2, bow: 3 },
		},
		slides: [
			{ id: 'hero', role: 'opener', layoutIntent: 'hero', narration: { text: 'Welcome to the decision.' }, content: [
				{ kind: 'title', name: 'hero-title', text: 'A governed premium stage' },
				{ kind: 'image-feature', name: 'hero-proof', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Abstract proof image' },
				{ kind: 'body', name: 'hero-copy', text: 'One focal proof and one concise reading.' },
			] },
			{ id: 'chart', role: 'data', layoutIntent: 'chart-left-insights-right', narration: { text: 'This chart shows the critical change.' }, content: [
				{ kind: 'title', name: 'chart-title', text: 'Evidence stays clear' },
				{ kind: 'chart-panel', name: 'chart-proof', chartType: 'bar', data: [{ name: 'Case', labels: ['Now', 'Next'], values: [52, 84] }], verified: true, evidenceSource: 'fixture', altText: 'Illustrative change' },
				{ kind: 'body', name: 'chart-reading', text: 'The explanation remains adjacent without entering the presenter lane.' },
			] },
			{ id: 'table', role: 'appendix', layoutIntent: 'dense-appendix', narration: { text: 'Review the release gates.' }, content: [
				{ kind: 'title', name: 'table-title', text: 'Release gates' },
				{ kind: 'table-panel', name: 'table-proof', rows: [['Gate', 'Evidence'], ['Power', 'Signed supply'], ['Demand', 'Contracted load']], altText: 'Release gates table' },
			] },
			{ id: 'process', role: 'body', layoutIntent: 'process-flow', narration: { text: 'First qualify, then build, finally scale.' }, content: [
				{ kind: 'title', name: 'process-title', text: 'A gated path to scale' },
				{ kind: 'smartart', name: 'process-proof', layout: 'process', nodes: [{ text: 'Qualify' }, { text: 'Build' }, { text: 'Scale' }], altText: 'Three-step gated process' },
			] },
		],
	}
	const expanded = expandPresenterDirective(source, {})
	const plan = planDeckLayout(expanded)
	const issues = validateLayoutPlan(plan).issues.filter(issue => issue.code === 'OBJECT_OVERLAP' && (issue.objects || issue.evidence?.objects || []).some(name => String(name).includes('presenter')))
	if (issues.length) fail('Presenter-aware intent matrix still overlaps the presenter lane.', { issues })
	for (const slide of plan.slides) {
		const presenter = slide.objects.find(item => item.blockName === 'presenter')
		if (!presenter) fail('Presenter-aware matrix lost the native presenter.', { slideId: slide.slideId })
		const escaped = slide.objects.filter(item => item !== presenter && item.role !== 'footer' && item.bleed !== true && item.rect.x + item.rect.w > presenter.rect.x - 0.20)
		if (escaped.length) fail('Semantic content escaped the safe lane before the presenter.', { slideId: slide.slideId, presenter: presenter.rect, escaped: escaped.map(item => ({ blockName: item.blockName, rect: item.rect })) })
		const proposal = recommendSlideLayouts(expanded).slides.find(item => item.slideId === slide.slideId)?.proposals.find(item => item.layoutIntent === slide.layoutIntent)
		for (const object of slide.objects.filter(item => item.blockName !== 'presenter')) {
			const proposed = proposal?.assignmentRects?.[object.blockName]
			if (!proposed) continue
			const contained = object.rect.x >= proposed.x - 0.04
				&& object.rect.y >= proposed.y - 0.04
				&& object.rect.x + object.rect.w <= proposed.x + proposed.w + 0.04
				&& object.rect.y + object.rect.h <= proposed.y + proposed.h + 0.04
			if (!contained) fail('Presenter-aware compiled geometry escaped its recommended semantic host.', { slideId: slide.slideId, blockName: object.blockName, proposed, compiled: object.rect })
		}
	}
}

function assertEngineProposalOwnershipReadback() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Engine proposal ownership',
		slides: [{ id: 'proposal', title: 'Engine proposal ownership', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Engine proposal ownership' },
			{ kind: 'textBox', name: 'copy', text: 'The client supplied meaning, not coordinates.' },
		] }],
	}
	const plan = planDeckLayout(spec)
	const objects = plan.slides[0].objects.filter(object => ['title', 'copy'].includes(object.blockName))
	if (objects.length !== 2 || objects.some(object => object.placementSource !== 'engine' || object.placementIntentSource !== 'engine-proposal')) {
		fail('Auto-placed semantic content was misclassified as author geometry in engine readback.', { objects })
	}
	if (objects.some(object => object.rect.w <= 0 || object.rect.h <= 0)) {
		fail('Auto-placed semantic content lost its engine proposal rectangle.', { objects })
	}
}

function assertBackingFrameOverlapExemption() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		styleIntent: { artDirection: 'blueprint' },
		title: 'Image frame',
		slides: [{ id: 'frame', title: 'Image frame', content: [
			{ kind: 'title', name: 'title', text: 'Image frame' },
			{ kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Proof image' },
		] }],
	}
	const plan = planDeckLayout(spec)
	const frameIssues = validateLayoutPlan(plan).issues.filter(issue => issue.code === 'OBJECT_OVERLAP')
	if (frameIssues.length) fail('Engine-owned image frame was reported as accidental overlap with its matching image.', { frameIssues })
	const imageBalance = planDeckLayout({ ...spec, slides: [{ ...spec.slides[0], id: 'frame-balance', layoutIntent: 'image-left-copy-right', content: [
		{ kind: 'title', name: 'title', text: 'Image frame' },
		{ kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Proof image' },
		{ kind: 'textBox', name: 'copy', text: 'The backing frame is not a second proof block.' },
	] }] }).slides[0].visualBalance
	if (imageBalance?.status !== 'balanced' || imageBalance?.regions?.left?.blockCount !== 1 || imageBalance?.regions?.left?.blocks?.join(',') !== 'proof') {
		fail('Intentional image backing frame was double-counted in semantic balance readback.', { imageBalance })
	}
	const unrelated = validateLayoutPlan({ slideSize: { w: 13.333, h: 7.5 }, slides: [{ slideId: 'unrelated', objects: [
		{ objectName: 'proof-frame', blockName: 'frame-a', role: 'image-frame', primitive: 'shape', rect: { x: 1, y: 1, w: 4, h: 3 } },
		{ objectName: 'proof-image', blockName: 'frame-b', role: 'image', primitive: 'image', rect: { x: 1, y: 1, w: 4, h: 3 } },
	] }] }).issues.find(issue => issue.code === 'OBJECT_OVERLAP')
	if (!unrelated || unrelated.severity !== 'warning') fail('Unrelated frame/image visual overlap was accidentally silenced.', { unrelated })
	const generatedNames = validateLayoutPlan({ slideSize: { w: 13.333, h: 7.5 }, slides: [{ slideId: 'generated-names', objects: [
		{ objectName: 'slide.proof.image-frame', role: 'image-frame', primitive: 'shape', rect: { x: 1, y: 1, w: 4, h: 3 } },
		{ objectName: 'slide.proof.image', role: 'image', primitive: 'image', rect: { x: 1, y: 1, w: 4, h: 3 } },
	] }] }).issues.filter(issue => issue.code === 'OBJECT_OVERLAP')
	if (generatedNames.length) fail('Generated semantic image names were not recognized as a matching backing-frame pair.', { generatedNames })
	const authoredIdentity = planDeckLayout({
		...spec,
		slides: [{
			...spec.slides[0],
			id: 'authored-picture',
			layoutIntent: 'image-focus',
			content: [
				{ kind: 'title', name: 'title', text: 'Picture passage' },
				{ kind: 'image-feature', name: 'picture', objectName: 'picture.scene', editHandle: 'picture-handle', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Picture' },
			],
		}],
	})
	const authoredObjects = authoredIdentity.slides[0].objects.filter(object => object.blockName === 'picture')
	if (authoredIdentity.warnings.some(item => item.code === 'UNKNOWN_LAYOUT_INTENT')) fail('The documented image-focus compatibility alias still falls through as an unknown layout intent.', { warnings: authoredIdentity.warnings })
	if (authoredObjects.length !== 2 || new Set(authoredObjects.map(object => object.objectName)).size !== authoredObjects.length || new Set(authoredObjects.map(object => object.editHandle)).size !== authoredObjects.length) {
		fail('An explicitly named picture did not receive a unique primary/frame carrier identity.', { authoredObjects })
	}
	const primary = authoredObjects.find(object => object.role === 'image')
	const frame = authoredObjects.find(object => object.role === 'image-frame')
	if (!primary || primary.objectName !== 'picture.scene' || primary.editHandle !== 'picture-handle' || !frame || frame.objectName !== 'picture.scene.image-frame') {
		fail('Explicit picture identity was not preserved on the primary native carrier or derived on its frame.', { authoredObjects })
	}
}

function assertThreeColumnSemanticPlacementAndCompactArrangementReadback() {
	const content = [
		{ kind: 'title', name: 'title', text: 'Three comparable ideas' },
		{ kind: 'textBox', name: 'one', text: 'First' },
		{ kind: 'textBox', name: 'two', text: 'Second' },
		{ kind: 'textBox', name: 'three', text: 'Third' },
	]
	const spec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Three columns', slides: [{ id: 'three', layoutIntent: 'three-column', content }] }
	const slide = planDeckLayout(spec).slides[0]
	const recommendation = recommendSlideLayouts(spec).slides[0]
	const currentProposal = recommendation.proposals.find(item => item.layoutIntent === 'three-column')
	if (!currentProposal || currentProposal.assignment?.one !== 'leftThird' || currentProposal.assignment?.two !== 'midThird' || currentProposal.assignment?.three !== 'rightThird') {
		fail('The recommender hid or misread the explicitly selected three-column intent.', { recommendation })
	}
	const items = slide.objects.filter(object => ['one', 'two', 'three'].includes(object.blockName))
	const xs = [...new Set(items.map(object => object.rect.x))].sort((a, b) => a - b)
	if (items.length !== 3 || xs.length !== 3 || slide.visualBalance?.status !== 'balanced' || slide.visualBalance?.arrangementApplied !== true) {
		fail('three-column semantic text content did not resolve into three engine-owned columns.', { items, balance: slide.visualBalance })
	}
	for (const [intent, extra] of [['hero', [{ kind: 'textBox', name: 'subtitle', text: 'Subtitle' }]], ['metric-grid', [
		{ kind: 'stat', name: 'metric-1', value: '1', label: 'One', verified: true, evidenceSource: 'fixture', altText: 'One' },
		{ kind: 'stat', name: 'metric-2', value: '2', label: 'Two', verified: true, evidenceSource: 'fixture', altText: 'Two' },
	]]]) {
		const compact = planDeckLayout({ schemaVersion: 'betterpptx.deck-spec.v1', title: intent, slides: [{ id: intent, layoutIntent: intent, arrange: { split: [60, 40] }, content: [{ kind: 'title', name: 'title', text: intent }, ...extra] }] }).slides[0].visualBalance
		if (compact?.status === 'review' || compact?.arrangementApplied === true) fail(`Irrelevant arrange split produced a false ${intent} balance review.`, { compact })
	}
}

function assertAutoPlacementUsesWorldMargin() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		styleIntent: { artDirection: 'blueprint' },
		title: 'World margin',
		slides: [{ id: 'margin', title: 'World margin', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'World margin' },
			{ kind: 'textBox', name: 'copy', text: 'Auto-flow must honor the shared composition contract.' },
		] }],
	}
	const expected = artCompositionForSpec(spec).margin
	const plan = planDeckLayout(spec)
	const objects = plan.slides[0].objects.filter(object => ['title', 'copy'].includes(object.blockName))
	if (objects.length !== 2 || objects.some(object => object.rect.x !== expected)) {
		fail('Auto-flow ignored the selected World composition margin.', { expected, objects })
	}
}

function assertRecommendationGeometryOwnershipParity() {
	for (const [label, geometry] of [
		['options', { options: { x: 2, y: 2, w: 4, h: 1 } }],
		['top-level', { x: 2, y: 2, w: 4, h: 1 }],
	]) {
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: `Recommendation ${label}`,
			slides: [{ id: 'parity', title: 'Recommendation parity', layoutIntent: 'title-body', content: [
				{ kind: 'title', name: 'title', text: 'Recommendation parity' },
				{ kind: 'textBox', name: 'copy', text: 'Maintainer geometry must have truthful readback.', ...geometry },
			] }],
		}
		const proposal = recommendSlideLayouts(spec).slides[0].proposals.find(item => item.layoutIntent === 'title-body')
		const compiled = planDeckLayout(spec).slides[0].objects.find(object => object.blockName === 'copy')
		if (proposal?.assignment?.copy !== 'explicit-rect' || compiled?.placementSource !== 'author' || compiled?.placementIntentSource !== 'author-geometry') {
			fail(`Recommendation/compiler geometry ownership diverged for ${label}.`, { proposal, compiled })
		}
	}
}

function assertSemanticIntentArrangementParity() {
	const chart = { kind: 'chart-panel', name: 'chart', chartType: 'bar', data: [{ name: 'case', labels: ['Now', 'Next'], values: [1, 2] }], verified: true, evidenceSource: 'fixture', altText: 'Case trend' }
	const insight = { kind: 'textBox', name: 'insight', text: 'The semantic reading belongs beside the proof.' }
	for (const [label, content] of [
		['proof-first', [{ kind: 'title', name: 'title', text: 'Trend' }, chart, insight]],
		['copy-first', [{ kind: 'title', name: 'title', text: 'Trend' }, insight, chart]],
	]) {
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: `Semantic intent ${label}`,
			slides: [{ id: `chart-${label}`, layoutIntent: 'chart-left-insights-right', arrange: { split: [60, 40] }, content }],
		}
		const proposal = recommendSlideLayouts(spec).slides[0].proposals.find(item => item.layoutIntent === 'chart-left-insights-right')
		const slide = planDeckLayout(spec).slides[0]
		const objects = Object.fromEntries(slide.objects.filter(object => ['chart', 'insight'].includes(object.blockName)).map(object => [object.blockName, object]))
		const closeRect = (a, b) => ['x', 'y', 'w', 'h'].every(key => Math.abs(Number(a?.[key] || 0) - Number(b?.[key] || 0)) < 0.002)
		if (proposal?.assignment?.chart !== 'left' || proposal?.assignment?.insight !== 'right' || !closeRect(objects.chart?.rect, slide.regions.left) || !closeRect(objects.insight?.rect, slide.regions.right)) {
			fail(`Semantic split intent and weighted arrangement diverged for ${label}.`, { proposal, regions: { left: slide.regions.left, right: slide.regions.right }, objects, balance: slide.visualBalance })
		}
		if (slide.visualBalance?.status !== 'balanced' || slide.visualBalance?.regions?.left?.blocks?.join(',') !== 'chart' || slide.visualBalance?.regions?.right?.blocks?.join(',') !== 'insight') {
			fail(`Semantic balance readback did not follow the resolved split for ${label}.`, { balance: slide.visualBalance })
		}
	}
	for (const [intent, expectedCopyRegion] of [['image-left-copy-right', 'right'], ['copy-left-image-right', 'left']]) {
		const proof = { kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Proof' }
		const content = intent === 'image-left-copy-right'
			? [{ kind: 'title', name: 'title', text: 'Proof' }, proof, { kind: 'textBox', name: 'copy', text: 'Explanation' }]
			: [{ kind: 'title', name: 'title', text: 'Proof' }, { kind: 'textBox', name: 'copy', text: 'Explanation' }, proof]
		const spec = { schemaVersion: 'betterpptx.deck-spec.v1', slides: [{ id: intent, layoutIntent: intent, content }] }
		const proposal = recommendSlideLayouts(spec).slides[0].proposals.find(item => item.layoutIntent === intent)
		if (proposal?.assignment?.copy !== expectedCopyRegion || !proposal?.regions?.[expectedCopyRegion] || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(Number(proposal.regions[expectedCopyRegion][key])))) {
			fail(`Recommendation assignment did not join to a named region for ${intent}.`, { proposal })
		}
	}
}

function assertProposalAssignmentGeometryReadback() {
	const title = { kind: 'title', name: 'title', text: 'Readback geometry' }
	const text = (name, value) => ({ kind: 'textBox', name, text: value })
	const cases = {
		'title-only': [title],
		'title-body': [title, text('copy', 'A concise explanation.')],
		'title-body-footer': [title, text('copy', 'A concise explanation.')],
		'two-column': [title, { kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Proof' }, text('copy', 'Explanation.'), { kind: 'callout', name: 'callout', text: 'Context.' }],
		'three-column': [title, text('one', 'One.'), text('two', 'Two.'), text('three', 'Three.')],
		'chart-left-insights-right': [title, { kind: 'chart-panel', name: 'chart', chartType: 'bar', data: [{ name: 'case', labels: ['Now'], values: [1] }] }, text('insight', 'Chart reading.')],
		'insights-left-chart-right': [title, text('insight', 'Chart reading.'), { kind: 'chart-panel', name: 'chart', chartType: 'bar', data: [{ name: 'case', labels: ['Now'], values: [1] }] }],
		'metric-grid': [title, ...Array.from({ length: 4 }, (_, index) => ({ kind: 'stat', name: `metric-${index + 1}`, value: String(index + 1), label: `Metric ${index + 1}` }))],
		'comparison': [title, text('left', 'Left side.'), text('right', 'Right side.')],
		'timeline': [title, text('step-1', 'One.'), text('step-2', 'Two.'), text('step-3', 'Three.')],
		'process-flow': [title, { kind: 'smartart', name: 'flow', layout: 'process', nodes: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }] }],
		'image-left-copy-right': [title, { kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Proof' }, text('copy', 'Image reading.')],
		'copy-left-image-right': [title, text('copy', 'Image reading.'), { kind: 'image-feature', name: 'proof', image: 'data:image/png;base64,iVBORw0KGgo=', altText: 'Proof' }],
		'section-divider': [title, { kind: 'quote', name: 'quote', text: 'A section.' }],
		'dense-appendix': [title, text('copy-1', 'One.'), text('copy-2', 'Two.'), text('copy-3', 'Three.')],
		'hero': [title, text('copy', 'A clear hero statement.')],
		'pull-quote': [title, { kind: 'quote', name: 'quote', text: 'A clear quote.' }],
		'sidebar-left': [title, { kind: 'stat', name: 'stat', value: '42', label: 'Signal' }, text('copy', 'Main explanation.')],
		'sidebar-right': [title, { kind: 'stat', name: 'stat', value: '42', label: 'Signal' }, text('copy', 'Main explanation.')],
	}
	for (const [intent, originalContent] of Object.entries(cases)) {
		for (const [label, content] of [['original', originalContent], ['reversed', [originalContent[0], ...originalContent.slice(1).reverse()]]]) {
			const spec = { schemaVersion: 'betterpptx.deck-spec.v1', slides: [{ id: `${intent}-${label}`, layoutIntent: intent, content }] }
			const proposal = recommendSlideLayouts(spec).slides[0].proposals.find(item => item.layoutIntent === intent)
			const assignments = proposal?.assignment || {}
			const rects = proposal?.assignmentRects || {}
			const missing = Object.entries(assignments).filter(([name, region]) => region !== 'explicit-rect' && !rects[name])
			const malformed = Object.entries(rects).filter(([, rect]) => !['x', 'y', 'w', 'h'].every(key => Number.isFinite(Number(rect?.[key]))) || rect.w <= 0 || rect.h <= 0)
			if (!proposal || missing.length || malformed.length) fail(`Proposal assignment geometry readback is incomplete for ${intent}/${label}.`, { proposal, missing, malformed })
			const compiled = planDeckLayout(spec).slides[0].objects
			const outsideProposalHost = Object.entries(rects).filter(([name, host]) => {
				const object = compiled.find(item => item.blockName === name)
				if (!object?.rect) return false
				const r = object.rect
				return r.x < host.x - 0.01 || r.y < host.y - 0.01 || r.x + r.w > host.x + host.w + 0.01 || r.y + r.h > host.y + host.h + 0.01
			})
			if (outsideProposalHost.length) fail(`Compiled object escaped its proposal host for ${intent}/${label}.`, { proposal, outsideProposalHost, compiled })
			const mismatchedCompiled = Object.entries(rects).filter(([name, rect]) => {
				const object = compiled.find(item => item.blockName === name)
				return object && !['x', 'y', 'w', 'h'].every(key => Math.abs(Number(rect[key]) - Number(object.rect?.[key])) < 0.002)
			})
			if (['sidebar-left', 'sidebar-right', 'comparison'].includes(intent) && mismatchedCompiled.length) fail(`Semantic proposal diverged from compiled geometry for ${intent}/${label}.`, { proposal, mismatchedCompiled, compiled })
			if (intent === 'comparison' && (proposal.assignment?.left !== 'left' || proposal.assignment?.right !== 'right')) fail(`Comparison semantic sides did not retain left/right affinity for ${label}.`, { proposal })
			if (intent === 'metric-grid') {
				const metricRects = Object.entries(rects).filter(([name]) => name.startsWith('metric-')).map(([, rect]) => rect)
				if (metricRects.length !== 4 || metricRects.some((rect, index) => metricRects.slice(index + 1).some(other => Math.abs(rect.x - other.x) < 0.001 && Math.abs(rect.y - other.y) < 0.001))) fail(`Metric-card readback did not expose distinct engine slots for ${label}.`, { proposal })
			}
		}
	}
	const comparisonDisclosure = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		slides: [{ id: 'comparison-disclosure', layoutIntent: 'comparison', content: [
			{ kind: 'table-panel', name: 'inventory-table', data: [{ label: 'Signal', value: 1 }], altText: 'Inventory' },
			{ kind: 'callout', name: 'unsupported-callout', text: 'Unsupported details remain disclosed.' },
		] }],
	}
	const disclosureProposal = recommendSlideLayouts(comparisonDisclosure).slides[0].proposals.find(item => item.layoutIntent === 'comparison')
	const disclosurePlan = planDeckLayout(comparisonDisclosure).slides[0]
	const disclosureParity = ['inventory-table', 'unsupported-callout'].every(name => {
		const a = disclosureProposal?.assignmentRects?.[name]
		const b = disclosurePlan.objects.find(object => object.blockName === name)?.rect
		return a && b && ['x', 'y', 'w', 'h'].every(key => Math.abs(Number(a[key]) - Number(b[key])) < 0.002)
	})
	if (!disclosureParity || disclosureProposal?.assignment?.['inventory-table'] !== 'left' || disclosureProposal?.assignment?.['unsupported-callout'] !== 'right') fail('Comparison disclosure proof did not preserve two-sided engine geometry.', { proposal: disclosureProposal, objects: disclosurePlan.objects })
	const sidebarCalloutSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		slides: [{ id: 'sidebar-callout', layoutIntent: 'sidebar-left', content: [
			{ kind: 'callout', name: 'rail-callout', text: 'Compact context belongs in the rail.' },
			{ kind: 'text', name: 'main-explanation', text: 'The main explanation remains in the wide semantic host.' },
		] }],
	}
	const sidebarCalloutProposal = recommendSlideLayouts(sidebarCalloutSpec).slides[0].proposals.find(item => item.layoutIntent === 'sidebar-left')
	const sidebarCalloutPlan = planDeckLayout(sidebarCalloutSpec).slides[0]
	const sidebarCalloutObjects = Object.fromEntries(sidebarCalloutPlan.objects.map(object => [object.blockName, object]))
	const sidebarCalloutParity = ['rail-callout', 'main-explanation'].every(name => {
		const a = sidebarCalloutProposal?.assignmentRects?.[name]
		const b = sidebarCalloutObjects[name]?.rect
		return a && b && ['x', 'y', 'w', 'h'].every(key => Math.abs(Number(a[key]) - Number(b[key])) < 0.002)
	})
	const rail = sidebarCalloutObjects['rail-callout']?.rect
	const main = sidebarCalloutObjects['main-explanation']?.rect
	const expectedRailY = sidebarCalloutPlan.regions.sidebar.y + (sidebarCalloutPlan.regions.sidebar.h - 3) / 2
	if (!sidebarCalloutParity || sidebarCalloutProposal?.assignment?.['rail-callout'] !== 'sidebar' || sidebarCalloutProposal?.assignment?.['main-explanation'] !== 'main' || !rail || !main || rail.w >= main.w || rail.x >= main.x || rail.h > 3.001 || Math.abs(rail.y - expectedRailY) > 0.002) fail('Sidebar callout did not retain narrow-rail/main semantic geometry and compact rhythm.', { proposal: sidebarCalloutProposal, objects: sidebarCalloutPlan.objects, expectedRailY })
	const specialRegionCases = [
		{ intent: 'title-only', content: [{ kind: 'title', name: 'title', text: 'Statement' }], block: 'title', region: 'title' },
		{ intent: 'section-divider', content: [{ kind: 'title', name: 'title', text: 'Section' }, { kind: 'quote', name: 'quote', text: 'Transition' }], block: 'quote', region: 'body' },
		{ intent: 'pull-quote', content: [{ kind: 'quote', name: 'quote', text: 'A memorable claim.' }], block: 'quote', region: 'body' },
	]
	for (const item of specialRegionCases) {
		const specialSpec = { schemaVersion: 'betterpptx.deck-spec.v1', slides: [{ id: item.intent, layoutIntent: item.intent, content: item.content }] }
		const specialProposal = recommendSlideLayouts(specialSpec).slides[0].proposals.find(candidate => candidate.layoutIntent === item.intent)
		const specialPlan = planDeckLayout(specialSpec).slides[0]
		const proposalRect = specialProposal?.assignmentRects?.[item.block]
		const compiledRect = specialPlan.objects.find(object => object.blockName === item.block)?.rect
		const regionRect = specialPlan.regions[item.region]
		const matches = [proposalRect, compiledRect, regionRect].every(Boolean) && ['x', 'y', 'w', 'h'].every(key => Math.abs(Number(proposalRect[key]) - Number(compiledRect[key])) < 0.002 && Math.abs(Number(compiledRect[key]) - Number(regionRect[key])) < 0.002)
		if (!matches) fail(`Specialized ${item.intent} did not use its engine-owned ${item.region} region.`, { proposal: specialProposal, regions: specialPlan.regions, objects: specialPlan.objects })
	}
}

function assertEmptyGeometryShapeReadback() {
	const base = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Shape treatment',
		slides: [{ id: 'shape-treatment', title: 'Shape treatment', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Shape treatment' },
			{ kind: 'shape', name: 'blank-panel', shapeName: 'roundRect' },
		] }],
	}
	const blank = planDeckLayout(base)
	const warning = blank.warnings.find(item => item.code === 'EMPTY_GEOMETRY_SHAPE')
	if (!warning || warning.severity !== 'warning' || !warning.reason || !warning.fix || !warning.evidence) fail('Untreated geometry-only shape did not produce actionable empty-shape readback.', { warnings: blank.warnings })
	const treated = planDeckLayout({ ...base, slides: [{ ...base.slides[0], content: [
			{ kind: 'title', name: 'title', text: 'Shape treatment' },
			{ kind: 'shape', name: 'styled-panel', shapeName: 'roundRect', style: { fill: '112233', line: '22D3EE' } },
		] }] })
	if (treated.warnings.some(item => item.code === 'EMPTY_GEOMETRY_SHAPE')) fail('Styled geometry-only shape produced a false empty-shape warning.', { warnings: treated.warnings })
	const expanded = planDeckLayout({ ...base, slides: [{ ...base.slides[0], id: 'expanded-card', content: [
			{ kind: 'title', name: 'title', text: 'Expanded card' },
			{ kind: 'textShape', name: 'short-card', text: 'Short proof', rect: { x: 2, y: 2, w: 4, h: 4 } },
		] }] })
	const expandedWarning = expanded.warnings.find(item => item.code === 'LAYOUT_TEXTSHAPE_OVEREXPANDED')
	if (!expandedWarning || expandedWarning.severity !== 'warning' || expandedWarning.evidence?.textCharacters !== 11 || !expandedWarning.reason || !expandedWarning.fix) fail('Over-expanded explicit textShape did not produce actionable density readback.', { warnings: expanded.warnings })
	const intentional = planDeckLayout({ ...base, slides: [{ ...base.slides[0], id: 'intentional-card', content: [
			{ kind: 'title', name: 'title', text: 'Intentional card' },
			{ kind: 'textShape', name: 'quiet-card', text: 'Quiet space', rect: { x: 2, y: 2, w: 4, h: 4 }, keep: true },
		] }] })
	if (intentional.warnings.some(item => item.code === 'LAYOUT_TEXTSHAPE_OVEREXPANDED')) fail('Intentional kept quiet-space textShape produced a false over-expanded warning.', { warnings: intentional.warnings })
}

function assertNamedCalloutCardReadback() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Named callout card',
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		slides: [{ id: 'callout-card', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'A compact semantic callout' },
			{ kind: 'body', name: 'body', text: 'The body remains the explanation.' },
			{ kind: 'callout', name: 'callout', text: 'One clear decision.', region: 'rightThird' },
		] }],
	}
	const plan = planDeckLayout(spec)
	const object = plan.slides[0].objects.find(item => item.blockName === 'callout')
	const body = plan.slides[0].objects.find(item => item.blockName === 'body')
	if (!object || !body || object.rect.h >= 2 || object.rect.h <= 0 || object.rect.y <= plan.slides[0].regions.body.y || object.rect.y + object.rect.h >= plan.slides[0].regions.body.y + plan.slides[0].regions.body.h || object.style?.align !== 'center' || object.style?.valign !== 'mid' || body.rect.x + body.rect.w > object.rect.x - 0.1) {
		fail('Named semantic callout did not resolve to a compact centered card with a safe copy lane.', { object, body, regions: plan.slides[0].regions })
	}
}

function assertGenericCalloutBandReadback() {
	for (const layoutIntent of ['title-body', 'dense-appendix']) {
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Generic callout band',
			styleIntent: { artDirection: 'candy', mode: 'light' },
			slides: [{ id: `callout-band-${layoutIntent}`, layoutIntent, content: [
				{ kind: 'title', name: 'title', text: 'A semantic callout should stay compact' },
				layoutIntent === 'dense-appendix'
					? { kind: 'table-panel', name: 'body', header: ['Proof'], rows: [['Evidence']] }
					: { kind: 'body', name: 'body', text: 'The explanatory body remains readable above the accent.' },
				{ kind: 'callout', name: 'callout', text: 'Different rules · selective advantage' },
			] }],
		}
		const plan = planDeckLayout(spec)
		const slide = plan.slides[0]
		const object = slide.objects.find(item => item.blockName === 'callout')
		const body = slide.objects.find(item => item.blockName === 'body')
		const bodyRegion = slide.regions.body
		if (!object || !body || object.rect.w >= bodyRegion.w - 0.2 || object.rect.h > 1.1 || object.rect.y <= body.rect.y + body.rect.h || object.rect.y + object.rect.h > bodyRegion.y + bodyRegion.h + 0.01) {
			fail(`Generic semantic callout did not resolve to a compact centered bottom band for ${layoutIntent}.`, { object, body, bodyRegion })
		}
	}
}

function assertHeroTitleRespectsPinnedCallout() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Hero title and callout safety',
		slides: [{ id: 'hero-safe', title: 'Hero', layoutIntent: 'hero', content: [
			{ kind: 'title', name: 'hero-title', text: 'A deliberately long hero statement that must keep clear of the side callout' },
			{ kind: 'callout', name: 'hero-callout', text: 'One bounded next step.', region: 'rightThird' },
		] }],
	}
	const slide = planDeckLayout(spec).slides[0]
	const title = slide.objects.find(item => item.blockName === 'hero-title')
	const callout = slide.objects.find(item => item.blockName === 'hero-callout')
	if (!title || !callout || title.rect.x + title.rect.w > callout.rect.x - 0.12) {
		fail('Hero title did not reserve the pinned callout lane.', { title, callout, regions: slide.regions })
	}
	const visualSpec = {
		...spec,
		title: 'Hero visual and side callout safety',
		slides: [{ id: 'hero-visual-safe', title: 'Hero visual', layoutIntent: 'hero', content: [
			{ kind: 'title', name: 'hero-visual-title', text: 'Build the next cell as a learning loop' },
			{ kind: 'callout', name: 'hero-visual-callout', text: 'One cell · one constraint · one owner', region: 'leftThird' },
			{ kind: 'model3d', name: 'hero-visual-model', query: 'industrial robotic arm manufacturing automation', intent: 'automation', altText: 'Native 3D industrial robotic arm.' },
		] }],
	}
	const visualPlan = planDeckLayout(visualSpec)
	const visualSlide = visualPlan.slides[0]
	const visual = visualSlide.objects.find(item => item.blockName === 'hero-visual-model')
	const sideCallout = visualSlide.objects.find(item => item.blockName === 'hero-visual-callout')
	const overlap = validateLayoutPlan(visualPlan).issues.find(issue => issue.code === 'OBJECT_OVERLAP')
	if (!visual || !sideCallout || overlap || visual.rect.x < sideCallout.rect.x + sideCallout.rect.w - 0.02) {
		fail('Visual hero did not reserve the semantic side-callout lane.', { visual, sideCallout, overlap, regions: visualSlide.regions })
	}
}

function assertSemanticDecorativeShapeReadback() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Semantic accent rule',
		slides: [{ id: 'accent', title: 'Accent rule', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Accent rule' },
			{ kind: 'shape', name: 'rule', shapeName: 'rect', region: 'left', decorative: true, visualIntent: { purpose: 'accent-rule', orientation: 'vertical', edge: 'start' }, style: { fill: '0284C7', line: '0284C7' } },
			{ kind: 'textBox', name: 'copy', text: 'The engine should keep the accent narrow and the copy readable.', region: 'left' },
			{ kind: 'textShape', name: 'chip', text: 'Surface proof', region: 'right' },
		] }],
	}
	const plan = planDeckLayout(spec)
	const rule = plan.slides[0].objects.find(object => object.blockName === 'rule')
	const copy = plan.slides[0].objects.find(object => object.blockName === 'copy')
	if (!rule || !copy || rule.rect.w > 0.2 || rule.rect.h < 2 || rule.rect.x >= copy.rect.x) {
		fail('Semantic accent rule did not resolve to a narrow engine-owned rail outside the copy start.', { rule, copy })
	}
	if (plan.warnings.some(item => item.code === 'OBJECT_OVERLAP')) fail('Semantic accent rule produced an object overlap warning.', { warnings: plan.warnings })
}

function assertMetricGridDensityReadback() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Metric density',
		slides: [{ id: 'metrics', title: 'Metric density', layoutIntent: 'metric-grid', content: [
			{ kind: 'title', name: 'title', text: 'Metric density' },
			{ kind: 'metric-grid', name: 'grid', items: [
				{ name: 'one', label: 'One', value: 'fast' },
				{ name: 'two', label: 'Two', value: 'trusted' },
				{ name: 'three', label: 'Three', value: 'auditable' },
			] },
		] }],
	}
	const plan = planDeckLayout(spec)
	const cards = plan.slides[0].objects.filter(object => object.role === 'metric-card')
	if (cards.length !== 3 || cards.some(card => card.rect.h > 3 || card.rect.w <= 0 || card.rect.h <= 0)) fail('Metric grid did not resolve to compact positive cards.', { cards })
	if (cards.some(card => !Array.isArray(card.text) || card.fit?.overflow)) fail('Metric grid did not retain readable rich-text hierarchy inside its compact cards.', { cards })
	const firstCard = cards.find(card => card.itemName === 'one')
	const firstLabel = firstCard?.text?.find(run => run.text === 'One')
	const firstValue = firstCard?.text?.find(run => run.text === 'fast')
	if (!firstLabel || !firstValue || firstLabel.options?.breakLine !== true || Number(firstValue.options?.fontSize) <= Number(firstLabel.options?.fontSize)) {
		fail('Metric-grid label and value did not compile into explicit label/value hierarchy.', { firstCard })
	}
	const descriptiveSpec = {
		...spec,
		title: 'Metric descriptions',
		slides: [{ ...spec.slides[0], id: 'metric-descriptions', content: [
			{ kind: 'title', name: 'title', text: 'Metric descriptions' },
			{ kind: 'metric-grid', name: 'grid', items: [
				{ name: 'heat', label: 'Heat', text: 'More intense hot days' },
				{ name: 'water', label: 'Water', text: 'Heavier downpours' },
				{ name: 'seasons', label: 'Seasons', text: 'Timing shifts' },
				{ name: 'life', label: 'Living systems', text: 'Habitats feel pressure' },
			] },
		] }],
	}
	const descriptivePlan = planDeckLayout(descriptiveSpec)
	const descriptiveCards = descriptivePlan.slides[0].objects.filter(object => object.role === 'metric-card')
	const visibleMetricText = card => Array.isArray(card.text) ? card.text.map(run => run?.text || '').join(' ') : String(card.text || '')
	if (descriptiveCards.length !== 4 || descriptiveCards.some(card => !visibleMetricText(card).includes('More intense') && card.itemName === 'heat')) {
		fail('Metric-grid descriptive item text was dropped from the rendered card.', { descriptiveCards })
	}
	if (descriptiveCards.some(card => !Array.isArray(card.text) || card.fit?.overflow || card.text.some(run => Number(run.options?.fontSize) < 12))) {
		fail('Metric-grid descriptive hierarchy fell below the data-label floor or overflowed.', { descriptiveCards })
	}
	const yValues = new Set(descriptiveCards.map(card => Number(card.rect.y.toFixed(3))))
	if (yValues.size !== 1) fail('Four metric signals were not balanced into one semantic row.', { descriptiveCards })
}

function assertCompactFamilyBalanceReadback() {
	const processSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Process balance',
		slides: [{ id: 'process', title: 'Process balance', layoutIntent: 'process-flow', content: [
			{ kind: 'title', name: 'title', text: 'Process balance' },
			{ kind: 'process', name: 'steps', items: [
				{ name: 'one', label: 'One', text: 'First step' },
				{ name: 'two', label: 'Two', text: 'Second step' },
				{ name: 'three', label: 'Three', text: 'Third step' },
			] },
		] }],
	}
	const processPlan = planDeckLayout(processSpec)
	const steps = processPlan.slides[0].objects.filter(object => object.role === 'step')
	if (steps.length !== 3 || steps.some(step => step.rect.y < 2.5 || step.rect.h > 2)) fail('Process family was not vertically balanced inside its semantic body region.', { steps })
	const fourStepSpec = JSON.parse(JSON.stringify(processSpec))
	fourStepSpec.slides[0].content.find(block => block.kind === 'process').items.push({ name: 'four', label: 'Four', text: 'Fourth step' })
	const fourStepPlan = planDeckLayout(fourStepSpec)
	const fourSteps = fourStepPlan.slides[0].objects.filter(object => object.role === 'step')
	if (fourSteps.length !== 4 || new Set(fourSteps.map(step => Number(step.rect.y.toFixed(3)))).size !== 1 || fourSteps.some(step => step.rect.w <= 0 || step.rect.h <= 0)) fail('Four-step process family did not resolve to one balanced semantic row.', { fourSteps })
	const processProofWarning = processPlan.warnings.find(item => item.code === 'UNVERIFIED_DATA')
	if (!processProofWarning || !processProofWarning.reason || !processProofWarning.fix || processProofWarning.evidence?.evidenceSourcePresent !== false || processProofWarning.evidence?.kind !== 'process' || processProofWarning.evidence?.itemCount !== 0) fail('Unverified process items did not produce structured data-proof evidence.', { warnings: processPlan.warnings })
	const verifiedProcessSpec = JSON.parse(JSON.stringify(processSpec))
	for (const item of verifiedProcessSpec.slides[0].content.find(block => block.kind === 'process').items) {
		item.provenance = 'verification-fixture'
		item.verified = true
	}
	const verifiedProcessPlan = planDeckLayout(verifiedProcessSpec)
	if (verifiedProcessPlan.warnings.some(item => item.code === 'UNVERIFIED_DATA')) fail('Verified process item proof was not propagated to generated children.', { warnings: verifiedProcessPlan.warnings })
	const comparisonSpec = {
		...processSpec,
		title: 'Comparison balance',
		slides: [{ id: 'comparison', title: 'Comparison balance', layoutIntent: 'comparison', content: [
			{ kind: 'title', name: 'title', text: 'Comparison balance' },
			{ kind: 'comparison', name: 'compare', items: [{ name: 'left', label: 'Left', text: 'Left evidence' }, { name: 'right', label: 'Right', text: 'Right evidence' }] },
		] }],
	}
	const comparisonPlan = planDeckLayout(comparisonSpec)
	const panels = comparisonPlan.slides[0].objects.filter(object => object.role === 'comparison-panel')
	if (panels.length !== 2 || panels.some(panel => panel.rect.y < 2.5 || panel.rect.h > 2.6)) fail('Comparison family was not vertically balanced inside its semantic body region.', { panels })
	if (!String(panels[0]?.text || '').includes('Left') || !String(panels[1]?.text || '').includes('Right')) fail('Comparison semantic labels were dropped during compilation.', { panels })
}

function assertDiagramModePolicy() {
	const base = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Diagram mode policy',
		slides: [{ id: 'diagram', title: 'Diagram', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Diagram' },
			{ kind: 'diagram', name: 'explainer', nodes: [{ text: 'One' }, { text: 'Two' }] },
		] }],
	}
	const nativePlan = planDeckLayout(base)
	const nativeObject = nativePlan.slides[0].objects.find(object => object.blockName === 'explainer')
	if (!nativeObject || nativeObject.mode !== 'native') fail('Semantic diagram did not default to editable native SmartArt.', { nativeObject })
	const customSpec = structuredClone(base)
	customSpec.slides[0].content[1].mode = 'shape'
	customSpec.slides[0].content[1].customReason = 'A free-form topology is required and no native SmartArt layout preserves the intended relationship.'
	const customPlan = planDeckLayout(customSpec)
	const customObject = customPlan.slides[0].objects.find(object => object.blockName === 'explainer')
	if (!customObject || customObject.mode !== 'shape') fail('Explicit justified custom diagram intent was not preserved.', { customObject })
}

function assertDataProofFamilies() {
	const families = [
		{ kind: 'chart-panel', name: 'chart', chartType: 'bar', data: [{ name: 'Series', labels: ['A'], values: [1] }] },
		{ kind: 'table-panel', name: 'table', rows: [[{ text: 'Metric' }], [{ text: '1' }]] },
		{ kind: 'stat', name: 'stat', value: '1', label: 'verified metric' },
		{ kind: 'kpi', name: 'kpi', value: '1', label: 'verified KPI' },
		{ kind: 'smartart', name: 'smartart', nodes: [{ text: 'One' }] },
		{ kind: 'diagram', name: 'diagram', nodes: [{ text: 'One' }] },
		{ kind: 'metric-grid', name: 'metrics', items: [{ name: 'one', label: 'One', value: '1' }] },
		{ kind: 'timeline', name: 'timeline', items: [{ name: 'one', label: 'One', text: 'First' }] },
		{ kind: 'process', name: 'process', items: [{ name: 'one', label: 'One', text: 'First' }] },
	]
	for (const family of families) {
		const base = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: `Proof ${family.kind}`,
			slides: [{ id: 'proof', title: 'Proof', layoutIntent: 'title-body', content: [{ kind: 'title', name: 'title', text: 'Proof' }, family] }],
		}
		const unverified = planDeckLayout(base)
		const proofWarning = unverified.warnings.find(item => item.code === 'UNVERIFIED_DATA')
		if (!proofWarning || !proofWarning.reason || !proofWarning.fix || !proofWarning.evidence) fail(`Unverified ${family.kind} did not produce structured data-proof evidence.`, { warnings: unverified.warnings })
		const verified = structuredClone(base)
		const block = verified.slides[0].content[1]
		if (Array.isArray(block.items) && block.items.length > 0) {
			for (const item of block.items) { item.verified = true; item.evidenceSource = 'verification-fixture' }
		} else {
			block.verified = true
			block.evidenceSource = 'verification-fixture'
		}
		const verifiedPlan = planDeckLayout(verified)
		if (verifiedPlan.warnings.some(item => item.code === 'UNVERIFIED_DATA')) fail(`Verified ${family.kind} retained a data-proof warning.`, { warnings: verifiedPlan.warnings })
	}
}

function assertUndocumentedProofCannotBypassGate() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Proof bypass',
		slides: [{ id: 'proof', title: 'Proof', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Proof' },
			{ kind: 'stat', name: 'stat', value: '1', label: 'undocumented proof', verified: true, claimBasis: 'legacy field' },
		] }],
	}
	const plan = planDeckLayout(spec)
	if (!plan.warnings.some(item => item.code === 'UNVERIFIED_DATA')) fail('Undocumented claimBasis bypassed the semantic data-proof gate.', { warnings: plan.warnings })
}

function assertCommittedTextShapeDensityReadback() {
	// Materialized textShape cards are represented by the PowerPoint object model
	// as text objects with an explicit options.shape. Exercise that post-commit
	// form directly so validation cannot regress to compiler-only coverage.
	const entry = { pptx: { slides: [{ _slideObjects: [
		{ _type: 'text', text: [{ text: 'Short proof' }], options: { x: 1, y: 1, w: 4, h: 4, shape: 'roundRect', objectName: 'density-card' } },
		{ _type: 'text', text: [{ text: 'Intentional quiet space' }], options: { x: 7, y: 1, w: 4, h: 4, shape: 'roundRect', keep: true, objectName: 'quiet-card' } },
	] }] } }
	const issues = collectCompositionIssues(entry)
	const finding = issues.find(item => item.code === 'LAYOUT_TEXTSHAPE_OVEREXPANDED' && item.objectName === 'density-card')
	if (!finding || finding.evidence?.textCharacters !== 11 || !finding.reason || !finding.fix) fail('Committed textShape density readback is incomplete.', { issues })
	if (issues.some(item => item.code === 'LAYOUT_TEXTSHAPE_OVEREXPANDED' && item.objectName === 'quiet-card')) fail('Intentional quiet textShape was flagged.', { issues })
}

async function assertColdSeedProofAliasLayout() {
	const fixturePath = path.join(__dirname, '..', 'tools', 'fixtures', 'authoring-excellence-cold-seed-pitch', 'spec.json')
	const spec = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
	const plan = planDeckLayout(spec)
	const slide = plan.slides.find(item => item.slideId === 'seed-problem-proof')
	if (!slide || slide.layoutIntent !== 'comparison') fail('Cold seed proof alias did not resolve to the governed comparison intent.', { slide: slide && { layoutIntent: slide.layoutIntent }, warnings: plan.warnings })
	const blockingCodes = new Set(['UNKNOWN_LAYOUT_INTENT', 'UNKNOWN_REGION', 'OBJECT_OVERLAP'])
	const blocking = plan.warnings.filter(item => blockingCodes.has(item.code))
	if (blocking.length) fail('Cold seed proof alias still degraded into an unsafe layout.', { blocking, warnings: plan.warnings })
	if (!plan.warnings.some(item => item.code === 'LAYOUT_INTENT_ALIAS_NORMALIZED')) fail('Cold seed proof alias normalization was not surfaced to the AI readback.', { warnings: plan.warnings })
	const cards = slide.objects.filter(object => object.blockName === 'proof-points')
	const right = slide.regions.rightTwoThirds
	if (cards.length !== 3 || !right || cards.some(card => card.rect.x < right.x - 0.01 || card.rect.x + card.rect.w > right.x + right.w + 0.01 || card.rect.y < right.y - 0.01 || card.rect.y + card.rect.h > right.y + right.h + 0.01)) {
		fail('Cold seed proof cards did not stay inside the engine-owned right two-thirds proof lane.', { right, cards: cards.map(card => card.rect) })
	}
}

function assertCaptionRegionIsNotAnAuthoringSurface() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Caption support lane',
		slides: [{ id: 'caption-support', title: 'Caption support lane', layoutIntent: 'image-left-copy-right', content: [
			{ kind: 'title', name: 'title', text: 'Caption support lane' },
			{ kind: 'image-feature', name: 'proof-media', visualIntent: { mode: 'generate', concept: 'quiet clinical proof image' }, altText: 'Clinical proof image', region: 'media' },
			{ kind: 'textBox', name: 'caption', text: 'Supporting caption for the proof image.', region: 'caption' },
		] }],
	}
	const plan = planDeckLayout(spec)
	const slide = plan.slides[0]
	if (!plan.warnings.some(item => item.code === 'UNKNOWN_REGION' && item.blockName === 'caption')) {
		fail('Removed caption region was still accepted as an Authoring Excellence surface.', { warnings: plan.warnings })
	}
	if (slide.regions?.caption || AUTHORING_REGION_ALIASES.includes('caption')) {
		fail('Removed caption region remained in the engine or public vocabulary.', { regions: slide.regions, aliases: AUTHORING_REGION_ALIASES })
	}
}

function assertReadableTypographyDefaults() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Readable typography defaults',
		slides: [
			{ id: 'opening', title: 'Readable opening', layoutIntent: 'title-body', content: [
				{ kind: 'title', name: 'deck-title', text: 'Readable opening', style: { fontSize: 50 } },
				{ kind: 'body', name: 'body', text: 'Comfortable body copy remains concise.' },
				{ kind: 'callout', name: 'callout', text: 'Readable callout' },
			] },
			{ id: 'diagram', title: 'Readable diagram', layoutIntent: 'process-flow', content: [
				{ kind: 'title', name: 'slide-title', text: 'Readable diagram' },
				{ kind: 'smartart', name: 'diagram', verified: true, evidenceSource: 'verification-fixture', nodes: [{ name: 'one', text: 'One' }, { name: 'two', text: 'Two' }] },
			] },
		],
	}
	const plan = planDeckLayout(spec)
	const opening = plan.slides[0]
	const deckTitle = opening.objects.find(object => object.blockName === 'deck-title')
	const callout = opening.objects.find(object => object.blockName === 'callout')
	const slideTitle = plan.slides[1].objects.find(object => object.blockName === 'slide-title')
	const diagram = plan.slides[1].objects.find(object => object.blockName === 'diagram')
	if (!deckTitle || deckTitle.rect?.h < 0.89 || deckTitle.style?.fontSize !== 50 || deckTitle.fit?.overflow) fail('The semantic title host cannot carry an AI-authored 50pt deck title.', { deckTitle })
	if (!slideTitle || slideTitle.style?.fontSize !== 35) fail('The default semantic slide title is below the 35pt readability baseline.', { slideTitle })
	if (!callout || callout.style?.fontSize !== 16) fail('The default semantic callout is below the 16pt readability baseline.', { callout })
	if (!diagram || diagram.style?.fontSize !== 14) fail('The default native diagram label is below the 14pt readability baseline.', { diagram })
}

function assertPrecommitCompositeTextReadability() {
	const narrowCellText = 'A deliberately long first-column label that must wrap repeatedly inside a half-inch authored column width.'
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Precommit composite readability',
		styleIntent: { artDirection: 'editorial' },
		slides: [
			{ id: 'long-title', layoutIntent: 'title-body', content: [
				{ kind: 'title', name: 'long-title-copy', text: 'A deliberately long first committed title stays at projection size' },
				{ kind: 'body', name: 'long-title-body', text: 'The body must begin below the expanded title host.' },
			] },
			{ id: 'effective-style', layoutIntent: 'title-body', content: [
				{ kind: 'title', name: 'effective-title', text: 'Effective style inputs' },
				{ kind: 'textBox', name: 'large-options-copy', text: 'Large author styling must be measured before commit even when it is supplied through options rather than style. '.repeat(5), options: { x: 1, y: 2, w: 2.4, h: 0.55, fontSize: 36 } },
				{ kind: 'textBox', name: 'small-body-copy', text: 'Too small', options: { x: 4, y: 2, w: 2, h: 0.6, fontSize: 8 } },
			] },
			{ id: 'data-floors', layoutIntent: 'three-column', content: [
				{ kind: 'title', name: 'data-title', text: 'Data and diagram floors' },
				{ kind: 'metric-grid', name: 'small-metric', style: { fontSize: 8 }, verified: true, evidenceSource: 'fixture', items: [{ name: 'one', label: 'Signal', value: '84%' }] },
				{ kind: 'process', name: 'small-process', style: { fontSize: 8 }, verified: true, evidenceSource: 'fixture', items: [{ name: 'one', text: 'First' }, { name: 'two', text: 'Second' }] },
				{ kind: 'smartart', name: 'small-smartart', style: { fontSize: 8 }, verified: true, evidenceSource: 'fixture', nodes: [{ text: 'One' }, { text: 'Two' }] },
			] },
			{ id: 'table-fit', layoutIntent: 'title-body', content: [
				{ kind: 'title', name: 'table-title', text: 'Authored table tracks govern fit' },
				{ kind: 'table-panel', name: 'narrow-table', verified: true, evidenceSource: 'fixture', rows: [[narrowCellText, 'Wide value']], tableOptions: { fontSize: 8, colW: [0.5, 10.5], rowH: [0.5] } },
			] },
			{ id: 'chart-fit', layoutIntent: 'title-body', content: [
				{ kind: 'title', name: 'chart-title', text: 'Chart label floors are factual' },
				{ kind: 'chart-panel', name: 'small-chart-labels', verified: true, evidenceSource: 'fixture', chartType: 'bar', data: [{ name: 'Series', labels: ['A'], values: [1] }], chartOptions: { dataLabelFontSize: 8, catAxisLabelFontSize: 9 } },
			] },
		],
	}
	const plan = planDeckLayout(spec)
	const opening = plan.slides[0]
	const title = opening.objects.find(object => object.blockName === 'long-title-copy')
	if (!title || title.fit?.overflow || title.rect.h <= 1.05 || title.rect.y + title.rect.h > opening.regions.body.y - 0.02 || opening.regions.footer.y + opening.regions.footer.h > 7.5) {
		fail('Long readable title did not expand its engine-owned host above the body.', { title, regions: opening.regions })
	}
	const warning = (name, code) => plan.warnings.find(item => item.code === code && String(item.objectName || item.blockName || '').includes(name))
	if (!warning('large-options-copy', 'TEXT_OVERFLOW_RISK')) fail('Effective options.fontSize did not participate in precommit overflow measurement.', { warnings: plan.warnings })
	const mergedLargeOverflow = [...plan.warnings, ...validateLayoutPlan(plan).issues].filter(item => item.code === 'TEXT_OVERFLOW_RISK' && String(item.objectName || '').includes('large-options-copy'))
	if (mergedLargeOverflow.length !== 1) fail('Layout validation duplicated an already measured precommit overflow finding.', { mergedLargeOverflow })
	if (!warning('small-body-copy', 'SMALL_TEXT_READABILITY_RISK')) fail('Below-floor body type did not produce a precommit readability finding.', { warnings: plan.warnings })
	for (const name of ['small-metric', 'small-process', 'small-smartart', 'narrow-table', 'small-chart-labels']) {
		if (!warning(name, 'SMALL_TEXT_READABILITY_RISK')) fail('Composite text family did not enforce its precommit readability floor.', { name, warnings: plan.warnings })
	}
	const table = plan.slides.find(slide => slide.slideId === 'table-fit')?.objects.find(object => object.blockName === 'narrow-table')
	const firstCell = table?.cellFit?.cells?.find(cell => cell.rowIndex === 0 && cell.columnIndex === 0)
	if (!table?.cellFit?.explicitTrackGeometry || firstCell?.hostWidthIn !== 0.5 || firstCell?.overflow !== true || !warning('cell-1-1', 'TEXT_OVERFLOW_RISK')) {
		fail('Table fit did not honor the authored narrow column and span-aware host geometry.', { table, warnings: plan.warnings })
	}
}

function assertAiOwnedChromaticTypography() {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Chromatic typography',
		styleIntent: { artDirection: 'candy', mode: 'light' },
		theme: { palette: ['30253B', 'EC4899', '8B5CF6', '10B981', 'FFF4FB'] },
		slides: [
			{ id: 'type-colour', layoutIntent: 'title-body', content: [
				{ kind: 'title', name: 'accent-title', text: 'Chromatic title', style: { textColorRole: 'accent' } },
				{ kind: 'body', name: 'secondary-copy', text: 'Supporting copy.', style: { textColorRole: 'secondary' } },
				{ kind: 'callout', name: 'proof-callout', text: 'Verified proof.', style: { textColorRole: 'proof' } },
				{ kind: 'textBox', name: 'exact-colour', text: 'Exact author colour.', style: { textColorRole: 'caution', color: '123456' } },
			] },
			{ id: 'smartart-colour', layoutIntent: 'process-flow', content: [
				{ kind: 'title', name: 'diagram-title', text: 'Mixed native surfaces' },
				{ kind: 'smartart', name: 'diagram', nodes: [
					{ text: 'Dark surface', textColorRole: 'onDark' },
					{ text: 'Light surface', textColorRole: 'onLight' },
					{ text: 'Exact node colour', textColorRole: 'onDark', color: 'ABCDEF' },
				] },
			] },
		],
	}
	const contract = textColorRolesForSpec(spec)
	const important = ['primary', 'secondary', 'accent', 'displayAccent', 'proof', 'caution']
	const importantColors = important.map(key => contract.roles?.[key]?.color)
	if (contract.decisionAuthority !== 'AI' || contract.engineRole !== 'resolve-selected-role-and-execute' || importantColors.some(color => !/^[0-9A-F]{6}$/.test(String(color || ''))) || new Set(importantColors).size < 5) {
		fail('Theme-synchronised typographic colour roles are incomplete or collapsed to a binary ink vocabulary.', { contract, importantColors })
	}
	const objects = Object.fromEntries(planDeckLayout(spec).slides[0].objects.map(object => [object.blockName, object]))
	if (objects['accent-title']?.style?.color !== contract.roles.accent.color
		|| objects['secondary-copy']?.style?.color !== contract.roles.secondary.color
		|| objects['proof-callout']?.style?.color !== contract.roles.proof.color) {
		fail('The engine did not execute the chromatic text role selected by the AI.', { contract, objects })
	}
	if (objects['exact-colour']?.style?.color !== '123456') fail('An exact AI-authored text colour did not outrank the semantic role.', { object: objects['exact-colour'] })
	const diagram = planDeckLayout(spec).slides[1].objects.find(object => object.blockName === 'diagram')
	const nodeColors = (diagram?.nodes || []).map(node => node?.color)
	if (nodeColors[0] !== contract.roles.onDark.color || nodeColors[1] !== contract.roles.onLight.color || nodeColors[2] !== 'ABCDEF') {
		fail('Native SmartArt node text roles were not resolved independently, or an exact node colour lost precedence.', { contract, diagram, nodeColors })
	}
}

function assertNativeSmartArtTextPolarityGuard() {
	const base = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native SmartArt text-polarity guard',
		styleIntent: { artDirection: 'meridian', mode: 'dark' },
		theme: { palette: ['0B1120', '1D4ED8', '0E7490', 'D97706', 'F8FAFC'] },
		slides: [{ id: 'smartart-polarity', title: 'Selected native SmartArt', layoutIntent: 'process-flow', content: [
			{ kind: 'title', name: 'title', text: 'Selected native SmartArt' },
			{
				kind: 'smartart', name: 'decision-path', mode: 'native', layout: 'process',
				quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1',
				colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2',
				nodes: [{ text: 'Frame' }, { text: 'Choose' }, { text: 'Verify' }],
				verified: true, evidenceSource: 'deterministic verifier fixture',
			},
		] }],
	}
	const unresolvedPlan = planDeckLayout(base)
	const finding = unresolvedPlan.warnings.find(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED')
	if (!finding || finding.severity !== 'error' || finding.evidence?.decisionAuthority !== 'AI' || finding.evidence?.engineAction !== 'block-without-selecting'
		|| finding.evidence?.unresolvedNodeCount !== 3 || finding.evidence?.unresolvedNodePaths?.join(',') !== 'nodes[0],nodes[1],nodes[2]'
		|| !finding.evidence?.selectedStyleKeys?.includes('quickStyleId') || !finding.evidence?.selectedStyleKeys?.includes('colorStyleId')
		|| !/engine will not choose/i.test(finding.fix || '') || Object.hasOwn(finding, 'suggestions')) {
		fail('Selected native SmartArt did not block on unresolved AI-owned text polarity.', { finding, warnings: unresolvedPlan.warnings })
	}
	if (deterministicPlanDigest(unresolvedPlan) !== deterministicPlanDigest(planDeckLayout(base))) {
		fail('Native SmartArt text-polarity finding is not deterministic.', { finding })
	}

	const partial = structuredClone(base)
	partial.slides[0].content[1].nodes[0].textColorRole = 'onDark'
	partial.slides[0].content[1].nodes[1].color = 'FFFFFF'
	const partialFinding = planDeckLayout(partial).warnings.find(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED')
	if (partialFinding?.evidence?.unresolvedNodeCount !== 1 || partialFinding.evidence.unresolvedNodePaths?.[0] !== 'nodes[2]') {
		fail('Per-node SmartArt polarity did not isolate the unresolved node.', { partialFinding })
	}

	const perNode = structuredClone(base)
	perNode.slides[0].content[1].nodes = [
		{ text: 'Frame', textColorRole: 'onDark' },
		{ text: 'Choose', color: 'FFFFFF' },
		{ text: 'Verify', textColorRole: 'onAccent' },
	]
	const perNodePlan = planDeckLayout(perNode)
	if (perNodePlan.warnings.some(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED')) {
		fail('Complete AI-authored per-node SmartArt polarity remained blocked.', { warnings: perNodePlan.warnings })
	}

	const topLevel = structuredClone(base)
	topLevel.slides[0].content[1].style = { textColorRole: 'onDark' }
	const topLevelPlan = planDeckLayout(topLevel)
	const topLevelObject = topLevelPlan.slides[0].objects.find(object => object.blockName === 'decision-path')
	if (topLevelPlan.warnings.some(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED') || !/^[0-9A-F]{6}$/i.test(String(topLevelObject?.style?.color || ''))) {
		fail('Explicit whole-diagram SmartArt textColorRole did not clear and execute the guard.', { warnings: topLevelPlan.warnings, topLevelObject })
	}

	const invalidRole = structuredClone(base)
	invalidRole.slides[0].content[1].nodes = invalidRole.slides[0].content[1].nodes.map(node => ({ ...node, textColorRole: 'engine-pick-for-me' }))
	const invalidFinding = planDeckLayout(invalidRole).warnings.find(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED')
	if (invalidFinding?.evidence?.unresolvableTextColorRolePaths?.length !== 3) {
		fail('Unknown SmartArt textColorRole incorrectly satisfied the executable polarity guard.', { invalidFinding })
	}

	const unselected = structuredClone(base)
	delete unselected.slides[0].content[1].quickStyleId
	delete unselected.slides[0].content[1].colorStyleId
	const custom = structuredClone(base)
	custom.slides[0].content[1].mode = 'shape'
	if (planDeckLayout(unselected).warnings.some(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED')
		|| planDeckLayout(custom).warnings.some(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED')) {
		fail('SmartArt text-polarity guard escaped its native selected-style boundary.')
	}
}

function assertNativeSmartArtNodeTopologyGuard() {
	const flat = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native SmartArt topology guard',
		slides: [{ id: 'radial-topology', title: 'One center, four influences', layoutIntent: 'process-flow', content: [
			{ kind: 'title', name: 'title', text: 'One center, four influences' },
			{
				kind: 'smartart', name: 'radial', mode: 'native', layout: 'relationship',
				layoutId: 'urn:microsoft.com/office/officeart/2008/layout/RadialCluster',
				style: { textColorRole: 'onDark' },
				nodes: [{ text: 'Center' }, { text: 'One' }, { text: 'Two' }, { text: 'Three' }, { text: 'Four' }],
				verified: true, evidenceSource: 'deterministic verifier fixture',
			},
		] }],
	}
	const flatPlan = planDeckLayout(flat)
	const finding = flatPlan.warnings.find(item => item.code === 'SMARTART_NODE_TOPOLOGY_INVALID')
	if (!finding || finding.severity !== 'error' || finding.evidence?.failure !== 'top-level-node-count'
		|| finding.evidence?.topLevelNodeCount !== 5 || finding.evidence?.requiredTopLevelNodes !== 1
		|| finding.evidence?.maxChildren !== 7 || finding.evidence?.engineAction !== 'block-before-commit'
		|| !/nodes:\[\{text.*children/i.test(finding.fix || '')) {
		fail('Flat Radial Cluster nodes did not fail closed before commit.', { finding, warnings: flatPlan.warnings })
	}
	const nested = structuredClone(flat)
	nested.slides[0].content[1].nodes = [{ text: 'Center', children: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }, { text: 'Four' }] }]
	const nestedPlan = planDeckLayout(nested)
	if (nestedPlan.warnings.some(item => item.code === 'SMARTART_NODE_TOPOLOGY_INVALID')) {
		fail('Valid Radial Cluster parent/child topology remained blocked.', { warnings: nestedPlan.warnings })
	}
	const tooMany = structuredClone(nested)
	tooMany.slides[0].content[1].nodes[0].children = Array.from({ length: 8 }, (_, index) => ({ text: `Child ${index + 1}` }))
	const tooManyFinding = planDeckLayout(tooMany).warnings.find(item => item.code === 'SMARTART_NODE_TOPOLOGY_INVALID')
	if (tooManyFinding?.evidence?.failure !== 'too-many-level-2-children' || tooManyFinding.evidence.childNodeCount !== 8) {
		fail('Radial Cluster did not enforce its seven-child native limit.', { tooManyFinding })
	}
	const tooDeep = structuredClone(nested)
	tooDeep.slides[0].content[1].nodes[0].children[0].children = [{ text: 'Hidden grandchild' }]
	const tooDeepFinding = planDeckLayout(tooDeep).warnings.find(item => item.code === 'SMARTART_NODE_TOPOLOGY_INVALID')
	if (tooDeepFinding?.evidence?.failure !== 'unsupported-level-3-nodes' || tooDeepFinding.evidence.level3NodeCount !== 1 || tooDeepFinding.evidence.maxDepth !== 2) {
		fail('Radial Cluster did not reject hidden Level 3 nodes.', { tooDeepFinding })
	}
}

function assertModel3dPosterAnimationFailsClosed() {
	const base = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Repair-safe native model scene',
		slides: [{ id: 'model-scene', title: 'Model scene', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Model scene' },
			{ kind: 'model3d', name: 'actor', modelAsset: 'model3d://catalog/example', scene: { animId: 0, loop: true, posterAnimId: 1 }, altText: 'Rigged native model.' },
		] }],
	}
	const finding = planDeckLayout(base).warnings.find(item => item.code === 'MODEL3D_POSTER_ANIMATION_UNSUPPORTED')
	if (finding?.severity !== 'error'
		|| finding?.evidence?.unsupportedField !== 'scene.posterAnimId'
		|| finding?.evidence?.engineAction !== 'block-without-emitting-unsafe-package-state') {
		fail('Unsupported native model poster animation did not fail closed.', { finding })
	}
	const safe = structuredClone(base)
	delete safe.slides[0].content[1].scene.posterAnimId
	if (planDeckLayout(safe).warnings.some(item => item.code === 'MODEL3D_POSTER_ANIMATION_UNSUPPORTED')) {
		fail('Repair-safe native model scene was incorrectly blocked.')
	}
}

async function main() {
	assertIntentContractsStayAligned()
	assertUnderfilledRegionReadback()
	assertNamedRegionStackingAndBalanceReadback()
	assertChartExplanationStacking()
	assertPresenterAwareIntentMatrix()
	assertEngineProposalOwnershipReadback()
	assertBackingFrameOverlapExemption()
	assertAutoPlacementUsesWorldMargin()
	assertRecommendationGeometryOwnershipParity()
	assertSemanticIntentArrangementParity()
	assertProposalAssignmentGeometryReadback()
	assertEmptyGeometryShapeReadback()
	assertNamedCalloutCardReadback()
	assertGenericCalloutBandReadback()
	assertHeroTitleRespectsPinnedCallout()
	assertSemanticDecorativeShapeReadback()
	assertMetricGridDensityReadback()
	assertCompactFamilyBalanceReadback()
	assertDiagramModePolicy()
	assertDataProofFamilies()
	assertUndocumentedProofCannotBypassGate()
	assertCommittedTextShapeDensityReadback()
	assertThreeColumnSemanticPlacementAndCompactArrangementReadback()
	const spike = await fs.readFile(spikePath, 'utf8')
	for (const text of ['contract-aware with deterministic geometry fallback', 'options.placeholder', 'placeholderPolicy']) {
		if (!spike.includes(text)) fail('Placeholder spike does not record the v1 decision.', { text })
	}

	const specs = await loadExamples()
	const summaries = []
	for (const { name, spec } of specs) {
		const plan1 = planDeckLayout(spec)
		const plan2 = planDeckLayout(spec)
		const digest1 = deterministicPlanDigest(plan1)
		const digest2 = deterministicPlanDigest(plan2)
		if (digest1 !== digest2) fail('Layout plan is not deterministic.', { name, digest1, digest2 })
		if (!plan1.placeholderPolicy) fail('Layout plan is missing placeholder policy.', { name })
		const result = validateLayoutPlan(plan1)
		assertNoBlockingIssues(name, result)
		const objectNames = plan1.slides.flatMap(slide => slide.objects.map(object => object.objectName))
		if (objectNames.some(name => !name || !/^[A-Za-z0-9._:-]+$/.test(name))) fail('Layout produced invalid object name.', { name, objectNames })
		summaries.push({
			name,
			slides: plan1.slides.length,
			objects: objectNames.length,
			warnings: plan1.warnings.length,
			digest: digest1.slice(0, 12),
		})
	}
	assertTextEstimatorFixtures()
	assertWorldModePaletteCorrection()
	assertDiagramDoesNotRepeatSlideTitle()
	assertSemanticColumnArrangement()
	assertSplitCopyAndCalloutStack()
	assertComparisonCalloutReservesBand()
	assertParentProofPropagatesToExpandedSteps()
	assertKpiReadingOrder()
	assertEffectReadback()
	assertText3dFocalSizingAndAuthorControl()
	assertArrangementBoundary()
	assertSplitBoundary()
	assertDenseStackFallsBackSafely()
	assertDenseSplitAndSidebarFallBackSafely()
	assertDenseColumnGridFallsBackSafely()
	assertRegionPlanBoundary()
	assertActionableFindingCoverage()
	assertIntentContentMismatchReadback()
	assertCaptionRegionIsNotAnAuthoringSurface()
	assertReadableTypographyDefaults()
	assertPrecommitCompositeTextReadability()
	assertAiOwnedChromaticTypography()
	assertNativeSmartArtTextPolarityGuard()
	assertNativeSmartArtNodeTopologyGuard()
	assertModel3dPosterAnimationFailsClosed()
	await assertColdSeedProofAliasLayout()
	console.log('LAYOUT ENGINE V1 VERIFY: PASS')
	console.log(JSON.stringify({ examples: summaries, textEstimatorFixtures: 'passed', worldModePaletteCorrection: 'passed', diagramTitleOwnership: 'passed', semanticColumnArrangement: 'passed', kpiReadingOrder: 'passed', effectReadback: 'passed', text3dFocalSizingAndAuthorControl: 'passed', arrangementBoundary: 'passed', splitBoundary: 'passed', denseColumnGridFallback: 'passed', regionPlanBoundary: 'passed', actionableFindingCoverage: 'passed', intentContentMismatchReadback: 'passed', namedRegionStackingAndBalanceReadback: 'passed', engineProposalOwnershipReadback: 'passed', backingFrameOverlapExemption: 'passed', autoPlacementUsesWorldMargin: 'passed', recommendationGeometryOwnershipParity: 'passed', proposalAssignmentGeometryReadback: 'passed', semanticDecorativeShapeReadback: 'passed', diagramModePolicy: 'passed', namedCalloutCardReadback: 'passed', metricGridDensityReadback: 'passed', compactFamilyBalanceReadback: 'passed', committedTextShapeDensityReadback: 'passed', readableTypographyDefaults: 'passed', precommitCompositeTextReadability: 'passed', aiOwnedChromaticTypography: 'passed', nativeSmartArtTextPolarityGuard: 'passed', nativeSmartArtNodeTopologyGuard: 'passed', model3dPosterAnimationGuard: 'passed' }, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
