import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { pngDataUri, assertAllowedAvatarPath } from './artifacts.mjs'
import { avatarError } from './errors.mjs'

const execFileAsync = promisify(execFile)

function commandTimeoutMs() {
	return Math.max(1000, Number(process.env.BETTERPPTX_AVATAR_TIMEOUT_MS || 600000))
}

async function executableWorks(bin, args = ['-version']) {
	try {
		await execFileAsync(bin, args, { timeout: 8000, windowsHide: true })
		return true
	} catch {
		return false
	}
}

async function findBinary(envName, names, code) {
	const configured = String(process.env[envName] || '').trim()
	const candidates = configured ? [configured] : names
	for (const candidate of candidates) {
		if (await executableWorks(candidate)) return candidate
		if (process.platform === 'win32' && !candidate.toLowerCase().endsWith('.exe') && await executableWorks(`${candidate}.exe`)) return `${candidate}.exe`
	}
	throw avatarError(code, `${names[0]} is not configured.`)
}

export async function findFfmpeg() {
	const bundled = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
	return findBinary('BETTERPPTX_FFMPEG_PATH', [bundled, 'ffmpeg'], 'AVATAR_UNAVAILABLE')
}

export async function findFfprobe() {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
	const executable = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
	const bundled = path.join(root, 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, executable)
	const tempBundled = process.platform === 'win32'
		? path.join(process.env.TEMP || '', 'betterpptx-media-tools', 'node_modules', 'ffprobe-static', 'bin', 'win32', process.arch === 'ia32' ? 'ia32' : 'x64', executable)
		: path.join(process.env.TMPDIR || '/tmp', 'betterpptx-media-tools', 'node_modules', 'ffprobe-static', 'bin', process.platform, process.arch, executable)
	return findBinary('BETTERPPTX_FFPROBE_PATH', [bundled, tempBundled, 'ffprobe'], 'MEDIA_PROBE_FAILED')
}

function sanitizeCommandError(err, code, message) {
	const out = avatarError(code, message, {
		exitCode: err?.code && typeof err.code === 'number' ? err.code : undefined,
	})
	return out
}

async function runMediaCommand(bin, args, code, message) {
	try {
		return await execFileAsync(bin, args, {
			timeout: commandTimeoutMs(),
			maxBuffer: 4 * 1024 * 1024,
			windowsHide: true,
		})
	} catch (err) {
		throw sanitizeCommandError(err, code, message)
	}
}

export async function createStillVideoWithAudio({ imagePath, audioPath, outputPath, durationMs, fps = 25 } = {}) {
	const ffmpeg = await findFfmpeg()
	const inputImage = assertAllowedAvatarPath(imagePath, 'avatar image')
	const inputAudio = path.resolve(audioPath)
	const output = path.resolve(outputPath)
	await fs.mkdir(path.dirname(output), { recursive: true })
	const seconds = Math.max(0.1, Number(durationMs || 1000) / 1000)
	await runMediaCommand(ffmpeg, [
		'-y',
		'-loop', '1',
		'-framerate', String(Math.max(1, Math.round(Number(fps) || 25))),
		'-i', inputImage,
		'-i', inputAudio,
		'-t', String(seconds.toFixed(3)),
		'-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
		'-c:v', 'libx264',
		'-pix_fmt', 'yuv420p',
		'-c:a', 'aac',
		'-b:a', '160k',
		'-shortest',
		output,
	], 'MEDIA_NORMALIZE_FAILED', 'Avatar video could not be created.')
	return output
}

export async function normalizePowerPointMp4({ inputPath, outputPath, audioBitrate = '160k', maxSeconds, stripAudio = false } = {}) {
	const ffmpeg = await findFfmpeg()
	const input = path.resolve(inputPath)
	const output = path.resolve(outputPath)
	await fs.mkdir(path.dirname(output), { recursive: true })
	const args = [
		'-y',
		'-i', input,
		'-c:v', 'libx264',
		'-pix_fmt', 'yuv420p',
	]
	if (stripAudio) args.push('-an')
	else args.push('-c:a', 'aac', '-b:a', String(audioBitrate || '160k'))
	args.push('-movflags', '+faststart', output)
	await runMediaCommand(ffmpeg, args, 'MEDIA_NORMALIZE_FAILED', 'Avatar media could not be normalized for PowerPoint.')
	await assertPowerPointSafeMp4({ filePath: output, maxSeconds, requireAudio: !stripAudio })
	return output
}

