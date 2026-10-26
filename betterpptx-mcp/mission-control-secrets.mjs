import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeAddressInventory, normalizeEvmAddress } from './billing/address-inventory.mjs'
import { deriveDepositAddress, normalizeDepositXpubConfig } from './billing/deposit-xpub.mjs'
import { deriveForwarderSalt } from './billing/deposit-forwarders.mjs'
import { logEvent } from './logger.mjs'

const SECRET_MANAGER_API = 'https://secretmanager.googleapis.com/v1'
const METADATA_ROOT = 'http://metadata.google.internal/computeMetadata/v1'
const VALUE_MAX_BYTES = 16 * 1024
const TOKEN_TTL_SKEW_MS = 60 * 1000

const memorySecrets = new Map()
let metadataToken = { accessToken: '', expiresAtMs: 0 }

export const MISSION_CONTROL_SECRET_DEFINITIONS = Object.freeze([
	Object.freeze({
		id: 'speech_worker_credentials',
		displayName: 'Speech GPU Account Credentials',
		kind: 'modal-credentials',
		description: 'Dedicated speech account credential pair. Rotate the pair at Modal, update it here, then redeploy the private speech bridge and rebind the billing-sync job to the new Secret Manager version. Run the sync and verify fresh billing before new speech. This account is separate from avatar worker rotation.',
		secretName: 'betterpptx-speech-worker-credentials',
		envName: 'BETTERPPTX_SPEECH_WORKER_CREDENTIALS',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-narration-modal', 'betterpptx-avatar-budget-sync'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'mission_control_access_token',
		displayName: 'Mission Control Access Token',
		kind: 'random-token',
		secretName: 'betterpptx-mission-control-token',
		envName: 'BETTERPPTX_MISSION_CONTROL_TOKEN',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mission-control'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'mission_control_admin_token',
		displayName: 'Mission Control Admin Token',
		kind: 'random-token',
		secretName: 'betterpptx-mission-control-admin-token',
		envName: 'BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mission-control'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'avatar_worker_credentials',
		displayName: 'Avatar Worker Credential Bundle',
		kind: 'credential-bundle',
		secretName: 'betterpptx-avatar-worker-credentials',
		envName: 'BETTERPPTX_CREDENTIAL_STORE',
		alternateEnvNames: ['BETTERPPTX_AVATAR_WORKER_TOKEN'],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'cloudflare_worker_deploy_token',
		displayName: 'Cloudflare Worker Deployment Token',
		kind: 'cloudflare-api-token',
		description: 'Owner-created in Cloudflare. Grant Workers Scripts edit on this account and Workers Routes edit only on the BetterPPTX product zone(s) (x4ai.si; xmcpx.com while it redirects). Store and update the value here; status testing confirms the token is active but does not enumerate its permissions.',
		secretName: 'betterpptx-cloudflare-worker-deploy-token',
		envName: 'BETTERPPTX_CLOUDFLARE_WORKER_DEPLOY_TOKEN',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mission-control', 'betterpptx-cloudrun-deploy', 'betterpptx-cloudflare-edge-worker'],
		// Tokens are created and revoked at Cloudflare. Mission Control owns the
		// protected value and its test/update path, but cannot mint a replacement.
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'meshy_api_key',
		displayName: 'Meshy API Key (native 3D presenter)',
		kind: 'meshy-api-key',
		secretName: 'betterpptx-meshy-api-key',
		envName: 'BETTERPPTX_MESHY_API_KEY',
		alternateEnvNames: ['MESHY_API_KEY'],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-3d-presenter-worker'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'install_hmac_secret',
		localIdentityFile: 'install-hmac-secret',
		displayName: 'Install Identity HMAC Secret',
		kind: 'hmac-secret',
		secretName: 'betterpptx-install-hmac-secret',
		envName: 'BETTERPPTX_INSTALL_HMAC_SECRET',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'mcp_v2_state_secret',
		displayName: 'MCP Continuation State Signing Secret',
		kind: 'hmac-secret',
		secretName: 'betterpptx-mcp-v2-state-secret',
		envName: 'BETTERPPTX_MCP_V2_STATE_SECRET',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'identity_postgres_password',
		displayName: 'Self-hosted Identity Database Password',
		kind: 'random-token',
		localIdentityFile: 'postgres-password',
		localIdentityOnly: true,
		dependentServices: ['identity-postgres', 'identity-provider'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'identity_bootstrap_admin_password',
		displayName: 'Self-hosted Identity Bootstrap Administrator Password',
		kind: 'random-token',
		localIdentityFile: 'bootstrap-admin-password',
		localIdentityOnly: true,
		dependentServices: ['identity-provider-bootstrap'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'payment_envelope_secret',
		displayName: 'Payment Envelope Encryption Secret',
		kind: 'hmac-secret',
		secretName: 'betterpptx-payment-envelope-secret',
		envName: 'BETTERPPTX_PAYMENT_ENVELOPE_SECRET',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'treasury_evm_address',
		displayName: 'Treasury EVM Address',
		kind: 'evm-address',
		secretName: 'betterpptx-treasury-evm-address',
		envName: 'BETTERPPTX_TREASURY_EVM_ADDRESS',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'base_rpc_url',
		displayName: 'Base RPC URL',
		kind: 'base-rpc-url',
		secretName: 'betterpptx-base-rpc-url',
		envName: 'BETTERPPTX_BASE_RPC_URL',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'x402_facilitator_url',
		displayName: 'x402 Facilitator URL',
		kind: 'https-url',
		secretName: 'betterpptx-x402-facilitator-url',
		envName: 'BETTERPPTX_X402_FACILITATOR_URL',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'x402_facilitator_token',
		displayName: 'x402 Facilitator Token',
		kind: 'random-token',
		secretName: 'betterpptx-x402-facilitator-token',
		envName: 'BETTERPPTX_X402_FACILITATOR_TOKEN',
		alternateEnvNames: ['BETTERPPTX_X402_FACILITATOR_API_KEY'],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'x402_settlement_mode',
		displayName: 'x402 Settlement Mode',
		kind: 'x402-settlement-mode',
		secretName: 'betterpptx-x402-settlement-mode',
		envName: 'BETTERPPTX_X402_SETTLEMENT_MODE',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'x402_gas_relayer_key',
		displayName: 'x402 Gas Relayer Private Key (gas-only, never treasury funds)',
		kind: 'evm-private-key',
		secretName: 'betterpptx-x402-gas-relayer-key',
		envName: 'BETTERPPTX_X402_RELAYER_PRIVATE_KEY',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'scanner_token',
		displayName: 'Payment Scanner Shared Token',
		kind: 'random-token',
		secretName: 'betterpptx-payment-scanner-token',
		envName: 'BETTERPPTX_SCANNER_TOKEN',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'pexels_api_key',
		displayName: 'Pexels Stock Media API Key',
		kind: 'random-token',
		secretName: 'betterpptx-pexels-api-key',
		envName: 'BETTERPPTX_PEXELS_API_KEY',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'pixabay_api_key',
		displayName: 'Pixabay Stock Media API Key',
		kind: 'random-token',
		secretName: 'betterpptx-pixabay-api-key',
		envName: 'BETTERPPTX_PIXABAY_API_KEY',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'freesound_api_key',
		displayName: 'Freesound Audio API Key (CC0 music beds)',
		kind: 'random-token',
		secretName: 'betterpptx-freesound-api-key',
		envName: 'BETTERPPTX_FREESOUND_API_KEY',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'payram_base_url',
		displayName: 'PayRam API Base URL',
		kind: 'https-url',
		secretName: 'betterpptx-payram-base-url',
		envName: 'BETTERPPTX_PAYRAM_BASE_URL',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'oci-payram'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'payram_api_key',
		displayName: 'PayRam Project API Key',
		kind: 'payram-api-key',
		secretName: 'betterpptx-payram-api-key',
		envName: 'BETTERPPTX_PAYRAM_API_KEY',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'payram_webhook_custom_token',
		displayName: 'PayRam Webhook/Reconciler Token',
		kind: 'random-token',
		secretName: 'betterpptx-payram-webhook-custom-token',
		envName: 'BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN',
		alternateEnvNames: ['BETTERPPTX_PAYRAM_RECONCILE_TOKEN'],
		dependentServices: ['betterpptx-mcp-staging', 'oci-payram'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'payram_project_id',
		displayName: 'PayRam Project ID',
		kind: 'configured-value',
		secretName: 'betterpptx-payram-project-id',
		envName: 'BETTERPPTX_PAYRAM_PROJECT_ID',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'oci-payram'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'promo_codes_registry',
		displayName: 'BetterPPTX Promo Code Registry',
		kind: 'promo-code-registry',
		secretName: 'betterpptx-promo-codes',
		envName: 'BETTERPPTX_PROMO_CODES_JSON',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'payram_hot_wallet_private_key',
		displayName: 'PayRam Hot/Sweep Private Key (OCI only, gas-only)',
		kind: 'evm-private-key',
		secretName: 'betterpptx-payram-hot-wallet-private-key',
		envName: 'BETTERPPTX_PAYRAM_HOT_WALLET_PRIVATE_KEY',
		alternateEnvNames: [],
		dependentServices: ['oci-payram'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'forwarder_factory_address',
		displayName: 'CREATE2 Forwarder Factory Address',
		kind: 'evm-address',
		secretName: 'betterpptx-forwarder-factory-address',
		envName: 'BETTERPPTX_FORWARDER_FACTORY_ADDRESS',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'forwarder_codehash',
		displayName: 'CREATE2 Forwarder Init Code Hash',
		kind: 'bytes32',
		secretName: 'betterpptx-forwarder-codehash',
		envName: 'BETTERPPTX_FORWARDER_CODEHASH',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'settlement_collector_evm_address',
		displayName: 'Settlement Collector EVM Address',
		kind: 'evm-address',
		secretName: 'betterpptx-settlement-collector-evm-address',
		envName: 'BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'forwarder_salt_secret',
		displayName: 'CREATE2 Forwarder Salt Secret',
		kind: 'forwarder-salt-secret',
		secretName: 'betterpptx-forwarder-salt-secret',
		envName: 'BETTERPPTX_FORWARDER_SALT_SECRET',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: true, test: true },
	}),
	Object.freeze({
		id: 'forwarder_sweeper_key',
		displayName: 'CREATE2 Forwarder Sweeper Private Key (gas-only)',
		kind: 'evm-private-key',
		secretName: 'betterpptx-forwarder-sweeper-key',
		envName: 'BETTERPPTX_FORWARDER_SWEEPER_KEY',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'deposit_xpub',
		displayName: 'Deposit Address xpub (watch-only direct crypto address derivation)',
		kind: 'deposit-xpub',
		secretName: 'betterpptx-deposit-xpub',
		envName: 'BETTERPPTX_DEPOSIT_XPUB_JSON',
		alternateEnvNames: ['BETTERPPTX_DEPOSIT_XPUB'],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
	}),
	Object.freeze({
		id: 'deposit_address_inventory',
		displayName: 'Deposit Address Inventory (legacy/bootstrap fallback)',
		kind: 'address-inventory',
		secretName: 'betterpptx-deposit-address-inventory',
		envName: 'BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON',
		alternateEnvNames: [],
		dependentServices: ['betterpptx-mcp-staging', 'betterpptx-payment-scanner'],
		actions: { reveal: true, update: true, rotate: false, test: true },
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

function backendMode(def) {
	const configured = envFlag('BETTERPPTX_MC_SECRET_BACKEND')
	if (def?.localIdentityFile && (def.localIdentityOnly || configured === 'local-identity' || envFlag('BETTERPPTX_SELF_HOSTED_IDENTITY') === '1')) return 'local-identity'
	if (configured === 'local-identity') return def ? 'env' : 'local-identity'
	if (configured === 'env' || configured === 'memory' || configured === 'local') return 'env'
	return 'gcp-secret-manager'
}

function definitionFor(id) {
	const text = String(id || '').trim()
	const def = selectedSecretDefinitions().find(item => item.id === text)
	if (!def) throw new MissionControlSecretError('MC_SECRET_NOT_ALLOWED', 'This Mission Control secret is not allowlisted.', 404)
	return def
}

function selectedSecretDefinitions() {
	const raw = String(process.env.BETTERPPTX_MISSION_CONTROL_SECRET_IDS || '').trim()
	if (!raw) return MISSION_CONTROL_SECRET_DEFINITIONS
	const ids = [...new Set(raw.split(/[,\s]+/).filter(Boolean))]
	const unknown = ids.filter(id => !MISSION_CONTROL_SECRET_DEFINITIONS.some(def => def.id === id))
	if (unknown.length) {
		throw new MissionControlSecretError('MC_SECRET_SELECTION_INVALID', 'Mission Control secret selection contains an unsupported secret identifier.', 500)
	}
	const selected = new Set(ids)
	return MISSION_CONTROL_SECRET_DEFINITIONS.filter(def => selected.has(def.id))
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
	if (backend === 'local-identity') return { type: 'local-identity-file', secretName: def.localIdentityFile }
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

function redactedRecord(def, { backend, projectId = null, value = '', versionName = null, metadata = null, status = null, error = null, configuredRecord = null, stagedRecords = [] } = {}) {
	const configured = Boolean(String(value || ''))
	const localIdentity = backend === 'local-identity'
	const memoryOnly = backend === 'env' && metadata?.state === 'STAGED_MEMORY_ONLY'
	const effectiveStatus = status || (configured ? localIdentity ? 'staged-not-activated' : memoryOnly ? 'staged-memory-only' : 'ok' : 'missing')
	return {
		id: def.id,
		displayName: def.displayName,
		kind: def.kind,
		...(def.description ? { description: def.description } : {}),
		status: effectiveStatus,
		configured,
		fingerprint: valueFingerprint(value),
		length: configured ? Buffer.byteLength(String(value), 'utf8') : 0,
		source: sourceFor(def, backend, projectId),
		activeVersion: localIdentity || memoryOnly ? null : activeVersionName(versionName),
		activeVersionState: localIdentity ? 'UNVERIFIED' : metadata?.state || null,
		lastRotationTime: localIdentity || memoryOnly ? null : metadata?.createTime || null,
		dependentServices: def.dependentServices,
		actions: def.actions,
		...(localIdentity ? {
			valueState: stagedRecords.length ? 'staged-rotation' : 'configured-file-unverified',
			valueVersion: activeVersionName(versionName),
			configuredFile: localIdentityVersionSummary(configuredRecord),
			stagedVersions: stagedRecords.map(localIdentityVersionSummary),
			activation: localIdentityActivation(def),
			actions: { ...def.actions, activate: false },
			error: { code: 'MC_SECRET_ACTIVATION_BLOCKED', message: localIdentityActivation(def).blockers.map(item => item.message).join(' ') },
		} : memoryOnly ? {
			valueVersion: activeVersionName(versionName),
			activation: { status: 'blocked', activated: false, persisted: false, blockers: [{ code: 'MEMORY_ONLY_CHANGE', message: 'This value exists only in Mission Control memory. It has not updated deployment configuration or any dependent service and will be lost on restart.' }] },
		} : {}),
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

function validateSecretValueForDefinition(def, value) {
	if (def.kind === 'modal-credentials' && !testModalCredentials(value).ok) {
		throw new MissionControlSecretError('MC_SECRET_VALUE_INVALID', 'Speech credentials require a JSON object containing token_id and token_secret.', 400)
	}
	if (def.kind === 'cloudflare-api-token') {
		const text = String(value || '')
		if (Buffer.byteLength(text.trim(), 'utf8') < 20 || text !== text.trim() || /[\s\u0000]/.test(text)) {
			throw new MissionControlSecretError('MC_SECRET_VALUE_INVALID', 'Cloudflare API tokens must be a single non-whitespace value of at least 20 bytes.', 400)
		}
	}
	return value
}

function testModalCredentials(value) {
	let pair
	try { pair = JSON.parse(value) } catch { return { ok: false, check: 'credential-pair-format', runtimeVerified: false } }
	const valid = pair && typeof pair === 'object' && !Array.isArray(pair)
		&& typeof pair.token_id === 'string' && /^ak-[A-Za-z0-9_-]{8,}$/.test(pair.token_id)
		&& typeof pair.token_secret === 'string' && /^as-[A-Za-z0-9_-]{8,}$/.test(pair.token_secret)
		&& Object.keys(pair).every(key => ['token_id', 'token_secret'].includes(key))
	return { ok: Boolean(valid), check: 'credential-pair-format', runtimeVerified: false, configurationOnly: true }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
	const fetchImpl = options.fetchImpl || fetch
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const { fetchImpl: _ignored, ...rest } = options
		return await fetchImpl(url, { ...rest, redirect: 'error', signal: controller.signal })
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

function localIdentityRoot() {
	return path.resolve(process.env.BETTERPPTX_MC_LOCAL_IDENTITY_ROOT || fileURLToPath(new URL('./deploy/identity/.private', import.meta.url)))
}

function localIdentityFailure() {
	return new MissionControlSecretError('MC_LOCAL_IDENTITY_STORAGE_INVALID', 'Private identity storage is missing, unsafe, or inconsistent. No credential was activated.', 503)
}

function assertLocalIdentityDirectory(directory) {
	let current = path.parse(directory).root
	for (const component of path.relative(current, directory).split(path.sep).filter(Boolean)) {
		current = path.join(current, component)
		const stat = lstatSync(current)
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw localIdentityFailure()
	}
}

function checkedLocalIdentityRoot() {
	const root = localIdentityRoot()
	assertLocalIdentityDirectory(root)
	// Windows uses the owner-only inherited ACL established by the provisioner.
	if (process.platform !== 'win32' && (lstatSync(root).mode & 0o077)) throw localIdentityFailure()
	return root
}

function readLocalIdentityText(file, maxBytes = VALUE_MAX_BYTES) {
	assertLocalIdentityDirectory(path.dirname(file))
	const stat = lstatSync(file)
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw localIdentityFailure()
	const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
	try {
		const opened = fstatSync(fd)
		if (!opened.isFile() || opened.size > maxBytes || opened.ino !== stat.ino || opened.dev !== stat.dev) throw localIdentityFailure()
		return readFileSync(fd, 'utf8')
	} finally { closeSync(fd) }
}

function localIdentityActivation(def) {
	const blockers = def.localIdentityFile === 'install-hmac-secret' ? [
		{ code: 'IDENTITY_DATA_MIGRATION_REQUIRED', message: 'Changing this key changes persisted account, resource-owner, quota and billing identity hashes. A versioned-key migration and rollback plan must be completed before activation.' },
		{ code: 'MCP_RESTART_AND_ENV_RECONCILIATION_REQUIRED', message: 'Update the main service deployment secret, resolve environment overrides, restart all dependent instances and verify existing identity bindings.' },
	] : def.localIdentityFile === 'postgres-password' ? [
		{ code: 'DATABASE_ROLE_PASSWORD_CHANGE_REQUIRED', message: 'The database password file initializes a new database only. Change the existing database role credential through private database administration first.' },
		{ code: 'DEPENDENT_SERVICES_ROLLOUT_REQUIRED', message: 'Coordinate the database and identity-provider credentials, restart dependent services, verify authentication and retain a rollback path.' },
	] : [
		{ code: 'BOOTSTRAP_IS_NOT_ADMIN_ROTATION', message: 'This bootstrap file does not update an existing administrator. Rotate the actual administrator credential through private identity administration and remove or disable bootstrap access.' },
	]
	return { status: 'blocked', activated: false, canActivate: false, activationRequired: true, runtimeVerified: false, blockers }
}

function localIdentityVersionSummary(record) {
	return record ? { version: record.versionName, fingerprint: valueFingerprint(record.value), createdAt: record.metadata.createTime, status: 'staged-not-activated' } : null
}

function localIdentityRecord(def, file, metadata) {
	const value = readLocalIdentityText(file, 4096).trim()
	if (!/^[A-Za-z0-9_-]{32,256}$/.test(value) || metadata?.name !== def.localIdentityFile
		|| !/^[a-f0-9]{16}$/.test(metadata.version || '') || !Number.isFinite(Date.parse(metadata.createdAt))
		|| metadata.fingerprint !== createHash('sha256').update(value).digest('hex').slice(0, 16)) throw localIdentityFailure()
	return { value, versionName: metadata.version, metadata: { state: 'STAGED_NOT_ACTIVATED', createTime: metadata.createdAt } }
}

function readLocalIdentitySecret(def) {
	try {
		const root = checkedLocalIdentityRoot()
		const manifest = JSON.parse(readLocalIdentityText(path.join(root, 'credential-status.json'), 65536))
		const matches = Array.isArray(manifest) ? manifest.filter(item => item?.name === def.localIdentityFile) : []
		if (matches.length !== 1) throw localIdentityFailure()
		const configuredRecord = localIdentityRecord(def, path.join(root, 'secrets', def.localIdentityFile), matches[0])
		const stagedRecords = []
		const staging = path.join(root, 'rotations')
		let entries = []
		try { assertLocalIdentityDirectory(staging); entries = readdirSync(staging) } catch (error) { if (error.code !== 'ENOENT') throw error }
		for (const entry of entries) {
			if (!entry.startsWith(`${def.localIdentityFile}-`) || !entry.endsWith('.json')) continue
			const version = entry.slice(def.localIdentityFile.length + 1, -5)
			if (!/^[a-f0-9]{16}$/.test(version)) throw localIdentityFailure()
			const metadata = JSON.parse(readLocalIdentityText(path.join(staging, entry)))
			if (metadata.version !== version) throw localIdentityFailure()
			stagedRecords.push(localIdentityRecord(def, path.join(staging, entry.slice(0, -5)), metadata))
		}
		stagedRecords.sort((a, b) => Date.parse(a.metadata.createTime) - Date.parse(b.metadata.createTime) || a.versionName.localeCompare(b.versionName))
		// The existing owner UI reveals/tests the value shown by its fingerprint:
		// the newest staged candidate, or the configured file before any rotation.
		const selected = stagedRecords.at(-1) || configuredRecord
		return { backend: 'local-identity', projectId: null, ...selected, configuredRecord, stagedRecords }
	} catch { throw localIdentityFailure() }
}

function auditLocalIdentityAction(def, action, record) {
	try {
		const file = path.join(checkedLocalIdentityRoot(), 'mission-control-audit.ndjson')
		try { if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) throw localIdentityFailure() } catch (error) { if (error.code !== 'ENOENT') throw error }
		const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW || 0), 0o600)
		try {
			if (!fstatSync(fd).isFile()) throw localIdentityFailure()
			writeFileSync(fd, JSON.stringify({ at: isoNow(), action, id: def.id, version: record.versionName, fingerprint: valueFingerprint(record.value), status: 'not-activated' }) + '\n')
		} finally { closeSync(fd) }
	} catch { throw new MissionControlSecretError('MC_LOCAL_IDENTITY_AUDIT_UNAVAILABLE', 'Private identity audit recording failed. No credential was activated.', 503) }
}

function stageLocalIdentitySecret(def, value) {
	if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) throw new MissionControlSecretError('MC_LOCAL_IDENTITY_VALUE_INVALID', 'Identity credentials require 32-256 base64url characters.', 400)
	const current = readLocalIdentitySecret(def)
	try {
		const staging = path.join(checkedLocalIdentityRoot(), 'rotations')
		try { mkdirSync(staging, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
		assertLocalIdentityDirectory(staging)
		const metadata = {
			name: def.localIdentityFile, status: 'staged-not-activated',
			fingerprint: createHash('sha256').update(value).digest('hex').slice(0, 16),
			source: 'Mission Control owner action', version: randomBytes(8).toString('hex'),
			createdAt: new Date(Math.max(Date.now(), Date.parse(current.metadata.createTime) + 1)).toISOString(),
			activatedAt: null, lastRotatedAt: null, dependentServices: def.dependentServices,
		}
		const destination = path.join(staging, `${def.localIdentityFile}-${metadata.version}`)
		writeFileSync(destination, value + '\n', { flag: 'wx', mode: 0o600 })
		writeFileSync(destination + '.json', JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
		return readLocalIdentitySecret(def)
	} catch { throw localIdentityFailure() }
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
		metadata: { state: 'STAGED_MEMORY_ONLY', createTime: isoNow() },
		source: 'memory',
	}
	memorySecrets.set(def.id, record)
	return record
}

async function readSecret(def, options = {}) {
	const backend = backendMode(def)
	if (backend === 'local-identity') return readLocalIdentitySecret(def)
	if (backend === 'env') {
		const record = readEnvSecret(def)
		return { backend, projectId: null, ...record }
	}
	const accessed = await accessGcpSecret(def, options)
	const metadata = await describeGcpVersion(accessed.versionName, options)
	return { backend, ...accessed, metadata }
}

async function writeSecret(def, value, options = {}) {
	const backend = backendMode(def)
	if (backend === 'local-identity') return stageLocalIdentitySecret(def, value)
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
	return selectedSecretDefinitions().map(def => ({
		id: def.id,
		displayName: def.displayName,
		kind: def.kind,
		...(def.description ? { description: def.description } : {}),
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
	for (const def of selectedSecretDefinitions()) {
		try {
			const record = await readSecret(def, options)
			secrets.push(redactedRecord(def, record))
		} catch (err) {
			const safe = safeSecretError(err)
			secrets.push(redactedRecord(def, {
				backend: backendMode(def),
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

function auditSecretAction(def, action, record) {
	if (record.backend === 'local-identity') auditLocalIdentityAction(def, action, record)
	const redacted = redactedRecord(def, record)
	logEvent('mission_control.secret_action', { action, id: def.id, status: redacted.status, fingerprint: redacted.fingerprint, activeVersion: redacted.activeVersion })
	return redacted
}

export async function revealMissionControlSecret(id, { confirm, ...options } = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'reveal')
	ensureConfirm('reveal', def.id, confirm)
	const record = await readSecret(def, options)
	const redacted = auditSecretAction(def, 'reveal', record)
	return {
		ok: true,
		id: def.id,
		displayName: def.displayName,
		value: record.value,
		length: Buffer.byteLength(String(record.value || ''), 'utf8'),
		fingerprint: valueFingerprint(record.value),
		activeVersion: redacted.activeVersion,
		lastRotationTime: redacted.lastRotationTime,
		...(redacted.activation ? { valueState: redacted.valueState || 'staged-memory-only', valueVersion: redacted.valueVersion, activation: redacted.activation } : {}),
	}
}

export async function updateMissionControlSecret(id, { value, confirm, ...options } = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'update')
	ensureConfirm('update', def.id, confirm)
	const cleanValue = validateSecretValueForDefinition(def, ensureSecretValue(value))
	const record = await writeSecret(def, cleanValue, options)
	const redacted = auditSecretAction(def, 'update', record)
	return {
		ok: true,
		action: 'update',
		secret: redacted,
	}
}

export async function rotateMissionControlSecret(id, { confirm, ...options } = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'rotate')
	ensureConfirm('rotate', def.id, confirm)
	if (def.kind !== 'random-token' && def.kind !== 'hmac-secret') {
		throw new MissionControlSecretError('MC_SECRET_ROTATION_UNSUPPORTED', 'Automatic rotation is only available for generated token secrets.', 405)
	}
	const rotatedValue = base64Url(def.kind === 'hmac-secret' ? 48 : 32)
	const record = await writeSecret(def, rotatedValue, options)
	const redacted = auditSecretAction(def, 'rotate', record)
	return {
		ok: true,
		action: 'rotate',
		secret: redacted,
	}
}

function safeBufferEqual(a, b) {
	const left = Buffer.from(String(a || ''), 'utf8')
	const right = Buffer.from(String(b || ''), 'utf8')
	return left.length === right.length && timingSafeEqual(left, right)
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

function testMeshyApiKey(value) {
	const text = String(value || '').trim()
	const printable = /^[^\u0000-\u001f\u007f]+$/.test(text)
	return {
		ok: printable && Buffer.byteLength(text, 'utf8') >= 24,
		check: 'meshy-api-key-format',
		minBytes: 24,
		length: Buffer.byteLength(text, 'utf8'),
		printable,
	}
}

function testHmacSecret(value) {
	const text = String(value || '')
	const sample = 'mission-control.hmac.self-test'
	const signature = createHmac('sha256', text).update(sample, 'utf8').digest('hex')
	const expected = createHmac('sha256', text).update(sample, 'utf8').digest('hex')
	return {
		ok: Buffer.byteLength(text, 'utf8') >= 32 && safeBufferEqual(signature, expected),
		check: 'hmac-sha256-self-test',
		minBytes: 32,
		length: Buffer.byteLength(text, 'utf8'),
	}
}

function parseHttpsUrl(value) {
	let url
	try {
		url = new URL(String(value || '').trim())
	} catch {
		return null
	}
	if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null
	return url
}

function testHttpsUrl(value) {
	const url = parseHttpsUrl(value)
	return {
		ok: Boolean(url),
		check: 'https-url-policy',
		protocol: url?.protocol || null,
		host: url?.host || null,
	}
}

function testEvmAddress(value) {
	try {
		const address = normalizeEvmAddress(value)
		return { ok: true, check: 'evm-address-format', fingerprint: valueFingerprint(address) }
	} catch {
		return { ok: false, check: 'evm-address-format' }
	}
}

function testBytes32(value) {
	const text = String(value || '').trim().toLowerCase()
	return {
		ok: /^0x[0-9a-f]{64}$/.test(text),
		check: 'bytes32-format',
		fingerprint: /^0x[0-9a-f]{64}$/.test(text) ? valueFingerprint(text) : null,
	}
}

function testForwarderSaltSecret(value) {
	try {
		const salt = deriveForwarderSalt({
			orderId: 'mission-control-self-test',
			customerHash: 'mission-control',
			nonce: 'self-test',
		}, value)
		return {
			ok: /^0x[0-9a-f]{64}$/.test(salt),
			check: 'forwarder-salt-hmac',
			derivedSaltFingerprint: valueFingerprint(salt),
		}
	} catch (err) {
		return {
			ok: false,
			check: 'forwarder-salt-hmac',
			reason: err?.code || 'invalid-forwarder-salt-secret',
		}
	}
}

function testAddressInventory(value) {
	try {
		const parsed = JSON.parse(String(value || ''))
		const inventory = normalizeAddressInventory(parsed)
		return {
			ok: inventory.length > 0,
			check: 'public-address-inventory',
			addressCount: inventory.length,
			uniqueAddresses: new Set(inventory.map(item => item.address)).size,
		}
	} catch (err) {
		return {
			ok: false,
			check: 'public-address-inventory',
			reason: err?.code || 'invalid-json',
		}
	}
}

async function testPayRamApiKey(value, { fetchImpl = fetch } = {}) {
	const key = String(value || '').trim()
	if (Buffer.byteLength(key, 'utf8') < 16) {
		return { ok: false, check: 'payram-api-key', reason: 'too-short' }
	}
	const configuredBase = String(
		process.env.BETTERPPTX_MC_SECRET_PAYRAM_BASE_URL
		|| process.env.BETTERPPTX_PAYRAM_BASE_URL
		|| '',
	).trim().replace(/\/+$/, '')
	const base = parseHttpsUrl(configuredBase)
	if (!base) {
		return { ok: false, check: 'payram-api-key-format', formatValid: true, authentication: 'unknown', reason: 'payram-base-url-not-configured' }
	}
	const url = `${base.toString().replace(/\/+$/, '')}/api/v1/payment/reference/mission-control-self-test`
	// A healthy public endpoint or a 404 alone does not prove authentication.
	// Compare the same read-only protected route without a key first. Neither
	// response creates an order or changes provider configuration.
	const unauthenticated = await fetchWithTimeout(url, {
		fetchImpl, headers: { Accept: 'application/json' },
	}, 10000)
	await unauthenticated.body?.cancel?.().catch(() => {})
	if (![401, 403].includes(unauthenticated.status)) return {
		ok: false, check: 'payram-status-api-auth-probe', authentication: 'unknown',
		controlHttpStatus: unauthenticated.status,
		reason: 'probe-did-not-establish-authentication-boundary',
	}
	const response = await fetchWithTimeout(url, {
		fetchImpl,
		headers: {
			Accept: 'application/json',
			'API-Key': key,
		},
	}, 10000)
	await response.body?.cancel?.().catch(() => {})
	const accepted = (response.status >= 200 && response.status < 300) || response.status === 404
	return {
		ok: accepted,
		check: 'payram-status-api-auth-probe',
		httpStatus: response.status,
		controlHttpStatus: unauthenticated.status,
		authentication: accepted ? 'accepted-by-status-probe' : [401, 403].includes(response.status) ? 'rejected' : 'unknown',
		checkoutExecution: 'not-tested',
	}
}

async function testCloudflareApiToken(value, { fetchImpl = fetch } = {}) {
	const token = String(value || '').trim()
	if (Buffer.byteLength(token, 'utf8') < 20 || /[\r\n\u0000]/.test(token)) {
		return { ok: false, check: 'cloudflare-api-token-active', reason: 'invalid-token-format' }
	}
	try {
		const response = await fetchWithTimeout('https://api.cloudflare.com/client/v4/user/tokens/verify', {
			fetchImpl,
			method: 'GET',
			headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
		}, 10000)
		const data = await parseJsonResponse(response)
		const active = response.ok && data?.success === true && data?.result?.status === 'active'
		return {
			ok: active,
			check: 'cloudflare-api-token-active',
			httpStatus: response.status,
			status: data?.result?.status === 'active' || data?.result?.status === 'disabled' || data?.result?.status === 'expired'
				? data.result.status
				: 'unknown',
			permissions: 'not-enumerated-by-token-verification',
		}
	} catch {
		return { ok: false, check: 'cloudflare-api-token-active', reason: 'verification-request-failed' }
	}
}

function testDepositXpub(value) {
	try {
		const config = normalizeDepositXpubConfig(String(value || ''))
		const first = deriveDepositAddress(config, config.startIndex)
		const second = deriveDepositAddress(config, config.startIndex + 1)
		return {
			ok: /^0x[0-9a-f]{40}$/.test(first.address) && first.address !== second.address,
			check: 'deposit-xpub-public-derivation',
			startIndex: config.startIndex,
			firstAddress: first.address,
			secondAddress: second.address,
			fingerprint: config.fingerprint,
		}
	} catch (err) {
		return {
			ok: false,
			check: 'deposit-xpub-public-derivation',
			reason: err?.code || 'invalid-xpub',
		}
	}
}

function testX402SettlementMode(value) {
	const mode = String(value || '').trim().toLowerCase()
	return {
		ok: mode === 'self_settle' || mode === 'cdp_facilitator',
		check: 'x402-settlement-mode',
		mode: mode || null,
	}
}

function testPromoCodeRegistry(value) {
	try {
		const parsed = JSON.parse(String(value || ''))
		const rows = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.codes) ? parsed.codes : null
		if (!rows) return { ok: false, check: 'promo-code-registry', reason: 'array-or-codes-array-required' }
		const codes = rows.map(row => String(row?.code || '').trim()).filter(Boolean)
		if (codes.length !== rows.length || new Set(codes.map(code => code.toUpperCase())).size !== codes.length) {
			return { ok: false, check: 'promo-code-registry', reason: 'each-entry-needs-a-unique-code' }
		}
		return { ok: true, check: 'promo-code-registry', codeCount: codes.length }
	} catch {
		return { ok: false, check: 'promo-code-registry', reason: 'invalid-json' }
	}
}

async function testEvmPrivateKey(value) {
	const text = String(value || '').trim()
	if (!/^0x[0-9a-fA-F]{64}$/.test(text)) return { ok: false, check: 'evm-private-key-format' }
	try {
		const { privateKeyToAccount } = await import('viem/accounts')
		const account = privateKeyToAccount(text)
		return { ok: true, check: 'evm-private-key-format', derivedAddress: account.address }
	} catch {
		return { ok: false, check: 'evm-private-key-format' }
	}
}

async function testBaseRpcUrl(value, { fetchImpl = fetch } = {}) {
	const url = parseHttpsUrl(value)
	if (!url) return { ok: false, check: 'base-chain-id', reason: 'https-url-required' }
	const response = await fetchWithTimeout(url.toString(), {
		fetchImpl,
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
	}, 10000)
	const data = await parseJsonResponse(response)
	const chainId = Number.parseInt(String(data?.result || ''), 16)
	return {
		ok: response.ok && chainId === 8453,
		check: 'base-chain-id',
		httpStatus: response.status,
		chainId: Number.isFinite(chainId) ? chainId : null,
	}
}

export async function testMissionControlSecret(id, options = {}) {
	const def = definitionFor(id)
	ensureAction(def, 'test')
	const record = await readSecret(def, options)
	if (!record.value) throw new MissionControlSecretError('MC_SECRET_MISSING', 'Secret value is missing.', 404)
	let result
	if (def.kind === 'payram-api-key') result = await testPayRamApiKey(record.value, options)
	else if (def.kind === 'modal-credentials') result = testModalCredentials(record.value)
	else if (def.kind === 'cloudflare-api-token') result = await testCloudflareApiToken(record.value, options)
	else if (def.kind === 'meshy-api-key') result = testMeshyApiKey(record.value)
	else if (def.kind === 'random-token') result = testRandomToken(record.value)
	else if (def.kind === 'hmac-secret') result = testHmacSecret(record.value)
	else if (def.kind === 'evm-address') result = testEvmAddress(record.value)
	else if (def.kind === 'bytes32') result = testBytes32(record.value)
	else if (def.kind === 'forwarder-salt-secret') result = testForwarderSaltSecret(record.value)
	else if (def.kind === 'https-url') result = testHttpsUrl(record.value)
	else if (def.kind === 'base-rpc-url') result = await testBaseRpcUrl(record.value, options)
	else if (def.kind === 'address-inventory') result = testAddressInventory(record.value)
	else if (def.kind === 'deposit-xpub') result = testDepositXpub(record.value)
	else if (def.kind === 'promo-code-registry') result = testPromoCodeRegistry(record.value)
	else if (def.kind === 'x402-settlement-mode') result = testX402SettlementMode(record.value)
	else if (def.kind === 'evm-private-key') result = await testEvmPrivateKey(record.value)
	else result = { ok: true, check: 'configured' }
	const redacted = redactedRecord(def, record)
	if (redacted.activation) result = { ...result, configurationOnly: true, runtimeVerified: false, activation: redacted.activation }
	if (record.backend === 'local-identity') auditLocalIdentityAction(def, 'test', record)
	logEvent('mission_control.secret_action', { action: 'test', id: def.id, status: result.ok ? 'ok' : 'failed', check: result.check, httpStatus: result.httpStatus, fingerprint: valueFingerprint(record.value) })
	return {
		ok: Boolean(result.ok),
		id: def.id,
		displayName: def.displayName,
		fingerprint: valueFingerprint(record.value),
		activeVersion: redacted.activeVersion,
		...(redacted.activation ? { valueVersion: redacted.valueVersion, activation: redacted.activation } : {}),
		test: result,
	}
}
