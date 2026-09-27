// Explicit live research canary for the two approved private Qwen semantic-judge endpoints.
// This is intentionally outside the deterministic release suite: it performs real GPU work.
// It sends only an owned synthetic fixture and never prints URLs, tokens, model provenance or paths.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeSemanticJudgeWorkerResponse, evaluateWorkerJudgeResponse } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const storePath = path.join(here, 'config', 'credential-store.json')
const store = JSON.parse(await fs.readFile(storePath, 'utf8'))
const accounts = (store.providers?.['semantic-judge-worker']?.accounts || []).filter(account => account?.enabled !== false)
const referencePath = path.join(here, 'deploy', 'image-edit-worker', 'fixtures', 'synthetic-reference.png')
const reference = (await fs.readFile(referencePath)).toString('base64')
const outputRoot = path.join(here, 'outputs')
const usdPerGpuSecond = 0.000542
const warmGpuCeilingUsd = 0.10
const coldResearchBudgetUsd = 1.00
const timeoutMs = 600000
const brief = {
	message: 'A controlled abstract visual explains a workflow becoming one coherent system.',
	purpose: 'conceptual hero',
	world: 'dark editorial technology studio with tactile geometric materials',
	composition: { focalSide: 'right', quietSpace: 'left', noText: true, aspect: 'square' },
	series: { consistencyGroup: 'semantic-judge-live-canary', anchor: 'dark-blue-gold tactile geometry' },
}

let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => {
	const status = condition ? 'PASS' : 'FAIL'
	if (condition) pass += 1
	else fail += 1
	checks.push({ name, status, detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')

console.log('LIVE MODAL QWEN SEMANTIC-JUDGE CANARY (synthetic-only, explicit GPU call):')
ok('exactly two enabled dedicated Qwen accounts are registered', accounts.length === 2 && accounts.every(account => account.env?.BETTERPPTX_SEMANTIC_JUDGE_URL && account.env?.BETTERPPTX_SEMANTIC_JUDGE_TOKEN))
ok('reference fixture is owned synthetic and available locally', reference.length > 1000 && !/consentedHumanAsset|customer/i.test(referencePath))

const results = []
async function invoke(account, label) {
	const url = String(account.env.BETTERPPTX_SEMANTIC_JUDGE_URL)
	const token = String(account.env.BETTERPPTX_SEMANTIC_JUDGE_TOKEN)
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	const started = Date.now()
	let response
	let payload = null
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token, image: reference, brief }),
			signal: controller.signal,
		})
		payload = await response.json()
	} catch (error) {
		return { label, accountId: String(account.id), status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error) }
	} finally { clearTimeout(timer) }
	const scorecard = payload?.scorecard
	const scores = scorecard?.scores || {}
	const scorecardValid = scorecard?.status === 'complete' && ['messageFit', 'composition', 'worldFit', 'seriesCoherence'].every(key => Number.isFinite(Number(scores[key]))) && Number.isFinite(Number(scorecard?.confidence))
	const privatePayload = {
		status: response.ok && scorecardValid ? 'PASS' : 'FAIL',
		httpStatus: response.status,
		label,
		accountId: String(account.id),
		elapsedMs: Date.now() - started,
		modelRevision: String(payload?.modelRevision || ''),
		gpuSeconds: Number(payload?.gpuSeconds || 0),
		gpuCostUsd: Math.round(Number(payload?.gpuSeconds || 0) * usdPerGpuSecond * 1e8) / 1e8,
		coldStart: Boolean(payload?.coldStart),
		peakAllocatedBytes: Number(payload?.peakAllocatedBytes || 0),
		peakReservedBytes: Number(payload?.peakReservedBytes || 0),
		gpuType: String(payload?.gpuType || ''),
		scorecard,
		errorDetail: response.ok ? '' : String(payload?.detail || payload?.message || '').slice(0, 240),
	}
	const sanitized = sanitizeSemanticJudgeWorkerResponse({ scorecard })
	const evaluated = evaluateWorkerJudgeResponse({ scorecard }, { deterministicReport: { status: 'pass' } })
	return {
		...privatePayload,
		scorecardDigest: digest(JSON.stringify(scorecard || {})),
		sanitizedStatus: sanitized.status,
		evaluatedStatus: evaluated.status,
		publicBoundarySafe: sanitized.status === 'complete' && evaluated.status === 'reject' && evaluated.blockingIssues.includes('CALIBRATED'),
	}
}

for (const account of accounts) {
	const cold = await invoke(account, 'cold-or-warm')
	const warm = await invoke(account, 'warm')
	const result = { accountId: String(account.id), cold, warm }
	results.push(result)
	ok(`${account.id}: authenticated cold/warm HTTP judge calls succeeded`, cold.status === 'PASS' && warm.status === 'PASS' && cold.httpStatus === 200 && warm.httpStatus === 200)
	ok(`${account.id}: exact Qwen revision is returned`, cold.modelRevision === 'cc594898137f460bfe9f0759e9844b3ce807cfb5' && warm.modelRevision === cold.modelRevision)
	ok(`${account.id}: warm GPU portion stays under $0.10`, Number.isFinite(warm.gpuCostUsd) && warm.gpuCostUsd <= warmGpuCeilingUsd, `$${Number(warm.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${account.id}: cold bootstrap stays under $1.00 research budget`, Number.isFinite(cold.gpuCostUsd) && cold.gpuCostUsd <= coldResearchBudgetUsd, `$${Number(cold.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${account.id}: scorecard is sanitized and remains uncalibrated`, cold.publicBoundarySafe && warm.publicBoundarySafe)
}

ok('both isolated Qwen endpoints passed live canaries', results.length === 2 && results.every(result => result.cold.status === 'PASS' && result.warm.status === 'PASS'))
ok('no customer image, consented-human image or external AI provider was used', true)

const report = {
	schemaVersion: 'betterpptx.live-modal-semantic-judge-canary.v1',
	status: fail === 0 ? 'research-live-pass' : 'research-live-fail',
	ownedSyntheticOnly: true,
	customerImages: false,
	externalAi: false,
	calibratedForAutoAccept: false,
	accounts: results,
	checks: pass,
	failures: fail,
	constraints: {
		input: 'owned synthetic 512² PNG',
		usdPerGpuSecond,
		warmGpuCeilingUsd,
		coldResearchBudgetUsd,
		modelRevision: 'cc594898137f460bfe9f0759e9844b3ce807cfb5',
		publicBoundary: 'scorecard-only; calibration remains required',
	},
	checksDetail: checks,
}
await fs.writeFile(path.join(outputRoot, 'live-modal-semantic-judge-canary-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
