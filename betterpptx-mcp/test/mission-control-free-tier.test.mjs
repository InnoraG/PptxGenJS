import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { after, test } from 'node:test'

for (const name of Object.keys(process.env)) if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-mc-free-tier-'))
const usageFile = path.join(directory, 'usage.json')
Object.assign(process.env, {
	BETTERPPTX_AUTH: 'none',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_BILLING_PROVIDER: 'none',
	BETTERPPTX_BILLING_MODEL: 'free_publication',
	BETTERPPTX_BILLING_ENFORCE: '1',
	BETTERPPTX_X402_STORE: 'local',
	BETTERPPTX_X402_FILE: path.join(directory, 'quotes.json'),
	BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local',
	BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(directory, 'leases'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_BILLING_LEDGER_FILE: path.join(directory, 'ledger.json'),
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_INSTALL_USAGE_STORE: 'local',
	BETTERPPTX_INSTALL_USAGE_FILE: usageFile,
	BETTERPPTX_ENTITLEMENT_STORE: 'local',
	BETTERPPTX_ASSET_GRANT_STORE: 'local',
	BETTERPPTX_INSTALL_HMAC_SECRET: 'test-only-mission-control-free-tier-secret',
	BETTERPPTX_OWNER_CONFIG_STORE: 'local',
	BETTERPPTX_OWNER_CONFIG_FILE: path.join(directory, 'owner-config.json'),
	BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: '5',
	BETTERPPTX_MISSION_CONTROL: '1',
	BETTERPPTX_MISSION_CONTROL_ONLY: '1',
	BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM: '1',
})

const { startBetterPptxHttp } = await import('../server-http.mjs')
const { createInstallUsageStore } = await import('../auth/install-identity.mjs')
const { missionControlOnlyPathAllowed, renderMissionControlPage } = await import('../mission-control.mjs')

after(() => fs.rmSync(directory, { recursive: true, force: true }))

test('owner Mission Control reads and sets the free limit without touching usage records', async () => {
	const usage = createInstallUsageStore()
	const request = { category: 'deck-publication', limit: 5, windowMs: 30 * 86400000, leaseMs: 60000 }
	for (const id of ['one', 'two', 'three']) {
		await usage.reserveRollingUsage('install-owner-test', { ...request, reservationId: id })
		await usage.commitRollingUsage('install-owner-test', { ...request, reservationId: id })
	}
	const usageBefore = fs.readFileSync(usageFile, 'utf8')

	const started = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, open: true, downloadRoot: path.join(directory, 'downloads') })
	try {
		const base = `http://127.0.0.1:${started.httpServer.address().port}/ops/mission-control/free-tier`
		const json = { 'content-type': 'application/json' }
		const initial = await (await fetch(base)).json()
		assert.deepEqual({ value: initial.publicationsPerWindow, source: initial.source, store: initial.store, editing: initial.existingDeckEditing },
			{ value: 5, source: 'environment', store: 'local', editing: 'paid' })

		const unconfirmed = await fetch(base, { method: 'POST', headers: json, body: JSON.stringify({ publicationsPerWindow: 2 }) })
		assert.equal(unconfirmed.status, 400)
		const invalid = await fetch(base, { method: 'POST', headers: json, body: JSON.stringify({ publicationsPerWindow: 1001, confirm: 'SET FREE PUBLICATION LIMIT' }) })
		assert.equal(invalid.status, 400)
		assert.equal((await invalid.json()).error.code, 'INVALID_FREE_PUBLICATION_LIMIT')

		const lowered = await fetch(base, { method: 'POST', headers: json, body: JSON.stringify({ publicationsPerWindow: 2, confirm: 'SET FREE PUBLICATION LIMIT' }) })
		assert.equal(lowered.status, 200)
		const loweredView = await lowered.json()
		assert.equal(loweredView.publicationsPerWindow, 2)
		assert.equal(loweredView.source, 'owner-config')
		assert.equal(loweredView.environmentFallback, 5)
		assert.equal(fs.readFileSync(usageFile, 'utf8'), usageBefore, 'setting the limit must not rewrite usage')
		const snapshot = await usage.getRollingUsage('install-owner-test', { ...request, limit: loweredView.publicationsPerWindow })
		assert.equal(snapshot.used, 3)
		assert.equal(snapshot.remaining, 0)

		const media = await fetch(base, { method: 'POST', headers: json, body: JSON.stringify({ talkingHeadsPerWindow: 0, customPersonasPerWindow: 3, confirm: 'SET FREE PUBLICATION LIMIT' }) })
		assert.equal(media.status, 200)
		const shown = await (await fetch(base)).json()
		assert.deepEqual([shown.publicationsPerWindow, shown.talkingHeadsPerWindow, shown.customPersonasPerWindow], [2, 0, 3], 'each limit changes independently')
		assert.equal(shown.sources.talkingHeadsPerWindow, 'owner-config')
		const badMedia = await fetch(base, { method: 'POST', headers: json, body: JSON.stringify({ talkingHeadsPerWindow: -1, confirm: 'SET FREE PUBLICATION LIMIT' }) })
		assert.equal(badMedia.status, 400)
		assert.equal((await badMedia.json()).error.code, 'INVALID_FREE_TIER_LIMIT')
		assert.equal((await fetch(base.replace('/free-tier', '/free-tier-extra'))).status, 404)
	} finally {
		await started.close?.()
		started.httpServer.close()
	}
})

test('free-tier owner routes stay on the private Mission Control surface only', () => {
	assert.equal(missionControlOnlyPathAllowed('/ops/mission-control/free-tier', 'GET'), true)
	assert.equal(missionControlOnlyPathAllowed('/ops/mission-control/free-tier', 'POST'), true)
	assert.equal(missionControlOnlyPathAllowed('/ops/mission-control/free-tier/x', 'POST'), false)
	const page = renderMissionControlPage()
	assert.match(page, /<h2>Free Tier<\/h2>/)
	assert.match(page, /SET FREE PUBLICATION LIMIT/)
	assert.match(page, /id="freeTalkingHeads"/)
	assert.match(page, /id="freePersonas"/)
	// The inline owner script must stay syntactically valid.
	assert.doesNotThrow(() => new Function(page.split('<script>')[1].split('</script>')[0]))
})
