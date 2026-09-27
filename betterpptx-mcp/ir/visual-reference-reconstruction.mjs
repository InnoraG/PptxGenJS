/**
 * Public visual-reference reconstruction contract.
 *
 * The client AI owns the visual interpretation. BetterPPTX never parses or
 * lowers HTML here; it only converts explicit AI-authored pixel frames into
 * the native PowerPoint coordinate system before ordinary semantic compile.
 */

export const VISUAL_REFERENCE_RECONSTRUCTION_VERSION = 'betterpptx.visual-reference-reconstruction.v1'

export const VISUAL_REFERENCE_RECONSTRUCTION_CONTRACT = Object.freeze({
	schemaVersion: VISUAL_REFERENCE_RECONSTRUCTION_VERSION,
	mode: 'ai-reconstructed-native',
	coordinateMode: 'pixels',
	representationPolicy: 'native-except-media',
	rule: 'In the principal AI-reconstruction route, the AI observes the reference outside BetterPPTX, authors every ordinary visual as a native PowerPoint object, and uses pixelFrame only for exact placement. Automatic HTML conversion is a separate explicit secondary route.',
	nativeObjects: Object.freeze(['text', 'textShape', 'shape', 'connector', 'freeform', 'customGeometry', 'group', 'chart', 'table', 'smartArt', 'equation', 'ink', 'animation', 'transition']),
	allowedMediaKinds: Object.freeze(['photograph', 'detailed-illustration', 'model3d', 'video', 'audio']),
	forbiddenRepresentations: Object.freeze(['whole-slide-raster', 'sliced-slide-raster', 'html-lowering', 'automatic-non-media-raster-fallback']),
})

function finite(value, path) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) throw new Error(`${path} must be a finite number.`)
	return numeric
}

function positive(value, path) {
	const numeric = finite(value, path)
	if (!(numeric > 0)) throw new Error(`${path} must be greater than zero.`)
	return numeric
}

