import crypto from 'node:crypto'
import { EDITABLE_ITEM_PAYLOAD_VERSION, editableItemOperationDigest } from './continuity-item-payload.mjs'

// Cross-slide semantic handoff. This module validates authored state; it does
// not infer a transition, change slide geometry, or claim native playback.
export const SLIDE_CONTINUITY_CONTRACT_VERSION = 'betterpptx.slide-continuity.v3'

export function assertSlideContinuityCommitMode(spec, commitMode) {
	if (!Array.isArray(spec?.slideContinuities) || spec.slideContinuities.length === 0) return
	if (commitMode !== 'append' && commitMode !== 'patch') return
	const error = new Error('Cross-slide continuation requires a full createNew or replaceDeck commit; append and patch cannot preserve the complete native handoff atomically.')
	error.code = 'SLIDE_CONTINUITY_COMMIT_MODE_NONATOMIC'
	throw error
}

const scalar = { type: 'number' }
const nonnegative = { type: 'number', minimum: 0 }
const identity = { type: 'string', minLength: 1 }
const vector2 = { type: 'array', minItems: 2, maxItems: 2, items: scalar }
const position2 = { ...vector2, description: 'Normalized-stage [x,y] position; 0 is the left/top edge and 1 is the right/bottom edge.' }
const velocity2 = { ...vector2, description: 'Normalized-stage [x,y] velocity per second.' }
const EDITABLE_ITEM_CARRIERS = Object.freeze({
	'editable-shape-group': 'group',
	'editable-shape': 'shape',
	'editable-text-shape': 'textShape',
	'editable-chart': 'chart-panel',
	'editable-table': 'table-panel',
})
const actorState = {
	type: 'object', additionalProperties: false,
	required: ['position', 'angleDeg', 'velocity', 'poseDeg', 'supportFoot', 'motionId', 'actionId', 'sourceId', 'sourceTimeMs', 'sourceDurationMs'],
	properties: {
		position: position2, angleDeg: scalar, velocity: velocity2,
		poseDeg: { type: 'array', minItems: 1, items: scalar },
		supportFoot: { type: 'string', enum: ['left', 'right', 'both'] },
		motionId: { type: 'string', pattern: '^motion\\.[a-z0-9-]+\\.[a-z0-9-]+$' }, actionId: identity,
		sourceId: identity, sourceTimeMs: nonnegative, sourceDurationMs: nonnegative,
	},
}
const itemState = {
	type: 'object', additionalProperties: false,
	required: ['kind', 'digestVersion', 'dataDigest', 'attachedTo', 'position', 'angleDeg'],
	properties: {
		kind: { type: 'string', enum: Object.keys(EDITABLE_ITEM_CARRIERS) },
		digestVersion: { type: 'string', enum: [EDITABLE_ITEM_PAYLOAD_VERSION] },
		dataDigest: { type: 'string', pattern: '^[A-Fa-f0-9]{64}$', description: 'SHA-256 assertion for the versioned effective editable payload; dry-run reports the computed value when equal endpoint content uses a different assertion.' },
		attachedTo: identity, position: position2, angleDeg: scalar,
	},
}
const endpoint = {
	type: 'object', additionalProperties: false,
	required: ['actorInstanceId', 'itemInstanceId', 'atMs', 'safeFrame', 'actor', 'item'],
	properties: {
		actorInstanceId: identity, itemInstanceId: identity, atMs: nonnegative,
		safeFrame: { type: 'array', minItems: 4, maxItems: 4, items: scalar, description: 'Normalized-stage [left,top,right,bottom] safe frame.' },
		actor: actorState, item: itemState,
	},
}

export const SLIDE_CONTINUITIES_PUBLIC_SCHEMA = {
	type: 'array', maxItems: 64,
	description: 'AI-authored cross-slide identity, state, editable-item payload, ownership and narration handoffs. Each record binds adjacent slides; both slide narrations must declare the matching streamId and named cue IDs. A provisional 64-hex item digest can be submitted to dry-run: only when both compiled editable payloads match does a digest-mismatch finding return their computed versioned digest for a corrected assertion. No Morph, shared 3-D plane or silent state inference.',
	items: {
		type: 'object', additionalProperties: false,
		required: ['id', 'fromSlideId', 'toSlideId', 'actorLogicalId', 'itemLogicalId', 'from', 'to', 'transfer', 'narration', 'transition', 'depth', 'tolerance'],
		properties: {
			id: identity, fromSlideId: identity, toSlideId: identity,
			actorLogicalId: identity, itemLogicalId: identity,
			from: endpoint, to: endpoint,
			transfer: {
				type: 'object', additionalProperties: false,
				required: ['authoredBy', 'atMs', 'fromOwner', 'toOwner'],
				properties: { authoredBy: { type: 'string', enum: ['AI'] }, atMs: nonnegative, fromOwner: identity, toOwner: identity },
			},
			narration: {
				type: 'object', additionalProperties: false,
				required: ['streamId', 'boundaryMs', 'fromCueIds', 'toCueIds'],
				properties: {
					streamId: identity, boundaryMs: nonnegative,
					fromCueIds: { type: 'array', minItems: 1, items: identity },
					toCueIds: { type: 'array', minItems: 1, items: identity },
				},
			},
			transition: {
				type: 'object', additionalProperties: false,
				required: ['kind', 'durationMs'],
				properties: { kind: { type: 'string', enum: ['explicit-cut'] }, durationMs: { type: 'number', const: 0 } },
			},
			depth: {
				type: 'object', additionalProperties: false,
				required: ['shared3dPlane', 'fragmentInterleave'],
				properties: { shared3dPlane: { type: 'boolean', const: false }, fragmentInterleave: { type: 'boolean', const: false } },
			},
			tolerance: {
				type: 'object', additionalProperties: false,
				required: ['position', 'velocity', 'angleDeg', 'poseDeg', 'sourceMs'],
				properties: { position: nonnegative, velocity: nonnegative, angleDeg: nonnegative, poseDeg: nonnegative, sourceMs: nonnegative },
			},
		},
	},
}

