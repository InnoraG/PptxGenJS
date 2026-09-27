// IMG5 calibration contract. Fixture labels are synthetic and cannot approve production.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateCalibrationCorpus } from './quality/semantic-calibration.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'quality', 'semantic-calibration-fixture.json'), 'utf8'))
let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
const synthetic = evaluateCalibrationCorpus(fixture.records, { acceptedReviewerMinimum: 0 })
const missing = evaluateCalibrationCorpus([])
ok('fixture is explicitly non-human', fixture.kind === 'owned-synthetic-contract-only' && fixture.humanLabels === false)
ok('synthetic fixture has required record count', synthetic.recordCount === 20)
ok('synthetic fixture computes perfect contract agreement', synthetic.status === 'pass' && synthetic.kappa.overall === 1)
ok('synthetic fixture meets critical dimension threshold', Math.min(...Object.values(synthetic.kappa.dimensions)) >= 0.65)
ok('missing blind labels fail closed', missing.status === 'blocked' && missing.checks.minimumRecords === false)
ok('calibration note forbids synthetic production approval', synthetic.note.includes('Production acceptance requires independently collected blind human labels'))
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
