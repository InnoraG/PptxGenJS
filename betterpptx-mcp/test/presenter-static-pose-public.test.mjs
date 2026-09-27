import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { normalizeStaticPose, STATIC_POSE_PUBLIC_SCHEMA, model3dStaticPose, normalizeStaticPoseScene } from '../presenter-static-pose-contract.mjs'
import { prepareApprovedPresenterStaticPose } from '../assets/approved-presenter-static-pose.mjs'
import { applyRotationOnlyStaticPoseAtTime } from '../assets/glb-static-pose-at-time.mjs'
import { ensureDefaultPresenterRegistered } from '../assets/default-presenter-roster.mjs'
import { registerLocalRigged3d } from '../assets/model3d-gen-providers.mjs'
import { parseGlb } from '../ir/kinetic-transplant.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { expandPresenterDirective, expandCastDirective } from '../ir/presenter-director.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
const { createMcpToolDispatcher, getDeck, handleUpdateShapeForTest } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')

const POSE = Object.freeze({ motionId: 'motion.ordinary.point', timeMs: 926 })
const ORIGINAL = readFileSync(new URL('../assets/default-presenter-louise.glb', import.meta.url))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture(modelAsset, pose = POSE) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native stopped-pose proof', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Native presentation reviewers', outcome: 'Keep intentional presenter posture and original motion separate.', remember: 'Stopped posture is not a playback offset.' },
		visualDesign: { world: 'editorial', framing: 'One exact-pixel native presenter' },
		styleIntent: { artDirection: 'editorial', mode: 'dark' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [{ name: 'actor', kind: 'model3d', assetRef: modelAsset, purpose: 'Native presenter media, not slide artwork' }] },
		slides: [{ id: 'pose-proof', title: 'Native stopped posture', layoutIntent: 'title-only', content: [{
			kind: 'model3d', name: 'actor', modelAsset, ...(pose !== undefined ? { staticPose: pose } : {}),
			pixelFrame: { x: 1080, y: 170, w: 400, h: 650 }, scene: { animId: 3, length: 3625, loop: true },
			camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 }, trans: { rot: { ay: 0 } }, objViewport: 7878785,
			altText: 'Native presenter pointing toward editable slide content.',
		}] }],
	}
}

const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result?.error || result)); return result.data || result }
const makeMcp = () => createMcpToolDispatcher({ sessionId: `pose-${Date.now()}-${Math.random()}`, clientInfo: { name: 'static-pose-proof', version: '1' }, blackBox: true })
const create = (mcp, spec) => mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', detail: 'full', billingConfirmed: true, plan: 'premium' })

async function embeddedModel(deckId) {
	const pptx = getDeck(deckId).pptx
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const glbs = Object.values(zip.files).filter(file => !file.dir && file.name.endsWith('.glb'))
	assert.equal(glbs.length, 1, 'single-slot proof must embed exactly one native model')
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	assert.equal(doc.getElementsByTagName('am3d:model3d').length, 1)
	return { buffer: await glbs[0].async('nodebuffer'), xml, zip, object: pptx.slides[0]._slideObjects.find(item => item._type === 'model3d') }
}

