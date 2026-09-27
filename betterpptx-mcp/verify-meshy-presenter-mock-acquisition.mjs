#!/usr/bin/env node
// No-network Meshy acquisition fixture. This uses the production Meshy adapter
// with deterministic provider responses, then writes the same hybrid GLB and
// manifest shape consumed by the owner-authorized live canary.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { generatePersonalizedMeshyAvatar } from './assets/meshy-avatar-provider.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const argv = process.argv.slice(2)
let outDir = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-mock-acquisition-20260718')
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--out-dir') outDir = path.resolve(argv[++i] || outDir)
	else if (argv[i].startsWith('--out-dir=')) outDir = path.resolve(argv[i].slice('--out-dir='.length))
}

const sampleGlb = fs.readFileSync(path.join(repo, 'Meshy_AI_Casual_Denim_Look_biped', 'Meshy_AI_Casual_Denim_Look_biped_Character_output.glb'))
const validatedPoster = path.join(demo, 'visual-artifacts', 'meshy-poster', 'meshy-native-poster.png')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7o5WQAAAABJRU5ErkJggg==', 'base64')
const images = [png, png].map(bytes => `data:image/png;base64,${bytes.toString('base64')}`)
const calls = []

function sha256(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase() }
async function fetchJson(url, options) {
	calls.push({ url, method: options.method })
	if (url.endsWith('/multi-image-to-3d') && options.method === 'POST') return { result: 'mock-multi-1' }
	if (url.endsWith('/multi-image-to-3d/mock-multi-1')) return { status: 'SUCCEEDED', consumed_credits: 30, model_urls: { glb: 'https://assets.meshy.ai/mock-model.glb' }, alpha_thumbnail_url: 'https://assets.meshy.ai/mock-poster.png' }
	if (url.endsWith('/rigging') && options.method === 'POST') return { result: 'mock-rig-1' }
	if (url.endsWith('/rigging/mock-rig-1')) return { status: 'SUCCEEDED', consumed_credits: 5, result: { rigged_character_glb_url: 'https://assets.meshy.ai/mock-rigged.glb' } }
	throw new Error(`unexpected mock URL ${url}`)
}
async function fetchBuffer(url) {
	return { ok: true, status: 200, buffer: String(url).endsWith('.png') ? png : sampleGlb }
}

try {
	process.env.BETTERPPTX_PREMIUM = '1'
	const result = await generatePersonalizedMeshyAvatar({
		images,
		apiKey: 'mock-only-not-a-secret',
		fetchJson,
		fetchBuffer,
		wait: async () => {},
	})
	if (result.provider !== 'meshy' || result.performed !== true || result.manifest?.source?.imageCount !== 2) throw new Error('Mock acquisition did not return the personalized Meshy contract.')
	if (result.providerCredits !== 35 || result.manifest?.clipNames?.length !== 18 || result.manifest?.animCount !== 18) throw new Error('Mock acquisition did not return the frozen Mixamo contract.')
	fs.mkdirSync(outDir, { recursive: true })
	const glbPath = path.join(outDir, 'hybrid.glb')
	const manifestPath = path.join(outDir, 'manifest.json')
	const posterPath = path.join(outDir, 'meshy-poster.png')
	fs.writeFileSync(glbPath, Buffer.from(result.glbBase64, 'base64'))
	fs.writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`)
	fs.copyFileSync(validatedPoster, posterPath)
	const report = {
		schemaVersion: 'betterpptx.native-3d-meshy-mock-acquisition.v1',
		status: 'PASS',
		scope: 'native-3d-presenter-only',
		developmentMode: 'premium',
		networkAttempted: false,
		inputCount: images.length,
		provider: 'meshy-mock-adapter',
		providerCalls: calls.length,
		providerCredits: result.providerCredits,
		output: {
			glb: { path: glbPath, bytes: fs.statSync(glbPath).size, sha256: sha256(glbPath) },
			manifest: manifestPath,
			poster: { path: posterPath, bytes: fs.statSync(posterPath).size, sha256: sha256(posterPath) },
		},
		contract: { imageCount: 2, meshes: result.manifest.meshes, materials: result.manifest.materials, textures: result.manifest.textures, joints: result.manifest.jointCount, clips: result.manifest.clipNames.length, providerCredits: result.providerCredits },
		retryPolicy: 'No automatic retry. Deterministic mock task sequence runs once and never contacts the network.',
	}
	fs.writeFileSync(path.join(outDir, 'mock-acquisition-report.json'), `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify(report, null, 2))
} catch (error) {
	const report = { schemaVersion: 'betterpptx.native-3d-meshy-mock-acquisition.v1', status: 'FAIL', scope: 'native-3d-presenter-only', developmentMode: 'premium', networkAttempted: false, error: error?.message || String(error), retryPolicy: 'No automatic retry.' }
	fs.mkdirSync(outDir, { recursive: true })
	fs.writeFileSync(path.join(outDir, 'mock-acquisition-report.json'), `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify(report, null, 2))
	process.exitCode = 2
}
