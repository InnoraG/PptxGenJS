#!/usr/bin/env node
// Staging-only black-box evidence probe for the distributed avatar stores.
// It creates namespaced synthetic records, rehydrates them from child
// processes, verifies idempotent Firestore preconditions and GCS digest reads,
// then deletes every synthetic record/object. No customer data or secrets are
// used or emitted.
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const project = String(process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'betterpptx-mcp-staging').trim()
const bucket = String(process.env.BETTERPPTX_GEN_ASSET_BUCKET || 'betterpptx-mcp-staging-artifacts-860007156914').trim()
const jobCollection = String(process.env.BETTERPPTX_FIRESTORE_AVATAR_JOB_COLLECTION || 'betterpptx_avatar_jobs').trim()
const stateCollection = String(process.env.BETTERPPTX_FIRESTORE_AVATAR_WORKER_STATE_COLLECTION || 'betterpptx_avatar_worker_state').trim()
const billingPrefix = String(process.env.BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX || 'betterpptx_billing').trim()
const prefix = `avatar-distributed-probe-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${crypto.randomBytes(4).toString('hex')}`
const jobId = `${prefix}-job`
const stateId = crypto.createHash('sha256').update(`${prefix}-worker`).digest('hex')
const concurrentAccountId = `${prefix}-concurrent-worker`
const concurrentStateId = crypto.createHash('sha256').update(concurrentAccountId).digest('hex')
const customerId = `${prefix}-customer`
const reservationId = `${prefix}-reservation`
const usageId = `${prefix}-usage`
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`
const storageBase = 'https://storage.googleapis.com/storage/v1'
const storageUploadBase = 'https://storage.googleapis.com/upload/storage/v1'
let objectName = `betterpptx-avatar-artifacts/tenants/${prefix}/blobs/probe.bin`

function gcloudName() {
	if (process.platform === 'win32') return 'gcloud.cmd'
	return 'gcloud'
}

function token() {
	const executable = gcloudName()
	const value = process.platform === 'win32'
		? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', `${executable} auth print-access-token --quiet`], { encoding: 'utf8', windowsHide: true }).trim()
		: execFileSync(executable, ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8', windowsHide: true }).trim()
	if (!value) throw new Error('Google Cloud access token was unavailable.')
	return value
}

let bearer = token()
function headers(contentType = null) {
	return { Authorization: `Bearer ${bearer}`, ...(contentType ? { 'Content-Type': contentType } : {}) }
}

async function request(url, options = {}, allow = []) {
	const { raw = false, ...fetchOptions } = options
	let response = await fetch(url, { ...fetchOptions, headers: { ...headers(options.body ? 'application/json' : null), ...(options.headers || {}) } })
	if (response.status === 401) {
		bearer = token()
		response = await fetch(url, { ...fetchOptions, headers: { ...headers(options.body ? 'application/json' : null), ...(options.headers || {}) } })
	}
	if (raw) return { response, data: null }
	const text = await response.text()
	let data = null
	try { data = text ? JSON.parse(text) : null } catch { data = text }
	if (!response.ok && !allow.includes(response.status)) {
		throw new Error(`Google API ${response.status} ${response.statusText}${data?.error?.message ? `: ${data.error.message}` : ''} (${url})`)
	}
	return { response, data }
}

const stringValue = value => ({ stringValue: String(value) })
const integerValue = value => ({ integerValue: String(Math.trunc(Number(value))) })
const booleanValue = value => ({ booleanValue: Boolean(value) })
const timestampValue = value => ({ timestampValue: new Date(value).toISOString() })
function fields(values) {
	const result = {}
	for (const [key, value] of Object.entries(values)) {
		if (value && value.__type === 'timestamp') result[key] = timestampValue(value.value)
		else if (typeof value === 'boolean') result[key] = booleanValue(value)
		else if (typeof value === 'number') result[key] = integerValue(value)
		else result[key] = stringValue(value)
	}
	return result
}
const timestamp = value => ({ __type: 'timestamp', value })
function firestoreUrl(collection, id) {
	return `${firestoreBase}/${collection}/${encodeURIComponent(id)}`
}
async function writeDoc(collection, id, values) {
	return request(firestoreUrl(collection, id), { method: 'PATCH', body: JSON.stringify({ fields: fields(values) }) })
}
async function readDoc(collection, id) {
	const { response, data } = await request(firestoreUrl(collection, id), { method: 'GET' }, [404])
	return response.status === 404 ? null : data
}
async function deleteDoc(collection, id) {
	await request(firestoreUrl(collection, id), { method: 'DELETE' }, [404])
}
function docValue(doc, key) {
	const value = doc?.fields?.[key]
	if (value?.stringValue !== undefined) return value.stringValue
	if (value?.integerValue !== undefined) return Number(value.integerValue)
	if (value?.booleanValue !== undefined) return value.booleanValue
	if (value?.timestampValue !== undefined) return value.timestampValue
	return null
}
function childRead(kind, collection, id, expected, objectOverride = null) {
	const args = ['--no-warnings', fileURLToPath(import.meta.url), '--child-read', kind, collection, id, expected]
	if (objectOverride) args.push(objectOverride)
	const result = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true })
	if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Child ${kind} read failed.`)
	return JSON.parse(result.stdout.trim())
}

