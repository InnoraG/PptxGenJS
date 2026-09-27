// Native/package/Office proof for the expanded Model 3D View manual controls.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { MODEL3D_VIEW_PARAMETERS } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/model3d-view-parameters-native/${stamp}`)
const generated = path.join(outDir, 'model3d-view-parameters-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const model = path.resolve('betterpptx-mcp/assets/default-presenter-louise.glb')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const checkpoints = [
	{ id: 'view-base', label: 'Default View', model3dViewPresetId: 'model3d-view-001' },
	{ id: 'view-pose', label: 'Pose and lens override', model3dViewPresetId: 'model3d-view-011', camera: { fov: 48 }, trans: { rot: { x: 12.5, y: -24.25, z: 7.75 }, scale: { x: 1.2, y: 0.9, z: 1.05 } } },
	{ id: 'view-camera', label: 'Camera and viewport override', model3dViewPresetId: 'model3d-view-003', camera: { pos: { x: 1200000, y: -800000, z: 88000000 }, fov: 32 }, objViewport: 3100000 },
	{ id: 'view-lights', label: 'Lighting override', model3dViewPresetId: 'model3d-view-007', ambientLight: { color: { r: 96, g: 144, b: 255 }, illuminance: 0.72 }, ptLights: [{ color: { r: 255, g: 210, b: 160 }, intensity: 11, pos: { x: 21000000, y: 51000000, z: 26000000 } }, { color: { r: 160, g: 190, b: 255 }, intensity: 4.5, pos: { x: -30000000, y: 22000000, z: 42000000 } }, { color: { r: 255, g: 180, b: 120 }, intensity: 2, pos: { x: 36000000, y: -18000000, z: 18000000 } }] },
	{ id: 'view-reset', label: 'Sparse re-edit reset', model3dViewPresetId: 'model3d-view-011', camera: null, trans: { rot: null, scale: null }, ambientLight: null, ptLights: null, objViewport: null },
]

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX Model 3D View proof'; pptx.title = 'Native Model 3D View parameters'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: '07111F' }
	slide.addText(checkpoint.label, { x: 0.7, y: 0.35, w: 11.5, h: 0.5, color: 'F8FAFC', fontSize: 24, bold: true })
	slide.addModel3D({ glbFile: model, x: 4.25, y: 1.15, w: 4.8, h: 4.3, objectName: checkpoint.id, altText: checkpoint.label, nativeOnly: true, ...checkpoint })
	slide.addText('The selected gallery tile remains the base; named manual view fields are native, editable overrides.', { x: 1.1, y: 5.7, w: 11.2, h: 0.35, color: 'CBD5E1', fontSize: 12, align: 'center' })
	slide.addNotes(`Model 3D View checkpoint ${checkpoint.id}: exact tile plus typed manual camera, transform, lighting, viewport, and reset semantics.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const generatedRows = []
for (let index = 1; index <= checkpoints.length; index++) {
	const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
	const named = xml.slice(xml.indexOf(`name="${checkpoints[index - 1].id}"`), xml.length)
	generatedRows.push({
		slide: index,
		objectFound: named.includes(`name="${checkpoints[index - 1].id}"`),
		camera: /<am3d:camera>/.test(named) && /<am3d:perspective fov="/.test(named),
		transform: /<am3d:trans>/.test(named) && /<am3d:scale>/.test(named),
		viewport: /<am3d:objViewport viewportSz="/.test(named),
		ambient: /<am3d:ambientLight>/.test(named),
		pointLight: /<am3d:ptLight\b/.test(named),
		pointLightCount: (named.match(/<am3d:ptLight\b/g) || []).length,
		pointLightValues: named.includes('n="11000000"') && named.includes('n="4500000"') && named.includes('n="2000000"'),
		rotation: /<am3d:rot(?:\s|\/>)/.test(named),
	})
}
const generatedChecks = {
	modelExists: (await fs.stat(model)).size > 1000,
	parameterCatalogComplete: MODEL3D_VIEW_PARAMETERS.length === 14 && MODEL3D_VIEW_PARAMETERS.every(item => item.id && item.semanticPath && item.serializer),
	allCheckpointObjects: generatedRows.every(row => row.objectFound),
	cameraAndTransformNative: generatedRows.every(row => row.camera && row.transform),
	viewportNative: generatedRows.every(row => row.viewport),
	lightingNative: generatedRows[3].ambient && generatedRows[3].pointLight && generatedRows[3].pointLightCount === 3 && generatedRows[3].pointLightValues,
	resetKeepsNativeCarrier: generatedRows[4].camera && generatedRows[4].transform && generatedRows[4].viewport,
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(2).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
	const roundtripRows = []
for (let index = 1; index <= checkpoints.length; index++) {
	const xml = await roundtripZip.file(`ppt/slides/slide${index}.xml`).async('string')
	roundtripRows.push({ slide: index, camera: /<am3d:camera>/.test(xml), transform: /<am3d:trans>/.test(xml), viewport: /<am3d:objViewport/.test(xml), ambient: /<am3d:ambientLight>/.test(xml), pointLight: /<am3d:ptLight\b/.test(xml), pointLightCount: (xml.match(/<am3d:ptLight\b/g) || []).length, pointLightValues: xml.includes('n="11000000"') && xml.includes('n="4500000"') && xml.includes('n="2000000"') })
}
const roundtripRetained = { allModelCarriers: roundtripRows.every(row => row.camera && row.transform && row.viewport), lightingCarrier: roundtripRows[3].ambient && roundtripRows[3].pointLight && roundtripRows[3].pointLightCount === 3 && roundtripRows[3].pointLightValues, resetCarrier: roundtripRows[4].camera && roundtripRows[4].transform }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-model3d-carriers')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = {
	schemaVersion: 'betterpptx.global-model3d-view-parameters.v1', status: failures.length ? 'FAIL' : 'PASS',
	contract: { source: 'model3dViewPresetId plus camera/trans/ambientLight/ptLights/objViewport', presetCount: 18, parameterCount: MODEL3D_VIEW_PARAMETERS.length, pointLightContract: '0..3 typed point lights; each color/intensity/position is serialized and retained', nativeCarrier: 'am3d:model3d', officeBoundary: 'PowerPoint retains the model3d carrier and the selected tile; exact visual/readback of manual lighting is classified by retained XML rather than guessed from the gallery.' },
	checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: generatedRows, checks: generatedChecks, packageAudit },
	office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) },
	failures,
	interpretation: 'The expanded Model 3D View contract keeps exact gallery selection as the base while exposing typed manual native controls. The proof claims package/Office carrier retention; it does not claim that a gallery tile encodes every manual light choice.',
}
const reportPath = path.join(outDir, 'model3d-view-parameters-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
