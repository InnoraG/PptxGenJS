import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { computeModel3dMotionFraming } from '../ir/model3d-motion-framing.mjs'
import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'
import { validateModel3DViewOptions } from '../ir/spec-compiler.mjs'

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)
const frame = { w: 6.3, h: 6.3 }
const fit = (bytes, options = {}) => computeModel3dMotionFraming(bytes, { animationIndex: 0, frame, ...options })

function fixture({ skinned = true, translations = [[0, 0, 0], [0, 0, 3]], times = [0, 1], positions = null, mutate = null } = {}) {
  const nodes = [{ name: 'Scene', children: [1, 2] }, { name: 'Joint' }, { name: 'Visible model', mesh: 0, ...(skinned ? { skin: 0 } : {}) }]
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes,
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], meshes: [{ primitives: [{ attributes: {} }] }], animations: [] }
  const buffers = []
  function append(rows, type, componentType = 5126, normalized = false) {
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type], size = { 5126: 4, 5123: 2, 5121: 1 }[componentType]
    const data = Buffer.alloc(Math.ceil(rows.length * width * size / 4) * 4)
    rows.forEach((row, i) => (Array.isArray(row) ? row : [row]).forEach((value, axis) => data[{ 5126: 'writeFloatLE', 5123: 'writeUInt16LE', 5121: 'writeUInt8' }[componentType]](value, (i * width + axis) * size)))
    const offset = buffers.reduce((sum, buffer) => sum + buffer.length, 0); buffers.push(data)
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length })
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, type, count: rows.length, ...(normalized ? { normalized: true } : {}) })
    return json.accessors.length - 1
  }
  const points = positions || [0, 1, 2, 3, 4, 5, 6, 7].map(mask => [0, 1, 2].map(axis => mask & 1 << axis ? .5 : -.5))
  const attrs = json.meshes[0].primitives[0].attributes
  attrs.POSITION = append(points, 'VEC3')
  if (skinned) {
    attrs.JOINTS_0 = append(points.map(() => [0, 0, 0, 0]), 'VEC4', 5123)
    attrs.WEIGHTS_0 = append(points.map(() => [1, 0, 0, 0]), 'VEC4')
    json.skins = [{ joints: [1], inverseBindMatrices: append([identity()], 'MAT4') }]
  }
  const input = append(times, 'SCALAR')
  const target = skinned ? 1 : 2
  json.animations.push({ name: 'selected-forward-travel', samplers: [{ input, output: append(translations, 'VEC3'), interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: target, path: 'translation' } }] })
  const otherInput = append([0, 10], 'SCALAR')
  json.animations.push({ name: 'UNSELECTED-extreme-travel', samplers: [{ input: otherInput, output: append([[0, 0, 0], [1000, 1000, 1000]], 'VEC3') }], channels: [{ sampler: 0, target: { node: target, path: 'translation' } }] })
  mutate?.(json, { append, attrs, target, points })
  const bin = Buffer.concat(buffers); json.buffers[0].byteLength = bin.length
  return serializeGlb(json, bin)
}

test('a forward-travelling skinned clip gets a full depth envelope and positive camera clearance', () => {
  const result = fit(fixture())
  close(result.report.motionBounds.min[2], -.5); close(result.report.motionBounds.max[2], 3.5)
  close(result.trans.meterPerModelUnit.n / result.trans.meterPerModelUnit.d, .25)
  assert.ok(result.report.minimumCameraClearanceMeters > 1.5)
  assert.ok(result.report.maximumDepthMagnification < 1.34)
  assert.ok(result.objViewport > 6300000, 'zoom must compensate the changed model-unit normalization')
  result.report.maximumProjectedSizeInches.forEach((value, axis) => assert.ok(value <= [frame.w, frame.h][axis] * .84 + 1e-9))
  assert.equal(result.report.geometryCoverage, 'all-visible-vertices-conservative-skin-influence-bounds')
  assert.equal(result.report.continuousTimeCertified, false)
  assert.equal(result.report.nativePlaybackVerified, false)
})

test('only the explicit zero-based clip influences fitting; all bytes and all animation channels remain unchanged', () => {
  const bytes = fixture(), before = Buffer.from(bytes), original = parseGlb(bytes), result = fit(bytes)
  assert.deepEqual(bytes, before)
  assert.deepEqual(parseGlb(bytes), original)
  assert.equal(result.report.sourceSha256, hash(bytes)); assert.equal(result.report.inputBytesUnchanged, true)
  assert.equal(result.report.animationIndex, 0); assert.equal(result.report.animationName, 'selected-forward-travel')
  assert.equal(result.report.durationMs, 1000); assert.equal(result.report.channelCount, 1)
  assert.ok(result.report.motionBounds.max[0] < 1)
  const other = fit(bytes, { animationIndex: 1 })
  assert.equal(other.report.durationMs, 10000); assert.ok(other.report.motionBounds.max[0] > 1000)
  assert.deepEqual(fit(bytes), result, 'same bytes and options must produce deterministic native output')
})

