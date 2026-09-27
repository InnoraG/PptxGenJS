// CHOREOGRAPHY ENGINE — a deterministic, calculation-based model of presenter choreography.
//
// WHY: the co-fire proof (research-demos/2026-07-12-presenter-cofire) established the MECHANISM by RENDERING
// through PowerPoint COM. Rendering is the ground-truth oracle, but it is slow and its measurements are noisy
// (a walk cycle wobbles the measured centroid). This module is the opposite tool: it PREDICTS what PowerPoint
// will do from the numbers, VALIDATES that a choreography cannot fail, and COMPILES it to exact tool calls —
// so authoring is deterministic and COM becomes an occasional confirmation, not a per-iteration crutch.
//
// A Choreography is a small IR (below). Everything here is a PURE function of it — safe to unit-test, no I/O,
// no engine import. The unit is INCHES for geometry and MILLISECONDS for time (author-facing). The compiler
// converts to the engine's wire format (slide-fraction motion-path strings + `duration`/`delay` keys).
//
//   Choreography = {
//     slide:     { w, h, durationMs },
//     presenter: { name, animId, clip, inPlace, contactMs?, bbox:{x,y,w,h},
//                  motion?: { path?: 'right'|…, waypoints?: [{dxIn,dyIn}], startMs, durationMs } },
//     content:   [ { name, bbox:{x,y,w,h},
//                    cue: { type:'entrance'|'exit'|'emphasis'|'motion', effect?, path?, waypoints?,
//                           trigger:'withPrevious'|'afterPrevious'|'onClick', delayMs, durationMs } } ],
//   }

// ----- vocabulary (mirrors engine.mjs guards so we catch a bad effect BEFORE it silently coerces) -----
export const CLIP_CEILING = 18 // PowerPoint plays embedded animId 0..17 (measured). animId must be < 18.

// Named motion paths → linear displacement as a FRACTION of slide {w,h}, plus a conservative excursion
// ENVELOPE (max |offset| along each axis over the whole path) for on-slide checking. 'right' = +0.25w was
// verified from the rendered OOXML (M 0 0 L 0.25 0 E). Curved presets carry an envelope but no net vector.
const PATHS = {
	right: { dx: 0.25, dy: 0, env: [0.25, 0] }, left: { dx: -0.25, dy: 0, env: [0.25, 0] },
	up: { dx: 0, dy: -0.25, env: [0, 0.25] }, down: { dx: 0, dy: 0.25, env: [0, 0.25] },
	diagonaldownright: { dx: 0.25, dy: 0.25, env: [0.25, 0.25] }, diagonalupright: { dx: 0.25, dy: -0.25, env: [0.25, 0.25] },
	arcdown: { dx: 0.25, dy: 0, env: [0.25, 0.18] }, arcup: { dx: 0.25, dy: 0, env: [0.25, 0.18] },
	arcleft: { dx: 0, dy: 0.25, env: [0.18, 0.25] }, arcright: { dx: 0, dy: 0.25, env: [0.18, 0.25] },
	bounceright: { dx: 0.25, dy: 0, env: [0.25, 0.15] }, bounceleft: { dx: -0.25, dy: 0, env: [0.25, 0.15] },
	// curved/looping presets: no net translation, but they excursion in a box (conservative ±0.25).
	circlepath: { dx: 0, dy: 0, env: [0.25, 0.25] }, spiralleft: { dx: 0, dy: 0, env: [0.25, 0.25] },
	spiralright: { dx: 0, dy: 0, env: [0.25, 0.25] }, verticalfigure8: { dx: 0, dy: 0, env: [0.15, 0.25] },
	loopdeloop: { dx: 0, dy: 0, env: [0.25, 0.25] }, wavepath: { dx: 0.25, dy: 0, env: [0.25, 0.12] },
}
// The full valid preset set (typo guard). Anything here is renderable; only the ones in PATHS have geometry.
const VALID_PATHS = new Set([...Object.keys(PATHS),
	'righttriangle', 'diamondpath', 'hexagon', '5pointstar', 'crescentmoon', 'squarepath', 'trapezoid', 'heart',
	'octagon', '6pointstar', 'football', 'equaltriangle', 'parallelogram', 'pentagon', '4pointstar', '8pointstar',
	'teardrop', 'pointystar', 'curvedsquare', 'curvedx', 'curvystar', 'buzzsaw', 'horizontalfigure8', 'peanut',
	'figure8four', 'neutron', 'swoosh', 'bean', 'pluspath', 'invertedtriangle', 'invertedsquare', 'turnright',
	'zigzag', 'scurve2', 'sinewave', 'turnup', 'heartbeat', 'curvyleft', 'diagonaldownright', 'turndown', 'funnel',
	'spring', 'turnupright', 'scurve1', 'decayingwave', 'curvyright', 'stairsdown'])

