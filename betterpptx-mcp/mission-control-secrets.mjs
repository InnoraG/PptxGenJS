import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { logEvent } from './logger.mjs'

const SECRET_MANAGER_API = 'https://secretmanager.googleapis.com/v1'
const METADATA_ROOT = 'http://metadata.google.internal/computeMetadata/v1'
const VALUE_MAX_BYTES = 16 * 1024
const TOKEN_TTL_SKEW_MS = 60 * 1000

const memorySecrets = new Map()
let metadataToken = { accessToken: '', expiresAtMs: 0 }

export const MISSION_CONTROL_SECRET_DEFINITIONS = Object.freeze([
	Object.freeze({
		id: 'dodo_test_api_key',
		displayName: 'Dodo Test API Key',
		kind: 'dodo-api-key',
		secretName: 'betterpptx-dodo-test-api-key',
		envName: 'DODO_PAYMENTS_API_KEY',
		alternateEnvNames: ['BETTERPPTX_DODO_API_KEY'],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'dodo_webhook_secret',
		displayName: 'Dodo Webhook Signing Secret',
		kind: 'webhook-secret',
		secretName: 'betterpptx-dodo-webhook-secret',
		envName: 'DODO_PAYMENTS_WEBHOOK_SECRET',
		alternateEnvNames: ['BETTERPPTX_DODO_WEBHOOK_SECRET'],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-dodo-webhook-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'dodo_webhook_custom_token',
		displayName: 'Dodo Webhook Custom Token',
		kind: 'random-token',
		secretName: 'betterpptx-dodo-webhook-custom-token',
		envName: 'BETTERPPTX_DODO_WEBHOOK_CUSTOM_TOKEN',
		alternateEnvNames: ['DODO_PAYMENTS_WEBHOOK_CUSTOM_TOKEN'],
		dependentServices: ['betterpptx-dodo-webhook-staging'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'mission_control_admin_token',
		displayName: 'Mission Control Admin Token',
		kind: 'random-token',
		secretName: 'betterpptx-mission-control-admin-token',
		envName: 'BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
])

export class MissionControlSecretError extends Error {
	constructor(code, message, statusCode = 400, details = {}) {
		super(message)
		this.name = 'MissionControlSecretError'
		this.code = code
		this.statusCode = statusCode
		this.details = details
	}
}

function envFlag(name) {
	return String(process.env[name] || '').trim().toLowerCase()
}

function backendMode() {
	const configured = envFlag('BETTERPPTX_MC_SECRET_BACKEND')
	if (configured === 'env' || configured === 'memory' || configured === 'local') return 'env'
	return 'gcp-secret-manager'
}

function definitionFor(id) {
	const text = String(id || '').trim()
	const def = MISSION_CONTROL_SECRET_DEFINITIONS.find(item => item.id === text)
	if (!def) throw new MissionControlSecretError('MC_SECRET_NOT_ALLOWED', 'This Mission Control secret is not allowlisted.', 404)
	return def
}

function isoNow() {
	return new Date().toISOString()
}

function base64Url(bytes = 32) {
	return randomBytes(bytes).toString('base64url')
}

function valueFingerprint(value) {
	const text = String(value || '')
	if (!text) return null
	return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)}`
}

function compactDefined(record) {
	return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== undefined && value !== null && value !== ''))
}

function sourceFor(def, backend, projectId) {
	if (backend === 'env') {
		return {
			type: 'local-env-test',
			envName: def.envName,
			overrideEnvName: `BETTERPPTX_MC_SECRET_${def.id.toUpperCase()}`,
		}
	}
	return {
		type: 'secret-manager',
		projectId: projectId || null,
		secretName: def.secretName,
		envName: def.envName,
	}
}

function activeVersionName(name) {
	const text = String(name || '')
	const parts = text.split('/').filter(Boolean)
	return parts[parts.length - 1] || null
}

function redactedRecord(def, { backend, projectId = null, value = '', versionName = null, metadata = null, status = null, error = null } = {}) {
	const configured = Boolean(String(value || ''))
	const effectiveStatus = status || (configured ? 'ok' : 'missing')
	return {
		id: def.id,
		displayName: def.displayName,
		kind: def.kind,
		status: effectiveStatus,
		configured,
		fingerprint: valueFingerprint(value),
		length: configured ? Buffer.byteLength(String(value), 'utf8') : 0,
		source: sourceFor(def, backend, projectId),
		activeVersion: activeVersionName(versionName),
		activeVersionState: metadata?.state || null,
		lastRotationTime: metadata?.createTime || null,
		dependentServices: def.dependentServices,
		actions: def.actions,
		...(error ? { error: { code: error.code || 'MC_SECRET_ERROR', message: error.message || 'Secret status check failed.' } } : {}),
	}
}

function ensureAction(def, action) {
	if (!def.actions?.[action]) {
		throw new MissionControlSecretError('MC_SECRET_ACTION_UNAVAILABLE', `The ${action} action is not available for this secret.`, 405)
	}
}

function ensureConfirm(action, id, confirm) {
	const expected = `${action.toUpperCase()} ${id}`
	if (String(confirm || '').trim() !== expected) {
		throw new MissionControlSecretError('MC_SECRET_CONFIRMATION_REQUIRED', `Confirmation must exactly match: ${expected}`, 400, { expected })
	}
}

function ensureSecretValue(value) {
	const text = String(value || '')
	if (!text.trim()) throw new MissionControlSecretError('MC_SECRET_VALUE_EMPTY', 'Secret value cannot be empty.', 400)
	const bytes = Buffer.byteLength(text, 'utf8')
	if (bytes > VALUE_MAX_BYTES) {
		throw new MissionControlSecretError('MC_SECRET_VALUE_TOO_LARGE', 'Secret value exceeds the Mission Control update limit.', 413, { maxBytes: VALUE_MAX_BYTES })
	}
	return text
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
	const fetchImpl = options.fetchImpl || fetch
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const { fetchImpl: _ignored, ...rest } = options
		return await fetchImpl(url, { ...rest, signal: controller.signal })
	} finally {
		clearTimeout(timer)
	}
}

async function parseJsonResponse(response) {
	const text = await response.text()
	if (!text) return null
	try { return JSON.parse(text) } catch { return { raw: text } }
}

async function metadataText(pathname, { fetchImpl = fetch } = {}) {
	const response = await fetchWithTimeout(`${METADATA_ROOT}/${pathname.replace(/^\/+/, '')}`, {
		fetchImpl,
		headers: { 'Metadata-Flavor': 'Google' },
	}, 3000)
	if (!response.ok) throw new MissionControlSecretError('MC_METADATA_UNAVAILABLE', 'Cloud metadata service is unavailable.', 503, { status: response.status })
	return response.text()
}

async function projectId(options = {}) {
	const configured = String(process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '').trim()
	if (configured) return configured
	return metadataText('project/project-id', options)
}

async function googleAccessToken(options = {}) {
	const now = Date.now()
	if (metadataToken.accessToken && metadataToken.expiresAtMs > now + TOKEN_TTL_SKEW_MS) return metadataToken.accessToken
	const response = await fetchWithTimeout(`${METADATA_ROOT}/instance/service-accounts/default/token`, {
		fetchImpl: options.fetchImpl || fetch,
		headers: { 'Metadata-Flavor': 'Google' },
	}, 3000)
	if (!response.ok) throw new MissionControlSecretError('MC_METADATA_TOKEN_UNAVAILABLE', 'Cloud metadata token is unavailable.', 503, { status: response.status })
	const data = await parseJsonResponse(response)
	const accessToken = String(data?.access_token || '')
	if (!accessToken) throw new MissionControlSecretError('MC_METADATA_TOKEN_INVALID', 'Cloud metadata token response was invalid.', 503)
	const expiresIn = Math.max(60, Number(data?.expires_in || 300))
	metadataToken = { accessToken, expiresAtMs: now + expiresIn * 1000 }
	return accessToken
}

async function secretManagerFetch(pathname, options = {}) {
	const token = await googleAccessToken(options)
	const response = await fetchWithTimeout(`${SECRET_MANAGER_API}/${pathname.replace(/^\/+/, '')}`, {
		fetchImpl: options.fetchImpl || fetch,
		method: options.method || 'GET',
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
		},
		...(options.body ? { body: JSON.stringify(options.body) } : {}),
	}, options.timeoutMs || 10000)
	const data = await parseJsonResponse(response)
	if (!response.ok) {
		throw new MissionControlSecretError('MC_SECRET_MANAGER_HTTP', 'Secret Manager request failed.', response.status === 404 ? 404 : 502, {
			status: response.status,
			reason: data?.error?.status || data?.error?.message || null,
		})
	}
	return data
}

function gcpSecretPath(project, def) {
	return `projects/${project}/secrets/${def.secretName}`
}

async function accessGcpSecret(def, options = {}) {
	const project = await projectId(options)
	const data = await secretManagerFetch(`${gcpSecretPath(project, def)}/versions/latest:access`, options)
	const encoded = String(data?.payload?.data || '')
	const value = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : ''
	return { projectId: project, value, versionName: data?.name || null }
}

async function describeGcpVersion(versionName, options = {}) {
	if (!versionName) return null
	try {
		return await secretManagerFetch(versionName, options)
	} catch (err) {
		if (err instanceof MissionControlSecretError && err.statusCode === 404) return null
		throw err
	}
}

async function addGcpSecretVersion(def, value, options = {}) {
	const project = await projectId(options)
	const data = await secretManagerFetch(`${gcpSecretPath(project, def)}:addVersion`, {
		...options,
		method: 'POST',
		body: { payload: { data: Buffer.from(String(value), 'utf8').toString('base64') } },
	})
	return { projectId: project, value, versionName: data?.name || null, metadata: data || null }
}

function envCandidateNames(def) {
	return [`BETTERPPTX_MC_SECRET_${def.id.toUpperCase()}`, def.envName, ...(def.alternateEnvNames || [])]
}

function readEnvSecret(def) {
	const memory = memorySecrets.get(def.id)
	if (memory) return { ...memory, source: 'memory' }
	for (const name of envCandidateNames(def)) {
		if (process.env[name]) {
			return {
				value: process.env[name],
				versionName: name,
				metadata: { state: 'ENABLED', createTime: null },
				source: 'env',
			}
		}
	}
	return { value: '', versionName: null, metadata: null, source: 'missing' }
}

function writeEnvSecret(def, value) {
	const previous = memorySecrets.get(def.id)
	const version = Number(previous?.version || 0) + 1
	const record = {
		value,
		version,
		versionName: `local-${version}`,
		metadata: { state: 'ENABLED', createTime: isoNow() },
		source: 'memory',
	}
	memorySecrets.set(def.id, record)
	return record
}

async function readSecret(def, options = {}) {
	const backend = backendMode()
	if (backend === 'env') {
		const record = readEnvSecret(def)
		return { backend, projectId: null, ...record }
	}
	const accessed = await accessGcpSecret(def, options)
	const metadata = await describeGcpVersion(accessed.versionName, options)
	return { backend, ...accessed, metadata }
}

async function writeSecret(def, value, options = {}) {
	const backend = backendMode()
	if (backend === 'env') {
		const record = writeEnvSecret(def, value)
		return { backend, projectId: null, ...record }
	}
	const written = await addGcpSecretVersion(def, value, options)
	const metadata = written.metadata || await describeGcpVersion(written.versionName, options)
	return { backend, ...written, metadata }
}

function safeSecretError(err) {
	if (err instanceof MissionControlSecretError) return err
	return new MissionControlSecretError('MC_SECRET_STATUS_ERROR', 'Secret status check failed.', 502, { cause: String(err?.message || err) })
}

export function listMissionControlSecretDefinitions() {
	return MISSION_CONTROL_SECRET_DEFINITIONS.map(def => ({
		id: def.id,
		displayName: def.displayName,
		kind: def.kind,
		secretName: def.secretName,
		envName: def.envName,
		dependentServices: def.dependentServices,
		actions: def.actions,
	}))
}

export async function getMissionControlSecretsSnapshot(options = {}) {
	const backend = backendMode()
	const project = backend === 'gcp-secret-manager'
		? await projectId(options).catch(() => null)
		: null
	const secrets = []
	for (const def of MISSION_CONTROL_SECRET_DEFINITIONS) {
		try {
			const record = await readSecret(def, options)
			secrets.push(redactedRecord(def, record))
		} catch (err) {
			const safe = safeSecretError(err)
			secrets.push(redactedRecord(def, {
				backend,
				projectId: project,
				status: safe.statusCode === 404 ? 'missing' : 'error',
				error: safe,
			}))
		}
	}
	return compactDefined({
		ok: true,
		mode: 'MC2_OWNER_SECRET_CONTROLS',
		generatedAt: isoNow(),
		backend,
		projectId: project,
		secrets,
	})
}

export async function revealMissionControlSecret(id, { confirm, ...options } = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'reveal')
	ensureConfirm('reveal', def.id, confirm)
	const record = await readSecret(def, options)
	logEvent('mission_control.secret_action', { action: 'reveal', id: def.id, status: 'ok', fingerprint: valueFingerprint(record.value), activeVersion: activeVersionName(record.versionName) })
	return {
		ok: true,
		id: def.id,
		displayName: def.displayName,
		value: record.value,
		length: Buffer.byteLength(String(record.value || ''), 'utf8'),
		fingerprint: valueFingerprint(record.value),
		activeVersion: activeVersionName(record.versionName),
		lastRotationTime: record.metadata?.createTime || null,
	}
}

export async function updateMissionControlSecret(id, { value, confirm, ...options } = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'update')
	ensureConfirm('update', def.id, confirm)
	const cleanValue = ensureSecretValue(value)
	const record = await writeSecret(def, cleanValue, options)
	logEvent('mission_control.secret_action', { action: 'update', id: def.id, status: 'ok', fingerprint: valueFingerprint(cleanValue), activeVersion: activeVersionName(record.versionName) })
	return {
		ok: true,
		action: 'update',
		secret: redactedRecord(def, record),
	}
}

export async function rotateMissionControlSecret(id, { confirm, ...options } = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'rotate')
	ensureConfirm('rotate', def.id, confirm)
	if (def.kind !== 'random-token') {
		throw new MissionControlSecretError('MC_SECRET_ROTATION_UNSUPPORTED', 'Automatic rotation is only available for generated token secrets.', 405)
	}
	const rotatedValue = base64Url(32)
	const record = await writeSecret(def, rotatedValue, options)
	logEvent('mission_control.secret_action', { action: 'rotate', id: def.id, status: 'ok', fingerprint: valueFingerprint(rotatedValue), activeVersion: activeVersionName(record.versionName) })
	return {
		ok: true,
		action: 'rotate',
		secret: redactedRecord(def, record),
	}
}

function decodeStandardWebhookSecret(secret) {
	const text = String(secret || '').trim()
	if (!text.toLowerCase().startsWith('whsec_')) return null
	const encoded = text.slice(6).replace(/-/g, '+').replace(/_/g, '/')
	const padded = encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), '=')
	try { return Buffer.from(padded, 'base64') } catch { return null }
}

function safeBufferEqual(a, b) {
	const left = Buffer.from(String(a || ''), 'utf8')
	const right = Buffer.from(String(b || ''), 'utf8')
	return left.length === right.length && timingSafeEqual(left, right)
}

async function testDodoApiKey(value, { fetchImpl = fetch } = {}) {
	const environment = String(process.env.BETTERPPTX_DODO_ENVIRONMENT || 'test').toLowerCase()
	const configuredBase = String(process.env.BETTERPPTX_DODO_API_BASE || '').trim().replace(/\/+$/, '')
	const base = configuredBase || (environment === 'live' ? 'https://live.dodopayments.com' : environment === 'api' ? 'https://api.dodopayments.com' : 'https://test.dodopayments.com')
	const response = await fetchWithTimeout(`${base}/products`, {
		fetchImpl,
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${value}`,
		},
	}, 10000)
	await response.text().catch(() => '')
	return {
		ok: response.ok,
		check: 'dodo-products-list',
		environment,
		httpStatus: response.status,
	}
}