const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties })
const actionSideReadback = closed({ slideId: identity, motionId: identity, actionId: identity, sourceRangeStatus: { type: 'string', enum: ['AUTHORED_RANGE_ONLY'] } })
const plannedSideReadback = closed({
	slideId: identity,
	actor: closed({ instanceId: identity, objectName: identity, editHandle: identity }),
	item: closed({ instanceId: identity, objectName: identity, editHandle: identity, primitive: identity }),
})
const narrationSideReadback = closed({
	slideId: identity,
	cues: { type: 'array', minItems: 1, items: closed({ id: identity, timingAnchor: { type: 'string', enum: ['atMs', 'atPhrase', 'atWord', 'delay'] } }) },
})
const boundaryReadback = closed({
	id: identity, fromSlideId: identity, toSlideId: identity, actorLogicalId: identity, itemLogicalId: identity,
	from: closed({ actorInstanceId: identity, itemInstanceId: identity, itemKind: identity, atMs: nonnegative, motionId: identity, actionId: identity }),
	to: closed({ actorInstanceId: identity, itemInstanceId: identity, itemKind: identity, atMs: nonnegative, motionId: identity, actionId: identity }),
	transfer: closed({ authoredBy: { type: 'string', enum: ['AI'] }, atMs: nonnegative, fromOwner: identity, toOwner: identity }),
	narration: closed({ streamId: identity, boundaryMs: nonnegative, fromCueIds: { type: 'array', items: identity }, toCueIds: { type: 'array', items: identity } }),
	transition: closed({ kind: { type: 'string', enum: ['explicit-cut'] }, durationMs: { type: 'number', const: 0 } }),
	residuals: closed({ actorPosition: nonnegative, itemPosition: nonnegative, actorAngleDeg: nonnegative, itemAngleDeg: nonnegative, velocity: nonnegative, maxPoseDeg: nonnegative, sourceMs: nonnegative }),
	tolerance: closed({ position: nonnegative, velocity: nonnegative, angleDeg: nonnegative, poseDeg: nonnegative, sourceMs: nonnegative }),
	status: { type: 'string', enum: ['SEMANTIC_PREFLIGHT_PASS'] },
	authoredActionBinding: closed({ status: { type: 'string', enum: ['AUTHORED_ACTION_ONLY'] }, from: actionSideReadback, to: actionSideReadback }),
	sourceClockStatus: { type: 'string', enum: ['MEASURED_SLIDE_START_PENDING', 'FIRST_SLIDE_AUTHORED_CLOCK_ONLY'] },
	sourceClockResidualMs: nonnegative,
	sourceReleaseStatus: { type: 'string', enum: ['UNQUALIFIED', 'QUALIFIED'] },
	plannedBindings: closed({ from: plannedSideReadback, to: plannedSideReadback }),
	bindingStatus: { type: 'string', enum: ['PLANNED_OBJECTS_ONLY'] },
	itemPayloadBinding: closed({ status: { type: 'string', enum: ['COMPILED_OPERATION_PAYLOAD_MATCH'] }, digestVersion: { type: 'string', enum: [EDITABLE_ITEM_PAYLOAD_VERSION] } }),
	narrationBinding: closed({ status: { type: 'string', enum: ['AUTHORED_CUES_ONLY'] }, streamId: identity, from: narrationSideReadback, to: narrationSideReadback }),
	measuredDeckClockStatus: { type: 'string', enum: ['MEASURED_AUDIO_PENDING', 'MEASURED_AUDIO_CLOCK_VERIFIED'] },
	measuredDeckClockResidualMs: closed({ from: nonnegative, to: nonnegative }),
}, ['id', 'fromSlideId', 'toSlideId', 'actorLogicalId', 'itemLogicalId', 'from', 'to', 'transfer', 'narration', 'transition', 'residuals', 'tolerance', 'status'])

export const SLIDE_CONTINUITIES_READBACK_SCHEMA = {
	type: 'object', additionalProperties: false,
	required: ['contractVersion', 'boundaryClock', 'positionUnit', 'velocityUnit', 'boundaries', 'qualification'],
	properties: {
		contractVersion: { type: 'string', enum: [SLIDE_CONTINUITY_CONTRACT_VERSION] },
		boundaryClock: { type: 'string', enum: ['milliseconds-from-deck-start'] },
		positionUnit: { type: 'string', enum: ['normalized-stage'] },
		velocityUnit: { type: 'string', enum: ['normalized-stage-per-second'] },
		boundaries: { type: 'array', items: boundaryReadback },
		qualification: { type: 'string', enum: ['semantic-preflight-only'] },
	},
}

