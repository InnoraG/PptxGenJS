import * as crypto from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'

import { recordResourceUsage } from '../billing/resource-meter.mjs'
import { currentResourceOwner, resourceAuthorizationActive, resourceOwnerForContext, resourceOwnerOf } from '../auth/resource-authorization.mjs'

const LOCAL_OWNER_FILE = '.owner.json'
const LOCAL_OWNER_SCHEMA = 'betterpptx.local-artifact-owner.v1'
const LOCAL_BROWSER_KEY_FILE = '.browser-download.key'
const DEFAULT_ARTIFACT_TTL_MS = 12 * 60 * 60 * 1000
const BROWSER_DOWNLOAD_TTL_MS = DEFAULT_ARTIFACT_TTL_MS

export function isPermittedBrowserGrantQuery(query) {
	if (!query || typeof query !== 'object' || Array.isArray(query)
		|| typeof query.permit !== 'string') return false
	const keys = Object.keys(query)
	return keys.every(key => key === 'permit' || key === 'utm_source')
		&& (query.utm_source === undefined || query.utm_source === 'chatgpt.com')
}

export function isPermittedCloudArtifactQuery(search) {
	return search === '' || search === '?utm_source=chatgpt.com'
}

function localArtifactPaths(root, token, name) {
	if (typeof root !== 'string' || !root || typeof token !== 'string' || typeof name !== 'string'
		|| !/^[A-Za-z0-9_-]{24}$/.test(token) || !/^[A-Za-z0-9._() -]+$/.test(name)
		|| name.startsWith('.') || name.includes('..') || name.endsWith('.') || name.endsWith(' ')) return null
	const resolvedRoot = path.resolve(root)
	const directory = path.join(resolvedRoot, token)
	return { root: resolvedRoot, directory, target: path.join(directory, name), ownerFile: path.join(directory, LOCAL_OWNER_FILE) }
}

// Check every ancestor, including the configured root: a safe basename alone
// does not prevent traversal through a symlink or Windows directory junction.
function assertRealDirectory(directory) {
	let current = path.parse(directory).root
	for (const component of path.relative(current, directory).split(path.sep).filter(Boolean)) {
		current = path.join(current, component)
		const stat = lstatSync(current)
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe artifact directory.')
	}
}

function readLocalOwnerFile(directory) {
	assertRealDirectory(directory)
	const ownerFile = path.join(directory, LOCAL_OWNER_FILE)
	const sidecar = lstatSync(ownerFile)
	if (!sidecar.isFile() || sidecar.isSymbolicLink() || sidecar.size > 16384) return null
	const fd = openSync(ownerFile, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
	let record
	try {
		const opened = fstatSync(fd)
		if (!opened.isFile() || opened.size > 16384 || opened.dev !== sidecar.dev || opened.ino !== sidecar.ino) return null
		record = JSON.parse(readFileSync(fd, 'utf8'))
	} finally { closeSync(fd) }
	return record
}

function readLocalArtifactOwner(paths, token, name) {
	assertRealDirectory(paths.directory)
	const artifact = lstatSync(paths.target)
	if (!artifact.isFile() || artifact.isSymbolicLink()) return null
	const record = readLocalOwnerFile(paths.directory)
	if (record?.schemaVersion !== LOCAL_OWNER_SCHEMA || record.token !== token || record.name !== name
		|| typeof record.expiresAt !== 'string' || !Number.isFinite(Date.parse(record.expiresAt))
		|| Date.parse(record.expiresAt) <= Date.now() || !resourceOwnerOf(record)) return null
	return record
}

// HTTP and local-store maintenance share one retention clock. Issued owner
// records, not directory modification times or later configuration, determine
// expiry. Only legacy directories without a record use age-based cleanup.
export async function sweepLocalArtifactRoot(root, { ttlMs = artifactTtlMs() } = {}) {
	if (typeof root !== 'string' || !root) return 0
	const resolvedRoot = path.resolve(root)
	if (resolvedRoot === path.parse(resolvedRoot).root) return 0
	let removed = 0
	try {
		assertRealDirectory(resolvedRoot)
		for (const entry of await fs.readdir(resolvedRoot, { withFileTypes: true })) {
			if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{6,64}$/.test(entry.name)) continue
			const directory = path.resolve(resolvedRoot, entry.name)
			if (path.dirname(directory) !== resolvedRoot) continue
			try {
				assertRealDirectory(directory)
				let expired = false
				try {
					const record = readLocalOwnerFile(directory)
					const expiry = Date.parse(record?.expiresAt)
					if (record?.schemaVersion !== LOCAL_OWNER_SCHEMA || record.token !== entry.name
						|| !localArtifactPaths(resolvedRoot, entry.name, record.name)
						|| !resourceOwnerOf(record) || !Number.isFinite(expiry)) continue
					expired = expiry <= Date.now()
				} catch (error) {
					if (error?.code !== 'ENOENT') continue
					expired = Date.now() - (await fs.lstat(directory)).mtimeMs > ttlMs
				}
				if (!expired) continue
				await fs.rm(directory, { recursive: true, force: true })
				removed += 1
			} catch {}
		}
	} catch {}
	return removed
}

function sameArtifactOwner(left, right) {
	return Boolean(left && right && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.id === right.id)
}

/**
 * Fail-closed local download authorization. context MUST come from the server's
 * authentication boundary, never raw headers or request arguments. This checks
 * ownership, not credential authenticity. Legacy ownerless artifacts deny even
 * in a local context; private callers may deliberately omit this HTTP gate.
 * The HTTP route must also explicitly refuse the private .owner.json filename.
 * Keep the publication root server-writable only; this boolean check cannot
 * make a subsequent HTTP stream open atomic against local filesystem writers.
 */
export function verifyLocalArtifactOwner({ root, token, name, context } = {}) {
	try {
		const paths = localArtifactPaths(root, token, name)
		if (!paths) return false
		const expected = resourceOwnerForContext(context)
		return sameArtifactOwner(resourceOwnerOf(readLocalArtifactOwner(paths, token, name)), expected)
	} catch { return false }
}

