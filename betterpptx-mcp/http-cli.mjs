#!/usr/bin/env node
// betterpptx HTTP entry that starts the Streamable HTTP server.
// Calls the starter EXPLICITLY (does not rely on server-http's argv[1] self-start
// guard) so it works under process managers like pm2 whose fork wrapper rewrites
// process.argv[1]. Reads all config from env / CLI flags.
import { loadSelfHostedIdentityConfiguration } from './auth/identity-config.mjs'

loadSelfHostedIdentityConfiguration()
const { startBetterPptxHttp } = await import('./server-http.mjs')

const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--port' && argv[i + 1]) { opt.port = Number(argv[++i]); continue }
	if (argv[i] === '--host' && argv[i + 1]) { opt.host = argv[++i]; continue }
	if (argv[i] === '--token' && argv[i + 1]) { opt.token = argv[++i]; continue }
	if (argv[i] === '--url-secret' && argv[i + 1]) { opt.urlSecret = argv[++i]; continue }
	if (argv[i] === '--open') { opt.open = true; continue }
	if (argv[i] === '--log') { process.env.BETTERPPTX_LOG ||= 'debug'; continue }
	if (argv[i] === '--log-full') { process.env.BETTERPPTX_LOG = 'full'; continue }
	if (argv[i] === '--log-dir' && argv[i + 1]) { process.env.BETTERPPTX_LOG_DIR = argv[++i]; continue }
	if (argv[i] === '--log-file' && argv[i + 1]) { process.env.BETTERPPTX_LOG_FILE = argv[++i]; continue }
	if (argv[i] === '--log-secrets') { process.env.BETTERPPTX_LOG_SECRETS = '1'; continue }
}
startBetterPptxHttp(opt).catch(err => {
	process.stderr.write(`[betterpptx:http] fatal: ${err?.stack || err}\n`)
	process.exit(1)
})
