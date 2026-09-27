// Product-level presenter contract shared by native 3D, talking-head video,
// and safe fallback planning. This module is deliberately provider-neutral: it
// carries identity, consent, provenance, and representation policy without
// exposing worker/model implementation details.

import { MOTION_POLICIES, motionPolicyResolutionForSpec } from './motion-policy.mjs'

const MODES = new Set(['3d', 'talkingHead', 'hybrid'])
const FALLBACKS = new Set(['poster', 'audioOnly', 'absent'])

function text(value) {
	const result = String(value ?? '').trim()
	return result || null
}

function list(value, allowed) {
	const values = Array.isArray(value) ? value : []
	return [...new Set(values.map(item => text(item)).filter(item => item && allowed.has(item)))]
}

export function normalizePresenterIdentity(value) {
	if (typeof value === 'string') {
		const id = text(value)
		return id ? { id, portraitAsset: null, riggedModel: null, poster: null, voice: null, consent: {}, provenance: {} } : null
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	const id = text(value.id)
	if (!id) return null
	return {
		id,
		portraitAsset: text(value.portraitAsset || value.portrait || value.avatarImage),
		riggedModel: text(value.riggedModel || value.model || value.glb),
		poster: text(value.poster || value.posterAsset),
		voice: text(value.voice || value.voiceId),
		consent: value.consent && typeof value.consent === 'object' && !Array.isArray(value.consent) ? { ...value.consent } : {},
		provenance: value.provenance && typeof value.provenance === 'object' && !Array.isArray(value.provenance) ? { ...value.provenance } : {},
	}
}

// Resolve the canonical identity and the compact built-in-roster alias into one
// provider-neutral contract. presenter.id is deliberately not read: it is a
// logical actor ID used by motion selection, not the visible person's identity.
// Roster materialization runs before public contract generation, so opaque
// model/poster handles may fill otherwise-missing availability fields.
export function resolvePresenterIdentityForSpec(spec = {}) {
	const presenter = spec?.presenter && typeof spec.presenter === 'object' && !Array.isArray(spec.presenter)
		? spec.presenter
		: {}
	const canonical = normalizePresenterIdentity(spec?.presenterIdentity)
	const alias = normalizePresenterIdentity(presenter.identity)
	const conflict = Boolean(canonical && alias && canonical.id !== alias.id)
	const issues = conflict ? [{
		code: 'PRESENTER_IDENTITY_CONFLICT',
		severity: 'error',
		message: `Canonical presenterIdentity "${canonical.id}" conflicts with presenter.identity "${alias.id}".`,
		reason: 'The canonical identity and compact built-in-roster alias name different visible presenters.',
		fix: 'Use one presenter identity, or make presenter.identity match presenterIdentity.id. The canonical presenterIdentity wins until the conflict is resolved.',
		evidence: { canonicalIdentity: canonical.id, aliasIdentity: alias.id, winner: 'presenterIdentity' },
	}] : []
	const base = canonical || alias
	if (!base) return { identity: null, source: null, issues }
	// A conflicting alias may have materialized a different roster asset. Never
	// merge that model/poster into the canonical winner.
	const mergeMaterializedPresenter = !conflict
	return {
		identity: {
			...base,
			riggedModel: base.riggedModel || (mergeMaterializedPresenter ? text(presenter.model || presenter.avatar || presenter.glb) : null),
			poster: base.poster || (mergeMaterializedPresenter ? text(presenter.poster || presenter.posterAsset) : null),
		},
		source: canonical ? 'presenterIdentity' : 'presenter.identity',
		issues,
	}
}

export function normalizePresenterPolicy(value = {}) {
	const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
	const modes = list(source.modes, MODES)
	const fallback = list(source.fallback, FALLBACKS)
	return {
		modes: modes.length ? modes : ['3d', 'talkingHead'],
		fallback: fallback.length ? fallback : ['poster', 'audioOnly'],
		avoidDuplicatePresence: source.avoidDuplicatePresence !== false,
		reducedMotion: text(source.reducedMotion) || 'poster',
	}
}

function presenterTargetIndexes(onSlides, slideCount) {
	const count = Math.max(0, Number(slideCount) || 0)
	if (Array.isArray(onSlides)) {
		return [...new Set(onSlides.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < count))]
	}
	const key = String(onSlides || 'all').trim().toLowerCase()
	if (key === 'none') return []
	if (key === 'opener+closer' || key === 'ends') return count <= 1 ? (count ? [0] : []) : [0, count - 1]
	return Array.from({ length: count }, (_, index) => index)
}

