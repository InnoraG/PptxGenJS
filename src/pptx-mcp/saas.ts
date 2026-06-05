import * as fs from 'fs'
import * as http from 'http'
import { URL } from 'url'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { createBetterPptxMcpMcpServer } from './index.js'
import {
	BETTERPPTX_MCP_BRAND,
	BetterPptxMcpRuntimeOptions,
	artifactFilePath,
	callBetterPptxMcpTool,
	getWorkspaceRoot,
	listJobManifest,
} from './engine.js'

interface SaasOptions extends BetterPptxMcpRuntimeOptions {
	host?: string
	port?: number
}

const DEFAULT_MAX_BODY = 50 * 1024 * 1024

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
	const json = JSON.stringify(body, null, 2)
	res.writeHead(status, {
		'content-type': 'application/json',
		'content-length': Buffer.byteLength(json),
		'x-betterpptx-mcp-brand': BETTERPPTX_MCP_BRAND,
	})
	res.end(json)
}

function unauthorized(res: http.ServerResponse): void {
	sendJson(res, 401, { brand: BETTERPPTX_MCP_BRAND, success: false, code: 'UNAUTHORIZED', message: 'Invalid or missing API key' })
}

function isAuthorized(req: http.IncomingMessage, options: SaasOptions): boolean {
	if (!options.apiKey) return true
	const auth = req.headers.authorization || ''
	const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
	const headerKey = Array.isArray(req.headers['x-api-key']) ? req.headers['x-api-key'][0] : req.headers['x-api-key']
	return bearer === options.apiKey || headerKey === options.apiKey
}

function readBody(req: http.IncomingMessage, maxBytes = DEFAULT_MAX_BODY): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let size = 0
		let body = ''
		req.setEncoding('utf8')
		req.on('data', chunk => {
			size += Buffer.byteLength(chunk)
			if (size > maxBytes) {
				reject(new Error('Request body exceeds upload limit'))
				req.destroy()
				return
			}
			body += chunk
		})
		req.on('end', () => {
			if (!body.trim()) {
				resolve(undefined)
				return
			}
			try {
				resolve(JSON.parse(body))
			} catch (error) {
				reject(error)
			}
		})
		req.on('error', reject)
	})
}

async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse, options: SaasOptions, parsedBody?: unknown): Promise<void> {
	const server = createBetterPptxMcpMcpServer({ ...options, exposeLocalPaths: false })
	const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
	await server.connect(transport)
	await transport.handleRequest(req, res, parsedBody)
}

export async function startBetterPptxMcpSaasServer(options: SaasOptions = {}): Promise<http.Server> {
	const host = options.host || '127.0.0.1'
	const port = options.port || 3333
	getWorkspaceRoot(options)

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)
			if (url.pathname === '/health') {
				sendJson(res, 200, { brand: BETTERPPTX_MCP_BRAND, status: 'ok' })
				return
			}
			if (!isAuthorized(req, options)) {
				unauthorized(res)
				return
			}
			if (url.pathname === '/mcp') {
				const parsedBody = req.method === 'POST'
					? await readBody(req, options.maxUploadBytes || DEFAULT_MAX_BODY)
					: undefined
				await handleMcp(req, res, options, parsedBody)
				return
			}
			if (url.pathname === '/v1/tools/call' && req.method === 'POST') {
				const body = await readBody(req, options.maxUploadBytes || DEFAULT_MAX_BODY) as any
				const result = await callBetterPptxMcpTool(body?.name, body?.arguments || {}, { ...options, exposeLocalPaths: false })
				sendJson(res, result?.isError ? 400 : 200, result)
				return
			}
			const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/)
			if (jobMatch && req.method === 'GET') {
				const manifest = listJobManifest(jobMatch[1], options)
				if (!manifest) {
					sendJson(res, 404, { brand: BETTERPPTX_MCP_BRAND, success: false, code: 'NOT_FOUND', message: 'Job not found' })
					return
				}
				sendJson(res, 200, manifest)
				return
			}
			const artifactMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)$/)
			if (artifactMatch && req.method === 'GET') {
				const artifactPath = artifactFilePath(artifactMatch[1], options)
				if (!artifactPath) {
					sendJson(res, 404, { brand: BETTERPPTX_MCP_BRAND, success: false, code: 'NOT_FOUND', message: 'Artifact not found' })
					return
				}
				res.writeHead(200, {
					'content-type': 'application/octet-stream',
					'content-length': fs.statSync(artifactPath).size,
					'x-betterpptx-mcp-brand': BETTERPPTX_MCP_BRAND,
				})
				fs.createReadStream(artifactPath).pipe(res)
				return
			}
			sendJson(res, 404, { brand: BETTERPPTX_MCP_BRAND, success: false, code: 'NOT_FOUND', message: 'Route not found' })
		} catch (error) {
			sendJson(res, 500, {
				brand: BETTERPPTX_MCP_BRAND,
				success: false,
				code: 'INTERNAL_ERROR',
				message: error instanceof Error ? error.message : String(error),
			})
		}
	})

	await new Promise<void>(resolve => server.listen(port, host, resolve))
	process.stderr.write(`${BETTERPPTX_MCP_BRAND} SaaS listening on http://${host}:${port}\n`)
	return server
}

