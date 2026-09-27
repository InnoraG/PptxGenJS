// Public/native media contract.  Media sources are resolved through the
// asset lane; this module describes only the safe authoring controls that the
// native serializer can carry.  Local paths and relationship IDs are never
// returned by the public catalog.
export const MEDIA_FORMAT_TYPES = Object.freeze(['audio', 'video', 'online'])
export const MEDIA_FORMAT_SIZING_TYPES = Object.freeze(['contain', 'cover', 'crop'])
export const MEDIA_FORMAT_EXTENSIONS = Object.freeze({
	audio: Object.freeze(['mp3', 'm4a', 'wav', 'ogg', 'wma']),
	video: Object.freeze(['mp4', 'm4v', 'mov', 'webm', 'wmv']),
	online: Object.freeze([]),
})

export const MEDIA_FORMAT_PARAMETERS = Object.freeze([
	{ id: 'type', type: 'discrete', valueType: 'string', canonical: [...MEDIA_FORMAT_TYPES], semanticPath: 'content[].mediaType', serializer: 'native media relationship and p:audioFile/p:videoFile carrier', reset: 'set type to null or omit it to restore the inferred media type' },
	{ id: 'extn', type: 'discrete', valueType: 'string', canonical: [...new Set([...MEDIA_FORMAT_EXTENSIONS.audio, ...MEDIA_FORMAT_EXTENSIONS.video])], semanticPath: 'content[].mediaOptions.extn', serializer: 'native media part extension and content type', reset: 'set extn to null or omit it to infer the canonical extension from the authorized source', limitation: 'The extension must agree with the selected audio/video type and the detected payload signature.' },
	{ id: 'source', type: 'structured', valueType: 'opaque-media-reference', semanticPath: 'content[].assetRef|media source', serializer: 'native media package relationship resolved by the asset lane', capabilityMode: 'structured', capabilityStatus: 'asset-boundary', reset: 'set source to null or replace the asset reference', limitation: 'Public clients use opaque asset handles or data references; local filesystem paths and relationship IDs are never exposed.' },
	{ id: 'cover', type: 'structured', valueType: 'opaque-poster-reference', semanticPath: 'content[].cover', serializer: 'native preview image relationship', capabilityMode: 'structured', capabilityStatus: 'asset-boundary', reset: 'set cover to null or omit it to restore the generated play-button poster', limitation: 'Poster assets are resolved through the asset lane; private paths are not public.' },
	{ id: 'sizing', type: 'structured', valueType: 'media-frame', schema: { type: [...MEDIA_FORMAT_SIZING_TYPES], w: 'coordinate', h: 'coordinate', x: 'coordinate?', y: 'coordinate?' }, semanticPath: 'content[].mediaOptions.sizing', serializer: 'native blipFill srcRect and stretch/crop carrier', reset: 'set sizing to null or omit it to restore the native stretch frame', limitation: 'Exact crop framing is claimed only when source dimensions are known and retained.' },
	{ id: 'transparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 0.1, unit: 'percent', semanticPath: 'content[].mediaOptions.transparency', serializer: 'native preview a:alphaModFix', reset: 'set transparency to null or 0 to restore an opaque preview' },
	{ id: 'rounding', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'content[].mediaOptions.rounding', serializer: 'native a:prstGeom ellipse/rect carrier', reset: 'set rounding to null or false to restore a rectangular frame' },
	{ id: 'interactivePlayback', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'content[].mediaOptions.interactivePlayback', serializer: 'native interactiveSeq playback carrier', reset: 'set interactivePlayback to null to restore the native interactive default' },
	{ id: 'mediaVolume', type: 'continuous', valueType: 'integer', minimum: 0, maximum: 100000, default: 80000, step: 1, unit: 'PowerPoint volume units', semanticPath: 'content[].mediaOptions.mediaVolume', serializer: 'native p:audio/p:video volume carrier', reset: 'set mediaVolume to null to restore the native 80% timing default' },
	{ id: 'showWhenStopped', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'content[].mediaOptions.showWhenStopped', serializer: 'native media timing show-when-stopped carrier', reset: 'set showWhenStopped to null to restore the native stopped-frame default' },
	{ id: 'endOnStopAudio', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'content[].mediaOptions.endOnStopAudio', serializer: 'native media timing end-on-stop-audio carrier', reset: 'set endOnStopAudio to null to restore the native timing default' },
	{ id: 'closedCaptionTracks', type: 'structured', valueType: 'webvtt-track-array', maximumItems: 16, itemSchema: { format: 'webvtt', language: 'BCP-47', label: 'string', id: 'string?', vtt: 'WebVTT text', default: 'boolean?' }, semanticPath: 'content[].mediaOptions.closedCaptionTracks[]', serializer: 'native PPTX caption track part plus p173:tracksInfo', reset: 'set closedCaptionTracks to null or an empty array to remove authored caption tracks', limitation: 'Only native WebVTT tracks are supported; captions are not converted into slide text boxes.' },
])

const ENUM_RULES = Object.freeze({ type: MEDIA_FORMAT_TYPES })

const MEDIA_FORMAT_PARAMETER_IDS = new Set(MEDIA_FORMAT_PARAMETERS.map(item => item.id))
const PUBLIC_MEDIA_OPTION_KEYS = new Set([
	...MEDIA_FORMAT_PARAMETER_IDS,
	'path', 'link', 'data', 'assetRef', 'x', 'y', 'w', 'h', 'objectName', 'altText', 'animation',
])

function mediaParameterSchema(parameter) {
	if (parameter.id === 'type') return { oneOf: [{ type: 'null' }, { type: 'string', enum: [...MEDIA_FORMAT_TYPES] }] }
	if (parameter.id === 'extn') return { oneOf: [{ type: 'null' }, { type: 'string', enum: [...parameter.canonical] }] }
	if (parameter.id === 'source') return { oneOf: [{ type: 'null' }, { type: 'string', description: 'Opaque authorized asset handle, HTTPS URL, or inline data reference.' }] }
	if (parameter.id === 'cover') return { oneOf: [{ type: 'null' }, { type: 'string', description: 'Opaque authorized poster handle or inline image data reference.' }] }
	if (parameter.id === 'sizing') return {
		oneOf: [{ type: 'null' }, {
			type: 'object', additionalProperties: false,
			properties: {
				type: { type: 'string', enum: [...MEDIA_FORMAT_SIZING_TYPES] },
				x: { type: 'number', minimum: 0 }, y: { type: 'number', minimum: 0 },
				w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 },
			},
		}],
	}
	if (parameter.id === 'transparency') return { oneOf: [{ type: 'null' }, { type: 'number', minimum: 0, maximum: 100 }] }
	if (parameter.id === 'mediaVolume') return { oneOf: [{ type: 'null' }, { type: 'integer', minimum: 0, maximum: 100000 }] }
	if (['rounding', 'interactivePlayback', 'showWhenStopped', 'endOnStopAudio'].includes(parameter.id)) return { oneOf: [{ type: 'null' }, { type: 'boolean' }] }
	if (parameter.id === 'closedCaptionTracks') return {
		oneOf: [{ type: 'null' }, {
			type: 'array', maxItems: parameter.maximumItems,
			items: {
				type: 'object', additionalProperties: false, required: ['language'],
				properties: {
					format: { type: 'string', enum: ['webvtt'] }, language: { type: 'string' }, label: { type: 'string', minLength: 1 },
					id: { type: 'string', minLength: 1 }, vtt: { type: 'string', maxLength: 1024 * 1024 }, text: { type: 'string', maxLength: 1024 * 1024 }, default: { type: 'boolean' },
				},
			},
		}],
	}
	throw new Error(`Unclassified media parameter schema: ${parameter.id}`)
}

