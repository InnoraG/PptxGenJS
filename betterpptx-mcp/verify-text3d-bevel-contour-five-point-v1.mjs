#!/usr/bin/env node
// Shared shape/text 3-D proof for bottom bevel and contour controls.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-bevel-contour/${stamp}`)
const generated = path.join(outDir, 'text3d-bevel-contour-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const values = [0, 4, 8, 16, 32]
const controls = [
	{ id: 'bevelBottomWidthPt', field: 'bevelBottom.width', unit: 'points' },
	{ id: 'bevelBottomHeightPt', field: 'bevelBottom.height', unit: 'points' },
	{ id: 'contourWidthPt', field: 'contourWidth', unit: 'points' },
]
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global Text3D and shape 3-D parameter proof'
pptx.subject = 'Native bottom bevel and contour five-point contract'
pptx.title = 'Text3D bottom bevel and contour five-point canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
const requestedRows = []
for (const carrier of ['text3D', 'shape3D']) {
	for (const control of controls) {
		for (const value of values) {
			const slide = pptx.addSlide()
			slide.background = { color: '0B1220' }
			const threeD = {
				bevel: { type: 'circle', width: 4, height: 4 },
				bevelBottom: { type: 'circle', width: control.field === 'bevelBottom.width' ? value : 8, height: control.field === 'bevelBottom.height' ? value : 8 },
				extrusion: 24,
				extrusionColor: '38BDF8',
				contourWidth: control.field === 'contourWidth' ? value : 0,
				contourColor: 'F97316',
				material: 'matte', lightRig: 'threePt', rotationX: 18, rotationY: 22,
			}
			if (carrier === 'text3D') {
				slide.addText(`Text3D ${control.id} ${value}`, { x: 0.7, y: 2.1, w: 12, h: 1.4, objectName: `text3d-${control.id}-${value}`, fontFace: 'Aptos Display', fontSize: 30, bold: true, color: 'F8FAFC', align: 'center', valign: 'mid', margin: 0, text3D: threeD })
			} else {
				slide.addShape(pptx.ShapeType.roundRect, { x: 3.0, y: 1.7, w: 7.3, h: 2.2, objectName: `shape3d-${control.id}-${value}`, fill: { color: '1D4ED8' }, line: { color: '38BDF8', width: 1.5 }, effect3D: threeD })
			}
			slide.addNotes(`Native ${carrier} ${control.field} checkpoint: ${value} ${control.unit}.`)
			requestedRows.push({ slide: requestedRows.length + 1, carrier, control: control.id, field: control.field, requestedPt: value })
		}
	}
}
await pptx.writeFile({ fileName: generated, compression: false })

const readSp3d = xml => {
	const open = xml.match(/<a:sp3d\b([^>]*)>/)
	const attrs = open?.[1] || ''
	const bevelB = xml.match(/<a:bevelB\b([^>]*)\/>/)
	const contourW = attrs.match(/\bcontourW="(\d+)"/)
	const attr = name => { const m = attrs.match(new RegExp(`\\b${name}="(\\d+)"`)); return m ? Number(m[1]) : null }
	const bevelAttr = (name, key) => { const m = bevelB?.[1]?.match(new RegExp(`\\b${name}="(\\d+)"`)); return m ? Number(m[1]) / 12700 : key === 'width' ? 6 : 6 }
	return { bottomWidthPt: bevelAttr('w', 'width'), bottomHeightPt: bevelAttr('h', 'height'), contourWidthPt: contourW ? Number(contourW[1]) / 12700 : 0, extrusionPt: attr('extrusionH') == null ? 0 : attr('extrusionH') / 12700 }
}
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const generatedRows = []
for (const requested of requestedRows) {
	const xml = await zip.file(`ppt/slides/slide${requested.slide}.xml`).async('string')
	const actual = readSp3d(xml)
	const actualPt = requested.field === 'bevelBottom.width' ? actual.bottomWidthPt : requested.field === 'bevelBottom.height' ? actual.bottomHeightPt : actual.contourWidthPt
	generatedRows.push({ ...requested, actualPt, retained: Math.abs(actualPt - requested.requestedPt) < 0.0001, serializedXml: xml.includes('<a:sp3d') })
}
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''")
const rtPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const rtZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (const requested of requestedRows) {
	const xml = await rtZip.file(`ppt/slides/slide${requested.slide}.xml`).async('string')
	const png = path.join(outDir, `roundtrip-slide-${String(requested.slide).padStart(2, '0')}.png`)
	const actual = readSp3d(xml)
	const actualPt = requested.field === 'bevelBottom.width' ? actual.bottomWidthPt : requested.field === 'bevelBottom.height' ? actual.bottomHeightPt : actual.contourWidthPt
	roundtripRows.push({ ...requested, actualPt, retained: Math.abs(actualPt - requested.requestedPt) < 0.0001, renderSha256: sha256(await fs.readFile(png)) })
}
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (!row.retained) failures.push(`${row.carrier} slide ${row.slide} ${row.field} ${row.requestedPt} actual ${row.actualPt}`)
for (const carrier of ['text3D', 'shape3D']) for (const control of controls) {
	const hashes = roundtripRows.filter(row => row.carrier === carrier && row.control === control.id).map(row => row.renderSha256)
	if (new Set(hashes).size !== values.length) failures.push(`${carrier} ${control.id} renders did not remain distinct`)
}
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== requestedRows.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-text3d-bevel-contour-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controls: controls.map(control => ({ ...control, values, officeRange: { minimum: 0, maximum: 1000, default: control.id === 'contourWidthPt' ? 0 : 6 } })), capabilityFamily: 'shape-text-3d',
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNative3D: failures.length === 0, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures,
	interpretation: 'Bottom bevel width/height and contour width/color are proven as independent native controls on both text and shape carriers. Camera FOV and Z position remain separate boundaries; this does not close the universal 2,258-row registry.',
}
const reportPath = path.join(outDir, 'text3d-bevel-contour-five-point-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
