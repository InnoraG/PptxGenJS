import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { after, test } from 'node:test'

for (const name of Object.keys(process.env)) if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-free-publication-http-'))
Object.assign(process.env, {
	BETTERPPTX_AUTH: 'none',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_BILLING_PROVIDER: 'none',
	BETTERPPTX_BILLING_MODEL: 'free_publication',
	BETTERPPTX_BILLING_ENFORCE: '1',
	BETTERPPTX_MONETIZED_MCP_ENABLED: '0',
	BETTERPPTX_X402_STORE: 'local',
	BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local',
	BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(directory, 'leases'),
	BETTERPPTX_X402_FILE: path.join(directory, 'quotes.json'),
	BETTERPPTX_BILLING_LEDGER_FILE: path.join(directory, 'ledger.json'),
	BETTERPPTX_INSTALL_USAGE_STORE: 'local',
	BETTERPPTX_ENTITLEMENT_STORE: 'local',
	BETTERPPTX_ASSET_GRANT_STORE: 'local',
	BETTERPPTX_INSTALL_HMAC_SECRET: 'test-only-free-publication-install-secret',
})

const { startBetterPptxHttp } = await import('../server-http.mjs')
const nativeFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
	if (!url.startsWith('http://127.0.0.1:')) throw new Error('External network forbidden in free-publication HTTP tests.')
	return nativeFetch(input, init)
}

after(() => fs.rmSync(directory, { recursive: true, force: true }))

test('free-publication HTTP deployment rejects all payment entry points without side effects', async () => {
	const started = await startBetterPptxHttp({
		host: '127.0.0.1',
		port: 0,
		open: true,
		downloadRoot: path.join(directory, 'downloads'),
	})
	try {
		const port = started.httpServer.address().port
		for (const request of [
			{ method: 'GET', path: '/payments/wallet-balance/0x4000000000000000000000000000000000000001' },
			{ method: 'GET', path: '/fund-wallet' },
			{ method: 'GET', path: '/pay/orders/new' },
			{ method: 'POST', path: '/pay/x402/credit-packs/starter_500' },
		]) {
			const response = await nativeFetch(`http://127.0.0.1:${port}${request.path}`, {
				method: request.method,
				headers: { 'content-type': 'application/json' },
				body: request.method === 'POST' ? '{}' : undefined,
			})
			const payload = await response.json()
			assert.equal(response.status, 410, `${request.method} ${request.path} must stay unavailable in free-publication mode: ${JSON.stringify(payload)}`)
			assert.equal(payload.error.code, 'PAYMENT_NOT_CONFIGURED')
		}
		assert.equal(fs.existsSync(path.join(directory, 'ledger.json')), false, 'A rejected payment route must not create a billing ledger.')
	} finally {
		await new Promise(resolve => started.httpServer.close(resolve))
	}
})
