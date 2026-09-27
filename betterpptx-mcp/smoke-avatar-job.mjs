#!/usr/bin/env node
// Local async avatar render job smoke.
// Uses generated WAV audio so this test does not require Piper.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import { dataUriFromBuffer, writeToneWav } from './narration/audio.mjs'

const outDir = path.resolve(process.env.BETTERPPTX_AVATAR_JOB_SMOKE_OUT_DIR || path.join('outputs', 'avatar-job-smoke'))
const fixtureImage = path.resolve('betterpptx-mcp/avatar/assets/default-presenter.png')
process.env.BETTERPPTX_OUT_DIR ||= outDir
process.env.BETTERPPTX_AVATAR_PROVIDER ||= 'test-static'
process.env.BETTERPPTX_PREMIUM ||= '1'

const allowUnavailable = process.env.BETTERPPTX_AVATAR_SMOKE_ALLOW_UNAVAILABLE !== '0'
const unavailableCodes = new Set(['AVATAR_UNAVAILABLE', 'MEDIA_PROBE_FAILED', 'MEDIA_NORMALIZE_FAILED'])
const pollTimeoutMs = Math.max(1000, Number(process.env.BETTERPPTX_AVATAR_JOB_SMOKE_TIMEOUT_MS || 45000))

await fs.mkdir(outDir, { recursive: true })
const here = path.dirname(fileURLToPath(import.meta.url))
const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: here,
	stderr: 'pipe',
	env: { ...process.env, BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PREMIUM: '1', BETTERPPTX_BILLING_ENFORCE: '0' },
})
const client = new Client({ name: 'avatar-job-smoke', version: '1' }, { capabilities: {} })
await client.connect(transport)

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function tool(name, args) {
	const response = await client.callTool({ name, arguments: args })
	const res = response?.structuredContent || JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}')
	if (!res?.ok) {
		const err = new Error(`${name}: ${res?.error?.message || 'failed'}`)
		err.code = res?.error?.code || 'TOOL_ERROR'
		err.payload = res
		throw err
	}
	return res.data
}

async function smokeAudioData(seconds = 1.6) {
	const wavPath = path.join(outDir, 'avatar-job-smoke.wav')
	writeToneWav(wavPath, seconds, 330)
	return dataUriFromBuffer(await fs.readFile(wavPath), 'audio/wav')
}

async function waitForJob(jobId) {
	const started = Date.now()
	for (;;) {
		const status = await tool('betterpptx.avatar.job_status', { jobId })
		if (status.status === 'succeeded') return status
		if (status.status === 'failed') {
			const err = new Error('Avatar render job failed.')
			err.code = status.error?.code || 'AVATAR_FAILED'
			err.payload = status
			throw err
		}
		if (Date.now() - started > pollTimeoutMs) {
			const err = new Error('Avatar render job did not finish before the smoke timeout.')
			err.code = 'AVATAR_JOB_TIMEOUT'
			err.payload = status
			throw err
		}
		await sleep(500)
	}
}

try {
	const audioData = await smokeAudioData()
	const render = await tool('betterpptx.avatar.render_job', {
		script: 'This render job validates the asynchronous avatar workflow.',
		audio: { data: audioData, extn: 'wav' },
		avatar: { source: 'uploaded', consentAffirmed: true, image: { data: dataUriFromBuffer(await fs.readFile(fixtureImage), 'image/png') } },
		avatarQuality: 'fast',
		mode: 'videoWithAudio',
		durationMs: 1600,
	})
	const completed = await waitForJob(render.jobId)
	if (!completed.video?.ref || !completed.video?.posterRef) throw new Error('Avatar job did not return opaque video/poster handles.')
	const deck = await tool('betterpptx.deck.generate_from_spec', {
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'Avatar Job Smoke',
			authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
			contentStory: { audience: 'authoring smoke-test reviewers', outcome: 'Validate the asynchronous avatar workflow.', remember: 'The MCP job result is attached through the semantic presenter contract.' },
			visualDesign: { world: 'Aurora verification surface', framing: 'Minimal semantic proof surface.' },
			motionTime: { masterClock: 'narration-text', timingSource: 'measured presenter narration media', syncPolicy: 'Narration-led media autoplay.' },
			layout: 'LAYOUT_WIDE', slides: [{ id: 'avatar-job-smoke-s1', title: 'Async avatar job smoke', role: 'proof', message: 'The completed avatar job is attached through the semantic Authoring Excellence contract.', layoutIntent: 'title-body', content: [{ kind: 'title', name: 'title', text: 'Async avatar job smoke' }], avatarNarration: { enabled: true, objectName: 'avatar-job-video', script: 'This render job validates the asynchronous avatar workflow.', lockedVideo: { handle: completed.video.ref, durationMs: completed.video.durationMs }, lockedPoster: { handle: completed.video.posterRef }, captions: { enabled: true, items: [{ text: 'Async avatar render attached.', atMs: 100, endMs: 1400 }] }, paddingMs: 500 } }],
		},
		detail: 'summary', validateAfterCompile: true,
	})
	const deckId = deck.deckId
	const attached = { via: 'generate_from_spec.avatarNarration', canonicalFrame: 'ellipse-centered-cover-v1' }
	const validation = await tool('betterpptx.deck.validate_avatar_narration', { deckId })
	if (validation.valid === false) throw new Error(`validate_avatar_narration failed: ${JSON.stringify(validation)}`)
	await tool('betterpptx.deck.validate_quality', { deckId })
	const saved = await tool('betterpptx.deck.save', {
		deckId,
		outputDir: outDir,
		fileName: 'avatar-job-smoke.pptx',
	})
	console.log(JSON.stringify({ ok: true, render, completed, attached, validation, saved }, null, 2))
} catch (err) {
	if (allowUnavailable && unavailableCodes.has(err.code)) {
		console.log(JSON.stringify({
			ok: true,
			skipped: true,
			reason: err.code,
			message: 'Avatar job smoke skipped because ffmpeg/ffprobe or an avatar worker is not configured.',
		}, null, 2))
	} else {
		console.error(JSON.stringify({ ok: false, code: err.code || 'SMOKE_FAILED', message: err.message, payload: err.payload || null }, null, 2))
		process.exit(1)
	}
} finally {
	try { await client.close() } catch {}
}
