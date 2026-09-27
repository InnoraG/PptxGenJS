import * as dns from 'node:dns/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import * as net from 'node:net'

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_MAX_REDIRECTS = 5

const BLOCKED_HOSTS = new Set([
	'metadata',
	'metadata.google.internal',
	'169.254.169.254',
])

export class SafeFetchError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'SafeFetchError'
		this.code = code
		this.details = details
	}
}

function fail(code, message, details = {}) {
	throw new SafeFetchError(code, message, details)
}

function abortFailure() {
	return new SafeFetchError('SAFE_FETCH_ABORTED', 'Server-side fetch was aborted.')
}

function normalizeUrl(raw) {
	let url
	try { url = new URL(String(raw || '').trim()) }
	catch { fail('SAFE_FETCH_REFUSED', 'URL is not valid.') }
	if (!['http:', 'https:'].includes(url.protocol)) {
		fail('SAFE_FETCH_REFUSED', 'Only http and https URLs are allowed.')
	}
	if (url.username || url.password) {
		fail('SAFE_FETCH_REFUSED', 'URLs with embedded credentials are not allowed.')
	}
	if (!url.hostname) fail('SAFE_FETCH_REFUSED', 'URL host is required.')
	return url
}

function ipv4Bytes(ip) {
	const parts = String(ip || '').split('.')
	if (parts.length !== 4) return null
	const nums = parts.map(part => Number(part))
	if (!nums.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) return null
	return nums
}

function isBlockedIPv4(ip) {
	const b = ipv4Bytes(ip)
	if (!b) return true
	const [a, c] = b
	if (a === 0) return true
	if (a === 10) return true
	if (a === 127) return true
	if (a === 169 && c === 254) return true
	if (a === 172 && c >= 16 && c <= 31) return true
	if (a === 192 && c === 168) return true
	if (a === 100 && c >= 64 && c <= 127) return true
	if (a === 192 && c === 0) return true
	if (a === 192 && c === 0 && b[2] === 2) return true
	if (a === 198 && (c === 18 || c === 19)) return true
	if (a === 198 && c === 51 && b[2] === 100) return true
	if (a === 203 && c === 0 && b[2] === 113) return true
	if (a >= 224) return true
	return false
}

function expandIpv6(input) {
	let value = String(input || '').toLowerCase()
	const zone = value.indexOf('%')
	if (zone >= 0) value = value.slice(0, zone)

	if (value.includes('.')) {
		const lastColon = value.lastIndexOf(':')
		const v4 = value.slice(lastColon + 1)
		const b = ipv4Bytes(v4)
		if (!b) return null
		const hi = ((b[0] << 8) | b[1]).toString(16)
		const lo = ((b[2] << 8) | b[3]).toString(16)
		value = `${value.slice(0, lastColon)}:${hi}:${lo}`
	}

	const parts = value.split('::')
	if (parts.length > 2) return null
	const left = parts[0] ? parts[0].split(':').filter(Boolean) : []
	const right = parts.length === 2 && parts[1] ? parts[1].split(':').filter(Boolean) : []
	if (parts.length === 1 && left.length !== 8) return null
	const fill = parts.length === 2 ? new Array(8 - left.length - right.length).fill('0') : []
	const groups = [...left, ...fill, ...right]
	if (groups.length !== 8) return null
	const nums = groups.map(group => Number.parseInt(group || '0', 16))
	if (!nums.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffff)) return null
	return nums
}

function isBlockedIPv6(ip) {
	const groups = expandIpv6(ip)
	if (!groups) return true
	const first = groups[0]
	const allZeroButLast = groups.slice(0, 7).every(n => n === 0)
	if (groups.every(n => n === 0)) return true
	if (allZeroButLast && groups[7] === 1) return true
	if ((first & 0xfe00) === 0xfc00) return true // fc00::/7
	if ((first & 0xffc0) === 0xfe80) return true // fe80::/10
	if ((first & 0xff00) === 0xff00) return true // multicast
	if (groups.slice(0, 5).every(n => n === 0) && groups[5] === 0xffff) {
		const a = groups[6] >> 8
		const b = groups[6] & 0xff
		const c = groups[7] >> 8
		const d = groups[7] & 0xff
		return isBlockedIPv4(`${a}.${b}.${c}.${d}`)
	}
	return false
}

function isBlockedAddress(address) {
	const family = net.isIP(address)
	if (family === 4) return isBlockedIPv4(address)
	if (family === 6) return isBlockedIPv6(address)
	return true
}

function assertHostAllowed(hostname) {
	const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
	if (BLOCKED_HOSTS.has(host)) fail('SAFE_FETCH_REFUSED', 'This host is not available for server-side fetching.')
	if (host.endsWith('.metadata.google.internal')) fail('SAFE_FETCH_REFUSED', 'Metadata hosts are not available for server-side fetching.')
}

async function resolveSafeAddress(url) {
	assertHostAllowed(url.hostname)
	const numericFamily = net.isIP(url.hostname)
	const records = numericFamily
		? [{ address: url.hostname, family: numericFamily }]
		: await dns.lookup(url.hostname, { all: true, verbatim: true })
	if (!records.length) fail('SAFE_FETCH_REFUSED', 'URL host did not resolve.')
	const blocked = records.filter(record => isBlockedAddress(record.address))
	if (blocked.length) {
		fail('SAFE_FETCH_REFUSED', 'URL resolved to a private or reserved network address.')
	}
	return records[0]
}

