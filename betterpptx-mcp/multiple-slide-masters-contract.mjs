import { LAYOUT_THEME_MASTER_INHERITANCE_PUBLIC_SCHEMA } from './layout-theme-master-inheritance-contract.mjs'

export const MULTIPLE_SLIDE_MASTERS_UNIT_ID = 'impl-b-e691a66447bfe6e0'
export const MULTIPLE_SLIDE_MASTERS_ROW_ID = 'cap_fa5b7e33364aea2a6543'

const publicSchema = JSON.parse(JSON.stringify(LAYOUT_THEME_MASTER_INHERITANCE_PUBLIC_SCHEMA))
publicSchema.properties.masters.maxItems = 32

export const MULTIPLE_SLIDE_MASTERS_PUBLIC_SCHEMA = Object.freeze(publicSchema)

export const MULTIPLE_SLIDE_MASTERS_CONTRACT = Object.freeze({
	id: MULTIPLE_SLIDE_MASTERS_UNIT_ID,
	rowIds: Object.freeze([MULTIPLE_SLIDE_MASTERS_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	scope: 'zero to thirty-two ordered newly authored physical slide masters, each with one or more explicitly bound layouts and slides; all newly authored masters share the deck theme while imported per-master theme carriers remain preservation-safe',
	componentOwnership: Object.freeze([
		'masters[] owns the ordered physical slide-master collection and each master-owned background, placeholder, fixed-object, color-map, header/footer, slide-number, and text-style component',
		'layouts[].masterName owns every authored layout-to-physical-master binding',
		'slides[].layoutName selects the layout while slides[].masterName validates and reads back its physical-master lineage',
		'the relationship graph owns deterministic presentation-to-master, master-to-layout, layout-to-master, and master-to-theme closure without relationship-ID coupling',
	]),
	overrideFields: Object.freeze([
		'masters[]', 'masters[].title', 'masters[].background', 'masters[].margin', 'masters[].objects', 'masters[].placeholders',
		'masters[].slideNumber', 'masters[].headerFooter', 'masters[].colorMap', 'masters[].textStyles',
		'layouts[]', 'layouts[].masterName', 'slides[].layoutName', 'slides[].masterName',
	]),
	resetBehavior: Object.freeze({
		component: 'replace or delete one named master and rebind or replace its dependent layouts in the same spec patch',
		full: 'set masters and layouts to null to restore imported/default structure, or set both to [] to clear authored carriers while retaining the native default scaffold',
		nullBehavior: 'omission preserves the ordered collection; null restores the baseline; [] clears authored carriers; a non-empty array replaces and reorders the authored collection',
	}),
	precedence: Object.freeze([
		'layout masterName is the authoritative physical parent; a slide masterName must agree with its selected layout',
		'when more than one authored physical master exists, every authored layout requires an explicit masterName',
		'collection order determines deterministic slideMaster part numbering while semantic names remain the stable readback identity',
		'explicit authored master components override native defaults; omission preserves and null resets only the selected component',
	]),
	legalCombinations: Object.freeze([
		'two or more masters may coexist and each may own multiple layouts and slides',
		'master titles and layout names are unique; every authored layout parent must exist',
		'one deck theme is shared by all newly authored physical masters',
		're-edit, reset, delete, replace, and reorder preserve a closed non-orphaned relationship graph',
	]),
	publicSchema: MULTIPLE_SLIDE_MASTERS_PUBLIC_SCHEMA,
})

export function multipleSlideMastersCapabilityContractForEntry(entry = {}) {
	return entry.id === MULTIPLE_SLIDE_MASTERS_ROW_ID ? MULTIPLE_SLIDE_MASTERS_CONTRACT : null
}
