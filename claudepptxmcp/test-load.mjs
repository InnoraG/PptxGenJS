// Robustness / load guards test (engine-level, no network).
// Tightens the bounds via env, then proves: (1) the deck registry never exceeds
// its cap (LRU eviction frees memory), (2) heavy ops are gated under a burst and
// degrade with a retriable BUSY instead of crashing, (3) download-mode save
// writes once into the served root and returns a public URL.
process.env.CLAUDEPPTX_MAX_DECKS = '5'
process.env.CLAUDEPPTX_MAX_CONCURRENCY = '2'
process.env.CLAUDEPPTX_MAX_QUEUE = '4'
process.env.CLAUDEPPTX_DECK_TTL_MS = '99999999'

import * as fs from 'node:fs'
import * as path from 'node:path'

const eng = await import('./engine.mjs')
const call = eng.callClaudePptxTool
let failures = 0
const check = (label, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`); if (!cond) failures++ }

// ---- 1) Deck registry cap + LRU eviction
const ids = []
for (let i = 0; i < 12; i++) ids.push((await call('claudepptx.deck.new', { title: 'd' + i })).data.deckId)
let s = eng.getEngineStats()
check('registry capped at MAX_DECKS', s.decks <= s.maxDecks, `decks=${s.decks} cap=${s.maxDecks} evicted=${s.decksEvicted}`)
check('oldest deck was evicted (graceful error)', (await call('claudepptx.slide.add', { deckId: ids[0] })).ok === false)
check('newest deck still usable', (await call('claudepptx.slide.add', { deckId: ids[11] })).ok === true)

// ---- 2) Heavy-op concurrency gate under a burst
const d = (await call('claudepptx.deck.new', { title: 'save' })).data.deckId
await call('claudepptx.slide.add', { deckId: d })
await call('claudepptx.slide.add_text', { deckId: d, slideIndex: 0, text: 'load', options: { x: 1, y: 1, w: 6, h: 1, fontSize: 24 } })
const burst = await Promise.all(Array.from({ length: 20 }, (_, i) =>
	call('claudepptx.deck.save', { deckId: d, outputDir: path.resolve('outputs/loadtest'), fileName: `load_${i}.pptx` })))
const ok = burst.filter(r => r.ok).length
const busy = burst.filter(r => !r.ok && r.error?.code === 'BUSY').length
check('burst of 20 saves: no crash, all accounted', ok + busy === 20, `ok=${ok} busy=${busy}`)
check('gate shed load (some BUSY) under MAX_QUEUE', busy > 0, `busy=${busy}`)
check('gate let work through (some OK)', ok >= 2, `ok=${ok}`)
check('concurrency drained back to 0', eng.getEngineStats().concurrency.active === 0)

// ---- 3) Download-mode save: single write into served root + public URL
const servedRoot = path.resolve('outputs/loadtest_served')
fs.rmSync(servedRoot, { recursive: true, force: true })
eng.setDownloadConfig({ base: 'https://example.test', root: servedRoot })
const dd = (await call('claudepptx.deck.new', { title: 'dl' })).data.deckId
await call('claudepptx.slide.add', { deckId: dd })
const sv = (await call('claudepptx.deck.save', { deckId: dd, fileName: 'served deck.pptx' })).data
check('save returned a public downloadUrl', /^https:\/\/example\.test\/files\/[A-Za-z0-9_-]+\/served%20deck\.pptx$/.test(sv.downloadUrl || ''), sv.downloadUrl)
check('file written once, under served root', !!sv.filePath && sv.filePath.startsWith(servedRoot) && fs.existsSync(sv.filePath))

console.log(failures === 0 ? '\nLOAD TEST: PASS' : `\nLOAD TEST: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
