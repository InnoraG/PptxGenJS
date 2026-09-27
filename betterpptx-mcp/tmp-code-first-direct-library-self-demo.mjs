#!/usr/bin/env node
// TEMPORARY DEVELOPMENT-ONLY CODE-FIRST SELF-DEMONSTRATION.
// Pure direct authoring through the evolved dist/pptxgen.es.js runtime.
// This intentionally bypasses MCP/spec compilation for comparison only.
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const evolvedRuntimePath = path.resolve(here, '..', 'dist', 'pptxgen.es.js')
const runtimeShadowPath = path.resolve(here, '.betterpptx-runtime', `code-first-${process.pid}.mjs`)
await fs.mkdir(path.dirname(runtimeShadowPath), { recursive: true })
await fs.copyFile(evolvedRuntimePath, runtimeShadowPath)
const { default: PptxGenJS } = await import(pathToFileURL(runtimeShadowPath).href)

const outputPath = path.resolve(here, 'outputs', 'showcases', 'code-first-dev', 'authoring-excellence-code-first-direct-20260807.pptx')
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX code-first development brain'
pptx.company = 'BetterPPTX'
pptx.subject = 'Direct evolved PptxGenJS self-demonstration'
pptx.title = 'Code-first authoring excellence'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }

const C = {
  bg: '0D1117', panel: '171D27', panel2: '202733', ink: 'F7F1E3', muted: 'B8C2D3', gold: 'E6B84E', cyan: '5EEAD4', blue: '72A7FF', rose: 'F38BA8', line: '394354', white: 'FFFFFF', green: 'A3E635',
}
const W = 13.333
const H = 7.5
const addCanvas = (slide, accent = C.gold) => {
  slide.background = { color: C.bg }
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.1, fill: { color: accent }, line: { color: accent, transparency: 100 } })
  slide.addText('CODE-FIRST / DIRECT LIBRARY', { x: 0.72, y: 7.02, w: 4.0, h: 0.18, fontSize: 9, bold: true, color: C.muted, charSpacing: 1.1, margin: 0 })
}
const addTitle = (slide, title, kicker = 'AUTHORING EXCELLENCE') => {
  slide.addText(kicker, { x: 0.72, y: 0.42, w: 5.8, h: 0.2, fontSize: 10, bold: true, color: C.cyan, charSpacing: 1.2, margin: 0 })
  slide.addText(title, { x: 0.72, y: 0.78, w: 11.8, h: 0.62, fontFace: 'Aptos Display', fontSize: 35, bold: true, color: C.ink, margin: 0, fit: 'shrink' })
}
const addBody = (slide, text, opts = {}) => slide.addText(text, { fontSize: 17, color: C.muted, margin: 0.02, breakLine: false, fit: 'shrink', ...opts })
const addNode = (slide, x, y, w, h, title, body, color = C.gold) => {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: C.panel }, line: { color, width: 1.1 } })
  slide.addText(title, { x: x + 0.18, y: y + 0.18, w: w - 0.36, h: 0.28, fontSize: 18, bold: true, color: C.ink, margin: 0, fit: 'shrink' })
  slide.addText(body, { x: x + 0.18, y: y + 0.58, w: w - 0.36, h: h - 0.72, fontSize: 13, color: C.muted, margin: 0.01, fit: 'shrink' })
}

// 1 — Cover: direct code is the authoring brain.
{
  const s = pptx.addSlide(); addCanvas(s)
  s.addText('CODE-FIRST AUTHORING', { x: 0.78, y: 2.05, w: 5.2, h: 0.28, fontSize: 14, bold: true, color: C.cyan, charSpacing: 1.5, margin: 0 })
  s.addText('Code can be a design brain.', { x: 0.78, y: 2.52, w: 11.5, h: 0.9, fontFace: 'Aptos Display', fontSize: 50, bold: true, color: C.ink, margin: 0, fit: 'shrink' })
  addBody(s, 'A direct PptxGenJS authoring pass can still think in story, proof, hierarchy, composition, and timing.', { x: 0.82, y: 3.78, w: 8.9, h: 0.7, fontSize: 22, color: C.muted })
}

