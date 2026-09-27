// Shared public truth for picture/media capabilities. This composition layer
// deliberately promotes only coherent executable contracts; unrelated media,
// narration, timing, fixture, and imported-preservation rows must not inherit
// one blanket formatting signature.

import { IMAGE_ACCESSIBILITY_PARAMETERS } from './image-accessibility-catalog.mjs'
import { ANIMATION_FORMAT_PARAMETERS, validateAnimationFormatOptions } from './animation-format-catalog.mjs'
import { MEDIA_FORMAT_PARAMETERS, MEDIA_FORMAT_SCHEMA_PROPERTIES, validatePublicMediaFormatOptions } from './media-format-catalog.mjs'
import { MAX_NATIVE_PLACEHOLDER_INDEX, NATIVE_PLACEHOLDER_ORIENTATIONS, NATIVE_PLACEHOLDER_SIZES, NATIVE_PLACEHOLDER_TYPES, NATIVE_VISUAL_SURFACES, PICTURE_CORRECTION_PARAMETERS } from './ir/native-visual-primitives.mjs'
import { HYPERLINK_PUBLIC_SCHEMA, normalizeHyperlink } from './hyperlink-entry-contract.mjs'

export const IMAGE_FRAMING_MODES = Object.freeze(['contain', 'cover', 'crop'])

export const IMAGE_FRAMING_ROW_IDS = Object.freeze([
	'cap_b39ba8fc1a63b00cb72e', // crop
	'cap_86a1e026eded831b8ce6', // contain sizing
	'cap_a5513d2a8249c818af32', // cover sizing
])

export const IMPORTED_PICTURE_PRESERVATION_ROW_IDS = Object.freeze([
	'cap_036f801d86da6ab5e186', // cNvPicPr preservation
	'cap_06133dafb590be31b398', // line/fill preservation
	'cap_8aaf3155dae20f529231', // blipFill preservation
	'cap_9bb89d8cb38dd1a03c6b', // effects preservation
	'cap_49a3dd0c52973a11e9b9', // picture relationship preservation
])

const IMAGE_FRAMING_ROW_SET = new Set(IMAGE_FRAMING_ROW_IDS)
const IMPORTED_PICTURE_PRESERVATION_ROW_SET = new Set(IMPORTED_PICTURE_PRESERVATION_ROW_IDS)

export const IMAGE_FRAMING_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{
			type: 'object',
			required: ['type'],
			additionalProperties: false,
			properties: { type: { type: 'string', enum: [...IMAGE_FRAMING_MODES] } },
		},
	],
})

export const IMAGE_FRAMING_CONTRACT = Object.freeze({
	id: 'imageFraming',
	schemaVersion: 'betterpptx.image-framing-contract.v1',
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	componentOwnership: Object.freeze(['picture.blipFill.srcRect', 'picture.blipFill.stretch']),
	overrideFields: Object.freeze(['sizing.type']),
	resetBehavior: Object.freeze({
		component: 'set sizing to null or omit it to restore native stretch framing',
		full: 'remove the authored sizing selector while retaining the picture or media asset',
		nullBehavior: 'explicit null removes the authored framing mode; omission retains the current native/default frame',
	}),
	precedence: Object.freeze(['engine-owned target box', 'measured source dimensions', 'authored sizing.type']),
	legalCombinations: Object.freeze(['contain', 'cover', 'crop', 'null reset followed by sparse re-edit']),
	applicability: Object.freeze(['image', 'image-feature', 'media poster frame']),
	rowIds: IMAGE_FRAMING_ROW_IDS,
	publicSchema: IMAGE_FRAMING_SCHEMA,
})

export const IMPORTED_PICTURE_PRESERVATION_CONTRACT = Object.freeze({
	id: 'importedPicturePreservation',
	capabilityMode: 'preserve-only',
	capabilityStatus: 'preserve-imported-only',
	componentOwnership: Object.freeze(['importedPicturePayload']),
	overrideFields: Object.freeze([]),
	resetBehavior: Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' }),
	rowIds: IMPORTED_PICTURE_PRESERVATION_ROW_IDS,
})

// This residual unit intentionally uses an explicit row partition. A residual
// row is not promoted merely because one neighboring media/image carrier is
// executable. In particular, narration commands, media timing, source-format
// selectors, and public-operation aggregates stay partial until their own
// schema, readback, and reset contracts are closed.
export const MEDIA_IMAGE_RESIDUAL_ROW_RECORDS = Object.freeze([
	{ id: 'cap_0fc3299869ce3b4533c7', label: 'rotation', disposition: 'exact' },
	{ id: 'cap_1304f0f7baa2c10db5c7', label: 'flip horizontal', disposition: 'exact' },
	{ id: 'cap_17ffd7b1d5f729e5daa4', label: 'media bookmarks', disposition: 'preserve' },
	{ id: 'cap_186474948ea9361203ee', label: 'placeholders', disposition: 'partial' },
	{ id: 'cap_22df29ce753b9eac2ec1', label: 'alt text', disposition: 'exact' },
	{ id: 'cap_2e4204a3953606429ddb', label: 'media triggers', disposition: 'partial' },
	{ id: 'cap_4491438c0454078f3991', label: 'media triggers', disposition: 'partial' },
	{ id: 'cap_467c3210970983de8528', label: 'media play animation', disposition: 'partial' },
	{ id: 'cap_49139a9d4c35581b2bda', label: 'crop metadata', disposition: 'preserve' },
	{ id: 'cap_4d2b961aac55c8821408', label: 'hyperlinks', disposition: 'partial' },
	{ id: 'cap_4ec27467aeb03de12caa', label: 'media bookmarks', disposition: 'preserve' },
	{ id: 'cap_5423bb185bb8bc0da4e4', label: 'online media', disposition: 'partial' },
	{ id: 'cap_54cdbe0309c2f63dfd51', label: 'file path images', disposition: 'partial' },
	{ id: 'cap_58ea23b888da72a842ba', label: 'media pause animation', disposition: 'partial' },
	{ id: 'cap_789cc1020eb8d8dae2db', label: 'section voice cues', disposition: 'partial' },
	{ id: 'cap_7ac30aa72e0a6aa03e81', label: 'data/base64 images', disposition: 'partial' },
	{ id: 'cap_7db8092e40c3e870d0a3', label: 'Images, video, and identity media', disposition: 'partial' },
	{ id: 'cap_7e6539de019bedf5cc86', label: 'path/link sources', disposition: 'partial' },
	{ id: 'cap_8aa16e80707336884f99', label: 'audio', disposition: 'partial' },
	{ id: 'cap_8f3285e603fe534ecf24', label: 'voice artifact retrieval', disposition: 'partial' },
	{ id: 'cap_8fde26929b89a17dec2d', label: 'bundled sample image', disposition: 'missing' },
	{ id: 'cap_96b33f7237875a4a33c9', label: 'bundled sample audio', disposition: 'missing' },
	{ id: 'cap_96bc73dd18c64793b1f8', label: 'audio pause command', disposition: 'partial' },
	{ id: 'cap_9e36f8c64dec7c481ff3', label: 'audio play command', disposition: 'partial' },
	{ id: 'cap_a06df5de402589e2f419', label: 'native media relationship preservation', disposition: 'preserve' },
	{ id: 'cap_a54941c0b1ae43cf8ce4', label: 'SVG', disposition: 'partial' },
	{ id: 'cap_aa6f469cc00bd5c21fd1', label: 'rounding', disposition: 'partial' },
	{ id: 'cap_af71409ee64242446c8e', label: 'betterpptx-mcp.object.insert_media', disposition: 'partial' },
	{ id: 'cap_b951a2540cf0b0977727', label: 'autoplay narration timing', disposition: 'partial' },
	{ id: 'cap_bb80eaa8706cf3b79956', label: 'JPEG', disposition: 'partial' },
	{ id: 'cap_c71d6877d5f7dd59c08c', label: 'real TTS narration generation', disposition: 'partial' },
	{ id: 'cap_c78f5b9ef3353630506f', label: 'shadows', disposition: 'exact' },
	{ id: 'cap_d17b6354985cae4bcf95', label: 'transparency', disposition: 'exact' },
	{ id: 'cap_d509f68eadc30aa08563', label: 'flip vertical', disposition: 'exact' },
	{ id: 'cap_d99504f46637c14548a5', label: 'interactive playback', disposition: 'partial' },
	{ id: 'cap_db200cfb83ccf89b2571', label: 'audio relationship validation', disposition: 'not-applicable' },
	{ id: 'cap_de3d1e14dc755754cf2c', label: 'media stop animation', disposition: 'partial' },
	{ id: 'cap_dfcc7a5586acc500f3f2', label: 'extension handling', disposition: 'partial' },
	{ id: 'cap_e02a7e20df124d4fe45f', label: 'PNG', disposition: 'partial' },
	{ id: 'cap_e08e78a4833dfb363f47', label: 'media cover image', disposition: 'partial' },
	{ id: 'cap_e291d933c6711628be5d', label: 'audio waveform visual fixture', disposition: 'not-live' },
	{ id: 'cap_e9f5842459a942e7a481', label: 'video', disposition: 'partial' },
	{ id: 'cap_eecf0665821860d0b2ca', label: 'narration audio embedding', disposition: 'partial' },
	{ id: 'cap_f9809dc5ac597c14c457', label: 'audio stop command', disposition: 'partial' },
].map(record => Object.freeze(record)))

