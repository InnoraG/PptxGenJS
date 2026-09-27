#!/usr/bin/env node
// Local avatar narration packaging smoke.
// This deliberately exercises the public MCP semantic-authoring front door;
// it must not become a second hand-authored geometry/generator path.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import { dataUriFromBuffer, writeToneWav } from './narration/audio.mjs'

const outDir = path.resolve(process.env.BETTERPPTX_AVATAR_SMOKE_OUT_DIR || path.join('outputs', 'avatar-smoke'))
const fixtureImage = path.resolve('betterpptx-mcp/avatar/assets/default-presenter.png')
process.env.BETTERPPTX_OUT_DIR ||= outDir
process.env.BETTERPPTX_AVATAR_PROVIDER ||= 'test-static'
process.env.BETTERPPTX_PREMIUM ||= '1'

const allowUnavailable = process.env.BETTERPPTX_AVATAR_SMOKE_ALLOW_UNAVAILABLE !== '0'
const unavailableCodes = new Set(['AVATAR_UNAVAILABLE', 'MEDIA_PROBE_FAILED', 'MEDIA_NORMALIZE_FAILED'])

await fs.mkdir(outDir, { recursive: true })
const here = path.dirname(fileURLToPath(import.meta.url))
const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: here,
	stderr: 'pipe',
	env: { ...process.env, BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PREMIUM: '1', BETTERPPTX_BILLING_ENFORCE: '0' },
})
const client = new Client({ name: 'avatar-narration-smoke', version: '1' }, { capabilities: {} })
await client.connect(transport)

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

async function smokeAudioData(seconds = 1.8) {
	const wavPath = path.join(outDir, 'avatar-smoke.wav')
	writeToneWav(wavPath, seconds, 392)
	return dataUriFromBuffer(await fs.readFile(wavPath), 'audio/wav')
}

try {
	const audioData = await smokeAudioData()
	const imageData = dataUriFromBuffer(await fs.readFile(fixtureImage), 'image/png')
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Avatar Narration Smoke',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: {
			audience: 'authoring smoke-test reviewers',
			outcome: 'Validate avatar video insertion, timing, captions, and a synchronized cue.',
			remember: 'Narration is the timing authority; presenter media owns only the governed identity lane.',
		},
		visualDesign: {
			world: 'Aurora verification surface',
			framing: 'Minimal semantic proof surface with balanced title and cue content.',
			contrast: 'high',
		},
		motionTime: {
			masterClock: 'narration-text',
			timingSource: 'measured presenter narration media',
			syncPolicy: 'Narration-led media autoplay with semantic cue timing.',
		},
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'avatar-smoke-s1',
			title: 'Avatar narration smoke',
			role: 'proof',
			message: 'The presenter media, captions, and cue are compiled from semantic intent.',
			layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'title', text: 'Avatar narration smoke' },
				{ kind: 'textShape', name: 'cue-target', text: 'Cue target', region: 'leftThird' },
			],
			avatarNarration: {
				enabled: true,
				objectName: 'avatar-smoke-video',
				script: 'This slide validates avatar video insertion, timing, captions, and a synchronized cue.',
				audio: { data: audioData, extn: 'wav' },
				avatar: { source: 'uploaded', consentAffirmed: true, image: { data: imageData } },
				avatarProvider: 'test-static',
				avatarQuality: 'fast',
				mode: 'videoWithAudio',
				renderPolicy: { renderMode: 'inline', provider: 'test-static', quality: 'fast' },
				cues: [{ atMs: 650, target: 'cue-target', type: 'emphasis', effect: 'pulse', duration: 500 }],
				captions: { enabled: true, items: [{ text: 'Avatar narration starts.', atMs: 100, endMs: 1500 }] },
				paddingMs: 500,
			},
		}],
	}
	const deck = await tool('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'commit',
		commitMode: 'createNew',
		detail: 'summary',
		validateAfterCompile: true,
	})
	const deckId = deck.deckId
	const validation = await tool('betterpptx.deck.validate_avatar_narration', { deckId })
	if (validation.valid === false) throw new Error(`validate_avatar_narration failed: ${JSON.stringify(validation)}`)
	await tool('betterpptx.deck.validate_quality', { deckId })
	const saved = await tool('betterpptx.deck.save', {
		deckId,
		outputDir: outDir,
		fileName: 'avatar-narration-smoke.pptx',
	})
	console.log(JSON.stringify({ ok: true, route: 'betterpptx.deck.generate_from_spec', validation, saved }, null, 2))
} catch (err) {
	if (allowUnavailable && unavailableCodes.has(err.code)) {
		console.log(JSON.stringify({
			ok: true,
			skipped: true,
			reason: err.code,
			message: 'Avatar packaging smoke skipped because ffmpeg/ffprobe or an avatar worker is not configured.',
		}, null, 2))
	} else {
		console.error(JSON.stringify({ ok: false, code: err.code || 'SMOKE_FAILED', message: err.message, payload: err.payload || null }, null, 2))
		process.exit(1)
	}
} finally {
	try { await client.close() } catch {}
}
