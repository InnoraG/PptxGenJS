// ir/story-director.mjs — C1: deck-level STORY ARC. Decides each slide's presenter POSTURE from
// the story shape (roles), content density, narration length, and interaction beats — so the
// presenter is FULL at the opener/closer and the climax (an interaction slide), RECEDES on
// data-dense slides so it never covers the numbers, and sits at medium presence on ordinary body
// slides. It PRODUCES guidance (presence + energy + suggested scale/stage), consumed by the
// presenter directive and shown in the storyboard — it adds no new primitive. Pure + deterministic.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
const lc = v => String(v || '').toLowerCase()
const DATA_KINDS = new Set(['chart-panel', 'chart', 'table-panel', 'table', 'metric-grid', 'metric', 'kpi', 'stat', 'comparison', 'timeline', 'process', 'diagram', 'smartart'])
const OPENER_ROLES = new Set(['opener', 'title', 'cover', 'intro'])
const CLOSER_ROLES = new Set(['closer', 'close', 'outro', 'summary', 'conclusion', 'thanks'])

function narrationWords(slide) {
	const n = (slide && (slide.narration || slide.voiceover)) || null
	const t = [n?.script, n?.text, slide?.message].filter(Boolean).join(' ')
	return t.trim().split(/\s+/).filter(Boolean).length
}
function dataDensity(slide) {
	const content = Array.isArray(slide?.content) ? slide.content : []
	const dataBlocks = content.filter(b => isObj(b) && DATA_KINDS.has(lc(b.kind)))
	// metric-grid / comparison / multiple data panels = dense
	const weight = dataBlocks.reduce((w, b) => w + (['metric-grid', 'comparison', 'chart-panel', 'table-panel'].includes(lc(b.kind)) ? 1.5 : 1), 0)
	return weight
}
function hasInteraction(slide) {
	return Array.isArray(slide?.interactions) && slide.interactions.length > 0
}

// presence: 'full' (large, centered, animated) | 'recede' (small, to the side, calm) | 'off'
// energy: 0..1 → drives choreography/scale/margin downstream.
export function planStoryArc(spec) {
	if (!isObj(spec) || !Array.isArray(spec.slides) || !spec.slides.length) return null
	const n = spec.slides.length
	const arc = spec.slides.map((s, i) => {
		const role = lc(s.role)
		const isOpener = OPENER_ROLES.has(role) || i === 0
		const isCloser = CLOSER_ROLES.has(role) || i === n - 1
		const density = dataDensity(s)
		const climax = hasInteraction(s)
		let presence, energy, reason
		if (climax) { presence = 'full'; energy = 1.0; reason = 'climax — an interaction beat; the presenter leads.' }
		else if (isOpener) { presence = 'full'; energy = 0.9; reason = 'opener — the presenter greets at full presence.' }
		else if (isCloser) { presence = 'full'; energy = 0.85; reason = 'closer — the presenter bows/summarizes at full presence.' }
		else if (density >= 2) { presence = 'recede'; energy = 0.35; reason = `data-dense (density ${density}) — the presenter recedes so it never covers the numbers.` }
		else if (density >= 1) { presence = 'recede'; energy = 0.5; reason = `has data (density ${density}) — the presenter steps aside.` }
		else { presence = 'full'; energy = 0.7; reason = 'body slide — medium presence.' }
		// suggested placement knobs (the presenter directive can consume these):
		// recede → smaller + more margin (zoomed out) + corner stage; full → larger + center-ish.
		const scale = presence === 'recede' ? 0.75 : (energy >= 0.9 ? 1.15 : 1.0)
		const viewportMargin = presence === 'recede' ? 1.8 : 1.2
		const stage = presence === 'recede' ? 'corner' : (isOpener || isCloser ? 'center' : 'left')
		return { slide: i, slideId: s.id, role: s.role || null, presence, energy: +energy.toFixed(2), scale, viewportMargin, stage,
			dataDensity: density, isClimax: climax, reason }
	})
	// motif consistency: keep the opener + closer on the same stage side (bookend symmetry).
	const opener = arc.find(a => a.presence === 'full' && a.slide === 0)
	const closer = arc[arc.length - 1]
	if (opener && closer && closer.presence === 'full') closer.stage = opener.stage
	return arc
}