function cleanRequestHeaders(headers = {}, url) {
	const out = {}
	for (const [key, value] of Object.entries(headers || {})) {
		if (/^host$/i.test(key)) continue
		if (/^connection$/i.test(key)) continue
		if (/^proxy-/i.test(key)) continue
		if (value == null) continue
		out[key] = Array.isArray(value) ? value.map(String) : String(value)
	}
	out.Host = url.host
	return out
}

function responseHeaders(res) {
	const headers = {}
	for (const [key, value] of Object.entries(res.headers || {})) {
		headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
	}
	return headers
}

function requestOnce(url, { method, headers, body, timeoutMs, maxBytes, requireImage, signal } = {}) {
	return new Promise(async (resolve, reject) => {
		if (signal?.aborted) { reject(abortFailure()); return }
		let record
		try { record = await resolveSafeAddress(url) }
		catch (err) { reject(err); return }
		if (signal?.aborted) { reject(abortFailure()); return }

		const transport = url.protocol === 'https:' ? https : http
		const options = {
			protocol: url.protocol,
			hostname: record.address,
			port: url.port || (url.protocol === 'https:' ? 443 : 80),
			path: `${url.pathname}${url.search}`,
			method,
			headers: cleanRequestHeaders(headers, url),
			timeout: timeoutMs,
			servername: url.hostname,
			family: record.family,
			lookup: (_hostname, _options, cb) => cb(null, record.address, record.family),
		}

		const req = transport.request(options, res => {
			if (signal?.aborted) { req.destroy(abortFailure()); return }
			const headersOut = responseHeaders(res)
			const contentLength = Number(headersOut['content-length'] || 0)
			if (contentLength > maxBytes) {
				req.destroy(new SafeFetchError('SAFE_FETCH_TOO_LARGE', 'Response is larger than the allowed byte limit.'))
				return
			}
			if (requireImage && !String(headersOut['content-type'] || '').toLowerCase().startsWith('image/')) {
				req.destroy(new SafeFetchError('SAFE_FETCH_INVALID_CONTENT_TYPE', 'Remote image fetch returned a non-image content type.'))
				return
			}
			const chunks = []
			let total = 0
			res.on('data', chunk => {
				total += chunk.length
				if (total > maxBytes) {
					req.destroy(new SafeFetchError('SAFE_FETCH_TOO_LARGE', 'Response is larger than the allowed byte limit.'))
					return
				}
				chunks.push(chunk)
			})
			res.on('end', () => {
				cleanup()
				resolve({
					status: res.statusCode || 0,
					statusText: res.statusMessage || '',
					ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
					headers: headersOut,
					buffer: Buffer.concat(chunks),
					url: url.href,
					location: headersOut.location || '',
				})
			})
		})
		const onAbort = () => req.destroy(abortFailure())
		const cleanup = () => signal?.removeEventListener('abort', onAbort)
		if (signal) signal.addEventListener('abort', onAbort, { once: true })
		req.on('timeout', () => req.destroy(new SafeFetchError('SAFE_FETCH_TIMEOUT', 'Server-side fetch timed out.')))
		req.on('error', error => { cleanup(); reject(error) })
		if (signal?.aborted) { req.destroy(abortFailure()); return }
		if (body !== undefined && body !== null) req.write(body)
		req.end()
	})
}

export async function safeFetchToBuffer(rawUrl, options = {}) {
	let url = normalizeUrl(rawUrl)
	const method = String(options.method || 'GET').toUpperCase()
	const maxRedirects = Number(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)
	const timeoutMs = Math.max(1, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS))
	const maxBytes = Math.max(1, Number(options.maxBytes || DEFAULT_MAX_BYTES))
	const requireImage = !!options.requireImage
	const headers = options.headers || {}
	const body = options.body
	const signal = options.signal

	for (let redirects = 0; redirects <= maxRedirects; redirects++) {
		const res = await requestOnce(url, { method, headers, body, timeoutMs, maxBytes, requireImage, signal })
		if (![301, 302, 303, 307, 308].includes(res.status) || !res.location) return res
		if (redirects === maxRedirects) fail('SAFE_FETCH_REFUSED', 'Too many redirects.')
		url = normalizeUrl(new URL(res.location, url).href)
	}
	fail('SAFE_FETCH_REFUSED', 'Too many redirects.')
}

export async function safeFetchJson(rawUrl, options = {}) {
	const res = await safeFetchToBuffer(rawUrl, {
		...options,
		headers: {
			Accept: 'application/json',
			...(options.headers || {}),
		},
	})
	if (!res.ok) throw new SafeFetchError('SAFE_FETCH_FAILED', `HTTP ${res.status}`, { status: res.status, statusText: res.statusText })
	try { return JSON.parse(res.buffer.toString('utf8')) }
	catch { throw new SafeFetchError('SAFE_FETCH_FAILED', 'Response was not valid JSON.', { status: res.status, contentType: res.headers?.['content-type'] || '' }) }
}
