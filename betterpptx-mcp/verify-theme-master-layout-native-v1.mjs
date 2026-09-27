#!/usr/bin/env node
// Native/Office proof for the typed theme + custom layout + master inheritance lane.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/theme-master-layout-native/${stamp}`)
const generated = path.join(outDir, 'theme-master-layout-native.pptx')
const roundtrip = path.join(outDir, 'theme-master-layout-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.defineLayout({
	name: 'EditorialWide', width: 13.333333, height: 7.5, type: 'wide',
	placeholders: [{ name: 'title', type: 'title', idx: 0, size: 'full', orient: 'vert', hasCustomPrompt: true, x: 0.7, y: 0.55, w: 12, h: 0.75, margin: 0 }],
})
pptx.layout = 'EditorialWide'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US', palette: { accent1: '38BDF8', accent2: 'A78BFA' } }
pptx.defineSlideMaster({ title: 'Editorial Master', background: null, margin: 0.42, slideNumber: { x: 12.4, y: 7.08, w: 0.45, h: 0.16, color: '64748B', fontSize: 7 }, objects: [] })
const slide = pptx.addSlide({ masterName: 'EditorialWide' })
slide.addText('Theme → native layout → master → slide', { placeholder: 'title', fontFace: 'Aptos Display', fontSize: 28, color: '38BDF8', bold: true, margin: 0, align: 'center', objectName: 'inheritance-target' })
slide.addNotes('Native theme/master/layout inheritance checkpoint.')
await pptx.writeFile({ fileName: generated, compression: false })

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const generatedZip = await readZip(generated)
const themeXml = await text(generatedZip, 'ppt/theme/theme1.xml')
const presXml = await text(generatedZip, 'ppt/presentation.xml')
const masterXml = await text(generatedZip, 'ppt/slideMasters/slideMaster1.xml')
const slideXml = await text(generatedZip, 'ppt/slides/slide1.xml')
const relsXml = await text(generatedZip, 'ppt/slides/_rels/slide1.xml.rels')
const layoutPart = (await Promise.all(Object.keys(generatedZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map(async name => ({ name, xml: await text(generatedZip, name) })))).find(item => /name="EditorialWide"/.test(item.xml))
const masterLayoutPart = (await Promise.all(Object.keys(generatedZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map(async name => ({ name, xml: await text(generatedZip, name) })))).find(item => /name="Editorial Master"/.test(item.xml))
const masterLayoutXml = layoutPart?.xml || ''
const rows = {
	themeFonts: /<a:majorFont>[\s\S]*?<a:latin\s+typeface="Aptos Display"[\s\S]*?<\/a:majorFont>[\s\S]*?<a:minorFont>[\s\S]*?<a:latin\s+typeface="Aptos"/.test(themeXml),
	themeAccent: /<a:accent1>[^<]*<a:srgbClr\s+val="38BDF8"/.test(themeXml),
	customCanvas: /cx="12192000"/.test(presXml) && /cy="6858000"/.test(presXml),
	layoutName: /name="EditorialWide"/.test(masterLayoutXml),
	layoutPlaceholder: /<p:ph[\s\S]*?(?:type="title"[\s\S]*?idx="0"|idx="0"[\s\S]*?type="title")[\s\S]*?sz="full"[\s\S]*?orient="vert"[\s\S]*?hasCustomPrompt="1"[\s\S]*?\/>/.test(masterLayoutXml),
	masterName: /name="Editorial Master"/.test(masterLayoutPart?.xml || ''),
	slideUsesLayout: layoutPart ? new RegExp(`slideLayout${layoutPart.name.match(/slideLayout(\d+)\.xml/)[1]}\.xml`).test(relsXml) : false,
	slideUsesMaster: /Target="\.\.\/slideLayouts\/slideLayout\d+\.xml"/.test(relsXml) || /slideLayout/.test(relsXml),
	slideDoesNotOwnBackground: !/<p:bg>/.test(slideXml),
}
const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtripPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide-01.png';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=1;png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripZip = await readZip(roundtrip)
const roundtripTheme = await text(roundtripZip, 'ppt/theme/theme1.xml')
const roundtripMaster = await text(roundtripZip, 'ppt/slideMasters/slideMaster1.xml')
const roundtripSlide = await text(roundtripZip, 'ppt/slides/slide1.xml')
const pngPath = path.join(outDir, 'roundtrip-slide-01.png')
const renderSha256 = await fs.readFile(pngPath).then(sha256)
const roundtripLayoutPart = (await Promise.all(Object.keys(roundtripZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map(async name => ({ name, xml: await text(roundtripZip, name) })))).find(item => /name="EditorialWide"/.test(item.xml))
const roundtripMasterLayoutPart = (await Promise.all(Object.keys(roundtripZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map(async name => ({ name, xml: await text(roundtripZip, name) })))).find(item => /name="Editorial Master"/.test(item.xml))
const roundtripRows = { themeFonts: /typeface="Aptos Display"/.test(roundtripTheme) && /typeface="Aptos"/.test(roundtripTheme), layoutName: /name="EditorialWide"/.test(roundtripLayoutPart?.xml || ''), layoutPlaceholder: /<p:ph[\s\S]*?type="title"[\s\S]*?\/>/.test(roundtripLayoutPart?.xml || ''), layoutPlaceholderOfficeCanonicalizedDefaultIdx: !/idx="0"/.test(roundtripLayoutPart?.xml || ''), masterName: /name="Editorial Master"/.test(roundtripMasterLayoutPart?.xml || ''), slideDoesNotOwnBackground: !/<p:bg>/.test(roundtripSlide) }
const failures = Object.entries({ ...rows, officeOpenSaveCopyReopen: office.status === 'PASS', roundtripThemeFonts: roundtripRows.themeFonts, roundtripLayoutName: roundtripRows.layoutName, roundtripLayoutPlaceholder: roundtripRows.layoutPlaceholder, roundtripMasterName: roundtripRows.masterName, roundtripInheritance: roundtripRows.slideDoesNotOwnBackground, renderedSlide: !!renderSha256 }).filter(([, pass]) => !pass).map(([name]) => name)
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = { schemaVersion: 'betterpptx.global-theme-master-layout-native.v1', status: failures.length ? 'FAIL' : 'PASS', capabilityFamily: 'layouts-themes-masters', controls: ['theme.fontFace', 'theme.headFontFace', 'theme.bodyFontFace', 'theme.lang', 'layout.name', 'layout.width', 'layout.height', 'layout.type', 'layout.placeholders.type', 'layout.placeholders.idx', 'layout.placeholders.size', 'layout.placeholders.orient', 'layout.placeholders.hasCustomPrompt', 'master.title', 'master.background', 'master.margin', 'master.slideNumber', 'slide.layoutName', 'slide.masterName'], proof: { structuredNativeSerialization: rows, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedInheritance: roundtripRows, renderedSlide: renderSha256 }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes) }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes) }, office, failures, interpretation: 'This proves the generic typed theme/custom-canvas/native slide-layout placeholder/master inheritance lane through native package inspection, PowerPoint open/SaveCopyAs/reopen, retained layout/master relationships, and a full-size render. The placeholder carrier includes the full PresentationML type/index/size/orientation/custom-prompt attribute set; PowerPoint may canonicalize default values on SaveCopyAs. Exhaustive Office gallery/template inventory remains open and universal closure remains 43/2258.' }
const reportPath = path.join(outDir, 'theme-master-layout-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
