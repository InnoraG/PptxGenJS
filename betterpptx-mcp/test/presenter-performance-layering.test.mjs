import assert from 'node:assert/strict'
import test from 'node:test'
import Ajv from 'ajv'
import { normalizePresenterPerformance, PRESENTER_PERFORMANCE_SCHEMA } from '../presenter-performance-contract.mjs'

const fixture = () => ({
  actor: 'guide',
  actions: [{ id: 'point', motionId: 'motion.synergy.point-chart-source', durationMs: 1700 }],
  layering: {
    mode: 'presenter-behind-targets',
    targets: ['card', 'label'],
  },
})

test('layering is an explicit AI-authored presenter z-order contract', () => {
  const input = fixture()
  const before = structuredClone(input)
  const validate = new Ajv({ strict: false }).compile(PRESENTER_PERFORMANCE_SCHEMA)
  assert.equal(validate(input), true, JSON.stringify(validate.errors))
  const normalized = normalizePresenterPerformance(input)
  assert.deepEqual(input, before, 'normalization is pure')
  assert.deepEqual(normalized.layering, { mode: 'presenter-behind-targets', targets: ['card', 'label'] })
})

test('layering rejects duplicate target names and unknown policy', () => {
  const duplicate = fixture()
  duplicate.layering.targets = ['card', 'card']
  assert.throws(() => normalizePresenterPerformance(duplicate), error => error.code === 'PRESENTER_PERFORMANCE_INVALID')
  const unknown = fixture()
  unknown.layering.mode = 'engine-avoid-overlap'
  assert.throws(() => normalizePresenterPerformance(unknown), error => error.code === 'PRESENTER_PERFORMANCE_INVALID')
})
