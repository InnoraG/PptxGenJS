import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// Exercise the real ledger and entitlements with synthetic authenticated
// principals. No engine/provider execution, HTTP server or external services.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-quota-replay-'))
Object.assign(process.env, {
	BETTERPPTX_INSTALL_USAGE_STORE: 'local',
	BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
	BETTERPPTX_ENTITLEMENT_STORE: 'local',
	BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'billing.json'),
	BETTERPPTX_DURABLE_OPERATION_STORE: 'local',
	BETTERPPTX_OPERATION_STORE_FILE: path.join(root, 'operations.json'),
	BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_FORCE_PLAN: 'free', BETTERPPTX_PREMIUM: '0',
	BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: '2',
	BETTERPPTX_FREE_IDENTITY_MEDIA_PER_WINDOW: '2',
})
const { reserveFreeValue, commitFreeValue, releaseFreeValue, getFreeValueStatus } = await import('../auth/entitlements.mjs')
const { createInstallUsageStore } = await import('../auth/install-identity.mjs')
const { createOperationStore, digestOperationPayload } = await import('../storage/operation-store.mjs')
const save = 'betterpptx.deck.save'

test('a completed publication remains discoverable by its owner-bound idempotency key', async () => {
	const store = createOperationStore()
	const input = {
		installHash: contextFor('lookup-owner').installHash,
		toolName: save,
		deckId: 'deck_lookup',
		idempotencyKey: 'lookup-save-01',
		inputDigest: digestOperationPayload({ deckId: 'deck_lookup' }),
	}
	const created = await store.createOrGetOperation(input)
	assert.equal(created.created, true)
	assert.equal((await store.findOperationByIdempotencyKey(input))?.operationId, created.operation.operationId)
	assert.equal(await store.findOperationByIdempotencyKey({ ...input, installHash: contextFor('other-owner').installHash }), null)
	assert.equal(await store.findOperationByIdempotencyKey({ ...input, idempotencyKey: 'another-save' }), null)
})
const contextFor = label => ({
	installHash: `install_${createHash('sha256').update(label).digest('hex')}`,
	authenticated: true, sessionId: 'issued-first-session',
})
const saved = async (context, args, tool = save) => {
	const reservation = await reserveFreeValue(tool, args, context)
	assert.equal((await commitFreeValue(reservation)).ok, true)
	return reservation
}
test.after(() => {
	assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
	assert.ok(path.basename(root).startsWith('betterpptx-quota-replay-'))
	fs.rmSync(root, { recursive: true, force: true })
})

test('stable-account durable operations already reject changed requests under one key', async () => {
	const store = createOperationStore()
	const context = contextFor('durable')
	const first = { installHash: context.installHash, toolName: save, idempotencyKey: 'same-key', deckId: 'deck-a', inputDigest: digestOperationPayload({ deckId: 'deck-a' }) }
	await store.createOrGetOperation(first)
	assert.equal((await store.createOrGetOperation({ ...first, sessionId: 'other-session' })).created, false)
	await assert.rejects(store.createOrGetOperation({ ...first, deckId: 'deck-b', inputDigest: digestOperationPayload({ deckId: 'deck-b' }) }), { code: 'OPERATION_IDEMPOTENCY_CONFLICT' })
})

