/**
 * HTML is a design authoring surface, not the shipping format.
 * Semantic slide HTML (kinds, regions, colour/type tokens) still ignores CSS
 * left/top/width/height; the layout engine owns inches.
 * A designed 16:9 canvas of `.layer` objects (absolute CSS on a 1600×900 stage)
 * is lowered by the engine into PowerPoint inches. Those rectangles are
 * engine-owned (`_engineRect`), never author JSON bbox/x/y/w/h.
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { HTML_NATIVE_FIRST_CONTRACT, HTML_NATIVE_FIRST_CONTRACT_VERSION, HTML_CSS_MOTION_CONTRACT } from './html-native-first.mjs'
import { parseCssKeyframes, parseCssTime, resolveCssMotion, stripCssKeyframes } from './html-css-motion.mjs'
import { expandAtmosphereSpec } from './atmosphere-compositor.mjs'
import {
	classifyAtmosphereSource,
	cssNativeEquivalentReasons,
	cssUnsupportedEffectReasons,
	detectHtmlSourceModes,
	fallbackPolicyApproves,
	fallbackLedgerEntry,
	fontFaceAvailable,
	fontFamilyStackFromCss,
	svgUnsupportedFilterReasons,
} from './html-representation.mjs'
import { flattenHtmlCueManifest, cueBelongsToSlide, isHtmlRuntimePlayerChrome } from './narration-contract.mjs'

export const HTML_SLIDE_SURFACE_VERSION = 'betterpptx.html-slide-surface.v1'
export { HTML_NATIVE_FIRST_CONTRACT, HTML_NATIVE_FIRST_CONTRACT_VERSION, HTML_CSS_MOTION_CONTRACT }

// DrawingML stores line widths as integer 1/12700-point units.  HTML/CSS
// sources routinely express strokes in pixels, which produces repeating
// decimal point values after the px -> pt conversion.  Quantize at the HTML
// lowering boundary so every native line emitted by this compiler is both
// deterministic and accepted by the public typed-spec validator.
const PPT_LINE_WIDTH_STEP = 1 / 12700
function pptLineWidth(points, fallback = 0) {
	const value = Number(points)
	if (!Number.isFinite(value) || value <= 0) return fallback
	return Math.round(value / PPT_LINE_WIDTH_STEP) * PPT_LINE_WIDTH_STEP
}

const NAMED_WORLDS = new Set([
	'editorial', 'blueprint', 'brutalist', 'mist', 'atelier', 'meridian', 'chalkline',
	'playbook', 'pulse', 'collage', 'observatory', 'storybook', 'candy', 'horizon',
	'mono', 'botanical', 'luxe', 'aurora',
])

const LAYOUT_INTENTS = new Set([
	'title-only', 'title-body', 'title-body-footer', 'two-column', 'three-column',
	'chart-left-insights-right', 'insights-left-chart-right', 'metric-grid', 'comparison',
	'timeline', 'process-flow', 'image-left-copy-right', 'copy-left-image-right',
	'section-divider', 'dense-appendix', 'hero', 'pull-quote', 'sidebar-left', 'sidebar-right',
])

const GEOMETRY_CSS = new Set([
	'left', 'top', 'right', 'bottom', 'width', 'height', 'min-width', 'min-height',
	'max-width', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
	'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
	'inset', 'position', 'transform', 'translate',
	'gap', 'row-gap', 'column-gap', 'flex', 'flex-basis', 'order', 'z-index',
])

function attr(el, name) {
	if (!el || typeof el.getAttribute !== 'function') return ''
	return String(el.getAttribute(name) || '').trim()
}

function classList(el) {
	return attr(el, 'class').split(/\s+/).filter(Boolean)
}

function hasClass(el, name) {
	return classList(el).includes(name)
}

function childrenOf(el) {
	const nodes = el?.childNodes
	if (!nodes || !nodes.length) return []
	const out = []
	for (let i = 0; i < nodes.length; i += 1) if (nodes.item(i).nodeType === 1) out.push(nodes.item(i))
	return out
}

function allNodes(el) {
	const out = []
	const walk = node => {
		if (!node || node.nodeType !== 1) return
		out.push(node)
		for (const child of childrenOf(node)) walk(child)
	}
	walk(el)
	return out
}

function textOf(el) {
	if (!el) return ''
	const parts = []
	const walk = node => {
		if (!node) return
		if (node.nodeType === 3) {
			parts.push(String(node.nodeValue || ''))
			return
		}
		if (node.nodeType !== 1) return
		const tag = String(node.nodeName || '').toLowerCase()
		if (tag === 'br') {
			parts.push('\n')
			return
		}
		if (tag === 'span' && parts.length && !/\s$/.test(parts[parts.length - 1] || '')) parts.push(' ')
		if (['strong', 'em', 'b', 'i', 'a'].includes(tag) && parts.length && !/\s$/.test(parts[parts.length - 1] || '')) parts.push(' ')
		if (tag === 'script' || tag === 'style') return
		const kids = node.childNodes
		if (kids) for (let i = 0; i < kids.length; i += 1) walk(kids.item(i))
		if (['p', 'div', 'h1', 'h2', 'li', 'article', 'section', 'figcaption'].includes(tag)) parts.push('\n')
	}
	walk(el)
	return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
}

function parseColor(value) {
	const raw = String(value || '').trim()
	const hex = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
	if (hex) {
		const h = hex[1]
		if (h.length === 3) return (h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toUpperCase()
		return h.toUpperCase()
	}
	const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
	if (rgb) {
		const hexOf = n => Number(n).toString(16).padStart(2, '0').toUpperCase()
		return `${hexOf(rgb[1])}${hexOf(rgb[2])}${hexOf(rgb[3])}`
	}
	return null
}

function clamp01(value, fallback = 1) {
	const n = Number(value)
	return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}

function cssColorAndTransparency(value, opacity = 1) {
	const raw = String(value || '').trim()
	const color = parseColor(raw)
	if (!color) return null
	const alpha = raw.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/i)
	const effectiveAlpha = clamp01(alpha?.[1], 1) * clamp01(opacity, 1)
	return { color, transparency: round4((1 - effectiveAlpha) * 100) }
}

function parseAllCssDeclarations(styleAttr) {
	const out = {}
	for (const part of String(styleAttr || '').split(';')) {
		const idx = part.indexOf(':')
		if (idx < 0) continue
		const prop = part.slice(0, idx).trim().toLowerCase()
		const value = part.slice(idx + 1).trim()
		if (prop && value) out[prop] = value
	}
	return out
}

function parseCssDeclarations(styleAttr) {
	const out = {}
	for (const part of String(styleAttr || '').split(';')) {
		const idx = part.indexOf(':')
		if (idx < 0) continue
		const prop = part.slice(0, idx).trim().toLowerCase()
		const value = part.slice(idx + 1).trim()
		if (!prop || !value || GEOMETRY_CSS.has(prop)) continue
		out[prop] = value
	}
	return out
}

function fontFaceFromCss(value) {
	const raw = String(value || '').trim()
	if (!raw) return null
	const declaredStack = fontFamilyStackFromCss(raw)
	const availableFace = declaredStack.find(face => fontFaceAvailable(face))
	if (availableFace) return availableFace
	const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i
	const quoted = raw.match(/['"]([^'"]+)['"]/)
	if (quoted && !generic.test(quoted[1])) return quoted[1]
	const firstFamily = raw.split(',')[0].trim()
	const tokens = firstFamily.split(/\s+/).map(part => part.replace(/^['"]|['"]$/g, '')).filter(Boolean)
	for (let i = tokens.length - 1; i >= 0; i -= 1) {
		const token = tokens[i]
		if (!token || generic.test(token)) continue
		if (/^\d/.test(token) || /[\/%]/.test(token)) continue
		if (/^(normal|italic|oblique|bold|bolder|lighter|inherit|initial)$/i.test(token)) continue
		return token
	}
	return null
}

function parseStyleSheet(markup) {
	const rules = { __descendants: [], __keyframes: parseCssKeyframes(markup), __fontStacks: [] }
	const text = String(markup || '')
	const styleBlocks = text.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []
	for (const block of styleBlocks) {
		const inner = stripCssKeyframes(block.replace(/^<style\b[^>]*>/i, '').replace(/<\/style>$/i, '').replace(/\/\*[\s\S]*?\*\//g, ''))
		for (const chunk of inner.split('}')) {
			const idx = chunk.indexOf('{')
			if (idx < 0) continue
			const selectors = chunk.slice(0, idx).trim()
			const decls = parseCssDeclarations(chunk.slice(idx + 1).replace(/\n/g, ';'))
			if (!selectors || !Object.keys(decls).length) continue
			const stack = fontFamilyStackFromCss(decls['font-family'] || decls.font)
			if (stack.length) rules.__fontStacks.push({ selector: selectors, stack })
			for (const selector of selectors.split(',')) {
				const trimmed = selector.trim()
				const simple = trimmed.match(/^\.([A-Za-z0-9_-]+)$/)
				if (simple) {
					rules[simple[1]] = { ...(rules[simple[1]] || {}), ...decls }
					continue
				}
				const tagged = trimmed.match(/^\.([A-Za-z0-9_-]+)\s+(h[1-6]|button|p|span|strong|em|article|svg)$/i)
				if (tagged) {
					rules.__descendants.push({ ancestor: tagged[1], targetTag: tagged[2].toLowerCase(), decls })
					continue
				}
				const nested = trimmed.match(/^\.([A-Za-z0-9_-]+)\s+\.([A-Za-z0-9_-]+)$/)
				if (nested) rules.__descendants.push({ ancestor: nested[1], targetClass: nested[2], decls })
			}
		}
	}
	return rules
}

function mergedDeclarations(el, classStyles = {}) {
	const merged = {}
	const descendants = Array.isArray(classStyles.__descendants) ? classStyles.__descendants : []
	if (descendants.length) {
		const ancestorClasses = new Set()
		let node = el?.parentNode
		while (node && node.nodeType === 1) {
			for (const name of classList(node)) ancestorClasses.add(name)
			node = node.parentNode
		}
		const tag = String(el?.nodeName || '').toLowerCase()
		for (const rule of descendants) {
			if (!ancestorClasses.has(rule.ancestor)) continue
			if (rule.targetTag && rule.targetTag !== tag) continue
			if (rule.targetClass && !hasClass(el, rule.targetClass)) continue
			Object.assign(merged, rule.decls)
		}
	}
	for (const name of classList(el)) {
		if (name.startsWith('__')) continue
		Object.assign(merged, classStyles[name] || {})
	}
	return { ...merged, ...parseCssDeclarations(attr(el, 'style')) }
}

function cssFontSizeHint(css) {
	const blob = `${css['font-size'] || ''} ${css.font || ''}`
	const vw = blob.match(/(\d+(?:\.\d+)?)\s*vw/i)
	if (vw) return { vw: Number(vw[1]) }
	const px = blob.match(/(\d+(?:\.\d+)?)\s*px/i)
	if (px) return { px: Number(px[1]) }
	return {}
}

function isGiantType(css) {
	const hint = cssFontSizeHint(css)
	return (Number.isFinite(hint.vw) && hint.vw >= 3.5) || (Number.isFinite(hint.px) && hint.px >= 40)
}

function firstNumericText(el) {
	const raw = firstTextNode(el) || textOf(el).split('\n')[0]
	const value = String(raw || '').trim()
	return /^\$?\s*\d[\d.,]*%?$/.test(value) ? value : ''
}

function looksLikeMoney(el) {
	return /^\$\s*\d[\d.,]*$/.test(textOf(el).trim())
}

function looksLikeAmountEl(el) {
	return hasClass(el, 'amt') || hasClass(el, 'amount') || hasClass(el, 'price') || looksLikeMoney(el)
}

function isActionControl(el, classStyles = {}) {
	if (hasClass(el, 'pill') || hasClass(el, 'type-pay') || hasClass(el, 'chip')) return true
	if (String(el.nodeName || '').toLowerCase() !== 'button') return false
	const css = mergedDeclarations(el, classStyles)
	const fillRaw = css.background || css['background-color'] || ''
	const radius = String(css['border-radius'] || '')
	if (/^999(px|%)?$/i.test(radius) || parseColor(fillRaw)) return true
	if (/^(none|transparent)$/i.test(fillRaw) && parseColor(css.color)) return true
	return false
}

function isTypeAction(el, classStyles = {}) {
	if (hasClass(el, 'type-pay')) return true
	if (String(el.nodeName || '').toLowerCase() !== 'button') return false
	const fillRaw = mergedDeclarations(el, classStyles).background || mergedDeclarations(el, classStyles)['background-color'] || ''
	return /^(none|transparent)$/i.test(fillRaw)
}

function looksLikePlot(el) {
	if (hasClass(el, 'plot') || hasClass(el, 'chart')) return true
	const tag = String(el.nodeName || '').toLowerCase()
	if (tag === 'section' || hasClass(el, 'slide')) return false
	const kids = childrenOf(el)
	return kids.filter(node => hasClass(node, 'bar') || hasClass(node, 'bars') || hasClass(node, 'row')).length >= 2
}

function looksLikeRule(el) {
	return hasClass(el, 'rule') || hasClass(el, 'divider') || hasClass(el, 'hairline')
}

function looksLikeIll(el, classStyles = {}) {
	if (!el) return false
	if (looksLikeRule(el)) return false
	if (hasClass(el, 'ill') || hasClass(el, 'swatch') || hasClass(el, 'panel')) return true
	if (String(el.nodeName || '').toLowerCase() !== 'div') return false
	const fill = parseColor(mergedDeclarations(el, classStyles).background || mergedDeclarations(el, classStyles)['background-color'])
	return Boolean(fill) && !textOf(el)
}

function looksLikePayCluster(el, classStyles = {}) {
	if (!el || looksLikeRoomCard(el)) return false
	const kids = childrenOf(el)
	return hasClass(el, 'pay') || (
		kids.some(child => looksLikeAmountEl(child)) && kids.some(child => isActionControl(child, classStyles))
	)
}

function parseBorderColor(css) {
	const raw = String(css?.border || css?.['border-color'] || css?.['border-top'] || css?.['border-left'] || '')
	const hex = raw.match(/#([0-9a-f]{3,8})\b/i)
	if (hex) return parseColor(`#${hex[1]}`)
	return parseColor(raw)
}

function surfaceChrome(el, used, region, group, classStyles = {}) {
	const css = mergedDeclarations(el, classStyles)
	const style = styleTokensFrom(el, classStyles)
	const fill = style.fill
	const lineColor = parseBorderColor(css)
	if (!fill && !lineColor) return null
	return {
		kind: 'shape',
		name: uniqueName('chrome', used),
		...(region ? { region } : {}),
		stackGroup: group,
		clusterHost: true,
		decorative: true,
		style: {
			fill: fill || { color: 'FFFFFF', transparency: 100 },
			line: lineColor
				? { color: lineColor, width: pptLineWidth(1.15) }
				: { color: fill?.color || 'FFFFFF', transparency: 100, width: 0 },
			rectRadius: style.rectRadius || 0.12,
		},
		// Cluster chrome is a visual support layer, not a reading-order object.
		// Decorative=true and altText/title are mutually exclusive in the native
		// accessibility contract; keeping this layer genuinely decorative avoids
		// a compile-time failure while preserving the semantic child content.
	}
}

function roomClusterKey(el) {
	const heading = childrenOf(el).find(child => /^h[23]$/i.test(child.nodeName || ''))
	const key = textOf(heading).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
	return key || 'card'
}

function looksLikeRoomCard(el) {
	if (hasClass(el, 'room') || hasClass(el, 'card')) return true
	if (String(el.nodeName || '').toLowerCase() !== 'article') return false
	const kids = childrenOf(el)
	return kids.some(child => /^h[23]$/i.test(child.nodeName || '')) && kids.some(child => String(child.nodeName || '').toLowerCase() === 'p')
}

function columnCountFromCss(el, classStyles = {}) {
	const raw = String(mergedDeclarations(el, classStyles)['grid-template-columns'] || '').trim()
	if (!raw) return 0
	const repeat = raw.match(/repeat\(\s*(\d+)/i)
	if (repeat) return Number(repeat[1])
	const parts = raw.split(/\s+/).filter(part => part && part !== 'none')
	return parts.length >= 2 ? parts.length : 0
}

function inheritedColor(el, classStyles = {}) {
	let node = el
	while (node && node.nodeType === 1) {
		const color = parseColor(mergedDeclarations(node, classStyles).color)
		if (color) return color
		node = node.parentNode
	}
	return null
}

function styleTokensFrom(el, classStyles = {}) {
	const css = mergedDeclarations(el, classStyles)
	const style = {}
	const fillRaw = css.background || css['background-color']
	const fill = parseColor(fillRaw)
	const color = parseColor(css.color) || inheritedColor(el.parentNode, classStyles)
	const fontBlob = `${css['font-family'] || ''} ${css.font || ''}`
	const fontFace = fontFaceFromCss(css['font-family'] || css.font)
	const weight = String(css['font-weight'] || css.font || '')
	const radius = String(css['border-radius'] || '')
	if (fill) style.fill = { color: fill }
	else if (/^(none|transparent)$/i.test(String(fillRaw || ''))) style.fill = { color: 'FFFFFF', transparency: 100 }
	if (color) style.color = color
	if (fontFace) style.fontFace = fontFace
	if (css['font-style'] === 'italic' || /\bitalic\b/i.test(String(css.font || '')) || /\bitalic\b/i.test(fontBlob)) style.italic = true
	if (weight === 'bold' || Number.parseInt(weight, 10) >= 600 || /\bbold\b/i.test(String(css.font || ''))) style.bold = true
	if (/\b(200|300|light)\b/i.test(weight) || /light/i.test(fontFace || '')) style.bold = false
	if (/^999(px|%)?$/i.test(radius) || /pill|capsule/.test(attr(el, 'class'))) style.rectRadius = 0.45
	else if (radius) {
		const num = Number.parseFloat(radius)
		if (Number.isFinite(num)) {
			if (/vw|vh/i.test(radius)) style.rectRadius = Math.min(0.28, Math.max(0.08, num * 0.08))
			else if (/rem|em/i.test(radius)) style.rectRadius = Math.min(0.45, Math.max(0.06, num * 0.12))
			else if (/px/i.test(radius)) style.rectRadius = Math.min(0.45, Math.max(0.06, num / 72))
		}
	}
	if (css['text-align'] === 'left' || css['text-align'] === 'center' || css['text-align'] === 'right') style.align = css['text-align']
	return style
}

const KIND_ALIASES = Object.freeze({
	title: 'title',
	text: 'body',
	textbox: 'textBox',
	textshape: 'textShape',
	shape: 'shape',
	body: 'body',
	quote: 'quote',
	stat: 'stat',
	kpi: 'kpi',
	'chart-panel': 'chart-panel',
	chart: 'chart-panel',
	process: 'process',
	equation: 'equation',
	comparison: 'comparison',
	customgeometry: 'customGeometry',
	'custom-geometry': 'customGeometry',
	svg: 'customGeometry',
	freeform: 'customGeometry',
	image: 'image',
	picture: 'image',
	'content-image': 'image',
	line: 'customGeometry',
	'native-background': 'native-background',
})

const TWO_COL_CLASS = /^(grid2|grid2col|mono-grid|obs-grid|ed-body|bl|two-col|cols-2|soak|hold-grid)$/
const THREE_COL_CLASS = /^(rooms|cards|grid3|three-col|cols-3)$/
const COLUMN_TITLE_REGIONS = new Set(['left', 'right', 'leftThird', 'midThird', 'rightThird', 'leftOneThird', 'rightTwoThirds', 'leftTwoThirds', 'rightOneThird'])
const WORLD_CLASS_ALIASES = Object.freeze({
	obs: 'observatory',
	story: 'storybook',
	blue: 'blueprint',
	ed: 'editorial',
	chalk: 'chalkline',
})
const WORLD_CANVAS = Object.freeze({
	mono: 'FFFFFF',
	editorial: 'F7F3EA',
	observatory: '0D1321',
	storybook: 'FFF6E8',
	blueprint: '070B12',
	botanical: 'F4EFE4',
	chalkline: 'F4F0E6',
	atelier: 'F6EFE4',
	brutalist: '111111',
	mist: 'EEF2F6',
	luxe: '0B0B0B',
})
const BODY_CLASS = /^(lede|note|read|vote)$/

const WORLD_HEADING = Object.freeze({
	mono: { fontFace: 'Segoe UI Light', fontSize: 32, bold: false },
	editorial: { fontFace: 'Georgia', fontSize: 28, italic: true, bold: false },
	observatory: { fontFace: 'Segoe UI Semibold', fontSize: 22, bold: true },
	storybook: { fontFace: 'Segoe Print', fontSize: 28, bold: false },
	blueprint: { fontFace: 'Consolas', fontSize: 22, bold: false },
	brutalist: { fontFace: 'Arial Black', fontSize: 28, bold: true },
	mist: { fontFace: 'Calibri Light', fontSize: 28, bold: false },
	atelier: { fontFace: 'Georgia', fontSize: 28, italic: true, bold: false },
	meridian: { fontFace: 'Calibri', fontSize: 26, bold: false },
	chalkline: { fontFace: 'Segoe UI', fontSize: 26, bold: false },
	playbook: { fontFace: 'Segoe UI Semibold', fontSize: 26, bold: true },
	pulse: { fontFace: 'Segoe UI', fontSize: 26, bold: true },
	collage: { fontFace: 'Georgia', fontSize: 28, bold: false },
	candy: { fontFace: 'Segoe UI', fontSize: 28, bold: true },
	horizon: { fontFace: 'Calibri Light', fontSize: 28, bold: false },
	botanical: { fontFace: 'Georgia', fontSize: 28, italic: true, bold: false },
	luxe: { fontFace: 'Georgia', fontSize: 28, bold: false },
	aurora: { fontFace: 'Segoe UI Light', fontSize: 28, bold: false },
})

function inferKind(el, classStyles = {}) {
	const tag = String(el.nodeName || '').toLowerCase()
	if (tag === 'img' || hasClass(el, 'picture') || hasClass(el, 'content-image')) return 'image'
	const explicit = attr(el, 'data-kind').toLowerCase()
	if (explicit && KIND_ALIASES[explicit]) return KIND_ALIASES[explicit]
	if (explicit) return explicit
	if (tag === 'h1') return 'title'
	if (tag === 'h2' && (looksLikeRoomCard(el.parentNode) || hasClass(el.parentNode, 'room') || hasClass(el.parentNode, 'card'))) return null
	if (looksLikeRule(el)) return 'shape'
	if (tag === 'svg') return svgMarkupHasSupportedVectors(serializeSvg(el)) ? 'customGeometry' : 'image'
	if (tag === 'blockquote' || hasClass(el, 'quote')) return 'quote'
	if (isActionControl(el, classStyles) || looksLikeAmountEl(el)) return 'textShape'
	if (hasClass(el, 'stat') || hasClass(el, 'kpi') || attr(el, 'data-stat') || hasClass(el, 'n') || (firstNumericText(el) && isGiantType(mergedDeclarations(el, classStyles)))) return 'stat'
	if (looksLikePlot(el) || (tag === 'figure' && (hasClass(el, 'chart') || attr(el, 'data-chart-type')))) {
		return jsonPayload(el) || attr(el, 'data-kind') === 'chart-panel' ? 'chart-panel' : 'htmlSketch'
	}
	if (tag === 'ol' && (hasClass(el, 'process') || attr(el, 'data-process') || childrenOf(el).some(child => String(child.nodeName || '').toLowerCase() === 'li'))) return 'process'
	if (hasClass(el, 'equation') || hasClass(el, 'eq') || tag === 'math') return 'equation'
	if (hasClass(el, 'cap') || hasClass(el, 'sub') || hasClass(el, 'flag')) return null
	if (hasClass(el, 'kicker') || hasClass(el, 'vote')) return 'body'
	if (BODY_CLASS.test(attr(el, 'class')) || (tag === 'p' && inferredRegion(el, classStyles))) return 'body'
	if (looksLikeIll(el, classStyles)) return 'shape'
	if (looksLikeRoomCard(el)) return 'textShape'
	if (tag === 'article' && !hasClass(el, 'pay')) return 'textShape'
	return null
}

function columnCountFromStyle(el) {
	return columnCountFromCss(el, {})
}

function columnRegionFromParent(parent, childIndex, classStyles = {}) {
	const names = classList(parent)
	const columns = columnCountFromCss(parent, classStyles)
	if (names.some(name => TWO_COL_CLASS.test(name)) || columns === 2) {
		if (childIndex === 0) return 'left'
		if (childIndex === 1) return 'right'
		return null
	}
	if (names.some(name => THREE_COL_CLASS.test(name)) || columns === 3) {
		return ['leftThird', 'midThird', 'rightThird'][childIndex] || null
	}
	return null
}

function inferredRegion(el, classStyles = {}) {
	const explicit = attr(el, 'data-region')
	if (explicit) return explicit
	let node = el
	while (node && node.parentNode && node.parentNode.nodeType === 1) {
		const parent = node.parentNode
		const kids = childrenOf(parent)
		const index = kids.indexOf(node)
		if (index >= 0) {
			const fromGrid = columnRegionFromParent(parent, index, classStyles)
			if (fromGrid) return fromGrid
		}
		const parentRegion = attr(parent, 'data-region')
		if (parentRegion) return parentRegion
		node = parent
	}
	return null
}

function headingStyleForWorld(world, existing = {}) {
	const heading = WORLD_HEADING[world] || { fontSize: 28, bold: false }
	return {
		...heading,
		...existing,
		fontSize: existing.fontSize || heading.fontSize || 28,
	}
}

function asColumnHeadline(block, kind, region, world) {
	if (kind !== 'title' && kind !== 'quote') return block
	if (!COLUMN_TITLE_REGIONS.has(region)) return block
	return {
		...block,
		kind: 'textBox',
		role: 'headline',
		region,
		style: headingStyleForWorld(world, block.style || {}),
	}
}

function inferLayout(section, classStyles = {}) {
	const explicit = attr(section, 'data-layout')
	if (LAYOUT_INTENTS.has(explicit)) return explicit
	const kinds = []
	const walk = el => {
		const kind = inferKind(el, classStyles)
		if (kind) kinds.push(kind)
		for (const child of childrenOf(el)) walk(child)
	}
	walk(section)
	const rooms = allNodes(section).some(node => classList(node).some(name => THREE_COL_CLASS.test(name)) || columnCountFromCss(node, classStyles) === 3)
	const twoCol = allNodes(section).some(node => classList(node).some(name => TWO_COL_CLASS.test(name)) || columnCountFromCss(node, classStyles) === 2)
	if (kinds.includes('chart-panel') || kinds.includes('htmlSketch')) return 'chart-left-insights-right'
	if (rooms && !kinds.includes('process')) return 'three-column'
	if (kinds.includes('process')) return 'process-flow'
	if (kinds.includes('equation')) return 'two-column'
	if (kinds.includes('stat') || kinds.includes('kpi')) return 'two-column'
	if (kinds.includes('textShape')) return 'comparison'
	if (twoCol) return 'two-column'
	return 'title-body'
}

function inferWorld(section) {
	const explicit = attr(section, 'data-world').toLowerCase()
	if (NAMED_WORLDS.has(explicit)) return explicit
	for (const name of classList(section)) {
		if (NAMED_WORLDS.has(name)) return name
		if (WORLD_CLASS_ALIASES[name]) return WORLD_CLASS_ALIASES[name]
	}
	return null
}

function inferMode(section, background) {
	const explicit = attr(section, 'data-mode').toLowerCase()
	if (explicit === 'dark' || explicit === 'light') return explicit
	const hex = parseColor(background) || parseColor(parseCssDeclarations(attr(section, 'style')).background)
	if (!hex) return null
	const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 110 ? 'dark' : 'light'
}

function jsonPayload(el) {
	const raw = attr(el, 'data-chart') || attr(el, 'data-json')
	if (raw) {
		try { return JSON.parse(raw) } catch { return null }
	}
	for (const child of childrenOf(el)) {
		if (String(child.nodeName || '').toLowerCase() === 'script' && /json/i.test(attr(child, 'type'))) {
			try { return JSON.parse(textOf(child) || child.textContent || '') } catch { return null }
		}
	}
	return null
}

function uniqueName(base, used) {
	const safe = String(base || 'block').replace(/[^A-Za-z0-9._:-]/g, '-').replace(/^-+/, '') || 'block'
	let name = safe
	let n = 2
	while (used.has(name)) {
		name = `${safe}-${n}`
		n += 1
	}
	used.add(name)
	return name
}

function inferredName(el, kind) {
	const explicit = attr(el, 'data-name') || attr(el, 'id')
	if (explicit) return explicit
	const preferred = ['plot', 'lock', 'pill', 'type-pay', 'amt', 'n', 'room', 'eq', 'lede', 'note', 'kicker', 'vote', 'flag', 'cap', 'read', 'sub', 'chip', 'card']
	for (const name of preferred) if (hasClass(el, name)) return name
	const named = classList(el).find(name => !['slide', 'on', 'off', 'btn'].includes(name) && !TWO_COL_CLASS.test(name) && !THREE_COL_CLASS.test(name))
	if (named) return named
	const tag = String(el.nodeName || '').toLowerCase()
	if (tag === 'h1') return 'headline'
	if (tag === 'svg') return 'diagram'
	if (tag === 'button') return 'action'
	return kind
}

const HTML_STAGE = Object.freeze({ wPx: 1600, hPx: 900, wIn: 13.333, hIn: 7.5 })

function round4(n) {
	return Math.round(Number(n) * 10000) / 10000
}

function pxFromStyle(styleAttr, prop) {
	const match = String(styleAttr || '').match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(-?[\\d.]+)(px)?`, 'i'))
	return match ? Number(match[1]) : null
}

function pxBoxFromStyle(styleAttr) {
	const left = pxFromStyle(styleAttr, 'left')
	const top = pxFromStyle(styleAttr, 'top')
	const width = pxFromStyle(styleAttr, 'width')
	const height = pxFromStyle(styleAttr, 'height')
	if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
	return { left, top, width, height }
}

function cssLengthPx(value, reference) {
	const raw = String(value || '').trim()
	const match = raw.match(/^(-?[\d.]+)(px|%)?$/i)
	if (!match) return null
	const n = Number(match[1])
	if (!Number.isFinite(n)) return null
	return match[2] === '%' ? n * Number(reference || 0) / 100 : n
}

function nestedPxBox(parent, child) {
	const outer = pxBoxFromStyle(attr(parent, 'style'))
	if (!outer) return null
	const css = parseAllCssDeclarations(attr(child, 'style'))
	const left = cssLengthPx(css.left ?? '0', outer.width)
	const top = cssLengthPx(css.top ?? '0', outer.height)
	const width = cssLengthPx(css.width ?? '100%', outer.width)
	const height = cssLengthPx(css.height ?? '100%', outer.height)
	if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
	return { left: outer.left + left, top: outer.top + top, width, height }
}

function engineRectFromPx(box, stage = HTML_STAGE) {
	return {
		x: round4(box.left * (stage.wIn / stage.wPx)),
		y: round4(box.top * (stage.hIn / stage.hPx)),
		w: round4(box.width * (stage.wIn / stage.wPx)),
		h: round4(box.height * (stage.hIn / stage.hPx)),
	}
}

function detectHtmlStage(markup) {
	const text = String(markup || '')
	const cssW = text.match(/--stage-w\s*:\s*(\d+)px/i)
	const cssH = text.match(/--stage-h\s*:\s*(\d+)px/i)
	const idStage = text.match(/#stage\s*\{[^}]*width\s*:\s*(\d+)px[^}]*height\s*:\s*(\d+)px/i)
	const wPx = Number(cssW?.[1] || idStage?.[1] || HTML_STAGE.wPx)
	const hPx = Number(cssH?.[1] || idStage?.[2] || HTML_STAGE.hPx)
	if (!Number.isFinite(wPx) || !Number.isFinite(hPx) || wPx < 320 || hPx < 180) return { ...HTML_STAGE }
	return { wPx, hPx, wIn: HTML_STAGE.wIn, hIn: HTML_STAGE.hIn }
}

function isCanvasSlide(section) {
	return allNodes(section).some(el => hasClass(el, 'layer') && pxBoxFromStyle(attr(el, 'style')))
}

function withEngineRect(block, el, stage) {
	if (!block) return block
	const box = pxBoxFromStyle(attr(el, 'style'))
	if (!box) return block
	return { ...block, _engineOwnedGeometry: true, _engineRect: engineRectFromPx(box, stage) }
}

function withNestedEngineRect(block, parent, child, stage) {
	if (!block) return block
	const box = nestedPxBox(parent, child)
	if (!box) return withEngineRect(block, parent, stage)
	return { ...block, _engineOwnedGeometry: true, _engineRect: engineRectFromPx(box, stage) }
}

function resolveHtmlAsset(src, assetMap = {}) {
	const raw = String(src || '').trim().replace(/\\/g, '/')
	if (!raw) return null
	if (assetMap[raw]) return assetMap[raw]
	const noQuery = raw.split('?')[0]
	if (assetMap[noQuery]) return assetMap[noQuery]
	const base = noQuery.split('/').pop()
	if (base && assetMap[base]) return assetMap[base]
	if (base && assetMap[`images/${base}`]) return assetMap[`images/${base}`]
	return null
}

function svgStopColor(el) {
	const xml = serializeSvg(el)
	const match = xml.match(/stop-color="(#[0-9A-Fa-f]{3,8})"/)
	return match ? parseColor(match[1]) : null
}

function canvasFontStyle(el, classStyles = {}) {
	const style = styleTokensFrom(el, classStyles)
	const span = childrenOf(el).find(child => String(child.nodeName || '').toLowerCase() === 'span')
	const spanCss = span ? parseCssDeclarations(attr(span, 'style')) : {}
	const css = { ...mergedDeclarations(el, classStyles), ...spanCss }
	const color = parseColor(css.color) || style.color
	const requestedFontCss = css['font-family'] || css.font
	let fontFace = fontFaceFromCss(requestedFontCss) || style.fontFace
	const px = cssFontSizeHint(css).px
	const next = { ...style }
	if (color) next.color = color
	if (fontFace) next.fontFace = fontFace
	// CSS pixels are 96 dpi while PowerPoint points are 72 dpi. Preserve the
	// designed size exactly at the HTML boundary instead of applying the older
	// conservative 0.6 shrink factor; faithful canvases already provide their
	// own line boxes and should not be re-typeset by the semantic layout engine.
	if (Number.isFinite(px)) next.fontSize = Math.max(8, round4(px * 0.75))
	if (!next.fill) next.fill = { color: 'FFFFFF', transparency: 100 }
	if (!next.align) next.align = css['text-align'] || 'left'
	next.margin = 0
	next.wrap = false
	next.fit = 'none'
	const weight = String(css['font-weight'] || '')
	const numericWeight = Number.parseInt(weight, 10)
	if (/\binter\b/i.test(String(requestedFontCss || '')) && !fontFaceAvailable('Inter') && Number.isFinite(px) && fontFaceAvailable('Arial')) {
		// PowerPoint's Segoe UI metrics are substantially wider than browser Inter
		// for these exported line boxes. Arial is the next declared CSS fallback and
		// keeps the authored widths stable when paired with this calibrated scale.
		fontFace = 'Arial'
		next.fontFace = fontFace
		next.fontSize = Math.max(8, round4(px * 0.6))
	}
	// Browser fallback for the source's heavy Inter Display headings is much
	// closer to Arial Black than PowerPoint's generic missing-font substitute.
	// Select the installed face explicitly so weight and width stay stable.
	if (/\binter display\b/i.test(String(requestedFontCss || '')) && numericWeight >= 800 && !fontFaceAvailable('Inter Display') && fontFaceAvailable('Arial Black')) {
		fontFace = 'Arial Black'
		next.fontFace = fontFace
		// Arial Black is the installed deterministic substitute, but its PowerPoint
		// metrics are materially wider than Inter Display. This calibrated scale
		// preserves the source line widths while keeping the text fully editable.
		if (Number.isFinite(px)) next.fontSize = Math.max(8, round4(px * 0.53))
	}
	if (weight === 'bold' || Number.parseInt(weight, 10) >= 600) next.bold = true
	return next
}

function inheritedTextTransform(el, classStyles = {}) {
	const span = childrenOf(el).find(child => String(child.nodeName || '').toLowerCase() === 'span')
	let node = span || el
	while (node && node.nodeType === 1) {
		const value = String(mergedDeclarations(node, classStyles)['text-transform'] || '').trim().toLowerCase()
		if (value && value !== 'inherit' && value !== 'initial' && value !== 'unset') return value
		node = node.parentNode
	}
	return ''
}

function canvasDisplayText(el, value, classStyles = {}) {
	const text = String(value || '').replace(/\s+/g, ' ').trim()
	const transform = inheritedTextTransform(el, classStyles)
	if (transform === 'uppercase') return text.toLocaleUpperCase()
	if (transform === 'lowercase') return text.toLocaleLowerCase()
	if (transform === 'capitalize') return text.replace(/(^|[\s\-–—/])([\p{L}\p{N}])/gu, (_match, lead, letter) => `${lead}${letter.toLocaleUpperCase()}`)
	return text
}

function canvasTransition(section) {
	const type = attr(section, 'data-transition').toLowerCase() || 'fade'
	const durationMs = Number(attr(section, 'data-duration'))
	const mapped = type.startsWith('push') ? 'push' : type.startsWith('wipe') ? 'wipe' : type || 'fade'
	const direction = type.match(/(?:push|wipe)[-_](left|right|up|down)$/)?.[1]
	return {
		type: mapped,
		...(direction ? { direction } : {}),
		advanceOnClick: false,
		...(Number.isFinite(durationMs) && durationMs > 0 ? { advanceAfterTime: Math.round(durationMs) } : {}),
	}
}

function serializeSvg(el) {
	try {
		return new XMLSerializer().serializeToString(el)
	} catch {
		return ''
	}
}

function stripUnsupportedSvgFilters(el) {
	let clone
	try { clone = el.cloneNode(true) } catch { return '' }
	const drop = []
	for (const node of allNodes(clone)) {
		const name = svgLocalName(node)
		if (name === 'filter' || name.startsWith('fe') || name === 'clippath' || name === 'mask') drop.push(node)
	}
	for (const node of drop) {
		try { node.parentNode?.removeChild(node) } catch { /* keep remaining vectors */ }
	}
	for (const node of allNodes(clone)) {
		if (typeof node.removeAttribute !== 'function') continue
		for (const key of ['filter', 'clip-path', 'mask']) {
			if (attr(node, key)) node.removeAttribute(key)
		}
	}
	return serializeSvg(clone)
}