// 2 — World thesis and visual tokens.
{
  const s = pptx.addSlide(); addCanvas(s); addTitle(s, 'A complete world starts with a visual thesis.')
  addBody(s, 'The code chooses one coherent visual language before it starts placing objects.', { x: 0.75, y: 1.68, w: 6.0, h: 0.55 })
  s.addShape(pptx.ShapeType.roundRect, { x: 7.35, y: 1.7, w: 4.9, h: 3.75, rectRadius: 0.08, fill: { color: C.panel }, line: { color: C.gold, width: 1.1 } })
  s.addText('LUXE / COMPLETE WORLD', { x: 7.75, y: 2.08, w: 3.7, h: 0.25, fontSize: 13, bold: true, color: C.gold, charSpacing: 1.1, margin: 0 })
  s.addText('Warm depth\nrestrained accent\neditorial hierarchy', { x: 7.75, y: 2.55, w: 3.8, h: 1.35, fontFace: 'Aptos Display', fontSize: 25, bold: true, color: C.ink, margin: 0.01, breakLine: false, fit: 'shrink' })
  const swatches = [C.gold, C.cyan, C.blue, C.rose]
  swatches.forEach((color, i) => s.addShape(pptx.ShapeType.roundRect, { x: 7.75 + i * 0.82, y: 4.48, w: 0.56, h: 0.25, rectRadius: 0.03, fill: { color }, line: { color, transparency: 100 } }))
  addBody(s, 'The visual system is authored once, then reused deliberately.', { x: 0.75, y: 4.42, w: 5.5, h: 0.5, color: C.ink, fontSize: 20 })
}

// 3 — Semantic composition with connectors created before nodes.
{
  const s = pptx.addSlide(); addCanvas(s, C.cyan); addTitle(s, 'Semantic composition is still possible in code.')
  addBody(s, 'The builder creates relationships first, then places readable nodes on the grid.', { x: 0.75, y: 1.6, w: 7.3, h: 0.52 })
  // Connectors first so they remain behind nodes.
  const y = 3.25
  ;[[2.85, 5.05], [6.25, 8.45], [9.65, 11.85]].forEach(([x1, x2]) => s.addShape(pptx.ShapeType.line, { x: x1, y, w: x2 - x1, h: 0, line: { color: C.cyan, width: 2, beginArrowType: 'none', endArrowType: 'triangle' } }))
  addNode(s, 0.85, 2.55, 2.25, 1.55, 'Story', 'What must the audience understand?', C.gold)
  addNode(s, 4.25, 2.55, 2.25, 1.55, 'Proof', 'Which evidence changes the conclusion?', C.cyan)
  addNode(s, 7.65, 2.55, 2.25, 1.55, 'World', 'Which visual language makes it legible?', C.blue)
  addNode(s, 11.05, 2.55, 1.45, 1.55, 'Act', 'What happens next?', C.rose)
}

// 4 — Native chart as proof.
{
  const s = pptx.addSlide(); addCanvas(s); addTitle(s, 'Proof objects change the conclusion.')
  s.addChart(pptx.ChartType.bar, [{ name: 'Signal', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [42, 51, 63, 82] }], { x: 0.8, y: 1.7, w: 7.0, h: 4.25, showLegend: false, showTitle: false, chartColors: [C.gold], catAxisLabelColor: C.muted, valAxisLabelColor: C.muted, valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20, showValue: true })
  s.addShape(pptx.ShapeType.roundRect, { x: 8.35, y: 2.05, w: 3.95, h: 2.75, rectRadius: 0.06, fill: { color: C.panel }, line: { color: C.gold, width: 1.1 } })
  s.addText('READ THE SIGNAL', { x: 8.72, y: 2.42, w: 2.8, h: 0.24, fontSize: 12, bold: true, color: C.gold, charSpacing: 1, margin: 0 })
  addBody(s, 'Q4 is not merely higher. It is the first quarter where the trend becomes decision-grade.', { x: 8.72, y: 2.95, w: 3.1, h: 1.2, fontSize: 19, color: C.ink })
}

// 5 — Native table and KPI proof.
{
  const s = pptx.addSlide(); addCanvas(s, C.blue); addTitle(s, 'Tables and KPIs can carry meaning.')
  const kpis = [['92', 'Story'], ['96', 'World'], ['88', 'Timing']]
  kpis.forEach(([value, label], i) => {
    const x = 0.82 + i * 2.15
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.72, w: 1.78, h: 1.25, rectRadius: 0.05, fill: { color: C.panel }, line: { color: C.blue, width: 0.9 } })
    s.addText(value, { x: x + 0.1, y: 1.98, w: 1.58, h: 0.45, fontSize: 28, bold: true, color: C.ink, align: 'center', margin: 0 })
    s.addText(label, { x: x + 0.1, y: 2.55, w: 1.58, h: 0.2, fontSize: 12, color: C.muted, align: 'center', margin: 0 })
  })
  s.addTable([['Gate', 'Owner', 'Readback'], ['World', 'AI', 'Luxe complete'], ['Layout', 'Engine', 'Balanced regions'], ['Timing', 'AI + engine', 'Narration master clock']], { x: 7.15, y: 1.72, w: 5.2, h: 3.55, border: { color: C.line, width: 1 }, fontSize: 13, color: C.ink, fill: C.panel, margin: 0.08, autoFit: false, rowH: 0.82 })
  addBody(s, 'The code makes the claim inspectable instead of hiding it in decoration.', { x: 0.82, y: 4.05, w: 5.4, h: 0.52, color: C.ink, fontSize: 19 })
}

