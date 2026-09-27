import { WORDART_TRANSFORM_CONTRACT } from './wordart-transform-contract.mjs'

export const TEXT_3D_MATERIALS = Object.freeze([
	'legacyMatte', 'legacyPlastic', 'legacyMetal', 'legacyWireframe',
	'matte', 'plastic', 'metal', 'warmMatte', 'translucentPowder',
	'powder', 'dkEdge', 'softEdge', 'clear', 'flat', 'softmetal',
])

export const TEXT_3D_LIGHT_RIGS = Object.freeze([
	'balanced', 'brightRoom', 'chilly', 'contrasting', 'flat', 'flood',
	'freezing', 'glow', 'harsh', 'legacyFlat1', 'legacyFlat2', 'legacyFlat3',
	'legacyFlat4', 'legacyHarsh1', 'legacyHarsh2', 'legacyHarsh3', 'legacyHarsh4',
	'legacyNormal1', 'legacyNormal2', 'legacyNormal3', 'legacyNormal4', 'morning',
	'soft', 'sunrise', 'sunset', 'threePt', 'twoPt',
])

export const TEXT_3D_BEVEL_PRESETS = Object.freeze([
	'angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross',
	'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound',
])

export const WORDART_TEXT3D_ROW_RECORDS = Object.freeze([
	Object.freeze({ id: 'cap_6c4e13d0580c0c60bec8', label: 'text 3D' }),
	Object.freeze({ id: 'cap_9e4cf4e8605eadf60fc8', label: 'WordArt and Text3D' }),
	Object.freeze({ id: 'cap_abfb261f65c94ea6a56b', label: 'betterpptx-mcp.object.apply_wordart' }),
])
export const WORDART_TEXT3D_ROW_IDS = Object.freeze(WORDART_TEXT3D_ROW_RECORDS.map(record => record.id))
const WORDART_TEXT3D_ROW_ID_SET = new Set(WORDART_TEXT3D_ROW_IDS)
export const WORDART_TEXT3D_RUNTIME_READY = true

const POINT_NATIVE_STEP = 1 / 12700
const ANGLE_NATIVE_STEP = 1 / 60000
const BEVEL_PUBLIC_STEP = POINT_NATIVE_STEP
const LIGHT_DIRECTION_PUBLIC_STEP = ANGLE_NATIVE_STEP
const TEXT_3D_FIELDS = Object.freeze([
	'bevel', 'bevelBottom', 'extrusion', 'extrusionColor', 'contourWidth',
	'contourColor', 'material', 'lightRig', 'lightDirection', 'rotationX',
	'rotationY', 'rotationZ', 'perspective',
])

const bevelSchema = Object.freeze({
	type: ['object', 'null'],
	properties: Object.freeze({
		type: Object.freeze({ type: 'string', enum: TEXT_3D_BEVEL_PRESETS }),
		width: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 1000, multipleOf: BEVEL_PUBLIC_STEP }),
		height: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 1000, multipleOf: BEVEL_PUBLIC_STEP }),
		w: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 1000, multipleOf: BEVEL_PUBLIC_STEP, description: 'Compatibility alias for width.' }),
		h: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 1000, multipleOf: BEVEL_PUBLIC_STEP, description: 'Compatibility alias for height.' }),
	}),
	additionalProperties: false,
})

const rgbHexSchema = Object.freeze({ type: 'string', pattern: '^#?[0-9A-Fa-f]{6}$' })
const colorSchema = Object.freeze({
	oneOf: Object.freeze([
		rgbHexSchema,
		Object.freeze({ type: 'object', properties: Object.freeze({ color: rgbHexSchema, hex: rgbHexSchema, value: rgbHexSchema }), additionalProperties: false }),
		Object.freeze({ type: 'null' }),
	]),
})

