import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import solc from 'solc'
import {
	encodeAbiParameters,
	getContractAddress,
	isAddress,
	keccak256,
} from 'viem'

import { BASE_USDC_CONTRACT, createCryptoOrderStore } from './billing/crypto-orders.mjs'
import {
	configuredForwarderConfig,
	deriveForwarderSalt,
	forwarderReadiness,
	predictForwarderAddress,
} from './billing/deposit-forwarders.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const contractDir = path.join(root, 'contracts', 'betterpptx-forwarder')
const forwarderPath = path.join(contractDir, 'BetterPPTXForwarder.sol')
const factoryPath = path.join(contractDir, 'BetterPPTXForwarderFactory.sol')

function readContract(file) {
	return fs.readFileSync(file, 'utf8')
}

function compileContracts() {
	const input = {
		language: 'Solidity',
		sources: {
			'BetterPPTXForwarder.sol': { content: readContract(forwarderPath) },
			'BetterPPTXForwarderFactory.sol': { content: readContract(factoryPath) },
		},
		settings: {
			optimizer: { enabled: true, runs: 200 },
			outputSelection: {
				'*': {
					'*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
				},
			},
		},
	}
	const output = JSON.parse(solc.compile(JSON.stringify(input)))
	const errors = (output.errors || []).filter(item => item.severity === 'error')
	assert.deepEqual(errors, [], `Solidity compilation failed: ${errors.map(item => item.formattedMessage).join('\n')}`)
	return output.contracts
}

function contractArtifact(contracts, file, name) {
	const artifact = contracts?.[file]?.[name]
	assert(artifact, `Missing compiled artifact ${file}:${name}`)
	assert(artifact.abi?.length > 0, `${name} ABI should not be empty`)
	assert(artifact.evm?.bytecode?.object, `${name} creation bytecode should not be empty`)
	assert(artifact.evm?.deployedBytecode?.object, `${name} runtime bytecode should not be empty`)
	return artifact
}

function abiNames(artifact) {
	return new Set((artifact.abi || []).map(item => item.name).filter(Boolean))
}

function assertNoDangerousSurface(source) {
	const lowered = source.toLowerCase()
	assert(!lowered.includes('selfdestruct'), 'Forwarder design must not use SELFDESTRUCT.')
	assert(!lowered.includes('delegatecall'), 'Forwarder design must not use delegatecall.')
	assert(!lowered.includes('upgrade'), 'Forwarder design must not include upgrade surface.')
}

function withForwarderEnv(overrides = {}) {
	const secret = 'forwarder salt secret for verifier 0123456789'
	const env = {
		BETTERPPTX_RAW_SEND_RAIL: 'forwarder',
		BETTERPPTX_FORWARDER_FACTORY_ADDRESS: '0x2000000000000000000000000000000000000002',
		BETTERPPTX_FORWARDER_CODEHASH: `0x${'12'.repeat(32)}`,
		BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS: '0x3000000000000000000000000000000000000003',
		BETTERPPTX_FORWARDER_SALT_SECRET: secret,
		BETTERPPTX_FORWARDER_SWEEPER_KEY: `0x${'44'.repeat(32)}`,
		BETTERPPTX_FORWARDER_BATCH_SIZE: '32',
		BETTERPPTX_FORWARDER_CANARY_MAX_USDC: '10',
		...overrides,
	}
	return { env, secret }
}

const contracts = compileContracts()
const forwarder = contractArtifact(contracts, 'BetterPPTXForwarder.sol', 'BetterPPTXForwarder')
const factory = contractArtifact(contracts, 'BetterPPTXForwarderFactory.sol', 'BetterPPTXForwarderFactory')

assertNoDangerousSurface(readContract(forwarderPath))
assertNoDangerousSurface(readContract(factoryPath))

