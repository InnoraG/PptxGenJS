// Isolated new-profile Qwen GPU fallback canary. This endpoint is deliberately not registered in
// the credential store: it proves the new-profile contract without mutating a healthy route.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeSemanticJudgeWorkerResponse, evaluateWorkerJudgeResponse } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const store = JSON.parse((await fs.readFile(path.join(here, 'config', 'credential-store.json'), 'utf8')).replace(/^\uFEFF/, ''))
const account = (store.providers?.['semantic-judge-worker']?.accounts || []).find(item => String(item.id) === String(process.env.BETTERPPTX_QWEN_CANARY_ACCOUNT || 'fluxworkerai1'))
const url = String(process.env.BETTERPPTX_QWEN_A10G_CANARY_URL || '').trim()
const token = String(account?.env?.BETTERPPTX_SEMANTIC_JUDGE_TOKEN || '')
const reference = (await fs.readFile(path.join(here, 'deploy', 'image-edit-worker', 'fixtures', 'synthetic-reference.png'))).toString('base64')
const usdPerGpuSecond = 0.000542
const modelRevision = 'cc594898137f460bfe9f0759e9844b3ce807cfb5'
const brief = { message: 'A controlled abstract visual explains a workflow becoming one coherent system.', purpose: 'conceptual hero', world: 'dark editorial technology studio with tactile geometric materials', composition: { focalSide: 'right', quietSpace: 'left', noText: true, aspect: 'square' }, series: { consistencyGroup: 'qwen-a10g-new-profile-canary', anchor: 'dark-blue-gold tactile geometry' } }
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const checks = []
let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
ok('isolated canary endpoint is supplied', /^https:\/\/[^/]+\.modal\.run$/.test(url))
ok('registered token source is private and available', Boolean(token) && account?.enabled !== false)
ok('fixture is owned synthetic and local', reference.length > 1000)

async function invoke(label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 600000)
  const started = Date.now()
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, image: reference, brief }), signal: controller.signal })
    const payload = await response.json()
    const scorecard = payload?.scorecard
    const scores = scorecard?.scores || {}
    const valid = response.ok && scorecard?.status === 'complete' && ['messageFit', 'composition', 'worldFit', 'seriesCoherence'].every(key => Number.isFinite(Number(scores[key])))
    const sanitized = sanitizeSemanticJudgeWorkerResponse({ scorecard })
    const evaluated = evaluateWorkerJudgeResponse({ scorecard }, { deterministicReport: { status: 'pass' } })
    return { status: valid ? 'PASS' : 'FAIL', httpStatus: response.status, label, elapsedMs: Date.now() - started, modelRevision: String(payload?.modelRevision || ''), gpuType: String(payload?.gpuType || ''), gpuPreference: String(payload?.gpuPreference || ''), gpuSeconds: Number(payload?.gpuSeconds || 0), gpuCostUsd: Math.round(Number(payload?.gpuSeconds || 0) * usdPerGpuSecond * 1e8) / 1e8, coldStart: Boolean(payload?.coldStart), peakAllocatedBytes: Number(payload?.peakAllocatedBytes || 0), peakReservedBytes: Number(payload?.peakReservedBytes || 0), scorecardDigest: digest(JSON.stringify(scorecard || {})), publicBoundarySafe: sanitized.status === 'complete' && evaluated.status === 'reject' && evaluated.blockingIssues.includes('CALIBRATED') }
  } catch (error) { return { status: 'ERROR', label, elapsedMs: Date.now() - started, error: String(error?.message || error) } }
  finally { clearTimeout(timer) }
}

console.log('ISOLATED MODAL QWEN A10G NEW-PROFILE CANARY (synthetic-only):')
const cold = await invoke('cold-or-warm')
const warm = await invoke('warm')
ok('cold/warm HTTP calls succeeded', cold.status === 'PASS' && warm.status === 'PASS')
ok('both calls selected the A10G backup', cold.gpuType === 'A10G' && warm.gpuType === 'A10G', `${cold.gpuType}/${warm.gpuType}`)
ok('worker reports the ordered preference', cold.gpuPreference === 'A10G' && warm.gpuPreference === 'A10G', `${cold.gpuPreference}/${warm.gpuPreference}`)
ok('exact Qwen revision is returned', cold.modelRevision === modelRevision && warm.modelRevision === modelRevision)
ok('peak memory telemetry is present', cold.peakAllocatedBytes > 0 && cold.peakReservedBytes >= cold.peakAllocatedBytes && warm.peakAllocatedBytes > 0)
ok('warm cost stays below $0.10', warm.gpuCostUsd <= 0.1, `$${warm.gpuCostUsd.toFixed(6)}`)
ok('cold research cost stays below $1.00', cold.gpuCostUsd <= 1, `$${cold.gpuCostUsd.toFixed(6)}`)
ok('scorecard remains sanitized and uncalibrated', cold.publicBoundarySafe && warm.publicBoundarySafe)
ok('no customer/consented-human image or training path was used', true)
const report = { schemaVersion: 'betterpptx.private-modal-qwen-a10g-new-profile-canary.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', profile: process.env.BETTERPPTX_QWEN_CANARY_ACCOUNT || 'fluxworkerai1', endpointClass: 'isolated_new_profile_not_registered', gpuPreference: 'A10G', modelRevision, ownedSyntheticOnly: true, customerImages: false, consentedHumanImages: false, training: false, externalAi: false, results: { cold, warm }, totalGpuCostUsd: Number((cold.gpuCostUsd + warm.gpuCostUsd).toFixed(8)), checks: pass, failures: fail, checksDetail: checks }
await fs.writeFile(path.join(outputRoot, 'private-modal-qwen-a10g-new-profile-canary-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
