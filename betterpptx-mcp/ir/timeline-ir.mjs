// TIMELINE IR — the shared per-slide track model of the A2a compiler contract (roadmap §2.6):
// narration is the MASTER CLOCK; gestures, interactions, scenes, object effects, audio, and
// transitions are TRACKS on it. Every planner decision uses the canonical actionable shape
// {code, severity, reason, fix, evidence}. This module is pure data + validation + the wire
// adapter; it owns the two traps that ship broken decks when violated:
//   T8 — the animation builder reads `duration`/`delay` (ms); `*Ms` keys are silently ignored.
//   T9 — the builder reads `pathData`/`path` for custom motion paths; `motionPathData` alone
//        ships the default path. wireCue() emits BOTH keys for custom paths.
// Measured-law hooks: L6 (one 3D-scene clip per model instance; scenes = multiple instances)
// and the 18-clip ceiling are validated here so every lowering path shares one enforcement.

export const TRACK_KINDS = new Set(['narration', 'gesture', 'interaction', 'effect', 'travel', 'audio', 'transition'])
export const CLIP_CEILING = 18 // L6 (measured 2026-07-10): animId ≥ 18 is silently static

// ── The master clock ─────────────────────────────────────────────────────────────────────
// The ONLY place a slide dwell budget may come from (replaces fixed 5000/4000 ms constants).
// Priority: authored timing.expectedDurationMs → materialized durationMs → segment sum →
// text estimate (Piper ≈ 150 wpm ⇒ ~400 ms/word) → floor. Text is the master clock: visuals
// adapt to narration, never the reverse.
export function narrationBudgetMs(slide, { floorMs = 5000, capMs = 45000, msPerWord = 400, paddingMs = 600 } = {}) {
	const n = slide && typeof slide === 'object' ? slide.narration : null
	const clamp = v => Math.max(floorMs, Math.min(capMs, Math.round(v)))
	if (!n || typeof n !== 'object') return floorMs
	const authored = Number(n.timing?.expectedDurationMs)
	if (Number.isFinite(authored) && authored > 0) return clamp(authored + (Number(n.timing?.paddingMs) || 0))
	const measured = Number(n.durationMs ?? n.measuredDurationMs)
	if (Number.isFinite(measured) && measured > 0) return clamp(measured + paddingMs)
	if (Array.isArray(n.segments) && n.segments.length) {
		let total = 0
		for (const seg of n.segments) {
			const segMs = Number(seg?.durationMs)
			total += Number.isFinite(segMs) && segMs > 0 ? segMs : wordEstimateMs(seg?.text, msPerWord)
			total += Number(seg?.gapMs) || 0
		}
		if (total > 0) return clamp(total + paddingMs)
	}
	const est = wordEstimateMs(n.text, msPerWord)
	return est > 0 ? clamp(est + paddingMs) : floorMs
}
function wordEstimateMs(text, msPerWord) {
	const words = String(text || '').trim().split(/\s+/).filter(Boolean).length
	return words * msPerWord
}

// ── Timeline construction ────────────────────────────────────────────────────────────────
export function createTimeline({ slideId = null, slideIndex = null, slideW = 13.333, slideH = 7.5, budgetMs = 5000 } = {}) {
	return { slideId, slideIndex, slideW, slideH, budgetMs, tracks: [], decisions: [] }
}

export function addTrack(tl, { kind, actor = null, name = null, startMs = 0, durationMs = 0, animId = null, payload = null } = {}) {
	if (!TRACK_KINDS.has(kind)) throw new Error(`timeline-ir: unknown track kind "${kind}" (valid: ${[...TRACK_KINDS].join(', ')})`)
	const track = {
		kind, actor, name,
		startMs: Math.max(0, Math.round(Number(startMs) || 0)),
		durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
		...(animId != null ? { animId: Number(animId) } : {}),
		payload: payload || {},
	}
	tl.tracks.push(track)
	return track
}

// The canonical decision shape (§1 legibility): every degradation/refusal is actionable.
export function decision(tl, { code, severity = 'warning', reason = '', fix = '', evidence = null } = {}) {
	const d = { code: String(code || 'UNSPECIFIED'), severity, reason, fix, ...(evidence ? { evidence } : {}) }
	tl.decisions.push(d)
	return d
}

