// Public intent only. Asset sampling and its diagnostic report stay private.
export const MODEL3D_MOTION_FRAMING_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'], additionalProperties: false, required: ['mode'],
	properties: {
		mode: { type: 'string', enum: ['selected-animation'] },
		paddingFraction: { type: 'number', minimum: 0.02, maximum: 0.3, description: 'Empty fraction on each edge of the model frame; defaults to 0.08.' },
		yawDegrees: { type: 'number', minimum: -360, maximum: 360, description: 'Horizontal viewing rotation in degrees; defaults to zero.' },
		fovDegrees: { type: 'number', minimum: 1, maximum: 120, description: 'Perspective field of view in degrees; defaults to 45.' },
	},
	description: 'Opt in to framing the selected motion and its stopped pose. Requires a selected model scene and no manual camera, transform, viewport, or view preset. Null restores ordinary framing. Native playback review remains required.',
})

export function motionFramingError(message, code = 'MODEL3D_MOTION_FRAMING_INVALID') {
	const error = new Error(message); error.code = code; return error
}

export function normalizeModel3dMotionFraming(value, path = 'motionFraming') {
	if (value == null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw motionFramingError(`${path} must be an object or null.`)
	for (const key of Object.keys(value)) if (!Object.hasOwn(MODEL3D_MOTION_FRAMING_PUBLIC_SCHEMA.properties, key)) throw motionFramingError(`${path}.${key} is not a supported motion-framing control.`)
	if (value.mode !== 'selected-animation') throw motionFramingError(`${path}.mode must be selected-animation.`)
	for (const [key, min, max] of [['paddingFraction', 0.02, 0.3], ['yawDegrees', -360, 360], ['fovDegrees', 1, 120]]) {
		if (value[key] === undefined) continue
		if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw motionFramingError(`${path}.${key} must be a finite number from ${min} to ${max}.`)
		if (key !== 'paddingFraction' && Math.abs(value[key] * 60000 - Math.round(value[key] * 60000)) > 1e-6) throw motionFramingError(`${path}.${key} must use 1/60000-degree steps.`)
	}
	return structuredClone(value)
}

export function model3dMotionFraming(block = {}, path = 'model3d') {
	const holders = [block, block.modelOptions, block.model3dOptions].filter(value => value && Object.hasOwn(value, 'motionFraming'))
	if (!holders.length) return undefined
	const values = holders.map(value => normalizeModel3dMotionFraming(value.motionFraming, `${path}.motionFraming`))
	const signature = value => value == null ? value : JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
	if (values.some(value => signature(value) !== signature(values[0]))) throw motionFramingError(`${path}.motionFraming has conflicting authoring locations.`, 'MODEL3D_MOTION_FRAMING_CONFLICT')
	return values[0]
}

export function validateModel3dMotionFramingOptions(options = {}, path = 'model3d') {
	const framing = normalizeModel3dMotionFraming(options.motionFraming, `${path}.motionFraming`)
	if (!framing) return framing
	for (const key of ['camera', 'trans', 'objViewport', 'model3dViewPresetId']) if (options[key] != null) throw motionFramingError(`${path}.motionFraming cannot be combined with manual ${key}.`, 'MODEL3D_MOTION_FRAMING_CONFLICT')
	if (!Number.isInteger(options.scene?.animId) || options.scene.animId < 0) throw motionFramingError(`${path}.motionFraming requires one selected model motion.`, 'MODEL3D_MOTION_FRAMING_SCENE_REQUIRED')
	return framing
}
