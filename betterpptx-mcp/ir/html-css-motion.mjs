/**
 * Global CSS → native PowerPoint object-animation lowering.
 * Not a per-deck class list. Any HTML original can use ordinary CSS animation
 * names, class tokens, and @keyframes; the engine infers PowerPoint effects.
 */

const POWERPOINT_EFFECTS = new Set([
	'appear', 'blinds', 'bounce', 'box', 'checkerboard', 'circle', 'crawl', 'credits',
	'diamond', 'dissolve', 'drop', 'expand', 'fade', 'fadedswivel', 'fadedzoom', 'flashonce',
	'flip', 'float', 'floatin', 'floatout', 'fly', 'fold', 'glide', 'growandturn', 'growshrink',
	'lightspeed', 'peek', 'pinwheel', 'plus', 'pulse', 'randombars', 'riseup', 'split', 'spin',
	'spiral', 'stretch', 'strips', 'swivel', 'teeter', 'unfold', 'verticalgrow', 'wedge', 'wheel',
	'whip', 'wipe', 'zip', 'zoom',
])

const DIRECTION_FROM = {
	left: 'fromLeft',
	right: 'fromRight',
	top: 'fromTop',
	up: 'fromBottom',
	bottom: 'fromBottom',
	down: 'fromTop',
	fromleft: 'fromLeft',
	fromright: 'fromRight',
	fromtop: 'fromTop',
	frombottom: 'fromBottom',
}

const TOKEN_MOTION = Object.freeze({
	fade: { type: 'entrance', effect: 'fade' },
	appear: { type: 'entrance', effect: 'appear' },
	dissolve: { type: 'entrance', effect: 'dissolve' },
	fly: { type: 'entrance', effect: 'fly' },
	slide: { type: 'entrance', effect: 'fly' },
	slideup: { type: 'entrance', effect: 'float', direction: 'fromBottom' },
	slidedown: { type: 'entrance', effect: 'fly', direction: 'fromTop' },
	slideleft: { type: 'entrance', effect: 'fly', direction: 'fromLeft' },
	slideright: { type: 'entrance', effect: 'fly', direction: 'fromRight' },
	rise: { type: 'entrance', effect: 'float', direction: 'fromBottom' },
	riseup: { type: 'entrance', effect: 'riseup' },
	float: { type: 'entrance', effect: 'float', direction: 'fromBottom' },
	floatin: { type: 'entrance', effect: 'float', direction: 'fromBottom' },
	drop: { type: 'entrance', effect: 'drop' },
	wipe: { type: 'entrance', effect: 'wipe' },
	zoom: { type: 'entrance', effect: 'zoom' },
	zoomin: { type: 'entrance', effect: 'zoom' },
	scale: { type: 'entrance', effect: 'fadedzoom' },
	grow: { type: 'entrance', effect: 'fadedzoom' },
	expand: { type: 'entrance', effect: 'expand' },
	pop: { type: 'entrance', effect: 'fadedzoom' },
	bounce: { type: 'entrance', effect: 'bounce' },
	swivel: { type: 'entrance', effect: 'swivel' },
	spin: { type: 'emphasis', effect: 'spin' },
	flip: { type: 'entrance', effect: 'flip' },
	fold: { type: 'entrance', effect: 'fold' },
	unfold: { type: 'entrance', effect: 'unfold' },
	split: { type: 'entrance', effect: 'split' },
	peek: { type: 'entrance', effect: 'peek' },
	crawl: { type: 'entrance', effect: 'crawl' },
	blinds: { type: 'entrance', effect: 'blinds' },
	checker: { type: 'entrance', effect: 'checkerboard' },
	checkerboard: { type: 'entrance', effect: 'checkerboard' },
	wheel: { type: 'entrance', effect: 'wheel' },
	spiral: { type: 'entrance', effect: 'spiral' },
	stretch: { type: 'entrance', effect: 'stretch' },
	wipein: { type: 'entrance', effect: 'wipe' },
	typewriter: { type: 'entrance', effect: 'appear' },
	pulse: { type: 'emphasis', effect: 'pulse' },
	throb: { type: 'emphasis', effect: 'pulse' },
	beat: { type: 'emphasis', effect: 'pulse' },
	wiggle: { type: 'emphasis', effect: 'teeter' },
	shake: { type: 'emphasis', effect: 'teeter' },
	teeter: { type: 'emphasis', effect: 'teeter' },
	flicker: { type: 'emphasis', effect: 'flicker' },
	blink: { type: 'emphasis', effect: 'flicker' },
	shrink: { type: 'emphasis', effect: 'growshrink' },
	growshrink: { type: 'emphasis', effect: 'growshrink' },
	exit: { type: 'exit', effect: 'fade' },
	leave: { type: 'exit', effect: 'fade' },
	hide: { type: 'exit', effect: 'fade' },
	disappear: { type: 'exit', effect: 'appear' },
	fadeout: { type: 'exit', effect: 'fade' },
	flyout: { type: 'exit', effect: 'fly' },
	zoomout: { type: 'exit', effect: 'zoom' },
})

