import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { ANIMATION_FORMAT_PARAMETERS, validateAnimationFormatOptions } from '../animation-format-catalog.mjs'
import { ANIMATION_AUTHORING_OPERATION_CONTRACT, validateAnimationAuthoringOperationArgs } from '../animation-authoring-operation-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'
import { timedMotionPathAnimations } from '../ir/timed-motion-path.mjs'

const require = createRequire(import.meta.url), PptxGenJS = require('../../dist/pptxgen.cjs.js')
const nodes = (root, tag) => Array.from(root.getElementsByTagName(tag))

test('motion easing is discoverable, typed, resettable and limited to motion paths', () => {
	assert.deepEqual(ANIMATION_FORMAT_PARAMETERS.find(item => item.id === 'motionEasing').canonical, ['smooth', 'linear'])
	assert.ok(ANIMATION_AUTHORING_OPERATION_CONTRACT.overrideFields.includes('animation.motionEasing'))
	const tool = TOOLS.find(tool => tool.name === 'betterpptx.slide.animate_shapes')
	assert.deepEqual(tool.inputSchema.properties.animation.properties.motionEasing.enum, ['smooth', 'linear', null])
	for (const motionEasing of ['smooth', 'linear', null]) assert.equal(validateAnimationAuthoringOperationArgs({ animation: { type: 'motion', effect: 'right', motionEasing } }).animation.motionEasing, motionEasing)
	for (const invalid of ['ease-out', 0, true, {}]) assert.throws(() => validateAnimationFormatOptions({ type: 'motion', effect: 'right', motionEasing: invalid }), /motionEasing/)
	assert.throws(() => validateAnimationFormatOptions({ type: 'emphasis', effect: 'pulse', motionEasing: 'linear' }), /only to motion/)
	const spec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Linear movement', contentStory: { audience: 'authors', outcome: 'verify exact trajectory timing', remember: 'native linear motion' }, visualDesign: { world: 'blueprint', framing: 'one target' }, motionTime: { masterClock: 'static', timingSource: 'explicit', syncPolicy: 'one clock' }, slides: [{ id: 'proof', title: 'Linear', message: 'Follow a sampled clock.', layoutIntent: 'title-only', content: [{ kind: 'text', name: 'target', text: 'Target', animation: { type: 'motion', effect: 'right', motionEasing: 'linear', duration: 900 } }] }] }
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	assert.ok(JSON.stringify(plan.operations).includes('"motionEasing":"linear"'), 'inline semantic animation retains its typed easing')
	spec.slides[0].timeline = [{ objectName: 'target', ...spec.slides[0].content[0].animation }]
	delete spec.slides[0].content[0].animation
	const timelinePlan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	assert.equal(timelinePlan.operations.find(operation => operation.tool === 'betterpptx.slide.animate_shapes').args.animation.motionEasing, 'linear')
})

for (const motionEasing of [undefined, null, 'smooth', 'linear']) test(`native path serializes ${String(motionEasing)} easing with its exact segment clock`, async () => {
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	slide.addShape(pptx.ShapeType.rect, { objectName: 'target', x: 2, y: 2, w: .5, h: .5 })
	const animations = timedMotionPathAnimations([[225, 2.25, 2.25], [325, 3.25, 2.45], [1225, 3.75, 2.15]])
	for (const animation of animations) slide.addAnimation('target', { ...animation, motionEasing })
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string'), errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	const owners = nodes(doc, 'p:cTn').filter(node => node.getAttribute('presetClass') === 'path')
	assert.equal(owners.length, 2)
	for (const [index, owner] of owners.entries()) {
		assert.equal(owner.getAttribute('accel'), motionEasing === 'linear' ? '0' : '50000')
		assert.equal(owner.getAttribute('decel'), motionEasing === 'linear' ? '0' : '50000')
		const motion = nodes(owner, 'p:animMotion')[0]
		assert.equal(motion.getAttribute('path'), animations[index].motionPathData)
		assert.equal(nodes(motion, 'p:cTn')[0].getAttribute('dur'), String(animations[index].duration))
	}
	const ids = nodes(doc, 'p:cTn').map(node => node.getAttribute('id'))
	assert.equal(new Set(ids).size, ids.length)
})
