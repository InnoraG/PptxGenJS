import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'

// Real MCP admission/compiler/worker with the real operation-store factory.
// Only Firestore is replaced; failures occur at completion, after admission and
// mutation, not at a synthetic engine source check. No provider or cloud access.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-persistence-failure-'))
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_PREMIUM: '0',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_REQUIRE_QUOTE_BINDING: '1',
	BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0', BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
	BETTERPPTX_DURABLE_OPERATION_STORE: 'firestore', BETTERPPTX_FIRESTORE_OPERATION_PREFIX: 'persistence_fixture',
	BETTERPPTX_GCP_PROJECT: 'synthetic-project', BETTERPPTX_FIRESTORE_DATABASE: 'synthetic-database',
	BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '1',
	BETTERPPTX_OPERATION_EXECUTION_MODE: 'queued', BETTERPPTX_OPERATION_DISPATCHER: 'inline',
	BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH: '0',
	BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0', BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local',
	BETTERPPTX_DECK_STATE_FILE: path.join(root, 'decks.json'),
	BETTERPPTX_DECK_SNAPSHOT_STORE: 'local', BETTERPPTX_DECK_SNAPSHOT_DIR: path.join(root, 'specs'),
	BETTERPPTX_ARTIFACT_STORE: 'local', BETTERPPTX_PUBLIC_BASE: '',
	BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'),
	BETTERPPTX_LOCKED_ASSET_STORE: 'local', BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'locked'),
	BETTERPPTX_LOCKED_ASSET_SHARED_DIR: path.join(root, 'shared-locked'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'billing.json'),
	BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
	BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
	BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root,
	BETTERPPTX_USAGE_AUTO_FLUSH: '0', BETTERPPTX_LOG: '',
})

const mockUrl = `data:text/javascript,${encodeURIComponent(`
	export const documents = new Map()
	export const state = { fault: null, completionAttempts: 0, injected: 0, committedSuccesses: 0 }
	export const rawMessage = 'Firestore @google-cloud/firestore Cannot use undefined result.billing.specEstimate.operations[0].objectName at /srv/private/dependency.js; ignoreUndefinedProperties'
	function strictJson(value) {
		if (value === null || typeof value === 'string' || typeof value === 'boolean') return
		if (typeof value === 'number' && Number.isFinite(value)) return
		if (!value || typeof value !== 'object' || value instanceof Date) throw new Error(rawMessage)
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) strictJson(value[i])
		} else for (const item of Object.values(value)) strictJson(item)
	}
	const snapshot = key => ({ exists: documents.has(key), data: () => structuredClone(documents.get(key)) })
	export class Firestore {
		constructor(options) { if ('ignoreUndefinedProperties' in options) throw new Error('Global suppression forbidden') }
		settings() { throw new Error('Global settings forbidden') }
		collection(name) { return { doc: id => ({ path: name + '/' + id, get: async () => snapshot(name + '/' + id) }) } }
		async runTransaction(callback) {
			const pending = new Map()
			const tx = {
				get: async ref => snapshot(ref.path),
				create: (ref, value) => {
					strictJson(value)
					if (documents.has(ref.path) || pending.has(ref.path)) throw new Error('Create precondition failed')
					pending.set(ref.path, structuredClone(value))
				},
				set: (ref, value, options) => {
					strictJson(value)
					if (options.merge !== false) throw new Error('Fenced replacement required')
					pending.set(ref.path, structuredClone(value))
				},
			}
			const result = await callback(tx)
			const success = [...pending.values()].find(value => value.state === 'succeeded')
			let fault = null
			if (success) {
				state.completionAttempts++
				if (state.fault?.operationId === success.operationId) {
					fault = state.fault; state.fault = null; state.injected++
					if (documents.get('persistence_fixture_operations/' + success.operationId)?.state !== 'running') throw new Error('Fault must follow admission and lease')
				}
			}
			const providerError = () => {
				const error = new Error(rawMessage)
				if (fault.code !== undefined) error.code = fault.code
				return error
			}
			if (fault?.mode === 'before-commit') throw providerError()
			for (const [key, value] of pending) documents.set(key, value)
			if (success) state.committedSuccesses++
			if (fault?.mode === 'lost-ack') throw providerError()
			return result
		}
	}
