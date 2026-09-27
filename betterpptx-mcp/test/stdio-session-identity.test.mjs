import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStdioSessionId } from '../auth/stdio-session-identity.mjs'

test('stdio launcher keeps a valid trusted session identity', () => {
	assert.equal(resolveStdioSessionId({ BETTERPPTX_PUBLIC_SESSION_ID: 'e12-public-session-1' }), 'e12-public-session-1')
	assert.equal(resolveStdioSessionId({ BETTERPPTX_STDIO_SESSION_ID: 'stdio-session-2' }), 'stdio-session-2')
})

test('stdio launcher never returns an unbound or malformed identity', () => {
	for (const env of [
		{},
		{ BETTERPPTX_PUBLIC_SESSION_ID: 'stdio-default' },
		{ BETTERPPTX_PUBLIC_SESSION_ID: ' padded ' },
		{ BETTERPPTX_PUBLIC_SESSION_ID: '\u0000' },
		{ BETTERPPTX_PUBLIC_SESSION_ID: 'x'.repeat(513) },
	]) {
		const sessionId = resolveStdioSessionId(env)
		assert.match(sessionId, /^stdio-[0-9a-f-]{36}$/)
		assert.notEqual(sessionId, 'stdio-default')
	}
})
