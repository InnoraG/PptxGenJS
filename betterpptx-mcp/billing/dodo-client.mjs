export class DodoClientError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'DodoClientError'
		this.code = code
		this.details = details
	}
}

export function dodoApiToken() {
	return process.env.DODO_PAYMENTS_API_KEY || process.env.BETTERPPTX_DODO_API_KEY || ''
}

export function dodoApiBase() {
	const configured = String(process.env.BETTERPPTX_DODO_API_BASE || '').trim().replace(/\/+$/, '')
	if (configured) return configured
	const environment = String(process.env.BETTERPPTX_DODO_ENVIRONMENT || '').toLowerCase()
	if (environment === 'test') return 'https://test.dodopayments.com'
	if (environment === 'live') return 'https://live.dodopayments.com'
	return 'https://api.dodopayments.com'
}

async function parseResponse(response) {
	const raw = await response.text()
	try { return raw ? JSON.parse(raw) : null } catch { return { raw } }
}

export async function dodoFetchJson(pathname, { method = 'GET', body = null, apiKey = dodoApiToken(), apiBase = dodoApiBase(), fetchImpl = fetch } = {}) {
	if (!apiKey) throw new DodoClientError('DODO_API_TOKEN_MISSING', 'Dodo API token is not configured.')
	const response = await fetchImpl(`${apiBase}${pathname}`, {
		method,
		headers: {
			Accept: 'application/json',
			...(body ? { 'Content-Type': 'application/json' } : {}),
			Authorization: `Bearer ${apiKey}`,
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	})
	const data = await parseResponse(response)
	if (!response.ok) {
		throw new DodoClientError('DODO_API_HTTP_ERROR', `Dodo API returned HTTP ${response.status}.`, {
			status: response.status,
			data,
		})
	}
	return { ok: true, status: response.status, data }
}

export async function ingestDodoUsageEvents(events = [], options = {}) {
	const batch = Array.isArray(events) ? events : []
	if (!batch.length) return { ok: true, ingestedCount: 0, data: null }
	if (batch.length > 1000) {
		throw new DodoClientError('DODO_USAGE_BATCH_TOO_LARGE', 'Dodo usage event batch exceeds the 1000 event limit.', {
			count: batch.length,
		})
	}
	const response = await dodoFetchJson('/events/ingest', {
		...options,
		method: 'POST',
		body: { events: batch },
	})
	const ingestedCount = Number(response.data?.ingested_count ?? response.data?.ingestedCount ?? batch.length)
	return { ...response, ingestedCount }
}

