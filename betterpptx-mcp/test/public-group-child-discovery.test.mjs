import assert from 'node:assert/strict'
import test from 'node:test'
import Ajv from 'ajv'

import { TOOLS } from '../tools.mjs'
import { normalizeStructuralGroup } from '../structural-authoring-family-contract.mjs'
import { publicAuthoringLesson } from '../authoring-control-registry.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const tool = TOOLS.find(row => row.name === 'betterpptx.deck.generate_from_spec')
const childSchema = tool.inputSchema.properties.spec.properties.slides.items.properties.content.items.properties.children.items
const validate = new Ajv({ strict: false, allErrors: true }).compile(childSchema)

test('public group-child schema accepts native editable inch-local children', () => {
	const child = { kind: 'textShape', objectName: 'caption', x: 0.2, y: 0.3, w: 2, h: 0.5, text: 'Evidence', style: { fontSize: 22, color: 'FFFFFF' } }
	assert.equal(validate(child), true, JSON.stringify(validate.errors))
	assert.equal(normalizeStructuralGroup({ x: 1, y: 1, w: 3, h: 2, children: [child] }).children[0].style.fontSize, 22)
})

test('client-facing schema rejects root-level fields rejected by the compiler', () => {
	const base = { kind: 'textShape', objectName: 'caption', x: 0.2, y: 0.3, w: 2, h: 0.5, text: 'Evidence' }
	for (const field of ['rect', 'options', 'fontSize', 'shapeId']) {
		const child = { ...base, [field]: field === 'fontSize' ? 22 : {} }
		assert.equal(validate(child), false, `${field} must fail client validation`)
		assert.throws(() => normalizeStructuralGroup({ x: 1, y: 1, w: 3, h: 2, children: [child] }), /not part of the public structural contract/)
	}
})

test('the public custom-process lesson teaches group-local geometry and compiles', () => {
	const lesson = publicAuthoringLesson('custom-process')
	assert.ok(lesson.adjustableControls.includes('content[].children[].style.fontSize/fill/line'))
	const children = lesson.minimalSpec.slides[0].content[0].children
	assert.equal(children[0].style.fontSize, 24)
	assert.equal(validate(children[0]), true, JSON.stringify(validate.errors))
	assert.equal(validate(children[1]), true, JSON.stringify(validate.errors))
	assert.equal(validate(children[2]), true, JSON.stringify(validate.errors))
	const plan = buildSpecOperationPlan(lesson.minimalSpec, { dryRun: true, plan: 'premium' })
	assert.ok(plan.operations.some(operation => operation.tool === 'betterpptx.slide.add_group'))
})

test('the public structural recipe resolves to the same runnable lesson', async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	const { createMcpToolDispatcher } = await import('../engine.mjs')
	const dispatcher = createMcpToolDispatcher({ sessionId: 'group-child-discovery' })
	const result = await dispatcher.call('betterpptx.help.tool_recipe', { surface: 'structural', detail: 'full' })
	assert.equal(result.ok, true)
	assert.deepEqual(result.data.unknownSurfaces, [])
	assert.equal(result.data.recipes[0].lesson.id, 'custom-process')
	assert.match(result.data.recipes[0].childContract, /style\.fontSize/)
})
