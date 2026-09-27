// PRESENTER-DIRECTOR — expand a deck-level `presenter` directive (or a world persona) into a same-named
// 3D-avatar 'presenter' model3d block on each target slide: a role-driven gesture clip (playScene) +
// Morph-travel between slides + approach (grow toward the finale). This is a SPEC PRE-PROCESS pass — it
// rides the existing model3d + scene(playScene) + Morph-by-object compile path (no compiler surgery).
//
// The avatar is a rigged multi-clip GLB (the model3dGen output). The world supplies the STYLE (persona /
// choreography / stage); the author supplies the MODEL + its semantic clipMap (beat -> glTF animId). The
// alive-presenter mechanics (per-slide clip, Morph, combined animations) are proven in research-demos.
//
// COMPOSE THROUGH THE CHOREOGRAPHY ENGINE (2026-07-12): each presenter appearance is built as a Choreography
// IR and run through the engine's validate + predict + compile before it is injected — so the director can
// never emit a presenter that PowerPoint would drop (animId past the 18-clip ceiling, a within-slide motion
// path that leaves the slide, or a second 3D-scene animation the model would render static). The compile
// step also guarantees the correct wire keys. Within-slide travel is OPT-IN (presenter.travelPath); the
// default stays one stationary gesture clip, so existing worlds are unchanged.
import { narrationBudgetMs } from './timeline-ir.mjs'
import { normalizeStaticPose, clipMapForOrdinaryStaticPose } from '../presenter-static-pose-contract.mjs'
import { authoringMotionById } from './authoring-motion-catalog.mjs'
import { performanceCarryHandSamples } from './presenter-performance-carry.mjs'
import { timedMotionPathAnimations } from './timed-motion-path.mjs'
import { replaceInteractionTargetContent, resolveInteractionTargetGeometry } from './synergy-compiler.mjs'
import { validate as choreoValidate, predict as choreoPredict, compile as choreoCompile, motionVector as choreoMotionVector, CLIP_CEILING } from './choreography-engine.mjs'

// Slide story-role -> semantic presenter beat.
const ROLE_BEAT = {
	opener: 'greet', title: 'greet', cover: 'greet',
	agenda: 'point', build: 'point', section: 'point', 'section-divider': 'point',
	body: 'talk', content: 'talk',
	data: 'emphasize', proof: 'emphasize', chart: 'emphasize', metric: 'emphasize', comparison: 'emphasize',
	closer: 'bow', summary: 'bow', conclusion: 'bow', cta: 'point', thanks: 'bow',
}
// Semantic gesture INTENTS — the L2 classifier's output vocabulary. A rigged avatar's clipMap maps each
// intent to a glTF animId; the worker bakes a clip library (many clips can serve one intent via alternates).
// The legacy beats (greet/point/talk/emphasize/idle/travel/bow) are kept as ALIASES so older clipMaps resolve.
// v2 (2026-07-10): expanded to the 18-clip Mixamo library (canonical-clipmap.json v2). idle (rest default)
// and walk (travel/choreography-driven) are NOT classifier outputs; the 16 below are narration-selectable.
export const GESTURE_INTENTS = ['greet', 'point', 'enumerate', 'emphasize', 'contrast', 'ask', 'magnitude', 'talk', 'bow', 'present', 'agree', 'think', 'disagree', 'happy', 'surprise', 'clap']

// When a clipMap has no baked clip for a NEW intent, fall back to the nearest legacy beat, then talk, then 0.
// (With the full 18-clip Baker manifest these resolve directly; aliases only degrade third-party GLBs.)
const INTENT_ALIAS = { enumerate: 'point', contrast: 'emphasize', ask: 'talk', magnitude: 'emphasize', present: 'greet', agree: 'talk', think: 'talk', disagree: 'emphasize', happy: 'greet', surprise: 'emphasize', clap: 'bow' }

// Fallback clipMap: the legacy-beat keys, every one -> clip 0 (which always exists on a rigged glb). The NEW
// intents (enumerate/contrast/ask/magnitude/present/agree/think/disagree/happy/surprise/clap) are deliberately
// ABSENT so they fall through INTENT_ALIAS to the nearest legacy beat's clip (a meaningful gesture) rather than
// being pinned to 0. The author's/world's clipMap (intent -> real glTF animId for THEIR avatar) overrides; a
// partial map never picks a non-existent clip.
const DEFAULT_CLIPMAP = { greet: 0, point: 0, emphasize: 0, talk: 0, bow: 0, idle: 0, travel: 0 }

// AI-SELECTED PRESENTER STAGING. These are an unranked public vocabulary: the
// AI decides whether a visible presenter needs a grounding treatment; the
// engine only derives safe editable geometry from the already-resolved
// presenter frame. `none` remains the compatibility default so a World never
// silently adds decoration or makes an aesthetic choice for the author.
export const PRESENTER_STAGE_TREATMENTS = Object.freeze([
	Object.freeze({ id: 'none', label: 'None', description: 'No presenter-specific decorative stage treatment.' }),
	Object.freeze({ id: 'floor-ellipse', label: 'Floor ellipse', description: 'One restrained editable accent ellipse beneath the presenter to visually ground the figure.' }),
])
const PRESENTER_STAGE_TREATMENT_IDS = new Set(PRESENTER_STAGE_TREATMENTS.map(item => item.id))

export function normalizePresenterStageTreatment(raw) {
	const authored = raw !== undefined && raw !== null && String(raw).trim() !== ''
	const id = authored ? String(raw).trim().toLowerCase() : 'none'
	if (!PRESENTER_STAGE_TREATMENT_IDS.has(id)) {
		const error = new Error(`presenter.stageTreatment must be one of: ${PRESENTER_STAGE_TREATMENTS.map(item => item.id).join(', ')}.`)
		error.code = 'PRESENTER_STAGE_TREATMENT_INVALID'
		error.requested = id
		error.supported = PRESENTER_STAGE_TREATMENTS.map(item => item.id)
		throw error
	}
	return {
		id,
		source: authored ? 'author' : 'default',
		decisionAuthority: 'AI',
		engineRole: 'derive-safe-geometry-and-execute',
	}
}

