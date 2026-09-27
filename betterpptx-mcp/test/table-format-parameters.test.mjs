import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { listOptionCatalog, TABLE_FORMAT_PARAMETERS } from '../option-registry.mjs'

const baseSpec = tableOptions => ({
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Table format parameter contract',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove typed native table formatting controls', remember: 'table and cell sliders remain editable' },
	visualDesign: { world: 'blueprint', framing: 'one native table proof object' },
	motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' },
	slides: [{ id: 's', title: 'Table formatting', message: 'Native table controls remain editable.', layoutIntent: 'title-only', content: [{ kind: 'table-panel', name: 'table', header: ['Metric', 'Value', 'Status'], rows: [[{ text: 'ARR', options: { fontSize: 15, fill: { color: 'EFF6FF' }, colspan: 1 } }, { text: '$4.2M', options: { color: '0F766E', bold: true } }, { text: 'On plan', options: { align: 'center', valign: 'middle' } }], ['NRR', '118%', 'On plan']], tableOptions }] }],
})

test('tablePreset catalog exposes table and per-cell parameters beyond style tiles', () => {
	const surface = listOptionCatalog({ surface: 'tablePreset', format: 'full' }).surfaces[0]
	assert.equal(surface.capabilityMode, 'preset-plus-parameters')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.parameters.length, TABLE_FORMAT_PARAMETERS.length)
	assert.ok(surface.parameters.some(item => item.id === 'autoPageHeaderRows'))
	assert.ok(surface.parameters.some(item => item.id === 'cellBorder'))
	assert.match(surface.resetBehavior.full, /tableStylePresetId to null/)
})

test('table dimensions, style flags, typography and cell overrides reach the native operation', () => {
	const plan = buildSpecOperationPlan(baseSpec({ headerRow: true, totalRow: true, bandedRows: true, firstColumn: true, colW: [1.6, 2.2, 1.8], rowH: [0.42, 0.38, 0.38], fontSize: 13, margin: 0.08, autoPage: true, autoPageRepeatHeader: true, autoPageHeaderRows: 1, autoPageCharWeight: 0.25, autoPageLineWeight: -0.2 }), { dryRun: true })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_table')
	assert.equal(operation.args.options.bandedRows, true)
	assert.deepEqual(operation.args.options.colW, [1.6, 2.2, 1.8])
	assert.equal(operation.args.options.autoPageHeaderRows, 1)
	assert.equal(operation.args.rows[1][0].options.fontSize, 15)
	assert.equal(operation.args.rows[1][1].options.bold, true)
})

test('table format bounds reject unsafe values before mutation', () => {
	assert.throws(() => buildSpecOperationPlan(baseSpec({ autoPageCharWeight: 1.1 }), { dryRun: true }), /autoPageCharWeight/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ autoPageHeaderRows: 0 }), { dryRun: true }), /autoPageHeaderRows/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ rowH: [0.4, 57] }), { dryRun: true }), /rowH\[1\]/)
})
