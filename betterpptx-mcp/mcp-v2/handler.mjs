import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { createTraceId, logEvent } from '../logger.mjs'
import { traceToolList, traceToolCall } from '../diagnostic-trace.mjs'
import { advertisedPublicTools, publicRuntimeManifest } from '../public-manifest.mjs'
import { isPublicBlackBoxMode } from '../blackbox.mjs'
import { createMcpToolDispatcher } from '../engine.mjs'
import { canonicalToolName } from '../tools.mjs'
import { MONETIZED_MCP_PROTOCOL_TOOLS } from '../billing/monetized-mcp-adapter.mjs'
import { PUBLIC_INSTRUCTIONS } from '../server.mjs'
import { readPublicGalleryResource } from '../public-gallery.mjs'
import { withSavedPresentationResourceLink } from '../delivery/public-file-result.mjs'
import {
	MCP_JSONRPC_INTERNAL_ERROR,
	MCP_JSONRPC_INVALID_PARAMS,
	MCP_JSONRPC_INVALID_REQUEST,
	MCP_JSONRPC_METHOD_NOT_FOUND,
	MCP_RATE_LIMITED,
	MCP_SUPPORTED_PROTOCOL_VERSIONS,
	MCP_V2_MAX_BATCH_SIZE,
	MCP_V2_PROTOCOL_VERSION,
	cacheableCompleteResult,
	clientCapabilitiesFromMessage,
	clientInfoFromMessage,
	clientSupportsElicitation,
	completeResult,
	decodeRequestState,
	encodeRequestState,
	httpStatusForRpcError,
	inputRequiredResult,
	isRecord,
	jsonRpcError,
	jsonRpcMessages,
	jsonRpcResult,
	upgradeErrorCode,
	validateV2RequestMeta,
} from './protocol.mjs'
import {
	checkoutUrlForInstall,
	getPublicPrompt,
	mcpV2Capabilities,
	mcpV2Instructions,
	mcpV2ServerInfo,
	publicPromptCatalog,
	publicResourceCatalog,
	runtimeStatusResource,
} from './catalog.mjs'

function sdkToolFromDef(def) {
	const tool = {
		name: def.name,
		title: def.title,
		description: def.description,
		inputSchema: def.inputSchema,
	}
	if (def.outputSchema) tool.outputSchema = def.outputSchema
	if (def.annotations) tool.annotations = def.annotations
	if (def._meta) tool._meta = def._meta
	if (def.securitySchemes) tool.securitySchemes = def.securitySchemes
	return tool
}

let stdoutRedirectUsers = 0
let originalConsole = null

async function withStdoutRedirected(fn) {
	if (stdoutRedirectUsers++ === 0) {
		originalConsole = { log: console.log, info: console.info, warn: console.warn }
		const toErr = (...args) => process.stderr.write(args.map(a => typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()).join(' ') + '\n')
		console.log = toErr
		console.info = toErr
		console.warn = toErr
	}
	try { return await fn() }
	finally {
		if (--stdoutRedirectUsers === 0) {
			Object.assign(console, originalConsole)
			originalConsole = null
		}
	}
}

function asToolResult(payload, isError = false) {
	return {
		content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
		isError,
	}
}

function asProtocolToolResult(result) {
	const payload = result?.ok === true
		? result.data
		: {
			code: String(result?.error?.code || 'PURCHASE_FAILED'),
			message: String(result?.error?.message || 'The purchase request failed.'),
			retryable: Boolean(result?.error?.retry_safe || result?.error?.recoverable),
		}
	return {
		content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
		isError: result?.ok !== true,
	}
}

function elicitationInputRequest({ checkoutUrl, feature }) {
	if (checkoutUrl) {
		return {
			method: 'elicitation/create',
			params: {
				mode: 'url',
				message: `This presentation feature requires Premium or credits. Open checkout to continue, then retry the same request. Feature: ${feature}.`,
				url: checkoutUrl,
			},
		}
	}
	return {
		method: 'elicitation/create',
		params: {
			mode: 'form',
			message: `This presentation feature requires Premium or credits. Activate a checkout key to continue, or keep the free-safe result. Feature: ${feature}.`,
			requestedSchema: {
				type: 'object',
				properties: {
					choice: {
						type: 'string',
						title: 'How should BetterPPTX continue?',
						description: 'Activate premium/credits, or keep the valid free-safe work so far.',
						enum: ['activate', 'keep_free'],
					},
					activationKey: {
						type: 'string',
						title: 'Activation key',
						description: 'Paste the checkout key if you chose activate.',
					},
				},
				required: ['choice'],
			},
		},
	}
}

