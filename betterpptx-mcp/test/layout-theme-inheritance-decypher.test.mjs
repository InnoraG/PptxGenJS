import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import Ajv from 'ajv'
import JSZip from 'jszip'

const NS = {
	p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
	a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
	r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

function placeholderShape({ id, name, type, idx = 0, size, orient, customPrompt, x, y, w, h, preset = 'rect', spPrExtras = '', styleXml = '', txBodyXml = '' }) {
	const attributes = [
		`type="${type}"`,
		`idx="${idx}"`,
		size ? `sz="${size}"` : '',
		orient ? `orient="${orient}"` : '',
		customPrompt !== undefined ? `hasCustomPrompt="${customPrompt ? '1' : '0'}"` : '',
	].filter(Boolean).join(' ')
	return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph ${attributes}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>${spPrExtras}</p:spPr>${styleXml}${txBodyXml || '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody>'}</p:sp>`
}

function fixedTextShape() {
	return '<p:sp><p:nvSpPr><p:cNvPr id="10" name="Fixed Master Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="228600" y="114300"/><a:ext cx="2743200" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="445566"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr anchor="b"/><a:lstStyle/><a:p><a:pPr algn="ctr"><a:defRPr lang="en-GB" sz="1200" b="0" i="1"><a:solidFill><a:srgbClr val="AABBCC"/></a:solidFill><a:latin typeface="Fixed Font"/></a:defRPr></a:pPr><a:r><a:t>MASTER FIXED</a:t></a:r></a:p></p:txBody></p:sp>'
}

function fixedRectShape() {
	return '<p:sp><p:nvSpPr><p:cNvPr id="11" name="Fixed Master Rect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="3657600" y="114300"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="334455"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>'
}

function fixedLineShape() {
	return '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="12" name="Fixed Layout Line"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="457200" y="1828800"/><a:ext cx="3657600" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="25400"><a:solidFill><a:srgbClr val="778899"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr></p:cxnSp>'
}

function unsupportedGraphicFrame() {
	return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="13" name="Preservation Only Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></p:xfrm><a:graphic><a:graphicData uri="urn:unsupported"><x:payload xmlns:x="urn:unsupported" r:id="rIdPrivate"/></a:graphicData></a:graphic></p:graphicFrame>'
}

function shapeTree(children) {
	return `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${children}</p:spTree>`
}

async function writeFixture(filePath) {
	const zip = new JSZip()
	zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideMasters/slideMaster2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`)
	zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`)
	zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/><p:sldMasterId id="2147483649" r:id="rIdMaster2"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rIdSlide"/><p:sldId id="257" r:id="rIdSlide2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`)
	zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rIdMaster2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster2.xml"/><Relationship Id="rIdSlide" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rIdSlide2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`)

	const masterPlaceholder = placeholderShape({
		id: 2, name: 'Master Title', type: 'title', x: 914400, y: 457200, w: 10058400, h: 914400, preset: 'roundRect',
		spPrExtras: '<a:solidFill><a:schemeClr val="accent1"><a:alpha val="80000"/></a:schemeClr></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="445566"/></a:solidFill><a:prstDash val="dash"/></a:ln><a:effectLst><a:outerShdw blurRad="38100" dist="25400" dir="2700000"><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:outerShdw></a:effectLst>',
		styleXml: '<p:style><a:lnRef idx="2"><a:schemeClr val="accent2"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent3"/></a:effectRef><a:fontRef idx="major"><a:schemeClr val="tx1"/></a:fontRef></p:style>',
		txBodyXml: '<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"><a:defRPr lang="en-GB" sz="2600" b="1" i="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Master Placeholder Font"/></a:defRPr></a:pPr><a:endParaRPr/></a:p></p:txBody>',
	})
	const masterChildren = masterPlaceholder + fixedTextShape() + fixedRectShape() + unsupportedGraphicFrame()
	const masterTextStyles = '<p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr lang="en-GB" sz="4400" b="1" i="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Major Title"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr algn="l"><a:defRPr lang="en-GB" sz="2800" b="0" i="0"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:latin typeface="Minor Body"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr algn="r"><a:defRPr lang="en-GB" sz="1800" i="1"><a:solidFill><a:srgbClr val="123456"/></a:solidFill><a:latin typeface="Other Text"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles>'
	zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Master Alpha"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F0F1F2"><a:alpha val="90000"/></a:srgbClr></a:solidFill></p:bgPr></p:bg>${shapeTree(masterChildren)}</p:cSld><p:clrMap accent1="accent2" accent2="accent1" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt2" bg2="lt1" folHlink="folHlink" hlink="hlink" tx1="dk2" tx2="dk1"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rIdLayout"/></p:sldLayoutIdLst>${masterTextStyles}</p:sldMaster>`)
	zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`)
	zip.file('ppt/slideMasters/slideMaster2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld name="Secondary Master">${shapeTree(fixedRectShape())}</p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2" r:id="rIdLayout2"/></p:sldLayoutIdLst></p:sldMaster>`)
	zip.file('ppt/slideMasters/_rels/slideMaster2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rIdTheme2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme2.xml"/></Relationships>`)

	const layoutPlaceholders = [
		placeholderShape({ id: 2, name: 'Layout Title', type: 'title', idx: 0, size: 'full', orient: 'horz', customPrompt: false, x: 457200, y: 228600, w: 11277600, h: 914400, spPrExtras: '<a:noFill/><a:ln><a:solidFill><a:schemeClr val="accent4"/></a:solidFill></a:ln>', txBodyXml: '<p:txBody><a:bodyPr anchor="t"/><a:lstStyle/><a:p><a:pPr algn="l"><a:defRPr sz="2200" b="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="Layout Placeholder Font"/></a:defRPr></a:pPr></a:p></p:txBody>' }),
		placeholderShape({ id: 3, name: 'Unsafe Header Carrier', type: 'hdr', idx: 9, x: 457200, y: 6400800, w: 3657600, h: 228600 }),
	].join('')
	zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" type="titleOnly" preserve="1"><p:cSld name="Editorial Wide"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="DDEEFF"/></a:solidFill></p:bgPr></p:bg>${shapeTree(layoutPlaceholders + fixedLineShape())}</p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="dk2" accent1="accent2"/></p:clrMapOvr><p:hf hdr="1" ftr="0" sldNum="1"/></p:sldLayout>`)
	zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`)
	zip.file('ppt/slideLayouts/slideLayout2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" type="blank" preserve="1"><p:cSld name="Secondary Layout">${shapeTree('')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
	zip.file('ppt/slideLayouts/_rels/slideLayout2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster2.xml"/></Relationships>`)

	zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}" showMasterSp="0" showMasterPhAnim="false"><p:cSld>${shapeTree('')}</p:cSld><p:clrMapOvr><a:overrideClrMapping accent1="accent3"/></p:clrMapOvr></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`)
	zip.file('ppt/slides/slide2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld>${shapeTree('')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
	zip.file('ppt/slides/_rels/slide2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/></Relationships>`)

	zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${NS.a}" name="Editorial Theme"><a:themeElements><a:clrScheme name="Editorial"><a:dk1><a:sysClr val="windowText" lastClr="101010"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FEFEFE"/></a:lt1><a:dk2><a:srgbClr val="202A35"/></a:dk2><a:lt2><a:srgbClr val="E8ECF1"/></a:lt2><a:accent1><a:srgbClr val="0057B8"/></a:accent1><a:accent2><a:srgbClr val="FF7A00"/></a:accent2><a:accent3><a:srgbClr val="22A06B"/></a:accent3><a:accent4><a:srgbClr val="7A5AF8"/></a:accent4><a:accent5><a:srgbClr val="D64550"/></a:accent5><a:accent6><a:srgbClr val="00A3BF"/></a:accent6><a:hlink><a:srgbClr val="1155CC"/></a:hlink><a:folHlink><a:srgbClr val="7B1FA2"/></a:folHlink></a:clrScheme><a:fontScheme name="Editorial Fonts"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Editorial Format"/></a:themeElements></a:theme>`)
	zip.file('ppt/theme/theme2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${NS.a}" name="Preservation Theme"><a:themeElements><a:clrScheme name="Preservation"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme><a:fontScheme name="Preservation Fonts"><a:majorFont><a:latin typeface="Wrong Major"/></a:majorFont><a:minorFont><a:latin typeface="Wrong Minor"/></a:minorFont></a:fontScheme><a:fmtScheme name="Preservation Format"/></a:themeElements></a:theme>`)

	await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

test('main decypher exposes safe semantic theme, master, layout, and slide inheritance topology', async t => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layout-theme-decypher-'))
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
	const sourcePath = path.join(tempRoot, 'inheritance.pptx')
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
	assert.deepEqual(result.model.theme, {
		name: 'Editorial Theme',
		fontFace: 'Aptos',
		bodyFontFace: 'Aptos',
		headFontFace: 'Aptos Display',
		lang: 'en-GB',
		colorScheme: {
			dk1: '101010', lt1: 'FEFEFE', dk2: '202A35', lt2: 'E8ECF1',
			accent1: '0057B8', accent2: 'FF7A00', accent3: '22A06B', accent4: '7A5AF8',
			accent5: 'D64550', accent6: '00A3BF', hlink: '1155CC', folHlink: '7B1FA2',
		},
	})
	assert.equal(result.model.masters.length, 2, 'every presentation-ordered physical master is projected')
	assert.equal(result.model.layouts.length, 2, 'every master-owned layout is projected')
	assert.deepEqual(result.model.masters[0], {
		title: 'Master_Alpha', name: 'Master_Alpha',
		background: { type: 'solid', color: 'F0F1F2', transparency: 10 },
		objects: [
			{ text: { text: 'MASTER FIXED', options: { x: 0.25, y: 0.125, w: 3, h: 0.5, objectName: 'Fixed Master Text', fill: { type: 'solid', color: '112233' }, line: { type: 'solid', color: '445566', width: 1 }, fontFace: 'Fixed Font', fontSize: 12, color: 'AABBCC', bold: false, italic: true, align: 'center', valign: 'bottom' } } },
			{ rect: { x: 4, y: 0.125, w: 1, h: 0.5, objectName: 'Fixed Master Rect', fill: { type: 'solid', color: '334455' }, line: { type: 'none' } } },
		],
		placeholders: [{
			name: 'Master_Title', type: 'title', idx: 0, x: 1, y: 0.5, w: 11, h: 1,
			style: {
				preset: 'roundRect',
				fill: { type: 'solid', color: 'accent1', transparency: 20 },
				line: { type: 'solid', color: '445566', width: 2, dashType: 'dash' },
				shadow: { type: 'outer', color: '000000', blur: 3, distance: 2, angle: 45, opacity: 0.5 },
				styleRefs: {
					line: { index: 2, color: 'accent2' }, fill: { index: 1, color: 'accent1' },
					effect: { index: 0, color: 'accent3' }, font: { role: 'major', color: 'tx1' },
				},
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
	assert.deepEqual(result.model.layouts[0], {
		name: 'Editorial_Wide', width: 13.333333333333334, height: 7.5, type: 'titleOnly', masterName: 'Master_Alpha',
		background: { type: 'solid', color: 'DDEEFF' },
		objects: [{ line: { x: 0.5, y: 2, w: 4, h: 0, objectName: 'Fixed Layout Line', line: { type: 'solid', color: '778899', width: 2, dashType: 'dash' } } }],
		placeholders: [{
			name: 'Layout_Title', type: 'title', idx: 0, size: 'full', orient: 'horz', hasCustomPrompt: false, x: 0.5, y: 0.25, w: 12.333333, h: 1,
			style: { preset: 'rect', fill: { type: 'none' }, line: { type: 'solid', color: 'accent4' }, fontFace: 'Layout Placeholder Font', fontSize: 22, color: 'tx1', bold: false, align: 'left', valign: 'top' },
		}],
		headerFooter: { header: true, footer: false, slideNumber: true },
		colorMapOverride: { bg1: 'dk2', accent1: 'accent2' },
	})
	assert.deepEqual(result.model.masters[1], {
		title: 'Secondary_Master', name: 'Secondary_Master',
		objects: [{ rect: { x: 4, y: 0.125, w: 1, h: 0.5, objectName: 'Fixed Master Rect', fill: { type: 'solid', color: '334455' }, line: { type: 'none' } } }],
		colorMap: { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' },
	})
	assert.deepEqual(result.model.layouts[1], {
		name: 'Secondary_Layout', width: 13.333333333333334, height: 7.5, type: 'blank', masterName: 'Secondary_Master',
	})
	assert.equal(result.model.layouts[0].placeholders.some(item => item.type === 'header'), false)
	assert.equal(result.model.slides[0].layoutName, 'Editorial_Wide')
	assert.equal(result.model.slides[0].masterName, 'Master_Alpha')
	assert.deepEqual(result.model.slides[0].colorMapOverride, { accent1: 'accent3' })
	assert.equal(result.model.slides[0].showMasterShapes, false)
	assert.equal(result.model.slides[0].showMasterPhAnim, false)
	assert.equal(result.model.slides[1].layoutName, 'Secondary_Layout')
	assert.equal(result.model.slides[1].masterName, 'Secondary_Master')
	assert.doesNotMatch(JSON.stringify(result.model.masters[0].objects), /Preservation Only Chart/)
	const generatedFolder = (await fs.readdir(outputRoot, { withFileTypes: true })).find(entry => entry.isDirectory())
	assert.ok(generatedFolder)
	const generatedRoot = path.join(outputRoot, generatedFolder.name)
	const generatorPath = path.join(generatedRoot, 'generator.mjs')
	const generatorSource = await fs.readFile(generatorPath, 'utf8')
	assert.match(generatorSource, /const MASTERS = \[[\s\S]*"Master_Alpha"[\s\S]*"Secondary_Master"/)
	assert.match(generatorSource, /pptx\.definePhysicalSlideMaster\(/)
	assert.match(generatorSource, /nativeLayout\._slideMaster = physicalMaster/)
	assert.match(generatorSource, /slideOptions\.masterName = slideDef\.layoutName/)

	const schema = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/ir/deck-spec.v1.json'), 'utf8'))
	delete schema.$schema
	const validateDeck = new Ajv({ allErrors: true, unknownFormats: 'ignore' }).compile(schema)
	const portableSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Imported inheritance topology', layout: 'LAYOUT_WIDE',
		theme: result.model.theme, masters: result.model.masters, layouts: result.model.layouts,
		slides: [{
			id: 'slide-1', title: 'Imported slide', layoutIntent: 'title-only', content: [],
			layoutName: result.model.slides[0].layoutName, masterName: result.model.slides[0].masterName,
			colorMapOverride: result.model.slides[0].colorMapOverride,
			showMasterShapes: result.model.slides[0].showMasterShapes,
			showMasterPhAnim: result.model.slides[0].showMasterPhAnim,
		}, {
			id: 'slide-2', title: 'Imported secondary slide', layoutIntent: 'title-only', content: [],
			layoutName: result.model.slides[1].layoutName, masterName: result.model.slides[1].masterName,
		}],
	}
	assert.equal(validateDeck(portableSpec), true, JSON.stringify(validateDeck.errors))

	const publicTopology = JSON.stringify({
		theme: result.model.theme,
		masters: result.model.masters,
		layouts: result.model.layouts,
		slide: { layoutName: result.model.slides[0].layoutName, masterName: result.model.slides[0].masterName },
	})
	assert.doesNotMatch(publicTopology, /(?:ppt\/|\.xml|\brId\d*\b|[A-Z]:\\)/i)
	assert.doesNotMatch(publicTopology, /Preservation Only Chart/)

	await fs.mkdir(path.join(generatedRoot, 'output'), { recursive: true })
	const replayRun = spawnSync(process.execPath, [generatorPath], {
		cwd: generatedRoot,
		encoding: 'utf8',
		timeout: 120000,
		env: { ...process.env, PPTX_DECYPHER_SKIP_RAW_PACKAGE: '1' },
	})
	assert.equal(replayRun.status, 0, `${replayRun.stdout}\n${replayRun.stderr}`)
	const replay = await JSZip.loadAsync(await fs.readFile(path.join(generatedRoot, 'output', 'regenerated.pptx')))
	const masterParts = Object.keys(replay.files).filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name))
	const layoutParts = Object.keys(replay.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
	assert.deepEqual(masterParts, ['ppt/slideMasters/slideMaster1.xml', 'ppt/slideMasters/slideMaster2.xml'])
	assert.deepEqual(layoutParts, ['ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/slideLayout2.xml'])
	assert.match(await replay.file('ppt/slideLayouts/_rels/slideLayout2.xml.rels').async('text'), /Target="\.\.\/slideMasters\/slideMaster2\.xml"/)
	assert.match(await replay.file('ppt/slides/_rels/slide2.xml.rels').async('text'), /Target="\.\.\/slideLayouts\/slideLayout2\.xml"/)
})
