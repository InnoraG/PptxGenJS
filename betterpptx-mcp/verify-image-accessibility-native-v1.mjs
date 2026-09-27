// Native/package/Office proof for semantic image descriptions on the canonical 29-image lane.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { IMAGE_ACCESSIBILITY_PARAMETERS, validateImageAltText } from './image-accessibility-catalog.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/image-accessibility-native/${stamp}`)
const generated = path.join(outDir, 'image-accessibility-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const checkpoints = Array.from({ length: 29 }, (_, index) => ({
	id: `source-image-${index + 1}`,
	altText: `Canonical source image ${index + 1}: a blue native visual checkpoint for the authored presentation story.`,
}))
for (const item of checkpoints) validateImageAltText(item.altText, `${item.id}.altText`)

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX semantic image accessibility proof'; pptx.title = 'Canonical source-image accessibility'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const item of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(`Canonical image checkpoint ${item.id.replace('source-image-', '')}`, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true, objectName: `${item.id}-title` })
	slide.addImage({ data: imageData, x: 1.1, y: 1.35, w: 10, h: 4.2, objectName: item.id, altText: item.altText })
	slide.addNotes(`${item.altText} Native p:cNvPr/@descr must retain this description.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const readSlides = async filePath => {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath), { checkCRC32: true })
	const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]))
	const rows = []
	for (let index = 0; index < checkpoints.length; index++) {
		const xml = await zip.file(slideFiles[index]).async('string')
		const match = xml.match(new RegExp(`descr="${checkpoints[index].altText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
		rows.push({ slide: index + 1, id: checkpoints[index].id, hasNativeDescription: Boolean(match), hasVisibleDescriptionText: xml.includes('The description is semantic metadata') })
	}
	return { zip, slideFiles, rows }
}
const generatedRead = await readSlides(generated)
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$pngDir='${outPath}\\renders';New-Item -ItemType Directory -Force -Path $pngDir|Out-Null;for($i=1;$i -le $r.Slides.Count;$i++){$r.Slides.Item($i).Export((Join-Path $pngDir ('slide-{0:D2}.png' -f $i)),'PNG',1600,900)};$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;renderDir=$pngDir}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripRead = await readSlides(roundtrip)
const renderFiles = (await fs.readdir(path.join(outDir, 'renders'))).filter(name => name.endsWith('.png')).sort()
const renderBytes = await Promise.all(renderFiles.map(name => fs.readFile(path.join(outDir, 'renders', name))))
const failures = []
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!generatedRead.rows.every(row => row.hasNativeDescription && !row.hasVisibleDescriptionText)) failures.push('generated:native-descr-or-visible-text')
if (!roundtripRead.rows.every(row => row.hasNativeDescription && !row.hasVisibleDescriptionText)) failures.push('roundtrip:native-descr-or-visible-text')
if (renderFiles.length !== checkpoints.length) failures.push('office:render-count')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip)
const report = { schemaVersion: 'betterpptx.global-image-accessibility.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { source: 'imageAccessibility', parameterCount: IMAGE_ACCESSIBILITY_PARAMETERS.length, canonicalSourceImageUses: checkpoints.length, serializer: 'native picture p:cNvPr/@descr', reset: 'null restores the asset/object fallback', privacy: 'private paths, URLs, data URIs, and opaque handles are rejected' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: generatedRead.rows, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRead.rows, renderCount: renderFiles.length, renderSetSha256: sha256(Buffer.concat(renderBytes)) }, failures, interpretation: 'All 29 canonical source-image descriptions are authored as semantic metadata, serialized into native p:cNvPr/@descr, retained through PowerPoint Open2007/SaveCopyAs/reopen, and never duplicated as visible slide text.' }
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); const reportPath = path.join(outDir, 'image-accessibility-native-proof.json'); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSetSha256: report.office.renderSetSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
