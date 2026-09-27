// Secret-free durable state for the image-generation provider router.
//
// The state contains only a UTC date, hashed account identifiers, request counts,
// and exhaustion flags. It never stores tokens, prompts, image bytes, tenants, or
// provider responses. Durable mode is opt-in for local/research deployments via
// BETTERPPTX_IMAGE_ROUTER_STATE_FILE (or BETTERPPTX_IMAGE_ROUTER_DURABLE=1).
// BETTERPPTX_REQUIRE_DURABLE_IMAGE_ROUTER=1 makes the router fail closed rather
// than spend Cloudflare quota when persistence is unavailable.
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const SCHEMA_VERSION = 'betterpptx.image-gen-router-state.v1'
const DEFAULT_STATE_FILE = path.join(process.cwd(), 'outputs', 'image-gen-router-state.json')
const DEFAULT_LOCK_WAIT_MS = 2500
const DEFAULT_LOCK_STALE_MS = 30000
let cache = { file: '', stamp: '', state: null }
let lastError = null

function env(name) { return String(process.env[name] || '').trim() }

function boundedEnvMs(name, fallback, maximum) {
	const value = Number(env(name))
	return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), maximum) : fallback
}

export function imageRouterStateFile() {
	const explicit = env('BETTERPPTX_IMAGE_ROUTER_STATE_FILE')
	if (explicit) return path.resolve(explicit)
	if (env('BETTERPPTX_IMAGE_ROUTER_DURABLE') === '1' || env('BETTERPPTX_REQUIRE_DURABLE_IMAGE_ROUTER') === '1') return DEFAULT_STATE_FILE
	return ''
}

export function imageRouterStateRequired() {
	return env('BETTERPPTX_REQUIRE_DURABLE_IMAGE_ROUTER') === '1'
}

function today() { return new Date().toISOString().slice(0, 10) }

function accountKey(provider, accountId) {
	return createHash('sha256').update(`${String(provider || '')}:${String(accountId || '')}`).digest('hex').slice(0, 24)
}

function emptyState(date = today()) {
	return { schemaVersion: SCHEMA_VERSION, date, accounts: {} }
}

function validState(value) {
	if (!value || typeof value !== 'object' || value.schemaVersion !== SCHEMA_VERSION || typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null
	const accounts = value.accounts && typeof value.accounts === 'object' && !Array.isArray(value.accounts) ? value.accounts : {}
	const normalized = {}
	for (const [key, item] of Object.entries(accounts)) {
		if (!/^[a-f0-9]{24}$/.test(key) || !item || typeof item !== 'object') continue
		const count = Number(item.count)
		normalized[key] = {
			count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
			exhausted: item.exhausted === true,
		}
	}
	return { schemaVersion: SCHEMA_VERSION, date: value.date, accounts: normalized }
}

function fileStamp(file) {
	try {
		const stat = fs.statSync(file)
		return `${stat.mtimeNs != null ? stat.mtimeNs.toString() : stat.mtimeMs}:${stat.size}`
	} catch { return '' }
}

// A directory create is the portable cross-process primitive on Windows and
// POSIX for this tiny local ledger. It avoids the overwrite/share semantics of
// a lock file and keeps the lock outside the JSON state payload.
function lockFile(file) { return `${file}.lockdir` }
function eventDirectory(file) { return `${file}.events` }

function waitBriefly(milliseconds = 20) {
	const buffer = new SharedArrayBuffer(4)
	Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds)
}

function acquireLock(file) {
	const lock = lockFile(file)
	const deadline = Date.now() + boundedEnvMs('BETTERPPTX_IMAGE_ROUTER_LOCK_WAIT_MS', DEFAULT_LOCK_WAIT_MS, 60000)
	const staleMs = boundedEnvMs('BETTERPPTX_IMAGE_ROUTER_LOCK_STALE_MS', DEFAULT_LOCK_STALE_MS, 300000)
	fs.mkdirSync(path.dirname(file), { recursive: true })
	while (true) {
		try {
			fs.mkdirSync(lock, { mode: 0o700 })
			try { fs.writeFileSync(path.join(lock, 'owner'), `${process.pid}\n`, { encoding: 'utf8', mode: 0o600 }) } catch { /* metadata is best effort */ }
			return () => { try { fs.rmSync(lock, { recursive: true, force: true }) } catch { /* best effort cleanup */ } }
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error
			try {
				const stat = fs.statSync(lock)
				if (Date.now() - stat.mtimeMs > staleMs) fs.rmSync(lock, { recursive: true, force: true })
			} catch { /* another process may be replacing the lock */ }
			if (Date.now() >= deadline) {
				const timeout = new Error('image router state lock timeout')
				timeout.code = 'IMAGE_ROUTER_STATE_LOCK_TIMEOUT'
				throw timeout
			}
			waitBriefly()
		}
	}
}

function withLock(file, operation) {
	const release = acquireLock(file)
	try { return operation() } finally { release() }
}

