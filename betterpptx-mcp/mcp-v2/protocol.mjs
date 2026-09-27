import { createHmac, timingSafeEqual } from 'node:crypto'

export const MCP_V2_PROTOCOL_VERSION = '2026-07-28'
export const MCP_LEGACY_PROTOCOL_VERSIONS = Object.freeze([
	'2024-11-05',
	'2025-03-26',
	'2025-06-18',
	'2025-11-25',
])
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
	...MCP_LEGACY_PROTOCOL_VERSIONS,
	MCP_V2_PROTOCOL_VERSION,
])

export const MCP_JSONRPC_PARSE_ERROR = -32700
export const MCP_JSONRPC_INVALID_REQUEST = -32600
export const MCP_JSONRPC_METHOD_NOT_FOUND = -32601
export const MCP_JSONRPC_INVALID_PARAMS = -32602
export const MCP_JSONRPC_INTERNAL_ERROR = -32603
export const MCP_HEADER_MISMATCH = -32020
export const MCP_MISSING_REQUIRED_CLIENT_CAPABILITY = -32021
export const MCP_UNSUPPORTED_PROTOCOL_VERSION = -32022
export const MCP_RATE_LIMITED = -32029
export const MCP_V2_MAX_BATCH_SIZE = 16

const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion'
const CLIENT_INFO_META = 'io.modelcontextprotocol/clientInfo'
const CLIENT_CAPABILITIES_META = 'io.modelcontextprotocol/clientCapabilities'
const SERVER_INFO_META = 'io.modelcontextprotocol/serverInfo'

export function jsonRpcMessages(body) {
	// Keep invalid batch members so they receive Invalid Request responses.
	if (Array.isArray(body)) return body
	if (body && typeof body === 'object') return [body]
	return []
}

export function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function requestMeta(message) {
	const meta = message?.params?._meta
	return meta && typeof meta === 'object' ? meta : {}
}

export function protocolVersionFromMessage(message) {
	return String(requestMeta(message)[PROTOCOL_VERSION_META] || '').trim()
}

export function protocolVersionFromHeader(req) {
	return String(req?.headers?.['mcp-protocol-version'] || '').trim()
}

export function isMcpV2Request(req, body) {
	const messages = jsonRpcMessages(body)
	if (!messages.length) return protocolVersionFromHeader(req) === MCP_V2_PROTOCOL_VERSION
	if (protocolVersionFromHeader(req) === MCP_V2_PROTOCOL_VERSION) return true
	return messages.some(message => {
		if (!isRecord(message)) return false
		if (String(message.method || '') === 'server/discover') return true
		const fromMeta = protocolVersionFromMessage(message)
		const fromHeader = protocolVersionFromHeader(req)
		return fromMeta === MCP_V2_PROTOCOL_VERSION || fromHeader === MCP_V2_PROTOCOL_VERSION
	})
}

export function clientInfoFromMessage(message) {
	const info = requestMeta(message)[CLIENT_INFO_META]
	if (!info || typeof info !== 'object') return null
	return {
		name: String(info.name || 'unknown'),
		version: info.version ? String(info.version) : undefined,
		title: info.title ? String(info.title) : undefined,
	}
}

export function clientCapabilitiesFromMessage(message) {
	const capabilities = requestMeta(message)[CLIENT_CAPABILITIES_META]
	return capabilities && typeof capabilities === 'object' ? capabilities : null
}

export function clientSupportsElicitation(capabilities, mode = '') {
	const elicitation = capabilities?.elicitation
	if (!elicitation || typeof elicitation !== 'object') return false
	if (!mode) return true
	if (mode === 'form') return elicitation.form !== undefined || Object.keys(elicitation).length === 0
	if (mode === 'url') return elicitation.url !== undefined
	return false
}

export function publicMcpProtocolManifest() {
	return {
		latest: MCP_V2_PROTOCOL_VERSION,
		supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
		discoveryMethod: 'server/discover',
		statelessCore: true,
		multiRoundTrip: true,
		sessionRequired: false,
	}
}

export function serverResultMeta(serverInfo) {
	return {
		[SERVER_INFO_META]: {
			name: String(serverInfo?.name || 'betterpptx'),
			version: String(serverInfo?.version || '0'),
			title: serverInfo?.title ? String(serverInfo.title) : undefined,
		},
	}
}

export function completeResult(fields, serverInfo, extra = {}) {
	return {
		resultType: 'complete',
		...fields,
		_meta: serverResultMeta(serverInfo),
		...extra,
	}
}

export function cacheableCompleteResult(fields, serverInfo, { ttlMs = 300000, cacheScope = 'public' } = {}) {
	return completeResult({
		...fields,
		ttlMs,
		cacheScope,
	}, serverInfo)
}

export function inputRequiredResult({ inputRequests, requestState, serverInfo }) {
	return {
		resultType: 'input_required',
		...(inputRequests ? { inputRequests } : {}),
		...(requestState ? { requestState } : {}),
		_meta: serverResultMeta(serverInfo),
	}
}

export function jsonRpcResult(id, result) {
	return { jsonrpc: '2.0', id, result }
}

export function jsonRpcError(id, code, message, data) {
	return {
		jsonrpc: '2.0',
		id: id ?? null,
		error: {
			code,
			message,
			...(data === undefined ? {} : { data }),
		},
	}
}

