#!/usr/bin/env node

import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	WORDART_ADJUSTMENT_TRANSFORM_SET,
	WORDART_TRANSFORM_ROW_ID_BY_VALUE,
	WORDART_TRANSFORMS,
} from './wordart-transform-contract.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrix = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json'), 'utf8'))
const manifest = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'implementation-gap-manifest.json'), 'utf8'))
const overrides = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'implementation-gap-overrides.json'), 'utf8'))
const comparator = await fs.readFile(path.join(root, 'ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1'), 'utf8')
const byId = new Map(matrix.catalogRows.map(row => [row.id, row]))

assert.equal(matrix.catalogRows.length, 2258)
assert.equal(WORDART_TRANSFORMS.length, 41)
for (const transform of WORDART_TRANSFORMS) {
	const id = WORDART_TRANSFORM_ROW_ID_BY_VALUE[transform]
	const row = byId.get(id)
	assert.ok(row, id)
	assert.equal(row.label, transform, id)
	assert.equal(row.capabilityStatus, 'executable-exact-structured', id)
	assert.equal(row.capabilityMode, WORDART_ADJUSTMENT_TRANSFORM_SET.has(transform) ? 'parameterized' : 'discrete', id)
}

const aggregateRows = {
	cap_abfb261f65c94ea6a56b: 'betterpptx-mcp.object.apply_wordart',
	cap_6c4e13d0580c0c60bec8: 'text 3D',
	cap_9e4cf4e8605eadf60fc8: 'WordArt and Text3D',
}
for (const [id, label] of Object.entries(aggregateRows)) {
	const row = byId.get(id)
	assert.equal(row?.label, label, id)
	assert.equal(row?.capabilityStatus, 'structured-partial', id)
}

const unitId = 'impl-a-43ec5617af993869'
assert.equal(overrides.workUnits[unitId]?.gapInventoryStatus, 'complete')
assert.equal(overrides.workUnits[unitId]?.retired, true)
assert.equal(manifest.workUnits.some(unit => unit.id === unitId), false)
const residualUnit = manifest.workUnits.find(unit => Object.keys(aggregateRows).every(id => unit.rowIds.includes(id)))
assert.ok(residualUnit)
assert.notEqual(residualUnit.id, unitId)
assert.equal(residualUnit.fanOutRows, Object.keys(aggregateRows).length)
assert.equal(residualUnit.gapInventoryStatus, 'pending')
assert.match(comparator, /refWarpGuideSignature/)
assert.match(comparator, /GetAttribute\('fmla'\)/)

console.log(JSON.stringify({
	status: 'PASS',
	contract: 'wordArtTransform',
	executableExactRows: WORDART_TRANSFORMS.length,
	guideCapableRows: WORDART_TRANSFORMS.filter(value => WORDART_ADJUSTMENT_TRANSFORM_SET.has(value)).length,
	discreteOnlyRows: WORDART_TRANSFORMS.filter(value => !WORDART_ADJUSTMENT_TRANSFORM_SET.has(value)).length,
	structuredPartialAggregateRows: Object.keys(aggregateRows).length,
	residualWorkUnit: residualUnit.id,
	comparatorSignature: 'presence + preset + ordered guide name/formula + explicit guide absence',
	formalUniversalClosure: 'unchanged; implementation truth is separate from Office certification',
}, null, 2))
