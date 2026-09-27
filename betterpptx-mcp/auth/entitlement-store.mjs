import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	meteredFirestoreGet,
	meteredFirestoreSet,
} from '../billing/firestore-meter.mjs'

export class EntitlementStoreConfigError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'EntitlementStoreConfigError'
		this.code = code
		this.details = details
	}
}

function providerName() {
	return String(process.env.BETTERPPTX_ENTITLEMENT_STORE || 'local').trim().toLowerCase()
}

function requireSharedStores() {
	return process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1'
}

function defaultStorePath() {
	const configured = String(process.env.BETTERPPTX_ENTITLEMENTS_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-entitlements.json')
}

function emptyStore() {
	return { version: 1, keys: {} }
}

function sanitizePersistedState(state = {}) {
	const out = { ...state }
	for (const field of ['key', 'licenseKey', 'activationKey', 'apiKey', 'rawKey', 'secret']) delete out[field]
	return out
}

function assertSupportedProvider(provider) {
	if (provider === 'local' || provider === 'firestore') return
	throw new EntitlementStoreConfigError(
		'ENTITLEMENT_STORE_PROVIDER_UNAVAILABLE',
		`Entitlement store provider "${provider}" is not available in this build. Configure BETTERPPTX_ENTITLEMENT_STORE=local for local dev or BETTERPPTX_ENTITLEMENT_STORE=firestore for production.`,
		{ provider },
	)
}

let firestoreClientPromise = null
async function getFirestoreClient() {
	if (!firestoreClientPromise) {
		firestoreClientPromise = import('@google-cloud/firestore')
			.then(({ Firestore }) => new Firestore({
				projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
				databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
			}))
			.catch(err => {
				throw new EntitlementStoreConfigError(
					'FIRESTORE_CLIENT_UNAVAILABLE',
					'Firestore entitlement store requires @google-cloud/firestore and application-default/workload-identity credentials.',
					{ reason: err?.message || String(err) },
				)
			})
	}
	return firestoreClientPromise
}

function firestoreCollectionPath() {
	const pathValue = String(process.env.BETTERPPTX_FIRESTORE_ENTITLEMENTS_COLLECTION || process.env.BETTERPPTX_FIRESTORE_COLLECTION || 'betterpptx_entitlements').trim()
	if (!pathValue || pathValue.includes('..')) {
		throw new EntitlementStoreConfigError('FIRESTORE_COLLECTION_INVALID', 'Invalid Firestore entitlement collection path.', {})
	}
	return pathValue
}

function createFirestoreEntitlementStore() {
	const provider = 'firestore'
	const collectionPath = firestoreCollectionPath()

	async function collection() {
		const db = await getFirestoreClient()
		return db.collection(collectionPath)
	}

	async function getKeyState(fingerprint) {
		const snap = await meteredFirestoreGet((await collection()).doc(String(fingerprint)))
		return snap.exists ? sanitizePersistedState(snap.data() || {}) : null
	}

	async function load() {
		return { version: 1, keys: {} }
	}

	async function save() {}

	async function persistKeyState(fingerprint, state) {
		const now = new Date().toISOString()
		const ref = (await collection()).doc(String(fingerprint))
		const snap = await meteredFirestoreGet(ref)
		const existing = snap.exists ? sanitizePersistedState(snap.data() || {}) : {}
		const next = {
			...existing,
			...sanitizePersistedState(state),
			keyFingerprint: String(fingerprint),
			createdAt: existing.createdAt || now,
			updatedAt: now,
		}
		await meteredFirestoreSet(ref, next, { merge: true })
		return next
	}

	return {
		provider,
		shared: true,
		load,
		save,
		getKeyState,
		persistKeyState,
		describe() {
			return { provider, shared: true, collectionPath }
		},
	}
}

export function createEntitlementStore() {
	const provider = providerName()
	assertSupportedProvider(provider)
	if (provider === 'firestore') return createFirestoreEntitlementStore()
	if (requireSharedStores()) {
		throw new EntitlementStoreConfigError(
			'ENTITLEMENT_STORE_NOT_SHARED',
			'Local entitlement storage is not allowed when BETTERPPTX_REQUIRE_SHARED_STORES=1. Configure a shared entitlement store before running multiple production instances.',
			{ provider },
		)
	}

	const file = defaultStorePath()
	let cached = null

	function load() {
		if (cached) return cached
		try {
			if (fs.existsSync(file)) {
				const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
				if (parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object') {
					cached = { version: 1, ...parsed, keys: parsed.keys }
					return cached
				}
			}
		} catch {}
		cached = emptyStore()
		return cached
	}

	function save() {
		try {
			fs.mkdirSync(path.dirname(file), { recursive: true })
			fs.writeFileSync(file, `${JSON.stringify(load(), null, 2)}\n`, { mode: 0o600 })
		} catch {}
	}

	function persistKeyState(fingerprint, state) {
		const store = load()
		const now = new Date().toISOString()
		const existing = store.keys[fingerprint] || {}
		store.keys[fingerprint] = {
			...existing,
			...sanitizePersistedState(state),
			keyFingerprint: fingerprint,
			createdAt: existing.createdAt || now,
			updatedAt: now,
		}
		save()
		return store.keys[fingerprint]
	}

	return {
		provider,
		shared: false,
		file,
		load,
		save,
		getKeyState(fingerprint) {
			return load().keys[fingerprint] || null
		},
		persistKeyState,
		describe() {
			return { provider, shared: false, file }
		},
	}
}
