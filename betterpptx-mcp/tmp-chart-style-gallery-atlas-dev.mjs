#!/usr/bin/env node
// TEMPORARY DEVELOPMENT-ONLY NATIVE RIBBON STYLE ATLAS.
// Directly imports the evolved dist/pptxgen.es.js runtime; no MCP/spec route.
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourceRuntime = path.resolve(here, '..', 'dist', 'pptxgen.es.js')
const shadowRuntime = path.resolve(here, '.betterpptx-runtime', `chart-style-atlas-${process.pid}.mjs`)
await fs.mkdir(path.dirname(shadowRuntime), { recursive: true })
await fs.copyFile(sourceRuntime, shadowRuntime)
const { default: PptxGenJS } = await import(pathToFileURL(shadowRuntime).href)

const out = path.resolve(here, 'outputs', 'showcases', 'chart-only-dev', 'chart-style-gallery-atlas-direct-20260807.pptx')
const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX native ribbon style atlas'; pptx.title = 'Native PowerPoint chart style gallery atlas'; pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }
const data = {
  area: [{ name: 'Core', labels: ['Jan','Feb','Mar','Apr','May','Jun'], values: [12,19,28,39,53,64] }, { name: 'Expansion', labels: ['Jan','Feb','Mar','Apr','May','Jun'], values: [4,9,16,25,34,46] }],
  bar: [{ name: 'Baseline', labels: ['Story','Media','Motion','Quality'], values: [72,81,68,86] }, { name: 'Target', labels: ['Story','Media','Motion','Quality'], values: [88,92,84,96] }],
  bar3D: [{ name: 'FY25', labels: ['Story','Media','Motion','Quality'], values: [62,74,55,70] }, { name: 'FY26', labels: ['Story','Media','Motion','Quality'], values: [82,91,78,94] }],
  bubble: [{ name: 'X-Axis', values: [1,2,3,4,5,6] }, { name: 'Reach', values: [42,48,55,67,76,88], sizes: [8,12,18,24,30,38] }, { name: 'Depth', values: [28,36,44,58,69,79], sizes: [6,10,15,20,26,34] }],
  bubble3D: [{ name: 'X-Axis', values: [1,2,3,4,5,6] }, { name: 'Reach', values: [42,48,55,67,76,88], sizes: [8,12,18,24,30,38] }, { name: 'Depth', values: [28,36,44,58,69,79], sizes: [6,10,15,20,26,34] }],
  doughnut: [{ name: 'Mix', labels: ['Story','World','Proof','Motion','Data','Identity'], values: [26,22,18,14,12,8] }],
  funnel: [{ name: 'Pipeline', labels: ['Brief','Research','Draft','Review','Approved','Live'], values: [100,88,72,56,41,24] }],
  histogram: [{ name: 'Latency', values: [4,7,9,11,12,13,14,16,18,19,21,22,24,26,27,29,31,32,35,38,41,44,47,52] }],
  line: [{ name: 'Adoption', labels: ['Q1','Q2','Q3','Q4','Q5','Q6'], values: [28,41,57,68,76,86] }, { name: 'Quality', labels: ['Q1','Q2','Q3','Q4','Q5','Q6'], values: [61,67,73,81,89,94] }],
  pareto: [{ name: 'Issue class', labels: ['Layout','Media','Timing','Style','Identity','Data'], values: [42,26,19,15,12,10] }],
  pie: [{ name: 'Allocation', labels: ['Story','World','Proof','Motion','Data','Identity'], values: [31,23,17,13,9,7] }],
  radar: [{ name: 'Direct', labels: ['Story','World','Proof','Motion','Quality','Identity'], values: [92,96,88,84,100,91] }, { name: 'Reference', labels: ['Story','World','Proof','Motion','Quality','Identity'], values: [95,94,91,90,98,93] }],
  regionMap: [{ name: 'Adoption', labels: ['United States','United Kingdom','Kenya','India','Australia','Canada'], values: [82,68,54,47,39,63] }],
  scatter: [{ name: 'X-Axis', values: [1,2,3,4,5,6] }, { name: 'Quality', values: [42,48,55,67,76,88] }, { name: 'Speed', values: [28,36,44,58,69,79] }],
  sunburst: [{ name: 'Portfolio', labels: [['Core','Core','Core','Growth','Growth','Labs','Labs','Labs'], ['Decks','Media','Identity','Decks','Media','Research','Tools','QA'], ['2026','2026','2026','2026','2026','2026','2026','2026']], values: [36,22,14,18,14,7,5,3] }],
  treemap: [{ name: 'Portfolio', labels: [['Core','Core','Core','Growth','Growth','Labs','Labs','Labs'], ['Decks','Media','Identity','Decks','Media','Research','Tools','QA'], ['2026','2026','2026','2026','2026','2026','2026','2026']], values: [36,22,14,18,14,7,5,3] }],
  waterfall: [{ name: 'Bridge', labels: ['Start','Story','Media','Motion','Quality','End'], values: [100,18,-12,22,9,137] }],
  boxWhisker: [{ name: 'Build A', labels: ['Latency'], values: [12,14,18,19,21,27,31,44] }, { name: 'Build B', labels: ['Latency'], values: [9,11,14,16,17,23,25,31] }, { name: 'Build C', labels: ['Latency'], values: [16,18,22,25,25,33,39,48] }],
}
const families = [['area','Area'],['bar','Bar'],['bar3D','Bar 3D'],['bubble','Bubble'],['bubble3D','Bubble 3D'],['doughnut','Doughnut'],['funnel','Funnel'],['histogram','Histogram'],['line','Line'],['pareto','Pareto'],['pie','Pie'],['radar','Radar'],['regionMap','Region map'],['scatter','Scatter'],['sunburst','Sunburst'],['treemap','Treemap'],['waterfall','Waterfall'],['boxWhisker','Box & whisker']]
const chartEx = new Set(['funnel','histogram','pareto','boxWhisker','regionMap','sunburst','treemap','waterfall'])
for (let style = 1; style <= 48; style += 1) {
  const slide = pptx.addSlide(); slide.background = { color: 'FFFFFF' }
  slide.addText('NATIVE CHART STYLE GALLERY', { x: 0.25, y: 0.14, w: 4, h: 0.18, fontSize: 8.5, bold: true, color: '0F766E', charSpacing: 1.1, margin: 0 })
  slide.addText(`Ribbon style ${String(style).padStart(2,'0')} · ${style <= 12 ? `modern c14 ${100 + style}` : `native fallback c ${style}`}`, { x: 0.25, y: 0.36, w: 8, h: 0.35, fontFace: 'Aptos Display', fontSize: 19, bold: true, color: '172033', margin: 0 })
  slide.addText('The same native PowerPoint style is applied to every supported family; color selection is intentionally left to the ribbon style.', { x: 0.25, y: 0.72, w: 12.8, h: 0.18, fontSize: 7.4, color: '52606D', margin: 0, fit: 'shrink' })
  families.forEach(([key, label], index) => {
    const col = index % 6; const row = Math.floor(index / 6); const x = 0.22 + col * 2.18; const y = 0.96 + row * 2.13
    const type = pptx.ChartType[key] || key
    const modernStyleId = style <= 12 ? 100 + style : undefined
    slide.addChart(type, data[key], { chartStyleId: style, ...(modernStyleId ? { chartStyleModernId: modernStyleId } : {}), x, y: y + 0.16, w: 2.02, h: 1.66, showTitle: false, showLegend: false, showValue: false, showPercent: false })
    slide.addText(label, { x, y: y + 1.85, w: 2.02, h: 0.15, fontSize: 7.2, bold: true, color: '172033', align: 'center', margin: 0, fit: 'shrink' })
  })
  slide.addText(`${String(style).padStart(2,'0')} · native style gallery · 18 chart families · ${chartEx.size} ChartEx families`, { x: 0.25, y: 7.29, w: 12.8, h: 0.12, fontSize: 6.6, color: '52606D', margin: 0 })
}
await fs.mkdir(path.dirname(out), { recursive: true }); await pptx.writeFile({ fileName: out }); await fs.rm(shadowRuntime, { force: true })
console.log(JSON.stringify({ ok: true, output: out, slides: 48, chartFamiliesPerSlide: families.length, chartInstances: 48 * families.length, nativeFallbackStyleIds: '1-48', nativeModernStyleIds: '101-112' }, null, 2))
