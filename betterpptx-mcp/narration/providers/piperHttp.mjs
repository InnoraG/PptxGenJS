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
	return {
		name: 'piper-http',
		async listVoices() {
			const res = await fetchWithTimeout(`${base}/voices`, { headers: { Accept: 'application/json' } }, 8000)
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
			const res = await fetchWithTimeout(`${base}/`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'audio/wav, application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				let detail = ''
				try { detail = JSON.stringify(await res.json()) } catch { detail = await res.text().catch(() => '') }
				throw new Error(`Piper synth failed: HTTP ${res.status}${detail ? ` ${detail}` : ''}`)
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
