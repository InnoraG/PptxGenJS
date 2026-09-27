import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { promisify } from 'node:util'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const parser = new DOMParser()
const run = promisify(execFile)

const imageFixtures = {
	jpeg: path.resolve('demos/common/images/wiki-example.jpg'),
	gif: path.resolve('demos/common/images/anim_campfire.gif'),
	svg: path.resolve('demos/common/images/pixelfed_icon.svg'),
}

async function writePresentation(pptx, name) {
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-shape-package-'))
	const fileName = path.join(outDir, name)
	await pptx.writeFile({ fileName, compression: false })
	const { stdout } = await run(process.execPath, [path.resolve('tools/audit-pptx-package-integrity.mjs'), fileName], { maxBuffer: 20 * 1024 * 1024 })
	assert.equal(JSON.parse(stdout).status, 'PASS')
	return { fileName, zip: await JSZip.loadAsync(await fs.readFile(fileName), { checkCRC32: true }) }
}

function relationshipIds(xml) {
	const document = parser.parseFromString(xml, 'application/xml')
	return Array.from(document.getElementsByTagName('Relationship')).map(node => node.getAttribute('Id'))
}

test('late background assignment, replacement, and clear preserve a valid relationship lifecycle', async () => {
	const pptx = new PptxGenJS()

	const late = pptx.addSlide()
	late.addText('linked first', { x: 0.5, y: 0.5, w: 2, h: 0.4, hyperlink: { url: 'https://example.com' } })
	const existingIds = [...late._rels.map(rel => rel.rId), ...late._relsMedia.map(rel => rel.rId)]
	late.background = { path: imageFixtures.jpeg }
	assert.ok(late._bkgdImgRid > Math.max(...existingIds), 'background must use the shared relationship allocator')

	const replacement = pptx.addSlide()
	replacement.background = { path: imageFixtures.jpeg }
	const replacedTarget = replacement._relsMedia.find(rel => rel.isBackground)?.Target
	replacement.background = { path: imageFixtures.gif }
	assert.equal(replacement._relsMedia.some(rel => rel.isBackground && rel.Target === replacedTarget), false)
	assert.equal(replacement._relsMedia.filter(rel => rel.isBackground).length, 1)
	assert.equal(replacement._relsMedia.find(rel => rel.isBackground)?.extn, 'gif')

	const cleared = pptx.addSlide()
	cleared.background = { path: imageFixtures.svg }
	cleared.background = null
	assert.equal(cleared._bkgdImgRid, undefined)
	assert.equal(cleared._relsMedia.some(rel => rel.isBackground), false)

	const { zip } = await writePresentation(pptx, 'background-lifecycle.pptx')
	for (let slideNumber = 1; slideNumber <= 3; slideNumber++) {
		const relsXml = await zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`).async('string')
		const ids = relationshipIds(relsXml)
		assert.equal(new Set(ids).size, ids.length, `slide ${slideNumber} relationship ids must be unique`)
	}
	const clearedXml = await zip.file('ppt/slides/slide3.xml').async('string')
	assert.doesNotMatch(clearedXml, /<p:bg>/)
})

test('shape picture and texture fills derive JPEG, GIF, and SVG package types from paths and data', async () => {
	const fixtureBytes = Object.fromEntries(await Promise.all(Object.entries(imageFixtures).map(async ([extension, file]) => [extension, await fs.readFile(file)])))
	const mimeTypes = { jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' }
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	let index = 0
	for (const [extension, file] of Object.entries(imageFixtures)) {
		slide.addShape('rect', {
			x: 0.4 + (index % 3) * 2,
			y: 0.5,
			w: 1.5,
			h: 1.2,
			fill: { type: index % 2 ? 'texture' : 'picture', texture: { path: file } },
			line: { type: 'none' },
		})
		index++
	}
	for (const extension of Object.keys(imageFixtures)) {
		slide.addShape('rect', {
			x: 0.4 + (index % 3) * 2,
			y: 2.1,
			w: 1.5,
			h: 1.2,
			fill: { type: index % 2 ? 'texture' : 'picture', texture: { data: `${mimeTypes[extension]};base64,${fixtureBytes[extension].toString('base64')}` } },
			line: { type: 'none' },
		})
		index++
	}

	assert.deepEqual(new Set(slide._relsMedia.map(rel => rel.extn)), new Set(['jpeg', 'gif', 'svg']))
	assert.deepEqual(new Set(slide._relsMedia.map(rel => rel.type)), new Set(Object.values(mimeTypes)))
	assert.equal(slide._relsMedia.some(rel => rel.Target.includes('.svg+xml')), false)

	const { zip } = await writePresentation(pptx, 'shape-fill-media-types.pptx')
	const names = Object.keys(zip.files)
	assert.equal(names.some(name => name.endsWith('.svg+xml')), false)
	const contentTypes = await zip.file('[Content_Types].xml').async('string')
	for (const [extension, mimeType] of Object.entries(mimeTypes)) {
		assert.match(contentTypes, new RegExp(`Extension="${extension}" ContentType="${mimeType.replace(/[+]/g, '\\+')}"`))
	}
	for (const rel of slide._relsMedia) {
		const partName = rel.Target.replace('..', 'ppt')
		const bytes = await zip.file(partName).async('nodebuffer')
		if (rel.extn === 'jpeg') assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8')
		if (rel.extn === 'gif') assert.equal(bytes.subarray(0, 3).toString('ascii'), 'GIF')
		if (rel.extn === 'svg') assert.match(bytes.toString('utf8', 0, 256), /<svg\b/)
	}
})

test('linear gradient angle 360 serializes as zero and never reaches the max-exclusive OOXML bound', async () => {
	const pptx = new PptxGenJS()
	const stops = [{ position: 0, color: '112233' }, { position: 100, color: 'DDEEFF' }]
	for (const angle of [0, 359.999, 359.9999999, 360]) {
		const slide = pptx.addSlide()
		slide.addShape('rect', { x: 1, y: 1, w: 4, h: 2, fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: angle, gradientStops: stops } })
	}
	const { zip } = await writePresentation(pptx, 'gradient-angle-boundaries.pptx')
	const expected = [0, Math.round(359.999 * 60000), 21599999, 0]
	for (let slideNumber = 1; slideNumber <= expected.length; slideNumber++) {
		const xml = await zip.file(`ppt/slides/slide${slideNumber}.xml`).async('string')
		const match = xml.match(/<a:lin\b[^>]*\bang="(\d+)"/)
		assert.ok(match, `slide ${slideNumber} must contain a linear gradient angle`)
		const angle = Number(match[1])
		assert.equal(angle, expected[slideNumber - 1])
		assert.ok(angle >= 0 && angle < 21600000, 'ST_PositiveFixedAngle must remain below 360 degrees')
	}
})
