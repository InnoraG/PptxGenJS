import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { CHART_FORMAT_PARAMETERS, listOptionCatalog } from '../option-registry.mjs'

const baseSpec = chartOptions => ({
	 schemaVersion: 'betterpptx.deck-spec.v1', title: 'Chart format parameter contract',
	 authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	 contentStory: { audience: 'presentation authors', outcome: 'prove typed native chart formatting controls', remember: 'chart sliders remain editable' },
	 visualDesign: { world: 'blueprint', framing: 'one native chart proof object' },
	 motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' },
	 slides: [{ id: 's', title: 'Chart formatting', message: 'Native chart controls remain editable.', layoutIntent: 'title-only', content: [{ kind: 'chart-panel', name: 'chart', chartType: 'bar', data: [{ name: 'Series', labels: ['A', 'B', 'C'], values: [12, 24, 18] }], chartOptions }] }],
})

test('chartPreset catalog exposes native format parameters beyond type tiles', () => {
	const surface = listOptionCatalog({ surface: 'chartPreset', format: 'full' }).surfaces[0]
	assert.equal(surface.capabilityMode, 'preset-plus-parameters')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.parameters.length, CHART_FORMAT_PARAMETERS.length)
	assert.ok(surface.parameters.some(item => item.id === 'valAxisMajorUnit'))
	assert.ok(surface.parameters.some(item => item.id === 'chartArea'))
	assert.match(surface.resetBehavior.full, /chartPresetId to null/)
})

test('chart sliders and structured areas reach the native chart operation', () => {
	const plan = buildSpecOperationPlan(baseSpec({
		showLegend: true, legendPos: 'b', chartColorsOpacity: 72, showValue: true,
		valAxisMinVal: 0, valAxisMaxVal: 40, valAxisMajorUnit: 10, lineSize: 2.5,
		chartArea: { fill: { color: 'FFFFFF' }, border: { color: 'CBD5E1', pt: 0.75 }, roundedCorners: false },
		plotArea: { fill: { color: 'F8FAFC' }, border: { color: 'E2E8F0', pt: 0.5 } },
	}), { dryRun: true })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_chart')
	assert.equal(operation.args.options.chartColorsOpacity, 72)
	assert.equal(operation.args.options.valAxisMajorUnit, 10)
	assert.equal(operation.args.options.chartArea.roundedCorners, false)
})

test('chart format bounds reject unsafe slider values before mutation', () => {
	assert.throws(() => buildSpecOperationPlan(baseSpec({ chartColorsOpacity: 100.1 }), { dryRun: true }), /chartColorsOpacity/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ valAxisLogScaleBase: 1 }), { dryRun: true }), /valAxisLogScaleBase/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ lineDataSymbolSize: 1 }), { dryRun: true }), /lineDataSymbolSize/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ legendPos: 'middle' }), { dryRun: true }), /legendPos/)
})
