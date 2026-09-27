#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

function fail(message, detail = {}) {
	console.error('LIVE MCP AUTHORING PIPELINE: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exitCode = 1
	throw new Error(message)
}

function envelopeOf(label, response) {
	const envelope = response?.structuredContent
		|| (() => {
			try { return JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}') }
			catch { return null }
		})()
	if (!envelope || envelope.ok !== true) fail(`${label} failed.`, { response, envelope })
	return envelope.data || envelope
}

function errorEnvelopeOf(label, response, code) {
	const envelope = response?.structuredContent
		|| (() => {
			try { return JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}') }
			catch { return null }
		})()
	if (!envelope || envelope.ok !== false || envelope.error?.code !== code) {
		fail(`${label}: expected ${code}.`, { response, envelope })
	}
	return envelope.error
}

const cwd = path.dirname(fileURLToPath(import.meta.url))
const developmentNoSave = process.argv.includes('--development-no-save')
const spec = JSON.parse(await fs.readFile(path.join(cwd, 'ir', 'examples', 'creation-executive.v1.json'), 'utf8'))
const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd,
	stderr: 'pipe',
	env: {
		...process.env,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_LOCAL_MAINTAINER: '0',
		BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_PREMIUM: '1',
	},
})
let stderr = ''
transport.stderr?.on('data', chunk => { stderr += chunk.toString() })
const client = new Client(
	{ name: 'cold-authoring-boundary-client', version: '1' },
	{ capabilities: {} },
)

