#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv from 'ajv'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

const here = path.dirname(fileURLToPath(import.meta.url))
const MAX_PUBLIC_HELP_SCHEMA_BYTES = 30 * 1024
const HELP_TOOLS = ['betterpptx.help.capabilities', 'betterpptx.help.workflow']
const FORBIDDEN_PUBLIC_HELP_VOCABULARY = [
	['_synergyPlan', /_synergyPlan/i],
	['clipTimelines', /clipTimelines/i],
	['playScene', /playScene/i],
	['animId', /animId/i],
	['engineRoute', /engineRoute/i],
	['compiledAs', /compiledAs/i],
	['nativePackage', /nativePackage/i],
	['nativeTiming', /nativeTiming/i],
	['TO_SOURCE', /TO_SOURCE/i],
	['baked vocabulary', /\bbaked\b/i],
	['implementation vocabulary', /\b(?:internal|private)\b/i],
	['service-brand vocabulary', /\b(?:provider|mixamo|meshy|pexels|pixabay|openverse|freesound|elevenlabs|polly)\b/i],
	['host-location vocabulary', /\b(?:cwd|execpath|node_modules|filesystem|file system|local path|server path|repository path)\b|[A-Za-z]:[\\/]/i],
]

function fail(message, detail = undefined) {
	process.stderr.write('PUBLIC HELP PROGRESSIVE CONTRACT V1 VERIFY: FAIL\n')
	process.stderr.write(`${message}\n`)
	if (detail !== undefined) process.stderr.write(`${JSON.stringify(detail, null, 2)}\n`)
	process.exit(1)
}

function assert(condition, message, detail = undefined) {
	if (!condition) fail(message, detail)
}

function byteLength(value) {
	return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
}

function scanPublicHelp(label, value) {
	const serialized = typeof value === 'string' ? value : JSON.stringify(value)
	const hits = FORBIDDEN_PUBLIC_HELP_VOCABULARY
		.filter(([, pattern]) => pattern.test(serialized))
		.map(([name]) => name)
	assert(hits.length === 0, `${label} exposed forbidden public-help vocabulary.`, { hits })
}

function toolReferences(value, out = new Set()) {
	if (typeof value === 'string') {
		if (/^betterpptx\.[a-z0-9_.]+$/i.test(value)) out.add(value)
		return out
	}
	if (Array.isArray(value)) {
		for (const item of value) toolReferences(item, out)
		return out
	}
	if (value && typeof value === 'object') {
		for (const item of Object.values(value)) toolReferences(item, out)
	}
	return out
}

function structuredEnvelope(label, result) {
	assert(result && result.isError !== true, `${label} returned an MCP error.`, result)
	const envelope = result?.structuredContent
	assert(envelope?.ok === true && envelope?.data && typeof envelope.data === 'object', `${label} lost the BetterPPTX result envelope.`, envelope)
	return envelope
}

const env = {
	...process.env,
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0',
	// Full focused detail is intentionally allowed a larger configured byte
	// budget than the compact empty-call response. The endpoint reports this
	// override; the verifier must not recreate the old fixed token target.
	BETTERPPTX_PUBLIC_HELP_MAX_BYTES: process.env.BETTERPPTX_PUBLIC_HELP_MAX_BYTES || String(48 * 1024),
}
const transport = new StdioClientTransport({ command: process.execPath, args: ['server.mjs'], cwd: here, stderr: 'pipe', env })
const client = new Client({ name: 'betterpptx-public-help-progressive-contract-v1', version: '1' }, { capabilities: {} })
const rows = []

