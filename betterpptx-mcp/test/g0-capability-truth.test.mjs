import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { CAPABILITY_MODES, CAPABILITY_STATUSES, validateCapabilityTruth } from '../capability-truth.mjs'
import { NATIVE_VISUAL_SURFACES } from '../ir/native-visual-primitives.mjs'
import { listOptionCatalog } from '../option-registry.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const matrix = JSON.parse(await fs.readFile(path.join(here, '..', 'preset-decomposition-matrix.json'), 'utf8'))

function allCatalogRows() {
	const first = publicBaselineCatalog({ includePlanned: true, offset: 0, limit: 500 })
	const rows = []
	for (let offset = 0; offset < first.pagination.total; offset += 500) rows.push(...publicBaselineCatalog({ includePlanned: true, offset, limit: 500 }).entries)
	return { first, rows }
}

test('G0 decomposition matrix classifies the complete 2,258-row catalog', () => {
	assert.equal(matrix.schemaVersion, 'betterpptx.preset-decomposition-matrix.v1')
	assert.equal(matrix.generatedFrom.includePlanned, true)
	assert.equal(matrix.generatedFrom.expectedCatalogRows, 2258)
	assert.equal(matrix.counts.catalogRows, 2258)
	assert.equal(matrix.catalogRows.length, 2258)
	assert.equal(new Set(matrix.catalogRows.map(row => row.id)).size, 2258)
	assert.deepEqual(matrix.implementationSummary, {
		denominatorMeaning: 'Mixed public catalog rows: presets, semantic entries, operations, authoring families, and capability rows. It is not a count of sliders or typed parameter leaves.',
		sourceRowsClaimingImplementation: 2211,
		publiclySelectableRows: 2210,
		fullyImplementedForNewAuthoring: 1342,
		partiallyImplementedForNewAuthoring: 723,
		preserveImportedOnly: 61,
		notLiveInSavedPackage: 28,
		hostCommandsNotPersistentStyle: 39,
		byteTransformOperations: 0,
		notApplicable: 16,
		notImplemented: 49,
		newAuthoringPathAtLeastPartial: 2065,
		statusCounts: {
			'structured-partial': 723,
			'executable-exact-structured': 1342,
			'preserve-imported-only': 61,
			'not-live-in-saved-package': 28,
			'not-applicable': 16,
			'host-command-not-persistent-style': 39,
			missing: 49,
		},
	})
	for (const row of matrix.catalogRows) {
		assert.equal(validateCapabilityTruth(row, row.id), true)
		assert.ok(CAPABILITY_MODES.includes(row.capabilityMode))
		assert.ok(CAPABILITY_STATUSES.includes(row.capabilityStatus))
		assert.doesNotMatch(JSON.stringify(row), /_raw|node_modules|[A-Za-z]:[\\/]|sourcePath|repoPath/)
	}
})

test('generated matrix and live local catalog have identical truth classifications', () => {
	const { first, rows } = allCatalogRows()
	assert.equal(rows.length, 2258)
	assert.equal(first.catalogClosure.classifiedEntries, 2258)
	assert.equal(first.catalogClosure.classificationComplete, true)
	assert.equal(first.catalogFingerprint, matrix.generatedFrom.catalogFingerprint)
	const byId = new Map(matrix.catalogRows.map(row => [row.id, row]))
	for (const row of rows) {
		const frozen = byId.get(row.id)
		assert.ok(frozen, row.id)
		for (const field of ['capabilityMode', 'capabilityStatus', 'componentOwnership', 'overrideFields', 'resetBehavior']) assert.deepEqual(row[field], frozen[field], `${row.id}.${field}`)
	}
})

