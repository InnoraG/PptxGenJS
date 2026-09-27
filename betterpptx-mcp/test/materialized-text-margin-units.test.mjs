import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { estimateTextFit } from '../ir/layout-engine.mjs'

// Isolated in-process public fixtures; no service, COM, saved deck or media work.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const COPY = 'Protect the permit lane, hold\nthe transformer slot, and treat\nevidence as the daily operating\ncadence.'
const SHORT_COPY = 'First line\nSecond line\nThird line\nFourth line'
const FRAME = { x: 1.28, y: 4, w: 3.648, h: 1.264 }
const MARGIN = [0, 0, 3.17, 0]

function fixture(margin = MARGIN, text = COPY) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native text inset measurement',
		layouts: [{ name: 'PIXEL_FRAME', width: 13.376, height: 7.528, activate: true }],
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Measure the native text frame.', remember: 'Point insets do not become inches.' },
		visualDesign: { world: 'editorial', framing: 'Exact native editable text.' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timing' },
		visualReference: {
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media',
			viewport: { width: 1672, height: 941 }, mediaAssets: [],
		},
		slides: [{ id: 'native-insets', title: 'Point inset geometry', layoutIntent: 'title-only', layoutName: 'PIXEL_FRAME', content: [{
			kind: 'textBox', name: 'body', text, pixelFrame: { x: 160, y: 500, w: 456, h: 158 },
			style: {
				fontFace: 'Segoe UI', fontSize: 16.7, color: '152638', margin: structuredClone(margin),
				paraSpaceAfter: 0, lineSpacingMultiple: 1.26, valign: 'middle', fit: 'none',
			},
		}] }],
	}
}

function dataOf(result) { assert.equal(result?.ok, true, JSON.stringify(result)); return result.data || result }
function validationOptions(deckId) {
	return { deckId, profile: 'static', mode: 'strict', minScore: 0, requireNarration: false, requireMotion: false, requireVisualProof: false, requireExpressive3D: false }
}
async function withFixture(spec, fn) {
	const mcp = createMcpToolDispatcher({ sessionId: `native-point-insets-${Date.now()}-${Math.random()}`, blackBox: true })
	let deckId
	try {
		// This regression targets the authoritative post-materialization check.
		// Preflight still has the legacy semantic-layout advisory estimator.
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', detail: 'full' }))
		deckId = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', detail: 'full' })).deckId
		const entry = getDeck(deckId)
		const text = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === 'native-insets.body.textBox')
		assert.ok(text)
		return await fn({ mcp, deckId, entry, text })
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
}
async function overflowIssues(mcp, deckId) {
	return dataOf(await mcp.call('betterpptx.deck.validate_design', validationOptions(deckId))).issues.filter(issue => issue.code === 'TEXT_OVERFLOW_RISK')
}

test('general layout estimator keeps its existing inch-padding contract', () => {
	const legacy = estimateTextFit({ text: COPY, rect: FRAME, fontSize: 16.7, minFontSize: 16, margin: MARGIN, fontFace: 'Segoe UI' })
	assert.equal(legacy.lines, 108, 'this is the exact old failure when native point margins reach the inch-based estimator unchanged')
	assert.equal(legacy.usableWidthIn, 0.1)
	assert.equal(legacy.usableHeightIn, 0.1)
	const inches = estimateTextFit({ text: SHORT_COPY, rect: FRAME, fontSize: 16.7, minFontSize: 16, margin: 0.08 })
	assert.ok(Math.abs(inches.usableWidthIn - (FRAME.w - 0.16)) < 1e-12)
	assert.ok(Math.abs(inches.usableHeightIn - (FRAME.h - 0.16)) < 1e-12)
})

