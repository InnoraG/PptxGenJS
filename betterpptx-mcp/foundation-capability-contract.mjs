// Frozen foundation-ledger truth. The historical family fallback collapsed
// persisted authoring, product operations, validation, discovery, and unsafe
// imported actions into one ambiguous textBox bucket. This module keeps those
// categories disjoint and promotes only executable child contracts.

import { createHash } from 'node:crypto'

import { buildCapabilityLedger } from '../dist/node/pptx-mcp/capability-ledger.js'
import { INTERACTIVE_ACTIONS_CONTRACT, INTERACTIVE_ACTION_ROW_IDS } from './interactive-actions-contract.mjs'

export const FOUNDATION_LEDGER_CATEGORIES = Object.freeze([
	'Accessibility',
	'Deck and System',
	'Interactive Presentation Features',
	'MCP Product Surface',
	'Sample Object Library',
	'Text Typography Localization',
	'Validation Oracle Features',
])

const categorySet = new Set(FOUNDATION_LEDGER_CATEGORIES)
// This contract owns only impl-b-b49e4f674c8b5686. Rows already promoted by
// narrower family contracts must not be recaptured by this aggregate split.
const excludedPublicNamesByCategory = new Map(Object.entries({
	'Deck and System': ['custom slide sizes', 'hidden slides', 'layouts', 'multiple slide masters', 'slide masters', 'slide numbers', 'speaker notes', 'themes'],
	'Interactive Presentation Features': ['jump to slide', 'media bookmarks', 'media triggers', 'slide zoom'],
	'MCP Product Surface': [
		'betterpptx-mcp.chart.add',
		'betterpptx-mcp.object.apply_animation',
		'betterpptx-mcp.object.apply_motion_path',
		'betterpptx-mcp.object.apply_wordart',
		'betterpptx-mcp.object.insert_3d_asset',
		'betterpptx-mcp.object.insert_media',
		'betterpptx-mcp.object.insert_smartart',
		'betterpptx-mcp.slide.add_with_transition',
		'betterpptx-mcp.table.add',
		'betterpptx-mcp.table.recommend',
	],
	'Sample Object Library': ['bundled sample audio', 'bundled sample image'],
	'Text Typography Localization': ['text 3D', 'text reflection', 'text shadow'],
	'Validation Oracle Features': ['failure report by slide/object/coverage row'],
}).map(([category, publicNames]) => [category, new Set(publicNames)]))
const opaqueRowId = featureId => `cap_${createHash('sha256').update(`ledger:${featureId}`).digest('hex').slice(0, 20)}`
const ledgerRows = buildCapabilityLedger(undefined, 'betterpptx-mcp').rows
	.filter(row => categorySet.has(row.category))
	.filter(row => !excludedPublicNamesByCategory.get(row.category)?.has(row.publicName))
	.map(row => Object.freeze({ ...row, rowId: opaqueRowId(row.featureId) }))

function rowsFor(category, labels = null) {
	const labelSet = labels ? new Set(labels) : null
	const rows = ledgerRows.filter(row => row.category === category && (!labelSet || labelSet.has(row.publicName)))
	if (labelSet && rows.length !== labelSet.size) {
		const found = new Set(rows.map(row => row.publicName))
		const missing = [...labelSet].filter(label => !found.has(label))
		throw new Error(`FOUNDATION_LEDGER_ROWS_MISSING: ${category}: ${missing.join(', ')}`)
	}
	return rows
}

const EXACT = 'executable-exact-structured'
const PARTIAL = 'structured-partial'
const PRESERVE = 'preserve-imported-only'
const NOT_LIVE = 'not-live-in-saved-package'
const NOT_APPLICABLE = 'not-applicable'

const NO_RESET = Object.freeze({ component: 'not-public', full: 'not-public', nullBehavior: 'not-defined' })
const NOT_APPLICABLE_RESET = Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' })

function closedSchema(properties) {
	return Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(properties) })
}

function contract({ id, rows, status = EXACT, ownership, fields = [], resetBehavior = NO_RESET, schema = null, precedence = [], legalCombinations = [] }) {
	const mode = status === PRESERVE ? 'preserve-only' : status === NOT_APPLICABLE ? 'missing' : status === NOT_LIVE ? 'discrete' : 'parameterized'
	return Object.freeze({
		id,
		schemaVersion: 'betterpptx.foundation-capability.v1',
		capabilityMode: mode,
		capabilityStatus: status,
		runtimeReady: status === EXACT,
		componentOwnership: Object.freeze([...ownership]),
		overrideFields: Object.freeze([...fields]),
		resetBehavior,
		precedence: Object.freeze([...precedence]),
		legalCombinations: Object.freeze([...legalCombinations]),
		rowIds: Object.freeze(rows.map(row => row.rowId)),
		publicSchema: schema,
	})
}

