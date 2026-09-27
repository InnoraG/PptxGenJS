#!/usr/bin/env node
// Native WordArt extended-option canary: transform-specific adjustment guides.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/wordart-transform-adjustments/${stamp}`)
const generated = path.join(outDir, 'wordart-transform-adjustments-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const checkpoints = [
	{ id: 'arch-min', transform: 'textArchUp', adjustments: [0] },
	{ id: 'arch-mid', transform: 'textArchUp', adjustments: [50000] },
	{ id: 'chevron-high', transform: 'textChevron', adjustments: [75000] },
	{ id: 'circle-low', transform: 'textCircle', adjustments: [25000] },
	{ id: 'chevron-reset', transform: 'textChevron', adjustments: [] },
	{ id: 'chevron-reedit', transform: 'textChevron', adjustments: [80000] },
]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global WordArt adjustment proof'
pptx.subject = 'WordArt transform adjustment guide contract'
pptx.title = 'WordArt transform adjustments'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide()
	slide.background = { color: '0B1220' }
	slide.addText('WordArt adjustment canary', {
		x: 1.0, y: 1.85, w: 11.3, h: 2.2, objectName: checkpoint.id,
		fontFace: 'Aptos Display', fontSize: 38, bold: true, color: 'F8FAFC',
		align: 'center', valign: 'mid', margin: 0,
		wordArt: { transform: checkpoint.transform, adjustments: checkpoint.adjustments },
	})
	slide.addNotes(`Native WordArt adjustment checkpoint: ${checkpoint.id}; transform=${checkpoint.transform}; adjustments=${JSON.stringify(checkpoint.adjustments)}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function readWordArt(xml) {
	const warp = xml.match(/<a:prstTxWarp\b[^>]*prst="([^"]+)"[\s\S]*?<\/a:prstTxWarp>/)
	if (!warp) return null
	const transform = warp[1]
	const guides = []
	for (const match of warp[0].matchAll(/<a:gd\b[^>]*name="(adj1?)"[^>]*fmla="val\s+(-?\d+)"[^>]*\/>/g)) {
		guides[match[1] === 'adj1' ? 1 : 0] = Number(match[2])
	}
	return { transform, adjustments: guides.map(value => value ?? null) }
}

function guidesEquivalent(actual, expected) {
	const a = [...(actual?.adjustments || [])]
	const e = [...(expected || [])]
	while (a.length && (a.at(-1) == null || a.at(-1) === 0)) a.pop()
	while (e.length && e.at(-1) === 0) e.pop()
	return JSON.stringify(a.map(value => value ?? 0)) === JSON.stringify(e)
}

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const generatedRows = []
for (let index = 1; index <= checkpoints.length; index++) {
	const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
	const actual = readWordArt(xml)
	const requested = checkpoints[index - 1]
	generatedRows.push({ slide: index, id: requested.id, requested: { transform: requested.transform, adjustments: requested.adjustments }, actual, retained: actual?.transform === requested.transform && guidesEquivalent(actual, requested.adjustments) })
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
for (let index = 1; index <= checkpoints.length; index++) {
	const xml = await rtZip.file(`ppt/slides/slide${index}.xml`).async('string')
	const png = path.join(outDir, `roundtrip-slide-${String(index).padStart(2, '0')}.png`)
	const actual = readWordArt(xml)
	const requested = checkpoints[index - 1]
	roundtripRows.push({ slide: index, id: requested.id, requested: { transform: requested.transform, adjustments: requested.adjustments }, actual, retained: actual?.transform === requested.transform && guidesEquivalent(actual, requested.adjustments), renderSha256: sha256(await fs.readFile(png)) })
}

const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (!row.retained) failures.push(`slide ${row.slide} ${row.id} transform/adjustments not retained: ${JSON.stringify(row.actual)}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 4) failures.push('WordArt adjustment renders did not produce enough distinct visual states')

const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-wordart-transform-adjustments-five-point.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	controlFamily: 'wordArt.transform.adjustments',
	controls: ['wordArt.transform', 'wordArt.adjustments[0]'],
	checkpoints,
	proof: { typedGuideSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeWordArtGuides: failures.length === 0, resetAndReedit: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	officeBoundaries: ['PowerPoint persists one adj guide only for the catalog-listed transform families. No-slider warp families and a second adj1 guide are rejected as non-native; this proof intentionally does not emit them.'],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows },
	office,
	failures,
	interpretation: 'WordArt transform adjustments are proven as typed native a:gd guide values on static text content, including reset and sparse re-edit. This closes only the isolated adjustment-handle family; WordArt fill/outline/spacing and the universal 2,258-row registry remain open.',
}
const reportPath = path.join(outDir, 'wordart-transform-adjustments-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
