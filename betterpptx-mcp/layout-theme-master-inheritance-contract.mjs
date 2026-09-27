import {
	HEADER_FOOTER_POLICY_SCHEMA,
	LAYOUT_MARGIN_SCHEMA,
	LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA,
	PLACEHOLDER_VISUAL_STYLE_SCHEMA,
	SLIDE_NUMBER_FIELD_SCHEMA,
} from './layout-placeholder-variants-contract.mjs'

export const LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID = 'impl-b-d35240484bb536ac'

export const LAYOUT_THEME_MASTER_INHERITANCE_ROWS = Object.freeze([
	Object.freeze({ id: 'cap_1052ae36413516c84807', label: 'layouts', semanticPath: 'layouts[]' }),
	Object.freeze({ id: 'cap_154192ca55c46ad6ebfa', label: 'geometry inheritance', semanticPath: 'slides[].content[].placeholderBinding -> layouts[].placeholders[]' }),
	Object.freeze({ id: 'cap_7ac9581e059394369175', label: 'style inheritance', semanticPath: 'slides[].content[].placeholderBinding -> layout/master/theme style chain' }),
	Object.freeze({ id: 'cap_7dea15542706b3015135', label: 'theme inheritance', semanticPath: 'theme -> masters[] -> layouts[] -> slides[]' }),
	Object.freeze({ id: 'cap_9cb750c9abdd0d80214b', label: 'themes', semanticPath: 'theme' }),
	Object.freeze({ id: 'cap_b06fb0b9bd3fdf746b7e', label: 'slide masters', semanticPath: 'masters[0]' }),
])

export const LAYOUT_THEME_MASTER_INHERITANCE_ROW_IDS = Object.freeze(LAYOUT_THEME_MASTER_INHERITANCE_ROWS.map(row => row.id))

const nullableString = Object.freeze({ type: ['string', 'null'] })
const hexColor = Object.freeze({ type: ['string', 'null'], pattern: '^[0-9A-Fa-f]{6}$' })
const colorSchemeProperties = Object.freeze(Object.fromEntries(
	['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
		.map(key => [key, hexColor]),
))
const inheritanceThemeSlots = Object.freeze(['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'])
const inheritanceThemeSlot = Object.freeze({ type: 'string', enum: inheritanceThemeSlots })
const inheritanceColorMapKeys = Object.freeze(['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'])
const inheritanceColorMapProperties = Object.freeze(Object.fromEntries(inheritanceColorMapKeys.map(key => [key, inheritanceThemeSlot])))
const inheritanceColorMap = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({ type: 'object', additionalProperties: false, properties: inheritanceColorMapProperties }),
	]),
})
const inheritanceTextStyle = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({
			type: 'object', additionalProperties: false,
			properties: Object.freeze({
				fontFace: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 256 }),
				fontSize: Object.freeze({ type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400 }),
				color: PLACEHOLDER_VISUAL_STYLE_SCHEMA.oneOf[1].properties.color,
				bold: Object.freeze({ type: ['boolean', 'null'] }), italic: Object.freeze({ type: ['boolean', 'null'] }),
				align: Object.freeze({ type: ['string', 'null'], enum: Object.freeze(['left', 'center', 'right', 'justify', null]) }),
			}),
		}),
	]),
})
const inheritanceTextStyles = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({ title: inheritanceTextStyle, body: inheritanceTextStyle, other: inheritanceTextStyle }) }),
	]),
})
const inheritanceColor = PLACEHOLDER_VISUAL_STYLE_SCHEMA.oneOf[1].properties.color
const fixedFill = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({
			type: Object.freeze({ type: 'string', enum: Object.freeze(['none', 'solid']) }), color: inheritanceColor,
			transparency: Object.freeze({ type: 'number', minimum: 0, maximum: 100 }),
		}) }),
	]),
})
const fixedLine = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({
			type: Object.freeze({ type: 'string', enum: Object.freeze(['none', 'solid']) }), color: inheritanceColor,
			width: Object.freeze({ type: 'number', minimum: 0 }), transparency: Object.freeze({ type: 'number', minimum: 0, maximum: 100 }),
			dash: Object.freeze({ type: 'string', minLength: 1 }), dashType: Object.freeze({ type: 'string', minLength: 1 }),
			beginArrowType: Object.freeze({ type: 'string', minLength: 1 }), endArrowType: Object.freeze({ type: 'string', minLength: 1 }),
		}) }),
	]),
})
const fixedShadow = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({
			type: Object.freeze({ type: 'string', enum: Object.freeze(['outer', 'inner']) }), color: inheritanceColor,
			blur: Object.freeze({ type: 'number', minimum: 0 }), angle: Object.freeze({ type: 'number' }),
			distance: Object.freeze({ type: 'number', minimum: 0 }), offset: Object.freeze({ type: 'number', minimum: 0 }),
			opacity: Object.freeze({ type: 'number', minimum: 0, maximum: 1 }), transparency: Object.freeze({ type: 'number', minimum: 0, maximum: 100 }),
		}) }),
	]),
})
const fixedObjectOptionsProperties = Object.freeze({
	x: Object.freeze({ type: 'number' }), y: Object.freeze({ type: 'number' }), w: Object.freeze({ type: 'number', exclusiveMinimum: 0 }), h: Object.freeze({ type: 'number', minimum: 0 }),
	objectName: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }), fill: fixedFill, line: fixedLine, shadow: fixedShadow,
	rotate: Object.freeze({ type: 'number' }), flipH: Object.freeze({ type: 'boolean' }), flipV: Object.freeze({ type: 'boolean' }),
	fontFace: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }), fontSize: Object.freeze({ type: 'number', exclusiveMinimum: 0, maximum: 400 }),
	color: inheritanceColor, bold: Object.freeze({ type: 'boolean' }), italic: Object.freeze({ type: 'boolean' }),
	align: Object.freeze({ type: 'string', enum: Object.freeze(['left', 'center', 'right', 'justify']) }), valign: Object.freeze({ type: 'string', enum: Object.freeze(['top', 'middle', 'bottom']) }),
	margin: LAYOUT_MARGIN_SCHEMA,
})
const fixedObjectOptions = Object.freeze({ type: 'object', additionalProperties: false, required: Object.freeze(['x', 'y', 'w', 'h']), properties: fixedObjectOptionsProperties })
const portableFixedObject = Object.freeze({
	type: 'object', minProperties: 1, maxProperties: 1, additionalProperties: false,
	properties: Object.freeze({
		text: Object.freeze({ type: 'object', additionalProperties: false, required: Object.freeze(['text', 'options']), properties: Object.freeze({ text: Object.freeze({ type: ['string', 'number'] }), options: fixedObjectOptions }) }),
		rect: fixedObjectOptions,
		line: fixedObjectOptions,
	}),
})
const ownedObjectCollection = Object.freeze({ type: ['array', 'null'], items: portableFixedObject })
const placeholderCollection = Object.freeze({ type: ['array', 'null'], items: LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA })

