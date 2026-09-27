import assert from 'node:assert/strict'
import test from 'node:test'

import {
	CONNECTOR_STYLE_PRESETS,
	EQUATION_FRACTION_GALLERY_PRESETS,
	EQUATION_RIBBON_GALLERY_PRESETS,
	EQUATION_SEMANTIC_GALLERY_PRESETS,
	LAYOUT_GALLERY_PRESETS,
	LAYOUT_THEME_MASTER_PRESETS,
	MASTER_GALLERY_PRESETS,
	SOURCE_API_GALLERY_PRESETS,
	THEME_GALLERY_PRESETS,
	TRANSITION_GALLERY_PRESETS,
	applyConnectorStylePreset,
	applyEquationGalleryPreset,
	publicSourceApiGalleryPresets,
	resolveLayoutThemeMasterSpec,
	resolveTransitionPreset,
} from '../source-api-gallery-presets.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

test('source/API gallery counts and observed order are exact', () => {
	assert.equal(TRANSITION_GALLERY_PRESETS.length, 49)
	assert.equal(CONNECTOR_STYLE_PRESETS.length, 42)
	assert.equal(EQUATION_FRACTION_GALLERY_PRESETS.length, 9)
	assert.equal(EQUATION_RIBBON_GALLERY_PRESETS.length, 230)
	assert.equal(EQUATION_SEMANTIC_GALLERY_PRESETS.length, 33)
	assert.equal(THEME_GALLERY_PRESETS.length, 1)
	assert.equal(MASTER_GALLERY_PRESETS.length, 2)
	assert.equal(LAYOUT_GALLERY_PRESETS.length, 30)
	assert.equal(LAYOUT_THEME_MASTER_PRESETS.length, 33)
	assert.equal(SOURCE_API_GALLERY_PRESETS.length, 387)
	assert.deepEqual(TRANSITION_GALLERY_PRESETS.slice(0, 4).map(row => row.label), ['None', 'Morph', 'Fade', 'Push'])
	assert.deepEqual(TRANSITION_GALLERY_PRESETS.slice(-4).map(row => row.label), ['Rotate', 'Window', 'Orbit', 'Fly Through'])
	assert.equal(CONNECTOR_STYLE_PRESETS[0].label, 'Subtle Line - Dark 1')
	assert.equal(CONNECTOR_STYLE_PRESETS[41].label, 'Double Arrow - Accent 6')
	assert.equal(EQUATION_FRACTION_GALLERY_PRESETS[0].label, 'Stacked Fraction')
	assert.equal(EQUATION_FRACTION_GALLERY_PRESETS[8].label, 'pi Over 2')
	assert.equal(EQUATION_RIBBON_GALLERY_PRESETS.find(row => row.category === 'Script' && row.tileIndex === 4)?.label, 'Left Subscript-Superscript')
	assert.equal(EQUATION_RIBBON_GALLERY_PRESETS.find(row => row.category === 'Matrix' && row.tileIndex === 22)?.label, 'Sparse Matrix in Brackets')
	assert.equal(EQUATION_SEMANTIC_GALLERY_PRESETS[0].label, 'Text')
	assert.equal(EQUATION_SEMANTIC_GALLERY_PRESETS[32].label, 'Matrix')
	assert.deepEqual(LAYOUT_GALLERY_PRESETS.slice(0, 3).map(row => row.label), ['Title Slide', 'Title and Content', 'Section Header'])
	assert.equal(LAYOUT_GALLERY_PRESETS.at(-1).label, 'CORP_APPENDIX_DENSE')
})

