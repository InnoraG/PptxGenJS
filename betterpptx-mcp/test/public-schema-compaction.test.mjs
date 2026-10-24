import assert from 'node:assert/strict'
import test from 'node:test'

for (const name of Object.keys(process.env)) {
	if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
}
Object.assign(process.env, {
	BETTERPPTX_ENV: 'production',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_AUTH: 'oauth',
	BETTERPPTX_BILLING_PROVIDER: 'none',
	BETTERPPTX_BILLING_MODEL: 'free_publication',
	BETTERPPTX_MONETIZED_MCP_ENABLED: '0',
	BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering',
})

const { advertisedPublicTools } = await import('../public-manifest.mjs')
const { callBetterPptxTool } = await import('../engine.mjs')

const bytes = value => Buffer.byteLength(JSON.stringify(value))

test('tools/list stays within the connector context budget', () => {
	const compact = advertisedPublicTools()
	const full = advertisedPublicTools({ fullSchemas: true })
	assert.equal(compact.length, full.length)
	// Measured 2026-10-23: 558 KB full, ~122 KB compact (extended features expanded). Fail on regressions that
	// would push the advertised surface back toward the uncompacted size.
	assert.ok(bytes(compact) < 135_000, `tools/list is ${bytes(compact)} bytes`)
	for (const tool of compact) {
		// generate_from_spec deliberately carries the extended-capability schemas.
		const limit = tool.name === 'betterpptx.deck.generate_from_spec' ? 34_000 : 12_000
		assert.ok(bytes(tool) < limit, `${tool.name} advertises ${bytes(tool)} bytes`)
		assert.ok(tool.annotations?.title, `${tool.name} needs an annotation title`)
		assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', `${tool.name} needs readOnlyHint`)
		assert.equal(typeof tool.annotations?.destructiveHint, 'boolean', `${tool.name} needs destructiveHint`)
	}
})

test('compaction keeps the top-level contract and leaves validation-relevant facts intact', () => {
	const byName = new Map(advertisedPublicTools().map(tool => [tool.name, tool]))
	const fullByName = new Map(advertisedPublicTools({ fullSchemas: true }).map(tool => [tool.name, tool]))
	const generate = byName.get('betterpptx.deck.generate_from_spec').inputSchema
	assert.deepEqual(Object.keys(generate.properties).sort(), Object.keys(fullByName.get('betterpptx.deck.generate_from_spec').inputSchema.properties).sort())
	assert.ok(generate.anyOf.some(branch => branch.required?.includes('specHandle')))
	assert.deepEqual(generate.properties.phase.enum, ['dryRun', 'resolve', 'lockedDryRun', 'commit'])
	assert.equal(generate.properties.spec.properties.slides.type, 'array')
	const content = generate.properties.spec.properties.slides.items.properties.content.items.properties
	assert.equal(content.text.description, undefined, 'common slide basics stay summarized')
	assert.equal(content.children.items, undefined, 'common slide basics stay summarized')
	assert.match(content.kind.description, /animated-table/, 'every native object kind is advertised')
	assert.deepEqual(content.reveal.properties.by.enum, ['row', 'column', 'cell'], 'animated-table reveal is advertised in depth')
	assert.ok(generate.properties.spec.properties.presenter.properties, 'the native 3-D presenter is advertised in depth')
	assert.ok(generate.properties.spec.properties.slides.items.properties.presenterPerformance.oneOf?.some(branch => branch.properties), 'presenter performances are advertised in depth')
	assert.ok(generate.properties.spec.properties.slides.items.properties.interactions.items.properties.verb.enum.includes('point-at'), 'presenter interactions are advertised in depth')
	const description = byName.get('betterpptx.deck.generate_from_spec').description
	for (const feature of ['animated-table', 'narration.synthesize', 'avatar.render_job', '3-D presenter', 'surface animated-table']) {
		assert.ok(description.includes(feature), `generate_from_spec advertises ${feature}`)
	}
	assert.match(generate.description, /schemaFor/)
	for (const tool of byName.values()) {
		const full = fullByName.get(tool.name)
		assert.deepEqual(tool.inputSchema?.required, full.inputSchema?.required, `${tool.name} required arguments`)
		if (full.outputSchema?.required) assert.deepEqual(tool.outputSchema.required, full.outputSchema.required, `${tool.name} output envelope`)
	}
})

test('destructive tools are annotated for confirmation', () => {
	const byName = new Map(advertisedPublicTools().map(tool => [tool.name, tool]))
	assert.equal(byName.get('betterpptx.deck.dispose').annotations.destructiveHint, true)
	assert.equal(byName.get('betterpptx.deck.dispose').annotations.readOnlyHint, false)
	assert.equal(byName.get('betterpptx.deck.generate_from_spec').annotations.destructiveHint, false)
})

test('help.tool_recipe returns the exact public schema on demand', async () => {
	const root = await callBetterPptxTool('betterpptx.help.tool_recipe', { schemaFor: 'betterpptx.deck.generate_from_spec' })
	assert.equal(root.ok, true, JSON.stringify(root.error))
	assert.equal(root.data.surface, 'schema')
	assert.ok(root.data.toolSchema.childFields.includes('spec'))

	const slides = await callBetterPptxTool('betterpptx.help.tool_recipe', { schemaFor: 'betterpptx.deck.generate_from_spec', schemaPath: 'spec.slides' })
	assert.equal(slides.ok, true, JSON.stringify(slides.error))
	assert.equal(slides.data.toolSchema.schemaPath, 'spec.slides')
	assert.equal(slides.data.toolSchema.schema.type, 'array')
	assert.ok(slides.data.toolSchema.schema.items, 'the on-demand view expands slide items')
	assert.ok(slides.data.toolSchema.childFields.length > 0)

	const output = await callBetterPptxTool('betterpptx.help.tool_recipe', { schemaFor: 'betterpptx.deck.save', schemaKind: 'output', schemaPath: 'data' })
	assert.equal(output.ok, true, JSON.stringify(output.error))
	assert.ok(output.data.toolSchema.childFields.includes('downloadUrl'))

	const unknown = await callBetterPptxTool('betterpptx.help.tool_recipe', { schemaFor: 'betterpptx.deck.generate_from_spec', schemaPath: 'spec.nope' })
	assert.equal(unknown.ok, false)
	assert.equal(unknown.error.code, 'SCHEMA_PATH_UNKNOWN')
	assert.match(unknown.error.message, /slides/)
})
