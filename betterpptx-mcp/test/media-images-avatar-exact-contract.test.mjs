import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	MEDIA_IMAGE_EXACT_BUCKET_BY_ROW_ID,
	MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS,
	MEDIA_IMAGE_EXACT_PARTITION_ASSERTION,
	MEDIA_IMAGE_EXACT_ROW_IDS,
	MEDIA_IMAGE_EXACT_ROW_RECORDS,
	MEDIA_IMAGE_EXACT_RUNTIME_READINESS,
	MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS,
	assertMediaImageExactRowPartition,
	mediaImageExactCandidateContractForEntry,
	mediaImageCapabilityContractForEntry,
	validateImageAssetSource,
	validateMediaCommandTiming,
	validateMediaImageExactContractValue,
	validateNarrationProvider,
} from '../media-image-formatting-contract.mjs'

const EXPECTED_BUCKET_ROWS = Object.freeze({
	imageAssetSource: Object.freeze([
		'cap_7ac30aa72e0a6aa03e81', 'cap_54cdbe0309c2f63dfd51', 'cap_e02a7e20df124d4fe45f',
		'cap_bb80eaa8706cf3b79956', 'cap_a54941c0b1ae43cf8ce4',
	]),
	pictureAdjuncts: Object.freeze([
		'cap_aa6f469cc00bd5c21fd1', 'cap_4d2b961aac55c8821408', 'cap_186474948ea9361203ee',
	]),
	mediaAssetPlayback: Object.freeze([
		'cap_8aa16e80707336884f99', 'cap_e9f5842459a942e7a481', 'cap_5423bb185bb8bc0da4e4',
		'cap_e08e78a4833dfb363f47', 'cap_dfcc7a5586acc500f3f2', 'cap_7e6539de019bedf5cc86',
		'cap_d99504f46637c14548a5',
	]),
	mediaCommandTiming: Object.freeze([
		'cap_96bc73dd18c64793b1f8', 'cap_9e36f8c64dec7c481ff3', 'cap_f9809dc5ac597c14c457',
		'cap_58ea23b888da72a842ba', 'cap_467c3210970983de8528', 'cap_de3d1e14dc755754cf2c',
		'cap_2e4204a3953606429ddb', 'cap_4491438c0454078f3991',
	]),
	narrationProvider: Object.freeze([
		'cap_b951a2540cf0b0977727', 'cap_eecf0665821860d0b2ca', 'cap_789cc1020eb8d8dae2db',
		'cap_c71d6877d5f7dd59c08c', 'cap_8f3285e603fe534ecf24',
	]),
	legacyAndAggregate: Object.freeze([
		'cap_af71409ee64242446c8e', 'cap_7db8092e40c3e870d0a3',
	]),
})

test('generated exact unit is a complete disjoint six-bucket partition of the 30 residual rows', () => {
	assert.deepEqual(assertMediaImageExactRowPartition(), MEDIA_IMAGE_EXACT_PARTITION_ASSERTION)
	assert.deepEqual(MEDIA_IMAGE_EXACT_PARTITION_ASSERTION, {
		total: 30,
		buckets: {
			imageAssetSource: 5,
			pictureAdjuncts: 3,
			mediaAssetPlayback: 7,
			mediaCommandTiming: 8,
			narrationProvider: 5,
			legacyAndAggregate: 2,
		},
		readyBuckets: 6,
	})
	assert.deepEqual([...MEDIA_IMAGE_EXACT_ROW_IDS].sort(), [...MEDIA_IMAGE_RESIDUAL_PARTIAL_ROW_IDS].sort())
	assert.equal(new Set(MEDIA_IMAGE_EXACT_ROW_IDS).size, 30)
	assert.equal(MEDIA_IMAGE_EXACT_ROW_RECORDS.length, 30)
	for (const [bucket, expectedIds] of Object.entries(EXPECTED_BUCKET_ROWS)) {
		assert.deepEqual([...MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS[bucket].rowIds].sort(), [...expectedIds].sort(), bucket)
		for (const id of expectedIds) assert.equal(MEDIA_IMAGE_EXACT_BUCKET_BY_ROW_ID[id], bucket)
	}
})

