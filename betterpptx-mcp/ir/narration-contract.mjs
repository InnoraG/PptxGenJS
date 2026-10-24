const OVERLAY_FIELD_NAMES = Object.freeze([
	'captions',
	'captionPolicy',
	'captionsFromSegments',
	'caption',
	'captionText',
	'visibleCaptions',
	'captionMode',
])

const OVERLAY_OUTPUT_VARIANTS = new Set(['captions-only', 'voice+captions', 'voice-caption'])

function asText(value) {
	return String(value ?? '').trim()
}

export function isNonNativeCaptionOverlayValue(value) {
	if (value == null || value === false) return false
	if (value === true) return true
	if (typeof value === 'number') return value !== 0
	if (typeof value === 'string') {
		const token = value.trim().toLowerCase()
		if (!token) return false
		if (['forbidden', 'none', 'off', 'false', '0', 'hidden', 'notes'].includes(token)) return false
		return ['visible', 'overlay', 'on', 'true', 'subtitle', 'subtitles', 'captions-only', 'voice+captions', 'voice-caption'].includes(token) || token.length > 0
	}
	if (Array.isArray(value)) return value.length > 0
	if (typeof value === 'object') {
		if (value.visible === true || value.enabled === true) return true
		const mode = asText(value.mode || value.policy || value.representation).toLowerCase()
		return ['visible', 'overlay', 'subtitle', 'text-shape', 'slide-text'].includes(mode)
	}
	return false
}

export function nonNativeCaptionOverlayField(node, path = 'spec') {
	if (!node || typeof node !== 'object' || Array.isArray(node)) return null
	for (const key of OVERLAY_FIELD_NAMES) {
		if (!Object.prototype.hasOwnProperty.call(node, key)) continue
		if (isNonNativeCaptionOverlayValue(node[key])) return `${path}.${key}`
	}
	const variant = asText(node.outputVariant).toLowerCase()
	if (OVERLAY_OUTPUT_VARIANTS.has(variant) && !(Array.isArray(node.audio?.closedCaptionTracks) && node.audio.closedCaptionTracks.length)) {
		return `${path}.outputVariant`
	}
	return null
}

export function findNonNativeCaptionOverlayField(root, path = 'spec') {
	const direct = nonNativeCaptionOverlayField(root, path)
	if (direct) return direct
	if (!root || typeof root !== 'object' || Array.isArray(root)) return null
	for (const key of ['narration', 'voiceover', 'avatarNarration', 'timeline', 'timing', 'narrationTiming', 'audio']) {
		if (!root[key] || typeof root[key] !== 'object' || Array.isArray(root[key])) continue
		const nested = findNonNativeCaptionOverlayField(root[key], `${path}.${key}`)
		if (nested) return nested
	}
	if (Array.isArray(root.segments)) {
		for (let index = 0; index < root.segments.length; index += 1) {
			const nested = findNonNativeCaptionOverlayField(root.segments[index], `${path}.segments[${index}]`)
			if (nested) return nested
		}
	}
	if (Array.isArray(root.slides)) {
		for (let index = 0; index < root.slides.length; index += 1) {
			const nested = findNonNativeCaptionOverlayField(root.slides[index], `${path}.slides[${index}]`)
			if (nested) return nested
		}
	}
	if (Array.isArray(root.content)) {
		for (let index = 0; index < root.content.length; index += 1) {
			const block = root.content[index]
			if (asText(block?.kind).toLowerCase() === 'caption' && (block.role === 'caption' || block.caption === true || block.fromNarration === true)) {
				return `${path}.content[${index}].kind`
			}
			const nested = findNonNativeCaptionOverlayField(block, `${path}.content[${index}]`)
			if (nested) return nested
		}
	}
	return null
}

export function nonNativeCaptionOverlayIssue(path) {
	return {
		code: 'NON_NATIVE_CAPTION_FIELD_REMOVED',
		message: 'The captions field previously represented non-native slide text overlays and has been removed. Use audio.closedCaptionTracks only for native WebVTT media captions.',
		path,
		severity: 'error',
		reason: 'Narration is speaker notes, embedded audio, cues, motion, and auto-advance. Visible transcript text boxes are not a narration mode.',
		fix: 'Remove overlay caption fields. Keep narration.text, voiceId, cues, and notes. Add audio.closedCaptionTracks only when a native WebVTT media track is explicitly requested.',
	}
}

