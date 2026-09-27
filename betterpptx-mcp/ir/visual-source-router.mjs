// Deterministic source-selection policy for image authoring.
// This layer decides whether a visual need belongs to native PowerPoint,
// an owned/licensed asset, the private generation lanes, or abstention.
// It never calls an AI service and never receives customer pixels.

const GENERATED = new Set(['generate', 'generated', 'fictionalized', 'conceptual'])

function text(value, max = 500) {
	return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max)
}

function bool(value) {
	return value === true || value === 'true' || value === 1 || value === '1'
}

// Safety constraints such as "no readable text", "without logos", or
// "avoid numbers" describe what must NOT be baked into a generated raster.
// They are not requests for a factual raster.  The router previously treated
// those negative constraints as positive factual signals, which silently
// converted otherwise eligible conceptual images into native/placeholder
// objects.  Keep the factual gate fail-closed for positive requests while
// ignoring only a bounded negated phrase immediately before the signal.
// Allow a bounded comma/list-style safety brief (for example, "no signs,
// labels, logos, or readable text anywhere") to remain a negative constraint.
// The previous six-token bound failed on long but common image-safety lists,
// silently routing conceptual images to native 1x1 placeholders.  Keep the
// window sentence-local and bounded so an explicit positive request later in
// the same sentence still remains visible to the factual gate.
const NEGATED_SIGNAL_PREFIX = /\b(?:no|without|avoid(?:\s+(?:depicting|showing|rendering|including))?|excluding|exclude|free\s+(?:of|from))\b[^.;:!?]{0,180}$/i

function hasPositiveSignal(value, pattern) {
	const source = String(value || '').toLowerCase()
	const matcher = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.replace('g', '')) : new RegExp(String(pattern), 'i')
	const globalMatcher = new RegExp(matcher.source, `${matcher.flags.replace('y', '')}g`)
	for (const match of source.matchAll(globalMatcher)) {
		const prefix = source.slice(Math.max(0, Number(match.index) - 96), Number(match.index))
		if (!NEGATED_SIGNAL_PREFIX.test(prefix)) return true
	}
	return false
}

const FACTUAL_DATA_SIGNAL = /\b(?:chart|graph|kpi|metric|number|numbers|trend|statistics?|statistical|data viz|data visualization)\b/i
// Do not treat ordinary prose such as "the back row" or "a column of
// volunteers" as a request for a raster table.  Bare row/column/cell words
// need a data/table context; otherwise a semantic image brief can be silently
// downgraded to a 1x1 native placeholder.
const FACTUAL_TABLE_SIGNAL = /\b(?:data\s+table|comparison\s+table|table\s+of|tabular|spreadsheet|(?:rows?|columns?|cells?)\s+(?:and|by|of|with|containing)\s+(?:data|values?|labels?|headers?|records?|metrics?)|(?:data|value|label|header|record|metric)\s+(?:rows?|columns?|cells?)|tableau)\b/i
// Story context can contain "roadmap", "comparison", or "timeline" without
// asking the raster to draw a factual diagram. Require an explicit structural
// qualifier before routing those words to native PowerPoint objects; a
// conceptual horizon image must remain generatable.
const FACTUAL_STRUCTURE_SIGNAL = /\b(?:(?:timeline|roadmap)\s+(?:diagram|chart|graphic|visual|schedule|milestones?|quarters?|releases?)|(?:quarter|release|milestone|schedule)\s+(?:roadmap|timeline)|(?:flowchart|org\s+chart|architecture\s+diagram|process\s+diagram|hierarchy))\b/i
const OWNED_ASSET_SIGNAL = /\b(?:logo|trademark|brand mark|user interface|ui screenshot|screenshot|software screen|dashboard)\b/i

function annotationCoordinateValid(value, units, fallback = 0) {
	if (value === undefined || value === null || value === '') return true
	const n = Number(value)
	if (!Number.isFinite(n)) return false
	const max = units === 'percent' || units === '%' ? 100 : 1
	return n >= 0 && n <= max
}

function annotationRectValid(item, units) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) return false
	const fields = ['x', 'y', 'w', 'h']
	if (!fields.every(field => annotationCoordinateValid(item[field], units))) return false
	const max = units === 'percent' || units === '%' ? 100 : 1
	const x = Number(item.x ?? 0), y = Number(item.y ?? 0), w = Number(item.w ?? 0), h = Number(item.h ?? 0)
	if (item.w !== undefined && (!Number.isFinite(w) || w <= 0)) return false
	if (item.h !== undefined && (!Number.isFinite(h) || h <= 0)) return false
	if (item.x !== undefined && item.w !== undefined && x + w > max) return false
	if (item.y !== undefined && item.h !== undefined && y + h > max) return false
	return true
}