const VALID_EMPHASIS = new Set(['growshrink', 'spin', 'pulse', 'teeter', 'colorwave', 'transparency', 'verticalgrow',
	'wave', 'boldflash', 'flicker', 'lighten', 'darken', 'desaturate', 'shimmer', 'turntable', 'swing', 'jumpandturn'])
// entrance/exit share PowerPoint's broad registry; guard only the frequent, category-flexible ones.
const COMMON_INOUT = new Set(['fade', 'fly', 'wipe', 'zoom', 'float', 'split', 'appear', 'dissolve', 'grow', 'swivel',
	'bounce', 'shape', 'checkerboard', 'blinds', 'randombars', 'circle', 'plus', 'diamond', 'wedge', 'wheel', 'peek'])
const VALID_3D_EMPH = new Set(['turntable', 'swing', 'jumpandturn'])

const clamp01 = v => Math.max(0, Math.min(1, v))
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const lc = s => String(s || '').toLowerCase().replace(/[\s-]+/g, '')

// Displacement + excursion envelope of a cue's motion, in INCHES. waypoints (explicit inch offsets from start)
// are exact; named presets use the fraction table. Returns { dx, dy, envX, envY } where env = max |offset|.
export function motionVector(m, slide) {
	if (!m) return { dx: 0, dy: 0, envX: 0, envY: 0 }
	if (Array.isArray(m.waypoints) && m.waypoints.length) {
		let dx = 0, dy = 0, envX = 0, envY = 0
		for (const p of m.waypoints) {
			dx = p.dxIn || 0; dy = p.dyIn || 0
			envX = Math.max(envX, Math.abs(dx)); envY = Math.max(envY, Math.abs(dy))
		}
		return { dx, dy, envX, envY } // dx/dy = LAST waypoint (net); env = furthest excursion
	}
	const p = PATHS[lc(m.path)]
	if (!p) return { dx: 0, dy: 0, envX: 0.25 * slide.w, envY: 0.25 * slide.h } // unknown-but-valid preset: conservative box
	return { dx: p.dx * slide.w, dy: p.dy * slide.h, envX: p.env[0] * slide.w, envY: p.env[1] * slide.h }
}

// ----- timeline: resolve triggers to absolute [startMs, endMs] for every track -----
// Model: tracks in author order. A group starts at 0 (first) or at the previous group's start.
//   withPrevious → same start as the current group anchor;  afterPrevious → starts at previous track's END;
//   onClick → starts a NEW group at the previous track's END (we time clicks as immediate advance).
// delayMs shifts start; durationMs sets length. This mirrors PowerPoint's main-sequence bucketing.
export function resolveTimeline(choreo) {
	const tracks = []
	// track 0 = presenter clip (+ its motion rides the same start)
	const P = choreo.presenter
	tracks.push({ name: P.name, kind: 'presenter', trigger: 'withPrevious',
		delayMs: (P.motion && P.motion.startMs) || 0, durationMs: (P.motion && P.motion.durationMs) || 2000 })
	for (const c of (choreo.content || [])) tracks.push({ name: c.name, kind: 'content', trigger: c.cue.trigger,
		delayMs: c.cue.delayMs || 0, durationMs: c.cue.durationMs || 500 })

	let groupAnchor = 0, prevEnd = 0
	for (let i = 0; i < tracks.length; i++) {
		const t = tracks[i]
		let start
		if (i === 0) { start = 0; groupAnchor = 0 }
		else if (t.trigger === 'withPrevious') start = groupAnchor
		else if (t.trigger === 'afterPrevious') { start = prevEnd; groupAnchor = prevEnd }
		else { start = prevEnd; groupAnchor = prevEnd } // onClick
		t.startMs = start + t.delayMs
		t.endMs = t.startMs + t.durationMs
		prevEnd = t.endMs
	}
	return tracks
}

// eased progress (PP default motion paths ease in/out ~50%) at absolute time t for a [start,end] track.
function progress(t, start, end) {
	if (t <= start) return 0
	if (t >= end) return 1
	const x = (t - start) / Math.max(1, end - start)
	return x * x * (3 - 2 * x) // smoothstep ≈ accel/decel 50%
}

