import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import ganache from 'ganache'
import solc from 'solc'
import {
	createPublicClient,
	createWalletClient,
	decodeEventLog,
	getAddress,
	getContractAddress,
	http,
	isAddressEqual,
	keccak256,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const root = fileURLToPath(new URL('..', import.meta.url))
const contractDir = path.join(root, 'contracts', 'betterpptx-forwarder')
const DEPLOYER_KEY = `0x${'11'.repeat(32)}`
const CALLER_KEY = `0x${'22'.repeat(32)}`
const COLLECTOR = '0x3000000000000000000000000000000000000003'

const MOCK_TOKEN_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockToken {
	mapping(address => uint256) public balanceOf;
	bool public failTransfer;

	event Transfer(address indexed from, address indexed to, uint256 value);

	function mint(address to, uint256 value) external {
		balanceOf[to] += value;
		emit Transfer(address(0), to, value);
	}

	function setFailTransfer(bool value) external {
		failTransfer = value;
	}

	function transfer(address to, uint256 value) external returns (bool) {
		if (failTransfer) return false;
		require(balanceOf[msg.sender] >= value, "insufficient");
		balanceOf[msg.sender] -= value;
		balanceOf[to] += value;
		emit Transfer(msg.sender, to, value);
		return true;
	}
}
`

function readContract(name) {
	return fs.readFileSync(path.join(contractDir, name), 'utf8')
}

function compileContracts() {
	const input = {
		language: 'Solidity',
		sources: {
			'BetterPPTXForwarder.sol': { content: readContract('BetterPPTXForwarder.sol') },
			'BetterPPTXForwarderFactory.sol': { content: readContract('BetterPPTXForwarderFactory.sol') },
			'MockToken.sol': { content: MOCK_TOKEN_SOURCE },
		},
		settings: {
			evmVersion: 'shanghai',
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

function artifact(contracts, file, name) {
	const found = contracts?.[file]?.[name]
	assert(found?.abi?.length, `Missing ABI for ${file}:${name}`)
	assert(found?.evm?.bytecode?.object, `Missing bytecode for ${file}:${name}`)
	return found
}

function salt(byte) {
	return `0x${byte.repeat(32)}`
}

async function listen(server) {
	await new Promise((resolve, reject) => {
		server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve())
	})
	const address = server.address()
	return `http://127.0.0.1:${address.port}`
}

async function close(server) {
	await server.close()
}

function localChain(rpcUrl) {
	return {
		id: 31337,
		name: 'ganache-local',
		nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
		rpcUrls: { default: { http: [rpcUrl] } },
	}
}

async function deploy({ publicClient, walletClient, artifact, args = [] }) {
	const hash = await walletClient.deployContract({
		abi: artifact.abi,
		bytecode: `0x${artifact.evm.bytecode.object}`,
		args,
	})
	const receipt = await publicClient.waitForTransactionReceipt({ hash })
	assert.equal(receipt.status, 'success')
	assert(receipt.contractAddress, 'Deployment receipt must include a contract address.')
	return getAddress(receipt.contractAddress)
}

async function write({ publicClient, walletClient, address, abi, functionName, args = [] }) {
	const hash = await walletClient.writeContract({ address, abi, functionName, args })
	const receipt = await publicClient.waitForTransactionReceipt({ hash })
	assert.equal(receipt.status, 'success', `${functionName} transaction should succeed.`)
	return receipt
}

async function read(publicClient, { address, abi, functionName, args = [] }) {
	return publicClient.readContract({ address, abi, functionName, args })
}

function decodedEvents(receipt, abi, eventName) {
	return receipt.logs.flatMap(log => {
		try {
			const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics })
			return decoded.eventName === eventName ? [decoded] : []
		} catch {
			return []
		}
	})
}

const contracts = compileContracts()
const forwarder = artifact(contracts, 'BetterPPTXForwarder.sol', 'BetterPPTXForwarder')
const factory = artifact(contracts, 'BetterPPTXForwarderFactory.sol', 'BetterPPTXForwarderFactory')
const token = artifact(contracts, 'MockToken.sol', 'MockToken')

const server = ganache.server({
	logging: { quiet: true },
	chain: { chainId: 31337, hardfork: 'shanghai' },
	wallet: {
		accounts: [
			{ secretKey: DEPLOYER_KEY, balance: '0x3635c9adc5dea00000' },
			{ secretKey: CALLER_KEY, balance: '0x3635c9adc5dea00000' },
		],
	},
})

