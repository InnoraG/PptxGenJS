// Closed public contract for native 3-D model authoring. The exact row list is
// intentionally frozen: broad historical labels ("ambient light", "GLB
// insertion", etc.) all lower to one executable model3d carrier, while the
// separate asset-generation operations remain host commands in their own unit.
import { MODEL3D_VIEW_PRESETS } from './model3d-view-presets.mjs'
import { isDeepStrictEqual } from 'node:util'
import { PREPARED_MOTION_SCENE_SCHEMA } from './prepared-motion-scene-contract.mjs'
import { STATIC_POSE_PUBLIC_SCHEMA, normalizeStaticPose, normalizeStaticPoseScene } from './presenter-static-pose-contract.mjs'
import { MODEL3D_MOTION_FRAMING_PUBLIC_SCHEMA, validateModel3dMotionFramingOptions } from './model3d-motion-framing-contract.mjs'

export const MODEL3D_AUTHORING_UNIT_ID = 'impl-d-236b70e74e5cbb40'
export const MODEL3D_AUTHORING_SCHEMA_VERSION = 'betterpptx.model3d-authoring-family.v1'

export const MODEL3D_AUTHORING_ROW_IDS = Object.freeze([
	'cap_09f6dfbdf1cefd466bfe', 'cap_0f5c2935d48ed01ce268', 'cap_25f328be59ec44079025',
	'cap_2e191b10c3cb0756ffb3', 'cap_3af1a12068e8e95b0af7', 'cap_6045e907f84585164aad',
	'cap_75c20e4fd05fcef1ea58', 'cap_942960c4e7c1015b53f4', 'cap_c0a19483af5983a2c3c9',
	'cap_c2d56410058853af547e', 'cap_c62a2a2c3233364c8661', 'cap_d50c5ab714db57c351c9',
	'cap_f934f15f60a24c836ce0', 'cap_5d9947c7e36a7c153459',
])

// Keep the selector enum synchronized with the generated exact 18-tile capture.
export const MODEL3D_VIEW_PRESET_IDS = Object.freeze(MODEL3D_VIEW_PRESETS.map(item => item.id))

const nullable = schema => ({ anyOf: [schema, { type: 'null' }] })
const finiteNumber = (minimum, maximum) => ({ type: ['number', 'null'], minimum, maximum })
const integer = (minimum, maximum) => ({ type: ['integer', 'null'], minimum, maximum })
const vector = { type: ['object', 'null'], additionalProperties: false, properties: { x: integer(-2147483648, 2147483647), y: integer(-2147483648, 2147483647), z: integer(-2147483648, 2147483647) } }
const nativeVector = { type: ['object', 'null'], additionalProperties: false, properties: { dx: integer(-2147483648, 2147483647), dy: integer(-2147483648, 2147483647), dz: integer(-2147483648, 2147483647) } }
const color = { type: ['object', 'null'], additionalProperties: false, properties: { r: finiteNumber(0, 100000), g: finiteNumber(0, 100000), b: finiteNumber(0, 100000) } }

export const MODEL3D_VIEW_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'],
	additionalProperties: false,
	properties: {
		camera: { type: ['object', 'null'], additionalProperties: false, properties: { pos: vector, fov: finiteNumber(0.01, 21600000) } },
		trans: { type: ['object', 'null'], additionalProperties: false, properties: {
			meterPerModelUnit: { type: ['object', 'null'], additionalProperties: false, properties: { n: integer(1, 2147483647), d: integer(1, 2147483647) } },
			preTrans: nativeVector,
			scale: { type: ['object', 'null'], additionalProperties: false, properties: { x: finiteNumber(0, 100000000), y: finiteNumber(0, 100000000), z: finiteNumber(0, 100000000), sx: finiteNumber(0, 100000000), sy: finiteNumber(0, 100000000), sz: finiteNumber(0, 100000000) } },
			rot: { type: ['object', 'null'], additionalProperties: false, properties: { x: finiteNumber(-360, 360), y: finiteNumber(-360, 360), z: finiteNumber(-360, 360), ax: integer(-21600000, 21600000), ay: integer(-21600000, 21600000), az: integer(-21600000, 21600000) } },
			postTrans: nativeVector,
		} },
		ambientLight: { type: ['object', 'null'], additionalProperties: false, properties: { color, illuminance: finiteNumber(0, 100) } },
		ptLights: { type: ['array', 'null'], maxItems: 3, items: { type: 'object', additionalProperties: false, properties: { color, intensity: finiteNumber(0, 100), pos: vector } } },
		objViewport: integer(1, 2147483647),
	},
})

