#!/usr/bin/env node
// betterpptx — fast-start HTTP entrypoint for scale-to-zero hosting.
//
// Loading the complete server (engine, tool catalog, billing, payment rails)
// takes 10-20 s in a cold container, and module loading is synchronous, so a
// single process cannot answer anything meanwhile. Claude allows 10 s for
// OAuth discovery and token requests, so this entry splits the cold start:
//
//   edge (this process): binds the port immediately and, from lightweight
//     modules only, answers /health (status "starting"), RFC 9728/8414
//     metadata, and the built-in authorization server (sign-in, token, keys).
//     Every other request is held.
//   server (forked child, BETTERPPTX_FAST_START_ROLE=server): runs the
//     unchanged server-http.mjs. When ready it adopts the edge's listening
//     socket, the edge stops accepting, and held requests are relayed to it.
//
// After the handoff every new connection is served by the full server directly
// (client addresses, rate limits, and streaming are exactly as with
// `node server-http.mjs`). Configuration is identical to server-http.mjs.
import { fork } from 'node:child_process'
import * as http from 'node:http'
import { fileURLToPath } from 'node:url'

const ROLE_ENV = 'BETTERPPTX_FAST_START_ROLE'
const startedAt = Date.now()
const argv = process.argv.slice(2)
const options = {}
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--port' && argv[i + 1]) options.port = Number(argv[++i])
	else if (argv[i] === '--host' && argv[i + 1]) options.host = argv[++i]
}
const port = options.port ?? Number(process.env.PORT || process.env.BETTERPPTX_PORT || 3344)
const host = options.host ?? (process.env.BETTERPPTX_HOST || '127.0.0.1')

function log(event, fields = {}) {
	process.stderr.write(`${JSON.stringify({ event, role: process.env[ROLE_ENV] || 'edge', msSinceStart: Date.now() - startedAt, ...fields })}\n`)
}

if (process.env[ROLE_ENV] === 'server') await runServer()
else await runEdge()

async function runServer() {
	// The edge sends its listening socket once; adopt it as soon as the full app
	// exists, plus a loopback-only listener for requests the edge held meanwhile.
	const socketHandle = new Promise(resolve => process.on('message', (message, handle) => {
		if (message?.type === 'listen-socket') resolve(handle)
	}))
	const { startBetterPptxHttp } = await import('./server-http.mjs')
	await startBetterPptxHttp({
		host,
		port,
		listen: async (httpServer, app) => {
			const handle = await socketHandle
			await new Promise(resolve => httpServer.listen(handle, resolve))
			const relay = http.createServer(app)
			relay.requestTimeout = httpServer.requestTimeout
			relay.keepAliveTimeout = httpServer.keepAliveTimeout
			relay.headersTimeout = httpServer.headersTimeout
			await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve))
			process.send({ type: 'ready', relayPort: relay.address().port })
		},
	})
	log('http.fast_start.server_ready')
}

async function runEdge() {
	if (process.env.BETTERPPTX_PUBLIC_BLACK_BOX === undefined && process.env.BETTERPPTX_BLACK_BOX === undefined) {
		process.env.BETTERPPTX_PUBLIC_BLACK_BOX = process.env.BETTERPPTX_LOCAL_MAINTAINER === '1' ? '0' : '1'
	}
	// Bind before loading anything else.
	let edgeHandler = null
	const held = []
	let relayPort = 0
	// After the handoff, requests still arriving on edge connections go to the server.
	const httpServer = http.createServer((req, res) => relayPort ? relay(req, res) : edgeHandler ? edgeHandler(req, res) : held.push([req, res]))
	httpServer.keepAliveTimeout = 5000
	await new Promise(resolve => httpServer.listen(port, host, resolve))
	log('http.fast_start.listening', { port: httpServer.address()?.port ?? port })

	const child = fork(fileURLToPath(import.meta.url), argv, { env: { ...process.env, [ROLE_ENV]: 'server' }, stdio: 'inherit' })
	child.send({ type: 'listen-socket' }, httpServer)
	log('http.fast_start.forked', { serverPid: child.pid })
	for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))

	let failed = false
	const waiting = []
	const relay = (req, res) => {
		if (failed) {
			res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '5', connection: 'close' })
			return res.end(JSON.stringify({ error: { code: 'SERVICE_STARTING_FAILED', message: 'The service failed to start. Retry shortly.' } }))
		}
		if (!relayPort) return waiting.push([req, res])
		const headers = { ...req.headers }
		const upstream = http.request({ host: '127.0.0.1', port: relayPort, method: req.method, path: req.url, headers }, response => {
			const out = { ...response.headers, connection: 'close' }
			delete out['keep-alive']
			res.writeHead(response.statusCode || 502, out)
			response.pipe(res)
		})
		upstream.on('error', () => {
			if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json', connection: 'close' })
			res.end(JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The service is restarting. Retry shortly.' } }))
		})
		req.pipe(upstream)
	}

	child.on('message', message => {
		if (message?.type !== 'ready') return
		relayPort = message.relayPort
		// The child now accepts on the shared socket; stop accepting here and let
		// clients holding edge connections reconnect after their current request.
		httpServer.close()
		httpServer.closeIdleConnections?.()
		for (const [req, res] of waiting.splice(0)) relay(req, res)
		log('http.fast_start.handoff', { relayed: true })
	})
	child.on('exit', (code, signal) => {
		failed = true
		for (const [req, res] of waiting.splice(0)) relay(req, res)
		log('http.fast_start.server_exit', { code, signal })
		setTimeout(() => process.exit(code ?? (signal ? 1 : 0)), 250).unref()
	})

	edgeHandler = await createEdgeApp(relay)
	for (const [req, res] of held.splice(0)) (relayPort ? relay : edgeHandler)(req, res)
}