export const LAYOUT_THEME_MASTER_INHERITANCE_PUBLIC_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		theme: Object.freeze({
			oneOf: Object.freeze([
				Object.freeze({ type: 'null' }),
				Object.freeze({
					type: 'object', additionalProperties: false,
					properties: Object.freeze({
						name: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 255 }),
						palette: Object.freeze({ type: 'array', minItems: 1, maxItems: 12, items: Object.freeze({ type: 'string', pattern: '^[0-9A-Fa-f]{6}$' }) }),
						fontFace: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 256 }),
						headFontFace: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 256 }),
						bodyFontFace: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 256 }),
						lang: Object.freeze({ type: ['string', 'null'], pattern: '^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$' }),
						colorScheme: Object.freeze({ type: ['object', 'null'], additionalProperties: false, properties: colorSchemeProperties }),
					}),
				}),
			]),
		}),
		layouts: Object.freeze({
			type: ['array', 'null'], maxItems: 1000,
			items: Object.freeze({
				type: 'object', additionalProperties: false, required: Object.freeze(['name', 'width', 'height']),
				properties: Object.freeze({
					name: Object.freeze({ type: 'string', pattern: '^[A-Za-z0-9._:-]+$' }),
					width: Object.freeze({ type: 'number', exclusiveMinimum: 0 }),
					height: Object.freeze({ type: 'number', exclusiveMinimum: 0 }),
					type: nullableString, activate: Object.freeze({ type: 'boolean' }), active: Object.freeze({ type: 'boolean' }), reset: Object.freeze({ type: 'boolean' }),
					kind: Object.freeze({ type: 'string', enum: Object.freeze(['layout', 'master']) }), carrierType: Object.freeze({ type: 'string', enum: Object.freeze(['layout', 'master']) }),
					masterName: nullableString, placeholders: placeholderCollection, objects: ownedObjectCollection,
					background: Object.freeze({ type: ['object', 'string', 'null'] }), margin: LAYOUT_MARGIN_SCHEMA,
					slideNumber: SLIDE_NUMBER_FIELD_SCHEMA, headerFooter: HEADER_FOOTER_POLICY_SCHEMA,
					colorMapOverride: inheritanceColorMap,
				}),
			}),
		}),
		masters: Object.freeze({
			type: ['array', 'null'], maxItems: 1,
			items: Object.freeze({
				type: 'object', additionalProperties: false, required: Object.freeze(['title']),
				properties: Object.freeze({
					title: Object.freeze({ type: 'string', minLength: 1, maxLength: 255 }), name: Object.freeze({ type: 'string', minLength: 1, maxLength: 255 }),
					background: Object.freeze({ type: ['object', 'string', 'null'] }), margin: LAYOUT_MARGIN_SCHEMA,
					slideNumber: SLIDE_NUMBER_FIELD_SCHEMA, headerFooter: HEADER_FOOTER_POLICY_SCHEMA,
					objects: ownedObjectCollection, placeholders: placeholderCollection,
					colorMap: inheritanceColorMap, textStyles: inheritanceTextStyles,
				}),
			}),
		}),
		slideBinding: Object.freeze({
			type: 'object', additionalProperties: false,
			properties: Object.freeze({
				layoutName: nullableString, masterName: nullableString,
				background: Object.freeze({ type: ['object', 'string', 'null'] }), colorMapOverride: inheritanceColorMap,
				showMasterShapes: Object.freeze({ type: ['boolean', 'null'] }), showMasterBackground: Object.freeze({ type: ['boolean', 'null'] }),
				showMasterPhAnim: Object.freeze({ type: ['boolean', 'null'] }),
			}),
		}),
	}),
})

