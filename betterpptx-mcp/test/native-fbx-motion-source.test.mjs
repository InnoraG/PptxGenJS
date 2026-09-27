import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { AnimationClip, AnimationMixer, Bone, Group, LoopOnce, NumberKeyframeTrack, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { nativeFbxMotionSource, nativeMotionObjectToGlb } from '../assets/native-fbx-motion-source.mjs'
import { parseGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'
import { fkJointTrajectories, meshRestBBox } from '../ir/synergy-geometry.mjs'
import { matchMixamoMotionBoneNames } from '../assets/mixamo-motion-bone-names.mjs'
import { ensureDefaultPresenterRegistered } from '../assets/default-presenter-roster.mjs'
import { getCachedGeneratedRigged3d } from '../assets/model3d-gen-providers.mjs'
import { applyStaticPoseFromSource } from '../assets/glb-static-pose-profile.mjs'

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deploy/model3d-worker/mocap/kinetic')
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
function fixture() {
  const root = new Group(), hip = new Bone(), head = new Bone()
  root.name = 'native-root'; root.rotation.y = .37; root.scale.setScalar(.01)
  hip.name = 'mixamorig8Hips'; hip.userData.originalName = 'mixamorig8:Hips'; hip.position.set(0, 100, 0)
  head.name = 'mixamorig8Head'; head.userData.originalName = 'mixamorig8:Head'; head.position.set(0, 60, 0)
  root.add(hip); hip.add(head); root.updateMatrixWorld(true)
  root.animations = [new AnimationClip('source-take', 1.25, [
    new QuaternionKeyframeTrack(`${hip.name}.quaternion`, [.125, .625, 1.25], [0, 0, 0, 1, -.1, 0, 0, -Math.sqrt(.99), .2, 0, 0, Math.sqrt(.96)]),
    new VectorKeyframeTrack(`${hip.name}.position`, [0, .5, 1.25], [0, 100, 0, 10, 90, 15, 25, 100, 35]),
  ])]
  return root
}
function accessor(parsed, index) {
  const a = parsed.json.accessors[index], v = parsed.json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, k) => parsed.bin.readFloatLE((v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || 4 * n) + k * 4)))
}
function boneNames(parsed) { return ['Hips', 'Head', 'LeftFoot', 'RightFoot'].map(suffix => parsed.json.nodes.find(node => node.name.endsWith(`:${suffix}`)).name) }
function poseStats(buffer) {
  const parsed = parseGlb(buffer), names = boneNames(parsed), trajectory = fkJointTrajectories(buffer, 0, 30, names)
  const gaps = trajectory.times.map((_, i) => trajectory.joints[names[1]][i][1] - (trajectory.joints[names[2]][i][1] + trajectory.joints[names[3]][i][1]) / 2)
  const hipRanges = [0, 1, 2].map(axis => { const values = trajectory.joints[names[0]].map(point => point[axis]); return Math.max(...values) - Math.min(...values) })
  return { parsed, trajectory, names, minimumHeadAboveFeet: Math.min(...gaps), invertedSamples: gaps.filter(value => value < 0).length, hipRanges }
}

test('native basis, original namespace, source clocks and root travel survive conversion', () => {
  const object = fixture(), before = object.toJSON(), result = nativeMotionObjectToGlb(object, { animationName: 'motion-source' }), parsed = parseGlb(result.buffer)
  assert.deepEqual(object.toJSON(), before)
  assert.deepEqual(parsed.json.nodes.map(node => node.name), ['native-root', 'mixamorig8:Hips', 'mixamorig8:Head'])
  assert.deepEqual(parsed.json.nodes[0].rotation, object.quaternion.toArray())
  assert.deepEqual(parsed.json.nodes[0].scale, [.01, .01, .01])
  assert.deepEqual(accessor(parsed, parsed.json.animations[0].samplers[0].input).flat(), [.125, .625, 1.25])
  assert.deepEqual(accessor(parsed, parsed.json.animations[0].samplers[1].output), [[0, 100, 0], [10, 90, 15], [25, 100, 35]])
  assert.equal(result.report.outputDurationMs, 1250)
  assert.equal(result.report.canonicalSkeletonRetarget, false)
  assert.equal(result.report.constructionBoundaryKeysAdded, false)
  assert(!parsed.json.meshes && !parsed.json.images && !parsed.json.materials)
})

test('hemisphere normalization preserves orientations without smoothing or adding keys', () => {
  const object = fixture(), result = nativeMotionObjectToGlb(object, { animationName: 'motion-source' }), parsed = parseGlb(result.buffer)
  const values = accessor(parsed, parsed.json.animations[0].samplers[0].output)
  assert.equal(values.length, 3)
  assert.equal(result.report.rotationHemisphereSignChanges, 1)
  const source = object.animations[0].tracks[0].values
  values.forEach((q, i) => assert(Math.abs(q.reduce((sum, value, k) => sum + value * source[i * 4 + k], 0)) > .999999))
  assert(values[1].reduce((sum, value, k) => sum + value * values[0][k], 0) > 0)
})

