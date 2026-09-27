#!/usr/bin/env node
/**
 * Current strict release-gate snapshot.
 *
 * The full release-safety aggregate is intentionally broad and can take much
 * longer than the four governance gates it contains. This read-only snapshot
 * runs those four gates directly so the owner has a current, bounded record of
 * release blockers (especially the current dirty-tree count). It never grants
 * approval or changes public enablement.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const outputPath = path.join(here, 'outputs', 'strict-release-gate-snapshot.json');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const handoffDir = path.join(repoRoot, 'outputs', 'authoring-principle-release-gate', stamp);
const handoffPath = path.join(handoffDir, 'strict-release-gate-snapshot.json');

const gates = [
	{ id: 'source-provenance-release-gate', file: 'verify-source-provenance-gate.mjs' },
	{ id: 'g1-delivery-release-gate', file: 'verify-g1-delivery-release-manifest.mjs' },
	{ id: 'g4-deployment-secret-gate', file: 'verify-g4-deployment-secret-gate.mjs' },
	{ id: 'g5-product-asset-release-gate', file: 'verify-g5-product-asset-ledger.mjs' },
];

const results = [];
for (const gate of gates) {
	const started = Date.now();
	const run = spawnSync(process.execPath, [path.join(here, gate.file), '--strict'], {
		cwd: repoRoot,
		encoding: 'utf8',
		timeout: 120_000,
	});
	const output = `${run.stdout || ''}${run.stderr || ''}`;
	const lines = output.split(/\r?\n/).filter(Boolean);
	results.push({
		id: gate.id,
		status: run.status === 0 ? 'PASS' : 'FAIL',
		exitCode: run.status,
		timedOut: run.error?.code === 'ETIMEDOUT',
		ms: Date.now() - started,
		tail: lines.slice(-12),
	});
}

// Each strict gate writes a structured report beside its console output. Keep
// the snapshot useful as a release handoff by reading those reports back and
// reducing them to evidence references plus explicit owner actions. This is
// intentionally additive: the strict gates remain the authority and still
// fail closed on dirty provenance, missing approvals, or missing deployment
// evidence.
const reportFiles = {
	'source-provenance-release-gate': path.join(here, 'outputs', 'source-provenance-gate-report.json'),
	'g1-delivery-release-gate': path.join(here, 'outputs', 'g1-delivery-release-manifest-report.json'),
	'g4-deployment-secret-gate': path.join(here, 'outputs', 'g4-deployment-secret-gate-report.json'),
	'g5-product-asset-release-gate': path.join(here, 'outputs', 'g5-product-asset-ledger-report.json'),
};
const readJson = async file => {
	try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
};
const evidenceReports = {};
for (const [id, file] of Object.entries(reportFiles)) {
	const report = await readJson(file);
	const relativeReport = path.relative(repoRoot, file).replaceAll('\\', '/');
	evidenceReports[id] = {
		report: relativeReport,
		available: Boolean(report),
		status: report?.status || 'MISSING_REPORT',
		releaseReady: report?.releaseReady ?? report?.strictReleaseAllowed ?? false,
		passChecks: Array.isArray(report?.checks) ? report.checks.filter(item => item.status === 'PASS').length : null,
		totalChecks: Array.isArray(report?.checks) ? report.checks.length : null,
		failedCheckIds: Array.isArray(report?.checks) ? report.checks.filter(item => item.status !== 'PASS').map(item => item.id) : [],
	};
}

const sourceEvidence = await readJson(reportFiles['source-provenance-release-gate']);
const g1Manifest = await readJson(path.join(here, 'docs', 'release-safety', 'G1-PRODUCTION-DELIVERY-RELEASE-MANIFEST.json'));
const g1Evidence = await readJson(reportFiles['g1-delivery-release-gate']);
const g4Evidence = await readJson(reportFiles['g4-deployment-secret-gate']);
const g5Manifest = await readJson(path.join(here, 'docs', 'release-safety', 'G5-PRODUCT-ASSET-RELEASE-MANIFEST.json'));
const g5Evidence = await readJson(reportFiles['g5-product-asset-release-gate']);

const g1Approved = g1Manifest?.status === 'OWNER_APPROVED' &&
	g1Manifest?.ownerApproval?.status === 'APPROVED' &&
	g1Manifest?.ownerApproval?.decision === 'APPROVED' &&
	g1Manifest?.approvedEvolvedCandidate?.approvalStatus === 'OWNER_APPROVED';
const activeG1Candidates = g1Manifest?.approvedEvolvedCandidate
	? [g1Manifest.approvedEvolvedCandidate]
	: (g1Manifest?.artifacts || []).filter(item => !String(item?.approvalStatus || '').startsWith('SUPERSEDED_'));
const pendingG1 = g1Approved
	? []
	: activeG1Candidates.map(item => ({ id: item.id, path: item.path, sha256: item.sha256, approvalStatus: item.approvalStatus }));
const g5Assets = (g5Manifest?.assets || [])
	.map(item => ({ id: item.id, path: item.path, sha256: item.sha256, bytes: item.bytes, approvalStatus: item.approvalStatus }));
const pendingG5 = g5Assets
	.filter(item => !(g5Manifest?.policy?.approvedStatuses || []).includes(item?.approvalStatus));
const ownerActions = [
	{
		id: 'clean-reviewed-provenance-sha',
		gate: 'source-provenance-release-gate',
		actionType: 'PROVENANCE_REVIEW',
		status: sourceEvidence?.releaseEligible === true ? 'COMPLETE' : 'OPEN_OWNER_ACTION',
		blocking: sourceEvidence?.releaseEligible !== true,
		requiredEvidence: 'A reviewed immutable private commit with a clean worktree; rerun the strict provenance gate against that exact SHA.',
		currentEvidence: {
			commit: sourceEvidence?.provenance?.gitCommit || null,
			changedPathCount: sourceEvidence?.provenance?.changedFileCount ?? null,
			gitTreeClean: sourceEvidence?.provenance?.gitTreeClean ?? null,
		},
	},
	{
		id: 'g1-owner-approval-exact-delivery-candidate',
		gate: 'g1-delivery-release-gate',
		actionType: 'OWNER_APPROVAL',
		status: g1Approved ? 'COMPLETE' : 'OPEN_OWNER_APPROVAL',
		blocking: !g1Approved,
		requiredEvidence: 'Owner approval for the exact active hash-pinned native Record Studio delivery candidate. Superseded historical candidates do not count as active approvals.',
		candidates: pendingG1.length ? pendingG1 : activeG1Candidates.map(item => ({ id: item.id, path: item.path, sha256: item.sha256, approvalStatus: item.approvalStatus })),
	},
	{
		id: 'g4-live-deployment-rotation-breakglass-evidence',
		gate: 'g4-deployment-secret-gate',
		actionType: 'EXTERNAL_DEPLOYMENT_EVIDENCE',
		status: g4Evidence?.strictReleaseAllowed === true ? 'COMPLETE' : 'OPEN_EXTERNAL_EVIDENCE',
		blocking: g4Evidence?.strictReleaseAllowed !== true,
		requiredEvidence: 'Owner-supplied immutable evidence for a live Secret Manager-backed deployment, rotation test, rollback/break-glass exercise, and no-raw-secret audit.',
		evidencePath: g4Evidence?.evidencePath || 'betterpptx-mcp/docs/release-safety/G4-DEPLOYMENT-EVIDENCE.json',
		failedChecks: evidenceReports['g4-deployment-secret-gate'].failedCheckIds,
	},
	{
		id: 'g5-owner-approval-product-bundles',
		gate: 'g5-product-asset-release-gate',
		actionType: 'OWNER_APPROVAL',
		status: pendingG5.length === 0 ? 'COMPLETE' : 'OPEN_OWNER_APPROVAL',
		blocking: pendingG5.length !== 0,
		requiredEvidence: 'Owner approval for the exact bundled/distributed product asset hashes below, including the curated 18-clip presenter deployment bundle and default presenter bundles.',
		// Keep the approved hashes visible in the handoff after closure; an empty
		// list would lose the evidence that made this action COMPLETE.
		assets: g5Assets,
	},
];
const g1LocalChecks = (g1Evidence?.checks || []).filter(item => item.id !== 'owner-approval');
const g4LocalChecks = (g4Evidence?.checks || []).filter(item => item.id !== 'deployment-evidence');
const g5IntegrityIssues = (g5Evidence?.issues || []).filter(item => item.code !== 'OWNER_APPROVAL_PENDING');

const report = {
	schemaVersion: 'betterpptx.strict-release-gate-snapshot.v1',
	measuredAt: new Date().toISOString(),
	mode: 'strict-release-gates-only',
	status: results.every((result) => result.status === 'PASS') ? 'GREEN' : 'BLOCKED',
	results,
	evidenceReports,
	ownerActions,
	releaseGateSummary: {
		gateCount: gates.length,
		passingGateCount: results.filter(result => result.status === 'PASS').length,
		blockingActionCount: ownerActions.filter(action => action.blocking).length,
	},
	localValidationSummary: {
		g1ArtifactAndPlaybackChecksPass: g1LocalChecks.length > 0 && g1LocalChecks.every(item => item.status === 'PASS'),
		g4TemplateAndOwnerControlChecksPass: g4LocalChecks.length > 0 && g4LocalChecks.every(item => item.status === 'PASS'),
		g5AssetPresenceAndHashChecksPass: g5IntegrityIssues.length === 0,
		interpretation: 'Local validation is reported separately from owner approval and live deployment evidence; neither is inferred.',
	},
	provenance: sourceEvidence?.provenance || null,
	publicEnablementAllowed: false,
	ownerApprovalNotInferred: true,
	fullAggregateReference: 'betterpptx-mcp/outputs/release-safety-suite-strict-report.json',
};

report.handoffArtifact = path.relative(repoRoot, handoffPath).replaceAll('\\', '/');
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
await fs.mkdir(handoffDir, { recursive: true });
await fs.writeFile(handoffPath, `${JSON.stringify({ ...report, handoffPath: 'private-maintainer-evidence' }, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
// This is a report, not an authorization gate: callers can inspect BLOCKED
// without the verifier itself becoming another release failure.
