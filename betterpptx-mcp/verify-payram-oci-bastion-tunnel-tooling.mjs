import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'open-payram-oci-bastion-tunnel.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')

function includes(needle, message) {
	assert(script.includes(needle), message)
}

includes('payram-oci-bastion-tunnel', 'Bastion helper must write a stable evidence kind.')
includes('[switch]$UseRootCompartment', 'Bastion helper must support the active root-compartment deployment.')
includes('[string]$BastionId = ""', 'Bastion helper must support explicit Bastion OCID override when OCI list APIs are slow.')
includes('[string]$InstanceId = ""', 'Bastion helper must support explicit instance OCID override when OCI list APIs are slow.')
includes('[string]$TargetPrivateIp = ""', 'Bastion helper must support explicit target private IP override when OCI VNIC discovery is slow.')
includes('Assert-OcidOrEmpty $BastionId', 'Bastion helper must validate explicit Bastion OCID overrides.')
includes('Assert-OcidOrEmpty $InstanceId', 'Bastion helper must validate explicit instance OCID overrides.')
includes('Assert-IPv4OrEmpty $TargetPrivateIp', 'Bastion helper must validate explicit private IP overrides.')
includes('[string]$OciPath = ""', 'Bastion helper must support explicit OCI CLI override for verification.')
includes('[int]$OciTimeoutSeconds = 240', 'Bastion helper must expose bounded OCI timeouts.')
includes('RedirectStandardOutput $stdoutPath', 'Bastion helper must capture native stdout through files to avoid pipe deadlocks on large OCI JSON.')
includes('RedirectStandardError $stderrPath', 'Bastion helper must capture native stderr through files to avoid pipe deadlocks on large OCI JSON.')
includes('Remove-Item -LiteralPath $stdoutPath, $stderrPath', 'Bastion helper must clean native capture temp files.')
includes('[switch]$StartTunnel', 'Bastion helper must require an explicit switch before opening a local tunnel.')
includes('[switch]$DeleteSessionOnExit', 'Bastion helper must support cleanup of short-lived sessions.')
includes('[switch]$RunPublicEnableResume', 'Bastion helper must support running the PayRam resume flow through a short-lived tunnel.')
includes('[string[]]$PublicEnableResumeArgs = @()', 'Bastion helper must allow explicit resume arguments to be forwarded.')
includes('$DeleteSessionOnExit = $true', 'Bastion helper must force cleanup when running the resume flow through the tunnel.')
includes('resume-payram-public-enablement.ps1', 'Bastion helper must reuse the public-enablement resume script.')
includes('publicEnableResumeRan', 'Bastion evidence must record whether the resume flow ran.')
includes('publicEnableResumeExitCode', 'Bastion evidence must record the resume flow exit code.')
includes('session", "create-port-forwarding"', 'Bastion helper must create a port-forwarding session.')
includes('session", "delete"', 'Bastion helper must delete sessions when requested.')
includes('raw-request', 'Bastion helper must use raw OCI API for compute/VNIC paths that can hang in high-level CLI mode.')
includes('/20160918/instances?compartmentId=', 'Bastion helper must discover the PayRam instance through raw OCI API.')
includes('/20160918/vnicAttachments?compartmentId=', 'Bastion helper must discover the PayRam VNIC attachment through raw OCI API.')
includes('/20160918/vnics/', 'Bastion helper must fetch the PayRam private IP through raw OCI API.')
includes('Assert-LocalPortFree', 'Bastion helper must refuse to start over an occupied local port.')
includes('ExitOnForwardFailure=yes', 'Bastion tunnel must fail fast if local forwarding cannot be opened.')
includes('ConnectionAttempts=2', 'Bastion SSH verification must tolerate transient session warm-up.')
includes('TimeoutSeconds 90', 'Bastion SSH verification must not use the earlier too-tight 30 second timeout.')
includes('StrictHostKeyChecking=accept-new', 'Bastion helper must avoid interactive SSH prompts.')
includes('ocid1\\.[A-Za-z0-9._-]+', 'Bastion helper must redact OCIDs from captured errors.')
includes('targetPrivateIpHash', 'Bastion evidence must hash private IPs instead of storing them raw.')
includes('sessionHash', 'Bastion evidence must hash session ids instead of storing them raw.')
includes('sessionEndpointHash', 'Bastion evidence must hash Bastion SSH endpoints instead of storing them raw.')
includes('tunnelExitCode', 'Bastion evidence must record SSH tunnel exit state when a tunnel is requested.')
includes('tunnelDiagnosticHash', 'Bastion evidence must record only a redacted diagnostic hash for tunnel failures.')
includes('Text.UTF8Encoding]::new($false)', 'Bastion evidence JSON must be UTF-8 without BOM.')

