#!/usr/bin/env node
// Fail-closed evidence check for the private worker's duplicate-spend boundary.
// A gateway idempotency header is not sufficient: the worker must persist a
// key/fingerprint, return the same terminal result, reject conflicting input,
// and expose cancellation semantics across instances.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp')
const sourcePath = process.env.BETTERPPTX_AVATAR_WORKER_SOURCE
  ? path.resolve(process.env.BETTERPPTX_AVATAR_WORKER_SOURCE)
  : path.resolve('..', 'PptxGenJS_Claude_betterpptx_mcp_metrology', 'avatar-metrology', 'modal_avatar_endpoint.py')
const source = await fs.readFile(sourcePath, 'utf8').catch(() => '')
const brokerStore = await fs.readFile(path.join(root, 'storage', 'avatar-worker-idempotency-store.mjs'), 'utf8').catch(() => '')
const liveEvidence = await fs.readFile(path.join(root, 'outputs', 'avatar-worker-idempotency-live-evidence-report.json'), 'utf8').then(text => JSON.parse(text)).catch(() => null)
const hasHeader = /idempotency[-_ ]key/i.test(source)
const hasFingerprint = /fingerprint|request[_-]?hash|payload[_-]?hash/i.test(source)
const hasDurableStore = /IDEMPOTENCY_BROKER_URL|_broker_json|Firestore|GCS/i.test(source) && /Firestore|@google-cloud\/storage|runTransaction|object\.save/i.test(brokerStore)
const hasTerminalReplay = /succeeded|terminal|completed|replay|cached.*result/i.test(source)
const hasConflict = /conflict|409|same.*key.*different|fingerprint.*mismatch/i.test(source)
const hasCancellation = /cancel|abort|cancellation/i.test(source)
const checks = [
	{ id: 'worker-source-present', status: source ? 'PASS' : 'BLOCKED' },
	{ id: 'idempotency-header-consumed', status: hasHeader ? 'PASS' : 'BLOCKED' },
	{ id: 'request-fingerprint-bound', status: hasFingerprint ? 'PASS' : 'BLOCKED' },
	{ id: 'durable-cross-instance-key-store', status: hasDurableStore ? 'PASS' : 'BLOCKED' },
	{ id: 'terminal-result-replay', status: hasTerminalReplay ? 'PASS' : 'BLOCKED' },
	{ id: 'conflicting-input-rejected', status: hasConflict ? 'PASS' : 'BLOCKED' },
	{ id: 'cancellation-terminal-semantics', status: hasCancellation ? 'PASS' : 'BLOCKED' },
	{ id: 'live-cross-account-broker-evidence', status: liveEvidence?.status === 'PASS' && liveEvidence?.crossAccountReplay === true && liveEvidence?.conflictRejected === true && liveEvidence?.cancelledTerminal === true ? 'PASS' : 'BLOCKED' },
]
const blockers = checks.filter(check => check.status !== 'PASS').map(check => check.id)
const report = {
	schemaVersion: 'betterpptx.avatar-worker-idempotency.v1',
	status: blockers.length ? 'BLOCKED' : 'PASS',
	checks,
	blockers,
	workerSourcePresent: Boolean(source),
	mutationsPerformed: false,
	rawSecretsPrinted: false,
}
const outputPath = path.join(root, 'outputs', 'avatar-worker-idempotency-report.json')
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 2
