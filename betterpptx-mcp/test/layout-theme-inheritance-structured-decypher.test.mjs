import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { promisify } from 'node:util'

import Ajv from 'ajv'
import JSZip from 'jszip'
import ts from 'typescript'

const execFileAsync = promisify(execFile)

const NS = {
	p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
	a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
	r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

function shapeTree(children) {
	return `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${children}</p:spTree>`
}

function placeholder({ id, name, type, idx = 0, size, orient, customPrompt, x, y, w, h, preset = 'rect', spPr = '', style = '', text = '' }) {
	const attrs = [
		`type="${type}"`, `idx="${idx}"`, size ? `sz="${size}"` : '', orient ? `orient="${orient}"` : '',
		customPrompt !== undefined ? `hasCustomPrompt="${customPrompt ? 1 : 0}"` : '',
	].filter(Boolean).join(' ')
	return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph ${attrs}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>${spPr}</p:spPr>${style}${text || '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody>'}</p:sp>`
}

function fixedText() {
	return '<p:sp><p:nvSpPr><p:cNvPr id="10" name="Fixed Master Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="228600" y="114300"/><a:ext cx="2743200" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="445566"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr anchor="b"/><a:lstStyle/><a:p><a:pPr algn="ctr"><a:defRPr lang="en-GB" sz="1200" b="0" i="1"><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill><a:latin typeface="Fixed Font"/></a:defRPr></a:pPr><a:r><a:t>MASTER FIXED</a:t></a:r></a:p></p:txBody></p:sp>'
}

function fixedRect() {
	return '<p:sp><p:nvSpPr><p:cNvPr id="11" name="Fixed Master Rect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="3657600" y="114300"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="334455"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>'
}

function fixedLine() {
	return '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="12" name="Fixed Layout Line"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="457200" y="1828800"/><a:ext cx="3657600" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="25400"><a:solidFill><a:srgbClr val="778899"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr></p:cxnSp>'
}

async function fixtureBuffer() {
	const zip = new JSZip()
	zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>')
	zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/><p:sldMasterId id="2147483649" r:id="rIdPrivateMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rIdSlide"/><p:sldId id="257" r:id="rIdSlide2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`)
	zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdPrivateMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster2.xml"/><Relationship Id="rIdSlide" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rIdSlide2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>')

	const masterPlaceholder = placeholder({
		id: 2, name: 'Master Title', type: 'title', x: 914400, y: 457200, w: 10058400, h: 914400, preset: 'roundRect',
		spPr: '<a:solidFill><a:schemeClr val="accent1"><a:alpha val="80000"/></a:schemeClr></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="445566"/></a:solidFill><a:prstDash val="dash"/></a:ln><a:effectLst><a:outerShdw blurRad="38100" dist="25400" dir="2700000"><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:outerShdw></a:effectLst>',
		style: '<p:style><a:lnRef idx="2"><a:schemeClr val="accent2"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent3"/></a:effectRef><a:fontRef idx="major"><a:schemeClr val="tx1"/></a:fontRef></p:style>',
		text: '<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"><a:defRPr lang="en-GB" sz="2600" b="1" i="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Master Placeholder Font"/></a:defRPr></a:pPr></a:p></p:txBody>',
	})
	const unsupported = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="13" name="Preservation Only Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></p:xfrm><a:graphic><a:graphicData uri="urn:unsupported"><x:payload xmlns:x="urn:unsupported" r:id="rIdPrivatePayload"/></a:graphicData></a:graphic></p:graphicFrame>'
	const txStyles = '<p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr lang="en-GB" sz="4400" b="1" i="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Major Title"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr algn="l"><a:defRPr lang="en-GB" sz="2800" b="0" i="0"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:latin typeface="Minor Body"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr algn="r"><a:defRPr lang="en-GB" sz="1800" i="1"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:latin typeface="Other Text"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles>'
	zip.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Master Alpha"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F0F1F2"><a:alpha val="90000"/></a:srgbClr></a:solidFill></p:bgPr></p:bg>${shapeTree(masterPlaceholder + fixedText() + fixedRect() + unsupported)}</p:cSld><p:clrMap accent1="accent2" accent2="accent1" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt2" bg2="lt1" folHlink="folHlink" hlink="hlink" tx1="dk2" tx2="dk1"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst>${txStyles}</p:sldMaster>`)
	zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>')
	zip.file('ppt/slideMasters/slideMaster2.xml', `<p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Secondary Master">${shapeTree(fixedRect())}</p:cSld><p:clrMap accent1="accent1"/></p:sldMaster>`)
	zip.file('ppt/slideMasters/_rels/slideMaster2.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdPrivateTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/></Relationships>')

	const layoutPlaceholders = placeholder({
		id: 2, name: 'Layout Title', type: 'title', idx: 0, size: 'full', orient: 'horz', customPrompt: false,
		x: 457200, y: 228600, w: 11277600, h: 914400,
		spPr: '<a:noFill/><a:ln><a:solidFill><a:schemeClr val="accent4"/></a:solidFill></a:ln>',
		text: '<p:txBody><a:bodyPr anchor="t"/><a:lstStyle/><a:p><a:pPr algn="l"><a:defRPr sz="2200" b="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Layout Placeholder Font"/></a:defRPr></a:pPr></a:p></p:txBody>',
	}) + placeholder({ id: 3, name: 'Unsafe Header', type: 'hdr', idx: 9, x: 0, y: 0, w: 914400, h: 228600 })
	zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" type="titleOnly"><p:cSld name="Editorial Wide"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="DDEEFF"/></a:solidFill></p:bgPr></p:bg>${shapeTree(layoutPlaceholders + fixedLine())}</p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="dk2" accent1="accent2"/></p:clrMapOvr><p:hf hdr="1" ftr="0" sldNum="1"/></p:sldLayout>`)
	zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
	zip.file('ppt/slideLayouts/slideLayout2.xml', `<p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" type="blank"><p:cSld name="Secondary Layout">${shapeTree('')}</p:cSld></p:sldLayout>`)
	zip.file('ppt/slideLayouts/_rels/slideLayout2.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdPrivateMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster2.xml"/></Relationships>')

	zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" showMasterSp="0" showMasterPhAnim="false"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></p:bgPr></p:bg>${shapeTree('')}</p:cSld><p:clrMapOvr><a:overrideClrMapping accent1="accent3"/></p:clrMapOvr></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')
	zip.file('ppt/slides/slide2.xml', `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld>${shapeTree('')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
	zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/></Relationships>')

	zip.file('ppt/theme/theme1.xml', `<a:theme xmlns:a="${NS.a}" name="Editorial Theme"><a:themeElements><a:clrScheme name="Editorial"><a:dk1><a:sysClr val="windowText" lastClr="101010"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FEFEFE"/></a:lt1><a:dk2><a:srgbClr val="202A35"/></a:dk2><a:lt2><a:srgbClr val="E8ECF1"/></a:lt2><a:accent1><a:srgbClr val="0057B8"/></a:accent1><a:accent2><a:srgbClr val="FF7A00"/></a:accent2><a:accent3><a:srgbClr val="22A06B"/></a:accent3><a:accent4><a:srgbClr val="7A5AF8"/></a:accent4><a:accent5><a:srgbClr val="D64550"/></a:accent5><a:accent6><a:srgbClr val="00A3BF"/></a:accent6><a:hlink><a:srgbClr val="1155CC"/></a:hlink><a:folHlink><a:srgbClr val="7B1FA2"/></a:folHlink></a:clrScheme><a:fontScheme name="Editorial Fonts"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`)
	zip.file('ppt/theme/theme2.xml', `<a:theme xmlns:a="${NS.a}" name="Preservation Theme"><a:themeElements><a:clrScheme name="Wrong"><a:dk1><a:srgbClr val="000000"/></a:dk1></a:clrScheme><a:fontScheme name="Wrong"><a:majorFont><a:latin typeface="Wrong Major"/></a:majorFont><a:minorFont><a:latin typeface="Wrong Minor"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`)
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function compileStructuredDecypher(buildRoot) {
	const sourceRoot = path.resolve('src')
	async function visit(directory) {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			const sourcePath = path.join(directory, entry.name)
			if (entry.isDirectory()) await visit(sourcePath)
			else if (entry.isFile() && entry.name.endsWith('.ts')) {
				const relative = path.relative(sourceRoot, sourcePath).replace(/\.ts$/, '.js')
				const outputPath = path.join(buildRoot, 'src', relative)
				const source = await fs.readFile(sourcePath, 'utf8')
				const compiled = ts.transpileModule(source, {
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

test('structured decypher projects ordered multiple-master graphs without package identity leakage', async t => {
	const buildRoot = await fs.mkdtemp(path.join(path.resolve('betterpptx-mcp/test'), '.structured-inheritance-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.structured-inheritance-'))
	t.after(() => Promise.all([
		fs.rm(buildRoot, { recursive: true, force: true }),
		fs.rm(outputRoot, { recursive: true, force: true }),
	]))
	await compileStructuredDecypher(buildRoot)
	const [{ PptxExtractor }, { PresentationParser }, { CodeGenerator }] = await Promise.all([
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/extractor/PptxExtractor.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/parser/PresentationParser.js')).href),
		import(pathToFileURL(path.join(buildRoot, 'src/pptx-decypher/generator/CodeGenerator.js')).href),
	])
	const extractor = new PptxExtractor({ outputDir: outputRoot, extractXml: false, extractMedia: false, validate: false })
	const extracted = await extractor.extract(await fixtureBuffer(), outputRoot)
	assert.equal(extracted.slideMasters.size, 2)
	assert.equal(extracted.slideLayouts.size, 2)
	assert.match(extracted.slideMasters.get(1).xml, /rIdPrivatePayload/, 'unsupported content remains privately retained')

	const model = await new PresentationParser().parse(extracted, outputRoot)
	assert.deepEqual(model.theme, {
		name: 'Editorial Theme', fontFace: 'Aptos', bodyFontFace: 'Aptos', headFontFace: 'Aptos Display', lang: 'en-GB',
		colorScheme: {
			dk1: '101010', lt1: 'FEFEFE', dk2: '202A35', lt2: 'E8ECF1',
			accent1: '0057B8', accent2: 'FF7A00', accent3: '22A06B', accent4: '7A5AF8',
			accent5: 'D64550', accent6: '00A3BF', hlink: '1155CC', folHlink: '7B1FA2',
		},
	})
	assert.equal(model.masters.length, 2)
	assert.equal(model.layouts.length, 2)
	assert.deepEqual(model.masters[0], {
		title: 'Master_Alpha', name: 'Master_Alpha',
		background: { type: 'solid', color: 'F0F1F2', transparency: 10 },
		objects: [
			{ text: { text: 'MASTER FIXED', options: { x: 0.25, y: 0.125, w: 3, h: 0.5, objectName: 'Fixed Master Text', fill: { type: 'solid', color: '112233' }, line: { type: 'solid', color: '445566', width: 1 }, fontFace: 'Fixed Font', fontSize: 12, color: 'AABBCC', bold: false, italic: true, align: 'center', valign: 'bottom' } } },
			{ rect: { x: 4, y: 0.125, w: 1, h: 0.5, objectName: 'Fixed Master Rect', fill: { type: 'solid', color: '334455' }, line: { type: 'none' } } },
		],
		placeholders: [{
			name: 'Master_Title', type: 'title', idx: 0, x: 1, y: 0.5, w: 11, h: 1,
			style: {
				preset: 'roundRect', fill: { type: 'solid', color: 'accent1', transparency: 20 },
				line: { type: 'solid', color: '445566', width: 2, dashType: 'dash' },
				shadow: { type: 'outer', color: '000000', blur: 3, distance: 2, angle: 45, opacity: 0.5 },
				styleRefs: { line: { index: 2, color: 'accent2' }, fill: { index: 1, color: 'accent1' }, effect: { index: 0, color: 'accent3' }, font: { role: 'major', color: 'tx1' } },
				fontFace: 'Master Placeholder Font', fontSize: 26, color: 'tx1', bold: true, italic: false, align: 'center', valign: 'middle',
			},
		}],
		colorMap: { bg1: 'lt2', tx1: 'dk2', bg2: 'lt1', tx2: 'dk1', accent1: 'accent2', accent2: 'accent1', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' },
		textStyles: {
			title: { fontFace: 'Major Title', fontSize: 44, color: 'tx1', bold: true, italic: false, align: 'center' },
			body: { fontFace: 'Minor Body', fontSize: 28, color: 'accent2', bold: false, italic: false, align: 'left' },
			other: { fontFace: 'Other Text', fontSize: 18, color: '123456', italic: true, align: 'right' },
		},
	})
	assert.deepEqual(model.layouts[0], {
		name: 'Editorial_Wide', width: 13.333333, height: 7.5, type: 'titleOnly', masterName: 'Master_Alpha',
		background: { type: 'solid', color: 'DDEEFF' },
		objects: [{ line: { x: 0.5, y: 2, w: 4, h: 0, objectName: 'Fixed Layout Line', line: { type: 'solid', color: '778899', width: 2, dashType: 'dash' } } }],
		placeholders: [{
			name: 'Layout_Title', type: 'title', idx: 0, size: 'full', orient: 'horz', hasCustomPrompt: false,
			x: 0.5, y: 0.25, w: 12.333333, h: 1,
			style: { preset: 'rect', fill: { type: 'none' }, line: { type: 'solid', color: 'accent4' }, fontFace: 'Layout Placeholder Font', fontSize: 22, color: 'tx1', bold: false, align: 'left', valign: 'top' },
		}],
		headerFooter: { header: true, footer: false, slideNumber: true },
		colorMapOverride: { bg1: 'dk2', accent1: 'accent2' },
	})
	assert.deepEqual(model.masters[1], {
		title: 'Secondary_Master', name: 'Secondary_Master',
		objects: [{ rect: { x: 4, y: 0.125, w: 1, h: 0.5, objectName: 'Fixed Master Rect', fill: { type: 'solid', color: '334455' }, line: { type: 'none' } } }],
		colorMap: { accent1: 'accent1' },
	})
	assert.deepEqual(model.layouts[1], {
		name: 'Secondary_Layout', width: 13.333333, height: 7.5, type: 'blank', masterName: 'Secondary_Master',
	})
	assert.deepEqual({
		background: model.slides[0].background,
		layoutName: model.slides[0].layoutName,
		masterName: model.slides[0].masterName,
		colorMapOverride: model.slides[0].colorMapOverride,
		showMasterShapes: model.slides[0].showMasterShapes,
		showMasterPhAnim: model.slides[0].showMasterPhAnim,
	}, {
		background: { type: 'solid', color: 'ABCDEF' }, layoutName: 'Editorial_Wide', masterName: 'Master_Alpha',
		colorMapOverride: { accent1: 'accent3' }, showMasterShapes: false, showMasterPhAnim: false,
	})
	assert.equal(model.slides[1].layoutName, 'Secondary_Layout')
	assert.equal(model.slides[1].masterName, 'Secondary_Master')

	const schema = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/ir/deck-spec.v1.json'), 'utf8'))
	delete schema.$schema
	const validate = new Ajv({ allErrors: true, unknownFormats: 'ignore' }).compile(schema)
	const portable = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Structured inheritance', layout: 'LAYOUT_WIDE',
		theme: model.theme, masters: model.masters, layouts: model.layouts,
		slides: [
			{ id: 'slide-1', title: 'Structured inheritance', layoutIntent: 'title-only', content: [], layoutName: model.slides[0].layoutName, masterName: model.slides[0].masterName, colorMapOverride: model.slides[0].colorMapOverride, showMasterShapes: model.slides[0].showMasterShapes, showMasterPhAnim: model.slides[0].showMasterPhAnim },
			{ id: 'slide-2', title: 'Structured secondary', layoutIntent: 'title-only', content: [], layoutName: model.slides[1].layoutName, masterName: model.slides[1].masterName },
		],
	}
	assert.equal(validate(portable), true, JSON.stringify(validate.errors))
	const publicJson = JSON.stringify({ theme: model.theme, masters: model.masters, layouts: model.layouts, slides: model.slides })
	assert.doesNotMatch(publicJson, /(?:ppt\/|\.xml|\brId(?:Private|\d*)\b|[A-Z]:\\)/i)
	assert.doesNotMatch(publicJson, /Preservation Only Chart/)

	const generatorPath = await new CodeGenerator().generate(model, outputRoot, 'structured-inheritance-fixture', path.resolve('fixture.pptx'))
	await fs.mkdir(path.join(outputRoot, 'output'), { recursive: true })
	await execFileAsync(process.execPath, [generatorPath], { cwd: path.resolve('.') })
	const replay = await JSZip.loadAsync(await fs.readFile(path.join(outputRoot, 'output', 'regenerated.pptx')))
	const replayText = async partName => replay.file(partName)?.async('text')
	const layoutParts = Object.keys(replay.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
	assert.deepEqual(layoutParts, ['ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/slideLayout2.xml'], 'all authored layouts replay without a synthetic blank layout')

	const [themeXml, masterXml, masterXml2, layoutXml, layoutXml2, layoutRels, layoutRels2, slideXml, slideRels, slideRels2] = await Promise.all([
		replayText('ppt/theme/theme1.xml'), replayText('ppt/slideMasters/slideMaster1.xml'),
		replayText('ppt/slideMasters/slideMaster2.xml'), replayText('ppt/slideLayouts/slideLayout1.xml'),
		replayText('ppt/slideLayouts/slideLayout2.xml'), replayText('ppt/slideLayouts/_rels/slideLayout1.xml.rels'),
		replayText('ppt/slideLayouts/_rels/slideLayout2.xml.rels'),
		replayText('ppt/slides/slide1.xml'), replayText('ppt/slides/_rels/slide1.xml.rels'), replayText('ppt/slides/_rels/slide2.xml.rels'),
	])
	assert.match(themeXml, /<a:theme[^>]+name="Editorial Theme"/)
	assert.match(themeXml, /<a:majorFont><a:latin typeface="Aptos Display"/)
	assert.match(themeXml, /<a:minorFont><a:latin typeface="Aptos"/)
	assert.match(themeXml, /<a:accent1><a:srgbClr val="0057B8"/)
	assert.match(masterXml, /<p:cSld name="Master_Alpha">/)
	assert.match(masterXml, /name="Fixed Master Text"/)
	assert.match(masterXml, /name="Placeholder Master_Title"/)
	assert.match(masterXml, /<p:clrMap[^>]+accent1="accent2"/)
	assert.match(masterXml, /<a:defRPr[^>]+lang="en-GB"/)
	assert.match(masterXml2, /<p:cSld name="Secondary_Master">/)
	assert.match(masterXml2, /name="Fixed Master Rect"/)
	assert.match(layoutXml, /name="Fixed Layout Line"/)
	assert.match(layoutXml, /name="Placeholder Layout_Title"/)
	assert.match(layoutXml, /<a:overrideClrMapping[^>]+accent1="accent2"/)
	assert.match(layoutXml, /<p:hf[^>]+hdr="1"/)
	assert.match(layoutXml, /<p:hf[^>]+ftr="0"/)
	assert.match(layoutXml, /<p:hf[^>]+sldNum="1"/)
	assert.match(layoutRels, /Type="[^"]+\/slideMaster" Target="\.\.\/slideMasters\/slideMaster1\.xml"/)
	assert.match(layoutXml2, /<p:cSld name="Secondary_Layout">/)
	assert.match(layoutRels2, /Type="[^"]+\/slideMaster" Target="\.\.\/slideMasters\/slideMaster2\.xml"/)
	assert.match(slideXml, /<p:sld[^>]+showMasterSp="0"[^>]+showMasterPhAnim="0"/)
	assert.match(slideXml, /<a:overrideClrMapping[^>]+accent1="accent3"/)
	assert.match(slideRels, /Type="[^"]+\/slideLayout" Target="\.\.\/slideLayouts\/slideLayout1\.xml"/)
	assert.match(slideRels2, /Type="[^"]+\/slideLayout" Target="\.\.\/slideLayouts\/slideLayout2\.xml"/)
	const replayPublicText = [themeXml, masterXml, masterXml2, layoutXml, layoutXml2, slideXml].join('\n')
	assert.doesNotMatch(replayPublicText, /rIdPrivatePayload|Preservation Only Chart/)
})
