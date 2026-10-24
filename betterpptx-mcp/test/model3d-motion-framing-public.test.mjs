import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { MODEL3D_MOTION_FRAMING_PUBLIC_SCHEMA, normalizeModel3dMotionFraming, model3dMotionFraming } from '../model3d-motion-framing-contract.mjs'
import { MODEL3D_OPTIONS_PUBLIC_SCHEMA, MODEL3D_AUTHORING_CAPABILITY_CONTRACT, normalizeModel3dOptions } from '../model3d-authoring-family-contract.mjs'
import { computeModel3dMotionFraming } from '../ir/model3d-motion-framing.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { ensureDefaultPresenterRegistered } from '../assets/default-presenter-roster.mjs'
import { registerLocalRigged3d } from '../assets/model3d-gen-providers.mjs'
import { publicToolList } from '../blackbox.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
const { createMcpToolDispatcher, getDeck, handleUpdateShapeForTest } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')

const MODE = Object.freeze({ mode: 'selected-animation', paddingFraction: .12, yawDegrees: 30, fovDegrees: 42 })
const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result?.error || result)); return result.data || result }
const makeMcp = () => createMcpToolDispatcher({ sessionId: `motion-frame-${Date.now()}-${Math.random()}`, clientInfo: { name: 'motion-frame-proof', version: '1' }, blackBox: true })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture(modelAsset = 'asset://fixture-model', framing = MODE) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Selected-motion framing', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Presentation authors', outcome: 'Keep one selected action inside its native model frame.', remember: 'Framing is opt-in and does not change the source motion.' },
		visualDesign: { world: 'editorial', framing: 'One exact native model frame' },
		styleIntent: { artDirection: 'editorial', mode: 'dark' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [{ name: 'subject', kind: 'model3d', assetRef: modelAsset, purpose: 'Native model media' }] },
		slides: [{ id: 'motion-proof', title: 'A complete action', layoutIntent: 'title-only', content: [{
			kind: 'model3d', name: 'subject', modelAsset, pixelFrame: { x: 750, y: 150, w: 720, h: 650 },
			scene: { animId: 3, length: 3625, loop: false }, nativeOnly: true,
			...(framing !== undefined ? { motionFraming: framing } : {}), altText: 'One selected action inside an editable native frame.',
		}] }],
	}
}

