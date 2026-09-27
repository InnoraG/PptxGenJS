import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import JSZip from 'jszip'
import ts from 'typescript'

async function sourceCodeGenerator(buildRoot) {
	const sourcePath = path.resolve('src/pptx-decypher/generator/CodeGenerator.ts')
	const outputPath = path.join(buildRoot, 'CodeGenerator.js')
	await fs.writeFile(path.join(buildRoot, 'package.json'), '{"type":"module"}')
	await fs.writeFile(outputPath, ts.transpileModule(await fs.readFile(sourcePath, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
		fileName: sourcePath,
	}).outputText)
	return import(pathToFileURL(outputPath).href)
}

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

async function richTextFixture() {
	const zip = new JSZip()
	zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>')
	zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdRoot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
	zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rIdSlide1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>')
	zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSlide1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>')
	zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Rich copy"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="7315200" cy="2743200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr anchor="ctr" anchorCtr="0" wrap="square" lIns="0" rIns="91440" tIns="0" bIns="45720"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr" lvl="2" rtl="0" marL="457200" indent="-114300"><a:lnSpc><a:spcPct val="150000"/></a:lnSpc><a:spcBef><a:spcPts val="200"/></a:spcBef><a:spcAft><a:spcPts val="300"/></a:spcAft><a:buClr><a:srgbClr val="00AA00"/></a:buClr><a:buSzPts val="1400"/><a:buFont typeface="Arial"/><a:buChar char="✓"/><a:tabLst><a:tab pos="914400" algn="ctr"/></a:tabLst></a:pPr><a:r><a:rPr lang="fr-CA" sz="2000" b="0" i="0" u="dbl" strike="dblStrike" spc="125" baseline="0" rtl="0"><a:solidFill><a:srgbClr val="123456"><a:alpha val="75000"/></a:srgbClr></a:solidFill><a:highlight><a:srgbClr val="FFFF00"/></a:highlight><a:latin typeface="Aptos"/><a:cs typeface="Noto Naskh Arabic"/><a:hlinkClick r:id="rIdLink" tooltip="Open proof"/></a:rPr><a:t>Exact</a:t></a:r><a:br><a:rPr lang="en-US"/></a:br><a:fld id="{11111111-2222-3333-4444-555555555555}" type="slidenum"><a:rPr baseline="30000"/><a:t>1</a:t></a:fld></a:p><a:p><a:pPr algn="r"><a:buNone/></a:pPr><a:r><a:rPr baseline="-40000"/><a:t>Second paragraph</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/proof?a=1&amp;b=2" TargetMode="External"/></Relationships>')
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function textModel() {
	return {
		metadata: { title: 'Structured rich text replay', layout: { width: 13.333, height: 7.5 } },
		media: [],
		slides: [{
			index: 1,
			name: 'Rich text',
			shapes: [{
				id: 2,
				name: 'Rich copy',
				type: 'text',
				x: 1,
				y: 1,
				w: 8,
				h: 3,
				options: {},
				text: {
					paragraphs: [
						{
							properties: {
								align: 'center', level: 2, lineSpacing: 18, spaceBefore: 2, spaceAfter: 3,
								bullet: { type: 'bullet', character: '✓', color: '00AA00', size: 14 },
							},
							runs: [
								{
									text: 'Exact',
									properties: {
										fontSize: 20, fontFace: 'Aptos', bold: false, italic: false,
										underline: { style: 'dbl' }, strike: 'double', color: '123456',
										highlight: 'FFFF00', charSpacing: 1.25, baseline: 0,
									},
								},
								{ text: ' inline', properties: { bold: true } },
							],
						},
						{
							properties: { align: 'right', bullet: { type: 'none' } },
							runs: [{ text: 'Second paragraph', properties: { superscript: true } }],
						},
					],
				},
			}],
			animations: [],
		}],
	}
}

test('structured decypher replays modeled rich-run and first-run paragraph options without a synthetic break run', async t => {
	const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-structured-text-build-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.structured-text-'))
	t.after(() => Promise.all([
		fs.rm(buildRoot, { recursive: true, force: true }),
		fs.rm(outputRoot, { recursive: true, force: true }),
	]))
	await fs.mkdir(path.join(outputRoot, 'output'), { recursive: true })

	const { CodeGenerator } = await sourceCodeGenerator(buildRoot)
	const generatorPath = await new CodeGenerator().generate(textModel(), outputRoot, 'structured-text-test', 'fixture.pptx')
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: outputRoot, encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)

	const zip = await JSZip.loadAsync(await fs.readFile(path.join(outputRoot, 'output', 'regenerated.pptx')))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.equal((slideXml.match(/<a:p>/g) || []).length, 2)
	assert.equal((slideXml.match(/<a:r>/g) || []).length, 3)
	assert.match(slideXml, /<a:pPr[^>]*algn="ctr"[^>]*lvl="2"/)
	assert.match(slideXml, /<a:lnSpc><a:spcPts val="1800"\/><\/a:lnSpc>/)
	assert.match(slideXml, /<a:spcBef><a:spcPts val="200"\/><\/a:spcBef>/)
	assert.match(slideXml, /<a:spcAft><a:spcPts val="300"\/><\/a:spcAft>/)
	assert.match(slideXml, /<a:buChar char="&#x2713;"\/>/)
	assert.match(slideXml, /<a:rPr[^>]*b="0"[^>]*i="0"[^>]*strike="dblStrike"[^>]*u="dbl"[^>]*baseline="0"[^>]*spc="125"/)
	assert.match(slideXml, /<a:highlight><a:srgbClr val="FFFF00"\/><\/a:highlight>/)
	assert.match(slideXml, /<a:pPr[^>]*algn="r"[^>]*>[\s\S]*?<a:buNone\/>/)
	assert.match(slideXml, /baseline="30000"/)
})

