import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { wavDurationFromFile, parseWavDuration } from './wavDuration.mjs'

const DEFAULT_ALLOWED_AUDIO_DIRS = [
	process.cwd(),
	path.resolve(process.env.BETTERPPTX_OUT_DIR || path.join(process.cwd(), 'outputs', 'narration')),
]

export function hashText(text) {
	return crypto.createHash('sha256').update(String(text || '')).digest('hex')
}

export function ensureDirSync(dir) {
	fsSync.mkdirSync(dir, { recursive: true })
}

export function narrationOutDir() {
	const dir = path.resolve(process.env.BETTERPPTX_OUT_DIR || path.join(process.cwd(), 'outputs', 'narration'))
	ensureDirSync(dir)
	return dir
}

export function parseDataUri(data) {
	const m = String(data || '').match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i)
	if (!m) return null
	const mime = m[1] || 'application/octet-stream'
	const ext = mime.includes('wav') ? 'wav'
		: mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
			: mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
				: 'bin'
	return { mime, ext, buffer: Buffer.from(m[2], 'base64') }
}

export function dataUriFromBuffer(buffer, mime = 'audio/wav') {
	return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`
}

export function assertAllowedAudioPath(filePath) {
	const resolved = path.resolve(filePath)
	const roots = String(process.env.BETTERPPTX_ALLOWED_AUDIO_DIRS || '')
		.split(path.delimiter)
		.filter(Boolean)
		.map(p => path.resolve(p))
	const allowed = roots.length ? roots : DEFAULT_ALLOWED_AUDIO_DIRS
	const ok = allowed.some(root => resolved === root || resolved.startsWith(root + path.sep))
	if (!ok) {
		throw new Error(`Audio path is outside allowed directories: ${resolved}`)
	}
	return resolved
}

export function writeToneWav(filePath, seconds = 1.4, frequency = 440) {
	const sampleRate = 22050
	const samples = Math.max(1, Math.floor(sampleRate * seconds))
	const data = Buffer.alloc(samples * 2)
	for (let i = 0; i < samples; i++) {
		const envelope = Math.min(1, i / (sampleRate * 0.08), (samples - i) / (sampleRate * 0.1))
		const value = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 10000 * Math.max(0, envelope))
		data.writeInt16LE(value, i * 2)
	}
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
	fsSync.writeFileSync(filePath, Buffer.concat([header, data]))
	return filePath
}

export async function writeAudioArtifact({ buffer, extn = 'wav', prefix = 'narration' }) {
	const dir = narrationOutDir()
	const safeExt = String(extn || 'wav').replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'wav'
	const filePath = path.join(dir, `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${safeExt}`)
	await fs.writeFile(filePath, buffer)
	return filePath
}

export async function measureAudioFile(filePath, explicitDurationMs) {
	if (explicitDurationMs !== undefined && explicitDurationMs !== null) {
		const durationMs = Math.round(Number(explicitDurationMs))
		if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error(`Invalid audio.durationMs: ${explicitDurationMs}`)
		return { durationMs, method: 'explicit' }
	}
	const wav = await wavDurationFromFile(filePath)
	if (wav) return { ...wav, method: 'wav' }
	throw new Error(`Cannot determine duration for non-WAV audio: ${filePath}. Provide audio.durationMs or install/use a WAV source.`)
}

export async function materializeAudioInput(audio = {}) {
	if (audio.path) {
		const filePath = assertAllowedAudioPath(audio.path)
		const extn = audio.extn || path.extname(filePath).slice(1) || 'wav'
		const measured = await measureAudioFile(filePath, audio.durationMs)
		return { filePath, extn, durationMs: measured.durationMs, measurement: measured.method, source: 'path' }
	}
	if (audio.data) {
		const parsed = parseDataUri(audio.data)
		if (!parsed) throw new Error('audio.data must be a base64 data URI')
		const filePath = await writeAudioArtifact({ buffer: parsed.buffer, extn: audio.extn || parsed.ext, prefix: 'external-audio' })
		const measured = parsed.ext === 'wav'
			? parseWavDuration(parsed.buffer)
			: null
		const durationMs = audio.durationMs || measured?.durationMs
		if (!durationMs) throw new Error('audio.durationMs is required for non-WAV audio.data')
		return { filePath, extn: audio.extn || parsed.ext, durationMs: Math.round(Number(durationMs)), measurement: measured ? 'wav' : 'explicit', source: 'data' }
	}
	throw new Error('audio requires path or data')
}
