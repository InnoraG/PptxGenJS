// Native/package/Office proof for generic repeatCount and autoReverse sliders.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/animation-timing-sliders-native/${stamp}`)
const generated = path.join(outDir, 'animation-timing-sliders-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const checkpoints = [
	{ id: 'pulse-repeat-reverse', label: 'Pulse with three repeats and auto-reverse', animation: { type: 'emphasis', effect: 'pulse', duration: 500, repeatCount: 3, autoReverse: true }, expected: { repeatCount: '3000', autoRev: '1' } },
	{ id: 'fade-indefinite-forward', label: 'Fade with indefinite repeat and explicit forward playback', animation: { type: 'entrance', effect: 'fade', duration: 450, repeatCount: 'indefinite', autoReverse: false }, expected: { repeatCount: 'indefinite', autoRev: undefined } },
	{ id: 'pulse-default-reset', label: 'Pulse with timing sliders reset to defaults', animation: { type: 'emphasis', effect: 'pulse', duration: 500, repeatCount: null, autoReverse: null }, expected: { repeatCount: undefined, autoRev: undefined } },
]

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX animation timing proof'; pptx.title = 'Native animation timing sliders'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoint.label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addShape(pptx.ShapeType.roundRect, { objectName: 'animation-target', x: 1.1, y: 1.5, w: 10, h: 3.1, rectRadius: 0.08, fill: { color: 'DBEAFE' }, line: { color: '2563EB', pt: 2 } })
	slide.addText(`Editable native animation checkpoint: ${checkpoint.id}`, { x: 1.5, y: 2.55, w: 9.2, h: 0.6, color: '0F172A', fontSize: 24, align: 'center', bold: true })
	slide.addAnimation('animation-target', checkpoint.animation)
	slide.addNotes(`Animation timing checkpoint ${checkpoint.id}: repeatCount and autoReverse are authored on the native owner timing node.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

function outerTiming(xml) {
	const doc = new DOMParser({ errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} } }).parseFromString(xml, 'application/xml')
	const pars = doc.getElementsByTagName('p:par').length ? doc.getElementsByTagName('p:par') : doc.getElementsByTagName('par')
	for (let i = 0; i < pars.length; i++) {
		const par = pars[i]
		for (let j = 0; j < par.childNodes.length; j++) {
			const child = par.childNodes[j]
			if (child.nodeType !== 1 || (child.nodeName !== 'p:cTn' && child.nodeName !== 'cTn')) continue
			const owner = child
			if (!owner.hasAttribute('presetID')) continue
			return { presetID: owner.getAttribute('presetID'), repeatCount: owner.getAttribute('repeatCount') || undefined, autoRev: owner.getAttribute('autoRev') || undefined }
		}
	}
	return null
}

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]))
const xmlRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await zip.file(slideFiles[index]).async('string')
	const timing = outerTiming(xml)
	const expected = checkpoints[index].expected
	xmlRows.push({ slide: index + 1, id: checkpoints[index].id, hasTiming: Boolean(timing), timing, expected, retained: Boolean(timing) && timing.repeatCount === expected.repeatCount && timing.autoRev === expected.autoRev })
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)

const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\timing-sliders-roundtrip.png';$r.Slides.Item(1).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await roundtripZip.file(slideFiles[index]).async('string')
	const timing = outerTiming(xml)
	const expected = checkpoints[index].expected
	roundtripRows.push({ slide: index + 1, id: checkpoints[index].id, timing, retained: Boolean(timing) && timing.repeatCount === expected.repeatCount && timing.autoRev === expected.autoRev })
}
const generatedChecks = { allCheckpointsPresent: slideFiles.length === checkpoints.length, nativeOwnerSerialization: xmlRows.every(row => row.retained), packageIntegrity: packageAudit.status === 'PASS' && !packageAudit.errors?.length }
const roundtripRetained = { allSlides: roundtripRows.every(row => row.retained), repeatAndReverse: roundtripRows[0]?.retained && roundtripRows[1]?.retained, reset: roundtripRows[2]?.retained }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-timing-sliders')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = { schemaVersion: 'betterpptx.global-animation-timing-sliders.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { repeatCount: 'API count 1..1000 or indefinite; native CTn repeatCount is count*1000 or indefinite', autoReverse: 'API true emits owner CTn autoRev=1; false/null use PowerPoint canonical omission', scope: 'generic registry builder owner nodes; nested effect-internal timing untouched' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: xmlRows, checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) }, failures, interpretation: failures.length ? 'Generic animation timing sliders are not yet fully proven.' : 'Generic repeatCount and autoReverse sliders serialize on native owner timing nodes, survive PowerPoint Open2007/SaveCopyAs/reopen, and reset without inventing effect-internal timing.' }
const reportPath = path.join(outDir, 'animation-timing-sliders-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