function annotationArrowValid(item, units) {
	return annotationRectValid(item, units) && ['x', 'y', 'w', 'h'].some(field => item[field] !== undefined)
}

// Image-aware annotations may intentionally omit authored x/y/w/h.  Their
// geometry is derived later from the generated raster and the named target.
// Keep this narrow: only non-empty, bounded target names are accepted.
function annotationTargetValid(item, nativeAnnotations) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) return false
	const placement = String(nativeAnnotations?.placement || '').trim().toLowerCase()
	const target = text(item.target, 120)
	return placement === 'image-aware' && Boolean(target)
}

function authoredSource(block = {}) {
	const image = block.image
	return Boolean(
		block.data || block.path || block.url || block.assetRef
		|| (typeof image === 'string' && image.trim())
		|| (image && typeof image === 'object' && (image.data || image.path || image.url || image.handle)),
	)
}

function explicitMode(intent = {}) {
	return text(intent.mode || intent.decision || '').toLowerCase().replace(/_/g, '-')
}

function intentText({ spec = {}, slide = {}, block = {}, intent = {} } = {}) {
	return [
		intent.type, intent.kind, intent.purpose, intent.role, intent.concept, intent.subject,
		intent.query, intent.prompt, intent.sourceType, intent.assetType,
		intent.requiredText, intent.renderText, intent.exactText, intent.mustInclude,
		slide.title, slide.message, slide.role, slide.layoutIntent,
		spec.objective, spec.title,
	].map(value => text(value, 240)).filter(Boolean).join(' ')
}

function result(decision, reason, options = {}) {
	return {
		schemaVersion: 'betterpptx.visual-source-route.v1',
		decision,
		reason,
		alternatives: options.alternatives || [],
		rightsClass: options.rightsClass || 'not-applicable',
		editabilityClass: options.editabilityClass || 'not-applicable',
		confidence: Math.max(0, Math.min(1, Number(options.confidence ?? 0.9))),
		safeToGenerate: options.safeToGenerate === true || decision === 'generated' || decision === 'generated-series',
		identityRisk: options.identityRisk || 'none',
		factuality: options.factuality || 'decorative',
	}
}

/**
 * Route one visual need. Strong safety/factual signals outrank a generic
 * `mode:"generate"` request. Unknown or rights-sensitive requests abstain.
 */
