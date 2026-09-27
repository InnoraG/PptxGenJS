#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import JSZip from 'jszip'
import { PUBLIC_SEMANTIC_VERSION, TOOL_SCHEMA_VERSION } from './public-manifest.mjs'

const value = flag => {
	const index = process.argv.indexOf(flag)
	return index < 0 ? undefined : process.argv[index + 1]
}
const endpoint = new URL(value('--mcp-url') || 'https://betterpptx.tail070c3a.ts.net/mcp')
const bearerToken = value('--bearer-token') || process.env.BETTERPPTX_TEST_HTTP_TOKEN
const outputDir = path.resolve(value('--outdir') || '.codex-tmp/live-animated-table-public')
await mkdir(outputDir, { recursive: true })
const report = {
	schemaVersion: 'betterpptx.live-animated-table-public.v1',
	startedAt: new Date().toISOString(),
	endpointOrigin: endpoint.origin,
	actualTransport: 'streamable-http',
	status: 'RUNNING',
	checks: [],
}
const pass = (id, evidence = {}) => report.checks.push({ id, status: 'PASS', ...evidence })
const transport = new StreamableHTTPClientTransport(endpoint, {
	requestInit: { headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {} },
})
const client = new Client({ name: 'animated-table-public-verifier', version: '1' }, { capabilities: {} })
let deckId

function envelope(result, label) {
	const text = result?.content?.find(item => item.type === 'text')?.text || ''
	if (!result?.structuredContent && /sign in to betterpptx/i.test(text)) {
		const error = new Error('Protected live authoring requires an authenticated supported-client session or --bearer-token.')
		error.code = 'AUTH_REQUIRED'
		throw error
	}
	const parsed = result?.structuredContent || (() => {
		try { return JSON.parse(text || '{}') } catch { return null }
	})()
	assert.ok(parsed && parsed.ok === true, `${label} failed: ${JSON.stringify(parsed?.error || parsed)}`)
	return parsed.data || parsed
}

async function call(name, args = {}) {
	return envelope(await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 }), name)
}

const spec = JSON.parse(await readFile(new URL('./public-authoring-environment/gallery/sources/animated-table-synergy.json', import.meta.url), 'utf8'))
const synergySpec = structuredClone(spec)
synergySpec.contentStory = { audience: 'decision makers', outcome: 'compare the options', remember: 'option B has the strongest synthetic score' }
synergySpec.visualDesign = { world: 'editorial', framing: 'scorecard with presenter contact' }
synergySpec.motionTime = {
	masterClock: 'authored slide timeline',
	timingSource: 'native',
	syncPolicy: 'one authored clock',
	kineticSelection: { presenters: [{ presenterId: 'presenter', selectedMotionIds: ['motion.ordinary.point'] }] },
}
synergySpec.presenter = { id: 'presenter', identity: 'joe', rect: { x: 6.55, y: 0.75, w: 6.0, h: 5.95 } }
synergySpec.slides[0].presenterPerformance = {
	actor: 'presenter', startMs: 1100, blendMs: 0,
	actions: [{ id: 'point', motionId: 'motion.ordinary.point', durationMs: 2000 }],
	interactions: [{ actionId: 'point', verb: 'point-at', target: 'decision-table.row-2.cell-3' }],
}

