// IMG5 semantic-judge contract tests. No VLM, network, or customer image is used.
import { evaluateSemanticJudge, sanitizeJudgeResult } from './quality/semantic-judge.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}
const deterministicPass = { status: 'pass' }
const valid = {
	status: 'complete', version: 'synthetic-judge-v1', calibrationId: 'owner-calibration-v1', calibrated: true,
	confidence: 0.92, scores: { messageFit: 4.4, composition: 4.1, worldFit: 4.2, seriesCoherence: 3.9 },
}
const accepted = evaluateSemanticJudge(valid, { deterministicReport: deterministicPass })
ok('calibrated strong scorecard passes', accepted.status === 'pass' && accepted.weightedTotal >= 3.5)
ok('all four score dimensions are retained', Object.keys(accepted.scores).length === 4)
ok('confidence and calibration are hard checks', accepted.checks.confidence && accepted.checks.calibrated)
const missing = evaluateSemanticJudge({}, { deterministicReport: deterministicPass })
ok('missing judge result abstains', missing.status === 'abstain' && missing.reason === 'SEMANTIC_JUDGE_RESULT_UNAVAILABLE')
const uncalibrated = evaluateSemanticJudge({ ...valid, calibrated: false, calibrationId: null }, { deterministicReport: deterministicPass })
ok('uncalibrated result cannot auto-accept', uncalibrated.status === 'reject' && uncalibrated.blockingIssues.includes('CALIBRATED'))
const researchAccepted = evaluateSemanticJudge({ ...valid, calibrated: false, calibrationId: null }, { deterministicReport: deterministicPass, researchExecutionOverride: true })
ok('owner-directed research override accepts execution without promotion', researchAccepted.status === 'research-pass' && researchAccepted.executionAccepted === true && researchAccepted.promotionEligible === false && researchAccepted.autoAcceptEnabled === false)
const lowCritical = evaluateSemanticJudge({ ...valid, scores: { ...valid.scores, messageFit: 1.7 } }, { deterministicReport: deterministicPass })
ok('critical low dimension rejects', lowCritical.status === 'reject' && lowCritical.blockingIssues.includes('NocrITICALLOWDIMENSION'.toUpperCase()))
const lowConfidence = evaluateSemanticJudge({ ...valid, confidence: 0.4 }, { deterministicReport: deterministicPass })
ok('low confidence rejects', lowConfidence.status === 'reject' && lowConfidence.blockingIssues.includes('CONFIDENCE'))
const deterministicFail = evaluateSemanticJudge(valid, { deterministicReport: { status: 'fail' } })
ok('semantic judge cannot override deterministic failure', deterministicFail.status === 'abstain' && deterministicFail.reason === 'DETERMINISTIC_HARD_GATES_NOT_PASSED')
const malformed = sanitizeJudgeResult({ ...valid, scores: { ...valid.scores, composition: 'not-a-score' } })
ok('malformed scorecard is rejected before evaluation', malformed === null)
const bounded = sanitizeJudgeResult({ ...valid, issues: Array.from({ length: 30 }, (_, index) => `issue-${index}`) })
ok('judge issue text is bounded', bounded.issues.length === 12 && bounded.issues.every(value => value.length < 160))

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