test('negative depth travel and wide rectangular frames remain bounded instead of dropping root motion', () => {
  const result = fit(fixture({ translations: [[0, 0, 0], [-4, 2, -6]] }), { frame: { w: 8, h: 2 } })
  close(result.report.motionBounds.min[0], -4.5); close(result.report.motionBounds.min[2], -6.5)
  assert.ok(result.report.minimumCameraClearanceMeters > 1.5)
  assert.ok(result.report.maximumProjectedSizeInches[0] <= 8 * .84)
  assert.ok(result.report.maximumProjectedSizeInches[1] <= 2 * .84)
})

test('telephoto distance is compensated by viewport rather than silently shrinking the model', () => {
  const bytes = fixture(), a = fit(bytes), b = fit(bytes, { cameraDistanceMeters: 10 })
  assert.deepEqual(a.trans, b.trans)
  assert.equal(b.camera.pos.z, 360000000)
  assert.ok(b.objViewport > a.objViewport * 5)
  assert.ok(b.report.maximumDepthMagnification < a.report.maximumDepthMagnification)
  close(a.report.maximumProjectedSizeInches[1], b.report.maximumProjectedSizeInches[1], 1e-6)
  const narrowFov = fit(bytes, { fovDegrees: 30 })
  assert.ok(narrowFov.objViewport < a.objViewport)
  close(a.report.maximumProjectedSizeInches[1], narrowFov.report.maximumProjectedSizeInches[1], 1e-6)
})

test('the result uses existing native manual-view fields and passes their validator', () => {
  const { trans, camera, objViewport } = fit(fixture())
  assert.doesNotThrow(() => validateModel3DViewOptions({ trans, camera, objViewport }))
  assert.equal(trans.scale.sx, 1); assert.equal(trans.rot.ay, 0)
  assert.deepEqual(trans.postTrans, { dx: 0, dy: 0, dz: 0 })
})

test('yaw transforms both the movement envelope and its inverse pre-translation', () => {
  const result = fit(fixture(), { yawDegrees: 90 })
  close(result.report.motionBounds.max[0], 3.5)
  close(result.report.motionBounds.max[2], .5)
  close(result.trans.preTrans.dz, -.375 * 36000000)
  close(result.trans.preTrans.dx, 0)
  assert.equal(result.trans.rot.ay, 90 * 60000)
  close(result.report.normalizedBounds.center[0], 0)
  close(result.report.normalizedBounds.center[2], 0)
})

test('short key intervals are sampled internally, preserving intentional rotation arcs and exact clocks', () => {
  const bytes = fixture({ skinned: false, positions: [[1, 0, 0], [2, 0, 0]], times: [0, .001], translations: [[0, 0, 0], [0, 0, 0]], mutate(json, { append, target }) {
    const animation = json.animations[0]
    animation.samplers.push({ input: animation.samplers[0].input, output: append([[0, 0, 0, 1], [0, 0, 1, 0]], 'VEC4'), interpolation: 'LINEAR' })
    animation.channels.push({ sampler: 1, target: { node: target, path: 'rotation' } })
  } })
  const result = fit(bytes, { sampleRateHz: 1 })
  assert.equal(result.report.durationMs, 1)
  assert.ok(result.report.motionBounds.max[1] > 1.99999, 'a between-key half-turn must not disappear at low uniform rate')
  assert.ok(result.report.motionBounds.min[0] < -1.99999)
  assert.ok(result.report.sampleCount >= 5)
})

test('quaternion hemisphere signs do not invent an envelope or remove a valid rotation', () => {
  const bytes = fixture({ skinned: false, translations: [[0, 0, 0], [0, 0, 0]], mutate(json, { append, target }) {
    const animation = json.animations[0]
    animation.samplers.push({ input: animation.samplers[0].input, output: append([[0, 0, 0, 1], [0, 0, 0, -1]], 'VEC4') })
    animation.channels.push({ sampler: 1, target: { node: target, path: 'rotation' } })
  } })
  const result = fit(bytes)
  result.report.motionBounds.size.forEach(value => close(value, 1))
  assert.equal(hash(bytes), result.report.sourceSha256)
})

test('skin-influence bounds include the full mesh, normalized integer weights, and a second influence set', () => {
  const result = fit(fixture({ mutate(json, { append, attrs, points }) {
    json.nodes.push({ name: 'Second joint', translation: [4, 0, 0] }); json.nodes[0].children.push(3)
    json.skins[0].joints.push(3); json.skins[0].inverseBindMatrices = append([identity(), identity()], 'MAT4')
    attrs.WEIGHTS_0 = append(points.map(() => [32767, 0, 0, 0]), 'VEC4', 5123, true)
    attrs.JOINTS_1 = append(points.map(() => [1, 0, 0, 0]), 'VEC4', 5121)
    attrs.WEIGHTS_1 = append(points.map(() => [32768, 0, 0, 0]), 'VEC4', 5123, true)
  } }))
  assert.ok(result.report.motionBounds.max[0] >= 4.5, 'all nonzero influences must be bounded, including JOINTS_1')
  assert.ok(result.report.motionBounds.max[2] >= 3.5)
  assert.equal(result.report.vertexCount, 8)
})

