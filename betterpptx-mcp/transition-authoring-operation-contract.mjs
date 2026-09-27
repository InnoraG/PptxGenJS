// Exact contract for the two direct slide-transition entry points: the
// capability-ledger "add transition" row and the focused
// betterpptx-mcp.slide.add_with_transition product operation.

import { TRANSITION_FORMAT_PARAMETERS, validateTransitionFormatOptions } from './option-registry.mjs'

export const TRANSITION_AUTHORING_OPERATION_UNIT_ID = 'impl-e-820ff13c144d460f'
export const TRANSITION_AUTHORING_OPERATION_ROW_IDS = Object.freeze({
	addWithTransition: 'cap_aa6c72c71949908da533',
	addTransition: 'cap_93889b4608abde3bb4b4',
})

const RESET_BEHAVIOR = Object.freeze({
	component: 'set transition or one typed timing/option field to null or omit it',
	full: 'remove the authored slide transition and timing overrides',
	nullBehavior: 'explicit null removes only that transition override and restores the native/default slide transition',
})

const TRANSITION_OPERATION_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		transition: Object.freeze({ type: ['object', 'null'], additionalProperties: true }),
		outputName: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
		deckId: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
		slideIndex: Object.freeze({ type: 'integer', minimum: 0 }),
	}),
})

export const TRANSITION_AUTHORING_OPERATION_CONTRACT = Object.freeze({
	id: 'transitionAuthoringOperation',
	schemaVersion: 'betterpptx.transition-authoring-operation.v1',
	unitId: TRANSITION_AUTHORING_OPERATION_UNIT_ID,
	rowIds: Object.freeze(Object.values(TRANSITION_AUTHORING_OPERATION_ROW_IDS)),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze(['transitionEffect', 'timing', 'slideTarget']),
	overrideFields: Object.freeze([
		'transition', 'transition.type', 'transition.speed', 'transition.duration',
		'transition.advanceOnClick', 'transition.advanceAfterTime',
		'transition.direction', 'transition.throughBlack', 'transition.splitDirection',
		'transition.pattern', 'transition.spokes', 'transition.clockwise',
		'transition.zoomFrom', 'transition.option', 'transition.invX',
		'transition.invY', 'transition.p14dur', 'outputName', 'slideIndex',
	]),
	resetBehavior: RESET_BEHAVIOR,
	precedence: Object.freeze([
		'exact native transition type or captured Transition Ribbon selector',
		'explicit typed transition timing/direction/option override',
		'PowerPoint native transition default and inherited slide advance policy',
	]),
	legalCombinations: Object.freeze([
		'a slide transition may combine a canonical type with speed, duration, direction, and applicable option fields',
		'Morph may select byObject, byWord, or byChar while retaining ordinary slide content and timing',
		'Wheel/clock options apply only to their native families and advance-on-click/advance-after-time may coexist',
		'component null reset may be followed by sparse transition re-edit without mutating slide identity or object animation',
	]),
	applicability: Object.freeze([
		'newly authored slides and semantic deck-spec slides[].transition',
		'focused product transition specimen generation through betterpptx-mcp.slide.add_with_transition',
		'native transition package serialization, readback, and PowerPoint SaveCopyAs roundtrip',
	]),
	limitation: 'This contract owns slide transitions and advance timing; object animation and Transition Ribbon gallery tile discovery remain separately classified motion contracts.',
	publicSchema: TRANSITION_OPERATION_SCHEMA,
	parameterCatalog: Object.freeze(TRANSITION_FORMAT_PARAMETERS.map(parameter => parameter.id)),
})

export function transitionAuthoringOperationCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'capability-row') return null
	const label = String(entry.publicName || entry.label || '').trim().toLowerCase()
	const rowId = String(entry.id || '')
	const matchesAddWithTransition = rowId === TRANSITION_AUTHORING_OPERATION_ROW_IDS.addWithTransition && label === 'betterpptx-mcp.slide.add_with_transition' && String(entry.category || '') === 'MCP Product Surface'
	const matchesAddTransition = rowId === TRANSITION_AUTHORING_OPERATION_ROW_IDS.addTransition && label === 'add transition' && String(entry.category || '') === 'Slide Authoring'
	return matchesAddWithTransition || matchesAddTransition ? TRANSITION_AUTHORING_OPERATION_CONTRACT : null
}

export function validateTransitionAuthoringOperationArgs(value = {}, path = 'transitionOperation') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) if (!Object.prototype.hasOwnProperty.call(TRANSITION_OPERATION_SCHEMA.properties, key)) throw new Error(`${path}.${key} is not part of the public transition operation contract.`)
	if (value.outputName !== undefined && (typeof value.outputName !== 'string' || !value.outputName.trim())) throw new Error(`${path}.outputName must be a non-empty string.`)
	if (value.deckId !== undefined && (typeof value.deckId !== 'string' || !value.deckId.trim())) throw new Error(`${path}.deckId must be a non-empty deck handle.`)
	if (value.slideIndex !== undefined && (!Number.isInteger(value.slideIndex) || value.slideIndex < 0)) throw new Error(`${path}.slideIndex must be a non-negative integer.`)
	if (value.transition !== undefined && value.transition !== null) validateTransitionFormatOptions(value.transition, `${path}.transition`)
	return { ...value }
}

