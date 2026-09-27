// Offline integrity gate for the frozen owned-synthetic live evidence. No network, Modal, or GPU.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deploy', 'image-edit-worker')
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'canary-evidence.json'), 'utf8'))
const benchmark = JSON.parse(fs.readFileSync(path.join(root, 'canary-benchmark.json'), 'utf8'))
const multi = JSON.parse(fs.readFileSync(path.join(root, 'canary-multi-reference.json'), 'utf8'))
let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const close = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance
const rubricValues = Object.values(evidence.runs).flatMap(run => Object.values(run.visualRubric || {}))

console.log('IMG2 LIVE CANARY EVIDENCE (offline integrity):')
ok('all frozen artifacts exist and match their SHA-256', evidence.artifacts.every(item => {
	const file = path.join(root, item.path)
	return fs.existsSync(file) && sha256(file) === item.sha256
}))
ok('only owned synthetic references were used', evidence.referencePolicy.kind === 'owned-synthetic' && evidence.referencePolicy.humanOrCustomerInputUsed === false && evidence.referencePolicy.consentedHumanAssetSentToCloud === false)
ok('no training was used', evidence.referencePolicy.trainingUsed === false)
ok('cold/warm report proves byte-identical output', benchmark.identicalOutputDigest === true && new Set(benchmark.records.map(item => item.sha256)).size === 1)
ok('multi-reference report binds two inputs and one exact output', multi.inputs.length === 2 && multi.outputSha256 === evidence.artifacts.find(item => item.role === 'multi-reference-output').sha256)
ok('recorded metrics match raw reports', close(evidence.runs.coldWarmDeterminism.gpuSeconds, benchmark.records.reduce((sum, item) => sum + item.gpuSeconds, 0)) && close(evidence.runs.multiReference.gpuSeconds, multi.metrics.gpuSeconds))
ok('every explicit visual-rubric item passed', rubricValues.length >= 11 && rubricValues.every(value => value === 'PASS'))
ok('response and distinct-output counts are honest', evidence.economics.totalResponses === 4 && evidence.economics.acceptedResponses === 4 && evidence.economics.distinctAcceptedOutputDigests === 2)
const expectedCost = evidence.economics.totalGpuSeconds * evidence.pricingBasis.usdPerGpuSecond
ok('total GPU-only cost is arithmetically exact', close(evidence.economics.totalGpuPortionUsd, expectedCost))
ok('per-response and per-distinct-visual costs are exact', close(evidence.economics.gpuPortionPerAcceptedResponseUsd, expectedCost / evidence.economics.acceptedResponses) && close(evidence.economics.gpuPortionPerDistinctAcceptedVisualUsd, expectedCost / evidence.economics.distinctAcceptedOutputDigests))
ok('unmeasured peak memory stays explicit', Object.values(evidence.runs).every(run => run.peakMemoryMeasured === false))
ok('limitations prohibit corpus-wide or full-cost overclaim', evidence.limitations.some(item => /not a representative quality corpus/i.test(item)) && evidence.limitations.some(item => /not included/i.test(item)))

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
