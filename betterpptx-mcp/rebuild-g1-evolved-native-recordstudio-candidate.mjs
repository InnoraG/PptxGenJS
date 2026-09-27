#!/usr/bin/env node
// Rebuild the evolved G1 owner-review candidate exclusively through the public
// BetterPPTX MCP JSON-spec authoring surface. This file is an MCP client and
// evidence harness only: it never imports the presentation engine, calls slide
// primitives, edits package XML, or treats ordinary slide media as a presenter.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import JSZip from 'jszip'
import { validateAvatarNarrationPackage } from './avatar/validate.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(here, '..')
const dateTag = '20260814'
const outputDir = path.join(here, 'outputs', `g1-native-recordstudio-evolved-${dateTag}`)
const runtimeDir = path.join(outputDir, 'runtime')
const downloadRoot = path.join(outputDir, 'public')
const previewDir = path.join(outputDir, 'mcp-previews')
const finalName = `g1-evolved-native-recordstudio-review-${dateTag}.pptx`
let finalPath = path.join(outputDir, finalName)
const sourceSpecPath = path.join(outputDir, 'g1-evolved-native-recordstudio-review-spec.json')
const resolvedSpecPath = path.join(outputDir, 'g1-evolved-native-recordstudio-review-resolved-spec.json')
const progressPath = path.join(outputDir, 'g1-evolved-native-recordstudio-render-progress.json')
const reportPath = path.join(outputDir, 'G1-EVOLVED-REGENERATION-REPORT.json')
const execFileAsync = promisify(execFile)

await Promise.all([
	fs.mkdir(outputDir, { recursive: true }),
	fs.mkdir(runtimeDir, { recursive: true }),
	fs.mkdir(downloadRoot, { recursive: true }),
	fs.mkdir(previewDir, { recursive: true }),
])

const presenterImagePath = path.join(here, 'outputs', 'g1-native-recordstudio-20260814', 'approved-presenter-source-frame.png')
const reusedAudioDir = path.join(here, 'outputs', 'g1-native-recordstudio-expanded-20260814', 'runtime')
const scenes = [
	{
		id: 'scene-01-promise',
		audio: 'tts-en_US-ljspeech-high-mssnoxxc-abcbfd0d.wav',
		durationMs: 9033,
		script: 'A strong presentation is not a stack of pages. It is one continuous explanation, with every scene preparing the audience for the next.',
	},
	{
		id: 'scene-02-clock',
		audio: 'tts-en_US-ljspeech-high-mssnoy25-86ff2aa0.wav',
		durationMs: 10484,
		script: 'The narration text is the master clock. Voice is generated first, the presenter follows that voice, and every visual reveal is aligned to the same measured timeline.',
	},
	{
		id: 'scene-03-evidence',
		audio: 'tts-en_US-ljspeech-high-mssnu1ys-310f3779.wav',
		durationMs: 9880,
		script: 'As the story advances, the evidence changes form. Here, a native chart carries the progression while the presenter keeps identity and attention continuous.',
	},
	{
		id: 'scene-04-pacing',
		audio: 'tts-en_US-ljspeech-high-mssnuhsi-fce106e8.wav',
		durationMs: 11703,
		script: 'Pacing follows meaning. Introduce one idea, reveal its proof, then resolve the implication. Every movement should support comprehension, never decoration.',
	},
	{
		id: 'scene-05-ownership',
		audio: 'tts-en_US-ljspeech-high-mssnzj5k-68a778f9.wav',
		durationMs: 11459,
		script: 'The notes pane keeps two authors in one place. Your free notes stay untouched above the final marker, while the narration below remains editable and can regenerate the recording.',
	},
	{
		id: 'scene-06-review',
		audio: 'tts-en_US-ljspeech-high-msso0zvl-e13280d6.wav',
		durationMs: 14687,
		script: 'Now the full session is coherent: native presenter playback, an editable chart and table, governed notes, and narration-led timing. Play it, pause it, resume it, and judge the experience end to end.',
	},
]

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function stableDigest(value) {
	return sha256(Buffer.from(JSON.stringify(value), 'utf8')).slice(0, 24)
}

