import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createVerifiedIdentityVerifier } from '../auth/verified-identity.mjs'
import { withResourceAuthorization } from '../auth/resource-authorization.mjs'

// Run: node --experimental-test-module-mocks --test betterpptx-mcp/test/public-verified-identity-http.test.mjs
// Real HTTP server, dispatcher, auth.status, JWT verifier and artifact store.
// Only the allowance persistence adapter is replaced by read-only fixture data;
// writes throw. All configuration/keys are synthetic, all storage is temporary,
// and outbound connections are restricted to this test's ephemeral loopback port.
const V2 = '2026-07-28'
const LEGACY = '2025-03-26'
const issuer = 'https://identity.example.test/realms/http-test'
const audience = 'https://presentations.example.test'
const meta = {
	'io.modelcontextprotocol/protocolVersion': V2,
	'io.modelcontextprotocol/clientInfo': { name: 'verified-identity-http-test', version: '1' },
	'io.modelcontextprotocol/clientCapabilities': {},
}

function message(method, params = {}, { legacy = false } = {}) {
	return { jsonrpc: '2.0', id: randomUUID(), method,
		params: legacy ? params : { ...params, _meta: { ...meta, ...params._meta } } }
}

function parseRpc(response, text) {
	if (response.headers.get('content-type')?.includes('text/event-stream')) {
		const messages = text.split(/\r?\n/).filter(line => line.startsWith('data:'))
			.map(line => JSON.parse(line.slice(5).trim()))
		return messages.find(item => item.result !== undefined || item.error !== undefined) ?? null
	}
	return text ? JSON.parse(text) : null
}

function toolPayload(body) {
	assert.equal(body?.error, undefined, 'expected a successful JSON-RPC dispatch')
	assert.equal(body?.result?.isError, false, 'expected auth.status to execute successfully')
	const result = body.result.structuredContent
		?? JSON.parse(body.result.content.find(item => item.type === 'text').text)
	return result.data ?? result
}

