#!/usr/bin/env node
// Native proof for the complete non-preset gradient geometry contract.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/fill-gradient-direction-path-native/${stamp}`)
const generated = path.join(outDir, 'fill-gradient-direction-path-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const stops = [{ position: 0, color: '0F4C81' }, { position: 37.125, color: 'F59E0B', transparency: 22.222 }, { position: 100, color: '14B8A6', transparency: 66.666 }]
const cases = [
	{ id: 'linear-angle-flip-rotate', carrier: 'shape', fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 359.875, gradientFlip: 'xy', rotateGradientWithShape: false, tileRect: { l: 1.125, t: 2.25, r: 96.875, b: 98.75 }, gradientStops: stops } },
	{ id: 'circle-focus', carrier: 'shape', fill: { type: 'gradient', gradientDirection: 'circle', gradientFlip: 'x', rotateGradientWithShape: true, fillToRect: { l: 12.125, t: 24.25, r: 76.875, b: 88.75 }, gradientStops: stops } },
	{ id: 'rect-focus', carrier: 'shape', fill: { type: 'gradient', gradientDirection: 'rect', gradientFlip: 'y', rotateGradientWithShape: false, fillToRect: { l: 8.5, t: 14.25, r: 82.75, b: 91.125 }, tileRect: { l: 3.5, t: 4.25, r: 94.75, b: 95.125 }, gradientStops: stops } },
	{ id: 'shape-path', carrier: 'shape', fill: { type: 'gradient', gradientDirection: 'shape', gradientFlip: 'none', rotateGradientWithShape: true, fillToRect: { l: 20, t: 15, r: 80, b: 85 }, gradientStops: stops } },
	{ id: 'background-circle', carrier: 'background', fill: { type: 'gradient', gradientDirection: 'circle', gradientFlip: 'xy', rotateGradientWithShape: false, fillToRect: { l: 5.125, t: 11.25, r: 91.875, b: 87.75 }, gradientStops: stops } },
	{ id: 'background-linear', carrier: 'background', fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 0.125, gradientFlip: 'none', rotateGradientWithShape: true, tileRect: { l: 0.5, t: 1.25, r: 99.5, b: 98.75 }, gradientStops: stops } },
	{ id: 'reset-null', carrier: 'shape', fill: null },
	{ id: 'reedit-after-reset', carrier: 'shape', fill: { type: 'gradient', gradientDirection: 'rect', gradientFlip: 'x', rotateGradientWithShape: false, fillToRect: { l: 17.75, t: 22.5, r: 73.25, b: 81.125 }, gradientStops: stops } },
]
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global gradient geometry proof'
pptx.subject = 'Gradient direction/path, focus rectangle, flip, tile rectangle, and rotate-with-shape'
pptx.title = 'Native gradient geometry five-point proof'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const item of cases) {
	const slide = pptx.addSlide()
	if (item.carrier === 'background') slide.background = item.fill
	else slide.background = { color: 'F6F8FB' }
	slide.addText(item.id, { x: 0.55, y: 0.35, w: 12.2, h: 0.45, fontFace: 'Aptos Display', fontSize: 22, color: '102A43', bold: true, margin: 0, align: 'center' })
	if (item.carrier === 'shape') slide.addShape(pptx.ShapeType.roundRect, { x: 2.15, y: 1.35, w: 9.1, h: 4.5, objectName: item.id, fill: item.fill || undefined, line: { color: 'FFFFFF', width: 1.25 } })
	slide.addNotes(`Native gradient geometry checkpoint: ${item.id}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const attributes = text => Object.fromEntries([...String(text || '').matchAll(/([A-Za-z]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
const parseRect = snippet => {
	const match = String(snippet || '').match(/<a:(?:fillToRect|tileRect)\b([^>]*)\/>/)
	if (!match) return null
	const attrs = attributes(match[1])
	return Object.fromEntries(['l', 't', 'r', 'b'].map(key => [key, attrs[key] == null ? null : Number(attrs[key]) / 1000]))
}
const readGradient = xml => {
	const match = String(xml).match(/<a:gradFill\b([^>]*)>([\s\S]*?)<\/a:gradFill>/)
	if (!match) return null
	const body = match[2]
	const attrs = attributes(match[1])
	const linear = body.match(/<a:lin\b([^>]*)\/>/)
	const pathMatch = body.match(/<a:path\b([^>]*)>([\s\S]*?)<\/a:path>/)
	const tileMatch = body.match(/<a:tileRect\b([^>]*)\/>/)
	const stopRows = [...body.matchAll(/<a:gs\b([^>]*)>([\s\S]*?)<\/a:gs>/g)].map(stop => ({ position: Number(attributes(stop[1]).pos) / 1000 }))
	return {
		flip: attrs.flip ?? 'none',
		rotateWithShape: attrs.rotWithShape == null ? null : attrs.rotWithShape === '1',
		linearAngle: linear ? Number(attributes(linear[1]).ang) / 60000 : null,
		path: pathMatch ? attributes(pathMatch[1]).path : null,
		fillToRect: pathMatch ? parseRect(pathMatch[2]) : null,
		tileRect: tileMatch ? parseRect(tileMatch[0]) : null,
		stopPositions: stopRows.map(row => row.position),
	}
}

const readRows = async file => {
	const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
	const rows = []
	for (let index = 1; index <= cases.length; index++) {
		const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
		rows.push({ slide: index, id: cases[index - 1].id, carrier: cases[index - 1].carrier, requested: cases[index - 1].fill, xmlGradient: readGradient(xml), xmlHasGradient: xml.includes('<a:gradFill') })
	}
	return rows
}
const generatedRows = await readRows(generated)
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''")
const rtPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripRows = await readRows(roundtrip)
for (const row of roundtripRows) {
	const png = path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)
	row.renderSha256 = sha256(await fs.readFile(png))
}

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)
const expectedFor = item => {
	if (!item.fill) return null
	return {
		flip: item.fill.gradientFlip || 'none',
		rotateWithShape: item.fill.rotateGradientWithShape !== false,
		linearAngle: item.fill.gradientDirection === 'linear' ? item.fill.gradientAngle || 0 : null,
		path: item.fill.gradientDirection === 'linear' ? null : item.fill.gradientDirection,
		fillToRect: item.fill.fillToRect ? Object.fromEntries(['l', 't', 'r', 'b'].map(key => [key, item.fill.fillToRect[key] || 0])) : null,
		tileRect: item.fill.tileRect ? Object.fromEntries(['l', 't', 'r', 'b'].map(key => [key, item.fill.tileRect[key] || 0])) : null,
		stopPositions: item.fill.gradientStops.map(stop => stop.position),
	}
}
const failures = []
for (const row of generatedRows) {
	const expected = expectedFor(cases[row.slide - 1])
	if (expected == null ? row.xmlHasGradient : !row.xmlGradient || !same(row.xmlGradient, expected)) failures.push(`generated ${row.id} mismatch: ${JSON.stringify(row.xmlGradient)} expected ${JSON.stringify(expected)}`)
}
for (const row of roundtripRows) {
	const expected = expectedFor(cases[row.slide - 1])
	if (expected == null ? row.xmlHasGradient : !row.xmlGradient || !same(row.xmlGradient, expected)) failures.push(`roundtrip ${row.id} mismatch: ${JSON.stringify(row.xmlGradient)} expected ${JSON.stringify(expected)}`)
}
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== cases.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-fill-gradient-direction-path-five-point.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	controlFamily: 'fills.gradientGeometry',
	controls: ['gradientDirection', 'gradientAngle', 'gradientFlip', 'rotateGradientWithShape', 'fillToRect.l/t/r/b', 'tileRect.l/t/r/b'],
	checkpoints: cases.map(item => ({ id: item.id, carrier: item.carrier, requested: item.fill })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeGradientGeometry: failures.length === 0, resetAndReedit: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows },
	office,
	failures,
	interpretation: 'The native gradient geometry contract is proven across linear, circle, rect, and shape paths, angle, focus rectangle, flip, tile rectangle, rotate-with-shape, slide backgrounds, null reset, and sparse re-edit. This closes only the isolated fill-gradient geometry family; universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'fill-gradient-direction-path-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
