import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	ADD_MEDIA_AUTHORING_CORE_SCHEMA,
	ADD_MEDIA_OPERATION_CONTRACT,
	ADD_MEDIA_OPERATION_ROW_ID,
	LAYOUT_MEDIA_ENTRY_PARTITION,
	UPDATE_MEDIA_OPTIONS_PATCH_SCHEMA,
	validateAddMediaAuthoringCore,
} from '../layout-media-entry-contract.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { TOOLS } from '../tools.mjs'

const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1ZzWQAAAABJRU5ErkJggg=='

function wavData(durationMs = 250) {
	const sampleRate = 8000
	const dataBytes = Math.round(sampleRate * 2 * durationMs / 1000)
	const bytes = Buffer.alloc(44 + dataBytes)
	bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write('WAVE', 8)
	bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36); bytes.writeUInt32LE(dataBytes, 40)
	return `data:audio/wav;base64,${bytes.toString('base64')}`
}

function dataOf(result, label = 'tool') {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function catalogEntry() {
	return publicBaselineCatalog({ family: 'media-images-avatar', includePlanned: true, limit: 500 })
		.entries.find(entry => entry.id === ADD_MEDIA_OPERATION_ROW_ID)
}

function minimalSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Add media proof', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.' },
		contentStory: { audience: 'maintainers', outcome: 'Prove add-media package lifecycle.', remember: 'Media remains editable.' },
		handshake: { audience: 'maintainers', promise: 'Preserve native media topology.', proof: ['Native media, poster, captions, and commands.'], bar: 'No stale package relationships.' },
		visualDesign: { world: 'Editorial', framing: 'One media proof', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FFFFFF', '0B1220', '38BDF8', '64748B', 'CBD5E1'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		slides: [{ id: 'proof', title: 'Native media', message: 'Package lifecycle proof.', role: 'evidence', layoutIntent: 'statement', content: [{ kind: 'textBox', name: 'survivor', text: 'Native media proof' }] }],
		validation: { validateBeforeSave: true, requireAccessibility: false },
	}
}

test('add-media row is one exact executable media contract', () => {
	assert.deepEqual(LAYOUT_MEDIA_ENTRY_PARTITION, {
		unitId: 'impl-a-19d4d833295297ea', rows: 1, runtimeReady: true,
	})
	assert.deepEqual(ADD_MEDIA_OPERATION_CONTRACT.rowIds, [ADD_MEDIA_OPERATION_ROW_ID])
	assert.equal(ADD_MEDIA_OPERATION_CONTRACT.capabilityStatus, 'executable-exact-structured')
	const entry = catalogEntry()
	assert.ok(entry)
	assert.equal(entry.family, 'media-images-avatar')
	assert.equal(entry.selection.semanticKind, 'media')
	assert.ok(entry.route.discovery.includes('betterpptx.assets.search_stock'))
	assert.equal(entry.route.exactSelection, 'betterpptx.deck.generate_from_spec')
	assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
})

