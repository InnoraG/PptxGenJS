import assert from 'node:assert/strict'
import test from 'node:test'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import JSZip from 'jszip'
import { createAssetGrantManager } from '../auth/asset-grants.mjs'
import { withResourceAuthorization, bindNewResourceOwner } from '../auth/resource-authorization.mjs'
import { BillingSecurityFirestore } from './fixtures/billing-security-firestore.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-engine-asset-security-'))
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test', K_SERVICE: '',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_BILLING_PROVIDER: '', BETTERPPTX_FORCE_PLAN: 'premium',
	BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root, BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'ledger.json'),
	BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
	BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0', BETTERPPTX_LOG: '',
	BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'),
	BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'locked'), BETTERPPTX_LOCKED_ASSET_STORE: 'local', BETTERPPTX_LOCKED_ASSET_SHARED_DIR: path.join(root, 'shared-locked'),
	BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local', BETTERPPTX_DECK_STATE_FILE: path.join(root, 'decks.json'),
	BETTERPPTX_DECK_SNAPSHOT_STORE: 'local', BETTERPPTX_DECK_SNAPSHOT_DIR: path.join(root, 'snapshots'),
	BETTERPPTX_DURABLE_OPERATION_STORE: 'disabled', BETTERPPTX_GEN_ASSET_STORE: 'disabled',
})
// The suite uses supplied bytes and local stores only. Accidental provider calls fail.
globalThis.fetch = async () => { throw new Error('Network is forbidden in the asset isolation suite.') }
const { createMcpToolDispatcher, callBetterPptxTool, getDeck, setAssetGrantFirestoreClientForTest } = await import('../engine.mjs')
const { cacheGeneratedImage } = await import('../assets/image-gen-providers.mjs')
const { createSourceBundle } = await import('../storage/source-bundle.mjs')
const a = { installHash: `install_${'a'.repeat(64)}`, sessionId: 'asset-a', __skipDurableOperationLedger: true }
const b = { installHash: `install_${'b'.repeat(64)}`, sessionId: 'asset-b', __skipDurableOperationLedger: true }
const alice = createMcpToolDispatcher(a), bob = createMcpToolDispatcher(b)
const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#de6821' } }).png().toBuffer()
const otherPng = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#168aca' } }).png().toBuffer()
const dataUri = bytes => `data:image/png;base64,${bytes.toString('base64')}`
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data }
const denied = (result, code = 'ASSET_NOT_FOUND') => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code, JSON.stringify(result)) }
let sequence = 0
function spec(image) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Owned asset fixture',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Owner', outcome: 'Keep source bytes private.', remember: 'An opaque reference is not permission.' },
		visualDesign: { world: 'Editorial', framing: 'One owned visual.' }, styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static clock' },
		slides: [{ id: 'one', title: 'Private', message: 'An opaque reference is not permission.', layoutIntent: 'title-only', content: [
			{ kind: 'title', name: 'headline', text: 'An opaque reference is not permission.' },
			...(image ? [{ kind: 'image', name: 'owned-image', image }] : []),
		] }],
	}
}
const commit = (client, source, context) => client.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'summary', idempotencyKey: `asset-commit-${++sequence}` }, context)
const upload = (client, bytes = png) => client.call('betterpptx.assets.upload', { kind: 'image', data: dataUri(bytes) })
async function freshProcess(input, extraEnv = {}) {
	const source = `
		globalThis.fetch = async () => { throw new Error('Network forbidden in asset isolation suite'); };
		const { createMcpToolDispatcher } = await import(${JSON.stringify(new URL('../engine.mjs', import.meta.url).href)});
		let raw = ''; for await (const chunk of process.stdin) raw += chunk;
		const input = JSON.parse(raw); Object.assign(process.env, input.postImportEnv || {}); const client = createMcpToolDispatcher(input.context);
		const results = []; for (const item of input.calls) results.push(await client.call(item.tool, item.args));
		process.stdout.write('ASSET_TEST_RESULT ' + JSON.stringify(results));
	`
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, ...extraEnv }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
		let stdout = '', stderr = ''
		child.stdout.on('data', value => { stdout += value })
		child.stderr.on('data', value => { stderr += value })
		child.on('error', reject)
		child.on('close', code => {
			if (code !== 0) return reject(new Error(`Fixture subprocess failed (${code}): ${stderr}`))
			try { resolve(JSON.parse(stdout.slice(stdout.indexOf('ASSET_TEST_RESULT ') + 18))) } catch (error) { reject(error) }
		})
		child.stdin.end(JSON.stringify(input))
	})
}
test.after(async () => { await fs.rm(root, { recursive: true, force: true }) })