function callerBinding(context) {
	// Only the transport's verified installation identity is authoritative. Request
	// headers, _meta, clientInfo, session ids and continuation claims are not
	// identities. The public connector continuity hash is server-derived from
	// transport headers and is safe for continuation/rate-limit binding, but is
	// not an authentication credential.
	const installHash = typeof context.installHash === 'string' ? context.installHash.trim() : ''
	const resourceIdentityHash = typeof context.resourceIdentityHash === 'string' ? context.resourceIdentityHash.trim() : ''
	const identity = installHash || resourceIdentityHash
	return identity ? createHash('sha256').update(`mcp-v2-caller\0${identity}`).digest('base64url') : ''
}

function asArtifactReadResult(payload) {
	if (payload?.ok !== true || !payload.data?.dataBase64) return asToolResult(payload, payload?.ok === false)
	const { dataBase64, ...metadata } = payload.data
	if (metadata.mode === 'resource') return {
		structuredContent: { ok: true, data: metadata },
		content: [
			{ type: 'text', text: JSON.stringify({ ok: true, data: metadata }) },
			{ type: 'resource', resource: {
				uri: `betterpptx://saved/${encodeURIComponent(metadata.operationId)}/${encodeURIComponent(metadata.fileName)}`,
				mimeType: metadata.mimeType,
				blob: dataBase64,
			} },
		],
		isError: false,
	}
	// Some supported connectors expose only structuredContent to the model.
	// Keep the bytes there and make the text content a concise summary; otherwise
	// chunk mode can report success while making reconstruction impossible.
	return {
		structuredContent: { ok: true, data: { ...metadata, dataBase64 } },
		content: [{ type: 'text', text: JSON.stringify({ ok: true, data: metadata }) }],
		isError: false,
	}
}

function asExactStructuredToolResult(result) {
	const payload = result?.ok === true
		? result.data
		: {
			code: String(result?.error?.code || 'TOOL_ERROR'),
			message: String(result?.error?.message || 'The request failed.'),
		}
	return {
		content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
		isError: result?.ok !== true,
	}
}

const callRateBuckets = new Map()
const MAX_CALL_RATE_BUCKETS = 10000

class CallRateLimitError extends Error {
	constructor(retryAfterMs) {
		super('Too many tool requests. Retry after a short delay.')
		this.retryAfterMs = retryAfterMs
	}
}

function rateLimitNumber(value, fallback, minimum) {
	const number = Number(value)
	return value !== undefined && String(value).trim() !== '' && Number.isFinite(number) && number >= minimum ? number : fallback
}

function consumeCallBudget(context) {
	// The HTTP limiter accounts for envelopes. This separate budget accounts for
	// each RPC and each additional activation/retry call, including inside batches.
	// Unbound callers share a bucket; changing self-declared metadata cannot reset it.
	const capacity = Math.floor(rateLimitNumber(process.env.BETTERPPTX_RATE_LIMIT_BURST, 120, 1))
	const refillPerMs = rateLimitNumber(process.env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN, 120, 0) / 60000
	const key = callerBinding(context) || 'unbound'
	const now = Date.now()
	let bucket = callRateBuckets.get(key)
	if (!bucket && callRateBuckets.size >= MAX_CALL_RATE_BUCKETS) {
		// Never evict outstanding rate debt to admit a new caller.
		for (const [id, item] of callRateBuckets) {
			if (item.tokens + Math.max(0, now - item.updatedAt) * refillPerMs >= capacity) callRateBuckets.delete(id)
		}
		if (callRateBuckets.size >= MAX_CALL_RATE_BUCKETS) throw new CallRateLimitError(60000)
	}
	if (!bucket) bucket = { tokens: capacity, updatedAt: now }
	bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.updatedAt) * refillPerMs)
	bucket.updatedAt = Math.max(now, bucket.updatedAt)
	callRateBuckets.set(key, bucket)
	if (bucket.tokens < 1) throw new CallRateLimitError(refillPerMs > 0 ? Math.ceil((1 - bucket.tokens) / refillPerMs) : null)
	bucket.tokens -= 1
}

