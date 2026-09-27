// Local contract test for the side-by-side private-jury adapter.
// Uses no network, GPU, customer image, or external AI service.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invokeSemanticJudgePairWorker, sanitizeSemanticJudgePairwiseResponse } from './quality/semantic-judge-worker-client.mjs'

const image = Buffer.from('owned-synthetic-fixture').toString('base64')
const valid = sanitizeSemanticJudgePairwiseResponse({
	pairwise: { choice: 'right', confidence: 0.82, issues: ['right has stronger focal separation'] },
})
assert.deepEqual(valid, {
	status: 'complete',
	pairwise: { choice: 'right', confidence: 0.82, issues: ['right has stronger focal separation'] },
})
assert.equal(sanitizeSemanticJudgePairwiseResponse({ pairwise: { choice: 'invalid', confidence: 1 } }).status, 'abstain')
assert.equal(sanitizeSemanticJudgePairwiseResponse({ model: 'leak', pairwise: { choice: 'left', confidence: 1 } }).reason, 'JUDGE_RESPONSE_PROVENANCE_PRESENT')

let calls = 0
const invoked = await invokeSemanticJudgePairWorker({
	leftDataUri: `data:image/png;base64,${image}`,
	rightDataUri: `data:image/png;base64,${image}`,
	request: { semanticBrief: { message: 'owned synthetic comparison', world: 'quiet editorial' } },
	fetchJson: async (_url, options) => {
		calls += 1
		const body = JSON.parse(options.body)
		assert.equal(typeof body.token, 'string')
		assert.equal(body.leftImage, image)
		assert.equal(body.rightImage, image)
	return { pairwise: { status: 'complete', choice: 'left', confidence: 0.74, issues: [] }, model: 'private-model', modelRevision: 'private-revision', gpuSeconds: 0.2, gpuType: 'A10G' }
	},
})
assert.equal(invoked.status, 'complete')
assert.equal(invoked.pairwise.choice, 'left')
assert.equal(invoked.metering.gpuSeconds, 0.2)
assert.ok(calls >= 1)

const report = { schemaVersion: 'betterpptx.semantic-judge-direct-pairwise-client.v1', status: 'pass', calls, choice: invoked.pairwise.choice, customerImages: false, consentedHumanImages: false, training: false, externalAi: false, network: false, note: 'Local adapter contract only; no Modal invocation.' }
const here = path.dirname(fileURLToPath(import.meta.url))
await fs.writeFile(path.join(here, 'outputs', 'semantic-judge-direct-pairwise-client-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
