import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { runOfficeThemePresetProof } from '../verify-office-theme-preset-unit-v1.mjs'

test('Office Theme selector lifecycle keeps the resource-scoped native carrier exact', async () => {
	const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-theme-preset-test-'))
	const outputDir = path.join(parentDir, 'proof')
	const proof = await runOfficeThemePresetProof({ outputDir, office: false })
	assert.equal(proof.unitId, 'impl-b-b0d8124a1c74c333')
	assert.deepEqual(proof.row, { id: 'cap_8d27ff2bc65e268f7bc4', label: 'Office Theme -> theme-office-001' })
	assert.equal(proof.status, 'OFFICE_THEME_PRESET_PACKAGE_VERIFIED_OFFICE_GATED')
	assert.deepEqual(proof.blockers, [])
	for (const check of [
		'registryAndResourceScope',
		'xmlCrcAndOpcClosure',
		'relationshipAndContentTypeClosure',
		'masterThemeAndLayoutGraphClosure',
		'nativeThemeAndMasterLanguageCarriers',
		'updateComponentResetFullResetAndReedit',
		'exportAndPortableReplay',
		'deterministicRepeatedWrite',
		'failClosedNoMutation',
	]) assert.equal(proof.checks[check], true, check)
	assert.equal(proof.lifecycle.find(item => item.state === 'edited')?.theme?.majorLatin, 'Arial')
	assert.equal(proof.lifecycle.find(item => item.state === 'component-reset')?.theme?.majorLatin, 'Aptos Display')
	assert.equal(proof.lifecycle.find(item => item.state === 'full-reset')?.theme?.colors?.accent1, '156082')
	assert.equal(proof.lifecycle.find(item => item.state === 'recompiled')?.masterLanguages?.[0], 'fr-FR')
})
