import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runAddHyperlinkProof } from '../verify-add-hyperlink-unit-v1.mjs'

test('add-hyperlink unit closes native carrier and relationship lifecycle', { timeout: 120000 }, async t => {
	const outputDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-add-hyperlink-test-parent-')), 'proof')
	t.after(() => fs.rm(path.dirname(outputDir), { recursive: true, force: true }))
	const result = await runAddHyperlinkProof({ outputDir, office: false })
	assert.equal(result.unitId, 'impl-b-dd9d9170d70c8ce8')
	assert.equal(result.row.id, 'cap_ec04790e0410160fc4c3')
	assert.equal(result.status, 'ADD_HYPERLINK_PACKAGE_VERIFIED_OFFICE_GATED')
	assert.deepEqual(result.lifecycle.map(item => item.hyperlinkCarriers), [4, 4, 0, 4, 4, 4, 0])
	assert.deepEqual(result.lifecycle.map(item => item.hyperlinkRelationships), [4, 4, 0, 4, 4, 4, 0])
	assert.equal(result.negativeMutationGates.length, 7)
	assert.equal(result.checks.tooltipAndTargetFrameSerialization, true)
	assert.equal(result.checks.semanticTargetRetargetAcrossReorder, true)
})
