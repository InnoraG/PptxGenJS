import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { meteredFirestoreGet, runMeteredFirestoreTransaction } from './firestore-meter.mjs'

// Owner-controlled free-tier limits. The rolling usage ledger is never touched
// here: only the numbers compared against it at reservation time change, so
// raising or lowering a limit keeps every identity's consumption intact.
// Precedence per limit: owner config document > environment > default.
export const FREE_TIER_LIMITS = Object.freeze({
	publicationsPerWindow: { env: 'BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW', fallback: 5, min: 1, max: 1000 },
	talkingHeadsPerWindow: { env: 'BETTERPPTX_FREE_TALKING_HEADS_PER_WINDOW', fallback: 1, min: 0, max: 1000 },
	customPersonasPerWindow: { env: 'BETTERPPTX_FREE_CUSTOM_PERSONAS_PER_WINDOW', fallback: 1, min: 0, max: 1000 },
})
export const DEFAULT_FREE_PUBLICATIONS_PER_WINDOW = FREE_TIER_LIMITS.publicationsPerWindow.fallback
export const MAX_FREE_PUBLICATIONS_PER_WINDOW = FREE_TIER_LIMITS.publicationsPerWindow.max
export const OWNER_FREE_TIER_DOCUMENT = 'free_tier'

const DEFAULT_CACHE_TTL_MS = 60_000

let cached = null
let pending = null

export function validFreeTierLimit(field, value) {
	const spec = FREE_TIER_LIMITS[field]
	if (!spec) return false
	const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
	return Number.isInteger(number) && number >= spec.min && number <= spec.max
}

export function validFreePublicationLimit(value) {
	return validFreeTierLimit('publicationsPerWindow', value)
}

export function envFreeTierLimit(field, env = process.env) {
	const spec = FREE_TIER_LIMITS[field]
	const raw = env[spec.env]
	if (raw === undefined || raw === '') return spec.fallback
	return validFreeTierLimit(field, raw) ? Number(raw) : spec.fallback
}

export function envFreePublicationLimit(env = process.env) {
	return envFreeTierLimit('publicationsPerWindow', env)
}

// Edit-of-existing-deck is a directly paid service unless the owner switches it off.
export function editRequiresPayment(env = process.env) {
	const raw = String(env.BETTERPPTX_EDIT_REQUIRES_PAYMENT ?? '').trim().toLowerCase()
	return !['0', 'false', 'no', 'off'].includes(raw)
}

function cacheTtlMs() {
	const value = Number(process.env.BETTERPPTX_OWNER_CONFIG_CACHE_TTL_MS)
	return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CACHE_TTL_MS
}

// Explicit only: without a store the environment fallback is authoritative.
function storeProvider() {
	const provider = String(process.env.BETTERPPTX_OWNER_CONFIG_STORE || '').trim().toLowerCase()
	return provider === 'firestore' || provider === 'local' ? provider : 'none'
}

function localFile() {
	const configured = String(process.env.BETTERPPTX_OWNER_CONFIG_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const usageFile = String(process.env.BETTERPPTX_INSTALL_USAGE_FILE || '').trim()
	if (usageFile) return path.resolve(path.dirname(usageFile), 'betterpptx-owner-config.json')
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-owner-config.json')
}

let firestorePromise = null
async function firestoreReference() {
	if (!firestorePromise) {
		firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
			projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
			databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
		}))
	}
	const db = await firestorePromise
	const collection = String(process.env.BETTERPPTX_FIRESTORE_OWNER_CONFIG_COLLECTION || 'betterpptx_owner_config').trim()
	return { db, ref: db.collection(collection).doc(OWNER_FREE_TIER_DOCUMENT) }
}

function readLocalDocument() {
	try {
		const parsed = JSON.parse(fs.readFileSync(localFile(), 'utf8'))
		return parsed?.[OWNER_FREE_TIER_DOCUMENT] || null
	} catch {
		return null
	}
}

async function readOwnerDocument() {
	const provider = storeProvider()
	if (provider === 'firestore') {
		const { ref } = await firestoreReference()
		const snap = await meteredFirestoreGet(ref)
		return snap.exists ? snap.data() || null : null
	}
	if (provider === 'local') return readLocalDocument()
	return null
}

function effectiveFrom(document, { error = null } = {}) {
	const value = { sources: {}, environmentFallbacks: {}, updatedAt: document?.updatedAt || null }
	for (const [field, spec] of Object.entries(FREE_TIER_LIMITS)) {
		const owner = document && validFreeTierLimit(field, document[field]) ? Number(document[field]) : null
		value.environmentFallbacks[field] = envFreeTierLimit(field)
		value[field] = owner ?? value.environmentFallbacks[field]
		value.sources[field] = owner !== null ? 'owner-config' : validFreeTierLimit(field, process.env[spec.env]) ? 'environment' : 'default'
	}
	// Short view of the publication limit.
	value.source = value.sources.publicationsPerWindow
	value.environmentFallback = value.environmentFallbacks.publicationsPerWindow
	if (error) value.readError = error
	return value
}

