#!/usr/bin/env node
// G1 delivery-candidate builder. This is intentionally only an MCP client and
// evidence harness: presentation construction happens through the public
// Authoring Excellence JSON-spec surface. It never imports the PPTX engine,
// edits ZIP/XML, or promotes an ordinary slide-media object into a presenter.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import JSZip from 'jszip'
import { validateAvatarNarrationPackage } from './avatar/validate.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(root, '..')
const dateTag = '20260814'
const outputDir = path.join(root, 'outputs', `g1-native-recordstudio-${dateTag}`)
const downloadRoot = path.join(outputDir, 'downloads')
await fs.mkdir(downloadRoot, { recursive: true })

const narrationScript = 'Welcome, everyone! Today I am going to show you how we made our entire platform ten times faster.'
const candidates = [
	{
		id: 'avatar-delivery-square-sanitized',
		media: 'betterpptx-mcp/outputs/commercial-promotion-20260727/telcomgapp-blink-canary.mp4',
		world: 'luxe',
		mode: 'dark',
		title: 'AI-authored Record Studio',
		message: 'Editable narration, synchronized presenter, and playback timing remain one native session.',
		statement: 'One editable narration source. One native presenter session. One playback clock.',
		userNotes: 'Owner note: review identity, lip sync, pause/resume, replay, and the centered ellipse crop. This text must never be narrated.',
	},
	{
		id: 'avatar-delivery-sanitized',
		media: 'betterpptx-mcp/outputs/commercial-promotion-20260727/fluxworkerai-blink-canary.mp4',
		world: 'editorial',
		mode: 'light',
		title: 'Text is the recording source',
		message: 'The final BetterPPTX narration block can be edited and used to regenerate voice, presenter, and timing together.',
		statement: 'Free user notes stay free. Only the final narration block drives the recording.',
		userNotes: 'Owner note: confirm that this editorial variant opens and plays naturally. Keep this private review note unchanged.',
	},
	{
		id: 'avatar-delivery-narration-sanitized',
		media: 'betterpptx-mcp/outputs/commercial-promotion-20260727/fluxworkerai-hotfix-canary.mp4',
		world: 'observatory',
		mode: 'dark',
		title: 'One native playback clock',
		message: 'The AI-authored Record Studio capture owns autoplay, pause, resume, replay, and slide advance.',
		statement: 'No duplicate audio. No rectangular presenter fallback. No delivery-time implementation diagnostics.',
		userNotes: 'Owner note: inspect playback controls and the absence of duplicate presenter visuals. This remains user-owned text.',
	},
]

function envelope(label, result) {
	const parsed = result?.structuredContent || (() => {
		try { return JSON.parse(result?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!parsed || parsed.ok !== true) throw new Error(`${label} failed: ${JSON.stringify(parsed || result)}`)
	return parsed.data || parsed
}

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function localDownloadPath(downloadUrl) {
	const parsed = new URL(downloadUrl)
	const match = parsed.pathname.match(/^\/files\/([^/]+)\/(.+)$/)
	if (!match) throw new Error(`Unexpected public download URL shape: ${parsed.pathname}`)
	return path.join(downloadRoot, match[1], decodeURIComponent(match[2]))
}

function centeredSquareCrop(width, height) {
	const w = Number(width)
	const h = Number(height)
	if (!(w > 0 && h > 0)) return { left: 0, right: 0, top: 0, bottom: 0 }
	if (w > h) {
		const side = ((w - h) / (2 * w)) * 100
		return { left: side, right: side, top: 0, bottom: 0 }
	}
	if (h > w) {
		const side = ((h - w) / (2 * h)) * 100
		return { left: 0, right: 0, top: side, bottom: side }
	}
	return { left: 0, right: 0, top: 0, bottom: 0 }
}

async function packageInventory(filePath) {
	const bytes = await fs.readFile(filePath)
	const zip = await JSZip.loadAsync(bytes)
	const videos = []
	for (const [name, entry] of Object.entries(zip.files)) {
		if (entry.dir || !/^ppt\/media\/.+\.mp4$/i.test(name)) continue
		const payload = await entry.async('nodebuffer')
		videos.push({ name, bytes: payload.length, sha256: sha256(payload) })
	}
	const privateVocabulary = /x-pipeline|x-enhancement|x-restoreformer-seconds|x-restoreformer-segments|liveportrait|musetalk|restoreformer|providerexecutionid|executionid/ig
	const hits = []
	for (const [name, entry] of Object.entries(zip.files)) {
		if (entry.dir || !/\.(?:xml|rels|json|txt|vml)$/i.test(name)) continue
		const text = await entry.async('string')
		const tokens = [...new Set((text.match(privateVocabulary) || []).map(token => token.toLowerCase()))]
		if (tokens.length) hits.push({ part: name, tokens })
	}
	return { bytes: bytes.length, sha256: sha256(bytes), videos, privateVocabularyHits: hits }
}

function specFor(candidate, uploaded) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: `${candidate.title} · owner review`,
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only',
		},
		contentStory: {
			audience: 'presentation owner',
			outcome: 'Review a fresh AI-authored native Record Studio delivery candidate.',
			remember: 'Editable narration text owns voice, presenter playback, and timing.',
		},
		visualDesign: {
			world: candidate.world,
			framing: 'A polished owner-review proof surface with a clear presenter identity lane.',
		},
		motionTime: {
			masterClock: 'native Record Studio narration',
			timingSource: 'completed synchronized presenter capture',
			syncPolicy: 'One authored clock governs presenter playback and slide advance.',
		},
		styleIntent: {
			artDirection: candidate.world,
			mode: candidate.mode,
			density: 'executive-medium',
			tone: 'confident',
		},
		slides: [{
			id: candidate.id,
			role: 'proof',
			title: candidate.title,
			message: candidate.message,
			notes: candidate.userNotes,
			layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'title', text: candidate.title, region: 'title' },
				{ kind: 'textBox', name: 'statement', text: candidate.statement, region: 'body' },
			],
			avatarNarration: {
				enabled: true,
				objectName: 'Native Record Studio Presenter',
				script: narrationScript,
				avatarAsset: uploaded.handle,
				cover: uploaded.poster.handle,
				durationMs: uploaded.durationMs,
				mode: 'videoWithAudio',
				interactivePlayback: true,
				paddingMs: 700,
			},
		}],
	}
}

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: root,
	stderr: 'pipe',
	env: {
		...process.env,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
		BETTERPPTX_LOCAL_MAINTAINER: '0',
		BETTERPPTX_PREMIUM: '1',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_PUBLIC_BASE: 'http://local.invalid',
		BETTERPPTX_DOWNLOAD_ROOT: downloadRoot,
		BETTERPPTX_FFPROBE_PATH: path.join(root, 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
	},
})
const client = new Client({ name: 'g1-native-recordstudio-rebuilder', version: '3' }, { capabilities: {} })
await client.connect(transport)

