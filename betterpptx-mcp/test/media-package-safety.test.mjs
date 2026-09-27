import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

const fixtures = {
	image: path.resolve('demos/common/images/wiki-example.jpg'),
	audio: path.resolve('demos/common/media/sample.mp3'),
	video: path.resolve('demos/common/media/sample.mp4'),
}

async function writePresentation(pptx, name) {
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-media-package-'))
	const fileName = path.join(outDir, name)
	await pptx.writeFile({ fileName, compression: false })
	return JSZip.loadAsync(await fs.readFile(fileName), { checkCRC32: true })
}

function relationships(xml) {
	const errors = []
	const document = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `relationship XML must be well-formed: ${errors.join('; ')}`)
	return Array.from(document.getElementsByTagName('Relationship')).map(node => ({
		id: node.getAttribute('Id'),
		type: node.getAttribute('Type'),
		target: node.getAttribute('Target'),
		targetMode: node.getAttribute('TargetMode'),
	}))
}

function parseXml(xml, label) {
	const errors = []
	const document = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label} must be well-formed: ${errors.join('; ')}`)
	return document
}

async function pictureHyperlinks(zip, slideNumber = 1) {
	const slideXml = await zip.file(`ppt/slides/slide${slideNumber}.xml`).async('string')
	const document = parseXml(slideXml, `slide${slideNumber}.xml`)
	const rels = relationships(await zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`).async('string'))
	const relById = new Map(rels.map(rel => [rel.id, rel]))
	return Array.from(document.getElementsByTagName('a:hlinkClick')).map(node => ({
		action: node.getAttribute('action'),
		tooltip: node.getAttribute('tooltip'),
		rel: relById.get(node.getAttribute('r:id')),
	}))
}

test('external picture hyperlinks and online-media targets are escaped once in relationship XML', async () => {
	const pictureUrl = 'https://example.com/picture?left=1&right="two"'
	const mediaUrl = 'https://example.com/watch?v=x&list="y"'
	const jpeg = `data:image/jpeg;base64,${(await fs.readFile(fixtures.image)).toString('base64')}`
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({ path: fixtures.image, x: 0.5, y: 0.5, w: 2, h: 1.5, hyperlink: { url: pictureUrl } })
	slide.addMedia({ type: 'online', link: mediaUrl, cover: jpeg, x: 3, y: 0.5, w: 3, h: 1.7 })
	const zip = await writePresentation(pptx, 'escaped-external-targets.pptx')
	const xml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.match(xml, /&amp;/)
	assert.match(xml, /&quot;/)
	const rels = relationships(xml)
	assert.ok(rels.some(rel => rel.target === pictureUrl))
	assert.ok(rels.some(rel => rel.target === mediaUrl))
})

test('structured external and internal picture hyperlinks replace stale imported click records and validate slide bounds', async () => {
	const externalUrl = 'https://example.com/fresh?one=1&two="2"'
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	pptx.addSlide()
	slide.addImage({
		path: fixtures.image,
		x: 0.5, y: 0.5, w: 2, h: 1.5,
		hyperlink: { url: externalUrl, tooltip: 'fresh external' },
		_rawHlinkClickXml: '<a:hlinkClick r:id="rId998" tooltip="stale external"/>',
	})
	slide.addImage({
		path: fixtures.image,
		x: 3, y: 0.5, w: 2, h: 1.5,
		hyperlink: { slide: 2, tooltip: 'fresh internal' },
		_rawHlinkClickXml: '<a:hlinkClick r:id="rId999" tooltip="stale internal"/>',
	})
	assert.equal(pptx.validate({ checks: ['repair'] }).valid, true)

	const zip = await writePresentation(pptx, 'structured-picture-hyperlinks.pptx')
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.doesNotMatch(slideXml, /rId99[89]|stale (?:external|internal)/)
	const links = await pictureHyperlinks(zip)
	assert.equal(links.length, 2)
	assert.ok(links.some(link => link.tooltip === 'fresh external' && link.rel?.type.endsWith('/hyperlink') && link.rel.targetMode === 'External' && link.rel.target === externalUrl))
	assert.ok(links.some(link => link.tooltip === 'fresh internal' && link.action === 'ppaction://hlinksldjump' && link.rel?.type.endsWith('/slide') && link.rel.target === 'slide2.xml'))
	assert.ok(zip.file('ppt/slides/slide2.xml'), 'internal hyperlink target must exist in the package')

	const invalid = new PptxGenJS()
	const invalidSlide = invalid.addSlide()
	invalid.addSlide()
	invalidSlide.addImage({ path: fixtures.image, x: 0, y: 0, w: 1, h: 1, hyperlink: { slide: 3 } })
	invalidSlide.addImage({ path: fixtures.image, x: 2, y: 0, w: 1, h: 1, hyperlink: { slide: 2, url: externalUrl } })
	const result = invalid.validate({ checks: ['repair'] })
	assert.equal(result.valid, false)
	assert.ok(result.issues.some(issue => issue.code === 'INVALID_HYPERLINK' && /existing slide/.test(issue.message)))
	assert.ok(result.issues.some(issue => issue.code === 'INVALID_HYPERLINK' && /exactly one/.test(issue.message)))
	await assert.rejects(() => writePresentation(invalid, 'invalid-picture-hyperlinks.pptx'), /Repair-risk validation failed/)
})

