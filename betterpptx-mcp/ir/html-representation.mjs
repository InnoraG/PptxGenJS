/**
 * Source-derived HTML representation decisions.
 * Counts come from the current original. They are not API constants.
 */
import { readdirSync } from 'node:fs'

export const REPRESENTATION_DECISIONS = Object.freeze([
	'native-exact',
	'native-composite',
	'editable-custom-geometry',
	'preserved-vector',
	'isolated-raster-element',
	'whole-slide-raster',
])

const GENERIC_FONT = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif)$/i
const HOST_SAFE_FONTS = new Set(['segoe ui', 'calibri', 'arial', 'arial black', 'tahoma', 'verdana', 'georgia', 'times new roman', 'consolas', 'cambria', 'segoe ui semibold', 'segoe ui light', 'segoe ui semilight', 'aptos'])

let cachedInstalledFonts = null

function installedFontIndex() {
	if (cachedInstalledFonts) return cachedInstalledFonts
	const names = new Set(HOST_SAFE_FONTS)
	const dirs = []
	if (process.platform === 'win32') dirs.push('C:\\Windows\\Fonts')
	else if (process.platform === 'darwin') dirs.push('/Library/Fonts', `${process.env.HOME || ''}/Library/Fonts`)
	else dirs.push('/usr/share/fonts')
	for (const dir of dirs) {
		try {
			for (const file of readdirSync(dir)) {
				const stem = String(file).replace(/\.(ttf|otf|ttc|woff2?)$/i, '').replace(/[-_]/g, ' ').toLowerCase()
				if (stem) names.add(stem)
			}
		} catch { /* host fonts are advisory */ }
	}
	cachedInstalledFonts = names
	return names
}

