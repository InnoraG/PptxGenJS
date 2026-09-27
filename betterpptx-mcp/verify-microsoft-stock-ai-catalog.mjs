import assert from 'node:assert/strict'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_ASSETS_ROOT ||= process.cwd()

const { callBetterPptxTool } = await import('./engine.mjs')

async function catalog(query, extra = {}) {
	const result = await callBetterPptxTool('betterpptx.assets.catalog', {
		kind: 'model3d',
		query,
		sizePolicy: 'large-ok',
		maxResults: 8,
		...extra,
	})
	assert.equal(result.ok, true, `catalog call failed for ${query}`)
	assert.ok(result.data?.assets?.length > 0, `expected assets for ${query}`)
	assert.ok(result.data.catalogGuide, `expected catalog guide for ${query}`)
	assert.ok(result.data.queryExpansion, `expected query expansion for ${query}`)
	assert.ok(!JSON.stringify(result.data).match(/[A-Z]:\\|\/home\/|\/tmp\/|process\.cwd|engine\.mjs/i), `public result leaked an implementation path for ${query}`)
	return result.data
}

function assertMicrosoftStock(data, label) {
	assert.ok(
		data.assets.some(asset => String(asset.handle || '').startsWith('model3d://microsoft-stock/')),
		`expected at least one Microsoft Stock result for ${label}`,
	)
}

function assertIntent(data, id, label) {
	const matched = data.queryExpansion?.matchedIntents || []
	const entryCollections = data.assets.flatMap(asset => asset.ai?.collections || [])
	assert.ok(
		matched.some(item => item.id === id) || entryCollections.some(item => item.id === id),
		`expected intent ${id} for ${label}`,
	)
}

const strategy = await catalog('executive growth strategy', { useCase: 'board slide hero' })
assertMicrosoftStock(strategy, 'strategy')
assertIntent(strategy, 'strategy', 'strategy')
assert.ok(strategy.assets[0].ai?.bestFor?.length, 'top strategy result should explain best use')

const security = await catalog('cybersecurity risk and trust')
assertMicrosoftStock(security, 'security')
assertIntent(security, 'risk-security', 'security')

const medical = await catalog('medical innovation for patient care')
assertMicrosoftStock(medical, 'medical')
assertIntent(medical, 'health-science', 'medical')

const blank = await catalog('', { intent: 'growth', useCase: 'launch milestone' })
assertMicrosoftStock(blank, 'intent-only growth')
assertIntent(blank, 'growth', 'intent-only growth')
assert.ok(blank.catalogGuide.suggestedQueries?.length > 0, 'catalog guide should include suggested queries')

console.log(JSON.stringify({
	ok: true,
	checked: ['strategy', 'risk-security', 'health-science', 'intent-only-growth'],
	topHandles: {
		strategy: strategy.assets[0].handle,
		security: security.assets[0].handle,
		medical: medical.assets[0].handle,
		growth: blank.assets[0].handle,
	},
}, null, 2))
