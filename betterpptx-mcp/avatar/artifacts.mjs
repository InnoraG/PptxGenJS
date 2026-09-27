import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDataUri, dataUriFromBuffer } from '../narration/audio.mjs'
import { avatarError } from './errors.mjs'

const DEFAULT_ALLOWED_IMAGE_DIRS = [
	process.cwd(),
	path.resolve(process.env.BETTERPPTX_OUT_DIR || path.join(process.cwd(), 'outputs')),
	path.resolve(process.env.BETTERPPTX_AVATAR_CACHE_DIR || path.join(process.cwd(), 'outputs', 'avatar-cache')),
]

export const AVATAR_DIR = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_AVATAR_PATH = path.resolve(AVATAR_DIR, 'assets', 'default-presenter.png')
export const DEFAULT_AVATAR_META_PATH = path.resolve(AVATAR_DIR, 'assets', 'default-presenter.meta.json')

export function avatarOutRoot() {
	const root = path.resolve(process.env.BETTERPPTX_AVATAR_CACHE_DIR || path.join(process.cwd(), 'outputs', 'avatar-narration'))
	fsSync.mkdirSync(root, { recursive: true })
	return root
}

export function safeAvatarProviderName(value) {
	return String(value || 'test-static').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'test-static'
}

export function assertAllowedAvatarPath(filePath, kind = 'avatar artifact') {
	const resolved = path.resolve(filePath)
	const roots = String(process.env.BETTERPPTX_ALLOWED_AVATAR_DIRS || '')
		.split(path.delimiter)
		.filter(Boolean)
		.map(p => path.resolve(p))
	const allowed = roots.length ? roots : DEFAULT_ALLOWED_IMAGE_DIRS
	const ok = allowed.some(root => resolved === root || resolved.startsWith(root + path.sep))
	if (!ok) throw avatarError('MEDIA_UNSUPPORTED_INPUT', `${kind} is outside allowed directories.`)
	return resolved
}

export async function fileSha256(filePath) {
	const hash = crypto.createHash('sha256')
	hash.update(await fs.readFile(filePath))
	return hash.digest('hex')
}

export async function makeAvatarJobDir(prefix = 'avatar') {
	const root = avatarOutRoot()
	await sweepAvatarArtifacts()
	const dir = path.join(root, `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`)
	await fs.mkdir(dir, { recursive: true })
	return dir
}

export async function resolveAvatarImage(avatar = {}) {
	const source = avatar?.source || 'default'
	if (source === 'default' || !source) {
		const configured = process.env.BETTERPPTX_AVATAR_DEFAULT_IMAGE
		const filePath = configured ? assertAllowedAvatarPath(configured, 'default avatar image') : DEFAULT_AVATAR_PATH
		if (!fsSync.existsSync(filePath)) throw avatarError('AVATAR_UNAVAILABLE', 'Default avatar image is unavailable.')
		return { filePath, source: 'default', hash: await fileSha256(filePath) }
	}
	if (source !== 'uploaded') throw avatarError('MEDIA_UNSUPPORTED_INPUT', 'Unsupported avatar source.')
	if (avatar.consentAffirmed !== true) throw avatarError('AVATAR_CONSENT_REQUIRED', 'Uploaded avatar images require consentAffirmed=true.')
	const image = avatar.image || {}
	if (image.path) {
		const filePath = assertAllowedAvatarPath(image.path, 'uploaded avatar image')
		return { filePath, source: 'uploaded', hash: await fileSha256(filePath) }
	}
	if (image.data) {
		const parsed = parseDataUri(image.data)
		if (!parsed || !String(parsed.mime || '').toLowerCase().startsWith('image/')) {
			throw avatarError('MEDIA_UNSUPPORTED_INPUT', 'avatar.image.data must be an image data URI.')
		}
		const maxBytes = Math.max(1, Number(process.env.BETTERPPTX_AVATAR_MAX_PAYLOAD_MB || 64)) * 1048576
		if (parsed.buffer.length > maxBytes) throw avatarError('MEDIA_UNSUPPORTED_INPUT', 'Uploaded avatar image is too large.')
		const ext = parsed.mime.includes('png') ? 'png' : parsed.mime.includes('jpeg') || parsed.mime.includes('jpg') ? 'jpg' : parsed.ext || 'img'
		const dir = await makeAvatarJobDir('avatar-upload')
		const filePath = path.join(dir, `avatar.${ext}`)
		await fs.writeFile(filePath, parsed.buffer)
		return { filePath, source: 'uploaded', hash: await fileSha256(filePath) }
	}
	throw avatarError('MEDIA_UNSUPPORTED_INPUT', 'Uploaded avatar requires image.data or maintainer-local image.path.')
}

export function pngDataUri(buffer) {
	return dataUriFromBuffer(buffer, 'image/png')
}

async function directoryBytes(root) {
	let total = 0
	let entries = []
	try { entries = await fs.readdir(root, { withFileTypes: true }) } catch { return 0 }
	for (const entry of entries) {
		const p = path.join(root, entry.name)
		try {
			if (entry.isDirectory()) total += await directoryBytes(p)
			else total += (await fs.stat(p)).size
		} catch {}
	}
	return total
}

export async function sweepAvatarArtifacts() {
	const root = avatarOutRoot()
	const ttlMs = Math.max(60 * 1000, Number(process.env.BETTERPPTX_AVATAR_JOB_TTL_MS || 86400000))
	const maxBytes = Math.max(0, Number(process.env.BETTERPPTX_AVATAR_JOB_MAX_MB || 20480)) * 1048576
	let entries = []
	try { entries = await fs.readdir(root, { withFileTypes: true }) } catch { return { removed: 0 } }
	const dirs = []
	let removed = 0
	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		const p = path.join(root, entry.name)
		try {
			const st = await fs.stat(p)
			const size = await directoryBytes(p)
			dirs.push({ p, mtime: st.mtimeMs, size })
			if (Date.now() - st.mtimeMs > ttlMs) {
				await fs.rm(p, { recursive: true, force: true })
				removed++
			}
		} catch {}
	}
	if (!maxBytes) return { removed }
	let total = dirs.reduce((sum, d) => sum + d.size, 0)
	for (const d of dirs.sort((a, b) => a.mtime - b.mtime)) {
		if (total <= maxBytes) break
		try {
			await fs.rm(d.p, { recursive: true, force: true })
			total -= d.size
			removed++
		} catch {}
	}
	return { removed }
}

export function consentAuditHash({ sessionId = '', deckId = '', imageHash = '' } = {}) {
	return crypto.createHash('sha256')
		.update(`${sessionId}\0${deckId}\0${imageHash}\0${new Date().toISOString().slice(0, 10)}`)
		.digest('hex')
}
