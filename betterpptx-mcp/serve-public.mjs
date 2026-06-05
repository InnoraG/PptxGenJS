#!/usr/bin/env node
// =============================================================================
//  betterpptx-mcp · GO PUBLIC
//  One command to expose the MCP server on the public internet over HTTPS for
//  throwaway demos and print ready-to-paste connector configs for claude.ai, chatgpt.com,
//  Claude Code, and Codex.
//
//  Pipeline:   MCP engine ──(stdio in-process)──► Streamable-HTTP server
//              (127.0.0.1:PORT)  ──► cloudflared quick tunnel ──► https://*.trycloudflare.com
//
//  Auth mode (default = path-secret, which the web "Add connector" dialogs accept):
//    --url-secret <s> | (auto-generated)   secret lives in the URL path
//    --open                                no auth at all (trusted tunnel only)
//    --token <t>                           Bearer header (Claude Code / Codex only)
//  Other flags: --port <n>  --no-tunnel (local only)  --cloudflared <path>
//
//  cloudflared quick tunnels need NO Cloudflare account, but their URLs are
//  ephemeral. For stable connectors, use the deploy kit; see GO_PUBLIC.md.
// =============================================================================

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startBetterPptxHttp } from './server-http.mjs'
import { setDownloadConfig } from './engine.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
	const o = { port: Number(process.env.BETTERPPTX_PORT || 3344), tunnel: true }
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--port' && argv[i + 1]) o.port = Number(argv[++i])
		else if (a === '--url-secret' && argv[i + 1]) o.urlSecret = argv[++i]
		else if (a === '--token' && argv[i + 1]) o.token = argv[++i]
		else if (a === '--open') o.open = true
		else if (a === '--no-tunnel') o.tunnel = false
		else if (a === '--cloudflared' && argv[i + 1]) o.cloudflared = argv[++i]
		else if (a === '--log') process.env.BETTERPPTX_LOG ||= 'debug'
		else if (a === '--log-full') process.env.BETTERPPTX_LOG = 'full'
		else if (a === '--log-dir' && argv[i + 1]) process.env.BETTERPPTX_LOG_DIR = argv[++i]
		else if (a === '--log-file' && argv[i + 1]) process.env.BETTERPPTX_LOG_FILE = argv[++i]
		else if (a === '--log-secrets') process.env.BETTERPPTX_LOG_SECRETS = '1'
		else if (a === '--help' || a === '-h') o.help = true
	}
	return o
}

function resolveCloudflared(explicit) {
	const candidates = [
		explicit,
		process.env.CLOUDFLARED,
		path.join(__dirname, '.tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'),
		'cloudflared',
	].filter(Boolean)
	for (const c of candidates) {
		if (c === 'cloudflared') return c // rely on PATH
		try { if (fs.existsSync(c)) return c } catch (_) {}
	}
	return 'cloudflared'
}

const INSTALL_HELP = `
cloudflared was not found. Install it (no account needed for quick tunnels):
  • Windows : winget install --id Cloudflare.cloudflared
              (or download cloudflared-windows-amd64.exe from
               https://github.com/cloudflare/cloudflared/releases/latest and
               drop it at betterpptx-mcp/.tools/cloudflared.exe)
  • macOS   : brew install cloudflared
  • Linux   : see https://pkg.cloudflare.com/  (apt/yum) or the GitHub release
Then re-run, or pass --cloudflared <path>, or run --no-tunnel and use your own
HTTPS reverse proxy / named tunnel.
`

