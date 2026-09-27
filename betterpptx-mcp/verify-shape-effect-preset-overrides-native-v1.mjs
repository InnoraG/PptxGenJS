#!/usr/bin/env node
// Native/package/Office proof for preset-as-base plus typed 3-D override precedence.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { applyShapeEffectPresets } from './native-effect-presets.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-effect-preset-overrides-native/${stamp}`)
const generated = path.join(outDir, 'shape-effect-preset-overrides-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const base = { x: 0.8, y: 1.2, w: 3.2, h: 1.8, fill: { color: '16324F' }, line: { color: '38BDF8', width: 1.5 } }
const presetOnly = applyShapeEffectPresets({}, ['shape-effect-preset-002']).style
const overridden = applyShapeEffectPresets({ effect3D: { rotationX: 12, rotationY: 34, rotationZ: 7, perspective: 62, lightDirection: 25, material: 'metal', extrusion: 9, contourWidth: 2.5, extrusionColor: 'F97316', contourColor: '22C55E', bevel: { type: 'circle', width: 4, height: 5 } } }, ['shape-effect-preset-002']).style
const reset = applyShapeEffectPresets({}, ['shape-effect-preset-001']).style

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX shape-effect override proof'; pptx.subject = 'Native shape-effect preset precedence'; pptx.title = 'Shape effect preset overrides'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
const slide = pptx.addSlide(); slide.background = { color: '07111F' }
slide.addText('Preset base + typed override contract', { x: 0.6, y: 0.35, w: 12, h: 0.45, color: 'F8FAFC', fontFace: 'Aptos Display', fontSize: 24, bold: true })
slide.addShape('roundRect', { ...base, ...presetOnly, objectName: 'shape-effect-preset-base' })
slide.addShape('roundRect', { ...base, ...overridden, x: 4.8, objectName: 'shape-effect-preset-overridden' })
slide.addShape('roundRect', { ...base, ...reset, x: 8.8, objectName: 'shape-effect-preset-reset' })
slide.addText('exact native tile', { x: 1, y: 3.25, w: 2.5, h: 0.3, color: 'CBD5E1', fontSize: 12, align: 'center' })
slide.addText('preset + rotation/material/extrusion/bevel overrides', { x: 4.95, y: 3.25, w: 3.1, h: 0.45, color: 'CBD5E1', fontSize: 12, align: 'center' })
slide.addText('preset reset / no 3-D override', { x: 9, y: 3.25, w: 2.6, h: 0.3, color: 'CBD5E1', fontSize: 12, align: 'center' })
slide.addNotes('The selected gallery tile is a base. Explicit typed effect3D fields override only their named native scene/sp3d fields; reset removes the override.')
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xml = await zip.file('ppt/slides/slide1.xml').async('string')
const named = name => {
  const start = xml.indexOf(`name="${name}"`)
  const end = xml.indexOf('</p:sp>', start)
  return xml.slice(start, end >= 0 ? end : start + 8000)
}
const baseXml = named('shape-effect-preset-base')
const overrideXml = named('shape-effect-preset-overridden')
const resetXml = named('shape-effect-preset-reset')
const generatedChecks = {
  basePresetRetained: /camera prst="legacyObliqueTopRight"/.test(baseXml) && /prstMaterial="legacyMatte"/.test(baseXml),
  overrideRotationX: /lat="720000"/.test(overrideXml),
  overrideRotationY: /lon="2040000"/.test(overrideXml),
  overrideRotationZ: /rev="420000"/.test(overrideXml),
  overridePerspective: /fov="3720000"/.test(overrideXml),
  overrideLightDirection: /<a:lightRig[^>]*>.*<a:rot[^>]*rev="1500000"/s.test(overrideXml),
  overrideMaterial: /prstMaterial="metal"/.test(overrideXml),
  overrideExtrusion: /extrusionH="114300"/.test(overrideXml),
  overrideBevel: /<a:bevelT[^>]*w="50800"[^>]*h="63500"[^>]*prst="circle"/.test(overrideXml),
  overrideColors: /<a:extrusionClr><a:srgbClr val="F97316"/.test(overrideXml) && /<a:contourClr><a:srgbClr val="22C55E"/.test(overrideXml),
  resetHasNoThreeD: !/<a:scene3d|<a:sp3d/.test(resetXml),
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(1).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripXml = await roundtripZip.file('ppt/slides/slide1.xml').async('string')
const rtNamed = name => { const start = roundtripXml.indexOf(`name="${name}"`); const end = roundtripXml.indexOf('</p:sp>', start); return roundtripXml.slice(start, end >= 0 ? end : start + 8000) }
const retained = { rotationX: /lat="720000"/.test(rtNamed('shape-effect-preset-overridden')), material: /prstMaterial="metal"/.test(rtNamed('shape-effect-preset-overridden')), reset: !/<a:scene3d|<a:sp3d/.test(rtNamed('shape-effect-preset-reset')) }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== 1) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(retained).every(Boolean)) failures.push('office:retained-override-reset')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = {
  schemaVersion: 'betterpptx.global-shape-effect-preset-overrides.v1', status: failures.length ? 'FAIL' : 'PASS',
  contract: { precedence: 'native shape-effect preset base, then typed overrides', overrideFields: ['style.shadow', 'style.glow', 'style.reflection', 'style.softEdges', 'style.blur', 'style.fillOverlay', 'style.effects', 'style.effect3D'], rotationDegrees: { minimum: -360, maximum: 360, default: 0, step: 1 / 60000 }, reset: 'remove named override or remove preset plus overrides' },
  generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), checks: generatedChecks, packageAudit },
  office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), retained, renderSha256: sha256(renderBytes) },
  failures,
  interpretation: 'A Shape Effects gallery tile is an editable native base, not a ceiling: explicit typed 3-D fields override only named native scene/sp3d fields, omitted fields retain the tile recipe, and reset removes the override without inventing a private slider.',
}
const reportPath = path.join(outDir, 'shape-effect-preset-overrides-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