function fail(code, field, message) {
	const error = new Error(message)
	error.code = code
	error.field = field
	throw error
}
function object(value, field, keys, required = keys) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SLIDE_CONTINUITY_INVALID_OBJECT', field, `${field} must be an object.`)
	for (const key of Object.keys(value)) if (!keys.includes(key)) fail('SLIDE_CONTINUITY_UNKNOWN_FIELD', `${field}.${key}`, `${field} contains unsupported field ${key}.`)
	for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) fail('SLIDE_CONTINUITY_MISSING_FIELD', `${field}.${key}`, `${field} requires ${key}.`)
	return value
}
function id(value, field) {
	if (typeof value !== 'string' || !value.trim()) fail('SLIDE_CONTINUITY_INVALID_ID', field, `${field} must be a nonempty string.`)
	return value.trim()
}
function num(value, field, nonnegativeOnly = false) {
	if (typeof value !== 'number' || !Number.isFinite(value) || (nonnegativeOnly && value < 0)) fail('SLIDE_CONTINUITY_INVALID_NUMBER', field, `${field} must be a finite${nonnegativeOnly ? ' nonnegative' : ''} number.`)
	return value
}
function vec(value, size, field) {
	if (!Array.isArray(value) || value.length !== size) fail('SLIDE_CONTINUITY_INVALID_VECTOR', field, `${field} must contain exactly ${size} numbers.`)
	return value.map((part, index) => num(part, `${field}[${index}]`))
}
function angularDistance(a, b) { return Math.abs(((a - b + 180) % 360 + 360) % 360 - 180) }
function distance(a, b) { return Math.hypot(...a.map((part, index) => part - b[index])) }
function endpointState(value, field) {
	object(value, field, ['actorInstanceId', 'itemInstanceId', 'atMs', 'safeFrame', 'actor', 'item'])
	const actor = object(value.actor, `${field}.actor`, ['position', 'angleDeg', 'velocity', 'poseDeg', 'supportFoot', 'motionId', 'actionId', 'sourceId', 'sourceTimeMs', 'sourceDurationMs'])
	const item = object(value.item, `${field}.item`, ['kind', 'digestVersion', 'dataDigest', 'attachedTo', 'position', 'angleDeg'])
	const safeFrame = vec(value.safeFrame, 4, `${field}.safeFrame`)
	if (safeFrame.some(bound => bound < 0 || bound > 1) || safeFrame[0] >= safeFrame[2] || safeFrame[1] >= safeFrame[3]) fail('SLIDE_CONTINUITY_INVALID_SAFE_FRAME', `${field}.safeFrame`, 'Safe frame bounds must increase within normalized stage [0,1].')
	const poseDeg = Array.isArray(actor.poseDeg) && actor.poseDeg.length ? actor.poseDeg.map((part, index) => num(part, `${field}.actor.poseDeg[${index}]`)) : fail('SLIDE_CONTINUITY_INVALID_POSE', `${field}.actor.poseDeg`, 'Pose must contain at least one angle.')
	const normalized = {
		actorInstanceId: id(value.actorInstanceId, `${field}.actorInstanceId`),
		itemInstanceId: id(value.itemInstanceId, `${field}.itemInstanceId`),
		atMs: num(value.atMs, `${field}.atMs`, true),
		safeFrame,
		actor: {
			position: vec(actor.position, 2, `${field}.actor.position`),
			angleDeg: num(actor.angleDeg, `${field}.actor.angleDeg`),
			velocity: vec(actor.velocity, 2, `${field}.actor.velocity`),
			poseDeg,
			supportFoot: id(actor.supportFoot, `${field}.actor.supportFoot`),
			motionId: id(actor.motionId, `${field}.actor.motionId`),
			actionId: id(actor.actionId, `${field}.actor.actionId`),
			sourceId: id(actor.sourceId, `${field}.actor.sourceId`),
			sourceTimeMs: num(actor.sourceTimeMs, `${field}.actor.sourceTimeMs`, true),
			sourceDurationMs: num(actor.sourceDurationMs, `${field}.actor.sourceDurationMs`, true),
		},
		item: {
			kind: id(item.kind, `${field}.item.kind`),
			digestVersion: id(item.digestVersion, `${field}.item.digestVersion`),
			dataDigest: id(item.dataDigest, `${field}.item.dataDigest`).toLowerCase(),
			attachedTo: id(item.attachedTo, `${field}.item.attachedTo`),
			position: vec(item.position, 2, `${field}.item.position`),
			angleDeg: num(item.angleDeg, `${field}.item.angleDeg`),
		},
	}
	if (!['left', 'right', 'both'].includes(normalized.actor.supportFoot)) fail('SLIDE_CONTINUITY_SUPPORT_JUMP', `${field}.actor.supportFoot`, 'Support foot must be left, right or both.')
	if (!/^motion\.[a-z0-9-]+\.[a-z0-9-]+$/i.test(normalized.actor.motionId)) fail('SLIDE_CONTINUITY_MOTION_ID', `${field}.actor.motionId`, 'The endpoint needs an exact public motion ID.')
	if (normalized.actor.sourceTimeMs > normalized.actor.sourceDurationMs || normalized.actor.sourceDurationMs <= 0) fail('SLIDE_CONTINUITY_SOURCE_TIME', `${field}.actor.sourceTimeMs`, 'Source time must lie within a positive source duration.')
	if (!EDITABLE_ITEM_CARRIERS[normalized.item.kind] || normalized.item.digestVersion !== EDITABLE_ITEM_PAYLOAD_VERSION || !/^[a-f0-9]{64}$/.test(normalized.item.dataDigest)) fail('SLIDE_CONTINUITY_ITEM_NOT_EDITABLE', `${field}.item`, 'Item must declare the supported versioned editable payload SHA-256 digest.')
	for (const [entity, position] of [['actor', normalized.actor.position], ['item', normalized.item.position]]) {
		if (position[0] < safeFrame[0] || position[0] > safeFrame[2] || position[1] < safeFrame[1] || position[1] > safeFrame[3]) fail('SLIDE_CONTINUITY_UNSAFE_ENDPOINT', `${field}.${entity}.position`, `${entity} lies outside the authored safe frame.`)
	}
	return normalized
}

