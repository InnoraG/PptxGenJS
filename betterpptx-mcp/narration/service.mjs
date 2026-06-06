import * as path from 'node:path'
import { logEvent } from '../logger.mjs'
import { listVoices, resolveVoice } from './licenseGate.mjs'
import { hashText, materializeAudioInput, writeAudioArtifact } from './audio.mjs'
import { parseWavDuration, wavDurationFromFile } from './wavDuration.mjs'
import { getProvider, assertTextWithinLimit, withSynthSlot } from './providers/index.mjs'

const MAX_AUDIO_BYTES = Number(process.env.BETTERPPTX_TTS_MAX_AUDIO_MB || 64) * 1048576

export function narrationDisabled() {
	return process.env.BETTERPPTX_NARRATION_DISABLED === '1'
}

export function getVoices(args = {}) {
	return listVoices(args)
}

function normalizeScript(script) {
	return String(script || '').replace(/\s+/g, ' ').trim()
}

export async function synthesizeNarration(args = {}) {
	if (narrationDisabled()) throw new Error('Narration is disabled by BETTERPPTX_NARRATION_DISABLED=1.')
	const providerName = args.provider || process.env.BETTERPPTX_TTS_PROVIDER || 'piper-http'
	const provider = getProvider(providerName)
	const text = normalizeScript(args.text)
	assertTextWithinLimit(text)

	let voiceDecision = null
	let voice = args.voice ? { id: args.voice } : null
	let license = null
	let warnings = []
	voiceDecision = resolveVoice({
		voice: args.voice,
		lang: args.lang,
		allowUnreviewedVoices: args.allowUnreviewedVoices,
	})
	voice = voiceDecision.voice
	license = voiceDecision.license
	warnings = warnings.concat(voiceDecision.warnings)

	const textHash = hashText(text)
	logEvent('narration.tts.request', {
		provider: provider.name,
		voiceId: voice?.id,
		textHash,
		textChars: text.length,
		licenseDecision: license?.commercialUse,
	})

	const result = await withSynthSlot(() => provider.synthesize({
		text,
		voice,
		speaker: args.speaker,
		lengthScale: args.lengthScale,
		noiseScale: args.noiseScale,
		noiseWScale: args.noiseWScale,
	}))
	if (!result?.wav || result.wav.length <= 0) throw new Error('TTS provider returned empty audio.')
	if (result.wav.length > MAX_AUDIO_BYTES) throw new Error(`Generated audio is too large (${result.wav.length} bytes > ${MAX_AUDIO_BYTES}).`)
	const parsed = parseWavDuration(result.wav)
	if (!parsed) throw new Error('TTS provider did not return PCM WAV audio.')
	const filePath = await writeAudioArtifact({ buffer: result.wav, extn: 'wav', prefix: `tts-${(voice?.id || 'voice').replace(/[^A-Za-z0-9_-]/g, '_')}` })
	const duration = await wavDurationFromFile(filePath)
	logEvent('narration.tts.result', {
		provider: provider.name,
		voiceId: voice?.id,
		textHash,
		durationMs: duration.durationMs,
		bytes: result.wav.length,
		filePath,
		warnings,
	})
	return {
		ok: true,
		wavPath: filePath,
		durationMs: duration.durationMs,
		provider: provider.name,
		voice: {
			id: voice?.id,
			language: voice?.language,
			locale: voice?.locale,
			quality: voice?.quality,
		},
		license,
		warnings,
		textHash,
	}
}

export async function resolveNarrationAudio(args = {}) {
	if (args.audio) {
		const audio = await materializeAudioInput(args.audio)
		if (audio.durationMs <= 0) throw new Error('Audio duration must be positive.')
		logEvent('narration.external_audio.result', {
			filePath: audio.filePath,
			extn: audio.extn,
			durationMs: audio.durationMs,
			source: audio.source,
		})
		return {
			audio: {
				filePath: audio.filePath,
				extn: audio.extn,
				durationMs: audio.durationMs,
				source: audio.source,
			},
			voice: null,
			license: null,
			warnings: [],
			textHash: args.script ? hashText(normalizeScript(args.script)) : null,
		}
	}
	const synth = await synthesizeNarration({
		text: args.script,
		voice: args.voice,
		lang: args.lang,
		provider: args.provider,
		speaker: args.speaker,
		lengthScale: args.lengthScale,
		noiseScale: args.noiseScale,
		noiseWScale: args.noiseWScale,
		allowUnreviewedVoices: args.allowUnreviewedVoices,
	})
	return {
		audio: {
			filePath: synth.wavPath,
			extn: 'wav',
			durationMs: synth.durationMs,
			source: 'tts',
		},
		voice: synth.voice,
		license: synth.license,
		warnings: synth.warnings,
		textHash: synth.textHash,
		provider: synth.provider,
	}
}

export function makeNarrationObjectName(slideIndex) {
	return `narration-audio-s${Number(slideIndex) + 1}`
}

export function packageSafeMediaPath(filePath) {
	return path.resolve(filePath)
}
