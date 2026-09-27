// Maintainer-only, read-only motion evidence. This is a source-derived pose
// regression gate, not a claim of native playback, skin quality, or release approval.
import { createHash } from 'node:crypto'
import { AnimationMixer, InterpolateDiscrete, InterpolateLinear, LoopOnce, Matrix4, PropertyBinding, Quaternion, Vector3 } from 'three'
import { parseGlb } from '../ir/kinetic-transplant.mjs'

const SAMPLE_SCHEMA = 'betterpptx.skeletal-motion-samples.v1'
const CORE_ROLES = ['root', 'head', 'leftFoot', 'rightFoot']
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => Object.assign(new Error(message), { code: 'SKELETAL_MOTION_PROOF_INVALID' })
const requireThat = (condition, message) => { if (!condition) throw fail(message) }
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
const subtract = (a, b) => a.map((value, axis) => value - b[axis])
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0)
const average = values => [0, 1, 2].map(axis => values.reduce((sum, value) => sum + value[axis], 0) / values.length)
const normalized = value => { const length = Math.hypot(...value); return value.map(component => component / length) }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * @typedef {Object} SkeletalMotionSamplingOptions
 * @property {Record<string, string>} landmarks Explicit semantic role to exact node identity.
 * Required roles: root, head, leftFoot, rightFoot. Additional roles are compared too.
 * @property {number} [sampleRateHz=30] Uniform samples plus all original key times.
 * @property {number} [maximumSamples=20000] Fail closed instead of silently decimating.
 * @property {number} [animationIndex] Exact zero-based GLB index; never a channel number.
 * @property {string} [animationName] Exact Object3D take; required for multiple takes.
 * @property {Uint8Array} [restGlbBuffer] Optional construction-rest GLB, not a display pose.
 */

function validateLandmarks(landmarks) {
  requireThat(landmarks && typeof landmarks === 'object' && !Array.isArray(landmarks), 'Explicit semantic landmark identities are required.')
  const entries = Object.entries(landmarks)
  requireThat(entries.length >= 4 && entries.length <= 128 && CORE_ROLES.every(role => Object.hasOwn(landmarks, role)), 'A biped pose proof requires root, head, leftFoot, and rightFoot roles.')
  requireThat(entries.every(([role, name]) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(role) && typeof name === 'string' && name.trim() === name && name.length > 0), 'Landmark roles and exact node identities must be valid.')
  requireThat(new Set(entries.map(([, name]) => name)).size === entries.length, 'Each semantic role must identify a different node.')
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))
}

function validateSamplingOptions(options, keys) {
  requireThat(options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).every(key => [...keys, 'landmarks', 'sampleRateHz', 'maximumSamples'].includes(key)), 'Unknown or incompatible skeletal sampling options are unsupported.')
}

function sampleTimes(durationMs, keyTimesMs, { sampleRateHz = 30, maximumSamples = 20000 } = {}) {
  requireThat(Number.isFinite(durationMs) && durationMs > 0 && durationMs <= 3600000, 'A finite positive motion clock of at most one hour is required.')
  requireThat(Number.isFinite(sampleRateHz) && sampleRateHz >= 1 && sampleRateHz <= 240, 'The sampling rate must be between 1 and 240 Hz.')
  requireThat(Number.isSafeInteger(maximumSamples) && maximumSamples >= 2 && maximumSamples <= 100000, 'The sample resource bound must be between 2 and 100000.')
  const count = Math.ceil(durationMs / 1000 * sampleRateHz)
  requireThat(count + 1 <= maximumSamples, 'The requested uniform sampling exceeds the resource bound.')
  const times = new Set([0, durationMs])
  for (let index = 1; index < count; index++) times.add(index / sampleRateHz * 1000)
  for (const time of keyTimesMs) {
    requireThat(Number.isFinite(time) && time >= 0 && time <= durationMs + 1e-5, 'Source key times must lie within the selected clip clock.')
    times.add(Math.min(time, durationMs))
    requireThat(times.size <= maximumSamples, 'The original key times exceed the sample resource bound.')
  }
  return [...times].sort((a, b) => a - b)
}

