import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
	configuredBaseNetwork,
	paymentNetworkReadiness,
} from '../billing/base-network.mjs'
import { payramReadiness } from '../billing/payram-client.mjs'
import { listMonetizedMcpPaymentMethods, listMonetizedMcpPrices } from '../billing/monetized-mcp-adapter.mjs'
import { createX402QuoteStore } from '../billing/x402-packs.mjs'

test('payment network contract selects Base mainnet by compatibility default', () => {
	const network = configuredBaseNetwork({})
	assert.equal(network.chainId, 8453)
	assert.equal(network.network, 'eip155:8453')
	assert.equal(network.tokenContract, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
	assert.equal(network.paymentMethod, 'USDC_BASE_MAINNET')
})

test('payment network contract selects Base Sepolia and its canonical USDC', () => {
	const env = {
		BETTERPPTX_DEPLOYMENT_STAGE: 'testnet',
		BETTERPPTX_PAYMENT_NETWORK: 'base-sepolia',
	}
	const network = configuredBaseNetwork(env)
	assert.equal(network.chainId, 84532)
	assert.equal(network.network, 'eip155:84532')
	assert.equal(network.tokenContract, '0x036cbd53842c5426634e7929541ec2318f3dcf7e')
	assert.equal(network.paymentMethod, 'USDC_BASE_SEPOLIA')
	assert.equal(paymentNetworkReadiness({ env, payramEnabled: false }).ready, true)
})

test('testnet deployments fail closed when the payment network is not explicit', () => {
	const readiness = paymentNetworkReadiness({
		env: { BETTERPPTX_DEPLOYMENT_STAGE: 'testnet' },
		payramEnabled: false,
	})
	assert.equal(readiness.ready, false)
	assert.ok(readiness.missing.includes('BETTERPPTX_PAYMENT_NETWORK'))
})

test('PayRam testnet must match the selected Base testnet', () => {
	const mismatch = payramReadiness({
		env: {
			BETTERPPTX_PAYRAM_ENABLED: '1',
			BETTERPPTX_PAYRAM_BASE_URL: 'https://payram.example.test',
			BETTERPPTX_PAYRAM_API_KEY: 'test-payram-api-key-0000',
			BETTERPPTX_PAYMENT_NETWORK: 'base-sepolia',
			BETTERPPTX_PAYRAM_NETWORK: 'mainnet',
		},
	})
	assert.equal(mismatch.configured, false)
	assert.ok(mismatch.missing.includes('PAYMENT_NETWORK_MISMATCH'))

	const aligned = payramReadiness({
		env: {
			BETTERPPTX_PAYRAM_ENABLED: '1',
			BETTERPPTX_PAYRAM_BASE_URL: 'https://payram.example.test',
			BETTERPPTX_PAYRAM_API_KEY: 'test-payram-api-key-0000',
			BETTERPPTX_PAYMENT_NETWORK: 'base-sepolia',
			BETTERPPTX_PAYRAM_NETWORK: 'testnet',
		},
	})
	assert.equal(aligned.configured, true)
})

test('monetized payment-method discovery publishes the selected testnet contract', () => {
	const previous = { ...process.env }
	try {
		process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = '1'
		process.env.BETTERPPTX_PAYMENT_NETWORK = 'base-sepolia'
		process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'testnet'
		process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x1111111111111111111111111111111111111111'
		const methods = listMonetizedMcpPaymentMethods()
		assert.deepEqual(methods, [{
			walletAddress: '0x1111111111111111111111111111111111111111',
			paymentMethod: 'USDC_BASE_SEPOLIA',
			network: 'eip155:84532',
			networkName: 'Base Sepolia testnet',
			chainId: 84532,
			asset: 'USDC',
			tokenContract: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
			assetDecimals: 6,
		}])
	} finally {
		for (const key of Object.keys(process.env)) {
			if (!(key in previous)) delete process.env[key]
		}
		Object.assign(process.env, previous)
	}
})

test('x402 quote accepts bind to Base Sepolia rather than silently using mainnet', async () => {
	const previous = { ...process.env }
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-testnet-quote-'))
	try {
		Object.assign(process.env, {
			BETTERPPTX_MONETIZED_MCP_ENABLED: '1',
			BETTERPPTX_BILLING_MODEL: 'pay_per_job',
			BETTERPPTX_PAYMENT_NETWORK: 'base-sepolia',
			BETTERPPTX_DEPLOYMENT_STAGE: 'testnet',
			BETTERPPTX_PAYMENT_ENVELOPE_SECRET: 'testnet-envelope-secret-000000000000000000000000000000',
			BETTERPPTX_TREASURY_EVM_ADDRESS: '0x1111111111111111111111111111111111111111',
			BETTERPPTX_X402_STORE: 'local',
			BETTERPPTX_X402_FILE: path.join(root, 'quotes.json'),
		})
		const result = await listMonetizedMcpPrices({}, {}, {
			store: createX402QuoteStore(),
			premiumQuote: { credits: 500, priceUsdc: 5 },
			nowMs: Date.now(),
		})
		const item = result.items[0]
		assert.equal(item.price.paymentMethod, 'USDC_BASE_SEPOLIA')
		assert.equal(item.metadata.network, 'eip155:84532')
		assert.equal(item.metadata.chainId, 84532)
		assert.equal(item.metadata.tokenContract, '0x036cbd53842c5426634e7929541ec2318f3dcf7e')
	} finally {
		for (const key of Object.keys(process.env)) {
			if (!(key in previous)) delete process.env[key]
		}
		Object.assign(process.env, previous)
		fs.rmSync(root, { recursive: true, force: true })
	}
})