test('all native visual surfaces expose conservative ownership, override, and reset truth', () => {
	assert.equal(matrix.optionSurfaces.length, NATIVE_VISUAL_SURFACES.length)
	for (const surface of NATIVE_VISUAL_SURFACES) assert.equal(validateCapabilityTruth(surface, surface.id), true)
	const corrections = NATIVE_VISUAL_SURFACES.find(surface => surface.id === 'corrections')
	assert.equal(corrections.status, 'executable')
	assert.equal(corrections.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(corrections.examples, [{ brightness: 0.06, contrast: 0.12 }])
	assert.equal(corrections.parameters.find(parameter => parameter.id === 'sharpness').capabilityStatus, 'executable-exact-structured')
	const adjustments = NATIVE_VISUAL_SURFACES.find(surface => surface.id === 'imageAdjustments')
	for (const id of ['saturation', 'temperature']) assert.equal(adjustments.parameters.find(parameter => parameter.id === id).capabilityMode, 'parameterized')
	assert.equal(adjustments.parameters.find(parameter => parameter.id === 'recolor').capabilityMode, 'parameterized')
	assert.equal(adjustments.parameters.find(parameter => parameter.id === 'transparency').capabilityMode, 'parameterized')
	assert.equal(adjustments.parameters.find(parameter => parameter.id === 'transparency').capabilityStatus, 'executable-exact-structured')
	assert.match(JSON.stringify(adjustments.examples), /saturation|temperature/)
	assert.doesNotMatch(JSON.stringify(adjustments.examples), /transparency|recolor/)
})

test('public option discovery distinguishes exact, partial, preset-only, and missing picture controls', () => {
	const corrections = listOptionCatalog({ surface: 'corrections', format: 'full' }).surfaces[0]
	assert.equal(corrections.capabilityMode, 'parameterized')
	assert.equal(corrections.capabilityStatus, 'executable-exact-structured')
	assert.ok(corrections.componentOwnership.includes('pictureCorrections'))
	assert.deepEqual(
		corrections.parameters.find(parameter => parameter.id === 'sharpness'),
		{
			id: 'sharpness', type: 'continuous', valueType: 'number', minimum: -1, maximum: 1,
			default: 0, step: 0.00001, unit: 'normalized', semanticPath: 'imageAdjustments.sharpness',
			capabilityMode: 'parameterized', reset: 'set corrections.sharpness to null or omit it to restore the native/default value',
			capabilityStatus: 'executable-exact-structured',
		},
	)
	const saturation = listOptionCatalog({ surface: 'saturation', format: 'full' }).surfaces[0]
	assert.equal(saturation.id, 'corrections')
	assert.deepEqual(
		saturation.parameters.find(parameter => parameter.id === 'saturation'),
		{
			id: 'saturation', type: 'continuous', valueType: 'number', minimum: 0, maximum: 4,
			default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'imageAdjustments.saturation',
			capabilityMode: 'parameterized', reset: 'set corrections.saturation to null or omit it to restore the native/default value', capabilityStatus: 'executable-exact-structured',
		},
	)
	assert.deepEqual(
		saturation.parameters.find(parameter => parameter.id === 'temperature'),
		{
			id: 'temperature', type: 'continuous', valueType: 'number', minimum: 1500, maximum: 11500,
			default: 6500, step: 1, unit: 'kelvin', semanticPath: 'imageAdjustments.temperature',
			capabilityMode: 'parameterized', reset: 'set corrections.temperature to null or omit it to restore the native/default value', capabilityStatus: 'executable-exact-structured',
		},
	)
	const recolor = listOptionCatalog({ surface: 'recolor', format: 'full' }).surfaces[0]
	assert.equal(recolor.capabilityMode, 'parameterized')
	assert.equal(recolor.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(recolor.valueDomains.scheme, [
		'tx1', 'tx2', 'bg1', 'bg2', 'dk1', 'lt1', 'dk2', 'lt2',
		'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
		'hlink', 'folHlink', 'phClr',
	])
	const pictureCatalogText = JSON.stringify({ corrections, saturation, recolor })
	assert.doesNotMatch(pictureCatalogText, /sharpness approximation via contrast|additional recolor tints are planned/i)
	const pictureStyle = listOptionCatalog({ surface: 'pictureStylePreset', format: 'full' }).surfaces[0]
	assert.equal(pictureStyle.capabilityMode, 'preset-plus-parameters')
	assert.equal(pictureStyle.capabilityStatus, 'executable-exact-structured')
	assert.ok(pictureStyle.overrideFields.includes('pictureStyle.line.widthPt'))
	assert.ok(pictureStyle.overrideFields.includes('pictureStyle.threeD.camera.rotation'))
	assert.match(pictureStyle.resetBehavior.full, /pictureStyle to null/)
	assert.equal(pictureStyle.canonical.length, 28)
	assert.ok(pictureStyle.canonical.every(entry => entry.expandedOptions?.pictureStyle))
	assert.doesNotMatch(JSON.stringify(pictureStyle), /_raw|<a:/)
	assert.equal(listOptionCatalog({ surface: 'imageAdjustments' }).schemaVersion, 'betterpptx.options.catalog.v2')
})

test('gallery classification promotes Picture Styles only after exact decomposed authoring proof', () => {
	const { rows } = allCatalogRows()
	const pictureStyles = rows.filter(row => row.sourceKind === 'native-gallery-style' && /picture-style-/i.test(row.label))
	assert.equal(pictureStyles.length, 28)
	assert.ok(pictureStyles.every(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'executable-exact-structured'))
	assert.ok(pictureStyles.every(row => row.overrideFields.includes('pictureStyle.effects') && /pictureStyle to null/.test(row.resetBehavior.full)))
	const modelViews = rows.filter(row => row.sourceKind === 'native-gallery-style' && /model3d-view-/i.test(row.label))
	assert.equal(modelViews.length, 18)
	assert.ok(modelViews.every(row => row.capabilityMode === 'preset-plus-parameters' && row.overrideFields.includes('camera')))
	const unavailable = rows.filter(row => row.capabilityMode === 'missing' && row.capabilityStatus === 'missing')
	assert.equal(unavailable.length, 49)
	assert.ok(rows.filter(row => row.implemented === false).every(row => row.capabilityMode === 'missing' && row.capabilityStatus === 'missing'))
})