test('closed source-first create contract validates type-specific media and fails closed', () => {
	const normalized = validateAddMediaAuthoringCore({
		type: 'audio', source: wavData(), extn: 'wav', cover: PNG_DATA,
		x: 1, y: 1, w: 3, h: 1, objectName: 'audio-proof', altText: 'Audio proof',
		interactivePlayback: false, mediaVolume: 64000,
		closedCaptionTracks: [{ language: 'en-US', label: 'English', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:00.250\nProof\n', default: true }],
		mediaCommandTiming: [{ command: 'playFrom(0)', trigger: 'withPrevious', delayMs: 10, durationMs: 250 }, { command: 'stop', trigger: 'afterPrevious', delayMs: 250 }],
	})
	assert.equal(normalized.type, 'audio')
	assert.equal(normalized.closedCaptionTracks[0].language, 'en-US')
	assert.equal(normalized.mediaCommandTiming.length, 2)
	assert.equal(ADD_MEDIA_AUTHORING_CORE_SCHEMA.additionalProperties, false)
	assert.equal(UPDATE_MEDIA_OPTIONS_PATCH_SCHEMA.additionalProperties, false)
	assert.throws(() => validateAddMediaAuthoringCore({ source: wavData() }), /type is required/)
	assert.throws(() => validateAddMediaAuthoringCore({ type: 'audio' }), /source is required/)
	assert.throws(() => validateAddMediaAuthoringCore({ type: 'audio', source: null }), /source cannot be null/)
	assert.throws(() => validateAddMediaAuthoringCore({ type: 'video', source: wavData() }), /MIME must agree/)
	assert.throws(() => validateAddMediaAuthoringCore({ type: 'online', source: 'asset:\/\/media\/private' }), /must be HTTPS/)
	assert.throws(() => validateAddMediaAuthoringCore({ type: 'audio', source: wavData(), showWhenStopped: true }), /only for video or online/)
	assert.throws(() => validateAddMediaAuthoringCore({ type: 'audio', source: wavData(), path: 'C:\\private.wav' }), /not part of the public/)
})

test('public add-media and sparse update tools expose separate closed schemas', () => {
	const add = TOOLS.find(item => item.name === 'betterpptx.slide.add_media')
	const update = TOOLS.find(item => item.name === 'betterpptx.slide.update_media')
	assert.ok(add)
	assert.ok(update)
	assert.ok(add.inputSchema.required.includes('options'))
	assert.deepEqual(add.inputSchema.properties.options.required, ['type', 'source'])
	assert.equal(add.inputSchema.properties.options.additionalProperties, false)
	assert.equal(add.inputSchema.properties.options.properties.path, undefined)
	assert.equal(add.inputSchema.properties.options.properties.link, undefined)
	assert.equal(add.inputSchema.properties.options.properties.data, undefined)
	assert.equal(update.inputSchema.properties.optionsPatch.additionalProperties, false)
	assert.equal(update.inputSchema.properties.optionsPatch.required, undefined)
	assert.equal(update.inputSchema.properties.optionsPatch.properties.source.type, undefined)
	assert.equal(update.inputSchema.properties.optionsPatch.properties.source.oneOf.some(branch => branch.type === 'null'), false)
	assert.equal(update.inputSchema.properties.optionsPatch.properties.type.type, 'string')
	assert.deepEqual(update.inputSchema.properties.optionsPatch.properties.type.enum, ['audio', 'video', 'online'])
})

test('JSON spec lowers nested mediaOptions and typed command timing into native media', { timeout: 120000 }, async t => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `layout-media-spec-${Date.now()}`, blackBox: false })
	const spec = minimalSpec()
	spec.slides[0].content.push({
		kind: 'media', name: 'spec-audio', altText: 'Spec audio proof',
		mediaOptions: {
			type: 'audio', source: wavData(120), extn: 'wav', cover: PNG_DATA,
			interactivePlayback: false, mediaVolume: 72000,
		},
		mediaCommandTiming: { command: 'playFrom(0)', trigger: 'withPrevious', durationMs: 120 },
	})
	const generated = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }), 'generate media spec')
	t.after(async () => { try { await mcp.call('betterpptx.deck.dispose', { deckId: generated.deckId }) } catch {} })
	const slide = getDeck(generated.deckId).pptx.slides[0]
	const media = slide._slideObjects.find(obj => obj?._type === 'media')
	assert.ok(media)
	assert.equal(media.options.altText, 'Spec audio proof')
	assert.equal(media.options.type, 'audio')
	assert.equal(media.options.mediaVolume, 72000)
	assert.match(media.options._authoredMediaSource?.data || '', /^data:audio\/wav;base64,/)
	assert.equal(slide._animations.filter(record => record?.target === media).length, 1)
})