function residualIdsFor(disposition) {
	return Object.freeze(MEDIA_IMAGE_RESIDUAL_ROW_RECORDS.filter(record => record.disposition === disposition).map(record => record.id))
}

export const MEDIA_IMAGE_RESIDUAL_ROW_IDS = Object.freeze(MEDIA_IMAGE_RESIDUAL_ROW_RECORDS.map(record => record.id))
export const MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS = residualIdsFor('exact')
export const MEDIA_IMAGE_RESIDUAL_PRESERVE_ROW_IDS = residualIdsFor('preserve')
export const MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_ROW_IDS = residualIdsFor('not-applicable')
export const MEDIA_IMAGE_RESIDUAL_NOT_LIVE_ROW_IDS = residualIdsFor('not-live')
export const MEDIA_IMAGE_RESIDUAL_MISSING_ROW_IDS = residualIdsFor('missing')
export const MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS = residualIdsFor('partial')

export const MEDIA_IMAGE_RESIDUAL_DISPOSITION_BY_ROW_ID = Object.freeze(Object.fromEntries(
	MEDIA_IMAGE_RESIDUAL_ROW_RECORDS.map(record => [record.id, record]),
))

const NATIVE_VISUAL_SURFACE_BY_ID = Object.freeze(Object.fromEntries(NATIVE_VISUAL_SURFACES.map(surface => [surface.id, surface])))
const ALT_TEXT_SOURCE_PARAMETER = IMAGE_ACCESSIBILITY_PARAMETERS.find(parameter => parameter.id === 'altText')
const ROTATION_SOURCE_SURFACE = NATIVE_VISUAL_SURFACE_BY_ID.objectRotation
const FLIP_SOURCE_SURFACE = NATIVE_VISUAL_SURFACE_BY_ID.objectFlip
const SHADOW_SOURCE_SURFACE = NATIVE_VISUAL_SURFACE_BY_ID.shadow

function exactSourceContract(id, source, parameters) {
	if (!source || source.capabilityStatus !== 'executable-exact-structured') throw new Error(`${id} requires an existing executable exact source contract.`)
	if (!Array.isArray(parameters) || !parameters.length || parameters.some(parameter => parameter.capabilityStatus && parameter.capabilityStatus !== 'executable-exact-structured')) throw new Error(`${id} requires executable exact source parameters.`)
	return Object.freeze({
		id,
		capabilityStatus: 'executable-exact-structured',
		...(source.componentOwnership ? { componentOwnership: source.componentOwnership } : {}),
		...(source.overrideFields ? { overrideFields: source.overrideFields } : {}),
		...(source.resetBehavior ? { resetBehavior: source.resetBehavior } : {}),
		...(source.schema ? { schema: source.schema } : {}),
		parameters: Object.freeze([...parameters]),
	})
}

const PICTURE_ALT_TEXT_CONTRACT = Object.freeze({
	id: 'pictureAltText',
	schemaVersion: 'betterpptx.picture-alt-text-contract.v1',
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	componentOwnership: Object.freeze(['picture.cNvPr.descr']),
	overrideFields: Object.freeze(['altText']),
	resetBehavior: Object.freeze({
		component: 'set altText to null',
		full: 'remove the authored picture description while retaining the picture asset',
		nullBehavior: 'explicit null removes the authored description; omission preserves the current description',
	}),
	precedence: Object.freeze(['existing picture description', 'authored altText']),
	legalCombinations: Object.freeze(['altText with framing, rotation, flip, transparency, or shadow', 'null reset followed by sparse re-edit']),
	rowIds: Object.freeze(['cap_22df29ce753b9eac2ec1']),
	publicSchema: Object.freeze({ oneOf: [{ type: 'null' }, { type: 'string', minLength: 1, maxLength: 1000 }] }),
	sourceContract: exactSourceContract('imageAccessibility.altText', { capabilityStatus: ALT_TEXT_SOURCE_PARAMETER?.capabilityStatus }, [ALT_TEXT_SOURCE_PARAMETER]),
})

function createPictureTransformLeafContract({ id, rowId, field, component, valueSchema, valueDescription, sourceSurface, sourceParameter }) {
	return Object.freeze({
		id,
		schemaVersion: 'betterpptx.picture-transform-leaf-contract.v1',
		capabilityMode: 'parameterized',
		capabilityStatus: 'executable-exact-structured',
		componentOwnership: Object.freeze([component]),
		overrideFields: Object.freeze([field]),
		resetBehavior: Object.freeze({
			component: `set ${field} to null`,
			full: `remove the authored ${valueDescription} while retaining the picture asset`,
			nullBehavior: `explicit null restores the native/default ${valueDescription}; omission preserves the current value`,
		}),
		precedence: Object.freeze(['native/default picture transform', `authored ${field}`]),
		legalCombinations: Object.freeze([`${field} with framing, transparency, shadow, and the other picture transforms`, 'null reset followed by sparse re-edit']),
		rowIds: Object.freeze([rowId]),
		publicSchema: Object.freeze({ oneOf: [{ type: 'null' }, valueSchema] }),
		sourceContract: exactSourceContract(`nativeVisual.${sourceSurface.id}.${sourceParameter.id}`, sourceSurface, [sourceParameter]),
	})
}

const PICTURE_ROTATION_CONTRACT = createPictureTransformLeafContract({
	id: 'pictureRotation', rowId: 'cap_0fc3299869ce3b4533c7', field: 'rotate', component: 'shape.transform.rotation',
	valueSchema: Object.freeze({ type: 'number', minimum: -360, maximum: 360, multipleOf: 1 / 60000 }), valueDescription: 'rotation', sourceSurface: ROTATION_SOURCE_SURFACE,
	sourceParameter: ROTATION_SOURCE_SURFACE.parameters.find(parameter => parameter.id === 'rotationDegrees'),
})
const PICTURE_FLIP_HORIZONTAL_CONTRACT = createPictureTransformLeafContract({
	id: 'pictureFlipHorizontal', rowId: 'cap_1304f0f7baa2c10db5c7', field: 'flipH', component: 'shape.transform.flipH',
	valueSchema: Object.freeze({ type: 'boolean' }), valueDescription: 'horizontal flip', sourceSurface: FLIP_SOURCE_SURFACE,
	sourceParameter: FLIP_SOURCE_SURFACE.parameters.find(parameter => parameter.id === 'flipH'),
})
const PICTURE_FLIP_VERTICAL_CONTRACT = createPictureTransformLeafContract({
	id: 'pictureFlipVertical', rowId: 'cap_d509f68eadc30aa08563', field: 'flipV', component: 'shape.transform.flipV',
	valueSchema: Object.freeze({ type: 'boolean' }), valueDescription: 'vertical flip', sourceSurface: FLIP_SOURCE_SURFACE,
	sourceParameter: FLIP_SOURCE_SURFACE.parameters.find(parameter => parameter.id === 'flipV'),
})

const PICTURE_SHADOW_CONTRACT = Object.freeze({
	id: 'pictureShadow',
	schemaVersion: 'betterpptx.picture-shadow-contract.v1',
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	componentOwnership: SHADOW_SOURCE_SURFACE.componentOwnership,
	overrideFields: SHADOW_SOURCE_SURFACE.overrideFields,
	resetBehavior: Object.freeze({
		component: 'set shadow to null or shadow.type to none',
		full: 'remove the authored picture shadow while retaining the picture asset and other effects',
		nullBehavior: 'explicit null removes the authored shadow; omission preserves the current shadow',
	}),
	precedence: Object.freeze(['native/default picture effects', 'authored shadow object', 'shadow.type none or null reset']),
	legalCombinations: Object.freeze(['shadow with framing, rotation, flip, and transparency', 'null reset followed by sparse shadow re-edit']),
	rowIds: Object.freeze(['cap_c78f5b9ef3353630506f']),
	publicSchema: Object.freeze({
		oneOf: [{ type: 'null' }, {
			type: 'object', additionalProperties: false,
			properties: {
				type: { type: 'string', enum: ['outer', 'inner', 'none'] },
				color: { type: 'string', pattern: '^[#]?[0-9A-Fa-f]{6}$' },
				opacity: { type: 'number', minimum: 0, maximum: 1 },
				blurPt: { type: 'number', minimum: 0, maximum: 100 },
				distancePt: { type: 'number', minimum: 0, maximum: 200 },
				angleDeg: { type: 'number', minimum: 0, maximum: 359 },
				scaleX: { type: 'number', minimum: 0, maximum: 2 }, scaleY: { type: 'number', minimum: 0, maximum: 2 },
				skewXDeg: { type: 'number', exclusiveMinimum: -90, exclusiveMaximum: 90 }, skewYDeg: { type: 'number', exclusiveMinimum: -90, exclusiveMaximum: 90 },
				rotateWithShape: { type: 'boolean' },
			},
		}],
	}),
	sourceContract: exactSourceContract('nativeVisual.shadow', SHADOW_SOURCE_SURFACE, SHADOW_SOURCE_SURFACE.parameters),
})