const componentReset = (component, full = component) => Object.freeze({
	component: `set ${component} to null to remove the authored override`,
	full: `set ${full} to null to restore the native/default state`,
	nullBehavior: 'explicit null resets the selected component; omission preserves current authored state',
})

const textFitRows = rowsFor('Text Typography Localization', ['auto-fit', 'shrink text', 'wrapping'])
const textMarginRows = rowsFor('Text Typography Localization', ['margins', 'vertical align top', 'vertical align middle', 'vertical align bottom'])
const textAlignmentRows = rowsFor('Text Typography Localization', ['horizontal align left', 'horizontal align center', 'horizontal align right', 'horizontal align justify', 'RTL text'])
const textIndentRows = rowsFor('Text Typography Localization', ['indentation', 'bullet levels'])
const textRichRunRows = rowsFor('Text Typography Localization', ['strike', 'superscript', 'subscript'])
const textCharacterSpacingRows = rowsFor('Text Typography Localization', ['character spacing'])
const textLineSpacingRows = rowsFor('Text Typography Localization', ['line spacing'])
const textParagraphSpacingRows = rowsFor('Text Typography Localization', ['paragraph spacing before', 'paragraph spacing after'])
const textUnderlineRows = rowsFor('Text Typography Localization', ['underline'])
const textRotationRows = rowsFor('Text Typography Localization', ['rotation'])
const textFillRows = rowsFor('Text Typography Localization', ['text fill'])
const textOutlineRows = rowsFor('Text Typography Localization', ['text outline'])
const textGlowRows = rowsFor('Text Typography Localization', ['text glow'])
const textBasicRunRows = rowsFor('Text Typography Localization', ['bold', 'italic', 'font color', 'font face', 'font size'])
const textNumericBaselineRows = rowsFor('Text Typography Localization', ['baseline'])
const textBulletGlyphRows = rowsFor('Text Typography Localization', ['bullet DEFAULT', 'bullet CHECK', 'bullet STAR', 'bullet TRIANGLE'])
const textBodyDirectionRows = rowsFor('Text Typography Localization', ['East Asian vertical eaVert', 'Mongolian vertical mongolianVert'])
const textBidiComplexScriptRows = rowsFor('Text Typography Localization', ['bidirectional text', 'complex-script flags'])
const textHardStructureRows = rowsFor('Text Typography Localization', ['line breaks', 'non-breaking spaces'])
const textSoftBreakRows = rowsFor('Text Typography Localization', ['soft breaks'])
const textFieldRows = rowsFor('Text Typography Localization', ['fields'])
const textHyperlinkRows = rowsFor('Text Typography Localization', ['hyperlinks'])
const textBoxRows = rowsFor('Text Typography Localization', ['text boxes'])
const accessibilityMetadataRows = rowsFor('Accessibility', [
	'alt text',
	'description metadata',
	'title metadata',
	'decorative flags',
	'isDecorative',
	'screen-reader-safe decorative graphics',
	'screen-reader-safe hidden graphics',
])
const accessibilityOrderRows = rowsFor('Accessibility', ['reading order', 'object sequence', 'cNvPr order'])

const exactTextRows = new Set([
	...textFitRows, ...textMarginRows, ...textAlignmentRows, ...textIndentRows, ...textRichRunRows,
	...textCharacterSpacingRows, ...textLineSpacingRows, ...textParagraphSpacingRows, ...textUnderlineRows,
	...textRotationRows, ...textFillRows, ...textOutlineRows, ...textGlowRows,
	...textBasicRunRows, ...textNumericBaselineRows, ...textBulletGlyphRows, ...textBodyDirectionRows,
	...textBidiComplexScriptRows, ...textHardStructureRows, ...textSoftBreakRows, ...textFieldRows,
	...textHyperlinkRows, ...textBoxRows,
].map(row => row.rowId))

