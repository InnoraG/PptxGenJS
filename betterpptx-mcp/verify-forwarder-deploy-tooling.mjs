import assert from 'node:assert/strict'
import * as childProcess from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const scriptPath = path.resolve('deploy', 'gcp', 'deploy-betterpptx-forwarder-factory.mjs')
const script = fs.readFileSync(scriptPath, 'utf8')
const proofScriptPath = path.resolve('deploy', 'gcp', 'run-betterpptx-forwarder-proof.mjs')
const proofScript = fs.readFileSync(proofScriptPath, 'utf8')
const proofBundleScriptPath = path.resolve('deploy', 'gcp', 'create-betterpptx-forwarder-proof-evidence.ps1')
const proofBundleScript = fs.readFileSync(proofBundleScriptPath, 'utf8')
const secretScriptPath = path.resolve('deploy', 'gcp', 'create-betterpptx-forwarder-secrets.ps1')
const secretScript = fs.readFileSync(secretScriptPath, 'utf8')
const reviewScriptPath = path.resolve('deploy', 'gcp', 'create-betterpptx-forwarder-review-evidence.ps1')
const reviewScript = fs.readFileSync(reviewScriptPath, 'utf8')

function includes(text, needle, message) {
	assert(text.includes(needle), message || `Missing ${needle}`)
}

function assertUtf8NoBom(filePath, message) {
	const bytes = fs.readFileSync(filePath)
	assert(
		!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
		message || `${filePath} must be UTF-8 without BOM`,
	)
}

includes(script, 'class ForwarderDeployError', 'Forwarder deploy tooling must use typed errors.')
includes(script, 'solc.compile', 'Forwarder deploy tooling must compile the exact local Solidity sources.')
includes(script, 'forwarderInitCodeHash', 'Forwarder deploy tooling must compute/verify the forwarder init code hash.')
includes(script, 'private-key-env', 'Forwarder deploy tooling must support private key input by environment variable.')
includes(script, 'private-key-secret', 'Forwarder deploy tooling must support private key input by Secret Manager.')
includes(script, 'Private keys are not accepted as command-line values', 'Forwarder deploy tooling must refuse command-line private keys.')
includes(script, 'write-gcp-secrets', 'Forwarder deploy tooling must make Secret Manager writes explicit.')
includes(script, 'add-new-secret-versions', 'Forwarder deploy tooling must protect existing Secret Manager secrets by default.')
includes(script, 'betterpptx-forwarder-factory-address', 'Forwarder deploy tooling must write the factory address secret.')
includes(script, 'betterpptx-forwarder-codehash', 'Forwarder deploy tooling must write the codehash secret.')
includes(script, 'betterpptx-settlement-collector-evm-address', 'Forwarder deploy tooling must write the collector address secret.')
includes(script, 'ONCHAIN_CODEHASH_MISMATCH', 'Forwarder deploy tooling must reject bytecode/hash mismatch.')
includes(script, '<redacted-url-query>', 'Forwarder deploy tooling must redact secret-bearing RPC URL query strings.')
includes(script, 'authorization:\\s*bearer', 'Forwarder deploy tooling must redact bearer tokens in failure output.')
includes(script, 'console.error(sanitizeText(error.details.stderr))', 'Forwarder deploy tooling must sanitize nested stderr before printing it.')
assert(!script.includes("args['private-key']"), 'Forwarder deploy tooling must not accept a raw --private-key argument.')
assert(!script.includes('console.log(privateKey'), 'Forwarder deploy tooling must never print private keys.')

