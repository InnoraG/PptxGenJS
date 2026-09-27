import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	IMAGE_FRAMING_ROW_IDS,
	IMPORTED_PICTURE_PRESERVATION_ROW_IDS,
	MEDIA_IMAGE_RESIDUAL_DISPOSITION_BY_ROW_ID,
	MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS,
	MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS,
	MEDIA_IMAGE_RESIDUAL_MISSING_ROW_IDS,
	MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_ROW_IDS,
	MEDIA_IMAGE_RESIDUAL_NOT_LIVE_ROW_IDS,
	MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS,
	MEDIA_IMAGE_RESIDUAL_PARTITION_ASSERTION,
	MEDIA_IMAGE_RESIDUAL_PRESERVE_ROW_IDS,
	MEDIA_IMAGE_RESIDUAL_ROW_IDS,
	assertMediaImageResidualRowPartition,
	mediaImageCapabilityContractForEntry,
} from '../media-image-formatting-contract.mjs'

const RESIDUAL_UNIT_ROW_IDS = Object.freeze([
	'cap_0fc3299869ce3b4533c7', 'cap_1304f0f7baa2c10db5c7', 'cap_17ffd7b1d5f729e5daa4', 'cap_186474948ea9361203ee',
	'cap_22df29ce753b9eac2ec1', 'cap_2e4204a3953606429ddb', 'cap_4491438c0454078f3991', 'cap_467c3210970983de8528',
	'cap_49139a9d4c35581b2bda', 'cap_4d2b961aac55c8821408', 'cap_4ec27467aeb03de12caa', 'cap_5423bb185bb8bc0da4e4',
	'cap_54cdbe0309c2f63dfd51', 'cap_58ea23b888da72a842ba', 'cap_789cc1020eb8d8dae2db', 'cap_7ac30aa72e0a6aa03e81',
	'cap_7db8092e40c3e870d0a3', 'cap_7e6539de019bedf5cc86', 'cap_8aa16e80707336884f99', 'cap_8f3285e603fe534ecf24',
	'cap_8fde26929b89a17dec2d', 'cap_96b33f7237875a4a33c9', 'cap_96bc73dd18c64793b1f8', 'cap_9e36f8c64dec7c481ff3',
	'cap_a06df5de402589e2f419', 'cap_a54941c0b1ae43cf8ce4', 'cap_aa6f469cc00bd5c21fd1', 'cap_af71409ee64242446c8e',
	'cap_b951a2540cf0b0977727', 'cap_bb80eaa8706cf3b79956', 'cap_c71d6877d5f7dd59c08c', 'cap_c78f5b9ef3353630506f',
	'cap_d17b6354985cae4bcf95', 'cap_d509f68eadc30aa08563', 'cap_d99504f46637c14548a5', 'cap_db200cfb83ccf89b2571',
	'cap_de3d1e14dc755754cf2c', 'cap_dfcc7a5586acc500f3f2', 'cap_e02a7e20df124d4fe45f', 'cap_e08e78a4833dfb363f47',
	'cap_e291d933c6711628be5d', 'cap_e9f5842459a942e7a481', 'cap_eecf0665821860d0b2ca', 'cap_f9809dc5ac597c14c457',
])

const EXPECTED_STATUS_BY_DISPOSITION = Object.freeze({
	exact: 'executable-exact-structured',
	preserve: 'preserve-imported-only',
	'not-applicable': 'not-applicable',
	'not-live': 'not-live-in-saved-package',
	missing: 'missing',
})

test('residual media/image snapshot is a complete disjoint 44-row partition', () => {
	assert.deepEqual([...MEDIA_IMAGE_RESIDUAL_ROW_IDS].sort(), [...RESIDUAL_UNIT_ROW_IDS].sort())
	assert.deepEqual(assertMediaImageResidualRowPartition(), MEDIA_IMAGE_RESIDUAL_PARTITION_ASSERTION)
	assert.deepEqual(MEDIA_IMAGE_RESIDUAL_PARTITION_ASSERTION, {
		total: 44,
		exact: 6,
		preserve: 4,
		notApplicable: 1,
		notLive: 1,
		missing: 2,
		partial: 30,
	})

	const allBuckets = [
		...MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_PRESERVE_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_NOT_APPLICABLE_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_NOT_LIVE_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_MISSING_ROW_IDS,
		...MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS,
	]
	assert.equal(new Set(allBuckets).size, 44)
	assert.equal(allBuckets.some(id => IMAGE_FRAMING_ROW_IDS.includes(id) || IMPORTED_PICTURE_PRESERVATION_ROW_IDS.includes(id)), false)
})