try {
	const rpcUrl = await listen(server)
	const chain = localChain(rpcUrl)
	const deployer = privateKeyToAccount(DEPLOYER_KEY)
	const caller = privateKeyToAccount(CALLER_KEY)
	const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
	const deployerWallet = createWalletClient({ account: deployer, chain, transport: http(rpcUrl) })
	const callerWallet = createWalletClient({ account: caller, chain, transport: http(rpcUrl) })

	const goodToken = await deploy({ publicClient, walletClient: deployerWallet, artifact: token })
	const wrongToken = await deploy({ publicClient, walletClient: deployerWallet, artifact: token })
	const factoryAddress = await deploy({
		publicClient,
		walletClient: deployerWallet,
		artifact: factory,
		args: [goodToken, COLLECTOR],
	})

	await assert.rejects(
		() => deploy({ publicClient, walletClient: deployerWallet, artifact: factory, args: ['0x0000000000000000000000000000000000000000', COLLECTOR] }),
		/InvalidAddress|revert|execution reverted/i,
		'Factory constructor must reject a zero token address.',
	)
	await assert.rejects(
		() => deploy({ publicClient, walletClient: deployerWallet, artifact: factory, args: [goodToken, '0x0000000000000000000000000000000000000000'] }),
		/InvalidAddress|revert|execution reverted/i,
		'Factory constructor must reject a zero collector address.',
	)

	assert.equal(await read(publicClient, { address: factoryAddress, abi: factory.abi, functionName: 'token' }), goodToken)
	assert.equal(await read(publicClient, { address: factoryAddress, abi: factory.abi, functionName: 'collector' }), COLLECTOR)
	const initCodeHash = await read(publicClient, { address: factoryAddress, abi: factory.abi, functionName: 'forwarderInitCodeHash' })
	const saltPreDeploy = salt('01')
	const predicted = getAddress(await read(publicClient, {
		address: factoryAddress,
		abi: factory.abi,
		functionName: 'predictForwarderAddress',
		args: [saltPreDeploy],
	}))
	const predictedByFormula = getContractAddress({
		from: factoryAddress,
		opcode: 'CREATE2',
		salt: saltPreDeploy,
		bytecodeHash: initCodeHash,
	})
	assert(isAddressEqual(predicted, predictedByFormula), 'Factory and JS CREATE2 predictions should match.')
	assert.equal(await publicClient.getCode({ address: predicted }), undefined)

	await write({ publicClient, walletClient: deployerWallet, address: goodToken, abi: token.abi, functionName: 'mint', args: [predicted, 5_000_000n] })
	const preDeploySweep = await write({
		publicClient,
		walletClient: deployerWallet,
		address: factoryAddress,
		abi: factory.abi,
		functionName: 'sweep',
		args: [saltPreDeploy],
	})
	const preDeployEvents = decodedEvents(preDeploySweep, factory.abi, 'ForwarderSwept')
	assert.equal(preDeployEvents.length, 1, 'Pre-deploy sweep should emit exactly one ForwarderSwept event.')
	assert.equal(preDeployEvents[0].args.forwarder, predicted)
	assert.equal(preDeployEvents[0].args.deployed, true)
	assert.equal(preDeployEvents[0].args.amount, 5_000_000n, 'Constructor-drain sweep event should report pre-deploy token balance.')
	assert.notEqual(await publicClient.getCode({ address: predicted }), undefined)
	assert.equal(await read(publicClient, { address: goodToken, abi: token.abi, functionName: 'balanceOf', args: [predicted] }), 0n)
	assert.equal(await read(publicClient, { address: goodToken, abi: token.abi, functionName: 'balanceOf', args: [COLLECTOR] }), 5_000_000n)

	await write({ publicClient, walletClient: deployerWallet, address: goodToken, abi: token.abi, functionName: 'mint', args: [predicted, 2_000_000n] })
	await write({ publicClient, walletClient: callerWallet, address: predicted, abi: forwarder.abi, functionName: 'drain' })
	assert.equal(await read(publicClient, { address: goodToken, abi: token.abi, functionName: 'balanceOf', args: [predicted] }), 0n)
	assert.equal(await read(publicClient, { address: goodToken, abi: token.abi, functionName: 'balanceOf', args: [COLLECTOR] }), 7_000_000n)

	await write({ publicClient, walletClient: deployerWallet, address: wrongToken, abi: token.abi, functionName: 'mint', args: [predicted, 999n] })
	await write({ publicClient, walletClient: callerWallet, address: predicted, abi: forwarder.abi, functionName: 'drain' })
	assert.equal(await read(publicClient, { address: wrongToken, abi: token.abi, functionName: 'balanceOf', args: [predicted] }), 999n, 'Forwarder should ignore non-configured tokens.')
	assert.equal(await read(publicClient, { address: wrongToken, abi: token.abi, functionName: 'balanceOf', args: [COLLECTOR] }), 0n)

	const saltEmpty = salt('02')
	const emptyPredicted = getAddress(await read(publicClient, {
		address: factoryAddress,
		abi: factory.abi,
		functionName: 'predictForwarderAddress',
		args: [saltEmpty],
	}))
	const emptySweep = await write({
		publicClient,
		walletClient: deployerWallet,
		address: factoryAddress,
		abi: factory.abi,
		functionName: 'sweep',
		args: [saltEmpty],
	})
	assert.equal(decodedEvents(emptySweep, factory.abi, 'ForwarderSwept')[0].args.amount, 0n)
	assert.notEqual(await publicClient.getCode({ address: emptyPredicted }), undefined, 'Empty sweep still deploys the deterministic forwarder.')
	assert.equal(await read(publicClient, { address: goodToken, abi: token.abi, functionName: 'balanceOf', args: [COLLECTOR] }), 7_000_000n)

	const saltOverpay = salt('03')
	const overpayPredicted = getAddress(await read(publicClient, {
		address: factoryAddress,
		abi: factory.abi,
		functionName: 'predictForwarderAddress',
		args: [saltOverpay],
	}))
	await write({ publicClient, walletClient: deployerWallet, address: goodToken, abi: token.abi, functionName: 'mint', args: [overpayPredicted, 12_000_000n] })
	await write({ publicClient, walletClient: deployerWallet, address: factoryAddress, abi: factory.abi, functionName: 'sweep', args: [saltOverpay] })
	assert.equal(await read(publicClient, { address: goodToken, abi: token.abi, functionName: 'balanceOf', args: [COLLECTOR] }), 19_000_000n)

	const saltBatchA = salt('04')
	const saltBatchB = salt('05')
	const batchA = getAddress(await read(publicClient, { address: factoryAddress, abi: factory.abi, functionName: 'predictForwarderAddress', args: [saltBatchA] }))
	const batchB = getAddress(await read(publicClient, { address: factoryAddress, abi: factory.abi, functionName: 'predictForwarderAddress', args: [saltBatchB] }))
	await write({ publicClient, walletClient: deployerWallet, address: goodToken, abi: token.abi, functionName: 'mint', args: [batchA, 1_000_000n] })
	await write({ publicClient, walletClient: deployerWallet, address: goodToken, abi: token.abi, functionName: 'mint', args: [batchB, 3_000_000n] })
	const batchSweep = await write({ publicClient, walletClient: deployerWallet, address: factoryAddress, abi: factory.abi, functionName: 'sweepMany', args: [[saltBatchA, saltBatchB]] })
	assert.equal(decodedEvents(batchSweep, factory.abi, 'ForwarderSwept').length, 2, 'Batch sweep should emit one success event per salt.')
	assert.equal(await read(publicClient, { address: goodToken, abi: token.abi, functionName: 'balanceOf', args: [COLLECTOR] }), 23_000_000n)

	const failingToken = await deploy({ publicClient, walletClient: deployerWallet, artifact: token })
	const failingFactory = await deploy({ publicClient, walletClient: deployerWallet, artifact: factory, args: [failingToken, COLLECTOR] })
	const saltFail = salt('06')
	const failingPredicted = getAddress(await read(publicClient, { address: failingFactory, abi: factory.abi, functionName: 'predictForwarderAddress', args: [saltFail] }))
	await write({ publicClient, walletClient: deployerWallet, address: failingToken, abi: token.abi, functionName: 'mint', args: [failingPredicted, 777n] })
	await write({ publicClient, walletClient: deployerWallet, address: failingToken, abi: token.abi, functionName: 'setFailTransfer', args: [true] })
	const failedBatch = await write({ publicClient, walletClient: deployerWallet, address: failingFactory, abi: factory.abi, functionName: 'sweepMany', args: [[saltFail]] })
	assert.equal(decodedEvents(failedBatch, factory.abi, 'ForwarderSweepFailed').length, 1, 'Batch sweep should report a failed salt without reverting the whole batch.')
	assert.equal(await publicClient.getCode({ address: failingPredicted }), undefined, 'Failed constructor drain should not leave deployed code.')
	assert.equal(await read(publicClient, { address: failingToken, abi: token.abi, functionName: 'balanceOf', args: [failingPredicted] }), 777n)
	assert.equal(await read(publicClient, { address: failingToken, abi: token.abi, functionName: 'balanceOf', args: [COLLECTOR] }), 0n)

	console.log('FORWARDER CONTRACT BEHAVIOR: PASS constructorDrain=1 lateDrain=1 wrongTokenIgnored=1 empty=1 overpay=1 sweepMany=1 failureEvent=1 immutableDestination=1')
} finally {
	await close(server)
}
