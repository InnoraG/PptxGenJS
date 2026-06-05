// Verify public freemium behavior: slides 1-2 premium preview, slide 3+
// premium animation gate, and optional activation retry.
import * as fs from 'node:fs'

function readEnvFile(file) {
	if (!fs.existsSync(file)) return {}
	const env = {}
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/)
		if (m) env[m[1]] = m[2]
	}
	return env
}

function resolveMcpUrl() {
	const explicit = process.argv[2]?.trim()
	if (explicit) return explicit
	const env = readEnvFile('deploy/production.env')
	if (process.env.BETTERPPTX_PUBLIC_MCP_URL) return process.env.BETTERPPTX_PUBLIC_MCP_URL
	if (env.BETTERPPTX_PUBLIC_MCP_URL) return env.BETTERPPTX_PUBLIC_MCP_URL
	const base = (env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
	const secret = env.BETTERPPTX_URL_SECRET
	const auth = env.BETTERPPTX_AUTH
	if (base && auth === 'none') return `${base}/mcp`
	if (base && secret) return `${base}/s/${secret}/mcp`
	console.error('Usage: node betterpptx/verify-freemium-gate.mjs <public-mcp-url>')
	process.exit(2)
}

function redactUrl(url) {
	return String(url).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp')
}

const MCP = resolveMcpUrl()
const H = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
const sse = text => {
	for (const line of String(text).split('\n')) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}
const body = async res => {
	const ct = res.headers.get('content-type') || ''
	const raw = await res.text()
	return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null)
}

let SID = null
async function rpc(method, params) {
	const res = await fetch(MCP, {
		method: 'POST',
		headers: { ...H, ...(SID ? { 'mcp-session-id': SID } : {}) },
		body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
	})
	if (!SID) SID = res.headers.get('mcp-session-id')
	return body(res)
}

async function tool(name, args) {
	const response = await rpc('tools/call', { name, arguments: args })
	const payload = JSON.parse(response?.result?.content?.[0]?.text || '{}')
	return payload
}

function fail(message, payload) {
	console.error('FREEMIUM VERIFY: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

async function main() {
	console.log('MCP:', redactUrl(MCP))
	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'freemium-gate-verify', version: '1' },
		capabilities: {},
	})
	console.log('initialize ->', init?.result?.serverInfo?.name, 'session', SID ? 'yes' : 'no')
	await fetch(MCP, {
		method: 'POST',
		headers: { ...H, 'mcp-session-id': SID },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
	})

	const auth = await tool('betterpptx.auth.status', {})
	const quota = auth?.data?.quota || {}
	const policy = auth?.data?.policy || {}
	const authOk = auth?.ok === true && quota.premiumPreviewSlides === 2 && quota.gateStartsAfterSlide === 2 &&
		policy.premiumPreviewSlides === 2 && policy.gateStartsAfterSlide === 2 &&
		!('blockedFeatures' in quota) && !('maxSlidesPerDeck' in quota) &&
		!('blockedFeatures' in policy) && !('maxSlidesPerDeck' in policy)
	if (!authOk) fail('auth.status policy mismatch', auth)

	const deck = await tool('betterpptx.deck.new', { layout: 'LAYOUT_WIDE', title: 'Freemium Gate Test' })
	if (!deck.ok) fail('deck.new failed', deck)
	const deckId = deck.data.deckId
	await tool('betterpptx.slide.add', { deckId, background: { color: '0F172A' } })
	await tool('betterpptx.slide.add_text', { deckId, slideIndex: 0, text: 'Freemium preview', options: { x: 1, y: 2.5, w: 11, h: 1, fontSize: 36, bold: true, color: 'FFFFFF', objectName: 's1-title' } })
	await tool('betterpptx.slide.add', { deckId, background: { color: '111827' }, transition: { type: 'morph', option: 'byObject', duration: 800 } })
	await tool('betterpptx.slide.add_text', { deckId, slideIndex: 1, text: 'Slide 2 morph preview', options: { x: 1, y: 2.5, w: 11, h: 1, fontSize: 36, bold: true, color: '22D3EE', objectName: 's1-title' } })
	await tool('betterpptx.slide.add', { deckId, background: { color: 'FFFFFF' } })
	await tool('betterpptx.slide.add_text', { deckId, slideIndex: 2, text: 'Slide 3 premium gate target', options: { x: 1, y: 2.5, w: 11, h: 1, fontSize: 32, bold: true, color: '111827', objectName: 's3-title' } })

	const gated = await tool('betterpptx.slide.animate_shapes', {
		deckId,
		slideIndex: 2,
		names: ['s3-title'],
		animation: { type: 'entrance', effect: 'fade', duration: 500, trigger: 'afterPrevious' },
	})
	const err = gated?.error || {}
	const gateOk = gated?.ok === false &&
		err.code === 'REQUIRES_UPGRADE' &&
		err.recoverable === true &&
		Array.isArray(err.next_actions) &&
		err.next_actions.some(a => a.tool === 'betterpptx.auth.activate_key') &&
		err.artifact_state === 'work_so_far_valid'
	if (!gateOk) fail('slide 3 premium animation did not return structured REQUIRES_UPGRADE', gated)
	console.log('gate -> structured REQUIRES_UPGRADE')

	const key = process.env.BETTERPPTX_VERIFY_ACTIVATION_KEY || ''
	if (!key) {
		console.log('activation -> skipped (set BETTERPPTX_VERIFY_ACTIVATION_KEY for full retry test)')
		console.log('FREEMIUM VERIFY: PASS')
		return
	}

	const activated = await tool('betterpptx.auth.activate_key', { key, provider: 'auto' })
	if (!activated.ok) fail('activation failed', activated)
	const retried = await tool('betterpptx.slide.animate_shapes', {
		deckId,
		slideIndex: 2,
		names: ['s3-title'],
		animation: { type: 'entrance', effect: 'fade', duration: 500, trigger: 'afterPrevious' },
	})
	if (!retried.ok) fail('premium retry after activation failed', retried)
	console.log('activation retry -> ok')
	console.log('FREEMIUM VERIFY: PASS')
}

main().catch(err => fail(err.message || String(err)))