function selectNodes(nodes, landmarks, nameOf) {
  const byName = new Map()
  for (const node of nodes) {
    const name = nameOf(node)
    if (!Object.values(landmarks).includes(name)) continue
    requireThat(!byName.has(name), 'A requested landmark has ambiguous node identity.')
    byName.set(name, node)
  }
  return Object.fromEntries(Object.entries(landmarks).map(([role, name]) => {
    requireThat(byName.has(name), `The ${role} landmark is absent from the skeleton.`)
    return [role, byName.get(name)]
  }))
}

/**
 * Independently evaluate a parsed FBX/native Object3D. The object is cloned and
 * all poses are sampled by AnimationMixer, not by the FBX-to-GLB converter.
 * Bone names use the importer's originalName when present. No input is mutated.
 * @param {import('three').Object3D & {animations: import('three').AnimationClip[]}} object
 * @param {SkeletalMotionSamplingOptions} options
 */
export function sampleObjectSkeletalMotion(object, options = {}) {
  requireThat(object?.isObject3D, 'A parsed skeletal Object3D is required.')
  validateSamplingOptions(options, ['animationName'])
  const landmarks = validateLandmarks(options.landmarks)
  const candidates = (object.animations || []).filter(clip => options.animationName === undefined || clip.name === options.animationName)
  requireThat(candidates.length === 1, 'Select one unambiguous source animation.')
  const clip = candidates[0]
  requireThat(clip.tracks?.length > 0, 'The selected source animation has no tracks.')
  const copy = object.clone(true), nodes = []
  copy.traverse(node => nodes.push(node))
  const selected = selectNodes(nodes, landmarks, node => node.userData?.originalName || node.name)
  const names = new Map()
  for (const node of nodes) if (node.name) {
    const previous = names.get(node.name)
    names.set(node.name, previous === undefined ? node : null)
  }
  const keyTimes = [], channels = new Set()
  for (const track of clip.tracks) {
    const binding = PropertyBinding.parseTrackName(track.name)
    requireThat(binding.objectName === undefined && binding.objectIndex === undefined && binding.propertyIndex === undefined && names.get(binding.nodeName), 'Only unambiguous named node animation bindings are supported.')
    const components = { position: 3, quaternion: 4, scale: 3 }[binding.propertyName]
    requireThat(components && [InterpolateLinear, InterpolateDiscrete].includes(track.getInterpolation()), 'Only LINEAR or STEP skeletal TRS tracks are supported.')
    const key = `${binding.nodeName}:${binding.propertyName}`
    requireThat(!channels.has(key), 'Duplicate source animation channels are unsupported.')
    channels.add(key)
    requireThat(track.times.length > 0 && track.values.length === track.times.length * components && Array.from(track.values).every(Number.isFinite), 'Source tracks must have finite complete values.')
    Array.from(track.times).forEach((time, index) => {
      requireThat(time >= 0 && Number.isFinite(time) && (index === 0 || time > track.times[index - 1]), 'Source key times must be strictly increasing.')
      const value = Array.from(track.values.slice(index * components, (index + 1) * components))
      if (binding.propertyName === 'quaternion') requireThat(Math.abs(Math.hypot(...value) - 1) < 1e-4, 'Source animation rotations must be normalized.')
      if (binding.propertyName === 'scale') requireThat(value.every(component => component !== 0), 'Degenerate source animation scale is unsupported.')
      keyTimes.push(time * 1000)
    })
  }
  const timesMs = sampleTimes(clip.duration * 1000, keyTimes, options)
  const positions = () => Object.fromEntries(Object.entries(selected).map(([role, node]) => [role, node.getWorldPosition(new Vector3()).toArray()]))
  copy.updateMatrixWorld(true)
  const rest = positions()
  const mixer = new AnimationMixer(copy), action = mixer.clipAction(clip)
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play()
  let frames
  try {
    frames = timesMs.map(time => { mixer.setTime(time / 1000); copy.updateMatrixWorld(true); return positions() })
  } finally { mixer.stopAllAction(); mixer.uncacheRoot(copy) }
  return { schemaVersion: SAMPLE_SCHEMA, evaluator: 'native-object-animation-mixer', animationName: clip.name, durationMs: clip.duration * 1000, landmarks, timesMs, rest, frames }
}