// L2 CLASSIFIER — deterministic linguistic cues (own lexicon/regex, NO ML weights → the resale-clean substitute
// for the license-blocked text->motion + audio->gesture families). Highest-priority MATCHED cue wins; nothing
// matches -> null so the caller falls back to the role-beat prior. Deliberately SALIENT: only a clear cue earns
// a gesture, else the presenter stays in talk/idle (the salience threshold that avoids robotic over-gesturing).
const GESTURE_CUES = [
	['enumerate', 8, /\b(first|firstly|second|secondly|third|thirdly|fourth|next|then|finally|lastly|number (one|two|three))\b|\b\d+[.)]\s/],
	['contrast', 7, /\b(but|however|whereas|instead|conversely|although|though|yet|on the other hand|in contrast|rather than)\b/],
	['ask', 7, /\?|\b(what if|why do|why does|how do|how does|imagine|consider this|ask yourself|ever wondered)\b/],
	['magnitude', 6, /\b(grew|grow|growing|increased?|doubled|tripled|rose|surged|jumped|skyrocketed|fell|drop(ped)?|declined?|shrank|shrink|plummeted|soared|expand(ed)?)\b/],
	['point', 6, /\b(look at|notice|see here|right here|as you can see|take a look|observe|watch this|over here|this (chart|graph|number|figure|slide) (shows|tells|means))\b/],
	['emphasize', 5, /\b(most|key|critical|crucial|essential|important|the one thing|remember this|never forget|huge|massive|vital|matters most|bottom line)\b/],
	['greet', 4, /\b(welcome|hello|hi (there|everyone)|good (morning|afternoon|evening)|let's (begin|get started|dive in)|thanks for joining|glad you're here)\b/],
	['bow', 4, /\b(thank you|thanks for (listening|watching|your time)|in (conclusion|summary)|to (sum up|conclude|wrap up|recap)|that's all|any questions)\b/],
	// v2 (2026-07-10) — cues for the expanded Mixamo clip library (scoped to avoid over-firing; tunable).
	['surprise', 6, /\b(surprising(ly)?|remarkably|incredibly|shockingly|unexpected(ly)?|astonishing|believe it or not|you won't believe|it turns out|plot twist)\b/],
	['disagree', 6, /\b(myth|misconception|not true|that's wrong|incorrect|falsely|don't be fooled|contrary to|common mistake|the real problem)\b/],
	['agree', 5, /\b(exactly|precisely|absolutely|indeed|agreed|of course|no doubt|that's (right|correct|true))\b/],
	['present', 5, /\b(introducing|here's|here is|meet the|presenting|let me show you|i'?ll show you|unveil|reveal|say hello to)\b/],
	['happy', 5, /\b(great news|excellent|fantastic|wonderful|amazing|a big win|we won|succeeded|success story|celebrate|congratulations|thrilled|exciting)\b/],
	['think', 5, /\b(consider|perhaps|maybe|imagine if|what would|let's think|ponder|reflect on|suppose|the question is)\b/],
	['clap', 4, /\b(well done|round of applause|kudos|hats off|bravo|give it up|take a bow|nailed it)\b/],
]

// The narration TEXT the classifier reads: slide.narration|voiceover .script/.text + each segment's script,
// plus notes. Authored in the raw spec, so it is present at expand time (this pass runs pre-layout).
function narrationText(slide) {
	const n = (slide && (slide.narration || slide.voiceover)) || null
	let t = ''
	if (n && typeof n === 'object') {
		t += ' ' + (n.script || n.text || '')
		if (Array.isArray(n.segments)) for (const s of n.segments) if (isObj(s)) t += ' ' + (s.script || s.text || '')
	} else if (typeof n === 'string') {
		t += ' ' + n
	}
	if (slide && typeof slide.notes === 'string') t += ' ' + slide.notes
	return t.toLowerCase()
}

// Classify a slide's gesture INTENT from its NARRATION content (text is master) and report WHERE it came from:
// 'narration' (a content cue fired), 'role' (no cue → the slide role's beat prior), or 'default' (neither → talk).
// Deterministic + pure → safe to unit test, and the `from` powers the appliedDefaults per-slide report.
export function classifyGesture(slide, opts = {}) {
	const text = narrationText(slide)
	let best = null, bestP = 0
	if (text.trim()) {
		for (const [intent, p, re] of GESTURE_CUES) {
			if (p > bestP && re.test(text)) { best = intent; bestP = p }
		}
	}
	if (best) return { intent: best, from: 'narration' }
	const role = String(opts.role || (slide && (slide.role || slide.layoutIntent)) || '').toLowerCase()
	return ROLE_BEAT[role] ? { intent: ROLE_BEAT[role], from: 'role' } : { intent: 'talk', from: 'default' }
}

// The intent string only (the common case). See classifyGesture for the source-of-choice.
export function selectGestureIntent(slide, opts = {}) {
	return classifyGesture(slide, opts).intent
}

// intent -> a real, EXISTING animId on this avatar's clipMap (intent, else legacy alias, else talk/idle, else 0).
// Clamped to the measured 18-clip PowerPoint ceiling (animId 0..17) — a clipMap that names a higher clip would
// select a slot PowerPoint won't play (silently static), so we pin it to the top playable clip instead.
function resolveClipAnimId(clipMap, intent) {
	const cm = clipMap || DEFAULT_CLIPMAP
	const v = cm[intent] ?? cm[INTENT_ALIAS[intent]] ?? cm.talk ?? cm.idle ?? 0
	return Math.min(CLIP_CEILING - 1, Math.max(0, Number(v) | 0))
}

function explicitPresenterMotion(slide, actorId = 'presenter') {
	const raw = slide?.presenterMotion
	if (typeof raw === 'string') return { motionId: raw.trim(), narrationCue: null }
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
	const requestedActor = String(raw.presenterId || raw.actor || actorId)
	if (requestedActor !== actorId) return null
	const motionId = String(raw.motionId || '').trim()
	return motionId ? { motionId, narrationCue: raw.narrationCue ?? raw.cue ?? null } : null
}

function resolveExactMotionAnimId(clipMap, motionId, actorId = 'presenter') {
	const cm = clipMap || {}
	if (!Object.prototype.hasOwnProperty.call(cm, motionId)) {
		const error = new Error(`motion ${motionId} was not selected for presenter ${actorId}.`)
		error.code = 'MOTION_NOT_IN_BUNDLE'
		error.motionId = motionId
		error.presenterId = actorId
		throw error
	}
	const animId = Number(cm[motionId])
	if (!Number.isInteger(animId) || animId < 0 || animId >= CLIP_CEILING) {
		const error = new Error(`motion ${motionId} resolved outside the PowerPoint presenter bundle ceiling.`)
		error.code = 'MOTION_BUNDLE_MAPPING_INVALID'
		error.motionId = motionId
		error.presenterId = actorId
		throw error
	}
	return animId
}

// The full gesture decision for ONE slide under a resolved presenter P — SHARED by the expander and the
// appliedDefaults report so they can never drift. Applies the L3 dialect bias after classification.
function gestureForSlide(slide, P, actorId = 'presenter') {
	const explicit = explicitPresenterMotion(slide, actorId)
	if (explicit) return {
		intent: explicit.motionId,
		motionId: explicit.motionId,
		animId: resolveExactMotionAnimId(P.clipMap, explicit.motionId, actorId),
		from: 'author',
		biased: false,
		narrationCue: explicit.narrationCue,
	}
	const c = classifyGesture(slide, {})
	const biased = !!(P.dialect && P.dialect.bias && P.dialect.bias[c.intent])
	const intent = biased ? P.dialect.bias[c.intent] : c.intent
	return { intent, animId: resolveClipAnimId(P.clipMap, intent), from: c.from, biased }
}

// Choreography styles: how boldly the presenter travels + grows across its appearances.
const CHOREO = {
	keynote: { baseScale: 1.0, growPerAppearance: 0.35, travel: 0.6, morph: true },
	subtle: { baseScale: 0.9, growPerAppearance: 0.0, travel: 0.15, morph: true },
	energetic: { baseScale: 1.0, growPerAppearance: 0.55, travel: 1.0, morph: true },
}

// L3 GESTURE DIALECTS — per-persona style so the SAME narration performs DIFFERENTLY per world. `amplitude`/
// `tempo`/`energy` are recorded on the injected block for the author-time bake (L5, worker) to consume later;
// `bias` remaps an intent to make a persona more/less assertive NOW (narrator softens emphasis->talk; commander
// sharpens talk->emphasize) → a visible per-world difference in the SELECTED clip today. Pure data, resale-clean.
// Keyed by the persona name presenterForAxes() gives each world (luxe=keynote-host, brutalist=commander, …).
const PERSONA_DIALECT = {
	'keynote-host': { amplitude: 1.15, tempo: 0.95, energy: 'broad', bias: {} },
	'product-host': { amplitude: 1.05, tempo: 1.0, energy: 'open', bias: {} },
	commander: { amplitude: 0.8, tempo: 1.2, energy: 'sharp', bias: { talk: 'emphasize' } },
	narrator: { amplitude: 0.7, tempo: 0.9, energy: 'restrained', bias: { emphasize: 'talk', point: 'talk' } },
	analyst: { amplitude: 0.8, tempo: 0.95, energy: 'precise', bias: { emphasize: 'point' } },
	guide: { amplitude: 0.95, tempo: 0.95, energy: 'calm', bias: {} },
	hype: { amplitude: 1.3, tempo: 1.25, energy: 'big', bias: { talk: 'emphasize' } },
	coach: { amplitude: 1.1, tempo: 1.05, energy: 'encouraging', bias: {} },
	storyteller: { amplitude: 1.05, tempo: 0.9, energy: 'expressive', bias: {} },
	host: { amplitude: 1.0, tempo: 1.0, energy: 'neutral', bias: {} },
}
const DEFAULT_DIALECT = PERSONA_DIALECT.host

// The gesture dialect for a world persona (defaults to a neutral host). Exported for reporting/tests.
export function gestureDialectFor(persona) {
	return PERSONA_DIALECT[String(persona || '').toLowerCase()] || DEFAULT_DIALECT
}

const DEFAULT_SLIDE_W = 13.333 // T24: defaults only — every geometry honors options.slideSize
const DEFAULT_SLIDE_H = 7.5
const DEFAULT_SLIDE_MS = 4000 // validator fallback ONLY when a slide has no narration budget (A2a master clock)
// T24 helper: per-call dims from an options.slideSize, falling back to the wide default.
function dimsOf(options) {
	const z = options && options.slideSize
	return z && Number(z.w) > 0 ? { slideW: Number(z.w), slideH: Number(z.h) || DEFAULT_SLIDE_H } : {}
}
function SWof(d) { return Number(d && d.slideW) || DEFAULT_SLIDE_W }
function SHof(d) { return Number(d && d.slideH) || DEFAULT_SLIDE_H }
const round2 = n => Math.round(n * 100) / 100

// Build the calculation-model Choreography IR for ONE presenter appearance. withMotion pulls in the OPT-IN
// within-slide travel path (presenter.travelPath). content is empty here — the director composes the presenter
// track; per-object paired cues are the next director layer. Pure, so it feeds both expand and the plan report.
// PLACEMENT INTELLIGENCE — the presenter's stage zone: a horizontal band (~55% of the slide, on its stage side)
// that leaves the opposite region clear for content. null for center (content sits above/below, not beside).
function presenterZoneFor(stage, dims = {}) {
	// Exact visual-reference frames already own their composition. A semantic
	// half-slide exclusion must not override the authored frame or shorten an
	// explicitly requested travel path. Ordinary stage choreography is unchanged.
	if (dims.exactPresenterFrame === true) return null
	const SW = SWof(dims)
	const s = String(stage || 'left').toLowerCase()
	const mid = round2(0.5 * SW) // wide default 6.67 — the presenter keeps to its half; content gets the other half
	if (s === 'right' || s === 'corner') return { x0: mid, x1: SW - 0.1 }
	if (s === 'center' || s === 'centre') return null
	return { x0: 0.1, x1: mid } // left / follow / default
}

// Clamp a requested within-slide travel so the presenter's traveled box never leaves its stage zone (never
// intrudes on the content region). Returns a preset motion if it already fits, else a shorter waypoint travel;
// null if there's no room to travel at all (so the presenter just gestures in place).
function contentSafeTravel(P, bbox, dims = {}) {
	const zone = presenterZoneFor(P.stage, dims)
	const req = { path: P.travelPath, startMs: 0, durationMs: P.travelMs || 2000 }
	if (!zone) return req
	const v = choreoMotionVector(req, { w: SWof(dims), h: SHof(dims) })
	let dx = v.dx
	if (dx > 0) dx = Math.min(dx, Math.max(0, zone.x1 - (bbox.x + bbox.w))) // rightward: don't pass the zone's right edge
	if (dx < 0) dx = Math.max(dx, Math.min(0, zone.x0 - bbox.x))            // leftward: don't pass the zone's left edge
	if (Math.abs(dx) < 0.15) return null                                   // no meaningful room -> gesture in place
	if (Math.abs(dx - v.dx) < 0.01) return req                             // preset already fits -> keep it
	return { waypoints: [{ dxIn: round2(dx), dyIn: round2(v.dy) }], startMs: 0, durationMs: P.travelMs || 2000 }
}

function slideChoreographyIR(P, animId, intent, bbox, withMotion, ctx = {}) {
	const presenter = { name: 'presenter', animId, clip: intent, inPlace: true,
		bbox: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h } }
	// CLIP PLAY LENGTH: let the FULL kinetic clip play so its gesture APEX is reached — not just the ~2s windup
	// (the historical default cut the clip off before its dramatic moment at 3–5s). Use the clip's MEASURED length
	// (P.clipDurations[animId] from the baked/kinetic contacts), floored at 2.5s so short clips still read.
	// Do not accelerate a long authored gesture with a hidden upper cap; the motion library owns its tempo.
	// NOTE this is deliberately NOT
	// clamped to the slide budget — the validator's budget (narration-driven; 4000ms fallback) is only its
	// on-slide reasoning window; a legitimately
	// longer clip advancing mid-play is fine (the apex has already shown). Unmeasured → compile default.
	if (P.clipDurations && typeof P.clipDurations[animId] === 'number' && P.clipDurations[animId] > 0)
		presenter.clipDurationMs = Math.max(2500, Math.round(P.clipDurations[animId]))
	if (withMotion && P.travelPath) {
		const m = contentSafeTravel(P, bbox, ctx) // clamped so travel stays in the stage zone
		if (m) presenter.motion = m
	}
	// A2a master clock: the validator reasons over the slide's NARRATION budget when known.
	const slide = { w: SWof(ctx), h: SHof(ctx), durationMs: Number(ctx.budgetMs) || DEFAULT_SLIDE_MS }
	const zone = presenterZoneFor(P.stage, ctx)
	if (zone) slide.presenterZone = zone
	return { slide, presenter, content: [] }
}

// CONTENT PAIRING — the gesture is a VERB; this maps it to its OBJECT: the native effect it "causes" on a
// salient content item, fired withPrevious at the gesture's apex (contactMs — a heuristic until per-clip
// contactFrameMs is baked, see [[betterpptx-presenter-cofire-grammar]]). Effects are chosen to pass the
// choreography engine's category guard (entrance: fade/fly/zoom; emphasis: growShrink/pulse/teeter/flicker).
const CONTENT_PAIRING = {
	greet: { type: 'entrance', effect: 'fade', contactMs: 200 },
	point: { type: 'entrance', effect: 'fly', direction: 'right', contactMs: 600 }, // the thing appears as he points
	present: { type: 'entrance', effect: 'zoom', contactMs: 500 },
	enumerate: { type: 'entrance', effect: 'fly', direction: 'up', contactMs: 300 },
	emphasize: { type: 'emphasis', effect: 'growShrink', contactMs: 500 },
	magnitude: { type: 'emphasis', effect: 'growShrink', contactMs: 500 },
	contrast: { type: 'emphasis', effect: 'teeter', contactMs: 500 },
	ask: { type: 'emphasis', effect: 'pulse', contactMs: 400 },
	agree: { type: 'emphasis', effect: 'pulse', contactMs: 400 },
	happy: { type: 'emphasis', effect: 'pulse', contactMs: 400 },
	clap: { type: 'emphasis', effect: 'pulse', contactMs: 500 },
	disagree: { type: 'emphasis', effect: 'teeter', contactMs: 500 },
	surprise: { type: 'emphasis', effect: 'flicker', contactMs: 400 },
	// talk / bow / think -> intentionally NO pairing (a neutral beat has nothing to cause)
}

// A paired effect fires at the gesture's CONTACT frame. Prefer the clip's MEASURED contactMs (baked metadata,
// gltf_ops.compute_contacts -> manifest.contacts -> P.contactMap[animId]); fall back to the per-intent apex
// heuristic. Capped to a sane pairing window: a reveal >~1.4 s after the gesture stops reading as "caused",
// and some raw clips are very long (a 20 s emphasize) — the paired effect fires at the first sane apex.
const PAIR_DELAY_CAP_MS = 1400
function pairingDelayMs(P, animId, intent) {
	const measured = P.contactMap ? P.contactMap[animId] : undefined
	const base = typeof measured === 'number' ? measured : CONTENT_PAIRING[intent].contactMs
	const ms = Math.max(100, Math.min(PAIR_DELAY_CAP_MS, Math.round(base)))
	return { ms, source: typeof measured === 'number' ? 'clip' : 'heuristic' }
}

// The content object the gesture acts on: a visual/data hero first, never the presenter, and never one the
// author already animated (respect authoring). Returns the content item, or null (then the slide just gestures).
const PAIR_TARGET_KINDS = ['chart', 'metric', 'kpi', 'image', 'media', 'table', 'diagram', 'smartart', 'bullets', 'body', 'textShape', 'quote']
function pickPairTarget(content) {
	const items = asArray(content).filter(c => isObj(c) && c.name !== 'presenter'
		&& String(c.kind || '').toLowerCase() !== 'model3d' && !c.animation)
	for (const kind of PAIR_TARGET_KINDS) {
		const t = items.find(c => String(c.kind || '').toLowerCase() === kind)
		if (t) return t
	}
	return null
}

// Placement in inches. The presenter starts on its stage edge and, across appearances, DRIFTS toward
// centre while GROWING — reads as "walks in and approaches the viewer" (Morph interpolates it).
function placement(stage, appearIdx, scale, travel, dims = {}) {
	const SW = SWof(dims), SH = SHof(dims)
	// Portrait window for a full-body presenter. The live am3d render is uniform, but the square fallback poster
	// is stretched to the frame in static contexts. A portrait frame matches the proven full-body model staging
	// and gives PowerPoint enough vertical viewport to hydrate the Meshy character without clipping its body.
	const h = Math.min(6.9, 5.8 * scale)
	const w = h * 0.66
	const edge = String(stage || 'left').toLowerCase()
	// PowerPoint's live am3d renderer drops a presenter frame pushed into the far-right edge
	// (native sweep: x≈8+ inches is unsafe; x≈5.8–6.8 remains live). Keep right-stage presenters
	// visually right-weighted while reserving a compatibility gutter for the 3D runtime.
	let baseX = edge === 'right' ? SW * 0.5
		: edge === 'center' || edge === 'centre' ? (SW - w) / 2
		// A corner presenter is a smaller/right-weighted treatment inside the
		// same PowerPoint-safe stage lane, never permission to escape it.
		: edge === 'corner' ? SW * 0.5 + 0.15
		: 0.6 // left / follow / default
	const centreX = (SW - w) / 2
	// Ease toward centre over ~3 appearances, scaled by the choreography travel amount.
	const drift = Math.max(0, Math.min(1, appearIdx / 3)) * travel * (centreX - baseX)
	let x = baseX + drift
	// A deeper bottom gutter keeps the absolute-rest Meshy retarget inside the live 3D viewport;
	// static poster fallback remains within the same portrait frame.
	let y = SH - h - 2.4 // bottom-anchored; extra live-playback gutter for the absolute-rest Meshy retarget
	// The stage contract is also the layout engine's exclusion contract. Keep
	// the complete presenter frame inside it after growth/drift so reserved
	// content and the actual native 3-D geometry can never disagree.
	const stageZone = presenterZoneFor(edge, dims)
	if (stageZone) {
		const minX = stageZone.x0
		const maxX = Math.max(minX, stageZone.x1 - w)
		x = Math.max(minX, Math.min(maxX, x))
	}
	x = Math.max(0.2, Math.min(SW - w - 0.2, x))
	y = Math.max(0.3, Math.min(SH - h - 0.2, y))
	return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }
}

// One low-risk native sibling beneath the model. The oversized 3-D viewport
// extends well below the visible feet, so this uses the calibrated visible
// foot band (about 69% down the presenter frame), not bbox.bottom. The block is
// slide-scoped to avoid accidental Morph pairing across nonadjacent presenter
// appearances and carries no animation of its own.
function presenterStageBlocks(slideId, bbox, treatment, dims = {}, palette = {}) {
	if (!bbox || treatment?.id !== 'floor-ellipse') return []
	const SW = SWof(dims), SH = SHof(dims)
	const w = Math.max(0.6, Math.min(2.4, Number(bbox.w) * 0.4))
	const h = Math.max(0.12, Math.min(0.32, Number(bbox.h) * 0.04))
	const x = Math.max(0.05, Math.min(SW - w - 0.05, Number(bbox.x) + (Number(bbox.w) - w) / 2))
	const y = Math.max(0.05, Math.min(SH - h - 0.05, Number(bbox.y) + Number(bbox.h) * 0.69))
	const safeSlideId = String(slideId || 'slide').trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'slide'
	const objectName = `${safeSlideId}.presenter-stage-floor`
	const accent = String(palette?.accent || '5B8DEF').replace(/^#/, '').toUpperCase()
	return [{
		kind: 'shape',
		name: objectName,
		objectName,
		role: 'decorative',
		shapeName: 'ellipse',
		bbox: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) },
		decorative: true,
		keep: true,
		_isPureShape: true,
		_engineOwnedGeometry: false,
		_geometryProvenance: 'ai-selected-component-derived-from-authored-presenter-frame',
		_presenterStageTreatment: treatment.id,
		style: {
			fill: { color: accent, transparency: 70 },
			line: { type: 'none' },
		},
		altText: 'Decorative presenter ground plane',
	}]
}

function asArray(v) { return Array.isArray(v) ? v : [] }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) }

// Lower a complete authored performance as one native model instance. The
// compositor owns the articulated body; this pass owns only slide staging,
// entrance/exit visibility, movement of the frame, and editable target cues.
export function expandPresenterPerformances(spec, options = {}) {
	if (!options.performances?.length) return spec
	const out = { ...spec, slides: spec.slides.map(slide => ({ ...slide, content: [...(slide.content || [])] })) }
	const SW = Number(options.slideSize?.w) || 13.333333, SH = Number(options.slideSize?.h) || 7.5
	const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value))
	// Native timings are whole milliseconds. Round endpoints first so adjacent
	// segments still meet exactly even when measured contact falls between frames.
	const nativeTiming = animation => {
		const start = Math.round(Number(animation.delay) || 0)
		const end = Math.round((Number(animation.delay) || 0) + (Number(animation.duration) || 0))
		return { ...animation, delay: start, duration: Math.max(1, end - start) }
	}
	const readback = []
	for (const resolved of options.performances) {
		const { performance: p, actor, report, handle, slideIndex } = resolved
		const slide = out.slides[slideIndex], slideId = slide.id || `slide-${slideIndex + 1}`
		const slidePresenterMatches = slide?.presenter?.id === p.actor || (slide?.presenter?.id == null && !(spec.presenters?.cast || []).length)
		const slideFrame = slidePresenterMatches ? slide?.presenter?.rect || slide?.presenter?.bbox : null
		if (p.frame && slideFrame && ['x', 'y', 'w', 'h'].some(key => Math.abs(Number(p.frame[key]) - Number(slideFrame[key])) > 0.000001)) {
			const error = new Error(`Continuous presenter ${p.actor} has conflicting performance and slide frames.`)
			error.code = 'PRESENTER_FRAME_CONFLICT'
			throw error
		}
		const authoredFrame = p.frame || slideFrame || actor?.rect || actor?.bbox
		if (!authoredFrame || !['x', 'y', 'w', 'h'].every(key => typeof authoredFrame[key] === 'number' && Number.isFinite(authoredFrame[key])) || !(authoredFrame.w > 0) || !(authoredFrame.h > 0)) {
			const error = new Error(`Continuous presenter ${p.actor} requires an AI-authored finite positive presenterPerformance.frame or matching presenter.rect/bbox.`)
			error.code = 'PRESENTER_GEOMETRY_REQUIRED'
			throw error
		}
		const authoredStageBbox = { x: Number(authoredFrame.x), y: Number(authoredFrame.y), w: Number(authoredFrame.w), h: Number(authoredFrame.h) }
		const frameH = authoredStageBbox.h, frameW = authoredStageBbox.w
		const initialCenter = { x: authoredStageBbox.x + frameW / 2, y: authoredStageBbox.y + frameH / 2 }
		const centerFits = center => center.x - frameW / 2 >= -0.000001 && center.y - frameH / 2 >= -0.000001 && center.x + frameW / 2 <= SW + 0.000001 && center.y + frameH / 2 <= SH + 0.000001
		if (!centerFits(initialCenter)) {
			const error = new Error(`Continuous presenter ${p.actor} initial frame leaves the slide.`)
			error.code = 'PRESENTER_FRAME_OFF_STAGE'
			throw error
		}
		for (const key of p.travel || []) {
			if (!key.center || !Number.isFinite(key.center.x) || !Number.isFinite(key.center.y)) {
				const error = new Error(`Continuous presenter ${p.actor} travel key requires an exact slide-inch center.`)
				error.code = 'PERFORMANCE_TRAVEL_GEOMETRY_REQUIRED'
				throw error
			}
			if (!centerFits(key.center)) {
				const error = new Error(`Continuous presenter ${p.actor} travel key leaves the slide.`)
				error.code = 'PERFORMANCE_TRAVEL_OFF_STAGE'
				throw error
			}
			if (key.atMs === 0 && Math.hypot(key.center.x - initialCenter.x, key.center.y - initialCenter.y) > 0.000001) {
				const error = new Error(`Continuous presenter ${p.actor} travel at 0 ms must start at its authored frame center.`)
				error.code = 'PERFORMANCE_TRAVEL_START_MISMATCH'
				throw error
			}
		}
		const maxScale = Math.max(1, ...(p.transforms || []).map(key => Number(key.scale) || 1))
		const renderedH = Math.min(SH * 0.46 * clamp(Number(actor?.scale) || 1, 0.5, 2.2), frameH * 0.84 / maxScale)
		const authoredTravel = p.travel?.length ? p.travel : []
		const firstStage = authoredTravel.find(key => key.atMs === 0)?.stage || actor?.stage || 'authored'
		const anchors = new Map([[0, { atMs: 0, ...initialCenter, stage: firstStage }]])
		for (const key of authoredTravel) anchors.set(key.atMs, { atMs: key.atMs, x: key.center.x, y: key.center.y, stage: key.stage || 'authored' })
		const authoredPoints = [...anchors.values()].sort((a, b) => a.atMs - b.atMs)
		const authoredCenterAt = atMs => {
			const after = authoredPoints.findIndex(point => point.atMs > atMs)
			if (after < 0) return authoredPoints.at(-1)
			if (after === 0) return authoredPoints[0]
			const previous = authoredPoints[after - 1], next = authoredPoints[after]
			const fraction = (atMs - previous.atMs) / (next.atMs - previous.atMs)
			return { x: previous.x + (next.x - previous.x) * fraction, y: previous.y + (next.y - previous.y) * fraction }
		}
		const interactionReadback = []
		const carries = []
		const targetBoxes = options.targetBoxes?.[slideId] || {}
		for (const interaction of p.interactions || []) {
			const action = (report.actions || []).find(item => item.id === interaction.actionId)
			const targetIndex = slide.content.findIndex(block => [block.name, block.objectName].includes(interaction.target))
			const targetMatch = resolveInteractionTargetGeometry(slide.content, interaction.target)
			const target = targetMatch?.target
			const nestedTarget = targetIndex < 0
			const box = target?._engineRect || targetMatch?.bbox || target?.bbox || targetBoxes[target?.name] || targetBoxes[target?.objectName]
			const replaceTarget = replacement => {
				if (!nestedTarget) { slide.content[targetIndex] = replacement; return }
				const replaced = replaceInteractionTargetContent(slide.content, target, replacement)
				if (!replaced.changed) { const error = new Error(`Performance target ${interaction.target} could not be updated inside its editable group.`); error.code = 'PERFORMANCE_TARGET_NOT_FOUND'; throw error }
				slide.content = replaced.nodes
			}
			const previous = [...anchors.values()].filter(key => key.atMs <= action?.startMs).sort((a, b) => b.atMs - a.atMs)[0]
			const fromLeft = (previous?.x ?? SW / 2) <= (box?.x || 0) + (box?.w || 0) / 2
			const angle = Number(actor?.faceRotationY || 0) * Math.PI / 180
			const projectedHandX = norm => Number(norm.x) * Math.cos(angle) + Number(norm.z || 0) * Math.sin(angle)
			const direction = fromLeft ? 1 : -1
			const namesTarget = step => [step?.name, step?.objectName, step?.target, ...(step?.names || []), ...(step?.objectNames || [])].includes(interaction.target)
			const sequences = [...(slide.timeline || []), ...(slide.motion?.sequences || []), ...(out.motion?.sequences || []).filter(sequence => sequence.slideId === slideId || (sequence.slideIds || sequence.slides || []).includes(slideId) || sequence.slideIndex === slideIndex || (sequence.slideIndexes || []).includes(slideIndex))]
			// A target path explicitly authored by the AI is the sole owner of that
			// target's travel. The compiler may still add the semantic contact
			// emphasis, but must not append a second inferred push path which would
			// give PowerPoint two competing baselines for the same shape.
			const targetHasAuthoredMotion = sequences.some(sequence => (sequence.steps || [sequence]).some(step => {
				const type = String(step?.type || step?.animation?.type || '').toLowerCase()
				return namesTarget(step) && ['motion', 'path'].includes(type) && Boolean(step.motionPath || step.motionPathData || step.pathData || step.points)
			})) || (Array.isArray(target?.animation) ? target.animation : target?.animation ? [target.animation] : []).some(animation => String(animation?.type || '').toLowerCase() === 'motion')
			if (interaction.verb === 'carry') {
				const carryError = (message, code = 'PERFORMANCE_CARRY_CONFLICT') => { const error = new Error(message); error.code = code; throw error }
				if (!target || !box || !['x', 'y', 'w', 'h'].every(key => typeof box[key] === 'number' && Number.isFinite(box[key])) || box.w <= 0 || box.h <= 0 || ['model3d', 'narration', 'avatarNarration', 'media'].includes(target.kind)) carryError('Carry requires one named editable slide element with finite geometry, not a 3D physical object.', 'PERFORMANCE_TARGET_UNSUPPORTED')
				const competing = sequences.some(sequence => (sequence.steps || [sequence]).some(namesTarget)) || (slide.narration?.cues || []).some(namesTarget)
				if ((Array.isArray(target.animation) ? target.animation.length > 0 : Boolean(target.animation)) || competing || (p.interactions || []).filter(item => item.target === interaction.target).length !== 1) carryError(`Carry target ${interaction.target} already has another animation or interaction owner.`)
				const handSamples = performanceCarryHandSamples({ action, ...interaction })
				const grab = handSamples[0], drop = handSamples.at(-1)
				if (grab.atMs < (p.entry?.durationMs || 0) || (p.exit && drop.atMs > p.exit.atMs)) carryError('Carry must remain within the visible performance interval, after entry and before exit.')
				const norm = grab.normalizedPosition
				const desired = { x: box.x + box.w / 2 - projectedHandX(norm) * renderedH, y: box.y + box.h / 2 + (norm.yAboveFloor - 0.5) * renderedH }
				const aligned = { x: clamp(desired.x, frameW / 2 + 0.05, SW - frameW / 2 - 0.05), y: clamp(desired.y, frameH / 2 + 0.05, SH - frameH / 2 - 0.05) }
				if (Math.hypot(aligned.x - desired.x, aligned.y - desired.y) > 0.0001) carryError(`Carry target ${interaction.target} is outside the selected hand's reachable stage.`, 'PERFORMANCE_TARGET_UNREACHABLE')
				const previousStage = [...anchors.values()].filter(key => key.atMs <= grab.atMs).sort((a, b) => b.atMs - a.atMs)[0]?.stage
				if (authoredTravel.length) {
					const authored = authoredCenterAt(grab.atMs)
					const residual = Math.hypot(authored.x - desired.x, authored.y - desired.y)
					if (residual > 0.05) carryError(`Carry target ${interaction.target} does not meet the authored hand path at grab time.`, 'PERFORMANCE_TARGET_UNREACHABLE')
					anchors.set(grab.atMs, { atMs: grab.atMs, x: authored.x, y: authored.y, stage: previousStage, target: interaction.target })
				} else {
					for (const key of [...anchors.values()].filter(key => key.atMs >= grab.atMs).sort((a, b) => a.atMs - b.atMs)) {
						if (key.stage && key.stage !== previousStage) break
						if (key.stage === previousStage) anchors.set(key.atMs, { ...key, ...aligned })
					}
					anchors.set(grab.atMs, { atMs: grab.atMs, ...aligned, stage: previousStage, target: interaction.target })
				}
				carries.push({ interaction, action, targetIndex, target, nestedTarget, box, projectedHandX })
				interactionReadback.push({ ...interaction, atMs: Math.round(p.startMs + grab.atMs), grabMs: Math.round(p.startMs + grab.atMs), dropMs: Math.round(p.startMs + drop.atMs), contactSource: 'measured-performer-motion', alignment: 'aligned', realization: 'native-projected-hand-follow', stageTravelIncluded: true })
				continue
			}
			const motion = authoringMotionById(action?.motionId)
			const contactBone = String(motion?.privateEvidence?.contactBone || '').toLowerCase()
			const preferredHand = contactBone.includes('righthand') ? 'right' : contactBone.includes('lefthand') ? 'left' : ['left', 'right'].includes(motion?.behavior?.side) ? motion.behavior.side : null
			const hands = preferredHand ? [preferredHand] : ['left', 'right']
			// Choose the hand's maximum measured reach toward the target after the
			// authored 3D orientation. A catalog-declared contact hand is authoritative:
			// a resting opposite hand must never substitute for the performed press.
			const candidates = [action?.contact, ...(action?.handSamples || []).flatMap(sample => hands.filter(hand => sample[hand]?.normalizedPosition).map(hand => ({ ...sample[hand], hand, atMs: sample.atMs })))].filter(contact => contact?.normalizedPosition && (!preferredHand || contact.hand === preferredHand) && contact.atMs >= action.startMs + Math.min(p.blendMs / 2, action.durationMs / 4) && contact.atMs <= action.endMs - Math.min(p.blendMs / 2, action.durationMs / 4))
			const contact = candidates.sort((a, b) => direction * (projectedHandX(b.normalizedPosition) - projectedHandX(a.normalizedPosition)))[0] || ((!preferredHand || action?.contact?.hand === preferredHand) ? action?.contact : null)
			const localContactMs = Number(contact?.atMs ?? action?.contactMs)
			if (!target || !box || !contact?.normalizedPosition || !Number.isFinite(localContactMs)) {
				const error = new Error(`Performance interaction ${interaction.actionId}/${interaction.target} has no resolved element and measured hand contact.`)
				error.code = 'PERFORMANCE_CONTACT_UNRESOLVED'
				throw error
			}
			// Text boxes frequently span a whole semantic region while their visible
			// glyphs sit at its center. Contact their central content anchor; compact
			// visual objects use the approached edge for a push.
			const targetPoint = { x: interaction.verb === 'push' && !['text', 'wordart', 'text3d'].includes(target.kind) && box.w < SW * 0.55 ? (fromLeft ? box.x : box.x + box.w) : box.x + box.w / 2, y: box.y + box.h / 2 }
			const norm = contact.normalizedPosition
			const projectedX = projectedHandX(norm)
			const desired = { x: targetPoint.x - projectedX * renderedH, y: targetPoint.y + (Number(norm.yAboveFloor) - 0.5) * renderedH }
			const aligned = { x: clamp(desired.x, frameW / 2 + 0.05, SW - frameW / 2 - 0.05), y: clamp(desired.y, frameH / 2 + 0.05, SH - frameH / 2 - 0.05) }
			const residual = Math.hypot(aligned.x - desired.x, aligned.y - desired.y)
			if (residual > Math.min(SW, SH) * 0.07) {
				const error = new Error(`Performance target ${interaction.target} is outside the presenter's reachable stage. Place it in a central or body region, or use a pointing action.`)
				error.code = 'PERFORMANCE_TARGET_UNREACHABLE'
				error.evidence = { actionId: interaction.actionId, contactAtMs: p.startMs + localContactMs, contactHand: contact.hand, normalizedHand: { ...norm }, targetPoint, desiredCenter: desired, resolvedCenter: aligned, residual, renderedHeight: renderedH }
				throw error
			}
			if (authoredTravel.length) {
				const authored = authoredCenterAt(localContactMs)
				const authoredResidual = Math.hypot(authored.x - desired.x, authored.y - desired.y)
				if (authoredResidual > 0.05) {
					const error = new Error(`Performance target ${interaction.target} does not meet the authored presenter path at contact time.`)
					error.code = 'PERFORMANCE_TARGET_UNREACHABLE'
					error.evidence = { actionId: interaction.actionId, contactAtMs: p.startMs + localContactMs, authoredCenter: { x: authored.x, y: authored.y }, targetPoint, residual: authoredResidual }
					throw error
				}
				anchors.set(localContactMs, { atMs: localContactMs, x: authored.x, y: authored.y, stage: previous?.stage, target: interaction.target })
			} else {
			// Reach the element at the action's beginning and hold staging through its
			// completion. Earlier authored travel supplies the approach interval.
			// Repeated keys for the same semantic stage mean a hold, so carry the
			// solved contact placement through that hold instead of drifting back to
			// the nominal stage center while the performer is still presenting.
			for (const key of [...anchors.values()].filter(key => key.atMs >= action.startMs).sort((a, b) => a.atMs - b.atMs)) {
				if (key.stage && previous?.stage && key.stage !== previous.stage) break
				if (key.stage === previous?.stage) anchors.set(key.atMs, { ...key, ...aligned })
			}
			anchors.set(action.startMs, { atMs: action.startMs, ...aligned, stage: previous?.stage, target: interaction.target })
			anchors.set(localContactMs, { atMs: localContactMs, ...aligned, stage: previous?.stage, target: interaction.target })
			anchors.set(action.endMs, { atMs: action.endMs, ...aligned, stage: previous?.stage, target: interaction.target })
			}
			const atMs = Math.round(p.startMs + localContactMs)
			const cue = { type: 'emphasis', effect: interaction.verb === 'press' ? 'growShrink' : 'pulse', trigger: 'withPrevious', delay: atMs, duration: 500, ...(interaction.verb === 'press' ? { scale: 0.92, autoReverse: true } : {}) }
			const reactions = [cue]
			if (interaction.verb === 'push' && !targetHasAuthoredMotion) {
				const travel = Math.min(SW * 0.035, fromLeft ? SW - box.x - box.w - 0.05 : box.x - 0.05)
				if (travel > 0) reactions.push({ type: 'motion', effect: 'right', motionPath: 'right', motionPathData: `M 0 0 L ${(direction * travel / SW).toFixed(7)} 0 E`, trigger: 'withPrevious', delay: atMs, duration: 650 })
			}
				replaceTarget({ ...target, animation: [...(Array.isArray(target.animation) ? target.animation : target.animation ? [target.animation] : []), ...reactions.map(nativeTiming)] })
			interactionReadback.push({ ...interaction, atMs, contactSource: 'measured-performer-motion', alignment: residual < 0.1 ? 'aligned' : 'stage-constrained' })
		}
		const points = [...anchors.values()].sort((a, b) => a.atMs - b.atMs)
		const first = points[0]
		const centerAt = atMs => {
			const nextIndex = points.findIndex(point => point.atMs > atMs)
			if (nextIndex < 0) return points[points.length - 1]
			if (nextIndex === 0) return first
			const previous = points[nextIndex - 1], next = points[nextIndex]
			const progress = (atMs - previous.atMs) / (next.atMs - previous.atMs)
			return { x: previous.x + (next.x - previous.x) * progress, y: previous.y + (next.y - previous.y) * progress }
		}
		for (const carry of carries) {
			const { interaction, action, box, target, targetIndex, nestedTarget, projectedHandX } = carry
			const handSamples = performanceCarryHandSamples({ action, ...interaction }, points.map(point => point.atMs))
			const samples = handSamples.map(sample => {
				const center = centerAt(sample.atMs), norm = sample.normalizedPosition
				return [p.startMs + sample.atMs, center.x + projectedHandX(norm) * renderedH, center.y + (0.5 - norm.yAboveFloor) * renderedH]
			})
			if (samples.some(([, x, y]) => x - box.w / 2 < -0.0001 || y - box.h / 2 < -0.0001 || x + box.w / 2 > SW + 0.0001 || y + box.h / 2 > SH + 0.0001)) {
				const error = new Error(`Carry target ${interaction.target} leaves the slide during the measured hand path.`); error.code = 'PERFORMANCE_CARRY_TARGET_OFF_STAGE'; throw error
			}
			const replacement = { ...target, animation: timedMotionPathAnimations(samples, { slideW: SW, slideH: SH }) }
			if (!nestedTarget) slide.content[targetIndex] = replacement
			else {
				const replaced = replaceInteractionTargetContent(slide.content, target, replacement)
				if (!replaced.changed) { const error = new Error(`Performance target ${interaction.target} could not be updated inside its editable group.`); error.code = 'PERFORMANCE_TARGET_NOT_FOUND'; throw error }
				slide.content = replaced.nodes
			}
		}
		const anchor = report.stageAnchor || [0, report.floorY, 0]
		const faceAngle = Number(actor?.faceRotationY || 0) * Math.PI / 180
		const bodySamples = (report.transformSamples || []).filter(sample => sample.atMs >= (p.entry?.durationMs || 0) && (!p.exit || sample.atMs < p.exit.atMs + p.exit.durationMs)).map(sample => {
			const center = centerAt(sample.atMs), b = sample.bounds
			const xs = [b.min[0], b.max[0]].flatMap(x => [b.min[2], b.max[2]].map(z => center.x + ((x - anchor[0]) * Math.cos(faceAngle) + (z - anchor[2]) * Math.sin(faceAngle)) / report.modelHeight * renderedH))
			const top = center.y + renderedH / 2 - (b.max[1] - report.floorY) / report.modelHeight * renderedH
			const bottom = center.y + renderedH / 2 - (b.min[1] - report.floorY) / report.modelHeight * renderedH
			return { atMs: p.startMs + sample.atMs, rect: { x: Math.min(...xs), y: top, w: Math.max(...xs) - Math.min(...xs), h: bottom - top } }
		})
		const stageBbox = { x: first.x - frameW / 2, y: first.y - frameH / 2, w: frameW, h: frameH }
		const isDropEntry = p.entry?.type === 'drop'
		// A delayed performance is an authored action-clock offset, not an
		// implicit entrance. Keep the presenter visibly staged at its authored
		// first pose until the performance starts. Only an explicit `entry`
		// gives the engine permission to place the model off-stage before its
		// entrance; startMs alone must not invent that visual decision.
		const stagedEntry = Boolean(p.entry)
		// Native visibility effects may expose a 3-D poster before playback starts.
		// A fully off-stage frame keeps every delayed/explicit entrance invisible
		// during that pre-roll. Fade/appear move into place in one native timing
		// unit; drop uses its authored descent. Later paths share this origin.
		const bbox = stagedEntry ? { ...stageBbox, y: -frameH - 0.1 } : stageBbox
		const stageOffsetY = stageBbox.y - bbox.y
		const entryPathDuration = isDropEntry ? p.entry.durationMs : 1
		const entryEnd = stagedEntry ? centerAt(entryPathDuration) : null
		const entryPath = stagedEntry ? `M 0 0 L ${((entryEnd.x - first.x) / SW).toFixed(7)} ${((entryEnd.y - first.y + stageOffsetY) / SH).toFixed(7)} E` : null
		const entryProof = stagedEntry ? {
			type: p.entry?.type || 'appear', startMs: p.startMs, durationMs: entryPathDuration,
			initialFrame: { ...bbox },
			stageFrame: { x: entryEnd.x - frameW / 2, y: entryEnd.y - frameH / 2, w: frameW, h: frameH },
			motionPathData: entryPath,
		} : null
		slide._presenterPerformanceVisibleBounds = { actor: p.actor, samples: bodySamples, ...(entryProof ? { entry: entryProof } : {}) }
		const animations = [{ type: 'emphasis', effect: 'playScene', animId: 0, loop: false, trigger: 'withPrevious', delay: p.startMs, duration: p.durationMs }]
		if (isDropEntry) {
			animations.push({ type: 'entrance', effect: p.entry.fadeMs > 0 ? 'fade' : 'appear', trigger: 'withPrevious', delay: p.startMs, duration: p.entry.fadeMs > 0 ? p.entry.fadeMs : 1 })
		} else if (p.entry) animations.push({ type: 'entrance', effect: p.entry.type === 'appear' ? 'appear' : 'fade', trigger: 'withPrevious', delay: p.startMs, duration: p.entry.type === 'appear' ? 1 : p.entry.durationMs })

		if (stagedEntry) animations.push({ type: 'motion', effect: 'down', motionPath: 'down', motionPathData: entryPath, trigger: 'withPrevious', delay: p.startMs, duration: entryPathDuration })
		const shadowTravel = []
		for (let index = 1; index < points.length; index++) {
			const previous = points[index - 1], next = points[index]
			if (next.atMs <= previous.atMs || (Math.abs(next.x - previous.x) < 0.001 && Math.abs(next.y - previous.y) < 0.001)) continue
			shadowTravel.push({ type: 'motion', effect: 'right', motionPath: 'right', trigger: 'withPrevious', delay: p.startMs + previous.atMs, duration: next.atMs - previous.atMs,
				motionPathData: `M ${((previous.x - first.x) / SW).toFixed(7)} ${((previous.y - first.y) / SH).toFixed(7)} L ${((next.x - first.x) / SW).toFixed(7)} ${((next.y - first.y) / SH).toFixed(7)} E` })
			if (stagedEntry && next.atMs <= entryPathDuration) continue
			const from = stagedEntry && previous.atMs < entryPathDuration ? { ...entryEnd, atMs: entryPathDuration } : previous
			animations.push({ type: 'motion', effect: 'right', motionPath: 'right', trigger: 'withPrevious', delay: p.startMs + from.atMs, duration: next.atMs - from.atMs,
				motionPathData: `M ${((from.x - first.x) / SW).toFixed(7)} ${((from.y - first.y + stageOffsetY) / SH).toFixed(7)} L ${((next.x - first.x) / SW).toFixed(7)} ${((next.y - first.y + stageOffsetY) / SH).toFixed(7)} E` })
		}
		// Native Appear uses the exit category to set visibility hidden. Keep the
		// public "disappear" verb while lowering to that supported native effect.
		if (p.exit) animations.push({ type: 'exit', effect: p.exit.type === 'disappear' ? 'appear' : 'fade', trigger: 'withPrevious', delay: p.startMs + p.exit.atMs, duration: p.exit.type === 'disappear' ? 1 : p.exit.durationMs })
		if (normalizePresenterStageTreatment(actor?.stageTreatment).id === 'floor-ellipse') {
			const shadowW = renderedH * 0.48, shadowH = Math.max(0.08, renderedH * 0.045)
			const shadowRect = { x: first.x - shadowW / 2, y: first.y + renderedH / 2 - shadowH / 2, w: shadowW, h: shadowH }
			const shadowAnimation = [...shadowTravel, ...animations.filter(animation => animation.type === 'exit')].map(animation => ({ ...animation }))
			if (p.entry) shadowAnimation.unshift({ type: 'entrance', effect: 'fade', trigger: 'withPrevious', delay: p.startMs + (p.entry.type === 'drop' ? p.entry.durationMs * 0.55 : 0), duration: Math.max(1, p.entry.durationMs * 0.45) })

			slide.content.push({ kind: 'shape', name: `${p.actor}.performance-floor`, objectName: `${p.actor}.performance-floor`, shapeName: 'ellipse', role: 'decorative', decorative: true, keep: true, _isPureShape: true, bbox: shadowRect, style: { fill: { color: '000000', transparency: 72 }, line: { type: 'none' } }, animation: shadowAnimation.map(animation => nativeTiming(carries.length && animation.type === 'motion' ? { ...animation, motionEasing: 'linear' } : animation)), altText: 'Presenter ground shadow' })
		}
		slide.content.push({
			kind: 'model3d', name: p.actor, objectName: p.actorInstanceId || p.actor, morphName: p.actorInstanceId || p.actor, modelAsset: handle,
			scene: { animId: 0, length: p.durationMs, loop: false }, bbox,
			camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 }, objViewport: Math.round(renderedH * 1454545),
			trans: { rot: { ay: Math.round(Number(actor?.faceRotationY || 0) * 60000) } },
			// The composed asset carries its own preview. The ordinary generated-asset
			// resolver materializes that preview as a raster file; do not pass its
			// inline bytes through the file-only native model poster option.
			...(resolved.previewBase64 ? { nativeOnly: false } : {}),
			animation: animations.map(animation => nativeTiming(carries.length && animation.type === 'motion' ? { ...animation, motionEasing: 'linear' } : animation)), altText: `3D presenter ${p.actor} performing ${p.actions.map(action => action.id).join(', ')}`,
		_presenterIntent: 'performance', _presenterPerformance: true, ...(entryProof ? { _presenterPerformanceEntry: entryProof } : {}),
		})
		// Z-order is an explicit authoring decision. The default keeps the historical
		// presenter-on-top behavior; the opt-in policy only moves the named target
		// objects after this presenter so their authored labels/geometry stay readable.
		// The engine never infers this policy from an overlap or chooses targets itself.
		if (p.layering?.mode === 'presenter-behind-targets') {
			const targetNames = new Set(p.layering.targets)
			const targetBlocks = slide.content.filter(block => targetNames.has(block?.name) || targetNames.has(block?.objectName))
			const resolvedNames = new Set(targetBlocks.flatMap(block => [block?.name, block?.objectName].filter(Boolean)))
			const missing = p.layering.targets.filter(target => !resolvedNames.has(target))
			if (missing.length) {
				const error = new Error(`Layering target(s) ${missing.join(', ')} were not found on slide ${slideId}.`)
				error.code = 'PRESENTER_LAYER_TARGET_UNRESOLVED'
				throw error
			}
			const presenterBlock = slide.content.at(-1)
			slide.content = [
				...slide.content.filter(block => block !== presenterBlock && !targetBlocks.includes(block)),
				presenterBlock,
				...targetBlocks,
			]
		}
		const timing = { slideId, actor: p.actor, startMs: p.startMs, durationMs: p.durationMs, endMs: p.startMs + p.durationMs, dwellMs: p.startMs + p.durationMs + 500,
			realization: 'continuous-native-3d', sceneCount: 1, blendMs: p.blendMs,
			frame: { ...authoredStageBbox }, travelCoordinateUnit: 'slide-inches',
			actions: (report.actions || []).map(action => ({ id: action.id, motionId: action.motionId, startMs: p.startMs + action.startMs, durationMs: action.durationMs, endMs: p.startMs + action.endMs, cycles: action.cycles, ...(action.sourceStartMs === undefined ? {} : { sourceStartMs: action.sourceStartMs }), ...(action.sourceEndMs === undefined ? {} : { sourceEndMs: action.sourceEndMs }), ...(interactionReadback.some(item => item.actionId === action.id) ? { contactMs: interactionReadback.find(item => item.actionId === action.id).atMs } : Number.isFinite(action.contactMs) ? { contactMs: Math.round(p.startMs + action.contactMs) } : {}) })),
			...(p.entry ? { entry: { ...p.entry, atMs: p.startMs } } : {}), ...(p.exit ? { exit: { ...p.exit, atMs: p.startMs + p.exit.atMs } } : {}), transforms: p.transforms, travel: p.travel,
			realizedTravel: [...anchors.values()].sort((a, b) => a.atMs - b.atMs).map(point => ({ atMs: point.atMs, center: { x: point.x, y: point.y }, ...(point.stage ? { stage: point.stage } : {}) })),
			interactions: interactionReadback, ...(p.layering ? { layering: p.layering } : {}) }
		slide._presenterPerformanceTiming = timing
		readback.push(timing)
	}
	out._presenterPerformancePlan = { contractVersion: 'betterpptx.presenter-performance.v2', timelineUnit: 'milliseconds-from-slide-start', performances: readback }
	return out
}

