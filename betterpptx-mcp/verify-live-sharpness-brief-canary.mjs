// One bounded live canary for the owner-approved image-only criterion.
// Uses only the existing owned-synthetic pair packet and the already-registered
// private Modal endpoint. It never deploys, rotates credentials, trains, or promotes.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokeSemanticJudgePairWorker, sanitizeSemanticJudgePairwiseResponse } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const packetBytes = await fs.readFile(path.join(root, 'photorealistic-pairwise-calibration-packet.json'))
const packet = JSON.parse(packetBytes.toString('utf8'))
const pair = packet.pairs[0]
const left = await fs.readFile(path.join(root, pair.left.fileName))
const right = await fs.readFile(path.join(root, pair.right.fileName))
const usdPerGpuSecond = 0.000542
const maxBudgetUsd = 0.25
const invoked = await invokeSemanticJudgePairWorker({
	leftDataUri: `data:image/png;base64,${left.toString('base64')}`,
	rightDataUri: `data:image/png;base64,${right.toString('base64')}`,
	request: {
		semanticBrief: {
			message: pair.message,
			purpose: 'private sharpness-first research canary',
			world: pair.world,
			composition: { position: pair.position, noText: true, aspect: 'landscape', qualityCriterion: 'sharpness-first' },
		},
		evaluationPlan: { sharpnessFirstResearch: true },
	},
	timeoutMs: 90000,
})
const sanitized = sanitizeSemanticJudgePairwiseResponse({ pairwise: invoked?.pairwise })
const metering = invoked?.metering || null
const gpuSeconds = Number(metering?.gpuSeconds || 0)
const gpuCostUsd = Number.isFinite(gpuSeconds) ? Math.round(gpuSeconds * usdPerGpuSecond * 1e8) / 1e8 : null
const report = {
	schemaVersion: 'betterpptx.live-sharpness-brief-canary.v1',
	status: sanitized.status === 'complete' && (gpuCostUsd == null || gpuCostUsd <= maxBudgetUsd) ? 'research-live-sharpness-brief-pass' : 'research-live-sharpness-brief-fail',
	scope: 'one owned-synthetic pair; existing private endpoint; no deployment or promotion',
	criterionRequested: 'sharpness-first',
	liveRuntimeAcceptedBrief: sanitized.status === 'complete',
	choice: sanitized.status === 'complete' ? sanitized.pairwise.choice : null,
	confidence: sanitized.status === 'complete' ? sanitized.pairwise.confidence : null,
	issues: sanitized.status === 'complete' ? sanitized.pairwise.issues : [],
	statusFromAdapter: invoked?.status || 'abstain',
	attempts: Number(invoked?.attempts || 0),
	gpuSeconds: Number.isFinite(gpuSeconds) ? gpuSeconds : null,
	gpuCostUsd,
	maxBudgetUsd,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	modelPromotion: false,
	publicProvenanceExposed: false,
	packetDigest: crypto.createHash('sha256').update(packetBytes).digest('hex'),
	note: 'This canary proves only that the existing private runtime accepts the provider-neutral sharpness criterion brief. It does not claim judge-human calibration, semantic auto-accept, deployment of the new worker source, or production promotion.',
}
const outputPath = path.join(root, 'live-sharpness-brief-canary-report.json')
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status.endsWith('pass') ? 'ok  ' : 'FAIL'} live sharpness brief (${report.statusFromAdapter})`)
console.log(`  ${gpuCostUsd == null || gpuCostUsd <= maxBudgetUsd ? 'ok  ' : 'FAIL'} bounded research cost ($${Number(gpuCostUsd || 0).toFixed(6)})`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status.endsWith('pass') ? 0 : 1)
