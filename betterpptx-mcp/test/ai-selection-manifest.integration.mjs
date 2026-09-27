import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher } = await import('../engine.mjs')

const reason = 'The selected editable native treatment supports the executive story, restrained theme, and compact reading density.'

function resultData(label, result) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}

test('real MCP commit and save prove required native selections in the package', async () => {
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-native-selection-mcp-'))
	const enforcement = process.env.BETTERPPTX_SELECTION_TEST_ENFORCEMENT || 'required'
	const mcp = createMcpToolDispatcher({
		sessionId: `native-selection-${Date.now()}`,
		clientInfo: { name: 'native-selection-integration', version: '1' },
		blackBox: false,
	})
	let deckId = null
	try {
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Native selection integration proof',
			authoringContract: {
				workflow: 'authoring-excellence-director-v1',
				level: 'deterministic',
				coordinateSystem: 'inches',
				layerModel: 'flat-object-array',
				objectIdentity: 'stable-names-required',
				selectionManifestPolicy: 'required-for-release-candidates',
			},
			contentStory: {
				audience: 'executive reviewers',
				outcome: 'Prove that exact native choices survive serialization.',
				remember: 'The AI chooses; the engine executes and verifies.',
			},
			visualDesign: { world: 'editorial', framing: 'Compact native proof', tone: 'clear and restrained' },
			motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
			layout: 'LAYOUT_WIDE',
			selectionManifest: {
				schemaVersion: 'betterpptx.ai-selection-manifest.v1',
				enforcement,
				selections: [
					{ slideId: 'proof', capability: 'transition', representation: 'native', coherenceReason: reason, selectors: { transitionPresetId: 'transition-ribbon-003' } },
					{ slideId: 'proof', target: 'evidence-table', capability: 'table', representation: 'native', coherenceReason: reason, selectors: { tableStylePresetId: 'table-style-001' } },
					{ slideId: 'chart-proof', target: 'evidence-chart', capability: 'chart', representation: 'native', coherenceReason: reason, selectors: { chartStyleId: 4, chartStyleModernId: 104, chartColorStyleId: 10 } },
					{
						slideId: 'smartart-proof', target: 'native-process', capability: 'smartart', representation: 'native', coherenceReason: reason,
						selectors: {
							layoutId: 'urn:microsoft.com/office/officeart/2005/8/layout/process1',
							quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1',
							colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2',
						},
					},
					{ slideId: 'effects-proof', target: 'native-wordart', capability: 'wordart', representation: 'native', coherenceReason: reason, selectors: { wordArtStylePresetId: 'wordart-style-007', textEffectPresetIds: ['text-effect-glow-003'], transform: 'textArchUp' } },
					{ slideId: 'effects-proof', target: 'native-shape', capability: 'shape', representation: 'native', coherenceReason: reason, selectors: { shapeStylePresetId: 'shape-style-001', shapeEffectPresetId: 'shape-effect-preset-001' } },
					{ slideId: 'effects-proof', target: 'native-gradient', capability: 'shape', representation: 'native', coherenceReason: reason, selectors: {}, nativeFeatures: ['gradient'] },
					{ slideId: 'text-shape-proof', target: 'native-text-shape', capability: 'shape', representation: 'native', coherenceReason: reason, selectors: { shapeStylePresetId: 'shape-style-075', shapeEffectPresetIds: ['shape-effect-shadow-002', 'shape-effect-bevel-007'] } },
				],
			},
			slides: [{
				id: 'proof', title: 'Native choices survive', role: 'proof',
				message: 'The saved package retains the exact transition and table style chosen by the AI.',
				layoutIntent: 'title-body',
				content: [
					{ kind: 'title', name: 'title', text: 'Native choices survive' },
					{
						kind: 'table-panel', name: 'evidence-table', header: ['Choice', 'Owner', 'Proof'],
						rows: [['Variant', 'AI', 'Exact ID'], ['Execution', 'Engine', 'Saved package']],
						verified: true, evidenceSource: 'deterministic integration fixture',
					},
				],
			}, {
				id: 'chart-proof', title: 'Chart choices survive', role: 'proof',
				message: 'The native chart retains the exact style and color state chosen by the AI.',
				layoutIntent: 'title-body',
				transition: { type: 'morph', option: 'byObject' },
				content: [
					{ kind: 'title', name: 'chart-title', text: 'Chart choices survive' },
					{
						kind: 'chart-panel', name: 'evidence-chart', chartType: 'bar',
						data: [{ name: 'Score', labels: ['Native', 'Editable', 'Verified'], values: [92, 96, 100] }],
						verified: true, evidenceSource: 'deterministic integration fixture',
					},
				],
			}, {
				id: 'smartart-proof', title: 'SmartArt remains native', role: 'proof',
				message: 'The process remains an editable native SmartArt object with exact layout, style, and color IDs.',
				layoutIntent: 'title-body',
				content: [
					{ kind: 'title', name: 'smartart-title', text: 'SmartArt remains native' },
					{
						kind: 'diagram', name: 'native-process',
						style: { textColorRole: 'onDark' },
						nodes: [{ text: 'Choose' }, { text: 'Execute' }, { text: 'Verify' }],
						verified: true, evidenceSource: 'deterministic integration fixture',
					},
				],
			}, {
				id: 'effects-proof', title: 'Native effects remain editable', role: 'proof',
				message: 'WordArt, shape styling, effects, and gradients are authored as native PowerPoint objects.',
				layoutIntent: 'three-column',
				content: [
					{ kind: 'title', name: 'effects-title', text: 'Native effects remain editable' },
					{ kind: 'wordart', name: 'native-wordart', text: 'NATIVE', transform: 'textArchUp', wordArtStylePresetId: 'wordart-style-007', textEffectPresetIds: ['text-effect-glow-003'], region: 'leftThird' },
					{ kind: 'shape', name: 'native-shape', shapeName: 'hexagon', shapeStylePresetId: 'shape-style-001', shapeEffectPresetId: 'shape-effect-preset-001', decorative: true, region: 'midThird' },
					{ kind: 'shape', name: 'native-gradient', shapeName: 'ellipse', decorative: true, region: 'rightThird', style: { fill: { type: 'gradient', gradientAngle: 30, gradientStops: [{ color: '2563EB', position: 0 }, { color: '7C3AED', position: 100 }] }, line: { color: 'FFFFFF', transparency: 30 } } },
				],
			}, {
				id: 'text-shape-proof', title: 'Text-shape effects survive', role: 'proof',
				message: 'A text-bearing native shape retains the AI-selected style, shadow, and bevel.',
				layoutIntent: 'title-body',
				content: [
					{ kind: 'title', name: 'text-shape-title', text: 'Text-shape effects survive' },
					{ kind: 'textShape', name: 'native-text-shape', shapeName: 'roundRect', text: 'INTRODUCE → PROVE → RESOLVE', region: 'body' },
				],
			}],
			validation: { validateBeforeSave: true, requireAccessibility: true },
		}
		const commit = resultData('commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		deckId = commit.deckId
		assert.equal(commit.selectionManifest?.status, 'AI_SELECTIONS_COMPILED')
		assert.equal(commit.selectionManifest?.compiledCount, 8)
		resultData('quality', await mcp.call('betterpptx.deck.validate_quality', {
			deckId, profile: 'static', mode: 'strict', minScore: 0, accessibilityMode: 'basic',
			requireNarration: false, requireMotion: false, requireVisualProof: false, requireExpressive3D: false,
		}))
		const saved = resultData('save', await mcp.call('betterpptx.deck.save', {
			deckId, outputDir, fileName: 'native-selection-integration.pptx', plan: 'premium',
		}))
		if (enforcement === 'required') {
			assert.equal(saved.selectionVerification?.status, 'SELECTIONS_VERIFIED_IN_PACKAGE')
			assert.equal(saved.selectionVerification?.verifiedCount, 8)
		}
		assert.ok((await fs.stat(saved.filePath)).size > 0)
		if (process.env.BETTERPPTX_SELECTION_TEST_KEEP === '1') console.log(`SELECTION_TEST_ARTIFACT=${saved.filePath}`)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
		if (process.env.BETTERPPTX_SELECTION_TEST_KEEP !== '1') await fs.rm(outputDir, { recursive: true, force: true })
	}
})

