// Native text-format proof: glyph outline color, transparency, and width on text and WordArt.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-outline/${stamp}`)
const generated = path.join(outDir, 'text-outline-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checkpoints = [
	{ id: 'text-min', carrier: 'text', transparency: 0, widthPt: 0.75, color: '38BDF8' },
	{ id: 'text-mid', carrier: 'text', transparency: 37.125, widthPt: 1.5, color: '38BDF8' },
	{ id: 'text-max', carrier: 'text', transparency: 100, widthPt: 6, color: '38BDF8' },
	{ id: 'text-reset', carrier: 'text', transparency: null, widthPt: null, color: null },
	{ id: 'text-reedit', carrier: 'text', transparency: 62.5, widthPt: 2.25, color: 'FACC15' },
	{ id: 'wordart-low', carrier: 'wordArt', transparency: 12.5, widthPt: 1, color: 'A78BFA', transform: 'textArchUp', adjustments: [50000] },
	{ id: 'wordart-mid', carrier: 'wordArt', transparency: 62.5, widthPt: 3.25, color: 'FACC15', transform: 'textChevron', adjustments: [75000] },
	{ id: 'wordart-max', carrier: 'wordArt', transparency: 100, widthPt: 5.5, color: '22D3EE', transform: 'textCircle', adjustments: [25000] },
	{ id: 'wordart-reset', carrier: 'wordArt', transparency: null, widthPt: null, color: null, transform: 'textChevron', adjustments: [] },
	{ id: 'wordart-reedit', carrier: 'wordArt', transparency: 25.375, widthPt: 2.75, color: 'FB7185', transform: 'textChevron', adjustments: [80000] },
]
await fs.mkdir(outDir, { recursive: true })

function optionsFor(checkpoint) {
	const style = {
		fontFace: 'Aptos Display', fontSize: 34, bold: true, align: 'center', valign: 'mid', margin: 0,
		textOutline: checkpoint.transparency === null ? null : { color: checkpoint.color, transparency: checkpoint.transparency, widthPt: checkpoint.widthPt },
		...(checkpoint.carrier === 'wordArt' ? { wordArt: { transform: checkpoint.transform, adjustments: checkpoint.adjustments } } : {}),
	}
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native text outline proof', styleIntent: { artDirection: 'blueprint' },
		slides: [{ id: checkpoint.id, title: checkpoint.id, layoutIntent: 'title-only', content: [{ kind: 'textBox', name: checkpoint.id, text: checkpoint.carrier === 'wordArt' ? 'WordArt outline' : 'Text outline', style }] }],
	}
	const compiled = buildSpecOperationPlan(spec, {})
	const op = compiled.operations.find(item => item.tool === 'betterpptx.slide.add_text')
	if (!op) throw new Error(`No add_text operation for ${checkpoint.id}`)
	return op.args
}

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global text outline proof'
pptx.subject = 'Text character outline'
pptx.title = 'Text outline'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const args = optionsFor(checkpoint)
	const slide = pptx.addSlide()
	slide.background = { color: '07111F' }
	slide.addText(args.text, { ...args.options, x: 1.0, y: 1.8, w: 11.3, h: 2.4, objectName: checkpoint.id })
	slide.addNotes(`Native text outline checkpoint: ${checkpoint.id}; carrier=${checkpoint.carrier}; transparency=${checkpoint.transparency}; widthPt=${checkpoint.widthPt}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function readOutline(xml) {
	const rPr = String(xml).match(/<a:rPr\b[^>]*>([\s\S]*?)<\/a:rPr>/)
	if (!rPr) return { color: null, alpha: null, width: null, hasOutline: false }
	const line = rPr[1].match(/<a:ln\b([^>]*)>([\s\S]*?)<\/a:ln>/)
	if (!line) return { color: null, alpha: null, width: null, hasOutline: false }
	const solid = line[2].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
	const color = solid?.[1]?.match(/<(?:a:srgbClr|a:schemeClr)\b([^>]*)>/)
	const alpha = solid?.[1]?.match(/<a:alpha\b[^>]*val="([^"]+)"/)
	return {
		color: color ? (color[1].match(/val="([^"]+)"/)?.[1] || null) : null,
		alpha: alpha ? Number(alpha[1]) : null,
		width: line[1].match(/\bw="([^"]+)"/) ? Number(line[1].match(/\bw="([^"]+)"/)[1]) : null,
		hasOutline: true,
	}
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
		rows.push({ slide: index, ...checkpoints[index - 1], outline: readOutline(xml), wordArt: readWordArt(xml) })
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
const expected = row => row.transparency === null
	? { hasOutline: false, color: null, alpha: null, width: null }
	: { hasOutline: true, color: row.color, alpha: row.transparency === 0 ? null : Math.round((100 - row.transparency) * 1000), width: Math.round(row.widthPt * 12700) }
const close = (a, b) => a == null || b == null ? a === b : Math.abs(a - b) <= 1
const outlineMatches = (actual, expectedRow) => actual.hasOutline === expectedRow.hasOutline && (!expectedRow.hasOutline || (actual.color === expectedRow.color && close(actual.alpha, expectedRow.alpha) && close(actual.width, expectedRow.width)))
const wordArtMatches = (actual, expectedRow) => expectedRow.carrier !== 'wordArt' || (actual?.transform === expectedRow.transform && JSON.stringify((actual.adjustments || []).filter(v => v != null)) === JSON.stringify(expectedRow.adjustments || []))
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) {
	if (!outlineMatches(row.outline, expected(row))) failures.push(`${row.id} text outline mismatch: ${JSON.stringify(row.outline)} expected ${JSON.stringify(expected(row))}`)
	if (!wordArtMatches(row.wordArt, row)) failures.push(`${row.id} WordArt mismatch: ${JSON.stringify(row.wordArt)}`)
}
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 5) failures.push('text outline renders did not produce enough distinct visual states')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text-outline-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textOutline.color|textOutline.transparency|textOutline.widthPt', checkpoints,
	proof: { typedCompilerMapping: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeTextRunOutline: failures.length === 0, resetAndReedit: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) }, officeBoundaries: [],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'Text character outline color, transparency, and width are independently typed and compiled to native a:rPr/a:ln on ordinary text and WordArt. Null reset removes the authored glyph outline and sparse re-edit restores a new value. This closes only the isolated text-outline leaf; spacing, paragraph controls, and universal formal closure remain open.',
}
const reportPath = path.join(outDir, 'text-outline-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
