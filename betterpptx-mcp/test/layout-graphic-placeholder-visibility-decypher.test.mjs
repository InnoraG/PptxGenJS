import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import JSZip from 'jszip'
import ts from 'typescript'

const NS = {
	p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
	a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
	r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
	c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
}

function shapeTree(children = '') {
	return `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${children}</p:spTree>`
}

function graphicFrame({ id, name, phType, phIdx, customPrompt, payload }) {
	return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr><p:ph type="${phType}" idx="${phIdx}" sz="half" orient="vert" hasCustomPrompt="${customPrompt ? 1 : 0}"/></p:nvPr></p:nvGraphicFramePr><p:xfrm><a:off x="914400" y="914400"/><a:ext cx="3657600" cy="1828800"/></p:xfrm>${payload}</p:graphicFrame>`
}

const chartFrame = graphicFrame({
	id: 2, name: 'Chart Slot', phType: 'chart', phIdx: 0, customPrompt: false,
	payload: `<a:graphic><a:graphicData uri="${NS.c}"><c:chart r:id="rIdSourceChart"/></a:graphicData></a:graphic>`,
})

const tableFrame = graphicFrame({
	id: 3, name: 'Table Slot', phType: 'tbl', phIdx: 5, customPrompt: true,
	payload: '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="3657600"/></a:tblGrid><a:tr h="1828800"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr/><a:t>Cell</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr></a:tbl></a:graphicData></a:graphic>',
})

async function fixtureBuffer() {
	const zip = new JSZip()
	zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>')
	zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdRoot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
	zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rIdSlide1"/><p:sldId id="257" r:id="rIdSlide2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`)
	zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdSlide1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rIdSlide2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>')
	zip.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Master One">${shapeTree()}</p:cSld><p:clrMap accent1="accent1"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst></p:sldMaster>`)
	zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>')
	zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" type="blank"><p:cSld name="Graphic Layout">${shapeTree()}</p:cSld></p:sldLayout>`)
	zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
	zip.file('ppt/theme/theme1.xml', `<a:theme xmlns:a="${NS.a}" name="Graphic Theme"><a:themeElements><a:clrScheme name="Graphic"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme><a:fontScheme name="Graphic"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`)
	zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:c="${NS.c}" showMasterSp="0"><p:cSld>${shapeTree(chartFrame + tableFrame)}</p:cSld></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdSourceChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>')
	zip.file('ppt/slides/slide2.xml', `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld>${shapeTree()}</p:cSld></p:sld>`)
	zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')
	zip.file('ppt/charts/chart1.xml', `<c:chartSpace xmlns:c="${NS.c}"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Series 1</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:f>Sheet1!$A$2</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>A</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>7</c:v></c:pt></c:numCache></c:numRef></c:val><c:axId val="1"/><c:axId val="2"/></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`)
	zip.file('ppt/charts/_rels/chart1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function assertBindings(shapes, engine) {
	const chart = shapes.find(shape => shape.name === 'Chart Slot')
	const table = shapes.find(shape => shape.name === 'Table Slot')
	assert.ok(chart, `${engine} chart missing`)
	assert.ok(table, `${engine} table missing`)
	assert.deepEqual(chart.options.placeholderBinding, { type: 'chart', idx: 0, size: 'half', orient: 'vert', hasCustomPrompt: false })
	assert.deepEqual(table.options.placeholderBinding, { type: 'table', idx: 5, size: 'half', orient: 'vert', hasCustomPrompt: true })
	assert.equal(chart.options.phType, 'chart')
	assert.equal(table.options.phType, 'tbl')
	assert.doesNotMatch(JSON.stringify([chart.options.placeholderBinding, table.options.placeholderBinding]), /(?:ppt\/|\.xml|\brId\w*\b|[A-Z]:\\)/i)
}

async function firstNamedFile(root, name) {
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const filePath = path.join(root, entry.name)
		if (entry.isDirectory()) {
			const nested = await firstNamedFile(filePath, name)
			if (nested) return nested
		} else if (entry.name === name) return filePath
	}
	return undefined
}

async function slideXmls(pptxPath) {
	const zip = await JSZip.loadAsync(await fs.readFile(pptxPath))
	return Promise.all([1, 2, 3].map(async index => zip.file(`ppt/slides/slide${index}.xml`)?.async('string')))
}

