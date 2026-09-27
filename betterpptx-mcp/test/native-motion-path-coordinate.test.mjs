import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { ANIMATION_FORMAT_PARAMETERS, validateAnimationFormatOptions } from '../animation-format-catalog.mjs'
import { ANIMATION_AUTHORING_OPERATION_CONTRACT, validateAnimationAuthoringOperationArgs } from '../animation-authoring-operation-contract.mjs'
import { TOOLS } from '../tools.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('preserves authored semantic slide-space path direction at the native boundary', async () => {
	const parameter = ANIMATION_FORMAT_PARAMETERS.find(item => item.id === 'motionPathCoordinateSpace')
	assert.deepEqual(parameter.canonical, ['slide', 'powerpoint'])
	assert.ok(ANIMATION_AUTHORING_OPERATION_CONTRACT.overrideFields.includes('animation.motionPathCoordinateSpace'))
	assert.equal(TOOLS.find(tool => tool.name === 'betterpptx.slide.animate_shapes').inputSchema.properties.animation.properties.motionPathCoordinateSpace.enum.at(0), 'slide')
	assert.equal(validateAnimationFormatOptions({ type: 'motion', effect: 'right', motionPathCoordinateSpace: 'slide' }).motionPathCoordinateSpace, 'slide')
	assert.equal(validateAnimationAuthoringOperationArgs({ animation: { type: 'motion', effect: 'right', motionPathCoordinateSpace: 'powerpoint' } }).animation.motionPathCoordinateSpace, 'powerpoint')
	assert.throws(() => validateAnimationFormatOptions({ type: 'emphasis', effect: 'pulse', motionPathCoordinateSpace: 'slide' }), /only to motion/)

	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addShape(pptx.ShapeType.rect, { objectName: 'semantic-right', x: 1, y: 1, w: 1, h: 1 })
	slide.addShape(pptx.ShapeType.rect, { objectName: 'semantic-left', x: 3, y: 1, w: 1, h: 1 })
	slide.addShape(pptx.ShapeType.rect, { objectName: 'native-escape', x: 5, y: 1, w: 1, h: 1 })
	slide.addAnimation('semantic-right', { type: 'motion', effect: 'right', pathData: 'M 0 0 L 1.55 0 E', motionPathCoordinateSpace: 'slide', motionEasing: 'linear', duration: 2208 })
	slide.addAnimation('semantic-left', { type: 'motion', effect: 'left', pathData: 'M 0 0 L -1.55 0 E', motionPathCoordinateSpace: 'slide', motionEasing: 'linear', duration: 2208 })
	slide.addAnimation('native-escape', { type: 'motion', effect: 'right', pathData: 'M 0 0 L 1.55 0 E', motionPathCoordinateSpace: 'powerpoint', motionEasing: 'linear', duration: 2208 })
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const paths = [...xml.matchAll(/<p:animMotion\b[^>]*\spath="([^"]+)"/g)].map(match => match[1])
	assert.equal(paths.length, 3)
	assert.match(paths[0], /1\.55/)
	assert.match(paths[1], /-1\.55/)
	assert.match(paths[2], /1\.55/)
	assert.doesNotMatch(paths[0], /-1\.55/)
})

console.log(JSON.stringify({ status: 'PASS', checks: 1, contract: 'slide-space semantic path -> native PowerPoint preserve-authored lowering' }))