const results = []
try {
	await client.callTool({ name: 'betterpptx.help.capabilities', arguments: {
		detail: 'full',
		intent: 'Create fresh AI-authored native Record Studio owner-review candidates with editable narration notes and engine-owned presenter geometry.',
	} })
	for (const candidate of candidates) {
		console.error(`[G1] native build ${candidate.id}`)
		const sourcePath = path.resolve(workspaceRoot, candidate.media)
		const sourceBytes = await fs.readFile(sourcePath)
		const uploaded = envelope('assets.upload', await client.callTool({
			name: 'betterpptx.assets.upload',
			arguments: {
				kind: 'video',
				fileName: `${candidate.id}.mp4`,
				data: `data:video/mp4;base64,${sourceBytes.toString('base64')}`,
			},
		})).asset
		if (!uploaded.hasVideoStream || !uploaded.hasAudioStream || !uploaded.poster?.handle || !(uploaded.durationMs > 0)) {
			throw new Error(`${candidate.id} upload did not prove a synchronized video-with-audio asset and poster.`)
		}
		const spec = specFor(candidate, uploaded)
		const dryRun = envelope('generate_from_spec dryRun', await client.callTool({
			name: 'betterpptx.deck.generate_from_spec',
			arguments: { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', includePatchPlan: true },
		}))
		if (dryRun.errors?.length) throw new Error(`${candidate.id} dry run returned errors.`)
		const committed = envelope('generate_from_spec commit', await client.callTool({
			name: 'betterpptx.deck.generate_from_spec',
			arguments: { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, validateAfterCompile: true, detail: 'summary' },
		}))
		const deckId = committed.deckId
		const sourceCropPercent = centeredSquareCrop(uploaded.width, uploaded.height)
		const playbackContract = {
			schema: 'betterpptx.avatar.playback-contract.v1',
			requireAutoplay: true,
			requireNativeNarrationMarker: true,
			requireNativeRecordStudioCreation: true,
			requireInteractivePauseResume: true,
			requireNarrationNotes: true,
			requireBetterPptxNarrationNotes: true,
			talkingHeadFrame: {
				shape: 'ellipse',
				crop: 'centered-cover',
				canonicalWindowIn: { x: 10.993, y: 5.16, w: 2.25, h: 2.25 },
				sourceCropPolicy: 'source-aware-centered-cover',
				sourceCropPercent,
				toleranceIn: 0.01,
			},
		}
		const avatar = envelope('validate_avatar_narration', await client.callTool({
			name: 'betterpptx.deck.validate_avatar_narration',
			arguments: { deckId, contract: playbackContract },
		}))
		if (avatar.issues?.length) throw new Error(`${candidate.id} avatar validation failed: ${avatar.issues.join(' | ')}`)
		const validation = envelope('deck.validate', await client.callTool({ name: 'betterpptx.deck.validate', arguments: { deckId, mode: 'normal' } }))
		const design = envelope('deck.validate_design', await client.callTool({ name: 'betterpptx.deck.validate_design', arguments: { deckId, profile: 'static', minScore: 0, requireVisualProof: false, requireMotion: false } }))
		const accessibility = envelope('deck.validate_accessibility', await client.callTool({ name: 'betterpptx.deck.validate_accessibility', arguments: { deckId } }))
		const quality = envelope('deck.validate_quality', await client.callTool({ name: 'betterpptx.deck.validate_quality', arguments: { deckId, profile: 'narrated' } }))
		if (quality.ok === false || quality.blockingIssues?.length) throw new Error(`${candidate.id} quality validation reported blocking issues.`)
		let preview = null
		try { preview = envelope('deck.preview', await client.callTool({ name: 'betterpptx.deck.preview', arguments: { deckId, slides: [0], width: 1600 } })) } catch {}
		const saved = envelope('deck.save', await client.callTool({
			name: 'betterpptx.deck.save',
			arguments: { deckId, fileName: `${candidate.id}-native-recordstudio-${dateTag}.pptx` },
		}))
		const downloadedPath = localDownloadPath(saved.downloadUrl)
		const stablePath = path.join(outputDir, `${candidate.id}-native-recordstudio-${dateTag}.pptx`)
		await fs.copyFile(downloadedPath, stablePath)
		const inventory = await packageInventory(stablePath)
		if (inventory.videos.length !== 1 || inventory.videos[0].sha256 !== sha256(sourceBytes)) throw new Error(`${candidate.id} did not preserve the uploaded presenter video bytes.`)
		if (inventory.privateVocabularyHits.length) throw new Error(`${candidate.id} contains private delivery vocabulary.`)
		const packageValidation = await validateAvatarNarrationPackage(stablePath, {
			playbackContract,
			slides: [{ slideIndex: 0, videoObjectName: 'Native Record Studio Presenter', durationMs: uploaded.durationMs }],
		})
		if (!packageValidation.ok) throw new Error(`${candidate.id} package validation failed: ${packageValidation.issues.join(' | ')}`)
		const reopenedBytes = await fs.readFile(stablePath)
		const reopened = envelope('deck.open_uploaded', await client.callTool({
			name: 'betterpptx.deck.open_uploaded',
			arguments: {
				data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${reopenedBytes.toString('base64')}`,
				fileName: `${candidate.id}-roundtrip.pptx`,
				preserveTiming: true,
			},
		}))
		const exported = envelope('deck.export_spec', await client.callTool({ name: 'betterpptx.deck.export_spec', arguments: { deckId: reopened.deckId, detail: 'full' } }))
		const exportedSlide = exported.spec?.slides?.[0] || {}
		if (exportedSlide.notes !== candidate.userNotes) throw new Error(`${candidate.id} did not round-trip the user-owned notes prefix exactly.`)
		if (exportedSlide.avatarNarration?.script !== narrationScript || exportedSlide.avatarNarration?.nativeRecordStudio !== true || exportedSlide.avatarNarration?.reuseExisting !== true) {
			throw new Error(`${candidate.id} did not round-trip as an unchanged native Record Studio session.`)
		}
		results.push({
			id: candidate.id,
			path: path.relative(workspaceRoot, stablePath).replaceAll('\\', '/'),
			bytes: inventory.bytes,
			sha256: inventory.sha256,
			sourceMedia: { path: candidate.media, bytes: sourceBytes.length, sha256: sha256(sourceBytes) },
			mediaBytePreservation: 'PASS',
			privateVocabularyScan: 'PASS_ZERO_HITS',
			nativeRecordStudio: 'PASS',
			notesOwnershipRoundtrip: 'PASS',
			userNotes: candidate.userNotes,
			narrationScript,
			upload: {
				durationMs: uploaded.durationMs,
				width: uploaded.width,
				height: uploaded.height,
				hasVideoStream: uploaded.hasVideoStream,
				hasAudioStream: uploaded.hasAudioStream,
			},
			playbackContract,
			validation: { ok: validation.ok !== false, issues: validation.issues?.length || 0 },
			design: { ok: design.ok !== false, warnings: design.warnings?.length || 0 },
			accessibility: { ok: accessibility.ok !== false, issues: accessibility.issues?.length || 0 },
			quality: { ok: quality.ok !== false, blockingIssues: quality.blockingIssues?.length || 0 },
			preview: preview ? { status: 'PASS', count: preview.previews?.length || 0, renderer: preview.renderer || null } : { status: 'EXTERNAL_ORACLE_REQUIRED' },
			package: packageValidation,
		})
	}
} finally {
	await client.close().catch(() => {})
	await transport.close().catch(() => {})
}

const report = {
	schema: 'betterpptx.g1-native-recordstudio-regeneration-report.v1',
	generatedAt: new Date().toISOString(),
	route: 'public MCP capability discovery -> assets.upload -> generate_from_spec dryRun/commit -> native Record Studio validation -> save -> open_uploaded/export_spec notes round-trip',
	notesOwnership: {
		canonicalFinalMarker: '[BetterPPTX-narration]',
		legacyReadableMarker: '[narration]',
		beforeMarker: 'opaque user-owned notes',
		afterMarker: 'editable BetterPPTX narration source',
	},
	artifacts: results,
}
await fs.writeFile(path.join(outputDir, 'REGENERATION-REPORT.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
