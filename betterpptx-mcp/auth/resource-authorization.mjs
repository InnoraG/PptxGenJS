import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

// Private server contract. Never construct a scope from tool arguments, clientInfo,
// billing claims, a supplied owner record, or an unverified device header. HTTP
// supplies installHash after installIdentityFromHeaders; sessionId is server issued.
// Persist resourceOwner in a server-owned envelope, never in the authored spec or
// a public response. Content hashes and opaque handles are identifiers, not grants.
export const RESOURCE_OWNER_SCHEMA_VERSION = 'betterpptx.resource-owner.v1'

/** @typedef {{schemaVersion: string, kind: 'install'|'connector'|'session'|'local', id: string}} ResourceOwner */

const scopes = new AsyncLocalStorage()
const INSTALL_HASH = /^install_[a-f0-9]{64}$/
const CONNECTOR_HASH = /^connector_[a-f0-9]{64}$/
const OWNER_ID = /^[a-f0-9]{64}$/
const UNBOUND_SESSIONS = new Set(['anonymous', 'default', 'stdio-default'])
const ERRORS = Object.freeze({
	deck: ['DECK_EXPIRED_OR_UNKNOWN', 'The deck handle is unavailable.'],
	asset: ['ASSET_NOT_FOUND', 'The asset handle is unavailable.'],
	job: ['AVATAR_JOB_NOT_FOUND', 'The avatar job is unavailable.'],
	operation: ['OPERATION_NOT_FOUND', 'Operation was not found.'],
	download: ['ARTIFACT_NOT_FOUND', 'The artifact is unavailable.'],
	resource: ['RESOURCE_NOT_FOUND', 'The resource is unavailable.'],
})

export class ResourceAuthorizationError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'ResourceAuthorizationError'
		this.code = code
	}
}

function identityRequired() {
	return new ResourceAuthorizationError('RESOURCE_IDENTITY_REQUIRED', 'A resource identity is required.')
}