export function normalizeSlideContinuities(spec) {
	if (Object.prototype.hasOwnProperty.call(spec || {}, 'slideContinuity')) fail('SLIDE_CONTINUITY_UNKNOWN_FIELD', 'slideContinuity', 'Use the typed slideContinuities array.')
	const records = spec?.slideContinuities
	if (records == null) return { contractVersion: SLIDE_CONTINUITY_CONTRACT_VERSION, boundaryClock: 'milliseconds-from-deck-start', positionUnit: 'normalized-stage', velocityUnit: 'normalized-stage-per-second', boundaries: [], qualification: 'semantic-preflight-only' }
	if (!Array.isArray(records) || records.length > 64) fail('SLIDE_CONTINUITY_INVALID_ARRAY', 'slideContinuities', 'slideContinuities must be an array with at most 64 records.')
	const slides = Array.isArray(spec?.slides) ? spec.slides : []
	const slideIndexes = new Map(slides.map((slide, index) => [slide?.id, index]))
	if (records.length && (slides.some(slide => typeof slide?.id !== 'string' || !slide.id.trim()) || slideIndexes.size !== slides.length)) fail('SLIDE_CONTINUITY_SLIDE_IDENTITY', 'slides', 'Every slide must have a unique stable ID when cross-slide continuity is authored.')
	const boundaryIds = new Set()
	const boundaries = records.map((record, index) => {
		const field = `slideContinuities[${index}]`
		object(record, field, ['id', 'fromSlideId', 'toSlideId', 'actorLogicalId', 'itemLogicalId', 'from', 'to', 'transfer', 'narration', 'transition', 'depth', 'tolerance'])
		const boundaryId = id(record.id, `${field}.id`)
		if (boundaryIds.has(boundaryId)) fail('SLIDE_CONTINUITY_DUPLICATE_ID', `${field}.id`, 'Boundary IDs must be unique.')
		boundaryIds.add(boundaryId)
		const fromSlideId = id(record.fromSlideId, `${field}.fromSlideId`)
		const toSlideId = id(record.toSlideId, `${field}.toSlideId`)
		const fromIndex = slideIndexes.get(fromSlideId)
		const toIndex = slideIndexes.get(toSlideId)
		if (fromIndex == null || toIndex !== fromIndex + 1) fail('SLIDE_CONTINUITY_NONADJACENT', field, 'Boundary must bind two existing adjacent slides in order.')
		const actorLogicalId = id(record.actorLogicalId, `${field}.actorLogicalId`)
		const itemLogicalId = id(record.itemLogicalId, `${field}.itemLogicalId`)
		if (actorLogicalId === itemLogicalId) fail('SLIDE_CONTINUITY_IDENTITY', field, 'Actor and item logical IDs must differ.')
		const from = endpointState(record.from, `${field}.from`)
		const to = endpointState(record.to, `${field}.to`)
		if (from.actorInstanceId === to.actorInstanceId || from.itemInstanceId === to.itemInstanceId) fail('SLIDE_CONTINUITY_INSTANCE_IDENTITY', field, 'Each slide must have a distinct native actor and item instance.')
		for (const [side, slide, endpointValue] of [['from', slides[fromIndex], from], ['to', slides[toIndex], to]]) {
			const itemMatches = (slide?.content || []).filter(block => block?.name === endpointValue.itemInstanceId)
			if (itemMatches.length !== 1 || itemMatches[0]?.kind !== EDITABLE_ITEM_CARRIERS[endpointValue.item.kind]) fail('SLIDE_CONTINUITY_ITEM_BINDING', `${field}.${side}.itemInstanceId`, 'Item instance must name exactly one editable native object of the declared kind on its slide.')
			if (endpointValue.item.attachedTo !== actorLogicalId) fail('SLIDE_CONTINUITY_ATTACHMENT', `${field}.${side}.item.attachedTo`, 'Item attachment must name the logical actor.')
		}
		const transfer = object(record.transfer, `${field}.transfer`, ['authoredBy', 'atMs', 'fromOwner', 'toOwner'])
		const narration = object(record.narration, `${field}.narration`, ['streamId', 'boundaryMs', 'fromCueIds', 'toCueIds'])
		const transition = object(record.transition, `${field}.transition`, ['kind', 'durationMs'])
		const depth = object(record.depth, `${field}.depth`, ['shared3dPlane', 'fragmentInterleave'])
		const tolerance = object(record.tolerance, `${field}.tolerance`, ['position', 'velocity', 'angleDeg', 'poseDeg', 'sourceMs'])
		const boundaryMs = num(narration.boundaryMs, `${field}.narration.boundaryMs`, true)
		if (from.atMs !== boundaryMs || to.atMs !== boundaryMs || num(transfer.atMs, `${field}.transfer.atMs`, true) !== boundaryMs) fail('SLIDE_CONTINUITY_CLOCK_MISMATCH', field, 'Both endpoint and transfer times must equal the exact narration boundary.')
		if (transfer.authoredBy !== 'AI' || transfer.fromOwner !== fromSlideId || transfer.toOwner !== toSlideId) fail('SLIDE_CONTINUITY_OWNERSHIP', `${field}.transfer`, 'AI must author the exact slide ownership transfer.')
		if (transition.kind !== 'explicit-cut' || transition.durationMs !== 0 || depth.shared3dPlane !== false || depth.fragmentInterleave !== false) fail('SLIDE_CONTINUITY_UNSUPPORTED_TRANSITION', field, 'This route supports explicit cut only, without Morph or shared-depth interleave.')
		const cueIds = [...(Array.isArray(narration.fromCueIds) ? narration.fromCueIds : []), ...(Array.isArray(narration.toCueIds) ? narration.toCueIds : [])]
		if (!id(narration.streamId, `${field}.narration.streamId`) || !Array.isArray(narration.fromCueIds) || !narration.fromCueIds.length || !Array.isArray(narration.toCueIds) || !narration.toCueIds.length || cueIds.some(cue => typeof cue !== 'string' || !cue.trim()) || new Set(cueIds).size !== cueIds.length) fail('SLIDE_CONTINUITY_CUE_IDENTITY', `${field}.narration`, 'Cues must be nonempty, unique and assigned to exactly one side of the boundary.')
		const limits = Object.fromEntries(['position', 'velocity', 'angleDeg', 'poseDeg', 'sourceMs'].map(key => [key, num(tolerance[key], `${field}.tolerance.${key}`, true)]))
		const residuals = {
			actorPosition: distance(from.actor.position, to.actor.position),
			itemPosition: distance(from.item.position, to.item.position),
			actorAngleDeg: angularDistance(from.actor.angleDeg, to.actor.angleDeg),
			itemAngleDeg: angularDistance(from.item.angleDeg, to.item.angleDeg),
			velocity: distance(from.actor.velocity, to.actor.velocity),
			maxPoseDeg: from.actor.poseDeg.length === to.actor.poseDeg.length ? Math.max(...from.actor.poseDeg.map((value, i) => angularDistance(value, to.actor.poseDeg[i]))) : Infinity,
			sourceMs: Math.abs(from.actor.sourceTimeMs - to.actor.sourceTimeMs),
		}
		if (from.actor.supportFoot !== to.actor.supportFoot || from.actor.motionId !== to.actor.motionId || from.actor.sourceId !== to.actor.sourceId || from.actor.sourceDurationMs !== to.actor.sourceDurationMs || from.item.dataDigest !== to.item.dataDigest || from.item.digestVersion !== to.item.digestVersion || from.item.kind !== to.item.kind) fail('SLIDE_CONTINUITY_STATE_IDENTITY', field, 'Support, motion, source and editable item identity must persist across the boundary.')
		if (residuals.actorPosition > limits.position || residuals.itemPosition > limits.position || residuals.actorAngleDeg > limits.angleDeg || residuals.itemAngleDeg > limits.angleDeg || residuals.velocity > limits.velocity || residuals.maxPoseDeg > limits.poseDeg || residuals.sourceMs > limits.sourceMs) fail('SLIDE_CONTINUITY_STATE_JUMP', field, 'Authored endpoints exceed the declared continuity tolerance.')
		return {
			id: boundaryId, fromSlideId, toSlideId, actorLogicalId, itemLogicalId,
			from: { actorInstanceId: from.actorInstanceId, itemInstanceId: from.itemInstanceId, itemKind: from.item.kind, atMs: from.atMs, motionId: from.actor.motionId, actionId: from.actor.actionId },
			to: { actorInstanceId: to.actorInstanceId, itemInstanceId: to.itemInstanceId, itemKind: to.item.kind, atMs: to.atMs, motionId: to.actor.motionId, actionId: to.actor.actionId },
			transfer: { authoredBy: 'AI', atMs: boundaryMs, fromOwner: fromSlideId, toOwner: toSlideId },
			narration: { streamId: narration.streamId, boundaryMs, fromCueIds: [...narration.fromCueIds], toCueIds: [...narration.toCueIds] },
			transition: { kind: 'explicit-cut', durationMs: 0 },
			residuals, tolerance: limits, status: 'SEMANTIC_PREFLIGHT_PASS',
		}
	})
	return { contractVersion: SLIDE_CONTINUITY_CONTRACT_VERSION, boundaryClock: 'milliseconds-from-deck-start', positionUnit: 'normalized-stage', velocityUnit: 'normalized-stage-per-second', boundaries, qualification: 'semantic-preflight-only' }
}

