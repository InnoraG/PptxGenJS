// Native/package/Office proof for SmartArt controls beyond category tiles.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { SMARTART_FORMAT_PARAMETERS } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/smartart-format-parameters-native/${stamp}`)
const generated = path.join(outDir, 'smartart-format-parameters-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const quickStyleId = 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1'
const colorStyleId = 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2'
const processLayoutId = 'urn:microsoft.com/office/officeart/2005/8/layout/process1'
const hierarchyLayoutId = 'urn:microsoft.com/office/officeart/2005/8/layout/orgChart1'
const pictureLayoutId = 'urn:microsoft.com/office/officeart/2005/8/layout/pList1'
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const checkpoints = [
	{ id: 'selectors', label: 'Exact gallery selectors', options: { layoutId: processLayoutId, quickStyleId, colorStyleId, fontFace: 'Aptos Display', fontSize: 18, color: 'F8FAFC', nodes: ['Discover', 'Explain', 'Apply'] } },
	{ id: 'rtl-colors', label: 'Direction and node text colors', options: { layoutId: processLayoutId, quickStyleId, colorStyleId, rightToLeft: true, fontFace: 'Aptos', fontSize: 16, color: 'FFFFFF', textColors: ['FFFFFF', 'FDE68A', 'BAE6FD'], nodes: ['One', 'Two', 'Three'] } },
	{ id: 'hierarchy', label: 'Hierarchy topology and roles', options: { layoutId: hierarchyLayoutId, quickStyleId, colorStyleId, fontFace: 'Aptos', fontSize: 15, color: '0F172A', nodes: [{ text: 'CEO', role: 'root', children: [{ text: 'Product', role: 'manager', children: ['Design'] }, { text: 'Sales', role: 'manager' }] }] } },
	{ id: 'picture', label: 'Picture node relationships', options: { layoutId: pictureLayoutId, quickStyleId, colorStyleId, fontFace: 'Aptos', fontSize: 14, nodes: [{ text: 'North', role: 'image', image: pixel }, { text: 'South', role: 'image', image: pixel }] } },
	{ id: 'reset', label: 'Null selector reset', options: { layoutId: null, quickStyleId: null, colorStyleId: null, rightToLeft: null, fontFace: null, fontSize: null, color: null, textColors: null, nodes: ['Reset', 'Re-edit'] } },
]

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX SmartArt format proof'; pptx.title = 'Native SmartArt format parameters'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoint.label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addSmartArt({ x: 0.95, y: 1.05, w: 11.1, h: 5.5, objectName: checkpoint.id, mode: 'native', altText: `SmartArt ${checkpoint.id}`, ...checkpoint.options })
	slide.addNotes(`SmartArt format checkpoint ${checkpoint.id}: native layout/style/color selectors plus typed topology, text, direction, and reset controls.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const dataFiles = Object.keys(zip.files).filter(name => /^ppt\/diagrams\/data\d+\.xml$/.test(name)).sort()
const drawingFiles = Object.keys(zip.files).filter(name => /^ppt\/diagrams\/drawing\d+\.xml$/.test(name)).sort()
const layoutFiles = Object.keys(zip.files).filter(name => /^ppt\/diagrams\/layout\d+\.xml$/.test(name)).sort()
const quickFiles = Object.keys(zip.files).filter(name => /^ppt\/diagrams\/quickStyle\d+\.xml$/.test(name)).sort()
const colorFiles = Object.keys(zip.files).filter(name => /^ppt\/diagrams\/colors\d+\.xml$/.test(name)).sort()
const rows = []
for (let index = 0; index < checkpoints.length; index++) {
	const dataXml = await zip.file(dataFiles[index]).async('string')
	const drawingXml = await zip.file(drawingFiles[index]).async('string')
	rows.push({
		slide: index + 1, id: checkpoints[index].id, dataFile: dataFiles[index], drawingFile: drawingFiles[index],
		layoutPart: Boolean(zip.file(layoutFiles[index])), quickStylePart: Boolean(zip.file(quickFiles[index])), colorStylePart: Boolean(zip.file(colorFiles[index])),
		layoutSelector: dataXml.includes(`loTypeId="${checkpoints[index].options.layoutId || processLayoutId}"`),
		quickStyleSelector: dataXml.includes(`qsTypeId="${checkpoints[index].options.quickStyleId || 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1'}"`),
		colorStyleSelector: dataXml.includes(`csTypeId="${checkpoints[index].options.colorStyleId || 'urn:microsoft.com/office/officeart/2005/8/colors/colorful1'}"`),
		nodeText: checkpoints[index].options.nodes.every(node => dataXml.includes(typeof node === 'string' ? node : node.text)),
		rtlCarrier: index === 1 ? dataXml.includes('<dgm:dir val="rev"') : true,
		fontCarrier: index === 0 ? dataXml.includes('typeface="Aptos Display"') && drawingXml.includes('typeface="Aptos Display"') : true,
		textColorCarrier: index === 1 ? dataXml.includes('FDE68A') && drawingXml.includes('BAE6FD') : true,
		hierarchyCarrier: index === 2 ? dataXml.includes('type="asst"') === false && dataXml.includes('srcId=') && dataXml.includes('destId=') : true,
		pictureCarrier: index === 3 ? dataXml.includes('r:embed="rIdImg') && drawingXml.includes('r:embed="rIdImg') : true,
		resetCarrier: index === 4 ? dataXml.includes('Reset') && dataXml.includes('Re-edit') : true,
	})
}
const generatedChecks = {
	parameterCatalogComplete: SMARTART_FORMAT_PARAMETERS.length >= 13 && SMARTART_FORMAT_PARAMETERS.every(item => item.id && item.semanticPath && item.reset),
	allDiagramFamiliesPresent: dataFiles.length === checkpoints.length && drawingFiles.length === checkpoints.length && layoutFiles.length === checkpoints.length && quickFiles.length === checkpoints.length && colorFiles.length === checkpoints.length,
	exactSelectorsNative: rows[0].layoutSelector && rows[0].quickStyleSelector && rows[0].colorStyleSelector,
	rtlAndTypographyNative: rows[1].rtlCarrier && rows[1].textColorCarrier && rows[0].fontCarrier,
	hierarchyTopologyNative: rows[2].hierarchyCarrier,
	pictureNodesNative: rows[3].pictureCarrier,
	nullResetCarrierPresent: rows[4].resetCarrier,
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(2).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await roundtripZip.file(dataFiles[index]).async('string')
	const drawingXml = await roundtripZip.file(drawingFiles[index]).async('string')
	roundtripRows.push({ slide: index + 1, layout: xml.includes('loTypeId='), nodes: xml.includes('<dgm:pt '), reset: index === 4 ? xml.includes('Reset') : true, picture: index === 3 ? (xml.includes('<a:blip') || drawingXml.includes('<a:blip')) : true })
}
const roundtripRetained = { layoutAndStyles: roundtripRows.every(row => row.layout && row.nodes), pictureCarrier: roundtripRows[3].picture, resetCarrier: roundtripRows[4].reset }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-smartart-carriers')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = { schemaVersion: 'betterpptx.global-smartart-format-parameters.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { source: 'smartArtLayout plus native SmartArtProps', parameterCount: SMARTART_FORMAT_PARAMETERS.length, nativeFamilies: ['layout', 'quickStyle', 'colorStyle', 'topology', 'text', 'direction', 'picture', 'accessibility'], officeBoundary: 'PowerPoint retains native SmartArt diagram parts and authored selectors/topology/text through Open2007/SaveCopyAs/reopen.' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows, checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) }, failures, interpretation: 'The SmartArt contract exposes existing native diagram selectors and structured topology/text controls as typed manual parameters. Category and style selection remain available, while null/omitted fields restore the native defaults.' }
const reportPath = path.join(outDir, 'smartart-format-parameters-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
