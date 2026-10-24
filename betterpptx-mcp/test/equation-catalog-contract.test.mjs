import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { classifyCatalogEntry } = await import('../capability-truth.mjs')
const { publicToolList } = await import('../blackbox.mjs')
const { TOOLS } = await import('../tools.mjs')

const dataOf = result => {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

test('equation catalog is an unranked exact-id host command with a closed public schema', async () => {
	const truth = classifyCatalogEntry({ sourceKind: 'public-tool', family: 'equations', label: 'betterpptx.equation.catalog' })
	assert.equal(truth.capabilityStatus, 'host-command-not-persistent-style')
	assert.equal(truth.capabilityMode, 'discrete')
	assert.deepEqual(truth.componentOwnership, ['publicOperation', 'equationCatalog', 'exactIdValidation'])

	const tool = publicToolList(TOOLS, { fullSchemas: true }).find(entry => entry.name === 'betterpptx.equation.catalog')
	assert.ok(tool)
	assert.equal(tool.inputSchema.additionalProperties, false)
	assert.deepEqual(tool.inputSchema.properties.format.enum, ['summary', 'full'])
	assert.equal(tool.outputSchema.properties.data.additionalProperties, false)
	assert.ok(tool.outputSchema.properties.data.properties.presets)

	const dispatcher = createMcpToolDispatcher({
		__skipDurableOperationLedger: true,
		sessionId: `equation-catalog-${Date.now()}`,
		clientInfo: { name: 'equation-catalog-contract', version: '1' },
	})
	const result = dataOf(await dispatcher.call('betterpptx.equation.catalog', { query: 'matrix', templateKind: 'matrix', limit: 2, format: 'full' }, { __skipDurableOperationLedger: true }))
	assert.equal(result.contractVersion, 'betterpptx.unranked-equation-catalog.v1')
	assert.equal(result.unranked, true)
	assert.equal(result.selectionAuthority, 'ai')
	assert.equal(result.catalogOrder, 'id-ascending')
	assert.deepEqual(result.sourceFormats, ['plain', 'unicodeMath', 'omml', 'template'])
	assert.ok(result.pagination.returned >= 1)
	assert.ok(result.presets.every(preset => preset.sourceFormat === 'template' && preset.source.kind === 'matrix'))
	assert.equal(result.selectedPreset, null)
	assert.equal(result.selectionManifestContract.capability, 'equation')

	const page = dataOf(await dispatcher.call('betterpptx.equation.catalog', { limit: 8 }))
	assert.equal(page.presets.length, 8)
	for (let index = 1; index < page.presets.length; index += 1) {
		assert.ok(page.presets[index - 1].id.localeCompare(page.presets[index].id) <= 0)
	}
	const exact = dataOf(await dispatcher.call('betterpptx.equation.catalog', { equationGalleryPresetId: page.presets[0].id, format: 'full' }))
	assert.equal(exact.presets.length, 1)
	assert.equal(exact.presets[0].id, page.presets[0].id)

	const invalid = await dispatcher.call('betterpptx.equation.catalog', { equationGalleryPresetId: 'opaque://missing-equation-preset' })
	assert.equal(invalid?.error?.code, 'TOOL_ERROR')
	assert.match(String(invalid?.error?.message || ''), /Equation gallery preset not found/)

	const serialized = JSON.stringify(result)
	assert.equal(/(?:[A-Za-z]:\\|node_modules|engine\.mjs|ppt\/diagrams|file-system|filesystem|sourceXmlPath|packagePath|providerExecution)/i.test(serialized), false)
})
