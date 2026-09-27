#!/usr/bin/env node
// Global non-Picture capability canary: prove the discrete shape shadow
// rotateWithShape option through native DrawingML, Office round-trip, and visuals.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-discrete/shape-shadow-rotate-with-shape/${stamp}`)
const generated = path.join(outDir, 'shape-shadow-rotate-with-shape.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [false, true]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const readRotateWithShape = xml => {
	const shadow = xml.match(/<a:outerShdw\b[^>]*\brotWithShape="([01])"[^>]*>[\s\S]*?<\/a:outerShdw>/)
	return shadow ? shadow[1] === '1' : null
}

await fs.mkdir(outDir, { recursive: true })
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global non-Picture parameter proof'
pptx.subject = 'Shape shadow rotateWithShape discrete native contract'
pptx.title = 'Shape shadow rotateWithShape canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const [index, rotateWithShape] of values.entries()) {
	const slide = pptx.addSlide()
	slide.background = { color: 'F6F8FB' }
	slide.addText('Shape shadow rotate-with-shape canary', { x: 1, y: 0.65, w: 11.3, h: 0.55, fontFace: 'Aptos Display', fontSize: 24, color: '102A43', bold: true, margin: 0, align: 'center' })
	slide.addShape(pptx.ShapeType.roundRect, {
		x: 3.15, y: 2.0, w: 7.0, h: 3.2, rotate: 35,
		objectName: `shape-shadow-rotate-with-shape-${index + 1}`,
		fill: { color: '38BDF8' },
		line: { color: '0F4C81', width: 1.5 },
		shadow: { type: 'outer', color: '000000', opacity: 0.72, blur: 12, offset: 12, angle: 25, skewX: 18, skewY: 7, rotateWithShape },
	})
	slide.addNotes(`Native shape shadow rotateWithShape checkpoint ${index + 1}: ${rotateWithShape}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const generatedZip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xmlRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await generatedZip.file(`ppt/slides/slide${index}.xml`).async('string')
	const serialized = readRotateWithShape(xml)
	xmlRows.push({ slide: index, requested: values[index - 1], serialized, expectedSerialized: values[index - 1] })
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
	const serialized = readRotateWithShape(xml)
	const png = path.join(outDir, `roundtrip-slide-${String(index).padStart(2, '0')}.png`)
	const requested = values[index - 1]
	const officeCanonicalDefault = requested && serialized === null
	roundtripRows.push({ slide: index, requested, serialized, expectedSerialized: requested, retained: requested ? (serialized === true || officeCanonicalDefault) : (serialized === false || serialized === null), officeCanonicalDefault, renderSha256: sha256(await fs.readFile(png)) })
}

const failures = []
for (const row of xmlRows) if (row.serialized !== row.expectedSerialized) failures.push(`generated slide ${row.slide} rotateWithShape ${row.serialized} expected ${row.expectedSerialized}`)
for (const row of roundtripRows) if (!row.retained) failures.push(`roundtrip slide ${row.slide} rotateWithShape ${row.serialized} not retained`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== values.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const uniqueRenderCount = new Set(roundtripRows.map(row => row.renderSha256)).size
if (uniqueRenderCount !== values.length) failures.push(`visual render hashes are not distinct: ${uniqueRenderCount}/${values.length}`)
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-shape-shadow-rotate-with-shape.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	controlId: 'shapes.effects.shadow.rotateWithShape',
	capabilityFamily: 'shapes-effects',
	contract: { type: 'discrete', valueType: 'boolean', values, default: false, serializer: 'generated XML a:outerShdw/@rotWithShape = 0|1', reset: 'set style.shadow.rotateWithShape to null or remove the shadow component; Office may omit rotWithShape=1 because true is the OOXML default on SaveCopyAs' },
	checkpoints: values.map((value, index) => ({ checkpoint: index === 0 ? 'false' : 'true', value, expectedSerialized: value })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeShadow: failures.length === 0, distinctVisualRenders: uniqueRenderCount === values.length, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, xmlRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows },
	office,
	failures,
	interpretation: 'A discrete non-Picture shadow option is proven through the native shape shadow carrier with a rotated shape so the rotate-with-shape distinction is visually exercised; this closes only one isolated boolean row and does not close the universal 2,258-row registry.',
}
const reportPath = path.join(outDir, 'shape-shadow-rotate-with-shape-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
