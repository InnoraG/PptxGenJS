#!/usr/bin/env node
// Shared shape/text 3-D proof for top bevel width/height and contour color.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-top-bevel-contour-color/${stamp}`)
const generated = path.join(outDir, 'text3d-top-bevel-contour-color-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 4, 8, 16, 32]
const colors = ['000000', 'FF0000', '00AEEF', '7C3AED', 'F97316']
const controls = [
	{ id: 'bevelTopWidthPt', field: 'bevel.width', kind: 'number', unit: 'points' },
	{ id: 'bevelTopHeightPt', field: 'bevel.height', kind: 'number', unit: 'points' },
	{ id: 'contourColor', field: 'contourColor', kind: 'color', unit: 'hex' },
]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global Text3D and shape 3-D parameter proof'; pptx.subject = 'Native top bevel and contour color five-point contract'; pptx.title = 'Text3D top bevel and contour color five-point canary'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const requestedRows = []
for (const carrier of ['text3D', 'shape3D']) for (const control of controls) for (let i = 0; i < values.length; i++) {
	const value = control.kind === 'color' ? colors[i] : values[i]
	const threeD = { bevel: { type: 'circle', width: control.field === 'bevel.width' ? value : 8, height: control.field === 'bevel.height' ? value : 8 }, bevelBottom: { type: 'circle', width: 8, height: 8 }, extrusion: 24, extrusionColor: '38BDF8', contourWidth: 8, contourColor: control.field === 'contourColor' ? value : 'F97316', material: 'matte', lightRig: 'threePt', rotationX: 18, rotationY: 22 }
	const slide = pptx.addSlide(); slide.background = { color: '0B1220' }
	if (carrier === 'text3D') slide.addText(`Text3D ${control.id} ${value}`, { x: 0.7, y: 2.1, w: 12, h: 1.4, objectName: `text3d-${control.id}-${i + 1}`, fontFace: 'Aptos Display', fontSize: 30, bold: true, color: 'F8FAFC', align: 'center', valign: 'mid', margin: 0, text3D: threeD })
	else slide.addShape(pptx.ShapeType.roundRect, { x: 3.0, y: 1.7, w: 7.3, h: 2.2, objectName: `shape3d-${control.id}-${i + 1}`, fill: { color: '1D4ED8' }, line: { color: '38BDF8', width: 1.5 }, effect3D: threeD })
	slide.addNotes(`Native ${carrier} ${control.field} checkpoint: ${value} ${control.unit}.`)
	requestedRows.push({ slide: requestedRows.length + 1, carrier, control: control.id, field: control.field, requested: value, kind: control.kind })
}
await pptx.writeFile({ fileName: generated, compression: false })

const readSp3d = xml => {
	const open = xml.match(/<a:sp3d\b([^>]*)>/); const attrs = open?.[1] || ''; const bevel = xml.match(/<a:bevelT\b([^>]*)\/>/); const contour = xml.match(/<a:contourClr>[\s\S]*?<a:srgbClr\s+val="([A-Fa-f0-9]+)"/)
	const attr = (source, name) => { const match = source?.match(new RegExp(`\\b${name}="(\\d+)"`)); return match ? Number(match[1]) / 12700 : 0 }
	return { topWidthPt: attr(bevel?.[1], 'w'), topHeightPt: attr(bevel?.[1], 'h'), contourColor: contour?.[1]?.toUpperCase() || null }
}
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true }); const generatedRows = []
for (const requested of requestedRows) { const xml = await zip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const actual = readSp3d(xml); const actualValue = requested.field === 'bevel.width' ? actual.topWidthPt : requested.field === 'bevel.height' ? actual.topHeightPt : actual.contourColor; generatedRows.push({ ...requested, actual: actualValue, retained: requested.kind === 'color' ? actualValue === String(requested.requested).toUpperCase() : Math.abs(actualValue - requested.requested) < 0.0001, serializedXml: xml.includes('<a:sp3d') }) }
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 }); const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''"); const rtPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 }); const office = JSON.parse(officeStdout.trim())
const rtZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true }); const roundtripRows = []
for (const requested of requestedRows) { const xml = await rtZip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const png = path.join(outDir, `roundtrip-slide-${String(requested.slide).padStart(2, '0')}.png`); const actual = readSp3d(xml); const actualValue = requested.field === 'bevel.width' ? actual.topWidthPt : requested.field === 'bevel.height' ? actual.topHeightPt : actual.contourColor; roundtripRows.push({ ...requested, actual: actualValue, retained: requested.kind === 'color' ? actualValue === String(requested.requested).toUpperCase() : Math.abs(actualValue - requested.requested) < 0.0001, renderSha256: sha256(await fs.readFile(png)) }) }
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (!row.retained) failures.push(`${row.carrier} slide ${row.slide} ${row.field} ${row.requested} actual ${row.actual}`)
for (const carrier of ['text3D', 'shape3D']) for (const control of controls) { const hashes = roundtripRows.filter(row => row.carrier === carrier && row.control === control.id).map(row => row.renderSha256); if (new Set(hashes).size !== values.length) failures.push(`${carrier} ${control.id} renders did not remain distinct`) }
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed'); if (office.status !== 'PASS' || office.slideCount !== requestedRows.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const report = { schemaVersion: 'betterpptx.global-text3d-top-bevel-contour-color-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controls: controls.map(control => ({ ...control, values: control.kind === 'color' ? colors : values, officeRange: control.kind === 'color' ? 'hex' : { minimum: 0, maximum: 1000, default: 6 } })), capabilityFamily: 'shape-text-3d', proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNative3D: failures.length === 0, visualRenders: roundtripRows.map(row => row.renderSha256) }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures, interpretation: 'Top bevel width/height and contour color are proven as independent native controls on both text and shape carriers; the universal 2,258-row registry remains open.' }
const reportPath = path.join(outDir, 'text3d-top-bevel-contour-color-five-point-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
