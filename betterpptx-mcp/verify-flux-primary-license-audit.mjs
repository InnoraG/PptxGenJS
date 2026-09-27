// Read-only primary-source license audit for the two retained model lanes.
// It records the fetched official model-card evidence and compares it with
// local pinned records; runtime/CUDA and owner/legal approval remain separate.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.join(here, 'outputs', 'flux-primary-license-audit.json')
const sources = [
  { id: 'flux1-schnell', repository: 'black-forest-labs/FLUX.1-schnell', url: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell', expected: ['apache-2.0', 'commercial', '1 to 4 steps'] },
  { id: 'flux2-klein-4b', repository: 'black-forest-labs/FLUX.2-klein-4B', url: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B', expected: ['apache 2.0', 'commercial', 'image-to-image', 'multi-reference'] },
]
const results = []
for (const source of sources) {
  let status = 'FAIL'; let text = ''; let error = null
  try {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(20000), headers: { accept: 'text/html' } })
    text = await response.text()
    const lower = text.toLowerCase()
    const found = Object.fromEntries(source.expected.map(term => [term, lower.includes(term)]))
    status = response.ok && found[source.expected[0]] && found[source.expected[1]] ? 'PASS' : 'FAIL'
    results.push({ id: source.id, repository: source.repository, url: source.url, httpStatus: response.status, status, expectedEvidence: found, fetchedBytes: text.length })
  } catch (cause) {
    error = String(cause?.message || cause)
    results.push({ id: source.id, repository: source.repository, url: source.url, status, error })
  }
}
const lock = JSON.parse(fs.readFileSync(path.join(here, 'deploy', 'image-edit-worker', 'dependency-lock.json'), 'utf8'))
const fluxReadme = fs.readFileSync(path.join(here, 'deploy', 'flux-worker', 'README.md'), 'utf8').toLowerCase()
const localChecks = {
  kleinPinnedApache: lock.model.repository === 'black-forest-labs/FLUX.2-klein-4B' && lock.model.license === 'Apache-2.0',
  schnellPinnedApacheBoundary: fluxReadme.includes('apache-2.0') && fluxReadme.includes('never bundle non-schnell'),
  forbiddenNonCommercialVariantsListed: Array.isArray(lock.commercialSafetyBoundary?.forbiddenModels) && lock.commercialSafetyBoundary.forbiddenModels.includes('FLUX.1-dev') && lock.commercialSafetyBoundary.forbiddenModels.includes('FLUX.2-klein-9B'),
}
const report = {
  schemaVersion: 'betterpptx.flux-primary-license-audit.v1',
  status: results.every(result => result.status === 'PASS') && Object.values(localChecks).every(Boolean) ? 'primary-model-card-pass-runtime-review-open' : 'primary-license-audit-fail',
  fetchedAt: new Date().toISOString(),
  sources: results,
  localChecks,
  customerImages: false,
  consentedHumanImages: false,
  training: false,
  externalAi: false,
  note: 'Primary model-card evidence supports the retained Apache-2.0 model lanes. This does not clear exact in-image transitive runtime/CUDA notices, third-party input/output rights, or owner/legal hosted-service approval.',
}
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
for (const result of results) console.log(`  ${result.status === 'PASS' ? 'ok  ' : 'FAIL'} ${result.id} primary model-card evidence`)
for (const [name, value] of Object.entries(localChecks)) console.log(`  ${value ? 'ok  ' : 'FAIL'} ${name}`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status.startsWith('primary-model-card-pass') ? 0 : 1)
