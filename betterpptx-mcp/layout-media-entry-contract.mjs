// Exact authoring contract for the capability-ledger `add media` row.
// The frozen ledger historically grouped the row with slide/layout entry
// points, but its real carriers are the already exact media asset/playback and
// media-command timing contracts.  This thin aggregate keeps that ownership
// explicit without promoting the surrounding layouts/themes/masters family.

import {
	MEDIA_ASSET_PLAYBACK_SCHEMA,
	MEDIA_COMMAND_TIMING_SCHEMA,
	MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS,
	MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS,
	validateMediaAssetPlayback,
	validateMediaCommandTiming,
} from './media-image-formatting-contract.mjs'

export const LAYOUT_MEDIA_ENTRY_UNIT_ID = 'impl-a-19d4d833295297ea'
export const ADD_MEDIA_OPERATION_ROW_ID = 'cap_fe3dd8bf19be1f172579'

const SAFE_OPAQUE_MEDIA_PATTERN = '^(?:asset|generated|download|opaque|audio)://[^\\s]+$'
const SAFE_HTTPS_PATTERN = '^https://[^\\s]+$'
const SAFE_INLINE_AUDIO_PATTERN = '^data:audio/[^;,]+;base64,'
const SAFE_INLINE_VIDEO_PATTERN = '^data:video/[^;,]+;base64,'
const SAFE_POSTER_PATTERN = '^(?:(?:asset|generated|download|opaque)://[^\\s]+|https://[^\\s]+|data:image/(?:png|jpeg|svg\\+xml);base64,)'

export const MEDIA_CREATE_SOURCE_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'string', pattern: SAFE_OPAQUE_MEDIA_PATTERN },
		{ type: 'string', pattern: SAFE_HTTPS_PATTERN },
		{ type: 'string', pattern: SAFE_INLINE_AUDIO_PATTERN },
		{ type: 'string', pattern: SAFE_INLINE_VIDEO_PATTERN },
	],
	description: 'One opaque authorized media reference, HTTPS URL, or inline base64 audio/video payload.',
})

const playbackProperties = MEDIA_ASSET_PLAYBACK_SCHEMA.oneOf[1].properties
const commandObjectSchema = MEDIA_COMMAND_TIMING_SCHEMA.oneOf[1]

export const ADD_MEDIA_AUTHORING_CORE_SCHEMA = Object.freeze({
	type: 'object',
	required: ['type', 'source'],
	additionalProperties: false,
	allOf: [
		{
			if: { properties: { type: { const: 'online' } }, required: ['type'] },
			then: { properties: { source: { type: 'string', pattern: SAFE_HTTPS_PATTERN } } },
		},
		{
			if: { properties: { type: { const: 'audio' } }, required: ['type'] },
			then: { properties: {
				source: { oneOf: [
					{ type: 'string', pattern: SAFE_OPAQUE_MEDIA_PATTERN },
					{ type: 'string', pattern: SAFE_HTTPS_PATTERN },
					{ type: 'string', pattern: SAFE_INLINE_AUDIO_PATTERN },
				] },
				showWhenStopped: { type: 'null' },
			} },
		},
		{
			if: { properties: { type: { const: 'video' } }, required: ['type'] },
			then: { properties: { source: { oneOf: [
				{ type: 'string', pattern: SAFE_OPAQUE_MEDIA_PATTERN },
				{ type: 'string', pattern: SAFE_HTTPS_PATTERN },
				{ type: 'string', pattern: SAFE_INLINE_VIDEO_PATTERN },
			] } } },
		},
	],
	properties: Object.freeze({
		...playbackProperties,
		type: { type: 'string', enum: ['audio', 'video', 'online'] },
		source: MEDIA_CREATE_SOURCE_SCHEMA,
		cover: { oneOf: [{ type: 'null' }, { type: 'string', pattern: SAFE_POSTER_PATTERN }] },
		x: { type: 'number' },
		y: { type: 'number' },
		w: { type: 'number', exclusiveMinimum: 0 },
		h: { type: 'number', exclusiveMinimum: 0 },
		objectName: { type: 'string', minLength: 1, maxLength: 255 },
		altText: MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureAltText.publicSchema,
		mediaCommandTiming: {
			oneOf: [
				commandObjectSchema,
				{ type: 'array', minItems: 1, maxItems: 32, items: commandObjectSchema },
			],
		},
	}),
})

