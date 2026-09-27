#!/usr/bin/env node
// Maintainer preview proof.  Use the same cold stdio MCP + semantic Director
// path as a real AI client; primitive/direct-engine authoring is intentionally
// not part of this verifier.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

function fail(message, detail = {}) {
	console.error('POWERPOINT PREVIEW V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function envelopeOf(label, response) {
	const envelope = response?.structuredContent || (() => {
		try { return JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!envelope || envelope.ok !== true) fail(`${label} failed.`, envelope || response)
	return envelope.data || envelope
}

const here = path.dirname(fileURLToPath(import.meta.url))
const spec = JSON.parse(await fs.readFile(path.join(here, 'ir', 'examples', 'creation-executive.v1.json'), 'utf8'))
const outputDir = path.resolve('outputs', 'powerpoint-preview-verification-20260607')
const transport = new StdioClientTransport({
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
	},
})
const client = new Client({ name: 'powerpoint-preview-verifier', version: '1' }, { capabilities: {} })

try {
	await client.connect(transport)
	const listed = await client.listTools()
	const names = new Set((listed.tools || []).map(tool => tool.name))
	if (!names.has('betterpptx.deck.generate_from_spec') || names.has('betterpptx.slide.add') || names.has('betterpptx.slide.add_text')) {
		fail('Preview verifier discovered an invalid authoring surface.', { discoveredTools: [...names] })
	}
	const dry = envelopeOf('semantic dryRun', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'summary' },
	}))
	if (dry.dryRun !== true || dry.mutationFree !== true || dry.deckId || !dry.appliedDefaults) fail('Semantic dryRun was not mutation-free.', dry)
	const committed = envelopeOf('semantic commit', await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'summary' },
	}))
	if (!committed.deckId || committed.slideCount !== spec.slides.length) fail('Semantic commit returned an unexpected deck.', committed)
	envelopeOf('quality verification', await client.callTool({
		name: 'betterpptx.deck.validate_quality',
		arguments: { deckId: committed.deckId, profile: 'modern' },
	}))
	const preview = envelopeOf('PowerPoint preview', await client.callTool({
		name: 'betterpptx.deck.preview',
		arguments: { deckId: committed.deckId, slides: [0], format: 'png', renderer: 'powerpoint', width: 1600, outputDir },
	}))
	if (preview.renderer?.name !== 'betterpptx-powerpoint-preview') fail('Preview did not use the PowerPoint renderer.', preview.renderer)
	if (preview.renderer?.powerPointExact !== true || preview.renderer?.fidelity !== 'powerpoint-export') fail('Preview did not declare PowerPoint fidelity honestly.', preview.renderer)
	if (!preview.previews?.[0]?.filePath) fail('PowerPoint preview did not publish a maintainer file.', preview)
	const previewPath = path.resolve(preview.previews[0].filePath)
	const stat = await fs.stat(previewPath)
	if (!stat.isFile() || stat.size <= 0) fail('PowerPoint preview file is missing or empty.', { previewPath, bytes: stat.size })
	envelopeOf('dispose', await client.callTool({
		name: 'betterpptx.deck.dispose',
		arguments: { deckId: committed.deckId, deckVersion: committed.deckVersion },
	}))
	console.log('POWERPOINT PREVIEW V1 VERIFY: PASS')
	console.log(JSON.stringify({ discoveredTools: names.size, slideCount: committed.slideCount, renderer: preview.renderer.name, filePath: previewPath, bytes: stat.size }, null, 2))
} catch (error) {
	fail(error?.message || String(error), { code: error?.code, details: error?.details, stack: error?.stack })
} finally {
	await client.close().catch(() => {})
	await transport.close().catch(() => {})
}
