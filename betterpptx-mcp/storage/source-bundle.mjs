import * as crypto from 'node:crypto'
import JSZip from 'jszip'

export const SOURCE_BUNDLE_SCHEMA_VERSION = 'betterpptx.bundle-manifest.v1'
export const SOURCE_BUNDLE_SOURCE_PATH = 'source/presentation.spec.json'

function stable(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stable)
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function canonicalJsonBytes(value) {
	return Buffer.from(JSON.stringify(stable(value)), 'utf8')
}

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function safeLogicalPath(value) {
	const name = String(value || '').replace(/\\/g, '/')
	const parts = name.split('/')
	if (!name || parts.length > 32 || name.startsWith('/') || /^[A-Za-z]:/.test(name) || parts.some(part => part === '..' || part === '')) {
		throw bundleError('BUNDLE_PATH_INVALID', 'The source bundle contains an unsafe logical path.')
	}
	return name
}

function bundleError(code, message, details = {}) {
	const error = new Error(message)
	error.code = code
	error.details = details
	return error
}

function extensionForHandle(handle) {
	const match = /^asset:\/\/locked\/[^/]+\/[a-f0-9]{64}(?:\.([a-z0-9]+))?$/i.exec(String(handle || ''))
	return (match?.[1] || 'bin').toLowerCase()
}

function logicalAssetPath(handle) {
	const match = /^asset:\/\/locked\/[^/]+\/([a-f0-9]{64})(?:\.([a-z0-9]+))?$/i.exec(String(handle || ''))
	if (!match) return null
	return `assets/${match[1].toLowerCase()}.${(match[2] || 'bin').toLowerCase()}`
}

function isRuntimeReference(value) {
	return /^(?:asset:\/\/(?!locked\/)|(?:model3d|stock|audio|video|texture):\/\/|(?:deck|operation|plan|session):\/\/)/i.test(String(value || ''))
}

function isRuntimeKey(key) {
	return new Set(['deckId', 'operationId', 'planId', 'sessionId', 'specHandle', 'downloadUrl', 'downloadPath', 'localPath', 'outputDir']).has(String(key))
}

async function transformSource(value, { resolveLockedAsset, assets, pointer = '$' } = {}) {
	if (typeof value === 'string') {
		const logical = logicalAssetPath(value)
		if (logical) {
			if (!assets.has(logical)) {
				if (typeof resolveLockedAsset !== 'function') throw bundleError('BUNDLE_ASSET_RESOLVER_MISSING', 'The bundle builder cannot resolve an embedded asset.')
				const filePath = await resolveLockedAsset(value)
				if (!filePath) throw bundleError('BUNDLE_ASSET_UNAVAILABLE', 'A source asset is unavailable for bundle export.', { pointer })
				const bytes = await resolveLockedAsset(value, { bytes: true, filePath })
				const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '')
				if (!buffer.length) throw bundleError('BUNDLE_ASSET_EMPTY', 'A source asset is empty and cannot be embedded.', { pointer, logicalPath: logical })
				assets.set(logical, { bytes: buffer, sha256: sha256(buffer), ext: extensionForHandle(value), sourceHandle: value })
			}
			return logical
		}
		if (isRuntimeReference(value)) throw bundleError('BUNDLE_RUNTIME_REFERENCE_FORBIDDEN', 'Runtime-only asset or session references cannot enter a portable source bundle.', { pointer })
		return value
	}
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) {
		return Promise.all(value.map((item, index) => transformSource(item, { resolveLockedAsset, assets, pointer: `${pointer}[${index}]` })))
	}
	const out = {}
	for (const [key, child] of Object.entries(value)) {
		if (isRuntimeKey(key) && child != null) throw bundleError('BUNDLE_RUNTIME_FIELD_FORBIDDEN', 'Runtime session fields cannot enter a portable source bundle.', { pointer: `${pointer}.${key}` })
		out[key] = await transformSource(child, { resolveLockedAsset, assets, pointer: `${pointer}.${key}` })
	}
	return out
}

function member(path, bytes, role, extra = {}) {
	return { path, role, type: path.endsWith('.json') ? 'json' : 'asset', sha256: sha256(bytes), bytes: bytes.length, ...extra }
}

