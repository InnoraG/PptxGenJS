#!/usr/bin/env node
// Development-only exhaustive chart preset atlas.
// This intentionally imports the evolved pptxgen.es.js runtime so the engine
// can be inspected without the MCP recommendation layer.
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sourceRuntime = path.resolve(root, 'dist', 'pptxgen.es.js')
const shadowRuntime = path.resolve(here, '.betterpptx-runtime', `chart-style-atlas-ultimate-${process.pid}.mjs`)
await fs.mkdir(path.dirname(shadowRuntime), { recursive: true })
await fs.copyFile(sourceRuntime, shadowRuntime)
const { default: PptxGenJS } = await import(pathToFileURL(shadowRuntime).href)

const out = path.resolve(root, 'outputs', 'showcases', 'chart-only-dev', 'chart-style-gallery-atlas-ultimate-20260807.pptx')
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX native chart preset atlas'
pptx.title = 'Ultimate native chart style and color preset atlas'
pptx.subject = '49 package-authored Office chart style/color variants across every supported runtime chart family'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }

const C = { ink: '172033', muted: '52606D', teal: '0F766E', cyan: '0891B2', line: 'D6DEE8', bg: 'F7F9FC', soft: 'EEF4F7', white: 'FFFFFF', amber: 'B45309', dark: '243447' }
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
const families = [['area','Area'],['bar','Bar'],['bar3D','Bar 3-D'],['bubble','Bubble'],['bubble3D','Bubble 3-D'],['doughnut','Doughnut'],['funnel','Funnel'],['histogram','Histogram'],['line','Line'],['pareto','Pareto'],['pie','Pie'],['radar','Radar'],['regionMap','Region map'],['scatter','Scatter'],['sunburst','Sunburst'],['treemap','Treemap'],['waterfall','Waterfall'],['boxWhisker','Box & whisker']]
const chartEx = new Set(['funnel','histogram','pareto','boxWhisker','regionMap','sunburst','treemap','waterfall'])
const catalog = JSON.parse(await fs.readFile(path.resolve(root, 'outputs/chart-com-matrix/20260601_181757/chart_catalog.json'), 'utf8'))
const baseSpecimens = catalog.specimens.filter(item => item.OptionSet === 'base')

function addHeader(slide, kicker, title, subtitle) {
  slide.background = { color: C.bg }
  slide.addText(kicker.toUpperCase(), { x: 0.34, y: 0.18, w: 3.8, h: 0.16, fontSize: 8.5, bold: true, color: C.teal, charSpacing: 1.2, margin: 0 })
  slide.addText(title, { x: 0.34, y: 0.42, w: 12.3, h: 0.42, fontFace: 'Aptos Display', fontSize: 22, bold: true, color: C.ink, margin: 0, fit: 'shrink' })
  slide.addText(subtitle, { x: 0.35, y: 0.91, w: 12.25, h: 0.24, fontSize: 9, color: C.muted, margin: 0, fit: 'shrink' })
  slide.addShape(pptx.ShapeType.line, { x: 0.35, y: 1.18, w: 12.6, h: 0, line: { color: C.line, width: 0.8 } })
}

// 1. Contract overview.
{
  const s = pptx.addSlide(); addHeader(s, 'Authoring Excellence / chart presets', '49 Office variants × 18 runtime families', 'The engine now exposes the package-authored style/color combinations as first-class presets. Visible ribbon tile counts remain an explicit UI-oracle concern and are never guessed from the legacy ChartStyle range.')
  const cards = [['49','package gallery variants','49 style/color resource links from the COM corpus'],['13','style payload families','deduplicated XML style families'],['12','color payload families','deduplicated XML color families'],['85','COM base specimens','all native chart variants in the frozen corpus'],['18','runtime families','the supported PptxGenJS chart authoring surface'],['48','legacy style IDs','c:style read-back states; not the visible tile count']]
  cards.forEach(([n,l,d],i)=>{ const col=i%3,row=Math.floor(i/3); const x=0.55+col*4.18,y=1.55+row*1.62; s.addShape(pptx.ShapeType.roundRect,{x,y,w:3.72,h:1.26,rectRadius:0.06,fill:{color:C.white},line:{color:C.line,width:0.8}}); s.addText(n,{x:x+0.18,y:y+0.16,w:0.75,h:0.36,fontSize:25,bold:true,color:C.teal,margin:0}); s.addText(l,{x:x+1.03,y:y+0.2,w:2.45,h:0.2,fontSize:10,bold:true,color:C.ink,margin:0,fit:'shrink'}); s.addText(d,{x:x+1.03,y:y+0.5,w:2.43,h:0.46,fontSize:8.2,color:C.muted,margin:0,fit:'shrink'}); })
  s.addText('Selection rule', { x: 0.58, y: 5.1, w: 1.3, h: 0.18, fontSize: 9, bold: true, color: C.amber, margin: 0 })
  s.addText('AI chooses a chart family first, then selects a compatible Office preset; chart-type-specific ribbon tile visibility is validated separately by UI capture.', { x: 1.78, y: 5.1, w: 10.55, h: 0.24, fontSize: 10, color: C.ink, margin: 0, fit: 'shrink' })
}

