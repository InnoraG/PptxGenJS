// IMG3 series/anchor contract. Pure and offline; no provider or image bytes.
import assert from 'node:assert/strict'
import { buildSeriesCapsules, planSeriesRevision, visualPlanFingerprint } from './ir/series-director.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
const plans = [
	{ id: 'p1', slideId: 's1', consistencyGroup: 'operating-system', concept: 'fragmented paths', world: { key: 'aurora' }, request: { style: 'illustration' }, layout: { aspect: 'landscape', subjectPlacement: 'right', negativeSpace: 'left' } },
	{ id: 'p2', slideId: 's2', consistencyGroup: 'operating-system', concept: 'governed core', world: { key: 'aurora' }, request: { style: 'illustration' }, layout: { aspect: 'landscape', subjectPlacement: 'left', negativeSpace: 'right' } },
	{ id: 'p3', slideId: 's3', consistencyGroup: 'proof', concept: 'measured result', world: { key: 'blueprint' }, request: { style: 'diagram' }, layout: { aspect: 'square' } },
]
const capsules = buildSeriesCapsules(plans)
ok('series groups are deterministic', capsules.length === 2 && capsules[0].group === 'operating-system')
ok('series capsules carry stable opaque ids', capsules.every(item => /^series:\/\/[a-f0-9]{20}$/.test(item.id)))
ok('shared series preserves world/style anchors', capsules.find(item => item.group === 'operating-system')?.anchor.world === 'aurora' && capsules.find(item => item.group === 'operating-system')?.anchor.style === 'illustration')
ok('variation slots preserve concept differences', capsules.find(item => item.group === 'operating-system')?.variationSlots.length === 2)
ok('coherence policy separates preserve and vary dimensions', capsules[0].coherencePolicy.preserve.includes('palette') && capsules[0].coherencePolicy.vary.includes('concept'))
const revision = planSeriesRevision(capsules, 'p1')
ok('revision invalidates only affected series members', revision.invalidatedCount === 1 && revision.affected[0].invalidatedPlanIds[0] === 'p2')
ok('unrelated series remains untouched', revision.affected.length === 1 && !revision.affected.some(item => item.capsuleId === capsules.find(c => c.group === 'proof')?.id))
ok('missing change is a no-op', planSeriesRevision(capsules, 'unknown').invalidatedCount === 0)
ok('per-asset fingerprint is opaque and stable', /^asset-revision:\/\/[a-f0-9]{24}$/.test(visualPlanFingerprint(plans[0])) && visualPlanFingerprint(plans[0]) === visualPlanFingerprint(plans[0]))
ok('semantic change changes only the changed asset fingerprint', visualPlanFingerprint(plans[0]) !== visualPlanFingerprint({ ...plans[0], concept: 'new concept' }))
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