test('node world transforms apply to skinned geometry and detached meshes do not contaminate the default scene', () => {
  const result = fit(fixture({ mutate(json) {
    json.nodes[0].translation = [10, 20, 30]; json.nodes[0].scale = [2, 2, 2]
    json.nodes.push({ name: 'Detached huge object', mesh: 0, translation: [10000, 10000, 10000], scale: [10000, 10000, 10000] })
  } }))
  close(result.report.motionBounds.min[0], 9); close(result.report.motionBounds.max[2], 37)
  close(result.report.motionBounds.center[0], 10)
  assert.equal(result.report.geometryCount, 1)
  assert.ok(result.report.maximumProjectedSizeInches.every(Number.isFinite))
})

test('STEP channels and constant matrix mesh nodes have explicit supported semantics', () => {
  const bytes = fixture({ skinned: false, translations: [[0, 0, 0], [2, 0, 0]], mutate(json) {
    json.animations[0].samplers[0].interpolation = 'STEP'
    json.nodes.push({ name: 'Static matrix object', mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -3, 0, 0, 1] }); json.nodes[0].children.push(3)
  } })
  const result = fit(bytes)
  close(result.report.motionBounds.min[0], -3.5); close(result.report.motionBounds.max[0], 2.5)
  assert.equal(result.report.geometryCount, 2)
})

test('manual transforms and unsupported option combinations are rejected, not silently substituted', () => {
  const bytes = fixture()
  for (const bad of [{ animationIndex: -1 }, { animationIndex: 2 }, { animationIndex: .5 }, { frame: { w: 0, h: 2 } }, { frame: { w: 2, h: 2, x: 1 } }, { trans: {} }, { camera: {} }, { objViewport: 10 }, { pitchDegrees: 10 }, { paddingFraction: 0 }, { sampleRateHz: 1.5 }, { cameraDistanceMeters: .4 }, { yawDegrees: .000001 }, { fovDegrees: 180 }]) assert.throws(() => fit(bytes, bad), { code: 'MODEL3D_MOTION_FRAMING_INVALID' })
  assert.throws(() => computeModel3dMotionFraming(bytes, null), /must be an object/)
  assert.throws(() => fit('not binary'), /binary model bytes/)
})

test('unsupported morphs, sparse accessors, compressed geometry and cubic animation fail explicitly', () => {
  for (const mutate of [
    json => { json.meshes[0].primitives[0].targets = [{ POSITION: 0 }] },
    json => { json.accessors[0].sparse = { count: 1 } },
    json => { json.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} } },
    json => { json.nodes[2].extensions = { EXT_mesh_gpu_instancing: {} } },
    json => { json.animations[0].samplers[0].interpolation = 'CUBICSPLINE' },
    json => { json.animations[0].channels[0].target.path = 'weights' },
  ]) assert.throws(() => fit(fixture({ mutate })), error => /MODEL3D_MOTION_FRAMING_(?:UNSUPPORTED|ASSET_INVALID)/.test(error.code))
})

test('bad geometry, weights, hierarchy, duplicate targets and clocks are rejected before a fit is returned', () => {
  for (const mutate of [
    json => { json.bufferViews[0].byteLength = 1 },
    json => { json.nodes[1].children = [0] },
    json => { json.nodes[2].children = [1] },
    json => { json.animations[0].channels.push(structuredClone(json.animations[0].channels[0])) },
    (json, { attrs, points, append }) => { attrs.WEIGHTS_0 = append(points.map(() => [-1, 0, 0, 0]), 'VEC4') },
    (json, { append }) => { json.animations[0].samplers[0].input = append([0, 0], 'SCALAR') },
    (json, { append }) => { json.animations[0].samplers[0].input = append([0, 601], 'SCALAR') },
  ]) assert.throws(() => fit(fixture({ mutate })), error => error.code?.startsWith('MODEL3D_MOTION_FRAMING_'))
})

test('a selected clip with an exact non-round source clock is not resampled or duration-extended', () => {
  const bytes = fixture({ times: [0, 7.2] }), result = fit(bytes)
  assert.equal(result.report.durationMs, 7200)
  close(result.report.durationSeconds, 7.2, 1e-6)
  assert.equal(result.report.inputBytesUnchanged, true)
  assert.ok(result.report.maximumSampleGapSeconds <= 1 / 60 + 1e-12)
})

test('invalid or truncated binary input never returns an apparently safe fallback', () => {
  const bytes = fixture()
  for (const value of [Buffer.alloc(0), bytes.subarray(0, bytes.length - 1), Buffer.from('not a binary model')]) assert.throws(() => fit(value), { code: 'MODEL3D_MOTION_FRAMING_ASSET_INVALID' })
})
