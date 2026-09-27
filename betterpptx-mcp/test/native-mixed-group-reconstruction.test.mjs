import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

import { normalizeStructuralGroup, STRUCTURAL_GROUP_CHILD_KINDS } from '../structural-authoring-family-contract.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const IMAGE_DATA = `data:image/png;base64,${PNG.toString('base64')}`

function specFor(imageRef = IMAGE_DATA) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native mixed-group reconstruction', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Native reconstruction reviewers', outcome: 'Keep group text and photographs editable.', remember: 'A group is not a flattened picture.' },
		visualDesign: { world: 'editorial', framing: 'Exact parent-local pixel frames' },
		styleIntent: { artDirection: 'editorial', mode: 'dark' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: {
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 },
			mediaAssets: [{ name: 'site-photo', kind: 'photograph', assetRef: imageRef, purpose: 'Small documentary image inside an editable group', sha256: createHash('sha256').update(PNG).digest('hex') }],
		},
		slides: [{
			id: 'mixed-group', title: 'Group proof', layoutIntent: 'title-only',
			content: [{
				kind: 'group', name: 'permit-card', pixelFrame: { x: 120, y: 180, w: 960, h: 420 },
				children: [
					{ kind: 'shape', name: 'card-background', shapeName: 'roundRect', pixelFrame: { x: 0, y: 0, w: 960, h: 420 }, style: { fill: { color: '071425' }, line: { color: '00D5FF', width: 1 }, glow: { color: '00B7FF', size: 4, opacity: 0.4 } } },
					{ kind: 'textBox', name: 'permit-title', text: [{ text: 'PERMIT ', options: { color: 'FFFFFF' } }, { text: '7B', options: { bold: true, color: '00D5FF' } }], pixelFrame: { x: 36, y: 24, w: 560, h: 60 }, style: { fontFace: 'Arial', fontSize: 24, margin: 0, wrap: false, fit: 'none', color: 'FFFFFF' } },
					{ kind: 'group', name: 'permit-details', pixelFrame: { x: 36, y: 120, w: 480, h: 240 }, children: [
						{ kind: 'textShape', name: 'permit-status', text: 'TODAY 14:00', shapeName: 'rect', pixelFrame: { x: 12, y: 18, w: 360, h: 54 }, style: { fill: { color: '163B4D' }, line: { type: 'none' }, color: 'FFFFFF', fontFace: 'Arial', fontSize: 18, margin: 0, shadow: null } },
						{ kind: 'text', name: 'permit-owner', text: 'Owner: Maya Chen', pixelFrame: { x: 12, y: 96, w: 420, h: 45 }, style: { color: 'FFFFFF', fontFace: 'Arial', fontSize: 14, margin: 0 } },
					] },
					{ kind: 'image', name: 'site-photo', pixelFrame: { x: 630, y: 110, w: 240, h: 240 }, ...(imageRef === IMAGE_DATA ? { data: imageRef } : { assetRef: imageRef }), imageOptions: { sizing: { type: 'contain' } } },
				],
			}],
		}],
	}
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

function parse(xml) {
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return doc
}

function carrier(doc, name) {
	const props = Array.from(doc.getElementsByTagName('p:cNvPr')).find(node => node.getAttribute('name') === name)
	assert.ok(props, `Missing native object ${name}`)
	return props.parentNode.parentNode
}

