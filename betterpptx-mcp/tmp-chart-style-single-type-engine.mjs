#!/usr/bin/env node
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const runtime = path.resolve(root, 'dist', 'pptxgen.es.js')
const shadow = path.resolve(here, '.betterpptx-runtime', `chart-style-single-${process.pid}.mjs`)
await fs.mkdir(path.dirname(shadow), { recursive: true })
await fs.copyFile(runtime, shadow)
const { default: PptxGenJS } = await import(pathToFileURL(shadow).href)
const styleCount = Math.max(1, Math.min(48, Number(process.argv[2] || 48)))

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const out = path.resolve(root, 'outputs', 'chart-style-single-type-engine', stamp)
await fs.mkdir(out, { recursive: true })
const pptxPath = path.join(out, 'engine-chart-style-reference.pptx')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX evolved engine'
pptx.title = 'Engine Chart Design style proof · 3-D clustered column'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }
const data = [
  { name: 'Series 1', labels: ['Story', 'Media', 'Motion', 'Quality'], values: [62, 74, 55, 70] },
  { name: 'Series 2', labels: ['Story', 'Media', 'Motion', 'Quality'], values: [82, 91, 78, 94] },
  { name: 'Series 3', labels: ['Story', 'Media', 'Motion', 'Quality'], values: [50, 64, 47, 86] },
]

for (let style = 1; style <= styleCount; style++) {
  const slide = pptx.addSlide()
  slide.background = { color: 'F7F9FC' }
  slide.addText('EVOLVED ENGINE ORACLE', { x: 0.36, y: 0.2, w: 3.2, h: 0.16, fontSize: 8, bold: true, color: '0F766E', charSpacing: 1.1, margin: 0 })
  slide.addText(`3-D clustered column · engine style ${String(style).padStart(2, '0')}`, { x: 0.36, y: 0.46, w: 9.8, h: 0.35, fontSize: 20, bold: true, color: '172033', margin: 0 })
  slide.addText('No manual chart palette. The chart receives only the captured Office gallery preset.', { x: 0.36, y: 0.88, w: 10.8, h: 0.2, fontSize: 8.5, color: '52606D', margin: 0 })
  slide.addChart('bar3D', data, {
    x: 1.25, y: 1.35, w: 10.85, h: 4.65,
    barDir: 'col', barGrouping: 'clustered',
    chartGalleryVariant: style,
    chartStyleId: style,
    chartStyleModernId: 100 + style,
    showTitle: false, showLegend: true, legendPos: 'b',
    v3DRotX: 18, v3DRotY: 28, v3DPerspective: 20,
  })
  slide.addText(`ChartGalleryVariant ${style} · ChartStyle ${style} · modern c14 ${100 + style}`, { x: 0.36, y: 7.18, w: 12.45, h: 0.14, fontSize: 6.7, color: '52606D', align: 'center', margin: 0 })
}

await pptx.writeFile({ fileName: pptxPath })
await fs.rm(shadow, { force: true })
console.log(JSON.stringify({ ok: true, output: pptxPath, chartType: 'bar3D', styleCount }, null, 2))