const PICTURE_TRANSPARENCY_CONTRACT = Object.freeze({
	id: 'pictureTransparency',
	schemaVersion: 'betterpptx.picture-transparency-contract.v1',
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	componentOwnership: Object.freeze(['picture.blip.alpha']),
	overrideFields: Object.freeze(['transparency']),
	resetBehavior: Object.freeze({
		component: 'set transparency to null or 0',
		full: 'remove the authored picture transparency while retaining the picture asset and other adjustments',
		nullBehavior: 'explicit null restores fully opaque native rendering; omission preserves the current transparency',
	}),
	precedence: Object.freeze(['native/default opaque picture', 'authored transparency']),
	legalCombinations: Object.freeze(['transparency with framing, rotation, flip, and shadow', 'null reset followed by sparse re-edit']),
	rowIds: Object.freeze(['cap_d17b6354985cae4bcf95']),
	publicSchema: Object.freeze({ oneOf: [{ type: 'null' }, { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.001 }] }),
	sourceContract: exactSourceContract('nativeVisual.imageAdjustments.transparency', NATIVE_VISUAL_SURFACE_BY_ID.imageAdjustments, [Object.freeze({
		id: 'transparency',
		capabilityStatus: NATIVE_VISUAL_SURFACE_BY_ID.imageAdjustments.capabilityStatus,
		...PICTURE_CORRECTION_PARAMETERS.transparency,
	})]),
})

export const MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS = Object.freeze({
	pictureAltText: PICTURE_ALT_TEXT_CONTRACT,
	pictureRotation: PICTURE_ROTATION_CONTRACT,
	pictureFlipHorizontal: PICTURE_FLIP_HORIZONTAL_CONTRACT,
	pictureFlipVertical: PICTURE_FLIP_VERTICAL_CONTRACT,
	pictureShadow: PICTURE_SHADOW_CONTRACT,
	pictureTransparency: PICTURE_TRANSPARENCY_CONTRACT,
})

export const MEDIA_IMAGE_RESIDUAL_PRESERVATION_CONTRACT = Object.freeze({
	id: 'residualImportedPictureMediaPreservation',
	capabilityMode: 'preserve-only',
	capabilityStatus: 'preserve-imported-only',
	componentOwnership: Object.freeze(['importedPictureCropMetadata', 'importedMediaTiming', 'importedMediaRelationship']),
	overrideFields: Object.freeze([]),
	resetBehavior: Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' }),
	rowIds: MEDIA_IMAGE_RESIDUAL_PRESERVE_ROW_IDS,
})

export const MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_CONTRACT = Object.freeze({
	id: 'audioRelationshipValidationOnly',
	capabilityMode: 'missing',
	capabilityStatus: 'not-applicable',
	componentOwnership: Object.freeze(['validationOnly']),
	overrideFields: Object.freeze([]),
	resetBehavior: Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' }),
	rowIds: MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_ROW_IDS,
})

export const MEDIA_IMAGE_RESIDUAL_NOT_LIVE_CONTRACT = Object.freeze({
	id: 'audioWaveformVisualFixture',
	capabilityMode: 'missing',
	capabilityStatus: 'not-live-in-saved-package',
	componentOwnership: Object.freeze(['showcaseFixture']),
	overrideFields: Object.freeze([]),
	resetBehavior: Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' }),
	rowIds: MEDIA_IMAGE_RESIDUAL_NOT_LIVE_ROW_IDS,
})

export const MEDIA_IMAGE_RESIDUAL_MISSING_CONTRACT = Object.freeze({
	id: 'bundledMediaFixtureMissing',
	capabilityMode: 'missing',
	capabilityStatus: 'missing',
	componentOwnership: Object.freeze([]),
	overrideFields: Object.freeze([]),
	resetBehavior: Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' }),
	rowIds: MEDIA_IMAGE_RESIDUAL_MISSING_ROW_IDS,
})

// impl-a-8f45d7c68cd7c448 -------------------------------------------------------
//
// The remaining 30 rows are a generated composition unit, not one formatting
// primitive. Each bucket is promoted only after its engine, native package,
// safe readback, reset, and black-box proof gates are closed.

export const MEDIA_IMAGE_EXACT_UNIT_ID = 'impl-a-8f45d7c68cd7c448'

export const MEDIA_IMAGE_EXACT_RUNTIME_READINESS = Object.freeze({
	imageAssetSource: true,
	pictureAdjuncts: true,
	mediaAssetPlayback: true,
	mediaCommandTiming: true,
	narrationProvider: true,
	legacyAndAggregate: true,
})

export const IMAGE_ASSET_FORMATS = Object.freeze(['png', 'jpeg', 'svg'])
export const IMAGE_ASSET_SOURCE_KINDS = Object.freeze(['inline', 'asset', 'https'])
export const MEDIA_COMMANDS = Object.freeze(['playFrom(non-negative-seconds)', 'togglePause', 'stop'])
export const MEDIA_COMMAND_TRIGGERS = Object.freeze(['onClick', 'withPrevious', 'afterPrevious'])
export const NARRATION_AUTHORING_MODES = Object.freeze(['synthesize', 'attach', 'retrieve'])

const PUBLIC_ASSET_REF_PATTERN = '^(?:asset|generated|download|opaque|audio)://[^\\s]+$'
const HTTPS_REF_PATTERN = '^https://[^\\s]+$'

const IMAGE_INLINE_SOURCE_SCHEMA = Object.freeze({
	type: 'object', required: ['kind', 'data'], additionalProperties: false,
	properties: {
		kind: { const: 'inline' },
		data: { type: 'string', pattern: '^data:image/(?:png|jpeg|svg\\+xml);base64,' },
		format: { type: 'string', enum: [...IMAGE_ASSET_FORMATS] },
	},
})
const IMAGE_ASSET_REF_SCHEMA = Object.freeze({
	type: 'object', required: ['kind', 'ref'], additionalProperties: false,
	properties: {
		kind: { const: 'asset' }, ref: { type: 'string', pattern: PUBLIC_ASSET_REF_PATTERN },
		format: { type: 'string', enum: [...IMAGE_ASSET_FORMATS] },
	},
})
const IMAGE_HTTPS_SOURCE_SCHEMA = Object.freeze({
	type: 'object', required: ['kind', 'url'], additionalProperties: false,
	properties: {
		kind: { const: 'https' }, url: { type: 'string', pattern: HTTPS_REF_PATTERN },
		format: { type: 'string', enum: [...IMAGE_ASSET_FORMATS] },
	},
})

export const IMAGE_ASSET_SOURCE_SCHEMA = Object.freeze({
	oneOf: [{ type: 'null' }, IMAGE_INLINE_SOURCE_SCHEMA, IMAGE_ASSET_REF_SCHEMA, IMAGE_HTTPS_SOURCE_SCHEMA],
})

const HYPERLINK_SCHEMA = HYPERLINK_PUBLIC_SCHEMA

const PLACEHOLDER_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{ type: 'string', enum: [...NATIVE_PLACEHOLDER_TYPES] },
		{
			type: 'object', required: ['type'], additionalProperties: false,
			allOf: [{ if: { properties: { type: { const: 'clipArt' } }, required: ['type'] }, then: { not: { required: ['orient'] } } }],
			properties: {
				type: { type: 'string', enum: [...NATIVE_PLACEHOLDER_TYPES] },
				idx: { type: 'integer', minimum: 0, maximum: MAX_NATIVE_PLACEHOLDER_INDEX },
				size: { type: 'string', enum: [...NATIVE_PLACEHOLDER_SIZES] },
				orient: { type: 'string', enum: [...NATIVE_PLACEHOLDER_ORIENTATIONS] },
				hasCustomPrompt: { type: 'boolean' },
			},
		},
	],
})

export const PICTURE_ADJUNCTS_SCHEMA = Object.freeze({
	oneOf: [{ type: 'null' }, {
		type: 'object', additionalProperties: false,
		properties: {
			rounding: { oneOf: [{ type: 'null' }, { type: 'boolean' }] },
			hyperlink: HYPERLINK_SCHEMA,
			placeholder: PLACEHOLDER_SCHEMA,
		},
	}],
})

export const MEDIA_ASSET_PLAYBACK_SCHEMA = Object.freeze({
	oneOf: [{ type: 'null' }, {
		type: 'object', additionalProperties: false,
		properties: Object.freeze(Object.fromEntries(
			Object.entries(MEDIA_FORMAT_SCHEMA_PROPERTIES).filter(([id]) => id !== 'source').concat([
				['source', { oneOf: [{ type: 'null' }, { type: 'string', description: 'Opaque authorized media reference, HTTPS URL, or inline media data.' }] }],
			]),
		)),
	}],
})

