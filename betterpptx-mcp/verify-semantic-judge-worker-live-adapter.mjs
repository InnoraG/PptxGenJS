// Private semantic-judge client rotation/failover contract. No network, VLM or human image.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { invokeSemanticJudgeWorker } from './quality/semantic-judge-worker-client.mjs'

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-semantic-judge-adapter-'))
const storePath = path.join(dir, 'credential-store.json')
const fixture = Buffer.from('owned-synthetic-fixture').toString('base64')
const baseStore = accounts => ({
	schemaVersion: 'betterpptx.credential-store.v1',
	providers: { 'semantic-judge-worker': { activeAccountId: accounts[0]?.id, accounts: accounts.map(account => ({ ...account, enabled: true })) } },
})
const accounts = [
	{ id: 'judge-a', env: { BETTERPPTX_SEMANTIC_JUDGE_URL: 'https://judge-a.invalid', BETTERPPTX_SEMANTIC_JUDGE_TOKEN: 'token-a' } },
	{ id: 'judge-b', env: { BETTERPPTX_SEMANTIC_JUDGE_URL: 'https://judge-b.invalid', BETTERPPTX_SEMANTIC_JUDGE_TOKEN: 'token-b' } },
]
await fs.writeFile(storePath, JSON.stringify(baseStore(accounts)))
process.env.BETTERPPTX_CREDENTIAL_STORE = storePath

let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}`) }
}
const fetchCalls = []
const response = { scorecard: { status: 'complete', scores: { messageFit: 4, composition: 4, worldFit: 4, seriesCoherence: 4 }, confidence: 0.8, issues: [] }, gpuSeconds: 1.25, coldStart: true, gpuType: 'L40S', model: 'must-not-cross-boundary', endpoint: 'must-not-cross-boundary' }
const fetchJson = async (url, options) => {
	fetchCalls.push({ url, body: JSON.parse(options.body) })
	return response
}
console.log('PRIVATE SEMANTIC-JUDGE CLIENT ROTATION CONTRACT:')
const first = await invokeSemanticJudgeWorker({ image: fixture, request: { prompt: 'synthetic brief', noText: true }, fetchJson })
const second = await invokeSemanticJudgeWorker({ image: fixture, request: { prompt: 'synthetic brief', noText: true }, fetchJson })
ok('first private judge call returns a sanitized scorecard handle', first.status === 'complete' && first.scorecard.status === 'complete')
ok('second private judge call rotates to the paired profile', fetchCalls.map(call => call.url).join(',') === 'https://judge-a.invalid,https://judge-b.invalid')
ok('request body contains only synthetic pixels and generic brief fields', fetchCalls.every(call => call.body.image === fixture && call.body.brief && !('provider' in call.body.brief)))
ok('private response does not return endpoint/token metadata', !JSON.stringify(first).match(/judge-[ab]\.invalid|token-[ab]/))
ok('private worker metering is retained without provenance', first.metering?.gpuSeconds === 1.25 && first.metering?.coldStart === true && first.metering?.gpuType === 'L40S' && !JSON.stringify(first.metering).match(/must-not-cross-boundary/))

const failoverCalls = []
const failover = await invokeSemanticJudgeWorker({ image: fixture, request: { prompt: 'synthetic brief' }, fetchJson: async (url, options) => {
	failoverCalls.push(url)
	if (url === 'https://judge-a.invalid') throw new Error('synthetic first slot failure')
	return response
} })
ok('first-slot failure fails over to the second private profile', failover.status === 'complete' && failoverCalls.join(',') === 'https://judge-a.invalid,https://judge-b.invalid')
ok('malformed private response abstains instead of guessing', (await invokeSemanticJudgeWorker({ image: fixture, fetchJson: async () => ({ scorecard: { status: 'complete', scores: {} } }) })).status === 'abstain')
ok('missing private lane abstains generically', (await (async () => {
	await fs.writeFile(storePath, JSON.stringify(baseStore([])))
	return invokeSemanticJudgeWorker({ image: fixture, fetchJson })
})()).reason === 'SEMANTIC_JUDGE_WORKER_UNAVAILABLE')

await fs.rm(dir, { recursive: true, force: true })
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
assert.equal(fail, 0)
