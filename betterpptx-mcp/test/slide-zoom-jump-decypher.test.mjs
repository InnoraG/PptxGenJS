import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import JSZip from 'jszip'
import ts from 'typescript'

import pptxgenModule from '../../dist/pptxgen.cjs.js'

const PptxGenJS = pptxgenModule.default || pptxgenModule
const THUMBNAIL_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function sourceStructuredDecypher(buildRoot) {
	const sourceRoot = path.resolve('src')
	async function visit(directory) {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const sourcePath = path.join(directory, entry.name)
			if (entry.isDirectory()) await visit(sourcePath)
			else if (entry.isFile() && entry.name.endsWith('.ts')) {
				const outputPath = path.join(buildRoot, 'src', path.relative(sourceRoot, sourcePath).replace(/\.ts$/, '.js'))
				await fs.mkdir(path.dirname(outputPath), { recursive: true })
				await fs.writeFile(outputPath, ts.transpileModule(await fs.readFile(sourcePath, 'utf8'), {
					compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
					fileName: sourcePath,
				}).outputText)
			}
		}
	}
	await fs.writeFile(path.join(buildRoot, 'package.json'), '{"type":"module"}')
	await visit(path.join(sourceRoot, 'pptx-decypher'))
	const registrySource = path.join(sourceRoot, 'gen-animations-registry-merged.ts')
	const registryOutput = path.join(buildRoot, 'src', 'gen-animations-registry-merged.js')
	await fs.mkdir(path.dirname(registryOutput), { recursive: true })
	await fs.writeFile(registryOutput, ts.transpileModule(await fs.readFile(registrySource, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
		fileName: registrySource,
	}).outputText)
	return Promise.all([
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/extractor/PptxExtractor.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/parser/PresentationParser.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/generator/CodeGenerator.js')).href),
	])
}

async function writeNavigationFixture(filePath) {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const source = pptx.addSlide()
	const jump = source.addShape('rect', {
		x: 0.5, y: 0.5, w: 2, h: 0.6,
		objectName: 'Ordinary jump',
		interactiveActions: {
			click: {
				type: 'slide', targetSlideId: 'slide-2', targetSlide: 2,
				tooltip: 'Jump to detail', history: false, highlightClick: true, endSound: false,
			},
		},
	})
	assert.ok(jump)
	source.addZoom({
		targetSlide: 3,
		x: 2.25, y: 1.25, w: 3.5, h: 2.25,
		objectName: 'Native Slide Zoom',
		returnToParent: false,
		transitionDur: 2500,
		thumbnailDataUri: THUMBNAIL_DATA_URI,
		altText: 'Preview the destination slide',
	})
	pptx.addSlide().addText('Detail', { x: 1, y: 1, w: 3, h: 1 })
	pptx.addSlide().addText('Zoom target', { x: 1, y: 1, w: 3, h: 1 })
	await pptx.writeFile({ fileName: filePath })
}

async function packageNavigationState(filePath) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	return { slideXml, relsXml }
}

async function mismatchZoomChoiceTarget(filePath) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	zip.file('ppt/slides/slide1.xml', slideXml.replace('sldId="258"', 'sldId="257"'))
	await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

function assertSemanticNavigationModel(model) {
	const shapes = model.slides[0].shapes
	const jump = shapes.find(shape => shape.name === 'Ordinary jump')
	const zoom = shapes.find(shape => shape.name === 'Native Slide Zoom')
	assert.ok(jump)
	assert.deepEqual(jump.options.interactiveActions, {
		click: {
			type: 'slide', targetSlideId: 'slide-2', targetSlide: 2,
			tooltip: 'Jump to detail', history: false, highlightClick: true, endSound: false,
		},
	})
	assert.ok(zoom)
	assert.equal(zoom.type, 'slideZoom')
	assert.equal(zoom.kind, 'slideZoom')
	assert.equal(zoom.targetSlideId, 'slide-3')
	assert.equal(zoom.returnToParent, false)
	assert.equal(zoom.transitionDur, 2500)
	assert.match(zoom.thumbnailDataUri, /^data:image\/png;base64,/)
	assert.equal(zoom.altText, 'Preview the destination slide')
	assert.equal(zoom.options.targetSlideId, 'slide-3')
	assert.equal(zoom.options.targetSlide, 3)
	assert.equal(zoom.options.returnToParent, false)
	assert.equal(zoom.options.transitionDur, 2500)
	assert.equal(zoom.options.altText, 'Preview the destination slide')
	assert.match(zoom.options.thumbnailDataUri, /^data:image\/png;base64,/)
	assert.deepEqual(zoom.bbox, { x: 2.25, y: 1.25, w: 3.5, h: 2.25 })
	assert.doesNotMatch(JSON.stringify({ jump: jump.options, zoom }), /rId\d+|ppt\/slides|ppt\/media|slide\d+\.xml/i)
}

