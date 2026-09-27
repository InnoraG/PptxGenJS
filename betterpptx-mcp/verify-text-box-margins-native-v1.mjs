#!/usr/bin/env node
// Native proof: text-box insets and vertical anchoring for ordinary text and WordArt.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-box-margins/${stamp}`)
const generated = path.join(outDir, 'text-box-margins-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checkpoints = [
	{ id: 'text-zero-top', carrier: 'text', margin: 0, valign: 'top' },
	{ id: 'text-scalar-middle', carrier: 'text', margin: 12.34, valign: 'middle' },
	{ id: 'text-tuple-bottom', carrier: 'text', margin: [1.23, 4.56, 7.89, 10.11], valign: 'bottom' },
	{ id: 'text-null-reset', carrier: 'text', margin: null, valign: null },
	{ id: 'text-reedit-high', carrier: 'text', margin: [100, 99.99, 98.88, 97.77], valign: 'middle' },
	{ id: 'wordart-tuple-top', carrier: 'wordArt', margin: [2.22, 3.33, 4.44, 5.55], valign: 'top' },
]
await fs.mkdir(outDir, { recursive: true })

function optionsFor(c) {
	return {
		x: 0.8, y: 0.8, w: 11.8, h: 5.4, objectName: c.id,
		fontFace: 'Aptos Display', fontSize: 30, color: 'F8FAFC', align: 'left',
		margin: c.margin, valign: c.valign,
		wordArt: c.carrier === 'wordArt' ? { transform: 'textArchUp', adjustments: [50000] } : undefined,
	}
}
function sourceSpec(c) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native text-box margins and vertical anchoring',
		styleIntent: { artDirection: 'blueprint' },
		slides: [{ id: c.id, content: [{ kind: 'textBox', name: c.id, text: `${c.carrier} ${c.id}`, style: {
			fontFace: 'Aptos Display', fontSize: 30, color: 'F8FAFC', margin: c.margin, valign: c.valign,
			...(c.carrier === 'wordArt' ? { wordArt: { transform: 'textArchUp', adjustments: [50000] } } : {}),
		} }] }],
	}
}
let invalidRejected = true
try {
	buildSpecOperationPlan({ ...sourceSpec(checkpoints[0]), slides: [{ ...sourceSpec(checkpoints[0]).slides[0], content: [{ ...sourceSpec(checkpoints[0]).slides[0].content[0], style: { margin: 12.345, valign: 'diagonal' } }] }] }, {})
	invalidRejected = false
} catch (error) { invalidRejected = /0\.01|margin|valign|vertical/i.test(String(error?.message || error)) }

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global text-box margin proof'; pptx.subject = 'Native bodyPr insets and anchor'; pptx.title = 'Text-box margins'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const c of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	slide.addText(`${c.carrier} ${c.id}`, optionsFor(c))
	slide.addNotes(`Native text-box margin/anchor checkpoint ${c.id}; margin=${JSON.stringify(c.margin)}; valign=${c.valign}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function attrs(tag) {
	const out = {}
	for (const match of String(tag || '').matchAll(/([A-Za-z][\w:.-]*)="([^"]*)"/g)) out[match[1]] = match[2]
	return out
}
function inspectXml(xml) {
	const body = String(xml).match(/<a:bodyPr\b([^>]*)\/?>(?:[\s\S]*?<\/a:bodyPr>)?/)?.[1] || ''
	const actual = attrs(body)
	const toPoints = key => actual[key] === undefined ? null : Number(actual[key]) / 12700
	return { margin: [toPoints('tIns'), toPoints('rIns'), toPoints('bIns'), toPoints('lIns')], valign: actual.anchor || null, raw: actual }
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
const expectedInsets = margin => margin === null ? [null, null, null, null] : Array.isArray(margin) ? margin : [margin, margin, margin, margin]
const expectedAnchor = valign => ({ top: 't', middle: 'ctr', bottom: 'b' }[valign] || null)
const close = (a, b) => a === null || b === null ? a === b : Math.abs(Number(a) - Number(b)) <= 0.001
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) {
	const expected = expectedInsets(row.margin); const actual = row.xml.margin
	if (!expected.every((value, index) => close(actual[index], value))) failures.push(`${row.id}: margin mismatch expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)
	if (row.xml.valign !== expectedAnchor(row.valign)) failures.push(`${row.id}: anchor mismatch expected ${expectedAnchor(row.valign)} got ${row.xml.valign}`)
}
if (!invalidRejected) failures.push('invalid margin step/vertical anchor boundary was not rejected')
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 4) failures.push('margin/anchor renders did not produce enough distinct visual states')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text-box-margins-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textBox.margin|valign',
	controls: ['margin', 'valign'], checkpoints,
	proof: { typedParameterSerialization: true, exactRangeStep: 'margin 0..100 points at 0.01; valign top|middle|bottom', packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeBodyPr: failures.length === 0, resetAndReedit: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	officeBoundaries: ['Margins serialize in bodyPr as tIns,rIns,bIns,lIns in [top,right,bottom,left] order; null removes explicit insets and anchor overrides. PowerPoint roundtrip is the authority for retained editability.'],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, invalidBoundary: { invalidRejected }, failures,
	interpretation: 'Text-box margins and vertical anchoring are typed, independently editable native bodyPr controls for ordinary text and WordArt. Universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'text-box-margins-native-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
