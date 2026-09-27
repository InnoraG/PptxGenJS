// Native proof: paragraph tab stops plus rich text run controls.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-tabs-rich-runs/${stamp}`)
const generated = path.join(outDir, 'text-tabs-rich-runs-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checkpoints = [
	{ id: 'tabs-rich-low', carrier: 'text', tabStops: [{ position: 1.25, alignment: 'l' }, { position: 4.5, alignment: 'r' }], runs: [{ text: 'deprecated', options: { strike: 'dblStrike' } }, { text: ' current', options: { highlight: 'FDE047', superscript: true } }] },
	{ id: 'tabs-rich-high', carrier: 'text', tabStops: [{ position: 0.5, alignment: 'ctr' }, { position: 6.75, alignment: 'dec' }, { position: 9.25, alignment: 'r' }], runs: [{ text: 'old', options: { strike: true, highlight: '93C5FD' } }, { text: ' H2O', options: { subscript: true } }] },
	{ id: 'tabs-rich-reset', carrier: 'text', tabStops: null, runs: [{ text: 'plain', options: { strike: false, highlight: null, superscript: false, subscript: false } }] },
	{ id: 'tabs-rich-reedit', carrier: 'text', tabStops: [{ position: 2.75, alignment: 'dec' }, { position: 7.5, alignment: 'l' }], runs: [{ text: 'revised', options: { strike: 'sngStrike', highlight: 'FCA5A5' } }, { text: ' x2', options: { superscript: true } }] },
	{ id: 'wordart-tabs-rich', carrier: 'wordArt', tabStops: [{ position: 1.5, alignment: 'l' }, { position: 5.25, alignment: 'ctr' }], runs: [{ text: 'WordArt', options: { highlight: 'A7F3D0', subscript: true } }] },
]
await fs.mkdir(outDir, { recursive: true })

