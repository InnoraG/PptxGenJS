#!/usr/bin/env node
// Native/Office proof for typed master placeholder variants and semantic bindings.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/theme-master-placeholder-office/${stamp}`)
const generated = path.join(outDir, 'theme-master-placeholder-native.pptx')
const roundtrip = path.join(outDir, 'theme-master-placeholder-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }
pptx.defineSlideMaster({
	title: 'Placeholder Master', background: null, margin: 0.42,
	placeholders: undefined,
	objects: [
		{ placeholder: { options: { name: 'heroTitle', type: 'title', idx: 1, sz: 'full', x: 0.7, y: 0.55, w: 12, h: 0.8, margin: 0 }, text: '' } },
		{ placeholder: { options: { name: 'bodyContent', type: 'body', idx: 2, sz: 'full', x: 0.7, y: 1.7, w: 12, h: 5.2, margin: 0 }, text: '' } },
	],
})
const slide = pptx.addSlide({ masterName: 'Placeholder Master' })
slide.addText('Native title placeholder', { placeholder: 'heroTitle', phType: 'title', phIdx: 1, phSz: 'full', fontFace: 'Aptos Display', fontSize: 28, color: '0B1220', bold: true, objectName: 'hero-title' })
slide.addText('Native body placeholder', { placeholder: 'bodyContent', phType: 'body', phIdx: 2, phSz: 'full', fontFace: 'Aptos', fontSize: 18, color: '334155', objectName: 'body-content' })
slide.addNotes('Native placeholder variant and semantic binding checkpoint.')
await pptx.writeFile({ fileName: generated, compression: false })

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const generatedZip = await readZip(generated)
const layoutXml = await text(generatedZip, 'ppt/slideLayouts/slideLayout2.xml')
const slideXml = await text(generatedZip, 'ppt/slides/slide1.xml')
const relsXml = await text(generatedZip, 'ppt/slides/_rels/slide1.xml.rels')
const rows = {
	titlePlaceholder: /<p:ph[^>]*type="title"[^>]*>/.test(layoutXml) || /<p:ph[^>]*type="title"[^>]*\/>/.test(layoutXml),
	bodyPlaceholder: /<p:ph[^>]*type="body"/.test(layoutXml) && /idx="2"/.test(layoutXml),
	titleBinding: /<p:ph[^>]*type="title"[^>]*idx="1"/.test(slideXml),
	bodyBinding: /<p:ph[^>]*type="body"/.test(slideXml) && /idx="2"/.test(slideXml),
	masterRelationship: /slideLayout/.test(relsXml),
}
const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtripPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide-01.png';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=1;png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripZip = await readZip(roundtrip)
const roundtripLayout = await text(roundtripZip, 'ppt/slideLayouts/slideLayout2.xml')
const roundtripSlide = await text(roundtripZip, 'ppt/slides/slide1.xml')
const pngPath = path.join(outDir, 'roundtrip-slide-01.png')
const renderSha256 = await fs.readFile(pngPath).then(sha256)
const roundtripRows = {
	titlePlaceholder: /type="title"/.test(roundtripLayout),
	bodyPlaceholder: /type="body"/.test(roundtripLayout) && /idx="2"/.test(roundtripLayout),
	titleBinding: /type="title"/.test(roundtripSlide),
	bodyBinding: /type="body"/.test(roundtripSlide) && /idx="2"/.test(roundtripSlide),
}
const failures = Object.entries({ ...rows, officeOpenSaveCopyReopen: office.status === 'PASS', ...Object.fromEntries(Object.entries(roundtripRows).map(([key, value]) => [`roundtrip_${key}`, value])), renderedSlide: !!renderSha256 }).filter(([, pass]) => !pass).map(([name]) => name)
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-theme-master-placeholder-office.v1', status: failures.length ? 'FAIL' : 'PASS', capabilityFamily: 'layouts-themes-masters',
	controls: ['layout.placeholderVariants', 'master.placeholderVariants', 'layoutContract.placeholderBindings', 'title/body native placeholder type/index/size'],
	proof: { structuredNativeSerialization: rows, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedPlaceholderVariants: roundtripRows, renderedSlide: !!renderSha256 },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes) },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes) },
	office, failures,
	interpretation: failures.length ? 'Placeholder variant proof failed.' : 'Native master placeholder definitions and title/body semantic bindings survive package inspection and PowerPoint Open2007/SaveCopyAs/reopen with a full-size render. Gallery/template inventory remains a separate open lane; universal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'theme-master-placeholder-office-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
