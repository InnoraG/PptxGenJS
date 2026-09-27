import * as fs from 'node:fs/promises'
import * as crypto from 'node:crypto'

import { synthesizeNarration } from './service.mjs'
import { hashText, writeAudioArtifact } from './audio.mjs'
import { parseWavDuration } from './wavDuration.mjs'

export const NARRATION_PREPARATION_SCHEMA_VERSION = 'betterpptx.narration-preparation.v1'

function preparationError(code, message, details = {}) {
	const error = new Error(message)
	error.code = code
	error.details = { status: 'narration_preparation_failed', ...details }
	return error
}

function normalizeText(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function nonNegativeInteger(value, fallback = 0, field = 'timing') {
	if (value === undefined || value === null || value === '') return fallback
	const number = Number(value)
	if (!Number.isInteger(number) || number < 0) {
		throw preparationError('NARRATION_PREPARATION_TIMING_INVALID', `${field} must be a non-negative integer number of milliseconds.`, { field, value })
	}
	return number
}

function canonicalPreparationInput(args = {}, segments = []) {
	return {
		text: normalizeText(args.text ?? args.script),
		segments: segments.map(segment => ({
			id: segment.id,
			slideId: segment.slideId || null,
			text: segment.text,
			synthesisText: segment.synthesisText || null,
			gapBeforeMs: segment.gapBeforeMs,
			gapAfterMs: segment.gapAfterMs,
			voice: segment.voice || args.voice || null,
			lang: segment.lang || args.lang || args.language || null,
			gender: segment.gender || args.gender || null,
			speaker: segment.speaker ?? args.speaker ?? null,
			lengthScale: segment.lengthScale ?? args.lengthScale ?? null,
			noiseScale: segment.noiseScale ?? args.noiseScale ?? null,
			noiseWScale: segment.noiseWScale ?? args.noiseWScale ?? null,
		})),
		segmentGapMs: nonNegativeInteger(args.segmentGapMs, 0, 'segmentGapMs'),
		outputFormat: 'wav',
	}
}

function readPcmWav(buffer) {
	if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer || '')
	if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
		throw preparationError('NARRATION_PREPARATION_AUDIO_INVALID', 'The synthesis result is not a RIFF/WAVE file.')
	}
	let fmt = null
	let data = null
	let offset = 12
	while (offset + 8 <= buffer.length) {
		const id = buffer.toString('ascii', offset, offset + 4)
		const size = buffer.readUInt32LE(offset + 4)
		const start = offset + 8
		const end = Math.min(buffer.length, start + size)
		if (id === 'fmt ' && size >= 16 && start + 16 <= buffer.length) {
			fmt = {
				audioFormat: buffer.readUInt16LE(start),
				channels: buffer.readUInt16LE(start + 2),
				sampleRate: buffer.readUInt32LE(start + 4),
				byteRate: buffer.readUInt32LE(start + 8),
				blockAlign: buffer.readUInt16LE(start + 12),
				bitsPerSample: buffer.readUInt16LE(start + 14),
			}
		} else if (id === 'data') {
			data = buffer.subarray(start, end)
		}
		offset = start + size + (size % 2)
	}
	if (!fmt || !data || fmt.audioFormat !== 1 || !fmt.channels || !fmt.sampleRate || !fmt.blockAlign || !fmt.bitsPerSample) {
		throw preparationError('NARRATION_PREPARATION_AUDIO_INVALID', 'The synthesis result must be uncompressed PCM WAV audio.')
	}
	return { fmt, data }
}