function optionsFor(c) {
	return { x: 0.8, y: 0.8, w: 11.8, h: 5.4, objectName: c.id, fontFace: 'Aptos Display', fontSize: 30, color: 'F8FAFC', align: 'left', valign: 'mid', margin: 0.08, tabStops: c.tabStops, wordArt: c.carrier === 'wordArt' ? { transform: 'textArchUp', adjustments: [50000] } : undefined }
}
function textFor(c) { return c.runs.map((run, index) => ({ ...run, options: { ...run.options, breakLine: index === c.runs.length - 1 ? undefined : true } })) }
function sourceSpec(c) {
	return { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native text tabs and rich runs', styleIntent: { artDirection: 'blueprint' }, slides: [{ id: c.id, content: [{ kind: 'textBox', name: c.id, text: textFor(c), style: { fontFace: 'Aptos Display', fontSize: 30, color: 'F8FAFC', tabStops: c.tabStops, ...(c.carrier === 'wordArt' ? { wordArt: { transform: 'textArchUp', adjustments: [50000] } } : {}) } }] }] }
}
let invalidRejected = true
try { buildSpecOperationPlan({ ...sourceSpec(checkpoints[0]), slides: [{ ...sourceSpec(checkpoints[0]).slides[0], content: [{ ...sourceSpec(checkpoints[0]).slides[0].content[0], style: { tabStops: [{ position: 1.234, alignment: 'l' }], strike: 'bogus' } }] }] }, {}) ; invalidRejected = false } catch (error) { invalidRejected = /0\.01|tabStops|strike/i.test(String(error?.message || error)) }

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global text tabs/rich runs proof'; pptx.subject = 'Native tab stops and rich runs'; pptx.title = 'Text formatting'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const c of checkpoints) { const slide = pptx.addSlide(); slide.background = { color: '07111F' }; slide.addText(textFor(c), optionsFor(c)); slide.addNotes(`Native tabs/rich-runs checkpoint ${c.id}; tabStops=${JSON.stringify(c.tabStops)}.`) }
await pptx.writeFile({ fileName: generated, compression: false })

function attrs(tag) { const out = {}; for (const match of String(tag || '').matchAll(/([A-Za-z][\w:.-]*)="([^"]*)"/g)) out[match[1]] = match[2]; return out }
function inspectXml(xml) {
	const paragraphCount = (String(xml).match(/<a:p>/g) || []).length
	const tabs = [...String(xml).matchAll(/<a:tab\b([^>]*)\/>/g)].map(match => attrs(match[1]))
	const rprs = [...String(xml).matchAll(/<a:rPr\b([^>]*)(?:\/|>)/g)].map(match => attrs(match[1]))
	const highlights = [...String(xml).matchAll(/<a:highlight>([\s\S]*?)<\/a:highlight>/g)].map(match => (match[1].match(/val="([0-9A-Fa-f]{6})"/) || [])[1]).filter(Boolean)
	return { paragraphCount, tabs, tabPositions: tabs.map(item => Number(item.pos) / 914400), tabAlignments: tabs.map(item => item.algn || null), strikes: rprs.map(item => item.strike).filter(Boolean), baselines: rprs.map(item => item.baseline).filter(Boolean), highlights }
}
async function readRows(file) { const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true }); const rows = []; for (let i = 1; i <= checkpoints.length; i++) rows.push({ slide: i, ...checkpoints[i - 1], xml: inspectXml(await zip.file(`ppt/slides/slide${i}.xml`).async('string')) }); return rows }
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''"); const rtPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$p.SaveCopyAs('${rtPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $r.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$r.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const generatedRows = await readRows(generated); const roundtripRows = await readRows(roundtrip)
for (const row of roundtripRows) row.renderSha256 = sha256(await fs.readFile(path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)))
const close = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.00001
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) {
	const expectedTabs = row.tabStops || []
	const expectedTabRows = Array.from({ length: row.xml.paragraphCount || 1 }, () => expectedTabs).flat()
	if (row.xml.tabs.length !== expectedTabRows.length) failures.push(`${row.id}: expected ${expectedTabRows.length} tab stops, got ${row.xml.tabs.length}`)
	for (let i = 0; i < expectedTabRows.length; i++) { if (!close(row.xml.tabPositions[i], expectedTabRows[i].position)) failures.push(`${row.id}: tab ${i} position mismatch`); if (row.xml.tabAlignments[i] !== expectedTabRows[i].alignment) failures.push(`${row.id}: tab ${i} alignment mismatch`) }
	if (row.id === 'tabs-rich-low' && (!row.xml.strikes.includes('dblStrike') || !row.xml.baselines.includes('30000') || !row.xml.highlights.includes('FDE047'))) failures.push('tabs-rich-low rich-run serialization missing')
	if (row.id === 'tabs-rich-high' && (!row.xml.strikes.includes('sngStrike') || !row.xml.baselines.includes('-40000') || !row.xml.highlights.includes('93C5FD'))) failures.push('tabs-rich-high rich-run serialization missing')
	if (row.id === 'tabs-rich-reset' && (row.xml.strikes.some(value => value !== 'noStrike') || row.xml.baselines.length || row.xml.highlights.length)) failures.push('tabs-rich-reset retained a rich-run override')
	if (row.id === 'tabs-rich-reedit' && (!row.xml.strikes.includes('sngStrike') || !row.xml.baselines.includes('30000') || !row.xml.highlights.includes('FCA5A5'))) failures.push('tabs-rich-reedit serialization missing')
	if (row.id === 'wordart-tabs-rich' && (!row.xml.baselines.includes('-40000') || !row.xml.highlights.includes('A7F3D0'))) failures.push('wordart tabs/rich-run serialization missing')
}
if (!invalidRejected) failures.push('invalid tab/rich-run boundary was not rejected')
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 4) failures.push('tab/rich-run renders did not produce enough distinct visual states')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = { schemaVersion: 'betterpptx.global-text-tabs-rich-runs-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textTabsRichRuns.tabStops|strike|highlight|superscript|subscript', checkpoints, proof: { typedCompilerMapping: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeTabStopsAndRichRuns: failures.length === 0, resetAndReedit: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, invalidBoundary: { invalidRejected }, failures, interpretation: 'Paragraph tab stops and rich run strike, highlight, superscript, and subscript are typed, independently editable native controls for ordinary text and WordArt. Universal formal closure remains 0/2258.' }
const reportPath = path.join(outDir, 'text-tabs-rich-runs-native-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
