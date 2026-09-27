import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { assertMeshyIdentityPolicy, buildMeshyMultiImageTask } from '../avatar/presenter-ingestion.mjs'

const base = {
	poseMode: 'a-pose',
	targetFormats: ['glb'],
	shouldTexture: true,
	autoSize: true,
}
const original = buildMeshyMultiImageTask({
	...base,
	imageUrls: [
		'https://opaque.example.test/presenter/body/front/original',
		'https://opaque.example.test/presenter/body/side/original',
	],
})
const alphaOnly = buildMeshyMultiImageTask({
	...base,
	imageUrls: [
		'https://opaque.example.test/presenter/body/front/alpha-only',
		'https://opaque.example.test/presenter/body/side/alpha-only',
	],
})
assert.equal(assertMeshyIdentityPolicy(original).ok, true)
assert.equal(assertMeshyIdentityPolicy(alphaOnly).ok, true)
const normalize = request => ({ ...request, image_urls: request.image_urls.map(() => '<opaque-reference>') })
assert.deepEqual(normalize(original), normalize(alphaOnly), 'A/B requests must differ only in the body image references')

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const report = {
	schemaVersion: 'betterpptx.meshy-ab-dryrun.v1',
	status: 'READY_FOR_LIVE_RUN',
	liveExecution: false,
	credentialPresent: false,
	reason: 'No MESHY_API_KEY or MESHY_TOKEN is configured in this environment; no paid external task was attempted.',
	variants: [
		{ id: 'original', requestSha256: digest(original), imageMode: 'original' },
		{ id: 'alpha-only', requestSha256: digest(alphaOnly), imageMode: 'alpha-only' },
	],
	contractChecks: {
		aOnlyDifferenceIsInputReference: true,
		imageEnhancement: false,
		removeLighting: false,
		poseMode: 'a-pose',
		bodyOnly: true,
		meshOutputMayFeedLipSync: false,
	},
	whenLive: {
		compare: ['mesh completeness', 'A-pose correctness', 'background artifacts', 'head/face geometry continuity', 'texture fidelity', 'latency', 'cost'],
		requireSameIdentitySource: true,
		retainOriginalHashes: true,
	}
}
const outputPath = path.resolve('betterpptx-mcp/outputs/presenter-meshy-ab-dryrun-report.json')
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))

