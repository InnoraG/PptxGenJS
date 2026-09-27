import { createHash } from 'node:crypto'

import { artDirectionInfo, themeColorSchemeForSpec } from './layout-engine.mjs'
import { buildSeriesCapsules, visualPlanFingerprint } from './series-director.mjs'
import { planImageTreatment } from '../quality/image-treatment-plan.mjs'
import { evaluateSeriesCoherence, planWholeDeckVisualRevision, visualRevisionDigest } from '../quality/series-coherence.mjs'
import { buildImageAccessibilityMetadata } from '../quality/image-accessibility.mjs'
import { routeVisualNeed } from './visual-source-router.mjs'

// Contextual generated-image direction for Authoring Excellence. This module is deliberately
// pure: it turns authored meaning + resolved World + final layout geometry into a deterministic,
// public-safe image brief. The renderer/provider remains an implementation detail downstream.

const WORLD_GRAMMARS = Object.freeze({
	aurora: 'polished contemporary technology visual, deep dimensional atmosphere, restrained luminous accents, clean premium finish',
	editorial: 'editorial magazine photography, documentary restraint, natural grain, quiet composition, sophisticated print sensibility',
	blueprint: 'precise technical illustration, dark substrate, cyan linework, engineered geometry, controlled schematic depth',
	brutalist: 'bold poster composition, hard contrast, large simple forms, limited color palette, uncompromising graphic energy',
	luxe: 'warm cinematic image, premium tactile materials, espresso and gold atmosphere, controlled depth, elegant directional lighting',
	mist: 'airy minimal image, soft daylight, pale surfaces, gentle depth, generous calm negative space',
	atelier: 'crafted editorial image, warm tactile materials, natural imperfections, art-directed studio light',
	meridian: 'credible executive photography, crisp natural lighting, honest corporate environment, confident restrained composition',
	chalkline: 'clear instructional illustration, teacher-like visual hierarchy, simple geometry, precise focal emphasis',
	playbook: 'friendly explanatory illustration, approachable shapes, optimistic color blocks, simple visual storytelling',
	pulse: 'kinetic social-first poster image, high-impact focal subject, energetic crop, vivid controlled contrast',
	collage: 'curated editorial collage, tactile paper layering, photographic fragments, intentional handmade composition',
	observatory: 'analytical scientific visual, precise spatial hierarchy, dark field, luminous evidence-like detail',
	storybook: 'warm picture-book illustration, expressive but simple forms, gentle narrative detail, inviting page composition',
	candy: 'bright glossy illustration, playful rounded forms, clean highlights, joyful controlled palette',
	horizon: 'cinematic full-bleed environmental photography, strong focal depth, natural scale, premium location lighting',
	mono: 'quiet gallery photography, monochrome tonal control, architectural composition, refined visual restraint',
	botanical: 'organic lifestyle image, natural materials, soft daylight, sage and earth atmosphere, tactile living detail',
})

const VALID_STYLES = new Set(['photo', 'illustration', 'background', '3d', 'diagram'])

function clean(value, max = 500) {
	return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max)
}

function first(...values) {
	for (const value of values) {
		if (value && typeof value === 'object') continue
		const out = clean(value)
		if (out) return out
	}
	return ''
}

function directionText(value) {
	if (!value) return ''
	if (typeof value === 'string') return clean(value, 320)
	if (Array.isArray(value)) return clean(value.filter(item => typeof item === 'string').join('; '), 320)
	if (typeof value !== 'object') return clean(value, 320)
	return clean([
		value.direction,
		value.style,
		value.medium,
		value.lighting,
		value.composition,
		value.materials,
		value.palette,
		value.do,
		value.dont ? `avoid ${value.dont}` : '',
	].flat().filter(item => typeof item === 'string').join('; '), 320)
}

function sentence(prefix, value) {
	const body = clean(value)
	if (!body) return ''
	return `${prefix}${body}${/[.!?]$/.test(body) ? '' : '.'}`
}

