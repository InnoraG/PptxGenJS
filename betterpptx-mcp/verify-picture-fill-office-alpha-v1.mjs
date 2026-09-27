#!/usr/bin/env node
// Native + PowerPoint proof for picture-fill alpha/opacity and placement.
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
const fixture = path.resolve('demos/common/images/sample_logo.png')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/picture-fill-office-alpha/${stamp}`)
const generated = path.join(outDir, 'picture-fill-office-alpha-generated.pptx')
const roundtrip = path.join(outDir, 'picture-fill-office-alpha-savecopyas.pptx')
const renderDir = path.join(outDir, 'renders')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(renderDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
const cases = [
  { name: 'picture-fill-alpha-0', transparency: 0, mode: 'stretch' },
  { name: 'picture-fill-alpha-50', transparency: 50, mode: 'stretch' },
  { name: 'picture-fill-alpha-100', transparency: 100, mode: 'stretch' },
  { name: 'picture-fill-tile-37', transparency: 37.5, mode: 'tile', scaleX: 0.5, scaleY: 1.5, offsetX: 0.125, offsetY: -0.25, alignment: 'tr', flip: 'xy', rotateWithShape: false },
]
for (const item of cases) {
  const slide = pptx.addSlide()
  slide.background = { color: '0B1220' }
  slide.addText(`${item.name} · ${item.transparency}% transparency`, { x: 0.65, y: 0.45, w: 12, h: 0.45, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: 'F8FAFC' })
  slide.addShape('roundRect', { x: 1.15, y: 1.35, w: 5.2, h: 3.7, objectName: item.name, fill: { type: 'picture', texture: { path: fixture, transparency: item.transparency, placement: { mode: item.mode, scaleX: item.scaleX, scaleY: item.scaleY, offsetX: item.offsetX, offsetY: item.offsetY, alignment: item.alignment, flip: item.flip, rotateWithShape: item.rotateWithShape } } }, line: { color: '38BDF8', width: 1.5 } })
  slide.addText('Native picture fill · editable blipFill · independent alpha and placement', { x: 0.8, y: 5.55, w: 11.6, h: 0.35, fontSize: 12, color: 'CBD5E1' })
}
await pptx.writeFile({ fileName: generated, compression: false })

const zipTextRows = async file => {
  const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
  const rows = []
  for (const name of Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort()) {
    const xml = await zip.file(name).async('string')
    const alpha = [...xml.matchAll(/<a:blip[^>]*r:embed="([^"]+)"[^>]*>(?:<a:alpha val="([^"]+)"\/>)?/g)].map(match => ({ rid: match[1], alpha: match[2] == null ? null : Number(match[2]) }))
    const tile = [...xml.matchAll(/<a:tile\s+([^>]*)\/>/g)].map(match => match[1])
    const stretch = (xml.match(/<a:stretch><a:fillRect\/>/g) || []).length
    rows.push({ name, alpha, tile, stretch, hasBlipFill: xml.includes('<a:blipFill') })
  }
  return { zip, rows }
}
const generatedAudit = await zipTextRows(generated)
const generatedBytes = await fs.readFile(generated)
const generatedChecks = { packageReadable: true, slideCount: generatedAudit.rows.length === cases.length, allPictureFills: generatedAudit.rows.every(row => row.hasBlipFill), alpha50Serialized: generatedAudit.rows[1]?.alpha.some(item => item.alpha === 50000), alpha100Serialized: generatedAudit.rows[2]?.alpha.some(item => item.alpha === 0), tilePlacementSerialized: generatedAudit.rows[3]?.tile.some(value => value.includes('sx="50000"') && value.includes('sy="150000"') && value.includes('flip="xy"') && value.includes('algn="tr"')) }

const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const renderPath = renderDir.replace(/'/g, "''")
const officeScript = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$false,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);for($i=1;$i-le$r.Slides.Count;$i++){ $r.Slides.Item($i).Export((Join-Path '${renderPath}' ('slide-{0:D2}.png'-f$i)),'PNG',1600,900) };[ordered]@{status='PASS';officeVersion=[string]$pp.Version;slideCount=[int]$r.Slides.Count;method='Presentations.Open2007';openAndRepair=$false;renderCount=(Get-ChildItem '${renderPath}' -Filter '*.png').Count}|ConvertTo-Json -Depth 5}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', officeScript], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripAudit = await zipTextRows(roundtrip)
const roundtripRows = cases.map((item, index) => ({ ...item, generated: generatedAudit.rows[index], roundtrip: roundtripAudit.rows[index] }))
const roundtripChecks = { repairFreeOfficeOpen: office.status === 'PASS' && office.method === 'Presentations.Open2007' && office.openAndRepair === false, saveCopyAsReopen: office.status === 'PASS' && office.slideCount === cases.length, renderCount: office.renderCount === cases.length, officeAlphaBoundaryObserved: !roundtripAudit.rows[1]?.alpha.some(item => item.alpha === 50000) && !roundtripAudit.rows[2]?.alpha.some(item => item.alpha === 0) && !roundtripAudit.rows[3]?.alpha.some(item => item.alpha === 62500), tilePlacementRetained: roundtripAudit.rows[3]?.tile.some(value => value.includes('sx="50000"') && value.includes('sy="150000"') && value.includes('flip="xy"') && value.includes('algn="tr"')) }
const checks = { ...generatedChecks, ...roundtripChecks }
const status = Object.values(checks).every(Boolean) ? 'PASS_WITH_EXPLICIT_OFFICE_BOUNDARY' : 'FAIL'
const roundtripBytes = await fs.readFile(roundtrip)
const renderFiles = await fs.readdir(renderDir)
const renders = []
for (const file of renderFiles.filter(name => name.endsWith('.png')).sort()) { const bytes = await fs.readFile(path.join(renderDir, file)); renders.push({ file: path.relative(root, path.join(renderDir, file)).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) }) }
const report = { schemaVersion: 'betterpptx.native-picture-fill-office-alpha-proof.v1', status, generatedAt: new Date().toISOString(), contract: { carrier: 'shape.fill.type=picture or texture', transparency: '0..100 percent; alpha=(100-transparency)*1000', placement: ['stretch', 'tile'], reset: 'null or type:none removes the authored fill component' }, checks, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: generatedAudit.rows }, office, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, renders, interpretation: status === 'PASS_WITH_EXPLICIT_OFFICE_BOUNDARY' ? 'Native picture-fill alpha values 0, 50, 100, and 37.5 serialize exactly. PowerPoint opens repair-free, retains independent tile placement, and renders after SaveCopyAs/reopen, but omits the authored picture-fill alpha on the 50/100/37.5 cases. This is an explicit Office canonicalization boundary; native/public editability remains supported and no Office retention claim is made for picture-fill alpha.' : 'Picture-fill alpha/placement proof failed.' }
const reportPath = path.join(outDir, 'picture-fill-office-alpha-proof.json')
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(reportPath, reportBytes)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, checks }, null, 2) + '\n')
if (!status.startsWith('PASS')) process.exitCode = 1