test('closed public pose schemas retain pixel placement and refuse private/offset controls', () => {
	assert.deepEqual(normalizeStaticPose(POSE), POSE)
	assert.equal(normalizeStaticPose(null), null)
	for (const value of [{ ...POSE, playbackStartOffsetMs: 926 }, { ...POSE, _sourcePath: 'private' }, { ...POSE, timeMs: '926' }, { ...POSE, timeMs: Infinity }, { ...POSE, motionId: 'motion.kinetic.flying' }, { timeMs: 926 }]) assert.throws(() => normalizeStaticPose(value), error => error.code.startsWith('STATIC_POSE_'))
	assert.throws(() => model3dStaticPose({ staticPose: POSE, modelOptions: { staticPose: null } }), { code: 'STATIC_POSE_CONFLICT' })
	const specSchema = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec').inputSchema.properties.spec
	assert.deepEqual(specSchema.properties.presenter.properties.staticPose, STATIC_POSE_PUBLIC_SCHEMA)
	assert.ok(specSchema.properties.presenter.properties.pixelFrame)
	assert.deepEqual(specSchema.properties.slides.items.properties.presenter.properties.staticPose, STATIC_POSE_PUBLIC_SCHEMA)
	assert.ok(specSchema.properties.slides.items.properties.presenter.properties.pixelFrame)
	assert.deepEqual(specSchema.properties.slides.items.properties.content.items.properties.staticPose, STATIC_POSE_PUBLIC_SCHEMA)
	const portable = JSON.parse(readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
	assert.deepEqual(portable.$defs.presenterStaticPose.properties, STATIC_POSE_PUBLIC_SCHEMA.properties)
	assert.deepEqual(normalizeStaticPoseScene({ motionId: POSE.motionId, length: 3625, loop: false }, POSE), { motionId: POSE.motionId, animId: 3, length: 3625, loop: false })
	assert.throws(() => normalizeStaticPoseScene({ motionId: POSE.motionId, animId: 4 }, POSE), { code: 'STATIC_POSE_SCENE_CONFLICT' })
	assert.throws(() => normalizeStaticPoseScene({ motionId: POSE.motionId }, undefined), { code: 'STATIC_POSE_SCENE_UNSUPPORTED' })
})

test('adapter accepts exact approved assets only and keeps every binary byte and nonrotation field', () => {
	for (const identity of ['joe', 'louise', 'pete']) {
		const source = readFileSync(new URL(`../assets/default-presenter-${identity}.glb`, import.meta.url))
		const before = Buffer.from(source)
		const sampled = prepareApprovedPresenterStaticPose(source, POSE)
		assert.equal(sampled.identity, identity)
		// Match the approved mixed-bank adapter: passive root tracks are retained,
		// never sampled into or removed from the shared construction pose.
		assert.deepEqual(sampled.buffer, applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 3, timeMs: 926, allowPassiveRootMotion: true }).buffer)
		assert.deepEqual(source, before)
		const original = parseGlb(source), posed = parseGlb(sampled.buffer)
		assert.deepEqual(posed.bin, original.bin)
		for (const key of ['animations', 'accessors', 'bufferViews', 'skins', 'materials', 'meshes', 'textures', 'images']) assert.deepEqual(posed.json[key], original.json[key], key)
		for (let index = 0; index < original.json.nodes.length; index++) {
			const { rotation: _a, ...beforeNode } = original.json.nodes[index]
			const { rotation: _b, ...afterNode } = posed.json.nodes[index]
			assert.deepEqual(afterNode, beforeNode)
		}
		assert.equal(sampled.report.playbackStartOffsetApplied, false)
		assert.throws(() => prepareApprovedPresenterStaticPose(sampled.buffer, POSE), { code: 'STATIC_POSE_SOURCE_UNSUPPORTED' })
	}
	assert.throws(() => prepareApprovedPresenterStaticPose(ORIGINAL, { ...POSE, timeMs: 999999 }), { code: 'STATIC_POSE_TIME_INVALID' })
})

test('semantic deck/slide/cast pose forwarding preserves native size, camera and playback', () => {
	const presenter = { id: 'host', model: 'asset://approved-source', onSlides: 'all', clipMap: { point: 3 }, staticPose: POSE }
	const source = { presenter, slides: [0, 1, 2].map(index => ({ id: `slide-${index}`, role: 'agenda', title: 'Editable content', content: [], ...(index === 1 ? { presenter: { staticPose: null } } : index === 2 ? { presenter: { staticPose: { motionId: 'motion.ordinary.present', timeMs: 2726 } } } : {}) })) }
	const expanded = expandPresenterDirective(source)
	const baseline = structuredClone(source)
	delete baseline.presenter.staticPose
	baseline.slides.forEach(slide => delete slide.presenter)
	const unposed = expandPresenterDirective(baseline)
	assert.deepEqual(expanded.slides[0].content.find(item => item.kind === 'model3d').staticPose, POSE)
	assert.equal(expanded.slides[1].content.find(item => item.kind === 'model3d').staticPose, null)
	assert.equal(expanded.slides[2].content.find(item => item.kind === 'model3d').staticPose.timeMs, 2726)
	for (let index = 0; index < 3; index++) {
		const a = expanded.slides[index].content.find(item => item.kind === 'model3d'), b = unposed.slides[index].content.find(item => item.kind === 'model3d')
		for (const key of ['bbox', 'camera', 'trans', 'objViewport', 'scene', 'animation', 'modelAsset']) assert.deepEqual(a[key], b[key], key)
	}
	const cast = expandCastDirective({ presenters: { cast: [presenter] }, slides: [{ id: 'cast', title: 'Cast', content: [], scene: [{ actor: 'host', intent: 'point', staticPose: null }] }] })
	assert.equal(cast.slides[0].content[0].staticPose, null)
})

