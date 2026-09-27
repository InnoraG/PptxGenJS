import { createHash } from 'node:crypto'

export const NATIVE_EDITABLE_PAYLOAD_VERSION = 'betterpptx.native-editable-payload.v1'

const DENIED_KEYS = new Set(['source', 'assetRef', 'imageOptions', 'path', 'data', 'dataRef', 'nativeXml', 'rawXml', '_rawXml'])
const ALLOWED_INTERNAL_KEYS = new Set(['_bodyProp', '_shapeFormattingState', '_isPureShape', '_nativeMinimal', '_omitTransform', '_omitShapePrstGeom', '_emptySpPr'])

function fail(field, message, code = 'SLIDE_CONTINUITY_RUNTIME_ITEM_PAYLOAD_UNSUPPORTED') {
	const error = new Error(message)
	error.code = code
	error.field = field
	throw error
}
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype }
function canonical(value, field, depth = 0) {
	if (depth > 48) fail(field, 'Native editable payload nesting exceeds the supported depth.')
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) fail(field, 'Native editable payload numbers must be finite.')
		return value
	}
	if (Array.isArray(value)) return value.map((part, index) => {
		if (part === undefined) fail(`${field}[${index}]`, 'Native editable payload arrays cannot contain absent values.')
		return canonical(part, `${field}[${index}]`, depth + 1)
	})
	if (!plain(value)) fail(field, 'Native editable payload must contain only plain JSON values.')
	return Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => {
		if (DENIED_KEYS.has(key) || (key.startsWith('_') && !ALLOWED_INTERNAL_KEYS.has(key))) fail(`${field}.${key}`, 'This native field requires a separately verified payload projection.')
		return [key, canonical(value[key], `${field}.${key}`, depth + 1)]
	}))
}
function optionsPayload(options, field, { top = false } = {}) {
	if (!plain(options)) fail(field, 'The editable native carrier has no plain options object.')
	const output = { ...options }
	const implicitAlt = output.altText === output.objectName
	for (const key of ['objectName', 'editHandle', 'animation', 'animations']) delete output[key]
	if (top) for (const key of ['x', 'y']) delete output[key]
	if (implicitAlt) output.altText = { implicitDefault: true }
	return canonical(output, field)
}
function textPayload(text, field) {
	if (text === undefined || text === null) return null
	if (typeof text === 'string') return text
	if (!Array.isArray(text)) fail(field, 'The native text carrier must retain editable text or ordered rich runs.')
	return canonical(text.map((run, index) => {
		if (!plain(run) || typeof run.text !== 'string') fail(`${field}[${index}]`, 'The native text run is not editable text.')
		const options = { ...(run.options || {}) }
		delete options.objectName
		delete options.editHandle
		return { text: run.text, options }
	}), field)
}
function childPayload(child, field) {
	if (!plain(child) || !['shape', 'text', 'textBox', 'textShape', 'group'].includes(child.kind)) fail(field, 'This group child has no verified native editable carrier.')
	const descriptor = { ...child }
	const nativeObject = descriptor._nativeObject
	const children = descriptor.children
	for (const key of ['name', 'objectName', 'editHandle', '_nativeObject', 'children']) delete descriptor[key]
	if (descriptor.altText === child.objectName || descriptor.altText === child.name) descriptor.altText = { implicitDefault: true }
	const native = child.kind === 'group'
		? { nativeType: nativeObject?._type, options: optionsPayload(nativeObject?.options, `${field}._nativeObject.options`), children: groupChildren(children, `${field}.children`) }
		: nativeObjectPayload(nativeObject, child.kind === 'text' || child.kind === 'textBox' || child.kind === 'textShape' ? 'editable-text-shape' : 'editable-shape', `${field}._nativeObject`, false)
	return { descriptor: canonical(descriptor, field), native }
}
function groupChildren(children, field) {
	if (!Array.isArray(children) || !children.length) fail(field, 'An editable native group must have ordered children.')
	return children.map((child, index) => childPayload(child, `${field}[${index}]`))
}
function nativeObjectPayload(object, kind, field, top = true) {
	if (!plain(object)) fail(field, 'The native carrier is not a plain editable object.')
	if (kind === 'editable-shape-group') {
		if (object._type !== 'group' || !plain(object.group)) fail(field, 'The native carrier is not an editable group.')
		for (const key of Object.keys(object)) if (!['_type', 'group', 'options'].includes(key)) fail(`${field}.${key}`, 'This native group field requires separate projection.')
		const options = { ...object.options }
		const groupOptions = { ...object.group }
		delete options.children
		delete groupOptions.children
		if (JSON.stringify(canonical(options, `${field}.options`)) !== JSON.stringify(canonical(groupOptions, `${field}.group`))) fail(field, 'The native group options diverge from its serialized group payload.')
		return { carrier: kind, nativeType: object._type, options: optionsPayload(options, `${field}.options`, { top }), children: groupChildren(object.group.children, `${field}.children`) }
	}
	for (const key of Object.keys(object)) if (!['_type', 'shape', 'text', 'options'].includes(key)) fail(`${field}.${key}`, 'This native shape field requires separate projection.')
	if (kind === 'editable-text-shape') {
		if (object._type !== 'text' || typeof object.shape !== 'string') fail(field, 'The native carrier is not an editable text shape.')
	} else if (kind === 'editable-shape') {
		if (!['shape', 'text'].includes(object._type) || typeof object.shape !== 'string') fail(field, 'The native carrier is not an editable shape.')
	} else fail(field, 'The native carrier kind is unsupported.')
	return { carrier: kind, nativeType: object._type, shape: object.shape, options: optionsPayload(object.options, `${field}.options`, { top }), text: textPayload(object.text, `${field}.text`) }
}

