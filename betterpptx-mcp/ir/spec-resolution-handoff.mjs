// Resolver patches contain asset locks, never a replacement composition. Apply
// only their documented carriers to the submitted authoring dialect so a cold
// client receives pixelFrame/pixelPoints rather than lowered slide coordinates.

const clone = value => JSON.parse(JSON.stringify(value))
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const NARRATION_LOCK_FIELDS = new Set(['lockedAudio', 'audio', 'expectedDurationMs', 'resolution', 'segments'])
const AVATAR_LOCK_FIELDS = new Set(['lockedVideo', 'lockedPoster', 'lockedAudio', 'avatarAsset', 'cover', 'durationMs', 'renderMode', 'resolution'])
const MEDIA_LOCK_FIELDS = new Set(['lockedMedia', 'path', 'extn', 'durationMs', 'resolution'])
const IMAGE_LOCK_FIELDS = new Set(['image', 'visualIntent'])
const TEMPLATE_LOCK_FIELDS = new Set(['handle', 'templateHandle', 'layoutContract', 'resolution'])

function handoffError(message) {
	const error = new Error(message)
	error.code = 'SPEC_RESOLUTION_HANDOFF_INVALID'
	return error
}

function publicIdentity(node = {}) {
	return node.name || node.objectName || node.id || null
}

function mergeLockFields(target, value, fields) {
	if (!object(value)) throw handoffError('Resolver lock patch must contain an object value.')
	for (const key of Object.keys(value)) {
		if (!fields.has(key)) throw handoffError(`Resolver lock patch cannot replace the authored ${key} field.`)
	}
	Object.assign(target, clone(value))
}

export function projectResolverLocksToAuthoredSpec(authoredSpec, resolvedSpec, patches = []) {
	if (!object(authoredSpec) || !object(resolvedSpec) || !Array.isArray(patches)) {
		throw handoffError('Resolver handoff requires an authored spec and an ordered lock patch list.')
	}
	const out = clone(authoredSpec)
	for (const patch of patches) {
		if (!object(patch) || patch.op !== 'merge' || typeof patch.path !== 'string') {
			throw handoffError('Only resolver merge patches can be projected onto the authored spec.')
		}
		if (patch.path === '/template') {
			out.template = object(out.template) ? out.template : {}
			mergeLockFields(out.template, patch.value, TEMPLATE_LOCK_FIELDS)
			continue
		}
		const match = /^\/slides\/(0|[1-9]\d*)\/(narration|voiceover|avatarNarration|content\/(0|[1-9]\d*))$/.exec(patch.path)
		if (!match) throw handoffError('Resolver patch is outside a supported asset-lock location.')
		const slideIndex = Number(match[1])
		const resolvedSlide = resolvedSpec.slides?.[slideIndex]
		const slide = out.slides?.[slideIndex]
		if (!object(slide) || !object(resolvedSlide) || (slide.id && resolvedSlide.id && slide.id !== resolvedSlide.id)) {
			throw handoffError('Resolver patch cannot change or replace an authored slide.')
		}
		if (match[2].startsWith('content/')) {
			const contentIndex = Number(match[3])
			const resolvedBlock = resolvedSlide.content?.[contentIndex]
			const identity = publicIdentity(resolvedBlock)
			const target = identity
				? slide.content?.find(block => publicIdentity(block) === identity)
				: slide.content?.[contentIndex]
			if (!object(target) || !object(resolvedBlock) || target.kind !== resolvedBlock.kind) {
				throw handoffError('Resolver patch has no matching authored content object.')
			}
			const kind = String(target.kind || '').toLowerCase()
			const fields = ['narration', 'voiceover'].includes(kind) ? NARRATION_LOCK_FIELDS
				: kind === 'avatarnarration' ? AVATAR_LOCK_FIELDS
				: kind === 'media' ? MEDIA_LOCK_FIELDS
				: ['image', 'image-feature', 'photo'].includes(kind) ? IMAGE_LOCK_FIELDS : null
			if (!fields) throw handoffError('Resolver patch cannot mutate a non-media content object.')
			mergeLockFields(target, patch.value, fields)
		} else {
			const field = match[2]
			slide[field] = object(slide[field]) ? slide[field] : {}
			mergeLockFields(slide[field], patch.value, field === 'avatarNarration' ? AVATAR_LOCK_FIELDS : NARRATION_LOCK_FIELDS)
		}
	}
	// A template can already have been locked by the precompile preparation step,
	// before the resolver creates its patch list. Preserve that asset contract,
	// not any other effective/precompiled spec fields.
	const template = resolvedSpec.template
	if (object(template) && (template.handle || template.templateHandle) && object(template.layoutContract)) {
		out.template = object(out.template) ? out.template : {}
		mergeLockFields(out.template, Object.fromEntries([...TEMPLATE_LOCK_FIELDS]
			.filter(key => template[key] !== undefined).map(key => [key, template[key]])), TEMPLATE_LOCK_FIELDS)
		out.layoutContract = clone(template.layoutContract)
	}
	return out
}

