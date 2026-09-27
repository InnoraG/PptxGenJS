// Run the private semantic judge across the full >=20 pairwise calibration
// packet. Human labels are intentionally optional: only the four carried
// records have known human choices today. This benchmark never promotes the
// judge and never fabricates missing labels.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokeSemanticJudgeWorker, sanitizeSemanticJudgeWorkerResponse } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const packet = JSON.parse(await fs.readFile(path.join(root, 'photorealistic-pairwise-calibration-packet.json'), 'utf8'))
const human = JSON.parse(await fs.readFile(path.join(root, 'photorealistic-pairwise-review-report.json'), 'utf8'))
const usdPerGpuSecond = 0.000542
const totalResearchBudgetUsd = 1.00
const scorecardFor = result => {
	const scorecard = result?.scorecard
	const scores = scorecard?.scores || {}
	const values = ['messageFit', 'composition', 'worldFit', 'seriesCoherence'].map(key => Number(scores[key])).filter(Number.isFinite)
	if (!values.length) return null
	return {
		status: scorecard.status || 'complete',
		confidence: Number.isFinite(Number(scorecard.confidence)) ? Number(scorecard.confidence) : null,
		scores: Object.fromEntries(['messageFit', 'composition', 'worldFit', 'seriesCoherence'].map(key => [key, Number.isFinite(Number(scores[key])) ? Number(scores[key]) : null])),
		meanScore: values.reduce((sum, value) => sum + value, 0) / values.length,
		issues: Array.isArray(scorecard.issues) ? scorecard.issues.slice(0, 2).map(value => String(value).slice(0, 160)) : [],
	}
}
const choose = (left, right) => {
	if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) < 0.05) return 'tie'
	return left > right ? 'left' : 'right'
}
const humanByPair = new Map((human.pairResults || []).map(item => [item.pairId, item.consensusChoice]))
const results = []
let totalGpuSeconds = 0
let failures = 0
for (const pair of packet.pairs) {
	const brief = { semanticBrief: { message: pair.message, purpose: 'contextual presentation visual comparison', world: pair.world, composition: { position: pair.position, noText: true, aspect: 'landscape' } } }
	const sides = {}
	for (const side of ['left', 'right']) {
		const image = await fs.readFile(path.join(root, pair[side].fileName))
		const invoked = await invokeSemanticJudgeWorker({ dataUri: `data:image/png;base64,${image.toString('base64')}`, request: brief })
		const sanitized = sanitizeSemanticJudgeWorkerResponse(invoked)
		const meter = invoked?.metering || null
		const gpuSeconds = Number(meter?.gpuSeconds || 0)
		totalGpuSeconds += Number.isFinite(gpuSeconds) ? gpuSeconds : 0
		if (sanitized.status !== 'complete') failures++
		sides[side] = {
			status: sanitized.status,
			scorecard: sanitized.status === 'complete' ? scorecardFor({ scorecard: sanitized.scorecard }) : null,
			metering: meter ? { gpuSeconds, coldStart: Boolean(meter.coldStart), gpuType: meter.gpuType || null, gpuCostUsd: Math.round(gpuSeconds * usdPerGpuSecond * 1e8) / 1e8 } : null,
			attempts: Number(invoked?.attempts || 0),
		}
	}
	const leftScore = sides.left.scorecard?.meanScore
	const rightScore = sides.right.scorecard?.meanScore
	const judgeChoice = choose(leftScore, rightScore)
	results.push({ pairId: pair.pairId, caseId: pair.caseId, humanChoice: humanByPair.get(pair.pairId) || null, judgeChoice, judgeAgreement: humanByPair.has(pair.pairId) ? humanByPair.get(pair.pairId) === judgeChoice : null, sides })
}
const totalGpuCostUsd = Math.round(totalGpuSeconds * usdPerGpuSecond * 1e8) / 1e8
const knownHuman = results.filter(result => result.humanChoice)
const knownAgreement = knownHuman.length ? knownHuman.filter(result => result.judgeAgreement).length / knownHuman.length : null
const report = {
	schemaVersion: 'betterpptx.photorealistic-pairwise-calibration-judge.v1',
	status: failures === 0 && totalGpuCostUsd <= totalResearchBudgetUsd ? 'research-pairwise-calibration-judge-pass' : 'research-pairwise-calibration-judge-fail',
	scope: '20-pair owned-synthetic benchmark; not production calibration',
	packetDigest: crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'photorealistic-pairwise-calibration-packet.json'))).digest('hex'),
	pairCount: packet.pairs.length,
	judgeCalls: packet.pairs.length * 2,
	failures,
	knownHumanLabelCount: knownHuman.length,
	knownHumanAgreement: knownAgreement,
	totalGpuSeconds,
	totalGpuCostUsd,
	totalResearchBudgetUsd,
	judgeTieCount: results.filter(result => result.judgeChoice === 'tie').length,
	judgeLaneChoices: Object.fromEntries(['left', 'right', 'tie'].map(choice => [choice, results.filter(result => result.judgeChoice === choice).length])),
	results,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	modelPromotion: false,
	note: 'This is a full-packet judge benchmark. Missing human choices remain null; no kappa or auto-accept decision is claimed until all 20 human pairwise records are independently supplied and pass the separate calibration gate.',
}
const outputPath = path.join(root, 'photorealistic-pairwise-calibration-judge-report.json')
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status.endsWith('pass') ? 'ok  ' : 'FAIL'} judge benchmark (${report.pairCount} pairs, ${report.judgeCalls} calls)`)
console.log(`  ${failures === 0 ? 'ok  ' : 'FAIL'} valid sanitized scorecards (${report.pairCount * 2 - failures}/${report.pairCount * 2})`)
console.log(`  ${totalGpuCostUsd <= totalResearchBudgetUsd ? 'ok  ' : 'FAIL'} research GPU budget ($${totalGpuCostUsd.toFixed(6)})`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status.endsWith('pass') ? 0 : 1)

