// ir/decisions.mjs — E2: the canonical ACTIONABLE decision/refusal contract (roadmap §1 legibility
// test #3). Every planner verdict the AI reads carries {code, severity, reason, fix, evidence}:
//   code     — stable machine slug
//   severity — 'error' (the beat is dropped) | 'warning' (kept, degraded) | 'info' (kept, note)
//   reason   — one human sentence: what happened
//   fix      — one human sentence: the concrete author action that resolves it
//   evidence — the machine facts (residual, bbox, ids…) that justify the verdict
// The synergy stack emits raw {code, msg} verdicts at many sites; rather than edit every site,
// this module NORMALIZES them at the plan boundary against a registry, so a bare string can never
// reach the AI surface and every code has a fix. An unregistered code is surfaced loudly (its own
// UNREGISTERED_DECISION_CODE), never silently dropped.

// severity + fix per code. reason falls back to the raw msg when present (it is already specific).
export const DECISION_REGISTRY = Object.freeze({
	// ── synergy interaction solver (AI-facing plan) ──
	FRAME_CLAMPED:               { severity: 'warning', fix: 'give the target more room from the slide edge, or accept the small placement shift.' },
	UNREACHABLE:                 { severity: 'warning', fix: 'move the target within the actor\'s reach envelope, or pick a nearer target / smaller window.' },
	OCCLUDES_CONTENT:            { severity: 'warning', fix: 'move the target off the presenter\'s body, or stage the actor to the side.' },
	INTERACTION_NO_ACTOR:        { severity: 'error',   fix: 'add the actor to presenters.cast (or set a top-level presenter with a model handle).' },
	INTERACTION_NO_TARGET:       { severity: 'error',   fix: 'name an existing object on the slide as the target (or let preliminary layout place it).' },
	INTERACTION_NO_TIMELINES:    { severity: 'error',   fix: 'oracle-measure this actor first (tools/render-oracle) so it carries empirical clip timelines.' },
	INTERACTION_TARGET_AUTHORED: { severity: 'info',    fix: 'remove the target\'s authored animation to let the interaction drive it, or keep both intentionally.' },
	INTERACTION_UNKNOWN_VERB:    { severity: 'error',   fix: 'use one of: touch, point-at, press, carry, push, knock-over.' },
	INTERACTION_UNSOLVED:        { severity: 'warning', fix: 'choose a reachable target or a different verb; the actor\'s clips had no usable contact for this one.' },
	INTERACTION_UNSUPPORTED_YAW: { severity: 'error',   fix: 'set faceRotationY to 0 for the calibrated front-facing roster basis, or provide a separately measured asset yaw.' },
	INTERACTION_UNSUPPORTED_VERB: { severity: 'error', fix: 'use a supported interaction verb such as touch, point-at, press, carry, push, or knock-over.' },
	INTERACTION_ACTOR_REQUIRED: { severity: 'error', fix: 'provide a stable actor id that resolves to a presenter model.' },
	INTERACTION_TARGET_NAME_REQUIRED: { severity: 'error', fix: 'provide a stable target objectName/name instead of an index or coordinate.' },
	INTERACTION_PLAN_REQUIRED: { severity: 'error', fix: 'run the interaction compiler so the slide receives a generated _synergyPlan.' },
	INTERACTION_PLAN_MISSING_BEAT: { severity: 'error', fix: 'keep each authored interaction aligned with a solved _synergyPlan beat, or remove the stale interaction.' },
	INTERACTION_PLAN_UNSOLVED: { severity: 'warning', fix: 'provide empirical clip timelines and a reachable target, then rerun the interaction compiler.' },
	// ── choreography validator (mostly internal, some AI-facing) ──
	MULTI_3D_SCENE:              { severity: 'error',   fix: 'use a second model instance for the overlapping beat, or sequence the beats (afterPrevious).' },
	MULTI_3D_CLIP:               { severity: 'error',   fix: 'one 3D-scene clip per model instance — split into separate instances.' },
	CLIP_CEILING:               { severity: 'error',   fix: 'trim the actor\'s clip set to <=18 (the measured PowerPoint ceiling).' },
	CONTENT_ZONE:               { severity: 'warning', fix: 'move the presenter to its stage zone so it does not overlap the content region.' },
	OFFSLIDE:                   { severity: 'error',   fix: 'bring the object on-slide (its placement left the slide bounds).' },
	COLLIDE:                    { severity: 'warning', fix: 'separate the two objects in space or time so they do not read as a clash.' },
	OVERRUN:                    { severity: 'info',    fix: 'extend the slide dwell or shorten the clip if the truncation is visible.' },
	CONTACT_SYNC:               { severity: 'warning', fix: 'align the paired effect delay to the measured contact time.' },
	BAD_TIMING:                 { severity: 'error',   fix: 'use duration/delay in milliseconds (never *Ms keys).' },
	BAD_MOTION_PATH:            { severity: 'error',   fix: 'use a registry preset motion path or a validated custom pathData.' },
	BAD_TYPE:                   { severity: 'error',   fix: 'use a supported animation type for this object.' },
	EFFECT_CATEGORY:            { severity: 'error',   fix: 'use an effect from the correct category (entrance/emphasis/exit/motion).' },
	DOUBLE_MOVE:                { severity: 'warning', fix: 'apply a single motion path per instance per slide.' },
	UNKNOWN_EFFECT:             { severity: 'error',   fix: 'use a known effect name from the animation registry.' },
	// ── timeline-ir (already actionable; registered so the validator accepts them) ──
	BUDGET_OVERRUN:             { severity: 'warning', fix: 'shorten/re-time the track, or extend narration (text is the master clock).' },
})

