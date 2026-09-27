import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

import { chooseDefaultPresenter, ensureDefaultPresenterRegistered, resolveDefaultPresenterContacts } from '../assets/default-presenter-roster.mjs'
import { applyStaticPoseProfile, assertPowerPointSafeStaticPose } from '../assets/glb-static-pose-profile.mjs'
import { getCachedGeneratedRigged3d, materializeAuthoringMotionPresenter } from '../assets/model3d-gen-providers.mjs'
import { parseGlb } from '../ir/kinetic-transplant.mjs'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const assetPath = identity => fileURLToPath(new URL(`../assets/default-presenter-${identity}.glb`, import.meta.url))
const armNames = Object.freeze({
	left: { shoulder: 'mixamorig:LeftShoulder', hand: 'mixamorig:LeftHand' },
	right: { shoulder: 'mixamorig:RightShoulder', hand: 'mixamorig:RightHand' },
})

async function armDrop(buffer) {
	const document = await io.readBinary(Buffer.from(buffer))
	const byName = new Map(document.getRoot().listNodes().map(node => [node.getName(), node]))
	const y = name => Number(byName.get(name)?.getWorldMatrix()?.[13])
	return Object.fromEntries(Object.entries(armNames).map(([side, names]) => [side, y(names.shoulder) - y(names.hand)]))
}

function readFloatRows(json, bin, accessorIndex) {
	const accessor = json.accessors[accessorIndex]
	const view = json.bufferViews[accessor.bufferView]
	const width = accessor.type === 'VEC4' ? 4 : (accessor.type === 'VEC3' ? 3 : 1)
	const stride = view.byteStride || width * 4
	const start = Number(view.byteOffset || 0) + Number(accessor.byteOffset || 0)
	return Array.from({ length: accessor.count }, (_, row) => Array.from({ length: width }, (_, column) => bin.readFloatLE(start + row * stride + column * 4)))
}

function rotationTracks(buffer, animationName) {
	const parsed = parseGlb(buffer)
	const animation = parsed.json.animations.find(item => item.name === animationName)
	assert.ok(animation, `animation ${animationName} is missing`)
	return new Map(animation.channels
		.filter(channel => channel.target.path === 'rotation')
		.map(channel => {
			const sampler = animation.samplers[channel.sampler]
			return [parsed.json.nodes[channel.target.node].name, readFloatRows(parsed.json, parsed.bin, sampler.output)]
		}))
}

function quaternionDistanceDegrees(a, b) {
	const dot = Math.min(1, Math.abs(a.reduce((sum, value, index) => sum + value * b[index], 0)))
	return 2 * Math.acos(dot) * 180 / Math.PI
}

test('Joe ships with an idle display base pose and motion materialization preserves it', async () => {
	const raw = readFileSync(assetPath('joe'))
	const registered = ensureDefaultPresenterRegistered('joe')
	const base = getCachedGeneratedRigged3d(registered.hash)

	assert.equal(Buffer.from(base.glbBase64, 'base64').equals(raw), true, 'registration must serve the PowerPoint-verified roster bytes exactly')
	assert.equal(base.manifest.staticPoseProfile, 'post-bake-source-animation-frame')
	assert.equal(base.manifest.staticPoseProfileVersion, 'idle-frame0-v1')
	assert.equal(base.manifest.staticPoseClipName, '00_idle')

	const request = {
		baseGlbBase64: base.glbBase64,
		retargetRestProfile: base.retargetRestProfile,
		selectedMotionIds: ['motion.ordinary.greet'],
		previewBase64: base.previewBase64,
		license: base.license,
	}
	const baseline = materializeAuthoringMotionPresenter({ ...request, baseHash: `${registered.hash}-baseline` })
	const posed = materializeAuthoringMotionPresenter({
		...request,
		baseHash: `${registered.hash}-posed`,
		staticPoseClipName: base.manifest.staticPoseClipName,
		staticPoseProfileVersion: base.manifest.staticPoseProfileVersion,
	})
	const baselineAsset = getCachedGeneratedRigged3d(baseline.hash)
	const posedAsset = getCachedGeneratedRigged3d(posed.hash)
	const baselineGlb = Buffer.from(baselineAsset.glbBase64, 'base64')
	const posedGlb = Buffer.from(posedAsset.glbBase64, 'base64')
	const baselinePackage = parseGlb(baselineGlb)
	const posedPackage = parseGlb(posedGlb)

	assert.equal(baselinePackage.bin.equals(posedPackage.bin), true, 'post-bake static posing must not alter mesh, skin, inverse-bind, or animation accessor bytes')
	const baselineDrop = await armDrop(baselineGlb)
	const posedDrop = await armDrop(posedGlb)
	assert.ok(baselineDrop.left > 0.2 && baselineDrop.right > 0.2, `the unprofiled bundle must retain the zoom-safe idle base pose: ${JSON.stringify(baselineDrop)}`)
	assert.ok(posedDrop.left > 0.2 && posedDrop.right > 0.2, `the post-bake profile should lower both hands: ${JSON.stringify(posedDrop)}`)
	assert.ok(Math.abs(posedDrop.left - baselineDrop.left) < 1e-6 && Math.abs(posedDrop.right - baselineDrop.right) < 1e-6, 'reapplying the idle profile should be idempotent')
	assert.equal(posedAsset.manifest.staticPoseProfile, 'post-bake-source-animation-frame')
	assert.equal(posedAsset.manifest.staticPoseProfileVersion, 'idle-frame0-v1')
	assert.equal(posedAsset.manifest.staticPoseClipName, '00_idle')
	assert.equal(posedAsset.manifest.staticPoseSampleTimeMs, 0)
	assert.ok(posedAsset.manifest.staticPoseChangedNodeChannels > 0)
	assert.equal((await io.readBinary(posedGlb)).getRoot().listAnimations().length, 1)
})

