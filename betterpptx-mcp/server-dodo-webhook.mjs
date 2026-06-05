// Public Dodo webhook receiver for BetterPPTX billing reconciliation.
// This service intentionally exposes no MCP tools, downloads, logs, or runtime internals.

import express from 'express'

import { handleDodoWebhookHttp } from './billing/webhooks.mjs'

const DEFAULT_PORT = Number(process.env.PORT || process.env.BETTERPPTX_PORT || 8080)
const DEFAULT_HOST = process.env.BETTERPPTX_HOST || '0.0.0.0'
const JSON_LIMIT = process.env.BETTERPPTX_WEBHOOK_JSON_LIMIT || '2mb'
const RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.BETTERPPTX_WEBHOOK_RATE_LIMIT_WINDOW_MS || 60_000))
const RATE_LIMIT_MAX = Math.max(1, Number(process.env.BETTERPPTX_WEBHOOK_RATE_LIMIT_MAX || 120))

const buckets = new Map()

function clientKey(req) {
	const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
	return forwarded || req.socket?.remoteAddress || 'unknown'
}

function rateLimitWebhook(req, res, next) {
	const now = Date.now()
	const key = clientKey(req)
	const bucket = buckets.get(key) || { resetAt: now + RATE_LIMIT_WINDOW_MS, count: 0 }
	if (bucket.resetAt <= now) {
		bucket.resetAt = now + RATE_LIMIT_WINDOW_MS
		bucket.count = 0
	}
	bucket.count += 1
	buckets.set(key, bucket)
	if (bucket.count > RATE_LIMIT_MAX) {
		res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
		return res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Retry later.' } })
	}
	if (buckets.size > 5000) {
		for (const [itemKey, item] of buckets.entries()) {
			if (item.resetAt <= now) buckets.delete(itemKey)
		}
	}
	return next()
}

export function createDodoWebhookApp() {
	const app = express()
	app.disable('x-powered-by')

	app.get('/health', (_req, res) => {
		res.status(200).json({ status: 'ok', service: 'BetterPPTX Dodo webhook' })
	})

	app.post('/webhooks/dodo', rateLimitWebhook, express.raw({
		type: 'application/json',
		limit: JSON_LIMIT,
	}), handleDodoWebhookHttp)

	app.use((_req, res) => {
		res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found.' } })
	})

	app.use((err, _req, res, _next) => {
		if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
			return res.status(413).json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' } })
		}
		return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Request rejected.' } })
	})

	return app
}

export async function startDodoWebhookHttp(options = {}) {
	const host = options.host || DEFAULT_HOST
	const port = Number(options.port || DEFAULT_PORT)
	const app = createDodoWebhookApp()
	const server = await new Promise(resolve => {
		const httpServer = app.listen(port, host, () => resolve(httpServer))
	})
	console.log(`BetterPPTX Dodo webhook receiver listening on ${host}:${port}`)
	return { app, server, host, port }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
	startDodoWebhookHttp().catch(error => {
		console.error('BetterPPTX Dodo webhook receiver failed to start.')
		if (process.env.BETTERPPTX_DEBUG_WEBHOOK_ERRORS === '1') console.error(error)
		process.exit(1)
	})
}
