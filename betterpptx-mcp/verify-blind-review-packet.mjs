// IMG11 review packet contract. Pure and offline; no labels are fabricated.
import assert from 'node:assert/strict'
import { buildBlindReviewPacket, validateBlindReviewLabels, REVIEW_DIMENSIONS } from './quality/blind-review-packet.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
const records = Array.from({ length: 20 }, (_, index) => ({ id: `c${String(index + 1).padStart(2, '0')}`, aspect: index % 2 ? 'portrait' : 'landscape', series: `series-${index % 4}` }))
const packet = buildBlindReviewPacket({ records, reviewerCount: 2, minRecords: 20 })
ok('packet reaches the independent-review-ready threshold', packet.status === 'ready-for-independent-review')
ok('packet has two anonymous reviewer slots', packet.reviewerCount === 2 && packet.reviewerSlots.every(slot => slot.identity === 'omitted'))
ok('packet preserves no human or judge labels', packet.humanLabelsIncluded === false && packet.judgeLabelsIncluded === false)
ok('packet includes no customer images or raw pixels', packet.customerImages === false && packet.rawPixelsIncluded === false)
ok('record IDs are blinded opaque handles', packet.records.length === 20 && packet.records.every(record => /^blind:\/\/[a-f0-9]{20}$/.test(record.id)))
ok('required rubric dimensions are explicit', packet.records.every(record => record.labels.map(label => label.dimension).join(',') === REVIEW_DIMENSIONS.join(',')))
ok('packet is deterministic', JSON.stringify(buildBlindReviewPacket({ records, reviewerCount: 2, minRecords: 20 })) === JSON.stringify(packet))
const missing = validateBlindReviewLabels(packet, [])
ok('missing independent labels remain blocked', missing.status === 'blocked-missing-independent-labels' && missing.checks.reviewerSlots === false)
const partial = validateBlindReviewLabels(packet, [{ labels: [] }, { labels: [] }])
ok('incomplete labels remain blocked', partial.status === 'blocked-missing-independent-labels' && partial.checks.completeLabels === false)
const undersized = buildBlindReviewPacket({ records: records.slice(0, 5), reviewerCount: 2, minRecords: 20 })
ok('undersized packet fails closed', undersized.status === 'blocked-insufficient-records' && undersized.records.length === 5)
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
