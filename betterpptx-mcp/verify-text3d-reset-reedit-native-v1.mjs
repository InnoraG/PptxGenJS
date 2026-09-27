#!/usr/bin/env node
// Native PowerPoint proof for shared text/shape 3-D reset, sparse re-edit, and combination semantics.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-reset-reedit-native/${stamp}`)
const baselinePath = path.join(outDir, 'text3d-reset-reedit-baseline.pptx')
const generatedPath = path.join(outDir, 'text3d-reset-reedit-generated.pptx')
const roundtripPath = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const base3D = { bevel: { type: 'convex', width: 12, height: 9 }, bevelBottom: { type: 'angle', width: 7, height: 5 }, extrusion: 30, extrusionColor: '38BDF8', contourWidth: 5, contourColor: 'F97316', material: 'metal', lightRig: 'threePt', lightDirection: 72, rotationX: 18, rotationY: 22, rotationZ: 9 }
const componentReedit3D = { bevelBottom: { type: 'angle', width: 7, height: 5 }, extrusion: 30, contourWidth: 5, contourColor: 'F97316', material: 'clear', lightRig: 'threePt', lightDirection: 128, rotationX: 18, rotationY: 22, rotationZ: 9 }
const shapeReedit3D = { bevel: { type: 'convex', width: 12, height: 9 }, extrusion: 42, extrusionColor: '38BDF8', contourWidth: 11, contourColor: 'F97316', material: 'clear', lightRig: 'threePt', lightDirection: 144, rotationX: 18, rotationY: 22, rotationZ: 9 }

function makeDeck(state) {
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX native reset/re-edit proof'; pptx.subject = 'Composable text and shape 3-D semantics'; pptx.title = 'Text3D reset and re-edit canary'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
  const slide = pptx.addSlide(); slide.background = { color: '0B1220' }
  slide.addText(state === 'baseline' ? 'Text3D baseline' : 'Text3D component reset then re-edited', { x: 0.7, y: 0.6, w: 12, h: 0.7, objectName: 'text3d-reset-target', fontFace: 'Aptos Display', fontSize: 25, bold: true, color: 'F8FAFC', align: 'center', valign: 'mid', margin: 0, text3D: state === 'baseline' ? base3D : componentReedit3D })
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.9, y: 1.8, w: 5.7, h: 2.2, objectName: 'shape-combination-target', fill: { color: '1D4ED8' }, line: { color: '38BDF8', width: 1.5 }, effect3D: state === 'baseline' ? base3D : shapeReedit3D })
  slide.addText(state === 'baseline' ? 'Text3D full-reset baseline' : 'Text3D full reset (PowerPoint default surface)', { x: 6.9, y: 2.15, w: 5.5, h: 1.2, objectName: 'text3d-full-reset-target', fontFace: 'Aptos', fontSize: 18, bold: true, color: 'D6E4F0', align: 'center', valign: 'mid', margin: 0, ...(state === 'baseline' ? { text3D: { ...base3D, material: 'matte' } } : {}) })
  slide.addNotes(`Native ${state} state. Null component resets are represented by the absence of the removed structured component; sparse re-edits retain unrelated fields.`)
  return pptx
}

await makeDeck('baseline').writeFile({ fileName: baselinePath, compression: false })
await makeDeck('final').writeFile({ fileName: generatedPath, compression: false })

async function audit(filePath) {
  const { stdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), filePath], { maxBuffer: 20 * 1024 * 1024 })
  return JSON.parse(stdout)
}
function objectXml(xml, objectName) {
  const marker = `name="${objectName}"`
  const at = xml.indexOf(marker)
  if (at < 0) return ''
  const start = xml.lastIndexOf('<p:sp', at)
  const end = xml.indexOf('</p:sp>', at)
  return start >= 0 && end > start ? xml.slice(start, end + 7) : xml.slice(Math.max(0, at - 300), at + 300)
}
function attr(xml, tag, name) {
  const found = xml.match(new RegExp(`<a:${tag}\\b[^>]*\\b${name}="([^"]+)"`))
  return found?.[1] ?? null
}
function lightDirectionRev(xml) {
  const lightRig = xml.match(/<a:lightRig\b[\s\S]*?<\/a:lightRig>/)?.[0] || ''
  return attr(lightRig, 'rot', 'rev')
}
function stateFor(xml, objectName) {
  const part = objectXml(xml, objectName)
  return {
    objectName,
    hasScene3d: /<a:scene3d\b/.test(part),
    hasSp3d: /<a:sp3d\b/.test(part),
    hasExtrusionColor: /<a:extrusionClr\b/.test(part),
    hasContourColor: /<a:contourClr\b/.test(part),
    bevel: attr(part, 'bevelT', 'prst'),
    bevelBottom: attr(part, 'bevelB', 'prst'),
    extrusionH: attr(part, 'sp3d', 'extrusionH'),
    contourW: attr(part, 'sp3d', 'contourW'),
    material: attr(part, 'sp3d', 'prstMaterial'),
    lightRig: attr(part, 'lightRig', 'rig'),
    lightDirectionRev: lightDirectionRev(part),
  }
}
async function slideState(filePath) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath), { checkCRC32: true })
  const xml = await zip.file('ppt/slides/slide1.xml').async('string')
  return { text: stateFor(xml, 'text3d-reset-target'), shape: stateFor(xml, 'shape-combination-target'), fullReset: stateFor(xml, 'text3d-full-reset-target') }
}
const baselineAudit = await audit(baselinePath)
const generatedAudit = await audit(generatedPath)
const baselineState = await slideState(baselinePath)
const generatedState = await slideState(generatedPath)

