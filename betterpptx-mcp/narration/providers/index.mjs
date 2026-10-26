import { createPiperHttpProvider } from './piperHttp.mjs'
import { createChatterboxHttpProvider } from './chatterboxHttp.mjs'

const MAX_TEXT_CHARS = Number(process.env.BETTERPPTX_TTS_MAX_TEXT_CHARS || 4000)
const MAX_SYNTH_CONCURRENCY = Number(process.env.BETTERPPTX_TTS_MAX_CONCURRENCY || 2)
const MAX_QUEUE = Number(process.env.BETTERPPTX_TTS_MAX_QUEUE || 16)

let active = 0
const queue = []

export function assertTextWithinLimit(text) {
	const len = String(text || '').length
	if (len <= 0) throw new Error('Narration text is empty.')
	if (len > MAX_TEXT_CHARS) throw new Error(`Narration text is too long (${len} chars > ${MAX_TEXT_CHARS}).`)
}

async function acquireSynthSlot() {
	if (active < MAX_SYNTH_CONCURRENCY) { active++; return }
	if (queue.length >= MAX_QUEUE) throw new Error(`TTS is at capacity (${active} active, ${queue.length} queued). Retry shortly.`)
	await new Promise(resolve => queue.push(resolve))
}

function releaseSynthSlot() {
	active = Math.max(0, active - 1)
	if (queue.length && active < MAX_SYNTH_CONCURRENCY) {
		active++
		queue.shift()()
	}
}

export async function withSynthSlot(fn) {
	await acquireSynthSlot()
	try {
		return await fn()
	} finally {
		releaseSynthSlot()
	}
}

export function getProvider(name) {
	const provider = String(name || process.env.BETTERPPTX_TTS_PROVIDER || 'piper-http').toLowerCase()
	if (provider === 'piper' || provider === 'piper-http') return createPiperHttpProvider()
	if (provider === 'chatterbox' || provider === 'chatterbox-http') return createChatterboxHttpProvider()
	if (provider === 'tone' || provider === 'test-tone') {
		throw new Error('The test narration runtime has been removed. Configure a speech runtime or pass explicit external audio.')
	}
	throw new Error('The selected narration synthesis runtime is unsupported.')
}
