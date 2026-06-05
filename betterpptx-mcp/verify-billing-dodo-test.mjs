import * as fs from 'node:fs'
import * as path from 'node:path'

import { dodoFetchJson } from './billing/dodo-client.mjs'
import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'
import { flushQueuedUsageEvents } from './billing/usage-events.mjs'

function fail(message, details = {}) {
	const err = new Error(message)
	err.details = details
	throw err
}

function expect(condition, message, details = {}) {
	if (!condition) fail(message, details)
}

function readEnvFile(file) {
	if (!fs.existsSync(file)) return {}
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

function extractItems(data) {
	if (Array.isArray(data)) return data
	for (const key of ['items', 'data', 'results', 'subscriptions']) {
		if (Array.isArray(data?.[key])) return data[key]
	}
	return []
}

function firstString(...values) {
	for (const value of values) {
		if (typeof value !== 'string') continue
		const trimmed = value.trim()
		if (trimmed) return trimmed
	}
	return ''
}

function hasMeterCreditLink(subscription, meterId, creditId) {
	if (!meterId || !creditId) return false
	const cart = Array.isArray(subscription?.meter_credit_entitlement_cart) ? subscription.meter_credit_entitlement_cart : []
	return cart.some(item => {
		const linkedMeterId = item.meter_id || item.meterId
		const linkedCreditId = item.credit_entitlement_id || item.creditEntitlementId
		return linkedMeterId === meterId && linkedCreditId === creditId
	})
}

async function findActiveUsageSubscription({ customerId, usageProductId, usageMeterId, creditId }) {
	const response = await dodoFetchJson(`/subscriptions?customer_id=${encodeURIComponent(customerId)}`)
	const listed = extractItems(response.data)
	const relevant = listed.filter(item => {
		const itemCustomerId = item.customer_id || item.customer?.customer_id
		const itemProductId = item.product_id || item.product?.product_id || item.product?.id
		return itemCustomerId === customerId && (!usageProductId || itemProductId === usageProductId)
	})
	const details = []
	for (const item of relevant.slice(0, 12)) {
		const subscriptionId = item.subscription_id || item.id
		if (!subscriptionId) continue
		const detail = await dodoFetchJson(`/subscriptions/${encodeURIComponent(subscriptionId)}`).then(res => res.data).catch(() => item)
		details.push(detail)
	}
	const active = details.find(detail => {
		const status = String(detail.status || '').toLowerCase()
		const productId = detail.product_id || detail.product?.product_id || detail.product?.id
		const productMatches = !usageProductId || productId === usageProductId
		return status === 'active' && productMatches && hasMeterCreditLink(detail, usageMeterId, creditId)
	})
	return {
		active,
		subscriptions: details.map(detail => ({
			subscriptionId: detail.subscription_id || detail.id || null,
			status: detail.status || null,
			productId: detail.product_id || detail.product?.product_id || detail.product?.id || null,
			hasMeterCreditLink: hasMeterCreditLink(detail, usageMeterId, creditId),
		})),
	}
}

async function getBalance(creditId, customerId) {
	const response = await dodoFetchJson(`/credit-entitlements/${encodeURIComponent(creditId)}/balances/${encodeURIComponent(customerId)}`)
	const balance = extractBalance(response.data)
	if (balance === null) throw new Error('Dodo balance response did not include available balance.')
	return balance
}

async function grantCredits(creditId, customerId, amount) {
	const idempotencyKey = `bpptx_verify_grant_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
	await dodoFetchJson(`/credit-entitlements/${encodeURIComponent(creditId)}/balances/${encodeURIComponent(customerId)}/ledger-entries`, {
		method: 'POST',
		body: {
			entry_type: 'credit',
			amount: String(amount),
			description: 'BetterPPTX test-mode billing verifier grant',
			idempotency_key: idempotencyKey,
		},
	})
}

async function wait(ms) {
	await new Promise(resolve => setTimeout(resolve, ms))
}

async function pollBalanceBelow(creditId, customerId, before, minDrop, timeoutMs) {
	const started = Date.now()
	let latest = before
	while (Date.now() - started <= timeoutMs) {
		latest = await getBalance(creditId, customerId)
		if (latest <= before - minDrop) return { ok: true, latest }
		await wait(10000)
	}
	return { ok: false, latest }
}

const here = path.dirname(new URL(import.meta.url).pathname)
const root = process.platform === 'win32' && here.startsWith('/') ? here.slice(1) : here
const privateEnv = path.join(root, '.betterpptx-mcp-runtime', 'dodo-local.env')
const env = { ...readEnvFile(privateEnv), ...process.env }
for (const [key, value] of Object.entries(env)) process.env[key] = value
process.env.BETTERPPTX_DODO_ENVIRONMENT = 'test'
process.env.BETTERPPTX_DODO_API_BASE = 'https://test.dodopayments.com'
process.env.BETTERPPTX_DODO_USAGE_EVENT_NAME ||= 'betterpptx.usage'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'

const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-dodo-test-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

const customerId = process.env.BETTERPPTX_DODO_TEST_CUSTOMER_ID
const creditId = process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID || process.env.BETTERPPTX_DODO_TEST_CREDIT_ENTITLEMENT_ID
const usageProductId = firstString(process.env.BETTERPPTX_DODO_TEST_PAID_USAGE_PRODUCT_ID, process.env.BETTERPPTX_DODO_TEST_USAGE_PRODUCT_ID, process.env.BETTERPPTX_DODO_USAGE_PRODUCT_ID, process.env.BETTERPPTX_DODO_STARTER_PRODUCT_ID)
const usageMeterId = firstString(process.env.BETTERPPTX_DODO_TEST_USAGE_METER_ID, process.env.BETTERPPTX_DODO_USAGE_METER_ID)
expect(Boolean(process.env.DODO_PAYMENTS_API_KEY || process.env.BETTERPPTX_DODO_API_KEY), 'Dodo test API key is not configured in the private env file.', {})
expect(Boolean(customerId), 'BETTERPPTX_DODO_TEST_CUSTOMER_ID is missing. Run dodo-admin-bootstrap first.', {})
expect(Boolean(creditId), 'Dodo credit entitlement id is missing. Run dodo-test-billing-bootstrap first.', {})
expect(Boolean(usageProductId), 'Dodo usage-based starter product id is missing. Run dodo-test-billing-bootstrap first.', {})
expect(Boolean(usageMeterId), 'Dodo usage meter id is missing. Run dodo-test-billing-bootstrap first.', {})

const usageSubscription = await findActiveUsageSubscription({ customerId, usageProductId, usageMeterId, creditId })
expect(Boolean(usageSubscription.active), 'Dodo test customer has no active checkout-authorized usage-credit subscription yet.', {
	usageProductId,
	usageMeterId,
	creditId,
	checkoutUrl: process.env.BETTERPPTX_DODO_TEST_USAGE_CHECKOUT_URL || process.env.BETTERPPTX_DODO_TEST_PAID_USAGE_CHECKOUT_URL || process.env.BETTERPPTX_DODO_TEST_SUBSCRIPTION_CHECKOUT_URL || null,
	subscriptions: usageSubscription.subscriptions,
})

let before = await getBalance(creditId, customerId).catch(async err => {
	await grantCredits(creditId, customerId, 100)
	await wait(5000)
	return getBalance(creditId, customerId)
})
if (before < 10) {
	await grantCredits(creditId, customerId, 100)
	await wait(5000)
	before = await getBalance(creditId, customerId)
}
expect(before >= 1, 'Dodo test customer balance is still unavailable after grant attempt.', { before })

const store = createBillingLedgerStore()
const customerHash = hashCustomerId(customerId)
await store.upsertCustomer(customerHash, {
	provider: 'dodo',
	providerCustomerId: customerId,
	creditEntitlementId: creditId,
	billingStatus: 'active',
	lastKnownDodoAvailableBalanceCredits: before,
	lastBalanceSyncedAt: new Date().toISOString(),
})
const eventId = `bpptx_usage_dodo_test_${Date.now().toString(36)}`
await store.upsertUsageEvent({
	eventId,
	customerHash,
	sessionHash: 'session_dodo_test',
	deckHash: 'deck_dodo_test',
	operationId: 'operation_dodo_test',
	amountCredits: 1,
	metadata: {
		operation_group: 'billing.dodo_test',
		billing_mode: 'checkpoint',
		rate_card_version: 'verify-dodo-test',
		status: 'success',
	},
})
const flushed = await flushQueuedUsageEvents({ store, limit: 10 })
expect(flushed.ok === true && flushed.ingested === 1, 'Dodo test usage event was not accepted by the ingest API.', { flushed })

const poll = await pollBalanceBelow(creditId, customerId, before, 0.5, Number(process.env.BETTERPPTX_DODO_DEDUCTION_POLL_MS || 120000))
expect(poll.ok === true, 'Dodo accepted the usage event, but the credit balance did not deduct before the poll timeout.', {
	before,
	latest: poll.latest,
	eventId,
})

console.log(`BILLING DODO TEST: PASS customer=test-customer balanceBefore=${before} balanceAfter=${poll.latest} event=${eventId}`)