// A layout object is only a planned native carrier. Binding it here prevents a
// semantic handoff from pointing at an absent or non-editable slide object; it
// does not establish package construction, narration ownership or playback.
export function bindSlideContinuitiesToPlan(continuities, plan) {
	if (!continuities.boundaries.length) return continuities
	const slides = new Map((plan?.slides || []).map(slide => [slide.slideId, slide]))
	const bound = continuities.boundaries.map((boundary, index) => {
		const bindings = {}
		for (const side of ['from', 'to']) {
			const slideId = side === 'from' ? boundary.fromSlideId : boundary.toSlideId
			const slide = slides.get(slideId)
			if (!slide) fail('SLIDE_CONTINUITY_PLANNED_SLIDE_MISSING', `slideContinuities[${index}].${side}`, 'The handoff slide has no planned native objects.')
			const objects = slide.objects || []
			const endpoint = boundary[side]
			const actorMatches = objects.filter(object => object.primitive === 'model3d' && (object.objectName === boundary.actorLogicalId || object.blockName === boundary.actorLogicalId))
			const itemKind = endpoint.itemKind
			const itemMatches = objects.filter(object => object.primitive === EDITABLE_ITEM_CARRIERS[itemKind] && (object.objectName === endpoint.itemInstanceId || object.blockName === endpoint.itemInstanceId))
			if (actorMatches.length !== 1 || !actorMatches[0].editHandle || actorMatches[0].objectName !== endpoint.actorInstanceId) fail('SLIDE_CONTINUITY_PLANNED_ACTOR_BINDING', `slideContinuities[${index}].${side}.actorInstanceId`, 'The authored actor instance ID must resolve to exactly one matching editable native presenter on its slide.')
			if (itemMatches.length !== 1 || !itemMatches[0].editHandle) fail('SLIDE_CONTINUITY_PLANNED_ITEM_BINDING', `slideContinuities[${index}].${side}.itemInstanceId`, 'The item instance must resolve to exactly one editable native object of its declared kind.')
			bindings[side] = {
				slideId,
				actor: { instanceId: endpoint.actorInstanceId, objectName: actorMatches[0].objectName, editHandle: actorMatches[0].editHandle },
				item: { instanceId: endpoint.itemInstanceId, objectName: itemMatches[0].objectName, editHandle: itemMatches[0].editHandle, primitive: itemMatches[0].primitive },
			}
		}
		if (bindings.from.actor.editHandle === bindings.to.actor.editHandle || bindings.from.item.editHandle === bindings.to.item.editHandle) fail('SLIDE_CONTINUITY_PLANNED_INSTANCE_COLLISION', `slideContinuities[${index}]`, 'The two slides must have distinct editable actor and item instances.')
		return { ...boundary, plannedBindings: bindings, bindingStatus: 'PLANNED_OBJECTS_ONLY' }
	})
	return { ...continuities, boundaries: bound }
}

// A planned handle is not enough: every boundary item must also resolve to
// exactly one emitted add operation carrying that same native edit identity.
// This remains operation identity preflight, not payload or package proof.
export function assertSlideContinuityItemOperations(continuities, operations) {
	if (!continuities.boundaries.length) return continuities
	const tools = {
		'editable-shape': 'betterpptx.slide.add_shape',
		'editable-text-shape': 'betterpptx.slide.add_text',
		'editable-shape-group': 'betterpptx.slide.add_group',
		'editable-chart': 'betterpptx.slide.add_chart',
		'editable-table': 'betterpptx.slide.add_table',
	}
	for (const [index, boundary] of continuities.boundaries.entries()) for (const side of ['from', 'to']) {
		const planned = boundary.plannedBindings?.[side]?.item
		const slideId = side === 'from' ? boundary.fromSlideId : boundary.toSlideId
		const expectedTool = tools[boundary[side]?.itemKind]
		if (!planned?.objectName || !planned.editHandle || !expectedTool) fail('SLIDE_CONTINUITY_OPERATION_BINDING', `slideContinuities[${index}].${side}`, 'The handoff item has no exact planned operation identity.')
		const matches = (operations || []).filter(operation => operation?.slideId === slideId && operation?.objectName === planned.objectName && operation?.tool === expectedTool)
		if (matches.length !== 1 || matches[0]?.args?.options?.objectName !== planned.objectName || matches[0]?.args?.options?.editHandle !== planned.editHandle) fail('SLIDE_CONTINUITY_OPERATION_BINDING', `slideContinuities[${index}].${side}`, 'The handoff item must resolve to exactly one native add operation with its planned edit handle.')
	}
	return continuities
}