test('runtime readiness promotes every completed bucket with the legacy redirect classified not applicable', () => {
	assert.deepEqual(MEDIA_IMAGE_EXACT_RUNTIME_READINESS, {
		imageAssetSource: true,
		pictureAdjuncts: true,
		mediaAssetPlayback: true,
		mediaCommandTiming: true,
		narrationProvider: true,
		legacyAndAggregate: true,
	})
	for (const record of MEDIA_IMAGE_EXACT_ROW_RECORDS) {
		const entry = { id: record.id, sourceKind: 'capability-row', family: 'media-images-avatar', label: record.label, implemented: true }
		const candidate = mediaImageExactCandidateContractForEntry(entry)
		assert.ok(candidate, record.id)
		assert.equal(candidate.runtimeReady, true, record.id)
		assert.equal(candidate.capabilityStatus, 'executable-exact-structured', record.id)
		assert.equal(mediaImageCapabilityContractForEntry(entry).capabilityStatus, record.targetCapabilityStatus || 'executable-exact-structured', record.id)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, record.targetCapabilityStatus || 'executable-exact-structured', record.id)
	}
	const legacy = mediaImageExactCandidateContractForEntry({ id: 'cap_af71409ee64242446c8e', family: 'media-images-avatar' })
	assert.equal(legacy.targetCapabilityStatus, 'not-applicable')
	const aggregate = mediaImageExactCandidateContractForEntry({ id: 'cap_7db8092e40c3e870d0a3', family: 'media-images-avatar' })
	assert.equal(aggregate.targetCapabilityStatus, 'executable-exact-structured')
	assert.equal(mediaImageExactCandidateContractForEntry({ id: MEDIA_IMAGE_EXACT_ROW_IDS[0], family: 'charts' }), null)
})

test('every bucket publishes closed schema, ownership, reset, precedence, combinations, and generated vectors', () => {
	for (const [bucket, contract] of Object.entries(MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS)) {
		assert.equal(contract.readinessKey, bucket)
		assert.equal(contract.targetCapabilityStatus, 'executable-exact-structured')
		assert.ok(contract.componentOwnership.length > 0, bucket)
		assert.ok(contract.resetBehavior.component, bucket)
		assert.ok(contract.resetBehavior.full, bucket)
		assert.ok(contract.resetBehavior.nullBehavior, bucket)
		assert.ok(contract.precedence.length > 0, bucket)
		assert.ok(contract.legalCombinations.length > 0, bucket)
		assert.ok(contract.publicSchema.oneOf, bucket)
		assert.equal(contract.validation.mode, 'closed-generated-contract')
		assert.ok(contract.validation.validVectors.length > 0, bucket)
		assert.ok(contract.validation.invalidVectors.length > 0, bucket)
		for (const vector of contract.validation.validVectors) {
			assert.doesNotThrow(() => validateMediaImageExactContractValue(bucket, vector.value, `${bucket}.${vector.name}`), `${bucket}.${vector.name}`)
		}
		for (const vector of contract.validation.invalidVectors) {
			assert.throws(() => validateMediaImageExactContractValue(bucket, vector.value, `${bucket}.${vector.name}`), new RegExp(vector.error, 'i'), `${bucket}.${vector.name}`)
		}
	}
})

test('public schemas and valid examples expose only portable semantic references', () => {
	for (const contract of Object.values(MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS)) {
		const publicProjection = JSON.stringify({ schema: contract.publicSchema, validVectors: contract.validation.validVectors })
		assert.doesNotMatch(publicProjection, /filesystem|relationship\s*id|rId\d|server path/i)
		assert.doesNotMatch(JSON.stringify(contract.validation.validVectors), /[A-Za-z]:\\|\\\\[^\\]/)
	}
	assert.doesNotThrow(() => validateImageAssetSource({ kind: 'asset', ref: 'asset://image/example', format: 'jpeg' }))
	assert.throws(() => validateImageAssetSource({ kind: 'asset', ref: 'relative-image.jpg' }), /opaque authorized/)
	assert.doesNotThrow(() => validateNarrationProvider({ mode: 'retrieve', audioRef: 'audio://artifact/example' }))
	assert.throws(() => validateNarrationProvider({ mode: 'synthesize', text: 'Narrate.', serviceHint: 'private' }), /public contract/)
})

test('shared source validators canonicalize media commands without weakening reset semantics', () => {
	assert.deepEqual(validateMediaCommandTiming({
		command: 'playFrom(2)', trigger: 'withPrevious', delayMs: 250, durationMs: 1000,
	}), {
		command: 'playFrom(2.0)', trigger: 'withPrevious', delayMs: 250, durationMs: 1000,
	})
	assert.deepEqual(validateMediaCommandTiming({ command: null, preserveExistingTiming: true }), {
		command: null, preserveExistingTiming: true,
	})
	assert.throws(() => validateMediaCommandTiming({ command: 'playFrom(-1)' }), /togglePause, stop, or playFrom/)
})