function asIntent(block = {}) {
	const raw = block.visualIntent ?? block.generation ?? (block.generate === true ? { mode: 'generate' } : null)
	if (typeof raw === 'string') return { mode: 'auto', concept: raw }
	return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
}

function referenceHandlesFor(intent = {}) {
	const raw = intent.referenceHandles ?? intent.referenceAssets ?? intent.references ?? []
	return (Array.isArray(raw) ? raw : [raw])
		.map(value => typeof value === 'string' ? value.trim() : '')
		.filter(Boolean)
		.slice(0, 4)
}

function nativeAnnotationPlanFor(intent = {}) {
	const raw = intent.nativeAnnotations || intent.annotations
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
	const labels = (Array.isArray(raw.labels) ? raw.labels : [])
		.map(item => typeof item === 'string' ? { text: item } : item)
		.filter(item => item && typeof item === 'object' && clean(item.text, 120))
		.slice(0, 24)
		.map(item => ({ text: clean(item.text, 120), ...(item.target !== undefined ? { target: clean(item.target, 40) } : {}), ...(item.x !== undefined ? { x: Number(item.x) } : {}), ...(item.y !== undefined ? { y: Number(item.y) } : {}), ...(item.w !== undefined ? { w: Number(item.w) } : {}), ...(item.h !== undefined ? { h: Number(item.h) } : {}), ...(item.fontSize !== undefined ? { fontSize: Number(item.fontSize) } : {}), ...(item.bold !== undefined ? { bold: item.bold !== false } : {}) }))
	const arrows = (Array.isArray(raw.arrows) ? raw.arrows : [])
		.filter(item => item && typeof item === 'object')
		.slice(0, 24)
		.map(item => ({ ...(item.target !== undefined ? { target: clean(item.target, 40) } : {}), ...(item.x !== undefined ? { x: Number(item.x) } : {}), ...(item.y !== undefined ? { y: Number(item.y) } : {}), ...(item.w !== undefined ? { w: Number(item.w) } : {}), ...(item.h !== undefined ? { h: Number(item.h) } : {}), ...(item.beginArrowType ? { beginArrowType: clean(item.beginArrowType, 32) } : {}), ...(item.endArrowType ? { endArrowType: clean(item.endArrowType, 32) } : {}), ...(item.width !== undefined ? { width: Number(item.width) } : {}), ...(item.flipH !== undefined ? { flipH: item.flipH === true } : {}), ...(item.flipV !== undefined ? { flipV: item.flipV === true } : {}) }))
	if (!labels.length && !arrows.length) return null
	return { mode: 'native-overlay', ...(raw.units ? { units: clean(raw.units, 16) } : {}), ...(raw.placement ? { placement: clean(raw.placement, 48) } : {}), labels, arrows, labelCount: labels.length, arrowCount: arrows.length }
}

function capabilityFor(intent = {}, referenceCount = 0) {
	const raw = clean(intent.capability || intent.operation || 'auto').toLowerCase().replace(/_/g, '-')
	if (!raw || raw === 'auto') return referenceCount > 1 ? 'multi-reference' : referenceCount === 1 ? 'reference' : 'create'
	if (['generate', 'text-to-image', 't2i'].includes(raw)) return 'create'
	if (['revise', 'variation', 'image-to-image', 'img2img', 'i2i'].includes(raw)) return 'edit'
	if (['single-reference', 'reference-image'].includes(raw)) return 'reference'
	if (['multireference', 'multiple-reference', 'multi-ref'].includes(raw)) return 'multi-reference'
	return ['create', 'edit', 'reference', 'multi-reference'].includes(raw) ? raw : 'create'
}

