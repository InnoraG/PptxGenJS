// Maintainer-only source conversion. Preserve the FBX's evaluated local basis;
// never auto-orient bones or copy local rotations onto a different skeleton.
// Public clients receive embedded project assets, never this source library.
import { createHash } from 'node:crypto'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { InterpolateDiscrete, InterpolateLinear, LoadingManager, Matrix4, PropertyBinding } from 'three'
import { serializeGlb } from '../ir/kinetic-transplant.mjs'

const fail = message => Object.assign(new Error(message), { code: 'NATIVE_MOTION_SOURCE_INVALID' })
const requireThat = (condition, message) => { if (!condition) throw fail(message) }
const finite = values => Array.from(values).every(Number.isFinite)
const PATHS = Object.freeze({ position: ['translation', 3, 'VEC3'], quaternion: ['rotation', 4, 'VEC4'], scale: ['scale', 3, 'VEC3'] })

/**
 * @typedef {Object} NativeMotionSourceOptions
 * @property {string} animationName Exact name of the resulting source animation.
 * @property {string} [sourceAnimationName] Required when the FBX contains several takes.
 * @property {number} [maximumInputBytes] Maintainer resource bound (default 128 MiB).
 */

/**
 * Convert one imported skeletal scene without changing its basis or cadence.
 * This lower-level pure entry point also permits synthetic basis-regression tests.
 * No file, network, application or asset-registry mutation occurs.
 * @param {import('three').Object3D & {animations: import('three').AnimationClip[]}} object
 * @param {NativeMotionSourceOptions} options
 * @returns {{buffer: Buffer, report: Object}}
 */
