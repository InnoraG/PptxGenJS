import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')

function shapeBuiltSpec({ fill = { color: '17324D' } } = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Shape-built label contrast proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
			layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, staging, and balance.',
		},
		contentStory: { audience: 'public reviewers', outcome: 'Keep editable labels readable on their shape-built nodes.', remember: 'A label belongs to the node directly behind it.' },
		handshake: { audience: 'public reviewers', promise: 'Keep editable labels readable on their nodes.', proof: ['A full-slide render shows the label and backing node together.'], bar: 'Every label clears the contrast target against its actual rendered surface.' },
		visualDesign: { world: 'Editorial', framing: 'One restrained editable diagram', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FBFBF9', '17324D', 'D97706', '2E7D5B', '5E6B78'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'corridor', title: 'Backing-node contrast', message: 'Each label is measured against its node.', role: 'evidence', layoutIntent: 'process-flow',
			content: [
				{ kind: 'title', name: 'slide-title', text: 'Backing-node contrast' },
				{
					kind: 'diagram', name: 'corridor-schematic', mode: 'shape', layout: 'timeline',
					customReason: 'A geographic corridor with peer junction markers is not a workflow and requires a restrained shape-built line.',
					style: { fill, line: { color: '5E6B78', pt: 1.2 }, color: 'FFFFFF', fontFace: 'Aptos', fontSize: 16 },
					nodes: [{ text: 'START' }, { text: 'J1–J2' }, { text: 'END' }],
					verified: true, evidenceSource: 'deterministic contrast fixture', altText: 'Three editable nodes on a corridor line.',
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

async function qualityFor(spec, session) {
	const mcp = createMcpToolDispatcher({ sessionId: session, clientInfo: { name: 'shape-built-label-contrast-verifier', version: '1' }, blackBox: true })
	let deckId = null
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckId = committed.deckId
		const validationOptions = {
			deckId, profile: 'static', mode: 'strict', minScore: 0,
			requireNarration: false, requireMotion: false, requireVisualProof: false, requireExpressive3D: false,
		}
		const design = dataOf(await mcp.call('betterpptx.deck.validate_design', validationOptions))
		const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', validationOptions))
		return { design, quality }
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

test('shape-built SmartArt labels are measured against their paired dark nodes', async () => {
	const { design, quality } = await qualityFor(shapeBuiltSpec(), `shape-built-label-readable-${Date.now()}`)
	assert.equal((design.issues || []).some(item => item.code === 'LOW_TEXT_CONTRAST'), false, JSON.stringify(design.issues))
	assert.equal((quality.warnings || []).some(item => item.code === 'LOW_TEXT_CONTRAST'), false, JSON.stringify(quality.warnings))
	assert.ok(design.readability?.measurements?.evaluableContrastPairs >= 4, JSON.stringify(design.readability))
	assert.equal(design.readability?.measurements?.manualContrastReviewObjects, 0, JSON.stringify(design.readability))
})

test('shape-built SmartArt labels still fail against unreadable light nodes', async () => {
	const { design, quality } = await qualityFor(shapeBuiltSpec({ fill: { color: 'FFFFFF' } }), `shape-built-label-unreadable-${Date.now()}`)
	assert.ok((design.issues || []).some(item => item.code === 'LOW_TEXT_CONTRAST'), JSON.stringify(design))
	const finding = (quality.warnings || []).find(item => item.code === 'LOW_TEXT_CONTRAST')
	assert.ok(finding, JSON.stringify(quality))
	assert.ok(finding.evidence?.examples?.some(item => item.objectName?.endsWith('.smartart-label-1') && item.foreground === 'FFFFFF' && item.background === 'FFFFFF'))
})

test('shape-built labels over a gradient node remain manual-review instead of falling through to the slide', async () => {
	const fill = { type: 'gradient', gradientAngle: 30, gradientStops: [{ color: '17324D', position: 0 }, { color: 'D97706', position: 100 }] }
	const { design, quality } = await qualityFor(shapeBuiltSpec({ fill }), `shape-built-label-gradient-${Date.now()}`)
	assert.equal((design.issues || []).some(item => item.code === 'LOW_TEXT_CONTRAST'), false, JSON.stringify(design.issues))
	assert.equal((quality.warnings || []).some(item => item.code === 'LOW_TEXT_CONTRAST'), false, JSON.stringify(quality.warnings))
	assert.ok(design.readability?.measurements?.manualContrastReviewObjects >= 3, JSON.stringify(design.readability))
})
