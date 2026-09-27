import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three'
import { compareSkeletalMotionPoses, sampleGlbSkeletalMotion, sampleObjectSkeletalMotion } from '../assets/skeletal-motion-pose-proof.mjs'
import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const landmarks = { root: 'Pelvis', head: 'Crown', leftFoot: 'SoleL', rightFoot: 'SoleR' }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const q = angle => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle).toArray()
const anglesFor = type => type === 'flip' ? [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI] : type === 'corrupted' ? [0, .2, Math.PI, .2, 0] : [0, .2, .4, .2, 0]

// Independent hand-authored binary fixture: no production FBX converter,
// transplant, or shared FK code creates the reference animation.
function glbFixture({ type = 'grounded', angles = anglesFor(type), durationSeconds = 2, frameScale = 1, frameRotation = [0, 0, 0, 1], frameTranslation = [0, 0, 0], interpolation = 'LINEAR', nodeNames = Object.values(landmarks) } = {}) {
  const times = angles.map((_, index) => index / (angles.length - 1) * durationSeconds)
  const rotations = angles.flatMap(q), bin = Buffer.alloc((times.length + rotations.length) * 4)
  times.forEach((value, index) => bin.writeFloatLE(value, index * 4))
  rotations.forEach((value, index) => bin.writeFloatLE(value, times.length * 4 + index * 4))
  return serializeGlb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'SceneFrame', scale: [frameScale, frameScale, frameScale], rotation: frameRotation, translation: frameTranslation, children: [1] },
      { name: nodeNames[0], translation: [0, 1, 0], children: [2, 3, 4] },
      { name: nodeNames[1], translation: [0, 1, 0] },
      { name: nodeNames[2], translation: [-.25, -1, 0] },
      { name: nodeNames[3], translation: [.25, -1, 0] },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: times.length * 4 }, { buffer: 0, byteOffset: times.length * 4, byteLength: rotations.length * 4 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: times.length }, { bufferView: 1, componentType: 5126, type: 'VEC4', count: times.length }],
    animations: [{ name: 'FixtureMotion', channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }], samplers: [{ input: 0, output: 1, interpolation }] }],
  }, bin)
}

function objectFixture({ type = 'grounded', scale = 1, rotation = [0, 0, 0, 1], translation = [0, 0, 0] } = {}) {
  const group = new Group(); group.name = 'SourceFrame'; group.scale.setScalar(scale); group.quaternion.fromArray(rotation); group.position.fromArray(translation)
  const hips = new Bone(); hips.name = 'Pelvis'; hips.position.set(0, 1, 0)
  const head = new Bone(); head.name = 'Crown'; head.position.set(0, 1, 0)
  const left = new Bone(); left.name = 'SoleL'; left.position.set(-.25, -1, 0)
  const right = new Bone(); right.name = 'SoleR'; right.position.set(.25, -1, 0)
  hips.add(head, left, right); group.add(hips)
  const angles = anglesFor(type)
  group.animations = [new AnimationClip('OriginalTake', 2, [new QuaternionKeyframeTrack('Pelvis.quaternion', [0, .5, 1, 1.5, 2], angles.flatMap(q))])]
  group.updateMatrixWorld(true)
  return group
}

const sample = (buffer, options = {}) => sampleGlbSkeletalMotion(buffer, { landmarks, animationIndex: 0, ...options })

test('independent source-object and GLB samplers preserve the full clip endpoint and agree', () => {
  const object = objectFixture(), inputPose = object.toJSON(), bytes = glbFixture(), beforeHash = hash(bytes)
  const source = sampleObjectSkeletalMotion(object, { landmarks }), target = sample(bytes)
  const report = compareSkeletalMotionPoses(source, target, { heightEnvelopeTolerance: 1e-6, landmarkEnvelopeTolerance: 1e-6 })
  assert.equal(report.status, 'PASS')
  assert.equal(report.source.durationMs, 2000)
  assert.equal(target.timesMs[0], 0)
  assert.equal(target.timesMs.at(-1), 2000)
  assert.equal(target.frames.at(-1).head[1], 2)
  assert.equal(hash(bytes), beforeHash)
  assert.deepEqual(object.toJSON(), inputPose, 'sampling never mutates or advances the caller object')
})

