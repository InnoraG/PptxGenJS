import assert from 'node:assert/strict'
import test from 'node:test'

// Isolated product-validation fixtures, never production entitlement settings.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

function fixture() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Exact native composition', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Measure actual visible content.', remember: 'An empty native shape is not text.' },
		visualDesign: { world: 'editorial', framing: 'Native geometry with an independent editable presenter.' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timing' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		presenter: { id: 'host', identity: 'louise', onSlides: 'all', stageTreatment: 'none', pixelFrame: { x: 1100, y: 150, w: 420, h: 650 } },
		slides: [{ id: 'composition', title: 'Native composition', layoutIntent: 'title-only', content: [
			{ kind: 'shape', name: 'empty-native-geometry', shapeName: 'ellipse', pixelFrame: { x: 1200, y: 350, w: 250, h: 250 }, style: { fill: { transparency: 100 }, line: { color: '0B5577', width: 1 } } },
			{ kind: 'textBox', name: 'reference-copy', text: 'First line\nSecond line', pixelFrame: { x: 140, y: 160, w: 420, h: 52 }, style: { fontFace: 'Segoe UI', fontSize: 12, margin: 0, color: '112233' } },
		] }],
	}
}

function dataOf(result) { assert.equal(result?.ok, true, JSON.stringify(result?.error || result)); return result.data || result }
function validator() { return createMcpToolDispatcher({ sessionId: `reference-composition-${Date.now()}-${Math.random()}`, blackBox: true }) }
const options = deckId => ({ deckId, profile: 'static', mode: 'strict', requireNarration: false, requireMotion: false })

test('public exact-pixel validation does not invent text on an empty native shape', async () => {
	const mcp = validator()
	const c = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture(), phase: 'commit', detail: 'full' }))
	const native = getDeck(c.deckId).pptx.slides[0]._slideObjects.find(o => o.options?.objectName?.includes('empty-native-geometry'))
	assert.ok(native)
	assert.ok(!native.text || Array.isArray(native.text) && native.text.every(run => !run.text?.trim()))
	const d = dataOf(await mcp.call('betterpptx.deck.validate_design', options(c.deckId)))
	assert.equal(d.issues.some(i => i.code === 'TEXT_VISUAL_OVERLAP'), false, JSON.stringify(d.issues))
	assert.equal(d.issues.some(i => i.code === 'TEXT_OVERFLOW_RISK'), false, JSON.stringify(d.issues))
	assert.ok(d.issues.some(i => i.code === 'SMALL_TEXT_READABILITY_RISK'), 'reference type sizes retain readability warnings')
})

test('real audience-facing text overlapping a model is surfaced for AI spatial authoring', async () => {
	const mcp = validator()
	const s = fixture()
	s.slides[0].content[1].pixelFrame = { x: 1150, y: 350, w: 400, h: 80 }
	const preflight = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: s, phase: 'dryRun', detail: 'full' }))
	assert.ok(preflight.warnings.some(i => i.code === 'OBJECT_OVERLAP' && i.severity === 'warning'))
	const c = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture(), phase: 'commit', detail: 'full' }))
	const native = getDeck(c.deckId).pptx.slides[0]._slideObjects.find(o => o.options?.objectName?.includes('reference-copy'))
	native.options.x = 9.7
	native.options.y = 3
	const d = dataOf(await mcp.call('betterpptx.deck.validate_design', options(c.deckId)))
	const overlap = d.issues.find(i => i.code === 'TEXT_VISUAL_OVERLAP' && i.evidence.objects.some(name => name.includes('reference-copy')))
	assert.ok(overlap, JSON.stringify(d.issues))
	assert.equal(overlap.severity, 'warning')
	assert.equal(overlap.evidence.engineAction, 'report-only')
})

test('exact-pixel text still blocks when the actual authored size cannot fit', async () => {
	const mcp = validator()
	const c = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture(), phase: 'commit', detail: 'full' }))
	const native = getDeck(c.deckId).pptx.slides[0]._slideObjects.find(o => o.options?.objectName?.includes('reference-copy'))
	// Diagnostic mutation tests the post-materialization guard, not a deck fix.
	native.options.h = 0.08
	const d = dataOf(await mcp.call('betterpptx.deck.validate_design', options(c.deckId)))
	const issue = d.issues.find(i => i.code === 'TEXT_OVERFLOW_RISK' && i.evidence.objectName.includes('reference-copy'))
	assert.ok(issue, JSON.stringify(d.issues))
	assert.equal(issue.evidence.fontSizeAuthority, 'authored-reference')
	assert.equal(issue.evidence.requestedFontSize, 12)
	assert.equal(issue.evidence.minimumFontSize, 12)
})
