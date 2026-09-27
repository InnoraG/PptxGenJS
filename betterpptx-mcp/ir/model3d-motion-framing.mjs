import { createHash } from 'node:crypto'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { parseGlb } from './kinetic-transplant.mjs'

// An opt-in authoring calculation, NOT a rewrite of the model or a replacement
// for static/manual auto-fit. The native camera sits only about two metres from
// the origin: reducing a 2-D viewport cannot rescue a clip that crosses it.
const EMU_PER_METER = 36000000
const DEFAULT_CAMERA_Z_EMU = 72274889
const DEFAULT_CAMERA_METERS = DEFAULT_CAMERA_Z_EMU / EMU_PER_METER
const VIEWPORT_PER_INCH = 1454545
const RATIONAL_DENOMINATOR = 1000000
const MAX_NATIVE_INTEGER = 2147483647
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const READ = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' }
const emptyBounds = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
const addPoint = (box, p) => { for (let a = 0; a < 3; a++) { box.min[a] = Math.min(box.min[a], p[a]); box.max[a] = Math.max(box.max[a], p[a]) } }
const corners = box => [0, 1, 2, 3, 4, 5, 6, 7].map(mask => box.min.map((v, axis) => mask & 1 << axis ? box.max[axis] : v))
const transform = (matrix, p) => new Vector3(...p).applyMatrix4(matrix).toArray()
const finishBounds = box => ({ ...box, size: box.max.map((v, a) => v - box.min[a]), center: box.max.map((v, a) => (v + box.min[a]) / 2) })
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function fail(message, code = 'MODEL3D_MOTION_FRAMING_INVALID') {
  const error = new Error(message); error.code = code; throw error
}
function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be a finite number from ${min} to ${max}.`)
  return value
}
function vector(value, width, label) {
  if (!Array.isArray(value) || value.length !== width || value.some(v => typeof v !== 'number' || !Number.isFinite(v))) fail(`${label} must contain ${width} finite numbers.`, 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
  return value
}
function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`)
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}.${key} is unsupported; this fit cannot silently combine manual transforms.`)
}
function rotation(values) {
  vector(values, 4, 'Rotation')
  const q = new Quaternion(...values)
  if (q.length() < 1e-12) fail('A model rotation has zero magnitude.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
  return q.normalize()
}
function affine(values, label) {
  vector(values, 16, label)
  if ([3, 7, 11].some(i => Math.abs(values[i]) > 1e-10) || Math.abs(values[15] - 1) > 1e-10) fail(`${label} must be an affine matrix.`, 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  return new Matrix4().fromArray(values)
}

function readModel(bytes, animationIndex) {
  let model
  try {
    if (bytes.length < 20 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('header')
    model = parseGlb(bytes)
  } catch { fail('Motion framing requires a valid self-contained binary 3D model.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID') }
  const { json, bin } = model
  if (json.asset?.version !== '2.0' || json.buffers?.length !== 1 || json.buffers[0].uri || json.buffers[0].byteLength > bin.length) fail('Only self-contained version 2 binary geometry is supported.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  const allowedRequired = new Set(['KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_pbrSpecularGlossiness', 'KHR_materials_clearcoat', 'KHR_materials_sheen', 'KHR_materials_specular', 'KHR_materials_ior', 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_emissive_strength'])
  if ((json.extensionsRequired || []).some(name => !allowedRequired.has(name))) fail('This model requires an unsupported geometry extension.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  if (!Array.isArray(json.nodes) || !json.nodes.length || json.nodes.length > 4096) fail('A model must have one to 4096 nodes.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
  if (!Number.isInteger(animationIndex) || animationIndex < 0 || !json.animations?.[animationIndex]) fail('animationIndex must select an existing zero-based animation.')
  const cache = new Map()
  function accessor(index, type = null) {
    const value = json.accessors?.[index], view = json.bufferViews?.[value?.bufferView]
    const width = WIDTH[value?.type], size = BYTES[value?.componentType], reader = READ[value?.componentType]
    if (!Number.isInteger(index) || !view || !width || !reader || value.sparse || view.extensions || (view.buffer || 0) !== 0 || type && value.type !== type || !Number.isInteger(value.count) || value.count < 1 || value.count > 2000000) fail('The model contains an unsupported or invalid accessor.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
    if (cache.has(index)) return cache.get(index)
    const start = (view.byteOffset || 0) + (value.byteOffset || 0), stride = view.byteStride || size * width
    const end = start + (value.count - 1) * stride + size * width
    if (![start, stride, end, view.byteLength].every(Number.isInteger) || start < (view.byteOffset || 0) || stride < width * size || end > bin.length || end > (view.byteOffset || 0) + view.byteLength) fail('The model contains an out-of-bounds accessor.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
    const result = Array.from({ length: value.count }, (_, row) => Array.from({ length: width }, (_, axis) => {
      let n = bin[reader](start + row * stride + axis * size)
      if (value.normalized && value.componentType !== 5126) n = Math.max(value.componentType === 5120 || value.componentType === 5122 ? -1 : 0, n / ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295 })[value.componentType])
      if (!Number.isFinite(n)) fail('The model contains non-finite geometry or motion.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
      return n
    }))
    cache.set(index, result); return result
  }
  const parents = json.nodes.map(() => -1)
  const locals = json.nodes.map((node, index) => {
    if (node.extensions && Object.keys(node.extensions).some(key => key !== 'KHR_lights_punctual')) fail('Node geometry extensions are unsupported.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
    if (node.matrix && [node.translation, node.rotation, node.scale].some(value => value !== undefined)) fail('A node cannot combine matrix and TRS transforms.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
    const local = { t: vector(node.translation || [0, 0, 0], 3, 'Translation'), q: rotation(node.rotation || [0, 0, 0, 1]), s: vector(node.scale || [1, 1, 1], 3, 'Scale'), matrix: node.matrix ? affine(node.matrix, 'Node matrix') : null }
    for (const child of node.children || []) {
      if (!Number.isInteger(child) || !json.nodes[child] || parents[child] !== -1) fail('The model hierarchy must be a tree.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
      parents[child] = index
    }
    return local
  })
  const scene = json.scenes?.[json.scene ?? 0]
  if (!scene || !Array.isArray(scene.nodes) || !scene.nodes.length) fail('A model must declare its visible default scene.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  const visible = new Set()
  const visit = (index, chain = new Set()) => {
    if (!json.nodes[index] || chain.has(index)) fail('The model hierarchy contains an invalid node or cycle.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
    if (visible.has(index)) return
    visible.add(index); const next = new Set([...chain, index])
    for (const child of json.nodes[index].children || []) visit(child, next)
  }
  for (const index of scene.nodes) { if (parents[index] !== -1) fail('A scene root cannot have a parent.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID'); visit(index) }
  function worlds(pose = new Map()) {
    const out = [], visiting = new Set()
    const resolve = index => {
      if (out[index]) return out[index]
      if (visiting.has(index)) fail('The model hierarchy contains a cycle.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
      visiting.add(index)
      const local = locals[index]
      const matrix = local.matrix?.clone() || new Matrix4().compose(new Vector3(...(pose.get(`${index}:translation`) || local.t)), pose.has(`${index}:rotation`) ? rotation(pose.get(`${index}:rotation`)) : local.q, new Vector3(...(pose.get(`${index}:scale`) || local.s)))
      out[index] = parents[index] < 0 ? matrix : resolve(parents[index]).clone().multiply(matrix)
      visiting.delete(index); return out[index]
    }
    visible.forEach(resolve); return out
  }
  const geometries = []; let vertexCount = 0
  for (const nodeIndex of visible) {
    const node = json.nodes[nodeIndex]
    if (node.mesh === undefined) continue
    const mesh = json.meshes?.[node.mesh]
    if (!mesh?.primitives?.length) fail('A visible mesh has no geometry.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
    if (mesh.weights || node.weights) fail('Morph weights are unsupported by motion-envelope fitting.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
    for (const primitive of mesh.primitives) {
      if (primitive.targets?.length || primitive.extensions && Object.keys(primitive.extensions).length) fail('Morph targets and primitive extensions require a different framing evaluator.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
      const attributes = primitive.attributes || {}, positions = accessor(attributes.POSITION, 'VEC3')
      if (json.accessors[attributes.POSITION].componentType !== 5126) fail('Position accessors must use floating-point coordinates.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
      vertexCount += positions.length
      if (vertexCount > 2000000) fail('Motion framing is limited to two million visible vertices.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
      if (node.skin === undefined) {
        if (attributes.JOINTS_0 !== undefined || attributes.WEIGHTS_0 !== undefined) fail('Skinned attributes require a skin binding.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
        const box = emptyBounds(); positions.forEach(p => addPoint(box, p)); geometries.push({ bindings: [{ node: nodeIndex, box }], weightRange: [1, 1] }); continue
      }
      const skin = json.skins?.[node.skin]
      if (!skin?.joints?.length || skin.joints.some(index => !Number.isInteger(index) || !visible.has(index))) fail('All skin joints must belong to the visible scene.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
      const binds = skin.inverseBindMatrices === undefined ? skin.joints.map(() => new Matrix4()) : accessor(skin.inverseBindMatrices, 'MAT4').map(row => affine(row, 'Inverse bind matrix'))
      if (binds.length !== skin.joints.length) fail('Skin joint and inverse-bind counts differ.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
      const sets = []
      for (const key of Object.keys(attributes)) if ((key.startsWith('JOINTS_') || key.startsWith('WEIGHTS_')) && !['JOINTS_0', 'WEIGHTS_0', 'JOINTS_1', 'WEIGHTS_1'].includes(key)) fail('At most eight skin influences per vertex are supported.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
      for (const set of [0, 1]) {
        if (set === 1 && attributes.JOINTS_1 === undefined && attributes.WEIGHTS_1 === undefined) continue
        const ji = attributes[`JOINTS_${set}`], wi = attributes[`WEIGHTS_${set}`]
        const joints = accessor(ji, 'VEC4'), weights = accessor(wi, 'VEC4')
        if (![5121, 5123].includes(json.accessors[ji].componentType) || json.accessors[ji].normalized || joints.length !== positions.length || weights.length !== positions.length) fail('Invalid skin influence attributes.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
        sets.push({ joints, weights })
      }
      const boxes = skin.joints.map(emptyBounds), weightRange = [1, 1]
      positions.forEach((position, vertex) => {
        let total = 0
        for (const set of sets) for (let slot = 0; slot < 4; slot++) {
          const joint = set.joints[vertex][slot], weight = set.weights[vertex][slot]
          if (!Number.isInteger(joint) || joint < 0 || joint >= skin.joints.length || weight < 0) fail('Skin joints and weights must be valid and nonnegative.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
          total += weight
          if (weight > 0) addPoint(boxes[joint], transform(binds[joint], position))
        }
        if (Math.abs(total - 1) > .01) fail('Skin weights must sum to one within quantization tolerance.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
        weightRange[0] = Math.min(weightRange[0], total); weightRange[1] = Math.max(weightRange[1], total)
      })
      // Each weighted vertex is a convex combination of its transformed joint
      // influences. Their union therefore conservatively encloses ALL vertices,
      // not a vertex subsample or joint-position proxy. Include both normalized
      // and raw quantized weight sums so either reader convention remains safe.
      geometries.push({ bindings: boxes.flatMap((box, index) => Number.isFinite(box.min[0]) ? [{ node: skin.joints[index], box }] : []), weightRange })
    }
  }
  if (!geometries.length) fail('The visible scene has no measurable geometry.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
  const animation = json.animations[animationIndex], channels = [], keyTimes = new Set([0]), targets = new Set()
  if (!animation.channels?.length) fail('The selected animation has no channels.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
  for (const channel of animation.channels) {
    const node = channel.target?.node, path = channel.target?.path, sampler = animation.samplers?.[channel.sampler]
    if (!Number.isInteger(node) || !visible.has(node) || !['translation', 'rotation', 'scale'].includes(path) || !sampler) fail('The selected animation must contain visible-node TRS channels only.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
    if (locals[node].matrix || targets.has(`${node}:${path}`) || channel.extensions || channel.target.extensions) fail('Matrix-targeted, duplicate, and extension motion channels are unsupported.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
    const interpolation = sampler.interpolation || 'LINEAR'
    if (!['LINEAR', 'STEP'].includes(interpolation)) fail('Motion-envelope fitting supports LINEAR and STEP interpolation only.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
    const times = accessor(sampler.input, 'SCALAR').map(row => row[0]), values = accessor(sampler.output, path === 'rotation' ? 'VEC4' : 'VEC3')
    if (times.length !== values.length || times.some((t, index) => t < 0 || index && t <= times[index - 1]) || times.at(-1) > 600) fail('Motion clocks must increase strictly, match their values, and finish within 600 seconds.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
    if (json.accessors[sampler.input].componentType !== 5126 || json.accessors[sampler.output].componentType !== 5126) fail('Motion inputs and outputs must use floating-point accessors.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
    if (path === 'rotation') values.forEach(rotation)
    times.forEach(time => keyTimes.add(time)); targets.add(`${node}:${path}`); channels.push({ node, path, interpolation, times, values })
  }
  function poseAt(time) {
    return new Map(channels.map(channel => {
      const { times, values, path, interpolation } = channel
      let value
      if (time <= times[0]) value = values[0]
      else if (time >= times.at(-1)) value = values.at(-1)
      else {
        let lo = 0, hi = times.length - 1
        while (hi - lo > 1) { const mid = lo + hi >> 1; if (times[mid] <= time) lo = mid; else hi = mid }
        const t = (time - times[lo]) / (times[hi] - times[lo])
        value = interpolation === 'STEP' ? values[lo] : path === 'rotation' ? rotation(values[lo]).slerp(rotation(values[hi]), t).toArray() : values[lo].map((v, axis) => v + (values[hi][axis] - v) * t)
      }
      return [`${channel.node}:${path}`, value]
    }))
  }
  function boundsAt(time, yaw) {
    const world = worlds(time === null ? new Map() : poseAt(time)), total = emptyBounds()
    for (const geometry of geometries) {
      const box = emptyBounds()
      for (const binding of geometry.bindings) {
        const matrix = yaw.clone().multiply(world[binding.node])
        for (const point of corners(binding.box)) addPoint(box, transform(matrix, point))
      }
      for (const point of corners(box)) for (const weight of geometry.weightRange) addPoint(total, point.map(v => v * weight))
    }
    if (![...total.min, ...total.max].every(Number.isFinite)) fail('The model produced non-finite posed geometry.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
    return total
  }
  return { animation, channels, keyTimes: [...keyTimes].sort((a, b) => a - b), boundsAt, vertexCount, geometryCount: geometries.length }
}

/**
 * @typedef {Object} Model3dMotionFramingOptions
 * @property {number} animationIndex Exact zero-based selected animation; never all clips in a bundle.
 * @property {{w:number,h:number}} frame Native clipping rectangle, in slide inches.
 * @property {number} [yawDegrees=0] Native Y rotation. Pitch/roll/nonuniform scale are deliberately unsupported.
 * @property {number} [cameraDistanceMeters] Positive Z camera; the look-at point remains the origin.
 * @property {number} [fovDegrees=45] Perspective field of view, in degrees.
 * @property {number} [paddingFraction=0.08] Empty fraction on EACH frame edge, from .02 through .3.
 * @property {number} [sampleRateHz=60] Uniform evaluation rate, supplemented by every source key and interval quartile.
 */

/**
 * Derive existing native `trans`, `camera` and `objViewport` fields without
 * mutating model bytes, clocks, channels, materials, or the selected animation.
 * The envelope is conservative over every influenced vertex AT the reported
 * sample times; temporal sampling is explicit, not a continuous-time certificate.
 * A native playback check remains necessary before visual release acceptance.
 * @param {Buffer|Uint8Array} input
 * @param {Model3dMotionFramingOptions} options
 */
export function computeModel3dMotionFraming(input, options) {
  exactKeys(options, ['animationIndex', 'frame', 'yawDegrees', 'cameraDistanceMeters', 'fovDegrees', 'paddingFraction', 'sampleRateHz'], 'Motion framing')
  exactKeys(options.frame, ['w', 'h'], 'frame')
  const frame = { w: number(options.frame.w, 'frame.w', .01, 100), h: number(options.frame.h, 'frame.h', .01, 100) }
  const yawDegrees = number(options.yawDegrees ?? 0, 'yawDegrees', -360, 360), fovDegrees = number(options.fovDegrees ?? 45, 'fovDegrees', 1, 120)
  for (const [name, value] of [['yawDegrees', yawDegrees], ['fovDegrees', fovDegrees]]) if (Math.abs(value * 60000 - Math.round(value * 60000)) > 1e-6) fail(`${name} must use native 1/60000-degree steps.`)
  const requestedDistance = number(options.cameraDistanceMeters ?? DEFAULT_CAMERA_METERS, 'cameraDistanceMeters', 1, MAX_NATIVE_INTEGER / EMU_PER_METER)
  const padding = number(options.paddingFraction ?? .08, 'paddingFraction', .02, .3), hz = number(options.sampleRateHz ?? 60, 'sampleRateHz', 1, 120)
  if (!Number.isInteger(hz)) fail('sampleRateHz must be an integer.')
  if (!(input instanceof Uint8Array) || input.length > 128 * 1024 * 1024) fail('The input must be binary model bytes no larger than 128 MiB.')
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength), sourceSha256 = sha256(bytes)
  const model = readModel(bytes, options.animationIndex), durationSeconds = model.keyTimes.at(-1)
  const times = new Set(model.keyTimes)
  for (let i = 0; i <= Math.ceil(durationSeconds * hz); i++) times.add(Math.min(durationSeconds, i / hz))
  // Short source intervals must not disappear between uniform samples. Evaluate
  // their interior rotations and the left limit of each STEP discontinuity.
  for (let i = 1; i < model.keyTimes.length; i++) {
    const a = model.keyTimes[i - 1], b = model.keyTimes[i]
    for (const fraction of [.25, .5, .75]) times.add(a + (b - a) * fraction)
    times.add(b - Math.min((b - a) / 8, Math.max(1e-12, Math.abs(b) * Number.EPSILON * 4)))
  }
  if (times.size > 60000) fail('The selected animation exceeds the 60000-sample framing budget.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  const sampleTimes = [...times].sort((a, b) => a - b), yaw = new Matrix4().makeRotationY(yawDegrees * Math.PI / 180)
  const envelope = emptyBounds()
  // Include the visible construction pose as well as the selected clip. This
  // prevents the live pre-roll from being clipped before embedded playback.
  const restBounds = model.boundsAt(null, yaw)
  for (const point of corners(restBounds)) addPoint(envelope, point)
  for (const time of sampleTimes) for (const point of corners(model.boundsAt(time, yaw))) addPoint(envelope, point)
  const volume = finishBounds(envelope), maxExtent = Math.max(...volume.size)
  if (maxExtent < 1e-9) fail('The selected motion has no measurable volume.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
  const numerator = Math.floor(RATIONAL_DENOMINATOR / maxExtent)
  if (numerator < 1 || numerator > MAX_NATIVE_INTEGER) fail('The model unit range cannot be represented safely by the native fit.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  const mpu = numerator / RATIONAL_DENOMINATOR
  // Native order is MPU -> pre-translation -> rotation. Convert the measured
  // view-space center back to model axes before serializing preTrans.
  const modelCenter = transform(yaw.clone().invert(), volume.center)
  const pre = modelCenter.map(v => Math.round(-v * mpu * EMU_PER_METER))
  if (pre.some(value => !Number.isSafeInteger(value))) fail('The model origin exceeds exact native coordinate precision.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  const shiftedCenter = transform(yaw, pre.map(v => v / EMU_PER_METER))
  const normalized = emptyBounds()
  for (const point of corners(volume)) addPoint(normalized, point.map((v, a) => v * mpu + shiftedCenter[a]))
  const cameraZ = Math.round(requestedDistance * EMU_PER_METER), distance = cameraZ / EMU_PER_METER
  const clearance = distance - normalized.max[2]
  if (clearance <= .25) fail('The requested camera does not safely clear the normalized motion envelope.')
  const projected = emptyBounds(), focalRatio = Math.tan(Math.PI / 8) / Math.tan(fovDegrees * Math.PI / 360)
  for (const point of corners(normalized)) {
    // Reference-distance scaling compensates a telephoto camera through viewport
    // zoom. D/(D-z) alone would incorrectly preserve size when D changes.
    const factor = DEFAULT_CAMERA_METERS / (distance - point[2]) * focalRatio
    addPoint(projected, [point[0] * factor, point[1] * factor, point[2]])
  }
  const halfWidth = Math.max(Math.abs(projected.min[0]), Math.abs(projected.max[0])), halfHeight = Math.max(Math.abs(projected.min[1]), Math.abs(projected.max[1]))
  const fitInches = Math.min(frame.w / Math.max(2 * halfWidth, 1e-9), frame.h / Math.max(2 * halfHeight, 1e-9))
  const viewport = Math.floor(fitInches * VIEWPORT_PER_INCH * (1 - 2 * padding))
  if (viewport < 1 || viewport > MAX_NATIVE_INTEGER) fail('The requested framing exceeds the native viewport range.', 'MODEL3D_MOTION_FRAMING_UNSUPPORTED')
  const actualSha256 = sha256(bytes)
  if (actualSha256 !== sourceSha256) fail('The input model changed during framing.', 'MODEL3D_MOTION_FRAMING_ASSET_INVALID')
  return {
    trans: { meterPerModelUnit: { n: numerator, d: RATIONAL_DENOMINATOR }, preTrans: { dx: pre[0], dy: pre[1], dz: pre[2] }, scale: { sx: 1, sy: 1, sz: 1 }, rot: { ax: 0, ay: Math.round(yawDegrees * 60000), az: 0 }, postTrans: { dx: 0, dy: 0, dz: 0 } },
    camera: { pos: { x: 0, y: 0, z: cameraZ }, fov: fovDegrees },
    objViewport: viewport,
    report: {
      schemaVersion: 'model3d-motion-framing.v1', sourceSha256, inputBytesUnchanged: true,
      animationIndex: options.animationIndex, animationName: model.animation.name ?? null, durationSeconds, durationMs: Math.round(durationSeconds * 1000), channelCount: model.channels.length,
      frame, yawDegrees, paddingFraction: padding, sampleRateHz: hz, sampleCount: sampleTimes.length, sourceKeyTimeCount: model.keyTimes.length,
      maximumSampleGapSeconds: sampleTimes.reduce((max, t, i) => Math.max(max, i ? t - sampleTimes[i - 1] : 0), 0),
      temporalCoverage: 'all-source-keys-and-interval-quartiles-plus-uniform-samples', continuousTimeCertified: false,
      geometryCoverage: 'all-visible-vertices-conservative-skin-influence-bounds', vertexCount: model.vertexCount, geometryCount: model.geometryCount,
      includesConstructionPose: true, motionBounds: volume, constructionBounds: finishBounds(restBounds), normalizedBounds: finishBounds(normalized), projectedBounds: finishBounds(projected),
      minimumCameraClearanceMeters: clearance, maximumDepthMagnification: distance / clearance,
      cameraDistanceMeters: distance, fovDegrees, viewportPerInch: VIEWPORT_PER_INCH,
      maximumProjectedSizeInches: [2 * halfWidth * viewport / VIEWPORT_PER_INCH, 2 * halfHeight * viewport / VIEWPORT_PER_INCH],
      nativePlaybackVerified: false,
    },
  }
}
