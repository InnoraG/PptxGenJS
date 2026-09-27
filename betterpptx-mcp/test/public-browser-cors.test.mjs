import assert from 'node:assert/strict'
import test from 'node:test'

Object.assign(process.env, {
	BETTERPPTX_ENV: 'test',
	BETTERPPTX_DEPLOYMENT_STAGE: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_AUTH: 'none',
})

const { startBetterPptxHttp } = await import('../server-http.mjs')

test('public MCP permits every browser origin with wildcard CORS', async () => {
	const server = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, open: true })
	try {
		const port = server.httpServer.address().port
		const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'OPTIONS',
			headers: {
				Origin: 'https://mcpplaygroundonline.com',
				'Access-Control-Request-Method': 'POST',
				'Access-Control-Request-Headers': 'content-type,mcp-protocol-version,mcp-session-id',
			},
		})
		assert.equal(response.status, 204)
		assert.equal(response.headers.get('access-control-allow-origin'), '*')
		assert.match(response.headers.get('access-control-allow-methods') || '', /POST/)
		assert.match(response.headers.get('access-control-allow-headers') || '', /mcp-protocol-version/i)
	} finally {
		await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
	}
})

test('public MCP permits an arbitrary browser origin without maintaining an allowlist', async () => {
	const server = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, open: true })
	try {
		const port = server.httpServer.address().port
		const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'OPTIONS',
			headers: {
				Origin: 'https://untrusted.example',
				'Access-Control-Request-Method': 'POST',
			},
		})
		assert.equal(response.status, 204)
		assert.equal(response.headers.get('access-control-allow-origin'), '*')
	} finally {
		await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
	}
})
