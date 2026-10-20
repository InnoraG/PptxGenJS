import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, createHmac } from 'node:crypto'

import {
	MCP_HEADER_MISMATCH,
	MCP_JSONRPC_INVALID_PARAMS,
	MCP_JSONRPC_METHOD_NOT_FOUND,
	MCP_UNSUPPORTED_PROTOCOL_VERSION,
	MCP_V2_PROTOCOL_VERSION,
	decodeRequestState,
	encodeRequestState,
	isMcpV2Request,
	upgradeErrorCode,
} from '../mcp-v2/protocol.mjs'
import { dispatchMcpV2Message } from '../mcp-v2/handler.mjs'
import { getPublicPrompt, publicPromptCatalog, publicResourceCatalog } from '../mcp-v2/catalog.mjs'
import { oauthAuthorizationServerCompatibilityPaths, oauthAuthorizationServerMetadata, oauthAuthorizationServerMetadataPath, oauthProtectedResourceMetadata } from '../mcp-v2/oauth.mjs'

const V2_META = {
	'io.modelcontextprotocol/protocolVersion': MCP_V2_PROTOCOL_VERSION,
	'io.modelcontextprotocol/clientInfo': { name: 'mcp-v2-test', version: '1' },
	'io.modelcontextprotocol/clientCapabilities': { elicitation: { form: {}, url: {} } },
}
const V2_TEST_INSTALL_HASH = `install_${'v'.repeat(64)}`
const V2_TEST_STATE_SECRET = 'betterpptx-mcp-v2-dev-state-000000000000000000000000'
process.env.BETTERPPTX_MCP_V2_STATE_SECRET = V2_TEST_STATE_SECRET
const V2_TEST_CALLER_BINDING = createHash('sha256').update(`mcp-v2-caller\0${V2_TEST_INSTALL_HASH}`).digest('base64url')

function v2Req(headerVersion = MCP_V2_PROTOCOL_VERSION) {
	return { headers: { 'mcp-protocol-version': headerVersion } }
}

test('detects MCP 2.0 discover and per-request metadata', () => {
	assert.equal(isMcpV2Request(v2Req(), { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: V2_META } }), true)
	assert.equal(isMcpV2Request({ headers: {} }, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }), false)
	assert.equal(upgradeErrorCode({ error: { code: 'REQUIRES_UPGRADE' } }), 'REQUIRES_UPGRADE')
})
test('server/discover returns supported versions, capabilities, and resultType', async () => {
	const { rpc } = await dispatchMcpV2Message({
		jsonrpc: '2.0',
		id: 1,
		method: 'server/discover',
		params: { _meta: V2_META },
	}, { req: v2Req() })
	assert.equal(rpc.result.resultType, 'complete')
	assert.ok(rpc.result.supportedVersions.includes(MCP_V2_PROTOCOL_VERSION))
	assert.ok(rpc.result.supportedVersions.includes('2025-06-18'))
	assert.ok(rpc.result.capabilities.tools)
	assert.ok(rpc.result.capabilities.prompts)
	assert.ok(rpc.result.capabilities.resources)
	assert.equal(rpc.result._meta['io.modelcontextprotocol/serverInfo'].name, 'betterpptx')
	assert.match(String(rpc.result.instructions || ''), /generate_from_spec/)
})

test('missing _meta protocol version is invalid params', async () => {
	const { rpc } = await dispatchMcpV2Message({
		jsonrpc: '2.0',
		id: 2,
		method: 'server/discover',
		params: { _meta: { 'io.modelcontextprotocol/clientCapabilities': {} } },
	}, { req: v2Req('') })
	assert.equal(rpc.error.code, MCP_JSONRPC_INVALID_PARAMS)
})

test('header mismatch and unsupported version use reserved MCP error codes', async () => {
	const mismatch = await dispatchMcpV2Message({
		jsonrpc: '2.0',
		id: 3,
		method: 'server/discover',
		params: { _meta: V2_META },
	}, { req: v2Req('2025-06-18') })
	assert.equal(mismatch.rpc.error.code, MCP_HEADER_MISMATCH)

	const unsupported = await dispatchMcpV2Message({
		jsonrpc: '2.0',
		id: 4,
		method: 'server/discover',
		params: { _meta: { ...V2_META, 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } },
	}, { req: v2Req('2099-01-01') })
	assert.equal(unsupported.rpc.error.code, MCP_UNSUPPORTED_PROTOCOL_VERSION)
	assert.ok(unsupported.rpc.error.data.supported.includes(MCP_V2_PROTOCOL_VERSION))
})

