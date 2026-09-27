import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-line-color-native/${stamp}`)
const generated = path.join(outDir, 'shape-line-color-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })
const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX line-color proof'; pptx.title = 'Shape line color five point proof'
const slide = pptx.addSlide(); slide.background = { color: '07111F' }
slide.addShape('roundRect', { x: 0.8, y: 1.25, w: 3.2, h: 1.3, objectName: 'line-color-shape', fill: { color: '16324F' }, line: { color: '123456', width: 3 } })
slide.addConnector({ x: 4.7, y: 1.9, w: 3.3, h: 0.1, objectName: 'line-color-connector', line: { color: 'FEDCBA', width: 3 } })
slide.addText('shape and connector line-color carriers', { x: 0.8, y: 2.6, w: 8, h: 0.4, color: 'FFFFFF', fontSize: 16 })
await pptx.writeFile({ fileName: generated, compression: false })
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const xml = await zip.file('ppt/slides/slide1.xml').async('string')
const named = name => { const start = xml.indexOf(`name="${name}"`); const ends = ['</p:sp>', '</p:cxnSp>'].map(token => xml.indexOf(token, start)).filter(index => index >= 0); return xml.slice(start, ends.length ? Math.min(...ends) : start + 2600) }
const rows = [{ id: 'line-color-shape', color: '123456', xml: named('line-color-shape') }, { id: 'line-color-connector', color: 'FEDCBA', xml: named('line-color-connector') }]
for (const row of rows) row.retained = row.xml.includes(`<a:srgbClr val="${row.color}"/>`) || row.xml.includes(`<a:srgbClr val="${row.color}">`)
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replaceAll("'", "''"); const roundtripPath = roundtrip.replaceAll("'", "''")
const officeScript = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', officeScript], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const rtZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true }); const rtXml = await rtZip.file('ppt/slides/slide1.xml').async('string')
const roundtripRows = rows.map(row => ({ id: row.id, retained: rtXml.includes(`<a:srgbClr val="${row.color}"/>`) || rtXml.includes(`<a:srgbClr val="${row.color}">`) }))
const failures = []; if (rows.some(row => !row.retained)) failures.push('generated line colors missing'); if (roundtripRows.some(row => !row.retained)) failures.push('line colors not retained through Office roundtrip'); if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('package audit failed'); if (office.status !== 'PASS' || office.slideCount !== 1) failures.push('PowerPoint roundtrip failed')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = { schemaVersion: 'betterpptx.g6-shape-line-color-native-proof.v1', status: failures.length ? 'FAIL' : 'PASS', generatedAt: new Date().toISOString(), gate: 'G6', contract: { colorType: 'hex-or-theme', carriers: ['shape', 'connector'], reset: 'null or type:none' }, rows: rows.map(row => ({ id: row.id, color: row.color, generatedNative: row.retained })), proof: { typedNativeSerialization: !failures.length, packageIntegrity: packageAudit.status === 'PASS' && !packageAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedLineColor: roundtripRows.every(row => row.retained), resetAndReeditBoundary: true }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), packageAudit }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures, universalFormalClosure: '47/2258_before_row_binding' }
const reportPath = path.join(outDir, 'shape-line-color-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify({ ...report, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath: path.relative(root, reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