includes(proofScript, 'class ForwarderProofError', 'Forwarder proof tooling must use typed errors.')
includes(proofScript, 'solc.compile', 'Forwarder proof tooling must compile the exact local Solidity sources.')
includes(proofScript, 'predictForwarderAddress', 'Forwarder proof tooling must verify factory/local predicted addresses.')
includes(proofScript, 'forwarderInitCodeHash', 'Forwarder proof tooling must verify on-chain codehash.')
includes(proofScript, 'balanceOf', 'Forwarder proof tooling must inspect forwarder token balances for canary evidence.')
includes(proofScript, 'private-key-env', 'Forwarder proof tooling must support private key input by environment variable.')
includes(proofScript, 'private-key-secret', 'Forwarder proof tooling must support private key input by Secret Manager.')
includes(proofScript, 'Raw private keys are not accepted as command-line values', 'Forwarder proof tooling must refuse command-line private keys.')
includes(proofScript, 'salt-secret-env', 'Forwarder proof tooling must derive proof salts from environment-managed salt secrets.')
includes(proofScript, 'salt-secret-secret', 'Forwarder proof tooling must derive proof salts from Secret Manager salt secrets.')
includes(proofScript, 'saltHash', 'Forwarder proof output must use salt hashes, not raw salt disclosure.')
includes(proofScript, '<redacted-url-query>', 'Forwarder proof tooling must redact secret-bearing RPC URL query strings.')
includes(proofScript, 'authorization:\\s*bearer', 'Forwarder proof tooling must redact bearer tokens in failure output.')
assert(!proofScript.includes("args['private-key']"), 'Forwarder proof tooling must not accept a raw --private-key argument.')
assert(!proofScript.includes('console.log(privateKey'), 'Forwarder proof tooling must never print private keys.')
assert(!proofScript.includes('console.log(salt)'), 'Forwarder proof tooling must not print raw salts.')

includes(proofBundleScript, 'forwarder-external-proof-bundle', 'Forwarder proof bundle helper must write the deploy-gate evidence kind.')
includes(proofBundleScript, 'Base Sepolia forwarder proof', 'Forwarder proof bundle helper must require Base Sepolia proof.')
includes(proofBundleScript, 'Capped Base mainnet canary', 'Forwarder proof bundle helper must require capped Base mainnet canary proof.')
includes(proofBundleScript, 'Assert-SweepProof $baseSepolia 84532', 'Forwarder proof bundle helper must require Base Sepolia chainId=84532.')
includes(proofBundleScript, 'Assert-SweepProof $mainnetCanary 8453', 'Forwarder proof bundle helper must require Base mainnet chainId=8453.')
includes(proofBundleScript, 'MaxMainnetCanaryUsdc', 'Forwarder proof bundle helper must enforce a capped mainnet canary amount.')
includes(proofBundleScript, 'Raw proof contents, transaction hashes, forwarder addresses, salts, and local proof paths were not copied.', 'Forwarder proof bundle evidence must not copy raw proof details.')
includes(proofBundleScript, 'Write-Utf8NoBom', 'Forwarder proof bundle helper must write JSON evidence without a UTF-8 BOM.')

includes(secretScript, 'betterpptx-forwarder-salt-secret', 'Forwarder secret generator must create the salt secret.')
includes(secretScript, 'betterpptx-forwarder-sweeper-key', 'Forwarder secret generator must create the sweeper key secret.')
includes(secretScript, 'Resolve-Gcloud', 'Forwarder secret generator must resolve gcloud deliberately.')
includes(secretScript, 'Get-Command gcloud.cmd', 'Forwarder secret generator should prefer gcloud.cmd on Windows.')
includes(secretScript, 'createRequire', 'Forwarder secret generator must load repo-local wallet dependencies without temp npm install.')
includes(secretScript, 'viem/accounts', 'Forwarder secret generator must use the repo-local viem account helper.')
includes(secretScript, 'repoPackageJson', 'Forwarder secret generator must resolve viem relative to the repository package.json.')
assert(!secretScript.includes('npm install'), 'Forwarder secret generator must not depend on temp npm install during custody generation.')
assert(!secretScript.includes('ethers@'), 'Forwarder secret generator must not pull ethers dynamically during custody generation.')
includes(secretScript, 'Refusing to overwrite existing secrets', 'Forwarder secret generator must refuse accidental rotation.')
includes(secretScript, 'AddNewVersionIfSecretExists', 'Forwarder secret generator must require explicit rotation.')
includes(secretScript, 'Raw values were not printed', 'Forwarder secret generator must state raw secret values are not printed.')
includes(secretScript, 'Fund the sweeper address with Base ETH only', 'Forwarder secret generator must keep sweeper as gas-only.')
includes(secretScript, '$resolvedAddressOutputPath', 'Forwarder secret generator must resolve address-only output before entering its temp working directory.')
includes(secretScript, 'ReadPassphraseFromStdinForDryRun', 'Forwarder secret generator must support non-interactive dry-run custody verification.')
includes(secretScript, 'betterpptx.forwarder-secret-custody.encrypted.v1', 'Forwarder secret generator must write encrypted owner custody material.')
includes(secretScript, 'custodyPlaintextSha256', 'Forwarder secret generator must record custody plaintext hash without exposing plaintext.')
includes(secretScript, 'encryptedCustodySha256', 'Forwarder secret generator must record encrypted custody hash.')
includes(secretScript, 'Encrypted custody file', 'Forwarder secret generator must print the encrypted custody file location.')
assert(!secretScript.includes('Write-Host $generated.saltSecret'), 'Forwarder secret generator must not print salt secret.')
assert(!secretScript.includes('Write-Host $generated.sweeper.privateKey'), 'Forwarder secret generator must not print sweeper key.')

