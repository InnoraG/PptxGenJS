import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'
import JSZip from 'jszip'

import { publicAuthoringLesson, publicControlRegistry } from '../authoring-control-registry.mjs'
import { createMcpToolDispatcher, getDeck } from '../engine.mjs'
import { expandAnimatedTables, ANIMATED_TABLE_REPRESENTATION } from '../ir/animated-table.mjs'
import { normalizeContentKindsInSpec, planDeckLayout, attachContentRepresentationAudit } from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { resolveInteractionTargetGeometry } from '../ir/synergy-compiler.mjs'
import { TOOLS } from '../tools.mjs'

const lessonSpec = () => structuredClone(publicAuthoringLesson('animated-table-synergy').minimalSpec)
const legacyJoeTimelineFixture = new URL('../../research-demos/2026-07-13-synergy-calibration/joe-clip-timelines.json', import.meta.url)
const hasLegacyJoeTimelineFixture = existsSync(legacyJoeTimelineFixture)

test('animated-table lowers to an explicit editable native composite with stable row and cell targets', () => {
	const expanded = expandAnimatedTables(lessonSpec())
	const table = expanded.slides[0].content[0]
	assert.equal(table.kind, 'group')
	assert.equal(table.role, 'animated-table')
	assert.equal(table.animatedTable.representation, ANIMATED_TABLE_REPRESENTATION)
	assert.equal(table.animatedTable.rowCount, 3)
	assert.equal(table.animatedTable.columnCount, 3)
	assert.equal(table.children[2].objectName, 'decision-table.row-2')
	assert.equal(table.children[2].children[2].objectName, 'decision-table.row-2.cell-3')
	assert.equal(expanded.slides[0].timeline.length, 3)
	assert.deepEqual(expanded.slides[0].timeline.map(step => step.objectName), [
		'decision-table.row-1',
		'decision-table.row-2',
		'decision-table.row-3',
	])
})

test('animated-table aliases compile and the public readback refuses a native-table claim', () => {
	const spec = lessonSpec()
	spec.slides[0].content[0].kind = 'progressive-table'
	const normalized = normalizeContentKindsInSpec(spec)
	const plan = planDeckLayout(expandAnimatedTables(normalized.spec))
	attachContentRepresentationAudit(plan, normalized.audit)
	const table = plan.slides[0].objects[0]
	assert.equal(table.contentRepresentation.requestedKind, 'progressive-table')
	assert.equal(table.contentRepresentation.canonicalKind, 'animated-table')
	assert.equal(table.contentRepresentation.expectedRepresentation, ANIMATED_TABLE_REPRESENTATION)
	assert.equal(table.contentRepresentation.plannedRepresentation, ANIMATED_TABLE_REPRESENTATION)
	assert.notEqual(table.contentRepresentation.plannedRepresentation, 'native-table')
})

test('animated-table operation plan materializes an editable group and native descendant reveal operations', () => {
	const plan = buildSpecOperationPlan(lessonSpec(), { dryRun: true, plan: 'premium' })
	const group = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_group' && operation.objectName === 'decision-table')
	assert.ok(group)
	assert.equal(group.args.options.children.length, 4)
	assert.equal(group.args.options.children[2].objectName, 'decision-table.row-2')
	assert.equal(group.args.options.children[2].children[2].objectName, 'decision-table.row-2.cell-3')
	const reveals = plan.operations.filter(operation => operation.tool === 'betterpptx.slide.animate_shapes')
	assert.deepEqual(reveals.map(operation => operation.args.names[0]), [
		'decision-table.row-1',
		'decision-table.row-2',
		'decision-table.row-3',
	])
	assert.ok(reveals.every(operation => operation.args.animation.type === 'entrance'))
})

