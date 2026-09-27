#!/usr/bin/env node
// Public-boundary preview/validation proof.  This verifier deliberately uses
// the same stdio MCP route as a cold AI client; primitive deck mutation is no
// longer a valid test fixture for the production authoring surface.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

function fail(message, detail = {}) {
	console.error('PREVIEW VALIDATION HONESTY V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exitCode = 1
	throw new Error(message)
}

function envelopeOf(label, response) {
	const envelope = response?.structuredContent || (() => {
		try { return JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!envelope || envelope.ok !== true) fail(`${label} failed.`, { response, envelope })
	return envelope.data || envelope
}

function envelopeFrom(response) {
	return response?.structuredContent || (() => {
		try { return JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
}

const here = path.dirname(fileURLToPath(import.meta.url))
const spec = JSON.parse(await fs.readFile(path.join(here, 'ir', 'examples', 'creation-executive.v1.json'), 'utf8'))
const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: here,
	stderr: 'pipe',
	env: {
		...process.env,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_LOCAL_MAINTAINER: '0',
		BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW: '0',
		BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_PREMIUM: '1',
	},
})
const client = new Client({ name: 'cold-preview-validation-client', version: '1' }, { capabilities: {} })

try {
	await client.connect(transport)
	const listed = await client.listTools()
	const names = new Set((listed.tools || []).map(tool => tool.name))
	if (names.has('betterpptx.deck.new') || names.has('betterpptx.slide.add') || names.has('betterpptx.slide.add_text')) {
		fail('Public preview verifier discovered a primitive authoring front door.', { names: [...names] })
	}

	const dry = envelopeOf('semantic dryRun', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' },
	}))
	if (dry.dryRun !== true || dry.mutationFree !== true || dry.deckId || !dry.layoutRecommendations || !dry.appliedDefaults) {
		fail('Semantic dryRun did not remain mutation-free or return engine readback.', dry)
	}

	const committed = envelopeOf('semantic commit', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full' },
	}))
	if (!committed.deckId || committed.slideCount !== spec.slides.length) fail('Semantic commit returned an unexpected deck.', committed)

	const previewResponse = await client.callTool({
		name: 'betterpptx.deck.preview',
		arguments: { deckId: committed.deckId, slides: [0], width: 640 },
	})
	const previewEnvelope = envelopeFrom(previewResponse)
	let previewStatus = 'available'
	if (previewEnvelope?.ok === true) {
		const preview = previewEnvelope.data || previewEnvelope
		if (preview.renderer?.name !== 'betterpptx-powerpoint-preview') fail('Preview returned an unknown renderer.', preview.renderer)
		if (preview.renderer?.fidelity !== 'powerpoint-export' || preview.renderer?.powerPointExact !== true) fail('Preview did not declare PowerPoint fidelity honestly.', preview.renderer)
		if (!Array.isArray(preview.renderer?.notRepresented) || !preview.renderer.notRepresented.includes('Morph runtime interpolation timing')) {
			fail('Preview did not honestly annotate unsupported runtime features.', preview.renderer)
		}
		if (!Array.isArray(preview.previews) || preview.previews.length !== 1) fail('Preview did not return the requested slide.', preview)
	} else if (previewEnvelope?.ok === false && previewEnvelope.error?.code === 'AUTHORITATIVE_PREVIEW_INFRASTRUCTURE_REQUIRED') {
		// A hosted/cold public endpoint without an approved PowerPoint route must
		// fail closed and state that public certification/save remains blocked.
		const raw = JSON.stringify(previewEnvelope)
		if (/([A-Za-z]:\\|\/home\/|\/tmp\/|node_modules|engine\.mjs|stack)/i.test(raw)) fail('Unavailable preview response leaked private endpoint details.', previewEnvelope)
		const capability = previewEnvelope.error?.details?.releaseInfrastructure?.authoritativePreview
		if (capability?.status !== 'external-infrastructure-required' || capability?.available !== false || capability?.certificationImpact !== 'public-save-blocked') {
			fail('Unavailable preview response did not expose the precise fail-closed infrastructure status.', previewEnvelope)
		}
		if (previewEnvelope.error?.artifact_state !== 'not_saved' || previewEnvelope.error?.retry_safe !== false) {
			fail('Unavailable preview response did not keep the release candidate explicitly unsaved.', previewEnvelope)
		}
		previewStatus = 'external-infrastructure-required-safe'
	} else {
		fail('Preview returned an unexpected public error.', previewEnvelope)
	}

	const validation = envelopeOf('public deck.validate', await client.callTool({
		name: 'betterpptx.deck.validate',
		arguments: { deckId: committed.deckId, mode: 'strict' },
	}))
	if (validation.valid !== true || validation.issueCount !== 0) fail('Semantic deck did not pass strict validation.', validation)
	const design1 = envelopeOf('public deck.validate_design first', await client.callTool({
		name: 'betterpptx.deck.validate_design',
		arguments: { deckId: committed.deckId, minScore: 0, requireVisualProof: false },
	}))
	const design2 = envelopeOf('public deck.validate_design second', await client.callTool({
		name: 'betterpptx.deck.validate_design',
		arguments: { deckId: committed.deckId, minScore: 0, requireVisualProof: false },
	}))
	if (design1.score !== design2.score) fail('Design score was not deterministic across repeated runs.', { design1, design2 })

	envelopeOf('public deck.dispose', await client.callTool({
		name: 'betterpptx.deck.dispose',
		arguments: { deckId: committed.deckId, deckVersion: committed.deckVersion },
	}))
	console.log('PREVIEW VALIDATION HONESTY V1 VERIFY: PASS')
	console.log(JSON.stringify({
		discoveredTools: names.size,
		slideCount: committed.slideCount,
		previewStatus,
		validationIssues: validation.issueCount,
		designScore: design1.score,
	}, null, 2))
} finally {
	await client.close().catch(() => {})
	await transport.close().catch(() => {})
}
