#!/usr/bin/env node
// Cross-process metadata proof. It does not pretend to prove a distributed
// worker; it proves that status ownership survives a process restart when the
// configured job metadata backend is enabled, while raw media stays absent.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-avatar-job-durable-'))
const store = path.join(dir, 'avatar-jobs.json')
process.env.BETTERPPTX_AVATAR_JOB_STORE = 'local'
process.env.BETTERPPTX_AVATAR_JOB_STORE_FILE = store
process.env.BETTERPPTX_AVATAR_JOB_TTL_MS = '3600000'

const { createAvatarJob } = await import('./avatar/jobs.mjs')
const ref = `asset://locked/avatar-video/${'a'.repeat(64)}.mp4`
const job = await createAvatarJob({
	sessionId: 'durable-session-a',
	deckId: 'durable-deck-a',
	task: async () => ({ ref, publicVideo: { ref, durationMs: 1500, extn: 'mp4', cacheHit: false } }),
})
const jobId = job.jobId
await new Promise(resolve => setTimeout(resolve, 50))
const deadline = Date.now() + 3000
while (Date.now() < deadline) {
	try {
		const current = JSON.parse(fs.readFileSync(store, 'utf8')).jobs?.[jobId]
		if (current?.status === 'succeeded') break
	} catch {}
	await new Promise(resolve => setTimeout(resolve, 25))
}
const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import { getAvatarJobAsync, assertAvatarJobAccess, publicAvatarJob } from './betterpptx-mcp/avatar/jobs.mjs';
  const job = await getAvatarJobAsync(${JSON.stringify(jobId)});
  if (!job || job.status !== 'succeeded') throw new Error('durable job was not rehydrated');
  assertAvatarJobAccess(job, { sessionId: 'durable-session-a' });
  let denied = false; try { assertAvatarJobAccess(job, { sessionId: 'durable-session-b' }); } catch (e) { denied = e.code === 'AVATAR_JOB_NOT_FOUND'; }
  if (!denied) throw new Error('cross-session access was not denied');
  const publicJob = publicAvatarJob(job);
  if (publicJob.video?.ref !== job.result?.ref) throw new Error('public job did not preserve opaque video handle');
  console.log(JSON.stringify({ status: job.status, ref: job.result?.ref || null, denied, publicRef: publicJob.video.ref }));
`], {
	encoding: 'utf8',
	env: { ...process.env, BETTERPPTX_AVATAR_JOB_STORE: 'local', BETTERPPTX_AVATAR_JOB_STORE_FILE: store },
	cwd: process.cwd(),
})
assert.equal(child.status, 0, child.stderr || child.stdout)
const proof = JSON.parse(String(child.stdout).trim())
assert.equal(proof.status, 'succeeded')
assert.equal(proof.ref, ref)
assert.equal(proof.denied, true)
assert.equal(proof.publicRef, ref)
const raw = fs.readFileSync(store, 'utf8')
assert.equal(/normalizedVideoPath|posterPath|coverDataUri|https?:\/\//i.test(raw), false)
const evidencePath = path.resolve('betterpptx-mcp/outputs/avatar-job-durability-report.json')
fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
fs.writeFileSync(evidencePath, JSON.stringify({
	schemaVersion: 'betterpptx.avatar-job-durability.v1',
	status: 'PASS',
	restart: true,
	ownership: true,
	opaqueHandle: true,
	rawPathLeak: false,
}, null, 2) + '\n')
console.log(`AVATAR JOB DURABILITY: PASS restart=1 ownership=1 opaqueHandle=1 rawPathLeak=0 jobId=${jobId}`)
