import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'
import { renderGeneratedTexturePng } from '../ir/generated-texture.mjs'
import { expandAtmosphereBlock } from '../ir/atmosphere-compositor.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('generated grain PNG is deterministic and tile-sized', () => {
	const a = renderGeneratedTexturePng({ type: 'grain', seed: 1042, widthPx: 64, heightPx: 64 })
	const b = renderGeneratedTexturePng({ type: 'grain', seed: 1042, widthPx: 64, heightPx: 64 })
	assert.equal(a.dataUri, b.dataUri)
	assert.match(a.dataUri, /^image\/png;base64,/)
	assert.equal(a.recipe.seamless, true)
	assert.equal(a.editability.generationRecipe, 'mcp-regenerable')
})

test('atmosphere grain lowers to a generated texture fill, not a pattern approximation', () => {
	const result = expandAtmosphereBlock({
		kind: 'atmosphere',
		layers: [{ kind: 'grain', amount: 0.1, seed: 9 }],
	})
	assert.equal(result.content[0].style.fill.type, 'texture')
	assert.equal(result.content[0].style.fill.texture.source.kind, 'generated')
	assert.equal(result.nodes[0].compiledAs, 'generated-tile-texture')
})

test('texture fill serializes tiled blipFill and a PNG media part', async () => {
	const rendered = renderGeneratedTexturePng({ type: 'grain', seed: 7, widthPx: 64, heightPx: 64, alpha: 0.2 })
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addShape('rect', {
		x: 0,
		y: 0,
		w: 13.333,
		h: 7.5,
		objectName: 'grain-fill',
		line: { type: 'none' },
		fill: {
			type: 'texture',
			texture: {
				data: rendered.dataUri,
				tile: true,
				scaleX: 0.5,
				scaleY: 0.5,
				transparency: 40,
			},
		},
	})
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-tex-'))
	const fileName = path.join(outDir, 'texture-fill.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.match(slideXml, /<a:blipFill /)
	assert.match(slideXml, /<a:tile /)
	assert.match(slideXml, /sx="50000"/)
	assert.match(rels, /relationships\/image/)
	assert.ok(Object.keys(zip.files).some(name => /ppt\/media\/texture-.*\.png$/i.test(name)))
})

test('native preset texture fill embeds a harvested JPEG tile', async () => {
	const { materializeGeneratedTextureFill } = await import('../ir/generated-texture.mjs')
	const fill = materializeGeneratedTextureFill({
		type: 'texture',
		texture: { source: { kind: 'nativePreset', presetId: 'texture.canvas' } },
	})
	assert.match(fill.texture.data, /^image\/jpeg;base64,/)
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addShape('rect', {
		x: 0, y: 0, w: 4, h: 3, objectName: 'canvas-fill',
		line: { type: 'none' },
		fill,
	})
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-tex-'))
	const fileName = path.join(outDir, 'native-preset.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /<a:blipFill /)
	assert.match(slideXml, /<a:tile /)
	assert.ok(Object.keys(zip.files).some(name => /\.jpe?g$/i.test(name)))
})

test('artistic blur serializes as a14 imgEffect on a picture', async () => {
	const img = await fs.readFile(path.resolve('betterpptx-mcp/assets/default-presenter-joe.png'))
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({
		data: 'image/png;base64,' + img.toString('base64'),
		x: 1, y: 1, w: 3, h: 3, objectName: 'blur-pic',
		imageAdjustments: { artisticEffect: { type: 'blur', radius: 18 } },
	})
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-art-'))
	const fileName = path.join(outDir, 'artistic-blur.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /a14:imgProps/)
	assert.match(slideXml, /a14:artisticBlur/)
	assert.match(slideXml, /radius="18"/)
})

test('paint strokes non-default attributes match the PowerPoint harvest', async () => {
	const img = await fs.readFile(path.resolve('betterpptx-mcp/assets/default-presenter-joe.png'))
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({
		data: 'image/png;base64,' + img.toString('base64'),
		x: 1, y: 1, w: 3, h: 3, objectName: 'strokes-pic',
		imageAdjustments: { artisticEffect: { type: 'paintStrokes', trans: 5000, intensity: 9 } },
	})
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-art-'))
	const fileName = path.join(outDir, 'artistic-strokes.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /a14:artisticPaintStrokes trans="5000" intensity="9"/)
})
