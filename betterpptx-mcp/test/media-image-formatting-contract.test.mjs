import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	IMAGE_FRAMING_CONTRACT,
	IMAGE_FRAMING_MODES,
	IMAGE_FRAMING_ROW_IDS,
	IMPORTED_PICTURE_PRESERVATION_ROW_IDS,
	normalizeImageFraming,
} from '../media-image-formatting-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

test('image framing is one generated three-selector contract', () => {
	assert.deepEqual(IMAGE_FRAMING_MODES, ['contain', 'cover', 'crop'])
	assert.equal(IMAGE_FRAMING_ROW_IDS.length, 3)
	assert.equal(IMAGE_FRAMING_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(IMAGE_FRAMING_CONTRACT.overrideFields, ['sizing.type'])
	assert.deepEqual(normalizeImageFraming({ type: ' COVER ' }), { type: 'cover' })
	assert.equal(normalizeImageFraming(null), null)
	assert.throws(() => normalizeImageFraming({ type: 'stretch' }), /contain, cover, or crop/)
	assert.throws(() => normalizeImageFraming({ type: 'cover', x: 1 }), /public image-framing contract|engine-owned/)
})

test('catalog truth promotes only framing and classifies imported picture payloads as preservation', () => {
	for (const id of IMAGE_FRAMING_ROW_IDS) {
		const row = applyCatalogTruth({ id, sourceKind: 'capability-row', family: 'media-images-avatar', label: id, implemented: true })
		assert.equal(row.capabilityMode, 'parameterized')
		assert.equal(row.capabilityStatus, 'executable-exact-structured')
		assert.deepEqual(row.overrideFields, ['sizing.type'])
	}
	for (const id of IMPORTED_PICTURE_PRESERVATION_ROW_IDS) {
		const row = applyCatalogTruth({ id, sourceKind: 'capability-row', family: 'media-images-avatar', label: id, implemented: true })
		assert.equal(row.capabilityMode, 'preserve-only')
		assert.equal(row.capabilityStatus, 'preserve-imported-only')
		assert.deepEqual(row.overrideFields, [])
	}
	const unrelated = applyCatalogTruth({ id: 'cap-unrelated-media', sourceKind: 'capability-row', family: 'media-images-avatar', label: 'media bookmarks', implemented: true })
	assert.equal(unrelated.capabilityStatus, 'structured-partial')
})

test('deck-spec compilation lowers semantic framing into the native image sizing carrier', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'image framing contract', layout: 'LAYOUT_WIDE',
		slides: [{ id: 's1', title: 'Image framing', message: 'Native image framing proof', layoutIntent: 'title-body', content: [{
			kind: 'image', name: 'proof', data: ONE_PIXEL_PNG, sizing: { type: 'cover' }, altText: 'A one-pixel framing proof.',
		}] }],
	}, { plan: 'premium', dryRun: true })
	const image = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_image')
	assert.ok(image)
	assert.equal(image.args.options.sizing.type, 'cover')
	assert.equal(image.args.options._semanticSizing, true)
	assert.ok(image.args.options.sizing.w > 0)
	assert.ok(image.args.options.sizing.h > 0)
})

test('add and sparse update tool schemas project the framing selector and null reset', () => {
	const add = TOOLS.find(tool => tool.name === 'betterpptx.slide.add_image')
	const update = TOOLS.find(tool => tool.name === 'betterpptx.slide.update_shape')
	assert.deepEqual(add.inputSchema.properties.options.properties.sizing.oneOf[1].properties.type.enum, IMAGE_FRAMING_MODES)
	assert.equal(add.inputSchema.properties.options.properties.sizing.oneOf[0].type, 'null')
	assert.deepEqual(update.inputSchema.properties.patch.properties.sizing.oneOf[1].properties.type.enum, IMAGE_FRAMING_MODES)
	assert.equal(update.inputSchema.properties.patch.properties.sizing.oneOf[0].type, 'null')
	for (const schema of [add.inputSchema.properties.options, update.inputSchema.properties.patch]) {
		for (const key of ['altText', 'rotate', 'flipH', 'flipV', 'shadow', 'transparency']) assert.ok(schema.properties[key], key)
		assert.equal(schema.properties.shadow.oneOf[0].type, 'null')
	}
})
