import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-cold-replay-'))
Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_ARTIFACT_STORE: 'gcs',
	BETTERPPTX_GCS_BUCKET: 'private-replay-fixture', BETTERPPTX_GCS_PREFIX: 'issued',
	BETTERPPTX_GCS_TEMP_ROOT: root, BETTERPPTX_LOG: '',
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_DURABLE_OPERATION_STORE: 'local',
	BETTERPPTX_OPERATION_STORE_FILE: path.join(root, 'operations.json'),
	BETTERPPTX_OPERATION_EXECUTION_MODE: 'inline', BETTERPPTX_REQUIRE_SHARED_STORES: '0',
})

// Shared private storage survives removal of the instance-local attestation.
// No cloud request, production credential, or production artifact is involved.
const mockStorageUrl = `data:text/javascript,${encodeURIComponent(`
	export const objects = new Map()
	export const counts = { writes: 0, reads: 0, signatures: 0 }
	export class Storage {
		bucket(bucketName) { return { file: objectName => ({
			getMetadata: async () => {
				if (!objects.has(objectName)) throw Object.assign(new Error('missing'), { code: 404 })
				return [objects.get(objectName).metadata]
			},
			save: async (bytes, options) => {
				if (objects.has(objectName) && options.preconditionOpts?.ifGenerationMatch === 0) throw Object.assign(new Error('exists'), { code: 412 })
				counts.writes += 1
				objects.set(objectName, { bytes: Buffer.from(bytes), metadata: { ...options.metadata, generation: '1', size: String(Buffer.byteLength(bytes)) } })
			},
			download: async () => {
				counts.reads += 1
				if (!objects.has(objectName)) throw Object.assign(new Error('missing'), { code: 404 })
				return [objects.get(objectName).bytes]
			},
			getSignedUrl: async options => {
				counts.signatures += 1
				return ['https://signed.example.test/' + bucketName + '/' + objectName.split('/').map(encodeURIComponent).join('/')
					+ '?generation=' + options.queryParams.generation + '&X-Goog-Signature=Mixamo%2BFLUX%2fBaker']
			},
		}) } }
	}
`)}`

const engineUrl = new URL('../engine.mjs', import.meta.url).href
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		return specifier === '@google-cloud/storage' ? { url: mockStorageUrl, shortCircuit: true } : nextResolve(specifier, context)
	},
	load(url, context, nextLoad) {
		const loaded = nextLoad(url, context)
		// Test-only visibility; production exports and public tools stay unchanged.
		return url === engineUrl ? { ...loaded, source: String(loaded.source) + '\nexport { durableOperationSuccessResult as replayForTest, replayCompletedSaveFromDurableLedger as savedReplayForTest, beginDurableOperation as beginReplayForTest, durableOperationInput as operationInputForTest, _operationStore as operationStoreForTest }\n' } : loaded
	},
})
const { replayForTest, savedReplayForTest, beginReplayForTest, operationInputForTest, operationStoreForTest } = await import('../engine.mjs')
const { createArtifactStore, isPublishedArtifactDownloadPair } = await import('../storage/artifact-store.mjs')
const { withResourceAuthorization } = await import('../auth/resource-authorization.mjs')
const { counts } = await import(mockStorageUrl)
const store = createArtifactStore()
const owner = { installHash: `install_${'a'.repeat(64)}`, sessionId: 'cold-replay-owner' }
const otherOwner = { installHash: `install_${'b'.repeat(64)}`, sessionId: 'cold-replay-other' }
const asOwner = fn => withResourceAuthorization(owner, fn)

test.after(async () => {
	hooks.deregister()
	await fs.rm(root, { recursive: true, force: true })
})

async function publishedOperation() {
	return asOwner(async () => {
		const prepared = await store.prepareSaveTarget({ fileName: 'Mixamo.pptx' })
		await fs.writeFile(prepared.target, 'private fixture publication bytes')
		const saved = await store.finalizeSaveTarget(prepared)
		const operation = {
			operationId: `op_${'c'.repeat(32)}`, state: 'succeeded', toolName: 'betterpptx.deck.save',
			result: {
				ok: true, packageSha256: createHash('sha256').update('private fixture publication bytes').digest('hex'),
				downloadUrl: saved.downloadUrl, downloadName: saved.downloadName,
				artifact: { state: 'download_ready', expiresAt: saved.expiresAt, downloadLinkExpiresAt: saved.downloadLinkExpiresAt },
				filePath: prepared.target, objectName: prepared.objectName,
			},
		}
		const recordPath = path.join(root, '.public-delivery-records', `${createHash('sha256').update(saved.downloadUrl).digest('hex')}.json`)
		await fs.unlink(recordPath)
		assert.equal(isPublishedArtifactDownloadPair(saved.downloadUrl, saved.downloadName), false)
		return operation
	})
}

test('cold successful replay recovers owner-bound delivery authority before public sanitization', async () => {
	const operation = await publishedOperation()
	const original = structuredClone(operation)
	const writesBeforeReplay = counts.writes
	const readsBeforeReplay = counts.reads
	const result = await asOwner(() => replayForTest(operation, 'betterpptx.deck.save'))
	assert.equal(result.ok, true)
	assert.equal(result.data.downloadUrl, original.result.downloadUrl, 'signed URL bytes must survive exact replay')
	assert.equal(result.data.downloadName, original.result.downloadName)
	assert.equal(result.data.packageSha256, original.result.packageSha256)
	assert.equal(result.data.artifact.expiresAt, original.result.artifact.expiresAt)
	assert.equal(result.data.artifact.downloadLinkExpiresAt, original.result.artifact.downloadLinkExpiresAt)
	assert.ok(counts.reads > readsBeforeReplay, 'a cold instance must load shared delivery authority')
	assert.equal(counts.writes, writesBeforeReplay, 'recovery must not republish the artifact or rewrite immutable authority')
	assert.equal(result.data.durableOperation.replay, true)
	assert.equal(result.data.filePath, undefined)
	assert.equal(result.data.objectName, undefined)
	assert.deepEqual(operation, original, 'recovery must not mutate the persisted success record')
})

