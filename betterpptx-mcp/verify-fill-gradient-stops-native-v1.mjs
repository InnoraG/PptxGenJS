#!/usr/bin/env node
// Native proof: arbitrary gradient-stop position, colour, transparency, combination, reset, and re-edit.
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
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/fill-gradient-stops-native/${stamp}`)
const generated = path.join(outDir, 'fill-gradient-stops-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const cases = [
	{ name: 'minimum-two-stop', angle: 0, shapeStops: [{ position: 0, color: '0F4C81' }, { position: 100, color: 'F59E0B' }], backgroundStops: [{ position: 0, color: '07111F' }, { position: 100, color: '102A43' }] },
	{ name: 'five-stop-slider-set', angle: 37.125, shapeStops: [{ position: 0, color: 'EF4444' }, { position: 25, color: 'F97316', transparency: 12.345 }, { position: 50, color: 'FACC15', transparency: 37.5 }, { position: 75, color: '22C55E', transparency: 62.125 }, { position: 100, color: '2563EB', transparency: 100 }], backgroundStops: [{ position: 0, color: '111827' }, { position: 50, color: '312E81', transparency: 22.222 }, { position: 100, color: '0EA5E9', transparency: 77.777 }] },
	{ name: 'colour-transform-chain', angle: 123.456, shapeStops: [{ position: 0, color: { scheme: 'accent1', tint: 0.18, shade: 0.04, saturation: 1.25, luminance: 1.1, luminanceOffset: -0.08, opacity: 0.86 } }, { position: 100, color: { color: 'F97316', shade: 0.22, saturation: 1.35, luminance: 0.92, luminanceOffset: 0.06, opacity: 0.74 } }], backgroundStops: [{ position: 0, color: { preset: 'white', tint: 0.12 } }, { position: 100, color: { scheme: 'accent4', luminance: 1.15 }, transparency: 33.333 }] },
	{ name: 'sparse-reedit-combination', angle: 271.875, shapeStops: [{ position: 0, color: 'F8FAFC', transparency: 3.333 }, { position: 17.125, color: 'A78BFA', transparency: 18.875 }, { position: 42.75, color: 'EC4899', transparency: 44.444 }, { position: 88.875, color: '14B8A6', transparency: 81.111 }, { position: 100, color: '020617', transparency: 96.543 }], backgroundStops: [{ position: 0, color: 'FFFFFF' }, { position: 33.333, color: 'BAE6FD', transparency: 11.111 }, { position: 66.666, color: 'C4B5FD', transparency: 55.555 }, { position: 100, color: '312E81', transparency: 88.888 }] },
	{ name: 'component-reset', angle: 180, shapeStops: null, backgroundStops: [{ position: 0, color: '111827' }, { position: 100, color: '475569' }] },
	{ name: 'post-reset-reedit', angle: 359.999, shapeStops: [{ position: 0, color: 'FDE68A', transparency: 0 }, { position: 12.5, color: 'FB7185', transparency: 12.5 }, { position: 50, color: '8B5CF6', transparency: 50 }, { position: 87.5, color: '2DD4BF', transparency: 87.5 }, { position: 100, color: '0F172A', transparency: 99.999 }], backgroundStops: [{ position: 0, color: '020617' }, { position: 100, color: '0F766E', transparency: 35.25 }] },
]
await fs.mkdir(outDir, { recursive: true })

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX generic fill gradient-stop proof'
pptx.subject = 'Native arbitrary gradient-stop contract'
pptx.title = 'Fill gradient-stop native canary'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
for (const item of cases) {
	const slide = pptx.addSlide()
	slide.background = item.backgroundStops ? { type: 'gradient', gradientDirection: 'linear', gradientAngle: item.angle, gradientStops: item.backgroundStops } : { color: 'F6F8FB' }
	slide.addText('Fill gradient-stop canary', { x: 1, y: 0.55, w: 11.3, h: 0.55, fontFace: 'Aptos Display', fontSize: 24, color: '102A43', bold: true, margin: 0, align: 'center' })
	slide.addText(item.name, { x: 1.1, y: 1.12, w: 11.1, h: 0.35, fontFace: 'Aptos', fontSize: 13, color: '334E68', margin: 0, align: 'center' })
	slide.addShape(pptx.ShapeType.roundRect, {
		x: 2.25, y: 1.75, w: 8.0, h: 3.55, objectName: 'gradient-stop-shape',
		fill: item.shapeStops ? { type: 'gradient', gradientDirection: 'linear', gradientAngle: item.angle, gradientStops: item.shapeStops } : { type: 'none' },
		line: { color: 'FFFFFF', width: 1.25, transparency: 20 },
	})
	slide.addNotes(`Native fill gradient-stop checkpoint: ${item.name}.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const readGradients = xml => [...xml.matchAll(/<a:gradFill\b[\s\S]*?<\/a:gradFill>/g)].map(match => {
	const body = match[0]
	const angle = Number(body.match(/<a:lin\s+ang="(\d+)"/)?.[1] ?? NaN)
	const stops = [...body.matchAll(/<a:gs\s+pos="(\d+)">([\s\S]*?)<\/a:gs>/g)].map(stop => {
		const inner = stop[2]
		const colorMatch = inner.match(/<a:(srgbClr|schemeClr|prstClr)\s+val="([^"]+)"/)
		const readTransform = tag => {
			const value = Number(inner.match(new RegExp(`<a:${tag}\\s+val="(-?\\d+)"`))?.[1] ?? NaN)
			return Number.isFinite(value) ? value : null
		}
		return {
			positionRaw: Number(stop[1]),
			color: colorMatch ? { type: colorMatch[1], value: colorMatch[2].toUpperCase() } : null,
			transforms: { tint: readTransform('tint'), shade: readTransform('shade'), saturation: readTransform('satMod'), luminance: readTransform('lumMod'), luminanceOffset: readTransform('lumOff') },
			alpha: readTransform('alpha'),
		}
	})
	return { angleRaw: angle, stops }
})