test('Louise receives the same idle display pose contract as Joe while keeping the matte material profile', async () => {
	const raw = readFileSync(assetPath('louise'))
	const sourceSignature = createHash('sha256').update(raw).digest('hex')
	const motionContract = JSON.parse(readFileSync(new URL('../assets/default-presenter-motion-contract.json', import.meta.url), 'utf8'))
	const expectedContacts = resolveDefaultPresenterContacts(raw, motionContract)
	const contactProfileKey = expectedContacts.some(contact => contact.contactPolicy)
		? `:rotation-peak-v1:${createHash('sha256').update(JSON.stringify(expectedContacts)).digest('hex').slice(0, 16)}`
		: ''
	const expectedBasis = `default-presenter.v4:louise:${sourceSignature.slice(0, 16)}:mixamo-dielectric-v4:idle-frame0-v1:none${contactProfileKey}`
	const expectedHash = createHash('sha256').update(`local:${expectedBasis}`).digest('hex').slice(0, 40)
	const registered = ensureDefaultPresenterRegistered('louise')
	const cached = getCachedGeneratedRigged3d(registered.hash)

	assert.equal(registered.hash, expectedHash)
	assert.deepEqual(cached.manifest.contacts, expectedContacts)
	assert.equal(Buffer.from(cached.glbBase64, 'base64').equals(raw), true)
	assert.equal(cached.manifest.materialProfileVersion, 'mixamo-dielectric-v4')
	assert.equal(cached.manifest.staticPoseProfile, 'post-bake-source-animation-frame')
	assert.equal(cached.manifest.staticPoseProfileVersion, 'idle-frame0-v1')
	assert.equal(cached.manifest.staticPoseClipName, '00_idle')
	const shippedDrop = await armDrop(Buffer.from(cached.glbBase64, 'base64'))
	assert.ok(shippedDrop.left > 0.2 && shippedDrop.right > 0.2, `Louise's shipped idle pose should lower both hands: ${JSON.stringify(shippedDrop)}`)

	const posed = materializeAuthoringMotionPresenter({
		baseGlbBase64: cached.glbBase64,
		retargetRestProfile: cached.retargetRestProfile,
		baseHash: `${registered.hash}-posed`,
		selectedMotionIds: ['motion.ordinary.greet'],
		previewBase64: cached.previewBase64,
		license: cached.license,
		staticPoseClipName: cached.manifest.staticPoseClipName,
		staticPoseProfileVersion: cached.manifest.staticPoseProfileVersion,
	})
	const posedAsset = getCachedGeneratedRigged3d(posed.hash)
	const drop = await armDrop(Buffer.from(posedAsset.glbBase64, 'base64'))
	assert.ok(drop.left > 0.2 && drop.right > 0.2, `Louise's post-bake idle pose should lower both hands: ${JSON.stringify(drop)}`)
})

