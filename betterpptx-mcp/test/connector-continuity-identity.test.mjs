import test from 'node:test'
import assert from 'node:assert/strict'
import { connectorIdentityFromHeaders, isConnectorIdentityHash } from '../auth/install-identity.mjs'

test('OpenAI connector continuity derives the same opaque identity across changing proxy metadata', () => {
	const first = connectorIdentityFromHeaders({
		'x-openai-session': 'v1/session-opaque',
		'x-openai-subject': 'v1/subject-opaque',
		'x-forwarded-for': '2001:db8::1',
	}, { scope: 'https://example.test' })
	const second = connectorIdentityFromHeaders({
		'x-openai-session': 'v1/session-opaque',
		'x-openai-subject': 'v1/subject-opaque',
		'x-forwarded-for': '2001:db8::2',
	}, { scope: 'https://example.test' })
	assert.ok(first?.resourceIdentityHash)
	assert.equal(first.resourceIdentityHash, second.resourceIdentityHash)
	assert.equal(isConnectorIdentityHash(first.resourceIdentityHash), true)
	assert.equal(first.resourceIdentityHash.includes('session-opaque'), false)
})

test('connector continuity is endpoint-scoped and declines missing or malformed hints', () => {
	const a = connectorIdentityFromHeaders({ 'x-openai-session': 'same' }, { scope: 'https://a.test' })
	const b = connectorIdentityFromHeaders({ 'x-openai-session': 'same' }, { scope: 'https://b.test' })
	assert.notEqual(a.resourceIdentityHash, b.resourceIdentityHash)
	assert.equal(connectorIdentityFromHeaders({}), null)
	assert.equal(connectorIdentityFromHeaders({ 'x-openai-session': '\u0000bad' }), null)
	assert.equal(connectorIdentityFromHeaders({ 'x-openai-session': ['one', 'two'] }), null)
})
