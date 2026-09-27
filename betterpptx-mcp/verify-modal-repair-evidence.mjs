// IMG6 bounded diagnosis→repair evidence contract. Owned synthetic outputs only.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const report = JSON.parse(fs.readFileSync(path.join(here, 'outputs', 'img6-repair-repaired-512-1707.json'), 'utf8'))
const byLabel = label => report.records.find(record => record.label === label)
const baselineRecord = byLabel('baseline')
const repairedRecord = byLabel('repaired')
const baselinePath = path.join(here, 'outputs', 'img6-repair-baseline-512-1707.png')
const repairedPath = path.join(here, 'outputs', 'img6-repair-repaired-512-1707.png')
const baseline = fs.readFileSync(baselinePath)
const repaired = fs.readFileSync(repairedPath)
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const baselineQuality = await evaluateImageQuality(baseline, { aspect: 'square', noText: true, ocr: { status: 'complete', text: '' } })
const repairedQuality = await evaluateImageQuality(repaired, { aspect: 'square', noText: true, ocr: { status: 'complete', text: '' } })

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
ok('repair report has the bounded schema', report.schemaVersion === 'betterpptx.image-edit-worker-repair-canary.v1' && report.attempts === 1)
ok('diagnosis and repair instruction are explicit', report.diagnosis.includes('diagnosis:') && report.boundedRepairPrompt.includes('repair only'))
ok('only owned synthetic input was used', report.referenceKind === 'owned-synthetic' && report.customerImages === false && report.trainingEnabled === false)
ok('baseline and repaired candidates share the exact model revision', baselineRecord.modelRevision === repairedRecord.modelRevision && /^[a-f0-9]{40}$/.test(repairedRecord.modelRevision))
ok('both candidates are bounded 512² PNGs', [baselineRecord, repairedRecord].every(record => record.width === 512 && record.height === 512 && record.contentType === 'image/png'))
ok('local output digests match recorded evidence', sha(baseline) === baselineRecord.sha256 && sha(repaired) === repairedRecord.sha256)
ok('repair produces a distinct candidate', baselineRecord.sha256 !== repairedRecord.sha256 && baselineQuality.measurements.averageHash !== repairedQuality.measurements.averageHash)
ok('deterministic quality remains valid after repair', baselineQuality.status === 'pass' && repairedQuality.status === 'pass')
ok('diagnosed treatment has measurable texture improvement', repairedQuality.measurements.entropy > baselineQuality.measurements.entropy)
ok('GPU cost stays below the strict ceiling', report.costCeilingPassed === true && report.gpuPortionUsdAtRecordedRate <= report.costCeilingUsd)
ok('GPU metrology is complete for both attempts', report.totalGpuSeconds > 0 && baselineRecord.peakAllocatedBytes > 0 && repairedRecord.peakAllocatedBytes > 0)
ok('no external AI provenance is recorded', !JSON.stringify(report).match(/claude|openai|gpt/i))
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
