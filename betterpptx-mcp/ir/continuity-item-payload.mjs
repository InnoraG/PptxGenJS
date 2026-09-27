import { createHash } from 'node:crypto'

export const EDITABLE_ITEM_PAYLOAD_VERSION = 'betterpptx.editable-item-payload.v1'

const CARRIER_TOOL = Object.freeze({
	'editable-shape': 'betterpptx.slide.add_shape',
	'editable-text-shape': 'betterpptx.slide.add_text',
	'editable-shape-group': 'betterpptx.slide.add_group',
})
const AUTHORED_KEYS = new Set([
	'kind', 'name', 'objectName', 'editHandle', 'x', 'y', 'w', 'h', 'rect', 'bbox', 'pixelFrame',
	'style', 'text', 'children', 'shape', 'shapeName', 'altText', 'region', 'role', 'rotation', 'rotate',
	'flipH', 'flipV', 'fill', 'line', 'hyperlink', 'accessibilityTitle', 'isDecorative', 'chOff', 'chExt',
	'shapeStylePresetId', 'shapeEffectPresetId', 'shapeEffectPresetIds', 'textEffectPresetId',
	'textEffectPresetIds', 'wordArtStylePresetId',
])
const STYLE_KEYS = new Set([
	'fill', 'line', 'color', 'fontFace', 'fontSize', 'bold', 'italic', 'align', 'valign', 'margin',
	'wrap', 'fit', 'accent', 'rectRadius', 'rotate', 'rotation', 'flipH', 'flipV', 'hyperlink',
	'shapeStylePresetId', 'shapeEffectPresetId', 'shapeEffectPresetIds', 'textEffectPresetId',
	'textEffectPresetIds', 'wordArtStylePresetId',
])
const SOLID_FILL_KEYS = new Set(['color', 'transparency'])
const SIMPLE_LINE_KEYS = new Set(['color', 'transparency', 'width', 'type', 'dash', 'beginArrowType', 'endArrowType'])
const RUN_KEYS = new Set(['text', 'options'])
const RUN_OPTION_KEYS = new Set(['fontFace', 'fontSize', 'bold', 'italic', 'color', 'underline', 'breakLine', 'hyperlink'])
const GROUP_CHILD_KINDS = new Set(['shape', 'text', 'textBox', 'textShape', 'group'])

