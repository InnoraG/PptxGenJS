import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ADD_SLIDE_ROWS, ADD_SLIDE_UNIT_ID, runAddSlideProof } from '../verify-add-slide-unit-v1.mjs'

test('add-slide verifier freezes the exact generated unit row', () => {
	assert.equal(ADD_SLIDE_UNIT_ID, 'impl-b-7291f4091e2c2f56')
	assert.deepEqual(ADD_SLIDE_ROWS, [{ id: 'cap_d3e8dd4cef35a9b5dc30', label: 'add slide' }])
})

test('add-slide lifecycle keeps slide, layout, notes, and presentation graphs closed', async () => {
	const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-add-slide-test-'))
	try {
		const proof = await runAddSlideProof({ outputDir: path.join(parent, 'proof'), office: false })
		assert.equal(proof.status, 'ADD_SLIDE_PACKAGE_VERIFIED_OFFICE_GATED')
		assert.deepEqual(proof.blockers, [])
		assert.equal(proof.negativeMutationGates.length, 7)
		assert.ok(Object.entries(proof.checks).filter(([name]) => name !== 'powerPointRepairDisabledOpen2007SaveCopyAsReopenAndRender').every(([, value]) => value === true))
	} finally {
		await fs.rm(parent, { recursive: true, force: true })
	}
})