test('real upload -> handle -> owned compilation, stable-install reconnect and durable cold deck hydration', async () => {
	const { handle } = ok(await upload(alice))
	const created = ok(await commit(alice, spec(handle)))
	assert.ok(created.deckId)
	assert.ok(getDeck(created.deckId).pptx.slides[0]._slideObjects.some(object => object._type === 'image'), 'the owned image must actually compile into the native deck')
	denied(await commit(bob, spec(handle)))
	ok(await commit(alice, spec(handle), { sessionId: 'alice-reconnected' }))
	const calls = [{ tool: 'betterpptx.deck.summary', args: { deckId: created.deckId } }]
	ok((await freshProcess({ context: { ...a, sessionId: 'alice-after-restart' }, calls }))[0])
	denied((await freshProcess({ context: a, calls }, { BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'missing-grants') }))[0])
	denied((await freshProcess({ context: b, calls }))[0], 'DECK_EXPIRED_OR_UNKNOWN')
	const publicExport = ok(await alice.call('betterpptx.deck.export_spec', { deckId: created.deckId }))
	assert.equal(JSON.stringify(publicExport).includes('resource-owner'), false)
})

test('independent uploads of identical content create two grants; possession of a handle creates none', async () => {
	const first = ok(await upload(alice, otherPng))
	denied(await bob.call('betterpptx.assets.upload', { kind: 'image', data: first.handle }))
	const second = ok(await upload(bob, otherPng))
	assert.equal(first.handle, second.handle)
	ok(await commit(alice, spec(first.handle)))
	ok(await commit(bob, spec(second.handle)))
})

test('recursive fields, JSON upload decoding, HTML carriers and arbitrary identity fields cannot launder a private ref', async () => {
	const { handle } = ok(await upload(alice))
	for (const args of [
		{ metadata: { layers: [{ source: { handle } }] } },
		{ html: `<img src="${handle}">` },
		{ referenceHandles: [handle], owner: a.installHash, installHash: a.installHash, sessionId: a.sessionId },
	]) denied(await bob.call('betterpptx.help.capabilities', args))
	const source = spec(handle)
	denied(await bob.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${Buffer.from(JSON.stringify(source)).toString('base64')}` }))
	denied(await commit(bob, source))
	const uploaded = ok(await alice.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${Buffer.from(JSON.stringify(source)).toString('base64')}` }))
	const args = { specHandle: uploaded.handle, phase: 'commit', commitMode: 'createNew', detail: 'summary', idempotencyKey: 'uploaded-spec' }
	ok(await alice.call('betterpptx.deck.generate_from_spec', args))
	denied(await bob.call('betterpptx.deck.generate_from_spec', args))
})

test('warm and cold HTML package inspection is owner-bound', async () => {
	const zip = new JSZip(); zip.file('index.html', '<!doctype html><html><body><h1>Private source</h1></body></html>')
	const bytes = await zip.generateAsync({ type: 'nodebuffer' })
	const { handle } = ok(await alice.call('betterpptx.assets.upload', { kind: 'htmlPackage', data: `data:application/zip;base64,${bytes.toString('base64')}` }))
	ok(await alice.call('betterpptx.assets.inspect', { handle }))
	denied(await bob.call('betterpptx.assets.inspect', { handle }))
	const calls = [{ tool: 'betterpptx.assets.inspect', args: { handle } }]
	ok((await freshProcess({ context: { ...a, sessionId: 'html-reconnect' }, calls }))[0])
	denied((await freshProcess({ context: b, calls }))[0])
})

test('a self-contained source bundle grants only its actual uploaded members', async () => {
	const { handle } = ok(await upload(alice))
	const bundle = await createSourceBundle(spec(handle), { resolveLockedAsset: async () => png, title: 'Owned bundle' })
	const imported = ok(await bob.call('betterpptx.bundle.import', { data: `data:application/zip;base64,${bundle.bytes.toString('base64')}` }))
	ok(await bob.call('betterpptx.deck.generate_from_spec', { specHandle: imported.specHandle, phase: 'commit', commitMode: 'createNew', detail: 'summary', idempotencyKey: 'bundle-commit' }))
	denied(await commit(bob, spec(handle)), 'ASSET_NOT_FOUND')
})