// Presenter bbox (inches) at absolute time tMs — origin bbox translated along its motion by eased progress.
export function presenterBBoxAt(choreo, tMs, timeline) {
	const P = choreo.presenter, b = P.bbox
	const tl = (timeline || resolveTimeline(choreo)).find(t => t.kind === 'presenter')
	const v = motionVector(P.motion, choreo.slide)
	const g = progress(tMs, tl.startMs, tl.endMs)
	return { x: b.x + v.dx * g, y: b.y + v.dy * g, w: b.w, h: b.h }
}

// ----- prediction: sampled trajectory to assert a render against (calculation-based confirmation) -----
export function predict(choreo, nSamples = 24) {
	const tl = resolveTimeline(choreo)
	const T = choreo.slide.durationMs
	const out = []
	for (let s = 0; s < nSamples; s++) {
		const t = Math.round((s / (nSamples - 1)) * T)
		const pb = presenterBBoxAt(choreo, t, tl)
		const active = {}
		for (const c of (choreo.content || [])) {
			const ct = tl.find(x => x.name === c.name)
			active[c.name] = t >= ct.startMs && t <= ct.endMs
		}
		out.push({ tMs: t, presenter: { cx: round2(pb.x + pb.w / 2), cy: round2(pb.y + pb.h / 2) }, active })
	}
	// net presenter travel (what a render's centroid should reflect, minus walk-cycle noise)
	const first = out[0].presenter, last = out[out.length - 1].presenter
	return { samples: out, netTravelIn: { dx: round2(last.cx - first.cx), dy: round2(last.cy - first.cy) }, timeline: tl }
}

