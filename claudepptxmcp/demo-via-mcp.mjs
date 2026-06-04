#!/usr/bin/env node
// =============================================================================
// WIRE-ONLY DEMO — proves the showcase is buildable EXCLUSIVELY through MCP.
// =============================================================================
//
//  This script imports NOTHING from the claudepptxmcp engine, NOTHING from
//  the pptxgenjs library. The ONLY non-recipe import is showcase.mjs, which
//  itself has zero pptxgenjs/engine dependencies — it's pure data: a list
//  of `call(name, args)` invocations.
//
//  What this script DOES:
//    1. Spawn the claudepptxmcp MCP server as a separate child process,
//       talking stdio JSON-RPC (the same way Claude Desktop would).
//    2. Send `initialize`, then `tools/list` over the wire.
//    3. Run the entire showcase recipe — every single primitive call
//       (deck.new, slide.add, slide.add_text, slide.add_shape, ...) is sent
//       as an individual `tools/call` JSON-RPC request and the response is
//       read over the wire before the next call goes out.
//    4. At the end, hit `claudepptx.deck.save` to write the .pptx to disk.
//    5. Print the on-wire request count to prove the volume of MCP traffic.
//
//  If you ran a network sniffer between this process and the server, you
//  would see ~200 JSON-RPC requests/responses producing the deck. There is
//  NO in-process shortcut.
//
// =============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Only import: the transport-agnostic recipe (zero library deps).
import { buildShowcaseDeck } from './showcase.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, 'cli.mjs')

// --------------------------------------------------------------------------
//  Minimal stdio MCP client — speaks JSON-RPC framed as one message per line.
// --------------------------------------------------------------------------
function startMcpClient() {
	const child = spawn(process.execPath, [CLI_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
	const pending = new Map()
	let nextId = 1
	let rxBuf = Buffer.alloc(0)
	let totalRequests = 0
	let totalResponses = 0
	let totalBytesSent = 0
	let totalBytesReceived = 0

	child.stderr.on('data', b => {
		// Suppress library debug lines from polluting our wire log
		const s = b.toString()
		if (/^\[claudepptxmcp\]/.test(s) || /server ready/.test(s)) process.stderr.write(`[server] ${s}`)
	})
	child.stdout.on('data', chunk => {
		rxBuf = Buffer.concat([rxBuf, chunk])
		while (true) {
			const nl = rxBuf.indexOf(0x0a)
			if (nl < 0) break
			const line = rxBuf.subarray(0, nl).toString('utf8').trim()
			rxBuf = rxBuf.subarray(nl + 1)
			if (!line) continue
			try {
				const msg = JSON.parse(line)
				if (msg.id != null && pending.has(msg.id)) {
					totalResponses++
					totalBytesReceived += line.length
					const { resolve, reject } = pending.get(msg.id)
					pending.delete(msg.id)
					if (msg.error) reject(new Error(msg.error.message))
					else resolve(msg.result)
				}
			} catch (_ignore) { /* library noise leaked into stdout */ }
		}
	})

	function rpc(method, params) {
		const id = nextId++
		const body = { jsonrpc: '2.0', id, method, params }
		const line = JSON.stringify(body) + '\n'
		totalRequests++
		totalBytesSent += line.length
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject })
			child.stdin.write(line)
		})
	}

	function notify(method, params) {
		const body = { jsonrpc: '2.0', method, params }
		const line = JSON.stringify(body) + '\n'
		totalBytesSent += line.length
		child.stdin.write(line)
	}

	async function initialize() {
		const init = await rpc('initialize', {
			protocolVersion: '2024-11-05',
			clientInfo: { name: 'claudepptxmcp-wire-demo', version: '1.0.0' },
			capabilities: {},
		})
		notify('notifications/initialized', {})
		return init
	}

	async function listTools() {
		const r = await rpc('tools/list', {})
		return r.tools
	}

	// THE CRITICAL FUNCTION — every primitive call passes through here.
	async function callTool(name, args = {}) {
		const r = await rpc('tools/call', { name, arguments: args })
		// Parse the structured text content
		const text = r.content && r.content[0] && r.content[0].text
		if (!text) throw new Error(`${name}: empty response`)
		const parsed = JSON.parse(text)
		if (!parsed.ok) {
			throw new Error(`${name}: ${parsed.error && parsed.error.message}`)
		}
		return parsed.data
	}

	function stats() {
		return { totalRequests, totalResponses, totalBytesSent, totalBytesReceived }
	}

	function close() {
		child.stdin.end()
		child.kill()
	}

	return { rpc, callTool, initialize, listTools, stats, close }
}