`)}`
const engineUrl = new URL('../engine.mjs', import.meta.url).href
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		return specifier === '@google-cloud/firestore' ? { url: mockUrl, shortCircuit: true } : nextResolve(specifier, context)
	},
	load(url, context, nextLoad) {
		const loaded = nextLoad(url, context)
		// Runtime visibility only; no production engine modification/export.
		return url === engineUrl ? { ...loaded, source: String(loaded.source) + '\nexport { completeDurableOperation as completeForTest, buildToolErrorResult as errorForTest, _operationStore as storeForTest }\n' } : loaded
	},
})
const { createMcpToolDispatcher, runDurableOperationById, getDeck, completeForTest, errorForTest, storeForTest } = await import('../engine.mjs')
const { withResourceAuthorization } = await import('../auth/resource-authorization.mjs')
const { documents, state, rawMessage } = await import(mockUrl)
const ownerContext = { installHash: `install_${'a'.repeat(64)}`, sessionId: 'persistence-fixture-owner', blackBox: true }
const owner = createMcpToolDispatcher(ownerContext)
const foreign = createMcpToolDispatcher({ ...ownerContext, installHash: `install_${'b'.repeat(64)}` })
const code = 'OPERATION_RESULT_PERSISTENCE_FAILED'

test.after(async () => {
	hooks.deregister()
	assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
	assert.ok(path.basename(root).startsWith('betterpptx-persistence-failure-'))
	await fs.rm(root, { recursive: true, force: true })
})

function assertPublicSafe(value) {
	const serialized = JSON.stringify(value)
	for (const secret of ['Firestore', '@google-cloud', 'result.billing.specEstimate.operations[0].objectName', '/srv/private', 'ignoreUndefinedProperties']) {
		assert.ok(!serialized.includes(secret), `Public provider detail leaked: ${secret}`)
	}
	assert.ok(!serialized.includes(rawMessage))
}

function assertUnconfirmed(value, operationId) {
	assertPublicSafe(value)
	assert.equal(value.operationId, operationId)
	assert.equal(value.state, 'failed')
	assert.equal(value.error?.code, code)
	assert.equal(value.executionState, 'unconfirmed')
	assert.equal(value.artifact_state, 'unchanged_or_unknown')
	assert.equal(value.retry_safe, false)
	assert.equal(value.next?.tool, 'betterpptx.operation.status')
	assert.equal(value.next?.type, 'recover_operation')
	assert.ok(!JSON.stringify(value).includes('new_idempotency_key'))
}

async function queue(key) {
	const args = {
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1', title: key, layout: 'LAYOUT_WIDE',
			authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete',
				geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
			validation: { validateBeforeSave: true, requireAccessibility: true },
			slides: [{ id: 'decision', background: { color: 'FFFFFF' }, content: [
				{ kind: 'textBox', name: 'headline', text: 'Preserve the original mutation outcome.', rect: { x: 1, y: 1, w: 10, h: 1 },
					style: { fontFace: 'Arial', fontSize: 28, color: '172033' } },
			] }],
		},
		phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full', idempotencyKey: key,
	}
	const { idempotencyKey, ...toolArgs } = args
	const estimate = await owner.call('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.generate_from_spec', toolArgs })
	assert.equal(estimate.ok, true, JSON.stringify(estimate))
	assert.ok(estimate.data.quoteBinding?.quoteId)
	args.quoteBinding = structuredClone(estimate.data.quoteBinding)
	const admitted = await owner.call('betterpptx.deck.generate_from_spec', args)
	assert.equal(admitted.error?.code, 'OPERATION_PENDING', JSON.stringify(admitted))
	const operationId = admitted.error.details.operationId
	const stored = documents.get('persistence_fixture_operations/' + operationId)
	assert.equal(stored.state, 'queued')
	assert.equal(stored.attempt, 0)
	assert.equal(stored.installHash, ownerContext.installHash)
	assert.deepEqual(stored.request.args, args)
	return { args, operationId }
}

async function deckHeads() {
	try { return JSON.parse(await fs.readFile(path.join(root, 'decks.json'), 'utf8')).decks || {} }
	catch (error) { if (error.code === 'ENOENT') return {}; throw error }
}

for (const [label, providerCode] of [['uncoded-validation', undefined], ['numeric-provider-3', 3], ['numeric-provider-4', 4], ['numeric-provider-14', 14], ['string-provider', 'UNAVAILABLE']]) {
	test(`${label} completion failure: safe public envelope keeps owned recovery ID and forbids blind retry`, async () => {
		const created = await storeForTest.createOrGetOperation({ installHash: ownerContext.installHash,
			toolName: 'betterpptx.deck.generate_from_spec', idempotencyKey: `envelope-${label}`, inputDigest: label })
		const operationId = created.operation.operationId
		const claim = await storeForTest.claimOperation(operationId, { leaseOwner: 'envelope-fixture' })
		state.fault = { operationId, mode: 'before-commit', code: providerCode }
		let caught
		try { await completeForTest(claim, { deckId: 'deck_already_materialized', billing: { specEstimate: { operations: [{ objectName: undefined }] } } }) }
		catch (error) { caught = error }
		assert.ok(caught, 'the completion transaction must fail')
		const envelope = errorForTest(caught, 'betterpptx.deck.generate_from_spec', {})
		assertPublicSafe(envelope)
		assert.equal(envelope.ok, false)
		assert.equal(envelope.error.code, code)
		assert.equal(envelope.error.details.operationId, operationId)
		assert.equal(envelope.error.artifact_state, 'unchanged_or_unknown')
		assert.equal(envelope.error.retry_safe, false)
		assert.equal(envelope.error.next_actions[0].tool, 'betterpptx.operation.status')
		assert.deepEqual(envelope.error.next_actions[0].input, { operationId })
		assert.equal((await storeForTest.getOperation(operationId)).state, 'running', 'failed recording is not evidence of rollback')
	})
}

