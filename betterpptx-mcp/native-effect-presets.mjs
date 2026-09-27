// Exact native Shape Effects / Text Effects vocabulary.
//
// The AI client selects one or more stable IDs in execution order. This
// private adapter composes the captured native fragments while the public MCP
// surface exposes only IDs, labels, categories, and standard authoring fields.

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

import {
	EXACT_NATIVE_EFFECT_PRESETS,
	EXACT_SHAPE_EFFECT_PRESETS,
	EXACT_TEXT_EFFECT_PRESETS,
} from './native-effect-presets.generated.mjs'

const serializer = new XMLSerializer()
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'

export const SHAPE_EFFECT_PRESETS = EXACT_SHAPE_EFFECT_PRESETS
export const TEXT_EFFECT_PRESETS = EXACT_TEXT_EFFECT_PRESETS
export const NATIVE_EFFECT_PRESETS = EXACT_NATIVE_EFFECT_PRESETS

export function shapeEffectPresetById(id) {
	return SHAPE_EFFECT_PRESETS.find(item => item.id === String(id)) || null
}

export function textEffectPresetById(id) {
	return TEXT_EFFECT_PRESETS.find(item => item.id === String(id)) || null
}

export function nativeEffectPresetById(id) {
	return NATIVE_EFFECT_PRESETS.find(item => item.id === String(id)) || null
}

function normalizeIds(value) {
	if (value == null || value === '') return []
	return (Array.isArray(value) ? value : [value]).map(item => String(item).trim()).filter(Boolean)
}

function parseFragmentChildren(xml) {
	if (!xml) return []
	const document = new DOMParser().parseFromString(`<root xmlns:a="${DRAWING_NS}">${xml}</root>`, 'application/xml')
	if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid private native effect fragment')
	const root = document.documentElement
	const children = []
	for (let child = root.firstChild; child; child = child.nextSibling) {
		if (child.nodeType === 1) children.push({ tag: child.nodeName, xml: serializer.serializeToString(child) })
	}
	return children
}

function parseEffectList(xml) {
	if (!xml) return []
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid private native effect list')
	const root = document.documentElement
	const result = []
	for (let child = root.firstChild; child; child = child.nextSibling) {
		if (child.nodeType === 1) result.push({ tag: child.nodeName, xml: serializer.serializeToString(child) })
	}
	return result
}

function splitThreeD(xml) {
	const parts = parseFragmentChildren(xml)
	return {
		scene3dXml: parts.find(part => part.tag === 'a:scene3d')?.xml || '',
		sp3dXml: parts.find(part => part.tag === 'a:sp3d')?.xml || '',
		other: parts.filter(part => part.tag !== 'a:scene3d' && part.tag !== 'a:sp3d'),
	}
}

function mapEffectParts(parts) {
	const map = new Map()
	for (const part of parts) map.set(part.tag, part.xml)
	return map
}

function effectListXml(parts) {
	if (!parts.size) return undefined
	return `<a:effectLst xmlns:a="${DRAWING_NS}">${[...parts.values()].join('')}</a:effectLst>`
}

function firstElement(parent, tag) {
	if (!parent) return null
	for (let child = parent.firstChild; child; child = child.nextSibling) {
		if (child.nodeType === 1 && child.nodeName === tag) return child
	}
	return null
}

function ensureElement(document, parent, tag) {
	const existing = firstElement(parent, tag)
	if (existing) return existing
	const element = document.createElementNS(DRAWING_NS, tag)
	parent.appendChild(element)
	return element
}

function setFixedAngle(element, attribute, value, { normalize = true } = {}) {
	if (value === undefined || value === null) return
	const degrees = Number(value)
	if (!Number.isFinite(degrees)) return
	const serialized = normalize ? ((degrees % 360) + 360) % 360 : degrees
	element.setAttribute(attribute, String(Math.round(serialized * 60000)))
}