assert(!script.includes('0.0.0.0/0'), 'Bastion helper must not suggest public SSH exposure.')
assert(!/Write-Host\s+\$sessionId/i.test(script), 'Bastion helper must not print raw session ids.')
assert(!/Write-Step\s+\$sessionId/i.test(script), 'Bastion helper must not print raw session ids.')
assert(!/Write-Host\s+\$privateIp/i.test(script), 'Bastion helper must not print raw private IPs.')
assert(!/Write-Step\s+\$privateIp/i.test(script), 'Bastion helper must not print raw private IPs.')

const parser = spawnSync('powershell', [
	'-NoProfile',
	'-Command',
	`$errors=$null;[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath ${JSON.stringify(scriptPath)}),[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`,
], { cwd: process.cwd(), encoding: 'utf8' })
assert.equal(parser.status, 0, `PowerShell parser failed:\nSTDOUT:\n${parser.stdout}\nSTDERR:\n${parser.stderr}`)

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-bastion-tooling-'))
try {
	const fakeHome = path.join(tempRoot, 'home')
	const fakeOci = path.join(tempRoot, 'oci.cmd')
	const fakeOciJs = path.join(tempRoot, 'fake-oci.cjs')
	const fakePubKey = path.join(tempRoot, 'id_ed25519.pub')
	const evidence = path.join(tempRoot, 'bastion-evidence.json')
	const log = path.join(tempRoot, 'oci-log.jsonl')
	fs.mkdirSync(path.join(fakeHome, '.oci'), { recursive: true })
	fs.writeFileSync(path.join(fakeHome, '.oci', 'config'), '[DEFAULT]\ntenancy=ocid1.tenancy.oc1..aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', 'utf8')
	fs.writeFileSync(fakePubKey, 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForBastionVerifier betterpptx\n', 'utf8')
	fs.writeFileSync(fakeOci, '@echo off\r\nnode "%~dp0fake-oci.cjs" %*\r\n', 'utf8')
fs.writeFileSync(fakeOciJs, `
const fs = require('node:fs')
const args = process.argv.slice(2)
const joined = args.join(' ')
if (process.env.FAKE_OCI_LOG) fs.appendFileSync(process.env.FAKE_OCI_LOG, JSON.stringify({ args }) + '\\n')
function out(data) { process.stdout.write(JSON.stringify({ data }) + '\\n') }
if (joined.includes('bastion bastion list')) {
	out([{ id: 'ocid1.bastion.oc1.ap-tokyo-1.examplebastion', name: 'betterpptx-payram-bastion', lifecycleState: 'ACTIVE', timeCreated: '2026-06-19T00:00:00Z' }])
	process.exit(0)
}
if (joined.includes('raw-request') && joined.includes('/20160918/instances?')) {
	out([{ id: 'ocid1.instance.oc1.ap-tokyo-1.exampleinstance', displayName: 'betterpptx-payram-oci-01', lifecycleState: 'RUNNING', timeCreated: '2026-06-19T00:00:00Z' }])
	process.exit(0)
}
if (joined.includes('raw-request') && joined.includes('/20160918/vnicAttachments?')) {
	out([{ vnicId: 'ocid1.vnic.oc1.ap-tokyo-1.examplevnic' }])
	process.exit(0)
}
if (joined.includes('raw-request') && joined.includes('/20160918/vnics/')) {
	out({ id: 'ocid1.vnic.oc1.ap-tokyo-1.examplevnic', privateIp: '10.0.0.7' })
	process.exit(0)
}
if (joined.includes('bastion session create-port-forwarding')) {
	out({ id: 'ocid1.bastionsession.oc1.ap-tokyo-1.examplesession', lifecycleState: 'CREATING' })
	process.exit(0)
}
if (joined.includes('bastion session get')) {
	out({
		id: 'ocid1.bastionsession.oc1.ap-tokyo-1.examplesession',
		lifecycleState: 'ACTIVE',
		sshMetadata: {
			command: 'ssh -i <privateKey> -N -L <localPort>:10.0.0.7:22 -p 22 ocid1.bastionsession.oc1.ap-tokyo-1.examplesession@host.bastion.ap-tokyo-1.oci.oraclecloud.com'
		}
	})
	process.exit(0)
}
if (joined.includes('bastion session delete')) {
	out({ lifecycleState: 'DELETED' })
	process.exit(0)
}
process.stderr.write('unexpected fake oci args: ' + args.join(' ') + '\\n')
process.exit(1)
`, 'utf8')

	const env = {
		...process.env,
		USERPROFILE: fakeHome,
		FAKE_OCI_LOG: log,
	}
	const run = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-UseRootCompartment',
		'-OciPath',
		fakeOci,
		'-SshPublicKeyPath',
		fakePubKey,
		'-DeleteSessionOnExit',
		'-EvidencePath',
		evidence,
	], { cwd: process.cwd(), encoding: 'utf8', env, timeout: 120000 })
	assert.equal(run.status, 0, `Fake Bastion helper run failed:\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`)
	assert(!run.stdout.includes('ocid1.bastionsession.oc1.ap-tokyo-1.examplesession'), 'stdout must not contain raw session OCID.')
	assert(!run.stdout.includes('10.0.0.7'), 'stdout must not contain raw private IP.')
	const data = JSON.parse(fs.readFileSync(evidence, 'utf8'))
	assert.equal(data.kind, 'payram-oci-bastion-tunnel')
	assert.equal(data.ok, true)
	assert.equal(data.dryRun, false)
	assert.equal(data.sessionState, 'ACTIVE')
	assert.equal(data.deleted, true)
	assert.equal(data.tunnelStarted, false)
	assert.equal(data.targetPort, 22)
	assert.match(data.sessionHash, /^[0-9a-f]{12}$/)
	assert.match(data.targetPrivateIpHash, /^[0-9a-f]{12}$/)
	assert.match(data.sessionEndpointHash, /^[0-9a-f]{12}$/)
	const evidenceText = JSON.stringify(data)
	for (const forbidden of [
		'ocid1.bastionsession.oc1.ap-tokyo-1.examplesession',
		'ocid1.bastion.oc1.ap-tokyo-1.examplebastion',
		'ocid1.instance.oc1.ap-tokyo-1.exampleinstance',
		'10.0.0.7',
		'host.bastion.ap-tokyo-1.oci.oraclecloud.com',
	]) {
		assert(!evidenceText.includes(forbidden), `Evidence must not contain raw sensitive routing value: ${forbidden}`)
	}
	const logText = fs.readFileSync(log, 'utf8')
	assert(logText.includes('create-port-forwarding'), 'Fake OCI log should prove session creation was requested.')
	assert(logText.includes('"delete"'), 'Fake OCI log should prove session deletion was requested.')

	const dryEvidence = path.join(tempRoot, 'dry-evidence.json')
	const dry = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-OciPath',
		fakeOci,
		'-SshPublicKeyPath',
		fakePubKey,
		'-DryRun',
		'-EvidencePath',
		dryEvidence,
	], { cwd: process.cwd(), encoding: 'utf8', env, timeout: 120000 })
	assert.equal(dry.status, 0, `Bastion helper dry-run failed:\nSTDOUT:\n${dry.stdout}\nSTDERR:\n${dry.stderr}`)
	const dryData = JSON.parse(fs.readFileSync(dryEvidence, 'utf8'))
	assert.equal(dryData.dryRun, true)
	assert.equal(dryData.ok, true)
	assert.equal(dryData.deleted, false)
} finally {
	fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('PAYRAM OCI BASTION TUNNEL TOOLING: PASS create=1 delete=1 dryRun=1 redacted=1 parser=1')
