// ir/motion-policy.mjs — D5: full / reduced / static presentation policy. The owner doctrine: the
// deck communicates WITHOUT the presenter, and no fact depends on a trigger or sound. motionPolicy
// flows through the synergy/presenter tracks:
//   full    — everything plays (default).
//   reduced — large travel/impact removed (motion paths, exits, knock-over fly); in-place gestures
//             and the playScene clip stay.
//   static  — no runtime dependence: presenters render as their POSTER still (playScene + motion
//             stripped), interaction target motions removed; the deck stands on its content.
// Applied to the EXPANDED spec (after presenter/interaction injection). Also produces the
// SOLE-CARRIER report: a slide that would lose its message with the presenter hidden is flagged —
// the presenter must never be the only thing carrying a fact.

export const MOTION_POLICIES = new Set(['full', 'reduced', 'static'])

function explicitMotionPolicy(spec = {}) {
	const candidates = [
		['motionPolicy', spec?.motionPolicy],
		['motion.policy', spec?.motion?.policy],
	]
	for (const [source, value] of candidates) {
		if (value === undefined || value === null || String(value).trim() === '') continue
		const policy = String(value).trim().toLowerCase()
		return { source, policy, valid: MOTION_POLICIES.has(policy) }
	}
	return null
}

function accessibilityRequestsReducedMotion(spec = {}) {
	const value = spec?.accessibility?.reducedMotion
	if (value === true) return true
	return ['true', 'reduce', 'reduced'].includes(String(value ?? '').trim().toLowerCase())
}

// Resolve one effective playback policy without allowing the accessibility
// shorthand to silently replace an explicit AI-authored policy. A conflicting
// spec remains deterministic under the explicit policy, but the issue is
// surfaced so a Director/FTR caller must resolve the contradiction.
export function motionPolicyResolutionForSpec(spec = {}) {
	const explicit = explicitMotionPolicy(spec)
	const accessibilityReduced = accessibilityRequestsReducedMotion(spec)
	const applied = String(spec?._motionPolicyApplied?.policy || '').trim().toLowerCase()
	const policy = explicit?.valid
		? explicit.policy
		: MOTION_POLICIES.has(applied)
			? applied
			: accessibilityReduced ? 'reduced' : 'full'
	const issues = []
	if (explicit?.valid && accessibilityReduced && explicit.policy === 'full') {
		issues.push({
			code: 'MOTION_POLICY_CONFLICT',
			severity: 'error',
			message: 'Explicit motionPolicy "full" conflicts with accessibility.reducedMotion.',
			reason: 'The explicit AI-authored playback policy and the accessibility shorthand request different effective motion behavior.',
			fix: 'Choose one effective playback policy. Keep motionPolicy:"full" and express static completeness separately, or set motionPolicy:"reduced".',
			evidence: {
				explicitSource: explicit.source,
				explicitPolicy: explicit.policy,
				accessibilityReducedMotion: true,
				effectivePolicy: policy,
			},
		})
	}
	return {
		policy,
		source: explicit?.valid
			? explicit.source
			: MOTION_POLICIES.has(applied) ? '_motionPolicyApplied.policy' : accessibilityReduced ? 'accessibility.reducedMotion' : 'default',
		issues,
	}
}

