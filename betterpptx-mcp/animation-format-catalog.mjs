// Public/native animation contract.  The registry remains the native source of
// truth in the library; this list is the stable, implementation-free surface
// exposed to JSON-spec clients so a gallery tile never becomes a ceiling.
export const ANIMATION_FORMAT_TYPES = Object.freeze(['entrance', 'emphasis', 'exit', 'motion', 'media'])

export const ANIMATION_FORMAT_EFFECTS = Object.freeze([
	'arrive', 'turntable', 'swing', 'jumpandturn', 'leave', 'playscene',
	'appear', 'blinds', 'box', 'fly', 'checkerboard', 'circle', 'crawl', 'diamond', 'dissolve', 'fade', 'flashOnce', 'peek', 'plus', 'randomEffects', 'strips', 'randomBars', 'wedge', 'swivel', 'wheel', 'spiral', 'split', 'pinwheel', 'swish', 'wipe', 'zoom', 'boomerang', 'bounce', 'colorReveal', 'credits', 'easeIn', 'thread', 'float', 'lightspeed', 'riseup', 'floatIn', 'floatOut', 'floatoutentrance', 'floatinexit', 'curveUp', 'curveDown', 'glide', 'spinner', 'shimmer', 'thinLine', 'whip', 'fadedSwivel', 'sling', 'fadedZoom', 'zip', 'flip', 'fold', 'drop', 'stretch', 'expand', 'stretchy', 'centerrevolve', 'growandturn', 'unfold',
	'changefillcolor', 'changefont', 'changefontcolor', 'changefontsize', 'changefontstyle', 'growshrink', 'changelinecolor', 'spin', 'transparency', 'boldflash', 'blast', 'boldreveal', 'brushcolor', 'brushonunderline', 'underline', 'colorblend', 'objectcolor', 'colorwave', 'complementarycolor', 'complementarycolor2', 'contrastingcolor', 'darken', 'desaturate', 'pulse', 'flicker', 'growwithcolor', 'lighten', 'styleemphasis', 'teeter', 'verticalgrow', 'wave',
	'mediaplay', 'mediapause', 'mediastop', 'play', 'pause', 'togglepause', 'stop',
	'circlepath', 'righttriangle', 'diamondpath', 'hexagon', '5pointstar', 'crescentmoon', 'squarepath', 'trapezoid', 'heart', 'octagon', '6pointstar', 'football', 'equaltriangle', 'parallelogram', 'pentagon', '4pointstar', '8pointstar', 'teardrop', 'pointystar', 'curvedsquare', 'curvedx', 'verticalfigure8', 'curvystar', 'loopdeloop', 'buzzsaw', 'horizontalfigure8', 'peanut', 'figure8four', 'neutron', 'swoosh', 'bean', 'pluspath', 'invertedtriangle', 'invertedsquare', 'left', 'turnright', 'arcdown', 'zigzag', 'scurve2', 'sinewave', 'bounceleft', 'down', 'turnup', 'arcup', 'heartbeat', 'spiralright', 'wavepath', 'curvyleft', 'diagonaldownright', 'turndown', 'arcleft', 'funnel', 'spring', 'bounceright', 'spiralleft', 'diagonalupright', 'turnupright', 'arcright', 'scurve1', 'decayingwave', 'curvyright', 'stairsdown', 'up', 'right',
])