test('a committed save key cannot fund a different deck after the account allowance is exhausted', async () => {
	const context = contextFor('changed-deck')
	await saved(context, { idempotencyKey: 'shared-key', deckId: 'deck-a', deckVersion: 1 })
	await saved(context, { idempotencyKey: 'second-key', deckId: 'deck-b', deckVersion: 1 })
	const before = await getFreeValueStatus(save, {}, context)
	assert.equal(before.remaining, 0)
	await assert.rejects(reserveFreeValue(save, { idempotencyKey: 'shared-key', deckId: 'deck-c', deckVersion: 1 }, { ...context, sessionId: 'reconnected' }), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
	const after = await getFreeValueStatus(save, {}, context)
	assert.equal(after.used, 2)
	assert.equal(after.reserved, 0)
})

test('different requests sharing a key reserve independent slots atomically', async () => {
	const context = contextFor('concurrent')
	const attempts = await Promise.allSettled([1, 2, 3].map(index => reserveFreeValue(save, {
		idempotencyKey: 'shared-key', deckId: `deck-${index}`, deckVersion: 1,
	}, context)))
	const accepted = attempts.filter(item => item.status === 'fulfilled').map(item => item.value)
	assert.equal(accepted.length, 2)
	assert.equal(attempts.find(item => item.status === 'rejected')?.reason.code, 'FREE_VALUE_QUOTA_EXHAUSTED')
	assert.notEqual(accepted[0].request.reservationId, accepted[1].request.reservationId)
	await releaseFreeValue(accepted[0])
	assert.equal((await getFreeValueStatus(save, {}, context)).reserved, 1)
	await commitFreeValue(accepted[1])
	const after = await getFreeValueStatus(save, {}, context)
	assert.equal(after.used, 1)
	assert.equal(after.reserved, 0)
})

test('exact retries canonicalize property order and key aliases across sessions and cold reload', async () => {
	const context = contextFor('exact-retry')
	const args = { deckId: 'deck-a', deckVersion: 4, options: { alpha: 1, beta: [2, 3] }, idempotencyKey: 'same-key' }
	const first = await saved(context, args)
	await saved(context, { deckId: 'deck-b', idempotencyKey: 'other-key' })
	const reordered = { idempotency_key: ' same-key ', options: { beta: [2, 3], alpha: 1 }, deckVersion: 4, deckId: 'deck-a' }
	const replay = await reserveFreeValue(save, reordered, { ...context, sessionId: 'new-session' })
	assert.equal(replay.status, 'committed')
	assert.equal(replay.request.reservationId, first.request.reservationId)
	assert.equal((await commitFreeValue(replay)).used, 2)
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
		import { reserveFreeValue } from ${JSON.stringify(new URL('../auth/entitlements.mjs', import.meta.url).href)};
		let input = ''; for await (const chunk of process.stdin) input += chunk;
		const { tool, args, context } = JSON.parse(input);
		const result = await reserveFreeValue(tool, args, context);
		process.stdout.write(JSON.stringify({ status: result.status, used: result.snapshot.used, reservationId: result.request.reservationId }));
	`], { input: JSON.stringify({ tool: save, args: reordered, context }), encoding: 'utf8', timeout: 15000 })
	assert.equal(child.status, 0, child.stderr || child.error?.message)
	assert.deepEqual(JSON.parse(child.stdout), { status: 'committed', used: 2, reservationId: first.request.reservationId })
})

test('deck revision, output format and nested request content cannot borrow a committed slot', async () => {
	const original = { idempotencyKey: 'shared-key', deckId: 'deck-a', deckVersion: 1, format: 'pptx', spec: { slides: [{ text: 'first' }], idempotencyKey: 'authored-field' } }
	const variants = [
		{ ...original, deckVersion: 2 }, { ...original, format: 'potx' },
		{ ...original, spec: { ...original.spec, slides: [{ text: 'different' }] } },
		{ ...original, spec: { ...original.spec, idempotencyKey: 'different-authored-field' } },
	]
	for (const [index, args] of variants.entries()) {
		const context = contextFor(`variant-${index}`)
		await saved(context, original)
		await saved(context, { idempotencyKey: 'other-key', deckId: 'other' })
		await assert.rejects(reserveFreeValue(save, args, context), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
	}
})

test('identity-media source changes and source ordering have independent quota bindings', async () => {
	for (const tool of ['betterpptx.avatar.render_job', 'betterpptx.assets.generate_rigged3d']) {
		const context = contextFor(tool)
		const original = { idempotencyKey: 'shared-key', imageHandles: ['asset://front', 'asset://side'], audioHandle: 'asset://audio-a' }
		await saved(context, original, tool)
		await saved(context, { ...original, idempotencyKey: 'other-key' }, tool)
		for (const changed of [{ ...original, audioHandle: 'asset://audio-b' }, { ...original, imageHandles: [...original.imageHandles].reverse() }]) {
			await assert.rejects(reserveFreeValue(tool, changed, context), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
		}
	}
})

test('legacy unbound commitments remain counted and are never adopted as request-bound replays', async () => {
	const context = contextFor('legacy')
	const store = createInstallUsageStore()
	const request = { category: 'deck-publication', limit: 2, reservationId: `${save}:legacy-key` }
	await store.reserveRollingUsage(context.installHash, request)
	await store.commitRollingUsage(context.installHash, request)
	await saved(context, { idempotencyKey: 'other-key', deckId: 'deck-b' })
	await assert.rejects(reserveFreeValue(save, { idempotencyKey: 'legacy-key', deckId: 'new-deck' }, context), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
	assert.equal((await getFreeValueStatus(save, {}, context)).used, 2)
})
