import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-resource-isolation-'))
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_BILLING_PROVIDER: '', BETTERPPTX_FORCE_PLAN: 'premium',
	BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root, BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'ledger.json'),
	BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'asset-grants'),
	BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
	BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_LOG: '',
})
const { createMcpToolDispatcher, callBetterPptxTool } = await import('../engine.mjs')
test.after(async () => { await fs.rm(root, { recursive: true, force: true }) })

test('public deck handles, listings, readback and disposal remain owned on warm caches and reconnect', async () => {
	const aliceId = `install_${'a'.repeat(64)}`, bobId = `install_${'b'.repeat(64)}`
	const alice = createMcpToolDispatcher({ installHash: aliceId, sessionId: 'alice-connection', __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const bob = createMcpToolDispatcher({ installHash: bobId, sessionId: 'bob-connection', __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Private ownership fixture',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Owner', outcome: 'Keep this private.', remember: 'Ownership is required.' },
		visualDesign: { world: 'Editorial', framing: 'One message.' }, styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static clock' },
		slides: [{ id: 'one', title: 'Private', message: 'Ownership is required.', layoutIntent: 'title-only', content: [{ kind: 'title', name: 'headline', text: 'Ownership is required.' }] }],
	}
	const created = await alice.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', detail: 'summary', idempotencyKey: 'owner-deck' })
	assert.equal(created.ok, true, JSON.stringify(created))
	const deckId = created.data.deckId
	for (const tool of ['betterpptx.deck.summary', 'betterpptx.deck.export_spec', 'betterpptx.deck.dispose']) {
		const denied = await bob.call(tool, { deckId })
		assert.equal(denied.ok, false, JSON.stringify(denied))
		assert.equal(denied.error.code, 'DECK_EXPIRED_OR_UNKNOWN')
	}
	const foreignEstimate = await bob.call('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.save', toolArgs: { deckId } })
	assert.equal(foreignEstimate.ok, false)
	assert.equal(foreignEstimate.error.code, 'DECK_EXPIRED_OR_UNKNOWN')
	const bobList = await bob.call('betterpptx.deck.recent', {})
	assert.equal(bobList.ok, true, JSON.stringify(bobList))
	assert.equal(bobList.data.decks.some(item => item.deckId === deckId), false)
	const reconnected = await alice.call('betterpptx.deck.export_spec', { deckId }, { sessionId: 'new-alice-connection' })
	assert.equal(reconnected.ok, true, JSON.stringify(reconnected))
	assert.equal(JSON.stringify(reconnected).includes('betterpptx.resource-owner.v1'), false, 'private ownership records must not leak into results')
	assert.equal((await alice.call('betterpptx.deck.dispose', { deckId })).ok, true)
})

test('anonymous discovery remains available but resource access needs a server-bound identity', async () => {
	const discovery = await callBetterPptxTool('betterpptx.help.capabilities', {}, {})
	assert.equal(discovery.ok, true, JSON.stringify(discovery))
	const access = await callBetterPptxTool('betterpptx.deck.summary', { deckId: 'deck_any' }, {})
	assert.equal(access.ok, false)
	assert.equal(access.error.code, 'RESOURCE_IDENTITY_REQUIRED')
	const reserved = await callBetterPptxTool('betterpptx.help.capabilities', { nested: { __durableRehydrate: true } }, { sessionId: 'test-reserved-guard' })
	assert.equal(reserved.ok, false)
	assert.equal(reserved.error.code, 'INVALID_ARGUMENTS')
	const pricing = await callBetterPptxTool('price-listing', { toolArgs: { deckId: 'deck_any' } }, {})
	assert.equal(pricing.ok, false)
	assert.equal(pricing.error.code, 'RESOURCE_IDENTITY_REQUIRED')
})
