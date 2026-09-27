#!/usr/bin/env node
// Non-Picture 3-D text-family canary: the continuous rotationX parameter.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-rotation/${stamp}`)
const generated = path.join(outDir, 'text3d-rotation-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 90, 180, 270, 359]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global Text3D parameter proof'
pptx.subject = 'Text3D rotationX five-point native contract'
pptx.title = 'Text3D rotationX five-point canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const rotationX of values) {
	const slide = pptx.addSlide()
	slide.background = { color: '0B1220' }
	slide.addText('Text3D rotation canary', {
		x: 1.0, y: 2.1, w: 11.3, h: 1.4, objectName: 'text3d-rotation',
		fontFace: 'Aptos Display', fontSize: 38, bold: true, color: 'F8FAFC',
		align: 'center', valign: 'mid', margin: 0,
		text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: '38BDF8', material: 'matte', lightRig: 'threePt', rotationX },
	})
	slide.addNotes(`Native Text3D rotationX checkpoint: ${rotationX} degrees.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const readRotationX = xml => {
	const match = xml.match(/<a:camera[\s\S]*?<a:rot\s+lat="(-?\d+)"/)
	return match ? Number(match[1]) / 60000 : (/<a:camera\b/.test(xml) ? 0 : null)
}
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const generatedRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
	const actual = readRotationX(xml)
	generatedRows.push({ slide: index, requestedDeg: values[index - 1], actualDeg: actual, retained: actual === values[index - 1] })
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
	const actual = readRotationX(xml)
	roundtripRows.push({ slide: index, requestedDeg: values[index - 1], actualDeg: actual, retained: actual === values[index - 1], renderSha256: sha256(await fs.readFile(png)) })
}
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (row.actualDeg !== row.requestedDeg) failures.push(`slide ${row.slide} rotationX ${row.requestedDeg} actual ${row.actualDeg}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== values.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size !== values.length) failures.push('Text3D rotation renders did not remain distinct')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text3d-rotation-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlId: 'text3DRotation.rotationX', capabilityFamily: 'text3d',
	checkpoints: values.map((value, index) => ({ checkpoint: ['minimum', 'quarterTurn', 'halfTurn', 'threeQuarterTurn', 'nearFullTurn'][index], value, unit: 'degrees' })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeText3DRotation: failures.length === 0, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'Five Text3D rotationX values are proven through the native text carrier with static content. This closes one isolated Text3D rotation row only; other 3-D rotation axes, bevel/material/light controls, and the universal 2,258-row registry remain open.',
}
const reportPath = path.join(outDir, 'text3d-rotation-five-point-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