// The visual-reference normalizer is the only writer of this bridge. Public
// authors supply pixelFrame, never these resolved slide-unit coordinates. Keep
// this separate from resolvePresenter so cast/legacy staging cannot accidentally
// acquire an exact frame merely by receiving an unrecognized presenter field.
function visualReferencePresenterFrame(spec, slide) {
	const authoredSlideFrame = slide?.presenter?.rect || slide?.presenter?.bbox
	const authoredDeckFrame = spec?.presenter?.rect || spec?.presenter?.bbox
	const authoredFrame = authoredSlideFrame ?? authoredDeckFrame
	if (authoredFrame !== undefined && authoredFrame !== null) {
		if (spec?.authoringContract?.geometryAuthority !== 'ai' || spec?.authoringContract?.placementPolicy !== 'ai-authored-geometry-v1') {
			const error = new Error('presenter.rect/bbox requires geometryAuthority="ai" with placementPolicy="ai-authored-geometry-v1".')
			error.code = 'PRESENTER_FRAME_CONTEXT_REQUIRED'
			throw error
		}
		if (!isObj(authoredFrame) || !['x', 'y', 'w', 'h'].every(key => typeof authoredFrame[key] === 'number' && Number.isFinite(authoredFrame[key])) || authoredFrame.w <= 0 || authoredFrame.h <= 0) {
			const error = new Error('presenter.rect/bbox must contain finite slide-inch coordinates and positive width and height.')
			error.code = 'PRESENTER_GEOMETRY_REQUIRED'
			throw error
		}
		return { source: authoredSlideFrame != null ? 'slide-authored-inches' : 'deck-authored-inches', frame: { ...authoredFrame } }
	}
	const slideFrame = slide?.presenter?._visualReferenceFrame
	const deckFrame = spec?.presenter?._visualReferenceFrame
	const frame = slideFrame ?? deckFrame
	if (frame === undefined || frame === null) return null
	const reference = spec?.visualReference
	const validContext = reference?.mode === 'ai-reconstructed-native'
		&& reference?.coordinateMode === 'pixels'
		&& spec?.authoringContract?.placementPolicy === 'visual-reference-pixels-v1'
	if (!validContext) {
		const error = new Error('presenter.pixelFrame requires the explicit visualReference pixel reconstruction route.')
		error.code = 'PRESENTER_PIXEL_FRAME_CONTEXT_REQUIRED'
		throw error
	}
	if (!isObj(frame) || !['x', 'y', 'w', 'h'].every(key => typeof frame[key] === 'number' && Number.isFinite(frame[key])) || frame.w <= 0 || frame.h <= 0) {
		const error = new Error('presenter.pixelFrame must resolve to finite coordinates and positive width and height.')
		error.code = 'PRESENTER_PIXEL_FRAME_INVALID'
		throw error
	}
	return {
		source: slideFrame != null ? 'slide' : 'deck',
		// Do not round, resize, recede, grow, drift, or clamp this authored frame.
		frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
	}
}

