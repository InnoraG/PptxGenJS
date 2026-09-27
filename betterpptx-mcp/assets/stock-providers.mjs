// STOCK MEDIA PROVIDERS (M21 — worlds/media expansion wave 1): Pexels + Pixabay behind
// the catalog/locked-handle doctrine. Chosen for LICENSING as much as API: both licenses
// allow commercial use without attribution. Search is public-safe (handles + author +
// license + preview URL — the API key NEVER appears in any response); resolution happens
// at embed time and every resolved asset carries a permanent license record.
//
// Handle scheme: stock://<provider>/<kind>/<id>   e.g. stock://pexels/photo/1181244
// Providers: pexels (photo, video), pixabay (photo, illustration, vector, video),
//   openverse (photo, illustration — CC0-only, NO API KEY REQUIRED: the always-on free
//   image source; an optional token only raises rate limits).
// 'test' is an internal deterministic provider for verifies (generates a tiny PNG).
import { safeFetchJson } from '../net/safe-fetch.mjs'

export class StockProviderError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'StockProviderError'
		this.code = code
		this.details = details
	}
}

const PEXELS_LICENSE = { license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/', attributionRequired: false, commercialUse: 'allowed' }
const PIXABAY_LICENSE = { license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/', attributionRequired: false, commercialUse: 'allowed' }
// GOVERNANCE: Freesound sounds carry MIXED CC licenses (incl. attribution-required CC-BY
// and non-commercial CC-BY-NC). Per the asset-licensing doctrine, search + resolve are
// HARD-FILTERED to CC0 only, so every embeddable sound is attribution-free commercial.
const FREESOUND_CC0_LICENSE = { license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attributionRequired: false, commercialUse: 'allowed' }
// GOVERNANCE: Openverse aggregates 800M+ works under MANY licenses (CC-BY, CC-BY-SA, NC…).
// Per the asset-licensing doctrine, search + resolve are HARD-FILTERED to CC0 only
// (license=cc0 on the API AND a re-check on every item), so every embeddable image is
// attribution-free commercial — identical stance to Freesound audio.
const OPENVERSE_CC0_LICENSE = { license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attributionRequired: false, commercialUse: 'allowed' }

function pexelsKey() { return String(process.env.BETTERPPTX_PEXELS_API_KEY || '').trim() }
function pixabayKey() { return String(process.env.BETTERPPTX_PIXABAY_API_KEY || '').trim() }
function freesoundKey() { return String(process.env.BETTERPPTX_FREESOUND_API_KEY || '').trim() }
// Openverse needs NO key (anonymous works, capped at page_size 20). For production throughput,
// register ONCE (outward-facing — do it yourself, then verify the email it sends):
//   curl -X POST https://api.openverse.org/v1/auth_tokens/register/ \
//     -H 'Content-Type: application/json' \
//     -d '{"name":"betterpptx","description":"deck asset sourcing","email":"you@example.com"}'
//   → returns { client_id, client_secret } (shown ONCE — store them), then set
//     BETTERPPTX_OPENVERSE_CLIENT_ID / BETTERPPTX_OPENVERSE_CLIENT_SECRET.
// Access tokens are SHORT-LIVED (~10h), so a static token would silently expire; we exchange
// the client creds for a token via grant_type=client_credentials and cache+refresh it.
const OPENVERSE_TOKEN_URL = 'https://api.openverse.org/v1/auth_tokens/token/'
function openverseClientId() { return String(process.env.BETTERPPTX_OPENVERSE_CLIENT_ID || '').trim() }
function openverseClientSecret() { return String(process.env.BETTERPPTX_OPENVERSE_CLIENT_SECRET || '').trim() }
function openverseStaticToken() { return String(process.env.BETTERPPTX_OPENVERSE_API_TOKEN || '').trim() }
function openverseHasAuth() { return Boolean(openverseStaticToken() || (openverseClientId() && openverseClientSecret())) }

let openverseTokenCache = { token: '', expiresAt: 0 }
async function openverseAccessToken(fetchJson) {
	const staticToken = openverseStaticToken()
	if (staticToken) return staticToken // caller supplied a token directly (e.g. an external refresher)
	const id = openverseClientId()
	const secret = openverseClientSecret()
	if (!id || !secret) return '' // no creds → anonymous
	const nowMs = Date.now()
	if (openverseTokenCache.token && nowMs < openverseTokenCache.expiresAt) return openverseTokenCache.token
	try {
		const res = await fetchJson(OPENVERSE_TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
		})
		const token = String(res?.access_token || '')
		if (token) {
			// Refresh 60s before the real expiry to avoid using a token mid-flight as it lapses.
			const ttlMs = Math.max(60, Number(res?.expires_in) || 0) * 1000
			openverseTokenCache = { token, expiresAt: nowMs + Math.max(0, ttlMs - 60000) }
		}
		return token
	} catch {
		return '' // any token failure → degrade to anonymous rather than break search
	}
}
async function openverseHeaders(fetchJson) {
	const headers = { 'User-Agent': 'BetterPPTX/1.0 (+https://betterpptx; stock-openverse)' }
	const token = await openverseAccessToken(fetchJson)
	if (token) headers.Authorization = `Bearer ${token}`
	return headers
}

export function stockProviderStatus() {
	return {
		pexels: { configured: Boolean(pexelsKey()), kinds: ['photo', 'video'] },
		pixabay: { configured: Boolean(pixabayKey()), kinds: ['photo', 'illustration', 'vector', 'video'] },
		freesound: { configured: Boolean(freesoundKey()), kinds: ['audio'], note: 'CC0-only (music beds / SFX)' },
		// Always configured: no key required. This is what makes stock image search work out
		// of the box with zero setup — Openverse covers photo + illustration for free.
		openverse: { configured: true, authenticated: openverseHasAuth(), kinds: ['photo', 'illustration'], note: 'CC0-only, no API key required (anonymous cap 20/page); set OPENVERSE_CLIENT_ID/SECRET to auto-mint OAuth2 tokens and lift limits' },
	}
}

export function parseStockHandle(handle) {
	const match = String(handle || '').trim().match(/^stock:\/\/(pexels|pixabay|freesound|openverse|test)\/(photo|illustration|vector|video|audio)\/([A-Za-z0-9_-]+)$/)
	if (!match) return null
	return { provider: match[1], kind: match[2], id: match[3] }
}

// Pixabay rejects per_page < 3 (HTTP 400), so 3 is the floor for every provider.
const clampPerPage = n => Math.max(3, Math.min(24, Math.round(Number(n) || 8)))

async function pexelsSearch({ query, kind, orientation, perPage, fetchJson }) {
	const key = pexelsKey()
	if (!key) return []
	const base = kind === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search'
	const url = `${base}?query=${encodeURIComponent(query)}&per_page=${perPage}${orientation ? `&orientation=${encodeURIComponent(orientation)}` : ''}`
	const json = await fetchJson(url, { headers: { Authorization: key } })
	if (kind === 'video') {
		return (json.videos || []).map(v => ({
			handle: `stock://pexels/video/${v.id}`,
			provider: 'pexels',
			kind: 'video',
			width: v.width,
			height: v.height,
			durationSeconds: v.duration,
			author: v.user?.name || 'unknown',
			previewUrl: v.image,
			sourceUrl: v.url,
			...PEXELS_LICENSE,
		}))
	}
	return (json.photos || []).map(p => ({
		handle: `stock://pexels/photo/${p.id}`,
		provider: 'pexels',
		kind: 'photo',
		width: p.width,
		height: p.height,
		author: p.photographer || 'unknown',
		previewUrl: p.src?.medium,
		sourceUrl: p.url,
		avgColor: p.avg_color,
		...PEXELS_LICENSE,
	}))
}

async function pixabaySearch({ query, kind, orientation, perPage, fetchJson }) {
	const key = pixabayKey()
	if (!key) return []
	const isVideo = kind === 'video'
	const base = isVideo ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/'
	const imageType = kind === 'illustration' ? 'illustration' : kind === 'vector' ? 'vector' : 'photo'
	const url = `${base}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&per_page=${perPage}&safesearch=true` +
		(isVideo ? '' : `&image_type=${imageType}${orientation ? `&orientation=${orientation === 'landscape' ? 'horizontal' : 'vertical'}` : ''}`)
	const json = await fetchJson(url)
	return (json.hits || []).map(hit => (isVideo ? {
		handle: `stock://pixabay/video/${hit.id}`,
		provider: 'pixabay',
		kind: 'video',
		width: hit.videos?.medium?.width,
		height: hit.videos?.medium?.height,
		durationSeconds: hit.duration,
		author: hit.user || 'unknown',
		previewUrl: hit.videos?.tiny?.thumbnail || hit.userImageURL,
		sourceUrl: hit.pageURL,
		...PIXABAY_LICENSE,
	} : {
		handle: `stock://pixabay/${imageType === 'photo' ? 'photo' : imageType}/${hit.id}`,
		provider: 'pixabay',
		kind: imageType,
		width: hit.imageWidth,
		height: hit.imageHeight,
		author: hit.user || 'unknown',
		previewUrl: hit.previewURL,
		sourceUrl: hit.pageURL,
		...PIXABAY_LICENSE,
	}))
}

async function freesoundSearch({ query, perPage, fetchJson }) {
	const key = freesoundKey()
	if (!key) return []
	const url = 'https://freesound.org/apiv2/search/text/?query=' + encodeURIComponent(query) +
		'&filter=' + encodeURIComponent('license:"Creative Commons 0"') +
		'&fields=id,name,username,license,duration,previews&page_size=' + perPage + '&token=' + encodeURIComponent(key)
	const json = await fetchJson(url)
	return (json.results || []).map(s => ({
		handle: `stock://freesound/audio/${s.id}`,
		provider: 'freesound',
		kind: 'audio',
		title: s.name,
		durationSeconds: Number(Number(s.duration || 0).toFixed(1)),
		author: s.username || 'unknown',
		previewUrl: s.previews?.['preview-lq-mp3'],
		sourceUrl: `https://freesound.org/s/${s.id}/`,
		...FREESOUND_CC0_LICENSE,
	}))
}

async function openverseSearch({ query, kind, orientation, perPage, fetchJson }) {
	// license=cc0 does the CC0 filter server-side; the per-item re-check below is defense in
	// depth. Openverse ignores unknown params, but aspect_ratio/category are validated filters.
	const category = kind === 'illustration' ? 'illustration' : ''
	const aspect = orientation === 'landscape' ? 'wide' : orientation === 'portrait' ? 'tall' : orientation === 'square' ? 'square' : ''
	// Anonymous Openverse HARD-CAPS page_size at 20 (page_size=21+ → HTTP 401). Auth lifts it.
	const pageSize = Math.min(perPage, openverseHasAuth() ? 24 : 20)
	const url = 'https://api.openverse.org/v1/images/?license=cc0&q=' + encodeURIComponent(query) +
		'&page_size=' + pageSize +
		(category ? '&category=' + category : '') +
		(aspect ? '&aspect_ratio=' + aspect : '')
	const json = await fetchJson(url, { headers: await openverseHeaders(fetchJson) })
	const resultKind = kind === 'illustration' ? 'illustration' : 'photo'
	return (json.results || [])
		.filter(r => String(r.license || '').toLowerCase() === 'cc0' && r.id && r.url)
		.map(r => ({
			handle: `stock://openverse/${resultKind}/${r.id}`,
			provider: 'openverse',
			kind: resultKind,
			width: r.width,
			height: r.height,
			author: r.creator || 'unknown',
			previewUrl: r.thumbnail,
			sourceUrl: r.foreign_landing_url,
			...OPENVERSE_CC0_LICENSE,
		}))
}

export async function searchStock({ query = '', kind = 'photo', provider = 'any', orientation = '', perPage = 8, fetchJson = safeFetchJson } = {}) {
	const q = String(query || '').trim()
	if (!q) throw new StockProviderError('STOCK_QUERY_REQUIRED', 'Provide a search query.')
	const wantKind = ['photo', 'illustration', 'vector', 'video', 'audio'].includes(kind) ? kind : 'photo'
	const per = clampPerPage(perPage)
	const status = stockProviderStatus()
	const providers = provider === 'any'
		// openverse LAST: when Pexels/Pixabay keys are set they lead on curation; with no keys
		// openverse still covers photo + illustration so image search always works.
		? ['pexels', 'pixabay', 'freesound', 'openverse'].filter(p => status[p].configured && status[p].kinds.includes(wantKind))
		: [provider].filter(p => status[p]?.configured && status[p].kinds.includes(wantKind))
	if (!providers.length) {
		throw new StockProviderError('STOCK_PROVIDER_NOT_CONFIGURED',
			'No configured stock provider covers this request. Set BETTERPPTX_PEXELS_API_KEY and/or BETTERPPTX_PIXABAY_API_KEY (free keys).',
			{ requestedProvider: provider, kind: wantKind, providers: status })
	}
	const batches = await Promise.all(providers.map(name =>
		(name === 'pexels' ? pexelsSearch : name === 'freesound' ? freesoundSearch : name === 'openverse' ? openverseSearch : pixabaySearch)({ query: q, kind: wantKind, orientation, perPage: per, fetchJson })
			.catch(err => {
				return [{ providerError: name, code: err?.code || 'STOCK_SEARCH_FAILED', message: String(err?.message || err).slice(0, 160) }]
			})))
	const results = []
	const errors = []
	for (const batch of batches) for (const item of batch) (item.providerError ? errors : results).push(item)
	return { query: q, kind: wantKind, results: results.slice(0, per * providers.length), ...(errors.length ? { providerErrors: errors } : {}) }
}

// A tiny deterministic PNG (2x2 red) so verifies exercise the full embed path offline.
const TEST_PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQgAJw4DA1U01/kAAAAASUVORK5CYII='

export async function resolveStockHandle(handle, { fetchJson = safeFetchJson } = {}) {
	const parsed = parseStockHandle(handle)
	if (!parsed) throw new StockProviderError('STOCK_HANDLE_INVALID', `Not a stock handle: ${String(handle).slice(0, 80)}`)
	const retrievedAt = new Date().toISOString()
	if (parsed.provider === 'test') {
		return { url: TEST_PNG_DATA, license: { provider: 'test', id: parsed.id, kind: parsed.kind, author: 'test', sourceUrl: 'internal://test', license: 'internal-test', attributionRequired: false, retrievedAt } }
	}
	if (parsed.provider === 'pexels') {
		const key = pexelsKey()
		if (!key) throw new StockProviderError('STOCK_PROVIDER_NOT_CONFIGURED', 'Set BETTERPPTX_PEXELS_API_KEY to resolve Pexels assets.')
		if (parsed.kind === 'video') {
			const v = await fetchJson(`https://api.pexels.com/videos/videos/${parsed.id}`, { headers: { Authorization: key } })
			const files = (v.video_files || []).filter(f => f.link).sort((a, b) => (b.width || 0) - (a.width || 0))
			const best = files.find(f => (f.width || 0) <= 1920) || files[files.length - 1]
			if (!best) throw new StockProviderError('STOCK_RESOLVE_FAILED', 'Pexels video has no downloadable file.')
			return { url: best.link, contentType: best.file_type || 'video/mp4', license: { provider: 'pexels', id: String(v.id), kind: 'video', author: v.user?.name || 'unknown', sourceUrl: v.url, ...PEXELS_LICENSE, retrievedAt } }
		}
		const p = await fetchJson(`https://api.pexels.com/v1/photos/${parsed.id}`, { headers: { Authorization: key } })
		const url = p.src?.large2x || p.src?.original || p.src?.large
		if (!url) throw new StockProviderError('STOCK_RESOLVE_FAILED', 'Pexels photo has no source URL.')
		return { url, license: { provider: 'pexels', id: String(p.id), kind: 'photo', author: p.photographer || 'unknown', sourceUrl: p.url, ...PEXELS_LICENSE, retrievedAt } }
	}
	if (parsed.provider === 'freesound') {
		const key = freesoundKey()
		if (!key) throw new StockProviderError('STOCK_PROVIDER_NOT_CONFIGURED', 'Set BETTERPPTX_FREESOUND_API_KEY to resolve Freesound audio.')
		const s = await fetchJson(`https://freesound.org/apiv2/sounds/${parsed.id}/?fields=id,name,username,license,duration,previews&token=${encodeURIComponent(key)}`)
		// CC0-only governance also enforced at RESOLVE (a handle pasted from elsewhere
		// must not smuggle an attribution/NC-licensed sound into the deck).
		if (!/publicdomain\/zero/.test(String(s.license || ''))) {
			throw new StockProviderError('STOCK_LICENSE_NOT_ALLOWED', 'Only CC0 Freesound audio can be embedded (attribution-free commercial doctrine).', { license: s.license })
		}
		const url = s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3']
		if (!url) throw new StockProviderError('STOCK_RESOLVE_FAILED', 'Freesound sound has no mp3 preview.')
		return { url, contentType: 'audio/mpeg', license: { provider: 'freesound', id: String(s.id), kind: 'audio', title: s.name, author: s.username || 'unknown', sourceUrl: `https://freesound.org/s/${s.id}/`, durationSeconds: Number(Number(s.duration || 0).toFixed(1)), ...FREESOUND_CC0_LICENSE, retrievedAt } }
	}
	if (parsed.provider === 'openverse') {
		const d = await fetchJson(`https://api.openverse.org/v1/images/${encodeURIComponent(parsed.id)}/`, { headers: await openverseHeaders(fetchJson) })
		// CC0-only governance also enforced at RESOLVE (a handle pasted from elsewhere must
		// not smuggle a non-CC0 image into the deck — mirrors the Freesound stance).
		if (String(d.license || '').toLowerCase() !== 'cc0') {
			throw new StockProviderError('STOCK_LICENSE_NOT_ALLOWED', 'Only CC0 Openverse images can be embedded (attribution-free commercial doctrine).', { license: d.license })
		}
		const url = d.url
		if (!url) throw new StockProviderError('STOCK_RESOLVE_FAILED', 'Openverse image has no source URL.')
		return { url, license: { provider: 'openverse', id: String(d.id), kind: parsed.kind, author: d.creator || 'unknown', sourceUrl: d.foreign_landing_url, ...OPENVERSE_CC0_LICENSE, retrievedAt } }
	}
	const key = pixabayKey()
	if (!key) throw new StockProviderError('STOCK_PROVIDER_NOT_CONFIGURED', 'Set BETTERPPTX_PIXABAY_API_KEY to resolve Pixabay assets.')
	const isVideo = parsed.kind === 'video'
	const json = await fetchJson(`https://pixabay.com/api/${isVideo ? 'videos/' : ''}?key=${encodeURIComponent(key)}&id=${encodeURIComponent(parsed.id)}`)
	const hit = (json.hits || [])[0]
	if (!hit) throw new StockProviderError('STOCK_RESOLVE_FAILED', `Pixabay ${parsed.kind} ${parsed.id} was not found.`)
	if (isVideo) {
		const file = hit.videos?.large?.url || hit.videos?.medium?.url || hit.videos?.small?.url
		if (!file) throw new StockProviderError('STOCK_RESOLVE_FAILED', 'Pixabay video has no downloadable file.')
		return { url: file, contentType: 'video/mp4', license: { provider: 'pixabay', id: String(hit.id), kind: 'video', author: hit.user || 'unknown', sourceUrl: hit.pageURL, ...PIXABAY_LICENSE, retrievedAt } }
	}
	const url = hit.largeImageURL || hit.fullHDURL || hit.webformatURL
	if (!url) throw new StockProviderError('STOCK_RESOLVE_FAILED', 'Pixabay image has no source URL.')
	return { url, license: { provider: 'pixabay', id: String(hit.id), kind: parsed.kind, author: hit.user || 'unknown', sourceUrl: hit.pageURL, ...PIXABAY_LICENSE, retrievedAt } }
}
