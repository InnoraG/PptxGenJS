// Validate two simple best-of-two reviewer exports and compute inter-reviewer
// agreement. This gate does not produce semantic judge scores or auto-accept.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const packetPath = path.join(root, 'photorealistic-pairwise-review-packet.json')
const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'))
const packetDigest = crypto.createHash('sha256').update(fs.readFileSync(packetPath)).digest('hex')
const reviewerPaths = [process.env.BETTERPPTX_PAIRWISE_REVIEWER_ONE, process.env.BETTERPPTX_PAIRWISE_REVIEWER_TWO]
const allowed = new Set(['left', 'right', 'tie'])
const issues = []
const read = (filePath, slot) => {
  if (!filePath || !fs.existsSync(filePath)) { issues.push(`reviewer ${slot} export missing`); return null }
  let value
  try { value = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) } catch { issues.push(`reviewer ${slot} export invalid JSON`); return null }
  if (value.schemaVersion !== 'betterpptx.pairwise-review-labels.v1') issues.push(`reviewer ${slot} schema invalid`)
  if (value.reviewerSlot !== slot) issues.push(`reviewer ${slot} slot mismatch`)
  if (value.packetDigest !== packetDigest) issues.push(`reviewer ${slot} packet digest mismatch`)
  return value
}
const exports = reviewerPaths.map((filePath, index) => read(filePath, index + 1))
const pairIds = (packet.pairs || []).map(pair => pair.pairId)
const normalize = (value, slot) => {
  const map = new Map()
  for (const label of value?.labels || []) {
    if (!pairIds.includes(label?.pairId)) { issues.push(`reviewer ${slot} unknown pair`); continue }
    if (map.has(label.pairId)) { issues.push(`reviewer ${slot} duplicate pair`); continue }
    if (!allowed.has(label.choice)) issues.push(`reviewer ${slot} invalid choice`)
    map.set(label.pairId, label.choice)
  }
  return map
}
const first = normalize(exports[0], 1)
const second = normalize(exports[1], 2)
const complete = first.size === pairIds.length && second.size === pairIds.length && pairIds.every(id => first.has(id) && second.has(id))
const common = pairIds.filter(id => first.has(id) && second.has(id))
const observed = common.length ? common.filter(id => first.get(id) === second.get(id)).length / common.length : 0
const categories = ['left', 'right', 'tie']
const expected = common.length ? categories.reduce((sum, category) => sum + (common.filter(id => first.get(id) === category).length / common.length) * (common.filter(id => second.get(id) === category).length / common.length), 0) : 1
const kappa = common.length ? Math.round(((observed - expected) / (1 - expected || 1)) * 1000) / 1000 : null
const agreementPass = exports.every(Boolean) && complete && issues.length === 0 && kappa !== null && kappa >= 0.65
const laneWins = { create: 0, edit: 0, tie: 0 }
const pairResults = []
for (const id of common) {
  const pair = packet.pairs.find(item => item.pairId === id)
  const firstChoice = first.get(id)
  const secondChoice = second.get(id)
  const agreement = firstChoice === secondChoice
  const consensusChoice = agreement ? firstChoice : 'tie'
  const consensusLane = agreement && consensusChoice !== 'tie' ? (pair[consensusChoice]?.lane || 'tie') : 'tie'
  laneWins[consensusLane]++
  pairResults.push({ pairId: id, caseId: pair.caseId, ordinal: pair.ordinal, agreement, consensusChoice, consensusLane })
}
const report = { schemaVersion: 'betterpptx.photorealistic-pairwise-review.v1', status: agreementPass ? 'reviewer-pairwise-pass' : (exports.every(Boolean) ? 'blocked-pairwise-agreement' : 'blocked-awaiting-pairwise-exports'), packetDigest, pairCount: pairIds.length, commonPairCount: common.length, choices: ['left', 'right', 'tie'], observedAgreement: Math.round(observed * 1000) / 1000, kappa, threshold: 0.65, laneWins, pairResults, issues, labelsRemainPrivate: true, customerImages: false, consentedHumanImages: false, training: false, externalAi: false, note: 'Pairwise agreement selects a preferred candidate for research analysis; it does not calibrate the semantic judge or authorize production.' }
const outputPath = path.join(root, 'photorealistic-pairwise-review-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${agreementPass ? 'ok  ' : 'OPEN'} pairwise reviewer exports and agreement`)
console.log(`  ${complete ? 'ok  ' : 'OPEN'} complete pair coverage (${common.length}/${pairIds.length})`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(agreementPass ? 0 : 1)
