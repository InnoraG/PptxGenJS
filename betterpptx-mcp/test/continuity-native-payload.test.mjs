import assert from 'node:assert/strict'
import test from 'node:test'
import { assertRuntimeEditableItemPair, nativeEditableItemDigest } from '../ir/continuity-native-payload.mjs'

function shape(name, handle, x) {
	return { _type: 'text', shape: 'rect', text: '', options: { x, y: 1, w: 2, h: 1, objectName: name, editHandle: handle, altText: 'Same editable card', fill: { color: 'D8E9F5' }, line: { color: '334455', width: 1 } } }
}
function group(name, handle, x) {
	const childName = `${name}-heading`
	const options = { x, y: 2, w: 2, h: 1, objectName: name, editHandle: handle, children: [{ kind: 'textShape', name: childName, objectName: childName, x: 0.1, y: 0.1, w: 1.8, h: 0.5, text: 'Same heading', style: { color: '112233' }, _nativeObject: { _type: 'text', shape: 'rect', text: [{ text: 'Same heading', options: { color: '112233', objectName: childName } }], options: { x: 0.1, y: 0.1, w: 1.8, h: 0.5, objectName: childName, color: '112233' } } }] }
	return { _type: 'group', options, group: options }
}
function boundary(kind, from, to) {
	return { boundaries: [{ id: 'handoff', fromSlideId: 'out', toSlideId: 'in', from: { itemKind: kind }, to: { itemKind: kind }, plannedBindings: { from: { item: { objectName: from.options.objectName, editHandle: from.options.editHandle } }, to: { item: { objectName: to.options.objectName, editHandle: to.options.editHandle } } } }] }
}
const slides = [{ slideId: 'out', slideIndex: 0 }, { slideId: 'in', slideIndex: 1 }]

test('runtime native shape payload ignores only slide-local identity and position', () => {
	const out = shape('out-card', 'handle-out', 1), incoming = shape('in-card', 'handle-in', 7)
	assert.equal(nativeEditableItemDigest(out, 'editable-shape'), nativeEditableItemDigest(incoming, 'editable-shape'))
	const report = assertRuntimeEditableItemPair(boundary('editable-shape', out, incoming), { slides: [{ _slideObjects: [out] }, { _slideObjects: [incoming] }] }, slides)
	assert.equal(report[0].status, 'RUNTIME_NATIVE_PAYLOAD_MATCH')
	incoming.options.fill.color = 'FF0000'
	assert.throws(() => assertRuntimeEditableItemPair(boundary('editable-shape', out, incoming), { slides: [{ _slideObjects: [out] }, { _slideObjects: [incoming] }] }, slides), { code: 'SLIDE_CONTINUITY_RUNTIME_ITEM_PAYLOAD_MISMATCH' })
	assert.throws(() => nativeEditableItemDigest({ ...out, options: { ...out.options, data: 'unresolved' } }, 'editable-shape'), { code: 'SLIDE_CONTINUITY_RUNTIME_ITEM_PAYLOAD_UNSUPPORTED' })
})

test('runtime native group compares ordered child geometry, style and prepared editable object', () => {
	const out = group('out-group', 'handle-out', 1), incoming = group('in-group', 'handle-in', 7)
	assert.equal(nativeEditableItemDigest(out, 'editable-shape-group'), nativeEditableItemDigest(incoming, 'editable-shape-group'))
	incoming.group.children[0].x = 0.2
	assert.notEqual(nativeEditableItemDigest(out, 'editable-shape-group'), nativeEditableItemDigest(incoming, 'editable-shape-group'))
	incoming.group.children[0].x = 0.1
	incoming.group.children[0]._nativeObject.text[0].options.color = 'FF0000'
	assert.notEqual(nativeEditableItemDigest(out, 'editable-shape-group'), nativeEditableItemDigest(incoming, 'editable-shape-group'))
})

test('runtime binding rejects missing or duplicate exact native edit identity', () => {
	const out = shape('out-card', 'handle-out', 1), incoming = shape('in-card', 'handle-in', 7)
	assert.throws(() => assertRuntimeEditableItemPair(boundary('editable-shape', out, incoming), { slides: [{ _slideObjects: [out, structuredClone(out)] }, { _slideObjects: [incoming] }] }, slides), { code: 'SLIDE_CONTINUITY_RUNTIME_ITEM_BINDING' })
	assert.throws(() => assertRuntimeEditableItemPair(boundary('editable-shape', out, incoming), { slides: [{ _slideObjects: [out] }, { _slideObjects: [] }] }, slides), { code: 'SLIDE_CONTINUITY_RUNTIME_ITEM_BINDING' })
})