// Compare the effective add-operation payload, not a caller-authored marker.
// Runtime handler and emitted-package checks remain independent later gates.
export function bindSlideContinuityItemPayloads(continuities, operations, authoredSpec) {
	if (!continuities.boundaries.length) return continuities
	const slides = new Map((authoredSpec?.slides || []).map(slide => [slide.id, slide]))
	const boundaries = continuities.boundaries.map((boundary, index) => {
		const computed = {}
		for (const side of ['from', 'to']) {
			const slideId = side === 'from' ? boundary.fromSlideId : boundary.toSlideId
			const instanceId = boundary[side].itemInstanceId
			const planned = boundary.plannedBindings?.[side]?.item
			const sourceBlocks = (slides.get(slideId)?.content || []).filter(block => block?.name === instanceId)
			const expectedTool = {
				'editable-shape': 'betterpptx.slide.add_shape',
				'editable-text-shape': 'betterpptx.slide.add_text',
				'editable-shape-group': 'betterpptx.slide.add_group',
			}[boundary[side].itemKind]
			if (!expectedTool) fail('SLIDE_CONTINUITY_ITEM_PAYLOAD_UNSUPPORTED', `slideContinuities[${index}].${side}.item.kind`, 'This editable carrier needs a separately verified resolved native payload contract.')
			const matching = (operations || []).filter(operation => operation?.slideId === slideId && operation?.objectName === planned?.objectName && operation?.tool === expectedTool && operation?.args?.options?.editHandle === planned?.editHandle)
			if (sourceBlocks.length !== 1 || !planned?.editHandle || matching.length !== 1) fail('SLIDE_CONTINUITY_ITEM_PAYLOAD_BINDING', `slideContinuities[${index}].${side}`, 'The editable item payload must bind one authored block to one exact emitted native add operation.')
			computed[side] = editableItemOperationDigest(matching[0], boundary[side].itemKind, sourceBlocks[0])
		}
		if (computed.from !== computed.to) fail('SLIDE_CONTINUITY_ITEM_EFFECTIVE_PAYLOAD_MISMATCH', `slideContinuities[${index}].item`, 'The two slide instances do not have the same effective editable payload.')
		const asserted = authoredSpec?.slideContinuities?.[index]
		if (asserted?.id !== boundary.id || asserted.from?.item?.dataDigest?.toLowerCase() !== computed.from || asserted.to?.item?.dataDigest?.toLowerCase() !== computed.to) {
			const error = new Error('The authored item dataDigest does not match the effective editable payload. Revise the versioned digest assertion and rerun dry-run.')
			error.code = 'SLIDE_CONTINUITY_ITEM_DIGEST_MISMATCH'
			error.field = `slideContinuities[${index}].item.dataDigest`
			error.details = { digestVersion: EDITABLE_ITEM_PAYLOAD_VERSION, computedDigest: computed.from }
			throw error
		}
		return { ...boundary, itemPayloadBinding: { status: 'COMPILED_OPERATION_PAYLOAD_MATCH', digestVersion: EDITABLE_ITEM_PAYLOAD_VERSION } }
	})
	return { ...continuities, boundaries }
}

// This binds only the author-selected public motion and slide-local action.
// A selected ID is not evidence that its private source, range or native pose
// matches the authored continuity state.
export function bindSlideContinuitiesToAuthoredActions(continuities, spec) {
	if (!continuities.boundaries.length) return continuities
	const slides = new Map((spec?.slides || []).map(slide => [slide.id, slide]))
	const selections = spec?.motionTime?.kineticSelection?.presenters || []
	const boundaries = continuities.boundaries.map((boundary, index) => {
		const authoredBoundary = spec.slideContinuities?.[index]
		if (authoredBoundary?.id !== boundary.id) fail('SLIDE_CONTINUITY_SOURCE_BINDING', `slideContinuities[${index}]`, 'The validated boundary must match its authored source record.')
		const authoredActionBindings = {}
		for (const side of ['from', 'to']) {
			const endpoint = boundary[side]
			const source = authoredBoundary[side].actor
			const slideId = side === 'from' ? boundary.fromSlideId : boundary.toSlideId
			const performance = slides.get(slideId)?.presenterPerformance
			const field = `slideContinuities[${index}].${side}.actor`
			if (!performance || performance.actor !== boundary.actorLogicalId) fail('SLIDE_CONTINUITY_ACTION_UNRESOLVED', field, 'The boundary actor must own a presenter performance on each slide.')
			if (performance.actorInstanceId !== authoredBoundary[side].actorInstanceId) fail('SLIDE_CONTINUITY_ACTION_INSTANCE_MISMATCH', `${field}.actorInstanceId`, 'The boundary actor instance ID must match the authored slide-local presenter performance instance.')
			const matches = (performance.actions || []).filter(action => action?.id === endpoint.actionId)
			if (matches.length !== 1 || matches[0].motionId !== endpoint.motionId) fail('SLIDE_CONTINUITY_ACTION_UNRESOLVED', field, 'Each boundary endpoint must name one exact action using its declared motion.')
			const action = matches[0]
			if (action.sourcePoseMs !== undefined) fail('SLIDE_CONTINUITY_HELD_SOURCE_UNSUPPORTED', field, 'A held source pose cannot establish a moving cross-slide boundary without an explicit held-boundary contract.')
			const sourceStartMs = action.sourceStartMs ?? 0
			const sourceEndMs = action.sourceEndMs ?? source.sourceDurationMs
			if (sourceStartMs < 0 || sourceEndMs <= sourceStartMs || sourceEndMs > source.sourceDurationMs || source.sourceTimeMs < sourceStartMs || source.sourceTimeMs > sourceEndMs) fail('SLIDE_CONTINUITY_SOURCE_RANGE', field, 'The authored boundary source sample must lie within its action source crop and declared source duration.')
			const selected = selections.filter(entry => entry?.presenterId === boundary.actorLogicalId)
			if (selected.length !== 1 || !Array.isArray(selected[0].selectedMotionIds) || !selected[0].selectedMotionIds.includes(endpoint.motionId)) fail('SLIDE_CONTINUITY_MOTION_NOT_SELECTED', field, 'The boundary motion must be explicitly selected for its presenter.')
			authoredActionBindings[side] = { slideId, motionId: endpoint.motionId, actionId: endpoint.actionId, sourceRangeStatus: 'AUTHORED_RANGE_ONLY' }
		}
		return { ...boundary, authoredActionBinding: { status: 'AUTHORED_ACTION_ONLY', ...authoredActionBindings } }
	})
	return { ...continuities, boundaries }
}

