import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'

// Local public-path dispatcher integration, not a real browser/OAuth deployment.
// Only usage persistence is a strict Firestore double; no providers/payments.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-save-usage-'))
const operationFile = path.join(root, 'operations.json')
const collection = 'strict_save_usage_fixture'
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_FORCE_PLAN: 'free', BETTERPPTX_PREMIUM: '0',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_REQUIRE_QUOTE_BINDING: '1',
	BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '1', BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: '3',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering', BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW: '0',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
	BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0', BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local',
	BETTERPPTX_DECK_STATE_FILE: path.join(root, 'decks.json'),
	BETTERPPTX_DECK_SNAPSHOT_STORE: 'local', BETTERPPTX_DECK_SNAPSHOT_DIR: path.join(root, 'specs'),
	BETTERPPTX_DURABLE_OPERATION_STORE: 'local', BETTERPPTX_OPERATION_STORE_FILE: operationFile,
	BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '1', BETTERPPTX_OPERATION_EXECUTION_MODE: 'inline',
	BETTERPPTX_OPERATION_DISPATCHER: 'inline', BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH: '0',
	BETTERPPTX_ARTIFACT_STORE: 'local', BETTERPPTX_ASSET_GRANT_STORE: 'local',
	BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'), BETTERPPTX_LOCKED_ASSET_STORE: 'local',
	BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'locked'), BETTERPPTX_LOCKED_ASSET_SHARED_DIR: path.join(root, 'shared-locked'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'billing.json'),
	BETTERPPTX_ENTITLEMENT_STORE: 'local', BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
	BETTERPPTX_INSTALL_USAGE_STORE: 'firestore', BETTERPPTX_FIRESTORE_INSTALL_USAGE_COLLECTION: collection,
	BETTERPPTX_GCP_PROJECT: 'synthetic-usage-project', BETTERPPTX_FIRESTORE_DATABASE: 'synthetic-usage-database',
	BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root, BETTERPPTX_PUBLIC_BASE: 'https://delivery.example.test',
	BETTERPPTX_USAGE_AUTO_FLUSH: '0', BETTERPPTX_LOG: '',
})

const mockUrl = `data:text/javascript,${encodeURIComponent(`
	export const documents = new Map()
	export const writes = []
	export const state = { constructors: 0 }
	let lock = Promise.resolve()
	export function strictJson(value, location = 'document', inArray = false, ancestors = new Set()) {
		if (value === undefined) throw new Error('Firestore Cannot use undefined at ' + location)
		if (value === null || typeof value === 'string' || typeof value === 'boolean') return
		if (typeof value === 'number' && Number.isFinite(value)) return
		if (typeof value !== 'object' || value instanceof Date || ancestors.has(value)) throw new Error('Not JSON-compatible at ' + location)
		if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Not a plain record')
		ancestors.add(value)
		try {
			if (Array.isArray(value)) {
				if (inArray) throw new Error('Direct nested arrays are not supported by the Standard Firestore fixture')
				for (let i = 0; i < value.length; i++) strictJson(value[i], location + '[' + i + ']', true, ancestors)
			} else for (const [key, item] of Object.entries(value)) strictJson(item, location + '.' + key, false, ancestors)
		} finally { ancestors.delete(value) }
	}
	const snapshot = key => ({ exists: documents.has(key), data: () => structuredClone(documents.get(key)) })
	export class Firestore {
		constructor(options) {
			if ('ignoreUndefinedProperties' in options) throw new Error('Global undefined suppression forbidden')
			if (options.projectId !== 'synthetic-usage-project') throw new Error('Live project access forbidden')
			state.constructors++
		}
		settings() { throw new Error('Global settings forbidden') }
		collection(name) {
			if (name !== ${JSON.stringify(collection)}) throw new Error('Only the usage store may use this Firestore fixture')
			return { doc: id => ({ path: name + '/' + id, get: async () => snapshot(name + '/' + id) }) }
		}
		runTransaction(callback) {
			const task = lock.then(async () => {
				const pending = new Map()
				const result = await callback({
					get: async ref => {
						if (pending.size) throw new Error('Transaction reads must precede writes')
						return snapshot(ref.path)
					},
					set: (ref, value, options) => {
						strictJson(value)
						if (![true, false].includes(options?.merge)) throw new Error('Explicit merge policy required')
						const next = options.merge ? { ...documents.get(ref.path), ...structuredClone(value) } : structuredClone(value)
						strictJson(next)
						pending.set(ref.path, next)
					},
				})
				for (const [key, value] of pending) { documents.set(key, value); writes.push({ key, value: structuredClone(value) }) }
				return result
			})
			lock = task.catch(() => {})
			return task
		}
	}
