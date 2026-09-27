#!/usr/bin/env node

import assert from 'node:assert/strict'
import Ajv from 'ajv'

const DEFAULT_ENDPOINTS = [
	'https://betterpptx.tail070c3a.ts.net',
	'https://betterpptx.tail070c3a.ts.net',
]
const protocolVersion = '2026-07-28'
const endpointArgs = process.argv.filter(value => value.startsWith('--endpoint=')).map(value => value.slice('--endpoint='.length).replace(/\/$/, ''))
const endpoints = endpointArgs.length
	? endpointArgs
	: String(process.env.BETTERPPTX_PUBLIC_ENDPOINTS || '').split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean).length
		? String(process.env.BETTERPPTX_PUBLIC_ENDPOINTS).split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean)
		: DEFAULT_ENDPOINTS
const includePortableRoute = process.argv.includes('--include-portable-route')
const ajv = new Ajv({ allErrors: true, strict: false })

function meta() {
	return {
		_meta: {
			'io.modelcontextprotocol/protocolVersion': protocolVersion,
			'io.modelcontextprotocol/clientInfo': { name: 'betterpptx-public-acceptance-v1', version: '1' },
			'io.modelcontextprotocol/clientCapabilities': {},
		},
	}
}

async function rpc(origin, id, method, params) {
	let response
	for (let attempt = 0; attempt < 3; attempt += 1) {
		response = await fetch(`${origin}/mcp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json', 'mcp-protocol-version': protocolVersion },
			body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
		})
		if (response.status !== 502 || attempt === 2) break
		await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
	}
	const text = await response.text()
	let body
	try { body = JSON.parse(text) } catch {
		const line = text.split(/\r?\n/).find(value => value.startsWith('data: '))
		assert.ok(line, `${origin} returned non-JSON MCP response (${response.status}).`)
		body = JSON.parse(line.slice(6))
	}
	assert.equal(response.status, 200, `${origin} ${method} returned HTTP ${response.status}.`)
	assert.equal(body?.jsonrpc, '2.0', `${origin} ${method} did not return JSON-RPC 2.0.`)
	assert.ok(!body.error, `${origin} ${method} returned an RPC error: ${JSON.stringify(body.error)}`)
	return body.result
}

async function health(origin) {
	const response = await fetch(`${origin}/health`, { headers: { accept: 'application/json' } })
	assert.equal(response.status, 200, `${origin} health returned HTTP ${response.status}.`)
	const value = await response.json()
	assert.equal(value.status, 'ok', `${origin} health did not report ok.`)
	return value
}

function byteLength(value) {
	return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function assertPublicText(value, label) {
	const serialized = JSON.stringify(value)
	// Search the serialized envelope. A real Windows path has two escaped
	// backslashes in JSON; a quoted field such as kind:"text3d" must not be a
	// false positive.
	assert.doesNotMatch(serialized, /\b[A-Za-z]:\\\\|file:\/\/|\b(?:node_modules|PptxGenJS|engine\.mjs|server\.mjs|BETTERPPTX_[A-Z0-9_]+)\b/i, `${label} exposes a private implementation detail.`)
}

function toolMap(list) {
	return new Map((list || []).map(tool => [tool.name, tool]))
}

function validateInput(tools, name, value) {
	const tool = tools.get(name)
	assert.ok(tool, `Advertised call references a missing public tool: ${name}`)
	const validate = ajv.compile(tool.inputSchema)
	assert.equal(validate(value), true, `${name} request does not match tools/list: ${JSON.stringify(validate.errors)}`)
}

function validateEnvelope(tools, name, envelope) {
	const tool = tools.get(name)
	assert.ok(tool?.outputSchema, `${name} has no advertised output schema.`)
	const validate = ajv.compile(tool.outputSchema)
	assert.equal(validate(envelope), true, `${name} result does not match tools/list: ${JSON.stringify(validate.errors)}`)
}

function collectCoordinatePaths(value, path = '', rows = []) {
	if (!value || typeof value !== 'object') return rows
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) collectCoordinatePaths(value[index], `${path}[${index}]`, rows)
		return rows
	}
	for (const [key, child] of Object.entries(value)) {
		const childPath = path ? `${path}.${key}` : key
		if (['x', 'y', 'w', 'h', 'bbox', 'rect', 'points'].includes(key)) rows.push(childPath)
		collectCoordinatePaths(child, childPath, rows)
	}
	return rows
}

function isPermittedVisualReferenceCoordinatePath(toolName, schemaPath) {
	return toolName === 'betterpptx.deck.generate_from_spec'
		&& schemaPath.startsWith('properties.spec.')
		&& /\.pixel(?:Frame|Points|Paths)(?:\.|\[)/.test(schemaPath)
}

async function inspectEndpoint(origin) {
	const common = meta()
	const serviceHealth = await health(origin)
	const discovered = await rpc(origin, 1, 'server/discover', common)
	const listed = await rpc(origin, 2, 'tools/list', common)
	const tools = toolMap(listed.tools)
	assert.ok(tools.size > 0, `${origin} returned no public tools.`)
	assert.equal(serviceHealth.semanticVersion, discovered.publicDiscovery?.semanticVersion, `${origin} health semantic version disagrees with server/discover.`)
	assert.equal(serviceHealth.toolSchemaVersion, discovered.publicDiscovery?.toolSchemaVersion, `${origin} health schema version disagrees with server/discover.`)
	assert.equal(serviceHealth.capabilityContentDigest, discovered.publicDiscovery?.capabilityContentDigest, `${origin} health capability digest disagrees with server/discover.`)
	assert.equal(serviceHealth.advertisedToolSchemaDigest, discovered.publicDiscovery?.advertisedToolSchemaDigest, `${origin} health tool-schema digest disagrees with server/discover.`)
	assert.equal(serviceHealth.capabilityContentDigestCoverage, discovered.publicDiscovery?.capabilityContentDigestCoverage, `${origin} health capability-digest coverage disagrees with server/discover.`)
	assert.equal(serviceHealth.advertisedToolSchemaDigestCoverage, discovered.publicDiscovery?.advertisedToolSchemaDigestCoverage, `${origin} health tool-schema digest coverage disagrees with server/discover.`)
	assert.match(String(discovered.publicDiscovery?.advertisedToolSchemaDigestCoverage || ''), /inputSchema.*outputSchema/i, `${origin} schema digest does not declare full public schema coverage.`)
	assert.equal(discovered.publicDiscovery?.advertisedToolSchemaDigest, listed.publicDiscovery?.advertisedToolSchemaDigest, `${origin} discovery/tools-list schema digests disagree.`)
	assert.equal(discovered.publicDiscovery?.capabilityContentDigest, listed.publicDiscovery?.capabilityContentDigest, `${origin} discovery/tools-list capability digests disagree.`)
	assert.equal(listed.tools.length, serviceHealth.advertisedToolCount, `${origin} health inventory count disagrees with tools/list.`)
	const coordinateInputLeaks = listed.tools.flatMap(tool => collectCoordinatePaths(tool.inputSchema)
		.filter(schemaPath => !isPermittedVisualReferenceCoordinatePath(tool.name, schemaPath))
		.map(schemaPath => `${tool.name}:${schemaPath}`))
	assert.deepEqual(coordinateInputLeaks, [], `${origin} exposes coordinates outside the governed visual-reference route: ${JSON.stringify(coordinateInputLeaks)}`)

	let id = 10
	async function call(name, args) {
		validateInput(tools, name, args)
		const result = await rpc(origin, id++, 'tools/call', { name, arguments: args, ...common })
		const envelope = result?.structuredContent
		assert.ok(envelope?.ok === true && envelope.data, `${origin} ${name} did not return a successful BetterPPTX envelope.`)
		validateEnvelope(tools, name, envelope)
		assertPublicText(envelope.data, `${origin} ${name}`)
		return envelope.data
	}

	const help = await call('betterpptx.help.capabilities', {})
	assert.equal(help.detail, 'summary')
	assert.equal(help.capabilityOverview?.families?.length, 11)
	assert.equal(help.capabilityOverview?.extendedLayers?.length, 7)
	const helpText = JSON.stringify(help)
	assert.doesNotMatch(helpText, /…/, `${origin} default discovery contains a character-clipped description.`)
	for (const phrase of ['gradient glyph', 'bevel', 'SmartArt', 'ChartEx', 'native 3D', 'Morph', 'presenter', 'synthesis', 'embedded audio', 'autoplay', 'measured', 'Avatar — talking-head video', '3D presenter', 'Rigged persona generation', 'not production']) {
		assert.match(helpText, new RegExp(phrase, 'i'), `${origin} default discovery omitted ${phrase}.`)
	}
	assert.equal(help.capabilityOverview?.personaCapabilities?.length, 3, `${origin} default discovery did not expose the three distinct persona capabilities.`)
	const personaNames = (help.capabilityOverview?.personaCapabilities || []).map(entry => entry.name)
	assert.deepEqual(personaNames, ['Avatar — talking-head video', '3D presenter', 'Rigged persona generation'], `${origin} persona terminology or ordering is inconsistent.`)
	assert.equal(help.releaseInfrastructure?.verificationPolicy?.policy, 'production-non-rendering', `${origin} discovery did not expose the deployed production verification policy.`)
	assert.equal(help.releaseInfrastructure?.verificationPolicy?.rendererRequiredForSave, false, `${origin} production discovery still requires a renderer for save.`)
	assert.equal(help.releaseInfrastructure?.authoritativePreview?.rendererRequiredForSave, false, `${origin} preview readiness contradicts the production save policy.`)
	assert.equal(help.releaseInfrastructure?.authoritativePreview?.certificationImpact, 'not-required-for-production-save', `${origin} preview certification impact contradicts the production policy.`)
	assert.doesNotMatch(helpText, /preview every slide before save|configure .*PowerPoint.*continue|defer .*save when preview/i, `${origin} production discovery still contains universal preview-save guidance.`)
	assert.ok(!(help.requiredTools || []).includes('betterpptx.deck.preview'), `${origin} production required tools still include PowerPoint preview.`)
	const attachTool = tools.get('betterpptx.avatar.attach_result')
	assert.ok(attachTool, `${origin} did not expose the public Avatar attachment route.`)
	assert.deepEqual(attachTool.inputSchema.required, ['deckId', 'slideIndex', 'script'], `${origin} Avatar attachment required fields are not explicit.`)
	assert.deepEqual(attachTool.inputSchema.anyOf, [{ required: ['jobId'] }, { required: ['avatarAsset'] }], `${origin} Avatar attachment asset selector is not explicit.`)
	validateInput(tools, 'betterpptx.avatar.attach_result', { deckId: 'deck-contract-check', slideIndex: 0, script: 'Hello.', jobId: 'job-contract-check' })
	assert.equal(help.responseBudget?.measuredBytes, byteLength(help), `${origin} response budget does not measure its public data.`)
	assert.ok(help.responseBudget.measuredBytes <= help.responseBudget.configured.maxBytes, `${origin} default discovery exceeded its configured byte budget.`)
	assert.equal(help.responseBudget.proxy.status, 'approximate')
	assert.equal(help.responseBudget.actualTokenizer.status, 'not-measured')
	assert.equal(help.responseBudget.connectorVisiblePayload.status, 'not-measured')
	for (const next of help.nextCalls || []) validateInput(tools, next.tool, next.request)
	const fullHelp = await call('betterpptx.help.capabilities', { detail: 'full' })
	assert.equal(fullHelp.detail, 'full')
	assert.ok(byteLength(fullHelp) > byteLength(help), `${origin} full capability detail did not expand the summary.`)
	assert.doesNotMatch(JSON.stringify(fullHelp), /…/, `${origin} full discovery contains a character-clipped description.`)
	const workflow = await call('betterpptx.help.workflow', {})
	assert.ok(!(workflow.routing?.selected || []).includes('betterpptx.deck.preview'), `${origin} production workflow still makes preview a required route.`)
	assert.match(JSON.stringify(workflow.qualityGates || []), /not a production-save (?:dependency|service component)/i, `${origin} workflow does not state the production non-rendering save rule.`)
	const advertisedTypographyCall = help.nextCalls?.find(next => next.tool === 'betterpptx.authoring.catalog')
	assert.ok(advertisedTypographyCall, `${origin} did not advertise the focused typography catalog call.`)
	const typographyCatalog = await call(advertisedTypographyCall.tool, advertisedTypographyCall.request)
	assert.ok(Array.isArray(typographyCatalog.entries), `${origin} advertised typography catalog did not return entries.`)

	const animation = await call('betterpptx.help.tool_recipe', { surface: 'animation', detail: 'full' })
	assert.equal(animation.detail, 'full')
	assert.deepEqual(animation.recipes?.[0]?.presenterPerformance?.limits, {
		maximumActions: 32,
		maximumDurationMs: 120000,
		actionDurationMs: [100, 60000],
		maximumCycles: 30,
		maximumBlendMs: 2000,
		maximumTransformKeyframes: 128,
		maximumTravelKeyframes: 64,
		maximumInteractions: 32,
		maximumSelectedMotionIdsPerPresenter: 18,
		maximumStartMs: 60000,
		maximumEntryExitDurationMs: 10000,
		fpsRange: [1, 60],
	})
	assert.deepEqual(animation.recipes?.[0]?.presenterPerformance?.sampling?.range, [1, 60])

	const narration = await call('betterpptx.help.tool_recipe', { surface: 'narration', detail: 'full' })
	assert.equal(narration.detail, 'full')
	assert.ok(narration.recipes?.[0]?.narrationContract?.stages?.length >= 7)
	assert.ok(narration.recipes?.[0]?.authoringFields?.timing?.includes('atMs/endMs'))
	assert.ok(narration.recipes?.[0]?.authoringFields?.autoplay?.length)
	assert.match(JSON.stringify(narration), /betterpptx\.narration\.synthesize/i)

	const text3d = await call('betterpptx.help.tool_recipe', { surface: 'text3d', detail: 'full' })
	assert.equal(text3d.detail, 'full')
	assert.equal(text3d.recipes?.length, 1)
	assert.deepEqual(text3d.unknownSurfaces, [])
	const avatarRecipe = await call('betterpptx.help.tool_recipe', { surface: 'avatar', detail: 'full' })
	const talkingHeadRecipe = await call('betterpptx.help.tool_recipe', { surface: 'talking-head', detail: 'full' })
	assert.equal(avatarRecipe.detail, 'full')
	assert.equal(talkingHeadRecipe.detail, 'full')
	assert.equal(avatarRecipe.recipes?.length, 1)
	assert.equal(talkingHeadRecipe.recipes?.length, 1)
	assert.deepEqual(avatarRecipe.unknownSurfaces, [])
	assert.deepEqual(talkingHeadRecipe.unknownSurfaces, [])
	assert.equal(avatarRecipe.recipes[0].canonicalSurface, 'avatar-talking-head-video')
	assert.equal(avatarRecipe.recipes[0].name, 'Avatar — talking-head video')
	assert.deepEqual(talkingHeadRecipe.recipes[0], avatarRecipe.recipes[0], `${origin} Avatar and talking-head recipes do not resolve to one canonical recipe.`)
	const avatarSequenceTools = avatarRecipe.recipes[0].sequence
	for (const step of avatarSequenceTools.filter(step => step.type?.startsWith('executable-') && step.tool)) validateInput(tools, step.tool, step.request || {})
	for (const requiredTool of ['betterpptx.billing.estimate', 'betterpptx.avatar.render_job', 'betterpptx.avatar.job_status', 'betterpptx.avatar.attach_result', 'betterpptx.deck.validate_avatar_narration', 'betterpptx.deck.save']) {
		assert.ok(avatarSequenceTools.some(step => step.tool === requiredTool), `${origin} Avatar recipe omitted ${requiredTool}.`)
	}
	assert.ok(avatarSequenceTools.some(step => step.type === 'authorization-step'), `${origin} Avatar recipe omitted explicit authorization stages.`)
	assert.ok(avatarSequenceTools.some(step => step.type === 'result-check' && step.requiredOutput?.includes('video.durationMs')), `${origin} Avatar recipe omitted measured result readback.`)
	const presenterRecipe = await call('betterpptx.help.tool_recipe', { surface: '3d-presenter', detail: 'full' })
	assert.equal(presenterRecipe.detail, 'full')
	assert.equal(presenterRecipe.recipes?.[0]?.name, '3D presenter')
	assert.match(JSON.stringify(presenterRecipe), /does not generate a new persona|rigged-persona-generation/i)
	const personaRecipe = await call('betterpptx.help.tool_recipe', { surface: 'rigged-persona', detail: 'full' })
	assert.equal(personaRecipe.detail, 'full')
	assert.equal(personaRecipe.recipes?.[0]?.productionReady, false)
	assert.equal(personaRecipe.recipes?.[0]?.status, 'partial-experimental')
	assert.match(JSON.stringify(personaRecipe), /experimental|not.*production/i)
	const unknownRecipe = await call('betterpptx.help.tool_recipe', { surface: 'unsupported-surface', detail: 'full' })
	assert.equal(unknownRecipe.detail, 'full')
	assert.equal(unknownRecipe.recipes?.length, 0)
	assert.deepEqual(unknownRecipe.unknownSurfaces, ['unsupportedsurface'])
	const unknownCatalog = await call('betterpptx.authoring.catalog', { family: 'unsupported-family', offset: 0, limit: 5 })
	assert.equal(unknownCatalog.emptyReason, 'UNKNOWN_FAMILY')
	assert.equal(unknownCatalog.entries?.length, 0)
	const options = await call('betterpptx.options.catalog', { surface: 'text3D', format: 'full' })
	assert.ok(options)

	const shapes = await call('betterpptx.authoring.catalog', { family: 'shapes-gradients', query: 'gradient', offset: 0, limit: 5 })
	const presenter = await call('betterpptx.authoring.catalog', { family: 'presenter-motion', query: 'reveal gesture', offset: 0, limit: 5 })
	const presenterCatalog = await call('betterpptx.authoring.catalog', { family: 'presenter-motion', offset: 0, limit: 5 })
	assert.ok(shapes.entries?.length > 0, `${origin} shapes catalog returned no gradient entries.`)
	assert.ok(Array.isArray(presenter.entries), `${origin} presenter catalog did not return a result list.`)
	assert.ok(presenterCatalog.entries?.length > 0, `${origin} presenter catalog returned no selectable entries.`)
	const voices = await call('betterpptx.narration.voices', { language: 'en-US' })
	assert.equal(typeof voices.catalogAvailable, 'boolean')
	assert.equal(typeof voices.synthesisRuntimeAvailable, 'boolean')
	assert.equal(typeof voices.productionReady, 'boolean')
	// Use a schema-valid but unavailable locale for the public path. Invalid
	// gender values are correctly rejected by the served enum before execution.
	const unsupportedVoices = await call('betterpptx.narration.voices', { language: 'zz-ZZ' })
	assert.equal(unsupportedVoices.listedVoiceCount, 0)
	assert.equal(unsupportedVoices.filter?.language, 'zz_zz')

	const starter = help.nextCalls?.find(next => next.tool === 'betterpptx.deck.generate_from_spec')
	assert.ok(starter, `${origin} did not advertise a complete dry-run starter.`)
	const dryRun = await call(starter.tool, starter.request)
	assert.equal(dryRun.phase, 'dryRun')
	assert.equal(dryRun.dryRun, true)
	assert.equal(dryRun.deckId, undefined)
	assert.equal(dryRun.slideCount, 1)
	assert.deepEqual(dryRun.presenterContract?.clock, { source: 'none', master: 'authored slide timing', shared: false }, `${origin} canonical readback exposed a presenter clock for a slide without a presenter.`)
	assert.equal(dryRun.presenterContract?.ready, true, `${origin} canonical readback incorrectly blocked an absent presenter.`)
	assert.deepEqual(dryRun.presenterContract?.warnings, [], `${origin} canonical readback emitted an inapplicable presenter diagnostic.`)
	assert.equal(dryRun.presenterContract?.timeline?.entries?.[0]?.timingAuthority, 'none', `${origin} absent presenter received a media timing authority.`)
	assert.equal(dryRun.presenterContract?.executionPlan?.entries?.[0]?.timingAuthority, 'none', `${origin} absent presenter execution plan received a media timing authority.`)

	let portable = { status: 'NOT_TESTED', reason: 'Mutating upload/export route not requested; tools/list schema was checked.' }
	if (includePortableRoute) {
		const json = JSON.stringify(starter.request.spec)
		const uploaded = await call('betterpptx.assets.upload', {
			kind: 'jsonSpec',
			data: `data:application/json;base64,${Buffer.from(json, 'utf8').toString('base64')}`,
			fileName: 'public-acceptance.jsonSpec.json',
			idempotencyKey: `public-acceptance-${Date.now()}`,
		})
		const specHandle = uploaded.handle || uploaded.asset?.handle
		assert.ok(typeof specHandle === 'string' && specHandle.length > 0, `${origin} jsonSpec upload did not return an opaque handle.`)
		const handleDryRun = await call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', dryRun: true, detail: 'summary' })
		assert.equal(handleDryRun.phase, 'dryRun')
		const bundle = await call('betterpptx.spec.export_bundle', { specHandle, download: false })
		portable = { status: 'PASS', kind: uploaded.kind, slideCount: uploaded.slideCount, handlePrefix: specHandle.slice(0, 16), dryRun: handleDryRun.phase, bundleMode: bundle.mode }
	}

	return {
		origin,
		transport: 'MCP 2026-07-28 HTTP JSON-RPC',
		health: { status: serviceHealth.status, semanticVersion: serviceHealth.semanticVersion, toolSchemaVersion: serviceHealth.toolSchemaVersion, registryDigest: serviceHealth.capabilityContentDigest, advertisedToolSchemaDigest: serviceHealth.advertisedToolSchemaDigest, advertisedToolCount: serviceHealth.advertisedToolCount },
		serverAdvertisedToolCount: listed.tools.length,
		identity: listed.publicDiscovery,
		defaultDiscovery: { status: 'PASS', detail: help.detail, familyCount: help.capabilityOverview.families.length, extendedLayerCount: help.capabilityOverview.extendedLayers.length, measuredBytes: help.responseBudget.measuredBytes, fullDetailBytes: byteLength(fullHelp) },
		followUpCalls: { status: 'PASS', animationDetail: animation.detail, narrationDetail: narration.detail, text3dDetail: text3d.detail, avatarDetail: avatarRecipe.detail, talkingHeadCanonicalSurface: talkingHeadRecipe.recipes?.[0]?.canonicalSurface, presenterRecipe: presenterRecipe.recipes?.[0]?.name, personaRecipeStatus: personaRecipe.recipes?.[0]?.status, unknownRecipe: unknownRecipe.unknownSurfaces, unknownCatalog: unknownCatalog.emptyReason, typographyEntries: typographyCatalog.entries.length, shapesEntries: shapes.entries.length, presenterEntries: presenter.entries.length, presenterCatalogEntries: presenterCatalog.entries.length, voicesListed: voices.listedVoiceCount, unavailableLocale: unsupportedVoices.filter?.language },
		dryRun: { status: 'PASS', phase: dryRun.phase, slideCount: dryRun.slideCount, mutationFree: dryRun.dryRun === true && dryRun.deckId === undefined },
		portableRoute: portable,
	}
}

try {
	const results = []
	for (const origin of endpoints) results.push(await inspectEndpoint(origin))
	process.stdout.write(`${JSON.stringify({ schemaVersion: 'betterpptx.public-tailscale-acceptance.v1', status: 'PASS', endpoints: results }, null, 2)}\n`)
} catch (error) {
	process.stderr.write(`${JSON.stringify({ schemaVersion: 'betterpptx.public-tailscale-acceptance.v1', status: 'FAIL', message: error.message }, null, 2)}\n`)
	process.exitCode = 1
}
