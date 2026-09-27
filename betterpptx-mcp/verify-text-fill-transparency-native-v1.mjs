// Native text-format proof: character fill transparency on ordinary text and WordArt.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-fill-transparency/${stamp}`)
const generated = path.join(outDir, 'text-fill-transparency-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checkpoints = [
	{ id: 'text-min', carrier: 'text', transparency: 0, color: '38BDF8' },
	{ id: 'text-mid', carrier: 'text', transparency: 37.125, color: '38BDF8' },
	{ id: 'text-max', carrier: 'text', transparency: 100, color: '38BDF8' },
	{ id: 'text-reset', carrier: 'text', transparency: null, color: null },
	{ id: 'text-reedit', carrier: 'text', transparency: 62.5, color: 'FACC15' },
	{ id: 'wordart-low', carrier: 'wordArt', transparency: 12.5, color: 'A78BFA', transform: 'textArchUp', adjustments: [50000] },
	{ id: 'wordart-mid', carrier: 'wordArt', transparency: 62.5, color: 'FACC15', transform: 'textChevron', adjustments: [75000] },
	{ id: 'wordart-max', carrier: 'wordArt', transparency: 100, color: '22D3EE', transform: 'textCircle', adjustments: [25000] },
	{ id: 'wordart-reset', carrier: 'wordArt', transparency: null, color: null, transform: 'textChevron', adjustments: [] },
	{ id: 'wordart-reedit', carrier: 'wordArt', transparency: 25.375, color: 'FB7185', transform: 'textChevron', adjustments: [80000] },
]
await fs.mkdir(outDir, { recursive: true })

function optionsFor(checkpoint) {
	const style = {
		fontFace: 'Aptos Display', fontSize: 34, bold: true, align: 'center', valign: 'mid', margin: 0,
		textFill: checkpoint.transparency === null ? null : { color: checkpoint.color, transparency: checkpoint.transparency },
		...(checkpoint.carrier === 'wordArt' ? { wordArt: { transform: checkpoint.transform, adjustments: checkpoint.adjustments } } : {}),
	}
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native text fill transparency proof', styleIntent: { artDirection: 'blueprint' },
		slides: [{ id: checkpoint.id, title: checkpoint.id, layoutIntent: 'title-only', content: [{ kind: 'textBox', name: checkpoint.id, text: checkpoint.carrier === 'wordArt' ? 'WordArt fill' : 'Text fill', style }] }],
	}
	const compiled = buildSpecOperationPlan(spec, {})
	const op = compiled.operations.find(item => item.tool === 'betterpptx.slide.add_text')
	if (!op) throw new Error(`No add_text operation for ${checkpoint.id}`)
	return op.args
}

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global text fill proof'
pptx.subject = 'Text character fill transparency'
pptx.title = 'Text fill transparency'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
const compiledOptions = []
for (const checkpoint of checkpoints) {
	const args = optionsFor(checkpoint)
	compiledOptions.push({ checkpoint, args })
	const slide = pptx.addSlide()
	slide.background = { color: '07111F' }
	slide.addText(args.text, { ...args.options, x: 1.0, y: 1.8, w: 11.3, h: 2.4, objectName: checkpoint.id })
	slide.addNotes(`Native text fill transparency checkpoint: ${checkpoint.id}; carrier=${checkpoint.carrier}; transparency=${checkpoint.transparency}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function readRun(xml) {
	const rPr = String(xml).match(/<a:rPr\b[^>]*>([\s\S]*?)<\/a:rPr>/)
	if (!rPr) return { color: null, alpha: null, hasSolidFill: false }
	const solid = rPr[1].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
	const color = solid?.[1]?.match(/<(?:a:srgbClr|a:schemeClr)\b([^>]*)>/)
	const alpha = solid?.[1]?.match(/<a:alpha\b[^>]*val="([^"]+)"/)
	return { color: color ? (color[1].match(/val="([^"]+)"/)?.[1] || null) : null, alpha: alpha ? Number(alpha[1]) : null, hasSolidFill: Boolean(solid) }
}
function readWordArt(xml) {
	const warp = String(xml).match(/<a:prstTxWarp\b[^>]*prst="([^"]+)"[\s\S]*?<\/a:prstTxWarp>/)
	if (!warp) return null
	const adjustments = []
	for (const match of warp[0].matchAll(/<a:gd\b[^>]*name="(adj1?)"[^>]*fmla="val\s+(-?\d+)"[^>]*\/>/g)) adjustments[match[1] === 'adj1' ? 1 : 0] = Number(match[2])
	return { transform: warp[1], adjustments: adjustments.map(value => value ?? null) }
}
const readRows = async file => {
	const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
	const rows = []
	for (let index = 1; index <= checkpoints.length; index++) {
		const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
		rows.push({ slide: index, ...checkpoints[index - 1], run: readRun(xml), wordArt: readWordArt(xml) })
	}
	return rows
}
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''")
const rtPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const generatedRows = await readRows(generated)
const roundtripRows = await readRows(roundtrip)
for (const row of roundtripRows) row.renderSha256 = sha256(await fs.readFile(path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)))
const expectedRun = checkpoint => checkpoint.transparency === null
	? { color: '000000', alpha: null, hasSolidFill: true, defaulted: true }
	: { color: checkpoint.color, alpha: checkpoint.transparency === 0 ? null : Math.round((100 - checkpoint.transparency) * 1000), hasSolidFill: true }
const close = (a, b) => a == null || b == null ? a === b : Math.abs(a - b) <= 0.001
const runMatches = (actual, expected) => actual.hasSolidFill === expected.hasSolidFill && (expected.defaulted || expected.color == null || actual.color === expected.color) && close(actual.alpha, expected.alpha)
const wordArtMatches = (actual, expected) => expected.carrier !== 'wordArt' || (actual?.transform === expected.transform && JSON.stringify((actual.adjustments || []).filter(v => v != null)) === JSON.stringify(expected.adjustments || []))
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) {
	if (!runMatches(row.run, expectedRun(row))) failures.push(`${row.id} text fill mismatch: ${JSON.stringify(row.run)} expected ${JSON.stringify(expectedRun(row))}`)
	if (!wordArtMatches(row.wordArt, row)) failures.push(`${row.id} WordArt mismatch: ${JSON.stringify(row.wordArt)}`)
}
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 5) failures.push('text fill transparency renders did not produce enough distinct visual states')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text-fill-transparency-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textFill.transparency',
	controls: ['textFill.color', 'textFill.transparency'], checkpoints, proof: { typedCompilerMapping: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeTextRunAlpha: failures.length === 0, resetAndReedit: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) }, officeBoundaries: [],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'Text character fill transparency is independently typed and compiled to native a:rPr solidFill alpha on ordinary text and WordArt. Null reset removes the authored run fill and sparse re-edit restores a new value. This closes only the isolated text-fill transparency leaf; text outline, spacing, paragraph controls, and universal formal closure remain open.',
}
const reportPath = path.join(outDir, 'text-fill-transparency-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
