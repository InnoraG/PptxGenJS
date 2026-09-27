import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { avatarError } from '../errors.mjs'

const execFileAsync = promisify(execFile)

function commandTimeoutMs() {
	return Math.max(1000, Number(process.env.BETTERPPTX_AVATAR_TIMEOUT_MS || 600000))
}

function jsonArrayEnv(name) {
	const raw = String(process.env[name] || '').trim()
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
	} catch {
		throw avatarError('AVATAR_UNAVAILABLE', `${name} must be a JSON array.`)
	}
}

async function newestMp4(root) {
	const stack = [path.resolve(root)]
	const found = []
	while (stack.length) {
		const dir = stack.pop()
		let entries = []
		try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { continue }
		for (const entry of entries) {
			const p = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				stack.push(p)
				continue
			}
			if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.mp4') continue
			try {
				const st = await fs.stat(p)
				if (st.size > 0) found.push({ path: p, mtimeMs: st.mtimeMs })
			} catch {}
		}
	}
	found.sort((a, b) => b.mtimeMs - a.mtimeMs)
	return found[0]?.path || null
}

export async function renderSadTalkerCli({ avatarImagePath, audioPath, jobDir, quality = 'default' } = {}) {
	const repoDir = String(process.env.BETTERPPTX_SADTALKER_DIR || '').trim()
	const entrypoint = String(process.env.BETTERPPTX_SADTALKER_ENTRYPOINT || '').trim() || (repoDir ? path.join(repoDir, 'inference.py') : '')
	if (!entrypoint || !fsSync.existsSync(entrypoint)) {
		throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker is not configured.')
	}
	const resultDir = path.join(jobDir, 'sadtalker-result')
	await fs.mkdir(resultDir, { recursive: true })
	const python = String(process.env.BETTERPPTX_SADTALKER_PYTHON || process.env.BETTERPPTX_PYTHON || 'python3').trim()
	const preprocess = String(process.env.BETTERPPTX_SADTALKER_PREPROCESS || (quality === 'fast' ? 'crop' : 'full')).trim()
	const args = [
		entrypoint,
		'--source_image', path.resolve(avatarImagePath),
		'--driven_audio', path.resolve(audioPath),
		'--result_dir', resultDir,
		'--preprocess', preprocess,
	]
	if (process.env.BETTERPPTX_SADTALKER_STILL !== '0') args.push('--still')
	const enhancer = String(process.env.BETTERPPTX_SADTALKER_ENHANCER || '').trim()
	if (enhancer && enhancer.toLowerCase() !== 'none') args.push('--enhancer', enhancer)
	args.push(...jsonArrayEnv('BETTERPPTX_SADTALKER_ARGS_JSON'))
	try {
		await execFileAsync(python, args, {
			cwd: repoDir || path.dirname(entrypoint),
			timeout: commandTimeoutMs(),
			maxBuffer: 8 * 1024 * 1024,
			windowsHide: true,
		})
	} catch (err) {
		throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker failed to produce video.', {
			exitCode: typeof err?.code === 'number' ? err.code : undefined,
		})
	}
	const rawVideoPath = await newestMp4(resultDir)
	if (!rawVideoPath) throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker did not return video.')
	return {
		ok: true,
		rawVideoPath,
		warnings: [],
	}
}
