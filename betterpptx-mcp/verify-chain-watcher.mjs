import * as fs from 'node:fs'
import * as path from 'node:path'

process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'

const outputDir = path.resolve('outputs', 'chain-watcher-verify', `run-${Date.now()}-${process.pid}`)
const ledgerFile = path.join(outputDir, 'ledger.json')
const orderFile = path.join(outputDir, 'orders.json')
fs.mkdirSync(outputDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = ledgerFile
process.env.BETTERPPTX_CRYPTO_ORDER_FILE = orderFile

const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const {
	BASE_CHAIN_ID,
	BASE_USDC_CONTRACT,
	createCryptoOrderStore,
} = await import('./billing/crypto-orders.mjs')
const {
	BASE_USDC_TRANSFER_TOPIC,
	processBaseUsdcLogs,
	scanBaseUsdcHotWindow,
} = await import('./billing/base-usdc-watcher.mjs')
const { getBillingTelemetrySummary } = await import('./telemetry.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function txHash(index) {
	return `0x${index.toString(16).padStart(64, '0')}`
}

function topicAddress(address) {
	return `0x${address.replace(/^0x/, '').padStart(64, '0')}`
}

function transferLog({ address = BASE_USDC_CONTRACT, to, amountMicros, blockNumber, index, removed = false }) {
	return {
		address,
		topics: [
			BASE_USDC_TRANSFER_TOPIC,
			topicAddress('0x0000000000000000000000000000000000000001'),
			topicAddress(to),
		],
		data: `0x${amountMicros.toString(16)}`,
		blockNumber: `0x${blockNumber.toString(16)}`,
		transactionHash: txHash(index),
		logIndex: `0x${index.toString(16)}`,
		removed,
	}
}

const addresses = [
	'0x1000000000000000000000000000000000000001',
	'0x1000000000000000000000000000000000000002',
]
const store = createCryptoOrderStore()
const ledger = createBillingLedgerStore()
await store.ensureAddressInventory(addresses)
const first = await store.createOrder({
	installHash: 'install_chain_watcher_1',
	customerHash: 'install_chain_watcher_1',
	envelopeJti: 'envelope_chain_watcher_1',
	packId: 'starter_500',
})
const second = await store.createOrder({
	installHash: 'install_chain_watcher_2',
	customerHash: 'install_chain_watcher_2',
	envelopeJti: 'envelope_chain_watcher_2',
	packId: 'builder_1500',
})

const latestBlock = 110
const firstPass = await processBaseUsdcLogs({
	store,
	ledger,
	latestBlock,
	safeDepth: 2,
	logs: [
		transferLog({ to: first.depositAddress, amountMicros: 600000, blockNumber: 100, index: 1 }),
		transferLog({ to: first.depositAddress, amountMicros: 600000, blockNumber: 101, index: 2 }),
		transferLog({ to: second.depositAddress, amountMicros: 16000000, blockNumber: 109, index: 3 }),
		transferLog({ to: second.depositAddress, amountMicros: 15000000, blockNumber: 100, index: 4, removed: true }),
		transferLog({ address: '0x2000000000000000000000000000000000000000', to: first.depositAddress, amountMicros: 5000000, blockNumber: 100, index: 5 }),
	],
})
expect(firstPass.credited === 120, 'Two dust transfers should aggregate before minting credits.', { firstPass })
expect(firstPass.ignoredUnsafeHead === 1, 'Unsafe-head transfer should not be processed.', { firstPass })
expect(firstPass.ignoredRemoved === 1, 'Removed/reorg log should not be processed.', { firstPass })
expect(firstPass.ignoredWrongToken === 1, 'Wrong-token log should not be processed.', { firstPass })

let firstCustomer = await ledger.getCustomer('install_chain_watcher_1')
expect(firstCustomer.availableBalanceCredits === 120, 'Aggregated verified USDC should credit the install once.', { firstCustomer })

const replay = await processBaseUsdcLogs({
	store,
	ledger,
	latestBlock,
	safeDepth: 2,
	logs: [
		transferLog({ to: first.depositAddress, amountMicros: 600000, blockNumber: 100, index: 1 }),
		transferLog({ to: first.depositAddress, amountMicros: 600000, blockNumber: 101, index: 2 }),
	],
})
expect(replay.replayed === 2 && replay.credited === 0, 'Replayed transfer logs must not double-credit.', { replay })
firstCustomer = await ledger.getCustomer('install_chain_watcher_1')
expect(firstCustomer.availableBalanceCredits === 120, 'Replay changed the credited balance.', { firstCustomer })

const rpcCalls = []
const mockRpc = async (method, params) => {
	rpcCalls.push({ method, params })
	if (method === 'eth_chainId') return `0x${BASE_CHAIN_ID.toString(16)}`
	if (method === 'eth_blockNumber') return '0x6e'
	if (method === 'eth_getLogs') return [
		transferLog({ to: second.depositAddress, amountMicros: 16000000, blockNumber: 100, index: 6 }),
	]
	throw new Error(`Unexpected RPC method ${method}`)
}
const scanned = await scanBaseUsdcHotWindow({ store, ledger, rpc: mockRpc })
expect(scanned.credited === 1600, 'Large verified transfer should credit after five confirmations.', { scanned })
expect(rpcCalls.some(call => call.method === 'eth_getLogs'), 'Watcher did not query canonical Transfer logs.', { rpcCalls })

const secondCustomer = await ledger.getCustomer('install_chain_watcher_2')
expect(secondCustomer.availableBalanceCredits === 1600, 'Watcher credited the wrong amount for the large transfer.', { secondCustomer })

const wrongChainRpc = async method => method === 'eth_chainId' ? '0x1' : '0x0'
let wrongChain = false
try {
	await scanBaseUsdcHotWindow({ store, ledger, rpc: wrongChainRpc })
} catch (error) {
	wrongChain = error?.code === 'BASE_RPC_WRONG_CHAIN'
}
expect(wrongChain, 'Watcher must reject a non-Base RPC endpoint.', {})

const telemetry = getBillingTelemetrySummary()
expect(telemetry.scannerRuns === 2 && telemetry.scannerFailures === 1, 'Scanner telemetry should record successful and failed scans.', { telemetry })
expect(telemetry.creditedVolumeCredits === 1600, 'Scanner telemetry should record newly credited chain volume once.', { telemetry })
expect(Boolean(telemetry.scannerLastSuccessAt), 'Scanner telemetry should expose last successful scan time.', { telemetry })

console.log(`CHAIN WATCHER: PASS aggregateDust=${firstCustomer.availableBalanceCredits} large=${secondCustomer.availableBalanceCredits} replay=${replay.replayed}`)
