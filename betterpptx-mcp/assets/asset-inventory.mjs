// Precomputed file inventory for a read-only asset bundle.
//
// In the cloud the catalogue roots (Microsoft Stock 3D, the open library) live
// in a Cloud Storage bucket mounted through Cloud Storage FUSE. There, every
// first-time existsSync/statSync is a network round trip, and the catalogue
// loader issues thousands of them (one per stock record row, model, preview
// and icon). The inventory answers those metadata questions from one JSON file
// written next to the bundle at publish time, so the first catalogue call per
// instance reads one file instead of walking the bucket. File CONTENTS are
// still read through the mount.
//
// Without an inventory file every call passes straight through to node:fs, so
// local checkouts behave exactly as before.

import * as path from 'node:path'

export const ASSET_INVENTORY_FILE = '.betterpptx-asset-inventory.json'
export const ASSET_INVENTORY_SCHEMA = 'betterpptx.asset-inventory.v1'

function toPosix(rel) {
	return rel.split(path.sep).join('/')
}

function enoent(syscall, file) {
	const err = new Error(`ENOENT: no such file or directory, ${syscall} '${file}'`)
	err.code = 'ENOENT'
	err.errno = -2
	err.syscall = syscall
	err.path = file
	return err
}

function dirent(name, isDir) {
	return { name, isFile: () => !isDir, isDirectory: () => isDir, isSymbolicLink: () => false }
}

function fileStat(bytes, mtimeMs) {
	const mtime = new Date(mtimeMs)
	return { size: bytes, mtimeMs, mtime, isFile: () => true, isDirectory: () => false }
}

function dirStat() {
	const mtime = new Date(0)
	return { size: 0, mtimeMs: 0, mtime, isFile: () => false, isDirectory: () => true }
}

// entries: iterable of { rel, bytes, mtimeMs }; rel is POSIX and relative to the bundle root.
export function buildAssetInventory(entries) {
	const files = {}
	for (const entry of entries) {
		const rel = toPosix(String(entry?.rel || '')).replace(/^\/+/, '')
		if (!rel || rel === ASSET_INVENTORY_FILE || rel.endsWith('/')) continue
		files[rel] = [Math.max(0, Number(entry.bytes) || 0), Math.max(0, Math.round(Number(entry.mtimeMs) || 0))]
	}
	const sorted = Object.fromEntries(Object.keys(files).sort().map(rel => [rel, files[rel]]))
	return { schema: ASSET_INVENTORY_SCHEMA, fileCount: Object.keys(sorted).length, files: sorted }
}

function indexInventory(doc) {
	if (doc?.schema !== ASSET_INVENTORY_SCHEMA || !doc.files || typeof doc.files !== 'object') return null
	const files = new Map()
	const dirs = new Map([['', new Map()]])
	for (const [rel, value] of Object.entries(doc.files)) {
		if (!Array.isArray(value)) continue
		files.set(rel, value)
		const parts = rel.split('/')
		let parent = ''
		for (let i = 0; i < parts.length; i += 1) {
			const isDir = i < parts.length - 1
			const children = dirs.get(parent)
			if (!children.has(parts[i])) children.set(parts[i], isDir)
			if (!isDir) break
			parent = parent ? `${parent}/${parts[i]}` : parts[i]
			if (!dirs.has(parent)) dirs.set(parent, new Map())
		}
	}
	return { files, dirs }
}

// Returns an fs-shaped facade (existsSync, statSync, readdirSync) for paths
// under `root`. The inventory is read lazily on the first call that needs it.
export function createAssetFs({ root, fs, inventoryPath = path.join(root, ASSET_INVENTORY_FILE) }) {
	const absRoot = path.resolve(root)
	let index
	function load() {
		if (index !== undefined) return index
		index = null
		try {
			index = indexInventory(JSON.parse(fs.readFileSync(inventoryPath, 'utf8')))
		} catch (_) {}
		return index
	}
	// Relative key for a path inside the bundle, or null when the facade should pass through.
	const rootPrefix = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep
	function keyFor(file) {
		if (typeof file !== 'string' || !file) return null
		const abs = path.resolve(file)
		if (abs !== absRoot && !abs.startsWith(rootPrefix)) return null
		if (!load()) return null
		return abs === absRoot ? '' : toPosix(abs.slice(rootPrefix.length))
	}
	return {
		get active() { return !!load() },
		existsSync(file) {
			const key = keyFor(file)
			if (key === null) return fs.existsSync(file)
			return index.files.has(key) || index.dirs.has(key)
		},
		statSync(file, options) {
			const key = keyFor(file)
			if (key === null) return fs.statSync(file, options)
			const hit = index.files.get(key)
			if (hit) return fileStat(hit[0], hit[1])
			if (index.dirs.has(key)) return dirStat()
			if (options?.throwIfNoEntry === false) return undefined
			throw enoent('stat', file)
		},
		readdirSync(dir, options) {
			const key = keyFor(dir)
			if (key === null) return fs.readdirSync(dir, options)
			const children = index.dirs.get(key)
			if (!children) throw enoent('scandir', dir)
			const names = [...children.keys()].sort()
			return options?.withFileTypes ? names.map(name => dirent(name, children.get(name))) : names
		},
	}
}
