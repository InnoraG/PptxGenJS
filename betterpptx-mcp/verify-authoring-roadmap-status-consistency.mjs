#!/usr/bin/env node
// Cross-check the owner-facing authoring roadmap against the current machine
// reports. This is deliberately read-only and does not authorize promotion.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyMvpBaselineInventory } from './verify-mvp-baseline-inventory.mjs'
import { verifyMvpBaselinePublicContract } from './verify-mvp-baseline-public-contract.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const roadmapPath = path.join(here, 'docs', 'AUTHORING-EXCELLENCE-ROADMAP.md')
const statusPath = path.join(repoRoot, 'plans', 'authoring-excellence-status.md')
const g4Path = path.join(here, 'docs', 'release-safety', 'G4-SECRET-INVENTORY.md')
const g5Path = path.join(here, 'docs', 'release-safety', 'G5-ASSET-LICENSE-LEDGER.md')
const devReportPath = path.join(here, 'outputs', 'release-safety-suite-report.json')
const strictReportPath = path.join(here, 'outputs', 'release-safety-suite-strict-report.json')
const strictSnapshotPath = path.join(here, 'outputs', 'strict-release-gate-snapshot.json')
const c3PropertyCorpusPath = path.join(here, 'outputs', 'c3-layout-interaction-property-corpus-report.json')
const scopedApprovalPath = path.join(here, 'outputs', 'avatar-scoped-owner-approval-verification-report.json')
const model3dDependencyPath = path.join(here, 'outputs', 'model3d-worker-dependency-lock-report.json')
const provenancePath = path.join(here, 'outputs', 'source-provenance-gate-report.json')
const g5SourceManifestPath = path.join(here, 'docs', 'release-safety', 'G5-SOURCE-ASSET-HASH-MANIFEST-20260802.json')
const mvpBaselineInventory = verifyMvpBaselineInventory()
const mvpBaselinePublicContract = await verifyMvpBaselinePublicContract()
const mvpBaselineInventoryJson = mvpBaselineInventory.inventoryPath
	? JSON.parse(await fs.readFile(path.resolve(repoRoot, mvpBaselineInventory.inventoryPath), 'utf8'))
	: null
const mvpBaselineRowCount = Number(mvpBaselineInventoryJson?.catalogClosure?.baselineRows || 0)

const [roadmap, status, g4, g5, dev, strict, strictSnapshot, c3PropertyCorpus, scopedApproval, model3dDependency, provenance, g5SourceManifest] = await Promise.all([
	fs.readFile(roadmapPath, 'utf8'),
	fs.readFile(statusPath, 'utf8'),
	fs.readFile(g4Path, 'utf8'),
	fs.readFile(g5Path, 'utf8'),
	fs.readFile(devReportPath, 'utf8').then(JSON.parse),
	fs.readFile(strictReportPath, 'utf8').then(JSON.parse),
	fs.readFile(strictSnapshotPath, 'utf8').then(JSON.parse),
	fs.readFile(c3PropertyCorpusPath, 'utf8').then(JSON.parse),
	fs.readFile(scopedApprovalPath, 'utf8').then(JSON.parse),
	fs.readFile(model3dDependencyPath, 'utf8').then(JSON.parse),
	fs.readFile(provenancePath, 'utf8').then(JSON.parse),
	fs.readFile(g5SourceManifestPath, 'utf8').then(JSON.parse),
])

const normalized = text => text.replace(/\s+/g, ' ').trim()
const combined = `${normalized(roadmap)} ${normalized(status)}`
const checks = []
const check = (id, ok, detail) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
const counts = report => ({
	registered: report.results.length,
	pass: report.results.filter(result => result.status === 'PASS').length,
	fail: report.results.filter(result => result.status === 'FAIL').length,
	skip: report.results.filter(result => result.status === 'SKIPPED_OPTIONAL').length,
})

const devCounts = counts(dev)
const strictCounts = counts(strict)
const changed = provenance.provenance?.changedFileCount

check('development-report-green', dev.green === true && devCounts.fail === 0,
	`development report is ${devCounts.registered} registered / ${devCounts.pass} PASS / ${devCounts.skip} skipped / ${devCounts.fail} failed`)
check('strict-report-fail-closed', strict.green === false && strictCounts.fail === 3 && strictCounts.skip === 3,
	`strict report is ${strictCounts.pass} PASS / ${strictCounts.fail} failures / ${strictCounts.skip} skipped`)
