// Exact contract for the 18 named art-direction Worlds.  A World is an
// AI-owned starting selector for a complete visual grammar; explicit axes and
// slide/content styling remain open semantic overrides.

import { createHash } from 'node:crypto'
import { listArtDirections } from './ir/layout-engine.mjs'

export const ART_DIRECTION_WORLD_UNIT_ID = 'impl-f-e9ebeec402181b99'
export const ART_DIRECTION_WORLD_KEYS = Object.freeze(listArtDirections().map(world => world.key))
const opaqueWorldRowId = key => `cap_${createHash('sha256').update(`art-direction:${key}`).digest('hex').slice(0, 20)}`

const RESET_BEHAVIOR = Object.freeze({
	component: 'set one art-direction axis or styleIntent.artDirection to null or omit it',
	full: 'remove the selected World and authored art-direction axes to restore the native/default visual grammar',
	nullBehavior: 'explicit null removes only that authored axis; omission preserves sibling axes and the selected World',
})

const ART_DIRECTION_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		artDirection: Object.freeze({
			oneOf: Object.freeze([
				Object.freeze({ type: 'string', enum: ART_DIRECTION_WORLD_KEYS }),
				Object.freeze({ type: 'null' }),
			]),
		}),
		mode: Object.freeze({ type: ['string', 'null'], enum: ['light', 'dark', null] }),
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
		'styleIntent.artDirection', 'styleIntent.artDirection.mode', 'styleIntent.artDirection.palette',
		'styleIntent.artDirection.surface', 'styleIntent.artDirection.card', 'styleIntent.artDirection.depth',
		'styleIntent.artDirection.typeScale', 'styleIntent.artDirection.spacing',
		'styleIntent.artDirection.accent', 'styleIntent.artDirection.background',
	]),
	resetBehavior: RESET_BEHAVIOR,
	precedence: Object.freeze([
		'explicit slide/content styling and brand palette axes',
		'explicit named World selector and mode',
		'applied template/master visual language',
		'native/default art-direction grammar',
	]),
	legalCombinations: Object.freeze([
		'any named World may be selected with its default or explicitly requested light/dark mode',
		'a selected World may combine with palette, surface, card, depth, typeScale, spacing, accent, and background axes',
		'explicit slide and content styling may override World defaults without changing the selected World identity',
		'component null reset may be followed by sparse axis re-edit while preserving slide content and layout identity',
	]),
	applicability: Object.freeze([
		'18 named World selectors in betterpptx.authoring.catalog family art-direction',
		'styleIntent.artDirection and visualDesign.world semantic deck-spec fields',
		'deterministic canvas, card, typography, accent, depth, data, and motion-temperament realization',
	]),
	limitation: 'Named Worlds are parameterized starting selectors rather than a closed global slider catalog; bespoke semantic axes remain valid and formal universal certification remains tracked separately.',
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
