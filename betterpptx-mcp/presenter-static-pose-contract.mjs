// A static/edit posture is independent of the native scene playback clock.
export const ORDINARY_STATIC_POSE_MOTIONS = Object.freeze([
	'idle', 'talk', 'greet', 'point', 'emphasize', 'magnitude', 'contrast', 'enumerate', 'ask',
	'present', 'agree', 'bow', 'think', 'disagree', 'happy', 'surprise', 'walk', 'clap',
].map(intent => `motion.ordinary.${intent}`))

export const STATIC_POSE_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'], additionalProperties: false, required: ['motionId', 'timeMs'],
	description: 'Stopped/edit-view posture sampled from an approved ordinary presenter motion. It does not set playback start time, change motion speed, or change placement. timeMs must lie inside the selected motion. Null restores the original safe opening pose. Custom or rebuilt motion banks are not supported.',
	properties: {
		motionId: { type: 'string', enum: [...ORDINARY_STATIC_POSE_MOTIONS], description: 'Exact ordinary motion from which to sample the stopped pose.' },
		timeMs: { type: 'number', minimum: 0, description: 'Sample time within that motion, in milliseconds; not a playback offset.' },
	},
})

export function staticPoseError(code, message) {
	const error = new Error(message)
	error.code = code
	return error
}

export function normalizeStaticPose(value, field = 'staticPose') {
	if (value === undefined || value === null) return value
	if (!value || typeof value !== 'object' || Array.isArray(value)
		|| Object.keys(value).some(key => !['motionId', 'timeMs'].includes(key))
		|| !Object.prototype.hasOwnProperty.call(value, 'motionId')
		|| !Object.prototype.hasOwnProperty.call(value, 'timeMs')) {
		throw staticPoseError('STATIC_POSE_INVALID', `${field} must contain only motionId and timeMs, or be null.`)
	}
	if (!ORDINARY_STATIC_POSE_MOTIONS.includes(value.motionId)) {
		throw staticPoseError('STATIC_POSE_MOTION_UNSUPPORTED', `${field}.motionId must name a supported motion.ordinary motion; custom and rebuilt motion banks are not supported.`)
	}
	if (typeof value.timeMs !== 'number' || !Number.isFinite(value.timeMs) || value.timeMs < 0) {
		throw staticPoseError('STATIC_POSE_TIME_INVALID', `${field}.timeMs must be a finite nonnegative number within the selected motion.`)
	}
	return { motionId: value.motionId, timeMs: value.timeMs }
}

export function model3dStaticPose(block, field = 'model3d') {
	const authored = [
		['staticPose', block?.staticPose],
		['modelOptions.staticPose', block?.modelOptions?.staticPose],
		['model3dOptions.staticPose', block?.model3dOptions?.staticPose],
	].filter(([, value]) => value !== undefined)
	const normalized = authored.map(([name, value]) => normalizeStaticPose(value, `${field}.${name}`))
	if (normalized.some(value => JSON.stringify(value) !== JSON.stringify(normalized[0]))) {
		throw staticPoseError('STATIC_POSE_CONFLICT', `${field} has conflicting staticPose fields. Supply the pose once, separately from scene playback.`)
	}
	return normalized[0]
}

// A public semantic scene ID survives result redaction. Only the approved
// ordinary-pose lane can resolve it, and the compiler/engine must validate the
// original asset before executing this mapping. This never changes timing.
export function normalizeStaticPoseScene(scene, staticPose) {
	if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return scene
	if (staticPose === undefined) {
		if (scene.motionId !== undefined) throw staticPoseError('STATIC_POSE_SCENE_UNSUPPORTED', 'scene.motionId requires an approved ordinary model with an explicit staticPose request or null reset.')
		return scene
	}
	let index = scene.animId
	if (scene.motionId !== undefined) {
		const selected = ORDINARY_STATIC_POSE_MOTIONS.indexOf(scene.motionId)
		if (selected < 0) throw staticPoseError('STATIC_POSE_SCENE_UNSUPPORTED', 'scene.motionId must select an existing motion.ordinary motion from the unchanged approved model.')
		if (index !== undefined && index !== null && index !== selected) throw staticPoseError('STATIC_POSE_SCENE_CONFLICT', 'The semantic scene motion conflicts with the supplied scene selection.')
		index = selected
	}
	if (index === undefined || index === null) return scene
	if (!Number.isInteger(index) || !ORDINARY_STATIC_POSE_MOTIONS[index]) throw staticPoseError('STATIC_POSE_SCENE_UNSUPPORTED', 'The scene must select an existing motion from the approved ordinary model.')
	return { ...scene, animId: index, motionId: ORDINARY_STATIC_POSE_MOTIONS[index] }
}

export function clipMapForOrdinaryStaticPose(clipMap, staticPose) {
	if (staticPose === undefined) return clipMap
	const aliases = Object.fromEntries(ORDINARY_STATIC_POSE_MOTIONS.map((motionId, index) => [motionId, index]))
	for (const [motionId, index] of Object.entries(aliases)) {
		if (clipMap?.[motionId] !== undefined && clipMap[motionId] !== index) throw staticPoseError('STATIC_POSE_SCENE_CONFLICT', 'An exact ordinary motion ID cannot be remapped while using the approved static-pose source.')
	}
	return { ...clipMap, ...aliases }
}