// Synchronous view for discovery/help text: the last resolved value, or the
// environment fallback before the first read. Reservations use the async path.
export function currentFreeTierLimit(field) {
	return cached?.value?.[field] ?? envFreeTierLimit(field)
}

export function currentFreePublicationLimit() {
	return currentFreeTierLimit('publicationsPerWindow')
}

export async function resolveFreeTierConfig({ force = false } = {}) {
	const now = Date.now()
	if (!force && cached && now - cached.at <= cacheTtlMs()) return cached.value
	if (!force && pending) return pending
	pending = (async () => {
		try {
			const value = effectiveFrom(await readOwnerDocument())
			cached = { at: Date.now(), value }
			return value
		} catch (err) {
			// A config read failure must neither block work nor silently reset to a
			// different limit: keep the last known values when there are some.
			const value = cached?.value
				? { ...cached.value, readError: String(err?.code || 'OWNER_CONFIG_READ_FAILED') }
				: effectiveFrom(null, { error: String(err?.code || 'OWNER_CONFIG_READ_FAILED') })
			cached = { at: Date.now(), value }
			return value
		} finally {
			pending = null
		}
	})()
	return pending
}

export async function resolveFreeTierLimit(field, options = {}) {
	return (await resolveFreeTierConfig(options))[field]
}

export async function resolveFreePublicationLimit(options = {}) {
	return resolveFreeTierLimit('publicationsPerWindow', options)
}

export function resetFreeTierConfigCache() {
	cached = null
	pending = null
}

function actorFingerprint(actor) {
	const text = String(actor || '').trim()
	return text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) : null
}

// Owner-only write (private Mission Control or the owner CLI). Only the named
// limits change; other limits and all usage records are left as they are.
export async function setFreeTierLimits(limits = {}, { actor = '', note = '' } = {}) {
	const fields = Object.keys(limits).filter(field => limits[field] !== undefined)
	if (!fields.length) throw Object.assign(new Error(`Provide at least one of ${Object.keys(FREE_TIER_LIMITS).join(', ')}.`), { code: 'INVALID_FREE_TIER_LIMIT' })
	for (const field of fields) {
		const spec = FREE_TIER_LIMITS[field]
		if (!spec) throw Object.assign(new Error(`Unknown free-tier limit ${field}.`), { code: 'INVALID_FREE_TIER_LIMIT' })
		if (!validFreeTierLimit(field, limits[field]) || typeof limits[field] !== 'number') {
			throw Object.assign(new Error(`${field} must be an integer from ${spec.min} to ${spec.max}.`), {
				code: field === 'publicationsPerWindow' ? 'INVALID_FREE_PUBLICATION_LIMIT' : 'INVALID_FREE_TIER_LIMIT',
			})
		}
	}
	const provider = storeProvider()
	const nowIso = new Date().toISOString()
	const build = previous => {
		const doc = { ...(previous && typeof previous === 'object' ? previous : {}) }
		const changes = {}
		for (const field of fields) {
			changes[field] = { from: validFreeTierLimit(field, doc[field]) ? Number(doc[field]) : null, to: limits[field] }
			doc[field] = limits[field]
		}
		doc.lastChange = changes
		doc.updatedAt = nowIso
		doc.updatedBy = actorFingerprint(actor)
		if (note) doc.note = String(note).slice(0, 200)
		else delete doc.note
		return doc
	}
	let document
	if (provider === 'firestore') {
		const { db, ref } = await firestoreReference()
		document = await runMeteredFirestoreTransaction(db, async tx => {
			const snap = await tx.get(ref)
			const doc = build(snap.exists ? snap.data() : null)
			tx.set(ref, doc, { merge: false })
			return doc
		})
	} else if (provider === 'local') {
		const file = localFile()
		let store = {}
		try { store = JSON.parse(fs.readFileSync(file, 'utf8')) || {} } catch {}
		document = build(store[OWNER_FREE_TIER_DOCUMENT])
		store[OWNER_FREE_TIER_DOCUMENT] = document
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
	} else {
		throw Object.assign(new Error('No owner configuration store is configured; set the free-tier environment variables instead.'), { code: 'OWNER_CONFIG_STORE_UNAVAILABLE' })
	}
	cached = { at: Date.now(), value: effectiveFrom(document) }
	return { ...cached.value, lastChange: document.lastChange }
}

export async function setFreePublicationLimit(value, options = {}) {
	return setFreeTierLimits({ publicationsPerWindow: value }, options)
}

export function describeOwnerConfigStore() {
	const provider = storeProvider()
	return provider === 'local' ? { provider, file: localFile() } : { provider }
}
