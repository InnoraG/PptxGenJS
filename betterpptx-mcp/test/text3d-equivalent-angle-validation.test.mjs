import assert from 'node:assert/strict'
import test from 'node:test'

import JSZip from 'jszip'
import PptxGenJS from '../../dist/pptxgen.cjs.js'

function presentation(rotationY) {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addText('Equivalent angle', {
		x: 1,
		y: 1,
		w: 4,
		h: 1,
		objectName: `rotation-${String(rotationY)}`,
		text3D: { rotationY },
	})
	return pptx
}

async function slideXml(rotationY) {
	const pptx = presentation(rotationY)
	const bytes = await pptx.write({ outputType: 'nodebuffer' })
	const zip = await JSZip.loadAsync(bytes)
	return zip.file('ppt/slides/slide1.xml').async('string')
}

test('strict validation accepts a legal negative Text3D angle and records its effective equivalent', () => {
	const result = presentation(-10).validate({ mode: 'strict', checks: ['content', 'repair'] })
	const normalization = result.issues.find(issue => issue.code === 'TEXT3D_ROTATION_NORMALIZED')

	assert.equal(result.valid, true)
	assert.equal(result.errorCount, 0)
	assert.equal(normalization?.severity, 'info')
	assert.deepEqual(
		{
			requested: normalization?.context?.requested,
			normalized: normalization?.context?.normalized,
			effective: normalization?.context?.effective,
		},
		{ requested: -10, normalized: 350, effective: 350 },
	)
})

test('-10 and 350 serialize to the same Text3D rotation', async () => {
	const [negativeXml, canonicalXml] = await Promise.all([slideXml(-10), slideXml(350)])
	const rotation = xml => xml.match(/<a:rot[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*\brev="([^"]+)"/)
	const negativeRotation = rotation(negativeXml)
	const canonicalRotation = rotation(canonicalXml)

	assert.ok(negativeRotation, 'negative-angle package must contain native Text3D rotation XML')
	assert.ok(canonicalRotation, 'canonical-angle package must contain native Text3D rotation XML')
	assert.deepEqual(negativeRotation.slice(1), canonicalRotation.slice(1))
	assert.equal(presentation(350).validate({ mode: 'strict', checks: ['content', 'repair'] }).valid, true)
})

test('invalid and non-finite Text3D rotations remain strict blockers', () => {
	for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 'not-an-angle']) {
		const result = presentation(value).validate({ mode: 'strict', checks: ['content', 'repair'] })
		assert.equal(result.valid, false, String(value))
		assert.ok(result.issues.some(issue => issue.code === 'INVALID_TEXT3D_ROTATION' && issue.severity === 'error'), String(value))
	}
})
