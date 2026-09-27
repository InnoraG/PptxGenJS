import { appendFileSync } from 'node:fs'
import path from 'node:path'

const [mode, directory, keyId = 'same-relayer'] = process.argv.slice(2)
for (const name of Object.keys(process.env)) if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
Object.assign(process.env, {
	BETTERPPTX_X402_STORE: 'local', BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_X402_FILE: path.join(directory, 'quotes.json'), BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(directory, 'leases'),
	BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local', BETTERPPTX_X402_RELAYER_LEASE_WAIT_MS: '2000',
	BETTERPPTX_TREASURY_EVM_ADDRESS: '0x4000000000000000000000000000000000000001',
})
globalThis.fetch = async () => { throw new Error('Network forbidden in process fixture') }

if (mode === 'quotes') {
	const { createX402QuoteStore } = await import('../../billing/x402-packs.mjs')
	const store = createX402QuoteStore()
	const results = []
	for (let index = 0; index < 5; index++) results.push((await store.createQuote({ installHash: `fixture-${keyId}-${index}`, packId: 'starter_500' })).quoteId)
	try { await store.createQuote({ installHash: `fixture-${keyId}`, packId: 'starter_500', envelopeJti: 'shared-envelope' }); results.push('envelope-created') }
	catch (error) { if (error.code !== 'PAYMENT_ENVELOPE_REPLAYED') throw error }
	process.stdout.write(JSON.stringify({ results }))
} else {
	const { withX402BroadcastOnce } = await import('../../billing/relayer-lease.mjs')
	try {
		const result = await withX402BroadcastOnce({ keyId, authorizationId: 'fixture-authorizer-and-nonce', quoteId: 'fixture-quote' }, async () => {
			appendFileSync(path.join(directory, 'broadcasts.txt'), 'broadcast\n')
			if (mode === 'crash') process.exit(0)
			if (mode === 'ambiguous') throw Object.assign(new Error('Fake connection loss after acceptance'), { code: 'FIXTURE_AMBIGUOUS' })
			await new Promise(resolve => setTimeout(resolve, 40))
			return `0x${'12'.repeat(32)}`
		})
		process.stdout.write(JSON.stringify({ state: result.state, txHash: result.txHash || null }))
	} catch (error) { process.stdout.write(JSON.stringify({ error: error.code || 'FIXTURE_ERROR' })) }
}