export function nativeMotionObjectToGlb(object, { animationName, sourceAnimationName } = {}) {
  requireThat(object?.isObject3D, 'A parsed skeletal object is required.')
  requireThat(typeof animationName === 'string' && animationName.trim() === animationName && animationName.length > 0 && animationName.length <= 160, 'A nonempty exact output animation name is required.')
  const clips = object.animations || []
  const candidates = sourceAnimationName === undefined ? clips : clips.filter(clip => clip.name === sourceAnimationName)
  requireThat(candidates.length === 1, 'Select exactly one unambiguous source animation.')
  const clip = candidates[0]
  requireThat(Number.isFinite(clip.duration) && clip.duration > 0 && clip.tracks?.length, 'The source animation must have a positive clock and tracks.')
  const retained = new Set()
  object.traverse(node => {
    if (!node.isBone) return
    for (let parent = node; parent; parent = parent.parent) {
      retained.add(parent)
      if (parent === object) break
    }
  })
  requireThat(retained.size > 0, 'The source contains no named skeletal bones.')
  const originals = []
  object.traverse(node => { if (retained.has(node)) originals.push(node) })
  const indexByObject = new Map(originals.map((node, index) => [node, index]))
  const byBindingName = new Map()
  const byOutputName = new Set()
  const names = []
  const nodes = originals.map((node, index) => {
    const originalName = node.userData?.originalName || node.name
    requireThat(!node.isBone || (typeof originalName === 'string' && originalName.length > 0), 'Every source bone requires an exact identity.')
    const outputName = originalName || `source-frame-${index}`
    requireThat(!byOutputName.has(outputName), 'Source bone/frame names are ambiguous.')
    byOutputName.add(outputName)
    if (node.name) {
      requireThat(!byBindingName.has(node.name), 'Animation binding names are ambiguous.')
      byBindingName.set(node.name, node)
    }
    const translation = node.position.toArray(), rotation = node.quaternion.toArray(), scale = node.scale.toArray()
    requireThat(finite([...translation, ...rotation, ...scale]) && scale.every(value => value !== 0), 'Source rest transforms must be finite and non-degenerate.')
    requireThat(Math.abs(Math.hypot(...rotation) - 1) < 1e-5, 'Source rest rotations must be normalized.')
    const recomposed = new Matrix4().compose(node.position, node.quaternion, node.scale)
    requireThat(recomposed.elements.every((value, i) => Math.abs(value - node.matrix.elements[i]) < 1e-4 * Math.max(1, Math.abs(value))), 'Sheared source transforms cannot be represented losslessly by skeletal TRS.')
    names.push({ bindingName: node.name, originalName: outputName, bone: node.isBone === true })
    return { name: outputName, translation, rotation, scale,
      ...(node.children.some(child => retained.has(child)) ? { children: node.children.filter(child => retained.has(child)).map(child => indexByObject.get(child)) } : {}) }
  })
  const chunks = [], bufferViews = [], accessors = []
  let byteLength = 0
  const append = (values, components, type) => {
    const data = Buffer.alloc(values.length * 4)
    const minimum = Array(components).fill(Infinity), maximum = Array(components).fill(-Infinity)
    values.forEach((value, i) => {
      data.writeFloatLE(value, i * 4)
      minimum[i % components] = Math.min(minimum[i % components], value)
      maximum[i % components] = Math.max(maximum[i % components], value)
    })
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length })
    byteLength += data.length
    chunks.push(data)
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: values.length / components, type, min: minimum, max: maximum })
    return accessors.length - 1
  }
  const channels = [], samplers = [], seenChannels = new Set(), trackReport = []
  let signChanges = 0, maximumTime = 0, minimumTime = Infinity
  for (const track of clip.tracks) {
    const binding = PropertyBinding.parseTrackName(track.name)
    requireThat(binding.objectName === undefined && binding.objectIndex === undefined && binding.propertyIndex === undefined, 'Only exact node TRS animation bindings are supported.')
    const target = byBindingName.get(binding.nodeName)
    requireThat(target && retained.has(target), 'The source contains a track outside its supported skeletal hierarchy.')
    const definition = PATHS[binding.propertyName]
    requireThat(definition, 'Unsupported skeletal animation property; no tracks may be silently dropped.')
    const [targetPath, components, type] = definition
    const key = `${indexByObject.get(target)}:${targetPath}`
    requireThat(!seenChannels.has(key), 'The source contains duplicate animation channels.')
    seenChannels.add(key)
    const interpolation = track.getInterpolation()
    requireThat([InterpolateLinear, InterpolateDiscrete].includes(interpolation), 'Only source LINEAR and STEP interpolation are supported.')
    const times = Array.from(track.times), values = Array.from(track.values)
    requireThat(times.length > 0 && values.length === times.length * components && finite(times) && finite(values), 'Animation accessor lengths and values must be valid.')
    requireThat(times.every((time, index) => time >= 0 && (index === 0 || time > times[index - 1])), 'Source timestamps must be nonnegative and strictly increasing.')
    let changed = 0
    if (targetPath === 'rotation') for (let index = 0; index < times.length; index++) {
      const offset = index * 4, q = values.slice(offset, offset + 4)
      requireThat(Math.abs(Math.hypot(...q) - 1) < 1e-4, 'Animation quaternions must be normalized.')
      // q and -q are the same orientation. Canonicalize only hemisphere signs;
      // there is no filtering, resampling, new pose, or altered motion amplitude.
      if (index > 0 && q.reduce((sum, value, axis) => sum + value * values[offset - 4 + axis], 0) < 0) {
        for (let axis = 0; axis < 4; axis++) values[offset + axis] *= -1
        changed++
      }
    }
    signChanges += changed
    minimumTime = Math.min(minimumTime, times[0]); maximumTime = Math.max(maximumTime, times.at(-1))
    const input = append(times, 1, 'SCALAR'), output = append(values, components, type)
    samplers.push({ input, output, interpolation: interpolation === InterpolateDiscrete ? 'STEP' : 'LINEAR' })
    channels.push({ sampler: samplers.length - 1, target: { node: indexByObject.get(target), path: targetPath } })
    trackReport.push({ node: names[indexByObject.get(target)].originalName, path: targetPath, keys: times.length, firstTime: times[0], lastTime: times.at(-1), hemisphereSignChanges: changed })
  }
  requireThat(maximumTime > 0 && Math.abs(maximumTime - clip.duration) < 1e-5, 'The exported clock must equal the selected source animation clock.')
  requireThat(channels.some(channel => channel.target.path === 'rotation'), 'A skeletal motion source requires rotations.')
  const binary = Buffer.concat(chunks)
  const buffer = serializeGlb({ asset: { version: '2.0', generator: 'native-axis-motion-source-v1' }, scene: 0,
    scenes: [{ nodes: originals.map((node, index) => retained.has(node.parent) ? -1 : index).filter(index => index >= 0) }],
    nodes, buffers: [{ byteLength }], bufferViews, accessors, animations: [{ name: animationName, samplers, channels }] }, binary)
  return { buffer, report: { schemaVersion: 'betterpptx.native-axis-motion-source.v1', sourceAnimationName: clip.name, animationName,
    sourceDurationMs: Math.round(clip.duration * 1000), outputDurationMs: Math.round(maximumTime * 1000), firstTimeSeconds: minimumTime,
    boneCount: originals.filter(node => node.isBone).length, nodeCount: nodes.length, channelCount: channels.length,
    originalNamesPreserved: true, sourceBasisPreserved: true, sourceClockPreserved: true,
    automaticBoneOrientation: false, canonicalSkeletonRetarget: false, animationResampling: false, animationSmoothing: false, constructionBoundaryKeysAdded: false,
    rotationHemisphereSignChanges: signChanges, sourceOnly: true, names, tracks: trackReport,
    outputBytes: buffer.length, outputSha256: createHash('sha256').update(buffer).digest('hex') } }
}

/**
 * Parse a motion FBX using the installed native FBX importer and convert its
 * original skeleton. External texture/resource requests fail closed.
 * @param {Uint8Array} input
 * @param {NativeMotionSourceOptions} options
 * @returns {{buffer: Buffer, report: Object}}
 */
export function nativeFbxMotionSource(input, options = {}) {
  requireThat(input instanceof Uint8Array, 'FBX source bytes are required.')
  const maximumInputBytes = options.maximumInputBytes ?? 128 * 1024 * 1024
  requireThat(Number.isSafeInteger(maximumInputBytes) && maximumInputBytes > 0 && input.length > 0 && input.length <= maximumInputBytes, 'FBX source bytes exceed the allowed input bound.')
  const bytes = Buffer.from(input)
  const manager = new LoadingManager()
  manager.setURLModifier(() => { throw fail('External FBX resources are not allowed during motion-source conversion.') })
  let object
  try { object = new FBXLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '') }
  catch (error) { throw fail(`FBX motion import failed: ${error?.message || error}`) }
  const result = nativeMotionObjectToGlb(object, options)
  return { buffer: result.buffer, report: { ...result.report, sourceBytes: bytes.length, sourceSha256: createHash('sha256').update(bytes).digest('hex') } }
}
