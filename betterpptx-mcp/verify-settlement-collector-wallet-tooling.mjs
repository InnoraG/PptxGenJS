import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'create-betterpptx-settlement-collector-wallet.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')

function includes(needle, message) {
	assert(script.includes(needle), message)
}

function decryptCustody(encrypted, passphrase) {
	const kdf = encrypted.encryption.kdf
	const key = crypto.scryptSync(passphrase, Buffer.from(encrypted.encryption.salt, 'base64'), kdf.keyLength, {
		N: kdf.N,
		r: kdf.r,
		p: kdf.p,
		maxmem: 128 * 1024 * 1024,
	})
	const decipher = crypto.createDecipheriv(encrypted.encryption.algorithm, key, Buffer.from(encrypted.encryption.iv, 'base64'))
	decipher.setAAD(Buffer.from(encrypted.encryption.aad, 'utf8'))
	decipher.setAuthTag(Buffer.from(encrypted.encryption.authTag, 'base64'))
	return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()])
}

includes('betterpptx-settlement-collector-evm-address', 'Generator must target the settlement collector address secret.')
includes('betterpptx-treasury-evm-address', 'Generator must compare against the final treasury secret.')
includes('privateKeyToAccount', 'Generator must derive the EVM address from the generated private key.')
includes('viem/accounts', 'Generator must use the repo Web3 account library.')
includes('aes-256-gcm', 'Generator must encrypt local custody with authenticated encryption.')
includes('scrypt', 'Generator must use a password KDF for encrypted custody.')
includes('maxmem: 128 * 1024 * 1024', 'Generator must bound scrypt memory usage.')
includes('Refusing to overwrite existing secret', 'Generator must protect an existing collector secret by default.')
includes('AddNewVersionIfSecretExists', 'Generator must require an explicit rotation flag for existing secrets.')
includes('Generated collector unexpectedly equals final cold treasury', 'Generator must reject collector/treasury equality.')
includes('Raw private key was not printed or uploaded', 'Generator must explicitly state private-key redaction.')
includes('Raw collector address was not printed', 'Generator must explicitly state address redaction.')
includes('DryRunPassphraseForTesting', 'Generator must expose deterministic automation only for dry-run verification.')
includes('-DryRunPassphraseForTesting is allowed only with -DryRun', 'Dry-run test passphrase must be rejected outside dry-run.')

assert(!/Write-Host\s+.*privateKey/i.test(script), 'Generator must not print private-key variables.')
assert(!script.includes('Write-Host $collector'), 'Generator must not print the raw generated collector address.')
assert(!script.includes('Write-Step $collector'), 'Generator must not print the raw generated collector address through Write-Step.')

