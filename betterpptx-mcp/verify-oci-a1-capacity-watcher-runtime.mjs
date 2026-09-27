import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const automationId = 'oci-a1-payram-capacity-watcher'
const automationPath = path.join(resolveCodexHome(), 'automations', automationId, 'automation.toml')
const statePath = path.resolve('outputs', 'oci-a1-capacity-watch', 'state.json')
const wrapperPath = path.resolve('deploy', 'gcp', 'watch-payram-oci-a1-capacity.ps1')
const scheduledTaskRunnerPath = path.resolve('deploy', 'gcp', 'run-payram-oci-a1-capacity-watch-task.ps1')
const runbookPath = path.resolve('deploy', 'gcp', 'payram-oci-always-free-runbook.md')

function resolveCodexHome() {
	if (process.env.CODEX_HOME) return process.env.CODEX_HOME
	if (process.platform === 'win32' && process.env.USERPROFILE) return path.join(process.env.USERPROFILE, '.codex')
	return path.join(os.homedir(), '.codex')
}

function parseTomlScalar(text, key) {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const match = text.match(new RegExp(`^${escaped}\\s*=\\s*(.+)$`, 'm'))
	if (!match) return null
	let value = match[1].trim()
	if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
	return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function assertIncludes(text, needle, message) {
	assert(text.includes(needle), message || `Missing ${needle}`)
}

function assertNoSensitiveMaterial(label, text) {
	const lower = String(text).toLowerCase()
	assert(!/ocid1\.[a-z0-9._-]+/i.test(text), `${label} must not contain raw OCIDs.`)
	assert(!/-----begin [^-]+-----/i.test(text), `${label} must not contain PEM material.`)
	assert(!/\b0x[a-f0-9]{64}\b/i.test(text), `${label} must not contain EVM private-key-shaped material.`)
	assert(!lower.includes('private key:'), `${label} must not print private key material.`)
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForJsonFile(file, { timeoutMs = 8000, intervalMs = 150 } = {}) {
	const deadline = Date.now() + timeoutMs
	let lastError = null
	while (Date.now() < deadline) {
		try {
			if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
		} catch (error) {
			lastError = error
		}
		await delay(intervalMs)
	}
	if (lastError) throw lastError
	throw new Error(`Timed out waiting for JSON file: ${file}`)
}

function runProcess(command, commandArgs, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, commandArgs, {
			cwd: process.cwd(),
			env: process.env,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
			...options,
		})
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', chunk => { stdout += String(chunk) })
		child.stderr.on('data', chunk => { stderr += String(chunk) })
		child.on('error', reject)
		child.on('close', code => resolve({ code, stdout, stderr }))
	})
}

function wrapperArgs(fakeProvisioner, stateFile, lockName, extraArgs = []) {
	return [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		wrapperPath,
		'-ProvisionerPath',
		fakeProvisioner,
		'-StateFile',
		stateFile,
		'-LockName',
		lockName,
		...extraArgs,
	]
}

function runnerArgs(fakeWatcher, logDir, timeoutSeconds = 1) {
	return [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scheduledTaskRunnerPath,
		'-WatcherPath',
		fakeWatcher,
		'-LogDir',
		logDir,
		'-WatcherTimeoutSeconds',
		String(timeoutSeconds),
	]
}

function writeFakeHostVerifier(file, { succeed = true } = {}) {
	fs.writeFileSync(file, [
		'param(',
		'  [string]$IpAddress = "",',
		'  [switch]$SkipSsh,',
		'  [string]$EvidenceFile = "",',
		'  [string]$EvidenceLabel = ""',
		')',
		'if (-not $SkipSsh) { Write-Error "expected SkipSsh"; exit 7 }',
		'if (-not $IpAddress) { Write-Error "missing IpAddress"; exit 8 }',
		succeed ? 'if ($EvidenceFile) { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidenceFile) | Out-Null; Set-Content -LiteralPath $EvidenceFile -Value \'{"ok":true,"httpOnlyOk":true}\' -Encoding utf8 }' : 'Write-Error "not ready yet"; exit 9',
		succeed ? 'Write-Host "[payram-oci-host] PayRam OCI host verification passed."' : '',
		succeed ? 'exit 0' : '',
		'',
	].join('\n'), 'ascii')
}

function uniqueLockName(prefix) {
	return `${process.platform === 'win32' ? 'Global\\' : ''}${prefix}${Date.now()}${process.pid}${Math.random().toString(16).slice(2)}`
}

