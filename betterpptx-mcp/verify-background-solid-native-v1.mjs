#!/usr/bin/env node
// Native five-point proof for the typed slide-background solid carrier.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/background-solid-native/${stamp}`)
const generated = path.join(outDir, 'background-solid-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const cases = [
	{ name: 'opaque-minimum', color: '0F172A', transparency: 0 },
	{ name: 'fractional-alpha', color: '1D4ED8', transparency: 12.345 },
	{ name: 'midpoint-alpha', color: '14B8A6', transparency: 50 },
	{ name: 'near-transparent-boundary', color: 'F59E0B', transparency: 99.999 },
	{ name: 'component-reset', color: null, transparency: null },
]
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX generic background proof'
pptx.subject = 'Native slide-background solid colour and transparency'
pptx.title = 'Background solid carrier native canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const item of cases) {
	const slide = pptx.addSlide()
	if (item.color) slide.background = { type: 'solid', color: item.color, transparency: item.transparency }
	slide.addText('Native slide-background canary', { x: 1, y: 0.7, w: 11.3, h: 0.55, fontFace: 'Aptos Display', fontSize: 24, color: item.color ? 'FFFFFF' : '0F172A', bold: true, margin: 0, align: 'center' })
	slide.addText(`${item.name} · ${item.transparency == null ? 'inherited reset' : `${item.transparency}% transparency`}`, { x: 1, y: 1.35, w: 11.3, h: 0.35, fontFace: 'Aptos', fontSize: 13, color: item.color ? 'E2E8F0' : '475569', margin: 0, align: 'center' })
	slide.addShape(pptx.ShapeType.roundRect, { x: 3, y: 2.1, w: 6.4, h: 2.6, fill: { color: item.color || 'E2E8F0', transparency: item.transparency == null ? 0 : Math.min(100, item.transparency) }, line: { color: item.color || '94A3B8', width: 1.25 }, objectName: 'background-solid-canary' })
	slide.addNotes(`Native background checkpoint: ${item.name}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const readBackground = xml => {
	const match = xml.match(/<p:bg><p:bgPr>([\s\S]*?)<a:effectLst\/>?<\/p:bgPr><\/p:bg>/)
	if (!match) return null
	const body = match[1]
	const color = body.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase() || null
	const alpha = Number(body.match(/<a:alpha\s+val="(\d+)"/)?.[1] ?? NaN)
	return { color, alpha: Number.isFinite(alpha) ? alpha : null, xml: body }
}
const expectedBackground = item => item.color ? { color: item.color, alpha: item.transparency > 0 ? Math.round((100 - item.transparency) * 1000) : null } : null
const inspectZip = async file => {
	const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
	const rows = []
	for (let index = 1; index <= cases.length; index++) {
		const xml = await zip.file(`ppt/slides/slide${index}.xml`)?.async('string') || ''
		const actual = readBackground(xml)
		const expected = expectedBackground(cases[index - 1])
		const pass = expected == null ? actual == null : actual?.color === expected.color && actual.alpha === expected.alpha
		rows.push({ slide: index, checkpoint: cases[index - 1].name, expected, actual: actual ? { color: actual.color, alpha: actual.alpha } : null, pass })
	}
	return rows
}

const generatedRows = await inspectZip(generated)
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtripPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripRows = await inspectZip(roundtrip)
for (const row of roundtripRows) {
	const png = path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)
	row.renderSha256 = sha256(await fs.readFile(png))
}
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (!row.pass) failures.push(`slide ${row.slide} ${row.checkpoint} failed`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== cases.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-background-solid-native.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	controlIds: ['slides[].background.type', 'slides[].background.color', 'slides[].background.transparency'],
	capabilityFamily: 'layouts-themes-masters.background',
	checkpoints: cases,
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeBackgroundAlpha: failures.length === 0, componentReset: generatedRows[4]?.pass === true && roundtripRows[4]?.pass === true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows },
	office,
	failures,
	interpretation: 'This proves the bounded native slide-background solid carrier: type, arbitrary solid colour, 0.001%-precision transparency, component reset, PowerPoint reopen, retained XML, and full-size renders. It does not close the broader background texture/picture or universal 2,258-row catalog.',
}
const reportPath = path.join(outDir, 'background-solid-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