export const MEDIA_COMMAND_TIMING_SCHEMA = Object.freeze({
	oneOf: [{ type: 'null' }, {
		type: 'object', required: ['command'], additionalProperties: false,
		properties: {
			command: { oneOf: [{ type: 'null' }, { type: 'string', pattern: '^(?:playFrom\\((?:0|[1-9]\\d*)(?:\\.\\d+)?\\)|togglePause|stop)$' }] },
			trigger: { type: 'string', enum: [...MEDIA_COMMAND_TRIGGERS] },
			delayMs: { type: 'integer', minimum: 0, maximum: 86400000 },
			durationMs: { type: 'integer', minimum: 0, maximum: 86400000 },
			replaceExistingCommands: { type: 'boolean' },
			preserveExistingTiming: { type: 'boolean' },
		},
	}],
})

const NARRATION_CUE_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		atMs: { type: 'integer', minimum: 0, maximum: 86400000 },
		atPhrase: { type: 'string', minLength: 1, maxLength: 1000 },
		atWord: { type: 'string', minLength: 1, maxLength: 200 },
		target: { type: 'string', minLength: 1, maxLength: 255 },
		effect: { type: 'string', minLength: 1, maxLength: 128 },
		durationMs: { type: 'integer', minimum: 1, maximum: 86400000 },
		text: { type: 'string', maxLength: 4000 },
	},
	anyOf: [{ required: ['atMs'] }, { required: ['atPhrase'] }, { required: ['atWord'] }],
})

export const NARRATION_PROVIDER_SCHEMA = Object.freeze({
	oneOf: [{ type: 'null' }, {
		type: 'object', required: ['mode'], additionalProperties: false,
		properties: {
			mode: { type: 'string', enum: [...NARRATION_AUTHORING_MODES] },
			text: { type: 'string', minLength: 1, maxLength: 100000 },
			audioRef: { type: 'string', pattern: '^(?:(?:asset|generated|download|opaque|audio)://\\S+|https://\\S+|data:audio/[^;]+;base64,.*)$' },
				voiceId: { type: 'string', minLength: 1, maxLength: 255 },
				language: { type: 'string', pattern: '^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$', maxLength: 35 },
				gender: { type: 'string', enum: ['female', 'male'] },
				cues: { type: 'array', maxItems: 256, items: NARRATION_CUE_SCHEMA },
			timing: {
				type: 'object', additionalProperties: false,
				properties: {
					startDelayMs: { type: 'integer', minimum: 0, maximum: 86400000 },
					paddingMs: { type: 'integer', minimum: 0, maximum: 86400000 },
					expectedDurationMs: { type: 'integer', minimum: 1, maximum: 86400000 },
					timingToleranceMs: { type: 'integer', minimum: 0, maximum: 86400000 },
				},
			},
			autoplay: {
				type: 'object', additionalProperties: false,
				properties: {
					enabled: { type: 'boolean' }, loop: { type: 'boolean' },
					mode: { type: 'string', enum: ['present', 'browse', 'kiosk'] },
				},
			},
		},
	}],
})

export const LEGACY_AGGREGATE_SCHEMA = Object.freeze({
	oneOf: [
		{
			type: 'object', required: ['kind', 'replacement'], additionalProperties: false,
			properties: {
				kind: { const: 'legacyRedirect' },
				replacement: { const: 'betterpptx.slide.add_media' },
			},
		},
		{
			type: 'object', required: ['kind', 'family'], additionalProperties: false,
			properties: {
				kind: { const: 'familyAggregate' },
				family: { const: 'media-images-avatar' },
			},
		},
	],
})

function exactContractObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	return value
}

function rejectUnknownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public contract.`)
}

function normalizedImageFormat(value, path) {
	if (value === undefined || value === null) return value
	const format = String(value).trim().toLowerCase().replace(/^jpg$/, 'jpeg').replace(/^svg\+xml$/, 'svg')
	if (!IMAGE_ASSET_FORMATS.includes(format)) throw new Error(`${path} must be png, jpeg, or svg.`)
	return format
}

function isSafeOpaqueReference(value) {
	return typeof value === 'string' && /^(?:asset|generated|download|opaque|audio):\/\/\S+$/i.test(value.trim())
}

function isSafeHttpsReference(value) {
	return typeof value === 'string' && /^https:\/\/\S+$/i.test(value.trim())
}

function assertPublicAssetReference(value, path, { allowImageData = false, allowMediaData = false, allowAudioData = false } = {}) {
	if (value === null) return value
	if (isSafeOpaqueReference(value) || isSafeHttpsReference(value)) return String(value).trim()
	if (allowImageData && typeof value === 'string' && /^data:image\/(?:png|jpeg|svg\+xml);base64,/i.test(value)) return value
	if (allowMediaData && typeof value === 'string' && /^data:(?:audio|video)\/[^;,]+;base64,/i.test(value)) return value
	if (allowAudioData && typeof value === 'string' && /^data:audio\/[^;,]+;base64,/i.test(value)) return value
	throw new Error(`${path} must be an opaque authorized reference, HTTPS URL, or supported inline data reference.`)
}

export function validateImageAssetSource(value, path = 'imageSource') {
	if (value === undefined || value === null) return value
	exactContractObject(value, path)
	const kind = String(value.kind || '').trim().toLowerCase()
	if (!IMAGE_ASSET_SOURCE_KINDS.includes(kind)) throw new Error(`${path}.kind must be inline, asset, or https.`)
	const allowed = kind === 'inline' ? ['kind', 'data', 'format'] : kind === 'asset' ? ['kind', 'ref', 'format'] : ['kind', 'url', 'format']
	rejectUnknownKeys(value, allowed, path)
	const format = normalizedImageFormat(value.format, `${path}.format`)
	if (kind === 'inline') {
		if (typeof value.data !== 'string' || !/^data:image\/(?:png|jpeg|svg\+xml);base64,/i.test(value.data)) throw new Error(`${path}.data must be inline PNG, JPEG, or SVG base64 data.`)
		const mimeFormat = /^data:image\/png/i.test(value.data) ? 'png' : /^data:image\/jpeg/i.test(value.data) ? 'jpeg' : 'svg'
		if (format && format !== mimeFormat) throw new Error(`${path}.format must agree with the inline MIME type.`)
		return { kind, data: value.data, format: format || mimeFormat }
	}
	if (kind === 'asset') {
		if (!isSafeOpaqueReference(value.ref)) throw new Error(`${path}.ref must be an opaque authorized asset reference.`)
		return { kind, ref: String(value.ref).trim(), ...(format ? { format } : {}) }
	}
	if (!isSafeHttpsReference(value.url)) throw new Error(`${path}.url must be an HTTPS URL.`)
	return { kind, url: String(value.url).trim(), ...(format ? { format } : {}) }
}

function validateHyperlink(value, path) {
	return normalizeHyperlink(value, path)
}

function validatePlaceholder(value, path) {
	if (value === undefined || value === null) return value
	if (typeof value === 'string') {
		if (!NATIVE_PLACEHOLDER_TYPES.includes(value)) throw new Error(`${path} must name a native placeholder type.`)
		return value
	}
	exactContractObject(value, path)
	rejectUnknownKeys(value, ['type', 'idx', 'size', 'orient', 'hasCustomPrompt'], path)
	if (!NATIVE_PLACEHOLDER_TYPES.includes(value.type)) throw new Error(`${path}.type must name a native placeholder type.`)
	if (value.idx !== undefined && (!Number.isInteger(value.idx) || value.idx < 0 || value.idx > MAX_NATIVE_PLACEHOLDER_INDEX)) throw new Error(`${path}.idx must be an unsigned 32-bit integer.`)
	if (value.size !== undefined && !NATIVE_PLACEHOLDER_SIZES.includes(value.size)) throw new Error(`${path}.size must be full, half, or quarter.`)
	if (value.orient !== undefined && !NATIVE_PLACEHOLDER_ORIENTATIONS.includes(value.orient)) throw new Error(`${path}.orient must be horz or vert.`)
	if (value.type === 'clipArt' && value.orient !== undefined) throw new Error(`${path}.orient is not applicable to clipArt placeholders because PowerPoint canonicalizes it away on save.`)
	if (value.hasCustomPrompt !== undefined && typeof value.hasCustomPrompt !== 'boolean') throw new Error(`${path}.hasCustomPrompt must be boolean.`)
	return { ...value }
}

export function validatePictureAdjuncts(value, path = 'pictureAdjuncts') {
	if (value === undefined || value === null) return value
	exactContractObject(value, path)
	rejectUnknownKeys(value, ['rounding', 'hyperlink', 'placeholder'], path)
	if (value.rounding !== undefined && value.rounding !== null && typeof value.rounding !== 'boolean') throw new Error(`${path}.rounding must be boolean or null.`)
	return {
		...(Object.prototype.hasOwnProperty.call(value, 'rounding') ? { rounding: value.rounding } : {}),
		...(Object.prototype.hasOwnProperty.call(value, 'hyperlink') ? { hyperlink: validateHyperlink(value.hyperlink, `${path}.hyperlink`) } : {}),
		...(Object.prototype.hasOwnProperty.call(value, 'placeholder') ? { placeholder: validatePlaceholder(value.placeholder, `${path}.placeholder`) } : {}),
	}
}

export function validateMediaAssetPlayback(value, path = 'mediaAssetPlayback') {
	if (value === undefined || value === null) return value
	exactContractObject(value, path)
	const normalized = validatePublicMediaFormatOptions(value, path)
	if (Object.prototype.hasOwnProperty.call(normalized, 'source') && normalized.source !== null) normalized.source = assertPublicAssetReference(normalized.source, `${path}.source`, { allowMediaData: true })
	if (Object.prototype.hasOwnProperty.call(normalized, 'cover') && normalized.cover !== null) normalized.cover = assertPublicAssetReference(normalized.cover, `${path}.cover`, { allowImageData: true })
	if (normalized.type === 'online' && normalized.source != null && !isSafeHttpsReference(normalized.source)) throw new Error(`${path}.source must be HTTPS when type is online.`)
	if (normalized.type === 'audio' && typeof normalized.source === 'string' && /^data:video\//i.test(normalized.source)) throw new Error(`${path}.source inline MIME must agree with type audio.`)
	if (normalized.type === 'video' && typeof normalized.source === 'string' && /^data:audio\//i.test(normalized.source)) throw new Error(`${path}.source inline MIME must agree with type video.`)
	return normalized
}

function effectForMediaCommand(command) {
	return command === 'stop' ? 'mediastop' : command === 'togglePause' ? 'mediapause' : 'mediaplay'
}

export function validateMediaCommandTiming(value, path = 'mediaCommandTiming') {
	if (value === undefined || value === null) return value
	exactContractObject(value, path)
	rejectUnknownKeys(value, ['command', 'trigger', 'delayMs', 'durationMs', 'replaceExistingCommands', 'preserveExistingTiming'], path)
	if (!Object.prototype.hasOwnProperty.call(value, 'command')) throw new Error(`${path}.command is required.`)
	for (const key of ['replaceExistingCommands', 'preserveExistingTiming']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean.`)
	if (value.command === null) return { ...value }
	const animation = validateAnimationFormatOptions({
		type: 'media', effect: effectForMediaCommand(value.command), mediaCommand: value.command,
		trigger: value.trigger, delayMs: value.delayMs, durationMs: value.durationMs,
	}, path)
	return {
		command: animation.mediaCommand,
		...(animation.trigger !== undefined ? { trigger: animation.trigger } : {}),
		...(animation.delay !== undefined ? { delayMs: animation.delay } : {}),
		...(animation.duration !== undefined ? { durationMs: animation.duration } : {}),
		...(value.replaceExistingCommands !== undefined ? { replaceExistingCommands: value.replaceExistingCommands } : {}),
		...(value.preserveExistingTiming !== undefined ? { preserveExistingTiming: value.preserveExistingTiming } : {}),
	}
}