test('closed public motion-framing schemas expose only semantic framing controls', () => {
	assert.deepEqual(normalizeModel3dMotionFraming(MODE), MODE)
	assert.equal(normalizeModel3dMotionFraming(null), null)
	assert.equal(normalizeModel3dMotionFraming(undefined), undefined)
	assert.deepEqual(MODEL3D_OPTIONS_PUBLIC_SCHEMA.properties.motionFraming, MODEL3D_MOTION_FRAMING_PUBLIC_SCHEMA)
	assert.ok(MODEL3D_AUTHORING_CAPABILITY_CONTRACT.overrideFields.includes('motionFraming'))
	const publicTools = publicToolList(TOOLS, { fullSchemas: true })
	const generate = publicTools.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	const schema = generate.inputSchema.properties.spec.properties.slides.items.properties.content.items.properties.motionFraming
	assert.equal(schema.additionalProperties, false)
	assert.deepEqual(Object.keys(schema.properties).sort(), ['fovDegrees', 'mode', 'paddingFraction', 'yawDegrees'])
	assert.doesNotMatch(JSON.stringify(schema), /animationIndex|animId|sampleRate|sourcePath|node_modules|geometryCoverage/)
	const portable = JSON.parse(readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
	assert.equal(portable.$defs.model3dOptions.properties.motionFraming.$ref, '#/$defs/model3dMotionFraming')
	assert.deepEqual(Object.keys(portable.$defs.model3dMotionFraming.properties).sort(), Object.keys(schema.properties).sort())
})

test('invalid controls, unsupported targets and conflicting owners reject explicitly', () => {
	for (const value of [false, [], {}, { mode: 'all-animations' }, { ...MODE, paddingFraction: 0 }, { ...MODE, fovDegrees: 121 }, { ...MODE, yawDegrees: .00002 }, { ...MODE, sampleRateHz: 60 }, { ...MODE, animationIndex: 0 }, { ...MODE, sourcePath: 'private' }]) assert.throws(() => normalizeModel3dMotionFraming(value), { code: 'MODEL3D_MOTION_FRAMING_INVALID' })
	assert.throws(() => model3dMotionFraming({ motionFraming: MODE, modelOptions: { motionFraming: null } }), { code: 'MODEL3D_MOTION_FRAMING_CONFLICT' })
	assert.throws(() => normalizeModel3dOptions({ motionFraming: MODE }), { code: 'MODEL3D_MOTION_FRAMING_SCENE_REQUIRED' })
	for (const scene of [null, {}, { animId: -1 }, { animId: .5 }, { animId: '0' }]) assert.throws(() => normalizeModel3dOptions({ motionFraming: MODE, scene }), { code: 'MODEL3D_MOTION_FRAMING_SCENE_REQUIRED' })
	for (const [key, value] of [['camera', {}], ['trans', {}], ['objViewport', 2500000], ['model3dViewPresetId', 'model3d-view-003']]) {
		const spec = fixture(); spec.slides[0].content[0][key] = value
		assert.throws(() => buildSpecOperationPlan(spec), { code: 'MODEL3D_MOTION_FRAMING_CONFLICT' })
	}
	const wrong = fixture(); wrong.slides[0].content[0].kind = 'shape'
	assert.throws(() => buildSpecOperationPlan(wrong), { code: 'MODEL3D_MOTION_FRAMING_TARGET_UNSUPPORTED' })
})

test('layout and compiler forward selected mode and aliases without injecting manual camera defaults', () => {
	for (const holder of ['top', 'modelOptions', 'model3dOptions']) {
		const spec = fixture(), block = spec.slides[0].content[0]
		if (holder !== 'top') { delete block.motionFraming; block[holder] = { motionFraming: MODE } }
		const operation = buildSpecOperationPlan(spec).operations.find(item => item.tool === 'betterpptx.slide.add_model3d')
		assert.deepEqual(operation.args.options.motionFraming, MODE, holder)
		assert.equal(operation.args.options.scene.animId, 3)
		for (const key of ['camera', 'trans', 'objViewport', 'model3dViewPresetId']) assert.equal(operation.args.options[key], undefined, `${holder}.${key}`)
	}
	const absent = fixture(); delete absent.slides[0].content[0].motionFraming
	const reset = fixture('asset://fixture-model', null)
	const options = spec => buildSpecOperationPlan(spec).operations.find(item => item.tool === 'betterpptx.slide.add_model3d').args.options
	const a = options(absent), b = options(reset)
	assert.equal(a.motionFraming, undefined); assert.equal(b.motionFraming, null)
	for (const key of ['camera', 'trans', 'objViewport', 'scene']) assert.deepEqual(a[key], b[key], key)
	const manual = fixture('asset://fixture-model', null); manual.slides[0].content[0].camera = { fov: 35 }
	assert.equal(options(manual).camera.fov, 35)
})

test('public dryRun validates only authorized selected models and keeps diagnostics private', async () => {
	const mcp = makeMcp(), source = ensureDefaultPresenterRegistered('joe')
	const spec = fixture(source.handle), block = spec.slides[0].content[0]
	block.staticPose = null; block.scene = { motionId: 'motion.ordinary.point', length: 3625, loop: false }
	const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', detail: 'full' }))
	assert.equal(dry.mutationFree, true); assert.equal(dry.deckId, undefined)
	const bad = fixture('asset://locked/unavailable-motion-model')
	const unavailable = await mcp.call('betterpptx.deck.generate_from_spec', { spec: bad, phase: 'dryRun' })
	assert.equal(unavailable.ok, false)
	assert.match(JSON.stringify(unavailable.error), /MODEL3D_MOTION_FRAMING_SOURCE_UNAVAILABLE/)
	const garbage = Buffer.from('not a model')
	const malformed = registerLocalRigged3d({ glbBase64: garbage.toString('base64'), glbBytes: garbage.length, basisKey: 'invalid-motion-framing-model' })
	const invalid = await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture(malformed.handle), phase: 'dryRun' })
	assert.equal(invalid.ok, false)
	assert.doesNotMatch(JSON.stringify([dry, unavailable, invalid]), /_model3dMotionFramingReport|sourceSha256|motionBounds|animationIndex|sourcePath|D:\\|C:\\|node_modules/)
})