// Which slides the presenter appears on. 'all' | 'opener+closer' | [indexes].
export function targetSlideIndexes(onSlides, count) {
	if (Array.isArray(onSlides)) return onSlides.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n < count)
	const key = String(onSlides || 'all').toLowerCase()
	if (key === 'opener+closer' || key === 'ends') return count <= 1 ? [0] : [0, count - 1]
	if (key === 'none') return []
	return Array.from({ length: count }, (_, i) => i) // all
}

// Merge the explicit spec.presenter over the world persona. Returns null when nothing is declared OR no
// avatar model can be resolved (the presenter needs a rigged multi-clip GLB to inject).
export function resolvePresenter(specPresenter, worldPresenter, avatarClipMap = null, avatarContactMap = null, avatarClipDurations = null, avatarViewportMargin = null) {
	const p = isObj(specPresenter) ? specPresenter : null
	const w = isObj(worldPresenter) ? worldPresenter : null
	if (!p && !w) return null
	if (p && p.enabled === false) return null
	const model = (p && (p.model || p.avatar || p.glb)) || (w && w.model) || null
	if (!model) return null // world gives STYLE; author brings the MODEL (a default avatar ships with gen)
	const persona = (p && p.persona) || (w && w.persona) || null
	// Dialect: persona default <- world override <- author override (bias merged key-wise, not replaced).
	const base = gestureDialectFor(persona)
	const wd = (w && w.gestureDialect) || {}
	const pd = (p && p.gestureDialect) || {}
	const dialect = { ...base, ...wd, ...pd, bias: { ...base.bias, ...(wd.bias || {}), ...(pd.bias || {}) } }
	// clipMap precedence: DEFAULT (all-clip-0 fallback for third-party GLBs) <- the BAKED avatar's manifest
	// clipMap (the real intent->animId for a Baker performer) <- world override <- author override. When the
	// avatar was performed by the Baker, avatarClipMap is the frozen identity map, so every intent resolves to a
	// distinct baked clip instead of collapsing to 0.
	const amap = isObj(avatarClipMap) ? avatarClipMap : null
	return {
		model,
		...(p && Object.prototype.hasOwnProperty.call(p, 'staticPose') ? { staticPose: normalizeStaticPose(p.staticPose, 'presenter.staticPose') } : {}),
		clipMap: { ...DEFAULT_CLIPMAP, ...(amap || {}), ...((w && w.clipMap) || {}), ...((p && p.clipMap) || {}) },
		clipMapSource: amap ? 'manifest' : 'default',
		choreography: (p && p.choreography) || (w && w.choreography) || 'keynote',
		// Presenter SIZE multiplier on the choreography's base scale (1 = default). A hero showcase wants the
		// avatar large from the first slide; a supporting presenter wants it small. Clamped to a sane [0.5, 2.2].
		scale: Math.max(0.5, Math.min(2.2, Number((p && p.scale) ?? (w && w.scale) ?? 1) || 1)),
		// VIEWPORT MARGIN: DIVIDES objViewport to zoom OUT so a clip's MOTION ENVELOPE stays in frame. Measured
		// (viewport-sweep, 2026-07-13): LARGER viewportSz = MORE zoomed IN; the h*1.6e6 calibration fills the
		// frame with the REST pose, and an action clip (leap/kick/crouch) needs ~half that to keep the whole
		// arc visible (ground_pound framed head-to-toe at ~3.5-4.5e6 vs 9e6 rest-fit for a 5.6in frame).
		// Kinetic presenters default 2.2 (set by the kinetic materializer); calm baked-gesture presenters keep 1.
		viewportMargin: Math.max(1, Math.min(3, Number((p && p.viewportMargin) ?? (w && w.viewportMargin) ?? avatarViewportMargin ?? 1) || 1)),
		stage: (p && p.stage) || (w && w.stage) || 'left',
		// The World may suggest persona/choreography/stage placement, but it never
		// chooses a decorative presenter treatment. Only the explicit public
		// presenter.stageTreatment field can opt in; omission stays `none`.
		stageTreatment: normalizePresenterStageTreatment(p && p.stageTreatment),
		onSlides: (p && p.onSlides) || (w && w.onSlides) || 'all',
		persona,
		dialect,
		// OPT-IN within-slide travel: a named motion path (e.g. 'right') the presenter walks mid-slide while it
		// gestures (the co-fire capability). null = the default stationary gesture. author <- world.
		travelPath: (p && p.travelPath) || (w && w.travelPath) || null,
		travelMs: (p && p.travelMs) || (w && w.travelMs) || 2000,
		// OPT-IN content pairing: the gesture drives a native effect on a salient content object (causation).
		pairContent: (p && p.pairContent) ?? (w && w.pairContent) ?? false,
		// contactMap: animId -> measured apex ms (from the baked manifest.contacts). Drives paired-effect timing.
		contactMap: isObj(avatarContactMap) ? avatarContactMap : ((p && p.contactMap) || (w && w.contactMap) || null),
		// clipDurations: animId -> measured clip LENGTH ms (from manifest.contacts.durationMs). Sets how long the
		// playScene plays so the full gesture arc (through its apex) is shown, not just the windup.
		clipDurations: isObj(avatarClipDurations) ? avatarClipDurations : ((p && p.clipDurations) || (w && w.clipDurations) || null),
		// FACE THE AUDIENCE: the shipped Joe/Louise roster and the validated Meshy hybrid are authored
		// front-facing in their GLB basis. The native PowerPoint transform is therefore zero yaw by default.
		// Authors may override this for a separately calibrated asset basis.
		faceRotationY: (p && p.faceRotationY) ?? (w && w.faceRotationY) ?? 0,
		// POSTER: am3d needs a raster anchor or the model renders EMPTY in PowerPoint. A Baker-performed gen
		// asset carries its render preview (auto-resolved by the compiler); this is the author/world override
		// and the escape hatch for assets without a bundled preview.
		poster: (p && (p.poster || p.posterAsset)) || (w && (w.poster || w.posterAsset)) || null,
	}
}