function cssBoxShadowToNative(css = {}) {
	const blob = `${css['box-shadow'] || ''} ${css.filter || ''} ${css['-webkit-filter'] || ''}`
	if (!css['box-shadow'] && !/drop-shadow/i.test(`${css.filter || ''} ${css['-webkit-filter'] || ''}`)) return null
	const rgba = blob.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
	const px = [...blob.matchAll(/(-?\d+(?:\.\d+)?)px/gi)].map(item => Number(item[1]))
	const hex = rgba
		? [rgba[1], rgba[2], rgba[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
		: '000000'
	return {
		type: 'outer',
		color: hex,
		blur: Math.max(2, (px[2] || px[1] || 8) * 0.35),
		offset: Math.abs(px[1] || 3),
		opacity: 0.4,
	}
}

function cssBlurToNative(css = {}, svg = '') {
	const blob = `${css.filter || ''} ${css['-webkit-filter'] || ''} ${svg || ''}`
	const cssPx = blob.match(/blur\(\s*([\d.]+)px/i)
	const std = String(svg || '').match(/feGaussianBlur[^>]*stdDeviation=["']([\d.]+)/i)
	const px = Number(cssPx?.[1] || std?.[1] || 0)
	if (!px) return null
	return { radiusPt: Math.max(1, px * 0.75), grow: true }
}

function cssBlendToNative(css = {}) {
	const mode = String(css['mix-blend-mode'] || '').toLowerCase()
	if (!mode || mode === 'normal') return null
	return {
		blendMode: mode,
		fill: { type: 'solid', color: '102A43', transparency: 0.28 },
	}
}

function cssBorderToNative(css = {}, opacity = 1) {
	const raw = String(css.border || '')
	const widthRaw = css['border-width'] || raw.match(/(-?[\d.]+)px/i)?.[1]
	const widthPx = Number.parseFloat(widthRaw || '0')
	const colorRaw = css['border-color'] || raw.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0]
	const parsed = cssColorAndTransparency(colorRaw, opacity)
	if (!parsed || !Number.isFinite(widthPx) || widthPx <= 0) {
		return { color: parsed?.color || 'FFFFFF', transparency: 100, width: 0 }
	}
	return { ...parsed, width: pptLineWidth(widthPx * 0.75) }
}

function cssBoxShapeName(css = {}, box = null) {
	const radius = String(css['border-radius'] || '').trim()
	if (/^50%$/.test(radius) && box && Math.abs(box.width - box.height) <= 1) return 'ellipse'
	if (Number.parseFloat(radius) > 0 || /%|pill|round/i.test(radius)) return 'roundRect'
	return 'rect'
}

function cssBoxShapeSpec(el, classStyles = {}, boxOverride = null) {
	const css = { ...mergedDeclarations(el, classStyles), ...parseAllCssDeclarations(attr(el, 'style')) }
	const opacity = clamp01(css.opacity, 1)
	const fillRaw = css.background || css['background-color']
	const fill = cssColorAndTransparency(fillRaw, opacity)
	const line = cssBorderToNative(css, opacity)
	const nativeBlur = cssBlurToNative(css)
	const nativeFillOverlay = cssBlendToNative(css)
	const nativeShadow = cssBoxShadowToNative(css)
	if (!fill && !nativeBlur && !nativeFillOverlay && !nativeShadow && line.width <= 0) return null
	const box = boxOverride || pxBoxFromStyle(attr(el, 'style'))
	const radius = String(css['border-radius'] || '')
	const style = {
		fill: fill || { color: 'FFFFFF', transparency: 100 },
		line,
		...(radius ? { rectRadius: /^50%$/.test(radius) ? 0.5 : Math.max(0.01, Math.min(0.5, Number.parseFloat(radius) / 72 || 0.12)) } : {}),
		...(nativeBlur ? { blur: nativeBlur } : {}),
		...(nativeFillOverlay ? { fillOverlay: nativeFillOverlay } : {}),
		...(nativeShadow ? { shadow: nativeShadow } : {}),
	}
	return {
		kind: 'shape',
		shapeName: cssBoxShapeName(css, box),
		style,
		decorative: true,
		keep: true,
		noFrame: true,
		nativeComponents: [
			...(fill ? ['solid-fill'] : []),
			...(line.width > 0 ? ['line'] : []),
			...(nativeBlur ? ['native-blur'] : []),
			...(nativeFillOverlay ? ['native-fill-overlay'] : []),
			...(nativeShadow ? ['native-shadow'] : []),
		],
	}
}

function nestedCssSupportShape(el, classStyles = {}) {
	for (const child of allNodes(el).slice(1)) {
		const box = nestedPxBox(el, child)
		if (!box) continue
		const spec = cssBoxShapeSpec(child, classStyles, box)
		if (spec) return { child, box, spec }
	}
	return null
}

function splitAtmosphereReasons(reasons = []) {
	const nodes = reasons.map(source => classifyAtmosphereSource(source))
	const native = nodes.filter(node => node.status === 'exact-native' || node.status === 'native-approximation')
	const remainder = nodes.filter(node => node.status === 'minimal-fallback' || node.status === 'unresolved')
	const preserved = nodes.filter(node => node.status === 'native-preserved')
	return { nodes, native, remainder, preserved }
}

const SVG_VECTOR_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])

export function svgMarkupHasSupportedVectors(svg) {
	const xml = String(svg || '')
	if (!xml.trim()) return false
	if (/^<(img|IMG)\b/i.test(xml.trim()) && !/<svg[\s>]/i.test(xml)) return false
	return /<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/i.test(xml)
}

function canvasMotionForLayer(el, classStyles = {}) {
	const css = mergedDeclarations(el, classStyles)
	const resolved = resolveCssMotion({
		classNames: classList(el),
		animationName: css['animation-name'],
		css,
		keyframes: classStyles.__keyframes || {},
	})
	if (!resolved) return null
	if (resolved.unmapped) {
		return { unmapped: true, cssName: resolved.unmapped, mappingSource: 'unmapped' }
	}
	const delay = resolved.delay ?? parseCssTime(css['--enter-delay']) ?? parseCssTime(attr(el, 'data-animation-delay'))
	const duration = resolved.duration ?? parseCssTime(css['--enter-dur']) ?? parseCssTime(attr(el, 'data-animation-duration'))
	const group = attr(el, 'data-anim-group') || attr(el, 'data-animation-group')
	const explicitTrigger = attr(el, 'data-anim-trigger') || attr(el, 'data-animation-trigger')
	const trigger = /after/i.test(explicitTrigger) ? 'afterPrevious'
		: /click/i.test(explicitTrigger) ? 'onClick'
		: 'withPrevious'
	return {
		type: resolved.type,
		effect: resolved.effect,
		...(resolved.direction ? { direction: resolved.direction } : {}),
		trigger,
		...(Number.isFinite(delay) ? { delay } : {}),
		...(Number.isFinite(duration) ? { duration } : {}),
		source: 'html-css',
		mappingSource: resolved.mappingSource,
		htmlClass: resolved.cssName,
		...(group ? { group } : {}),
	}
}

function withCanvasMotion(block, el, classStyles = {}, unmapped = []) {
	if (!block) return block
	const animation = canvasMotionForLayer(el, classStyles)
	if (animation?.unmapped) {
		unmapped.push({ name: block.name, cssName: animation.cssName })
		return block
	}
	return animation ? { ...block, animation } : block
}

function canvasTimelineFromContent(content = [], section) {
	const cues = content
		.filter(block => block?.animation)
		.map(block => ({
			target: block.name,
			...block.animation,
		}))
	if (!cues.length && !attr(section, 'data-duration')) return undefined
	return {
		source: 'html-css',
		cues,
		advanceAfterTime: Number.isFinite(Number(attr(section, 'data-duration'))) ? Math.round(Number(attr(section, 'data-duration'))) : undefined,
	}
}

function nestedHtmlImage(el) {
	return allNodes(el).find(node => {
		const tag = String(node.nodeName || '').toLowerCase().replace(/^.*:/, '')
		return tag === 'img'
	}) || null
}

function cssBackgroundImageSrc(el, classStyles = {}) {
	const css = mergedDeclarations(el, classStyles)
	const bg = `${css['background-image'] || ''} ${css.background || ''}`
	const match = bg.match(/url\(\s*(['"]?)([^'")]+)\1\s*\)/i)
	return match ? String(match[2] || '').trim() : ''
}

function svgRasterHref(el) {
	const images = allNodes(el).filter(node => {
		const tag = svgLocalName(node)
		return tag === 'image' || tag === 'img'
	})
	if (!images.length) return ''
	const vectors = allNodes(el).filter(node => SVG_VECTOR_TAGS.has(svgLocalName(node)) && !svgIsInsideDefs(node))
	if (vectors.length) return ''
	const image = images[0]
	return attr(image, 'href') || attr(image, 'xlink:href') || attr(image, 'src')
}

function canvasRasterImageSpec(el, classStyles = {}) {
	const kindHint = attr(el, 'data-kind').toLowerCase()
	const tag = String(el.nodeName || '').toLowerCase()
	const effectLayer = kindHint === 'native-effect' || hasClass(el, 'native-effect') || hasClass(el, 'native-background')
	const nested = nestedHtmlImage(el)
	const cssSrc = cssBackgroundImageSrc(el, classStyles)
	const svgSrc = svgRasterHref(el)
	let src = ''
	let name = 'picture'
	if (tag === 'img' || kindHint === 'content-image' || kindHint === 'image' || kindHint === 'picture' || hasClass(el, 'picture') || hasClass(el, 'content-image')) {
		src = attr(el, 'src') || cssSrc
		name = attr(el, 'data-asset') || attr(el, 'data-name') || 'picture'
	} else if (nested) {
		src = attr(nested, 'src')
		name = attr(el, 'data-asset') || attr(nested, 'alt') || attr(el, 'data-name') || 'picture'
	} else if (svgSrc) {
		src = svgSrc
		name = attr(el, 'data-asset') || attr(el, 'data-name') || 'picture'
	} else if (cssSrc && tag !== 'svg') {
		src = cssSrc
		name = attr(el, 'data-asset') || attr(el, 'data-name') || 'picture'
	}
	if (!src) return null
	const customReason = effectLayer
		? 'Unsupported CSS/SVG filter, blur, glow, or atmosphere; isolated as a separate transparent image rather than flattened into the slide.'
		: (svgSrc && tag === 'svg' ? 'Raster SVG image element; photographs are PowerPoint images, not customGeometry.' : '')
	return {
		src,
		name,
		...(customReason ? { customReason } : {}),
	}
}

function svgLocalName(el) {
	return String(el?.nodeName || '').toLowerCase().replace(/^.*:/, '')
}

function svgIsInsideDefs(el) {
	let node = el
	while (node && node.nodeType === 1) {
		if (svgLocalName(node) === 'defs') return true
		node = node.parentNode
	}
	return false
}

function svgDrawables(el) {
	const draw = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'image', 'use', 'text'])
	return allNodes(el).filter(node => draw.has(svgLocalName(node)) && !svgIsInsideDefs(node))
}

function svgLooksComplex(el) {
	const xml = serializeSvg(el)
	if (/<(filter|clipPath|mask|marker)\b|marker-(?:end|start)|<fe[A-Z]/i.test(xml)) return true
	const drawables = svgDrawables(el)
	if (drawables.length !== 1) return true
	const tag = svgLocalName(drawables[0])
	return ['path', 'polyline', 'polygon', 'image', 'use', 'text'].includes(tag)
}

function svgPaint(el, fallback = '67E8F9') {
	const fillAttr = attr(el, 'fill')
	const stroke = attr(el, 'stroke')
	const fill = fillAttr === 'none' ? null : (parseColor(fillAttr) || null)
	const lineColor = parseColor(stroke) || fill || parseColor(fallback) || fallback
	const sw = Number.parseFloat(attr(el, 'stroke-width') || '')
	const hasStroke = Boolean(stroke) || (Number.isFinite(sw) && sw > 0)
	const opacity = clamp01(attr(el, 'opacity') || 1, 1)
	const fillOpacity = opacity * clamp01(attr(el, 'fill-opacity') || 1, 1)
	const strokeOpacity = opacity * clamp01(attr(el, 'stroke-opacity') || 1, 1)
	return {
		fill: fill ? { color: fill, ...(fillOpacity < 1 ? { transparency: round4((1 - fillOpacity) * 100) } : {}) } : { color: 'FFFFFF', transparency: 100 },
		line: {
			color: lineColor,
			width: hasStroke ? pptLineWidth(Math.max(0.75, Number.isFinite(sw) && sw > 0 ? sw * 0.75 : 1.15)) : 0,
			...(hasStroke && strokeOpacity < 1 ? { transparency: round4((1 - strokeOpacity) * 100) } : {}),
		},
	}
}

function canvasPresetShape(el, classStyles = {}) {
	if (svgLooksComplex(el)) return null
	const drawables = svgDrawables(el)
	if (drawables.length !== 1) return null
	const drawable = drawables[0]
	const tag = svgLocalName(drawable)
	const paint = svgPaint(drawable, canvasFontStyle(el, classStyles).color || '67E8F9')
	const rx = Number.parseFloat(attr(drawable, 'rx') || attr(drawable, 'ry') || '0')
	if (tag === 'rect') {
		return { kind: 'shape', shapeName: rx > 0 ? 'roundRect' : 'rect', style: paint, decorative: true, keep: true }
	}
	if (tag === 'circle' || tag === 'ellipse') {
		return { kind: 'shape', shapeName: 'ellipse', style: paint, decorative: true, keep: true }
	}
	if (tag === 'line') {
		return {
			kind: 'shape',
			shapeName: 'line',
			style: { fill: { color: 'FFFFFF', transparency: 100 }, line: { ...paint.line, width: pptLineWidth(paint.line.width || 1.15) } },
			decorative: true,
			keep: true,
		}
	}
	return null
}

function svgPrimaryFill(el) {
	const rect = svgDrawables(el).find(node => svgLocalName(node) === 'rect')
	return (rect && parseColor(attr(rect, 'fill'))) || svgStopColor(el) || parseColor(mergedDeclarations(el, {}).background)
}

function svgOffsetPercent(value, fallback = 0) {
	const raw = String(value || '').trim()
	if (!raw) return fallback
	if (raw.endsWith('%')) {
		const percent = Number.parseFloat(raw)
		return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : fallback
	}
	const numeric = Number.parseFloat(raw)
	if (!Number.isFinite(numeric)) return fallback
	return Math.max(0, Math.min(100, Math.abs(numeric) <= 1 ? numeric * 100 : numeric))
}

function svgCoordinate(value, fallback = 0) {
	const raw = String(value || '').trim()
	if (!raw) return fallback
	if (raw.endsWith('%')) {
		const percent = Number.parseFloat(raw)
		return Number.isFinite(percent) ? percent / 100 : fallback
	}
	const numeric = Number.parseFloat(raw)
	return Number.isFinite(numeric) ? numeric : fallback
}

function svgLinearGradientFill(el) {
	const rect = svgDrawables(el).find(node => svgLocalName(node) === 'rect')
	const reference = attr(rect, 'fill').match(/^url\(\s*#([^\s)]+)\s*\)$/i)?.[1]
	if (!reference) return null
	const gradient = allNodes(el).find(node => attr(node, 'id') === reference && svgLocalName(node) === 'lineargradient')
	if (!gradient) return null
	const stops = allNodes(gradient)
		.filter(node => svgLocalName(node) === 'stop')
		.map((stop, index, nodes) => {
			const css = parseAllCssDeclarations(attr(stop, 'style'))
			const opacity = attr(stop, 'stop-opacity') || css['stop-opacity'] || '1'
			const paint = cssColorAndTransparency(attr(stop, 'stop-color') || css['stop-color'], opacity)
			if (!paint) return null
			return {
				position: round4(svgOffsetPercent(attr(stop, 'offset'), nodes.length === 1 ? 0 : index * 100 / (nodes.length - 1))),
				color: paint.color,
				...(paint.transparency ? { transparency: paint.transparency } : {}),
			}
		})
		.filter(Boolean)
	if (stops.length < 2) return null
	const x1 = svgCoordinate(attr(gradient, 'x1'), 0)
	const y1 = svgCoordinate(attr(gradient, 'y1'), 0)
	const x2 = svgCoordinate(attr(gradient, 'x2'), 1)
	const y2 = svgCoordinate(attr(gradient, 'y2'), 0)
	const angle = ((Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) + 360) % 360
	return {
		type: 'gradient',
		gradientDirection: 'linear',
		gradientAngle: round4(angle),
		gradientStops: stops,
	}
}

function svgPrimaryBackgroundFill(el) {
	return svgLinearGradientFill(el) || svgPrimaryFill(el)
}

function svgViewBox(el, parentBox) {
	const values = attr(el, 'viewBox').split(/[\s,]+/).map(Number)
	if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
		return { x: values[0], y: values[1], w: values[2], h: values[3] }
	}
	return { x: 0, y: 0, w: parentBox.width, h: parentBox.height }
}

function svgDrawableEngineRect(svgEl, drawable, stage, bounds) {
	const parent = pxBoxFromStyle(attr(svgEl, 'style'))
	if (!parent || !bounds) return null
	const viewBox = svgViewBox(svgEl, parent)
	const left = parent.left + ((bounds.x - viewBox.x) / viewBox.w) * parent.width
	const top = parent.top + ((bounds.y - viewBox.y) / viewBox.h) * parent.height
	const width = (bounds.w / viewBox.w) * parent.width
	const height = (bounds.h / viewBox.h) * parent.height
	if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
	return engineRectFromPx({ left, top, width, height }, stage)
}

function svgEditableAtmospherePrimitives(el, used, stage) {
	const out = []
	const parent = pxBoxFromStyle(attr(el, 'style'))
	if (!parent) return out
	for (const drawable of svgDrawables(el)) {
		if (attr(drawable, 'filter') || attr(drawable, 'mask') || attr(drawable, 'clip-path')) continue
		const tag = svgLocalName(drawable)
		const paint = svgPaint(drawable)
		if (tag === 'circle') {
			const cx = Number.parseFloat(attr(drawable, 'cx'))
			const cy = Number.parseFloat(attr(drawable, 'cy'))
			const r = Number.parseFloat(attr(drawable, 'r'))
			const rect = svgDrawableEngineRect(el, drawable, stage, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 })
			if (!rect || !parseColor(attr(drawable, 'fill'))) continue
			out.push({
				kind: 'shape', name: uniqueName('background-star', used), shapeName: 'ellipse', style: { ...paint, line: { color: paint.fill.color, transparency: 100, width: 0.1 } },
				decorative: true, keep: true, representation: 'editable-native-background-detail', _engineOwnedGeometry: true, _engineRect: rect,
			})
			continue
		}
		if (tag === 'ellipse') {
			const cx = Number.parseFloat(attr(drawable, 'cx'))
			const cy = Number.parseFloat(attr(drawable, 'cy'))
			const rx = Number.parseFloat(attr(drawable, 'rx'))
			const ry = Number.parseFloat(attr(drawable, 'ry'))
			const rect = svgDrawableEngineRect(el, drawable, stage, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 })
			if (!rect || !parseColor(attr(drawable, 'fill'))) continue
			out.push({
				kind: 'shape', name: uniqueName('background-orb', used), shapeName: 'ellipse', style: paint,
				decorative: true, keep: true, representation: 'editable-native-background-detail', _engineOwnedGeometry: true, _engineRect: rect,
			})
			continue
		}
		if (tag === 'path' && attr(drawable, 'fill') === 'none' && parseColor(attr(drawable, 'stroke')) && attr(drawable, 'd')) {
			const pathMarkup = new XMLSerializer().serializeToString(drawable)
			out.push({
				kind: 'customGeometry', name: uniqueName('background-curve', used),
				svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${attr(el, 'viewBox') || `0 0 ${parent.width} ${parent.height}`}">${pathMarkup}</svg>`,
				style: paint, decorative: true, keep: true, noFrame: true, representation: 'editable-native-background-detail',
				_engineOwnedGeometry: true, _engineRect: engineRectFromPx(parent, stage),
			})
		}
	}
	return out
}

function layerOwnerId(el) {
	return attr(el, 'data-owner') || attr(el, 'data-for') || attr(el, 'data-effect-owner') || attr(el, 'data-target') || attr(el, 'data-effect-for')
}

function canvasBackdropIsSimpleFill(el) {
	if (svgLooksComplex(el)) return false
	const drawables = svgDrawables(el)
	if (drawables.length !== 1) return false
	const drawable = drawables[0]
	if (svgLocalName(drawable) !== 'rect') return false
	const fill = attr(drawable, 'fill')
	return Boolean(parseColor(fill))
}

function canvasTextKind(el, classStyles = {}) {
	const style = canvasFontStyle(el, classStyles)
	const css = mergedDeclarations(el, classStyles)
	const opaqueFill = style.fill && style.fill.transparency !== 100 && style.fill.color
	if (firstNumericText(el) && isGiantType(css) && !opaqueFill) return 'stat'
	if (opaqueFill || isActionControl(el, classStyles) || hasClass(el, 'pill') || hasClass(el, 'chip') || hasClass(el, 'type-pay')) return 'textShape'
	return 'textBox'
}

function collectCanvasLayers(section, used, stage, assetMap = {}, classStyles = {}, fallbackPolicy = {}) {
	const content = []
	const unmappedCssMotion = []
	const htmlFallbacks = []
	let sourceAnimatedNodes = 0
	let background = null
	const pushLayer = (block, el) => {
		if (!block) return
		content.push(withCanvasMotion(withEngineRect(block, el, stage), el, classStyles, unmappedCssMotion))
	}
	const noteSourceMotion = el => {
		const css = mergedDeclarations(el, classStyles)
		if (css.animation || css['animation-name'] || classList(el).some(name => /^anim-/i.test(name))) sourceAnimatedNodes += 1
	}
	for (const el of allNodes(section)) {
		if (!hasClass(el, 'layer')) continue
		noteSourceMotion(el)
		const kindHint = attr(el, 'data-kind').toLowerCase()
		const tag = String(el.nodeName || '').toLowerCase()
		const raster = canvasRasterImageSpec(el, classStyles)
		if (raster) {
			const handle = resolveHtmlAsset(raster.src, assetMap)
			const image = handle || (String(raster.src).startsWith('data:') ? raster.src : raster.src)
			const owner = layerOwnerId(el)
			pushLayer({
				kind: 'image',
				name: uniqueName(raster.name || 'picture', used),
				image,
				path: handle || undefined,
				noFrame: true,
				altText: attr(el, 'alt') || attr(el, 'aria-label') || 'Image',
				...(owner ? { effectOwnerId: owner, inheritsAnimation: true } : {}),
				...(raster.customReason ? { customReason: raster.customReason, rasterFallback: true, representation: 'isolated-raster-element' } : {}),
			}, el)
			if (raster.customReason) {
				htmlFallbacks.push(fallbackLedgerEntry({
					sourceObjectId: raster.name || attr(el, 'data-name') || kindHint,
					slideId: attr(section, 'id'),
					sourceRepresentation: 'isolated-raster-element',
					compiledRepresentation: 'isolated-raster-element',
					nativeComponents: [],
					fallbackComponents: ['supplied-raster'],
					reason: raster.customReason,
					effectOwnerId: owner || null,
					needsIsolatedRaster: false,
				}))
			}
			continue
		}
		if (kindHint === 'native-background' || hasClass(el, 'native-background') || kindHint === 'native-effect' || hasClass(el, 'native-effect')) {
			const svg = serializeSvg(el)
			const filterReasons = [...svgUnsupportedFilterReasons(svg), ...cssUnsupportedEffectReasons(mergedDeclarations(el, classStyles))]
			const owner = layerOwnerId(el)
			const sourceId = attr(el, 'data-name') || kindHint || 'atmosphere'
			const backgroundFill = svgPrimaryBackgroundFill(el)
			const fill = typeof backgroundFill === 'string' ? backgroundFill : backgroundFill?.gradientStops?.[0]?.color
			if (!background && backgroundFill) background = backgroundFill
			const nativeComponents = []
			if (fill) nativeComponents.push('gradient-or-solid-fill')
			const nestedSupport = (kindHint === 'native-effect' || hasClass(el, 'native-effect'))
				? nestedCssSupportShape(el, classStyles)
				: null
			if (nestedSupport) {
				const supportName = uniqueName(`${sourceId}-support`, used)
				content.push(withCanvasMotion(withNestedEngineRect({
					...nestedSupport.spec,
					name: supportName,
					altText: attr(el, 'aria-label') || `Decorative support effect for ${sourceId}`,
					representation: 'editable-native-support-shape',
					sourceObjectId: sourceId,
					supportLayer: {
						ownerObjectName: owner || sourceId,
						inheritsTransform: true,
						inheritsCrop: true,
						inheritsAnimation: true,
						inheritsMorphIdentity: true,
						excludedFromReadingOrder: true,
					},
				}, el, nestedSupport.child, stage), el, classStyles, unmappedCssMotion))
				htmlFallbacks.push(fallbackLedgerEntry({
					sourceObjectId: sourceId,
					slideId: attr(section, 'id'),
					sourceRepresentation: 'nested-css-support-effect',
					compiledRepresentation: 'native-exact',
					nativeComponents: nestedSupport.spec.nativeComponents,
					fallbackComponents: [],
					reason: `Nested visual support layer compiled as editable ${nestedSupport.spec.shapeName} geometry with native styling and inherited motion.`,
					effectOwnerId: owner || null,
					needsIsolatedRaster: false,
					wholeSlideRasterized: false,
				}))
				continue
			}
			if (backgroundFill && typeof backgroundFill === 'object' && backgroundFill.type === 'gradient' && !filterReasons.length) {
				htmlFallbacks.push(fallbackLedgerEntry({
					sourceObjectId: sourceId,
					slideId: attr(section, 'id'),
					sourceRepresentation: kindHint || 'native-background',
					compiledRepresentation: 'native-exact',
					nativeComponents: ['slide-background-gradient'],
					reason: 'Linear SVG background gradient compiled as a native editable PowerPoint slide background.',
				}))
				continue
			}
			if (canvasBackdropIsSimpleFill(el) && !filterReasons.length) {
				htmlFallbacks.push(fallbackLedgerEntry({
					sourceObjectId: sourceId,
					slideId: attr(section, 'id'),
					sourceRepresentation: kindHint || 'native-background',
					compiledRepresentation: 'native-exact',
					nativeComponents: ['slide-background-fill'],
					reason: 'Simple native fill.',
				}))
				continue
			}
			if (filterReasons.length) {
				const css = mergedDeclarations(el, classStyles)
				const split = splitAtmosphereReasons(filterReasons)
				const nativeBlur = cssBlurToNative(css, svg)
				const nativeFillOverlay = cssBlendToNative(css)
				const nativeShadow = cssBoxShadowToNative(css)
				const editableAtmosphere = svgEditableAtmospherePrimitives(el, used, stage)
				if (editableAtmosphere.length) {
					content.push(...editableAtmosphere)
					nativeComponents.push('editable-background-details')
				}
				const stripped = stripUnsupportedSvgFilters(el)
				// A multi-paint SVG depends on its gradient/filter/mask graph for visual
				// meaning. Re-emitting the whole subtree as one uniformly styled custom
				// geometry turns subtle atmosphere into giant opaque shapes. Preserve only
				// genuinely simple vectors here; the unsupported graph remains an explicit
				// isolated-effect fallback instead of corrupting the native composition.
				const hasComplexPaintGraph = /<(?:linearGradient|radialGradient|filter|mask|clipPath|pattern)\b/i.test(svg || '')
				const hasNonFillVectors = !hasComplexPaintGraph && /<(?:path|line|polyline|polygon|circle|ellipse)\b/i.test(stripped || '')
				if (hasNonFillVectors) {
					nativeComponents.push('vector-grid-or-shapes')
					pushLayer({
						kind: 'customGeometry',
						name: uniqueName(`${sourceId}-vectors`, used),
						svg: stripped,
						decorative: true,
						keep: true,
						noFrame: true,
						representation: 'editable-custom-geometry',
						customReason: 'Supported vectors extracted from a filter stack; unsupported filters remain isolated.',
					style: { fill: { color: fill || background || '0B0E16' }, line: { color: '67E8F9', width: pptLineWidth(1) } },
						altText: attr(el, 'aria-label') || 'Graphic',
						...(owner ? { effectOwnerId: owner } : {}),
					}, el)
				}
				const nativeCompiled = [
					...nativeComponents,
					...split.native.map(node => node.compiledAs),
					...(nativeBlur ? ['native-blur'] : []),
					...(nativeFillOverlay ? ['native-fill-overlay'] : []),
					...(nativeShadow ? ['native-shadow'] : []),
				]
				const remainderReasons = split.remainder.map(node => node.source)
				htmlFallbacks.push(fallbackLedgerEntry({
					sourceObjectId: sourceId,
					slideId: attr(section, 'id'),
					sourceRepresentation: kindHint === 'native-effect' || hasClass(el, 'native-effect') ? 'css-filter-or-svg-effect' : 'svg-filter-stack',
					compiledRepresentation: remainderReasons.length ? 'native-composite-plus-pending-raster' : 'native-composite',
					nativeComponents: nativeCompiled,
					fallbackComponents: remainderReasons,
					atmosphereNodes: split.nodes,
					reason: remainderReasons.length
						? `Native atmosphere compiled first. Residual unsupported nodes: ${remainderReasons.join(', ')}. Generate only those as owner-linked transparent assets; do not flatten the slide.`
						: 'Atmosphere decomposed into native fills, vectors, and effect-list primitives.',
					effectOwnerId: owner || null,
					needsIsolatedRaster: remainderReasons.length > 0,
					wholeSlideRasterized: false,
					nativeShadow,
					nativeBlur,
					nativeFillOverlay,
					aiApprovedDowngrade: remainderReasons.length > 0 && remainderReasons.every(reason => fallbackPolicyApproves(fallbackPolicy, reason)),
				}))
				continue
			}
			if (svg && svgMarkupHasSupportedVectors(svg)) {
				pushLayer({
					kind: 'customGeometry',
					name: uniqueName(sourceId, used),
					svg,
					decorative: true,
					keep: true,
					noFrame: true,
					representation: 'editable-custom-geometry',
					customReason: 'Vector backdrop that is not a simple native fill.',
					style: { fill: { color: fill || background || '0B0E16' }, line: { color: '0B0E16', width: 0 } },
					altText: attr(el, 'aria-label') || 'Slide backdrop',
					...(owner ? { effectOwnerId: owner } : {}),
				}, el)
				continue
			}
			const nativeEq = cssNativeEquivalentReasons(mergedDeclarations(el, classStyles))
			const nativeShadow = cssBoxShadowToNative(mergedDeclarations(el, classStyles))
			htmlFallbacks.push(fallbackLedgerEntry({
				sourceObjectId: sourceId,
				slideId: attr(section, 'id'),
				sourceRepresentation: kindHint === 'native-effect' || hasClass(el, 'native-effect') ? 'css-filter-or-svg-effect' : 'svg-filter-stack',
				compiledRepresentation: nativeEq.length || nativeComponents.length ? 'native-composite' : 'pending-isolated-raster',
				nativeComponents: [...nativeComponents, ...nativeEq],
				fallbackComponents: nativeEq.length ? [] : ['uncompiled-atmosphere-layer'],
				reason: nativeEq.length
					? 'Map PowerPoint-equivalent shadow, glow, or transparency onto the owner object. This layer is not an independent story object.'
					: 'Atmosphere layer has no native fill, supported vector, or isolated raster yet. Do not flatten the slide.',
				effectOwnerId: owner || null,
				needsIsolatedRaster: !nativeEq.length,
				wholeSlideRasterized: false,
				nativeShadow,
			}))
			continue
		}
		if (hasClass(el, 'text-shape') || kindHint === 'text') {
			// data-text is semantic metadata and may be normalised to lowercase by
			// exporters. The visible child text is the authoritative display string.
			const text = textOf(el) || attr(el, 'data-text')
			if (!String(text || '').trim()) continue
			const style = canvasFontStyle(el, classStyles)
			const kind = canvasTextKind(el, classStyles)
			const displayText = canvasDisplayText(el, text, classStyles)
			pushLayer({
				kind,
				name: uniqueName(attr(el, 'data-name') || (kind === 'stat' ? 'stat' : 'text'), used),
				text: displayText,
				style,
				altText: displayText,
			}, el)
			continue
		}
		if (tag === 'svg' || hasClass(el, 'vector-shape') || hasClass(el, 'vector-line') || hasClass(el, 'vector-freeform') || kindHint === 'line') {
			if (tag !== 'svg' && hasClass(el, 'vector-shape')) {
				const cssShape = cssBoxShapeSpec(el, classStyles)
				if (cssShape) {
					pushLayer({
						...cssShape,
						name: uniqueName(attr(el, 'data-name') || kindHint || cssShape.shapeName || 'shape', used),
						altText: attr(el, 'aria-label') || 'Decorative graphic',
						representation: 'editable-native-css-box',
						sourceObjectId: attr(el, 'data-name') || kindHint || 'vector-shape',
					}, el)
					continue
				}
			}
			const preset = canvasPresetShape(el, classStyles)
			if (preset) {
				pushLayer({
					...preset,
					name: uniqueName(attr(el, 'data-name') || kindHint || preset.shapeName || 'shape', used),
					altText: attr(el, 'aria-label') || 'Graphic',
				}, el)
				continue
			}
			const svg = serializeSvg(el)
			if (!svg || !svgMarkupHasSupportedVectors(svg)) continue
			pushLayer({
				kind: 'customGeometry',
				name: uniqueName(attr(el, 'data-name') || kindHint || 'vector', used),
				svg,
				decorative: true,
				keep: true,
				style: {
					fill: { color: canvasFontStyle(el, classStyles).color || '67E8F9', transparency: hasClass(el, 'vector-line') ? 100 : 0 },
					line: { color: canvasFontStyle(el, classStyles).color || '67E8F9', width: hasClass(el, 'vector-line') ? pptLineWidth(1.15) : 0 },
				},
				altText: attr(el, 'aria-label') || 'Graphic',
			}, el)
		}
	}
	for (const entry of htmlFallbacks) {
		if (!entry?.effectOwnerId) continue
		const owner = content.find(block => block?.name === entry.effectOwnerId)
		if (!owner) continue
		owner.style = {
			...(owner.style || {}),
			...(entry.nativeShadow && !owner.style?.shadow ? { shadow: entry.nativeShadow } : {}),
			...(entry.nativeBlur && !owner.style?.blur ? { blur: entry.nativeBlur } : {}),
			...(entry.nativeFillOverlay && !owner.style?.fillOverlay ? { fillOverlay: entry.nativeFillOverlay } : {}),
		}
		owner.supportLayer = {
			ownerObjectName: entry.effectOwnerId,
			inheritsTransform: true,
			inheritsCrop: true,
			inheritsAnimation: true,
			inheritsMorphIdentity: true,
			excludedFromReadingOrder: true,
		}
	}
	return {
		content,
		background,
		timeline: canvasTimelineFromContent(content, section),
		unmappedCssMotion,
		htmlFallbacks,
		htmlSourceMotion: { animatedSourceNodes: sourceAnimatedNodes },
	}
}

function firstTextNode(el) {
	const kids = el?.childNodes
	if (!kids) return ''
	for (let i = 0; i < kids.length; i += 1) {
		const node = kids.item(i)
		if (node.nodeType === 3 && String(node.nodeValue || '').trim()) return String(node.nodeValue || '').trim()
	}
	return ''
}

function statParts(el) {
	const value = attr(el, 'data-value') || firstTextNode(el) || textOf(el).split('\n')[0]
	const spanLabel = childrenOf(el).filter(child => String(child.nodeName || '').toLowerCase() === 'span').map(textOf).join(' ').trim()
	const label = attr(el, 'data-label') || spanLabel || textOf(el).split('\n').slice(1).join(' ').trim()
	return { value: String(value || '').trim(), label: String(label || '').trim() }
}

function ancestorPayCluster(el, classStyles = {}) {
	let node = el
	while (node && node.nodeType === 1) {
		const kids = childrenOf(node)
		const hasAmt = kids.some(child => looksLikeAmountEl(child))
		const hasAction = kids.some(child => isActionControl(child, classStyles))
		if (hasClass(node, 'pay') || (hasAmt && hasAction)) {
			const label = kids.find(child => hasClass(child, 'label'))
			const key = textOf(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
			return key || 'chrome'
		}
		node = node.parentNode
	}
	return null
}

function typeSurfaceStyle(style = {}) {
	return {
		...style,
		fill: { color: style.fill?.color || 'FFFFFF', transparency: 100 },
		line: { color: 'FFFFFF', transparency: 100, width: 0 },
		shadow: null,
	}
}

function amountText(el) {
	const own = textOf(el)
	const parent = el?.parentNode
	if (!parent) return own
	const prev = childrenOf(parent)
	const index = prev.indexOf(el)
	const label = index > 0 && hasClass(prev[index - 1], 'label') ? textOf(prev[index - 1]) : ''
	if (label && own) return `${label.toUpperCase()} ${own}`
	return own
}

function roomText(el) {
	let heading = ''
	let copy = ''
	for (const child of childrenOf(el)) {
		const tag = String(child.nodeName || '').toLowerCase()
		if (tag === 'h2' || tag === 'h3') heading = textOf(child)
		else if (tag === 'p') copy = textOf(child)
	}
	const fallback = textOf(el)
	if (heading && copy) return `${heading}. ${copy}`
	return heading || copy || fallback
}

function lowerBlock(el, used, world = null, classStyles = {}) {
	const kind = inferKind(el, classStyles)
	if (!kind) return null
	const name = uniqueName(inferredName(el, kind), used)
	const style = styleTokensFrom(el, classStyles)
	const region = inferredRegion(el, classStyles)
	const altText = attr(el, 'aria-label') || attr(el, 'data-alt') || undefined
	if (kind === 'image') {
		const raster = canvasRasterImageSpec(el, classStyles) || { src: attr(el, 'src'), name }
		if (!raster.src) return null
		return withCanvasMotion({
			kind: 'image',
			name,
			image: raster.src,
			noFrame: true,
			...(region ? { region } : {}),
			altText: altText || attr(el, 'alt') || 'Image',
			...(raster.customReason ? { customReason: raster.customReason, rasterFallback: true } : {}),
		}, el, classStyles)
	}
	if (kind === 'htmlSketch') {
		return {
			kind: 'htmlSketch',
			sketch: attr(el, 'data-sketch') || (looksLikePlot(el) ? 'plot' : 'sketch'),
			name,
			...(region ? { region } : {}),
			altText: altText || 'HTML sketch awaiting a PowerPoint nicety',
		}
	}
	if (kind === 'shape') {
		if (!style.fill) return null
		const cluster = ancestorPayCluster(el, classStyles)
		const hairline = looksLikeRule(el)
		return {
			kind: 'shape',
			name,
			...(region ? { region } : {}),
			...(cluster ? { stackGroup: cluster } : {}),
			...(hairline ? { hairline: true } : {}),
			style: {
				fill: style.fill,
				line: { color: style.fill.color, transparency: 100, width: 0 },
			},
			altText: altText || (hairline ? 'Rule' : 'Panel'),
		}
	}
	if (kind === 'customGeometry') {
		const svg = serializeSvg(el)
		if (!svg || !svgMarkupHasSupportedVectors(svg)) {
			const raster = canvasRasterImageSpec(el, classStyles)
			if (!raster?.src) return null
			return withCanvasMotion({
				kind: 'image',
				name,
				image: raster.src,
				noFrame: true,
				...(region ? { region } : {}),
				altText: altText || 'Image',
				customReason: raster.customReason || 'Raster markup cannot become customGeometry.',
				rasterFallback: true,
			}, el, classStyles)
		}
		return {
			kind: 'customGeometry',
			name,
			svg,
			...(region ? { region } : {}),
			style: {
				fill: { color: style.fill?.color || '38BDF8', transparency: 100 },
				line: { color: style.color || '38BDF8', width: pptLineWidth(1.5) },
			},
			altText: altText || 'Diagram',
		}
	}
	if (kind === 'stat' || kind === 'kpi') {
		const parts = statParts(el)
		const filledStatCard = (hasClass(el, 'kpi') || hasClass(el, 'stat')) && style.fill && style.fill.transparency !== 100
		const statStyle = filledStatCard ? style : typeSurfaceStyle(style)
		return {
			kind: 'stat',
			name,
			value: parts.value,
			...(parts.label ? { label: parts.label } : {}),
			...(region ? { region } : {}),
			...(Object.keys(statStyle).length ? { style: statStyle } : {}),
			...(altText ? { altText } : { altText: [parts.value, parts.label].filter(Boolean).join(' ') }),
			verified: attr(el, 'data-verified') !== 'false',
			evidenceSource: attr(el, 'data-evidence') || 'author-supplied synthesis',
		}
	}
	if (kind === 'chart-panel') {
		const payload = jsonPayload(el) || {}
		const data = Array.isArray(payload.series) ? payload.series : Array.isArray(payload.data) ? payload.data : []
		return {
			kind: 'chart-panel',
			name,
			chartType: attr(el, 'data-chart-type') || payload.chartType || 'bar',
			...(region ? { region } : {}),
			verified: true,
			evidenceSource: attr(el, 'data-evidence') || payload.evidenceSource || 'author-supplied synthesis',
			altText: altText || payload.altText || 'Chart',
			chartOptions: {
				showTitle: false,
				showLegend: true,
				showValue: true,
				...(payload.chartOptions || {}),
			},
			data,
		}
	}
	if (kind === 'process') {
		const items = childrenOf(el).filter(child => String(child.nodeName || '').toLowerCase() === 'li').map((li, index) => ({
			name: attr(li, 'data-name') || `step-${index + 1}`,
			label: attr(li, 'data-label') || textOf(li).split('\n')[0],
			text: textOf(li).split('\n').slice(1).join(' ').trim() || textOf(li),
			verified: true,
			evidenceSource: attr(el, 'data-evidence') || 'author-supplied synthesis',
		}))
		return {
			kind: 'process',
			name,
			items,
			...(region ? { region } : {}),
			...(Object.keys(style).length ? { style } : {}),
			verified: true,
			evidenceSource: attr(el, 'data-evidence') || 'author-supplied synthesis',
			altText: altText || 'Process',
		}
	}
	if (kind === 'equation') {
		return {
			kind: 'equation',
			name,
			unicodeMath: attr(el, 'data-math') || textOf(el),
			sourceFormat: 'unicodeMath',
			...(region ? { region } : {}),
			...(Object.keys(style).length ? { style } : {}),
			altText: altText || textOf(el),
		}
	}
	const text = looksLikeAmountEl(el) ? amountText(el) : looksLikeRoomCard(el) ? roomText(el) : textOf(el)
	if (!text && kind !== 'shape') return null
	const cluster = ancestorPayCluster(el, classStyles)
	const surfaceStyle = isTypeAction(el, classStyles) || looksLikeAmountEl(el) ? typeSurfaceStyle(style) : style
	if (isTypeAction(el, classStyles)) surfaceStyle.align = 'left'
	const block = {
		kind: kind === 'button' ? 'textShape' : kind,
		name,
		text,
		...(region ? { region } : {}),
		...(cluster ? { stackGroup: cluster } : {}),
		...(Object.keys(surfaceStyle).length ? { style: surfaceStyle } : {}),
		altText: altText || text,
	}
	const next = asColumnHeadline(block, kind, region, world)
	if (next.kind === 'title' && world) {
		return { ...next, style: headingStyleForWorld(world, next.style || {}) }
	}
	return next
}

export function promoteColumnHeadlines(spec = {}) {
	if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides)) return spec
	const deckWorld = typeof spec.styleIntent?.artDirection === 'string' ? spec.styleIntent.artDirection : null
	const slides = spec.slides.map(slide => {
		if (!slide || !Array.isArray(slide.content)) return slide
		const world = slide.htmlWorld || (typeof slide.styleIntent?.artDirection === 'string' ? slide.styleIntent.artDirection : deckWorld)
		const content = slide.content.map(block => {
			if (!block || typeof block !== 'object') return block
			return asColumnHeadline(block, block.kind, block.region, world)
		})
		return { ...slide, content }
	})
	return { ...spec, slides }
}

function collectBlocks(el, used, into, world = null, classStyles = {}) {
	if (isHtmlRuntimePlayerChrome(el, attr)) return
	if (looksLikeRoomCard(el)) {
		const region = inferredRegion(el, classStyles)
		const group = roomClusterKey(el)
		const chrome = surfaceChrome(el, used, region, group, classStyles)
		if (chrome) into.push(chrome)
		const ill = childrenOf(el).find(child => looksLikeIll(child, classStyles) || hasClass(child, 'ill'))
		if (ill) {
			const fill = parseColor(mergedDeclarations(ill, classStyles).background || mergedDeclarations(ill, classStyles)['background-color'])
			if (fill) {
				into.push({
					kind: 'shape',
					name: uniqueName('ill', used),
					...(region ? { region } : {}),
					stackGroup: group,
					style: { fill: { color: fill }, line: { color: fill, transparency: 100, width: 0 } },
					altText: `${group} panel`,
				})
			}
		}
		const heading = childrenOf(el).find(child => /^h[23]$/i.test(child.nodeName || ''))
		const copy = childrenOf(el).find(child => String(child.nodeName || '').toLowerCase() === 'p')
		if (heading) {
			const headingStyle = typeSurfaceStyle(styleTokensFrom(heading, classStyles))
			into.push({
				kind: 'textBox',
				name: uniqueName('room-title', used),
				role: 'headline',
				text: textOf(heading),
				...(region ? { region } : {}),
				stackGroup: group,
				style: { ...headingStyle, align: 'left' },
				altText: textOf(heading),
			})
		}
		if (copy) {
			const copyStyle = typeSurfaceStyle(styleTokensFrom(copy, classStyles))
			into.push({
				kind: 'body',
				name: uniqueName('room-copy', used),
				text: textOf(copy),
				...(region ? { region } : {}),
				stackGroup: group,
				style: { ...copyStyle, align: 'left' },
				altText: textOf(copy),
			})
		}
		return
	}
	if (looksLikePayCluster(el, classStyles)) {
		const region = inferredRegion(el, classStyles)
		const group = ancestorPayCluster(el, classStyles) || 'chrome'
		const chrome = surfaceChrome(el, used, region, group, classStyles)
		if (chrome) into.push(chrome)
		for (const child of childrenOf(el)) collectBlocks(child, used, into, world, classStyles)
		return
	}
	const kind = inferKind(el, classStyles)
	if (kind) {
		const block = lowerBlock(el, used, world, classStyles)
		if (block) into.push(block)
		if (kind === 'process' || kind === 'chart-panel' || kind === 'stat' || kind === 'equation' || kind === 'textShape' || kind === 'title' || kind === 'body' || kind === 'quote' || kind === 'customGeometry' || kind === 'textBox' || kind === 'htmlSketch' || kind === 'shape' || kind === 'image') return
	}
	for (const child of childrenOf(el)) collectBlocks(child, used, into, world, classStyles)
}

function normalizeHtml(markup) {
	return String(markup || '')
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<!DOCTYPE[^>]*>/i, '')
		.replace(/<br\s*>/gi, '<br/>')
		.replace(/<hr\s*>/gi, '<hr/>')
		.replace(/<meta([^>]*)>/gi, '<meta$1/>')
		.replace(/<img([^>]*?)\s*\/?>/gi, '<img$1/>')
		.replace(/<(rect|path|circle|line|polygon|polyline|ellipse|stop)(\s[^>/]*)?>\s*(?!<\/\1)/gi, '<$1$2/>')
}

function parseDocument(markup) {
	const wrapped = `<root xmlns:xhtml="http://www.w3.org/1999/xhtml">${normalizeHtml(markup)}</root>`
	return new DOMParser().parseFromString(wrapped, 'text/xml')
}

function sectionNodes(doc) {
	const sections = []
	for (const el of allNodes(doc.documentElement)) {
		const tag = String(el.nodeName || '').toLowerCase()
		if (tag === 'section' && (hasClass(el, 'slide') || attr(el, 'data-slide') || attr(el, 'data-world') || attr(el, 'data-layout'))) sections.push(el)
	}
	return sections
}

export function lowerHtmlSlide(markup, options = {}) {
	const doc = parseDocument(markup)
	const classStyles = options.classStyles || parseStyleSheet(markup)
	const section = sectionNodes(doc)[0] || doc.documentElement
	const css = parseCssDeclarations(attr(section, 'style'))
	const world = inferWorld(section)
	let classBackground = null
	for (const name of classList(section)) {
		const fromClass = parseColor(classStyles[name]?.background || classStyles[name]?.['background-color'])
		if (fromClass) classBackground = fromClass
	}
	let background = parseColor(css.background || css['background-color']) || classBackground || WORLD_CANVAS[world] || null
	const used = new Set()
	const content = []
	const canvas = isCanvasSlide(section)
	const stage = options.stage || detectHtmlStage(markup)
	let canvasTimeline
	let unmappedCssMotion
	let loweredCanvas
	if (canvas) {
		loweredCanvas = collectCanvasLayers(section, used, stage, options.assetMap || {}, classStyles, options.fallbackPolicy || {})
		content.push(...loweredCanvas.content)
		if (loweredCanvas.background) background = loweredCanvas.background
		canvasTimeline = loweredCanvas.timeline
		unmappedCssMotion = loweredCanvas.unmappedCssMotion
	} else {
		collectBlocks(section, used, content, world, classStyles)
	}
	const layoutIntent = canvas ? 'hero' : inferLayout(section, classStyles)
	const mode = inferMode(section, background)
	const titleBlock = content.find(block => block.kind === 'title' || block.kind === 'textBox')
	let headingText = ''
	try { headingText = textOf(section.getElementsByTagName('h1').item(0)) } catch { headingText = '' }
	const title = options.title || attr(section, 'data-title') || titleBlock?.text || headingText || 'Slide'
	const id = options.id || attr(section, 'id') || attr(section, 'data-name') || 'slide'
	return {
		id: String(id).replace(/[^A-Za-z0-9._:-]/g, '-') || 'slide',
		title,
		message: options.message || title,
		layoutIntent,
		...(world ? { htmlWorld: world } : {}),
		...(canvas ? { htmlWorld: world || 'luxe', htmlCanvas: true } : {}),
		...(mode ? { mode } : {}),
		...(background ? { background } : {}),
		...(canvas ? { transition: canvasTransition(section) } : {}),
		...(canvasTimeline ? { timeline: canvasTimeline } : {}),
		...(unmappedCssMotion?.length ? { htmlUnmappedCssMotion: unmappedCssMotion } : {}),
		...(canvas && loweredCanvas?.htmlFallbacks?.length ? { htmlFallbacks: loweredCanvas.htmlFallbacks } : {}),
		...(canvas && loweredCanvas?.htmlSourceMotion ? { htmlSourceMotion: loweredCanvas.htmlSourceMotion } : {}),
		content,
		notes: options.notes || (canvas
			? 'Lowered from a designed 16:9 HTML canvas. Engine-owned stage geometry; native PowerPoint remains the product.'
			: 'Lowered from semantic slide HTML. Native PowerPoint remains the product.'),
		htmlSurface: HTML_SLIDE_SURFACE_VERSION,
	}
}

export function lowerHtmlSlides(markup, options = {}) {
	const classStyles = options.classStyles || parseStyleSheet(markup)
	const stage = options.stage || detectHtmlStage(markup)
	const doc = parseDocument(markup)
	const usedIds = new Set()
	return sectionNodes(doc).map((section, index) => {
		const world = inferWorld(section)
		const id = uniqueName(attr(section, 'id') || world || `slide-${index + 1}`, usedIds)
		const fragment = new XMLSerializer().serializeToString(section)
		return lowerHtmlSlide(fragment, { id, classStyles, stage, assetMap: options.assetMap || {}, fallbackPolicy: options.fallbackPolicy || {} })
	})
}

export function applyPowerpointNiceties(spec = {}) {
	if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides)) return spec
	const niceties = []
		.concat(Array.isArray(spec.niceties) ? spec.niceties : [])
		.concat(Array.isArray(spec.powerpointNiceties) ? spec.powerpointNiceties : [])
	const slides = spec.slides.map(slide => ({
		...slide,
		content: Array.isArray(slide?.content) ? [...slide.content] : [],
	}))
	const selections = Array.isArray(spec.selectionManifest?.selections) ? [...spec.selectionManifest.selections] : []

	const matchSlide = rule => {
		if (rule.slideId) {
			const byId = slides.findIndex(slide => slide.id === rule.slideId)
			if (byId >= 0) return byId
		}
		if (Number.isInteger(rule.slideIndex) && rule.slideIndex >= 0) return rule.slideIndex
		const sketchName = rule.replaceSketch || rule.name
		if (sketchName) {
			const hasSketch = slide => (slide.content || []).some(block => block?.kind === 'htmlSketch' && (block.sketch === sketchName || block.name === sketchName))
			if (rule.htmlWorld) {
				const byWorldSketch = slides.findIndex(slide => slide.htmlWorld === rule.htmlWorld && hasSketch(slide))
				if (byWorldSketch >= 0) return byWorldSketch
			}
			const bySketch = slides.findIndex(hasSketch)
			if (bySketch >= 0) return bySketch
		}
		if (rule.htmlWorld) {
			const byWorld = slides.findIndex(slide => slide.htmlWorld === rule.htmlWorld)
			if (byWorld >= 0) return byWorld
		}
		return -1
	}

	const nicetyBlock = (rule, used, sketch = null) => {
		const kind = rule.kind || rule.block?.kind
		if (!kind || kind === 'htmlSketch') return rule.block ? { ...rule.block } : null
		const name = uniqueName(rule.name || sketch?.name || kind, used)
		const region = rule.region || sketch?.region
		if (kind === 'chart-panel') {
			const payload = rule.data || rule.block?.data || []
			return {
				kind: 'chart-panel',
				name,
				chartType: rule.chartType || rule.block?.chartType || 'bar',
				...(region ? { region } : {}),
				verified: rule.verified !== false,
				evidenceSource: rule.evidenceSource || 'author-supplied synthesis',
				altText: rule.altText || sketch?.altText || 'Chart',
				chartOptions: { showTitle: false, showLegend: true, showValue: true, ...(rule.chartOptions || rule.block?.chartOptions || {}) },
				data: Array.isArray(payload) ? payload : [],
			}
		}
		if (rule.block && typeof rule.block === 'object') {
			return { ...rule.block, kind, name, ...(region ? { region } : {}) }
		}
		const rest = { ...rule }
		delete rest.replaceSketch
		delete rest.selection
		delete rest.slideId
		delete rest.slideIndex
		delete rest.htmlWorld
		delete rest.chartPresetId
		delete rest.coherenceReason
		return { ...rest, kind, name, ...(region ? { region } : {}) }
	}

	for (const rule of niceties) {
		if (!rule || typeof rule !== 'object') continue
		const index = matchSlide(rule)
		const slide = index >= 0 ? slides[index] : null
		if (!slide) continue
		const used = new Set(slide.content.map(block => block?.name).filter(Boolean))
		const sketchName = rule.replaceSketch
		const sketchIndex = sketchName
			? slide.content.findIndex(block => block?.kind === 'htmlSketch' && (block.sketch === sketchName || block.name === sketchName || block.name === rule.name))
			: -1
		const sketch = sketchIndex >= 0 ? slide.content[sketchIndex] : null
		if (sketch?.name) used.delete(sketch.name)
		const native = nicetyBlock(rule, used, sketch)
		if (native) {
			if (sketchIndex >= 0) slide.content[sketchIndex] = native
			else slide.content.push(native)
		}
		if (rule.transition && typeof rule.transition === 'object') {
			slide.transition = { ...(slide.transition || {}), ...rule.transition }
		}
		const selection = rule.selection && typeof rule.selection === 'object' ? { ...rule.selection } : null
		if (!selection && rule.chartPresetId && (native?.kind === 'chart-panel' || rule.kind === 'chart-panel')) {
			selections.push({
				slideId: slide.id,
				target: native?.name || rule.name || 'plot',
				capability: 'chart',
				representation: 'native',
				selectors: { chartPresetId: rule.chartPresetId },
				coherenceReason: rule.coherenceReason || 'Native chart replaces the HTML plot sketch.',
			})
		} else if (selection) {
			selections.push({
				slideId: slide.id,
				target: selection.target || native?.name || rule.name,
				capability: selection.capability || (native?.kind === 'chart-panel' ? 'chart' : selection.capability),
				representation: selection.representation || 'native',
				selectors: selection.selectors || (rule.chartPresetId ? { chartPresetId: rule.chartPresetId } : {}),
				coherenceReason: selection.coherenceReason || rule.coherenceReason || 'PowerPoint nicety attached after the HTML original.',
				...(selection.customReason ? { customReason: selection.customReason } : {}),
			})
		}
	}

	for (const slide of slides) {
		slide.content = slide.content.filter(block => block?.kind !== 'htmlSketch')
	}

	const next = { ...spec, slides }
	if (selections.length) {
		const seen = new Set()
		const deduped = []
		for (const selection of selections) {
			const key = `${selection.slideId || ''}::${selection.target || ''}::${selection.capability || ''}`
			if (seen.has(key)) continue
			seen.add(key)
			deduped.push(selection)
		}
		next.selectionManifest = {
			schemaVersion: spec.selectionManifest?.schemaVersion || 'betterpptx.ai-selection-manifest.v1',
			enforcement: spec.selectionManifest?.enforcement || 'required',
			...(spec.selectionManifest || {}),
			selections: deduped,
		}
	}
	delete next.niceties
	delete next.powerpointNiceties
	return next
}

