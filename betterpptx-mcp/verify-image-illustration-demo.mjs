// Validate the recorded live Schnell -> Klein illustration demonstration.
// This verifier reads only owned-synthetic evidence and never calls a provider.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const report = JSON.parse(fs.readFileSync(path.join(outputRoot, 'image-illustration-demo-report.json'), 'utf8'))
const checks = []
const ok = (label, status) => { checks.push({ label, status: Boolean(status) }); console.log(`  ${status ? 'ok  ' : 'FAIL'} ${label}`) }
ok('live illustration demonstration is research-only', report.status === 'research-live-pass' && report.ownedSyntheticOnly === true && report.customerImages === false && report.externalAi === false && report.training === false)
ok('Schnell creation lane is recorded', report.create?.lane === 'schnell' && report.create?.capability === 'create' && report.create?.license?.license === 'Apache-2.0')
ok('Klein edit lane is recorded', report.edit?.lane === 'klein' && report.edit?.capability === 'edit' && report.edit?.license?.license === 'Apache-2.0')
ok('both outputs are native 16:9 rasters', report.create?.width === 1280 && report.create?.height === 768 && report.edit?.width === 1280 && report.edit?.height === 768)
ok('native labels and arrows remain the policy boundary', report.promptPolicy?.nativeLabelsAndArrows === true && report.promptPolicy?.requestedNoText === true)
ok('Schnell output passes the no-text OCR check', report.promptPolicy?.createOcrReadableTokenCount === 0)
ok('v2 replacement is the authoritative illustration sample', report.create?.revision === 'v2-replacement' && report.edit?.revision === 'v2-replacement' && report.promptPolicy?.previousAttempt?.decision === 'rejected-and-replaced')
ok('both v2 outputs pass the no-text OCR check', report.promptPolicy?.editOcrReadableTokenCount === 0 && report.promptPolicy?.editNoTextGate === 'pass')
ok('v2 output files exist', ['image-illustration-demo-schnell-v2.png', 'image-illustration-demo-klein-v2.png'].every(name => fs.existsSync(path.join(outputRoot, name)) && fs.statSync(path.join(outputRoot, name)).size > 0))
const passed = checks.filter(check => check.status).length
const output = { schemaVersion: 'betterpptx.image-illustration-demo-verification.v1', status: passed === checks.length ? 'research-illustration-demo-pass' : 'research-illustration-demo-fail', checks: checks.length, failures: checks.length - passed, passed, customerImages: false, externalAi: false, training: false }
fs.writeFileSync(path.join(outputRoot, 'image-illustration-demo-verification-report.json'), JSON.stringify(output, null, 2) + '\n')
console.log(`\nIMAGE ILLUSTRATION DEMO: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