function unavailable(kind) {
	const [code, message] = Object.hasOwn(ERRORS, kind) ? ERRORS[kind] : ERRORS.resource
	return new ResourceAuthorizationError(code, message)
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Do not invoke getters or accept inherited ownership metadata.
function field(record, name) {
	if (!isRecord(record)) return { present: false }
	const descriptor = Object.getOwnPropertyDescriptor(record, name)
	if (!descriptor) return { present: false }
	return { present: true, value: Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined }
}

function makeOwner(kind, identity) {
	return Object.freeze({
		schemaVersion: RESOURCE_OWNER_SCHEMA_VERSION,
		kind,
		id: createHash('sha256').update(JSON.stringify([RESOURCE_OWNER_SCHEMA_VERSION, kind, identity])).digest('hex'),
	})
}

/** Derive ownership only from a trusted server context; unrelated fields are ignored. */
export function resourceOwnerForContext(serverContext = {}, { localMaintainer = false } = {}) {
	const installHash = field(serverContext, 'installHash')
	if (installHash.present && installHash.value !== null && installHash.value !== undefined && installHash.value !== '') {
		if (typeof installHash.value !== 'string' || !INSTALL_HASH.test(installHash.value)) throw identityRequired()
		return makeOwner('install', installHash.value)
	}
	const connectorHash = field(serverContext, 'resourceIdentityHash')
	if (connectorHash.present && connectorHash.value !== null && connectorHash.value !== undefined && connectorHash.value !== '') {
		if (typeof connectorHash.value !== 'string' || !CONNECTOR_HASH.test(connectorHash.value)) throw identityRequired()
		return makeOwner('connector', connectorHash.value)
	}
	const sessionId = field(serverContext, 'sessionId').value
	if (typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 512
		&& sessionId.trim() === sessionId && !/[\x00-\x1f\x7f]/.test(sessionId) && !UNBOUND_SESSIONS.has(sessionId)) {
		return makeOwner('session', sessionId)
	}
	// The caller must obtain this option from server policy, never request data.
	if (localMaintainer === true) return makeOwner('local', 'maintainer')
	throw identityRequired()
}

/** Snapshot identity once, including across awaits, nested calls and queued callbacks. */
export function withResourceAuthorization(serverContext, callback, { localMaintainer = false } = {}) {
	const owner = resourceOwnerForContext(serverContext, { localMaintainer })
	return scopes.run(Object.freeze({ owner, localMaintainer: localMaintainer === true }), callback)
}

// Scope presence is not permission. Public resource calls must enter a scope or
// deny at the dispatcher; absence is only useful for trusted direct local exports.
export function resourceAuthorizationActive() {
	return scopes.getStore() != null
}

/** @returns {ResourceOwner} A frozen, JSON-safe private ownership record. */
export function currentResourceOwner() {
	const scope = scopes.getStore()
	if (!scope) throw identityRequired()
	return scope.owner
}

function normalizedOwner(owner) {
	if (!isRecord(owner)) return null
	const schemaVersion = field(owner, 'schemaVersion').value
	const kind = field(owner, 'kind').value
	const id = field(owner, 'id').value
	if (schemaVersion !== RESOURCE_OWNER_SCHEMA_VERSION || !['install', 'connector', 'session', 'local'].includes(kind)
		|| typeof id !== 'string' || !OWNER_ID.test(id)) return null
	return Object.freeze({ schemaVersion, kind, id })
}

function sameOwner(left, right) {
	return Boolean(left && right && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.id === right.id)
}

/** Read either private envelope layout. A malformed or conflicting binding denies access. */
export function resourceOwnerOf(record) {
	const direct = field(record, 'resourceOwner')
	const metadata = field(field(record, 'metadata').value, 'resourceOwner')
	if (!direct.present && !metadata.present) return null
	const directOwner = direct.present ? normalizedOwner(direct.value) : null
	const metadataOwner = metadata.present ? normalizedOwner(metadata.value) : null
	if ((direct.present && !directOwner) || (metadata.present && !metadataOwner)) return null
	if (direct.present && metadata.present && !sameOwner(directOwner, metadataOwner)) return null
	return directOwner || metadataOwner
}

// Use only on a newly allocated server record, before it enters a cache or store.
// Never use this to claim an existing unowned record found by a supplied handle.
export function bindNewResourceOwner(record) {
	const owner = currentResourceOwner()
	if (!isRecord(record)) throw unavailable('resource')
	const existing = field(record, 'resourceOwner')
	const metadata = field(field(record, 'metadata').value, 'resourceOwner')
	if ((existing.present || metadata.present) && !sameOwner(resourceOwnerOf(record), owner)) throw unavailable('resource')
	if (existing.present && Object.isFrozen(existing.value)) {
		const descriptor = Object.getOwnPropertyDescriptor(record, 'resourceOwner')
		if (!descriptor.writable && !descriptor.configurable) return record
	}
	Object.defineProperty(record, 'resourceOwner', {
		value: owner, enumerable: true, configurable: false, writable: false,
	})
	return record
}

export function canAccessResource(record) {
	const scope = scopes.getStore()
	if (!scope || !isRecord(record)) return false
	if (scope.localMaintainer) return true
	return sameOwner(resourceOwnerOf(record), scope.owner)
}

// Missing and cross-owner lookups deliberately have identical public errors.
// Check before reads, mutations, cache-hit returns, replays or URL issuance.
export function assertResourceAccess(record, { kind = 'resource' } = {}) {
	if (!canAccessResource(record)) throw unavailable(kind)
	return record
}

/** Internal cache/promise key; the public handle itself remains unchanged. */
export function resourceOwnerCacheKey(handle) {
	if (typeof handle !== 'string' || !handle) throw unavailable('resource')
	const owner = currentResourceOwner()
	return JSON.stringify([owner.kind, owner.id, handle])
}
