#!/usr/bin/env node

import * as crypto from 'node:crypto'

function argValue(name, fallback = '') {
	const prefix = `${name}=`
	const hit = process.argv.find(arg => arg === name || arg.startsWith(prefix))
	if (!hit) return fallback
	if (hit === name) {
		const index = process.argv.indexOf(hit)
		return process.argv[index + 1] || fallback
	}
	return hit.slice(prefix.length)
}

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeBase(value = '') {
	return String(value || '').trim().replace(/\/+$/, '')
}

function generateDeviceToken() {
	return `bpptx_device_${crypto.randomBytes(32).toString('base64url')}`
}

function ssePayload(raw) {
	for (const line of String(raw || '').split(/\r?\n/)) {
		const match = /^data:\s*(.+)$/.exec(line)
		if (match) return JSON.parse(match[1])
	}
	return null
}

async function decodeResponse(res) {
	const raw = await res.text()
	const contentType = res.headers.get('content-type') || ''
	if (!raw) return null
	if (contentType.includes('event-stream')) return ssePayload(raw)
	return JSON.parse(raw)
}

function toolPayload(body) {
	const result = body?.result
	if (!result) return null
	if (result.structuredContent) return result.structuredContent
	const text = result.content?.[0]?.text
	if (!text) return null
	return JSON.parse(text)
}

async function main() {
	const base = normalizeBase(
		argValue('--base')
		|| process.env.BETTERPPTX_VERIFY_CLOUD_RUN_BASE
		|| process.env.BETTERPPTX_PUBLIC_BASE,
	)
	const mcpUrl = normalizeBase(
		argValue('--mcp-url')
		|| process.env.BETTERPPTX_VERIFY_CLOUD_RUN_MCP_URL
		|| (base ? `${base}/mcp` : ''),
	)
	const timeoutMs = Math.max(15000, Number(argValue('--timeout-ms') || process.env.BETTERPPTX_VERIFY_CLOUD_RUN_TIMEOUT_MS || 180000))
	const deviceToken = argValue('--device-token') || process.env.BETTERPPTX_VERIFY_DEVICE_TOKEN || generateDeviceToken()
	expect(/^https:\/\//i.test(base), 'A public HTTPS Cloud Run base URL is required. Pass --base=https://...', { base })
	expect(/^https:\/\//i.test(mcpUrl), 'A public HTTPS MCP URL is required.', { mcpUrl })

	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
		'x-betterpptx-device': deviceToken,
	}
	let requestId = 1
	async function rpc(method, params = {}) {
		const res = await fetch(mcpUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
		})
		const body = await decodeResponse(res)
		return { res, body, payload: toolPayload(body) }
	}

	const health = await fetch(`${base}/health`)
	expect(health.status === 200, 'Cloud Run health endpoint should be reachable.', { status: health.status, body: await health.text().catch(() => '') })

	const capabilitiesRes = await fetch(`${base}/payments/capabilities`, { headers: { 'x-betterpptx-device': deviceToken } })
	const capabilities = await decodeResponse(capabilitiesRes)
	expect(capabilitiesRes.status === 200, 'Payment capabilities endpoint should be reachable with an install identity.', { status: capabilitiesRes.status, capabilities })
	expect(capabilities?.readiness?.webReady === true && capabilities?.readiness?.appReady === true && capabilities?.readiness?.agenticReady === true, 'Universal payment surfaces must be enabled.', { capabilities })
	expect(capabilities?.deckState?.publicProductionEligible === true, 'Distributed deck head store must be public-production eligible.', { deckState: capabilities?.deckState })
	expect(capabilities?.deckSpecState?.publicProductionEligible === true, 'Canonical deck spec store must be public-production eligible.', { deckSpecState: capabilities?.deckSpecState })
	expect(capabilities?.lockedAssetState?.publicProductionEligible === true, 'Locked asset store must be public-production eligible.', { lockedAssetState: capabilities?.lockedAssetState })
	expect(capabilities?.operationState?.publicProductionEligible === true, 'Durable operation store must be public-production eligible.', { operationState: capabilities?.operationState })
	expect(capabilities?.operationDispatcherState?.publicProductionEligible === true, 'Cloud Tasks operation dispatcher must be public-production eligible.', { operationDispatcherState: capabilities?.operationDispatcherState })

	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'cloud-run-distributed-runtime-verify', version: '1' },
		capabilities: {},
	})
	expect(init.res.status === 200 && init.body?.result?.serverInfo?.name, 'MCP initialize should succeed through stateless public endpoint.', { status: init.res.status, body: init.body })
	expect(!init.res.headers.get('mcp-session-id'), 'Stateless public endpoint must not emit mcp-session-id.', { sessionHeader: init.res.headers.get('mcp-session-id') })

	const idempotencyKey = `cloud-distributed-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
	const create = await rpc('tools/call', {
		name: 'betterpptx.deck.new',
		arguments: {
			title: 'Cloud Run distributed runtime verifier',
			idempotencyKey,
		},
	})
	expect(create.res.status === 200, 'Queued deck.new request should return an MCP response.', { status: create.res.status, body: create.body })
	expect(create.payload?.ok === false && create.payload?.error?.code === 'OPERATION_PENDING', 'Distributed gateway should queue mutating work instead of executing it inline.', { payload: create.payload })
	const operationId = create.payload?.error?.details?.operationId
	expect(/^op_[0-9a-f]{32}$/i.test(operationId), 'Pending operation should expose an opaque operation id.', { payload: create.payload })

	const startedAt = Date.now()
	let statusPayload = null
	while (Date.now() - startedAt < timeoutMs) {
		const status = await rpc('tools/call', {
			name: 'betterpptx.operation.status',
			arguments: { operationId },
		})
		expect(status.res.status === 200, 'Operation status call should return an MCP response.', { status: status.res.status, body: status.body })
		statusPayload = status.payload
		expect(statusPayload?.ok === true, 'Operation status should be visible to the same install.', { statusPayload })
		if (statusPayload.data?.state === 'succeeded') break
		if (statusPayload.data?.state === 'failed' || statusPayload.data?.state === 'cancelled') {
			throw Object.assign(new Error(`Queued operation ended as ${statusPayload.data.state}.`), { details: { statusPayload } })
		}
		await sleep(2000)
	}
	expect(statusPayload?.data?.state === 'succeeded' && statusPayload?.data?.result?.deckId, 'Cloud Tasks worker should complete the queued deck operation.', { statusPayload, timeoutMs })

	const replay = await rpc('tools/call', {
		name: 'betterpptx.deck.new',
		arguments: {
			title: 'Cloud Run distributed runtime verifier',
			idempotencyKey,
		},
	})
	expect(replay.payload?.ok === true, 'Completed queued operation should replay through the public gateway.', { replay: replay.payload })
	expect(replay.payload?.data?.deckId === statusPayload.data.result.deckId, 'Replay should return the same completed deck id.', { replay: replay.payload, status: statusPayload })
	expect(replay.payload?.data?.durableOperation?.replay === true, 'Replay should be marked as a durable operation replay.', { replay: replay.payload })

	console.log(`CLOUD RUN DISTRIBUTED RUNTIME: PASS base=${base} operationId=${operationId} deckId=${statusPayload.data.result.deckId} stateless=1 queued=1 worker=1 replay=1 publicProductionReady=${capabilities.readiness.publicProductionReady === true ? 1 : 0}`)
}

main().catch(error => {
	console.error('CLOUD RUN DISTRIBUTED RUNTIME: FAIL')
	console.error(error?.message || String(error))
	if (error?.details) console.error(JSON.stringify(error.details, null, 2))
	process.exit(1)
})