test('engine authors, reads back, resets, serializes, deletes, and re-adds native media without stale package state', { timeout: 120000 }, async t => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck, handleAddMediaForTest, handleDeleteShapesForTest, handleUpdateMediaForTest } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `layout-media-entry-${Date.now()}`, blackBox: false })
	const generated = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: minimalSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }), 'generate_from_spec')
	const deckId = generated.deckId
	t.after(async () => { try { await mcp.call('betterpptx.deck.dispose', { deckId }) } catch {} })

	dataOf(await handleAddMediaForTest({
		deckId, slideIndex: 0,
		options: {
			type: 'audio', source: wavData(), extn: 'wav', cover: PNG_DATA,
			x: 1, y: 2, w: 3, h: 1, objectName: 'audio-proof', altText: 'Audio proof',
			sizing: { type: 'contain' }, transparency: 8, rounding: true,
			interactivePlayback: false, mediaVolume: 64000,
			closedCaptionTracks: [{ language: 'en-US', label: 'English', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:00.250\nProof\n', default: true }],
			mediaCommandTiming: [{ command: 'playFrom(0)', trigger: 'withPrevious', delayMs: 10, durationMs: 250 }, { command: 'stop', trigger: 'afterPrevious', delayMs: 250 }],
		},
	}), 'add_media')

	let entry = getDeck(deckId)
	let slide = entry.pptx.slides[0]
	let media = slide._slideObjects.find(obj => obj?._type === 'media' && obj?.options?.objectName === 'audio-proof')
	assert.ok(media)
	assert.equal(media.options.altText, 'Audio proof')
	assert.equal(media.options.closedCaptionTracks.length, 1)
	assert.equal(slide._animations.filter(record => record?.target === media).length, 2)

	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }), 'export_spec').spec
	const mediaBlock = exported.slides[0].content.find(block => block.mediaOptions?.source)
	assert.equal(mediaBlock.mediaOptions.type, 'audio')
	assert.match(mediaBlock.mediaOptions.source, /^data:audio\/wav;base64,/)
	assert.equal(mediaBlock.mediaOptions.closedCaptionTracks[0].language, 'en-US')
	assert.equal(mediaBlock.mediaCommandTiming.length, 2)

	const beforeZip = await JSZip.loadAsync(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const beforeSlideXml = await beforeZip.file('ppt/slides/slide1.xml').async('string')
	const beforeRelsXml = await beforeZip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.match(beforeSlideXml, /p173:tracksInfo/)
	assert.match(beforeSlideXml, /descr="Audio proof"/)
	assert.match(beforeRelsXml, /2017\/04\/relationships\/track/)
	assert.ok(Object.keys(beforeZip.files).some(name => /\.vtt$/i.test(name)))
	if (process.env.BETTERPPTX_MEDIA_ENTRY_PROOF_OUTPUT) {
		await entry.pptx.writeFile({ fileName: process.env.BETTERPPTX_MEDIA_ENTRY_PROOF_OUTPUT, compression: false })
	}

	await assert.rejects(
		handleUpdateMediaForTest({ deckId, slideIndex: 0, target: { objectName: 'audio-proof' }, optionsPatch: { showWhenStopped: true } }),
		/only for video or online media/,
	)

	const customCover = media.options.cover
	dataOf(await handleUpdateMediaForTest({ deckId, slideIndex: 0, target: { objectName: 'audio-proof' }, optionsPatch: { cover: null, transparency: 0, rounding: false } }), 'update_media reset')
	media = getDeck(deckId).pptx.slides[0]._slideObjects.find(obj => obj?.options?.objectName === 'audio-proof')
	assert.match(media.options.cover, /^data:image\/png;base64,/)
	assert.notEqual(media.options.cover, customCover)
	assert.equal(media.options._authoredMediaCover, undefined)
	assert.ok(getDeck(deckId).pptx.slides[0]._relsMedia.some(rel => Number(rel.rId) === Number(media.mediaCoverRid)))

	entry = getDeck(deckId)
	slide = entry.pptx.slides[0]
	const ownedRids = new Set([media.mediaRid, media.mediaCompanionRid, media.mediaCoverRid, ...media.options.closedCaptionTracks.map(track => track.rId)].map(Number).filter(Number.isFinite))
	const ownedTargets = slide._relsMedia.filter(rel => ownedRids.has(Number(rel.rId))).map(rel => path.posix.normalize(`ppt/slides/${rel.Target}`))
	dataOf(await handleDeleteShapesForTest({ deckId, slideIndex: 0, target: { objectName: 'audio-proof' } }), 'delete media')
	assert.equal(slide._slideObjects.some(obj => obj?.options?.objectName === 'audio-proof'), false)
	assert.equal(slide._relsMedia.some(rel => ownedRids.has(Number(rel.rId))), false)
	assert.equal(slide._animations.some(record => record?.target === media), false)

	const deletedZip = await JSZip.loadAsync(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	for (const target of ownedTargets) assert.equal(deletedZip.file(target), null, `deleted media part remains: ${target}`)
	assert.doesNotMatch(await deletedZip.file('ppt/slides/slide1.xml').async('string'), /descr="Audio proof"/)

	dataOf(await handleAddMediaForTest({ deckId, slideIndex: 0, options: { type: 'audio', source: wavData(100), extn: 'wav', x: 1, y: 2, w: 2, h: 1, objectName: 'audio-proof-readded' } }), 're-add media')
	assert.ok(slide._slideObjects.some(obj => obj?._type === 'media' && obj?.options?.objectName === 'audio-proof-readded'))
})

test('captioned narration reset removes primary, companion, poster, and WebVTT package ownership', { timeout: 120000 }, async t => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck, mediaRelationshipIdsForTest, removeSlideNarrationForTest } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `captioned-narration-reset-${Date.now()}`, blackBox: false })
	const generated = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: minimalSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }), 'generate narration reset deck')
	const deckId = generated.deckId
	t.after(async () => { try { await mcp.call('betterpptx.deck.dispose', { deckId }) } catch {} })

	const entry = getDeck(deckId)
	const slide = entry.pptx.slides[0]
	slide.addMedia({
		type: 'audio', data: wavData(120), extn: 'wav', cover: PNG_DATA,
		x: 1, y: 2, w: 2, h: 1, objectName: 'narration-audio-s1', isNarration: true,
		closedCaptionTracks: [{ language: 'en-US', label: 'English', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:00.120\nNarration\n', default: true }],
	})
	const narration = slide._slideObjects.find(obj => obj?.options?.objectName === 'narration-audio-s1')
	assert.ok(narration)
	const ownedRids = mediaRelationshipIdsForTest(narration)
	assert.equal(ownedRids.length, 4)
	assert.ok(ownedRids.includes(Number(narration.options.closedCaptionTracks[0].rId)))
	assert.equal(removeSlideNarrationForTest(slide), 1)
	assert.equal(slide._relsMedia.some(rel => ownedRids.includes(Number(rel.rId))), false)

	const zip = await JSZip.loadAsync(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	assert.equal(Object.keys(zip.files).some(name => /\.(?:vtt|wav)$/i.test(name)), false)
	assert.doesNotMatch(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'), /relationships\/(?:track|audio|media)/)
})
