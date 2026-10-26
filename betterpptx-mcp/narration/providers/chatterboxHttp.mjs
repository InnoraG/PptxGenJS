import { recordResourceUsage } from '../../billing/resource-meter.mjs'
import { parseWavDuration } from '../wavDuration.mjs'
import { validateVoiceSample } from '../customVoices.mjs'
import { createMetadataIdentityTokenSource } from '../../auth/cloud-run-id-token.mjs'

function runtimeError(code, retryable = false) {
	const error = new Error(code === 'NARRATION_SYNTHESIS_TEXT_LIMIT'
		? 'This narration voice supports between 1 and 1000 characters per segment. Split longer narration into segments.'
		: code === 'NARRATION_SYNTHESIS_UNSUPPORTED_SETTINGS'
		? 'The selected narration voice does not support the requested controls.'
		: 'The narration synthesis runtime could not complete this request.')
	error.code = code
	error.retryable = retryable
	return error
}

export function createChatterboxHttpProvider() {
	const base = String(process.env.BETTERPPTX_CHATTERBOX_URL || process.env.BETTERPPTX_TTS_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '')
	const timeoutMs = Number(process.env.BETTERPPTX_TTS_TIMEOUT_MS || 300000)
	const maxBytes = Number(process.env.BETTERPPTX_TTS_MAX_AUDIO_MB || 64) * 1048576
	let identityToken = null
	if (process.env.BETTERPPTX_TTS_AUTH === 'cloud-run') {
		let target
		try { target = new URL(base) } catch { throw runtimeError('NARRATION_SYNTHESIS_RUNTIME_CONFIGURATION') }
		if (target.protocol !== 'https:' || !target.hostname.endsWith('.run.app')) throw runtimeError('NARRATION_SYNTHESIS_RUNTIME_CONFIGURATION')
		identityToken = createMetadataIdentityTokenSource(target.origin)
	}
	async function request(route, options, timeout, read) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeout)
		try {
			recordResourceUsage({ externalCalls: 1 })
			const headers = identityToken ? { ...options?.headers, 'X-Serverless-Authorization': `Bearer ${await identityToken()}` } : options?.headers
			const response = await fetch(`${base}${route}`, { ...options, headers, signal: controller.signal })
			if (!response.ok) throw runtimeError(response.status >= 500 ? 'NARRATION_SYNTHESIS_RUNTIME_UNAVAILABLE' : 'NARRATION_SYNTHESIS_FAILED', response.status >= 500)
			return await read(response)
		} catch (cause) {
			if (cause?.code?.startsWith('NARRATION_')) throw cause
			throw runtimeError(controller.signal.aborted ? 'NARRATION_SYNTHESIS_RUNTIME_TIMEOUT' : 'NARRATION_SYNTHESIS_RUNTIME_UNAVAILABLE', true)
		} finally {
			clearTimeout(timer)
		}
	}
	return {
		name: 'chatterbox-http',
		async probe(timeout = 2500) {
			try {
				const health = await request('/health', { headers: { Accept: 'application/json' } }, timeout, response => response.json())
				return health?.ready === true
			} catch { return false }
		},
		async listVoices() {
			return request('/voices', { headers: { Accept: 'application/json' } }, identityToken ? 60000 : 8000, response => response.json())
		},
		async synthesize(req) {
			if (typeof req.text !== 'string' || !req.text.trim() || req.text.length > 1000) throw runtimeError('NARRATION_SYNTHESIS_TEXT_LIMIT')
			if ((req.lengthScale != null && req.lengthScale !== 1) || req.noiseScale != null || req.noiseWScale != null || req.speaker != null) {
				throw runtimeError('NARRATION_SYNTHESIS_UNSUPPORTED_SETTINGS')
			}
			const voice = req.voice?.id || req.voice || req.voiceId
			if (typeof voice !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(voice)) throw runtimeError('NARRATION_SYNTHESIS_INVALID_VOICE')
			const language = req.language || req.lang || req.voice?.locale || req.voice?.language
			if (req.voice?.customReferenceBuffer) {
				const sample = req.voice.customReferenceBuffer
				const evidence = validateVoiceSample(sample)
				if (evidence.referenceDigest !== req.voice.referenceDigest) throw runtimeError('NARRATION_SYNTHESIS_INVALID_VOICE')
				const registered = await request('/voices/register', {
					method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify({ voice, referenceWavBase64: sample.toString('base64'), referenceDigest: evidence.referenceDigest, languages: req.voice.languages, rightsConfirmed: true }),
				}, identityToken ? 60000 : 15000, response => response.json())
				if (registered?.id !== voice || registered?.referenceDigest !== evidence.referenceDigest) throw runtimeError('NARRATION_SYNTHESIS_INVALID_VOICE')
			}
			const body = { text: req.text, voice, ...(language ? { language } : {}) }
			const wav = await request('/synthesize', {
				method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' }, body: JSON.stringify(body),
			}, timeoutMs, async response => {
				if (Number(response.headers.get('content-length')) > maxBytes) throw runtimeError('NARRATION_SYNTHESIS_AUDIO_INVALID')
				const buffer = Buffer.from(await response.arrayBuffer())
				if (buffer.length > maxBytes) throw runtimeError('NARRATION_SYNTHESIS_AUDIO_INVALID')
				return buffer
			})
			const metadata = parseWavDuration(wav)
			if (!metadata || metadata.bitsPerSample !== 16 || metadata.durationMs <= 0 || metadata.dataBytes % (metadata.channels * 2)) throw runtimeError('NARRATION_SYNTHESIS_AUDIO_INVALID')
			return { wav, sampleRate: metadata.sampleRate, channels: metadata.channels, bitsPerSample: metadata.bitsPerSample, voice: req.voice }
		},
	}
}
