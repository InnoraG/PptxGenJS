import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizePublicResult } from '../blackbox.mjs'
import { buildMvpBaselineInventory } from '../generate-mvp-baseline-inventory.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import {
	SHAPE_STYLE_PRESETS,
	WORDART_STYLE_PRESETS,
	shapeStylePresetById,
	wordArtStylePresetById,
} from '../native-style-presets.mjs'
import { PICTURE_STYLE_PRESETS, pictureStylePresetById } from '../picture-style-presets.mjs'
import { MODEL3D_VIEW_PRESETS, applyModel3dViewPreset, model3dViewPresetById } from '../model3d-view-presets.mjs'

test('MVP baseline inventory assembles every current source row', () => {
	const inventory = buildMvpBaselineInventory({ generatedAt: '2026-08-13T00:00:00.000Z' })
	assert.equal(inventory.schemaVersion, 'betterpptx.authoring.mvp-baseline-inventory.v1')
	assert.equal(inventory.verification.allSourcesPresent, true)
	assert.equal(inventory.verification.allPublicSpecFirstToolsDeclared, true)
	assert.equal(inventory.verification.allFamiliesHaveCompositionRoute, true)
	assert.equal(inventory.verification.allLedgerRowsClassified, true)
	assert.equal(inventory.verification.noProductRowsSilentlyDropped, true)
	assert.equal(new Set(inventory.rows.map(row => row.id)).size, inventory.rows.length)
	assert.ok(inventory.catalogClosure.ledgerRows > 0)
	assert.ok(inventory.catalogClosure.semanticFamilies > 0)
	assert.ok(inventory.catalogClosure.publicJsonSpecFirstTools > 0)
	assert.ok(inventory.catalogClosure.baselineRows > 0)
	assert.ok(inventory.catalogClosure.maintainerOnlyRows > 0)
})

test('public baseline catalog exposes named Worlds and layout intents as executable selectors', () => {
	const worlds = publicBaselineCatalog({ family: 'art-direction', limit: 50, offset: 0 })
	assert.ok(worlds.pagination.total >= 18)
	assert.ok(worlds.entries.every(entry => entry.family === 'art-direction' && typeof entry.selection?.executableValue === 'string'))
	assert.ok(worlds.entries.some(entry => entry.selection.executableValue === 'editorial'))
	assert.ok(worlds.entries.some(entry => entry.selection.executableValue === 'blueprint'))
	assert.ok(worlds.entries.some(entry => entry.selection.executableValue === 'mono'))
	const layouts = publicBaselineCatalog({ family: 'layout-intents', limit: 50, offset: 0 })
	assert.ok(layouts.pagination.total >= 16)
	assert.ok(layouts.entries.every(entry => entry.family === 'layout-intents' && typeof entry.selection?.executableValue === 'string'))
	assert.ok(layouts.entries.some(entry => entry.selection.executableValue === 'pull-quote'))
	assert.ok(layouts.entries.some(entry => entry.selection.executableValue === 'hero'))
})

test('public baseline catalog exposes every implemented row through paginated semantic routes', () => {
	const first = publicBaselineCatalog({ limit: 500, offset: 0 })
	assert.equal(first.schemaVersion, 'betterpptx.authoring.baseline-catalog.v1')
	assert.equal(first.status, 'PUBLIC_BASELINE_CATALOG')
	assert.ok(first.pagination.total > 1000)
	const entries = []
	for (let offset = 0; offset < first.pagination.total; offset += 500) {
		entries.push(...publicBaselineCatalog({ limit: 500, offset }).entries)
	}
	assert.equal(entries.length, first.pagination.total)
	assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length)
	assert.ok(entries.every(entry => entry.mvp === true && entry.route.composition.length > 0 && entry.route.discovery.length > 0))
	assert.ok(entries.filter(entry => entry.coverageMode === 'preserve-only').every(entry => entry.route.status === 'preserve-only' && entry.route.composition.includes('betterpptx.deck.open_uploaded')))
	assert.ok(entries.filter(entry => entry.coverageMode === 'validate-only' || entry.coverageMode === 'detect-and-reject').every(entry => entry.route.composition.includes('betterpptx.deck.validate')))
	assert.ok(entries.every(entry => !/node_modules|dist[\\/]|[A-Za-z]:[\\/]/i.test(JSON.stringify(entry))))
})