function wavFromPcm(fmt, data) {
	if (data.length % fmt.blockAlign !== 0) {
		throw preparationError('NARRATION_PREPARATION_AUDIO_INVALID', 'The assembled PCM data is not aligned to complete audio frames.')
	}
	const header = Buffer.alloc(44)
	header.write('RIFF', 0)
	header.writeUInt32LE(36 + data.length, 4)
	header.write('WAVE', 8)
	header.write('fmt ', 12)
	header.writeUInt32LE(16, 16)
	header.writeUInt16LE(fmt.audioFormat, 20)
	header.writeUInt16LE(fmt.channels, 22)
	header.writeUInt32LE(fmt.sampleRate, 24)
	header.writeUInt32LE(fmt.sampleRate * fmt.blockAlign, 28)
	header.writeUInt16LE(fmt.blockAlign, 32)
	header.writeUInt16LE(fmt.bitsPerSample, 34)
	header.write('data', 36)
	header.writeUInt32LE(data.length, 40)
	return Buffer.concat([header, data])
}

function silencePcmForFormat(fmt, durationMs) {
	const frameCount = Math.max(0, Math.round((Number(durationMs) || 0) * fmt.sampleRate / 1000))
	return Buffer.alloc(frameCount * fmt.blockAlign)
}

function normalizeSegments(args = {}) {
	const supplied = Array.isArray(args.segments) && args.segments.length
		? args.segments
		: [{ id: args.segmentId || 'segment-1', slideId: args.slideId, text: args.text ?? args.script, synthesisText: args.synthesisText }]
	const seen = new Set()
	return supplied.map((raw, index) => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			throw preparationError('NARRATION_PREPARATION_SEGMENT_INVALID', `segments[${index}] must be an object.`)
		}
		const id = normalizeText(raw.id || `segment-${index + 1}`)
		if (!id) throw preparationError('NARRATION_PREPARATION_SEGMENT_INVALID', `segments[${index}].id must not be empty.`)
		if (seen.has(id)) throw preparationError('NARRATION_PREPARATION_SEGMENT_INVALID', `Narration segment id "${id}" is duplicated.`, { id })
		seen.add(id)
		const text = normalizeText(raw.text ?? raw.script)
		if (!text) throw preparationError('NARRATION_TEXT_REQUIRED', `segments[${index}] requires text or script.`)
		return {
			id,
			slideId: raw.slideId == null ? null : normalizeText(raw.slideId),
			text,
			synthesisText: normalizeText(raw.synthesisText) || undefined,
			gapBeforeMs: nonNegativeInteger(raw.gapBeforeMs ?? raw.pauseBeforeMs, index === 0 ? 0 : nonNegativeInteger(args.segmentGapMs, 0, 'segmentGapMs'), `segments[${index}].gapBeforeMs`),
			gapAfterMs: nonNegativeInteger(raw.gapAfterMs ?? raw.pauseAfterMs ?? raw.pauseMs, 0, `segments[${index}].gapAfterMs`),
			voice: raw.voice,
			lang: raw.lang ?? raw.language,
			gender: raw.gender,
			speaker: raw.speaker,
			lengthScale: raw.lengthScale,
			noiseScale: raw.noiseScale,
			noiseWScale: raw.noiseWScale,
		}
	})
}

/**
 * Synthesize every narration segment once, measure every returned WAV, and
 * assemble the exact clips plus authored silence gaps into one reusable WAV.
 * This module deliberately returns local paths only to the engine; public
 * callers receive opaque locked handles after the engine packages the result.
 */
