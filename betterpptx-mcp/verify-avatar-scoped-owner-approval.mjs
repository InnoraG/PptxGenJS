#!/usr/bin/env node
/**
 * Maintainer-only verifier for the owner's narrowly scoped HTML canary approval.
 * This validates the exact artifact hash and private-only scope; it never turns
 * a scoped panel approval into a full identity-quality or production approval.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const recordPath = path.join(here, 'outputs', 'AVATAR-OWNER-SCOPED-APPROVAL-CURRENT-2026-08-01.json')
const reportPath = path.join(here, 'outputs', 'avatar-scoped-owner-approval-verification-report.json')
const checks = []
const check = (id, status, detail) => checks.push({ id, status: Boolean(status), detail })

let record
try {
	record = JSON.parse(await fs.readFile(recordPath, 'utf8'))
	check('record-present', true, 'Scoped approval record is present.')
} catch (error) {
	check('record-present', false, `Scoped approval record is unavailable: ${error.message}`)
}

const artifactPath = record?.scope?.artifact ? path.resolve(record.scope.artifact) : null
const expectedRoot = path.resolve(repoRoot, 'betterpptx-mcp', 'outputs')
const artifactInScope = artifactPath && (artifactPath === expectedRoot || artifactPath.startsWith(`${expectedRoot}${path.sep}`))
check('record-schema', record?.schemaVersion === 'betterpptx.avatar.owner-identity-scoped-approval.v2', 'Record uses the scoped owner-approval schema v2.')
check('scoped-decision', record?.status === 'SCOPED_APPROVAL_RECORDED_FULL_GATE_OPEN' && record?.decision === 'PASS_SCOPED_CANARY_PANELS', 'Decision is an explicit scoped canary-panel approval.')
check('artifact-path-private', Boolean(artifactInScope), 'Approved artifact is contained under the private outputs tree.')
check('private-posture', record?.scope?.privateStagingOnly === true && record?.scope?.publicEnablementAllowed === false && record?.publicSurfaceRule && record?.automationMustNotInferApproval === true, 'Record preserves private-only posture and forbids automated inference.')
check('approved-panels', Array.isArray(record?.scope?.approvedPanels) && record.scope.approvedPanels.length === 2, 'Exactly two canary panels are listed in the scoped approval.')
check('full-gate-open', record?.fullIdentityQualityGate?.status === 'OPEN' && Array.isArray(record?.fullIdentityQualityGate?.notClosedByThisRecord) && record.fullIdentityQualityGate.notClosedByThisRecord.length > 0, 'The full identity-quality gate remains explicitly open.')

let actualHash = null
if (artifactInScope) {
	try {
		const bytes = await fs.readFile(artifactPath)
		actualHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
		check('artifact-present', true, 'Approved HTML artifact is present.')
		check('artifact-hash', actualHash === String(record.scope.artifactSha256 || '').toUpperCase(), `Artifact SHA-256 matches the recorded approval hash: ${actualHash}.`)
	} catch (error) {
		check('artifact-present', false, `Approved HTML artifact is unavailable: ${error.message}`)
		check('artifact-hash', false, 'Artifact hash could not be measured.')
	}
} else {
	check('artifact-present', false, 'Artifact path is outside the private outputs scope.')
	check('artifact-hash', false, 'Artifact hash was not measured.')
}

const allPass = checks.every((item) => item.status)
const report = {
	schemaVersion: 'betterpptx.avatar.scoped-owner-approval-verification.v1',
	status: allPass ? 'PASS_SCOPED_APPROVAL_VERIFIED_FULL_GATE_OPEN' : 'FAIL_SCOPED_APPROVAL_VERIFICATION',
	privateOnly: true,
	publicEnablementAllowed: false,
	ownerApprovalNotInferred: true,
	record: path.relative(repoRoot, recordPath).replaceAll('\\', '/'),
	artifact: artifactPath ? path.relative(repoRoot, artifactPath).replaceAll('\\', '/') : null,
	actualArtifactSha256: actualHash,
	checks,
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (!allPass) process.exitCode = 1