export function nativeEditableItemDigest(object, kind) {
	const projection = canonical(nativeObjectPayload(object, kind, 'nativeItem'), 'nativeItem')
	return createHash('sha256').update(NATIVE_EDITABLE_PAYLOAD_VERSION).update('\0').update(JSON.stringify(projection)).digest('hex')
}

export function assertRuntimeEditableItemPair(continuities, pptx, planSlides = [], slideIndexOffset = 0) {
	const boundaries = continuities?.boundaries || []
	if (!Array.isArray(boundaries)) fail('slideContinuities', 'Native continuity boundaries must be an array.')
	const slideIndexById = new Map(planSlides.map(slide => [slide.slideId, slide.slideIndex]))
	const reports = []
	for (const [index, boundary] of boundaries.entries()) {
		const digests = {}
		for (const side of ['from', 'to']) {
			const endpoint = boundary[side]
			const planned = boundary.plannedBindings?.[side]?.item
			const slideId = side === 'from' ? boundary.fromSlideId : boundary.toSlideId
			const plannedSlideIndex = slideIndexById.get(slideId)
			const slideIndex = Number(plannedSlideIndex) + slideIndexOffset
			const slide = pptx?.slides?.[slideIndex]
			if (!Number.isInteger(plannedSlideIndex) || !slide || !planned?.objectName || !planned?.editHandle) fail(`slideContinuities[${index}].${side}`, 'The runtime item has no exact planned slide/name/handle binding.', 'SLIDE_CONTINUITY_RUNTIME_ITEM_BINDING')
			const matches = (slide._slideObjects || []).filter(object => object?.options?.objectName === planned.objectName && object?.options?.editHandle === planned.editHandle)
			if (matches.length !== 1) fail(`slideContinuities[${index}].${side}`, 'The runtime item must resolve to exactly one editable native carrier.', 'SLIDE_CONTINUITY_RUNTIME_ITEM_BINDING')
			digests[side] = nativeEditableItemDigest(matches[0], endpoint.itemKind)
		}
		if (digests.from !== digests.to) fail(`slideContinuities[${index}].item`, 'The two runtime native editable item payloads differ.', 'SLIDE_CONTINUITY_RUNTIME_ITEM_PAYLOAD_MISMATCH')
		reports.push({ boundaryId: boundary.id, digestVersion: NATIVE_EDITABLE_PAYLOAD_VERSION, digest: digests.from, status: 'RUNTIME_NATIVE_PAYLOAD_MATCH' })
	}
	return reports
}