export const LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT = Object.freeze({
	id: LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID,
	rowIds: LAYOUT_THEME_MASTER_INHERITANCE_ROW_IDS,
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	scope: 'one newly authored physical slide master with any number of authored layouts; portable fixed objects are bounded to native text, rectangle, and line objects; master textStyles author one effective title/body/other default across all nine native levels; imported multi-master packages remain preservation-safe and the ordered physical-master collection is governed by its separate exact contract',
	componentOwnership: Object.freeze([
		'theme owns the native theme name, twelve color slots, major/minor Latin font roles, and inherited language default',
		'masters[0] owns the single newly authored physical slide-master carrier and its reusable text/rectangle/line objects, placeholders, background, color map, and effective title/body/other text defaults',
		'layouts[] owns named slide-layout carriers and each layout-to-master binding',
		'slides[].layoutName/masterName and placeholderBinding own slide-to-layout selection without flattening inherited geometry/style',
	]),
	overrideFields: Object.freeze([
		'theme.name', 'theme.fontFace', 'theme.headFontFace', 'theme.bodyFontFace', 'theme.lang', 'theme.colorScheme.*',
		'masters[0].background', 'masters[0].margin', 'masters[0].objects', 'masters[0].placeholders', 'masters[0].headerFooter', 'masters[0].colorMap', 'masters[0].textStyles',
		'layouts[].masterName', 'layouts[].background', 'layouts[].margin', 'layouts[].objects', 'layouts[].placeholders', 'layouts[].headerFooter', 'layouts[].colorMapOverride',
		'slides[].layoutName', 'slides[].masterName', 'slides[].background', 'slides[].colorMapOverride', 'slides[].showMasterShapes', 'slides[].showMasterBackground', 'slides[].showMasterPhAnim', 'slides[].content[].placeholderBinding',
	]),
	resetBehavior: Object.freeze({
		component: 'set a theme leaf or slide binding/background to null; set a named carrier component to null; use [] to clear the authored layout/master collection',
		full: 'set theme, layouts, and masters to null to restore imported/default structure, or use [] for an intentionally empty authored collection while retaining native defaults',
		nullBehavior: 'explicit null resets the selected authored component; omission preserves current state; collection [] replaces the authored collection with empty',
	}),
	precedence: Object.freeze([
		'explicit slide geometry/style overrides its matching placeholder; otherwise placeholder geometry/style remains inherited and is not materialized on the slide',
		'slides[].layoutName selects the layout; slides[].masterName must agree with that layout parent when both are supplied',
		'explicit theme slots override the selected design-world defaults; null restores the resolved default for only that slot',
		'imported raw carrier preservation remains authoritative until a named carrier is explicitly edited',
	]),
	legalCombinations: Object.freeze([
		'exactly zero or one newly authored physical master may be present',
		'multiple authored layouts may bind to the same authored physical master',
		'a slide may bind a layout and its agreeing master while inheriting background, geometry, and style',
		'placeholder idx 0 and explicit false values remain distinct from omission',
	]),
	publicSchema: LAYOUT_THEME_MASTER_INHERITANCE_PUBLIC_SCHEMA,
})

export function layoutThemeMasterInheritanceCapabilityContractForEntry(entry = {}) {
	return LAYOUT_THEME_MASTER_INHERITANCE_ROW_IDS.includes(entry.id) ? LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT : null
}