function ensureHtmlDirectorContract(spec, { canvas = false, title = '' } = {}) {
	if (!spec || typeof spec !== 'object') return spec
	const next = { ...spec }
	if (!next.schemaVersion) next.schemaVersion = 'betterpptx.deck-spec.v1'
	if (!next.title) next.title = title || 'HTML original'
	if (!next.authoringContract || typeof next.authoringContract !== 'object') {
		next.authoringContract = { workflow: 'authoring-excellence-director-v1' }
	} else if (!next.authoringContract.workflow) {
		next.authoringContract = { ...next.authoringContract, workflow: 'authoring-excellence-director-v1' }
	}
	if (canvas) {
		next.authoringContract = {
			...next.authoringContract,
			htmlStagePolicy: 'preserve-canvas-geometry',
			source: next.authoringContract.source || 'html-canvas',
			readabilityPolicy: next.authoringContract.readabilityPolicy || 'faithful-html',
		}
		const validation = next.validation && typeof next.validation === 'object' ? next.validation : {}
		next.validation = {
			...validation,
			readabilityPolicy: validation.readabilityPolicy || 'faithful-html',
		}
	}
	const story = next.contentStory && typeof next.contentStory === 'object' ? next.contentStory : {}
	if (!story.audience || !(story.outcome || story.objective || story.promise) || !(story.remember || story.thesis || story.takeaway)) {
		next.contentStory = {
			audience: story.audience || 'the audience of the designed HTML original',
			outcome: story.outcome || story.objective || story.promise || `Realize the designed HTML original "${next.title}" as native PowerPoint`,
			remember: story.remember || story.thesis || story.takeaway || 'The PowerPoint composition matches the HTML 16:9 stage',
		}
	}
	next.morphPolicy = {
		unmatched: 'warn',
		fallback: 'fade',
		...(next.morphPolicy && typeof next.morphPolicy === 'object' ? next.morphPolicy : {}),
	}
	next.fontPolicy = {
		mode: 'substitute-and-warn',
		...(next.fontPolicy && typeof next.fontPolicy === 'object' ? next.fontPolicy : {}),
		...(next.validation?.fontPolicy && typeof next.validation.fontPolicy === 'object' ? next.validation.fontPolicy : {}),
	}
	if (next.outputVariant && !Array.isArray(next.selectedOutputVariants)) {
		next.selectedOutputVariants = [next.outputVariant]
	} else if (Array.isArray(next.selectedOutputVariants) && next.selectedOutputVariants.length && !next.outputVariant) {
		next.outputVariant = next.selectedOutputVariants[0]
	} else if (next.narration && next.narration.synthesizeAudio === false && next.narration.preserveInNotes && !next.outputVariant) {
		next.outputVariant = 'silent-timed-notes'
		next.selectedOutputVariants = next.selectedOutputVariants || ['silent-timed-notes']
	}
	const visual = next.visualDesign && typeof next.visualDesign === 'object' ? next.visualDesign : {}
	if (!(visual.world || visual.artDirection || visual.visualWorld) || !(visual.framing || visual.visualPromise || visual.composition || visual.palette)) {
		next.visualDesign = {
			world: visual.world || visual.artDirection || next.styleIntent?.artDirection || 'luxe',
			framing: visual.framing || visual.visualPromise || visual.composition || visual.palette || (canvas ? 'fixed 16:9 HTML canvas stage' : 'semantic HTML slide original'),
		}
	}
	const motion = next.motionTime && typeof next.motionTime === 'object' ? next.motionTime : {}
	if (!(motion.masterClock || motion.clock) || !(motion.timingSource || motion.timeline || motion.synchronization || motion.syncPolicy)) {
		next.motionTime = {
			masterClock: motion.masterClock || motion.clock || (canvas ? 'authored' : 'visual'),
			timingSource: motion.timingSource || motion.timeline || motion.synchronization || motion.syncPolicy || (canvas ? 'html-stage autoplay' : 'html-slide original'),
		}
	}
	return expandAtmosphereSpec(applyHtmlCueManifest(next))
}

