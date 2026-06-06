#!/usr/bin/env node
// Private maintainer utility: read Dodo test-mode balance and ledger totals without printing IDs or secrets.

import fs from 'node:fs'
import path from 'node:path'

import { dodoFetchJson } from './billing/dodo-client.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = process.platform === 'win32' && here.startsWith('/') ? here.slice(1) : here
const defaultEnvFile = path.join(root, '.betterpptx-mcp-runtime', 'dodo-local.env')

function usage() {
	console.log(`Usage:
node betterpptx-mcp/dodo-test-billing-snapshot.mjs [options]

Options:
  --env-file <path>     Private Dodo env file. Default: betterpptx-mcp/.betterpptx-mcp-runtime/dodo-local.env.
  --start-date <iso>    Optional ledger start date.
  --end-date <iso>      Optional ledger end date.
  --page-size <n>       Ledger page size. Default: 100, max: 100.
  --pages <n>           Max pages to scan. Default: 10.
`)
}

function parseArgs(argv) {
	const opts = { envFile: defaultEnvFile, startDate: '', endDate: '', pageSize: 100, pages: 10 }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--env-file' && argv[i + 1]) { opts.envFile = path.resolve(argv[++i]); continue }
		if (arg === '--start-date' && argv[i + 1]) { opts.startDate = String(argv[++i]).trim(); continue }
		if (arg === '--end-date' && argv[i + 1]) { opts.endDate = String(argv[++i]).trim(); continue }
		if (arg === '--page-size' && argv[i + 1]) { opts.pageSize = Math.max(1, Math.min(100, Number(argv[++i]) || 100)); continue }
		if (arg === '--pages' && argv[i + 1]) { opts.pages = Math.max(1, Math.min(100, Number(argv[++i]) || 10)); continue }
		if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
		throw new Error(`Unknown argument: ${arg}`)
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

async function getBalance(creditId, customerId) {
	const response = await dodoFetchJson(`/credit-entitlements/${encodeURIComponent(creditId)}/balances/${encodeURIComponent(customerId)}`)
	const balance = extractBalance(response.data)
	if (balance === null) throw new Error('Dodo balance response did not include available balance.')
	return balance
}

async function listLedgerEntries({ creditId, customerId, startDate, endDate, pageSize, pages }) {
	const out = []
	for (let page = 0; page < pages; page++) {
		const query = new URLSearchParams({ page_size: String(pageSize), page_number: String(page) })
		if (startDate) query.set('start_date', startDate)
		if (endDate) query.set('end_date', endDate)
		const response = await dodoFetchJson(`/credit-entitlements/${encodeURIComponent(creditId)}/balances/${encodeURIComponent(customerId)}/ledger?${query}`)
		const items = Array.isArray(response.data?.items) ? response.data.items : []
		out.push(...items)
		if (items.length < pageSize) break
	}
	return out
}

function summarizeLedger(items) {
	const summary = {
		count: items.length,
		byType: {},
		debitCount: 0,
		debitTotal: 0,
		creditCount: 0,
		creditTotal: 0,
		firstAt: null,
		lastAt: null,
		balanceAfterLatest: null,
	}
	for (const entry of items) {
		const type = String(entry.transaction_type || entry.transactionType || 'unknown')
		const amount = Number(entry.amount || 0)
		const createdAt = String(entry.created_at || entry.createdAt || '')
		summary.byType[type] = (summary.byType[type] || 0) + 1
		if (entry.is_credit === true) {
			summary.creditCount++
			if (Number.isFinite(amount)) summary.creditTotal += amount
		} else {
			summary.debitCount++
			if (Number.isFinite(amount)) summary.debitTotal += amount
		}
		if (createdAt && (!summary.firstAt || createdAt < summary.firstAt)) summary.firstAt = createdAt
		if (createdAt && (!summary.lastAt || createdAt > summary.lastAt)) {
			summary.lastAt = createdAt
			const balanceAfter = Number(entry.balance_after ?? entry.balanceAfter)
			summary.balanceAfterLatest = Number.isFinite(balanceAfter) ? balanceAfter : null
		}
	}
	summary.debitTotal = Number(summary.debitTotal.toFixed(2))
	summary.creditTotal = Number(summary.creditTotal.toFixed(2))
	return summary
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
	const [availableBalanceCredits, ledger] = await Promise.all([
		getBalance(creditId, customerId),
		listLedgerEntries({ creditId, customerId, ...opts }),
	])
	console.log(JSON.stringify({
		ok: true,
		environment: 'test',
		checkedAt: new Date().toISOString(),
		startDate: opts.startDate || null,
		endDate: opts.endDate || null,
		availableBalanceCredits,
		ledger: summarizeLedger(ledger),
	}, null, 2))
}

main().catch(err => {
	console.error(`DODO TEST BILLING SNAPSHOT: FAIL - ${err?.message || err}`)
	process.exit(1)
})
