import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'deck-spec-snapshot-store-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'local'
process.env.BETTERPPTX_DECK_SNAPSHOT_STORE = 'local'
process.env.BETTERPPTX_DECK_SNAPSHOT_DIR = path.join(outputDir, 'specs')
process.env.BETTERPPTX_REQUIRE_DURABLE_DECK_STATE = '0'

const {
	canonicalDeckSpecDigest,
	createDeckSnapshotStore,
	deckSnapshotReadiness,
} = await import('./storage/deck-snapshot-store.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Canonical spec storage',
	layout: 'LAYOUT_WIDE',
	slides: [{
		id: 'slide-1',
		title: 'Persisted',
		layoutIntent: 'title-body',
		content: [{
			kind: 'textBox',
			name: 'body',
			text: 'Stored once and verified by digest.',
			bbox: { x: 1, y: 1, w: 6, h: 1 },
		}],
	}],
}

const store = createDeckSnapshotStore()
const first = await store.putCanonicalSpec(spec, { metadata: { deckVersion: 2 } })
const second = await store.putCanonicalSpec(JSON.parse(JSON.stringify(spec)))
expect(first.digest === canonicalDeckSpecDigest(spec), 'Stored digest must match the canonical deck-spec digest.', { first })
expect(second.digest === first.digest && second.localPath === first.localPath, 'Identical specs must deduplicate to one content-addressed object.', { first, second })
expect(fs.existsSync(first.localPath), 'Local canonical spec object must exist.', { first })

const loaded = await store.getCanonicalSpec(first.digest)
expect(loaded.spec?.schemaVersion === 'betterpptx.deck-spec.v1', 'Loaded spec must preserve the supported schema.', { loaded })
expect(loaded.spec?.slides?.[0]?.content?.[0]?.text === spec.slides[0].content[0].text, 'Loaded spec must preserve content.', { loaded })

fs.writeFileSync(first.localPath, Buffer.from('{"schemaVersion":"betterpptx.deck-spec.v1","title":"tampered","slides":[]}'))
let mismatch = null
try {
	await store.getCanonicalSpec(first.digest)
} catch (err) {
	mismatch = err
}
expect(mismatch?.code === 'DECK_SNAPSHOT_DIGEST_MISMATCH', 'Digest verification must reject a tampered canonical spec.', {
	code: mismatch?.code,
	message: mismatch?.message,
})

const readiness = deckSnapshotReadiness()
expect(readiness.stateModel === 'canonical_json_spec_recompile' && readiness.publicProductionEligible === false, 'Local readiness must describe spec recompile without claiming production eligibility.', { readiness })

delete process.env.BETTERPPTX_DECK_SNAPSHOT_STORE
process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'disabled'
process.env.BETTERPPTX_REQUIRE_DURABLE_DECK_STATE = '1'
let guard = null
try {
	createDeckSnapshotStore()
} catch (err) {
	guard = err
}
expect(guard?.code === 'DECK_SNAPSHOT_STORE_REQUIRED', 'Required durable deck state must reject a missing canonical spec store.', {
	code: guard?.code,
	message: guard?.message,
})

console.log('DECK SPEC SNAPSHOT STORE: PASS canonical=1 deduplicated=1 digestVerified=1 productionGuard=1')