async function inspectPackage(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const doc = parse(await zip.file('ppt/slides/slide1.xml').async('string'))
	const rels = parse(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'))
	return { zip, doc, rels }
}

test('mixed native child kinds retain text, media, nested identity and parent-local pixels', () => {
	for (const kind of ['text', 'textBox', 'textShape', 'image', 'image-feature']) assert.ok(STRUCTURAL_GROUP_CHILD_KINDS.includes(kind))
	const normalized = normalizeVisualReferenceReconstruction(specFor())
	const group = normalizeStructuralGroup(normalized.slides[0].content[0])
	const nested = group.children[2]
	assert.equal(group.children[1].kind, 'textBox')
	assert.equal(nested.children[0].kind, 'textShape')
	assert.equal(nested.children[1].kind, 'text')
	assert.equal(group.children[3].kind, 'image')
	assert.ok(Math.abs(nested.x - 0.3) < 1e-6)
	assert.ok(Math.abs(nested.children[0].x - 0.1) < 1e-6, 'Grandchild must not include parent or slide offset')
	assert.equal(nested.children[0].y, 0.15)
	const plan = buildSpecOperationPlan(specFor())
	const op = plan.operations.find(item => item.tool === 'betterpptx.slide.add_group')
	assert.ok(op)
	assert.equal(op.args.options.children[1].objectName, 'permit-title')
	assert.equal(op.args.options.children[1].text[1].text, '7B')
	assert.equal(op.args.options.children[1].style.margin, 0)
	assert.equal(op.args.options.children[2].children[0].text, 'TODAY 14:00')
	assert.equal(op.args.options.children[3].imageOptions.data, IMAGE_DATA)
	assert.deepEqual(op.args.options.children[3].imageOptions.sizing, { type: 'contain' })
})

test('group validation rejects private nested payloads and unsupported leaf timing', () => {
	const cases = [
		{ kind: 'text', text: 'x', _nativeObject: { _type: 'text' } },
		{ kind: 'text', text: 'x', style: { _rawTxBodyXml: '<p:txBody/>' } },
		{ kind: 'text', text: [{ text: 'x', options: { _rawRPrXml: '<a:rPr/>' } }] },
		{ kind: 'image', data: IMAGE_DATA, imageOptions: { sourcePath: 'private.png' } },
		{ kind: 'image', data: IMAGE_DATA, imageOptions: { pictureStyle: { _rawPicSpPrXml: '<p:spPr/>' } } },
		{ kind: 'text', text: 'x', style: { x: 3 } },
		{ kind: 'text', text: 'x', animation: { effect: 'fade' } },
	]
	for (const child of cases) assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'group', children: [child] }] }), /private|not part of the public/)
	assert.throws(() => normalizeStructuralGroup({ style: { _rawGrpSpPrXml: '<p:grpSpPr/>' }, children: [{ kind: 'shape' }] }), /private/)
	assert.doesNotThrow(() => normalizeStructuralGroup({ decorative: true, children: [{ kind: 'shape', role: 'decorative', decorative: true }] }))
	assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'image' }] }), /explicit media source/)
	assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'chart', text: 'x' }] }), /supported native group child kind/)
})

test('mixed groups serialize real nested p:sp/p:pic carriers and valid image relationships', async () => {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const slide = pptx.addSlide()
	slide.addGroup({ x: 1, y: 1.5, w: 8, h: 3.5, objectName: 'native-card', children: [
		{ kind: 'shape', shape: 'roundRect', x: 0, y: 0, w: 8, h: 3.5, objectName: 'native-border', style: { fill: { color: '071425' }, line: { color: '00D5FF', width: 1 }, glow: { color: '00B7FF', size: 4, opacity: 0.4 } } },
		{ kind: 'textBox', text: 'PERMIT 7B', x: 0.3, y: 0.2, w: 4, h: 0.5, objectName: 'native-title', style: { fontFace: 'Arial', fontSize: 24, color: 'FFFFFF', margin: 0 } },
		{ kind: 'group', x: 0.3, y: 1, w: 4, h: 2, objectName: 'native-details', children: [
			{ kind: 'textShape', text: 'TODAY 14:00', shape: 'rect', x: 0.1, y: 0.15, w: 3, h: 0.45, objectName: 'native-status', style: { fontSize: 18, color: 'FFFFFF', fill: { color: '163B4D' }, margin: 0 } },
		] },
		{ kind: 'image', data: IMAGE_DATA, x: 5.25, y: 0.9, w: 2, h: 2, objectName: 'native-photo' },
	] })
	assert.equal(slide._slideObjects.length, 1, 'Leaves must not be duplicated at slide level')
	const { zip, doc, rels } = await inspectPackage(pptx)
	assert.equal(doc.getElementsByTagName('p:grpSp').length, 2)
	const title = carrier(doc, 'native-title')
	assert.equal(title.tagName, 'p:sp')
	assert.equal(title.parentNode, carrier(doc, 'native-card'))
	assert.equal(title.getElementsByTagName('p:cNvSpPr')[0].getAttribute('txBox'), '1')
	assert.equal(title.getElementsByTagName('a:t')[0].textContent, 'PERMIT 7B')
	const status = carrier(doc, 'native-status')
	assert.equal(status.parentNode, carrier(doc, 'native-details'))
	assert.equal(status.getElementsByTagName('a:off')[0].getAttribute('x'), '91440')
	assert.equal(carrier(doc, 'native-border').getElementsByTagName('a:glow').length, 1)
	const photo = carrier(doc, 'native-photo')
	assert.equal(photo.tagName, 'p:pic')
	assert.equal(photo.parentNode, carrier(doc, 'native-card'))
	const rid = photo.getElementsByTagName('a:blip')[0].getAttribute('r:embed')
	const relationship = Array.from(rels.getElementsByTagName('Relationship')).find(node => node.getAttribute('Id') === rid)
	assert.ok(relationship)
	const mediaPath = path.posix.normalize(path.posix.join('ppt/slides', relationship.getAttribute('Target')))
	assert.deepEqual(await zip.file(mediaPath).async('nodebuffer'), PNG)
	const ids = Array.from(doc.getElementsByTagName('p:cNvPr')).map(node => node.getAttribute('id'))
	assert.equal(new Set(ids).size, ids.length)
})