const contracts = [
	contract({
		id: 'foundationObjectAccessibilityMetadata', rows: accessibilityMetadataRows, ownership: ['object.accessibilityMetadata'], fields: ['content[].title', 'content[].altText', 'content[].decorative', 'content[].hiddenFromAccessibility'],
		resetBehavior: componentReset('the selected accessibility metadata field', 'object accessibility metadata'),
		schema: closedSchema({ title: { type: ['string', 'null'], minLength: 1, maxLength: 4096 }, altText: { type: ['string', 'null'], minLength: 1, maxLength: 4096 }, decorative: { type: ['boolean', 'null'] }, hiddenFromAccessibility: { type: ['boolean', 'null'] } }),
		precedence: ['decorative and hiddenFromAccessibility must agree when both are authored', 'decorative true excludes the object and forbids meaningful title/description', 'accessibilityTitle, descr, and explicit adec false remain independent authored carriers'],
		legalCombinations: ['meaningful title and description on a readable object', 'decorative true with no meaningful metadata', 'explicit false or null reset followed by metadata re-edit'],
	}),
	contract({
		id: 'foundationSlideReadingOrder', rows: accessibilityOrderRows, ownership: ['slide.readingOrder'], fields: ['slides[].content[]', 'content[].reorderToIndex'],
		resetBehavior: Object.freeze({ component: 'use reorderToIndex to move one stable object without recreating it', full: 'supply the complete stable-name content permutation for an authoritative full replacement', nullBehavior: 'not-defined; omission preserves current physical order' }),
		schema: closedSchema({ reorderToIndex: { type: 'integer', minimum: 0 } }),
		precedence: ['complete content-array order on create/full replace', 'typed sparse reorderToIndex', 'existing physical p:spTree order'],
		legalCombinations: ['stable top-level object permutation with unchanged cNvPr IDs and relationships', 'group wrapper as one top-level reading-order item with nested child order preserved'],
	}),
	contract({
		id: 'foundationTextFitWrap', rows: textFitRows, ownership: ['textBody.fitWrap'], fields: ['slides[].content[].fit', 'slides[].content[].wrap'],
		resetBehavior: componentReset('fit or wrap', 'fit and wrap'),
		schema: closedSchema({ fit: { type: ['string', 'null'], enum: ['none', 'resize', 'shrink', null] }, wrap: { type: ['boolean', 'null'] } }),
		precedence: ['authored fit/wrap', 'WordArt visibility safety', 'native/default text-body behavior'], legalCombinations: ['fit none, resize, or shrink with wrapping on or off', 'null reset followed by sparse re-edit'],
	}),
	contract({
		id: 'foundationTextMarginsVerticalAlign', rows: textMarginRows, ownership: ['textBody.insets', 'textBody.verticalAlignment'], fields: ['slides[].content[].margin', 'slides[].content[].valign'],
		resetBehavior: componentReset('margin or valign', 'margin and valign'),
		schema: closedSchema({ margin: { oneOf: [{ type: 'number', minimum: 0, maximum: 100 }, { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0, maximum: 100 } }, { type: 'null' }] }, valign: { type: ['string', 'null'], enum: ['top', 'middle', 'bottom', null] } }),
		precedence: ['authored insets/alignment', 'layout bounds', 'native/default insets'], legalCombinations: ['scalar or four-side margins with top, middle, or bottom alignment'],
	}),
	contract({
		id: 'foundationParagraphAlignmentDirection', rows: textAlignmentRows, ownership: ['textParagraph.alignment', 'textParagraph.direction'], fields: ['slides[].content[].align', 'slides[].content[].rtlMode'],
		resetBehavior: componentReset('align or rtlMode', 'paragraph alignment and direction'),
		schema: closedSchema({ align: { type: ['string', 'null'], enum: ['left', 'center', 'right', 'justify', null] }, rtlMode: { type: ['boolean', 'null'] } }),
		precedence: ['authored paragraph alignment/direction', 'language/theme inheritance'], legalCombinations: ['left, center, right, or justify in LTR or RTL mode'],
	}),
	contract({
		id: 'foundationParagraphIndentBulletLevel', rows: textIndentRows, ownership: ['textParagraph.indentation', 'textParagraph.bulletLevel'], fields: ['slides[].content[].indent', 'slides[].content[].hanging', 'slides[].content[].indentLevel', 'slides[].content[].bullet'],
		resetBehavior: componentReset('indent, hanging, indentLevel, or bullet', 'paragraph indentation and bullet state'),
		schema: closedSchema({ indent: { type: ['number', 'null'] }, hanging: { type: ['number', 'null'] }, indentLevel: { type: ['integer', 'null'], minimum: 0, maximum: 8 }, bullet: { type: ['object', 'boolean', 'null'] } }),
		precedence: ['authored bullet/level', 'authored indent/hanging', 'native paragraph defaults'], legalCombinations: ['bullet level with independent indent and hanging values'],
	}),
	contract({
		id: 'foundationRichRunBaseline', rows: textRichRunRows, ownership: ['textRun.strike', 'textRun.baseline'], fields: ['slides[].content[].style.strike', 'slides[].content[].style.superscript', 'slides[].content[].style.subscript', 'slides[].content[].text[].options'],
		resetBehavior: componentReset('strike, superscript, or subscript', 'rich-run emphasis'),
		schema: closedSchema({ strike: { type: ['string', 'boolean', 'null'] }, superscript: { type: ['boolean', 'null'] }, subscript: { type: ['boolean', 'null'] } }),
		precedence: ['authored run option', 'mutually exclusive superscript/subscript', 'native baseline'], legalCombinations: ['strike with either superscript or subscript', 'superscript and subscript never simultaneously'],
	}),
	contract({ id: 'foundationTextCharacterSpacing', rows: textCharacterSpacingRows, ownership: ['textRun.characterSpacing'], fields: ['slides[].content[].charSpacing'], resetBehavior: componentReset('charSpacing'), schema: closedSchema({ charSpacing: { type: ['number', 'null'] } }), precedence: ['authored character spacing', 'native/default spacing'], legalCombinations: ['continuous character spacing with other run formatting'] }),
	contract({ id: 'foundationTextLineSpacing', rows: textLineSpacingRows, ownership: ['textParagraph.lineSpacing'], fields: ['slides[].content[].lineSpacing', 'slides[].content[].lineSpacingMultiple'], resetBehavior: componentReset('lineSpacing or lineSpacingMultiple', 'paragraph line spacing'), schema: closedSchema({ lineSpacing: { type: ['number', 'null'] }, lineSpacingMultiple: { type: ['number', 'null'] } }), precedence: ['authored exact line spacing', 'authored multiple', 'native/default spacing'], legalCombinations: ['exact or multiple line spacing with paragraph spacing'] }),
	contract({ id: 'foundationParagraphSpacing', rows: textParagraphSpacingRows, ownership: ['textParagraph.spaceBefore', 'textParagraph.spaceAfter'], fields: ['slides[].content[].paraSpaceBefore', 'slides[].content[].paraSpaceAfter'], resetBehavior: componentReset('paraSpaceBefore or paraSpaceAfter', 'paragraph spacing'), schema: closedSchema({ paraSpaceBefore: { type: ['number', 'null'] }, paraSpaceAfter: { type: ['number', 'null'] } }), precedence: ['authored before/after spacing', 'native/default paragraph spacing'], legalCombinations: ['independent before and after spacing'] }),
	contract({ id: 'foundationTextUnderline', rows: textUnderlineRows, ownership: ['textRun.underline'], fields: ['slides[].content[].underline'], resetBehavior: componentReset('underline'), schema: closedSchema({ underline: { type: ['boolean', 'string', 'object', 'null'] } }), precedence: ['authored underline style/color', 'native/default none'], legalCombinations: ['underline style and color with other run formatting'] }),
	contract({ id: 'foundationObjectRotation', rows: textRotationRows, ownership: ['object.transform.rotation'], fields: ['slides[].content[].rotate'], resetBehavior: componentReset('rotate'), schema: closedSchema({ rotate: { type: ['number', 'null'], minimum: -360, maximum: 360 } }), precedence: ['authored rotation', 'native/default zero'], legalCombinations: ['rotation with text layout and effects'] }),
	contract({ id: 'foundationTextFill', rows: textFillRows, ownership: ['textRun.fill'], fields: ['slides[].content[].textFill'], resetBehavior: componentReset('textFill'), schema: closedSchema({ textFill: { type: ['object', 'null'] } }), precedence: ['authored text fill', 'theme/run color'], legalCombinations: ['solid or gradient text fill with outline/effects'] }),
	contract({ id: 'foundationTextOutline', rows: textOutlineRows, ownership: ['textRun.outline'], fields: ['slides[].content[].textOutline'], resetBehavior: componentReset('textOutline'), schema: closedSchema({ textOutline: { type: ['object', 'null'] } }), precedence: ['authored text outline', 'native/default no outline'], legalCombinations: ['outline color, width, and transparency with text fill/effects'] }),
	contract({ id: 'foundationTextGlow', rows: textGlowRows, ownership: ['textRun.effect.glow'], fields: ['slides[].content[].textGlow'], resetBehavior: componentReset('textGlow'), schema: closedSchema({ textGlow: { type: ['object', 'null'] } }), precedence: ['authored text glow', 'native/default no glow'], legalCombinations: ['glow with fill, outline, shadow, and reflection'] }),
	contract({ id: 'foundationTextBasicRunStyle', rows: textBasicRunRows, ownership: ['textRun.basicStyle'], fields: ['slides[].content[].text[].options.bold', 'slides[].content[].text[].options.italic', 'slides[].content[].text[].options.color', 'slides[].content[].text[].options.fontFace', 'slides[].content[].text[].options.fontSize'], resetBehavior: componentReset('the selected run-style leaf', 'basic run style'), schema: closedSchema({ bold: { type: ['boolean', 'null'] }, italic: { type: ['boolean', 'null'] }, color: { type: ['string', 'null'], pattern: '^[0-9A-Fa-f]{6}$' }, fontFace: { type: ['string', 'null'], minLength: 1 }, fontSize: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400 } }), precedence: ['authored run value including explicit false', 'paragraph/theme inheritance', 'native default'], legalCombinations: ['face, size, color, bold, and italic on one run', 'component reset and reverse-order re-edit'] }),
	contract({ id: 'foundationTextNumericBaseline', rows: textNumericBaselineRows, ownership: ['textRun.numericBaseline'], fields: ['slides[].content[].text[].options.baseline'], resetBehavior: componentReset('baseline'), schema: closedSchema({ baseline: { type: ['number', 'null'], minimum: -100, maximum: 100 } }), precedence: ['numeric baseline', 'mutually exclusive superscript or subscript', 'native baseline zero'], legalCombinations: ['negative, explicit zero, or positive baseline with ordinary run style'] }),
	contract({ id: 'foundationTextBulletGlyphs', rows: textBulletGlyphRows, ownership: ['textParagraph.bulletGlyph'], fields: ['slides[].content[].text[].options.bullet.glyph', 'slides[].content[].text[].options.bullet.characterCode'], resetBehavior: componentReset('bullet glyph', 'paragraph bullet'), schema: closedSchema({ glyph: { type: ['string', 'null'], enum: ['DEFAULT', 'CHECK', 'STAR', 'TRIANGLE', null] }, characterCode: { type: ['string', 'null'], pattern: '^[0-9A-Fa-f]{4,6}$' } }), precedence: ['named glyph', 'explicit characterCode', 'native/default bullet'], legalCombinations: ['DEFAULT, CHECK, STAR, or TRIANGLE with RTL and indentation'] }),
	contract({ id: 'foundationTextBodyDirection', rows: textBodyDirectionRows, ownership: ['textBody.verticalDirection'], fields: ['slides[].content[].vert'], resetBehavior: componentReset('vert'), schema: closedSchema({ vert: { type: ['string', 'null'], enum: ['eaVert', 'mongolianVert', null] } }), precedence: ['authored body direction', 'layout/theme inheritance', 'horizontal default'], legalCombinations: ['East Asian or Mongolian vertical body direction with localized runs'] }),
	contract({ id: 'foundationTextBidiComplexScript', rows: textBidiComplexScriptRows, ownership: ['textRun.direction', 'textRun.complexScriptTypeface'], fields: ['slides[].content[].text[].options.rtl', 'slides[].content[].text[].options.fontFaceComplexScript'], resetBehavior: componentReset('rtl or fontFaceComplexScript', 'run bidi/complex-script state'), schema: closedSchema({ rtl: { type: ['boolean', 'null'] }, fontFaceComplexScript: { type: ['string', 'null'], minLength: 1 } }), precedence: ['authored run bidi/typeface', 'paragraph rtlMode', 'theme language/typeface inheritance'], legalCombinations: ['mixed LTR and RTL runs with an independent complex-script typeface'] }),
	contract({ id: 'foundationTextHardStructure', rows: textHardStructureRows, ownership: ['textBody.paragraphs', 'textRun.unicodeText'], fields: ['slides[].content[].text'], resetBehavior: componentReset('text content', 'text-body content'), schema: closedSchema({ text: { type: ['string', 'array', 'null'] } }), precedence: ['authored paragraph/newline structure and exact Unicode', 'native text content'], legalCombinations: ['hard paragraph breaks and U+00A0 adjacent to ordinary runs'] }),
	contract({ id: 'foundationTextSoftBreak', rows: textSoftBreakRows, ownership: ['textParagraph.softBreak'], fields: ['slides[].content[].text[].options.softBreakBefore'], resetBehavior: componentReset('softBreakBefore'), schema: closedSchema({ softBreakBefore: { type: ['boolean', 'null'] } }), precedence: ['authored a:br token', 'hard paragraph break', 'ordinary run adjacency'], legalCombinations: ['soft break between formatted runs without creating a new paragraph'] }),
	contract({ id: 'foundationTextFields', rows: textFieldRows, ownership: ['textRun.field'], fields: ['slides[].content[].text[].options.field'], resetBehavior: componentReset('field', 'field run semantics'), schema: closedSchema({ field: { oneOf: [{ type: 'object', additionalProperties: false, required: ['type'], properties: { id: { type: 'string' }, type: { type: 'string', minLength: 1 } } }, { type: 'null' }] } }), precedence: ['typed field run', 'ordinary display text'], legalCombinations: ['field among ordinary, formatted, linked, and break runs'] }),
	contract({ id: 'foundationTextRunHyperlinks', rows: textHyperlinkRows, ownership: ['textRun.hyperlink', 'slide.relationshipGraph'], fields: ['slides[].content[].text[].options.hyperlink'], resetBehavior: componentReset('hyperlink'), schema: closedSchema({ hyperlink: { oneOf: [{ type: 'object', additionalProperties: false, properties: { url: { type: 'string' }, slide: { type: 'integer', minimum: 1 }, tooltip: { type: 'string' } }, oneOf: [{ required: ['url'] }, { required: ['slide'] }] }, { type: 'null' }] } }), precedence: ['exactly one authored URL or internal-slide target', 'native relationship and action carrier'], legalCombinations: ['external or internal run hyperlink with ordinary formatting, fields, and breaks'] }),
	contract({ id: 'foundationTextBoxCarrier', rows: textBoxRows, ownership: ['slide.nativeTextBox'], fields: ['slides[].content[].kind', 'slides[].content[].text', 'slides[].content[].x', 'slides[].content[].y', 'slides[].content[].w', 'slides[].content[].h'], resetBehavior: componentReset('text or formatting', 'standalone text box'), schema: closedSchema({ kind: { const: 'textBox' }, text: { type: ['string', 'array'] }, x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }), precedence: ['standalone native p:sp/p:txBody carrier', 'semantic text content and style'], legalCombinations: ['text box creation, sparse edit, readback, reset, and deletion'] }),
]