test('ambiguous takes, missing skeletons, duplicate names and unsupported tracks fail closed', () => {
  const multiple = fixture(); multiple.animations.push(multiple.animations[0].clone()); multiple.animations[1].name = 'other'
  assert.throws(() => nativeMotionObjectToGlb(multiple, { animationName: 'out' }), /unambiguous/)
  assert.equal(nativeMotionObjectToGlb(multiple, { animationName: 'out', sourceAnimationName: 'other' }).report.sourceAnimationName, 'other')
  const empty = new Group(); empty.animations = fixture().animations
  assert.throws(() => nativeMotionObjectToGlb(empty, { animationName: 'out' }), /skeletal bones/)
  const duplicate = fixture(); duplicate.children[0].children[0].userData.originalName = 'mixamorig8:Hips'
  assert.throws(() => nativeMotionObjectToGlb(duplicate, { animationName: 'out' }), /ambiguous/)
  const unsupported = fixture(); unsupported.animations[0].tracks.push(new NumberKeyframeTrack('mixamorig8Hips.visible', [0, 1.25], [1, 0]))
  assert.throws(() => nativeMotionObjectToGlb(unsupported, { animationName: 'out' }), /Unsupported skeletal/)
})

test('invalid clocks, nonunit rotations, shear and malformed input fail closed', () => {
  const clock = fixture(); clock.animations[0].tracks[0].times[1] = .125
  assert.throws(() => nativeMotionObjectToGlb(clock, { animationName: 'out' }), /strictly increasing/)
  const rotation = fixture(); rotation.animations[0].tracks[0].values[3] = 2
  assert.throws(() => nativeMotionObjectToGlb(rotation, { animationName: 'out' }), /normalized/)
  const shear = fixture(); shear.matrix.elements[4] += .5
  assert.throws(() => nativeMotionObjectToGlb(shear, { animationName: 'out' }), /Sheared/)
  assert.throws(() => nativeFbxMotionSource(Buffer.from('not fbx'), { animationName: 'out' }), /FBX motion import failed/)
  assert.throws(() => nativeFbxMotionSource(Buffer.alloc(16), { animationName: 'out', maximumInputBytes: 8 }), /input bound/)
})

for (const [file, expectedDuration, intentionalFlip, minimumTravel] of [
  ['Lifting.fbx', 7200, false, 0], ['Backflip.fbx', 4100, true, 0], ['Running Slide.fbx', 1533, false, 500],
]) test(`original ${file} pose oracle matches native source; no blanket inversion/travel suppression`, { skip: !fs.existsSync(path.join(sourceDir, file)) }, () => {
  const original = fs.readFileSync(path.join(sourceDir, file)), digest = hash(original)
  const converted = nativeFbxMotionSource(original, { animationName: 'native-motion' }), stats = poseStats(converted.buffer)
  assert.equal(hash(original), digest)
  assert.equal(hash(fs.readFileSync(path.join(sourceDir, file))), digest)
  assert.equal(converted.report.sourceDurationMs, expectedDuration)
  assert.equal(converted.report.outputDurationMs, expectedDuration)
  assert.equal(stats.minimumHeadAboveFeet < 0, intentionalFlip)
  assert(stats.hipRanges[2] >= minimumTravel)
  const source = new FBXLoader().parse(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength), '')
  const mixer = new AnimationMixer(source), action = mixer.clipAction(source.animations[0])
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play()
  const originalByName = new Map(); source.traverse(node => { originalByName.set(node.userData?.originalName || node.name, node) })
  let maximumError = 0
  for (const [index, time] of stats.trajectory.times.entries()) {
    mixer.setTime(time); source.updateMatrixWorld(true)
    for (const name of stats.names) {
      const expected = originalByName.get(name).getWorldPosition(new Vector3()).toArray(), actual = stats.trajectory.joints[name][index]
      maximumError = Math.max(maximumError, Math.hypot(...actual.map((value, axis) => value - expected[axis])))
    }
  }
  assert(maximumError < .0001, `Original native-axis pose drift: ${maximumError}`)
})

test('corrected lift retargets to all three current rig profiles without airborne feet or inversion', { skip: !fs.existsSync(path.join(sourceDir, 'Lifting.fbx')) }, () => {
  const source = nativeFbxMotionSource(fs.readFileSync(path.join(sourceDir, 'Lifting.fbx')), { animationName: 'lift' })
  for (const identity of ['joe', 'louise', 'pete']) {
    const registration = ensureDefaultPresenterRegistered(identity), base = getCachedGeneratedRigged3d(registration.hash), bytes = Buffer.from(base.glbBase64, 'base64'), before = hash(bytes)
    const matched = matchMixamoMotionBoneNames(source.buffer, bytes)
    const result = transplantMotionSet(bytes, [{ motionId: 'test-native-lift', outputSlug: 'test-native-lift', sourceSlug: 'lift', library: matched.buffer,
      rotationRetargetSpace: 'global', channelPolicy: 'root-motion', rootMotionSpace: 'world', rootMotionAnchor: 'start', rootMotionMaxStatures: .35, rootMotionMaxHorizontalStatures: .5 }], { targetRestProfile: base.retargetRestProfile })
    const posed = applyStaticPoseFromSource(result.glb, bytes, { clipName: '00_idle' }).buffer, stats = poseStats(posed), rest = meshRestBBox(posed)
    assert.equal(hash(bytes), before)
    assert.equal(stats.trajectory.durationMs, 7200)
    assert(stats.minimumHeadAboveFeet > .30 * rest.h, `${identity} must not invert`)
    for (const name of stats.names.slice(2)) {
      const ys = stats.trajectory.joints[name].map(point => point[1])
      assert(Math.max(...ys) - Math.min(...ys) < .02 * rest.h, `${identity}/${name} foot height drift`)
    }
    assert(result.retargetValidation.every(row => row.status === 'PASS' && row.maxParityErrorDegrees < .01))
  }
})