export function httpStatusForRpcError(code) {
	if (code === MCP_RATE_LIMITED) return 429
	if (
		code === MCP_JSONRPC_PARSE_ERROR
		|| code === MCP_JSONRPC_INVALID_REQUEST
		|| code === MCP_JSONRPC_INVALID_PARAMS
		|| code === MCP_HEADER_MISMATCH
		|| code === MCP_MISSING_REQUIRED_CLIENT_CAPABILITY
		|| code === MCP_UNSUPPORTED_PROTOCOL_VERSION
	) return 400
	if (code === MCP_JSONRPC_METHOD_NOT_FOUND) return 200
	return 200
}

const REQUEST_STATE_TTL_MS = 15 * 60 * 1000
const MAX_REQUEST_STATE_LENGTH = 8 * 1024 * 1024
const REQUEST_STATE_DOMAIN = 'betterpptx-mcp-v2/request-state\0'

function requestStateSecret() {
	// Bearer credentials are known to clients and cannot authenticate server state.
	// The transport returns the original gated result if no private key is configured.
	return process.env.BETTERPPTX_MCP_V2_STATE_SECRET || process.env.BETTERPPTX_INSTALL_HMAC_SECRET
}

function requestStateSignature(json, secret) {
	if (typeof secret !== 'string' || secret.trim().length < 32) throw new Error('requestState unavailable')
	return createHmac('sha256', secret).update(REQUEST_STATE_DOMAIN).update(json).digest()
}

export function encodeRequestState(payload, secret = requestStateSecret()) {
	if (!isRecord(payload)) throw new Error('invalid requestState')
	const now = Date.now()
	const json = Buffer.from(JSON.stringify({
		...payload,
		v: 2,
		iat: now,
		exp: now + REQUEST_STATE_TTL_MS,
	}), 'utf8').toString('base64url')
	if (json.length + 44 > MAX_REQUEST_STATE_LENGTH) throw new Error('invalid requestState')
	const sig = requestStateSignature(json, secret).toString('base64url')
	return `${json}.${sig}`
}

export function decodeRequestState(token, secret = requestStateSecret()) {
	if (typeof token !== 'string' || token.length > MAX_REQUEST_STATE_LENGTH) throw new Error('invalid requestState')
	const parts = token.split('.')
	if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('invalid requestState')
	const [json, sig] = parts
	const expected = requestStateSignature(json, secret)
	const received = Buffer.from(sig, 'base64url')
	if (received.length !== expected.length || received.toString('base64url') !== sig || !timingSafeEqual(received, expected)) {
		throw new Error('invalid requestState')
	}
	const decoded = Buffer.from(json, 'base64url')
	if (decoded.toString('base64url') !== json) throw new Error('invalid requestState')
	const payload = JSON.parse(decoded.toString('utf8'))
	const now = Date.now()
	if (!isRecord(payload) || payload.v !== 2
		|| !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
		|| payload.iat < 0 || payload.iat > now
		|| payload.exp <= payload.iat || payload.exp - payload.iat > REQUEST_STATE_TTL_MS) {
		throw new Error('invalid requestState')
	}
	if (payload.exp <= now) throw new Error('expired requestState')
	return payload
}

export function validateV2RequestMeta(req, message) {
	if (!isRecord(message) || typeof message.method !== 'string') {
		return jsonRpcError(message?.id ?? null, MCP_JSONRPC_INVALID_REQUEST, 'Invalid Request')
	}
	if (message.jsonrpc !== '2.0') {
		return jsonRpcError(message.id ?? null, MCP_JSONRPC_INVALID_REQUEST, 'Invalid Request')
	}
	if (!isRecord(message.params) || !isRecord(message.params._meta)
		|| !isRecord(message.params._meta[CLIENT_CAPABILITIES_META])) {
		return jsonRpcError(message.id ?? null, MCP_JSONRPC_INVALID_PARAMS, 'Invalid request metadata')
	}
	const fromMeta = protocolVersionFromMessage(message)
	const fromHeader = protocolVersionFromHeader(req)
	if (!fromMeta) {
		return jsonRpcError(message.id ?? null, MCP_JSONRPC_INVALID_PARAMS, 'Missing required protocol version', {
			field: PROTOCOL_VERSION_META,
		})
	}
	if (fromHeader && fromHeader !== fromMeta) {
		return jsonRpcError(message.id ?? null, MCP_HEADER_MISMATCH, 'MCP-Protocol-Version header does not match request metadata', {
			header: fromHeader,
			meta: fromMeta,
		})
	}
	if (fromMeta !== MCP_V2_PROTOCOL_VERSION) {
		return jsonRpcError(message.id ?? null, MCP_UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', {
			supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
			requested: fromMeta,
		})
	}
	if (!clientCapabilitiesFromMessage(message)) {
		return jsonRpcError(message.id ?? null, MCP_JSONRPC_INVALID_PARAMS, 'Missing required client capabilities', {
			field: CLIENT_CAPABILITIES_META,
		})
	}
	return null
}

export function upgradeErrorCode(payload) {
	const code = String(payload?.error?.code || payload?.code || '')
	if (code === 'REQUIRES_UPGRADE' || code === 'QUOTA_EXCEEDED' || code === 'PREMIUM_FEATURE_REQUIRES_UPGRADE') return code
	return ''
}
