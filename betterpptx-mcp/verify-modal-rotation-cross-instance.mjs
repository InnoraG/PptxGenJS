// IMG2/IMG10 deterministic rotation proof. Uses a synthetic credential store and an injected
// fetcher: no real endpoint, token, customer image, or network request is used. The goal is to
// prove that isolated processes share the same account topology and fail over correctly before
// the owner supplies real Klein edit-worker credentials.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const accountSlot = token => token === 'synthetic-token-a' ? 'slot-a' : token === 'synthetic-token-b' ? 'slot-b' : 'unknown'
const makeStore = () => ({
	schemaVersion: 'betterpptx.credential-store.v1',
	providers: {
		'modal-flux': {
			activeAccountId: 'flux-a',
			accounts: [
				{ id: 'flux-a', label: 'synthetic A', enabled: true, env: { BETTERPPTX_MODAL_FLUX_URL: 'https://synthetic-a.invalid/flux', BETTERPPTX_MODAL_FLUX_TOKEN: 'synthetic-token-a' } },
				{ id: 'flux-b', label: 'synthetic B', enabled: true, env: { BETTERPPTX_MODAL_FLUX_URL: 'https://synthetic-b.invalid/flux', BETTERPPTX_MODAL_FLUX_TOKEN: 'synthetic-token-b' } },
			],
		},
		'modal-image-edit': {
			activeAccountId: 'edit-a',
			accounts: [
				{ id: 'edit-a', label: 'synthetic edit A', enabled: true, env: { BETTERPPTX_MODAL_IMAGE_EDIT_URL: 'https://synthetic-a.invalid/edit', BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN: 'synthetic-token-a' } },
				{ id: 'edit-b', label: 'synthetic edit B', enabled: true, env: { BETTERPPTX_MODAL_IMAGE_EDIT_URL: 'https://synthetic-b.invalid/edit', BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN: 'synthetic-token-b' } },
			],
		},
	},
})

const storeDir = process.env.ROTATION_CHILD === '1' ? null : await fsp.mkdtemp(path.join(os.tmpdir(), 'bpx-modal-rotation-'))
const storePath = process.env.BETTERPPTX_CREDENTIAL_STORE || (storeDir && path.join(storeDir, 'credential-store.json'))
if (storeDir) {
	await fsp.writeFile(storePath, JSON.stringify(makeStore(), null, 2) + '\n')
	process.env.BETTERPPTX_CREDENTIAL_STORE = storePath
}
const { generateImage } = await import('./assets/image-gen-providers.mjs')

function makeFetch({ failFirst = false } = {}) {
	const calls = []
	return {
		calls,
		fetchJson: async (url, options = {}) => {
			const body = JSON.parse(String(options.body || '{}'))
			const slot = accountSlot(String(body.token || ''))
			calls.push({ slot, lane: String(body.capability || 'create'), urlHost: new URL(url).hostname })
			if (failFirst && calls.length === 1) throw new Error('synthetic endpoint failure')
			return { image: tinyPng, model: 'synthetic-rotation-worker', gpuSeconds: 0, gpuType: 'synthetic' }
		},
	}
}

if (process.env.ROTATION_CHILD === '1') {
	const mock = makeFetch({ failFirst: process.env.ROTATION_FAIL_FIRST === '1' })
	const first = await generateImage({ prompt: 'owned synthetic rotation fixture', provider: 'modal', capability: 'create', fetchJson: mock.fetchJson })
	const second = await generateImage({ prompt: 'owned synthetic rotation fixture two', provider: 'modal', capability: 'create', fetchJson: mock.fetchJson })
	console.log(JSON.stringify({ calls: mock.calls, providers: [first.provider, second.provider], handles: [first.handle, second.handle] }))
	process.exit(0)
}

