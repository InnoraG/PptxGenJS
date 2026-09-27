import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { mock, test } from 'node:test'

// Run with: node --experimental-test-module-mocks --test betterpptx-mcp/test/mcp-v2-security.test.mjs
// Only the protocol and handler under test execute. No engine, billing store,
// credentials, live activation, providers, or network services are used.
const TEST_SECRET = 'mcp-v2-security-fixture-private-key-32-bytes'
process.env.BETTERPPTX_MCP_V2_STATE_SECRET = TEST_SECRET
delete process.env.BETTERPPTX_INSTALL_HMAC_SECRET
delete process.env.BETTERPPTX_TOKEN
const denyNetwork = () => { throw new Error('Network is forbidden in this test') }
mock.method(globalThis, 'fetch', denyNetwork)
mock.method(http, 'request', denyNetwork)
mock.method(https, 'request', denyNetwork)
mock.method(net.Socket.prototype, 'connect', denyNetwork)

const protocol = await import('../mcp-v2/protocol.mjs')
const { encodeRequestState, decodeRequestState, MCP_JSONRPC_INVALID_PARAMS, MCP_V2_PROTOCOL_VERSION } = protocol
const GENERATE = 'betterpptx.deck.generate_from_spec'
const ACTIVATE = 'betterpptx.auth.activate_key'
const META = {
	'io.modelcontextprotocol/protocolVersion': MCP_V2_PROTOCOL_VERSION,
	'io.modelcontextprotocol/clientInfo': { name: 'shared-client', version: '1' },
	'io.modelcontextprotocol/clientCapabilities': { elicitation: { form: {}, url: {} } },
}
const ARGS = { dryRun: false, spec: { title: 'Fixture', slides: [] }, idempotencyKey: 'fixture-operation' }
const upgrade = () => ({ ok: false, error: { code: 'REQUIRES_UPGRADE', message: 'Premium is required.' } })
let dispatcherCalls = []
let createdContexts = []
let execute = async () => upgrade()
let checkoutUrl = ''
let events = []

mock.module(new URL('../logger.mjs', import.meta.url).href, { namedExports: {
	createTraceId: () => 'fixture-request', logEvent: (name, data) => events.push({ name, data }),
} })
mock.module(new URL('../engine.mjs', import.meta.url).href, { namedExports: {
	createMcpToolDispatcher(boundContext) {
		createdContexts.push(boundContext)
		return { async call(name, args, callContext = {}) {
			const context = { ...boundContext, ...callContext }
			dispatcherCalls.push({ name, args, context })
			return execute(name, args, context)
		} }
	},
} })
mock.module(new URL('../blackbox.mjs', import.meta.url).href, { namedExports: { isPublicBlackBoxMode: () => true } })
mock.module(new URL('../tools.mjs', import.meta.url).href, { namedExports: { canonicalToolName: name => name } })
mock.module(new URL('../billing/monetized-mcp-adapter.mjs', import.meta.url).href, { namedExports: {
	MONETIZED_MCP_PROTOCOL_TOOLS: new Set(),
} })
mock.module(new URL('../server.mjs', import.meta.url).href, { namedExports: { PUBLIC_INSTRUCTIONS: 'Fixture instructions' } })
mock.module(new URL('../public-manifest.mjs', import.meta.url).href, { namedExports: {
	advertisedPublicTools: () => [{ name: GENERATE, inputSchema: { type: 'object' } }],
	publicRuntimeManifest: () => ({ semanticVersion: 'fixture', capabilityContentDigest: 'fixture-digest' }),
} })
mock.module(new URL('../mcp-v2/catalog.mjs', import.meta.url).href, { namedExports: {
	checkoutUrlForInstall: () => checkoutUrl,
	getPublicPrompt: () => ({ messages: [] }),
	mcpV2Capabilities: () => ({ tools: {}, resources: {}, prompts: {} }),
	mcpV2Instructions: text => text,
	mcpV2ServerInfo: () => ({ name: 'betterpptx', version: 'fixture' }),
	publicPromptCatalog: () => [],
	publicResourceCatalog: () => ['protocol', 'auth', 'status', 'capabilities'].map(name => ({ uri: `betterpptx://${name}`, mimeType: 'application/json' })),
	runtimeStatusResource: () => ({ ok: true }),
} })
const { dispatchMcpV2Message, handleMcpV2Post } = await import('../mcp-v2/handler.mjs')

