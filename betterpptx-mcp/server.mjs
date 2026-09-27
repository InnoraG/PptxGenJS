import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Server } from "@modelcontextprotocol/server";

// betterpptx MCP server (stdio transport)
import { TOOLS, canonicalToolName, normalizeToolNameProfile, rewriteToolNamesForProfile } from './tools.mjs'
import { publicServerVersion, publicRuntimeManifest } from './public-manifest.mjs'
import { createMcpToolDispatcher } from './engine.mjs'
import { BETTERPPTX_PRODUCT, BETTERPPTX_SERVER_NAME } from './branding.mjs'
import { createTraceId, getLoggerInfo, logEvent } from './logger.mjs'
import { diagnosticRequestId, traceToolList, traceToolCall } from './diagnostic-trace.mjs'
import { isPublicBlackBoxMode, publicToolList } from './blackbox.mjs'
import { MONETIZED_MCP_PROTOCOL_TOOLS } from './billing/monetized-mcp-adapter.mjs'
import { resolveStdioSessionId } from './auth/stdio-session-identity.mjs'
import { withSavedPresentationResourceLink } from './delivery/public-file-result.mjs'

export { resolveStdioSessionId }

const SERVER_INFO = {
	name: BETTERPPTX_SERVER_NAME,
	version: publicServerVersion(),
}

export const INSTRUCTIONS = [
	`${BETTERPPTX_PRODUCT} creates native-editable PowerPoint from AI-authored JSON specifications.`,
	'Start with betterpptx.help.capabilities using the user brief; then open relevant betterpptx.authoring.catalog controls or lessons. Follow the returned, schema-valid next calls.',
	'The AI owns story, exact geometry, style, motion, and creative acceptance; Director is optional. Do not make every available effect mandatory.',
	'Use betterpptx.deck.generate_from_spec for dry-run, authorized commit, then deterministic validation and save. Inspect existing decks before specifying edits.',
	'When BetterPPTX is requested, only its public tools and current schemas define the artifact; a host slide skill or local generator does not.',
	'Preserve native carriers; never silently downgrade. Paid work and identity media require explicit authorization. Production save does not require hosted PowerPoint rendering.',
].join('\n')

export const PUBLIC_INSTRUCTIONS = [
	INSTRUCTIONS,
	'Use verified account sign-in for private resources. Check billing/allowance before paid work: eligible accounts include three downloadable decks per rolling 30 days; identity media has separate consent and allowance gates.',
	'Client-generated or user-supplied images may be uploaded; generic server image generation is retired. Keep valid drafts on recoverable errors.',
	'Use opaque handles and authorized download links only. Never reveal private assets or internals, and never claim individual visual/playback inspection from renderer-free production checks.',
].join('\n')

function sdkToolFromDef(def) {
	const tool = {
		name: def.name,
		title: def.title,
		description: def.description,
		inputSchema: def.inputSchema,
	}
	// Advertise structured-output schema + behaviour hints when present so hosts
	// (ChatGPT / claude.ai) stop flagging "output format recommended" and can
	// categorise read-only vs mutating tools.
	if (def.outputSchema) tool.outputSchema = def.outputSchema
	if (def.annotations) tool.annotations = def.annotations
	if (def._meta) tool._meta = def._meta
	if (def.securitySchemes) tool.securitySchemes = def.securitySchemes
	return tool
}