test('public materialized native text honors the asymmetric point inset without altering source or XML', async () => {
	const spec = fixture(), original = structuredClone(spec)
	await withFixture(spec, async ({ mcp, deckId, entry, text }) => {
		assert.deepEqual(text.options.margin, MARGIN)
		assert.ok(Math.abs(text.options.w - FRAME.w) < 1e-12)
		assert.ok(Math.abs(text.options.h - FRAME.h) < 1e-12)
		assert.equal(text.options.fontSize, 16.7)
		assert.equal(text.options.lineSpacingMultiple, 1.26)
		assert.equal(text.options.fit, 'none')
		assert.deepEqual(await overflowIssues(mcp, deckId), [])
		const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', validationOptions(deckId)))
		assert.equal(quality.blockingIssues.some(issue => issue.code === 'TEXT_OVERFLOW_RISK'), false)
		const zip = await JSZip.loadAsync(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
		const doc = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml')
		const shape = Array.from(doc.getElementsByTagName('p:sp')).find(node => node.getElementsByTagName('p:cNvPr')[0]?.getAttribute('name') === text.options.objectName)
		assert.ok(shape)
		const bodyPr = shape.getElementsByTagName('a:bodyPr')[0]
		assert.equal(bodyPr.getAttribute('bIns'), '40259', '3.17pt remains native 40259EMU, not an inch-valued deck patch')
		for (const side of ['tIns', 'rIns', 'lIns']) assert.equal(bodyPr.getAttribute(side), '0')
		const extent = shape.getElementsByTagName('a:ext')[0]
		assert.equal(extent.getAttribute('cx'), '3335731')
		assert.equal(extent.getAttribute('cy'), '1155802')
		assert.deepEqual(text.options.margin, MARGIN)
	})
	assert.deepEqual(spec, original, 'measurement cannot mutate the authored spec')
})

test('public scalar, zero, and horizontal-only point insets retain their four-side meaning', async () => {
	for (const margin of [0, [0, 0, 0, 0], 3.17, [0, 18, 0, 36]]) {
		await withFixture(fixture(margin, SHORT_COPY), async ({ mcp, deckId, text }) => {
			assert.deepEqual(text.options.margin, margin)
			assert.deepEqual(await overflowIssues(mcp, deckId), [], JSON.stringify(margin))
		})
	}
})

test('genuine native overflow remains blocking and reports point-adjusted height, not 0.1in', async () => {
	await withFixture(fixture(), async ({ mcp, deckId, text }) => {
		// Only this isolated materialized test object is changed to challenge the guard.
		// The real authored slide and its font/text remain untouched.
		text.options.h = 1.13
		const issues = await overflowIssues(mcp, deckId)
		assert.equal(issues.length, 1)
		const evidence = issues[0].evidence
		assert.equal(evidence.lineCount, 4)
		assert.equal(evidence.availableHeightIn, 1.086)
		assert.equal(evidence.estimatedHeightIn, 1.1133)
		assert.equal(evidence.requestedFontSize, 16.7)
		assert.equal(evidence.fontSizeAuthority, 'authored-reference')
		assert.deepEqual(text.options.margin, MARGIN)
		const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', validationOptions(deckId)))
		assert.ok(quality.blockingIssues.some(issue => issue.code === 'TEXT_OVERFLOW_RISK' && issue.objectHandle === text.options.objectName))
	})
})

test('top, bottom and scalar point margins can independently cause real overflow', async () => {
	await withFixture(fixture(0, SHORT_COPY), async ({ mcp, deckId, text }) => {
		for (const [margin, height] of [[[18, 0, 0, 0], 1.014], [[0, 0, 18, 0], 1.014], [18, 0.764], [[100, 0, 100, 0], 0.1]]) {
			text.options.margin = structuredClone(margin)
			const issues = await overflowIssues(mcp, deckId)
			assert.equal(issues.length, 1, JSON.stringify(margin))
			assert.equal(issues[0].evidence.lineCount, 4)
			assert.equal(issues[0].evidence.availableHeightIn, height)
		}
	})
})

test('unset and null native margins retain the existing unspecified-margin fit behavior', async () => {
	await withFixture(fixture(0, SHORT_COPY), async ({ mcp, deckId, text }) => {
		text.options.h = 1.13
		for (const margin of [undefined, null]) {
			text.options.margin = margin
			const issues = await overflowIssues(mcp, deckId)
			assert.equal(issues.length, 1)
			assert.equal(issues[0].evidence.lineCount, 4)
			assert.equal(issues[0].evidence.availableHeightIn, 0.97)
		}
	})
})
