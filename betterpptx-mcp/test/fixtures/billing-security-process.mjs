import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { createBillingLedgerStore } from '../../billing/ledger-store.mjs'

// Spawned only by the security suite, with an explicit temporary ledger path
// and an environment containing no credentials or cloud configuration.
const [file, action, id = 'child'] = process.argv.slice(2)
if (!file) throw new Error('Offline fixture path required')
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = file
const store = createBillingLedgerStore()

if (['crash-before-rename', 'crash-after-rename', 'cumulative-crash-before-rename', 'cumulative-crash-after-rename'].includes(action)) {
	const rename = fs.renameSync
	fs.renameSync = (source, target) => {
		if (action.endsWith('before-rename')) process.exit(86)
		rename(source, target)
		process.exit(86)
	}
	syncBuiltinESMExports()
	if (action.startsWith('cumulative-')) await store.creditCustomerCumulative(JSON.parse(id))
	else await store.markUsageEventIngested('usage')
} else if (action === 'cumulative-replay') {
	const result = await store.creditCustomerCumulative(JSON.parse(id))
	process.stdout.write(JSON.stringify({ creditedCredits: result.creditedCredits, totalCredits: result.totalCredits }))
} else if (action === 'reserve') {
	try {
		const result = await store.createReservation({ customerHash: 'alice', reservationId: id, operationId: `op_${id}`, amountCredits: 1 })
		process.stdout.write(JSON.stringify({ ok: true, idempotent: result.idempotent }))
	} catch (err) {
		process.stdout.write(JSON.stringify({ ok: false, code: err.code }))
	}
} else if (action === 'read') {
	try { process.stdout.write(JSON.stringify({ customer: await store.getCustomer('alice') })) }
	catch (err) { process.stdout.write(JSON.stringify({ code: err.code })) }
} else throw new Error('Unsupported offline fixture action')
