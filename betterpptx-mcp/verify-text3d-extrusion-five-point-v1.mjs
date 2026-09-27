#!/usr/bin/env node
// Non-Picture 3-D text-family canary: the continuous extrusion-depth parameter.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-extrusion/${stamp}`)
const generated = path.join(outDir, 'text3d-extrusion-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 4, 8, 16, 32]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global Text3D parameter proof'
pptx.subject = 'Text3D extrusion depth five-point native contract'
pptx.title = 'Text3D extrusion depth five-point canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const extrusion of values) {
	const slide = pptx.addSlide()
	slide.background = { color: '0B1220' }
	slide.addText('Text3D extrusion canary', {
		x: 1.0, y: 2.1, w: 11.3, h: 1.4, objectName: 'text3d-extrusion',
		fontFace: 'Aptos Display', fontSize: 38, bold: true, color: 'F8FAFC',
		align: 'center', valign: 'mid', margin: 0,
		text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion, extrusionColor: '38BDF8', material: 'matte', lightRig: 'threePt', rotationX: 18, rotationY: 22 },
	})
	slide.addNotes(`Native Text3D extrusion checkpoint: ${extrusion} points.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const readExtrusion = xml => {
	const match = xml.match(/<a:sp3d\b[^>]*\bextrusionH="(\d+)"/)
	return match ? Number(match[1]) / 12700 : 0
}
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const generatedRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
	const actual = readExtrusion(xml)
	generatedRows.push({ slide: index, requestedPt: values[index - 1], actualPt: actual, retained: actual === values[index - 1] })
}
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''")
const rtPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const rtZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await rtZip.file(`ppt/slides/slide${index}.xml`).async('string')
	const png = path.join(outDir, `roundtrip-slide-${String(index).padStart(2, '0')}.png`)
	const actual = readExtrusion(xml)
	roundtripRows.push({ slide: index, requestedPt: values[index - 1], actualPt: actual, retained: actual === values[index - 1], renderSha256: sha256(await fs.readFile(png)) })
}
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (row.actualPt !== row.requestedPt) failures.push(`slide ${row.slide} extrusion ${row.requestedPt} actual ${row.actualPt}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== values.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size !== values.length) failures.push('Text3D extrusion renders did not remain distinct')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text3d-extrusion-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlId: 'text3DShape.extrusion', capabilityFamily: 'text3d',
	checkpoints: values.map((value, index) => ({ checkpoint: ['minimum', 'low', 'baseline', 'high', 'extended'][index], value, unit: 'points' })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeText3DExtrusion: failures.length === 0, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'Five Text3D extrusion-depth values are proven through the native text carrier with static content. This closes one isolated numeric 3-D option row only; bevel/material/light controls and the universal 2,258-row registry remain open.',
}
const reportPath = path.join(outDir, 'text3d-extrusion-five-point-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