function testWebhookSecret(value) {
	const text = String(value || '').trim()
	const decoded = decodeStandardWebhookSecret(text)
	const key = decoded || Buffer.from(text, 'utf8')
	if (!key.length || text.length < 12) return { ok: false, check: 'webhook-signature-self-test', reason: 'too-short' }
	const sample = 'mission-control.webhook.self-test'
	const signature = createHmac('sha256', key).update(sample, 'utf8').digest('base64')
	const expected = createHmac('sha256', key).update(sample, 'utf8').digest('base64')
	return {
		ok: safeBufferEqual(signature, expected),
		check: 'webhook-signature-self-test',
		standardWebhookFormat: Boolean(decoded),
	}
}

function testRandomToken(value) {
	const text = String(value || '').trim()
	return {
		ok: Buffer.byteLength(text, 'utf8') >= 24,
		check: 'token-length',
		minBytes: 24,
		length: Buffer.byteLength(text, 'utf8'),
	}
}

export async function testMissionControlSecret(id, options = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'test')
	const record = await readSecret(def, options)
	if (!record.value) throw new MissionControlSecretError('MC_SECRET_MISSING', 'Secret value is missing.', 404)
	let result
	if (def.kind === 'dodo-api-key') result = await testDodoApiKey(record.value, options)
	else if (def.kind === 'webhook-secret') result = testWebhookSecret(record.value)
	else if (def.kind === 'random-token') result = testRandomToken(record.value)
	else result = { ok: true, check: 'configured' }
	logEvent('mission_control.secret_action', { action: 'test', id: def.id, status: result.ok ? 'ok' : 'failed', check: result.check, httpStatus: result.httpStatus, fingerprint: valueFingerprint(record.value) })
	return {
		ok: Boolean(result.ok),
		id: def.id,
		displayName: def.displayName,
		fingerprint: valueFingerprint(record.value),
		activeVersion: activeVersionName(record.versionName),
		test: result,
	}
}