test('compiler rejects bank rebuilding before materialization and refuses unvalidated poses', () => {
	const direct = fixture('asset://locked/unavailable', POSE)
	assert.throws(() => buildSpecOperationPlan(direct), { code: 'STATIC_POSE_VALIDATION_REQUIRED' })
	const privateSource = structuredClone(direct)
	privateSource.slides[0].content[0].modelOptions = { glbFile: 'private-source' }
	assert.throws(() => buildSpecOperationPlan(privateSource, { validateStaticPose: () => ({}) }), /not part of the public Model 3-D contract/)
	direct.slides[0].content[0].nativePreservation = { handle: 'asset://locked/opaque-native/not-a-validation-bypass', mode: 'retain-unless-edited' }
	assert.throws(() => buildSpecOperationPlan(direct, { preserveSourceGeometry: true }), { code: 'STATIC_POSE_VALIDATION_REQUIRED' })
	for (const variation of ['kineticSelection', 'kinetic', 'interaction', 'static']) {
		const spec = fixture('asset://locked/unavailable', null)
		spec.presenter = { id: 'host', identity: 'louise', staticPose: POSE }
		if (variation === 'kineticSelection') spec.motionTime.kineticSelection = { presenters: [{ presenterId: 'host', selectedMotionIds: ['motion.ordinary.point'] }] }
		if (variation === 'kinetic') spec.presenter.kinetic = { clips: ['flying'] }
		if (variation === 'interaction') spec.slides[0].interactions = [{ actor: 'host', verb: 'point-at', target: 'actor' }]
		if (variation === 'static') spec.motionPolicy = 'static'
		assert.throws(() => buildSpecOperationPlan(spec), error => ['STATIC_POSE_BANK_REBUILD_UNSUPPORTED', 'STATIC_POSE_INTERACTION_UNSUPPORTED', 'STATIC_POSE_POLICY_UNSUPPORTED'].includes(error.code))
	}
})

test('public dryRun validates source/time without inserting a native object or trusting a manifest', async () => {
	const mcp = makeMcp()
	const source = ensureDefaultPresenterRegistered('louise')
	const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture(source.handle), phase: 'dryRun', detail: 'full' }))
	assert.equal(dry.mutationFree, true)
	assert.equal(dry.deckId, undefined)
	const semantic = fixture(source.handle)
	semantic.presenter = { id: 'host', identity: 'louise', pixelFrame: { x: 1080, y: 170, w: 400, h: 650 }, staticPose: POSE }
	semantic.slides[0].content = []
	semantic.slides[0].presenterMotion = { presenterId: 'host', motionId: 'motion.ordinary.point' }
	semantic.visualReference.mediaAssets = []
	const semanticDry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: semantic, phase: 'dryRun', detail: 'full' }))
	assert.equal(semanticDry.mutationFree, true)
	const invalidTime = await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture(source.handle, { ...POSE, timeMs: 999999 }), phase: 'dryRun' })
	assert.equal(invalidTime.ok, false)
	assert.match(JSON.stringify(invalidTime.error), /STATIC_POSE_TIME_INVALID/)
	const modified = Buffer.from(ORIGINAL)
	modified[modified.length - 1] ^= 1
	const forged = registerLocalRigged3d({ glbBase64: modified.toString('base64'), glbBytes: modified.length, manifest: { contract: 'betterpptx.default-presenter.v1', identity: 'louise' }, basisKey: 'static-pose-unapproved-fixture' })
	const rejected = await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture(forged.handle), phase: 'dryRun' })
	assert.equal(rejected.ok, false)
	assert.match(JSON.stringify(rejected.error), /STATIC_POSE_SOURCE_UNSUPPORTED/)
	assert.doesNotMatch(JSON.stringify([dry, invalidTime, rejected]), /_model3d|sourcePath|glb-static-pose|D:\\|C:\\|node_modules/)
})

