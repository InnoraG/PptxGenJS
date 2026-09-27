// Verify the central credential store server (tools/betterpptx-mcp-param-store.mjs).
// Boots the real server as a child on a test port with BETTERPPTX_PARAM_STORE_TEST_PASSWORD
// (explicit test-mode gate) + temp store/.mcp.json paths, then probes the API and the
// security properties: masked-when-locked, session gating, host/origin rejection, atomic
// writes, apply/import behavior, mask round-trip rejection, unlock rate-limit.
// Run:  node betterpptx-mcp/verify-param-store.mjs
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 8391
const BASE = `http://127.0.0.1:${PORT}`
const PASSWORD = 'test-pass-123'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}`) } else { fail++; console.error(`  FAIL ${n}${d ? ' — ' + d : ''}`) } }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-paramstore-'))
const storeFile = path.join(dir, 'credential-store.json')
const mcpFile = path.join(dir, 'mcp.json')
fs.writeFileSync(mcpFile, JSON.stringify({
	mcpServers: {
		'betterpptx-mcp': {
			command: 'node',
			env: {
				BETTERPPTX_PEXELS_API_KEY: 'pex-original-123',
				BETTERPPTX_MODAL_FLUX_URL: 'https://x.modal.run',
				BETTERPPTX_MODAL_FLUX_TOKEN: 'mtok-original',
				BETTERPPTX_MODAL_IMAGE_EDIT_URL: 'https://edit.modal.run',
				BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN: 'edit-token-original',
				BETTERPPTX_SOME_FLAG: '1',
				RANDOM_EXTRA_SECRET_KEY: 'leftover-1',
			},
		},
	},
}, null, '\t'))

const child = spawn(process.execPath, [path.join(repoRoot, 'tools', 'betterpptx-mcp-param-store.mjs')], {
	env: {
		...process.env,
		BETTERPPTX_PARAM_STORE_PORT: String(PORT),
		BETTERPPTX_PARAM_STORE_TEST_PASSWORD: PASSWORD,
		BETTERPPTX_CREDENTIAL_STORE: storeFile,
		BETTERPPTX_PARAM_STORE_MCP_JSON: mcpFile,
	},
	stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error('server did not start')), 15000)
	child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve() } })
	child.on('exit', code => reject(new Error(`server exited early (${code})`)))
})

const api = async (pathname, { method = 'GET', body, session, headers = {} } = {}) => {
	const res = await fetch(BASE + pathname, {
		method,
		headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(session ? { 'X-Session': session } : {}), ...headers },
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	})
	let json = null
	try { json = await res.json() } catch {}
	return { status: res.status, json, text: json === null ? await res.text().catch(() => '') : '' }
}
// raw request so we can spoof the Host header (fetch/undici forbids it)
const rawRequest = ({ host, method = 'GET', pathname = '/api/state' }) => new Promise(resolve => {
	const req = http.request({ hostname: '127.0.0.1', port: PORT, path: pathname, method, headers: { Host: host } }, res => resolve(res.statusCode))
	req.on('error', () => resolve(-1))
	req.end()
})

try {
	console.log('SERVE + LOCKED READS:')
	const page = await fetch(BASE + '/')
	ok('GET / serves the UI html', page.status === 200 && (await page.text()).includes('Credential Store'))
	const locked = await api('/api/state')
	ok('state (locked): redacted flag + masked seed store', locked.status === 200 && locked.json.redacted === true && locked.json.unlocked === false)
	ok('state (locked): known providers seeded', Boolean(locked.json.store.providers['cloudflare-workers-ai'] && locked.json.store.providers['modal-image-edit'] && locked.json.store.providers.pexels))

	console.log('\nAUTH GATE:')
	ok('save without session → 401', (await api('/api/store', { method: 'POST', body: { store: {} } })).status === 401)
	ok('apply without session → 401', (await api('/api/apply', { method: 'POST', body: {} })).status === 401)
	ok('import without session → 401', (await api('/api/import', { method: 'POST', body: {} })).status === 401)
	ok('unlock with wrong password → 401', (await api('/api/unlock', { method: 'POST', body: { password: 'nope' } })).status === 401)
	const unlocked = await api('/api/unlock', { method: 'POST', body: { password: PASSWORD } })
	ok('unlock with correct password → session token', unlocked.status === 200 && /^[a-f0-9]{64}$/.test(unlocked.json.token || ''))
	const session = unlocked.json.token
	const full = await api('/api/state', { session })
	ok('state (unlocked): full values, not masked', full.json.redacted === false && full.json.unlocked === true)

	console.log('\nNETWORK HARDENING:')
	ok('spoofed Host header (evil.com) → 403', (await rawRequest({ host: 'evil.com' })) === 403)
	ok(`legit Host (127.0.0.1:${PORT}) → 200`, (await rawRequest({ host: `127.0.0.1:${PORT}` })) === 200)
	ok('cross-site Origin on POST → 403', (await api('/api/unlock', { method: 'POST', body: { password: PASSWORD }, headers: { Origin: 'http://evil.com' } })).status === 403)

	console.log('\nIMPORT / SAVE / APPLY:')
	const imported = await api('/api/import', { method: 'POST', body: {}, session })
	const impStore = imported.json.store
	const pexAccount = impStore.providers.pexels.accounts[0]
	ok('import: pexels key mapped to an account', pexAccount?.env?.BETTERPPTX_PEXELS_API_KEY === 'pex-original-123')
	ok('import: modal-flux url+token mapped together', impStore.providers['modal-flux'].accounts[0]?.env?.BETTERPPTX_MODAL_FLUX_TOKEN === 'mtok-original')
	ok('import: modal image-edit url+token mapped together', impStore.providers['modal-image-edit'].accounts[0]?.env?.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN === 'edit-token-original')
	ok('import: leftover *_KEY captured in custom-imported', impStore.providers['custom-imported']?.accounts[0]?.env?.RANDOM_EXTRA_SECRET_KEY === 'leftover-1')
	ok('import: non-secret flag NOT imported', !JSON.stringify(impStore).includes('BETTERPPTX_SOME_FLAG'))

	// mutate: second pexels account, make it active
	impStore.providers.pexels.accounts.push({ id: 'acc-rot2', label: 'rotation-2', enabled: true, env: { BETTERPPTX_PEXELS_API_KEY: 'pex-ROTATED-456' } })
	impStore.providers.pexels.activeAccountId = 'acc-rot2'
	impStore.providers.huggingface = { label: 'HF', category: 'external', envKeys: ['HF_TOKEN'], applyToMcp: false, accounts: [{ id: 'acc-hf', label: 'hf', enabled: true, env: { HF_TOKEN: 'hf_secret' } }], activeAccountId: 'acc-hf' }
	const saved = await api('/api/store', { method: 'POST', body: { store: impStore }, session })
	ok('save: accepted + written to disk', saved.status === 200 && fs.existsSync(storeFile))
	const onDisk = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
	ok('save: active rotation account persisted', onDisk.providers.pexels.activeAccountId === 'acc-rot2')
	await api('/api/store', { method: 'POST', body: { store: impStore }, session })
	ok('save: previous version backed up (.bak)', fs.existsSync(`${storeFile}.bak`))
	const masked = JSON.parse(JSON.stringify(impStore))
	masked.providers.pexels.accounts[0].env.BETTERPPTX_PEXELS_API_KEY = 'pex…123'
	ok('save: masked (…) value rejected — no silent corruption', (await api('/api/store', { method: 'POST', body: { store: masked }, session })).status !== 200)

	const applied = await api('/api/apply', { method: 'POST', body: {}, session })
	const mcpAfter = JSON.parse(fs.readFileSync(mcpFile, 'utf8')).mcpServers['betterpptx-mcp'].env
	ok('apply: ACTIVE (rotated) account wins in .mcp.json', mcpAfter.BETTERPPTX_PEXELS_API_KEY === 'pex-ROTATED-456')
	ok('apply: unmanaged keys preserved', mcpAfter.BETTERPPTX_SOME_FLAG === '1')
	ok('apply: applyToMcp:false provider (HF) NOT written', mcpAfter.HF_TOKEN === undefined)
	ok('apply: .mcp.json backup created', applied.json.backup && fs.existsSync(`${mcpFile}.bak`))

	console.log('\nHARDENING (review fixes):')
	ok('unlock: CR/LF-only password rejected (no blank-password bypass)', (await api('/api/unlock', { method: 'POST', body: { password: '\r\n' } })).status === 401)
	const lockedView = await api('/api/state')
	const lockedEnvVals = Object.values(lockedView.json.store.providers).flatMap(p => (p.accounts || []).flatMap(a => Object.values(a.env || {})))
	ok('locked: secrets fully masked (no first/last char reveal)', lockedEnvVals.length > 0 && lockedEnvVals.every(v => /^•+$/.test(v)))
	const base = JSON.parse(JSON.stringify(impStore))
	const dupIds = JSON.parse(JSON.stringify(base)); dupIds.providers.pexels.accounts.push({ id: dupIds.providers.pexels.accounts[0].id, enabled: true, env: { BETTERPPTX_PEXELS_API_KEY: 'x' } })
	ok('save: duplicate account id rejected', (await api('/api/store', { method: 'POST', body: { store: dupIds }, session })).status !== 200)
	const danger = JSON.parse(JSON.stringify(base)); danger.providers.pexels.accounts[0].env.NODE_OPTIONS = '--require ./evil.js'
	ok('save: dangerous env key (NODE_OPTIONS) rejected', (await api('/api/store', { method: 'POST', body: { store: danger }, session })).status !== 200)
	const dangling = JSON.parse(JSON.stringify(base)); dangling.providers.pexels.activeAccountId = 'does-not-exist'
	ok('save: dangling activeAccountId rejected', (await api('/api/store', { method: 'POST', body: { store: dangling }, session })).status !== 200)
	const bulletMask = JSON.parse(JSON.stringify(base)); bulletMask.providers.pexels.accounts[0].env.BETTERPPTX_PEXELS_API_KEY = '••••••••'
	ok('save: bullet-mask value rejected (no secret destruction on round-trip)', (await api('/api/store', { method: 'POST', body: { store: bulletMask }, session })).status !== 200)
	const goodContent = fs.readFileSync(storeFile, 'utf8')
	fs.writeFileSync(storeFile, '{ not valid json at all')
	ok('corrupt store: /api/state flags corrupt (not served as empty)', (await api('/api/state', { session })).json.corrupt === true)
	ok('corrupt store: apply refuses (no overwrite of real secrets)', (await api('/api/apply', { method: 'POST', body: {}, session })).status >= 400)
	fs.writeFileSync(storeFile, goodContent)

	console.log('\nLOCK + RATE LIMIT:')
	await api('/api/lock', { method: 'POST', body: {}, session })
	ok('lock: session revoked (save → 401)', (await api('/api/store', { method: 'POST', body: { store: impStore }, session })).status === 401)
	for (let i = 0; i < 5; i++) await api('/api/unlock', { method: 'POST', body: { password: 'wrong-' + i } })
	ok('rate limit: 6th attempt inside 60s → 429', (await api('/api/unlock', { method: 'POST', body: { password: PASSWORD } })).status === 429)
} finally {
	child.kill()
}

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
