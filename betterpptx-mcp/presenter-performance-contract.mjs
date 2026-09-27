// Public, identity-independent choreography. The author owns slide geometry;
// the compiler realizes the declared motion IDs, exact frames and travel centers.
export const PRESENTER_PERFORMANCE_LIMITS = Object.freeze({
  maximumActions: 32,
  maximumDurationMs: 120000,
  actionDurationMs: Object.freeze([100, 60000]),
  maximumCycles: 30,
  maximumBlendMs: 2000,
  maximumTransformKeyframes: 128,
  maximumTravelKeyframes: 64,
  maximumInteractions: 32,
  maximumSelectedMotionIdsPerPresenter: 18,
  maximumStartMs: 60000,
  maximumEntryExitDurationMs: 10000,
  fpsRange: Object.freeze([1, 60]),
})

const motionIdSchema = { type: 'string', pattern: '^motion\\.[a-z0-9-]+\\.[a-z0-9-]+$' }
const millis = (minimum = 0, maximum = PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs) => ({ type: 'integer', minimum, maximum })
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) })
const easing = { type: 'string', enum: ['linear', 'smooth', 'easeIn', 'easeOut'] }
const actionSchema = object({
  id: { type: 'string', minLength: 1, maxLength: 128 }, motionId: motionIdSchema,
  durationMs: millis(PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[0], PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1]),
  cycles: { type: 'integer', minimum: 1, maximum: PRESENTER_PERFORMANCE_LIMITS.maximumCycles },
  sourceStartMs: millis(), sourceEndMs: millis(1),
}, ['id', 'motionId', 'durationMs'])
const transformSchema = object({
  atMs: millis(), yawDegrees: { type: 'number', minimum: -1080, maximum: 1080 },
  pitchDegrees: { type: 'number', minimum: -180, maximum: 180 }, rollDegrees: { type: 'number', minimum: -180, maximum: 180 },
  scale: { type: 'number', minimum: 0.25, maximum: 3 }, depth: { type: 'number', minimum: -4, maximum: 4 },
  height: { type: 'number', minimum: 0, maximum: 4 }, easing,
}, ['atMs'])
const slideCenterSchema = object({ x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y'])
const slideFrameSchema = object({ x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 } }, ['x', 'y', 'w', 'h'])
const interactionSchema = object({
  actionId: { type: 'string', minLength: 1, maxLength: 128 },
  verb: { type: 'string', enum: ['touch', 'press', 'push', 'point-at', 'carry'] },
  target: { type: 'string', minLength: 1, maxLength: 256 },
  hand: { type: 'string', enum: ['left', 'right'] }, grabMs: millis(0, PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1]), dropMs: millis(1, PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1]),
}, ['actionId', 'verb', 'target'])
interactionSchema.allOf = [{
  if: { properties: { verb: { const: 'carry' } }, required: ['verb'] },
  then: { required: ['hand', 'grabMs', 'dropMs'] },
  else: { not: { anyOf: [{ required: ['hand'] }, { required: ['grabMs'] }, { required: ['dropMs'] }] } },
}]
const layeringSchema = object({
  mode: { type: 'string', enum: ['presenter-behind-targets'] },
  targets: { type: 'array', minItems: 1, maxItems: PRESENTER_PERFORMANCE_LIMITS.maximumInteractions * 2, items: { type: 'string', minLength: 1, maxLength: 256 } },
}, ['mode', 'targets'])
export const PRESENTER_PERFORMANCE_SCHEMA = object({
  actor: { type: 'string', minLength: 1, maxLength: 128 }, startMs: millis(0, PRESENTER_PERFORMANCE_LIMITS.maximumStartMs),
  actorInstanceId: { type: 'string', minLength: 1, maxLength: 256, description: 'Optional author-owned native 3-D object identity for this slide. Keep actor as the logical presenter ID; use distinct instance IDs when an explicit cross-slide handoff names each slide carrier.' },
  frame: { ...slideFrameSchema, description: 'Optional performance-local initial native presenter frame in slide inches. Required when no matching per-slide or actor frame is authored.' },
  blendMs: millis(0, PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs),
  fps: { type: 'integer', minimum: PRESENTER_PERFORMANCE_LIMITS.fpsRange[0], maximum: PRESENTER_PERFORMANCE_LIMITS.fpsRange[1], description: 'Optional native composition sampling rate; omit to use the supported default of 30 fps.' },
  actions: { type: 'array', minItems: 1, maxItems: PRESENTER_PERFORMANCE_LIMITS.maximumActions, items: actionSchema },
  transforms: { type: 'array', maxItems: PRESENTER_PERFORMANCE_LIMITS.maximumTransformKeyframes, items: transformSchema },
  travel: { type: 'array', maxItems: PRESENTER_PERFORMANCE_LIMITS.maximumTravelKeyframes, items: object({ atMs: millis(), center: slideCenterSchema, stage: { type: 'string', enum: ['left', 'center', 'right'] } }, ['atMs', 'center']) },
  entry: object({ type: { type: 'string', enum: ['drop', 'fade', 'appear'] }, durationMs: millis(0, PRESENTER_PERFORMANCE_LIMITS.maximumEntryExitDurationMs), fadeMs: millis(0, PRESENTER_PERFORMANCE_LIMITS.maximumEntryExitDurationMs), height: { type: 'number', minimum: 0, maximum: 4 } }, ['type']),
  exit: object({ type: { type: 'string', enum: ['fade', 'disappear'] }, atMs: millis(), durationMs: millis(0, PRESENTER_PERFORMANCE_LIMITS.maximumEntryExitDurationMs) }, ['type']),
  interactions: { type: 'array', maxItems: PRESENTER_PERFORMANCE_LIMITS.maximumInteractions, items: interactionSchema },
  layering: layeringSchema,
}, ['actions'])

