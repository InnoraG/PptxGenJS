import * as path from 'node:path'
import { logEvent } from '../logger.mjs'
import { listVoices, resolveVoice } from './licenseGate.mjs'
import { hashText, materializeAudioInput, writeAudioArtifact } from './audio.mjs'
import { parseWavDuration, wavDurationFromFile } from './wavDuration.mjs'
import { getProvider, assertTextWithinLimit, withSynthSlot } from './providers/index.mjs'
import { recordResourceLabels, recordResourceUsage } from '../billing/resource-meter.mjs'
import { normalizeNarrationForTts } from './tts-text.mjs'
import { analyzePcmWavQuality, assertPcmWavQuality, repairPcmWavForNarration } from './wavQuality.mjs'

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
	const notesText = normalizeScript(args.text)
	const text = normalizeScript(args.synthesisText || normalizeNarrationForTts(notesText) || notesText)
	assertTextWithinLimit(text)

	let voiceDecision = null
	let voice = args.voice ? { id: args.voice } : null
	let license = null
	let warnings = []
	voiceDecision = resolveVoice({
		provider: provider.name,
		voice: args.voice,
		lang: args.lang,
		gender: args.gender,
		speaker: args.speaker,
		allowUnreviewedVoices: args.allowUnreviewedVoices,
	})
	voice = voiceDecision.voice
	const effectiveLanguage = args.lang || voice?.locale || voice?.language || null
	license = voiceDecision.license
	warnings = warnings.concat(voiceDecision.warnings)

	const textHash = hashText(text)
	logEvent('narration.tts.request', {
		provider: provider.name,
		voiceId: voice?.id,
		gender: voiceDecision.gender,
		speaker: voiceDecision.speaker,
		textHash,
		textChars: text.length,
		licenseDecision: license?.commercialUse,
	})

	const result = await withSynthSlot(() => provider.synthesize({
		text,
		voice,
		language: effectiveLanguage,
		speaker: voiceDecision.speaker,
		lengthScale: args.lengthScale,
		noiseScale: args.noiseScale,
		noiseWScale: args.noiseWScale,
	}))
	if (!result?.wav || result.wav.length <= 0) throw new Error('TTS provider returned empty audio.')
	if (result.wav.length > MAX_AUDIO_BYTES) throw new Error(`Generated audio is too large (${result.wav.length} bytes > ${MAX_AUDIO_BYTES}).`)
	const providerAudioQuality = analyzePcmWavQuality(result.wav)
	const needsRepair = providerAudioQuality.status === 'failed' || providerAudioQuality.findings?.some(finding => ['AUDIO_NEAR_CLIPPING', 'AUDIO_CLIPPING_DETECTED', 'AUDIO_DISCONTINUITY_DETECTED'].includes(finding.code))
	const repaired = needsRepair ? repairPcmWavForNarration(result.wav) : { buffer: result.wav, changed: false, evidence: { status: 'not-needed', methods: [] } }
	const wav = repaired.buffer
	const parsed = parseWavDuration(wav)
	if (!parsed) throw new Error('TTS provider did not return PCM WAV audio.')
	const audioQuality = assertPcmWavQuality(wav)
	if (repaired.changed) warnings.push(`AUDIO_POST_PROCESSED: Provider PCM was peak-normalized and de-clicked before validation (${repaired.evidence.repairedSamples} corrected samples).`)
	warnings = warnings.concat(audioQuality.findings.filter(finding => finding.severity === 'warning').map(finding => `${finding.code}: ${finding.message}`))
	const filePath = await writeAudioArtifact({ buffer: wav, extn: 'wav', prefix: `tts-${(voice?.id || 'voice').replace(/[^A-Za-z0-9_-]/g, '_')}` })
	const duration = await wavDurationFromFile(filePath)
	recordResourceUsage({
		ttsCharacters: text.length,
		ttsAudioSeconds: duration.durationMs / 1000,
		artifactBytes: wav.length,
	})
	// Cost-learning label: per-voice chars->seconds ratios are fitted from observations
	// so future quotes predict duration without synthesizing.
	recordResourceLabels({ ttsVoice: voice?.id || 'unknown', ttsProvider: provider.name })
	logEvent('narration.tts.result', {
		provider: provider.name,
		voiceId: voice?.id,
		gender: voiceDecision.gender,
		speaker: voiceDecision.speaker,
		textHash,
		durationMs: duration.durationMs,
		bytes: wav.length,
		filePath,
		warnings,
		providerAudioQuality,
		audioQuality,
		audioPostProcessing: repaired.evidence,
	})
	const settingsDigest = hashText(JSON.stringify({
		provider: provider.name,
		language: effectiveLanguage,
		modelDigest: voice?.modelDigest || null,
		referenceDigest: voice?.referenceDigest || null,
		runtimeVersion: process.env.BETTERPPTX_TTS_RUNTIME_VERSION || null,
		voiceId: voice?.id || null,
		gender: voiceDecision.gender || null,
		speaker: voiceDecision.speaker ?? null,
		lengthScale: args.lengthScale ?? null,
		noiseScale: args.noiseScale ?? null,
		noiseWScale: args.noiseWScale ?? null,
		synthesisText: text,
	}))
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
			gender: voiceDecision.gender || voice?.gender,
			genderSource: voice?.genderSource,
			genderConfidence: voice?.genderConfidence,
			...(voiceDecision.speaker !== undefined ? { speaker: voiceDecision.speaker } : {}),
		},
		license,
		warnings,
		audioQuality,
		audioPostProcessing: repaired.evidence,
		textHash,
		notesText,
		synthesisText: text,
		ttsExecution: {
			engine: 'internal',
			voiceId: voice?.id || null,
			sampleRateHz: duration.sampleRate || parsed.sampleRate || 22050,
			runtimeVersion: process.env.BETTERPPTX_TTS_RUNTIME_VERSION || null,
			modelDigest: voice?.modelDigest || null,
			referenceDigest: voice?.referenceDigest || null,
			deterministicSettingsDigest: `sha256:${settingsDigest}`,
			audioPostProcessing: repaired.evidence,
		},
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
		synthesisText: args.synthesisText,
		voice: args.voice,
		lang: args.lang,
		provider: args.provider,
		speaker: args.speaker,
		gender: args.gender,
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
		ttsExecution: synth.ttsExecution,
		audioQuality: synth.audioQuality,
		notesText: synth.notesText,
		synthesisText: synth.synthesisText,
	}
}

export function makeNarrationObjectName(slideIndex) {
	return `narration-audio-s${Number(slideIndex) + 1}`
}

export function packageSafeMediaPath(filePath) {
	return path.resolve(filePath)
}
