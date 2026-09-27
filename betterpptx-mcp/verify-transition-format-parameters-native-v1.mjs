// Native/package/Office proof for transition controls beyond gallery tiles.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { TRANSITION_FORMAT_PARAMETERS } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/transition-format-parameters-native/${stamp}`)
const generated = path.join(outDir, 'transition-format-parameters-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const checkpoints = [
	{ id: 'push-timing', label: 'Push direction and timing', transition: { type: 'push', direction: 'left', speed: 'fast', advanceOnClick: false, advanceAfterTime: 6000 } },
	{ id: 'morph-option', label: 'Morph option and duration', transition: { type: 'morph', option: 'byChar', p14dur: 700, speed: 'slow' } },
	{ id: 'wheel-spokes', label: 'Wheel spokes and reversal', transition: { type: 'wheel', spokes: 8, clockwise: false, speed: 'medium' } },
	{ id: 'curtains-inversion', label: 'Curtains inversion controls', transition: { type: 'curtains', invX: true, invY: true, speed: 'med' } },
	{ id: 'zoom-reset', label: 'Zoom direction and duration alias', transition: { type: 'zoom', zoomFrom: 'out', durationMs: 900 } },
	{ id: 'none-reset', label: 'Null/reset transition', transition: null },
]

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX transition format proof'; pptx.title = 'Native transition format parameters'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide()
	slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoint.label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addShape(pptx.ShapeType.roundRect, { x: 1.1, y: 1.5, w: 10, h: 3.1, rectRadius: 0.08, fill: { color: 'DBEAFE' }, line: { color: '2563EB', pt: 2 }, shadow: { type: 'outer', color: '94A3B8', blur: 2, angle: 45, distance: 2, opacity: 0.18 } })
	slide.addText(`Editable native transition checkpoint: ${checkpoint.id}`, { x: 1.5, y: 2.55, w: 9.2, h: 0.6, color: '0F172A', fontSize: 24, align: 'center', bold: true })
	if (checkpoint.transition) slide.transition = checkpoint.transition
	slide.addNotes(`Transition format checkpoint ${checkpoint.id}: native transition family with typed timing, direction, and extended controls.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]))
const xmlRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await zip.file(slideFiles[index]).async('string')
	const expected = checkpoints[index].transition
	xmlRows.push({
		slide: index + 1, id: checkpoints[index].id, file: slideFiles[index],
		hasTransition: xml.includes('<p:transition'),
		pushDirection: index === 0 ? xml.includes('<p:push dir="l"') : true,
		timing: index === 0 ? xml.includes('spd="fast"') && xml.includes('advClick="0"') && xml.includes('advTm="6000"') : true,
		morphOption: index === 1 ? xml.includes('p159:morph option="byChar"') && xml.includes('p14:dur="700"') : true,
		wheelSpokes: index === 2 ? xml.includes('wheelReverse spokes="8"') : true,
		curtainsInversion: index === 3 ? xml.includes('prst="curtains"') && xml.includes('invX="1"') && xml.includes('invY="1"') : true,
		zoomAlias: index === 4 ? xml.includes('<p:zoom dir="out"') && xml.includes('p14:dur="900"') : true,
		nullReset: index === 5 ? !xml.includes('<p:transition') : true,
		expectedType: expected?.type || 'none',
	})
}
const generatedChecks = {
	parameterCatalogComplete: TRANSITION_FORMAT_PARAMETERS.length >= 16 && TRANSITION_FORMAT_PARAMETERS.every(item => item.id && item.semanticPath && item.reset),
	allCheckpointsPresent: slideFiles.length === checkpoints.length,
	directionalTimingNative: xmlRows[0].pushDirection && xmlRows[0].timing,
	morphOptionsNative: xmlRows[1].morphOption,
	wheelSpokesNative: xmlRows[2].wheelSpokes,
	inversionNative: xmlRows[3].curtainsInversion,
	durationAliasNative: xmlRows[4].zoomAlias,
	nullResetNative: xmlRows[5].nullReset,
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(3).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await roundtripZip.file(slideFiles[index]).async('string')
	roundtripRows.push({ slide: index + 1, id: checkpoints[index].id, hasTransition: xml.includes('<p:transition'), timing: index === 0 ? xml.includes('advTm="6000"') : true, morph: index === 1 ? xml.includes('p159:morph') : true, nullReset: index === 5 ? !xml.includes('<p:transition') : true })
}
const roundtripRetained = { transitionParts: roundtripRows.slice(0, 5).every(row => row.hasTransition), timing: roundtripRows[0].timing, morph: roundtripRows[1].morph, nullReset: roundtripRows[5].nullReset }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-transition-carriers')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = { schemaVersion: 'betterpptx.global-transition-format-parameters.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { source: 'transitionPreset plus native TransitionProps', parameterCount: TRANSITION_FORMAT_PARAMETERS.length, gallerySelectors: 49, nativeFamilies: ['legacy', 'p14', 'p15', 'p159', 'timing', 'reset'], officeBoundary: 'PowerPoint retains native transition carriers and authored timing/direction/options through Open2007/SaveCopyAs/reopen.' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: xmlRows, checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) }, failures, interpretation: 'The transition contract exposes existing native transition families and their typed timing, direction, pattern, inversion, Morph, and reset controls. Gallery selectors remain discoverable convenience IDs, while null/omitted fields restore native defaults.' }
const reportPath = path.join(outDir, 'transition-format-parameters-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