function reset() {
	dispatcherCalls = []
	createdContexts = []
	execute = async () => upgrade()
	checkoutUrl = ''
	events = []
	process.env.BETTERPPTX_MCP_V2_STATE_SECRET = TEST_SECRET
	delete process.env.BETTERPPTX_INSTALL_HMAC_SECRET
	delete process.env.BETTERPPTX_TOKEN
	process.env.BETTERPPTX_RATE_LIMIT_BURST = '120'
	process.env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN = '120'
}

function request(params = {}) {
	return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: GENERATE, arguments: structuredClone(ARGS), _meta: META, ...params } }
}

function context(installHash = 'fixture-install-a', extra = {}) {
	return { installHash, req: { headers: { 'mcp-protocol-version': MCP_V2_PROTOCOL_VERSION } }, ...extra }
}

async function issue(extraContext = {}) {
	const result = await dispatchMcpV2Message(request(), context('fixture-install-a', extraContext))
	assert.equal(result.rpc.result?.resultType, 'input_required')
	assert.ok(result.rpc.result.requestState)
	return result.rpc.result.requestState
}

async function resume(token, params = {}, callerContext = context()) {
	return dispatchMcpV2Message(request({ requestState: token, inputResponses: { upgrade: { action: 'accept', content: { choice: 'keep_free' } } }, ...params }), callerContext)
}

test('requestState has a strict server-controlled version and lifetime', () => {
	reset()
	const start = Date.now()
	const state = decodeRequestState(encodeRequestState({ v: 999, exp: Number.MAX_SAFE_INTEGER, iat: 0, name: GENERATE }))
	assert.notEqual(state.v, 999)
	assert.ok(state.exp <= Date.now() + 15 * 60 * 1000)
	assert.ok(state.exp > start)
	assert.ok(state.iat >= start)
})

test('requestState cannot use a public default or a bearer credential as its signing key', () => {
	reset()
	delete process.env.BETTERPPTX_MCP_V2_STATE_SECRET
	assert.throws(() => encodeRequestState({ name: GENERATE }))
	process.env.BETTERPPTX_TOKEN = 'fixture-shared-client-bearer-credential'
	assert.throws(() => encodeRequestState({ name: GENERATE }))
	process.env.BETTERPPTX_MCP_V2_STATE_SECRET = 'short'
	assert.throws(() => encodeRequestState({ name: GENERATE }))
	process.env.BETTERPPTX_MCP_V2_STATE_SECRET = TEST_SECRET
})

test('requestState rejects body/signature tampering, wrong keys, and malformed signed expiration', () => {
	reset()
	const token = encodeRequestState({ name: GENERATE })
	const [encoded, signature] = token.split('.')
	assert.throws(() => decodeRequestState(`${encoded.slice(0, -1)}A.${signature}`))
	assert.throws(() => decodeRequestState(`${encoded}.${signature.slice(0, -1)}!`))
	assert.throws(() => decodeRequestState(token, 'different-fixture-private-signing-key'))
	for (const exp of [null, 'never', '999999999999999999999999', {}, [], 0, Date.now() - 1, Number.MAX_SAFE_INTEGER]) {
		const payload = { ...decodeRequestState(token), exp }
		const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
		// The domain is part of the new wire format, separate from other HMAC uses.
		const sig = createHmac('sha256', TEST_SECRET).update('betterpptx-mcp-v2/request-state\0').update(body).digest('base64url')
		assert.throws(() => decodeRequestState(`${body}.${sig}`))
	}
})

test('requestState expires at its deadline and private-key rotation invalidates previous tokens', t => {
	reset()
	let now = Date.now()
	t.mock.method(Date, 'now', () => now)
	const token = encodeRequestState({ name: GENERATE })
	now = decodeRequestState(token).exp
	assert.throws(() => decodeRequestState(token), /expired requestState/)
	delete process.env.BETTERPPTX_MCP_V2_STATE_SECRET
	process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'fixture-owner-install-signing-key-32-bytes'
	const installationSigned = encodeRequestState({ name: GENERATE })
	assert.equal(decodeRequestState(installationSigned).name, GENERATE)
	process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'fixture-owner-rotated-signing-key-32-bytes'
	assert.throws(() => decodeRequestState(installationSigned))
})