`)}`
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
	return specifier === '@google-cloud/firestore' ? { url: mockUrl, shortCircuit: true } : nextResolve(specifier, context)
} })
const { documents, writes, state, strictJson } = await import(mockUrl)
const { createMcpToolDispatcher } = await import('../engine.mjs')
const context = { installHash: `install_${'e'.repeat(64)}`, sessionId: 'strict-usage-public-dispatcher', blackBox: true }
const dispatcher = createMcpToolDispatcher(context)

function dataOf(result, label) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`)
	return result.data || result
}

function tinyNativeSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Strict usage publication', layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete',
			geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches',
		},
		validation: { validateBeforeSave: true, requireAccessibility: true },
		slides: [{ id: 'decision', title: 'Choose with evidence.', background: { color: 'FFFFFF' }, content: [
			{ kind: 'title', name: 'headline', text: 'Choose with evidence.', rect: { x: 0.9, y: 2.35, w: 11.5, h: 1.2 }, style: { fontFace: 'Arial', fontSize: 32, color: '172033' } },
		] }],
	}
}

function publicationRecord() {
	const rows = [...documents.values()].filter(record => record.identityHash === context.installHash && record.category === 'deck-publication')
	assert.equal(rows.length, 1)
	strictJson(rows[0])
	return structuredClone(rows[0])
}

async function assertOnePublication(client, operationId) {
	const auth = dataOf(await client.call('betterpptx.auth.status', {}), 'read-only public allowance status')
	assert.equal(auth.freeAllowances.deckPublications.used, 1)
	assert.equal(auth.freeAllowances.deckPublications.reserved, 0)
	assert.equal(auth.freeAllowances.deckPublications.remaining, 2)
	const record = publicationRecord()
	assert.equal(record.events.length, 1)
	assert.equal(record.reservations.length, 0)
	assert.equal(record.events[0].metadata.tool, 'betterpptx.deck.save')
	assert.equal(record.events[0].metadata.operationId, operationId, 'allowance event must bind the actual durable save operation')
	return record
}

test.after(async () => {
	hooks.deregister()
	assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
	assert.ok(path.basename(root).startsWith('betterpptx-save-usage-'))
	await fs.rm(root, { recursive: true, force: true })
})

test('strict usage Firestore double rejects optional undefined in the real failure field and array holes', () => {
	assert.throws(() => strictJson({ events: [{ metadata: { operationId: undefined } }] }), /document.events\[0\].metadata.operationId/)
	assert.throws(() => strictJson({ slots: Array(1) }), /Cannot use undefined/)
	assert.throws(() => strictJson({ matrix: [[1]] }), /Direct nested arrays/)
})

test('real public dispatcher free save commits one strict Firestore event bound to its durable operation; replay and re-download stay at one', async () => {
	const before = dataOf(await dispatcher.call('betterpptx.auth.status', {}), 'initial public allowance')
	assert.equal(before.freeAllowances.deckPublications.used, 0)
	const args = { spec: tinyNativeSpec(), phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'full', idempotencyKey: 'strict-usage-native-commit' }
	const { idempotencyKey, ...toolArgs } = args
	const quote = dataOf(await dispatcher.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec', toolArgs,
	}), 'actual exact-spec free quote')
	assert.equal(quote.estimatedCredits, 0)
	assert.equal(quote.billingRequired, false)
	assert.ok(quote.quoteBinding?.quoteId)
	args.quoteBinding = structuredClone(quote.quoteBinding)
	const committed = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', args), 'actual quoted native compile')
	assert.equal(committed.billing?.quoteId, quote.quoteBinding.quoteId)
	assert.ok(committed.deckId)
	const validated = dataOf(await dispatcher.call('betterpptx.deck.validate_quality', {
		deckId: committed.deckId, profile: 'modern', strictness: 'strict',
	}), 'actual strict aggregate gate')
	assert.equal(validated.ok, true, JSON.stringify(validated.blockingIssues))
	assert.equal(validated.strictness, 'strict')
	assert.deepEqual(validated.blockingIssues, [])
	assert.ok(validated.checks.filter(check => check.blocking).every(check => check.ok === true))
	const saveArgs = { deckId: committed.deckId, outputFormat: 'pptx', idempotencyKey: 'strict-usage-one-save' }
	const saveQuote = dataOf(await dispatcher.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.save', toolArgs: saveArgs,
	}), 'actual owned-deck free save estimate')
	assert.equal(saveQuote.estimatedCredits, 0)
	assert.equal(saveQuote.billingRequired, false)
	assert.equal(publicationRecord().events.length, 0, 'quotes, draft compile and validation must not consume a publication')
	const saved = dataOf(await dispatcher.call('betterpptx.deck.save', saveArgs), 'actual artifact save with strict usage persistence')
	assert.match(saved.operationId || '', /^op_[0-9a-f]{32}$/)
	assert.equal(saved.freeAllowance?.used, 1)
	assert.equal(saved.verification?.policy, 'production-non-rendering')
	assert.equal(saved.verification?.renderPerformed, false)
	assert.equal(saved.verification?.packageSafety?.passed, true)
	assert.match(saved.verification?.validationEvidenceSha256 || '', /^[a-f0-9]{64}$/)
	assert.match(saved.packageSha256 || '', /^[a-f0-9]{64}$/)
	assert.equal(typeof saved.downloadUrl, 'string')
	const ledger = JSON.parse(await fs.readFile(operationFile, 'utf8')).operations
	const operation = ledger[saved.operationId]
	assert.equal(operation.state, 'succeeded')
	assert.equal(operation.toolName, 'betterpptx.deck.save')
	assert.equal(operation.installHash, context.installHash)
	assert.equal(operation.result.packageSha256, saved.packageSha256)
	const event = (await assertOnePublication(dispatcher, saved.operationId)).events[0]
	assert.match(event.metadata.deckIdHash || '', /^[a-f0-9]{16}$/)
	assert.ok(writes.some(write => write.value.events?.[0]?.metadata?.operationId === saved.operationId), 'event must actually cross the strict transaction write boundary')
	for (const client of [dispatcher, createMcpToolDispatcher({ ...context, sessionId: 'strict-usage-reconnected' })]) {
		const replay = dataOf(await client.call('betterpptx.deck.save', saveArgs), 'exact same-key save replay')
		assert.equal(replay.packageSha256, saved.packageSha256)
		assert.equal(replay.operationId, saved.operationId)
		assert.deepEqual((await assertOnePublication(client, saved.operationId)).events[0], event)
		const status = dataOf(await client.call('betterpptx.operation.status', { operationId: saved.operationId }), 'owner-scoped operation recovery')
		assert.equal(status.state, 'succeeded')
		assert.equal(status.result.packageSha256, saved.packageSha256)
		const download = dataOf(await client.call('betterpptx.operation.read_file', {
			operationId: saved.operationId, mode: 'link',
		}), 'read-only re-download link')
		assert.equal(download.operationId, saved.operationId)
		assert.equal(download.packageSha256, saved.packageSha256)
		assert.equal(download.resourceDeliveryPolicy.maxDirectResourceBytes, 262144)
		assert.equal(download.resourceDeliveryPolicy.largerFiles, 'browser-download-link')
		assert.equal(download.resourceDeliveryPolicy.sizeBasis, 'decoded-artifact-bytes')
		assert.equal(typeof download.downloadUrl, 'string')
		const chunk = dataOf(await client.call('betterpptx.operation.read_file', {
			operationId: saved.operationId, mode: 'chunk', offset: 0, maxBytes: 64,
		}), 'read actual saved native package bytes')
		assert.equal(chunk.encoding, 'base64')
		assert.equal(Buffer.from(chunk.dataBase64, 'base64').subarray(0, 2).toString(), 'PK')
		assert.deepEqual((await assertOnePublication(client, saved.operationId)).events[0], event)
	}
	assert.equal(state.constructors, 1, 'only the isolated usage provider should initialize Firestore')
	assert.equal(JSON.parse(await fs.readFile(operationFile, 'utf8')).operations[saved.operationId].attempt, 1)
})
