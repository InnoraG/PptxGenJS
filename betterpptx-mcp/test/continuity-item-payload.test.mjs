import assert from 'node:assert/strict'
import test from 'node:test'
import { EDITABLE_ITEM_PAYLOAD_VERSION, editableItemOperationDigest } from '../ir/continuity-item-payload.mjs'
import { bindSlideContinuityItemPayloads } from '../ir/slide-continuity-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const shapeSource = name => ({ kind: 'shape', name, shape: 'rect', style: { fill: { color: 'D8E9F5' } } })
const shapeOperation = (slideId, name, handle, x) => ({
	slideId, objectName: name, tool: 'betterpptx.slide.add_shape',
	args: { shapeName: 'rect', options: { x, y: 1, w: 2.5, h: 1.2, objectName: name, editHandle: handle, altText: name, fill: { color: 'D8E9F5' }, line: { color: '334455', width: 1 } } },
})

test('versioned shape payload ignores slide-local identity and position but binds native content', () => {
	const a = shapeOperation('out', 'card-out', 'handle-out', 1)
	const b = shapeOperation('in', 'card-in', 'handle-in', 7)
	const hash = editableItemOperationDigest(a, 'editable-shape', shapeSource('card-out'))
	assert.equal(hash, editableItemOperationDigest(b, 'editable-shape', shapeSource('card-in')))
	assert.notEqual(hash, editableItemOperationDigest({ ...b, args: { ...b.args, options: { ...b.args.options, fill: { color: 'FF0000' } } } }, 'editable-shape', shapeSource('card-in')))
	assert.notEqual(hash, editableItemOperationDigest({ ...b, args: { ...b.args, options: { ...b.args.options, w: 2.6 } } }, 'editable-shape', shapeSource('card-in')))
	assert.throws(() => editableItemOperationDigest(a, 'editable-shape', { ...shapeSource('card-out'), dataRef: 'unresolved' }), { code: 'SLIDE_CONTINUITY_ITEM_PAYLOAD_UNSUPPORTED' })
})

test('rich text and ordered recursive group interiors change the digest', () => {
	const source = name => ({ kind: 'textShape', name, text: [{ text: 'Plan', options: { color: '112233' } }], style: { fontFace: 'Aptos', fontSize: 18 } })
	const textOperation = (name, text) => ({ tool: 'betterpptx.slide.add_text', args: { text, options: { x: 1, y: 2, w: 3, h: 1, objectName: name, editHandle: `${name}-handle`, fontFace: 'Aptos', fontSize: 18 } } })
	const a = textOperation('text-out', [{ text: 'Plan', options: { color: '112233' } }])
	const b = textOperation('text-in', [{ text: 'Plan', options: { color: '112233' } }])
	const hash = editableItemOperationDigest(a, 'editable-text-shape', source('text-out'))
	assert.equal(hash, editableItemOperationDigest(b, 'editable-text-shape', source('text-in')))
	assert.notEqual(hash, editableItemOperationDigest(textOperation('text-in', [{ text: 'Plan', options: { color: 'FF0000' } }]), 'editable-text-shape', source('text-in')))

	const groupSource = name => ({ kind: 'group', name, children: [
		{ kind: 'textShape', name: `${name}-heading`, x: 0, y: 0, w: 2, h: 0.5, text: 'Heading' },
		{ kind: 'shape', name: `${name}-rule`, x: 0, y: 0.6, w: 2, h: 0.1, style: { fill: { color: '334455' } } },
	] })
	const groupOperation = name => ({ tool: 'betterpptx.slide.add_group', args: { options: { x: 1, y: 1, w: 2, h: 1, objectName: name, editHandle: `${name}-handle`, children: [
		{ kind: 'textShape', objectName: `${name}-heading`, x: 0, y: 0, w: 2, h: 0.5, text: 'Heading', style: { color: '112233' } },
		{ kind: 'shape', objectName: `${name}-rule`, x: 0, y: 0.6, w: 2, h: 0.1, fill: { color: '334455' } },
	] } } })
	const groupA = groupOperation('group-out'), groupB = groupOperation('group-in')
	const groupHash = editableItemOperationDigest(groupA, 'editable-shape-group', groupSource('group-out'))
	assert.equal(groupHash, editableItemOperationDigest(groupB, 'editable-shape-group', groupSource('group-in')))
	const changed = structuredClone(groupB)
	changed.args.options.children[1].x = 0.1
	assert.notEqual(groupHash, editableItemOperationDigest(changed, 'editable-shape-group', groupSource('group-in')))
	changed.args.options.children.reverse()
	assert.notEqual(groupHash, editableItemOperationDigest(changed, 'editable-shape-group', groupSource('group-in')))
	const unsupported = structuredClone(groupB)
	unsupported.args.options.children[0].kind = 'image'
	assert.throws(() => editableItemOperationDigest(unsupported, 'editable-shape-group', groupSource('group-in')), { code: 'SLIDE_CONTINUITY_ITEM_PAYLOAD_UNSUPPORTED' })
})