const snapshotResults = Array.isArray(strictSnapshot.results) ? strictSnapshot.results : []
const expectedSnapshotStatuses = new Map([
	['source-provenance-release-gate', changed === 0 ? 'PASS' : 'FAIL'],
	['g1-delivery-release-gate', 'PASS'],
	['g4-deployment-secret-gate', 'FAIL'],
	['g5-product-asset-release-gate', 'PASS'],
])
check('strict-gate-snapshot-current', strictSnapshot.status === 'BLOCKED' && snapshotResults.length === 4 &&
	snapshotResults.some(result => result.id === 'source-provenance-release-gate' && result.status === (changed === 0 ? 'PASS' : 'FAIL') && result.tail?.some(line => line.includes(`changed=${changed}`))) &&
	snapshotResults.every(result => expectedSnapshotStatuses.get(result.id) === result.status),
	`current strict-gate snapshot is ${strictSnapshot.status} with ${snapshotResults.length} governance-gate results and provenance count ${changed}`)
const expectedOwnerActionIds = new Set([
	'clean-reviewed-provenance-sha',
	'g1-owner-approval-exact-delivery-candidate',
	'g4-live-deployment-rotation-breakglass-evidence',
	'g5-owner-approval-product-bundles',
])
const ownerActions = Array.isArray(strictSnapshot.ownerActions) ? strictSnapshot.ownerActions : []
const expectedOwnerActionState = new Map([
	['clean-reviewed-provenance-sha', { blocking: changed !== 0, status: changed === 0 ? 'COMPLETE' : 'OPEN_OWNER_ACTION' }],
	['g1-owner-approval-exact-delivery-candidate', { blocking: false, status: 'COMPLETE' }],
	['g4-live-deployment-rotation-breakglass-evidence', { blocking: true, status: 'OPEN_EXTERNAL_EVIDENCE' }],
	['g5-owner-approval-product-bundles', { blocking: false, status: 'COMPLETE' }],
])
const ownerActionInventoryPass = ownerActions.length === expectedOwnerActionIds.size &&
	ownerActions.every(action => {
		const expected = expectedOwnerActionState.get(action.id)
		return expected && action.requiredEvidence && action.blocking === expected.blocking && action.status === expected.status
	})
check('strict-owner-action-inventory', ownerActionInventoryPass,
	`strict snapshot has ${ownerActions.filter(action => action.blocking === true).length} active blocking actions (${ownerActions.length} total action records)`)
check('strict-local-vs-release-separation', strictSnapshot.publicEnablementAllowed === false &&
	strictSnapshot.ownerApprovalNotInferred === true &&
	/Local validation is reported separately from owner approval/i.test(strictSnapshot.localValidationSummary?.interpretation || ''),
	'strict snapshot keeps local technical evidence separate from owner authorization and live deployment evidence')
check('c3-property-corpus', c3PropertyCorpus.status === 'PASS_C3_LOCAL_PROPERTY_CORPUS_PERCEPTUAL_OPEN' &&
		c3PropertyCorpus.cases === 280 && c3PropertyCorpus.feasibleCases === 240 && c3PropertyCorpus.feasiblePassed === 240 && c3PropertyCorpus.actionableCases === 40 && c3PropertyCorpus.actionablePassed === 40 &&
	c3PropertyCorpus.oracle?.independentFromSolver === true && c3PropertyCorpus.oracle?.perceptualReviewRequired === true,
	`C3 local layout/interaction corpus is ${c3PropertyCorpus.status} with ${c3PropertyCorpus.cases} cases; perceptual review remains open`)
check('scoped-avatar-approval', scopedApproval.status === 'PASS_SCOPED_APPROVAL_VERIFIED_FULL_GATE_OPEN' &&
	scopedApproval.privateOnly === true && scopedApproval.publicEnablementAllowed === false && scopedApproval.ownerApprovalNotInferred === true &&
	scopedApproval.checks?.every(item => item.status === true),
	'scoped avatar canary approval hash/posture is verified while the full identity gate remains open')
check('model3d-dependency-audit', model3dDependency.status === 'PASS_DECLARATIONS_RECORDED_OPEN_PINNING' &&
	model3dDependency.noticesIndexPresent === true && Array.isArray(model3dDependency.openDeclarations) &&
	model3dDependency.openDeclarations.length > 0,
	`model3d-worker dependency audit records ${model3dDependency.openDeclarations?.length || 0} open declarations without inferring a desktop lock`)
check('roadmap-development-count', combined.includes(`${devCounts.registered} registered`) && combined.includes(`${devCounts.pass} PASS`),
	`roadmap/status contain current development counts ${devCounts.registered}/${devCounts.pass}`)
check('roadmap-strict-count', combined.includes(`${strictCounts.pass} PASS`) && combined.includes(`${strictCounts.fail} release-gate failures`),
	`roadmap/status contain current strict counts ${strictCounts.pass}/${strictCounts.fail}/${strictCounts.skip}`)
