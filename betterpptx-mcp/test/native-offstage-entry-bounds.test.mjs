import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const width = 10, height = 6

function fixture({ frame = { x: 2, y: -1.1, w: 2, h: 1 }, destination = { x: 2, y: 2 }, effect = 'fade', duration = 500 } = {}) {
	const pptx = new PptxGenJS()
	pptx.defineLayout({ name: 'ENTRY_TEST', width, height })
	pptx.layout = 'ENTRY_TEST'
	const slide = pptx.addSlide()
	slide.addShape('ellipse', { objectName: 'arbitrary-orbit', ...frame, fill: { color: '557799' } })
	const shape = slide._slideObjects.at(-1)
	slide.addAnimation(shape, { type: 'entrance', effect, trigger: 'withPrevious', delay: 800, duration: effect === 'appear' ? 1 : 300 })
	slide.addAnimation(shape, {
		type: 'motion', effect: 'down', trigger: 'withPrevious', delay: 800, duration,
		motionPathData: `M 0 0 L ${((destination.x - frame.x) / width).toFixed(9)} ${((destination.y - frame.y) / height).toFixed(9)} E`,
	})
	return { pptx, slide, shape, entrance: slide._animations[0], motion: slide._animations[1] }
}

function boundsResult(pptx) { return pptx.validate({ mode: 'strict', checks: ['bounds', 'dimensions', 'animations'] }) }

for (const [direction, frame] of [
	['left', { x: -2.1, y: 2, w: 2, h: 1 }],
	['right', { x: 10.1, y: 2, w: 2, h: 1 }],
	['top', { x: 2, y: -1.1, w: 2, h: 1 }],
	['bottom', { x: 2, y: 6.1, w: 2, h: 1 }],
	['diagonal', { x: -2.1, y: -1.1, w: 2, h: 1 }],
]) test(`automatic native path proves a complete arbitrary-shape entry from ${direction}`, () => {
	const { pptx } = fixture({ frame })
	const result = boundsResult(pptx)
	assert.equal(result.valid, true, JSON.stringify(result.issues))
})

test('one-millisecond appear staging and later independent travel preserve the entry proof', () => {
	const { pptx, slide, shape } = fixture({ effect: 'appear', duration: 1 })
	slide.addAnimation(shape, { type: 'motion', effect: 'right', trigger: 'withPrevious', delay: 2000, duration: 750, motionPathData: 'M 0 0.516666667 L 0.2 0.516666667 E' })
	const result = boundsResult(pptx)
	assert.equal(result.valid, true, JSON.stringify(result.issues))
})

for (const [name, change] of [
	['missing entrance', f => { f.slide._animations.splice(0, 1) }],
	['missing motion', f => { f.slide._animations.splice(1, 1) }],
	['interactive entrance', f => { f.entrance.animation.trigger = 'onClick' }],
	['relative motion timing', f => { f.motion.animation.trigger = 'afterPrevious' }],
	['different entrance delay', f => { f.entrance.animation.delay = 799 }],
	['fractional duration', f => { f.motion.animation.duration = 0.5 }],
	['zero duration', f => { f.motion.animation.duration = 0 }],
	['nonfinite duration', f => { f.motion.animation.duration = Infinity }],
	['auto reverse', f => { f.motion.animation.autoReverse = true }],
	['loop', f => { f.motion.animation.loop = true }],
	['repeat', f => { f.motion.animation.repeatCount = 2 }],
	['indefinite repeat', f => { f.motion.animation.repeatCount = 'indefinite' }],
	['repeat duration', f => { f.motion.animation.repeatDur = 1000 }],
	['entrance repeat', f => { f.entrance.animation.repeatCount = 2 }],
	['no visibility setter', f => { f.entrance.animation.usesVisibility = false }],
	['complex path', f => { f.motion.animation.motionPathData = 'M 0 0 C 0 1 1 1 1 0 E' }],
	['multiple segments', f => { f.motion.animation.motionPathData = 'M 0 0 L 0 0.5 L 0 0.6 E' }],
	['nonzero path origin', f => { f.motion.animation.motionPathData = 'M 0 0.1 L 0 0.5 E' }],
	['nonfinite path', f => { f.motion.animation.motionPathData = 'M 0 0 L 0 Infinity E' }],
	['invalid numeric literal', f => { f.motion.animation.motionPathData = 'M 0 0 L 0 0x1 E' }],
	['offstage destination', f => { f.motion.animation.motionPathData = 'M 0 0 L 0 -0.5 E' }],
	['partial destination', f => { f.motion.animation.motionPathData = 'M 0 0 L 0 0.1 E' }],
	['different target object', f => { f.motion.target = { ...f.shape } }],
	['different target identity', f => { f.motion.shapeId = 999 }],
	['changed starting frame', f => { f.shape.options.y = -7 }],
	['conflicting initial motion', f => { f.slide._animations.push({ ...f.motion, animation: { ...f.motion.animation, motionPathData: 'M 0 0 L 0.2 0 E' } }) }],
]) test(`${name} cannot excuse an offstage object`, () => {
	const f = fixture()
	change(f)
	const result = boundsResult(f.pptx)
	assert.equal(result.valid, false)
	assert.ok(result.issues.some(issue => issue.code === 'ELEMENT_OFF_SLIDE_TOP'), JSON.stringify(result.issues))
})

test('partial initial overflow continues through the ordinary strict bounds gate', () => {
	const { pptx } = fixture({ frame: { x: 2, y: -0.2, w: 2, h: 1 } })
	const result = boundsResult(pptx)
	assert.equal(result.valid, false)
	assert.ok(result.issues.some(issue => issue.code === 'ELEMENT_PARTIALLY_OFF_SLIDE'))
})
