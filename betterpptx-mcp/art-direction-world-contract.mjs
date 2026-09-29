// Exact optional contract for the 18 named art-direction Worlds. A World is an
// AI-owned starting selector, never an implicit default. Authored style and
// exact slide geometry remain authoritative.

import { createHash } from 'node:crypto'
import { listArtDirections } from './ir/layout-engine.mjs'

export const ART_DIRECTION_WORLD_UNIT_ID = 'impl-f-e9ebeec402181b99'
export const ART_DIRECTION_WORLD_KEYS = Object.freeze(listArtDirections().map(world => world.key))
const opaqueWorldRowId = key => `cap_${createHash('sha256').update(`art-direction:${key}`).digest('hex').slice(0, 20)}`

const RESET_BEHAVIOR = Object.freeze({
	component: 'omit one art-direction axis to leave it unauthored, or set it to null to clear only that axis',
	full: 'clear the selected World and art-direction axes to return to neutral/no-World defaults; preserve separately authored theme, slide/content styling, and exact geometry',
	nullBehavior: 'artDirection:null explicitly resets to neutral/no-World; mode:null clears only an explicit mode request; omission preserves sibling axes but never synthesizes a World or mode',
})

const ART_DIRECTION_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		artDirection: Object.freeze({
			description: 'Optional. Supply one of the 18 named Worlds only when intentionally selected. If artDirection is omitted and no other supported World selector is explicit, or styleIntent.artDirection is explicitly null, the result is neutral/no named World. Unsupported explicit selectors are rejected, not treated as neutral; no editorial, light-mode, Luxe, or other preset is inferred.',
			oneOf: Object.freeze([
				Object.freeze({ type: 'string', enum: ART_DIRECTION_WORLD_KEYS }),
				Object.freeze({ type: 'null' }),
			]),
		}),
		mode: Object.freeze({
			description: 'Optional explicit light/dark request. Omission or null adds no authored mode; a deliberately selected World may use its own standard variant. Without a selected World, no mode preset is inferred. Contrast may still be derived from authored colors for legibility.',
			type: ['string', 'null'], enum: ['light', 'dark', null],
		}),
		palette: Object.freeze({ type: ['array', 'null'], minItems: 1, maxItems: 12, items: Object.freeze({ type: 'string', minLength: 1, maxLength: 32 }) }),
		surface: Object.freeze({ type: ['object', 'null'], additionalProperties: true }),
		card: Object.freeze({ type: ['string', 'null'], maxLength: 64 }),
		depth: Object.freeze({ type: ['object', 'null'], additionalProperties: true }),
		typeScale: Object.freeze({ type: ['object', 'null'], additionalProperties: true }),
		spacing: Object.freeze({ type: ['object', 'null'], additionalProperties: true }),
		accent: Object.freeze({ type: ['string', 'null'], maxLength: 64 }),
		background: Object.freeze({ type: ['string', 'null'], maxLength: 64 }),
	}),
})

export const ART_DIRECTION_WORLD_CONTRACT = Object.freeze({
	id: 'artDirectionWorld',
	schemaVersion: 'betterpptx.art-direction-world.v1',
	unitId: ART_DIRECTION_WORLD_UNIT_ID,
	rowIds: Object.freeze(ART_DIRECTION_WORLD_KEYS.map(opaqueWorldRowId)),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze(['designWorld', 'palette', 'surface', 'cardLanguage', 'depth', 'typeScale', 'spacing']),
	overrideFields: Object.freeze([
		'styleIntent.artDirection', 'styleIntent.mode', 'styleIntent.palette', 'styleIntent.card',
		'styleIntent.surface', 'styleIntent.depth', 'styleIntent.typeScale', 'styleIntent.spacing',
		'styleIntent.accent', 'styleIntent.background', 'styleIntent.artDirection.mode',
		'styleIntent.artDirection.palette', 'styleIntent.artDirection.bg',
		'styleIntent.artDirection.headFontFace', 'styleIntent.artDirection.headFont',
		'styleIntent.artDirection.bodyFontFace', 'styleIntent.artDirection.bodyFont',
		'styleIntent.artDirection.card', 'styleIntent.artDirection.surface',
		'styleIntent.artDirection.composition', 'styleIntent.artDirection.emphasis',
		'styleIntent.artDirection.depth', 'styleIntent.artDirection.motion',
		'styleIntent.artDirection.voice', 'styleIntent.artDirection.dataStyle',
	]),
	resetBehavior: RESET_BEHAVIOR,
	precedence: Object.freeze([
		'explicit slide/content styling, theme choices, and brand palette axes',
		'explicit named World selector and explicit mode, only for choices not already authored',
		'applied template/master visual language where not overridden by authored choices',
		'neutral native defaults; omission never selects a named art-direction World',
	]),
	legalCombinations: Object.freeze([
		'artDirection and mode are optional; omission or artDirection:null is neutral/no-World, with no implicit editorial, light-mode, Luxe, or other preset',
		'without a selected World, omitted or null mode is not a style choice; effective contrast may still be derived from authored colors for legibility',
		'any explicitly selected named World may use its standard variant or an explicitly requested light/dark mode',
		'a selected World may combine with palette, surface, card, depth, typeScale, spacing, accent, and background axes',
		'explicit theme, slide, and content styling remains authoritative over World defaults and may be used without selecting a World',
		'AI-authored exact slide geometry remains authoritative in AI and Director workflows; Director assistance does not replace or rewrite authored coordinates',
		'premium, complete, business-appropriate quality is the default ambition, not a World, effects quota, maximum-complexity, or feature-coverage requirement',
		'component null reset may be followed by sparse axis re-edit while preserving authored styling, slide content, and exact geometry',
	]),
	applicability: Object.freeze([
		'18 named World selectors in betterpptx.authoring.catalog family art-direction',
		'styleIntent.artDirection and visualDesign.world semantic deck-spec fields',
		'deterministic realization of explicitly selected canvas, card, typography, accent, depth, data, and motion-temperament choices',
		'exact AI-authored geometry in exact-AI routes, including Director-assisted authoring',
	]),
	limitation: 'This contract documents only the 18 optional named-World selectors; it does not define the broader custom-styling API. Premium-complete business quality does not require effects, added complexity, or a paid/provider-specific capability; formal universal certification remains tracked separately.',
	publicSchema: ART_DIRECTION_SCHEMA,
})

export function artDirectionWorldCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'named-world' || entry.family !== 'art-direction') return null
	const key = String(entry.selection?.executableValue || '').trim()
	return ART_DIRECTION_WORLD_KEYS.includes(key) ? ART_DIRECTION_WORLD_CONTRACT : null
}

export function validateArtDirectionWorldSelection(value, path = 'styleIntent') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) if (!Object.prototype.hasOwnProperty.call(ART_DIRECTION_SCHEMA.properties, key)) throw new Error(`${path}.${key} is not part of the public art-direction World contract.`)
	if (value.artDirection !== undefined && value.artDirection !== null && !ART_DIRECTION_WORLD_KEYS.includes(String(value.artDirection))) throw new Error(`${path}.artDirection must be one of the 18 named World keys or null.`)
	if (value.mode !== undefined && value.mode !== null && !['light', 'dark'].includes(value.mode)) throw new Error(`${path}.mode must be light, dark, or null.`)
	if (value.palette !== undefined && value.palette !== null && (!Array.isArray(value.palette) || value.palette.length < 1 || value.palette.length > 12 || value.palette.some(color => typeof color !== 'string' || !color.trim()))) throw new Error(`${path}.palette must contain 1 to 12 non-empty color tokens or null.`)
	return { ...value }
}
