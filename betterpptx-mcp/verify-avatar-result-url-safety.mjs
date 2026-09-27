#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-avatar-url-safety-'))
const storePath = path.join(root, 'credentials.json')
const imagePath = path.join(root, 'avatar.png')
const audioPath = path.join(root, 'voice.wav')
const jobDir = path.join(root, 'job')
await fs.mkdir(jobDir)
await fs.writeFile(imagePath, Buffer.from('synthetic-image'))
await fs.writeFile(audioPath, Buffer.from('synthetic-audio'))
await fs.writeFile(storePath, JSON.stringify({ schemaVersion: 'betterpptx.credential-store.v1', providers: {
	'avatar-worker': { activeAccountId: 'synthetic', accounts: [{ id: 'synthetic', enabled: true, env: {
		BETTERPPTX_AVATAR_WORKER_URL: 'https://worker.example.invalid',
		BETTERPPTX_AVATAR_WORKER_ROUTE: '/v1/avatar/lipsync',
		BETTERPPTX_AVATAR_WORKER_TOKEN: 'synthetic-token',
	} }] },
} }))
process.env.BETTERPPTX_CREDENTIAL_STORE = storePath
process.env.BETTERPPTX_AVATAR_WORKER_ALLOW_RESULT_URLS = '1'
delete process.env.BETTERPPTX_AVATAR_RESULT_URL_HOSTS
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, options = {}) => {
	assert.equal(options.method, 'POST')
	assert.match(String(url), /worker\.example\.invalid/)
	return new Response(JSON.stringify({ downloadUrl: 'https://evil.example.invalid/video.mp4' }), { status: 200, headers: { 'content-type': 'application/json' } })
}
try {
	const { renderMuseTalkHttp } = await import('./avatar/providers/musetalkHttp.mjs')
	await assert.rejects(
		() => renderMuseTalkHttp({ avatarImagePath: imagePath, audioPath, durationMs: 1000, jobDir, provider: 'liveportrait-musetalk' }),
		err => err?.code === 'AVATAR_UNAVAILABLE',
	)
	console.log('AVATAR RESULT URL SAFETY VERIFY: PASS')
} finally {
	globalThis.fetch = originalFetch
	await fs.rm(root, { recursive: true, force: true })
}
