import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzePcmWavQuality, assertPcmWavQuality, repairPcmWavForNarration } from '../narration/wavQuality.mjs'

function wavFromSamples(samples, sampleRate = 22050) {
	const data = Buffer.alloc(samples.length * 2)
	samples.forEach((sample, index) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), index * 2))
	const header = Buffer.alloc(44)
	header.write('RIFF', 0)
	header.writeUInt32LE(36 + data.length, 4)
	header.write('WAVE', 8)
	header.write('fmt ', 12)
	header.writeUInt32LE(16, 16)
	header.writeUInt16LE(1, 20)
	header.writeUInt16LE(1, 22)
	header.writeUInt32LE(sampleRate, 24)
	header.writeUInt32LE(sampleRate * 2, 28)
	header.writeUInt16LE(2, 32)
	header.writeUInt16LE(16, 34)
	header.write('data', 36)
	header.writeUInt32LE(data.length, 40)
	return Buffer.concat([header, data])
}

test('clean tapered speech-like PCM passes waveform quality validation', () => {
	const sampleRate = 22050
	const samples = Array.from({ length: sampleRate }, (_, index) => {
		const envelope = Math.min(1, index / 800, (sampleRate - 1 - index) / 800)
		return Math.sin(2 * Math.PI * 220 * index / sampleRate) * 0.35 * Math.max(0, envelope)
	})
	const result = assertPcmWavQuality(wavFromSamples(samples, sampleRate))
	assert.equal(result.status, 'passed')
	assert.equal(result.format.sampleRate, sampleRate)
	assert.equal(result.findings.length, 0)
})

test('sustained full-scale clipping is a blocking TTS finding', () => {
	const samples = Array.from({ length: 22050 }, (_, index) => index % 4 < 2 ? 1 : -1)
	const result = analyzePcmWavQuality(wavFromSamples(samples))
	assert.equal(result.status, 'failed')
	assert.ok(result.findings.some(finding => finding.code === 'AUDIO_CLIPPING_DETECTED'))
	assert.throws(() => assertPcmWavQuality(wavFromSamples(samples)), error => error.code === 'TTS_AUDIO_QUALITY_FAILED' && error.details.status === 'failed')
})

test('repeated large non-clipped discontinuities are detected as crackle-like output', () => {
	const samples = Array.from({ length: 22050 }, (_, index) => index % 4 < 2 ? 0.8 : -0.8)
	const result = analyzePcmWavQuality(wavFromSamples(samples))
	assert.equal(result.status, 'failed')
	assert.ok(result.findings.some(finding => finding.code === 'AUDIO_DISCONTINUITY_DETECTED'))
})

test('provider crackle and near-clipping are repaired before the unchanged quality gate', () => {
	const samples = Array.from({ length: 22050 }, (_, index) => {
		const speech = Math.sin(2 * Math.PI * 220 * index / 22050) * 0.32
		return index % 97 === 0 ? (index % 194 === 0 ? 1 : -1) : speech
	})
	const source = wavFromSamples(samples)
	const before = analyzePcmWavQuality(source)
	assert.equal(before.status, 'failed')
	const repaired = repairPcmWavForNarration(source)
	assert.equal(repaired.changed, true)
	assert.ok(repaired.evidence.repairedSamples > 0)
	assert.ok(repaired.evidence.peakGain < 1)
	const after = assertPcmWavQuality(repaired.buffer)
	assert.notEqual(after.status, 'failed')
	assert.ok(after.metrics.peak <= 0.94)
	assert.ok(after.metrics.maximumStep <= 0.6201)
	assert.equal(repaired.buffer.length, source.length)
})