test('every residual snapshot row resolves to its audited public disposition or completed exact-unit promotion', () => {
	for (const id of MEDIA_IMAGE_RESIDUAL_ROW_IDS) {
		const record = MEDIA_IMAGE_RESIDUAL_DISPOSITION_BY_ROW_ID[id]
		const entry = { id, sourceKind: 'capability-row', family: 'media-images-avatar', label: record.label, implemented: true }
		const contract = mediaImageCapabilityContractForEntry(entry)
		if (record.disposition === 'partial') {
			assert.ok(MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS.includes(id), `${id} must remain traceable to the audited residual snapshot`)
			const expectedStatus = id === 'cap_af71409ee64242446c8e' ? 'not-applicable' : 'executable-exact-structured'
			assert.ok(contract, `${id} must resolve through its completed generated exact-unit contract`)
			assert.equal(contract.capabilityStatus, expectedStatus)
			assert.equal(applyCatalogTruth(entry).capabilityStatus, expectedStatus)
			continue
		}
		assert.ok(contract, `${id} must resolve its audited ${record.disposition} disposition`)
		assert.equal(contract.capabilityStatus, EXPECTED_STATUS_BY_DISPOSITION[record.disposition])
		assert.equal(applyCatalogTruth(entry).capabilityStatus, EXPECTED_STATUS_BY_DISPOSITION[record.disposition])
	}
	assert.equal(mediaImageCapabilityContractForEntry({ id: MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS[0], family: 'charts' }), null)
})

test('exact residual rows are backed by narrow leaf contracts with reset and composition metadata', () => {
	const contracts = Object.values(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS)
	assert.equal(contracts.length, 6)
	assert.deepEqual(contracts.flatMap(contract => contract.rowIds).sort(), [...MEDIA_IMAGE_RESIDUAL_EXACT_ROW_IDS].sort())
	for (const contract of contracts) {
		assert.equal(contract.capabilityStatus, 'executable-exact-structured')
		assert.ok(contract.componentOwnership.length > 0)
		assert.ok(contract.overrideFields.length > 0)
		assert.ok(contract.resetBehavior.component.includes('null'))
		assert.ok(contract.precedence.length > 0)
		assert.ok(contract.legalCombinations.length > 0)
		assert.equal(contract.sourceContract.capabilityStatus, 'executable-exact-structured')
		assert.ok(contract.sourceContract.parameters.length > 0)
	}
})

test('media commands, narration/provider rows, and public aggregates retain residual provenance after exact promotion', () => {
	const promotedRows = [
		'cap_8aa16e80707336884f99', // audio aggregate
		'cap_96bc73dd18c64793b1f8', // pause command
		'cap_9e36f8c64dec7c481ff3', // play command
		'cap_f9809dc5ac597c14c457', // stop command
		'cap_467c3210970983de8528', // play animation
		'cap_58ea23b888da72a842ba', // pause animation
		'cap_de3d1e14dc755754cf2c', // stop animation
		'cap_2e4204a3953606429ddb', // trigger
		'cap_4491438c0454078f3991', // duplicate trigger row
		'cap_b951a2540cf0b0977727', // autoplay narration timing
		'cap_eecf0665821860d0b2ca', // narration embedding
		'cap_789cc1020eb8d8dae2db', // section voice cues
		'cap_c71d6877d5f7dd59c08c', // TTS provider operation
		'cap_8f3285e603fe534ecf24', // voice artifact provider operation
		'cap_af71409ee64242446c8e', // legacy insert-media operation
		'cap_7db8092e40c3e870d0a3', // family aggregate
	]
	for (const id of promotedRows) {
		assert.ok(MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS.includes(id), `${id} must retain audited residual provenance`)
		const contract = mediaImageCapabilityContractForEntry({ id, family: 'media-images-avatar' })
		assert.ok(contract, `${id} must resolve through a runtime-ready exact-unit contract`)
		assert.equal(contract.capabilityStatus, id === 'cap_af71409ee64242446c8e' ? 'not-applicable' : 'executable-exact-structured')
	}
})