export function routeVisualNeed(input = {}) {
	const { spec = {}, slide = {}, block = {}, intent = block.visualIntent || block.generation || {} } = input
	const normalizedIntent = intent && typeof intent === 'object' && !Array.isArray(intent) ? intent : {}
	const combined = intentText({ spec, slide, block, intent: normalizedIntent }).toLowerCase()
	const mode = explicitMode(normalizedIntent)

	if (authoredSource(block)) {
		const rights = text(normalizedIntent.rightsClass || normalizedIntent.rights || block.rightsClass || 'supplied-owned-or-licensed')
		const identityRisk = bool(normalizedIntent.identityCritical) || /identity-critical|known person|presenter|headshot/.test(combined) ? 'high' : 'none'
		return result('owned-asset', 'A supplied or durable asset already exists; preserve it rather than raster-generating a substitute.', {
			rightsClass: rights, editabilityClass: 'editable-raster-wrapper', confidence: 0.99, identityRisk,
		})
	}

	// Hybrid teaching visual: keep the expressive generated raster, but force all
	// factual labels/arrows/topology into native PowerPoint objects. This branch
	// deliberately precedes the broad factual-text rule so an annotated illustration
	// does not get reduced to a text-only diagram or ask an image model to typeset facts.
	const nativeAnnotations = normalizedIntent.nativeAnnotations || normalizedIntent.annotations
	const annotationUnits = nativeAnnotations && typeof nativeAnnotations === 'object' && !Array.isArray(nativeAnnotations)
		? (nativeAnnotations.units === 'percent' || nativeAnnotations.coordinateMode === 'percent' ? 'percent' : 'fraction')
		: 'fraction'
	const rawAnnotationLabels = nativeAnnotations && typeof nativeAnnotations === 'object' && !Array.isArray(nativeAnnotations) && Array.isArray(nativeAnnotations.labels) ? nativeAnnotations.labels : []
	const rawAnnotationArrows = nativeAnnotations && typeof nativeAnnotations === 'object' && !Array.isArray(nativeAnnotations) && Array.isArray(nativeAnnotations.arrows) ? nativeAnnotations.arrows : []
	const invalidAnnotationGeometry = rawAnnotationLabels.some(item => typeof item === 'string'
		? !text(item, 120)
		: !text(item?.text, 120) || (!annotationRectValid(item, annotationUnits) && !annotationTargetValid(item, nativeAnnotations)))
		|| rawAnnotationArrows.some(item => !annotationArrowValid(item, annotationUnits) && !annotationTargetValid(item, nativeAnnotations))
	const annotationLabels = nativeAnnotations && typeof nativeAnnotations === 'object' && !Array.isArray(nativeAnnotations) && Array.isArray(nativeAnnotations.labels)
		? nativeAnnotations.labels.filter(item => typeof item === 'string'
			? text(item, 120)
			: item && typeof item === 'object' && text(item.text, 120) && (annotationRectValid(item, annotationUnits) || annotationTargetValid(item, nativeAnnotations)))
		: []
	const annotationArrows = nativeAnnotations && typeof nativeAnnotations === 'object' && !Array.isArray(nativeAnnotations) && Array.isArray(nativeAnnotations.arrows)
		? nativeAnnotations.arrows.filter(item => annotationArrowValid(item, annotationUnits) || annotationTargetValid(item, nativeAnnotations))
		: []
	const annotationCount = annotationLabels.length + annotationArrows.length
	const annotationFieldPresent = Object.prototype.hasOwnProperty.call(normalizedIntent, 'nativeAnnotations') || Object.prototype.hasOwnProperty.call(normalizedIntent, 'annotations')
	if (annotationFieldPresent && (annotationCount === 0 || invalidAnnotationGeometry)) {
		return result('abstain', invalidAnnotationGeometry
			? 'An annotation request contains a malformed or out-of-bounds label/arrow rectangle; repair the native annotation geometry before any generation.'
			: 'An annotation request was supplied but contains no valid labels or arrows; repair the native annotation payload before any generation.', {
			alternatives: ['provide-valid-native-annotations', 'native-shapes-text'], rightsClass: 'powerpoint-native', editabilityClass: 'native-editable', confidence: 0.99, factuality: 'factual', safeToGenerate: false,
		})
	}
	if (annotationCount > 0) {
		return result('hybrid-generated-native-annotations', 'Use an audited generated illustration for the expressive layer and native PowerPoint text/shapes for every required factual annotation.', {
			alternatives: ['native-shapes-text', 'native-smartart'], rightsClass: 'audited-generation-lane-plus-powerpoint-native', editabilityClass: 'hybrid-native-annotations', confidence: 0.99, factuality: 'factual', safeToGenerate: true,
		})
	}

	// A physical "table" in a scene (reading-room table, kitchen table, etc.)
	// is not a factual tabular raster.  Require an explicit data/table context
	// before routing that word away from conceptual image generation.
	const factual = hasPositiveSignal(combined, /\b(?:chart|graph|kpi|metric|number|numbers|trend|factual|statistics?|statistical|data viz|data visualization|readable text|exact text|rendered text|text in image|typeset|spelling|headline|body copy|caption|label|annotation|logo|trademark|brand mark|user interface|ui screenshot|screenshot|software screen|dashboard)\b/i)
		|| hasPositiveSignal(combined, FACTUAL_STRUCTURE_SIGNAL)
		|| hasPositiveSignal(combined, FACTUAL_TABLE_SIGNAL)
	if (factual || bool(normalizedIntent.factual) || bool(normalizedIntent.requiredText) || bool(normalizedIntent.renderText) || bool(normalizedIntent.exactText) || bool(normalizedIntent.logo) || bool(normalizedIntent.trademark) || bool(normalizedIntent.ui)) {
		if (hasPositiveSignal(combined, FACTUAL_DATA_SIGNAL) || hasPositiveSignal(combined, FACTUAL_TABLE_SIGNAL) || bool(normalizedIntent.factual)) {
			return result('native-chart-table', 'Factual values must remain in native editable chart/table/stat primitives.', {
				alternatives: ['native-shapes', 'native-table'], rightsClass: 'powerpoint-native', editabilityClass: 'native-editable', confidence: 0.99, factuality: 'factual',
			})
		}
		if (hasPositiveSignal(combined, OWNED_ASSET_SIGNAL) || bool(normalizedIntent.logo) || bool(normalizedIntent.trademark) || bool(normalizedIntent.ui)) {
			return result('owned-asset', 'Logos, trademarks and product UI require an owned or authorized supplied asset.', {
				alternatives: ['authorized-screenshot', 'native-text-and-shapes'], rightsClass: 'owned-or-authorized-only', editabilityClass: 'source-preserved', confidence: 0.99, factuality: 'identity-or-brand', identityRisk: 'high',
			})
		}
		return result('native-shapes-text', 'Required readable text and factual topology belong in native PowerPoint text, shapes or SmartArt.', {
			alternatives: ['native-smartart', 'native-text'], rightsClass: 'powerpoint-native', editabilityClass: 'native-editable', confidence: 0.98, factuality: 'factual',
		})
	}

	const identityCritical = bool(normalizedIntent.identityCritical) || bool(normalizedIntent.identityRisk) && text(normalizedIntent.identityRisk).toLowerCase() !== 'none' || /\b(identity-critical|specific real person|known person|presenter|avatar|headshot|portrait of [a-z]+ [a-z]+)\b/.test(combined)
	if (identityCritical) {
		return result('consented-presenter', 'Identity-critical people require the separate consented presenter/PhotoFit pipeline, never ordinary text-to-image.', {
			alternatives: ['request-consented-reference', 'native-placeholder'], rightsClass: 'consent-and-owner-controlled', editabilityClass: 'presenter-pipeline', confidence: 0.99, identityRisk: 'high',
		})
	}

	const rightsRisk = text(normalizedIntent.rightsClass || normalizedIntent.rights || '').toLowerCase()
	if (rightsRisk && !/owned|licensed|consented|public-domain|apache/.test(rightsRisk)) {
		return result('abstain', 'Rights class is unclear or restrictive; request an owned/licensed alternative before generating.', {
			alternatives: ['supply-owned-asset', 'search-licensed-stock'], rightsClass: 'unknown', editabilityClass: 'none', confidence: 0.99,
		})
	}

	const realWorld = bool(normalizedIntent.genericRealWorld) || bool(normalizedIntent.realWorldPhotography) || normalizedIntent.sourcePreference === 'stock-first'
	if (realWorld && !bool(normalizedIntent.fictionalized)) {
		return result('licensed-stock', 'Generic real-world photography is stock-first; generate only when the brief is explicitly fictionalized or exact composition is unavailable.', {
			alternatives: ['owned-asset', 'generated-fictionalized'], rightsClass: 'commercial-stock-license', editabilityClass: 'licensed-raster-wrapper', confidence: 0.96,
		})
	}

	const concept = text(normalizedIntent.concept || normalizedIntent.subject || normalizedIntent.query || normalizedIntent.prompt || slide.message || slide.title || spec.objective || spec.title)
	if (!concept) {
		return result('abstain', 'The visual need has no usable concept or supplied source; ask for a concrete brief.', {
			alternatives: ['provide-concept', 'supply-owned-asset'], rightsClass: 'unknown', editabilityClass: 'none', confidence: 0.98,
		})
	}

	const series = text(normalizedIntent.consistencyGroup || normalizedIntent.series)
	if (series && (GENERATED.has(mode) || !mode || mode === 'auto')) {
		return result('generated-series', 'A conceptual series request belongs in the locked World/style anchor pipeline.', {
			alternatives: ['licensed-stock-series', 'native-abstract'], rightsClass: 'audited-generation-lane', editabilityClass: 'editable-raster-wrapper', confidence: 0.94,
		})
	}

	if (mode === 'abstain' || mode === 'unclear' || bool(normalizedIntent.risky) || bool(normalizedIntent.unclear)) {
		return result('abstain', 'The request is marked unclear or risky; do not silently trigger generation.', {
			alternatives: ['clarify-brief', 'licensed-stock', 'native-abstract'], rightsClass: 'unknown', editabilityClass: 'none', confidence: 0.95,
		})
	}

	if (mode === 'stock' || mode === 'licensed-stock') {
		return result('licensed-stock', 'The authored source preference is licensed stock.', {
			alternatives: ['owned-asset', 'generated-fictionalized'], rightsClass: 'commercial-stock-license', editabilityClass: 'licensed-raster-wrapper', confidence: 0.99,
		})
	}

	if (mode === 'native' || mode === 'shapes' || mode === 'smartart') {
		return result('native-shapes-text', 'The authored source preference is native PowerPoint content.', {
			alternatives: ['native-smartart', 'generated-background'], rightsClass: 'powerpoint-native', editabilityClass: 'native-editable', confidence: 0.99,
		})
	}

	return result(series ? 'generated-series' : 'generated', series
		? 'A conceptual visual series is explicitly eligible for the audited generation lanes.'
		: 'The brief is a decorative or conceptual visual where generation provides the requested bespoke composition.', {
		alternatives: ['licensed-stock', 'native-abstract'], rightsClass: 'audited-generation-lane', editabilityClass: 'editable-raster-wrapper', confidence: mode === 'generate' ? 0.98 : 0.9,
	})
}
