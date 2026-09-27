// Exact selector/timing contract for the generated motion family.  The rows
// covered here are the concrete effect, motion-path, Morph, and animation
// semantics emitted by the capability ledger.  Ribbon transition presets and
// the direct aggregate operations retain their narrower residual units.

const ROW_IDS = Object.freeze([
	'cap_145249aafcafbc536177',
])
const EXACT_AUTHORING_FAMILY_ID = ROW_IDS[0]
const EXACT_CATEGORIES = Object.freeze(new Set([
	'Transitions', 'Morph Semantics', 'Animations entrance', 'Animations exit', 'Animations emphasis',
	'Animations media', 'Animations motion', 'Motion Paths', 'Animation Semantics',
]))
const EXACT_OPERATION_LABELS = Object.freeze(new Set([
	'betterpptx-mcp.object.apply_animation',
	'betterpptx-mcp.object.apply_motion_path',
	'add animation group',
]))

const NOT_APPLICABLE_RESET = Object.freeze({
	component: 'set the selected animation/effect or timing leaf to null',
	full: 'remove the authored motion/effect and timing state',
	nullBehavior: 'explicit null restores the native/default effect or trigger value; omission preserves the current authored state',
})

const MOTION_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		type: { type: 'string', enum: ['entrance', 'emphasis', 'exit', 'motion', 'media'] },
		effect: { type: 'string', minLength: 1, maxLength: 128 }, duration: { type: ['number', 'null'], minimum: 0, maximum: 86400000 }, delay: { type: ['number', 'null'], minimum: 0, maximum: 86400000 },
		trigger: { type: ['string', 'null'], enum: ['onClick', 'withPrevious', 'afterPrevious', null] }, direction: { type: ['string', 'null'], maxLength: 64 },
		sequence: { type: ['string', 'null'], enum: ['asOneObject', 'allAtOnce', 'byParagraph', null] }, repeatCount: { type: ['integer', 'string', 'null'], minimum: 1, maximum: 1000 }, autoReverse: { type: ['boolean', 'null'] },
		motionPath: { type: ['string', 'null'], maxLength: 128 }, motionPathData: { type: ['string', 'null'], maxLength: 4096 }, motionPathCoordinateSpace: { type: ['string', 'null'], enum: ['slide', 'powerpoint', null] }, scale: { type: ['number', 'null'], minimum: 0, maximum: 1000 }, rotation: { type: ['number', 'null'], minimum: -36000, maximum: 36000 }, clockwise: { type: ['boolean', 'null'] }, color: { type: ['string', 'null'], pattern: '^#?[0-9A-Fa-f]{6}$' },
		shapeType: { type: ['string', 'null'], enum: ['circle', 'box', 'diamond', 'plus', 'wedge', null] }, spokes: { type: ['integer', 'null'], minimum: 1, maximum: 64 }, amount: { type: ['number', 'string', 'null'] }, mediaCommand: { type: ['string', 'null'], maxLength: 512 }, usesVisibility: { type: ['boolean', 'null'] },
	},
})

export const MOTION_AUTHORING_FAMILY_CONTRACT = Object.freeze({
	id: 'motionAuthoringFamily', schemaVersion: 'betterpptx.motion-authoring-family.v1', capabilityMode: 'preset-plus-parameters', capabilityStatus: 'executable-exact-structured', runtimeIntegrationComplete: true,
	componentOwnership: Object.freeze(['motionOrTransitionEffect', 'timing']),
	overrideFields: Object.freeze(['duration', 'delay', 'trigger', 'direction', 'effectOptions']),
	resetBehavior: NOT_APPLICABLE_RESET,
	precedence: Object.freeze(['explicit effect/transition selector', 'typed timing and effect options', 'native/default motion timing']),
	legalCombinations: Object.freeze([
		'native entrance, emphasis, exit, media, or motion-path selector with duration, delay, trigger, and direction',
		'Morph by-object, by-word, or by-character option with native slide timing',
		'null reset followed by sparse re-edit while preserving the target object and slide identity',
	]),
	applicability: Object.freeze(['semantic timeline on slide content', 'direct animation/motion-path operation', 'native slide transition and Morph selectors']),
	limitation: 'Effect-specific Office canonicalization remains governed by the native option registry; unsupported values fail closed before package mutation.',
	publicSchema: MOTION_SCHEMA,
	rowIds: ROW_IDS,
})

export function motionAuthoringFamilyCapabilityContractForEntry(entry = {}) {
	if (entry.family !== 'motion-transitions-morph') return null
	if (entry.sourceKind === 'authoring-family' && String(entry.id || '') === EXACT_AUTHORING_FAMILY_ID) return MOTION_AUTHORING_FAMILY_CONTRACT
	if (entry.sourceKind !== 'capability-row') return null
	const category = String(entry.category || '')
	const label = String(entry.publicName || entry.label || '')
	if (EXACT_CATEGORIES.has(category)) return MOTION_AUTHORING_FAMILY_CONTRACT
	if (category === 'MCP Product Surface' || category === 'Slide Authoring') return EXACT_OPERATION_LABELS.has(label) ? MOTION_AUTHORING_FAMILY_CONTRACT : null
	return null
}