test('public black-box sanitizer preserves complete family counts without exposing model payloads', () => {
	const previous = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try {
		const catalog = publicBaselineCatalog({ limit: 500, offset: 0 })
		const publicCatalog = sanitizePublicResult(catalog)
		assert.deepEqual(publicCatalog.catalogClosure.familyCounts, catalog.catalogClosure.familyCounts)
		assert.equal(publicCatalog.catalogClosure.familyCounts.model3d, 33)
		assert.deepEqual(sanitizePublicResult({
			model3d: { sourcePath: 'private', modelRevision: 'private' },
			familyCounts: { model3d: 33 },
		}), { familyCounts: { model3d: 33 } })
	} finally {
		if (previous === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX
		else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previous
	}
})

test('native Office style vocabulary is fully enumerated and publicly reachable', () => {
	assert.equal(SHAPE_STYLE_PRESETS.length, 77)
	assert.equal(WORDART_STYLE_PRESETS.length, 20)
	assert.equal(PICTURE_STYLE_PRESETS.length, 28)
	assert.equal(MODEL3D_VIEW_PRESETS.length, 18)
	assert.equal(new Set(SHAPE_STYLE_PRESETS.map(item => item.id)).size, 77)
	assert.equal(new Set(WORDART_STYLE_PRESETS.map(item => item.id)).size, 20)
	assert.equal(new Set(PICTURE_STYLE_PRESETS.map(item => item.id)).size, 28)
	assert.equal(new Set(MODEL3D_VIEW_PRESETS.map(item => item.id)).size, 18)
	assert.ok(shapeStylePresetById('shape-style-077'))
	assert.ok(wordArtStylePresetById('wordart-style-020'))
	assert.ok(pictureStylePresetById('picture-style-028'))
	assert.ok(model3dViewPresetById('model3d-view-018'))
	assert.equal(shapeStylePresetById('shape-style-999'), null)
	assert.equal(wordArtStylePresetById('wordart-style-999'), null)
	assert.equal(pictureStylePresetById('picture-style-999'), null)
	assert.equal(model3dViewPresetById('model3d-view-999'), null)

	const first = publicBaselineCatalog({ limit: 500, offset: 0 })
	const entries = []
	for (let offset = 0; offset < first.pagination.total; offset += 500) {
		entries.push(...publicBaselineCatalog({ limit: 500, offset }).entries)
	}
	const shapeRows = entries.filter(entry => entry.sourceKind === 'native-gallery-style' && entry.label.includes('shape-style-'))
	const wordArtRows = entries.filter(entry => entry.sourceKind === 'native-gallery-style' && entry.label.includes('wordart-style-'))
	const pictureRows = entries.filter(entry => entry.sourceKind === 'native-gallery-style' && entry.label.includes('picture-style-'))
	const model3dViewRows = entries.filter(entry => entry.sourceKind === 'native-gallery-style' && entry.label.includes('model3d-view-'))
	assert.equal(shapeRows.length, 77)
	assert.equal(wordArtRows.length, 20)
	assert.equal(pictureRows.length, 28)
	assert.equal(model3dViewRows.length, 18)
	assert.ok([...shapeRows, ...wordArtRows, ...pictureRows, ...model3dViewRows].every(entry => entry.route.composition.includes('betterpptx.deck.generate_from_spec')))
	assert.ok([...shapeRows, ...wordArtRows, ...pictureRows, ...model3dViewRows].every(entry => entry.source === 'capability-catalog' && entry.implemented === true && entry.mvp === true))
	assert.ok(pictureRows.every(entry => entry.capabilityMode === 'preset-plus-parameters' && entry.capabilityStatus === 'executable-exact-structured'))
	assert.ok(pictureRows.every(entry => entry.expandedOptions?.pictureStyle && entry.overrideFields.includes('pictureStyle.line.widthPt')))
	assert.doesNotMatch(JSON.stringify(pictureRows), /_raw|<a:/)
})

test('Model 3D gallery views preserve the view while leaving asset framing to auto-fit', () => {
	const applied = applyModel3dViewPreset({}, 'model3d-view-011').options
	assert.equal(applied.trans.meterPerModelUnit, undefined)
	assert.equal(applied.trans.preTrans, undefined)
	assert.equal(applied.objViewport, undefined)
	assert.deepEqual(applied.trans.rot, model3dViewPresetById('model3d-view-011').recipe.trans.rot)
	assert.deepEqual(applied.camera, model3dViewPresetById('model3d-view-011').recipe.camera)
	const explicit = applyModel3dViewPreset({ objViewport: 7654321, trans: { meterPerModelUnit: { n: 3, d: 5 }, preTrans: { dx: 1, dy: 2, dz: 3 } } }, 'model3d-view-011').options
	assert.deepEqual(explicit.trans.meterPerModelUnit, { n: 3, d: 5 })
	assert.deepEqual(explicit.trans.preTrans, { dx: 1, dy: 2, dz: 3 })
	assert.equal(explicit.objViewport, 7654321)
})

test('native style IDs survive semantic compilation as executable engine options', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'native style smoke',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		slides: [{
			id: 's1',
			title: 'Native styles',
			layoutIntent: 'title-body',
			content: [
				{ kind: 'shape', name: 'shape1', shapeName: 'rect', style: { shapeStylePresetId: 'shape-style-077' } },
				{ kind: 'wordart', name: 'wordart1', text: 'WordArt', style: { wordArtStylePresetId: 'wordart-style-020' } },
				{ kind: 'image', name: 'picture1', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', pictureStylePresetId: 'picture-style-028', noFrame: true },
				{ kind: 'model3d', name: 'model1', modelAsset: 'model3d://catalog/test/model.glb', model3dViewPresetId: 'model3d-view-018', nativeOnly: true },
			],
		}],
	}, { dryRun: true })
	const shape = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_shape')
	const wordArt = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_text')
	const picture = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_image')
	const model3d = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_model3d')
	assert.equal(shape?.args?.options?.shapeStylePresetId, 'shape-style-077')
	assert.equal(wordArt?.args?.options?.wordArtStylePresetId, 'wordart-style-020')
	assert.equal(picture?.args?.options?.pictureStylePresetId, 'picture-style-028')
	assert.equal(model3d?.args?.options?.model3dViewPresetId, 'model3d-view-018')
	const shapePreset = shapeStylePresetById('shape-style-077')
	const wordArtPreset = wordArtStylePresetById('wordart-style-020')
	const picturePreset = pictureStylePresetById('picture-style-028')
	const model3dPreset = model3dViewPresetById('model3d-view-018')
	assert.match(shapePreset.canonicalPayloadHash, /^[a-f0-9]{64}$/)
	assert.match(wordArtPreset.canonicalPayloadHash, /^[a-f0-9]{64}$/)
	assert.match(picturePreset.canonicalPayloadHash, /^[a-f0-9]{64}$/)
	assert.match(model3dPreset.canonicalPayloadHash, /^[a-f0-9]{64}$/)
	assert.deepEqual(model3dViewPresetById('model3d-view-001').recipe.trans.rot, {})
	assert.match(picturePreset.recipe._rawPicPrstGeomXml, /^<a:(?:prstGeom|custGeom)[>\s]/)
	assert.equal(typeof shapePreset.recipe._rawFillXml, 'string')
	assert.match(shapePreset.recipe._rawShapeStyleXml, /^<p:style[>\s]/)
	assert.match(wordArtPreset.recipe._rawRprChildXmlExact, /^<a:/)
	assert.equal(wordArtStylePresetById('wordart-style-003').recipe._rPrB, '1')
	assert.equal(wordArtStylePresetById('wordart-style-009').recipe._rPrSpc, '50')
	assert.equal(wordArtStylePresetById('wordart-style-001').recipe._rPrB, null)
	assert.equal(wordArtStylePresetById('wordart-style-001').recipe._rPrSpc, null)
	assert.equal(Object.hasOwn(wordArtStylePresetById('wordart-style-009').recipe, '_rawRprAttrs'), false)
	assert.equal(JSON.stringify(plan.operations).includes('_rawRprChildXmlExact'), false)
	assert.match(shape?.args?.options?._rawShapeStyleXml, /^<p:style[>\s]/)
	assert.equal(JSON.stringify(plan.operations).includes('_rawPicPrstGeomXml'), false)
	assert.equal(JSON.stringify(plan.operations).includes('canonicalPayloadHash'), false)
})