function readStateFromDisk(file) {
	const stamp = fileStamp(file)
	let state = null
	try {
		state = validState(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')))
		if (!state) throw new Error('invalid image router state')
		lastError = null
	} catch (error) {
		if (stamp) lastError = error
	}
	if (!state || state.date !== today()) state = emptyState()
	return { state, stamp }
}

function load() {
	const file = imageRouterStateFile()
	if (!file) return { state: null, durable: false }
	const stamp = fileStamp(file)
	if (cache.file === file && cache.stamp === stamp && cache.state) return { state: cache.state, durable: true }
	let state = null
	try {
		state = validState(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')))
		if (state) lastError = null
	} catch (error) {
		if (stamp) lastError = error
	}
	if (!state || state.date !== today()) state = emptyState()
	cache = { file, stamp, state }
	return { state, durable: true }
}

function loadFresh(file) {
	const loaded = readStateFromDisk(file)
	cache = { file, stamp: loaded.stamp, state: loaded.state }
	return { state: loaded.state, durable: true }
}

function readEventLog(file, state) {
	const directory = eventDirectory(file)
	let entries
	try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch (error) {
		if (error?.code === 'ENOENT') return state
		lastError = error
		return state
	}
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.json')) continue
		try {
			const event = JSON.parse(fs.readFileSync(path.join(directory, entry.name), 'utf8'))
			if (event.schemaVersion !== SCHEMA_VERSION || event.date !== today() || !/^[a-f0-9]{24}$/.test(String(event.accountKey || ''))) continue
			const current = state.accounts[event.accountKey] || { count: 0, exhausted: false }
			if (event.operation === 'use') current.count += 1
			else if (event.operation === 'exhausted') current.exhausted = true
			state.accounts[event.accountKey] = current
		} catch (error) {
			lastError = error
		}
	}
	return state
}

function appendEvent(file, operation, provider, accountId) {
	const directory = eventDirectory(file)
	fs.mkdirSync(directory, { recursive: true })
	const accountKeyValue = accountKey(provider, accountId)
	const event = { schemaVersion: SCHEMA_VERSION, date: today(), accountKey: accountKeyValue, operation }
	const eventPath = path.join(directory, `${Date.now()}-${process.pid}-${randomUUID()}.json`)
	const temp = `${eventPath}.tmp`
	fs.writeFileSync(temp, JSON.stringify(event) + '\n', { encoding: 'utf8', mode: 0o600 })
	try { fs.renameSync(temp, eventPath) } catch (error) {
		try { fs.rmSync(temp, { force: true }) } catch { /* best effort cleanup */ }
		throw error
	}
}

function atomicWrite(file, state) {
	const directory = path.dirname(file)
	fs.mkdirSync(directory, { recursive: true })
	const temp = `${file}.${process.pid}.${Date.now()}.tmp`
	fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
	try { fs.renameSync(temp, file) } catch (error) {
		try { fs.rmSync(temp, { force: true }) } catch { /* best effort cleanup */ }
		throw error
	}
	cache = { file, stamp: fileStamp(file), state }
}

function save(state) {
	const file = imageRouterStateFile()
	if (!file) return true
	try {
		withLock(file, () => atomicWrite(file, state))
		lastError = null
		return true
	} catch (error) {
		lastError = error
		if (env('BETTERPPTX_IMAGE_ROUTER_DEBUG') === '1') process.stderr.write(`image-router-state: ${error?.code || 'error'} ${error?.message || error}\n`)
		return false
	}
}

export function imageRouterStateStatus() {
	const file = imageRouterStateFile()
	if (!file) return { mode: imageRouterStateRequired() ? 'required-unavailable' : 'process-local', durable: false, required: imageRouterStateRequired(), writable: false }
	const loaded = load()
	let writable = loaded.durable && !lastError
	if (writable && imageRouterStateRequired() && !fileStamp(file)) writable = save(loaded.state)
	return { mode: writable ? 'durable-local' : 'required-unavailable', durable: writable, required: imageRouterStateRequired(), writable, ...(lastError ? { error: 'state-unavailable' } : {}) }
}

export function imageRouterAccountState(provider, accountId) {
	const loaded = load()
	if (!loaded.state) return { count: 0, exhausted: false, durable: false }
	const state = readEventLog(imageRouterStateFile(), { schemaVersion: loaded.state.schemaVersion, date: loaded.state.date, accounts: Object.fromEntries(Object.entries(loaded.state.accounts).map(([key, item]) => [key, { ...item }])) })
	const key = accountKey(provider, accountId)
	const item = state.accounts[key] || { count: 0, exhausted: false }
	return { count: item.count, exhausted: item.exhausted, durable: true }
}

export function recordImageRouterUse(provider, accountId) {
	const file = imageRouterStateFile()
	if (!file) return !imageRouterStateRequired()
	try {
		return withLock(file, () => {
			loadFresh(file)
			if (imageRouterStateRequired() && lastError) return false
			appendEvent(file, 'use', provider, accountId)
			lastError = null
			return true
		})
	} catch (error) {
		lastError = error
		if (env('BETTERPPTX_IMAGE_ROUTER_DEBUG') === '1') process.stderr.write(`image-router-state: ${error?.code || 'error'} ${error?.message || error}\n`)
		return false
	}
}

export function markImageRouterExhausted(provider, accountId) {
	const file = imageRouterStateFile()
	if (!file) return !imageRouterStateRequired()
	try {
		return withLock(file, () => {
			loadFresh(file)
			if (imageRouterStateRequired() && lastError) return false
			appendEvent(file, 'exhausted', provider, accountId)
			lastError = null
			return true
		})
	} catch (error) {
		lastError = error
		return false
	}
}

export function imageRouterStateError() { return lastError ? 'state-unavailable' : null }

export { SCHEMA_VERSION }