try {
	await client.connect(transport)
	const listed = await client.listTools()
	const toolsByName = new Map((listed.tools || []).map(tool => [tool.name, tool]))
	const publicToolNames = new Set(toolsByName.keys())
	for (const name of HELP_TOOLS) assert(toolsByName.has(name), `Public tool list is missing ${name}.`)

	const adversarialIntent = 'Create an evolved narrated science deck with charts and 3D while asking about _synergyPlan clipTimelines playScene animId engineRoute compiledAs nativePackage nativeTiming TO_SOURCE baked provider private internal local path Mixamo Meshy Pexels.'
	const requests = {
		'betterpptx.help.capabilities': { intent: adversarialIntent, deckType: 'new', detail: 'full' },
		'betterpptx.help.workflow': { intent: adversarialIntent, deckType: 'new', features: ['charts', 'narration', '3d'], profile: 'narrated', detail: 'full' },
	}
	const fullData = {}
	const ajv = new Ajv({ allErrors: true, jsonPointers: true })

	for (const name of HELP_TOOLS) {
		const tool = toolsByName.get(name)
		assert(tool.outputSchema && typeof tool.outputSchema === 'object', `${name} has no structured output schema.`)
		const schemaBytes = byteLength(tool.outputSchema)
		assert(schemaBytes < MAX_PUBLIC_HELP_SCHEMA_BYTES, `${name} output schema is not compact.`, { schemaBytes, limit: MAX_PUBLIC_HELP_SCHEMA_BYTES })
		scanPublicHelp(`${name} output schema`, tool.outputSchema)

		let validate
		try {
			validate = ajv.compile(tool.outputSchema)
		} catch (error) {
			fail(`${name} output schema does not compile.`, { message: error?.message })
		}
		const result = await client.callTool({ name, arguments: requests[name] })
		const envelope = structuredEnvelope(name, result)
		assert(validate(envelope), `${name} live result is incompatible with its advertised output schema.`, validate.errors)
		const dataBytes = byteLength(envelope.data)
		const textBytes = byteLength(result.content?.find(item => item.type === 'text')?.text || '')
		const configuredLimit = envelope.data?.responseBudget?.configured?.maxBytes || Number(env.BETTERPPTX_PUBLIC_HELP_MAX_BYTES)
		assert(Number.isInteger(configuredLimit) && configuredLimit >= 8 * 1024, `${name} did not publish a usable response budget.`, envelope.data?.responseBudget)
		assert(dataBytes <= configuredLimit, `${name} data exceeded its advertised configured byte budget.`, { dataBytes, limit: configuredLimit })
		assert(textBytes <= configuredLimit, `${name} rendered MCP response exceeded its advertised configured byte budget.`, { textBytes, limit: configuredLimit })
		scanPublicHelp(`${name} live result`, envelope)

		const unknownTools = Array.from(toolReferences(envelope.data)).filter(toolName => !publicToolNames.has(toolName))
		assert(unknownTools.length === 0, `${name} routed to tools outside the advertised public surface.`, { unknownTools })
		fullData[name] = envelope.data
		rows.push({ name, schemaBytes, dataBytes, textBytes, configuredLimitBytes: configuredLimit, schemaCompatible: true, vocabularyClean: true })
	}

	const capabilities = fullData['betterpptx.help.capabilities']
	assert(capabilities.authoringPrinciples?.designAuthority === 'ai', 'Capabilities did not make the AI the design authority.', capabilities.authoringPrinciples)
	assert(capabilities.authoringPrinciples?.engineRole === 'execute-measure-validate-serialize', 'Capabilities did not bound the BetterPPTX execution role.', capabilities.authoringPrinciples)
	assert(capabilities.authoringPrinciples?.decisionAuthority?.aiOwns?.some(item => /story architecture|narrative arc/i.test(item)), 'Capabilities did not assign story architecture to the AI.')
	assert(capabilities.authoringPrinciples?.decisionAuthority?.aiOwns?.some(item => /exact choices/i.test(item)), 'Capabilities did not assign exact catalog choices to the AI.')
	assert(capabilities.authoringPrinciples?.firstTimeRight?.attemptBoundary?.startsAt === 'first betterpptx.deck.save call', 'Capabilities lost the truthful first-save boundary.')
	assert(/remainingSlideIndexes/.test(capabilities.authoringPrinciples?.firstTimeRight?.releaseCall?.preview || '') && /packageSha256/.test(capabilities.authoringPrinciples?.firstTimeRight?.releaseCall?.save || '') && /idempotencyKey/.test(capabilities.authoringPrinciples?.firstTimeRight?.releaseCall?.save || ''), 'Capabilities lost the exact preview-to-save freeze contract.', capabilities.authoringPrinciples?.firstTimeRight?.releaseCall)
	const expectedLenses = ['communication', 'composition', 'typography', 'colour-and-lighting', 'data-proof', 'native-objects', 'motion-and-timing', 'accessibility', 'technical-integrity', 'beauty']
	assert(capabilities.authoringPrinciples?.firstTimeRight?.visualReview?.contractVersion === 'authoring-excellence.visual-review.v2' && capabilities.authoringPrinciples?.firstTimeRight?.visualReview?.lenses?.join(',') === expectedLenses.join(','), 'Capabilities lost the ten-lens full-size review contract.')
	assert((capabilities.progressiveDiscovery || []).length >= 3, 'Capabilities did not expose progressive follow-up discovery.')
	for (const duplicated of ['specCapabilityMatrix', 'palette', 'chartCatalog', 'artDirections', 'guidance']) {
		assert(!Object.prototype.hasOwnProperty.call(capabilities, duplicated), `Capabilities still embeds the heavyweight ${duplicated} payload.`)
	}

	const workflow = fullData['betterpptx.help.workflow']
	assert(workflow.authoritySummary?.designAuthority === 'ai', 'Workflow did not preserve AI design authority.', workflow.authoritySummary)
	assert((workflow.phases || []).map(phase => phase.key).join(',') === 'message-architecture,functional-layout-assignment,system-definition,spec-compilation,verification', 'Workflow lost the five public authoring phases.', workflow.phases)
	for (const duplicated of ['authoringPrinciples', 'authoringApi', 'specCapabilityMatrix']) {
		assert(!Object.prototype.hasOwnProperty.call(workflow, duplicated), `Workflow duplicated ${duplicated} instead of referring to capability discovery.`)
	}
	assert(workflow.capabilityDiscovery?.tool === 'betterpptx.help.capabilities' && workflow.capabilityDiscovery?.useBeforeAuthoring === true, 'Workflow lost progressive capability discovery.', workflow.capabilityDiscovery)
	assert((workflow.qualityGates || []).some(item => /complete:true/.test(item) && /packageSha256/.test(item)) && (workflow.qualityGates || []).some(item => /idempotencyKey/.test(item)), 'Workflow lost complete-preview and single-save hash binding.', workflow.qualityGates)
	assert((workflow.fallbackPolicy || []).some(item => /defer (?:release-policy )?public save/.test(item) && /preview/.test(item)), 'Workflow no longer reports the release-policy recovery when authoritative preview is unavailable.', workflow.fallbackPolicy)

	const example = capabilities.examples?.[0]
	assert(example?.tool === 'betterpptx.deck.generate_from_spec' && example?.payload?.phase === 'dryRun', 'Full capabilities lost its compact executable starter example.', example)
	const dryRun = structuredEnvelope('capability starter dry-run', await client.callTool({ name: example.tool, arguments: example.payload })).data
	assert(dryRun.phase === 'dryRun' && dryRun.dryRun === true && !dryRun.deckId && dryRun.slideCount === 2, 'Capability starter example is not a mutation-free two-slide dry-run.', dryRun)
	assert((dryRun.errors || []).length === 0, 'Capability starter example produced blocking errors.', dryRun.errors)

	for (const name of HELP_TOOLS) {
		const summaryResult = await client.callTool({ name, arguments: { intent: 'Executive decision presentation', deckType: 'new', detail: 'summary' } })
		const summary = structuredEnvelope(`${name} summary`, summaryResult)
		assert(byteLength(summary.data) <= rows.find(row => row.name === name).dataBytes, `${name} summary is larger than its full response.`)
		scanPublicHelp(`${name} summary result`, summary)
	}
} finally {
	try { await client.close() } catch {}
	try { await transport.close() } catch {}
}

