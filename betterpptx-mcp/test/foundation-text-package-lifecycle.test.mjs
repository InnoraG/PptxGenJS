import assert from 'node:assert/strict'
import test from 'node:test'

import {
	FOUNDATION_TEXT_ROWS,
	FOUNDATION_TEXT_UNIT_ID,
	assertFoundationTextValidationContracts,
	runFoundationTextPackageLifecycleProof,
} from '../verify-foundation-text-unit-v1.mjs'

test('foundation text validation rejects malformed fields and baseline/script conflicts', () => {
	assert.deepEqual(assertFoundationTextValidationContracts(), [
		'field id',
		'field type',
		'baseline with subscript',
		'baseline with superscript',
	])
})

test('foundation text unit keeps native text carriers and hyperlink relationships closed through lifecycle edits', { timeout: 120000 }, async () => {
	assert.equal(FOUNDATION_TEXT_UNIT_ID, 'impl-b-57c2c34fa9b72ee0')
	assert.equal(FOUNDATION_TEXT_ROWS.length, 22)
	assert.equal(new Set(FOUNDATION_TEXT_ROWS.map(([id]) => id)).size, 22)

	const result = await runFoundationTextPackageLifecycleProof()
	assert.equal(result.status, 'FOUNDATION_TEXT_PACKAGE_VERIFIED_OFFICE_DEPENDENCY_GATED')
	assert.ok(Object.values(result.checks).every(Boolean), JSON.stringify(result.checks))
	assert.deepEqual(result.lifecycle.map(item => item.state), ['initial', 'switched', 'reset', 'reedited', 'recompiled', 'deleted'])
	assert.deepEqual(result.lifecycle.map(item => item.hyperlinkCarriers), [2, 2, 0, 2, 2, 0])
	assert.deepEqual(result.lifecycle.map(item => item.hyperlinkRelationships), [2, 2, 0, 2, 2, 0])
	assert.ok(result.lifecycle.every(item => item.embeddedFonts === 0))
	assert.equal(result.office.status, 'dependency-gated')
})
