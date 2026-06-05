// pm2 ecosystem for betterpptx-mcp production.
//
// pm2 supervises BOTH processes (auto-restart on crash, memory ceiling, logs):
//   • betterpptx-mcp        — the Streamable-HTTP MCP server (server-http.mjs)
//   • betterpptx-mcp-tunnel — cloudflared (named tunnel if configured, else quick)
// One `pm2 save` + boot hook then keeps the whole service up across reboots.
//
//   pm2 start deploy/ecosystem.config.cjs && pm2 save
//
// Config is read from deploy/production.env (copy from production.env.example).

const fs = require('fs')
const path = require('path')

const DEPLOY_DIR = __dirname
const MCP_DIR = path.resolve(DEPLOY_DIR, '..')        // betterpptx-mcp/
const REPO_ROOT = path.resolve(MCP_DIR, '..')         // repo root (outputs/ resolves here)
const CLOUDFLARED = path.join(MCP_DIR, '.tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')

function loadEnv(file) {
	const env = {}
	try {
		for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
			const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
			if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
		}
	} catch (_) {}
	return env
}

const E = loadEnv(path.join(DEPLOY_DIR, 'production.env'))
const PORT = E.BETTERPPTX_PORT || '3344'

// cloudflared args: named tunnel when configured, otherwise an ephemeral quick tunnel.
const tunnelArgs = E.CLOUDFLARED_TUNNEL_NAME
	? ['tunnel', '--config', E.CLOUDFLARED_CONFIG || path.join(DEPLOY_DIR, 'cloudflared-config.yml'), 'run', E.CLOUDFLARED_TUNNEL_NAME]
	: ['tunnel', '--url', `http://127.0.0.1:${PORT}`]

const serverEnv = {
	BETTERPPTX_HOST: E.BETTERPPTX_HOST || '127.0.0.1',
	BETTERPPTX_PORT: PORT,
	BETTERPPTX_URL_SECRET: E.BETTERPPTX_URL_SECRET || '',
	BETTERPPTX_AUTH: E.BETTERPPTX_AUTH || '',
	BETTERPPTX_PUBLIC_BASE: E.BETTERPPTX_PUBLIC_BASE || '',
	BETTERPPTX_DOWNLOAD_ROOT: E.BETTERPPTX_DOWNLOAD_ROOT || path.join(REPO_ROOT, 'outputs', 'public_files'),
	BETTERPPTX_DOWNLOAD_BUDGET_MB: E.BETTERPPTX_DOWNLOAD_BUDGET_MB || '2048',
	BETTERPPTX_MAX_DECKS: E.BETTERPPTX_MAX_DECKS || '60',
	BETTERPPTX_DECK_TTL_MS: E.BETTERPPTX_DECK_TTL_MS || '1800000',
	BETTERPPTX_MAX_CONCURRENCY: E.BETTERPPTX_MAX_CONCURRENCY || '4',
	BETTERPPTX_MAX_QUEUE: E.BETTERPPTX_MAX_QUEUE || '64',
	BETTERPPTX_JSON_LIMIT: E.BETTERPPTX_JSON_LIMIT || '50mb',
	BETTERPPTX_LOG: E.BETTERPPTX_LOG || '',
	BETTERPPTX_TRACE: E.BETTERPPTX_TRACE || '',
	BETTERPPTX_LOG_DIR: E.BETTERPPTX_LOG_DIR || path.join(REPO_ROOT, 'logs', 'betterpptx-mcp'),
	BETTERPPTX_LOG_FILE: E.BETTERPPTX_LOG_FILE || '',
	BETTERPPTX_LOG_MAX_CHARS: E.BETTERPPTX_LOG_MAX_CHARS || '',
	BETTERPPTX_LOG_SECRETS: E.BETTERPPTX_LOG_SECRETS || '',
}

// Which tunnel does pm2 supervise?
//   'tailscale' / 'none' → pm2 runs ONLY the server. With Tailscale, `tailscaled`
//      owns the public Funnel and persists it across reboots itself (no pm2 app).
//   'cloudflared'        → pm2 also runs the named cloudflared tunnel.
//   'quick' (default)    → pm2 runs an ephemeral cloudflared quick tunnel.
let TUNNEL = (E.TUNNEL || '').toLowerCase()
if (!TUNNEL) TUNNEL = E.CLOUDFLARED_TUNNEL_NAME ? 'cloudflared' : 'quick'

const apps = [
	{
		name: 'betterpptx-mcp',
		script: path.join(MCP_DIR, 'http-cli.mjs'),
		cwd: REPO_ROOT,
		interpreter: 'node',
		exec_mode: 'fork',
		instances: 1,
		max_memory_restart: E.BETTERPPTX_MAX_MEMORY_RESTART || '900M',
		restart_delay: 2000,
		max_restarts: 50,
		env: serverEnv,
	},
]
if (TUNNEL === 'cloudflared' || TUNNEL === 'quick') {
	apps.push({
		name: 'betterpptx-mcp-tunnel',
		script: CLOUDFLARED,
		args: tunnelArgs,
		cwd: REPO_ROOT,
		interpreter: 'none',     // run the binary directly
		exec_mode: 'fork',
		instances: 1,
		restart_delay: 3000,
		max_restarts: 50,
	})
}

module.exports = { apps }