test('a continuation is bound to its caller, exact tool, and original arguments', async () => {
	reset()
	const token = await issue()
	dispatcherCalls = []
	for (const [params, caller] of [
		[{}, context('fixture-install-b')],
		[{}, context(null)],
		[{ name: 'betterpptx.auth.status' }, context()],
		[{ arguments: { ...ARGS, dryRun: true } }, context()],
		[{ arguments: {} }, context()],
	]) {
		const result = await resume(token, params, caller)
		assert.equal(result.rpc.error?.code, MCP_JSONRPC_INVALID_PARAMS)
	}
	assert.equal(dispatcherCalls.length, 0, 'no replay mismatch may dispatch or activate anything')
	const own = await resume(token, { arguments: { idempotencyKey: ARGS.idempotencyKey, spec: ARGS.spec, dryRun: false } })
	assert.equal(own.rpc.result?.resultType, 'complete')
	assert.equal(own.rpc.result.structuredContent.error.code, 'REQUIRES_UPGRADE')
	assert.equal(dispatcherCalls.length, 0)
})

test('missing identity cannot be replaced by clientInfo, _meta claims, or raw identity headers', async () => {
	reset()
	const token = await issue()
	dispatcherCalls = []
	const forgedMeta = { ...META, installHash: 'fixture-install-a', sessionId: 'owner-session', authenticated: true,
		'io.modelcontextprotocol/clientInfo': { name: 'fixture-install-a', version: '1', installHash: 'fixture-install-a', premium: true } }
	const unbound = context(null, { req: { headers: { 'x-betterpptx-device': 'fixture-install-a', 'mcp-session-id': 'owner-session' } } })
	const replay = await resume(token, { _meta: forgedMeta }, unbound)
	assert.equal(replay.rpc.error?.code, MCP_JSONRPC_INVALID_PARAMS)
	assert.equal(dispatcherCalls.length, 0)
	const fresh = await dispatchMcpV2Message(request({ _meta: forgedMeta }), unbound)
	assert.equal(fresh.rpc.result?.resultType, 'complete')
	assert.equal(fresh.rpc.result.requestState, undefined)
	assert.equal(fresh.rpc.result.structuredContent.error.code, 'REQUIRES_UPGRADE')
})

test('unavailable signing key preserves the gated result without issuing an unsafe continuation', async () => {
	reset()
	delete process.env.BETTERPPTX_MCP_V2_STATE_SECRET
	const result = await dispatchMcpV2Message(request(), context())
	assert.equal(result.rpc.result?.resultType, 'complete')
	assert.equal(result.rpc.result.requestState, undefined)
	assert.equal(result.rpc.result.structuredContent.error.code, 'REQUIRES_UPGRADE')
	process.env.BETTERPPTX_MCP_V2_STATE_SECRET = TEST_SECRET
})

test('signed legacy, wrong-purpose, and incomplete continuation claims are rejected', async () => {
	reset()
	const token = await issue()
	const state = decodeRequestState(token)
	dispatcherCalls = []
	for (const claims of [
		{ ...state, purpose: 'different-flow' },
		{ ...state, callerBinding: '' },
		{ ...state, elicited: false },
		{ ...state, mode: 'unknown' },
		{ ...state, payload: { ok: true, data: { plan: 'premium' } } },
	]) {
		const response = await resume(encodeRequestState(claims))
		assert.equal(response.rpc.error?.code, MCP_JSONRPC_INVALID_PARAMS)
	}
	const legacyBody = Buffer.from(JSON.stringify({ ...state, v: 1 })).toString('base64url')
	const legacySignature = createHmac('sha256', 'betterpptx-mcp-v2-dev-state').update(legacyBody).digest('base64url')
	assert.equal((await resume(`${legacyBody}.${legacySignature}`)).rpc.error?.code, MCP_JSONRPC_INVALID_PARAMS)
	assert.equal(dispatcherCalls.length, 0)
})

test('dispatcher argument normalization cannot change what an issued continuation binds', async () => {
	reset()
	execute = async (name, args) => { args.spec.title = 'Normalized internally'; return upgrade() }
	const token = await issue()
	assert.deepEqual(decodeRequestState(token).arguments, ARGS)
	const response = await resume(token, { _meta: { ...META, 'io.modelcontextprotocol/clientInfo': { name: 'another-display-name' } } })
	assert.equal(response.rpc.result?.resultType, 'complete')
})