export async function createSourceBundle(spec, { resolveLockedAsset, title = '', profile = 'source-only' } = {}) {
	if (!spec || typeof spec !== 'object' || Array.isArray(spec) || spec.schemaVersion !== 'betterpptx.deck-spec.v1') {
		throw bundleError('BUNDLE_SOURCE_INVALID', 'A betterpptx.deck-spec.v1 source object is required for bundle export.')
	}
	const assets = new Map()
	const sourceSpec = await transformSource(spec, { resolveLockedAsset, assets })
	const sourceBytes = canonicalJsonBytes(sourceSpec)
	const sourceDigest = sha256(sourceBytes)
	const members = [member(SOURCE_BUNDLE_SOURCE_PATH, sourceBytes, 'canonical-source', { schemaVersion: sourceSpec.schemaVersion })]
	const lock = {
		schemaVersion: 'betterpptx.bundle-lock.v1',
		canonicalizationVersion: 'betterpptx.canonical-json.v1',
		sourceDigest,
		assets: [...assets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, item]) => ({ path, sha256: item.sha256, bytes: item.bytes.length, embedded: true })),
	}
	const lockBytes = canonicalJsonBytes(lock)
	members.push(member('locks/source.lock.json', lockBytes, 'source-lock', { schemaVersion: lock.schemaVersion }))
	for (const [path, item] of [...assets.entries()].sort(([a], [b]) => a.localeCompare(b))) members.push(member(path, item.bytes, 'embedded-asset', { embedded: true }))
	const manifest = {
		schemaVersion: SOURCE_BUNDLE_SCHEMA_VERSION,
		bundleFormat: 'betterpptx',
		profile,
		canonicalizationVersion: 'betterpptx.canonical-json.v1',
		title: String(title || sourceSpec.title || 'BetterPPTX presentation'),
		portability: 'self-contained',
		entryPoints: { source: SOURCE_BUNDLE_SOURCE_PATH, lock: 'locks/source.lock.json' },
		source: { schemaVersion: sourceSpec.schemaVersion, sha256: sourceDigest, bytes: sourceBytes.length },
		members,
		requiredCapabilities: [],
		forbiddenRuntimeFields: ['asset://generated', 'asset://catalog', 'deckId', 'operationId', 'planId', 'sessionId', 'downloadUrl', 'localPath'],
	}
	const manifestBytes = canonicalJsonBytes(manifest)
	const zip = new JSZip()
	const fixedDate = new Date(0)
	zip.file('manifest.json', manifestBytes, { date: fixedDate, createFolders: false })
	zip.file(SOURCE_BUNDLE_SOURCE_PATH, sourceBytes, { date: fixedDate, createFolders: false })
	zip.file('locks/source.lock.json', lockBytes, { date: fixedDate, createFolders: false })
	for (const [path, item] of [...assets.entries()].sort(([a], [b]) => a.localeCompare(b))) zip.file(path, item.bytes, { date: fixedDate, createFolders: false })
	const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'DOS', streamFiles: false })
	return { bytes, manifest, sourceSpec, sourceDigest, bundleSha256: sha256(bytes), memberCount: members.length + 1 }
}

async function readZipEntries(bytes, { maxEntries = 2048, maxBytes = 128 * 1048576 } = {}) {
	let zip
	try { zip = await JSZip.loadAsync(bytes, { createFolders: false, checkCRC32: true }) } catch (error) {
		throw bundleError('BUNDLE_ZIP_INVALID', 'The source bundle is not a valid ZIP archive.', { reason: String(error?.message || error) })
	}
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	if (names.length > maxEntries) throw bundleError('BUNDLE_TOO_MANY_MEMBERS', 'The source bundle contains too many members.')
	const contents = new Map()
	let total = 0
	for (const rawName of names) {
		const name = safeLogicalPath(rawName)
		const data = await zip.file(rawName).async('nodebuffer')
		total += data.length
		if (total > maxBytes) throw bundleError('BUNDLE_TOO_LARGE', 'The source bundle expands beyond the allowed size.')
		contents.set(name, data)
	}
	return { contents, totalBytes: total }
}

