#!/usr/bin/env node
// Local BetterPPTX MCP demonstration for the explicit Mena presenter identity.
// The deck is authored only through the semantic JSON-spec front door.

import * as path from 'node:path'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(process.env.MENA_DEMO_OUT_DIR || path.join(here, '..', 'demonstrations', 'mena-youth-persona-20260904'))
const outputFile = 'Mena_Youth_Topics_Demonstration_20260904.pptx'

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: here,
	stderr: 'pipe',
	env: {
		...process.env,
		BETTERPPTX_PUBLIC_BLACK_BOX: '0',
		BETTERPPTX_LOCAL_MAINTAINER: '1',
		BETTERPPTX_PREMIUM: '1',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_OUT_DIR: outputDir,
	},
})
const client = new Client({ name: 'mena-youth-topics-demo', version: '1' }, { capabilities: {} })

async function tool(name, args = {}) {
	const response = await client.callTool({ name, arguments: args })
	const result = response?.structuredContent || JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}')
	if (!result?.ok) {
		const error = new Error(`${name}: ${result?.error?.message || 'failed'}`)
		error.code = result?.error?.code || 'TOOL_ERROR'
		error.payload = result
		throw error
	}
	return result.data
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Meet Mena — youth topics demonstration',
	authoringContract: {
		workflow: 'authoring-excellence-director-v1',
		level: 'deterministic',
		coordinateSystem: 'inches',
		layerModel: 'flat-object-array',
		objectIdentity: 'stable-names-required',
	},
	contentStory: {
		audience: 'young people, youth educators, and teams creating youth-facing content',
		outcome: 'Show a friendly native 3D presenter persona for youth-oriented topics.',
		remember: 'Mena is the explicit fourth presenter for youth-and-young-adult topics; she is not auto-selected.',
	},
	visualDesign: {
		world: 'aurora',
		framing: 'A dark, high-contrast editorial stage with Mena as a friendly visual guide and clean proof-led content.',
		tone: 'clear, curious, optimistic',
	},
	styleIntent: {
		preset: 'slate-pro',
		mode: 'dark',
		tone: 'direct',
		artDirection: 'Dark navy stage, electric teal and warm amber accents, generous type, rounded proof cards, and approachable youth-facing editorial energy.',
	},
	motionTime: {
		masterClock: 'authored slide timing',
		timingSource: 'native PowerPoint slide timing',
		syncPolicy: 'Mena holds the approved safe stopped opening pose in this static demonstration.',
	},
	layout: 'LAYOUT_WIDE',
	theme: {
		name: 'Mena Youth Lab',
		palette: ['071426', '102A43', '19C3B1', 'FFB648', 'F5F7FA'],
		fontFace: 'Aptos',
	},
	presenter: {
		id: 'mena-host',
		identity: 'mena',
		enabled: true,
		stage: 'right',
		stageTreatment: 'floor-ellipse',
		onSlides: [0, 2],
		choreography: 'subtle',
		persona: 'youth-and-young-adult-topics',
	},
	showSettings: {
		useTimings: true,
		showAnimation: false,
		showNarration: false,
		showMediaControls: false,
	},
	slides: [
		{
			id: 'mena-opener',
			title: 'Meet Mena',
			role: 'opener',
			message: 'Mena brings a youth-facing 3D presence to the deck.',
			layoutIntent: 'hero',
			content: [
				{ kind: 'title', name: 'opener-title', text: 'Meet Mena', style: { textColorRole: 'onDark' } },
				{ kind: 'callout', name: 'opener-subtitle', text: 'A friendly 3D guide for youth topics.', region: 'left', style: { textColorRole: 'onDark' } },
				{ kind: 'body', name: 'opener-proof', text: 'Explicit fourth persona  •  native 3D  •  safe stopped pose', region: 'footer', style: { textColorRole: 'onDark' } },
			],
			notes: 'Mena is the explicit fourth built-in presenter identity. The asset is research-only and owner-gated; this deck demonstrates identity selection and static visual presence.',
		},
		{
			id: 'mena-audience',
			title: 'Designed for younger audiences',
			role: 'explanation',
			message: 'Mena is intended for youth-facing topics where clarity, curiosity, and momentum matter.',
			layoutIntent: 'two-column',
			content: [
				{ kind: 'title', name: 'audience-title', text: 'Designed for younger audiences', style: { textColorRole: 'onDark' } },
				{ kind: 'body', name: 'audience-fit', text: 'AUDIENCE FIT\nYoung people and young adults\nYouth educators and facilitators\nTeams making youth-facing content', region: 'left', style: { textColorRole: 'onDark' } },
				{ kind: 'body', name: 'audience-feel', text: 'DELIVERY FEEL\nClear, visual, and conversational\nCurious without being childish\nEnergetic while staying readable', region: 'right', style: { textColorRole: 'onDark' } },
			],
			notes: 'Audience positioning for the demonstration: youth and young-adult topics. This is an intended-use description, not a claim about any individual person.',
		},
		{
			id: 'mena-topic-lanes',
			title: 'Three topic lanes for Mena',
			role: 'proof',
			message: 'The same explicit persona can guide different youth-oriented conversations.',
			layoutIntent: 'three-column',
			content: [
				{ kind: 'title', name: 'lanes-title', text: 'Three topic lanes for Mena', style: { textColorRole: 'onDark' } },
				{ kind: 'quote', name: 'lane-create', text: 'CREATE\nTech,\nmedia + making', region: 'leftThird', style: { textColorRole: 'onDark' } },
				{ kind: 'quote', name: 'lane-grow', text: 'GROW\nLearning,\nskills + wellbeing', region: 'midThird', style: { textColorRole: 'onDark' } },
				{ kind: 'quote', name: 'lane-act', text: 'ACT\nClimate,\nlocal action,\nnext steps', region: 'rightThird', style: { textColorRole: 'onDark' } },
			],
			notes: 'Illustrative topic lanes for a youth-facing presenter demo. The deck does not imply that Mena is automatically selected for these topics.',
		},
		{
			id: 'mena-boundary',
			title: 'Mena is explicit by design',
			role: 'closer',
			message: 'A visible identity choice stays explicit, inspectable, and governed.',
			layoutIntent: 'two-column',
			content: [
				{ kind: 'title', name: 'boundary-title', text: 'Mena is explicit by design', style: { textColorRole: 'onDark' } },
				{ kind: 'callout', name: 'identity-contract', text: 'presenter: { identity: "mena" }', region: 'left', style: { textColorRole: 'onDark' } },
				{ kind: 'body', name: 'boundary-status', text: 'Fourth presenter identity\nYouth-and-young-adult topic focus\nResearch-only and owner-gated\nNot selected automatically', region: 'right', style: { textColorRole: 'onDark' } },
				{ kind: 'body', name: 'boundary-foot', text: 'Mena is the name; provenance is private.', region: 'footer', style: { textColorRole: 'onDark' } },
			],
			notes: 'The public-facing persona identity is Mena. Provider/source provenance is retained in private release-safety records and is not the persona name.',
		},
	],
	validation: {
		validateBeforeSave: true,
		requireAccessibility: true,
		minDesignScore: 70,
	},
}

