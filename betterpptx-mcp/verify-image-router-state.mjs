// Verify the optional durable image-router quota ledger. This is local-only,
// secret-free evidence; it never calls a provider or sends image bytes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-image-router-'))
const stateFile = path.join(tempRoot, 'router-state.json')
process.env.BETTERPPTX_IMAGE_ROUTER_STATE_FILE = stateFile
process.env.BETTERPPTX_REQUIRE_DURABLE_IMAGE_ROUTER = '1'
process.env.BETTERPPTX_CLOUDFLARE_ACCOUNT_ID = 'account-a'
process.env.BETTERPPTX_CLOUDFLARE_API_TOKEN = 'token-a'
process.env.BETTERPPTX_CREDENTIAL_STORE = path.join(tempRoot, 'no-credential-store.json')
process.env.BETTERPPTX_IMAGE_ROUTER_LOCK_WAIT_MS = '60000'

const {
	imageRouterStateStatus,
	imageRouterAccountState,
	recordImageRouterUse,
	markImageRouterExhausted,
} = await import('./storage/image-router-state.mjs')

let passed = 0
let failed = 0
const checks = []
function ok(label, condition) {
	checks.push({ label, status: condition })
	if (condition) { passed += 1; console.log(`  ok   ${label}`) }
	else { failed += 1; console.log(`  FAIL ${label}`) }
}

try {
	const initial = imageRouterStateStatus()
	ok('required durable state creates a writable local ledger', initial.required === true && initial.durable === true && initial.mode === 'durable-local' && fs.existsSync(stateFile))
	ok('state contains no token, prompt, or pixel fields', !/token|secret|prompt|base64|pixel/i.test(fs.readFileSync(stateFile, 'utf8')))
	ok('first account starts at zero', imageRouterAccountState('cloudflare-workers-ai', 'account-a').count === 0)
	ok('usage is recorded atomically', recordImageRouterUse('cloudflare-workers-ai', 'account-a') === true && imageRouterAccountState('cloudflare-workers-ai', 'account-a').count === 1)
	ok('exhaustion is recorded separately from usage', markImageRouterExhausted('cloudflare-workers-ai', 'account-a') === true && imageRouterAccountState('cloudflare-workers-ai', 'account-a').exhausted === true)

	const child = spawnSync(process.execPath, ['-e', `import('./storage/image-router-state.mjs').then(m=>console.log(JSON.stringify(m.imageRouterAccountState('cloudflare-workers-ai','account-a'))))`], {
		cwd: path.dirname(fileURLToPath(import.meta.url)),
		env: { ...process.env, BETTERPPTX_IMAGE_ROUTER_STATE_FILE: stateFile, BETTERPPTX_REQUIRE_DURABLE_IMAGE_ROUTER: '1' },
		encoding: 'utf8',
	})
	let childState = null
	try { childState = JSON.parse(String(child.stdout || '').trim()) } catch { /* assertion below */ }
	ok('state survives a fresh process', child.status === 0 && childState?.count === 1 && childState?.exhausted === true && childState?.durable === true)

	const concurrentScript = `import('./storage/image-router-state.mjs').then(async m=>{for(let i=0;i<5;i++){if(!m.recordImageRouterUse('cloudflare-workers-ai','concurrent-account'))process.exitCode=1}}).catch(()=>{process.exitCode=1})`
	const runConcurrentWriter = () => new Promise(resolve => {
		const childProcess = spawn(process.execPath, ['-e', concurrentScript], {
			cwd: path.dirname(fileURLToPath(import.meta.url)),
			env: { ...process.env, BETTERPPTX_IMAGE_ROUTER_STATE_FILE: stateFile, BETTERPPTX_REQUIRE_DURABLE_IMAGE_ROUTER: '1' },
			stdio: 'ignore',
		})
		childProcess.once('error', () => resolve(false))
		childProcess.once('exit', code => resolve(code === 0))
	})
	const concurrentResults = await Promise.all(Array.from({ length: 8 }, () => runConcurrentWriter()))
	ok('concurrent writers preserve every increment', concurrentResults.every(Boolean) && imageRouterAccountState('cloudflare-workers-ai', 'concurrent-account').count === 40)

	const { generateImage, imageGenProviderStatus } = await import('./assets/image-gen-providers.mjs')
	const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
	const providerBefore = imageGenProviderStatus()
	ok('provider exposes durable quota readiness without private paths', providerBefore.cloudflare.durableQuotaState === true && providerBefore.cloudflare.quotaState === 'durable-local' && !JSON.stringify(providerBefore).includes(stateFile))
	await generateImage({ prompt: 'durable router integration probe', aspect: 'square', fetchJson: async () => ({ success: true, result: { image: tinyPng } }) })
	const providerAfter = imageGenProviderStatus()
	ok(`provider persists a successful Cloudflare use (remaining=${providerAfter.cloudflare.freeDailyRemaining}, count=${imageRouterAccountState('cloudflare-workers-ai', 'env').count})`, providerAfter.cloudflare.freeDailyRemaining === 39 && imageRouterAccountState('cloudflare-workers-ai', 'env').count === 1)

	const badPath = path.join(tempRoot, 'unwritable-target')
	fs.mkdirSync(badPath)
	process.env.BETTERPPTX_IMAGE_ROUTER_STATE_FILE = badPath
	const blocked = imageRouterStateStatus()
	ok('required mode fails closed when the state target is unwritable', blocked.required === true && blocked.durable === false && blocked.mode === 'required-unavailable')
} finally {
	try { fs.rmSync(tempRoot, { recursive: true, force: true }) } catch { /* best effort cleanup */ }
}

console.log(`\nIMAGE ROUTER STATE: ${passed} passed, ${failed} failed`)
const report = {
	schemaVersion: 'betterpptx.image-gen-router-state-verification.v1',
	status: failed === 0 ? 'research-router-state-pass' : 'research-router-state-fail',
	checks: checks.length,
	 failures: failed,
	passed,
	secretFree: true,
	crossProcessRehydrate: checks.find(item => item.label === 'state survives a fresh process')?.status === true,
	strictFailClosed: checks.find(item => item.label === 'required mode fails closed when the state target is unwritable')?.status === true,
	concurrentWriters: checks.find(item => item.label === 'concurrent writers preserve every increment')?.status === true,
	customerImages: false,
	externalAi: false,
	training: false,
}
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'outputs', 'image-router-state-verification-report.json'), JSON.stringify(report, null, 2) + '\n')
if (failed) process.exit(1)
