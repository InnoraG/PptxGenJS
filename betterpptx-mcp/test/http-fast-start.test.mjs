import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { exportJWK, generateKeyPair } from 'jose'

const here = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = 'https://betterpptx.example.test'
const ISSUER = `${PUBLIC}/identity/realms/betterpptx`

test('fast-start answers discovery and sign-in while the server loads, then hands off', { timeout: 240_000 }, async () => {
	const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-fast-start-'))
	const { privateKey } = await generateKeyPair('RS256', { extractable: true })
	const signingJwk = { ...(await exportJWK(privateKey)), kid: 'fast-start-key-1', alg: 'RS256', use: 'sig' }
	const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)))
	Object.assign(env, {
		BETTERPPTX_ENV: 'production',
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_AUTH: 'oauth',
		BETTERPPTX_BILLING_PROVIDER: 'none',
		BETTERPPTX_BILLING_MODEL: 'free_publication',
		BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering',
		BETTERPPTX_REQUIRE_SHARED_STORES: '0',
		BETTERPPTX_HOST: '127.0.0.1',
		BETTERPPTX_PORT: '0',
		BETTERPPTX_PUBLIC_BASE: PUBLIC,
		BETTERPPTX_OAUTH_ISSUER: ISSUER,
		BETTERPPTX_IDENTITY_PROVIDER: 'builtin',
		BETTERPPTX_OAUTH_SIGNING_JWKS: JSON.stringify({ keys: [signingJwk] }),
		BETTERPPTX_OAUTH_COOKIE_KEYS: randomBytes(32).toString('base64url'),
		BETTERPPTX_SIGNIN_PROJECT: 'betterpptx-test-1',
		BETTERPPTX_SIGNIN_API_KEY: 'AIzaTestBrowserKey0000000000000000000',
		BETTERPPTX_DOWNLOAD_ROOT: path.join(fixtureRoot, 'downloads'),
	})
	const edge = spawn(process.execPath, [path.join(here, '..', 'http-fast-start.mjs')], { env, stdio: ['ignore', 'ignore', 'pipe'] })
	const events = []
	let serverPid = 0
	let port = 0
	let stderr = ''
	edge.stderr.on('data', chunk => {
		stderr += chunk
		for (const line of String(chunk).split(/\r?\n/)) {
			if (!line.startsWith('{"event":"http.fast_start')) continue
			const event = JSON.parse(line)
			events.push(event.event)
			if (event.port !== undefined) port = event.port
			if (event.serverPid) serverPid = event.serverPid
		}
	})
	const until = async (predicate, label, ms = 180_000) => {
		const deadline = Date.now() + ms
		while (!predicate()) {
			if (Date.now() > deadline || edge.exitCode !== null) throw new Error(`${label} not reached:\n${stderr.slice(-3000)}`)
			await new Promise(resolve => setTimeout(resolve, 20))
		}
	}
	try {
		await until(() => port, 'edge listening', 20_000)
		const base = `http://127.0.0.1:${port}`
		const getJson = async (url) => {
			const response = await fetch(base + url)
			return { status: response.status, body: await response.json() }
		}

		// Sent immediately: held by the edge, then relayed to the full server.
		const initialize = fetch(`${base}/mcp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fast-start-test', version: '1' } } }),
		})

		const t0 = Date.now()
		const health = await getJson('/health')
		assert.equal(health.status, 200)
		assert.equal(health.body.status, 'starting')
		const prm = await getJson('/.well-known/oauth-protected-resource/mcp')
		assert.equal(prm.body.resource, `${PUBLIC}/mcp`)
		assert.deepEqual(prm.body.authorization_servers, [ISSUER])
		const discovery = await getJson('/.well-known/oauth-authorization-server/identity/realms/betterpptx')
		assert.equal(discovery.status, 200)
		assert.equal(discovery.body.issuer, ISSUER)
		assert.deepEqual(discovery.body.code_challenge_methods_supported, ['S256'])
		const certs = await getJson('/identity/realms/betterpptx/protocol/openid-connect/certs')
		assert.equal(certs.status, 200)
		assert.ok(certs.body.keys.every(key => !('d' in key)))
		assert.ok(Date.now() - t0 < 10_000, 'discovery must answer within the connector timeout')
		assert.equal(events.includes('http.fast_start.handoff'), false, 'these answers came from the edge, before the full server was ready')

		const initialized = await initialize
		assert.equal(initialized.status, 200, await initialized.clone().text())
		assert.match(await initialized.text(), /"protocolVersion"/)
		await until(() => events.includes('http.fast_start.handoff'), 'handoff')

		const ready = await getJson('/health')
		assert.equal(ready.body.status, 'ok')
		assert.equal(typeof ready.body.advertisedToolSchemaDigest, 'string')
		const fullDiscovery = await getJson('/.well-known/oauth-authorization-server/identity/realms/betterpptx')
		assert.deepEqual(fullDiscovery.body, discovery.body, 'edge and full server publish the same sign-in discovery')
		const fullPrm = await getJson('/.well-known/oauth-protected-resource/mcp')
		assert.deepEqual(fullPrm.body, prm.body, 'edge and full server publish the same protected-resource metadata')
	} finally {
		if (serverPid) try { process.kill(serverPid) } catch {}
		edge.kill()
		fs.rmSync(fixtureRoot, { recursive: true, force: true })
	}
})