function connectorBlock(publicMcpUrl, info) {
	const codexHome = process.platform === 'win32' ? '%USERPROFILE%\\.codex\\config.toml' : '~/.codex/config.toml'
	const authNote = info.authMode === 'bearer'
		? 'Bearer header — NOT usable from the claude.ai / chatgpt.com web dialogs.'
		: info.authMode === 'path' ? 'the secret is in the URL path; no header needed.'
		: 'open (no auth); no header needed.'
	return `
==========================================================================
  ✅  PUBLIC ENDPOINT IS LIVE
==========================================================================
  MCP URL :  ${publicMcpUrl}
  auth    :  ${info.authMode}  (${authNote})
  tools   :  43 advertised (full betterpptx-mcp surface)
  files   :  every deck.save returns a public downloadUrl (served at /files/...)
             so ChatGPT / claude.ai users can click to download the .pptx.

--------------------------------------------------------------------------
  1) claude.ai   (Pro / Max / Team / Enterprise)
--------------------------------------------------------------------------
  Settings → Connectors → "Add custom connector"
    Name : betterpptx-mcp
    URL  : ${publicMcpUrl}
  Save → toggle it on in the composer's tools/🔌 menu → start a chat:
    "Open my deck and add a morph magic-move between slides 3 and 4."

--------------------------------------------------------------------------
  2) chatgpt.com   (Plus / Pro / Business / Enterprise / Edu)
--------------------------------------------------------------------------
  Settings → Connectors → Advanced → enable **Developer mode** (one-time).
  Settings → Connectors → "Create" / "Add" custom connector (MCP):
    Name      : betterpptx-mcp
    MCP URL   : ${publicMcpUrl}
    Auth      : ${info.authMode === 'none' || info.authMode === 'path' ? 'No authentication' : 'see GO_PUBLIC.md (OAuth/Bearer)'}
  In a chat, open "Developer mode / +" and enable betterpptx-mcp.
  (Developer mode is required because this server exposes WRITE tools, not just
   the search/fetch pair used by read-only ChatGPT connectors.)

--------------------------------------------------------------------------
  3) Claude Code   (CLI — header-capable, can also use Bearer)
--------------------------------------------------------------------------
  claude mcp add --transport http betterpptx-mcp ${publicMcpUrl}${info.authMode === 'bearer' ? `  --header "Authorization: Bearer ${info.token}"` : ''}

--------------------------------------------------------------------------
  4) Codex CLI / IDE   (${codexHome})
--------------------------------------------------------------------------
  Codex speaks stdio MCP, so bridge to this remote URL with mcp-remote:
    [mcp_servers.betterpptx-mcp]
    command = "npx"
    args = ["-y", "mcp-remote", "${publicMcpUrl}"${info.authMode === 'bearer' ? `, "--header", "Authorization: Bearer ${info.token}"` : ''}]
==========================================================================
`
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help) {
		process.stdout.write('Usage: node betterpptx-mcp/serve-public.mjs [--port N] [--url-secret S | --open | --token T] [--no-tunnel] [--cloudflared PATH] [--log | --log-full]\n')
		process.exit(0)
	}

	// Default to path-secret (web-friendly AND protected) unless told otherwise.
	if (!args.open && !args.token && !args.urlSecret) args.urlSecret = randomBytes(18).toString('base64url')

	const server = await startBetterPptxHttp({ host: '127.0.0.1', port: args.port, open: args.open, token: args.token, urlSecret: args.urlSecret })
	const localMcp = `http://127.0.0.1:${server.port}${server.mcpPath}`
	const info = { authMode: server.authMode, token: server.token }

	if (!args.tunnel) {
		process.stderr.write(connectorBlock(localMcp + '   (local only — put your own HTTPS in front)', info))
		return
	}

	const bin = resolveCloudflared(args.cloudflared)
	const cf = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${server.port}`], { stdio: ['ignore', 'pipe', 'pipe'] })
	let printed = false
	const onData = buf => {
		const s = buf.toString()
		process.stderr.write(s.split('\n').map(l => l ? `[cloudflared] ${l}` : l).join('\n'))
		const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
		if (m && !printed) {
			printed = true
			const publicBase = m[0].replace(/\/$/, '')
			// Now that we know the public origin, saved decks get absolute download URLs.
			setDownloadConfig({ base: publicBase })
			const publicMcp = publicBase + server.mcpPath
			process.stderr.write(connectorBlock(publicMcp, info))
		}
	}
	cf.stdout.on('data', onData)
	cf.stderr.on('data', onData)
	cf.on('error', e => {
		if (e.code === 'ENOENT') { process.stderr.write(INSTALL_HELP); process.stderr.write(connectorBlock(localMcp + '   (tunnel unavailable — local URL shown)', info)) }
		else process.stderr.write(`[cloudflared] error: ${e.message}\n`)
	})
	const shutdown = () => { try { cf.kill() } catch (_) {}; try { server.httpServer.close() } catch (_) {}; process.exit(0) }
	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)
}

main().catch(e => { process.stderr.write(`[serve-public] fatal: ${e?.stack || e}\n`); process.exit(1) })