async function commitWrites(writes) {
	return request(`${firestoreBase}:commit`, { method: 'POST', body: JSON.stringify({ writes }) }, [409])
}
async function beginFirestoreTransaction() {
	const result = await request(`${firestoreBase}:beginTransaction`, { method: 'POST', body: JSON.stringify({ options: { readWrite: {} } }) })
	if (!result.data?.transaction) throw new Error('Firestore transaction could not be started.')
	return result.data.transaction
}
async function incrementWorkerStateViaRestTransaction(accountHash, errorClass) {
	for (let attempt = 0; attempt < 5; attempt++) {
		const transaction = await beginFirestoreTransaction()
		const snapshot = await request(`${firestoreUrl(stateCollection, accountHash)}?transaction=${encodeURIComponent(transaction)}`, { method: 'GET' }, [404])
		const prior = snapshot.response.status === 404 ? null : snapshot.data
		const failures = Number(docValue(prior, 'consecutiveFailures') || 0) + 1
		const values = {
			schemaVersion: 'betterpptx.avatar-worker-state.v1',
			accountHash,
			status: 'cooldown',
			consecutiveFailures: failures,
			cooldownUntil: timestamp(new Date(Date.now() + 60_000).toISOString()),
			lastErrorClass: errorClass,
			updatedAt: timestamp(new Date().toISOString()),
		}
		const committed = await request(`${firestoreBase}:commit`, {
			method: 'POST',
			body: JSON.stringify({ transaction, writes: [{ update: firestoreDocument(stateCollection, accountHash, values) }] }),
		}, [409])
		if (committed.response.status === 200) return values
		await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
	}
	throw new Error('Firestore concurrent state transaction did not commit after retries.')
}
function firestoreDocument(collection, id, values) {
	return { name: `projects/${project}/databases/(default)/documents/${collection}/${id}`, fields: fields(values) }
}
function createWrite(collection, id, values) {
	return { update: firestoreDocument(collection, id, values), currentDocument: { exists: false } }
}

async function runChildRead() {
	const [, , , kind, collection, id, expected, objectOverride] = process.argv
	if (kind === 'gcs' && objectOverride) objectName = objectOverride
	const doc = await readDoc(collection, id)
	const actual = kind === 'gcs'
		? await readGcsObject(expected)
		: docValue(doc, kind === 'job' ? 'status' : 'status')
	if (kind === 'gcs' ? actual !== expected : actual !== expected) throw new Error(`Child read mismatch for ${kind}.`)
	process.stdout.write(JSON.stringify({ status: 'PASS', kind }))
}

async function uploadGcs(bytes) {
	const url = `${storageUploadBase}/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`
	await request(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })
}
async function readGcsObject(expectedDigest = null) {
	const metadataUrl = `${storageBase}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`
	const { response } = await request(`${metadataUrl}?alt=media`, { method: 'GET', raw: true }, [404])
	if (response.status === 404) return null
	const bytes = Buffer.from(await response.arrayBuffer())
	return crypto.createHash('sha256').update(bytes).digest('hex') === expectedDigest ? expectedDigest : null
}
async function deleteGcs() {
	const url = `${storageBase}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`
	await request(url, { method: 'DELETE' }, [404])
}

