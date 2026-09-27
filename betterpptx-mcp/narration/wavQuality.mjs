function ascii(buffer, offset, length) {
	return buffer.subarray(offset, offset + length).toString('ascii')
}

function pcmData(buffer) {
	if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer)
	if (buffer.length < 44 || ascii(buffer, 0, 4) !== 'RIFF' || ascii(buffer, 8, 4) !== 'WAVE') return null
	let format = null
	let data = null
	let offset = 12
	while (offset + 8 <= buffer.length) {
		const id = ascii(buffer, offset, 4)
		const size = buffer.readUInt32LE(offset + 4)
		const start = offset + 8
		if (start + size > buffer.length) break
		if (id === 'fmt ' && size >= 16) format = { audioFormat: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14) }
		if (id === 'data') data = buffer.subarray(start, start + size)
		offset = start + size + (size % 2)
	}
	if (!format || !data || format.audioFormat !== 1 || ![16, 24, 32].includes(format.bitsPerSample)) return null
	return { ...format, data }
}

function readSample(data, offset, bits) {
	if (bits === 16) return data.readInt16LE(offset) / 32768
	if (bits === 24) return data.readIntLE(offset, 3) / 8388608
	return data.readInt32LE(offset) / 2147483648
}

function writeSample(data, offset, bits, sample) {
	const value = Math.max(-1, Math.min(1, Number(sample) || 0))
	if (bits === 16) return data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), offset)
	if (bits === 24) return data.writeIntLE(Math.max(-8388608, Math.min(8388607, Math.round(value * 8388607))), offset, 3)
	return data.writeInt32LE(Math.max(-2147483648, Math.min(2147483647, Math.round(value * 2147483647))), offset)
}

export function analyzePcmWavQuality(buffer, options = {}) {
	const pcm = pcmData(buffer)
	if (!pcm) return { schemaVersion: 'betterpptx.wav-quality.v1', status: 'unsupported', findings: [{ code: 'AUDIO_QUALITY_UNSUPPORTED_PCM', severity: 'error', message: 'Audio quality analysis requires PCM WAV with 16, 24, or 32-bit integer samples.' }] }
	const bytes = pcm.bitsPerSample / 8
	const totalSamples = Math.floor(pcm.data.length / bytes)
	let peak = 0
	let sum = 0
	let sumSquares = 0
	let clipped = 0
	let discontinuities = 0
	let maximumStep = 0
	const previous = Array.from({ length: pcm.channels }, () => null)
	for (let offset = 0, sampleIndex = 0; offset + bytes <= pcm.data.length; offset += bytes, sampleIndex++) {
		const sample = readSample(pcm.data, offset, pcm.bitsPerSample)
		const channel = sampleIndex % pcm.channels
		const abs = Math.abs(sample)
		peak = Math.max(peak, abs)
		sum += sample
		sumSquares += sample * sample
		if (abs >= 0.998) clipped++
		if (previous[channel] !== null) {
			const step = Math.abs(sample - previous[channel])
			maximumStep = Math.max(maximumStep, step)
			if (step >= 0.72) discontinuities++
		}
		previous[channel] = sample
	}
	const clippedRatio = totalSamples ? clipped / totalSamples : 0
	const discontinuityRatio = totalSamples > 1 ? discontinuities / (totalSamples - 1) : 0
	const dcOffset = totalSamples ? sum / totalSamples : 0
	const rms = totalSamples ? Math.sqrt(sumSquares / totalSamples) : 0
	const findings = []
	if (totalSamples < Math.max(64, pcm.channels * 32)) findings.push({ code: 'AUDIO_TOO_SHORT_FOR_QUALITY_ANALYSIS', severity: 'error', message: 'The synthesized PCM payload is too short for reliable narration playback.' })
	if (clippedRatio > Number(options.maximumClippedRatio ?? 0.002)) findings.push({ code: 'AUDIO_CLIPPING_DETECTED', severity: 'error', message: 'The synthesized waveform contains sustained full-scale clipping.', observed: clippedRatio, constraint: Number(options.maximumClippedRatio ?? 0.002) })
	if (discontinuityRatio > Number(options.maximumDiscontinuityRatio ?? 0.001)) findings.push({ code: 'AUDIO_DISCONTINUITY_DETECTED', severity: 'error', message: 'The synthesized waveform contains repeated large sample discontinuities consistent with clicks or crackle.', observed: discontinuityRatio, constraint: Number(options.maximumDiscontinuityRatio ?? 0.001) })
	if (Math.abs(dcOffset) > Number(options.maximumDcOffset ?? 0.08)) findings.push({ code: 'AUDIO_DC_OFFSET', severity: 'error', message: 'The synthesized waveform has excessive DC offset.', observed: dcOffset, constraint: Number(options.maximumDcOffset ?? 0.08) })
	if (rms < Number(options.minimumRms ?? 0.0005)) findings.push({ code: 'AUDIO_EFFECTIVELY_SILENT', severity: 'error', message: 'The synthesized waveform is effectively silent.', observed: rms, constraint: Number(options.minimumRms ?? 0.0005) })
	if (peak > 0.97 && clippedRatio <= Number(options.maximumClippedRatio ?? 0.002)) findings.push({ code: 'AUDIO_NEAR_CLIPPING', severity: 'warning', message: 'The waveform peak is close to full scale; monitor provider output for clipping.', observed: peak })
	return {
		schemaVersion: 'betterpptx.wav-quality.v1',
		status: findings.some(finding => finding.severity === 'error') ? 'failed' : findings.length ? 'warning' : 'passed',
		format: { channels: pcm.channels, sampleRate: pcm.sampleRate, bitsPerSample: pcm.bitsPerSample },
		metrics: { totalSamples, peak: Number(peak.toFixed(6)), rms: Number(rms.toFixed(6)), dcOffset: Number(dcOffset.toFixed(6)), clippedRatio: Number(clippedRatio.toFixed(8)), discontinuityRatio: Number(discontinuityRatio.toFixed(8)), maximumStep: Number(maximumStep.toFixed(6)) },
		findings,
	}
}

