import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('native layout placeholders serialize orient and hasCustomPrompt without raster fallback', async () => {
	const pptx = new PptxGenJS()
	pptx.defineLayout({
		name: 'VERTICAL_GALLERY',
		width: 13.333,
		height: 7.5,
		placeholders: [
			{ name: 'diagramSlot', type: 'dgm', idx: 7, size: 'half', orient: 'vert', hasCustomPrompt: true, x: 1, y: 1, w: 5, h: 4 },
			{ name: 'wideTitle', type: 'title', idx: 8, size: 'full', orient: 'horz', hasCustomPrompt: false, x: 1, y: 0.3, w: 11, h: 0.6 },
		],
	})
	pptx.layout = 'VERTICAL_GALLERY'
	pptx.addSlide()
	const filePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-placeholder-')), 'placeholder-variants.pptx')
	try {
		await pptx.writeFile({ fileName: filePath, compression: false })
		const zip = await JSZip.loadAsync(await fs.readFile(filePath))
		const layoutParts = Object.keys(zip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
		const xmlParts = await Promise.all(layoutParts.map(name => zip.file(name).async('string')))
		const xml = xmlParts.find(value => value.includes('diagramSlot')) || ''
		assert.ok(xml, 'custom layout XML was emitted')
		assert.match(xml, /<p:ph[^>]*type="dgm"[^>]*sz="half"[^>]*orient="vert"[^>]*hasCustomPrompt="1"[^>]*idx="7"/)
		assert.match(xml, /<p:ph[^>]*type="title"[^>]*sz="full"[^>]*idx="8"/)
		assert.doesNotMatch(xml.match(/<p:ph[^>]*type="title"[^>]*\/>/)?.[0] || '', /orient="horz"|hasCustomPrompt="0"/)
	} finally {
		await fs.rm(path.dirname(filePath), { recursive: true, force: true })
	}
})
