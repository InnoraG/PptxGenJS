import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

async function slideXml(bytes) {
	const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
	return zip.file('ppt/slides/slide1.xml').async('string')
}

test('run-local false and zero values outrank parent text defaults without repeated-write drift', async () => {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const slide = pptx.addSlide()
	slide.addText([
		{ text: 'Local values', options: { bold: false, italic: false, baseline: 0, charSpacing: 0, rtlMode: false } },
		{ text: 'Soft line', options: { softBreakBefore: true } },
	], {
		x: 0.5, y: 0.5, w: 5, h: 1.2,
		fontSize: 20, bold: true, italic: true, baseline: 10, charSpacing: 8, rtlMode: true,
	})

	const first = await pptx.write({ outputType: 'nodebuffer', compression: false })
	const second = await pptx.write({ outputType: 'nodebuffer', compression: false })
	const firstXml = await slideXml(first)
	const secondXml = await slideXml(second)

	assert.equal(secondXml, firstXml)
	assert.match(firstXml, /<a:pPr[^>]*\brtl="0"/)
	const localRun = firstXml.match(/<a:r><a:rPr([^>]*)>[\s\S]*?<a:t>Local values<\/a:t><\/a:r>/)
	assert.ok(localRun)
	assert.match(localRun[1], /\bb="0"/)
	assert.match(localRun[1], /\bi="0"/)
	assert.match(localRun[1], /\bbaseline="0"/)
	assert.doesNotMatch(localRun[1], /\bspc="800"/)
	assert.match(firstXml, /<a:t>Local values<\/a:t><\/a:r><a:br\/><a:r>/)
})
