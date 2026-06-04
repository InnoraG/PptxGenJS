#!/usr/bin/env node
// Local engine smoke for v1 narration. Uses the development-only tone provider
// so the package/timing path can be verified without a Piper sidecar.

import * as path from 'node:path'
import { callClaudePptxTool } from './engine.mjs'

process.env.CLAUDEPPTX_NARRATION_MODE ||= 'development'
process.env.CLAUDEPPTX_TTS_PROVIDER ||= 'tone'
process.env.CLAUDEPPTX_OUT_DIR ||= path.resolve('outputs', 'narration-smoke')

async function tool(name, args) {
	const res = await callClaudePptxTool(name, args)
	if (!res.ok) throw new Error(`${name}: ${res.error?.message || 'failed'}`)
	return res.data
}

const deck = await tool('claudepptx.deck.new', { layout: 'LAYOUT_WIDE', title: 'Narration Smoke' })
const deckId = deck.deckId
const s1 = await tool('claudepptx.slide.add', { deckId, notes: 'Narration starts automatically on this slide.' })
await tool('claudepptx.slide.add_text', { deckId, slideIndex: s1.slideIndex, text: 'Narration smoke', options: { x: 0.8, y: 0.7, w: 7, h: 0.6, fontSize: 32, bold: true, objectName: 'title-1' } })
await tool('claudepptx.slide.add_narration', { deckId, slideIndex: s1.slideIndex, script: 'This is the first narrated slide. It uses a deterministic test tone for local verification.', provider: 'tone', captions: { enabled: true, items: [{ text: 'Narration starts automatically.', atMs: 200, endMs: 1800 }] } })

const s2 = await tool('claudepptx.slide.add', { deckId })
await tool('claudepptx.slide.add_shape', { deckId, slideIndex: s2.slideIndex, shapeName: 'rect', options: { x: 1, y: 1.6, w: 3, h: 1, fill: { color: '2F80ED' }, line: { color: '1B4D89' }, objectName: 'cue-box' }, text: 'Cue target' })
await tool('claudepptx.slide.add_narration', { deckId, slideIndex: s2.slideIndex, script: 'The blue box animates during this narration cue.', provider: 'tone', cues: [{ atMs: 650, target: 'cue-box', type: 'emphasis', effect: 'pulse' }], captions: { enabled: true, items: [{ text: 'Cue synchronized animation.', atMs: 650, endMs: 2300 }] } })

const s3 = await tool('claudepptx.slide.add', { deckId })
await tool('claudepptx.slide.add_text', { deckId, slideIndex: s3.slideIndex, text: 'Validation slide', options: { x: 0.8, y: 0.8, w: 8, h: 0.6, fontSize: 28, objectName: 'title-3' } })
await tool('claudepptx.slide.add_narration', { deckId, slideIndex: s3.slideIndex, script: 'The final slide proves deck level narration settings and automatic slide timing.', provider: 'tone' })

const validation = await tool('claudepptx.deck.validate_narration', { deckId })
if (!validation.ok) throw new Error(`validate_narration failed: ${validation.issues.join('; ')}`)
const saved = await tool('claudepptx.deck.save', { deckId, outputDir: path.resolve('outputs', 'narration-smoke'), fileName: 'narration-smoke.pptx' })
console.log(JSON.stringify({ ok: true, validation, saved }, null, 2))
