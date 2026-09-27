// Connector-only native effects. Keep the public source typed and replayable;
// the serializer consumes the same canonical components as ordinary shapes.
import { normalizeGlow, normalizeShadow, normalizeReflection, normalizeSoftEdge } from './ir/native-visual-primitives.mjs'

export const CONNECTOR_EFFECT_COMPONENTS = Object.freeze(['glow', 'shadow', 'reflection', 'softEdges'])
export const CONNECTOR_EFFECT_FIELDS = Object.freeze([...CONNECTOR_EFFECT_COMPONENTS, 'effects'])
const number = (minimum, maximum) => ({ type: ['number', 'null'], minimum, maximum })
const color = { type: ['string', 'null'], pattern: '^#?[0-9A-Fa-f]{6}$' }
const opacity = number(0, 1)
const points = number(0, 1000)
const componentSchemas = {
	glow: { color, opacity, radiusPt: number(0, 100), size: number(0, 100), rad: number(0, 100) },
	shadow: { type: { type: 'string', enum: ['outer', 'inner', 'none'] }, color, opacity, blurPt: points, blur: points, size: points, distancePt: points, offset: points, distance: points, angleDeg: number(0, 360), angle: number(0, 360), scaleX: number(0, 2), scaleY: number(0, 2), skewXDeg: number(-90, 90), skewX: number(-90, 90), skewYDeg: number(-90, 90), skewY: number(-90, 90), rotateWithShape: { type: 'boolean' } },
	reflection: { blurPt: points, blur: points, distancePt: points, offset: points, directionDeg: number(0, 360), angle: number(0, 360), startOpacity: opacity, opacity, endOpacity: opacity, startPosition: opacity, endPosition: opacity, fadeStart: number(0, 100), fadeEnd: number(0, 100), scaleY: number(-1000, 1000) },
	softEdges: { radiusPt: number(0, 100), size: number(0, 100) },
}
const aliases = {
	glow: [['radiusPt', 'size', 'rad']],
	shadow: [['blurPt', 'blur', 'size'], ['distancePt', 'offset', 'distance'], ['angleDeg', 'angle'], ['skewXDeg', 'skewX'], ['skewYDeg', 'skewY']],
	reflection: [['blurPt', 'blur'], ['distancePt', 'offset'], ['directionDeg', 'angle'], ['startOpacity', 'opacity'], ['startPosition', 'fadeStart'], ['endPosition', 'fadeEnd']],
	softEdges: [['radiusPt', 'size']],
}
const normalizers = { glow: normalizeGlow, shadow: normalizeShadow, reflection: normalizeReflection, softEdges: normalizeSoftEdge }
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const arrayKinds = { glow: 'glow', shadow: 'shadow', outershadow: 'shadow', innershadow: 'shadow', reflection: 'reflection', softedge: 'softEdges', softedges: 'softEdges' }

export const CONNECTOR_EFFECT_PROPERTIES = Object.freeze({
	...Object.fromEntries(CONNECTOR_EFFECT_COMPONENTS.map(kind => [kind, { type: ['object', 'null'], additionalProperties: false, properties: componentSchemas[kind] }])),
	effects: { type: ['array', 'null'], maxItems: 16, description: 'Native connector glow, shadow, reflection and soft-edge components. Null or an empty array clears all authored connector effects.', items: { oneOf: Object.entries(arrayKinds).map(([type, kind]) => ({ type: 'object', additionalProperties: false, required: ['type'], properties: { ...componentSchemas[kind], type: { type: 'string', enum: [type, ...(type === 'outershadow' ? ['outerShadow'] : type === 'innershadow' ? ['innerShadow'] : type === 'softedge' ? ['softEdge'] : type === 'softedges' ? ['softEdges'] : [])] } } })) } },
})

