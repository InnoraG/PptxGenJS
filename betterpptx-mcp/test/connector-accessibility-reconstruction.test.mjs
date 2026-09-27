import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

// Isolated in-process product contract fixture; these test entitlements are
// never applied to a running public endpoint or used to author user artifacts.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

function specFor(decorative) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native vector metadata regression', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Preserve native connector semantics.', remember: 'Decorative metadata cannot prevent drawing.' },
		visualDesign: { world: 'editorial', framing: 'An exactly positioned vector connector.' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'vector', title: 'Native vector', layoutIntent: 'title-only', content: [{
			kind: 'connector', name: 'dependency-rule', pixelFrame: { x: 120, y: 360, w: 960, h: 0 },
			decorative,
			...(decorative ? {} : { title: 'Dependency', altText: 'A connection between two stages.' }),
			style: { line: { color: '00AAFF', width: 1.25 } },
		}] }],
	}
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

test('public pixel connector commits, serializes and reads back lowered accessibility metadata', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `connector-accessibility-${Date.now()}` })
	for (const decorative of [true, false]) {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: specFor(decorative), detail: 'full' }))
		const pptx = getDeck(committed.deckId).pptx
		const connector = pptx.slides[0]._slideObjects.find(item => item.options?.objectName?.includes('dependency-rule'))
		assert.ok(connector)
		assert.equal(connector.options.isDecorative, decorative)
		const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
		const xml = await zip.file('ppt/slides/slide1.xml').async('string')
		const doc = new DOMParser().parseFromString(xml, 'application/xml')
		const props = Array.from(doc.getElementsByTagName('p:cNvPr')).find(node => node.getAttribute('name').includes('dependency-rule'))
		assert.ok(props)
		assert.equal(props.parentNode.parentNode.tagName, 'p:cxnSp')
		if (decorative) assert.equal(props.getElementsByTagName('adec:decorative')[0]?.getAttribute('val'), '1')
		else {
			assert.equal(props.getAttribute('title'), 'Dependency')
			assert.equal(props.getAttribute('descr'), 'A connection between two stages.')
		}
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		const exportedConnector = exported.spec.slides[0].content.find(item => item.kind === 'connector')
		assert.equal(exportedConnector.decorative, decorative)
		assert.doesNotMatch(JSON.stringify(exportedConnector), /isDecorative|accessibilityTitle|_connectorStyleState/)
	}
})
