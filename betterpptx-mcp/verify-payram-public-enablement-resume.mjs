import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'resume-payram-public-enablement.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')

function includes(needle, message) {
	assert(script.includes(needle), message)
}

includes('payram-public-enablement-resume', 'Resume script must write a stable redacted evidence kind.')
includes('Get-NextGate', 'Resume script must classify the next public-enablement gate.')
includes('settlement_collector_required', 'Resume script must gate on settlement collector setup.')
includes('payram_deployer_funding_required', 'Resume script must gate on PayRam deployer Base ETH funding.')
includes('payram_scw_deploy_required', 'Resume script must gate on PayRam SCW deployment/linking.')
includes('payram_phase0_required', 'Resume script must gate on PayRam Phase 0 proof.')
includes('host_verified_backup_restore_required', 'Resume script must gate on host-verified backup proof.')
includes('ready_for_guarded_cloud_run_enable', 'Resume script must expose the final guarded deploy state.')
includes('ConfirmPayRamPublicEnable', 'Resume script must preserve the explicit PayRam public-enable confirmation.')
includes('ENABLE PAYRAM CARD RAIL', 'Resume script must use the same explicit public-enable confirmation phrase as deploy.')
includes('[string]$Service = "betterpptx-mcp-staging"', 'Resume script must default to the current staging gateway service, not the deploy script production default.')
includes('[string]$WorkerService = "betterpptx-mcp-staging-worker"', 'Resume script must default to the current staging worker service.')
includes('Resolve-GcsBucketFromCloudRun', 'Resume script must be able to derive the current GCS bucket from Cloud Run before guarded enablement.')
includes('BETTERPPTX_GCS_BUCKET', 'Resume script must derive the bucket from the live service environment when omitted.')
includes('"-Service", $Service', 'Resume script must pass the explicit gateway service into guarded deploys.')
includes('"-WorkerService", $WorkerService', 'Resume script must pass the explicit worker service into guarded deploys.')
includes('"-PublicBase", $PublicBase', 'Resume script must pass the public base into guarded deploys.')
includes('SkipScwRefresh', 'Resume script must support offline verifier state without touching live chain state.')
includes('Test-SecretExists', 'Resume script should check collector secret existence without reading raw secret values.')
includes('secrets", "describe"', 'Resume script should use Secret Manager describe, not secret-value access, for status.')
includes('deploy-mcp-crypto-production.ps1', 'Resume script must reuse the guarded production deploy script.')
includes('resume-payram-scw-after-funding.ps1', 'Resume script must reuse the existing SCW resume helper.')

assert(!script.includes('secrets", "versions", "access"'), 'Resume status must not read raw Secret Manager values.')
assert(!/Write-Host\s+\$.*collector/i.test(script), 'Resume script must not print raw collector variables.')
assert(!/Write-Step\s+\$.*collector/i.test(script), 'Resume script must not print raw collector variables.')