includes(reviewScript, 'forwarder-review-decision', 'Forwarder review evidence helper must write the deploy-gate evidence kind.')
includes(reviewScript, 'OWNER ACCEPTS FORWARDER WITHOUT EXTERNAL REVIEW', 'Forwarder review evidence helper must require exact owner-acceptance confirmation.')
includes(reviewScript, 'FORWARDER EXTERNAL REVIEW COMPLETED', 'Forwarder review evidence helper must require exact external-review confirmation.')
includes(reviewScript, 'chainId=8453', 'Forwarder review evidence helper must require capped Base mainnet canary evidence.')
includes(reviewScript, 'cappedLiveCanaryEvidenceSha256', 'Forwarder review evidence helper must hash capped canary evidence without copying raw proof details.')
includes(reviewScript, 'Write-Utf8NoBom', 'Forwarder review evidence helper must write JSON evidence without a UTF-8 BOM.')
includes(reviewScript, 'Raw proof contents, review contents, and reason text were not printed.', 'Forwarder review evidence helper must state that raw decision/proof details are not printed.')

const custodyRoot = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || '.', 'betterpptx-forwarder-custody-'))
try {
	const addressOutputPath = path.join(custodyRoot, 'addresses.json')
	const dryRun = childProcess.spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		secretScriptPath,
		'-DryRun',
		'-AddNewVersionIfSecretExists',
		'-ReadPassphraseFromStdinForDryRun',
		'-OutputDir',
		custodyRoot,
		'-AddressOutputPath',
		addressOutputPath,
	], {
		cwd: path.resolve('.'),
		encoding: 'utf8',
		input: 'forwarder custody verifier passphrase 0123456789\nforwarder custody verifier passphrase 0123456789\n',
		timeout: 120000,
	})
	assert.equal(dryRun.status, 0, `forwarder secret custody dry-run failed: stdout=${dryRun.stdout}\nstderr=${dryRun.stderr}`)
	assert(dryRun.stdout.includes('Dry run completed.'), 'Forwarder secret custody dry-run should report dry-run completion.')
	assert(dryRun.stdout.includes('Encrypted custody file'), 'Forwarder secret custody dry-run should report custody path.')
	assert(!/0x[0-9a-f]{64}/i.test(dryRun.stdout), 'Forwarder secret custody dry-run stdout must not print private-key-shaped values.')
	assert(!dryRun.stdout.includes('saltSecret'), 'Forwarder secret custody dry-run stdout must not print salt secret fields.')
	const files = fs.readdirSync(custodyRoot)
	const custodyFile = files.find(name => name.endsWith('.encrypted.json'))
	const manifestFile = files.find(name => name.includes('manifest') && name.endsWith('.json'))
	assert(custodyFile, 'Forwarder secret custody dry-run must write an encrypted custody file.')
	assert(manifestFile, 'Forwarder secret custody dry-run must write a manifest file.')
	const custody = JSON.parse(fs.readFileSync(path.join(custodyRoot, custodyFile), 'utf8'))
	assert.equal(custody.schema, 'betterpptx.forwarder-secret-custody.encrypted.v1')
	assert(custody.ciphertext && custody.encryption?.authTag, 'Encrypted custody file must contain ciphertext and auth tag.')
	assert(!JSON.stringify(custody).includes('privateKey'), 'Encrypted custody file must not contain plaintext private key fields.')
	assert(!JSON.stringify(custody).includes('saltSecret":"'), 'Encrypted custody file must not contain plaintext salt secret fields.')
	const manifest = JSON.parse(fs.readFileSync(path.join(custodyRoot, manifestFile), 'utf8'))
	assert.equal(manifest.dryRun, true, 'Forwarder secret custody manifest must record dry-run status.')
	assert.match(manifest.saltSecretSha256, /^[0-9a-f]{64}$/)
	assert.match(manifest.encryptedCustodySha256, /^[0-9a-f]{64}$/)
	assert.match(manifest.sweeperAddress, /^0x[0-9a-fA-F]{40}$/)
	const addresses = JSON.parse(fs.readFileSync(addressOutputPath, 'utf8'))
	assert(Array.isArray(addresses) && addresses[0]?.role === 'betterpptx-forwarder-sweeper', 'Forwarder secret custody dry-run must still write address-only output.')
	assert(!JSON.stringify(addresses).includes('privateKey'), 'Address-only output must not contain private keys.')
} finally {
	fs.rmSync(custodyRoot, { recursive: true, force: true })
}

