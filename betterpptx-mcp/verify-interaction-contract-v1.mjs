#!/usr/bin/env node
import assert from 'node:assert/strict'
import { buildSpecOperationPlan, publicSpecCapabilityMatrix } from './ir/spec-compiler.mjs'

const contract = publicSpecCapabilityMatrix().interactionContract
assert.deepEqual(contract.supportedVerbs, ['touch', 'point-at', 'press', 'push', 'knock-over', 'carry'])
assert.equal(contract.solvedPlan.field, '_synergyPlan')

const base = {
  schemaVersion: 'betterpptx.deck-spec.v1', title: 'interaction contract test',
  contentStory: { audience: 'test', outcome: 'test', remember: 'test' },
  visualDesign: { world: 'editorial', framing: 'center' },
  motionTime: { masterClock: 'narration', timingSource: 'piper' },
  presenter: { identity: 'joe' },
  slides: [{ id: 's1', title: 'touch', message: 'Touch the card.', narration: { text: 'Touch the card.' },
    content: [{ kind: 'shape', name: 'card', objectName: 'card', bbox: { x: 6, y: 2, w: 2, h: 1 } }],
    interactions: [{ actor: 'presenter', verb: 'touch', target: 'card' }] }],
}
const solved = buildSpecOperationPlan(base, { slideSize: { w: 13.333, h: 7.5 } })
assert.equal(solved.errors.length, 0)

const unsolved = structuredClone(base)
unsolved.presenter = { identity: 'louise' }
unsolved.slides[0].interactions[0].actor = 'missing'
assert.throws(() => buildSpecOperationPlan(unsolved, { slideSize: { w: 13.333, h: 7.5 } }), /Interaction plan is not solved/)

console.log('INTERACTION CONTRACT: PASS')
console.log(JSON.stringify({ verbs: contract.supportedVerbs, solvedObjects: solved.objectCount, unsolvedRejected: true }, null, 2))