export const HTML_CSS_MOTION_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.html-css-motion.v1',
	rule: 'The engine infers native PowerPoint object animation from ordinary CSS: animation-name, class tokens, animation-delay, animation-duration, animation-iteration-count, and @keyframes opacity/transform. Deck-specific class names are not required. An animation-name that already is a PowerPoint effect is used as-is. Call help.tool_recipe surface:"animation" for the full native object-animation vocabulary. Presenter motion IDs from authoring.catalog are a different vocabulary.',
	cssSignals: Object.freeze([
		'animation-name',
		'animation-delay',
		'animation-duration',
		'animation-iteration-count',
		'@keyframes opacity',
		'@keyframes transform translate/scale/rotate',
		'class tokens such as fade, fly, rise, wipe, zoom, bounce, pulse',
	]),
	inference: Object.freeze({
		opacityIncrease: { type: 'entrance', effect: 'fade' },
		opacityDecrease: { type: 'exit', effect: 'fade' },
		translateFromBottom: { type: 'entrance', effect: 'float', direction: 'fromBottom' },
		translateFromTop: { type: 'entrance', effect: 'fly', direction: 'fromTop' },
		translateFromLeft: { type: 'entrance', effect: 'fly', direction: 'fromLeft' },
		translateFromRight: { type: 'entrance', effect: 'fly', direction: 'fromRight' },
		scaleUp: { type: 'entrance', effect: 'zoom' },
		scaleUpWithFade: { type: 'entrance', effect: 'fadedzoom' },
		rotateIn: { type: 'entrance', effect: 'swivel' },
		infinitePulse: { type: 'emphasis', effect: 'pulse' },
		infiniteWiggle: { type: 'emphasis', effect: 'teeter' },
		infiniteSpin: { type: 'emphasis', effect: 'spin' },
	}),
	nativeObjectAnimation: Object.freeze({
		types: Object.freeze(['entrance', 'emphasis', 'exit', 'motion']),
		triggers: Object.freeze(['withPrevious', 'afterPrevious', 'onClick']),
		timing: Object.freeze(['delay milliseconds', 'duration milliseconds']),
		entranceFamilies: Object.freeze({
			fade: Object.freeze(['fade', 'appear', 'dissolve']),
			fly: Object.freeze(['fly', 'float', 'peek', 'crawl', 'riseup', 'drop']),
			wipe: Object.freeze(['wipe', 'split', 'blinds', 'checkerboard', 'strips', 'wheel', 'wedge']),
			zoom: Object.freeze(['zoom', 'fadedzoom', 'expand', 'growandturn']),
			turn: Object.freeze(['swivel', 'fadedswivel', 'flip', 'fold', 'unfold', 'spiral']),
			energy: Object.freeze(['bounce', 'pinwheel', 'whip', 'zip', 'lightspeed']),
		}),
		emphasisFamilies: Object.freeze({
			attention: Object.freeze(['pulse', 'teeter', 'flicker', 'spin', 'growshrink']),
		}),
		authoring: 'Put remaining or richer motion on content[].animation or slides[].timeline after inspecting help.tool_recipe surface:"animation".',
		unmapped: Object.freeze({
			owner: 'ai-client',
			rule: 'Unmapped CSS motion is an open authoring finding. The AI must resolve it. The engine will not invent a PowerPoint effect or treat the gap as finished.',
			resolve: Object.freeze([
				{
					rank: 1,
					when: 'The intended motion is a native PowerPoint object effect',
					action: 'Inspect help.tool_recipe surface:"animation", then put { type, effect, direction, trigger, delay, duration } on that object\'s content[].animation or slides[].timeline. Prefer an exact registry name.',
				},
				{
					rank: 2,
					when: 'The CSS can be rewritten to inferable signals',
					action: 'Change animation-name, class tokens, or @keyframes to opacity/translate/scale/rotate, or to an exact PowerPoint effect name, then rerun dry-run.',
				},
				{
					rank: 3,
					when: 'No native object effect can express the designed motion',
					action: 'Do not omit the motion. Ask the user to request MCP evolution (new inference, a new native effect family, or a documented fallback). Isolate as a separate image only if that visual asset already exists.',
				},
			]),
			mcpEvolution: 'If the native PowerPoint vocabulary still cannot express the designed motion, request an MCP capability change rather than shipping without the motion.',
		}),
		examples: Object.freeze([
			{ css: 'fade, fade-in, animation-name:fade', native: { type: 'entrance', effect: 'fade' } },
			{ css: 'rise, slide-up, translateY from below', native: { type: 'entrance', effect: 'float', direction: 'fromBottom' } },
			{ css: 'fly / from-left / translateX', native: { type: 'entrance', effect: 'fly', direction: 'fromLeft' } },
			{ css: 'wipe, animation-name:wipe', native: { type: 'entrance', effect: 'wipe' } },
			{ css: 'zoom, zoom-in, scale 0→1', native: { type: 'entrance', effect: 'zoom' } },
			{ css: 'scale + fade, fadedzoom', native: { type: 'entrance', effect: 'fadedzoom' } },
			{ css: 'bounce, swivel, split, peek, blinds, wheel', native: 'same-named PowerPoint entrance effect' },
			{ css: 'pulse / infinite opacity or scale', native: { type: 'emphasis', effect: 'pulse' } },
			{ css: 'any exact PowerPoint effect name as animation-name', native: 'used as-is' },
		]),
	}),
})

