import assert from 'node:assert/strict'
import test from 'node:test'
import Ajv from 'ajv'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-quote-source-parity-'))

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_ENV = 'test'
process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'test'
process.env.NODE_ENV = 'test'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
process.env.BETTERPPTX_REQUIRE_QUOTE_BINDING = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_ASSET_GRANT_STORE = 'local'
process.env.BETTERPPTX_ASSET_GRANT_DIR = path.join(fixtureRoot, 'grants')
process.env.BETTERPPTX_LOCKED_ASSET_ROOT = path.join(fixtureRoot, 'locked')
process.env.BETTERPPTX_LOCKED_ASSET_STORE = 'local'
process.env.BETTERPPTX_LOCKED_ASSET_SHARED_DIR = path.join(fixtureRoot, 'shared-locked')
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(fixtureRoot, 'ledger.json')
process.env.BETTERPPTX_INSTALL_USAGE_STORE = 'local'
process.env.BETTERPPTX_INSTALL_USAGE_FILE = path.join(fixtureRoot, 'usage.json')

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')

test.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

function authoredSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Visual-reference quote replay',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete' },
		visualReference: { schemaVersion: 'betterpptx.visual-reference-reconstruction.v1', mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'opening', title: 'Opening', content: [{ kind: 'textBox', name: 'headline', text: 'Native and exact', pixelFrame: { x: 120, y: 90, w: 900, h: 120 } }] }],
		niceties: [{ slideId: 'opening', kind: 'shape', name: 'rule', role: 'decorative', decorative: true, shapeName: 'rect', pixelFrame: { x: 120, y: 270, w: 620, h: 16 }, style: { fill: { color: '4D88FF' }, line: { transparency: 100 } }, coherenceReason: 'Observed accent rule.' }],
	}
}

test('complete visual-reference quote binding validates and replays unchanged', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `visual-quote-${Date.now()}`, blackBox: true })
	const spec = authoredSpec()
	const estimate = await mcp.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec',
		toolArgs: { spec, plan: 'premium' },
	})
	assert.equal(estimate.ok, true, JSON.stringify(estimate.error || estimate))
	const binding = estimate.data.quoteBinding
	assert.equal(binding.quoteSchemaVersion, 'betterpptx.premium-quote.v1')

	const generate = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	const estimateTool = TOOLS.find(tool => tool.name === 'betterpptx.billing.estimate')
	assert.deepEqual(
		estimateTool.outputSchema.properties.data.properties.quoteBinding,
		generate.inputSchema.properties.quoteBinding,
		'quote issuer output and commit consumer input must share one schema',
	)
	const validate = new Ajv({ allErrors: true, strict: false }).compile(generate.inputSchema)
	assert.equal(validate({ spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, quoteBinding: binding }), true, JSON.stringify(validate.errors))

	const commit = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'premium',
		billingConfirmed: true,
		quoteBinding: binding,
	})
	assert.equal(commit.ok, true, JSON.stringify(commit.error || commit))
	assert.equal(commit.data.billing.quoteId, binding.quoteId)
	await mcp.call('betterpptx.deck.dispose', { deckId: commit.data.deckId })
})

test('issued quote binding can be verified mutation-free and a protected-field change is rejected', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `visual-quote-preflight-${Date.now()}`, blackBox: true })
	const spec = authoredSpec()
	const estimate = await mcp.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec',
		toolArgs: { spec, plan: 'premium' },
	})
	assert.equal(estimate.ok, true, JSON.stringify(estimate.error || estimate))
	const binding = structuredClone(estimate.data.quoteBinding)
	const accepted = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		plan: 'premium',
		quoteBinding: binding,
	})
	assert.equal(accepted.ok, true, JSON.stringify(accepted.error || accepted))
	assert.equal(accepted.data.phase, 'dryRun')
	assert.equal(accepted.data.deckId ?? null, null)
	assert.deepEqual(binding, estimate.data.quoteBinding)

	const tampered = structuredClone(binding)
	tampered.planDigest = `${tampered.planDigest}-tampered`
	const rejected = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		plan: 'premium',
		quoteBinding: tampered,
	})
	assert.equal(rejected.ok, false)
	assert.equal(rejected.error.code, 'QUOTE_BINDING_MISMATCH')
	assert.deepEqual(rejected.error.details.mismatchedFields, ['planDigest'])
	assert.equal(rejected.data?.deckId ?? null, null)
})

test('uploaded and inline specifications produce the same executable quote identity', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `uploaded-quote-${Date.now()}`, installHash: `install_${'7'.repeat(64)}`, blackBox: true })
	const spec = authoredSpec()
	const uploaded = await mcp.call('betterpptx.assets.upload', {
		kind: 'jsonSpec',
		data: `data:application/json;base64,${Buffer.from(JSON.stringify(spec)).toString('base64')}`,
	})
	assert.equal(uploaded.ok, true, JSON.stringify(uploaded.error || uploaded))
	const specHandle = uploaded.data.handle

	const inline = await mcp.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec',
		toolArgs: { spec, plan: 'premium' },
	})
	const byHandle = await mcp.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec',
		toolArgs: { specHandle, plan: 'premium' },
	})
	assert.equal(inline.ok, true, JSON.stringify(inline.error || inline))
	assert.equal(byHandle.ok, true, JSON.stringify(byHandle.error || byHandle))
	for (const field of ['specDigest', 'estimatedPlanDigest', 'planDigest', 'pricingInputDigest', 'quoteId', 'quoteBindingDigest']) {
		assert.equal(byHandle.data[field], inline.data[field], field)
	}
	assert.equal(byHandle.data.readyForExecution, true)
	assert.equal(byHandle.data.quoteReadiness, 'ready-for-authorization')
	assert.ok(byHandle.data.quoteBinding)

	const commit = await mcp.call('betterpptx.deck.generate_from_spec', {
		specHandle,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'premium',
		billingConfirmed: true,
		quoteBinding: byHandle.data.quoteBinding,
	})
	assert.equal(commit.ok, true, JSON.stringify(commit.error || commit))
	await mcp.call('betterpptx.deck.dispose', { deckId: commit.data.deckId })

	const conflict = structuredClone(spec)
	conflict.title = 'Different inline content'
	const ambiguous = await mcp.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec',
		toolArgs: { spec: conflict, specHandle, plan: 'premium' },
	})
	assert.equal(ambiguous.ok, false)
	assert.equal(ambiguous.error.code, 'SPEC_SOURCE_AMBIGUOUS')
})
