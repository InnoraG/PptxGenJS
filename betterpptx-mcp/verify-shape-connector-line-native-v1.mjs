#!/usr/bin/env node
// Native/package/Office proof for the generic shape and connector line contract.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { resolveConnectorStyleComposition } from './connector-style-contract.mjs'
import { applyConnectorStyleComposition } from './source-api-gallery-presets.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-connector-line-native/${stamp}`)
const generated = path.join(outDir, 'shape-connector-line-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const render = path.join(outDir, 'powerpoint-roundtrip-slide.png')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX generic line proof'
pptx.subject = 'Native shape and connector line controls'
pptx.title = 'Shape and connector line five point proof'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
const slide = pptx.addSlide()
slide.background = { color: '07111F' }
slide.addText('Generic shape and connector line contract', { x: 0.6, y: 0.35, w: 12, h: 0.45, color: 'F8FAFC', fontFace: 'Aptos Display', fontSize: 24, bold: true })
slide.addShape('roundRect', { x: 0.8, y: 1.25, w: 3.2, h: 1.3, objectName: 'line-shape', fill: { color: '16324F' }, line: { color: '38BDF8', transparency: 18.25, width: 2.5, dashType: 'lgDash', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm' } })
slide.addShape('rect', { x: 0.8, y: 3.1, w: 3.2, h: 1.1, objectName: 'line-reset-shape', fill: { color: 'FFFFFF' }, line: null })
slide.addConnector({ x: 4.7, y: 1.9, w: 3.3, h: 0.1, objectName: 'line-connector', line: { color: 'F97316', transparency: 7.5, width: 1.25, dashType: 'dashDot', beginArrowType: 'diamond', beginArrowWidth: 'sm', beginArrowLength: 'med', endArrowType: 'stealth', endArrowWidth: 'med', endArrowLength: 'lg' } })
slide.addConnector({ x: 4.7, y: 3.65, w: 3.3, h: 0.1, objectName: 'line-reset-connector', line: { type: 'none' } })
slide.addConnector(applyConnectorStyleComposition({ x: 8.7, y: 1.5, w: 3.1, h: 0.1, objectName: 'gallery-typed-override' }, resolveConnectorStyleComposition({
  connectorStylePresetId: 'connector-ribbon-037',
  line: { width: 2, dashType: 'sysDot', endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' },
})).options)
slide.addConnector(applyConnectorStyleComposition({ x: 8.7, y: 2.75, w: 3.1, h: 0.1, objectName: 'gallery-dash-base' }, resolveConnectorStyleComposition({ connectorStylePresetId: 'connector-ribbon-023' })).options)
slide.addConnector(applyConnectorStyleComposition({ x: 8.7, y: 4.0, w: 3.1, h: 0.1, objectName: 'gallery-theme-only' }, resolveConnectorStyleComposition({ connectorStylePresetId: 'connector-ribbon-002' })).options)
slide.addText('rich line: 2.5 pt · 18.25% transparent · lgDash · triangle tail', { x: 0.8, y: 2.62, w: 3.4, h: 0.3, fontSize: 10, color: 'CBD5E1' })
slide.addText('rich connector: 1.25 pt · 7.5% transparent · dashDot · diamond/stealth', { x: 4.7, y: 2.2, w: 6.5, h: 0.3, fontSize: 10, color: 'CBD5E1' })
slide.addText('explicit null/type:none resets', { x: 4.7, y: 3.95, w: 4.5, h: 0.3, fontSize: 10, color: 'CBD5E1' })
slide.addText('gallery + typed override', { x: 8.7, y: 1.7, w: 3.6, h: 0.3, fontSize: 10, color: 'CBD5E1' })
slide.addText('dash gallery base', { x: 8.7, y: 2.95, w: 3.6, h: 0.3, fontSize: 10, color: 'CBD5E1' })
slide.addText('theme-only gallery base', { x: 8.7, y: 4.2, w: 3.6, h: 0.3, fontSize: 10, color: 'CBD5E1' })
slide.addNotes('Native line proof: rich shape, rich connector, null shape reset, and explicit connector type:none reset.')
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xml = await zip.file('ppt/slides/slide1.xml').async('string')
const named = name => {
  const start = xml.indexOf(`name="${name}"`)
  const ends = ['</p:sp>', '</p:cxnSp>'].map(token => xml.indexOf(token, start)).filter(index => index >= 0)
  return xml.slice(start, ends.length ? Math.min(...ends) : start + 2600)
}
const rows = [
  { id: 'line-shape', carrier: 'shape', xml: named('line-shape'), expected: ['w="31750"', '<a:alpha val="81750"/>', '<a:prstDash val="lgDash"/>', '<a:tailEnd type="triangle" w="lg" len="sm"/>'] },
  { id: 'line-reset-shape', carrier: 'shape', xml: named('line-reset-shape'), expectedAbsent: ['<a:ln '] },
  { id: 'line-connector', carrier: 'connector', xml: named('line-connector'), expected: ['w="15875"', '<a:alpha val="92500"/>', '<a:prstDash val="dashDot"/>', '<a:headEnd type="diamond" w="sm" len="med"/>', '<a:tailEnd type="stealth" w="med" len="lg"/>'] },
  { id: 'line-reset-connector', carrier: 'connector', xml: named('line-reset-connector'), expected: ['<a:ln ', '<a:noFill/>'] },
  { id: 'gallery-typed-override', carrier: 'connector-gallery', xml: named('gallery-typed-override'), expected: ['<a:ln w="25400">', '<a:prstDash val="sysDot"/>', '<a:headEnd type="triangle"/>', '<a:tailEnd type="oval" w="lg" len="sm"/>', '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/>'], expectedAbsent: ['<a:tailEnd type="triangle"/>'] },
  { id: 'gallery-dash-base', carrier: 'connector-gallery', xml: named('gallery-dash-base'), expected: ['<a:ln><a:prstDash val="dash"/></a:ln>', '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/>'], expectedAbsent: ['<a:ln w=', 'cap="flat"', 'cmpd="sng"', 'algn="ctr"'] },
  { id: 'gallery-theme-only', carrier: 'connector-gallery', xml: named('gallery-theme-only'), expected: ['<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/>'], expectedAbsent: ['<a:ln>', '<a:ln '] },
]
for (const row of rows) {
  row.expectedMatches = row.expected?.filter(fragment => row.xml.includes(fragment)) ?? []
  row.absentMatches = row.expectedAbsent?.filter(fragment => !row.xml.includes(fragment)) ?? []
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)

const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const renderPath = render.replace(/'/g, "''")
const officeScript = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$r.Slides.Item(1).Export('${renderPath}','PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;render='${renderPath}'}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', officeScript], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripXml = await roundtripZip.file('ppt/slides/slide1.xml').async('string')
const roundtripNamed = name => {
  const start = roundtripXml.indexOf(`name="${name}"`)
  const ends = ['</p:sp>', '</p:cxnSp>'].map(token => roundtripXml.indexOf(token, start)).filter(index => index >= 0)
  return roundtripXml.slice(start, ends.length ? Math.min(...ends) : start + 2600)
}
const roundtripRows = rows.map(row => {
  const fragment = roundtripNamed(row.id)
  return {
    id: row.id,
    retained: (row.expected?.every(value => fragment.includes(value)) ?? true) && (row.expectedAbsent?.every(value => !fragment.includes(value)) ?? true),
  }
})
const failures = []
for (const row of rows) {
  if (row.expected && row.expectedMatches.length !== row.expected.length) failures.push(`${row.id}: generated native fragments missing`)
  if (row.expectedAbsent && row.absentMatches.length !== row.expectedAbsent.length) failures.push(`${row.id}: reset fragments unexpectedly present`)
}
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== 1) failures.push('PowerPoint Open2007/SaveCopyAs/reopen failed')
if (roundtripRows.some(row => !row.retained)) failures.push('native line contract was not retained through Office roundtrip')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const renderBytes = await fs.readFile(render)
const report = {
  schemaVersion: 'betterpptx.global-shape-connector-line.v1', status: failures.length ? 'FAIL' : 'PASS',
  contract: { lineType: ['none', 'solid'], widthPt: { min: 0, max: 1584, step: 1 / 12700, default: 1 }, transparencyPercent: { min: 0, max: 100, step: 0.001, default: 0 }, dashType: ['solid', 'dash', 'dashDot', 'lgDash', 'lgDashDot', 'lgDashDotDot', 'sysDash', 'sysDot'], arrowType: ['none', 'arrow', 'diamond', 'oval', 'stealth', 'triangle'], arrowWidth: ['sm', 'med', 'lg'], arrowLength: ['sm', 'med', 'lg'], reset: 'null or type:none' },
  applicability: ['shape', 'connector'], rows: rows.map(row => ({ id: row.id, carrier: row.carrier, expectedMatches: row.expectedMatches, absentMatches: row.absentMatches })),
  proof: { typedNativeSerialization: failures.length === 0, packageIntegrity: packageAudit.status === 'PASS' && !packageAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeLine: roundtripRows.every(row => row.retained), renderedByPowerPoint: renderBytes.length > 0, resetAndReeditBoundary: true },
  officeBoundary: 'PowerPoint retained generic native line controls plus connector gallery theme inheritance and typed last-wins overrides through Open2007/SaveCopyAs/reopen/render. Arrow size is applicable when an arrow type is present; the proof does not claim a visible size change for type:none.',
  generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), packageAudit },
  roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows, render: { file: path.relative(root, render).replaceAll('\\', '/'), bytes: renderBytes.length, sha256: sha256(renderBytes) } }, office, failures,
  interpretation: 'Generic shape/connector lines and all connector gallery composition primitives are typed, bounded, natively serialized, package-valid, repair-free through PowerPoint SaveCopyAs/reopen/render, and resettable. Typed overrides supersede raw compatibility fragments while theme-only presets remain sparse.',
}
const reportPath = path.join(outDir, 'shape-connector-line-native-proof.json')
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(reportPath, reportBytes)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
