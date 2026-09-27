// Exact public entry contract for the generic "add slide" capability row.
// The public product creates and edits this carrier through the JSON-spec
// front door; the low-level primitive remains an internal execution detail.

export const ADD_SLIDE_ENTRY_UNIT_ID = 'impl-b-7291f4091e2c2f56'
export const ADD_SLIDE_ENTRY_ROW_ID = 'cap_d3e8dd4cef35a9b5dc30'

const NULLABLE_BOOLEAN = Object.freeze({ type: ['boolean', 'null'] })

export const ADD_SLIDE_ENTRY_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['id', 'title', 'layoutIntent', 'content']),
	properties: Object.freeze({
		id: Object.freeze({ type: 'string', pattern: '^[A-Za-z0-9._:-]+$' }),
		title: Object.freeze({ type: 'string', minLength: 1, maxLength: 4096 }),
		layoutIntent: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
		content: Object.freeze({ type: 'array' }),
		layoutName: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 512 }),
		masterName: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 512 }),
		hidden: NULLABLE_BOOLEAN,
		showMasterShapes: NULLABLE_BOOLEAN,
		showMasterBackground: NULLABLE_BOOLEAN,
		transition: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { type: 'object', additionalProperties: true }]) }),
		notes: Object.freeze({ type: ['string', 'null'], maxLength: 1048576 }),
	}),
})

export const ADD_SLIDE_ENTRY_CONTRACT = Object.freeze({
	id: 'nativeSlideEntry',
	schemaVersion: 'betterpptx.add-slide-entry.v1',
	unitId: ADD_SLIDE_ENTRY_UNIT_ID,
	rowIds: Object.freeze([ADD_SLIDE_ENTRY_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze([
		'slide.semanticIdentity',
		'slide.layoutRelationship',
		'slide.masterRelationship',
		'slide.visibility',
		'slide.masterGraphicsVisibility',
		'slide.transition',
		'slide.notesPart',
	]),
	overrideFields: Object.freeze([
		'slide.layoutName',
		'slide.masterName',
		'slide.hidden',
		'slide.showMasterShapes',
		'slide.showMasterBackground',
		'slide.transition',
		'slide.notes',
	]),
	resetBehavior: Object.freeze({
		component: 'set layoutName, masterName, hidden, showMasterShapes/showMasterBackground, transition, or notes to null',
		full: 'remove authored slide-level overrides while retaining the semantic slide and its content',
		nullBehavior: 'restore the native/default visible state, inherited layout/master binding and master graphics, no transition, or empty notes as appropriate; omission preserves current state',
	}),
	precedence: Object.freeze([
		'authored semantic slide identity and title',
		'explicit layoutName and compatible masterName',
		'explicit slide-level visibility, transition, and notes including false and zero values',
		'inherited layout/master policy and native defaults',
	]),
	legalCombinations: Object.freeze([
		'a semantic slide may combine one valid layout/master binding, hidden or visible state, master-graphics visibility, one native transition, speaker notes, and ordinary editable content',
		'sparse update, null reset, re-edit, duplicate with a unique semantic ID, reorder, delete, export, and replay preserve slide identity and package relationships',
	]),
	publicSchema: ADD_SLIDE_ENTRY_SCHEMA,
})

export function addSlideEntryCapabilityContractForEntry(entry = {}) {
	return String(entry.id || '') === ADD_SLIDE_ENTRY_ROW_ID ? ADD_SLIDE_ENTRY_CONTRACT : null
}
