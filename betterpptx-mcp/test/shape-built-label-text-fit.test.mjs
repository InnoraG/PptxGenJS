import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
const { shapeBuiltSmartArtTextFrames } = await import('../ir/layout-engine.mjs')

const SHORT_NODES = ['START', 'J1', 'J2', 'END']
const LONG_NODES = [
	'3RD–OAK\nProtected alignment\nTurning-conflict audit',
	'OAK–LIBRARY\nBus-island option\nWheelchair trial',
	'LIBRARY–MARKET\nLoading options\nMerchant pickup audit',
	'MARKET–RIVER\nIntersection daylighting\nTurning-count audit',
]

function shapeTimelineSpec(nodes = SHORT_NODES) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Shape-built timeline text-fit proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
			layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, staging, and balance.',
		},
		contentStory: { audience: 'public reviewers', outcome: 'Keep editable timeline labels inside their nodes.', remember: 'No label may shrink below the diagram floor.' },
		handshake: { audience: 'public reviewers', promise: 'Keep every label readable.', proof: ['Actual emitted label frames are measured before commit.'], bar: 'No label overflows its paired node.' },
		visualDesign: { world: 'Editorial', framing: 'One restrained editable timeline', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FBFBF9', '17324D', 'D97706', '2E7D5B', '5E6B78'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'corridor', title: 'Timeline fit', message: 'Every label remains inside its paired node.', role: 'evidence', layoutIntent: 'process-flow',
			content: [
				{ kind: 'title', name: 'slide-title', text: 'Timeline fit' },
				{
					kind: 'diagram', name: 'corridor-schematic', mode: 'shape', layout: 'timeline',
					customReason: 'A geographic corridor with peer markers is not a workflow and requires a restrained shape-built line.',
					style: { fill: { color: '17324D' }, line: { color: '5E6B78', pt: 1.2 }, color: 'FFFFFF', fontFace: 'Aptos', fontSize: 16 },
					nodes: nodes.map(text => ({ text })),
					verified: true, evidenceSource: 'deterministic text-fit fixture', altText: 'Four editable nodes on a corridor line.',
				},
			],
		}],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function compileErrors(result) {
	return result?.error?.details?.errors || result?.errors || []
}

function validationOptions(deckId) {
	return {
		deckId, profile: 'static', mode: 'strict', minScore: 0,
		requireNarration: false, requireMotion: false, requireVisualProof: false, requireExpressive3D: false,
	}
}

test('shape timeline geometry helper matches the emitted inner label frames', () => {
	const frames = shapeBuiltSmartArtTextFrames({ layout: 'timeline', box: { x: 0.86, y: 1.72, w: 11.613, h: 3.305 }, nodeCount: 4 })
	assert.equal(frames.length, 4)
	assert.equal(frames[0].nodeRect.w, 2.2)
	assert.equal(frames[0].nodeRect.h, 0.9)
	assert.equal(frames[0].labelRect.w, 2.04)
	assert.equal(frames[0].labelRect.h, 0.5760000000000001)
	assert.ok(frames.every(frame => frame.nodeRect.y >= 1.72 && frame.nodeRect.y + frame.nodeRect.h <= 1.72 + 3.305))
	assert.equal(frames[0].geometrySource, 'shape-built-smartart-emitter-contract')
	const compact = shapeBuiltSmartArtTextFrames({ layout: 'timeline', box: { x: 2, y: 3, w: 3.2, h: 0.8 }, nodeCount: 4 })
	assert.ok(compact.every(frame => frame.nodeRect.y >= 3 - 1e-8 && frame.nodeRect.y + frame.nodeRect.h <= 3.8 + 1e-8))
})

test('multiline shape timeline labels block precommit at the diagram floor', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `shape-built-fit-precommit-${Date.now()}`, clientInfo: { name: 'shape-built-fit-verifier', version: '1' }, blackBox: true })
	const result = await mcp.call('betterpptx.deck.generate_from_spec', { spec: shapeTimelineSpec(LONG_NODES), phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	assert.equal(result?.ok, false, JSON.stringify(result))
	const findings = compileErrors(result).filter(item => item.code === 'TEXT_OVERFLOW_RISK')
	assert.equal(findings.length, 4, JSON.stringify(compileErrors(result)))
	assert.ok(findings.every(item => item.severity === 'error' && item.evidence?.minimumFontSize === 14), JSON.stringify(findings))
	assert.ok(findings.every(item => item.evidence?.layout === 'timeline' && item.evidence?.nativeRenderReviewRequired === false), JSON.stringify(findings))
	assert.ok(findings.every(item => item.evidence?.labelRect?.w === 2.04 && item.evidence?.labelRect?.h === 0.5760000000000001), JSON.stringify(findings))
})

test('short shape timeline labels pass precommit and postcommit fit validation', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `shape-built-fit-short-${Date.now()}`, clientInfo: { name: 'shape-built-fit-verifier', version: '1' }, blackBox: true })
	let deckId = null
	try {
		const dryRun = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: shapeTimelineSpec(), phase: 'dryRun', commitMode: 'createNew', detail: 'full' }))
		assert.equal((dryRun.warnings || []).some(item => item.code === 'TEXT_OVERFLOW_RISK'), false, JSON.stringify(dryRun.warnings))
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: shapeTimelineSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckId = committed.deckId
		const design = dataOf(await mcp.call('betterpptx.deck.validate_design', validationOptions(deckId)))
		assert.equal((design.issues || []).some(item => item.code === 'TEXT_OVERFLOW_RISK' && item.evidence?.pairedShapeBuiltLabel === true), false, JSON.stringify(design.issues))
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})

test('postcommit validation catches a materialized shape label that no longer fits', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `shape-built-fit-postcommit-${Date.now()}`, clientInfo: { name: 'shape-built-fit-verifier', version: '1' }, blackBox: true })
	let deckId = null
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: shapeTimelineSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckId = committed.deckId
		const entry = getDeck(deckId)
		const backing = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === 'corridor.corridor-schematic.smartart-node-1')
		const target = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === 'corridor.corridor-schematic.smartart-label-1')
		assert.ok(backing)
		assert.ok(target)
		assert.equal(backing.options.w, 2.2)
		assert.equal(backing.options.h, 0.9)
		assert.equal(target.options.w, 2.04)
		assert.equal(target.options.h, 0.5760000000000001)
		target.text = LONG_NODES[0]
		target.options.fit = 'shrink'
		const design = dataOf(await mcp.call('betterpptx.deck.validate_design', validationOptions(deckId)))
		const finding = (design.issues || []).find(item => item.code === 'TEXT_OVERFLOW_RISK' && item.evidence?.objectName === 'corridor.corridor-schematic.smartart-label-1')
		assert.ok(finding, JSON.stringify(design.issues))
		assert.equal(finding.severity, 'error')
		assert.equal(finding.evidence?.minimumFontSize, 14)
		assert.equal(finding.evidence?.fitPolicy, 'shrink')
		assert.equal(finding.evidence?.pairedShapeBuiltLabel, true)
		assert.equal(finding.evidence?.measurementSource, 'materialized-text-frame')

		const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', validationOptions(deckId)))
		assert.ok((quality.blockingIssues || []).some(item => item.code === 'TEXT_OVERFLOW_RISK' && item.objectHandle === 'corridor.corridor-schematic.smartart-label-1'), JSON.stringify(quality.blockingIssues))
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