test('required release selections refuse freemium substitution before deck allocation', async () => {
	const priorPremium = process.env.BETTERPPTX_PREMIUM
	delete process.env.BETTERPPTX_PREMIUM
	try {
		const mcp = createMcpToolDispatcher({
			sessionId: `native-selection-free-${Date.now()}`,
			clientInfo: { name: 'native-selection-freemium-refusal', version: '1' },
			blackBox: false,
		})
		const result = await mcp.call('betterpptx.deck.generate_from_spec', {
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1', title: 'Required selection refusal', layout: 'LAYOUT_WIDE',
				authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', selectionManifestPolicy: 'required-for-release-candidates' },
				contentStory: { audience: 'reviewers', outcome: 'Prove exact selection refusal.', remember: 'Required native choices are never downgraded.' },
				visualDesign: { world: 'editorial', framing: 'Compact exact-choice proof', tone: 'clear' },
				motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
				selectionManifest: {
					schemaVersion: 'betterpptx.ai-selection-manifest.v1', enforcement: 'required',
					selections: [{
						slideId: 's3', target: 'hero-wordart', capability: 'wordart', representation: 'native',
						coherenceReason: reason,
						selectors: { wordArtStylePresetId: 'wordart-style-001', transform: 'textArchUp' },
					}],
				},
				slides: [
					{ id: 's1', title: 'One', layoutIntent: 'title-body', content: [{ kind: 'textBox', name: 'copy-1', text: 'First preview slide.' }] },
					{ id: 's2', title: 'Two', layoutIntent: 'title-body', content: [{ kind: 'textBox', name: 'copy-2', text: 'Second preview slide.' }] },
					{ id: 's3', title: 'Three', layoutIntent: 'title-body', content: [{ kind: 'wordart', name: 'hero-wordart', text: 'EXACT', transform: 'textArchUp', wordArtStylePresetId: 'wordart-style-001' }] },
				],
			},
		})
		assert.equal(result.ok, false)
		assert.equal(result.error?.code, 'AI_SELECTION_ENTITLEMENT_REQUIRED')
		assert.equal(result.error?.details?.status, 'selection_manifest_entitlement_required')
	} finally {
		if (priorPremium === undefined) delete process.env.BETTERPPTX_PREMIUM
		else process.env.BETTERPPTX_PREMIUM = priorPremium
	}
})