check('provenance-posture', Number.isInteger(changed) && (changed === 0
	? combined.includes('clean immutable') || combined.includes('clean reviewed immutable')
	: combined.includes('immutable canonical provenance') && combined.includes('clean immutable commit')),
	`roadmap/status represent ${changed === 0 ? 'clean' : 'dirty'} canonical provenance without binding mutable documentation to a transient path count`)
check('blackbox-counts', combined.includes('19/19') && combined.includes('44/44') && combined.includes('64/64'),
	'roadmap/status retain current committed-fixture, cold-adversarial, and cold semantic-authoring evidence')
check('g4-local-count', combined.includes('8/9'), 'roadmap/status retain the current G4 local/evidence split')
check('authoring-v3-motion-closure', combined.includes('96 tracked motion rows') && combined.includes('48 executable') &&
	combined.includes('18-per-presenter bundle ceiling') && combined.includes('closed technical Authoring-v3 motion MVP'),
	'roadmap/status record the closed 96/48 Authoring-v3 motion MVP while preserving the 18-per-presenter bundle ceiling')
const visualDirectorRow = roadmap.split(/\r?\n/).find(line => line.includes('| Contextual Visual Director |')) || ''
check('visual-director-current-scope', visualDirectorRow.includes('now green') && visualDirectorRow.includes('aesthetic/semantic review loop'),
	'current Visual Director row distinguishes green OCR/crop/package evidence from open perceptual work')
check('g4-owner-doc-current', g4.includes('LOCAL CONTROL 8/9 GREEN') && g4.includes('G4 closure checklist (current state)') &&
	g4.includes('[x] Private Mission Control') && g4.includes('G4-LIVE-DEPLOYMENT-PREFLIGHT-2026-08-15.json'),
	'G4 inventory distinguishes locally green owner controls from live deployment evidence')
check('g4-live-evidence-open', g4.includes('G4-DEPLOYMENT-EVIDENCE.json') && /live deployment/i.test(g4),
	'G4 inventory retains the required live deployment evidence action')
check('g5-owner-doc-current', g5.includes('EXACT PRODUCT-BUNDLE APPROVAL GATE CLOSED') && g5.includes('STRICT GUARD ACTIVE') &&
	/fail closed/i.test(g5) && g5.includes('curated 18-clip presenter deployment bundle'),
	'G5 ledger records the closed hash-bound approval and active drift guard')
check('g5-approval-closed', g5.includes('[x] Obtain explicit owner approval for the exact curated 18-clip deployment, Joe, and Louise product bundles') &&
	(g5.match(/APPROVED BY OWNER 2026-08-14 — HASH BOUND/g) || []).length === 3,
	'G5 ledger records all three exact product-bundle approvals as closed')
check('g5-source-integrity',
	Array.isArray(g5SourceManifest.entries) && g5SourceManifest.entries.length === 19 &&
		g5.includes('G5-SOURCE-ASSET-HASH-MANIFEST-20260802.json') && g5.includes('19/19'),
	'G5 source-row hash manifest is present, scoped to 19 rows, and recorded in the owner ledger')
check('g5-notices-machine-crosscheck',
	g5.includes('verify-g5-notices-sbom-crosscheck.mjs') && g5.includes('manualVersionCoverageRequired:true') &&
	g5.includes('private maintainer version/revision index') && g5.includes('standalone transitive-PoC pins') &&
	g5.includes('verify-model3d-worker-dependency-lock.mjs') && g5.includes('12 open range/unpinned declarations'),
	'G5 ledger records the machine cross-check, version/revision index, model3d dependency audit, and explicit remaining pinning work')
check('public-posture', combined.includes('black-box-clean') && combined.includes('promotion remains blocked'),
	'roadmap/status distinguish black-box cleanliness from governance-based promotion blocking')
check('mvp-baseline-inventory-current', mvpBaselineInventory.status === 'PASS' &&
	combined.includes('mvpBaselineInventory') && mvpBaselineRowCount > 0 && combined.includes(`${mvpBaselineRowCount.toLocaleString('en-US')} baseline`),
	`MVP baseline inventory is ${mvpBaselineInventory.status} with ${mvpBaselineRowCount} baseline rows and remains represented in the roadmap/status documents`)
check('mvp-baseline-public-contract', mvpBaselinePublicContract.status === 'PASS' &&
	combined.includes('declared-tool handler parity'),
	`MVP baseline public contract is ${mvpBaselinePublicContract.status} with ${mvpBaselinePublicContract.counts?.semanticFamilies || 0} semantic families`)

const failed = checks.filter(item => item.status === 'FAIL')
const report = {
	schemaVersion: 'betterpptx.authoring-roadmap-status-consistency.v1',
	status: failed.length === 0 ? 'PASS' : 'FAIL',
	checks,
	publicEnablementAllowed: false,
}
console.log(JSON.stringify(report, null, 2))
process.exit(failed.length === 0 ? 0 : 1)
