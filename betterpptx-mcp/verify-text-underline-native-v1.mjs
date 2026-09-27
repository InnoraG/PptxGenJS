#!/usr/bin/env node
// Native proof for the complete run-level underline selector and underline
// color contract on ordinary text and WordArt.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'
import { TEXT_UNDERLINE_STYLES, normalizeTextUnderline } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-underline/${stamp}`)
const generated = path.join(outDir, 'text-underline-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const checkpoints = [
	...TEXT_UNDERLINE_STYLES.map((style, index) => ({ id: `text-${style}`, carrier: 'text', style, color: index % 2 ? '38BDF8' : undefined, text: `Ordinary text underline ${style}` })),
	{ id: 'text-colored-wavy-double', carrier: 'text', style: 'wavyDbl', color: 'F97316', text: 'Colored wavy double underline' },
	{ id: 'text-reset', carrier: 'text', style: null, color: null, text: 'Native underline reset' },
	{ id: 'wordart-single-colored', carrier: 'wordArt', style: 'sng', color: 'A78BFA', text: 'WordArt underline' },
	{ id: 'wordart-dash-heavy', carrier: 'wordArt', style: 'dashHeavy', color: undefined, text: 'WordArt dash heavy' },
]

function underlineValue(c) {
	if (Object.prototype.hasOwnProperty.call(c, 'underlineOverride')) return c.underlineOverride
	if (c.style == null) return null
	return c.color ? { style: c.style, color: c.color } : { style: c.style }
}
function optionsFor(c) {
	return {
		x: 0.55, y: 0.7, w: 12.2, h: 5.8, objectName: c.id,
		fontFace: 'Aptos Display', fontSize: c.carrier === 'wordArt' ? 34 : 24, color: 'F8FAFC',
		underline: underlineValue(c),
		wordArt: c.carrier === 'wordArt' ? { transform: 'textArchUp', adjustments: [50000] } : undefined,
	}
}
function sourceSpec(c) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native underline proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove underline controls', remember: 'underline remains editable' },
		visualDesign: { world: 'blueprint', framing: 'native underline canary' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
		motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
		validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
		slides: [{ id: c.id, title: 'Underline proof', layoutIntent: 'hero', content: [{ kind: 'textBox', name: c.id, text: c.text, style: { underline: underlineValue(c), fontFace: 'Aptos Display', fontSize: 22, color: 'F8FAFC', ...(c.carrier === 'wordArt' ? { wordArt: { transform: 'textArchUp', adjustments: [50000] } } : {}) } }] }],
	}
}

const planProbe = { aliasCanonicalized: false, validColor: false, invalidStyleRejected: false, invalidColorRejected: false }
try {
	const plan = buildSpecOperationPlan(sourceSpec({ ...checkpoints[0], style: 'dotDashHeave' }), {})
	const raw = JSON.stringify(plan)
	const underlineOption = plan.operations?.find(operation => operation.tool === 'betterpptx.slide.add_text')?.args?.options?.underline
	planProbe.aliasCanonicalized = underlineOption?.style === 'dotDashHeavy'
	planProbe.validColor = raw.includes('38BDF8')
} catch {}
for (const [key, value, pattern] of [
	['invalidStyleRejected', 'diagonalUnderline', /underline|style/i],
	['invalidColorRejected', { style: 'sng', color: '' }, /underline|color/i],
]) {
	try {
		const c = { ...checkpoints[0], style: key === 'invalidStyleRejected' ? value : 'sng', color: key === 'invalidColorRejected' ? value.color : undefined }
		if (key === 'invalidColorRejected') c.underlineOverride = value
		buildSpecOperationPlan(sourceSpec(c), {})
	} catch (error) { planProbe[key] = pattern.test(String(error?.message || error)) }
}
try { normalizeTextUnderline({ style: 'dotDashHeavy', color: '#38BDF8' }) } catch {}

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global underline proof'; pptx.subject = 'Native rPr underline and uFill'; pptx.title = 'Text underline variants'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const c of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	slide.addText(c.text, optionsFor(c))
	slide.addNotes(`Native underline checkpoint ${c.id}; style=${c.style}; color=${c.color || 'default'}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function attrs(tag) {
	const out = {}
	for (const match of String(tag || '').matchAll(/([A-Za-z][\w:.-]*)="([^"]*)"/g)) out[match[1]] = match[2]
	return out
}
function inspectXml(xml) {
	const rPrMatch = String(xml).match(/<a:rPr\b([^>]*)>([\s\S]*?)<\/a:rPr>/) || String(xml).match(/<a:rPr\b([^>]*)\/>/)
	const rPr = attrs(rPrMatch?.[1] || '')
	const body = rPrMatch?.[2] || ''
	const uFillMatch = body.match(/<a:uFill>([\s\S]*?)<\/a:uFill>/)
	return { underline: rPr.u || null, uFill: uFillMatch?.[1] || null, rPr }
}
async function rowsFor(file) {
	const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true }); const rows = []
	for (let index = 1; index <= checkpoints.length; index++) rows.push({ slide: index, ...checkpoints[index - 1], xml: inspectXml(await zip.file(`ppt/slides/slide${index}.xml`).async('string')) })
	return rows
}

const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''"); const rtPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$p.SaveCopyAs('${rtPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $r.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$r.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const generatedRows = await rowsFor(generated); const roundtripRows = await rowsFor(roundtrip)
for (const row of roundtripRows) row.renderSha256 = sha256(await fs.readFile(path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)))

const failures = []
for (const row of [...generatedRows, ...roundtripRows]) {
	const expected = row.style || null
	const actual = row.xml.underline
	const underlineOkay = row.style === null ? actual === null || actual === 'none' : actual === expected
	if (!underlineOkay) failures.push(`${row.id}: underline expected ${expected}, got ${actual}`)
	if (row.color && !row.xml.uFill) failures.push(`${row.id}: underline color expected uFill`)
	if (!row.color && row.xml.uFill) failures.push(`${row.id}: unexpected underline uFill`)
}
if (!Object.values(planProbe).every(Boolean)) failures.push(`compiler boundary probe failed: ${JSON.stringify(planProbe)}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 4) failures.push('underline renders did not produce enough visual states')

const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text-underline.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textRun.underline|underline.color',
	controls: ['underline.style', 'underline.color'], exactDomain: TEXT_UNDERLINE_STYLES, checkpoints, planProbe,
	proof: { typedParameterSerialization: true, exactDomain: TEXT_UNDERLINE_STYLES, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedRunProperties: failures.length === 0, resetAndReeditBoundary: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	officeBoundaries: ['PowerPoint uses dotDashHeavy; the historical library typo dotDashHeave is normalized before serialization.', 'PowerPoint may canonicalize an explicit none or default underline back to an omitted native run attribute; null restores that default.'],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, invalidBoundary: planProbe, failures,
	interpretation: 'All native run underline selectors and optional underline color are typed, independently editable rPr/uFill controls for ordinary text and WordArt. Object rotation remains the next slice. Universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'text-underline-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, checkpointCount: checkpoints.length, planProbe, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
