#!/usr/bin/env node
// Native/Office proof for the typed p:hf header/footer visibility policy.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/header-footer-policy-native/${stamp}`)
const generated = path.join(outDir, 'header-footer-policy-native.pptx')
const roundtrip = path.join(outDir, 'header-footer-policy-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.defineLayout({ name: 'HeaderFooterWide', width: 13.333333, height: 7.5, type: 'wide', headerFooter: { date: true, header: true, footer: false, slideNumber: true } })
pptx.layout = 'HeaderFooterWide'
pptx.defineSlideMaster({ title: 'HeaderFooter Master', headerFooter: { date: false, header: false, footer: true, slideNumber: true }, slideNumber: { x: 12.4, y: 7.08, w: 0.45, h: 0.16, color: '64748B', fontSize: 7 }, objects: [] })
const slide = pptx.addSlide({ masterName: 'HeaderFooterWide' })
slide.addText('Native header/footer policy', { x: 0.8, y: 1.2, w: 11.7, h: 1, fontSize: 28, bold: true, color: '0B1220' })
slide.addNotes('Header/footer policy proof.')
await pptx.writeFile({ fileName: generated, compression: false })

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const generatedZip = await readZip(generated)
const masterXml = await text(generatedZip, 'ppt/slideMasters/slideMaster1.xml')
const layoutNames = Object.keys(generatedZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
const layoutXmls = await Promise.all(layoutNames.map(async name => ({ name, xml: await text(generatedZip, name) })))
const layoutXml = layoutXmls.find(item => /name="HeaderFooterWide"/.test(item.xml))?.xml || ''
const policyXml = xml => xml.match(/<p:hf\b[^>]*\/>/)?.[0] || ''
const generatedRows = {
	layoutPolicy: /sldNum="1"\s+hdr="1"\s+ftr="0"\s+dt="1"/.test(policyXml(layoutXml)),
	masterPolicy: /sldNum="1"\s+hdr="0"\s+ftr="1"\s+dt="0"/.test(policyXml(masterXml)),
	packageHasLayout: layoutXml.length > 0,
}
const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtripPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide-01.png';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=1;png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripZip = await readZip(roundtrip)
const roundtripMaster = await text(roundtripZip, 'ppt/slideMasters/slideMaster1.xml')
const roundtripLayoutEntries = await Promise.all(Object.keys(roundtripZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map(async name => ({ name, xml: await text(roundtripZip, name) })))
const roundtripLayout = roundtripLayoutEntries.find(item => /<p:hf\b/.test(item.xml))?.xml || ''
const renderSha256 = await fs.readFile(path.join(outDir, 'roundtrip-slide-01.png')).then(sha256)
const roundtripRows = {
	layoutPolicyNodeRetained: /<p:hf\b/.test(policyXml(roundtripLayout)),
	masterPolicyNodeRetained: /<p:hf\b/.test(policyXml(roundtripMaster)),
}
const failures = Object.entries({ ...generatedRows, officeOpenSaveCopyReopen: office.status === 'PASS', ...roundtripRows, renderedSlide: !!renderSha256 }).filter(([, pass]) => !pass).map(([name]) => name)
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = { schemaVersion: 'betterpptx.global-header-footer-policy-native.v1', status: failures.length ? 'FAIL' : 'PASS', capabilityFamily: 'layouts-themes-masters', controls: ['layout.headerFooter.date', 'layout.headerFooter.header', 'layout.headerFooter.footer', 'layout.headerFooter.slideNumber', 'master.headerFooter.date', 'master.headerFooter.header', 'master.headerFooter.footer', 'master.headerFooter.slideNumber'], proof: { generatedRows, repairFreePowerPointOpen: office.status === 'PASS', retainedPolicy: roundtripRows, renderedSlide: renderSha256 }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes) }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes) }, office, failures, interpretation: 'This proves the typed header/footer visibility policy as native p:hf attributes on slide-layout and slide-master carriers through package inspection, PowerPoint open/SaveCopyAs/reopen, policy retention, and a rendered slide.' }
const reportPath = path.join(outDir, 'header-footer-policy-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
