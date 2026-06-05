// Verify the remote-download flow exactly as a web AI client
// would experience it: build + save a deck over the public MCP, read the
// downloadUrl from the tool result, then GET that URL and confirm it returns a
// real .pptx with attachment headers.
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
	console.error('Usage: node betterpptx/verify-download.mjs <public-mcp-url>')
	console.error('Or configure BETTERPPTX_PUBLIC_MCP_URL, or BETTERPPTX_PUBLIC_BASE with BETTERPPTX_AUTH=none.')
	process.exit(2)
}

function redactUrl(url) {
	return String(url).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp')
}

const MCP = resolveMcpUrl()
const H = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }
const sse = t => { for (const l of String(t).split('\n')) { const m = l.match(/^data:\s*(.+)$/); if (m) return JSON.parse(m[1]) } return null }
const body = async r => { const ct = r.headers.get('content-type') || ''; const raw = await r.text(); return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null) }
let SID = null
async function call(method, params) {
	const r = await fetch(MCP, { method: 'POST', headers: { ...H, ...(SID ? { 'mcp-session-id': SID } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) })
	if (!SID) SID = r.headers.get('mcp-session-id')
	return body(r)
}
async function tool(name, args) { const b = await call('tools/call', { name, arguments: args }); const p = JSON.parse(b.result.content[0].text); if (!p.ok) throw new Error(name + ': ' + (p.error?.message)); return p.data }
async function main() {
	console.log('MCP:', redactUrl(MCP))
	const init = await call('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'dl-verify', version: '1' }, capabilities: {} })
	console.log('initialize ->', init?.result?.serverInfo?.name, 'session', SID ? 'yes' : 'no')
	await fetch(MCP, { method: 'POST', headers: { ...H, 'mcp-session-id': SID }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) })
	const deck = await tool('betterpptx.deck.new', { layout: 'LAYOUT_WIDE', title: 'Download test' })
	await tool('betterpptx.slide.add', { deckId: deck.deckId, background: { color: '0B1020' } })
	await tool('betterpptx.slide.add_text', { deckId: deck.deckId, slideIndex: 0, text: 'Downloadable BetterPPTX deck', options: { x: 1, y: 2.4, w: 11, h: 1.1, fontSize: 38, bold: true, color: 'FFFFFF', align: 'center', objectName: 'download-title' } })
	await tool('betterpptx.slide.add_text', { deckId: deck.deckId, slideIndex: 0, text: 'Public MCP save returns a browser-fetchable .pptx URL.', options: { x: 2, y: 3.6, w: 9, h: 0.6, fontSize: 18, color: 'CBD5E1', align: 'center', objectName: 'download-subtitle' } })
	await tool('betterpptx.slide.add', { deckId: deck.deckId, background: { color: '111827' }, transition: { type: 'morph', option: 'byObject', duration: 800 } })
	await tool('betterpptx.slide.add_text', { deckId: deck.deckId, slideIndex: 1, text: 'Download verified', options: { x: 1, y: 2.4, w: 11, h: 1.1, fontSize: 42, bold: true, color: '22D3EE', align: 'center', objectName: 'download-title' } })
	const saved = await tool('betterpptx.deck.save', { deckId: deck.deckId, fileName: 'BetterPPTX Download Test.pptx' })
	console.log('deck.save ->', JSON.stringify({ bytes: saved.bytes, downloadUrl: saved.downloadUrl, downloadName: saved.downloadName }))
	if (!saved.downloadUrl) { console.log('DOWNLOAD VERIFY: FAIL (no downloadUrl returned)'); process.exit(1) }
	// Fetch the download URL like a browser
	const dl = await fetch(saved.downloadUrl)
	const buf = Buffer.from(await dl.arrayBuffer())
	const ct = dl.headers.get('content-type'); const cd = dl.headers.get('content-disposition')
	const isZip = buf[0] === 0x50 && buf[1] === 0x4b // 'PK'
	console.log('GET downloadUrl ->', dl.status, '| content-type:', ct, '| content-disposition:', cd, '| bytes:', buf.length, '| pptx-zip:', isZip)
	const pass = dl.status === 200 && (/presentationml/.test(ct || '') || /octet-stream/.test(ct || '')) && /attachment/.test(cd || '') && isZip && buf.length === saved.bytes
	console.log(pass ? 'DOWNLOAD VERIFY: PASS' : 'DOWNLOAD VERIFY: FAIL')
	process.exit(pass ? 0 : 1)
}
main().catch(e => { console.error('DOWNLOAD VERIFY ERR:', e.message); process.exit(1) })
