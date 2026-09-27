// Native 3D only: measure the mocked Meshy-to-hybrid path and local premium
// authoring compile path against explicit bounded latency budgets. No network,
// Meshy account, or customer image is used.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatePersonalizedMeshyAvatar } from './assets/meshy-avatar-provider.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const output = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-latency-budget-20260718.json')
const sample = readFileSync(path.join(repo, 'Meshy_AI_Casual_Denim_Look_biped', 'Meshy_AI_Casual_Denim_Look_biped_Character_output.glb'))
const poster = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7o5WQAAAABJRU5ErkJggg==', 'base64')
const images = ['data:image/png;base64,YQ==', 'data:image/png;base64,YQ==']
const providerDeadlineMs = 20 * 60 * 1000
const authoringBudgetMs = 120 * 1000
const calls = []

async function fetchJson(url, options) {
	calls.push({ url, method: options.method })
	if (url.endsWith('/multi-image-to-3d') && options.method === 'POST') return { result: 'multi-latency' }
	if (url.endsWith('/multi-image-to-3d/multi-latency')) return { status: 'SUCCEEDED', consumed_credits: 30, model_urls: { glb: 'https://assets.meshy.ai/model.glb' }, alpha_thumbnail_url: 'https://assets.meshy.ai/poster.png' }
	if (url.endsWith('/rigging') && options.method === 'POST') return { result: 'rig-latency' }
	if (url.endsWith('/rigging/rig-latency')) return { status: 'SUCCEEDED', consumed_credits: 5, result: { rigged_character_glb_url: 'https://assets.meshy.ai/rigged.glb' } }
	throw new Error(`unexpected mock URL ${url}`)
}

async function fetchBuffer(url) { return { ok: true, status: 200, buffer: url.endsWith('.png') ? poster : sample } }
function elapsed(start) { return Math.max(0, Math.round(performance.now() - start)) }

const providerStart = performance.now()
const generated = await generatePersonalizedMeshyAvatar({ images, apiKey: 'local-mock-key', fetchJson, fetchBuffer, wait: async () => {}, deadlineMs: providerDeadlineMs })
const providerObservedMs = elapsed(providerStart)
assert.equal(generated.rigged, true)
assert.equal(generated.performed, true)
assert.ok(generated.glbBytes <= 24 * 1024 * 1024)

const authoringSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Latency budget proof',
	audience: 'verification',
	objective: 'measure local premium presenter authoring compilation',
	styleIntent: { density: 'medium', tone: 'direct', visualSystem: 'native editable PowerPoint' },
	theme: { name: 'Latency Proof', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
	presenter: { model: generated.handle },
	sections: [{ id: 'main', title: 'Main', slideIds: ['s1', 's2'] }],
	slides: [
		{ id: 's1', title: 'Welcome', role: 'opener', message: 'Welcome', layoutIntent: 'title-body', narration: 'Welcome.', content: [{ kind: 'title', name: 'title', text: 'Welcome' }] },
		{ id: 's2', title: 'Point', role: 'build', message: 'Point', layoutIntent: 'title-body', narration: 'Point.', content: [{ kind: 'title', name: 'title', text: 'Point' }] },
	],
}
const authoringSamples = []
for (let i = 0; i < 3; i++) {
	const start = performance.now()
	const plan = buildSpecOperationPlan(authoringSpec, { plan: 'premium' })
	authoringSamples.push(elapsed(start))
	assert.equal(plan.errors.length, 0)
	assert.equal(plan.appliedDefaults.presenter.active, true)
}
const authoringMaxMs = Math.max(...authoringSamples)
const authoringAverageMs = Math.round(authoringSamples.reduce((sum, value) => sum + value, 0) / authoringSamples.length)

const report = {
	schemaVersion: 'betterpptx.meshy-latency-budget.v1',
	status: providerObservedMs <= providerDeadlineMs && authoringMaxMs <= authoringBudgetMs ? 'PASS' : 'BLOCKED',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	budgets: {
		providerGenerationAndRiggingEndToEndMs: providerDeadlineMs,
		localPremiumAuthoringCompileMs: authoringBudgetMs,
		presenterAssetBytes: 24 * 1024 * 1024,
	},
	observed: {
		providerGenerationAndRiggingMs: providerObservedMs,
		localPremiumAuthoringSamplesMs: authoringSamples,
		localPremiumAuthoringMaxMs: authoringMaxMs,
		localPremiumAuthoringAverageMs: authoringAverageMs,
		outputGlbBytes: generated.glbBytes,
		providerCalls: calls.length,
	},
	checks: {
		providerWithinBound: providerObservedMs <= providerDeadlineMs,
		authoringWithinBound: authoringMaxMs <= authoringBudgetMs,
		assetWithinSizeBudget: generated.glbBytes <= 24 * 1024 * 1024,
		liveMeshyRequest: false,
	},
}
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