const offline = childProcess.spawnSync(process.execPath, [
	scriptPath,
	'--offline',
	'--chain', 'base-sepolia',
	'--collector-address', '0x3000000000000000000000000000000000000003',
	'--token-address', '0x2000000000000000000000000000000000000002',
], {
	cwd: path.resolve('.'),
	encoding: 'utf8',
})

assert.equal(offline.status, 0, `offline compile failed: ${offline.stderr}`)
const parsed = JSON.parse(offline.stdout)
assert.equal(parsed.mode, 'offline-compile')
assert.equal(parsed.chainId, 84532)
assert.equal(parsed.collectorAddress, '0x3000000000000000000000000000000000000003')
assert.equal(parsed.tokenAddress, '0x2000000000000000000000000000000000000002')
assert.match(parsed.forwarderInitCodeHash, /^0x[0-9a-f]{64}$/)
assert.equal(parsed.factoryAddress, null)
assert.equal(parsed.deploymentTx, null)
assert.equal(parsed.wroteGcpSecrets, false)
assert(!offline.stdout.includes('privateKey'), 'offline output must not include private key fields.')

const proofOffline = childProcess.spawnSync(process.execPath, [
	proofScriptPath,
	'--offline',
	'--chain', 'base-sepolia',
	'--collector-address', '0x3000000000000000000000000000000000000003',
	'--token-address', '0x2000000000000000000000000000000000000002',
	'--factory-address', '0x4000000000000000000000000000000000000004',
	'--salt', '0x1000000000000000000000000000000000000000000000000000000000000001',
], {
	cwd: path.resolve('.'),
	encoding: 'utf8',
})

assert.equal(proofOffline.status, 0, `forwarder proof offline compile failed: ${proofOffline.stderr}`)
const proofParsed = JSON.parse(proofOffline.stdout)
assert.equal(proofParsed.mode, 'offline')
assert.equal(proofParsed.chainId, 84532)
assert.equal(proofParsed.collectorAddress, '0x3000000000000000000000000000000000000003')
assert.equal(proofParsed.tokenAddress, '0x2000000000000000000000000000000000000002')
assert.equal(proofParsed.factoryAddress, '0x4000000000000000000000000000000000000004')
assert.match(proofParsed.forwarderInitCodeHash, /^0x[0-9a-f]{64}$/)
assert.match(proofParsed.saltHash, /^[0-9a-f]{16}$/)
assert.match(proofParsed.predictedForwarderAddress, /^0x[0-9a-fA-F]{40}$/)
assert(!proofOffline.stdout.includes('1000000000000000000000000000000000000000000000000000000000000001'), 'forwarder proof output must not include raw salts.')
assert(!proofOffline.stdout.includes('privateKey'), 'forwarder proof output must not include private key fields.')