try {
	const startedAt = Date.now()
	await client.connect(transport)
	const capabilities = await tool('betterpptx.help.capabilities', { intent: 'youth-facing Mena presenter demonstration deck', detail: 'full' })
	const workflow = await tool('betterpptx.help.workflow', { intent: 'compile a governed semantic Mena deck', detail: 'full' })
	const dryRun = await tool('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'normal', idempotencyKey: 'mena-youth-demo-dry-20260904' })
	const deck = await tool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', planId: dryRun.planId, lockedPlanId: dryRun.planId, planDigest: dryRun.planDigest, detail: 'summary', validateAfterCompile: true, validationMode: 'normal', saveAfterCommit: false, idempotencyKey: 'mena-youth-demo-commit-20260904' })
	const validation = await tool('betterpptx.deck.validate', { deckId: deck.deckId, mode: 'normal' })
	const designValidation = await tool('betterpptx.deck.validate_design', { deckId: deck.deckId, profile: 'modern', minScore: 70, requireExpressive3D: false, requireMotion: false, requireNarration: false, requireVisualProof: true })
	const accessibilityValidation = await tool('betterpptx.deck.validate_accessibility', { deckId: deck.deckId, mode: 'basic' })
	const qualityValidation = await tool('betterpptx.deck.validate_quality', { deckId: deck.deckId, profile: 'modern' })
	let preview = null
	try {
		preview = await tool('betterpptx.deck.preview', { deckId: deck.deckId, width: 1600, includeNativeModelPreviews: true })
	} catch (error) {
		preview = { blocked: true, code: error.code, message: error.message }
	}
	const saved = await tool('betterpptx.deck.save', { deckId: deck.deckId, outputDir, fileName: outputFile, outputFormat: 'pptx', idempotencyKey: 'mena-youth-demo-save-20260904' })
	process.stdout.write(JSON.stringify({
		ok: true,
		outputDir,
		outputFile,
		contract: capabilities.authoringApi?.contractVersion,
		authoringSurface: workflow.authoringSurface,
		planDigest: dryRun.planDigest,
		deckId: deck.deckId,
		deckVersion: deck.deckVersion,
		selection: deck.authoringContracts?.presenterIdentity || deck.appliedDefaults?.presenter,
		validation,
		designValidation,
		accessibilityValidation,
		qualityValidation,
		preview,
		saved,
		elapsedMs: Date.now() - startedAt,
	}, null, 2) + '\n')
} catch (error) {
	process.stderr.write(`[mena-youth-demo] FAILED: ${error?.stack || error}\n`)
	if (error?.payload) process.stderr.write(`${JSON.stringify(error.payload, null, 2)}\n`)
	process.exitCode = 1
} finally {
	try { await client.close() } catch {}
}