// Apply the authored representation policy before 3D expansion and avatar
// resolution. This is deliberately provider-neutral: it only chooses which
// product lane is allowed on each slide and never names a worker/model.
export function applyPresenterRepresentationPolicy(spec = {}) {
	if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !Array.isArray(spec.slides)) return spec
	const policy = normalizePresenterPolicy(spec.presenterPolicy)
	const hasPresenterDirective = spec.presenter && typeof spec.presenter === 'object' && spec.presenter.enabled !== false
	const presenterTargets = new Set()
	const sourceTargets = presenterTargetIndexes(spec.presenter?.onSlides, spec.slides.length)
	const default3dAllowed = policy.modes.includes('3d')
	const talkingHeadAllowed = policy.modes.includes('talkingHead')
	const hybridAllowed = policy.modes.includes('hybrid')
	const slides = spec.slides.map((slide, index) => {
		const requested = text(slide?.presenterMode || slide?.presenter?.mode)
		const hasTalkingHead = slideHasTalkingHead(slide)
		const hasAuthored3d = slideHas3d(slide)
		const hasGenerated3d = hasPresenterDirective && sourceTargets.includes(index)
		const has3d = hasAuthored3d || hasGenerated3d
		let mode = requested && MODES.has(requested) ? requested : null
		if (!mode && has3d && hasTalkingHead && policy.avoidDuplicatePresence && !hybridAllowed) mode = default3dAllowed ? '3d' : 'talkingHead'
		if (mode === 'talkingHead' || !default3dAllowed) {
			if (mode === 'talkingHead' && hasGenerated3d) {
				// Remove only the generated deck-level directive on this slide; an
				// explicitly authored 3D object is left intact for hybrid authoring.
			} else if (hasGenerated3d) {
				// handled by the target set below
			}
		} else if (hasGenerated3d) presenterTargets.add(index)
		if (!mode && hasGenerated3d && default3dAllowed) presenterTargets.add(index)
		if (mode === '3d' && hasGenerated3d) presenterTargets.add(index)
		if (mode === 'hybrid' && hasGenerated3d && default3dAllowed) presenterTargets.add(index)
		if (mode === 'talkingHead' || !talkingHeadAllowed || (mode === '3d' && hasTalkingHead && policy.avoidDuplicatePresence && !hybridAllowed)) {
			if (!hasTalkingHead) return slide
			return { ...slide, avatarNarration: { ...slide.avatarNarration, enabled: false } }
		}
		return slide
	})
	if (!hasPresenterDirective) return { ...spec, slides }
	const presenter = { ...spec.presenter }
	if (!default3dAllowed || presenterTargets.size === 0) presenter.enabled = false
	else presenter.onSlides = [...presenterTargets].sort((a, b) => a - b)
	return { ...spec, presenter, slides }
}

function slideHasTalkingHead(slide) {
	return Boolean(slide?.avatarNarration && typeof slide.avatarNarration === 'object' && slide.avatarNarration.enabled !== false)
}

function slideHas3d(slide) {
	if (!slide || typeof slide !== 'object') return false
	if (Array.isArray(slide.content) && slide.content.some(block => block?.kind === 'model3d' && block?.name === 'presenter')) return true
	return Boolean(slide.presenter && typeof slide.presenter === 'object' && slide.presenter.enabled !== false)
}

function presenterDirectiveActive(spec = {}) {
	const presenter = spec?.presenter
	return Boolean(presenter && typeof presenter === 'object' && !Array.isArray(presenter) && presenter.enabled !== false)
}

function finiteNumber(value) {
	const number = Number(value)
	return Number.isFinite(number) ? number : null
}

function timelineForSlide(slide, index) {
	const avatar = slide?.avatarNarration && typeof slide.avatarNarration === 'object' ? slide.avatarNarration : null
	const narration = slide?.narration && typeof slide.narration === 'object'
		? slide.narration
		: slide?.voiceover && typeof slide.voiceover === 'object' ? slide.voiceover : null
	const source = avatar || narration
	const timing = source?.timeline && typeof source.timeline === 'object'
		? source.timeline
		: source?.timing && typeof source.timing === 'object' ? source.timing : {}
	const script = text(source?.script || source?.text || slide?.notes || slide?.message)
	const cues = Array.isArray(source?.cues ?? timing.cues)
		? (source.cues ?? timing.cues).map(cue => ({
			target: text(cue?.target || cue?.objectName),
			atMs: finiteNumber(cue?.atMs ?? cue?.startMs ?? cue?.at),
			endMs: finiteNumber(cue?.endMs ?? cue?.untilMs),
			effect: text(cue?.effect),
		})).filter(cue => cue.atMs !== null)
		: []
	return {
		slide: index,
		slideId: slide?.id || `slide-${index + 1}`,
		source: avatar ? 'talkingHead' : narration ? 'narration' : 'none',
		script,
		startDelayMs: finiteNumber(source?.startDelayMs ?? timing.startDelayMs) ?? 0,
		paddingMs: finiteNumber(source?.paddingMs ?? timing.paddingMs),
		expectedDurationMs: finiteNumber(source?.expectedDurationMs ?? source?.durationMs ?? timing.expectedDurationMs ?? timing.durationMs),
		timingAuthority: source
			? text(source?.timingAuthority ?? timing.timingAuthority) || 'media'
			: 'none',
		cues,
	}
}

