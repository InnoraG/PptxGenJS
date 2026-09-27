// Verify the Openverse stock provider (CC0-only, no-API-key free image source).
// Offline by default (injected fetchJson mocks — deterministic, no network). Add a LIVE
// smoke test against the real api.openverse.org with:  OPENVERSE_LIVE=1 node verify-openverse-provider.mjs
import { searchStock, resolveStockHandle, parseStockHandle, stockProviderStatus, StockProviderError } from './assets/stock-providers.mjs'

let pass = 0, fail = 0
function ok(name, cond, detail = '') { if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) } }
async function throws(name, fn, code) {
	try { await fn(); fail++; console.error(`  FAIL ${name} — expected throw ${code}`) }
	catch (err) { const got = err?.code || err?.name; ok(name, got === code, `got ${got}: ${err?.message}`) }
}

// A canned Openverse response: one clean CC0 item, one non-CC0 (must be filtered), one CC0
// but missing url (must be filtered). Detail endpoint returns cc0 for the good id, cc-by for a bad one.
const GOOD_ID = '2af107b6-d895-455c-9c9c-cd8dd934c8bf'
const NONCC0_ID = 'bb000000-0000-0000-0000-000000000000'
let lastSearchUrl = ''
function mockFetchJson(url) {
	if (url.includes('/v1/images/?')) {
		lastSearchUrl = url
		return {
			result_count: 3, page_count: 1, page_size: 8, page: 1,
			results: [
				{ id: GOOD_ID, title: 'Team whiteboard', url: 'https://live.example/good.jpg', thumbnail: 'https://live.example/good_thumb.jpg', creator: 'Jane Doe', license: 'cc0', license_version: '1.0', foreign_landing_url: 'https://example.com/photos/good', width: 1600, height: 900 },
				{ id: NONCC0_ID, title: 'Attribution one', url: 'https://live.example/bad.jpg', creator: 'Someone', license: 'cc-by', foreign_landing_url: 'https://example.com/photos/bad' },
				{ id: 'no-url-000', title: 'No URL', url: '', creator: 'Nobody', license: 'cc0', foreign_landing_url: 'https://example.com/photos/nourl' },
			],
		}
	}
	// detail endpoint: /v1/images/<id>/
	const m = url.match(/\/v1\/images\/([^/]+)\//)
	const id = m ? decodeURIComponent(m[1]) : ''
	if (id === GOOD_ID) return { id: GOOD_ID, url: 'https://live.example/good_full.jpg', creator: 'Jane Doe', license: 'cc0', foreign_landing_url: 'https://example.com/photos/good', width: 1600, height: 900 }
	if (id === NONCC0_ID) return { id: NONCC0_ID, url: 'https://live.example/bad_full.jpg', creator: 'Someone', license: 'cc-by', foreign_landing_url: 'https://example.com/photos/bad' }
	throw new StockProviderError('SAFE_FETCH_FAILED', 'HTTP 404')
}

async function offline() {
	console.log('OFFLINE (mocked fetchJson):')

	// 1) status: openverse is always configured (no key), covers photo + illustration.
	const status = stockProviderStatus()
	ok('status.openverse.configured === true', status.openverse?.configured === true)
	ok('status.openverse covers photo+illustration', ['photo', 'illustration'].every(k => status.openverse?.kinds.includes(k)))

	// 2) handle parsing (UUID ids with hyphens must parse).
	const parsed = parseStockHandle(`stock://openverse/photo/${GOOD_ID}`)
	ok('parseStockHandle openverse UUID', parsed?.provider === 'openverse' && parsed.kind === 'photo' && parsed.id === GOOD_ID)

	// 3) search: only the clean CC0 item survives the defense-in-depth filter.
	const out = await searchStock({ query: 'team whiteboard', kind: 'photo', provider: 'openverse', fetchJson: mockFetchJson })
	ok('search returns exactly 1 (non-cc0 + no-url filtered)', out.results.length === 1, `got ${out.results.length}`)
	const r = out.results[0]
	ok('search handle shape', r?.handle === `stock://openverse/photo/${GOOD_ID}`)
	ok('search license = CC0-1.0 / no attribution / commercial', r?.license === 'CC0-1.0' && r?.attributionRequired === false && r?.commercialUse === 'allowed')
	ok('search carries preview + author + sourceUrl', r?.previewUrl && r?.author === 'Jane Doe' && r?.sourceUrl === 'https://example.com/photos/good')

	// 4) illustration kind maps through (category filter path).
	const outIll = await searchStock({ query: 'flat icons', kind: 'illustration', provider: 'openverse', fetchJson: mockFetchJson })
	ok('illustration kind preserved', outIll.results[0]?.kind === 'illustration' && outIll.results[0]?.handle.includes('/illustration/'))

	// 5) resolve happy path: full-res url + permanent license record.
	const res = await resolveStockHandle(`stock://openverse/photo/${GOOD_ID}`, { fetchJson: mockFetchJson })
	ok('resolve returns full url', res?.url === 'https://live.example/good_full.jpg')
	ok('resolve license record clean', res?.license?.provider === 'openverse' && res?.license?.license === 'CC0-1.0' && res?.license?.retrievedAt)

	// 6) GOVERNANCE: a non-CC0 handle is refused at resolve (mirrors Freesound).
	await throws('resolve non-CC0 refused', () => resolveStockHandle(`stock://openverse/photo/${NONCC0_ID}`, { fetchJson: mockFetchJson }), 'STOCK_LICENSE_NOT_ALLOWED')

	// 7) with NO keys set, provider:'any' photo search still routes to openverse.
	const anyProviders = ['pexels', 'pixabay', 'freesound', 'openverse'].filter(p => status[p].configured && status[p].kinds.includes('photo'))
	ok('provider:any photo includes openverse with no keys', anyProviders.includes('openverse'))

	// 8) anonymous page_size cap: perPage 24 must be sent as page_size<=20 (else real API 401s).
	await searchStock({ query: 'anything', kind: 'photo', provider: 'openverse', perPage: 24, fetchJson: mockFetchJson })
	ok('anonymous page_size capped at 20', /[?&]page_size=20(&|$)/.test(lastSearchUrl), lastSearchUrl)
}

async function tokenFlow() {
	// Client-credentials auto-token: with creds set, the provider should exchange them for a
	// short-lived Bearer via POST /auth_tokens/token/, attach it, and lift the page_size cap.
	console.log('\nOAUTH2 (client-credentials → auto Bearer token):')
	process.env.BETTERPPTX_OPENVERSE_CLIENT_ID = 'cid_test'
	process.env.BETTERPPTX_OPENVERSE_CLIENT_SECRET = 'csecret_test'
	let tokenPost = null, searchHeaders = null, searchUrl = ''
	const mock = (url, opts = {}) => {
		if (url.includes('/auth_tokens/token/')) {
			tokenPost = { method: opts.method, body: String(opts.body || ''), ct: opts.headers?.['Content-Type'] }
			return { access_token: 'ov_test123', token_type: 'Bearer', expires_in: 36000, scope: 'read' }
		}
		if (url.includes('/v1/images/?')) {
			searchHeaders = opts.headers || {}; searchUrl = url
			return { results: [{ id: GOOD_ID, url: 'https://live.example/g.jpg', thumbnail: 't', creator: 'A', license: 'cc0', foreign_landing_url: 'u', width: 10, height: 10 }] }
		}
		throw new StockProviderError('SAFE_FETCH_FAILED', 'HTTP 404')
	}
	await searchStock({ query: 'x', kind: 'photo', provider: 'openverse', perPage: 24, fetchJson: mock })
	ok('exchanges client_credentials via POST /auth_tokens/token/', tokenPost?.method === 'POST' && /grant_type=client_credentials/.test(tokenPost.body) && /client_id=cid_test/.test(tokenPost.body) && /client_secret=csecret_test/.test(tokenPost.body), JSON.stringify(tokenPost))
	ok('token request is form-encoded', tokenPost?.ct === 'application/x-www-form-urlencoded')
	ok('search carries the minted Bearer token', searchHeaders?.Authorization === 'Bearer ov_test123', searchHeaders?.Authorization)
	ok('authenticated page_size lifts to 24', /[?&]page_size=24(&|$)/.test(searchUrl), searchUrl)
	delete process.env.BETTERPPTX_OPENVERSE_CLIENT_ID
	delete process.env.BETTERPPTX_OPENVERSE_CLIENT_SECRET
}

async function live() {
	console.log('\nLIVE (real api.openverse.org):')
	// perPage 24 exercises the anonymous page_size cap end-to-end (was HTTP 401 before the cap).
	const out = await searchStock({ query: 'mountain landscape', kind: 'photo', provider: 'openverse', perPage: 24 })
	ok('live search returned results (perPage 24, capped)', out.results.length > 0, `got ${out.results.length}`)
	ok('live results all CC0', out.results.every(r => r.license === 'CC0-1.0'))
	const handle = out.results[0]?.handle
	ok('live handle looks right', /^stock:\/\/openverse\/photo\//.test(handle || ''))
	if (handle) {
		const res = await resolveStockHandle(handle)
		ok('live resolve returns https url', /^https:\/\//.test(res?.url || ''))
		ok('live resolve license CC0', res?.license?.license === 'CC0-1.0')
		console.log(`       resolved: ${res.url}`)
	}
}

await offline()
await tokenFlow()
if (process.env.OPENVERSE_LIVE === '1') { try { await live() } catch (err) { fail++; console.error('  FAIL live — ' + (err?.message || err)) } }
else console.log('\n(skip LIVE — set OPENVERSE_LIVE=1 to hit the real API)')

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
