#!/usr/bin/env node
// Guarded owner deployment runner for betterxavatar1/betterxavatar2.
// Default mode is dry-run. --execute requires two explicit owner signals,
// performs at most one deploy per profile, stops on the first failure, and
// never edits the credential store or retries automatically.
import fs from 'node:fs'
import path from 'node:path'
import { writeJsonReport } from './lib/atomic-report.mjs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const preflightPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-target-deployment-preflight-20260718.json')
const ownerDecisionWorksheetReportPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-owner-decision-worksheet-20260718.json')
const output = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-target-deployment-run-20260718.json')
const sourcePath = path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'model3d_app.py')
const execute = process.argv.includes('--execute')
const requiredApproval = process.env.BETTERPPTX_MESHY_MODAL_DEPLOY_APPROVED === '1'
const requiredConfirmation = process.env.BETTERPPTX_MESHY_MODAL_DEPLOY_CONFIRM === 'DEPLOY_TWO_TARGET_PROFILES_ONCE'

function sha256(value) { return createHash('sha256').update(String(value || '')).digest('hex').toUpperCase() }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function modalInventory(profile) {
	const result = spawnSync('python', ['-m', 'modal', 'app', 'list', '--json'], {
		cwd: repo,
		encoding: 'utf8',
		timeout: 30000,
		windowsHide: true,
		env: { ...process.env, MODAL_PROFILE: profile },
	})
	if (result.status !== 0) return { queryOk: false, errorClass: 'MODAL_PROFILE_QUERY_FAILED' }
	try {
		const apps = JSON.parse(String(result.stdout || '').trim() || '[]')
		const model3d = Array.isArray(apps) ? apps.filter(app => String(app.description || '') === 'betterpptx-model3d') : []
		return { queryOk: true, appCount: Array.isArray(apps) ? apps.length : 0, model3dAppCount: model3d.length, model3dStates: model3d.map(app => String(app.state || 'unknown')).sort() }
	} catch { return { queryOk: false, errorClass: 'INVALID_MODAL_JSON' } }
}

if (!fs.existsSync(preflightPath)) throw new Error('TARGET_DEPLOYMENT_PREFLIGHT_MISSING')
const preflight = readJson(preflightPath)
if (preflight.status !== 'READY_FOR_OWNER_DEPLOYMENT') throw new Error('TARGET_DEPLOYMENT_PREFLIGHT_NOT_READY')
if (preflight.checks?.upstreamRefsPinned !== true || preflight.checks?.hfModelRevisionsPinned !== true || preflight.checks?.revisionOverridesFailClosed !== true || preflight.checks?.embeddedPayloadDigestComplete !== true) throw new Error('TARGET_DEPLOYMENT_IMMUTABLE_PAYLOAD_CONTRACT_NOT_READY')
if (!fs.existsSync(sourcePath)) throw new Error('MODEL3D_WORKER_SOURCE_MISSING')
let ownerDecisionWorksheet = null
try { ownerDecisionWorksheet = readJson(ownerDecisionWorksheetReportPath) } catch {}
const ownerDecisionWorksheetCleared = ownerDecisionWorksheet?.status === 'OWNER_DECISIONS_CLEARED' && ownerDecisionWorksheet?.checks?.noSensitiveFields === true && Array.isArray(ownerDecisionWorksheet?.openDecisionIds) && ownerDecisionWorksheet.openDecisionIds.length === 0

const report = {
	schemaVersion: 'betterpptx.native-3d-modal-target-deployment-run.v1',
	status: execute ? 'EXECUTION_NOT_STARTED' : 'DRY_RUN_READY',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	executeRequested: execute,
	ownerApprovalSignalsPresent: requiredApproval && requiredConfirmation,
	ownerDecisionWorksheetCleared,
	ownerDecisionWorksheetStatus: ownerDecisionWorksheet?.status || 'MISSING',
	preflight: preflightPath,
	sourceDigest: preflight.sourceDigest,
	targetProfiles: preflight.targetProfiles,
	plans: preflight.plans.map(plan => ({ profile: plan.profile, endpointLabel: plan.endpointLabel, healthEndpointLabel: plan.healthEndpointLabel, deploymentRevision: plan.deploymentRevision, sourceDigest: plan.sourceDigest, upstreamRefs: plan.upstreamRefs, hfModelRevisions: plan.hfModelRevisions })),
	deploymentAttempted: false,
	generationAttempted: false,
	credentialStoreMutated: false,
	results: [],
	noAutomaticRetry: true,
}

if (execute && !ownerDecisionWorksheetCleared) {
	report.status = 'OWNER_DECISION_WORKSHEET_REQUIRED'
	report.ownerNextAction = 'Complete all seven owner decisions in MESHY-3D-OWNER-DECISION-WORKSHEET.json, run its verifier until OWNER_DECISIONS_CLEARED, then rerun this guarded command. No deployment was attempted.'
} else if (execute && (!requiredApproval || !requiredConfirmation)) {
	report.status = 'OWNER_CONFIRMATION_REQUIRED'
	report.ownerNextAction = 'Set BETTERPPTX_MESHY_MODAL_DEPLOY_APPROVED=1 and BETTERPPTX_MESHY_MODAL_DEPLOY_CONFIRM=DEPLOY_TWO_TARGET_PROFILES_ONCE, then rerun with --execute. No deployment was attempted.'
} else if (execute) {
	for (const plan of preflight.plans) {
		const started = Date.now()
		const env = {
			...process.env,
			MODAL_PROFILE: plan.profile,
			...plan.upstreamRefs,
			...plan.hfModelRevisions,
			MODEL3D_ENDPOINT_LABEL: plan.endpointLabel,
			MODEL3D_HEALTH_ENDPOINT_LABEL: plan.healthEndpointLabel,
			MODEL3D_DEPLOYMENT_REVISION: plan.deploymentRevision,
			MODEL3D_SOURCE_DIGEST: plan.sourceDigest,
		}
		const result = spawnSync('python', ['-m', 'modal', 'deploy', 'betterpptx-mcp/deploy/model3d-worker/model3d_app.py'], {
			cwd: repo,
			encoding: 'utf8',
			timeout: 30 * 60 * 1000,
			windowsHide: true,
			env,
		})
		const entry = {
			profile: plan.profile,
			deploymentAttempted: true,
			exitCode: result.status,
			outputTimedOut: result.error?.code === 'ETIMEDOUT',
			stdoutSha256: sha256(result.stdout),
			stderrSha256: sha256(result.stderr),
			outputPersisted: false,
			latencyMs: Date.now() - started,
		}
		if (result.status === 0) entry.postDeployInventory = modalInventory(plan.profile)
		report.results.push(entry)
		report.deploymentAttempted = true
		if (result.status !== 0) {
			report.status = 'EXECUTED_STOPPED_ON_FAILURE'
			report.ownerNextAction = 'Inspect the hashed deployment output through the owner-controlled Modal console, do not retry automatically, and decide whether to roll back the single attempted profile before proceeding.'
			break
		}
	}
	if (report.status === 'EXECUTION_NOT_STARTED') report.status = 'EXECUTED_ALL_DEPLOYMENTS_RETURNED_ZERO'
} 

writeJsonReport(output, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'DRY_RUN_READY' && report.status !== 'EXECUTED_ALL_DEPLOYMENTS_RETURNED_ZERO') process.exitCode = 1
