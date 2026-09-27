import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { lowerHtmlSlides } from '../ir/html-slide-compiler.mjs'
import { canonicalDeckSpecBytes, canonicalDeckSpecDigest } from '../storage/deck-snapshot-store.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const htmlPath = path.join(repo, 'GPT_5_6_Pro_Capability_Showcase_HTML_Native_External_Images_Edition', 'index.html')
const specPath = path.join(repo, 'tmp_autonomous_test', 'GPT56_BetterPPTX_Canonical_Full_Spec.json')

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

test('frozen 25-slide HTML closes CSS boxes, support effects, and authored motion', () => {
	const bytes = fs.readFileSync(htmlPath)
	assert.equal(sha256(bytes), '589b8fd863e0da884b0cc5c0aeee2aaad68791405f5d437f897345e8c2280b92')
	const slides = lowerHtmlSlides(bytes.toString('utf8'))
	const content = slides.flatMap(slide => slide.content || [])
	const fallbacks = slides.flatMap(slide => slide.htmlFallbacks || [])
	assert.equal(slides.length, 25)
	assert.equal(content.length, 871)
	assert.equal(content.filter(item => item.kind === 'textBox').length, 467)
	assert.equal(content.filter(item => item.kind === 'image').length, 29)
	assert.equal(content.filter(item => item.kind === 'shape').length, 259)
	assert.equal(content.filter(item => item.kind === 'customGeometry').length, 116)
	assert.equal(content.filter(item => item.representation === 'editable-native-css-box').length, 153)
	assert.equal(content.filter(item => item.representation === 'editable-native-support-shape').length, 106)
	assert.equal(content.filter(item => item.animation).length, 746)
	const lineStep = 1 / 12700
	const authoredLineWidths = content
		.map(item => item.style?.line?.width)
		.filter(width => Number.isFinite(width) && width > 0)
	assert.ok(authoredLineWidths.length > 0)
	assert.ok(authoredLineWidths.every(width => Math.abs(width / lineStep - Math.round(width / lineStep)) <= 1e-9), 'HTML lowering must emit native 1/12700-point line widths')
	assert.equal(fallbacks.filter(item => (item.fallbackComponents || []).includes('uncompiled-atmosphere-layer')).length, 0)
	assert.equal(fallbacks.filter(item => item.needsIsolatedRaster).length, 25)
	assert.ok(fallbacks.filter(item => item.needsIsolatedRaster).every(item => (item.fallbackComponents || []).length === 1 && item.fallbackComponents[0] === 'feTurbulence'))
	assert.ok(fallbacks.every(item => item.wholeSlideRasterized === false))
})

test('latest portable 25-slide JSON spec has distinct raw and canonical identities', () => {
	const raw = fs.readFileSync(specPath)
	const spec = JSON.parse(raw.toString('utf8'))
	assert.equal(raw.length, 95634)
	assert.equal(sha256(raw), '12b28d32974ca9e3a8c0e311e5cc6c754ef3bdf1ebe75f8f3dc3fc0a8f411b22')
	assert.equal(canonicalDeckSpecBytes(spec).length, 56631)
	assert.equal(canonicalDeckSpecDigest(spec), '790804ca47f029379e8c833a13c90cfaa1837207d25dfe077bdfebc1ef99f899')
	assert.equal(spec.slides.length, 25)
	assert.equal(spec.slides.reduce((count, slide) => count + (slide.narration?.cues?.length || 0), 0), 156)
	assert.equal(spec.htmlPackage?.handle, 'asset://locked/uploaded-htmlpackage/0170f7239899aa6ad2872378b5f067441e97ce24338c208dad07f6a604908275.zip')
})
