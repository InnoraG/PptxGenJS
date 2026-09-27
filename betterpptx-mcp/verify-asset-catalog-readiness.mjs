#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

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

function flag(name) {
	return process.argv.includes(name)
}

function normalizeBase(value = '') {
	return String(value || '').trim().replace(/\/+$/, '')
}

function redact(value = '') {
	return String(value).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp')
}

function generateDeviceToken() {
	return `bpptx_device_${crypto.randomBytes(32).toString('base64url')}`
}

function assertNoImplementationLeak(value, label) {
	const text = JSON.stringify(value)
	assert.ok(!/[A-Z]:\\|\/home\/|\/tmp\/|process\.cwd|engine\.mjs|betterpptx-mcp[\\/]/i.test(text), `${label} leaked implementation details`)
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

function catalogPayload(result) {
	assert.equal(result?.ok, true, 'tool result should be ok')
	return result.data || result
}

const CATALOG_CASES = [
	{ label: 'strategy', query: 'executive growth strategy', args: { useCase: 'board slide hero', sizePolicy: 'large-ok' }, intent: 'strategy' },
	{ label: 'security', query: 'cybersecurity risk and trust', args: { sizePolicy: 'large-ok' }, intent: 'risk-security' },
	{ label: 'medical', query: 'medical innovation for patient care', args: { sizePolicy: 'large-ok' }, intent: 'health-science' },
	{ label: 'growth-intent', query: '', args: { intent: 'growth', useCase: 'launch milestone', sizePolicy: 'large-ok' }, intent: 'growth' },
]

function assertCatalogCase(data, item) {
	assert.ok(Array.isArray(data.assets) && data.assets.length > 0, `${item.label}: expected catalog assets`)
	assert.ok(data.assets.some(asset => String(asset.handle || '').startsWith('model3d://microsoft-stock/')), `${item.label}: expected at least one Microsoft Stock handle`)
	assert.ok(data.queryExpansion, `${item.label}: expected query expansion`)
	assert.ok(data.catalogGuide, `${item.label}: expected catalog guide`)
	const matched = data.queryExpansion?.matchedIntents || []
	const entryCollections = data.assets.flatMap(asset => asset.ai?.collections || [])
	assert.ok(
		matched.some(intent => intent.id === item.intent) || entryCollections.some(intent => intent.id === item.intent),
		`${item.label}: expected intent ${item.intent}`,
	)
	assertNoImplementationLeak(data, item.label)
	return data.assets[0]?.handle
}

async function verifyLocal() {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	const assetRoot = path.resolve(argValue('--asset-root') || process.env.BETTERPPTX_ASSETS_ROOT || process.cwd())
	process.env.BETTERPPTX_ASSETS_ROOT = assetRoot
	const microsoftRoot = path.join(assetRoot, 'outputs', 'microsoft_stock3d_library')
	assert.ok(fs.existsSync(path.join(microsoftRoot, 'records')), `missing Microsoft Stock records under ${microsoftRoot}`)
	assert.ok(fs.existsSync(path.join(microsoftRoot, 'glb')), `missing Microsoft Stock GLBs under ${microsoftRoot}`)

	const glbCount = fs.readdirSync(path.join(microsoftRoot, 'glb')).filter(name => name.toLowerCase().endsWith('.glb')).length
	const minMicrosoftGlbs = Math.max(1, Number(argValue('--min-microsoft-glbs') || 1000))
	assert.ok(glbCount >= minMicrosoftGlbs, `expected at least ${minMicrosoftGlbs} Microsoft Stock GLBs, found ${glbCount}`)

	const { callBetterPptxTool } = await import('./engine.mjs')
	const topHandles = {}
	for (const item of CATALOG_CASES) {
		const result = await callBetterPptxTool('betterpptx.assets.catalog', {
			kind: 'model3d',
			query: item.query,
			maxResults: 8,
			...item.args,
		})
		topHandles[item.label] = assertCatalogCase(catalogPayload(result), item)
	}
	return { mode: 'local', assetRoot, microsoftGlbs: glbCount, topHandles }
}

async function verifyCloud() {
	const base = normalizeBase(argValue('--base') || process.env.BETTERPPTX_VERIFY_CLOUD_RUN_BASE || process.env.BETTERPPTX_PUBLIC_BASE)
	const mcpUrl = normalizeBase(argValue('--mcp-url') || process.env.BETTERPPTX_VERIFY_CLOUD_RUN_MCP_URL || (base ? `${base}/mcp` : ''))
	assert.ok(/^https:\/\//i.test(mcpUrl), 'cloud mode requires --base=https://... or --mcp-url=https://.../mcp')
	const bearer = argValue('--bearer') || process.env.BETTERPPTX_VERIFY_BEARER || ''
	const deviceToken = argValue('--device-token') || process.env.BETTERPPTX_VERIFY_DEVICE_TOKEN || generateDeviceToken()
	const includeDeviceHeader = process.env.BETTERPPTX_VERIFY_NO_DEVICE_HEADER !== '1'
	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
		...(includeDeviceHeader ? { 'x-betterpptx-device': deviceToken } : {}),
		...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
	}
	let requestId = 1
	let sessionId = ''
	async function rpc(method, params = {}) {
		const res = await fetch(mcpUrl, {
			method: 'POST',
			headers: {
				...headers,
				...(sessionId ? { 'mcp-session-id': sessionId } : {}),
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
		})
		if (!sessionId && res.headers.get('mcp-session-id')) sessionId = res.headers.get('mcp-session-id')
		const body = await decodeResponse(res)
		return { res, body, payload: toolPayload(body) }
	}

	if (base) {
		const health = await fetch(`${base}/health`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} })
		assert.equal(health.status, 200, `Cloud health failed for ${base}`)
	}
	const init = await rpc('initialize', {
		protocolVersion: '2025-06-18',
		clientInfo: { name: 'asset-catalog-readiness', version: '1' },
		capabilities: {},
	})
	assert.equal(init.res.status, 200, `MCP initialize failed for ${redact(mcpUrl)}: ${JSON.stringify(init.body)}`)
	if (sessionId) {
		await rpc('notifications/initialized', {})
	}

	const topHandles = {}
	for (const item of CATALOG_CASES) {
		const call = await rpc('tools/call', {
			name: 'betterpptx.assets.catalog',
			arguments: {
				kind: 'model3d',
				query: item.query,
				maxResults: 8,
				...item.args,
			},
		})
		assert.equal(call.res.status, 200, `${item.label}: tools/call failed`)
		topHandles[item.label] = assertCatalogCase(catalogPayload(call.payload), item)
	}
	return { mode: 'cloud', base: base || null, mcpUrl: redact(mcpUrl), topHandles }
}

async function main() {
	const mode = String(argValue('--mode') || (flag('--cloud') ? 'cloud' : 'local')).toLowerCase()
	const results = []
	if (mode === 'local' || mode === 'both') results.push(await verifyLocal())
	if (mode === 'cloud' || mode === 'both') results.push(await verifyCloud())
	if (!results.length) throw new Error(`Unknown mode: ${mode}`)
	console.log(JSON.stringify({ ok: true, readiness: results }, null, 2))
}

main().catch(error => {
	console.error('ASSET CATALOG READINESS: FAIL')
	console.error(error?.message || String(error))
	process.exit(1)
})