function glbSkeleton(buffer) {
  requireThat(buffer instanceof Uint8Array && buffer.length > 0 && buffer.length <= 256 * 1024 * 1024, 'An embedded motion GLB of at most 256 MiB is required.')
  const { json, bin } = parseGlb(Buffer.from(buffer))
  const nodes = json.nodes || []
  requireThat(nodes.length > 0 && nodes.length <= 10000, 'A bounded GLB node hierarchy is required.')
  requireThat(json.buffers?.length === 1 && !json.buffers[0].uri, 'Only one embedded animation buffer is supported.')
  const parents = Array(nodes.length).fill(-1)
  const locals = nodes.map((node, parent) => {
    for (const child of node.children || []) {
      requireThat(Number.isSafeInteger(child) && child >= 0 && child < nodes.length && child !== parent && parents[child] === -1, 'The skeleton must be a valid single-parent hierarchy.')
      parents[child] = parent
    }
    if (node.matrix !== undefined) {
      requireThat(Array.isArray(node.matrix) && node.matrix.length === 16 && node.matrix.every(Number.isFinite), 'Rest matrices must be finite.')
      const matrix = new Matrix4().fromArray(node.matrix)
      requireThat(Math.abs(matrix.determinant()) > 1e-12, 'Degenerate rest matrices are unsupported.')
      return { matrix }
    }
    const translation = node.translation || [0, 0, 0], rotation = node.rotation || [0, 0, 0, 1], scale = node.scale || [1, 1, 1]
    requireThat(vector(translation) && vector(scale) && scale.every(value => value !== 0) && Array.isArray(rotation) && rotation.length === 4 && rotation.every(Number.isFinite) && Math.abs(Math.hypot(...rotation) - 1) < 1e-4, 'Rest transforms must be finite and non-degenerate with normalized rotations.')
    return { translation, rotation, scale }
  })
  const order = [], states = new Uint8Array(nodes.length)
  function visit(index) {
    requireThat(states[index] !== 1, 'Cyclic skeleton hierarchies are unsupported.')
    if (states[index] === 2) return
    states[index] = 1
    if (parents[index] >= 0) visit(parents[index])
    states[index] = 2; order.push(index)
  }
  for (let index = 0; index < nodes.length; index++) visit(index)
  const world = overrides => {
    const matrices = []
    for (const index of order) {
      const rest = locals[index], pose = overrides?.get(index)
      const local = rest.matrix ? rest.matrix.clone() : new Matrix4().compose(new Vector3().fromArray(pose?.translation || rest.translation), new Quaternion().fromArray(pose?.rotation || rest.rotation), new Vector3().fromArray(pose?.scale || rest.scale))
      matrices[index] = parents[index] < 0 ? local : new Matrix4().multiplyMatrices(matrices[parents[index]], local)
    }
    return matrices
  }
  function accessor(index, components) {
    const item = json.accessors?.[index], expectedType = { 1: 'SCALAR', 3: 'VEC3', 4: 'VEC4' }[components]
    requireThat(item && item.type === expectedType && item.componentType === 5126 && !item.normalized && !item.sparse && Number.isSafeInteger(item.count) && item.count > 0 && item.count <= 100000, 'Only bounded dense FLOAT animation accessors are supported.')
    const view = json.bufferViews?.[item.bufferView]
    requireThat(view && view.buffer === 0 && Number.isSafeInteger(view.byteLength) && view.byteLength > 0, 'Animation buffer views must be embedded and nonempty.')
    const viewOffset = view.byteOffset ?? 0, offset = item.byteOffset ?? 0, stride = view.byteStride ?? components * 4
    requireThat([viewOffset, offset, stride].every(Number.isSafeInteger) && viewOffset >= 0 && offset >= 0 && stride >= components * 4 && stride % 4 === 0 && (viewOffset + offset) % 4 === 0 && offset + (item.count - 1) * stride + components * 4 <= view.byteLength && viewOffset + view.byteLength <= bin.length, 'Animation accessor bounds or strides are invalid.')
    return Array.from({ length: item.count }, (_, row) => {
      const value = Array.from({ length: components }, (_, axis) => bin.readFloatLE(viewOffset + offset + row * stride + axis * 4))
      requireThat(value.every(Number.isFinite), 'Animation samples must be finite.')
      return components === 1 ? value[0] : value
    })
  }
  return { json, nodes, locals, world, accessor }
}