const documentMetadataRows = rowsFor('Deck and System', ['author metadata', 'company metadata', 'revision metadata', 'subject metadata', 'title metadata', 'RTL mode'])
const backgroundRows = rowsFor('Deck and System', ['backgrounds'])
const sectionRows = rowsFor('Deck and System', ['sections'])
contracts.push(
	contract({
		id: 'foundationDocumentMetadata', rows: documentMetadataRows, ownership: ['document.coreProperties', 'document.extendedProperties', 'presentation.rtlMode'], fields: ['title', 'subject', 'author', 'company', 'revision', 'rtlMode'],
		resetBehavior: componentReset('the named document metadata field', 'document metadata and rtlMode'),
		schema: closedSchema({ title: { type: ['string', 'null'] }, subject: { type: ['string', 'null'] }, author: { type: ['string', 'null'] }, company: { type: ['string', 'null'] }, revision: { oneOf: [{ type: 'string', pattern: '^(?:0|[1-9]\\d*)$' }, { type: 'integer', minimum: 0 }, { type: 'null' }] }, rtlMode: { type: ['boolean', 'null'] } }),
		precedence: ['authored portable metadata', 'safe product default', 'package serializer'], legalCombinations: ['all document metadata fields with RTL mode, theme, sections, and slide content'],
	}),
	contract({ id: 'foundationBackground', rows: backgroundRows, ownership: ['slide.background', 'layout.background', 'master.background'], fields: ['slides[].background', 'layouts[].background', 'masters[].background'], resetBehavior: componentReset('background', 'authored background'), schema: closedSchema({ background: { type: ['object', 'null'] } }), precedence: ['authored slide background', 'layout/master inheritance', 'theme canvas'], legalCombinations: ['solid, gradient, pattern, texture, or inherited background'] }),
	contract({ id: 'foundationSections', rows: sectionRows, ownership: ['presentation.sections', 'section.slideMembership'], fields: ['sections[].id', 'sections[].title', 'sections[].slideIds'], resetBehavior: componentReset('the named section or membership', 'sections'), schema: closedSchema({ sections: { type: ['array', 'null'], items: { type: 'object' } } }), precedence: ['authored section order/membership', 'slide order', 'native section serialization'], legalCombinations: ['sections with ordinary slides, section zoom, and summary zoom'] }),
)

