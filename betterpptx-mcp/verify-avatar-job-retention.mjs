#!/usr/bin/env node
// Local contract evidence for durable avatar-job metadata retention. Production
// still requires the Firestore TTL/purge schedule; this verifier proves the
// record shape and deletion semantics without exposing media paths.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-avatar-retention-'))
process.env.BETTERPPTX_AVATAR_JOB_STORE = 'local'
process.env.BETTERPPTX_AVATAR_JOB_STORE_FILE = path.join(tempDir, 'avatar-jobs.json')
process.env.BETTERPPTX_AVATAR_JOB_TTL_MS = '3600000'

const {
	createAvatarJobStore,
	durableAvatarJobRecord,
	persistAvatarJob,
	loadAvatarJob,
	purgeExpiredAvatarJobs,
} = await import('./storage/avatar-job-store.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const now = new Date('2026-07-18T12:00:00.000Z')
const old = new Date(now.getTime() - 7200000).toISOString()
const fresh = new Date(now.getTime() - 1000).toISOString()

try {
	const oldRecord = durableAvatarJobRecord({
		id: 'avatar_job_old',
		sessionId: 'tenant-a-session',
		deckId: 'deck-a',
		status: 'succeeded',
		createdAt: old,
		completedAt: old,
		result: { ref: 'asset://opaque/video-old', posterRef: 'asset://opaque/poster-old', durationMs: 1500 },
	})
	const freshRecord = durableAvatarJobRecord({
		id: 'avatar_job_fresh',
		sessionId: 'tenant-a-session',
		deckId: 'deck-a',
		status: 'succeeded',
		createdAt: fresh,
		completedAt: fresh,
		result: { ref: 'asset://opaque/video-fresh', posterRef: 'asset://opaque/poster-fresh', durationMs: 1500 },
	})
	expect(oldRecord.expiresAt && freshRecord.expiresAt, 'Every durable record must carry an expiration timestamp.')
	expect(oldRecord.result?.ref === 'asset://opaque/video-old' && oldRecord.result?.posterRef === 'asset://opaque/poster-old', 'Verifier fixture should use opaque handles only.', { oldRecord })
	expect(!JSON.stringify(oldRecord).match(/[A-Za-z]:\\|\/tmp\/|avatar-narration/), 'Durable metadata must not contain raw filesystem paths.', { oldRecord })
	await persistAvatarJob({ ...oldRecord, id: oldRecord.jobId, result: { publicVideo: oldRecord.result } })
	await persistAvatarJob({ ...freshRecord, id: freshRecord.jobId, result: { publicVideo: freshRecord.result } })

	const before = await loadAvatarJob(oldRecord.jobId)
	expect(before?.expiresAt, 'Persisted metadata must retain expiresAt before cleanup.')
	const purge = await purgeExpiredAvatarJobs(now)
	expect(purge.provider === 'local' && purge.removed === 1, 'Retention purge should remove only the expired record.', { purge })
	expect(await loadAvatarJob(oldRecord.jobId) === null, 'Expired metadata should be removed.')
	expect((await loadAvatarJob(freshRecord.jobId))?.jobId === freshRecord.jobId, 'Fresh metadata should remain available.', { fresh: await loadAvatarJob(freshRecord.jobId) })

	const report = {
		schemaVersion: 'betterpptx.avatar-job-retention-report.v1',
		status: 'PASS',
		provider: 'local-contract',
		expiresAt: true,
		opaqueHandles: true,
		rawPathLeak: false,
		purged: purge.removed,
		freshRetained: true,
	}
	const reportPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-job-retention-report.json')
	fs.mkdirSync(path.dirname(reportPath), { recursive: true })
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log('AVATAR JOB RETENTION: PASS expiresAt=1 opaqueHandles=1 rawPathLeak=0 purged=1 freshRetained=1')
} catch (error) {
	const reportPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-job-retention-report.json')
	fs.mkdirSync(path.dirname(reportPath), { recursive: true })
	fs.writeFileSync(reportPath, `${JSON.stringify({ schemaVersion: 'betterpptx.avatar-job-retention-report.v1', status: 'BLOCKED', error: { code: error?.code || 'VERIFY_FAILED', message: error?.message || String(error), details: error?.details || {} } }, null, 2)}\n`)
	console.error(`AVATAR JOB RETENTION: BLOCKED ${error?.message || error}`)
	process.exitCode = 2
} finally {
	try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
}
