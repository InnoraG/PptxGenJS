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

async function hyperlinkFixture() {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	pptx.addSlide().addText('Physical target', { x: 1, y: 1, w: 4, h: 0.5 })
	const source = pptx.addSlide()
	source.addShape('rect', {
		x: 0.5, y: 0.5, w: 2, h: 0.5, objectName: 'Object URL',
		hyperlink: { url: 'https://example.test/object?a=1&b=2', tooltip: 'Object site' },
	})
	source.addShape('rect', {
		x: 0.5, y: 1.25, w: 2, h: 0.5, objectName: 'Object slide',
		hyperlink: { slide: 1, tooltip: 'Object target' },
	})
	source.addShape('rect', {
		x: 3, y: 0.5, w: 2, h: 0.5, objectName: 'Object window',
		hyperlink: { url: 'https://example.test/object-window', tooltip: 'Object window' },
	})
	source.addText([
		{ text: 'URL', options: { hyperlink: { url: 'https://example.test/run', tooltip: 'Run site' } } },
		{ text: ' Slide', options: { hyperlink: { slide: 1, tooltip: 'Run target' } } },
		{ text: ' Window', options: { hyperlink: { url: 'https://example.test/window', tooltip: 'New window' } } },
	], { x: 0.5, y: 2, w: 7, h: 1, objectName: 'Linked runs' })
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const presentationXml = await zip.file('ppt/presentation.xml').async('string')
	const list = presentationXml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/)
	assert.ok(list)
	const slideIds = list[1].match(/<p:sldId\b[^>]*\/>/g)
	assert.equal(slideIds?.length, 2)
	zip.file('ppt/presentation.xml', presentationXml.replace(list[0], `<p:sldIdLst>${slideIds.reverse().join('')}</p:sldIdLst>`))
	const slideXml = await zip.file('ppt/slides/slide2.xml').async('string')
	zip.file('ppt/slides/slide2.xml', slideXml
		.replace('tooltip="Object window"', 'tooltip="Object window" tgtFrame="_blank"')
		.replace('tgtFrame="" tooltip="New window"', 'tgtFrame="_blank" tooltip="New window"'))
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function modelLinks(model) {
	assert.deepEqual(model.slides.map(slide => slide.id), ['slide-1', 'slide-2'])
	const shapes = model.slides[0].shapes
	const byName = new Map(shapes.map(shape => [shape.name, shape]))
	const runs = byName.get('Linked runs')?.text?.paragraphs.flatMap(paragraph => paragraph.runs) || []
	return { byName, runs }
}

function assertSafeLinks(model) {
	const { byName, runs } = modelLinks(model)
	assert.deepEqual(byName.get('Object URL')?.options?.hyperlink, {
		url: 'https://example.test/object?a=1&b=2', tooltip: 'Object site',
	})
	assert.deepEqual(byName.get('Object slide')?.options?.hyperlink, { slide: 2, tooltip: 'Object target' })
	assert.deepEqual(byName.get('Object window')?.options?.hyperlink, {
		url: 'https://example.test/object-window', tooltip: 'Object window', target: '_blank',
	})
	assert.deepEqual(runs.find(run => run.text === 'URL')?.properties?.hyperlink, { url: 'https://example.test/run', tooltip: 'Run site' })
	assert.deepEqual(runs.find(run => run.text === ' Slide')?.properties?.hyperlink, { slide: 2, tooltip: 'Run target' })
	const windowRun = runs.find(run => run.text === ' Window')
	assert.deepEqual(windowRun?.properties?.hyperlink, { url: 'https://example.test/window', tooltip: 'New window', target: '_blank' })
	assert.doesNotMatch(JSON.stringify({
		objectUrl: byName.get('Object URL')?.options?.hyperlink,
		objectSlide: byName.get('Object slide')?.options?.hyperlink,
		runs: runs.map(run => run.properties?.hyperlink),
	}), /rId\d+|ppt\/slides|slide\d+\.xml/i)
}

async function packageLinks(filePath) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	return { xml, rels }
}

function assertSafeReplay({ xml, rels }) {
	for (const tooltip of ['Object site', 'Object target', 'Run site', 'Run target']) assert.match(xml, new RegExp(`tooltip="${tooltip}"`))
	assert.equal((xml.match(/ppaction:\/\/hlinksldjump/g) || []).length, 2)
	assert.match(rels, /Target="https:\/\/example\.test\/object\?a=1&amp;b=2"/)
	assert.match(rels, /Target="https:\/\/example\.test\/run"/)
	assert.equal((rels.match(/Target="slide2\.xml"/g) || []).length, 2)
	assert.match(xml, /tooltip="Object window"[^>]*tgtFrame="_blank"/)
	assert.match(rels, /Target="https:\/\/example\.test\/object-window"/)
	assert.match(xml, /tgtFrame="_blank"[^>]*tooltip="New window"/)
	assert.match(rels, /Target="https:\/\/example\.test\/window"/)
}

test('main decypher resolves object and run links in presentation order and preserves run target/window XML', async t => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-main-hyperlink-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.main-hyperlink-'))
	t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	const sourcePath = path.join(root, 'hyperlinks.pptx')
	const modelPath = path.join(root, 'model.json')
	await fs.writeFile(sourcePath, await hyperlinkFixture())
	const result = spawnSync(process.execPath, [
		path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath,
		'--output', outputRoot, '--no-regenerate', '--json-model', modelPath,
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
	const payload = JSON.parse(await fs.readFile(modelPath, 'utf8'))
	assertSafeLinks(payload.model)
	const generatorPath = path.join(outputRoot, `hyperlinks__${payload.signature}`, 'generator.mjs')
	const replayPath = path.join(root, 'main-replayed.pptx')
	const replay = spawnSync(process.execPath, [generatorPath, '--out', replayPath], { cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	assertSafeReplay(await packageLinks(replayPath))
})

test('structured parser and CodeGenerator replay URL, slide, tooltip, and target/window semantics', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.hyperlink-build-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.hyperlink-structured-'))
	t.after(() => Promise.all([fs.rm(buildRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	await Promise.all(['assets', 'output', 'passthrough'].map(folder => fs.mkdir(path.join(outputRoot, folder), { recursive: true })))
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await sourceStructuredDecypher(buildRoot)
	const extracted = await new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: false, validate: false })
		.extract(await hyperlinkFixture(), outputRoot)
	const model = await new PresentationParser().parse(extracted, outputRoot)
	assertSafeLinks(model)
	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'hyperlink-structured', 'fixture.pptx')
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: outputRoot, encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	assertSafeReplay(await packageLinks(path.join(outputRoot, 'output', 'regenerated.pptx')))
})