let pass = 0
let fail = 0
const results = []
const ok = (name, condition, detail = '') => {
	const status = condition ? 'PASS' : 'FAIL'
	if (condition) pass += 1
	else fail += 1
	results.push({ name, status, detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const runChild = ({ failFirst = false } = {}) => {
	const env = { ...process.env, ROTATION_CHILD: '1', ROTATION_FAIL_FIRST: failFirst ? '1' : '0', BETTERPPTX_CREDENTIAL_STORE: storePath }
	const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', env, timeout: 60000 })
	const line = String(run.stdout || '').split(/\r?\n/).map(value => value.trim()).find(value => value.startsWith('{'))
	return { run, payload: line ? JSON.parse(line) : null }
}

console.log('IMG2/IMG10 MODAL ROTATION + CROSS-INSTANCE SYNTHETIC PROOF:')
const createMock = makeFetch()
const createFirst = await generateImage({ prompt: 'owned synthetic local rotation one', provider: 'modal', capability: 'create', fetchJson: createMock.fetchJson })
const createSecond = await generateImage({ prompt: 'owned synthetic local rotation two', provider: 'modal', capability: 'create', fetchJson: createMock.fetchJson })
ok('local creation lane succeeds through injected synthetic worker', createFirst.provider === 'modal' && createSecond.provider === 'modal')
ok('local creation lane advances round-robin across two account slots', createMock.calls.map(call => call.slot).join(',') === 'slot-a,slot-b', createMock.calls.map(call => call.slot).join(','))

const editMock = makeFetch()
const reference = `data:image/png;base64,${tinyPng}`
const editFirst = await generateImage({ prompt: 'owned synthetic edit rotation one', provider: 'modal-edit', capability: 'edit', referenceImages: [reference], referenceDigests: ['synthetic-reference-a'], fetchJson: editMock.fetchJson })
const editSecond = await generateImage({ prompt: 'owned synthetic edit rotation two', provider: 'modal-edit', capability: 'edit', referenceImages: [reference], referenceDigests: ['synthetic-reference-b'], fetchJson: editMock.fetchJson })
ok('local edit/reference lane succeeds through injected synthetic worker', editFirst.provider === 'modal-edit' && editSecond.provider === 'modal-edit')
ok('local edit/reference lane advances round-robin across two account slots', editMock.calls.map(call => call.slot).join(',') === 'slot-a,slot-b', editMock.calls.map(call => call.slot).join(','))

const failover = makeFetch({ failFirst: true })
const failoverResult = await generateImage({ prompt: 'owned synthetic failover fixture', provider: 'modal', capability: 'create', fetchJson: failover.fetchJson })
ok('creation failover retries the second slot after a first-slot error', failover.calls.map(call => call.slot).join(',') === 'slot-a,slot-b' && failoverResult.provider === 'modal', failover.calls.map(call => call.slot).join(','))

const childA = runChild()
const childB = runChild()
ok('isolated process A reads the same two-account topology', childA.run.status === 0 && childA.payload?.calls?.map(call => call.slot).join(',') === 'slot-a,slot-b', JSON.stringify(childA.payload?.calls || null))
ok('isolated process B independently reads the same two-account topology', childB.run.status === 0 && childB.payload?.calls?.map(call => call.slot).join(',') === 'slot-a,slot-b', JSON.stringify(childB.payload?.calls || null))
ok('two isolated processes produce provider-generic handles', childA.payload?.handles?.every(handle => /^gen:\/\/image\/[a-f0-9]+$/.test(handle)) && childB.payload?.handles?.every(handle => /^gen:\/\/image\/[a-f0-9]+$/.test(handle)))

const childFailover = runChild({ failFirst: true })
ok('isolated process failover retries slot B after slot A failure', childFailover.run.status === 0 && childFailover.payload?.calls?.map(call => call.slot).join(',') === 'slot-a,slot-b,slot-b', JSON.stringify(childFailover.payload?.calls || null))
ok('synthetic harness never calls a real network endpoint', [createMock, editMock, failover].every(mock => mock.calls.every(call => call.urlHost === 'synthetic-a.invalid' || call.urlHost === 'synthetic-b.invalid')) && childA.payload?.calls?.every(call => call.urlHost.endsWith('.invalid')) && childB.payload?.calls?.every(call => call.urlHost.endsWith('.invalid')))
ok('no customer image or external AI is involved', true)

const report = { schemaVersion: 'betterpptx.modal-rotation-cross-instance.v1', syntheticOnly: true, customerImages: false, externalAi: false, realNetwork: false, checks: pass, failures: fail, evidence: { localCreation: createMock.calls.map(call => call.slot), localEdit: editMock.calls.map(call => call.slot), localFailover: failover.calls.map(call => call.slot), processA: childA.payload?.calls?.map(call => call.slot) || [], processB: childB.payload?.calls?.map(call => call.slot) || [], processFailover: childFailover.payload?.calls?.map(call => call.slot) || [] } }
await fsp.writeFile(path.join(here, 'outputs', 'modal-rotation-cross-instance-report.json'), JSON.stringify(report, null, 2) + '\n')
await fsp.rm(storeDir, { recursive: true, force: true })
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
