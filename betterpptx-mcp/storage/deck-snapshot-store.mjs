import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { recordResourceUsage } from '../billing/resource-meter.mjs'

export class DeckSnapshotStoreError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'DeckSnapshotStoreError'
		this.code = code
		this.details = details
	}
}

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

function inferredProvider() {
	const deckStateProvider = String(process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE || process.env.BETTERPPTX_DECK_STATE_STORE || '').trim().toLowerCase()
	if (deckStateProvider === 'firestore-gcs') return 'gcs'
	if (deckStateProvider === 'local') return 'local'
	return 'disabled'
}

export function deckSnapshotProviderName() {
	return String(
		process.env.BETTERPPTX_DECK_SNAPSHOT_STORE
		|| process.env.BETTERPPTX_DURABLE_DECK_SNAPSHOT_STORE
		|| inferredProvider(),
	).trim().toLowerCase()
}

export function isDeckSnapshotConfigured() {
	return ['local', 'gcs'].includes(deckSnapshotProviderName())
}

export function isDistributedDeckSnapshotConfigured() {
	return deckSnapshotProviderName() === 'gcs'
}

function requireDistributed(provider) {
	if (enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE') && provider !== 'gcs') {
		throw new DeckSnapshotStoreError(
			'DECK_SNAPSHOT_STORE_NOT_DISTRIBUTED',
			'Distributed canonical deck-spec storage is required but not configured.',
			{ provider },
		)
	}
}

function normalizePrefix(value) {
	return String(value || 'betterpptx-deck-specs')
		.replace(/\\/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.replace(/[^A-Za-z0-9._/-]/g, '_') || 'betterpptx-deck-specs'
}

function stableJsonValue(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stableJsonValue)
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJsonValue(value[key])]))
}

export function canonicalDeckSpecBytes(spec) {
	if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
		throw new DeckSnapshotStoreError('DECK_SPEC_INVALID', 'A canonical deck spec object is required.')
	}
	if (String(spec.schemaVersion || '') !== 'betterpptx.deck-spec.v1') {
		throw new DeckSnapshotStoreError('DECK_SPEC_SCHEMA_UNSUPPORTED', 'Only betterpptx.deck-spec.v1 can be persisted as canonical deck state.', {
			schemaVersion: spec.schemaVersion || null,
		})
	}
	return Buffer.from(JSON.stringify(stableJsonValue(spec)), 'utf8')
}

export function canonicalDeckSpecDigest(spec) {
	return crypto.createHash('sha256').update(canonicalDeckSpecBytes(spec)).digest('hex')
}

function assertDigest(value) {
	const digest = String(value || '').trim().toLowerCase()
	if (!/^[a-f0-9]{64}$/.test(digest)) {
		throw new DeckSnapshotStoreError('DECK_SNAPSHOT_DIGEST_INVALID', 'A valid canonical deck-spec digest is required.', { digest })
	}
	return digest
}

