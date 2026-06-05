import * as crypto from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

export class ArtifactStoreConfigError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'ArtifactStoreConfigError'
		this.code = code
		this.details = details
	}
}

function artifactStoreProvider() {
	return String(process.env.BETTERPPTX_ARTIFACT_STORE || 'local').trim().toLowerCase()
}

function requireSharedStores() {
	return process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1'
}

export function safeArtifactName(name) {
	const b = path.basename(String(name || 'betterpptx.pptx')).replace(/[^A-Za-z0-9._() -]/g, '_')
	const lower = b.toLowerCase()
	return lower.endsWith('.pptx') || lower.endsWith('.pptm') ? b : `${b}.pptx`
}

async function directoryBytes(root) {
	let total = 0
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const p = path.join(root, entry.name)
		if (entry.isDirectory()) total += await directoryBytes(p)
		else {
			try { total += (await fs.stat(p)).size } catch {}
		}
	}
	return total
}

function assertSupportedProvider(provider) {
	if (provider === 'local' || provider === 'gcs') return
	throw new ArtifactStoreConfigError(
		'ARTIFACT_STORE_PROVIDER_UNAVAILABLE',
		`Artifact store provider "${provider}" is not available in this build. Configure BETTERPPTX_ARTIFACT_STORE=local for local dev or BETTERPPTX_ARTIFACT_STORE=gcs for production.`,
		{ provider },
	)
}