test('decypher resolves external and internal picture hyperlinks into typed generator values', { timeout: 120000 }, async t => {
	const externalUrl = 'https://example.com/decyphered?left=1&right=2'
	// Keep the generated module below the workspace so its normal relative
	// require path to dist exercises the same layout as production decyphering.
	const tempRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), 'test-picture-hyperlink-'))
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
	const sourcePath = path.join(tempRoot, 'picture-links.pptx')
	const outputRoot = path.join(tempRoot, 'output')
	const summaryPath = path.join(tempRoot, 'summary.json')
	const regeneratedPath = path.join(tempRoot, 'regenerated.pptx')
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	pptx.addSlide()
	slide.addImage({ path: fixtures.image, x: 0.5, y: 0.5, w: 2, h: 1.5, hyperlink: { url: externalUrl, tooltip: 'external tooltip' } })
	slide.addImage({ path: fixtures.image, x: 3, y: 0.5, w: 2, h: 1.5, hyperlink: { slide: 2, tooltip: 'internal tooltip' } })
	await pptx.writeFile({ fileName: sourcePath, compression: false })

	const decypher = spawnSync(process.execPath, [
		path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath,
		'--output', outputRoot,
		'--no-regenerate',
		'--json-summary', summaryPath,
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(decypher.status, 0, `${decypher.stdout}\n${decypher.stderr}`)
	const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'))
	const generatorText = await fs.readFile(summary.generatorPath, 'utf8')
	assert.doesNotMatch(generatorText, /\[object Object\]/)
	assert.ok(generatorText.includes(JSON.stringify({ url: externalUrl, tooltip: 'external tooltip' })))
	assert.ok(generatorText.includes(JSON.stringify({ slide: 2, tooltip: 'internal tooltip' })))

	const regenerate = spawnSync(process.execPath, [summary.generatorPath, '--out', regeneratedPath], {
		cwd: summary.outputFolder,
		encoding: 'utf8',
		timeout: 120000,
	})
	assert.equal(regenerate.status, 0, `${regenerate.stdout}\n${regenerate.stderr}`)
	const zip = await JSZip.loadAsync(await fs.readFile(regeneratedPath), { checkCRC32: true })
	const links = await pictureHyperlinks(zip)
	assert.ok(links.some(link => link.tooltip === 'external tooltip' && link.rel?.target === externalUrl && link.rel.targetMode === 'External'))
	assert.ok(links.some(link => link.tooltip === 'internal tooltip' && link.action === 'ppaction://hlinksldjump' && link.rel?.target === 'slide2.xml'))
	assert.ok(zip.file('ppt/slides/slide2.xml'))
})

