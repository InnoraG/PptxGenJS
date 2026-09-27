import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { test } from 'node:test'

import { authoringMotionById, publicAuthoringMotionCatalog, resolveAuthoringMotionSelection } from '../ir/authoring-motion-catalog.mjs'
import { extractRetargetRestProfile, parseGlb } from '../ir/kinetic-transplant.mjs'
import { governedAuthoringMotionSelection, governedAuthoringMotionSources } from '../assets/authoring-motion-sources.mjs'
import { getCachedGeneratedRigged3d, materializeAuthoringMotionPresenter } from '../assets/model3d-gen-providers.mjs'

const motionIds = ['motion.kinetic.drop-to-landing', 'motion.kinetic.superhero-landing']
const bytes = name => fs.readFileSync(new URL(`../assets/${name}`, import.meta.url))
function decode(asset, index) {
	const accessor = asset.json.accessors[index], view = asset.json.bufferViews[accessor.bufferView]
	const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type]
	return Array.from({ length: accessor.count }, (_, frame) => Array.from({ length: width }, (_, axis) => asset.bin.readFloatLE((view.byteOffset || 0) + (accessor.byteOffset || 0) + frame * (view.byteStride || width * 4) + axis * 4)))
}
function angle(a, b) {
	const norm = row => row.map(value => value / Math.hypot(...row))
	a = norm(a); b = norm(b)
	return 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, value, index) => sum + value * b[index], 0)))) * 180 / Math.PI
}
function build(identity) {
	const base = bytes(`default-presenter-${identity}.glb`)
	const options = { baseGlbBase64: base.toString('base64'), baseHash: createHash('sha256').update(base).digest('hex'), retargetRestProfile: extractRetargetRestProfile(bytes(`presenter-source-${identity}-static.glb`)), selectedMotionIds: motionIds, staticPoseClipName: '00_idle' }
	const result = materializeAuthoringMotionPresenter(options)
	const entry = getCachedGeneratedRigged3d(result.hash)
	return { base: parseGlb(base), asset: parseGlb(Buffer.from(entry.glbBase64, 'base64')), result, options }
}

test('landing identities resolve their hash-governed native take without exposing private source details', () => {
	const registry = governedAuthoringMotionSources(), source = registry.sources.find(item => item.motionIds.includes(motionIds[0]))
	assert.ok(source)
	const original = bytes('kinetic-clips.glb')
	assert.equal(createHash('sha256').update(original).digest('hex'), '0b24cf525add356daf1acb9900e24e204874eaf036344547516071673bfe7876', 'the prior frozen source pool remains untouched')
	for (const motionId of motionIds) {
		const selection = governedAuthoringMotionSelection(motionId)
		assert.equal(createHash('sha256').update(selection.library).digest('hex'), source.sha256)
		assert.equal(selection.channelPolicy, 'root-motion')
		assert.equal(selection.rotationRetargetSpace, 'global')
		const parsed = parseGlb(selection.library), clip = parsed.json.animations.find(animation => animation.name === selection.sourceSlug)
		const times = decode(parsed, clip.samplers[0].input).flat()
		assert.ok(Math.abs(times.at(-1) - 1.1) < 1e-6, 'the corrected landing is the approved 1.1-second take')
		assert.equal(authoringMotionById(motionId).privateEvidence.resolvedSource.sha256, source.sha256)
	}
	assert.equal(resolveAuthoringMotionSelection(motionIds).sourceResolutionFingerprint, registry.fingerprint)
	assert.equal(governedAuthoringMotionSelection('motion.ordinary.walk'), null, 'unrelated source selections retain their existing route')
	const publicCatalog = JSON.stringify(publicAuthoringMotionCatalog({ family: 'motion', limit: 500 }))
	for (const privateText of ['resolvedSource', 'sourceSlug', 'privateEvidence', 'kinetic-landing-native-v1', '.glb']) assert.ok(!publicCatalog.includes(privateText))
})

for (const identity of ['joe', 'louise']) test(`corrected landing retargets into the requested ${identity} skin and retains its static geometry`, () => {
	const { base, asset, result, options } = build(identity)
	assert.deepEqual(asset.json.nodes, base.json.nodes)
	assert.deepEqual(asset.json.skins, base.json.skins)
	assert.deepEqual(asset.json.meshes, base.json.meshes)
	assert.equal(asset.json.animations.length, motionIds.length)
	for (const [index, animation] of asset.json.animations.entries()) {
		assert.equal(result.motionIdToAnimId[motionIds[index]], index)
		assert.ok(animation.channels.some(channel => channel.target.path === 'translation' && asset.json.nodes[channel.target.node].name === 'mixamorig:Hips'), 'bounded source root movement survives source resolution')
		for (const joint of ['Hips', 'RightShoulder', 'LeftShoulder', 'LeftUpLeg', 'RightToeBase']) assert.ok(animation.channels.some(channel => channel.target.path === 'rotation' && asset.json.nodes[channel.target.node].name === `mixamorig:${joint}`), `${joint} is retargeted into this presenter's own hierarchy`)
		for (const sampler of animation.samplers) assert.ok(decode(asset, sampler.output).flat().every(Number.isFinite))
	}
	const first = asset.json.animations[0], second = asset.json.animations[1]
	for (const channel of first.channels) {
		const counterpart = second.channels.find(other => other.target.node === channel.target.node && other.target.path === channel.target.path)
		assert.ok(counterpart)
		assert.deepEqual(decode(asset, first.samplers[channel.sampler].output), decode(asset, second.samplers[counterpart.sampler].output), 'semantic aliases select the same designated source take')
	}
	const cached = materializeAuthoringMotionPresenter(options)
	assert.equal(cached.cached, true)
	assert.equal(cached.handle, result.handle)
})

test('full-body impact pose agrees with the approved source, including shoulders, thigh, and toe', () => {
	const { asset } = build('joe'), animation = asset.json.animations[0]
	// Frozen normalized-phase evidence from the user-approved v5 landing, at
	// source t=.6s where the old retarget differed by up to 82 degrees.
	const expected = {
		RightShoulder: [.6447895765304565, -.3038104176521301, .6055690050125122, .3538810610771179],
		LeftShoulder: [.6376785039901733, .33584919571876526, -.57228684425354, .3912278115749359],
		LeftUpLeg: [.04318765178322792, -.6600825786590576, -.7491515874862671, .03460827097296715],
		RightToeBase: [.5865105390548706, .08088935166597366, -.04795658960938454, .8044641017913818],
	}
	for (const [joint, rotation] of Object.entries(expected)) {
		const channel = animation.channels.find(item => item.target.path === 'rotation' && asset.json.nodes[item.target.node].name === `mixamorig:${joint}`), sampler = animation.samplers[channel.sampler]
		const times = decode(asset, sampler.input).flat(), index = times.findIndex(time => Math.abs(time - .6) < 1e-6)
		assert.ok(index >= 0)
		assert.ok(angle(decode(asset, sampler.output)[index], rotation) < .0001, `${joint} preserves the approved impact posture`)
	}
})
