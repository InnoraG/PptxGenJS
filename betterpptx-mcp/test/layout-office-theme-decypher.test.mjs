import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import JSZip from 'jszip'
import ts from 'typescript'

const execFileAsync = promisify(execFile)
const OFFICE_FAMILY_ID = '{62F939B6-93AF-4DB8-9C6B-D6C7DFDC589F}'
const NS = {
	p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
	a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
	r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
	thm15: 'http://schemas.microsoft.com/office/thememl/2012/main',
}
const COLORS = {
	dk1: '101112', lt1: 'FAFBFC', dk2: '202122', lt2: 'EAEBEC',
	accent1: '123456', accent2: '234567', accent3: '345678', accent4: '456789',
	accent5: '56789A', accent6: '6789AB', hlink: '13579B', folHlink: '97531B',
}

function shapeTree() {
	return '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>'
}

function themeXml(familyId = OFFICE_FAMILY_ID) {
	const scheme = Object.entries(COLORS).map(([slot, color]) => `<a:${slot}><a:srgbClr val="${color}"/></a:${slot}>`).join('')
	return `<a:theme xmlns:a="${NS.a}" xmlns:thm15="${NS.thm15}" name="Office Theme"><a:themeElements><a:clrScheme name="Office">${scheme}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Theme Head Override"/></a:majorFont><a:minorFont><a:latin typeface="Theme Body Override"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements><a:extLst><a:ext uri="{05A4C25C-085E-4340-85A3-A5531E510DB2}"><thm15:themeFamily name="Office Theme" id="${familyId}" vid="{4A3C46E8-61CC-4603-A589-7422A47A8E4A}"/></a:ext></a:extLst></a:theme>`
}

async function fixtureBuffer(familyId = OFFICE_FAMILY_ID) {
	const zip = new JSZip()
	zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>')
	zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
	zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rIdSlide"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`)
	zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdSlide" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>')
	zip.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Office Master">${shapeTree()}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle><a:defPPr><a:defRPr lang="fr-FR"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>`)
	zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>')
	zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" type="blank"><p:cSld name="Office Blank">${shapeTree()}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
	zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
	zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Office Theme Proof">${shapeTree()}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')
	zip.file('ppt/theme/theme1.xml', themeXml(familyId))
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

function assertOfficeTheme(model) {
	assert.equal(model.themePresetId, 'theme-office-001')
	assert.equal(Object.hasOwn(model, 'template'), false, 'native theme identity must not invent a bundled template source')
	assert.deepEqual(model.theme, {
		name: 'Office Theme', fontFace: 'Theme Body Override', bodyFontFace: 'Theme Body Override',
		headFontFace: 'Theme Head Override', lang: 'fr-FR', colorScheme: COLORS,
	})
	assert.doesNotMatch(JSON.stringify(model), /template-office-baseline|office-baseline-wide\.pptx|[A-Z]:\\/i)
}

async function assertThemeReplay(filePath) {
	const replay = await JSZip.loadAsync(await fs.readFile(filePath))
	const theme = await replay.file('ppt/theme/theme1.xml').async('text')
	const master = await replay.file('ppt/slideMasters/slideMaster1.xml').async('text')
	assert.match(theme, /name="Office Theme"/)
	assert.match(theme, /themeFamily[^>]+id="\{62F939B6-93AF-4DB8-9C6B-D6C7DFDC589F\}"/)
	assert.match(theme, /<a:majorFont>[\s\S]*?<a:latin typeface="Theme Head Override"/)
	assert.match(theme, /<a:minorFont>[\s\S]*?<a:latin typeface="Theme Body Override"/)
	for (const [slot, color] of Object.entries(COLORS)) assert.match(theme, new RegExp(`<a:${slot}><a:srgbClr val="${color}"`))
	assert.match(master, /<a:defRPr[^>]+lang="fr-FR"/)
}

test('main decypher recognizes and replays the native Office theme family with realized overrides', async t => {
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const tempRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.office-theme-main-'))
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.office-theme-main-'))
	t.after(() => Promise.all([fs.rm(tempRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	const sourcePath = path.join(tempRoot, 'office-theme.pptx')
	const modelPath = path.join(tempRoot, 'model.json')
	await fs.writeFile(sourcePath, await fixtureBuffer())
	const extract = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath, '--output', outputRoot, '--no-regenerate', '--json-model', modelPath], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(extract.status, 0, `${extract.stdout}\n${extract.stderr}`)
	assertOfficeTheme(JSON.parse(await fs.readFile(modelPath, 'utf8')).model)
	const generatorPath = await firstNamedFile(outputRoot, 'generator.mjs')
	assert.ok(generatorPath)
	const code = await fs.readFile(generatorPath, 'utf8')
	assert.match(code, /const THEME_PRESET_ID = "theme-office-001"/)
	assert.doesNotMatch(code, /template-office-baseline-wide-001|office-baseline-wide\.pptx/)
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	await assertThemeReplay(path.join(path.dirname(generatorPath), 'output', 'regenerated.pptx'))
})

test('structured parser and CodeGenerator retain Office selector identity without guessing a template', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.office-theme-build-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.office-theme-structured-'))
	t.after(() => Promise.all([fs.rm(buildRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	await compileStructuredDecypher(buildRoot)
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await Promise.all([
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/extractor/PptxExtractor.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/parser/PresentationParser.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/generator/CodeGenerator.js')).href),
	])
	const extractor = new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: false, validate: false })
	const parser = new PresentationParser()
	const model = await parser.parse(await extractor.extract(await fixtureBuffer(), outputRoot), outputRoot)
	assertOfficeTheme(model)
	const unmarked = await parser.parse(await extractor.extract(await fixtureBuffer('{00000000-0000-0000-0000-000000000000}'), outputRoot), outputRoot)
	assert.equal(Object.hasOwn(unmarked, 'themePresetId'), false, 'theme name alone is not sufficient preset evidence')
	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'office-theme', 'fixture.pptx')
	await fs.mkdir(path.join(outputRoot, 'output'), { recursive: true })
	await execFileAsync(process.execPath, [generatorPath], { cwd: outputRoot })
	assert.match(await fs.readFile(generatorPath, 'utf8'), /const THEME_PRESET_ID = "theme-office-001"/)
	await assertThemeReplay(path.join(outputRoot, 'output', 'regenerated.pptx'))
})
