import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Tolerant ingestion contract for a user-owned presenter identity.
 *
 * This module deliberately does not enhance, restyle, or rewrite a face. It
 * evaluates measurements produced by the selected detector/segmenter and
 * returns a warning-oriented decision. The original uploads remain the
 * authoritative identity assets; Meshy receives only the body branch.
 */

export const PRESENTER_INGESTION_SCHEMA = 'betterpptx.presenter-ingestion.v1'

export const PRESENTER_INGESTION_POLICY = Object.freeze({
	maxBodyViews: 4,
	minFacePixelsRecommended: 256,
	minFacePixelsFallback: 160,
	preferredBodyViews: ['front', 'three-quarter', 'side', 'back'],
	mesh: {
		imageEnhancement: false,
		removeLighting: false,
		backgroundOperation: 'alpha-only',
		poseDelegation: 'meshy-pose-mode',
	},
	face: {
		identitySource: 'original-upload-or-deterministic-crop',
		forbiddenOperations: ['generative-restyle', 'beautify', 'face-repair', 'mesh-texture-roundtrip'],
	},
})

const severity = Object.freeze({ info: 0, warning: 1, blocker: 2 })

function issue(code, level, message, details = {}) {
	return { code, level, message, ...details }
}

function hashBytes(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function readPngDimensions(bytes) {
	if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mime: 'image/png' }
}

function readJpegDimensions(bytes) {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
	let offset = 2
	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) { offset += 1; continue }
		const marker = bytes[offset + 1]
		offset += 2
		if (marker === 0xd8 || marker === 0xd9) continue
		if (offset + 2 > bytes.length) break
		const segmentLength = bytes.readUInt16BE(offset)
		if (segmentLength < 2 || offset + segmentLength > bytes.length) break
		const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
			(marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
		if (isSof && segmentLength >= 7) {
			return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3), mime: 'image/jpeg' }
		}
		offset += segmentLength
	}
	return null
}

export function inspectImageBytes(bytes, filename = 'upload') {
	if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
		throw new TypeError('Image bytes must be a Buffer or Uint8Array.')
	}
	const buffer = Buffer.from(bytes)
	const dimensions = readPngDimensions(buffer) || readJpegDimensions(buffer)
	if (!dimensions) throw new Error(`Unsupported or unreadable image: ${filename}`)
	return {
		filename: path.basename(String(filename)),
		bytes: buffer.length,
		sha256: hashBytes(buffer),
		...dimensions,
	}
}

export async function inspectImageFile(filePath) {
	const bytes = await fs.readFile(filePath)
	return inspectImageBytes(bytes, filePath)
}

function numberOrNull(value) {
	return Number.isFinite(Number(value)) ? Number(value) : null
}

function evaluateView(view, { role = 'body', index = 0 } = {}) {
	const analysis = view.analysis || {}
	const meta = view.image || null
	const issues = []
	if (!meta) issues.push(issue('IMAGE_METADATA_MISSING', 'blocker', 'The upload could not be decoded.', { index }))
	const subjectCount = numberOrNull(analysis.subjectCount)
	if (subjectCount !== null && subjectCount !== 1) {
		issues.push(issue('SUBJECT_COUNT_UNRESOLVED', 'blocker', 'Exactly one selected subject is required for an unambiguous identity.', { index, subjectCount }))
	}
	if (role === 'body') {
		if (analysis.fullBodyVisible === false) {
			issues.push(issue('FULL_BODY_NOT_VISIBLE', 'warning', 'The body reference is incomplete for high-confidence 3D authoring; the talking-head branch can still proceed and Meshy may be retried with a better view.', { index }))
		}
		const bodyCoverage = numberOrNull(analysis.bodyCoverage)
		if (bodyCoverage !== null && bodyCoverage < 0.45) {
			issues.push(issue('BODY_FRAMING_TIGHT', 'warning', 'The body is tightly framed; Meshy may have to infer missing proportions.', { index, bodyCoverage }))
		}
		const pose = String(analysis.pose || '').toLowerCase()
		if (pose && !['a-pose', 't-pose'].includes(pose)) {
			issues.push(issue('POSE_NOT_A_OR_T', 'warning', 'The pose is usable but not the preferred A/T pose for rigging; Meshy pose control can be used.', { index, pose }))
		}
	}
	const facePixels = numberOrNull(analysis.facePixels)
	if (facePixels !== null && facePixels < PRESENTER_INGESTION_POLICY.minFacePixelsRecommended) {
		const level = facePixels >= PRESENTER_INGESTION_POLICY.minFacePixelsFallback ? 'warning' : 'blocker'
		issues.push(issue('FACE_DETAIL_LOW', level, level === 'blocker'
			? 'No reliable face detail is available for a talking-head crop.'
			: 'Face detail is below the recommended level; a dedicated face image is recommended.', { index, facePixels }))
	}
	const clipping = numberOrNull(analysis.exposureClippingRatio)
	if (clipping !== null && clipping > 0.08) issues.push(issue('EXPOSURE_CLIPPING', 'warning', 'Some highlights or shadows are clipped; no automatic face retouching will be applied.', { index, clipping }))
	const blur = numberOrNull(analysis.blurScore)
	if (blur !== null && blur < 25) issues.push(issue('MOTION_OR_FOCUS_BLUR', 'warning', 'The image is soft; it may still be accepted, but output quality can be lower.', { index, blur }))
	const segmentation = numberOrNull(analysis.segmentationConfidence)
	if (segmentation !== null && segmentation < 0.7) issues.push(issue('SEGMENTATION_UNCERTAIN', 'warning', 'Background removal is uncertain; the original image will be retained as a fallback.', { index, segmentation }))
	return issues
}

