// Deterministic contract for accepted-image call metrology. It uses a local mock worker only:
// no network, GPU, customer image or consented-human asset is involved.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateImage, cacheGeneratedImage, getCachedGeneratedImage } from './assets/image-gen-providers.mjs'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '').replace(/\//g, path.sep))
const storePath = path.join(os.tmpdir(), `betterpptx-call-metrology-${process.pid}.json`)
const fixture = fs.readFileSync(path.join(here, 'deploy', 'image-edit-worker', 'canary-multi-reference.png')).toString('base64')
fs.writeFileSync(storePath, JSON.stringify({
	schemaVersion: 'betterpptx.credential-store.v1',
	providers: { 'modal-flux': { activeAccountId: 'metrology', accounts: [
		{ id: 'metrology', enabled: true, env: { BETTERPPTX_MODAL_FLUX_URL: 'https://metrology.modal.run', BETTERPPTX_MODAL_FLUX_TOKEN: 'synthetic-token' } },
	] } },
}, null, 2))
const previousStore = process.env.BETTERPPTX_CREDENTIAL_STORE
process.env.BETTERPPTX_CREDENTIAL_STORE = storePath
let calls = 0
const response = { image: fixture, width: 1024, height: 1024, model: 'black-forest-labs/FLUX.1-schnell', gpuSeconds: 0, coldStart: false, gpuType: 'L40S' }
const retryingMock = () => {
	calls += 1
	if (calls === 1) { const error = new Error('synthetic scheduler timeout'); error.code = 'SAFE_FETCH_TIMEOUT'; throw error }
	return response
}
let report
try {
	const retried = await generateImage({ prompt: 'synthetic call metrology retry', provider: 'modal', aspect: 'square', fetchJson: retryingMock })
	assert.equal(retried.attempts, 2)
	assert.equal(calls, 2)
	cacheGeneratedImage(retried)
	assert.equal(getCachedGeneratedImage(retried.promptHash)?.attempts, 2)
	const clean = await generateImage({ prompt: 'synthetic call metrology clean', provider: 'modal', aspect: 'square', fetchJson: () => response })
	assert.equal(clean.attempts, 1)
	report = {
		schemaVersion: 'betterpptx.image-generation-call-metrology.v1',
		status: 'pass',
		cases: [
			{ id: 'retry', attempts: retried.attempts, workerCalls: calls, accepted: true },
			{ id: 'clean', attempts: clean.attempts, workerCalls: 1, accepted: true },
		],
		cachePreservesAttempts: true,
		network: false,
		gpu: false,
		customerImages: false,
		consentedHumanImages: false,
		training: false,
		note: 'Contract evidence only. Corpus-wide accepted-call median still requires future live reports with per-output attempts telemetry.',
	}
	console.log('  ok   retry telemetry counts both scheduling attempts')
	console.log('  ok   cache preserves accepted-call attempts')
	console.log('  ok   clean accepted call records one attempt')
} catch (error) {
	report = { schemaVersion: 'betterpptx.image-generation-call-metrology.v1', status: 'fail', error: String(error?.message || error), network: false, gpu: false, customerImages: false, consentedHumanImages: false, training: false }
	console.error(`  FAIL call metrology — ${report.error}`)
} finally {
	if (previousStore === undefined) delete process.env.BETTERPPTX_CREDENTIAL_STORE
	else process.env.BETTERPPTX_CREDENTIAL_STORE = previousStore
	try { fs.rmSync(storePath, { force: true }) } catch {}
}
const outputPath = path.join(here, 'outputs', 'image-generation-call-metrology-report.json')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`\n${report.status === 'pass' ? 'PASSED' : 'FAILED'}: ${outputPath}`)
process.exit(report.status === 'pass' ? 0 : 1)
