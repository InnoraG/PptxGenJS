// Native proof: signed, independently editable character spacing on text and WordArt.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-character-spacing/${stamp}`)
const generated = path.join(outDir, 'text-character-spacing-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checkpoints = [
	{ id: 'text-tight', carrier: 'text', charSpacing: -8.25 },
	{ id: 'text-mid', carrier: 'text', charSpacing: -0.01 },
	{ id: 'text-normal', carrier: 'text', charSpacing: 0 },
	{ id: 'text-loose', carrier: 'text', charSpacing: 6.25 },
	{ id: 'text-reset', carrier: 'text', charSpacing: null },
	{ id: 'wordart-tight', carrier: 'wordArt', charSpacing: -4.5, transform: 'textArchUp', adjustments: [50000] },
	{ id: 'wordart-mid', carrier: 'wordArt', charSpacing: 1.75, transform: 'textChevron', adjustments: [75000] },
	{ id: 'wordart-loose', carrier: 'wordArt', charSpacing: 12.5, transform: 'textCircle', adjustments: [25000] },
	{ id: 'wordart-reset', carrier: 'wordArt', charSpacing: null, transform: 'textChevron', adjustments: [] },
	{ id: 'wordart-reedit', carrier: 'wordArt', charSpacing: 3.33, transform: 'textChevron', adjustments: [80000] },
]
await fs.mkdir(outDir, { recursive: true })

function optionsFor(checkpoint) {
	const style = { fontFace: 'Aptos Display', fontSize: 34, bold: true, align: 'center', valign: 'mid', margin: 0, ...(checkpoint.charSpacing === null ? {} : { charSpacing: checkpoint.charSpacing }), ...(checkpoint.carrier === 'wordArt' ? { wordArt: { transform: checkpoint.transform, adjustments: checkpoint.adjustments } } : {}) }
	const spec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native character spacing proof', styleIntent: { artDirection: 'blueprint' }, slides: [{ id: checkpoint.id, title: checkpoint.id, layoutIntent: 'title-only', content: [{ kind: 'textBox', name: checkpoint.id, text: checkpoint.carrier === 'wordArt' ? 'WordArt tracking' : 'Text tracking', style }] }] }
	const compiled = buildSpecOperationPlan(spec, {})
	const op = compiled.operations.find(item => item.tool === 'betterpptx.slide.add_text')
	if (!op) throw new Error(`No add_text operation for ${checkpoint.id}`)
	return op.args
}

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global text character spacing proof'; pptx.subject = 'Text character spacing'; pptx.title = 'Character spacing'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const args = optionsFor(checkpoint); const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	slide.addText(args.text, { ...args.options, x: 1.0, y: 1.8, w: 11.3, h: 2.4, objectName: checkpoint.id }); slide.addNotes(`Native character spacing checkpoint: ${checkpoint.id}; carrier=${checkpoint.carrier}; charSpacing=${checkpoint.charSpacing}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function readSpacing(xml) {
	const rPr = String(xml).match(/<a:rPr\b([^>]*)>/)
	if (!rPr) return null
	const attr = rPr[1].match(/\bspc="([^"]+)"/)
	return attr ? Number(attr[1]) : null
}
const readRows = async file => {
	const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true }); const rows = []
	for (let index = 1; index <= checkpoints.length; index++) { const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string'); rows.push({ slide: index, ...checkpoints[index - 1], spacingXml: readSpacing(xml) }) }
	return rows
}
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 }); const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''"); const rtPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 }); const office = JSON.parse(officeStdout.trim())
const generatedRows = await readRows(generated); const roundtripRows = await readRows(roundtrip); for (const row of roundtripRows) row.renderSha256 = sha256(await fs.readFile(path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)))
const expected = row => row.charSpacing === null || row.charSpacing === 0 ? null : Math.round(row.charSpacing * 100)
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (row.spacingXml !== expected(row)) failures.push(`${row.id} spacing mismatch: ${row.spacingXml} expected ${expected(row)}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 5) failures.push('character spacing renders did not produce enough distinct visual states')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = { schemaVersion: 'betterpptx.global-text-character-spacing-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textCharacterSpacing.charSpacing', checkpoints, proof: { typedCompilerMapping: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeRunSpacing: failures.length === 0, resetAndReedit: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) }, officeBoundaries: [], generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures, interpretation: 'Character spacing is independently typed in signed points and compiled to native a:rPr/@spc on ordinary text and WordArt. Null/omitted spacing removes the authored run override and sparse re-edit restores it. This closes only the isolated character-spacing leaf; line spacing, paragraph controls, and universal formal closure remain open.' }
const reportPath = path.join(outDir, 'text-character-spacing-native-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
