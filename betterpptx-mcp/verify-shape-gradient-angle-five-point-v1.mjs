#!/usr/bin/env node
// Second non-Picture global canary: continuous gradient angle on a native shape.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-gradient-angle/${stamp}`)
const generated = path.join(outDir, 'shape-gradient-angle-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 90, 180, 270, 359]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global non-Picture parameter proof'
pptx.subject = 'Shape gradient angle five-point native contract'
pptx.title = 'Shape gradient angle five-point canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const angle of values) {
	const slide = pptx.addSlide()
	slide.background = { color: 'F6F8FB' }
	slide.addText('Shape gradient angle canary', { x: 1, y: 0.65, w: 11.3, h: 0.55, fontFace: 'Aptos Display', fontSize: 24, color: '102A43', bold: true, margin: 0, align: 'center' })
	slide.addShape(pptx.ShapeType.roundRect, {
		x: 2.75, y: 1.75, w: 7.5, h: 3.7,
		objectName: 'shape-gradient-angle',
		fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: angle, gradientStops: [{ position: 0, color: '0F4C81' }, { position: 100, color: 'F59E0B' }] },
		line: { color: '0F4C81', width: 1.5 },
	})
	slide.addNotes(`Native shape gradient angle checkpoint: ${angle} degrees.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const readAngle = xml => {
	const match = xml.match(/<a:gradFill[\s\S]*?<a:lin\s+ang="(\d+)"/)
	return match ? Number(match[1]) : null
}
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const generatedRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
	const rawAngle = readAngle(xml)
	generatedRows.push({ slide: index, requestedDegrees: values[index - 1], rawAngle, expectedRawAngle: Math.round(values[index - 1] * 60000), retained: rawAngle !== null })
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
	const rawAngle = readAngle(xml)
	roundtripRows.push({ slide: index, requestedDegrees: values[index - 1], rawAngle, expectedRawAngle: Math.round(values[index - 1] * 60000), retained: rawAngle !== null, renderSha256: sha256(await fs.readFile(png)) })
}
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (!row.retained || row.rawAngle !== row.expectedRawAngle) failures.push(`slide ${row.slide} angle ${row.requestedDegrees} raw ${row.rawAngle} expected ${row.expectedRawAngle}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== values.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-shape-gradient-angle-five-point.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	controlId: 'shapes.fill.gradientAngle',
	capabilityFamily: 'shapes-gradients',
	checkpoints: values.map((value, index) => ({ checkpoint: ['minimum', 'quarter', 'midpoint', 'threeQuarter', 'offPreset'][index], value, expectedRawAngle: Math.round(value * 60000) })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeGradient: failures.length === 0, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows },
	office,
	failures,
	interpretation: 'A second non-Picture continuous parameter is proven through the native shape fill carrier. This closes only the isolated shape gradient-angle canary; it does not close the universal 2,258-row registry or other fill controls.',
}
const reportPath = path.join(outDir, 'shape-gradient-angle-five-point-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
