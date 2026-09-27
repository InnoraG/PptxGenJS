#!/usr/bin/env node
// TEMPORARY DEVELOPMENT-ONLY CHART CAPABILITY DEMONSTRATION.
// Directly imports the evolved dist/pptxgen.es.js runtime; no MCP/spec route.
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourceRuntime = path.resolve(here, '..', 'dist', 'pptxgen.es.js')
const shadowRuntime = path.resolve(here, '.betterpptx-runtime', `chart-only-${process.pid}.mjs`)
await fs.mkdir(path.dirname(shadowRuntime), { recursive: true })
await fs.copyFile(sourceRuntime, shadowRuntime)
const { default: PptxGenJS } = await import(pathToFileURL(shadowRuntime).href)

const outputPath = path.resolve(here, 'outputs', 'showcases', 'chart-only-dev', 'chart-only-capability-engine-presets-20260807-1159.pptx')
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX direct chart capability probe'
pptx.title = 'Chart-only capability demonstration'
pptx.subject = 'Native chart families authored directly with evolved PptxGenJS'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }

const C = { bg: 'F7F9FC', ink: '172033', muted: '52606D', gold: 'B7791F', cyan: '0F766E', blue: '2563EB', rose: 'DB2777', green: '65A30D' }
const common = { showLegend: false, showTitle: false, showValue: true, showCatName: false, showSerName: false, showPercent: false }
let slideNo = 0
function chartSlide(title, subtitle, type, data, options = {}) {
  slideNo += 1
  const s = pptx.addSlide()
  s.background = { color: C.bg }
  s.addText('CHART-ONLY CAPABILITY', { x: 0.7, y: 0.38, w: 4.8, h: 0.2, fontSize: 10, bold: true, color: C.cyan, charSpacing: 1.2, margin: 0 })
  s.addText(title, { x: 0.7, y: 0.72, w: 11.9, h: 0.58, fontFace: 'Aptos Display', fontSize: 35, bold: true, color: C.ink, margin: 0, fit: 'shrink' })
  s.addText(subtitle, { x: 0.72, y: 1.42, w: 8.75, h: 0.36, fontSize: 16, color: C.muted, margin: 0, fit: 'shrink' })
  const family = ['treemap', 'sunburst', 'histogram', 'pareto', 'boxWhisker', 'waterfall', 'funnel', 'regionMap'].includes(String(type)) ? 'Office ChartEx' : 'legacy chart'
  const typeName = String(type).replace(/^D\./, '')
  const enginePreset = pptx.ChartStyles[typeName] || {}
  s.addText(`${family.toUpperCase()}  /  ${typeName.toUpperCase()}`, { x: 9.0, y: 0.38, w: 3.5, h: 0.2, fontSize: 9, bold: true, color: C.gold, charSpacing: 0.8, align: 'right', margin: 0 })
  // The engine preset is the first authoring layer; slide options remain the customization layer.
  s.addChart(type, data, { ...enginePreset, ...common, x: 0.75, y: 1.95, w: 8.65, h: 4.55, ...options })
  const pointCount = data.reduce((total, item) => total + (Array.isArray(item.values) ? item.values.length : 0), 0)
  const seriesNames = data.map(item => item.name || 'Series').join(' · ')
  const labelLevels = Array.isArray(data[0]?.labels) ? data[0].labels.length : 0
  const hasSizes = data.some(item => Array.isArray(item.sizes))
  const hierarchyExample = labelLevels > 1
    ? `${data[0].labels.slice(0, 2).map(level => level.slice(0, 4).join(' · ')).join('\n')}\nvalues ${data[0].values.slice(0, 6).join(' · ')}`
    : undefined
  const controlLine = [
    `preset ${enginePreset.chartColors ? enginePreset.chartColors.length : 0}-color`,
    options.showLegend ? 'legend' : null,
    options.showValue ? 'values' : null,
    options.showPercent ? 'percent' : null,
    options.valAxisMinVal !== undefined ? 'axis bounds' : null,
    options.barGrouping ? options.barGrouping : null,
    options.lineSize ? 'line weight' : null,
  ].filter(Boolean).join(' · ') || 'native defaults'
  s.addShape(pptx.ShapeType.rect, { x: 9.68, y: 1.95, w: 2.82, h: 4.55, fill: { color: 'FFFFFF' }, line: { color: 'D9E2F3', pt: 0.7 } })
  s.addText('MAXIMUM DETAIL', { x: 9.95, y: 2.25, w: 2.25, h: 0.22, fontSize: 11, bold: true, color: C.gold, charSpacing: 0.8, margin: 0 })
  s.addText('DATA MODEL', { x: 9.95, y: 2.7, w: 2.25, h: 0.18, fontSize: 9, bold: true, color: C.cyan, margin: 0 })
  s.addText(`${data.length} series  ·  ${pointCount} marks${labelLevels ? `  ·  ${labelLevels} label level${labelLevels > 1 ? 's' : ''}` : ''}${hasSizes ? '  ·  sizes' : ''}\n${seriesNames}`, { x: 9.95, y: 2.93, w: 2.25, h: 0.76, fontSize: 11, color: C.ink, margin: 0, breakLine: false, fit: 'shrink' })
  const controlsY = hierarchyExample ? 4.52 : 3.92
  if (hierarchyExample) {
    s.addText('CATEGORY LEVELS', { x: 9.95, y: 3.82, w: 2.25, h: 0.18, fontSize: 9, bold: true, color: C.cyan, margin: 0 })
    s.addText(hierarchyExample, { x: 9.95, y: 4.05, w: 2.25, h: 0.28, fontSize: 9.5, color: C.ink, margin: 0, fit: 'shrink' })
  }
  s.addText('EXPOSED CONTROLS', { x: 9.95, y: controlsY, w: 2.25, h: 0.18, fontSize: 9, bold: true, color: C.cyan, margin: 0 })
  s.addText(controlLine, { x: 9.95, y: controlsY + 0.24, w: 2.25, h: 0.42, fontSize: 11, color: C.ink, margin: 0, fit: 'shrink' })
  const emitsY = controlsY + 0.95
  s.addText('EMITS', { x: 9.95, y: emitsY, w: 2.25, h: 0.18, fontSize: 9, bold: true, color: C.cyan, margin: 0 })
  s.addText(`${family}\npptx.ChartType.${typeName}\nEditable data + options`, { x: 9.95, y: emitsY + 0.23, w: 2.25, h: 0.78, fontSize: 11, color: C.ink, margin: 0, fit: 'shrink' })
  s.addText(`${String(slideNo).padStart(2, '0')}  ·  Direct API: pptx.ChartType.${typeName}  ·  ${family}`, { x: 0.72, y: 7.02, w: 11.5, h: 0.18, fontSize: 9, color: C.muted, margin: 0 })
}

