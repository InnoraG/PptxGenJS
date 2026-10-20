import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../deploy/cloudflare-edge/src/index.mjs'

const runOrigin = 'https://betterpptx-api-abc123-uc.a.run.app'

test('identity traffic goes to the configured proxied origin unchanged', async () => {
	const originalFetch = globalThis.fetch
	let received
	globalThis.fetch = async request => {
		received = request
		return new Response('identity-origin', { status: 200 })
	}
	try {
		const request = new Request('https://betterpptx.xmcpx.com/identity/realms/betterpptx/protocol/openid-connect/token?grant_type=authorization_code', {
			method: 'POST',
			headers: { Authorization: 'Basic test-client', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'code=one-time-code&code_verifier=pkce-verifier',
		})
		const response = await worker.fetch(request, {})
		assert.equal(response.status, 200)
		assert.equal(await response.text(), 'identity-origin')
		assert.equal(received.url, request.url)
		assert.equal(received.headers.get('authorization'), 'Basic test-client')
		assert.equal(await received.text(), 'code=one-time-code&code_verifier=pkce-verifier')
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('with the cloud-run identity route, sign-in traffic goes to the pinned Cloud Run gateway', async () => {
	const originalFetch = globalThis.fetch
	let received
	globalThis.fetch = async request => {
		received = request
		return new Response('gateway-identity', { status: 200 })
	}
	try {
		const request = new Request('https://betterpptx.xmcpx.com/identity/realms/betterpptx/protocol/openid-connect/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'openai-mcp/1.0.0' },
			body: 'grant_type=authorization_code&code=one-time-code',
		})
		const response = await worker.fetch(request, { BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin, BETTERPPTX_IDENTITY_ROUTE: 'cloud-run' })
		assert.equal(response.status, 200)
		assert.equal(await response.text(), 'gateway-identity')
		assert.equal(received.url, `${runOrigin}/identity/realms/betterpptx/protocol/openid-connect/token`)
		assert.equal(received.headers.get('user-agent'), 'openai-mcp/1.0.0')
		assert.equal(await received.text(), 'grant_type=authorization_code&code=one-time-code')
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('MCP requests preserve streamed contract fields and use the pinned Cloud Run origin', async () => {
	const originalFetch = globalThis.fetch
	let received
	let fetchOptions
	globalThis.fetch = async (request, options) => {
		received = request
		fetchOptions = options
		return new Response('event: message\ndata: {"jsonrpc":"2.0"}\n\n', {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
		})
	}
	try {
		const request = new Request('https://betterpptx.xmcpx.com/mcp?mode=stream', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer opaque-user-token',
				Accept: 'application/json, text/event-stream',
				'Content-Type': 'application/json',
				'Mcp-Session-Id': 'session-opaque',
				host: 'betterpptx.xmcpx.com',
			},
			body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
		})
		const response = await worker.fetch(request, { BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin })
		assert.equal(received.url, 'https://betterpptx-api-abc123-uc.a.run.app/mcp?mode=stream')
		assert.equal(received.method, 'POST')
		assert.equal(received.headers.get('authorization'), 'Bearer opaque-user-token')
		assert.equal(received.headers.get('mcp-session-id'), 'session-opaque')
		assert.notEqual(received.headers.get('host'), 'betterpptx.xmcpx.com', 'the forwarded authority must match the Cloud Run URL, not the public custom domain')
		assert.equal(await received.text(), '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
		assert.deepEqual(fetchOptions, { cache: 'no-store' })
		assert.equal(response.headers.get('content-type'), 'text/event-stream')
		assert.equal(await response.text(), 'event: message\ndata: {"jsonrpc":"2.0"}\n\n')
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('a path that merely begins with the identity label cannot bypass Cloud Run', async () => {
	const originalFetch = globalThis.fetch
	let destination
	globalThis.fetch = async request => {
		destination = new URL(request.url).hostname
		return new Response('ok')
	}
	try {
		await worker.fetch(new Request('https://betterpptx.xmcpx.com/identity-like/path'), {
			BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin,
		})
		assert.equal(destination, new URL(runOrigin).hostname)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('missing or non-Cloud Run origin fails closed without an upstream request', async () => {
	const originalFetch = globalThis.fetch
	let calls = 0
	globalThis.fetch = async () => {
		calls += 1
		return new Response('should not be called')
	}
	try {
		for (const invalid of ['', 'https://example.com', 'https://unrelated.run.app', 'http://betterpptx-api.a.run.app', 'https://user@betterpptx-api.a.run.app']) {
			const response = await worker.fetch(new Request('https://betterpptx.xmcpx.com/mcp'), {
				BETTERPPTX_CLOUD_RUN_ORIGIN: invalid,
			})
			assert.equal(response.status, 503)
			assert.equal(response.headers.get('cache-control'), 'no-store')
		}
		assert.equal(calls, 0)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('origin errors do not disclose internal details', async () => {
	const originalFetch = globalThis.fetch
	globalThis.fetch = async () => { throw new Error('private-upstream-detail') }
	try {
		const response = await worker.fetch(new Request('https://betterpptx.xmcpx.com/mcp'), {
			BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin,
		})
		assert.equal(response.status, 502)
		assert.doesNotMatch(await response.text(), /private-upstream-detail/)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('a non-canonical routed host permanently redirects to the canonical product host', async () => {
	const originalFetch = globalThis.fetch
	let upstreamCalls = 0
	globalThis.fetch = async () => { upstreamCalls += 1; return new Response('unexpected') }
	try {
		const env = { BETTERPPTX_CLOUD_RUN_ORIGIN: runOrigin, BETTERPPTX_CANONICAL_HOST: 'betterpptx.x4ai.si', BETTERPPTX_IDENTITY_ROUTE: 'cloud-run' }
		const response = await worker.fetch(new Request('https://betterpptx.xmcpx.com/mcp?x=1', { method: 'POST', body: '{}' }), env)
		assert.equal(response.status, 308)
		assert.equal(response.headers.get('location'), 'https://betterpptx.x4ai.si/mcp?x=1')
		assert.equal(upstreamCalls, 0)
		globalThis.fetch = async request => { upstreamCalls += 1; return new Response('ok') }
		const canonical = await worker.fetch(new Request('https://betterpptx.x4ai.si/health'), env)
		assert.equal(await canonical.text(), 'ok')
		assert.equal(upstreamCalls, 1)
	} finally {
		globalThis.fetch = originalFetch
	}
})
