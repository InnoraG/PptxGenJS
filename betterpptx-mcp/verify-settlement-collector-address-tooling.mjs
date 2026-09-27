import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'set-betterpptx-settlement-collector-address.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')

function includes(needle, message) {
	assert(script.includes(needle), message)
}

includes('betterpptx-settlement-collector-evm-address', 'Collector setter must target the settlement collector secret.')
includes('betterpptx-treasury-evm-address', 'Collector setter must compare against the final treasury secret.')
includes('Settlement collector must differ from final cold treasury', 'Collector setter must reject treasury reuse.')
includes('Resolve-Gcloud', 'Collector setter must resolve gcloud deliberately.')
includes('Get-Command gcloud.cmd', 'Collector setter should prefer gcloud.cmd on Windows.')
includes('Invoke-NativeCapture', 'Collector setter must bound native Secret Manager calls.')
includes('SecretCommandTimeoutSeconds = 45', 'Collector setter must bound Secret Manager calls by default.')
includes('Write-SecretValue', 'Collector setter must write through a temp file rather than printing the raw address.')
includes('Text.UTF8Encoding]::new($false)', 'Collector setter must write temp/evidence files as UTF-8 without BOM.')
includes('Raw collector address was not printed', 'Collector setter must explicitly state redaction behavior.')
includes('addressSha256', 'Collector evidence must store a hash for traceability.')
includes('addressRedacted', 'Collector evidence must store only a redacted address.')
includes('Raw collector address is stored only in Secret Manager', 'Collector evidence must state that raw address is not copied.')
includes('Secret already exists', 'Collector setter must protect existing secrets by default.')
includes('AddNewVersionIfSecretExists', 'Collector setter must require explicit rotation for existing secrets.')

assert(!/Write-Host\s+.*SettlementCollectorAddress/i.test(script), 'Collector setter must not print the raw input variable.')
assert(!script.includes('Write-Host $collector'), 'Collector setter must not directly print the raw normalized collector.')
assert(!script.includes('Write-Host "$collector'), 'Collector setter must not directly interpolate the raw normalized collector.')
assert(!script.includes("Write-Host '$collector"), 'Collector setter must not directly quote the raw normalized collector.')

