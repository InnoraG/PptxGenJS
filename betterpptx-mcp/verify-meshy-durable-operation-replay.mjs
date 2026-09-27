// Native 3D only: prove the personalized Meshy front door replays through the
// durable operation ledger across fresh processes. The asset is a tracked local
// GLB seeded into the private cache; no Meshy request or user image is sent.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '').replace(/\//g, path.sep))
const repo = path.resolve(here, '..')
const self = new URL(import.meta.url).pathname.replace(/^\//, '').replace(/\//g, path.sep)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-meshy-operation-'))
const operationFile = path.join(root, 'operation-store.json')
const credentialFile = path.join(root, 'credentials.json')
// A real 1×1 PNG keeps this replay proof inside the same strict image
// validation boundary as production Meshy requests.  The previous `YQ==`
// placeholder was not a decodable PNG and therefore failed before the
// durable-operation path was exercised.
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7o5WQAAAABJRU5ErkJggg=='
const idempotencyKey = 'meshy-cross-process-replay-1'

function run(step) {
	const child = spawnSync(process.execPath, [self, step], {
		encoding: 'utf8',
		timeout: 120000,
		env: {
			...process.env,
			BETTERPPTX_ASSETS_ROOT: repo,
			BETTERPPTX_PREMIUM: '1',
			BETTERPPTX_PUBLIC_BLACK_BOX: '1',
			BETTERPPTX_BILLING_ENFORCE: '0',
			BETTERPPTX_DEV_ACCEPT_ANY_ACTIVATION_KEY: '1',
			BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
			BETTERPPTX_DURABLE_OPERATION_STORE: 'local',
			BETTERPPTX_OPERATION_STORE_FILE: operationFile,
			BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '1',
			BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
			BETTERPPTX_OPERATION_EXECUTION_MODE: 'inline',
			BETTERPPTX_CREDENTIAL_STORE: credentialFile,
		},
	})
	const line = String(child.stdout || '').split(/\r?\n/).find(value => value.startsWith('RESULT '))
	if (!line) throw new Error(`child ${step} produced no RESULT (exit ${child.status}): ${String(child.stderr || child.stdout).slice(-500)}`)
	return JSON.parse(line.slice(7))
}

if (process.argv[2]) {
	const { cacheGeneratedRigged3d } = await import('./assets/model3d-gen-providers.mjs')
	const { meshyAvatarHashFor } = await import('./assets/meshy-avatar-provider.mjs')
	const engine = await import('./engine.mjs')
	const hash = meshyAvatarHashFor({ images: [image] })
	if (process.argv[2] === 'first') {
		const glb = fs.readFileSync(path.join(here, 'assets', 'kinetic-clips.glb'))
		cacheGeneratedRigged3d({
			promptHash: hash,
			glbBase64: glb.toString('base64'),
			glbBytes: glb.length,
			rigged: true,
			performed: true,
			provider: 'meshy',
			model: 'meshy-6+rigging+mixamo-hybrid',
			meshResolution: 'premium',
			providerCredits: 35,
			gpuSeconds: 0,
			bakeSeconds: 0,
			clipMap: {},
			tier: 'proven-mixamo',
			confidence: 1,
			manifest: { contract: 'meshy-mixamo-hybrid.v1' },
		})
	}
	const result = await engine.callBetterPptxTool('betterpptx.assets.generate_rigged3d', {
		imageBase64s: [image],
		idempotencyKey,
	}, { sessionId: 'meshy-durable-session', installHash: 'meshy-durable-install' })
	const data = result?.data || result
	console.log('RESULT ' + JSON.stringify(data))
	process.exit(result?.ok === true ? 0 : 1)
}

try {
	const first = run('first')
	assert.equal(first.ok, true, JSON.stringify(first))
	assert.equal(first.cached, true)
	assert.equal(first.idempotentReplay, undefined)

	const replay = run('replay')
	assert.equal(replay.ok, true, JSON.stringify(replay))
	assert.equal(replay.idempotentReplay, undefined)
	assert.equal(replay.durableOperation?.replay, true)
	assert.equal(replay.handle, first.handle)

	const report = {
		schemaVersion: 'betterpptx.meshy-durable-operation-replay.v1',
		status: 'PASS',
		scope: 'native-3d-presenter-only',
		firstProcess: { cached: first.cached === true, handleDigest: crypto.createHash('sha256').update(String(first.handle)).digest('hex').slice(0, 16) },
		secondProcess: { durableReplay: replay.durableOperation?.replay === true, handlerSkipped: true },
		liveMeshyRequest: false,
		creditsConsumed: 0,
	}
	const output = path.resolve(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'release-gates', 'meshy-durable-operation-replay-20260718.json')
	fs.mkdirSync(path.dirname(output), { recursive: true })
	fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
	console.log(`MESHY DURABLE OPERATION REPLAY: PASS first-cached=1 second-process-replay=1 live-meshy=0`)
} finally {
	try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
}
