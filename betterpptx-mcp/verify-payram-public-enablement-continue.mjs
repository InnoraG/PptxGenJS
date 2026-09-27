import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'continue-payram-public-enablement.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')

function includes(needle, message) {
	assert(script.includes(needle), message)
}

includes('payram-public-enablement-continue', 'Continuation wrapper must write a stable evidence kind.')
includes('[string]$Service = "betterpptx-mcp-staging"', 'Continuation wrapper must default to the current staging gateway service.')
includes('[string]$WorkerService = "betterpptx-mcp-staging-worker"', 'Continuation wrapper must default to the current staging worker service.')
includes('ConfirmPayRamPublicEnable', 'Continuation wrapper must preserve guarded public-enable confirmation.')
includes('ENABLE PAYRAM CARD RAIL', 'Continuation wrapper must require the exact public-enable phrase.')
includes('ConfirmScwDeploy', 'Continuation wrapper must preserve guarded SCW deployment confirmation.')
includes('DEPLOY PAYRAM SCW', 'Continuation wrapper must require the exact SCW deployment phrase.')
includes('open-payram-oci-bastion-tunnel.ps1', 'Continuation wrapper must route host actions through OCI Bastion.')
includes('-PublicEnableResumeArgs $resumeArgs', 'Continuation wrapper must pass resume args to Bastion as a PowerShell string array.')
includes('RunPhase0Proof', 'Continuation wrapper must gate the live PayRam Phase 0 proof behind an explicit switch.')
includes('gcsBucketHash', 'Continuation evidence must not store the raw GCS bucket name.')
includes('Text.UTF8Encoding]::new($false)', 'Continuation evidence JSON must be UTF-8 without BOM.')
assert(!script.includes('ShowFullPublicAddresses'), 'Continuation wrapper must not print full funding addresses.')
assert(!script.includes('secrets versions access'), 'Continuation wrapper must not read raw Secret Manager payloads.')

