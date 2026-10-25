import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

// Launch free tier: owner-changeable allowances for deck publications (5),
// talking-head renders (1) and custom-persona renders (1), no other per-feature
// caps, and editing an existing deck as a paid service behind an owner flag.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-free-tier-plan-'))
const usageFile = path.join(root, 'usage.json')
const ownerFile = path.join(root, 'owner-config.json')
Object.assign(process.env, {
	BETTERPPTX_INSTALL_USAGE_STORE: 'local',
	BETTERPPTX_INSTALL_USAGE_FILE: usageFile,
	BETTERPPTX_OWNER_CONFIG_STORE: 'local',
	BETTERPPTX_OWNER_CONFIG_FILE: ownerFile,
	BETTERPPTX_OWNER_CONFIG_CACHE_TTL_MS: '0',
	BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'billing-ledger.json'),
	BETTERPPTX_INSTALL_HMAC_SECRET: 'test-install-secret-with-at-least-thirty-two-characters',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_FORCE_PLAN: 'free', BETTERPPTX_PREMIUM: '0',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root,
})
for (const name of ['BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW', 'BETTERPPTX_FREE_TALKING_HEADS_PER_WINDOW', 'BETTERPPTX_FREE_CUSTOM_PERSONAS_PER_WINDOW', 'BETTERPPTX_EDIT_REQUIRES_PAYMENT']) delete process.env[name]

const config = await import('../billing/free-tier-config.mjs')
const entitlements = await import('../auth/entitlements.mjs')
const { classifyBillingTool } = await import('../billing/classifier.mjs')
const { preflightBillingReservation } = await import('../billing/reservations.mjs')
const { productionBillingConfigurationProblems } = await import('../billing/security-policy.mjs')
const { createMcpToolDispatcher, withSpecIdentityMediaAllowanceForTest, reserveSpecIdentityMediaAllowanceForTest, commitSpecIdentityMediaAllowanceForTest } = await import('../engine.mjs')

test.after(() => fs.rmSync(root, { recursive: true, force: true }))

const save = 'betterpptx.deck.save'
const contextFor = label => ({ installHash: `install_${label}`, authenticated: true, sessionId: `session-${label}` })
const rollingEvents = () => {
	const store = JSON.parse(fs.readFileSync(usageFile, 'utf8'))
	return Object.values(store.rolling || {}).filter(record => record.category === 'deck-publication')
		.reduce((events, record) => events.concat(record.events.map(event => `${record.identityHash}:${event.reservationHash}:${event.committedAtMs}`)), [])
		.sort()
}
async function publish(context, key) {
	const reservation = await entitlements.reserveFreeValue(save, { idempotencyKey: key, deckId: `deck-${key}`, deckVersion: 1 }, context)
	assert.equal((await entitlements.commitFreeValue(reservation)).ok, true)
}
const setOwnerLimit = async value => {
	await config.setFreePublicationLimit(value, { actor: 'test-owner' })
	config.resetFreeTierConfigCache()
}
const setOwnerLimits = async limits => {
	await config.setFreeTierLimits(limits, { actor: 'test-owner' })
	config.resetFreeTierConfigCache()
}
const TALKING_HEAD = 'betterpptx.avatar.render_job'
const PERSONA = 'betterpptx.assets.generate_rigged3d'
const personaArgs = key => ({ imageHandles: ['asset://front', 'asset://side'], experimentalConfirmed: true, idempotencyKey: key })
const talkingHeadArgs = key => ({ avatar: { image: 'asset://face' }, script: 'Hello.', slideIndex: 0, idempotencyKey: key })