const round2 = n => Math.round(n * 100) / 100
const onSlide = (bb, slide, pad = 0) => bb.x >= -pad && bb.y >= -pad && bb.x + bb.w <= slide.w + pad && bb.y + bb.h <= slide.h + pad
function bboxOverlap(a, b) {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

// ----- validation: the "play without fail" gate. Returns { ok, errors[], warnings[] }. -----
export function validate(choreo) {
	const errors = [], warnings = [], slide = choreo.slide, P = choreo.presenter

	// 1. clip ceiling
	if (!isNum(P.animId) || P.animId < 0 || P.animId >= CLIP_CEILING)
		errors.push({ code: 'CLIP_CEILING', at: P.name, msg: `animId ${P.animId} out of 0..${CLIP_CEILING - 1} (PowerPoint plays no more)` })

	// 1b. ONE 3D-scene animation per model (MEASURED 2026-07-12 composition test): PowerPoint plays only a
	// SINGLE 3D-scene animation per model. Chaining clips (greet→point→clap) or layering a 3D emphasis verb
	// (turntable/swing/jumpAndTurn) on top of the playScene clip makes the model render STATIC. A 2D motion
	// path is FINE on top (it transforms the graphic frame, not the scene — that's the co-fire). So: one
	// gesture per slide; sequence gestures across slides via Morph, or use separate models.
	if (Array.isArray(P.beats) && P.beats.length > 1)
		errors.push({ code: 'MULTI_3D_CLIP', at: P.name, msg: `${P.beats.length} clips on one model — PP plays only ONE per slide (the rest go static). One gesture per slide; Morph across slides for a sequence.` })
	if (P.emphasis3d)
		errors.push({ code: 'MULTI_3D_SCENE', at: P.name, msg: `a 3D emphasis verb (${P.emphasis3d}) alongside the playScene clip makes the model STATIC — only one 3D-scene animation per model. A 2D motion path is OK on top.` })

	// 2. presenter motion validity + on-slide over its whole excursion
	if (P.motion) {
		if (P.motion.path && !P.motion.waypoints && !VALID_PATHS.has(lc(P.motion.path)))
			errors.push({ code: 'BAD_MOTION_PATH', at: P.name, msg: `motion path "${P.motion.path}" is not a valid PowerPoint preset` })
		const v = motionVector(P.motion, slide)
		const far = { x: P.bbox.x + Math.sign(v.dx || 1) * v.envX, y: P.bbox.y + Math.sign(v.dy || 1) * v.envY, w: P.bbox.w, h: P.bbox.h }
		const end = { x: P.bbox.x + v.dx, y: P.bbox.y + v.dy, w: P.bbox.w, h: P.bbox.h }
		if (!onSlide(P.bbox, slide) || !onSlide(end, slide) || !onSlide(far, slide))
			errors.push({ code: 'OFFSLIDE', at: P.name, msg: `presenter leaves the slide traveling ${P.motion.path || 'waypoints'} (end x=${round2(end.x)}, right edge=${round2(end.x + end.w)} vs slide w=${slide.w})` })
	}
	// in-place clip with no motion is fine, but a NON-in-place clip that ALSO has a big path may double-move.
	if (P.motion && P.inPlace === false && (P.motion.path || P.motion.waypoints))
		warnings.push({ code: 'DOUBLE_MOVE', at: P.name, msg: `clip "${P.clip}" carries root motion (inPlace:false) AND a motion path — the travel will compound; use a short/no path.` })

	// PLACEMENT INTELLIGENCE — the presenter must stay inside its stage zone so it never overlaps the content it
	// cues. slide.presenterZone={x0,x1} reserves the opposite region for content; the presenter's box AND the full
	// span of its travel must fit inside the zone. The director clamps travel to satisfy this; this is the gate.
	if (slide.presenterZone) {
		const v = P.motion ? motionVector(P.motion, slide) : { dx: 0, dy: 0 }
		const minX = P.bbox.x + Math.min(0, v.dx)
		const maxX = P.bbox.x + P.bbox.w + Math.max(0, v.dx)
		const z = slide.presenterZone
		if (minX < z.x0 - 0.02 || maxX > z.x1 + 0.02)
			warnings.push({ code: 'CONTENT_ZONE', at: P.name, msg: `presenter spans x ${round2(minX)}..${round2(maxX)} but its stage zone is [${z.x0}, ${z.x1}] — it would intrude on the content region; clamp travel.` })
	}

	// 3. content cues: category + geometry + timing
	const tl = resolveTimeline(choreo)
	for (const c of (choreo.content || [])) {
		const cue = c.cue, type = lc(cue.type)
		if (!['entrance', 'exit', 'emphasis', 'motion'].includes(type))
			errors.push({ code: 'BAD_TYPE', at: c.name, msg: `cue.type "${cue.type}" invalid` })
		if (type === 'emphasis') {
			const e = lc(cue.effect)
			if (e && !VALID_EMPHASIS.has(e)) errors.push({ code: 'EFFECT_CATEGORY', at: c.name, msg: `"${cue.effect}" is not an emphasis effect (would coerce to pulse). Use one of: growShrink, spin, pulse, teeter, colorWave…` })
		} else if (type === 'motion') {
			if (cue.path && !cue.waypoints && !VALID_PATHS.has(lc(cue.path)))
				errors.push({ code: 'BAD_MOTION_PATH', at: c.name, msg: `motion path "${cue.path}" invalid` })
			const v = motionVector(cue, slide)
			const end = { x: c.bbox.x + v.dx, y: c.bbox.y + v.dy, w: c.bbox.w, h: c.bbox.h }
			if (!onSlide(end, slide, 0.01)) warnings.push({ code: 'OFFSLIDE', at: c.name, msg: `"${c.name}" travels partly off-slide (fine for an intentional exit, else check).` })
		} else { // entrance/exit
			const e = lc(cue.effect)
			if (e && !COMMON_INOUT.has(e) && !VALID_EMPHASIS.has(e)) warnings.push({ code: 'UNKNOWN_EFFECT', at: c.name, msg: `"${cue.effect}" is not a common ${type} effect; verify it exists or it will coerce to fade.` })
			if (VALID_3D_EMPH.has(e)) errors.push({ code: 'EFFECT_CATEGORY', at: c.name, msg: `"${cue.effect}" is a 3D-model emphasis verb, not a ${type} effect for a 2D shape.` })
		}
		// timing must be ms numbers (guards the durationMs/delayMs key gotcha at the IR boundary)
		if (cue.delayMs != null && !isNum(cue.delayMs)) errors.push({ code: 'BAD_TIMING', at: c.name, msg: `delayMs must be a number (ms)` })
		if (cue.durationMs != null && !isNum(cue.durationMs)) errors.push({ code: 'BAD_TIMING', at: c.name, msg: `durationMs must be a number (ms)` })
	}

	// 4. contact-frame sync: a "caused" content effect (withPrevious on the presenter's group) should fire at
	//    the clip's contact moment, not slide start. Warn when a withPrevious cue's start misses contactMs.
	if (isNum(P.contactMs)) {
		const pStart = tl.find(t => t.kind === 'presenter').startMs
		for (const c of (choreo.content || [])) {
			if (lc(c.cue.trigger) !== 'withprevious') continue
			const ct = tl.find(t => t.name === c.name)
			const want = pStart + P.contactMs
			if (Math.abs(ct.startMs - want) > 120)
				warnings.push({ code: 'CONTACT_SYNC', at: c.name, msg: `fires at ${ct.startMs}ms but the clip's contact is ${want}ms — set delayMs≈${P.contactMs} so it reads as caused.` })
		}
	}

	// 5. clip runs past the slide (it keeps looping/holding but the slide advances) — informational
	for (const t of tl) if (t.endMs > slide.durationMs + 1)
		warnings.push({ code: 'OVERRUN', at: t.name, msg: `ends at ${t.endMs}ms > slide ${slide.durationMs}ms (truncated by slide advance).` })

	// 6. content overlap during a shared active window (visual collision)
	const items = (choreo.content || [])
	for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
		const a = items[i], b = items[j], ta = tl.find(t => t.name === a.name), tb = tl.find(t => t.name === b.name)
		const overlapTime = ta.startMs < tb.endMs && tb.startMs < ta.endMs
		if (overlapTime && bboxOverlap(a.bbox, b.bbox))
			warnings.push({ code: 'COLLIDE', at: `${a.name}+${b.name}`, msg: `overlap in space and time — may read as a clash.` })
	}

	return { ok: errors.length === 0, errors, warnings }
}