export async function inspectSourceBundle(bytes, options = {}) {
	const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '')
	const { contents, totalBytes } = await readZipEntries(buffer, options)
	const manifestBytes = contents.get('manifest.json')
	if (!manifestBytes) throw bundleError('BUNDLE_MANIFEST_MISSING', 'The source bundle is missing manifest.json.')
	let manifest
	try { manifest = JSON.parse(manifestBytes.toString('utf8')) } catch (error) { throw bundleError('BUNDLE_MANIFEST_INVALID', 'The source bundle manifest is not valid JSON.', { reason: String(error?.message || error) }) }
	if (manifest?.schemaVersion !== SOURCE_BUNDLE_SCHEMA_VERSION || manifest?.bundleFormat !== 'betterpptx') throw bundleError('BUNDLE_SCHEMA_UNSUPPORTED', 'The source bundle manifest schema is unsupported.')
	if (!Array.isArray(manifest.members) || !manifest.source?.sha256) throw bundleError('BUNDLE_MANIFEST_INVALID', 'The source bundle manifest is incomplete.')
	for (const entry of manifest.members) {
		const path = safeLogicalPath(entry.path)
		const data = contents.get(path)
		if (!data) throw bundleError('BUNDLE_MEMBER_MISSING', 'A manifest member is missing from the source bundle.', { path })
		if (Number(entry.bytes) !== data.length || String(entry.sha256 || '').toLowerCase() !== sha256(data)) throw bundleError('BUNDLE_MEMBER_DIGEST_MISMATCH', 'A source bundle member failed digest verification.', { path })
	}
	const declaredPaths = new Set(['manifest.json', ...manifest.members.map(entry => safeLogicalPath(entry.path))])
	for (const path of contents.keys()) if (!declaredPaths.has(path)) throw bundleError('BUNDLE_UNDECLARED_MEMBER', 'The source bundle contains a member not declared by its manifest.', { path })
	const sourcePath = manifest.entryPoints?.source || SOURCE_BUNDLE_SOURCE_PATH
	const sourceBytes = contents.get(sourcePath)
	if (!sourceBytes || sha256(sourceBytes) !== String(manifest.source.sha256).toLowerCase()) throw bundleError('BUNDLE_SOURCE_DIGEST_MISMATCH', 'The canonical source member failed digest verification.')
	let sourceSpec
	try { sourceSpec = JSON.parse(sourceBytes.toString('utf8')) } catch (error) { throw bundleError('BUNDLE_SOURCE_INVALID', 'The canonical source member is not valid JSON.', { reason: String(error?.message || error) }) }
	if (!sourceSpec || sourceSpec.schemaVersion !== 'betterpptx.deck-spec.v1' || !Array.isArray(sourceSpec.slides)) throw bundleError('BUNDLE_SOURCE_INVALID', 'The canonical source member is not a betterpptx.deck-spec.v1 spec.')
	if (!canonicalJsonBytes(sourceSpec).equals(sourceBytes)) throw bundleError('BUNDLE_SOURCE_NOT_CANONICAL', 'The source member digest is valid but its JSON is not in canonical form.')
	return { manifest, sourceSpec, contents, totalBytes, bundleSha256: sha256(buffer), sourceDigest: sha256(sourceBytes) }
}

export async function importSourceBundle(bytes, { lockAsset, ...options } = {}) {
	const inspected = await inspectSourceBundle(bytes, options)
	const logicalToHandle = new Map()
	for (const entry of inspected.manifest.members.filter(item => item.role === 'embedded-asset')) {
		const data = inspected.contents.get(entry.path)
		if (typeof lockAsset !== 'function') throw bundleError('BUNDLE_ASSET_IMPORT_UNAVAILABLE', 'The source bundle importer cannot bind embedded assets.')
		logicalToHandle.set(entry.path, await lockAsset(data, entry.path))
	}
	const rebind = value => {
		if (typeof value === 'string') return logicalToHandle.get(value) || value
		if (Array.isArray(value)) return value.map(rebind)
		if (!value || typeof value !== 'object') return value
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rebind(child)]))
	}
	return {
		...inspected,
		reboundSpec: rebind(inspected.sourceSpec),
		boundAssetCount: logicalToHandle.size,
	}
}