test('the default limit is 5, the environment is the fallback, and the owner document wins within 1..1000', async () => {
	fs.rmSync(ownerFile, { force: true })
	config.resetFreeTierConfigCache()
	assert.equal(await config.resolveFreePublicationLimit({ force: true }), 5)
	process.env.BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW = '12'
	assert.deepEqual((({ publicationsPerWindow, source }) => ({ publicationsPerWindow, source }))(await config.resolveFreeTierConfig({ force: true })), { publicationsPerWindow: 12, source: 'environment' })
	process.env.BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW = '1001'
	assert.equal(await config.resolveFreePublicationLimit({ force: true }), 5, 'an out-of-range fallback never widens the limit')
	process.env.BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW = '12'
	await setOwnerLimit(40)
	const resolved = await config.resolveFreeTierConfig({ force: true })
	assert.equal(resolved.publicationsPerWindow, 40)
	assert.equal(resolved.source, 'owner-config')
	assert.equal(resolved.environmentFallback, 12)
	assert.equal(entitlements.FREE_TIER_POLICY.publicationLimit, 40)
	for (const invalid of [0, 1001, 2.5, '7.5', null]) {
		await assert.rejects(config.setFreePublicationLimit(invalid), { code: 'INVALID_FREE_PUBLICATION_LIMIT' })
	}
	assert.equal(await config.resolveFreePublicationLimit({ force: true }), 40)
	delete process.env.BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW

	// Talking-head and persona renders: default 1 each, 0..1000, set independently.
	const media = await config.resolveFreeTierConfig({ force: true })
	assert.equal(media.talkingHeadsPerWindow, 1)
	assert.equal(media.customPersonasPerWindow, 1)
	process.env.BETTERPPTX_FREE_TALKING_HEADS_PER_WINDOW = '3'
	assert.equal((await config.resolveFreeTierConfig({ force: true })).talkingHeadsPerWindow, 3)
	delete process.env.BETTERPPTX_FREE_TALKING_HEADS_PER_WINDOW
	await setOwnerLimits({ customPersonasPerWindow: 0 })
	const after = await config.resolveFreeTierConfig({ force: true })
	assert.equal(after.customPersonasPerWindow, 0, 'the owner can switch a free render off')
	assert.equal(after.publicationsPerWindow, 40, 'setting one limit leaves the others as they were')
	assert.equal(after.sources.customPersonasPerWindow, 'owner-config')
	await assert.rejects(config.setFreeTierLimits({ talkingHeadsPerWindow: -1 }), { code: 'INVALID_FREE_TIER_LIMIT' })
	await assert.rejects(config.setFreeTierLimits({ talkingHeadsPerWindow: 1001 }), { code: 'INVALID_FREE_TIER_LIMIT' })
	await assert.rejects(config.setFreeTierLimits({ unknownLimit: 1 }), { code: 'INVALID_FREE_TIER_LIMIT' })
	await setOwnerLimits({ customPersonasPerWindow: 1 })
})