for (const [label, providerCode] of [['uncoded', undefined], ['numeric-coded', 14]]) {
	test(`${label} queued completion rejection: terminal status remains unconfirmed; owner replay never reruns mutation`, async () => {
		const { args, operationId } = await queue(`worker-${label}-persistence`)
		const before = await deckHeads()
		const attempts = state.completionAttempts
		state.fault = { operationId, mode: 'before-commit', code: providerCode }
		const status = await runDurableOperationById(operationId, { leaseOwner: 'persistence-failure-worker' })
		const after = await deckHeads()
		const newIds = Object.keys(after).filter(id => !Object.hasOwn(before, id))
		assert.equal(newIds.length, 1, 'failure is injected only after a real native deck mutation')
		withResourceAuthorization(ownerContext, () => assert.equal(getDeck(newIds[0]).pptx.slides.length, 1))
		assert.equal(state.completionAttempts, attempts + 1)
		assertUnconfirmed(status, operationId)
		const observed = await owner.call('betterpptx.operation.status', { operationId })
		assert.equal(observed.ok, true)
		assertUnconfirmed(observed.data, operationId)
		const denied = await foreign.call('betterpptx.operation.status', { operationId })
		assert.equal(denied.error?.code, 'OPERATION_NOT_FOUND')
		assertPublicSafe(denied)
		const repeated = await runDurableOperationById(operationId, { leaseOwner: 'replacement-worker' })
		assertUnconfirmed(repeated, operationId)
		const replay = await owner.call('betterpptx.deck.generate_from_spec', args)
		assert.equal(replay.ok, false)
		assertPublicSafe(replay)
		assert.equal(replay.error.code, code)
		assert.equal(replay.error.details.operationId, operationId)
		assert.equal(replay.error.retry_safe, false)
		assert.equal(state.completionAttempts, attempts + 1, 'neither terminal worker nor same-key MCP replay may complete a second mutation')
		assert.equal((await storeForTest.getOperation(operationId)).attempt, 1)
		assert.deepEqual(await deckHeads(), after)
	})
}

test('lost completion acknowledgement: known persisted success wins and same-key replay never repeats the mutation', async () => {
	const { args, operationId } = await queue('lost-completion-ack')
	const before = await deckHeads()
	const attempts = state.completionAttempts
	const successes = state.committedSuccesses
	state.fault = { operationId, mode: 'lost-ack', code: 14 }
	const status = await runDurableOperationById(operationId, { leaseOwner: 'lost-ack-worker' })
	assert.equal(status.state, 'succeeded', JSON.stringify(status))
	assertPublicSafe(status)
	assert.ok(status.result?.deckId)
	assert.equal(status.error, undefined)
	assert.equal(state.completionAttempts, attempts + 1)
	assert.equal(state.committedSuccesses, successes + 1)
	const after = await deckHeads()
	assert.deepEqual(Object.keys(after).filter(id => !Object.hasOwn(before, id)), [status.result.deckId])
	const original = await storeForTest.getOperation(operationId)
	assert.equal(original.attempt, 1)
	assert.equal(original.error, null)
	const observed = await owner.call('betterpptx.operation.status', { operationId })
	assert.equal(observed.data.state, 'succeeded')
	assert.equal(observed.data.result.deckId, status.result.deckId)
	const repeated = await runDurableOperationById(operationId, { leaseOwner: 'second-lost-ack-worker' })
	assert.equal(repeated.result.deckId, status.result.deckId)
	const reconnect = createMcpToolDispatcher({ ...ownerContext, sessionId: 'fresh-lost-ack-observer' })
	const recovered = await reconnect.call('betterpptx.deck.generate_from_spec', args)
	assert.equal(recovered.ok, true, JSON.stringify(recovered))
	assert.equal(recovered.data.deckId, status.result.deckId)
	assertPublicSafe(recovered)
	const replay = await owner.call('betterpptx.deck.generate_from_spec', args)
	assert.equal(replay.ok, true, JSON.stringify(replay))
	assert.equal(replay.data.deckId, status.result.deckId)
	assertPublicSafe(replay)
	assert.deepEqual(await storeForTest.getOperation(operationId), original)
	assert.equal(state.completionAttempts, attempts + 1)
	assert.equal(state.committedSuccesses, successes + 1)
	assert.deepEqual(await deckHeads(), after)
})