test('grounded source rejects newly introduced foot-over-head inversion', () => {
  const source = sampleObjectSkeletalMotion(objectFixture(), { landmarks }), target = sample(glbFixture({ type: 'corrupted' }))
  const report = compareSkeletalMotionPoses(source, target)
  assert.equal(report.status, 'FAIL')
  const failure = report.failures.find(row => row.code === 'UNEXPECTED_INVERSION')
  assert.ok(failure.sampleCount > 1)
  assert.equal(failure.worst.candidateTimeMs, 1000)
  assert.equal(report.source.invertedSampleCount, 0)
  assert.ok(report.candidate.heightEnvelope.minimum < -.99)
})

test('a real source full flip is allowed, but erasing it is a semantic regression', () => {
  const original = sampleObjectSkeletalMotion(objectFixture({ type: 'flip' }), { landmarks })
  const preserved = compareSkeletalMotionPoses(original, sample(glbFixture({ type: 'flip' })))
  assert.equal(preserved.status, 'PASS')
  assert.ok(preserved.source.invertedSampleCount > 0)
  assert.ok(preserved.candidate.invertedSampleCount > 0)
  const removed = compareSkeletalMotionPoses(original, sample(glbFixture()))
  assert.ok(removed.failures.some(row => row.code === 'SOURCE_INVERSION_NOT_PRESERVED'))
})

test('a flip anywhere in the source does not permit a separate additional inversion', () => {
  const source = sample(glbFixture({ angles: [0, Math.PI, 0, 0, 0] }))
  const target = sample(glbFixture({ angles: [0, Math.PI, 0, Math.PI, 0] }))
  const report = compareSkeletalMotionPoses(source, target)
  assert.ok(report.failures.some(row => row.code === 'UNEXPECTED_INVERSION' && row.first.candidateTimeMs > 1000))
})

test('rest normalization is invariant to scene rotation, scale, translation, and exact bone names', () => {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.7).toArray()
  const source = sampleObjectSkeletalMotion(objectFixture({ scale: 100, rotation, translation: [150, -30, 40] }), { landmarks })
  const targetNames = ['RootB', 'HeadB', 'LeftB', 'RightB']
  const targetLandmarks = Object.fromEntries(Object.keys(landmarks).map((role, index) => [role, targetNames[index]]))
  const target = sample(glbFixture({ frameScale: .7, frameTranslation: [-4, 9, 3], nodeNames: targetNames }), { landmarks: targetLandmarks })
  assert.equal(compareSkeletalMotionPoses(source, target, { heightEnvelopeTolerance: 1e-6, landmarkEnvelopeTolerance: 1e-6 }).status, 'PASS')
})

test('time scaling must be declared rather than hiding the old bake extra frame', () => {
  const source = sample(glbFixture()), extended = sample(glbFixture({ durationSeconds: 2 + 1 / 30 }))
  assert.ok(compareSkeletalMotionPoses(source, extended).failures.some(row => row.code === 'CLOCK_MISMATCH'))
  const scaled = sample(glbFixture({ durationSeconds: 4 }))
  assert.equal(compareSkeletalMotionPoses(source, scaled, { expectedDurationScale: 2 }).status, 'PASS')
})

test('original key times are included, even if between the uniform proof frames', () => {
  const bytes = glbFixture(), parsed = parseGlb(bytes)
  parsed.bin.writeFloatLE(.507, 4)
  const sampled = sample(serializeGlb(parsed.json, parsed.bin), { sampleRateHz: 1 })
  assert.ok(sampled.timesMs.some(time => Math.abs(time - 507) < .001))
  assert.equal(sampled.timesMs.at(-1), 2000)
})

test('STEP is evaluated as STEP, not a fabricated rotation interpolation', () => {
  const target = sample(glbFixture({ angles: [0, Math.PI, 0], interpolation: 'STEP' }), { sampleRateHz: 4 })
  assert.equal(target.frames[target.timesMs.indexOf(750)].head[1], 2)
  assert.equal(target.frames[target.timesMs.indexOf(1000)].head[1], 0)
})