function assertReplayedNavigation({ slideXml, relsXml }) {
	assert.match(slideXml, /schemas\.microsoft\.com\/office\/powerpoint\/2016\/slidezoom/)
	assert.match(slideXml, /<pslz:sldZmObj[^>]*sldId="258"/)
	assert.match(slideXml, /<pslz:zmPr[^>]*returnToParent="0"[^>]*transitionDur="2500"/)
	assert.match(slideXml, /name="Native Slide Zoom"[^>]*descr="Preview the destination slide"/)
	assert.match(relsXml, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slide" Target="slide2\.xml"/)
	assert.match(relsXml, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slide" Target="slide3\.xml"/)
	assert.equal((slideXml.match(/ppaction:\/\/hlinksldjump/g) || []).length, 2)
}

test('main decypher separates ordinary jump actions from semantic native Slide Zoom and replays both', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-main-slide-zoom-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.main-slide-zoom-'))
	t.after(() => Promise.all([
		fs.rm(root, { recursive: true, force: true }),
		fs.rm(outputRoot, { recursive: true, force: true }),
	]))
	const sourcePath = path.join(root, 'navigation.pptx')
	const modelPath = path.join(root, 'model.json')
	const replayPath = path.join(root, 'main-replayed.pptx')
	await writeNavigationFixture(sourcePath)

	const result = spawnSync(process.execPath, [
		path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath,
		'--output', outputRoot, '--no-regenerate', '--json-model', modelPath,
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
	const payload = JSON.parse(await fs.readFile(modelPath, 'utf8'))
	assert.equal(payload.success, true)
	assertSemanticNavigationModel(payload.model)

	const generatorPath = path.join(outputRoot, `navigation__${payload.signature}`, 'generator.mjs')
	const replay = spawnSync(process.execPath, [generatorPath, '--out', replayPath], {
		cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000,
	})
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	assertReplayedNavigation(await packageNavigationState(replayPath))
})

test('structured parser and CodeGenerator retain and replay slide jump plus native Slide Zoom semantics', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.slide-zoom-build-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.slide-zoom-structured-'))
	t.after(() => Promise.all([
		fs.rm(buildRoot, { recursive: true, force: true }),
		fs.rm(outputRoot, { recursive: true, force: true }),
	]))
	await Promise.all(['assets', 'output', 'passthrough'].map(folder => fs.mkdir(path.join(outputRoot, folder), { recursive: true })))
	const sourcePath = path.join(outputRoot, 'navigation.pptx')
	await writeNavigationFixture(sourcePath)
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await sourceStructuredDecypher(buildRoot)
	const extracted = await new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: true, validate: false })
		.extract(await fs.readFile(sourcePath), outputRoot)
	const model = await new PresentationParser().parse(extracted, outputRoot)
	assertSemanticNavigationModel(model)

	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'slide-zoom-structured', sourcePath)
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: outputRoot, encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	assertReplayedNavigation(await packageNavigationState(path.join(outputRoot, 'output', 'regenerated.pptx')))
})

test('both decyphers fail closed to one preserved Slide Zoom when Choice and fallback targets disagree', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-slide-zoom-mismatch-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const mainOutput = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.main-slide-zoom-mismatch-'))
	const structuredOutput = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.structured-slide-zoom-mismatch-'))
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.slide-zoom-mismatch-build-'))
	t.after(() => Promise.all([
		fs.rm(root, { recursive: true, force: true }),
		fs.rm(mainOutput, { recursive: true, force: true }),
		fs.rm(structuredOutput, { recursive: true, force: true }),
		fs.rm(buildRoot, { recursive: true, force: true }),
	]))
	await Promise.all(['assets', 'output', 'passthrough'].map(folder => fs.mkdir(path.join(structuredOutput, folder), { recursive: true })))
	const sourcePath = path.join(root, 'mismatch.pptx')
	const modelPath = path.join(root, 'main-model.json')
	await writeNavigationFixture(sourcePath)
	await mismatchZoomChoiceTarget(sourcePath)

	const main = spawnSync(process.execPath, [
		path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath,
		'--output', mainOutput, '--no-regenerate', '--json-model', modelPath,
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(main.status, 0, `${main.stdout}\n${main.stderr}`)
	const mainModel = JSON.parse(await fs.readFile(modelPath, 'utf8')).model
	const mainZooms = mainModel.slides[0].shapes.filter(shape => shape.name === 'Native Slide Zoom')
	assert.equal(mainZooms.length, 1)
	assert.equal(mainZooms[0].type, '__passthrough__')
	assert.equal(mainZooms[0].passthrough.originalType, 'slideZoom')

	const [{ PptxExtractor }, { PresentationParser }] = await sourceStructuredDecypher(buildRoot)
	const extracted = await new PptxExtractor({ outputDir: structuredOutput, extractXml: false, extractMedia: true, validate: false })
		.extract(await fs.readFile(sourcePath), structuredOutput)
	const structuredModel = await new PresentationParser().parse(extracted, structuredOutput)
	const structuredZooms = structuredModel.slides[0].shapes.filter(shape => shape.name === 'Native Slide Zoom')
	assert.equal(structuredZooms.length, 1)
	assert.equal(structuredZooms[0].type, '__passthrough__')
	assert.equal(structuredZooms[0].passthrough.originalType, 'slideZoom')
})