export function slideOrdinal(slide, index = 0) {
	const digits = Number(String(slide?.id || '').replace(/\D/g, ''))
	if (Number.isFinite(digits) && digits > 0) return digits
	const dataIndex = Number(slide?.index ?? slide?.slideIndex)
	if (Number.isFinite(dataIndex) && dataIndex >= 0) return dataIndex + 1
	return index + 1
}

export function flattenHtmlCueManifest(manifest) {
	if (!manifest || typeof manifest !== 'object') return []
	if (Array.isArray(manifest.cues)) {
		return manifest.cues.map(cue => normalizeAuthoredCue(cue)).filter(Boolean)
	}
	if (!Array.isArray(manifest.slides)) return []
	const rows = []
	manifest.slides.forEach((entry, index) => {
		const ordinal = Number(entry?.slide ?? entry?.slideIndex ?? entry?.id ?? index + 1)
		for (const cue of entry?.cues || []) {
			const next = normalizeAuthoredCue({
				...cue,
				slide: cue.slide ?? entry.slide ?? ordinal,
				slideId: cue.slideId || entry.slideId || entry.id || ordinal,
				slideIndex: cue.slideIndex ?? entry.slideIndex ?? (Number.isFinite(ordinal) ? ordinal - 1 : index),
				title: cue.title || entry.title,
			})
			if (next) rows.push(next)
		}
	})
	return rows
}

export function cueBelongsToSlide(cue, slide, slideIndex = 0) {
	if (!cue || !slide) return false
	const ordinal = slideOrdinal(slide, slideIndex)
	const title = asText(slide.title).toLowerCase()
	const id = asText(slide.id)
	if (cue.slideId != null && String(cue.slideId) === id) return true
	if (cue.slide != null && String(cue.slide) === id) return true
	if (title && asText(cue.title).toLowerCase() === title) return true
	const authoredSlideNo = Number(cue.slide ?? (typeof cue.slideId === 'number' || /^\d+$/.test(String(cue.slideId || '')) ? cue.slideId : NaN))
	if (Number.isFinite(authoredSlideNo) && authoredSlideNo > 0 && authoredSlideNo === ordinal) return true
	if (cue.slideIndex != null && Number(cue.slideIndex) === slideIndex) return true
	return false
}

export function normalizeAuthoredCue(cue) {
	if (typeof cue === 'string' && cue.trim()) return { atPhrase: cue.trim(), text: cue.trim() }
	if (!cue || typeof cue !== 'object' || Array.isArray(cue)) return null
	const next = { ...cue }
	if (next.atMs == null && next.at != null) {
		const at = Number(next.at)
		if (Number.isFinite(at) && at >= 0) next.atMs = at <= 180 ? Math.round(at * 1000) : Math.round(at)
	}
	if (next.durationMs == null && next.duration != null) {
		const duration = Number(next.duration)
		if (Number.isFinite(duration) && duration >= 0) next.durationMs = duration <= 180 ? Math.round(duration * 1000) : Math.round(duration)
	}
	if (next.target == null && Array.isArray(next.focus) && next.focus[0]) next.target = next.focus[0]
	// AI clients often key a cue by the object it reveals, as timeline steps do.
	if (next.target == null && next.objectName) next.target = next.objectName
	if (next.text == null && (next.script || next.phrase)) next.text = next.script || next.phrase
	if (next.atPhrase == null && next.atMs == null && next.delay == null && next.text) next.atPhrase = String(next.text).trim()
	return next
}

export function cuesForSlide(cues, slide, slideIndex = 0) {
	return (Array.isArray(cues) ? cues : []).filter(cue => cueBelongsToSlide(cue, slide, slideIndex))
}