try {
	await client.connect(transport)
	const tools = await client.listTools()
	const names = new Set(tools.tools.map(tool => tool.name))
	for (const required of ['betterpptx.help.capabilities', 'betterpptx.authoring.catalog', 'betterpptx.deck.generate_from_spec', 'betterpptx.deck.save', 'betterpptx.deck.dispose']) {
		assert.ok(names.has(required), `Missing required public tool ${required}`)
	}
	pass('public-tool-inventory', { count: names.size })

	const capabilities = await call('betterpptx.help.capabilities', { intent: 'Create a first-class editable animated table and coordinate a 3D presenter with a specific cell.', deckType: 'new', detail: 'summary' })
	assert.equal(capabilities.capabilityDiscovery?.semanticVersion, PUBLIC_SEMANTIC_VERSION)
	assert.equal(capabilities.capabilityDiscovery?.toolSchemaVersion, TOOL_SCHEMA_VERSION)
	pass('versioned-discovery', { semanticVersion: PUBLIC_SEMANTIC_VERSION, toolSchemaVersion: TOOL_SCHEMA_VERSION })

	const tableCatalog = await call('betterpptx.authoring.catalog', { view: 'controls', intent: 'animated table presenter', limit: 50, offset: 0 })
	assert.ok(tableCatalog.interpretation?.matchedIntents?.includes('animated-table'), 'Animated-table intent is not resolved through the live catalog')
	assert.ok(tableCatalog.interpretation?.lessonIds?.includes('animated-table-synergy'), 'Animated-table teaching lesson is not reachable through the live catalog')
	pass('animated-table-discoverable', { matchedIntent: 'animated-table', lessonId: 'animated-table-synergy', returnedControls: tableCatalog.controls?.length || 0 })

	const dryRun = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true })
	assert.equal(dryRun.dryRun, true)
	assert.equal(dryRun.mutationFree, true)
	assert.ok(JSON.stringify(dryRun).includes('animated-table'), 'Dry-run readback lost the animated-table carrier')
	pass('mutation-free-animated-table-dry-run')

	const synergyDryRun = await call('betterpptx.deck.generate_from_spec', { spec: synergySpec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true })
	const performance = synergyDryRun.authoringContracts?.presenterPerformance?.performances?.[0]
	assert.equal(performance?.startMs, 1100, 'Synergy dry-run lost the authored performance start')
	assert.equal(performance?.interactions?.[0]?.target, 'decision-table.row-2.cell-3', 'Synergy dry-run lost the stable cell target')
	assert.equal(performance?.interactions?.[0]?.contactSource, 'measured-performer-motion', 'Synergy dry-run did not use empirical contact timing')
	assert.ok(['aligned', 'stage-constrained'].includes(performance?.interactions?.[0]?.alignment), 'Synergy dry-run did not resolve the presenter/cell contact inside the authored stage')
	pass('presenter-synergy-dry-run', { target: 'decision-table.row-2.cell-3', startMs: 1100, contactMs: performance.interactions[0].atMs, alignment: performance.interactions[0].alignment })

	// Package proof is deliberately non-chargeable. Premium behavior is exercised
	// above through mutation-free dry runs; a live commit must not imply payment
	// authorization merely because this verifier runs against the public MCP.
	const commit = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true })
	deckId = commit.deckId
	assert.ok(deckId)
	pass('public-commit', { deckIdPresent: true })

	for (const tool of ['betterpptx.deck.validate', 'betterpptx.deck.validate_design', 'betterpptx.deck.validate_accessibility', 'betterpptx.deck.validate_quality']) {
		const validation = await call(tool, { deckId })
		pass(tool, { issueCount: validation.issues?.length ?? validation.findings?.length ?? null })
	}

	const auth = await call('betterpptx.auth.status')
	const saveStage = auth.workflowStages?.stages?.find(stage => stage.id === 'final-save')
	if (saveStage?.authorization === 'covered-by-current-authorization' && process.env.BETTERPPTX_RELEASE_TEST_ENTITLEMENT === '1') {
		const saved = await call('betterpptx.deck.save', { deckId, fileName: 'live-animated-table-mcp-smoke.pptx', outputFormat: 'pptx', idempotencyKey: `animated-table-live-${randomUUID()}` })
		assert.ok(saved.downloadUrl, 'Public save returned no download URL')
		const response = await fetch(saved.downloadUrl)
		assert.equal(response.ok, true, `Artifact download failed with HTTP ${response.status}`)
		const bytes = Buffer.from(await response.arrayBuffer())
		assert.ok(bytes.length > 10_000, 'Downloaded PPTX is unexpectedly small')
		const artifactPath = path.join(outputDir, 'live-animated-table-mcp-smoke.pptx')
		await writeFile(artifactPath, bytes)
		const zip = await JSZip.loadAsync(bytes)
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		assert.ok(slideXml.includes('<p:timing>'), 'Downloaded PPTX has no native timing tree')
		assert.doesNotMatch(slideXml, /(?:x|y|cx|cy)="-?\d+\.\d+"/, 'Downloaded PPTX contains fractional integer-only DrawingML coordinates')
		assert.ok(['decision-table.row-1', 'decision-table.row-2', 'decision-table.row-3'].every(name => slideXml.includes(name)), 'Downloaded PPTX lost stable row names')
		pass('public-save-download-package', { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), artifact: artifactPath })
	} else {
		pass('delivery-authorization-boundary', {
			saveAttempted: false,
			authorization: saveStage?.authorization || 'unknown',
			reason: 'No designated covered release-test entitlement was observed; the verifier did not spend funds or promise a downloadable artifact.',
		})
	}

	report.status = 'PASS'
} catch (error) {
	if (error.code === 'AUTH_REQUIRED' && !bearerToken) {
		report.status = 'AUTH_REQUIRED'
		report.blocker = { code: error.code, message: error.message }
		pass('protected-authoring-boundary', { authenticatedExecutionPerformed: false })
	} else {
		report.status = 'FAIL'
		report.error = { name: error.name, message: error.message, stack: error.stack }
		throw error
	}
} finally {
	if (deckId) {
		try { await call('betterpptx.deck.dispose', { deckId }); pass('public-dispose') } catch (error) { report.disposeError = error.message }
	}
	report.completedAt = new Date().toISOString()
	await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
	await client.close().catch(() => {})
	console.log(JSON.stringify({ status: report.status, report: path.join(outputDir, 'report.json'), checks: report.checks.length }, null, 2))
}