// Update remains sparse and nullable.  It is intentionally separate from the
// source-first create contract so a framing/playback reset never inherits the
// create-only type/source requirement.  The runtime enforces atomic source
// replacement and forbids clearing or changing media topology in place.
export const UPDATE_MEDIA_OPTIONS_PATCH_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		...playbackProperties,
		type: { type: 'string', enum: ['audio', 'video', 'online'] },
		source: MEDIA_CREATE_SOURCE_SCHEMA,
		x: { oneOf: [{ type: 'null' }, { type: 'number' }] },
		y: { oneOf: [{ type: 'null' }, { type: 'number' }] },
		w: { oneOf: [{ type: 'null' }, { type: 'number', exclusiveMinimum: 0 }] },
		h: { oneOf: [{ type: 'null' }, { type: 'number', exclusiveMinimum: 0 }] },
		objectName: { oneOf: [{ type: 'null' }, { type: 'string', minLength: 1, maxLength: 255 }] },
		altText: MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureAltText.publicSchema,
	}),
})

const ADD_MEDIA_CHILD_CONTRACTS = Object.freeze([
	MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS.mediaAssetPlayback,
	MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS.mediaCommandTiming,
	MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureAltText,
])

if (ADD_MEDIA_CHILD_CONTRACTS.some(contract => contract.capabilityStatus !== 'executable-exact-structured')) {
	throw new Error('add-media operation requires exact executable playback, timing, and accessibility child contracts.')
}

export const ADD_MEDIA_OPERATION_CONTRACT = Object.freeze({
	id: 'addMediaAuthoringOperation',
	schemaVersion: 'betterpptx.layout-media-entry-contract.v1',
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze([
		'media.authoringOperation', 'media.assetSource', 'media.packageRelationships', 'media.poster',
		'media.framing', 'media.playback', 'media.captionTracks', 'slide.timing.mediaCommand', 'media.accessibility',
	]),
	overrideFields: Object.freeze([
		'content[].mediaOptions.type', 'content[].mediaOptions.source', 'content[].mediaOptions.extn',
		'content[].mediaOptions.cover', 'content[].mediaOptions.sizing', 'content[].mediaOptions.transparency',
		'content[].mediaOptions.rounding', 'content[].mediaOptions.interactivePlayback',
		'content[].mediaOptions.mediaVolume', 'content[].mediaOptions.showWhenStopped',
		'content[].mediaOptions.endOnStopAudio', 'content[].mediaOptions.closedCaptionTracks',
		'content[].mediaCommandTiming.command', 'content[].mediaCommandTiming.trigger',
		'content[].mediaCommandTiming.delayMs', 'content[].mediaCommandTiming.durationMs',
		'content[].altText',
	]),
	resetBehavior: Object.freeze({
		component: 'set a resettable poster, framing, playback, caption, accessibility, or owned command component to null while retaining media identity',
		full: 'remove the media object with slide.delete_shapes; source or online-versus-packaged topology changes require delete plus add',
		nullBehavior: 'component null restores that native/default component; source is create-only and cannot be cleared while the object remains',
	}),
	precedence: Object.freeze([
		'detected payload signature and relationship topology', 'explicit compatible type and extension',
		'authored poster/framing/playback/accessibility', 'owned canonical media commands', 'sparse component reset',
	]),
	legalCombinations: Object.freeze([
		'audio or video with one opaque, HTTPS, or inline source and optional poster',
		'online media with an explicit online type and HTTPS source',
		'poster, contain/cover/crop framing, transparency, rounding, playback, volume, stopped-state behavior, captions, accessibility, and owned play/pause/stop commands together',
		'sparse reset, atomic source replacement, and reverse-order re-edit without leaking package internals',
	]),
	rowIds: Object.freeze([ADD_MEDIA_OPERATION_ROW_ID]),
	publicSchema: ADD_MEDIA_AUTHORING_CORE_SCHEMA,
	childContractIds: Object.freeze(ADD_MEDIA_CHILD_CONTRACTS.map(contract => contract.id)),
})

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
}

function rejectUnknownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public add-media contract.`)
}

function validateGeometry(value, path, { positive = false } = {}) {
	if (value === undefined) return
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (positive && value <= 0) throw new Error(`${path} must be greater than zero.`)
}

export function validateAddMediaAuthoringCore(value, path = 'addMedia') {
	plainObject(value, path)
	rejectUnknownKeys(value, Object.keys(ADD_MEDIA_AUTHORING_CORE_SCHEMA.properties), path)
	if (!Object.prototype.hasOwnProperty.call(value, 'type')) throw new Error(`${path}.type is required.`)
	if (!Object.prototype.hasOwnProperty.call(value, 'source')) throw new Error(`${path}.source is required.`)
	const playbackInput = Object.fromEntries(Object.keys(playbackProperties)
		.filter(key => Object.prototype.hasOwnProperty.call(value, key))
		.map(key => [key, value[key]]))
	const playback = validateMediaAssetPlayback(playbackInput, path)
	if (playback.type == null) throw new Error(`${path}.type cannot be null when creating media.`)
	if (playback.source == null || playback.source === '') throw new Error(`${path}.source cannot be null when creating media.`)
	if (playback.type === 'audio' && playback.showWhenStopped !== undefined && playback.showWhenStopped !== null) throw new Error(`${path}.showWhenStopped is supported only for video or online media; PowerPoint removes it from audio.`)
	for (const key of ['x', 'y']) validateGeometry(value[key], `${path}.${key}`)
	for (const key of ['w', 'h']) validateGeometry(value[key], `${path}.${key}`, { positive: true })
	if (value.objectName !== undefined && (typeof value.objectName !== 'string' || !value.objectName.trim() || value.objectName.length > 255)) throw new Error(`${path}.objectName must be a non-empty string of at most 255 characters.`)
	if (value.altText !== undefined && value.altText !== null && (typeof value.altText !== 'string' || value.altText.length > 4096)) throw new Error(`${path}.altText must be a string of at most 4096 characters or null.`)
	const out = { ...value, ...playback }
	if (Object.prototype.hasOwnProperty.call(value, 'mediaCommandTiming')) {
		const commands = Array.isArray(value.mediaCommandTiming) ? value.mediaCommandTiming : [value.mediaCommandTiming]
		if (!commands.length || commands.length > 32) throw new Error(`${path}.mediaCommandTiming must contain one to 32 commands.`)
		out.mediaCommandTiming = commands.map((command, index) => {
			const normalized = validateMediaCommandTiming(command, `${path}.mediaCommandTiming[${index}]`)
			if (!normalized || normalized.command === null) throw new Error(`${path}.mediaCommandTiming[${index}].command cannot be null when creating media.`)
			return normalized
		})
	}
	return out
}

export function mediaCommandTimingAnimation(value) {
	const command = value?.command
	if (!command) return null
	return {
		type: 'media',
		effect: command === 'stop' ? 'mediastop' : command === 'togglePause' ? 'mediapause' : 'mediaplay',
		mediaCommand: command,
		...(value.trigger !== undefined ? { trigger: value.trigger } : {}),
		...(value.delayMs !== undefined ? { delay: value.delayMs } : {}),
		...(value.durationMs !== undefined ? { duration: value.durationMs } : {}),
	}
}

export function layoutMediaEntryCapabilityContractForEntry(entry = {}) {
	if (entry.id === ADD_MEDIA_OPERATION_ROW_ID) return ADD_MEDIA_OPERATION_CONTRACT
	return null
}

export function assertLayoutMediaEntryPartition() {
	if (ADD_MEDIA_OPERATION_CONTRACT.rowIds.length !== 1 || ADD_MEDIA_OPERATION_CONTRACT.rowIds[0] !== ADD_MEDIA_OPERATION_ROW_ID) throw new Error('layout/media entry unit must own exactly the add-media row.')
	return Object.freeze({ unitId: LAYOUT_MEDIA_ENTRY_UNIT_ID, rows: 1, runtimeReady: true })
}

export const LAYOUT_MEDIA_ENTRY_PARTITION = assertLayoutMediaEntryPartition()
