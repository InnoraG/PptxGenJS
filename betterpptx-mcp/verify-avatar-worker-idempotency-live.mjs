#!/usr/bin/env node
// Staging-only live proof for the private worker idempotency broker. It uses two
// redacted worker credentials, synthetic bytes, and cleans every Firestore/GCS
// record it creates. No customer media or raw secret is printed or persisted.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const base = String(process.env.BETTERPPTX_AVATAR_IDEMPOTENCY_BROKER_URL || '').trim().replace(/\/+$/, '')
const project = String(process.env.BETTERPPTX_GCP_PROJECT || 'betterpptx-mcp-staging').trim()
const bucket = String(process.env.BETTERPPTX_GEN_ASSET_BUCKET || 'betterpptx-mcp-staging-artifacts-860007156914').trim()
const collection = String(process.env.BETTERPPTX_FIRESTORE_AVATAR_WORKER_IDEMPOTENCY_COLLECTION || 'betterpptx_avatar_worker_idempotency').trim()
const tokenA = String(process.env.BETTERPPTX_AVATAR_WORKER_TOKEN_A || '').trim()
const tokenB = String(process.env.BETTERPPTX_AVATAR_WORKER_TOKEN_B || '').trim()
const oauth = String(process.env.BETTERPPTX_GCP_OAUTH_TOKEN || '').trim()
const checks = []
const created = []
const outputPath = path.resolve('betterpptx-mcp/outputs/avatar-worker-idempotency-live-evidence-report.json')