function invalid(field, message, code = 'SLIDE_CONTINUITY_ITEM_PAYLOAD_UNSUPPORTED') {
	const error = new Error(message)
	error.code = code
	error.field = field
	throw error
}
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype }
function known(value, keys, field) {
	if (!plain(value)) invalid(field, `${field} must be a plain editable payload object.`)
	for (const key of Object.keys(value)) if (!keys.has(key)) invalid(`${field}.${key}`, `${field}.${key} is not supported by the current editable-item digest.`)
}
function authoredText(value, field) {
	if (typeof value === 'string') return
	if (!Array.isArray(value)) invalid(field, `${field} must be text or ordered rich runs.`)
	for (const [index, run] of value.entries()) {
		if (typeof run === 'string') continue
		known(run, RUN_KEYS, `${field}[${index}]`)
		if (typeof run.text !== 'string') invalid(`${field}[${index}].text`, 'Rich-run text must be a string.')
		if (run.options !== undefined) known(run.options, RUN_OPTION_KEYS, `${field}[${index}].options`)
	}
}
function authoredBlock(block, field, nested = false) {
	known(block, AUTHORED_KEYS, field)
	if (nested && !GROUP_CHILD_KINDS.has(block.kind)) invalid(`${field}.kind`, 'This group child kind has no verified editable payload projection.')
	if (!nested && !['shape', 'textShape', 'group'].includes(block.kind)) invalid(`${field}.kind`, 'This editable item kind requires a separate resolved native payload contract.')
	if (block.style !== undefined) {
		known(block.style, STYLE_KEYS, `${field}.style`)
		if (block.style.fill !== undefined) known(block.style.fill, SOLID_FILL_KEYS, `${field}.style.fill`)
		if (block.style.line !== undefined) known(block.style.line, SIMPLE_LINE_KEYS, `${field}.style.line`)
	}
	if (block.fill !== undefined) known(block.fill, SOLID_FILL_KEYS, `${field}.fill`)
	if (block.line !== undefined) known(block.line, SIMPLE_LINE_KEYS, `${field}.line`)
	if (block.text !== undefined) authoredText(block.text, `${field}.text`)
	if (block.kind === 'group') {
		if (!Array.isArray(block.children) || !block.children.length) invalid(`${field}.children`, 'An editable group must have an ordered nonempty child tree.')
		const names = new Set()
		for (const [index, child] of block.children.entries()) {
			const childName = child?.objectName || child?.name
			if (typeof childName !== 'string' || !childName.trim() || names.has(childName)) invalid(`${field}.children[${index}]`, 'Group children require distinct stable names.')
			names.add(childName)
			authoredBlock(child, `${field}.children[${index}]`, true)
		}
	} else if (block.children !== undefined) invalid(`${field}.children`, 'Only groups may contain child objects.')
}
function canonical(value, field, depth = 0) {
	if (depth > 32) invalid(field, 'Editable payload nesting exceeds the supported depth.')
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) invalid(field, 'Editable payload numbers must be finite.')
		return value
	}
	if (Array.isArray(value)) return value.map((part, index) => {
		if (part === undefined) invalid(`${field}[${index}]`, 'Editable payload arrays cannot contain absent values.')
		return canonical(part, `${field}[${index}]`, depth + 1)
	})
	if (!plain(value)) invalid(field, 'Editable payload must contain only JSON values.')
	return Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key], `${field}.${key}`, depth + 1)]))
}
function cleanChild(child, field) {
	if (!plain(child) || !GROUP_CHILD_KINDS.has(child.kind)) invalid(field, 'Unsupported native group child in editable payload.')
	const output = { ...child }
	const implicitAlt = output.altText === output.objectName || output.altText === output.name
	for (const key of ['objectName', 'editHandle', 'name']) delete output[key]
	if (implicitAlt) output.altText = { implicitDefault: true }
	for (const key of ['animation', 'animations', 'source', 'assetRef', 'imageOptions', 'path', 'data', '_nativeObject']) if (key in output) invalid(`${field}.${key}`, 'The native group child requires a separate resolved payload contract.')
	if (output.kind === 'group') {
		if (!Array.isArray(output.children) || !output.children.length) invalid(`${field}.children`, 'A native group must have ordered children.')
		output.children = output.children.map((entry, index) => cleanChild(entry, `${field}.children[${index}]`))
	} else if (output.children !== undefined) invalid(`${field}.children`, 'Only native groups may contain children.')
	return canonical(output, field)
}
function operationProjection(operation, kind, field) {
	const expectedTool = CARRIER_TOOL[kind]
	if (!expectedTool || operation?.tool !== expectedTool) invalid(field, 'This carrier has no verified effective payload projection.')
	const args = operation.args
	if (!plain(args) || !plain(args.options)) invalid(field, 'The native add operation has no editable options.')
	const options = { ...args.options }
	for (const key of ['source', 'assetRef', 'imageOptions', 'path', 'data', 'dataRef', 'nativeXml', 'rawXml', '_nativeObject']) if (key in options) invalid(`${field}.options.${key}`, 'This native payload requires separately verified data or asset resolution.')
	if (kind !== 'editable-shape-group' && options.children !== undefined) invalid(`${field}.options.children`, 'Only editable groups may contain native children.')
	const implicitAlt = options.altText === options.objectName
	for (const key of ['x', 'y', 'objectName', 'editHandle']) delete options[key]
	if (implicitAlt) options.altText = { implicitDefault: true }
	for (const key of ['animation', 'animations']) delete options[key]
	if (kind === 'editable-shape-group') {
		if (!Array.isArray(options.children) || !options.children.length) invalid(`${field}.children`, 'The native group operation has no editable children.')
		options.children = options.children.map((child, index) => cleanChild(child, `${field}.children[${index}]`))
	}
	const payload = kind === 'editable-shape'
		? { carrier: kind, shapeName: args.shapeName, options }
		: kind === 'editable-text-shape'
			? { carrier: kind, text: args.text, options }
			: { carrier: kind, options }
	return canonical(payload, field)
}

export function editableItemOperationDigest(operation, kind, authoredSourceBlock) {
	if (authoredSourceBlock !== undefined) authoredBlock(authoredSourceBlock, 'itemSource')
	const projection = operationProjection(operation, kind, 'itemOperation')
	return createHash('sha256').update(EDITABLE_ITEM_PAYLOAD_VERSION).update('\0').update(JSON.stringify(projection)).digest('hex')
}