const SKIP_TOKENS = new Set([
	'anim', 'animation', 'css', 'in', 'the', 'a', 'on', 'to', 'from',
	'slides', 'layer', 'layers', 'canvas', 'box', 'text', 'shape', 'type',
	'card', 'native', 'effect', 'background', 'content', 'image', 'vector',
])

function compactName(value) {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function tokenizeCssName(value) {
	return String(value || '')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(token => token && !SKIP_TOKENS.has(token))
}

function parseCssTime(value) {
	const raw = String(value || '').trim()
	if (!raw) return null
	const ms = raw.match(/^(-?[\d.]+)\s*ms$/i)
	if (ms) return Math.max(0, Math.round(Number(ms[1])))
	const sec = raw.match(/^(-?[\d.]+)\s*s$/i)
	if (sec) return Math.max(0, Math.round(Number(sec[1]) * 1000))
	return null
}

function parseNumber(value) {
	const n = Number.parseFloat(String(value || ''))
	return Number.isFinite(n) ? n : null
}

function extractBalanced(source, openIndex) {
	let depth = 0
	for (let i = openIndex; i < source.length; i += 1) {
		const ch = source[i]
		if (ch === '{') depth += 1
		else if (ch === '}') {
			depth -= 1
			if (depth === 0) return source.slice(openIndex + 1, i)
		}
	}
	return ''
}

function parseTransform(value) {
	const text = String(value || '')
	const out = { x: 0, y: 0, scale: null, rotate: null }
	const translate = text.match(/translate\(\s*([^,)]+)(?:\s*,\s*([^)]+))?\)/i)
	if (translate) {
		out.x = parseNumber(translate[1]) || 0
		out.y = parseNumber(translate[2]) || 0
	}
	const tx = text.match(/translateX\(\s*([^)]+)\)/i)
	if (tx) out.x = parseNumber(tx[1]) || 0
	const ty = text.match(/translateY\(\s*([^)]+)\)/i)
	if (ty) out.y = parseNumber(ty[1]) || 0
	const scale = text.match(/scale(?:3d)?\(\s*([^),]+)/i)
	if (scale) out.scale = parseNumber(scale[1])
	const rotate = text.match(/rotate\(\s*([^)]+)\)/i)
	if (rotate) out.rotate = parseNumber(rotate[1])
	return out
}

