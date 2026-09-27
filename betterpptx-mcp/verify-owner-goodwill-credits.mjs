import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'owner-goodwill-verify', `run-${Date.now()}-${process.pid}`)
const ledgerFile = path.join(outputDir, 'ledger.json')
const logFile = path.join(outputDir, 'http.ndjson')
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_MISSION_CONTROL = '1'
process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN = 'owner-goodwill-admin-token-for-verifier'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = ledgerFile
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_LOG = 'debug'
process.env.BETTERPPTX_LOG_FILE = logFile
delete process.env.BETTERPPTX_LOG_SECRETS

const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { startBetterPptxHttp } = await import('./server-http.mjs')
const { getBillingTelemetrySummary } = await import('./telemetry.mjs')

async function freePort() {
	const server = net.createServer()
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const port = server.address().port
	await new Promise(resolve => server.close(resolve))
	return port
}

async function jsonFetch(base, pathname, options = {}) {
	const response = await fetch(`${base}${pathname}`, {
		...options,
		headers: {
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			...(options.headers || {}),
		},
	})
	const text = await response.text()
	let data = null
	try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
	return { response, data, text }
}

const port = await freePort()
const server = await startBetterPptxHttp({
	host: '127.0.0.1',
	port,
	open: true,
	publicBase: `http://127.0.0.1:${port}`,
	downloadRoot: path.join(outputDir, 'downloads'),
})
const base = `http://127.0.0.1:${port}`
const targetHash = `install_${'a'.repeat(64)}`
const rawInstallToken = `bpptx_device_${'b'.repeat(43)}`
const adminHeaders = {
	'x-betterpptx-mission-control-admin-token': process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN,
}
const request = {
	targetHash,
	amountCredits: 12.5,
	reason: 'Owner-approved service recovery credit.',
	idempotencyKey: 'goodwill-verify-0001',
	confirm: 'CREDIT goodwill-verify-0001',
}

try {
	const denied = await jsonFetch(base, '/ops/mission-control/billing/goodwill-credit', {
		method: 'POST',
		body: JSON.stringify(request),
	})
	assert.equal(denied.response.status, 403)
	assert.equal(denied.data.error.code, 'MC_ADMIN_REQUIRED')

	const rawTokenRejected = await jsonFetch(base, '/ops/mission-control/billing/goodwill-credit', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify({ ...request, rawToken: rawInstallToken }),
	})
	assert.equal(rawTokenRejected.response.status, 400)
	assert.equal(rawTokenRejected.data.error.code, 'OWNER_GOODWILL_RAW_TOKEN_FORBIDDEN')

	const missingReason = await jsonFetch(base, '/ops/mission-control/billing/goodwill-credit', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify({ ...request, reason: '' }),
	})
	assert.equal(missingReason.response.status, 400)
	assert.equal(missingReason.data.error.code, 'OWNER_GOODWILL_REASON_REQUIRED')

	const credited = await jsonFetch(base, '/ops/mission-control/billing/goodwill-credit', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify(request),
	})
	assert.equal(credited.response.status, 200)
	assert.equal(credited.data.ok, true)
	assert.equal(credited.data.idempotent, false)
	assert.equal(credited.data.amountCredits, 12.5)
	assert.equal(credited.data.availableBalanceCredits, 12.5)
	assert(!credited.text.includes(targetHash), 'Owner action response exposed the full install hash.')
	assert(!credited.text.includes(process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN), 'Owner action response exposed the admin token.')

	const replay = await jsonFetch(base, '/ops/mission-control/billing/goodwill-credit', {
		method: 'POST',
		headers: adminHeaders,
		body: JSON.stringify(request),
	})
	assert.equal(replay.response.status, 200)
	assert.equal(replay.data.idempotent, true)
	assert.equal(replay.data.availableBalanceCredits, 12.5)
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}

const customer = await createBillingLedgerStore().getCustomer(targetHash)
assert.equal(customer.availableBalanceCredits, 12.5)
const telemetry = getBillingTelemetrySummary()
assert.equal(telemetry.creditedVolumeCredits, 12.5)
assert.equal(telemetry.creditsBySource.owner_goodwill, 12.5)

const ledgerText = fs.readFileSync(ledgerFile, 'utf8')
assert(ledgerText.includes('"source": "owner_goodwill"'))
assert(ledgerText.includes('Owner-approved service recovery credit.'))
assert(!ledgerText.includes(rawInstallToken), 'Billing ledger persisted a bearer install token.')

const logText = fs.readFileSync(logFile, 'utf8')
assert(!logText.includes(targetHash), 'Mission Control logs exposed the full install hash.')
assert(!logText.includes(rawInstallToken), 'Mission Control logs exposed a bearer install token.')
assert(!logText.includes(process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN), 'Mission Control logs exposed the owner admin token.')

console.log('OWNER GOODWILL VERIFY: PASS auth=owner hashOnly=1 idempotent=1 audited=1')