test('ordinary explicit premium controls require exact alternative authorization before downgrade', async () => {
	const priorPremium = process.env.BETTERPPTX_PREMIUM
	delete process.env.BETTERPPTX_PREMIUM
	let deckId
	try {
		const mcp = createMcpToolDispatcher({
			sessionId: `native-alternative-${Date.now()}`,
			clientInfo: { name: 'native-alternative-authorization', version: '1' },
			blackBox: false,
		})
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'Explicit alternative authorization', layout: 'LAYOUT_WIDE',
			authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
			contentStory: { audience: 'reviewers', outcome: 'Preserve authored choices.', remember: 'No silent downgrade.' },
			visualDesign: { world: 'editorial', framing: 'Exact treatment proof', tone: 'clear' },
			motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
			slides: [
				{ id: 's1', title: 'One', layoutIntent: 'title-body', content: [{ kind: 'textBox', name: 'copy-1', text: 'First preview slide.' }] },
				{ id: 's2', title: 'Two', layoutIntent: 'title-body', content: [{ kind: 'textBox', name: 'copy-2', text: 'Second preview slide.' }] },
				{ id: 's3', title: 'Three', layoutIntent: 'title-body', content: [{ kind: 'wordart', name: 'hero-wordart', text: 'EXACT', transform: 'textArchUp', wordArtStylePresetId: 'wordart-style-001' }] },
			],
		}
		const request = { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true }
		const refused = await mcp.call('betterpptx.deck.generate_from_spec', request)
		assert.equal(refused.ok, false)
		assert.equal(refused.error?.code, 'ALTERNATIVE_AUTHORIZATION_REQUIRED')
		assert.equal(refused.error?.details?.artifactState, 'not-created')
		const proposal = refused.error?.details?.proposal
		assert.match(proposal?.proposalDigest || '', /^[0-9a-f]{64}$/)
		assert.ok(proposal.changes.length > 0)

		const stale = await mcp.call('betterpptx.deck.generate_from_spec', {
			...request,
			alternativeAuthorization: { accept: true, proposalDigest: '0'.repeat(64) },
		})
		assert.equal(stale.ok, false)
		assert.equal(stale.error?.code, 'ALTERNATIVE_AUTHORIZATION_REQUIRED')

		const accepted = await mcp.call('betterpptx.deck.generate_from_spec', {
			...request,
			alternativeAuthorization: { accept: true, proposalDigest: proposal.proposalDigest },
		})
		assert.equal(accepted.ok, true, JSON.stringify(accepted.error || accepted))
		deckId = accepted.data.deckId
		assert.equal(accepted.data.freemiumEmission?.authorized, true)
		assert.equal(accepted.data.freemiumEmission?.proposalDigest, proposal.proposalDigest)
	} finally {
		if (deckId) {
			const mcp = createMcpToolDispatcher({ sessionId: `native-alternative-cleanup-${Date.now()}`, blackBox: false })
			await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
		}
		if (priorPremium === undefined) delete process.env.BETTERPPTX_PREMIUM
		else process.env.BETTERPPTX_PREMIUM = priorPremium
	}
})