// The effective snapshot is archived after pixel normalization, but it is a
// public replay artifact, not a private compiler dump. Restore only coordinate
// carriers from the submitted dialect; keep finalized styles, asset locks and
// all other effective fields. In particular, sanitation must never silently
// delete a presenter's only placement carrier (_visualReferenceFrame).
export function projectEffectivePrecompileToAuthoredCoordinates(effectiveSpec, authoredSpec) {
	const out = clone(effectiveSpec)
	if (!object(authoredSpec?.visualReference)) return out
	const restorePresenter = (effective, authored) => {
		if (!object(effective)) return effective
		const presenter = { ...effective }
		if (presenter._visualReferenceFrame && !object(authored?.pixelFrame)) {
			throw handoffError('An effective presenter frame has no corresponding authored pixel frame.')
		}
		delete presenter._visualReferenceFrame
		if (object(authored?.pixelFrame)) presenter.pixelFrame = clone(authored.pixelFrame)
		return presenter
	}
	const restoreNode = (effective, authored) => {
		if (!object(effective) || !object(authored)) return effective
		if (object(authored.pixelFrame)) {
			for (const key of ['bbox', 'rect', 'x', 'y', 'w', 'h']) delete effective[key]
			effective.pixelFrame = clone(authored.pixelFrame)
		}
		for (const [pixelKey, loweredKey] of [['pixelPoints', 'points'], ['pixelPaths', 'paths']]) {
			if (Array.isArray(authored[pixelKey])) {
				effective[pixelKey] = clone(authored[pixelKey])
				delete effective[loweredKey]
			}
		}
		if (Array.isArray(effective.children)) {
			effective.children = effective.children.map((child, index) => {
				const identity = publicIdentity(child)
				const original = identity ? authored.children?.find(item => publicIdentity(item) === identity) : authored.children?.[index]
				return restoreNode(child, original)
			})
		}
		return effective
	}
	if (out.presenter !== undefined) out.presenter = restorePresenter(out.presenter, authoredSpec.presenter)
	for (const [index, slide] of (out.slides || []).entries()) {
		const source = slide.id ? authoredSpec.slides?.find(item => item.id === slide.id) : authoredSpec.slides?.[index]
		if (!source) throw handoffError('The effective slide has no corresponding authored coordinate source.')
		if (source.pixelViewport !== undefined) slide.pixelViewport = clone(source.pixelViewport)
		if (slide.presenter !== undefined) slide.presenter = restorePresenter(slide.presenter, source.presenter)
		if (Array.isArray(slide.content)) {
			slide.content = slide.content.map((block, contentIndex) => {
				const identity = publicIdentity(block)
				const original = identity ? source.content?.find(item => publicIdentity(item) === identity) : source.content?.[contentIndex]
				return restoreNode(block, original)
			})
		}
	}
	if (out.authoringContract?.placementPolicy === 'visual-reference-pixels-v1') delete out.authoringContract.placementPolicy
	return out
}
