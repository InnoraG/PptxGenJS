// IMG7 deterministic image-treatment planner. It selects bounded, auditable operations
// and declares hard requirements; it never invokes a provider or edits pixels itself.
const TREATMENTS = new Set(['cutout', 'background-extension', 'local-repair', 'collage', 'reference-edit', 'world-grade'])

function clean(value, max = 160) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max) }
function regionArea(region = {}) { return Math.max(0, Number(region.w) || 0) * Math.max(0, Number(region.h) || 0) }

export function planImageTreatment(input = {}) {
	const rawTreatment = clean(input.treatment || input.mode || 'world-grade').toLowerCase()
	const treatment = rawTreatment === 'world' ? 'world-grade' : rawTreatment
	if (!TREATMENTS.has(treatment)) return { status: 'blocked', reason: 'UNSUPPORTED_TREATMENT', treatment, fallback: 'world-grade' }
	const references = Array.isArray(input.referenceHandles) ? input.referenceHandles.filter(Boolean).slice(0, 4) : []
	const region = input.region && typeof input.region === 'object' ? input.region : null
	const base = { schemaVersion: 'betterpptx.image-treatment-plan.v1', status: 'ready', treatment, editableFallback: 'native-image-wrapper', locality: 'whole-image', requirements: [], operations: [] }
	if (treatment === 'cutout') {
		base.locality = 'subject-mask'
		base.requirements = ['alpha-channel', 'fringe-check', 'minimum-visible-subject']
		base.operations = ['segment-subject', 'clean-alpha-edge', 'evaluate-alpha-integrity']
		base.quality = { cutout: true, minAlphaCoverage: 0.01, maxAlphaCoverage: 0.995, minAlphaEdgeDensity: 0.001 }
	} else if (treatment === 'background-extension') {
		base.locality = 'background-only'
		base.requirements = ['focal-region', 'quiet-space-preservation', 'no-subject-resynthesis']
		base.operations = ['extend-background', 'preserve-focal-region', 'evaluate-locality']
		base.quality = { focalRegion: input.focalRegion || null, quietRegion: input.quietRegion || null }
	} else if (treatment === 'local-repair') {
		base.locality = 'bounded-region'
		base.requirements = ['repair-region', 'region-area-at-most-35-percent', 'before-after-digest']
		base.operations = ['edit-region', 'preserve-outside-region', 'evaluate-locality']
		if (!region || regionArea(region) <= 0 || regionArea(region) > 0.35) return { ...base, status: 'blocked', reason: 'REPAIR_REGION_INVALID' }
		base.quality = { region, maxChangedArea: 0.35 }
	} else if (treatment === 'collage') {
		const cells = Math.max(1, Math.min(6, Math.floor(Number(input.cells || 2))))
		base.locality = 'multi-cell'
		base.requirements = ['cell-bounds', 'reading-order', 'no-overlap-with-copy']
		base.operations = ['split-grid', 'place-cells', 'evaluate-cell-bounds']
		base.quality = { cells, splitGrid: { rows: Math.ceil(Math.sqrt(cells)), cols: Math.ceil(cells / Math.ceil(Math.sqrt(cells))) } }
	} else if (treatment === 'reference-edit') {
		if (!references.length) return { ...base, status: 'blocked', reason: 'REFERENCE_REQUIRED' }
		base.locality = 'reference-guided'
		base.requirements = ['tenant-visible-reference-handles', 'reference-digest-identity', 'no-raw-public-bytes']
		base.operations = ['reference-edit', 'evaluate-reference-consistency']
		base.quality = { capability: references.length > 1 ? 'multi-reference' : 'reference', referenceCount: references.length }
	} else {
		base.locality = 'whole-image'
		base.requirements = ['world-grade-is-deterministic', 'preserve-authored-image']
		base.operations = ['apply-world-grade', 'evaluate-raster-integrity']
		base.quality = { imageTreatment: 'world' }
	}
	return base
}

export { TREATMENTS }
