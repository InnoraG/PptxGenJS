#!/usr/bin/env node

// Family-boundary proof for the first nine native shape-style gallery rows.
// The gallery selector is tested as an editable native carrier; explicit typed
// fill/line overrides and null reset remain owned by the shared style contract.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'

import { applyNativeStylePreset } from './native-style-presets.mjs'
const matrix = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/preset-decomposition-matrix.json'), 'utf8'))
const ledger = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/universal-row-closure-ledger.json'), 'utf8'))
const closureBefore = ledger.formalClosedRows.length

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-shape-style-row-batch/${stamp}`)
const generated = path.join(outDir, 'shape-style-row-batch-source.pptx')
const authored = path.join(outDir, 'shape-style-row-batch-office-authored.pptx')
const roundtrip = path.join(outDir, 'shape-style-row-batch-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const rel = file => path.relative(root, file).replaceAll('\\', '/')
const startIndex = Number(process.argv.includes('--start') ? process.argv[process.argv.indexOf('--start') + 1] : 1) || 1
const styleIds = Array.from({ length: 9 }, (_, i) => `shape-style-${String(startIndex + i).padStart(3, '0')}`)
const rowEntries = styleIds.map(styleId => matrix.catalogRows.find(row => row.label?.endsWith(`-> ${styleId}`) && row.family === 'shapes-gradients' && row.capabilityStatus === 'executable-exact-structured'))
const rowIds = rowEntries.map(row => row?.id)
const expectedLabels = rowEntries.map(row => row?.label)

await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX shape-style row batch proof'
pptx.title = 'Native shape-style row batch'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const [index, styleId] of styleIds.entries()) {

	const slide = pptx.addSlide()
	slide.background = { color: '07111F' }
	slide.addText(`Native ${styleId}`, { x: 0.7, y: 0.35, w: 12, h: 0.4, color: 'F8FAFC', fontSize: 22, bold: true })
	const style = applyNativeStylePreset({}, styleId).style
	slide.addShape('roundRect', {
		...style,
		x: 2.1,
		y: 1.25,
		w: 9.2,
		h: 3.1,
		objectName: `shape-style-row-${index + 1}`,
		text: `Editable ${styleId}`,
		fontFace: 'Aptos Display',
		fontSize: 28,
		bold: true,
		color: 'F8FAFC',
		align: 'center',
		valign: 'mid',
	})
	slide.addText('Gallery selector is a native base; typed overrides remain independent.', { x: 1.3, y: 5.05, w: 10.8, h: 0.35, color: 'CBD5E1', fontSize: 13, align: 'center' })
	slide.addNotes('[Sources]\nBetterPPTX frozen native shape-style gallery package evidence.\n[/Sources]')
}
await pptx.writeFile({ fileName: generated, compression: false })

const generatedBytes = await fs.readFile(generated)
const zip = await JSZip.loadAsync(generatedBytes, { checkCRC32: true })
const generatedRows = []
for (let i = 0; i < styleIds.length; i++) {
	const xml = await zip.file(`ppt/slides/slide${i + 1}.xml`).async('string')
	const marker = `shape-style-row-${i + 1}`
	const start = xml.indexOf(`name="${marker}"`)
	const end = xml.indexOf('</p:sp>', start)
	const shapeXml = xml.slice(start, end >= 0 ? end : start + 16000)
	const preset = applyNativeStylePreset({}, styleIds[i]).style
	const raw = preset._rawShapeStyleXml || ''
	const scheme = raw.match(/<a:schemeClr val="([^"]+)"/i)?.[1] || null
	generatedRows.push({
		slide: i + 1,
		styleId: styleIds[i],
		shapeName: marker,
		shapeStylePresent: /<p:style/.test(shapeXml),
		schemeColor: scheme,
		canonicalPayloadHash: sha256(Buffer.from(raw)),
		textPresent: shapeXml.includes(`Editable ${styleIds[i]}`),
	})
}

const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)

const esc = value => value.replace(/'/g, "''")
const generatedPath = esc(generated)
const authoredPath = esc(authored)
const roundtripPath = esc(roundtrip)
const renderDir = esc(outDir)
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$false,$false,$false,$false);$requested=@(1,2,3,4,5,6,7,8,9);$auth=@();for($i=1;$i -le $requested.Count;$i++){$shape=$p.Slides.Item($i).Shapes.Item(2);$shape.ShapeStyle=[int]$requested[$i-1];$auth+=[ordered]@{slide=$i;requested=[int]$requested[$i-1];actual=[int]$shape.ShapeStyle;shapeName=$shape.Name}};$p.SaveAs('${authoredPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${authoredPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $requested.Count;$i++){$shape=$r.Slides.Item($i).Shapes.Item(2);$png='${renderDir}\\office-slide-'+('{0:D2}' -f $i)+'.png';$r.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;requested=[int]$requested[$i-1];actual=[int]$shape.ShapeStyle;shapeName=$shape.Name;png=$png}};$r.SaveCopyAs('${roundtripPath}',24);$r.Close();$r=$null;[ordered]@{status='PASS';officeVersion=$pp.Version;slideCount=$rows.Count;authoredRows=$auth;reopenRows=$rows}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const officeRows = office.reopenRows || []
const officeExact = officeRows.length === styleIds.length && officeRows.every(row => row.actual === row.requested)
const rendered = officeRows.filter(row => typeof row.png === 'string' && fsSync.existsSync(row.png) && fsSync.statSync(row.png).size > 0)
const roundtripBytes = await fs.readFile(roundtrip)
const roundtripZip = await JSZip.loadAsync(roundtripBytes, { checkCRC32: true })
const roundtripRows = []
for (let i = 0; i < styleIds.length; i++) {
	const xml = await roundtripZip.file(`ppt/slides/slide${i + 1}.xml`).async('string')
	const start = xml.indexOf(`name="shape-style-row-${i + 1}"`)
	const end = xml.indexOf('</p:sp>', start)
	const shapeXml = xml.slice(start, end >= 0 ? end : start + 16000)
	roundtripRows.push({ slide: i + 1, styleId: styleIds[i], shapeStylePresent: /<p:style/.test(shapeXml) })
}

const checks = {
	rowCount: generatedRows.length === styleIds.length,
	frozenCatalogFamily: rowIds.every((id, i) => matrix.catalogRows.find(row => row.id === id)?.family === 'shapes-gradients' && matrix.catalogRows.find(row => row.id === id)?.label === expectedLabels[i] && matrix.catalogRows.find(row => row.id === id)?.capabilityStatus === 'executable-exact-structured'),
	allNativeShapeStyleCarriers: generatedRows.every(row => row.shapeStylePresent && row.canonicalPayloadHash.length === 64),
	allDistinctPayloads: new Set(generatedRows.map(row => row.canonicalPayloadHash)).size === styleIds.length,
	packageIntegrity: packageAudit.status === 'PASS' && !(packageAudit.errors || []).length,
	officeAuthoredSetters: office.authoredRows?.length === styleIds.length,
	officeSaveCopyAsReopen: office.status === 'PASS' && office.slideCount === styleIds.length,
	officeRetainedShapeStyleIndices: officeExact,
	renderedNineNonEmpty: rendered.length === styleIds.length,
	roundtripNativeCarriers: roundtripRows.every(row => row.shapeStylePresent),
}
const status = Object.values(checks).every(Boolean) ? 'PASS_FORMALLY_CLOSED' : 'FAIL'
const report = {
	schemaVersion: 'betterpptx.g6-shape-style-row-batch-proof.v1',
	status,
	generatedAt: new Date().toISOString(),
	gate: 'G6',
	batch: { family: 'shapes-gradients', contribution: status === 'PASS_FORMALLY_CLOSED' ? `${styleIds.length}/2258` : '0/2258', controls: styleIds },
	contract: { selector: 'shapeStylePresetId', carrier: 'p:style', reset: 'set shapeStylePresetId to null and remove explicit style components', applicability: ['shape', 'connector-compatible style carrier'] },
	checks,
	rows: generatedRows.map((row, i) => ({ ...row, catalogRowId: rowIds[i], catalogLabel: expectedLabels[i], office: officeRows[i], roundtrip: roundtripRows[i], renderSha256: rendered[i] ? sha256(fsSync.readFileSync(rendered[i].png)) : null })),
	artifacts: { generated: rel(generated), authored: rel(authored), roundtrip: rel(roundtrip), generatedSha256: sha256(generatedBytes), authoredSha256: fsSync.existsSync(authored) ? sha256(fsSync.readFileSync(authored)) : null, roundtripSha256: sha256(roundtripBytes), packageAudit: packageAudit.status },
	office: { version: office.officeVersion, slideCount: office.slideCount, authoredRows: office.authoredRows, reopenRows: office.reopenRows },
	policy: 'Promotion requires one row-specific native carrier, package, Office-authored mutation, SaveCopyAs/reopen retention, and visual render witness for every frozen row. Gallery selectors remain independent from typed override parameters and component reset.',
	universalFormalClosure: `${status === 'PASS_FORMALLY_CLOSED' ? closureBefore + styleIds.length : closureBefore}/2258`,
}
const out = path.join(outDir, 'g6-shape-style-row-batch-proof.json')
await fs.writeFile(out, `${JSON.stringify({ ...report, reportPath: rel(out) }, null, 2)}\n`)
const reportSha256 = sha256(await fs.readFile(out))
await fs.writeFile(`${out}.sha256`, `${reportSha256}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ status, reportPath: rel(out), reportSha256, checks, universalFormalClosure: report.universalFormalClosure }, null, 2))
if (status !== 'PASS_FORMALLY_CLOSED') process.exitCode = 1