export function authoredCuesFromNarration(narration = {}) {
	if (!narration || typeof narration !== 'object') return []
	const raw = narration.cues ?? narration.timing?.cues ?? narration.timeline?.cues ?? narration.narrationTiming?.cues ?? []
	return (Array.isArray(raw) ? raw : []).map(normalizeAuthoredCue).filter(Boolean)
}

export function buildNarrationCueLedger(spec = {}) {
	const sidecarCues = flattenHtmlCueManifest(spec.htmlCueManifest)
	let authoredCueCount = 0
	let acceptedCueCount = 0
	let resolvedCueTargets = 0
	let unresolvedCueTargets = 0
	let untargetedCues = 0
	const slides = []
	;(spec.slides || []).forEach((slide, slideIndex) => {
		const names = new Set((slide.content || []).map(block => asText(block?.name || block?.objectName)).filter(Boolean))
		const sidecar = cuesForSlide(sidecarCues, slide, slideIndex)
		const local = authoredCuesFromNarration(slide.narration)
		const block = (slide.content || []).find(item => asText(item?.kind).toLowerCase() === 'narration')
		const fromBlock = authoredCuesFromNarration(block)
		const merged = [...local, ...fromBlock]
		const authored = merged.length ? merged : sidecar
		authoredCueCount += authored.length
		let accepted = 0
		let resolved = 0
		let unresolved = 0
		const untargetedCueIds = []
		const unresolvedTargets = []
		for (const cue of authored) {
			if (cue.atMs == null && !cue.atPhrase && !cue.atWord && cue.delay == null) continue
			accepted += 1
			const target = asText(cue.target)
			if (!target) {
				// Cues with spoken text may still resolve a target by focus text later;
				// a bare time marker never animates anything.
				if (!cue.text && !cue.atPhrase && !cue.atWord) untargetedCueIds.push(asText(cue.id) || `#${accepted}`)
				continue
			}
			if (names.has(target) || [...names].some(name => name.split('.').includes(target) || target.split(/\s+/).some(part => name.toLowerCase().includes(part.toLowerCase())))) resolved += 1
			else {
				unresolved += 1
				unresolvedTargets.push(target)
			}
		}
		acceptedCueCount += accepted
		resolvedCueTargets += resolved
		unresolvedCueTargets += unresolved
		untargetedCues += untargetedCueIds.length
		slides.push({
			slideId: slide.id,
			authoredCueCount: authored.length,
			acceptedCueCount: accepted,
			resolvedCueTargets: resolved,
			unresolvedCueTargets: unresolved,
			...(untargetedCueIds.length ? { untargetedCueIds } : {}),
			...(unresolvedTargets.length ? { unresolvedTargets } : {}),
		})
	})
	return {
		authoredCueCount,
		acceptedCueCount,
		preservedNarrationCues: acceptedCueCount,
		resolvedCueTargets,
		unresolvedCueTargets,
		untargetedCues,
		cueSegmentSynthesis: acceptedCueCount > 0,
		appliedCueTargets: resolvedCueTargets,
		cueCount: acceptedCueCount,
		slides,
	}
}

export function webvttFromCues(cues = [], { language = 'en-US' } = {}) {
	const rows = (Array.isArray(cues) ? cues : []).map(normalizeAuthoredCue).filter(cue => cue && (cue.text || cue.atPhrase) && Number.isFinite(Number(cue.atMs)))
	const lines = ['WEBVTT', '']
	rows.forEach((cue, index) => {
		const start = Math.max(0, Number(cue.atMs) || 0)
		const end = start + Math.max(400, Number(cue.durationMs) || 1200)
		lines.push(String(index + 1))
		lines.push(`${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}`)
		lines.push(String(cue.text || cue.atPhrase))
		lines.push('')
	})
	return { language, text: lines.join('\n'), cueCount: rows.length }
}

