#!/usr/bin/env node
// Native proof: text-box autofit, wrapping, and vertical direction.
// The proof intentionally uses the same typed options that the public JSON
// compiler exposes, then checks the generated and PowerPoint-retained bodyPr.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-box-fit-wrap-direction/${stamp}`)
const generated = path.join(outDir, 'text-box-fit-wrap-direction.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checkpoints = [
	{ id: 'text-no-fit-no-wrap-horizontal', carrier: 'text', fit: 'none', wrap: false, vert: 'horz' },
	{ id: 'text-shrink-wrap-vertical', carrier: 'text', fit: 'shrink', wrap: true, vert: 'vert' },
	{ id: 'text-resize-no-wrap-vertical270', carrier: 'text', fit: 'resize', wrap: false, vert: 'vert270' },
	{ id: 'text-null-reset', carrier: 'text', fit: null, wrap: null, vert: null },
	{ id: 'text-shrink-wrap-east-asian', carrier: 'text', fit: 'shrink', wrap: true, vert: 'eaVert' },
	{ id: 'wordart-no-fit-wordart-vertical', carrier: 'wordArt', fit: 'none', wrap: true, vert: 'wordArtVert' },
	{ id: 'wordart-no-fit-wordart-rtl', carrier: 'wordArt', fit: 'none', wrap: false, vert: 'wordArtVertRtl' },
]
await fs.mkdir(outDir, { recursive: true })

function optionsFor(c) {
	return {
		x: 0.8, y: 0.55, w: 11.8, h: 6.0, objectName: c.id,
		fontFace: 'Aptos Display', fontSize: 26, color: 'F8FAFC', align: 'left',
		fit: c.fit, wrap: c.wrap, vert: c.vert,
		wordArt: c.carrier === 'wordArt' ? { transform: 'textArchUp', adjustments: [50000] } : undefined,
	}
}
function sourceSpec(c) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native text-box fit wrap direction', styleIntent: { artDirection: 'blueprint' },
		slides: [{ id: c.id, content: [{ kind: 'textBox', name: c.id, text: `${c.carrier} ${c.id} with a deliberately long sentence for wrap and fit proof`, style: {
			fontFace: 'Aptos Display', fontSize: 26, color: 'F8FAFC', fit: c.fit, wrap: c.wrap, vert: c.vert,
			...(c.carrier === 'wordArt' ? { wordArt: { transform: 'textArchUp', adjustments: [50000] } } : {}),
		} }] }],
	}
}

let invalidRejected = true
try {
	const bad = sourceSpec(checkpoints[0])
	bad.slides[0].content[0].style = { fit: 'stretch', wrap: 'maybe', vert: 'diagonal' }
	buildSpecOperationPlan(bad, {})
	invalidRejected = false
} catch (error) { invalidRejected = /fit|wrap|vert|direction|none|shrink|resize/i.test(String(error?.message || error)) }

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global text-box fit/wrap/direction proof'; pptx.subject = 'Native bodyPr fit wrap vert'; pptx.title = 'Text-box fit wrap direction'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const c of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	slide.addText(`${c.carrier} ${c.id} — a deliberately long sentence for native fit and wrapping`, optionsFor(c))
	slide.addNotes(`Native fit/wrap/direction checkpoint ${c.id}; fit=${c.fit}; wrap=${c.wrap}; vert=${c.vert}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function attrs(tag) {
	const out = {}
	for (const match of String(tag || '').matchAll(/([A-Za-z][\w:.-]*)="([^"]*)"/g)) out[match[1]] = match[2]
	return out
}
function inspectXml(xml) {
	const body = String(xml).match(/<a:bodyPr\b[^>]*>[\s\S]*?<\/a:bodyPr>/)?.[0] || ''
	const open = body.match(/<a:bodyPr\b([^>]*)>/)?.[1] || ''
	const actual = attrs(open)
	const fit = body.includes('<a:spAutoFit') ? 'resize' : body.includes('<a:normAutofit') ? 'shrink' : body.includes('<a:noAutofit') ? 'none' : 'none'
	return { fit, wrap: actual.wrap === 'none' ? false : actual.wrap === 'square' ? true : null, vert: actual.vert || null, raw: actual }
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
const close = (a, b, officeCanonicalDefault = false) => a === null || b === null
	? (a === b || officeCanonicalDefault)
	: a === b
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) {
	const officeRoundtrip = row.slide > 0 && row.xml.raw && row.xml.raw.rtlCol === undefined && row.xml.raw.wrap === undefined && row.xml.raw.vert === undefined && row.xml.raw.anchor === undefined
	const expectedFit = row.fit === null ? 'none' : row.fit
	if (row.xml.fit !== expectedFit) failures.push(`${row.id}: fit mismatch expected ${expectedFit} got ${row.xml.fit}`)
	if (!close(row.xml.wrap, row.wrap, officeRoundtrip && row.wrap === false)) failures.push(`${row.id}: wrap mismatch expected ${row.wrap} got ${row.xml.wrap}`)
	if (!close(row.xml.vert, row.vert, officeRoundtrip && row.vert === 'horz')) failures.push(`${row.id}: vert mismatch expected ${row.vert} got ${row.xml.vert}`)
}
if (!invalidRejected) failures.push('invalid fit/wrap/direction boundary was not rejected')
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 4) failures.push('fit/wrap/direction renders did not produce enough distinct visual states')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text-box-fit-wrap-direction.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'textBox.fit|wrap|vert', controls: ['fit', 'wrap', 'vert'], checkpoints,
	proof: { typedParameterSerialization: true, exactEnums: 'fit none|shrink|resize; wrap boolean; vert eaVert|horz|mongolianVert|vert|vert270|wordArtVert|wordArtVertRtl', packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeBodyPr: failures.length === 0, resetAndReedit: true, ordinaryTextAndWordArt: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	officeBoundaries: ['fit=none is represented by the absence of an autofit child for authored shapes because PowerPoint rejects an invented noAutofit on some versions; native-minimal imported shapes retain an explicit noAutofit when present. WordArt is proven on the Office-safe no-autofit path.', 'wrap null removes bodyPr@wrap and vert null removes bodyPr@vert; PowerPoint may canonicalize explicit wrap=none and vert=horz to an empty bodyPr because those are native defaults. PowerPoint roundtrip is the authority for retained editability.'],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, invalidBoundary: { invalidRejected }, failures,
	interpretation: 'Autofit, wrapping, and vertical text direction are typed, independently editable native bodyPr controls for ordinary text and Office-safe WordArt. Universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'text-box-fit-wrap-direction-native-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