// Deck time zero is exact for the first slide even before audio is locked.
// Later slide starts need measured dwell and are deliberately not inferred
// from authored narration estimates or transfer labels here.
export function checkSlideContinuitiesAgainstKnownDeckStart(continuities, spec) {
	if (!continuities.boundaries.length) return continuities
	const firstSlideId = spec.slides?.[0]?.id
	const boundaries = continuities.boundaries.map((boundary, index) => {
		if (boundary.fromSlideId !== firstSlideId) return { ...boundary, sourceClockStatus: 'MEASURED_SLIDE_START_PENDING' }
		const performance = spec.slides[0]?.presenterPerformance
		const endpoint = spec.slideContinuities?.[index]?.from?.actor
		const localMs = boundary.from.atMs - (performance?.startMs ?? 0)
		let startMs = 0
		let matches = []
		for (const action of performance?.actions || []) {
			const endMs = startMs + action.durationMs
			if (action.id === boundary.from.actionId && localMs >= startMs && localMs <= endMs) matches.push({ action, startMs, endMs })
			startMs = endMs
		}
		const field = `slideContinuities[${index}].from.actor.sourceTimeMs`
		if (matches.length !== 1) fail('SLIDE_CONTINUITY_ACTION_CLOCK_MISMATCH', field, 'The outgoing boundary does not fall within its selected first-slide action.')
		const { action, startMs: actionStart, endMs: actionEnd } = matches[0]
		const blendMs = performance.blendMs ?? 240
		if (blendMs > 0 && actionEnd !== startMs && Math.abs(localMs - actionEnd) < blendMs) fail('SLIDE_CONTINUITY_BLEND_CLOCK_AMBIGUOUS', field, 'The boundary falls in an unresolved action blend window.')
		const sourceStartMs = action.sourceStartMs ?? 0
		const sourceEndMs = action.sourceEndMs ?? endpoint.sourceDurationMs
		const progress = (localMs - actionStart) / action.durationMs
		const cycles = action.cycles ?? 1
		const cycleProgress = progress === 1 ? 1 : (progress * cycles) % 1
		const expectedMs = sourceStartMs + (sourceEndMs - sourceStartMs) * cycleProgress
		if (Math.abs(expectedMs - endpoint.sourceTimeMs) > boundary.tolerance.sourceMs) fail('SLIDE_CONTINUITY_AUTHORED_SOURCE_CLOCK_MISMATCH', field, 'The outgoing boundary source sample disagrees with its selected action range and deck-clock position.')
		return { ...boundary, sourceClockStatus: 'FIRST_SLIDE_AUTHORED_CLOCK_ONLY', sourceClockResidualMs: Math.abs(expectedMs - endpoint.sourceTimeMs) }
	})
	return { ...continuities, boundaries }
}

// Only locked narration can establish the absolute starts of both slides.
// Authored dwell, a text estimate and a performance duration are not evidence
// of the spoken boundary. This remains a clock check, not native playback proof.
export function bindSlideContinuitiesToMeasuredDeckClock(continuities, spec, timingSpine) {
	if (!continuities.boundaries.length) return continuities
	const slides = Array.isArray(spec?.slides) ? spec.slides : []
	const timings = Array.isArray(timingSpine) ? timingSpine : []
	const boundaries = continuities.boundaries.map((boundary, index) => {
		const fromIndex = slides.findIndex(slide => slide.id === boundary.fromSlideId)
		const toIndex = fromIndex + 1
		const prefix = timings.slice(0, toIndex + 1)
		if (fromIndex < 0 || timings.length <= toIndex || prefix.some((timing, slideIndex) =>
			timing?.slideId !== slides[slideIndex]?.id || timing.timingEvidence !== 'measured-audio' || !Number.isFinite(timing.dwellMs) || timing.dwellMs <= 0)) {
			return { ...boundary, measuredDeckClockStatus: 'MEASURED_AUDIO_PENDING' }
		}
		const fromStartMs = prefix.slice(0, fromIndex).reduce((total, timing) => total + timing.dwellMs, 0)
		const toStartMs = fromStartMs + prefix[fromIndex].dwellMs
		if (boundary.narration.boundaryMs !== toStartMs) fail('SLIDE_CONTINUITY_MEASURED_BOUNDARY_CLOCK_MISMATCH', `slideContinuities[${index}].narration.boundaryMs`, 'The authored handoff does not equal the measured narration start of the next slide.')
		const residuals = {}
		for (const [side, slideIndex, slideStartMs] of [['from', fromIndex, fromStartMs], ['to', toIndex, toStartMs]]) {
			const endpoint = spec.slideContinuities?.[index]?.[side]?.actor
			const performance = slides[slideIndex]?.presenterPerformance
			const localMs = boundary[side].atMs - slideStartMs - (performance?.startMs ?? 0)
			let actionStartMs = 0
			let match = null
			for (const action of performance?.actions || []) {
				const actionEndMs = actionStartMs + action.durationMs
				if (action.id === boundary[side].actionId && localMs >= actionStartMs && localMs <= actionEndMs) match = { action, actionStartMs, actionEndMs }
				actionStartMs = actionEndMs
			}
			const field = `slideContinuities[${index}].${side}.actor.sourceTimeMs`
			if (!match) fail('SLIDE_CONTINUITY_ACTION_CLOCK_MISMATCH', field, 'The measured boundary does not fall within its selected slide-local action.')
			const blendMs = performance.blendMs ?? 240
			if (blendMs > 0 && match.actionEndMs !== actionStartMs && Math.abs(localMs - match.actionEndMs) < blendMs) fail('SLIDE_CONTINUITY_BLEND_CLOCK_AMBIGUOUS', field, 'The measured boundary falls in an unresolved action blend window.')
			const sourceStartMs = match.action.sourceStartMs ?? 0
			const sourceEndMs = match.action.sourceEndMs ?? endpoint.sourceDurationMs
			const progress = (localMs - match.actionStartMs) / match.action.durationMs
			const cycles = match.action.cycles ?? 1
			const cycleProgress = progress === 1 ? 1 : (progress * cycles) % 1
			const expectedMs = sourceStartMs + (sourceEndMs - sourceStartMs) * cycleProgress
			residuals[side] = Math.abs(expectedMs - endpoint.sourceTimeMs)
			if (residuals[side] > boundary.tolerance.sourceMs) fail('SLIDE_CONTINUITY_MEASURED_SOURCE_CLOCK_MISMATCH', field, 'The boundary source sample disagrees with the measured deck clock and selected action range.')
		}
		return { ...boundary, measuredDeckClockStatus: 'MEASURED_AUDIO_CLOCK_VERIFIED', measuredDeckClockResidualMs: residuals }
	})
	return { ...continuities, boundaries }
}

