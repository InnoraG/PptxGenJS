import {
	LAYOUT_GRAPHIC_PLACEHOLDER_ROWS,
	LAYOUT_PLACEHOLDER_BINDING_SCHEMA,
} from './layout-placeholder-variants-contract.mjs'

export const LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID = 'impl-b-bd9036f7a7458201'
export const SHOW_MASTER_SHAPES_ROW_ID = 'cap_ba389c82d344c0610bab'
export const LAYOUT_GRAPHIC_PLACEHOLDER_ROW_IDS = Object.freeze(LAYOUT_GRAPHIC_PLACEHOLDER_ROWS.map(row => row.id))
export const LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROW_IDS = Object.freeze([
	...LAYOUT_GRAPHIC_PLACEHOLDER_ROW_IDS,
	SHOW_MASTER_SHAPES_ROW_ID,
])

export const GRAPHIC_FRAME_PLACEHOLDER_CONTRACT = Object.freeze({
	id: 'nativeGraphicFramePlaceholderBindings',
	schemaVersion: 'betterpptx.graphic-frame-placeholder-contract.v1',
	unitId: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID,
	rowIds: LAYOUT_GRAPHIC_PLACEHOLDER_ROW_IDS,
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	scope: 'native chart and table layout/master placeholders plus populated slide p:graphicFrame bindings; chart/table creation remains owned by their separate public authoring surfaces',
	componentOwnership: Object.freeze([
		'layouts[].placeholders[] and masters[].placeholders[] own native p:ph chart/tbl role, index, size, orientation, custom-prompt, and inherited geometry/style',
		'chart/table content[].placeholderBinding owns the populated slide p:graphicFrame placeholder identity',
		'chart relationships/parts and inline editable table payload remain owned by their native chart/table serializers',
	]),
	overrideFields: Object.freeze([
		'layouts[].placeholders[].type', 'layouts[].placeholders[].idx', 'masters[].placeholders[].type', 'masters[].placeholders[].idx',
		'slides[].content[].placeholderBinding.type', 'slides[].content[].placeholderBinding.idx',
	]),
	publicSchema: LAYOUT_PLACEHOLDER_BINDING_SCHEMA,
	resetBehavior: Object.freeze({
		component: 'set content[].placeholderBinding to null or false to remove only the populated graphic-frame binding',
		full: 'set the named layout/master placeholder collection to null to restore inherited/imported carriers, or [] to replace it with an empty authored collection',
		nullBehavior: 'omission preserves the binding, null/false clears it, and a later chart/table type-index binding re-adds it deterministically',
	}),
	precedence: Object.freeze([
		'explicit chart/table object geometry overrides its bound placeholder geometry; otherwise native layout/master geometry remains inherited',
		'a canonical type/index tuple wins over a name-only binding; aliases must agree and ambiguous or mismatched role bindings fail before mutation',
		'imported raw graphic-frame payload remains authoritative until the chart/table is explicitly authored or edited',
	]),
	legalCombinations: Object.freeze([
		'chart binds only to native chart and table binds only to native tbl',
		'idx zero and omitted native defaults remain canonical',
		'chart binding may coexist with chart relationships, embedded workbook, style, and color parts',
		'table binding may coexist with an inline editable a:tbl payload but not table auto-pagination',
	]),
})

export const SHOW_MASTER_SHAPES_CONTRACT = Object.freeze({
	id: 'nativeSlideMasterShapeVisibility',
	schemaVersion: 'betterpptx.slide-master-shape-visibility-contract.v1',
	unitId: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID,
	rowIds: Object.freeze([SHOW_MASTER_SHAPES_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	scope: 'slide-level master object visibility through the sole native p:sld@showMasterSp carrier',
	componentOwnership: Object.freeze(['slides[].showMasterShapes', 'slides[].showMasterBackground compatibility alias', 'p:sld@showMasterSp']),
	overrideFields: Object.freeze(['slides[].showMasterShapes', 'slides[].showMasterBackground']),
	publicSchema: Object.freeze({ type: ['boolean', 'null'] }),
	resetBehavior: Object.freeze({
		component: 'set slides[].showMasterShapes to null or true',
		full: 'remove the authored slide-level visibility override',
		nullBehavior: 'null/omission restores the native default true state by omitting p:sld@showMasterSp; false writes showMasterSp="0"',
	}),
	precedence: Object.freeze([
		'showMasterShapes is the canonical semantic field',
		'showMasterBackground is an agreeing compatibility alias over the same native carrier',
		'showMasterPhAnim is independent and never substitutes for master-shape visibility',
	]),
	legalCombinations: Object.freeze([
		'false, true, omitted, and null reset with any valid layout/master binding',
		'canonical and alias fields may be supplied together only when equal',
		'duplicate, reorder, delete, export, and recompile preserve the effective visibility policy',
	]),
})

export function layoutGraphicPlaceholderVisibilityCapabilityContractForEntry(entry = {}) {
	if (LAYOUT_GRAPHIC_PLACEHOLDER_ROW_IDS.includes(entry.id)) return GRAPHIC_FRAME_PLACEHOLDER_CONTRACT
	if (entry.id === SHOW_MASTER_SHAPES_ROW_ID) return SHOW_MASTER_SHAPES_CONTRACT
	return null
}

export const LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_PARTITION = Object.freeze({
	unitId: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID,
	rows: 3,
	graphicFramePlaceholderRows: 2,
	masterShapeVisibilityRows: 1,
	rowIds: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROW_IDS,
})