function upgradeResponse(inputResponses, mode) {
	if (!isRecord(inputResponses) || Object.keys(inputResponses).length !== 1 || !Object.hasOwn(inputResponses, 'upgrade')) return null
	const response = inputResponses.upgrade
	if (!isRecord(response) || !['accept', 'decline', 'cancel'].includes(response.action)) return null
	if (response.action !== 'accept') return response
	if (mode === 'url') {
		return response.content == null || (isRecord(response.content) && !Object.keys(response.content).length) ? response : null
	}
	if (!isRecord(response.content) || !['activate', 'keep_free'].includes(response.content.choice)) return null
	if (response.content.choice === 'activate' && (typeof response.content.activationKey !== 'string' || !response.content.activationKey.trim())) return null
	return response
}

function createDispatcher(context, clientInfo) {
	const boundContext = {
		// Each RPC gets fresh transient execution/hydration state. Persistent
		// entitlements remain the engine's responsibility, bound to installHash;
		// public connector resources use the transport-derived continuity hash.
		sessionId: `mcpv2_${randomUUID()}`,
		clientInfo,
		blackBox: context.blackBox ?? isPublicBlackBoxMode(),
		installHash: typeof context.installHash === 'string' ? context.installHash.trim() || null : null,
		resourceIdentityHash: typeof context.resourceIdentityHash === 'string' ? context.resourceIdentityHash.trim() || null : null,
		quotaIdentityHash: typeof context.quotaIdentityHash === 'string' ? context.quotaIdentityHash.trim() || null : null,
		authenticated: context.authenticated === true,
		authenticationBasis: context.authenticationBasis || null,
		installState: {},
		toolNameProfile: context.toolNameProfile,
	}
	const dispatcher = context.dispatcher || createMcpToolDispatcher(boundContext)
	let calls = 0
	return {
		call(name, args) {
			// The RPC admission already paid for its first dispatch. Further calls
			// still go through the engine's independent billing/reservation gates.
			if (calls++ > 0) consumeCallBudget(context)
			return dispatcher.call(name, args, boundContext)
		},
	}
}

function publicDiscoveryIdentity(toolNameProfile) {
	const manifest = publicRuntimeManifest({ toolNameProfile })
	return {
		semanticVersion: manifest.semanticVersion,
		toolSchemaVersion: manifest.toolSchemaVersion,
		buildIdentity: manifest.buildIdentity,
		sourceIdentity: manifest.sourceIdentity,
		capabilityContentDigest: manifest.capabilityContentDigest,
		capabilityControlDigest: manifest.capabilityControlDigest,
		controlRegistryVersion: manifest.controlRegistryVersion,
		authoringLessonCount: manifest.authoringLessonCount,
		capabilityContentDigestCoverage: manifest.capabilityContentDigestCoverage,
		advertisedToolSchemaDigest: manifest.advertisedToolSchemaDigest,
		advertisedToolSchemaDigestCoverage: manifest.advertisedToolSchemaDigestCoverage,
		observedAt: manifest.observedAt,
		cache: manifest.cache,
	}
}

