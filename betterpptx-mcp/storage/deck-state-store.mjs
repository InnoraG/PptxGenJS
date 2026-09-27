import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	meteredFirestoreGet,
	meteredFirestoreSet,
	runMeteredFirestoreTransaction,
} from '../billing/firestore-meter.mjs'

export class DeckStateStoreError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'DeckStateStoreError'
		this.code = code
		this.details = details
	}
}

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

export function deckStateProviderName() {
	return String(process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE || process.env.BETTERPPTX_DECK_STATE_STORE || 'disabled').trim().toLowerCase()
}

export function isDurableDeckStateConfigured() {
	return ['local', 'firestore', 'firestore-gcs'].includes(deckStateProviderName())
}

export function isDistributedDeckStateConfigured() {
	return ['firestore', 'firestore-gcs'].includes(deckStateProviderName())
}

function requireSharedStore(provider) {
	if (enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE') && provider !== 'firestore' && provider !== 'firestore-gcs') {
		throw new DeckStateStoreError(
			'DECK_STATE_STORE_NOT_DISTRIBUTED',
			'Distributed durable deck state is required but not configured.',
			{ provider },
		)
	}
}

function prefix() {
	return String(process.env.BETTERPPTX_FIRESTORE_DECK_STATE_PREFIX || process.env.BETTERPPTX_FIRESTORE_BILLING_PREFIX || 'betterpptx').trim()
}

function localFile() {
	const configured = String(process.env.BETTERPPTX_DECK_STATE_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-deck-state.json')
}

function nowIso(nowMs = Date.now()) {
	return new Date(nowMs).toISOString()
}

function stableForHash(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stableForHash)
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableForHash(value[key])]))
}

export function digestDeckHead(input = {}) {
	return crypto.createHash('sha256').update(JSON.stringify(stableForHash(input))).digest('hex')
}

function publicDeckHead({ deckId, version = 1, headDigest = '', sourceType = '', metadata = {}, updatedAt = nowIso(), createdAt = nowIso() } = {}) {
	return {
		deckId: String(deckId || ''),
		version: Number(version) || 1,
		headDigest: String(headDigest || ''),
		sourceType: String(sourceType || ''),
		metadata: JSON.parse(JSON.stringify(metadata || {})),
		createdAt,
		updatedAt,
	}
}

function emptyLocalStore() {
	return { version: 1, decks: {}, leases: {}, mutations: {} }
}

function createLocalDeckStateStore() {
	requireSharedStore('local')
	const file = localFile()
	let lock = Promise.resolve()

	function load() {
		try {
			if (fs.existsSync(file)) return { ...emptyLocalStore(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }
		} catch {}
		return emptyLocalStore()
	}

	function save(store) {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
	}

	function withLock(fn) {
		const next = lock.then(() => fn(), () => fn())
		lock = next.catch(() => {})
		return next
	}

	async function createDeckHead(input = {}) {
		return withLock(() => {
			const store = load()
			const deckId = String(input.deckId || '')
			if (!deckId) throw new DeckStateStoreError('DECK_STATE_DECK_ID_MISSING', 'deckId is required.')
			if (store.decks[deckId]) throw new DeckStateStoreError('DECK_STATE_ALREADY_EXISTS', 'Deck state already exists.', { deckId })
			const head = publicDeckHead({
				...input,
				version: input.version || 1,
				headDigest: input.headDigest || digestDeckHead({ deckId, version: input.version || 1, metadata: input.metadata || {} }),
			})
			store.decks[deckId] = head
			save(store)
			return JSON.parse(JSON.stringify(head))
		})
	}

	async function getDeckHead(deckId) {
		const head = load().decks[String(deckId)]
		return head ? JSON.parse(JSON.stringify(head)) : null
	}

	async function compareAndSwapDeckHead(deckId, { expectedVersion = null, next = {}, mutation = {} } = {}) {
		return withLock(() => {
			const store = load()
			const current = store.decks[String(deckId)]
			if (!current) throw new DeckStateStoreError('DECK_STATE_NOT_FOUND', 'Deck state was not found.', { deckId })
			if (expectedVersion !== null && Number(expectedVersion) !== Number(current.version)) {
				throw new DeckStateStoreError('DECK_STATE_VERSION_CONFLICT', 'Deck state version conflict.', {
					deckId,
					expectedVersion,
					currentVersion: current.version,
				})
			}
			const nextVersion = Number(next.version || current.version + 1)
			const updated = publicDeckHead({
				...current,
				...next,
				deckId,
				version: nextVersion,
				headDigest: next.headDigest || digestDeckHead({ deckId, version: nextVersion, metadata: next.metadata || current.metadata || {} }),
				createdAt: current.createdAt,
				updatedAt: nowIso(),
			})
			store.decks[String(deckId)] = updated
			const eventId = String(mutation.eventId || `mut_${crypto.randomBytes(12).toString('hex')}`)
			store.mutations[eventId] = {
				eventId,
				deckId: String(deckId),
				fromVersion: current.version,
				toVersion: updated.version,
				toolName: mutation.toolName || '',
				createdAt: nowIso(),
				metadata: mutation.metadata || {},
			}
			save(store)
			return { head: JSON.parse(JSON.stringify(updated)), previous: JSON.parse(JSON.stringify(current)), eventId }
		})
	}

	async function deleteDeckHead(deckId) {
		return withLock(() => {
			const store = load()
			const existed = Boolean(store.decks[String(deckId)])
			delete store.decks[String(deckId)]
			save(store)
			return existed
		})
	}

	return { provider: 'local', distributed: false, createDeckHead, getDeckHead, compareAndSwapDeckHead, deleteDeckHead }
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) {
		firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
			projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
			databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
		}))
	}
	return firestorePromise
}

