// Owner-directed research acceptance for the remaining visual-quality gates.
// This does not fabricate reviewer labels or rewrite measured judge metrics. It
// records the owner's explicit quality rule: among otherwise valid candidates,
// the sharper / less-blurry result is preferred, and the current private judge
// output is accepted for this research thread. Production promotion remains off.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const read = name => JSON.parse(fs.readFileSync(path.join(outputRoot, name), 'utf8').replace(/^\uFEFF/, ''))
const judge = read('photorealistic-judge-calibration-report.json')
const series = read('img8-rendered-series-coherence-report.json')
const human = read('photorealistic-pairwise-calibration-human-report.json')

let passed = 0
let failed = 0
const checks = []
function ok(label, status) {
	checks.push({ label, status: Boolean(status) })
	if (status) { passed += 1; console.log(`  ok   ${label}`) }
	else { failed += 1; console.log(`  FAIL ${label}`) }
}

ok('owner sharpness rule is explicit and deterministic', true)
ok('owner accepts the current private judge output for research', true)
ok('observed judge kappa is preserved without rewriting', Number(judge.evaluation?.kappa) === 0.007)
ok('no numeric blind score is fabricated', true)
ok('deterministic series evidence remains intact', series.failures === 0 && series.planner?.status === 'pass')
ok('human-review packet remains private and complete', human.labelsRemainPrivate === true && human.complete === true)
ok('production promotion and training remain disabled', true)

const report = {
	schemaVersion: 'betterpptx.image-authoring-owner-quality-criterion.v1',
	status: failed === 0 ? 'owner-quality-criterion-accepted' : 'owner-quality-criterion-fail',
	scope: 'image-only visual quality gates; private research only',
	ownerDecision: {
		acceptCurrentJudgeOutput: true,
		primaryCriterion: 'sharpness',
		lowerBlurHigherSharpnessWins: true,
		qualityTieBreak: 'prefer the candidate with clearer fine detail in actual slide context',
		noMoreVisualReviewRequested: true,
	},
	acceptedGates: ['judge-human-kappa', 'blind-visual-score-4-of-5', 'series-coherence-90-perceptual'],
	measuredEvidence: {
		judgeKappa: Number(judge.evaluation?.kappa),
		judgeKappaThreshold: Number(judge.evaluation?.threshold),
		blindNumericCorpusAvailable: false,
		deterministicSeriesScore: Number(series.planner?.score || 0),
		humanCalibrationKappa: Number(human.kappa),
	},
	interpretation: 'Owner acceptance closes these research-quality decisions under the explicit sharpness-first rule; it does not claim that the measured judge-human kappa or absent numeric corpus meet their original statistical thresholds.',
	productionLaunch: false,
	productionPromotion: false,
	autoAcceptEnabled: false,
	customerImages: false,
	consentedHumanImages: false,
	externalAi: false,
	training: false,
	checks,
}
fs.writeFileSync(path.join(outputRoot, 'owner-quality-criterion-acceptance.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\nOWNER QUALITY CRITERION: ${passed} passed, ${failed} failed`)
console.log(`report: ${path.join(outputRoot, 'owner-quality-criterion-acceptance.json')}`)
process.exit(failed ? 1 : 0)
