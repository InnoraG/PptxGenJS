import test from 'node:test'
import assert from 'node:assert/strict'

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

test('table.recommend is an unranked exact-id catalog command', async () => {
	const truth = classifyCatalogEntry({ sourceKind: 'public-tool', family: 'tables', label: 'betterpptx.table.recommend' })
	assert.equal(truth.capabilityStatus, 'host-command-not-persistent-style')
	assert.equal(truth.capabilityMode, 'discrete')
	assert.deepEqual(truth.componentOwnership, ['publicOperation', 'tableCatalog', 'exactIdValidation'])

	const tool = publicToolList(TOOLS).find(entry => entry.name === 'betterpptx.table.recommend')
	assert.ok(tool)
	assert.ok(tool.inputSchema.properties.tablePresetId)
	assert.deepEqual(tool.inputSchema.properties.format.enum, ['summary', 'full'])

	const dispatcher = createMcpToolDispatcher({
		__skipDurableOperationLedger: true,
		sessionId: `table-recommend-${Date.now()}`,
		clientInfo: { name: 'table-recommend-contract', version: '1' },
	})
	const result = dataOf(await dispatcher.call('betterpptx.table.recommend', { query: 'risk', limit: 5, format: 'full', includeNativeStyles: true, nativeStyleLimit: 3 }, { __skipDurableOperationLedger: true }))
	assert.equal(result.contractVersion, 'betterpptx.unranked-table-catalog.v1')
	assert.equal(result.unranked, true)
	assert.equal(result.selectionAuthority, 'ai')
	assert.equal(result.catalogOrder, 'id-ascending')
	assert.ok(Array.isArray(result.presets) && result.presets.length > 0)
	assert.ok(Array.isArray(result.nativeStyles) && result.nativeStyles.length <= 3)
	for (let index = 1; index < result.presets.length; index += 1) {
		assert.ok(result.presets[index - 1].id.localeCompare(result.presets[index].id) <= 0)
	}
	assert.equal(result.selectionManifestContract.capability, 'table')
	assert.equal(result.selectedPlan, null)

	const selected = result.presets[0]
	const exact = dataOf(await dispatcher.call('betterpptx.table.recommend', { tablePresetId: selected.id, limit: 1 }))
	assert.equal(exact.presets.length, 1)
	assert.equal(exact.presets[0].id, selected.id)
	assert.deepEqual(exact.selectedPlan, { tablePresetId: selected.id })

	const invalid = await dispatcher.call('betterpptx.table.recommend', { tablePresetId: 'opaque://missing-table-preset', limit: 1 })
	assert.equal(invalid?.error?.code, 'TOOL_ERROR')
	assert.match(String(invalid?.error?.message || ''), /Table preset not found/)

	const serialized = JSON.stringify(result)
	assert.equal(/(?:[A-Za-z]:\\|node_modules|engine\.mjs|ppt\/diagrams|file-system|filesystem|sourceXmlPath|packagePath|providerExecution)/i.test(serialized), false)
})
