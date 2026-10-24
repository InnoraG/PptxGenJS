import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_SESSION_DECKS_PER_HOUR = '20'

const { publicToolList } = await import('../blackbox.mjs')
const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')

const publicTools = publicToolList(TOOLS, { fullSchemas: true })
const toolByName = new Map(publicTools.map(tool => [tool.name, tool]))
const dispatcher = createMcpToolDispatcher({
	sessionId: `public-authoring-boundary-${Date.now()}`,
	clientInfo: { name: 'public-authoring-boundary-test', version: '1' },
})

const DIRECT_AUTHORING = /\b(?:betterpptx\.)?(?:deck\.new|slide\.(?:add|update|revise|delete|reorder|animate|set_transition)[a-z0-9_.]*|custom_geometry\.(?:insert|insert_svg))\b/i
const PRIVATE_SERVICE = /\b(?:meshy|mixamo|svgpath|baker|self-hosted|poc\/flow-test|sketchfab|pexels|pixabay|openverse|freesound|elevenlabs|polly|iconscout)\b/i
const INTERNAL_PROVENANCE = /\b(?:_synergyPlan|clipTimelines|playScene|engineRoute|compiledAs|nativePackage|nativeTiming|TO_SOURCE|PptxGenJS|node_modules|providerExecution|sourceXmlPath|packagePath)\b/i
const AUTHORED_COORDINATE_KEYS = new Set(['x', 'y', 'w', 'h', 'bbox', 'rect', 'points'])
const CUSTOM_GEOMETRY_PRIVATE_KEYS = new Set([
	'x', 'y', 'w', 'h', 'bbox', 'rect', 'points', 'defaultBox', 'objectSummary',
	'sourceName', 'sceneHandle', 'slideNumber', 'specimenIndex', 'insertTool', 'path', 'rel',
])

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

function collectKeys(value, path = '$', rows = []) {
	if (Array.isArray(value)) {
		value.forEach((child, index) => collectKeys(child, `${path}[${index}]`, rows))
		return rows
	}
	if (!value || typeof value !== 'object') return rows
	for (const [key, child] of Object.entries(value)) {
		rows.push({ key, path: `${path}.${key}` })
		collectKeys(child, `${path}.${key}`, rows)
	}
	return rows
}

function assertVocabularyClean(label, value) {
	const serialized = JSON.stringify(value)
	assert.doesNotMatch(serialized, DIRECT_AUTHORING, `${label} teaches a direct authoring route`)
	assert.doesNotMatch(serialized, PRIVATE_SERVICE, `${label} exposes a private service/provider name`)
	assert.doesNotMatch(serialized, INTERNAL_PROVENANCE, `${label} exposes internal provenance`)
}

test('public tool projection scopes exact coordinates to typed authoring routes and remains provider-neutral', () => {
	// Inventory size is not the contract: authorized connector projections may
	// legitimately expose fewer tools. Assert the important lifecycle tool
	// directly instead of freezing a stale total-count expectation.
	assert.ok(publicTools.length >= 51)
	assert.ok(toolByName.has('betterpptx.narration.get_voice_timing'))
	// Talking-head video, custom personas and stock 3D are compiled by the spec.
	assert.equal(toolByName.has('betterpptx.avatar.attach_result'), false)
	assert.equal(toolByName.has('betterpptx.assets.generate_model3d'), false)
	assert.equal(toolByName.has('betterpptx.custom_geometry.inspect'), false)
	assert.equal(toolByName.has('betterpptx.custom_geometry.from_svg'), false)
	assertVocabularyClean('public tool schemas', publicTools)

	const coordinateFields = []
	for (const tool of publicTools) {
		for (const row of collectKeys(tool.inputSchema)) {
			if (AUTHORED_COORDINATE_KEYS.has(row.key)) coordinateFields.push(`${tool.name}${row.path.slice(1)}`)
		}
	}
	// Source-pixel reconstruction and original slide-inch composition are both
	// typed public routes. Geometry may not leak into unrelated public tools.
	const visualReferenceCoordinates = coordinateFields.filter(path =>
		path.startsWith('betterpptx.deck.generate_from_spec.properties.spec.')
			&& /(?:pixelFrame|pixelPoints|pixelPaths)/.test(path))
	const exactAuthorCoordinates = coordinateFields.filter(path =>
		path.startsWith('betterpptx.deck.generate_from_spec.properties.spec.properties.slides.items.properties.content.items.properties')
			|| path.startsWith('betterpptx.deck.generate_from_spec.properties.spec.properties.presenter.properties')
			|| path.startsWith('betterpptx.deck.generate_from_spec.properties.spec.properties.niceties')
			|| path.startsWith('betterpptx.deck.generate_from_spec.properties.spec.properties.powerpointNiceties'))
	const coordinateLeaks = coordinateFields.filter(path => !visualReferenceCoordinates.includes(path) && !exactAuthorCoordinates.includes(path))
	assert.ok(visualReferenceCoordinates.some(path => path.endsWith('.properties.x')))
	assert.ok(visualReferenceCoordinates.some(path => path.endsWith('.properties.y')))
	assert.ok(visualReferenceCoordinates.some(path => path.endsWith('.properties.w')))
	assert.ok(visualReferenceCoordinates.some(path => path.endsWith('.properties.h')))
	assert.ok(exactAuthorCoordinates.some(path => path.endsWith('.properties.x')))
	assert.ok(exactAuthorCoordinates.some(path => path.endsWith('.properties.h')))
	assert.deepEqual(coordinateLeaks, [])

	const geometryCatalog = toolByName.get('betterpptx.custom_geometry.catalog')
	assert.ok(geometryCatalog?.inputSchema?.properties?.collectionHandle)
	for (const key of ['sceneHandle', 'slideNumber', 'slide', 'minPoints', 'maxPoints', 'format']) {
		assert.equal(geometryCatalog.inputSchema.properties[key], undefined, key)
	}
	assert.deepEqual(toolByName.get('betterpptx.assets.catalog')?.inputSchema?.properties?.kind?.enum, ['model3d', 'shapeScene', 'customGeometry'])
})