const forwarderAbi = abiNames(forwarder)
for (const expected of ['token', 'collector', 'drain', 'Drained']) {
	assert(forwarderAbi.has(expected), `Forwarder ABI missing ${expected}`)
}
const factoryAbi = abiNames(factory)
for (const expected of ['token', 'collector', 'forwarderInitCodeHash', 'predictForwarderAddress', 'sweep', 'sweepMany', 'ForwarderSwept', 'ForwarderSweepFailed']) {
	assert(factoryAbi.has(expected), `Factory ABI missing ${expected}`)
}

const factorySource = readContract(factoryPath)
assert.equal((factorySource.match(/emit ForwarderSwept/g) || []).length, 1, 'Batch sweep should not emit duplicate success events.')
assert(factorySource.includes('try this.sweep(salt)'), 'Batch sweep should isolate per-salt failures through an external try/catch call.')
assert(factorySource.includes('IERC20Balance(token).balanceOf(forwarder)'), 'Factory sweep should report the token amount already present at a counterfactual address before constructor-drain.')
assert(!factorySource.includes('amount = 0;'), 'Factory sweep must not report zero for newly deployed funded forwarders.')

const collector = '0x3000000000000000000000000000000000000003'
const factoryAddress = '0x2000000000000000000000000000000000000002'
const constructorArgs = encodeAbiParameters(
	[{ type: 'address' }, { type: 'address' }],
	[BASE_USDC_CONTRACT, collector],
)
const forwarderBytecode = `0x${forwarder.evm.bytecode.object}`
const initCodeHash = keccak256(`${forwarderBytecode}${constructorArgs.slice(2)}`)
assert.match(initCodeHash, /^0x[0-9a-f]{64}$/)

const saltSecret = 'salt secret used by verifier and intentionally long'
const saltA = deriveForwarderSalt({ orderId: 'order_a', customerHash: 'customer_1', nonce: 'n1' }, saltSecret)
const saltAStable = deriveForwarderSalt({ nonce: 'n1', customerHash: 'customer_1', orderId: 'order_a' }, saltSecret)
const saltB = deriveForwarderSalt({ orderId: 'order_b', customerHash: 'customer_1', nonce: 'n1' }, saltSecret)
assert.equal(saltA, saltAStable, 'Salt derivation must be stable for equivalent input order.')
assert.notEqual(saltA, saltB, 'Different orders must derive different salts.')

const predicted = predictForwarderAddress({ factoryAddress, salt: saltA, initCodeHash })
const predictedViaViem = getContractAddress({
	from: factoryAddress,
	opcode: 'CREATE2',
	salt: saltA,
	bytecodeHash: initCodeHash,
}).toLowerCase()
assert.equal(predicted, predictedViaViem, 'Forwarder address prediction must match CREATE2 formula.')
assert(isAddress(predicted), 'Predicted forwarder address must be a valid EVM address.')
assert.notEqual(
	predicted,
	predictForwarderAddress({ factoryAddress, salt: saltB, initCodeHash }),
	'Different salts must produce different forwarder addresses.',
)

assert.equal(forwarderReadiness({}).enabled, false, 'Forwarder rail should be disabled unless explicitly selected.')
const { env, secret } = withForwarderEnv({ BETTERPPTX_FORWARDER_CODEHASH: initCodeHash })
const config = configuredForwarderConfig(env)
assert.equal(config.rail, 'forwarder')
assert.equal(config.factoryAddress, factoryAddress.toLowerCase())
assert.equal(config.collectorAddress, collector.toLowerCase())
assert.equal(config.tokenAddress, BASE_USDC_CONTRACT.toLowerCase())
assert.equal(config.batchSize, 32)
assert.equal(config.canaryMaxUsdc, 10)
const readiness = forwarderReadiness(env)
assert.equal(readiness.enabled, true)
assert.equal(readiness.configured, true)
assert.deepEqual(readiness.missing, [])
const serializedReadiness = JSON.stringify(readiness)
assert(!serializedReadiness.includes(secret), 'Forwarder readiness must not leak salt secret.')
assert(!serializedReadiness.includes(env.BETTERPPTX_FORWARDER_SWEEPER_KEY), 'Forwarder readiness must not leak sweeper key.')