test('content-addressed locked files are verified even for an authorized warm handle', async () => {
	const { handle } = ok(await upload(alice))
	const [, kind, digest, ext] = /^asset:\/\/locked\/([^/]+)\/([a-f0-9]{64})\.([a-z0-9]+)$/.exec(handle)
	const file = path.join(root, 'locked', kind, digest.slice(0, 2), `${digest}.${ext}`)
	await fs.writeFile(file, otherPng)
	try {
		const result = await commit(alice, spec(handle))
		assert.equal(result.ok, false, JSON.stringify(result))
		assert.match(JSON.stringify(result), /ASSET_CONTENT_CONFLICT|authorized version/)
	} finally { await fs.writeFile(file, png) }
})

test('a global generated image cache is not authority and altered bytes fail closed for the owner', async () => {
	const hash = createHash('sha256').update('offline-generated-fixture').digest('hex'), handle = `gen://image/${hash}`
	cacheGeneratedImage({ promptHash: hash, dataUri: dataUri(png), width: 8, height: 8 })
	denied(await commit(bob, spec(handle)))
	const manager = createAssetGrantManager()
	await withResourceAuthorization(a, () => manager.withAccess(() => manager.produce({ operation: bindNewResourceOwner({ operationId: 'offline-trusted-generation', state: 'running' }), source: 'generation' }, ({ capture }) => { capture(handle, png); return { ok: true } })))
	ok(await commit(alice, spec(handle)))
	denied(await commit(bob, spec(handle)))
	cacheGeneratedImage({ promptHash: hash, dataUri: dataUri(otherPng), width: 8, height: 8 })
	const result = await commit(alice, spec(handle))
	assert.equal(result.ok, false, JSON.stringify(result))
	assert.match(JSON.stringify(result), /ASSET_CONTENT_CONFLICT|authorized version/)
})

test('production and shared-store mode reject local or disabled grants before uploads/providers; anonymous metadata stays available', async () => {
	const calls = [{ tool: 'betterpptx.assets.upload', args: { kind: 'image', data: dataUri(png) } }, { tool: 'betterpptx.assets.generate_image', args: { prompt: 'Never sent to a provider.' } }]
	for (const extraEnv of [{ BETTERPPTX_REQUIRE_SHARED_STORES: '1' }, { BETTERPPTX_ASSET_GRANT_STORE: 'disabled' }]) {
		const results = await freshProcess({ context: a, calls, postImportEnv: extraEnv.BETTERPPTX_REQUIRE_SHARED_STORES ? extraEnv : {} }, extraEnv.BETTERPPTX_REQUIRE_SHARED_STORES ? {} : extraEnv)
		for (const result of results) denied(result, 'ASSET_GRANT_STORE_UNAVAILABLE')
	}
	const result = await freshProcess({ context: a, calls: calls.slice(0, 1), postImportEnv: { BETTERPPTX_ENV: 'production', BETTERPPTX_DEPLOYMENT_STAGE: 'production', NODE_ENV: 'production' } })
	denied(result[0], 'ASSET_GRANT_STORE_UNAVAILABLE')
	ok(await callBetterPptxTool('betterpptx.help.capabilities', {}, {}))
	denied(await callBetterPptxTool('betterpptx.assets.upload', { kind: 'image', data: dataUri(png) }, {}), 'RESOURCE_IDENTITY_REQUIRED')
})

test('owned text-deck summary needs no asset store; native-preservation export reports its actual storage requirement', async () => {
	const { deckId } = ok(await commit(alice, spec()))
	const results = await freshProcess({ context: a, calls: [
		{ tool: 'betterpptx.deck.summary', args: { deckId } },
		{ tool: 'betterpptx.deck.export_spec', args: { deckId } },
	] }, { BETTERPPTX_ASSET_GRANT_STORE: 'disabled' })
	ok(results[0])
	denied(results[1], 'ASSET_GRANT_STORE_UNAVAILABLE')
})

test('the injected transactional shared backend runs real engine grants; failed commit/read cannot release or mint a handle', async () => {
	const db = new BillingSecurityFirestore()
	process.env.BETTERPPTX_ASSET_GRANT_STORE = 'firestore'
	setAssetGrantFirestoreClientForTest(db)
	try {
		const { handle } = ok(await upload(alice))
		assert.equal(db.rows.size, 1)
		denied(await commit(bob, spec(handle)))
		ok(await commit(alice, spec(handle)))
		db.failCommit = true
		denied(await upload(bob), 'ASSET_GRANT_STORE_UNAVAILABLE')
		db.failCommit = false
		denied(await commit(bob, spec(handle)))
		db.reference = () => ({ get: async () => { throw new Error('offline reachability failure') } })
		denied(await upload(alice), 'ASSET_GRANT_STORE_UNAVAILABLE')
	} finally {
		process.env.BETTERPPTX_ASSET_GRANT_STORE = 'local'
		setAssetGrantFirestoreClientForTest(null)
	}
})
