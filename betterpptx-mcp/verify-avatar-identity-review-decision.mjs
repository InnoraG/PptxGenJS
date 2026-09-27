#!/usr/bin/env node
// Maintainer-only validator for an exported talking-head quality decision.
// The final lane uses one-time owner acceptance; the legacy external-review
// packet remains accepted for compatibility with older private evidence.
// Absence of the file is an explicit OPEN state; this verifier never creates
// or infers a reviewer decision.
import fs from 'node:fs/promises'
import path from 'node:path'

const outputPath = path.resolve('betterpptx-mcp/outputs/avatar-identity-review-decision-report.json')
const inputPath = String(process.env.BETTERPPTX_AVATAR_IDENTITY_REVIEW_FILE || '').trim()
const report = {
  schemaVersion: 'betterpptx.avatar-identity-review-decision-report.v1',
  status: 'OPEN_OWNER_REVIEW_FILE_REQUIRED',
  failClosed: true,
  reviewerDecision: 'OPEN',
  evidence: inputPath || null,
  checks: [],
}

if (!inputPath) {
  report.checks.push({ id: 'external-review-file-present', status: false })
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
} else {
  try {
    const packet = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'))
    const ownerClosure = packet.schemaVersion === 'betterpptx.avatar.owner-closure-decision.v1'
    const reviewer = ownerClosure ? (packet?.gates?.identityReview || {}) : (packet?.reviewer || {})
    const validDecision = ['PASS', 'FAIL'].includes(String(reviewer.decision || ''))
    const complete = ownerClosure
      ? Boolean(reviewer.reviewer && reviewer.reviewedAt && reviewer.evidenceRef && reviewer.ownerAuthorized === true)
      : Boolean(reviewer.name && reviewer.organization && reviewer.reviewedAt && reviewer.evidenceReference)
    const schema = ownerClosure || packet.schemaVersion === 'betterpptx.avatar-identity-quality-review-decision.v1'
    const explicitNoInference = packet.automationMustNotInferApproval === true
      || (ownerClosure && packet.reviewAuthority === 'owner-one-time')
    const authority = ownerClosure
      ? packet.reviewAuthority === 'owner-one-time' && reviewer.reviewerRole === 'owner'
      : true
    report.checks = [
      { id: 'external-review-file-present', status: true },
      { id: 'decision-schema', status: schema },
      { id: 'reviewer-fields-complete', status: complete },
      { id: 'decision-is-explicit', status: validDecision },
      { id: 'no-automation-inference', status: explicitNoInference },
      { id: 'review-authority-valid', status: authority },
    ]
    if (!report.checks.every(check => check.status)) throw new Error('IDENTITY_REVIEW_PACKET_INVALID')
    report.status = ownerClosure
      ? (reviewer.decision === 'PASS' ? 'PASS_OWNER_REVIEW' : 'FAIL_OWNER_REVIEW')
      : (reviewer.decision === 'PASS' ? 'PASS_EXTERNAL_REVIEW' : 'FAIL_EXTERNAL_REVIEW')
    report.failClosed = reviewer.decision !== 'PASS'
    report.reviewerDecision = reviewer.decision
    report.reviewAuthority = ownerClosure ? 'owner-one-time' : 'external-review'
    report.reviewer = ownerClosure
      ? { name: reviewer.reviewer, role: reviewer.reviewerRole, reviewedAt: reviewer.reviewedAt, evidenceReference: reviewer.evidenceRef }
      : { name: reviewer.name, organization: reviewer.organization, reviewedAt: reviewer.reviewedAt, evidenceReference: reviewer.evidenceReference }
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report, null, 2))
    if (!['PASS_OWNER_REVIEW', 'PASS_EXTERNAL_REVIEW'].includes(report.status)) process.exitCode = 2
  } catch (error) {
    report.status = 'INVALID_REVIEW_PACKET'
    report.error = { code: error?.message || 'VERIFY_FAILED' }
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
    console.error(JSON.stringify(report, null, 2))
    process.exitCode = 2
  }
}
