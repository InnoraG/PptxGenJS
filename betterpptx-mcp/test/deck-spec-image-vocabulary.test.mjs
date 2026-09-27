import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
// The workspace currently carries Ajv 6. Its validator supports the vocabulary
// used here but does not register the draft-2020 meta-schema identifier.
delete ajvSchema.$schema
const validate = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)

function deckWith(block) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Image vocabulary proof',
		slides: [{
			id: 'slide-1',
			title: 'Image',
			layoutIntent: 'image-left-copy-right',
			content: [block],
		}],
	}
}

function assertValid(value, label) {
	assert.equal(validate(value), true, `${label}: ${JSON.stringify(validate.errors)}`)
}

function assertInvalid(value, label) {
	assert.equal(validate(value), false, `${label} unexpectedly passed`)
	assert.ok(validate.errors?.length, `${label} failed without schema diagnostics`)
}

test('deck spec teaches the canonical nested image authoring vocabulary', () => {
	const content = schema.$defs.contentBlock.properties
	assert.ok(content.kind.enum.includes('image'))
	assert.ok(content.kind.enum.includes('image-feature'))
	for (const key of ['source', 'imageOptions', 'imageAdjustments', 'pictureAdjuncts', 'pictureStyle', 'pictureStylePresetId', 'altText']) {
		assert.ok(content[key], `missing contentBlock.${key}`)
	}
	assert.equal(content.imageOptions.$ref, '#/$defs/imageOptions')
	for (const key of ['source', 'sizing', 'pictureAdjuncts', 'imageAdjustments', 'pictureStyle', 'pictureStylePresetId', 'altText']) {
		assert.ok(schema.$defs.imageOptions.oneOf[1].properties[key], `missing imageOptions.${key}`)
	}
	assert.equal(schema.$defs.pictureAdjuncts.oneOf[1].properties.placeholder.$ref, '#/$defs/picturePlaceholderBinding')
})

test('canonical imageOptions accepts source, framing, clipArt binding, adjustments, accessibility, and Picture Style together', () => {
	assertValid(deckWith({
		kind: 'image',
		name: 'hero-image',
		imageOptions: {
			source: { kind: 'asset', ref: 'asset://hero-image', format: 'png' },
			sizing: { type: 'cover' },
			pictureAdjuncts: {
				rounding: true,
				hyperlink: { url: 'https://example.com/proof', tooltip: 'Open proof' },
				placeholder: { type: 'clipArt', idx: 0, size: 'half', hasCustomPrompt: false },
			},
			imageAccessibility: { altText: 'A concise semantic description' },
			imageAdjustments: {
				brightness: 0.1,
				contrast: -0.05,
				sharpness: 0.3,
				saturation: 1.2,
				temperature: 5400,
				colorMode: 'recolor',
				recolor: { dark: '07111F', light: { scheme: 'accent4', tint: 0.4 } },
				artisticEffect: { type: 'blur', radius: 12 },
			},
			pictureStylePresetId: 'picture-style-001',
			pictureStyle: {
				geometry: { preset: 'roundRect', adjustments: { adj: 0.2 } },
				line: { type: 'solid', widthPt: 1.5, color: { color: '38BDF8', colorType: 'rgb' } },
				effects: [{ type: 'softEdge', radiusPt: 2 }],
				threeD: {
					camera: { preset: 'perspectiveFront', perspectiveDeg: 35, rotation: { zDeg: 4 } },
					lightRig: { preset: 'threePt', direction: 't', rotation: { xDeg: 15 } },
					format: { material: 'matte', extrusionDepthPt: 3, extrusionColor: '64748B' },
				},
			},
			rotate: 8,
			flipH: false,
		},
	}), 'canonical nested image')
})

test('top-level image aliases remain typed for compatibility', () => {
	assertValid(deckWith({
		kind: 'image-feature',
		name: 'legacy-image',
		source: { kind: 'https', url: 'https://example.com/image.jpeg', format: 'jpeg' },
		imageAdjustments: { colorMode: 'grayscale', transparency: 12.5 },
		pictureAdjuncts: { placeholder: 'pic' },
		pictureStylePresetId: 'picture-style-028',
		pictureStyle: null,
		altText: 'Compatibility image',
	}), 'top-level compatibility aliases')
})

test('image vocabulary rejects unsafe or invalid typed values', () => {
	const cases = [
		['local path disguised as an asset', { source: { kind: 'asset', ref: 'C:\\private\\image.png' } }],
		['unsupported framing', { imageOptions: { sizing: { type: 'stretch' } } }],
		['unsupported placeholder type', { pictureAdjuncts: { placeholder: { type: 'photograph' } } }],
		['non-applicable clipArt orientation', { pictureAdjuncts: { placeholder: { type: 'clipArt', orient: 'vert' } } }],
		['out-of-range correction', { imageAdjustments: { brightness: 2 } }],
		['unknown Picture Style preset', { pictureStylePresetId: 'picture-style-029' }],
		['unknown Picture Style component', { pictureStyle: { borderMagic: {} } }],
	]
	for (const [label, fields] of cases) {
		assertInvalid(deckWith({ kind: 'image', name: `bad-${label.replaceAll(' ', '-')}`, ...fields }), label)
	}
})
