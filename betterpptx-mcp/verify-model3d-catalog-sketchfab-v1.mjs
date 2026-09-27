process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'

const [{ callBetterPptxTool }, { TOOLS }] = await Promise.all([
	import('./engine.mjs'),
	import('./tools.mjs'),
])

function assert(condition, message, details = {}) {
	if (condition) return
	const err = new Error(message)
	err.details = details
	throw err
}

const tool = TOOLS.find(item => item.name === 'betterpptx.assets.generate_model3d')
assert(tool, 'generate_model3d tool is missing')

const schemaText = JSON.stringify(tool)
const forbiddenSchema = ['outputDir', 'procedural', 'Primary hex color', 'generated model assets']
const schemaHits = forbiddenSchema.filter(text => schemaText.includes(text))
assert(schemaHits.length === 0, 'generate_model3d schema still advertises removed procedural/local controls', { schemaHits })

const airplane = await callBetterPptxTool('betterpptx.assets.generate_model3d', {
	context: 'aviation history deck: early airplane aircraft flight object',
	kind: 'auto',
	sizePolicy: 'unrestricted',
	assetSource: 'catalog',
}, { sessionId: 'verify-model3d-catalog-sketchfab-v1' })

assert(airplane.ok, 'catalog airplane tool call failed', airplane)
assert(airplane.data?.selection?.mode === 'catalog-selected', 'aviation prompt should select a catalog model', airplane.data)
assert(airplane.data?.kind === 'aircraft', 'aviation prompt should infer aircraft kind', airplane.data)
assert(!!airplane.data?.suggestedModel3DOptions?.modelAsset, 'catalog model should return public modelAsset options', airplane.data)
assert(!String(airplane.data?.modelAsset || '').startsWith('asset://generated/'), 'catalog selection must not return generated asset handles', airplane.data)

const noMatch = await callBetterPptxTool('betterpptx.assets.generate_model3d', {
	context: 'nonexistent zzzqxx crystalline mammoth-timepiece object',
	query: 'zzzqxx mammoth-timepiece no-match',
	assetSource: 'catalog',
	sizePolicy: 'compact',
}, { sessionId: 'verify-model3d-catalog-sketchfab-v1' })

assert(noMatch.ok, 'catalog no-match tool call failed', noMatch)
assert(noMatch.data?.status === 'no-suitable-model', 'catalog-only no-match should not accept a weak catalog candidate', noMatch.data)
assert(JSON.stringify(noMatch.data || {}).includes('Synthetic model fallback is disabled'), 'no-match response should state the fallback policy', noMatch.data)
assert(!JSON.stringify(noMatch.data || {}).includes('asset://generated/'), 'no-match must not return generated asset handles', noMatch.data)

const autoFallback = await callBetterPptxTool('betterpptx.assets.generate_model3d', {
	context: 'rare zzzqxx museum object no catalog fit',
	query: 'zzzqxx rare museum object',
	assetSource: 'auto',
	sizePolicy: 'compact',
	searchLimit: 1,
	timeoutMs: 5000,
	downloadTimeoutMs: 5000,
}, { sessionId: 'verify-model3d-catalog-sketchfab-v1' })

const attempts = autoFallback.data?.attempts || []
assert(autoFallback.ok, 'auto fallback tool call failed', autoFallback)
assert(
	autoFallback.data?.selection?.mode === 'sketchfab-imported' || attempts.some(item => item.source === 'betterpptx.sketchfab.import'),
	'auto mode should attempt Sketchfab import after catalog rejection',
	autoFallback.data
)
assert(!JSON.stringify(autoFallback.data || {}).includes('asset://generated/'), 'auto fallback must not return generated asset handles', autoFallback.data)

console.log(JSON.stringify({
	ok: true,
	schemaHits,
	catalogSelection: {
		kind: airplane.data.kind,
		title: airplane.data.selection?.selected?.title,
		handle: airplane.data.modelAsset,
	},
	noMatch: {
		status: noMatch.data.status,
		code: noMatch.data.code,
	},
	autoFallback: {
		status: autoFallback.data?.status,
		mode: autoFallback.data?.selection?.mode,
		attempts: attempts.map(item => ({ source: item.source, status: item.status, code: item.code })),
	},
}, null, 2))
