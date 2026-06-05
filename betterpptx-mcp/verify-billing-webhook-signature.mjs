import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'
import { DodoWebhookError, processDodoWebhook, verifyDodoWebhookSignature } from './billing/webhooks.mjs'

function fail(message, details = {}) {
	const err = new Error(message)
	err.details = details
	throw err
}

function expect(condition, message, details = {}) {
	if (!condition) fail(message, details)
}

async function expectWebhookError(code, fn) {
	try {
		await fn()
	} catch (err) {
		if (err instanceof DodoWebhookError || err?.code) {
			if (err.code === code) return err
		}
		throw err
	}
	fail(`Expected webhook error ${code}.`)
}

function signingKeyForSecret(secret) {
	const text = String(secret || '')
	if (!text.toLowerCase().startsWith('whsec_')) return Buffer.from(text, 'utf8')
	const encoded = text.slice(6).replace(/-/g, '+').replace(/_/g, '/')
	const padded = encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), '=')
	return Buffer.from(padded, 'base64')
}

function signedHeaders({ body, webhookId, timestamp = Math.floor(Date.now() / 1000), secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET }) {
	const ts = String(timestamp)
	const signature = crypto
		.createHmac('sha256', signingKeyForSecret(secret))
		.update(`${webhookId}.${ts}.${body}`, 'utf8')
		.digest('base64')
	const headers = {
		'content-type': 'application/json',
		'webhook-id': webhookId,
		'webhook-timestamp': ts,
		'webhook-signature': `v1,${signature}`,
	}
	if (process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_HEADER && process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_TOKEN) {
		headers[process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_HEADER] = process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_TOKEN
	}
	return headers
}

process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.DODO_PAYMENTS_WEBHOOK_SECRET = `whsec_${Buffer.from('verify_webhook_standard_secret').toString('base64')}`
process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_HEADER = 'x-betterpptx-verify-webhook-token'
process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_TOKEN = 'custom_verify_webhook_token'
const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-webhook-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

const providerCustomerId = 'cus_verify_webhook_customer'
const body = JSON.stringify({
	business_id: 'bus_verify',
	type: 'credit.added',
	timestamp: new Date().toISOString(),
	data: {
		payload_type: 'Credit',
		customer: {
			customer_id: providerCustomerId,
			email: 'customer@example.com',
			name: 'Verify Customer',
		},
		product_id: 'pdt_verify_webhook',
		subscription_id: 'sub_verify_webhook',
		payment_id: 'pay_verify_webhook',
		license_key_id: 'lic_verify_webhook',
		credit_balance: { available: '17.25' },
	},
})

const webhookId = 'evt_verify_webhook_001'
const headers = signedHeaders({ body, webhookId })
const first = await processDodoWebhook({ rawBody: body, headers })
expect(first.ok === true && first.duplicate === false, 'First signed webhook should process.', { first })
expect(first.eventType === 'credit.added', 'Webhook event type should be preserved.', { first })

const store = createBillingLedgerStore()
const customerHash = hashCustomerId(providerCustomerId)
const customer = await store.getCustomer(customerHash)
expect(customer, 'Webhook should create/update the billing customer.', { first })
expect(customer.lastKnownDodoAvailableBalanceCredits === 17.25, 'Webhook balance snapshot was not persisted.', { customer })
expect(customer.lastDodoWebhookId === webhookId, 'Webhook id was not recorded on customer.', { customer })

const duplicate = await processDodoWebhook({ rawBody: body, headers })
expect(duplicate.ok === true && duplicate.duplicate === true, 'Webhook replay should be idempotent.', { duplicate })

await expectWebhookError('DODO_WEBHOOK_SIGNATURE_INVALID', () => processDodoWebhook({
	rawBody: body,
	headers: { ...headers, 'webhook-signature': 'v1,definitely-not-valid' },
}))

await expectWebhookError('DODO_WEBHOOK_CUSTOM_SECRET_INVALID', () => processDodoWebhook({
	rawBody: body,
	headers: { ...headers, [process.env.BETTERPPTX_DODO_WEBHOOK_CUSTOM_HEADER]: 'wrong-token' },
}))

const oldTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000)
await expectWebhookError('DODO_WEBHOOK_TIMESTAMP_EXPIRED', () => processDodoWebhook({
	rawBody: body,
	headers: signedHeaders({ body, webhookId: 'evt_verify_webhook_old', timestamp: oldTimestamp }),
}))

await expectWebhookError('DODO_WEBHOOK_BODY_MISSING', () => processDodoWebhook({
	rawBody: '',
	headers: signedHeaders({ body: '', webhookId: 'evt_verify_webhook_empty' }),
}))

const legacyRawSecret = 'legacy_raw_webhook_secret'
expect(verifyDodoWebhookSignature({
	rawBody: body,
	headers: signedHeaders({ body, webhookId: 'evt_verify_webhook_raw_secret', secret: legacyRawSecret }),
	secret: legacyRawSecret,
}).ok === true, 'Raw webhook secret fallback should remain accepted for legacy tests.', {})

const ledgerText = fs.readFileSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, 'utf8')
expect(!ledgerText.includes('customer@example.com'), 'Webhook ledger should not persist customer email from raw payload.', {})
expect(!ledgerText.includes('Verify Customer'), 'Webhook ledger should not persist customer name from raw payload.', {})

const ledger = JSON.parse(ledgerText)
expect(Object.keys(ledger.webhookEvents || {}).length === 1, 'Only one processed webhook event should be stored.', { webhookEvents: ledger.webhookEvents })
expect(ledger.webhookEvents[webhookId]?.processed === true, 'Stored webhook should be marked processed.', { webhook: ledger.webhookEvents[webhookId] })

console.log(`BILLING WEBHOOK: PASS webhook=${webhookId} customer=${customerHash}`)