// The resolver is supplied by the private service catalog, never by a public
// spec. This checks immutable release identity only; the compiler must still
// verify the measured deck clock, package state and native playback separately.
export function bindSlideContinuitiesToQualifiedReleases(continuities, spec, resolveRelease) {
	if (!continuities.boundaries.length || typeof resolveRelease !== 'function') return continuities
	const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
	const matchesBytes = (bytes, digest) => bytes instanceof Uint8Array && bytes.byteLength > 0 && sha(digest) && crypto.createHash('sha256').update(bytes).digest('hex') === digest.toLowerCase()
	const boundaries = continuities.boundaries.map((boundary, index) => {
		const releases = {}
		for (const side of ['from', 'to']) {
			const field = `slideContinuities[${index}].${side}.actor`
			const endpoint = boundary[side]
			const authored = spec.slideContinuities?.[index]?.[side]?.actor
			const cast = [spec.presenter, ...(Array.isArray(spec.presenters?.cast) ? spec.presenters.cast : [])].filter(entry => entry?.id === boundary.actorLogicalId)
			if (cast.length !== 1 || !cast[0].identity) fail('SLIDE_CONTINUITY_PRESENTER_IDENTITY', field, 'A boundary action needs one explicit presenter identity.')
			const release = resolveRelease({ motionId: endpoint.motionId, presenterIdentity: cast[0].identity })
			if (release == null) return { ...boundary, sourceReleaseStatus: 'UNQUALIFIED' }
			if (Array.isArray(release) || release.status !== 'QUALIFIED' || release.motionId !== endpoint.motionId || release.presenterIdentity !== cast[0].identity || release.sourceId !== authored?.sourceId || release.sourceDurationMs !== authored.sourceDurationMs || typeof release.releaseVersion !== 'string' || !release.releaseVersion.trim() || !matchesBytes(release.sourceBytes, release.sourceSha256) || !matchesBytes(release.assetBytes, release.assetSha256) || !matchesBytes(release.targetRigBytes, release.targetRigSha256) || !matchesBytes(release.nativeProofBytes, release.nativeProofSha256)) fail('SLIDE_CONTINUITY_SOURCE_RELEASE_MISMATCH', field, 'The selected motion has no exact, byte-verified qualified source release for this presenter and authored source clock.')
			releases[side] = release
		}
		if (!releases.from || !releases.to) return { ...boundary, sourceReleaseStatus: 'UNQUALIFIED' }
		for (const key of ['releaseVersion', 'sourceSha256', 'assetSha256', 'targetRigSha256']) if (releases.from[key] !== releases.to[key]) fail('SLIDE_CONTINUITY_SOURCE_RELEASE_MISMATCH', `slideContinuities[${index}]`, 'Both sides of the boundary must use the same immutable motion release.')
		return { ...boundary, sourceReleaseStatus: 'QUALIFIED' }
	})
	return { ...continuities, boundaries }
}

// This binds authored cue identities, not measured audio or PowerPoint media.
// It prevents a boundary from citing cues that do not exist on its owning slide.
export function bindSlideContinuitiesToAuthoredNarration(continuities, spec) {
	if (!continuities.boundaries.length) return continuities
	const slides = new Map((spec?.slides || []).map(slide => [slide.id, slide]))
	const boundaries = continuities.boundaries.map((boundary, index) => {
		const authoredCueBindings = {}
		for (const side of ['from', 'to']) {
			const slideId = side === 'from' ? boundary.fromSlideId : boundary.toSlideId
			const narration = slides.get(slideId)?.narration
			const field = `slideContinuities[${index}].narration.${side}CueIds`
			if (!narration || narration.streamId !== boundary.narration.streamId) fail('SLIDE_CONTINUITY_NARRATION_STREAM_UNRESOLVED', field, 'Both slides must declare the same authored narration stream ID as the handoff.')
			const cues = narration.cues ?? narration.timing?.cues ?? narration.timeline?.cues ?? narration.narrationTiming?.cues ?? []
			if (!Array.isArray(cues)) fail('SLIDE_CONTINUITY_NARRATION_CUE_UNRESOLVED', field, 'The authored narration cues must be an array.')
			const requested = boundary.narration[`${side}CueIds`]
			const selected = requested.map(cueId => {
				const matches = cues.filter(cue => cue?.id === cueId)
				if (matches.length !== 1) fail('SLIDE_CONTINUITY_NARRATION_CUE_UNRESOLVED', field, 'Each handoff cue ID must resolve exactly once on its owning slide.')
				const cue = matches[0]
				if (cue.atMs == null && !cue.atPhrase && !cue.atWord && cue.delay == null) fail('SLIDE_CONTINUITY_NARRATION_CUE_UNTIMED', field, 'A handoff cue must carry an authored timing anchor.')
				return { id: cueId, timingAnchor: cue.atMs != null ? 'atMs' : cue.atPhrase ? 'atPhrase' : cue.atWord ? 'atWord' : 'delay' }
			})
			authoredCueBindings[side] = { slideId, cues: selected }
		}
		return { ...boundary, narrationBinding: { status: 'AUTHORED_CUES_ONLY', streamId: boundary.narration.streamId, ...authoredCueBindings } }
	})
	return { ...continuities, boundaries }
}
