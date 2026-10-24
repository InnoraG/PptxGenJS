import { recordResourceUsage } from '../../billing/resource-meter.mjs'
import { createMetadataIdentityTokenSource } from '../../auth/cloud-run-id-token.mjs'

const DEFAULT_TIMEOUT_MS = Number(process.env.BETTERPPTX_TTS_TIMEOUT_MS || 300000)

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
	const ctrl = new AbortController()
	const t = setTimeout(() => ctrl.abort(), timeoutMs)
	try {
		return await fetch(url, { ...options, signal: ctrl.signal })
	} finally {
		clearTimeout(t)
	}
}

export function createPiperHttpProvider() {
	const base = String(process.env.BETTERPPTX_TTS_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '')
	// BETTERPPTX_TTS_URL historically accepted a service root whose synthesis
	// endpoint was `/`.  Current Piper HTTP runtimes can instead expose an
	// explicit route such as `/synthesize`.  Treat a configured non-root path as
	// the exact synthesis endpoint so the adapter does not silently turn it into
	// `/synthesize/` (which Flask correctly rejects with HTTP 404).
	let synthUrl = `${base}/`
	try {
		const parsed = new URL(base)
		if (parsed.pathname && parsed.pathname !== '/') synthUrl = base
	} catch {}
	// BETTERPPTX_TTS_AUTH=cloud-run: the runtime is a private Cloud Run service;
	// each call carries this process's service identity (metadata server).
	let identityToken = null
	if (process.env.BETTERPPTX_TTS_AUTH === 'cloud-run') {
		const target = new URL(base)
		if (target.protocol !== 'https:' || !target.hostname.endsWith('.run.app')) {
			throw new Error('Cloud Run narration authentication requires an HTTPS run.app runtime URL.')
		}
		identityToken = createMetadataIdentityTokenSource(target.origin)
	}
	async function authorized(headers) {
		return identityToken ? { ...headers, 'X-Serverless-Authorization': `Bearer ${await identityToken()}` } : headers
	}
	return {
		name: 'piper-http',
		async probe(timeoutMs = 2500) {
			try {
				const res = await fetchWithTimeout(`${base}/voices`, { headers: await authorized({ Accept: 'application/json' }) }, timeoutMs)
				return res.ok === true
			} catch {
				return false
			}
		},
		async listVoices() {
			recordResourceUsage({ externalCalls: 1 })
			const res = await fetchWithTimeout(`${base}/voices`, { headers: await authorized({ Accept: 'application/json' }) }, identityToken ? 60000 : 8000)
			if (!res.ok) throw new Error(`Piper /voices failed: HTTP ${res.status}`)
			return await res.json()
		},
		async synthesize(req) {
			const body = {
				text: req.text,
				voice: req.voice?.id || req.voice || req.voiceId,
				speaker: req.speaker,
				length_scale: req.lengthScale,
				noise_scale: req.noiseScale,
				noise_w_scale: req.noiseWScale,
			}
			recordResourceUsage({ externalCalls: 1 })
			let res
			try {
				res = await fetchWithTimeout(synthUrl, {
					method: 'POST',
					headers: await authorized({ 'Content-Type': 'application/json', Accept: 'audio/wav, application/json' }),
					body: JSON.stringify(body),
				})
			} catch (cause) {
				const error = new Error('Narration synthesis is unavailable because the configured runtime did not respond. Check betterpptx.narration.voices and retry when synthesisRuntimeAvailable is true.')
				error.code = cause?.name === 'AbortError' ? 'NARRATION_SYNTHESIS_RUNTIME_TIMEOUT' : 'NARRATION_SYNTHESIS_RUNTIME_UNAVAILABLE'
				error.retryable = true
				error.details = {
					status: cause?.name === 'AbortError' ? 'runtime_timeout' : 'runtime_unavailable',
					nextAction: { tool: 'betterpptx.narration.voices', request: {} },
					retryable: true,
				}
				throw error
			}
			if (!res.ok) {
				const error = new Error('Narration synthesis runtime rejected the preparation request.')
				error.code = res.status >= 500 ? 'NARRATION_SYNTHESIS_RUNTIME_UNAVAILABLE' : 'NARRATION_SYNTHESIS_FAILED'
				error.retryable = res.status >= 500
				error.details = {
					status: res.status >= 500 ? 'runtime_unavailable' : 'runtime_request_rejected',
					nextAction: { tool: res.status >= 500 ? 'betterpptx.narration.voices' : 'betterpptx.narration.get_voice_timing', request: {} },
					retryable: res.status >= 500,
				}
				throw error
			}
			const buffer = Buffer.from(await res.arrayBuffer())
			return {
				wav: buffer,
				sampleRate: 22050,
				channels: 1,
				bitsPerSample: 16,
				voice: req.voice,
			}
		},
	}
}
