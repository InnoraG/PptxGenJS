import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeGovernedMotionRetargetPolicy } from '../assets/authoring-motion-sources.mjs'

const policy = Object.freeze({ rotationRetargetSpace: 'global', channelPolicy: 'root-motion', boneNamePolicy: 'mixamo-suffix',
  rootMotionSpace: 'world', rootMotionAnchor: 'start', rootMotionMaxStatures: 2, rootMotionMaxHorizontalStatures: .5 })

test('governed world-root axis restriction is explicit and immutable', () => {
  const original = { ...policy, rootMotionAxes: 'vertical' }, before = JSON.stringify(original)
  const normalized = normalizeGovernedMotionRetargetPolicy(original)
  assert.equal(normalized.rootMotionAxes, 'vertical')
  assert.equal(JSON.stringify(original), before)
  assert.equal(normalizeGovernedMotionRetargetPolicy({ ...policy, rootMotionAxes: 'all' }).rootMotionAxes, 'all')
})

test('omitted axes preserve older normalized policies and playback-proof bindings', () => {
  assert.deepEqual(normalizeGovernedMotionRetargetPolicy(policy), policy)
  assert.equal(Object.hasOwn(normalizeGovernedMotionRetargetPolicy(policy), 'rootMotionAxes'), false)
})

for (const change of [
  { rootMotionAxes: 'horizontal' }, { rootMotionAxes: null }, { rootMotionAxes: ['y'] },
  { rootMotionAxes: 'vertical', rootMotionSpace: 'local' },
  { rootMotionAxes: 'vertical', rootMotionSpace: undefined },
  { rootMotionAxes: 'vertical', channelPolicy: 'rotation-only' },
]) test(`unsupported governed axis combination fails closed: ${JSON.stringify(change)}`, () => {
  assert.throws(() => normalizeGovernedMotionRetargetPolicy({ ...policy, ...change }), error =>
    error.code === 'AUTHORING_MOTION_SOURCE_INVALID' && !/rootMotion|\.glb|\.json|Mixamo|retarget/.test(error.message))
})