export const ANIMATION_FORMAT_MOTION_PATHS = Object.freeze([
	'circlepath', 'righttriangle', 'diamondpath', 'hexagon', '5pointstar', 'crescentmoon', 'squarepath', 'trapezoid', 'heart', 'octagon', '6pointstar', 'football', 'equaltriangle', 'parallelogram', 'pentagon', '4pointstar', '8pointstar', 'teardrop', 'pointystar', 'curvedsquare', 'curvedx', 'verticalfigure8', 'curvystar', 'loopdeloop', 'buzzsaw', 'horizontalfigure8', 'peanut', 'figure8four', 'neutron', 'swoosh', 'bean', 'pluspath', 'invertedtriangle', 'invertedsquare', 'left', 'turnright', 'arcdown', 'zigzag', 'scurve2', 'sinewave', 'bounceleft', 'down', 'turnup', 'arcup', 'heartbeat', 'spiralright', 'wavepath', 'curvyleft', 'diagonaldownright', 'turndown', 'arcleft', 'funnel', 'spring', 'bounceright', 'spiralleft', 'diagonalupright', 'turnupright', 'arcright', 'scurve1', 'decayingwave', 'curvyright', 'stairsdown', 'up', 'right',
])

export const ANIMATION_FORMAT_DIRECTIONS = Object.freeze([
	'fromTop', 'fromBottom', 'fromLeft', 'fromRight', 'fromTopLeft', 'fromTopRight', 'fromBottomLeft', 'fromBottomRight',
	'toTop', 'toBottom', 'toLeft', 'toRight', 'toTopLeft', 'toTopRight', 'toBottomLeft', 'toBottomRight',
	'in', 'out', 'horizontal', 'vertical', 'inSlightly', 'outSlightly', 'inBottom', 'outBottom', 'inCenter', 'outCenter',
	'objectCenter', 'slideCenter', 'clockwise', 'counterclockwise', 'right', 'left', 'up', 'down',
])

