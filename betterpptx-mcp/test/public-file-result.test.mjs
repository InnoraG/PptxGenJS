import test from 'node:test'
import assert from 'node:assert/strict'
import { savedPresentationResourceLink, withSavedPresentationResourceLink } from '../delivery/public-file-result.mjs'

const artifact = {
	downloadName: 'example.pptx',
	downloadUrl: 'https://presentations.example/files/opaque/example.pptx?permit=short-lived',
	packageSha256: 'a'.repeat(64),
	bytes: 22527,
}

test('a small successful saved artifact adds a standard, non-embedded resource link', () => {
	const result = withSavedPresentationResourceLink({ content: [{ type: 'text', text: 'saved' }] }, { ok: true, data: artifact })
	assert.equal(result.content.length, 2)
	assert.equal(result.content[1].type, 'resource_link')
	assert.equal(result.content[1].uri, artifact.downloadUrl)
	assert.equal(result.content[1].size, artifact.bytes)
	assert.equal(result.content[1].mimeType, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
})

test('owner-scoped operation recovery also exposes the refreshed link', () => {
	const link = savedPresentationResourceLink({ ok: true, data: { state: 'succeeded', result: artifact } })
	assert.equal(link?.name, 'example.pptx')
})

test('failed, incomplete, or unsafe artifact records do not become resource links', () => {
	assert.equal(savedPresentationResourceLink({ ok: false, data: artifact }), null)
	assert.equal(savedPresentationResourceLink({ ok: true, data: { ...artifact, packageSha256: '' } }), null)
	assert.equal(savedPresentationResourceLink({ ok: true, data: { ...artifact, downloadUrl: 'http://presentations.example/files/a.pptx' } }), null)
	assert.equal(savedPresentationResourceLink({ ok: true, data: { ...artifact, downloadUrl: 'https://presentations.example/files/a.txt' } }), null)
})