test('orphaned, ambiguous, and malformed continuation responses never invoke a tool', async () => {
	reset()
	const token = await issue()
	dispatcherCalls = []
	for (const params of [
		{ requestState: '' }, { requestState: null }, { requestState: [] },
		{ inputResponses: {} },
		{ requestState: token },
		{ requestState: token, inputResponses: {} },
		{ requestState: token, inputResponses: [] },
		{ requestState: token, inputResponses: { unexpected: { action: 'accept', content: { choice: 'activate', activationKey: 'fixture-key' } } } },
		{ requestState: token, inputResponses: { upgrade: { action: 'unknown', content: { choice: 'activate', activationKey: 'fixture-key' } } } },
		{ requestState: token, inputResponses: { upgrade: { action: 'accept', content: { choice: 'activate' } } } },
		{ requestState: token, inputResponses: { upgrade: { action: 'accept', content: { choice: 'unknown' } } } },
	]) {
		const result = await dispatchMcpV2Message(request(params), context())
		assert.equal(result.rpc.error?.code, MCP_JSONRPC_INVALID_PARAMS)
	}
	assert.equal(dispatcherCalls.length, 0)
})

test('activation must succeed before retrying the original gated tool', async () => {
	reset()
	const token = await issue()
	for (const activation of [undefined, { ok: false, error: { code: 'INVALID_ACTIVATION_KEY', message: 'Rejected.' } }, { ok: true, data: { activated: false } }]) {
		dispatcherCalls = []
		execute = async () => activation
		const result = await resume(token, { inputResponses: { upgrade: { action: 'accept', content: { choice: 'activate', activationKey: 'fixture-key' } } } })
		assert.deepEqual(dispatcherCalls.map(call => call.name), [ACTIVATE])
		assert.equal(result.rpc.result?.isError, true)
	}
	dispatcherCalls = []
	execute = async name => name === ACTIVATE ? { ok: true, data: { activated: true } } : { ok: true, data: { completed: true } }
	const result = await resume(token, { inputResponses: { upgrade: { action: 'accept', content: { choice: 'activate', activationKey: 'fixture-key' } } } })
	assert.deepEqual(dispatcherCalls.map(call => call.name), [ACTIVATE, GENERATE])
	assert.deepEqual(dispatcherCalls[1].args, ARGS)
	assert.equal(result.rpc.result.structuredContent.data.completed, true)
})

test('activation exceptions cannot log credentials or execute the gated work', async () => {
	reset()
	const token = await issue()
	dispatcherCalls = []
	execute = async () => { throw new Error('fixture-sensitive-activation-value') }
	const response = await resume(token, { inputResponses: { upgrade: { action: 'accept', content: { choice: 'activate', activationKey: 'fixture-key' } } } })
	assert.equal(response.rpc.error?.code, protocol.MCP_JSONRPC_INTERNAL_ERROR)
	assert.deepEqual(dispatcherCalls.map(call => call.name), [ACTIVATE])
	assert.equal(JSON.stringify(events).includes('fixture-sensitive-activation-value'), false)
})

test('decline/cancel never activate or retry, and URL accept rechecks the original billing gate', async () => {
	reset()
	checkoutUrl = 'https://example.invalid/checkout'
	const token = await issue()
	for (const action of ['decline', 'cancel']) {
		dispatcherCalls = []
		const result = await resume(token, { inputResponses: { upgrade: { action } } })
		assert.equal(result.rpc.result.structuredContent.error.code, 'REQUIRES_UPGRADE')
		assert.equal(dispatcherCalls.length, 0)
	}
	dispatcherCalls = []
	const result = await resume(token, { inputResponses: { upgrade: { action: 'accept' } } })
	assert.deepEqual(dispatcherCalls.map(call => call.name), [GENERATE])
	assert.equal(result.rpc.result.resultType, 'complete')
	assert.equal(result.rpc.result.structuredContent.error.code, 'REQUIRES_UPGRADE')
})