export const MEDIA_FORMAT_SCHEMA_PROPERTIES = Object.freeze(Object.fromEntries(MEDIA_FORMAT_PARAMETERS.map(parameter => [parameter.id, mediaParameterSchema(parameter)])))
export const MEDIA_FORMAT_SCHEMA = Object.freeze({
	oneOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, properties: MEDIA_FORMAT_SCHEMA_PROPERTIES }],
})

function finiteNumber(value, rule, path) {
	if (value === undefined || value === null) return
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (value < rule.minimum || value > rule.maximum) throw new Error(`${path} must be between ${rule.minimum} and ${rule.maximum}.`)
	if (rule.step && Math.abs((value - (rule.minimum || 0)) / rule.step - Math.round((value - (rule.minimum || 0)) / rule.step)) > 1e-7) throw new Error(`${path} must use a ${rule.step}-unit step.`)
}

function validateSizing(value, path) {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	const out = { ...value }
	for (const key of Object.keys(out)) if (!['type', 'x', 'y', 'w', 'h'].includes(key)) throw new Error(`${path}.${key} is not part of the public media framing contract.`)
	if (out.type !== undefined && out.type !== null && !MEDIA_FORMAT_SIZING_TYPES.includes(String(out.type))) throw new Error(`${path}.type must be one of ${MEDIA_FORMAT_SIZING_TYPES.join(', ')}.`)
	for (const key of ['x', 'y', 'w', 'h']) {
		if (out[key] === undefined || out[key] === null) continue
		if (typeof out[key] !== 'number' || !Number.isFinite(out[key])) throw new Error(`${path}.${key} must be a finite coordinate.`)
		if (out[key] < 0 || (['w', 'h'].includes(key) && out[key] === 0)) throw new Error(`${path}.${key} must be ${['w', 'h'].includes(key) ? 'positive' : 'non-negative'}.`)
	}
	return out
}

