import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')

function chartSpec({ titleColor } = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Chart title contrast proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
			layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, staging, and balance.',
		},
		contentStory: { audience: 'presentation reviewers', outcome: 'Keep native chart titles readable on a dark canvas.', remember: 'Embedded chart text belongs to the readability gate.' },
		handshake: { audience: 'presentation reviewers', promise: 'Keep native chart titles readable on a dark canvas.', proof: ['A rendered native chart carries a visible title.'], bar: 'The full-slide render has no unreadable embedded text.' },
		visualDesign: { world: 'Blueprint', framing: 'One native chart', tone: 'clear' },
		styleIntent: { artDirection: 'blueprint', mode: 'dark' },
		theme: { palette: ['0B1120', '1D4ED8', '22D3EE', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'chart-title', title: 'Embedded chart title contrast', message: 'The chart title must remain readable.', role: 'evidence', layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'slide-title', text: 'Embedded chart title contrast' },
				{
					kind: 'chart-panel', name: 'proof-chart', chartType: 'line',
					data: [{ name: 'Signal', labels: ['A', 'B', 'C'], values: [10, 16, 13] }],
					chartOptions: { showTitle: true, title: 'Illustrative signal', showLegend: false, showValue: false, ...(titleColor ? { titleColor } : {}) },
					verified: true, evidenceSource: 'synthetic deterministic verifier fixture', altText: 'Synthetic line chart used to verify title contrast.',
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
	const mcp = createMcpToolDispatcher({ sessionId: session, clientInfo: { name: 'chart-title-contrast-verifier', version: '1' }, blackBox: true })
	let deckId = null
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckId = committed.deckId
		return dataOf(await mcp.call('betterpptx.deck.validate_quality', {
			deckId, profile: 'static', mode: 'strict', minScore: 0,
			requireNarration: false, requireMotion: false, requireVisualProof: false, requireExpressive3D: false,
		}))
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

test('public compiler supplies a dark-canvas-safe native chart title colour', async () => {
	const quality = await qualityFor(chartSpec(), `chart-title-default-${Date.now()}`)
	assert.equal((quality.warnings || []).some(item => item.code === 'LOW_TEXT_CONTRAST'), false, JSON.stringify(quality.warnings))
})

test('postcommit quality catches an explicitly unreadable native chart title', async () => {
	const quality = await qualityFor(chartSpec({ titleColor: '000000' }), `chart-title-low-contrast-${Date.now()}`)
	const finding = (quality.warnings || []).find(item => item.code === 'LOW_TEXT_CONTRAST')
	assert.ok(finding, JSON.stringify(quality))
	assert.ok(finding.evidence?.examples?.some(item => item.field === 'title' && item.foreground === '000000'))
})