export const MODEL3D_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'],
	additionalProperties: false,
	properties: {
		x: { type: ['number', 'null'] }, y: { type: ['number', 'null'] }, w: { type: ['number', 'null'], exclusiveMinimum: 0 }, h: { type: ['number', 'null'], exclusiveMinimum: 0 },
		objectName: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, altText: { type: ['string', 'null'], maxLength: 4096 }, accessibilityTitle: { type: ['string', 'null'], maxLength: 4096 }, isDecorative: { type: ['boolean', 'null'] },
		modelAsset: { type: ['string', 'null'], minLength: 1, maxLength: 4096 },
		posterAsset: { type: ['string', 'null'], minLength: 1, maxLength: 4096 },
		staticPose: STATIC_POSE_PUBLIC_SCHEMA,
		motionFraming: MODEL3D_MOTION_FRAMING_PUBLIC_SCHEMA,
		model3dViewPresetId: { type: ['string', 'null'], enum: [...MODEL3D_VIEW_PRESET_IDS, null] },
		nativeOnly: { type: ['boolean', 'null'] },
		rotate: finiteNumber(-360, 360),
		flipH: { type: ['boolean', 'null'] }, flipV: { type: ['boolean', 'null'] },
		shadow: { type: ['object', 'null'] }, scene: { type: ['object', 'null'], additionalProperties: false, properties: { animId: { type: ['integer', 'null'], minimum: 0 }, preparedVariantId: PREPARED_MOTION_SCENE_SCHEMA, motionId: { ...STATIC_POSE_PUBLIC_SCHEMA.properties.motionId, description: 'Exact playback motion for an approved ordinary model with staticPose or its null reset. Playback begins at the original motion start; the static pose does not offset it.' }, length: { type: ['number', 'null'], minimum: 0 }, loop: { type: ['boolean', 'null'] } } },
		...MODEL3D_VIEW_OPTIONS_PUBLIC_SCHEMA.properties,
	},
})

export const MODEL3D_AUTHORING_CAPABILITY_CONTRACT = Object.freeze({
	id: 'model3dAuthoringFamily',
	schemaVersion: MODEL3D_AUTHORING_SCHEMA_VERSION,
	unitId: MODEL3D_AUTHORING_UNIT_ID,
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: 'executable-exact-structured',
	runtimeIntegrationComplete: true,
	componentOwnership: Object.freeze(['modelAsset', 'camera', 'transform', 'lighting', 'viewport', 'scene', 'motionFraming']),
	overrideFields: Object.freeze(['model3dViewPresetId', 'camera', 'trans', 'ambientLight', 'ptLights', 'objViewport', 'shadow', 'rotate', 'flipH', 'flipV', 'scene', 'nativeOnly', 'posterAsset', 'motionFraming']),
	resetBehavior: Object.freeze({
		component: 'set one camera/trans/light/viewport field to null or omit it to restore the selected tile/default',
		full: 'set model3dViewPresetId to null and remove manual model/view fields',
		nullBehavior: 'remove the named manual override while preserving the selected gallery tile and its portable native component',
	}),
	precedence: Object.freeze(['explicit object field', 'modelOptions field', 'selected model3d view preset', 'native serializer default']),
	legalCombinations: Object.freeze([
		'exact model3dViewPresetId with zero or more typed camera/trans/light/viewport overrides',
		'ptLights omitted for native defaults or explicitly supplied with zero through three lights',
		'nativeOnly true without a raster fallback, or nativeOnly false with an authorized poster asset',
		'rotate and flip applied to the native frame and compatibility fallback together',
		'one optional embedded scene animation selection per model',
		'opt-in selected-animation motion framing with an explicit scene, instead of manual camera/transform/viewport or a view preset; null restores ordinary framing',
	]),
	applicability: Object.freeze(['direct betterpptx.slide.add_model3d', 'deck-spec model3d block', 'native model3d replay with an authorized asset handle']),
	limitation: 'Imported model3d carriers without a durable public asset handle remain opaque-preserved for exact package fidelity; typed edits require a semantic modelAsset and rebuild the native carrier.',
	publicSchema: MODEL3D_OPTIONS_PUBLIC_SCHEMA,
})

export function model3dAuthoringCapabilityContractForEntry(entry = {}) {
	return MODEL3D_AUTHORING_ROW_IDS.includes(String(entry.id || '')) ? MODEL3D_AUTHORING_CAPABILITY_CONTRACT : null
}

export function normalizeModel3dOptions(value, path = 'model3d.options') {
	if (value == null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	for (const key of Object.keys(value)) {
		if (!Object.prototype.hasOwnProperty.call(MODEL3D_OPTIONS_PUBLIC_SCHEMA.properties, key)) throw new Error(`${path}.${key} is not part of the public Model 3-D contract.`)
	}
	if (value.model3dViewPresetId != null && !MODEL3D_VIEW_PRESET_IDS.includes(String(value.model3dViewPresetId))) throw new Error(`${path}.model3dViewPresetId must be one of the captured native view IDs.`)
	if (Object.prototype.hasOwnProperty.call(value, 'staticPose')) normalizeStaticPose(value.staticPose, `${path}.staticPose`)
	const scene = normalizeStaticPoseScene(value.scene, value.staticPose)
	validateModel3dMotionFramingOptions({ ...value, scene }, path)
	return structuredClone(value)
}

// Public aliases lower to the same typed object fields before layout and on
// portable export. Raw provider/library options remain outside this contract.
export function normalizeModel3dControlsInSpec(input) {
	const spec = structuredClone(input)
	const visit = (value, path) => {
		if (!value || typeof value !== 'object') return
		if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${path}[${index}]`)); return }
		if (value.kind === 'model3d') {
			for (const alias of ['modelOptions', 'model3dOptions']) {
				if (value[alias] == null) { delete value[alias]; continue }
				const controls = normalizeModel3dOptions(value[alias], `${path}.${alias}`)
				for (const [key, control] of Object.entries(controls)) {
					if (Object.hasOwn(value, key) && !isDeepStrictEqual(value[key], control)) throw new Error(`${path}.${key} conflicts with ${alias}.${key}.`)
					value[key] = control
				}
				delete value[alias]
			}
		}
		for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`)
	}
	visit(spec, 'spec')
	return spec
}
