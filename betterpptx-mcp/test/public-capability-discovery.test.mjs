import assert from 'node:assert/strict'
import Ajv from 'ajv'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_NARRATION_DISABLED = '1'

const { publicToolList } = await import('../blackbox.mjs')
const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')
const { publicBaselineCatalog } = await import('../public-baseline-catalog.mjs')
const { publicAuthoringCapabilityCatalog } = await import('../authoring-capability-registry.mjs')
const { publicCapabilityDigest, PUBLIC_CAPABILITY_DIGEST_COVERAGE, PUBLIC_TOOL_SCHEMA_DIGEST_COVERAGE } = await import('../public-manifest.mjs')
const { dispatchMcpV2Message } = await import('../mcp-v2/handler.mjs')
const { MCP_V2_PROTOCOL_VERSION } = await import('../mcp-v2/protocol.mjs')
const { INSTRUCTIONS, PUBLIC_INSTRUCTIONS } = await import('../server.mjs')

const publicTools = publicToolList(TOOLS)
const publicToolByName = new Map(publicTools.map(tool => [tool.name, tool]))
const publicToolNames = new Set(publicTools.map(tool => tool.name))
const dispatcher = createMcpToolDispatcher({ sessionId: 'public-capability-discovery-contract-v1' })
const ajv = new Ajv({ allErrors: true, strict: false })