const zoomRows = rowsFor('Interactive Presentation Features', ['section zoom', 'summary zoom'])
contracts.push(contract({
	id: 'foundationSectionSummaryZoom', rows: zoomRows, status: PARTIAL, ownership: ['presentation.sections', 'slide.zoomNavigation'], fields: ['slides[].sectionZoom', 'slides[].sectionZooms', 'summaryZoom'],
	resetBehavior: componentReset('the selected zoom object', 'section/summary zoom navigation'), schema: closedSchema({ sectionZoom: { type: ['object', 'array', 'null'] }, summaryZoom: { type: ['object', 'null'] } }),
	precedence: ['authored sections', 'authored zoom target/order', 'native zoom relationship graph'], legalCombinations: ['section zoom and summary zoom over the same authored section list'],
}))

const interactiveActionRows = INTERACTIVE_ACTION_ROW_IDS.map(rowId => ledgerRows.find(row => row.rowId === rowId))
if (interactiveActionRows.some(row => !row)) throw new Error('FOUNDATION_INTERACTIVE_ACTION_ROWS_MISSING')
contracts.push(contract({
	id: 'foundationInteractiveActions',
	rows: interactiveActionRows,
	status: INTERACTIVE_ACTIONS_CONTRACT.capabilityStatus,
	ownership: INTERACTIVE_ACTIONS_CONTRACT.componentOwnership,
	fields: INTERACTIVE_ACTIONS_CONTRACT.overrideFields,
	resetBehavior: INTERACTIVE_ACTIONS_CONTRACT.resetBehavior,
	schema: INTERACTIVE_ACTIONS_CONTRACT.publicSchema,
	precedence: INTERACTIVE_ACTIONS_CONTRACT.precedence,
	legalCombinations: INTERACTIVE_ACTIONS_CONTRACT.legalCombinations,
}))

