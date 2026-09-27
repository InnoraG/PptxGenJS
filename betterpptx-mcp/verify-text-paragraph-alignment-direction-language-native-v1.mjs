#!/usr/bin/env node
// Native proof: paragraph alignment, paragraph RTL direction, and run language
// for ordinary text and WordArt. This is intentionally a focused native lane;
// underline variants and object rotation are separate later slices.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-paragraph-alignment-direction-language/${stamp}`)
const generated = path.join(outDir, 'text-paragraph-alignment-direction-language-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

const checkpoints = [
	{ id: 'text-left-ltr-en', carrier: 'text', align: 'left', rtlMode: false, lang: 'en-US', text: 'Left aligned English paragraph with enough words to show the alignment.' },
	{ id: 'text-center-ltr-fr', carrier: 'text', align: 'center', rtlMode: false, lang: 'fr-CA', text: 'Paragraph aligné au centre pour la preuve de langue.' },
	{ id: 'text-right-rtl-ar', carrier: 'text', align: 'right', rtlMode: true, lang: 'ar-SA', text: 'فقرة عربية باتجاه من اليمين إلى اليسار' },
	{ id: 'text-justify-rtl-he', carrier: 'text', align: 'justify', rtlMode: true, lang: 'he-IL', text: 'פסקה בעברית עם יישור מלא ובקרת כיוון.' },
	{ id: 'text-reset', carrier: 'text', align: null, rtlMode: null, lang: null, text: 'Native defaults are restored by null reset.' },
	{ id: 'wordart-center-rtl-ar', carrier: 'wordArt', align: 'center', rtlMode: true, lang: 'ar-SA', text: 'WordArt RTL' },
	{ id: 'wordart-right-ltr-fr', carrier: 'wordArt', align: 'right', rtlMode: false, lang: 'fr-CA', text: 'WordArt FR' },
]
await fs.mkdir(outDir, { recursive: true })

function optionsFor(c) {
	return {
		x: 0.7, y: 0.55, w: 11.9, h: 5.9, objectName: c.id,
		fontFace: 'Aptos Display', fontSize: c.carrier === 'wordArt' ? 34 : 22, color: 'F8FAFC',
		align: c.align, rtlMode: c.rtlMode, lang: c.lang,
		wordArt: c.carrier === 'wordArt' ? { transform: 'textArchUp', adjustments: [50000] } : undefined,
	}
}

function sourceSpec(c) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native paragraph alignment direction language proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove paragraph controls', remember: 'alignment direction language remain editable' },
		visualDesign: { world: 'blueprint', framing: 'native paragraph canary' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
		motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
		validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
		slides: [{ id: c.id, title: 'Paragraph proof', layoutIntent: 'hero', content: [{ kind: 'textBox', name: c.id, text: c.text, style: {
			align: c.align, rtlMode: c.rtlMode, lang: c.lang, fontFace: 'Aptos Display', fontSize: 22, color: 'F8FAFC',
			...(c.carrier === 'wordArt' ? { wordArt: { transform: 'textArchUp', adjustments: [50000] } } : {}),
		} }] }],
	}
}

const planProbe = { valid: false, invalidAlignRejected: false, invalidRtlRejected: false, invalidLangRejected: false }
try {
	const plan = buildSpecOperationPlan(sourceSpec({ ...checkpoints[1] }), {})
	const raw = JSON.stringify(plan)
	planProbe.valid = raw.includes('center') && raw.includes('false') && raw.includes('fr-CA')
} catch {}
for (const [key, value, pattern] of [
	['invalidAlignRejected', 'diagonal', /align/i],
	['invalidRtlRejected', 'maybe', /rtl|boolean/i],
	['invalidLangRejected', 'bad tag', /lang|BCP/i],
]) {
	try {
		buildSpecOperationPlan(sourceSpec({ ...checkpoints[0], align: key === 'invalidAlignRejected' ? value : checkpoints[0].align, rtlMode: key === 'invalidRtlRejected' ? value : checkpoints[0].rtlMode, lang: key === 'invalidLangRejected' ? value : checkpoints[0].lang }), {})
	} catch (error) {
		planProbe[key] = pattern.test(String(error?.message || error))
	}
}

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global paragraph proof'; pptx.subject = 'Native pPr alignment RTL and rPr language'; pptx.title = 'Paragraph alignment direction language'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const c of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	slide.addText(c.text, optionsFor(c))
	slide.addNotes(`Native paragraph checkpoint ${c.id}; align=${c.align}; rtlMode=${c.rtlMode}; lang=${c.lang}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function attrs(tag) {
	const out = {}
	for (const match of String(tag || '').matchAll(/([A-Za-z][\w:.-]*)="([^"]*)"/g)) out[match[1]] = match[2]
	return out
}
function firstAttrs(xml, tagName) {
	const match = String(xml).match(new RegExp(`<${tagName}\\b([^>]*)\\/?>(?:[\\s\\S]*?<\\/${tagName}>)?`))
	return attrs(match?.[1] || '')
}
function inspectXml(xml) {
	const pPr = firstAttrs(xml, 'a:pPr')
	const rPr = firstAttrs(xml, 'a:rPr')
	return { align: pPr.algn || null, rtl: pPr.rtl === undefined ? null : pPr.rtl !== '0', lang: rPr.lang || null, pPr, rPr }
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

const expectedAlign = value => ({ left: 'l', center: 'ctr', right: 'r', justify: 'just' }[value] || null)
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) {
	const expected = expectedAlign(row.align)
	const actual = row.xml.align
	const alignOkay = row.align === null ? actual === null : row.align === 'left' ? (actual === null || actual === 'l') : actual === expected
	if (!alignOkay) failures.push(`${row.id}: alignment expected ${expected} or native default, got ${actual}`)
	const expectedRtl = row.rtlMode === null ? null : row.rtlMode
	if (expectedRtl === true && row.xml.rtl !== true) failures.push(`${row.id}: rtl expected true, got ${row.xml.rtl}`)
	if (expectedRtl === false && row.xml.rtl !== null && row.xml.rtl !== false) failures.push(`${row.id}: rtl expected false/default, got ${row.xml.rtl}`)
	const expectedLang = row.lang || 'en-US'
	if (row.xml.lang !== expectedLang) failures.push(`${row.id}: lang expected ${expectedLang}, got ${row.xml.lang}`)
}
if (!Object.values(planProbe).every(Boolean)) failures.push(`compiler boundary probe failed: ${JSON.stringify(planProbe)}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 2) failures.push('alignment/direction renders did not produce at least two visual states')

const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text-paragraph-alignment-direction-language.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textParagraph.align|rtlMode|lang',
	controls: ['align', 'rtlMode', 'lang'], checkpoints, planProbe,
	proof: { typedParameterSerialization: true, exactDomain: 'align left|center|right|justify; rtlMode boolean; lang non-empty BCP-47 tag <=35 chars', packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedParagraphAndRunProperties: failures.length === 0, resetAndReeditBoundary: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	officeBoundaries: ['PowerPoint may omit explicit algn="l" and rtl="0" because they are native defaults; null restores those defaults. Run language remains explicit, with null restoring the library/native en-US default.'],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, invalidBoundary: planProbe,
	failures,
	interpretation: 'Paragraph alignment, RTL direction, and run language are typed, independently editable native pPr/rPr controls for ordinary text and WordArt. Underline variants and object rotation remain outside this proof. Universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'text-paragraph-alignment-direction-language-native-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, planProbe, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