test('construction-rest normalization is separate from the model display pose', () => {
  const bytes = glbFixture(), modified = parseGlb(bytes)
  modified.json.nodes[1].rotation = q(.7)
  const display = serializeGlb(modified.json, modified.bin)
  const report = compareSkeletalMotionPoses(sample(bytes), sample(display, { restGlbBuffer: bytes }))
  assert.equal(report.status, 'PASS')
  assert.equal(report.candidate.restSha256, hash(bytes))
  assert.notEqual(report.candidate.assetSha256, report.candidate.restSha256)
})

test('source sanitized node identities bind original names without silent substitution', () => {
  const object = objectFixture()
  object.getObjectByName('Crown').userData.originalName = 'Rig:Crown'
  const source = sampleObjectSkeletalMotion(object, { landmarks: { ...landmarks, head: 'Rig:Crown' } })
  assert.equal(source.rest.head[1], 2)
  assert.throws(() => sampleObjectSkeletalMotion(object, { landmarks }), /landmark is absent/)
})

for (const [label, mutate] of [
  ['nonfinite value', ({ bin }) => bin.writeFloatLE(NaN, 20)],
  ['unsupported interpolation', ({ json }) => { json.animations[0].samplers[0].interpolation = 'CUBICSPLINE' }],
  ['out-of-bounds accessor', ({ json }) => { json.accessors[1].count += 1 }],
  ['sparse accessor', ({ json }) => { json.accessors[1].sparse = {} }],
  ['duplicate node identity', ({ json }) => { json.nodes.push({ name: 'Crown' }) }],
  ['cyclic hierarchy', ({ json }) => { json.nodes[2].children = [0] }],
  ['duplicate target channel', ({ json }) => { json.animations[0].channels.push(json.animations[0].channels[0]) }],
  ['zero quaternion', ({ bin }) => { for (let i = 0; i < 4; i++) bin.writeFloatLE(0, 20 + i * 4) }],
]) test(`unsupported ${label} fails closed before reporting pose parity`, () => {
  const parsed = parseGlb(glbFixture()); mutate(parsed)
  assert.throws(() => sample(serializeGlb(parsed.json, parsed.bin)), error => error.code === 'SKELETAL_MOTION_PROOF_INVALID')
})

test('semantic role, rest-frame, clock, and tolerance contracts fail closed', () => {
  const bytes = glbFixture(), source = sample(bytes)
  assert.throws(() => sampleGlbSkeletalMotion(bytes, { landmarks, animationIndex: 1 }), /selected GLB animation/)
  assert.throws(() => sample(bytes, { animationName: 'ignored' }), /incompatible/)
  assert.throws(() => sampleObjectSkeletalMotion(objectFixture(), { landmarks, animationIndex: 0 }), /incompatible/)
  assert.throws(() => sample(bytes, { landmarks: { ...landmarks, rightFoot: 'SoleL' } }), /different node/)
  assert.throws(() => sample(bytes, { sampleRateHz: 120, maximumSamples: 2 }), /resource bound/)
  const invalidRest = structuredClone(source); invalidRest.rest.rightFoot = [...invalidRest.rest.leftFoot]
  assert.throws(() => compareSkeletalMotionPoses(source, invalidRest), /lateral axis/)
  const invalidFrame = structuredClone(source); invalidFrame.frames[1].head[0] = Infinity
  assert.throws(() => compareSkeletalMotionPoses(source, invalidFrame), /finite landmarks/)
  const invalidClock = structuredClone(source); invalidClock.timesMs.pop(); invalidClock.frames.pop()
  assert.throws(() => compareSkeletalMotionPoses(source, invalidClock), /both endpoints/)
  assert.throws(() => compareSkeletalMotionPoses(source, source, { phaseToleranceMs: Infinity }), /bounded/)
  assert.throws(() => compareSkeletalMotionPoses(source, source, { allowFlips: true }), /Unknown/)
})
