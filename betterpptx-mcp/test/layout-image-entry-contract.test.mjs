import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	ADD_IMAGE_AUTHORING_CORE_SCHEMA,
	ADD_IMAGE_OPERATION_CONTRACT,
	ADD_IMAGE_OPERATION_ROW_ID,
	CLIPART_PLACEHOLDER_CONTRACT,
	CLIPART_PLACEHOLDER_ROW_ID,
	LAYOUT_IMAGE_ENTRY_PARTITION,
	normalizeClipArtPlaceholderDefinition,
	validateAddImageAuthoringCore,
} from '../layout-image-entry-contract.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { TOOLS } from '../tools.mjs'

const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAARklEQVR4nO3XQREAMAgDwSqIfwMRhwrqov3sgz8zQLg76ezPOhqIEdQSjjNcQRRRXM9ovOMFJIFkBaUDy5eYhJqVnM5zPb+Oa2yXkEs5uwAAAABJRU5ErkJggg=='

function dataOf(result, label = 'tool') {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function catalogEntry(family, id) {
	return publicBaselineCatalog({ family, includePlanned: true, limit: 500 }).entries.find(entry => entry.id === id)
}

test('clipArt and add-image rows are distinct exact executable contracts', () => {
	assert.deepEqual(LAYOUT_IMAGE_ENTRY_PARTITION, {
		unitId: 'impl-a-02816e2aae476494', rows: 2, runtimeReady: true,
	})
	assert.deepEqual(CLIPART_PLACEHOLDER_CONTRACT.rowIds, [CLIPART_PLACEHOLDER_ROW_ID])
	assert.deepEqual(ADD_IMAGE_OPERATION_CONTRACT.rowIds, [ADD_IMAGE_OPERATION_ROW_ID])
	assert.notEqual(CLIPART_PLACEHOLDER_CONTRACT.id, ADD_IMAGE_OPERATION_CONTRACT.id)
	assert.equal(CLIPART_PLACEHOLDER_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(ADD_IMAGE_OPERATION_CONTRACT.capabilityStatus, 'executable-exact-structured')

	const clipArt = catalogEntry('layouts-themes-masters', CLIPART_PLACEHOLDER_ROW_ID)
	const addImage = catalogEntry('media-images-avatar', ADD_IMAGE_OPERATION_ROW_ID)
	assert.equal(clipArt.family, 'layouts-themes-masters')
	assert.equal(clipArt.selection.semanticKind, 'layoutPlaceholder')
	assert.equal(addImage.family, 'media-images-avatar')
	assert.equal(addImage.selection.semanticKind, 'image')
	assert.equal(applyCatalogTruth(clipArt).capabilityStatus, 'executable-exact-structured')
	assert.equal(applyCatalogTruth(addImage).capabilityStatus, 'executable-exact-structured')
})

test('closed placeholder and add-image normalizers preserve idx zero and fail closed', () => {
	assert.deepEqual(normalizeClipArtPlaceholderDefinition({
		name: 'clip-zero', type: 'clipArt', idx: 0, size: 'half', hasCustomPrompt: true,
		x: 1, y: 1.2, w: 4, h: 3.5, margin: 0.1, text: 'Choose art',
	}), {
		name: 'clip-zero', type: 'clipArt', idx: 0, size: 'half', hasCustomPrompt: true,
		x: 1, y: 1.2, w: 4, h: 3.5, margin: 0.1, text: 'Choose art',
	})
	assert.equal(normalizeClipArtPlaceholderDefinition({ name: 'max', type: 'clipArt', idx: 4294967295 }).idx, 4294967295)
	assert.throws(() => normalizeClipArtPlaceholderDefinition({ name: 'overflow', type: 'clipArt', idx: 4294967296 }), /unsigned 32-bit/)
	assert.throws(() => normalizeClipArtPlaceholderDefinition({ name: 'wrong', type: 'pic' }), /must be clipArt/)
	assert.throws(() => normalizeClipArtPlaceholderDefinition({ name: 'office-noop', type: 'clipArt', orient: 'vert' }), /not applicable.*canonicalizes/i)
	assert.throws(() => normalizeClipArtPlaceholderDefinition({ name: 'unknown', type: 'clipArt', rawXml: '<p:ph\/>' }), /not part of the public/)

	const normalized = validateAddImageAuthoringCore({
		source: { kind: 'inline', data: PNG_DATA, format: 'png' },
		x: 1, y: 1, w: 4, h: 3, objectName: 'image-zero',
		sizing: { type: 'contain' },
		pictureAdjuncts: { rounding: true, placeholder: { type: 'clipArt', idx: 0, size: 'half', hasCustomPrompt: true } },
		imageAccessibility: { altText: 'One pixel proof' },
		imageAdjustments: { brightness: 0.1, saturation: 1.2, artisticEffect: { type: 'paintStrokes', intensity: 8, transparency: 0.2 } },
		pictureStylePresetId: 'picture-style-001',
		pictureStyle: { geometry: { preset: 'roundRect', adjustments: { adj: 0.2 } } },
	})
	assert.equal(normalized.pictureAdjuncts.placeholder.idx, 0)
	assert.equal(normalized.imageAdjustments.brightness, 0.1)
	assert.equal(normalized.imageAdjustments.artisticEffect.type, 'paintStrokes')
	assert.equal(ADD_IMAGE_AUTHORING_CORE_SCHEMA.additionalProperties, false)
	assert.throws(() => validateAddImageAuthoringCore({ source: null }), /cannot be null/)
	assert.throws(() => validateAddImageAuthoringCore({ source: { kind: 'inline', data: PNG_DATA }, privatePath: 'C:\\secret.png' }), /not part of the public/)
	assert.throws(() => validateAddImageAuthoringCore({ source: { kind: 'inline', data: PNG_DATA }, imageAdjustments: { brightness: 2 } }), /between -1 and 1/)
	assert.throws(() => validateAddImageAuthoringCore({ source: { kind: 'inline', data: PNG_DATA }, pictureStyle: { rawXml: '<a:spPr\/>' } }), /not a supported Picture Style field/)
})

test('public add-image tool exposes the same closed canonical source-first schema', () => {
	const tool = TOOLS.find(item => item.name === 'betterpptx.slide.add_image')
	assert.ok(tool)
	assert.ok(tool.inputSchema.required.includes('options'))
	assert.deepEqual(tool.inputSchema.properties.options.required, ['source'])
	assert.equal(tool.inputSchema.properties.options.additionalProperties, false)
	assert.deepEqual(tool.inputSchema.properties.options.properties.pictureStylePresetId.oneOf[1].enum.length, 28)
	assert.equal(tool.inputSchema.properties.options.properties.pictureStyle.oneOf[1].additionalProperties, false)
})

test('engine authors native clipArt carriers, semantic picture readback, reset, delete cleanup, and re-add', async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck, handleAddImageForTest, handleDeleteShapesForTest, handleUpdateShapeForTest } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `layout-image-entry-${Date.now()}`, blackBox: false })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Layout and image entry proof', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.' },
		contentStory: { audience: 'maintainers', outcome: 'Prove native clipArt and add-image contracts.', remember: 'Placeholder topology stays editable.' },
		handshake: { audience: 'maintainers', promise: 'Keep placeholder topology semantic.', proof: ['Native layout and picture bindings.'], bar: 'No stale relationships after delete.' },
		visualDesign: { world: 'Editorial', framing: 'One image proof', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FFFFFF', '0B1220', '38BDF8', '64748B', 'CBD5E1'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layouts: [{ name: 'CLIPART_LAYOUT', width: 13.333, height: 7.5, activate: true, placeholders: [{ name: 'clip-zero', type: 'clipArt', idx: 0, size: 'half', hasCustomPrompt: true, x: 0.7, y: 1.1, w: 5.2, h: 4.6, text: 'Choose artwork' }] }],
		masters: [{ title: 'CLIPART_MASTER', placeholders: [{ name: 'clip-seven', type: 'clipArt', idx: 7, size: 'quarter', hasCustomPrompt: false, x: 7.1, y: 1.4, w: 4.8, h: 3.2 }] }],
		slides: [{
			id: 'proof', title: 'Native clip art binding', message: 'The image and placeholder topology remain editable.', role: 'evidence', layoutIntent: 'title-body', layoutName: 'CLIPART_LAYOUT',
			content: [
				{ kind: 'title', name: 'title', text: 'Native clip art binding' },
				{
					kind: 'image', name: 'clipart-image-zero', region: 'hero',
					imageOptions: {
						source: { kind: 'inline', data: PNG_DATA, format: 'png' }, sizing: { type: 'contain' },
						pictureAdjuncts: { rounding: true, placeholder: { type: 'clipArt', idx: 0, size: 'half', hasCustomPrompt: true } },
						imageAccessibility: { altText: 'Clip art image proof' }, rotate: 12, flipH: true, transparency: 4,
						imageAdjustments: { brightness: 0.1 }, pictureStylePresetId: 'picture-style-001',
					},
				},
			],
		}],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
	const generated = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }), 'generate_from_spec')
	const deckId = generated.deckId
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layout-image-entry-'))
	try {
		let entry = getDeck(deckId)
		let picture = entry.pptx.slides[0]._slideObjects.find(obj => obj?._type === 'image' && obj?.options?._authoredImageSource)
		assert.ok(picture)
		const pictureName = picture.options.objectName
		assert.equal(picture.options.phIdx, 0)
		assert.equal(picture.options.phType, 'clipArt')
		assert.equal(picture.options.phOrient, undefined)
		assert.equal(picture.options.phHasCustomPrompt, true)

		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }), 'export_spec').spec
		const layout = exported.layouts.find(item => item.name === 'CLIPART_LAYOUT')
		const exportedMaster = exported.masters.find(item => item.title === 'CLIPART_MASTER')
		assert.deepEqual(Object.fromEntries(['name', 'type', 'idx', 'size', 'hasCustomPrompt', 'x', 'y', 'w', 'h', 'text'].map(key => [key, layout.placeholders[0][key]])), { name: 'clip-zero', type: 'clipArt', idx: 0, size: 'half', hasCustomPrompt: true, x: 0.7, y: 1.1, w: 5.2, h: 4.6, text: 'Choose artwork' })
		assert.equal(exportedMaster.placeholders[0].idx, 7)
		const imageBlock = exported.slides[0].content.find(block => block.name === 'clipart-image-zero' || block.imageOptions?.source)
		assert.equal(imageBlock.imageOptions.source.kind, 'inline')
		assert.equal(imageBlock.placeholderBinding.idx, 0)
		assert.equal(imageBlock.placeholderBinding.type, 'clipArt')
		assert.equal(imageBlock.imageOptions.pictureAdjuncts?.placeholder, undefined)

		const beforePath = path.join(tempDir, 'before-delete.pptx')
		await entry.pptx.writeFile({ fileName: beforePath, compression: false })
		const beforeZip = await JSZip.loadAsync(await fs.readFile(beforePath), { checkCRC32: true })
		const slideXml = await beforeZip.file('ppt/slides/slide1.xml').async('string')
		assert.match(slideXml, /<p:pic[\s\S]*?<p:ph[^>]*type="clipArt"[^>]*sz="half"[^>]*hasCustomPrompt="1"/)
		assert.doesNotMatch(slideXml.match(/<p:pic[\s\S]*?<\/p:pic>/)?.[0] || '', /<p:ph[^>]*(?:idx="0"|orient=|hasCustomPrompt="0")/)

		const ordinaryRelCount = entry.pptx.slides[0]._relsMedia.length
		await assert.rejects(() => handleUpdateShapeForTest({
			deckId, slideIndex: 0, target: { objectName: pictureName }, patch: { imageAdjustments: { saturation: 1.2 } },
		}), /HD Photo payload and visible preview must be replaced together/)
		assert.equal(entry.pptx.slides[0]._relsMedia.length, ordinaryRelCount)
		assert.deepEqual(picture.options.imageAdjustments, { brightness: 0.1, colorMode: 'normal' })

		dataOf(await handleAddImageForTest({
			deckId, slideIndex: 0,
			options: { source: { kind: 'inline', data: PNG_DATA, format: 'png' }, x: 5, y: 1, w: 2, h: 2, objectName: 'layered-picture', imageAdjustments: { artisticEffect: { type: 'paintStrokes', intensity: 8 } } },
		}), 'add layered image')
		const layered = entry.pptx.slides[0]._slideObjects.find(obj => obj?.options?.objectName === 'layered-picture')
		assert.ok(Number.isFinite(Number(layered.artisticEffectRid)))
		const layeredRel = entry.pptx.slides[0]._relsMedia.find(rel => Number(rel.rId) === Number(layered.artisticEffectRid))
		assert.equal(layeredRel.isArtisticEffectWdp, true)
		await assert.rejects(() => handleUpdateShapeForTest({
			deckId, slideIndex: 0, target: { objectName: 'layered-picture' }, patch: { imageAdjustments: null },
		}), /create\/recreate-only/)
		assert.equal(entry.pptx.slides[0]._relsMedia.includes(layeredRel), true)
		dataOf(await handleDeleteShapesForTest({ deckId, slideIndex: 0, target: { objectName: 'layered-picture' } }), 'delete layered image')

		dataOf(await handleUpdateShapeForTest({
			deckId, slideIndex: 0, target: { objectName: pictureName },
			patch: { pictureAdjuncts: { rounding: null, placeholder: null }, imageAdjustments: null, pictureStyle: null, rotate: null, flipH: null, transparency: null },
		}), 'update_shape reset')
		picture = getDeck(deckId).pptx.slides[0]._slideObjects.find(obj => obj?.options?.objectName === pictureName)
		assert.equal(picture.options.phType, undefined)
		assert.equal(picture.options.phIdx, undefined)
		assert.equal(picture.options.imageAdjustments, undefined)
		await assert.rejects(() => handleUpdateShapeForTest({
			deckId, slideIndex: 0, target: { objectName: pictureName }, patch: { source: { kind: 'inline', data: PNG_DATA } },
		}), /source is create-only/)

		dataOf(await handleDeleteShapesForTest({ deckId, slideIndex: 0, target: { objectName: pictureName } }), 'delete image')
		entry = getDeck(deckId)
		const deletedPath = path.join(tempDir, 'after-delete.pptx')
		await entry.pptx.writeFile({ fileName: deletedPath, compression: false })
		const deletedZip = await JSZip.loadAsync(await fs.readFile(deletedPath), { checkCRC32: true })
		assert.doesNotMatch(await deletedZip.file('ppt/slides/slide1.xml').async('string'), /<p:pic\b/)
		assert.equal(Object.keys(deletedZip.files).filter(name => /^ppt\/media\/image/i.test(name)).length, 0)

		dataOf(await handleAddImageForTest({
			deckId, slideIndex: 0,
			options: { source: { kind: 'inline', data: PNG_DATA, format: 'png' }, x: 1, y: 1, w: 2, h: 2, objectName: 'clipart-image-readded', pictureAdjuncts: { placeholder: { type: 'clipArt', idx: 7, size: 'quarter', hasCustomPrompt: false } } },
		}), 're-add image')
		assert.equal(getDeck(deckId).pptx.slides[0]._slideObjects.find(obj => obj?.options?.objectName === 'clipart-image-readded').options.phIdx, 7)
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
		await fs.rm(tempDir, { recursive: true, force: true })
	}
})
