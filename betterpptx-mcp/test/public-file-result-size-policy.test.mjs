import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CLIENT_SAFE_EMBED_BYTES } from '../delivery/embedded-presentation.mjs'
import { savedPresentationResourceLink, withSavedPresentationResourceLink } from '../delivery/public-file-result.mjs'

// Shared transport wrapper only: no materializer, cloud, file bytes or engine
// execution. The exact URL deliberately contains case-sensitive escaped query
// bytes so a presentation hint cannot silently reserialize download authority.
const artifact = {
	downloadName: 'Roadmap review.pptx',
	downloadUrl: 'https://presentations.example/files/opaque/Roadmap%20review.pptx?permit=AbC%2BDeF%2fG&expires=1790737200',
	packageSha256: 'a'.repeat(64),
	downloadLinkExpiresAt: '2026-09-30T07:00:00.000Z',
	artifact: { state: 'download_ready', expiresAt: '2026-09-30T07:00:00.000Z', downloadLinkExpiresAt: '2026-09-30T07:00:00.000Z' },
}
const shapes = [
	['save', data => ({ ok: true, data })],
	['operation.status', data => ({ ok: true, data: { operationId: `op_${'c'.repeat(32)}`, state: 'succeeded', result: data } })],
	['resource-to-link fallback', data => ({ ok: true, data: { ...data, mode: 'link',
		operationId: `op_${'c'.repeat(32)}`, totalBytes: data.bytes,
		artifactExpiresAt: artifact.artifact.expiresAt, deliveryReason: 'resource-exceeds-conservative-client-size' } })],
]
const privateExtras = {
	filePath: '/srv/private/outputs/hidden.pptx', objectName: 'private-bucket/owner-hidden/object.pptx',
	resourceOwner: { kind: 'install', id: 'private-owner-hidden' }, signingSecret: 'private-signing-secret-hidden',
	base64: 'PRIVATE_FILE_BYTES_MUST_NOT_BE_COPIED',
}

function fixture(shape, bytes, missing = false) {
	const publicArtifact = { ...artifact, ...(missing ? {} : { bytes }) }
	const publicPayload = shape(publicArtifact)
	// This wrapper receives an already-public response. Ensure private extras in
	// its separate issuance payload can never become new content/structured data.
	const payload = shape({ ...publicArtifact, ...privateExtras })
	const text = `Saved presentation download metadata:\n${JSON.stringify(publicPayload)}`
	const toolResult = { isError: false, content: [{ type: 'text', text }], structuredContent: publicPayload }
	return { toolResult, payload, text, publicArtifact }
}

function assertPreserved(result, f, original) {
	assert.equal(result.content[0], f.toolResult.content[0])
	assert.equal(result.content[0].text, f.text, 'normal text and original URL spelling must remain byte-for-byte intact')
	assert.equal(result.structuredContent, f.toolResult.structuredContent)
	assert.deepEqual(f.toolResult, original, 'the input transport response must not be mutated')
	const data = result.structuredContent.data.result || result.structuredContent.data
	assert.equal(data.downloadUrl, artifact.downloadUrl)
	assert.equal(data.packageSha256, artifact.packageSha256)
	assert.equal(data.downloadLinkExpiresAt, artifact.downloadLinkExpiresAt)
	assert.equal(data.artifact.expiresAt, artifact.artifact.expiresAt)
	const serialized = JSON.stringify(result)
	for (const privateText of ['/srv/private', 'private-bucket', 'private-owner-hidden', 'private-signing-secret-hidden', 'PRIVATE_FILE_BYTES_MUST_NOT_BE_COPIED']) {
		assert.ok(!serialized.includes(privateText), `Wrapper copied private issuance data: ${privateText}`)
	}
	assert.ok(!serialized.includes('"base64"'))
	assert.ok(!serialized.includes('"blob"'))
	assert.ok(!serialized.includes('"type":"resource"'), 'transport wrapper must never add embedded bytes')
}

test('size policy reuses the conservative shared 256 KiB transport bound', () => {
	assert.equal(DEFAULT_CLIENT_SAFE_EMBED_BYTES, 256 * 1024)
})

for (const [label, shape] of shapes) {
	for (const bytes of [1, DEFAULT_CLIENT_SAFE_EMBED_BYTES - 1, DEFAULT_CLIENT_SAFE_EMBED_BYTES]) {
		test(`${label}: known positive integer ${bytes} bytes may append a resource link without rewriting download metadata`, () => {
			const f = fixture(shape, bytes)
			const original = structuredClone(f.toolResult)
			const originalPayload = structuredClone(f.payload)
			const link = savedPresentationResourceLink(f.payload)
			assert.equal(link?.type, 'resource_link')
			assert.equal(link.uri, artifact.downloadUrl)
			assert.equal(link.name, artifact.downloadName)
			assert.equal(link.size, bytes)
			assert.equal(link.mimeType, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
			assert.deepEqual(Object.keys(link).sort(), ['description', 'mimeType', 'name', 'size', 'type', 'uri'])
			const result = withSavedPresentationResourceLink(f.toolResult, f.payload)
			assert.equal(result.content.length, 2)
			assert.deepEqual(result.content[1], link)
			assertPreserved(result, f, original)
			assert.deepEqual(f.payload, originalPayload)
		})
	}
	for (const [sizeLabel, bytes, missing] of [
		['17.2 MB', 17_215_011], ['one byte above bound', DEFAULT_CLIENT_SAFE_EMBED_BYTES + 1],
		['missing', undefined, true], ['undefined', undefined], ['zero', 0], ['negative', -1],
		['fractional', 1.5], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
		['NaN', NaN], ['Infinity', Infinity], ['negative Infinity', -Infinity],
		['null', null], ['numeric string', '1024'], ['empty string', ''], ['true', true], ['false', false],
		['array', [1024]], ['object', { bytes: 1024 }],
	]) {
		test(`${label}: ${sizeLabel} size stays download-link-only with no materializer resource hint`, () => {
			const f = fixture(shape, bytes, missing)
			const original = structuredClone(f.toolResult)
			const originalPayload = structuredClone(f.payload)
			assert.equal(savedPresentationResourceLink(f.payload), null)
			const result = withSavedPresentationResourceLink(f.toolResult, f.payload)
			assert.equal(result, f.toolResult, 'skipped hints must preserve the exact original transport object')
			assert.equal(result.content.length, 1)
			assert.ok(!result.content.some(item => item.type === 'resource_link'))
			assertPreserved(result, f, original)
			assert.deepEqual(f.payload, originalPayload)
		})
	}
}

test('explicit browser-link metadata for a large publication is not replaced by a resource_link', () => {
	const f = fixture(data => ({ ok: true, data: { ...data, mode: 'link', totalBytes: data.bytes,
		artifactExpiresAt: artifact.artifact.expiresAt, deliveryReason: 'requested-link' } }), 17_215_011)
	const original = structuredClone(f.toolResult)
	assert.equal(savedPresentationResourceLink(f.payload), null)
	const result = withSavedPresentationResourceLink(f.toolResult, f.payload)
	assertPreserved(result, f, original)
	assert.equal(result.structuredContent.data.mode, 'link')
	assert.equal(result.structuredContent.data.deliveryReason, 'requested-link')
	assert.equal(result.structuredContent.data.totalBytes, 17_215_011)
	assert.equal(result.content.length, 1)
})
