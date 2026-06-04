// Smoke-test: spawn the claudepptxmcp stdio server in a child process,
// drive it as a real MCP client over JSON-RPC framing on stdio,
// and verify ListTools / CallTool work end-to-end.

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cli = path.resolve(__dirname, 'cli.mjs')

const child = spawn(process.execPath, [cli], {
	stdio: ['pipe', 'pipe', 'pipe'],
})

let nextId = 1
const pending = new Map()
let rxBuffer = Buffer.alloc(0)

child.stderr.on('data', b => process.stderr.write(`[server] ${b.toString()}`))

// Newline-delimited JSON framing (the MCP SDK over stdio emits one JSON message per line)
child.stdout.on('data', chunk => {
	rxBuffer = Buffer.concat([rxBuffer, chunk])
	while (true) {
		const nl = rxBuffer.indexOf(0x0a) // \n
		if (nl < 0) break
		const line = rxBuffer.subarray(0, nl).toString('utf8').trim()
		rxBuffer = rxBuffer.subarray(nl + 1)
		if (!line) continue
		try {
			const msg = JSON.parse(line)
			const id = msg.id
			if (id != null && pending.has(id)) {
				const { resolve, reject } = pending.get(id)
				pending.delete(id)
				if (msg.error) reject(new Error(msg.error.message))
				else resolve(msg.result)
			}
		} catch (e) { process.stderr.write(`[client] parse error: ${e.message}\n`) }
	}
})

function rpc(method, params) {
	const id = nextId++
	const msg = { jsonrpc: '2.0', id, method, params }
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		child.stdin.write(JSON.stringify(msg) + '\n')
	})
}

async function main() {
	// MCP initialize
	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'claudepptxmcp-smoke', version: '1.0.0' },
		capabilities: {},
	})
	console.log('initialize OK -- server:', init.serverInfo)

	// MCP requires the "initialized" notification before normal requests
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

	// List tools
	const list = await rpc('tools/list', {})
	console.log(`tools/list OK -- ${list.tools.length} tools advertised`)
	console.log('  first 5:', list.tools.slice(0, 5).map(t => t.name).join(', '))

	// Call capabilities
	const capRes = await rpc('tools/call', { name: 'claudepptx.help.capabilities', arguments: {} })
	console.log('tools/call (capabilities) OK -- brand =', JSON.parse(capRes.content[0].text).data.brand)

	// Run end-to-end: build and save a generic one-slide deck
	const deckRes = await rpc('tools/call', { name: 'claudepptx.deck.new', arguments: { title: 'Smoke test' } })
	const deckParsed = JSON.parse(deckRes.content[0].text)
	if (!deckParsed.ok) throw new Error('deck.new failed: ' + JSON.stringify(deckParsed.error))
	const deckId = deckParsed.data.deckId
	await rpc('tools/call', { name: 'claudepptx.slide.add', arguments: { deckId, background: { color: 'FFFFFF' } } })
	await rpc('tools/call', {
		name: 'claudepptx.slide.add_text',
		arguments: {
			deckId,
			slideIndex: 0,
			text: 'claudepptxmcp smoke',
			options: { x: 1, y: 2, w: 8, h: 1, fontSize: 28, bold: true, color: '111827' },
		},
	})
	const buildRes = await rpc('tools/call', {
		name: 'claudepptx.deck.save',
		arguments: { deckId, outputDir: 'outputs', fileName: 'ClaudePptxMcp_Smoke.pptx' },
	})
	const parsed = JSON.parse(buildRes.content[0].text)
	if (!parsed.ok) throw new Error('deck.save failed: ' + JSON.stringify(parsed.error))
	console.log('tools/call (generic deck save) OK')
	console.log('  file  :', parsed.data.filePath)
	console.log('  bytes :', parsed.data.bytes)
	console.log('  slides:', parsed.data.slideCount)

	child.stdin.end()
	child.kill()
	console.log('SMOKE: PASS')
}

main().catch(e => {
	console.error('SMOKE: FAIL', e.message)
	child.kill()
	process.exit(1)
})
