// Native/package/Office proof for independent text-character shadow/reflection.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-effects-native/${stamp}`)
const generated = path.join(outDir, 'text-effects-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const shadow = { type: 'outer', color: '0EA5E9', opacity: 0.55, blur: 6, offset: 5, angle: 135, scaleX: 1.1, scaleY: 0.9, skewX: 2, skewY: -3, rotateWithShape: false }
const reflection = { blur: 3, offset: 8, angle: 90, opacity: 0.7, endOpacity: 0.12, fadeStart: 8, fadeEnd: 72, scaleY: -82 }
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX text effects proof'; pptx.title = 'Native text-character effects'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const slide1 = pptx.addSlide(); slide1.background = { color: '07111F' }
slide1.addText('Text-character shadow', { x: 1.1, y: 1.2, w: 11.2, h: 0.8, color: 'FFFFFF', fontFace: 'Aptos Display', fontSize: 34, bold: true, align: 'center', objectName: 'text-shadow-canary', textShadow: shadow })
slide1.addNotes('Native text shadow: all independent scale/skew and geometric fields are serialized.')
const slide2 = pptx.addSlide(); slide2.background = { color: '07111F' }
slide2.addText('Text-character reflection', { x: 1.1, y: 1.2, w: 11.2, h: 1.5, color: 'F8FAFC', fontFace: 'Aptos Display', fontSize: 30, bold: true, align: 'center', objectName: 'text-reflection-canary', wordArt: { transform: 'textArchUp' }, textReflection: reflection })
slide2.addNotes('Native WordArt text reflection: blur, distance, direction, opacity, and fade positions are serialized.')
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xml1 = await zip.file('ppt/slides/slide1.xml').async('string')
const xml2 = await zip.file('ppt/slides/slide2.xml').async('string')
const generatedChecks = {
	shadowObjectFound: xml1.includes('name="text-shadow-canary"'),
	shadow: /<a:outerShdw[^>]*sx="110000"[^>]*sy="90000"[^>]*kx="120000"[^>]*ky="-180000"[^>]*blurRad="76200"[^>]*dist="63500"[^>]*dir="8100000"[^>]*rotWithShape="0"/.test(xml1),
	reflectionObjectFound: xml2.includes('name="text-reflection-canary"'),
	reflection: /<a:reflection[^>]*blurRad="38100"[^>]*stA="70000"[^>]*endA="12000"[^>]*stPos="8000"[^>]*endPos="72000"[^>]*dist="101600"[^>]*dir="5400000"[^>]*sy="-82000"/.test(xml2),
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png1='${outPath}\\roundtrip-slide1.png';$png2='${outPath}\\roundtrip-slide2.png';$r.Slides.Item(1).Export($png1,'PNG',1600,900);$r.Slides.Item(2).Export($png2,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png1=$png1;png2=$png2}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripXml1 = await roundtripZip.file('ppt/slides/slide1.xml').async('string')
const roundtripXml2 = await roundtripZip.file('ppt/slides/slide2.xml').async('string')
const retained = { shadow: /<a:outerShdw/.test(roundtripXml1) && /sx="110000"/.test(roundtripXml1) && /kx="120000"/.test(roundtripXml1), reflection: /<a:reflection/.test(roundtripXml2) && /dir="5400000"/.test(roundtripXml2) && /stPos="8000"/.test(roundtripXml2) && /sy="-82000"/.test(roundtripXml2) }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== 2) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(retained).every(Boolean)) failures.push('office:retained-text-effect-values')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const renderBytes = await Promise.all([fs.readFile(office.png1), fs.readFile(office.png2)])
const report = { schemaVersion: 'betterpptx.global-text-effects.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { textShadowParameters: 11, textReflectionParameters: 8, nativeCarrier: 'a:rPr/a:effectLst', serializer: 'canonical semantic aliases lowered to legacy DrawingML fields before serialization', reset: 'null/remove component' }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), retained, renderSha256: renderBytes.map(sha256) }, failures, interpretation: 'Independent text-character shadow/reflection sliders, including vertical reflection scale/flip, serialize to native text-run DrawingML, survive PowerPoint SaveCopyAs/reopen, and remain in the editable package.' }
const reportPath = path.join(outDir, 'text-effects-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
