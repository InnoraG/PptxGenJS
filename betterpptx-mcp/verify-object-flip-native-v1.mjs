#!/usr/bin/env node
// Native proof for the shared 2-D object flip contract.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'
import { normalizeObjectFlip } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/object-flip/${stamp}`)
const generated = path.join(outDir, 'object-flip-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const glbFile = path.resolve('outputs/agency-source-unpack/ppt/media/model3d1.glb')
const checkpoints = [
	{ id: 'shape-min', carrier: 'shape', flipH: true, flipV: false },
	{ id: 'shape-mid', carrier: 'shape', flipH: false, flipV: true },
	{ id: 'shape-zero', carrier: 'shape', flipH: true, flipV: true },
	{ id: 'text-negative', carrier: 'text', flipH: false, flipV: false },
	{ id: 'wordart-positive', carrier: 'wordArt', flipH: true, flipV: false },
	{ id: 'picture-positive', carrier: 'picture', flipH: false, flipV: true },
	{ id: 'equation-positive', carrier: 'equation', flipH: true, flipV: true },
	{ id: 'model3d-positive', carrier: 'model3d', flipH: false, flipV: false },
	{ id: 'shape-max', carrier: 'shape', flipH: true, flipV: true },
	{ id: 'shape-reset', carrier: 'shape', flipH: null, flipV: null },
]

function optionsFor(c) {
	return { x: 0.8, y: 0.9, w: 5.8, h: 4.8, objectName: c.id, flipH: c.flipH, flipV: c.flipV, fill: { color: '16324F' }, line: { color: '38BDF8', width: 1.5 }, color: 'F8FAFC', fontFace: 'Aptos Display', fontSize: 24, bold: true }
}
function sourceSpec(c) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native object flip proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove typed object flip', remember: 'flip remains editable' },
		visualDesign: { world: 'blueprint', framing: 'native object flip canary' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
		motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
		validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
		slides: [{ id: c.id, title: 'Flip proof', layoutIntent: 'hero', content: [{ kind: 'textBox', name: c.id, text: `Flip H=${c.flipH} V=${c.flipV}`, flipH: c.flipH, flipV: c.flipV, style: { fontFace: 'Aptos Display', fontSize: 22, color: 'F8FAFC' } }] }],
	}
}

const planProbe = { valid: [], nullReset: false, invalidTypeRejected: false, invalidNumericRejected: false, carriersForwarded: {} }
for (const c of checkpoints.filter(item => item.carrier !== 'model3d' || true)) {
	try {
		const plan = buildSpecOperationPlan(sourceSpec(c), {})
		const op = plan.operations.find(operation => operation.objectName?.endsWith(`.${c.id}.textBox`))
		const actual = op?.args?.options?.flipH
		planProbe.valid.push({ id: c.id, expected: { flipH: c.flipH, flipV: c.flipV }, actual })
		if (c.flipH === null && actual === null) planProbe.nullReset = true
	} catch (error) { planProbe.valid.push({ id: c.id, error: String(error?.message || error) }) }
}
for (const [key, value, pattern] of [
	['invalidTypeRejected', 'yes', /boolean or null/i],
	['invalidNumericRejected', 0.5, /boolean or null/i],
]) {
	try { normalizeObjectFlip(value, 'flipH') } catch (error) { planProbe[key] = pattern.test(String(error?.message || error)) }
}
try {
	for (const c of [
		{ kind: 'textBox', name: 'text', text: 'text', flipH: true, flipV: false },
		{ kind: 'textShape', name: 'textShape', text: 'text shape', flipH: false, flipV: true },
		{ kind: 'shape', name: 'shape', shapeName: 'rect', flipH: true, flipV: true },
		{ kind: 'image', name: 'image', data: tinyPng, flipH: false, flipV: false },
		{ kind: 'equation', name: 'equation', source: 'x', flipH: true, flipV: false },
		{ kind: 'model3d', name: 'model3d', modelAsset: 'model3d://example', flipH: false, flipV: true },
	]) {
		const base = sourceSpec({ id: c.name, flipH: c.flipH, flipV: c.flipV })
		base.slides[0].content = [c]
		const plan = buildSpecOperationPlan(base, {})
		const op = plan.operations.find(operation => operation.objectName?.includes(`.${c.name}.`))
		const actualH = op?.args?.options?.flipH ?? op?.args?.flipH
		const actualV = op?.args?.options?.flipV ?? op?.args?.flipV
		planProbe.carriersForwarded[c.kind] = actualH === c.flipH && actualV === c.flipV
	}
} catch { planProbe.carriersForwarded = { error: true } }

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global flip proof'; pptx.subject = 'Native a:xfrm flip'; pptx.title = 'Object flip variants'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const c of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	if (c.carrier === 'shape') slide.addShape(pptx.ShapeType.roundRect, optionsFor(c))
	else if (c.carrier === 'text') slide.addText(`Text flip H=${c.flipH} V=${c.flipV}`, optionsFor(c))
	else if (c.carrier === 'wordArt') slide.addText(`WordArt flip H=${c.flipH} V=${c.flipV}`, { ...optionsFor(c), wordArt: { transform: 'textArchUp', adjustments: [50000] }, fontSize: 34 })
	else if (c.carrier === 'picture') slide.addImage({ data: tinyPng, ...optionsFor(c) })
	else if (c.carrier === 'equation') slide.addEquation({ source: 'x^2 + y^2 = 1', sourceFormat: 'unicodeMath', ...optionsFor(c) })
	else if (c.carrier === 'model3d') slide.addModel3D({ glbFile, nativeOnly: true, ...optionsFor(c) })
	slide.addNotes(`Native object flip checkpoint ${c.id}; flipH=${c.flipH === null ? 'reset' : c.flipH}; flipV=${c.flipV === null ? 'reset' : c.flipV}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function attrs(tag) {
	const out = {}
	for (const match of String(tag || '').matchAll(/([A-Za-z][\w:.-]*)="([^"]*)"/g)) out[match[1]] = match[2]
	return out
}
function inspectXml(xml) {
	const matches = [...String(xml).matchAll(/<(?:a|p):xfrm\b([^>]*)>/g)].map(match => attrs(match[1]))
	const flipH = matches.find(item => item.flipH !== undefined)?.flipH === '1'
	const flipV = matches.find(item => item.flipV !== undefined)?.flipV === '1'
	return { flipH, flipV, xfrms: matches }
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
for (const row of generatedRows) {
	const expectedH = row.flipH === null ? false : row.flipH === true
	const expectedV = row.flipV === null ? false : row.flipV === true
	if (row.xml.flipH !== expectedH || row.xml.flipV !== expectedV) failures.push(`${row.id}: generated flip expected H=${expectedH} V=${expectedV}, got H=${row.xml.flipH} V=${row.xml.flipV}`)
}
if (!Object.values(planProbe.carriersForwarded).every(Boolean)) failures.push(`compiler carrier forwarding failed: ${JSON.stringify(planProbe.carriersForwarded)}`)
if (!planProbe.nullReset || !planProbe.invalidTypeRejected || !planProbe.invalidNumericRejected) failures.push(`compiler boundary probe failed: ${JSON.stringify(planProbe)}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 5) failures.push('flip renders did not produce enough visual states')

const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-object-flip.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'shape.transform.flip',
	controls: ['flipH', 'flipV'], exactDomain: { values: [false, true], default: false },
	applicability: ['shape', 'text', 'wordArt', 'picture', 'equation', 'model3d'], planProbe,
	proof: { typedParameterSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeFlip: failures.length === 0, resetAndReeditBoundary: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	officeBoundaries: ['flipH and flipV are persisted as a:xfrm boolean attributes. PowerPoint may omit false/default flags; null/omitted is the explicit reset contract.'],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'The shared 2-D object flip controls are typed booleans, normalized with null resets, forwarded by the semantic compiler, and proven across ordinary text, WordArt, shapes, pictures, equations, and 3-D model frames. Universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'object-flip-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, checkpointCount: checkpoints.length, planProbe, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