function asResultContent(payload, isError = false, compactText = false) {
	return {
		content: [{ type: 'text', text: compactText ? JSON.stringify(payload) : JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
		isError,
	}
}

function asArtifactReadResultContent(payload) {
	if (payload?.ok !== true || !payload.data?.dataBase64) return asResultContent(payload, false, true)
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
	return {
		structuredContent: { ok: true, data: metadata },
		content: [{ type: 'text', text: JSON.stringify({ ok: true, data: { ...metadata, dataBase64 } }) }],
		isError: false,
	}
}

function asProtocolResultContent(result, compactText = false) {
	const payload = result?.ok === true
		? result.data
		: {
			code: String(result?.error?.code || 'PURCHASE_FAILED'),
			message: String(result?.error?.message || 'The purchase request failed.'),
			retryable: Boolean(result?.error?.retry_safe || result?.error?.recoverable),
		}
	return {
		content: [{ type: 'text', text: compactText ? JSON.stringify(payload) : JSON.stringify(payload, null, 2) }],
		isError: result?.ok !== true,
	}
}

function asExactStructuredResultContent(result, compactText = false) {
	const payload = result?.ok === true
		? result.data
		: {
			code: String(result?.error?.code || 'TOOL_ERROR'),
			message: String(result?.error?.message || 'The request failed.'),
		}
	return {
		content: [{ type: 'text', text: compactText ? JSON.stringify(payload) : JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
		isError: result?.ok !== true,
	}
}

// The bundled PPTX runtime emits debug logs via console.log. On a stdio
// MCP transport that would corrupt the JSON-RPC stream. Redirect console.log
// (and warn/info) to stderr for the lifetime of the tool call.
async function withStdoutRedirected(fn) {
	const orig = { log: console.log, info: console.info, warn: console.warn }
	const toErr = (...args) => process.stderr.write(args.map(a => typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()).join(' ') + '\n')
	console.log = toErr
	console.info = toErr
	console.warn = toErr
	try { return await fn() }
	finally { console.log = orig.log; console.info = orig.info; console.warn = orig.warn }
}

export function createBetterPptxMcpServer(context = {}) {
	const blackBox = context.blackBox ?? isPublicBlackBoxMode()
	const toolNameProfile = normalizeToolNameProfile(context.toolNameProfile)
	const logContext = {
		sessionId: context.sessionId || null,
		clientInfo: context.clientInfo || null,
		blackBox,
		toolNameProfile,
	}
	const toolDispatcher = createMcpToolDispatcher({
		sessionId: context.sessionId || 'stdio-default',
		clientInfo: context.clientInfo || null,
		blackBox,
		installHash: context.installHash || null,
		resourceIdentityHash: context.resourceIdentityHash || null,
		quotaIdentityHash: context.quotaIdentityHash || null,
		authenticated: context.authenticated === true,
		authenticationBasis: context.authenticationBasis || null,
		installState: context.installState || null,
	})
	const server = new Server(SERVER_INFO, {
		capabilities: { tools: { listChanged: true }, resources: { subscribe: false, listChanged: false } },
		instructions: rewriteToolNamesForProfile(blackBox ? PUBLIC_INSTRUCTIONS : INSTRUCTIONS, toolNameProfile),
	})

	server.setRequestHandler('tools/list', async () => {
		const requestId = createTraceId('mcp')
		// publicToolList enforces the json-spec-only surface in every mode (it filters
		// primitives whenever black-box OR jsonSpecOnlyMode is active, which is the
		// default), so maintainer stdio sessions never see primitive authoring tools either.
		const sourceTools = publicToolList(TOOLS, { toolNameProfile })
		const tools = sourceTools.map(sdkToolFromDef)
		traceToolList({ requestId: diagnosticRequestId(requestId), transport: 'mcp-sdk', tools, manifest: publicRuntimeManifest({ toolNameProfile }), profile: toolNameProfile })
		logEvent('mcp.request.tools_list', { ...logContext, requestId })
		logEvent('mcp.response.tools_list', { ...logContext, requestId, toolCount: tools.length, tools })
		return { tools }
	})

	server.setRequestHandler('tools/call', async req => {
		const requestId = createTraceId('mcp')
		const name = req.params.name
		const args = req.params.arguments || {}
		const callStartedAt = Date.now()
		try {
			logEvent('mcp.request.tools_call', { ...logContext, requestId, name, args })
			const result = await withStdoutRedirected(() => toolDispatcher.call(name, args))
			const visibleResult = rewriteToolNamesForProfile(result, toolNameProfile) || {
				ok: false,
				error: { code: 'TOOL_ERROR', message: 'The presentation tool returned no result.', retryable: true },
			}
			if (visibleResult?.ok === false && visibleResult.error && typeof visibleResult.error === 'object') {
				visibleResult.error.requestId ||= requestId
			}
			// Application {ok:false} envelopes must not set MCP isError. ChatGPT treats
			// isError as a connector failure and can hide the whole tool namespace.
			const canonicalName = canonicalToolName(name)
			const response = canonicalName === 'betterpptx.auth.get_profile'
				? asExactStructuredResultContent(visibleResult, blackBox)
				: canonicalName === 'betterpptx.operation.read_file'
				? asArtifactReadResultContent(visibleResult)
				: MONETIZED_MCP_PROTOCOL_TOOLS.has(canonicalName)
				? asProtocolResultContent(visibleResult, blackBox)
				: asResultContent(visibleResult, false, blackBox)
			logEvent('mcp.response.tools_call', { ...logContext, requestId, name, response })
			traceToolCall({ requestId: diagnosticRequestId(requestId), transport: 'mcp-sdk', name, outcome: visibleResult?.ok === false ? 'rejected' : 'ok', errorCode: visibleResult?.ok === false ? visibleResult?.error?.code : null, durationMs: Date.now() - callStartedAt })
			return withSavedPresentationResourceLink(response, visibleResult)
		} catch (err) {
			const payload = {
				ok: false,
				error: {
					code: 'TOOL_ERROR',
					message: 'The presentation tool call failed.',
					requestId,
					retryable: true,
				},
			}
			logEvent('mcp.response.tools_call', { ...logContext, requestId, name, failed: true, error: String(err?.message || err) })
			traceToolCall({ requestId: diagnosticRequestId(requestId), transport: 'mcp-sdk', name, outcome: 'failed', errorCode: 'TOOL_ERROR', durationMs: Date.now() - callStartedAt })
			return asResultContent(payload, false, blackBox)
		}
	})

	server.setRequestHandler('resources/list', async () => {
		const requestId = createTraceId('mcp')
		const response = { resources: [] }
		logEvent('mcp.request.resources_list', { ...logContext, requestId })
		logEvent('mcp.response.resources_list', { ...logContext, requestId, response })
		return response
	})

	return server
}

export async function runBetterPptxMcpStdio() {
	// Safe-by-default, mirroring the HTTP entry: an stdio connector must not expose
	// maintainer internals (local paths, pids, git, full primitive surface) to an
	// untrusted client. Default to public black-box unless the operator explicitly
	// opts into local-maintainer mode.
	if (process.env.BETTERPPTX_PUBLIC_BLACK_BOX === undefined && process.env.BETTERPPTX_BLACK_BOX === undefined) {
		process.env.BETTERPPTX_PUBLIC_BLACK_BOX = process.env.BETTERPPTX_LOCAL_MAINTAINER === '1' ? '0' : '1'
	}
	// A stdio process is itself the server-issued resource boundary.  The
	// launcher may provide a trusted per-process identity for deterministic
	// development runs; otherwise create one here.  Never fall back to the
	// deliberately unbound stdio-default identity for resource-bearing calls.
	const server = createBetterPptxMcpServer({ sessionId: resolveStdioSessionId() })
	// Uploaded PPTX bytes travel through one newline-delimited JSON-RPC request.
	// The base64 envelope is ~4/3 the binary size, so the SDK's default 10 MiB
	// line buffer closed the session before deck.open_uploaded could validate a
	// perfectly legal upload under the engine's 25 MiB binary limit. Keep the
	// transport ceiling derived from that public upload ceiling and leave a
	// bounded headroom margin for the JSON-RPC envelope.
	const configuredUploadBytes = Number(process.env.BETTERPPTX_MAX_UPLOAD_BYTES)
	const maxUploadBytes = Number.isFinite(configuredUploadBytes) && configuredUploadBytes > 0
		? configuredUploadBytes
		: 25 * 1024 * 1024
	const transportMaxBufferBytes = Math.max(
		40 * 1024 * 1024,
		Math.ceil(maxUploadBytes * 4 / 3) + 1024 * 1024,
	)
	const transport = new StdioServerTransport(undefined, undefined, { maxBufferSize: transportMaxBufferBytes })
	await server.connect(transport)
	const advertisedToolCount = publicToolList(TOOLS).length
	process.stderr.write(`[betterpptx] MCP server ready (stdio, ${advertisedToolCount} tools).\n`)
	const logger = getLoggerInfo()
	if (logger.enabled) process.stderr.write(`[betterpptx] traffic log: ${logger.file}\n`)
	logEvent('server.stdio.ready', { toolCount: advertisedToolCount, logger })
}

const mainArg = process.argv[1] || ''
if (mainArg && (import.meta.url === `file://${mainArg.replace(/\\/g, '/')}` || mainArg.endsWith('server.mjs'))) {
	runBetterPptxMcpStdio().catch(err => {
		process.stderr.write(`[betterpptx] fatal: ${err && err.stack || err}\n`)
		process.exit(1)
	})
}