function glbPositions(skeleton, landmarks, world) {
  const selected = selectNodes(skeleton.nodes.map((node, index) => ({ ...node, index })), landmarks, node => node.name)
  return Object.fromEntries(Object.entries(selected).map(([role, node]) => [role, new Vector3().setFromMatrixPosition(world[node.index]).toArray()]))
}

/** Independently evaluate an exact GLB clip, including parent/root transforms. */
export function sampleGlbSkeletalMotion(buffer, options = {}) {
  validateSamplingOptions(options, ['animationIndex', 'restGlbBuffer'])
  const landmarks = validateLandmarks(options.landmarks), skeleton = glbSkeleton(buffer)
  requireThat(Number.isSafeInteger(options.animationIndex) && options.animationIndex >= 0, 'An exact zero-based animation index is required.')
  const animation = skeleton.json.animations?.[options.animationIndex]
  requireThat(animation && animation.channels?.length > 0, 'The selected GLB animation does not exist or has no channels.')
  const seen = new Set(), keyTimes = []
  const channels = animation.channels.map(channel => {
    const node = channel.target?.node, path = channel.target?.path, components = { translation: 3, rotation: 4, scale: 3 }[path]
    requireThat(Number.isSafeInteger(node) && node >= 0 && node < skeleton.nodes.length && components && !skeleton.locals[node].matrix, 'Only node-TRS animation targets are supported; matrix-node animation must not be guessed.')
    const key = `${node}:${path}`
    requireThat(!seen.has(key), 'Duplicate GLB animation channels are unsupported.'); seen.add(key)
    const sampler = animation.samplers?.[channel.sampler], interpolation = sampler?.interpolation || 'LINEAR'
    requireThat(sampler && ['LINEAR', 'STEP'].includes(interpolation), 'Unsupported GLB interpolation cannot be silently approximated.')
    const times = skeleton.accessor(sampler.input, 1), values = skeleton.accessor(sampler.output, components)
    requireThat(times.length === values.length && times.every((time, index) => time >= 0 && (index === 0 || time > times[index - 1])), 'Animation timestamps must be nonnegative, strictly increasing, and match outputs.')
    if (path === 'rotation') requireThat(values.every(value => Math.abs(Math.hypot(...value) - 1) < 1e-4), 'Animation rotations must be normalized.')
    if (path === 'scale') requireThat(values.every(value => value.every(component => component !== 0)), 'Degenerate animated scale is unsupported.')
    keyTimes.push(...times.map(time => time * 1000))
    return { node, path, interpolation, times, values }
  })
  const durationMs = keyTimes.reduce((maximum, time) => Math.max(maximum, time), 0), timesMs = sampleTimes(durationMs, keyTimes, options)
  const restSkeleton = options.restGlbBuffer ? glbSkeleton(options.restGlbBuffer) : skeleton
  const rest = glbPositions(restSkeleton, landmarks, restSkeleton.world())
  const at = (channel, time) => {
    const { times, values } = channel
    if (time <= times[0]) return values[0]
    if (time >= times.at(-1)) return values.at(-1)
    let low = 0, high = times.length - 1
    while (high - low > 1) { const middle = (low + high) >> 1; if (times[middle] <= time) low = middle; else high = middle }
    if (channel.interpolation === 'STEP') return values[low]
    const fraction = (time - times[low]) / (times[high] - times[low])
    return channel.path === 'rotation' ? new Quaternion().fromArray(values[low]).slerp(new Quaternion().fromArray(values[high]), fraction).toArray() : values[low].map((value, axis) => value + (values[high][axis] - value) * fraction)
  }
  const frames = timesMs.map(time => {
    const overrides = new Map()
    for (const channel of channels) {
      const pose = overrides.get(channel.node) || {}; pose[channel.path] = at(channel, time / 1000); overrides.set(channel.node, pose)
    }
    return glbPositions(skeleton, landmarks, skeleton.world(overrides))
  })
  return { schemaVersion: SAMPLE_SCHEMA, evaluator: 'independent-glb-forward-kinematics', assetSha256: sha256(buffer), restSha256: sha256(options.restGlbBuffer || buffer), animationIndex: options.animationIndex, animationName: animation.name || '', durationMs, landmarks, timesMs, rest, frames }
}

