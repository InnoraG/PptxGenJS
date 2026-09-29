import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { registerHooks } from 'node:module'
import { createOperationStore, digestOperationPayload } from '../storage/operation-store.mjs'

// Replace the entire Firestore client, including transactions. The fake refuses
// undefined anywhere, rather than hiding it with ignoreUndefinedProperties.
const mockUrl = `data:text/javascript,${encodeURIComponent(`
  export const documents = new Map()
  export const state = { writes: 0, constructors: [] }
  export function strictJson(value, location = 'document') {
    if (value === undefined) throw new Error('Cannot use undefined at ' + location)
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (typeof value !== 'object' || value instanceof Date) throw new Error('Not JSON-compatible at ' + location)
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) strictJson(value[i], location + '[' + i + ']')
    } else {
      for (const [key, item] of Object.entries(value)) strictJson(item, location + '.' + key)
    }
  }
  const snapshot = key => ({ exists: documents.has(key), data: () => structuredClone(documents.get(key)) })
  export class Firestore {
    constructor(options) {
      if ('ignoreUndefinedProperties' in options) throw new Error('Global undefined suppression forbidden')
      state.constructors.push(structuredClone(options))
    }
    settings() { throw new Error('Global Firestore settings forbidden') }
    collection(name) {
      return { doc: id => ({ path: name + '/' + id, get: async () => snapshot(name + '/' + id) }) }
    }
    async runTransaction(callback) {
      const pending = new Map()
      const transaction = {
        get: async ref => snapshot(ref.path),
        create: (ref, value) => {
          strictJson(value)
          if (documents.has(ref.path) || pending.has(ref.path)) throw new Error('Create precondition failed')
          pending.set(ref.path, structuredClone(value))
        },
        set: (ref, value, options) => {
          strictJson(value)
          if (options.merge !== false) throw new Error('Operation updates must replace the fenced record')
          pending.set(ref.path, structuredClone(value))
        },
      }
      const result = await callback(transaction)
      for (const [key, value] of pending) { documents.set(key, value); state.writes++ }
      return result
    }
  }
`)}`
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === '@google-cloud/firestore' ? { url: mockUrl, shortCircuit: true } : nextResolve(specifier, context)
} })
after(() => hooks.deregister())
const { documents, state, strictJson } = await import(mockUrl)

const alice = `install_${'a'.repeat(64)}`
const bob = `install_${'b'.repeat(64)}`
const owner = { schemaVersion: 'synthetic-owner-v1', kind: 'install', id: 'a'.repeat(64) }
const time = Date.UTC(2031, 0, 2, 12)

async function fixture(t, provider) {
  documents.clear(); state.writes = 0
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-operation-json-'))
  const file = path.join(root, 'operations.json')
  const env = {
    BETTERPPTX_DURABLE_OPERATION_STORE: provider,
    BETTERPPTX_OPERATION_STORE_FILE: file, BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
    BETTERPPTX_FIRESTORE_OPERATION_PREFIX: 'synthetic', BETTERPPTX_GCP_PROJECT: 'synthetic-project',
    BETTERPPTX_FIRESTORE_DATABASE: 'synthetic-database',
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('betterpptx-operation-json-'))
    await fs.rm(root, { recursive: true, force: true })
  })
  const store = createOperationStore()
  const input = {
    operationId: 'op_synthetic_json', installHash: alice, toolName: 'betterpptx.deck.generate_from_spec',
    deckId: 'deck_synthetic', deckHash: 'deck-digest', expectedDeckVersion: 0,
    inputDigest: 'input-digest', pricingInputDigest: 'quote-digest', idempotencyKey: 'same-key',
    metadata: { phase: 'commit', approved: false, optional: undefined, resourceOwner: owner },
    request: { args: { spec: { title: 'Synthetic' }, optional: undefined },
      context: { installHash: alice, sessionId: 'synthetic-session' } }, nowMs: time,
  }
  const createAndClaim = async (override = {}) => {
    const created = await store.createOrGetOperation({ ...input, ...override })
    const claim = await store.claimOperation(created.operation.operationId, { leaseOwner: 'synthetic-worker', nowMs: time + 1 })
    return { created, claim }
  }
  const savedDocuments = async () => provider === 'firestore' ? [...documents.values()]
    : Object.values(JSON.parse(await fs.readFile(file, 'utf8')).operations)
  return { store, input, createAndClaim, savedDocuments, file }
}

test('strict Firestore double really rejects the reported nested undefined and array holes', () => {
  assert.throws(() => strictJson({ result: { billing: { specEstimate: { operations: [{ objectName: undefined }] } } } }),
    /Cannot use undefined at document.result.billing.specEstimate.operations\[0\].objectName/)
  assert.throws(() => strictJson({ values: [undefined] }), /Cannot use undefined/)
  assert.throws(() => strictJson({ values: Array(1) }), /Cannot use undefined/)
})