test('public commit keeps the animated table editable and binds timing to real descendant shapes', async () => {
	const dispatcher = createMcpToolDispatcher({ sessionId: `animated-table-${Date.now()}-${Math.random()}` })
	let deckId
	try {
		const result = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec: lessonSpec(), phase: 'commit', commitMode: 'createNew', detail: 'full' })
		assert.equal(result.ok, true, JSON.stringify(result.error || {}))
		deckId = (result.data || result).deckId
		const slide = getDeck(deckId).pptx.slides[0]
		const group = slide._slideObjects.find(object => object._type === 'group' && object.options?.objectName === 'decision-table')
		assert.ok(group)
		assert.equal(group.group.children[2].objectName, 'decision-table.row-2')
		assert.equal(group.group.children[2].children[2].objectName, 'decision-table.row-2.cell-3')
		assert.deepEqual(slide._animations.map(record => record.target?.options?.objectName), [
			'decision-table.row-1',
			'decision-table.row-2',
			'decision-table.row-3',
		])
		const bytes = await getDeck(deckId).pptx.write({ outputType: 'nodebuffer', compression: false })
		const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
		const xml = await zip.file('ppt/slides/slide1.xml').async('string')
		const coordinateValues = [...xml.matchAll(/<(?:a:off|a:ext|a:chOff|a:chExt)\b[^>]*>/g)]
			.flatMap(match => [...match[0].matchAll(/\b(?:x|y|cx|cy)="([^"]+)"/g)].map(value => value[1]))
		assert.ok(coordinateValues.length > 0)
		assert.deepEqual(coordinateValues.filter(value => !/^-?\d+$/.test(value)), [])
	} finally {
		if (deckId) await dispatcher.call('betterpptx.deck.dispose', { deckId })
	}
})

test('animated-table dry-run matches the public transport output schema', async () => {
	const dispatcher = createMcpToolDispatcher({ sessionId: `animated-table-output-schema-${Date.now()}-${Math.random()}`, blackBox: true })
	const result = await dispatcher.call('betterpptx.deck.generate_from_spec', {
		spec: lessonSpec(),
		phase: 'dryRun',
		commitMode: 'createNew',
		plan: 'premium',
		detail: 'full',
		validateAfterCompile: true,
	})
	assert.equal(result.ok, true, JSON.stringify(result.error || {}))
	const tool = TOOLS.find(candidate => candidate.name === 'betterpptx.deck.generate_from_spec')
	assert.ok(tool?.outputSchema)
	const validate = new Ajv({ allErrors: true, strict: false }).compile(tool.outputSchema)
	assert.equal(validate(result), true, JSON.stringify(validate.errors))
})

test('Synergy resolves animated-table descendants into absolute slide geometry', () => {
	const expanded = expandAnimatedTables(lessonSpec())
	const row = resolveInteractionTargetGeometry(expanded.slides[0].content, 'decision-table.row-2')
	const cell = resolveInteractionTargetGeometry(expanded.slides[0].content, 'decision-table.row-2.cell-3')
	assert.equal(row.bbox.x, 1)
	assert.ok(Math.abs(row.bbox.y - 3.9) < 1e-9)
	assert.equal(row.bbox.w, 11.3)
	assert.equal(row.bbox.h, 1.175)
	assert.ok(Math.abs(cell.bbox.x - 8.533333333333333) < 1e-9)
	assert.ok(Math.abs(cell.bbox.y - 3.9) < 1e-9)
	assert.ok(Math.abs(cell.bbox.w - 3.7666666666666666) < 1e-9)
	assert.equal(cell.bbox.h, 1.175)
})

test('animated-table rejects ambiguous reveal controls and unsupported merged cells', () => {
	const conflicting = lessonSpec()
	conflicting.slides[0].content[0].reveal = { by: 'row', mode: 'cell' }
	assert.throws(() => expandAnimatedTables(conflicting), /must agree/)

	const merged = lessonSpec()
	merged.slides[0].content[0].rows[0][0] = { text: 'A', options: { colSpan: 2 } }
	assert.throws(() => expandAnimatedTables(merged), /merged cell/)

	const ignored = lessonSpec()
	ignored.slides[0].content[0].rows[0][0] = { text: 'A', options: { inventedEffect: true } }
	assert.throws(() => expandAnimatedTables(ignored), /inventedEffect is not supported/)
})