test('foreign owner cannot restore a cold saved link or receive private storage details', async () => {
	const operation = await publishedOperation()
	const result = await withResourceAuthorization(otherOwner, () => replayForTest(operation, 'betterpptx.deck.save'))
	assert.equal(result.ok, true, 'the publication remains succeeded even when delivery is unavailable')
	assert.equal(result.data.downloadUrl, null)
	assert.equal(result.data.artifact.state, 'unavailable')
	assert.equal(result.data.packageSha256, operation.result.packageSha256)
	assert.equal(result.data.filePath, undefined)
	assert.equal(result.data.objectName, undefined)
})

test('all durable success callers await recovery without changing ownership, idempotency, or saved revision', async () => {
	const publication = await publishedOperation()
	const args = { deckId: 'saved-cold-deck', deckVersion: 3, idempotencyKey: 'completed-cold-publication' }
	const input = operationInputForTest('betterpptx.deck.save', args, owner)
	const created = await operationStoreForTest.createOrGetOperation(input)
	const claim = await operationStoreForTest.claimOperation(created.operation.operationId, { leaseOwner: 'replay-fixture' })
	const completed = await operationStoreForTest.completeOperation(created.operation.operationId, {
		leaseToken: claim.lease.leaseToken, result: { ...publication.result, deckVersion: 3 },
	})
	const savedReplay = await asOwner(() => savedReplayForTest(args, owner))
	assert.equal(savedReplay.ok, true)
	assert.equal(savedReplay.data.downloadUrl, publication.result.downloadUrl)
	assert.equal(savedReplay.data.operationId, completed.operationId)
	assert.equal(savedReplay.data.idempotentReplay, true)
	assert.equal(savedReplay.data.deckVersion, 3)
	assert.equal(savedReplay.data.packageSha256, publication.result.packageSha256)

	const existingReplay = await asOwner(() => beginReplayForTest('betterpptx.deck.save', args, owner))
	assert.equal(existingReplay.replayResult.ok, true)
	assert.equal(existingReplay.replayResult.data.downloadUrl, publication.result.downloadUrl)
	assert.equal(existingReplay.replayResult.then, undefined, 'the caller must return a resolved replay envelope')

	// Simulate completion between creation and lease claim to exercise the third
	// success caller, without altering the durable record or its fencing token.
	const originalCreate = operationStoreForTest.createOrGetOperation
	const originalClaim = operationStoreForTest.claimOperation
	try {
		operationStoreForTest.createOrGetOperation = async () => ({ created: true, operation: { ...completed, state: 'queued' } })
		operationStoreForTest.claimOperation = async () => ({ claimed: false, terminal: true, operation: completed })
		const racedReplay = await asOwner(() => beginReplayForTest('betterpptx.deck.save', args, owner))
		assert.equal(racedReplay.replayResult.ok, true)
		assert.equal(racedReplay.replayResult.data.downloadUrl, publication.result.downloadUrl)
		assert.equal(racedReplay.replayResult.then, undefined)
	} finally {
		operationStoreForTest.createOrGetOperation = originalCreate
		operationStoreForTest.claimOperation = originalClaim
	}

	const reads = counts.reads
	assert.equal(await withResourceAuthorization(otherOwner, () => savedReplayForTest(args, otherOwner)), null)
	assert.equal(counts.reads, reads, 'a foreign ledger owner cannot even enter artifact recovery')
	for (const changed of [{ ...args, fileName: 'different.pptx' }, { ...args, deckVersion: 4 }]) {
		await assert.rejects(asOwner(() => savedReplayForTest(changed, owner)), { code: 'OPERATION_IDEMPOTENCY_CONFLICT' })
	}
	assert.deepEqual(await operationStoreForTest.getOperation(completed.operationId), completed)
})

test('expired retained bytes cannot be renewed during durable success replay', async t => {
	const operation = await publishedOperation()
	const signaturesBeforeReplay = counts.signatures
	t.mock.timers.enable({ apis: ['Date'], now: Date.parse(operation.result.artifact.expiresAt) })
	const result = await asOwner(() => replayForTest(operation, 'betterpptx.deck.save'))
	assert.equal(result.ok, true)
	assert.equal(result.data.downloadUrl, null)
	assert.equal(result.data.artifact.state, 'unavailable')
	assert.equal(result.data.artifact.expiresAt, operation.result.artifact.expiresAt)
	assert.equal(counts.signatures, signaturesBeforeReplay)
})

test('non-artifact durable successes retain their replay and authored-content behavior', async () => {
	const result = await asOwner(() => replayForTest({
		operationId: `op_${'d'.repeat(32)}`, state: 'succeeded', result: { title: 'A semantic result', phase: 'dryRun' },
	}, 'betterpptx.deck.generate_from_spec'))
	assert.equal(result.ok, true)
	assert.equal(result.data.title, 'A semantic result')
	assert.equal(result.data.durableOperation.replay, true)
})
