import assert from 'node:assert/strict'
import test from 'node:test'

import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const TABLE_NAME = 'hyperlink-table-rich-run'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function dataOf(label, result) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'prove table hyperlinks', remember: 'table links retain semantic slide destinations' },
		visualDesign: { world: 'native table hyperlink proof', framing: 'single table carrier', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light', density: 'focused' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
	}
}

function authoredSpec() {
	return {
		...metadata('Table hyperlink carrier'),
		slides: [
			{ id: 'table-source', title: 'Table source', layoutIntent: 'title-only', content: [] },
			{ id: 'table-middle', title: 'Middle', layoutIntent: 'title-only', content: [] },
			{ id: 'table-target', title: 'Target', layoutIntent: 'title-only', content: [] },
		],
	}
}

async function packageTableLink(entry, expectedTarget) {
	const buffer = Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const relXml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	const slide = new DOMParser().parseFromString(slideXml, 'application/xml')
	const rels = new DOMParser().parseFromString(relXml, 'application/xml')
	const clicks = Array.from(slide.getElementsByTagName('*')).filter(node => node.localName === 'hlinkClick')
	assert.equal(clicks.length, expectedTarget ? 1 : 0)
	const relationships = Array.from(rels.getElementsByTagName('*')).filter(node => node.localName === 'Relationship')
	const hyperlinkRels = relationships.filter(node => /\/hyperlink$/.test(node.getAttribute('Type')))
	if (!expectedTarget) {
		assert.equal(hyperlinkRels.length, 0, 'table delete removes its hyperlink relationship')
		return
	}
	const id = clicks[0].getAttributeNS(REL_NS, 'id') || clicks[0].getAttribute('r:id')
	const relationship = relationships.find(node => node.getAttribute('Id') === id)
	assert.ok(relationship, 'table carrier relationship exists')
	assert.match(relationship.getAttribute('Type'), /\/slide$/)
	assert.equal(relationship.getAttribute('Target'), expectedTarget)
	assert.equal(clicks[0].getAttribute('action'), 'ppaction://hlinksldjump')
	assert.equal(clicks[0].getAttribute('tooltip'), 'Open table target')
}

test('table rich-text hyperlink retargets across slide reorder and cleans up on object deletion', { timeout: 60000 }, async () => {
	const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `table-hyperlink-${Date.now()}`, clientInfo: { name: 'table-hyperlink-proof', version: '1' }, blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	let deckId
	try {
		const created = dataOf('create', await mcp.call('betterpptx.deck.generate_from_spec', { spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckId = created.deckId
		let entry = getDeck(deckId)
		entry.pptx.slides[0].addTable([[
			{ text: [{ text: 'Open target slide', options: { hyperlink: { slide: 3, tooltip: 'Open table target' } } }], options: {} },
		]], { x: 1, y: 1.5, w: 5, h: 1, objectName: TABLE_NAME })
		let table = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === TABLE_NAME)
		assert.ok(table)
		assert.equal(table.arrTabRows[0][0].text[0].options.hyperlink.slide, 3)
		await packageTableLink(entry, 'slide3.xml')

		dataOf('reorder target', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: entry.deckVersion, spec: { ...metadata('Reorder table target'), slides: [], patchPlan: { reorderSlides: { fromIndex: 2, toIndex: 1 } } },
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		entry = getDeck(deckId)
		table = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === TABLE_NAME)
		assert.equal(table.arrTabRows[0][0].text[0].options.hyperlink.slide, 2)
		await packageTableLink(entry, 'slide2.xml')

		const rejected = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: entry.deckVersion,
			spec: { ...metadata('Reject live target deletion'), slides: [{ id: 'table-target', slideIndex: 1, delete: true, content: [] }] },
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		})
		assert.equal(rejected?.ok, false)
		assert.match(JSON.stringify(rejected), /hyperlink|target|retarget|clear/i)

		dataOf('delete table', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: entry.deckVersion,
			spec: { ...metadata('Delete table carrier'), slides: [{ id: 'table-source', slideIndex: 0, layoutIntent: 'title-only', content: [{ kind: 'shape', name: TABLE_NAME, objectName: TABLE_NAME, delete: true }] }] },
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		entry = getDeck(deckId)
		assert.equal(entry.pptx.slides[0]._slideObjects.some(object => object.options?.objectName === TABLE_NAME), false)
		await packageTableLink(entry, null)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
