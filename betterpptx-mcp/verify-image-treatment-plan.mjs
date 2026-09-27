// IMG7 treatment planner contract. Pure and offline.
import assert from 'node:assert/strict'
import { planImageTreatment } from './quality/image-treatment-plan.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
const cutout = planImageTreatment({ treatment: 'cutout' })
const extension = planImageTreatment({ treatment: 'background-extension', focalRegion: { x: 48, y: 8, w: 48, h: 84 } })
const local = planImageTreatment({ treatment: 'local-repair', region: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 } })
const oversized = planImageTreatment({ treatment: 'local-repair', region: { x: 0, y: 0, w: 0.8, h: 0.8 } })
const collage = planImageTreatment({ treatment: 'collage', cells: 5 })
const reference = planImageTreatment({ treatment: 'reference-edit', referenceHandles: ['gen://image/a'] })
const multi = planImageTreatment({ treatment: 'reference-edit', referenceHandles: ['gen://image/a', 'gen://image/b'] })
ok('cutout requires alpha and fringe checks', cutout.status === 'ready' && cutout.quality.cutout === true && cutout.requirements.includes('fringe-check'))
ok('background extension preserves focal and quiet regions', extension.locality === 'background-only' && extension.quality.focalRegion)
ok('local repair accepts bounded regions', local.status === 'ready' && local.locality === 'bounded-region')
ok('local repair rejects oversized regions', oversized.status === 'blocked' && oversized.reason === 'REPAIR_REGION_INVALID')
ok('collage bounds cell count deterministically', collage.status === 'ready' && collage.quality.cells === 5 && collage.quality.splitGrid.rows >= 2)
ok('single reference edit remains tenant-handle based', reference.status === 'ready' && reference.quality.capability === 'reference' && reference.requirements.includes('no-raw-public-bytes'))
ok('multi-reference edit chooses multi-reference capability', multi.status === 'ready' && multi.quality.capability === 'multi-reference')
ok('reference edit fails closed without a reference', planImageTreatment({ treatment: 'reference-edit' }).status === 'blocked')
ok('unknown treatment has a safe world-grade fallback', planImageTreatment({ treatment: 'unknown' }).status === 'blocked' && planImageTreatment({ treatment: 'unknown' }).fallback === 'world-grade')
ok('every ready treatment keeps an editable native fallback', [cutout, extension, local, collage, reference, multi].every(item => item.editableFallback === 'native-image-wrapper'))
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