// EXPAND: mutate a clone of the spec, injecting the presenter per target slide. Pass options.worldPresenter
// (the resolved world persona style) so a world can drive the presenter. Idempotent + safe: returns spec
// unchanged when no presenter is resolvable, and never doubles an author-placed 'presenter'.
export function expandPresenterDirective(spec, options = {}) {
	if (!isObj(spec) || !Array.isArray(spec.slides) || !spec.slides.length) return spec
	const P = resolvePresenter(spec.presenter, options.worldPresenter, options.avatarClipMap, options.avatarContactMap, options.avatarClipDurations, options.avatarViewportMargin)
	if (!P) return spec
	const out = { ...spec, slides: spec.slides.map(s => ({ ...s, content: [...asArray(s.content)] })) }
	const targets = new Set(targetSlideIndexes(P.onSlides, out.slides.length))
	const choreo = CHOREO[String(P.choreography).toLowerCase()] || CHOREO.keynote
	const dims = dimsOf(options) // T24
	// C1 application: the deck-level story arc (options.storyArc) drives per-slide presenter presence —
	// CONSERVATIVE: only RECEDES on data-dense slides; full slides keep current behavior. Off unless passed.
	const arc = Array.isArray(options.storyArc) ? options.storyArc : null
	let appearIdx = 0
	let lastAppearanceSlideIndex = null
	for (let i = 0; i < out.slides.length; i++) {
		if (!targets.has(i)) continue
		const slide = out.slides[i]
		if (slide.content.some(c => isObj(c) && (c.name === 'presenter' || c.objectName === 'presenter'))) { lastAppearanceSlideIndex = i; appearIdx++; continue }
		// A2a §2.6 step 7: when a solved interaction beat already staged this presenter on the
		// slide, the default beat is redundant — suppress it (the Morph chain resumes after).
		{
			const owned = options.suppress && typeof options.suppress.get === 'function' ? options.suppress.get(slide.id) : null
			const actorId = String((spec.presenter && spec.presenter.id) || 'presenter')
			if (owned && (owned.has(actorId) || owned.has('presenter'))) { lastAppearanceSlideIndex = i; appearIdx++; continue }
		}
		// L2 (narration -> intent, role tie-break) + L3 (dialect bias) in one shared decision, so this and the
		// appliedDefaults report agree exactly.
		const actorId = String((spec.presenter && spec.presenter.id) || 'presenter')
		const staticPose = normalizeStaticPose(Object.prototype.hasOwnProperty.call(slide.presenter || {}, 'staticPose') ? slide.presenter.staticPose : P.staticPose, 'presenter.staticPose')
		const motionPresenter = staticPose === undefined ? P : { ...P, clipMap: clipMapForOrdinaryStaticPose(P.clipMap, staticPose) }
		const { intent, motionId, animId, narrationCue } = gestureForSlide(slide, motionPresenter, actorId)
		const exactFrame = visualReferencePresenterFrame(spec, slide)
		if (!exactFrame) {
			const error = new Error('Every presenter appearance requires an AI-authored presenter.rect/bbox or visual-reference pixelFrame. Engine-owned presenter placement is deactivated.')
			error.code = 'PRESENTER_GEOMETRY_REQUIRED'
			throw error
		}
		const irCtx = { ...dims, budgetMs: narrationBudgetMs(slide), ...(exactFrame ? { exactPresenterFrame: true } : {}) } // A2a master clock
		// C1: on a RECEDE slide the presenter shrinks (× arc.scale ≤1) + moves to its arc stage so it
		// never covers dense data; full slides unaffected (recedeScale 1, stage = P.stage).
		const arcEntry = arc ? arc[i] : null
		const recede = arcEntry && arcEntry.presence === 'recede'
		const recedeScale = recede ? (arcEntry.scale || 0.75) : 1
		const stageForSlide = recede ? (arcEntry.stage || 'corner') : P.stage
		const stageZone = presenterZoneFor(stageForSlide, irCtx)
		// The same stage contract used by choreography validation also constrains the
		// title/body regions. This prevents right-stage presenters from covering copy
		// while preserving explicit author regions as the later override.
		if (stageZone) slide.presenterZone = stageZone
		else if (exactFrame) delete slide.presenterZone
		// a receding presenter is stepping BACK, not approaching — drop the per-appearance growth so
		// recede always shrinks (else growPerAppearance can cancel the recede on later slides).
		const grow = recede ? 0 : choreo.growPerAppearance * appearIdx
		const scale = (choreo.baseScale + grow) * (P.scale || 1) * recedeScale
		const bbox = exactFrame.frame
		// COMPOSE THROUGH THE ENGINE. Validate the clip block (fail-safe: it is always valid here — animId is
		// clamped to the ceiling and placement() clamps the bbox on-slide — but if a future change breaks that,
		// _choreo records it instead of shipping a dead presenter). Then, only if within-slide travel is opted
		// in AND the engine confirms it stays on-slide, compile + attach the validated motion path.
		const baseVal = choreoValidate(slideChoreographyIR(P, animId, intent, bbox, false, irCtx))
		let playSceneAnim = null, motionAnim = null, travelIn = null
		if (P.travelPath) {
			const travelIR = slideChoreographyIR(P, animId, intent, bbox, true, irCtx)
			const tv = choreoValidate(travelIR)
			if (tv.ok) {
				const compiled = choreoCompile(travelIR)
				const cue = compiled.cues.find(c => c.animation && c.animation.type === 'motion')
				// Both effects, explicitly: an explicit `animation` suppresses the scene->playScene auto-gen, so we
				// must carry the playScene ourselves — plus the motion path (co-fire). Exactly TWO animations, so
				// we never trip the "one 3D-scene animation" limit (playScene is the only 3D-scene one; the path is
				// a graphic-frame transform).
				if (cue) { playSceneAnim = compiled.model3d.animation; motionAnim = cue.animation; travelIn = choreoPredict(travelIR).netTravelIn }
			}
		}
		// Same objectName + morphName on every appearance -> PowerPoint Morph-by-object pairs them so the
		// presenter TRAVELS + GROWS across the boundary. scene:{animId} -> auto playScene gesture clip.
		const block = {
			kind: 'model3d', name: 'presenter', objectName: 'presenter', morphName: 'presenter',
			modelAsset: P.model, scene: { animId, loop: true }, bbox,
			...(staticPose !== undefined ? { staticPose } : {}),
			_engineOwnedGeometry: false,
			// Native slideshow calibration: the generic model3d default (90,000,000 / 28°) hydrates
			// the presenter in static export but drops it during live playback. Keep the proven motion
			// camera explicit in the presenter contract so Meshy, Joe, and Louise share the same runtime.
			camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 },
			// FILL the frame: PowerPoint's am3d viewer sizes the model by objViewport (EMU), NOT the shape frame
			// or the model's own scale — a default (2867650) leaves a baked performer at ~25% of its frame. This
			// scales objViewport with the frame HEIGHT so the (Baker-flattened, ~1.8u) performer fills its box
			// head-to-toe at any placement size, preserving the grow-across-slides choreography. Calibrated in PP
			// COM render: ~11e6 fills a 6.8in-tall frame (see betterpptx-rigged3d-gen memory).
			objViewport: Math.round((bbox && bbox.h ? bbox.h : 4.6) * 1454545 / (P.viewportMargin || 1)),
			// Face the audience: the shipped +Z-facing basis uses zero yaw; a 180° yaw shows its back.
			// `camera.rotateY` is not serialized by the model3d XML path; `trans.rot.ay` is the native field
			// consumed by PowerPoint's am3d viewer (60,000 units per degree).
			...(Number.isFinite(Number(P.faceRotationY)) ? {
				trans: { rot: { ay: Math.round(Number(P.faceRotationY) * 60000) } },
			} : {}),
			// Poster raster: without it PowerPoint renders the am3d model EMPTY (the model3d builder defaults to
			// nativeOnly, which omits the raster anchor). A presenter must always render, so force the poster on
			// (nativeOnly:false) and supply the raster — P.poster (author/world) or the gen asset's baked preview.
			...(P.poster ? { posterAsset: P.poster, nativeOnly: false } : {}),
			altText: `3D presenter avatar (${intent})`,
			// _presenterIntent = the chosen gesture; _gestureStyle carries the dialect params the author-time bake
			// (L5, worker) will consume. _presenterBeat kept as an alias of the intent for back-compat.
			_presenterIntent: intent, _presenterBeat: intent,
			...(motionId ? { _presenterMotionId: motionId } : {}),
			...(narrationCue != null ? { _presenterNarrationCue: narrationCue } : {}),
			_presenterPersona: P.persona || undefined,
			_gestureStyle: P.dialect ? { amplitude: P.dialect.amplitude, tempo: P.dialect.tempo, energy: P.dialect.energy } : undefined,
			// _choreo = the engine's verdict on this appearance (for the plan/report + any downstream gate).
			_choreo: { valid: baseVal.ok, warnings: baseVal.warnings.map(w => w.code), errors: baseVal.errors.map(e => e.code), travelIn },
		}
		// A validated within-slide motion path composes WITH the playScene (co-fire: the path transforms the
		// graphic frame, not the 3D scene). Emit BOTH explicitly (an explicit animation suppresses the scene
		// auto-playScene).
		if (motionAnim) block.animation = [playSceneAnim, motionAnim]
		// No co-fire, but we HAVE a measured clip length → emit an explicit single playScene so the FULL gesture
		// plays (the engine's auto-playScene caps it at ~2s, cutting the clip before its apex). One 3D-scene
		// animation, ceiling-safe. Guarded on clipDurations so the unmeasured default path is untouched.
		else if (P.clipDurations && typeof P.clipDurations[animId] === 'number' && P.clipDurations[animId] > 0)
			block.animation = [choreoCompile(slideChoreographyIR(P, animId, intent, bbox, false, irCtx)).model3d.animation]
		// Direct native siblings in strict z-order: decorative ground first, then
		// the model3d AlternateContent. Never group them or place the ellipse in the
		// model fallback; doing so would make the fallback and animation topology
		// brittle. The treatment remains static under full/reduced/static policies.
		slide.content.push(...presenterStageBlocks(slide.id || `slide-${i + 1}`, bbox, P.stageTreatment, dims, options.presenterPalette))
		slide.content.push(block)
		// CONTENT PAIRING (opt-in): the gesture drives a native effect on a salient content object — the co-fire
		// causation. Engine-validate the effect category first; attach a CLONE of the target (never mutate the
		// input spec item). Fires withPrevious at the gesture apex (contactMs).
		if (P.pairContent && CONTENT_PAIRING[intent]) {
			const pr = CONTENT_PAIRING[intent]
			const target = pickPairTarget(slide.content)
			if (target) {
				const dur = pr.type === 'emphasis' ? 700 : 600
				const delay = pairingDelayMs(P, animId, intent) // measured clip contact, else the intent apex heuristic
				const irc = slideChoreographyIR(P, animId, intent, bbox, false, irCtx)
				irc.content = [{ name: 'pairTarget', bbox: { x: 4.5, y: 2.8, w: 4, h: 2 },
					cue: { type: pr.type, effect: pr.effect, trigger: 'withPrevious', delayMs: delay.ms, durationMs: dur } }]
				const badCat = choreoValidate(irc).errors.some(e => e.code === 'EFFECT_CATEGORY' || e.code === 'BAD_TYPE')
				if (!badCat) {
					const cue = { type: pr.type, effect: pr.effect, trigger: 'withPrevious', delay: delay.ms, duration: dur }
					if (pr.direction) cue.direction = pr.direction
					const idx = slide.content.indexOf(target)
					slide.content[idx] = { ...target, animation: [cue] } // clone, don't mutate the source item
					block._choreo.paired = { targetKind: String(target.kind || '').toLowerCase(), effect: pr.effect, type: pr.type, atMs: delay.ms, contactSource: delay.source }
				}
			}
		}
		// Travel needs a Morph transition on each slide AFTER the first appearance (free tier gates this to
		// slide 2 only; whole-deck travel is a premium capability). Respect an author-set transition.
		// Transitions are creative timing choices owned by the consuming AI. Never
		// add Morph merely because a presenter repeats across adjacent slides.
		lastAppearanceSlideIndex = i
		appearIdx++
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-PRESENTER SCENES (the CAST). PowerPoint's real 3D limit is ONE scene clip per model INSTANCE (spid),
// NOT per slide (COM-proven: multi-model-deck 2026-07-13) — so a slide is a STAGE: cast several 3D actors, each
// its own shape with its own clip, each cued independently (withPrevious/afterPrevious/delay). The embedded GLB
// dedupes, so N instances of one character cost one model's bytes.
//
//   spec.presenters: { cast: [ { id, model, kinetic?, clipMap?, scale?, viewportMargin?, poster?, … }, … ],
//                      onSlides?: 'all'|[…] }
//   slides[].scene:  [ { actor, intent?, at?: 'withPrevious'|'afterPrevious'|ms, delayMs?, loop?, bbox? }, … ]
//
// No slide.scene → every cast actor appears (cast order), the FIRST beat fires withPrevious and the rest
// afterPrevious — a natural handoff sequence. The same actor MAY appear in several beats of one slide (gesture
// chaining): repeat instances get unique objectNames; only the first carries the actor's morphName, so each cast
// member keeps ONE Morph thread across slides. When a cast is present it REPLACES the single spec.presenter path.
// ─────────────────────────────────────────────────────────────────────────────

// Side-by-side stage slots for n actors: split the stage into n columns, one actor per column, bottom-anchored.
// SQUARE windows (see placement()): the live render is uniform (frame = clipping window, never distorts) but the
// square POSTER stretches to a non-square frame in stills — square kills that, and gives gestures lateral room.
function castSlotBBoxes(n, scale = 1, dims = {}) {
	const SW = SWof(dims), SH = SHof(dims)
	const slot = (SW - 1.2) / Math.max(1, n)
	const h = Math.min(6.4, 4.6 * scale, slot - 0.3)
	const w = h
	return Array.from({ length: n }, (_, i) => {
		const x = 0.6 + slot * i + (slot - w) / 2
		return { x: round2(Math.max(0.2, Math.min(SW - w - 0.2, x))), y: round2(SH - h - 0.4), w: round2(w), h: round2(h) }
	})
}

// Resolve every cast member like a presenter. options.castAssets = { [actorId]: { clipMap, contactMap,
// clipDurations } } — the per-actor baked/kinetic maps the compiler read from the gen cache.
export function resolveCast(spec, options = {}) {
	const cast = spec && spec.presenters && Array.isArray(spec.presenters.cast) ? spec.presenters.cast : null
	if (!cast || !cast.length) return null
	const assets = options.castAssets || {}
	const out = []
	for (const entry of cast) {
		if (!isObj(entry) || !entry.id) continue
		const a = assets[entry.id] || {}
		const P = resolvePresenter(entry, null, a.clipMap || null, a.contactMap || null, a.clipDurations || null, a.viewportMargin || null)
		if (P) out.push({ id: String(entry.id), P })
	}
	return out.length ? out : null
}

// One actor beat → one model3d instance block (same proven shape as the single-presenter block).
function castBeatBlock(actorId, P, slide, beat, bbox, beatIdx, firstOfActor, ctx = {}) {
	if (beat.loop !== undefined && typeof beat.loop !== 'boolean') {
		const error = new Error('scene.loop must be a boolean: false plays once and holds; true repeats.')
		error.code = 'PRESENTER_SCENE_LOOP_INVALID'
		throw error
	}
	const motionId = String(beat.motionId || '').trim() || null
	const staticPose = normalizeStaticPose(Object.prototype.hasOwnProperty.call(beat, 'staticPose') ? beat.staticPose : P.staticPose, 'scene.staticPose')
	const narrationCue = beat.narrationCue ?? beat.cue ?? null
	const intent = motionId || beat.intent || classifyGesture(slide, { role: slide.role, dialect: P.dialect }).intent
	const animId = motionId
		? resolveExactMotionAnimId(clipMapForOrdinaryStaticPose(P.clipMap, staticPose), motionId, actorId)
		: Number.isInteger(beat.animId) ? Math.max(0, Math.min(CLIP_CEILING - 1, beat.animId))
		: resolveClipAnimId(P.clipMap, intent)
	const compiled = choreoCompile(slideChoreographyIR(P, animId, intent, bbox, false, ctx)).model3d.animation
	const trigger = beat.at === 'withPrevious' || beat.at === 'afterPrevious' ? beat.at
		: typeof beat.at === 'number' ? 'withPrevious'
		: beatIdx === 0 ? 'withPrevious' : 'afterPrevious'
	const delay = typeof beat.at === 'number' ? Math.max(0, Math.round(beat.at)) : Math.max(0, Math.round(beat.delayMs || 0))
	const objectName = firstOfActor ? actorId : `${actorId}_${beatIdx}`
	const block = {
		kind: 'model3d', name: objectName, objectName,
		...(firstOfActor ? { morphName: actorId } : {}), // one Morph thread per actor across slides
		modelAsset: P.model, scene: { animId, loop: beat.loop !== false }, bbox,
		...(staticPose !== undefined ? { staticPose } : {}),
		_engineOwnedGeometry: false,
		_geometryProvenance: 'ai-authored-presenter-frame',
		camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 },
		objViewport: Math.round((bbox && bbox.h ? bbox.h : 4.6) * 1454545 / (P.viewportMargin || 1)),
		...(Number.isFinite(Number(P.faceRotationY)) ? {
			trans: { rot: { ay: Math.round(Number(P.faceRotationY) * 60000) } },
		} : {}),
		...(P.poster ? { posterAsset: P.poster, nativeOnly: false } : {}),
		altText: `3D actor ${actorId} (${intent})`,
		// The explicit animation bypasses automatic scene playback, so the single-pass
		// option must reach both carriers. Omitted/true keep the exact legacy animation.
		animation: [{ ...compiled, trigger, delay, ...(beat.loop === false ? { loop: false } : {}) }],
		_presenterIntent: intent, _castActor: actorId,
		...(motionId ? { _presenterMotionId: motionId } : {}),
		...(narrationCue != null ? { _presenterNarrationCue: narrationCue } : {}),
	}
	const v = choreoValidate(slideChoreographyIR(P, animId, intent, bbox, false, ctx))
	block._choreo = { valid: v.ok, warnings: v.warnings.map(w => w.code), errors: v.errors.map(e => e.code) }
	return block
}

