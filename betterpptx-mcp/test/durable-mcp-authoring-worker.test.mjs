import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

// Real MCP admission, persisted JSON request, queued worker and native compiler.
// All stores are disposable/local; no payments, providers or reference files.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-mcp-worker-'))
const operationFile = path.join(root, 'operations.json')
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_PREMIUM: '0',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_REQUIRE_QUOTE_BINDING: '1',
	BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0', BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
	BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0', BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local',
	BETTERPPTX_DECK_STATE_FILE: path.join(root, 'decks.json'),
	BETTERPPTX_DURABLE_OPERATION_STORE: 'local', BETTERPPTX_OPERATION_STORE_FILE: operationFile,
	BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '1',
	BETTERPPTX_OPERATION_EXECUTION_MODE: 'queued', BETTERPPTX_OPERATION_DISPATCHER: 'inline',
	BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH: '0',
	BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'),
	BETTERPPTX_LOCKED_ASSET_STORE: 'local', BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'locked'),
	BETTERPPTX_LOCKED_ASSET_SHARED_DIR: path.join(root, 'shared-locked'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'billing.json'),
	BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'), BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
	BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root,
	BETTERPPTX_USAGE_AUTO_FLUSH: '0', BETTERPPTX_LOG: '',
})

const { createMcpToolDispatcher, callBetterPptxTool, runDurableOperationById, getDeck } = await import('../engine.mjs')
const { withResourceAuthorization } = await import('../auth/resource-authorization.mjs')
const { createOperationStore } = await import('../storage/operation-store.mjs')
const ownerContext = { installHash: `install_${'a'.repeat(64)}`, sessionId: 'queued-author-owner' }
const foreignContext = { installHash: `install_${'b'.repeat(64)}`, sessionId: 'queued-author-foreign' }
const owner = createMcpToolDispatcher({ ...ownerContext, blackBox: true })
const foreign = createMcpToolDispatcher({ ...foreignContext, blackBox: true })

function exactSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Queued native authoring', layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete',
			geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches',
		},
		validation: { validateBeforeSave: true, requireAccessibility: true },
		slides: [{ id: 'decision', background: { color: 'FFFFFF' }, content: [
			{ kind: 'textBox', name: 'headline', text: 'The queued worker preserves this exact statement.', rect: { x: 1.12, y: 1.24, w: 10.81, h: 1.32 }, style: { fontFace: 'Arial', fontSize: 28, color: '172033' } },
		] }],
	}
}

