import assert from 'node:assert/strict'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'

const { callBetterPptxTool } = await import('./engine.mjs')

const context = { sessionId: 'verify-deck-version-concurrency', clientInfo: { name: 'verify-deck-version-concurrency', version: '1' } }

async function call(name, args = {}) {
	return callBetterPptxTool(name, args, context)
}

const deck = await call('betterpptx.deck.new', { title: 'Deck version concurrency', directorMode: 'primitive-direct' })
assert.equal(deck.ok, true, 'deck.new should succeed')
const deckId = deck.data.deckId
let deckVersion = deck.data.deckVersion
assert.equal(Number.isInteger(deckVersion), true, 'deck.new should return deckVersion')

const slide = await call('betterpptx.slide.add', { deckId, deckVersion, background: { color: 'FFFFFF' } })
assert.equal(slide.ok, true, 'slide.add should succeed')
deckVersion = slide.data.deckVersion

const [a, b] = await Promise.all([
	call('betterpptx.slide.add_text', {
		deckId,
		deckVersion,
		slideIndex: 0,
		text: 'Writer A',
		options: { x: 0.6, y: 0.6, w: 2.5, h: 0.4, fontSize: 18 },
	}),
	call('betterpptx.slide.add_shape', {
		deckId,
		deckVersion,
		slideIndex: 0,
		shapeName: 'rect',
		options: { x: 3.3, y: 0.6, w: 1.2, h: 0.5, fill: { color: '20D6E7' } },
	}),
])

const results = [a, b]
const successes = results.filter(r => r.ok === true)
const conflicts = results.filter(r => r.ok === false && r.error?.code === 'DECK_VERSION_CONFLICT')

assert.equal(successes.length, 1, `expected exactly one successful parallel writer, got ${JSON.stringify(results)}`)
assert.equal(conflicts.length, 1, `expected exactly one version conflict, got ${JSON.stringify(results)}`)
assert.equal(successes[0].data.deckVersion, deckVersion + 1, 'successful writer should advance deckVersion once')

const summary = await call('betterpptx.deck.summary', { deckId })
assert.equal(summary.ok, true, 'deck.summary should succeed')
assert.equal(summary.data.deckVersion, deckVersion + 1, 'read response should include current deckVersion')

console.log('DECK VERSION CONCURRENCY VERIFY: PASS')