export function makeDeterministicFaceCropSpec({ width, height, bbox, expansion = 1.6 } = {}) {
	if (![width, height].every(value => Number.isFinite(Number(value)) && Number(value) > 0)) {
		throw new Error('Face crop requires positive source dimensions.')
	}
	if (!bbox || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(Number(bbox[key])) && Number(bbox[key]) > 0)) {
		throw new Error('Face crop requires a detector bounding box.')
	}
	const side = Math.max(Number(bbox.width), Number(bbox.height)) * Number(expansion)
	const cx = Number(bbox.x) + Number(bbox.width) / 2
	const cy = Number(bbox.y) + Number(bbox.height) / 2
	const left = Math.max(0, Math.round(cx - side / 2))
	const top = Math.max(0, Math.round(cy - side / 2))
	const right = Math.min(Number(width), Math.round(cx + side / 2))
	const bottom = Math.min(Number(height), Math.round(cy + side / 2))
	return {
		operation: 'crop-pad-resize-only',
		source: { width: Number(width), height: Number(height) },
		bbox: { x: Number(bbox.x), y: Number(bbox.y), width: Number(bbox.width), height: Number(bbox.height) },
		crop: { left, top, right, bottom, width: right - left, height: bottom - top },
		identitySafe: true,
		forbidden: PRESENTER_INGESTION_POLICY.face.forbiddenOperations,
	}
}