chartSlide('Bars make comparison immediate.', 'Discrete categories, one scale, fast executive read.', pptx.ChartType.bar, [{ name: 'Baseline', labels: ['Discovery', 'Proof', 'Motion', 'Quality', 'Delivery', 'Scale'], values: [72, 81, 68, 86, 78, 91] }, { name: 'Target', labels: ['Discovery', 'Proof', 'Motion', 'Quality', 'Delivery', 'Scale'], values: [88, 92, 84, 96, 90, 100] }, { name: 'Variance', labels: ['Discovery', 'Proof', 'Motion', 'Quality', 'Delivery', 'Scale'], values: [16, 11, 16, 10, 12, 9] }], { chartColors: [C.gold, C.cyan, C.rose], valAxisMinVal: 0, valAxisMaxVal: 110, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b' })
chartSlide('Columns add depth to the same comparison.', 'The evolved runtime also emits a native 3-D bar family.', pptx.ChartType.bar3D, [{ name: 'FY25', labels: ['Story', 'Media', 'Motion', 'Quality', 'Scale'], values: [62, 74, 55, 70, 66] }, { name: 'FY26', labels: ['Story', 'Media', 'Motion', 'Quality', 'Scale'], values: [82, 91, 78, 94, 88] }], { chartColors: [C.cyan, C.blue], valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b', showValue: true, v3DPerspective: 24, v3DRotX: 18, v3DRotY: 22, v3DRAngAx: true, barGapDepthPct: 80 })
chartSlide('Lines make change legible.', 'Use a line when the story is movement over an ordered sequence.', pptx.ChartType.line, [{ name: 'Adoption', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], values: [28, 41, 57, 68, 76, 86] }, { name: 'Retention', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], values: [72, 74, 78, 82, 84, 88] }, { name: 'Quality', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], values: [61, 67, 73, 81, 89, 94] }], { chartColors: [C.cyan, C.blue, C.gold], valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b', lineSmooth: true, lineDataSymbol: 'circle', dataLabelPosition: 'r' })
chartSlide('Area charts show the shape of accumulation.', 'Magnitude and continuity matter more than exact point labels.', pptx.ChartType.area, [{ name: 'Core', labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], values: [12, 19, 28, 39, 53, 64] }, { name: 'Expansion', labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], values: [4, 9, 16, 25, 34, 46] }], { chartColors: [C.blue, C.cyan], valAxisMinVal: 0, valAxisMaxVal: 120, valAxisMajorUnit: 20, barGrouping: 'stacked', showLegend: true, legendPos: 'b', showValue: false, chartColorsOpacity: 78 })
chartSlide('Doughnuts show composition.', 'A part-to-whole answer without pretending it is a timeline.', pptx.ChartType.doughnut, [{ name: 'Mix', labels: ['Story', 'World', 'Proof', 'Motion', 'Data', 'Identity'], values: [26, 22, 18, 14, 12, 8] }], { chartColors: [C.gold, C.cyan, C.blue, C.rose, C.green, 'A78BFA'], showValue: false, showPercent: true, showLegend: true, legendPos: 'b', holeSize: 58, firstSliceAng: 270, dataLabelPosition: 'bestFit', dataNoEffects: false })
chartSlide('Pies make a simple whole visible.', 'Use a pie only when the composition is simple enough to read at a glance.', pptx.ChartType.pie, [{ name: 'Allocation', labels: ['Story', 'World', 'Proof', 'Motion', 'Data', 'Identity'], values: [31, 23, 17, 13, 9, 7] }], { chartColors: [C.gold, C.cyan, C.blue, C.rose, C.green, 'A78BFA'], showValue: false, showPercent: true, showLegend: true, legendPos: 'b', firstSliceAng: 270, dataNoEffects: false })
chartSlide('Radar charts expose a capability profile.', 'Several dimensions compared on one common scale.', pptx.ChartType.radar, [{ name: 'Direct code', labels: ['Story', 'World', 'Proof', 'Motion', 'Quality', 'Identity'], values: [92, 96, 88, 84, 100, 91] }, { name: 'MCP route', labels: ['Story', 'World', 'Proof', 'Motion', 'Quality', 'Identity'], values: [88, 92, 84, 81, 96, 89] }, { name: 'Reference', labels: ['Story', 'World', 'Proof', 'Motion', 'Quality', 'Identity'], values: [95, 94, 91, 90, 98, 93] }], { chartColors: [C.gold, C.cyan, C.rose], valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b', showValue: false, radarStyle: 'filled', chartColorsOpacity: 62, lineSize: 2.5 })
chartSlide('Scatter reveals correlation.', 'X values stay explicit; Y values become the relationship.', pptx.ChartType.scatter, [{ name: 'X-Axis', values: [1, 2, 3, 4, 5, 6, 7, 8] }, { name: 'Quality', values: [42, 48, 55, 67, 76, 82, 88, 94] }, { name: 'Speed', values: [28, 36, 44, 58, 69, 79, 86, 91] }, { name: 'Trust', values: [34, 43, 51, 61, 72, 80, 89, 96] }], { chartColors: [C.gold, C.cyan, C.rose], valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b', showValue: false })
chartSlide('Bubbles add a third variable.', 'Position is X/Y; bubble area carries the additional magnitude.', pptx.ChartType.bubble, [{ name: 'X-Axis', values: [1, 2, 3, 4, 5, 6, 7] }, { name: 'Reach', values: [42, 48, 55, 67, 76, 88, 94], sizes: [8, 12, 18, 24, 30, 38, 44] }, { name: 'Depth', values: [28, 36, 44, 58, 69, 79, 86], sizes: [6, 10, 15, 20, 26, 34, 40] }, { name: 'Trust', values: [34, 43, 51, 61, 72, 80, 89], sizes: [7, 11, 16, 22, 28, 36, 42] }], { chartColors: [C.gold, C.cyan, C.rose], valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b', showValue: false })
chartSlide('3-D bubbles make the portfolio legible.', 'The same three-variable encoding, with the evolved 3-D bubble family.', pptx.ChartType.bubble3D, [{ name: 'X-Axis', values: [1, 2, 3, 4, 5, 6, 7] }, { name: 'Reach', values: [42, 48, 55, 67, 76, 88, 94], sizes: [8, 12, 18, 24, 30, 38, 44] }, { name: 'Depth', values: [28, 36, 44, 58, 69, 79, 86], sizes: [6, 10, 15, 20, 26, 34, 40] }], { chartColors: [C.rose, C.cyan], valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showLegend: true, legendPos: 'b', showValue: false })

// Modern Office chart extensions (Chartex): these are emitted as chartEx parts,
// with the same direct addChart API and editable data model.
const ex = { showValue: false, showLegend: false }
const hierarchyData = [{ name: 'Portfolio', labels: [['Core', 'Core', 'Core', 'Growth', 'Growth', 'Labs', 'Labs', 'Labs'], ['Decks', 'Media', 'Identity', 'Decks', 'Media', 'Research', 'Tools', 'QA'], ['2026', '2026', '2026', '2026', '2026', '2026', '2026', '2026']], values: [36, 22, 14, 18, 14, 7, 5, 3] }]
chartSlide('Treemaps show hierarchy as area.', 'Nested labels are encoded as multiple label levels in a native ChartEx treemap.', pptx.ChartType.treemap, hierarchyData, { ...ex, chartColors: [C.gold, C.cyan, C.blue, C.rose, C.green, 'A78BFA'], showLegend: true, legendPos: 'b' })
chartSlide('Sunbursts show hierarchy radially.', 'The same multi-level category model, rendered through the Chartex sunburst layout.', pptx.ChartType.sunburst, hierarchyData, { ...ex, chartColors: [C.gold, C.cyan, C.blue, C.rose, C.green, 'A78BFA'], showLegend: true, legendPos: 'b' })
chartSlide('Histograms expose distribution.', 'A native ChartEx binning layout turns raw observations into frequency.', pptx.ChartType.histogram, [{ name: 'Latency observations', values: [4, 7, 9, 11, 12, 13, 14, 16, 18, 19, 21, 22, 24, 26, 27, 29, 31, 32, 35, 38, 41, 44, 47, 52] }], { ...ex, chartColors: [C.cyan], valAxisMinVal: 0, valAxisMaxVal: 10, valAxisMajorUnit: 2 })
chartSlide('Pareto ranks causes and cumulative impact.', 'Bars show frequency; the ChartEx paretoLine carries the cumulative story.', pptx.ChartType.pareto, [{ name: 'Issue class', labels: ['Layout', 'Media', 'Timing', 'Style', 'Identity', 'Data', 'Motion', 'Other'], values: [42, 26, 19, 15, 12, 10, 8, 5] }], { ...ex, chartColors: [C.gold], valAxisMinVal: 0, valAxisMaxVal: 50, valAxisMajorUnit: 10 })
chartSlide('Box & whisker shows spread.', 'Quartiles and outliers are authored as a native ChartEx distribution.', pptx.ChartType.boxWhisker, [{ name: 'Build A', labels: ['Latency'], values: [12, 14, 18, 19, 21, 27, 31, 44] }, { name: 'Build B', labels: ['Latency'], values: [9, 11, 14, 16, 17, 23, 25, 31] }, { name: 'Build C', labels: ['Latency'], values: [16, 18, 22, 25, 25, 33, 39, 48] }, { name: 'Build D', labels: ['Latency'], values: [7, 10, 13, 15, 18, 20, 24, 29] }], { ...ex, chartColors: [C.gold, C.cyan, C.rose, C.green], valAxisMinVal: 0, valAxisMaxVal: 60, valAxisMajorUnit: 10 })
chartSlide('Waterfalls explain reconciliation.', 'Starting value, deltas, and ending value are preserved in a native ChartEx waterfall.', pptx.ChartType.waterfall, [{ name: 'Bridge', labels: ['Start', 'Story', 'Media', 'Motion', 'Quality', 'Identity', 'Scale', 'End'], values: [100, 18, -12, 22, 9, -4, 17, 160] }], { ...ex, chartColors: [C.gold, C.cyan, C.rose], valAxisMinVal: 0, valAxisMaxVal: 180, valAxisMajorUnit: 20 })
chartSlide('Funnels show conversion.', 'Stages narrow toward the outcome, with the Chartex funnel layout carrying the geometry.', pptx.ChartType.funnel, [{ name: 'Pipeline', labels: ['Brief', 'Research', 'Draft', 'Review', 'Approved', 'Rendered', 'Live'], values: [100, 88, 72, 56, 41, 32, 24] }], { ...ex, chartColors: [C.gold, C.cyan, C.blue, C.rose, C.green, 'A78BFA'] })
chartSlide('Region maps show geographic intensity.', 'Region labels and values are emitted through the native Chartex regionMap family.', pptx.ChartType.regionMap, [{ name: 'Adoption', labels: ['United States', 'United Kingdom', 'Kenya', 'India', 'Australia', 'Canada', 'Germany', 'Japan'], values: [82, 68, 54, 47, 39, 63, 58, 45] }], { ...ex, chartColors: [C.blue, C.cyan, C.gold, C.rose, C.green], valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20 })

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await pptx.writeFile({ fileName: outputPath })
await fs.rm(shadowRuntime, { force: true })
console.log(JSON.stringify({ ok: true, developmentOnly: true, runtimeSource: sourceRuntime, output: outputPath, slides: slideNo, legacySlides: 10, chartExSlides: 8 }, null, 2))