test('changing the limit keeps every identity\'s usage; lowering it below usage blocks without rewriting records', async () => {
	await setOwnerLimit(3)
	const alice = contextFor('alice')
	for (const key of ['a1', 'a2', 'a3']) await publish(alice, key)
	await assert.rejects(entitlements.reserveFreeValue(save, { idempotencyKey: 'a4', deckId: 'deck-a4' }, alice), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
	const before = rollingEvents()
	assert.equal(before.length, 3)

	await setOwnerLimit(5)
	const raised = await entitlements.getFreeValueStatus(save, {}, alice)
	assert.equal(raised.limit, 5)
	assert.equal(raised.used, 3, 'raising the limit does not reset consumption')
	assert.equal(raised.remaining, 2)
	assert.deepEqual(rollingEvents(), before)
	await publish(alice, 'a4')

	await setOwnerLimit(2)
	const lowered = await entitlements.getFreeValueStatus(save, {}, alice)
	assert.equal(lowered.used, 4)
	assert.equal(lowered.remaining, 0)
	assert.equal(lowered.eligible, false)
	await assert.rejects(entitlements.reserveFreeValue(save, { idempotencyKey: 'a5', deckId: 'deck-a5' }, alice), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
	assert.equal(rollingEvents().length, 4, 'lowering the limit never deletes usage records')
	// An exact replay of a committed publication still resolves after lowering.
	const replay = await entitlements.reserveFreeValue(save, { idempotencyKey: 'a1', deckId: 'deck-a1', deckVersion: 1 }, alice)
	assert.equal(replay.status, 'committed')

	await setOwnerLimit(5)
	assert.equal((await entitlements.getFreeValueStatus(save, {}, alice)).remaining, 1)
})

test('narration has no cap; talking-head and persona renders have their own owner-set allowance of 1', async () => {
	await setOwnerLimits({ publicationsPerWindow: 5, talkingHeadsPerWindow: 1, customPersonasPerWindow: 1 })
	const bob = contextFor('bob')
	for (let index = 0; index < 25; index += 1) {
		const reservation = await entitlements.reserveFreeValue('betterpptx.narration.get_voice_timing', { segments: [{ script: 'Measured narration.' }], idempotencyKey: `narration-${index}` }, bob)
		assert.equal(reservation.status, 'included')
		const gate = await preflightBillingReservation({ name: 'betterpptx.narration.get_voice_timing', args: {}, context: { __freeValueAuthorization: { category: reservation.request.category, status: reservation.status } } })
		assert.equal(gate.active, false, 'included narration never opens a paid ledger reservation')
	}
	assert.equal((await entitlements.getFreeValueStatus('betterpptx.narration.get_voice_timing', {}, bob)).limit, null)

	for (const [tool, args] of [[TALKING_HEAD, talkingHeadArgs], [PERSONA, personaArgs]]) {
		const first = await entitlements.reserveFreeValue(tool, args('one'), bob)
		assert.equal(first.status, 'reserved')
		await entitlements.commitFreeValue(first)
		await assert.rejects(entitlements.reserveFreeValue(tool, args('two'), bob), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
		assert.equal((await entitlements.reserveFreeValue(tool, args('one'), bob)).status, 'committed', 'an exact retry is not counted twice')
		const status = await entitlements.getFreeValueStatus(tool, args('status'), bob)
		assert.deepEqual([status.limit, status.used, status.remaining], [1, 1, 0])
	}
	// Raising a media limit keeps the earlier render counted; lowering to 0 blocks.
	await setOwnerLimits({ talkingHeadsPerWindow: 2 })
	assert.deepEqual((({ used, remaining }) => [used, remaining])(await entitlements.getFreeValueStatus(TALKING_HEAD, {}, bob)), [1, 1])
	await setOwnerLimits({ talkingHeadsPerWindow: 0 })
	await assert.rejects(entitlements.reserveFreeValue(TALKING_HEAD, talkingHeadArgs('three'), bob), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
	assert.equal((await entitlements.getFreeValueStatus(TALKING_HEAD, {}, bob)).used, 1)
	await setOwnerLimits({ talkingHeadsPerWindow: 1 })

	const publications = await entitlements.getFreeValueStatus(save, {}, bob)
	assert.equal(publications.used, 0, 'renders never consume deck publications')
	assert.equal(entitlements.FREE_TIER_POLICY.talkingHeadLimit, 1)
	assert.equal(entitlements.FREE_TIER_POLICY.customPersonaLimit, 1)
	assert.equal(entitlements.FREE_TIER_POLICY.otherPerFeatureLimits, 'none')
	assert.equal('narrationPreparationLimit' in entitlements.FREE_TIER_POLICY, false)
})

test('resolve-phase renders are counted when they run and replace the paid preflight for free accounts', async t => {
	await setOwnerLimits({ talkingHeadsPerWindow: 1, customPersonasPerWindow: 1 })
	process.env.BETTERPPTX_BILLING_ENFORCE = '1'
	t.after(() => { process.env.BETTERPPTX_BILLING_ENFORCE = '0' })
	const carol = contextFor('carol')
	const freeEntitlement = { plan: 'free', provider: 'crypto_credits', credits: 0, billingCustomerHash: carol.installHash, billingStatus: 'active' }
	const preflight = (name, args, context) => preflightBillingReservation({ name, args, context, billingEntitlement: freeEntitlement })

	// Without the free allowance, a free account has no credits for the render.
	await assert.rejects(preflight(PERSONA, personaArgs('no-allowance'), carol), { code: 'INSUFFICIENT_CREDITS' })

	let renders = 0
	const render = async runContext => {
		const gate = await preflight(PERSONA, personaArgs('deck-a:presenter-persona'), runContext)
		assert.equal(gate.active, false)
		assert.equal(gate.reason, 'bounded-free-value-entitlement')
		renders += 1
		return { handle: 'gen://rigged3d/abc' }
	}
	await withSpecIdentityMediaAllowanceForTest(PERSONA, personaArgs('deck-a:presenter-persona'), carol, render)
	assert.equal(renders, 1)
	assert.equal((await entitlements.getFreeValueStatus(PERSONA, personaArgs('status'), carol)).used, 1, 'counted at render time, before any save')
	// A second render in another resolve is refused before any provider work.
	await assert.rejects(withSpecIdentityMediaAllowanceForTest(PERSONA, personaArgs('deck-b:presenter-persona'), carol, render), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
	assert.equal(renders, 1)
	// The exact same resolve retried is not counted again.
	await withSpecIdentityMediaAllowanceForTest(PERSONA, personaArgs('deck-a:presenter-persona'), carol, render)
	assert.equal((await entitlements.getFreeValueStatus(PERSONA, personaArgs('status'), carol)).used, 1)

	// Talking head: reserve before the paid preflight; a failed render releases it.
	const failed = await reserveSpecIdentityMediaAllowanceForTest(TALKING_HEAD, talkingHeadArgs('deck-a:talking-head:0:'), carol)
	assert.equal((await preflight('betterpptx.slide.add_avatar_narration', { slideIndex: 0 }, failed.runContext)).active, false)
	await entitlements.releaseFreeValue(failed.reservation)
	assert.equal((await entitlements.getFreeValueStatus(TALKING_HEAD, {}, carol)).used, 0)
	const ok = await reserveSpecIdentityMediaAllowanceForTest(TALKING_HEAD, talkingHeadArgs('deck-c:talking-head:0:'), carol)
	await commitSpecIdentityMediaAllowanceForTest(ok.reservation, TALKING_HEAD)
	assert.equal((await entitlements.getFreeValueStatus(TALKING_HEAD, {}, carol)).used, 1)
	await assert.rejects(reserveSpecIdentityMediaAllowanceForTest(TALKING_HEAD, talkingHeadArgs('deck-d:talking-head:0:'), carol), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
})

test('editing an existing deck is paid with the flag on and included with it off', () => {
	const free = { sessionId: 'edit-gate-free' }
	const existing = { deckIsExisting: () => true, isDeckMutation: () => true }
	const draft = { deckIsExisting: () => false, isDeckMutation: () => true }
	const patch = { deckId: 'deck-1', phase: 'commit', commitMode: 'patch', spec: {} }
	const expectPaid = (name, args, helpers) => {
		const gate = entitlements.requireEntitlement(name, args, free, helpers)
		assert.equal(gate?.error?.code, 'REQUIRES_PAID_ENTITLEMENT', `${name} ${JSON.stringify(args)}`)
		assert.match(gate.error.message, /paid service/)
		assert.equal(gate.error.details.paidService, 'existing-deck-editing')
		assert.equal(gate.error.details.freeAlternative.commitMode, 'createNew')
	}
	for (const flag of [undefined, '1', 'true']) {
		if (flag === undefined) delete process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT
		else process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT = flag
		expectPaid('betterpptx.deck.open_uploaded', { data: 'x' }, {})
		for (const commitMode of ['patch', 'append', 'replaceDeck']) expectPaid('betterpptx.deck.generate_from_spec', { ...patch, commitMode }, existing)
		expectPaid('betterpptx.deck.generate_from_spec', { ...patch, phase: 'resolve' }, existing)
		expectPaid('betterpptx.slide.update_shape', { deckId: 'deck-1' }, existing)
		// Planning, new decks, never-saved drafts, saving and paid accounts stay open.
		assert.equal(entitlements.requireEntitlement('betterpptx.deck.generate_from_spec', { ...patch, phase: 'dryRun' }, free, existing), null)
		assert.equal(entitlements.requireEntitlement('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: {} }, free, existing), null)
		assert.equal(entitlements.requireEntitlement('betterpptx.deck.generate_from_spec', patch, free, draft), null)
		assert.equal(entitlements.requireEntitlement(save, { deckId: 'deck-1' }, free, { ...existing, isDeckMutation: () => false }), null)
		assert.equal(entitlements.FREE_TIER_POLICY.existingDeckEditing, 'paid')
		assert.equal(classifyBillingTool('betterpptx.deck.open_uploaded').category, 'heavy')
	}
	for (const flag of ['0', 'false', 'off']) {
		process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT = flag
		assert.equal(entitlements.requireEntitlement('betterpptx.deck.open_uploaded', { data: 'x' }, free, {}), null)
		assert.equal(entitlements.requireEntitlement('betterpptx.deck.generate_from_spec', patch, free, existing), null)
		assert.equal(entitlements.FREE_TIER_POLICY.existingDeckEditing, 'included')
	}
	process.env.BETTERPPTX_BILLING_MODEL = 'free_publication'
	assert.equal(classifyBillingTool('betterpptx.deck.open_uploaded').category, 'draft-accrual', 'flag off: opening an upload is free authoring')
	process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT = '1'
	assert.equal(classifyBillingTool('betterpptx.deck.open_uploaded').category, 'heavy')
	delete process.env.BETTERPPTX_BILLING_MODEL
	delete process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT
})

test('production accepts 1..1000 as the fallback limit and a boolean edit flag', () => {
	const profile = {
		NODE_ENV: 'production', BETTERPPTX_ENV: 'production', BETTERPPTX_DEPLOYMENT_STAGE: 'production',
		BETTERPPTX_BILLING_PROVIDER: 'none', BETTERPPTX_BILLING_MODEL: 'free_publication', BETTERPPTX_BILLING_ENFORCE: '1',
		BETTERPPTX_FREE_PUBLICATION_WINDOW_DAYS: '30',
	}
	for (const value of [undefined, '1', '5', '1000']) {
		assert.deepEqual(productionBillingConfigurationProblems({ ...profile, ...(value ? { BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: value } : {}) }), [])
	}
	for (const value of ['0', '1001', '2.5', 'many']) {
		assert.ok(productionBillingConfigurationProblems({ ...profile, BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: value }).includes('free-publication-limit-out-of-range'))
	}
	for (const flag of ['0', '1']) assert.deepEqual(productionBillingConfigurationProblems({ ...profile, BETTERPPTX_EDIT_REQUIRES_PAYMENT: flag }), [])
	for (const [name, problem] of [['BETTERPPTX_FREE_TALKING_HEADS_PER_WINDOW', 'free-talking-head-limit-out-of-range'], ['BETTERPPTX_FREE_CUSTOM_PERSONAS_PER_WINDOW', 'free-custom-persona-limit-out-of-range']]) {
		for (const value of ['0', '1', '1000']) assert.deepEqual(productionBillingConfigurationProblems({ ...profile, [name]: value }), [])
		for (const value of ['-1', '1001', 'one']) assert.ok(productionBillingConfigurationProblems({ ...profile, [name]: value }).includes(problem))
	}
	assert.ok(productionBillingConfigurationProblems({ ...profile, BETTERPPTX_EDIT_REQUIRES_PAYMENT: 'maybe' }).includes('edit-requires-payment-flag-invalid'))
})

function minimalSpec(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title,
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
		slides: [{ id: 'opening', title: 'Opening', content: [{ kind: 'textBox', name: 'headline', text: title, rect: { x: 1, y: 1, w: 6, h: 1 } }] }],
	}
}

async function uploadedPptx() {
	const require = createRequire(import.meta.url)
	const PptxGenJS = require('../../dist/pptxgen.cjs.js')
	const pptx = new PptxGenJS()
	pptx.addSlide().addText('Uploaded deck', { x: 1, y: 1, w: 6, h: 1 })
	const buffer = await pptx.write({ outputType: 'nodebuffer' })
	return `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${Buffer.from(buffer).toString('base64')}`
}

test('public dispatcher: auth.status reports the single counter and edits of uploaded decks are paid', async () => {
	await setOwnerLimit(7)
	const installHash = `install_${'e'.repeat(64)}`
	const mcp = createMcpToolDispatcher({ installHash, resourceIdentityHash: installHash, authenticated: true, authenticationBasis: 'oauth-access-token', sessionId: 'free-tier-dispatcher', blackBox: true })
	const status = await mcp.call('betterpptx.auth.status', {})
	assert.equal(status.ok, true, JSON.stringify(status.error || status))
	assert.equal(status.data.freeAllowances.deckPublications.limit, 7)
	assert.equal(status.data.freeAllowances.talkingHeads.limit, 1)
	assert.equal(status.data.freeAllowances.rigged3dPersonas.limit, 1)
	assert.equal(status.data.freeAllowances.narrationPreparations.limit, null)
	assert.equal(status.data.freeAllowances.otherPerFeatureLimits, 'none')
	assert.equal(status.data.freeAllowances.existingDeckEditing, 'paid')
	assert.equal(status.data.policy.publicationLimit, 7)
	assert.equal(status.data.policy.talkingHeadLimit, 1)

	const data = await uploadedPptx()
	const refused = await mcp.call('betterpptx.deck.open_uploaded', { data, fileName: 'existing.pptx' })
	assert.equal(refused.ok, false)
	assert.equal(refused.error.code, 'REQUIRES_PAID_ENTITLEMENT')
	assert.match(refused.error.message, /paid service/)

	process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT = '0'
	const opened = await mcp.call('betterpptx.deck.open_uploaded', { data, fileName: 'existing.pptx' })
	assert.equal(opened.ok, true, JSON.stringify(opened.error || opened))
	process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT = '1'
	const planned = await mcp.call('betterpptx.deck.generate_from_spec', { deckId: opened.data.deckId, phase: 'dryRun', commitMode: 'patch', spec: minimalSpec('Revised') })
	assert.notEqual(planned.error?.code, 'REQUIRES_PAID_ENTITLEMENT', 'planning an edit stays free')
	const edit = await mcp.call('betterpptx.deck.generate_from_spec', { deckId: opened.data.deckId, phase: 'commit', commitMode: 'patch', spec: minimalSpec('Revised'), idempotencyKey: 'edit-uploaded' })
	assert.equal(edit.ok, false)
	assert.equal(edit.error.code, 'REQUIRES_PAID_ENTITLEMENT')

	// A fresh, never-saved draft is part of creating a new deck: iterating on it stays free.
	const created = await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: minimalSpec('Fresh draft'), idempotencyKey: 'fresh-create' })
	assert.equal(created.ok, true, JSON.stringify(created.error || created))
	const appended = await mcp.call('betterpptx.deck.generate_from_spec', { deckId: created.data.deckId, phase: 'commit', commitMode: 'append', spec: { ...minimalSpec('Fresh draft'), slides: [{ id: 'second', title: 'Second', content: [{ kind: 'textBox', name: 'second-headline', text: 'Second', rect: { x: 1, y: 1, w: 6, h: 1 } }] }] }, idempotencyKey: 'fresh-append' })
	assert.notEqual(appended.error?.code, 'REQUIRES_PAID_ENTITLEMENT', JSON.stringify(appended.error || {}))
	delete process.env.BETTERPPTX_EDIT_REQUIRES_PAYMENT
})