function normalizeSamples(samples, { motionReference = 'construction-rest' } = {}) {
  requireThat(samples?.schemaVersion === SAMPLE_SCHEMA, 'An explicit skeletal sample record is required.')
  requireThat(['construction-rest', 'first-frame'].includes(motionReference), 'The skeletal motion reference must be construction-rest or first-frame.')
  const landmarks = validateLandmarks(samples.landmarks), roles = Object.keys(landmarks)
  requireThat(Number.isFinite(samples.durationMs) && samples.durationMs > 0 && Array.isArray(samples.timesMs) && samples.timesMs.length >= 2 && samples.timesMs.length <= 100000 && samples.timesMs.length === samples.frames?.length, 'Sample clocks and frame counts must agree.')
  requireThat(samples.timesMs[0] === 0 && Math.abs(samples.timesMs.at(-1) - samples.durationMs) < 1e-5 && samples.timesMs.every((time, index) => Number.isFinite(time) && time >= 0 && (index === 0 || time > samples.timesMs[index - 1])), 'Samples must include both endpoints on a strictly increasing clock.')
  requireThat([samples.rest, ...samples.frames].every(frame => frame && roles.every(role => vector(frame[role]))), 'Every frame and the construction rest must contain all finite landmarks.')
  const origin = average([samples.rest.leftFoot, samples.rest.rightFoot]), upVector = subtract(samples.rest.head, origin), stature = Math.hypot(...upVector)
  requireThat(stature > 1e-8, 'Construction-rest stature is degenerate.')
  const up = normalized(upVector), lateral = subtract(samples.rest.rightFoot, samples.rest.leftFoot)
  const orthogonalRight = subtract(lateral, up.map(value => value * dot(lateral, up)))
  requireThat(Math.hypot(...orthogonalRight) / stature > 1e-4, 'Construction-rest feet must establish a nondegenerate lateral axis.')
  const right = normalized(orthogonalRight), forward = normalized(cross(right, up))
  const project = value => [dot(value, right) / stature, dot(value, up) / stature, dot(value, forward) / stature]
  // The REST basis is fixed for the entire clip. Following the animated pelvis
  // basis would normalize away exactly the unintended inversion being tested.
  const projectedFrames = samples.frames.map(frame => Object.fromEntries(roles.map(role => [role, project(subtract(frame[role], frame.root))])))
  const first = projectedFrames[0]
  const frames = motionReference === 'first-frame'
    ? projectedFrames.map(frame => Object.fromEntries(roles.map(role => [role, subtract(frame[role], first[role])])))
    : projectedFrames
  const normalizedRecord = { durationMs: samples.durationMs, timesMs: samples.timesMs, roles, motionReference, frames }
  return { ...normalizedRecord, stature, frame: { origin, up, right, forward }, fingerprint: sha256(JSON.stringify(normalizedRecord)) }
}