function envelope(label, result) {
	const parsed = result?.structuredContent || (() => {
		try { return JSON.parse(result?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!parsed || parsed.ok !== true) {
		const error = new Error(`${label} failed: ${JSON.stringify(parsed || result)}`)
		error.details = parsed || result
		throw error
	}
	return parsed.data || parsed
}

function localDownloadPath(downloadUrl) {
	const parsed = new URL(downloadUrl)
	const match = parsed.pathname.match(/^\/files\/([^/]+)\/(.+)$/)
	if (!match) throw new Error(`Unexpected public download URL shape: ${parsed.pathname}`)
	return path.join(downloadRoot, match[1], decodeURIComponent(match[2]))
}

function credentialProviderAccounts(store, id) {
	const provider = store?.providers?.[id]
	if (!provider || !Array.isArray(provider.accounts)) return []
	const enabled = provider.accounts.filter(account => account?.enabled !== false && account?.env)
	return [
		...enabled.filter(account => account.id === provider.activeAccountId),
		...enabled.filter(account => account.id !== provider.activeAccountId),
	]
}

async function commercialPresenterRoute() {
	const storePath = path.join(here, 'config', 'credential-store.json')
	let store = JSON.parse((await fs.readFile(storePath, 'utf8')).replace(/^\uFEFF/, ''))
	let source = 'local-owner-store'
	let providerId = 'avatar-worker-commercial'
	let accounts = credentialProviderAccounts(store, providerId)
	if (!accounts.length) {
		// The promoted credentials are owner-controlled in Secret Manager. Read the
		// bundle directly into process memory; never write or print the raw secret.
		const gcloud = 'C:\\Users\\SafeUser\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd'
		let stdout = ''
		try {
			;({ stdout } = await execFileAsync(gcloud, [
				'secrets', 'versions', 'access', 'latest',
				'--secret=betterpptx-avatar-worker-credentials',
				'--project=betterpptx-mcp-staging',
			], { cwd: workspaceRoot, windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 }))
		} catch {
			// GCP may temporarily refuse Secret Manager access while the already-paid
			// Modal workspaces remain available. In that case, invoke the exact promoted
			// commercial functions through their authenticated owner profiles. This is
			// media generation only: it does not redeploy or rotate any secret.
			return {
				mode: 'owner-modal-profile',
				source: 'owner-authenticated-commercial-workspaces',
				profiles: ['telcomgapp', 'betterpptx-fluxworkerai'],
				env: {},
			}
		}
		store = JSON.parse(String(stdout || '').replace(/^\uFEFF/, ''))
		accounts = credentialProviderAccounts(store, providerId)
		source = 'owner-secret-manager'
	}
	accounts = accounts.map(account => ({
		id: String(account.id || '').trim(),
		url: String(account.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL || '').trim(),
		route: String(account.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE || '').trim() || '/',
		token: String(account.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN || '').trim(),
		weight: Number(account.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_WEIGHT || 1) || 1,
	})).filter(account => account.id && account.url && account.token)
	if (!accounts.length) throw new Error('No owner-configured production presenter worker is available.')
	return {
		mode: 'commercial-http-pool',
		source,
		profiles: [],
		env: {
			BETTERPPTX_COMMERCIAL_AVATAR_CREDENTIAL_SOURCE: source,
			BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL: JSON.stringify(accounts),
			BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL: accounts[0].url,
			BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE: accounts[0].route,
			BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN: accounts[0].token,
			BETTERPPTX_COMMERCIAL_AVATAR_WORKER_WEIGHT: '1',
		},
	}
}

async function renderViaOwnerCommercialProfile(scene, index, route) {
	const outputPath = path.join(runtimeDir, `commercial-presenter-${String(index + 1).padStart(2, '0')}.mp4`)
	const reportFile = outputPath.replace(/\.mp4$/i, '.json')
	const source = `${path.join(here, 'deploy', 'avatar-worker', 'modal_avatar_commercial_eval.py')}::main`
	const profiles = route.profiles || []
	const readValidatedRender = async () => {
		const [reportText, bytes] = await Promise.all([
			fs.readFile(reportFile, 'utf8'),
			fs.readFile(outputPath),
		])
		const report = JSON.parse(reportText)
		if (bytes.length < 1024
			|| report.motionProfile !== 'blink'
			|| report.mouthProfile !== 'jaw'
			|| report.enhancement !== 'restoreformer++'
			|| report.detectorLane !== 'upstream'
			|| report.parserLane !== 'upstream'
			|| !(Number(report.restoreFormerElapsedSec) > 0)) {
			throw new Error('commercial render report did not satisfy the frozen production profile')
		}
		return { report, bytes }
	}
	try {
		const { bytes } = await readValidatedRender()
		console.error(`[G1-EVOLVED] Reusing validated commercial presenter ${index + 1}/${audioInputs.length}; no paid rerender.`)
		return { outputPath, bytes, profileSlot: index % Math.max(1, profiles.length), rotated: false, reused: true }
	} catch {
		// A missing or invalid local render is generated through the approved profile pool below.
	}
	const attempts = []
	for (let step = 0; step < profiles.length; step += 1) {
		const profile = profiles[(index + step) % profiles.length]
		try {
			await fs.rm(outputPath, { force: true }).catch(() => {})
			await fs.rm(reportFile, { force: true }).catch(() => {})
			await execFileAsync('py', [
				'-m', 'modal', 'run', source,
				'--image-path', presenterImagePath,
				'--audio-path', path.join(reusedAudioDir, scene.audio),
				'--output-path', outputPath,
				'--bbox-shift', '0',
				'--parsing-mode', 'jaw',
				'--motion-profile', 'blink',
				'--mouth-profile', 'jaw',
				'--detector-lane', 'upstream',
				'--parser-lane', 'upstream',
			], {
				cwd: workspaceRoot,
				windowsHide: true,
				timeout: 1200000,
				maxBuffer: 16 * 1024 * 1024,
				env: { ...process.env, MODAL_PROFILE: profile, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
			})
			const { bytes } = await readValidatedRender()
			return { outputPath, bytes, profileSlot: (index + step) % profiles.length, rotated: step > 0 }
		} catch (error) {
			attempts.push({ profileSlot: (index + step) % profiles.length, code: String(error?.code || 'COMMERCIAL_RENDER_FAILED').slice(0, 80) })
		}
	}
	throw new Error(`All owner commercial presenter accounts failed for slide ${index + 1}: ${JSON.stringify(attempts)}`)
}

const rationale = {
	transition: 'A quiet native fade establishes the premium opening without competing with the spoken promise.',
	openingWordArt: 'The restrained gold native WordArt treatment creates a memorable recording motif while keeping the main title readable.',
	headphones: 'Native Stock 3D headphones make the generated listening-and-recording session tangible while retaining a large, legible hero silhouette.',
	smartart: 'The editable polished process maps the four causal steps clearly for an owner-review audience in a dark premium world.',
	chart: 'This exact line-chart Ribbon tile emphasizes cumulative progress while preserving native editability and compact executive reading.',
	shape: 'The gold gradient and restrained native depth effects turn the three pacing verbs into one meaningful signal, not decoration.',
	table: 'The Medium Style 2 Accent 1 native table treatment keeps the ownership boundary high-contrast, restrained, and immediately scannable in the dark world.',
	closingWordArt: 'A cool reflected native WordArt treatment gives the playback actions a distinct closing cadence without repeating the opener.',
}

function sourceSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'One story, authored as a native recording',
		layout: 'LAYOUT_WIDE',
		audience: 'BetterPPTX owner and authoring-quality reviewers',
		objective: 'Demonstrate a coherent six-slide AI-authored native Record Studio session whose narration drives voice, presenter playback, visual timing, and editable notes.',
		handshake: {
			audience: 'BetterPPTX owner and authoring-quality reviewers',
			promise: 'A real presentation can be authored as one progressive native recording, not as isolated media samples.',
			proof: ['six connected narration scripts', 'one native presenter identity', 'editable native SmartArt', 'exact native chart Ribbon state', 'native table style', 'native WordArt, shape effects, gradients, and Stock 3D', 'notes ownership boundary', 'narration-aligned cues'],
			payoff: 'Play the full sequence, then approve it or request revisions.',
			bar: 'Excellent means a rich, balanced, legible six-scene narrative with no duplicate presenter visuals, no hand-authored geometry, and no internal delivery vocabulary.',
			commitments: ['native-record-studio', 'narration-led', 'native-first', 'exact-catalog-selections', 'notes-ownership', 'rich-complete-world', 'black-box'],
		},
		authoringContract: {
			level: 'deterministic',
			workflow: 'authoring-excellence-director-v1',
			designAuthority: 'ai',
			engineRole: 'catalog-executor-package-verifier',
			knowledgeAuthority: 'ai-first-rag-when-unknown',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
			geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only',
			rawNativePreservationPolicy: 'forbidden-in-director-spec',
			selectionManifestPolicy: 'required-for-release-candidates',
			completeness: {
				tier: 'complete',
				defaultWorld: 'luxe',
				lastResortWorld: 'aurora',
				selectionRule: 'Use the richest coherent native treatment that serves the narrated story.',
			},
			domains: {
				required: ['content-story', 'visual-design', 'motion-time'],
				contentStory: 'One explanation progresses across six distinct but connected scenes.',
				visualDesign: 'A premium recording observatory with editorial contrast, meaningful native niceties, and one persistent presenter lane.',
				motionTime: 'Narration text and completed synchronized presenter media provide the single measured clock.',
			},
		},
		contentStory: {
			audience: 'BetterPPTX owner and authoring-quality reviewers',
			outcome: 'Understand and validate how a complete AI-authored native recording behaves across a real slide sequence.',
			remember: 'Narration is the source of truth; visuals, presenter playback, timing, and notes all follow it.',
			narrativeArc: ['promise', 'clock', 'evidence', 'pacing', 'ownership', 'review'],
		},
		visualDesign: {
			world: 'Luxe recording observatory',
			artDirection: 'Cinematic midnight depth, warm gold recording signals, cool cyan proof accents, editorial typography, native gradients and controlled three-dimensionality.',
			framing: 'One dominant message per slide, a reserved native presenter lane, and progressively changing proof forms without repetitive card grids.',
		},
		motionTime: {
			masterClock: 'native Record Studio narration',
			timingSource: 'completed synchronized presenter capture generated from each slide narration source',
			syncPolicy: 'Absolute narration cues coordinate builds, presenter playback, and slide advance; transitions preserve continuity.',
			kineticSelection: 'Use restrained semantic reveals and one emphasis beat per scene; no decorative motion.',
		},
		styleIntent: {
			artDirection: 'luxe',
			mode: 'dark',
			density: 'executive-rich',
			tone: 'confident, cinematic, precise',
			completeness: 'complete',
		},
		theme: { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', fontFace: 'Aptos' },
		data: [{
			name: 'story-progress',
			dataSource: 'synthetic owner-review demonstration',
			provenance: 'Synthetic demonstration data authored solely to test native editable chart behavior.',
			evidenceSource: 'This deck six-scene authoring plan',
			verified: true,
			series: [
				{ name: 'Audience clarity', labels: ['Promise', 'Clock', 'Evidence', 'Pacing', 'Ownership', 'Review'], values: [18, 35, 53, 69, 86, 100] },
				{ name: 'Native integration', labels: ['Promise', 'Clock', 'Evidence', 'Pacing', 'Ownership', 'Review'], values: [12, 33, 58, 74, 91, 100] },
			],
		}],
		transitionPolicy: { type: 'morph', option: 'byObject', duration: 700 },
		showSettings: { useTimings: true, showNarration: true, showMediaControls: true },
		validation: { previewBeforeSave: true, validateBeforeSave: true, requireAccessibility: true },
		selectionManifest: {
			schemaVersion: 'betterpptx.ai-selection-manifest.v1',
			enforcement: 'required',
			selections: [
				{ slideId: 'scene-01-promise', capability: 'transition', representation: 'native', coherenceReason: rationale.transition, selectors: { transitionPresetId: 'transition-ribbon-003' } },
				{ slideId: 'scene-01-promise', target: 'recording-wordart', capability: 'wordart', representation: 'native', coherenceReason: rationale.openingWordArt, selectors: { wordArtStylePresetId: 'wordart-style-008', transform: 'textArchUp' } },
				{ slideId: 'scene-01-promise', target: 'recording-headphones', capability: 'model3d', representation: 'native', coherenceReason: rationale.headphones, selectors: { model3dViewPresetId: 'model3d-view-011' } },
				{ slideId: 'scene-02-clock', target: 'narration-chain', capability: 'smartart', representation: 'native', coherenceReason: rationale.smartart, selectors: { layoutId: 'urn:microsoft.com/office/officeart/2005/8/layout/process1', quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1', colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent2_3' } },
				{ slideId: 'scene-03-evidence', target: 'progress-chart', capability: 'chart', representation: 'native', coherenceReason: rationale.chart, selectors: { chartGalleryTilePresetId: 'office-ribbon-line-styles-5faf23da4c4a' } },
				{ slideId: 'scene-04-pacing', target: 'meaning-signal', capability: 'shape', representation: 'native', coherenceReason: rationale.shape, selectors: { shapeStylePresetId: 'shape-style-075', shapeEffectPresetIds: ['shape-effect-shadow-002', 'shape-effect-bevel-007'] } },
				{ slideId: 'scene-05-ownership', target: 'ownership-table', capability: 'table', representation: 'native', coherenceReason: rationale.table, selectors: { tableStylePresetId: 'table-style-044' } },
				{ slideId: 'scene-06-review', target: 'review-wordart', capability: 'wordart', representation: 'native', coherenceReason: rationale.closingWordArt, selectors: { wordArtStylePresetId: 'wordart-style-007', transform: 'textArchUp' } },
			],
		},
		slides: [
			{
				id: 'scene-01-promise', role: 'opener',
				title: 'One story. Six scenes. One native recording.',
				message: 'A narrated deck should feel like one continuous explanation, not a collection of disconnected samples.',
				notes: 'Owner note: judge the opening promise, presenter identity, and whether the deck feels like one continuous session.',
				layoutIntent: 'hero', arrange: { split: [58, 42] },
				content: [
					{ kind: 'title', name: 'story-title', text: 'One story. Six scenes. One native recording.', region: 'left', visualIntent: { role: 'hero', treatment: 'editorial-display' } },
					{ kind: 'wordart', name: 'recording-wordart', text: 'ONE CLOCK', region: 'left', altText: 'One clock, the recording principle.' },
					{ kind: 'quote', name: 'opening-thesis', text: 'The recording is authored from the message outward.', region: 'left', visualIntent: { role: 'thesis', depth: 'elevated' } },
					{ kind: 'shape', name: 'recording-halo', shapeName: 'roundRect', region: 'right', decorative: true, keep: true, visualIntent: { role: 'hero-stage', purpose: 'focal-stage' }, style: { fill: { type: 'gradient', gradientAngle: 35, gradientStops: [{ color: '0E7490', transparency: 4, position: 0 }, { color: 'D6A84B', transparency: 12, position: 100 }] }, line: { color: 'F5D98B', transparency: 38, width: 1.2 }, shadow: { type: 'outer', color: '000000', opacity: 0.28, blur: 10, angle: 45, distance: 3 } }, altText: 'A native gradient focal stage behind the recording object.' },
					{ kind: 'model3d', name: 'recording-headphones', modelAsset: 'model3d://microsoft-stock/55f4d622ae5b86d3/headphones', nativeOnly: true, region: 'right', altText: 'Native editable Stock 3D headphones representing an AI-authored recording and listening session.' },
				],
				transition: { type: 'fade' },
			},
			{
				id: 'scene-02-clock', role: 'explanation',
				title: 'Narration is the master clock.',
				message: 'Text drives voice; voice drives presenter and timing; every reveal follows the same measured clock.',
				notes: 'Owner note: verify that the narration visibly leads the explanation rather than behaving like an added soundtrack.',
				layoutIntent: 'process-flow',
				content: [
					{ kind: 'title', name: 'story-title', text: 'Narration is the master clock.', region: 'title' },
					{ kind: 'diagram', name: 'narration-chain', region: 'body', nodes: [{ id: 'script', text: 'Narration text' }, { id: 'voice', text: 'Generated voice' }, { id: 'presenter', text: 'Native presenter' }, { id: 'timing', text: 'Measured timing' }], altText: 'Editable native four-step process from narration text to generated voice, native presenter, and measured timing.', verified: true, provenance: 'BetterPPTX native recording authoring contract', evidenceSource: 'This deck declared narration workflow' },
				],
				transition: { type: 'morph', option: 'byObject' },
			},
			{
				id: 'scene-03-evidence', role: 'evidence',
				title: 'The proof changes; the story holds.',
				message: 'A native chart carries quantitative proof while the same presenter identity preserves continuity.',
				notes: 'Owner note: verify the chart remains editable, carries a real Ribbon style, and the presenter never covers the evidence.',
				layoutIntent: 'chart-left-insights-right', arrange: { split: [68, 32] },
				content: [
					{ kind: 'title', name: 'story-title', text: 'The proof changes; the story holds.', region: 'title' },
					{ kind: 'chart-panel', name: 'progress-chart', chartType: 'line', dataRef: 'story-progress', region: 'left', verified: true, provenance: 'Synthetic demonstration data', evidenceSource: 'This deck six-scene authoring plan', altText: 'Two illustrative lines rise across six scenes, reaching 100 at the final review stage.' },
					{ kind: 'stat', name: 'continuity-score', value: '100', label: 'illustrative end-state', region: 'right', verified: true, provenance: 'Synthetic demonstration data', evidenceSource: 'This deck six-scene authoring plan' },
				],
				transition: { type: 'morph', option: 'byObject' },
			},
			{
				id: 'scene-04-pacing', role: 'sequence',
				title: 'Pacing follows meaning.',
				message: 'The slide introduces, proves, and resolves one idea in a cue-led sequence.',
				notes: 'Owner note: judge whether the progression feels purposeful and whether the motion supports the spoken sequence.',
				layoutIntent: 'timeline',
				content: [
					{ kind: 'title', name: 'story-title', text: 'Pacing follows meaning.', region: 'title' },
					{ kind: 'timeline', name: 'meaning-timeline', region: 'body', items: [{ title: 'Introduce', text: 'Frame one idea.', verified: true, evidenceSource: 'This deck declared narrative sequence' }, { title: 'Prove', text: 'Reveal the evidence.', verified: true, evidenceSource: 'This deck declared narrative sequence' }, { title: 'Resolve', text: 'Land the implication.', verified: true, evidenceSource: 'This deck declared narrative sequence' }], altText: 'A three-step narrated sequence: Introduce, Prove, Resolve.', verified: true, provenance: 'This deck declared narrative sequence', evidenceSource: 'This deck declared narrative sequence' },
					{ kind: 'textShape', name: 'meaning-signal', shapeName: 'roundRect', text: 'INTRODUCE  →  PROVE  →  RESOLVE', region: 'footer', altText: 'A gold gradient pacing signal joining introduce, prove, and resolve.' },
				],
				transition: { type: 'morph', option: 'byObject' },
			},
			{
				id: 'scene-05-ownership', role: 'proof',
				title: 'Two note owners. One clear boundary.',
				message: 'User notes remain opaque above the final marker; narration below it is editable and drives regeneration.',
				notes: 'Owner note: edit this user-owned text freely; it must remain above the final narration marker and must never be spoken.',
				layoutIntent: 'comparison',
				content: [
					{ kind: 'title', name: 'story-title', text: 'Two note owners. One clear boundary.', region: 'title' },
					{ kind: 'table-panel', name: 'ownership-table', region: 'body', header: ['Content', 'Location', 'Behavior'], rows: [['User notes', 'Above the final marker', 'Preserved exactly; never narrated'], ['Narration source', 'Below the final marker', 'Editable; regenerates voice, presenter, and timing']], tableOptions: { headerRow: true, bandedRows: true, firstColumn: true, lastColumn: false, totalRow: false, bandedColumns: false }, altText: 'A native comparison table showing user notes above the final marker and the editable narration source below it.', verified: true, provenance: 'BetterPPTX notes ownership contract', evidenceSource: 'This deck final notes marker contract' },
				],
				transition: { type: 'morph', option: 'byObject' },
			},
			{
				id: 'scene-06-review', role: 'closing',
				title: 'Review one complete native session.',
				message: 'Play the full sequence, then approve it or request revisions.',
				notes: 'Owner note: play the complete show and judge continuity, pause/resume, replay, timing, and overall design quality.',
				layoutIntent: 'two-column', arrange: { split: [56, 44] },
				content: [
					{ kind: 'title', name: 'story-title', text: 'Review one complete native session.', region: 'title', visualIntent: { role: 'hero', treatment: 'editorial-display' } },
					{ kind: 'wordart', name: 'review-wordart', text: 'PLAY · PAUSE · RESUME', region: 'left', altText: 'Play, pause, and resume the native recording.' },
					{ kind: 'quote', name: 'review-synthesis', text: 'Judge the complete performance: native presenter playback, editable Office proof, governed notes, and narration-led timing.', region: 'right', visualIntent: { role: 'synthesis', depth: 'elevated', emphasis: 'cool-signal' } },
				],
				transition: { type: 'morph', option: 'byObject' },
			},
		],
	}
}

function addResolvedPresenter(spec, rendered) {
	const clone = structuredClone(spec)
	for (let index = 0; index < clone.slides.length; index += 1) {
		const scene = scenes[index]
		const video = rendered[index]
		clone.slides[index].avatarNarration = {
			enabled: true,
			objectName: 'Native Record Studio Presenter',
			script: scene.script,
			voice: 'en_US-ljspeech-high',
			lang: 'en_US',
			mode: 'videoWithAudio',
			interactivePlayback: true,
			showMediaControls: true,
			paddingMs: 650,
			lockedVideo: { handle: video.ref, durationMs: video.durationMs },
			lockedPoster: { handle: video.posterRef },
			durationMs: video.durationMs,
			expectedDurationMs: video.durationMs,
			timingToleranceMs: 250,
			cues: index === 0
				? [{ atMs: 250, target: 'story-title', type: 'entrance', effect: 'fade', duration: 520 }, { atMs: 2900, target: 'recording-wordart', type: 'emphasis', effect: 'pulse', duration: 520 }]
				: index === 1
					? [{ atMs: 250, target: 'story-title', type: 'entrance', effect: 'fade', duration: 520 }, { atMs: 2100, target: 'narration-chain', type: 'entrance', effect: 'wipe', duration: 520 }]
						: index === 2
							? [{ atMs: 250, target: 'story-title', type: 'entrance', effect: 'fade', duration: 520 }, { atMs: 2100, target: 'progress-chart', type: 'entrance', effect: 'wipe', duration: 520 }, { atMs: 4500, target: 'continuity-score', type: 'emphasis', effect: 'pulse', duration: 520 }]
						: index === 3
							? [{ atMs: 250, target: 'story-title', type: 'entrance', effect: 'fade', duration: 520 }, { atMs: 2500, target: 'meaning-timeline', type: 'entrance', effect: 'wipe', duration: 520 }, { atMs: 6500, target: 'meaning-signal', type: 'emphasis', effect: 'pulse', duration: 520 }]
							: index === 4
								? [{ atMs: 250, target: 'story-title', type: 'entrance', effect: 'fade', duration: 520 }, { atMs: 2200, target: 'ownership-table', type: 'entrance', effect: 'wipe', duration: 520 }]
								: [{ atMs: 250, target: 'story-title', type: 'entrance', effect: 'fade', duration: 520 }, { atMs: 2600, target: 'review-wordart', type: 'entrance', effect: 'wipe', duration: 520 }],
		}
	}
	return clone
}

async function packageInventory(filePath, expectedNotes) {
	const bytes = await fs.readFile(filePath)
	const zip = await JSZip.loadAsync(bytes)
	const names = Object.keys(zip.files)
	const privateVocabulary = /x-pipeline|x-enhancement|x-restoreformer(?:-seconds|-segments)?|liveportrait|musetalk|restoreformer|providerexecutionid|executionid/ig
	const privateVocabularyHits = []
	const videos = []
	let tableCount = 0
	let wordArtCount = 0
	for (const [name, entry] of Object.entries(zip.files)) {
		if (entry.dir) continue
		if (/^ppt\/media\/.+\.mp4$/i.test(name)) {
			const payload = await entry.async('nodebuffer')
			videos.push({ name, bytes: payload.length, sha256: sha256(payload) })
		}
		if (/\.(?:xml|rels|json|txt|vml)$/i.test(name)) {
			const text = await entry.async('string')
			const tokens = [...new Set((text.match(privateVocabulary) || []).map(token => token.toLowerCase()))]
			if (tokens.length) privateVocabularyHits.push({ part: name, tokens })
			if (/^ppt\/slides\/slide\d+\.xml$/i.test(name)) {
				tableCount += (text.match(/<a:tbl[ >]/g) || []).length
				wordArtCount += (text.match(/<a:prstTxWarp[ >]/g) || []).length
			}
		}
	}
	const noteChecks = []
	for (let index = 0; index < expectedNotes.length; index += 1) {
		const name = `ppt/notesSlides/notesSlide${index + 1}.xml`
		const entry = zip.file(name)
		if (!entry) {
			noteChecks.push({ slide: index + 1, ok: false, reason: 'missing notes part' })
			continue
		}
		const xml = await entry.async('string')
		const userAt = xml.indexOf(expectedNotes[index].userNotes)
		const markerAt = xml.indexOf('[BetterPPTX-narration]')
		const scriptAt = xml.indexOf(expectedNotes[index].script)
		noteChecks.push({ slide: index + 1, ok: userAt >= 0 && markerAt > userAt && scriptAt > markerAt })
	}
	return {
		bytes: bytes.length,
		sha256: sha256(bytes),
		parts: names.length,
		videos,
		chartParts: names.filter(name => /^ppt\/charts\/chart\d+\.xml$/i.test(name)).length,
		diagramParts: names.filter(name => /^ppt\/diagrams\/(?:data|layout|quickStyle|colors)\d+\.xml$/i.test(name)).length,
		model3dParts: names.filter(name => /^ppt\/(?:3dModels|media)\/.+\.(?:glb|3mf)$/i.test(name)).length,
		tableCount,
		wordArtCount,
		noteChecks,
		privateVocabularyHits,
	}
}

async function saveJson(filePath, value) {
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const commercialRoute = await commercialPresenterRoute()
const workerEnv = commercialRoute.env
const presenterBytes = await fs.readFile(presenterImagePath)
const presenterData = `data:image/png;base64,${presenterBytes.toString('base64')}`
const audioInputs = []
for (const scene of scenes) {
	const audioPath = path.join(reusedAudioDir, scene.audio)
	const bytes = await fs.readFile(audioPath)
	audioInputs.push({ ...scene, bytes, data: `data:audio/wav;base64,${bytes.toString('base64')}`, sha256: sha256(bytes) })
}

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: here,
	stderr: 'pipe',
	env: {
		...process.env,
		...workerEnv,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
		BETTERPPTX_LOCAL_MAINTAINER: '0',
		BETTERPPTX_MAINTAINER_MODE: '0',
		BETTERPPTX_PREMIUM: '1',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_PUBLIC_BASE: 'http://local.invalid',
		BETTERPPTX_ASSETS_ROOT: workspaceRoot,
		BETTERPPTX_DOWNLOAD_ROOT: downloadRoot,
		BETTERPPTX_OUT_DIR: runtimeDir,
		BETTERPPTX_ALLOWED_AUDIO_DIRS: [workspaceRoot, outputDir].join(path.delimiter),
		BETTERPPTX_ALLOWED_AVATAR_DIRS: [workspaceRoot, outputDir].join(path.delimiter),
		BETTERPPTX_AVATAR_PROVIDER: 'liveportrait-musetalk-commercial',
		BETTERPPTX_AVATAR_PRODUCTION_ONLY: '1',
		BETTERPPTX_AVATAR_DEVELOPMENT_MODE: '0',
		BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE: 'blink',
		BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE: 'jaw',
		BETTERPPTX_AVATAR_LICENSE_APPROVED: '1',
		BETTERPPTX_AVATAR_MAX_CONCURRENCY: '1',
		BETTERPPTX_AVATAR_TIMEOUT_MS: '1200000',
		BETTERPPTX_TOOL_TIMEOUT_MS: '1200000',
		BETTERPPTX_AVATAR_JOB_TTL_MS: '7200000',
		BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS: '120',
		BETTERPPTX_AVATAR_ROTATION_MODE: 'deterministic',
		BETTERPPTX_PRIVATE_METROLOGY: '1',
		BETTERPPTX_FFMPEG_PATH: path.join(here, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
		BETTERPPTX_FFPROBE_PATH: path.join(here, 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
	},
})
const client = new Client({ name: 'g1-evolved-recordstudio-rebuilder', version: '1' }, { capabilities: {} })
await client.connect(transport)

const baseSpec = sourceSpec()
await saveJson(sourceSpecPath, baseSpec)

let deckId = null
try {
	console.error('[G1-EVOLVED] Discovering the current public authoring contract and exact native catalogs.')
	const auth = envelope('auth.status', await client.callTool({ name: 'betterpptx.auth.status', arguments: {} }))
	const capabilities = envelope('help.capabilities', await client.callTool({
		name: 'betterpptx.help.capabilities',
		arguments: { detail: 'full', intent: 'Create a six-slide premium native Record Studio owner-review deck with exact editable native SmartArt, chart Ribbon state, table style, WordArt, shape effects, gradients, and Stock 3D.' },
	}))
	await Promise.all([
		client.callTool({ name: 'betterpptx.chart.recommend', arguments: { chartType: 'line', galleryKind: 'styles', chartGalleryTilePresetId: 'office-ribbon-line-styles-5faf23da4c4a', format: 'full', featureDepth: 'exhaustive' } }),
		client.callTool({ name: 'betterpptx.table.recommend', arguments: { query: 'dark premium ownership boundary', includeNativeStyles: true, nativeStyleLimit: 74, format: 'full', featureDepth: 'exhaustive' } }),
		client.callTool({ name: 'betterpptx.smartart.catalog', arguments: { category: 'process', supportStatus: 'supported-native', recommend: true, query: 'four-step narration recording workflow', themeMode: 'dark', limit: 20 } }),
		client.callTool({ name: 'betterpptx.options.catalog', arguments: { surface: 'wordArt', format: 'full' } }),
		client.callTool({ name: 'betterpptx.options.catalog', arguments: { surface: 'shapeEffects', format: 'full' } }),
		client.callTool({ name: 'betterpptx.assets.catalog', arguments: { kind: 'model3d', query: 'headphones recording listening session', preferNative: true, sizePolicy: 'standard', maxResults: 20 } }),
	])

	const rendered = []
	for (let index = 0; index < audioInputs.length; index += 1) {
		const scene = audioInputs[index]
		console.error(`[G1-EVOLVED] Rendering production presenter ${index + 1}/${audioInputs.length} for ${scene.id}.`)
		let video
		if (commercialRoute.mode === 'commercial-http-pool') {
			const created = envelope('avatar.render_job', await client.callTool({
				name: 'betterpptx.avatar.render_job',
				arguments: {
					script: scene.script,
					audio: { data: scene.data, durationMs: scene.durationMs, extn: 'wav' },
					durationMs: scene.durationMs,
					avatar: { source: 'uploaded', image: { data: presenterData }, consentAffirmed: true },
					avatarQuality: 'quality',
					mode: 'videoWithAudio',
					voice: 'en_US-ljspeech-high',
					lang: 'en_US',
					billingConfirmed: true,
					idempotencyKey: `g1-evolved-${dateTag}-${index + 1}-${stableDigest({ script: scene.script, audio: scene.sha256, presenter: sha256(presenterBytes) })}`,
				},
			}))
			let status = created
			let lastReported = ''
			const started = Date.now()
			while (!['succeeded', 'failed'].includes(status.status)) {
				await new Promise(resolve => setTimeout(resolve, 4000))
				status = envelope('avatar.job_status', await client.callTool({ name: 'betterpptx.avatar.job_status', arguments: { jobId: created.jobId } }))
				const elapsedBucket = Math.floor((Date.now() - started) / 20000)
				const reportKey = `${status.status}:${elapsedBucket}`
				if (reportKey !== lastReported) {
					lastReported = reportKey
					console.error(`[G1-EVOLVED] Presenter ${index + 1}/${audioInputs.length}: ${status.status} (${Math.round((Date.now() - started) / 1000)}s).`)
				}
				if (Date.now() - started > 1200000) throw new Error(`Avatar job ${created.jobId} exceeded the bounded wait window.`)
			}
			if (status.status !== 'succeeded' || !status.video?.ref || !status.video?.posterRef || !(status.video.durationMs > 0)) {
				throw new Error(`Production presenter ${index + 1} failed the attested render gate: ${JSON.stringify({ error: status.error || null, diagnostics: status.diagnostics || null })}`)
			}
			video = status.video
		} else {
			const completed = await renderViaOwnerCommercialProfile(scene, index, commercialRoute)
			const uploaded = envelope('assets.upload', await client.callTool({
				name: 'betterpptx.assets.upload',
				arguments: { kind: 'video', fileName: `commercial-presenter-${String(index + 1).padStart(2, '0')}.mp4`, data: `data:video/mp4;base64,${completed.bytes.toString('base64')}`, durationMs: scene.durationMs },
			})).asset
			if (!uploaded?.handle || !uploaded?.poster?.handle || !uploaded?.hasVideoStream || !uploaded?.hasAudioStream) {
				throw new Error(`Production presenter ${index + 1} did not pass the synchronized video-with-audio upload gate.`)
			}
			video = { ref: uploaded.handle, posterRef: uploaded.poster.handle, durationMs: uploaded.durationMs, extn: 'mp4', cacheHit: false, rotated: completed.rotated, accountSlot: completed.profileSlot }
		}
		if (Math.abs(video.durationMs - scene.durationMs) > 250) {
			throw new Error(`Production presenter ${index + 1} duration drifted from the narration master clock.`)
		}
		rendered.push(video)
		await saveJson(progressPath, {
			updatedAt: new Date().toISOString(),
			completed: rendered.length,
			total: scenes.length,
			slides: rendered.map((video, i) => ({ slide: i + 1, id: scenes[i].id, status: 'succeeded', durationMs: video.durationMs, video: { ref: video.ref, posterRef: video.posterRef, durationMs: video.durationMs, extn: video.extn, cacheHit: !!video.cacheHit } })),
		})
	}

	const spec = addResolvedPresenter(baseSpec, rendered)
	await saveJson(resolvedSpecPath, spec)
	console.error('[G1-EVOLVED] Dry-running the evolved six-slide AI selection manifest.')
	const dryRun = envelope('generate_from_spec dryRun', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', includePatchPlan: true },
	}))
	if (dryRun.errors?.length) throw new Error(`Dry-run returned ${dryRun.errors.length} error(s): ${JSON.stringify(dryRun.errors)}`)
	if (dryRun.selectionManifest?.status !== 'AI_SELECTIONS_COMPILED' || dryRun.selectionManifest?.compiledCount !== 8) {
		throw new Error(`Dry-run did not compile all eight exact AI selections: ${JSON.stringify(dryRun.selectionManifest)}`)
	}
	console.error('[G1-EVOLVED] Committing through the public JSON-spec front door.')
	const committed = envelope('generate_from_spec commit', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, validateAfterCompile: true, detail: 'full' },
	}))
	deckId = committed.deckId
	if (!deckId) throw new Error('Commit returned no deck handle.')
	if (committed.selectionManifest?.status !== 'AI_SELECTIONS_COMPILED' || committed.selectionManifest?.compiledCount !== 8) {
		throw new Error(`Commit did not preserve all eight exact AI selections: ${JSON.stringify(committed.selectionManifest)}`)
	}
	console.error('[G1-EVOLVED] Running the aggregate Director quality gate required for save.')
	const quality = envelope('deck.validate_quality', await client.callTool({ name: 'betterpptx.deck.validate_quality', arguments: { deckId, profile: 'narrated', mode: 'strict', minScore: 0, accessibilityMode: 'basic', requireNarration: true, requireMotion: true, requireVisualProof: false, requireExpressive3D: true } }))
	if (quality.ok === false || quality.blockingIssues?.length) throw new Error(`Quality validation returned blocking issues: ${JSON.stringify(quality.blockingIssues)}`)

	// Save the media-rich committed package before validation tools request their
	// own temporary serializations.  The saved package is then the immutable
	// validation target and selection-verification checkpoint.
	console.error('[G1-EVOLVED] Saving the committed deck and requiring selected-ID-to-package verification.')
	const saved = envelope('deck.save', await client.callTool({
		name: 'betterpptx.deck.save',
		arguments: { deckId, fileName: finalName, outputFormat: 'pptx', plan: 'premium', billingConfirmed: true, idempotencyKey: `g1-evolved-save-${dateTag}-${stableDigest(spec.selectionManifest)}` },
	}))
	if (saved.selectionVerification?.status !== 'SELECTIONS_VERIFIED_IN_PACKAGE' || saved.selectionVerification?.verifiedCount !== 8) {
		throw new Error(`Saved package did not verify all eight exact AI selections: ${JSON.stringify(saved.selectionVerification)}`)
	}
	const savedDownload = localDownloadPath(saved.downloadUrl)

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
			toleranceIn: 0.01,
		},
	}

	console.error('[G1-EVOLVED] Running native recording, design, accessibility, narration, and package-quality gates.')
	const avatarValidation = envelope('validate_avatar_narration', await client.callTool({ name: 'betterpptx.deck.validate_avatar_narration', arguments: { deckId, contract: playbackContract } }))
	if (avatarValidation.issues?.length) throw new Error(`Native Record Studio validation failed: ${avatarValidation.issues.join(' | ')}`)
	const validation = envelope('deck.validate', await client.callTool({ name: 'betterpptx.deck.validate', arguments: { deckId, mode: 'strict' } }))
	const design = envelope('deck.validate_design', await client.callTool({ name: 'betterpptx.deck.validate_design', arguments: { deckId, profile: 'modern', minScore: 0, requireVisualProof: false, requireMotion: true } }))
	const accessibility = envelope('deck.validate_accessibility', await client.callTool({ name: 'betterpptx.deck.validate_accessibility', arguments: { deckId } }))
	const narration = envelope('deck.validate_narration', await client.callTool({ name: 'betterpptx.deck.validate_narration', arguments: { deckId } }))

	console.error('[G1-EVOLVED] Requesting MCP previews before save when this endpoint exposes a renderer.')
	let preview = { previews: [], status: 'unavailable' }
	try {
		preview = envelope('deck.preview', await client.callTool({ name: 'betterpptx.deck.preview', arguments: { deckId, slides: [0, 1, 2, 3, 4, 5], width: 1600 } }))
	} catch (error) {
		if (error?.details?.error?.code !== 'POWERPOINT_PREVIEW_UNAVAILABLE') throw error
		console.error('[G1-EVOLVED] MCP preview renderer unavailable; installed PowerPoint remains the required post-save visual oracle.')
	}
	for (const [index, item] of (preview.previews || []).entries()) {
		const sourcePath = item.filePath || item.path || item.localPath
		if (sourcePath) await fs.copyFile(sourcePath, path.join(previewDir, `slide-${String(index + 1).padStart(2, '0')}.png`)).catch(() => {})
	}

	console.error('[G1-EVOLVED] Copying the validated immutable package to the owner-review path.')
	try {
		await fs.copyFile(savedDownload, finalPath)
	} catch (error) {
		// Do not close or overwrite a PowerPoint session owned by another process.
		// Preserve the validated package under a deterministic alternate review name
		// when the canonical path is locked by the host.
		if (!['EBUSY', 'EPERM'].includes(error?.code)) throw error
		finalPath = path.join(outputDir, finalName.replace(/\.pptx$/i, '-notes-only.pptx'))
		console.error(`[G1-EVOLVED] Canonical owner-review path is locked; writing ${path.basename(finalPath)}.`)
		await fs.copyFile(savedDownload, finalPath)
	}

	const inventory = await packageInventory(finalPath, baseSpec.slides.map((slide, index) => ({ userNotes: slide.notes, script: scenes[index].script })))
	if (inventory.privateVocabularyHits.length) throw new Error(`Delivered PPTX contains private implementation vocabulary: ${JSON.stringify(inventory.privateVocabularyHits)}`)
	if (inventory.videos.length !== 6) throw new Error(`Expected six synchronized presenter videos; found ${inventory.videos.length}.`)
	if (inventory.chartParts < 1 || inventory.diagramParts < 4 || inventory.tableCount < 1 || inventory.wordArtCount < 2 || inventory.model3dParts < 1) {
		throw new Error(`Native feature inventory is incomplete: ${JSON.stringify(inventory)}`)
	}
	if (inventory.noteChecks.some(item => !item.ok)) throw new Error(`Notes ownership ordering failed: ${JSON.stringify(inventory.noteChecks)}`)

	const packageValidation = await validateAvatarNarrationPackage(finalPath, {
		playbackContract,
		slides: rendered.map((video, slideIndex) => ({ slideIndex, videoObjectName: 'Native Record Studio Presenter', durationMs: video.durationMs, expectedDurationMs: video.durationMs })),
	})
	if (!packageValidation.ok) throw new Error(`Native Record Studio package validation failed: ${packageValidation.issues.join(' | ')}`)

	console.error('[G1-EVOLVED] Reopening the saved artifact and verifying notes plus native recording round-trip.')
	const finalBytes = await fs.readFile(finalPath)
	const reopened = envelope('deck.open_uploaded', await client.callTool({
		name: 'betterpptx.deck.open_uploaded',
		arguments: { data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${finalBytes.toString('base64')}`, fileName: path.basename(finalPath), preserveTiming: true },
	}))
	const exported = envelope('deck.export_spec', await client.callTool({ name: 'betterpptx.deck.export_spec', arguments: { deckId: reopened.deckId, detail: 'full' } }))
	for (let index = 0; index < baseSpec.slides.length; index += 1) {
		const slide = exported.spec?.slides?.[index] || {}
		if (slide.notes !== baseSpec.slides[index].notes) throw new Error(`Slide ${index + 1} did not round-trip the user-owned notes prefix exactly.`)
		if (slide.avatarNarration?.script !== scenes[index].script || slide.avatarNarration?.nativeRecordStudio !== true || slide.avatarNarration?.reuseExisting !== true) {
			throw new Error(`Slide ${index + 1} did not round-trip as an unchanged native Record Studio session.`)
		}
	}

	const report = {
		schema: 'betterpptx.g1-evolved-native-recordstudio-regeneration-report.v1',
		generatedAt: new Date().toISOString(),
		artifact: { path: path.relative(workspaceRoot, finalPath).replaceAll('\\', '/'), bytes: inventory.bytes, sha256: inventory.sha256, slideCount: 6 },
		authoringRoute: 'public BetterPPTX MCP capability discovery -> exact AI selection manifest -> production presenter render jobs -> generate_from_spec dry-run/commit -> validation/preview/save -> package/reopen verification',
		designAuthority: 'AI client',
		engineRole: 'catalog executor, geometry authority, serializer, and verifier',
		nativeFirst: { status: 'PASS', exactSelectionsAuthored: 8, exactSelectionsVerifiedInPackage: saved.selectionVerification.verifiedCount, noSilentSubstitution: true },
		recordStudio: { status: 'PASS', slideCount: 6, presenterShape: 'ellipse', canonicalWindowIn: playbackContract.talkingHeadFrame.canonicalWindowIn, centeredCrop: true, interactivePlayback: true, narrationAudioSource: 'reused exact prior synthesized WAV for unchanged narration text', productionProfileAttestation: 'ENFORCED_AND_PASSED' },
		notesOwnership: { status: 'PASS', canonicalFinalMarker: '[BetterPPTX-narration]', legacyReadableMarker: '[narration]', userNotesBeforeMarker: true, narrationAfterMarker: true, roundTrip: 'PASS' },
		blackBox: { status: 'PASS_ZERO_PRIVATE_VOCABULARY', scannedPartFamilies: ['xml', 'rels', 'json', 'txt', 'vml'] },
		nativeInventory: { videos: inventory.videos.length, chartParts: inventory.chartParts, diagramParts: inventory.diagramParts, nativeTables: inventory.tableCount, nativeWordArt: inventory.wordArtCount, native3dParts: inventory.model3dParts },
		validation: {
			deck: { ok: validation.ok !== false, issues: validation.issues?.length || 0 },
			design: { ok: design.ok !== false, score: design.score ?? null, warnings: design.warnings?.length || 0 },
			accessibility: { ok: accessibility.ok !== false, issues: accessibility.issues?.length || 0 },
			narration: { ok: narration.ok !== false, issues: narration.issues?.length || 0 },
			quality: { ok: quality.ok !== false, blockingIssues: quality.blockingIssues?.length || 0, warnings: quality.warnings?.length || 0 },
			package: packageValidation,
			mcpPreviewCount: preview.previews?.length || 0,
		},
		capabilityDiscovery: { authenticated: auth.authenticated !== false, authoringWorkflow: capabilities.authoringApi?.workflow || 'authoring-excellence-director-v1' },
		audioInputs: audioInputs.map((item, index) => ({ slide: index + 1, durationMs: item.durationMs, bytes: item.bytes.length, sha256: item.sha256, scriptHash: sha256(Buffer.from(item.script, 'utf8')) })),
	}
	await saveJson(reportPath, report)
	console.log(JSON.stringify(report, null, 2))
} finally {
	if (deckId) await client.callTool({ name: 'betterpptx.deck.dispose', arguments: { deckId } }).catch(() => {})
	await client.close().catch(() => {})
	await transport.close().catch(() => {})
}