// EXPAND the cast: inject each slide's scene (or the default all-actors handoff). Idempotent + fail-safe:
// unchanged when there is no cast; never doubles an existing actor objectName on a slide.
export function expandCastDirective(spec, options = {}) {
	if (!isObj(spec) || !Array.isArray(spec.slides) || !spec.slides.length) return spec
	const cast = resolveCast(spec, options)
	if (!cast) return spec
	const byId = new Map(cast.map(c => [c.id, c.P]))
	const out = { ...spec, presenter: undefined, slides: spec.slides.map(s => ({ ...s, content: [...asArray(s.content)] })) }
	const targets = new Set(targetSlideIndexes((spec.presenters && spec.presenters.onSlides) || 'all', out.slides.length))
	const dims = dimsOf(options) // T24
	let appeared = false
	for (let i = 0; i < out.slides.length; i++) {
		if (!targets.has(i)) continue
		const slide = out.slides[i]
		// A2a §2.6 step 7: a SOLVED interaction beat owns its actor on that slide — suppress the
		// redundant DEFAULT beat (an authored scene beat is an explicit author wish and is kept).
		const owned = options.suppress && typeof options.suppress.get === 'function' ? options.suppress.get(slide.id) : null
		// beats: the authored scene, else every actor once in cast order (a natural handoff)
		const beats = Array.isArray(slide.scene) && slide.scene.length
			? slide.scene.filter(b => isObj(b) && byId.has(String(b.actor)))
			: cast.map(c => ({ actor: c.id })).filter(b => !owned || !owned.has(String(b.actor)))
		if (!beats.length) continue
		// distinct actors on this slide get side-by-side slots (beat.bbox overrides)
		const actors = [...new Set(beats.map(b => String(b.actor)))]
		const slots = castSlotBBoxes(actors.length, Math.max(...actors.map(a => byId.get(a).scale || 1)), dims)
		const slotOf = new Map(actors.map((a, k) => [a, slots[k]]))
		const seen = new Set(slide.content.map(c => isObj(c) ? (c.objectName || c.name) : null).filter(Boolean))
		const perActorCount = new Map()
		beats.forEach((beat, k) => {
			const id = String(beat.actor)
			const P = byId.get(id)
			const nth = perActorCount.get(id) || 0
			perActorCount.set(id, nth + 1)
			const objectName = nth === 0 ? id : `${id}_${k}`
			if (seen.has(objectName)) return // author already placed this actor
			const bbox = isObj(beat.bbox) ? beat.bbox : slotOf.get(id)
			slide.content.push(castBeatBlock(id, P, slide, beat, bbox, k, nth === 0, { ...dims, budgetMs: narrationBudgetMs(slide) }))
		})
		// Morph carries each actor (matched by morphName) across slides after the first cast appearance.
		if (appeared && !slide.transition) slide.transition = { type: 'morph', option: 'byObject' }
		appeared = true
	}
	return out
}