function isoHoursAgo(hours) {
	return new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString()
}

async function verifyOverlapLock() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-lock-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchLockTest')
		fs.writeFileSync(fakeProvisioner, [
			'Start-Sleep -Seconds 4',
			"Write-Host 'Reserved public IP: 127.0.0.1'",
			"Write-Error 'Out of host capacity'",
			'exit 1',
			'',
		].join('\n'), 'ascii')
		const firstArgs = wrapperArgs(fakeProvisioner, stateFile, lockName)
		const first = spawn('powershell', firstArgs, {
			cwd: process.cwd(),
			env: process.env,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		first.stdout.resume()
		first.stderr.resume()
		const firstDone = new Promise((resolve, reject) => {
			first.on('error', reject)
			first.on('close', code => resolve({ code }))
		})
		const inProgress = await waitForJsonFile(stateFile)
		assert.equal(inProgress.lastStatus, 'in_progress', 'Running watcher attempt must mark state as in_progress before provisioning returns.')
		assert.equal(inProgress.attempts, 1, 'Running watcher attempt must increment attempts exactly once.')
		assert.equal(inProgress.capacityMisses, 0, 'Running watcher attempt must not pre-classify capacity miss before child exits.')
		const second = await runProcess('powershell', firstArgs)
		const firstResult = await firstDone
		const secondText = `${second.stdout}\n${second.stderr}`
		assert.equal(firstResult.code, 0, 'First fake watcher attempt should classify host capacity miss as a normal retryable heartbeat result.')
		assert.equal(second.code, 0, 'Overlapping watcher invocation should skip cleanly with exit 0.')
		assert(secondText.includes('already running'), 'Overlapping watcher invocation must explain that a prior attempt is already running.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.attempts, 1, 'Overlapping watcher invocation must not increment attempt count.')
		assert.equal(state.capacityMisses, 1, 'Only the first fake provisioner miss should be recorded.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifyAttemptTimeout() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-timeout-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const lateMarker = path.join(root, 'late-marker.txt')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchTimeoutTest')
		fs.writeFileSync(fakeProvisioner, [
			"Write-Host 'Reserved public IP: 127.0.0.88'",
			'Start-Sleep -Seconds 30',
			`Set-Content -LiteralPath '${lateMarker.replaceAll("'", "''")}' -Value 'should-not-exist'`,
			"Write-Host 'Instance state: RUNNING'",
			'exit 0',
			'',
		].join('\n'), 'ascii')
		const result = await runProcess('powershell', wrapperArgs(fakeProvisioner, stateFile, lockName, [
			'-ProvisionerTimeoutSeconds',
			'2',
		]))
		assert.equal(result.code, 0, 'Timed-out watcher attempt must exit 0 so the next cadence can retry.')
		assert(`${result.stdout}\n${result.stderr}`.includes('Attempt timeout'), 'Timed-out watcher attempt must explain the retryable timeout.')
		assert(!fs.existsSync(lateMarker), 'Timed-out watcher attempt must stop the child provisioner before late side effects run.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.attempts, 1, 'Timed-out watcher attempt must increment attempts once.')
		assert.equal(state.attemptTimeouts, 1, 'Timed-out watcher attempt must increment attemptTimeouts once.')
		assert.equal(state.capacityMisses, 0, 'Timed-out watcher attempt must not misclassify timeout as capacity miss.')
		assert.equal(state.successes, 0, 'Timed-out watcher attempt must not record success.')
		assert.equal(state.lastStatus, 'attempt_timeout', 'Timed-out watcher attempt must record attempt_timeout status.')
		assert.equal(state.selectedIp, '127.0.0.88', 'Timed-out watcher attempt may preserve already captured selected IP.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifyStaleInProgressRecovery() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-stale-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchStaleTest')
		fs.writeFileSync(fakeProvisioner, [
			"Write-Host 'Reserved public IP: 127.0.0.66'",
			"Write-Error 'Out of host capacity'",
			'exit 1',
			'',
		].join('\n'), 'ascii')
		fs.writeFileSync(stateFile, `${JSON.stringify({
			version: 1,
			startedAt: new Date().toISOString(),
			maxHours: 8,
			attempts: 4,
			capacityMisses: 3,
			attemptTimeouts: 0,
			successes: 0,
			lastAttemptAt: new Date().toISOString(),
			lastStatus: 'in_progress',
			lastMessage: 'OCI A1 capacity watch attempt is in progress.',
			decisionRequired: false,
			decisionRequiredAt: null,
			selectedIp: '127.0.0.55',
			instanceState: '',
		}, null, 2)}\n`, 'utf8')
		const result = await runProcess('powershell', wrapperArgs(fakeProvisioner, stateFile, lockName))
		assert.equal(result.code, 0, 'Stale in-progress recovery should continue into a retryable fake capacity miss.')
		assert(`${result.stdout}\n${result.stderr}`.includes('Previous in-progress attempt'), 'Stale in-progress recovery must explain that the prior state had no active mutex owner.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.attempts, 5, 'Stale in-progress recovery should still run one new bounded attempt.')
		assert.equal(state.attemptTimeouts, 1, 'Stale in-progress recovery must count the prior incomplete attempt as attempt_timeout.')
		assert.equal(state.capacityMisses, 4, 'Stale in-progress recovery should classify the new fake capacity miss.')
		assert.equal(state.lastStatus, 'capacity_miss', 'Stale in-progress recovery should end with the new terminal result.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifyDecisionGate() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-decision-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const marker = path.join(root, 'should-not-run.txt')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchDecisionTest')
		fs.writeFileSync(fakeProvisioner, [
			`Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value 'ran'`,
			"Write-Host 'Reserved public IP: 127.0.0.1'",
			'exit 0',
			'',
		].join('\n'), 'ascii')
		fs.writeFileSync(stateFile, `${JSON.stringify({
			version: 1,
			startedAt: isoHoursAgo(9),
			maxHours: 8,
			attempts: 3,
			capacityMisses: 3,
			successes: 0,
			lastAttemptAt: isoHoursAgo(1),
			lastStatus: 'capacity_miss',
			lastMessage: 'OCI A1 host capacity unavailable.',
			decisionRequired: false,
			decisionRequiredAt: null,
			selectedIp: '127.0.0.1',
			instanceState: '',
		}, null, 2)}\n`, 'utf8')
		const result = await runProcess('powershell', wrapperArgs(fakeProvisioner, stateFile, lockName, ['-MaxHours', '8']))
		assert.equal(result.code, 20, 'Expired watcher state must exit with owner-decision code 20.')
		assert(!fs.existsSync(marker), 'Expired watcher state must not run the provisioner before owner decision.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.decisionRequired, true, 'Expired watcher state must set decisionRequired=true.')
		assert.equal(state.lastStatus, 'decision_required', 'Expired watcher state must record decision_required status.')
		assert.equal(state.attempts, 3, 'Expired watcher state must not increment attempts after decision gate.')
		assert.equal(state.capacityMisses, 3, 'Expired watcher state must preserve prior miss count after decision gate.')
		assert(state.decisionRequiredAt, 'Expired watcher state must record decisionRequiredAt.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifySuccessState() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-success-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchSuccessTest')
		fs.writeFileSync(fakeProvisioner, [
			"Write-Host 'Reserved public IP: 127.0.0.42'",
			"Write-Host 'Instance state: RUNNING'",
			'exit 0',
			'',
		].join('\n'), 'ascii')
		const result = await runProcess('powershell', wrapperArgs(fakeProvisioner, stateFile, lockName))
		assert.equal(result.code, 0, 'Successful watcher attempt must exit 0.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.attempts, 1, 'Successful watcher attempt must increment attempts once.')
		assert.equal(state.successes, 1, 'Successful watcher attempt must increment successes once.')
		assert.equal(state.capacityMisses, 0, 'Successful watcher attempt must not increment capacity misses.')
		assert.equal(state.lastStatus, 'provisioned_or_exists', 'Successful watcher attempt must record provisioned_or_exists.')
		assert.equal(state.selectedIp, '127.0.0.42', 'Successful watcher attempt must record the selected reserved public IP.')
		assert.equal(state.instanceState, 'RUNNING', 'Successful watcher attempt must record the instance state when present.')
		assert.equal(state.decisionRequired, false, 'Successful watcher attempt must not set decisionRequired.')
		assert.equal(state.hostHttpStatus, '', 'Host HTTP verification must remain opt-in for compatibility.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifyHostHttpAfterProvision() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-host-http-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const fakeHostVerifier = path.join(root, 'fake-host-verifier.ps1')
		const hostEvidenceFile = path.join(root, 'host-evidence.json')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchHostHttpTest')
		fs.writeFileSync(fakeProvisioner, [
			"Write-Host 'Reserved public IP: 127.0.0.77'",
			"Write-Host 'Instance state: RUNNING'",
			'exit 0',
			'',
		].join('\n'), 'ascii')
		writeFakeHostVerifier(fakeHostVerifier, { succeed: true })
		const result = await runProcess('powershell', wrapperArgs(fakeProvisioner, stateFile, lockName, [
			'-VerifyHostHttpAfterProvision',
			'-HostVerifierPath',
			fakeHostVerifier,
			'-HostEvidenceFile',
			hostEvidenceFile,
		]))
		assert.equal(result.code, 0, 'Successful watcher attempt with host HTTP verification must exit 0.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.lastStatus, 'provisioned_or_exists', 'Host HTTP verification must not change secured provisioning status.')
		assert.equal(state.hostHttpStatus, 'passed', 'Host HTTP verification should pass when the verifier succeeds.')
		assert(state.hostHttpVerifiedAt, 'Host HTTP verification should record a verification timestamp.')
		assert.equal(state.hostEvidenceFile, hostEvidenceFile, 'Host HTTP verification should record the redacted evidence file path.')
		assert(fs.existsSync(hostEvidenceFile), 'Host HTTP verification should write the configured evidence file.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifyHostHttpTerminalRetry() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-host-http-retry-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const fakeHostVerifier = path.join(root, 'fake-host-verifier.ps1')
		const marker = path.join(root, 'provisioner-should-not-run.txt')
		const hostEvidenceFile = path.join(root, 'host-evidence.json')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchHostHttpRetryTest')
		fs.writeFileSync(fakeProvisioner, [
			`Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value 'ran'`,
			'exit 0',
			'',
		].join('\n'), 'ascii')
		writeFakeHostVerifier(fakeHostVerifier, { succeed: true })
		fs.writeFileSync(stateFile, `${JSON.stringify({
			version: 1,
			startedAt: new Date().toISOString(),
			maxHours: 8,
			attempts: 4,
			capacityMisses: 3,
			successes: 1,
			lastAttemptAt: new Date().toISOString(),
			lastStatus: 'provisioned_or_exists',
			lastMessage: 'OCI A1 PayRam instance exists or was provisioned.',
			decisionRequired: false,
			decisionRequiredAt: null,
			selectedIp: '127.0.0.77',
			instanceState: 'RUNNING',
			hostHttpStatus: 'pending',
			hostHttpVerifiedAt: null,
			hostEvidenceFile: '',
			hostHttpMessage: 'not ready yet',
		}, null, 2)}\n`, 'utf8')
		const result = await runProcess('powershell', wrapperArgs(fakeProvisioner, stateFile, lockName, [
			'-VerifyHostHttpAfterProvision',
			'-HostVerifierPath',
			fakeHostVerifier,
			'-HostEvidenceFile',
			hostEvidenceFile,
		]))
		assert.equal(result.code, 0, 'Terminal secured state should retry host HTTP verification cleanly.')
		assert(!fs.existsSync(marker), 'Terminal secured state must not rerun the provisioner while retrying host HTTP verification.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.attempts, 4, 'Host HTTP retry must not increment provisioning attempts.')
		assert.equal(state.hostHttpStatus, 'passed', 'Host HTTP retry should pass when the verifier later succeeds.')
		assert(fs.existsSync(hostEvidenceFile), 'Host HTTP retry should write the configured evidence file.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifySuccessTerminalSkip() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-success-terminal-test-'))
	try {
		const fakeProvisioner = path.join(root, 'fake-provisioner.ps1')
		const marker = path.join(root, 'should-not-run-after-success.txt')
		const stateFile = path.join(root, 'state.json')
		const lockName = uniqueLockName('BetterPPTXWatchSuccessTerminalTest')
		fs.writeFileSync(fakeProvisioner, [
			`Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value 'ran'`,
			"Write-Host 'Reserved public IP: 127.0.0.99'",
			"Write-Host 'Instance state: RUNNING'",
			'exit 0',
			'',
		].join('\n'), 'ascii')
		fs.writeFileSync(stateFile, `${JSON.stringify({
			version: 1,
			startedAt: new Date().toISOString(),
			maxHours: 8,
			attempts: 7,
			capacityMisses: 6,
			successes: 1,
			lastAttemptAt: new Date().toISOString(),
			lastStatus: 'provisioned_or_exists',
			lastMessage: 'OCI A1 PayRam instance exists or was provisioned.',
			decisionRequired: false,
			decisionRequiredAt: null,
			selectedIp: '127.0.0.42',
			instanceState: 'RUNNING',
		}, null, 2)}\n`, 'utf8')
		const result = await runProcess('powershell', wrapperArgs(fakeProvisioner, stateFile, lockName))
		assert.equal(result.code, 0, 'Previously successful watcher state must exit cleanly.')
		assert(!fs.existsSync(marker), 'Previously successful watcher state must not run the provisioner again.')
		assert(result.stdout.includes('already secured'), 'Previously successful watcher state must explain that provisioning is already secured.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.attempts, 7, 'Previously successful watcher state must not increment attempts.')
		assert.equal(state.capacityMisses, 6, 'Previously successful watcher state must preserve capacity miss count.')
		assert.equal(state.successes, 1, 'Previously successful watcher state must preserve success count.')
		assert.equal(state.lastStatus, 'provisioned_or_exists', 'Previously successful watcher state must remain provisioned_or_exists.')
		assert.equal(state.selectedIp, '127.0.0.42', 'Previously successful watcher state must preserve selected IP.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifyScheduledTaskRunnerTimeout() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-watch-runner-timeout-test-'))
	try {
		const fakeWatcher = path.join(root, 'fake-watcher.ps1')
		const logDir = path.join(root, 'logs')
		const stateFile = path.join(logDir, 'state.json')
		const marker = path.join(root, 'late-marker.txt')
		fs.mkdirSync(logDir, { recursive: true })
		fs.writeFileSync(fakeWatcher, [
			'param(',
			'  [switch]$UseRootCompartment,',
			'  [switch]$VerifyHostHttpAfterProvision,',
			'  [int]$ProvisionerTimeoutMinutes = 0',
			')',
			'Start-Sleep -Seconds 20',
			`Set-Content -LiteralPath ${JSON.stringify(marker)} -Value "late" -Encoding ascii`,
			'exit 0',
			'',
		].join('\n'), 'ascii')
		fs.writeFileSync(stateFile, JSON.stringify({
			version: 1,
			startedAt: new Date().toISOString(),
			maxHours: 8,
			attempts: 1,
			capacityMisses: 0,
			successes: 0,
			attemptTimeouts: 0,
			lastAttemptAt: new Date().toISOString(),
			lastStatus: 'in_progress',
			lastMessage: 'Synthetic scheduled-task runner test in progress.',
			decisionRequired: false,
			decisionRequiredAt: null,
			selectedIp: '127.0.0.88',
			instanceState: 'RESERVED',
			hostHttpStatus: '',
			hostHttpVerifiedAt: null,
			hostEvidenceFile: '',
			hostHttpMessage: '',
		}, null, 2))
		const result = await runProcess('powershell', runnerArgs(fakeWatcher, logDir, 1))
		assert.equal(result.code, 0, `Scheduled-task runner timeout should be retryable exit 0. stdout=${result.stdout} stderr=${result.stderr}`)
		assert(!fs.existsSync(marker), 'Scheduled-task runner must stop the fake watcher process tree before it can write a late marker.')
		const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
		assert.equal(state.lastStatus, 'attempt_timeout', 'Scheduled-task runner timeout must repair in_progress state to attempt_timeout.')
		assert.equal(state.attemptTimeouts, 1, 'Scheduled-task runner timeout must increment attemptTimeouts.')
		assert.equal(state.selectedIp, '127.0.0.88', 'Scheduled-task runner timeout repair must preserve the previously selected reserved IP.')
		assert.equal(state.instanceState, 'RESERVED', 'Scheduled-task runner timeout repair must preserve the previous instance state marker.')
		assert(String(state.lastMessage || '').includes('Scheduled-task runner stopped the watcher'), 'Scheduled-task runner timeout must explain the retryable timeout in state.')
		const logText = fs.readFileSync(path.join(logDir, 'scheduled-task.log'), 'utf8')
		assert(logText.includes('watcher_timeout=1s'), 'Scheduled-task runner log must record the watcher timeout.')
		return true
	} finally {
		fs.rmSync(root, { recursive: true, force: true })
	}
}

async function verifyWindowsScheduledTask({ expectQuietDecisionGate = false } = {}) {
	if (process.platform !== 'win32') return false
	const command = `
$task = Get-ScheduledTask -TaskPath '\\BetterPPTX\\' -TaskName 'PayRamOciA1CapacityWatcher' -ErrorAction Stop
$info = Get-ScheduledTaskInfo -TaskPath '\\BetterPPTX\\' -TaskName 'PayRamOciA1CapacityWatcher' -ErrorAction Stop
$result = [pscustomobject]@{
  state = [string]$task.State
  lastTaskResult = [int]$info.LastTaskResult
  executionTimeLimit = [string]$task.Settings.ExecutionTimeLimit
  actions = @($task.Actions | ForEach-Object { [pscustomobject]@{ execute = [string]$_.Execute; arguments = [string]$_.Arguments; workingDirectory = [string]$_.WorkingDirectory } })
  triggers = @($task.Triggers | ForEach-Object { [pscustomobject]@{ interval = [string]$_.Repetition.Interval } })
}
$result | ConvertTo-Json -Depth 8
`
	const result = await runProcess('powershell', ['-NoProfile', '-Command', command])
	assert.equal(result.code, 0, `Windows Scheduled Task query must succeed. ${result.stderr}`)
	const text = result.stdout.trim()
	assertNoSensitiveMaterial('Windows Scheduled Task metadata', text)
	const data = JSON.parse(text)
	assert(['Ready', 'Running'].includes(data.state), `Windows Scheduled Task must be Ready or Running, got ${data.state}.`)
	if (expectQuietDecisionGate && data.state !== 'Running') {
		assert.equal(data.lastTaskResult, 0, 'Windows Scheduled Task must exit 0 after decisionRequired=true so it does not report repeated scheduler failures.')
	}
	const actions = (Array.isArray(data.actions) ? data.actions : [data.actions]).filter(Boolean)
	const actionText = actions.map(action => [
		action.execute,
		action.arguments,
		action.workingDirectory,
	].join(' ')).join('\n')
	assert(
		actionText.toLowerCase().includes(scheduledTaskRunnerPath.toLowerCase()),
		'Windows Scheduled Task must run the approved BetterPPTX PayRam OCI watcher runner.',
	)
	assert(
		(Array.isArray(data.triggers) ? data.triggers : [data.triggers]).filter(Boolean).some(trigger => trigger.interval === 'PT10M'),
		'Windows Scheduled Task must repeat every 10 minutes.',
	)
	assert.equal(data.executionTimeLimit, 'PT12M', 'Windows Scheduled Task must have a 12-minute outer execution limit.')
	return true
}

const wrapper = fs.readFileSync(wrapperPath, 'utf8')
const scheduledTaskRunner = fs.readFileSync(scheduledTaskRunnerPath, 'utf8')
const runbook = fs.readFileSync(runbookPath, 'utf8')

assertIncludes(wrapper, 'Start-Process -FilePath "powershell"', 'Capacity watcher must execute one provisioner attempt through PowerShell.')
assertIncludes(wrapper, 'ProvisionerTimeoutMinutes = 9', 'Capacity watcher must bound child provisioner attempts below the 10-minute cadence.')
assertIncludes(wrapper, 'Stop-ProcessTree', 'Capacity watcher must stop a timed-out child provisioner process tree.')
assertIncludes(wrapper, 'attempt_timeout', 'Capacity watcher must record retryable child provisioner timeouts.')
assertIncludes(wrapper, '$previousSelectedIp = [string]$state.selectedIp', 'Capacity watcher must preserve the previous reserved IP when a retry times out before printing it.')
assertIncludes(wrapper, 'no active mutex owner', 'Capacity watcher must recover stale in-progress state when the mutex is free.')
assertIncludes(wrapper, 'System.Threading.Mutex', 'Capacity watcher must enforce a local process lock for heartbeat overlap safety.')
assertIncludes(wrapper, 'OCI A1 capacity watch attempt is already running', 'Capacity watcher must skip overlapping heartbeat invocations.')
assertIncludes(wrapper, 'already secured; no further automatic provisioning attempt needed', 'Capacity watcher must treat provisioned state as terminal for heartbeat safety.')
assertIncludes(wrapper, 'decisionRequired', 'Capacity watcher must write an owner-decision gate.')
assertIncludes(wrapper, 'No PAYG/region/shape fallback is automatic', 'Capacity watcher must not silently switch cost/region/shape.')
assertIncludes(wrapper, 'VerifyHostHttpAfterProvision', 'Capacity watcher must support opt-in host HTTP verification after successful provisioning.')
assertIncludes(wrapper, 'verify-payram-oci-host.ps1', 'Capacity watcher must reuse the PayRam OCI host verifier for post-provision HTTP evidence.')
assertIncludes(wrapper, 'hostHttpStatus', 'Capacity watcher state must record post-provision host HTTP readiness.')
assertIncludes(scheduledTaskRunner, 'WatcherTimeoutMinutes = 11', 'Scheduled-task runner must bound the watcher below the 12-minute task cap.')
assertIncludes(scheduledTaskRunner, 'WatcherTimeoutSeconds', 'Scheduled-task runner must expose a test-only timeout override.')
assertIncludes(scheduledTaskRunner, 'Start-Process -FilePath $powerShell', 'Scheduled-task runner must own the watcher child process.')
assertIncludes(scheduledTaskRunner, 'Stop-ProcessTree', 'Scheduled-task runner must stop a stuck watcher process tree.')
assertIncludes(scheduledTaskRunner, 'Mark-WatcherTimeoutState', 'Scheduled-task runner must repair stale in-progress state on watcher timeout.')
assertIncludes(scheduledTaskRunner, 'attempt_timeout', 'Scheduled-task runner must record retryable attempt_timeout state.')
assertIncludes(runbook, 'id: `oci-a1-payram-capacity-watcher`', 'Runbook must document the Codex heartbeat automation id.')
assertIncludes(runbook, 'cadence: every 10 minutes', 'Runbook must document the 10-minute cadence.')
assertIncludes(runbook, 'watch-payram-oci-a1-capacity.ps1 -UseRootCompartment', 'Runbook must document the one-shot wrapper command.')
assertIncludes(runbook, 'register-payram-oci-a1-capacity-task.ps1', 'Runbook must document the local Windows Scheduled Task installer.')
assertIncludes(runbook, 'run-payram-oci-a1-capacity-watch-task.ps1', 'Runbook must document the local Windows Scheduled Task runner.')
assertIncludes(runbook, 'outer task execution limit: 12 minutes', 'Runbook must document the local Windows Scheduled Task outer execution limit.')
assertIncludes(runbook, 'runner watcher timeout: 11 minutes', 'Runbook must document the local Scheduled Task runner watcher timeout.')
assertIncludes(runbook, 'spending path: no automatic PAYG, region, or shape switch', 'Runbook must document the no-auto-spend/no-auto-region-switch policy.')
assertNoSensitiveMaterial('capacity watcher wrapper', wrapper)
assertNoSensitiveMaterial('capacity watcher scheduled-task runner', scheduledTaskRunner)
assertNoSensitiveMaterial('PayRam OCI runbook', runbook)

let automationChecked = false
if (fs.existsSync(automationPath)) {
	automationChecked = true
	const automation = fs.readFileSync(automationPath, 'utf8')
	assert.equal(parseTomlScalar(automation, 'id'), automationId, 'Automation id must match the PayRam capacity watcher.')
	assert.equal(parseTomlScalar(automation, 'kind'), 'heartbeat', 'Capacity watcher automation must be a heartbeat attached to this work thread.')
	assert.equal(parseTomlScalar(automation, 'status'), 'ACTIVE', 'Capacity watcher automation must be active.')
	assert.equal(parseTomlScalar(automation, 'rrule'), 'FREQ=MINUTELY;INTERVAL=10', 'Capacity watcher cadence must be every 10 minutes.')
	const prompt = parseTomlScalar(automation, 'prompt') || ''
	assertIncludes(prompt, 'watch-payram-oci-a1-capacity.ps1 -UseRootCompartment', 'Automation must run the stateful one-shot watcher wrapper.')
	assertIncludes(prompt, '-VerifyHostHttpAfterProvision', 'Automation must request post-provision host HTTP verification.')
	assertIncludes(prompt, 'VM.Standard.A1.Flex', 'Automation must target the approved A1 shape.')
	assertIncludes(prompt, '4 OCPU', 'Automation must target the approved OCPU count.')
	assertIncludes(prompt, '24 GB RAM', 'Automation must target the approved memory size.')
	assertIncludes(prompt, 'no automatic PAYG, region, or shape fallback', 'Automation must forbid automatic PAYG/region/shape fallback.')
	assertIncludes(prompt, '9-minute child provisioner timeout', 'Automation must preserve the bounded child provisioner timeout policy.')
	assertIncludes(prompt, 'attempt_timeout', 'Automation must instruct stale/timed-out child attempts to be recorded as retryable attempt_timeout.')
	assertIncludes(prompt, 'outputs\\oci-a1-capacity-watch\\state.json', 'Automation must persist state in the approved ignored output path.')
	assertIncludes(prompt, 'decisionRequired=true', 'Automation must recognize the 8-hour owner decision gate.')
	assertIncludes(prompt, 'Do not print secrets', 'Automation must carry the no-secret-output instruction.')
	assertNoSensitiveMaterial('capacity watcher automation', automation)
}

let stateChecked = false
let stateStatus = 'absent'
let attempts = null
let capacityMisses = null
let decisionRequired = null
if (fs.existsSync(statePath)) {
	stateChecked = true
	const bytes = fs.readFileSync(statePath)
	assert(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), 'Capacity watcher state JSON must be UTF-8 without BOM.')
	const text = bytes.toString('utf8')
	assertNoSensitiveMaterial('capacity watcher state', text)
	const state = JSON.parse(text)
	assert.equal(state.version, 1, 'Capacity watcher state version must be stable.')
	assert.equal(state.maxHours, 8, 'Capacity watcher state must retain the 8-hour decision window.')
	assert(Number.isInteger(state.attempts) && state.attempts >= 0, 'Capacity watcher attempts must be a non-negative integer.')
	assert(Number.isInteger(state.capacityMisses) && state.capacityMisses >= 0, 'Capacity watcher capacity misses must be a non-negative integer.')
	assert(Number.isInteger(state.successes) && state.successes >= 0, 'Capacity watcher successes must be a non-negative integer.')
	assert(state.capacityMisses <= state.attempts, 'Capacity misses cannot exceed attempts.')
	assert(['initialized', 'in_progress', 'attempt_timeout', 'capacity_miss', 'decision_required', 'provisioned_or_exists', 'failed'].includes(state.lastStatus), `Unexpected watcher status: ${state.lastStatus}`)
	assert(typeof state.decisionRequired === 'boolean', 'decisionRequired must be boolean.')
	if (state.decisionRequired) {
		assert.equal(state.lastStatus, 'decision_required', 'decisionRequired state must use decision_required status.')
		assert(state.decisionRequiredAt, 'decisionRequired state must record decisionRequiredAt.')
	}
	if (state.selectedIp) assert(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(state.selectedIp), 'Selected IP must be a redacted-safe IPv4 address.')
	if (state.hostHttpStatus) assert(['pending', 'passed'].includes(state.hostHttpStatus), `Unexpected host HTTP status: ${state.hostHttpStatus}`)
	if (state.lastStatus === 'attempt_timeout') {
		assert(Number.isInteger(state.attemptTimeouts) && state.attemptTimeouts > 0, 'attempt_timeout state must record attemptTimeouts.')
	}
	stateStatus = state.lastStatus
	attempts = state.attempts
	capacityMisses = state.capacityMisses
	decisionRequired = state.decisionRequired
}

const overlapLock = await verifyOverlapLock()
const attemptTimeout = await verifyAttemptTimeout()
const staleInProgress = await verifyStaleInProgressRecovery()
const decisionGate = await verifyDecisionGate()
const successState = await verifySuccessState()
const hostHttpAfterProvision = await verifyHostHttpAfterProvision()
const hostHttpTerminalRetry = await verifyHostHttpTerminalRetry()
const successTerminal = await verifySuccessTerminalSkip()
const scheduledTaskRunnerTimeout = await verifyScheduledTaskRunnerTimeout()
const windowsTask = await verifyWindowsScheduledTask({ expectQuietDecisionGate: decisionRequired === true })

console.log(`OCI A1 CAPACITY WATCHER RUNTIME: PASS automation=${automationChecked ? 1 : 0} windowsTask=${windowsTask ? 1 : 0} state=${stateChecked ? 1 : 0} status=${stateStatus} attempts=${attempts ?? 'na'} capacityMisses=${capacityMisses ?? 'na'} decisionRequired=${decisionRequired ?? 'na'} overlapLock=${overlapLock ? 1 : 0} attemptTimeout=${attemptTimeout ? 1 : 0} staleInProgress=${staleInProgress ? 1 : 0} decisionGate=${decisionGate ? 1 : 0} successState=${successState ? 1 : 0} hostHttpAfterProvision=${hostHttpAfterProvision ? 1 : 0} hostHttpTerminalRetry=${hostHttpTerminalRetry ? 1 : 0} successTerminal=${successTerminal ? 1 : 0} scheduledTaskRunnerTimeout=${scheduledTaskRunnerTimeout ? 1 : 0}`)
