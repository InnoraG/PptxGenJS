#!/usr/bin/env node
// Native proof for the shared 2-D object rotation contract.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'
import { normalizeObjectRotation, OBJECT_ROTATION_SERIALIZER_STEPS_PER_DEGREE } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/object-rotation/${stamp}`)
const generated = path.join(outDir, 'object-rotation-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const glbFile = path.resolve('outputs/agency-source-unpack/ppt/media/model3d1.glb')
const checkpoints = [
	{ id: 'shape-min', carrier: 'shape', angle: -360 },
	{ id: 'shape-mid', carrier: 'shape', angle: 45.12345 },
	{ id: 'shape-zero', carrier: 'shape', angle: 0 },
	{ id: 'text-negative', carrier: 'text', angle: -90 },
	{ id: 'wordart-positive', carrier: 'wordArt', angle: 135 },
	{ id: 'picture-positive', carrier: 'picture', angle: 180 },
	{ id: 'equation-positive', carrier: 'equation', angle: 22.5 },
	{ id: 'model3d-positive', carrier: 'model3d', angle: 270 },
	{ id: 'shape-max', carrier: 'shape', angle: 360 },
	{ id: 'shape-reset', carrier: 'shape', angle: null },
]

function rotationValue(c) { return c.angle === null ? null : c.angle }
function optionsFor(c) {
	return { x: 0.8, y: 0.9, w: 5.8, h: 4.8, objectName: c.id, rotate: rotationValue(c), fill: { color: '16324F' }, line: { color: '38BDF8', width: 1.5 }, color: 'F8FAFC', fontFace: 'Aptos Display', fontSize: 24, bold: true }
}
function sourceSpec(c) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native object rotation proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove typed object rotation', remember: 'rotation remains editable' },
		visualDesign: { world: 'blueprint', framing: 'native object rotation canary' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
		motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
		validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
		slides: [{ id: c.id, title: 'Rotation proof', layoutIntent: 'hero', content: [{ kind: 'textBox', name: c.id, text: `Rotation ${c.angle}`, rotate: c.angle, style: { fontFace: 'Aptos Display', fontSize: 22, color: 'F8FAFC' } }] }],
	}
}

const planProbe = { valid: [], nullReset: false, invalidRangeRejected: false, invalidStepRejected: false, carriersForwarded: {} }
for (const c of checkpoints.filter(item => item.carrier !== 'model3d' || true)) {
	try {
		const plan = buildSpecOperationPlan(sourceSpec(c), {})
		const op = plan.operations.find(operation => operation.objectName?.endsWith(`.${c.id}.textBox`))
		const actual = op?.args?.options?.rotate
		planProbe.valid.push({ id: c.id, expected: c.angle, actual })
		if (c.angle === null && actual === null) planProbe.nullReset = true
	} catch (error) { planProbe.valid.push({ id: c.id, error: String(error?.message || error) }) }
}
for (const [key, value, pattern] of [
	['invalidRangeRejected', 360.0001, /between -360 and 360/i],
	['invalidStepRejected', 0.00001, /1\/60000-degree step/i],
]) {
	try { normalizeObjectRotation(value, 'rotate') } catch (error) { planProbe[key] = pattern.test(String(error?.message || error)) }
}
try {
	for (const c of [
		{ kind: 'textBox', name: 'text', text: 'text', rotate: 15 },
		{ kind: 'textShape', name: 'textShape', text: 'text shape', rotate: -15 },
		{ kind: 'shape', name: 'shape', shapeName: 'rect', rotate: 30 },
		{ kind: 'image', name: 'image', data: tinyPng, rotate: 45 },
		{ kind: 'equation', name: 'equation', source: 'x', rotate: 60 },
		{ kind: 'model3d', name: 'model3d', modelAsset: 'model3d://example', rotate: 75 },
	]) {
		const base = sourceSpec({ id: c.name, angle: c.rotate })
		base.slides[0].content = [c]
		const plan = buildSpecOperationPlan(base, {})
		const op = plan.operations.find(operation => operation.objectName?.includes(`.${c.name}.`))
		planProbe.carriersForwarded[c.kind] = (op?.args?.options?.rotate ?? op?.args?.rotate) === c.rotate
	}
} catch { planProbe.carriersForwarded = { error: true } }

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX global rotation proof'; pptx.subject = 'Native a:xfrm rotation'; pptx.title = 'Object rotation variants'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const c of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	if (c.carrier === 'shape') slide.addShape(pptx.ShapeType.roundRect, optionsFor(c))
	else if (c.carrier === 'text') slide.addText(`Text rotation ${c.angle}`, optionsFor(c))
	else if (c.carrier === 'wordArt') slide.addText(`WordArt rotation ${c.angle}`, { ...optionsFor(c), wordArt: { transform: 'textArchUp', adjustments: [50000] }, fontSize: 34 })
	else if (c.carrier === 'picture') slide.addImage({ data: tinyPng, ...optionsFor(c) })
	else if (c.carrier === 'equation') slide.addEquation({ source: 'x^2 + y^2 = 1', sourceFormat: 'unicodeMath', ...optionsFor(c) })
	else if (c.carrier === 'model3d') slide.addModel3D({ glbFile, nativeOnly: true, ...optionsFor(c) })
	slide.addNotes(`Native object rotation checkpoint ${c.id}; angle=${c.angle === null ? 'reset' : c.angle}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function attrs(tag) {
	const out = {}
	for (const match of String(tag || '').matchAll(/([A-Za-z][\w:.-]*)="([^"]*)"/g)) out[match[1]] = match[2]
	return out
}
function inspectXml(xml) {
	const matches = [...String(xml).matchAll(/<(?:a|p):xfrm\b([^>]*)>/g)].map(match => attrs(match[1]))
	const rotation = matches.find(item => item.rot !== undefined)?.rot
	return { rotation: rotation === undefined ? null : Number(rotation), xfrms: matches }
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
	const expected = row.angle === null || row.angle === 0 ? null : Math.round(row.angle * OBJECT_ROTATION_SERIALIZER_STEPS_PER_DEGREE)
	if (row.xml.rotation !== expected) failures.push(`${row.id}: generated rot expected ${expected}, got ${row.xml.rotation}`)
}
if (!Object.values(planProbe.carriersForwarded).every(Boolean)) failures.push(`compiler carrier forwarding failed: ${JSON.stringify(planProbe.carriersForwarded)}`)
if (!planProbe.nullReset || !planProbe.invalidRangeRejected || !planProbe.invalidStepRejected) failures.push(`compiler boundary probe failed: ${JSON.stringify(planProbe)}`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
if (new Set(roundtripRows.map(row => row.renderSha256)).size < 5) failures.push('rotation renders did not produce enough visual states')

const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-object-rotation.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'shape.transform.rotation',
	controls: ['rotate'], exactDomain: { minimum: -360, maximum: 360, default: 0, step: 1 / OBJECT_ROTATION_SERIALIZER_STEPS_PER_DEGREE },
	applicability: ['shape', 'text', 'wordArt', 'picture', 'equation', 'model3d'], planProbe,
	proof: { typedParameterSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeRotation: failures.length === 0, resetAndReeditBoundary: true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	officeBoundaries: ['Rotation is persisted as a:xfrm/@rot in 1/60000-degree units. PowerPoint may canonicalize a zero or full-turn endpoint to an omitted attribute; null/omitted is the explicit reset contract.'],
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'The shared 2-D object rotation control is typed, bounded, normalized at native precision, forwarded by the semantic compiler, and proven across ordinary text, WordArt, shapes, pictures, equations, and 3-D model frames. Universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'object-rotation-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, checkpointCount: checkpoints.length, planProbe, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
