#!/usr/bin/env node
// Local self-test: drives claudepptxmcp tools to build a generic deck.
// Runs the tool layer (not the MCP transport) — exactly what an MCP host
// would call over stdio, just with the network/transport short-circuited.

import * as path from 'node:path'
import { callClaudePptxTool } from './engine.mjs'
import { TOOLS } from './tools.mjs'

async function call(name, args) {
	const res = await callClaudePptxTool(name, args)
	if (!res.ok) {
		const e = new Error(`${name} failed: ${res.error && res.error.message}`)
		if (res.error && res.error.stack) e.stack = res.error.stack
		throw e
	}
	return res.data
}

async function main() {
	const startedAt = Date.now()
	process.stderr.write(`[claudepptxmcp] starting demo-runner with ${TOOLS.length} tools available\n`)

	// Print the tool catalog (proves discovery is real)
	const caps = await call('claudepptx.help.capabilities', {})
	process.stderr.write(`[claudepptxmcp] brand=${caps.brand}, selfContained=${caps.selfContained}\n`)

	// Build a small generic deck through the same tool surface.
	const outputDir = path.resolve(process.cwd(), 'outputs')
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const deck = await call('claudepptx.deck.new', { title: 'claudepptxmcp Demo' })
	await call('claudepptx.slide.add', { deckId: deck.deckId, background: { color: '0B1020' }, transition: { type: 'fade' } })
	await call('claudepptx.slide.add_text', {
		deckId: deck.deckId,
		slideIndex: 0,
		text: 'claudepptxmcp',
		options: { x: 1.1, y: 1.1, w: 8.5, h: 0.8, fontSize: 38, bold: true, color: 'FFFFFF', margin: 0 },
	})
	await call('claudepptx.slide.add_text', {
		deckId: deck.deckId,
		slideIndex: 0,
		text: 'Self-contained PPTX generation over MCP',
		options: { x: 1.12, y: 2.05, w: 8.8, h: 0.36, fontSize: 16, color: '9FB2C3', margin: 0 },
	})
	const result = await call('claudepptx.deck.save', { deckId: deck.deckId, outputDir, fileName: `ClaudePptxMcp_Demo_${stamp}.pptx` })

	const ms = Date.now() - startedAt
	process.stderr.write('\n----------------------------------\n')
	process.stderr.write('[claudepptxmcp] generic deck built\n')
	process.stderr.write('----------------------------------\n')
	process.stderr.write(`file:     ${result.filePath}\n`)
	process.stderr.write(`bytes:    ${result.bytes}\n`)
	process.stderr.write(`slides:   ${result.slideCount}\n`)
	process.stderr.write(`elapsed:  ${ms} ms\n`)
	process.stderr.write('----------------------------------\n')
	// Emit JSON to stdout for tooling
	process.stdout.write(JSON.stringify({ ok: true, result }, null, 2) + '\n')
}

main().catch(err => {
	process.stderr.write(`[claudepptxmcp] FAILED: ${err && err.stack || err}\n`)
	process.exit(1)
})