// PLAN (report, no mutation): the per-slide gesture the presenter WILL perform, for appliedDefaults so the
// authoring AI can see + adjust each choice (and why it was chosen). Pure function of the RAW spec — same
// resolvePresenter + gestureForSlide the expander uses, so the report matches what actually gets injected.
// Returns null when no presenter is active (no spec.presenter.model and no world model).
export function planPresenterGestures(spec, options = {}) {
	if (!isObj(spec) || !Array.isArray(spec.slides) || !spec.slides.length) return null
	const P = resolvePresenter(spec.presenter, options.worldPresenter, options.avatarClipMap, options.avatarContactMap, options.avatarClipDurations, options.avatarViewportMargin)
	if (!P) return null
	const targets = new Set(targetSlideIndexes(P.onSlides, spec.slides.length))
	const choreo = CHOREO[String(P.choreography).toLowerCase()] || CHOREO.keynote
	const dims = dimsOf(options) // T24
	const perSlide = []
	let appearIdx = 0
	// A2a §2.6 step 7: report suppression exactly as the expander applies it — a slide whose
	// presenter actor is owned by a SOLVED interaction beat gets a 'suppressed' entry, not a
	// phantom default gesture (report == truth).
	const ownedByInteraction = new Map()
	for (const b of spec._synergyPlan || []) {
		if (b && b.slideId != null && b.actor != null && (b.clip != null || b.framePos)) {
			if (!ownedByInteraction.has(b.slideId)) ownedByInteraction.set(b.slideId, new Set())
			ownedByInteraction.get(b.slideId).add(String(b.actor))
		}
	}
	const presenterActorId = String((spec.presenter && spec.presenter.id) || 'presenter')
	for (let i = 0; i < spec.slides.length; i++) {
		if (!targets.has(i)) continue
		if (spec.slides[i].presenterPerformance?.actor === presenterActorId) {
			perSlide.push({ slide: i, suppressed: 'presenter-performance', note: 'The authored continuous performance owns this presenter; read authoringContracts.presenterPerformance for its complete timeline.' })
			appearIdx++
			continue
		}
		const ownedSet = ownedByInteraction.get(spec.slides[i].id)
		if (ownedSet && (ownedSet.has(presenterActorId) || ownedSet.has('presenter'))) {
			perSlide.push({ slide: i, suppressed: 'interaction', note: 'a solved interaction beat stages this actor here; the default gesture beat is suppressed' })
			appearIdx++
			continue
		}
		const staticPose = normalizeStaticPose(Object.prototype.hasOwnProperty.call(spec.slides[i].presenter || {}, 'staticPose') ? spec.slides[i].presenter.staticPose : P.staticPose, 'presenter.staticPose')
		const motionPresenter = staticPose === undefined ? P : { ...P, clipMap: clipMapForOrdinaryStaticPose(P.clipMap, staticPose) }
		const g = gestureForSlide(spec.slides[i], motionPresenter, presenterActorId)
		const entry = { slide: i, intent: g.intent, from: g.from, animId: g.animId }
		if (staticPose !== undefined) entry.staticPose = staticPose === null ? null : { ...staticPose, appliesTo: 'stopped-edit-view', playbackStartOffsetApplied: false }
		if (g.motionId) entry.motionId = g.motionId
		if (g.narrationCue != null) entry.narrationCue = g.narrationCue
		if (g.biased) entry.biased = true // the world/author dialect re-mapped the classified intent
		// Run the SAME choreography validation the expander uses, so the plan reports whether the appearance is
		// playable and (when travel is opted in) how far it moves — calculation, not a render.
		const scale = (choreo.baseScale + choreo.growPerAppearance * appearIdx) * (P.scale || 1)
		const exactFrame = visualReferencePresenterFrame(spec, spec.slides[i])
		if (!exactFrame) {
			const error = new Error('Every presenter scene requires an AI-authored presenter.rect/bbox or visual-reference pixelFrame. Engine-owned presenter placement is deactivated.')
			error.code = 'PRESENTER_GEOMETRY_REQUIRED'
			throw error
		}
		const irCtx = { ...dims, budgetMs: narrationBudgetMs(spec.slides[i]), ...(exactFrame ? { exactPresenterFrame: true } : {}) } // A2a master clock
		const bbox = exactFrame.frame
		if (exactFrame) entry.placement = { source: 'visual-reference-pixels', scope: exactFrame.source, frame: { ...bbox } }
		const v = choreoValidate(slideChoreographyIR(P, g.animId, g.intent, bbox, !!P.travelPath, irCtx))
		entry.valid = v.ok
		if (!v.ok) entry.violations = v.errors.map(e => e.code)
		if (P.travelPath && v.ok) entry.travelIn = choreoPredict(slideChoreographyIR(P, g.animId, g.intent, bbox, true, irCtx)).netTravelIn
		// report the paired content effect (the gesture's OBJECT), so the AI sees the full choreography.
		if (P.pairContent && CONTENT_PAIRING[g.intent]) {
			const target = pickPairTarget(spec.slides[i].content)
			if (target) {
				const d = pairingDelayMs(P, g.animId, g.intent)
				entry.paired = { targetKind: String(target.kind || '').toLowerCase(), effect: CONTENT_PAIRING[g.intent].effect, type: CONTENT_PAIRING[g.intent].type, atMs: d.ms, contactSource: d.source }
			}
		}
		perSlide.push(entry)
		appearIdx++
	}
	return {
		persona: P.persona || null,
		choreography: P.choreography,
		stage: P.stage,
		stageTreatment: { ...P.stageTreatment },
		composedThroughEngine: true, // every appearance is validated by the choreography engine before injection
		travelPath: P.travelPath || null,
		pairContent: !!P.pairContent,
		dialect: { energy: P.dialect?.energy, amplitude: P.dialect?.amplitude, tempo: P.dialect?.tempo, bias: P.dialect?.bias || {} },
		perSlide,
	}
}