export function fontFaceAvailable(face) {
	const needle = String(face || '').trim().toLowerCase()
	if (!needle) return false
	const installed = installedFontIndex()
	if (installed.has(needle)) return true
	// Font-family matching must be token-boundary based. A raw substring test
	// makes "Inter" appear installed merely because a system file contains
	// "Interface", which then causes PowerPoint to perform an unstable mystery
	// substitution instead of using the declared CSS fallback.
	return [...installed].some(item => item.startsWith(`${needle} `) || needle.startsWith(`${item} `))
}
const UNSUPPORTED_SVG = /<(?:filter|feTurbulence|feGaussianBlur|feColorMatrix|feBlend|feOffset|feFlood|feComposite|feMorphology|feDisplacementMap|clipPath|mask)\b|mix-blend-mode\s*:/i
const CSS_UNSUPPORTED = /blur\(|drop-shadow\(|url\(#|mix-blend-mode|backdrop-filter/i

export function fontFamilyStackFromCss(value) {
	return String(value || '')
		.split(',')
		.map(part => part.trim().replace(/^['"]+|['"]+$/g, '').trim())
		.filter(face => face && !GENERIC_FONT.test(face) && !/^(normal|italic|oblique|bold|inherit|initial)$/i.test(face))
}

export function svgUnsupportedFilterReasons(svg = '') {
	const xml = String(svg || '')
	const reasons = []
	if (/<feTurbulence\b/i.test(xml)) reasons.push('feTurbulence')
	if (/<feGaussianBlur\b/i.test(xml)) reasons.push('feGaussianBlur')
	if (/<feDisplacementMap\b/i.test(xml)) reasons.push('feDisplacementMap')
	if (/<feColorMatrix\b/i.test(xml)) reasons.push('feColorMatrix')
	if (/<filter\b/i.test(xml) && !reasons.length) reasons.push('svg-filter')
	if (/<clipPath\b|<mask\b/i.test(xml)) reasons.push('clip-or-mask')
	return reasons
}

export function cssUnsupportedEffectReasons(css = {}) {
	const blob = `${css.filter || ''} ${css['-webkit-filter'] || ''} ${css['backdrop-filter'] || ''} ${css['mix-blend-mode'] || ''}`
	const reasons = []
	if (/blur\(/i.test(blob)) reasons.push('css-blur')
	if (/mix-blend-mode/i.test(`${css['mix-blend-mode'] || ''}`) && css['mix-blend-mode'] && css['mix-blend-mode'] !== 'normal') reasons.push('mix-blend-mode')
	if (/backdrop-filter/i.test(blob) || css['backdrop-filter']) reasons.push('backdrop-filter')
	if (/url\(#/i.test(blob)) reasons.push('css-filter-url')
	if (CSS_UNSUPPORTED.test(blob) && !reasons.length && !/drop-shadow\(/i.test(blob)) reasons.push('css-filter')
	return reasons
}

export const NATIVE_ATMOSPHERE_LADDER = Object.freeze([
	'native-fill',
	'native-shape-or-freeform',
	'native-image-adjustment',
	'native-effect-list',
	'native-effect-dag',
	'native-3d',
	'native-picture-or-texture-fill',
	'preserved-editable-svg',
	'minimal-generated-fallback-asset',
])

const NATIVE_FILTER_MAP = Object.freeze({
	feGaussianBlur: { compiledAs: 'native-blur', status: 'exact-native' },
	'css-blur': { compiledAs: 'native-blur', status: 'exact-native' },
	'mix-blend-mode': { compiledAs: 'native-fill-overlay', status: 'exact-native' },
	'shadow-or-glow': { compiledAs: 'native-shadow-or-glow', status: 'exact-native' },
	transparency: { compiledAs: 'native-transparency', status: 'exact-native' },
	'soft-edge': { compiledAs: 'native-soft-edge', status: 'exact-native' },
	feColorMatrix: { compiledAs: 'native-picture-adjustment', status: 'native-approximation' },
	'clip-or-mask': { compiledAs: 'native-geometry-or-crop', status: 'native-approximation' },
	feTurbulence: { compiledAs: 'generated-tile-texture', status: 'minimal-fallback', reason: 'No equivalent PowerPoint procedural-noise generator' },
	feDisplacementMap: { compiledAs: 'local-transparent-overlay', status: 'minimal-fallback', reason: 'No equivalent PowerPoint displacement map' },
	'backdrop-filter': { compiledAs: 'cropped-backdrop-fragment', status: 'minimal-fallback', reason: 'Browser backdrop filters are not a DrawingML primitive' },
	'svg-filter': { compiledAs: 'native-effect-list-or-fallback', status: 'native-approximation' },
	'css-filter-url': { compiledAs: 'native-effect-list-or-fallback', status: 'native-approximation' },
	'css-filter': { compiledAs: 'native-effect-list-or-fallback', status: 'native-approximation' },
})

export function classifyAtmosphereSource(source, extra = {}) {
	const mapped = NATIVE_FILTER_MAP[source] || { compiledAs: 'unresolved', status: 'unresolved' }
	return {
		source,
		compiledAs: mapped.compiledAs,
		status: mapped.status,
		editability: mapped.status === 'minimal-fallback' ? 'raster-fallback' : mapped.status === 'native-preserved' ? 'native-preserved' : 'ui-editable',
		...(mapped.reason ? { reason: mapped.reason } : {}),
		...extra,
	}
}

export function decomposeAtmosphereSources(sources = []) {
	return [...new Set(sources.filter(Boolean))].map(source => classifyAtmosphereSource(source))
}

export function cssNativeEquivalentReasons(css = {}) {
	const blob = `${css.filter || ''} ${css['-webkit-filter'] || ''} ${css['box-shadow'] || ''} ${css.opacity || ''} ${css['mix-blend-mode'] || ''}`
	const reasons = []
	if (/drop-shadow\(/i.test(blob) || css['box-shadow']) reasons.push('shadow-or-glow')
	if (/blur\(/i.test(blob)) reasons.push('css-blur')
	if (css['mix-blend-mode'] && css['mix-blend-mode'] !== 'normal') reasons.push('mix-blend-mode')
	if (css.opacity && Number(css.opacity) < 1) reasons.push('transparency')
	if (css['soft-edge'] || css['feather']) reasons.push('soft-edge')
	return reasons
}

export function detectHtmlSourceModes(markup = '') {
	const text = String(markup || '')
	const modes = new Set()
	for (const match of text.matchAll(/data-(?:runtime|playback-mode|output-variant|narration-mode)=["']([^"']+)["']/gi)) {
		const token = String(match[1] || '').trim().toLowerCase()
		if (token) modes.add(token)
	}
	return [...modes]
}

export function fallbackLedgerEntry({
	sourceObjectId,
	sourceRepresentation,
	compiledRepresentation,
	nativeComponents = [],
	fallbackComponents = [],
	reason,
	effectOwnerId = null,
	wholeSlideRasterized = false,
	needsIsolatedRaster = false,
	slideId = null,
	fidelityImpact = null,
	editabilityImpact = null,
	aiApprovedDowngrade = false,
	nativeShadow = null,
	nativeBlur = null,
	nativeFillOverlay = null,
	atmosphereNodes = [],
} = {}) {
	const nodes = atmosphereNodes.length ? atmosphereNodes : decomposeAtmosphereSources([...nativeComponents, ...fallbackComponents])
	return {
		sourceObjectId,
		slideId,
		sourceRepresentation,
		compiledRepresentation,
		nativeComponents: [...nativeComponents],
		fallbackComponents: [...fallbackComponents],
		nativeAlternativesConsidered: [...nativeComponents],
		atmosphereNodes: nodes,
		reason,
		fidelityImpact: fidelityImpact || (needsIsolatedRaster ? 'atmosphere-remainder-only' : 'none'),
		editabilityImpact: editabilityImpact || (needsIsolatedRaster ? 'remainder-not-natively-editable' : 'native-editable'),
		aiApprovedDowngrade: aiApprovedDowngrade === true,
		wholeSlideRasterized: wholeSlideRasterized === true,
		needsIsolatedRaster: needsIsolatedRaster === true,
		...(nativeShadow ? { nativeShadow } : {}),
		...(nativeBlur ? { nativeBlur } : {}),
		...(nativeFillOverlay ? { nativeFillOverlay } : {}),
		...(effectOwnerId ? {
			effectOwnerId,
			inheritsTransform: true,
			inheritsCrop: true,
			inheritsVisibility: true,
			inheritsAnimation: true,
		} : {}),
	}
}

// A residual visual may be intentionally accepted by the authoring AI when
// PowerPoint has no equivalent primitive.  Approval is deliberately narrow:
// it must name the exact source effect and an explicit decision token.  This
// keeps a generic compiler honest while allowing a client-authored policy to
// close a known, isolated fidelity gap without flattening the slide.
export function fallbackPolicyApproves(policy = {}, source = '') {
	if (!policy || typeof policy !== 'object' || !source) return false
	const table = policy.unsupportedAtmosphere && typeof policy.unsupportedAtmosphere === 'object'
		? policy.unsupportedAtmosphere
		: policy
	const item = table[source]
	if (item === true) return false
	if (typeof item === 'string') return item.trim().toLowerCase() === 'approve-minimal-isolated-raster'
	if (!item || typeof item !== 'object') return false
	return String(item.decision || item.action || '').trim().toLowerCase() === 'approve-minimal-isolated-raster'
}

export function htmlUnsupportedRepresentationFindings(spec = {}) {
	const findings = []
	for (const slide of spec.slides || []) {
		for (const entry of slide?.htmlFallbacks || []) {
			if (entry?.wholeSlideRasterized) {
				findings.push({
					code: 'HTML_WHOLE_SLIDE_RASTER_FORBIDDEN',
					severity: 'error',
					owner: 'ai-client',
					slideId: slide.id || entry.slideId,
					message: 'Whole-slide rasterization is forbidden. Keep text, geometry, lines, and photos native and isolate only the unsupported remainder.',
					reason: entry.reason || 'A slide was flattened to one picture.',
					fix: 'Decompose the source visual: native fills/shapes first, isolated transparent image only for the unsupported remainder.',
					evidence: entry,
				})
				continue
			}
			if (!entry?.needsIsolatedRaster) continue
			const approved = entry.aiApprovedDowngrade === true
			findings.push({
				code: approved ? 'HTML_UNSUPPORTED_EFFECT_APPROVED_FALLBACK' : 'HTML_UNSUPPORTED_EFFECT_NEEDS_ASSET',
				severity: approved ? 'info' : 'warning',
				owner: 'ai-client',
				slideId: slide.id || entry.slideId,
				objectName: entry.sourceObjectId,
				message: approved
					? `Unsupported ${entry.sourceRepresentation || 'effect'} on ${entry.sourceObjectId} is explicitly approved as an isolated minimal fallback.`
					: `Unsupported ${entry.sourceRepresentation || 'effect'} on ${entry.sourceObjectId} has no isolated raster asset.`,
				reason: entry.reason || 'PowerPoint has no equivalent for this filter or blend. The engine does not screenshot HTML.',
				fix: approved
					? 'Keep the native base and owner link. Replace this approval with a supplied transparent asset or a future native primitive when available; never flatten the slide.'
					: 'Supply a separate transparent image in the HTML package (or a nicety image handle) for the unsupported remainder, keep it selectable, and bind effectOwnerId so it inherits transform and animation. Do not flatten the slide. If the product must rasterize automatically, request MCP evolution.',
				evidence: entry,
				...(approved ? {} : { next: { recommendedTool: 'betterpptx.assets.upload', reason: 'Upload an isolated transparent PNG for the unsupported remainder, or request MCP evolution.' } }),
			})
		}
	}
	return findings
}

export function htmlMorphRequiredPairFindings(spec = {}) {
	const policy = spec.morphPolicy || spec.validation?.morphPolicy || {}
	const required = Array.isArray(policy.requiredPairs) ? policy.requiredPairs : []
	if (!required.length) return []
	const slides = spec.slides || []
	const findings = []
	for (const pair of required) {
		const fromName = pair?.from || pair?.name
		const toName = pair?.to || pair?.name
		if (!fromName || !toName) continue
		for (let index = 1; index < slides.length; index += 1) {
			const from = slides[index - 1]
			const to = slides[index]
			if (String(to?.transition?.type || '').toLowerCase() !== 'morph' && String(from?.transition?.type || '').toLowerCase() !== 'morph') continue
			const fromNames = new Set((from.content || []).map(block => block?.name).filter(Boolean))
			const toNames = new Set((to.content || []).map(block => block?.name).filter(Boolean))
			if (fromNames.has(fromName) && toNames.has(toName)) continue
			findings.push({
				code: 'HTML_MORPH_REQUIRED_PAIR_MISSING',
				severity: policy.requiredPairFailure === 'block' || String(to?.transition?.matchingPolicy || '').toLowerCase() === 'strict' ? 'error' : 'warning',
				owner: 'ai-client',
				slideId: to?.id,
				message: `Required Morph identity ${fromName} → ${toName} is missing between ${from?.id || index} and ${to?.id || index + 1}.`,
				reason: 'AI-declared required Morph pairs must survive compile. Unmatched objects otherwise fade.',
				fix: 'Reuse the same stable name on both slides, or remove the pair from morphPolicy.requiredPairs.',
				evidence: { from: fromName, to: toName, fromSlideId: from?.id, toSlideId: to?.id },
			})
		}
	}
	return findings
}

export function htmlFontSubstitutionFindings(spec = {}) {
	const policy = spec.fontPolicy || spec.validation?.fontPolicy || {}
	if (String(policy.mode || '').toLowerCase() !== 'strict-match') return []
	const stacks = spec.htmlFontStacks || []
	const findings = []
	for (const entry of stacks) {
		const requested = entry?.stack?.[0]
		if (!requested) continue
		if (fontFaceAvailable(requested)) continue
		findings.push({
			code: 'HTML_FONT_STRICT_MATCH_UNAVAILABLE',
			severity: 'error',
			owner: 'ai-client',
			message: `fontPolicy.mode is strict-match and ${requested} is not guaranteed on the compiler or PowerPoint renderer.`,
			reason: 'Exact typography was required. No licensed embeddable font file was supplied, and the engine does not distribute font files.',
			fix: 'Supply a licensed embeddable font file, install the face on both authoring and renderer hosts, or switch fontPolicy.mode to substitute-and-warn.',
			evidence: entry,
		})
	}
	return findings
}

export { UNSUPPORTED_SVG }