test('public commit uses exact helper fields, exports intent, rebuilds replay and null reset, and rejects stale in-place edits', async () => {
	const mcp = makeMcp(), source = ensureDefaultPresenterRegistered('pete')
	const original = readFileSync(new URL('../assets/default-presenter-pete.glb', import.meta.url)), digest = sha(original)
	const spec = fixture(source.handle), block = spec.slides[0].content[0]
	block.staticPose = null; block.scene = { motionId: 'motion.ordinary.point', length: 3625, loop: false }
	const create = async requested => dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: requested, phase: 'commit', commitMode: 'createNew', detail: 'full', billingConfirmed: true, plan: 'premium' }))
	const committed = await create(spec)
	const native = getDeck(committed.deckId).pptx.slides[0]._slideObjects.find(item => item._type === 'model3d')
	assert.ok(native); assert.deepEqual(native.options.motionFraming, MODE)
	const expected = computeModel3dMotionFraming(original, { animationIndex: 3, frame: { w: native.options.w, h: native.options.h }, paddingFraction: .12, yawDegrees: 30, fovDegrees: 42 })
	for (const key of ['camera', 'trans', 'objViewport']) assert.deepEqual(native.options[key], expected[key], key)
	assert.equal(native.options._model3dMotionFramingReport.nativePlaybackVerified, false)
	const zip = await JSZip.loadAsync(await getDeck(committed.deckId).pptx.write({ outputType: 'nodebuffer', compression: false }))
	const embedded = Object.values(zip.files).find(file => file.name.endsWith('.glb'))
	assert.equal(sha(await embedded.async('nodebuffer')), digest)
	const xml = await zip.file('ppt/slides/slide1.xml').async('string'), doc = new DOMParser().parseFromString(xml, 'application/xml')
	assert.equal(Number(doc.getElementsByTagName('am3d:objViewport')[0].getAttribute('viewportSz')), expected.objViewport)
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
	const replayBlock = exported.spec.slides[0].content.find(item => item.kind === 'model3d')
	assert.deepEqual(replayBlock.motionFraming, MODE)
	for (const key of ['camera', 'trans', 'objViewport', 'nativePreservation']) assert.equal(replayBlock[key], undefined, key)
	assert.equal(replayBlock.scene.motionId, 'motion.ordinary.point'); assert.equal(replayBlock.scene.animId, undefined)
	assert.doesNotMatch(JSON.stringify(exported), /_model3dMotionFramingReport|sourceSha256|motionBounds|animationIndex|sourcePath|D:\\|C:\\|node_modules/)
	const replay = await create(exported.spec)
	const replayNative = getDeck(replay.deckId).pptx.slides[0]._slideObjects.find(item => item._type === 'model3d')
	for (const key of ['camera', 'trans', 'objViewport', 'motionFraming']) assert.deepEqual(replayNative.options[key], native.options[key], key)
	const stalePatch = structuredClone(exported.spec); stalePatch.slides[0].content.find(item => item.kind === 'model3d').motionFraming.paddingFraction = .2
	const patchResult = await mcp.call('betterpptx.deck.generate_from_spec', { deckId: committed.deckId, spec: stalePatch, phase: 'commit', commitMode: 'patch', detail: 'full', billingConfirmed: true, plan: 'premium' })
	assert.equal(patchResult.ok, false)
	assert.match(JSON.stringify(patchResult.error), /MODEL3D_MOTION_FRAMING_REBUILD_REQUIRED/)
	const reset = structuredClone(exported.spec); reset.slides[0].content.find(item => item.kind === 'model3d').motionFraming = null
	const resetResult = await create(reset), resetNative = getDeck(resetResult.deckId).pptx.slides[0]._slideObjects.find(item => item._type === 'model3d')
	assert.equal(resetNative.options.motionFraming, null); assert.equal(resetNative.options._model3dMotionFramingReport, undefined)
	for (const patch of [{ motionFraming: null }, { motionFraming: MODE }, { scene: { animId: 2 } }, { w: 2 }, { h: 3 }, { objViewport: 1 }, { camera: null }, { trans: {} }]) {
		await assert.rejects(() => handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: native.options.objectName }, patch }), { code: 'MODEL3D_MOTION_FRAMING_REBUILD_REQUIRED' })
	}
	assert.deepEqual(native.options.trans, expected.trans)
	const textObject = getDeck(committed.deckId).pptx.slides[0]._slideObjects.find(item => item._type === 'text')
	assert.ok(textObject)
	await assert.rejects(() => handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: textObject.options.objectName }, patch: { motionFraming: MODE } }), { code: 'MODEL3D_MOTION_FRAMING_TARGET_UNSUPPORTED' })
	assert.equal(sha(readFileSync(new URL('../assets/default-presenter-pete.glb', import.meta.url))), digest)
})