try {
	await client.connect(transport)
	const listed = await client.listTools()
	const names = new Set((listed.tools || []).map(tool => tool.name))
	if (!names.has('betterpptx.deck.generate_from_spec')) fail('Live MCP discovery omitted generate_from_spec.', { names: [...names] })
	for (const forbidden of [
		'betterpptx.deck.new',
		'betterpptx.deck.define_message_architecture',
		'betterpptx.deck.assign_slide_roles',
		'betterpptx.deck.define_design_system',
		'betterpptx.deck.set_show_settings',
		'betterpptx.slide.add',
		'betterpptx.slide.add_text',
	]) {
		if (names.has(forbidden)) fail(`Live MCP discovery exposed forbidden tool ${forbidden}.`)
	}

	const capabilities = envelopeOf('live MCP help.capabilities', await client.callTool({
		name: 'betterpptx.help.capabilities',
		arguments: { intent: 'Create a narrated animated presentation through the Authoring Excellence Director.', detail: 'summary' },
	}))
	if (capabilities.recommendedMode !== 'mcp-authoring-excellence-json-spec' ||
		capabilities.authoringSurface !== 'mcp-generate-from-spec-only') {
		fail('Capability discovery did not declare the single MCP JSON-spec authoring surface.', capabilities)
	}
	if (capabilities.authoringPrinciples?.geometryAuthority !== 'engine' ||
		capabilities.authoringPrinciples?.placementPolicy !== 'semantic-layout-only' ||
		capabilities.authoringPrinciples?.talkingHeadFrame?.shape !== 'ellipse' ||
		capabilities.authoringPrinciples?.talkingHeadFrame?.crop !== 'centered-cover' ||
		!String(capabilities.authoringPrinciples?.talkingHeadFrame?.nativeNarrationMarker || '').includes('native PowerPoint narration identity') ||
		capabilities.authoringPrinciples?.uploadedPresenterRepair?.contractVersion !== 'betterpptx.avatar.uploaded-presenter-repair.v1' ||
		!String(capabilities.authoringPrinciples?.uploadedPresenterRepair?.input || '').includes('reuseExisting')) {
		fail('Capability discovery did not expose the engine-owned semantic authoring principles.', capabilities.authoringPrinciples)
	}
	for (const tool of [...(capabilities.requiredTools || []), ...(capabilities.optionalTools || [])]) {
		if (!names.has(tool)) fail(`Capability discovery recommended a hidden tool ${tool}.`, capabilities)
	}

	const workflow = envelopeOf('live MCP help.workflow', await client.callTool({
		name: 'betterpptx.help.workflow',
		arguments: { intent: 'Create a narrated animated presentation through the Authoring Excellence Director.', detail: 'summary' },
	}))
	if (workflow.recommendedMode !== 'mcp-authoring-excellence-json-spec' ||
		workflow.authoringSurface !== 'mcp-generate-from-spec-only') {
		fail('Workflow discovery did not declare the single MCP JSON-spec authoring surface.', workflow)
	}
	if (workflow.authoringPrinciples?.geometryAuthority !== 'engine' ||
		workflow.authoringPrinciples?.placementPolicy !== 'semantic-layout-only' ||
		workflow.authoringPrinciples?.talkingHeadFrame?.shape !== 'ellipse' ||
		workflow.authoringPrinciples?.talkingHeadFrame?.crop !== 'centered-cover' ||
		workflow.authoringPrinciples?.uploadedPresenterRepair?.contractVersion !== 'betterpptx.avatar.uploaded-presenter-repair.v1') {
		fail('Workflow discovery did not repeat the engine-owned authoring principles needed for AI decisions.', workflow.authoringPrinciples)
	}
	for (const phase of workflow.phases || []) {
		for (const tool of phase.tools || []) if (!names.has(tool)) fail(`Workflow phase ${phase.key} recommended a hidden tool ${tool}.`, workflow)
	}

	const recipes = envelopeOf('live MCP help.tool_recipe', await client.callTool({
		name: 'betterpptx.help.tool_recipe',
		arguments: { surface: 'full', detail: 'summary', intent: 'Author a complete narrated animated presentation.' },
	}))
	for (const recipe of recipes.recipes || []) {
		for (const step of recipe.sequence || []) {
			if (String(step.tool || '').startsWith('betterpptx.') && !names.has(step.tool)) {
				fail(`Recipe ${recipe.surface} recommended a hidden tool ${step.tool}.`, recipe)
			}
		}
		for (const tool of recipe.pillars?.flatMap?.(pillar => pillar.tools || []) || []) {
			if (!names.has(tool)) fail(`Recipe ${recipe.surface} pillar recommended a hidden tool ${tool}.`, recipe)
		}
	}

	errorEnvelopeOf('live MCP hidden deck.new invocation', await client.callTool({
		name: 'betterpptx.deck.new',
		arguments: { title: 'must fail' },
	}), 'JSON_SPEC_AUTHORING_REQUIRED')

	const dry = envelopeOf('live MCP dryRun', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: {
			spec,
			phase: 'dryRun',
			commitMode: 'createNew',
			plan: 'premium',
			detail: 'summary',
		},
	}))
	if (dry.dryRun !== true || dry.mutationFree !== true || dry.deckId) fail('Live MCP dry-run mutated state.', dry)
	const resolved = envelopeOf('live MCP resolve readback', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: {
			spec,
			phase: 'resolve',
			commitMode: 'createNew',
			plan: 'premium',
			detail: 'summary',
		},
	}))
	if (resolved.phase !== 'resolve' || resolved.mutationFree !== true || resolved.deckId ||
		!Array.isArray(resolved.layoutRecommendations?.slides) || resolved.layoutRecommendations.slides.length !== spec.slides.length) {
		fail('Live MCP resolve did not return mutation-free ranked layout readback for AI decision-making.', resolved)
	}
	// Presenter readback must teach the AI the semantic engine decision without exposing
	// baked implementation details (clip ids, frame coordinates, or bounding boxes).
	const presenterProbeSpec = JSON.parse(JSON.stringify(spec))
	presenterProbeSpec.presenter = { model: 'gen://rigged3d/public-probe', pairContent: true }
	const presenterProbe = envelopeOf('live MCP presenter semantic readback', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec: presenterProbeSpec, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full' },
	}))
	const presenterReadback = {
		presenter: presenterProbe.appliedDefaults?.presenter,
		storyboard: presenterProbe.appliedDefaults?.storyboard,
	}
	const presenterProbeJson = JSON.stringify(presenterReadback)
	if (/"animId"|"framePos"|"bboxFrom"/.test(presenterProbeJson)) {
		fail('Live MCP presenter readback leaked implementation choreography fields.', presenterProbe)
	}
	if (presenterProbe.appliedDefaults?.presenter?.active !== true ||
		!Array.isArray(presenterProbe.appliedDefaults?.presenter?.gestures) ||
		!presenterProbe.appliedDefaults.presenter.gestures.every(g => g.suppressed || ('intent' in g && 'from' in g)) ||
		!Array.isArray(presenterProbe.appliedDefaults?.storyboard)) {
		fail('Live MCP presenter readback did not expose the semantic engine decision surface.', presenterProbe.appliedDefaults)
	}

	const commit = envelopeOf('live MCP commit', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: {
			spec,
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'premium',
			detail: 'summary',
		},
	}))
	if (!commit.deckId || commit.slideCount !== spec.slides.length) fail('Live MCP commit returned unexpected output.', commit)
	if (commit.semanticRoundtrip?.schemaVersion !== 'betterpptx.semantic-roundtrip.v1' ||
		commit.semanticRoundtrip?.domainContract?.contentStory?.audience !== spec.contentStory?.audience &&
		commit.semanticRoundtrip?.domainContract?.contentStory?.audience !== spec.domainContract?.contentStory?.audience) {
		fail('Live MCP commit did not return the sanitized semantic round-trip contract.', commit.semanticRoundtrip)
	}

	errorEnvelopeOf('live MCP primitive mutation', await client.callTool({
		name: 'betterpptx.slide.add',
		arguments: { deckId: commit.deckId, background: { color: 'FFFFFF' } },
	}), 'JSON_SPEC_AUTHORING_REQUIRED')

	const quality = envelopeOf('live MCP validate_quality', await client.callTool({
		name: 'betterpptx.deck.validate_quality',
		arguments: { deckId: commit.deckId, profile: 'modern' },
	}))
	if (quality.ok !== true) fail('Live MCP quality gate did not pass.', quality)

	let saved = { slideCount: commit.slideCount, bytes: 0 }
	let roundtrip = commit.semanticRoundtrip
	if (!developmentNoSave) {
		saved = envelopeOf('live MCP save', await client.callTool({
			name: 'betterpptx.deck.save',
			arguments: {
				deckId: commit.deckId,
				deckVersion: commit.deckVersion,
				fileName: 'verify-live-mcp-authoring-pipeline-v1.pptx',
			},
		}))
		if (!saved.bytes || saved.slideCount !== spec.slides.length) fail('Live MCP save did not produce the expected deck.', saved)

		const exported = envelopeOf('live MCP semantic export', await client.callTool({
			name: 'betterpptx.deck.export_spec',
			arguments: { deckId: commit.deckId, detail: 'summary' },
		}))
		roundtrip = exported.spec?.semanticRoundtrip
		if (roundtrip?.schemaVersion !== 'betterpptx.semantic-roundtrip.v1' ||
			roundtrip?.semanticDigest !== commit.semanticRoundtrip?.semanticDigest ||
			roundtrip?.specDigest !== commit.semanticRoundtrip?.specDigest ||
			roundtrip?.domainContract?.motionTime?.masterClock !== commit.semanticRoundtrip?.domainContract?.motionTime?.masterClock) {
			fail('Saved/exported semantic intent did not round-trip with stable digests.', { commit: commit.semanticRoundtrip, exported: roundtrip })
		}
	}

	envelopeOf('live MCP dispose', await client.callTool({
		name: 'betterpptx.deck.dispose',
		arguments: { deckId: commit.deckId },
	}))

	console.log('LIVE MCP AUTHORING PIPELINE: PASS')
	console.log(JSON.stringify({
		serverPid: transport.pid,
		discoveredTools: names.size,
		discoveryMode: capabilities.recommendedMode,
		authoringTool: 'betterpptx.deck.generate_from_spec',
		contract: spec.authoringContract.workflow,
		slideCount: saved.slideCount,
		bytes: saved.bytes,
		developmentNoSave,
		saveCalls: developmentNoSave ? 0 : 1,
		planDigest: dry.planDigest,
		semanticDigest: roundtrip.semanticDigest,
		mcpReadySignal: /\bMCP server ready\b/i.test(stderr),
	}, null, 2))
} finally {
	await client.close().catch(() => {})
	await transport.close().catch(() => {})
}
