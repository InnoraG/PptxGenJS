/**
 * Keep speaker notes author-readable. Synthesize a separate pronunciation copy.
 */

const ABBREVIATIONS = Object.freeze([
	[/GPT-?(\d+(?:\.\d+)?)/gi, (_, n) => `G P T ${spokenNumber(n)}`],
	[/\bAPI\b/g, 'A P I'],
	[/\bROI\b/g, 'return on investment'],
	[/\bUX\b/g, 'user experience'],
	[/\bUI\b/g, 'user interface'],
	[/\bAI\b/g, 'A I'],
	[/\bCEO\b/g, 'C E O'],
	[/\bCTO\b/g, 'C T O'],
	[/\bKPI\b/g, 'K P I'],
	[/\bSaaS\b/g, 'SaaS'],
])

function spokenNumber(value) {
	const raw = String(value || '')
	if (!raw) return ''
	if (raw.includes('.')) {
		const [whole, frac] = raw.split('.')
		return `${whole} point ${frac.split('').join(' ')}`
	}
	return raw
}

export function normalizeNarrationForTts(text = '') {
	let out = String(text || '')
	for (const [pattern, replacement] of ABBREVIATIONS) {
		out = out.replace(pattern, replacement)
	}
	return out.replace(/\s+/g, ' ').trim()
}

export function lengthScaleFromRate(rate) {
	const n = Number(rate)
	if (!Number.isFinite(n) || n <= 0) return undefined
	return Math.max(0.5, Math.min(2, 1 / n))
}

export function mapCueProsody(cue = {}) {
	const requested = {
		...(cue.tts && typeof cue.tts === 'object' ? cue.tts : {}),
		rate: cue.rate ?? cue.tts?.rate,
		emphasis: cue.emphasis ?? cue.tts?.emphasis,
		pitch: cue.pitch ?? cue.tts?.pitch,
		pauseBeforeMs: cue.pauseBeforeMs ?? cue.tts?.pauseBeforeMs,
		pauseAfterMs: cue.pauseAfterMs ?? cue.tts?.pauseAfterMs,
	}
	const applied = {}
	const unsupported = []
	const lengthScale = lengthScaleFromRate(requested.rate)
	if (lengthScale) applied.lengthScale = Number(requested.emphasis) === 'strong' || requested.emphasis === 'strong'
		? Math.min(2, lengthScale * 1.08)
		: lengthScale
	else if (requested.emphasis === 'strong') applied.lengthScale = 1.08
	if (requested.pauseBeforeMs != null) applied.pauseBeforeMs = Number(requested.pauseBeforeMs) || 0
	if (requested.pauseAfterMs != null) applied.pauseAfterMs = Number(requested.pauseAfterMs) || 0
	if (requested.pitch != null) unsupported.push('independent pitch control')
	if (requested.emphasis && requested.emphasis !== 'strong' && requested.emphasis !== 'none') unsupported.push(`emphasis:${requested.emphasis}`)
	return {
		requested,
		applied,
		unsupported,
		partial: unsupported.length > 0,
	}
}

export function cuesToSynthesisSegments(cues = [], { script: fullScript } = {}) {
	// Phrase/time anchors describe WHEN a visual changes, not another line to speak.
	// In particular, auto-build emits one anchor per object and may repeat the same
	// sentence opening many times. Only explicitly authored spoken cue text can
	// form audio segments; keep the full script authoritative when it is supplied.
	const rows = (Array.isArray(cues) ? cues : []).filter(cue => cue && !cue.autoSyncedBuild && (cue.text || cue.script))
	if (rows.length < 2) return null
	const plain = value => String(value || '').replace(/\s+/g, ' ').trim()
	const scripts = rows.map(cue => String(cue.text || cue.script).trim())
	if (scripts.some(script => !script)) return null
	if (plain(fullScript) && plain(scripts.join(' ')) !== plain(fullScript)) return null
	return rows.map((cue, index) => {
		const prosody = mapCueProsody(cue)
		const script = scripts[index]
		return {
			script,
			synthesisText: normalizeNarrationForTts(script),
			gapBeforeMs: prosody.applied.pauseBeforeMs || (index === 0 ? 0 : undefined),
			gapAfterMs: prosody.applied.pauseAfterMs,
			lengthScale: prosody.applied.lengthScale,
			cues: [{ ...cue, atMs: 0, text: script }],
			prosody,
			objectName: cue.cueId || cue.id || `cue-seg-${index + 1}`,
		}
	})
}

export function narratedProfileRequested(spec = {}) {
	const variant = String(spec.outputVariant || spec.selectedOutputVariants?.[0] || '').toLowerCase()
	if (variant === 'silent-timed-notes' || variant === 'silent') return false
	if (spec.narration?.synthesizeAudio === false) return false
	if (variant === 'internal-piper-no-captions' || variant === 'narrated' || variant === 'voice-only' || variant === 'voice+captions') return true
	if (spec.narration?.synthesizeAudio === true) return true
	const hasScript = Boolean(spec.narration?.text || spec.narration?.script || (spec.slides || []).some(slide => slide?.narration && slide.narration.enabled !== false && (slide.narration.script || slide.narration.text)))
	return hasScript && spec.narration?.synthesizeAudio !== false
}