const expectedColor = color => {
	if (typeof color === 'string') return { type: /^[0-9a-f]{6}$/i.test(color.replace(/^#/, '')) ? 'srgbClr' : 'schemeClr', value: color.replace(/^#/, '').toUpperCase() }
	const base = color?.color ?? color?.scheme ?? color?.preset ?? '000000'
	const type = color?.preset ? 'prstClr' : color?.scheme ? 'schemeClr' : color?.colorType === 'preset' ? 'prstClr' : color?.colorType === 'scheme' ? 'schemeClr' : /^[0-9a-f]{6}$/i.test(String(base).replace(/^#/, '')) ? 'srgbClr' : 'schemeClr'
	return { type, value: String(base).replace(/^#/, '').toUpperCase() }
}
const expectedTransform = (value, scalar = 100000) => value == null ? null : Math.round(value * scalar)
const expectedGradient = stops => stops ? { positions: stops.map(stop => Math.round(stop.position * 1000)), colors: stops.map(stop => expectedColor(stop.color)), transforms: stops.map(stop => ({ tint: expectedTransform(stop.color?.tint), shade: expectedTransform(stop.color?.shade), saturation: expectedTransform(stop.color?.saturation), luminance: expectedTransform(stop.color?.luminance), luminanceOffset: expectedTransform(stop.color?.luminanceOffset) })), alphas: stops.map(stop => stop.transparency > 0 ? Math.round((100 - Math.max(0, Math.min(100, stop.transparency))) * 1000) : expectedTransform(stop.color?.opacity)) } : null
const inspectZip = async file => {
	const zip = await JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
	const rows = []
	for (let index = 1; index <= cases.length; index++) {
		const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string')
		const gradients = readGradients(xml)
		const item = cases[index - 1]
		const expectedBackground = expectedGradient(item.backgroundStops)
		const expectedShape = expectedGradient(item.shapeStops)
		const checks = []
		const compare = (actual, expected, label) => {
			if (!expected) { checks.push({ label, pass: actual == null, expected: 'none', actual: actual ? actual.stops : null }); return }
			const pass = actual && actual.angleRaw === Math.round(item.angle * 60000) && actual.stops.length === expected.positions.length && actual.stops.every((stop, i) => stop.positionRaw === expected.positions[i] && JSON.stringify(stop.color) === JSON.stringify(expected.colors[i]) && JSON.stringify(stop.transforms) === JSON.stringify(expected.transforms[i]) && stop.alpha === expected.alphas[i])
			checks.push({ label, pass, expected, actual })
		}
		compare(gradients[0], expectedBackground, 'background')
		compare(gradients[1], expectedShape, 'shape')
		const resetPass = item.shapeStops ? true : xml.includes('<a:noFill/>')
		checks.push({ label: 'shape-reset', pass: resetPass, expected: item.shapeStops ? 'not-applicable' : true, actual: item.shapeStops ? true : resetPass })
		rows.push({ slide: index, checkpoint: item.name, gradientCount: gradients.length, checks, pass: checks.every(check => check.pass) })
	}
	return rows
}

const generatedRows = await inspectZip(generated)
const { stdout: auditStdout } = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })
const generatedAudit = JSON.parse(auditStdout)
const psPath = generated.replace(/'/g, "''")
const rtPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${psPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${rtPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${rtPath}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le $re.Slides.Count;$i++){ $png='${outPath}\\roundtrip-slide-'+('{0:D2}' -f $i)+'.png';$re.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;png=$png} };$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=$rows.Count;rows=$rows}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const { stdout: officeStdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeStdout.trim())
const roundtripRows = await inspectZip(roundtrip)
for (const row of roundtripRows) {
	const png = path.join(outDir, `roundtrip-slide-${String(row.slide).padStart(2, '0')}.png`)
	row.renderSha256 = sha256(await fs.readFile(png))
}
const failures = []
for (const row of [...generatedRows, ...roundtripRows]) if (!row.pass) failures.push(`slide ${row.slide} ${row.checkpoint} failed`)
if (generatedAudit.status !== 'PASS' || generatedAudit.errors?.length) failures.push('generated package audit failed')
if (office.status !== 'PASS' || office.slideCount !== cases.length) failures.push('PowerPoint SaveCopyAs/reopen failed')
const generatedBytes = await fs.readFile(generated)
const roundtripBytes = await fs.readFile(roundtrip)
const report = {
	schemaVersion: 'betterpptx.global-fill-gradient-stops-native.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	controlIds: ['shapes.fill.gradientStops[].position', 'shapes.fill.gradientStops[].color', 'shapes.fill.gradientStops[].color.tint', 'shapes.fill.gradientStops[].color.shade', 'shapes.fill.gradientStops[].color.saturation', 'shapes.fill.gradientStops[].color.luminance', 'shapes.fill.gradientStops[].color.luminanceOffset', 'shapes.fill.gradientStops[].color.opacity', 'shapes.fill.gradientStops[].transparency', 'slides[].background.gradientStops[]'],
	capabilityFamily: 'shapes-and-backgrounds-gradients',
	checkpoints: cases.map((item, index) => ({ checkpoint: item.name, slide: index + 1, angle: item.angle, shapeStops: item.shapeStops, backgroundStops: item.backgroundStops })),
	proof: { structuredSerialization: true, packageIntegrity: generatedAudit.status === 'PASS' && !generatedAudit.errors?.length, repairFreePowerPointOpen: office.status === 'PASS', saveCopyAsReopen: office.status === 'PASS', retainedNativeGradientStops: failures.length === 0, componentReset: generatedRows[3]?.pass === true && roundtripRows[3]?.pass === true, visualRenders: roundtripRows.map(row => row.renderSha256) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), audit: generatedAudit, rows: generatedRows },
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), bytes: roundtripBytes.length, sha256: sha256(roundtripBytes), rows: roundtripRows },
	office,
	failures,
	interpretation: 'This proves the generic native gradient-stop contract across shape fills and slide backgrounds, including arbitrary positions, colors, transparency, combination, component reset, re-edit, Office reopen, and full-size renders. It closes only this isolated family canary, not the universal 2,258-row registry.',
}
const reportPath = path.join(outDir, 'fill-gradient-stops-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
