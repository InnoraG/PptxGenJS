// Regressions for the talking-head dead end and the error messages that cost a
// blind AI client most of its retries (second blind test, 2026-10-23).
import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')
const { publicAvatarJobError } = await import('../avatar/jobs.mjs')
const { applyPresenterRepresentationPolicy } = await import('../ir/presenter-contract.mjs')
const { resolveAuthoringMotionSelectionForCatalog } = await import('../ir/authoring-motion-catalog.mjs')
const { slideHasExplicitNarration } = await import('../ir/spec-compiler.mjs')
const { buildNarrationCueLedger, narrationCueLedgerWarnings } = await import('../ir/narration-contract.mjs')

const AUTHORING_CONTRACT = { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' }

function dispatcher(label, blackBox = false) {
	return createMcpToolDispatcher({
		sessionId: `blind-client-presenter-${label}-${Date.now()}`,
		clientInfo: { name: 'blind-client-presenter-avatar-regressions', version: '1' },
		blackBox,
		__skipDurableOperationLedger: true,
		__skipDurableDeckPersistence: true,
	})
}

function deckSpec(extra = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Talking head route check',
		layout: 'LAYOUT_WIDE',
		authoringContract: AUTHORING_CONTRACT,
		slides: [{ id: 'close', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'headline', text: 'Thanks for watching', rect: { x: 0.8, y: 0.8, w: 7.5, h: 1 }, options: { fontSize: 40, bold: true } }] }],
		...extra,
	}
}

async function createDeck(mcp) {
	const created = await mcp.call('betterpptx.deck.generate_from_spec', { spec: deckSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true })
	assert.equal(created.ok, true, JSON.stringify(created.error))
	return created.data.deckId
}

test('the standalone avatar tools are not part of the MCP surface; the spec renders talking heads', { timeout: 120000 }, async () => {
	const mcp = dispatcher('folded-avatar')
	for (const name of ['betterpptx.avatar.render_job', 'betterpptx.avatar.job_status', 'betterpptx.avatar.attach_result']) {
		const result = await mcp.call(name, {})
		assert.equal(result.ok, false, name)
		assert.match(JSON.stringify(result.error), /generate_from_spec/, name)
	}
})

async function inPublicMode(run) {
	const previous = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try {
		return await run()
	} finally {
		process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previous
	}
}

test('the avatar recipe renders in phase resolve and commits the locked spec', async () => {
	const recipe = await inPublicMode(() => dispatcher('recipe', true).call('betterpptx.help.tool_recipe', { surface: 'avatar', detail: 'full' }))
	assert.equal(recipe.ok, true, JSON.stringify(recipe.error))
	const avatar = recipe.data.recipes.find(item => item.surface === 'avatar')
	const resolveStep = avatar.sequence.find(step => step.step === 8)
	assert.equal(resolveStep.tool, 'betterpptx.deck.generate_from_spec')
	assert.equal(resolveStep.request.phase, 'resolve')
	const commitStep = avatar.sequence.find(step => step.step === 10)
	assert.equal(commitStep.request.phase, 'commit')
	assert.equal(avatar.attachment.specField, 'slides[].avatarNarration')
	assert.doesNotMatch(JSON.stringify(avatar.sequence), /avatar\.(render_job|job_status|attach_result)/)
})

test('failed avatar jobs say why and what to do next', () => {
	const licensed = publicAvatarJobError('AVATAR_LICENSE_REVIEW_REQUIRED')
	assert.notEqual(licensed.message, 'Avatar job failed.')
	assert.match(licensed.message, /not enabled/)
	assert.match(licensed.fix, /narration/)
	assert.deepEqual(publicAvatarJobError('SETTLEMENT_UNKNOWN'), { code: 'SETTLEMENT_UNKNOWN', message: 'Avatar job failed.' }, 'unknown failures stay generic')
})

test('presenter.onSlides accepts slide ids and names an unknown entry', () => {
	const spec = onSlides => ({
		presenter: { id: 'host', model: 'gen://rigged3d/example', onSlides },
		slides: [{ id: 'opener', content: [] }, { id: 'compare', content: [] }, { id: 'close', content: [] }],
	})
	assert.deepEqual(applyPresenterRepresentationPolicy(spec(['opener', 'close'])).presenter.onSlides, [0, 2])
	assert.deepEqual(applyPresenterRepresentationPolicy(spec([0, 'compare'])).presenter.onSlides, [0, 1])
	assert.throws(() => applyPresenterRepresentationPolicy(spec(['opener', 'missing'])), error => {
		assert.equal(error.code, 'PRESENTER_ON_SLIDES_INVALID')
		assert.equal(error.field, 'presenter.onSlides')
		assert.match(error.message, /"missing"/)
		assert.match(error.message, /opener, compare, close/)
		return true
	})
})