// --------------------------------------------------------------------------
// Main: handshake → list tools → replay the entire showcase OVER THE WIRE.
// --------------------------------------------------------------------------
async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const outputDir = path.resolve(process.cwd(), 'outputs')
	const fileName = `ClaudePptxMcp_WireDemo_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  claudepptxmcp WIRE-ONLY DEMO\n')
	process.stderr.write('  Every tool call crosses the MCP stdio JSON-RPC transport.\n')
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()

	process.stderr.write('[wire] handshaking with MCP server over stdio …\n')
	const init = await mcp.initialize()
	process.stderr.write(`[wire] server: ${init.serverInfo.name} v${init.serverInfo.version}\n`)

	process.stderr.write('[wire] listing tools …\n')
	const tools = await mcp.listTools()
	process.stderr.write(`[wire] discovered ${tools.length} tools advertised by the server\n`)
	process.stderr.write(`[wire] first tools: ${tools.slice(0, 5).map(t => t.name).join(', ')}\n\n`)

	process.stderr.write('[wire] replaying showcase recipe — every call goes over the wire …\n')
	const beforeStats = mcp.stats()
	const result = await buildShowcaseDeck(mcp.callTool, { outputDir, fileName })
	const afterStats = mcp.stats()

	const ms = Date.now() - t0
	const sent = afterStats.totalRequests - beforeStats.totalRequests
	const recv = afterStats.totalResponses - beforeStats.totalResponses
	const bytesOut = afterStats.totalBytesSent - beforeStats.totalBytesSent
	const bytesIn = afterStats.totalBytesReceived - beforeStats.totalBytesReceived

	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  WIRE-ONLY DEMO COMPLETE\n')
	process.stderr.write('==========================================================\n')
	process.stderr.write(`file        : ${result.filePath}\n`)
	process.stderr.write(`bytes       : ${result.bytes}\n`)
	process.stderr.write(`slides      : ${result.slideCount}\n`)
	process.stderr.write(`valid       : ${result.validation.valid} (${result.validation.issueCount} issue(s))\n`)
	process.stderr.write(`elapsed     : ${ms} ms\n`)
	process.stderr.write('\n  --- ON-WIRE MCP TRAFFIC ---\n')
	process.stderr.write(`recipe RPCs : ${sent} tools/call requests sent\n`)
	process.stderr.write(`responses   : ${recv} tools/call responses received\n`)
	process.stderr.write(`bytes sent  : ${bytesOut.toLocaleString()} bytes over stdin\n`)
	process.stderr.write(`bytes recv  : ${bytesIn.toLocaleString()} bytes over stdout\n`)
	process.stderr.write('==========================================================\n')

	mcp.close()

	// Emit JSON receipt to stdout
	process.stdout.write(JSON.stringify({
		ok: true,
		mode: 'wire-only',
		mcpServer: init.serverInfo,
		toolsAdvertised: tools.length,
		recipeRpcCalls: sent,
		bytesOnWire: { sent: bytesOut, received: bytesIn },
		result,
	}, null, 2) + '\n')
}

main().catch(err => {
	process.stderr.write(`\n[wire] FATAL: ${err && err.stack || err}\n`)
	process.exit(1)
})
