import { Model3DProps } from './core-interfaces'

/** Validate the independent idle-frame selector without activating embedded playback. */
export function validateModel3DPosterFrame(options: Model3DProps): void {
	const scene = options.scene
	if (scene?.playbackMetadata !== undefined && typeof scene.playbackMetadata !== 'boolean') throw new Error('Model3D scene.playbackMetadata must be boolean.')
	if (scene?.playbackMetadata === true) {
		if (!Number.isInteger(scene.animId) || scene.animId < 0 || scene.animId > 4294967295 ||
			!Number.isSafeInteger(scene.length) || scene.length <= 0 ||
			(scene.loop !== undefined && typeof scene.loop !== 'boolean')) {
			throw new Error('Model3D playbackMetadata requires an unsigned 32-bit animId, positive integer length in milliseconds, and optional boolean loop.')
		}
		if (options._model3dXml) throw new Error('Model3D playbackMetadata cannot be combined with raw model XML.')
	}
	if (options.posterFrame === undefined) return
	const value = options.posterFrame
	if (!value || typeof value !== 'object' || Array.isArray(value) ||
		!Number.isInteger(value.animId) || value.animId < 0 || value.animId > 4294967295 ||
		typeof value.progress !== 'number' || !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 1) {
		throw new Error('Model3D posterFrame requires an unsigned 32-bit animId and finite numeric progress between 0 and 1.')
	}
	if (options._model3dXml) throw new Error('Model3D posterFrame cannot be combined with raw model XML.')
}
