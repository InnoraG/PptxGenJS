#!/usr/bin/env node
// TEMPORARY DEVELOPMENT-ONLY BUILDER — approved for the direct-library probe.
// This file deliberately imports the evolved ESM runtime directly. It is not
// a production authoring route; production decks must use the public MCP flow.
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const evolvedRuntimePath = path.resolve(here, '..', 'dist', 'pptxgen.es.js')
const runtimeShadowPath = path.resolve(here, '.betterpptx-runtime', `direct-library-${process.pid}.mjs`)
await fs.mkdir(path.dirname(runtimeShadowPath), { recursive: true })
await fs.copyFile(evolvedRuntimePath, runtimeShadowPath)
const { default: PptxGenJS } = await import(pathToFileURL(runtimeShadowPath).href)

const outputPath = path.resolve(here, 'outputs', 'showcases', 'two-brain-dev', 'direct-library-builder-dev-20260806.pptx')
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX direct-library development probe'
pptx.subject = 'Development-only evolved PptxGenJS import'
pptx.title = 'Direct library authoring probe'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Aptos',
  lang: 'en-US',
}

const colors = { bg: '0E1117', panel: '171D27', ink: 'F6F0E4', muted: 'B8C1D1', gold: 'E3B341', cyan: '55D6BE' }
const addCanvas = slide => {
  slide.background = { color: colors.bg }
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.12, fill: { color: colors.gold }, line: { color: colors.gold, transparency: 100 } })
}
const addTitle = (slide, title, kicker) => {
  slide.addText(kicker, { x: 0.78, y: 0.55, w: 4.5, h: 0.25, fontFace: 'Aptos', fontSize: 10, bold: true, color: colors.cyan, charSpacing: 1.4, margin: 0 })
  slide.addText(title, { x: 0.78, y: 0.95, w: 11.6, h: 0.7, fontFace: 'Aptos Display', fontSize: 28, bold: true, color: colors.ink, margin: 0, fit: 'shrink' })
}

{
  const slide = pptx.addSlide(); addCanvas(slide)
  slide.addText('DIRECT LIBRARY BRAIN', { x: 0.8, y: 2.05, w: 5.8, h: 0.35, fontSize: 14, bold: true, color: colors.cyan, charSpacing: 1.6, margin: 0 })
  slide.addText('The authoring brain makes the first move.', { x: 0.8, y: 2.55, w: 11.5, h: 1.0, fontFace: 'Aptos Display', fontSize: 34, bold: true, color: colors.ink, margin: 0, fit: 'shrink' })
  slide.addText('This temporary deck is built by importing the evolved dist/pptxgen.es.js runtime directly.', { x: 0.82, y: 3.85, w: 8.8, h: 0.6, fontSize: 18, color: colors.muted, margin: 0.02, breakLine: false, fit: 'shrink' })
}

{
  const slide = pptx.addSlide(); addCanvas(slide); addTitle(slide, 'Meaning first. Geometry second.', 'DIRECT AUTHORING')
  slide.addText('The direct builder chooses the story, visual emphasis, and proof objects before the runtime serializes the deck.', { x: 0.82, y: 2.05, w: 6.0, h: 1.1, fontSize: 20, color: colors.ink, margin: 0.03, fit: 'shrink' })
  slide.addShape(pptx.ShapeType.roundRect, { x: 7.25, y: 1.85, w: 4.9, h: 2.25, rectRadius: 0.08, fill: { color: colors.panel, transparency: 3 }, line: { color: colors.gold, width: 1.2 } })
  slide.addText('DIRECT BRAIN', { x: 7.65, y: 2.2, w: 3.7, h: 0.3, fontSize: 12, bold: true, color: colors.gold, margin: 0 })
  slide.addText('story → hierarchy → proof → package', { x: 7.65, y: 2.72, w: 3.9, h: 0.6, fontSize: 21, bold: true, color: colors.ink, margin: 0.02, fit: 'shrink' })
  slide.addText('No MCP transport is involved in this probe.', { x: 7.65, y: 3.55, w: 3.9, h: 0.3, fontSize: 11, color: colors.muted, margin: 0 })
}

{
  const slide = pptx.addSlide(); addCanvas(slide); addTitle(slide, 'Proof should be visible.', 'DIRECT LIBRARY CAPABILITY')
  const metrics = [['Story', '92'], ['World', '96'], ['Timing', '88'], ['Quality', '100']]
  metrics.forEach(([label, value], i) => {
    const x = 0.95 + i * 2.95
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.05, w: 2.35, h: 2.15, rectRadius: 0.06, fill: { color: colors.panel }, line: { color: colors.gold, width: 0.8 } })
    slide.addText(value, { x: x + 0.22, y: 2.42, w: 1.9, h: 0.62, fontSize: 28, bold: true, color: colors.ink, margin: 0, align: 'center' })
    slide.addText(label, { x: x + 0.22, y: 3.32, w: 1.9, h: 0.28, fontSize: 13, color: colors.muted, margin: 0, align: 'center' })
  })
  slide.addText('Direct-library probe · evolved runtime · development only', { x: 0.82, y: 5.15, w: 7.5, h: 0.3, fontSize: 11, color: colors.muted, margin: 0 })
}

await pptx.writeFile({ fileName: outputPath })
await fs.rm(runtimeShadowPath, { force: true })
console.log(JSON.stringify({ ok: true, developmentOnly: true, runtimeSource: evolvedRuntimePath, runtimeImportedAs: runtimeShadowPath, output: outputPath, slides: pptx._slides?.length || null }, null, 2))
