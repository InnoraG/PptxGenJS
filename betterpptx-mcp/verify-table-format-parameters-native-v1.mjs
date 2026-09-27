// Native/package/Office proof for table and per-cell formatting controls beyond tiles.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { TABLE_FORMAT_PARAMETERS } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/table-format-parameters-native/${stamp}`)
const generated = path.join(outDir, 'table-format-parameters-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const rows = [
	[{ text: 'Metric', options: { bold: true, color: 'FFFFFF' } }, { text: 'Value', options: { bold: true, color: 'FFFFFF' } }, { text: 'Status', options: { bold: true, color: 'FFFFFF' } }],
	[{ text: 'ARR', options: { fontSize: 15, fill: { color: 'EFF6FF' }, margin: 0.08 } }, { text: '$4.2M', options: { color: '0F766E', bold: true } }, { text: 'On plan', options: { align: 'center', valign: 'middle' } }],
	['NRR', '118%', 'On plan'],
]
const checkpoints = [
	{ id: 'table-flags', label: 'Design flags and dimensions', options: { tableStyleId: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}', headerRow: true, totalRow: true, firstColumn: true, lastColumn: true, bandedRows: true, bandedColumns: false, colW: [1.8, 2.3, 1.9], rowH: [0.42, 0.46, 0.42], fontSize: 13, margin: 0.08 } },
	{ id: 'table-fill-border', label: 'Fill, border, and padding', options: { fill: { color: 'F8FAFC', transparency: 8 }, border: { color: 'CBD5E1', pt: 1.1 }, margin: [0.06, 0.12, 0.06, 0.12], color: '0F172A', fontFace: 'Aptos', fontSize: 12 } },
	{ id: 'table-cell', label: 'Per-cell native overrides', options: { headerRow: true, colW: 2.1, rowH: 0.45, valign: 'middle' } },
	{ id: 'table-merge', label: 'Cell merge controls', options: { headerRow: true, colW: [2, 2, 2], rowH: [0.45, 0.5, 0.5] }, mergeRows: [[{ text: 'Merged metric band', options: { colspan: 2, fill: { color: 'DBEAFE' }, bold: true } }, { text: 'State', options: { fill: { color: 'DBEAFE' }, bold: true } }], ['ARR + NRR', '', 'On plan'], ['NRR', '118%', 'On plan']] },
	{ id: 'table-reset', label: 'Sparse reset and re-edit', options: { headerRow: null, totalRow: null, bandedRows: null, fill: null, border: null, margin: null, colW: null, rowH: null } },
]

const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX table format proof'; pptx.title = 'Native table format parameters'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoint.label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addTable(checkpoint.mergeRows || rows, { x: 2.4, y: 1.25, w: 7.4, h: 3.4, objectName: checkpoint.id, altText: checkpoint.label, autoPage: false, ...checkpoint.options })
	slide.addNotes(`Table format checkpoint ${checkpoint.id}: native Table Design flags plus typed table and cell controls.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort()
const generatedRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await zip.file(slideFiles[index]).async('string')
	generatedRows.push({ slide: index + 1, objectName: xml.includes(`name="${checkpoints[index].id}"`), table: xml.includes('<a:tbl>'), styleInfo: xml.includes('<a:tableStyleId'), grid: xml.includes('<a:tblGrid>') && xml.includes('<a:gridCol'), rowHeights: xml.includes('h="'), cellProperties: /<a:tcPr\b/.test(xml), fills: xml.includes('<a:solidFill>'), borders: xml.includes('<a:lnL') || xml.includes('<a:lnR') || xml.includes('<a:lnT') || xml.includes('<a:lnB'), merge: index === 3 && (xml.includes('gridSpan') || xml.includes('hMerge')) })
}
const generatedChecks = { parameterCatalogComplete: TABLE_FORMAT_PARAMETERS.length >= 30 && TABLE_FORMAT_PARAMETERS.every(item => item.id && item.semanticPath && item.reset), allTablesPresent: generatedRows.every(row => row.objectName && row.table), styleFlagsAndGridNative: generatedRows[0].styleInfo && generatedRows[0].grid, dimensionsNative: generatedRows[0].rowHeights && generatedRows[0].grid, cellPropertiesNative: generatedRows[1].cellProperties && generatedRows[1].fills && generatedRows[1].borders, mergeNative: generatedRows[3].merge, resetCarrierPresent: generatedRows[4].table && generatedRows[4].cellProperties }
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(2).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true }); const roundtripRows = []
for (let index = 0; index < checkpoints.length; index++) { const xml = await roundtripZip.file(slideFiles[index]).async('string'); roundtripRows.push({ slide: index + 1, table: xml.includes('<a:tbl>'), styleInfo: xml.includes('<a:tableStyleId'), grid: xml.includes('<a:gridCol'), cellProperties: /<a:tcPr\b/.test(xml), merge: index === 3 && (xml.includes('gridSpan') || xml.includes('hMerge')) }) }
const roundtripRetained = { allTables: roundtripRows.every(row => row.table), styleAndGrid: roundtripRows[0].styleInfo && roundtripRows[0].grid, cellAndFill: roundtripRows[1].cellProperties, mergeCarrier: roundtripRows[3].merge, resetCarrier: roundtripRows[4].table }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`); if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit'); if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen'); if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-table-format-carriers')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = { schemaVersion: 'betterpptx.global-table-format-parameters.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { source: 'tablePreset plus tableOptions and rows[].options', parameterCount: TABLE_FORMAT_PARAMETERS.length, nativeCarrier: 'a:tbl/a:tblPr/a:tblGrid/a:tcPr', officeBoundary: 'PowerPoint retains native table/style/grid/cell/merge carriers through Open2007/SaveCopyAs/reopen.' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: generatedRows, checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) }, failures, interpretation: 'The table contract exposes existing native table and cell serializer controls as typed parameters. Style selection remains available, while null/omitted options restore the selected style/default.' }
const reportPath = path.join(outDir, 'table-format-parameters-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`); process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