function numericValue(value, aliases = []) {
	if (value === undefined || value === null) return undefined
	if (typeof value === 'object') {
		for (const key of aliases) if (value[key] !== undefined && value[key] !== null) return Number(value[key])
		return undefined
	}
	const number = Number(value)
	return Number.isFinite(number) ? number : undefined
}

function setColorChild(document, parent, tag, color) {
	if (color === undefined || color === null) return
	let child = firstElement(parent, tag)
	if (!child) {
		child = document.createElementNS(DRAWING_NS, tag)
		parent.appendChild(child)
	}
	while (child.firstChild) child.removeChild(child.firstChild)
	const srgb = document.createElementNS(DRAWING_NS, 'a:srgbClr')
	srgb.setAttribute('val', String(color).replace(/^#/, '').toUpperCase())
	child.appendChild(srgb)
}

function removeDirectChild(parent, tag) {
	const child = firstElement(parent, tag)
	if (child) parent.removeChild(child)
}

function reorderDirectChildren(parent, rank) {
	const children = []
	for (let child = parent.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) children.push(child)
	children.sort((left, right) => (rank[left.nodeName] ?? 100) - (rank[right.nodeName] ?? 100))
	for (const child of children) parent.appendChild(child)
}

function effectNumber(value, aliases = [], fallback = undefined) {
	if (value === undefined || value === null) return fallback
	if (typeof value === 'object') {
		for (const key of aliases) {
			if (value[key] !== undefined && value[key] !== null) {
				const number = Number(value[key])
				return Number.isFinite(number) ? number : fallback
			}
		}
		return fallback
	}
	const number = Number(value)
	return Number.isFinite(number) ? number : fallback
}

function setNumericAttribute(element, name, value, multiplier = 1, fallback = undefined) {
	const number = effectNumber(value, [], fallback)
	if (number === undefined) return
	element.setAttribute(name, String(Math.round(number * multiplier)))
}

function setAlphaAttribute(element, name, value, fallback = undefined) {
	setNumericAttribute(element, name, value, 100000, fallback)
}

function normalizeEffectOverrideMap(style = {}) {
	const map = {}
	const add = (key, value) => {
		if (value !== undefined && value !== null) map[key] = value
	}
	add('shadow', style.shadow)
	add('glow', style.glow)
	add('reflection', style.reflection)
	add('softEdges', style.softEdges)
	add('blur', style.blur)
	add('fillOverlay', style.fillOverlay)
	add('shadow', style.textShadow)
	add('glow', style.textGlow)
	add('reflection', style.textReflection)
	if (Array.isArray(style.effects)) {
		for (const effect of style.effects) {
			if (!effect || typeof effect !== 'object') continue
			const type = String(effect.type || '').toLowerCase()
			if (type === 'shadow' || type === 'outershadow' || type === 'innershadow') add('shadow', { ...effect, type })
			else if (type === 'glow') add('glow', effect)
			else if (type === 'reflection') add('reflection', effect)
			else if (type === 'softedge' || type === 'softedges') add('softEdges', effect)
			else if (type === 'blur') add('blur', effect)
			else if (type === 'filloverlay' || type === 'overlay') add('fillOverlay', effect)
		}
	}
	return map
}

function setEffectColor(document, element, value, opacity = undefined) {
	if (value === undefined || value === null) return
	const color = typeof value === 'object' ? (value.color || value.hex || value.value) : value
	if (typeof color !== 'string' || !color.trim()) return
	for (let child = element.firstChild; child;) {
		const next = child.nextSibling
		if (child.nodeType === 1 && ['a:srgbClr', 'a:schemeClr', 'a:prstClr', 'a:scrgbClr'].includes(child.nodeName)) element.removeChild(child)
		child = next
	}
	const srgb = document.createElementNS(DRAWING_NS, 'a:srgbClr')
	srgb.setAttribute('val', color.replace(/^#/, '').toUpperCase())
	if (opacity !== undefined && opacity !== null) {
		const alpha = document.createElementNS(DRAWING_NS, 'a:alpha')
		alpha.setAttribute('val', String(Math.round(Number(opacity) * 100000)))
		srgb.appendChild(alpha)
	}
	element.appendChild(srgb)
}

function overrideEffectXml(xml, key, override) {
	if (!xml || !override || typeof override !== 'object') return xml
	const document = new DOMParser().parseFromString(`<root xmlns:a="${DRAWING_NS}">${xml}</root>`, 'application/xml')
	const root = document.documentElement
	const element = firstElement(root, root.firstChild?.nodeName)
	if (!element) return xml
	if (key === 'shadow') {
		setNumericAttribute(element, 'blurRad', override.blurPt ?? override.blur ?? override.size, 12700, 4)
		setNumericAttribute(element, 'dist', override.distancePt ?? override.offset ?? override.distance, 12700, 3)
		setNumericAttribute(element, 'dir', override.angleDeg ?? override.angle, 60000, 45)
		if (override.rotateWithShape !== undefined) element.setAttribute('rotWithShape', override.rotateWithShape ? '1' : '0')
		setEffectColor(document, element, override.color, override.opacity ?? 0.5)
	}
	if (key === 'glow') {
		setNumericAttribute(element, 'rad', override.radiusPt ?? override.radius ?? override.size, 12700, 8)
		setEffectColor(document, element, override.color, override.opacity ?? 0.75)
	}
	if (key === 'reflection') {
		setNumericAttribute(element, 'blurRad', override.blurPt ?? override.blur, 12700, 0)
		setNumericAttribute(element, 'dist', override.distancePt ?? override.offset, 12700, 0)
		setNumericAttribute(element, 'dir', override.directionDeg ?? override.angle, 60000, 90)
		setAlphaAttribute(element, 'stA', override.startOpacity ?? override.opacity, 0.5)
		setAlphaAttribute(element, 'endA', override.endOpacity, 0)
		const start = override.startPosition !== undefined ? Number(override.startPosition) * 100000 : Number(override.fadeStart) * 1000
		const end = override.endPosition !== undefined ? Number(override.endPosition) * 100000 : Number(override.fadeEnd) * 1000
		setNumericAttribute(element, 'stPos', Number.isFinite(start) ? start : undefined, 1, 0)
		setNumericAttribute(element, 'endPos', Number.isFinite(end) ? end : undefined, 1, 55000)
	}
	if (key === 'softEdges') setNumericAttribute(element, 'rad', override.radiusPt ?? override.size, 12700, 8)
	if (key === 'blur') {
		setNumericAttribute(element, 'rad', override.radiusPt ?? override.radius ?? override.size, 12700, 8)
		if (override.grow !== undefined || override.growBounds !== undefined) element.setAttribute('grow', (override.grow ?? override.growBounds) === false ? '0' : '1')
	}
	if (key === 'fillOverlay') {
		const blend = override.blendMode ?? override.blend
		if (blend !== undefined && blend !== null) element.setAttribute('blend', String(blend).toLowerCase() === 'multiply' ? 'mult' : String(blend))
		const fill = override.fill && typeof override.fill === 'object' ? override.fill : override
		const solidFill = ensureElement(document, element, 'a:solidFill')
		setEffectColor(document, solidFill, fill.color)
		const color = firstElement(solidFill, 'a:srgbClr')
		if (color && fill.transparency !== undefined && fill.transparency !== null) {
			const transparency = Number(fill.transparency) <= 1 ? Number(fill.transparency) * 100 : Number(fill.transparency)
			const alpha = ensureElement(document, color, 'a:alpha')
			alpha.setAttribute('val', String(Math.round((100 - transparency) * 1000)))
		}
	}
	return serializer.serializeToString(element)
}

function applyTypedEffectOverrides(effects, style) {
	const overrides = normalizeEffectOverrideMap(style)
	for (const [key, override] of Object.entries(overrides)) {
		const tags = key === 'shadow' ? ['a:outerShdw', 'a:innerShdw']
			: key === 'softEdges' ? ['a:softEdge']
			: key === 'fillOverlay' ? ['a:fillOverlay']
			: [`a:${key}`]
		const matching = tags.filter(tag => effects.has(tag))
		if (override && typeof override === 'object' && String(override.type || '').toLowerCase() === 'none') {
			for (const tag of tags) effects.delete(tag)
			continue
		}
		const tag = matching[0] || tags[0]
		const template = effects.get(tag)
		if (template) effects.set(tag, overrideEffectXml(template, key, override))
	}
	return effects
}

// A Shape Effects gallery tile is a native base treatment, not a ceiling.
// When a caller combines that tile with typed effect3D fields, merge the
// caller-owned fields into the captured native scene/sp3d fragments instead
// of silently discarding them behind the raw-preservation path.
function applyShape3DOverrides(raw, override) {
	if (!raw || !override || typeof override !== 'object') return raw
	const document = new DOMParser().parseFromString(`<root xmlns:a="${DRAWING_NS}">${raw}</root>`, 'application/xml')
	const root = document.documentElement
	let scene = firstElement(root, 'a:scene3d')
	let sp3d = firstElement(root, 'a:sp3d')
	if (!scene) {
		scene = document.createElementNS(DRAWING_NS, 'a:scene3d')
		root.appendChild(scene)
	}
	if (!sp3d) {
		sp3d = document.createElementNS(DRAWING_NS, 'a:sp3d')
		root.appendChild(sp3d)
	}

	const camera = firstElement(scene, 'a:camera') || ensureElement(document, scene, 'a:camera')
	const lightRig = firstElement(scene, 'a:lightRig') || ensureElement(document, scene, 'a:lightRig')
	if (!camera.hasAttribute('prst')) camera.setAttribute('prst', 'orthographicFront')
	if (!lightRig.hasAttribute('rig')) lightRig.setAttribute('rig', 'threePt')
	if (!lightRig.hasAttribute('dir')) lightRig.setAttribute('dir', 't')
	if (camera) {
		if (override.perspective !== undefined) {
			if (override.perspective === null || Number(override.perspective) === 0) camera.removeAttribute('fov')
			else {
				camera.setAttribute('fov', String(Math.round(Number(override.perspective) * 60000)))
				camera.setAttribute('prst', 'perspectiveFront')
			}
		}
		const ownsRotation = ['rotationX', 'rotationY', 'rotationZ'].some(key => Object.prototype.hasOwnProperty.call(override, key))
		if (ownsRotation) {
			const rotation = ensureElement(document, camera, 'a:rot')
			// A native camera rotation is a complete lat/lon/rev tuple. Fill
			// omitted axes with zero; a partial <a:rot> is rejected by Office for
			// some gallery cameras. Keep the library's canonical modulo angle
			// normalization so every camera axis stays in the OOXML-safe range.
			if (!rotation.hasAttribute('lat')) rotation.setAttribute('lat', '0')
			if (!rotation.hasAttribute('lon')) rotation.setAttribute('lon', '0')
			if (!rotation.hasAttribute('rev')) rotation.setAttribute('rev', '0')
			// PowerPoint's authoring axes are encoded as lon=-X, lat=Y,
			// rev=-Z in the DrawingML camera tuple.
			if (Object.prototype.hasOwnProperty.call(override, 'rotationX')) setFixedAngle(rotation, 'lon', -(override.rotationX ?? 0))
			if (Object.prototype.hasOwnProperty.call(override, 'rotationY')) setFixedAngle(rotation, 'lat', override.rotationY ?? 0)
			if (Object.prototype.hasOwnProperty.call(override, 'rotationZ')) setFixedAngle(rotation, 'rev', -(override.rotationZ ?? 0))
			if (['lat', 'lon', 'rev'].every(attribute => Number(rotation.getAttribute(attribute) || 0) === 0)) camera.removeChild(rotation)
		}
	}
	if (lightRig) {
		if (override.lightRig !== undefined) lightRig.setAttribute('rig', override.lightRig === null ? 'threePt' : String(typeof override.lightRig === 'object' ? (override.lightRig.rig || override.lightRig.name || override.lightRig.value) : override.lightRig))
		if (override.lightDirection !== undefined) {
			if (override.lightDirection === null || Number(override.lightDirection) === 0) {
				const existingRotation = firstElement(lightRig, 'a:rot')
				if (existingRotation) lightRig.removeChild(existingRotation)
			} else {
			const rotation = ensureElement(document, lightRig, 'a:rot')
			rotation.setAttribute('lat', rotation.getAttribute('lat') || '0')
			rotation.setAttribute('lon', rotation.getAttribute('lon') || '0')
			setFixedAngle(rotation, 'rev', override.lightDirection)
			}
		}
	}
	if (sp3d) {
		const extrusion = numericValue(override.extrusion, ['depth', 'height', 'h', 'value'])
		if (Object.prototype.hasOwnProperty.call(override, 'extrusion')) {
			if (override.extrusion === null) sp3d.removeAttribute('extrusionH')
			else if (extrusion !== undefined) sp3d.setAttribute('extrusionH', String(Math.round(extrusion * 12700)))
		}
		if (override.material !== undefined) {
			if (override.material === null) sp3d.removeAttribute('prstMaterial')
			else sp3d.setAttribute('prstMaterial', String(override.material))
		}
		const contourWidth = numericValue(override.contourWidth, ['width', 'value'])
		if (Object.prototype.hasOwnProperty.call(override, 'contourWidth')) {
			if (override.contourWidth === null) sp3d.removeAttribute('contourW')
			else if (contourWidth !== undefined) sp3d.setAttribute('contourW', String(Math.round(contourWidth * 12700)))
		}
		for (const [key, tag] of [['bevel', 'a:bevelT'], ['bevelBottom', 'a:bevelB']]) {
			const bevel = override[key]
			if (bevel === null) {
				removeDirectChild(sp3d, tag)
				continue
			}
			if (!bevel || typeof bevel !== 'object') continue
			const element = ensureElement(document, sp3d, tag)
			const width = numericValue(bevel.width, ['value'])
			const height = numericValue(bevel.height, ['value'])
			if (Object.prototype.hasOwnProperty.call(bevel, 'width')) {
				if (bevel.width === null) element.removeAttribute('w')
				else if (width !== undefined) element.setAttribute('w', String(Math.round(width * 12700)))
			}
			if (Object.prototype.hasOwnProperty.call(bevel, 'height')) {
				if (bevel.height === null) element.removeAttribute('h')
				else if (height !== undefined) element.setAttribute('h', String(Math.round(height * 12700)))
			}
			if (bevel.type !== undefined) {
				if (bevel.type === null) element.removeAttribute('prst')
				else element.setAttribute('prst', String(bevel.type))
			}
		}
		if (override.extrusionColor !== undefined) {
			if (override.extrusionColor === null) removeDirectChild(sp3d, 'a:extrusionClr')
			else setColorChild(document, sp3d, 'a:extrusionClr', override.extrusionColor)
		}
		if (override.contourColor !== undefined) {
			if (override.contourColor === null) removeDirectChild(sp3d, 'a:contourClr')
			else setColorChild(document, sp3d, 'a:contourClr', override.contourColor)
		}
	}
	reorderDirectChildren(scene, { 'a:camera': 1, 'a:lightRig': 2, 'a:backdrop': 3, 'a:extLst': 4 })
	reorderDirectChildren(sp3d, { 'a:bevelT': 1, 'a:bevelB': 2, 'a:extrusionClr': 3, 'a:contourClr': 4, 'a:extLst': 5 })
	const serialized = []
	for (let node = root.firstChild; node; node = node.nextSibling) serialized.push(serializer.serializeToString(node))
	return serialized.join('')
}

export function applyText3DOverridesToRaw(raw, override) {
	if (!raw) return raw
	const parts = parseFragmentChildren(raw)
	if (override === null) return parts.filter(part => part.tag !== 'a:scene3d' && part.tag !== 'a:sp3d').map(part => part.xml).join('')
	if (!override || typeof override !== 'object') return raw
	const merged = splitThreeD(applyShape3DOverrides(raw, override))
	const bodyRank = { 'a:prstTxWarp': 1, 'a:noAutofit': 2, 'a:normAutofit': 2, 'a:spAutoFit': 2, 'a:scene3d': 3, 'a:sp3d': 4, 'a:flatTx': 5, 'a:extLst': 6 }
	const combined = [...merged.other, ...(merged.scene3dXml ? [{ tag: 'a:scene3d', xml: merged.scene3dXml }] : []), ...(merged.sp3dXml ? [{ tag: 'a:sp3d', xml: merged.sp3dXml }] : [])]
	combined.sort((left, right) => (bodyRank[left.tag] ?? 50) - (bodyRank[right.tag] ?? 50))
	return combined.map(part => part.xml).join('')
}

function publicPreset(preset) {
	return {
		id: preset.id,
		kind: preset.kind,
		family: preset.family,
		category: preset.category,
		tileIndex: preset.tileIndex,
		label: preset.label,
		evidence: 'native-editable-gallery-reference',
	}
}

export function publicShapeEffectPresets() {
	return SHAPE_EFFECT_PRESETS.map(publicPreset)
}

export function publicTextEffectPresets() {
	return TEXT_EFFECT_PRESETS.map(publicPreset)
}

export function publicNativeEffectPresets() {
	return NATIVE_EFFECT_PRESETS.map(publicPreset)
}

function applyPresets(style, ids, kind) {
	const selectedIds = normalizeIds(ids)
	if (!selectedIds.length) return { style: { ...style }, presets: [] }
	const presets = selectedIds.map(id => {
		const preset = nativeEffectPresetById(id)
		if (!preset) throw new Error(`Unknown native effect preset: ${id}`)
		const expectedKind = kind === 'shape' ? 'shapeEffect' : 'textEffect'
		if (preset.kind !== expectedKind) throw new Error(`Native effect preset ${id} is not a ${expectedKind} preset`)
		return preset
	})

	const output = { ...style }
	const explicitThreeD = kind === 'shape' ? output.effect3D : output.text3D
	const existingRprChildren = kind === 'text'
		? parseFragmentChildren(output._rawRprChildXmlExact)
		: []
	const embeddedRprEffect = existingRprChildren.find(part => part.tag === 'a:effectLst' || part.tag === 'a:effectDag')?.xml || ''
	const existingEffectParts = kind === 'shape'
		? parseEffectList(output._rawEffectLstXml)
		: parseEffectList(output._rawRprEffectXmlExact || embeddedRprEffect)
	const effects = mapEffectParts(existingEffectParts)
	const existingThreeD = kind === 'shape'
		? splitThreeD(output._rawSpPrScene3dXml)
		: splitThreeD(output._rawBodyPrChildXml)
	let scene3dXml = existingThreeD.scene3dXml
	let sp3dXml = existingThreeD.sp3dXml

	for (const preset of presets) {
		for (const tag of preset.recipe.clearEffectTags || []) effects.delete(tag)
		for (const part of preset.recipe.effectParts || []) effects.set(part.tag, part.xml)
		if (preset.recipe.scenePolicy === 'replace') scene3dXml = preset.recipe.scene3dXml || ''
		else if (preset.recipe.scenePolicy === 'fallback' && !scene3dXml) scene3dXml = preset.recipe.scene3dXml || ''
		if (preset.recipe.sp3dPolicy === 'replace') sp3dXml = preset.recipe.sp3dXml || ''
	}
	if (explicitThreeD && (scene3dXml || sp3dXml)) {
		const merged = applyShape3DOverrides(`${scene3dXml}${sp3dXml}`, explicitThreeD)
		const mergedThreeD = splitThreeD(merged)
		scene3dXml = mergedThreeD.scene3dXml
		sp3dXml = mergedThreeD.sp3dXml
	}
	applyTypedEffectOverrides(effects, output)

	// Shape raw effect lists are authoritative during native serialization but
	// retain the typed fields for semantic export/readback. Text raw run
	// fragments already contain the merged effect list, so remove the duplicate
	// generator inputs and avoid emitting a second run-level effectLst.
	if (kind === 'text') {
		for (const key of ['shadow', 'glow', 'reflection', 'softEdges', 'textShadow', 'textGlow', 'textReflection']) delete output[key]
	}
	if (kind === 'shape' && (scene3dXml || sp3dXml)) {
		// Keep the semantic override alongside the merged native fragment for
		// export/readback. gen-xml treats _rawSpPrScene3dXml as authoritative,
		// so this metadata does not create duplicate scene3d/sp3d nodes.
		if (explicitThreeD !== undefined) output.effect3D = explicitThreeD
		else delete output.effect3D
	}
	if (kind === 'text' && (scene3dXml || sp3dXml)) {
		if (explicitThreeD !== undefined) output.text3D = explicitThreeD
		else delete output.text3D
	}
	const combinedEffects = effectListXml(effects)
	if (kind === 'shape') {
		if (combinedEffects) output._rawEffectLstXml = combinedEffects
		else delete output._rawEffectLstXml
		const combinedThreeD = `${scene3dXml || ''}${sp3dXml || ''}`
		if (combinedThreeD) output._rawSpPrScene3dXml = combinedThreeD
		else delete output._rawSpPrScene3dXml
	} else {
		if (combinedEffects) output._rawRprEffectXmlExact = combinedEffects
		else delete output._rawRprEffectXmlExact
		// Exact WordArt gallery styles carry their fill, outline, and original
		// effect list together in _rawRprChildXmlExact. gen-xml intentionally
		// treats that complete fragment as authoritative, so merely setting a
		// sibling _rawRprEffectXmlExact cannot override the captured effect. Fold
		// the selected Text Effects back into the exact child fragment while
		// preserving every non-effect child and its native order.
		if (existingRprChildren.length) {
			const rebuilt = []
			let effectInserted = false
			for (const part of existingRprChildren) {
				if (part.tag === 'a:effectLst' || part.tag === 'a:effectDag') {
					if (!effectInserted && combinedEffects) rebuilt.push(combinedEffects)
					effectInserted = true
				} else rebuilt.push(part.xml)
			}
			if (!effectInserted && combinedEffects) {
				const fillAndLine = new Set(['a:ln', 'a:noFill', 'a:solidFill', 'a:gradFill', 'a:blipFill', 'a:pattFill', 'a:grpFill'])
				const insertion = rebuilt.findIndex(xml => {
					const tag = parseFragmentChildren(xml)[0]?.tag
					return tag && !fillAndLine.has(tag)
				})
				if (insertion >= 0) rebuilt.splice(insertion, 0, combinedEffects)
				else rebuilt.push(combinedEffects)
			}
			output._rawRprChildXmlExact = rebuilt.join('')
		}
		const combinedBody = [...existingThreeD.other.map(part => part.xml), scene3dXml, sp3dXml].filter(Boolean).join('')
		if (combinedBody) output._rawBodyPrChildXml = combinedBody
		else delete output._rawBodyPrChildXml
	}
	return { style: output, presets }
}

export function applyShapeEffectPresets(style = {}, ids = []) {
	return applyPresets(style, ids, 'shape')
}

export function applyTextEffectPresets(style = {}, ids = []) {
	return applyPresets(style, ids, 'text')
}