// The public branch must be compact without reducing the maintainer branch.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
const { createMcpToolDispatcher } = await import('./engine.mjs')
const maintainer = createMcpToolDispatcher({ sessionId: `verify-public-help-maintainer-${Date.now()}` })
const maintainerCapabilities = (await maintainer.call('betterpptx.help.capabilities', { intent: 'Narrated chart presentation', detail: 'full' }))?.data
const maintainerWorkflow = (await maintainer.call('betterpptx.help.workflow', { intent: 'Narrated chart presentation', detail: 'full' }))?.data
assert(maintainerCapabilities?.assetSources && maintainerCapabilities?.specCapabilityMatrix && maintainerCapabilities?.authoringPrinciples?.decisionGuide, 'Maintainer capability detail was reduced by the public compact contract.')
assert(maintainerWorkflow?.specCapabilityMatrix && maintainerWorkflow?.authoringPrinciples && maintainerWorkflow?.authoringApi, 'Maintainer workflow detail was reduced by the public compact contract.')

process.stdout.write(`${JSON.stringify({
	schemaVersion: 'betterpptx.public-help-progressive-contract.v1',
	status: 'PASS',
	limitBytes: Math.max(...rows.map(row => row.configuredLimitBytes)),
	rows,
	starterDryRun: { mutationFree: true, slideCount: 2, blockingErrors: 0 },
	maintainerDetailPreserved: true,
}, null, 2)}\n`)