export function applyHtmlCueManifest(spec) {
	const manifest = spec.htmlCueManifest
	if (!manifest || typeof manifest !== 'object') return spec
	const cues = flattenHtmlCueManifest(manifest)
	if (!cues.length) return spec
	const silent = spec.outputVariant === 'silent-timed-notes' || spec.narration?.synthesizeAudio === false
	const narrated = spec.narration?.synthesizeAudio !== false && spec.outputVariant !== 'silent-timed-notes'
	;(spec.slides || []).forEach((slide, slideIndex) => {
		const rows = cues.filter(cue => cueBelongsToSlide(cue, slide, slideIndex))
		if (!rows.length) return
		const script = rows.map(cue => cue.text || cue.script || cue.phrase || cue.atPhrase).filter(Boolean).join(' ')
		if (script && (!slide.notes || /Lowered from/.test(slide.notes))) slide.notes = script
		if (silent || !narrated) return
		const existing = slide.narration && typeof slide.narration === 'object' ? slide.narration : {}
		const existingCues = Array.isArray(existing.cues) && existing.cues.length
			? existing.cues
			: Array.isArray(existing.timing?.cues) && existing.timing.cues.length
				? existing.timing.cues
				: rows
		slide.narration = {
			...existing,
			enabled: true,
			script: existing.script || existing.text || script,
			text: existing.text || existing.script || script,
			cues: existingCues,
			timing: {
				...(existing.timing || {}),
				cues: existing.timing?.cues?.length ? existing.timing.cues : existingCues,
			},
			synthesizeAudio: !silent,
			preserveInNotes: true,
			useAsTimingAuthority: true,
			useGeneratedAudioAsTimingAuthority: !silent,
			voice: existing.voice || spec.narration?.voiceId || spec.narration?.voice,
		}
	})
	return spec
}

