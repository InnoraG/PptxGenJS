import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForIdentityMatch } from '../deploy/cloudflare-edge/release-identity-retry.mjs'

test('custom-domain identity verification waits through edge propagation and accepts the matching release', async () => {
	const expected = { version: '1.10.52', schema: '2026-09-26.5' }
	const observed = [
		{ version: '1.10.51', schema: '2026-09-26.5' },
		expected,
	]
	const waits = []
	const retryEvents = []
	const result = await waitForIdentityMatch(expected, async () => observed.shift(), {
		maxAttempts: 3,
		retryDelayMs: 15,
		wait: async milliseconds => waits.push(milliseconds),
		onRetry: event => retryEvents.push(event),
	})

	assert.deepEqual(result, { actual: expected, attempts: 2 })
	assert.deepEqual(waits, [15])
	assert.deepEqual(retryEvents, [{ attempt: 1, nextAttempt: 2, mismatchFields: ['version'], readFailed: false }])
})

test('custom-domain identity verification retries transient read failures', async () => {
	let attempts = 0
	const result = await waitForIdentityMatch({ version: '1.10.52' }, async () => {
		attempts += 1
		if (attempts === 1) throw new Error('transient edge response')
		return { version: '1.10.52' }
	}, { maxAttempts: 2, retryDelayMs: 0, wait: async () => {} })

	assert.equal(result.attempts, 2)
	assert.equal(attempts, 2)
})

test('persistent custom-domain identity mismatch fails with bounded, field-specific evidence', async () => {
	let attempts = 0
	const waits = []
	await assert.rejects(
		waitForIdentityMatch({ version: '1.10.52', schema: 'next' }, async () => {
			attempts += 1
			return { version: '1.10.51', schema: 'next' }
		}, { maxAttempts: 3, retryDelayMs: 5, wait: async milliseconds => waits.push(milliseconds) }),
		/within 120000 ms \(maximum 3 attempts\); identity fields did not converge: version\./,
	)
	assert.equal(attempts, 3)
	assert.deepEqual(waits, [5, 5])
})

test('invalid custom-domain retry budgets are rejected', async () => {
	await assert.rejects(waitForIdentityMatch({}, async () => ({})), /non-empty object/)
	await assert.rejects(waitForIdentityMatch({ version: 'x' }, async () => ({}), { maxAttempts: 0 }), /maxAttempts/)
	await assert.rejects(waitForIdentityMatch({ version: 'x' }, async () => ({}), { timeoutMs: 0 }), /timeoutMs/)
})
