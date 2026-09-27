import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'show-payram-public-enablement-checklist.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')

function includes(needle, message) {
	assert(script.includes(needle), message)
}

includes('payram-public-enablement-owner-checklist', 'Checklist script must write a stable evidence kind.')
includes('[switch]$ShowFullPublicAddresses', 'Checklist script must require an explicit flag to print full public funding addresses.')
includes('showFullPublicAddresses', 'Checklist evidence must record whether full public addresses were requested.')
includes('addressRedacted', 'Checklist evidence must include redacted funding addresses.')
includes('addressSha256', 'Checklist evidence must include address hashes for owner cross-checking.')
includes('Base ETH only', 'Checklist must clearly state Base ETH only for gas/deployer funding.')
includes('Do not send USDC', 'Checklist must warn against sending USDC to gas/deployer wallets.')
includes('create-betterpptx-settlement-collector-wallet.ps1', 'Checklist must direct owner to the settlement collector setup script.')
includes('open-payram-oci-bastion-tunnel.ps1', 'Checklist must direct SCW deploy/link through Bastion.')
includes('verify-payram-phase0-live.mjs', 'Checklist must include Phase 0 proof after wallet linkage.')
includes('Text.UTF8Encoding]::new($false)', 'Checklist evidence JSON must be UTF-8 without BOM.')
assert(!script.includes('privateKey'), 'Checklist script must not process private keys directly.')
assert(!script.includes('versions access'), 'Checklist script must not read raw Secret Manager payloads directly.')

const parser = spawnSync('powershell', [
	'-NoProfile',
	'-Command',
	`$errors=$null;[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath ${JSON.stringify(scriptPath)}),[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`,
], { cwd: process.cwd(), encoding: 'utf8' })
assert.equal(parser.status, 0, `PowerShell parser failed:\nSTDOUT:\n${parser.stdout}\nSTDERR:\n${parser.stderr}`)

const rawDeployer = '0x39b072432958109f57be8c807abcdb0b7f15e505'
const rawGas = '0x1111111111111111111111111111111111111111'
const rawRelayer = '0x2222222222222222222222222222222222222222'
const rawCollector = '0x3333333333333333333333333333333333333333'
const rawTreasury = '0x4444444444444444444444444444444444444444'
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-payram-checklist-'))

