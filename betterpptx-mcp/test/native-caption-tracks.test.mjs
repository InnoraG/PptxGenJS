import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('closedCaptionTracks embed native WebVTT and do not create slide text', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addMedia({
		type: 'audio',
		data: 'audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
		extn: 'wav',
		x: 0.5,
		y: 0.5,
		w: 1,
		h: 0.4,
		isNarration: true,
		closedCaptionTracks: [{
			language: 'en-US',
			label: 'English',
			vtt: 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello\n',
			default: true,
		}],
	})
	slide.addText('SYSTEMS THINKING', { x: 1, y: 2, w: 6, h: 0.5, objectName: 'label' })
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-vtt-'))
	const fileName = path.join(outDir, 'native-captions.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const names = Object.keys(zip.files)
	assert.ok(names.some(name => /\.vtt$/i.test(name)), 'package must contain a .vtt part')
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.match(rels, /2017\/04\/relationships\/track/)
	assert.match(slideXml, /p173:tracksInfo/)
	assert.match(slideXml, /p173:track /)
	assert.doesNotMatch(slideXml, /p188:caption|embeddedCaptions/)
	assert.doesNotMatch(slideXml, /narration-caption-/)
	assert.match(slideXml, /SYSTEMS THINKING/)
})

test('update_media replaces and clears caption relationships and imported blip blockers', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addMedia({
		type: 'audio', data: 'audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=', extn: 'wav',
		x: 0.5, y: 0.5, w: 1, h: 0.4, objectName: 'caption-audio',
		closedCaptionTracks: [{ language: 'en-US', label: 'Original', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOriginal\n' }],
	})
	const imported = slide._slideObjects.find(object => object?._type === 'media')
	assert.ok(imported)
	const { applyMediaOptionsPatchForTest, removeOwnedMediaCommandsForTest, markOwnedMediaCommandsForTest } = await import('../engine.mjs')
	imported.options._rawBlipInnerXml = '<a:alphaModFix amt="50000"/>'
	imported.options._rawBlipTailXml = '<a:stretch><a:fillRect/></a:stretch>'
	imported.options._picPrstGeom = 'ellipse'
	const oldTrackRels = slide._relsMedia.filter(rel => rel.isCaptionTrack)
	applyMediaOptionsPatchForTest(slide, imported, {
		transparency: 25, sizing: { type: 'cover', w: imported.options.w, h: imported.options.h }, rounding: false,
		closedCaptionTracks: [{ language: 'fr-FR', label: 'Français', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nBonjour\n' }],
	})
	assert.equal(imported.options._rawBlipInnerXml, undefined)
	assert.equal(imported.options._rawBlipTailXml, undefined)
	assert.equal(imported.options._picPrstGeom, undefined)
	assert.equal(imported.options.closedCaptionTracks.length, 1)
	assert.equal(imported.options.closedCaptionTracks[0].language, 'fr-FR')
	assert.match(imported.options.closedCaptionTracks[0].id, /^\{[0-9A-F-]{36}\}$/)
	assert.equal(slide._relsMedia.some(rel => oldTrackRels.includes(rel)), false)
	assert.equal(slide._relsMedia.filter(rel => rel.isCaptionTrack).length, 1)
	applyMediaOptionsPatchForTest(slide, imported, { transparency: 0, sizing: null, rounding: false, closedCaptionTracks: [] })
	assert.equal(imported.options.closedCaptionTracks, undefined)
	assert.equal(slide._relsMedia.filter(rel => rel.isCaptionTrack).length, 0)

	const spid = imported.options.spid ?? (slide._slideObjects.indexOf(imported) + 2)
	const unrelated = { target: imported, shapeId: spid, animation: { type: 'media', effect: 'mediastop' } }
	slide._animations = slide._animations || []
	slide._animations.push(unrelated)
	slide._rawTimingXml = '<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tnLst/></p:timing>'
	const start = slide._animations.length
	slide.addAnimation(imported, { type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(2)', trigger: 'onClick' })
	markOwnedMediaCommandsForTest(slide, start)
	assert.equal(slide._animations.filter(record => record._betterpptxOwnedMediaCommand === true).length, 1)
	const rawTimingBeforeClear = slide._rawTimingXml
	assert.equal(removeOwnedMediaCommandsForTest(slide, imported, spid), true)
	assert.equal(slide._animations.includes(unrelated), true)
	assert.equal(slide._animations.filter(record => record._betterpptxOwnedMediaCommand === true).length, 0)
	assert.equal(slide._rawTimingXml, rawTimingBeforeClear)
	const readdStart = slide._animations.length
	slide.addAnimation(imported, { type: 'media', effect: 'mediastop', mediaCommand: 'stop', trigger: 'onClick' })
	markOwnedMediaCommandsForTest(slide, readdStart)
	assert.equal(slide._animations.filter(record => record._betterpptxOwnedMediaCommand === true).length, 1)
})