// Candidate generation is a bounded policy, not an instruction to retry until
// something looks good. The public plan records only capability lanes; the
// private provider/model choice remains in provenance. Premium cross-model
// comparison is opt-in so ordinary requests do not spend a second lane.
function candidatePlanFor(intent = {}, capability = 'create') {
	const profile = clean(intent.qualityProfile || intent.quality || 'standard').toLowerCase()
	const defaults = profile === 'economy'
		? { maxCandidates: 1, maxRepairs: 0 }
		: profile === 'premium'
			? { maxCandidates: 3, maxRepairs: 2 }
			: profile === 'research'
				? { maxCandidates: 4, maxRepairs: 2 }
				: { maxCandidates: 2, maxRepairs: 1 }
	const budget = intent.budget && typeof intent.budget === 'object' ? intent.budget : {}
	const limit = profile === 'research' ? 8 : 5
	const clamp = (value, fallback, max) => Math.max(0, Math.min(max, Math.round(Number(value) || fallback)))
	const maxCandidates = Math.max(1, clamp(budget.maxCandidates, defaults.maxCandidates, limit))
	const maxRepairs = clamp(budget.maxRepairs, defaults.maxRepairs, 3)
	const crossModelEnsemble = intent.crossModelEnsemble === true || intent.ensemble === true
	const variationAxes = ['composition', 'medium', 'metaphor', 'lighting'].slice(0, maxCandidates)
	const lanes = crossModelEnsemble && capability === 'create' ? ['create', 'reference'] : [capability]
	const hardGenerationCallCeiling = maxCandidates + maxRepairs + (crossModelEnsemble && capability === 'create' ? 1 : 0)
	return {
		profile: ['economy', 'standard', 'premium', 'research'].includes(profile) ? profile : 'standard',
		initialCandidates: maxCandidates,
		maxRepairs,
		hardGenerationCallCeiling,
		variationAxes,
		crossModelEnsemble,
		capabilityLanes: lanes,
		selection: 'hard-gates-then-independent-evaluator-or-abstain',
	}
}

function evaluationPlanFor(intent = {}, capability = 'create', candidatePlan = {}) {
	const criterion = clean(intent.imageQualityCriterion || intent.qualityCriterion || intent.researchQualityCriterion).toLowerCase()
	const sharpnessFirstResearch = criterion === 'sharpness-first' || intent.researchSharpnessFirst === true
	return {
		hardGates: [
			'valid-payload-and-requested-aspect',
			'minimum-effective-resolution-after-crop',
			'no-unwanted-readable-text-or-brand-marks',
			'required-focal-subject-and-quiet-space',
			'mask-integrity-when-requested',
			'license-provenance-complete',
			'accepted-cost-within-ceiling',
		],
		softDimensions: {
			messageFit: 0.30,
			composition: 0.25,
			worldFit: 0.15,
			seriesCoherence: 0.15,
			technicalVisualQuality: 0.10,
			paletteCompatibility: 0.05,
		},
		selection: sharpnessFirstResearch
			? 'hard-gates-then-sharpness-proxy-or-private-independent-evaluator-or-abstain'
			: candidatePlan.selection,
		sharpnessFirstResearch,
		independentJudge: { mode: 'private-independent', requiredForPromotion: true, autoAccept: false },
		capability,
	}
}

function repairPolicyFor(intent = {}, candidatePlan = {}) {
	const requested = Array.isArray(intent.repairOrder) ? intent.repairOrder : []
	const defaults = ['diagnose-failure', 'targeted-reference-edit-or-reframe', 'bounded-regenerate', 'best-prior-or-safe-fallback']
	const repairOrder = [...new Set([...requested, ...defaults].map(value => clean(value, 80)).filter(Boolean))].slice(0, 8)
	return {
		maxAttempts: candidatePlan.maxRepairs,
		preserveAcceptedPixelsOutsideDiagnosis: true,
		retainBestPrior: true,
		repairOrder,
		abstainWhenUnresolved: true,
	}
}

function fallbackOrderFor(intent = {}) {
	const requested = Array.isArray(intent.fallbackOrder) ? intent.fallbackOrder : []
	const defaults = ['accepted-cache', 'licensed-stock', 'native-abstract', 'abstain']
	return [...new Set([...requested, ...defaults].map(value => clean(value, 80)).filter(Boolean))].slice(0, 8)
}