export const PRESENTER_PERFORMANCE_CONTRACT = Object.freeze({
  schemaVersion: 'betterpptx.presenter-performance.v2',
  field: 'slides[].presenterPerformance', status: 'executable-exact-structured',
  purpose: 'A continuous, blended, native 3D performance on one slide for any supported presenter identity.',
  publicSchema: PRESENTER_PERFORMANCE_SCHEMA,
  timing: {
    unit: 'whole milliseconds', origin: 'performance start, shifted by startMs from slide start',
    actions: 'Actions run consecutively in authored order. durationMs controls each action; cycles repeats its selected motion segment.',
    sourceRange: 'Optional sourceStartMs and sourceEndMs select a segment on the original zero-based motion clock, including any initial hold, before retiming and repetition. Omitted bounds use zero and the original end. The range must fit inside the selected motion.',
    dropContact: 'A drop entrance controls the first action’s landing and grounded recovery. Later actions retain their authored airborne motion.',
    blend: 'Blend adjacent poses across their boundary without extending the authored clock. Blend windows are bounded by neighboring actions.',
    exit: 'By default the exit occupies the end of the last action. atMs can move it earlier within the performance.',
    silentPlayback: 'Explicit performances supply their own slide clock; narration, when present, must accommodate their endpoint.',
    carry: 'A carry requires hand, grabMs and dropMs. These whole-millisecond bounds are relative to its action, with 0 <= grabMs < dropMs <= action.durationMs. The named editable target follows that hand and authored stage travel between those bounds.',
  },
  coordinates: { placement: 'AI-authored initial frame and exact travel[].center points in slide inches; stage is an optional descriptive label, never a position source', transforms: 'Angles in degrees; uniform scale multiplier; height and depth in standing-body-height units.' },
  migration: 'Stage-only travel is not executable under AI-owned geometry and fails with PERFORMANCE_TRAVEL_GEOMETRY_REQUIRED. Author a center for every travel key, or omit travel for a stationary performance.',
  selection: 'Choose executable catalog motion IDs. The compiler derives their union when no bundle is authored; an explicit bundle must contain every selected action.',
  instanceIdentity: 'Optional actorInstanceId names this slide\'s native model carrier. actor remains the logical cast and motion-selection identity. Cross-slide continuity requires the authored endpoint instance ID to match this exact carrier on each slide.',
  realization: 'One continuous skeletal animation per presenter performance, with native editable entrance, travel, reactions and exit effects.',
  interactions: { verbs: ['touch', 'press', 'push', 'point-at', 'carry'], target: 'one named editable same-slide element per action', carry: 'projected hand-following target transport, not a three-dimensional collision or rigid-body simulation; the target may not have another animation owner' },
  layering: 'Optional explicit AI-authored native z-order. presenter-behind-targets moves only the named target objects after the presenter so their authored text/geometry remains readable; the engine does not infer or choose this policy.',
  sampling: { fieldPath: 'slides[].presenterPerformance.fps', scope: 'optional native composition sampling control', default: 30, range: PRESENTER_PERFORMANCE_LIMITS.fpsRange, unit: 'frames per second' },
  limits: PRESENTER_PERFORMANCE_LIMITS,
  editability: 'Replace or clear presenterPerformance through the same generate_from_spec edit route. Null removes the performance.',
  validation: 'Unknown fields, invalid timing, non-finite transforms, duplicate actions, unselected motions and missing targets are rejected before mutation.',
  example: {
    actor: 'presenter', startMs: 600, blendMs: 240,
    actions: [
      { id: 'opening', motionId: 'motion.ordinary.greet', durationMs: 900 },
      { id: 'explanation', motionId: 'motion.ordinary.present', durationMs: 3000 },
      { id: 'closing', motionId: 'motion.ordinary.bow', durationMs: 1000 },
    ],
    entry: { type: 'fade', durationMs: 450 }, exit: { type: 'fade', durationMs: 800 },
    transforms: [{ atMs: 0, yawDegrees: -10, scale: 1 }, { atMs: 1900, yawDegrees: 12, scale: 1.12 }, { atMs: 4900, yawDegrees: 0, scale: 1 }],
  },
})