function assertConfig() {
	if (!base || !tokenA || !tokenB || !oauth) throw new Error('Live idempotency verifier requires broker URL, two worker tokens, and a GCP OAuth token.')
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function hashKey(key) { return digest(Buffer.from(key, 'utf8')) }
async function request(method, route, token, { body, headers = {}, binary = false } = {}) {
	const response = await fetch(`${base}${route}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, ...headers },
		body,
	})
	const bytes = Buffer.from(await response.arrayBuffer())
	let parsed = null
	if (!binary) { try { parsed = JSON.parse(bytes.toString('utf8')) } catch {} }
	return { status: response.status, state: response.headers.get('x-idempotency-state') || '', body: parsed, bytes }
}
function check(id, ok, details = {}) { checks.push({ id, status: ok ? 'PASS' : 'BLOCKED', ...details }) }
async function gcpDelete(path) {
	const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${oauth}` } })
	return response.status === 200 || response.status === 204 || response.status === 404
}
async function gcsDelete(objectName) {
	const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${oauth}` } })
	return response.status === 200 || response.status === 204 || response.status === 404
}

let status = 'BLOCKED'
try {
	assertConfig()
	const suffix = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`
	const key = `verify-avatar-worker-${suffix}`
	const fingerprint = digest(Buffer.from(`synthetic-avatar-request-${suffix}`))
	const conflictFingerprint = digest(Buffer.from(`synthetic-avatar-conflict-${suffix}`))
	const resultBytes = Buffer.from(`synthetic-mp4-${suffix}`, 'utf8')
	const acquireA = await request('POST', '/internal/avatar/idempotency/acquire', tokenA, { body: JSON.stringify({ key, fingerprint, accountId: 'synthetic-a' }), headers: { 'Content-Type': 'application/json' } })
	const acquireB = await request('POST', '/internal/avatar/idempotency/acquire', tokenB, { body: JSON.stringify({ key, fingerprint, accountId: 'synthetic-b' }), headers: { 'Content-Type': 'application/json' } })
	const conflict = await request('POST', '/internal/avatar/idempotency/acquire', tokenB, { body: JSON.stringify({ key, fingerprint: conflictFingerprint, accountId: 'synthetic-b' }), headers: { 'Content-Type': 'application/json' } })
	const complete = await request('PUT', '/internal/avatar/idempotency/result', tokenA, { body: resultBytes, headers: { 'Content-Type': 'video/mp4', 'X-Idempotency-Key': key, 'X-Avatar-Request-Fingerprint': fingerprint } })
	const replayAcquire = await request('POST', '/internal/avatar/idempotency/acquire', tokenB, { body: JSON.stringify({ key, fingerprint, accountId: 'synthetic-b' }), headers: { 'Content-Type': 'application/json' } })
	const replay = await request('GET', '/internal/avatar/idempotency/result', tokenB, { headers: { 'X-Idempotency-Key': key, 'X-Avatar-Request-Fingerprint': fingerprint }, binary: true })
	const unauth = await fetch(`${base}/internal/avatar/idempotency/acquire`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, fingerprint }) })
	created.push({ key, objectName: `betterpptx-avatar-artifacts/worker-idempotency/${hashKey(key)}.mp4` })

	const cancelKey = `verify-avatar-worker-cancel-${suffix}`
	const cancelFingerprint = digest(Buffer.from(`synthetic-avatar-cancel-${suffix}`))
	const cancelAcquire = await request('POST', '/internal/avatar/idempotency/acquire', tokenA, { body: JSON.stringify({ key: cancelKey, fingerprint: cancelFingerprint, accountId: 'synthetic-a' }), headers: { 'Content-Type': 'application/json' } })
	const cancel = await request('POST', '/internal/avatar/idempotency/cancel', tokenB, { body: JSON.stringify({ key: cancelKey, fingerprint: cancelFingerprint, reason: 'synthetic-test' }), headers: { 'Content-Type': 'application/json' } })
	const cancelledReplay = await request('POST', '/internal/avatar/idempotency/acquire', tokenA, { body: JSON.stringify({ key: cancelKey, fingerprint: cancelFingerprint, accountId: 'synthetic-a' }), headers: { 'Content-Type': 'application/json' } })
	created.push({ key: cancelKey, objectName: null })

	check('broker-requires-worker-auth', unauth.status === 401)
	check('first-account-acquires-key', acquireA.status === 201 && acquireA.state === 'acquired')
	check('second-account-sees-running-key', acquireB.status === 409 && acquireB.state === 'running')
	check('conflicting-fingerprint-rejected', conflict.status === 409 && conflict.state === 'conflict')
	check('terminal-result-committed', complete.status === 200 && complete.state === 'completed')
	check('cross-account-terminal-acquire-replay', replayAcquire.status === 200 && replayAcquire.state === 'completed')
	check('cross-account-result-byte-replay', replay.status === 200 && digest(replay.bytes) === digest(resultBytes))
	check('cancel-terminal-state', cancelAcquire.status === 201 && cancel.status === 200 && cancel.state === 'cancelled')
	check('cancelled-key-cannot-reacquire', cancelledReplay.status === 410 && cancelledReplay.state === 'cancelled')
	const keyCleanup = await gcpDelete(`${collection}/${hashKey(key)}`)
	const cancelCleanup = await gcpDelete(`${collection}/${hashKey(cancelKey)}`)
	const objectCleanup = await gcsDelete(created[0].objectName)
	check('synthetic-cleanup', keyCleanup && cancelCleanup && objectCleanup, { cleanupCompleted: keyCleanup && cancelCleanup && objectCleanup })
	status = checks.every(check => check.status === 'PASS') ? 'PASS' : 'BLOCKED'
	const report = { schemaVersion: 'betterpptx.avatar-worker-idempotency-live.v1', status, crossAccountReplay: checks.find(c => c.id === 'cross-account-result-byte-replay')?.status === 'PASS', conflictRejected: checks.find(c => c.id === 'conflicting-fingerprint-rejected')?.status === 'PASS', cancelledTerminal: checks.find(c => c.id === 'cancelled-key-cannot-reacquire')?.status === 'PASS', checks, cleanupCompleted: checks.find(c => c.id === 'synthetic-cleanup')?.status === 'PASS', syntheticCustomerData: false, rawSecretsPrinted: false }
	await fs.mkdir(path.dirname(outputPath), { recursive: true })
	await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
	console.log(JSON.stringify(report, null, 2))
	if (status !== 'PASS') process.exitCode = 2
} catch (error) {
	const report = { schemaVersion: 'betterpptx.avatar-worker-idempotency-live.v1', status: 'BLOCKED', checks, blockers: [String(error?.message || error).slice(0, 200)], cleanupCompleted: false, syntheticCustomerData: false, rawSecretsPrinted: false }
	await fs.mkdir(path.dirname(outputPath), { recursive: true })
	await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
	console.log(JSON.stringify(report, null, 2))
	process.exitCode = 2
}
