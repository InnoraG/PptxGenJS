// Corpus-scoped pairwise Qwen judge preview. It compares the same four
// blinded contextual pairs used by the independent reviewers. This is real
// private Modal research evidence, not the >=20-record production calibration.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokeSemanticJudgeWorker, sanitizeSemanticJudgeWorkerResponse } from './quality/semantic-judge-worker-client.mjs'
import { evaluatePairwiseCalibration } from './quality/pairwise-calibration.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const packetPath = path.join(outputRoot, 'photorealistic-pairwise-review-packet.json')
const humanPath = path.join(outputRoot, 'photorealistic-pairwise-review-report.json')
const packet = JSON.parse(await fs.readFile(packetPath, 'utf8'))
const human = JSON.parse(await fs.readFile(humanPath, 'utf8'))
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const usdPerGpuSecond = 0.000542
const warmGpuCeilingUsd = 0.10
const totalResearchBudgetUsd = 1.00
const score = result => {
	const scores = result?.scorecard?.scores || {}
	const values = ['messageFit', 'composition', 'worldFit', 'seriesCoherence'].map(key => Number(scores[key])).filter(Number.isFinite)
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}
const sanitize = result => {
	const scorecard = result?.scorecard || {}
	return {
		status: scorecard.status || result?.status || 'abstain',
		confidence: Number.isFinite(Number(scorecard.confidence)) ? Number(scorecard.confidence) : null,
		scores: Object.fromEntries(['messageFit', 'composition', 'worldFit', 'seriesCoherence'].map(key => [key, Number.isFinite(Number(scorecard.scores?.[key])) ? Number(scorecard.scores[key]) : null])),
		meanScore: score(result),
		weightedTotal: Number.isFinite(Number(scorecard.weightedTotal)) ? Number(scorecard.weightedTotal) : null,
	}
}

if (human.status !== 'reviewer-pairwise-pass' || human.packetDigest !== digest(await fs.readFile(packetPath))) {
	throw new Error('Pairwise human report is not a valid passing report for the current packet.')
}

const humanByPair = new Map(human.pairResults.map(item => [item.pairId, item.consensusChoice]))
const results = []
let totalGpuSeconds = 0
let failures = 0
for (const pair of packet.pairs) {
	const brief = {
		semanticBrief: {
			message: pair.message,
			purpose: 'contextual presentation visual comparison',
			world: pair.world,
			composition: { position: pair.position, noText: true, aspect: 'landscape' },
		},
	}
	const laneResults = {}
	for (const side of ['left', 'right']) {
		const file = await fs.readFile(path.join(outputRoot, pair[side].fileName))
		const invoked = await invokeSemanticJudgeWorker({ dataUri: `data:image/png;base64,${file.toString('base64')}`, request: brief })
		const sanitized = sanitizeSemanticJudgeWorkerResponse(invoked)
		const metering = invoked?.metering || null
		const gpuSeconds = Number(metering?.gpuSeconds || 0)
		totalGpuSeconds += Number.isFinite(gpuSeconds) ? gpuSeconds : 0
		const safe = sanitized.status === 'complete'
		if (!safe) failures += 1
		laneResults[side] = {
			status: safe ? 'complete' : 'abstain',
			scorecard: safe ? sanitize({ scorecard: sanitized.scorecard }) : null,
			metering: metering ? { gpuSeconds, coldStart: Boolean(metering.coldStart), gpuType: metering.gpuType || null, gpuCostUsd: Math.round(gpuSeconds * usdPerGpuSecond * 1e8) / 1e8 } : null,
			attempts: Number(invoked?.attempts || 0),
		}
	}
	const leftMean = laneResults.left.scorecard?.meanScore
	const rightMean = laneResults.right.scorecard?.meanScore
	let judgeChoice = 'tie'
	if (Number.isFinite(leftMean) && Number.isFinite(rightMean) && Math.abs(leftMean - rightMean) >= 0.05) judgeChoice = leftMean > rightMean ? 'left' : 'right'
	const humanChoice = humanByPair.get(pair.pairId) || 'tie'
	results.push({ pairId: pair.pairId, caseId: pair.caseId, humanChoice, judgeChoice, judgeAgreement: humanChoice === judgeChoice, sides: laneResults })
}

const calibration = evaluatePairwiseCalibration(results.map(record => ({ humanChoice: record.humanChoice, judgeChoice: record.judgeChoice })), { minRecords: 4, overallMinimum: 0.65 })
const totalGpuCostUsd = Math.round(totalGpuSeconds * usdPerGpuSecond * 1e8) / 1e8
const report = {
	schemaVersion: 'betterpptx.photorealistic-pairwise-judge-preview.v1',
	status: failures === 0 && totalGpuCostUsd <= totalResearchBudgetUsd ? 'research-pairwise-judge-preview-pass' : 'research-pairwise-judge-preview-fail',
	scope: 'four-case contextual corpus; not production calibration',
	packetDigest: human.packetDigest,
	recordCount: results.length,
	judgeCalls: results.length * 2,
	failures,
	calibration,
	observedAgreement: results.length ? results.filter(record => record.judgeAgreement).length / results.length : 0,
	totalGpuSeconds,
	totalGpuCostUsd,
	warmGpuCeilingUsd,
	totalResearchBudgetUsd,
	results,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	modelPromotion: false,
	note: 'This preview compares a private judge with supplied human pairwise choices on four cases only. The production gate remains blocked until at least 20 complete pairwise records and owner/runtime review pass.',
}
const outputPath = path.join(outputRoot, 'photorealistic-pairwise-judge-preview-report.json')
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status.endsWith('pass') ? 'ok  ' : 'FAIL'} private Qwen pairwise preview (${results.length} comparisons, ${report.judgeCalls} calls)`)
console.log(`  ${calibration.status === 'pass' ? 'ok  ' : 'OPEN'} corpus-scoped judge/human agreement (kappa=${calibration.kappa ?? 'null'})`)
console.log(`  ${totalGpuCostUsd <= totalResearchBudgetUsd ? 'ok  ' : 'FAIL'} GPU research budget ($${totalGpuCostUsd.toFixed(6)})`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status.endsWith('pass') ? 0 : 1)