const unsafePreserveRows = rowsFor('Interactive Presentation Features', ['macro actions preserved but not executed', 'run program actions preserved but not executed'])
const embeddedFontPreserveRows = rowsFor('Text Typography Localization', ['embedded fonts', 'font preservation'])
contracts.push(
	contract({ id: 'foundationUnsafeActionPreservation', rows: unsafePreserveRows, status: PRESERVE, ownership: ['imported.actionPayload'], resetBehavior: NO_RESET, precedence: ['preserve imported payload', 'never execute or newly author'], legalCombinations: ['retained imported action with ordinary editable content'] }),
	contract({ id: 'foundationEmbeddedFontPreservation', rows: embeddedFontPreserveRows, status: PRESERVE, ownership: ['imported.embeddedFontPayload'], resetBehavior: NO_RESET, precedence: ['preserve imported font payload and relationship graph', 'never synthesize or expose private font bytes'], legalCombinations: ['retained imported embedded fonts with editable text and native theme fonts'] }),
)

const outputOperationRows = rowsFor('Deck and System', ['artifact manifests', 'generated source export', 'package validation', 'stream output', 'write output', 'writeFile output'])
contracts.push(
	contract({ id: 'foundationProductOperations', rows: rowsFor('MCP Product Surface'), status: NOT_LIVE, ownership: ['public.productOperation'], resetBehavior: NOT_APPLICABLE_RESET, precedence: ['public operation contract', 'opaque product result'], legalCombinations: ['operation discovery followed by the owning authoring or validation tool'] }),
	contract({ id: 'foundationSampleAssetDiscovery', rows: rowsFor('Sample Object Library'), status: NOT_LIVE, ownership: ['public.sampleAssetDiscovery'], resetBehavior: NOT_APPLICABLE_RESET, precedence: ['asset discovery', 'owning image/media/model authoring contract'], legalCombinations: ['sample discovery followed by semantic asset authoring'] }),
	contract({ id: 'foundationOutputOperations', rows: outputOperationRows, status: NOT_LIVE, ownership: ['public.artifactOperation'], resetBehavior: NOT_APPLICABLE_RESET, precedence: ['deck authoring', 'validation', 'opaque artifact output'], legalCombinations: ['save/export/retrieval after successful authoring and validation'] }),
	contract({ id: 'foundationValidationOracles', rows: rowsFor('Validation Oracle Features'), status: NOT_APPLICABLE, ownership: ['validation.oracle'], resetBehavior: NOT_APPLICABLE_RESET, precedence: ['saved artifact', 'package/visual/runtime validation'], legalCombinations: ['package, relationship, metadata, comparator, repair, screenshot, and coverage evidence'] }),
)