function commitArgs(key) {
	return { spec: exactSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full', idempotencyKey: key }
}

async function records() {
	try { return JSON.parse(await fs.readFile(operationFile, 'utf8')).operations || {} }
	catch (error) { if (error.code === 'ENOENT') return {}; throw error }
}

function dataOf(result, label) {
	assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.error || result)}`)
	return result.data || result
}

async function quoteFor(args) {
	const { quoteBinding: ignored, idempotencyKey, ...toolArgs } = args
	const data = dataOf(await owner.call('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.generate_from_spec', toolArgs }), 'exact commit quote')
	assert.ok(data.quoteBinding?.quoteId)
	return structuredClone(data.quoteBinding)
}

async function coldReplay(args) {
	const engineUrl = new URL('../engine.mjs', import.meta.url).href
	const source = `
		const { createMcpToolDispatcher } = await import(${JSON.stringify(engineUrl)});
		let input = ''; for await (const chunk of process.stdin) input += chunk;
		const { args, context } = JSON.parse(input);
		const mcp = createMcpToolDispatcher({ ...context, sessionId: 'cold-author-replay', blackBox: true });
		const replay = await mcp.call('betterpptx.deck.generate_from_spec', args);
		const changed = structuredClone(args);
		changed.spec.slides[0].content[0].text = 'A different request must not reuse the key.';
		const conflict = await mcp.call('betterpptx.deck.generate_from_spec', changed);
		console.log('COLD_REPLAY ' + JSON.stringify({ replay, conflict }));
	`
	const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
		env: { ...process.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
	})
	let stdout = '', stderr = ''
	child.stdout.on('data', chunk => { stdout += chunk })
	child.stderr.on('data', chunk => { stderr += chunk })
	child.stdin.end(JSON.stringify({ args, context: ownerContext }))
	const exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
	assert.equal(exitCode, 0, stderr)
	const marker = stdout.split(/\r?\n/).find(line => line.startsWith('COLD_REPLAY '))
	assert.ok(marker, stdout)
	return JSON.parse(marker.slice('COLD_REPLAY '.length))
}

async function queue(args) {
	const result = await owner.call('betterpptx.deck.generate_from_spec', args)
	assert.equal(result.ok, false)
	assert.equal(result.error?.code, 'OPERATION_PENDING', JSON.stringify(result.error || result))
	const operationId = result.error.details.operationId
	assert.match(operationId, /^op_[0-9a-f]{32}$/)
	const stored = (await records())[operationId]
	assert.equal(stored.state, 'queued')
	assert.deepEqual(stored.request.args, args, 'the actual queued request must survive JSON serialization unchanged')
	assert.equal(stored.request.context.installHash, ownerContext.installHash)
	assert.equal(Object.getOwnPropertySymbols(stored.request.context).length, 0)
	assert.ok(!JSON.stringify(stored.request.context).includes('MCP_AUTHORING_CAPABILITY'))
	return operationId
}

test.after(async () => {
	// Validate the disposable target before recursive cleanup.
	assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
	assert.ok(path.basename(root).startsWith('betterpptx-mcp-worker-'))
	await fs.rm(root, { recursive: true, force: true })
})

test('direct-engine authoring stays denied, including forged string flags and look-alike Symbols', async () => {
	const before = Object.keys(await records()).length
	const contexts = [
		ownerContext,
		{ ...ownerContext, transport: 'mcp', MCP_AUTHORING_CAPABILITY: true, mcpAuthoringAuthorized: true },
		{ ...ownerContext, __durableOperationWorker: true, __skipDurableOperationLedger: true, __specCompiler: true },
		{ ...ownerContext, [Symbol('betterpptx.mcp-authoring-capability')]: true },
		{ ...ownerContext, [Symbol.for('betterpptx.mcp-authoring-capability')]: true },
	]
	for (const context of contexts) {
		const result = await callBetterPptxTool('betterpptx.deck.generate_from_spec', commitArgs('forged-direct-authoring'), context)
		assert.equal(result.ok, false)
		assert.equal(result.error?.code, 'MCP_AUTHORING_PIPELINE_REQUIRED', JSON.stringify(result))
	}
	const primitive = await callBetterPptxTool('betterpptx.deck.new', { title: 'Denied direct primitive' }, ownerContext)
	assert.equal(primitive.error?.code, 'MCP_AUTHORING_PIPELINE_REQUIRED')
	assert.equal(Object.keys(await records()).length, before, 'rejected direct calls must not allocate operations')
})

test('actual queued MCP generate executes and cold-replays under its owner with a full issued quote (billing enforcement off)', async () => {
	const args = commitArgs('queued-exact-authoring')
	args.quoteBinding = await quoteFor(args)
	const operationId = await queue(args)
	const foreignPending = await foreign.call('betterpptx.operation.status', { operationId })
	assert.equal(foreignPending.error?.code, 'OPERATION_NOT_FOUND')
	const worker = await runDurableOperationById(operationId, { leaseOwner: 'native-author-worker' })
	assert.equal(worker.state, 'succeeded', `Queued generation did not execute: ${JSON.stringify(worker.error || worker)}`)
	assert.ok(worker.result?.deckId)
	assert.equal(worker.result.phase, 'commit')
	assert.equal(worker.result.billing?.quoteId, args.quoteBinding.quoteId)
	const status = dataOf(await owner.call('betterpptx.operation.status', { operationId }), 'owner completed status')
	assert.equal(status.state, 'succeeded')
	assert.equal(status.result.deckId, worker.result.deckId)
	withResourceAuthorization(ownerContext, () => {
		const deck = getDeck(worker.result.deckId)
		assert.equal(deck.pptx.slides.length, 1)
		assert.ok(deck.pptx.slides[0]._slideObjects.some(object => JSON.stringify(object.text).includes(args.spec.slides[0].content[0].text)))
	})
	assert.throws(() => withResourceAuthorization(foreignContext, () => getDeck(worker.result.deckId)), { code: 'DECK_EXPIRED_OR_UNKNOWN' })
	const foreignCompleted = await foreign.call('betterpptx.operation.status', { operationId })
	assert.equal(foreignCompleted.error?.code, 'OPERATION_NOT_FOUND')
	const reconnect = createMcpToolDispatcher({ ...ownerContext, sessionId: 'queued-author-reconnected', blackBox: true })
	const replay = dataOf(await reconnect.call('betterpptx.deck.generate_from_spec', args), 'same-owner identical replay')
	assert.equal(replay.deckId, worker.result.deckId)
	assert.equal(replay.idempotentReplay, true, 'same-process replay may use the earlier session idempotency cache')
	const cold = await coldReplay(args)
	const durableReplay = dataOf(cold.replay, 'cold durable replay')
	assert.equal(durableReplay.deckId, worker.result.deckId)
	assert.equal(durableReplay.durableOperation.operationId, operationId)
	assert.equal(durableReplay.durableOperation.replay, true)
	assert.equal(cold.conflict.error?.code, 'OPERATION_IDEMPOTENCY_CONFLICT')
	const repeatWorker = await runDurableOperationById(operationId, { leaseOwner: 'second-worker' })
	assert.equal(repeatWorker.result.deckId, worker.result.deckId)
	assert.equal((await records())[operationId].attempt, 1, 'terminal replay must not execute the compiler twice')
	const changed = structuredClone(args)
	changed.spec.slides[0].content[0].text = 'A different request must not reuse the key.'
	const conflict = await owner.call('betterpptx.deck.generate_from_spec', changed)
	assert.equal(conflict.error?.code, 'IDEMPOTENCY_CONFLICT')
	assert.equal((await records())[operationId].result.deckId, worker.result.deckId)
})

test('inconsistent persisted request identity is rejected before claiming or executing the worker', async () => {
	const args = commitArgs('stored-owner-mismatch')
	const stored = await createOperationStore().createOrGetOperation({
		installHash: ownerContext.installHash, toolName: 'betterpptx.deck.generate_from_spec',
		idempotencyKey: args.idempotencyKey, inputDigest: 'a'.repeat(64),
		request: { args, context: { ...foreignContext } },
	})
	await assert.rejects(() => runDurableOperationById(stored.operation.operationId, { leaseOwner: 'identity-mismatch-worker' }), {
		code: 'OPERATION_REQUEST_IDENTITY_MISMATCH',
	})
	const unchanged = (await records())[stored.operation.operationId]
	assert.equal(unchanged.state, 'queued')
	assert.equal(unchanged.attempt, 0)
	assert.equal(unchanged.result?.deckId, undefined)
})

test('trusted queued worker still rejects missing and tampered exact-spec quotes before creating a deck', async () => {
	const missingArgs = commitArgs('queued-missing-quote')
	const missingId = await queue(missingArgs)
	const missing = await runDurableOperationById(missingId, { leaseOwner: 'missing-quote-worker' })
	assert.equal(missing.state, 'failed')
	assert.equal(missing.error?.code, 'QUOTE_BINDING_REQUIRED', JSON.stringify(missing))
	assert.equal((await records())[missingId].result?.deckId, undefined)
	const tamperedArgs = commitArgs('queued-tampered-quote')
	tamperedArgs.quoteBinding = await quoteFor(tamperedArgs)
	tamperedArgs.quoteBinding.planDigest = '0'.repeat(64)
	const tamperedId = await queue(tamperedArgs)
	const tampered = await runDurableOperationById(tamperedId, { leaseOwner: 'tampered-quote-worker' })
	assert.equal(tampered.state, 'failed')
	assert.equal(tampered.error?.code, 'QUOTE_BINDING_MISMATCH', JSON.stringify(tampered))
	assert.equal((await records())[tamperedId].result?.deckId, undefined)
})