const missingSweeper = forwarderReadiness({ ...env, BETTERPPTX_FORWARDER_SWEEPER_KEY: '' })
assert.equal(missingSweeper.configured, false)
assert(missingSweeper.missing.includes('BETTERPPTX_FORWARDER_SWEEPER_KEY'), 'Production forwarder readiness should require the keeper gas key.')

const badFactory = forwarderReadiness({ ...env, BETTERPPTX_FORWARDER_FACTORY_ADDRESS: 'not-an-address' })
assert.equal(badFactory.configured, false)
assert.equal(badFactory.error, 'FORWARDER_ADDRESS_INVALID')

assert.throws(
	() => deriveForwarderSalt({ orderId: 'short' }, 'too-short'),
	error => error?.code === 'FORWARDER_SALT_SECRET_MISSING',
)

const outputDir = path.join(root, 'outputs', 'deposit-forwarders-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })
process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local'
process.env.BETTERPPTX_CRYPTO_ORDER_FILE = path.join(outputDir, 'orders.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_RAW_SEND_RAIL = 'forwarder'
process.env.BETTERPPTX_FORWARDER_FACTORY_ADDRESS = factoryAddress
process.env.BETTERPPTX_FORWARDER_CODEHASH = initCodeHash
process.env.BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS = collector
process.env.BETTERPPTX_FORWARDER_SALT_SECRET = saltSecret
process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY = `0x${'77'.repeat(32)}`
process.env.BETTERPPTX_FORWARDER_BATCH_SIZE = '16'
process.env.BETTERPPTX_FORWARDER_CANARY_MAX_USDC = '5'
delete process.env.BETTERPPTX_DEPOSIT_XPUB_JSON
delete process.env.BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON

const store = createCryptoOrderStore()
const orderInput = {
	orderId: 'order_forwarder_verify',
	installHash: 'install_forwarder_verify',
	customerHash: 'customer_forwarder_verify',
	envelopeJti: 'forwarder-envelope-1',
	packId: 'starter_500',
}
const order = await store.createOrder(orderInput)
const orderSalt = deriveForwarderSalt({
	orderId: orderInput.orderId,
	customerHash: orderInput.customerHash,
	packId: orderInput.packId,
	nonce: orderInput.envelopeJti,
}, saltSecret)
const expectedOrderAddress = predictForwarderAddress({ factoryAddress, salt: orderSalt, initCodeHash })
assert.equal(order.depositAddress, expectedOrderAddress, 'Forwarder rail must allocate the predicted CREATE2 address.')
assert.equal(order.tokenContract, BASE_USDC_CONTRACT, 'Forwarder order must still advertise canonical Base USDC.')
const publicOrderJson = JSON.stringify(order)
assert(!publicOrderJson.includes(factoryAddress.toLowerCase()), 'Public order must not expose forwarder factory.')
assert(!publicOrderJson.includes(initCodeHash), 'Public order must not expose forwarder codehash.')
assert(!publicOrderJson.includes(collector.toLowerCase()), 'Public order must not expose settlement collector.')
assert(!publicOrderJson.includes(orderSalt), 'Public order must not expose raw forwarder salt.')

const stored = JSON.parse(fs.readFileSync(path.join(outputDir, 'orders.json'), 'utf8'))
const storedJson = JSON.stringify(stored)
assert(storedJson.includes('"depositAddressSource":"forwarder"'), 'Local store should record forwarder source internally.')
assert(storedJson.includes('"source":"forwarder"'), 'Address allocation should record forwarder source internally.')
assert(!storedJson.includes(saltSecret), 'Order store must not contain raw forwarder salt secret.')
assert(!storedJson.includes(process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY), 'Order store must not contain sweeper private key.')

console.log('DEPOSIT FORWARDERS VERIFY: PASS')
