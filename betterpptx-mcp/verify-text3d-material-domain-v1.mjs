#!/usr/bin/env node
// Shared shape/text 3-D proof for the complete native material preset domain.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-material/${stamp}`)
const generated = path.join(outDir, 'text3d-material-domain.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = ['legacyMatte', 'legacyPlastic', 'legacyMetal', 'legacyWireframe', 'matte', 'plastic', 'metal', 'warmMatte', 'translucentPowder', 'powder', 'dkEdge', 'softEdge', 'clear', 'flat', 'softmetal']
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global Text3D and shape 3-D material proof'; pptx.subject = 'Native material preset domain'; pptx.title = 'Text3D material domain canary'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const requestedRows = []
for (const carrier of ['text3D', 'shape3D']) for (const material of values) {
	const threeD = { bevel: { type: 'circle', width: 8, height: 8 }, bevelBottom: { type: 'circle', width: 8, height: 8 }, extrusion: 24, extrusionColor: '38BDF8', contourWidth: 8, contourColor: 'F97316', material, lightRig: 'threePt', lightDirection: 45, rotationX: 18, rotationY: 22 }
	const slide = pptx.addSlide(); slide.background = { color: '0B1220' }
	if (carrier === 'text3D') slide.addText(`Text3D material ${material}`, { x: 0.7, y: 2.1, w: 12, h: 1.4, objectName: `text3d-material-${material}`, fontFace: 'Aptos Display', fontSize: 30, bold: true, color: 'F8FAFC', align: 'center', valign: 'mid', margin: 0, text3D: threeD })
	else slide.addShape(pptx.ShapeType.roundRect, { x: 3.0, y: 1.7, w: 7.3, h: 2.2, objectName: `shape3d-material-${material}`, fill: { color: '1D4ED8' }, line: { color: '38BDF8', width: 1.5 }, effect3D: threeD })
	slide.addNotes(`Native ${carrier} material checkpoint: ${material}.`)
	requestedRows.push({ slide: requestedRows.length + 1, carrier, requested: material })
}
await pptx.writeFile({ fileName: generated, compression: false })

const readMaterial = xml => xml.match(/<a:sp3d\b[^>]*\bprstMaterial="([^"]+)"/)?.[1] || null
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true }); const generatedRows = []
for (const requested of requestedRows) { const xml = await zip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const actual = readMaterial(xml); generatedRows.push({ ...requested, actual, retained: actual === requested.requested, serializedXml: actual !== null }) }
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 }); const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''"); const rtPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 }); const office = JSON.parse(officeStdout.trim())
const rtZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true }); const roundtripRows = []
for (const requested of requestedRows) { const xml = await rtZip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const png = path.join(outDir, `roundtrip-slide-${String(requested.slide).padStart(2, '0')}.png`); const actual = readMaterial(xml); const retained = actual === requested.requested || (requested.requested === 'warmMatte' && actual === null); roundtripRows.push({ ...requested, actual, retained, officeBoundary: requested.requested === 'warmMatte' && actual === null, renderSha256: sha256(await fs.readFile(png)) }) }
const failures = []
for (const row of generatedRows) if (!row.retained) failures.push(`generated ${row.carrier} slide ${row.slide} material ${row.requested} actual ${row.actual}`)
for (const row of roundtripRows) if (!row.retained) failures.push(`roundtrip ${row.carrier} slide ${row.slide} material ${row.requested} actual ${row.actual}`)
for (const carrier of ['text3D', 'shape3D']) { const rows = roundtripRows.filter(row => row.carrier === carrier); if (rows.some(row => !row.renderSha256)) failures.push(`${carrier} material renders missing`) }
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed'); if (office.status !== 'PASS' || office.slideCount !== requestedRows.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const warmMatteBoundaryRows = roundtripRows.filter(row => row.officeBoundary).length
const report = { schemaVersion: 'betterpptx.global-text3d-material-domain.v1', status: failures.length ? 'FAIL' : 'PASS', control: { id: 'material', field: 'material', values, default: 'warmMatte', type: 'discrete', serializer: 'a:sp3d/@prstMaterial' }, capabilityFamily: 'shape-text-3d', proof: { exhaustiveDomain: generatedRows.every(row => row.retained), packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNative3D: failures.length === 0, visualRenders: roundtripRows.map(row => row.renderSha256) }, officeBoundary: { expected: 'PowerPoint/SaveAs may omit warmMatte prstMaterial', warmMatteRowsOmitted: warmMatteBoundaryRows, warmMatteRowsExpected: 2 }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures, interpretation: 'All fifteen native material presets are serialized on both text and shape carriers; warmMatte Office omission is recorded as an explicit roundtrip boundary. Universal formal closure remains 0/2258.' }
const reportPath = path.join(outDir, 'text3d-material-domain-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, warmMatteBoundaryRows, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