/**
 * @typedef {Object} SkeletalPoseComparisonOptions
 * @property {number} [expectedDurationScale=1] Explicit speed change; phase clocks align.
 * @property {number} [durationToleranceMs=2]
 * @property {number} [phaseToleranceMs=100] Source-clock tolerance, never whole-clip flip permission.
 * @property {number} [inversionThreshold=0.05] Hysteresis in construction-rest statures.
 * @property {number} [heightEnvelopeTolerance=0.3] Signed head/support-height range tolerance.
 * @property {number} [landmarkEnvelopeTolerance=0.35] Root-relative XYZ bounds in statures.
 * @property {'construction-rest'|'first-frame'} [motionReference='construction-rest'] Compare absolute construction-rest poses or motion deltas from the first sampled frame.
 */

/**
 * Source-derived biped semantic gate: compare normalized pose envelopes and
 * the source's local inversion windows. Genuine source flips are preserved;
 * merely having a flip somewhere in the source never licenses a new inversion.
 * Root translation is deliberately not scored (in-place/root-motion are distinct
 * authored policies); signed head/support and root-relative shape remain scored.
 */
export function compareSkeletalMotionPoses(sourceSamples, candidateSamples, options = {}) {
  const allowed = ['expectedDurationScale', 'durationToleranceMs', 'phaseToleranceMs', 'inversionThreshold', 'heightEnvelopeTolerance', 'landmarkEnvelopeTolerance', 'motionReference']
  requireThat(options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).every(key => allowed.includes(key)), 'Unknown pose-comparison options are unsupported.')
  const policy = { expectedDurationScale: 1, durationToleranceMs: 2, phaseToleranceMs: 100, inversionThreshold: .05, heightEnvelopeTolerance: .3, landmarkEnvelopeTolerance: .35, motionReference: 'construction-rest', ...options }
  requireThat(['construction-rest', 'first-frame'].includes(policy.motionReference), 'The skeletal motion reference must be construction-rest or first-frame.')
  requireThat(Object.entries(policy).filter(([key]) => key !== 'motionReference').every(([, value]) => Number.isFinite(value)) && policy.expectedDurationScale > 0 && policy.expectedDurationScale <= 100 && policy.durationToleranceMs >= 0 && policy.phaseToleranceMs >= 0 && policy.phaseToleranceMs <= 1000 && policy.inversionThreshold > 0 && policy.inversionThreshold <= .25 && policy.heightEnvelopeTolerance >= 0 && policy.heightEnvelopeTolerance <= 1 && policy.landmarkEnvelopeTolerance >= 0 && policy.landmarkEnvelopeTolerance <= 1, 'Pose-comparison tolerances must be finite and bounded.')
  const source = normalizeSamples(sourceSamples, policy), candidate = normalizeSamples(candidateSamples, policy)
  requireThat(JSON.stringify(source.roles) === JSON.stringify(candidate.roles), 'Source and candidate semantic role coverage must match exactly.')
  const failures = [], height = frame => frame.head[1] - (frame.leftFoot[1] + frame.rightFoot[1]) / 2
  const sourceHeights = source.frames.map(height), candidateHeights = candidate.frames.map(height)
  const range = values => values.reduce((bounds, value) => ({ minimum: Math.min(bounds.minimum, value), maximum: Math.max(bounds.maximum, value) }), { minimum: Infinity, maximum: -Infinity })
  const sourceRange = range(sourceHeights), candidateRange = range(candidateHeights)
  const durationDifferenceMs = Math.abs(candidate.durationMs - source.durationMs * policy.expectedDurationScale)
  if (durationDifferenceMs > policy.durationToleranceMs) failures.push({ code: 'CLOCK_MISMATCH', durationDifferenceMs })
  const normalizedTimes = candidate.timesMs.map(time => time / candidate.durationMs * source.durationMs)
  const unexpected = [], missing = []
  function minimumNear(times, values, time) {
    let low = 0, high = times.length - 1
    while (high - low > 1) { const middle = (low + high) >> 1; if (times[middle] <= time) low = middle; else high = middle }
    const near = []
    const exact = times[high] === time ? values[high] : values[low] + (values[high] - values[low]) * (time - times[low]) / (times[high] - times[low])
    near.push(exact)
    for (let index = low; index >= 0 && time - times[index] <= policy.phaseToleranceMs; index--) near.push(values[index])
    for (let index = high; index < times.length && times[index] - time <= policy.phaseToleranceMs; index++) near.push(values[index])
    return Math.min(...near)
  }
  for (let index = 0; index < candidateHeights.length; index++) if (candidateHeights[index] < -policy.inversionThreshold && minimumNear(source.timesMs, sourceHeights, normalizedTimes[index]) > -policy.inversionThreshold) unexpected.push({ candidateTimeMs: candidate.timesMs[index], sourcePhaseTimeMs: normalizedTimes[index], normalizedHeight: candidateHeights[index] })
  for (let index = 0; index < sourceHeights.length; index++) if (sourceHeights[index] < -policy.inversionThreshold && minimumNear(normalizedTimes, candidateHeights, source.timesMs[index]) > -policy.inversionThreshold) missing.push({ sourceTimeMs: source.timesMs[index], normalizedHeight: sourceHeights[index] })
  if (unexpected.length) failures.push({ code: 'UNEXPECTED_INVERSION', sampleCount: unexpected.length, first: unexpected[0], worst: unexpected.reduce((a, b) => a.normalizedHeight < b.normalizedHeight ? a : b) })
  if (missing.length) failures.push({ code: 'SOURCE_INVERSION_NOT_PRESERVED', sampleCount: missing.length, first: missing[0] })
  const heightEnvelopeError = Math.max(Math.abs(sourceRange.minimum - candidateRange.minimum), Math.abs(sourceRange.maximum - candidateRange.maximum))
  if (heightEnvelopeError > policy.heightEnvelopeTolerance) failures.push({ code: 'HEIGHT_ENVELOPE_REGRESSION', maximumError: heightEnvelopeError })
  const landmarkEnvelopes = source.roles.map(role => {
    const sourceBounds = [0, 1, 2].map(axis => range(source.frames.map(frame => frame[role][axis])))
    const candidateBounds = [0, 1, 2].map(axis => range(candidate.frames.map(frame => frame[role][axis])))
    const maximumError = Math.max(...sourceBounds.flatMap((bound, axis) => [Math.abs(bound.minimum - candidateBounds[axis].minimum), Math.abs(bound.maximum - candidateBounds[axis].maximum)]))
    if (maximumError > policy.landmarkEnvelopeTolerance) failures.push({ code: 'LANDMARK_ENVELOPE_REGRESSION', role, maximumError })
    return { role, source: sourceBounds, candidate: candidateBounds, maximumError }
  })
  const summary = (input, normalizedSamples, heights) => ({ animationName: input.animationName, animationIndex: input.animationIndex, assetSha256: input.assetSha256, restSha256: input.restSha256, samplesSha256: normalizedSamples.fingerprint, evaluator: input.evaluator, durationMs: input.durationMs, sampleCount: input.frames.length, constructionRestStature: normalizedSamples.stature, normalizationFrame: normalizedSamples.frame, heightEnvelope: range(heights), invertedSampleCount: heights.filter(value => value < -policy.inversionThreshold).length })
  return { schemaVersion: 'betterpptx.skeletal-motion-pose-regression.v1', status: failures.length ? 'FAIL' : 'PASS',
    scope: 'source-derived sampled skeletal pose regression; native playback and mesh deformation remain separate gates',
    rootTranslationCompared: false, normalization: `${policy.motionReference === 'first-frame' ? 'first-frame motion deltas; ' : ''}fixed-construction-rest-basis; root-relative positions; stature units`, policy,
    source: summary(sourceSamples, source, sourceHeights), candidate: summary(candidateSamples, candidate, candidateHeights),
    heightEnvelopeError, landmarkEnvelopes, failures }
}
