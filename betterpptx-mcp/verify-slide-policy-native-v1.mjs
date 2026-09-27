#!/usr/bin/env node
// Native/Office proof for slide-level visibility and slide-number policy.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/slide-policy-native/${stamp}`)
const generated = path.join(outDir, 'slide-policy-native.pptx')
const roundtrip = path.join(outDir, 'slide-policy-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.defineLayout({ name: 'SlidePolicyWide', width: 13.333333, height: 7.5, type: 'wide', headerFooter: { date: true, header: true, footer: false, slideNumber: true } })
pptx.layout = 'SlidePolicyWide'
pptx.defineSlideMaster({ title: 'SlidePolicy Master', headerFooter: { date: false, header: false, footer: true, slideNumber: true }, slideNumber: { x: 12.4, y: 7.08, w: 0.45, h: 0.16, color: '64748B', fontSize: 7 }, objects: [] })
const slide = pptx.addSlide({ masterName: 'SlidePolicy Master' })
slide.hidden = true
slide._showMasterSp = false
slide._showMasterPhAnim = false
slide._slideNumberProps = { x: 12.1, y: 7.05, w: 0.45, h: 0.16, color: '38BDF8', fontSize: 8 }
slide.addText('Native slide policy', { x: 0.8, y: 1.2, w: 11.7, h: 1, fontSize: 28, bold: true, color: '0B1220' })
slide.addNotes('Slide visibility and slide-number policy proof.')
await pptx.writeFile({ fileName: generated, compression: false })

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const generatedZip = await readZip(generated)
const slideXml = await text(generatedZip, 'ppt/slides/slide1.xml')
const generatedRows = {
	slideHidden: /<p:sld\b[^>]*\bshow="0"/.test(slideXml),
	masterShapesHidden: /<p:sld\b[^>]*\bshowMasterSp="0"/.test(slideXml),
	masterPlaceholderAnimationHidden: /<p:sld\b[^>]*\bshowMasterPhAnim="0"/.test(slideXml),
	slideNumberCarrier: /type="slidenum"/.test(slideXml),
}
const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtripPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide-01.png';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=1;png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripZip = await readZip(roundtrip)
const roundtripSlideXml = await text(roundtripZip, 'ppt/slides/slide1.xml')
const renderSha256 = await fs.readFile(path.join(outDir, 'roundtrip-slide-01.png')).then(sha256)
const roundtripRows = {
	slideHiddenRetained: /<p:sld\b[^>]*\bshow="0"/.test(roundtripSlideXml),
	masterShapesHiddenRetained: /<p:sld\b[^>]*\bshowMasterSp="0"/.test(roundtripSlideXml),
	masterPlaceholderAnimationHiddenRetained: /<p:sld\b[^>]*\bshowMasterPhAnim="0"/.test(roundtripSlideXml),
	slideNumberCarrierRetained: /type="slidenum"/.test(roundtripSlideXml),
}
const failures = Object.entries({ ...generatedRows, officeOpenSaveCopyReopen: office.status === 'PASS', ...roundtripRows, renderedSlide: !!renderSha256 }).filter(([, pass]) => !pass).map(([name]) => name)
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-slide-policy-native.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	capabilityFamily: 'layouts-themes-masters',
	controls: ['slide.hidden', 'slide.slideNumber', 'slide.showMasterShapes', 'slide.showMasterPhAnim'],
	proof: { generatedRows, repairFreePowerPointOpen: office.status === 'PASS', retainedPolicy: roundtripRows, renderedSlide: renderSha256 },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes) },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes) },
	office,
	failures,
	interpretation: 'This proves slide hidden state, master-shape visibility, master placeholder-animation visibility, and a slide-owned number carrier through package inspection, PowerPoint open/SaveCopyAs/reopen, policy retention, and a rendered slide.',
}
const reportPath = path.join(outDir, 'slide-policy-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