async function createEdgeApp(relay) {
	const [{ default: express }, { BETTERPPTX_BRAND }, { applyCorsHeaders }, { authChallengeProfile }, oauthMetadata] = await Promise.all([
		import('express'),
		import('./branding.mjs'),
		import('./http-cors.mjs'),
		import('./auth/client-profile.mjs'),
		import('./mcp-v2/oauth-metadata.mjs'),
	])
	const publicBase = (process.env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
	// Same resolution as startBetterPptxHttp: public black-box or explicit OAuth
	// means /mcp behind verified sign-in. Private auth modes simply wait.
	const oauthMode = process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '1' || process.env.BETTERPPTX_BLACK_BOX === '1' || process.env.BETTERPPTX_AUTH === 'oauth'
	const mcpPath = '/mcp'

	// Built-in sign-in: oidc-provider loads in ~1-2 s, far ahead of the engine.
	// Its state lives in the shared store, so the server's own instance continues
	// any interaction this one started.
	const authorizationServer = process.env.BETTERPPTX_IDENTITY_PROVIDER === 'builtin'
		? import('./auth/oauth-server.mjs').then(({ createAuthorizationServer, ISSUER_PATH }) => ({
			server: createAuthorizationServer({ publicBase, logger: (event, fields) => log(event, fields) }),
			issuerPath: ISSUER_PATH,
		})).catch(error => {
			log('http.fast_start.authorization_server_failed', { name: error?.name || 'Error' })
			return { server: null, issuerPath: '' }
		})
		: Promise.resolve({ server: null, issuerPath: '' })

	const app = express()
	app.disable('x-powered-by')
	app.use((_req, res, next) => {
		res.setHeader('Connection', 'close')
		next()
	})
	// Mission Control serves only its own console; hold everything for it.
	if (process.env.BETTERPPTX_MISSION_CONTROL_ONLY === '1') {
		app.use((req, res) => relay(req, res))
		return app
	}
	app.get('/health', (_req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		res.json({ status: 'starting', ready: false, service: BETTERPPTX_BRAND })
	})
	if (oauthMode) {
		const sendProtectedResourceMetadata = resourceForm => (req, res) => {
			applyCorsHeaders(req, res)
			res.setHeader('Cache-Control', 'no-store')
			res.json(oauthMetadata.oauthProtectedResourceMetadata({
				publicBase,
				mcpPath,
				authMode: 'oauth',
				requestOrigin: publicBase || `${req.protocol}://${req.get('host') || `${host}:${port}`}`,
				resourceForm: authChallengeProfile(req) === 'openai' ? 'origin' : resourceForm,
			}))
		}
		app.get('/.well-known/oauth-protected-resource', sendProtectedResourceMetadata('origin'))
		app.get(`/.well-known/oauth-protected-resource${mcpPath}`, sendProtectedResourceMetadata('endpoint'))
	}
	// Same precedence as server-http.mjs: the built-in authorization server (and
	// its path-insertion discovery) first, then the generic metadata documents.
	app.use(async (req, res, next) => {
		const { server, issuerPath } = await authorizationServer
		if (!server) return next()
		if ([`/.well-known/oauth-authorization-server${issuerPath}`, `/.well-known/openid-configuration${issuerPath}`].includes(req.path)) return server.sendDiscovery(req, res)
		return server.router(req, res, next)
	})
	if (oauthMode) {
		app.get(oauthMetadata.oauthAuthorizationServerCompatibilityPaths(), (req, res, next) => {
			const metadata = oauthMetadata.oauthAuthorizationServerMetadata({ profile: authChallengeProfile(req) })
			if (!metadata) return next()
			applyCorsHeaders(req, res)
			res.setHeader('Cache-Control', 'no-store')
			return res.json(metadata)
		})
	}
	app.use((req, res) => relay(req, res))
	return app
}
