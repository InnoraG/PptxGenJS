// Reuse the shared PPTX/COM packager for the fresh Schnell-vs-Klein bake-off.
// Only the first enabled profile in each lane is packaged; all twelve private
// calls remain in the bake-off report for cost/failover evidence.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const source = JSON.parse(fs.readFileSync(path.join(outputRoot, 'live-modal-image-generation-bakeoff-report.json'), 'utf8'))
const schnellId = source.results.find(result => result.lane === 'schnell')?.accountId
const kleinId = source.results.find(result => result.lane === 'klein')?.accountId
const cases = source.packet.map(record => ({
  id: record.id,
  message: record.id,
  create: source.results.find(result => result.lane === 'schnell' && result.accountId === schnellId && result.caseId === record.id),
  edit: source.results.find(result => result.lane === 'klein' && result.accountId === kleinId && result.caseId === record.id),
}))
const corpus = { schemaVersion: 'betterpptx.live-modal-image-generation-bakeoff-pptx-source.v1', status: source.status, ownedSyntheticOnly: true, customerImages: false, training: false, externalAi: false, results: cases }
const sourcePath = path.join(outputRoot, 'live-modal-image-generation-bakeoff-pptx-source.json')
fs.writeFileSync(sourcePath, JSON.stringify(corpus, null, 2) + '\n')
const env = { ...process.env, BETTERPPTX_CONTEXTUAL_CORPUS_REPORT: path.basename(sourcePath), BETTERPPTX_CONTEXTUAL_ARTIFACT_PREFIX: 'live-modal-image-generation-bakeoff' }
const run = spawnSync(process.execPath, [path.join(here, 'verify-contextual-authoring-pptx.mjs')], { encoding: 'utf8', timeout: 300000, env })
process.stdout.write(run.stdout || '')
process.stderr.write(run.stderr || '')
process.exit(run.status ?? 1)
