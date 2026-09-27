#!/usr/bin/env node
// betterpptx CLI entry — starts the stdio MCP server.
import fs from 'node:fs'

// Dev-only research unlock for the local authoring-excellence lab. If the marker
// file betterpptx-mcp/.research-unlock exists, force the premium plan so full-capability
// research (premium on every slide) is possible over the live MCP. Toggle by
// creating/removing the file and restarting the server. The file is gitignored and is
// never present in production; this only reuses the engine's existing FORCE_PLAN switch.
try {
	if (fs.existsSync(new URL('./.research-unlock', import.meta.url))) {
		process.env.BETTERPPTX_FORCE_PLAN = 'premium'
		// Research lab runs on a real-PowerPoint Windows host: enable local maintainer mode so
		// deck.preview can render through desktop PowerPoint (renderer:"powerpoint") — the only
		// preview this lab uses. (Black-box stays off so previews return their file path.)
		process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
		process.env.BETTERPPTX_PREVIEW_RENDERER = 'powerpoint'
		process.stderr.write('[betterpptx] research-unlock active: full-capability (FORCE_PLAN=premium, LOCAL_MAINTAINER=1, preview=powerpoint)\n')
	}
} catch { /* marker check is best-effort */ }

const { runBetterPptxMcpStdio } = await import('./server.mjs')

runBetterPptxMcpStdio().catch(err => {
	process.stderr.write(`[betterpptx] fatal: ${err && err.stack || err}\n`)
	process.exit(1)
})
