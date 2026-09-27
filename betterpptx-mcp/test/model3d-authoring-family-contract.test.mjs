import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCatalogEntry } from '../capability-truth.mjs'
import { MODEL3D_AUTHORING_CAPABILITY_CONTRACT, MODEL3D_AUTHORING_ROW_IDS, MODEL3D_OPTIONS_PUBLIC_SCHEMA, normalizeModel3dOptions } from '../model3d-authoring-family-contract.mjs'
import { applyModel3dViewPreset, model3dViewPresetById } from '../model3d-view-presets.mjs'

test('Model 3-D authoring rows project one exact closed native contract', () => {
	assert.equal(MODEL3D_AUTHORING_ROW_IDS.length, 14)
	for (const id of MODEL3D_AUTHORING_ROW_IDS) {
		const truth = classifyCatalogEntry({ id, family: 'model3d', status: 'implemented' })
		assert.equal(truth.capabilityStatus, 'executable-exact-structured')
		assert.deepEqual(truth.componentOwnership, MODEL3D_AUTHORING_CAPABILITY_CONTRACT.componentOwnership)
		assert.ok(truth.overrideFields.includes('model3dViewPresetId'))
	}
	assert.equal(MODEL3D_OPTIONS_PUBLIC_SCHEMA.additionalProperties, false)
	assert.equal(MODEL3D_OPTIONS_PUBLIC_SCHEMA.properties.model3dViewPresetId.enum.length, 19)
})

test('Model 3-D preset reset and precedence retain exact selected-tile components', () => {
	const preset = model3dViewPresetById('model3d-view-003')
	const selected = applyModel3dViewPreset({ camera: { fov: 47 }, ambientLight: null, ptLights: null }, preset.id).options
	assert.equal(selected.camera.fov, 47)
	assert.deepEqual(selected.camera.pos, preset.recipe.camera.pos)
	assert.deepEqual(selected.ambientLight, preset.recipe.ambientLight)
	assert.deepEqual(selected.ptLights, preset.recipe.ptLights)
	assert.equal(normalizeModel3dOptions({ model3dViewPresetId: preset.id }).model3dViewPresetId, preset.id)
	assert.throws(() => normalizeModel3dOptions({ model3dViewPresetId: 'model3d-view-999' }), /captured native view IDs/)
	assert.throws(() => normalizeModel3dOptions({ privatePath: 'x' }), /not part of the public Model 3-D contract/)
})
