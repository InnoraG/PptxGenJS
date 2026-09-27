import { PRESENTER_PERFORMANCE_CONTRACT } from './presenter-performance-contract.mjs'

// Exact public contract for the presenter-motion selection surface. Availability
// comes from the current governed catalog, including any active playback hold.

export const PRESENTER_MOTION_SELECTION_UNIT_ID = 'impl-g-fda81babc322aa74'
export const PRESENTER_MOTION_SELECTION_EXACT_CONTRACT = Object.freeze({
	id: 'presenterMotionSelection',
	schemaVersion: 'betterpptx.presenter-motion-selection.v1',
	unitId: PRESENTER_MOTION_SELECTION_UNIT_ID,
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze(['motionSelection', 'timing']),
	overrideFields: Object.freeze([
		'motionTime.kineticSelection.presenters[].selectedMotionIds',
		'slides[].presenterMotion.motionId',
		'slides[].presenterMotion.narrationCue',
		'slides[].presenterPerformance',
		'duration', 'delay',
	]),
	resetBehavior: Object.freeze({
		component: 'set the selected presenter motion ID or timing field to null or omit it',
		full: 'remove the authored presenter-motion selection and timing overrides',
		nullBehavior: 'explicit null removes only that motion/timing override and restores the semantic presenter/world default',
	}),
	precedence: Object.freeze([
		'AI-authored ordered selectedMotionIds bundle and exact per-slide presenterMotion.motionId',
		'explicit narrationCue and duration/delay timing fields',
		'world/presenter semantic default motion only when no explicit selection is authored',
	]),
	legalCombinations: Object.freeze([
		'one presenter selection bundle contains one to eighteen unique executable motion.* IDs',
		'each slide presenterMotion.motionId must be present in the selected presenter bundle and may carry a narrationCue',
		'ordinary and kinetic semantic clips may be mixed in one ordered bundle while preserving exact IDs and no silent substitution',
		'presenterPerformance sequences one to thirty-two actions on the same slide, with blend timing, 3D keyframes, entry, travel, interactions and exit',
		'component null reset may be followed by sparse re-edit without changing presenter identity or slide layout',
	]),
	applicability: Object.freeze([
		'currently executable semantic presenter-motion entries exposed by betterpptx.authoring.catalog family presenter-motion',
		'motionTime.kineticSelection.presenters[].selectedMotionIds[] bundle authoring',
		'slides[].presenterMotion.motionId with optional narrationCue',
	]),
	limitation: 'Single gestures and continuous performances use semantic motion IDs. Clip maps, provider assets, animation slots, and realization internals remain private.',
	performanceContract: Object.freeze({ schemaVersion: PRESENTER_PERFORMANCE_CONTRACT.schemaVersion, field: PRESENTER_PERFORMANCE_CONTRACT.field, discoverThrough: { tool: 'betterpptx.help.tool_recipe', surface: 'animation' } }),
	publicSchema: Object.freeze({
		type: 'object',
		additionalProperties: false,
		properties: Object.freeze({
			presenterId: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
			selectedMotionIds: Object.freeze({ type: 'array', minItems: 1, maxItems: 18, uniqueItems: true, items: Object.freeze({ type: 'string', pattern: '^motion\\.[a-z0-9-]+\\.[a-z0-9-]+$' }) }),
			motionId: Object.freeze({ type: ['string', 'null'], pattern: '^motion\\.[a-z0-9-]+\\.[a-z0-9-]+$' }),
			narrationCue: Object.freeze({ type: ['string', 'null'], maxLength: 512 }),
			duration: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 86400000 }),
			delay: Object.freeze({ type: ['number', 'null'], minimum: 0, maximum: 86400000 }),
		}),
	}),
})

export const PRESENTER_MOTION_SELECTION_HELD_CONTRACT = Object.freeze({
	id: 'presenterMotionPlaybackHold',
	schemaVersion: 'betterpptx.presenter-motion-playback-hold.v1',
	unitId: PRESENTER_MOTION_SELECTION_UNIT_ID,
	capabilityMode: 'discrete',
	capabilityStatus: 'not-applicable',
	runtimeReady: false,
	componentOwnership: Object.freeze(['motionSelection', 'playbackProofGate']),
	overrideFields: Object.freeze([]),
	resetBehavior: Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' }),
	precedence: Object.freeze(['native playback proof gate', 'source-retained catalog entry']),
	legalCombinations: Object.freeze(['the held motion remains discoverable as retained source provenance but cannot be selected for a public presenter bundle']),
	applicability: Object.freeze(['implemented source retained for audit', 'not selectable until satisfactory native PowerPoint playback proof']),
	limitation: 'This source-retained motion is intentionally withheld from public selection; it does not count as an executable authoring choice until playback proof closes.',
})

export function presenterMotionSelectionCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'semantic-presenter-motion' || entry.family !== 'presenter-motion') return null
	if (entry.selectable === false || String(entry.availability || '') === 'IMPLEMENTED_NOT_SELECTABLE') return PRESENTER_MOTION_SELECTION_HELD_CONTRACT
	const id = String(entry.id || '')
	return /^motion\.[a-z0-9-]+\.[a-z0-9-]+$/i.test(id) ? PRESENTER_MOTION_SELECTION_EXACT_CONTRACT : null
}

export function validatePresenterMotionSelection(value, path = 'motionSelection') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	if (value.presenterId !== undefined && (typeof value.presenterId !== 'string' || !value.presenterId.trim())) throw new Error(`${path}.presenterId must be a non-empty string.`)
	if (value.selectedMotionIds !== undefined) {
		if (!Array.isArray(value.selectedMotionIds) || value.selectedMotionIds.length < 1 || value.selectedMotionIds.length > 18) throw new Error(`${path}.selectedMotionIds must contain 1 to 18 motion IDs.`)
		if (new Set(value.selectedMotionIds).size !== value.selectedMotionIds.length || value.selectedMotionIds.some(id => !/^motion\.[a-z0-9-]+\.[a-z0-9-]+$/i.test(String(id)))) throw new Error(`${path}.selectedMotionIds must contain unique semantic motion.* IDs.`)
	}
	if (value.motionId !== undefined && value.motionId !== null && !/^motion\.[a-z0-9-]+\.[a-z0-9-]+$/i.test(String(value.motionId))) throw new Error(`${path}.motionId must be a semantic motion.* ID or null.`)
	for (const key of ['duration', 'delay']) if (value[key] !== undefined && value[key] !== null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 86400000)) throw new Error(`${path}.${key} must be null or a finite number from 0 to 86400000.`)
	return { ...value }
}
