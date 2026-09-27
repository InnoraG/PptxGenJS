// Native/package/Office proof for style and text-effect preset base precedence.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { applyTextEffectPresets } from './native-effect-presets.mjs'
import { applyNativeStylePreset } from './native-style-presets.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/style-effect-preset-overrides-native/${stamp}`)
const generated = path.join(outDir, 'style-effect-preset-overrides-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const shapeStyle = applyNativeStylePreset({
	shadow: { blur: 11, offset: 7, angle: 123, color: 'FF0000', opacity: 0.3 },
	glow: { size: 9, color: '00FF00', opacity: 0.4 },
	reflection: { blur: 2, offset: 3, angle: 90, opacity: 0.35, endOpacity: 0.05, fadeStart: 0, fadeEnd: 55 },
	softEdges: { size: 4 },
	blur: { radiusPt: 5, grow: false },
	fillOverlay: { blend: 'mult', fill: { type: 'solid', color: '112233', transparency: 0.2 } },
}, 'shape-style-075').style
const textStyle = applyTextEffectPresets({
	...applyNativeStylePreset({}, 'wordart-style-007').style,
	textGlow: { size: 11, color: 'FF0000', opacity: 0.3 },
}, ['text-effect-glow-003']).style

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX style-effect override proof'; pptx.title = 'Style effect preset overrides'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const slide = pptx.addSlide(); slide.background = { color: '07111F' }
slide.addText('Preset base + typed effect overrides', { x: 0.6, y: 0.35, w: 12, h: 0.45, color: 'F8FAFC', fontSize: 24, bold: true })
slide.addShape('roundRect', { ...shapeStyle, x: 0.8, y: 1.25, w: 4.8, h: 2.8, objectName: 'shape-style-overridden' })
slide.addText('WordArt preset + typed glow', { ...textStyle, text: 'NATIVE', x: 6.2, y: 1.6, w: 5.8, h: 1.2, fontSize: 42, bold: true, color: 'F8FAFC', objectName: 'wordart-style-overridden' })
slide.addText('Independent typed effect values must survive the exact gallery base.', { x: 1.2, y: 4.4, w: 10.8, h: 0.35, color: 'CBD5E1', fontSize: 14, align: 'center' })
slide.addNotes('Gallery style remains the native base; typed effect controls are applied after the base and remain independently editable.')
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xml = await zip.file('ppt/slides/slide1.xml').async('string')
const shapeStart = xml.indexOf('name="shape-style-overridden"')
const textStart = xml.indexOf('name="wordart-style-overridden"')
const shapeXml = xml.slice(shapeStart, xml.indexOf('</p:sp>', shapeStart))
const textXml = xml.slice(textStart, xml.indexOf('</p:sp>', textStart))
const generatedChecks = {
	shapePresetRetained: /<p:style/.test(shapeXml) && /<a:gradFill/.test(shapeXml),
	shapeShadowOverride: /outerShdw[^>]*blurRad="139700"[^>]*dist="88900"[^>]*dir="7380000"/.test(shapeXml) && /srgbClr val="FF0000"><a:alpha val="30000"/.test(shapeXml),
	shapeGlowOverride: /<a:glow rad="114300"/.test(shapeXml),
	shapeReflectionOverride: /<a:reflection[^>]*blurRad="25400"[^>]*dist="38100"/.test(shapeXml),
	shapeSoftEdgeOverride: /<a:softEdge rad="50800"/.test(shapeXml),
	shapeBlurOverride: /<a:blur rad="63500" grow="0"/.test(shapeXml),
	shapeFillOverlayOverride: /<a:fillOverlay blend="mult"/.test(shapeXml) && /srgbClr val="112233"/.test(shapeXml),
	textPresetRetained: /<a:effectLst/.test(textXml),
	textGlowOverride: /<a:glow rad="139700"/.test(textXml) && /srgbClr val="FF0000"><a:alpha val="30000"/.test(textXml),
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(1).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripXml = await roundtripZip.file('ppt/slides/slide1.xml').async('string')
const retained = { shapeShadow: /outerShdw/.test(roundtripXml), textGlow: /<a:glow/.test(roundtripXml) }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== 1) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(retained).every(Boolean)) failures.push('office:retained-effect-overrides')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = {
	schemaVersion: 'betterpptx.global-style-effect-preset-overrides.v1', status: failures.length ? 'FAIL' : 'PASS',
	contract: { precedence: 'native style/text-effect preset base, then typed effect overrides', overrideFields: ['style.shadow', 'style.glow', 'style.reflection', 'style.softEdges', 'style.blur', 'style.fillOverlay', 'style.textGlow'], reset: 'remove named override or remove preset plus overrides' },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), checks: generatedChecks, packageAudit },
	office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), retained, renderSha256: sha256(renderBytes) },
	failures,
	interpretation: 'A style or text-effect gallery tile is an editable native base, not a ceiling: explicit typed effect fields replace only their named effect fragments while unrelated native recipe content remains intact.',
}
const reportPath = path.join(outDir, 'style-effect-preset-overrides-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