test('transport does not import cached session activation into another RPC or caller', async () => {
	reset()
	const activated = new Set()
	execute = async (name, args, bound) => {
		if (name === ACTIVATE) { activated.add(bound.sessionId); return { ok: true, data: { activated: true } } }
		return { ok: true, data: { activated: activated.has(bound.sessionId) } }
	}
	const sharedState = { hydratedAt: Date.now(), billingEntitlement: { plan: 'premium', billingCustomerHash: 'fixture-install-a' } }
	await dispatchMcpV2Message(request({ name: ACTIVATE, arguments: { key: 'fixture-key' } }), context('fixture-install-a', { sessionId: 'request-one', installState: sharedState }))
	const own = await dispatchMcpV2Message(request({ _meta: { ...META, 'io.modelcontextprotocol/clientInfo': { name: 'different-client' } } }), context('fixture-install-a', { sessionId: 'request-one', installState: sharedState }))
	const other = await dispatchMcpV2Message(request(), context('fixture-install-b', { sessionId: 'request-one', installState: sharedState }))
	assert.equal(own.rpc.result.structuredContent.data.activated, false)
	assert.equal(other.rpc.result.structuredContent.data.activated, false)
	assert.notEqual(createdContexts[0].sessionId, createdContexts[1].sessionId)
	assert.notEqual(createdContexts[0].sessionId, createdContexts[2].sessionId)
	assert.notEqual(createdContexts[0].installState, sharedState)
	assert.notEqual(createdContexts[0].installState, createdContexts[2].installState)
	assert.deepEqual(createdContexts[2].installState, {})
})

test('an injected dispatcher receives the current caller binding on every call', async () => {
	reset()
	const contexts = []
	const dispatcher = { async call(name, args, bound) { contexts.push(bound); return { ok: true, data: {} } } }
	await dispatchMcpV2Message(request(), context('fixture-install-a', { dispatcher, sessionId: 'shared' }))
	await dispatchMcpV2Message(request(), context('fixture-install-b', { dispatcher, sessionId: 'shared' }))
	assert.equal(contexts[0]?.installHash, 'fixture-install-a')
	assert.equal(contexts[1]?.installHash, 'fixture-install-b')
	assert.notEqual(contexts[0]?.sessionId, contexts[1]?.sessionId)
})

test('reserved engine controls in tool arguments are rejected before dispatch', async () => {
	reset()
	for (const key of ['__context', '__durableRehydrate', '__skipDurableOperationLedger', '__skipDurableDeckPersistence', '__billingGate', '__specCompiler', '__durableOperationWorker', '__proto__']) {
		const result = await dispatchMcpV2Message(request({ arguments: { ...ARGS, [key]: true } }), context('fixture-reserved-args'))
		assert.equal(result.rpc.error?.code, MCP_JSONRPC_INVALID_PARAMS)
		assert.equal(result.rpc.error.message, 'Invalid tool arguments')
	}
	assert.equal(dispatcherCalls.length, 0)
})

test('transport context uses an allowlist and never spreads metadata or privileged flags into the engine', async () => {
	reset()
	const controls = { __context: { premium: true }, __durableRehydrate: true, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true, __billingGate: { active: false }, __specCompiler: true }
	execute = async () => ({ ok: true, data: {} })
	await dispatchMcpV2Message(request({ ...controls, _meta: { ...META, ...controls } }), context('fixture-context-allowlist', controls))
	assert.equal(createdContexts.length, 1)
	assert.deepEqual(Object.keys(createdContexts[0]).sort(), ['authenticated', 'authenticationBasis', 'blackBox', 'clientInfo', 'installHash', 'installState', 'quotaIdentityHash', 'resourceIdentityHash', 'sessionId', 'toolNameProfile'].sort())
	assert.equal(createdContexts[0].authenticated, false)
	assert.equal(createdContexts[0].authenticationBasis, null)
	assert.deepEqual(Object.keys(dispatcherCalls[0].context).sort(), Object.keys(createdContexts[0]).sort())
	assert.equal(dispatcherCalls[0].context.installHash, 'fixture-context-allowlist')
})

test('caller-dependent resources cannot be cached publicly', async () => {
	reset()
	execute = async (name, args, bound) => ({ ok: true, data: { caller: bound.installHash, plan: 'free' } })
	for (const name of ['auth', 'status', 'capabilities']) {
		const message = { jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: `betterpptx://${name}`, _meta: META } }
		const a = await dispatchMcpV2Message(message, context())
		const b = await dispatchMcpV2Message(message, context('fixture-install-b'))
		assert.equal(a.rpc.result.cacheScope, 'private')
		assert.equal(a.rpc.result.ttlMs, 0)
		assert.notEqual(a.rpc.result.contents[0].text, b.rpc.result.contents[0].text)
	}
	const result = await dispatchMcpV2Message({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'betterpptx://protocol', _meta: META } }, context())
	assert.equal(result.rpc.result.cacheScope, 'public')
})

