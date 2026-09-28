import assert from 'node:assert/strict'
import { waitForIdentityMatch } from './deploy/cloudflare-edge/release-identity-retry.mjs'

const origin = String(process.argv[2] || '').trim().replace(/\/+$/, '')
const publicBase = String(process.argv[3] || '').trim().replace(/\/+$/, '')
if (!/^https:\/\/[a-z0-9-]+\.a\.run\.app$/i.test(origin)) {
	throw new Error('Pass the exact verified Cloud Run run.app origin first.')
}
if (publicBase !== 'https://betterpptx.xmcpx.com') {
	throw new Error('Pass the configured BetterPPTX custom domain second.')
}

function responseJson(text) {
	const trimmed = String(text || '').trim()
	if (!trimmed) return null
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
	const dataLines = trimmed.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim())
	for (const line of dataLines) {
		if (!line || line === '[DONE]') continue
		try { return JSON.parse(line) } catch {}
	}
	return null
}

function unwrapStatus(result) {
	const structured = result?.structuredContent
	if (structured) return structured.data || structured
	const text = result?.content?.find(item => item.type === 'text')?.text
	if (!text) return null
	const parsed = JSON.parse(text)
	return parsed?.data || parsed
}

async function readReleaseIdentity(base, signal = AbortSignal.timeout(10_000)) {
	async function rpc(body, sessionId = '') {
		const response = await fetch(`${base}/mcp`, {
			method: 'POST',
			headers: {
				Accept: 'application/json, text/event-stream',
				'Content-Type': 'application/json',
				'MCP-Protocol-Version': '2025-03-26',
				...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
			},
			body: JSON.stringify(body),
			signal,
		})
		const text = await response.text()
		return { response, payload: responseJson(text) }
	}

	const initialized = await rpc({
		jsonrpc: '2.0', id: 1, method: 'initialize',
		params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'betterpptx-release-identity-check', version: '1.0.0' } },
	})
	assert.equal(initialized.response.status, 200, `${base} MCP initialize failed: ${initialized.response.status}.`)
	assert.equal(initialized.payload?.result?.protocolVersion, '2025-03-26', `${base} did not negotiate the expected MCP protocol.`)
	const sessionId = initialized.response.headers.get('mcp-session-id') || ''
	const called = await rpc({
		jsonrpc: '2.0', id: 2, method: 'tools/call',
		params: { name: 'betterpptx.status', arguments: {} },
	}, sessionId)
	assert.equal(called.response.status, 200, `${base} status lookup failed: ${called.response.status}.`)
	assert(!called.payload?.error && called.payload?.result?.isError !== true, `${base} status lookup returned an MCP error.`)
	const status = unwrapStatus(called.payload?.result)
	assert.equal(status?.product, 'BetterPPTX', `${base} did not return the BetterPPTX status contract.`)
	const identity = {
		version: status.semanticVersion || status.version || null,
		toolSchemaVersion: status.toolSchemaVersion || status.capabilityDiscovery?.toolSchemaVersion || null,
		buildIdentity: status.capabilityDiscovery?.buildIdentity || status.buildIdentity || null,
		capabilityContentDigest: status.capabilityDiscovery?.capabilityContentDigest || null,
		advertisedToolSchemaDigest: status.capabilityDiscovery?.advertisedToolSchemaDigest || null,
		verificationPolicy: status.verificationPolicy?.policy || null,
		environmentMode: status.verificationPolicy?.environmentMode || null,
	}
	for (const [field, value] of Object.entries(identity)) {
		assert(value, `${base} status did not provide ${field}; route identity is unverifiable.`)
	}
	return identity
}

const originIdentity = await readReleaseIdentity(origin)
const { actual: publicIdentity, attempts } = await waitForIdentityMatch(
	originIdentity,
	signal => readReleaseIdentity(publicBase, signal),
	{
		maxAttempts: 24,
		retryDelayMs: 5000,
		timeoutMs: 120_000,
		onRetry: ({ attempt, mismatchFields, readFailed }) => {
			const reason = readFailed ? 'the endpoint has not returned a valid identity' : `identity differs in ${mismatchFields.join(', ')}`
			console.warn(`Custom-domain propagation check ${attempt}/24: ${reason}; retrying.`)
		},
	},
)
assert.deepEqual(publicIdentity, originIdentity, 'Custom-domain identity must match the verified Cloud Run release.')

console.log(`CUSTOM-DOMAIN CLOUD RUN IDENTITY: PASS attempts=${attempts} version=${originIdentity.version} schema=${originIdentity.toolSchemaVersion} environment=${originIdentity.environmentMode} build=${originIdentity.buildIdentity}`)
