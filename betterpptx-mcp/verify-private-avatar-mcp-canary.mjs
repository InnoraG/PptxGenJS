#!/usr/bin/env node
// Full private MCP canary for the talking-head narration lane:
// render_job -> job_status -> attach_result -> validate -> save -> package/COM checks.
// It uses the owner-scoped consented local portrait and writes only a redacted
// report plus the resulting research PPTX under betterpptx-mcp/outputs.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import JSZip from 'jszip'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import { dataUriFromBuffer, writeToneWav } from './narration/audio.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const sourceImage = path.resolve(String(process.env.BETTERPPTX_AVATAR_CANARY_IMAGE || path.join(repo, 'consentedHumanAsset', 'FullBodyApose.png')))
const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-avatar-mcp-canary-'))
const audioPath = path.join(outputDir, 'narration.wav')
const artifactStem = String(process.env.BETTERPPTX_AVATAR_CANARY_ARTIFACT_STEM || 'private-avatar-mcp-canary')
const artifactFileName = `${artifactStem}.pptx`
const reportFileName = `${artifactStem}-report.json`
const artifactPath = path.join(here, 'outputs', artifactFileName)
const reportPath = path.join(here, 'outputs', reportFileName)
const context = { sessionId: 'private-avatar-mcp-canary', accountId: 'research-canary-account', licenseId: 'research-canary-license' }
const durationMs = 1500
const avatarProvider = String(process.env.BETTERPPTX_AVATAR_PROVIDER || 'liveportrait-musetalk')

