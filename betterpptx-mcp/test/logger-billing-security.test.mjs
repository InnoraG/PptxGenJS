import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('production never logs billing credentials or raw media despite development overrides', async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-log-security-'))
	try {
		Object.assign(process.env, {
			BETTERPPTX_ENV: 'production', BETTERPPTX_LOG: 'full',
			BETTERPPTX_LOG_SECRETS: '1', BETTERPPTX_LOG_PAYLOADS: '1',
			BETTERPPTX_LOG_MAX_CHARS: 'Infinity', BETTERPPTX_LOG_DIR: directory,
			BETTERPPTX_LOG_FILE: path.join(directory, 'synthetic.ndjson'),
		})
		const logger = await import('../logger.mjs')
		const secret = 'fake-fixture-credential-not-real'
		const payload = 'private-fixture-media-not-real'
		logger.logEvent('synthetic.payment', {
			apiKey: secret, 'API-Key': secret, deviceToken: secret,
			paymentSignature: secret, url: `https://invalid.example/pay?token=${secret}`,
			data: payload, unexpectedBuffer: Buffer.from(payload),
		})
		const output = await fs.readFile(process.env.BETTERPPTX_LOG_FILE, 'utf8')
		assert.ok(!output.includes(secret))
		assert.ok(!output.includes(payload))
		assert.ok(!output.includes(Buffer.from(payload).toString('base64')))
		assert.equal(logger.getLoggerInfo().secretsIncluded, false)
		assert.equal(logger.getLoggerInfo().maxChars, 65536)
	} finally { await fs.rm(directory, { recursive: true, force: true }) }
})
