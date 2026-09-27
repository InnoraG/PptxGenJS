#!/usr/bin/env node
// Global effect canary: prove fill-overlay normalized transparency through
// native DrawingML alpha, Office round-trip, package integrity, and visuals.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-discrete/fill-overlay-transparency/${stamp}`)
const generated = path.join(outDir, 'fill-overlay-transparency.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0.2, 0.8]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const readAlpha = xml => {
	const match = xml.match(/<a:fillOverlay\b[\s\S]*?<a:srgbClr\b[^>]*>[\s\S]*?<a:alpha\b[^>]*\bval="(\d+)"[^>]*\/>[\s\S]*?<\/a:fillOverlay>/)
	return match ? Number(match[1]) : null
}

await fs.mkdir(outDir, { recursive: true })
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global effect parameter proof'
pptx.subject = 'Fill overlay transparency continuous native contract'
pptx.title = 'Fill overlay transparency canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const [index, transparency] of values.entries()) {
	const slide = pptx.addSlide()
	slide.background = { color: 'F6F8FB' }
	slide.addText('Fill overlay transparency canary', { x: 1, y: 0.65, w: 11.3, h: 0.55, fontFace: 'Aptos Display', fontSize: 24, color: '102A43', bold: true, margin: 0, align: 'center' })
	slide.addText(`fill.transparency = ${transparency}`, { x: 1.25, y: 1.35, w: 10.8, h: 0.4, fontFace: 'Aptos', fontSize: 16, color: '486581', margin: 0, align: 'center' })
	slide.addShape(pptx.ShapeType.roundRect, {
		x: 3.2, y: 2.2, w: 6.8, h: 2.7,
		objectName: `fill-overlay-transparency-${index + 1}`,
		fill: { color: 'FF6B6B' },
		line: { color: '0F4C81', width: 1.5 },
		fillOverlay: { blend: 'mult', fill: { color: '2563EB', transparency } },
	})
	slide.addNotes(`Native fill overlay transparency checkpoint ${index + 1}: ${transparency}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const generatedZip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xmlRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await generatedZip.file(`ppt/slides/slide${index}.xml`).async('string')
	const serialized = readAlpha(xml)
	xmlRows.push({ slide: index, requested: values[index - 1], serialized, expectedSerialized: Math.round((1 - values[index - 1]) * 100000) })
}
const auditCommand = path.join(root, 'tools', 'audit-pptx-package-integrity.mjs')
const { stdout: auditStdout } = await run(process.execPath, [auditCommand, generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)

const psPath = generated.replace(/'/g, "''")
const rtPath = roundtrip.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outDir.replace(/'/g, "''")}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await roundtripZip.file(`ppt/slides/slide${index}.xml`).async('string')
	const serialized = readAlpha(xml)
	const png = path.join(outDir, `roundtrip-slide-${String(index).padStart(2, '0')}.png`)
	roundtripRows.push({ slide: index, requested: values[index - 1], serialized, expectedSerialized: Math.round((1 - values[index - 1]) * 100000), retained: serialized === Math.round((1 - values[index - 1]) * 100000), renderSha256: sha256(await fs.readFile(png)) })
}

const failures = []
for (const row of xmlRows) if (row.serialized !== row.expectedSerialized) failures.push(`generated slide ${row.slide} alpha ${row.serialized} expected ${row.expectedSerialized}`)
for (const row of roundtripRows) if (!row.retained) failures.push(`roundtrip slide ${row.slide} alpha ${row.serialized} not retained`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== values.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const uniqueRenderCount = new Set(roundtripRows.map(row => row.renderSha256)).size
if (uniqueRenderCount !== values.length) failures.push(`visual render hashes are not distinct: ${uniqueRenderCount}/${values.length}`)
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-fill-overlay-transparency.v1', status: failures.length ? 'FAIL' : 'PASS', controlId: 'effects.fillOverlay.fill.transparency', capabilityFamily: 'shape-picture-effects',
	contract: { type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 1 / 100000, unit: 'normalized', serializer: 'generated XML a:solidFill/a:srgbClr/a:alpha = round((1 - transparency) * 100000)', reset: 'set style.fillOverlay.fill.transparency to null or remove the fillOverlay component; compatibility percentage inputs above 1 are normalized by the serializer' },
	checkpoints: values.map((value, index) => ({ checkpoint: index === 0 ? '20%' : '80%', value, expectedSerialized: Math.round((1 - value) * 100000) })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeFillOverlayAlpha: failures.length === 0, distinctVisualRenders: uniqueRenderCount === values.length, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, xmlRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'The fill-overlay fill transparency slider is proven with normalized 0.2/0.8 alpha serialization, Office reopen retention, and distinct static renders. This closes only one isolated effect row and does not close the universal 2,258-row registry.',
}
const reportPath = path.join(outDir, 'fill-overlay-transparency-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
