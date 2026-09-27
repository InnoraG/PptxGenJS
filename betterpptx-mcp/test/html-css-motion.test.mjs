import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCssKeyframes, resolveCssMotion, htmlCssMotionUnmappedFindings } from '../ir/html-css-motion.mjs'

test('exact PowerPoint animation-name is used as-is', () => {
	const mapped = resolveCssMotion({ animationName: 'wipe', css: { 'animation-duration': '400ms' } })
	assert.equal(mapped.effect, 'wipe')
	assert.equal(mapped.mappingSource, 'powerpoint-effect-name')
})

test('ordinary CSS tokens infer native families', () => {
	assert.equal(resolveCssMotion({ classNames: ['fade-in'] }).effect, 'fade')
	const rise = resolveCssMotion({ classNames: ['slide-up'] })
	assert.equal(rise.effect, 'float')
	assert.equal(rise.direction, 'fromBottom')
	assert.equal(resolveCssMotion({ classNames: ['zoom-in'] }).effect, 'zoom')
	assert.equal(resolveCssMotion({ classNames: ['pulse'] }).type, 'emphasis')
})

test('@keyframes opacity and translateY infer Float In', () => {
	const keyframes = parseCssKeyframes(`
		@keyframes heroReveal {
			from { opacity: 0; transform: translateY(40px); }
			to { opacity: 1; transform: translateY(0); }
		}
	`)
	const mapped = resolveCssMotion({ animationName: 'heroReveal', keyframes })
	assert.equal(mapped.effect, 'float')
	assert.equal(mapped.direction, 'fromBottom')
	assert.equal(mapped.mappingSource, 'css-keyframes')
})

test('unmapped CSS is an AI resolution finding, not a finished gap', () => {
	const mapped = resolveCssMotion({ animationName: 'atmosphereBlur', css: { animation: 'atmosphereBlur 500ms both' } })
	assert.equal(mapped.unmapped, 'atmosphereBlur')
	const findings = htmlCssMotionUnmappedFindings({
		slides: [{
			id: 'slide-1',
			htmlUnmappedCssMotion: [{ name: 'glow', cssName: 'atmosphereBlur' }],
			content: [{ name: 'glow', kind: 'image' }],
		}],
	})
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'HTML_CSS_MOTION_UNMAPPED')
	assert.equal(findings[0].owner, 'ai-client')
	assert.match(findings[0].fix, /MCP evolution/)
	assert.equal(findings[0].evidence.resolve[2].rank, 3)
	const resolved = htmlCssMotionUnmappedFindings({
		slides: [{
			id: 'slide-1',
			htmlUnmappedCssMotion: [{ name: 'glow', cssName: 'atmosphereBlur' }],
			content: [{ name: 'glow', kind: 'image', animation: { type: 'entrance', effect: 'fade' } }],
		}],
	})
	assert.equal(resolved.length, 0)
})

test('a layer class without animation is not treated as unmapped', () => {
	assert.equal(resolveCssMotion({ classNames: ['layer', 'text-shape'] }), null)
})
