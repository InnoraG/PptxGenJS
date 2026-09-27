import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'show-betterpptx-gas-wallet-status.ps1')
const script = fs.readFileSync(scriptPath, 'utf8')

function includes(needle, message) {
	assert(script.includes(needle), message)
}

includes('betterpptx-x402-gas-relayer-key', 'Gas status tooling must inspect the x402 gas relayer secret.')
includes('betterpptx-payram-hot-wallet-private-key', 'Gas status tooling must inspect the PayRam hot/sweep gas secret.')
includes('betterpptx-forwarder-sweeper-key', 'Gas status tooling must inspect the CREATE2 forwarder sweeper gas secret.')
includes('betterpptx-base-rpc-url', 'Gas status tooling must use the configured Base RPC secret for balances.')
includes('SecretCommandTimeoutSeconds = 45', 'Gas status tooling must bound Secret Manager/native calls by default.')
includes('RpcTimeoutSeconds = 8', 'Gas status tooling must bound Base RPC calls by default.')
includes('Invoke-NativeCapture', 'Gas status tooling must run gcloud through a bounded native-process wrapper.')
includes('Resolve-Gcloud', 'Gas status tooling must resolve the Cloud SDK command deliberately.')
includes('Get-Command gcloud.cmd', 'Gas status tooling should prefer the executable gcloud.cmd shim on Windows.')
includes('Required Secret Manager secret', 'Gas status tooling must fail closed when a required secret is unavailable.')
includes('Optional Secret Manager secret', 'Gas status tooling must keep optional gas/RPC checks warning-only.')
includes('Resolve-PowerShell', 'Gas status tooling must be able to execute gcloud.ps1 through PowerShell on Windows.')
includes('GetExtension($FilePath).ToLowerInvariant() -eq ".ps1"', 'Gas status tooling must detect PowerShell script command shims.')
includes('timed out after ${TimeoutSeconds}s', 'Gas status tooling must fail fast on stalled native calls.')
includes('AbortController', 'Gas status tooling must abort stalled Base RPC fetches.')
includes('privateKeyToAccount', 'Gas status tooling must derive public addresses from private keys locally.')
includes('eth_getBalance', 'Gas status tooling must check native Base ETH balances.')
includes('fs.readFileSync(0', 'Gas status tooling must pass secret-bearing payload through stdin, not argv.')
includes('$payload | & node $nodeScriptPath', 'Gas status tooling must feed the secret-bearing payload to node through stdin.')
includes('Remove-Item -LiteralPath $nodeScriptPath', 'Gas status tooling must clean up the temporary non-secret helper script.')
includes('Secret-bearing derivation payload was serialized unexpectedly', 'Gas status tooling must guard against private-key serialization.')
includes('RPC URL was serialized unexpectedly', 'Gas status tooling must guard against RPC URL serialization.')
includes('Address-only status written to', 'Gas status tooling must write an address-only operator artifact.')
includes('Fund only with Base ETH', 'Gas status tooling must warn against sending USDC/revenue to gas wallets.')

assert(!/Write-Host\s+.*privateKey/i.test(script), 'Gas status tooling must not print private keys.')
assert(!/Format-Table\s+.*privateKey/i.test(script), 'Gas status tooling must not table private keys.')
assert(!/Select-Object\s+.*privateKey/i.test(script), 'Gas status tooling must not select private keys for output.')
assert(!/node\s+-e/i.test(script), 'Gas status tooling should avoid inline node quoting and use a temp helper script.')
assert(!/node\s+\$nodeScriptPath\s+.*private/i.test(script), 'Gas status tooling must not pass private keys on the node argv.')

const parser = spawnSync('powershell', [
	'-NoProfile',
	'-Command',
	`$errors=$null;[System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath ${JSON.stringify(scriptPath)}),[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}`,
], { cwd: process.cwd(), encoding: 'utf8' })

assert.equal(parser.status, 0, `PowerShell parser failed:\nSTDOUT:\n${parser.stdout}\nSTDERR:\n${parser.stderr}`)

console.log('GAS WALLET STATUS TOOLING: PASS secrets=3 balances=1 stdin=1 redacted=1 parser=1')
