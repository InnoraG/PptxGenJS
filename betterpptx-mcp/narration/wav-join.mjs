import { parseWavDuration } from './wavDuration.mjs'

function readAscii(buffer, offset, length) {
	return buffer.subarray(offset, offset + length).toString('ascii')
}

export function extractWavPcm(buffer) {
	if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer)
	const meta = parseWavDuration(buffer)
	if (!meta) return null
	let offset = 12
	let pcm = null
	while (offset + 8 <= buffer.length) {
		const id = readAscii(buffer, offset, 4)
		const size = buffer.readUInt32LE(offset + 4)
		const start = offset + 8
		const next = start + size + (size % 2)
		if (id === 'data') {
			pcm = buffer.subarray(start, start + Math.min(size, buffer.length - start))
			break
		}
		offset = next
	}
	if (!pcm) return null
	return { pcm, ...meta }
}

export function wrapPcmWav({ pcm, sampleRate = 22050, channels = 1, bitsPerSample = 16 }) {
	const dataBytes = pcm.length
	const byteRate = sampleRate * channels * (bitsPerSample / 8)
	const blockAlign = channels * (bitsPerSample / 8)
	const header = Buffer.alloc(44)
	header.write('RIFF', 0)
	header.writeUInt32LE(36 + dataBytes, 4)
	header.write('WAVE', 8)
	header.write('fmt ', 12)
	header.writeUInt32LE(16, 16)
	header.writeUInt16LE(1, 20)
	header.writeUInt16LE(channels, 22)
	header.writeUInt32LE(sampleRate, 24)
	header.writeUInt32LE(byteRate, 28)
	header.writeUInt16LE(blockAlign, 32)
	header.writeUInt16LE(bitsPerSample, 34)
	header.write('data', 36)
	header.writeUInt32LE(dataBytes, 40)
	return Buffer.concat([header, pcm])
}

export function silencePcm({ durationMs, sampleRate = 22050, channels = 1, bitsPerSample = 16 }) {
	const bytesPerSample = channels * (bitsPerSample / 8)
	const samples = Math.max(0, Math.round((Number(durationMs) || 0) * sampleRate / 1000))
	return Buffer.alloc(samples * bytesPerSample)
}

export function joinWavBuffers(buffers, { pauseMs = [] } = {}) {
	const parts = (buffers || []).map(extractWavPcm).filter(Boolean)
	if (!parts.length) return null
	const sampleRate = parts[0].sampleRate
	const channels = parts[0].channels
	const bitsPerSample = parts[0].bitsPerSample
	const chunks = []
	const timeline = []
	let cursorMs = 0
	for (let i = 0; i < parts.length; i += 1) {
		const part = parts[i]
		if (part.sampleRate !== sampleRate || part.channels !== channels || part.bitsPerSample !== bitsPerSample) {
			throw new Error('Cue-segment audio sample formats do not match; the engine will not mix incompatible clips.')
		}
		const gap = Number(pauseMs[i] || 0)
		if (gap > 0) {
			chunks.push(silencePcm({ durationMs: gap, sampleRate, channels, bitsPerSample }))
			cursorMs += gap
		}
		const startMs = cursorMs
		chunks.push(part.pcm)
		cursorMs += part.durationMs
		timeline.push({ index: i, audioStartMs: startMs, audioEndMs: cursorMs, durationMs: part.durationMs })
	}
	return {
		wav: wrapPcmWav({ pcm: Buffer.concat(chunks), sampleRate, channels, bitsPerSample }),
		sampleRate,
		timeline,
		durationMs: cursorMs,
	}
}