test('shared immutable error results are not mutated or tagged with another caller request id', async () => {
	reset()
	const cached = Object.freeze({ ok: false, error: Object.freeze({ code: 'FIXTURE_ERROR', requestId: 'another-callers-request' }) })
	execute = async () => cached
	const result = await dispatchMcpV2Message(request(), context('fixture-install-b', { requestId: 'current-request' }))
	assert.equal(result.rpc.result?.structuredContent.error.requestId, 'current-request')
	assert.equal(cached.error.requestId, 'another-callers-request')
})

test('HTTP batch rejects a swapped continuation without executing it and sets no-store', async () => {
	reset()
	const token = await issue()
	dispatcherCalls = []
	const req = { headers: { accept: 'application/json' }, body: [request({ requestState: token, inputResponses: { upgrade: { action: 'cancel' } } })] }
	const headers = {}
	let body
	const res = { setHeader(name, value) { headers[name] = value }, status() { return this }, json(value) { body = value; return this } }
	await handleMcpV2Post(req, res, context('fixture-install-b'))
	assert.equal(body[0].error?.code, MCP_JSONRPC_INVALID_PARAMS)
	assert.equal(headers['Cache-Control'], 'no-store')
	assert.equal(dispatcherCalls.length, 0)
})

async function batch(messages, caller = context()) {
	const req = { headers: { accept: 'application/json', 'mcp-protocol-version': MCP_V2_PROTOCOL_VERSION }, body: messages }
	const output = { headers: {}, status: 0, body: null }
	const res = {
		setHeader(name, value) { output.headers[name] = value },
		status(value) { output.status = value; return this },
		json(value) { output.body = value; return this },
		end() { return this },
	}
	await handleMcpV2Post(req, res, caller)
	return output
}

test('oversized batches are rejected before any member executes, including malformed and notification members', async () => {
	reset()
	const size = protocol.MCP_V2_MAX_BATCH_SIZE
	assert.ok(Number.isInteger(size) && size > 0 && size <= 32)
	for (const make of [() => request(), () => null, () => ({ ...request(), id: undefined })]) {
		const response = await batch(Array.from({ length: size + 1 }, make), context('fixture-batch-limit'))
		assert.equal(response.status, 400)
		assert.equal(response.body.error.code, protocol.MCP_JSONRPC_INVALID_REQUEST)
		assert.equal(response.body.error.data.maxBatchSize, size)
		assert.equal(response.headers['Cache-Control'], 'no-store')
	}
	assert.equal(dispatcherCalls.length, 0)
	execute = async () => ({ ok: true, data: {} })
	const accepted = await batch(Array.from({ length: size }, (_, id) => ({ ...request(), id })), context('fixture-batch-limit'))
	assert.equal(accepted.body.length, size)
	assert.equal(dispatcherCalls.length, size)
})

test('every batch RPC consumes its own caller rate budget, which persists across HTTP requests', async () => {
	reset()
	process.env.BETTERPPTX_RATE_LIMIT_BURST = '2'
	process.env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN = '0'
	execute = async () => ({ ok: true, data: {} })
	const caller = context('fixture-per-call-rate', { sessionId: 'client-session-one' })
	const response = await batch([request(), request(), request()], caller)
	assert.equal(response.body[0].result.structuredContent.ok, true)
	assert.equal(response.body[1].result.structuredContent.ok, true)
	assert.equal(response.body[2].error.code, protocol.MCP_RATE_LIMITED)
	assert.equal(dispatcherCalls.length, 2)
	const single = await batch(request({ _meta: { ...META, 'io.modelcontextprotocol/clientInfo': { name: 'new-client' } } }), { ...caller, sessionId: 'client-session-two' })
	assert.equal(single.status, 429)
	assert.equal(single.body.error.code, protocol.MCP_RATE_LIMITED)
	const other = await batch(request(), context('fixture-other-rate'))
	assert.equal(other.body.result.structuredContent.ok, true)
})

test('activation and the following gated retry each consume a call budget slot', async () => {
	reset()
	process.env.BETTERPPTX_RATE_LIMIT_BURST = '2'
	process.env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN = '0'
	const caller = context('fixture-activation-rate')
	const issued = await dispatchMcpV2Message(request(), caller)
	const token = issued.rpc.result.requestState
	assert.ok(token)
	dispatcherCalls = []
	execute = async () => ({ ok: true, data: { activated: true } })
	const response = await resume(token, { inputResponses: { upgrade: { action: 'accept', content: { choice: 'activate', activationKey: 'fixture-key' } } } }, caller)
	assert.equal(response.rpc.error?.code, protocol.MCP_RATE_LIMITED)
	assert.deepEqual(dispatcherCalls.map(call => call.name), [ACTIVATE])
})