export function hasAuthoredImageSource(block = {}) {
	const image = block.image
	return Boolean(
		block.data || block.path || block.url || block.assetRef
		|| (typeof image === 'string' && image.trim())
		|| (image && typeof image === 'object' && (image.data || image.path || image.url || image.handle)),
	)
}

export function wantsGeneratedVisual(block = {}) {
	const intent = asIntent(block)
	if (!intent || hasAuthoredImageSource(block)) return false
	const mode = clean(intent.mode || intent.decision || 'auto').toLowerCase()
	return !['off', 'none', 'manual', 'stock', 'native', 'disabled'].includes(mode)
}

function aspectFor(rect = {}, intent = {}) {
	const explicit = clean(intent.aspect).toLowerCase()
	if (['square', 'landscape', 'portrait'].includes(explicit)) return explicit
	const w = Number(rect.w)
	const h = Number(rect.h)
	if (!(w > 0 && h > 0)) return 'landscape'
	const ratio = w / h
	if (ratio < 0.85) return 'portrait'
	if (ratio <= 1.2) return 'square'
	return 'landscape'
}

function styleFor(intent = {}, purpose = '') {
	const explicit = clean(intent.style || intent.medium).toLowerCase()
	if (VALID_STYLES.has(explicit)) return explicit
	if (/background|texture|atmosphere|divider/.test(purpose)) return 'background'
	if (/illustrat|explain|concept|metaphor|story/.test(`${purpose} ${clean(intent.type)}`)) return 'illustration'
	return 'photo'
}