function localBrowserKey(paths) {
	const keyPath = path.join(paths.directory, LOCAL_BROWSER_KEY_FILE)
	assertRealDirectory(paths.directory)
	const stat = lstatSync(keyPath)
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 32) return null
	const fd = openSync(keyPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
	try {
		const opened = fstatSync(fd)
		if (!opened.isFile() || opened.size !== 32 || opened.dev !== stat.dev || opened.ino !== stat.ino) return null
		return readFileSync(fd)
	} finally { closeSync(fd) }
}

function browserDownloadSignature(key, token, name, expiresMs) {
	return crypto.createHmac('sha256', key).update(`${token}\n${name}\n${expiresMs}`).digest('base64url')
}

// A browser link is a short-lived bearer capability, not an account session.
// It is minted only after an authenticated owner has selected the artifact.
// The ordinary /files route without this proof still requires OAuth.
export function verifyLocalArtifactBrowserGrant({ root, token, name, permit } = {}) {
	try {
		const paths = localArtifactPaths(root, token, name)
		if (!paths || typeof permit !== 'string') return false
		const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(permit)
		if (!match) return false
		const expiresMs = Number(match[1])
		if (!Number.isSafeInteger(expiresMs) || expiresMs <= Date.now()
			|| expiresMs > Date.now() + BROWSER_DOWNLOAD_TTL_MS) return false
		const record = readLocalArtifactOwner(paths, token, name)
		if (!record || expiresMs > Date.parse(record.expiresAt)) return false
		const key = localBrowserKey(paths)
		if (!key) return false
		const expected = Buffer.from(browserDownloadSignature(key, token, name, expiresMs))
		const received = Buffer.from(match[2])
		return expected.length === received.length && crypto.timingSafeEqual(expected, received)
	} catch { return false }
}

// Only active artifact stores can attest a structured delivery URL/name pair.
// Store lifetime, not a capped process allowlist, owns this authority. Local
// stores verify the published file itself; signed stores keep an exact issued
// record so a receipt cloned or replayed after reload does not lose its URL.
const artifactDownloadStores = new Set()
const artifactDownloadVerifiers = new WeakMap()

function withArtifactDownloadVerifier(store, verifier) {
	artifactDownloadStores.add(new WeakRef(store))
	artifactDownloadVerifiers.set(store, verifier)
	return store
}

export function isPublishedArtifactDownloadPair(downloadUrl, downloadName) {
	if (typeof downloadUrl !== 'string' || typeof downloadName !== 'string'
		|| !/^https?:\/\//i.test(downloadUrl) || !/^[A-Za-z0-9._() -]+$/.test(downloadName)
		|| downloadName.includes('..')) return false
	for (const reference of artifactDownloadStores) {
		const store = reference.deref()
		if (!store) { artifactDownloadStores.delete(reference); continue }
		try { if (artifactDownloadVerifiers.get(store)?.(downloadUrl, downloadName) === true) return true } catch {}
	}
	return false
}

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

