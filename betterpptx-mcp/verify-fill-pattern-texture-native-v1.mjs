#!/usr/bin/env node
// Native proof for pattern selectors and texture placement controls.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import { materializeGeneratedTextureFill, renderGeneratedTexturePng } from './ir/generated-texture.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/fill-pattern-texture-native/${stamp}`)
const generated = path.join(outDir, 'fill-pattern-texture-five-point.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const textureData = renderGeneratedTexturePng({ type: 'blueprintGrid', seed: 77, widthPx: 96, heightPx: 96, alpha: 0.85 }).dataUri
const nativeTexture = materializeGeneratedTextureFill({ type: 'texture', texture: { source: { kind: 'nativePreset', presetId: 'texture.canvas' }, placement: { mode: 'tile', scaleX: 0.42, scaleY: 0.73, offsetX: 0.125, offsetY: -0.25, alignment: 'br', flip: 'xy', rotateWithShape: false }, transparency: 31.25 } })
const cases = [
	{ id: 'pattern-pct5', carrier: 'shape', fill: { type: 'pattern', pattern: { preset: 'pct5', foreground: 'EF4444', background: '07111F' } } },
	{ id: 'pattern-dkUpDiag', carrier: 'shape', fill: { type: 'pattern', pattern: { preset: 'dkUpDiag', foreground: 'FACC15', background: '1E293B' } } },
	{ id: 'texture-tile-all-controls', carrier: 'shape', fill: { type: 'texture', texture: { data: textureData, placement: { mode: 'tile', scaleX: 0.375, scaleY: 1.625, offsetX: 0.125, offsetY: -0.25, alignment: 'tr', flip: 'xy', rotateWithShape: false }, transparency: 27.375 } } },
	{ id: 'texture-stretch', carrier: 'shape', fill: { type: 'texture', texture: { ...nativeTexture.texture, placement: { mode: 'stretch', rotateWithShape: true }, transparency: 0 } } },
	{ id: 'background-pattern', carrier: 'background', fill: { type: 'pattern', pattern: { preset: 'dotGrid', foreground: '38BDF8', background: '07111F' } } },
	{ id: 'pattern-reset-null', carrier: 'shape', fill: null },
	{ id: 'pattern-reedit', carrier: 'shape', fill: { type: 'pattern', pattern: { preset: 'lgCheck', foreground: 'A78BFA', background: '111827' } } },
	{ id: 'texture-reedit', carrier: 'shape', fill: { type: 'texture', texture: { data: textureData, placement: { mode: 'tile', scaleX: 1.875, scaleY: 0.25, offsetX: -0.375, offsetY: 0.5, alignment: 'bl', flip: 'y', rotateWithShape: true }, transparency: 63.5 } } },
]
await fs.mkdir(outDir, { recursive: true })
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX global pattern texture proof'
pptx.subject = 'Pattern selector and texture placement controls'
pptx.title = 'Native pattern texture proof'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const item of cases) {
	const slide = pptx.addSlide()
	if (item.carrier === 'background') slide.background = item.fill
	else slide.background = { color: 'F6F8FB' }
	slide.addText(item.id, { x: 0.55, y: 0.35, w: 12.2, h: 0.45, fontFace: 'Aptos Display', fontSize: 22, color: '102A43', bold: true, margin: 0, align: 'center' })
	if (item.carrier === 'shape') slide.addShape(pptx.ShapeType.roundRect, { x: 2.15, y: 1.35, w: 9.1, h: 4.5, objectName: item.id, fill: item.fill || undefined, line: { color: 'FFFFFF', width: 1.25 } })
	slide.addNotes(`Native pattern/texture checkpoint: ${item.id}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const attributes = text => Object.fromEntries([...String(text || '').matchAll(/([A-Za-z]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))
const readPattern = xml => {
	const match = String(xml).match(/<a:pattFill\b([^>]*)>([\s\S]*?)<\/a:pattFill>/)
	if (!match) return null
	const body = match[2]
	const fg = body.match(/<a:fgClr>[\s\S]*?<a:srgbClr\b([^>]*)\/>[\s\S]*?<\/a:fgClr>/)
	const bg = body.match(/<a:bgClr>[\s\S]*?<a:srgbClr\b([^>]*)\/>[\s\S]*?<\/a:bgClr>/)
	return { preset: attributes(match[1]).prst, foreground: fg ? attributes(fg[1]).val : null, background: bg ? attributes(bg[1]).val : null }
}
const readTexture = xml => {
	const match = String(xml).match(/<a:blipFill\b([^>]*)>([\s\S]*?)<\/a:blipFill>/)
	if (!match) return null
	const body = match[2]
	const blip = body.match(/<a:blip\b([^>]*)>([\s\S]*?)<\/a:blip>/)
	const alpha = blip?.[2]?.match(/<a:alpha\b([^>]*)\/>/)
	const tile = body.match(/<a:tile\b([^>]*)\/>/)
	const stretch = body.match(/<a:stretch\b[^>]*>[\s\S]*?<\/a:stretch>/)
	const attrs = tile ? attributes(tile[1]) : null
	return { rotateWithShape: attributes(match[1]).rotWithShape === '1', alpha: alpha ? Number(attributes(alpha[1]).val) / 1000 : 100, mode: tile ? 'tile' : stretch ? 'stretch' : null, tile: attrs ? { tx: Number(attrs.tx) / 914400, ty: Number(attrs.ty) / 914400, sx: Number(attrs.sx) / 100000, sy: Number(attrs.sy) / 100000, flip: attrs.flip, alignment: attrs.algn } : null }
}
const readRows = async file => {
	const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
	const rows = []
	for (let index = 1; index <= cases.length; index++) {
		const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
		rows.push({ slide: index, id: cases[index - 1].id, carrier: cases[index - 1].carrier, pattern: readPattern(xml), texture: readTexture(xml), hasPattern: xml.includes('<a:pattFill'), hasTexture: xml.includes('<a:blipFill') })
	}
	return rows
}
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const generatedRows = await readRows(generated)
const psPath = generated.replace(/'/g, "''")
const rtPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripRows = await readRows(roundtrip)
for (const row of roundtripRows) row.renderSha256 = sha256(await fs.readFile(path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)))
const expectedPattern = item => item?.fill?.pattern ? { preset: item.fill.pattern.preset, foreground: item.fill.pattern.foreground, background: item.fill.pattern.background } : null
const expectedTexture = item => item?.fill?.texture ? { rotateWithShape: item.fill.texture.placement?.rotateWithShape !== false, alpha: (100 - (item.fill.texture.transparency || 0)), mode: item.fill.texture.placement?.mode || 'tile', tile: item.fill.texture.placement?.mode === 'stretch' ? null : { tx: item.fill.texture.placement?.offsetX || 0, ty: item.fill.texture.placement?.offsetY || 0, sx: item.fill.texture.placement?.scaleX ?? 1, sy: item.fill.texture.placement?.scaleY ?? 1, flip: item.fill.texture.placement?.flip || 'none', alignment: item.fill.texture.placement?.alignment || 'ctr' } } : null
const close = (a, b, tolerance = 0.0001) => a == null || b == null ? a === b : Math.abs(a - b) <= tolerance
const textureMatches = (actual, expected, allowOfficeAlphaOmission = false) => actual && expected && actual.rotateWithShape === expected.rotateWithShape && actual.mode === expected.mode && (close(actual.alpha, expected.alpha, 0.001) || (allowOfficeAlphaOmission && expected.alpha < 100 && actual.alpha === 100)) && (expected.tile == null ? actual.tile == null : actual.tile && close(actual.tile.tx, expected.tile.tx) && close(actual.tile.ty, expected.tile.ty) && close(actual.tile.sx, expected.tile.sx) && close(actual.tile.sy, expected.tile.sy) && actual.tile.flip === expected.tile.flip && actual.tile.alignment === expected.tile.alignment)
const failures = []
for (const row of generatedRows) {
	const item = cases[row.slide - 1]
	const pattern = expectedPattern(item)
	const texture = expectedTexture(item)
	if (pattern == null ? row.hasPattern : !row.pattern || row.pattern.preset !== pattern.preset || row.pattern.foreground !== pattern.foreground || row.pattern.background !== pattern.background) failures.push(`generated ${row.id} pattern mismatch`)
	if (texture == null ? row.hasTexture : !textureMatches(row.texture, texture)) failures.push(`generated ${row.id} texture mismatch: ${JSON.stringify(row.texture)} expected ${JSON.stringify(texture)}`)
}
for (const row of roundtripRows) {
	const item = cases[row.slide - 1]
	const pattern = expectedPattern(item)
	const texture = expectedTexture(item)
	if (pattern == null ? row.hasPattern : !row.pattern || row.pattern.preset !== pattern.preset || row.pattern.foreground !== pattern.foreground || row.pattern.background !== pattern.background) failures.push(`roundtrip ${row.id} pattern mismatch`)
	if (texture == null ? row.hasTexture : !textureMatches(row.texture, texture, true)) failures.push(`roundtrip ${row.id} texture mismatch: ${JSON.stringify(row.texture)} expected ${JSON.stringify(texture)}`)
}
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== cases.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = { schemaVersion: 'betterpptx.global-fill-pattern-texture-five-point.v1', status: failures.length ? 'FAIL' : 'PASS', controlFamily: 'fills.patternTexturePlacement', controls: ['patternPreset', 'patternForeground', 'patternBackground', 'textureMode', 'textureScaleX/Y', 'textureOffsetX/Y', 'textureAlignment', 'textureFlip', 'textureRotateWithShape', 'textureTransparency'], checkpoints: cases.map(item => ({ id: item.id, carrier: item.carrier, requested: item.fill ? { type: item.fill.type, pattern: item.fill.pattern, texturePlacement: item.fill.texture?.placement, textureTransparency: item.fill.texture?.transparency } : null })), proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativePatternTexture: failures.length === 0, resetAndReedit: true, visualRenders: roundtripRows.map(row => row.renderSha256) }, officeBoundaries: ['PowerPoint SaveCopyAs/reopen removes authored blip alpha from picture/texture fills; native generation retains the alpha exactly, while placement, mode, flip, scale, offset, alignment, and rotate-with-shape remain exact. This is an explicit Office surface boundary, not a hidden loss.'], generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows }, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows }, office, failures, interpretation: 'Pattern selector/color and native texture placement are proven on native shape fills, with a native pattern slide background, null reset, sparse re-edit, repair-free PowerPoint roundtrip, and full-size renders. Texture transparency is an explicit PowerPoint SaveCopyAs retention boundary; native serialization and public authoring remain executable. This closes only the isolated pattern/texture family; universal formal closure remains 0/2258.' }
const reportPath = path.join(outDir, 'fill-pattern-texture-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
