import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
	LAYOUTS_THEMES_MASTERS_FAMILY_ROWS,
	LAYOUTS_THEMES_MASTERS_FAMILY_UNIT_ID,
	runLayoutsThemesMastersFamilyProof,
} from '../verify-layouts-themes-masters-family-unit-v1.mjs'

test('layouts/themes/masters family verifier freezes the exact generated unit row', () => {
	assert.equal(LAYOUTS_THEMES_MASTERS_FAMILY_UNIT_ID, 'impl-b-26ea0c88fdeb335a')
	assert.deepEqual(LAYOUTS_THEMES_MASTERS_FAMILY_ROWS, [{ id: 'cap_d35d4ae0cb2a0a5f78db', label: 'Layouts, themes, and masters' }])
})

test('aggregate package proof closes authored, bundled-selector, and imported-carrier lanes', async () => {
	const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layouts-themes-masters-family-test-'))
	const outputDir = path.join(parent, 'proof')
	try {
		const proof = await runLayoutsThemesMastersFamilyProof({ outputDir, office: false })
		assert.equal(proof.status, 'LAYOUTS_THEMES_MASTERS_FAMILY_PACKAGE_VERIFIED_OFFICE_GATED')
		assert.deepEqual(proof.blockers, [])
		assert.ok(Object.entries(proof.checks).filter(([name]) => name !== 'powerPointRepairDisabledOpen2007SaveCopyAsReopen').every(([, value]) => value === true))
		assert.equal(proof.childProofs.imported.status, 'IMPORTED_TEMPLATE_CARRIER_PACKAGE_VERIFIED_OFFICE_GATED')
		assert.equal(proof.childProofs.imported.negativeMutationGates.length, 2)
	} finally {
		await fs.rm(parent, { recursive: true, force: true })
	}
})