export function safeGenericArtifactName(name, { defaultName = 'betterpptx-artifact', defaultExt = '.bin', allowedExts = [] } = {}) {
	const fallback = `${defaultName}${defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`}`
	const raw = path.basename(String(name || fallback)).replace(/[^A-Za-z0-9._() -]/g, '_') || fallback
	const ext = path.extname(raw).toLowerCase()
	const normalizedAllowed = allowedExts.map(item => String(item || '').toLowerCase().replace(/^\./, ''))
	if (!normalizedAllowed.length) return ext ? raw : `${raw}${defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`}`
	if (ext && normalizedAllowed.includes(ext.slice(1))) return raw
	const base = raw.replace(/\.[^.]*$/, '') || defaultName
	return `${base}${defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`}`
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
	const lower = String(name || '').toLowerCase()
	const safe = (lower.endsWith('.pptx') || lower.endsWith('.pptm') ? safeArtifactName(name) : safeGenericArtifactName(name))
		.replace(/[\r\n"]/g, '_')
	return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

function contentTypeFor(name) {
	const lower = String(name || '').toLowerCase()
	if (lower.endsWith('.pptm')) return 'application/vnd.ms-powerpoint.presentation.macroEnabled.12'
	return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

function contentTypeForGeneric(name, explicit) {
	if (explicit) return explicit
	const ext = String(path.extname(name || '')).toLowerCase()
	if (ext === '.png') return 'image/png'
	if (ext === '.svg') return 'image/svg+xml'
	if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
	if (ext === '.json') return 'application/json'
	if (ext === '.pdf') return 'application/pdf'
	if (ext === '.potx') return 'application/vnd.openxmlformats-officedocument.presentationml.template'
	if (ext === '.thmx') return 'application/vnd.openxmlformats-officedocument.theme'
	if (ext === '.pptm' || ext === '.pptx') return contentTypeFor(name)
	return 'application/octet-stream'
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

function createGcsArtifactStore({ base = '', budgetBytes = 2048 * 1048576 } = {}) {
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
	const deliveryRecordRoot = path.join(tempRoot, '.public-delivery-records')
	const deliveryRecordPath = url => path.join(deliveryRecordRoot, `${crypto.createHash('sha256').update(url).digest('hex')}.json`)
	const deliveryObjectName = url => `${prefix}/.delivery-authority/${crypto.createHash('sha256').update(url).digest('hex')}.json`
	const bucket = async () => (await getStorageClient()).bucket(bucketName)
	const preparedArtifacts = new WeakMap()
	let publicBase = normalizePublicBase(base || process.env.BETTERPPTX_PUBLIC_BASE || '')
	function authorityConflict() {
		return new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The saved artifact download could not be verified.')
	}
	function normalizePublicBase(value) {
		if (!value) return ''
		const normalized = String(value).replace(/\/+$/, '')
		const url = new URL(normalized)
		if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
			|| url.href.replace(/\/+$/, '') !== normalized) throw authorityConflict()
		return normalized
	}
	function browserCapability(downloadUrl, downloadName) {
		if (!publicBase || typeof downloadUrl !== 'string' || typeof downloadName !== 'string') return null
		try {
			const url = new URL(downloadUrl)
			if (url.hash || !isPermittedCloudArtifactQuery(url.search)) return null
			const start = `${publicBase}/files/`
			const canonical = downloadUrl.slice(0, downloadUrl.length - url.search.length)
			if (!canonical.startsWith(start)) return null
			const [token, encodedName, ...extra] = canonical.slice(start.length).split('/')
			if (!/^[A-Za-z0-9_-]{43}$/.test(token || '') || extra.length || encodedName !== encodeURIComponent(downloadName)
				|| !/^[A-Za-z0-9._() -]+$/.test(downloadName) || downloadName.startsWith('.') || downloadName.includes('..')) return null
			return { token, url: canonical, hash: crypto.createHash('sha256').update(token).digest('hex') }
		} catch { return null }
	}
	function signedLinkExpiry(downloadUrl, requestedExpiry) {
		const query = new URL(downloadUrl).searchParams
		const dates = query.getAll('X-Goog-Date')
		const durations = query.getAll('X-Goog-Expires')
		// Some private signer doubles do not expose a V4 clock. Never rewrite the
		// signed URL; when its clock is observable, report that exact deadline.
		if (!dates.length && !durations.length) return requestedExpiry
		const match = dates.length === 1 && /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(dates[0])
		if (!match || durations.length !== 1 || !/^[0-9]+$/.test(durations[0])) throw authorityConflict()
		const start = Date.UTC(...match.slice(1).map((value, index) => Number(value) - (index === 1 ? 1 : 0)))
		const seconds = Number(durations[0])
		const expiry = start + seconds * 1000
		if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isFinite(expiry)
			|| new Date(start).toISOString().replace(/[-:]/g, '').replace('.000', '') !== dates[0]
			|| expiry > requestedExpiry) throw authorityConflict()
		return expiry
	}
	function validDeliveryRecord(record, downloadUrl, downloadName) {
		const linkExpiry = Date.parse(record?.expiresAt)
		const fileExpiry = Date.parse(record?.artifactExpiresAt)
		const wrapped = record?.deliveryKind === 'browser-capability'
		if (wrapped) {
			const capability = browserCapability(downloadUrl, downloadName)
			if (!capability || capability.url !== downloadUrl || capability.hash !== record.capabilitySha256
				|| typeof record.signedDownloadUrl !== 'string' || record.signedDownloadUrl === downloadUrl) return false
		} else if (record?.deliveryKind !== undefined || record?.signedDownloadUrl !== undefined || record?.capabilitySha256 !== undefined) return false
		try { if (!Number.isFinite(linkExpiry) || signedLinkExpiry(wrapped ? record.signedDownloadUrl : downloadUrl, linkExpiry) < linkExpiry) return false } catch { return false }
		return record?.downloadUrl === downloadUrl && record?.downloadName === downloadName
			&& record?.bucket === bucketName && record?.prefix === prefix
			&& typeof record?.objectName === 'string' && record.objectName.startsWith(`${prefix}/`)
			&& Boolean(resourceOwnerOf(record))
			&& Number.isFinite(linkExpiry) && Number.isFinite(fileExpiry) && linkExpiry <= fileExpiry
			&& (record.contentType === undefined || (typeof record.contentType === 'string' && record.contentType.length > 0 && !/[\r\n]/.test(record.contentType)))
			&& (record.contentSha256 === undefined || (typeof record.contentSha256 === 'string' && /^[a-f0-9]{64}$/.test(record.contentSha256)))
			&& (record.objectGeneration === undefined || (typeof record.objectGeneration === 'string' && /^[1-9][0-9]*$/.test(record.objectGeneration)))
	}
	function sameArtifactIdentity(existing, record) {
		return existing.bucket === record.bucket && existing.prefix === record.prefix
			&& existing.downloadName === record.downloadName && existing.objectName === record.objectName
			&& existing.artifactExpiresAt === record.artifactExpiresAt
			&& existing.contentType === record.contentType && existing.contentSha256 === record.contentSha256
			&& existing.objectGeneration === record.objectGeneration
			&& sameArtifactOwner(resourceOwnerOf(existing), resourceOwnerOf(record))
	}
	function sameDeliveryIdentity(existing, record) {
		return validDeliveryRecord(existing, record.downloadUrl, record.downloadName)
			&& sameArtifactIdentity(existing, record)
			&& existing.deliveryKind === record.deliveryKind && existing.signedDownloadUrl === record.signedDownloadUrl
			&& existing.capabilitySha256 === record.capabilitySha256
			&& Date.parse(existing.expiresAt) > Date.now()
	}
	function assertStoredPublication(metadata, record) {
		const tags = metadata?.metadata || {}
		let storedOwner = null
		try { storedOwner = resourceOwnerOf({ resourceOwner: JSON.parse(tags.artifactOwner) }) } catch {}
		if (tags.product !== 'BetterPPTX' || tags.artifactKind !== 'published-artifact'
			|| tags.artifactExpiresAt !== record.artifactExpiresAt
			|| !/^[1-9][0-9]*$/.test(String(metadata?.generation || ''))
			|| ((tags.artifactOwner !== undefined || record.contentSha256 !== undefined) && !sameArtifactOwner(storedOwner, resourceOwnerOf(record)))
			|| (record.contentSha256 !== undefined && tags.artifactSha256 !== record.contentSha256)
			|| (record.objectGeneration !== undefined && String(metadata.generation) !== record.objectGeneration)
			|| (record.contentType !== undefined && metadata.contentType !== record.contentType)) throw authorityConflict()
	}
	function verifiesSignedDownload(downloadUrl, downloadName) {
		const capability = browserCapability(downloadUrl, downloadName)
		if (capability) downloadUrl = capability.url
		const record = JSON.parse(readFileSync(deliveryRecordPath(downloadUrl), 'utf8'))
		if (!validDeliveryRecord(record, downloadUrl, downloadName) || Date.parse(record.expiresAt) <= Date.now()) return false
		if (record.deliveryKind === 'browser-capability') {
			const signed = JSON.parse(readFileSync(deliveryRecordPath(record.signedDownloadUrl), 'utf8'))
			return validDeliveryRecord(signed, record.signedDownloadUrl, downloadName) && signed.deliveryKind === undefined
				&& sameArtifactIdentity(signed, record) && signed.expiresAt === record.expiresAt
		}
		return true
	}
	async function loadSignedDownload(downloadUrl, downloadName, directOnly = false) {
		const capability = browserCapability(downloadUrl, downloadName)
		if (capability) downloadUrl = capability.url
		let record
		try { record = JSON.parse(await fs.readFile(deliveryRecordPath(downloadUrl), 'utf8')) } catch {}
		if (!validDeliveryRecord(record, downloadUrl, downloadName)) {
			// Cloud Run's filesystem is ephemeral. The private GCS authority record is
			// shared across instances and survives restarts; the local copy exists only
			// for synchronous public-result sanitization within this process.
			try {
				const [bytes] = await (await bucket()).file(deliveryObjectName(downloadUrl)).download()
				record = JSON.parse(bytes.toString('utf8'))
			} catch { return null }
			if (!validDeliveryRecord(record, downloadUrl, downloadName)) return null
			await fs.mkdir(deliveryRecordRoot, { recursive: true })
			await fs.writeFile(deliveryRecordPath(downloadUrl), JSON.stringify(record), { mode: 0o600 })
		}
		if (record.deliveryKind === 'browser-capability') {
			if (directOnly) return null
			// The wrapper points only at a separately issued, exact signed URL.
			// Never turn caller-provided destinations into redirects or fetches.
			const signed = await loadSignedDownload(record.signedDownloadUrl, downloadName, true)
			if (!signed || signed.deliveryKind !== undefined || !sameArtifactIdentity(signed, record)
				|| signed.expiresAt !== record.expiresAt) return null
		}
		return record
	}
	async function recordSignedDownload(record) {
		if (!validDeliveryRecord(record, record.downloadUrl, record.downloadName)
			|| Date.parse(record.expiresAt) <= Date.now()) throw authorityConflict()
		const authority = (await bucket()).file(deliveryObjectName(record.downloadUrl))
		try {
			await authority.save(JSON.stringify(record), {
				resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
				metadata: { contentType: 'application/json', cacheControl: 'private, no-store',
					metadata: { product: 'BetterPPTX', artifactKind: 'delivery-authority',
						artifactExpiresAt: record.artifactExpiresAt } },
			})
			recordResourceUsage({ gcsClassAOps: 1, externalCalls: 1 })
		} catch (error) {
			if (Number(error?.code) !== 412) throw error
			const [bytes] = await authority.download()
			const existing = JSON.parse(bytes.toString('utf8'))
			if (!sameDeliveryIdentity(existing, record)) throw authorityConflict()
			record = existing
		}
		await fs.mkdir(deliveryRecordRoot, { recursive: true })
		try {
			await fs.writeFile(deliveryRecordPath(record.downloadUrl), JSON.stringify(record), { flag: 'wx', mode: 0o600 })
			return record
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error
			// Identical signed URLs can be returned twice within the signer's clock
			// resolution. Retain the first issued expiry; never extend or overwrite
			// its authority just because finalization was retried.
			let existing
			try { existing = JSON.parse(await fs.readFile(deliveryRecordPath(record.downloadUrl), 'utf8')) } catch {}
			if (sameDeliveryIdentity(existing, record)) return existing
			throw authorityConflict()
		}
	}
	async function browserDelivery(signedRecord) {
		if (!publicBase) return { downloadUrl: signedRecord.downloadUrl, downloadLinkExpiresAt: signedRecord.expiresAt }
		const token = crypto.randomBytes(32).toString('base64url')
		const downloadUrl = `${publicBase}/files/${token}/${encodeURIComponent(signedRecord.downloadName)}`
		const issued = await recordSignedDownload({
			...signedRecord, downloadUrl, deliveryKind: 'browser-capability',
			signedDownloadUrl: signedRecord.downloadUrl, capabilitySha256: crypto.createHash('sha256').update(token).digest('hex'),
		})
		return { downloadUrl, downloadLinkExpiresAt: issued.expiresAt }
	}
	async function resolveBrowserDownload({ token, name } = {}) {
		if (!publicBase || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || typeof name !== 'string') throw authorityConflict()
		const downloadUrl = `${publicBase}/files/${token}/${encodeURIComponent(name)}`
		const record = await loadSignedDownload(downloadUrl, name)
		if (!record || record.deliveryKind !== 'browser-capability' || Date.parse(record.expiresAt) <= Date.now()) throw authorityConflict()
		const file = (await bucket()).file(record.objectName)
		const [metadata] = await file.getMetadata()
		assertStoredPublication(metadata, record)
		if (Date.parse(record.expiresAt) <= Date.now()) throw authorityConflict()
		const signed = new URL(record.signedDownloadUrl)
		// This adapter uses the SDK's default path-style GCS signer, never a
		// caller-supplied host. Even corrupted authority must not redirect elsewhere.
		if (signed.origin !== 'https://storage.googleapis.com' || signed.username || signed.password || signed.hash
			|| decodeURIComponent(signed.pathname) !== `/${bucketName}/${record.objectName}`
			|| signed.searchParams.getAll('generation').length !== 1
			|| signed.searchParams.get('generation') !== record.objectGeneration
			|| signed.searchParams.getAll('X-Goog-Signature').length !== 1
			|| !signed.searchParams.get('X-Goog-Signature')) throw authorityConflict()
		return { downloadUrl: record.signedDownloadUrl }
	}
	async function sweepExpiredDeliveries() {
		let entries
		try { entries = await fs.readdir(deliveryRecordRoot, { withFileTypes: true }) } catch { entries = [] }
		let removed = 0
		for (const entry of entries) {
			if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue
			const recordFile = path.join(deliveryRecordRoot, entry.name)
			try {
				const record = JSON.parse(await fs.readFile(recordFile, 'utf8'))
				if (record.bucket !== bucketName || record.prefix !== prefix
					|| !Number.isFinite(Date.parse(record.artifactExpiresAt || record.expiresAt))
					|| Date.parse(record.artifactExpiresAt || record.expiresAt) > Date.now()) continue
				await fs.unlink(recordFile)
				removed += 1
			} catch {}
		}
		// Physical retention is independent of signed-link expiry. Delete only
		// objects explicitly stamped by this store, and pin the observed generation
		// so a concurrent replacement cannot be removed by an old sweep.
		const storeBucket = await bucket()
		let pageToken
		do {
			const [files, next] = await storeBucket.getFiles({
				prefix: `${prefix}/`, autoPaginate: false, maxResults: 1000, ...(pageToken ? { pageToken } : {}),
			})
			for (const file of files) {
				const metadata = file.metadata || (await file.getMetadata())[0]
				const tags = metadata?.metadata || {}
				if (tags.product !== 'BetterPPTX' || !['published-artifact', 'delivery-authority'].includes(tags.artifactKind)) continue
				const expiry = Date.parse(tags.artifactExpiresAt)
				if (!Number.isFinite(expiry) || expiry > Date.now() || !metadata?.generation) continue
				try {
					await file.delete({ ifGenerationMatch: metadata.generation })
					removed += 1
				} catch (error) {
					if (![404, 412].includes(Number(error?.code))) throw error
				}
			}
			pageToken = next?.pageToken
		} while (pageToken)
		return removed
	}

	async function prepareSaveTarget({ fileName, deckId } = {}) {
		const owner = currentResourceOwner()
		const downloadName = safeArtifactName(fileName || `betterpptx_${deckId || 'deck'}.pptx`)
		const token = crypto.randomBytes(18).toString('base64url')
		const objectName = `${prefix}/${new Date().toISOString().slice(0, 10)}/${token}/${downloadName}`
		const tempDir = path.join(tempRoot, token)
		await fs.mkdir(tempDir, { recursive: true })
		const artifact = {
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
		preparedArtifacts.set(artifact, { identity: Object.freeze({
			target: artifact.target, downloadName, objectName, expiresAt: artifact.expiresAt,
			contentType: artifact.contentType, owner,
		}), contentSha256: null, bytes: null, objectGeneration: null, uploaded: false, inFlight: null })
		return artifact
	}

	async function prepareArtifactTarget({ fileName, deckId, kind = 'artifact', extension = '.bin', contentType } = {}) {
		const owner = currentResourceOwner()
		const ext = String(extension || '.bin').replace(/^\./, '')
		const downloadName = safeGenericArtifactName(fileName || `betterpptx_${deckId || kind}.${ext}`, {
			defaultName: `betterpptx_${deckId || kind}`,
			defaultExt: `.${ext}`,
			allowedExts: [ext],
		})
		const token = crypto.randomBytes(18).toString('base64url')
		const objectName = `${prefix}/${new Date().toISOString().slice(0, 10)}/${token}/${downloadName}`
		const tempDir = path.join(tempRoot, token)
		await fs.mkdir(tempDir, { recursive: true })
		const artifact = {
			provider,
			shared: true,
			remote: true,
			target: path.join(tempDir, downloadName),
			downloadUrl: null,
			downloadName,
			objectName,
			expiresAt: new Date(Date.now() + artifactTtlMs()).toISOString(),
			contentType: contentTypeForGeneric(downloadName, contentType),
			cleanupTarget: true,
		}
		if (typeof artifact.contentType !== 'string' || !artifact.contentType || /[\r\n]/.test(artifact.contentType)) throw authorityConflict()
		preparedArtifacts.set(artifact, { identity: Object.freeze({
			target: artifact.target, downloadName, objectName, expiresAt: artifact.expiresAt,
			contentType: artifact.contentType, owner,
		}), contentSha256: null, bytes: null, objectGeneration: null, uploaded: false, inFlight: null })
		return artifact
	}

	async function finalizeSaveTarget(artifact) {
		const prepared = preparedArtifacts.get(artifact)
		const owner = currentResourceOwner()
		const identity = prepared?.identity
		if (!identity || !sameArtifactOwner(identity.owner, owner)
			|| ['target', 'downloadName', 'objectName', 'expiresAt', 'contentType'].some(key => artifact[key] !== identity[key])
			|| !Number.isFinite(Date.parse(identity.expiresAt)) || Date.parse(identity.expiresAt) <= Date.now()) throw authorityConflict()
		if (prepared.inFlight) return prepared.inFlight
		const finalize = async () => {
			// Read once: the hash and uploaded payload must describe the same bytes,
			// even if the generation source changes while an upload is in flight.
			let bytes
			try { bytes = await fs.readFile(identity.target) }
			catch (error) { if (error?.code !== 'ENOENT' || !prepared.contentSha256) throw error }
			if (bytes) {
				const hash = crypto.createHash('sha256').update(bytes).digest('hex')
				if (prepared.contentSha256 && prepared.contentSha256 !== hash) throw authorityConflict()
				prepared.contentSha256 = hash
				prepared.bytes = bytes.length
			}
			if (Date.parse(identity.expiresAt) <= Date.now()) throw authorityConflict()
			const file = (await bucket()).file(identity.objectName)
			const binding = {
				artifactExpiresAt: identity.expiresAt, resourceOwner: identity.owner,
				contentType: identity.contentType, contentSha256: prepared.contentSha256,
				...(prepared.objectGeneration ? { objectGeneration: prepared.objectGeneration } : {}),
			}
			let metadata
			try { [metadata] = await file.getMetadata() }
			catch (error) { if (Number(error?.code) !== 404) throw error }
			if (!metadata) {
				// A successful upload followed by an issuance failure may be retried,
				// but a deleted publication must never be resurrected.
				if (!bytes || prepared.uploaded || Date.parse(identity.expiresAt) <= Date.now()) throw authorityConflict()
				try {
					await file.save(bytes, {
						resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
						metadata: { contentType: identity.contentType, cacheControl: 'private, max-age=0, no-store',
							metadata: { product: 'BetterPPTX', artifactKind: 'published-artifact',
								artifactExpiresAt: identity.expiresAt, artifactOwner: JSON.stringify(identity.owner),
								artifactSha256: prepared.contentSha256 } },
					})
					prepared.uploaded = true
					recordResourceUsage({ artifactBytes: prepared.bytes, storageWriteBytes: prepared.bytes, gcsClassAOps: 1, externalCalls: 1 })
				} catch (error) { if (Number(error?.code) !== 412) throw error }
				const stored = await file.getMetadata()
				metadata = stored[0]
			}
			assertStoredPublication(metadata, binding)
			if (Number(metadata.size) !== prepared.bytes) throw authorityConflict()
			prepared.uploaded = true
			prepared.objectGeneration = String(metadata.generation)
			const signedExpiresAt = Math.min(Date.now() + BROWSER_DOWNLOAD_TTL_MS, Date.parse(identity.expiresAt))
			if (signedExpiresAt <= Date.now()) throw authorityConflict()
			const [downloadUrl] = await file.getSignedUrl({
				version: 'v4', action: 'read', expires: signedExpiresAt,
				queryParams: { generation: prepared.objectGeneration },
				responseDisposition: contentDisposition(identity.downloadName), responseType: identity.contentType,
			})
			const issuedRecord = await recordSignedDownload({
				downloadUrl, downloadName: identity.downloadName, expiresAt: new Date(signedLinkExpiry(downloadUrl, signedExpiresAt)).toISOString(),
				artifactExpiresAt: identity.expiresAt, bucket: bucketName, prefix, objectName: identity.objectName,
				resourceOwner: identity.owner, contentType: identity.contentType,
				contentSha256: prepared.contentSha256, objectGeneration: prepared.objectGeneration,
			})
			if (artifact.cleanupTarget) {
				try { await fs.rm(path.dirname(identity.target), { recursive: true, force: true }) } catch {}
			}
			const finalized = { ...artifact, ...(await browserDelivery(issuedRecord)), expiresAt: identity.expiresAt, localPathAvailable: false }
			preparedArtifacts.set(finalized, prepared)
			return finalized
		}
		prepared.inFlight = finalize()
		try { return await prepared.inFlight } finally { prepared.inFlight = null }
	}

	async function issueBrowserDownload({ downloadUrl, downloadName } = {}) {
		const record = await loadSignedDownload(downloadUrl, downloadName)
		const owner = currentResourceOwner()
		const artifactExpiresAt = Date.parse(record?.artifactExpiresAt || record?.expiresAt)
		if (!record || record.downloadName !== downloadName
			|| record.bucket !== bucketName || record.prefix !== prefix
			|| !sameArtifactOwner(resourceOwnerOf(record), owner)
			|| !Number.isFinite(artifactExpiresAt) || artifactExpiresAt <= Date.now()
			|| (record.deliveryKind === 'browser-capability' && Date.parse(record.expiresAt) <= Date.now())
			|| typeof record.objectName !== 'string' || !record.objectName.startsWith(`${prefix}/`)) {
			throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
		}
		const expiresMs = Math.min(Date.now() + BROWSER_DOWNLOAD_TTL_MS, artifactExpiresAt)
		const file = (await getStorageClient()).bucket(bucketName).file(record.objectName)
		const [metadata] = await file.getMetadata()
		assertStoredPublication(metadata, record)
		if (record.deliveryKind === 'browser-capability') {
			if (Date.parse(record.expiresAt) <= Date.now()) throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
			return { downloadUrl: record.downloadUrl, downloadLinkExpiresAt: record.expiresAt }
		}
		const contentType = record.contentType || metadata.contentType || contentTypeForGeneric(downloadName)
		const objectGeneration = record.objectGeneration || String(metadata.generation)
		if (expiresMs <= Date.now()) throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
		const [freshUrl] = await file.getSignedUrl({
			version: 'v4', action: 'read', expires: expiresMs,
			queryParams: { generation: objectGeneration },
			responseDisposition: contentDisposition(downloadName), responseType: contentType,
		})
		const issued = await recordSignedDownload({
			downloadUrl: freshUrl, downloadName, expiresAt: new Date(signedLinkExpiry(freshUrl, expiresMs)).toISOString(),
			artifactExpiresAt: new Date(artifactExpiresAt).toISOString(),
			bucket: bucketName, prefix, objectName: record.objectName, resourceOwner: owner,
			contentType, objectGeneration, ...(record.contentSha256 ? { contentSha256: record.contentSha256 } : {}),
		})
		return browserDelivery(issued)
	}

	async function readArtifactChunk({ downloadUrl, downloadName, offset = 0, maxBytes = 32768 } = {}) {
		const record = await loadSignedDownload(downloadUrl, downloadName)
		const owner = currentResourceOwner()
		if (!record || record.downloadName !== downloadName
			|| record.bucket !== bucketName || record.prefix !== prefix
			|| !sameArtifactOwner(resourceOwnerOf(record), owner)
			|| Date.parse(record.artifactExpiresAt || record.expiresAt) <= Date.now()
			|| typeof record.objectName !== 'string' || !record.objectName.startsWith(`${prefix}/`)) {
			throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
		}
		const file = (await getStorageClient()).bucket(bucketName).file(record.objectName,
			record.objectGeneration ? { generation: record.objectGeneration } : undefined)
		const [metadata] = await file.getMetadata()
		assertStoredPublication(metadata, record)
		if (Date.parse(record.artifactExpiresAt) <= Date.now()) throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
		const totalBytes = Number(metadata?.size)
		if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || offset > totalBytes) {
			throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
		}
		if (offset === totalBytes) return { bytes: Buffer.alloc(0), totalBytes }
		const end = Math.min(totalBytes, offset + maxBytes) - 1
		const chunks = []
		for await (const chunk of file.createReadStream({ start: offset, end })) chunks.push(chunk)
		const bytes = Buffer.concat(chunks)
		if (bytes.length !== end - offset + 1) throw new ArtifactStoreConfigError('ARTIFACT_READ_INCOMPLETE', 'The saved artifact could not be read completely.')
		return { bytes, totalBytes }
	}

	return withArtifactDownloadVerifier({
		provider,
		shared: true,
		get base() { return publicBase },
		get root() { return '' },
		get budgetBytes() { return maxBytes },
		configure({ base: nextBase } = {}) {
			if (nextBase !== undefined) publicBase = normalizePublicBase(nextBase)
			return this.describe()
		},
		describe() {
			return { provider, shared: true, bucketConfigured: true, prefix, budgetBytes: maxBytes, ttlMs: artifactTtlMs() }
		},
		prepareSaveTarget,
		prepareArtifactTarget,
		finalizeSaveTarget,
		issueBrowserDownload,
		resolveBrowserDownload,
		readArtifactChunk,
		enforceBudget: async () => {},
		resolveLocalDownload: () => null,
		sweepExpired: sweepExpiredDeliveries,
	}, verifiesSignedDownload)
}

export function createArtifactStore({ base = '', root = '', budgetBytes = 2048 * 1048576 } = {}) {
	const provider = artifactStoreProvider()
	assertSupportedProvider(provider)
	if (provider === 'gcs') return createGcsArtifactStore({ base, budgetBytes })
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
	const preparedOwners = new WeakMap()

	async function prepareLocalPublication(downloadName) {
		// Capture the scope before any await; ownership never comes from artifact
		// parameters, a caller-supplied owner field, or a download request.
		const owner = resourceAuthorizationActive() ? currentResourceOwner() : null
		const token = crypto.randomBytes(18).toString('base64url')
		const paths = localArtifactPaths(publicRoot, token, downloadName)
		if (!paths) throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The saved artifact download could not be verified.')
		await fs.mkdir(paths.root, { recursive: true })
		assertRealDirectory(paths.root)
		await enforceBudget()
		await fs.mkdir(paths.directory, { mode: 0o700 })
		const expiresAt = new Date(Date.now() + artifactTtlMs()).toISOString()
		if (owner) {
			await fs.writeFile(paths.ownerFile, JSON.stringify({
				schemaVersion: LOCAL_OWNER_SCHEMA, token, name: downloadName, expiresAt, resourceOwner: owner,
			}), { flag: 'wx', mode: 0o600 })
		}
		const artifact = {
			provider, shared: false, remote: true,
			target: paths.target,
			downloadUrl: `${publicBase}/files/${token}/${encodeURIComponent(downloadName)}`,
			downloadName,
			objectName: `${token}/${downloadName}`,
			expiresAt,
		}
		if (owner) preparedOwners.set(artifact, { owner, paths, token, name: downloadName, expiresAt })
		return artifact
	}

	async function issueLocalBrowserDownload(downloadUrl, downloadName, owner) {
		if (!publicBase || !publicRoot || !owner || typeof downloadUrl !== 'string') {
			throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The artifact download could not be authorized.')
		}
		const prefix = `${publicBase}/files/`
		if (!downloadUrl.startsWith(prefix)) throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The artifact download could not be authorized.')
		const relative = downloadUrl.slice(prefix.length).split('?')[0]
		const [token, encodedName, ...extra] = relative.split('/')
		const paths = localArtifactPaths(publicRoot, token, downloadName)
		if (!paths || extra.length || encodedName !== encodeURIComponent(downloadName)) {
			throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The artifact download could not be authorized.')
		}
		const record = readLocalArtifactOwner(paths, token, downloadName)
		if (!sameArtifactOwner(resourceOwnerOf(record), owner)) {
			throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The artifact download could not be authorized.')
		}
		const keyPath = path.join(paths.directory, LOCAL_BROWSER_KEY_FILE)
		try { await fs.writeFile(keyPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }) }
		catch (error) { if (error?.code !== 'EEXIST') throw error }
		const key = localBrowserKey(paths)
		if (!key) throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The artifact download could not be authorized.')
		const expiresMs = Math.min(Date.now() + BROWSER_DOWNLOAD_TTL_MS, Date.parse(record.expiresAt))
		if (expiresMs <= Date.now()) throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The artifact download has expired.')
		const permit = `${expiresMs}.${browserDownloadSignature(key, token, downloadName, expiresMs)}`
		return {
			downloadUrl: `${prefix}${token}/${encodedName}?permit=${permit}`,
			downloadLinkExpiresAt: new Date(expiresMs).toISOString(),
		}
	}

	async function issueBrowserDownload({ downloadUrl, downloadName } = {}) {
		return issueLocalBrowserDownload(downloadUrl, downloadName, currentResourceOwner())
	}

	async function readArtifactChunk({ downloadUrl, downloadName, offset = 0, maxBytes = 32768 } = {}) {
		const prefix = `${publicBase}/files/`
		if (!publicBase || !publicRoot || typeof downloadUrl !== 'string' || !downloadUrl.startsWith(prefix)) {
			throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
		}
		const [pathPart] = downloadUrl.slice(prefix.length).split('?')
		const [token, encodedName, ...extra] = pathPart.split('/')
		const paths = localArtifactPaths(publicRoot, token, downloadName)
		const owner = currentResourceOwner()
		let record = null
		if (paths) {
			try { record = readLocalArtifactOwner(paths, token, downloadName) } catch {}
		}
		if (!paths || extra.length || encodedName !== encodeURIComponent(downloadName)
			|| !sameArtifactOwner(resourceOwnerOf(record), owner)) {
			throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
		}
		const file = await fs.open(paths.target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
		try {
			const stat = await file.stat()
			const pathnameStat = await fs.lstat(paths.target)
			if (!stat.isFile() || pathnameStat.isSymbolicLink() || stat.dev !== pathnameStat.dev || stat.ino !== pathnameStat.ino
				|| !Number.isSafeInteger(stat.size) || offset > stat.size) {
				throw new ArtifactStoreConfigError('ARTIFACT_NOT_AVAILABLE', 'The saved artifact is unavailable to this caller.')
			}
			const count = Math.min(maxBytes, stat.size - offset)
			const bytes = Buffer.alloc(count)
			let filled = 0
			while (filled < count) {
				const { bytesRead } = await file.read(bytes, filled, count - filled, offset + filled)
				if (bytesRead <= 0) throw new ArtifactStoreConfigError('ARTIFACT_READ_INCOMPLETE', 'The saved artifact could not be read completely.')
				filled += bytesRead
			}
			return { bytes, totalBytes: stat.size }
		} finally { await file.close() }
	}

	async function finalizeSaveTarget(artifact) {
		const prepared = preparedOwners.get(artifact)
		const owner = resourceAuthorizationActive() ? currentResourceOwner() : prepared?.owner
		if (!artifact?.remote || !owner) return artifact
		try {
			const token = String(artifact.objectName || '').split('/')[0]
			const paths = localArtifactPaths(publicRoot, token, artifact.downloadName)
			if (!paths || artifact.target !== paths.target) throw new Error('Invalid artifact target.')
			const record = readLocalArtifactOwner(paths, token, artifact.downloadName)
			if (!sameArtifactOwner(resourceOwnerOf(record), owner)
				|| (prepared && (!sameArtifactOwner(prepared.owner, owner) || prepared.paths.target !== paths.target
					|| prepared.token !== token || prepared.name !== artifact.downloadName || prepared.expiresAt !== record.expiresAt))) {
				throw new Error('Invalid artifact owner.')
			}
			// Reuse the persisted lifetime. Retries cannot extend expiry or claim a
			// missing/malformed/legacy sidecar, even for the current scope owner.
			return { ...artifact, expiresAt: record.expiresAt,
				...(resourceAuthorizationActive()
					? await issueLocalBrowserDownload(artifact.downloadUrl, artifact.downloadName, owner)
					: {}),
			}
		} catch {
			throw new ArtifactStoreConfigError('ARTIFACT_DOWNLOAD_AUTHORITY_CONFLICT', 'The saved artifact download could not be verified.')
		}
	}

	async function enforceBudget(incomingBytes = 0) {
		if (!publicRoot || !maxBytes) return
		let entries
		try { entries = await fs.readdir(publicRoot, { withFileTypes: true }) } catch { return }
		let total = 0
		for (const e of entries) {
			if (!e.isDirectory()) continue
			const dp = path.join(publicRoot, e.name)
			try {
				total += await directoryBytes(dp)
			} catch {
				continue
			}
		}
		if (total + Math.max(0, Number(incomingBytes) || 0) >= maxBytes) {
			// A published deck must never disappear early just to make room for
			// another one. Capacity exhaustion is an explicit admission failure.
			throw new ArtifactStoreConfigError('ARTIFACT_STORAGE_CAPACITY', 'Presentation storage is at capacity; existing retained downloads were preserved.')
		}
	}

	async function prepareSaveTarget({ fileName, outputDir, deckId } = {}) {
		if (publicBase && publicRoot) {
			const downloadName = safeArtifactName(fileName || `betterpptx_${deckId || 'deck'}.pptx`)
			return prepareLocalPublication(downloadName)
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

	async function prepareArtifactTarget({ fileName, outputDir, deckId, kind = 'artifact', extension = '.bin', contentType } = {}) {
		const ext = String(extension || '.bin').replace(/^\./, '')
		if (publicBase && publicRoot) {
			const downloadName = safeGenericArtifactName(fileName || `betterpptx_${deckId || kind}.${ext}`, {
				defaultName: `betterpptx_${deckId || kind}`,
				defaultExt: `.${ext}`,
				allowedExts: [ext],
			})
			const artifact = await prepareLocalPublication(downloadName)
			artifact.contentType = contentTypeForGeneric(downloadName, contentType)
			return artifact
		}

		const rawName = fileName || `betterpptx_${deckId || kind}.${ext}`
		const isAbs = path.isAbsolute(rawName)
		const baseName = safeGenericArtifactName(rawName, {
			defaultName: `betterpptx_${deckId || kind}`,
			defaultExt: `.${ext}`,
			allowedExts: [ext],
		})
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
			contentType: contentTypeForGeneric(baseName, contentType),
		}
	}

	function resolveLocalDownload({ token, name } = {}) {
		if (!publicRoot) return null
		const safeToken = String(token || '')
		const safeName = String(name || '')
		if (!/^[A-Za-z0-9_-]{6,}$/.test(safeToken) || !/^[A-Za-z0-9._() -]+$/.test(safeName) || safeName.startsWith('.') || safeName.includes('..')) return null
		const rootResolved = path.resolve(publicRoot)
		const resolved = path.resolve(rootResolved, safeToken, safeName)
		if (resolved !== path.join(rootResolved, safeToken, safeName)) return null
		return resolved
	}

	function verifiesLocalDownload(downloadUrl, downloadName) {
		if (!publicBase || !publicRoot) return false
		const baseUrl = new URL(publicBase)
		if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) return false
		const prefix = `${publicBase}/files/`
		if (!downloadUrl.startsWith(prefix)) return false
		const [pathPart, query, ...extraQuery] = downloadUrl.slice(prefix.length).split('?')
		if (extraQuery.length || downloadUrl.includes('#')) return false
		const [token, encodedName, ...extra] = pathPart.split('/')
		if (extra.length || !/^[A-Za-z0-9_-]{24}$/.test(token || '') || encodedName !== encodeURIComponent(downloadName)) return false
		if (query !== undefined) {
			const params = new URLSearchParams(query)
			if ([...params.keys()].length !== 1 || !params.has('permit')
				|| !verifyLocalArtifactBrowserGrant({ root: publicRoot, token, name: downloadName, permit: params.get('permit') })) return false
		} else if (!readLocalArtifactOwner(localArtifactPaths(publicRoot, token, downloadName), token, downloadName)) return false
		const publishedFile = resolveLocalDownload({ token, name: downloadName })
		if (!publishedFile) return false
		const directory = lstatSync(path.dirname(publishedFile))
		const file = lstatSync(publishedFile)
		return directory.isDirectory() && !directory.isSymbolicLink() && file.isFile() && !file.isSymbolicLink()
	}

	async function sweepExpired({ ttlMs = artifactTtlMs() } = {}) {
		return sweepLocalArtifactRoot(publicRoot, { ttlMs })
	}

	return withArtifactDownloadVerifier({
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
		prepareArtifactTarget,
		finalizeSaveTarget,
		issueBrowserDownload,
		readArtifactChunk,
		enforceBudget,
		resolveLocalDownload,
		sweepExpired,
	}, verifiesLocalDownload)
}

export function artifactTtlMs() {
	// New files and their browser grants share a 12-hour default window. Each
	// grant is capped at the file's immutable expiry; renewal cannot extend it.
	// Existing records retain their original issued expiry.
	return Math.max(60 * 1000, Number(process.env.BETTERPPTX_ARTIFACT_TTL_MS || DEFAULT_ARTIFACT_TTL_MS) || DEFAULT_ARTIFACT_TTL_MS)
}
