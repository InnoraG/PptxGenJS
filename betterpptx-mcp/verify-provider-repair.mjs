// IMG6 provider-backed repair tests. All candidates are local synthetic records;
// no network, Modal call, or customer image is used by this contract gate.
import assert from 'node:assert/strict'
import { imageQualityScore, runProviderBackedImageRepair } from './quality/provider-repair.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}

const quality = (status, checks, weightedTotal = null) => ({
	status: 'pass',
	deterministic: { status, checks, blockingIssues: status === 'pass' ? [] : Object.keys(checks).filter(key => !checks[key]).map(key => key.toUpperCase()) },
	semantic: weightedTotal == null ? { status: 'abstain' } : { status: weightedTotal >= 3.5 ? 'pass' : 'reject', weightedTotal, blockingIssues: weightedTotal >= 3.5 ? [] : ['WEIGHTEDSCORE'] },
})

ok('deterministic gates dominate score', imageQualityScore(quality('pass', { validPayload: true, focalRegionPresent: true })) > imageQualityScore(quality('fail', { validPayload: false, focalRegionPresent: true }, 5)))
ok('semantic score breaks deterministic ties', imageQualityScore(quality('pass', { validPayload: true }, 4.5)) > imageQualityScore(quality('pass', { validPayload: true }, 3.5)))

const states = [
	{ id: 'repaired', quality: quality('pass', { validPayload: true, focalRegionPresent: true }, 4.4), costUsd: 0.01 },
]
const actions = []
const result = await runProviderBackedImageRepair({
	initialCandidate: { id: 'initial' },
	maxAttempts: 2,
	costCeilingUsd: 0.02,
	evaluate: async candidate => candidate.id === 'initial' ? quality('fail', { validPayload: true, focalRegionPresent: false }) : states[0].quality,
	generate: async ({ action, instruction, attempt }) => { actions.push({ action, instruction, attempt }); return states[attempt - 1] },
})
ok('provider callback receives diagnosis action', actions[0]?.action === 'reframe')
ok('provider callback receives bounded repair instruction', actions[0]?.instruction.includes('focal placement'))
ok('improved provider candidate is accepted', result.status === 'complete' && result.bestCandidate.id === 'repaired')
ok('repair cost is metered and bounded', result.totalCostUsd === 0.01 && result.bounded)

const rejected = await runProviderBackedImageRepair({
	initialCandidate: { id: 'initial' },
	maxAttempts: 1,
	costCeilingUsd: 0.005,
	evaluate: async () => quality('fail', { validPayload: false }),
	generate: async () => ({ id: 'too-expensive', costUsd: 0.01 }),
})
ok('over-ceiling candidate is retained as best effort', rejected.status === 'best-effort' && rejected.attempts[0]?.status === 'cost-ceiling')

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
assert.equal(fail, 0)
