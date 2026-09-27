import { isIP } from 'node:net'
import { isProductionBillingEnvironment } from '../billing/security-policy.mjs'

function boundedNumber(raw, fallback, min, max) {
	if (raw === undefined || raw === '') return fallback
	const value = Number(raw)
	return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

export function httpRateLimitConfig(env = process.env) {
	const publicDefault = env.BETTERPPTX_AUTH === 'none' || env.BETTERPPTX_PUBLIC_BLACK_BOX === '1'
	const fallback = publicDefault ? 120 : 600
	return {
		enabled: isProductionBillingEnvironment(env) || env.BETTERPPTX_RATE_LIMIT_DISABLED !== '1',
		capacity: boundedNumber(env.BETTERPPTX_RATE_LIMIT_BURST, fallback, 1, 10000),
		refillPerMinute: boundedNumber(env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN, fallback, 0, 10000),
		globalCapacity: boundedNumber(env.BETTERPPTX_RATE_LIMIT_GLOBAL_BURST, 1200, 1, 10000),
		globalRefillPerMinute: boundedNumber(env.BETTERPPTX_RATE_LIMIT_GLOBAL_REFILL_PER_MIN, 1200, 0, 10000),
	}
}

function normalizeIp(value) {
	const text = String(value || '').trim().replace(/^::ffff:/i, '')
	return isIP(text) ? text : ''
}

export function httpClientRateLimitKey(req, env = process.env) {
	const remote = normalizeIp(req.socket?.remoteAddress) || 'unknown'
	if (env.BETTERPPTX_TRUST_PROXY_HEADERS !== '1') return remote
	const trusted = new Set(String(env.BETTERPPTX_TRUSTED_PROXY_ADDRESSES || '').split(',').map(normalizeIp).filter(Boolean))
	if (!trusted.has(remote)) return remote
	const header = String(env.BETTERPPTX_CLIENT_IP_HEADER || 'x-forwarded-for').toLowerCase()
	const raw = req.headers?.[header]
	if (typeof raw !== 'string' || raw.length > 2048) return remote
	const hops = raw.split(',').map(normalizeIp)
	if (!hops.length || hops.some(hop => !hop)) return remote
	// Walk from the known peer, not the first attacker-controlled header value.
	let current = remote
	for (let index = hops.length - 1; index >= 0 && trusted.has(current); index--) current = hops[index]
	return current
}

export function developmentLogViewerAllowed(req, env = process.env) {
	if (isProductionBillingEnvironment(env) || env.BETTERPPTX_PUBLIC_BLACK_BOX === '1' || env.BETTERPPTX_BLACK_BOX === '1') return false
	const peer = normalizeIp(req.socket?.remoteAddress)
	if (!['127.0.0.1', '::1'].includes(peer)) return false
	try {
		const host = new URL(`http://${req.headers?.host || ''}`).hostname
		return ['localhost', '127.0.0.1', '[::1]'].includes(host)
	} catch { return false }
}