export const ANIMATION_FORMAT_PARAMETERS = Object.freeze([
	{ id: 'type', type: 'discrete', valueType: 'string', canonical: [...ANIMATION_FORMAT_TYPES], semanticPath: 'content[].animation.type', serializer: 'native p:timing/p:par/p:cTn/@presetClass', reset: 'set animation to null or remove the animation step' },
	{ id: 'effect', type: 'discrete', valueType: 'string', canonical: [...ANIMATION_FORMAT_EFFECTS], semanticPath: 'content[].animation.effect', serializer: 'native p:cTn/@presetID plus p:animEffect/p:animMotion', reset: 'set effect to null to use the type default' },
	{ id: 'duration', type: 'continuous', valueType: 'number', minimum: 0, maximum: 86400000, default: null, step: 1, unit: 'milliseconds', aliases: ['durationMs'], semanticPath: 'content[].animation.duration', serializer: 'native p:cTn/@dur', reset: 'set duration/durationMs to null to restore the effect default' },
	{ id: 'delay', type: 'continuous', valueType: 'number', minimum: 0, maximum: 86400000, default: 0, step: 1, unit: 'milliseconds', aliases: ['delayMs'], semanticPath: 'content[].animation.delay', serializer: 'native p:stCondLst/p:cond/@delay', reset: 'set delay/delayMs to null to start at the trigger time' },
	{ id: 'trigger', type: 'discrete', valueType: 'string', canonical: ['onClick', 'withPrevious', 'afterPrevious'], default: 'onClick', semanticPath: 'content[].animation.trigger', serializer: 'native p:par sequencing/timing', reset: 'set trigger to null to restore onClick' },
	{ id: 'direction', type: 'discrete', valueType: 'string', canonical: [...ANIMATION_FORMAT_DIRECTIONS], semanticPath: 'content[].animation.direction', serializer: 'native presetSubtype or animMotion direction', reset: 'set direction to null to restore the effect default' },
	{ id: 'sequence', type: 'discrete', valueType: 'string', canonical: ['asOneObject', 'allAtOnce', 'byParagraph'], default: 'asOneObject', semanticPath: 'content[].animation.sequence', serializer: 'native p:bldLst/p:bldP', reset: 'set sequence to null to animate the object as one unit' },
	{ id: 'repeatCount', type: 'continuous-or-discrete', valueType: 'integer-or-indefinite', minimum: 1, maximum: 1000, canonical: ['indefinite'], semanticPath: 'content[].animation.repeatCount', serializer: 'native owner p:cTn/@repeatCount (count × 1000 or indefinite)', capabilityStatus: 'native-structured-generic', reset: 'set repeatCount to null to restore one play', limitation: 'Generic registry builders serialize the typed count on every outer owner timing node; PowerPoint retains the native value through SaveCopyAs/reopen.' },
	{ id: 'autoReverse', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'content[].animation.autoReverse', serializer: 'native owner p:cTn/@autoRev (true=1; false/default omitted)', capabilityStatus: 'native-structured-generic', reset: 'set autoReverse to null to restore one-way playback', limitation: 'Generic registry builders apply true to every outer owner timing node; false/null use PowerPoint canonical omission and nested effect-internal autoRev is preserved.' },
	{ id: 'motionPath', type: 'discrete-or-custom', valueType: 'string', canonical: [...ANIMATION_FORMAT_MOTION_PATHS], semanticPath: 'content[].animation.motionPath', serializer: 'native p:animMotion/@path or registry path', reset: 'set motionPath and motionPathData to null to restore no motion path' },
	{ id: 'motionPathData', type: 'structured', valueType: 'DrawingML-path-string', maximumLength: 4096, semanticPath: 'content[].animation.motionPathData', serializer: 'native p:animMotion/@path', reset: 'set motionPathData to null to restore the selected preset path' },
	{ id: 'motionPathCoordinateSpace', type: 'discrete', valueType: 'string', canonical: ['slide', 'powerpoint'], default: 'slide', applicability: ['motion'], semanticPath: 'content[].animation.motionPathCoordinateSpace', serializer: 'deterministic slide-space to native PowerPoint path lowering', reset: 'set motionPathCoordinateSpace to null or slide to restore public slide-space authoring', limitation: 'powerpoint is an explicit escape hatch for callers that already provide native coordinates; it does not change semantic direction.' },
	{ id: 'motionEasing', type: 'discrete', valueType: 'string', canonical: ['smooth', 'linear'], default: 'smooth', applicability: ['motion'], semanticPath: 'content[].animation.motionEasing', serializer: 'native path owner acceleration/deceleration', reset: 'set motionEasing to null to restore smooth interpolation', limitation: 'Linear interpolation is required when several timed segments must follow a measured trajectory without easing at every sample.' },
	{ id: 'scale', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: null, step: 0.001, unit: 'percent-or-multiplier', semanticPath: 'content[].animation.scale', serializer: 'native p:animScale', reset: 'set scale to null to restore the effect default' },
	{ id: 'scaleX', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: null, step: 0.00001, unit: 'multiplier', applicability: ['growshrink'], semanticPath: 'content[].animation.scaleX', serializer: 'native p:animScale/p:by/@x (factor × 100000)', reset: 'set scaleX to null to use scale, or the effect default when scale is absent', limitation: '1 preserves width; non-uniform scaling of a text-bearing object stretches its lettering. Target geometry and text separately to preserve glyph proportions.' },
	{ id: 'scaleY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: null, step: 0.00001, unit: 'multiplier', applicability: ['growshrink'], semanticPath: 'content[].animation.scaleY', serializer: 'native p:animScale/p:by/@y (factor × 100000)', reset: 'set scaleY to null to use scale, or the effect default when scale is absent', limitation: '1 preserves height; independent axes do not morph custom-geometry path points.' },
	{ id: 'rotation', type: 'continuous', valueType: 'number', minimum: -36000, maximum: 36000, default: null, step: 0.001, unit: 'degrees', semanticPath: 'content[].animation.rotation', serializer: 'native p:animRot', reset: 'set rotation to null to restore the effect default' },
	{ id: 'clockwise', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'content[].animation.clockwise', serializer: 'native effect direction/rotation carrier', reset: 'set clockwise to null to restore the effect default' },
	{ id: 'color', type: 'color', valueType: 'hex', semanticPath: 'content[].animation.color', serializer: 'native p:animClr', reset: 'set color to null to restore the target color' },
	{ id: 'shapeType', type: 'discrete', valueType: 'string', canonical: ['circle', 'box', 'diamond', 'plus', 'wedge'], semanticPath: 'content[].animation.shapeType', serializer: 'native effect shape subtype', reset: 'set shapeType to null to restore the effect default' },
	{ id: 'spokes', type: 'continuous', valueType: 'integer', minimum: 1, maximum: 64, default: 1, step: 1, unit: 'wheel spokes', applicability: ['wheel'], semanticPath: 'content[].animation.spokes', serializer: 'native wheel presetSubtype', reset: 'set spokes to null to restore the effect default' },
	{ id: 'amount', type: 'continuous-or-discrete', valueType: 'number-or-string', minimum: -1000, maximum: 1000, semanticPath: 'content[].animation.amount', serializer: 'native effect-specific amount carrier', reset: 'set amount to null to restore the effect default' },
	{ id: 'mediaCommand', type: 'structured', valueType: 'command-string', semanticPath: 'content[].animation.mediaCommand', serializer: 'native p:cmd', reset: 'set mediaCommand to null to restore the media effect default' },
	{ id: 'usesVisibility', type: 'discrete', valueType: 'boolean', semanticPath: 'content[].animation.usesVisibility', serializer: 'native p:set visibility carrier', reset: 'set usesVisibility to null to use the registry default' },
])

const NUMERIC_RULES = Object.freeze(Object.fromEntries(ANIMATION_FORMAT_PARAMETERS.filter(item => item.minimum !== undefined && item.id !== 'repeatCount').map(item => [item.id, item])))
const ENUM_RULES = Object.freeze(Object.fromEntries(ANIMATION_FORMAT_PARAMETERS.filter(item => Array.isArray(item.canonical) && item.id !== 'repeatCount').map(item => [item.id, item.canonical])))
const EFFECT_ALIASES = Object.freeze({ fadein: 'fade', fadeout: 'fade', flyin: 'fly', flyout: 'fly', zoomin: 'zoom', zoomout: 'zoom', grow: 'verticalgrow', shrink: 'verticalgrow', flash: 'flashonce', floatin: 'floatin', floatout: 'floatout' })
const EFFECTS_BY_KEY = Object.freeze(Object.fromEntries(ANIMATION_FORMAT_EFFECTS.map(effect => [effect.toLowerCase().replace(/[\s-]+/g, ''), effect])))
const PATHS_BY_KEY = Object.freeze(Object.fromEntries(ANIMATION_FORMAT_MOTION_PATHS.map(pathName => [pathName.toLowerCase().replace(/[\s-]+/g, ''), pathName])))

function finiteNumber(value, rule, path) {
	if (value === undefined || value === null) return
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (value < rule.minimum || value > rule.maximum) throw new Error(`${path} must be between ${rule.minimum} and ${rule.maximum}.`)
	if (rule.step && Math.abs((value - (rule.minimum || 0)) / rule.step - Math.round((value - (rule.minimum || 0)) / rule.step)) > 1e-7) throw new Error(`${path} must use a ${rule.step}-unit step.`)
}

export function validateAnimationFormatOptions(value, path = 'animation') {
	if (value === undefined || value === null) return value
	if (Array.isArray(value)) return value.map((item, index) => validateAnimationFormatOptions(item, `${path}[${index}]`))
	if (typeof value !== 'object') throw new Error(`${path} must be an object or null.`)
	const out = { ...value }
	if (out.duration === undefined && out.durationMs !== undefined) out.duration = out.durationMs
	if (out.delay === undefined && out.delayMs !== undefined) out.delay = out.delayMs
	delete out.durationMs; delete out.delayMs
	if (out.effect !== undefined && out.effect !== null) {
		if (typeof out.effect !== 'string' || !out.effect.trim()) throw new Error(`${path}.effect must be a non-empty native effect name.`)
		const key = out.effect.toLowerCase().replace(/[\s-]+/g, '')
		const canonical = EFFECTS_BY_KEY[EFFECT_ALIASES[key] || key]
		if (!canonical) throw new Error(`${path}.effect must be a native effect from the animation catalog.`)
		out.effect = canonical
	}
	if (out.motionPath !== undefined && out.motionPath !== null) {
		if (typeof out.motionPath !== 'string' || !out.motionPath.trim()) throw new Error(`${path}.motionPath must be a native motion-path name.`)
		const canonicalPath = PATHS_BY_KEY[out.motionPath.toLowerCase().replace(/[\s-]+/g, '')]
		if (!canonicalPath && out.motionPathData === undefined) throw new Error(`${path}.motionPath must be one of ${ANIMATION_FORMAT_MOTION_PATHS.join(', ')}.`)
		if (canonicalPath) out.motionPath = canonicalPath
	}
	for (const [key, rule] of Object.entries(NUMERIC_RULES)) finiteNumber(out[key], rule, `${path}.${key}`)
	if ((out.scaleX != null || out.scaleY != null) && out.effect !== 'growshrink') throw new Error(`${path}.scaleX/scaleY apply only to the native growshrink effect.`)
	if (out.motionEasing != null && out.type !== 'motion') throw new Error(`${path}.motionEasing applies only to motion-path animations.`)
	if (out.motionPathCoordinateSpace != null && out.type !== 'motion') throw new Error(`${path}.motionPathCoordinateSpace applies only to motion-path animations.`)
	for (const [key, values] of Object.entries(ENUM_RULES)) if (out[key] !== undefined && out[key] !== null && !(key === 'motionPath' && out.motionPathData != null) && !values.includes(out[key])) throw new Error(`${path}.${key} must be one of ${values.join(', ')}.`)
	if (out.repeatCount !== undefined && out.repeatCount !== null && out.repeatCount !== 'indefinite' && (!Number.isInteger(out.repeatCount) || out.repeatCount < 1 || out.repeatCount > 1000)) throw new Error(`${path}.repeatCount must be an integer between 1 and 1000 or indefinite.`)
	if (out.autoReverse !== undefined && out.autoReverse !== null && typeof out.autoReverse !== 'boolean') throw new Error(`${path}.autoReverse must be a boolean or null.`)
	if (out.motionPathData !== undefined && out.motionPathData !== null && (typeof out.motionPathData !== 'string' || out.motionPathData.length > 4096)) throw new Error(`${path}.motionPathData must be a path string of at most 4096 characters.`)
	if (out.mediaCommand !== undefined && out.mediaCommand !== null) {
		if (typeof out.mediaCommand !== 'string' || out.mediaCommand.length > 512) throw new Error(`${path}.mediaCommand must be a command string of at most 512 characters.`)
		const command = out.mediaCommand.trim()
		if (/^togglepause$/i.test(command)) out.mediaCommand = 'togglePause'
		else if (/^stop$/i.test(command)) out.mediaCommand = 'stop'
		else {
			const play = /^playfrom\(\s*(\d+(?:\.\d+)?)\s*\)$/i.exec(command)
			if (!play) throw new Error(`${path}.mediaCommand must be togglePause, stop, or playFrom(non-negative-seconds).`)
			const seconds = Number(play[1])
			if (!Number.isFinite(seconds) || seconds > 86400) throw new Error(`${path}.mediaCommand playFrom seconds must be between 0 and 86400.`)
			out.mediaCommand = `playFrom(${Number.isInteger(seconds) ? `${seconds}.0` : String(seconds)})`
		}
	}
	if (out.color !== undefined && out.color !== null && (typeof out.color !== 'string' || !/^#?[0-9a-f]{6}$/i.test(out.color))) throw new Error(`${path}.color must be a 6-digit RGB hex color.`)
	return out
}