test('motion selection errors name the motion', () => {
	// Which rows are held depends on the runtime provider policy and local proof
	// ledgers, so use a fixed catalog rather than the environment's.
	const catalog = { catalogVersion: 'test', catalogFingerprint: 'test', sourceResolutionFingerprint: 'test', records: [
		{ motionId: 'motion.ordinary.held', selectable: false },
		{ motionId: 'motion.ordinary.present', selectable: true },
	] }
	const result = resolveAuthoringMotionSelectionForCatalog(catalog, ['motion.ordinary.held', 'motion.ordinary.nope', 'motion.ordinary.present'])
	const notExecutable = result.errors.find(error => error.code === 'MOTION_NOT_EXECUTABLE')
	assert.match(notExecutable.reason, /^motion\.ordinary\.held /)
	assert.equal(result.errors.some(error => error.motionId === 'motion.ordinary.present'), false)
	assert.match(result.errors.find(error => error.code === 'MOTION_ID_UNKNOWN').reason, /^motion\.ordinary\.nope /)
})

test('an unsupported art direction lists the supported Worlds', { timeout: 120000 }, async () => {
	const mcp = dispatcher('art-direction')
	const dry = await mcp.call('betterpptx.deck.generate_from_spec', { spec: deckSpec({ styleIntent: { artDirection: 'product-launch', mode: 'dark' } }), phase: 'dryRun', commitMode: 'createNew' })
	assert.equal(dry.ok, false)
	const finding = dry.error.details.errors.find(error => error.code === 'ART_DIRECTION_UNSUPPORTED')
	assert.match(finding.message, /"product-launch"/)
	assert.match(finding.message, /aurora/)
	assert.ok(finding.evidence.supported.includes('editorial'))
})

test('research-only presenter identities are not advertised and fail by field in public mode', { timeout: 120000 }, async () => {
	const generate = TOOLS.find(item => item.name === 'betterpptx.deck.generate_from_spec')
	assert.equal(JSON.stringify(generate.inputSchema).includes('"mena"'), false, 'mena is not in the public identity enum')
	const spec = deckSpec({ presenter: { id: 'host', identity: 'mena', rect: { x: 1.6, y: 2.4, w: 2.6, h: 4.6 } } })
	const dry = await inPublicMode(() => dispatcher('identity', true).call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew' }))
	assert.equal(dry.ok, false)
	const finding = dry.error.details.errors.find(error => error.code === 'PRESENTER_IDENTITY_UNAVAILABLE')
	assert.ok(finding, JSON.stringify(dry.error))
	assert.match(finding.message, /^presenter\.identity "mena"/)
	assert.match(finding.message, /joe, louise, pete/)
})

test('prepared narration counts as authored narration for the performance clock', () => {
	assert.equal(slideHasExplicitNarration({ narration: { preparedNarration: { manifestHandle: 'asset://locked/narration-preparation/x.json', slideId: 's' } } }), true)
	assert.equal(slideHasExplicitNarration({ narration: { cues: [] } }), false)
})

test('narration cues that animate nothing produce a dry-run warning; objectName works as target', () => {
	const ledger = buildNarrationCueLedger({
		slides: [{
			id: 'opener',
			content: [{ kind: 'textBox', name: 'headline' }, { kind: 'textBox', name: 'tagline' }],
			narration: { text: 'Hello.', cues: [{ id: 'cue-greet', atMs: 0 }, { id: 'cue-tag', atMs: 900, objectName: 'tagline' }, { id: 'cue-lost', atMs: 1200, target: 'nowhere' }, { atPhrase: 'Hello' }] },
		}],
	})
	assert.equal(ledger.resolvedCueTargets, 1, 'objectName resolves like target')
	assert.equal(ledger.untargetedCues, 1, 'only the bare time marker is untargeted')
	const warnings = narrationCueLedgerWarnings(ledger)
	assert.equal(warnings.length, 2)
	assert.ok(warnings.every(warning => warning.code === 'NARRATION_CUE_TARGET_MISSING'))
	assert.match(warnings[0].message, /cue-greet/)
	assert.match(warnings[1].message, /nowhere/)
})
