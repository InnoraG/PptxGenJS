// Verify A5/A6/A7 reliability increment:
// - artifact delivery uses the configured published download path
// - repeated slide.add with the same idempotency key does not append twice
// - repeated deck.save with the same idempotency key returns the same artifact
// - shared-store-required mode refuses local single-instance stores
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

const here = path.dirname(fileURLToPath(import.meta.url))
const port = 3365
const downloadRoot = path.join(here, '.verify-a5-a7-public-files')
const runtimeRoot = path.join(here, '.verify-a5-a7-runtime')

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function waitHealth(baseUrl) {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`${baseUrl}/health`)
			if (res.status < 500) return
		} catch {}
		await sleep(300)
	}
	throw new Error(`server did not become ready: ${baseUrl}`)
}

function spawnServer(extraEnv = {}) {
	const env = {
		...process.env,
		BETTERPPTX_AUTH: 'none',
		BETTERPPTX_HOST: '127.0.0.1',
		BETTERPPTX_PORT: String(port),
		BETTERPPTX_PUBLIC_BASE: `http://127.0.0.1:${port}`,
		BETTERPPTX_PUBLIC_MCP_URL: `http://127.0.0.1:${port}/mcp`,
		BETTERPPTX_DOWNLOAD_ROOT: downloadRoot,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_RATE_LIMIT_DISABLED: '1',
		BETTERPPTX_LOG: '',
		BETTERPPTX_MOCK_LICENSE_KEYS: 'verify_session_license:premium',
		BETTERPPTX_RUNTIME_DIR: runtimeRoot,
		...extraEnv,
	}
	const child = spawn(process.execPath, ['server-http.mjs'], {
		cwd: here,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	})
	child.stderr.on('data', chunk => {
		const text = String(chunk || '')
		if (/EADDRINUSE|fatal|error/i.test(text)) process.stderr.write(text)
	})
	return { child, baseUrl: `http://127.0.0.1:${port}`, mcpUrl: `http://127.0.0.1:${port}/mcp` }
}

function sse(text) {
	for (const line of String(text).split('\n')) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}

async function body(res) {
	const ct = res.headers.get('content-type') || ''
	const raw = await res.text()
	return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null)
}

async function createRpc(mcpUrl) {
	let sid = null
	async function rpc(method, params) {
		const res = await fetch(mcpUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				...(sid ? { 'mcp-session-id': sid } : {}),
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
		})
		if (!sid) sid = res.headers.get('mcp-session-id')
		return body(res)
	}
	await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'a5-a7-reliability-verify', version: '1' },
		capabilities: {},
	})
	await fetch(mcpUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'mcp-session-id': sid },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
	})
	return async function tool(name, args = {}) {
		const response = await rpc('tools/call', { name, arguments: args })
		return JSON.parse(response?.result?.content?.[0]?.text || '{}')
	}
}

function fail(message, payload) {
	console.error('A5/A6/A7 VERIFY: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

function requireOk(label, payload) {
	if (!payload?.ok) fail(`${label} failed`, payload)
	return payload.data || {}
}

async function verifySharedStoreRequiredFailsClosed() {
	const code = `
import { createArtifactStore } from './storage/artifact-store.mjs';
import { createEntitlementStore } from './auth/entitlement-store.mjs';
const codes = [];
for (const fn of [createArtifactStore, createEntitlementStore]) {
	try { fn(); } catch (err) { codes.push(err.code || err.message); }
}
console.log(codes.join('\\n'));
if (!codes.includes('ARTIFACT_STORE_NOT_SHARED') || !codes.includes('ENTITLEMENT_STORE_NOT_SHARED')) process.exit(2);
`
	const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
		cwd: here,
		env: { ...process.env, BETTERPPTX_REQUIRE_SHARED_STORES: '1' },
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	})
	const chunks = []
	const errs = []
	child.stdout.on('data', c => chunks.push(String(c)))
	child.stderr.on('data', c => errs.push(String(c)))
	const exitCode = await new Promise(resolve => child.on('exit', resolve))
	if (exitCode !== 0) fail('shared-store-required mode did not fail closed as expected', { stdout: chunks.join(''), stderr: errs.join(''), exitCode })
	console.log('shared-store-required -> fail-closed')
}