export async function prepareNarrationAudio(args = {}, { synthesize = synthesizeNarration } = {}) {
	const segments = normalizeSegments(args)
	const request = canonicalPreparationInput(args, segments)
	const requestDigest = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex')
	const scriptDigest = hashText(segments.map(segment => segment.text).join('\n'))
	const clips = []
	let format = null
	let cursorMs = 0
	const warnings = []

	for (const segment of segments) {
		const result = await synthesize({
			text: segment.text,
			synthesisText: segment.synthesisText,
			voice: segment.voice ?? args.voice,
			lang: segment.lang ?? args.lang ?? args.language,
			gender: segment.gender ?? args.gender,
			speaker: segment.speaker ?? args.speaker,
			lengthScale: segment.lengthScale ?? args.lengthScale,
			noiseScale: segment.noiseScale ?? args.noiseScale,
			noiseWScale: segment.noiseWScale ?? args.noiseWScale,
			provider: args.provider,
			allowUnreviewedVoices: args.allowUnreviewedVoices,
		})
		if (!result?.wavPath) throw preparationError('NARRATION_PREPARATION_AUDIO_MISSING', `Synthesis returned no audio for segment "${segment.id}".`, { segmentId: segment.id })
		const buffer = await fs.readFile(result.wavPath)
		const parsed = readPcmWav(buffer)
		const measured = parseWavDuration(buffer)
		if (!measured || measured.durationMs <= 0) throw preparationError('NARRATION_PREPARATION_AUDIO_INVALID', `Measured audio for segment "${segment.id}" has no positive duration.`, { segmentId: segment.id })
		if (!format) format = parsed.fmt
		if (format.sampleRate !== parsed.fmt.sampleRate || format.channels !== parsed.fmt.channels || format.bitsPerSample !== parsed.fmt.bitsPerSample || format.blockAlign !== parsed.fmt.blockAlign) {
			throw preparationError('NARRATION_PREPARATION_FORMAT_MISMATCH', 'All narration segments must use the same PCM sample rate, channel count, and bit depth.', { segmentId: segment.id })
		}
		const gapBeforeMs = segment.gapBeforeMs
		cursorMs += gapBeforeMs
		const startMs = cursorMs
		const endMs = startMs + measured.durationMs
		const gapAfterMs = segment.gapAfterMs
		cursorMs = endMs + gapAfterMs
		warnings.push(...(Array.isArray(result.warnings) ? result.warnings : []))
		clips.push({ segment, buffer, result, parsed, measured, gapBeforeMs, gapAfterMs, startMs, endMs })
	}

	const pieces = []
	for (const clip of clips) {
		if (clip.gapBeforeMs > 0) pieces.push(silencePcmForFormat(clip.parsed.fmt, clip.gapBeforeMs))
		pieces.push(clip.parsed.data)
		if (clip.gapAfterMs > 0) pieces.push(silencePcmForFormat(clip.parsed.fmt, clip.gapAfterMs))
	}
	const assembled = wavFromPcm(format, Buffer.concat(pieces))
	const assembledPath = await writeAudioArtifact({ buffer: assembled, extn: 'wav', prefix: `narration-prepared-${requestDigest.slice(0, 12)}` })
	const assembledMeasured = parseWavDuration(assembled)
	if (!assembledMeasured || assembledMeasured.durationMs <= 0) throw preparationError('NARRATION_PREPARATION_AUDIO_INVALID', 'The assembled narration WAV could not be measured.')

	return {
		schemaVersion: NARRATION_PREPARATION_SCHEMA_VERSION,
		requestDigest,
		scriptDigest,
		assembled: { filePath: assembledPath, durationMs: assembledMeasured.durationMs, extn: 'wav', mimeType: 'audio/wav' },
		segments: clips.map(clip => ({
			id: clip.segment.id,
			slideId: clip.segment.slideId,
			text: clip.segment.text,
			synthesisText: clip.segment.synthesisText,
			filePath: clip.result.wavPath,
			durationMs: clip.measured.durationMs,
			gapBeforeMs: clip.gapBeforeMs,
			gapAfterMs: clip.gapAfterMs,
			startMs: clip.startMs,
			endMs: clip.endMs,
			voice: clip.result.voice,
			provider: clip.result.provider,
			textHash: clip.result.textHash || hashText(clip.segment.text),
			timingEvidence: 'measured-audio-segment-boundary',
		})),
		voice: clips[0]?.result.voice || null,
		provider: clips[0]?.result.provider || null,
		warnings,
		timingEvidence: {
			kind: 'measured-audio',
			source: 'provider-output-wav',
			precision: 'segment-boundary',
			wordAlignment: false,
		},
		settings: {
			lang: args.lang ?? args.language ?? null,
			gender: args.gender ?? null,
			speaker: args.speaker ?? null,
			lengthScale: args.lengthScale ?? null,
			noiseScale: args.noiseScale ?? null,
			noiseWScale: args.noiseWScale ?? null,
		},
	}
}
