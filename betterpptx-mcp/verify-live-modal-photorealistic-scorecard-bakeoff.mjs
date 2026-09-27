// Research-only experiment: score each side independently through the private
// Qwen scorecard endpoint, then compare the two bounded weighted totals locally.
// This never changes the pairwise judge, invents labels, or enables promotion.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokeSemanticJudgeWorker, sanitizeSemanticJudgeWorkerResponse } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const packetBytes = await fs.readFile(path.join(root, 'photorealistic-pairwise-calibration-packet.json'))
const packet = JSON.parse(packetBytes.toString('utf8'))
const human = JSON.parse(await fs.readFile(path.join(root, 'photorealistic-pairwise-review-report.json'), 'utf8'))
const humanByPair = new Map((human.pairResults || []).map(item => [item.pairId, item.consensusChoice]))
const maxPairs = Math.max(1, Math.min(Number(process.env.BETTERPPTX_SCORECARD_BAKEOFF_MAX_PAIRS || 4), packet.pairs.length))
const timeoutMs = Math.max(5000, Math.min(Number(process.env.BETTERPPTX_SCORECARD_BAKEOFF_TIMEOUT_MS || 60000), 120000))
const usdPerGpuSecond = 0.000542
const results = []
let totalGpuSeconds = 0
let failures = 0

const total = scorecard => {
	const scores = scorecard?.scores || {}
	const weights = { messageFit: 0.35, composition: 0.25, worldFit: 0.25, seriesCoherence: 0.15 }
	return Object.entries(weights).reduce((sum, [dimension, weight]) => sum + Math.max(0, Math.min(5, Number(scores[dimension]) || 0)) * weight, 0)
}

for (const pair of packet.pairs.slice(0, maxPairs)) {
	const brief = { semanticBrief: { message: pair.message, purpose: 'contextual presentation visual comparison', world: pair.world, composition: { position: pair.position, noText: true, aspect: 'landscape' } } }
	const sides = {}
	for (const side of ['left', 'right']) {
		const bytes = await fs.readFile(path.join(root, pair[side].fileName))
		const invoked = await invokeSemanticJudgeWorker({ dataUri: `data:image/png;base64,${bytes.toString('base64')}`, request: brief, timeoutMs })
		const sanitized = sanitizeSemanticJudgeWorkerResponse({ scorecard: invoked?.scorecard })
		const gpuSeconds = Number(invoked?.metering?.gpuSeconds || 0)
		if (Number.isFinite(gpuSeconds)) totalGpuSeconds += gpuSeconds
		if (sanitized.status !== 'complete') failures++
		sides[side] = sanitized.status === 'complete' ? { scorecard: sanitized.scorecard, total: total(sanitized.scorecard), metering: invoked?.metering || null } : { status: sanitized.status }
	}
	const leftTotal = Number(sides.left.total)
	const rightTotal = Number(sides.right.total)
	const choice = Number.isFinite(leftTotal) && Number.isFinite(rightTotal)
		? Math.abs(leftTotal - rightTotal) < 0.25 ? 'tie' : leftTotal > rightTotal ? 'left' : 'right'
		: 'tie'
	results.push({ pairId: pair.pairId, caseId: pair.caseId, humanChoice: humanByPair.get(pair.pairId) || null, judgeChoice: choice, judgeAgreement: humanByPair.has(pair.pairId) ? humanByPair.get(pair.pairId) === choice : null, left: sides.left, right: sides.right })
}

const known = results.filter(item => item.humanChoice)
const agreement = known.length ? known.filter(item => item.judgeAgreement).length / known.length : null
const report = {
	schemaVersion: 'betterpptx.photorealistic-scorecard-bakeoff.v1',
	status: failures === 0 ? 'research-scorecard-bakeoff-pass' : 'research-scorecard-bakeoff-fail',
	packetDigest: crypto.createHash('sha256').update(packetBytes).digest('hex'),
	pairCount: maxPairs,
	judgeCalls: maxPairs * 2,
	failures,
	knownHumanLabelCount: known.length,
	knownHumanAgreement: agreement,
	totalGpuSeconds,
	totalGpuCostUsd: Math.round(totalGpuSeconds * usdPerGpuSecond * 1e8) / 1e8,
	results,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	modelPromotion: false,
	note: 'Independent scorecards are compared locally as a research experiment. This does not replace pairwise human calibration or authorize auto-accept.',
}
const outputName = path.basename(String(process.env.BETTERPPTX_SCORECARD_BAKEOFF_OUTPUT || 'photorealistic-scorecard-bakeoff-report.json'))
const outputPath = path.join(root, outputName)
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${failures === 0 ? 'ok  ' : 'FAIL'} scorecard bakeoff (${maxPairs} pairs, ${maxPairs * 2} calls)`)
console.log(`  ${known.length ? 'ok  ' : 'FAIL'} known-label agreement (${known.length ? `${known.filter(item => item.judgeAgreement).length}/${known.length}` : 'none'})`)
console.log(`  ok   research GPU budget ($${report.totalGpuCostUsd.toFixed(6)})`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(failures ? 1 : 0)