test('initialize is rejected on the 2026-07-28 path with discover guidance', async () => {
	const { rpc } = await dispatchMcpV2Message({
		jsonrpc: '2.0',
		id: 5,
		method: 'initialize',
		params: { _meta: V2_META },
	}, { req: v2Req() })
	assert.equal(rpc.error.code, MCP_JSONRPC_METHOD_NOT_FOUND)
	assert.match(rpc.error.message, /server\/discover/)
})

test('prompts and resources stay public and black-box', () => {
	const prompts = publicPromptCatalog()
	const resources = publicResourceCatalog()
	assert.ok(prompts.some(item => item.name === 'authoring-excellence'))
	assert.ok(resources.every(item => String(item.uri).startsWith('betterpptx://')))
	const prompt = getPublicPrompt('authoring-excellence', { intent: 'Investor update' })
	assert.match(prompt.messages[0].content.text, /generate_from_spec/)
	assert.doesNotMatch(JSON.stringify({ prompts, resources, prompt }), /PptxGenJS|src\\|node_modules|piper/i)
})

test('OAuth protected-resource metadata advertises fine-grained tool scopes without requiring an issuer', () => {
	const metadata = oauthProtectedResourceMetadata({
		publicBase: 'https://example.invalid',
		mcpPath: '/mcp',
		authMode: 'none',
	})
	assert.equal(metadata.resource, 'https://example.invalid/mcp')
	assert.ok(metadata.scopes_supported.includes('tools:betterpptx.deck.generate_from_spec'))
	assert.ok(metadata.mcp_protocol_versions_supported.includes(MCP_V2_PROTOCOL_VERSION))
	assert.equal(metadata.authorization_servers, undefined)
})

test('REQUIRES_UPGRADE becomes a retryable elicitation instead of a dead-end tool result', async () => {
	const { rpc } = await dispatchMcpV2Message({
		jsonrpc: '2.0',
		id: 6,
		method: 'tools/call',
		params: {
			name: 'betterpptx.deck.generate_from_spec',
			arguments: { dryRun: false },
			_meta: V2_META,
		},
	}, {
		req: v2Req(),
		installHash: V2_TEST_INSTALL_HASH,
		dispatcher: {
			async call() {
				return { ok: false, error: { code: 'REQUIRES_UPGRADE', message: 'Premium is required from slide 3.' } }
			},
		},
	})
	assert.equal(rpc.result.resultType, 'input_required')
	assert.ok(rpc.result.requestState)
	assert.equal(rpc.result.inputRequests.upgrade.method, 'elicitation/create')
	assert.equal(rpc.result.inputRequests.upgrade.params.mode, 'url')
})

test('elicitation retry with keep_free returns the original upgrade payload as a complete result', async () => {
	const requestState = encodeRequestState({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { dryRun: false },
		payload: { ok: false, error: { code: 'REQUIRES_UPGRADE', message: 'Premium is required from slide 3.' } },
		upgradeCode: 'REQUIRES_UPGRADE',
		purpose: 'tools/call:upgrade',
		elicited: true,
		mode: 'form',
		callerBinding: V2_TEST_CALLER_BINDING,
	}, V2_TEST_STATE_SECRET)
	const { rpc } = await dispatchMcpV2Message({
		jsonrpc: '2.0',
		id: 7,
		method: 'tools/call',
		params: {
			name: 'betterpptx.deck.generate_from_spec',
			arguments: { dryRun: false },
			requestState,
			inputResponses: { upgrade: { action: 'accept', content: { choice: 'keep_free' } } },
			_meta: V2_META,
		},
	}, {
		req: v2Req(),
		installHash: V2_TEST_INSTALL_HASH,
		dispatcher: { async call() { throw new Error('should not re-dispatch') } },
	})
	assert.equal(rpc.result.resultType, 'complete')
	assert.match(rpc.result.content[0].text, /REQUIRES_UPGRADE/)
})

test('HMAC requestState rejects a forged token', () => {
	const json = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + 60000, name: 'x' }), 'utf8').toString('base64url')
	const sig = createHmac('sha256', 'wrong-secret').update(json).digest('base64url')
	assert.throws(() => decodeRequestState(`${json}.${sig}`, 'betterpptx-mcp-v2-dev-state'))
})

function sseOrJson(raw, contentType) {
	if (String(contentType || '').includes('event-stream')) {
		for (const line of String(raw || '').split(/\r?\n/)) {
			const match = /^data:\s*(.+)$/.exec(line)
			if (match) return JSON.parse(match[1])
		}
		return null
	}
	return raw ? JSON.parse(raw) : null
}

