#!/usr/bin/env node
// Global shape-effect canary: prove glow opacity checkpoints through native
// DrawingML, Office round-trip, package integrity, and visuals.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-glow-opacity/${stamp}`)
const generated = path.join(outDir, 'shape-glow-opacity-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 0.25, 0.5, 0.75, 1]
const radiusPt = 24
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const readGlowAlpha = xml => {
	const match = xml.match(/<a:glow\b[^>]*>[\s\S]*?<a:(?:srgbClr|schemeClr)\b[^>]*>[\s\S]*?<a:alpha\b[^>]*\bval="(\d+)"/)
	return match ? Number(match[1]) : null
}

await fs.mkdir(outDir, { recursive: true })
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global shape effect parameter proof'
pptx.subject = 'Shape glow opacity normalized contract'
pptx.title = 'Shape glow opacity canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const [index, opacity] of values.entries()) {
	const slide = pptx.addSlide()
	slide.background = { color: '0B1220' }
	slide.addText('Shape glow opacity canary', { x: 1, y: 0.65, w: 11.3, h: 0.55, fontFace: 'Aptos Display', fontSize: 24, color: 'E6F6FF', bold: true, margin: 0, align: 'center' })
	slide.addText(`opacity = ${opacity}`, { x: 1.25, y: 1.35, w: 10.8, h: 0.4, fontFace: 'Aptos', fontSize: 16, color: '9CC4D8', margin: 0, align: 'center' })
	slide.addShape(pptx.ShapeType.roundRect, {
		x: 3.3, y: 2.2, w: 6.6, h: 2.6,
		objectName: `shape-glow-opacity-${index + 1}`,
		fill: { color: '102A43' },
		line: { color: '38BDF8', width: 1.5 },
		glow: { size: radiusPt, opacity, color: '38BDF8' },
	})
	slide.addNotes(`Native shape glow opacity checkpoint ${index + 1}: ${opacity} normalized.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const generatedZip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xmlRows = []
for (let index = 1; index <= values.length; index++) {
	const xml = await generatedZip.file(`ppt/slides/slide${index}.xml`).async('string')
	const serialized = readGlowAlpha(xml)
	const requested = values[index - 1]
	xmlRows.push({ slide: index, requested, serialized, expectedSerialized: Math.round(requested * 100000) })
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
	const serialized = readGlowAlpha(xml)
	const requested = values[index - 1]
	const expectedSerialized = Math.round(requested * 100000)
	const png = path.join(outDir, `roundtrip-slide-${String(index).padStart(2, '0')}.png`)
	roundtripRows.push({ slide: index, requested, serialized, expectedSerialized, retained: serialized === expectedSerialized, renderSha256: sha256(await fs.readFile(png)) })
}

const failures = []
for (const row of xmlRows) if (row.serialized !== row.expectedSerialized) failures.push(`generated slide ${row.slide} glow alpha ${row.serialized} expected ${row.expectedSerialized}`)
for (const row of roundtripRows) if (!row.retained) failures.push(`roundtrip slide ${row.slide} glow alpha ${row.serialized} not retained`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== values.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const uniqueRenderCount = new Set(roundtripRows.map(row => row.renderSha256)).size
if (uniqueRenderCount !== values.length) failures.push(`visual render hashes are not distinct: ${uniqueRenderCount}/${values.length}`)
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-shape-glow-opacity.v1', status: failures.length ? 'FAIL' : 'PASS', controlId: 'shapes.effects.glow.opacity', capabilityFamily: 'shapes-effects',
	contract: { type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.75, step: 1 / 100000, unit: 'normalized', serializer: 'generated XML a:glow/a:srgbClr/a:alpha/@val = round(opacity * 100000)', reset: 'set style.glow.opacity to null or remove the glow component; default is 0.75' },
	checkpoints: values.map(value => ({ checkpoint: `opacity-${value}`, value, expectedSerialized: Math.round(value * 100000) })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeGlowOpacity: failures.length === 0, distinctVisualRenders: uniqueRenderCount === values.length, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, xmlRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'The global shape glow opacity slider is proven across five exact normalized alpha checkpoints with retained native semantics and distinct static renders. This closes only one isolated shape row and does not close the universal 2,258-row registry.',
}
const reportPath = path.join(outDir, 'shape-glow-opacity-five-point-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