function normalizePrefix(value) {
	return String(value || 'betterpptx-artifacts')
		.replace(/\\/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.replace(/[^A-Za-z0-9._/-]/g, '_') || 'betterpptx-artifacts'
}

function contentDisposition(name) {
	const safe = safeArtifactName(name).replace(/[\r\n"]/g, '_')
	return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

function contentTypeFor(name) {
	const lower = String(name || '').toLowerCase()
	if (lower.endsWith('.pptm')) return 'application/vnd.ms-powerpoint.presentation.macroEnabled.12'
	return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

let storageClientPromise = null
async function getStorageClient() {
	if (!storageClientPromise) {
		storageClientPromise = import('@google-cloud/storage')
			.then(({ Storage }) => new Storage({
				projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
			}))
			.catch(err => {
				throw new ArtifactStoreConfigError(
					'GCS_CLIENT_UNAVAILABLE',
					'Google Cloud Storage adapter requires @google-cloud/storage and application-default/workload-identity credentials.',
					{ reason: err?.message || String(err) },
				)
			})
	}
	return storageClientPromise
}

function createGcsArtifactStore({ budgetBytes = 2048 * 1048576 } = {}) {
	const provider = 'gcs'
	const bucketName = String(process.env.BETTERPPTX_GCS_BUCKET || process.env.BETTERPPTX_ARTIFACT_BUCKET || '').trim()
	if (!bucketName) {
		throw new ArtifactStoreConfigError(
			'GCS_BUCKET_MISSING',
			'BETTERPPTX_ARTIFACT_STORE=gcs requires BETTERPPTX_GCS_BUCKET.',
			{ provider },
		)
	}
	const prefix = normalizePrefix(process.env.BETTERPPTX_GCS_PREFIX)
	const tempRoot = path.resolve(process.env.BETTERPPTX_GCS_TEMP_ROOT || path.join(os.tmpdir(), 'betterpptx-gcs-artifacts'))
	const maxBytes = Math.max(0, Number(budgetBytes) || 0)

	async function prepareSaveTarget({ fileName, deckId } = {}) {
		const downloadName = safeArtifactName(fileName || `betterpptx_${deckId || 'deck'}.pptx`)
		const token = crypto.randomBytes(18).toString('base64url')
		const objectName = `${prefix}/${new Date().toISOString().slice(0, 10)}/${token}/${downloadName}`
		const tempDir = path.join(tempRoot, token)
		await fs.mkdir(tempDir, { recursive: true })
		return {
			provider,
			shared: true,
			remote: true,
			target: path.join(tempDir, downloadName),
			downloadUrl: null,
			downloadName,
			objectName,
			expiresAt: new Date(Date.now() + artifactTtlMs()).toISOString(),
			contentType: contentTypeFor(downloadName),
			cleanupTarget: true,
		}
	}

	async function finalizeSaveTarget(artifact) {
		const storage = await getStorageClient()
		const bucket = storage.bucket(bucketName)
		await bucket.upload(artifact.target, {
			destination: artifact.objectName,
			resumable: false,
			metadata: {
				contentType: artifact.contentType || contentTypeFor(artifact.downloadName),
				cacheControl: 'private, max-age=0, no-store',
				metadata: {
					product: 'BetterPPTX',
					artifact: 'presentation',
				},
			},
		})
		const file = bucket.file(artifact.objectName)
		const [downloadUrl] = await file.getSignedUrl({
			version: 'v4',
			action: 'read',
			expires: Date.now() + artifactTtlMs(),
			responseDisposition: contentDisposition(artifact.downloadName),
			responseType: artifact.contentType || contentTypeFor(artifact.downloadName),
		})
		if (artifact.cleanupTarget) {
			try { await fs.rm(path.dirname(artifact.target), { recursive: true, force: true }) } catch {}
		}
		return { ...artifact, downloadUrl, localPathAvailable: false }
	}

	return {
		provider,
		shared: true,
		get base() { return '' },
		get root() { return '' },
		get budgetBytes() { return maxBytes },
		configure() { return this.describe() },
		describe() {
			return { provider, shared: true, bucketConfigured: true, prefix, budgetBytes: maxBytes, ttlMs: artifactTtlMs() }
		},
		prepareSaveTarget,
		finalizeSaveTarget,
		enforceBudget: async () => {},
		resolveLocalDownload: () => null,
		sweepExpired: async () => 0,
	}
}

export function createArtifactStore({ base = '', root = '', budgetBytes = 2048 * 1048576 } = {}) {
	const provider = artifactStoreProvider()
	assertSupportedProvider(provider)
	if (provider === 'gcs') return createGcsArtifactStore({ budgetBytes })
	if (requireSharedStores()) {
		throw new ArtifactStoreConfigError(
			'ARTIFACT_STORE_NOT_SHARED',
			'Local artifact storage is not allowed when BETTERPPTX_REQUIRE_SHARED_STORES=1. Configure a shared object-store adapter before running multiple production instances.',
			{ provider },
		)
	}

	let publicBase = String(base || '').replace(/\/+$/, '')
	let publicRoot = root ? path.resolve(root) : ''
	const maxBytes = Math.max(0, Number(budgetBytes) || 0)

	async function enforceBudget(incomingBytes = 0) {
		if (!publicRoot || !maxBytes) return
		let entries
		try { entries = await fs.readdir(publicRoot, { withFileTypes: true }) } catch { return }
		const dirs = []
		let total = 0
		for (const e of entries) {
			if (!e.isDirectory()) continue
			const dp = path.join(publicRoot, e.name)
			let size = 0
			let mtime = 0
			try {
				const st = await fs.stat(dp)
				mtime = st.mtimeMs
				size = await directoryBytes(dp)
			} catch {
				continue
			}
			total += size
			dirs.push({ dp, mtime, size })
		}
		let projected = total + Math.max(0, Number(incomingBytes) || 0)
		if (projected <= maxBytes) return
		dirs.sort((a, b) => a.mtime - b.mtime)
		for (const d of dirs) {
			if (projected <= maxBytes) break
			try {
				await fs.rm(d.dp, { recursive: true, force: true })
				projected -= d.size
			} catch {}
		}
	}

	async function prepareSaveTarget({ fileName, outputDir, deckId } = {}) {
		if (publicBase && publicRoot) {
			const downloadName = safeArtifactName(fileName || `betterpptx_${deckId || 'deck'}.pptx`)
			const token = crypto.randomBytes(18).toString('base64url')
			await enforceBudget()
			const dir = path.join(publicRoot, token)
			await fs.mkdir(dir, { recursive: true })
			return {
				provider,
				shared: false,
				remote: true,
				target: path.join(dir, downloadName),
				downloadUrl: `${publicBase}/files/${token}/${encodeURIComponent(downloadName)}`,
				downloadName,
				objectName: `${token}/${downloadName}`,
				expiresAt: new Date(Date.now() + artifactTtlMs()).toISOString(),
			}
		}

		const rawName = fileName || `betterpptx_${deckId || 'deck'}.pptx`
		const isAbs = path.isAbsolute(rawName)
		const baseName = safeArtifactName(rawName)
		const relativeDir = path.dirname(rawName)
		const relativeTarget = relativeDir && relativeDir !== '.' ? path.join(relativeDir, baseName) : baseName
		const target = isAbs ? path.resolve(path.dirname(rawName), baseName) : path.resolve(outputDir || process.cwd(), relativeTarget)
		await fs.mkdir(path.dirname(target), { recursive: true })
		return {
			provider,
			shared: false,
			remote: false,
			target,
			downloadUrl: null,
			downloadName: null,
			objectName: path.basename(target),
			expiresAt: null,
		}
	}

	function resolveLocalDownload({ token, name } = {}) {
		if (!publicRoot) return null
		const safeToken = String(token || '')
		const safeName = String(name || '')
		if (!/^[A-Za-z0-9_-]{6,}$/.test(safeToken) || !/^[A-Za-z0-9._() -]+$/.test(safeName) || safeName.includes('..')) return null
		const rootResolved = path.resolve(publicRoot)
		const resolved = path.resolve(rootResolved, safeToken, safeName)
		if (resolved !== path.join(rootResolved, safeToken, safeName)) return null
		return resolved
	}

	async function sweepExpired({ ttlMs = artifactTtlMs() } = {}) {
		if (!publicRoot) return 0
		let removed = 0
		try {
			for (const dir of await fs.readdir(publicRoot, { withFileTypes: true })) {
				if (!dir.isDirectory()) continue
				const p = path.join(publicRoot, dir.name)
				try {
					if (Date.now() - (await fs.stat(p)).mtimeMs > ttlMs) {
						await fs.rm(p, { recursive: true, force: true })
						removed += 1
					}
				} catch {}
			}
		} catch {}
		return removed
	}

	return {
		provider,
		shared: false,
		get base() { return publicBase },
		get root() { return publicRoot },
		get budgetBytes() { return maxBytes },
		configure({ base: nextBase, root: nextRoot } = {}) {
			if (nextBase !== undefined) publicBase = String(nextBase || '').replace(/\/+$/, '')
			if (nextRoot !== undefined) publicRoot = nextRoot ? path.resolve(nextRoot) : ''
			return this.describe()
		},
		describe() {
			return { provider, shared: false, base: publicBase, root: publicRoot, budgetBytes: maxBytes, ttlMs: artifactTtlMs() }
		},
		prepareSaveTarget,
		finalizeSaveTarget: async artifact => artifact,
		enforceBudget,
		resolveLocalDownload,
		sweepExpired,
	}
}

export function artifactTtlMs() {
	return Math.max(60 * 1000, Number(process.env.BETTERPPTX_ARTIFACT_TTL_MS || 12 * 60 * 60 * 1000) || 12 * 60 * 60 * 1000)
}
