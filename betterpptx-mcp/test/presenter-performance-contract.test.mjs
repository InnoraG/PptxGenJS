import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePresenterPerformance, presenterPerformanceTimings, PRESENTER_PERFORMANCE_CONTRACT, PRESENTER_PERFORMANCE_SCHEMA } from '../presenter-performance-contract.mjs'

const specimen = () => ({
  actor: 'independent-guide', startMs: 725, blendMs: 160,
  frame: { x: 9, y: 1, w: 2, h: 4 },
  actions: [
    { id: 'hello-now', motionId: 'motion.ordinary.greet', durationMs: 1500 },
    { id: 'move-result', motionId: 'motion.kinetic.heavy-push', durationMs: 2200 },
    { id: 'finish-calmly', motionId: 'motion.ordinary.bow', durationMs: 1000 },
  ],
  transforms: [{ atMs: 0, yawDegrees: -25, pitchDegrees: 0, scale: 0.8 }, { atMs: 1500, rollDegrees: 15, depth: -0.4, easing: 'linear' }, { atMs: 4700, height: 0.2, scale: 1.1, easing: 'easeOut' }],
  travel: [{ atMs: 0, center: { x: 10, y: 3 }, stage: 'right' }, { atMs: 3700, center: { x: 7, y: 3 }, stage: 'center' }],
  entry: { type: 'fade', durationMs: 300 }, exit: { type: 'fade', durationMs: 600 },
  interactions: [{ actionId: 'move-result', verb: 'push', target: 'unrelated-result-object' }],
})
const invalid = (label, mutate, field) => test(`performance rejects ${label}`, () => {
  const input = specimen(); mutate(input)
  assert.throws(() => normalizePresenterPerformance(input, 'slides[4].presenterPerformance'), error => {
    assert.equal(error.code, 'PRESENTER_PERFORMANCE_INVALID')
    assert.ok(error.field.startsWith('slides[4].presenterPerformance'))
    if (field) assert.ok(error.field.includes(field), `${error.field} does not identify ${field}`)
    return true
  })
})

test('performance normalizes arbitrary actor and action identities without changing its input or clock', () => {
  const input = specimen(), before = structuredClone(input), p = normalizePresenterPerformance(input)
  assert.deepEqual(input, before)
  assert.equal(p.actor, 'independent-guide')
  assert.equal(p.durationMs, 4700)
  assert.equal(p.startMs, 725)
  assert.equal(p.exit.atMs, 4100)
  assert.deepEqual(p.actions.map(action => action.cycles), [1, 1, 1])
  assert.deepEqual(presenterPerformanceTimings(p).map(action => [action.id, action.atMs, action.endMs]), [['hello-now', 0, 1500], ['move-result', 1500, 3700], ['finish-calmly', 3700, 4700]])
  assert.equal(p.transforms[1].easing, 'linear')
  assert.equal(p.interactions[0].target, 'unrelated-result-object')
  assert.equal(PRESENTER_PERFORMANCE_CONTRACT.publicSchema, PRESENTER_PERFORMANCE_SCHEMA)
})

test('stage-only travel fails explicitly instead of compiling to no motion', () => {
  const input = specimen()
  delete input.travel[1].center
  assert.throws(() => normalizePresenterPerformance(input), { code: 'PERFORMANCE_TRAVEL_GEOMETRY_REQUIRED', field: 'presenterPerformance.travel[1].center' })
})

test('clear, default actor, instantaneous entry/exit and repeated actions have generic semantics', () => {
  assert.equal(normalizePresenterPerformance(null), null)
  assert.equal(normalizePresenterPerformance(undefined), null)
  const p = normalizePresenterPerformance({ actions: [{ id: 'loop-only', motionId: 'motion.ordinary.walk', durationMs: 1000, cycles: 3 }], entry: { type: 'appear' }, exit: { type: 'disappear' } })
  assert.equal(p.actor, 'presenter')
  assert.equal(p.durationMs, 1000, 'cycles repeat within the authored duration')
  assert.deepEqual(p.entry, { type: 'appear', durationMs: 0, fadeMs: 0 })
  assert.deepEqual(p.exit, { type: 'disappear', atMs: 1000, durationMs: 0 })
})

test('supported transform endpoints and easing modes remain author controlled', () => {
  const input = specimen()
  input.transforms = [
    { atMs: 0, yawDegrees: -1080, pitchDegrees: -180, rollDegrees: 180, scale: 0.25, height: 0, depth: -4, easing: 'linear' },
    { atMs: 1200, yawDegrees: 1080, scale: 3, height: 4, depth: 4, easing: 'smooth' },
    { atMs: 2400, pitchDegrees: 180, easing: 'easeIn' },
    { atMs: 4700, rollDegrees: -180, easing: 'easeOut' },
  ]
  assert.deepEqual(normalizePresenterPerformance(input).transforms, input.transforms)
})

test('source segment bounds remain independent of the authored action clock', () => {
  const input = specimen()
  Object.assign(input.actions[1], { sourceStartMs: 250, sourceEndMs: 1750, cycles: 2 })
  input.actions[2].sourceEndMs = 900
  const p = normalizePresenterPerformance(input)
  assert.deepEqual(p.actions[1], { ...input.actions[1] })
  assert.equal(p.actions[2].sourceEndMs, 900)
  assert.equal(p.durationMs, 4700)
  assert.equal(presenterPerformanceTimings(p)[2].atMs, 3700)
  assert.ok(!Object.hasOwn(p.actions[0], 'sourceStartMs'), 'Omitted bounds preserve existing full-motion behavior')
})