for (const provider of ['local', 'firestore']) {
  test(`${provider}: complete result omits optional undefined but retains null/false/zero, arrays, dates and finite numbers through replay`, async t => {
    const f = await fixture(t, provider)
    const { created, claim } = await f.createAndClaim()
    assert.equal(created.operation.expectedDeckVersion, 0)
    assert.equal(Object.hasOwn(created.operation.metadata, 'optional'), false)
    assert.equal(Object.hasOwn(created.operation.request.args, 'optional'), false)
    assert.deepEqual(created.operation.metadata.resourceOwner, owner)
    const date = new Date(time)
    const result = {
      billing: { specEstimate: { operations: [{ objectName: undefined, estimatedCredits: 0, approved: false, reason: null }] } },
      optional: undefined, explicitNull: null, falseValue: false, zero: 0, negativeZero: -0,
      date, numbers: [Number.MIN_VALUE, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, -2.5],
      values: [undefined, null, false, 0, , { missing: undefined, retained: 'yes' }], resourceOwner: owner,
    }
    const expected = JSON.parse(JSON.stringify(result))
    const completed = await f.store.completeOperation(created.operation.operationId, {
      leaseToken: claim.lease.leaseToken, result, nowMs: time + 2,
    })
    assert.equal(completed.state, 'succeeded')
    assert.deepEqual(completed.result, expected)
    strictJson(completed)
    assert.ok(Object.hasOwn(result.billing.specEstimate.operations[0], 'objectName'), 'normalization must not mutate the handler result')
    assert.equal(result.date, date)
    const cold = createOperationStore()
    assert.deepEqual((await cold.getOperation(created.operation.operationId)).result, expected)
    const replay = await cold.createOrGetOperation(f.input)
    assert.equal(replay.created, false)
    assert.equal(replay.idempotentReplay, true)
    assert.deepEqual(replay.operation.result, expected)
    const duplicate = await cold.completeOperation(created.operation.operationId, {
      leaseToken: claim.lease.leaseToken, result: { replacement: true }, nowMs: time + 3,
    })
    assert.deepEqual(duplicate.result, expected, 'terminal publication result is immutable')
    assert.equal((await cold.claimOperation(created.operation.operationId)).claimed, false)
    for (const record of await f.savedDocuments()) strictJson(record)
  })

  test(`${provider}: explicit root result null, false and zero are not replaced with an empty object`, async t => {
    const f = await fixture(t, provider)
    for (const [index, result] of [null, false, 0].entries()) {
      const { created, claim } = await f.createAndClaim({ operationId: `op_root_${index}`, idempotencyKey: `root-${index}` })
      const completed = await f.store.completeOperation(created.operation.operationId, { leaseToken: claim.lease.leaseToken, result })
      assert.equal(completed.result, result)
      assert.equal((await f.store.getOperation(created.operation.operationId)).result, result)
      assert.equal((await f.store.findOperationByIdempotencyKey({ ...f.input, idempotencyKey: `root-${index}` })).result, result)
    }
  })

  test(`${provider}: undefined normalization does not weaken owner lookup, quote/input/version digests or lease fencing`, async t => {
    const f = await fixture(t, provider)
    const { created, claim } = await f.createAndClaim()
    assert.equal(created.operation.inputDigest, f.input.inputDigest)
    assert.equal(created.operation.pricingInputDigest, f.input.pricingInputDigest)
    assert.equal(await f.store.findOperationByIdempotencyKey({ ...f.input, installHash: bob }), null)
    for (const patch of [{ inputDigest: 'different-input' }, { pricingInputDigest: 'different-quote' },
      { expectedDeckVersion: null }, { deckHash: 'different-deck' }, { metadata: { ...f.input.metadata, approved: true } },
      { metadata: { ...f.input.metadata, resourceOwner: { ...owner, id: 'b'.repeat(64) } } }]) {
      await assert.rejects(f.store.createOrGetOperation({ ...f.input, ...patch }), { code: 'OPERATION_IDEMPOTENCY_CONFLICT' })
    }
    // Hashes are intentionally calculated from the original input, not from
    // the undefined-pruned storage document. Keep the pre-existing convention.
    const originalDigest = digestOperationPayload({
      installHash: f.input.installHash, toolName: f.input.toolName, deckId: f.input.deckId, deckHash: f.input.deckHash,
      expectedDeckVersion: 0, inputDigest: f.input.inputDigest, pricingInputDigest: f.input.pricingInputDigest,
      queueClass: 'default', metadata: f.input.metadata,
    })
    const index = provider === 'firestore' ? [...documents.entries()].find(([key]) => key.startsWith('synthetic_operation_idempotency/'))[1]
      : Object.values(JSON.parse(await fs.readFile(f.file, 'utf8')).idempotency)[0]
    assert.equal(index.requestDigest, originalDigest)
    await assert.rejects(f.store.completeOperation(created.operation.operationId, { leaseToken: 'forged', result: { ok: true } }),
      { code: 'OPERATION_LEASE_STALE' })
    await f.store.releaseOperation(created.operation.operationId, { leaseToken: claim.lease.leaseToken, nowMs: time + 2 })
    const reclaimed = await f.store.claimOperation(created.operation.operationId, { leaseOwner: 'other-worker', nowMs: time + 3 })
    await assert.rejects(f.store.completeOperation(created.operation.operationId, { leaseToken: claim.lease.leaseToken }),
      { code: 'OPERATION_LEASE_STALE' })
    const completed = await f.store.completeOperation(created.operation.operationId, { leaseToken: reclaimed.lease.leaseToken, result: { ok: true } })
    assert.equal(completed.installHash, alice)
    assert.deepEqual(completed.metadata.resourceOwner, owner)
    const foreign = await f.store.createOrGetOperation({ ...f.input, operationId: 'op_foreign', installHash: bob })
    assert.equal(foreign.created, true)
    assert.equal(foreign.operation.installHash, bob)
    assert.notEqual(foreign.operation.operationId, created.operation.operationId)
  })

  test(`${provider}: failure details normalize optional fields and retry/replay state remains unchanged`, async t => {
    const f = await fixture(t, provider)
    const { created, claim } = await f.createAndClaim()
    const details = { optional: undefined, explicitNull: null, blocked: false, credits: 0, when: new Date(time), values: [undefined, false, 0] }
    const failed = await f.store.failOperation(created.operation.operationId, {
      leaseToken: claim.lease.leaseToken, error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic failure.', details }, retryable: false,
    })
    assert.equal(failed.state, 'failed')
    assert.equal(failed.error.retryable, false)
    assert.deepEqual(failed.error.details, JSON.parse(JSON.stringify(details)))
    assert.deepEqual((await createOperationStore().getOperation(created.operation.operationId)).error, failed.error)
    assert.equal((await f.store.createOrGetOperation(f.input)).operation.state, 'failed')
    const second = await f.createAndClaim({ operationId: 'op_retry', idempotencyKey: 'retry-key' })
    const retry = await f.store.failOperation(second.created.operation.operationId, {
      leaseToken: second.claim.lease.leaseToken, error: { details }, retryable: true, nowMs: time + 3,
    })
    assert.equal(retry.state, 'retry')
    assert.equal(retry.error.retryable, true)
    assert.equal((await f.store.claimOperation(second.created.operation.operationId, { nowMs: time + 4 })).claimed, true)
  })

  test(`${provider}: non-finite/invalid/non-JSON truth rejects atomically rather than silently becoming null`, async t => {
    const f = await fixture(t, provider)
    const { created, claim } = await f.createAndClaim()
    const cycle = {}; cycle.self = cycle
    for (const value of [NaN, Infinity, -Infinity, new Date(NaN), 1n, () => true, Symbol('unsupported'), new Map(), cycle]) {
      await assert.rejects(f.store.completeOperation(created.operation.operationId, {
        leaseToken: claim.lease.leaseToken, result: { value },
      }), { code: 'OPERATION_PAYLOAD_INVALID' })
      const unchanged = await f.store.getOperation(created.operation.operationId)
      assert.equal(unchanged.state, 'running')
      assert.equal(unchanged.result, null)
    }
    await assert.rejects(f.store.createOrGetOperation({ ...f.input, operationId: 'op_bad_version', idempotencyKey: 'bad-version', expectedDeckVersion: Infinity }),
      { code: 'OPERATION_PAYLOAD_INVALID' })
    const shared = { retained: false, optional: undefined }
    const result = await f.store.completeOperation(created.operation.operationId, {
      leaseToken: claim.lease.leaseToken, result: { a: shared, b: shared },
    })
    assert.deepEqual(result.result, { a: { retained: false }, b: { retained: false } }, 'shared references are not cycles')
  })

  test(`${provider}: queued request normalization preserves identity and dangerous property names as data only`, async t => {
    const f = await fixture(t, provider)
    const fields = JSON.parse('{"__proto__":{"polluted":true},"constructor":false,"prototype":0}')
    const request = { args: { ...fields, optional: undefined, values: [undefined, null], date: new Date(time) },
      context: { installHash: alice, sessionId: 'owner-session', optional: undefined } }
    const created = await f.store.createOrGetOperation({ ...f.input, request })
    const expected = JSON.parse(JSON.stringify(request))
    assert.deepEqual(created.operation.request, expected)
    assert.equal(Object.hasOwn(created.operation.request.args, '__proto__'), true)
    assert.equal({}.polluted, undefined)
    assert.deepEqual((await createOperationStore().getOperation(created.operation.operationId)).request, expected)
  })
}

test('operation digest canonicalization is unchanged, including explicit null/false/zero boundaries', () => {
  assert.equal(digestOperationPayload({ z: 0, a: false, n: null }), digestOperationPayload({ n: null, a: false, z: 0 }))
  const distinct = [null, false, 0, '', [], {}].map(value => digestOperationPayload({ value }))
  assert.equal(new Set(distinct).size, distinct.length)
  assert.equal(digestOperationPayload({ value: undefined }), digestOperationPayload({ value: null }), 'retain original undefined-to-null hash convention')
  assert.notEqual(digestOperationPayload({}), digestOperationPayload({ value: undefined }))
  assert.ok(state.constructors.every(options => !Object.hasOwn(options, 'ignoreUndefinedProperties')))
})
