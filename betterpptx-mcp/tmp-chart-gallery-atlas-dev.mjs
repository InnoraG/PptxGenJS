#!/usr/bin/env node
// TEMPORARY DEVELOPMENT-ONLY GALLERY ATLAS.
// Directly imports the evolved dist/pptxgen.es.js runtime; no MCP/spec route.
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourceRuntime = path.resolve(here, '..', 'dist', 'pptxgen.es.js')
const shadowRuntime = path.resolve(here, '.betterpptx-runtime', `chart-gallery-atlas-${process.pid}.mjs`)
await fs.mkdir(path.dirname(shadowRuntime), { recursive: true })
await fs.copyFile(sourceRuntime, shadowRuntime)
const { default: PptxGenJS } = await import(pathToFileURL(shadowRuntime).href)

const outputPath = path.resolve(here, 'outputs', 'showcases', 'chart-only-dev', 'chart-gallery-atlas-direct-20260807.pptx')
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX direct chart gallery atlas'
pptx.title = 'Office chart gallery atlas — all preset variants'
pptx.subject = 'Every bundled PowerPoint gallery variant demonstrated across all supported chart families'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }

const C = { bg: 'F7F9FC', ink: '172033', muted: '52606D', cyan: '0F766E', gold: 'B7791F', line: 'D9E2F3', plot: 'FFFFFF' }

// These palettes are the concrete authoring equivalents used by the local Office
// gallery corpus. The raw ChartEx color XML remains attached to every variant.
const galleryColorPalettes = {
  1: ['0D0D0D', '8C8C8C', 'C7C7C7', '262626', 'B3B3B3', '4D4D4D'],
  2: ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'],
  3: ['4472C4', '5B9BD5', 'A5A5A5', '9DC3E6', 'BDD7EE', 'D9EAF7'],
  4: ['ED7D31', 'FFC000', '70AD47', 'C55A11', 'BF9000', '548235'],
  5: ['7F7F7F', 'A6A6A6', 'BFBFBF', 'D9D9D9', '595959', '404040'],
  6: ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'],
  7: ['4472C4'],
  8: ['ED7D31'],
  9: ['A5A5A5'],
  10: ['FFC000'],
  11: ['5B9BD5'],
  12: ['70AD47'],
}

const hierarchyData = [{
  name: 'Portfolio',
  labels: [
    ['Core', 'Core', 'Core', 'Growth', 'Growth', 'Labs', 'Labs', 'Labs'],
    ['Decks', 'Media', 'Identity', 'Decks', 'Media', 'Research', 'Tools', 'QA'],
    ['2026', '2026', '2026', '2026', '2026', '2026', '2026', '2026'],
  ],
  values: [36, 22, 14, 18, 14, 7, 5, 3],
}]