test('group descendant ids remain unique past 100 siblings and nested groups', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	const children = Array.from({ length: 120 }, (_, index) => ({ kind: 'shape', shape: 'rect', objectName: `child-${index}`, x: index / 100, y: 0, w: 0.01, h: 0.01 }))
	children.push({ kind: 'group', objectName: 'inner', x: 0, y: 0.2, w: 1, h: 1, children: [{ kind: 'text', objectName: 'nested-label', x: 0, y: 0, w: 1, h: 1, text: 'nested' }] })
	slide.addGroup({ objectName: 'many', x: 1, y: 1, w: 3, h: 3, children })
	slide.addShape('rect', { x: 5, y: 1, w: 1, h: 1, objectName: 'after-group' })
	const { doc } = await inspectPackage(pptx)
	const ids = Array.from(doc.getElementsByTagName('p:cNvPr')).map(node => Number(node.getAttribute('id')))
	assert.equal(new Set(ids).size, ids.length)
	assert.ok(ids.every(id => Number.isInteger(id) && id > 0 && id < 4294967296))
})

test('public upload, commit and effective readback preserve mixed groups without private carriers', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-mixed-group-${Date.now()}` })
	const uploaded = dataOf(await mcp.call('betterpptx.assets.upload', { kind: 'image', fileName: 'group-photo.png', data: IMAGE_DATA }))
	const handle = uploaded.asset?.handle || uploaded.handle
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: specFor(handle), detail: 'full', billingConfirmed: true, plan: 'premium' }))
	assert.equal(committed.authoringRoute.id, 'visualReference-ai')
	const entry = getDeck(committed.deckId)
	const nativeGroup = entry.pptx.slides[0]._slideObjects.find(item => item._type === 'group')
	assert.ok(nativeGroup)
	assert.equal(nativeGroup.group.children[3]._nativeObject._type, 'image')
	assert.equal(entry.pptx.slides[0]._slideObjects.filter(item => item._type === 'image').length, 0)
	const { doc } = await inspectPackage(entry.pptx)
	assert.equal(carrier(doc, 'site-photo').tagName, 'p:pic')
	assert.equal(carrier(doc, 'permit-title').getElementsByTagName('a:t').length, 2)
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
	const group = exported.spec.slides[0].content.find(item => item.kind === 'group')
	assert.ok(group)
	assert.equal(group.children[1].text[1].text, '7B')
	assert.equal(group.children[2].children[0].text[0]?.text || group.children[2].children[0].text, 'TODAY 14:00')
	assert.equal(group.children[3].imageOptions?.source?.ref || group.children[3].source?.ref || group.children[3].assetRef, handle)
	assert.doesNotMatch(JSON.stringify(exported), /_nativeObject|_bodyProp|imageRid|sourcePath|_authoredImageSource/)
	const replayed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full', billingConfirmed: true, plan: 'premium' }))
	const replayPackage = await inspectPackage(getDeck(replayed.deckId).pptx)
	assert.equal(carrier(replayPackage.doc, 'site-photo').tagName, 'p:pic')
	assert.equal(carrier(replayPackage.doc, 'permit-title').getElementsByTagName('a:t')[1].textContent, '7B')

	const authored = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'authoredInput', detail: 'full' }))
	const resetSpec = structuredClone(authored.spec)
	const resetGroup = resetSpec.slides[0].content.find(item => item.kind === 'group')
	resetGroup.children[0].style.glow = null
	resetGroup.children[1].text[1].text = '8C'
	resetGroup.children[1].text[1].options.bold = false
	const reset = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: resetSpec, detail: 'full', billingConfirmed: true, plan: 'premium' }))
	const resetPackage = await inspectPackage(getDeck(reset.deckId).pptx)
	assert.equal(carrier(resetPackage.doc, 'card-background').getElementsByTagName('a:glow').length, 0)
	assert.equal(carrier(resetPackage.doc, 'permit-title').getElementsByTagName('a:t')[1].textContent, '8C')
	assert.equal(carrier(resetPackage.doc, 'site-photo').tagName, 'p:pic')
})
