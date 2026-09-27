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
const THUMBNAIL_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const THUMBNAIL_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3t8AAAAASUVORK5CYII='

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

async function writeFixture(filePath) {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	for (const title of ['Overview', 'Details', 'Summary Landing']) pptx.addSection({ title })
	const overview = pptx.addSlide({ sectionTitle: 'Overview' })
	overview.addText('Overview', { x: 0.5, y: 0.25, w: 3, h: 0.5 })
	pptx.addSlide({ sectionTitle: 'Overview' }).addText('Overview two', { x: 1, y: 1, w: 3, h: 1 })
	pptx.addSlide({ sectionTitle: 'Details' }).addText('Details', { x: 1, y: 1, w: 3, h: 1 })
	overview.addSectionZoom({
		targetSection: 'Details', x: 1.25, y: 1.2, w: 3.4, h: 2.1,
		transitionDur: 1750, thumbnailDataUri: THUMBNAIL_A,
		objectName: 'Native Section Zoom', altText: 'Open the details section',
	})
	const summarySlide = pptx.addSlide({ sectionTitle: 'Summary Landing' })
	summarySlide.addSummaryZoom({
		sections: ['Overview', 'Details'], transitionDur: 2200,
		thumbnailDataUri: THUMBNAIL_A, objectName: 'Native Summary Zoom', altText: 'Section overview tiles',
	})
	const summary = summarySlide._slideObjects.at(-1)
	const second = summary.options._summaryObjs[1]
	const secondMedia = summarySlide._relsMedia.find(rel => rel.rId === second.thumbRid)
	secondMedia.data = THUMBNAIL_B
	await pptx.writeFile({ fileName: filePath })
}

function semanticShapes(model) {
	return model.slides.flatMap(slide => slide.shapes || [])
}

function assertSemanticModel(model) {
	assert.deepEqual(model.sections, [
		{ id: 'section-1', title: 'Overview', slideIds: ['slide-1', 'slide-2'] },
		{ id: 'section-2', title: 'Details', slideIds: ['slide-3'] },
		{ id: 'section-3', title: 'Summary Landing', slideIds: ['slide-4'] },
	])
	assert.equal(model.slides[0].sectionId, 'section-1')
	assert.equal(model.slides[3].sectionId, 'section-3')
	const sectionZoom = semanticShapes(model).find(shape => shape.name === 'Native Section Zoom')
	assert.equal(sectionZoom.type, 'sectionZoom')
	assert.equal(sectionZoom.kind, 'sectionZoom')
	assert.equal(sectionZoom.targetSectionId, 'section-2')
	assert.equal(sectionZoom.targetSlideId, 'slide-3')
	assert.equal(sectionZoom.transitionDur, 1750)
	assert.deepEqual(sectionZoom.bbox, { x: 1.25, y: 1.2, w: 3.4, h: 2.1 })
	assert.equal(sectionZoom.options.altText, 'Open the details section')
	assert.match(sectionZoom.options.thumbnailDataUri, /^data:image\/png;base64,/)

	const summaryZoom = semanticShapes(model).find(shape => shape.name === 'Native Summary Zoom')
	assert.equal(summaryZoom.type, 'summaryZoom')
	assert.equal(summaryZoom.kind, 'summaryZoom')
	assert.deepEqual(summaryZoom.sectionIds, ['section-1', 'section-2'])
	assert.equal(summaryZoom.summarySectionId, 'section-3')
	assert.equal(summaryZoom.transitionDur, 2200)
	assert.equal(summaryZoom.options.altText, 'Section overview tiles')
	assert.deepEqual(summaryZoom.summaryZoomItems.map(item => [item.targetSectionId, item.targetSlideId]), [
		['section-1', 'slide-1'], ['section-2', 'slide-3'],
	])
	assert.notEqual(summaryZoom.summaryZoomItems[0].thumbnailDataUri, summaryZoom.summaryZoomItems[1].thumbnailDataUri)
	assert.ok(summaryZoom.summaryZoomItems.every(item => item.bbox.w > 0 && item.bbox.h > 0))
	assert.doesNotMatch(JSON.stringify({ sections: model.sections, sectionZoom, summaryZoom }), /\{[0-9A-F]{8}-|rId\d+|ppt\/slides|ppt\/media|slide\d+\.xml/i)
}

async function packageState(filePath) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	return {
		presentation: await zip.file('ppt/presentation.xml').async('string'),
		sectionSlide: await zip.file('ppt/slides/slide1.xml').async('string'),
		summarySlide: await zip.file('ppt/slides/slide4.xml').async('string'),
		summaryRels: await zip.file('ppt/slides/_rels/slide4.xml.rels').async('string'),
		media: await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/media\/[^/]+$/.test(name)).sort().map(name => zip.file(name).async('base64'))),
	}
}