test('presenter interaction starts after the table reveal and keeps the actor playing through measured contact (legacy local oracle)', { skip: !hasLegacyJoeTimelineFixture }, () => {
	const spec = lessonSpec()
	spec.contentStory = { audience: 'test', outcome: 'compare options', remember: 'option B' }
	spec.visualDesign = { world: 'editorial', framing: 'scorecard with presenter contact' }
	spec.motionTime = { masterClock: 'authored slide timeline', timingSource: 'native', syncPolicy: 'one authored clock' }
	spec.presenter = { identity: 'joe' }
	spec.slides[0].narration = { text: 'Compare the evidence and focus on option B.' }
	spec.slides[0].interactions = [{ actor: 'presenter', verb: 'point-at', target: 'decision-table.row-2.cell-3', startMs: 1100 }]
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium', slideSize: { w: 13.333, h: 7.5 } })
	assert.deepEqual(plan.errors, [])
	const reveals = plan.operations.filter(operation => operation.tool === 'betterpptx.slide.animate_shapes' && /^decision-table\.row-\d$/.test(operation.objectName))
	assert.deepEqual(reveals.map(operation => [operation.args.animation.trigger, operation.args.animation.delay]), [
		['withPrevious', 250],
		['withPrevious', 430],
		['withPrevious', 610],
	])
	const presenter = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_model3d' && operation.objectName === 'presenter_ix_0')
	const contact = plan.operations.find(operation => operation.tool === 'betterpptx.slide.animate_shapes' && operation.objectName === 'decision-table.row-2.cell-3')
	assert.ok(presenter)
	assert.ok(contact)
	assert.equal(presenter.args.options.animation.delay, 1100)
	assert.ok(contact.args.animation.delay > 1100)
	assert.ok(presenter.args.options.animation.duration >= contact.args.animation.delay - 1100 + contact.args.animation.duration)
})

test('public default-presenter interaction refuses to guess when no release-qualified timeline profile is configured', () => {
	const previousPublicMode = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try {
		const spec = lessonSpec()
		spec.presenter = { identity: 'joe' }
		spec.slides[0].interactions = [{ actor: 'presenter', verb: 'point-at', target: 'decision-table.row-2.cell-3', startMs: 1100 }]
		let thrown
		try {
			buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium', slideSize: { w: 13.333, h: 7.5 } })
		} catch (error) {
			thrown = error
		}
		assert.equal(thrown?.code, 'INTERACTION_PLAN_UNSOLVED')
		assert.ok(thrown.issues?.some(issue => issue.code === 'INTERACTION_PLAN_UNSOLVED'
			&& issue.evidence?.verdicts?.some(verdict => verdict.code === 'INTERACTION_NO_TIMELINES')))
	} finally {
		if (previousPublicMode === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX
		else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previousPublicMode
	}
})

test('continuous presenter performance targets an animated-table cell through the public dry-run route', async () => {
	const spec = lessonSpec()
	spec.contentStory = { audience: 'decision makers', outcome: 'compare options', remember: 'option B' }
	spec.visualDesign = { world: 'editorial', framing: 'scorecard with presenter contact' }
	spec.motionTime = {
		masterClock: 'authored slide timeline',
		timingSource: 'native',
		syncPolicy: 'one authored clock',
		kineticSelection: { presenters: [{ presenterId: 'presenter', selectedMotionIds: ['motion.ordinary.point'] }] },
	}
	spec.presenter = { id: 'presenter', identity: 'joe', rect: { x: 0.2, y: 1.725, w: 5.866, h: 5.7 } }
	spec.slides[0].presenterPerformance = {
		actor: 'presenter', startMs: 1100, blendMs: 0,
		actions: [{ id: 'point', motionId: 'motion.ordinary.point', durationMs: 2000 }],
		interactions: [{ actionId: 'point', verb: 'point-at', target: 'decision-table.row-2.cell-3' }],
	}
	const dispatcher = createMcpToolDispatcher({ sessionId: `animated-table-performance-${Date.now()}-${Math.random()}`, blackBox: true })
	const result = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' })
	assert.equal(result.ok, true, JSON.stringify(result.error || {}))
	const performance = result.data.authoringContracts.presenterPerformance.performances[0]
	assert.equal(performance.startMs, 1100)
	assert.equal(performance.interactions[0].target, 'decision-table.row-2.cell-3')
	assert.equal(performance.interactions[0].contactSource, 'measured-performer-motion')
	assert.equal(performance.interactions[0].alignment, 'aligned')
	assert.ok(performance.interactions[0].atMs > 1100)
})

test('animated-table is reachable through public catalog discovery and the registered deck schema', () => {
	const interpreted = publicControlRegistry({ intent: 'Build an animated table for a presenter to point at.', limit: 50 })
	assert.ok(interpreted.interpretation.lessonIds.includes('animated-table-synergy'))
	const catalog = publicControlRegistry({ family: 'tables', query: 'animated table', limit: 50 })
	assert.ok(catalog.controls.some(control => control.selection?.semanticKind === 'animated-table'))
	const schema = JSON.parse(readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
	assert.ok(schema.$defs.contentBlock.properties.kind.enum.includes('animated-table'))
	assert.equal(schema.$defs.interaction.properties.startMs.maximum, 120000)
})
