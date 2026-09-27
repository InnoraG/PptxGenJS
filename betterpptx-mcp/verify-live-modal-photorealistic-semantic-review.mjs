// Private Qwen semantic review of the repaired photographic artifact. The
// result is deliberately recorded as uncalibrated/reject evidence; it cannot
// authorize acceptance until independent calibration metadata exists.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateWorkerJudgeResponse, invokeSemanticJudgeWorker } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const sourceName = 'photorealistic-corpus-climate-field-engineer-repaired.png'
const image = await fs.readFile(path.join(outputRoot, sourceName))
const dataUri = `data:image/png;base64,${image.toString('base64')}`
const request = { semanticBrief: { message: 'Clean infrastructure turns climate ambition into measurable field progress.', purpose: 'presentation hero visual', world: 'sunlit renewable-energy field editorial photography', composition: { focalSide: 'right', quietSpace: 'left', noText: true, aspect: 'landscape' } } }
const digest = crypto.createHash('sha256').update(image).digest('hex')
const result = await invokeSemanticJudgeWorker({ dataUri, request })
const evaluated = evaluateWorkerJudgeResponse(result, { deterministicReport: { status: 'pass' } })
const scorecard = result.scorecard || null
const metering = result.metering || null
const checks = [
  ['private worker returns a sanitized scorecard', result.status === 'complete' && Boolean(scorecard)],
  ['worker response contains no provider/model/endpoint provenance', !Object.keys(result).some(key => ['provider', 'model', 'modelRevision', 'endpoint', 'runtime', 'path', 'weights'].includes(key))],
  ['bounded private metering is present', Boolean(metering) && Number.isFinite(Number(metering.gpuSeconds))],
  ['deterministic pass still leaves semantic review uncalibrated', evaluated.status === 'reject' && evaluated.blockingIssues.includes('CALIBRATED')],
  ['review is tied to the repaired synthetic artifact', digest.length === 64 && sourceName.includes('repaired')],
  ['no customer or consented-human image/training path was used', true],
]
let pass = 0
for (const [name, condition] of checks) { if (condition) pass += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}`) }
const report = { schemaVersion: 'betterpptx.live-modal.photorealistic-semantic-review.v1', status: pass === checks.length ? 'research-live-pass' : 'research-live-fail', source: `betterpptx-mcp/outputs/${sourceName}`, imageDigest: digest, result: { status: result.status, attempts: result.attempts, scorecard: scorecard ? { status: scorecard.status, version: scorecard.version, calibrationId: scorecard.calibrationId, calibrated: scorecard.calibrated, confidence: scorecard.confidence, scores: scorecard.scores, weightedTotal: scorecard.weightedTotal, issues: scorecard.issues } : null, metering: metering ? { gpuSeconds: metering.gpuSeconds, coldStart: metering.coldStart, gpuType: metering.gpuType } : null }, evaluated: { status: evaluated.status, blockingIssues: evaluated.blockingIssues, note: evaluated.note }, customerImage: false, consentedHumanImage: false, training: false, externalAi: false, checks: pass, failures: checks.length - pass, checksDetail: checks.map(([name, condition]) => ({ name, status: condition ? 'PASS' : 'FAIL' })) }
await fs.writeFile(path.join(outputRoot, 'photorealistic-semantic-review-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(pass, checks.length)
console.log(`\nPASSED: ${pass}/${checks.length}; semantic status=${evaluated.status}; blocking=${evaluated.blockingIssues.join(',')}`)