function parseKeyframeDecls(blob) {
	const decls = {}
	for (const part of String(blob || '').split(';')) {
		const idx = part.indexOf(':')
		if (idx < 0) continue
		decls[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim()
	}
	const transform = parseTransform(decls.transform || '')
	return {
		opacity: decls.opacity != null ? parseNumber(decls.opacity) : null,
		...transform,
	}
}

function stopOffset(label) {
	const raw = String(label || '').toLowerCase()
	if (raw === 'from') return 0
	if (raw === 'to') return 100
	const n = Number.parseFloat(raw)
	return Number.isFinite(n) ? n : null
}

export function stripCssKeyframes(css) {
	let src = String(css || '')
	const re = /@keyframes\s+[A-Za-z_][\w-]*\s*\{/gi
	const ranges = []
	let match
	while ((match = re.exec(src))) {
		const open = match.index + match[0].length - 1
		let depth = 0
		let end = src.length
		for (let i = open; i < src.length; i += 1) {
			if (src[i] === '{') depth += 1
			else if (src[i] === '}') {
				depth -= 1
				if (depth === 0) {
					end = i + 1
					break
				}
			}
		}
		ranges.push([match.index, end])
	}
	for (const [start, end] of ranges.reverse()) src = src.slice(0, start) + src.slice(end)
	return src
}

export function parseCssKeyframes(markup) {
	const src = String(markup || '').replace(/\/\*[\s\S]*?\*\//g, '')
	const out = {}
	const re = /@keyframes\s+([A-Za-z_][\w-]*)\s*\{/gi
	let match
	while ((match = re.exec(src))) {
		const name = match[1]
		const open = match.index + match[0].length - 1
		const body = extractBalanced(src, open)
		const stops = []
		const stopRe = /(from|to|\d+(?:\.\d+)?%)\s*\{([^}]*)\}/gi
		let stop
		while ((stop = stopRe.exec(body))) {
			const offset = stopOffset(stop[1])
			if (offset == null) continue
			stops.push({ offset, ...parseKeyframeDecls(stop[2]) })
		}
		stops.sort((a, b) => a.offset - b.offset)
		out[name.toLowerCase()] = inferMotionFromStops(stops)
	}
	return out
}

function inferMotionFromStops(stops = []) {
	if (stops.length < 2) return null
	const first = stops[0]
	const last = stops[stops.length - 1]
	const fadeIn = first.opacity != null && last.opacity != null && last.opacity - first.opacity >= 0.35
	const fadeOut = first.opacity != null && last.opacity != null && first.opacity - last.opacity >= 0.35
	const dx = (first.x || 0) - (last.x || 0)
	const dy = (first.y || 0) - (last.y || 0)
	const startScale = first.scale
	const endScale = last.scale
	const scaleUp = startScale != null && endScale != null && endScale - startScale >= 0.12
	const rotate = Math.abs((first.rotate || 0) - (last.rotate || 0)) >= 12
	const hasSignal = fadeIn || fadeOut || Math.abs(dy) >= 8 || Math.abs(dx) >= 8 || scaleUp || rotate
	if (!hasSignal) return null
	const type = fadeOut && !fadeIn ? 'exit' : 'entrance'
	let effect = fadeIn || fadeOut ? 'fade' : 'appear'
	let direction
	if (Math.abs(dy) >= 8 || Math.abs(dx) >= 8) {
		if (Math.abs(dy) >= Math.abs(dx)) {
			direction = dy > 0 ? 'fromBottom' : 'fromTop'
			effect = direction === 'fromBottom' && type === 'entrance' ? 'float' : 'fly'
		} else {
			direction = dx > 0 ? 'fromRight' : 'fromLeft'
			effect = 'fly'
		}
		if (type === 'exit') {
			effect = 'fly'
			direction = String(direction).replace(/^from/, 'to')
		}
	}
	if (scaleUp) effect = fadeIn ? 'fadedzoom' : 'zoom'
	if (rotate && !scaleUp && Math.abs(dy) < 8 && Math.abs(dx) < 8) effect = fadeIn ? 'fadedswivel' : 'swivel'
	return {
		type,
		effect,
		...(direction ? { direction } : {}),
		source: 'css-keyframes',
	}
}

function motionFromExactName(name) {
	const compact = compactName(name)
	if (!compact) return null
	if (POWERPOINT_EFFECTS.has(compact)) {
		const type = TOKEN_MOTION[compact]?.type || 'entrance'
		return { type, effect: compact, source: 'powerpoint-effect-name' }
	}
	if (TOKEN_MOTION[compact]) return { ...TOKEN_MOTION[compact], source: 'css-token' }
	return null
}

function motionFromTokens(names = []) {
	const tokens = names.flatMap(tokenizeCssName)
	let mapped = null
	let direction
	let typeOverride
	for (const token of tokens) {
		if (DIRECTION_FROM[token]) direction = DIRECTION_FROM[token]
		if (token === 'out' || token === 'exit' || token === 'leave') typeOverride = 'exit'
		if (token === 'pulse' || token === 'loop' || token === 'hover') typeOverride = typeOverride || 'emphasis'
		const hit = TOKEN_MOTION[token] || motionFromExactName(token)
		if (hit) mapped = hit
	}
	if (!mapped) return null
	const next = { ...mapped }
	if (typeOverride) next.type = typeOverride
	if (direction) next.direction = next.type === 'exit' ? String(direction).replace(/^from/, 'to') : direction
	if (next.type === 'entrance' && next.effect === 'fly' && next.direction === 'fromBottom') next.effect = 'float'
	if (!next.source) next.source = 'css-token'
	return next
}

export function parseAnimationShorthand(value) {
	const text = String(value || '').trim()
	if (!text) return {}
	const times = [...text.matchAll(/(-?[\d.]+m?s)\b/gi)].map(item => item[1])
	const iteration = /\binfinite\b/i.test(text) ? 'infinite' : null
	const name = text.split(/\s+/).find(token => (
		/^[A-Za-z][\w-]*$/.test(token)
		&& !/^(ease|linear|ease-in|ease-out|ease-in-out|both|none|forwards|backwards|infinite|alternate|normal|paused|running|reverse)$/i.test(token)
	))
	return {
		name: name || '',
		duration: times[0] ? parseCssTime(times[0]) : null,
		delay: times[1] ? parseCssTime(times[1]) : null,
		iteration,
	}
}

function applyInfinite(motion, iteration) {
	if (!motion || String(iteration || '').toLowerCase() !== 'infinite') return motion
	if (motion.type === 'emphasis') return motion
	const effect = /spin|rotate|swivel/i.test(motion.effect) ? 'spin'
		: /teeter|wiggle|shake|float/i.test(motion.effect) ? 'teeter'
		: 'pulse'
	return { ...motion, type: 'emphasis', effect, source: motion.source }
}

export function resolveCssMotion({
	classNames = [],
	animationName = '',
	css = {},
	keyframes = {},
} = {}) {
	const shorthand = parseAnimationShorthand(css.animation)
	const splitNames = value => String(value || '').split(',').map(part => part.trim()).filter(Boolean)
	const declaredNames = [animationName, css['animation-name'], shorthand.name].flatMap(splitNames)
	const classListNames = [...classNames].flatMap(splitNames)
	const lookupNames = [...declaredNames, ...classListNames]
	const keyframeHit = lookupNames.map(name => keyframes[String(name).toLowerCase()]).find(Boolean)
	const exact = lookupNames.map(motionFromExactName).find(item => item?.source === 'powerpoint-effect-name')
	const tokens = motionFromTokens(lookupNames) || lookupNames.map(motionFromExactName).find(Boolean)
	let mapped = exact || keyframeHit || tokens || null
	const iteration = css['animation-iteration-count'] || shorthand.iteration
	mapped = applyInfinite(mapped, iteration)
	if (!mapped) {
		return declaredNames.length ? { unmapped: declaredNames[0], mappingSource: 'unmapped' } : null
	}
	const delay = parseCssTime(css['animation-delay']) ?? shorthand.delay
	const duration = parseCssTime(css['animation-duration']) ?? shorthand.duration
	return {
		type: mapped.type || 'entrance',
		effect: mapped.effect,
		...(mapped.direction ? { direction: mapped.direction } : {}),
		source: 'html-css',
		mappingSource: mapped.source || 'css-token',
		cssName: declaredNames[0] || classListNames[0] || mapped.effect,
		...(Number.isFinite(delay) ? { delay } : {}),
		...(Number.isFinite(duration) ? { duration } : {}),
	}
}

export function htmlCssMotionUnmappedFindings(spec = {}) {
	const unmapped = HTML_CSS_MOTION_CONTRACT.nativeObjectAnimation.unmapped
	const findings = []
	for (const slide of spec.slides || []) {
		for (const item of slide?.htmlUnmappedCssMotion || []) {
			const objectName = item?.name || item?.objectName || null
			const block = (slide.content || []).find(entry => (entry?.name || entry?.objectName) === objectName)
			if (block?.animation) continue
			const cssName = item?.cssName || 'unknown'
			findings.push({
				code: 'HTML_CSS_MOTION_UNMAPPED',
				severity: 'warning',
				owner: 'ai-client',
				slideId: slide.id || null,
				objectName,
				message: `CSS animation "${cssName}" on ${objectName || 'an object'} was not inferred into native PowerPoint object animation.`,
				reason: unmapped.rule,
				fix: '1) Inspect help.tool_recipe surface:"animation" and author content[].animation or slides[].timeline with a native effect. 2) Or rewrite the CSS to inferable signals or an exact PowerPoint effect name. 3) If no native effect can express it, request MCP evolution rather than omitting the motion.',
				evidence: {
					cssName,
					objectName,
					slideId: slide.id || null,
					owner: unmapped.owner,
					resolve: unmapped.resolve,
					mcpEvolution: unmapped.mcpEvolution,
				},
				next: {
					recommendedTool: 'betterpptx.help.tool_recipe',
					reason: 'Inspect surface:"animation", author native object animation, or request MCP evolution.',
				},
			})
		}
	}
	return findings
}

export { parseCssTime, tokenizeCssName, POWERPOINT_EFFECTS, TOKEN_MOTION }
