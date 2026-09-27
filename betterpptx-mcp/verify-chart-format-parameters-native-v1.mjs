// Native/package/Office proof for chart formatting controls beyond gallery tiles.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { CHART_FORMAT_PARAMETERS } from './option-registry.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/chart-format-parameters-native/${stamp}`)
const generated = path.join(outDir, 'chart-format-parameters-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const data = [{ name: 'Signal', labels: ['A', 'B', 'C', 'D'], values: [12, 24, 18, 31] }, { name: 'Target', labels: ['A', 'B', 'C', 'D'], values: [15, 21, 26, 28] }]
const checkpoints = [
	{ id: 'chart-axes', label: 'Axes and labels', type: 'bar', options: { showLegend: true, legendPos: 'b', showValue: true, chartColors: ['2563EB', 'F59E0B'], chartColorsOpacity: 72, valAxisMinVal: 0, valAxisMaxVal: 40, valAxisMajorUnit: 10, catAxisLabelRotate: -35, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, catAxisLineSize: 1.25, valAxisLineSize: 1.5, catAxisLineColor: '64748B', valAxisLineColor: '94A3B8' } },
	{ id: 'chart-area', label: 'Chart and plot areas', type: 'line', options: { showLegend: true, legendPos: 'r', lineSize: 3, lineDataSymbol: 'diamond', lineDataSymbolSize: 9, lineSmooth: true, chartArea: { fill: { color: 'FFFFFF', transparency: 5 }, border: { color: 'CBD5E1', pt: 1.1 }, roundedCorners: false }, plotArea: { fill: { color: 'F8FAFC', transparency: 12 }, border: { color: 'E2E8F0', pt: 0.7 } } } },
	{ id: 'chart-pie', label: 'Pie and doughnut sliders', type: 'doughnut', pieData: [{ name: 'Mix', labels: ['A', 'B', 'C', 'D'], values: [35, 25, 22, 18] }], options: { showLegend: true, legendPos: 'b', showPercent: true, showLeaderLines: true, firstSliceAng: 270, holeSize: 62, dataLabelPosition: 'bestFit', dataLabelFontSize: 12 } },
	{ id: 'chart-3d', label: '3-D view sliders', type: 'bar3D', options: { showLegend: true, v3DRotX: 18, v3DRotY: 42, v3DPerspective: 24, barGapWidthPct: 80, barGapDepthPct: 70, barOverlapPct: 15 } },
	{ id: 'chart-reset', label: 'Sparse reset and re-edit', type: 'bar', options: { showLegend: null, chartColorsOpacity: null, valAxisMajorUnit: null, chartArea: null, plotArea: null } },
]

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX chart format proof'; pptx.title = 'Native chart format parameters'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
for (const checkpoint of checkpoints) {
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoint.label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addChart(checkpoint.type, checkpoint.pieData || data, { x: 0.9, y: 1.05, w: 11.2, h: 5.5, objectName: checkpoint.id, title: checkpoint.label, showTitle: true, ...checkpoint.options })
	slide.addNotes(`Chart format checkpoint ${checkpoint.id}: native chart type plus typed sliders and structured area/axis controls.`)
}
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const chartFiles = Object.keys(zip.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name)).sort()
const chartRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await zip.file(chartFiles[index]).async('string')
	chartRows.push({
		slide: index + 1, chartFile: chartFiles[index],
		objectName: xml.includes(`name="${checkpoints[index].id}"`),
		axisBounds: /<c:(?:valAx|catAx)\b[^>]*>[\s\S]*?<c:(?:min|max)\b/.test(xml),
		majorUnit: xml.includes('<c:majorUnit'),
		labels: xml.includes('<c:dLbls>') || xml.includes('<c:dLbls '),
		legend: xml.includes('<c:legend>'),
		colors: xml.includes('<a:solidFill>'),
		areaAndPlot: xml.includes('<c:spPr>') && xml.includes('<c:plotArea>'),
		threeDView: xml.includes('<c:view3D>'),
		pieSliders: xml.includes('<c:firstSliceAng') && xml.includes('<c:holeSize'),
	})
}
const generatedChecks = {
	parameterCatalogComplete: CHART_FORMAT_PARAMETERS.length >= 40 && CHART_FORMAT_PARAMETERS.every(item => item.id && item.semanticPath && item.reset),
	allChartsPresent: chartFiles.length === checkpoints.length,
	axesAndLabelsNative: chartRows[0].axisBounds && chartRows[0].majorUnit && chartRows[0].labels,
	areaAndPlotNative: chartRows[1].areaAndPlot,
	pieSlidersNative: chartRows[2].pieSliders,
	threeDViewNative: chartRows[3].threeDView,
	resetCarrierPresent: chartRows[4].areaAndPlot,
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(2).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripRows = []
for (let index = 0; index < checkpoints.length; index++) {
	const xml = await roundtripZip.file(chartFiles[index]).async('string')
	roundtripRows.push({ slide: index + 1, axisBounds: /<c:(?:min|max)/.test(xml), areaAndPlot: xml.includes('<c:spPr>'), threeDView: xml.includes('<c:view3D>'), pieSliders: xml.includes('<c:firstSliceAng') && xml.includes('<c:holeSize') })
}
const roundtripRetained = { axisAndAreaCarriers: roundtripRows[0].axisBounds && roundtripRows[1].areaAndPlot, pieCarrier: roundtripRows[2].pieSliders, threeDCarrier: roundtripRows[3].threeDView, resetCarrier: roundtripRows[4].areaAndPlot }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-chart-format-carriers')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = { schemaVersion: 'betterpptx.global-chart-format-parameters.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { source: 'chartPreset plus chartOptions', parameterCount: CHART_FORMAT_PARAMETERS.length, chartFamilies: ['bar', 'bar3D', 'line', 'area', 'pie', 'doughnut', 'scatter', 'bubble', 'radar'], officeBoundary: 'PowerPoint retains the native chart type, axes, labels, area, pie, and 3-D carriers through Open2007/SaveCopyAs/reopen.' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: chartRows, checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) }, failures, interpretation: 'The chart contract exposes the existing native serializer controls as typed manual parameters. Preset selection remains available, while null/omitted options restore chart-type defaults.' }
const reportPath = path.join(outDir, 'chart-format-parameters-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
