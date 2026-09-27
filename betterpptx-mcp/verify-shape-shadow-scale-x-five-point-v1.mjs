#!/usr/bin/env node
// Global non-Picture capability canary: prove the continuous shape shadow
// horizontal-scale control through native DrawingML, Office round-trip, and visuals.
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
const scaleAxis = String(process.env.BETTERPPTX_SHADOW_SCALE_AXIS || 'X').toUpperCase() === 'Y' ? 'Y' : 'X'
const scaleField = scaleAxis === 'Y' ? 'scaleY' : 'scaleX'
const serializedField = scaleAxis === 'Y' ? 'sy' : 'sx'
const axisLabel = scaleAxis === 'Y' ? 'vertical' : 'horizontal'
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-shadow-scale-${scaleAxis.toLowerCase()}/${stamp}`)
const generated = path.join(outDir, `shape-shadow-scale-${scaleAxis.toLowerCase()}-five-point.pptx`)
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 0.5, 1, 1.5, 2]
const ONE_HUNDRED_THOUSAND = 100000
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const readScale = xml => {
	const shadow = xml.match(new RegExp(`<a:outerShdw\\b[^>]*\\b${serializedField}="(\\d+)"[^>]*>[\\s\\S]*?<\\/a:outerShdw>`))
	return shadow ? Number(shadow[1]) : null
}

await fs.mkdir(outDir, { recursive: true })
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global non-Picture parameter proof'
pptx.subject = `Shape shadow ${axisLabel} scale five-point native contract`
pptx.title = `Shape shadow ${axisLabel} scale five-point canary`
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const [index, scale] of values.entries()) {
	const slide = pptx.addSlide()
	slide.background = { color: 'F6F8FB' }
	slide.addText(`Shape shadow ${axisLabel} scale canary`, { x: 1, y: 0.65, w: 11.3, h: 0.55, fontFace: 'Aptos Display', fontSize: 24, color: '102A43', bold: true, margin: 0, align: 'center' })
	slide.addShape(pptx.ShapeType.roundRect, {
		x: 3.15, y: 2.0, w: 7.0, h: 3.2,
		objectName: `shape-shadow-scale-${scaleAxis.toLowerCase()}`,
		fill: { color: '38BDF8' },
		line: { color: '0F4C81', width: 1.5 },
		shadow: { type: 'outer', color: '000000', opacity: 0.72, blur: 12, offset: 12, angle: 90, [scaleField]: scale },
	})
	slide.addNotes(`Native shape shadow ${axisLabel} scale checkpoint ${index + 1}: ${scale}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const generatedZip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xmlRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await generatedZip.file(`ppt/slides/slide${index}.xml`).async('string')
	const serialized = readScale(xml)
	xmlRows.push({ slide: index, requestedScale: values[index - 1], serialized, expectedSerialized: Math.round(values[index - 1] * ONE_HUNDRED_THOUSAND), retained: serialized !== null })
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
	const serialized = readScale(xml)
	const png = path.join(outDir, `roundtrip-slide-${String(index).padStart(2, '0')}.png`)
	const requestedScale = values[index - 1]
	const officeCanonicalReset = requestedScale === 0 && serialized === null
	const officeCanonicalDefault = requestedScale === 1 && serialized === null
	roundtripRows.push({ slide: index, requestedScale, serialized, expectedSerialized: Math.round(requestedScale * ONE_HUNDRED_THOUSAND), retained: requestedScale === 0 ? (serialized === null || serialized === 0) : requestedScale === 1 ? (serialized === null || serialized === ONE_HUNDRED_THOUSAND) : serialized !== null, officeCanonicalReset, officeCanonicalDefault, renderSha256: sha256(await fs.readFile(png)) })
}

const failures = []
for (const row of [...xmlRows, ...roundtripRows]) if (!row.retained || (!row.officeCanonicalReset && !row.officeCanonicalDefault && row.serialized !== row.expectedSerialized)) failures.push(`slide ${row.slide} ${scaleField} ${row.requestedScale} serialized ${row.serialized} expected ${row.expectedSerialized}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== values.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const uniqueRenderCount = new Set(roundtripRows.map(row => row.renderSha256)).size
if (uniqueRenderCount !== values.length) failures.push(`visual render hashes are not distinct: ${uniqueRenderCount}/${values.length}`)
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-shape-shadow-scale-x-five-point.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	controlId: `shapes.effects.shadow.${scaleField}`,
	capabilityFamily: 'shapes-effects',
	contract: { type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 1 / ONE_HUNDRED_THOUSAND, unit: 'multiplier', serializer: `generated XML a:outerShdw/@${serializedField} = round(value * 100000)`, reset: `set style.shadow.${scaleField} to null or remove the shadow component; Office may omit neutral ${serializedField}=100000 at the default multiplier on SaveCopyAs` },
	checkpoints: values.map((value, index) => ({ checkpoint: ['minimum', 'quarter', 'midpoint', 'threeQuarter', 'maximum'][index], value, expectedSerialized: Math.round(value * ONE_HUNDRED_THOUSAND) })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeShadow: failures.length === 0, distinctVisualRenders: uniqueRenderCount === values.length, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, xmlRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows },
	office,
	failures,
	interpretation: `A non-Picture continuous parameter is proven through the native shape shadow carrier. This closes only the isolated shape shadow ${axisLabel}-scale canary; it does not close the universal 2,258-row registry or other shadow controls.`,
}
const reportPath = path.join(outDir, `shape-shadow-scale-${scaleAxis.toLowerCase()}-five-point-proof.json`)
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
