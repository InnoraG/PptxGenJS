import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const JSZip = require('jszip')
const WAV_DATA = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1ZzWQAAAABJRU5ErkJggg=='

function wavSilence(durationMs = 1000) {
	const sampleRate = 22050
	const dataBytes = Math.round(sampleRate * 2 * durationMs / 1000)
	const bytes = Buffer.alloc(44 + dataBytes)
	bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write('WAVE', 8)
	bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36); bytes.writeUInt32LE(dataBytes, 40)
	return bytes
}

test('picture and media semantic source carriers survive native object construction', async () => {
	const jpegData = `data:image/jpeg;base64,${(await fs.readFile(path.resolve('demos/common/images/wiki-example.jpg'))).toString('base64')}`
	const validWavData = `data:audio/wav;base64,${wavSilence(1000).toString('base64')}`
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	const imageSource = { kind: 'asset', ref: 'asset://image/example', format: 'jpeg' }
	slide.addImage({
		data: jpegData, x: 0, y: 0, w: 1, h: 1,
		_authoredImageSource: imageSource,
		phType: 'pic', phIdx: 4, phSz: 'half', phOrient: 'vert',
	})
	const mediaSource = { kind: 'asset', ref: 'audio://artifact/example' }
	const mediaCover = { kind: 'asset', ref: 'asset://image/poster' }
	const mediaCommands = [{ type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(0.0)', trigger: 'withPrevious', delay: 250, duration: 1000 }]
	slide.addMedia({
		type: 'audio', data: validWavData, extn: 'wav', cover: PNG_DATA,
		x: 1, y: 0, w: 1, h: 1,
		_authoredMediaSource: mediaSource,
		_authoredMediaCover: mediaCover,
		_authoredMediaCommands: mediaCommands,
	})
	const picture = slide._slideObjects.find(object => object._type === 'image')
	const media = slide._slideObjects.find(object => object._type === 'media')
	assert.deepEqual(picture.options._authoredImageSource, imageSource)
	assert.equal(picture.options.phOrient, 'vert')
	assert.equal(media.options.type, 'audio')
	assert.equal(media.options.extn, 'wav')
	assert.deepEqual(media.options._authoredMediaSource, mediaSource)
	assert.deepEqual(media.options._authoredMediaCover, mediaCover)
	assert.deepEqual(media.options._authoredMediaCommands, mediaCommands)
	if (process.env.BETTERPPTX_MEDIA_PROOF_OUTPUT) {
		await fs.mkdir(path.dirname(process.env.BETTERPPTX_MEDIA_PROOF_OUTPUT), { recursive: true })
		await pptx.writeFile({ fileName: process.env.BETTERPPTX_MEDIA_PROOF_OUTPUT, compression: false })
	}
})

test('public current-spec readback emits portable image/media sources and exact command arrays', async () => {
	const {
		exportedImageBlockFieldsForTest,
		exportedMediaBlockFieldsForTest,
		publicSourceDescriptorForOptionsForTest,
	} = await import('../engine.mjs')
	assert.deepEqual(publicSourceDescriptorForOptionsForTest({ path: 'asset://image/example' }, 'image'), { kind: 'asset', ref: 'asset://image/example' })
	assert.deepEqual(publicSourceDescriptorForOptionsForTest({ path: 'C:\\private\\image.png' }, 'image'), { kind: 'maintainer-local' })
	assert.deepEqual(exportedImageBlockFieldsForTest({ options: {
		x: 1, y: 1, w: 2, h: 2,
		path: 'C:\\private\\cache.png',
		_authoredImageSource: { kind: 'asset', ref: 'asset://image/example', format: 'png' },
		rounding: true,
	} }), { imageOptions: {
		source: { kind: 'asset', ref: 'asset://image/example', format: 'png' },
		pictureAdjuncts: { rounding: true },
	} })
	const media = {
		mtype: 'audio',
		options: {
			x: 0, y: 0, w: 1, h: 1, type: 'audio', extn: 'wav', path: 'C:\\private\\voice.wav',
			_authoredMediaSource: { kind: 'asset', ref: 'audio://artifact/example' },
			_authoredMediaCommands: [
				{ type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(0.0)', trigger: 'withPrevious', delay: 0, duration: 1000 },
				{ type: 'media', effect: 'mediastop', mediaCommand: 'stop', trigger: 'afterPrevious', delay: 1000, duration: 1 },
			],
		},
	}
	assert.deepEqual(exportedMediaBlockFieldsForTest({ _animations: [] }, media), {
		mediaOptions: { type: 'audio', extn: 'wav', source: 'audio://artifact/example' },
		mediaCommandTiming: [
			{ command: 'playFrom(0.0)', trigger: 'withPrevious', delayMs: 0, durationMs: 1000 },
			{ command: 'stop', trigger: 'afterPrevious', delayMs: 1000, durationMs: 1 },
		],
	})
})

test('atomic media replacement retargets package parts and validates declared extensions before mutation', async () => {
	const { applyAtomicMediaPackagePatchForTest } = await import('../engine.mjs')
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addMedia({ type: 'audio', data: WAV_DATA, extn: 'wav', cover: PNG_DATA, x: 0, y: 0, w: 1, h: 1 })
	const media = slide._slideObjects.find(object => object._type === 'media')
	const originalTargets = slide._relsMedia.map(rel => rel.Target)
	await assert.rejects(
		() => applyAtomicMediaPackagePatchForTest(slide, media, { source: WAV_DATA, type: 'audio', extn: 'mp3' }),
		error => error?.code === 'MEDIA_REPLACEMENT_EXTENSION_MISMATCH',
	)
	assert.deepEqual(slide._relsMedia.map(rel => rel.Target), originalTargets, 'failed validation must not partially mutate relationships')
	await applyAtomicMediaPackagePatchForTest(slide, media, { source: WAV_DATA, type: 'audio', extn: 'wav' })
	const primary = slide._relsMedia.find(rel => rel.rId === media.mediaRid)
	const companion = slide._relsMedia.find(rel => rel.rId === media.mediaCompanionRid)
	assert.equal(primary.Target, companion.Target)
	assert.match(primary.Target, /\.wav$/)
	assert.equal(primary.type, 'audio/wav')
	assert.equal(companion.type, 'audio/wav')
	assert.equal(media.options.type, 'audio')
	assert.equal(media.options.extn, 'wav')
})

test('interactive playback reset removes only the target interactive sequence', async () => {
	const { removeRawInteractiveMediaTimingForTest } = await import('../engine.mjs')
	const slide = {
		_rawTimingXml: '<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tnLst>'
			+ '<p:seq><p:cTn id="1" nodeType="interactiveSeq"><p:childTnLst><p:cmd><p:cBhvr><p:tgtEl><p:spTgt spid="7"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:seq>'
			+ '<p:seq><p:cTn id="2" nodeType="interactiveSeq"><p:childTnLst><p:cmd><p:cBhvr><p:tgtEl><p:spTgt spid="9"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:seq>'
			+ '</p:tnLst></p:timing>',
	}
	const result = removeRawInteractiveMediaTimingForTest(slide, 7)
	assert.equal(result.removed, true)
	assert.doesNotMatch(result.xml, /spid="7"/)
	assert.match(result.xml, /spid="9"/)
})

test('public tools expose the closed image, media-command, and narration contracts', async () => {
	const { TOOLS } = await import('../tools.mjs')
	const byName = new Map(TOOLS.map(tool => [tool.name, tool]))
	const imageOptions = byName.get('betterpptx.slide.add_image').inputSchema.properties.options.properties
	assert.ok(Array.isArray(imageOptions.source.oneOf))
	assert.ok(Array.isArray(imageOptions.pictureAdjuncts.oneOf))
	const mediaOptions = byName.get('betterpptx.slide.add_media').inputSchema.properties.options.properties
	assert.ok(Array.isArray(mediaOptions.source.oneOf))
	const command = byName.get('betterpptx.slide.update_media').inputSchema.properties.mediaCommandTiming
	assert.ok(Array.isArray(command.oneOf))
	const narration = byName.get('betterpptx.slide.add_narration').inputSchema.properties.narration
	assert.ok(Array.isArray(narration.oneOf))
	const publicSchemas = JSON.stringify({ imageOptions, mediaOptions, command, narration })
	assert.doesNotMatch(publicSchemas, /filesystem|server path|relationship id|rId\d/i)
})

test('synthesized narration returns a reusable opaque audio artifact without provider internals', async t => {
	const { publicNarrationSynthesisResultForTest, resolveNarrationAudioReferenceForTest } = await import('../engine.mjs')
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-narration-artifact-'))
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
	const wavPath = path.join(tempRoot, 'voice.wav')
	await fs.writeFile(wavPath, wavSilence(1000))
	const result = publicNarrationSynthesisResultForTest({
		ok: true, wavPath, durationMs: 1000, provider: 'private-provider', voice: { id: 'voice-1' }, warnings: [], textHash: 'abc', ttsExecution: { runtime: 'private' },
	})
	assert.match(result.audio.ref, /^asset:\/\/locked\//)
	assert.equal(result.provider, undefined)
	assert.equal(result.ttsExecution, undefined)
	assert.equal(result.audio.path, undefined)
	const resolved = resolveNarrationAudioReferenceForTest(result.audio)
	assert.equal(typeof resolved.path, 'string')
	assert.equal(await fs.stat(resolved.path).then(stat => stat.isFile()), true)
})

test('public JSON spec compiles picture source and adjuncts to native XML, readback, and component reset', { timeout: 120000 }, async t => {
	const { createMcpToolDispatcher, exportedImageBlockFieldsForTest, getDeck, handleUpdateShapeForTest } = await import('../engine.mjs')
	const visiblePngData = `data:image/png;base64,${(await fs.readFile(path.resolve('demos/common/images/nyc-subway.png'))).toString('base64')}`
	const dispatcher = createMcpToolDispatcher({ sessionId: `picture-adjunct-contract-${Date.now()}` })
	const result = await dispatcher.call('betterpptx.deck.generate_from_spec', {
		phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'Picture adjunct contract proof', layout: 'LAYOUT_WIDE',
			authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
			contentStory: { audience: 'reviewers', outcome: 'Verify native picture adjuncts.', remember: 'Picture metadata remains editable.' },
			handshake: { audience: 'reviewers', promise: 'Prove picture adjuncts.', proof: ['Native picture XML and relationships.'], bar: 'Every adjunct survives native serialization.', commitments: ['native-picture'] },
			visualDesign: { world: 'Picture proof', framing: 'One linked picture.' },
			styleIntent: { artDirection: 'editorial', mode: 'light' },
			motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'without narration' },
			slides: [{
				id: 'picture-proof', title: 'Picture proof', role: 'proof', message: 'Picture adjuncts are native.', layoutIntent: 'statement',
				content: [{
					kind: 'image', name: 'picture', altText: 'Native picture adjunct proof.',
					source: { kind: 'inline', data: visiblePngData, format: 'png' },
					pictureAdjuncts: {
						rounding: true,
						hyperlink: { url: 'https://example.invalid/picture', tooltip: 'Picture details' },
						placeholder: { type: 'pic', idx: 3, size: 'half', orient: 'vert' },
					},
				}],
			}],
		},
	})
	assert.equal(result?.ok, true, JSON.stringify(result))
	const committed = result.data || result
	t.after(async () => { try { await dispatcher.call('betterpptx.deck.dispose', { deckId: committed.deckId }) } catch {} })
	const entry = getDeck(committed.deckId)
	const picture = entry.pptx.slides[0]._slideObjects.find(object => object?._type === 'image')
	assert.ok(picture)
	assert.deepEqual(picture.options._authoredImageSource, { kind: 'inline', data: visiblePngData, format: 'png' })
	assert.equal(picture.options.phType, 'pic')
	assert.equal(picture.options.phOrient, 'vert')
	assert.equal(picture.hyperlink.url, 'https://example.invalid/picture')
	assert.deepEqual(exportedImageBlockFieldsForTest(picture).imageOptions.pictureAdjuncts, {
		rounding: true,
		hyperlink: { url: 'https://example.invalid/picture', tooltip: 'Picture details' },
		placeholder: { type: 'pic', idx: 3, size: 'half', orient: 'vert' },
	})
	const initialZip = await JSZip.loadAsync(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
	const initialSlideXml = await initialZip.file('ppt/slides/slide1.xml').async('string')
	const initialRelsXml = await initialZip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.match(initialSlideXml, /<p:ph type="pic" sz="half" orient="vert" idx="3"\/>/)
	assert.match(initialSlideXml, /<a:hlinkClick r:id="rId\d+" tooltip="Picture details"\/>/)
	assert.match(initialRelsXml, /Target="https:\/\/example\.invalid\/picture"/)
	if (process.env.BETTERPPTX_PICTURE_PROOF_OUTPUT) {
		await fs.mkdir(path.dirname(process.env.BETTERPPTX_PICTURE_PROOF_OUTPUT), { recursive: true })
		await entry.pptx.writeFile({ fileName: process.env.BETTERPPTX_PICTURE_PROOF_OUTPUT, compression: false })
	}
	const oldHyperlinkRid = picture.hyperlink._rId
	await handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: picture.options.objectName }, patch: { pictureAdjuncts: null } })
	assert.equal(picture.hyperlink, undefined)
	assert.equal(picture.options.phType, undefined)
	assert.equal(picture.options.phOrient, undefined)
	assert.equal(picture.options.rounding, undefined)
	assert.equal(entry.pptx.slides[0]._rels.some(rel => Number(rel.rId) === Number(oldHyperlinkRid)), false)
	const resetZip = await JSZip.loadAsync(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
	const resetSlideXml = await resetZip.file('ppt/slides/slide1.xml').async('string')
	const resetRelsXml = await resetZip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.doesNotMatch(resetSlideXml, /<a:hlinkClick/)
	assert.doesNotMatch(resetSlideXml, /<p:pic>[\s\S]*?<p:ph\b/)
	assert.doesNotMatch(resetRelsXml, /example\.invalid\/picture/)
})

test('opaque narration attach, cue timing, autoplay, and full reset execute through the public semantic contract', { timeout: 120000 }, async t => {
	const { createMcpToolDispatcher, getDeck, normalizeNarrationProviderContractArgsForTest, publicNarrationSynthesisResultForTest, removeAuthoredNarrationFromSlideForTest } = await import('../engine.mjs')
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-narration-contract-'))
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
	const wavPath = path.join(tempRoot, 'voice.wav')
	await fs.writeFile(wavPath, wavSilence(1000))
	const artifact = publicNarrationSynthesisResultForTest({ ok: true, wavPath, durationMs: 1000, voice: { id: 'voice-1' }, warnings: [], textHash: 'abc' })
	const context = { sessionId: `media-narration-contract-${Date.now()}` }
	const dispatcher = createMcpToolDispatcher(context)
	const data = result => {
		assert.equal(result?.ok, true, JSON.stringify(result))
		return result.data || result
	}
	const committed = data(await dispatcher.call('betterpptx.deck.generate_from_spec', {
		phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'Narration provider contract proof', layout: 'LAYOUT_WIDE',
			authoringContract: {
				workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
				layerModel: 'flat-object-array', objectIdentity: 'stable-names-required',
			},
			contentStory: { audience: 'reviewers', outcome: 'Verify opaque narration attachment.', remember: 'Narration remains portable.' },
			handshake: { audience: 'reviewers', promise: 'Prove narration attachment.', proof: ['Native audio and cue timing.'], bar: 'The narrated cue is editable.', commitments: ['native-audio'] },
			visualDesign: { world: 'Narration proof', framing: 'One named metric.' },
			styleIntent: { artDirection: 'editorial', mode: 'light' },
			motionTime: { masterClock: 'narration-text', timingSource: 'attached audio', syncPolicy: 'one narration clock' },
			slides: [{
				id: 'proof', title: 'Narration proof', role: 'proof', message: 'The cue follows attached audio.', layoutIntent: 'title-body',
				content: [{ kind: 'textBox', name: 'metric', text: 'Metric' }],
				narration: {
					mode: 'attach', audioRef: artifact.audio.ref, text: 'Proof lands.', voiceId: 'voice-1',
					cues: [{ atMs: 0, target: 'metric', effect: 'pulse', durationMs: 300 }],
					timing: { paddingMs: 500, expectedDurationMs: 1000 },
					autoplay: { enabled: true, mode: 'present', loop: false },
				},
			}],
		},
	}))
	t.after(async () => { try { await dispatcher.call('betterpptx.deck.dispose', { deckId: committed.deckId }) } catch {} })
	const entry = getDeck(committed.deckId)
	assert.ok(entry.pptx.slides[0]._slideObjects.some(object => object?._type === 'media' && object.options?.isNarration === true))
	assert.equal(entry.pptx.slides[0].transition.advanceOnClick, false)
	assert.equal(entry.pptx.showSettings.showNarration, true)
	assert.equal(entry.narrationManifest.slides[0].cues, 1)
	assert.equal(entry.narrationManifest.slides[0].cueTimings[0].durationMs, 300)
	if (process.env.BETTERPPTX_NARRATION_PROOF_OUTPUT) {
		await fs.mkdir(path.dirname(process.env.BETTERPPTX_NARRATION_PROOF_OUTPUT), { recursive: true })
		await entry.pptx.writeFile({ fileName: process.env.BETTERPPTX_NARRATION_PROOF_OUTPUT, compression: false })
	}
	const resetArgs = normalizeNarrationProviderContractArgsForTest({ deckId: committed.deckId, slideIndex: 0, narration: null })
	const reset = removeAuthoredNarrationFromSlideForTest(resetArgs)
	assert.equal(reset.reset, true)
	assert.equal(entry.pptx.slides[0]._slideObjects.some(object => object?.options?.isNarration === true), false)
	assert.equal(entry.narrationManifest.slides.some(item => item.slideIndex === 0), false)
})