function localRoot() {
	const configured = String(process.env.BETTERPPTX_DECK_SNAPSHOT_DIR || process.env.BETTERPPTX_DECK_SPEC_DIR || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-deck-specs')
}

function publicRecord({ provider, digest, bytes, objectName = '', localPath = '', metadata = {} }) {
	return {
		provider,
		digest,
		bytes: Number(bytes) || 0,
		objectName,
		localPath,
		schemaVersion: 'betterpptx.deck-spec.v1',
		metadata: JSON.parse(JSON.stringify(metadata || {})),
		writtenAt: new Date().toISOString(),
	}
}

function parseAndVerifySpec(bytes, expectedDigest) {
	const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex')
	if (actualDigest !== expectedDigest) {
		throw new DeckSnapshotStoreError('DECK_SNAPSHOT_DIGEST_MISMATCH', 'Canonical deck-spec digest mismatch.', {
			expectedDigest,
			actualDigest,
		})
	}
	let spec
	try {
		spec = JSON.parse(bytes.toString('utf8'))
	} catch (err) {
		throw new DeckSnapshotStoreError('DECK_SPEC_JSON_INVALID', 'Stored canonical deck spec is not valid JSON.', {
			reason: err?.message || String(err),
		})
	}
	canonicalDeckSpecBytes(spec)
	return spec
}

function createLocalDeckSnapshotStore() {
	requireDistributed('local')
	const root = localRoot()

	function pathForDigest(digest) {
		const safeDigest = assertDigest(digest)
		return path.join(root, safeDigest.slice(0, 2), `${safeDigest}.deck-spec.v1.json`)
	}

	async function putCanonicalSpec(spec, { metadata = {} } = {}) {
		const bytes = canonicalDeckSpecBytes(spec)
		const digest = crypto.createHash('sha256').update(bytes).digest('hex')
		const target = pathForDigest(digest)
		await fs.mkdir(path.dirname(target), { recursive: true })
		try {
			await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
		} catch (err) {
			if (err?.code !== 'EEXIST') throw err
		}
		return publicRecord({ provider: 'local', digest, bytes: bytes.length, localPath: target, metadata })
	}

	async function getCanonicalSpec(digest) {
		const safeDigest = assertDigest(digest)
		const localPath = pathForDigest(safeDigest)
		const bytes = await fs.readFile(localPath)
		return {
			digest: safeDigest,
			spec: parseAndVerifySpec(bytes, safeDigest),
			bytes: bytes.length,
			localPath,
			objectName: '',
			provider: 'local',
		}
	}

	return { provider: 'local', distributed: false, putCanonicalSpec, getCanonicalSpec }
}

let storageClientPromise = null
async function getStorageClient() {
	if (!storageClientPromise) {
		storageClientPromise = import('@google-cloud/storage')
			.then(({ Storage }) => new Storage({
				projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
			}))
			.catch(err => {
				throw new DeckSnapshotStoreError(
					'DECK_SNAPSHOT_GCS_CLIENT_UNAVAILABLE',
					'Google Cloud Storage adapter requires @google-cloud/storage and application-default/workload-identity credentials.',
					{ reason: err?.message || String(err) },
				)
			})
	}
	return storageClientPromise
}

function createGcsDeckSnapshotStore() {
	requireDistributed('gcs')
	const bucketName = String(process.env.BETTERPPTX_DECK_SNAPSHOT_BUCKET || process.env.BETTERPPTX_DECK_SPEC_BUCKET || process.env.BETTERPPTX_GCS_BUCKET || process.env.BETTERPPTX_ARTIFACT_BUCKET || '').trim()
	if (!bucketName) {
		throw new DeckSnapshotStoreError(
			'DECK_SNAPSHOT_GCS_BUCKET_MISSING',
			'GCS canonical deck-spec storage requires BETTERPPTX_DECK_SNAPSHOT_BUCKET, BETTERPPTX_DECK_SPEC_BUCKET, or BETTERPPTX_GCS_BUCKET.',
			{ provider: 'gcs' },
		)
	}
	const prefix = normalizePrefix(process.env.BETTERPPTX_DECK_SNAPSHOT_GCS_PREFIX || process.env.BETTERPPTX_DECK_SPEC_GCS_PREFIX)

	function objectNameForDigest(digest) {
		const safeDigest = assertDigest(digest)
		return `${prefix}/${safeDigest.slice(0, 2)}/${safeDigest}.deck-spec.v1.json`
	}

	async function putCanonicalSpec(spec, { metadata = {} } = {}) {
		const bytes = canonicalDeckSpecBytes(spec)
		const digest = crypto.createHash('sha256').update(bytes).digest('hex')
		const objectName = objectNameForDigest(digest)
		const storage = await getStorageClient()
		const file = storage.bucket(bucketName).file(objectName)
		const [exists] = await file.exists()
		if (!exists) {
			await file.save(bytes, {
				resumable: false,
				contentType: 'application/json',
				metadata: {
					cacheControl: 'private, max-age=0, no-store',
					metadata: {
						product: 'BetterPPTX',
						artifact: 'canonical-deck-spec',
						digest,
					},
				},
			})
			recordResourceUsage({
				storageWriteBytes: bytes.length,
				gcsClassAOps: 1,
				externalCalls: 1,
			})
		}
		return publicRecord({ provider: 'gcs', digest, bytes: bytes.length, objectName, metadata })
	}

	async function getCanonicalSpec(digest) {
		const safeDigest = assertDigest(digest)
		const objectName = objectNameForDigest(safeDigest)
		const storage = await getStorageClient()
		const [bytes] = await storage.bucket(bucketName).file(objectName).download()
		recordResourceUsage({
			storageReadBytes: bytes.length,
			gcsClassBOps: 1,
			externalCalls: 1,
		})
		return {
			digest: safeDigest,
			spec: parseAndVerifySpec(bytes, safeDigest),
			bytes: bytes.length,
			localPath: '',
			objectName,
			provider: 'gcs',
		}
	}

	return { provider: 'gcs', distributed: true, putCanonicalSpec, getCanonicalSpec }
}

export function createDeckSnapshotStore() {
	const provider = deckSnapshotProviderName()
	if (provider === 'disabled' || provider === 'off' || provider === 'none') {
		if (enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE')) {
			throw new DeckSnapshotStoreError(
				'DECK_SNAPSHOT_STORE_REQUIRED',
				'Durable deck state requires a canonical deck-spec store.',
				{ provider },
			)
		}
		return { provider: 'disabled', distributed: false, disabled: true }
	}
	if (provider === 'local') return createLocalDeckSnapshotStore()
	if (provider === 'gcs') return createGcsDeckSnapshotStore()
	throw new DeckSnapshotStoreError('DECK_SNAPSHOT_STORE_UNAVAILABLE', 'Canonical deck-spec store provider is unavailable.', { provider })
}

export function deckSnapshotReadiness() {
	const provider = deckSnapshotProviderName()
	return {
		provider,
		configured: isDeckSnapshotConfigured(),
		distributed: isDistributedDeckSnapshotConfigured(),
		publicProductionEligible: provider === 'gcs',
		stateModel: 'canonical_json_spec_recompile',
		schemaVersion: 'betterpptx.deck-spec.v1',
		requireDurableDeckState: enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE'),
	}
}