const assignedRows = new Set(contracts.flatMap(item => item.rowIds))
const accessibilityResidualRows = rowsFor('Accessibility').filter(row => !assignedRows.has(row.rowId))
const interactiveResidualRows = rowsFor('Interactive Presentation Features').filter(row => !assignedRows.has(row.rowId))
const textResidualRows = rowsFor('Text Typography Localization').filter(row => !assignedRows.has(row.rowId))
const deckResidualRows = rowsFor('Deck and System').filter(row => !assignedRows.has(row.rowId))

contracts.push(
	contract({ id: 'foundationAccessibilityResidual', rows: accessibilityResidualRows, status: PARTIAL, ownership: ['object.accessibilityMetadata', 'slide.readingOrder'], fields: ['content[].altText', 'content[].title', 'content[].decorative', 'content[].hiddenFromAccessibility', 'slides[].content[]'], resetBehavior: componentReset('the named accessibility field', 'authored accessibility metadata'), precedence: ['authored accessibility semantics', 'deterministic object order', 'native cNvPr carrier'], legalCombinations: ['titles/descriptions/decorative flags across every editable object kind'] }),
	contract({ id: 'foundationInteractiveActionResidual', rows: interactiveResidualRows, status: PARTIAL, ownership: ['object.interactiveAction', 'presentation.customShows'], fields: ['content[].hyperlink', 'content[].action', 'customShows[]'], resetBehavior: componentReset('action or custom-show binding', 'interactive action state'), precedence: ['safe authored action', 'resolved internal/external target', 'native relationship graph'], legalCombinations: ['click/hover/URL/end-show/play-sound/custom-show action with safe preserved targets'] }),
	contract({ id: 'foundationTextResidual', rows: textResidualRows, status: PARTIAL, ownership: ['textRun.basicStyle', 'textBody.localization', 'textBody.structure', 'presentation.embeddedFonts'], fields: ['content[].style', 'content[].text', 'content[].vert', 'content[].hyperlink', 'embeddedFonts[]'], resetBehavior: componentReset('the named text/localization/font field', 'residual text authoring state'), precedence: ['authored run/body value', 'theme/language inheritance', 'native preservation'], legalCombinations: ['basic typography, localized vertical/bidirectional text, fields/breaks, font preservation, and hyperlinks'] }),
	contract({ id: 'foundationDeckResidual', rows: deckResidualRows, status: PARTIAL, ownership: ['document.systemCapability'], fields: [], resetBehavior: NO_RESET, precedence: ['portable deck authoring', 'package-safe system behavior'], legalCombinations: ['remaining deck/system behavior with ordinary semantic authoring'] }),
)

