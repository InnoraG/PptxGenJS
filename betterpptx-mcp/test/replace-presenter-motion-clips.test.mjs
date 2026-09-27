import assert from 'node:assert/strict'
import { test } from 'node:test'
import { replacePresenterMotionClips } from '../assets/replace-presenter-motion-clips.mjs'
import { extractRetargetRestProfile, parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

function fixture({ names = ['idle', 'talk', 'enumerate'], moving = false } = {}) {
  const times = Buffer.alloc(8)
  times.writeFloatLE(0, 0)
  times.writeFloatLE(2, 4)
  const rotations = Buffer.alloc(32)
  rotations.writeFloatLE(1, 12)
  rotations.writeFloatLE(moving ? Math.SQRT1_2 : 0, 24)
  rotations.writeFloatLE(moving ? Math.SQRT1_2 : 1, 28)
  const binary = Buffer.concat([times, rotations])
  return serializeGlb({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'mixamorig:Hips', rotation: [0, 0, 0, 1], translation: [0, 1, 0] }],
    materials: [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 32 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 2, min: [0], max: [2] }, { bufferView: 1, componentType: 5126, type: 'VEC4', count: 2 }],
    animations: names.map(name => ({ name, samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] })),
  }, binary)
}

test('selective replacement preserves original bytes, stopped posture and unrelated clips', () => {
  const original = fixture()
  const donor = fixture({ names: ['source-talking'], moving: true })
  const rest = extractRetargetRestProfile(original)
  const parsed = parseGlb(original)
  parsed.json.nodes[0].rotation = [0, Math.sin(0.1), 0, Math.cos(0.1)]
  const posed = serializeGlb(parsed.json, parsed.bin)
  const result = replacePresenterMotionClips(posed, [{ clipName: 'talk', sourceSlug: 'source-talking', library: donor }], { targetRestProfile: rest })
  const output = parseGlb(result.buffer)
  assert.deepEqual(output.json.nodes, parsed.json.nodes)
  assert.deepEqual(output.json.materials, parsed.json.materials)
  assert.ok(output.bin.subarray(0, parsed.bin.length).equals(parsed.bin))
  assert.deepEqual(output.json.animations.map(row => row.name), ['idle', 'talk', 'enumerate'])
  assert.deepEqual(output.json.animations[0], parsed.json.animations[0])
  assert.deepEqual(output.json.animations[2], parsed.json.animations[2])
  assert.notDeepEqual(output.json.animations[1], parsed.json.animations[1])
  assert.deepEqual(result.report.preservedClipNames, ['idle', 'enumerate'])
  assert.equal(result.report.boundaryBlendMs, 0)
  assert.equal(result.report.retargetValidation[0].status, 'PASS')
})

test('two donors replace exact names without changing clip slots or time bases', () => {
  const original = fixture()
  const result = replacePresenterMotionClips(original, [
    { clipName: 'enumerate', sourceSlug: 'counting', library: fixture({ names: ['counting'], moving: true }) },
    { clipName: 'talk', sourceSlug: 'talking', library: fixture({ names: ['talking'], moving: true }) },
  ], { targetRestProfile: extractRetargetRestProfile(original) })
  const output = parseGlb(result.buffer)
  assert.deepEqual(output.json.animations.map(row => row.name), ['idle', 'talk', 'enumerate'])
  for (const animation of output.json.animations.slice(1)) {
    const accessor = output.json.accessors[animation.samplers[0].input]
    assert.deepEqual(accessor.min, [0])
    assert.deepEqual(accessor.max, [2])
  }
})

test('missing, duplicate, ambiguous or unprofiled replacements fail closed', () => {
  const original = fixture()
  const donor = fixture({ names: ['source'] })
  const request = [{ clipName: 'talk', sourceSlug: 'source', library: donor }]
  const options = { targetRestProfile: extractRetargetRestProfile(original) }
  assert.throws(() => replacePresenterMotionClips(original, request), /construction rest profile/)
  assert.throws(() => replacePresenterMotionClips(original, [], options), /At least one/)
  assert.throws(() => replacePresenterMotionClips(original, [request[0], request[0]], options), /only be replaced once/)
  assert.throws(() => replacePresenterMotionClips(original, [{ ...request[0], clipName: 'missing' }], options), /does not exist/)
  assert.throws(() => replacePresenterMotionClips(fixture({ names: ['talk', 'talk'] }), request, options), /duplicate animation names/)
})

