import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import JSZip from 'jszip'

const NS = {
	p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
	a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
	r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

function shapeXml(id, name, actionChildren, shapeType = 'rect') {
	return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}">${actionChildren}</p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${id * 100000}" y="${id * 100000}"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="${shapeType}"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${name}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
}

function slideXml(shapes = '') {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

function pictureXml() {
	return `<p:pic><p:nvPicPr><p:cNvPr id="7" name="Action picture"><a:hlinkClick r:id="rIdPicUrl" tooltip="Email owner"/></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="700000" y="700000"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
}

async function writeFixture(filePath) {
	const zip = new JSZip()
	zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="wav" ContentType="audio/wav"/><Default Extension="mp3" ContentType="audio/mpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`)
	zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`)
	zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst><p:sldId id="256" r:id="rIdSlide1"/><p:sldId id="257" r:id="rIdSlide2"/></p:sldIdLst><p:custShowLst><p:custShow name="Details" id="7"><p:sldLst><p:sld r:id="rIdSlide2"/><p:sld r:id="rIdSlide1"/></p:sldLst></p:custShow><p:custShow name="Unsafe unresolved" id="8"><p:sldLst><p:sld r:id="rIdMissing"/></p:sldLst></p:custShow></p:custShowLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`)
	zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSlide1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rIdSlide2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`)

	const shapes = [
		shapeXml(2, 'Custom show button', `<a:hlinkClick action="ppaction://customshow?id=7&amp;return=true" tooltip="Details &amp; return" history="0" highlightClick="1" endSnd="0"/><a:hlinkHover r:id="rIdUrl" tooltip="Open &amp; play"><a:snd r:embed="rIdWav" name="Hover tone"/></a:hlinkHover>`, 'actionButtonHome'),
		shapeXml(3, 'Specific slide', '<a:hlinkClick r:id="rIdTarget" action="ppaction://hlinksldjump" tooltip="Next target"/>'),
		shapeXml(4, 'End show', '<a:hlinkClick action="ppaction://hlinkshowjump?jump=endshow"/>'),
		shapeXml(5, 'Unsafe program', '<a:hlinkClick r:id="rIdProgram" action="ppaction://program"/>'),
		shapeXml(6, 'Unsafe mp3', '<a:hlinkHover action="ppaction://noaction"><a:snd r:embed="rIdMp3" name="Not WAV"/></a:hlinkHover>'),
	].join('') + pictureXml()
	zip.file('ppt/slides/slide1.xml', slideXml(shapes))
	zip.file('ppt/slides/slide2.xml', slideXml())
	zip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdUrl" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/actions" TargetMode="External"/><Relationship Id="rIdPicUrl" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="mailto:owner@example.test" TargetMode="External"/><Relationship Id="rIdTarget" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide2.xml"/><Relationship Id="rIdWav" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/hover.wav"/><Relationship Id="rIdProgram" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="file:///unsafe.exe" TargetMode="External"/><Relationship Id="rIdMp3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/unsafe.mp3"/><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pixel.png"/></Relationships>`)
	zip.file('ppt/slides/_rels/slide2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`)
	zip.file('ppt/media/hover.wav', Buffer.from('RIFF0000WAVEfmt ', 'ascii'))
	zip.file('ppt/media/unsafe.mp3', Buffer.from('ID3', 'ascii'))
	zip.file('ppt/media/pixel.png', Buffer.from('89504e470d0a1a0a', 'hex'))
	await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

test('main decypher extracts safe object actions and custom-show topology while preserving unsupported actions privately', async t => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-action-decypher-'))
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
	const sourcePath = path.join(tempRoot, 'actions.pptx')
	const outputRoot = path.join(tempRoot, 'output')
	const modelPath = path.join(tempRoot, 'model.json')
	await writeFixture(sourcePath)

	const run = spawnSync(process.execPath, [
		path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath,
		'--output', outputRoot,
		'--no-regenerate',
		'--json-model', modelPath,
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
	const result = JSON.parse(await fs.readFile(modelPath, 'utf8'))
	assert.equal(result.success, true)
	assert.deepEqual(result.model.slides.map(slide => slide.id), ['slide-1', 'slide-2'])
	assert.deepEqual(result.model.customShows, [{ name: 'Details', id: 7, slides: ['slide-2', 'slide-1'] }])
	assert.equal(result.model._rawUnsupportedCustomShows.rejected.length, 1)
	assert.doesNotMatch(JSON.stringify(result.model._rawUnsupportedCustomShows), /slides\/slide|[A-Z]:\\/i)

	const byName = new Map(result.model.slides[0].shapes.map(shape => [shape.name, shape]))
	assert.deepEqual(byName.get('Custom show button').options.interactiveActions, {
		click: {
			type: 'customShow', customShow: 'Details', customShowId: 7, showAndReturn: true,
			tooltip: 'Details & return', history: false, highlightClick: true, endSound: false,
		},
		hover: {
			type: 'url', url: 'https://example.test/actions', tooltip: 'Open & play',
			sound: { source: './assets/hover.wav', format: 'wav', name: 'Hover tone' },
		},
	})
	assert.deepEqual(byName.get('Specific slide').options.interactiveActions, {
		click: { type: 'slide', targetSlideId: 'slide-2', targetSlide: 2, tooltip: 'Next target' },
	})
	assert.deepEqual(byName.get('End show').options.interactiveActions, { click: { type: 'endShow' } })
	assert.equal(byName.get('Unsafe program').options.interactiveActions, undefined)
	assert.equal(byName.get('Unsafe mp3').options.interactiveActions, undefined)
	for (const name of ['Unsafe program', 'Unsafe mp3']) {
		const preservation = JSON.stringify(byName.get(name).options._rawInteractiveActions)
		assert.match(preservation, /unsupported-action-uri|unsupported-or-unresolved-action-sound/)
		assert.doesNotMatch(preservation, /unsafe\.exe|unsafe\.mp3|ppt\/media|[A-Z]:\\/i)
	}
	assert.equal(byName.get('Custom show button').options.shapeType, 'actionButtonHome')
	assert.deepEqual(byName.get('Action picture').options.interactiveActions, {
		click: { type: 'url', url: 'mailto:owner@example.test', tooltip: 'Email owner' },
	})
})