// 6 — Process diagram.
{
  const s = pptx.addSlide(); addCanvas(s, C.cyan); addTitle(s, 'A process is a story, not a list.')
  const nodes = [
    { x: 0.85, title: 'Discover', body: 'Read the capability surface.' },
    { x: 3.95, title: 'Choose', body: 'Make the design decision.' },
    { x: 7.05, title: 'Compose', body: 'Place proof and hierarchy.' },
    { x: 10.15, title: 'Verify', body: 'Render, inspect, and correct.' },
  ]
  nodes.slice(0, -1).forEach((node, i) => s.addShape(pptx.ShapeType.line, { x: node.x + 2.3, y: 3.15, w: 0.8, h: 0, line: { color: C.cyan, width: 2, endArrowType: 'triangle' } }))
  nodes.forEach(node => addNode(s, node.x, 2.35, 2.3, 1.55, node.title, node.body, C.cyan))
  addBody(s, 'The direct code path is explicit enough to be audited and expressive enough to be authored.', { x: 0.85, y: 4.65, w: 10.8, h: 0.52, color: C.ink, fontSize: 19 })
}

// 7 — Animation/timing authored as a sequence.
{
  const s = pptx.addSlide(); addCanvas(s, C.rose); addTitle(s, 'Motion is authored as timing, not decoration.')
  const items = [
    { x: 0.9, label: '0 ms', title: 'Claim', color: C.gold },
    { x: 4.15, label: '900 ms', title: 'Evidence', color: C.cyan },
    { x: 7.4, label: '1800 ms', title: 'Decision', color: C.rose },
  ]
  items.forEach(item => {
    const animationTarget = `timing-${item.label.replace(/\s+/g, '-')}`
    s.addShape(pptx.ShapeType.roundRect, { x: item.x, y: 2.35, w: 2.55, h: 1.55, rectRadius: 0.06, fill: { color: C.panel }, line: { color: item.color, width: 1.2 }, objectName: animationTarget })
    s.addText(item.label, { x: item.x + 0.18, y: 2.62, w: 2.2, h: 0.22, fontSize: 12, bold: true, color: item.color, margin: 0 })
    s.addText(item.title, { x: item.x + 0.18, y: 3.0, w: 2.15, h: 0.35, fontSize: 22, bold: true, color: C.ink, margin: 0 })
    s.addAnimation(animationTarget, { type: 'entrance', effect: 'fade', trigger: item.label === '0 ms' ? 'onClick' : 'afterPrevious', delay: item.label === '0 ms' ? 0 : 900, duration: 500 })
  })
  addBody(s, 'The voice or narrative clock can remain authoritative while objects follow measured cues.', { x: 0.9, y: 4.65, w: 10.8, h: 0.55, color: C.ink, fontSize: 19 })
}

// 8 — Close.
{
  const s = pptx.addSlide(); addCanvas(s)
  s.addText('THE DIRECT-LIBRARY LESSON', { x: 0.78, y: 2.1, w: 5.5, h: 0.25, fontSize: 13, bold: true, color: C.cyan, charSpacing: 1.3, margin: 0 })
  s.addText('Code unleashes the brain.\nRules keep the result excellent.', { x: 0.78, y: 2.55, w: 11.4, h: 1.45, fontFace: 'Aptos Display', fontSize: 42, bold: true, color: C.ink, margin: 0.01, fit: 'shrink' })
  addBody(s, 'The strongest system keeps authorial intelligence high and geometry, package integrity, and verification explicit.', { x: 0.82, y: 4.55, w: 9.8, h: 0.62, fontSize: 21, color: C.muted })
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await pptx.writeFile({ fileName: outputPath })
await fs.rm(runtimeShadowPath, { force: true })
console.log(JSON.stringify({ ok: true, developmentOnly: true, runtimeSource: evolvedRuntimePath, output: outputPath, slides: 8 }, null, 2))
