import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { classifyCatalogEntry } = await import('../capability-truth.mjs')

test('chart.recommend is an unranked exact-id catalog command', async () => {
	const truth = classifyCatalogEntry({ sourceKind: 'public-tool', family: 'charts', label: 'betterpptx.chart.recommend' })
	assert.equal(truth.capabilityStatus, 'host-command-not-persistent-style')
	assert.equal(truth.capabilityMode, 'discrete')
	const mcp = createMcpToolDispatcher({ sessionId: `chart-recommend-${Date.now()}`, clientInfo: { name: 'chart-recommend-unit', version: '1' }, blackBox: false })
	const rawResult = await mcp.call('betterpptx.chart.recommend', { query: 'trend', chartType: 'line', limit: 5, format: 'full' })
	const result = rawResult?.data || rawResult
	assert.ok(result && !result.error, JSON.stringify(rawResult))
	assert.equal(result.unranked, true)
	assert.equal(result.selectionAuthority, 'ai')
	assert.equal(result.catalogOrder, 'id-ascending')
	assert.ok(Array.isArray(result.presets))
	for (let i = 1; i < result.presets.length; i += 1) assert.ok(result.presets[i - 1].id.localeCompare(result.presets[i].id) <= 0)
	const selected = result.presets[0]
	if (selected) {
		const exactRaw = await mcp.call('betterpptx.chart.recommend', { chartPresetId: selected.id, limit: 1 })
		const exact = exactRaw?.data || exactRaw
		assert.ok(exact && !exact.error, JSON.stringify(exactRaw))
		assert.equal(exact.presets[0]?.id, selected.id)
	}
	const invalid = await mcp.call('betterpptx.chart.recommend', { chartPresetId: 'opaque://missing-chart-preset', limit: 1 })
	assert.equal(invalid?.error?.code, 'TOOL_ERROR')
	assert.match(String(invalid?.error?.message || ''), /Chart preset not found/)
	const text = JSON.stringify(result)
	assert.equal(/(?:D:\\\\|[A-Za-z]:\\|node_modules|engine\.mjs|ppt\/diagrams|file-system|filesystem)/i.test(text), false)
})
