#!/usr/bin/env node
// Private research canary for the model-backed avatar workers. It intentionally
// bypasses public MCP packaging so this gate isolates worker authentication,
// request shape, and returned MP4 validity. Inputs are owner-scoped and local;
// temporary raw outputs are deleted before exit and reports never contain URLs
// or token values.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeToneWav } from './narration/audio.mjs'
import { credentialAccounts } from './config/credential-store.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imagePath = path.resolve(String(process.env.BETTERPPTX_AVATAR_CANARY_IMAGE || path.join(projectRoot, 'consentedHumanAsset', 'FullBodyApose.png')))
const timeoutMs = Math.max(30000, Number(process.env.BETTERPPTX_AVATAR_CANARY_TIMEOUT_MS || 240000))
const accountFilter = String(process.env.BETTERPPTX_AVATAR_CANARY_ACCOUNT || '').trim()
const motionProfile = String(process.env.BETTERPPTX_AVATAR_CANARY_MOTION_PROFILE || 'natural').trim()
const accounts = credentialAccounts('avatar-worker').filter(account => !accountFilter || String(account.id || '') === accountFilter)
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-avatar-worker-canary-'))
const audioPath = path.join(tempRoot, 'narration.wav')
const outputPath = path.join(tempRoot, 'avatar.mp4')

function digest(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex')
}

function responseVideoBuffer(response, payload) {
	if (Buffer.isBuffer(payload)) return payload
	const base64 = payload?.videoBase64 || payload?.mp4Base64 || payload?.video?.base64
	return base64 ? Buffer.from(String(base64), 'base64') : null
}

async function run(account) {
	const env = account?.env || {}
	const url = String(env.BETTERPPTX_AVATAR_WORKER_URL || '').trim().replace(/\/+$/, '')
	const route = String(env.BETTERPPTX_AVATAR_WORKER_ROUTE || '/v1/avatar/lipsync').trim()
	const token = String(env.BETTERPPTX_AVATAR_WORKER_TOKEN || '').trim()
	if (!url || !token) return { accountId: String(account.id || ''), status: 'NOT_CONFIGURED' }
	const imageBuffer = await fs.readFile(imagePath)
	const audioBuffer = await fs.readFile(audioPath)
	const body = new FormData()
	body.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'presenter.png')
	body.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'narration.wav')
	body.append('quality', 'fast')
	body.append('mode', 'liveportrait-musetalk')
	body.append('durationMs', '1500')
	body.append('motionProfile', motionProfile)
	body.append('mouthProfile', 'default')
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	const startedAt = Date.now()
	try {
		const response = await fetch(`${url}${route.startsWith('/') ? '' : '/'}${route}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, Accept: 'video/mp4, application/json' },
			body,
			signal: controller.signal,
		})
		const contentType = String(response.headers.get('content-type') || '')
		const payload = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer())
		const video = responseVideoBuffer(response, payload)
		const validMp4 = Boolean(video && video.length > 16 && video.subarray(4, 8).toString('ascii') === 'ftyp')
		if (video) await fs.writeFile(outputPath, video)
		return {
			accountId: String(account.id || ''),
			status: response.ok && validMp4 ? 'PASS' : 'FAIL',
			httpStatus: response.status,
			elapsedMs: Date.now() - startedAt,
			contentType,
			bytes: video?.length || 0,
			mp4: validMp4,
			digest: video ? digest(video) : null,
			pipeline: String(response.headers.get('x-pipeline') || payload?.pipeline || ''),
			gpuType: String(response.headers.get('x-gpu-type') || payload?.gpuType || ''),
			gpuSeconds: Number(response.headers.get('x-gpu-seconds') || payload?.gpuSeconds || 0) || null,
			renderSeconds: Number(response.headers.get('x-render-seconds') || payload?.renderSeconds || 0) || null,
			idempotencyState: String(response.headers.get('x-idempotency-state') || payload?.idempotencyState || ''),
			providerExecutionIds: String(response.headers.get('x-provider-execution-ids') || payload?.providerExecutionIds || '')
				.split(/[,|\s]+/).map(value => value.trim()).filter(Boolean),
		}
	} catch (error) {
		return { accountId: String(account.id || ''), status: error?.name === 'AbortError' ? 'TIMEOUT' : 'ERROR', elapsedMs: Date.now() - startedAt, errorCode: error?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE' }
	} finally {
		clearTimeout(timer)
	}
}

try {
	if (!accounts.length) throw new Error('No enabled avatar-worker account matched the canary filter.')
	await writeToneWav(audioPath, 1.5, 392)
	const results = []
	for (const account of accounts) results.push(await run(account))
	const passed = results.filter(result => result.status === 'PASS').length
	const report = {
		schemaVersion: 'betterpptx.private-avatar-worker-canary.v1',
		capturedAt: new Date().toISOString(),
		status: passed === results.length ? 'research-live-pass' : 'research-live-fail',
		accountCount: results.length,
		results,
		input: { subjectRef: process.env.BETTERPPTX_AVATAR_CANARY_IMAGE ? 'owner-consented-avatar-fixture' : 'local-research-demo-subject-001', durationMs: 1500, mode: 'liveportrait-musetalk', motionProfile, mouthProfile: 'default' },
		researchOnly: true,
		customerImage: false,
		publicHandleCreated: false,
		training: false,
	}
	await fs.mkdir(path.join(projectRoot, 'betterpptx-mcp', 'outputs'), { recursive: true })
	const reportId = results.length === 1 ? String(results[0].accountId || 'unknown').replace(/[^a-z0-9_-]/gi, '_') : 'all'
	await fs.writeFile(path.join(projectRoot, 'betterpptx-mcp', 'outputs', `private-avatar-worker-canary-${reportId}.json`), JSON.stringify(report, null, 2) + '\n')
	console.log(JSON.stringify(report, null, 2))
	assert.equal(passed, results.length)
} finally {
	await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
}