test('Pete is a governed matte, zoom-safe presenter and is selected for terrain and worksite topics', async () => {
	const registered = ensureDefaultPresenterRegistered('pete')
	const cached = getCachedGeneratedRigged3d(registered.hash)
	const selected = chooseDefaultPresenter({
		title: 'Terrain construction safety briefing',
		objective: 'Coordinate civil infrastructure crews at the worksite',
	})

	assert.equal(registered.identity, 'pete')
	assert.equal(cached.manifest.materialProfile, 'mixamo-dielectric-strict-matte')
	assert.equal(cached.manifest.materialProfileVersion, 'mixamo-dielectric-v4')
	assert.equal(cached.manifest.relativeCastHeight, 1.0012537)
	assert.equal(selected.identity, 'pete')
	const drop = await armDrop(Buffer.from(cached.glbBase64, 'base64'))
	assert.ok(drop.left > 0.2 && drop.right > 0.2, `Pete's shipped idle pose should lower both hands: ${JSON.stringify(drop)}`)
})

test('the replaced emphasize clip keeps its authored 5.2 second tempo on all presenters', () => {
	for (const identity of ['joe', 'louise', 'pete']) {
		const parsed = parseGlb(readFileSync(assetPath(identity)))
		const animation = parsed.json.animations?.find(item => item.name === '04_emphasize')
		assert.ok(animation, `${identity} emphasize clip is missing`)
		const durationMs = Math.round(1000 * Math.max(...animation.samplers.map(sampler => Number(parsed.json.accessors[sampler.input].max[0]))))
		assert.equal(durationMs, 5200, `${identity} emphasize tempo drifted`)
	}
})

test('the standalone static-pose helper changes only JSON node transforms', async () => {
	const raw = readFileSync(assetPath('joe'))
	const before = parseGlb(raw)
	const posed = applyStaticPoseProfile(raw)
	const after = parseGlb(posed.buffer)
	const drop = await armDrop(posed.buffer)

	assert.equal(before.bin.equals(after.bin), true)
	assert.equal(posed.clipName, '00_idle')
	assert.equal(posed.clipIndex, 0)
	assert.equal(posed.sampleTimeMs, 0)
	assert.ok(drop.left > 0.2 && drop.right > 0.2)
})

test('PowerPoint presenter outputs fail closed on a T-pose and accept the profiled idle pose', () => {
	const tPoseSource = readFileSync(fileURLToPath(new URL('../assets/presenter-source-joe-static.glb', import.meta.url)))
	assert.throws(
		() => assertPowerPointSafeStaticPose(tPoseSource, { label: 'Joe retargeting source' }),
		error => error?.code === 'POWERPOINT_TPOSE_FORBIDDEN',
	)
	const neutral = assertPowerPointSafeStaticPose(readFileSync(assetPath('joe')), { label: 'Joe PowerPoint presenter' })
	assert.ok(neutral.armDropRatio.left > neutral.requiredMinimumArmDropRatio && neutral.armDropRatio.right > neutral.requiredMinimumArmDropRatio)
})

test('authoring retargeting uses the private bind profile without changing the governed greet', () => {
	const registered = ensureDefaultPresenterRegistered('joe')
	const cached = getCachedGeneratedRigged3d(registered.hash)
	const generated = materializeAuthoringMotionPresenter({
		baseGlbBase64: cached.glbBase64,
		retargetRestProfile: cached.retargetRestProfile,
		baseHash: `${registered.hash}-retarget-regression`,
		selectedMotionIds: ['motion.ordinary.greet'],
		staticPoseClipName: cached.manifest.staticPoseClipName,
		staticPoseProfileVersion: cached.manifest.staticPoseProfileVersion,
	})
	const generatedBuffer = Buffer.from(getCachedGeneratedRigged3d(generated.hash).glbBase64, 'base64')
	const expected = rotationTracks(readFileSync(assetPath('joe')), '02_greet')
	const actual = rotationTracks(generatedBuffer, '00_motion.ordinary.greet')
	let worstDegrees = 0
	for (const [bone, expectedRows] of expected) {
		const actualRows = actual.get(bone)
		assert.equal(actualRows?.length, expectedRows.length, `${bone} key count drifted`)
		for (let index = 0; index < expectedRows.length; index++) {
			worstDegrees = Math.max(worstDegrees, quaternionDistanceDegrees(expectedRows[index], actualRows[index]))
		}
	}
	assert.ok(worstDegrees < 0.1, `retargeting changed the governed greet by ${worstDegrees.toFixed(4)} degrees`)
})