test('HTTP dual-stack keeps legacy sessions and serves MCP 2.0 without a session', async t => {
	process.env.BETTERPPTX_AUTH = 'none'
	delete process.env.BETTERPPTX_SELF_HOSTED_IDENTITY
	delete process.env.BETTERPPTX_OAUTH_ISSUER
	delete process.env.BETTERPPTX_OAUTH_AUDIENCE
	delete process.env.BETTERPPTX_OAUTH_JWKS_URL
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	process.env.BETTERPPTX_HTTP_STATELESS_MCP = '0'
	delete process.env.BETTERPPTX_MCP_TRANSPORT_MODE
	const { startBetterPptxHttp } = await import('../server-http.mjs')
	const started = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, open: true })
	t.after(() => new Promise(resolve => started.httpServer.close(resolve)))
	const port = started.httpServer.address().port
	const mcpUrl = `http://127.0.0.1:${port}${started.mcpPath}`

	const health = await fetch(`http://127.0.0.1:${port}/health`)
	assert.equal(health.status, 200)
	const healthBody = await health.json()
	assert.equal(healthBody.mcpProtocol.latest, MCP_V2_PROTOCOL_VERSION)

	const wellKnown = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`)
	assert.equal(wellKnown.status, 200)
	const wellKnownBody = await wellKnown.json()
	assert.ok(wellKnownBody.scopes_supported.includes('betterpptx'))

	const v2Headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		'MCP-Protocol-Version': MCP_V2_PROTOCOL_VERSION,
	}
	const discover = await fetch(mcpUrl, {
		method: 'POST',
		headers: v2Headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'server/discover',
			params: { _meta: V2_META },
		}),
	})
	assert.equal(discover.status, 200)
	assert.equal(discover.headers.get('mcp-session-id'), null)
	const discoverBody = sseOrJson(await discover.text(), discover.headers.get('content-type'))
	assert.equal(discoverBody.result.resultType, 'complete')
	assert.ok(discoverBody.result.supportedVersions.includes(MCP_V2_PROTOCOL_VERSION))

	const list = await fetch(mcpUrl, {
		method: 'POST',
		headers: v2Headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/list',
			params: { _meta: V2_META },
		}),
	})
	const listBody = sseOrJson(await list.text(), list.headers.get('content-type'))
	const names = (listBody.result.tools || []).map(tool => tool.name)
	assert.ok(names.includes('betterpptx.deck.generate_from_spec'))
	assert.ok(!names.includes('betterpptx.slide.add_text'))

	const call = await fetch(mcpUrl, {
		method: 'POST',
		headers: v2Headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'betterpptx.auth.status', arguments: {}, _meta: V2_META },
		}),
	})
	const callBody = sseOrJson(await call.text(), call.headers.get('content-type'))
	assert.equal(callBody.result.resultType, 'complete')
	assert.equal(call.headers.get('mcp-session-id'), null)

	const prompts = await fetch(mcpUrl, {
		method: 'POST',
		headers: v2Headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 4,
			method: 'prompts/list',
			params: { _meta: V2_META },
		}),
	})
	const promptsBody = sseOrJson(await prompts.text(), prompts.headers.get('content-type'))
	assert.ok((promptsBody.result.prompts || []).some(item => item.name === 'authoring-excellence'))

	const legacyHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
	const init = await fetch(mcpUrl, {
		method: 'POST',
		headers: legacyHeaders,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 10,
			method: 'initialize',
			params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'legacy-host', version: '1' } },
		}),
	})
	assert.equal(init.status, 200)
	const sid = init.headers.get('mcp-session-id')
	assert.ok(sid)
	const initBody = sseOrJson(await init.text(), init.headers.get('content-type'))
	assert.ok(initBody.result.serverInfo?.name)

	const legacyList = await fetch(mcpUrl, {
		method: 'POST',
		headers: { ...legacyHeaders, 'mcp-session-id': sid },
		body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/list', params: {} }),
	})
	assert.equal(legacyList.status, 200)
	const legacyListBody = sseOrJson(await legacyList.text(), legacyList.headers.get('content-type'))
	assert.ok((legacyListBody.result.tools || []).some(tool => tool.name === 'betterpptx.deck.generate_from_spec'))
})

test('owner-scoped saved-file result uses one embedded resource or one bounded text chunk', async () => {
	const operationId = `op_${'a'.repeat(32)}`
	for (const mode of ['resource', 'chunk']) {
		const { rpc } = await dispatchMcpV2Message({
			jsonrpc: '2.0', id: 60, method: 'tools/call',
			params: { name: 'betterpptx.operation.read_file', arguments: { operationId, mode }, _meta: V2_META },
		}, {
			req: v2Req(), installHash: V2_TEST_INSTALL_HASH,
			dispatcher: { async call() { return { ok: true, data: {
				operationId, mode, fileName: 'deck.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
				totalBytes: 4, bytesReturned: 4, offset: 0, nextOffset: null,
				packageSha256: createHash('sha256').update('test').digest('hex'), encoding: 'base64', dataBase64: Buffer.from('test').toString('base64'),
			} } } },
		})
		assert.equal(rpc.result.resultType, 'complete')
		const result = rpc.result
		if (mode === 'resource') {
			assert.equal(result.structuredContent.data.dataBase64, undefined)
			assert.equal(result.content[1].type, 'resource')
			assert.equal(result.content[1].resource.blob, Buffer.from('test').toString('base64'))
		} else {
			assert.equal(result.structuredContent.data.dataBase64, Buffer.from('test').toString('base64'))
			assert.equal(result.content.length, 1)
			assert.doesNotMatch(result.content[0].text, /dataBase64/)
		}
	}
})

test('a large saved file is returned as one resource without duplicating bytes in model context', async () => {
	const bytes = Buffer.alloc(17_215_011, 0x5a)
	const base64 = bytes.toString('base64')
	const operationId = `op_${'b'.repeat(32)}`
	const { rpc } = await dispatchMcpV2Message({
		jsonrpc: '2.0', id: 61, method: 'tools/call',
		params: { name: 'betterpptx.operation.read_file', arguments: { operationId, mode: 'resource' }, _meta: V2_META },
	}, {
		req: v2Req(), installHash: V2_TEST_INSTALL_HASH,
		dispatcher: { async call() { return { ok: true, data: {
			operationId, mode: 'resource', fileName: 'narrated.pptx',
			mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			totalBytes: bytes.length, bytesReturned: bytes.length, offset: 0, nextOffset: null,
			packageSha256: createHash('sha256').update(bytes).digest('hex'), encoding: 'base64', dataBase64: base64,
		} } } },
	})
	assert.equal(rpc.result.resultType, 'complete')
	assert.equal(rpc.result.structuredContent.data.dataBase64, undefined)
	assert.equal(rpc.result.content.length, 2)
	assert.equal(rpc.result.content[1].type, 'resource')
	assert.equal(rpc.result.content[1].resource.blob.length, base64.length)
	assert.doesNotMatch(rpc.result.content[0].text, /dataBase64/)
})

test('self-hosted OAuth metadata advertises zero-touch CIMD and issuer-derived discovery', () => {
	const original = {
		issuer: process.env.BETTERPPTX_OAUTH_ISSUER,
		profile: process.env.BETTERPPTX_OAUTH_TOKEN_PROFILE,
	}
	process.env.BETTERPPTX_OAUTH_ISSUER = 'https://betterpptx.example.test/identity/realms/betterpptx'
	process.env.BETTERPPTX_OAUTH_TOKEN_PROFILE = 'keycloak'
	try {
		const metadata = oauthAuthorizationServerMetadata()
		assert.equal(metadata.client_id_metadata_document_supported, true)
		assert.equal(metadata.authorization_response_iss_parameter_supported, true)
		// Claude selects CIMD only when "none" (public client) is also advertised.
		assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['private_key_jwt', 'none'])
		assert.deepEqual(oauthAuthorizationServerMetadata({ profile: 'openai' }).token_endpoint_auth_methods_supported, ['private_key_jwt'])
		assert.deepEqual(metadata.token_endpoint_auth_signing_alg_values_supported, ['RS256'])
		assert.ok(metadata.code_challenge_methods_supported.includes('S256'))
		assert.deepEqual(metadata.scopes_supported, ['openid', 'betterpptx'])
		assert.equal(metadata.userinfo_endpoint, 'https://betterpptx.example.test/identity/realms/betterpptx/protocol/openid-connect/userinfo')
		assert.equal(metadata.jwks_uri, 'https://betterpptx.example.test/identity/realms/betterpptx/protocol/openid-connect/certs')
		assert.equal(oauthAuthorizationServerMetadataPath(), '/.well-known/oauth-authorization-server/identity/realms/betterpptx')
		assert.deepEqual(oauthAuthorizationServerCompatibilityPaths(), [
			'/.well-known/oauth-authorization-server',
			'/.well-known/oauth-authorization-server/identity/realms/betterpptx',
			'/.well-known/openid-configuration',
			'/.well-known/openid-configuration/identity/realms/betterpptx',
			'/identity/realms/betterpptx/.well-known/oauth-authorization-server',
		])
	} finally {
		if (original.issuer === undefined) delete process.env.BETTERPPTX_OAUTH_ISSUER
		else process.env.BETTERPPTX_OAUTH_ISSUER = original.issuer
		if (original.profile === undefined) delete process.env.BETTERPPTX_OAUTH_TOKEN_PROFILE
		else process.env.BETTERPPTX_OAUTH_TOKEN_PROFILE = original.profile
	}
})
