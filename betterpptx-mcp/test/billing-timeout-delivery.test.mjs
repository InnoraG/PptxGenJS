import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Local fake speech service only. This exercises the actual engine admission,
// response deadline, completed result replay and ledger without paid services.
test('timed-out synthesis retains its funds, completes billing, and replays across reconnect without a second synthesis', async () => {
	const queued = process.env.BETTERPPTX_TIMEOUT_FIXTURE_QUEUED === '1'
	const durableInline = process.env.BETTERPPTX_TIMEOUT_FIXTURE_DURABLE_INLINE === '1'
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-billing-timeout-'))
	let calls = 0
	let finishProvider
	const providerWaiting = new Promise(resolve => { finishProvider = resolve })
	const wav = Buffer.alloc(44 + 22050)
	wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8)
	wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
	wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
	wav.write('data', 36); wav.writeUInt32LE(22050, 40)
	// Use audible PCM: the production narration-quality gate correctly rejects
	// an all-zero provider response, which is not a valid synthesis fixture.
	for (let sample = 0; sample < 11025; sample++) {
		wav.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * 440 * sample / 22050)), 44 + sample * 2)
	}
	const server = http.createServer(async (req, res) => {
		if (req.method !== 'POST') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('[]'); return }
		calls++
		await providerWaiting
		res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(wav)
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	Object.assign(process.env, {
		BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
		BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_LOCAL_MAINTAINER: '1',
		BETTERPPTX_FORCE_PLAN: '', BETTERPPTX_PREMIUM: '0', BETTERPPTX_BILLING_PROVIDER: 'crypto_credits', BETTERPPTX_BILLING_ENFORCE: '1',
		BETTERPPTX_BILLING_DRY_RUN: '0', BETTERPPTX_BILLING_SHADOW_MODE: '0', BETTERPPTX_REQUIRE_SHARED_STORES: '0',
		BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'ledger.json'),
		BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'asset-grants'),
		BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'), BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
		BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root, BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'locked'),
		BETTERPPTX_ALLOWED_AUDIO_DIRS: root, BETTERPPTX_TTS_PROVIDER: 'piper-http', BETTERPPTX_TTS_URL: `http://127.0.0.1:${server.address().port}`,
		BETTERPPTX_TOOL_TIMEOUT_MS: '1000', BETTERPPTX_LONG_TOOL_TIMEOUT_MS: '1000', BETTERPPTX_TTS_TIMEOUT_MS: '15000',
		BETTERPPTX_LOG: '', BETTERPPTX_USAGE_AUTO_FLUSH: '1', BETTERPPTX_DURABLE_OPERATION_STORE: queued || durableInline ? 'local' : 'none',
		BETTERPPTX_OPERATION_STORE_FILE: path.join(root, 'operations.json'),
		BETTERPPTX_OPERATION_EXECUTION_MODE: queued ? 'queued' : 'inline', BETTERPPTX_OPERATION_DISPATCHER: 'inline',
	})
	try {
		const { createBillingLedgerStore } = await import('../billing/ledger-store.mjs')
		const { createMcpToolDispatcher, runDurableOperationById } = await import('../engine.mjs')
		const store = createBillingLedgerStore()
		const installHash = `install_${'b'.repeat(64)}`
		await store.creditCustomer({ customerHash: installHash, eventId: 'test-seed', idempotencyKey: 'test-seed', amountCredits: 100, source: 'owner_goodwill' })
		const mcp = createMcpToolDispatcher({ installHash, sessionId: 'request-one', blackBox: true, __skipDurableOperationLedger: !queued && !durableInline, __skipDurableDeckPersistence: true })
		const args = { text: `Isolated timeout fixture ${path.basename(root)}.`, voice: 'en_US-ljspeech-high', idempotencyKey: 'timed-out-preparation' }
		const first = await mcp.call('betterpptx.narration.synthesize', args)
		assert.equal(first.ok, false, JSON.stringify(first))
		assert.equal(first.error.code, queued ? 'OPERATION_PENDING' : 'TOOL_TIMEOUT', JSON.stringify(first))
		if (durableInline) {
			assert.ok(first.error.details?.operationId)
			assert.deepEqual(first.error.details.nextAction, {
				tool: 'betterpptx.operation.status',
				request: { operationId: first.error.details.operationId },
			})
		}
		if (queued) {
			const worker = await runDurableOperationById(first.error.details.operationId, { leaseOwner: 'test-worker' })
			assert.equal(worker.state, 'running', 'worker response timeout must not fail its still-running operation')
		}
		assert.equal(calls, 1)
		const pending = await store.getCustomer(installHash)
		assert.ok(pending.pendingReservedCredits > 0, 'timeout must not release in-flight funds')
		finishProvider()
		let replay
		for (let attempt = 0; attempt < 40; attempt++) {
			replay = await mcp.call('betterpptx.narration.synthesize', args, { sessionId: 'new-request-after-reconnect' })
			if (replay.ok || replay.error?.code !== 'OPERATION_PENDING') break
			await new Promise(resolve => setTimeout(resolve, 100))
		}
		assert.equal(replay.ok, true, JSON.stringify(replay))
		assert.equal(queued || durableInline ? replay.data.durableOperation?.replay : replay.data.idempotentReplay, true)
		assert.equal(calls, 1)
		const final = await store.getCustomer(installHash)
		assert.equal(final.pendingReservedCredits, 0)
		assert.ok(final.availableBalanceCredits < 100, 'completed synthesis must be debited before delivery')
	} finally {
		finishProvider()
		await new Promise(resolve => server.close(resolve))
		await fs.rm(root, { recursive: true, force: true })
	}
})