// ── Validation (shared enforcement of the measured laws + budget) ───────────────────────
export function validateTimeline(tl, { clipCeiling = CLIP_CEILING } = {}) {
	const startCount = tl.decisions.length
	const threeD = tl.tracks.filter(t => (t.kind === 'gesture' || t.kind === 'interaction') && t.actor)
	// L6: ONE 3D-scene clip per model instance — overlapping scene tracks on the SAME actor
	// instance go silently static in PowerPoint. Scenes need multiple instances instead.
	for (let i = 0; i < threeD.length; i++) {
		for (let j = i + 1; j < threeD.length; j++) {
			const a = threeD[i], b = threeD[j]
			if (a.actor !== b.actor) continue
			const aEnd = a.startMs + (a.durationMs || 0), bEnd = b.startMs + (b.durationMs || 0)
			if (a.startMs < bEnd && b.startMs < aEnd) {
				decision(tl, {
					code: 'MULTI_3D_SCENE', severity: 'error',
					reason: `two 3D-scene tracks overlap on actor "${a.actor}" (${a.name || a.kind} vs ${b.name || b.kind}) — PowerPoint plays one clip per model instance (L6); the second goes silently static`,
					fix: 'use a second model INSTANCE for the overlapping beat, or sequence the beats (afterPrevious)',
					evidence: { a: { name: a.name, startMs: a.startMs, durationMs: a.durationMs }, b: { name: b.name, startMs: b.startMs, durationMs: b.durationMs } },
				})
			}
		}
	}
	// 18-clip ceiling per actor (L6): animId ≥ 18 or >18 distinct clips referenced.
	const byActor = new Map()
	for (const t of threeD) {
		if (t.animId == null) continue
		if (!byActor.has(t.actor)) byActor.set(t.actor, new Set())
		byActor.get(t.actor).add(t.animId)
		if (t.animId >= clipCeiling) {
			decision(tl, {
				code: 'CLIP_CEILING', severity: 'error',
				reason: `track "${t.name || t.kind}" references animId ${t.animId} ≥ ${clipCeiling} — PowerPoint silently never plays it (measured ceiling)`,
				fix: `rebake/transplant so the needed clip sits at animId < ${clipCeiling}`,
				evidence: { actor: t.actor, animId: t.animId },
			})
		}
	}
	for (const [actor, ids] of byActor) {
		if (ids.size > clipCeiling) {
			decision(tl, {
				code: 'CLIP_CEILING', severity: 'error',
				reason: `actor "${actor}" references ${ids.size} distinct clips — over the ${clipCeiling}-clip ceiling`,
				fix: `trim the clip set for this actor to ≤ ${clipCeiling}`,
				evidence: { actor, distinctClips: ids.size },
			})
		}
	}
	// Master-clock budget: tracks that end after the narration budget (F5a semantics: warning).
	for (const t of tl.tracks) {
		const end = t.startMs + (t.durationMs || 0)
		if (end > tl.budgetMs) {
			decision(tl, {
				code: 'BUDGET_OVERRUN', severity: 'warning',
				reason: `track "${t.name || t.kind}" ends at ${end} ms, past the slide's narration budget ${tl.budgetMs} ms`,
				fix: 'shorten/re-time the track, or extend narration (text is the master clock)',
				evidence: { endMs: end, budgetMs: tl.budgetMs },
			})
		}
	}
	return { ok: !tl.decisions.slice(startCount).some(d => d.severity === 'error'), added: tl.decisions.slice(startCount) }
}

// ── Wire adapter (the ONLY sanctioned cue emitter) ───────────────────────────────────────
// Emits engine wire-format animation objects. Guards T8 (duration/delay keys in ms — throws on
// *Ms keys so the mistake can never ship silently again) and T9 (custom paths carry BOTH
// pathData — what dist/node/gen-animations-builder.js reads — and motionPathData for
// compatibility with older readers).
export function wireCue(track, { trigger = 'withPrevious' } = {}) {
	const p = track.payload || {}
	if ('durationMs' in p || 'delayMs' in p) {
		throw new Error('timeline-ir: payload uses *Ms timing keys — the engine wire format reads `duration`/`delay` (already in ms); *Ms keys are silently ignored (T8)')
	}
	const base = {
		trigger: p.trigger || trigger,
		...(track.startMs ? { delay: track.startMs } : {}),
		...(track.durationMs ? { duration: track.durationMs } : {}),
	}
	if (p.pathData || p.path) {
		const path = String(p.pathData || p.path)
		return { type: 'motion', ...base, pathData: path, motionPathData: path, ...stripKeys(p, ['pathData', 'path', 'motionPathData', 'trigger']) }
	}
	return { ...base, ...stripKeys(p, ['trigger']) }
}
function stripKeys(obj, keys) {
	const out = { ...obj }
	for (const k of keys) delete out[k]
	return out
}
