#!/usr/bin/env node
// Validate the native-3D owner handoff worksheet without granting approval.
// This file never reads credentials or image bytes and never changes the
// license ledger, credential store, Modal state, or provider state.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const worksheetPath = path.join(here, 'docs', 'release-safety', 'MESHY-3D-OWNER-DECISION-WORKSHEET.json')
const outputPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-owner-decision-worksheet-20260718.json')
const requiredIds = [
	'mesh-account-and-terms',
	'image-consent-and-processing-scope',
	'mixamo-distribution-rights',
	'joe-louise-fallback-rights',
	'owner-approved-input-set',
	'one-paid-live-canary',
	'live-profile-revisions-and-rollback',
]

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

const worksheet = readJson(worksheetPath)
const decisions = Array.isArray(worksheet.decisions) ? worksheet.decisions : []
const ids = decisions.map(item => String(item?.id || ''))
const uniqueIds = new Set(ids)
const statuses = new Set(['OPEN', 'CLEARED'])
const structurePass = worksheet.schemaVersion === 'betterpptx.native-3d-owner-decision-worksheet.v1' && worksheet.scope === 'native-3d-presenter-only' && worksheet.developmentMode === 'premium' && requiredIds.length === decisions.length && requiredIds.every(id => uniqueIds.has(id)) && uniqueIds.size === requiredIds.length && decisions.every(item => statuses.has(String(item?.status || '')))
const cleared = structurePass && decisions.filter(item => item.status === 'CLEARED')
const clearedEvidencePass = cleared.every(item => String(item.evidenceRef || '').trim().length > 0) && (cleared.length === 0 || (String(worksheet.owner?.reviewer || '').trim().length > 0 && String(worksheet.owner?.reviewedAt || '').trim().length > 0 && String(worksheet.owner?.authorizationReference || '').trim().length > 0))
const noSensitiveFields = !JSON.stringify(worksheet).toLowerCase().includes('api_key') && !JSON.stringify(worksheet).toLowerCase().includes('token') && !JSON.stringify(worksheet).toLowerCase().includes('base64')
const allCleared = structurePass && cleared.length === requiredIds.length && clearedEvidencePass && worksheet.liveCanary?.approved === true
const report = {
	schemaVersion: 'betterpptx.native-3d-owner-decision-worksheet-report.v1',
	status: !structurePass || !clearedEvidencePass || !noSensitiveFields ? 'BLOCKED_WORKSHEET_INVALID' : allCleared ? 'OWNER_DECISIONS_CLEARED' : 'OWNER_DECISIONS_OPEN',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	networkAttempted: false,
	worksheetPath,
	checks: {
		worksheetSchema: structurePass,
		requiredDecisionIds: structurePass,
		clearedDecisionsHaveEvidence: clearedEvidencePass,
		noSensitiveFields: noSensitiveFields,
		liveCanaryExplicitlyApproved: worksheet.liveCanary?.approved === true,
	},
	decisionCount: decisions.length,
	clearedDecisionCount: cleared.length,
	openDecisionIds: decisions.filter(item => item.status !== 'CLEARED').map(item => item.id),
	ownerReferencePresent: Boolean(String(worksheet.owner?.authorizationReference || '').trim()),
	nextAction: allCleared ? 'Run the guarded live deployment/canary sequence exactly once and attach real revision, health, and rollback evidence.' : 'Owner must complete the worksheet decisions; OPEN is the safe default and does not grant release approval.',
	retryPolicy: 'No automatic retry and no approval inference; this verifier is local-only.',
}
writeJsonReport(outputPath, report)
console.log(JSON.stringify(report, null, 2))
if (report.status === 'BLOCKED_WORKSHEET_INVALID') process.exitCode = 2