const psPath = generatedPath.replace(/'/g, "''"); const rtPath = roundtripPath.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide-01.png';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=1;png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripState = await slideState(roundtripPath)
const roundtripAudit = await audit(roundtripPath)
const renderSha256 = await fs.readFile(path.join(outDir, 'roundtrip-slide-01.png')).then(sha256)

const transitionRows = [
  { carrier: 'text3D', target: 'text3d-reset-target', reset: ['bevel', 'extrusionColor'], reedited: ['material', 'lightDirection'], preserved: ['bevelBottom', 'extrusion', 'contourWidth', 'contourColor', 'lightRig', 'rotationX', 'rotationY', 'rotationZ'] },
  { carrier: 'text3D', target: 'text3d-full-reset-target', reset: ['text3D'], reedited: [], preserved: [] },
  { carrier: 'shape3D', target: 'shape-combination-target', reset: ['bevelBottom'], reedited: ['material', 'extrusion', 'lightDirection', 'contourWidth'], preserved: ['bevel', 'extrusionColor', 'contourColor', 'lightRig', 'rotationX', 'rotationY', 'rotationZ'] },
]
const failures = []
if (baselineAudit.status !== 'PASS' || baselineAudit.errors?.length) failures.push('baseline package audit failed')
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (roundtripAudit.status !== 'PASS' || roundtripAudit.errors?.length) failures.push('roundtrip package audit failed')
if (office.status !== 'PASS' || office.slideCount !== 1) failures.push('PowerPoint open/SaveCopyAs/reopen failed')
if (!generatedState.text.hasSp3d || generatedState.text.bevel !== null || generatedState.text.hasExtrusionColor || generatedState.text.material !== 'clear' || generatedState.text.lightDirectionRev !== '7680000') failures.push('text component reset/re-edit native state mismatch')
if (generatedState.fullReset.hasSp3d || generatedState.fullReset.hasScene3d) failures.push('full text3D reset did not remove native 3-D components')
if (!generatedState.shape.hasSp3d || generatedState.shape.bevelBottom !== null || !generatedState.shape.hasExtrusionColor || generatedState.shape.material !== 'clear' || generatedState.shape.extrusionH !== '533400' || generatedState.shape.contourW !== '139700' || generatedState.shape.lightDirectionRev !== '8640000') failures.push('shape combination reset/re-edit native state mismatch')
if (!roundtripState.text.hasSp3d || roundtripState.text.material !== 'clear') failures.push('text component state not retained after Office roundtrip')
if (roundtripState.fullReset.hasSp3d || roundtripState.fullReset.hasScene3d) failures.push('full text3D reset not retained after Office roundtrip')
if (!roundtripState.shape.hasSp3d || roundtripState.shape.material !== 'clear') failures.push('shape combination state not retained after Office roundtrip')

const generatedBytes = await fs.readFile(generatedPath); const roundtripBytes = await fs.readFile(roundtripPath)
const report = { schemaVersion: 'betterpptx.global-text3d-reset-reedit-native.v1', status: failures.length ? 'FAIL' : 'PASS', capabilityFamily: 'shape-text-3-d', transitionRows, proof: { sparseComponentReset: generatedState.text.bevel === null && generatedState.text.extrusionColor === undefined, fullComponentReset: !generatedState.fullReset.hasSp3d && !generatedState.fullReset.hasScene3d, shapeCombination: generatedState.shape.bevelBottom === null && generatedState.shape.material === 'clear', nativeSerialization: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNative3D: failures.length === 0, visualRenders: [renderSha256] }, baseline: { file: path.relative(root, baselinePath).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(baselinePath)), audit: baselineAudit, state: baselineState }, generated: { file: path.relative(root, generatedPath).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, state: generatedState }, roundtrip: { file: path.relative(root, roundtripPath).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), audit: roundtripAudit, state: roundtripState, render: { file: path.relative(root, path.join(outDir, 'roundtrip-slide-01.png')).replaceAll('\\', '/'), sha256: renderSha256 } }, office, failures, boundaries: ['Reset semantics are represented by omission of the removed structured component; PowerPoint defaults are not re-invented as synthetic values.', 'Native XML is authoritative for independent bevel-side retention; rendered pixels are a visual canary only.', 'Universal formal closure remains 0/2258.'] }
const reportPath = path.join(outDir, 'text3d-reset-reedit-native-proof.json'); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); const reportBytes = await fs.readFile(reportPath); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8'); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