const parser = spawnSync('powershell', [
	'-NoProfile',
	'-Command',
	`$errors=$null;[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath ${JSON.stringify(scriptPath)}),[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`,
], { cwd: process.cwd(), encoding: 'utf8' })
assert.equal(parser.status, 0, `PowerShell parser failed:\nSTDOUT:\n${parser.stdout}\nSTDERR:\n${parser.stderr}`)

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-collector-tooling-'))
try {
	const fakeGcloudLog = path.join(tempRoot, 'fake-gcloud-log.jsonl')
	const fakeGcloud = path.join(tempRoot, 'gcloud.cmd')
	const fakeGcloudJs = path.join(tempRoot, 'fake-gcloud.cjs')
	const treasury = '0x1111111111111111111111111111111111111111'
	const collector = '0x2222222222222222222222222222222222222222'
	const evidencePath = path.join(tempRoot, 'collector-evidence.json')
	fs.writeFileSync(fakeGcloud, '@echo off\r\nnode "%~dp0fake-gcloud.cjs" %*\r\n', 'utf8')
	fs.writeFileSync(fakeGcloudJs, `
const fs = require('node:fs')
const args = process.argv.slice(2)
const log = process.env.FAKE_GCLOUD_LOG
function write(entry) { if (log) fs.appendFileSync(log, JSON.stringify({ args, ...entry }) + '\\n') }
function valueAfter(prefix) {
	const found = args.find(arg => String(arg).startsWith(prefix + '='))
	if (found) return found.slice(prefix.length + 1)
	const index = args.indexOf(prefix)
	return index >= 0 ? args[index + 1] : ''
}
if (args[0] === 'secrets' && args[1] === 'versions' && args[2] === 'access') {
	const secret = valueAfter('--secret')
	if (secret === 'betterpptx-treasury-evm-address') {
		write({ op: 'read-treasury' })
		process.stdout.write('${treasury}\\n')
		process.exit(0)
	}
	write({ op: 'read-missing', secret })
	process.exit(1)
}
if (args[0] === 'secrets' && args[1] === 'describe') {
	write({ op: 'describe', secret: args[2] })
	process.exit(1)
}
if (args[0] === 'secrets' && args[1] === 'create') {
	const file = valueAfter('--data-file')
	write({ op: 'create', secret: args[2], dataFileSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex') })
	process.stdout.write('created\\n')
	process.exit(0)
}
write({ op: 'unexpected' })
process.exit(1)
`, 'utf8')

	const runEnv = {
		...process.env,
		PATH: `${tempRoot}${path.delimiter}${process.env.PATH || ''}`,
		FAKE_GCLOUD_LOG: fakeGcloudLog,
	}

	const ok = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-ProjectId',
		'test-project',
		'-SettlementCollectorAddress',
		collector,
		'-EvidencePath',
		evidencePath,
	], { cwd: process.cwd(), encoding: 'utf8', env: runEnv, timeout: 60000 })
	assert.equal(ok.status, 0, `Collector setter fake Secret Manager run failed:\nSTDOUT:\n${ok.stdout}\nSTDERR:\n${ok.stderr}`)
	assert(!ok.stdout.includes(collector), 'Collector setter stdout must not print the raw collector address.')
	assert(!ok.stdout.includes(treasury), 'Collector setter stdout must not print the raw treasury address.')
	assert(ok.stdout.includes('Settlement collector address stored in Secret Manager secret'), 'Collector setter should report successful secret storage.')
	assert(ok.stdout.includes('Raw collector address was not printed'), 'Collector setter should report redaction.')
	const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
	assert.equal(evidence.schema, 'betterpptx.settlement-collector-address.v1')
	assert.equal(evidence.ok, true)
	assert.equal(evidence.dryRun, false)
	assert.equal(evidence.secretUploaded, true)
	assert.equal(evidence.treasuryCompared, true)
	assert.equal(evidence.matchesTreasury, false)
	assert.match(evidence.addressSha256, /^[0-9a-f]{64}$/)
	assert.match(evidence.treasuryAddressSha256, /^[0-9a-f]{64}$/)
	const evidenceText = JSON.stringify(evidence)
	assert(!evidenceText.includes(collector), 'Collector evidence must not contain the raw collector address.')
	assert(!evidenceText.includes(treasury), 'Collector evidence must not contain the raw treasury address.')
	assert(evidence.addressRedacted.startsWith('0x2222') && evidence.addressRedacted.endsWith('2222'), 'Collector evidence should include only a redacted address.')
	const logText = fs.readFileSync(fakeGcloudLog, 'utf8')
	assert(logText.includes('"op":"create"'), 'Collector setter should create the Secret Manager secret in the happy path.')

	const same = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-ProjectId',
		'test-project',
		'-SettlementCollectorAddress',
		treasury,
		'-EvidencePath',
		path.join(tempRoot, 'same-evidence.json'),
		'-DryRun',
	], { cwd: process.cwd(), encoding: 'utf8', env: runEnv, timeout: 60000 })
	assert.notEqual(same.status, 0, 'Collector setter must reject a collector address equal to the final treasury.')
	assert(`${same.stdout}\n${same.stderr}`.includes('Settlement collector must differ from final cold treasury'), 'Collector setter should explain treasury-match rejection.')
	assert(!same.stdout.includes(treasury), 'Collector treasury-match rejection must not print the raw address on stdout.')
} finally {
	fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('SETTLEMENT COLLECTOR ADDRESS TOOLING: PASS secret=1 treasuryGuard=1 redacted=1 evidence=1 parser=1')