test('a missing finger target fails instead of silently dropping its animation', () => {
  const original = fixture()
  const donor = parseGlb(fixture({ names: ['counting'], moving: true }))
  donor.json.nodes.push({ name: 'mixamorig:RightHandIndex1', rotation: [0, 0, 0, 1] })
  donor.json.nodes[0].children = [1]
  donor.json.animations[0].channels.push({ sampler: 0, target: { node: 1, path: 'rotation' } })
  assert.throws(() => replacePresenterMotionClips(original, [{
    clipName: 'enumerate', sourceSlug: 'counting', library: serializeGlb(donor.json, donor.bin),
  }], { targetRestProfile: extractRetargetRestProfile(original) }), /cannot be matched without dropping joints/)
})

test('mixed finger namespaces are matched source-only without altering the target', () => {
  const target = parseGlb(fixture())
  target.json.nodes.push({ name: 'mixamorig7:RightHandIndex1', rotation: [0, 0, 0, 1] })
  target.json.nodes[0].children = [1]
  const original = serializeGlb(target.json, target.bin)
  const donor = parseGlb(fixture({ names: ['counting'], moving: true }))
  donor.json.nodes.push({ name: 'mixamorig8:RightHandIndex1', rotation: [0, 0, 0, 1] })
  donor.json.nodes[0].children = [1]
  donor.json.animations[0].channels.push({ sampler: 0, target: { node: 1, path: 'rotation' } })
  const result = replacePresenterMotionClips(original, [{
    clipName: 'enumerate', sourceSlug: 'counting', library: serializeGlb(donor.json, donor.bin),
  }], { targetRestProfile: extractRetargetRestProfile(original) })
  const output = parseGlb(result.buffer)
  assert.deepEqual(output.json.nodes, target.json.nodes)
  assert.equal(output.json.animations[2].channels.length, 2)
  assert.equal(result.report.boneNameMatching[0].renamedSourceNodes, 1)
  assert.equal(output.json.nodes[output.json.animations[2].channels[1].target.node].name, 'mixamorig7:RightHandIndex1')
})

test('ambiguous numbered namespaces fail instead of selecting an arbitrary joint', () => {
  const target = parseGlb(fixture())
  target.json.nodes.push({ name: 'mixamorig7:Hips', rotation: [0, 0, 0, 1] })
  const original = serializeGlb(target.json, target.bin)
  assert.throws(() => replacePresenterMotionClips(original, [{
    clipName: 'talk', sourceSlug: 'source', library: fixture({ names: ['source'] }),
  }], { targetRestProfile: extractRetargetRestProfile(original) }), /ambiguous joint identities/)
})

test('grounded replacement requires an explicit bounded world policy and one real Hips track', () => {
  const original = fixture()
  const replacement = { clipName: 'talk', sourceSlug: 'source', library: fixture({ names: ['source'] }) }
  const options = { targetRestProfile: extractRetargetRestProfile(original) }
  assert.throws(() => replacePresenterMotionClips(original, [{ ...replacement, channelPolicy: 'full-trs' }], options), /grounded replacement requires/)
  assert.throws(() => replacePresenterMotionClips(original, [{ ...replacement, rootMotionSpace: 'world' }], options), /Root travel controls require/)
  const rootPolicy = { channelPolicy: 'root-motion', rootMotionSpace: 'world', rootMotionAnchor: 'start', rootMotionMaxStatures: 0.35, rootMotionMaxHorizontalStatures: 0.5 }
  assert.throws(() => replacePresenterMotionClips(original, [{ ...replacement, ...rootPolicy }], options), /exactly one Hips translation/)
  assert.throws(() => replacePresenterMotionClips(original, [{ ...replacement, ...rootPolicy, rootMotionAnchor: 'end' }], options), /grounded replacement requires/)
})
