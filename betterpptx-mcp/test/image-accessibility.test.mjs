import assert from 'node:assert/strict'
import test from 'node:test'
import { IMAGE_ACCESSIBILITY_PARAMETERS, validateImageAccessibilityOptions, validateImageAltText } from '../image-accessibility-catalog.mjs'
import { listOptionCatalog } from '../option-registry.mjs'

test('image accessibility catalog exposes the native alt-text carrier', () => {
	const catalog = listOptionCatalog({ surface: 'imageAccessibility', format: 'full' })
	const surface = catalog.surfaces.find(item => item.id === 'imageAccessibility')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.parameters.length, IMAGE_ACCESSIBILITY_PARAMETERS.length)
	assert.equal(surface.parameters[0].semanticPath, 'content[].altText')
	assert.match(surface.parameters[0].serializer, /cNvPr\/@descr/)
})

test('semantic image descriptions normalize and reject private implementation details', () => {
	assert.deepEqual(validateImageAccessibilityOptions({ altText: '  A blue workflow diagram.  ' }), { altText: 'A blue workflow diagram.' })
	assert.equal(validateImageAltText(null), null)
	assert.throws(() => validateImageAltText('C:\\private\\image.png'), /private paths/)
	assert.throws(() => validateImageAltText('data:image/png;base64,AAAA'), /private paths/)
	assert.throws(() => validateImageAltText(''), /non-empty/)
})
