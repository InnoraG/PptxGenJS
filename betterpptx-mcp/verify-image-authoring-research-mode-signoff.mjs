// Validate the owner-provided private-research boundary. This is not a launch approval.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const inputPath = path.join(root, 'image-authoring-research-mode-signoff.json')
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, ''))
const checks = []
const ok = (label, status) => { checks.push({ label, status: Boolean(status) }); console.log(`  ${status ? 'ok  ' : 'FAIL'} ${label}`) }
const owner = input.ownerDecision || {}
ok('research-mode signoff schema is explicit', input.schemaVersion === 'betterpptx.image-authoring-research-mode-signoff.v1' && input.mode === 'private-research')
ok('owner boundary is explicitly confirmed', input.ownerConfirmed === true && input.source === 'owner-approved-thread-boundary')
ok('no launch is planned', owner.launchPlanned === false)
ok('production promotion remains disabled', owner.productionPromotion === false)
ok('PPTX-only boundary remains enabled', owner.pptxOnly === true && owner.rawGlbFbxExport === false)
ok('privacy and training boundaries remain disabled', owner.customerImages === false && owner.consentedHumanImages === false && owner.training === false)
ok('no external AI boundary remains disabled', owner.externalAi === false)
ok('record does not claim semantic auto-accept or runtime promotion', /without authorizing production launch|semantic auto-accept|runtime\/legal promotion/i.test(String(input.interpretation || '')))
const passed = checks.filter(item => item.status).length
const report = {
  schemaVersion: 'betterpptx.image-authoring-research-mode-signoff-report.v1',
  status: passed === checks.length ? 'research-mode-boundary-pass' : 'research-mode-boundary-fail',
  checks: checks.length,
  failures: checks.length - passed,
  passed,
  launchPlanned: false,
  productionPromotion: false,
  semanticAutoAccept: false,
  ownerConfirmed: input.ownerConfirmed === true,
  evidence: 'image-authoring-research-mode-signoff.json'
}
fs.writeFileSync(path.join(root, 'image-authoring-research-mode-signoff-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\nIMAGE AUTHORING RESEARCH-MODE SIGNOFF: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