function fail(path, message, code = 'PRESENTER_PERFORMANCE_INVALID') {
  const error = new Error(`${path}: ${message}`)
  error.code = code
  error.field = path
  throw error
}
function record(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object.')
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, 'is not a supported performance field.')
}
function num(value, fallback, path, min, max, integer = false) {
  const n = value === undefined ? fallback : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(path, `must be ${integer ? 'an integer' : 'a finite number'} from ${min} to ${max}.`)
  return n
}
function name(value, path, maximum = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(path, `must be a non-empty string of at most ${maximum} characters.`)
  return value.trim()
}
function member(value, choices, path) {
  if (!choices.includes(value)) fail(path, `must be one of ${choices.join(', ')}.`)
  return value
}
function slidePoint(value, path) {
  record(value, path, ['x', 'y'])
  return { x: num(value.x, undefined, `${path}.x`, -Number.MAX_VALUE, Number.MAX_VALUE), y: num(value.y, undefined, `${path}.y`, -Number.MAX_VALUE, Number.MAX_VALUE) }
}
function slideFrame(value, path) {
  record(value, path, ['x', 'y', 'w', 'h'])
  const point = slidePoint({ x: value.x, y: value.y }, path)
  const w = num(value.w, undefined, `${path}.w`, 0, Number.MAX_VALUE)
  const h = num(value.h, undefined, `${path}.h`, 0, Number.MAX_VALUE)
  if (w === 0 || h === 0) fail(path, 'width and height must be positive slide-inch values.')
  return { ...point, w, h }
}
function ordered(items, path, durationMs, max, map) {
  if (items === undefined) return []
  if (!Array.isArray(items) || items.length > max) fail(path, `must be an array with at most ${max} entries.`)
  let previous = -1
  return items.map((item, i) => {
    const p = `${path}[${i}]`
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(p, 'must be an object.')
    const atMs = num(item.atMs, undefined, `${p}.atMs`, 0, durationMs, true)
    if (atMs <= previous) fail(`${p}.atMs`, 'must be strictly increasing; duplicate or unsorted key times are not allowed.')
    previous = atMs
    return map(item, p, atMs)
  })
}

