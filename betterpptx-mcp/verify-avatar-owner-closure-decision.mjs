#!/usr/bin/env node
// Validate the redacted owner decision packet exported by avatar-owner-closure-form.html.
// This verifier never advances release reports; it only says whether the packet is
// complete enough for the existing authoritative verifiers to re-check.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp/outputs')
const packetPath = path.resolve(process.argv[2] || path.join(root, 'avatar-owner-closure-decision.json'))
const outputPath = path.resolve(process.argv[3] || path.join(root, 'avatar-owner-closure-decision-report.json'))

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const exists = async file => { try { return (await fs.stat(file)).isFile() } catch { return false } }
const present = value => typeof value === 'string' ? value.trim().length > 0 : Boolean(value)

const base = {
  schemaVersion: 'betterpptx.avatar.owner-closure-decision-verifier.v1',
  packet: packetPath,
  rawSecretsPrinted: false,
  customerData: false,
}

if (!(await exists(packetPath))) {
  const report = { ...base, status: 'OPEN_OWNER_PACKET_MISSING', ownerPacketReadyForVerification: false, packetPresent: false, checks: { packetPresent: false } }
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

let packet
try { packet = await readJson(packetPath) } catch (error) {
  const report = { ...base, status: 'FAIL_INVALID_JSON', ownerPacketReadyForVerification: false, packetPresent: true, checks: { packetPresent: true, validJson: false }, error: String(error.message || error) }
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  process.exit(1)
}

const serialized = JSON.stringify(packet)
const unsafeKey = /(?:password|secret|token|api[_-]?key|private[_-]?key|credential|invoicePayload|imageBytes)/i
// These two booleans are required redaction assertions emitted by the owner
// form.  Their names contain words matched by the broad defensive pattern,
// but they carry no secret or customer payload and must remain allowed.
const safeMetadataKeys = new Set(['rawSecretsPrinted', 'customerData'])
const findUnsafeKeys = (value, prefix = '') => {
  const found = []
  if (!value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (!safeMetadataKeys.has(key) && unsafeKey.test(key)) found.push(full)
    found.push(...findUnsafeKeys(child, full))
  }
  return found
}
const unsafeKeys = findUnsafeKeys(packet)

const identity = packet.gates?.identityReview || {}
const billing = packet.gates?.providerBilling || {}
const meshy = packet.gates?.meshyMixamo || {}
const identityComplete = identity.ready === true && identity.decision === 'PASS' && identity.ownerAuthorized === true && present(identity.reviewer) && present(identity.reviewedAt) && present(identity.evidenceRef)
const billingComplete = billing.ready === true && billing.completeWindowAttested === true && billing.ownerApproved === true && present(billing.window) && present(billing.exportRef)
const meshyComplete = meshy.ready === true && meshy.termsRecorded === true && meshy.consentApproved === true && meshy.liveCanaryCompleted === true && meshy.rollbackRecorded === true && present(meshy.inputManifestRef) && present(meshy.canaryRollbackRef)
const packetComplete = packet.schemaVersion === 'betterpptx.avatar.owner-closure-decision.v1' && packet.automationMustNotInferApproval === true && packet.status === 'READY_FOR_VERIFICATION' && unsafeKeys.length === 0 && identityComplete && billingComplete && meshyComplete

const [identityAuthority, billingAuthority, meshyAuthority] = await Promise.all([
  readJson(path.join(root, 'avatar-identity-review-decision-report.json')),
  readJson(path.join(root, 'avatar-provider-billing-reconciliation-report.json')),
  readJson(path.resolve('research-demos/2026-07-18-meshy-avatar/visual-artifacts/release-gates/meshy-owner-decision-worksheet-20260718.json')),
])
const authority = {
  identityDecisionReport: identityAuthority.status,
  billingReport: billingAuthority.status,
  billingRevisionMatched: billingAuthority.checks?.finalCommercialWindowRevisionMatched === true,
  meshWorksheet: meshyAuthority.status,
  meshNetworkAttempted: meshyAuthority.networkAttempted === true,
}
const report = {
  ...base,
  status: unsafeKeys.length ? 'FAIL_UNSAFE_PACKET' : packetComplete ? 'READY_FOR_AUTHORITY_RECHECK' : 'OPEN_INCOMPLETE',
  ownerPacketReadyForVerification: packetComplete && unsafeKeys.length === 0,
  packetPresent: true,
  checks: { schema: packet.schemaVersion === 'betterpptx.avatar.owner-closure-decision.v1', automationMustNotInferApproval: packet.automationMustNotInferApproval === true, identityComplete, billingComplete, meshyComplete, packetStatusReady: packet.status === 'READY_FOR_VERIFICATION', unsafeKeys: unsafeKeys.length === 0 },
  unsafeKeyPaths: unsafeKeys,
  authority,
  note: 'A READY_FOR_AUTHORITY_RECHECK packet still requires the existing identity, billing, and Meshy authoritative verifiers to pass; this tool never promotes a release gate by itself.',
}
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status === 'FAIL_UNSAFE_PACKET') process.exitCode = 1