export const FOUNDATION_CAPABILITY_CONTRACTS = Object.freeze(Object.fromEntries(contracts.map(item => [item.id, item])))
const contractByRowId = new Map(contracts.flatMap(item => item.rowIds.map(rowId => [rowId, item])))

if (contractByRowId.size !== ledgerRows.length) {
	const missing = ledgerRows.filter(row => !contractByRowId.has(row.rowId)).map(row => `${row.category}:${row.publicName}`)
	throw new Error(`FOUNDATION_LEDGER_PARTITION_INCOMPLETE: ${contractByRowId.size}/${ledgerRows.length}: ${missing.join(', ')}`)
}

export const FOUNDATION_CAPABILITY_PARTITION = Object.freeze({
	rows: ledgerRows.length,
	exactRows: contracts.filter(item => item.capabilityStatus === EXACT).reduce((sum, item) => sum + item.rowIds.length, 0),
	partialRows: contracts.filter(item => item.capabilityStatus === PARTIAL).reduce((sum, item) => sum + item.rowIds.length, 0),
	preserveRows: contracts.filter(item => item.capabilityStatus === PRESERVE).reduce((sum, item) => sum + item.rowIds.length, 0),
	notLiveRows: contracts.filter(item => item.capabilityStatus === NOT_LIVE).reduce((sum, item) => sum + item.rowIds.length, 0),
	notApplicableRows: contracts.filter(item => item.capabilityStatus === NOT_APPLICABLE).reduce((sum, item) => sum + item.rowIds.length, 0),
})

export function foundationCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'capability-row' || entry.family !== 'foundation') return null
	return contractByRowId.get(entry.id) || null
}

export function foundationCapabilityContractForRowId(rowId) {
	return contractByRowId.get(rowId) || null
}