export function presenterContractForSpec(spec = {}) {
	const identityResolution = resolvePresenterIdentityForSpec(spec)
	const identity = identityResolution.identity
	const policy = normalizePresenterPolicy(spec.presenterPolicy)
	const motionResolution = motionPolicyResolutionForSpec(spec)
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	const timeline = slides.map(timelineForSlide)
	const native3dRequested = slides.some(slideHas3d) || presenterDirectiveActive(spec)
	const talkingHeadRequested = slides.some(slideHasTalkingHead)
	const presenterRequested = native3dRequested || talkingHeadRequested
	const executionPlan = presenterExecutionPlanForSpec(spec)
	const representations = slides.map((slide, index) => {
		const native3d = slideHas3d(slide)
		const talkingHead = slideHasTalkingHead(slide)
		const hybrid = native3d && talkingHead
		const duplicate = hybrid && policy.avoidDuplicatePresence && !policy.modes.includes('hybrid')
		return {
			slide: index,
			slideId: slide?.id || `slide-${index + 1}`,
			mode: hybrid ? 'hybrid' : native3d ? '3d' : talkingHead ? 'talkingHead' : 'absent',
			native3d,
			talkingHead,
			duplicatePresence: duplicate,
			fallback: policy.fallback[0] || 'poster',
		}
	})
	const duplicateSlides = representations.filter(item => item.duplicatePresence).map(item => item.slideId)
	const warnings = [...identityResolution.issues, ...motionResolution.issues]
	if (presenterRequested && !identity) warnings.push({ code: 'PRESENTER_IDENTITY_MISSING', message: 'PresenterIdentity is not declared; 2D and 3D assets cannot be continuity-checked.' })
	if (identity && policy.modes.includes('3d') && !identity.riggedModel && native3dRequested) warnings.push({ code: 'PRESENTER_RIGGED_MODEL_MISSING', message: 'PresenterIdentity has no riggedModel for the native 3D lane.' })
	if (identity && policy.modes.includes('talkingHead') && !identity.portraitAsset && talkingHeadRequested) warnings.push({ code: 'PRESENTER_PORTRAIT_MISSING', message: 'PresenterIdentity has no portraitAsset for the talking-head lane.' })
	if (duplicateSlides.length) warnings.push({ code: 'PRESENTER_DUPLICATE_PRESENCE', message: 'A slide requests native 3D and talking-head presence while duplicate suppression is enabled.', slides: duplicateSlides })
	const activeTimeline = timeline.filter(item => item.source !== 'none')
	const timelineAuthorities = new Set(activeTimeline.map(item => item.timingAuthority))
	const clock = !presenterRequested && activeTimeline.length === 0
		? { source: 'none', master: 'authored slide timing', shared: false }
		: timelineAuthorities.has('media')
			? { source: 'embedded audiovisual media', master: 'measured media', shared: true }
			: timelineAuthorities.has('timeline')
				? { source: 'authored presenter timeline', master: 'timeline', shared: true }
				: timelineAuthorities.has('hybrid')
					? { source: 'measured media plus authored cues', master: 'reconciled media/timeline', shared: true }
					: { source: 'slide narration/message/notes', master: 'text', shared: true }
	const blockingWarnings = new Set(['PRESENTER_IDENTITY_MISSING', 'PRESENTER_IDENTITY_CONFLICT', 'PRESENTER_RIGGED_MODEL_MISSING', 'PRESENTER_PORTRAIT_MISSING', 'PRESENTER_DUPLICATE_PRESENCE', 'MOTION_POLICY_CONFLICT'])
	return {
		schemaVersion: 'betterpptx.presenter-contract.v1',
		identity,
		policy,
		clock,
		timeline: { schemaVersion: 'betterpptx.presenter-timeline.v1', entries: timeline },
		executionPlan,
		representations,
		lanes: {
			native3d: representations.some(item => item.native3d),
			talkingHead: representations.some(item => item.talkingHead),
			fallback: true,
		},
		warnings,
		ready: warnings.every(item => !blockingWarnings.has(item.code)),
	}
}