function validateCaptionTracks(value, path) {
	if (value === undefined || value === null) return value
	if (!Array.isArray(value) || value.length > 16) throw new Error(`${path} must be an array of at most 16 WebVTT tracks.`)
	return value.map((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${path}[${index}] must be an object.`)
		const out = { ...item }
		if (out.data !== undefined || out.path !== undefined) throw new Error(`${path}[${index}] data/path inputs are maintainer-only; use WebVTT text or an authorized asset handle.`)
		for (const key of Object.keys(out)) if (!['format', 'language', 'lang', 'label', 'id', 'vtt', 'text', 'default'].includes(key)) throw new Error(`${path}[${index}].${key} is not part of the public WebVTT track contract.`)
		const format = String(out.format || 'webvtt').trim().toLowerCase()
		if (format !== 'webvtt') throw new Error(`${path}[${index}].format must be webvtt.`)
		out.format = 'webvtt'
		const language = String(out.language || out.lang || '').trim()
		if (!language || language.length > 35 || !/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(language)) throw new Error(`${path}[${index}].language must be a BCP-47 language tag.`)
		out.language = language.replace(/_/g, '-')
		if (out.label !== undefined && out.label !== null && (typeof out.label !== 'string' || !out.label.trim())) throw new Error(`${path}[${index}].label must be a non-empty string.`)
		if (out.id !== undefined && out.id !== null && (typeof out.id !== 'string' || !out.id.trim())) throw new Error(`${path}[${index}].id must be a non-empty string.`)
		const vtt = out.vtt ?? out.text
		if (vtt !== undefined && vtt !== null && (typeof vtt !== 'string' || vtt.length > 1024 * 1024)) throw new Error(`${path}[${index}].vtt must be WebVTT text of at most 1 MiB.`)
		if (out.default !== undefined && out.default !== null && typeof out.default !== 'boolean') throw new Error(`${path}[${index}].default must be boolean or null.`)
		return out
	})
}

function cleanExtension(value) {
	let extension = String(value || '').trim().toLowerCase()
	while (extension.startsWith('.')) extension = extension.slice(1)
	for (const delimiter of ['?', '#', ';', ',']) {
		const index = extension.indexOf(delimiter)
		if (index >= 0) extension = extension.slice(0, index)
	}
	return extension === 'mpeg' ? 'mp3' : extension === 'quicktime' ? 'mov' : extension
}

export function validateMediaFormatOptions(value, path = 'mediaOptions', { strictPublic = false } = {}) {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	const out = { ...value }
	if (strictPublic) for (const key of Object.keys(out)) if (!PUBLIC_MEDIA_OPTION_KEYS.has(key)) throw new Error(`${path}.${key} is not part of the public media contract.`)
	if (strictPublic) for (const key of ['source', 'cover', 'path', 'link', 'data', 'assetRef']) if (out[key] !== undefined && out[key] !== null && typeof out[key] !== 'string') throw new Error(`${path}.${key} must be an authorized string reference or null.`)
	for (const [key, values] of Object.entries(ENUM_RULES)) if (out[key] !== undefined && out[key] !== null && !values.includes(String(out[key]).trim().toLowerCase())) throw new Error(`${path}.${key} must be one of ${values.join(', ')}.`)
	if (out.type !== undefined && out.type !== null) out.type = String(out.type).trim().toLowerCase()
	if (out.extn !== undefined && out.extn !== null) {
		out.extn = cleanExtension(out.extn)
		const mediaType = out.type === 'online' ? 'online' : out.type === 'audio' ? 'audio' : 'video'
		if (!MEDIA_FORMAT_EXTENSIONS[mediaType].includes(out.extn)) throw new Error(`${path}.extn must be a supported ${mediaType} extension.`)
	}
	finiteNumber(out.transparency, MEDIA_FORMAT_PARAMETERS.find(item => item.id === 'transparency'), `${path}.transparency`)
	if (out.mediaVolume !== undefined && out.mediaVolume !== null && (!Number.isInteger(out.mediaVolume) || out.mediaVolume < 0 || out.mediaVolume > 100000)) throw new Error(`${path}.mediaVolume must be an integer between 0 and 100000.`)
	if (out.sizing !== undefined) out.sizing = validateSizing(out.sizing, `${path}.sizing`)
	if (out.closedCaptionTracks !== undefined) out.closedCaptionTracks = validateCaptionTracks(out.closedCaptionTracks, `${path}.closedCaptionTracks`)
	for (const key of ['rounding', 'interactivePlayback', 'showWhenStopped', 'endOnStopAudio']) if (out[key] !== undefined && out[key] !== null && typeof out[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	return out
}

export function validatePublicMediaFormatOptions(value, path = 'mediaOptions') {
	return validateMediaFormatOptions(value, path, { strictPublic: true })
}
