import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { listOptionCatalog, MODEL3D_VIEW_PARAMETERS } from '../option-registry.mjs'
import { applyModel3dViewPreset, model3dViewPresetById } from '../model3d-view-presets.mjs'

const baseSpec = content => ({
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Model 3-D View parameter contract',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove typed native Model 3-D View controls', remember: 'the selected tile remains editable and manual fields are explicit' },
	visualDesign: { world: 'blueprint', framing: 'one native 3-D proof object' },
	motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' },
	slides: [{ id: 's', title: 'Model 3-D View', message: 'Native view parameters remain editable.', layoutIntent: 'title-only', content }],
})

test('Model 3-D View catalog exposes exact presets plus typed manual controls', () => {
	const catalog = listOptionCatalog({ surface: 'model3dViewPreset', format: 'full' })
	const surface = catalog.surfaces[0]
	assert.equal(surface.capabilityMode, 'preset-plus-parameters')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.canonical.length, 18)
	assert.equal(surface.parameters.length, MODEL3D_VIEW_PARAMETERS.length)
	assert.equal(surface.parameters.find(parameter => parameter.id === 'pointLights').capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(surface.parameters.map(parameter => parameter.id), [
		'cameraFovDeg', 'cameraPositionXEmu', 'cameraPositionYEmu', 'cameraPositionZEmu',
		'rotationXDeg', 'rotationYDeg', 'rotationZDeg', 'scaleX', 'scaleY', 'scaleZ',
		'viewportSizeEmu', 'ambientIlluminance', 'ambientColor', 'pointLights',
	])
	assert.match(surface.resetBehavior.full, /model3dViewPresetId to null/)
})

test('valid manual view values reach the native operation and null is an explicit sparse reset', () => {
	const spec = baseSpec([{ kind: 'model3d', name: 'hero', region: 'hero', model: 'model3d://microsoft-stock/example/hero', model3dViewPresetId: 'model3d-view-011', camera: { fov: 48, pos: { x: 1200000, y: -800000, z: 88000000 } }, trans: { rot: { x: 12.5, y: -24.25, z: 7.75 }, scale: { x: 1.2, y: 0.9, z: 1.05 } }, ambientLight: { illuminance: 0.72, color: { r: 96, g: 144, b: 255 } }, ptLights: [{ intensity: 11, pos: { x: 21000000, y: 51000000, z: 26000000 } }, { intensity: 4.5, color: { r: 160, g: 190, b: 255 }, pos: { x: -30000000, y: 22000000, z: 42000000 } }, { intensity: 2, color: { r: 255, g: 180, b: 120 }, pos: { x: 36000000, y: -18000000, z: 18000000 } }], objViewport: 3100000 }])
	const operation = buildSpecOperationPlan(spec, { dryRun: true }).operations.find(item => item.tool === 'betterpptx.slide.add_model3d')
	assert.equal(operation.args.options.model3dViewPresetId, 'model3d-view-011')
	assert.equal(operation.args.options.camera.fov, 48)
	assert.equal(operation.args.options.trans.rot.z, 7.75)
	assert.equal(operation.args.options.objViewport, 3100000)
	assert.equal(operation.args.options.ptLights.length, 3)
	const resetSpec = baseSpec([{ kind: 'model3d', name: 'hero', region: 'hero', model: 'model3d://microsoft-stock/example/hero', model3dViewPresetId: 'model3d-view-011', camera: null, trans: { rot: null, scale: null }, ambientLight: null, ptLights: null, objViewport: null }])
	const resetOperation = buildSpecOperationPlan(resetSpec, { dryRun: true }).operations.find(item => item.tool === 'betterpptx.slide.add_model3d')
	assert.equal(resetOperation.args.options.camera, undefined)
	assert.deepEqual(resetOperation.args.options.trans, { rot: null, scale: null })
	const appliedReset = applyModel3dViewPreset(resetOperation.args.options, 'model3d-view-011').options
	const preset = model3dViewPresetById('model3d-view-011')
	assert.deepEqual(appliedReset.camera, preset.recipe.camera)
	assert.deepEqual(appliedReset.ambientLight, preset.recipe.ambientLight)
	assert.deepEqual(appliedReset.ptLights, preset.recipe.ptLights)
	assert.equal(appliedReset.objViewport, undefined, 'specimen viewport remains auto-fit when reset')
	assert.deepEqual(appliedReset.trans.rot, preset.recipe.trans.rot)
	assert.deepEqual(appliedReset.trans.scale, preset.recipe.trans.scale)

	const partial = applyModel3dViewPreset({ camera: { fov: 48 }, ambientLight: { illuminance: 0.72 } }, 'model3d-view-011').options
	assert.deepEqual(partial.camera.pos, preset.recipe.camera.pos)
	assert.equal(partial.camera.fov, 48)
	assert.deepEqual(partial.ambientLight.color, preset.recipe.ambientLight.color)
	assert.equal(partial.ambientLight.illuminance, 0.72)
	assert.equal(applyModel3dViewPreset({ ptLights: [] }, 'model3d-view-011').options.ptLights.length, 0)
})

test('manual Model 3-D View bounds reject off-grid or unsafe values before mutation', () => {
	const fov = baseSpec([{ kind: 'model3d', name: 'hero', region: 'hero', model: 'model3d://microsoft-stock/example/hero', camera: { fov: 360.1 } }])
	assert.throws(() => buildSpecOperationPlan(fov, { dryRun: true }), /camera\.fov/)
	const rotation = baseSpec([{ kind: 'model3d', name: 'hero', region: 'hero', model: 'model3d://microsoft-stock/example/hero', trans: { rot: { x: 0.00002 } } }])
	assert.throws(() => buildSpecOperationPlan(rotation, { dryRun: true }), /1\/60000-degree step/)
	const lights = baseSpec([{ kind: 'model3d', name: 'hero', region: 'hero', model: 'model3d://microsoft-stock/example/hero', ptLights: [{ intensity: 101 }] }])
	assert.throws(() => buildSpecOperationPlan(lights, { dryRun: true }), /ptLights\[0\]\.intensity/)
	const tooManyLights = baseSpec([{ kind: 'model3d', name: 'hero', region: 'hero', model: 'model3d://microsoft-stock/example/hero', ptLights: [{}, {}, {}, {}] }])
	assert.throws(() => buildSpecOperationPlan(tooManyLights, { dryRun: true }), /at most three point lights/)
})