export async function dispatchMcpV2Message(message, context = {}) {
	const serverInfo = mcpV2ServerInfo()
	const metaError = validateV2RequestMeta(context.req, message)
	if (metaError) return { rpc: metaError, notification: false }

	if (message.id === undefined) {
		return { rpc: null, notification: true }
	}

	const method = String(message.method || '')
	const params = message.params && typeof message.params === 'object' ? message.params : {}
	const clientInfo = clientInfoFromMessage(message)
	const capabilities = clientCapabilitiesFromMessage(message)
	const requestId = context.requestId || createTraceId('mcpv2')

	try {
		consumeCallBudget(context)
		if (method === 'server/discover') {
			return {
				rpc: jsonRpcResult(message.id, cacheableCompleteResult({
					supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
					capabilities: mcpV2Capabilities(),
					instructions: mcpV2Instructions(PUBLIC_INSTRUCTIONS),
					publicDiscovery: publicDiscoveryIdentity(context.toolNameProfile),
				}, serverInfo, { ttlMs: 3600000, cacheScope: 'public' })),
				notification: false,
			}
		}

		if (method === 'tools/list') {
			const tools = advertisedPublicTools({ toolNameProfile: context.toolNameProfile }).map(sdkToolFromDef)
			traceToolList({ requestId, transport: 'mcp-v2', tools, manifest: publicRuntimeManifest({ toolNameProfile: context.toolNameProfile }), profile: context.toolNameProfile })
			logEvent('mcp.v2.tools_list', { requestId, toolCount: tools.length, clientInfo })
			return {
				rpc: jsonRpcResult(message.id, cacheableCompleteResult({
					tools,
					publicDiscovery: publicDiscoveryIdentity(context.toolNameProfile),
				}, serverInfo, {
					ttlMs: 300000,
					cacheScope: 'public',
				})),
				notification: false,
			}
		}

		if (method === 'tools/call') {
			const name = params.name
			if (typeof name !== 'string' || !name.trim()) {
				return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'Missing tool name'), notification: false }
			}
			if (params.arguments !== undefined && !isRecord(params.arguments)) {
				return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'Invalid tool arguments'), notification: false }
			}
			const args = params.arguments || {}
			const callStartedAt = Date.now()
			// Reserved engine controls are never public tool arguments. In particular,
			// rehydration controls must not bypass the ordinary authoring validators.
			if (Object.keys(args).some(key => key.startsWith('__'))) {
				return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'Invalid tool arguments'), notification: false }
			}
			const binding = callerBinding(context)
			let state = null
			let elicit = null
			if (Object.hasOwn(params, 'requestState')) {
				try {
					state = decodeRequestState(params.requestState)
					if (!binding || state.callerBinding !== binding || state.purpose !== 'tools/call:upgrade'
						|| state.name !== name || !isRecord(state.arguments) || !isDeepStrictEqual(state.arguments, args)
						|| state.elicited !== true || !['url', 'form'].includes(state.mode)
						|| !isRecord(state.payload) || !upgradeErrorCode(state.payload)) throw new Error('Invalid continuation')
					elicit = upgradeResponse(params.inputResponses, state.mode)
					if (!elicit) throw new Error('Invalid continuation response')
				}
				catch {
					return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'Invalid or expired requestState'), notification: false }
				}
			} else if (Object.hasOwn(params, 'inputResponses')) {
				return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'inputResponses requires requestState'), notification: false }
			}

			const dispatcher = createDispatcher(context, clientInfo)

			if (state) {
				const action = elicit.action
				if (action === 'decline' || action === 'cancel') {
					const payload = state.payload || {
						ok: false,
						error: { code: state.upgradeCode || 'REQUIRES_UPGRADE', message: 'The user declined the premium confirmation.', retryable: false },
					}
					return {
						rpc: jsonRpcResult(message.id, completeResult(asToolResult(payload, false), serverInfo)),
						notification: false,
					}
				}
				const choice = String(elicit?.content?.choice || (state.mode === 'url' ? 'activate' : ''))
				const activationKey = String(elicit?.content?.activationKey || '').trim()
				if (choice === 'activate' && activationKey) {
					const activation = await withStdoutRedirected(() => dispatcher.call('betterpptx.auth.activate_key', { key: activationKey }))
					if (activation?.ok !== true || activation.data?.activated !== true) {
						const failed = activation?.ok === false ? activation : {
							ok: false, error: { code: 'ACTIVATION_FAILED', message: 'Activation did not complete. Retry activation before continuing.' },
						}
						return { rpc: jsonRpcResult(message.id, completeResult(asToolResult(failed, true), serverInfo)), notification: false }
					}
				} else if (choice === 'keep_free') {
					const payload = state.payload || {
						ok: false,
						error: { code: 'REQUIRES_UPGRADE', message: 'The user kept the free-safe result.', retryable: false },
					}
					return {
						rpc: jsonRpcResult(message.id, completeResult(asToolResult(payload, false), serverInfo)),
						notification: false,
					}
				}
			}

			const callName = name
			// Preserve the exact request for continuation binding if a dispatcher
			// normalizes or otherwise mutates its argument object during execution.
			const callArgs = structuredClone(args)
			const visibleResult = await withStdoutRedirected(() => dispatcher.call(callName, callArgs))
			let payload = visibleResult || {
				ok: false,
				error: { code: 'TOOL_ERROR', message: 'The presentation tool returned no result.', retryable: true },
			}
			if (payload?.ok === false && payload.error && typeof payload.error === 'object') {
				payload = { ...payload, error: { ...payload.error, requestId } }
			}
			traceToolCall({ requestId, transport: 'mcp-v2', name: callName, outcome: payload?.ok === false ? 'rejected' : 'ok', errorCode: payload?.ok === false ? payload?.error?.code : null, durationMs: Date.now() - callStartedAt })

			const upgradeCode = upgradeErrorCode(payload)
			const alreadyElicited = Boolean(state?.elicited)
			const canElicit = clientSupportsElicitation(capabilities)
			if (upgradeCode && canElicit && !alreadyElicited && binding) {
				const supportsUrl = clientSupportsElicitation(capabilities, 'url')
				const checkoutUrl = supportsUrl ? checkoutUrlForInstall(context.installHash || '') : ''
				const mode = checkoutUrl ? 'url' : 'form'
				let requestState
				try { requestState = encodeRequestState({
					purpose: 'tools/call:upgrade',
					callerBinding: binding,
					name: callName,
					arguments: args,
					payload,
					upgradeCode,
					elicited: true,
					mode,
				}) } catch { /* Preserve the gated result when safe continuation is unavailable. */ }
				if (requestState && (mode === 'url' || clientSupportsElicitation(capabilities, 'form'))) return {
					rpc: jsonRpcResult(message.id, inputRequiredResult({
						serverInfo,
						requestState,
						inputRequests: {
							upgrade: elicitationInputRequest({
								checkoutUrl: mode === 'url' ? checkoutUrl : '',
								feature: upgradeCode,
							}),
						},
					})),
					notification: false,
				}
			}

			const canonicalCallName = canonicalToolName(callName)
			const toolResult = canonicalCallName === 'betterpptx.auth.get_profile'
				? asExactStructuredToolResult(payload)
				: canonicalCallName === 'betterpptx.operation.read_file'
				? asArtifactReadResult(payload)
				: MONETIZED_MCP_PROTOCOL_TOOLS.has(canonicalCallName)
				? asProtocolToolResult(payload)
				: asToolResult(payload, false)
			logEvent('mcp.v2.tools_call', { requestId, name: callName, clientInfo })
			return {
				rpc: jsonRpcResult(message.id, completeResult(withSavedPresentationResourceLink(toolResult, payload), serverInfo)),
				notification: false,
			}
		}

		if (method === 'resources/list') {
			return {
				rpc: jsonRpcResult(message.id, cacheableCompleteResult({
					resources: publicResourceCatalog(),
				}, serverInfo, { ttlMs: 300000, cacheScope: 'public' })),
				notification: false,
			}
		}

		if (method === 'resources/templates/list') {
			return {
				rpc: jsonRpcResult(message.id, cacheableCompleteResult({
					resourceTemplates: [],
				}, serverInfo, { ttlMs: 3600000, cacheScope: 'public' })),
				notification: false,
			}
		}

		if (method === 'resources/read') {
			const uri = String(params.uri || '')
			const resource = publicResourceCatalog().find(item => item.uri === uri)
			if (!resource) {
				return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'Unknown resource'), notification: false }
			}
			const dispatcher = createDispatcher(context, clientInfo)
			let text
			let blob
			if (uri === 'betterpptx://protocol') {
				text = JSON.stringify({
					latest: MCP_V2_PROTOCOL_VERSION,
					supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
					discoveryMethod: 'server/discover',
					statelessCore: true,
					multiRoundTrip: true,
				}, null, 2)
			} else if (uri === 'betterpptx://status') {
				const status = await withStdoutRedirected(() => dispatcher.call('betterpptx.status', {}))
				text = JSON.stringify(status?.ok === true ? status.data : { ...runtimeStatusResource(), ok: status?.ok !== false }, null, 2)
			} else if (uri === 'betterpptx://capabilities') {
				const capabilitiesResult = await withStdoutRedirected(() => dispatcher.call('betterpptx.help.capabilities', { detail: 'summary' }))
				text = JSON.stringify(capabilitiesResult?.ok === true ? capabilitiesResult.data : capabilitiesResult, null, 2)
			} else if (uri === 'betterpptx://auth') {
				const auth = await withStdoutRedirected(() => dispatcher.call('betterpptx.auth.status', {}))
				text = JSON.stringify(auth?.ok === true ? auth.data : auth, null, 2)
			} else if (uri.startsWith('betterpptx://gallery/')) {
				const gallery = await readPublicGalleryResource(uri)
				if (!gallery) return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'Unknown gallery resource'), notification: false }
				text = gallery.text
				blob = gallery.blob
			}
			return {
				rpc: jsonRpcResult(message.id, cacheableCompleteResult({
					contents: [{ uri, mimeType: resource.mimeType, ...(blob ? { blob } : { text }) }],
				}, serverInfo, { ttlMs: uri === 'betterpptx://protocol' ? 60000 : 0, cacheScope: uri === 'betterpptx://protocol' ? 'public' : 'private' })),
				notification: false,
			}
		}

		if (method === 'prompts/list') {
			return {
				rpc: jsonRpcResult(message.id, cacheableCompleteResult({
					prompts: publicPromptCatalog(),
				}, serverInfo, { ttlMs: 3600000, cacheScope: 'public' })),
				notification: false,
			}
		}

		if (method === 'prompts/get') {
			const name = String(params.name || '')
			const prompt = getPublicPrompt(name, params.arguments && typeof params.arguments === 'object' ? params.arguments : {})
			if (!prompt) {
				return { rpc: jsonRpcError(message.id, MCP_JSONRPC_INVALID_PARAMS, 'Unknown prompt'), notification: false }
			}
			return {
				rpc: jsonRpcResult(message.id, completeResult(prompt, serverInfo)),
				notification: false,
			}
		}

		if (method === 'initialize') {
			return {
				rpc: jsonRpcError(message.id, MCP_JSONRPC_METHOD_NOT_FOUND, 'initialize is not used in MCP 2026-07-28; call server/discover', {
					supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
					discoveryMethod: 'server/discover',
				}),
				notification: false,
			}
		}

		return {
			rpc: jsonRpcError(message.id, MCP_JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`),
			notification: false,
		}
	} catch (error) {
		if (error instanceof CallRateLimitError) {
			return { rpc: jsonRpcError(message.id, MCP_RATE_LIMITED, error.message, { retryAfterMs: error.retryAfterMs }), notification: false }
		}
		// Provider exceptions may contain activation credentials or private details.
		logEvent('mcp.v2.error', { requestId, method, error: 'Internal error' })
		return {
			rpc: jsonRpcError(message.id ?? null, MCP_JSONRPC_INTERNAL_ERROR, 'Internal error'),
			notification: false,
		}
	}
}

function wantsEventStream(req) {
	const accept = String(req.headers.accept || '')
	return accept.includes('text/event-stream') && !accept.includes('application/json')
}

function sendJsonRpcHttp(res, payload, { eventStream = false, protocolVersion = MCP_V2_PROTOCOL_VERSION } = {}) {
	res.setHeader('MCP-Protocol-Version', protocolVersion)
	res.setHeader('Cache-Control', 'no-store')
	if (eventStream) {
		res.status(200)
		res.setHeader('Content-Type', 'text/event-stream')
		res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`)
		res.end()
		return
	}
	const code = payload?.error?.code
	const status = payload?.error ? httpStatusForRpcError(code) : 200
	res.status(status).json(payload)
}