function assertMeshyImageReference(value, index) {
	const reference = String(value || '')
	if (/^https:\/\//i.test(reference) || /^data:image\/(png|jpeg|jpg);base64,/i.test(reference)) return reference
	throw new Error(`Meshy image reference ${index + 1} must be an HTTPS URL or image data URI; local paths are never sent.`)
}

/**
 * Build the identity-preserving Meshy Multi-Image-to-3D request.
 * The options are intentionally explicit so a future caller cannot inherit
 * Meshy's quality-enhancement defaults by omission.
 */
export function buildMeshyMultiImageTask({ imageUrls = [], poseMode = 'a-pose', targetFormats = ['glb'], shouldTexture = true, autoSize = true } = {}) {
	if (!Array.isArray(imageUrls) || imageUrls.length < 1 || imageUrls.length > 4) {
		throw new Error('Meshy requires between 1 and 4 body-branch image references.')
	}
	if (!['', 'a-pose', 't-pose'].includes(String(poseMode))) throw new Error('Meshy poseMode must be empty, a-pose, or t-pose.')
	const references = imageUrls.map(assertMeshyImageReference)
	const formats = [...new Set((targetFormats || []).map(value => String(value).toLowerCase()))]
	if (!formats.length || formats.some(value => !['glb', 'obj', 'fbx', 'stl', 'usdz', '3mf'].includes(value))) {
		throw new Error('Meshy targetFormats contains an unsupported format.')
	}
	return {
		ai_model: 'latest',
		image_urls: references,
		should_texture: Boolean(shouldTexture),
		pose_mode: String(poseMode),
		image_enhancement: false,
		remove_lighting: false,
		alpha_thumbnail: true,
		multi_view_thumbnails: Boolean(autoSize),
		auto_size: Boolean(autoSize),
		origin_at: 'bottom',
		target_formats: formats,
		identity_policy: {
			branch: 'body-only',
			originalsRemainAuthoritative: true,
			backgroundOperation: 'alpha-only-or-original',
			faceAssetMayBeSent: false,
			meshOutputMayFeedLipSync: false,
		},
	}
}

export function assertMeshyIdentityPolicy(request = {}) {
	const failures = []
	if (request.image_enhancement !== false) failures.push('image_enhancement must be false')
	if (request.remove_lighting !== false) failures.push('remove_lighting must be false')
	if (request.identity_policy?.branch !== 'body-only') failures.push('request must be marked body-only')
	if (request.identity_policy?.originalsRemainAuthoritative !== true) failures.push('originals must remain authoritative')
	if (request.identity_policy?.faceAssetMayBeSent !== false) failures.push('face asset must not be sent to Meshy')
	if (request.identity_policy?.meshOutputMayFeedLipSync !== false) failures.push('Meshy output must not feed lip-sync')
	if (failures.length) throw new Error(`Meshy identity policy failed: ${failures.join('; ')}`)
	return { ok: true, checked: ['image_enhancement', 'remove_lighting', 'body-only', 'original-authority', 'face-isolation', 'no-mesh-to-lipsync'] }
}

export function assessPresenterSubmission({ bodyViews = [], faceImage = null, allowFallbackFaceCrop = true } = {}) {
	const issues = []
	if (!Array.isArray(bodyViews) || bodyViews.length === 0) {
		issues.push(issue('BODY_REFERENCE_MISSING', 'blocker', 'At least one body reference image is required.'))
	}
	if (Array.isArray(bodyViews) && bodyViews.length > PRESENTER_INGESTION_POLICY.maxBodyViews) {
		issues.push(issue('BODY_VIEW_LIMIT', 'warning', `Only the first ${PRESENTER_INGESTION_POLICY.maxBodyViews} body views will be used; extras remain preserved but are not sent to Meshy.`))
	}
	const selectedBodyViews = (bodyViews || []).slice(0, PRESENTER_INGESTION_POLICY.maxBodyViews)
	selectedBodyViews.forEach((view, index) => issues.push(...evaluateView(view, { role: 'body', index })))

	let faceSource = 'dedicated'
	if (faceImage) {
		issues.push(...evaluateView(faceImage, { role: 'face', index: 'face' }))
	} else {
		faceSource = 'derived-face-fallback'
		if (!allowFallbackFaceCrop) issues.push(issue('DEDICATED_FACE_REQUIRED', 'blocker', 'A dedicated face image is required for this quality mode.'))
		else issues.push(issue('DEDICATED_FACE_RECOMMENDED', 'warning', 'No dedicated face image was supplied; the front body view will be used for a deterministic fallback crop.'))
	}
	const explicitConsistency = selectedBodyViews.map(view => view.analysis?.subjectConsistency).filter(value => value !== undefined)
	if (explicitConsistency.some(value => value === false)) issues.push(issue('VIEW_CONSISTENCY_UNCERTAIN', 'warning', 'Views may not depict the same subject; user confirmation is recommended.'))
	if (!explicitConsistency.length && selectedBodyViews.length > 1) issues.push(issue('VIEW_CONSISTENCY_UNMEASURED', 'info', 'Cross-view consistency was not measured; retain all originals for review.'))
	const lightingConsistency = selectedBodyViews.map(view => view.analysis?.lightingConsistency).filter(value => value !== undefined)
	if (lightingConsistency.some(value => value === false)) issues.push(issue('LIGHTING_CONSISTENCY_UNCERTAIN', 'warning', 'Lighting differs materially between body views; originals remain authoritative and Meshy input quality is lower confidence.'))
	const framingConsistency = selectedBodyViews.map(view => view.analysis?.framingConsistency).filter(value => value !== undefined)
	if (framingConsistency.some(value => value === false)) issues.push(issue('FRAMING_CONSISTENCY_UNCERTAIN', 'warning', 'Framing or camera distance differs materially between body views; no face pixels will be rewritten.'))

	const maxSeverity = issues.reduce((max, item) => Math.max(max, severity[item.level] ?? 0), 0)
	const blockers = issues.filter(item => item.level === 'blocker')
	const warnings = issues.filter(item => item.level === 'warning')
	return {
		schemaVersion: PRESENTER_INGESTION_SCHEMA,
		status: maxSeverity >= severity.blocker ? 'blocked' : warnings.length ? 'ready-with-warnings' : 'ready',
		canProceed: blockers.length === 0,
		issues,
		blockers,
		warnings,
		branchPolicy: {
			originalsImmutable: true,
			bodyBranch: 'original-or-alpha-only-to-meshy',
			faceBranch: faceSource,
			facePixelsNeverRepainted: true,
			mesh: PRESENTER_INGESTION_POLICY.mesh,
		},
		selectedBodyViewCount: selectedBodyViews.length,
		faceSource,
	}
}

export async function createPresenterAssetManifest({ bodyPaths = [], facePath = null, analyses = {}, allowFallbackFaceCrop = true } = {}) {
	const bodyViews = []
	for (const [index, filePath] of bodyPaths.entries()) {
		const image = await inspectImageFile(filePath)
		bodyViews.push({ id: `body-${index + 1}`, image, analysis: analyses[`body-${index + 1}`] || {} })
	}
	const faceImage = facePath ? { id: 'face-dedicated', image: await inspectImageFile(facePath), analysis: analyses['face-dedicated'] || {} } : null
	const decision = assessPresenterSubmission({ bodyViews, faceImage, allowFallbackFaceCrop })
	return {
		schemaVersion: PRESENTER_INGESTION_SCHEMA,
		createdAt: new Date().toISOString(),
		policy: PRESENTER_INGESTION_POLICY,
		originals: { bodyViews, faceImage },
		decision,
		provenance: {
			faceParentSha256: faceImage?.image?.sha256 || bodyViews[0]?.image?.sha256 || null,
			allowedFaceOperations: ['crop', 'pad', 'resize'],
			meshInputTransform: 'alpha-only-or-original',
		},
	}
}