const parser = spawnSync('powershell', [
	'-NoProfile',
	'-Command',
	`$errors=$null;[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath ${JSON.stringify(scriptPath)}),[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`,
], { cwd: process.cwd(), encoding: 'utf8' })
assert.equal(parser.status, 0, `PowerShell parser failed:\nSTDOUT:\n${parser.stdout}\nSTDERR:\n${parser.stderr}`)

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-collector-wallet-tooling-'))
try {
	const fakeGcloudLog = path.join(tempRoot, 'fake-gcloud-log.jsonl')
	const fakeGcloud = path.join(tempRoot, 'gcloud.cmd')
	const fakeGcloudJs = path.join(tempRoot, 'fake-gcloud.cjs')
	const treasury = '0x1111111111111111111111111111111111111111'
	const passphrase = 'dry-run-passphrase-for-collector-2026'
	const outputDir = path.join(tempRoot, 'custody')
	const evidencePath = path.join(tempRoot, 'evidence.json')
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
if (args[0] === 'secrets' && args[1] === 'describe') {
	const secret = args[2]
	write({ op: 'describe', secret })
	process.exit(process.env.FAKE_COLLECTOR_EXISTS === '1' ? 0 : 1)
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
if (args[0] === 'secrets' && (args[1] === 'create' || args[1] === 'versions')) {
	write({ op: 'unexpected-write' })
	process.exit(1)
}
write({ op: 'unexpected' })
process.exit(1)
`, 'utf8')

	const runEnv = {
		...process.env,
		PATH: `${tempRoot}${path.delimiter}${process.env.PATH || ''}`,
		FAKE_GCLOUD_LOG: fakeGcloudLog,
	}

	const dryRun = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-DryRun',
		'-DryRunPassphraseForTesting',
		passphrase,
		'-ProjectId',
		'test-project',
		'-OutputDir',
		outputDir,
		'-EvidencePath',
		evidencePath,
	], { cwd: process.cwd(), encoding: 'utf8', env: runEnv, timeout: 120000 })
	assert.equal(dryRun.status, 0, `Collector wallet generator dry-run failed:\nSTDOUT:\n${dryRun.stdout}\nSTDERR:\n${dryRun.stderr}`)
	assert(dryRun.stdout.includes('DRY RUN: generated encrypted custody'), 'Dry-run should not upload the collector address.')
	assert(dryRun.stdout.includes('Raw private key was not printed or uploaded'), 'Dry-run should report private-key redaction.')
	assert(dryRun.stdout.includes('Raw collector address was not printed'), 'Dry-run should report address redaction.')

	const files = fs.readdirSync(outputDir)
	const custodyFile = files.find(name => name.endsWith('.encrypted.json'))
	const manifestFile = files.find(name => name.includes('manifest') && name.endsWith('.json'))
	assert(custodyFile, 'Dry-run must write encrypted custody.')
	assert(manifestFile, 'Dry-run must write a redacted custody manifest.')
	const custodyText = fs.readFileSync(path.join(outputDir, custodyFile), 'utf8')
	const manifestText = fs.readFileSync(path.join(outputDir, manifestFile), 'utf8')
	const evidenceText = fs.readFileSync(evidencePath, 'utf8')
	const custody = JSON.parse(custodyText)
	const plaintext = decryptCustody(custody, passphrase)
	const plainCustody = JSON.parse(plaintext.toString('utf8'))

	assert.match(plainCustody.address, /^0x[0-9a-fA-F]{40}$/, 'Decrypted custody must contain the generated EVM address.')
	assert.match(plainCustody.privateKey, /^0x[0-9a-fA-F]{64}$/, 'Decrypted custody must contain the generated private key.')
	assert.notEqual(plainCustody.address.toLowerCase(), treasury.toLowerCase(), 'Generated collector must differ from treasury.')

	for (const [label, text] of [
		['stdout', dryRun.stdout],
		['stderr', dryRun.stderr],
		['encrypted custody cleartext metadata', custodyText],
		['manifest', manifestText],
		['evidence', evidenceText],
	]) {
		assert(!text.includes(plainCustody.privateKey), `${label} must not expose the raw private key.`)
		assert(!text.includes(plainCustody.address), `${label} must not expose the raw collector address.`)
	}

	const evidence = JSON.parse(evidenceText)
	assert.equal(evidence.schema, 'betterpptx.settlement-collector-wallet.evidence.v1')
	assert.equal(evidence.ok, true)
	assert.equal(evidence.dryRun, true)
	assert.equal(evidence.secretUploaded, false)
	assert.equal(evidence.treasuryCompared, true)
	assert.equal(evidence.matchesTreasury, false)
	assert.match(evidence.addressSha256, /^[0-9a-f]{64}$/)
	assert.match(evidence.custodyFileSha256, /^[0-9a-f]{64}$/)
	assert(evidence.addressRedacted.startsWith('0x') && evidence.addressRedacted.includes('...'), 'Evidence must contain only a redacted address.')

	const logText = fs.existsSync(fakeGcloudLog) ? fs.readFileSync(fakeGcloudLog, 'utf8') : ''
	assert(logText.includes('"op":"describe"'), 'Generator should check whether the collector secret already exists.')
	assert(logText.includes('"op":"read-treasury"'), 'Generator should compare against the treasury secret when available.')
	assert(!logText.includes('unexpected-write'), 'Dry-run must not write Secret Manager.')

	const unsafeParam = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-DryRunPassphraseForTesting',
		passphrase,
	], { cwd: process.cwd(), encoding: 'utf8', env: runEnv, timeout: 60000 })
	assert.notEqual(unsafeParam.status, 0, 'Dry-run test passphrase must be rejected outside -DryRun.')
	assert(`${unsafeParam.stdout}\n${unsafeParam.stderr}`.includes('-DryRunPassphraseForTesting is allowed only with -DryRun'), 'Unsafe test-passphrase rejection should be explicit.')

	const existingSecret = spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-DryRun',
		'-DryRunPassphraseForTesting',
		passphrase,
		'-ProjectId',
		'test-project',
		'-OutputDir',
		path.join(tempRoot, 'existing'),
		'-EvidencePath',
		path.join(tempRoot, 'existing-evidence.json'),
	], { cwd: process.cwd(), encoding: 'utf8', env: { ...runEnv, FAKE_COLLECTOR_EXISTS: '1' }, timeout: 60000 })
	assert.notEqual(existingSecret.status, 0, 'Existing collector secret must be protected by default.')
	assert(`${existingSecret.stdout}\n${existingSecret.stderr}`.includes('Refusing to overwrite existing secret'), 'Existing-secret rejection should be explicit.')
} finally {
	fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('SETTLEMENT COLLECTOR WALLET TOOLING: PASS encrypted=1 dryRun=1 redacted=1 treasuryGuard=1 noUpload=1 parser=1')