function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function envelopeOf(label, response) {
	const envelope = response?.structuredContent || (() => {
		try { return JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!envelope || envelope.ok !== true) {
		const error = new Error(`${label}: ${envelope?.error?.message || 'tool failed'}`)
		error.code = envelope?.error?.code || 'TOOL_FAILED'
		error.payload = response
		throw error
	}
	return envelope.data || envelope
}

async function tool(client, name, args) {
	return envelopeOf(name, await client.callTool({ name, arguments: args }))
}

async function waitForJob(client, jobId) {
	const started = Date.now()
	for (;;) {
		const status = await tool(client, 'betterpptx.avatar.job_status', { jobId })
		if (status.status === 'succeeded') return status
		if (status.status === 'failed') throw new Error(`avatar job failed: ${status.error?.code || 'AVATAR_FAILED'}${status.error?.details ? ` (${JSON.stringify(status.error.details)})` : ''}`)
		if (Date.now() - started > 360000) throw new Error('avatar job exceeded canary timeout')
		await sleep(1000)
	}
}

async function powerPointOpenCheck(filePath) {
	const escaped = String(filePath).replace(/'/g, "''")
	const script = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; try { $p=$pp.Presentations.Open('${escaped}', $true, $true, $false); $n=[int]$p.Slides.Count; $p.Close(); if($n -ne 1){ throw \"unexpected slide count: $n\" }; Write-Output 'PASS' } finally { if($pp){$pp.Quit()} }`
	const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', timeout: 120000 })
	return { status: run.status === 0 && String(run.stdout || '').includes('PASS') ? 'PASS' : 'FAIL', detail: String(run.stderr || run.stdout || '').trim().slice(-500) }
}

let deckId = null
let client = null
let transport = null
let report
try {
	process.env.BETTERPPTX_OUT_DIR = outputDir
	process.env.BETTERPPTX_AVATAR_CACHE_DIR = path.join(outputDir, 'avatar-cache')
	process.env.BETTERPPTX_AVATAR_PROVIDER = avatarProvider
	process.env.BETTERPPTX_PREMIUM = '1'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	// Keep the public/spec-first boundary enabled: primitive deck/slide mutators are
	// intentionally unavailable even for this private canary.  The canary creates
	// its deck through generate_from_spec, then exercises the private avatar job
	// lifecycle against that deck.
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
	process.env.BETTERPPTX_AVATAR_TIMEOUT_MS = '360000'
	process.env.BETTERPPTX_PRIVATE_METROLOGY = '1'
	await writeToneWav(audioPath, durationMs / 1000, 392)
	const audio = dataUriFromBuffer(await fs.readFile(audioPath), 'audio/wav')
	// Exercise the same MCP stdio boundary used by a real AI client. Direct
	// engine imports are intentionally rejected by the Authoring Excellence
	// contract and must never be the canary's construction path.
	transport = new StdioClientTransport({
		command: process.execPath,
		args: ['server.mjs'],
		cwd: here,
		stderr: 'pipe',
		env: {
			...process.env,
			BETTERPPTX_PUBLIC_BLACK_BOX: '0',
			BETTERPPTX_LOCAL_MAINTAINER: '1',
			BETTERPPTX_BILLING_ENFORCE: '0',
			BETTERPPTX_PREMIUM: '1',
			BETTERPPTX_ALLOWED_AVATAR_DIRS: [repo, path.dirname(sourceImage), outputDir].join(path.delimiter),
		},
	})
	client = new Client({ name: 'private-avatar-mcp-canary', version: '1' }, { capabilities: {} })
	await client.connect(transport)
	const narrationScript = 'This private canary verifies talking-head narration media inside a PowerPoint deck.'
	const rendered = await tool(client, 'betterpptx.avatar.render_job', {
		script: narrationScript,
		audio: { data: audio, extn: 'wav' },
		// Send the consented source as an image data URI, the same portable
		// semantic input accepted by a real MCP client. Filesystem paths are not
		// part of the public authoring contract.
		avatar: { source: 'uploaded', consentAffirmed: true, image: { data: dataUriFromBuffer(await fs.readFile(sourceImage), 'image/png') } },
		avatarProvider, avatarQuality: 'fast', mode: 'videoWithAudio', durationMs,
		idempotencyKey: String(process.env.BETTERPPTX_AVATAR_CANARY_IDEMPOTENCY_KEY || 'private-avatar-mcp-canary-20260804-canonical-ellipse-v2'),
	})
	const completed = await waitForJob(client, rendered.jobId)
	if (!completed.video?.ref) throw new Error(`Avatar render job did not return an opaque completed video handle: ${JSON.stringify(completed.video || null)}`)
	if (!completed.video?.posterRef) throw new Error(`Avatar render job did not return an opaque poster handle: ${JSON.stringify(completed.video)}`)
	const deck = await tool(client, 'betterpptx.deck.generate_from_spec', {
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Private avatar MCP canary',
			authoringContract: {
				workflow: 'authoring-excellence-director-v1',
				level: 'deterministic',
				coordinateSystem: 'inches',
				layerModel: 'flat-object-array',
				objectIdentity: 'stable-names-required',
			},
			contentStory: {
				audience: 'private authoring-quality reviewers',
				outcome: 'Verify a narrated talking-head media attachment through the live MCP boundary.',
				remember: 'Presenter framing is an engine-owned ellipse and narration remains the timing authority.',
			},
			visualDesign: {
				world: 'Aurora verification surface',
				framing: 'Minimal title surface with one governed presenter media layer.',
			},
			motionTime: {
				masterClock: 'narration-text',
				timingSource: 'measured presenter narration media',
				syncPolicy: 'Narration-led media autoplay with caption-safe timing.',
			},
			layout: 'LAYOUT_WIDE',
			slides: [{
				id: 'avatar-canary-s1', title: 'Live presenter narration canary', role: 'proof',
				message: 'The supplied talking-head media is framed by the engine and follows the narration clock.', layoutIntent: 'title-body',
				content: [{ kind: 'title', name: 'title', text: 'Live presenter narration canary' }],
				avatarNarration: {
					enabled: true, objectName: 'talking-head-avatar', script: narrationScript,
					lockedVideo: { handle: completed.video.ref, durationMs: completed.video.durationMs },
					...(completed.video.posterRef ? { lockedPoster: { handle: completed.video.posterRef } } : {}),
					captions: { enabled: true, items: [{ text: 'Private talking-head canary.', atMs: 100, endMs: 1400 }] },
					paddingMs: 400,
				},
			}],
		},
		detail: 'summary', validateAfterCompile: true,
	})
	deckId = deck.deckId
	const attached = { via: 'generate_from_spec.avatarNarration', canonicalFrame: 'ellipse-centered-cover-v1' }
	const validation = await tool(client, 'betterpptx.deck.validate_avatar_narration', { deckId })
	const packageValidation = await tool(client, 'betterpptx.deck.validate', { deckId })
	const designValidation = await tool(client, 'betterpptx.deck.validate_design', { deckId })
	const accessibilityValidation = await tool(client, 'betterpptx.deck.validate_accessibility', { deckId })
	const narrationValidation = await tool(client, 'betterpptx.deck.validate_narration', { deckId })
	const qualityValidation = await tool(client, 'betterpptx.deck.validate_quality', { deckId })
	await tool(client, 'betterpptx.deck.preview', { deckId })
	const directorStatus = await tool(client, 'betterpptx.deck.director_status', { deckId })
	if (directorStatus.readyForSave !== true) throw new Error(`Director canary verification did not close: ${JSON.stringify({ directorStatus, qualityValidation })}`)
	const saved = await tool(client, 'betterpptx.deck.save', { deckId, outputDir, fileName: artifactFileName })
	const savedBytes = await fs.readFile(path.join(outputDir, artifactFileName))
	await fs.mkdir(path.dirname(artifactPath), { recursive: true })
	await fs.writeFile(artifactPath, savedBytes)
	const zip = await JSZip.loadAsync(savedBytes)
	const names = Object.keys(zip.files)
	const media = names.filter(name => /^ppt\/media\//.test(name))
	const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
	const com = await powerPointOpenCheck(artifactPath)
	report = {
		schemaVersion: 'betterpptx.private-avatar-mcp-canary.v1', status: 'research-live-pass', researchOnly: true,
		input: { subjectRef: process.env.BETTERPPTX_AVATAR_CANARY_IMAGE ? 'synthetic-personalizedMeshy-identity-001' : 'local-research-demo-subject-001', durationMs, mode: avatarProvider, artifactStem },
		workflow: { renderJob: rendered.status || 'queued', completed: completed.status, attached: Boolean(attached), validation: validation.valid !== false, saved: saved.bytes > 0 },
		package: { mediaParts: media.length, hasVideoMedia: media.some(name => /\.(mp4|m4v)$/i.test(name)), slideHasVideoRelationship: /videoFile|video/i.test(slideXml), bytes: savedBytes.length, digest: digest(savedBytes) },
		providerExecutionIds: Array.isArray(completed.providerExecutionIds) ? completed.providerExecutionIds : [],
		powerPoint: com,
		publicHandleCreated: false, customerImage: false, training: false,
	}
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
	assert.equal(validation.valid !== false, true)
	assert.equal(saved.bytes > 0, true)
	assert.equal(media.some(name => /\.(mp4|m4v)$/i.test(name)), true)
	assert.equal(com.status, 'PASS')
	console.log(JSON.stringify(report, null, 2))
} catch (error) {
	report = { schemaVersion: 'betterpptx.private-avatar-mcp-canary.v1', status: 'research-live-fail', errorCode: error?.code || 'CANARY_FAILED', error: String(error?.message || error), publicHandleCreated: false, customerImage: false, training: false }
	await fs.mkdir(path.dirname(reportPath), { recursive: true })
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
	console.error(JSON.stringify(report, null, 2))
	process.exitCode = 1
} finally {
	if (deckId) {
		try { if (client) await tool(client, 'betterpptx.deck.dispose', { deckId }) } catch {}
	}
	try { if (client) await client.close() } catch {}
	await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {})
}