function deckPresenterTargets(spec = {}) {
	const presenter = spec.presenter && typeof spec.presenter === 'object' ? spec.presenter : null
	if (!presenter || presenter.enabled === false) return new Set()
	if (Array.isArray(presenter.onSlides)) return new Set(presenter.onSlides.map(Number).filter(Number.isInteger))
	return new Set((Array.isArray(spec.slides) ? spec.slides : []).map((_, index) => index))
}

function fallbackForSlide(slide, identity, policy) {
	const posterAvailable = Boolean(identity?.poster || identity?.portraitAsset || slide?.poster || slide?.avatarNarration?.poster)
	for (const fallback of policy.fallback) {
		if (fallback === 'poster' && posterAvailable) return { mode: 'poster', active: false, powerPointNative: true, reason: 'poster-fallback' }
		if (fallback === 'audioOnly') return { mode: 'audioOnly', active: false, powerPointNative: true, reason: 'audio-only-fallback' }
		if (fallback === 'absent') return { mode: 'absent', active: false, powerPointNative: false, reason: 'explicit-absence-fallback' }
	}
	return { mode: 'absent', active: false, powerPointNative: false, reason: 'no-compatible-fallback' }
}

// Provider-neutral runtime lane decision. This is intentionally a plan rather
// than a render claim: the selected lane must still pass the media/3D package
// and playback gates before a production revision is promoted.
export function presenterExecutionPlanForSpec(spec = {}, options = {}) {
	const identity = resolvePresenterIdentityForSpec(spec).identity
	const policy = normalizePresenterPolicy(spec.presenterPolicy)
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	const deckTargets = deckPresenterTargets(spec)
	const specMotionPolicy = motionPolicyResolutionForSpec(spec).policy
	const optionPolicy = String(options.motionPolicy || '').trim().toLowerCase()
	const effectiveMotionPolicy = options.reducedMotion === true
		? 'static'
		: optionPolicy === 'poster' ? 'static' : MOTION_POLICIES.has(optionPolicy) ? optionPolicy : specMotionPolicy
	const forceStatic = effectiveMotionPolicy === 'static'
	const entries = slides.map((slide, index) => {
		const timeline = timelineForSlide(slide, index)
		const hasTalkingHead = slideHasTalkingHead(slide)
		const hasNative3d = slideHas3d(slide) || (deckTargets.has(index) && Boolean(spec.presenter?.model || spec.presenter?.avatar || spec.presenter?.glb))
		const available3d = policy.modes.includes('3d') && (hasNative3d || Boolean(identity?.riggedModel))
		const availableTalkingHead = policy.modes.includes('talkingHead') && (hasTalkingHead || Boolean(identity?.portraitAsset))
		const requested = text(slide?.presenterMode || slide?.presenter?.mode)
		let mode = null
		let reason = requested ? 'authored-mode' : 'content-default'
		if (!forceStatic) {
			if (requested === 'hybrid' && policy.modes.includes('hybrid') && available3d && availableTalkingHead) mode = 'hybrid'
			else if (requested === '3d' && available3d) mode = '3d'
			else if (requested === 'talkingHead' && availableTalkingHead) mode = 'talkingHead'
			else if (!requested && hasTalkingHead && availableTalkingHead) mode = 'talkingHead'
			else if (!requested && hasNative3d && available3d) mode = '3d'
			else if (requested) reason = 'requested-mode-unavailable'
		}
		const presenterRequested = Boolean(requested || hasTalkingHead || hasNative3d)
		const selected = mode
			? { mode, active: true, powerPointNative: true, reason }
			: presenterRequested
				? fallbackForSlide(slide, identity, policy)
				: { mode: 'absent', active: false, powerPointNative: false, reason: 'no-presenter-request' }
		return {
			slide: index,
			slideId: timeline.slideId,
			mode: selected.mode,
			active: selected.active,
			powerPointNative: selected.powerPointNative,
			reason: forceStatic ? 'motion-policy-static' : selected.reason,
			native3d: selected.mode === '3d' || selected.mode === 'hybrid',
			talkingHead: selected.mode === 'talkingHead' || selected.mode === 'hybrid',
			fallback: !selected.active,
			timingAuthority: timeline.timingAuthority,
			expectedDurationMs: timeline.expectedDurationMs,
			timelineSource: timeline.source,
		}
	})
	return { schemaVersion: 'betterpptx.presenter-execution-plan.v1', motionPolicy: effectiveMotionPolicy, entries }
}
