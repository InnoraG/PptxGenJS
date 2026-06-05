import * as fs from 'node:fs/promises'

function readAscii(buffer, offset, length) {
	return buffer.subarray(offset, offset + length).toString('ascii')
}

export function parseWavDuration(buffer) {
	if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer)
	if (buffer.length < 12 || readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
		return null
	}

	let fmt = null
	let dataBytes = null
	let offset = 12
	while (offset + 8 <= buffer.length) {
		const id = readAscii(buffer, offset, 4)
		const size = buffer.readUInt32LE(offset + 4)
		const start = offset + 8
		const next = start + size + (size % 2)
		if (next > buffer.length + 1) break

		if (id === 'fmt ' && size >= 16 && start + 16 <= buffer.length) {
			fmt = {
				audioFormat: buffer.readUInt16LE(start),
				channels: buffer.readUInt16LE(start + 2),
				sampleRate: buffer.readUInt32LE(start + 4),
				bitsPerSample: buffer.readUInt16LE(start + 14),
			}
		} else if (id === 'data') {
			dataBytes = Math.min(size, Math.max(0, buffer.length - start))
		}
		offset = next
	}

	if (!fmt || dataBytes == null || fmt.audioFormat !== 1 || !fmt.channels || !fmt.sampleRate || !fmt.bitsPerSample) {
		return null
	}
	const bytesPerSecond = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8)
	if (!bytesPerSecond) return null
	return {
		...fmt,
		dataBytes,
		durationMs: Math.round((dataBytes / bytesPerSecond) * 1000),
	}
}

export async function wavDurationFromFile(filePath) {
	const buffer = await fs.readFile(filePath)
	return parseWavDuration(buffer)
}
