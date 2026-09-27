import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')

function smartArtSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native SmartArt text-polarity proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: {
			audience: 'presentation quality reviewers',
			outcome: 'Require an explicit text-polarity choice for selected native SmartArt.',
			remember: 'The AI chooses text colour; the engine validates and executes.',
		},
		handshake: {
			audience: 'presentation quality reviewers',
			promise: 'Keep selected native SmartArt readable without delegating colour judgment.',
			proof: ['Every visible native node has an explicit text-polarity decision.'],
			bar: 'The dry-run blocks unresolved node polarity before commit.',
		},
		visualDesign: { world: 'Dark civic decision brief', framing: 'One accountable process', tone: 'clear' },
		styleIntent: { artDirection: 'meridian', mode: 'dark' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'smartart-polarity',
			title: 'Selected native SmartArt needs an authored text decision',
			message: 'Theme-linked native fills require an explicit AI-authored text-polarity choice.',
			role: 'process',
			layoutIntent: 'process-flow',
			content: [
				{ kind: 'title', name: 'smartart-title', text: 'Selected native SmartArt needs an authored text decision' },
				{
					kind: 'smartart', name: 'decision-path', mode: 'native', layout: 'process',
					quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1',
					colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2',
					nodes: [{ text: 'Frame' }, { text: 'Choose' }, { text: 'Verify' }],
					verified: true, evidenceSource: 'deterministic public verifier fixture',
				},
			],
		}],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
}

function finding(result) {
	return result?.error?.details?.errors?.find(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED')
}

test('public dry-run and commit block selected native SmartArt with unresolved text polarity', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `smartart-polarity-block-${Date.now()}`,
		clientInfo: { name: 'smartart-polarity-verifier', version: '1' },
		blackBox: true,
	})
	const spec = smartArtSpec()
	const dryRun = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	const commit = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', detail: 'full' })
	for (const result of [dryRun, commit]) {
		const issue = finding(result)
		assert.equal(result?.ok, false)
		assert.equal(issue?.severity, 'error')
		assert.equal(issue?.evidence?.decisionAuthority, 'AI')
		assert.equal(issue?.evidence?.engineAction, 'block-without-selecting')
		assert.equal(issue?.evidence?.unresolvedNodeCount, 3)
		assert.deepEqual(issue?.evidence?.unresolvedNodePaths, ['nodes[0]', 'nodes[1]', 'nodes[2]'])
		assert.equal(Object.hasOwn(issue || {}, 'suggestions'), false)
		assert.equal(result?.deckId, undefined)
	}
	assert.equal(dryRun?.error?.next_actions?.[0]?.type, 'choose_smartart_text_polarity')
	assert.equal(dryRun?.error?.next_actions?.[0]?.tool, 'betterpptx.deck.generate_from_spec')
})

test('public dry-run accepts explicit whole-diagram or complete per-node AI decisions', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `smartart-polarity-authored-${Date.now()}`,
		clientInfo: { name: 'smartart-polarity-verifier', version: '1' },
		blackBox: true,
	})
	const topLevel = smartArtSpec()
	topLevel.slides[0].content[1].style = { textColorRole: 'onDark' }
	const perNode = smartArtSpec()
	perNode.slides[0].content[1].nodes = [
		{ text: 'Frame', textColorRole: 'onDark' },
		{ text: 'Choose', color: 'FFFFFF' },
		{ text: 'Verify', textColorRole: 'onAccent' },
	]
	for (const authored of [topLevel, perNode]) {
		const result = await mcp.call('betterpptx.deck.generate_from_spec', { spec: authored, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
		assert.equal(result?.ok, true, JSON.stringify(result))
		const data = result.data || result
		assert.equal([...(data.errors || []), ...(data.warnings || [])].some(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED'), false)
		assert.equal(data.mutationFree, true)
		assert.equal(data.deckId, undefined)
	}
})