function object(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const RAW_GEOMETRY_KEYS = Object.freeze(['bbox', 'rect', 'x', 'y', 'w', 'h', 'coordinateMode', 'points', 'paths'])
const MEDIA_KINDS = new Set(['image', 'image-feature', 'model3d', 'media', 'video', 'audio', 'avatarnarration', 'cameo', 'narration'])

function sourceReference(value) {
	if (typeof value === 'string' && value.trim()) return value.trim()
	if (!object(value)) return ''
	for (const key of ['handle', 'source', 'assetRef', 'path', 'url', 'link', 'data']) {
		const candidate = sourceReference(value[key])
		if (candidate) return candidate
	}
	return ''
}

function mediaSourceReference(node = {}) {
	for (const candidate of [
		node.assetRef,
		node.imageOptions?.source,
		node.mediaOptions?.source,
		node.model3dOptions?.modelAsset,
		node.modelAsset,
		node.source,
		node.lockedMedia?.handle,
		node.handle,
		node.url,
		node.link,
		node.path,
		node.data,
	]) {
		const reference = sourceReference(candidate)
		if (reference) return reference
	}
	return ''
}

function mediaDeclarationCompatible(objectKind, declaredKind) {
	if (objectKind === 'model3d') return declaredKind === 'model3d'
	if (objectKind === 'audio') return declaredKind === 'audio'
	if (['video', 'media', 'avatarnarration', 'narration', 'cameo'].includes(objectKind)) return ['video', 'audio'].includes(declaredKind)
	return ['photograph', 'detailed-illustration'].includes(declaredKind)
}

function rejectRawGeometry(node, path, declarations, viewport, topLevel = true) {
	if (!object(node)) return
	for (const key of RAW_GEOMETRY_KEYS) {
		if (Object.prototype.hasOwnProperty.call(node, key)) throw new Error(`${path}.${key} is forbidden in visualReference mode. Use pixelFrame, pixelPoints, or pixelPaths.`)
	}
	if (object(node.options)) {
		for (const key of ['x', 'y', 'w', 'h', 'rect', 'bbox']) {
			if (Object.prototype.hasOwnProperty.call(node.options, key)) throw new Error(`${path}.options.${key} is forbidden in visualReference mode.`)
		}
	}
	const kind = String(node.kind || '').trim().toLowerCase()
	if ((Array.isArray(node.pixelPoints) || Array.isArray(node.pixelPaths)) && !object(node.pixelFrame)) {
		throw new Error(`${path}.pixelPoints/pixelPaths require pixelFrame and are local to that frame.`)
	}
	if (MEDIA_KINDS.has(kind)) {
		const name = String(node.name || node.objectName || '').trim()
		const declaration = declarations.get(name)
		if (!declaration) throw new Error(`${path} is a media object and requires a matching visualReference.mediaAssets declaration by name.`)
		if (!mediaDeclarationCompatible(kind, declaration.kind)) throw new Error(`${path} kind ${kind} is incompatible with declared media kind ${declaration.kind}.`)
		const boundAssetRef = mediaSourceReference(node)
		if (!boundAssetRef) throw new Error(`${path} must reference an immutable media asset handle.`)
		if (boundAssetRef !== declaration.assetRef) throw new Error(`${path} media source must exactly match visualReference.mediaAssets assetRef for ${name}.`)
		if (topLevel && object(node.pixelFrame)) {
			const frame = normalizedPixelFrame(node.pixelFrame, viewport, `${path}.pixelFrame`, { allowZeroAxis: ['connector', 'line'].includes(kind) })
			const fullCanvas = frame.w >= viewport.width * 0.95 && frame.h >= viewport.height * 0.95
			if (fullCanvas && declaration.fullBleed !== true) throw new Error(`${path} covers the visual-reference canvas. Declare fullBleed:true only for a legitimate full-bleed media asset; slide screenshots are forbidden.`)
		}
	}
	const rasterSignal = node.needsIsolatedRaster === true
		|| node.rasterFallback === true
		|| node.wholeSlideRaster === true
		|| node.slicedSlideRaster === true
		|| node.fallback?.rendered === true
		|| Array.isArray(node.htmlFallbacks) && node.htmlFallbacks.length > 0
	if (rasterSignal && !MEDIA_KINDS.has(kind)) throw new Error(`${path} requests non-media raster fallback, which is forbidden in visualReference mode.`)
	if (Array.isArray(node.children)) node.children.forEach((child, index) => rejectRawGeometry(child, `${path}.children[${index}]`, declarations, viewport, false))
}

function layoutSize(spec = {}) {
	const active = (Array.isArray(spec.layouts) ? spec.layouts : []).find(item => item?.activate === true || item?.active === true || item?.name === spec.layout)
	if (Number(active?.width) > 0 && Number(active?.height) > 0) return { w: Number(active.width), h: Number(active.height) }
	const layout = String(spec.layout || '').trim().toUpperCase()
	if (layout === 'LAYOUT_4X3' || layout === 'LAYOUT_4x3') return { w: 10, h: 7.5 }
	if (layout === 'LAYOUT_16X10' || layout === 'LAYOUT_16x10') return { w: 10, h: 6.25 }
	if (layout === 'LAYOUT_SQUARE') return { w: 10, h: 10 }
	if (layout === 'LAYOUT_VERTICAL') return { w: 7.5, h: 13.333333 }
	return { w: 13.333333, h: 7.5 }
}

export function isVisualReferenceReconstruction(spec = {}) {
	const reference = spec?.visualReference
	if (!object(reference)) return false
	return String(reference.mode || '').trim().toLowerCase() === 'ai-reconstructed-native'
		&& String(reference.coordinateMode || '').trim().toLowerCase() === 'pixels'
}

function normalizedViewport(value, path) {
	if (!object(value)) throw new Error(`${path} must contain width and height.`)
	return {
		width: positive(value.width, `${path}.width`),
		height: positive(value.height, `${path}.height`),
	}
}

function normalizedPixelFrame(value, viewport, path, { allowZeroAxis = false } = {}) {
	if (!object(value)) throw new Error(`${path} must be an object with x, y, w, and h.`)
	const frame = {
		x: finite(value.x, `${path}.x`),
		y: finite(value.y, `${path}.y`),
		w: finite(value.w, `${path}.w`),
		h: finite(value.h, `${path}.h`),
	}
	if (allowZeroAxis ? frame.w < 0 || frame.h < 0 || (frame.w === 0 && frame.h === 0) : frame.w <= 0 || frame.h <= 0) {
		throw new Error(`${path}.w and .h must be positive${allowZeroAxis ? ', except one axis may be zero for a line/connector' : ''}.`)
	}
	const maxW = viewport.width * 4
	const maxH = viewport.height * 4
	if (frame.w > maxW || frame.h > maxH || frame.x < -maxW || frame.x > maxW || frame.y < -maxH || frame.y > maxH) {
		throw new Error(`${path} is outside the bounded visual-reference canvas.`)
	}
	return frame
}

function inchesFrame(frame, viewport, slideSize) {
	return {
		x: frame.x / viewport.width * slideSize.w,
		y: frame.y / viewport.height * slideSize.h,
		w: frame.w / viewport.width * slideSize.w,
		h: frame.h / viewport.height * slideSize.h,
	}
}

function convertPoint(point, viewport, slideSize, path) {
	if (!object(point)) throw new Error(`${path} must be an object.`)
	if (point.close === true) return { close: true }
	const out = { ...point }
	for (const [xKey, yKey] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) {
		if (out[xKey] === undefined && out[yKey] === undefined) continue
		out[xKey] = finite(out[xKey], `${path}.${xKey}`) / viewport.width * slideSize.w
		out[yKey] = finite(out[yKey], `${path}.${yKey}`) / viewport.height * slideSize.h
	}
	if (object(out.curve)) out.curve = convertPoint(out.curve, viewport, slideSize, `${path}.curve`)
	return out
}

function convertNode(node, viewport, targetSize, path, nested = false) {
	if (!object(node)) return node
	const out = { ...node }
	// The reference author may name a decorative role independently of the
	// primitive. Carry that explicit intent into layout and accessibility;
	// otherwise transparent vector outlines are mistaken for opaque content.
	if (out.role === 'decorative' && out.decorative === undefined) out.decorative = true
	let pixelFrame = null
	if (Object.prototype.hasOwnProperty.call(out, 'pixelFrame')) {
		pixelFrame = normalizedPixelFrame(out.pixelFrame, viewport, `${path}.pixelFrame`, { allowZeroAxis: ['connector', 'line'].includes(String(out.kind || '')) })
		const frame = inchesFrame(pixelFrame, viewport, targetSize)
		if (nested) Object.assign(out, frame)
		else out.bbox = frame
		delete out.pixelFrame
	}
	if (Array.isArray(out.pixelPoints)) {
		const pointViewport = { width: pixelFrame.w || 1, height: pixelFrame.h || 1 }
		const pointSize = inchesFrame(pixelFrame, viewport, targetSize)
		out.points = out.pixelPoints.map((point, index) => convertPoint(point, pointViewport, { w: pointSize.w, h: pointSize.h }, `${path}.pixelPoints[${index}]`))
		delete out.pixelPoints
	}
	if (Array.isArray(out.pixelPaths)) {
		const pointViewport = { width: pixelFrame.w || 1, height: pixelFrame.h || 1 }
		const pointSize = inchesFrame(pixelFrame, viewport, targetSize)
		out.paths = out.pixelPaths.map((points, pathIndex) => {
			if (!Array.isArray(points)) throw new Error(`${path}.pixelPaths[${pathIndex}] must be an array.`)
			return points.map((point, pointIndex) => convertPoint(point, pointViewport, { w: pointSize.w, h: pointSize.h }, `${path}.pixelPaths[${pathIndex}][${pointIndex}]`))
		})
		delete out.pixelPaths
	}
	if (Array.isArray(out.children)) {
		const childViewport = pixelFrame ? { width: pixelFrame.w, height: pixelFrame.h } : viewport
		const childTargetSize = pixelFrame ? inchesFrame(pixelFrame, viewport, targetSize) : targetSize
		out.children = out.children.map((child, index) => convertNode(
			child,
			childViewport,
			{ w: childTargetSize.w, h: childTargetSize.h },
			`${path}.children[${index}]`,
			true,
		))
	}
	return out
}

function convertPresenterFrame(presenter, viewport, slideSize, path) {
	if (!object(presenter)) return presenter
	for (const key of ['_visualReferenceFrame', 'bbox', 'rect', 'x', 'y', 'w', 'h']) {
		if (Object.prototype.hasOwnProperty.call(presenter, key)) throw new Error(`${path}.${key} is forbidden; author presenter.pixelFrame only in visualReference mode.`)
	}
	if (!Object.prototype.hasOwnProperty.call(presenter, 'pixelFrame')) return presenter
	const frame = normalizedPixelFrame(presenter.pixelFrame, viewport, `${path}.pixelFrame`)
	const out = { ...presenter, _visualReferenceFrame: inchesFrame(frame, viewport, slideSize) }
	delete out.pixelFrame
	return out
}

export function normalizeVisualReferenceReconstruction(spec = {}) {
	if (!isVisualReferenceReconstruction(spec)) return spec
	const reference = spec.visualReference
	if (String(reference.schemaVersion || VISUAL_REFERENCE_RECONSTRUCTION_VERSION) !== VISUAL_REFERENCE_RECONSTRUCTION_VERSION) {
		throw new Error(`visualReference.schemaVersion must be ${VISUAL_REFERENCE_RECONSTRUCTION_VERSION}.`)
	}
	if (String(reference.representationPolicy || '').trim().toLowerCase() !== 'native-except-media') {
		throw new Error('visualReference.representationPolicy must be "native-except-media".')
	}
	const rootViewport = normalizedViewport(reference.viewport, 'visualReference.viewport')
	const slideSize = layoutSize(spec)
	const declarations = new Map()
	for (const [index, item] of (Array.isArray(reference.mediaAssets) ? reference.mediaAssets : []).entries()) {
		if (!object(item)) throw new Error(`visualReference.mediaAssets[${index}] must be an object.`)
		const name = String(item.name || '').trim()
		const kind = String(item.kind || '').trim().toLowerCase()
		const assetRef = sourceReference(item.assetRef)
		const purpose = String(item.purpose || '').trim()
		const sha256 = String(item.sha256 || '').trim().toLowerCase()
		if (!name) throw new Error(`visualReference.mediaAssets[${index}].name is required.`)
		if (!VISUAL_REFERENCE_RECONSTRUCTION_CONTRACT.allowedMediaKinds.includes(kind)) throw new Error(`visualReference.mediaAssets[${index}].kind must be photograph, detailed-illustration, model3d, video, or audio.`)
		if (!assetRef) throw new Error(`visualReference.mediaAssets[${index}].assetRef must bind the declaration to the immutable media source used by the content object.`)
		if (!purpose) throw new Error(`visualReference.mediaAssets[${index}].purpose is required.`)
		if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`visualReference.mediaAssets[${index}].sha256 must contain exactly 64 hexadecimal characters.`)
		const handleDigest = assetRef.match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase() || ''
		if (sha256 && handleDigest && sha256 !== handleDigest) throw new Error(`visualReference.mediaAssets[${index}].sha256 does not match the content-addressed assetRef.`)
		if (declarations.has(name)) throw new Error(`visualReference.mediaAssets contains duplicate name ${name}.`)
		declarations.set(name, { ...item, name, kind, assetRef, purpose, ...(sha256 || handleDigest ? { sha256: sha256 || handleDigest } : {}) })
	}
	for (const [slideIndex, slide] of (Array.isArray(spec.slides) ? spec.slides : []).entries()) {
		const viewport = slide?.pixelViewport ? normalizedViewport(slide.pixelViewport, `slides[${slideIndex}].pixelViewport`) : rootViewport
		for (const [blockIndex, block] of (Array.isArray(slide?.content) ? slide.content : []).entries()) rejectRawGeometry(block, `slides[${slideIndex}].content[${blockIndex}]`, declarations, viewport)
	}
	return {
		...spec,
		...(spec.presenter !== undefined ? { presenter: convertPresenterFrame(spec.presenter, rootViewport, slideSize, 'presenter') } : {}),
		visualReference: {
			...reference,
			schemaVersion: VISUAL_REFERENCE_RECONSTRUCTION_VERSION,
			mode: 'ai-reconstructed-native',
			coordinateMode: 'pixels',
			representationPolicy: 'native-except-media',
		},
		authoringContract: {
			...(object(spec.authoringContract) ? spec.authoringContract : {}),
			geometryAuthority: 'ai',
			placementPolicy: 'visual-reference-pixels-v1',
		},
		slides: (Array.isArray(spec.slides) ? spec.slides : []).map((slide, slideIndex) => {
			const viewport = slide?.pixelViewport ? normalizedViewport(slide.pixelViewport, `slides[${slideIndex}].pixelViewport`) : rootViewport
			const next = { ...slide }
			delete next.pixelViewport
			if (slide.presenter !== undefined) next.presenter = convertPresenterFrame(slide.presenter, viewport, slideSize, `slides[${slideIndex}].presenter`)
			next.content = (Array.isArray(slide?.content) ? slide.content : []).map((block, blockIndex) => convertNode(block, viewport, slideSize, `slides[${slideIndex}].content[${blockIndex}]`))
			return next
		}),
	}
}