function paletteFor(spec = {}) {
	const raw = Array.isArray(spec.theme?.palette) && spec.theme.palette.length
		? spec.theme.palette
		: (Array.isArray(spec.styleIntent?.palette) ? spec.styleIntent.palette : null)
	if (raw) return raw.slice(0, 5).map(v => clean(v).replace(/^#/, '').toUpperCase()).filter(Boolean)
	const scheme = themeColorSchemeForSpec(spec)
	return [scheme.accent1, scheme.accent2, scheme.accent3].filter(Boolean)
}

function visualSystemDirection(spec = {}) {
	const system = spec.designSystem || spec.styleIntent?.designSystem || {}
	const visual = system.visualAssetEcosystem || system.visualAssets || system.assetRules || spec.visualAssetEcosystem || {}
	if (typeof visual === 'string') return clean(visual, 320)
	if (!visual || typeof visual !== 'object' || Array.isArray(visual)) return ''
	return directionText(
		visual.generationDirection,
	) || directionText(visual.imageryDirection)
		|| directionText(visual.imagery)
		|| directionText(visual.imageStyle)
		|| directionText(visual.artDirection)
		|| directionText(visual.rules)
		|| directionText(visual.policy)
}

function compositionDirection(intent = {}, slide = {}) {
	const subject = clean(intent.subjectPlacement || intent.focalPlacement || intent.placement).toLowerCase()
	const quiet = clean(intent.negativeSpace || intent.quietSpace || intent.copySpace).toLowerCase()
	const parts = []
	if (subject) parts.push(`Place the primary subject in the ${subject} portion of the frame.`)
	if (quiet) {
		parts.push(`Keep the ${quiet} 45% of the frame visually quiet with generous negative space for presentation copy.`)
		if (/left|right/.test(quiet)) {
			parts.push(`Composition hard constraint: reserve that ${quiet} 45% as a plain, low-detail, low-edge-density background; keep the visual mass, objects, people, shelves, posters, boards, pages, and other high-contrast detail in the opposite 45% only.`)
		} else if (/top|bottom/.test(quiet)) {
			parts.push(`Composition hard constraint: reserve that ${quiet} 45% as a plain, low-detail, low-edge-density background; keep the visual mass and high-contrast detail in the opposite 45% only.`)
		}
	}
	if (!subject && !quiet && /copy-left-image-right/i.test(slide.layoutIntent || '')) parts.push('Keep the composition strongest on the right with an uncluttered edge around the focal subject.')
	if (!subject && !quiet && /image-left-copy-right/i.test(slide.layoutIntent || '')) parts.push('Keep the composition strongest on the left with an uncluttered edge around the focal subject.')
	parts.push('Keep important subjects away from crop-sensitive edges.')
	return parts.join(' ')
}

function regionForDirection(value, kind) {
	const direction = clean(value).toLowerCase()
	if (!direction) return null
	if (kind === 'focal') {
		if (/right/.test(direction)) return { x: 48, y: 8, w: 48, h: 84 }
		if (/left/.test(direction)) return { x: 4, y: 8, w: 48, h: 84 }
		if (/top/.test(direction)) return { x: 16, y: 4, w: 68, h: 50 }
		if (/bottom/.test(direction)) return { x: 16, y: 46, w: 68, h: 50 }
		if (/center|middle/.test(direction)) return { x: 16, y: 12, w: 68, h: 76 }
	}
	// Quiet space follows the author's declared negative-space side.  Keep the
	// quiet region on that same side (the focal region uses the corresponding
	// left/right half); the previous mapping inverted these two directions and
	// could reject an otherwise valid generated composition at the hard gate.
	if (/right/.test(direction)) return { x: 55, y: 0, w: 45, h: 100 }
	if (/left/.test(direction)) return { x: 0, y: 0, w: 45, h: 100 }
	if (/top/.test(direction)) return { x: 0, y: 0, w: 100, h: 45 }
	if (/bottom/.test(direction)) return { x: 0, y: 55, w: 100, h: 45 }
	return null
}

function worldFor(spec = {}) {
	const info = artDirectionInfo(spec) || { key: 'aurora', label: 'Aurora', mode: spec.styleIntent?.mode || spec.theme?.mode || 'dark', card: 'glass', bespoke: false }
	const grammar = WORLD_GRAMMARS[info.key]
		|| `cohesive ${clean(info.label || 'bespoke')} art direction, ${clean(info.mode)} mode, ${clean(info.card)} material language`
	return { ...info, grammar }
}

export function buildVisualGenerationPlan({ spec = {}, slide = {}, block = {}, rect = {} } = {}) {
	if (!wantsGeneratedVisual(block)) return null
	const intent = asIntent(block) || {}
	const sourceRoute = routeVisualNeed({ spec, slide, block, intent })
	if (!sourceRoute.safeToGenerate) return null
	// Generated presentation pixels are an image layer, never a typesetting
	// surface.  The prompt below already forbids words, labels, logos and UI; make
	// that policy executable for every generated plan instead of relying on an AI
	// client to remember an optional flag.  This also activates the deterministic
	// OCR hard gate and bounded repair path, so a raster containing readable text
	// cannot be accepted merely because its dimensions are valid.
	const noText = true
	const world = worldFor(spec)
	const purpose = first(intent.purpose, intent.role, block.role, 'supporting presentation visual')
	const concept = first(intent.concept, intent.subject, intent.query, intent.prompt, slide.message, slide.title, spec.objective, spec.title)
	if (!concept) return null
	const aspect = aspectFor(rect, intent)
	const style = styleFor(intent, purpose)
	const palette = paletteFor(spec)
	const audience = first(spec.audience, spec.messageArchitecture?.audience)
	const objective = first(spec.objective, spec.messageArchitecture?.objective, spec.title)
	const slideMessage = first(slide.message, slide.title)
	const role = first(slide.role, slide.layoutIntent)
	const consistencyGroup = first(intent.consistencyGroup, intent.series)
	const referenceHandles = referenceHandlesFor(intent)
	const nativeAnnotations = nativeAnnotationPlanFor(intent)
	const capability = capabilityFor(intent, referenceHandles.length)
	const candidatePlan = candidatePlanFor(intent, capability)
	const evaluationPlan = evaluationPlanFor(intent, capability, candidatePlan)
	const repairPolicy = repairPolicyFor(intent, candidatePlan)
	const fallbackOrder = fallbackOrderFor(intent)
	const focalRegion = regionForDirection(intent.subjectPlacement || intent.focalPlacement || intent.placement, 'focal')
	const quietRegion = regionForDirection(intent.negativeSpace || intent.quietSpace || intent.copySpace, 'quiet')
	const visualSystem = visualSystemDirection(spec)
	const treatmentPlan = planImageTreatment({
		treatment: intent.treatment || intent.imageTreatment || block.imageTreatment || 'world-grade',
		focalRegion,
		quietRegion,
		referenceHandles,
		region: intent.repairRegion || intent.region,
		cells: intent.cells,
	})
	const article = /^[aeiou]/i.test(purpose) ? 'an' : 'a'
	const promptParts = [
		sentence(capability === 'create'
			? `Create ${article} ${purpose} for a professional presentation: `
			: `Using the supplied reference image${referenceHandles.length === 1 ? '' : 's'}, produce ${article} ${purpose} for a professional presentation: `, concept),
		slideMessage && slideMessage.toLowerCase() !== concept.toLowerCase() ? sentence(`The slide's core message is: `, slideMessage) : '',
		sentence('It must support the presentation objective: ', objective),
		sentence('Visual sophistication and symbolism should suit: ', audience),
		sentence('Communicative slide role: ', role),
		world.grammar + '.',
		visualSystem ? sentence('The authored visual-asset system additionally requires: ', visualSystem) : '',
		palette.length ? `Use a harmonious palette led by ${palette.map(v => `#${v}`).join(', ')} without rendering color swatches.` : '',
		compositionDirection(intent, slide),
		consistencyGroup ? `Keep this in the same visual series as "${consistencyGroup}": reuse the same medium, lighting logic, material vocabulary, and level of detail.` : '',
		clean(intent.mustInclude) ? `Must include: ${clean(intent.mustInclude)}.` : '',
		clean(intent.avoid) ? `Avoid depicting: ${clean(intent.avoid)}.` : '',
		'No words, letters, labels, numbers, captions, logos, signatures, watermarks, interface text, or brand marks in the generated pixels; all factual annotations are supplied as native PowerPoint objects. Do not include signs, posters, chalkboards, screens, monitors, displays, control panels, projectors, worksheets, book pages, labels, or other text-bearing/device-like objects unless they are completely blank and unmarked; never show a visible rectangular screen or monitor. Do not imitate a living artist or a protected character.',
	].filter(Boolean)
	const prompt = promptParts.join(' ')
	const steps = Math.max(1, Math.min(8, Math.round(Number(intent.steps) || 4)))
	const id = createHash('sha256').update(JSON.stringify({ prompt, style, aspect, steps, capability, referenceHandles })).digest('hex').slice(0, 24)
	const plan = {
		schemaVersion: 'betterpptx.visual-generation-plan.v1',
		id,
		decision: 'generate',
		reason: clean(intent.reason) || sourceRoute.reason,
		sourceRoute,
		purpose,
		concept,
		world: { key: world.key, label: clean(world.label).split('—')[0].trim(), mode: world.mode, bespoke: world.bespoke },
		palette,
		context: { objective: objective || null, audience: audience || null, slideMessage: slideMessage || null, slideRole: role || null },
		layout: {
			aspect,
			subjectPlacement: clean(intent.subjectPlacement || intent.focalPlacement || intent.placement) || null,
			negativeSpace: clean(intent.negativeSpace || intent.quietSpace || intent.copySpace) || null,
			targetRect: Number(rect.w) > 0 && Number(rect.h) > 0 ? { x: Number(rect.x) || 0, y: Number(rect.y) || 0, w: Number(rect.w), h: Number(rect.h) } : null,
		},
		consistencyGroup: consistencyGroup || null,
		...(nativeAnnotations ? { nativeAnnotations } : {}),
		candidatePlan,
		evaluationPlan,
		repairPolicy,
		fallbackOrder,
		request: {
			prompt, style, aspect, steps, capability,
			candidatePlan: { profile: candidatePlan.profile, initialCandidates: candidatePlan.initialCandidates, hardGenerationCallCeiling: candidatePlan.hardGenerationCallCeiling, crossModelEnsemble: candidatePlan.crossModelEnsemble, capabilityLanes: candidatePlan.capabilityLanes },
			evaluationPlan: { sharpnessFirstResearch: evaluationPlan.sharpnessFirstResearch, hardGates: evaluationPlan.hardGates, selection: evaluationPlan.selection },
			...(referenceHandles.length ? { referenceHandles } : {}),
			...(focalRegion ? { focalRegion } : {}),
			...(quietRegion ? { quietRegion } : {}),
			...(noText ? { noText: true, enforceDeterministicQuality: true, repair: { enabled: true, maxAttempts: candidatePlan.maxRepairs } } : {}),
			...(intent.enforceDeterministicQuality === true ? { enforceDeterministicQuality: true } : {}),
		},
		treatmentPlan,
		accessibility: buildImageAccessibilityMetadata({ id, concept, purpose, context: { slideRole: role } }),
		cost: { class: 'metered-generation', estimatedUpperBoundUsd: Number((candidatePlan.hardGenerationCallCeiling * (capability === 'create' ? 0.01 : 0.03)).toFixed(4)), generationCount: candidatePlan.hardGenerationCallCeiling },
	qualityPolicy: { noReadableText: noText, cropSafe: true, worldPaletteAware: true, referenceAware: capability !== 'create', deterministicHardGate: noText, boundedRetries: candidatePlan.maxRepairs, candidateCount: candidatePlan.initialCandidates, sharpnessFirstResearch: evaluationPlan.sharpnessFirstResearch },
	}
	plan.revisionFingerprint = visualPlanFingerprint(plan)
	return plan
}

export { routeVisualNeed }

// Public dry-run contract for selective revision. This deliberately describes
// the decision boundary without exposing provider/model, prompt, path, or
// customer-asset details.
export function publicVisualRevisionPolicy() {
	return {
		schemaVersion: 'betterpptx.visual-revision-policy.v1',
		fingerprint: {
			scheme: 'asset-revision://<24 lowercase hex>',
			inputs: ['semantic-intent', 'slide-message-and-role', 'World-and-version', 'series-capsule', 'final-rectangle', 'safety-and-identity-policy', 'generation-and-evaluation-versions'],
			excluded: ['provider', 'model', 'raw-prompt', 'credential', 'filesystem-path', 'customer-image-bytes'],
		},
		unchanged: { action: 'reuse-accepted-asset-byte-for-byte', generationCalls: 0 },
		deterministicCropGradeOnly: { action: 'reuse-accepted-asset-byte-for-byte-and-reapply-grade', generationCalls: 0 },
		semanticChange: { action: 'invalidate-changed-asset-only', generationCalls: 'bounded-by-candidate-plan' },
		dependentSeries: { action: 'revisit-coherence-checks-only', assetBytesInvalidated: false },
		unaffectedAssets: { action: 'retain-accepted-bytes', generationCalls: 0 },
		dryRun: { mutationFree: true, imageServiceCalls: 0, billingCommitRequired: true },
		deterministic: true,
	}
}

export function publicVisualDirection(plans = [], routes = []) {
	const items = plans.filter(Boolean)
	const routeItems = routes.filter(Boolean)
	return {
		schemaVersion: 'betterpptx.visual-direction.v1',
		generatedVisualCount: items.length,
		routedVisualCount: routeItems.length,
		mutationFreePlanning: true,
		plans: items,
		routes: routeItems,
		seriesCapsules: buildSeriesCapsules(items),
		seriesCoherence: evaluateSeriesCoherence(items),
		revisionPolicy: publicVisualRevisionPolicy(),
		revisionDigest: visualRevisionDigest(items),
		revisionPlan: planWholeDeckVisualRevision(items),
		note: items.length
			? 'Contextual visual briefs are deterministic and World-aware. Generation happens only during resolve with billing confirmation or during an authorized commit; dry-run never calls an image service.'
			: 'No contextual generated visuals were requested by this spec.',
	}
}