const extrusionDepthSchema = Object.freeze({ type: 'number', minimum: 0, maximum: 5000, multipleOf: POINT_NATIVE_STEP })
const extrusionObjectSchema = Object.freeze({
	type: 'object',
	properties: Object.freeze({
		depth: extrusionDepthSchema,
		height: extrusionDepthSchema,
		h: extrusionDepthSchema,
		value: extrusionDepthSchema,
		color: rgbHexSchema,
		extrusionColor: rgbHexSchema,
		hex: rgbHexSchema,
	}),
	additionalProperties: false,
})
const lightDirectionSchema = Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 359, multipleOf: LIGHT_DIRECTION_PUBLIC_STEP })
const lightRigObjectSchema = Object.freeze({
	type: 'object',
	properties: Object.freeze({
		rig: Object.freeze({ type: 'string', enum: TEXT_3D_LIGHT_RIGS }),
		name: Object.freeze({ type: 'string', enum: TEXT_3D_LIGHT_RIGS }),
		value: Object.freeze({ type: 'string', enum: TEXT_3D_LIGHT_RIGS }),
		direction: lightDirectionSchema,
	}),
	additionalProperties: false,
})

export const TEXT_3D_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'],
	description: 'Closed native Text3D format. Every leaf is independently editable; omission preserves and null resets the owned component.',
	properties: Object.freeze({
		bevel: bevelSchema,
		bevelBottom: bevelSchema,
		extrusion: Object.freeze({ oneOf: Object.freeze([
			extrusionDepthSchema,
			extrusionObjectSchema,
			Object.freeze({ type: 'null' }),
		]) }),
		extrusionColor: colorSchema,
		contourWidth: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 1000, multipleOf: POINT_NATIVE_STEP }),
		contourColor: colorSchema,
		material: Object.freeze({ type: ['string', 'null'], enum: Object.freeze([...TEXT_3D_MATERIALS, null]) }),
		lightRig: Object.freeze({ oneOf: Object.freeze([
			Object.freeze({ type: 'string', enum: TEXT_3D_LIGHT_RIGS }),
			lightRigObjectSchema,
			Object.freeze({ type: 'null' }),
		]) }),
		lightDirection: lightDirectionSchema,
		rotationX: Object.freeze({ type: ['number', 'null'], minimum: -360, maximum: 360, multipleOf: ANGLE_NATIVE_STEP }),
		rotationY: Object.freeze({ type: ['number', 'null'], minimum: -360, maximum: 360, multipleOf: ANGLE_NATIVE_STEP }),
		rotationZ: Object.freeze({ type: ['number', 'null'], minimum: -360, maximum: 360, multipleOf: ANGLE_NATIVE_STEP }),
		perspective: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 120, multipleOf: ANGLE_NATIVE_STEP }),
	}),
	additionalProperties: false,
})

const TEXT_3D_EXAMPLE = 'Example: text3D:{ bevel:{ type:"circle", width:4, height:4 }, extrusion:8, extrusionColor:"6D28D9", material:"warmMatte", lightRig:"threePt", rotationX:8, rotationY:12 }.'

function plainObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public Text3D contract.`)
}

function finiteNumber(value, path, { minimum, maximum, step } = {}) {
	let number = value
	if (typeof number === 'string' && number.trim() !== '') number = Number(number)
	if (typeof number !== 'number' || !Number.isFinite(number)) throw new Error(`${path} must be a finite number. ${TEXT_3D_EXAMPLE}`)
	if (minimum !== undefined && number < minimum || maximum !== undefined && number > maximum) throw new Error(`${path} must be between ${minimum} and ${maximum}. ${TEXT_3D_EXAMPLE}`)
	if (step !== undefined) {
		const units = number / step
		if (Math.abs(units - Math.round(units)) > 1e-7) {
			const stepMessage = step === ANGLE_NATIVE_STEP
				? 'the native 1/60000-degree step'
				: (step === POINT_NATIVE_STEP ? 'a native step of 1/12700 point' : `a ${step}-unit native step`)
			throw new Error(`${path} must use ${stepMessage}.`)
		}
	}
	return number
}

function oneAlias(value, keys, path) {
	const present = keys.filter(key => value[key] !== undefined && value[key] !== null)
	if (!present.length) return undefined
	const distinct = new Set(present.map(key => String(value[key])))
	if (distinct.size > 1) throw new Error(`${path} aliases ${present.join(', ')} must agree when supplied together.`)
	return value[present[0]]
}

function color(value, path) {
	if (value === null) return null
	if (plainObject(value)) {
		rejectUnknownKeys(value, ['color', 'hex', 'value'], path)
		value = oneAlias(value, ['color', 'hex', 'value'], path)
	}
	if (typeof value !== 'string' || !/^[0-9a-f]{6}$/i.test(value.replace(/^#/, ''))) throw new Error(`${path} must be a 6-digit RGB hex color string such as "6D28D9". ${TEXT_3D_EXAMPLE}`)
	return value.replace(/^#/, '').toUpperCase()
}

function bevel(value, path) {
	if (value === null) return null
	if (!plainObject(value)) throw new Error(`${path} must be an object with type, width, and height or null. ${TEXT_3D_EXAMPLE}`)
	rejectUnknownKeys(value, ['type', 'width', 'height', 'w', 'h'], path)
	const out = {}
	if (value.type !== undefined && value.type !== null) {
		if (typeof value.type !== 'string' || !TEXT_3D_BEVEL_PRESETS.includes(value.type)) throw new Error(`${path}.type must be one of: ${TEXT_3D_BEVEL_PRESETS.join(', ')}.`)
		out.type = value.type
	} else if (value.type === null) out.type = null
	const widthKeys = ['width', 'w'].filter(key => Object.prototype.hasOwnProperty.call(value, key))
	const heightKeys = ['height', 'h'].filter(key => Object.prototype.hasOwnProperty.call(value, key))
	const width = oneAlias(value, ['width', 'w'], `${path}.width`)
	const height = oneAlias(value, ['height', 'h'], `${path}.height`)
	if (widthKeys.some(key => value[key] === null)) out.width = null
	else if (width !== undefined) out.width = finiteNumber(width, `${path}.width`, { minimum: 0, maximum: 1000, step: BEVEL_PUBLIC_STEP })
	if (heightKeys.some(key => value[key] === null)) out.height = null
	else if (height !== undefined) out.height = finiteNumber(height, `${path}.height`, { minimum: 0, maximum: 1000, step: BEVEL_PUBLIC_STEP })
	return out
}

export function normalizeText3DOptions(value, path = 'text3D') {
	if (value === null) return null
	if (!plainObject(value)) throw new Error(`${path} must be an object or null. ${TEXT_3D_EXAMPLE}`)
	rejectUnknownKeys(value, TEXT_3D_FIELDS, path)
	const out = { ...value }
	if (Object.prototype.hasOwnProperty.call(out, 'bevel')) out.bevel = bevel(out.bevel, `${path}.bevel`)
	if (Object.prototype.hasOwnProperty.call(out, 'bevelBottom')) out.bevelBottom = bevel(out.bevelBottom, `${path}.bevelBottom`)

	if (out.extrusion !== undefined && out.extrusion !== null) {
		if (plainObject(out.extrusion)) {
			rejectUnknownKeys(out.extrusion, ['depth', 'height', 'h', 'value', 'color', 'extrusionColor', 'hex'], `${path}.extrusion`)
			const depth = oneAlias(out.extrusion, ['depth', 'height', 'h', 'value'], `${path}.extrusion.depth`)
			if (depth === undefined) throw new Error(`${path}.extrusion object must include a numeric depth.`)
			const extrusionColor = oneAlias(out.extrusion, ['color', 'extrusionColor', 'hex'], `${path}.extrusion.color`)
			out.extrusion = finiteNumber(depth, `${path}.extrusion.depth`, { minimum: 0, maximum: 5000, step: POINT_NATIVE_STEP })
			if (out.extrusionColor === undefined && extrusionColor !== undefined) out.extrusionColor = color(extrusionColor, `${path}.extrusion.color`)
		} else {
			out.extrusion = finiteNumber(out.extrusion, `${path}.extrusion`, { minimum: 0, maximum: 5000, step: POINT_NATIVE_STEP })
		}
	}
	if (out.extrusionColor !== undefined && out.extrusionColor !== null) out.extrusionColor = color(out.extrusionColor, `${path}.extrusionColor`)
	if (out.contourWidth !== undefined && out.contourWidth !== null) out.contourWidth = finiteNumber(out.contourWidth, `${path}.contourWidth`, { minimum: 0, maximum: 1000, step: POINT_NATIVE_STEP })
	if (out.contourColor !== undefined && out.contourColor !== null) out.contourColor = color(out.contourColor, `${path}.contourColor`)

	if (out.lightRig !== undefined && out.lightRig !== null) {
		if (plainObject(out.lightRig)) {
			rejectUnknownKeys(out.lightRig, ['rig', 'name', 'value', 'direction'], `${path}.lightRig`)
			const nestedDirection = out.lightRig.direction
			const rig = oneAlias(out.lightRig, ['rig', 'name', 'value'], `${path}.lightRig`)
			if (out.lightDirection !== undefined && nestedDirection !== undefined && Number(out.lightDirection) !== Number(nestedDirection)) throw new Error(`${path}.lightRig.direction and ${path}.lightDirection must agree when supplied together.`)
			if (out.lightDirection === undefined && nestedDirection !== undefined) out.lightDirection = nestedDirection
			out.lightRig = rig
		}
		if (typeof out.lightRig !== 'string' || !TEXT_3D_LIGHT_RIGS.includes(out.lightRig)) throw new Error(`${path}.lightRig must be one of: ${TEXT_3D_LIGHT_RIGS.join(', ')}.`)
	}
	if (out.material !== undefined && out.material !== null && (typeof out.material !== 'string' || !TEXT_3D_MATERIALS.includes(out.material))) throw new Error(`${path}.material must be one of: ${TEXT_3D_MATERIALS.join(', ')}.`)
	if (out.lightDirection !== undefined && out.lightDirection !== null) out.lightDirection = finiteNumber(out.lightDirection, `${path}.lightDirection`, { minimum: 0, maximum: 359, step: LIGHT_DIRECTION_PUBLIC_STEP })
	for (const key of ['rotationX', 'rotationY', 'rotationZ']) {
		if (out[key] !== undefined && out[key] !== null) out[key] = finiteNumber(out[key], `${path}.${key}`, { minimum: -360, maximum: 360, step: ANGLE_NATIVE_STEP })
	}
	if (out.perspective !== undefined && out.perspective !== null) out.perspective = finiteNumber(out.perspective, `${path}.perspective`, { minimum: 0, maximum: 120, step: ANGLE_NATIVE_STEP })
	return out
}

export const WORDART_TEXT3D_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.wordart-text3d-contract.v1',
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: WORDART_TEXT3D_RUNTIME_READY ? 'executable-exact-structured' : 'structured-partial',
	targetCapabilityStatus: 'executable-exact-structured',
	runtimeIntegrationComplete: WORDART_TEXT3D_RUNTIME_READY,
	componentOwnership: Object.freeze(['textFill', 'textOutline', 'textEffects', 'wordArt', 'text3D']),
	overrideFields: Object.freeze([
		'wordArtStylePresetId', 'textEffectPresetIds', 'style.textFill', 'style.textOutline',
		'style.textShadow', 'style.textGlow', 'style.textReflection', 'style.wordArt', 'style.text3D',
	]),
	resetBehavior: Object.freeze({
		component: 'set wordArt, text3D, or a named Text3D leaf to null; omission preserves the existing authored component',
		full: 'set wordArtStylePresetId, textEffectPresetIds, wordArt, and text3D to null to remove the complete authored WordArt/Text3D treatment',
		nullBehavior: 'component null removes only that authored native carrier and retains unrelated text style and content',
	}),
	precedence: Object.freeze([
		'wordArtStylePresetId supplies the native WordArt style base',
		'ordered textEffectPresetIds compose after the style base',
		'explicit text fill, outline, effects, WordArt transform, and Text3D leaves apply last',
		'sparse component null reset removes only the named authored leaf',
	]),
	legalCombinations: Object.freeze([
		'all 41 canonical WordArt transforms with zero or one applicable native guide',
		'top and bottom bevel with extrusion, contour, material, lighting, camera rotation, and perspective',
		'WordArt style plus ordered text-effect presets plus explicit text and 3-D overrides',
		'combined WordArt and Text3D use fit none or shrink; fit resize is rejected because PowerPoint renders the combined native carrier invisible',
		'component reset, full reset, export/recompile, and imported structured edit takeover',
	]),
	rowIds: WORDART_TEXT3D_ROW_IDS,
	wordArtTransformContract: WORDART_TRANSFORM_CONTRACT,
	text3DSchema: TEXT_3D_PUBLIC_SCHEMA,
})

export function wordArtText3DCapabilityContractForEntry(entry = {}) {
	if (entry.family !== 'wordart-text3d' || !WORDART_TEXT3D_ROW_ID_SET.has(entry.id)) return null
	return WORDART_TEXT3D_CONTRACT
}
