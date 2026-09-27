import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'

for (const name of Object.keys(process.env)) {
	if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-public-http-schema-'))
Object.assign(process.env, {
	BETTERPPTX_ENV: 'production',
	BETTERPPTX_DEPLOYMENT_STAGE: 'production',
	BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering',
	BETTERPPTX_MONETIZED_MCP_ENABLED: '1',
	BETTERPPTX_BILLING_PROVIDER: 'crypto_credits',
	BETTERPPTX_BILLING_MODEL: 'pay_per_job',
	BETTERPPTX_BILLING_ENFORCE: '1',
	BETTERPPTX_AUTH: 'none',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_X402_STORE: 'local',
	BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(fixtureRoot, 'leases'),
	BETTERPPTX_X402_FILE: path.join(fixtureRoot, 'quotes.json'),
	BETTERPPTX_PAYMENT_ENVELOPE_SECRET: 'public-http-schema-fixture-secret-not-real',
	BETTERPPTX_TREASURY_EVM_ADDRESS: '0x4000000000000000000000000000000000000001',
	BETTERPPTX_DOWNLOAD_ROOT: path.join(fixtureRoot, 'downloads'),
})

const { startBetterPptxHttp } = await import('../server-http.mjs')

function parseRpcResponse(response, raw) {
	const contentType = response.headers.get('content-type') || ''
	if (contentType.includes('text/event-stream')) {
		const line = raw.split(/\r?\n/).find(value => /^data:\s*/.test(value))
		return line ? JSON.parse(line.replace(/^data:\s*/, '')) : null
	}
	return raw ? JSON.parse(raw) : null
}

async function rpc(base, method, params = {}, sessionId = '') {
	const headers = {
		'content-type': 'application/json',
		'accept': 'application/json, text/event-stream',
		'mcp-protocol-version': '2026-07-28',
	}
	if (sessionId) headers['mcp-session-id'] = sessionId
	const requestParams = {
		...params,
		_meta: {
			'io.modelcontextprotocol/protocolVersion': '2026-07-28',
			'io.modelcontextprotocol/clientInfo': { name: 'public-http-schema-parity-fixture', version: '1' },
			'io.modelcontextprotocol/clientCapabilities': {},
		},
	}
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: requestParams }),
	})
	const raw = await response.text()
	const parsed = parseRpcResponse(response, raw)
	assert.equal(response.status, 200, `${method}: ${raw}`)
	assert.equal(parsed?.error, undefined, `${method}: ${JSON.stringify(parsed?.error)}`)
	return {
		body: parsed,
		sessionId: response.headers.get('mcp-session-id') || sessionId,
	}
}

test('served public HTTP schema agrees with production manifest and executable guidance', async () => {
	const started = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, open: true, downloadRoot: path.join(fixtureRoot, 'downloads') })
	try {
		const address = started.httpServer.address()
		const base = `http://127.0.0.1:${address.port}`
		const healthResponse = await fetch(`${base}/health`)
		assert.equal(healthResponse.status, 200)
		const health = await healthResponse.json()

		const discovered = await rpc(base, 'server/discover')
		const listed = await rpc(base, 'tools/list')
		const tools = listed.body?.result?.tools || []
		const publicDiscovery = listed.body?.result?.publicDiscovery
		assert.equal(discovered.body?.result?.publicDiscovery?.advertisedToolSchemaDigest, publicDiscovery?.advertisedToolSchemaDigest)
		assert.ok(tools.length >= 57, `expected production tool inventory, got ${tools.length}`)
		assert.equal(tools.some(tool => tool.name === 'betterpptx.assets.generate_image'), false)
		assert.equal(health.advertisedToolCount, tools.length)
		assert.equal(health.semanticVersion, publicDiscovery.semanticVersion)
		assert.equal(health.toolSchemaVersion, publicDiscovery.toolSchemaVersion)
		assert.equal(health.capabilityContentDigest, publicDiscovery.capabilityContentDigest)
		assert.equal(health.advertisedToolSchemaDigest, publicDiscovery.advertisedToolSchemaDigest)
		assert.equal(health.advertisedToolSchemaDigestCoverage, publicDiscovery.advertisedToolSchemaDigestCoverage)

		const byName = new Map(tools.map(tool => [tool.name, tool]))
		for (const field of ['view', 'intent', 'lessonId', 'controlId', 'query', 'q']) {
			assert.ok(byName.get('betterpptx.authoring.catalog')?.inputSchema?.properties?.[field], `authoring.catalog must expose ${field}`)
		}
		assert.equal(byName.get('betterpptx.billing.estimate')?.annotations?.readOnlyHint, true)
		for (const toolName of ['betterpptx.deck.generate_from_spec', 'betterpptx.assets.upload', 'betterpptx.deck.save']) {
			assert.equal(byName.get(toolName)?.annotations?.destructiveHint, false, `${toolName} is governed and non-destructive`)
			assert.equal(byName.get(toolName)?.annotations?.idempotentHint, true, `${toolName} must advertise replay safety`)
		}
		assert.ok(byName.get('betterpptx.narration.voices')?.inputSchema?.properties?.language)
		assert.ok(byName.get('betterpptx.deck.generate_from_spec')?.inputSchema?.anyOf?.some(branch => branch.required?.includes('specHandle')))
		assert.equal(byName.get('betterpptx.deck.export_spec')?.inputSchema?.properties?.download?.type, 'boolean')
		assert.ok(byName.has('betterpptx.avatar.attach_result'))

		const serializedTools = JSON.stringify(tools)
		assert.doesNotMatch(serializedTools, /preview every slide before public save|configure hosted PowerPoint to continue|defer public save when preview is unavailable/i)

		const help = await rpc(base, 'tools/call', { name: 'betterpptx.help.capabilities', arguments: {} })
		const helpText = help.body?.result?.content?.find(item => item.type === 'text')?.text || ''
		const helpPayload = JSON.parse(helpText)
		const helpData = helpPayload.data || helpPayload
		assert.equal(helpData.releaseInfrastructure?.verificationPolicy?.policy, 'production-non-rendering')
		assert.equal(helpData.releaseInfrastructure?.verificationPolicy?.rendererRequiredForSave, false)
		assert.match(JSON.stringify(helpData), /Avatar.*talking-head|talking-head.*Avatar/i)
	} finally {
		await new Promise(resolve => started.httpServer.close(resolve))
	}
})

test.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))