test('structured parser retains typed rich runs, paragraph controls, breaks, fields, and resolved hyperlinks through replay', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.structured-text-parser-build-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.structured-text-parser-'))
	t.after(() => Promise.all([
		fs.rm(buildRoot, { recursive: true, force: true }),
		fs.rm(outputRoot, { recursive: true, force: true }),
	]))
	await Promise.all(['assets', 'output', 'passthrough'].map(folder => fs.mkdir(path.join(outputRoot, folder), { recursive: true })))
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await sourceStructuredDecypher(buildRoot)
	const extracted = await new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: false, validate: false })
		.extract(await richTextFixture(), outputRoot)
	const model = await new PresentationParser().parse(extracted, outputRoot)
	const text = model.slides[0].shapes.find(shape => shape.name === 'Rich copy')?.text
	assert.ok(text)
	assert.deepEqual(text.bodyProperties, { anchor: 'middle', anchorCtr: false, wrap: 'square', lIns: 0, rIns: 0.1, tIns: 0, bIns: 0.05, autoFit: 'shrink' })
	assert.equal(text.paragraphs.length, 2)
	assert.deepEqual(text.paragraphs[0].properties, {
		align: 'center', level: 2, rtlMode: false, indent: 36, hanging: 9,
		lineSpacingMultiple: 1.5, spaceBefore: 2, spaceAfter: 3,
		bullet: { type: 'bullet', character: '✓', font: 'Arial', color: '00AA00', size: 14 },
		tabStops: [{ position: 1, alignment: 'ctr' }],
	})
	assert.deepEqual(text.paragraphs[0].runs[0], {
		text: 'Exact',
		properties: {
			fontSize: 20, bold: false, italic: false, rtl: false, underline: { style: 'dbl' }, strike: 'dblStrike',
			charSpacing: 1.25, baseline: 0, lang: 'fr-CA', color: '123456', transparency: 25,
			highlight: 'FFFF00', fontFace: 'Aptos', fontFaceComplexScript: 'Noto Naskh Arabic',
			hyperlink: { url: 'https://example.com/proof?a=1&b=2', tooltip: 'Open proof' },
		},
	})
	assert.deepEqual(text.paragraphs[0].runs[1], {
		text: '1',
		properties: {
			superscript: true, field: { id: '{11111111-2222-3333-4444-555555555555}', type: 'slidenum' },
			lang: 'en-US', softBreakBefore: true,
		},
	})
	assert.equal(text.paragraphs[1].properties?.bullet?.type, 'none')
	assert.equal(text.paragraphs[1].runs[0].properties?.subscript, true)
	assert.doesNotMatch(JSON.stringify(text), /rIdLink|ppt\/|\.xml/i)

	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'structured-text-parser-test', 'fixture.pptx')
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: outputRoot, encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	const zip = await JSZip.loadAsync(await fs.readFile(path.join(outputRoot, 'output', 'regenerated.pptx')))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.equal((slideXml.match(/<a:p>/g) || []).length, 2)
	assert.equal((slideXml.match(/<a:r>/g) || []).length, 2)
	assert.match(slideXml, /<a:pPr[^>]*rtl="0"[^>]*algn="ctr"[^>]*indent="-114300"[^>]*marL="457200"[^>]*lvl="2"/)
	assert.match(slideXml, /<a:lnSpc><a:spcPct val="150000"\/><\/a:lnSpc>/)
	assert.match(slideXml, /<a:tabLst><a:tab pos="914400" algn="ctr"\/><\/a:tabLst>/)
	assert.match(slideXml, /<a:buChar char="&#x2713;"\/>/)
	assert.match(slideXml, /<a:rPr[^>]*b="0"[^>]*i="0"[^>]*strike="dblStrike"[^>]*u="dbl"[^>]*baseline="0"[^>]*spc="125"/)
	assert.match(slideXml, /<a:highlight><a:srgbClr val="FFFF00"\/><\/a:highlight>/)
	assert.match(slideXml, /<a:br[^>]*>/)
	assert.match(slideXml, /<a:fld id="\{11111111-2222-3333-4444-555555555555\}" type="slidenum">/)
	assert.match(slideXml, /baseline="30000"/)
	assert.match(slideXml, /baseline="-40000"/)
	assert.match(relsXml, /Target="https:\/\/example\.com\/proof\?a=1&amp;b=2"/)
})
