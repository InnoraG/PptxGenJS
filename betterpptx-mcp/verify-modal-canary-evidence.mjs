// IMG5/IMG6 private Modal canary evidence contract. Reads only owned synthetic evidence.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const evidence = JSON.parse(fs.readFileSync(path.join(here, 'deploy', 'image-edit-worker', 'canary-evidence-img11-20260717.json'), 'utf8'))
const outputPath = path.join(here, 'outputs', 'img11-modal-canary-512-1707.png')
const inputPath = path.join(here, 'deploy', 'image-edit-worker', 'fixtures', 'synthetic-reference.png')
const output = fs.readFileSync(outputPath)
const input = fs.readFileSync(inputPath)
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const width = output.readUInt32BE(16)
const height = output.readUInt32BE(20)

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
ok('evidence is explicitly private research only', evidence.status === 'private-research-canary-pass; production-gate-pending')
ok('only owned synthetic input was used', evidence.referencePolicy.referenceKind === 'owned-synthetic' && evidence.referencePolicy.customerImages === false && evidence.referencePolicy.consentedHumanAssetSentToCloud === false)
ok('training is disabled', evidence.referencePolicy.trainingEnabled === false)
ok('exact Klein revision is recorded', evidence.model.repository === 'black-forest-labs/FLUX.2-klein-4B' && /^[a-f0-9]{40}$/.test(evidence.model.revision))
ok('output digest matches the local artifact', sha(output) === evidence.output.sha256)
ok('input digest matches the local fixture', sha(input) === evidence.referencePolicy.inputSha256)
ok('PNG dimensions match the bounded run', output.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && width === 512 && height === 512)
ok('peak memory and GPU metrology are present', evidence.execution.peakAllocatedBytes > 0 && evidence.execution.peakReservedBytes >= evidence.execution.peakAllocatedBytes && evidence.execution.gpuSeconds > 0)
ok('strict GPU cost ceiling passed', evidence.limits.costCeilingPassed === true && evidence.execution.gpuPortionUsdAtRecordedRate <= evidence.limits.costCeilingUsd)
ok('production remains fail-closed', Array.isArray(evidence.remainingGates) && evidence.remainingGates.length >= 3 && /legal|human|corpus/i.test(evidence.remainingGates.join(' ')))
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