async function firestoreRefs() {
	const db = await firestore()
	return {
		db,
		decks: db.collection(`${prefix()}_deck_heads`),
		mutations: db.collection(`${prefix()}_deck_mutations`),
	}
}

function createFirestoreDeckStateStore(provider) {
	requireSharedStore(provider)

	async function createDeckHead(input = {}) {
		const deckId = String(input.deckId || '')
		if (!deckId) throw new DeckStateStoreError('DECK_STATE_DECK_ID_MISSING', 'deckId is required.')
		const head = publicDeckHead({
			...input,
			version: input.version || 1,
			headDigest: input.headDigest || digestDeckHead({ deckId, version: input.version || 1, metadata: input.metadata || {} }),
		})
		const { decks } = await firestoreRefs()
		await decks.doc(deckId).create(head)
		return head
	}

	async function getDeckHead(deckId) {
		const { decks } = await firestoreRefs()
		const snap = await meteredFirestoreGet(decks.doc(String(deckId)))
		return snap.exists ? snap.data() || null : null
	}

	async function compareAndSwapDeckHead(deckId, { expectedVersion = null, next = {}, mutation = {} } = {}) {
		const refs = await firestoreRefs()
		const deckRef = refs.decks.doc(String(deckId))
		const eventId = String(mutation.eventId || `mut_${crypto.randomBytes(12).toString('hex')}`)
		const mutationRef = refs.mutations.doc(eventId)
		return runMeteredFirestoreTransaction(refs.db, async tx => {
			const snap = await tx.get(deckRef)
			if (!snap.exists) throw new DeckStateStoreError('DECK_STATE_NOT_FOUND', 'Deck state was not found.', { deckId })
			const current = snap.data() || {}
			if (expectedVersion !== null && Number(expectedVersion) !== Number(current.version)) {
				throw new DeckStateStoreError('DECK_STATE_VERSION_CONFLICT', 'Deck state version conflict.', {
					deckId,
					expectedVersion,
					currentVersion: current.version,
				})
			}
			const nextVersion = Number(next.version || current.version + 1)
			const updated = publicDeckHead({
				...current,
				...next,
				deckId,
				version: nextVersion,
				headDigest: next.headDigest || digestDeckHead({ deckId, version: nextVersion, metadata: next.metadata || current.metadata || {} }),
				createdAt: current.createdAt,
				updatedAt: nowIso(),
			})
			tx.set(deckRef, updated, { merge: false })
			tx.create(mutationRef, {
				eventId,
				deckId: String(deckId),
				fromVersion: current.version,
				toVersion: updated.version,
				toolName: mutation.toolName || '',
				createdAt: nowIso(),
				metadata: mutation.metadata || {},
			})
			return { head: updated, previous: current, eventId }
		})
	}

	async function deleteDeckHead(deckId) {
		const { decks } = await firestoreRefs()
		await meteredFirestoreSet(decks.doc(String(deckId)), {
			deletedAt: nowIso(),
			state: 'deleted',
		}, { merge: true })
		return true
	}

	return { provider, distributed: true, createDeckHead, getDeckHead, compareAndSwapDeckHead, deleteDeckHead }
}

export function createDeckStateStore() {
	const provider = deckStateProviderName()
	if (provider === 'disabled' || provider === 'off' || provider === 'none') {
		return { provider: 'disabled', distributed: false, disabled: true }
	}
	if (provider === 'local') return createLocalDeckStateStore()
	if (provider === 'firestore' || provider === 'firestore-gcs') return createFirestoreDeckStateStore(provider)
	throw new DeckStateStoreError('DECK_STATE_STORE_UNAVAILABLE', 'Durable deck state store provider is unavailable.', { provider })
}

export function deckStateReadiness() {
	const provider = deckStateProviderName()
	return {
		provider,
		configured: isDurableDeckStateConfigured(),
		distributed: isDistributedDeckStateConfigured(),
		publicProductionEligible: provider === 'firestore-gcs',
		requireDurableDeckState: enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE'),
	}
}