test('simultaneous RPCs cannot overspend the caller rate bucket and restore console redirection', async () => {
	reset()
	process.env.BETTERPPTX_RATE_LIMIT_BURST = '2'
	process.env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN = '0'
	const caller = context('fixture-concurrent-rate')
	const original = { log: console.log, info: console.info, warn: console.warn }
	execute = async () => { await Promise.resolve(); return { ok: true, data: {} } }
	try {
		const responses = await Promise.all([1, 2, 3, 4].map(() => dispatchMcpV2Message(request(), caller)))
		assert.equal(responses.filter(response => response.rpc.result).length, 2)
		assert.equal(responses.filter(response => response.rpc.error?.code === protocol.MCP_RATE_LIMITED).length, 2)
		assert.equal(dispatcherCalls.length, 2)
		assert.equal(new Set(createdContexts.map(bound => bound.sessionId)).size, 2)
		assert.equal(console.log, original.log)
		assert.equal(console.info, original.info)
		assert.equal(console.warn, original.warn)
	} finally { Object.assign(console, original) }
})

test('rate debt refills only with time and missing identity cannot reset it using metadata', async t => {
	reset()
	process.env.BETTERPPTX_RATE_LIMIT_BURST = '1'
	process.env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN = '60'
	let now = Date.now() + 60000
	t.mock.method(Date, 'now', () => now)
	execute = async () => ({ ok: true, data: {} })
	const caller = context(null)
	const first = await dispatchMcpV2Message(request(), caller)
	assert.equal(first.rpc.result.structuredContent.ok, true)
	const second = await dispatchMcpV2Message(request({ _meta: { ...META, installHash: 'forged-new-installation' } }), { ...caller, sessionId: 'new-client-session' })
	assert.equal(second.rpc.error.code, protocol.MCP_RATE_LIMITED)
	assert.equal(second.rpc.error.data.retryAfterMs, 1000)
	now += 1000
	assert.equal((await dispatchMcpV2Message(request(), caller)).rpc.result.structuredContent.ok, true)
})

test('batch members get independent billing decisions and cannot inherit activation or cached premium state', async () => {
	reset()
	const caller = context('fixture-batch-billing', { sessionId: 'shared-http-request', installState: { billingEntitlement: { plan: 'premium' } } })
	let credits = 2
	const authorizedSessions = new Set()
	let billingChecks = 0
	execute = async (name, args, bound) => {
		assert.deepEqual(bound.installState, {})
		if (name === ACTIVATE) { authorizedSessions.add(bound.sessionId); return { ok: true, data: { activated: true } } }
		assert.equal(authorizedSessions.has(bound.sessionId), false)
		billingChecks += 1
		if (credits <= 0) return { ok: false, error: { code: 'BILLING_INSUFFICIENT_CREDITS' } }
		credits -= 1
		return { ok: true, data: { charged: 1 } }
	}
	const response = await batch([
		request({ name: ACTIVATE, arguments: { key: 'fixture-key' } }), request(), request(), request(),
	], caller)
	assert.equal(response.body[1].result.structuredContent.data.charged, 1)
	assert.equal(response.body[2].result.structuredContent.data.charged, 1)
	assert.equal(response.body[3].result.structuredContent.error.code, 'BILLING_INSUFFICIENT_CREDITS')
	assert.equal(billingChecks, 3)
	assert.equal(credits, 0)
	assert.equal(new Set(createdContexts.map(bound => bound.sessionId)).size, 4)
})

test('invalid batch members are reported rather than silently filtered and notifications do no work', async () => {
	reset()
	const message = request()
	assert.equal(protocol.isMcpV2Request({ headers: {} }, [null, message]), true)
	const response = await batch([null, 1, [], { ...message, id: undefined }], context('fixture-invalid-batch'))
	assert.equal(response.body.length, 3)
	assert.ok(response.body.every(item => item.error.code === protocol.MCP_JSONRPC_INVALID_REQUEST))
	assert.equal(dispatcherCalls.length, 0)
	const notification = await batch([{ ...message, id: undefined }])
	assert.equal(notification.status, 204)
	assert.equal(notification.headers['Cache-Control'], 'no-store')
})
