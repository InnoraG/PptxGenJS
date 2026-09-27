import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'engine-deck-state-hooks-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'local'
process.env.BETTERPPTX_DECK_STATE_FILE = path.join(outputDir, 'deck-state.json')
process.env.BETTERPPTX_REQUIRE_DURABLE_DECK_STATE = '0'
process.env.BETTERPPTX_ARTIFACT_STORE = 'local'
process.env.BETTERPPTX_DOWNLOAD_ROOT = path.join(outputDir, 'downloads')
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const { callBetterPptxTool } = await import('./engine.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function stateFile() {
	return JSON.parse(fs.readFileSync(process.env.BETTERPPTX_DECK_STATE_FILE, 'utf8'))
}

const context = { sessionId: 'verify-engine-deck-state-hooks', installHash: 'install_deck_state_hooks' }
const createdResult = await callBetterPptxTool('betterpptx.deck.new', {
	title: 'Durable deck-state hook verify',
	directorMode: 'primitive-direct',
	idempotencyKey: 'deck-state-new',
}, context)
expect(createdResult.ok === true && createdResult.data?.deckId, 'deck.new should succeed and return a deck id.', { createdResult })
const deckId = createdResult.data.deckId
let persisted = stateFile()
expect(persisted.decks?.[deckId]?.version === 1, 'deck.new should create a durable deck head at version 1.', { persisted, deckId })

const slideResult = await callBetterPptxTool('betterpptx.slide.add', {
	deckId,
	title: 'First slide',
	idempotencyKey: 'deck-state-slide-add',
}, context)
expect(slideResult.ok === true && slideResult.data?.deckVersion === 2, 'slide.add should bump the in-memory deck version.', { slideResult })
persisted = stateFile()
expect(persisted.decks?.[deckId]?.version === 2, 'slide.add should CAS-update the durable deck head to version 2.', { persisted, deckId })
const mutationEvents = Object.values(persisted.mutations || {})
expect(mutationEvents.some(event => event.deckId === deckId && event.toolName === 'betterpptx.slide.add' && event.fromVersion === 1 && event.toVersion === 2), 'slide.add should persist a durable mutation event.', { mutationEvents })

const disposeResult = await callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context)
expect(disposeResult.ok === true, 'deck.dispose should succeed.', { disposeResult })
persisted = stateFile()
expect(!persisted.decks?.[deckId], 'deck.dispose should delete the local durable deck head.', { persisted, deckId })

console.log('ENGINE DECK STATE HOOKS: PASS createHead=1 mutationCas=1 mutationEvent=1 disposeDelete=1')
