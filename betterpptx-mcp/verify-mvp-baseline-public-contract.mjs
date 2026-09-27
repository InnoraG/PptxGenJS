// Read-only smoke proof for the public catalog and JSON-spec front door.  This
// does not generate or save a deck; it verifies that the catalog advertised by
// the baseline can actually be discovered through the running engine surface.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_SPEC_FIRST_TOOLS } from './blackbox.mjs'
import { TOOLS } from './tools.mjs'
import { AUTHORING_CAPABILITY_REGISTRY } from './authoring-capability-registry.mjs'
import { callBetterPptxTool, listBetterPptxToolNames } from './engine.mjs'
import { MODEL3D_VIEW_PRESETS } from './model3d-view-presets.mjs'
import { NATIVE_EFFECT_PRESETS } from './native-effect-presets.mjs'
import { NATIVE_STYLE_PRESETS } from './native-style-presets.mjs'
import { PICTURE_STYLE_PRESETS } from './picture-style-presets.mjs'
import { SOURCE_API_GALLERY_PRESETS } from './source-api-gallery-presets.mjs'

function check(id, ok, detail) {
	return { id, status: ok ? 'PASS' : 'FAIL', detail }
}

export async function verifyMvpBaselinePublicContract() {
	const handlers = new Set(listBetterPptxToolNames())
	const declared = new Set(TOOLS.map(tool => tool.name))
	const missingPublicHandlers = [...PUBLIC_SPEC_FIRST_TOOLS].filter(name => !handlers.has(name))
	const missingDeclaredHandlers = [...declared].filter(name => !handlers.has(name))
	const help = await callBetterPptxTool('betterpptx.help.capabilities', { intent: 'MVP catalog closure verification', detail: 'full' }, { source: 'mvp-baseline-public-contract' })
	const authoring = await callBetterPptxTool('betterpptx.authoring.capabilities', {}, { source: 'mvp-baseline-public-contract' })
	const baselineFirst = await callBetterPptxTool('betterpptx.authoring.catalog', { limit: 500, offset: 0 }, { source: 'mvp-baseline-public-contract' })
	const helpData = help?.data || {}
	const authoringData = authoring?.data || {}
	const actualFamilies = new Set((authoringData.capabilities || []).map(row => row.id))
	const expectedFamilies = new Set(AUTHORING_CAPABILITY_REGISTRY.map(row => row.id))
	const missingFamilies = [...expectedFamilies].filter(id => !actualFamilies.has(id))
	const extraFamilies = [...actualFamilies].filter(id => !expectedFamilies.has(id))
	const baselineData = baselineFirst?.data || {}
	const totalBaseline = Number(baselineData.pagination?.total || 0)
	const baselineEntries = []
	for (let offset = 0; offset < totalBaseline; offset += 500) {
		const page = offset === 0 ? baselineData : (await callBetterPptxTool('betterpptx.authoring.catalog', { limit: 500, offset }, { source: 'mvp-baseline-public-contract' }))?.data
		baselineEntries.push(...(page?.entries || []))
	}
	const baselineIds = new Set(baselineEntries.map(entry => entry.id))
	const privateLeak = JSON.stringify(baselineEntries).match(/(?:[A-Za-z]:\\|\/home\/|\/Users\/|node_modules|dist\/node|betterpptx-mcp\/)/i)
	const routeGaps = baselineEntries.filter(entry => !entry.route?.composition?.length || !entry.route?.discovery?.length)
	const specKinds = new Set((helpData.specCapabilityMatrix?.specNative || []).map(row => row.kind))
	const deckFields = new Set((helpData.specCapabilityMatrix?.deckLevel || []).map(row => row.field))
	const semanticKindReachable = (kind, entry) => {
		if (['preserve-only', 'validate-only', 'detect-and-reject'].includes(entry.coverageMode)) return entry.route?.status === entry.coverageMode
		// Generic capability rows are intentionally routed through the semantic
		// front door even when they do not correspond to one content-block kind in
		// the detailed spec matrix. Their route status is the executable proof.
		if (entry.route?.status === 'spec-front-door' && entry.route?.composition?.includes('betterpptx.deck.generate_from_spec')) return true
		if (entry.route?.status === 'public-tool' && entry.route?.composition?.length > 0 && entry.route.composition.every(name => PUBLIC_SPEC_FIRST_TOOLS.has(name))) return true
		if (specKinds.has(kind)) return true
		if (kind === 'smartart') return specKinds.has('smartart/diagram')
		if (kind === 'diagram') return specKinds.has('smartart/diagram')
		if (kind === 'wordart' || kind === 'text3d') return specKinds.has('textShape')
		if (kind === 'image') return specKinds.has('image-feature')
		if (kind === 'reviewComment') return [...deckFields].some(field => field.startsWith('reviewComments'))
		if (kind === 'transition') return [...deckFields].some(field => field.startsWith('transitionPolicy'))
		if (kind === 'motion') return [...deckFields].some(field => field.startsWith('motion.'))
		return false
	}
	const semanticKindGaps = baselineEntries.filter(entry => !semanticKindReachable(entry.route?.semanticKind, entry))
	const routeTools = [...new Set(baselineEntries.flatMap(entry => [...(entry.route?.discovery || []), ...(entry.route?.composition || [])]))]
	const nonPublicRouteTools = routeTools.filter(name => !PUBLIC_SPEC_FIRST_TOOLS.has(name))
	const exactGalleryPresets = [...NATIVE_STYLE_PRESETS, ...PICTURE_STYLE_PRESETS, ...MODEL3D_VIEW_PRESETS, ...NATIVE_EFFECT_PRESETS, ...SOURCE_API_GALLERY_PRESETS]
	const expectedExactGalleryIds = new Set(exactGalleryPresets.map(preset => preset.id))
	const exactGalleryRows = baselineEntries.filter(entry => entry.sourceKind === 'native-gallery-style')
	const exactGalleryIds = new Set(exactGalleryRows.map(entry => entry.selection?.executableId).filter(Boolean))
	const missingExactGalleryIds = [...expectedExactGalleryIds].filter(id => !exactGalleryIds.has(id))
	const extraExactGalleryIds = [...exactGalleryIds].filter(id => !expectedExactGalleryIds.has(id))
	const nativeStyleIds = new Set(NATIVE_STYLE_PRESETS.map(preset => preset.id))
	const nativeStyleRows = exactGalleryRows.filter(entry => nativeStyleIds.has(entry.selection?.executableId))
	const missingNativeStyleIds = [...nativeStyleIds].filter(id => !exactGalleryIds.has(id))
	const checks = [
		check('declared-tools-have-handlers', missingDeclaredHandlers.length === 0, `missing=${missingDeclaredHandlers.length}`),
		check('public-spec-first-tools-have-handlers', missingPublicHandlers.length === 0, `missing=${missingPublicHandlers.length}`),
		check('help-capabilities', help?.ok === true && Boolean(helpData.specCapabilityMatrix) && Boolean(helpData.authoringPrinciples), 'help.capabilities returned the Authoring Excellence contract and spec capability matrix'),
		check('authoring-capability-catalog', authoring?.ok === true && Array.isArray(authoringData.capabilities), `returned=${authoringData.capabilities?.length || 0} expected=${expectedFamilies.size}`),
		check('family-catalog-parity', missingFamilies.length === 0 && extraFamilies.length === 0, `missing=${missingFamilies.length} extra=${extraFamilies.length}`),
		check('baseline-catalog-present', baselineFirst?.ok === true && totalBaseline > 1000 && baselineEntries.length === totalBaseline, `total=${totalBaseline} retrieved=${baselineEntries.length}`),
		check('baseline-catalog-unique-and-routed', baselineIds.size === baselineEntries.length && routeGaps.length === 0, `unique=${baselineIds.size}/${baselineEntries.length} routeGaps=${routeGaps.length}`),
		check('baseline-spec-kind-reachability', semanticKindGaps.length === 0, `unreachableSemanticKinds=${semanticKindGaps.length}`),
		check('baseline-route-tools-public', nonPublicRouteTools.length === 0, `nonPublic=${nonPublicRouteTools.length}`),
		check('native-style-id-reachability', nativeStyleRows.length === NATIVE_STYLE_PRESETS.length && missingNativeStyleIds.length === 0 && nativeStyleRows.every(entry => entry.route?.composition?.includes('betterpptx.deck.generate_from_spec')), `rows=${nativeStyleRows.length}/${NATIVE_STYLE_PRESETS.length} missing=${missingNativeStyleIds.length}`),
		check('exact-gallery-id-reachability', exactGalleryRows.length === exactGalleryPresets.length && exactGalleryIds.size === expectedExactGalleryIds.size && missingExactGalleryIds.length === 0 && extraExactGalleryIds.length === 0 && exactGalleryRows.every(entry => entry.route?.composition?.includes('betterpptx.deck.generate_from_spec')), `rows=${exactGalleryRows.length}/${exactGalleryPresets.length} unique=${exactGalleryIds.size}/${expectedExactGalleryIds.size} missing=${missingExactGalleryIds.length} extra=${extraExactGalleryIds.length}`),
		check('baseline-catalog-black-box', !privateLeak, privateLeak ? 'private implementation vocabulary/path-like text detected' : 'catalog entries contain no private path or implementation vocabulary'),
		check('json-spec-front-door', helpData.authoringSurface === 'mcp-generate-from-spec-only' && helpData.recommendedMode === 'mcp-authoring-excellence-json-spec', 'public guidance identifies the semantic JSON-spec front door'),
	]
	return {
		schemaVersion: 'betterpptx.authoring.mvp-baseline-public-contract.v1',
		status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
		counts: { declaredTools: declared.size, handlerTools: handlers.size, publicSpecFirstTools: PUBLIC_SPEC_FIRST_TOOLS.size, semanticFamilies: expectedFamilies.size, baselineCatalogEntries: totalBaseline },
		checks,
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = await verifyMvpBaselinePublicContract()
	console.log(JSON.stringify(report, null, 2))
	if (report.status !== 'PASS') process.exitCode = 1
}
