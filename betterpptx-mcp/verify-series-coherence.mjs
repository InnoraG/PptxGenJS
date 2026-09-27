// IMG8 deck-level coherence/revision contract. Pure and offline; no provider or image bytes.
import assert from 'node:assert/strict'
import { evaluateSeriesCoherence, planWholeDeckVisualRevision, visualRevisionDigest } from './quality/series-coherence.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
const plans = [
	{ id: 'p1', consistencyGroup: 'launch', concept: 'fragmented paths', world: { key: 'aurora' }, palette: ['11AAFF'], request: { style: 'illustration' } },
	{ id: 'p2', consistencyGroup: 'launch', concept: 'governed core', world: { key: 'aurora' }, palette: ['11AAFF'], request: { style: 'illustration' } },
	{ id: 'p3', consistencyGroup: 'proof', concept: 'measured result', world: { key: 'blueprint' }, palette: ['00CCAA'], request: { style: 'diagram' } },
]
const coherent = evaluateSeriesCoherence(plans)
ok('coherent deck passes', coherent.status === 'pass' && coherent.score === 1)
ok('series groups expose anchor checks', coherent.groups.length === 2 && coherent.groups.every(item => item.checks.anchorConsistency))
const divergent = evaluateSeriesCoherence([{ ...plans[0] }, { ...plans[1], world: { key: 'luxe' } }])
ok('divergent world fails closed', divergent.status === 'fail' && divergent.groups[0].checks.anchorConsistency === false)
const duplicate = evaluateSeriesCoherence([{ ...plans[0] }, { ...plans[1], concept: plans[0].concept }])
ok('repeated concept fails diversity check', duplicate.status === 'fail' && duplicate.groups[0].checks.conceptDiversity === false)
ok('revision digest is stable', visualRevisionDigest(plans) === visualRevisionDigest(plans))
const revision = planWholeDeckVisualRevision(plans, 'p1')
ok('changed series sibling is invalidated', revision.invalidatedPlanIds.length === 1 && revision.invalidatedPlanIds[0] === 'p2')
ok('unrelated series is retained', revision.retainedPlanIds.includes('p3'))
ok('revision plan is deterministic and opaque', revision.deterministic === true && /^revision:\/\/[a-f0-9]{24}$/.test(revision.revisionDigest))
const empty = evaluateSeriesCoherence([])
ok('empty deck is safely vacuous', empty.status === 'pass' && empty.score === 1)
ok('public result contains no provider or filesystem internals', !JSON.stringify({ coherent, revision }).match(/modal|provider|filesystem|node_modules|\\/i))
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