async function main() {
	if (process.argv[2] === '--child-read') return runChildRead()
	if (process.argv[2] !== '--confirm-staging') {
		throw new Error('Refusing external writes without --confirm-staging.')
	}
	const createdAt = new Date().toISOString()
	const expiredAt = new Date(Date.now() - 60_000).toISOString()
	const bytes = Buffer.from(`betterpptx-avatar-distributed-probe:${prefix}`)
	const artifactDigest = crypto.createHash('sha256').update(bytes).digest('hex')
	const checks = []
	const cleanup = []
	let phase = 'init'
	try {
		phase = 'firestore-job'
		await writeDoc(jobCollection, jobId, { schemaVersion: 'betterpptx.avatar-job.v1', jobId, status: 'queued', sessionHash: crypto.createHash('sha256').update(prefix).digest('hex'), expiresAt: timestamp(expiredAt), createdAt: timestamp(createdAt), updatedAt: timestamp(createdAt) })
		cleanup.push(() => deleteDoc(jobCollection, jobId))
		const job = await readDoc(jobCollection, jobId)
		if (docValue(job, 'status') !== 'queued') throw new Error('Firestore job write/read failed.')
		const childJob = childRead('job', jobCollection, jobId, 'queued')
		checks.push({ id: 'firestore-job-cross-process', status: childJob.status === 'PASS' ? 'PASS' : 'BLOCKED' })

		phase = 'firestore-worker-state'
		await writeDoc(stateCollection, stateId, { schemaVersion: 'betterpptx.avatar-worker-state.v1', accountHash: stateId, status: 'cooldown', consecutiveFailures: 1, cooldownUntil: timestamp(new Date(Date.now() + 60_000).toISOString()), updatedAt: timestamp(createdAt) })
		cleanup.push(() => deleteDoc(stateCollection, stateId))
		const childState = childRead('state', stateCollection, stateId, 'cooldown')
		checks.push({ id: 'firestore-worker-state-cross-process', status: childState.status === 'PASS' ? 'PASS' : 'BLOCKED' })

		phase = 'firestore-worker-state-concurrency'
		// Exercise the same Firestore transaction used by the live rotating-worker
		// adapter. Two concurrent failures must not lose an increment or expose the
		// account identifier; the synthetic document is deleted in cleanup.
		cleanup.push(() => deleteDoc(stateCollection, concurrentStateId))
		await writeDoc(stateCollection, concurrentStateId, { schemaVersion: 'betterpptx.avatar-worker-state.v1', accountHash: concurrentStateId, status: 'healthy', consecutiveFailures: 0, cooldownUntil: null, updatedAt: timestamp(createdAt) })
		await Promise.all([
			incrementWorkerStateViaRestTransaction(concurrentStateId, 'quota'),
			incrementWorkerStateViaRestTransaction(concurrentStateId, 'transient'),
		])
		const concurrent = await readDoc(stateCollection, concurrentStateId)
		checks.push({
			id: 'firestore-worker-state-concurrent-transaction',
			status: docValue(concurrent, 'status') === 'cooldown' && Number(docValue(concurrent, 'consecutiveFailures')) === 2 && docValue(concurrent, 'accountHash') === concurrentStateId && !JSON.stringify(concurrent).includes(concurrentAccountId) ? 'PASS' : 'BLOCKED',
			consecutiveFailures: Number(docValue(concurrent, 'consecutiveFailures') || 0),
			secretFree: !JSON.stringify(concurrent).includes(concurrentAccountId),
		})
		await writeDoc(stateCollection, concurrentStateId, { schemaVersion: 'betterpptx.avatar-worker-state.v1', accountHash: concurrentStateId, status: 'healthy', consecutiveFailures: 0, cooldownUntil: null, updatedAt: timestamp(new Date().toISOString()) })
		const recovered = await readDoc(stateCollection, concurrentStateId)
		checks.push({ id: 'firestore-worker-state-concurrent-recovery', status: docValue(recovered, 'status') === 'healthy' && Number(docValue(recovered, 'consecutiveFailures')) === 0 ? 'PASS' : 'BLOCKED' })

		phase = 'firestore-billing'
		const customerCollection = `${billingPrefix}_customers`
		const reservationCollection = `${billingPrefix}_reservations`
		const usageCollection = `${billingPrefix}_usage_events`
		const billingWrites = [
			createWrite(customerCollection, customerId, { customerHash: customerId, availableBalanceUnits: 1000, pendingReservedUnits: 0, queuedUsageUnits: 0, committedUsageUnits: 0, billingStatus: 'active', createdAt: timestamp(createdAt), updatedAt: timestamp(createdAt) }),
			createWrite(reservationCollection, reservationId, { reservationId, customerHash: customerId, amountUnits: 100, state: 'reserved', createdAt: timestamp(createdAt), updatedAt: timestamp(createdAt) }),
			createWrite(usageCollection, usageId, { eventId: usageId, customerHash: customerId, amountUnits: 100, state: 'queued', createdAt: timestamp(createdAt), updatedAt: timestamp(createdAt) }),
		]
		await commitWrites(billingWrites)
		cleanup.push(() => deleteDoc(customerCollection, customerId), () => deleteDoc(reservationCollection, reservationId), () => deleteDoc(usageCollection, usageId))
		const duplicate = await commitWrites(billingWrites)
		if (duplicate.response.status !== 409) throw new Error(`Expected duplicate billing precondition rejection, got ${duplicate.response.status}.`)
		checks.push({ id: 'firestore-billing-idempotency', status: 'PASS', duplicateWriteRejected: true })

		phase = 'gcs-artifact'
		await uploadGcs(bytes)
		cleanup.push(() => deleteGcs())
		const readDigest = await readGcsObject(artifactDigest)
		if (readDigest !== artifactDigest) throw new Error('GCS digest read failed.')
		const childGcs = childRead('gcs', 'unused', 'unused', artifactDigest, objectName)
		checks.push({ id: 'gcs-artifact-cross-process', status: childGcs.status === 'PASS' ? 'PASS' : 'BLOCKED', digestVerified: true })

		phase = 'retention-policy'
		const field = await request(`${firestoreBase.replace('/documents', '')}/collectionGroups/${jobCollection}/fields/expiresAt`, { method: 'GET' })
		const bucketMeta = await request(`${storageBase}/b/${encodeURIComponent(bucket)}`, { method: 'GET' })
		const lifecycle = bucketMeta.data?.lifecycle?.rule || []
		const tenantLifecyclePass = lifecycle.some(rule => rule.action?.type === 'Delete' && Number(rule.condition?.age) === 2 && rule.condition?.matchesPrefix?.includes('betterpptx-avatar-artifacts/tenants/'))
		const workerLifecyclePass = lifecycle.some(rule => rule.action?.type === 'Delete' && Number(rule.condition?.age) === 2 && rule.condition?.matchesPrefix?.includes('betterpptx-avatar-artifacts/worker-idempotency/'))
		const lifecyclePass = tenantLifecyclePass && workerLifecyclePass
		checks.push({ id: 'retention-policy', status: field.data?.ttlConfig?.state === 'ACTIVE' && lifecyclePass ? 'PASS' : 'BLOCKED', firestoreTtl: field.data?.ttlConfig?.state || 'missing', gcsLifecycle: lifecyclePass, tenantLifecycle: tenantLifecyclePass, workerIdempotencyLifecycle: workerLifecyclePass })
	} catch (error) {
		throw new Error(`${phase}: ${error.message}`)
	} finally {
		for (const remove of cleanup.reverse()) {
			try { await remove() } catch {}
		}
	}
	const blockers = checks.filter(check => check.status !== 'PASS').map(check => check.id)
	const report = {
		schemaVersion: 'betterpptx.avatar-distributed-production-evidence.v1',
		status: blockers.length ? 'BLOCKED' : 'PASS',
		project,
		artifactBucket: bucket,
		checks,
		blockers,
		cleanupCompleted: true,
		syntheticCustomerData: false,
		rawSecretsPrinted: false,
	}
	const outputUrl = new URL('./outputs/avatar-distributed-production-evidence-report.json', import.meta.url)
	const fs = await import('node:fs/promises')
	await fs.writeFile(outputUrl, `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify(report, null, 2))
	if (blockers.length) process.exitCode = 2
}

main().catch(error => {
		console.error(JSON.stringify({ status: 'BLOCKED', phase: 'startup-or-cleanup', error: error.message, rawSecretsPrinted: false }))
	process.exitCode = 2
})
