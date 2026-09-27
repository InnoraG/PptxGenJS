import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runMultipleSlideMastersProof } from '../verify-multiple-slide-masters-unit-v1.mjs'

test('multiple-slide-masters unit closes authored master/layout/theme package lifecycle', { timeout: 120000 }, async t => {
	const outputDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-multiple-slide-masters-test-parent-')), 'proof')
	t.after(() => fs.rm(path.dirname(outputDir), { recursive: true, force: true }))
	const result = await runMultipleSlideMastersProof({ outputDir, office: false })
	assert.equal(result.unitId, 'impl-b-e691a66447bfe6e0')
	assert.equal(result.row.id, 'cap_fa5b7e33364aea2a6543')
	assert.equal(result.status, 'MULTIPLE_SLIDE_MASTERS_PACKAGE_VERIFIED_OFFICE_GATED')
	assert.equal(result.lifecycle.length, 3)
	assert.deepEqual(result.lifecycle.map(item => item.masterCount), [2, 2, 2])
	assert.deepEqual(result.lifecycle.map(item => item.slideLayouts), [
		['ALPHA_LAYOUT', 'BETA_LAYOUT'], ['ALPHA_LAYOUT', 'BETA_LAYOUT'], ['ALPHA_LAYOUT', 'BETA_LAYOUT'],
	])
	assert.equal(result.checks.presentationMasterRelationshipClosure, true)
	assert.equal(result.checks.masterLayoutAndThemeRelationshipClosure, true)
	assert.equal(result.checks.layoutReverseMasterClosure, true)
	assert.equal(result.checks.exportAndPortableRecompile, true)
})
