#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NATIVE_VISUAL_SURFACES } from './ir/native-visual-primitives.mjs'
import { publicBaselineCatalog } from './public-baseline-catalog.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const first = publicBaselineCatalog({ includePlanned: true, offset: 0, limit: 500 })
const catalogRows = []
for (let offset = 0; offset < first.pagination.total; offset += 500) {
	catalogRows.push(...publicBaselineCatalog({ includePlanned: true, offset, limit: 500 }).entries)
}

const truthFields = row => ({
	id: row.id,
	family: row.family || 'native-visual',
	label: row.label || row.description,
	capabilityMode: row.capabilityMode,
	capabilityStatus: row.capabilityStatus,
	componentOwnership: row.componentOwnership,
	overrideFields: row.overrideFields,
	resetBehavior: row.resetBehavior,
	...(row.applicability ? { applicability: row.applicability } : {}),
	...(row.limitation ? { limitation: row.limitation } : {}),
})

const projectedCatalogRows = catalogRows.map(truthFields)
const statusCounts = Object.fromEntries(
	Object.entries(Object.groupBy(projectedCatalogRows, row => row.capabilityStatus))
		.map(([status, rows]) => [status, rows.length]),
)
const publicSelectableRows = publicBaselineCatalog({ includePlanned: false, offset: 0, limit: 1 }).pagination.total
const implementationSummary = {
	denominatorMeaning: 'Mixed public catalog rows: presets, semantic entries, operations, authoring families, and capability rows. It is not a count of sliders or typed parameter leaves.',
	sourceRowsClaimingImplementation: catalogRows.filter(row => row.implemented === true).length,
	publiclySelectableRows: publicSelectableRows,
	fullyImplementedForNewAuthoring: (statusCounts['executable-exact-structured'] || 0) + (statusCounts['native-first-class-selector-plus-overrides'] || 0),
	partiallyImplementedForNewAuthoring: statusCounts['structured-partial'] || 0,
	preserveImportedOnly: statusCounts['preserve-imported-only'] || 0,
	notApplicable: statusCounts['not-applicable'] || 0,
	notImplemented: (statusCounts.missing || 0) + (statusCounts['preset-only-incomplete'] || 0),
	newAuthoringPathAtLeastPartial: projectedCatalogRows.filter(row => ['executable-exact-structured', 'native-first-class-selector-plus-overrides', 'structured-partial'].includes(row.capabilityStatus)).length,
	statusCounts,
}

const matrix = {
	schemaVersion: 'betterpptx.preset-decomposition-matrix.v1',
	generatedFrom: {
		includePlanned: true,
		expectedCatalogRows: first.pagination.total,
		catalogFingerprint: first.catalogFingerprint,
	},
	counts: { catalogRows: catalogRows.length, optionSurfaces: NATIVE_VISUAL_SURFACES.length },
	implementationSummary,
	catalogRows: projectedCatalogRows,
	optionSurfaces: NATIVE_VISUAL_SURFACES.map(truthFields),
}

const target = path.join(here, 'preset-decomposition-matrix.json')
await fs.writeFile(target, `${JSON.stringify(matrix, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ target, ...matrix.counts, catalogFingerprint: matrix.generatedFrom.catalogFingerprint })}\n`)