function narrationInteger(value, path, { minimum = 0, maximum = 86400000 } = {}) {
	if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${path} must be an integer between ${minimum} and ${maximum}.`)
	return value
}

function validateNarrationCue(value, path) {
	exactContractObject(value, path)
	rejectUnknownKeys(value, ['atMs', 'atPhrase', 'atWord', 'target', 'effect', 'durationMs', 'text'], path)
	const anchors = ['atMs', 'atPhrase', 'atWord'].filter(key => value[key] !== undefined)
	if (anchors.length !== 1) throw new Error(`${path} must own exactly one cue anchor: atMs, atPhrase, or atWord.`)
	if (value.atMs !== undefined) narrationInteger(value.atMs, `${path}.atMs`)
	for (const key of ['atPhrase', 'atWord', 'target', 'effect']) if (value[key] !== undefined && (typeof value[key] !== 'string' || !value[key].trim())) throw new Error(`${path}.${key} must be a non-empty string.`)
	if (value.durationMs !== undefined) narrationInteger(value.durationMs, `${path}.durationMs`, { minimum: 1 })
	if (value.text !== undefined && (typeof value.text !== 'string' || value.text.length > 4000)) throw new Error(`${path}.text must be a string of at most 4000 characters.`)
	return { ...value }
}

export function validateNarrationProvider(value, path = 'narration') {
	if (value === undefined || value === null) return value
	exactContractObject(value, path)
	rejectUnknownKeys(value, ['mode', 'text', 'audioRef', 'voiceId', 'language', 'gender', 'cues', 'timing', 'autoplay'], path)
	if (!NARRATION_AUTHORING_MODES.includes(value.mode)) throw new Error(`${path}.mode must be synthesize, attach, or retrieve.`)
	if (value.text !== undefined && (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 100000)) throw new Error(`${path}.text must be a non-empty string of at most 100000 characters.`)
	if (value.mode === 'synthesize' && !value.text) throw new Error(`${path}.text is required for synthesize mode.`)
	if (['attach', 'retrieve'].includes(value.mode) && !value.audioRef) throw new Error(`${path}.audioRef is required for ${value.mode} mode.`)
	if (value.audioRef !== undefined) assertPublicAssetReference(value.audioRef, `${path}.audioRef`, { allowAudioData: true })
	if (value.voiceId !== undefined && (typeof value.voiceId !== 'string' || !value.voiceId.trim() || value.voiceId.length > 255)) throw new Error(`${path}.voiceId must be a non-empty string of at most 255 characters.`)
	if (value.language !== undefined && (typeof value.language !== 'string' || value.language.length > 35 || !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value.language))) throw new Error(`${path}.language must be a BCP-47 language tag.`)
	if (value.gender !== undefined && !['female', 'male'].includes(value.gender)) throw new Error(`${path}.gender must be female or male.`)
	if (value.cues !== undefined) {
		if (!Array.isArray(value.cues) || value.cues.length > 256) throw new Error(`${path}.cues must be an array of at most 256 cues.`)
		value.cues.forEach((cue, index) => validateNarrationCue(cue, `${path}.cues[${index}]`))
	}
	if (value.timing !== undefined) {
		exactContractObject(value.timing, `${path}.timing`)
		rejectUnknownKeys(value.timing, ['startDelayMs', 'paddingMs', 'expectedDurationMs', 'timingToleranceMs'], `${path}.timing`)
		for (const key of ['startDelayMs', 'paddingMs', 'timingToleranceMs']) if (value.timing[key] !== undefined) narrationInteger(value.timing[key], `${path}.timing.${key}`)
		if (value.timing.expectedDurationMs !== undefined) narrationInteger(value.timing.expectedDurationMs, `${path}.timing.expectedDurationMs`, { minimum: 1 })
	}
	if (value.autoplay !== undefined) {
		exactContractObject(value.autoplay, `${path}.autoplay`)
		rejectUnknownKeys(value.autoplay, ['enabled', 'loop', 'mode'], `${path}.autoplay`)
		for (const key of ['enabled', 'loop']) if (value.autoplay[key] !== undefined && typeof value.autoplay[key] !== 'boolean') throw new Error(`${path}.autoplay.${key} must be boolean.`)
		if (value.autoplay.mode !== undefined && !['present', 'browse', 'kiosk'].includes(value.autoplay.mode)) throw new Error(`${path}.autoplay.mode must be present, browse, or kiosk.`)
	}
	return { ...value }
}

export function validateLegacyAggregateDescriptor(value, path = 'legacyAggregate') {
	exactContractObject(value, path)
	if (value.kind === 'legacyRedirect') {
		rejectUnknownKeys(value, ['kind', 'replacement'], path)
		if (value.replacement !== 'betterpptx.slide.add_media') throw new Error(`${path}.replacement must name the current media authoring surface.`)
		return { ...value }
	}
	if (value.kind === 'familyAggregate') {
		rejectUnknownKeys(value, ['kind', 'family'], path)
		if (value.family !== 'media-images-avatar') throw new Error(`${path}.family must be media-images-avatar.`)
		return { ...value }
	}
	throw new Error(`${path}.kind must be legacyRedirect or familyAggregate.`)
}

export const MEDIA_IMAGE_EXACT_ROW_RECORDS = Object.freeze([
	{ id: 'cap_7ac30aa72e0a6aa03e81', label: 'data/base64 images', bucket: 'imageAssetSource' },
	{ id: 'cap_54cdbe0309c2f63dfd51', label: 'file path images', bucket: 'imageAssetSource' },
	{ id: 'cap_e02a7e20df124d4fe45f', label: 'PNG', bucket: 'imageAssetSource' },
	{ id: 'cap_bb80eaa8706cf3b79956', label: 'JPEG', bucket: 'imageAssetSource' },
	{ id: 'cap_a54941c0b1ae43cf8ce4', label: 'SVG', bucket: 'imageAssetSource' },
	{ id: 'cap_aa6f469cc00bd5c21fd1', label: 'rounding', bucket: 'pictureAdjuncts' },
	{ id: 'cap_4d2b961aac55c8821408', label: 'hyperlinks', bucket: 'pictureAdjuncts' },
	{ id: 'cap_186474948ea9361203ee', label: 'placeholders', bucket: 'pictureAdjuncts' },
	{ id: 'cap_8aa16e80707336884f99', label: 'audio', bucket: 'mediaAssetPlayback' },
	{ id: 'cap_e9f5842459a942e7a481', label: 'video', bucket: 'mediaAssetPlayback' },
	{ id: 'cap_5423bb185bb8bc0da4e4', label: 'online media', bucket: 'mediaAssetPlayback' },
	{ id: 'cap_e08e78a4833dfb363f47', label: 'media cover image', bucket: 'mediaAssetPlayback' },
	{ id: 'cap_dfcc7a5586acc500f3f2', label: 'extension handling', bucket: 'mediaAssetPlayback' },
	{ id: 'cap_7e6539de019bedf5cc86', label: 'path/link sources', bucket: 'mediaAssetPlayback' },
	{ id: 'cap_d99504f46637c14548a5', label: 'interactive playback', bucket: 'mediaAssetPlayback' },
	{ id: 'cap_96bc73dd18c64793b1f8', label: 'audio pause command', bucket: 'mediaCommandTiming' },
	{ id: 'cap_9e36f8c64dec7c481ff3', label: 'audio play command', bucket: 'mediaCommandTiming' },
	{ id: 'cap_f9809dc5ac597c14c457', label: 'audio stop command', bucket: 'mediaCommandTiming' },
	{ id: 'cap_58ea23b888da72a842ba', label: 'media pause animation', bucket: 'mediaCommandTiming' },
	{ id: 'cap_467c3210970983de8528', label: 'media play animation', bucket: 'mediaCommandTiming' },
	{ id: 'cap_de3d1e14dc755754cf2c', label: 'media stop animation', bucket: 'mediaCommandTiming' },
	{ id: 'cap_2e4204a3953606429ddb', label: 'media triggers', bucket: 'mediaCommandTiming' },
	{ id: 'cap_4491438c0454078f3991', label: 'media triggers', bucket: 'mediaCommandTiming' },
	{ id: 'cap_b951a2540cf0b0977727', label: 'autoplay narration timing', bucket: 'narrationProvider' },
	{ id: 'cap_eecf0665821860d0b2ca', label: 'narration audio embedding', bucket: 'narrationProvider' },
	{ id: 'cap_789cc1020eb8d8dae2db', label: 'section voice cues', bucket: 'narrationProvider' },
	{ id: 'cap_c71d6877d5f7dd59c08c', label: 'real TTS narration generation', bucket: 'narrationProvider' },
	{ id: 'cap_8f3285e603fe534ecf24', label: 'voice artifact retrieval', bucket: 'narrationProvider' },
	{ id: 'cap_af71409ee64242446c8e', label: 'betterpptx-mcp.object.insert_media', bucket: 'legacyAndAggregate', targetCapabilityStatus: 'not-applicable' },
	{ id: 'cap_7db8092e40c3e870d0a3', label: 'Images, video, and identity media', bucket: 'legacyAndAggregate', targetCapabilityStatus: 'executable-exact-structured' },
].map(record => Object.freeze(record)))

function rowsForExactBucket(bucket) {
	return Object.freeze(MEDIA_IMAGE_EXACT_ROW_RECORDS.filter(record => record.bucket === bucket).map(record => record.id))
}

const MEDIA_FORMAT_SOURCE_CONTRACT = Object.freeze({
	id: 'mediaPlayback', capabilityStatus: 'executable-exact-structured', parameters: MEDIA_FORMAT_PARAMETERS,
})
const MEDIA_COMMAND_SOURCE_PARAMETERS = Object.freeze(ANIMATION_FORMAT_PARAMETERS.filter(parameter => ['mediaCommand', 'trigger', 'delay', 'duration'].includes(parameter.id)))
const MEDIA_COMMAND_SOURCE_CONTRACT = Object.freeze({
	id: 'animation.mediaCommand', capabilityStatus: 'executable-exact-structured', parameters: MEDIA_COMMAND_SOURCE_PARAMETERS,
})

function generatedPendingContract({ id, bucket, publicSchema, componentOwnership, overrideFields, resetBehavior, precedence, legalCombinations, validVectors, invalidVectors, sourceContract, promotionPolicy }) {
	const runtimeReady = MEDIA_IMAGE_EXACT_RUNTIME_READINESS[bucket] === true
	return Object.freeze({
		id,
		schemaVersion: 'betterpptx.media-image-exact-unit-contract.v1',
		capabilityMode: bucket === 'legacyAndAggregate' ? 'aggregate' : 'parameterized',
		capabilityStatus: runtimeReady ? 'executable-exact-structured' : 'structured-partial',
		targetCapabilityStatus: 'executable-exact-structured',
		runtimeReady,
		readinessKey: bucket,
		componentOwnership: Object.freeze(componentOwnership),
		overrideFields: Object.freeze(overrideFields),
		resetBehavior: Object.freeze(resetBehavior),
		precedence: Object.freeze(precedence),
		legalCombinations: Object.freeze(legalCombinations),
		rowIds: rowsForExactBucket(bucket),
		publicSchema,
		validation: Object.freeze({ mode: 'closed-generated-contract', validVectors: Object.freeze(validVectors), invalidVectors: Object.freeze(invalidVectors) }),
		...(sourceContract ? { sourceContract } : {}),
		...(promotionPolicy ? { promotionPolicy: Object.freeze(promotionPolicy) } : {}),
	})
}

export const MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS = Object.freeze({
	imageAssetSource: generatedPendingContract({
		id: 'imageAssetSourceAndFormat', bucket: 'imageAssetSource', publicSchema: IMAGE_ASSET_SOURCE_SCHEMA,
		componentOwnership: ['picture.assetSource', 'picture.packageMime', 'picture.packageRelationship'],
		overrideFields: ['source.kind', 'source.data', 'source.ref', 'source.url', 'source.format'],
		resetBehavior: { component: 'set source to null before replacing or removing the picture', full: 'remove the authored safe source carrier while retaining no private materialization reference', nullBehavior: 'null clears the authored source; omission preserves it' },
		precedence: ['detected byte signature', 'authorized source metadata', 'authored compatible format hint'],
		legalCombinations: ['PNG, JPEG, or SVG with inline, opaque asset, or HTTPS source', 'source replacement followed by format inference', 'safe source readback without materialization details'],
		validVectors: [
			{ name: 'inline-png', value: { kind: 'inline', data: 'data:image/png;base64,AA==', format: 'png' } },
			{ name: 'opaque-svg', value: { kind: 'asset', ref: 'asset://image/example', format: 'svg' } },
			{ name: 'https-inferred', value: { kind: 'https', url: 'https://example.invalid/image.jpg' } },
		],
		invalidVectors: [
			{ name: 'unsupported-format', value: { kind: 'inline', data: 'data:image/gif;base64,AA==' }, error: 'PNG, JPEG, or SVG' },
			{ name: 'unsafe-reference', value: { kind: 'asset', ref: 'relative-file.png' }, error: 'opaque authorized' },
			{ name: 'mime-format-conflict', value: { kind: 'inline', data: 'data:image/png;base64,AA==', format: 'jpeg' }, error: 'agree' },
		],
		sourceContract: Object.freeze({ id: 'nativePicturePackageType', capabilityStatus: 'executable-exact-structured', formats: IMAGE_ASSET_FORMATS, sourceKinds: IMAGE_ASSET_SOURCE_KINDS }),
		promotionPolicy: { filePathImages: 'public authoring uses opaque authorized asset references; local filesystem paths remain maintainer-only' },
	}),
	pictureAdjuncts: generatedPendingContract({
		id: 'pictureAdjuncts', bucket: 'pictureAdjuncts', publicSchema: PICTURE_ADJUNCTS_SCHEMA,
		componentOwnership: ['picture.geometry', 'picture.hyperlink', 'picture.placeholderBinding'],
		overrideFields: ['rounding', 'hyperlink', 'placeholder'],
		resetBehavior: { component: 'set rounding, hyperlink, or placeholder to null independently', full: 'set the adjunct object to null to remove all three authored adjuncts', nullBehavior: 'component null resets only that component; omission preserves it' },
		precedence: ['native/default picture adjunct', 'existing authored adjuncts', 'sparse authored component patch', 'component null reset'],
		legalCombinations: ['rounding with URL or slide hyperlink and native placeholder binding', 'independent null reset followed by sparse re-edit', 'adjuncts with every image source format and framing mode'],
		validVectors: [
			{ name: 'all-adjuncts', value: { rounding: true, hyperlink: { url: 'https://example.invalid/details', tooltip: 'Details' }, placeholder: { type: 'pic', idx: 2 } } },
			{ name: 'component-resets', value: { rounding: null, hyperlink: null, placeholder: null } },
		],
		invalidVectors: [
			{ name: 'two-hyperlink-targets', value: { hyperlink: { url: 'https://example.invalid', slide: 2 } }, error: 'exactly one' },
			{ name: 'invalid-placeholder', value: { placeholder: { type: 'unknown' } }, error: 'native placeholder' },
			{ name: 'unknown-adjunct', value: { cropMetadata: true }, error: 'public contract' },
		],
		sourceContract: Object.freeze({ id: 'pictureAdjunctComposition', capabilityStatus: 'executable-exact-structured', imageFraming: IMAGE_FRAMING_CONTRACT.id, placeholderTypes: NATIVE_PLACEHOLDER_TYPES }),
	}),
	mediaAssetPlayback: generatedPendingContract({
		id: 'mediaAssetPlayback', bucket: 'mediaAssetPlayback', publicSchema: MEDIA_ASSET_PLAYBACK_SCHEMA,
		componentOwnership: ['media.assetSource', 'media.packageRelationships', 'media.poster', 'media.playback'],
		overrideFields: ['type', 'extn', 'source', 'cover', 'sizing', 'transparency', 'rounding', 'interactivePlayback', 'mediaVolume', 'showWhenStopped', 'endOnStopAudio', 'closedCaptionTracks'],
		resetBehavior: { component: 'set the named media option to null; source reset requires replacement or media removal before save', full: 'remove the authored media state and its owned package relationships', nullBehavior: 'component null removes only that authored component; omission preserves it' },
		precedence: ['detected media payload and relationship role', 'inferred type and extension', 'authored compatible type/extension', 'sparse playback patch', 'component null reset'],
		legalCombinations: ['audio or video with opaque, HTTPS, or inline source and optional poster', 'online media with HTTPS source', 'playback fields with framing, captions, duplicate sources, and sparse relationship identifiers'],
		validVectors: [
			{ name: 'audio', value: { type: 'audio', extn: 'mp3', source: 'asset://media/audio-example', interactivePlayback: false, mediaVolume: 80000 } },
			{ name: 'online-video', value: { type: 'online', source: 'https://example.invalid/watch', cover: 'asset://image/poster-example', interactivePlayback: true } },
			{ name: 'video-inline', value: { type: 'video', extn: 'mp4', source: 'data:video/mp4;base64,AA==', rounding: true } },
		],
		invalidVectors: [
			{ name: 'extension-conflict', value: { type: 'audio', extn: 'mp4', source: 'asset://media/audio-example' }, error: 'supported audio extension' },
			{ name: 'online-opaque-source', value: { type: 'online', source: 'asset://media/online-example' }, error: 'HTTPS' },
			{ name: 'private-source-shape', value: { type: 'video', source: 'relative-video.mp4' }, error: 'opaque authorized' },
		],
		sourceContract: MEDIA_FORMAT_SOURCE_CONTRACT,
	}),
	mediaCommandTiming: generatedPendingContract({
		id: 'mediaCommandTiming', bucket: 'mediaCommandTiming', publicSchema: MEDIA_COMMAND_TIMING_SCHEMA,
		componentOwnership: ['slide.timing.mediaCommand', 'slide.timing.mediaTrigger', 'slide.timing.commandOwnership'],
		overrideFields: ['command', 'trigger', 'delayMs', 'durationMs', 'replaceExistingCommands', 'preserveExistingTiming'],
		resetBehavior: { component: 'set command to null to remove only commands owned by this authored state', full: 'remove the owned media-command sequence while preserving unrelated timing', nullBehavior: 'command null removes owned commands; omission preserves them' },
		precedence: ['preserved unrelated timing', 'existing owned media commands', 'explicit replacement policy', 'new canonical command', 'command null reset'],
		legalCombinations: ['play, pause, or stop with onClick, withPrevious, or afterPrevious', 'add, replace-owned, preserve-imported, remove, and re-add', 'interactive playback combined without duplicate command sequences'],
		validVectors: [
			{ name: 'play', value: { command: 'playFrom(2)', trigger: 'withPrevious', delayMs: 250, durationMs: 1200 } },
			{ name: 'pause', value: { command: 'togglePause', trigger: 'onClick' } },
			{ name: 'owned-reset', value: { command: null, preserveExistingTiming: true } },
		],
		invalidVectors: [
			{ name: 'arbitrary-command', value: { command: 'launchExternal()' }, error: 'togglePause, stop, or playFrom' },
			{ name: 'negative-delay', value: { command: 'stop', delayMs: -1 }, error: 'between 0' },
			{ name: 'invalid-trigger', value: { command: 'stop', trigger: 'onHover' }, error: 'onClick' },
		],
		sourceContract: MEDIA_COMMAND_SOURCE_CONTRACT,
	}),
	narrationProvider: generatedPendingContract({
		id: 'narrationAndVoiceArtifact', bucket: 'narrationProvider', publicSchema: NARRATION_PROVIDER_SCHEMA,
		componentOwnership: ['slide.narrationAudio', 'slide.narrationNotes', 'slide.narrationCues', 'slide.advanceTiming', 'deck.narrationShowSettings', 'narration.audioArtifact'],
		overrideFields: ['mode', 'text', 'audioRef', 'voiceId', 'language', 'cues', 'timing', 'autoplay'],
		resetBehavior: { component: 'set cues, timing, autoplay, or optional narration fields to null independently', full: 'set narration to null to remove owned narration audio, notes block, cues, timing, manifest state, and unneeded show settings', nullBehavior: 'null removes only owned narration state; omission preserves it' },
		precedence: ['authorized supplied audio or requested synthesis', 'resolved duration', 'authored cue/timing overrides', 'autoplay ownership', 'component or full reset'],
		legalCombinations: ['synthesized or supplied narration with notes, cues, delay, padding, duration tolerance, and autoplay', 'synthesize then retrieve by opaque audio reference then attach', 'full reset followed by sparse re-authoring'],
		validVectors: [
			{ name: 'synthesize', value: { mode: 'synthesize', text: 'A concise narration.', voiceId: 'voice://approved/example', language: 'en-US', timing: { paddingMs: 600 } } },
			{ name: 'attach-with-cue', value: { mode: 'attach', audioRef: 'audio://artifact/example', text: 'Attached narration.', cues: [{ atMs: 500, target: 'metric', effect: 'pulse', durationMs: 300 }], autoplay: { enabled: true, mode: 'kiosk' } } },
			{ name: 'retrieve', value: { mode: 'retrieve', audioRef: 'audio://artifact/example' } },
		],
		invalidVectors: [
			{ name: 'synthesis-without-text', value: { mode: 'synthesize' }, error: 'text is required' },
			{ name: 'retrieval-without-ref', value: { mode: 'retrieve' }, error: 'audioRef is required' },
			{ name: 'non-audio-inline-artifact', value: { mode: 'attach', audioRef: 'data:video/mp4;base64,AA==' }, error: 'opaque authorized' },
			{ name: 'unowned-service-detail', value: { mode: 'synthesize', text: 'Narrate.', serviceHint: 'internal-choice' }, error: 'public contract' },
		],
		sourceContract: Object.freeze({ id: 'narrationSemanticContract', capabilityStatus: 'executable-exact-structured', publicFields: Object.freeze(['text', 'audioRef', 'voiceId', 'language', 'cues', 'timing', 'autoplay']) }),
	}),
	legacyAndAggregate: generatedPendingContract({
		id: 'legacyMediaOperationAndFamilyAggregate', bucket: 'legacyAndAggregate', publicSchema: LEGACY_AGGREGATE_SCHEMA,
		componentOwnership: ['catalog.operationRedirect', 'catalog.familyAggregate'],
		overrideFields: [],
		resetBehavior: { component: 'not-applicable to catalog descriptors', full: 'not-applicable to catalog descriptors', nullBehavior: 'not-applicable to catalog descriptors' },
		precedence: ['current public authoring surface', 'explicit legacy redirect', 'aggregate truth derived from child contracts'],
		legalCombinations: ['legacy redirect only after explicit catalog retirement or compatibility alias', 'family aggregate only after every declared child contract is exact'],
		validVectors: [
			{ name: 'legacy-redirect', value: { kind: 'legacyRedirect', replacement: 'betterpptx.slide.add_media' } },
			{ name: 'family-aggregate', value: { kind: 'familyAggregate', family: 'media-images-avatar' } },
		],
		invalidVectors: [
			{ name: 'unknown-replacement', value: { kind: 'legacyRedirect', replacement: 'unknown.media' }, error: 'current media authoring surface' },
			{ name: 'wrong-family', value: { kind: 'familyAggregate', family: 'charts' }, error: 'media-images-avatar' },
		],
		promotionPolicy: { legacyOperation: 'not-applicable only after explicit retirement or executable compatibility alias', familyAggregate: 'derive exact only when every declared child contract is exact' },
	}),
})

export const MEDIA_IMAGE_EXACT_ROW_IDS = Object.freeze(MEDIA_IMAGE_EXACT_ROW_RECORDS.map(record => record.id))
export const MEDIA_IMAGE_EXACT_BUCKET_BY_ROW_ID = Object.freeze(Object.fromEntries(MEDIA_IMAGE_EXACT_ROW_RECORDS.map(record => [record.id, record.bucket])))
export const MEDIA_IMAGE_EXACT_CONTRACT_BY_ROW_ID = Object.freeze(Object.fromEntries(
	MEDIA_IMAGE_EXACT_ROW_RECORDS.map(record => [record.id, MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS[record.bucket]]),
))

export function assertMediaImageExactRowPartition() {
	const ids = MEDIA_IMAGE_EXACT_ROW_RECORDS.map(record => record.id)
	if (ids.length !== 30 || new Set(ids).size !== 30) throw new Error(`media/image exact unit must contain 30 unique rows; received ${ids.length}/${new Set(ids).size}.`)
	const buckets = Object.keys(MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS)
	if (buckets.length !== 6) throw new Error(`media/image exact unit must contain six generated buckets; received ${buckets.length}.`)
	for (const record of MEDIA_IMAGE_EXACT_ROW_RECORDS) {
		if (!record.label || !MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS[record.bucket]) throw new Error(`media/image exact row ${record.id} has no generated contract bucket.`)
	}
	const bucketIds = buckets.flatMap(bucket => MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS[bucket].rowIds)
	if (bucketIds.length !== 30 || new Set(bucketIds).size !== 30 || bucketIds.some(id => !ids.includes(id))) throw new Error('media/image exact buckets must be a complete, disjoint partition of the 30-row unit.')
	const residualPartial = new Set(MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS)
	if (ids.some(id => !residualPartial.has(id)) || residualPartial.size !== ids.length) throw new Error('media/image exact unit must equal the current 30-row residual partial set.')
	return Object.freeze({
		total: ids.length,
		buckets: Object.freeze(Object.fromEntries(buckets.map(bucket => [bucket, MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS[bucket].rowIds.length]))),
		readyBuckets: buckets.filter(bucket => MEDIA_IMAGE_EXACT_RUNTIME_READINESS[bucket] === true).length,
	})
}

export const MEDIA_IMAGE_EXACT_PARTITION_ASSERTION = assertMediaImageExactRowPartition()

export function validateMediaImageExactContractValue(bucket, value, path = bucket) {
	if (bucket === 'imageAssetSource') return validateImageAssetSource(value, path)
	if (bucket === 'pictureAdjuncts') return validatePictureAdjuncts(value, path)
	if (bucket === 'mediaAssetPlayback') return validateMediaAssetPlayback(value, path)
	if (bucket === 'mediaCommandTiming') return validateMediaCommandTiming(value, path)
	if (bucket === 'narrationProvider') return validateNarrationProvider(value, path)
	if (bucket === 'legacyAndAggregate') return validateLegacyAggregateDescriptor(value, path)
	throw new Error(`Unknown media/image exact contract bucket: ${bucket}.`)
}

export function mediaImageExactCandidateContractForEntry(entry = {}) {
	if (entry.family !== 'media-images-avatar') return null
	const record = MEDIA_IMAGE_EXACT_ROW_RECORDS.find(item => item.id === entry.id)
	if (!record) return null
	const contract = MEDIA_IMAGE_EXACT_CONTRACT_BY_ROW_ID[record.id]
	const aggregateDependenciesReady = record.id !== 'cap_7db8092e40c3e870d0a3'
		|| Object.entries(MEDIA_IMAGE_EXACT_RUNTIME_READINESS).filter(([key]) => key !== 'legacyAndAggregate').every(([, ready]) => ready === true)
	const runtimeReady = contract.runtimeReady === true && aggregateDependenciesReady
	return Object.freeze({
		...contract,
		rowIds: Object.freeze([record.id]),
		runtimeReady,
		targetCapabilityStatus: record.targetCapabilityStatus || contract.targetCapabilityStatus,
	})
}

const MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACT_BY_ROW_ID = Object.freeze(Object.fromEntries(
	Object.values(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS).flatMap(contract => contract.rowIds.map(rowId => [rowId, contract])),
))

export function assertMediaImageResidualRowPartition() {
	const expectedDispositions = new Set(['exact', 'preserve', 'not-applicable', 'not-live', 'missing', 'partial'])
	const rowIds = MEDIA_IMAGE_RESIDUAL_ROW_RECORDS.map(record => record.id)
	const uniqueRowIds = new Set(rowIds)
	if (rowIds.length !== 44 || uniqueRowIds.size !== 44) throw new Error(`media/image residual partition must contain 44 unique rows; received ${rowIds.length}/${uniqueRowIds.size}.`)
	for (const record of MEDIA_IMAGE_RESIDUAL_ROW_RECORDS) {
		if (!record.label) throw new Error(`media/image residual row ${record.id} is missing its audited label.`)
		if (!expectedDispositions.has(record.disposition)) throw new Error(`media/image residual row ${record.id} has unknown disposition ${record.disposition}.`)
	}
	const bucketIds = [
		...MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_PRESERVE_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_NOT_LIVE_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_MISSING_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS,
	]
	if (bucketIds.length !== 44 || new Set(bucketIds).size !== 44 || bucketIds.some(id => !uniqueRowIds.has(id))) throw new Error('media/image residual disposition buckets must be a complete, disjoint partition of the 44 audited rows.')
	if (MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS.some(id => !MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACT_BY_ROW_ID[id])) throw new Error('every exact residual media/image row must own a leaf contract.')
	return Object.freeze({
		total: rowIds.length,
		exact: MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS.length,
		preserve: MEDIA_IMAGE_RESIDUAL_PRESERVE_ROW_IDS.length,
		notApplicable: MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_ROW_IDS.length,
		notLive: MEDIA_IMAGE_RESIDUAL_NOT_LIVE_ROW_IDS.length,
		missing: MEDIA_IMAGE_RESIDUAL_MISSING_ROW_IDS.length,
		partial: MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS.length,
	})
}

export const MEDIA_IMAGE_RESIDUAL_PARTITION_ASSERTION = assertMediaImageResidualRowPartition()

export const MEDIA_IMAGE_FORMATTING_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.media-image-formatting-contract.v1',
	imageFraming: IMAGE_FRAMING_CONTRACT,
	importedPicturePreservation: IMPORTED_PICTURE_PRESERVATION_CONTRACT,
	residual: Object.freeze({
		partition: MEDIA_IMAGE_RESIDUAL_PARTITION_ASSERTION,
		exact: MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS,
		preservation: MEDIA_IMAGE_RESIDUAL_PRESERVATION_CONTRACT,
		notApplicable: MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_CONTRACT,
		notLive: MEDIA_IMAGE_RESIDUAL_NOT_LIVE_CONTRACT,
		missing: MEDIA_IMAGE_RESIDUAL_MISSING_CONTRACT,
	}),
	pendingExactUnit: Object.freeze({
		id: MEDIA_IMAGE_EXACT_UNIT_ID,
		partition: MEDIA_IMAGE_EXACT_PARTITION_ASSERTION,
		readiness: MEDIA_IMAGE_EXACT_RUNTIME_READINESS,
		buckets: MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS,
	}),
})

export function normalizeImageFraming(value, path = 'sizing', { allowEngineGeometry = false } = {}) {
	if (value === undefined || value === null) return value
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	const type = String(value.type || '').trim().toLowerCase()
	if (!IMAGE_FRAMING_MODES.includes(type)) throw new Error(`${path}.type must be contain, cover, or crop.`)
	const allowed = new Set(['type', ...(allowEngineGeometry ? ['x', 'y', 'w', 'h'] : [])])
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public image-framing contract.`)
	const out = { ...value, type }
	for (const key of ['x', 'y', 'w', 'h']) {
		if (out[key] === undefined || out[key] === null) continue
		if (!allowEngineGeometry) throw new Error(`${path}.${key} is engine-owned.`)
		if (typeof out[key] !== 'number' && !(typeof out[key] === 'string' && /^-?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(out[key].trim()))) throw new Error(`${path}.${key} must be a coordinate number or percentage string.`)
	}
	return out
}