function normalizeComponent(kind, input, path) {
	if (input === null) return null
	if (!isObject(input)) throw new Error(`${path} must be a typed effect object or null.`)
	const schema = componentSchemas[kind]
	for (const [key, value] of Object.entries(input)) {
		const property = schema[key]
		if (!property) throw new Error(`${path}.${key} is not part of the public connector effect contract.`)
		if (value === null && Array.isArray(property.type) && property.type.includes('null')) continue
		if (property.type === 'boolean') { if (typeof value !== 'boolean') throw new Error(`${path}.${key} must be boolean.`); continue }
		if (property.enum) { if (!property.enum.includes(value)) throw new Error(`${path}.${key} is not supported.`); continue }
		if (property.pattern) { if (typeof value !== 'string' || !/^#?[0-9a-f]{6}$/i.test(value)) throw new Error(`${path}.${key} must be a six-digit RGB color.`); continue }
		if (typeof value !== 'number' || !Number.isFinite(value) || value < property.minimum || value > property.maximum) throw new Error(`${path}.${key} must be a finite number between ${property.minimum} and ${property.maximum}.`)
	}
	const canonical = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null))
	const normalized = normalizers[kind](canonical)
	if ((kind === 'shadow' || kind === 'reflection') && normalized.angle === 360) normalized.angle = 0
	return normalized
}

function effectKind(effect, path) {
	if (!isObject(effect)) throw new Error(`${path} must be a typed connector effect.`)
	const type = String(effect.type || '').toLowerCase()
	if (!arrayKinds[type]) throw new Error(`${path}.type must be glow, shadow, outerShadow, innerShadow, reflection, or softEdges.`)
	return { type, kind: arrayKinds[type] }
}

export function normalizeConnectorEffects(source = {}, path = 'connector') {
	const out = {}
	for (const kind of CONNECTOR_EFFECT_COMPONENTS) if (owns(source, kind)) out[kind] = normalizeComponent(kind, source[kind], `${path}.${kind}`)
	if (!owns(source, 'effects')) return out
	if (source.effects === null || (Array.isArray(source.effects) && source.effects.length === 0)) {
		for (const kind of CONNECTOR_EFFECT_COMPONENTS) out[kind] = null
		out.effects = source.effects === null ? null : []
		return out
	}
	if (!Array.isArray(source.effects) || source.effects.length > 16) throw new Error(`${path}.effects must be an array of at most 16 typed effects or null.`)
	for (const [index, effect] of source.effects.entries()) {
		const { type, kind } = effectKind(effect, `${path}.effects[${index}]`)
		const component = { ...effect }
		delete component.type
		if (kind === 'shadow') component.type = type === 'innershadow' ? 'inner' : 'outer'
		out[kind] = normalizeComponent(kind, component, `${path}.effects[${index}]`)
	}
	out.effects = structuredClone(source.effects)
	return out
}

export function connectorEffectsPublicReadback(options = {}) {
	return Object.fromEntries(CONNECTOR_EFFECT_FIELDS.filter(key => owns(options, key)).map(key => [key, structuredClone(options[key])]))
}

// A component patch must not leave an old effects[] item that would restore
// the replaced value on export/replay. Other independently authored components
// and the connector's line, endpoints, and gallery selector remain untouched.
export function patchConnectorEffects(current = {}, patch = {}, path = 'connector patch') {
	if (!CONNECTOR_EFFECT_FIELDS.some(key => owns(patch, key))) return null
	const next = connectorEffectsPublicReadback(current)
	const touched = new Set(CONNECTOR_EFFECT_COMPONENTS.filter(key => owns(patch, key)))
	if (owns(patch, 'effects') && Array.isArray(next.effects)) {
		for (const [index, effect] of next.effects.entries()) next[effectKind(effect, `${path}.previousEffects[${index}]`).kind] = null
	}
	for (const kind of touched) {
		const value = patch[kind]
		if (value !== null && !isObject(value)) throw new Error(`${path}.${kind} must be a typed effect object or null.`)
		const base = isObject(next[kind]) ? { ...next[kind] } : {}
		if (isObject(value)) for (const group of aliases[kind]) if (group.some(key => owns(value, key))) for (const key of group) delete base[key]
		next[kind] = normalizeComponent(kind, value === null ? null : { ...base, ...value }, `${path}.${kind}`)
	}
	if (owns(patch, 'effects')) Object.assign(next, normalizeConnectorEffects({ effects: patch.effects }, path))
	else if (Array.isArray(next.effects)) next.effects = next.effects.filter((effect, index) => !touched.has(effectKind(effect, `${path}.previousEffects[${index}]`).kind))
	else if (next.effects === null && touched.size) delete next.effects
	// An emptied combination is not an all-effects reset: its unaffected
	// components are already represented by their canonical typed fields.
	if (!owns(patch, 'effects') && Array.isArray(next.effects) && next.effects.length === 0) delete next.effects
	return next
}