try {
	const publicEnablePath = path.join(tempRoot, 'public-enable.json')
	const scwPath = path.join(tempRoot, 'scw.json')
	const fundingPath = path.join(tempRoot, 'funding.json')
	const gasPath = path.join(tempRoot, 'gas.json')
	const outPath = path.join(tempRoot, 'checklist.json')
	const outShowPath = path.join(tempRoot, 'checklist-show.json')

	fs.writeFileSync(publicEnablePath, JSON.stringify({
		kind: 'payram-public-enablement-resume',
		publicEnableReady: false,
		nextGate: 'settlement_collector_required',
		checks: {
			collectorSecretPresent: false,
			backupRestoreOk: true,
			dnsHttpsOk: true,
			hostBootstrapOk: true,
			ociAlarmsOk: true,
			scw: {
				funded: false,
				settlementCollectorConfigured: false,
				walletLinked: false,
				balanceEth: '0',
			},
			gasWallets: {
				ok: false,
				lowCount: 2,
				walletCount: 2,
			},
		},
	}), 'utf8')
	fs.writeFileSync(scwPath, JSON.stringify({
		kind: 'payram-scw-resume',
		deployerAddress: rawDeployer,
		balanceEth: '0',
		funded: false,
		settlementCollectorConfigured: false,
		settlementCollectorRedacted: `${rawCollector.slice(0, 6)}...${rawCollector.slice(-4)}`,
		walletLinked: false,
	}), 'utf8')
	fs.writeFileSync(fundingPath, JSON.stringify({ deployerAddress: rawDeployer }), 'utf8')
	fs.writeFileSync(gasPath, JSON.stringify({
		ok: true,
		wallets: [
			{ role: 'betterpptx-x402-gas-relayer', address: rawRelayer, balanceEth: '0', lowBalance: true, fundWith: 'Base ETH only; signs gas' },
			{ role: 'payram-hot-sweep-gas-wallet', address: rawGas, balanceEth: '0', lowBalance: true, fundWith: 'Base ETH only if PayRam sweep requires gas' },
		],
	}), 'utf8')

	const baseArgs = [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		scriptPath,
		'-PublicEnableEvidencePath',
		publicEnablePath,
		'-ScwResumeEvidencePath',
		scwPath,
		'-ScwFundingEvidencePath',
		fundingPath,
		'-GasWalletEvidencePath',
		gasPath,
	]
	const hidden = spawnSync('powershell', [...baseArgs, '-OutputPath', outPath], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 })
	assert.equal(hidden.status, 0, `Checklist default run failed:\nSTDOUT:\n${hidden.stdout}\nSTDERR:\n${hidden.stderr}`)
	for (const forbidden of [rawDeployer, rawGas, rawRelayer, rawCollector, rawTreasury]) {
		assert(!hidden.stdout.toLowerCase().includes(forbidden.toLowerCase()), `Default stdout leaked raw address ${forbidden}`)
		assert(!hidden.stderr.toLowerCase().includes(forbidden.toLowerCase()), `Default stderr leaked raw address ${forbidden}`)
	}
	assert(hidden.stdout.includes('0x39b0...e505'), 'Default stdout should include redacted deployer for owner orientation.')
	assert(hidden.stdout.includes('Base ETH only'), 'Default stdout should warn Base ETH only.')
	const hiddenEvidence = JSON.parse(fs.readFileSync(outPath, 'utf8'))
	assert.equal(hiddenEvidence.kind, 'payram-public-enablement-owner-checklist')
	assert.equal(hiddenEvidence.nextGate, 'settlement_collector_required')
	assert.equal(hiddenEvidence.showFullPublicAddresses, false)
	const hiddenEvidenceText = JSON.stringify(hiddenEvidence).toLowerCase()
	for (const forbidden of [rawDeployer, rawGas, rawRelayer, rawCollector, rawTreasury]) {
		assert(!hiddenEvidenceText.includes(forbidden.toLowerCase()), `Default evidence leaked raw address ${forbidden}`)
	}
	assert(hiddenEvidenceText.includes('addresssha256'), 'Evidence must include address hashes.')
	assert(hiddenEvidence.actions.some(action => action.id === 'settlement_collector' && action.status === 'required'), 'Checklist should mark settlement collector as required.')
	assert(hiddenEvidence.actions.some(action => action.id === 'payram_scw_deployer_funding' && action.status === 'required'), 'Checklist should mark deployer funding as required.')

	const shown = spawnSync('powershell', [...baseArgs, '-OutputPath', outShowPath, '-ShowFullPublicAddresses'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 })
	assert.equal(shown.status, 0, `Checklist show-address run failed:\nSTDOUT:\n${shown.stdout}\nSTDERR:\n${shown.stderr}`)
	assert(shown.stdout.toLowerCase().includes(rawDeployer), 'Explicit show flag should print the public deployer address.')
	assert(shown.stdout.toLowerCase().includes(rawGas), 'Explicit show flag should print public gas wallet addresses.')
	const shownEvidence = JSON.parse(fs.readFileSync(outShowPath, 'utf8'))
	assert.equal(shownEvidence.showFullPublicAddresses, true)
	const shownEvidenceText = JSON.stringify(shownEvidence).toLowerCase()
	for (const forbidden of [rawDeployer, rawGas, rawRelayer, rawCollector, rawTreasury]) {
		assert(!shownEvidenceText.includes(forbidden.toLowerCase()), `Evidence must remain redacted even with show flag: ${forbidden}`)
	}
} finally {
	fs.rmSync(tempRoot, { recursive: true, force: true })
}

console.log('PAYRAM PUBLIC ENABLEMENT CHECKLIST: PASS redacted=1 showFlag=1 parser=1 actions=1')
