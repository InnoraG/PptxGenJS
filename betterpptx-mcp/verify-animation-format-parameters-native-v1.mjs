// Native/package/Office proof for the full Animation Pane contract.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { ANIMATION_FORMAT_EFFECTS, ANIMATION_FORMAT_PARAMETERS } from './animation-format-catalog.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/animation-format-parameters-native/${stamp}`)
const generated = path.join(outDir, 'animation-format-parameters-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const checkpoints = [
	{ id: 'fly-timing-direction', label: 'Fly timing, delay, trigger, and direction', animation: { type: 'entrance', effect: 'fly', direction: 'fromLeft', trigger: 'afterPrevious', durationMs: 650, delayMs: 120 } },
	{ id: 'color-emphasis', label: 'Color emphasis', animation: { type: 'emphasis', effect: 'colorWave', color: 'FF0000', duration: 800, trigger: 'withPrevious' } },
	{ id: 'motion-path', label: 'Customizable native motion path', animation: { type: 'motion', motionPath: 'arcUp', durationMs: 1400, delayMs: 40, trigger: 'afterPrevious' } },
	{ id: 'wheel-spokes', label: 'Wheel spokes and visibility override', animation: { type: 'entrance', effect: 'wheel', spokes: 8, usesVisibility: false, duration: 500 } },
	{ id: 'null-reset', label: 'Null animation reset', animation: null },
]

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX animation format proof'; pptx.title = 'Native animation format parameters'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoint.label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addShape(pptx.ShapeType.roundRect, { objectName: 'animation-target', x: 1.1, y: 1.5, w: 10, h: 3.1, rectRadius: 0.08, fill: { color: 'DBEAFE' }, line: { color: '2563EB', pt: 2 } })
	slide.addText(`Editable native animation checkpoint: ${checkpoint.id}`, { x: 1.5, y: 2.55, w: 9.2, h: 0.6, color: '0F172A', fontSize: 24, align: 'center', bold: true })
	if (checkpoint.animation) slide.addAnimation('animation-target', checkpoint.animation)
	slide.addNotes(`Animation format checkpoint ${checkpoint.id}: native Animation Pane effect with typed timing and extended controls.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]))
const xmlRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await zip.file(slideFiles[index]).async('string')
	xmlRows.push({
		slide: index + 1, id: checkpoints[index].id, hasTiming: xml.includes('<p:timing'),
		flyTimingDirection: index === 0 ? xml.includes('dur="650"') && xml.includes('delay="120"') && (xml.includes('presetSubtype="8"') || xml.includes('fromLeft')) : true,
		colorEmphasis: index === 1 ? xml.includes('colorWave') || xml.includes('FF0000') : true,
		motionPath: index === 2 ? xml.includes('animMotion') && (xml.includes('arcUp') || xml.includes('arcup') || xml.includes('path=')) : true,
		wheelSpokes: index === 3 ? xml.includes('wheel(8)') || xml.includes('presetSubtype="8"') : true,
		nullReset: index === 4 ? !xml.includes('<p:timing') : true,
	})
}
const generatedChecks = {
	parameterCatalogComplete: ANIMATION_FORMAT_PARAMETERS.length >= 20 && ANIMATION_FORMAT_PARAMETERS.every(item => item.id && item.semanticPath && item.reset),
	effectCatalogComplete: ANIMATION_FORMAT_EFFECTS.length === 166,
	allCheckpointsPresent: slideFiles.length === checkpoints.length,
	flyTimingDirection: xmlRows[0].flyTimingDirection,
	colorEmphasis: xmlRows[1].colorEmphasis,
	motionPath: xmlRows[2].motionPath,
	wheelSpokes: xmlRows[3].wheelSpokes,
	nullReset: xmlRows[4].nullReset,
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(3).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await roundtripZip.file(slideFiles[index]).async('string')
	roundtripRows.push({ slide: index + 1, id: checkpoints[index].id, hasTiming: xml.includes('<p:timing'), timing: index === 0 ? xml.includes('dur="650"') && xml.includes('delay="120"') : true, motion: index === 2 ? xml.includes('animMotion') : true, nullReset: index === 4 ? !xml.includes('<p:timing') : true })
}
const roundtripRetained = { animationParts: roundtripRows.slice(0, 4).every(row => row.hasTiming), timing: roundtripRows[0].timing, motion: roundtripRows[2].motion, nullReset: roundtripRows[4].nullReset }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-animation-carriers')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
	const report = { schemaVersion: 'betterpptx.global-animation-format-parameters.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { source: 'animationPreset plus native AnimationProps', parameterCount: ANIMATION_FORMAT_PARAMETERS.length, effectSelectors: ANIMATION_FORMAT_EFFECTS.length, nativeFamilies: ['entrance', 'emphasis', 'exit', 'motion', 'media', 'timing', 'sequence', 'reset'], officeBoundary: 'PowerPoint retains native animation timing and proven effect carriers through Open2007/SaveCopyAs/reopen.' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: xmlRows, checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) }, failures, interpretation: 'The animation contract exposes the native effect registry and typed timing/sequence/path/media controls. Generic repeatCount and autoReverse remain explicit builder boundaries until independently proven.' }
const reportPath = path.join(outDir, 'animation-format-parameters-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
