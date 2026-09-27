import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { avatarOutRoot, fileSha256 } from './artifacts.mjs'

export function avatarCacheRoot() {
	const root = path.resolve(process.env.BETTERPPTX_AVATAR_CACHE_DIR || path.join(avatarOutRoot(), 'cache'))
	fsSync.mkdirSync(root, { recursive: true })
	return root
}

export function avatarCacheKey(parts = {}) {
	return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

async function copyIfPresent(src, dest) {
	if (!src) return null
	await fs.mkdir(path.dirname(dest), { recursive: true })
	await fs.copyFile(src, dest)
	return dest
}

export async function lookupAvatarCache(key) {
	const dir = path.join(avatarCacheRoot(), key)
	const metaPath = path.join(dir, 'metadata.json')
	try {
		const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
		if (!meta.normalizedVideoPath || !fsSync.existsSync(meta.normalizedVideoPath)) return null
		await fs.utimes(dir, new Date(), new Date()).catch(() => {})
		return { ...meta, cacheHit: true }
	} catch {
		return null
	}
}

export async function storeAvatarCache(key, result = {}) {
	const dir = path.join(avatarCacheRoot(), key)
	await fs.mkdir(dir, { recursive: true })
	const normalizedVideoPath = await copyIfPresent(result.normalizedVideoPath, path.join(dir, 'avatar-powerpoint.mp4'))
	const posterPath = await copyIfPresent(result.posterPath, path.join(dir, 'poster.png'))
	const meta = {
		key,
		normalizedVideoPath,
		posterPath,
		coverDataUri: result.coverDataUri,
		durationMs: result.durationMs,
		extn: 'mp4',
		createdAt: new Date().toISOString(),
		videoHash: normalizedVideoPath ? await fileSha256(normalizedVideoPath) : null,
	}
	await fs.writeFile(path.join(dir, 'metadata.json'), JSON.stringify(meta, null, 2))
	await enforceAvatarCacheBudget()
	return { ...meta, cacheHit: false }
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

export async function enforceAvatarCacheBudget() {
	const root = avatarCacheRoot()
	const maxBytes = Math.max(0, Number(process.env.BETTERPPTX_AVATAR_CACHE_MAX_MB || 10240)) * 1048576
	if (!maxBytes) return { removed: 0 }
	const dirs = []
	let total = 0
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const p = path.join(root, entry.name)
		try {
			const st = await fs.stat(p)
			const size = await directoryBytes(p)
			total += size
			dirs.push({ p, size, mtime: st.mtimeMs })
		} catch {}
	}
	let removed = 0
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