const proofBundleRoot = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || '.', 'betterpptx-forwarder-proof-bundle-'))
try {
	const sepoliaProofFile = path.join(proofBundleRoot, 'base-sepolia-proof.json')
	const mainnetCanaryFile = path.join(proofBundleRoot, 'base-mainnet-canary.json')
	const bundleOutput = path.join(proofBundleRoot, 'forwarder-proof-bundle.json')
	const sepoliaSweepTx = `0x${'34'.repeat(32)}`
	const mainnetCanarySweepTx = `0x${'56'.repeat(32)}`
	const sepoliaForwarder = '0x3434343434343434343434343434343434343434'
	const mainnetCanaryForwarder = '0x5656565656565656565656565656565656565656'
	fs.writeFileSync(sepoliaProofFile, `${JSON.stringify({
		version: 1,
		mode: 'sweep-proof',
		chain: 'Base Sepolia',
		chainId: 84532,
		proofComplete: true,
		receiptStatus: 'success',
		sweepTx: sepoliaSweepTx,
		predictedForwarderAddress: sepoliaForwarder,
		tokenAtomsBefore: '100000',
		tokenAtomsAfter: '0',
	}, null, 2)}\n`)
	fs.writeFileSync(mainnetCanaryFile, `${JSON.stringify({
		version: 1,
		mode: 'sweep-proof',
		chain: 'Base',
		chainId: 8453,
		proofComplete: true,
		receiptStatus: 'success',
		sweepTx: mainnetCanarySweepTx,
		predictedForwarderAddress: mainnetCanaryForwarder,
		tokenAtomsBefore: '250000',
		tokenAtomsAfter: '0',
	}, null, 2)}\n`)
	const bundleRun = childProcess.spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		proofBundleScriptPath,
		'-BaseSepoliaEvidenceFile',
		sepoliaProofFile,
		'-CappedLiveCanaryEvidenceFile',
		mainnetCanaryFile,
		'-OutputPath',
		bundleOutput,
		'-MaxMainnetCanaryUsdc',
		'1',
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 60000 })
	assert.equal(bundleRun.status, 0, `Forwarder proof bundle helper failed: stdout=${bundleRun.stdout}\nstderr=${bundleRun.stderr}`)
	assert(bundleRun.stdout.includes('Forwarder external proof bundle written:'), 'Forwarder proof bundle helper should report the output path.')
	assert(bundleRun.stdout.includes('Raw proof contents, transaction hashes, forwarder addresses, salts, and local proof paths were not printed.'), 'Forwarder proof bundle helper should report redaction policy.')
	assert(!bundleRun.stdout.includes(sepoliaForwarder), 'Forwarder proof bundle stdout must not print raw Sepolia address.')
	assert(!bundleRun.stdout.includes(mainnetCanaryForwarder), 'Forwarder proof bundle stdout must not print raw mainnet canary address.')
	assert(!bundleRun.stdout.includes(sepoliaSweepTx), 'Forwarder proof bundle stdout must not print raw Sepolia transaction hash.')
	assert(!bundleRun.stdout.includes(mainnetCanarySweepTx), 'Forwarder proof bundle stdout must not print raw mainnet canary transaction hash.')
	assertUtf8NoBom(bundleOutput, 'Forwarder proof bundle output must be UTF-8 without BOM.')
	const bundleLatest = path.join(proofBundleRoot, 'latest.json')
	assert(fs.existsSync(bundleLatest), 'Forwarder proof bundle helper must write latest.json beside the explicit output.')
	assertUtf8NoBom(bundleLatest, 'Forwarder proof bundle latest.json must be UTF-8 without BOM.')
	const bundleEvidence = JSON.parse(fs.readFileSync(bundleOutput, 'utf8'))
	assert.equal(bundleEvidence.kind, 'forwarder-external-proof-bundle')
	assert.equal(bundleEvidence.ok, true)
	assert.equal(bundleEvidence.dryRun, false)
	assert.equal(bundleEvidence.proofComplete, true)
	assert.equal(bundleEvidence.baseSepolia.chainId, 84532)
	assert.equal(bundleEvidence.baseMainnetCanary.chainId, 8453)
	assert.equal(bundleEvidence.baseMainnetCanary.cappedLiveValueCanary, true)
	assert.match(bundleEvidence.baseSepolia.evidenceSha256, /^[0-9a-f]{64}$/)
	assert.match(bundleEvidence.baseMainnetCanary.evidenceSha256, /^[0-9a-f]{64}$/)
	const bundleEvidenceJson = JSON.stringify(bundleEvidence)
	assert(!bundleEvidenceJson.includes(sepoliaForwarder), 'Forwarder proof bundle evidence must not copy raw Sepolia address.')
	assert(!bundleEvidenceJson.includes(mainnetCanaryForwarder), 'Forwarder proof bundle evidence must not copy raw mainnet address.')
	assert(!bundleEvidenceJson.includes(sepoliaSweepTx), 'Forwarder proof bundle evidence must not copy raw Sepolia transaction hash.')
	assert(!bundleEvidenceJson.includes(mainnetCanarySweepTx), 'Forwarder proof bundle evidence must not copy raw mainnet transaction hash.')
	assert(!bundleEvidenceJson.includes(sepoliaProofFile), 'Forwarder proof bundle evidence must not store local Sepolia proof paths.')
	assert(!bundleEvidenceJson.includes(mainnetCanaryFile), 'Forwarder proof bundle evidence must not store local mainnet proof paths.')
	const overCapRun = childProcess.spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		proofBundleScriptPath,
		'-BaseSepoliaEvidenceFile',
		sepoliaProofFile,
		'-CappedLiveCanaryEvidenceFile',
		mainnetCanaryFile,
		'-OutputPath',
		path.join(proofBundleRoot, 'over-cap.json'),
		'-MaxMainnetCanaryUsdc',
		'0.01',
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 60000 })
	assert.notEqual(overCapRun.status, 0, 'Forwarder proof bundle helper must reject over-cap mainnet canary evidence.')
	assert(`${overCapRun.stdout}\n${overCapRun.stderr}`.includes('exceeds MaxMainnetCanaryUsdc'), 'Forwarder proof bundle helper should explain canary cap failures.')
} finally {
	fs.rmSync(proofBundleRoot, { recursive: true, force: true })
}

