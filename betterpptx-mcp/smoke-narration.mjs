#!/usr/bin/env node
// Local narration smoke for the configured real TTS provider.
// This intentionally exercises the MCP semantic-authoring route.  It must not
// become a second direct-engine or hand-authored-geometry generator.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

const outDir = path.resolve(process.env.BETTERPPTX_NARRATION_SMOKE_OUT_DIR || path.join('outputs', 'narration-smoke'))
process.env.BETTERPPTX_NARRATION_MODE ||= 'production'
process.env.BETTERPPTX_OUT_DIR ||= outDir
process.env.BETTERPPTX_PREMIUM ||= '1'
const allowUnavailable = process.env.BETTERPPTX_NARRATION_SMOKE_ALLOW_UNAVAILABLE !== '0'

await fs.mkdir(outDir, { recursive: true })
const here = path.dirname(fileURLToPath(import.meta.url))
const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: here,
	stderr: 'pipe',
	env: { ...process.env, BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PREMIUM: '1', BETTERPPTX_BILLING_ENFORCE: '0' },
})
const client = new Client({ name: 'narration-smoke', version: '1' }, { capabilities: {} })
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

try {
	await tool('betterpptx.auth.status', {})
	const voices = await tool('betterpptx.narration.voices', {})
	const voice = process.env.BETTERPPTX_TTS_VOICE || voices.voices?.[0]?.id
	if (!voice) throw new Error('No approved narration voice is available.')
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Narration Smoke',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: {
			audience: 'authoring smoke-test reviewers',
			outcome: 'Validate real TTS narration, captions, semantic cues, and automatic slide timing.',
			remember: 'Narration text is the timing authority; the engine derives the media clock and layout.',
		},
		visualDesign: { world: 'Aurora verification surface', framing: 'Minimal semantic proof surface.' },
		motionTime: {
			masterClock: 'narration-text',
			timingSource: 'measured narration media',
			syncPolicy: 'Narration-led autoplay and semantic cue timing.',
		},
		layout: 'LAYOUT_WIDE',
		slides: [
			{
				id: 'narration-smoke-s1', title: 'Narration smoke', role: 'opener',
				message: 'Narration starts automatically on this slide.', layoutIntent: 'title-body',
				content: [{ kind: 'title', name: 'title-1', text: 'Narration smoke' }],
				narration: {
					script: 'This is the first narrated slide. It uses approved speech synthesis for local verification.',
					voice, timingAuthority: 'narration-text',
					captions: { enabled: true, items: [{ text: 'Narration starts automatically.', atMs: 200, endMs: 1800 }] },
				},
			},
			{
				id: 'narration-smoke-s2', title: 'Semantic cue', role: 'build',
				message: 'The cue target animates during the narration.', layoutIntent: 'title-body',
				content: [
					{ kind: 'title', name: 'title-2', text: 'Semantic cue' },
					{ kind: 'callout', name: 'cue-box', text: 'Cue target', region: 'leftThird' },
				],
				narration: {
					script: 'The cue target animates during this narration cue.', voice, timingAuthority: 'narration-text',
					cues: [{ atMs: 650, target: 'cue-box', type: 'emphasis', effect: 'pulse' }],
					captions: { enabled: true, items: [{ text: 'Cue synchronized animation.', atMs: 650, endMs: 2300 }] },
				},
			},
			{
				id: 'narration-smoke-s3', title: 'Validation slide', role: 'closer',
				message: 'Deck-level narration settings remain engine-governed.', layoutIntent: 'title-body',
				content: [{ kind: 'title', name: 'title-3', text: 'Validation slide' }],
				narration: { script: 'The final slide proves deck level narration settings and automatic slide timing.', voice, timingAuthority: 'narration-text' },
			},
		],
	}
	const request = {
		spec,
		commitMode: 'createNew',
		detail: 'summary',
		validateAfterCompile: true,
	}
	const dryRun = await tool('betterpptx.deck.generate_from_spec', { ...request, phase: 'dryRun' })
	const deck = await tool('betterpptx.deck.generate_from_spec', { ...request, phase: 'commit' })
	const deckId = deck.deckId
	const validation = await tool('betterpptx.deck.validate_narration', { deckId })
	if (validation.valid === false) throw new Error(`validate_narration failed: ${JSON.stringify(validation)}`)
	const packageValidation = await tool('betterpptx.deck.validate', { deckId })
	const designValidation = await tool('betterpptx.deck.validate_design', { deckId })
	const accessibilityValidation = await tool('betterpptx.deck.validate_accessibility', { deckId })
	await tool('betterpptx.deck.validate_quality', { deckId })
	const saved = await tool('betterpptx.deck.save', { deckId, outputDir: outDir, fileName: 'narration-smoke.pptx' })
	console.log(JSON.stringify({ ok: true, route: 'betterpptx.deck.generate_from_spec', dryRunDigest: dryRun.planDigest, voice, validation, packageValidation, designValidation, accessibilityValidation, saved }, null, 2))
} catch (err) {
	const unavailable = allowUnavailable && /fetch failed|piper(?:-http)? .*failed|No approved narration voice/i.test(`${err.message} ${err.payload?.error?.message || ''}`)
	if (unavailable) {
		console.log(JSON.stringify({ ok: true, skipped: true, reason: 'NARRATION_UNAVAILABLE', message: 'Narration smoke reached the MCP semantic route but the configured real TTS provider is unavailable.' }, null, 2))
		process.exitCode = 0
	} else {
	console.error(JSON.stringify({ ok: false, code: err.code || 'SMOKE_FAILED', message: err.message, payload: err.payload || null }, null, 2))
	process.exit(1)
	}
} finally {
	try { await client.close() } catch {}
}
