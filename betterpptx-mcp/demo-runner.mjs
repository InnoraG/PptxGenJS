#!/usr/bin/env node
// Maintainer demo: discover the Authoring Excellence contract, then compile
// one semantic Director spec through the real stdio MCP transport.  This file
// intentionally contains no direct engine import and no coordinate geometry.

import * as path from 'node:path'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(process.env.BETTERPPTX_DEMO_OUT_DIR || path.join(here, 'outputs'))
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

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
const client = new Client({ name: 'betterpptx-authoring-demo', version: '1' }, { capabilities: {} })

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
	title: 'betterpptx Authoring Excellence demo',
	authoringContract: {
		workflow: 'authoring-excellence-director-v1',
		level: 'deterministic',
		coordinateSystem: 'inches',
		layerModel: 'flat-object-array',
		objectIdentity: 'stable-names-required',
	},
	contentStory: {
		audience: 'presentation authors and AI clients',
		outcome: 'Explain how semantic intent becomes a governed presentation.',
		remember: 'The Director chooses intent; the engine resolves regions, geometry, timing, and quality gates.',
	},
	visualDesign: {
		world: 'Aurora editorial verification',
		framing: 'A calm, high-contrast authoring contract proof with one clear reading path.',
		tone: 'precise and trustworthy',
	},
	motionTime: {
		masterClock: 'authored slide timeline',
		timingSource: 'Authoring Excellence Motion/Time plan',
		syncPolicy: 'Engine-owned timing and layout; semantic cues only.',
	},
	layout: 'LAYOUT_WIDE',
	theme: {
		name: 'Aurora editorial',
		palette: ['0B1020', '102A43', '9FB2C3', '5EEAD4', 'F8FAFC'],
		fontFace: 'Aptos',
	},
	showSettings: { useTimings: true, showAnimation: true, showNarration: false, showMediaControls: false },
	slides: [{
		id: 'authoring-contract-proof',
		title: 'Authoring intent becomes engine quality',
		role: 'opener',
		message: 'An AI client supplies semantic intent and receives an explainable engine plan.',
		layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'contract-title', text: 'Authoring intent becomes engine quality' },
			{ kind: 'callout', name: 'contract-message', text: 'AI decides story, role, and semantic layout intent. The engine resolves content-aware regions, final geometry, timing, and validation.', region: 'center' },
		],
		transition: { type: 'fade', duration: 0.35, advanceAfterTime: 4200, advanceOnClick: true },
	}],
	validation: { validateBeforeSave: true, requireAccessibility: true },
}

try {
	const startedAt = Date.now()
	await client.connect(transport)
	const capabilities = await tool('betterpptx.help.capabilities', { intent: 'semantic authoring guidance for an AI client', detail: 'full' })
	const workflow = await tool('betterpptx.help.workflow', { intent: 'compile a governed semantic deck', detail: 'full' })
	const contract = capabilities.authoringApi?.contractVersion
	if (contract !== 'authoring-excellence.api.v1' || workflow.authoringSurface !== 'mcp-generate-from-spec-only') {
		throw new Error(`Unexpected authoring contract: ${contract || 'missing'} / ${workflow.authoringSurface || 'missing'}`)
	}
	const dryRun = await tool('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' })
	const deck = await tool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'summary' })
	const validation = await tool('betterpptx.deck.validate', { deckId: deck.deckId })
	const designValidation = await tool('betterpptx.deck.validate_design', { deckId: deck.deckId })
	const accessibilityValidation = await tool('betterpptx.deck.validate_accessibility', { deckId: deck.deckId })
	const qualityValidation = await tool('betterpptx.deck.validate_quality', { deckId: deck.deckId, profile: 'modern' })
	const saved = await tool('betterpptx.deck.save', { deckId: deck.deckId, outputDir, fileName: `BetterPptxMcp_AuthoringDemo_${stamp}.pptx` })

	const result = {
		ok: true,
		route: 'betterpptx.deck.generate_from_spec',
		contract,
		authoringSurface: workflow.authoringSurface,
		decisionGuide: capabilities.authoringApi?.decisionGuide,
		planDigest: dryRun.planDigest,
		validation,
		designValidation,
		accessibilityValidation,
		qualityValidation,
		saved,
		elapsedMs: Date.now() - startedAt,
	}
	process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} catch (error) {
	process.stderr.write(`[betterpptx-mcp] FAILED: ${error?.stack || error}\n`)
	process.exitCode = 1
} finally {
	try { await client.close() } catch {}
}