export function lowerHtmlAuthoringSurface(spec = {}) {
	if (!spec || typeof spec !== 'object') return spec
	const deckHtml = typeof spec.html === 'string' && spec.html.trim() ? spec.html : ''
	const assetMap = spec.htmlAssetMap && typeof spec.htmlAssetMap === 'object' ? spec.htmlAssetMap : (spec.htmlAssets && typeof spec.htmlAssets === 'object' ? spec.htmlAssets : {})
	const slides = Array.isArray(spec.slides) ? spec.slides.map(slide => ({ ...slide })) : []
	if (deckHtml) {
		const classStyles = parseStyleSheet(deckHtml)
		const lowered = lowerHtmlSlides(deckHtml, { assetMap, classStyles, fallbackPolicy: spec.fallbackPolicy || {} })
		if (lowered.length) {
			const merged = lowered.map((next, index) => {
				const existing = slides[index] || {}
				return {
					...existing,
					...next,
					id: existing.id || next.id,
					title: existing.title || next.title,
					content: next.content,
					layoutIntent: existing.layoutIntent && LAYOUT_INTENTS.has(existing.layoutIntent) ? existing.layoutIntent : next.layoutIntent,
				}
			})
			const world = merged.find(slide => slide.htmlWorld)?.htmlWorld
			const canvas = merged.some(slide => slide.htmlCanvas)
			const nextSpec = ensureHtmlDirectorContract({
				...spec,
				slides: merged,
				htmlFontStacks: classStyles.__fontStacks || spec.htmlFontStacks || [],
				detectedSourceModes: spec.detectedSourceModes || detectHtmlSourceModes(deckHtml),
				...(world && !spec.styleIntent?.artDirection ? { styleIntent: { ...(spec.styleIntent || {}), artDirection: world } } : {}),
				...(world && !spec.visualDesign?.world ? { visualDesign: { ...(spec.visualDesign || {}), world } } : {}),
			}, { canvas, title: spec.title || merged[0]?.title })
			delete nextSpec.html
			return applyPowerpointNiceties(promoteColumnHeadlines(nextSpec))
		}
	}
	let changed = false
	const nextSlides = slides.map(slide => {
		if (typeof slide?.html !== 'string' || !slide.html.trim()) return slide
		const lowered = lowerHtmlSlide(slide.html, { id: slide.id, title: slide.title, message: slide.message, notes: slide.notes, assetMap, fallbackPolicy: spec.fallbackPolicy || {} })
		changed = true
		const { html, ...rest } = slide
		return {
			...rest,
			...lowered,
			id: rest.id || lowered.id,
			title: rest.title || lowered.title,
			content: Array.isArray(rest.content) && rest.content.length ? rest.content : lowered.content,
			layoutIntent: rest.layoutIntent && LAYOUT_INTENTS.has(rest.layoutIntent) ? rest.layoutIntent : lowered.layoutIntent,
		}
	})
	const nextSpec = changed ? ensureHtmlDirectorContract({ ...spec, slides: nextSlides }, { canvas: nextSlides.some(slide => slide.htmlCanvas), title: spec.title }) : spec
	return applyPowerpointNiceties(promoteColumnHeadlines(nextSpec))
}