async function compileStructuredDecypher(buildRoot) {
	const sourceRoot = path.resolve('src')
	async function visit(directory) {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const sourcePath = path.join(directory, entry.name)
			if (entry.isDirectory()) await visit(sourcePath)
			else if (entry.isFile() && entry.name.endsWith('.ts')) {
				const outputPath = path.join(buildRoot, 'src', path.relative(sourceRoot, sourcePath).replace(/\.ts$/, '.js'))
				const compiled = ts.transpileModule(await fs.readFile(sourcePath, 'utf8'), {
					compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
					fileName: sourcePath,
				}).outputText
				await fs.mkdir(path.dirname(outputPath), { recursive: true })
				await fs.writeFile(outputPath, compiled)
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
}

test('main decypher retains graphic-frame bindings and replays explicit/default master visibility', async t => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-graphic-placeholder-main-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.main-graphic-placeholder-'))
	t.after(() => Promise.all([fs.rm(tempRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	const sourcePath = path.join(tempRoot, 'graphic-placeholders.pptx')
	const modelPath = path.join(tempRoot, 'model.json')
	await fs.writeFile(sourcePath, await fixtureBuffer())

	const extract = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath, '--output', outputRoot, '--no-regenerate', '--json-model', modelPath], {
		cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000,
	})
	assert.equal(extract.status, 0, `${extract.stdout}\n${extract.stderr}`)
	const result = JSON.parse(await fs.readFile(modelPath, 'utf8'))
	assertBindings(result.model.slides[0].shapes, 'main')
	assert.equal(result.model.slides[0].showMasterShapes, false)
	assert.equal(Object.hasOwn(result.model.slides[1], 'showMasterShapes'), false)

	const generatorPath = await firstNamedFile(outputRoot, 'generator.mjs')
	assert.ok(generatorPath)
	const generatorCode = await fs.readFile(generatorPath, 'utf8')
	assert.match(generatorCode, /showMasterShapes: false/)
	assert.match(generatorCode, /"placeholderBinding":\{"type":"table"/)
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	const [slide1, slide2] = await slideXmls(path.join(path.dirname(generatorPath), 'output', 'regenerated.pptx'))
	assert.match(slide1, /showMasterSp="0"/)
	assert.match(slide1, /<p:ph\b[^>]*type="chart"[^>]*idx="0"/)
	assert.match(slide1, /<p:ph\b[^>]*type="tbl"[^>]*idx="5"/)
	assert.doesNotMatch(slide2, /showMasterSp=/)
})

test('structured decypher retains semantic/native bindings and replays false, null, and default visibility', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.structured-graphic-placeholder-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.structured-graphic-placeholder-'))
	t.after(() => Promise.all([fs.rm(buildRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	await Promise.all(['assets', 'output', 'passthrough'].map(folder => fs.mkdir(path.join(outputRoot, folder), { recursive: true })))
	await compileStructuredDecypher(buildRoot)
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await Promise.all([
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/extractor/PptxExtractor.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/parser/PresentationParser.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/generator/CodeGenerator.js')).href),
	])
	const extractor = new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: false, validate: false })
	const extracted = await extractor.extract(await fixtureBuffer(), outputRoot)
	const model = await new PresentationParser().parse(extracted, outputRoot)
	assertBindings(model.slides[0].shapes, 'structured')
	assert.equal(model.slides[0].showMasterShapes, false)
	assert.equal(Object.hasOwn(model.slides[1], 'showMasterShapes'), false)

	model.slides[1].showMasterShapes = null
	model.slides.push({ ...model.slides[1], index: 3, showMasterShapes: undefined, shapes: [], animations: [] })
	delete model.slides[2].showMasterShapes
	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'graphic-placeholder-test', 'fixture.pptx')
	const generatorCode = await fs.readFile(generatorPath, 'utf8')
	assert.match(generatorCode, /showMasterShapes: false/)
	assert.match(generatorCode, /showMasterShapes: null/)
	assert.match(generatorCode, /placeholderBinding: \{"type":"chart"/)
	assert.match(generatorCode, /placeholderBinding: \{"type":"table"/)
	const slide3Definition = generatorCode.match(/const SLIDE_3 = \{([\s\S]*?)\n\};/)?.[1] || ''
	assert.doesNotMatch(slide3Definition, /showMasterShapes/)

	const replay = spawnSync(process.execPath, [generatorPath], { cwd: outputRoot, encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	const [slide1, slide2, slide3] = await slideXmls(path.join(outputRoot, 'output', 'regenerated.pptx'))
	assert.match(slide1, /showMasterSp="0"/)
	assert.match(slide1, /<p:ph\b[^>]*type="chart"[^>]*idx="0"/)
	assert.match(slide1, /<p:ph\b[^>]*type="tbl"[^>]*idx="5"/)
	assert.doesNotMatch(slide2, /showMasterSp=/)
	assert.doesNotMatch(slide3, /showMasterSp=/)
})
