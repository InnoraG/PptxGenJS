import assert from 'node:assert/strict'
import test from 'node:test'
import { applyShapeEffectPresets, applyTextEffectPresets } from '../native-effect-presets.mjs'
import { listOptionCatalog } from '../option-registry.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

test('shape-effect preset is a native base and typed 3-D fields override it', () => {
	const result = applyShapeEffectPresets({
		effect3D: {
			rotationX: 12,
			rotationY: 34,
			material: 'metal',
			extrusion: 9,
			lightDirection: 25,
		},
	}, ['shape-effect-preset-002']).style
	assert.deepEqual(result.effect3D, { rotationX: 12, rotationY: 34, material: 'metal', extrusion: 9, lightDirection: 25 })
	assert.match(result._rawSpPrScene3dXml, /camera prst="legacyObliqueTopRight"/)
	assert.match(result._rawSpPrScene3dXml, /lat="2040000"/)
	assert.match(result._rawSpPrScene3dXml, /lon="20880000"/)
	assert.match(result._rawSpPrScene3dXml, /rig="threePt"/)
	assert.match(result._rawSpPrScene3dXml, /rev="1500000"/)
	assert.match(result._rawSpPrScene3dXml, /extrusionH="114300"/)
	assert.match(result._rawSpPrScene3dXml, /prstMaterial="metal"/)
})

test('partial camera rotations become a complete Office-safe tuple', () => {
	const result = applyShapeEffectPresets({ effect3D: { rotationX: -15, rotationY: 22, material: 'plastic' } }, ['shape-effect-preset-003']).style
	assert.match(result._rawSpPrScene3dXml, /lat="1320000"/)
	assert.match(result._rawSpPrScene3dXml, /lon="900000"/)
	assert.match(result._rawSpPrScene3dXml, /rev="0"/)
})

test('typed effect overrides replace captured native effect fragments and preserve reset semantics', () => {
	const shape = applyShapeEffectPresets({ shadow: { blur: 11, offset: 7, angle: 123, color: 'FF0000', opacity: 0.3 } }, ['shape-effect-shadow-002']).style
	assert.match(shape._rawEffectLstXml, /outerShdw blurRad="139700" dist="88900" dir="7380000"/)
	assert.match(shape._rawEffectLstXml, /srgbClr val="FF0000"><a:alpha val="30000"/)
	const reset = applyShapeEffectPresets({ shadow: { type: 'none' } }, ['shape-effect-shadow-002']).style
	assert.doesNotMatch(reset._rawEffectLstXml || '', /outerShdw|innerShdw/)
	const text = applyTextEffectPresets({ textGlow: { size: 11, color: 'FF0000', opacity: 0.3 } }, ['text-effect-glow-003']).style
	assert.match(text._rawRprEffectXmlExact, /glow rad="139700"/)
	assert.match(text._rawRprEffectXmlExact, /srgbClr val="FF0000"><a:alpha val="30000"/)
})

test('public shape-effect catalog exposes preset-plus-parameters and independent rotation axes', () => {
	const catalog = listOptionCatalog({ surface: 'shapeEffectPreset', format: 'full' })
	const surface = catalog.surfaces.find(item => item.id === 'shapeEffectPreset')
	assert.ok(surface)
	assert.equal(surface.capabilityMode, 'preset-plus-parameters')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.ok(surface.overrideFields.includes('style.effect3D'))
	const shape3d = surface.parameters.find(item => item.id === 'shape3D')
	assert.ok(shape3d)
	assert.deepEqual(shape3d.parameters.filter(item => /^rotation[XYZ]$/.test(item.id)).map(item => item.id), ['rotationX', 'rotationY', 'rotationZ'])
	assert.equal(shape3d.parameters.find(item => item.id === 'rotationX').step, 1 / 60000)
})

test('style and text-effect galleries expose typed override contracts', () => {
	for (const surfaceId of ['shapeStylePreset', 'wordArtStylePreset', 'textEffectPreset']) {
		const catalog = listOptionCatalog({ surface: surfaceId, format: 'full' })
		const surface = catalog.surfaces.find(item => item.id === surfaceId)
		assert.equal(surface.capabilityMode, 'preset-plus-parameters')
		assert.equal(surface.capabilityStatus, 'executable-exact-structured')
		assert.ok(Array.isArray(surface.parameters) && surface.parameters.length > 0)
		assert.ok(surface.overrideFields.length > 0)
	}
})

test('Director dry-run rejects an off-grid 3-D rotation before commit', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'authors', outcome: 'prove', remember: 'native' },
		visualDesign: { world: 'blueprint', framing: 'shape' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
		motionTime: { masterClock: 'authored', timingSource: 'static', syncPolicy: 'one' },
		layout: 'LAYOUT_WIDE',
		slides: [{ id: 's', content: [{ kind: 'shape', name: 'bad', shapeName: 'roundRect', style: { effect3D: { rotationX: 0.000001 } } }] }],
	}
	assert.throws(() => buildSpecOperationPlan(spec, { phase: 'dryRun', plan: 'free', detail: 'full' }), /1\/60000-degree step/)
})