test('public recipes and catalogs expose only opaque semantic authoring choices', async () => {
	const recipe = dataOf(await dispatcher.call('betterpptx.help.tool_recipe', { surface: 'customGeometry', detail: 'full' }))
	assert.equal(recipe.detail, 'full')
	assert.equal(recipe.designAuthority, 'ai')
	assert.equal(recipe.engineRole, 'execute-measure-validate-serialize')
	assert.match(JSON.stringify(recipe), /content\[\]\.handle/)
	assert.doesNotMatch(JSON.stringify(recipe), /\b(?:svg|pathData|from_svg)\b/i)
	assertVocabularyClean('custom-geometry recipe', recipe)

	const geometry = dataOf(await dispatcher.call('betterpptx.custom_geometry.catalog', { limit: 2, format: 'full' }))
	assert.ok(geometry.assets?.length > 0)
	assert.ok(geometry.assets.every(asset => /^customShape:\/\/public\/[a-f0-9]{32}$/.test(asset.handle)))
	const geometryKeyLeaks = collectKeys(geometry).filter(row => CUSTOM_GEOMETRY_PRIVATE_KEYS.has(row.key))
	assert.deepEqual(geometryKeyLeaks, [])
	assertVocabularyClean('custom-geometry catalog', geometry)

	const modelCatalog = dataOf(await dispatcher.call('betterpptx.assets.catalog', { kind: 'model3d', query: 'easel', maxResults: 2 }))
	assert.ok(modelCatalog.assets?.length > 0)
	assert.ok(modelCatalog.assets.every(asset => /^asset:\/\/catalog\/model3d\/[a-f0-9]{32}$/.test(asset.handle)))
	assert.ok(modelCatalog.assets.every(asset => asset.semanticSpec?.modelAsset === asset.handle))
	assertVocabularyClean('3D asset catalog', modelCatalog)

	const collections = dataOf(await dispatcher.call('betterpptx.assets.catalog', { kind: 'shapeScene', maxResults: 1 }))
	assert.ok(/^shapeScene:\/\/public\/[a-f0-9]{32}$/.test(collections.assets?.[0]?.handle || ''))
	assert.equal(Object.hasOwn(collections.assets?.[0]?.shapeScene || {}, 'counts'), false)
	assert.equal(Object.hasOwn(collections.assets?.[0]?.shapeScene || {}, 'specimenCount'), false)
	assertVocabularyClean('custom-geometry collection catalog', collections)
})

test('opaque public custom-geometry and 3D handles compile with AI-authored exact frames', async () => {
	const geometry = dataOf(await dispatcher.call('betterpptx.custom_geometry.catalog', { limit: 1 }))
	const models = dataOf(await dispatcher.call('betterpptx.assets.catalog', { kind: 'model3d', query: 'easel', maxResults: 1 }))
	const geometryHandle = geometry.assets?.[0]?.handle
	const modelHandle = models.assets?.[0]?.handle
	assert.ok(geometryHandle)
	assert.ok(modelHandle)

	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Opaque public handle proof',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
		contentStory: {
			audience: 'public authoring reviewers',
			outcome: 'Prove opaque public assets remain directly usable.',
			remember: 'The AI chooses assets and their exact frames; BetterPPTX resolves their native carriers.',
		},
		handshake: {
			audience: 'public authoring reviewers',
			promise: 'Compile opaque handles without public implementation provenance.',
			proof: ['Both editable assets resolve through the governed semantic compiler.'],
			payoff: 'The black-box boundary preserves capability without exposing internals.',
			bar: 'Every visible object has an AI-authored frame; no direct slide operation is needed.',
		},
		visualDesign: { world: 'Editorial proof card', framing: 'One title with two supporting objects.' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic plan', syncPolicy: 'single deck clock' },
		slides: [{
			id: 'opaque-proof',
			title: 'Opaque handles compile',
			message: 'The AI chooses assets and frames; BetterPPTX resolves their carriers.',
			layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'proof-title', text: 'Opaque handles compile', rect: { x: 0.8, y: 0.5, w: 11.7, h: 0.9 } },
				{ kind: 'customGeometry', name: 'proof-geometry', handle: geometryHandle, rect: { x: 1.0, y: 1.8, w: 4.8, h: 4.5 }, altText: 'Editable custom geometry.' },
				{ kind: 'model3d', name: 'proof-model', modelAsset: modelHandle, rect: { x: 7.0, y: 1.8, w: 4.8, h: 4.5 }, altText: 'Editable 3D model.' },
			],
		}],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}

	const dryRun = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', {
		spec, phase: 'dryRun', dryRun: true, commitMode: 'createNew', plan: 'premium', detail: 'summary',
	}))
	assert.equal(dryRun.phase, 'dryRun')
	assert.deepEqual(dryRun.errors || [], [])

	let deckId = null
	try {
		const committed = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', {
			spec,
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'premium',
			detail: 'summary',
			idempotencyKey: 'public-opaque-catalog-handles-v1',
		}))
		deckId = committed.deckId
		assert.ok(deckId)
		assert.deepEqual(committed.errors || [], [])
		assertVocabularyClean('semantic commit result', committed)
	} finally {
		if (deckId) await dispatcher.call('betterpptx.deck.dispose', { deckId })
	}
})