// 2–4. Frozen COM coverage index.
for (let page = 0; page < 3; page++) {
  const s = pptx.addSlide(); addHeader(s, 'Frozen COM corpus / coverage index', `Base specimen coverage ${page + 1} of 3`, 'The source corpus contains 85 base chart specimens; these names are the provenance index for the 18 runtime families shown in the atlas that follows.')
  const rows = baseSpecimens.slice(page * 30, (page + 1) * 30)
  rows.forEach((item,i)=>{ const col=i%2,row=Math.floor(i/2); const x=0.55+col*6.35,y=1.38+row*0.35; s.addText(`${String(page*30+i+1).padStart(2,'0')}  ${item.Name}`,{x,y,w:3.7,h:0.17,fontSize:8.3,bold:true,color:C.ink,margin:0,fit:'shrink'}); s.addText(`${item.Family} · COM ${item.ChartType} · ${item.ExpectedChartTag}`,{x:x+3.6,y,w:2.65,h:0.17,fontSize:7.2,color:C.muted,align:'right',margin:0,fit:'shrink'}); })
}

// 49 preset pages. Each page is a visual application of one exact engine
// preset; all 18 runtime families are present, while variant 49 is correctly
// limited to the eight ChartEx families that can carry the ChartEx resource.
for (let preset = 1; preset <= 49; preset++) {
  const s = pptx.addSlide();
  const modern = preset <= 12 ? `modern c14 ${100 + preset}` : `legacy fallback c:${preset}`
  addHeader(s, 'Office Chart Design preset atlas', `Preset ${String(preset).padStart(2,'0')} · ${modern}`, preset === 49 ? 'ChartEx-only package variant; legacy families are intentionally omitted from this page.' : 'The same exact package-authored style/color preset is applied to every compatible runtime family. No hand-authored palette is substituted.')
  families.forEach(([key,label],i)=>{
    const col=i%6,row=Math.floor(i/6),x=0.26+col*2.16,y=1.38+row*2.05
    const compatible = preset !== 49 || chartEx.has(key)
    if (compatible) {
      const options = { chartGalleryVariant: preset, x, y:y+0.12, w:1.98, h:1.48, showTitle:false, showLegend:false, showValue:false, showPercent:false }
      if (key === 'radar') options.catAxisLabelPos = 'none'
      if (key === 'bar3D') Object.assign(options, { barDir: 'col', v3DRotX: 18, v3DRotY: 28, v3DPerspective: 20 })
      if (preset <= 48) { options.chartStyleId = preset; if (preset <= 12) options.chartStyleModernId = 100 + preset }
      try { s.addChart(pptx.ChartType[key] || key, data[key], options) } catch (error) { s.addText(`Unavailable: ${label}`, { x, y:y+0.48, w:1.98, h:0.28, fontSize:8, color:C.amber, align:'center', margin:0 }) }
    } else {
      s.addShape(pptx.ShapeType.roundRect,{x,y:y+0.12,w:1.98,h:1.48,rectRadius:0.04,fill:{color:C.soft},line:{color:C.line,width:0.7}})
      s.addText('ChartEx only', { x:x+0.12,y:y+0.73,w:1.74,h:0.18,fontSize:8.5,bold:true,color:C.muted,align:'center',margin:0 })
    }
    s.addText(label,{x,y:y+1.66,w:1.98,h:0.15,fontSize:7.2,bold:true,color:C.ink,align:'center',margin:0,fit:'shrink'})
  })
  s.addText(`${String(preset).padStart(2,'0')} · 49 engine presets · 18 runtime families · 85 COM base specimens indexed`,{x:0.35,y:7.28,w:12.3,h:0.12,fontSize:6.8,color:C.muted,margin:0,align:'center'})
}

await fs.mkdir(path.dirname(out), { recursive: true })
await pptx.writeFile({ fileName: out })
await fs.rm(shadowRuntime, { force: true })
console.log(JSON.stringify({ ok:true, output:out, slides:53, presetPages:49, runtimeFamilies:families.length, chartInstances:48*families.length + 49*chartEx.size, baseSpecimens:baseSpecimens.length, note:'Preset 49 is ChartEx-only; visible ribbon tile counts require the UI corpus.' }, null, 2))