function dataOf(result, label = 'tool call') {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`)
	return result.data || result
}

function responseBytes(value) {
	return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function validateInput(toolName, value) {
	const tool = publicToolByName.get(toolName)
	assert.ok(tool, `progressive discovery references a non-public tool: ${toolName}`)
	const validate = ajv.compile(tool.inputSchema)
	assert.equal(validate(value), true, `${toolName} example does not match served schema: ${JSON.stringify(validate.errors)}`)
}

function validateOutput(toolName, envelope) {
	const tool = publicToolByName.get(toolName)
	assert.ok(tool?.outputSchema, `${toolName} does not publish an output schema`)
	const validate = ajv.compile(tool.outputSchema)
	assert.equal(validate(envelope), true, `${toolName} output does not match served schema: ${JSON.stringify(validate.errors)}`)
}

test('initial server guidance stays compact and delegates detailed design teaching to public discovery', () => {
	assert.ok(Buffer.byteLength(INSTRUCTIONS, 'utf8') < 900)
	assert.ok(Buffer.byteLength(PUBLIC_INSTRUCTIONS, 'utf8') < 1600)
	assert.match(PUBLIC_INSTRUCTIONS, /betterpptx\.help\.capabilities/)
	assert.match(PUBLIC_INSTRUCTIONS, /AI owns story, exact geometry, style, motion/)
	assert.match(PUBLIC_INSTRUCTIONS, /never silently downgrade/)
	assert.match(PUBLIC_INSTRUCTIONS, /host slide skill or local generator does not/)
	assert.match(publicToolByName.get('betterpptx.help.workflow').description, /usable without a host-provided slide skill/)
	assert.match(publicToolByName.get('betterpptx.authoring.capabilities').description, /Director assistance is optional/)
	assert.match(publicToolByName.get('betterpptx.narration.synthesize').description, /TOOL_TIMEOUT.*betterpptx\.operation\.status/)
	assert.doesNotMatch(PUBLIC_INSTRUCTIONS, /assisted semantic|PowerPoint reopen.*require/i)
})

test('canonical first discovery is complete, bounded, public, and readiness-aware', async () => {
	const result = await dispatcher.call('betterpptx.help.capabilities', {})
	const data = dataOf(result, 'help.capabilities')
	assert.ok(responseBytes(data) <= data.responseBudget.configured.maxBytes, 'help response must fit its configured byte budget')
	assert.equal(data.responseBudget?.measuredBytes, responseBytes(data), 'help response budget must measure the final public projection')
	assert.equal(data.responseBudget?.status, 'within-configured-byte-budget', 'default help overview must fit its configured byte budget')
	assert.equal(data.responseBudget?.proxy?.status, 'approximate', 'proxy token estimates must be labeled as approximate')
	assert.equal(data.responseBudget?.actualTokenizer?.status, 'not-measured', 'actual tokenizer measurements must not be fabricated')
	assert.equal(data.responseBudget?.connectorVisiblePayload?.status, 'estimated-server-boundary')
	assert.equal(data.responseBudget?.connectorVisiblePayload?.protocolEnvelopeBytes, null, 'exact connector envelope measurements must not be fabricated')
	assert.equal(data.responseBudget?.connectorVisiblePayload?.duplicationExpectedForCompatibility, true)
	assert.ok(data.responseBudget?.connectorVisiblePayload?.estimatedCompleteToolResultBytes > data.responseBudget.measuredBytes)
	assert.doesNotMatch(JSON.stringify(data), /…/, 'default help overview must not character-clip descriptions')
	assert.ok(data.capabilityContentDigest === undefined || typeof data.capabilityContentDigest === 'string')
	assert.equal(data.capabilityOverview.families.length, 11)
	assert.deepEqual(
		data.capabilityOverview.families.map(family => family.id),
		['charts', 'smartart', 'tables', 'wordart-text3d', 'shapes-gradients', 'layouts-themes-masters', 'media-images-avatar', 'model3d', 'equations', 'structural', 'motion-transitions-morph'],
	)
	const layoutFamily = data.capabilityOverview.families.find(family => family.id === 'layouts-themes-masters')
	assert.doesNotMatch(JSON.stringify(layoutFamily), /engine solves placement|semantic layout intent/i)
	assert.match(JSON.stringify(layoutFamily), /AI-authored|authored geometry/i)
	assert.deepEqual(
		data.capabilityOverview.extendedLayers.map(layer => layer.id),
		['typography', 'shapes-effects', 'structured-visuals', 'data-and-math', 'images-media-3d', 'authoring-delivery', 'composability'],
	)
	assert.ok(data.motion?.objectAnimations)
	assert.ok(data.motion?.transitionsMorph)
	assert.ok(data.motion?.native3dMotion)
	assert.ok(data.motion?.presenterCatalog)
	assert.ok(data.motion?.continuousPerformance)
	assert.ok(data.motion?.interactions)
	assert.ok(data.motion?.timing)
	assert.ok(data.narration?.stages?.length >= 7)
	assert.match(data.narration?.captionScope || '', /segments\[\]\.closedCaptionTracks/)
	assert.match(data.narration?.captionScope || '', /clip/)
	assert.equal(data.capabilityOverview.contentRepresentation?.discriminator, 'slides[].content[].kind')
	assert.equal(data.capabilityOverview.contentRepresentation?.aliases?.chart, 'chart-panel')
	assert.equal(data.capabilityOverview.contentRepresentation?.aliases?.table, 'table-panel')
	assert.equal(data.capabilityOverview.contentRepresentation?.aliases?.smartart, 'smartart')
	assert.equal(data.capabilityOverview.contentRepresentation?.expectations?.['chart-panel']?.expected, 'native-chart')
	assert.equal(data.capabilityOverview.contentRepresentation?.expectations?.['table-panel']?.expected, 'native-table')
	assert.equal(data.capabilityOverview.contentRepresentation?.expectations?.smartart?.expected, 'native-smartart')
	assert.equal(data.capabilityOverview.contentRepresentation?.policy?.nativeMismatch, 'block-unless-explicit-fallback-is-authorized')
	assert.ok(data.narration?.readinessDimensions?.some(row => row.dimension === 'catalog'))
	assert.ok(data.narration?.readinessDimensions?.some(row => row.dimension === 'synthesis-runtime'))
	assert.ok(data.narration?.readinessDimensions?.some(row => row.dimension === 'environment-mode'))
	assert.ok(data.narration?.readinessDimensions?.some(row => row.dimension === 'production-approval'))
	assert.match(data.narration.captionPolicy, /separate/i)
	assert.match(data.narration.captionPolicy, /visible subtitle overlay/i)
	assert.ok(data.nextCalls.some(call => call.tool === 'betterpptx.authoring.catalog'))
	assert.ok(data.nextCalls.some(call => call.tool === 'betterpptx.help.tool_recipe'))
	assert.equal(data.capabilityDiscovery.inventory.connectorObservedToolCount, null)
	assert.equal(data.capabilityDiscovery.visibility.connectorObserved, 'unknown-until-tools-list')
	assert.equal(typeof data.capabilityDiscovery.capabilityContentDigest, 'string')
	for (const family of data.capabilityOverview.families) {
		for (const tool of family.publicTools) assert.ok(publicToolNames.has(tool), `${family.id} exposes a non-served tool: ${tool}`)
	}
	for (const call of data.nextCalls) {
		assert.ok(publicToolNames.has(call.tool), `next call is not served: ${call.tool}`)
		validateInput(call.tool, call.request)
	}
	for (const family of publicAuthoringCapabilityCatalog().capabilities) {
		for (const example of family.examples || []) {
			assert.ok(publicToolNames.has(example.tool), `${family.id} example is not public: ${example.tool}`)
			validateInput(example.tool, example.request)
		}
	}
	const serialized = JSON.stringify(data)
	assert.doesNotMatch(serialized, /[A-Za-z]:\\|node_modules|sourcePath|serverPath|PptxGenJS/i)
	validateOutput('betterpptx.help.capabilities', result)
})

test('captioned multi-clip intent receives a schema-valid focused public path', async () => {
	const data = dataOf(await dispatcher.call('betterpptx.help.capabilities', {
		detail: 'summary',
		intent: '9:16 narrated autoplay with three separate WebVTT caption clips',
	}), 'caption help')
	assert.ok(data.intentInterpretation.matchedIntents.includes('narrated-captions'))
	assert.match(data.narration.captionScope, /segments\[\]\.closedCaptionTracks/)
	for (const call of data.nextCalls.filter(call => /caption|WebVTT/i.test(call.why))) {
		validateInput(call.tool, call.request)
		const result = dataOf(await dispatcher.call(call.tool, call.request), call.tool)
		assert.ok(result)
	}
	const caption = dataOf(await dispatcher.call('betterpptx.authoring.catalog', { view: 'controls', controlId: 'mediaPlayback.closedCaptionTracks' }), 'caption control')
	assert.equal(caption.controls?.[0]?.family, 'media-images-avatar')
})

test('original editable premium briefs remain new and broad exploration does not mandate media', async () => {
	const original = dataOf(await dispatcher.call('betterpptx.help.capabilities', {
		intent: 'Create an original fully evolved premium deck with native-editable shapes and explore all capabilities; no narration or presenter.',
		detail: 'summary',
	}))
	assert.equal(original.deckType, 'new')
	assert.equal(original.requestProfile.qualityProfile, 'modern')
	assert.ok(!original.requestProfile.requestedFeatures.includes('narration'))
	assert.ok(!original.requestProfile.requestedFeatures.includes('model3d'))
	assert.ok(!original.requestProfile.requestedFeatures.includes('tables'))
	assert.equal(original.creativeExploration.status, 'optional-teaching-candidates-not-selected')
	for (const contrast of original.creativeExploration.contrasts) {
		assert.ok(contrast.lessonIds.length >= 2)
		for (const lessonId of contrast.lessonIds) {
			const request = { view: 'lesson', lessonId }
			validateInput('betterpptx.authoring.catalog', request)
			const lesson = dataOf(await dispatcher.call('betterpptx.authoring.catalog', request), `lesson ${lessonId}`)
			assert.equal(lesson.id, lessonId, `missing contrast lesson ${lessonId}`)
		}
	}
	assert.ok(responseBytes(original) <= original.responseBudget.configured.maxBytes)
	assert.equal(original.responseBudget.measuredBytes, responseBytes(original))
	validateOutput('betterpptx.help.capabilities', { ok: true, data: original })
	const existing = dataOf(await dispatcher.call('betterpptx.help.capabilities', {
		intent: 'Revise my existing deck with more purposeful native motion.',
		detail: 'summary',
	}))
	assert.equal(existing.deckType, 'uploaded')
})

test('excluded identity media does not request media, while later still-image intent does', async () => {
	const excluded = dataOf(await dispatcher.call('betterpptx.help.capabilities', {
		intent: 'Create a premium product story. No presenter, narration, identity media or paid assets.',
		detail: 'summary',
	}))
	assert.ok(!excluded.requestProfile.requestedFeatures.includes('media'))
	assert.ok(!excluded.requestProfile.requestedFeatures.includes('narration'))
	const withImages = dataOf(await dispatcher.call('betterpptx.help.capabilities', {
		intent: 'No identity media. Use still images to clarify the product mechanism.',
		detail: 'summary',
	}))
	assert.ok(withImages.requestProfile.requestedFeatures.includes('media'))
	assert.ok(withImages.intentInterpretation.lessonIds.includes('picture-treatment'))
	const minimal = dataOf(await dispatcher.call('betterpptx.help.capabilities', {
		intent: 'Make a restrained executive briefing. No 3D or animation.',
		detail: 'summary',
	}))
	assert.deepEqual(minimal.creativeExploration.contrasts, [])
})

test('structured visual recipes expose executable native examples', async () => {
	for (const surface of ['chart', 'table', 'smartart', 'diagram']) {
		const result = await dispatcher.call('betterpptx.help.tool_recipe', { surface, detail: 'full' })
		const data = dataOf(result, `${surface} recipe`)
		assert.equal(data.detail, 'full')
		assert.equal(data.recipes.length, 1)
		assert.deepEqual(data.unknownSurfaces, [])
		const recipe = data.recipes[0]
		const example = recipe.sequence.find(step => step.type === 'executable-validation-example')
		assert.ok(example, `${surface} recipe must include a complete executable validation example`)
		validateInput(example.tool, example.request)
		const compiled = dataOf(await dispatcher.call(example.tool, example.request), `${surface} executable example`)
		assert.equal(compiled.phase, 'dryRun')
		assert.deepEqual(compiled.errors, [])
		const representations = (compiled.slides || []).flatMap(slide => slide.objects || []).map(object => object.contentRepresentation?.plannedRepresentation).filter(Boolean)
		const expected = surface === 'chart' ? 'native-chart' : surface === 'table' ? 'native-table' : 'native-smartart'
		assert.ok(representations.includes(expected), `${surface} example did not compile to ${expected}`)
	}
})

test('progressive-discovery examples and narration detail use the served schemas', async () => {
	const featureResult = await dispatcher.call('betterpptx.help.capabilities', {
		intent: 'diagram equation 3d narrated motion',
		detail: 'summary',
	})
	const featureData = dataOf(featureResult, 'feature help.capabilities')
	for (const row of featureData.progressiveDiscovery) validateInput(row.tool, row.request)
	for (const tool of featureData.requiredTools || []) assert.ok(publicToolNames.has(tool), `required tool is not served: ${tool}`)
	for (const tool of featureData.optionalTools || []) assert.ok(publicToolNames.has(tool), `optional tool is not served: ${tool}`)

	const recipeResult = await dispatcher.call('betterpptx.help.tool_recipe', { surface: 'narration', detail: 'summary' })
	const fullRecipeResult = await dispatcher.call('betterpptx.help.tool_recipe', { surface: 'narration', detail: 'full' })
	const recipe = dataOf(recipeResult, 'narration recipe')
	const fullRecipe = dataOf(fullRecipeResult, 'full narration recipe')
	assert.equal(recipe.detail, 'summary')
	assert.equal(fullRecipe.detail, 'full')
	assert.ok(fullRecipe.recipes[0].narrationContract)
	assert.ok(fullRecipe.recipes[0].readinessChecks.length >= 5)
	assert.ok(fullRecipe.recipes[0].authoringFields.timing.includes('atMs/endMs'))
	assert.ok(fullRecipe.recipes[0].authoringFields.captions.some(value => /no (?:automatic )?visible (?:subtitle )?overlay/i.test(value)))
	assert.ok(responseBytes(fullRecipe) > responseBytes(recipe))
	// Synthesis is a first-class, explicitly discoverable stage. The recipe must
	// describe it as a template/preparation call, not hide it behind terminology
	// the caller would already need to know.
	assert.match(JSON.stringify(fullRecipe), /betterpptx\.narration\.synthesize/i)
	validateOutput('betterpptx.help.tool_recipe', recipeResult)
	validateOutput('betterpptx.help.tool_recipe', fullRecipeResult)

	const voices = publicToolByName.get('betterpptx.narration.voices')
	assert.equal(voices.inputSchema.properties.language.type, 'string')
	assert.equal(voices.inputSchema.properties.lang.type, 'string')
	const voicesResult = await dispatcher.call('betterpptx.narration.voices', { language: 'en-US' })
	const voicesData = dataOf(voicesResult, 'narration voices')
	assert.equal(voicesData.readiness.voiceCatalog.available, true)
	assert.equal(voicesData.filter.language, 'en_us')
	assert.equal(typeof voicesData.catalogAvailable, 'boolean')
	assert.equal(typeof voicesData.synthesisRuntimeAvailable, 'boolean')
	assert.equal(typeof voicesData.mode, 'string')
	assert.equal(typeof voicesData.productionReady, 'boolean')
	validateOutput('betterpptx.narration.voices', voicesResult)
	const invalidVoiceResult = await dispatcher.call('betterpptx.narration.voices', { gender: 'unsupported' })
	const invalidVoiceData = dataOf(invalidVoiceResult, 'invalid narration readiness')
	assert.equal(invalidVoiceData.catalogAvailable, false)
	assert.equal(invalidVoiceData.failure.scope, 'voice-catalog')
	assert.equal(invalidVoiceData.failure.retryable, true)

	const upload = publicToolByName.get('betterpptx.assets.upload')
	assert.ok(upload.inputSchema.properties.kind.enum.includes('jsonSpec'))
	const validateUpload = ajv.compile(upload.inputSchema)
	assert.equal(validateUpload({ kind: 'jsonSpec', file: 'connector-file-reference' }), true, JSON.stringify(validateUpload.errors))
	for (const tool of publicTools) assert.doesNotThrow(() => ajv.compile(tool.inputSchema), tool.name)
})

test('MCP discovery and tools/list publish matching public version and schema digests', async () => {
	const meta = {
		'io.modelcontextprotocol/protocolVersion': MCP_V2_PROTOCOL_VERSION,
		'io.modelcontextprotocol/clientInfo': { name: 'public-capability-discovery-test', version: '1' },
		'io.modelcontextprotocol/clientCapabilities': {},
	}
	const req = { headers: { 'mcp-protocol-version': MCP_V2_PROTOCOL_VERSION } }
	const discovered = await dispatchMcpV2Message({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta } }, { req })
	const listed = await dispatchMcpV2Message({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: meta } }, { req })
	assert.equal(discovered.rpc.result.resultType, 'complete')
	assert.equal(listed.rpc.result.resultType, 'complete')
	assert.equal(discovered.rpc.result.publicDiscovery.advertisedToolSchemaDigest, listed.rpc.result.publicDiscovery.advertisedToolSchemaDigest)
	assert.equal(listed.rpc.result.tools.length, publicTools.length)
	const servedHelp = listed.rpc.result.tools.find(tool => tool.name === 'betterpptx.help.capabilities')
	assert.deepEqual(servedHelp.inputSchema, publicToolByName.get('betterpptx.help.capabilities').inputSchema)
	assert.deepEqual(servedHelp.outputSchema, publicToolByName.get('betterpptx.help.capabilities').outputSchema)
	assert.equal(typeof discovered.rpc.result.publicDiscovery.capabilityContentDigestCoverage, 'string')
	assert.equal(discovered.rpc.result.publicDiscovery.capabilityContentDigestCoverage, PUBLIC_CAPABILITY_DIGEST_COVERAGE)
	assert.equal(discovered.rpc.result.publicDiscovery.advertisedToolSchemaDigestCoverage, PUBLIC_TOOL_SCHEMA_DIGEST_COVERAGE)
})

test('advertised tool digest covers schema content, not only names and property presence', () => {
	const baseline = publicCapabilityDigest(publicTools)
	const changed = publicTools.map(tool => tool.name === 'betterpptx.help.capabilities'
		? { ...tool, outputSchema: { ...tool.outputSchema, description: 'Schema-content regression probe.' } }
		: tool)
	assert.notEqual(publicCapabilityDigest(changed), baseline)
})

test('motion-source failure is localized and does not erase ordinary authoring catalog rows', () => {
	const motionCatalogFactory = () => {
		const error = new Error('optional motion source unavailable')
		error.code = 'AUTHORING_MOTION_SOURCE_INVALID'
		throw error
	}
	const shapes = publicBaselineCatalog({ family: 'shapes-gradients', query: 'gradient', limit: 5 }, { motionCatalogFactory })
	assert.ok(shapes.entries.length > 0)
	assert.ok(shapes.degradations?.some(row => row.code === 'AUTHORING_MOTION_SOURCE_INVALID'))
	assert.ok(shapes.degradations.every(row => row.scope === 'presenter-motion'))
	const motion = publicBaselineCatalog({ family: 'presenter-motion', limit: 5 }, { motionCatalogFactory })
	assert.equal(motion.entries.length, 0)
	assert.equal(motion.pagination.total, 0)
	assert.ok(motion.degradations?.some(row => row.scope === 'presenter-motion'))
})