test('unknown native style IDs fail closed during semantic dry-run', () => {
	assert.throws(() => buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'invalid native style smoke',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		slides: [{
			id: 's1',
			title: 'Invalid native style',
			layoutIntent: 'title-body',
			content: [{ kind: 'shape', name: 'shape1', shapeName: 'rect', shapeStylePresetId: 'shape-style-999' }],
		}],
	}, { dryRun: true }), /shape options\.shapeStylePresetId is unknown: shape-style-999/)
	assert.throws(() => buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'invalid picture style smoke',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		slides: [{
			id: 's1',
			title: 'Invalid picture style',
			layoutIntent: 'title-body',
			content: [{ kind: 'image', name: 'picture1', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', pictureStylePresetId: 'picture-style-999', noFrame: true }],
		}],
	}, { dryRun: true }), /Unknown picture style preset: picture-style-999/)
	assert.throws(() => buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'invalid Model 3D view smoke',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		slides: [{
			id: 's1',
			title: 'Invalid Model 3D view',
			layoutIntent: 'title-body',
			content: [{ kind: 'model3d', name: 'model1', modelAsset: 'model3d://catalog/test/model.glb', model3dViewPresetId: 'model3d-view-999' }],
		}],
	}, { dryRun: true }), /Unknown Model 3D view preset: model3d-view-999/)
})
