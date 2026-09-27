// Independent-label intake and agreement gate for the photorealistic review packet.
// This tool never invents labels and never calls an AI service. It remains blocked
// until two separately exported reviewer files are supplied.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cohenKappa, CALIBRATION_DIMENSIONS } from './quality/semantic-calibration.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const packetPath = process.env.BETTERPPTX_BLIND_PACKET || path.join(here, 'outputs', 'photorealistic-blind-review-packet.json')
const reviewerOnePath = process.env.BETTERPPTX_REVIEWER_ONE
const reviewerTwoPath = process.env.BETTERPPTX_REVIEWER_TWO
const outputPath = process.env.BETTERPPTX_BLIND_CALIBRATION_REPORT || path.join(here, 'outputs', 'photorealistic-blind-calibration-report.json')
const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'))
const packetDigest = crypto.createHash('sha256').update(fs.readFileSync(packetPath)).digest('hex')
const packetIds = new Set((packet.records || []).map(record => record.id))
const packetCount = packetIds.size
const issues = []
const readReviewer = (filePath, expectedSlot) => {
  if (!filePath) { issues.push(`reviewer slot ${expectedSlot} export is missing`); return null }
  if (!fs.existsSync(filePath)) { issues.push(`reviewer slot ${expectedSlot} export does not exist`); return null }
  let value
  try { value = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { issues.push(`reviewer slot ${expectedSlot} export is not valid JSON`); return null }
  if (value.schemaVersion !== 'betterpptx.blind-review-labels.v1') issues.push(`reviewer slot ${expectedSlot} schemaVersion is invalid`)
  if (value.packetDigest && value.packetDigest !== packetDigest) issues.push(`reviewer slot ${expectedSlot} packet digest does not match the frozen packet`)
  if (value.reviewerSlot !== expectedSlot) issues.push(`reviewer slot ${expectedSlot} identity/slot assertion is invalid`)
  if (!Array.isArray(value.labels)) issues.push(`reviewer slot ${expectedSlot} labels array is missing`)
  return value
}
const normalize = (reviewer, slot) => {
  const map = new Map()
  for (const label of reviewer?.labels || []) {
    if (!label || typeof label.id !== 'string' || !packetIds.has(label.id)) { issues.push(`reviewer slot ${slot} contains an unknown record id`); continue }
    if (map.has(label.id)) { issues.push(`reviewer slot ${slot} duplicates record ${label.id}`); continue }
    const row = { id: label.id }
    for (const dimension of CALIBRATION_DIMENSIONS) {
      const value = Number(label[dimension])
      if (!Number.isInteger(value) || value < 1 || value > 5) issues.push(`reviewer slot ${slot} has an invalid ${dimension} score for ${label.id}`)
      row[dimension] = value
    }
    map.set(label.id, row)
  }
  return map
}
const reviewerOne = readReviewer(reviewerOnePath, 1)
const reviewerTwo = readReviewer(reviewerTwoPath, 2)
const first = normalize(reviewerOne, 1)
const second = normalize(reviewerTwo, 2)
const commonIds = [...first.keys()].filter(id => second.has(id) && packetIds.has(id))
const kappas = Object.fromEntries(CALIBRATION_DIMENSIONS.map(dimension => [dimension, cohenKappa(commonIds.map(id => first.get(id)[dimension]), commonIds.map(id => second.get(id)[dimension]))]))
const usableKappas = Object.values(kappas).filter(value => value !== null)
const overall = usableKappas.length ? Math.round(usableKappas.reduce((sum, value) => sum + value, 0) / usableKappas.length * 1000) / 1000 : null
const criticalMinimum = Number(process.env.BETTERPPTX_BLIND_CRITICAL_KAPPA || 0.65)
const overallMinimum = Number(process.env.BETTERPPTX_BLIND_OVERALL_KAPPA || 0.75)
const completeCoverage = commonIds.length === packetCount && first.size === packetCount && second.size === packetCount
const acceptanceRate = commonIds.length ? Math.round(commonIds.filter(id => CALIBRATION_DIMENSIONS.slice(0, 3).every(d => first.get(id)[d] >= 4 && second.get(id)[d] >= 4)).length / commonIds.length * 1000) / 1000 : 0
const checks = {
  packetFrozen: packet.status === 'ready-for-independent-review' && packetCount > 0,
  twoIndependentExports: Boolean(reviewerOne && reviewerTwo),
  noUnknownOrDuplicateLabels: issues.every(issue => !/unknown record|duplicates record|invalid .* score/.test(issue)),
  completeCoverage,
  criticalKappa: usableKappas.length === CALIBRATION_DIMENSIONS.length && Math.min(...usableKappas) >= criticalMinimum,
  overallKappa: overall !== null && overall >= overallMinimum,
  acceptedReviewerRate: acceptanceRate >= 0.9,
}
const agreementPass = Object.values(checks).every(Boolean)
const report = {
  schemaVersion: 'betterpptx.photorealistic-blind-calibration.v1',
  status: agreementPass ? 'reviewer-agreement-pass-human-labels-present' : (reviewerOne && reviewerTwo ? 'blocked-reviewer-agreement' : 'blocked-awaiting-independent-labels'),
  packet: path.relative(path.resolve(here, '..'), packetPath).replaceAll('\\', '/'),
  packetDigest,
  recordCount: packetCount,
  commonRecordCount: commonIds.length,
  reviewerSlots: [1, 2],
  labelsRemainPrivate: true,
  customerImages: false,
  consentedHumanImages: false,
  externalAi: false,
  training: false,
  kappa: { overall, dimensions: kappas },
  acceptanceRate,
  thresholds: { criticalMinimum, overallMinimum, acceptedReviewerRate: 0.9 },
  checks,
  issues,
  note: 'Human-human agreement is evidence for calibration intake only. It does not by itself authorize a semantic judge or production use; judge-vs-human calibration and owner/legal approval remain separate gates.',
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
let pass = 0; let fail = 0
for (const [name, value] of Object.entries(checks)) { if (value) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }
console.log(`\n${agreementPass ? 'PASSED' : 'BLOCKED'}: ${pass} passed, ${fail} failed`)
console.log(`report: ${outputPath}`)
process.exit(agreementPass ? 0 : 1)