/**
 * Repair provider PCM before it becomes a durable narration asset. This is a
 * bounded waveform operation, not a relaxed validator: peaks are normalized,
 * implausibly large adjacent-sample jumps are slew-limited per channel, and
 * very short edge fades prevent boundary clicks. The repaired bytes must still
 * pass the unchanged quality gate.
 */
export function repairPcmWavForNarration(buffer, options = {}) {
	const output = Buffer.from(buffer)
	const pcm = pcmData(output)
	if (!pcm) return { buffer: output, changed: false, evidence: { status: 'unsupported', methods: [] } }
	const bytes = pcm.bitsPerSample / 8
	const frameBytes = bytes * pcm.channels
	const frameCount = Math.floor(pcm.data.length / frameBytes)
	const targetPeak = Math.max(0.5, Math.min(0.98, Number(options.targetPeak ?? 0.94)))
	const maximumStep = Math.max(0.2, Math.min(0.7, Number(options.maximumStep ?? 0.62)))
	const fadeFrames = Math.min(Math.max(1, Math.round(pcm.sampleRate * Number(options.edgeFadeMs ?? 5) / 1000)), Math.max(1, Math.floor(frameCount / 2)))
	let sourcePeak = 0
	for (let offset = 0; offset + bytes <= pcm.data.length; offset += bytes) sourcePeak = Math.max(sourcePeak, Math.abs(readSample(pcm.data, offset, pcm.bitsPerSample)))
	const peakGain = sourcePeak > targetPeak ? targetPeak / sourcePeak : 1
	const previous = Array.from({ length: pcm.channels }, () => null)
	let repairedSamples = 0
	let normalizedSamples = 0
	for (let frame = 0; frame < frameCount; frame++) {
		const edgeGain = Math.min(1, frame / fadeFrames, (frameCount - 1 - frame) / fadeFrames)
		for (let channel = 0; channel < pcm.channels; channel++) {
			const offset = frame * frameBytes + channel * bytes
			const source = readSample(pcm.data, offset, pcm.bitsPerSample)
			let sample = source * peakGain * Math.max(0, edgeGain)
			if (peakGain < 1 && Math.abs(source) > 0) normalizedSamples++
			if (previous[channel] !== null) {
				const delta = sample - previous[channel]
				if (Math.abs(delta) > maximumStep) {
					sample = previous[channel] + Math.sign(delta) * maximumStep
					repairedSamples++
				}
			}
			writeSample(pcm.data, offset, pcm.bitsPerSample, sample)
			previous[channel] = sample
		}
	}
	const changed = peakGain < 1 || repairedSamples > 0 || fadeFrames > 0
	return {
		buffer: output,
		changed,
		evidence: {
			schemaVersion: 'betterpptx.wav-repair.v1',
			status: changed ? 'applied' : 'not-needed',
			methods: ['peak-normalize', 'per-channel-slew-limit', 'edge-fade'],
			targetPeak,
			peakGain: Number(peakGain.toFixed(8)),
			maximumStep,
			edgeFadeMs: Number(options.edgeFadeMs ?? 5),
			repairedSamples,
			normalizedSamples,
			frameCount,
		},
	}
}

export function assertPcmWavQuality(buffer, options = {}) {
	const result = analyzePcmWavQuality(buffer, options)
	if (result.status === 'failed' || result.status === 'unsupported') {
		const error = new Error('Synthesized narration failed waveform quality validation.')
		error.code = 'TTS_AUDIO_QUALITY_FAILED'
		error.details = result
		throw error
	}
	return result
}
