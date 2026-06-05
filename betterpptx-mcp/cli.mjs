#!/usr/bin/env node
// betterpptx CLI entry — starts the stdio MCP server.
import { runBetterPptxMcpStdio } from './server.mjs'

runBetterPptxMcpStdio().catch(err => {
	process.stderr.write(`[betterpptx] fatal: ${err && err.stack || err}\n`)
	process.exit(1)
})