// ----- compile: deterministic authoring output = exact tool-call args (correct keys!) -----
// Emits { model3d, cues } where model3d feeds slide.add_model3d(options) and each cue feeds
// slide.animate_shapes({ names, animation }). Motion paths become an explicit motionPathData string so the
// geometry is exact and matches what we validated. NOTE the keys are `duration`/`delay` (ms) — NOT *Ms —
// because the engine's animation reader ignores *Ms and defaults them to 500 (engine.mjs ~15269).
export function compile(choreo) {
	const P = choreo.presenter, slide = choreo.slide
	const model3d = {
		objectName: P.name, scene: { animId: P.animId, loop: !!(P.motion) || P.loop === true },
		bbox: { ...P.bbox },
		// The playScene clip plays for its OWN measured length (clipDurationMs) so the gesture apex is reached —
		// NOT the travel/motion duration (they are independent: the path transforms the frame while the clip plays
		// its full arc). Falls back to 2000ms only when the clip length is unmeasured.
		animation: { type: 'emphasis', effect: 'playScene', animId: P.animId,
			trigger: 'withPrevious', delay: 0, duration: P.clipDurationMs || (P.motion && P.motion.durationMs) || 2000 },
	}
	const cues = []
	if (P.motion) cues.push({ names: [P.name], animation: { type: 'motion', trigger: 'withPrevious',
		delay: P.motion.startMs || 0, duration: P.motion.durationMs || 1000, ...pathProps(P.motion, slide) } })
	for (const c of (choreo.content || [])) {
		const cue = c.cue, type = lc(cue.type)
		const a = { type, trigger: cue.trigger, delay: cue.delayMs || 0, duration: cue.durationMs || 500 }
		if (type === 'motion') Object.assign(a, pathProps(cue, slide))
		else { a.effect = cue.effect; if (cue.direction) a.direction = cue.direction }
		cues.push({ names: [c.name], animation: a })
	}
	return { model3d, cues }
}

// motion → engine wire props: waypoints become an EXACT custom-path string (slide-fraction, e.g.
// "M 0 0 L 0.25 0 E"); named presets pass motionPath through. T9 (fixed 2026-07-14): the animation
// BUILDER reads `pathData`/`path` (dist/node/gen-animations-builder.js:489) — a motionPathData-only
// cue silently ships the DEFAULT path. Emit BOTH keys: pathData is what compiles; motionPathData
// stays as the compatibility alias older readers inspect.
function pathProps(m, slide) {
	if (Array.isArray(m.waypoints) && m.waypoints.length) {
		const seg = m.waypoints.map(p => `L ${round4((p.dxIn || 0) / slide.w)} ${round4((p.dyIn || 0) / slide.h)}`).join(' ')
		const path = `M 0 0 ${seg} E`
		return { pathData: path, motionPathData: path }
	}
	return { motionPath: lc(m.path) || 'right' }
}
const round4 = n => Math.round(n * 10000) / 10000

// One-call convenience: validate, and only compile if it can't fail.
export function author(choreo) {
	const v = validate(choreo)
	return { ...v, prediction: predict(choreo), compiled: v.ok ? compile(choreo) : null }
}
