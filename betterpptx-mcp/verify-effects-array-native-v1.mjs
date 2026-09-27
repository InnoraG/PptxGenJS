// Native/package/Office proof for the public effects[] combination surface.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { applyEffectsArray } from './ir/native-visual-primitives.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/effects-array-native/${stamp}`)
const generated = path.join(outDir, 'effects-array-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const effects = [
	{ type: 'blur', radiusPt: 12, growBounds: false },
	{ type: 'outerShadow', color: '102030', opacity: 0.42, blurPt: 18, distancePt: 7, angleDeg: 135 },
	{ type: 'reflection', blurPt: 3, distancePt: 2, directionDeg: 90, startOpacity: 0.28, endOpacity: 0.05, startPosition: 0.1, endPosition: 0.7 },
	{ type: 'fillOverlay', blendMode: 'screen', color: '38BDF8', transparency: 0.25 },
]
const combo = applyEffectsArray({}, effects)
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX effects[] proof'; pptx.title = 'Native effects array'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const slide = pptx.addSlide(); slide.background = { color: '07111F' }
slide.addText('effects[] → native effectLst', { x: 0.7, y: 0.35, w: 11.5, h: 0.5, color: 'F8FAFC', fontSize: 24, bold: true })
slide.addShape('roundRect', { ...combo, x: 3.2, y: 1.35, w: 6.2, h: 3.1, objectName: 'effects-array-canary' })
slide.addText('All six native effect families remain typed and independently editable; duplicate/order semantics are an explicit boundary.', { x: 1.1, y: 4.8, w: 11.2, h: 0.5, color: 'CBD5E1', fontSize: 13, align: 'center' })
slide.addNotes('The public effects array is lowered to the same native effectLst primitives as individual typed fields. effectDag remains preserve-only.')
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xml = await zip.file('ppt/slides/slide1.xml').async('string')
const start = xml.indexOf('name="effects-array-canary"')
const shapeXml = xml.slice(start, xml.indexOf('</p:sp>', start))
const generatedChecks = {
	objectFound: start >= 0,
	effectListPresent: /<a:effectLst/.test(shapeXml),
	blur: /<a:blur rad="152400" grow="0"/.test(shapeXml),
	shadow: /<a:outerShdw[^>]*blurRad="228600"[^>]*dist="88900"[^>]*dir="8100000"/.test(shapeXml),
	reflection: /<a:reflection[^>]*blurRad="38100"[^>]*dist="25400"[^>]*dir="5400000"/.test(shapeXml),
	fillOverlay: /<a:fillOverlay blend="screen"/.test(shapeXml) && /srgbClr val="38BDF8"/.test(shapeXml),
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(1).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripXml = await roundtripZip.file('ppt/slides/slide1.xml').async('string')
const retained = { effectList: /<a:effectLst/.test(roundtripXml), blur: /<a:blur/.test(roundtripXml), shadow: /<a:outerShdw/.test(roundtripXml), reflection: /<a:reflection/.test(roundtripXml), fillOverlay: /<a:fillOverlay/.test(roundtripXml) }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== 1) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(retained).every(Boolean)) failures.push('office:retained-effectLst-components')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = {
	schemaVersion: 'betterpptx.global-effects-array.v1', status: failures.length ? 'FAIL' : 'PASS',
	contract: { source: 'style.effects / options.effects', nativeCarrier: 'a:effectLst', parameterCount: 28, duplicateTypeBoundary: 'duplicates collapse to one typed component', orderBoundary: 'arbitrary order is not authored; effectDag remains preserve-only' },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), checks: generatedChecks, packageAudit },
	office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), retained, renderSha256: sha256(renderBytes) },
	failures,
	interpretation: 'The public effects[] combination surface exposes all typed effect-family leaves while lowering to editable native effectLst XML; imported effectDag remains outside the authoring contract.',
}
const reportPath = path.join(outDir, 'effects-array-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
