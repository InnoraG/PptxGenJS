import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import JSZip from 'jszip'
import ts from 'typescript'

const execFileAsync = promisify(execFile)
const NS = {
	p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
	a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
	r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

function shapeTree() {
	return '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>'
}

function slideXml({ name, attrs, transition }) {
	return `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" ${attrs}><p:cSld name="${name}">${shapeTree()}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transition}</p:sld>`
}

function notesXml() {
	return `<p:notes xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:cSld>${shapeTree().replace('</p:spTree>', '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide image"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>IGNORED SLIDE IMAGE</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Speaker &amp; detail — café 日本語</a:t></a:r></a:p><a:p><a:r><a:t>Second line</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>')}</p:cSld></p:notes>`
}

async function fixtureBuffer() {
	const zip = new JSZip()
	zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>')
	zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
	zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="300" r:id="rIdSlide2"/><p:sldId id="256" r:id="rIdSlide1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`)
	zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdSlide1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rIdSlide2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>')
	zip.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Lifecycle Master">${shapeTree()}</p:cSld><p:clrMap accent1="accent1"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst></p:sldMaster>`)
	zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')
	zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" type="blank"><p:cSld name="Lifecycle Layout">${shapeTree()}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
	zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
	zip.file('ppt/slides/slide2.xml', slideXml({ name: 'Hidden Agenda', attrs: 'show="0" showMasterSp="0" showMasterPhAnim="false"', transition: '<p:transition spd="slow" advClick="0" advTm="2500"><p:push dir="l"/></p:transition>' }))
	zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide9.xml"/></Relationships>')
	zip.file('ppt/slides/slide1.xml', slideXml({ name: 'Visible Detail', attrs: 'show="1" showMasterSp="1" showMasterPhAnim="true"', transition: '<p:transition spd="fast" advClick="1"><p:fade/></p:transition>' }))
	zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')
	zip.file('ppt/notesSlides/notesSlide9.xml', notesXml())
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function compileStructuredDecypher(buildRoot) {
	const sourceRoot = path.resolve('src')
	async function visit(directory) {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const sourcePath = path.join(directory, entry.name)
			if (entry.isDirectory()) await visit(sourcePath)
			else if (entry.isFile() && entry.name.endsWith('.ts')) {
				const outputPath = path.join(buildRoot, 'src', path.relative(sourceRoot, sourcePath).replace(/\.ts$/, '.js'))
				const output = ts.transpileModule(await fs.readFile(sourcePath, 'utf8'), {
					compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: sourcePath,
				}).outputText
				await fs.mkdir(path.dirname(outputPath), { recursive: true })
				await fs.writeFile(outputPath, output)
			}
		}
	}
	await fs.writeFile(path.join(buildRoot, 'package.json'), '{"type":"module"}')
	await visit(path.join(sourceRoot, 'pptx-decypher'))
	const registrySource = path.join(sourceRoot, 'gen-animations-registry-merged.ts')
	const registryOutput = path.join(buildRoot, 'src', 'gen-animations-registry-merged.js')
	await fs.mkdir(path.dirname(registryOutput), { recursive: true })
	await fs.writeFile(registryOutput, ts.transpileModule(await fs.readFile(registrySource, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: registrySource,
	}).outputText)
}

async function firstNamedFile(root, fileName) {
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const entryPath = path.join(root, entry.name)
		if (entry.isFile() && entry.name === fileName) return entryPath
		if (entry.isDirectory()) {
			const nested = await firstNamedFile(entryPath, fileName)
			if (nested) return nested
		}
	}
	return undefined
}