invalid('negative source start', p => { p.actions[0].sourceStartMs = -1 }, '.sourceStartMs')
invalid('fractional source start', p => { p.actions[0].sourceStartMs = 1.5 }, '.sourceStartMs')
invalid('fractional source end', p => { p.actions[0].sourceEndMs = 300.5 }, '.sourceEndMs')
invalid('non-finite source end', p => { p.actions[0].sourceEndMs = Infinity }, '.sourceEndMs')
invalid('empty source segment', p => { Object.assign(p.actions[0], { sourceStartMs: 500, sourceEndMs: 500 }) }, '.sourceEndMs')
invalid('reversed source segment', p => { Object.assign(p.actions[0], { sourceStartMs: 501, sourceEndMs: 500 }) }, '.sourceEndMs')
invalid('source range beyond the supported bound', p => { p.actions[0].sourceEndMs = 120001 }, '.sourceEndMs')

invalid('unknown top-level realization fields', p => { p.animId = 0 }, 'animId')
invalid('caller-supplied derived total duration', p => { p.durationMs = 5000 }, 'durationMs')
invalid('overlapping action offsets outside the consecutive-action contract', p => { p.actions[1].startMs = 0 }, 'startMs')
invalid('duplicate action ownership', p => { p.actions[1].id = p.actions[0].id }, '.id')
invalid('blank actor identity', p => { p.actor = ' ' }, '.actor')
invalid('source paths in place of semantic motion IDs', p => { p.actions[0].motionId = 'C:/private/source.glb' }, 'motionId')
invalid('empty action sequence', p => { p.actions = [] }, '.actions')
invalid('fractional cycle count', p => { p.actions[0].cycles = 1.5 }, '.cycles')
invalid('fractional native action duration', p => { p.actions[0].durationMs = 1500.5 }, '.durationMs')
invalid('fractional native start time', p => { p.startMs = 725.5 }, '.startMs')
invalid('fractional native transform time', p => { p.transforms[0].atMs = 0.5 }, '.atMs')
invalid('fractional native entry duration', p => { p.entry.durationMs = 300.5 }, '.durationMs')
invalid('negative cycle count', p => { p.actions[0].cycles = -1 }, '.cycles')
invalid('non-finite action duration', p => { p.actions[0].durationMs = Infinity }, '.durationMs')
invalid('negative performance start', p => { p.startMs = -1 }, '.startMs')
invalid('string timing coercion', p => { p.startMs = '725' }, '.startMs')
invalid('non-finite blend', p => { p.blendMs = NaN }, '.blendMs')
invalid('more than 18 distinct semantic motions', p => { p.actions = Array.from({ length: 19 }, (_, i) => ({ id: `act-${i}`, motionId: `motion.ordinary.item-${i}`, durationMs: 1000 })) }, '.actions')
invalid('more than 32 actions', p => { p.actions = Array.from({ length: 33 }, (_, i) => ({ id: `act-${i}`, motionId: 'motion.ordinary.walk', durationMs: 1000 })) }, '.actions')
invalid('total duration beyond the bound', p => { p.actions = [0, 1, 2].map(i => ({ id: `long-${i}`, motionId: 'motion.ordinary.walk', durationMs: 50000 })) }, '.actions')
invalid('duplicate transform times', p => { p.transforms[1].atMs = 0 }, '.atMs')
invalid('unsorted transform times', p => { p.transforms[0].atMs = 2000 }, '.atMs')
invalid('transform beyond the action endpoint', p => { p.transforms[2].atMs = 4701 }, '.atMs')
invalid('empty transform key', p => { p.transforms[0] = { atMs: 0 } }, '.transforms')
invalid('raw geometry in transform keys', p => { p.transforms[0].x = 3 }, '.x')
invalid('non-finite yaw', p => { p.transforms[0].yawDegrees = Infinity }, '.yawDegrees')
invalid('out-of-bound pitch', p => { p.transforms[0].pitchDegrees = 181 }, '.pitchDegrees')
invalid('out-of-bound roll', p => { p.transforms[0].rollDegrees = -181 }, '.rollDegrees')
invalid('nonpositive scale', p => { p.transforms[0].scale = 0 }, '.scale')
invalid('out-of-bound depth', p => { p.transforms[0].depth = -4.001 }, '.depth')
invalid('negative height', p => { p.transforms[0].height = -0.001 }, '.height')
invalid('unknown easing', p => { p.transforms[0].easing = 'spring' }, '.easing')
invalid('duplicate travel times', p => { p.travel[1].atMs = 0 }, '.atMs')
invalid('travel beyond the performance', p => { p.travel[1].atMs = 9000 }, '.atMs')
invalid('unknown stage anchor', p => { p.travel[1].stage = 'diagonal' }, '.stage')
invalid('entry continuing beyond the first action', p => { p.entry.durationMs = 1501 }, '.durationMs')
invalid('fade length beyond entry duration', p => { p.entry.fadeMs = 301 }, '.fadeMs')
invalid('contradictory fade-only duration', p => { p.entry.fadeMs = 150 }, '.fadeMs')
invalid('drop height on a fade entry', p => { p.entry.height = 1 }, '.height')
invalid('noninstantaneous appear', p => { p.entry = { type: 'appear', durationMs: 10 } }, '.durationMs')
invalid('exit after performance ends', p => { p.exit.atMs = 4200 }, '.exit')
invalid('exit overlapping entry', p => { p.exit.atMs = 250 }, '.exit')
invalid('unknown interaction action', p => { p.interactions[0].actionId = 'missing-action' }, '.actionId')
invalid('unknown interaction verb', p => { p.interactions[0].verb = 'throw' }, '.verb')
invalid('blank target identity', p => { p.interactions[0].target = ' ' }, '.target')
invalid('duplicate action-to-target interaction ownership', p => { p.interactions.push(structuredClone(p.interactions[0])) }, '.interactions')