async function verifyIdempotentSlideAndSave() {
	await fs.rm(downloadRoot, { recursive: true, force: true })
	await fs.rm(runtimeRoot, { recursive: true, force: true })
	const server = spawnServer()
	try {
		await waitHealth(server.baseUrl)
		const tool = await createRpc(server.mcpUrl)
		const authArgs = { key: 'verify_session_license', idempotencyKey: 'verify-auth-1' }
		const auth1 = requireOk('auth.activate_key first', await tool('betterpptx.auth.activate_key', authArgs))
		const auth2 = requireOk('auth.activate_key replay', await tool('betterpptx.auth.activate_key', authArgs))
		if (auth2.idempotentReplay !== true || auth1.plan !== auth2.plan) {
			fail('auth.activate_key session replay did not preserve original result', { auth1, auth2 })
		}
		console.log('auth.activate_key idempotency -> replayed')

		const newArgs = { title: 'Reliability verify', idempotencyKey: 'verify-deck-new-1' }
		const deck = requireOk('deck.new first', await tool('betterpptx.deck.new', newArgs))
		const deckReplay = requireOk('deck.new replay', await tool('betterpptx.deck.new', newArgs))
		if (!deck.deckId || deck.deckId !== deckReplay.deckId || deckReplay.idempotentReplay !== true) {
			fail('deck.new session replay did not preserve original deckId', { deck, deckReplay })
		}
		const deckId = deck.deckId

		const addArgs = { deckId, idempotencyKey: 'verify-slide-add-1', notes: 'idempotent slide' }
		const add1 = requireOk('slide.add first', await tool('betterpptx.slide.add', addArgs))
		const add2 = requireOk('slide.add replay', await tool('betterpptx.slide.add', addArgs))
		if (add1.slideIndex !== 0 || add2.slideIndex !== 0 || add2.idempotentReplay !== true) {
			fail('slide.add idempotency replay did not preserve original slide', { add1, add2 })
		}

		const conflict = await tool('betterpptx.slide.add', { ...addArgs, notes: 'different args' })
		if (conflict.ok !== false || conflict.error?.code !== 'IDEMPOTENCY_CONFLICT') {
			fail('slide.add idempotency conflict was not structured', conflict)
		}

		const summary = requireOk('deck.summary', await tool('betterpptx.deck.summary', { deckId }))
		if (summary.slideCount !== 1) fail('idempotent slide.add appended more than one slide', summary)
		console.log('slide.add idempotency -> one slide')

		const textArgs = {
			deckId,
			slideIndex: 0,
			idempotencyKey: 'verify-add-text-1',
			text: 'Retry-safe text',
			options: { x: 0.5, y: 0.5, w: 4, h: 0.5, fontSize: 18 },
		}
		requireOk('slide.add_text first', await tool('betterpptx.slide.add_text', textArgs))
		const textReplay = requireOk('slide.add_text replay', await tool('betterpptx.slide.add_text', textArgs))
		if (textReplay.idempotentReplay !== true) fail('slide.add_text replay did not report idempotentReplay', textReplay)
		const inspected = requireOk('slide.inspect', await tool('betterpptx.slide.inspect', { deckId, slideIndex: 0 }))
		if (inspected.objectCount !== 1) fail('idempotent slide.add_text added duplicate objects', inspected)
		console.log('slide.add_text idempotency -> one object')

		const dupArgs = { deckId, slideIndex: 0, idempotencyKey: 'verify-duplicate-1' }
		const dup1 = requireOk('slide.duplicate first', await tool('betterpptx.slide.duplicate', dupArgs))
		const dup2 = requireOk('slide.duplicate replay', await tool('betterpptx.slide.duplicate', dupArgs))
		if (dup2.idempotentReplay !== true || JSON.stringify(dup1.newSlideIndexes) !== JSON.stringify(dup2.newSlideIndexes)) {
			fail('slide.duplicate replay did not preserve original result', { dup1, dup2 })
		}
		const afterDup = requireOk('deck.summary after duplicate', await tool('betterpptx.deck.summary', { deckId }))
		if (afterDup.slideCount !== 2) fail('idempotent slide.duplicate appended more than one clone', afterDup)
		console.log('slide.duplicate idempotency -> one clone')

		const updateArgs = { deckId, slideIndex: 1, idempotencyKey: 'verify-slide-update-1', hidden: true, color: '111827' }
		requireOk('slide.update first', await tool('betterpptx.slide.update', updateArgs))
		const updateReplay = requireOk('slide.update replay', await tool('betterpptx.slide.update', updateArgs))
		if (updateReplay.idempotentReplay !== true) fail('slide.update replay did not report idempotentReplay', updateReplay)

		const transitionArgs = { deckId, slideIndex: 1, idempotencyKey: 'verify-transition-1', transition: { type: 'morph', option: 'byObject' } }
		requireOk('slide.set_transition first', await tool('betterpptx.slide.set_transition', transitionArgs))
		const transitionReplay = requireOk('slide.set_transition replay', await tool('betterpptx.slide.set_transition', transitionArgs))
		if (transitionReplay.idempotentReplay !== true) fail('slide.set_transition replay did not report idempotentReplay', transitionReplay)
		console.log('slide.update/set_transition idempotency -> replayed')

		const reorderArgs = { deckId, fromIndex: 0, toIndex: 1, idempotencyKey: 'verify-reorder-1' }
		requireOk('slide.reorder first', await tool('betterpptx.slide.reorder', reorderArgs))
		const reorderReplay = requireOk('slide.reorder replay', await tool('betterpptx.slide.reorder', reorderArgs))
		if (reorderReplay.idempotentReplay !== true) fail('slide.reorder replay did not report idempotentReplay', reorderReplay)
		const afterReorder = requireOk('deck.summary after reorder', await tool('betterpptx.deck.summary', { deckId }))
		if (afterReorder.slideCount !== 2) fail('slide.reorder changed slide count', afterReorder)

		const deleteArgs = { deckId, slideIndex: 1, idempotencyKey: 'verify-delete-1' }
		requireOk('slide.delete first', await tool('betterpptx.slide.delete', deleteArgs))
		const deleteReplay = requireOk('slide.delete replay', await tool('betterpptx.slide.delete', deleteArgs))
		if (deleteReplay.idempotentReplay !== true) fail('slide.delete replay did not report idempotentReplay', deleteReplay)
		const afterDelete = requireOk('deck.summary after delete', await tool('betterpptx.deck.summary', { deckId }))
		if (afterDelete.slideCount !== 1) fail('idempotent slide.delete deleted more than once', afterDelete)
		console.log('slide.reorder/delete idempotency -> stable deck')

		const saveArgs = { deckId, idempotencyKey: 'verify-save-1', fileName: 'idempotent-save.pptx' }
		const save1 = requireOk('deck.save first', await tool('betterpptx.deck.save', saveArgs))
		const save2 = requireOk('deck.save replay', await tool('betterpptx.deck.save', saveArgs))
		if (!save1.downloadUrl || save1.downloadUrl !== save2.downloadUrl || save2.idempotentReplay !== true) {
			fail('deck.save replay did not return stable artifact metadata', { save1, save2 })
		}
		const downloaded = await fetch(save1.downloadUrl)
		const bytes = Buffer.from(await downloaded.arrayBuffer())
		if (downloaded.status !== 200 || bytes.length < 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
			fail('downloaded artifact was not a valid-looking PPTX zip', { status: downloaded.status, bytes: bytes.length, url: save1.downloadUrl })
		}
		console.log('deck.save idempotency -> stable download')

		const uploadArgs = {
			idempotencyKey: 'verify-open-uploaded-1',
			fileName: 'roundtrip-upload.pptx',
			data: bytes.toString('base64'),
		}
		const opened1 = requireOk('deck.open_uploaded first', await tool('betterpptx.deck.open_uploaded', uploadArgs))
		const opened2 = requireOk('deck.open_uploaded replay', await tool('betterpptx.deck.open_uploaded', uploadArgs))
		if (!opened1.deckId || opened1.deckId !== opened2.deckId || opened2.idempotentReplay !== true) {
			fail('deck.open_uploaded session replay did not preserve original deckId', { opened1, opened2 })
		}
		console.log('deck.open_uploaded idempotency -> replayed')

		const disposeArgs = { deckId: opened1.deckId, idempotencyKey: 'verify-dispose-1' }
		const disposed1 = requireOk('deck.dispose first', await tool('betterpptx.deck.dispose', disposeArgs))
		const disposed2 = requireOk('deck.dispose replay', await tool('betterpptx.deck.dispose', disposeArgs))
		if (disposed1.ok !== true || disposed2.ok !== true || disposed2.idempotentReplay !== true) {
			fail('deck.dispose session replay did not preserve original result', { disposed1, disposed2 })
		}
		console.log('deck.dispose idempotency -> replayed')
	} finally {
		if (server.child && !server.child.killed) server.child.kill()
		await fs.rm(downloadRoot, { recursive: true, force: true })
		await fs.rm(runtimeRoot, { recursive: true, force: true })
	}
}

async function main() {
	await verifySharedStoreRequiredFailsClosed()
	await verifyIdempotentSlideAndSave()
	console.log('A5/A6/A7 VERIFY: PASS')
}

main().catch(err => fail(err.message || String(err)))