export async function handleMcpV2Post(req, res, context = {}) {
	// Check the raw array before normalization, filtering, or executing any member.
	if (Array.isArray(req.body) && req.body.length > MCP_V2_MAX_BATCH_SIZE) {
		return sendJsonRpcHttp(res, jsonRpcError(null, MCP_JSONRPC_INVALID_REQUEST, 'Request batch is too large', { maxBatchSize: MCP_V2_MAX_BATCH_SIZE }))
	}
	const messages = jsonRpcMessages(req.body)
	if (!messages.length) {
		return sendJsonRpcHttp(res, jsonRpcError(null, MCP_JSONRPC_INVALID_REQUEST, 'Invalid Request'))
	}

	const results = []
	let sawNotification = false
	let sawRequest = false
	for (const message of messages) {
		const dispatched = await dispatchMcpV2Message(message, {
			...context,
			req,
			requestId: context.requestId || createTraceId('mcpv2'),
		})
		if (dispatched.notification) {
			sawNotification = true
			continue
		}
		sawRequest = true
		results.push(dispatched.rpc)
	}

	if (!sawRequest && sawNotification) {
		res.setHeader('MCP-Protocol-Version', MCP_V2_PROTOCOL_VERSION)
		res.setHeader('Cache-Control', 'no-store')
		return res.status(204).end()
	}

	const payload = Array.isArray(req.body) ? results : results[0]
	return sendJsonRpcHttp(res, payload, { eventStream: wantsEventStream(req) })
}

export function mcpV2HandshakePayload({ mcpPath = '/mcp' } = {}) {
	return {
		status: 'ok',
		transport: 'streamable-http',
		protocol: {
			latest: MCP_V2_PROTOCOL_VERSION,
			supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
			statelessCore: true,
			multiRoundTrip: true,
		},
		methods: ['POST', 'GET', 'DELETE'],
		discovery: 'server/discover',
		endpoint: mcpPath,
		docs: 'https://modelcontextprotocol.io/specification/2026-07-28/basic',
	}
}
