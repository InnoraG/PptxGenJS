import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import JSZip from 'jszip'
import { NATIVE_MODEL_PREVIEW_SCHEMA_VERSION, readNativeModelPreviewBindings, nativeModelPreviewDescriptor } from '../quality/native3d-preview-artifacts.mjs'
import { readNative3dPreviewRequirements } from '../quality/native3d-preview-hydration.mjs'
import { sanitizePublicResult } from '../blackbox.mjs'

const digest = value => crypto.createHash('sha256').update(value).digest('hex')
async function fixture({ model = 'pose A exact bytes', view = '45', poster = 'poster A', x = 300, embed = 'rId3' } = {}) {
	// Package carrier fragments for metadata tests only, never a built deck.
	const zip = new JSZip()
	zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="rId9"/></p:sldIdLst><p:sldSz cx="1672" cy="941"/></p:presentation>')
	zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId9" Target="slides/slide9.xml"/></Relationships>')
	zip.file('ppt/slides/slide9.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d"><p:cSld><p:spTree><mc:AlternateContent><mc:Choice Requires="am3d"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="91" name="Louise"/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="260"/><a:ext cx="300" cy="492"/></p:xfrm><a:graphic><a:graphicData><am3d:model3d r:embed="${embed}"><am3d:camera fov="${view}"/><am3d:blip r:embed="rId4"/></am3d:model3d></a:graphicData></a:graphic></p:graphicFrame></mc:Choice><mc:Fallback><p:pic><p:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="260"/><a:ext cx="300" cy="492"/></a:xfrm></p:spPr></p:pic></mc:Fallback></mc:AlternateContent></p:spTree></p:cSld></p:sld>`)
	zip.file('ppt/slides/_rels/slide9.xml.rels', `<Relationships><Relationship Id="${embed}" Target="../media/model.glb"/><Relationship Id="rId4" Target="../media/poster.png"/></Relationships>`)
	zip.file('ppt/media/model.glb', model)
	zip.file('ppt/media/poster.png', poster)
	const bytes = await zip.generateAsync({ type: 'nodebuffer' })
	const requirements = await readNative3dPreviewRequirements(bytes, [0])
	return { bytes, requirements, binding: (await readNativeModelPreviewBindings(bytes, requirements)).get('0:91') }
}

test('native model preview binding follows exact pose/model bytes, view, and frame but not the replaced poster', async () => {
	const base = await fixture()
	assert.equal(base.binding.modelSha256, digest('pose A exact bytes'))
	assert.deepEqual((await fixture({ poster: 'matched replacement poster', embed: 'rId77' })).binding, base.binding)
	for (const changed of [{ model: 'pose B exact bytes' }, { view: '46' }, { x: 301 }]) assert.notEqual((await fixture(changed)).binding.bindingSha256, base.binding.bindingSha256)
	assert.equal(base.binding.objectName, 'Louise')
})

async function descriptorInput() {
	const source = await fixture()
	const pngSha256 = digest('verified transparent png bytes')
	return {
		packageSha256: digest(source.bytes), deckVersion: 2, slideIndex: 0, shapeId: 91,
		binding: { ...source.binding, filePath: 'D:/private/model.glb', modelXml: '<private />' },
		frameEmu: source.requirements.slides[0].targets[0].frameEmu, slideSizeEmu: source.requirements.slideSizeEmu,
		renderWidth: 1672, renderHeight: 941, imageWidth: 300, imageHeight: 492,
		asset: { digest: pngSha256, handle: `asset://locked/model3d-poster/${pngSha256}.png`, path: 'D:/private/render.png', provider: 'private worker' },
		artifact: { renderSha256: pngSha256, downloadUrl: 'https://example.test/download/opaque-id', downloadName: 'native-model.png', filePath: 'D:/private/render.png', artifact: { state: 'download_ready', expiresAt: '2026-09-03T00:00:00Z', privatePath: 'D:/private' } },
	}
}

test('public native model artifacts contain an opaque reusable poster and exact pixel frame, never private export data', async () => {
	const input = await descriptorInput()
	const descriptor = nativeModelPreviewDescriptor(input)
	assert.equal(descriptor.schemaVersion, NATIVE_MODEL_PREVIEW_SCHEMA_VERSION)
	assert.deepEqual(descriptor.pixelFrame, { x: 300, y: 260, w: 300, h: 492 })
	assert.equal(descriptor.posterAsset, input.asset.handle)
	assert.match(descriptor.objectId, /^object:\/\/native3d\/[a-f0-9]{32}$/)
	assert.match(descriptor.usage, /not a slide image or animation-playback proof/)
	for (const forbidden of ['filePath', 'privatePath', 'modelXml', 'D:/private', 'private worker']) assert.equal(JSON.stringify(descriptor).includes(forbidden), false)
	const priorMode = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	let publicResult
	try { publicResult = sanitizePublicResult({ ok: true, previews: [{ nativeModelPreviews: [descriptor] }] }) }
	finally { if (priorMode === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX; else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = priorMode }
	assert.equal(JSON.stringify(publicResult).includes('D:/private'), false)
	assert.equal(publicResult.previews[0].nativeModelPreviews[0].binding.contentSha256, input.binding.modelSha256)
	assert.equal(publicResult.previews[0].nativeModelPreviews[0].posterAsset, input.asset.handle)
	assert.deepEqual(publicResult.previews[0].nativeModelPreviews[0].pixelFrame, descriptor.pixelFrame)
	assert.equal(input.binding.filePath, 'D:/private/model.glb', 'projection does not mutate its private input')
	const staticDescriptor = nativeModelPreviewDescriptor({ ...input, appearanceEvidence: 'trusted-pose-view-frame-bound-poster' })
	assert.equal(staticDescriptor.appearance.liveHydration, 'unverified')
	assert.equal(staticDescriptor.appearance.playback, 'not-verified')
})

test('native model preview publication fails closed for mismatched bytes, local delivery, or a wrong-aspect image', async () => {
	const input = await descriptorInput()
	for (const changed of [
		{ ...input, artifact: { ...input.artifact, renderSha256: digest('different bytes') } },
		{ ...input, artifact: { ...input.artifact, downloadUrl: 'file:///D:/private/render.png' } },
		{ ...input, asset: { ...input.asset, handle: `asset://locked/model3d-poster/${digest('different bytes')}.png` } },
		{ ...input, imageWidth: 640, imageHeight: 640 },
	]) assert.throws(() => nativeModelPreviewDescriptor(changed), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
})

test('public preview schemas expose only a bounded optional model-image flag, no renderer paths or callbacks', async () => {
	const { TOOLS } = await import('../tools.mjs')
	for (const name of ['betterpptx.deck.preview', 'betterpptx.slide.preview']) {
		const tool = TOOLS.find(item => item.name === name)
		assert.equal(tool.inputSchema.properties.includeNativeModelPreviews.type, 'boolean')
		assert.equal(tool.inputSchema.properties.includeNativeModelPreviews.default, false)
		for (const forbidden of ['native3dRequirementsPath', 'outDir', 'pptxPath', 'filePath', 'exporter', 'trustedStaticPoster', 'native3dStaticAppearance', 'receipt']) assert.equal(Object.hasOwn(tool.inputSchema.properties, forbidden), false)
	}
})
