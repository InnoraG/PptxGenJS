import assert from 'node:assert/strict'
import test from 'node:test'

const { publicControlRegistry } = await import('../authoring-control-registry.mjs')
const { listOptionCatalog } = await import('../option-registry.mjs')

test('atomic Text3D material control is generated from the options contract', () => {
	const surface = listOptionCatalog({ surface: 'text3D', format: 'full' }).surfaces.find(item => item.id === 'text3DShape')
	const source = surface.parameters.find(parameter => parameter.id === 'material')
	const result = publicControlRegistry({ controlId: 'text3DShape.material' })
	assert.equal(result.controls.length, 1)
	const control = result.controls[0]
	assert.equal(control.id, 'text3DShape.material')
	assert.equal(control.selection.semanticPath, source.semanticPath)
	assert.deepEqual(control.inputContract.parameter.values, source.values)
	assert.equal(control.inputContract.parameter.valueType, source.valueType)
	assert.deepEqual(control.inputContract.resetBehavior, surface.resetBehavior)
})

test('atomic controls resolve by canonical id, parameter name, and exact path', () => {
	for (const args of [
		{ controlId: 'text3DShape.material' },
		{ family: 'wordart-text3d', query: 'material' },
		{ query: 'options.text3D.material' },
	]) {
		const result = publicControlRegistry({ ...args, limit: 20 })
		assert.ok(result.controls.some(control => control.id === 'text3DShape.material'), JSON.stringify(args))
	}
})

test('native WebVTT control is classified as media and caption intent routes to it', () => {
	const direct = publicControlRegistry({ controlId: 'mediaPlayback.closedCaptionTracks' })
	assert.equal(direct.controls.length, 1)
	assert.equal(direct.controls[0].family, 'media-images-avatar')
	assert.equal(direct.controls[0].nativeCarrier, 'native-picture-or-media')
	assert.ok(direct.controls[0].jsonPaths.includes('content[].mediaOptions.closedCaptionTracks[]'))
	const routed = publicControlRegistry({ intent: '9:16 narrated autoplay with three WebVTT caption clips', limit: 12 })
	assert.ok(routed.interpretation.matchedIntents.includes('narrated-captions'))
	assert.ok(routed.interpretation.relevantFamilies.includes('media-images-avatar'))
	assert.ok(routed.interpretation.relevantFamilies.includes('motion-transitions-morph'))
})
