import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'deck-state-store-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'local'
process.env.BETTERPPTX_DECK_STATE_FILE = path.join(outputDir, 'deck-state.json')
process.env.BETTERPPTX_REQUIRE_DURABLE_DECK_STATE = '0'

const {
	createDeckStateStore,
	deckStateReadiness,
	digestDeckHead,
} = await import('./storage/deck-state-store.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function expectCode(code, fn) {
	try {
		await fn()
	} catch (error) {
		if (error?.code === code) return error
		throw error
	}
	throw new Error(`Expected ${code}.`)
}

let readiness = deckStateReadiness()
expect(readiness.configured === true && readiness.distributed === false && readiness.publicProductionEligible === false, 'Local deck-state store should be configured but not production-distributed.', { readiness })

const store = createDeckStateStore()
const deckId = 'deck_state_verify'
const initialDigest = digestDeckHead({ deckId, version: 1, metadata: { sourceType: 'new' } })
const created = await store.createDeckHead({
	deckId,
	version: 1,
	sourceType: 'new',
	headDigest: initialDigest,
	metadata: { slideCount: 0 },
})
expect(created.deckId === deckId && created.version === 1 && created.headDigest === initialDigest, 'Deck head create returned invalid state.', { created })

const loaded = await store.getDeckHead(deckId)
expect(loaded?.headDigest === initialDigest, 'Deck head did not persist.', { loaded })

const updated = await store.compareAndSwapDeckHead(deckId, {
	expectedVersion: 1,
	next: {
		metadata: { slideCount: 1 },
		headDigest: digestDeckHead({ deckId, version: 2, metadata: { slideCount: 1 } }),
	},
	mutation: {
		eventId: 'mut_verify_slide_add',
		toolName: 'betterpptx.slide.add',
		metadata: { slideIndex: 0 },
	},
})
expect(updated.previous.version === 1 && updated.head.version === 2 && updated.eventId === 'mut_verify_slide_add', 'CAS update did not advance the head correctly.', { updated })

await expectCode('DECK_STATE_VERSION_CONFLICT', () => store.compareAndSwapDeckHead(deckId, {
	expectedVersion: 1,
	next: { metadata: { slideCount: 2 } },
}))

const persistedJson = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_DECK_STATE_FILE, 'utf8'))
expect(persistedJson.mutations?.mut_verify_slide_add?.fromVersion === 1 && persistedJson.mutations?.mut_verify_slide_add?.toVersion === 2, 'Mutation event was not persisted.', { persistedJson })

const deleted = await store.deleteDeckHead(deckId)
expect(deleted === true && await store.getDeckHead(deckId) === null, 'Local deck head delete did not remove the state.', {})

process.env.BETTERPPTX_REQUIRE_DURABLE_DECK_STATE = '1'
process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'local'
await expectCode('DECK_STATE_STORE_NOT_DISTRIBUTED', async () => createDeckStateStore().createDeckHead({ deckId: 'blocked' }))

process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'firestore-gcs'
readiness = deckStateReadiness()
expect(readiness.configured === true && readiness.distributed === true && readiness.publicProductionEligible === true, 'firestore-gcs must be the public production eligible durable deck-state provider.', { readiness })

console.log('DECK STATE STORE: PASS localCas=1 conflict=1 mutationEvent=1 delete=1 productionGuard=1 firestoreGcsEligible=1')
