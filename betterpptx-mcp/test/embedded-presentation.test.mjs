import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
	MAX_EMBEDDED_PRESENTATION_BYTES,
	DEFAULT_CLIENT_SAFE_EMBED_BYTES,
	assertEmbeddedPresentationSize,
	shouldOfferDownloadLink,
	verifyEmbeddedPresentation,
} from '../delivery/embedded-presentation.mjs'

test('complete-file delivery accepts a 17.2 MB publication within its hard bound', () => {
	const size = 17_215_011
	assert.equal(assertEmbeddedPresentationSize(size, size), size)
	assert.equal(MAX_EMBEDDED_PRESENTATION_BYTES, 25 * 1024 * 1024)
})

test('large-resource requests fall back to a link before bytes enter the chat result', () => {
	assert.equal(DEFAULT_CLIENT_SAFE_EMBED_BYTES, 256 * 1024)
	assert.equal(shouldOfferDownloadLink('link', 1), true)
	assert.equal(shouldOfferDownloadLink('resource', 106_000), false)
	assert.equal(shouldOfferDownloadLink('resource', 17_215_008), true)
	assert.equal(shouldOfferDownloadLink('chunk', 17_215_008), false)
})

test('complete-file delivery rejects oversize or mismatched publication size before loading', () => {
	assert.throws(() => assertEmbeddedPresentationSize(MAX_EMBEDDED_PRESENTATION_BYTES + 1,
		MAX_EMBEDDED_PRESENTATION_BYTES + 1), { code: 'ARTIFACT_RESOURCE_TOO_LARGE' })
	assert.throws(() => assertEmbeddedPresentationSize(1024, 1023), { code: 'ARTIFACT_IDENTITY_MISMATCH' })
	assert.throws(() => assertEmbeddedPresentationSize(1024, undefined), { code: 'ARTIFACT_IDENTITY_MISMATCH' })
})

test('complete-file delivery verifies final bytes rather than trusting reported metadata', () => {
	const bytes = Buffer.from('an existing publication')
	const sha256 = createHash('sha256').update(bytes).digest('hex')
	assert.equal(verifyEmbeddedPresentation(bytes, bytes.length, sha256), bytes)
	assert.throws(() => verifyEmbeddedPresentation(Buffer.from('a different publication'), bytes.length, sha256),
		{ code: 'ARTIFACT_IDENTITY_MISMATCH' })
	assert.throws(() => verifyEmbeddedPresentation(bytes.subarray(1), bytes.length, sha256),
		{ code: 'ARTIFACT_IDENTITY_MISMATCH' })
})
