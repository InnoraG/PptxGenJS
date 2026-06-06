#!/usr/bin/env node
// Private maintainer utility: grant Dodo test-mode credits for MC3 evidence runs.

import fs from 'node:fs'
import path from 'node:path'

import { dodoFetchJson } from './billing/dodo-client.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = process.platform === 'win32' && here.startsWith('/') ? here.slice(1) : here
const defaultEnvFile = path.join(root, '.betterpptx-mcp-runtime', 'dodo-local.env')

function usage() {
	console.log(`Usage:
node betterpptx-mcp/dodo-test-credit-grant.mjs [options]

Options:
  --amount <n>             Credits to grant. Default: 2500.
  --env-file <path>        Private Dodo env file. Default: betterpptx-mcp/.betterpptx-mcp-runtime/dodo-local.env.
  --idempotency-key <key>  Override deterministic MC3 idempotency key.
  --wait-ms <n>            Wait after grant before balance readback. Default: 5000.
`)
}

function parseArgs(argv) {
	const opts = {
		amount: 2500,
		envFile: defaultEnvFile,
		idempotencyKey: '',
		waitMs: 5000,
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--amount' && argv[i + 1]) { opts.amount = Math.max(0, Number(argv[++i]) || 0); continue }
		if (arg === '--env-file' && argv[i + 1]) { opts.envFile = path.resolve(argv[++i]); continue }
		if (arg === '--idempotency-key' && argv[i + 1]) { opts.idempotencyKey = String(argv[++i]).trim(); continue }
		if (arg === '--wait-ms' && argv[i + 1]) { opts.waitMs = Math.max(0, Number(argv[++i]) || 0); continue }
		if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
		throw new Error(`Unknown argument: ${arg}`)
	}
	if (!opts.amount) throw new Error('Grant amount must be positive.')
	if (!opts.idempotencyKey) {
		const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
		opts.idempotencyKey = `bpptx_mc3_credit_grant_${date}_${opts.amount}`
	}
	return opts
}

function readEnvFile(file) {
	if (!fs.existsSync(file)) throw new Error(`Env file not found: ${file}`)
	const env = {}
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/)
		if (!m) continue
		let value = m[2].trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
		env[m[1]] = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
	}
	return env
}

function firstString(...values) {
	for (const value of values) {
		if (typeof value !== 'string') continue
		const trimmed = value.trim()
		if (trimmed) return trimmed
	}
	return ''
}

function extractBalance(data) {
	const candidates = [
		data?.available_balance,
		data?.availableBalance,
		data?.balance,
		data?.credits,
		data?.data?.available_balance,
		data?.data?.availableBalance,
		data?.data?.balance,
	]
	for (const value of candidates) {
		if (value === undefined || value === null) continue
		if (typeof value === 'object') {
			const nested = extractBalance(value)
			if (nested !== null) return nested
		} else {
			const n = Number(value)
			if (Number.isFinite(n)) return n
		}
	}
	return null
}

async function wait(ms) {
	await new Promise(resolve => setTimeout(resolve, ms))
}

async function getBalance(creditId, customerId) {
	const response = await dodoFetchJson(`/credit-entitlements/${encodeURIComponent(creditId)}/balances/${encodeURIComponent(customerId)}`)
	const balance = extractBalance(response.data)
	if (balance === null) throw new Error('Dodo balance response did not include available balance.')
	return balance
}

async function main() {
	const opts = parseArgs(process.argv.slice(2))
	const env = { ...readEnvFile(opts.envFile), ...process.env }
	for (const [key, value] of Object.entries(env)) process.env[key] = value
	process.env.BETTERPPTX_DODO_ENVIRONMENT = 'test'
	process.env.BETTERPPTX_DODO_API_BASE = 'https://test.dodopayments.com'
	const customerId = firstString(process.env.BETTERPPTX_DODO_TEST_CUSTOMER_ID)
	const creditId = firstString(process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID, process.env.BETTERPPTX_DODO_TEST_CREDIT_ENTITLEMENT_ID)
	if (!customerId) throw new Error('BETTERPPTX_DODO_TEST_CUSTOMER_ID is missing.')
	if (!creditId) throw new Error('Dodo credit entitlement id is missing.')
	const before = await getBalance(creditId, customerId)
	await dodoFetchJson(`/credit-entitlements/${encodeURIComponent(creditId)}/balances/${encodeURIComponent(customerId)}/ledger-entries`, {
		method: 'POST',
		body: {
			entry_type: 'credit',
			amount: String(opts.amount),
			description: 'BetterPPTX MC3 test-mode evidence credit grant',
			idempotency_key: opts.idempotencyKey,
		},
	})
	if (opts.waitMs) await wait(opts.waitMs)
	const after = await getBalance(creditId, customerId)
	console.log(`DODO TEST CREDIT GRANT: PASS amount=${opts.amount} balanceBefore=${before} balanceAfter=${after} idempotencyKey=${opts.idempotencyKey}`)
}

main().catch(err => {
	console.error(`DODO TEST CREDIT GRANT: FAIL - ${err?.message || err}`)
	process.exit(1)
})