test('one-slot public commit embeds sampled native pose; effective export replays and null resets original bytes', async () => {
	const mcp = makeMcp(), source = ensureDefaultPresenterRegistered('louise')
	const sourceDigest = sha(ORIGINAL)
	const committed = dataOf(await create(mcp, fixture(source.handle)))
	const native = await embeddedModel(committed.deckId)
	assert.deepEqual(native.buffer, prepareApprovedPresenterStaticPose(ORIGINAL, POSE).buffer)
	assert.deepEqual(native.object.options.staticPose, POSE)
	assert.equal(native.object.options._model3dStaticPoseReport.playbackStartOffsetApplied, false)
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
	const block = exported.spec.slides[0].content.find(item => item.kind === 'model3d')
	assert.ok(block, 'effective export must remain native model3d, not opaque fallback')
	assert.deepEqual(block.staticPose, POSE)
	assert.deepEqual(block.camera, native.object.options.camera)
	assert.equal(block.scene.motionId, POSE.motionId)
	assert.equal(block.scene.length, 3625)
	assert.equal(block.scene.animId, undefined, 'private numeric scene IDs stay redacted')
	assert.equal(block.nativePreservation, undefined, 'pose replay must use the validated semantic source, not an unchecked snapshot')
	assert.equal(exported.staticPoses[0].playbackStartOffsetApplied, false)
	assert.equal(block.modelAsset, `asset://locked/model3d-source/${sourceDigest}.glb`)
	assert.match(block.posterAsset, /^asset:\/\/locked\/model3d-poster\//)
	assert.doesNotMatch(JSON.stringify(exported), /_model3dSourceRef|_model3dStaticPoseReport|sourcePath|D:\\|C:\\|glb-static-pose/)
	const replay = dataOf(await create(mcp, exported.spec))
	const replayNative = await embeddedModel(replay.deckId)
	assert.deepEqual(replayNative.buffer, native.buffer)
	const timingXml = xml => new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('p:timing')[0]?.toString()
	assert.equal(timingXml(replayNative.xml), timingXml(native.xml), 'native playback timing and selected scene remain exact')
	for (const key of ['camera', 'trans', 'objViewport', 'scene']) assert.deepEqual(replayNative.object.options[key], native.object.options[key], key)
	const changedSpec = structuredClone(exported.spec)
	changedSpec.slides[0].content.find(item => item.kind === 'model3d').staticPose.timeMs = 1800
	const changed = dataOf(await create(mcp, changedSpec))
	const changedNative = await embeddedModel(changed.deckId)
	assert.deepEqual(changedNative.buffer, prepareApprovedPresenterStaticPose(ORIGINAL, { ...POSE, timeMs: 1800 }).buffer)
	assert.equal(timingXml(changedNative.xml), timingXml(native.xml), 'changing stopped frame never becomes a playback time offset')
	const resetSpec = structuredClone(exported.spec)
	resetSpec.slides[0].content.find(item => item.kind === 'model3d').staticPose = null
	const reset = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: committed.deckId, spec: resetSpec, phase: 'commit', commitMode: 'replaceDeck', detail: 'full', billingConfirmed: true, plan: 'premium' }))
	assert.deepEqual((await embeddedModel(reset.deckId)).buffer, ORIGINAL)
	assert.equal(sha(readFileSync(new URL('../assets/default-presenter-louise.glb', import.meta.url))), sourceDigest)
	await assert.rejects(() => handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: native.object.options.objectName }, patch: { staticPose: null } }), { code: 'STATIC_POSE_REBUILD_REQUIRED' })
})