export function normalizeMotionPolicy(spec) {
	return motionPolicyResolutionForSpec(spec).policy
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
const lc = v => String(v || '').toLowerCase()
// which content blocks are presenter/actor/interaction-injected 3D (motion we may reduce/strip)
function isSynergy3d(block) {
	if (!isObj(block)) return false
	if (lc(block.kind) === 'model3d' || lc(block.kind) === 'model3d') {
		const nm = String(block.objectName || block.name || '')
		return nm === 'presenter' || /_ix_\d+$/.test(nm) || !!block._synergy || !!block.morphName || !!block.scene
	}
	return false
}
const isMotionAnim = a => isObj(a) && (lc(a.type) === 'motion' || lc(a.type) === 'exit' || a.pathData || a.motionPathData)
const isPlayScene = a => isObj(a) && lc(a.effect) === 'playscene'

function animationCount(value) {
	if (Array.isArray(value)) return value.length
	return value == null ? 0 : 1
}

function stripStaticNarrationCues(value) {
	if (!isObj(value)) return { value, removed: 0 }
	let removed = animationCount(value.cues)
	const { cues, ...withoutCues } = value
	// Removing authored cues would otherwise make the narration compiler infer a
	// fresh automatic build. Explicitly disable that build in static output.
	let out = { ...withoutCues, syncBuild: false }
	for (const key of ['timing', 'timeline']) {
		if (!isObj(out[key])) continue
		removed += animationCount(out[key].cues)
		const { cues: nestedCues, ...nested } = out[key]
		out = { ...out, [key]: nested }
	}
	if (Array.isArray(out.segments)) {
		out = {
			...out,
			segments: out.segments.map(segment => {
				const stripped = stripStaticNarrationCues(segment)
				removed += stripped.removed
				return stripped.value
			}),
		}
	}
	return { value: out, removed }
}

// Apply the policy to the expanded spec (returns a new spec; input untouched). Records per-slide what
// it reduced/removed on spec._motionPolicyApplied.
export function applyMotionPolicy(spec, policy = normalizeMotionPolicy(spec)) {
	if (policy === 'full' || !isObj(spec) || !Array.isArray(spec.slides)) return spec
	const changes = []
	const slides = spec.slides.map((s, si) => {
		let removed = 0, reduced = 0
		let slide = s
		if (policy === 'static') {
			const { timeline, presenterMotion, scene, ...withoutRuntimeBeats } = slide
			removed += animationCount(timeline) + animationCount(presenterMotion) + animationCount(scene)
			slide = withoutRuntimeBeats
			if (isObj(slide.motion) && Array.isArray(slide.motion.sequences)) {
				const { sequences, ...motion } = slide.motion
				removed += sequences.length
				slide = { ...slide, motion }
			}
			for (const key of ['narration', 'voiceover', 'avatarNarration']) {
				if (!isObj(slide[key])) continue
				const stripped = stripStaticNarrationCues(slide[key])
				removed += stripped.removed
				slide = { ...slide, [key]: stripped.value }
			}
		}
		if (!Array.isArray(slide.content)) {
			if (removed || reduced) changes.push({ slide: si, slideId: s.id, removed, reduced })
			return slide
		}
		const content = slide.content.filter(block => {
			// D3 impact accents are pure motion decoration — drop them entirely under reduced/static.
			if (isObj(block) && block._synergyAccent && (policy === 'reduced' || policy === 'static')) { removed++; return false }
			return true
		}).map(block => {
			if (!isObj(block)) return block
			const synergy3d = isSynergy3d(block)
			// 1) synergy-injected 3D presenter/actor. Travel/motion cues (co-fire path) are large
			// motion — stripped in BOTH static and reduced. The playScene gesture is stripped only in
			// static (poster still); reduced keeps the in-place gesture.
			if (synergy3d) {
				let b = block
				if (policy === 'static') {
					removed += animationCount(b.animation) + animationCount(b.animations) + animationCount(b.scene)
					reduced += animationCount(b.motion) + animationCount(b.travelPath)
					if (b._presenterMotionId != null || b._presenterNarrationCue != null) reduced++
					let options = b.options
					if (isObj(options) && (options.animation != null || options.animations != null)) {
						removed += animationCount(options.animation) + animationCount(options.animations)
						const { animation, animations, ...staticOptions } = options
						options = staticOptions
					}
					const { animation, animations, scene, motion, travelPath, _presenterMotionId, _presenterNarrationCue, ...rest } = b
					return { ...rest, ...(isObj(options) ? { options } : {}), nativeOnly: false, _staticPoster: true }
				}
				if ((policy === 'static' || policy === 'reduced') && (b.motion || b.travelPath)) { reduced++; const { motion, travelPath, ...rest } = b; b = rest }
				if (b.animation) {
					const anims = Array.isArray(b.animation) ? b.animation : [b.animation]
					const kept = anims.filter(a => !isMotionAnim(a)) // reduced: drop travel/exit, keep playScene
					if (kept.length !== anims.length) { reduced += anims.length - kept.length; return { ...b, animation: kept.length ? (kept.length === 1 ? kept[0] : kept) : undefined } }
				}
				return b
			}
			// 3) ordinary content. Static output must reveal the complete slide with
			// no playback, so remove every object animation while preserving the
			// object. Reduced remains scoped to travel/exit motion only.
			if (policy === 'static') {
				removed += animationCount(block.animation) + animationCount(block.animations)
				reduced += animationCount(block.motion) + animationCount(block.travelPath)
				let options = block.options
				if (isObj(options) && (options.animation != null || options.animations != null)) {
					removed += animationCount(options.animation) + animationCount(options.animations)
					const { animation, animations, ...staticOptions } = options
					options = staticOptions
				}
				const { animation, animations, motion, travelPath, ...rest } = block
				return { ...rest, ...(isObj(options) ? { options } : {}) }
			}
			if (!synergy3d && block.animation) {
				const anims = Array.isArray(block.animation) ? block.animation : [block.animation]
				const motionOnes = anims.filter(isMotionAnim)
				if (motionOnes.length && (policy === 'static' || policy === 'reduced')) {
					const kept = anims.filter(a => !isMotionAnim(a))
					reduced += motionOnes.length
					return { ...block, animation: kept.length ? (kept.length === 1 ? kept[0] : kept) : undefined }
				}
			}
			return block
		})
		if (removed || reduced) changes.push({ slide: si, slideId: s.id, removed, reduced })
		return { ...slide, content }
	})
	let motion = spec.motion
	if (policy === 'static' && isObj(motion) && Array.isArray(motion.sequences)) {
		const { sequences, ...staticMotion } = motion
		motion = staticMotion
	}
	const out = { ...spec, ...(motion !== spec.motion ? { motion } : {}), slides }
	out._motionPolicyApplied = { policy, changes }
	return out
}

// SOLE-CARRIER report (D5 rubric core): a slide passes when it carries its message WITHOUT the
// presenter — i.e. it has non-presenter, non-decorative content (a title plus body/data/media/image).
// A slide whose only meaningful content is the presenter/interaction FAILS (the presenter would be the
// sole carrier). Pure read; independent of policy so it can gate a full deck too.
const MEANING_KINDS = new Set(['title', 'textbox', 'text', 'textshape', 'bullets', 'body', 'chart-panel', 'chart', 'table-panel', 'table', 'metric-grid', 'metric', 'kpi', 'stat', 'image', 'image-feature', 'media', 'smartart', 'diagram', 'equation', 'quote', 'comparison', 'timeline', 'process', 'callout'])
export function soleCarrierReport(spec) {
	if (!isObj(spec) || !Array.isArray(spec.slides)) return { ok: true, slides: [] }
	const slides = spec.slides.map((s, si) => {
		const content = Array.isArray(s.content) ? s.content : []
		const meaning = content.filter(b => isObj(b) && MEANING_KINDS.has(lc(b.kind)))
		const hasTitleOrMessage = meaning.some(b => lc(b.kind) === 'title') || !!s.title || !!s.message
		const hasBodyMeaning = meaning.some(b => lc(b.kind) !== 'title')
		const hasNarration = !!(s.narration?.text || s.narration?.script || s.message)
		// Narration/audio is not visible static meaning. A slide passes only when
		// non-presenter body/data/visible-media content remains beyond its title;
		// title and narration fields stay in the report as diagnostics.
		const ok = hasBodyMeaning
		return { slide: si, slideId: s.id, ok, meaningBlocks: meaning.length, hasBodyMeaning, hasNarration,
			...(ok ? {} : { verdict: { code: 'PRESENTER_SOLE_CARRIER', severity: 'error', reason: 'this slide has no visible body/data/media content that communicates its message without the presenter or playback.', fix: 'add visible native body/data/media content beyond the title; narration alone cannot satisfy static completeness.' } }) }
	})
	return { ok: slides.every(s => s.ok), slides }
}
