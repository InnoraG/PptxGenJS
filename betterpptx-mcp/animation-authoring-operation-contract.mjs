// Exact contract for the Slide Authoring "add animation" aggregate.
// The concrete effect and motion-path selectors are covered by the shared
// motion family; this contract owns the public operation that targets one or
// more named slide objects and carries their typed timing/effect options.

import { ANIMATION_FORMAT_PARAMETERS, validateAnimationFormatOptions } from './option-registry.mjs'

export const ANIMATION_AUTHORING_OPERATION_UNIT_ID = 'impl-e-7c3aa0de3f3206f0'
export const ANIMATION_AUTHORING_OPERATION_ROW_ID = 'cap_f90154c51c52dc5aaaea'

const NOT_APPLICABLE_RESET = Object.freeze({
	component: 'set the named animation/timing field to null or omit it',
	full: 'remove authored animation and timing overrides from the selected object(s)',
	nullBehavior: 'explicit null removes only that animation/timing override and restores the native/default timing',
})

const ANIMATION_OPERATION_SCHEMA = Object.freeze({
	type: 'object',
	required: Object.freeze(['animation']),
	additionalProperties: false,
	properties: Object.freeze({
		animation: Object.freeze({
			type: 'object',
			required: Object.freeze(['type', 'effect']),
			properties: Object.freeze({ motionEasing: Object.freeze({ type: ['string', 'null'], enum: ['smooth', 'linear', null] }) }),
			additionalProperties: true,
		}),
		names: Object.freeze({ type: 'array', maxItems: 256, items: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }) }),
		kinds: Object.freeze({ type: 'array', maxItems: 32, items: Object.freeze({ type: 'string', minLength: 1, maxLength: 64 }) }),
		indices: Object.freeze({ type: 'array', maxItems: 256, items: Object.freeze({ type: 'integer', minimum: 0 }) }),
		staggerMs: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 86400000 }),
		preserveExistingTiming: Object.freeze({ type: 'boolean', default: false }),
	}),
})

export const ANIMATION_AUTHORING_OPERATION_CONTRACT = Object.freeze({
	id: 'animationAuthoringOperation',
	schemaVersion: 'betterpptx.animation-authoring-operation.v1',
	unitId: ANIMATION_AUTHORING_OPERATION_UNIT_ID,
	rowIds: Object.freeze([ANIMATION_AUTHORING_OPERATION_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze(['motionOrTransitionEffect', 'timing', 'animationTarget']),
	overrideFields: Object.freeze([
		'animation', 'animation.type', 'animation.effect', 'animation.sequence',
		'animation.repeatCount', 'animation.autoReverse', 'animation.motionPath',
		'animation.motionPathData', 'animation.motionPathCoordinateSpace', 'animation.motionEasing', 'animation.scale', 'animation.scaleX', 'animation.scaleY', 'animation.rotation',
		'animation.clockwise', 'animation.color', 'animation.shapeType',
		'animation.spokes', 'animation.amount', 'animation.mediaCommand',
		'animation.usesVisibility', 'duration', 'delay', 'trigger', 'direction',
		'effectOptions', 'order', 'staggerMs', 'preserveExistingTiming',
	]),
	resetBehavior: NOT_APPLICABLE_RESET,
	precedence: Object.freeze([
		'exact native animation effect/type and motion-path selector',
		'explicit typed timing/effect option on the operation',
		'PowerPoint native animation default and inherited slide timing',
	]),
	legalCombinations: Object.freeze([
		'one animation descriptor may target one named object, an ordered name set, a kind set, or explicit object indices',
		'an explicit unique name may target a native editable group descendant; kind, index, and unnamed selections remain top-level only; ambiguous names reject before any animation is applied',
		'entrance, emphasis, exit, motion, and media effects may carry duration, delay, trigger, direction, and applicable effect options',
		'multiple objects may use staggerMs while preserving one shared native selector and per-object timing order',
		'null component reset may be followed by sparse re-edit without changing object identity or unrelated slide transitions',
	]),
	applicability: Object.freeze([
		'newly authored or imported slide objects with stable objectName values',
		'native PowerPoint object animation and semantic deck-spec content[].animation/timeline lowering',
		'ordered multi-object animation application through names, kinds, or indices',
	]),
	limitation: 'The aggregate owns object-animation targeting and typed operation semantics; captured Transition Ribbon tiles and the direct slide-transition aggregate are separate contracts, while provider-specific presenter motion is intentionally outside this native object-animation surface.',
	publicSchema: ANIMATION_OPERATION_SCHEMA,
	parameterCatalog: Object.freeze(ANIMATION_FORMAT_PARAMETERS.map(parameter => parameter.id)),
})

export function animationAuthoringOperationCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'capability-row') return null
	if (entry.id !== ANIMATION_AUTHORING_OPERATION_ROW_ID) return null
	if (String(entry.category || '') !== 'Slide Authoring') return null
	if (String(entry.publicName || entry.label || '').trim().toLowerCase() !== 'add animation') return null
	return ANIMATION_AUTHORING_OPERATION_CONTRACT
}

export function validateAnimationAuthoringOperationArgs(value = {}, path = 'animationOperation') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) {
		if (!Object.prototype.hasOwnProperty.call(ANIMATION_OPERATION_SCHEMA.properties, key)) throw new Error(`${path}.${key} is not part of the public add animation contract.`)
	}
	if (value.names !== undefined && (!Array.isArray(value.names) || value.names.some(name => typeof name !== 'string' || !name.trim()))) throw new Error(`${path}.names must contain non-empty objectName strings.`)
	if (value.kinds !== undefined && (!Array.isArray(value.kinds) || value.kinds.some(kind => typeof kind !== 'string' || !kind.trim()))) throw new Error(`${path}.kinds must contain non-empty object kind strings.`)
	if (value.indices !== undefined && (!Array.isArray(value.indices) || value.indices.some(index => !Number.isInteger(index) || index < 0))) throw new Error(`${path}.indices must contain non-negative integer object indices.`)
	if (value.staggerMs !== undefined && value.staggerMs !== null && (typeof value.staggerMs !== 'number' || !Number.isFinite(value.staggerMs) || value.staggerMs < 0 || value.staggerMs > 86400000)) throw new Error(`${path}.staggerMs must be null or a finite number from 0 to 86400000.`)
	const animation = validateAnimationFormatOptions(value.animation, `${path}.animation`)
	if (animation == null || Array.isArray(animation)) throw new Error(`${path}.animation must be one animation object.`)
	if (!animation.type || !animation.effect) throw new Error(`${path}.animation requires type and effect.`)
	return { ...value, animation }
}
