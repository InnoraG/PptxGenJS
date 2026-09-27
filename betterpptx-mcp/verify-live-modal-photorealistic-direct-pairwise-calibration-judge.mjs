// Run the private Modal judge in a true side-by-side mode. This deliberately
// uses one call per pair so the model chooses between both pixel arrays rather
// than producing two independent scorecards that are compared locally.
// No human labels are invented and no promotion is implied by a runtime pass.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokeSemanticJudgePairWorker, sanitizeSemanticJudgePairwiseResponse } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const packetBytes = await fs.readFile(path.join(root, 'photorealistic-pairwise-calibration-packet.json'))
const packet = JSON.parse(packetBytes.toString('utf8'))
const human = JSON.parse(await fs.readFile(path.join(root, 'photorealistic-pairwise-review-report.json'), 'utf8'))
const usdPerGpuSecond = 0.000542
const totalResearchBudgetUsd = 1.00
// Keep a bounded research probe from hanging on an unauthenticated or retired endpoint. The
// client still rotates both approved accounts; this only caps each HTTP attempt.
const perAccountTimeoutMs = Math.max(5000, Math.min(Number(process.env.BETTERPPTX_DIRECT_JUDGE_TIMEOUT_MS || 45000), 120000))
const maxPairs = Math.max(1, Math.min(Number(process.env.BETTERPPTX_DIRECT_JUDGE_MAX_PAIRS || packet.pairs.length), packet.pairs.length))
const humanByPair = new Map((human.pairResults || []).map(item => [item.pairId, item.consensusChoice]))
const results = []
let totalGpuSeconds = 0
let failures = 0

for (const pair of packet.pairs.slice(0, maxPairs)) {
	const brief = { semanticBrief: { message: pair.message, purpose: 'contextual presentation visual comparison', world: pair.world, composition: { position: pair.position, noText: true, aspect: 'landscape' } } }
	const left = await fs.readFile(path.join(root, pair.left.fileName))
	const right = await fs.readFile(path.join(root, pair.right.fileName))
	const invoked = await invokeSemanticJudgePairWorker({
		leftDataUri: `data:image/png;base64,${left.toString('base64')}`,
		rightDataUri: `data:image/png;base64,${right.toString('base64')}`,
		request: brief,
		timeoutMs: perAccountTimeoutMs,
	})
	const sanitized = sanitizeSemanticJudgePairwiseResponse({ pairwise: invoked?.pairwise })
	const meter = invoked?.metering || null
	const gpuSeconds = Number(meter?.gpuSeconds || 0)
	if (Number.isFinite(gpuSeconds)) totalGpuSeconds += gpuSeconds
	if (sanitized.status !== 'complete') failures++
	const judgeChoice = sanitized.status === 'complete' ? sanitized.pairwise.choice : 'tie'
	results.push({
		pairId: pair.pairId,
		caseId: pair.caseId,
		humanChoice: humanByPair.get(pair.pairId) || null,
		judgeChoice,
		judgeAgreement: humanByPair.has(pair.pairId) ? humanByPair.get(pair.pairId) === judgeChoice : null,
		pairwise: sanitized.status === 'complete' ? sanitized.pairwise : null,
		status: sanitized.status,
		metering: meter ? { gpuSeconds, coldStart: Boolean(meter.coldStart), gpuType: meter.gpuType || null, gpuCostUsd: Math.round(gpuSeconds * usdPerGpuSecond * 1e8) / 1e8 } : null,
		attempts: Number(invoked?.attempts || 0),
	})
}

const totalGpuCostUsd = Math.round(totalGpuSeconds * usdPerGpuSecond * 1e8) / 1e8
const knownHuman = results.filter(result => result.humanChoice)
const knownAgreement = knownHuman.length ? knownHuman.filter(result => result.judgeAgreement).length / knownHuman.length : null
const report = {
	schemaVersion: 'betterpptx.photorealistic-direct-pairwise-calibration-judge.v1',
	status: failures === 0 && totalGpuCostUsd <= totalResearchBudgetUsd ? 'research-direct-pairwise-judge-pass' : 'research-direct-pairwise-judge-fail',
	scope: '20-pair owned-synthetic benchmark; direct side-by-side private judge; not production calibration',
	packetDigest: crypto.createHash('sha256').update(packetBytes).digest('hex'),
	pairCount: maxPairs,
	judgeCalls: maxPairs,
	failures,
	knownHumanLabelCount: knownHuman.length,
	perAccountTimeoutMs,
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
	note: `Direct side-by-side mode avoids local comparison of independent scorecards. Human labels remain optional in this benchmark; the separate calibration gate still requires complete records and owner/runtime approval. Run scope: ${maxPairs}/${packet.pairs.length} pairs.`,
}
const outputName = path.basename(String(process.env.BETTERPPTX_DIRECT_JUDGE_OUTPUT || 'photorealistic-direct-pairwise-calibration-judge-report.json'))
const outputPath = path.join(root, outputName)
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status.endsWith('pass') ? 'ok  ' : 'FAIL'} direct pairwise benchmark (${report.pairCount} pairs, ${report.judgeCalls} calls)`)
console.log(`  ${failures === 0 ? 'ok  ' : 'FAIL'} valid sanitized pairwise choices (${report.pairCount - failures}/${report.pairCount})`)
console.log(`  ${totalGpuCostUsd <= totalResearchBudgetUsd ? 'ok  ' : 'FAIL'} research GPU budget ($${totalGpuCostUsd.toFixed(6)})`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status.endsWith('pass') ? 0 : 1)
