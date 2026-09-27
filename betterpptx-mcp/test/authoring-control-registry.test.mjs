import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { publicControlRegistryMetadata } = await import('../authoring-control-registry.mjs')
const { dispatchMcpV2Message } = await import('../mcp-v2/handler.mjs')
const { MCP_V2_PROTOCOL_VERSION } = await import('../mcp-v2/protocol.mjs')

const dispatcher = createMcpToolDispatcher({ sessionId: 'authoring-control-registry-v1' })
const dataOf = result => result.data || result

test('ordinary-language discovery resolves premium polish and preserves explicit exclusions', async () => {
	const result = await dispatcher.call('betterpptx.authoring.catalog', { view: 'controls', intent: 'Premium polish, but do not use 3D.', limit: 3 })
	assert.equal(result.ok, true)
	const data = dataOf(result)
	assert.deepEqual(data.interpretation.exclusions.sort(), ['model3d', 'wordart-text3d'])
	assert.equal(data.interpretation.lessonIds.includes('dimensional-typography'), false)
	assert.equal(data.pagination.returned, 3)
	assert.ok(data.controls.every(control => control.inputContract && control.readiness && control.verificationEvidence))
	assert.equal(data.unfiltered.request.view, 'controls')
})

test('visual craft and story-beat requests surface native design, picture, transition, and motion lessons', async () => {
	const result = await dispatcher.call('betterpptx.authoring.catalog', { view: 'controls', intent: 'Create a premium visual design with picture framing, native gradients and shadows, purposeful slide transitions, and animated reveals.', limit: 12 })
	assert.equal(result.ok, true)
	const interpretation = dataOf(result).interpretation
	assert.ok(interpretation.lessonIds.includes('surface-craft'))
	assert.ok(interpretation.lessonIds.includes('picture-treatment'))
	assert.ok(interpretation.lessonIds.includes('transition-beat'))
	assert.ok(interpretation.lessonIds.includes('layered-motion'))
	assert.ok(interpretation.relevantFamilies.includes('shapes-gradients'))
	assert.ok(interpretation.relevantFamilies.includes('media-images-avatar'))
	assert.ok(interpretation.relevantFamilies.includes('motion-transitions-morph'))
	assert.equal(interpretation.rule.includes('does not select a treatment'), true)
	const silent = await dispatcher.call('betterpptx.authoring.catalog', { view: 'controls', intent: 'Premium gradients, shadows, and pictures. No animation or transitions.', limit: 12 })
	assert.equal(silent.ok, true)
	const silentInterpretation = dataOf(silent).interpretation
	assert.ok(silentInterpretation.lessonIds.includes('surface-craft'))
	assert.ok(silentInterpretation.lessonIds.includes('picture-treatment'))
	assert.equal(silentInterpretation.lessonIds.includes('transition-beat'), false)
	assert.equal(silentInterpretation.lessonIds.includes('layered-motion'), false)
})

test('niceties, layered-motion, Text3D, and animated-table recipe aliases resolve without a dead route', async () => {
	for (const surface of ['niceties', 'design niceties', 'layered-motion', 'more than fade', 'Text3D', 'dimensional headline', 'animated table', 'progressive-table']) {
		const result = await dispatcher.call('betterpptx.help.tool_recipe', { surface, detail: 'full' })
		assert.equal(result.ok, true, surface)
		const data = dataOf(result)
		assert.deepEqual(data.unknownSurfaces, [], surface)
		assert.equal(data.recipes.length, 1, surface)
	}
})

test('self-contained authoring lessons compile through the ordinary public spec route', async () => {
	for (const lessonId of ['surface-craft', 'dimensional-typography', 'layered-motion', 'transition-beat', 'custom-process', 'chart-emphasis', 'connected-object-identity', 'animated-table-synergy', 'restrained-flat']) {
		const lessonResult = await dispatcher.call('betterpptx.authoring.catalog', { view: 'lesson', lessonId })
		assert.equal(lessonResult.ok, true, lessonId)
		const lesson = dataOf(lessonResult)
		assert.equal(lesson.id, lessonId)
		const compileResult = await dispatcher.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', dryRun: true, commitMode: 'createNew', detail: 'summary', validateAfterCompile: true, validationMode: 'strict', spec: lesson.minimalSpec })
		assert.equal(compileResult.ok, true, `${lessonId}: ${JSON.stringify(compileResult.error || {})}`)
		assert.deepEqual(dataOf(compileResult).errors, [])
	}
})

test('control registry digest binds the teaching collection', () => {
	const metadata = publicControlRegistryMetadata()
	assert.equal(metadata.lessonCount, 10)
	assert.match(metadata.capabilityControlDigest, /^[a-f0-9]{64}$/)
})

test('required capability-use entries block compilation until selected', async () => {
	const lesson = dataOf(await dispatcher.call('betterpptx.authoring.catalog', { view: 'lesson', lessonId: 'restrained-flat' }))
	lesson.minimalSpec.capabilityUsePlan = {
		schemaVersion: 'betterpptx.capability-use-plan.v1',
		entries: [{ capabilityId: 'required-motion', family: 'motion-transitions-morph', status: 'not-examined', userRequired: true }],
	}
	const result = await dispatcher.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', dryRun: true, commitMode: 'createNew', detail: 'summary', spec: lesson.minimalSpec })
	assert.equal(result.ok, false)
	assert.match(JSON.stringify(result.error), /REQUIRED_CAPABILITY_NOT_SELECTED/)
})

test('MCP resources expose text and multimodal gallery paths without entering production rendering', async () => {
	const meta = { 'io.modelcontextprotocol/protocolVersion': MCP_V2_PROTOCOL_VERSION, 'io.modelcontextprotocol/clientInfo': { name: 'gallery-test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} }
	const req = { headers: { 'mcp-protocol-version': MCP_V2_PROTOCOL_VERSION } }
	const listed = await dispatchMcpV2Message({ jsonrpc: '2.0', id: 1, method: 'resources/list', params: { _meta: meta } }, { req })
	const resources = listed.rpc.result.resources
	assert.ok(resources.some(resource => resource.uri === 'betterpptx://gallery/index'))
	assert.ok(resources.some(resource => resource.uri === 'betterpptx://gallery/dimensional-typography/thumbnail' && resource.mimeType === 'image/png'))
	const source = await dispatchMcpV2Message({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'betterpptx://gallery/dimensional-typography/source', _meta: meta } }, { req })
	assert.match(source.rpc.result.contents[0].text, /betterpptx\.deck-spec\.v1/)
	const thumbnail = await dispatchMcpV2Message({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'betterpptx://gallery/dimensional-typography/thumbnail', _meta: meta } }, { req })
	assert.match(thumbnail.rpc.result.contents[0].blob, /^[A-Za-z0-9+/]+=*$/)
})
