#!/usr/bin/env node
// Shared shape/text 3-D proof for the independent light-direction degree leaf.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-light-direction/${stamp}`)
const generated = path.join(outDir, 'text3d-light-direction-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 45, 90, 180, 315]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global Text3D and shape 3-D parameter proof'; pptx.subject = 'Native light direction five-point contract'; pptx.title = 'Text3D light direction five-point canary'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const requestedRows = []
for (const carrier of ['text3D', 'shape3D']) for (const value of values) {
	const threeD = { bevel: { type: 'circle', width: 8, height: 8 }, bevelBottom: { type: 'circle', width: 8, height: 8 }, extrusion: 24, extrusionColor: '38BDF8', contourWidth: 8, contourColor: 'F97316', material: 'matte', lightRig: 'threePt', lightDirection: value, rotationX: 18, rotationY: 22 }
	const slide = pptx.addSlide(); slide.background = { color: '0B1220' }
	if (carrier === 'text3D') slide.addText(`Text3D lightDirection ${value}`, { x: 0.7, y: 2.1, w: 12, h: 1.4, objectName: `text3d-light-direction-${value}`, fontFace: 'Aptos Display', fontSize: 30, bold: true, color: 'F8FAFC', align: 'center', valign: 'mid', margin: 0, text3D: threeD })
	else slide.addShape(pptx.ShapeType.roundRect, { x: 3.0, y: 1.7, w: 7.3, h: 2.2, objectName: `shape3d-light-direction-${value}`, fill: { color: '1D4ED8' }, line: { color: '38BDF8', width: 1.5 }, effect3D: threeD })
	slide.addNotes(`Native ${carrier} lightDirection checkpoint: ${value} degrees.`)
	requestedRows.push({ slide: requestedRows.length + 1, carrier, requested: value })
}
await pptx.writeFile({ fileName: generated, compression: false })

const readLightDirection = xml => {
	const lightRig = xml.match(/<a:lightRig\b[\s\S]*?<\/a:lightRig>/)
	const rotation = lightRig?.[0]?.match(/<a:rot\b[^>]*\brev="(\d+)"/)
	return rotation ? Number(rotation[1]) / 60000 : 0
}
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true }); const generatedRows = []
for (const requested of requestedRows) { const xml = await zip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const actual = readLightDirection(xml); generatedRows.push({ ...requested, actual, retained: Math.abs(actual - requested.requested) < 0.0001, serializedXml: xml.includes('<a:lightRig') }) }
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 }); const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''"); const rtPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 }); const office = JSON.parse(officeStdout.trim())
const rtZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true }); const roundtripRows = []
for (const requested of requestedRows) { const xml = await rtZip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const png = path.join(outDir, `roundtrip-slide-${String(requested.slide).padStart(2, '0')}.png`); const actual = readLightDirection(xml); roundtripRows.push({ ...requested, actual, retained: Math.abs(actual - requested.requested) < 0.0001, renderSha256: sha256(await fs.readFile(png)) }) }
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (!row.retained) failures.push(`${row.carrier} slide ${row.slide} lightDirection ${row.requested} actual ${row.actual}`)
for (const carrier of ['text3D', 'shape3D']) { const hashes = roundtripRows.filter(row => row.carrier === carrier).map(row => row.renderSha256); if (new Set(hashes).size !== values.length) failures.push(`${carrier} lightDirection renders did not remain distinct`) }
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed'); if (office.status !== 'PASS' || office.slideCount !== requestedRows.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const report = { schemaVersion: 'betterpptx.global-text3d-light-direction-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', control: { id: 'lightDirectionDeg', field: 'lightDirection', values, unit: 'degrees', minimum: 0, maximum: 359, default: 0, serializer: 'a:scene3d/a:lightRig/a:rot/@rev = round(lightDirection * 60000)' }, capabilityFamily: 'shape-text-3d', proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNative3D: failures.length === 0, visualRenders: roundtripRows.map(row => row.renderSha256) }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures, interpretation: 'Light-direction degrees are proven as an independent native control on both text and shape carriers; the universal 2,258-row registry remains open.' }
const reportPath = path.join(outDir, 'text3d-light-direction-five-point-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