const parser = spawnSync('powershell', [
	'-NoProfile',
	'-Command',
	`$errors=$null;[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath ${JSON.stringify(scriptPath)}),[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`,
], { cwd: process.cwd(), encoding: 'utf8' })
assert.equal(parser.status, 0, `PowerShell parser failed:\nSTDOUT:\n${parser.stdout}\nSTDERR:\n${parser.stderr}`)

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-payram-public-resume-'))
try {
	const fakeGcloud = path.join(tempRoot, 'gcloud.cmd')
	const fakeGcloudJs = path.join(tempRoot, 'fake-gcloud.cjs')
	fs.writeFileSync(fakeGcloud, '@echo off\r\nnode "%~dp0fake-gcloud.cjs" %*\r\n', 'utf8')
	fs.writeFileSync(fakeGcloudJs, `
const args = process.argv.slice(2)
if (args[0] === 'secrets' && args[1] === 'describe') {
	process.exit(process.env.FAKE_COLLECTOR_EXISTS === '1' ? 0 : 1)
}
process.exit(1)
`, 'utf8')

	const scwEvidence = path.join(tempRoot, 'scw.json')
	const phase0Evidence = path.join(tempRoot, 'phase0.json')
	const hostEvidence = path.join(tempRoot, 'host.json')
	const dnsEvidence = path.join(tempRoot, 'dns.json')
	const backupEvidence = path.join(tempRoot, 'backup.json')
	const alarmsEvidence = path.join(tempRoot, 'alarms.json')
	const gasEvidence = path.join(tempRoot, 'gas.json')
	const outputEvidence = path.join(tempRoot, 'resume.json')

	fs.writeFileSync(scwEvidence, JSON.stringify({
		kind: 'payram-scw-resume',
		ok: false,
		state: 'funding_required',
		funded: false,
		settlementCollectorConfigured: false,
		walletLinked: false,
		balanceEth: '0',
	}, null, 2), 'utf8')
	fs.writeFileSync(phase0Evidence, JSON.stringify({ ok: false, code: 'PAYRAM_HTTP_ERROR' }, null, 2), 'utf8')
	fs.writeFileSync(hostEvidence, JSON.stringify({
		kind: 'payram-oci-host-bootstrap',
		ok: true,
		hostBootstrapOk: true,
		checks: { ssh: true, sshSkipped: false },
	}, null, 2), 'utf8')
	fs.writeFileSync(dnsEvidence, JSON.stringify({
		kind: 'payram-dns-https',
		ok: true,
		dryRun: false,
		checks: { dnsResolved: true, httpsHealth: true, tlsValidForHost: true },
	}, null, 2), 'utf8')
	fs.writeFileSync(backupEvidence, JSON.stringify({
		kind: 'payram-oci-backup-restore',
		ok: true,
		dryRun: false,
		hostVerified: false,
		keepDrillFiles: false,
		checks: { cleanupRequested: true },
	}, null, 2), 'utf8')
	fs.writeFileSync(alarmsEvidence, JSON.stringify({
		kind: 'payram-oci-alarms',
		ok: true,
		dryRun: false,
		subscription: { email: true, ownerConfirmedReady: true },
	}, null, 2), 'utf8')
	fs.writeFileSync(gasEvidence, JSON.stringify({
		ok: true,
		wallets: [{ lowBalance: true }, { lowBalance: false }],
	}, null, 2), 'utf8')

	const env = {
		...process.env,
		PATH: `${tempRoot}${path.delimiter}${process.env.PATH || ''}`,
	}
	const first = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-ProjectId',
		'test-project',
		'-SkipScwRefresh',
		'-ScwResumeEvidencePath',
		scwEvidence,
		'-Phase0EvidencePath',
		phase0Evidence,
		'-HostBootstrapEvidencePath',
		hostEvidence,
		'-DnsHttpsEvidencePath',
		dnsEvidence,
		'-BackupRestoreEvidencePath',
		backupEvidence,
		'-OciAlarmsEvidencePath',
		alarmsEvidence,
		'-GasWalletEvidencePath',
		gasEvidence,
		'-EvidencePath',
		outputEvidence,
	], { cwd: process.cwd(), encoding: 'utf8', env, timeout: 120000 })
	assert.equal(first.status, 0, `Resume status failed:\nSTDOUT:\n${first.stdout}\nSTDERR:\n${first.stderr}`)
	assert(first.stdout.includes('Next gate: settlement_collector_required'), 'Missing-collector status should lead with collector setup.')
	const firstEvidence = JSON.parse(fs.readFileSync(outputEvidence, 'utf8'))
	assert.equal(firstEvidence.kind, 'payram-public-enablement-resume')
	assert.equal(firstEvidence.publicEnableReady, false)
	assert.equal(firstEvidence.nextGate, 'settlement_collector_required')
	assert.equal(firstEvidence.checks.collectorSecretPresent, false)
	assert(!JSON.stringify(firstEvidence).includes('0x1111111111111111111111111111111111111111'), 'Resume evidence must not contain raw collector/treasury addresses.')

	fs.writeFileSync(scwEvidence, JSON.stringify({
		kind: 'payram-scw-resume',
		ok: true,
		state: 'deployed_and_linked',
		funded: true,
		settlementCollectorConfigured: true,
		walletLinked: true,
		balanceEth: '0.001',
	}, null, 2), 'utf8')
	fs.writeFileSync(phase0Evidence, JSON.stringify({
		ok: true,
		payram: {
			status: {
				state: 'paid',
				providerStatus: 'FILLED',
				creditable: true,
			},
		},
		manualChecklist: [],
	}, null, 2), 'utf8')
	const second = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-ProjectId',
		'test-project',
		'-SkipScwRefresh',
		'-ScwResumeEvidencePath',
		scwEvidence,
		'-Phase0EvidencePath',
		phase0Evidence,
		'-HostBootstrapEvidencePath',
		hostEvidence,
		'-DnsHttpsEvidencePath',
		dnsEvidence,
		'-BackupRestoreEvidencePath',
		backupEvidence,
		'-OciAlarmsEvidencePath',
		alarmsEvidence,
		'-GasWalletEvidencePath',
		gasEvidence,
		'-EvidencePath',
		outputEvidence,
	], { cwd: process.cwd(), encoding: 'utf8', env: { ...env, FAKE_COLLECTOR_EXISTS: '1' }, timeout: 120000 })
	assert.equal(second.status, 0, `Resume status second gate failed:\nSTDOUT:\n${second.stdout}\nSTDERR:\n${second.stderr}`)
	const secondEvidence = JSON.parse(fs.readFileSync(outputEvidence, 'utf8'))
	assert.equal(secondEvidence.nextGate, 'host_verified_backup_restore_required', 'Host-verified backup proof must remain a public-enable gate after payment prerequisites pass.')
	assert.equal(secondEvidence.checks.phase0.ok, true)
	assert.equal(secondEvidence.checks.backupRestoreOk, false)
} finally {
	fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('PAYRAM PUBLIC ENABLEMENT RESUME: PASS gates=1 redacted=1 parser=1 offline=1')
