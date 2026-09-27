#!/usr/bin/env node
// Offline contract for owner-configurable weighted avatar-worker selection.
// No credential store, network, worker, GPU, or customer media is touched.
import fs from 'node:fs'
import path from 'node:path'
import { avatarWorkerSelectionWeight, avatarWorkerStartIndex } from './avatar/providers/musetalkHttp.mjs'

const accounts = [
	{ id: 'worker-a', weight: '3' },
	{ id: 'worker-b', weight: '1' },
]
const previousMode = process.env.BETTERPPTX_AVATAR_ROTATION_MODE
let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
try {
	process.env.BETTERPPTX_AVATAR_ROTATION_MODE = 'weighted'
	ok('invalid/non-positive weights fall back to one', avatarWorkerSelectionWeight({ weight: '0' }) === 1 && avatarWorkerSelectionWeight({ weight: 'nope' }) === 1)
	ok('configured weights are read as positive numeric values', avatarWorkerSelectionWeight(accounts[0]) === 3 && avatarWorkerSelectionWeight(accounts[1]) === 1)
	const stableA = avatarWorkerStartIndex(accounts, 'weighted-stable-key')
	const stableB = avatarWorkerStartIndex(accounts, 'weighted-stable-key')
	ok('same idempotency key selects the same weighted account', stableA === stableB)
	const counts = [0, 0]
	for (let i = 0; i < 400; i++) counts[avatarWorkerStartIndex(accounts, `weighted-distribution-${i}`)]++
	const ratio = counts[0] / (counts[0] + counts[1])
	ok('weighted distribution favors the 3x account without starving the 1x account', counts[0] > counts[1] && counts[1] > 0 && ratio > 0.62 && ratio < 0.88, JSON.stringify({ counts, ratio }))
	const report = {
		schemaVersion: 'betterpptx.avatar-weighted-rotation.v1',
		status: fail ? 'FAIL' : 'PASS',
		scope: 'local-contract / no-network / no-provider-call',
		checks: { passed: pass, failed: fail, stableIdempotency: stableA === stableB, distribution: { counts, ratio } },
		selectionMode: 'weighted',
		ownerMetadata: 'BETTERPPTX_AVATAR_WORKER_WEIGHT',
		boundary: 'Static weights are proven locally; distributed quota/cost accounting remains a separate production gate.',
		secrets: false,
		customerData: false,
	}
	const output = path.resolve('betterpptx-mcp/outputs/avatar-weighted-rotation-report.json')
	fs.mkdirSync(path.dirname(output), { recursive: true })
	fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
	console.log(JSON.stringify(report, null, 2))
} finally {
	if (previousMode === undefined) delete process.env.BETTERPPTX_AVATAR_ROTATION_MODE
	else process.env.BETTERPPTX_AVATAR_ROTATION_MODE = previousMode
}
process.exitCode = fail ? 1 : 0