const parser = spawnSync('powershell', [
	'-NoProfile',
	'-Command',
	`$errors=$null;[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath ${JSON.stringify(scriptPath)}),[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`,
], { cwd: process.cwd(), encoding: 'utf8' })
assert.equal(parser.status, 0, `PowerShell parser failed:\nSTDOUT:\n${parser.stdout}\nSTDERR:\n${parser.stderr}`)

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-payram-continue-'))
try {
	const resumeScript = path.join(tempRoot, 'resume.ps1')
	const checklistScript = path.join(tempRoot, 'checklist.ps1')
	const bastionScript = path.join(tempRoot, 'bastion.ps1')
	const resumeEvidence = path.join(tempRoot, 'resume.json')
	const checklistEvidence = path.join(tempRoot, 'checklist.json')
	const continueEvidence = path.join(tempRoot, 'continue.json')
	const callLog = path.join(tempRoot, 'calls.jsonl')

	fs.writeFileSync(resumeScript, `
param(
  [string]$ProjectId,
  [string]$Region,
  [string]$Service,
  [string]$WorkerService,
  [string]$PublicBase,
  [string]$GcsBucket,
  [string]$EvidencePath,
  [switch]$RefreshGasWalletStatus,
  [switch]$RunPhase0Proof,
  [switch]$ValidateCloudRunPayRamEnable,
  [switch]$EnableCloudRunPayRam,
  [string]$ConfirmPayRamPublicEnable
)
$gate = $env:FAKE_GATE
if ([string]::IsNullOrWhiteSpace($gate)) { $gate = 'settlement_collector_required' }
if ($ValidateCloudRunPayRamEnable) {
  Add-Content -LiteralPath '${callLog.replaceAll("'", "''")}' -Value 'validate'
}
if ($EnableCloudRunPayRam) {
  Add-Content -LiteralPath '${callLog.replaceAll("'", "''")}' -Value 'enable'
}
if ($RunPhase0Proof) {
  Add-Content -LiteralPath '${callLog.replaceAll("'", "''")}' -Value 'phase0'
}
[IO.File]::WriteAllText($EvidencePath, (([pscustomobject]@{
  kind='payram-public-enablement-resume'
  publicEnableReady=($gate -eq 'ready_for_guarded_cloud_run_enable')
  nextGate=$gate
  projectId=$ProjectId
  service=$Service
  workerService=$WorkerService
}) | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
`, 'utf8')
	fs.writeFileSync(checklistScript, `
param([string]$ProjectId,[string]$PublicEnableEvidencePath,[string]$OutputPath)
[IO.File]::WriteAllText($OutputPath, '{"kind":"payram-public-enablement-owner-checklist","ok":false}', [Text.UTF8Encoding]::new($false))
Add-Content -LiteralPath '${callLog.replaceAll("'", "''")}' -Value 'checklist'
`, 'utf8')
	fs.writeFileSync(bastionScript, `
param([switch]$UseRootCompartment,[switch]$RunPublicEnableResume,[string[]]$PublicEnableResumeArgs)
Add-Content -LiteralPath '${callLog.replaceAll("'", "''")}' -Value ('bastion:' + ($PublicEnableResumeArgs -join '|'))
`, 'utf8')

	const baseArgs = [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-ProjectId',
		'test-project',
		'-Service',
		'betterpptx-mcp-staging',
		'-WorkerService',
		'betterpptx-mcp-staging-worker',
		'-ResumeScriptPath',
		resumeScript,
		'-ChecklistScriptPath',
		checklistScript,
		'-BastionScriptPath',
		bastionScript,
		'-ResumeEvidencePath',
		resumeEvidence,
		'-ChecklistEvidencePath',
		checklistEvidence,
		'-ContinueEvidencePath',
		continueEvidence,
	]

	const collectorGate = spawnSync('powershell', baseArgs, { cwd: process.cwd(), encoding: 'utf8', timeout: 120000, env: { ...process.env, FAKE_GATE: 'settlement_collector_required' } })
	assert.equal(collectorGate.status, 0, `Collector-gate continuation failed:\nSTDOUT:\n${collectorGate.stdout}\nSTDERR:\n${collectorGate.stderr}`)
	const collectorEvidence = JSON.parse(fs.readFileSync(continueEvidence, 'utf8'))
	assert.equal(collectorEvidence.kind, 'payram-public-enablement-continue')
	assert.equal(collectorEvidence.finalGate, 'settlement_collector_required')
	assert.equal(collectorEvidence.stopReason, 'owner_action_required:settlement_collector')
	assert.equal(collectorEvidence.service, 'betterpptx-mcp-staging')
	assert(!JSON.stringify(collectorEvidence).includes('0x'), 'Continuation evidence must not contain raw funding addresses.')

	fs.rmSync(callLog, { force: true })
	const readyValidate = spawnSync('powershell', [...baseArgs, '-GcsBucket', 'secret-bucket-name', '-ConfirmPayRamPublicEnable', 'ENABLE PAYRAM CARD RAIL'], {
		cwd: process.cwd(),
		encoding: 'utf8',
		timeout: 120000,
		env: { ...process.env, FAKE_GATE: 'ready_for_guarded_cloud_run_enable' },
	})
	assert.equal(readyValidate.status, 0, `Ready-gate validation failed:\nSTDOUT:\n${readyValidate.stdout}\nSTDERR:\n${readyValidate.stderr}`)
	const readyEvidence = JSON.parse(fs.readFileSync(continueEvidence, 'utf8'))
	assert.equal(readyEvidence.finalGate, 'ready_for_guarded_cloud_run_enable')
	assert.equal(readyEvidence.stopReason, 'ready_for_owner_enable_confirmation')
	assert.equal(readyEvidence.gcsBucketHash.length, 64)
	assert(!JSON.stringify(readyEvidence).includes('secret-bucket-name'), 'Continuation evidence must not serialize the raw bucket name.')
	const calls = fs.readFileSync(callLog, 'utf8')
	assert(calls.includes('validate'), 'Ready-gate run with confirmation should validate guarded enablement.')
	assert(!calls.includes('enable'), 'Validation-only run must not enable Cloud Run.')
} finally {
	fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('PAYRAM PUBLIC ENABLEMENT CONTINUE: PASS gates=1 guarded=1 redacted=1 parser=1')