export async function convertWavToM4a({ inputPath, outputPath, audioBitrate = '128k' } = {}) {
	const ffmpeg = await findFfmpeg()
	const input = path.resolve(inputPath)
	const output = path.resolve(outputPath)
	await fs.mkdir(path.dirname(output), { recursive: true })
	await runMediaCommand(ffmpeg, [
		'-y',
		'-i', input,
		'-c:a', 'aac',
		'-b:a', String(audioBitrate || '128k'),
		'-movflags', '+faststart',
		output,
	], 'MEDIA_NORMALIZE_FAILED', 'Audio could not be converted.')
	return output
}

export async function extractPosterPng({ inputPath, outputPath } = {}) {
	const ffmpeg = await findFfmpeg()
	const input = path.resolve(inputPath)
	const output = path.resolve(outputPath)
	await fs.mkdir(path.dirname(output), { recursive: true })
	await runMediaCommand(ffmpeg, [
		'-y',
		'-i', input,
		'-frames:v', '1',
		'-f', 'image2',
		output,
	], 'MEDIA_NORMALIZE_FAILED', 'Avatar poster could not be extracted.')
	return output
}

export async function coverDataUriFromPng({ posterPath } = {}) {
	const filePath = path.resolve(posterPath)
	if (!fsSync.existsSync(filePath)) throw avatarError('MEDIA_UNSUPPORTED_INPUT', 'Avatar poster is missing.')
	if (path.extname(filePath).toLowerCase() !== '.png') throw avatarError('MEDIA_UNSUPPORTED_INPUT', 'Avatar poster must be PNG.')
	return pngDataUri(await fs.readFile(filePath))
}

export async function probeMedia({ filePath } = {}) {
	const ffprobe = await findFfprobe()
	const target = path.resolve(filePath)
	const { stdout } = await runMediaCommand(ffprobe, [
		'-v', 'error',
		'-print_format', 'json',
		'-show_streams',
		'-show_format',
		target,
	], 'MEDIA_PROBE_FAILED', 'Avatar media could not be inspected.')
	try {
		return JSON.parse(stdout || '{}')
	} catch {
		throw avatarError('MEDIA_PROBE_FAILED', 'Avatar media probe returned invalid data.')
	}
}

export async function assertPowerPointSafeMp4({ filePath, maxSeconds, requireAudio = false } = {}) {
	const info = await probeMedia({ filePath })
	const streams = Array.isArray(info.streams) ? info.streams : []
	const video = streams.find(s => s.codec_type === 'video')
	const audio = streams.find(s => s.codec_type === 'audio')
	const duration = Number(info.format?.duration || video?.duration || audio?.duration || 0)
	const cap = Math.max(1, Number(maxSeconds || process.env.BETTERPPTX_AVATAR_MAX_SECONDS || 120))
	const issues = []
	if (!video) issues.push('missing_video')
	if (video && String(video.codec_name || '').toLowerCase() !== 'h264') issues.push('video_not_h264')
	if (video && String(video.pix_fmt || '').toLowerCase() !== 'yuv420p') issues.push('video_not_yuv420p')
	if (requireAudio && !audio) issues.push('missing_audio')
	if (audio && String(audio.codec_name || '').toLowerCase() !== 'aac') issues.push('audio_not_aac')
	if (!Number.isFinite(duration) || duration <= 0) issues.push('invalid_duration')
	if (duration > cap) issues.push('duration_exceeds_limit')
	if (issues.length) throw avatarError('MEDIA_PROBE_FAILED', 'Avatar media is not PowerPoint-safe.', { issues, durationSeconds: duration, maxSeconds: cap })
	return { ok: true, durationMs: Math.round(duration * 1000), video, audio: audio || null }
}
