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

test('SmartArt catalog is a bounded unranked exact-id host command', async () => {
	const truth = classifyCatalogEntry({ sourceKind: 'public-tool', family: 'smartart', label: 'betterpptx.smartart.catalog' })
	assert.equal(truth.capabilityStatus, 'host-command-not-persistent-style')
	assert.equal(truth.capabilityMode, 'discrete')
	assert.deepEqual(truth.componentOwnership, ['publicOperation', 'smartartCatalog', 'exactIdValidation'])

	const tool = publicToolList(TOOLS).find(entry => entry.name === 'betterpptx.smartart.catalog')
	assert.ok(tool)
	assert.equal(tool.inputSchema.additionalProperties, false)
	assert.equal(tool.inputSchema.properties.limit.maximum, 8)
	assert.equal(tool.outputSchema.properties.data.additionalProperties, false)
	assert.ok(tool.outputSchema.properties.data.properties.selectedPlan)

	const dispatcher = createMcpToolDispatcher({
		__skipDurableOperationLedger: true,
		sessionId: `smartart-catalog-${Date.now()}`,
		clientInfo: { name: 'smartart-catalog-contract', version: '1' },
	})
	const page = dataOf(await dispatcher.call('betterpptx.smartart.catalog', { category: ' process ', query: 'process', limit: 4 }, { __skipDurableOperationLedger: true }))
	assert.equal(page.contractVersion, 'betterpptx.unranked-smartart-catalog.v1')
	assert.equal(page.unranked, true)
	assert.equal(page.selectionAuthority, 'ai')
	assert.equal(page.catalogOrder, 'id-ascending')
	assert.equal(page.category, 'process')
	assert.equal(page.pagination.limit, 4)
	assert.equal(page.layouts.length, 4)
	for (let index = 1; index < page.layouts.length; index += 1) assert.ok(page.layouts[index - 1].id.localeCompare(page.layouts[index].id) <= 0)
	assert.equal(page.layouts.some(item => item.galleryApplicability), false)
	assert.ok(JSON.stringify(page).length < 30000)

	const imagePage = dataOf(await dispatcher.call('betterpptx.smartart.catalog', { needsImages: true, limit: 2, includeLayouts: false }, { __skipDurableOperationLedger: true }))
	assert.equal(imagePage.layouts, null)
	assert.equal(imagePage.pagination.returned, 2)
	assert.equal(imagePage.categories.includes('picture'), true)

	const exact = dataOf(await dispatcher.call('betterpptx.smartart.catalog', {
		layoutId: 'urn:microsoft.com/office/officeart/2008/layout/RadialCluster',
		quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1',
		colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2',
		limit: 1,
	}, { __skipDurableOperationLedger: true }))
	assert.equal(exact.selectedPlan.layoutId, 'urn:microsoft.com/office/officeart/2008/layout/RadialCluster')
	assert.equal(exact.selectedPlan.quickStyleId, 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1')
	assert.equal(exact.selectedPlan.colorStyleId, 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2')
	assert.equal(exact.selectedPlan.layout.id, exact.selectedPlan.layoutId)
	assert.ok(exact.selectedPlan.applicability.quickStyleIds.includes(exact.selectedPlan.quickStyleId))

	for (const args of [{ mystery: 1 }, { limit: 0 }, { limit: 1.2 }, { offset: 'abc' }, { needsImages: 'true' }, { supportStatus: 'shape-fallback' }]) {
		const invalid = await dispatcher.call('betterpptx.smartart.catalog', args, { __skipDurableOperationLedger: true })
		assert.equal(invalid?.error?.code, 'TOOL_ERROR')
	}
	const missing = await dispatcher.call('betterpptx.smartart.catalog', { layoutId: 'opaque://missing-smartart-layout' }, { __skipDurableOperationLedger: true })
	assert.equal(missing?.error?.code, 'TOOL_ERROR')
	assert.match(String(missing?.error?.message || ''), /SmartArt layout not found/)

	const serialized = JSON.stringify(page)
	assert.equal(/(?:[A-Za-z]:\\|node_modules|engine\.mjs|ppt\/diagrams|file-system|filesystem|sourceXmlPath|packagePath|providerExecution)/i.test(serialized), false)
})

