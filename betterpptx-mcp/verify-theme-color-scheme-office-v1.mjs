#!/usr/bin/env node
// Native + PowerPoint SaveCopyAs/reopen proof for all twelve theme color roles.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/theme-color-scheme-office/${stamp}`)
const generated = path.join(outDir, 'theme-color-scheme-office-generated.pptx')
const roundtrip = path.join(outDir, 'theme-color-scheme-office-savecopyas.pptx')
const render = path.join(outDir, 'theme-color-scheme-office-roundtrip.png')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const slots = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
const scheme = { dk1: '0B1220', lt1: 'F8FAFC', dk2: '1E293B', lt2: 'E2E8F0', accent1: '38BDF8', accent2: 'A78BFA', accent3: '34D399', accent4: 'F59E0B', accent5: 'FB7185', accent6: '22D3EE', hlink: '0284C7', folHlink: '7C3AED' }
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', palette: scheme }
const slide = pptx.addSlide()
slide.background = { color: scheme.dk1 }
slide.addText('Theme color scheme: all twelve native roles', { x: 0.7, y: 0.55, w: 12, h: 0.55, fontFace: 'Aptos Display', fontSize: 25, bold: true, color: scheme.lt1 })
slots.slice(4, 10).forEach((slot, index) => slide.addShape('roundRect', { x: 0.8 + (index % 3) * 2.1, y: 1.7 + Math.floor(index / 3) * 1.35, w: 1.65, h: 0.8, objectName: `theme-${slot}`, fill: { color: scheme[slot] }, line: { color: scheme[slot], width: 1 } }))
slide.addText(slots.map(slot => `${slot}=${scheme[slot]}`).join(' · '), { x: 0.8, y: 5.2, w: 11.8, h: 0.55, fontSize: 11, color: scheme.lt2, fit: 'shrink' })
await pptx.writeFile({ fileName: generated, compression: false })

const generatedZip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const generatedTheme = await generatedZip.file('ppt/theme/theme1.xml').async('string')
const readTheme = xml => Object.fromEntries(slots.map(slot => [slot, (xml.match(new RegExp(`<a:${slot}[^>]*>[\\s\\S]*?<a:srgbClr[^>]*val="([0-9A-Fa-f]{6})"`)) || [])[1]?.toUpperCase() || null]))
const generatedSlots = readTheme(generatedTheme)

const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const renderPath = render.replace(/'/g, "''")
const officeScript = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$false,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$r.Slides.Item(1).Export('${renderPath}','PNG',1600,900);[ordered]@{status='PASS';officeVersion=[string]$pp.Version;slideCount=[int]$r.Slides.Count;method='Presentations.Open2007';openAndRepair=$false;renderExists=(Test-Path '${renderPath}')}|ConvertTo-Json -Depth 5}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', officeScript], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())

const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripTheme = await roundtripZip.file('ppt/theme/theme1.xml').async('string')
const roundtripSlots = readTheme(roundtripTheme)
const generatedMatches = slots.every(slot => generatedSlots[slot] === scheme[slot])
const roundtripMatches = slots.every(slot => roundtripSlots[slot] === scheme[slot])
const renderBytes = await fs.readFile(render)
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const checks = {
  generatedPackageReadable: true,
  allTwelveGenerated: generatedMatches,
  repairFreeOfficeOpen: office.status === 'PASS' && office.method === 'Presentations.Open2007' && office.openAndRepair === false,
  saveCopyAsReopen: office.status === 'PASS' && office.slideCount === 1,
  allTwelveRetainedAfterOffice: roundtripMatches,
  roundtripRender: office.renderExists === true && renderBytes.length > 0,
  noPrivatePathsInTheme: !generatedTheme.includes('PptxGenJS_Claude') && !roundtripTheme.includes('PptxGenJS_Claude'),
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const report = {
  schemaVersion: 'betterpptx.native-theme-color-scheme-office-proof.v1', status, generatedAt: new Date().toISOString(),
  contract: { slots, values: scheme, reset: 'null or omission restores the default/theme inheritance contract', applicability: 'theme color scheme roles used by native fills, lines, text, and effects' },
  checks, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), slots: generatedSlots },
  office, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), slots: roundtripSlots },
  render: { file: path.relative(root, render).replaceAll('\\', '/'), bytes: renderBytes.length, sha256: sha256(renderBytes) },
  interpretation: status === 'PASS' ? 'All twelve authored theme color roles serialized as native theme slots, survived repair-disabled PowerPoint Open2007 plus SaveCopyAs/reopen, and produced a roundtrip render. This closes the Office retention boundary for the generic theme color scheme contract.' : 'At least one theme slot or Office proof check failed.',
}
const reportPath = path.join(outDir, 'theme-color-scheme-office-proof.json')
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(reportPath, reportBytes)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, renderSha256: report.render.sha256, checks }, null, 2) + '\n')
if (status !== 'PASS') process.exitCode = 1