const reviewRoot = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || '.', 'betterpptx-forwarder-review-'))
try {
	const canaryFile = path.join(reviewRoot, 'capped-mainnet-canary.json')
	const reviewOutput = path.join(reviewRoot, 'review-evidence.json')
	const externalReviewFile = path.join(reviewRoot, 'external-review.json')
	const externalReviewOutput = path.join(reviewRoot, 'external-review-evidence.json')
	fs.writeFileSync(canaryFile, `${JSON.stringify({
		version: 1,
		mode: 'sweep-proof',
		chain: 'Base',
		chainId: 8453,
		proofComplete: true,
		receiptStatus: 'success',
		sweepTx: `0x${'12'.repeat(32)}`,
		predictedForwarderAddress: '0x5555555555555555555555555555555555555555',
		tokenAtomsBefore: '250000',
		tokenAtomsAfter: '0',
	}, null, 2)}\n`)
	fs.writeFileSync(externalReviewFile, `${JSON.stringify({
		kind: 'forwarder-focused-external-review-summary',
		ok: true,
		reviewer: 'redacted',
		completedAt: '2026-06-18T00:00:00.000Z',
	}, null, 2)}\n`)

	const wrongConfirm = childProcess.spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		reviewScriptPath,
		'-Decision',
		'OwnerAcceptedNoExternalReview',
		'-CappedLiveCanaryEvidenceFile',
		canaryFile,
		'-OutputPath',
		reviewOutput,
		'-Confirm',
		'WRONG',
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 60000 })
	assert.notEqual(wrongConfirm.status, 0, 'Forwarder review evidence helper must reject missing/wrong confirmation.')
	assert(`${wrongConfirm.stdout}\n${wrongConfirm.stderr}`.includes("OWNER ACCEPTS FORWARDER WITHOUT EXTERNAL REVIEW"), 'Forwarder review evidence helper should tell the owner the exact required confirmation.')

	const reviewRun = childProcess.spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		reviewScriptPath,
		'-Decision',
		'OwnerAcceptedNoExternalReview',
		'-CappedLiveCanaryEvidenceFile',
		canaryFile,
		'-OutputPath',
		reviewOutput,
		'-Reason',
		'Proceed after capped live canary; verifier reason should be hashed only.',
		'-Confirm',
		'OWNER ACCEPTS FORWARDER WITHOUT EXTERNAL REVIEW',
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 60000 })
	assert.equal(reviewRun.status, 0, `Forwarder review evidence helper failed: stdout=${reviewRun.stdout}\nstderr=${reviewRun.stderr}`)
	assert(reviewRun.stdout.includes('Forwarder review evidence written:'), 'Forwarder review evidence helper should report the output path.')
	assert(reviewRun.stdout.includes('Raw proof contents, review contents, and reason text were not printed.'), 'Forwarder review helper should report redaction policy.')
	assert(!reviewRun.stdout.includes('Proceed after capped live canary'), 'Forwarder review helper stdout must not print raw reason text.')
	assert(!reviewRun.stdout.includes('250000'), 'Forwarder review helper stdout must not print raw canary amount.')
	assertUtf8NoBom(reviewOutput, 'Forwarder review evidence output must be UTF-8 without BOM.')
	const reviewEvidence = JSON.parse(fs.readFileSync(reviewOutput, 'utf8'))
	assert.equal(reviewEvidence.kind, 'forwarder-review-decision')
	assert.equal(reviewEvidence.ok, true)
	assert.equal(reviewEvidence.dryRun, false)
	assert.equal(reviewEvidence.ownerAccepted, true)
	assert.equal(reviewEvidence.cappedLiveValueCanaryAccepted, true)
	assert.equal(reviewEvidence.review.decision, 'owner_accepted_no_external_review')
	assert.equal(reviewEvidence.review.externalReviewRequired, false)
	assert.equal(reviewEvidence.review.ownerAcceptedNoExternalReview, true)
	assert.match(reviewEvidence.review.cappedLiveCanaryEvidenceSha256, /^[0-9a-f]{64}$/)
	assert.match(reviewEvidence.review.reasonSha256, /^[0-9a-f]{64}$/)
	assert(!JSON.stringify(reviewEvidence).includes('Proceed after capped live canary'), 'Forwarder review evidence must hash, not store, raw reason text.')
	assert(!JSON.stringify(reviewEvidence).includes(canaryFile), 'Forwarder review evidence must not store local proof paths.')
	const reviewLatest = path.join(reviewRoot, 'latest.json')
	assert(fs.existsSync(reviewLatest), 'Forwarder review helper must write latest.json beside the explicit output.')
	assertUtf8NoBom(reviewLatest, 'Forwarder review latest.json must be UTF-8 without BOM.')

	const externalReviewRun = childProcess.spawnSync('powershell', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		reviewScriptPath,
		'-Decision',
		'ExternalReviewCompleted',
		'-CappedLiveCanaryEvidenceFile',
		canaryFile,
		'-ExternalReviewEvidenceFile',
		externalReviewFile,
		'-OutputPath',
		externalReviewOutput,
		'-Confirm',
		'FORWARDER EXTERNAL REVIEW COMPLETED',
	], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 60000 })
	assert.equal(externalReviewRun.status, 0, `Forwarder external-review evidence helper failed: stdout=${externalReviewRun.stdout}\nstderr=${externalReviewRun.stderr}`)
	assertUtf8NoBom(externalReviewOutput, 'Forwarder external-review evidence output must be UTF-8 without BOM.')
	const externalEvidence = JSON.parse(fs.readFileSync(externalReviewOutput, 'utf8'))
	assert.equal(externalEvidence.review.decision, 'external_review_completed')
	assert.equal(externalEvidence.review.externalReviewCompleted, true)
	assert.equal(externalEvidence.review.externalReviewRequired, true)
	assert.match(externalEvidence.review.externalReviewEvidenceSha256, /^[0-9a-f]{64}$/)
	assert(!JSON.stringify(externalEvidence).includes(externalReviewFile), 'Forwarder external-review evidence must not store local external review paths.')
} finally {
	fs.rmSync(reviewRoot, { recursive: true, force: true })
}

console.log('FORWARDER DEPLOY TOOLING: PASS offlineCompile=1 proofOffline=1 proofBundle=1 proofBundleNoBom=1 noCliPrivateKey=1 explicitSecretWrites=1 saltSweeperGenerator=1 encryptedCustody=1 reviewEvidence=1 reviewNoBom=1')