const families = [
  { key: 'area', label: 'Area', type: 'area', data: [{ name: 'Core', labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], values: [12, 19, 28, 39, 53, 64] }, { name: 'Expansion', labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], values: [4, 9, 16, 25, 34, 46] }] },
  { key: 'bar', label: 'Bar', type: 'bar', data: [{ name: 'Baseline', labels: ['Story', 'Media', 'Motion', 'Quality'], values: [72, 81, 68, 86] }, { name: 'Target', labels: ['Story', 'Media', 'Motion', 'Quality'], values: [88, 92, 84, 96] }] },
  { key: 'bar3D', label: 'Bar 3D', type: 'bar3D', data: [{ name: 'FY25', labels: ['Story', 'Media', 'Motion', 'Quality'], values: [62, 74, 55, 70] }, { name: 'FY26', labels: ['Story', 'Media', 'Motion', 'Quality'], values: [82, 91, 78, 94] }] },
  { key: 'bubble', label: 'Bubble', type: 'bubble', data: [{ name: 'X-Axis', values: [1, 2, 3, 4, 5, 6] }, { name: 'Reach', values: [42, 48, 55, 67, 76, 88], sizes: [8, 12, 18, 24, 30, 38] }, { name: 'Depth', values: [28, 36, 44, 58, 69, 79], sizes: [6, 10, 15, 20, 26, 34] }] },
  { key: 'bubble3D', label: 'Bubble 3D', type: 'bubble3D', data: [{ name: 'X-Axis', values: [1, 2, 3, 4, 5, 6] }, { name: 'Reach', values: [42, 48, 55, 67, 76, 88], sizes: [8, 12, 18, 24, 30, 38] }, { name: 'Depth', values: [28, 36, 44, 58, 69, 79], sizes: [6, 10, 15, 20, 26, 34] }] },
  { key: 'doughnut', label: 'Doughnut', type: 'doughnut', data: [{ name: 'Mix', labels: ['Story', 'World', 'Proof', 'Motion', 'Data', 'Identity'], values: [26, 22, 18, 14, 12, 8] }] },
  { key: 'funnel', label: 'Funnel', type: 'funnel', data: [{ name: 'Pipeline', labels: ['Brief', 'Research', 'Draft', 'Review', 'Approved', 'Live'], values: [100, 88, 72, 56, 41, 24] }] },
  { key: 'histogram', label: 'Histogram', type: 'histogram', data: [{ name: 'Latency', values: [4, 7, 9, 11, 12, 13, 14, 16, 18, 19, 21, 22, 24, 26, 27, 29, 31, 32, 35, 38, 41, 44, 47, 52] }] },
  { key: 'line', label: 'Line', type: 'line', data: [{ name: 'Adoption', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], values: [28, 41, 57, 68, 76, 86] }, { name: 'Quality', labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'], values: [61, 67, 73, 81, 89, 94] }] },
  { key: 'pareto', label: 'Pareto', type: 'pareto', data: [{ name: 'Issue class', labels: ['Layout', 'Media', 'Timing', 'Style', 'Identity', 'Data'], values: [42, 26, 19, 15, 12, 10] }] },
  { key: 'pie', label: 'Pie', type: 'pie', data: [{ name: 'Allocation', labels: ['Story', 'World', 'Proof', 'Motion', 'Data', 'Identity'], values: [31, 23, 17, 13, 9, 7] }] },
  { key: 'radar', label: 'Radar', type: 'radar', data: [{ name: 'Direct', labels: ['Story', 'World', 'Proof', 'Motion', 'Quality', 'Identity'], values: [92, 96, 88, 84, 100, 91] }, { name: 'Reference', labels: ['Story', 'World', 'Proof', 'Motion', 'Quality', 'Identity'], values: [95, 94, 91, 90, 98, 93] }] },
  { key: 'regionMap', label: 'Region map', type: 'regionMap', data: [{ name: 'Adoption', labels: ['United States', 'United Kingdom', 'Kenya', 'India', 'Australia', 'Canada'], values: [82, 68, 54, 47, 39, 63] }] },
  { key: 'scatter', label: 'Scatter', type: 'scatter', data: [{ name: 'X-Axis', values: [1, 2, 3, 4, 5, 6] }, { name: 'Quality', values: [42, 48, 55, 67, 76, 88] }, { name: 'Speed', values: [28, 36, 44, 58, 69, 79] }] },
  { key: 'sunburst', label: 'Sunburst', type: 'sunburst', data: hierarchyData },
  { key: 'treemap', label: 'Treemap', type: 'treemap', data: hierarchyData },
  { key: 'waterfall', label: 'Waterfall', type: 'waterfall', data: [{ name: 'Bridge', labels: ['Start', 'Story', 'Media', 'Motion', 'Quality', 'End'], values: [100, 18, -12, 22, 9, 137] }] },
  { key: 'boxWhisker', label: 'Box & whisker', type: 'boxWhisker', data: [{ name: 'Build A', labels: ['Latency'], values: [12, 14, 18, 19, 21, 27, 31, 44] }, { name: 'Build B', labels: ['Latency'], values: [9, 11, 14, 16, 17, 23, 25, 31] }, { name: 'Build C', labels: ['Latency'], values: [16, 18, 22, 25, 25, 33, 39, 48] }] },
]

const chartEx = new Set(['funnel', 'histogram', 'pareto', 'boxWhisker', 'regionMap', 'sunburst', 'treemap', 'waterfall'])
const baseChartOptions = {
  showLegend: false,
  showTitle: false,
  showValue: false,
  showPercent: false,
  showCatName: false,
  showSerName: false,
  showLeaderLines: false,
  catAxisLabelFontSize: 5,
  valAxisLabelFontSize: 5,
  catAxisTitleFontSize: 5,
  valAxisTitleFontSize: 5,
  chartArea: { fill: { color: C.plot }, border: { color: C.line, pt: 0.35 } },
  plotArea: { fill: { color: 'FBFCFE' }, border: { color: 'E6ECF5', pt: 0.25 } },
}

let slideNo = 0
for (let variantId = 1; variantId <= 49; variantId += 1) {
  slideNo += 1
  const gallery = pptx.ChartGallery.variants[variantId]
  const slide = pptx.addSlide()
  slide.background = { color: C.bg }
  slide.addText('CHART GALLERY ATLAS', { x: 0.25, y: 0.14, w: 3.7, h: 0.17, fontSize: 8.5, bold: true, color: C.cyan, charSpacing: 1.1, margin: 0 })
  slide.addText(`Office preset variant ${String(variantId).padStart(2, '0')}`, { x: 0.25, y: 0.35, w: 7.6, h: 0.36, fontFace: 'Aptos Display', fontSize: 20, bold: true, color: C.ink, margin: 0, fit: 'shrink' })
  slide.addText(`style catalog ${gallery.styleCatalogId}  ·  color catalog ${gallery.colorCatalogId}  ·  ${gallery._rawChartStyleName} / ${gallery._rawChartColorsName}`, { x: 7.7, y: 0.36, w: 5.3, h: 0.22, fontSize: 7.2, color: C.muted, align: 'right', margin: 0, fit: 'shrink' })
  slide.addText('Every supported family receives the same gallery variant; labels identify the chart family, not a hand-authored design.', { x: 0.25, y: 0.72, w: 12.75, h: 0.18, fontSize: 7.4, color: C.muted, margin: 0, fit: 'shrink' })

  families.forEach((family, index) => {
    const col = index % 6
    const row = Math.floor(index / 6)
    const x = 0.22 + col * 2.18
    const y = 0.96 + row * 2.13
    const palette = galleryColorPalettes[gallery.colorCatalogId] || galleryColorPalettes[2]
    const type = pptx.ChartType[family.type] || family.type
    const options = {
      ...baseChartOptions,
      ...((pptx.ChartStyles && pptx.ChartStyles[family.type]) || {}),
      chartGalleryVariant: variantId,
      chartColors: palette,
      x: x,
      y: y + 0.16,
      w: 2.02,
      h: 1.66,
      showLegend: false,
      showTitle: false,
      showValue: false,
      showPercent: false,
    }
    if (chartEx.has(family.key)) options.showLegend = false
    slide.addChart(type, family.data, options)
    slide.addText(family.label, { x, y: y + 1.85, w: 2.02, h: 0.15, fontSize: 7.2, bold: true, color: C.ink, align: 'center', margin: 0, fit: 'shrink' })
  })
  slide.addText(`${String(slideNo).padStart(2, '0')}  ·  18 families  ·  direct engine gallery atlas  ·  ${chartEx.has('treemap') ? 'legacy + ChartEx' : ''}`, { x: 0.25, y: 7.29, w: 12.8, h: 0.12, fontSize: 6.6, color: C.muted, margin: 0 })
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await pptx.writeFile({ fileName: outputPath })
await fs.rm(shadowRuntime, { force: true })
console.log(JSON.stringify({ ok: true, developmentOnly: true, runtimeSource: sourceRuntime, output: outputPath, slides: slideNo, variants: 49, chartFamiliesPerSlide: families.length, chartInstances: slideNo * families.length }, null, 2))