test('preset resolution is exact and unknown IDs fail closed', () => {
	assert.deepEqual(resolveTransitionPreset({ transitionPresetId: 'transition-ribbon-003' }), { type: 'fade' })
	assert.throws(() => resolveTransitionPreset({ transitionPresetId: 'transition-ribbon-999' }), /unknown transition gallery preset/i)

	const connector = applyConnectorStylePreset({ x: 1, y: 2, w: 3, h: 4, line: { color: 'FF0000' } }, 'connector-ribbon-036').options
	assert.equal(connector.x, 1)
	assert.match(connector._rawConnectorStyleXml, /schemeClr val="dk1"/)
	assert.match(connector._rawConnectorLineXml, /headEnd type="triangle"/)
	assert.match(connector._rawConnectorLineXml, /tailEnd type="triangle"/)
	assert.throws(() => applyConnectorStylePreset({}, 'connector-ribbon-999'), /unknown connector gallery preset/i)

	const equation = applyEquationGalleryPreset({}, 'equation-fraction-ribbon-002', { numerator: 'n', denominator: 'd' }).options
	assert.equal(equation.sourceFormat, 'template')
	assert.equal(equation.source.fractionType, 'skw')
	assert.equal(equation.source.numerator, 'n')
	assert.equal(equation.source.denominator, 'd')
	const matrix = applyEquationGalleryPreset({}, 'equation-semantic-033', { rows: [['a', 'b'], ['c', 'd']] }).options
	assert.equal(matrix.sourceFormat, 'template')
	assert.equal(matrix.source.kind, 'matrix')
	assert.deepEqual(matrix.source.rows, [['a', 'b'], ['c', 'd']])
	const preScript = applyEquationGalleryPreset({}, 'equation-script-ribbon-004', { base: 'A', subscript: 'i', exponent: 'n' }).options
	assert.equal(preScript.source.kind, 'presubsup')
	assert.equal(preScript.source.base, 'A')
	const stackedIntegral = applyEquationGalleryPreset({}, 'equation-integral-ribbon-003').options
	assert.equal(stackedIntegral.source.kind, 'nary')
	assert.equal(stackedIntegral.source.limitLocation, 'undOvr')
	assert.throws(() => applyEquationGalleryPreset({}, 'equation-fraction-ribbon-999'), /unknown equation gallery preset/i)

	const layoutSpec = resolveLayoutThemeMasterSpec({
		schemaVersion: 'betterpptx.deck-spec.v1',
		masterPresetId: 'master-office-baseline-wide-001',
		slides: [{ id: 's1', layoutPresetId: 'layout-office-baseline-wide-004' }],
	})
	assert.equal(layoutSpec.template.templatePresetId, 'template-office-baseline-wide-001')
	assert.equal(layoutSpec.slides[0].layoutName, 'Two Content')
	assert.match(layoutSpec.template.path, /office-baseline-wide\.pptx$/)
	assert.throws(() => resolveLayoutThemeMasterSpec({ slides: [{ layoutPresetId: 'layout-office-baseline-wide-999' }] }), /unknown layout\/theme\/master gallery preset/i)
	assert.throws(() => resolveLayoutThemeMasterSpec({ slides: [
		{ layoutPresetId: 'layout-office-baseline-wide-001' },
		{ layoutPresetId: 'layout-corporate-reference-wide-001' },
	] }), /different template resources/i)
})

test('public projection exposes IDs but no private recipe or DrawingML', () => {
	const projection = publicSourceApiGalleryPresets()
	assert.equal(projection.length, 387)
	const text = JSON.stringify(projection)
	assert.doesNotMatch(text, /recipe|_rawConnector|<a:|<p:/i)

	for (const family of ['layouts-themes-masters', 'motion-transitions-morph', 'structural', 'equations']) {
		const page = publicBaselineCatalog({ family, limit: 500 })
		const values = new Set(page.entries.map(entry => entry.selection?.executableId).filter(Boolean))
		const expected = projection.filter(entry => entry.family === family).map(entry => entry.id)
		for (const id of expected) assert.ok(values.has(id), `${family} must expose ${id}`)
		assert.doesNotMatch(JSON.stringify(page), /_rawConnector|<a:|<p:/i)
	}
})
