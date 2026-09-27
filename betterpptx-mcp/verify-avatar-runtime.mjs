#!/usr/bin/env node
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { hashText } from './narration/audio.mjs'
import { writeToneWav } from './narration/audio.mjs'
import { findFfmpeg, findFfprobe, assertPowerPointSafeMp4 } from './avatar/ffmpeg.mjs'
import { renderAvatarNarrationVideo } from './avatar/service.mjs'
import { credentialAccounts } from './config/credential-store.mjs'

const args = new Set(process.argv.slice(2))

function fail(message, detail = {}) {
	console.error('AVATAR RUNTIME VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

async function checkBinary(label, resolver) {
	try {
		const value = await resolver()
		return { ok: true, value }
	} catch (err) {
		fail(`${label} is not available.`, { code: err?.code || 'UNAVAILABLE', message: err?.message || String(err) })
	}
}

async function checkTts() {
	const url = String(process.env.BETTERPPTX_TTS_URL || '').replace(/\/+$/, '')
	if (!url) return null
	const res = await fetch(`${url}/voices`, { headers: { Accept: 'application/json' } })
	if (!res.ok) fail('Piper /voices check failed.', { status: res.status })
	const voices = await res.json()
	return { ok: true, voiceCount: Array.isArray(voices) ? voices.length : 0 }
}

async function checkWorkerHealth() {
	const fromStore = credentialAccounts('avatar-worker')
		.map(account => ({
			id: String(account.id || ''),
			url: String(account.env?.BETTERPPTX_AVATAR_WORKER_URL || '').trim().replace(/\/+$/, ''),
			token: String(account.env?.BETTERPPTX_AVATAR_WORKER_TOKEN || '').trim(),
		}))
		.filter(account => account.id && account.url)
	const accounts = fromStore.length ? fromStore : (() => {
		const url = String(process.env.BETTERPPTX_AVATAR_WORKER_URL || '').trim().replace(/\/+$/, '')
		return url ? [{ id: 'env', url, token: String(process.env.BETTERPPTX_AVATAR_WORKER_TOKEN || '').trim() }] : []
	})()
	if (!accounts.length) return null
	const results = []
	for (const account of accounts) {
		let route = '/healthz'
		let response
		try {
			const headers = { Accept: 'application/json' }
			if (account.token) headers.Authorization = `Bearer ${account.token}`
			response = await fetch(`${account.url}${route}`, { headers, signal: AbortSignal.timeout(10000) })
			if (response.status === 404) {
				route = '/health'
				response = await fetch(`${account.url}${route}`, { headers, signal: AbortSignal.timeout(10000) })
			}
			results.push({ id: account.id, ok: response.ok, route, status: response.status })
		} catch (err) {
			results.push({ id: account.id, ok: false, route, error: err?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE' })
		}
	}
	const healthy = results.filter(result => result.ok).length
	if (!healthy) fail('No configured avatar workers passed health checks.', { configured: accounts.length, results })
	return { ok: healthy === accounts.length, configured: accounts.length, healthy, failed: accounts.length - healthy, results }
}

async function renderTestStatic(tmpDir) {
	process.env.BETTERPPTX_AVATAR_PROVIDER = 'test-static'
	process.env.BETTERPPTX_AVATAR_CACHE_DIR = tmpDir
	process.env.BETTERPPTX_AVATAR_JOB_TTL_MS ||= '60000'
	process.env.BETTERPPTX_AVATAR_JOB_MAX_MB ||= '256'
	const audioPath = path.join(tmpDir, 'avatar-runtime-verify.wav')
	writeToneWav(audioPath, 1.25, 392)
	const rendered = await renderAvatarNarrationVideo({
		avatar: { source: 'default' },
		audioPath,
		durationMs: 1250,
		scriptHash: hashText('Avatar runtime verifier.'),
		provider: 'test-static',
		quality: 'fast',
		mode: 'videoWithAudio',
		sessionId: 'avatar-runtime-verify',
		deckId: 'avatar-runtime-verify',
	})
	await assertPowerPointSafeMp4({
		filePath: rendered.normalizedVideoPath,
		maxSeconds: 10,
		requireAudio: true,
	})
	return {
		ok: true,
		durationMs: rendered.durationMs,
		sizeBytes: rendered.sizeBytes,
		poster: !!rendered.coverDataUri,
		provider: rendered.provider,
	}
}

async function main() {
	const cleanup = !args.has('--keep')
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-avatar-runtime-'))
	try {
		const media = args.has('--render-test-static')
		const ffmpeg = media ? await checkBinary('ffmpeg', findFfmpeg) : null
		const ffprobe = media ? await checkBinary('ffprobe', findFfprobe) : null
		const tts = args.has('--check-tts') ? await checkTts() : null
		const worker = args.has('--check-worker-health') ? await checkWorkerHealth() : null
		const render = args.has('--render-test-static') ? await renderTestStatic(tmpDir) : null
		console.log('AVATAR RUNTIME VERIFY: PASS')
		console.log(JSON.stringify({
			ffmpeg: ffmpeg ? !!ffmpeg.value : null,
			ffprobe: ffprobe ? !!ffprobe.value : null,
			tts,
			worker,
			render,
		}, null, 2))
	} catch (err) {
		fail(err?.message || String(err), { code: err?.code || 'VERIFY_FAILED', details: err?.details || {} })
	} finally {
		if (cleanup) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	}
}

main()
