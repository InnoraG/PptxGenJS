#!/usr/bin/env node

import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { IMAGE_FRAMING_ROW_IDS, IMPORTED_PICTURE_PRESERVATION_ROW_IDS } from './media-image-formatting-contract.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrix = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json'), 'utf8'))
const byId = new Map(matrix.catalogRows.map(row => [row.id, row]))

for (const id of IMAGE_FRAMING_ROW_IDS) {
	const row = byId.get(id)
	assert.ok(row, id)
	assert.equal(row.capabilityStatus, 'executable-exact-structured', id)
	assert.equal(row.capabilityMode, 'parameterized', id)
	assert.deepEqual(row.overrideFields, ['sizing.type'], id)
}
for (const id of IMPORTED_PICTURE_PRESERVATION_ROW_IDS) {
	const row = byId.get(id)
	assert.ok(row, id)
	assert.equal(row.capabilityStatus, 'preserve-imported-only', id)
	assert.equal(row.capabilityMode, 'preserve-only', id)
}

console.log(JSON.stringify({
	status: 'PASS',
	contract: 'imageFraming',
	executableExactRows: IMAGE_FRAMING_ROW_IDS.length,
	preserveImportedOnlyRows: IMPORTED_PICTURE_PRESERVATION_ROW_IDS.length,
	formalUniversalClosure: 'unchanged; implementation truth is separate from Office certification',
}, null, 2))
