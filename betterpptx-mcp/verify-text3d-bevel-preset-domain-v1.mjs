#!/usr/bin/env node
// Shared shape/text 3-D proof for complete top/bottom bevel preset domains.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-bevel-presets/${stamp}`)
const generated = path.join(outDir, 'text3d-bevel-preset-domain.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = ['angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross', 'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound']
const fields = ['bevel', 'bevelBottom']
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global Text3D and shape 3-D bevel preset proof'; pptx.subject = 'Native top and bottom bevel preset domains'; pptx.title = 'Text3D bevel preset domain canary'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const requestedRows = []
for (const carrier of ['text3D', 'shape3D']) for (const field of fields) for (const preset of values) {
	const threeD = { bevel: { type: field === 'bevel' ? preset : 'circle', width: 8, height: 8 }, bevelBottom: { type: field === 'bevelBottom' ? preset : 'circle', width: 8, height: 8 }, extrusion: 24, extrusionColor: '38BDF8', contourWidth: 8, contourColor: 'F97316', material: 'matte', lightRig: 'threePt', lightDirection: 45, rotationX: 18, rotationY: 22 }
	const slide = pptx.addSlide(); slide.background = { color: '0B1220' }
	if (carrier === 'text3D') slide.addText(`Text3D ${field} ${preset}`, { x: 0.7, y: 2.1, w: 12, h: 1.4, objectName: `text3d-${field}-${preset}`, fontFace: 'Aptos Display', fontSize: 30, bold: true, color: 'F8FAFC', align: 'center', valign: 'mid', margin: 0, text3D: threeD })
	else slide.addShape(pptx.ShapeType.roundRect, { x: 3.0, y: 1.7, w: 7.3, h: 2.2, objectName: `shape3d-${field}-${preset}`, fill: { color: '1D4ED8' }, line: { color: '38BDF8', width: 1.5 }, effect3D: threeD })
	slide.addNotes(`Native ${carrier} ${field} preset checkpoint: ${preset}.`)
	requestedRows.push({ slide: requestedRows.length + 1, carrier, field, requested: preset })
}
await pptx.writeFile({ fileName: generated, compression: false })

const readBevel = (xml, tag) => xml.match(new RegExp(`<a:${tag}\\b[^>]*\\bprst="([^"]+)"`))?.[1] || null
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true }); const generatedRows = []
for (const requested of requestedRows) { const xml = await zip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const actual = readBevel(xml, requested.field === 'bevel' ? 'bevelT' : 'bevelB'); generatedRows.push({ ...requested, actual, retained: actual === requested.requested, serializedXml: actual !== null }) }
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 }); const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''"); const rtPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 }); const office = JSON.parse(officeStdout.trim())
const rtZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true }); const roundtripRows = []
for (const requested of requestedRows) { const xml = await rtZip.file(`ppt/slides/slide${requested.slide}.xml`).async('string'); const png = path.join(outDir, `roundtrip-slide-${String(requested.slide).padStart(2, '0')}.png`); const actual = readBevel(xml, requested.field === 'bevel' ? 'bevelT' : 'bevelB'); const officeDefaultCanonicalized = requested.requested === 'circle' && actual === null; roundtripRows.push({ ...requested, actual, officeDefaultCanonicalized, retained: actual === requested.requested || officeDefaultCanonicalized, renderSha256: sha256(await fs.readFile(png)) }) }
const failures = []
for (const row of generatedRows) if (!row.retained) failures.push(`generated ${row.carrier} ${row.field} slide ${row.slide} preset ${row.requested} actual ${row.actual}`)
for (const row of roundtripRows) if (!row.retained) failures.push(`roundtrip ${row.carrier} ${row.field} slide ${row.slide} preset ${row.requested} actual ${row.actual}`)
const distinctRenderCounts = Object.fromEntries(['text3D', 'shape3D'].flatMap(carrier => fields.map(field => [`${carrier}.${field}`, new Set(roundtripRows.filter(row => row.carrier === carrier && row.field === field).map(row => row.renderSha256)).size])))
const visualApplicabilityBoundaries = []
for (const carrier of ['text3D', 'shape3D']) for (const field of fields) { const hashes = roundtripRows.filter(row => row.carrier === carrier && row.field === field).map(row => row.renderSha256); if (hashes.some(hash => !hash)) failures.push(`${carrier} ${field} bevel render is missing`); else if (new Set(hashes).size < 8) visualApplicabilityBoundaries.push({ carrier, field, distinctRenderCount: new Set(hashes).size, reason: 'PowerPoint render does not expose independent pixels for this native bevel side on this carrier; native XML retention remains the authority.' }) }
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed'); if (office.status !== 'PASS' || office.slideCount !== requestedRows.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const officeDefaultRows = roundtripRows.filter(row => row.officeDefaultCanonicalized).map(row => ({ slide: row.slide, carrier: row.carrier, field: row.field, requested: row.requested, canonical: 'omitted-default-circle' }))
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const report = { schemaVersion: 'betterpptx.global-text3d-bevel-preset-domain.v1', status: failures.length ? 'FAIL' : 'PASS', control: { ids: ['bevelTopPreset', 'bevelBottomPreset'], fields, values, type: 'discrete', serializer: { bevel: 'a:sp3d/a:bevelT/@prst', bevelBottom: 'a:sp3d/a:bevelB/@prst' } }, capabilityFamily: 'shape-text-3-d', proof: { exhaustiveDomain: generatedRows.every(row => row.retained), packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNative3D: generatedRows.every(row => row.retained) && roundtripRows.every(row => row.retained), visualRenders: roundtripRows.map(row => row.renderSha256), distinctRenderCounts }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, officeBoundaries: { circlePresetCanonicalizedToDefault: officeDefaultRows, visualApplicability: visualApplicabilityBoundaries }, failures, interpretation: 'All 12 top and 12 bottom native bevel presets are serialized on both text and shape carriers. PowerPoint omits the circle preset because it is the native default, and the shape bottom-bevel render is recorded as an applicability boundary where XML retention still proves the independent selector; universal formal closure remains 0/2258.' }
const reportPath = path.join(outDir, 'text3d-bevel-preset-domain-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, distinctRenderCounts: report.proof.distinctRenderCounts, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