test('media extension, MIME, poster type, and explicit relationship ownership stay aligned', async () => {
	const jpegBytes = await fs.readFile(fixtures.image)
	const jpeg = `data:image/jpeg;base64,${jpegBytes.toString('base64')}`
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addMedia({ type: 'audio', path: fixtures.audio, extn: '.MP3?download=1', cover: jpeg, x: 1, y: 1, w: 2, h: 2 })
	const media = slide._slideObjects.find(object => object._type === 'media')
	assert.ok(media)
	assert.notEqual(media.mediaCompanionRid, media.mediaRid)
	assert.notEqual(media.mediaCoverRid, media.mediaRid)
	assert.equal(slide._relsMedia.find(rel => rel.rId === media.mediaRid)?.type, 'audio/mpeg')
	assert.equal(slide._relsMedia.find(rel => rel.rId === media.mediaCoverRid)?.type, 'image/jpeg')

	// Relationship IDs are package identities, not positional arithmetic. Move
	// the companion and poster to sparse IDs before serialization.
	const companion = slide._relsMedia.find(rel => rel.rId === media.mediaCompanionRid)
	const cover = slide._relsMedia.find(rel => rel.rId === media.mediaCoverRid)
	companion.rId = 19
	cover.rId = 27
	media.mediaCompanionRid = 19
	media.mediaCoverRid = 27

	const zip = await writePresentation(pptx, 'typed-sparse-media-relationships.pptx')
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /p14:media[^>]+r:embed="rId19"/)
	assert.match(slideXml, /p:blipFill[^]*?<a:blip r:embed="rId27"/)
	const rels = relationships(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'))
	assert.ok(rels.some(rel => rel.id === 'rId19' && rel.type.endsWith('/media')))
	assert.ok(rels.some(rel => rel.id === 'rId27' && rel.type.endsWith('/image') && rel.target.endsWith('.jpeg')))
	const contentTypes = await zip.file('[Content_Types].xml').async('string')
	assert.match(contentTypes, /Extension="mp3" ContentType="audio\/mpeg"/)
	assert.match(contentTypes, /Extension="jpeg" ContentType="image\/jpeg"/)
	const coverRel = rels.find(rel => rel.id === 'rId27')
	const packagedCover = await zip.file(coverRel.target.replace('..', 'ppt')).async('nodebuffer')
	assert.equal(packagedCover.subarray(0, 2).toString('hex'), 'ffd8')
})