function formatVttTimestamp(ms) {
	const total = Math.max(0, Math.round(Number(ms) || 0))
	const hours = Math.floor(total / 3600000)
	const minutes = Math.floor((total % 3600000) / 60000)
	const seconds = Math.floor((total % 60000) / 1000)
	const millis = total % 1000
	const pad = (value, size) => String(value).padStart(size, '0')
	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`
}

export function materializeClosedCaptionTracks(tracks, { cues = [], script = '' } = {}) {
	if (!Array.isArray(tracks) || !tracks.length) return []
	return tracks.map((track, index) => {
		if (!track || typeof track !== 'object') {
			const error = new Error('Native caption tracks must be objects bound to audio or video media.')
			error.code = 'NATIVE_CAPTION_TRACK_MEDIA_OWNER_REQUIRED'
			throw error
		}
		const language = asText(track.language || track.lang || 'en-US') || 'en-US'
		if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) {
			const error = new Error('Native caption track language must be a BCP-47 tag such as en-US.')
			error.code = 'NATIVE_CAPTION_TRACK_LANGUAGE_INVALID'
			throw error
		}
		let text = asText(track.vtt || track.text || '')
		const source = asText(track.source).toLowerCase()
		if (!text && (source === 'narration-cues' || source === 'cues')) {
			text = webvttFromCues(cues.length ? cues : [{ atMs: 0, text: script, durationMs: 1200 }], { language }).text
		}
		if (text && !/^WEBVTT/i.test(text)) {
			const error = new Error('Native caption tracks require WebVTT data.')
			error.code = 'NATIVE_CAPTION_TRACK_INVALID_WEBVTT'
			throw error
		}
		if (!text && !track.path && !track.data && !track.handle) {
			const error = new Error('Native caption tracks require WebVTT data, a file path, or source:"narration-cues".')
			error.code = 'NATIVE_CAPTION_TRACK_INVALID_WEBVTT'
			throw error
		}
		return {
			format: 'webvtt',
			language,
			label: asText(track.label) || language,
			embed: track.embed !== false,
			default: track.default === true || index === 0,
			vtt: text || undefined,
			path: track.path,
			data: track.data,
			handle: track.handle,
		}
	})
}

export function isHtmlRuntimePlayerChrome(el, attr) {
	if (!el) return false
	const id = asText(attr(el, 'id')).toLowerCase()
	const cls = asText(attr(el, 'class')).toLowerCase()
	if (['caption', 'caption-shell', 'start-screen', 'cc', 'mode-dock', 'app-chrome'].includes(id)) return true
	if (/\b(mode-button|mode-grid|start-card|caption-word|caption-punct|player-chrome)\b/.test(cls)) return true
	if (attr(el, 'data-start-mode')) return true
	if (asText(attr(el, 'data-source-role')).toLowerCase() === 'runtime-player-chrome') return true
	return false
}

export const NATIVE_MEDIA_CAPTION_CAPABILITY = Object.freeze({
	nativeMediaCaptionTracks: Object.freeze({
		status: 'available',
		formats: ['webvtt'],
		supportedMedia: ['audio', 'video'],
		representation: 'native-pptx-track-part',
		createsSlideTextShapes: false,
	}),
	nonNativeCaptionOverlays: Object.freeze({
		status: 'removed',
	}),
})

// Dry-run warnings for narration cues that animate nothing: no target, or a
// target that names no object on the slide.
export function narrationCueLedgerWarnings(ledger = {}) {
	const warnings = []
	for (const slide of ledger.slides || []) {
		if (slide.untargetedCueIds?.length) warnings.push({
			code: 'NARRATION_CUE_TARGET_MISSING',
			severity: 'warning',
			slideId: slide.slideId,
			message: `Narration cue(s) ${slide.untargetedCueIds.join(', ')} on ${slide.slideId} have no target, so they mark a time but animate nothing.`,
			fix: 'Set each cue.target to a content[].name on the same slide (with type/effect), or remove the cue.',
		})
		if (slide.unresolvedTargets?.length) warnings.push({
			code: 'NARRATION_CUE_TARGET_MISSING',
			severity: 'warning',
			slideId: slide.slideId,
			message: `Narration cue target(s) ${slide.unresolvedTargets.join(', ')} on ${slide.slideId} match no content[].name on that slide.`,
			fix: 'Point cue.target at a stable content[].name on the same slide, or remove the cue.',
		})
	}
	return warnings
}