function assertSlideSemantics(model) {
	assert.deepEqual(model.slides.map(slide => slide.id), ['slide-1', 'slide-2'])
	assert.deepEqual(model.slides.map(slide => slide.title), ['Hidden Agenda', 'Visible Detail'])
	assert.equal(model.slides[0].layoutName, 'Lifecycle_Layout')
	assert.equal(model.slides[0].masterName, 'Lifecycle_Master')
	assert.equal(model.slides[0].hidden, true)
	assert.equal(model.slides[0].showMasterShapes, false)
	assert.equal(model.slides[0].showMasterBackground, false)
	assert.equal(model.slides[0].showMasterPhAnim, false)
	assert.deepEqual(model.slides[0].transition, { type: 'push', speed: 'slow', advanceOnClick: false, advanceAfterTime: 2500, direction: 'left' })
	assert.equal(model.slides[0].notes, 'Speaker & detail — café 日本語\nSecond line')
	assert.equal(model.slides[1].hidden, false)
	assert.equal(model.slides[1].showMasterShapes, true)
	assert.equal(model.slides[1].showMasterBackground, true)
	assert.equal(model.slides[1].showMasterPhAnim, true)
	assert.deepEqual(model.slides[1].transition, { type: 'fade', speed: 'fast', advanceOnClick: true })
	assert.doesNotMatch(JSON.stringify(model.slides), /notesSlide9|rIdNotes|IGNORED SLIDE IMAGE/)
}

async function assertReplay(filePath) {
	const replay = await JSZip.loadAsync(await fs.readFile(filePath))
	const firstSlide = await replay.file('ppt/slides/slide1.xml').async('text')
	const secondSlide = await replay.file('ppt/slides/slide2.xml').async('text')
	const firstNotes = await replay.file('ppt/notesSlides/notesSlide1.xml').async('text')
	assert.match(firstSlide, /<p:sld[^>]+show="0"[^>]+showMasterSp="0"[^>]+showMasterPhAnim="0"/)
	assert.match(firstSlide, /<p:cSld name="Hidden Agenda">/)
	assert.match(firstSlide, /<p:transition[^>]+spd="slow"[^>]+advClick="0"[^>]+advTm="2500"/)
	assert.match(firstSlide, /<p:push dir="l"/)
	assert.match(secondSlide, /<p:cSld name="Visible Detail">/)
	assert.doesNotMatch(secondSlide, /show="0"|showMasterSp="0"|showMasterPhAnim="0"/)
	assert.match(firstNotes, /Speaker &amp; detail — café 日本語/)
	assert.match(firstNotes, /Second line/)
	assert.doesNotMatch(firstNotes, /IGNORED SLIDE IMAGE/)
}

test('main decypher retains presentation-ordered add-slide semantics and replays them', async t => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-slide-add-main-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.slide-add-main-'))
	t.after(() => Promise.all([fs.rm(tempRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	const sourcePath = path.join(tempRoot, 'slide-add.pptx')
	const modelPath = path.join(tempRoot, 'model.json')
	await fs.writeFile(sourcePath, await fixtureBuffer())
	const run = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath, '--output', outputRoot, '--no-regenerate', '--json-model', modelPath], {
		cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000,
	})
	assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
	const result = JSON.parse(await fs.readFile(modelPath, 'utf8'))
	assertSlideSemantics(result.model)
	const generatorPath = await firstNamedFile(outputRoot, 'generator.mjs')
	assert.ok(generatorPath)
	assert.match(await fs.readFile(generatorPath, 'utf8'), /_betterpptxSemanticId = slideDef\.id/)
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	await assertReplay(path.join(path.dirname(generatorPath), 'output', 'regenerated.pptx'))
})

test('structured parser and CodeGenerator retain and replay add-slide semantics', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.slide-add-build-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.slide-add-'))
	t.after(() => Promise.all([fs.rm(buildRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	await compileStructuredDecypher(buildRoot)
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await Promise.all([
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/extractor/PptxExtractor.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/parser/PresentationParser.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/generator/CodeGenerator.js')).href),
	])
	const extractor = new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: false, validate: false })
	const model = await new PresentationParser().parse(await extractor.extract(await fixtureBuffer(), outputRoot), outputRoot)
	assertSlideSemantics(model)
	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'slide-add', 'fixture.pptx')
	await fs.mkdir(path.join(outputRoot, 'output'), { recursive: true })
	await execFileAsync(process.execPath, [generatorPath], { cwd: path.resolve('.') })
	assert.match(await fs.readFile(generatorPath, 'utf8'), /_betterpptxSemanticId = slideDef\.id/)
	await assertReplay(path.join(outputRoot, 'output', 'regenerated.pptx'))
})