export function mediaImageCapabilityContractForEntry(entry = {}) {
	if (entry.family !== 'media-images-avatar') return null
	if (IMAGE_FRAMING_ROW_SET.has(entry.id)) return IMAGE_FRAMING_CONTRACT
	if (IMPORTED_PICTURE_PRESERVATION_ROW_SET.has(entry.id)) return IMPORTED_PICTURE_PRESERVATION_CONTRACT
	const residual = MEDIA_IMAGE_RESIDUAL_DISPOSITION_BY_ROW_ID[entry.id]
	if (!residual) return null
	if (residual.disposition === 'partial') {
		const candidate = mediaImageExactCandidateContractForEntry(entry)
		if (!candidate?.runtimeReady) return null
		return Object.freeze({
			...candidate,
			capabilityMode: candidate.targetCapabilityStatus === 'not-applicable' ? 'missing' : candidate.capabilityMode,
			capabilityStatus: candidate.targetCapabilityStatus,
		})
	}
	if (residual.disposition === 'exact') return MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACT_BY_ROW_ID[entry.id]
	if (residual.disposition === 'preserve') return MEDIA_IMAGE_RESIDUAL_PRESERVATION_CONTRACT
	if (residual.disposition === 'not-applicable') return MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_CONTRACT
	if (residual.disposition === 'not-live') return MEDIA_IMAGE_RESIDUAL_NOT_LIVE_CONTRACT
	if (residual.disposition === 'missing') return MEDIA_IMAGE_RESIDUAL_MISSING_CONTRACT
	return null
}
