// IMG6 bounded repair-loop tests. Uses local synthetic state only; no image/provider call.
import { diagnoseRepair, runBoundedRepairLoop } from './quality/repair-loop.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}
const diagnosis = diagnoseRepair({ deterministic: { status: 'fail', blockingIssues: ['PALETTECOMPATIBLE', 'QUIETSPACE'] }, semantic: { status: 'reject', blockingIssues: ['MESSAGEFIT'] } })
ok('diagnosis maps issues to bounded actions', diagnosis.primaryAction === 'edit' && diagnosis.actions.length === 3)
ok('unknown issues use safe regenerate fallback', diagnoseRepair({ deterministic: { status: 'fail', blockingIssues: ['UNKNOWN'] } }).primaryAction === 'regenerate')
const states = [
	{ id: 'initial', score: 1, costUsd: 0 },
	{ id: 'candidate-1', score: 2, costUsd: 0.01 },
	{ id: 'candidate-2', score: 4, costUsd: 0.01 },
]
const result = await runBoundedRepairLoop({
	initialCandidate: states[0], maxAttempts: 3, costCeilingUsd: 0.05,
	evaluate: async candidate => candidate.id === 'initial'
		? { status: 'fail', score: candidate.score, deterministic: { status: 'fail', blockingIssues: ['PALETTECOMPATIBLE'] } }
		: { status: 'pass', score: candidate.score, deterministic: { status: 'pass', blockingIssues: [] } },
	repair: async ({ attempt }) => states[attempt],
})
ok('monotonic repair accepts improved hard-gated candidate', result.status === 'complete' && result.bestCandidate.id === 'candidate-1')
ok('repair attempts are bounded', result.bounded && result.attempts.length <= 3)
ok('cost is accumulated and remains under ceiling', result.totalCostUsd === 0.01 && result.totalCostUsd <= 0.05)
const rejected = await runBoundedRepairLoop({
	initialCandidate: { id: 'initial' }, maxAttempts: 2,
	evaluate: async candidate => candidate.id === 'initial' ? { status: 'fail', score: 2, deterministic: { status: 'fail', blockingIssues: ['MINIMUMVISUALINFORMATION'] } } : { status: 'fail', score: 1, deterministic: { status: 'fail', blockingIssues: ['MINIMUMVISUALINFORMATION'] } },
	repair: async () => ({ id: 'worse', costUsd: 0.01 }),
})
ok('worse candidate is rejected and best prior is retained', rejected.bestCandidate.id === 'initial' && rejected.status === 'best-effort')
const ceiling = await runBoundedRepairLoop({
	initialCandidate: { id: 'initial' }, maxAttempts: 4, costCeilingUsd: 0.01,
	evaluate: async candidate => ({ status: 'fail', score: 1, deterministic: { status: 'fail', blockingIssues: ['NOREADABLETEXT'] } }),
	repair: async () => ({ id: 'over-budget', costUsd: 0.02 }),
})
ok('candidate over cost ceiling is never evaluated or accepted', ceiling.attempts[0].status === 'cost-ceiling' && ceiling.totalCostUsd === 0)
const noCandidate = await runBoundedRepairLoop({
	initialCandidate: { id: 'initial' }, maxAttempts: 1,
	evaluate: async () => ({ status: 'fail', score: 1, deterministic: { status: 'fail', blockingIssues: ['FOCALREGIONPRESENT'] } }),
	repair: async () => null,
})
ok('missing repair candidate falls back safely', noCandidate.status === 'best-effort' && noCandidate.attempts[0].status === 'no-candidate')
ok('zero-attempt loop is a no-op', (await runBoundedRepairLoop({ initialCandidate: { id: 'x' }, maxAttempts: 0 })).attempts.length === 0)

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