test('duplicate media targets retain primary, companion, cover, and online relationship roles', async () => {
	const jpeg = `data:image/jpeg;base64,${(await fs.readFile(fixtures.image)).toString('base64')}`
	const onlineUrl = 'https://example.com/embed/shared?id=1&mode=video'
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	for (let index = 0; index < 2; index++) slide.addMedia({ type: 'audio', path: fixtures.audio, cover: jpeg, x: index * 2, y: 0, w: 1, h: 1 })
	for (let index = 0; index < 2; index++) slide.addMedia({ type: 'online', link: onlineUrl, cover: jpeg, x: index * 2, y: 2, w: 1, h: 1 })
	const objects = slide._slideObjects.filter(object => object._type === 'media')
	const zip = await writePresentation(pptx, 'duplicate-media-roles.pptx')
	const rels = relationships(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'))
	for (const media of objects.slice(0, 2)) {
		assert.ok(rels.some(rel => rel.id === `rId${media.mediaRid}` && rel.type.endsWith('/audio')))
		assert.ok(rels.some(rel => rel.id === `rId${media.mediaCompanionRid}` && rel.type.endsWith('/media')))
		assert.ok(rels.some(rel => rel.id === `rId${media.mediaCoverRid}` && rel.type.endsWith('/image')))
	}
	for (const media of objects.slice(2)) {
		assert.ok(rels.some(rel => rel.id === `rId${media.mediaRid}` && rel.type.endsWith('/video') && rel.targetMode === 'External' && rel.target === onlineUrl))
	}
})

test('inline and path payload signatures must agree with package MIME and extension', async () => {
	const jpegBytes = await fs.readFile(fixtures.image)
	const mp3Bytes = await fs.readFile(fixtures.audio)
	const mislabeledPng = `data:image/png;base64,${jpegBytes.toString('base64')}`
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	assert.throws(() => slide.addImage({ data: mislabeledPng, x: 0, y: 0, w: 1, h: 1 }), /does not match declared image\/png/)
	assert.throws(() => slide.addMedia({ type: 'audio', data: `audio/wav;base64,${mp3Bytes.toString('base64')}`, extn: 'wav', x: 0, y: 0, w: 1, h: 1 }), /does not match declared audio\/wav/)
	assert.throws(() => slide.addMedia({ type: 'audio', path: fixtures.audio, cover: mislabeledPng, x: 0, y: 0, w: 1, h: 1 }), /does not match declared image\/png/)

	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-signature-mismatch-'))
	const falsePngPath = path.join(tempRoot, 'not-really.png')
	await fs.writeFile(falsePngPath, jpegBytes)
	const pathPptx = new PptxGenJS()
	pathPptx.addSlide().addImage({ path: falsePngPath, x: 0, y: 0, w: 1, h: 1 })
	await assert.rejects(() => writePresentation(pathPptx, 'false-png.pptx'), /does not match declared image\/png/)
})

test('picture descriptions stay private and CT_Blip adjustments use schema order', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({ path: fixtures.image, x: 0, y: 0, w: 2, h: 1.5, imageAdjustments: { brightness: 0.2, colorMode: 'grayscale' } })
	slide.addImage({ path: fixtures.image, x: 3, y: 0, w: 2, h: 1.5, imageAdjustments: { brightness: 0.2, colorMode: 'duotone', duotone: { dark: '000000', light: 'FFFFFF' } } })
	const zip = await writePresentation(pptx, 'picture-order-and-private-descr.pptx')
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.doesNotMatch(slideXml, new RegExp(fixtures.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
	assert.doesNotMatch(slideXml, /descr="[^"]+"/)
	assert.ok(slideXml.indexOf('<a:grayscl/>') < slideXml.indexOf('<a:lum'))
	assert.ok(slideXml.indexOf('<a:duotone>') < slideXml.lastIndexOf('<a:lum'))
})

test('media commands canonicalize before escaped well-formed timing XML is emitted', async () => {
	const jpeg = `data:image/jpeg;base64,${(await fs.readFile(fixtures.image)).toString('base64')}`
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addMedia({ type: 'audio', path: fixtures.audio, cover: jpeg, x: 0, y: 0, w: 1, h: 1 })
	const media = slide._slideObjects.find(object => object._type === 'media')
	slide.addAnimation(media, { type: 'media', effect: 'mediaplay', mediaCommand: ' PLAYFROM(2) ', trigger: 'onClick' })
	const zip = await writePresentation(pptx, 'canonical-media-command.pptx')
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /<p:cmd[^>]+cmd="playFrom\(2\.0\)"/)
	const errors = []
	new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(slideXml, 'application/xml')
	assert.deepEqual(errors, [])

	const bad = new PptxGenJS()
	const badSlide = bad.addSlide()
	badSlide.addMedia({ type: 'audio', path: fixtures.audio, cover: jpeg, x: 0, y: 0, w: 1, h: 1 })
	const badMedia = badSlide._slideObjects.find(object => object._type === 'media')
	badSlide.addAnimation(badMedia, { type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(0)&quot; stop', trigger: 'onClick' })
	await assert.rejects(() => writePresentation(bad, 'adversarial-media-command.pptx'), /mediaCommand must be/)
})

const RAW_TIMING_FIXTURE = '<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="7" fill="hold"><p:stCondLst><p:cond delay="777"/></p:stCondLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'

test('raw timing merge preserves unrelated timing and emits audio/video × play/pause/stop with unique IDs', async t => {
	const jpeg = `data:image/jpeg;base64,${(await fs.readFile(fixtures.image)).toString('base64')}`
	const cases = [
		{ effect: 'mediaplay', mediaCommand: ' PLAYFROM(2) ', expectedCommand: 'playFrom(2.0)' },
		{ effect: 'mediapause', mediaCommand: ' TOGGLEPAUSE ', expectedCommand: 'togglePause' },
		{ effect: 'mediastop', mediaCommand: ' StOp ', expectedCommand: 'stop' },
	]
	for (const mediaType of ['audio', 'video']) {
		for (const commandCase of cases) {
			await t.test(`${mediaType} ${commandCase.expectedCommand}`, async () => {
				const pptx = new PptxGenJS()
				const slide = pptx.addSlide()
				slide.addMedia({ type: mediaType, path: fixtures[mediaType], cover: jpeg, x: 0, y: 0, w: 2, h: 1.5 })
				const media = slide._slideObjects.find(object => object._type === 'media')
				assert.ok(media)
				slide._rawTimingXml = RAW_TIMING_FIXTURE
				slide.addAnimation(media, { type: 'media', effect: commandCase.effect, mediaCommand: commandCase.mediaCommand, trigger: 'onClick' })
				const zip = await writePresentation(pptx, `raw-${mediaType}-${commandCase.effect}.pptx`)
				const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
				const document = parseXml(slideXml, `${mediaType} ${commandCase.expectedCommand} slide XML`)
				assert.equal(document.getElementsByTagName(`p:${mediaType}`).length, 1)
				assert.equal(document.getElementsByTagName(`p:${mediaType === 'audio' ? 'video' : 'audio'}`).length, 0)
				const commands = Array.from(document.getElementsByTagName('p:cmd'))
				assert.ok(commands.some(node => node.getAttribute('cmd') === commandCase.expectedCommand))
				assert.ok(Array.from(document.getElementsByTagName('p:cond')).some(node => node.getAttribute('delay') === '777'), 'unrelated imported timing must remain')
				const ids = Array.from(document.getElementsByTagName('p:cTn')).map(node => node.getAttribute('id')).filter(Boolean)
				assert.equal(new Set(ids).size, ids.length, `all cTn IDs must be unique: ${ids.join(', ')}`)
			})
		}
	}
})
