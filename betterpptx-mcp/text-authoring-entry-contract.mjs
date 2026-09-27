// Exact public entry-point contract for the two generic Slide Authoring rows.
// The deeper text leaf contracts live in foundation-capability-contract.mjs;
// this module proves that plain strings and rich-run arrays can reach those
// carriers through the public spec workflow without a hidden primitive path.

export const TEXT_AUTHORING_ENTRY_UNIT_ID = 'impl-b-26c13da769183d70'

export const TEXT_AUTHORING_ENTRY_ROWS = Object.freeze([
	Object.freeze({
		id: 'cap_abea4eaf2ef3fb790ebc',
		label: 'add text',
		semanticKind: 'textBox',
		executableValue: 'string',
		semanticPath: 'slides[].content[].text',
	}),
	Object.freeze({
		id: 'cap_cddc41dd90dd55952f32',
		label: 'add rich text runs',
		semanticKind: 'textBox',
		executableValue: 'richTextRun[]',
		semanticPath: 'slides[].content[].text',
	}),
])

const RESET = Object.freeze({
	component: 'set a local body-style field to null or replace the rich-run array with the desired reset run state',
	full: 'set patch.text to null and clear local text/body style fields',
	nullBehavior: 'remove the local text body and restore inherited/default text styles while omission preserves authored state',
})

const COMMON_FIELDS = Object.freeze([
	'slides[].content[].kind',
	'slides[].content[].text',
	'slides[].content[].rect',
	'slides[].content[].style',
	'slides[].content[].placeholderBinding',
])

const contractByRowId = new Map([
	[TEXT_AUTHORING_ENTRY_ROWS[0].id, Object.freeze({
		id: 'textAuthoringPlainEntry',
		capabilityMode: 'parameterized',
		capabilityStatus: 'executable-exact-structured',
		runtimeReady: true,
		componentOwnership: Object.freeze(['slide.nativeTextBox', 'textBody.plainText', 'textBody.properties']),
		overrideFields: COMMON_FIELDS,
		resetBehavior: RESET,
		precedence: Object.freeze(['authored plain string', 'local text/body style', 'placeholder or theme inheritance', 'native defaults']),
		legalCombinations: Object.freeze(['plain Unicode text with local style, geometry, placeholder binding, accessibility metadata, and sparse lifecycle edits']),
		publicSchema: Object.freeze({ type: 'string', maxLength: 1048576 }),
	})],
	[TEXT_AUTHORING_ENTRY_ROWS[1].id, Object.freeze({
		id: 'textAuthoringRichRunEntry',
		capabilityMode: 'parameterized',
		capabilityStatus: 'executable-exact-structured',
		runtimeReady: true,
		componentOwnership: Object.freeze(['slide.nativeTextBox', 'textBody.paragraphs', 'textRun.style', 'textRun.relationships']),
		overrideFields: Object.freeze([...COMMON_FIELDS, 'slides[].content[].text[].text', 'slides[].content[].text[].options']),
		resetBehavior: RESET,
		precedence: Object.freeze(['authored run option including explicit false or zero', 'local text-box style', 'paragraph or theme inheritance', 'native defaults']),
		legalCombinations: Object.freeze(['ordered runs, hard paragraphs, soft breaks, fields, external or internal hyperlinks, Unicode whitespace, and independent run styles']),
		publicSchema: Object.freeze({ type: 'array', minItems: 1, maxItems: 10000, items: Object.freeze({ $ref: '#/$defs/richTextRun' }) }),
	})],
])

export const TEXT_AUTHORING_ENTRY_CONTRACT = Object.freeze({
	id: 'textAuthoringEntryPoints',
	schemaVersion: 'betterpptx.text-authoring-entry.v1',
	unitId: TEXT_AUTHORING_ENTRY_UNIT_ID,
	rowIds: Object.freeze(TEXT_AUTHORING_ENTRY_ROWS.map(row => row.id)),
	runtimeReady: true,
})

export function textAuthoringEntryCapabilityContractForEntry(entry = {}) {
	return contractByRowId.get(entry.id) || null
}