export function normalizePresenterPerformance(value, path = 'presenterPerformance') {
  if (value === undefined || value === null) return null
  record(value, path, Object.keys(PRESENTER_PERFORMANCE_SCHEMA.properties))
  if (!Array.isArray(value.actions) || !value.actions.length || value.actions.length > PRESENTER_PERFORMANCE_LIMITS.maximumActions) fail(`${path}.actions`, `must contain 1 to ${PRESENTER_PERFORMANCE_LIMITS.maximumActions} actions.`)
  const ids = new Set()
  const motions = new Set()
  let durationMs = 0
  const actions = value.actions.map((action, i) => {
    const p = `${path}.actions[${i}]`
    record(action, p, Object.keys(actionSchema.properties))
    const id = name(action.id, `${p}.id`)
    if (ids.has(id)) fail(`${p}.id`, 'action IDs must be unique.')
    ids.add(id)
    const motionId = name(action.motionId, `${p}.motionId`)
    if (!/^motion\.[a-z0-9-]+\.[a-z0-9-]+$/.test(motionId)) fail(`${p}.motionId`, 'must be an exact semantic motion.* catalog ID.')
    motions.add(motionId)
    const d = num(action.durationMs, undefined, `${p}.durationMs`, PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[0], PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1], true)
    durationMs += d
    const range = {}
    if (action.sourceStartMs !== undefined) range.sourceStartMs = num(action.sourceStartMs, undefined, `${p}.sourceStartMs`, 0, PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs, true)
    if (action.sourceEndMs !== undefined) range.sourceEndMs = num(action.sourceEndMs, undefined, `${p}.sourceEndMs`, 1, PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs, true)
    if (range.sourceEndMs !== undefined && range.sourceEndMs <= (range.sourceStartMs ?? 0)) fail(`${p}.sourceEndMs`, 'must be greater than sourceStartMs.')
    return { id, motionId, durationMs: d, cycles: num(action.cycles, 1, `${p}.cycles`, 1, PRESENTER_PERFORMANCE_LIMITS.maximumCycles, true), ...range }
  })
  if (durationMs > PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs) fail(`${path}.actions`, `total duration must not exceed ${PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs} milliseconds.`)
  if (motions.size > PRESENTER_PERFORMANCE_LIMITS.maximumSelectedMotionIdsPerPresenter) fail(`${path}.actions`, `one presenter may select at most ${PRESENTER_PERFORMANCE_LIMITS.maximumSelectedMotionIdsPerPresenter} distinct motions.`)
  const transforms = ordered(value.transforms, `${path}.transforms`, durationMs, PRESENTER_PERFORMANCE_LIMITS.maximumTransformKeyframes, (key, p, atMs) => {
    record(key, p, Object.keys(transformSchema.properties))
    const out = { atMs, easing: member(key.easing ?? 'smooth', easing.enum, `${p}.easing`) }
    for (const field of ['yawDegrees', 'pitchDegrees', 'rollDegrees', 'scale', 'depth', 'height']) {
      if (key[field] !== undefined) out[field] = num(key[field], undefined, `${p}.${field}`, transformSchema.properties[field].minimum, transformSchema.properties[field].maximum)
    }
    if (Object.keys(out).length === 2) fail(p, 'must set at least one 3D transform value.')
    return out
  })
  const travel = ordered(value.travel, `${path}.travel`, durationMs, PRESENTER_PERFORMANCE_LIMITS.maximumTravelKeyframes, (key, p, atMs) => {
    record(key, p, ['atMs', 'center', 'stage'])
    if (key.center === undefined) fail(`${p}.center`, 'is required for authored travel; stage labels do not select geometry.', 'PERFORMANCE_TRAVEL_GEOMETRY_REQUIRED')
    return { atMs, center: slidePoint(key.center, `${p}.center`), ...(key.stage === undefined ? {} : { stage: member(key.stage, ['left', 'center', 'right'], `${p}.stage`) }) }
  })
  let entry = null
  if (value.entry !== undefined) {
    const p = `${path}.entry`
    record(value.entry, p, ['type', 'durationMs', 'fadeMs', 'height'])
    const type = member(value.entry.type, ['drop', 'fade', 'appear'], `${p}.type`)
    const d = num(value.entry.durationMs, type === 'appear' ? 0 : 600, `${p}.durationMs`, type === 'appear' ? 0 : 1, Math.min(PRESENTER_PERFORMANCE_LIMITS.maximumEntryExitDurationMs, actions[0].durationMs), true)
    if (type === 'appear' && d !== 0) fail(`${p}.durationMs`, 'appear is instantaneous; use durationMs 0.')
    if (type !== 'drop' && value.entry.height !== undefined) fail(`${p}.height`, 'is only applicable to a drop entry.')
    const fadeMs = num(value.entry.fadeMs, type === 'drop' ? Math.min(300, d) : d, `${p}.fadeMs`, 0, d, true)
    if (type !== 'drop' && fadeMs !== d) fail(`${p}.fadeMs`, 'must equal durationMs for fade or appear; an independent fade duration is only applicable to a drop entry.')
    entry = { type, durationMs: d, fadeMs, ...(type === 'drop' ? { height: num(value.entry.height, 0.35, `${p}.height`, 0, 4) } : {}) }
  }
  let exit = null
  if (value.exit !== undefined) {
    const p = `${path}.exit`
    record(value.exit, p, ['type', 'atMs', 'durationMs'])
    const type = member(value.exit.type, ['fade', 'disappear'], `${p}.type`)
    const d = num(value.exit.durationMs, type === 'disappear' ? 0 : Math.min(1200, durationMs), `${p}.durationMs`, type === 'disappear' ? 0 : 1, Math.min(PRESENTER_PERFORMANCE_LIMITS.maximumEntryExitDurationMs, durationMs), true)
    if (type === 'disappear' && d !== 0) fail(`${p}.durationMs`, 'disappear is instantaneous; use durationMs 0.')
    const atMs = num(value.exit.atMs, durationMs - d, `${p}.atMs`, 0, durationMs, true)
    if (atMs + d > durationMs) fail(p, 'exit must end within the performance duration.')
    if (entry && atMs < entry.durationMs) fail(p, 'exit must not overlap the entry.')
    exit = { type, atMs, durationMs: d }
  }
  const interactions = value.interactions ?? []
  if (!Array.isArray(interactions) || interactions.length > PRESENTER_PERFORMANCE_LIMITS.maximumInteractions) fail(`${path}.interactions`, `must be an array with at most ${PRESENTER_PERFORMANCE_LIMITS.maximumInteractions} entries.`)
  const interactionIds = new Set()
  const normalizedInteractions = interactions.map((item, i) => {
    const p = `${path}.interactions[${i}]`
    record(item, p, Object.keys(interactionSchema.properties))
    const actionId = name(item.actionId, `${p}.actionId`)
    if (!ids.has(actionId)) fail(`${p}.actionId`, 'must reference an action in this performance.')
    const verb = member(item.verb, interactionSchema.properties.verb.enum, `${p}.verb`)
    const target = name(item.target, `${p}.target`, 256)
    const key = `${actionId}\u0000${target}`
    if (interactionIds.has(key)) fail(p, 'an action may not repeat an interaction with the same target.')
    interactionIds.add(key)
    if (verb === 'carry') {
      const hand = member(item.hand, ['left', 'right'], `${p}.hand`)
      const action = actions.find(action => action.id === actionId)
      const grabMs = num(item.grabMs, undefined, `${p}.grabMs`, 0, action.durationMs, true)
      const dropMs = num(item.dropMs, undefined, `${p}.dropMs`, 1, action.durationMs, true)
      if (dropMs <= grabMs) fail(`${p}.dropMs`, 'must be greater than grabMs within the selected action.')
      return { actionId, verb, target, hand, grabMs, dropMs }
    }
    for (const field of ['hand', 'grabMs', 'dropMs']) if (Object.hasOwn(item, field)) fail(`${p}.${field}`, 'is only supported for carry interactions.')
    return { actionId, verb, target }
  })
  let layering = null
  if (value.layering !== undefined) {
    const p = `${path}.layering`
    record(value.layering, p, Object.keys(layeringSchema.properties))
    const mode = member(value.layering.mode, layeringSchema.properties.mode.enum, `${p}.mode`)
    if (!Array.isArray(value.layering.targets) || !value.layering.targets.length || value.layering.targets.length > layeringSchema.properties.targets.maxItems) fail(`${p}.targets`, `must contain 1 to ${layeringSchema.properties.targets.maxItems} target names.`)
    const targets = value.layering.targets.map((target, i) => name(target, `${p}.targets[${i}]`, 256))
    if (new Set(targets).size !== targets.length) fail(`${p}.targets`, 'target names must be unique.')
    layering = { mode, targets }
  }
  return {
    actor: name(value.actor ?? 'presenter', `${path}.actor`), startMs: num(value.startMs, 0, `${path}.startMs`, 0, PRESENTER_PERFORMANCE_LIMITS.maximumStartMs, true),
    ...(value.actorInstanceId === undefined ? {} : { actorInstanceId: name(value.actorInstanceId, `${path}.actorInstanceId`, 256) }),
    ...(value.frame === undefined ? {} : { frame: slideFrame(value.frame, `${path}.frame`) }),
    ...(value.fps === undefined ? {} : { fps: num(value.fps, 30, `${path}.fps`, PRESENTER_PERFORMANCE_LIMITS.fpsRange[0], PRESENTER_PERFORMANCE_LIMITS.fpsRange[1], true) }),
    blendMs: num(value.blendMs, 240, `${path}.blendMs`, 0, PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs, true), actions, transforms, travel,
    ...(entry ? { entry } : {}), ...(exit ? { exit } : {}), interactions: normalizedInteractions, ...(layering ? { layering } : {}), durationMs,
  }
}

export function presenterPerformanceTimings(performance) {
  let atMs = 0
  return performance.actions.map(action => {
    const result = { id: action.id, motionId: action.motionId, atMs, endMs: atMs + action.durationMs, durationMs: action.durationMs }
    atMs = result.endMs
    return result
  })
}