export const VALID_SEVERITIES = new Set(['error', 'warning', 'info'])

// Normalize ONE raw verdict ({code, msg?, ...evidence}) into the canonical shape.
export function normalizeDecision(raw = {}) {
	const code = String(raw.code || 'UNSPECIFIED')
	const reg = DECISION_REGISTRY[code]
	const { code: _c, msg, reason, fix, severity, evidence, ...rest } = raw
	if (!reg) {
		return {
			code: 'UNREGISTERED_DECISION_CODE', severity: 'warning',
			reason: `a planner emitted an unregistered decision code "${code}"${msg ? `: ${msg}` : ''}.`,
			fix: 'register this code in ir/decisions.mjs with a severity and fix so the AI gets an actionable refusal.',
			evidence: { originalCode: code, ...(Object.keys(rest).length ? rest : {}) },
		}
	}
	return {
		code,
		severity: severity && VALID_SEVERITIES.has(severity) ? severity : reg.severity,
		reason: reason || msg || `${code}.`,
		fix: fix || reg.fix,
		// The public decision contract always carries an evidence object, even when
		// the planner has no additional measurements. Keeping the empty object
		// explicit prevents downstream consumers from having to guess whether the
		// decision was normalized or merely happened to contain extra fields.
		evidence: evidence || rest,
	}
}

export function normalizeDecisions(list) {
	return Array.isArray(list) ? list.map(normalizeDecision) : []
}

// Assert a verdict list is fully actionable (used by tests and, optionally, a strict compile mode).
export function assertActionable(list) {
	const issues = []
	for (const d of Array.isArray(list) ? list : []) {
		if (!d || typeof d !== 'object') { issues.push('non-object verdict'); continue }
		if (!d.code) issues.push('missing code')
		if (!VALID_SEVERITIES.has(d.severity)) issues.push(`bad severity on ${d.code}`)
		if (!d.reason || typeof d.reason !== 'string') issues.push(`missing reason on ${d.code}`)
		if (!d.fix || typeof d.fix !== 'string') issues.push(`missing fix on ${d.code}`)
	}
	return { ok: issues.length === 0, issues }
}
