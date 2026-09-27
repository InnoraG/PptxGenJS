import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'locked-asset-store-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_LOCKED_ASSET_STORE = 'local'
process.env.BETTERPPTX_LOCKED_ASSET_SHARED_DIR = path.join(outputDir, 'shared')
process.env.BETTERPPTX_REQUIRE_DURABLE_DECK_STATE = '0'

const {
	createLockedAssetStore,
	lockedAssetStoreReadiness,
	parseLockedAssetHandle,
	isLockedAssetHandle,
} = await import('./storage/locked-asset-store.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function handleFor(bytes, kind = 'opaque-native', ext = 'json') {
	const digest = crypto.createHash('sha256').update(bytes).digest('hex')
	return `asset://locked/${kind}/${digest}${ext ? `.${ext}` : ''}`
}

const bytes = Buffer.from('{"schemaVersion":"betterpptx.opaque-native.v1","object":{"raw":"<p:sp/>"}}', 'utf8')
const handle = handleFor(bytes)
expect(isLockedAssetHandle(handle), 'Constructed handle must be recognized.', { handle })
expect(parseLockedAssetHandle(handle).kind === 'opaque-native', 'Handle kind must parse.', { handle })

const store = createLockedAssetStore()
const first = await store.putLockedAsset(handle, bytes)
const second = await store.putLockedAsset(handle, Buffer.from(bytes)) // identical -> dedup
expect(first.digest === parseLockedAssetHandle(handle).digest, 'Stored digest must equal the handle digest.', { first })
expect(second.localPath === first.localPath, 'Identical bytes must deduplicate to one content-addressed object.', { first, second })
expect(fs.existsSync(first.localPath), 'Shared local object must exist.', { first })
expect(await store.hasLockedAsset(handle) === true, 'hasLockedAsset must report presence.', { handle })

const loaded = await store.getLockedAsset(handle)
expect(Buffer.compare(loaded.bytes, bytes) === 0, 'Loaded bytes must match stored bytes exactly.', { handle })

// put with mismatched bytes/handle must be rejected (content-address integrity).
let putMismatch = null
try {
	await store.putLockedAsset(handle, Buffer.from('different bytes'))
} catch (err) { putMismatch = err }
expect(putMismatch?.code === 'LOCKED_ASSET_DIGEST_MISMATCH', 'Putting bytes that do not match the handle digest must be rejected.', { code: putMismatch?.code })

// tamper the stored object -> get must reject on digest verify.
fs.writeFileSync(first.localPath, Buffer.from('tampered'))
let getMismatch = null
try {
	await store.getLockedAsset(handle)
} catch (err) { getMismatch = err }
expect(getMismatch?.code === 'LOCKED_ASSET_DIGEST_MISMATCH', 'Digest verification must reject a tampered locked asset.', { code: getMismatch?.code })

const readiness = lockedAssetStoreReadiness()
expect(readiness.provider === 'local' && readiness.publicProductionEligible === false, 'Local readiness must not claim production eligibility.', { readiness })

// required-but-missing guard.
delete process.env.BETTERPPTX_LOCKED_ASSET_STORE
process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'disabled'
process.env.BETTERPPTX_REQUIRE_DURABLE_DECK_STATE = '1'
let guard = null
try { createLockedAssetStore() } catch (err) { guard = err }
expect(guard?.code === 'LOCKED_ASSET_STORE_REQUIRED', 'Required durable deck state must reject a missing shared locked-asset store.', { code: guard?.code })

console.log('LOCKED ASSET STORE: PASS contentAddressed=1 deduplicated=1 putIntegrity=1 digestVerified=1 productionGuard=1')