function assertReplay(state) {
	assert.match(state.sectionSlide, /powerpoint\/2016\/sectionzoom/)
	assert.match(state.sectionSlide, /transitionDur="1750"/)
	assert.match(state.sectionSlide, /name="Native Section Zoom"[^>]*descr="Open the details section"/)
	assert.match(state.summarySlide, /powerpoint\/2016\/summaryzoom/)
	assert.equal((state.summarySlide.match(/<psuz:summaryZmObj /g) || []).length, 2)
	assert.equal((state.summarySlide.match(/ppaction:\/\/hlinksldjump/g) || []).length, 2)
	assert.match(state.summarySlide, /name="Native Summary Zoom"[^>]*descr="Section overview tiles"/)
	for (const title of ['Overview', 'Details', 'Summary Landing']) assert.match(state.presentation, new RegExp(`name="${title}"`))
	assert.match(state.summaryRels, /Target="slide1\.xml"/)
	assert.match(state.summaryRels, /Target="slide3\.xml"/)
	assert.ok(state.media.includes(THUMBNAIL_A.split(',')[1]))
	assert.ok(state.media.includes(THUMBNAIL_B.split(',')[1]))
}

test('main decypher retains and replays native Section and Summary Zoom semantics', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-main-section-summary-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.main-section-summary-'))
	t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	const sourcePath = path.join(root, 'zoom.pptx')
	const modelPath = path.join(root, 'model.json')
	const replayPath = path.join(root, 'replayed.pptx')
	await writeFixture(sourcePath)
	const result = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath,
		'--output', outputRoot, '--no-regenerate', '--json-model', modelPath], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
	const payload = JSON.parse(await fs.readFile(modelPath, 'utf8'))
	assertSemanticModel(payload.model)
	const generatorPath = path.join(outputRoot, `zoom__${payload.signature}`, 'generator.mjs')
	const replay = spawnSync(process.execPath, [generatorPath, '--out', replayPath], { cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	assertReplay(await packageState(replayPath))
})

test('structured parser and CodeGenerator retain and replay native Section and Summary Zoom semantics', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.section-summary-build-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.section-summary-structured-'))
	t.after(() => Promise.all([fs.rm(buildRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	await Promise.all(['assets', 'output', 'passthrough'].map(folder => fs.mkdir(path.join(outputRoot, folder), { recursive: true })))
	const sourcePath = path.join(outputRoot, 'zoom.pptx')
	await writeFixture(sourcePath)
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await sourceStructuredDecypher(buildRoot)
	const extracted = await new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: true, validate: false }).extract(await fs.readFile(sourcePath), outputRoot)
	const model = await new PresentationParser().parse(extracted, outputRoot)
	assertSemanticModel(model)
	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'section-summary', sourcePath)
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: outputRoot, encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	assertReplay(await packageState(path.join(outputRoot, 'output', 'regenerated.pptx')))
})

test('both decyphers fail closed when Summary Zoom Choice and fallback section targets disagree', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-summary-mismatch-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const mainOutput = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.main-summary-mismatch-'))
	const structuredOutput = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.structured-summary-mismatch-'))
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.summary-mismatch-build-'))
	t.after(() => Promise.all([root, mainOutput, structuredOutput, buildRoot].map(dir => fs.rm(dir, { recursive: true, force: true }))))
	await Promise.all(['assets', 'output', 'passthrough'].map(folder => fs.mkdir(path.join(structuredOutput, folder), { recursive: true })))
	const sourcePath = path.join(root, 'mismatch.pptx')
	const modelPath = path.join(root, 'model.json')
	await writeFixture(sourcePath)
	const zip = await JSZip.loadAsync(await fs.readFile(sourcePath))
	const xml = await zip.file('ppt/slides/slide4.xml').async('string')
	const sectionIds = [...xml.matchAll(/<psuz:summaryZmObj sectionId="([^"]+)"/g)].map(match => match[1])
	zip.file('ppt/slides/slide4.xml', xml.replace(`sectionId="${sectionIds[1]}"`, `sectionId="${sectionIds[0]}"`))
	await fs.writeFile(sourcePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

	const main = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath,
		'--output', mainOutput, '--no-regenerate', '--json-model', modelPath], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(main.status, 0, `${main.stdout}\n${main.stderr}`)
	const mainShape = semanticShapes(JSON.parse(await fs.readFile(modelPath, 'utf8')).model).find(shape => shape.name === 'Native Summary Zoom')
	assert.equal(mainShape.type, '__passthrough__')
	assert.equal(mainShape.passthrough.originalType, 'summaryZoom')

	const [{ PptxExtractor }, { PresentationParser }] = await sourceStructuredDecypher(buildRoot)
	const extracted = await new PptxExtractor({ outputDir: structuredOutput, extractXml: false, extractMedia: true, validate: false }).extract(await fs.readFile(sourcePath), structuredOutput)
	const structuredShape = semanticShapes(await new PresentationParser().parse(extracted, structuredOutput)).find(shape => shape.name === 'Native Summary Zoom')
	assert.equal(structuredShape.type, '__passthrough__')
	assert.equal(structuredShape.passthrough.originalType, 'summaryZoom')
})