test('boundary binder checks computed endpoint equality and the authored digest assertion', () => {
	const out = shapeOperation('out', 'card-out', 'handle-out', 1)
	const incoming = shapeOperation('in', 'card-in', 'handle-in', 7)
	const digest = editableItemOperationDigest(out, 'editable-shape', shapeSource('card-out'))
	const boundary = {
		id: 'handoff', fromSlideId: 'out', toSlideId: 'in',
		from: { itemKind: 'editable-shape', itemInstanceId: 'card-out' }, to: { itemKind: 'editable-shape', itemInstanceId: 'card-in' },
		plannedBindings: { from: { item: { objectName: 'card-out', editHandle: 'handle-out' } }, to: { item: { objectName: 'card-in', editHandle: 'handle-in' } } },
	}
	const continuity = { boundaries: [boundary] }
	const spec = { slides: [{ id: 'out', content: [shapeSource('card-out')] }, { id: 'in', content: [shapeSource('card-in')] }], slideContinuities: [{ id: 'handoff', from: { item: { digestVersion: EDITABLE_ITEM_PAYLOAD_VERSION, dataDigest: digest } }, to: { item: { digestVersion: EDITABLE_ITEM_PAYLOAD_VERSION, dataDigest: digest } } }] }
	const bound = bindSlideContinuityItemPayloads(continuity, [out, incoming], spec)
	assert.deepEqual(bound.boundaries[0].itemPayloadBinding, { status: 'COMPILED_OPERATION_PAYLOAD_MATCH', digestVersion: EDITABLE_ITEM_PAYLOAD_VERSION })
	const changed = structuredClone(incoming)
	changed.args.options.fill.color = 'FF0000'
	assert.throws(() => bindSlideContinuityItemPayloads(continuity, [out, changed], spec), { code: 'SLIDE_CONTINUITY_ITEM_EFFECTIVE_PAYLOAD_MISMATCH' })
	const forged = structuredClone(spec)
	forged.slideContinuities[0].from.item.dataDigest = forged.slideContinuities[0].to.item.dataDigest = 'a'.repeat(64)
	assert.throws(() => bindSlideContinuityItemPayloads(continuity, [out, incoming], forged), { code: 'SLIDE_CONTINUITY_ITEM_DIGEST_MISMATCH' })
	const unresolvedCarrier = structuredClone(continuity)
	unresolvedCarrier.boundaries[0].from.itemKind = 'editable-chart'
	assert.throws(() => bindSlideContinuityItemPayloads(unresolvedCarrier, [out, incoming], spec), { code: 'SLIDE_CONTINUITY_ITEM_PAYLOAD_UNSUPPORTED' })
})

test('actual compiler group operations retain equal editable payload across distinct slide instances', () => {
	const group = (name, x) => ({ kind: 'group', name, rect: { x, y: 2, w: 3, h: 1.5 }, children: [
		{ kind: 'textShape', name: `${name}-heading`, x: 0.1, y: 0.1, w: 2.8, h: 0.6, text: 'Same editable heading', style: { fill: { color: 'E7F1FA' }, fontFace: 'Aptos', fontSize: 18, color: '112233' } },
		{ kind: 'shape', name: `${name}-rule`, x: 0.1, y: 0.9, w: 2.8, h: 0.1, style: { fill: { color: '112233' } } },
	] })
	const out = group('group-out', 1), incoming = group('group-in', 8)
	const compiled = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Effective editable group comparison', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		slides: [{ id: 'out', title: 'Outgoing', content: [out] }, { id: 'in', title: 'Incoming', content: [incoming] }],
	})
	const operations = compiled.operations.filter(operation => operation.tool === 'betterpptx.slide.add_group')
	assert.equal(operations.length, 2)
	assert.ok(operations.every(operation => operation.args.options.editHandle))
	assert.equal(editableItemOperationDigest(operations[0], 'editable-shape-group', out), editableItemOperationDigest(operations[1], 'editable-shape-group', incoming))
})