test('public HTTP trusts only verified OAuth principals', { timeout: 120_000 }, async t => {
	assert.equal(typeof t.mock.module, 'function', 'run with --experimental-test-module-mocks')
	const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-verified-http-'))
	const originalEnv = { ...process.env }
	const originalCwd = process.cwd()
	const dependencyLink = path.join(fixtureRoot, 'node_modules')
	let started
	let allowedPort = null
	let deniedConnections = 0
	let allowanceWrites = 0
	const allowanceReads = []
	const originalFetch = globalThis.fetch
	const originalConnect = net.Socket.prototype.connect

	t.after(async () => {
		if (started) {
			const closing = new Promise((resolve, reject) => started.httpServer.close(error => error ? reject(error) : resolve()))
			started.httpServer.closeAllConnections()
			await closing
		}
		process.chdir(originalCwd)
		for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, key)) delete process.env[key]
		Object.assign(process.env, originalEnv)
		const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(fixtureRoot))
		assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)
			&& path.basename(fixtureRoot).startsWith('betterpptx-verified-http-'), 'cleanup must remain within the allocated temporary directory')
		// Unlink the fixture-only junction itself before removing the fixture tree.
		try { await fs.unlink(dependencyLink) } catch (error) { if (error.code !== 'ENOENT') throw error }
		await fs.rm(fixtureRoot, { recursive: true, force: true })
	})

	// Preserve only OS/runtime variables; never consume inherited service secrets.
	for (const name of Object.keys(process.env)) {
		if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_|AWS_|AZURE_|OPENAI_|ANTHROPIC_|MODAL_|MESHY_|HF_|PAYRAM_|POLAR_|DODO_|K_SERVICE$|K_REVISION$)/i.test(name)
			|| /(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(name)) delete process.env[name]
	}
	const downloadRoot = path.join(fixtureRoot, 'downloads')
	Object.assign(process.env, {
		NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_AUTH: 'oauth', BETTERPPTX_OAUTH_TOKEN_PROFILE: 'keycloak',
		BETTERPPTX_OAUTH_CLIENT_ID: 'http-test-client',
		BETTERPPTX_OAUTH_ISSUER: issuer, BETTERPPTX_OAUTH_AUDIENCE: audience,
		BETTERPPTX_OAUTH_JWKS_URL: `${issuer}/protocol/openid-connect/certs`,
		BETTERPPTX_INSTALL_HMAC_SECRET: randomBytes(32).toString('hex'),
		BETTERPPTX_OAUTH_REQUIRE_DPOP: '0', BETTERPPTX_HTTP_STATELESS_MCP: '0',
		BETTERPPTX_MCP_TRANSPORT_MODE: 'stateful', BETTERPPTX_REQUIRE_SHARED_STORES: '0',
		BETTERPPTX_ARTIFACT_STORE: 'local', BETTERPPTX_ENTITLEMENT_STORE: 'local',
		BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_BILLING_LEDGER_STORE: 'local',
		BETTERPPTX_BILLING_MODEL: 'pay_per_job', BETTERPPTX_MONETIZED_MCP_ENABLED: '0',
		BETTERPPTX_X402_STORE: 'local', BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local',
		BETTERPPTX_CREDENTIAL_STORE: path.join(fixtureRoot, 'absent-credentials.json'),
		BETTERPPTX_DOWNLOAD_ROOT: downloadRoot, BETTERPPTX_OUT_DIR: path.join(fixtureRoot, 'outputs'),
		BETTERPPTX_INSTALL_USAGE_FILE: path.join(fixtureRoot, 'must-not-write-allowances.json'),
		BETTERPPTX_BILLING_LEDGER_FILE: path.join(fixtureRoot, 'must-not-write-ledger.json'),
		BETTERPPTX_ENTITLEMENTS_FILE: path.join(fixtureRoot, 'must-not-write-entitlements.json'),
		BETTERPPTX_LOG: '0', BETTERPPTX_TRACE: '0', BETTERPPTX_METROLOGY: '0',
		BETTERPPTX_COST_OBSERVATIONS: '0', BETTERPPTX_RATE_LIMIT_BURST: '1000',
		BETTERPPTX_RATE_LIMIT_GLOBAL_BURST: '5000',
	})
	// The engine materializes its runtime under cwd; let that temporary runtime
	// resolve existing dependencies without copying packages or writing the repo.
	await fs.symlink(await fs.realpath(new URL('../../node_modules/', import.meta.url)), dependencyLink,
		process.platform === 'win32' ? 'junction' : 'dir')
	process.chdir(fixtureRoot)

	const noExternalConnection = () => { deniedConnections += 1; throw new Error('External network/provider access is forbidden in this test') }
	t.mock.method(http, 'request', noExternalConnection)
	t.mock.method(http, 'get', noExternalConnection)
	t.mock.method(https, 'request', noExternalConnection)
	t.mock.method(https, 'get', noExternalConnection)
	t.mock.method(net.Socket.prototype, 'connect', function (...args) {
		const options = Array.isArray(args[0]) ? args[0][0] : args[0]
		if (!options || options.host !== '127.0.0.1' || Number(options.port) !== allowedPort) return noExternalConnection()
		return originalConnect.apply(this, args)
	})
	t.mock.method(globalThis, 'fetch', (input, options) => {
		const url = new URL(input instanceof Request ? input.url : input)
		if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || Number(url.port) !== allowedPort) return noExternalConnection()
		return originalFetch(input, { ...options, redirect: 'manual' })
	})

	const realInstallIdentity = await import('../auth/install-identity.mjs')
	const noAllowanceWrite = () => { allowanceWrites += 1; throw new Error('Allowance mutations are forbidden in this test') }
	t.mock.module(new URL('../auth/install-identity.mjs', import.meta.url).href, { namedExports: {
		...realInstallIdentity,
		createInstallUsageStore: () => ({
			provider: 'local', shared: false,
			getDailyUsage: async (identityHash, date) => {
				allowanceReads.push(identityHash)
				return { installHash: identityHash, date, savedDecks: 0 }
			},
			getRollingUsage: async (identityHash, request) => {
				allowanceReads.push(identityHash)
				return { category: request.category, limit: request.limit, used: 0, remaining: request.limit }
			},
			incrementDailyUsage: noAllowanceWrite, reserveRollingUsage: noAllowanceWrite,
			commitRollingUsage: noAllowanceWrite, releaseRollingUsage: noAllowanceWrite,
			describe: () => ({ provider: 'local', shared: false }),
		}),
	} })

	const { privateKey, publicKey } = await generateKeyPair('ES256')
	const keyResolver = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), alg: 'ES256', kid: 'ephemeral-http-test' }] })
	async function sign(subject = 'account-a', claims = {}, key = privateKey) {
		const time = Math.floor(Date.now() / 1000)
		return new SignJWT({ iss: issuer, aud: audience, sub: subject, iat: time, exp: time + 600,
			jti: randomUUID(), azp: 'http-test-client', typ: 'Bearer', scope: 'betterpptx', ...claims })
			.setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'ephemeral-http-test' }).sign(key)
	}
	const tokenA = await sign()
	const tokenB = await sign('account-b')
	const principalA = await createVerifiedIdentityVerifier({ keyResolver }).verifyRequest({ headers: { authorization: `Bearer ${tokenA}` } })
	const authA = { authorization: `Bearer ${tokenA}` }
	const authB = { authorization: `Bearer ${tokenB}` }
	const spoofed = {
		'x-openai-subject': 'account-a', 'x-openai-session': 'account-a-session',
		'x-betterpptx-device': `bpptx_device_${randomBytes(32).toString('base64url')}`,
		'x-install-hash': principalA.installHash, 'x-authenticated-user': 'account-a',
	}
	const { startBetterPptxHttp } = await import('../server-http.mjs')
	const { createArtifactStore } = await import('../storage/artifact-store.mjs')
	started = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, downloadRoot,
		publicBase: 'https://presentations.example.test', identityKeyResolver: keyResolver })
	allowedPort = started.httpServer.address().port
	const base = `http://127.0.0.1:${allowedPort}`
	assert.equal(started.authMode, 'oauth')
	assert.equal(started.mcpTransportMode, 'stateful')

	async function send(body, headers = {}, { method = 'POST', pathname = '/mcp', legacy = false } = {}) {
		const response = await fetch(`${base}${pathname}`, {
			method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
				'mcp-protocol-version': legacy ? LEGACY : V2, ...headers },
			...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
		})
		const text = await response.text()
		return { response, body: parseRpc(response, text) }
	}
	function assertAuthenticationRequired(result) {
		assert.equal(result.response.status, 401)
		assert.equal(result.body?.error?.code, 'AUTHENTICATION_REQUIRED')
		assert.equal(result.body?.result, undefined)
		assert.ok(result.response.headers.get('www-authenticate'))
		assert.equal(result.response.headers.get('cache-control'), 'no-store')
		const encoded = JSON.stringify(result.body)
		assert.equal(encoded.includes(tokenA) || encoded.includes(tokenB) || encoded.includes(principalA.installHash), false)
	}
	function assertMcpAuthenticationRequired(result) {
		assert.equal(result.response.status, 200)
		assert.equal(result.body?.error, undefined)
		assert.equal(result.body?.result?.isError, true)
		const challenges = result.body?.result?._meta?.['mcp/www_authenticate']
		assert.ok(Array.isArray(challenges) && challenges.length === 1)
		assert.match(challenges[0], /^Bearer /)
		assert.match(challenges[0], /resource_metadata="https:\/\/presentations\.example\.test\/\.well-known\/oauth-protected-resource"/)
		assert.match(challenges[0], /scope="betterpptx"/)
		assert.match(challenges[0], /error="(?:insufficient_scope|invalid_token)"/)
		assert.match(challenges[0], /error_description="[^"]+"/)
		assert.equal(result.response.headers.get('www-authenticate'), challenges[0])
		assert.equal(result.response.headers.get('cache-control'), 'no-store')
		const encoded = JSON.stringify(result.body)
		assert.equal(encoded.includes(tokenA) || encoded.includes(tokenB) || encoded.includes(principalA.installHash), false)
	}
	const tool = (name, args = {}) => message('tools/call', { name, arguments: args })
	const protectedMessages = [
		tool('betterpptx.deck.generate_from_spec', { spec: { title: 'Blocked fixture', slides: [] }, idempotencyKey: 'blocked-generate' }),
		tool('betterpptx.deck.save', { deckId: 'foreign-deck', idempotencyKey: 'blocked-save' }),
		tool('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.save', arguments: { deckId: 'foreign-deck' } }),
		tool('betterpptx.deck.export_spec', { deckId: 'foreign-deck', download: true }),
		message('resources/read', { uri: 'betterpptx://status' }),
		tool('betterpptx.operation.status', { operationId: 'foreign-operation' }),
		tool('betterpptx.billing.job_status', { purchaseId: 'foreign-job' }),
	]

	await t.test('OAuth discovery supports zero-touch ChatGPT CIMD setup', async () => {
		const resourceResponse = await fetch(`${base}/.well-known/oauth-protected-resource`)
		assert.equal(resourceResponse.status, 200)
		const resource = await resourceResponse.json()
		assert.equal(resource.resource, audience)
		assert.deepEqual(resource.authorization_servers, [issuer])
		assert.ok(resource.code_challenge_methods_supported.includes('S256'))

		for (const pathname of [
			'/.well-known/oauth-authorization-server',
			'/.well-known/oauth-authorization-server/realms/http-test',
			'/.well-known/openid-configuration',
			'/.well-known/openid-configuration/realms/http-test',
			'/realms/http-test/.well-known/oauth-authorization-server',
		]) {
			const response = await fetch(`${base}${pathname}`)
			assert.equal(response.status, 200, pathname)
			const metadata = await response.json()
			assert.equal(metadata.issuer, issuer)
			assert.equal(metadata.client_id_metadata_document_supported, true)
			assert.equal(metadata.authorization_response_iss_parameter_supported, true)
			assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['private_key_jwt'])
			assert.deepEqual(metadata.token_endpoint_auth_signing_alg_values_supported, ['RS256'])
			assert.ok(metadata.code_challenge_methods_supported.includes('S256'))
			assert.deepEqual(metadata.scopes_supported, ['openid', 'betterpptx'])
			assert.equal(metadata.userinfo_endpoint, `${issuer}/protocol/openid-connect/userinfo`)
		}
	})

	await t.test('anonymous discovery works and spoofed hints do not authenticate auth.status', async () => {
		for (const method of ['server/discover', 'tools/list', 'resources/list', 'prompts/list']) {
			const result = await send(message(method))
			assert.equal(result.response.status, 200, method)
			assert.equal(result.body?.error, undefined, method)
			assert.ok(result.body?.result, method)
			if (method === 'tools/list') {
				assert.ok(result.body.result.tools.length > 0)
				const profile = result.body.result.tools.find(item => item.name === 'betterpptx.auth.get_profile')
				assert.ok(profile, 'standard authenticated profile tool must be discoverable')
				assert.deepEqual(profile.securitySchemes, [{ type: 'oauth2', scopes: ['betterpptx'] }])
				assert.deepEqual(profile._meta?.securitySchemes, profile.securitySchemes)
				assert.equal(profile._meta?.['openai/profile'], true)
				assert.deepEqual(profile.outputSchema?.required, ['id'])
				assert.equal(profile.outputSchema?.additionalProperties, false)
			}
		}
		const result = await send(tool('betterpptx.auth.status'), spoofed)
		assert.equal(result.response.status, 200)
		const status = toolPayload(result.body)
		assert.equal(status.identityAssurance.authenticated, false)
		assert.equal(status.identityAssurance.secured, false)
		assert.equal(status.identityAssurance.freeValueQuotaEligible, false)
		assert.equal(allowanceReads.length, 0)
	})

	await t.test('anonymous and spoofed headers cannot write, estimate, export, read resources or inspect operations', async () => {
		for (const body of protectedMessages) {
			for (const headers of [{}, spoofed]) {
				const result = await send(body, headers)
				if (body.method === 'tools/call') assertMcpAuthenticationRequired(result)
				else assertAuthenticationRequired(result)
			}
		}
		assert.equal(allowanceReads.length, 0)
		assert.equal(allowanceWrites, 0)
	})

	await t.test('mixed batches are denied as a whole regardless of protected member order', async () => {
		for (const body of protectedMessages) {
			for (const batch of [[message('tools/list'), body], [body, tool('betterpptx.auth.status')]]) {
				const result = await send(batch, spoofed)
				assertAuthenticationRequired(result)
				assert.equal(Array.isArray(result.body), false, 'no discovery or execution member may be dispatched')
			}
		}
		assert.equal(allowanceReads.length, 0)
	})

	await t.test('valid signed account reaches real auth.status with verified assurance', async () => {
		const result = await send(tool('betterpptx.auth.status'), { ...spoofed, ...authA })
		assert.equal(result.response.status, 200)
		const status = toolPayload(result.body)
		assert.equal(status.identityAssurance.authenticated, true)
		assert.equal(status.identityAssurance.secured, true)
		assert.equal(status.identityAssurance.basis, 'oauth-access-token')
		assert.equal(status.identityAssurance.freeValueQuotaEligible, true)
		assert.ok(allowanceReads.length >= 3, 'real auth.status must query its allowance adapter')
		assert.ok(allowanceReads.every(identity => identity === principalA.installHash))
		assert.equal(JSON.stringify(status).includes(principalA.installHash), false, 'server-only identity must not leak')
		const profileA1 = await send(tool('betterpptx.auth.get_profile'), authA)
		const profileA2 = await send(tool('betterpptx.auth.get_profile'), authA)
		const profileB = await send(tool('betterpptx.auth.get_profile'), authB)
		for (const result of [profileA1, profileA2, profileB]) {
			assert.equal(result.response.status, 200)
			assert.equal(result.body?.result?.isError, false)
			assert.deepEqual(Object.keys(result.body.result.structuredContent), ['id'])
			assert.match(result.body.result.structuredContent.id, /^bpptx_[A-Za-z0-9_-]{40,}$/)
		}
		assert.equal(profileA1.body.result.structuredContent.id, profileA2.body.result.structuredContent.id)
		assert.notEqual(profileA1.body.result.structuredContent.id, profileB.body.result.structuredContent.id)
		assert.equal(JSON.stringify(profileA1.body).includes(principalA.installHash), false)
	})

	await t.test('wrong issuer, audience, signature, expiry and token type reject even on discovery tools', async () => {
		const attacker = await generateKeyPair('ES256')
		const invalid = [
			await sign('account-a', { iss: 'https://attacker.example.test' }),
			await sign('account-a', { aud: 'https://other.example.test/mcp' }),
			await sign('account-a', {}, attacker.privateKey),
			await sign('account-a', { exp: Math.floor(Date.now() / 1000) - 1 }),
			await sign('account-a', { typ: 'ID' }), await sign('account-a', { typ: 'Refresh' }),
			'not-a-token',
		]
		const readsBefore = allowanceReads.length
		for (const token of invalid) assertMcpAuthenticationRequired(await send(tool('betterpptx.auth.status'), {
			...spoofed, authorization: `Bearer ${token}`,
		}))
		assert.equal(allowanceReads.length, readsBefore)
	})

	await t.test('stateful account A session denies foreign B on POST, GET and DELETE', async () => {
		const init = await send(message('initialize', {
			protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'account-a-test', version: '1' },
		}, { legacy: true }), authA, { legacy: true })
		assert.equal(init.response.status, 200)
		assert.equal(init.body?.error, undefined)
		const sessionId = init.response.headers.get('mcp-session-id')
		assert.ok(sessionId, 'initialize must actually allocate a stateful session')
		const ownerHeaders = { ...authA, 'mcp-session-id': sessionId }
		const initialized = await send({ jsonrpc: '2.0', method: 'notifications/initialized' }, ownerHeaders, { legacy: true })
		assert.equal(initialized.response.status, 202)
		for (const method of ['POST', 'GET', 'DELETE']) {
			const body = method === 'POST' ? message('tools/list', {}, { legacy: true }) : undefined
			const foreign = await send(body, { ...spoofed, ...authB, 'mcp-session-id': sessionId,
				...(method === 'GET' ? { accept: 'text/event-stream' } : {}) }, { method, legacy: true })
			assert.equal(foreign.response.status, 401, `foreign ${method} must be denied before transport dispatch`)
			assert.equal(foreign.body?.error?.code, 'INSTALL_IDENTITY_MISMATCH')
			assert.equal(foreign.body?.result, undefined)
		}
		const own = await send(message('tools/call', { name: 'betterpptx.auth.status', arguments: {} }, { legacy: true }), ownerHeaders, { legacy: true })
		assert.equal(own.response.status, 200, 'foreign DELETE must not close the owner session')
		assert.equal(toolPayload(own.body).identityAssurance.authenticated, true)
		const closed = await send(undefined, ownerHeaders, { method: 'DELETE', legacy: true })
		assert.equal(closed.response.status, 200)
	})

	await t.test('local download requires verified owner A; B, anonymous, expired and private sidecars deny', async () => {
		const store = createArtifactStore({ root: downloadRoot, base })
		const content = Buffer.from('offline owned artifact fixture')
		const artifact = await withResourceAuthorization(principalA, async () => {
			const target = await store.prepareArtifactTarget({ fileName: 'owned.txt', extension: 'txt' })
			await fs.writeFile(target.target, content, { flag: 'wx' })
			return store.finalizeSaveTarget(target)
		})
		const pathname = new URL(artifact.downloadUrl).pathname
		async function download(headers, target = pathname) {
			const response = await fetch(`${base}${target}`, { headers, signal: AbortSignal.timeout(10_000) })
			return { response, bytes: Buffer.from(await response.arrayBuffer()) }
		}
		const own = await download(authA)
		assert.equal(own.response.status, 200)
		assert.deepEqual(own.bytes, content)
		assert.equal(own.response.headers.get('cache-control'), 'private, no-store')
		const browserTarget = `${pathname}${new URL(artifact.downloadUrl).search}`
		const browser = await download({}, browserTarget)
		assert.equal(browser.response.status, 200, 'owner-issued browser link must work without an OAuth header')
		assert.deepEqual(browser.bytes, content)
		assert.equal(browser.response.headers.get('referrer-policy'), 'no-referrer')
		const invalidBrowser = await download({}, `${browserTarget.slice(0, -1)}${browserTarget.endsWith('A') ? 'B' : 'A'}`)
		assert.equal(invalidBrowser.response.status, 404, 'altered browser proof must not serve an artifact')
		for (const headers of [authB, { ...spoofed, ...authB }]) {
			const foreign = await download(headers)
			assert.equal(foreign.response.status, 404)
			assert.equal(JSON.parse(foreign.bytes).error.code, 'ARTIFACT_NOT_FOUND')
		}
		for (const headers of [{}, spoofed, { authorization: `Bearer ${await sign('account-a', { exp: Math.floor(Date.now() / 1000) - 1 })}` }]) {
			const denied = await download(headers)
			assert.equal(denied.response.status, 401)
			assert.equal(JSON.parse(denied.bytes).error.code, 'AUTHENTICATION_REQUIRED')
		}
		const sidecarPath = path.join(path.dirname(artifact.target), '.owner.json')
		const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'))
		assert.equal(sidecar.resourceOwner.kind, 'install')
		for (const name of ['.owner.json', '%2eowner.json']) {
			const denied = await download(authA, `${pathname.slice(0, pathname.lastIndexOf('/') + 1)}${name}`)
			assert.equal(denied.response.status, 400)
			assert.equal(denied.bytes.includes(Buffer.from(sidecar.resourceOwner.id)), false)
		}
		// Expire ONLY the temporary fixture's private metadata; no runtime clock,
		// server code, production artifact or real account state is changed.
		sidecar.expiresAt = new Date(Date.now() - 1000).toISOString()
		await fs.writeFile(sidecarPath, JSON.stringify(sidecar))
		const expired = await download(authA)
		assert.equal(expired.response.status, 404)
		assert.equal(JSON.parse(expired.bytes).error.code, 'ARTIFACT_NOT_FOUND')
		assert.equal((await download({}, browserTarget)).response.status, 404)
	})

	await t.test('no external/provider connection or allowance/billing write was attempted', async () => {
		assert.equal(deniedConnections, 0)
		assert.equal(allowanceWrites, 0)
		for (const name of ['must-not-write-allowances.json', 'must-not-write-ledger.json', 'must-not-write-entitlements.json']) {
			await assert.rejects(fs.stat(path.join(fixtureRoot, name)), { code: 'ENOENT' })
		}
	})
})
