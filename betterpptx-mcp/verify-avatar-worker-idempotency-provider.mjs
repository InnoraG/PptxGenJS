#!/usr/bin/env node
// Private staging proof through the BetterPPTX provider adapter: the same key is
// sent twice, with the second call expected to replay the worker's terminal MP4.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { writeToneWav } from './narration/audio.mjs'
import { renderMuseTalkHttp } from './avatar/providers/musetalkHttp.mjs'

const root = path.resolve('betterpptx-mcp')
const image = path.resolve('consentedHumanAsset/FullBodyApose.png')
const key = String(process.env.BETTERPPTX_AVATAR_PROVIDER_IDEMPOTENCY_KEY || `provider-idempotency-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-avatar-provider-idem-'))
const audio = path.join(temp, 'narration.wav')
const firstDir = path.join(temp, 'first')
const secondDir = path.join(temp, 'second')
const reportPath = path.join(root, 'outputs/avatar-worker-idempotency-provider-report.json')
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
let report
try {
	await fs.mkdir(firstDir, { recursive: true }); await fs.mkdir(secondDir, { recursive: true }); await writeToneWav(audio, 1.5, 392)
	const first = await renderMuseTalkHttp({ avatarImagePath: image, audioPath: audio, durationMs: 1500, jobDir: firstDir, quality: 'fast', provider: 'liveportrait-musetalk', idempotencyKey: key })
	const firstBytes = await fs.readFile(first.rawVideoPath)
	const second = await renderMuseTalkHttp({ avatarImagePath: image, audioPath: audio, durationMs: 1500, jobDir: secondDir, quality: 'fast', provider: 'liveportrait-musetalk', idempotencyKey: key })
	const secondBytes = await fs.readFile(second.rawVideoPath)
	report = { schemaVersion: 'betterpptx.avatar-worker-idempotency-provider.v1', status: digest(firstBytes) === digest(secondBytes) ? 'PASS' : 'BLOCKED', sameKey: true, firstDigest: digest(firstBytes), secondDigest: digest(secondBytes), firstBytes: firstBytes.length, secondBytes: secondBytes.length, syntheticCustomerData: false, rawSecretsPrinted: false }
} catch (error) {
		report = { schemaVersion: 'betterpptx.avatar-worker-idempotency-provider.v1', status: 'BLOCKED', errorCode: error?.code || 'AVATAR_PROVIDER_FAILED', error: String(error?.message || error), details: error?.details ? { status: error.details.status || null, retryable: error.details.retryable, idempotencyState: error.details.idempotencyState || null, attempts: Array.isArray(error.details.attempts) ? error.details.attempts : [] } : null, syntheticCustomerData: false, rawSecretsPrinted: false }
} finally {
	await fs.mkdir(path.dirname(reportPath), { recursive: true }); await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); await fs.rm(temp, { recursive: true, force: true }).catch(() => {})
}
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 2
