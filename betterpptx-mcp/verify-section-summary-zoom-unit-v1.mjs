#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'
import sharp from 'sharp'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const modulePath = fileURLToPath(import.meta.url)
const moduleDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(moduleDir, '..')

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const P14_NS = 'http://schemas.microsoft.com/office/powerpoint/2010/main'
const P166_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/6/main'
const PSEZ_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom'
const PSUZ_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom'
const DCTERMS_NS = 'http://purl.org/dc/terms/'
const CORE_NS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
const GUID = /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/
const NAMES = Object.freeze({ section: 'native-section-zoom', summary: 'native-summary-zoom' })
const SECTION_TITLES = Object.freeze({ navigation: 'Navigation', overview: 'Overview', details: 'Details' })

export const SECTION_SUMMARY_ZOOM_UNIT_ID = 'impl-b-b788572e1bb6d7f7'
export const SECTION_SUMMARY_ZOOM_ROWS = Object.freeze([
	['cap_5adc3514c23e1839a324', 'summary zoom'],
	['cap_8955ad9479da6e1f4185', 'section zoom'],
])

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function timestamp() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') }
function relative(file) { return path.relative(workspaceRoot, file).replaceAll(path.sep, '/') }

function dataOf(label, result) {
	if (!result?.ok) {
		const error = new Error(`${label} failed: ${JSON.stringify(result)}`)
		error.code = result?.error?.code || 'SECTION_SUMMARY_ZOOM_PUBLIC_CONTRACT_BLOCKED'
		throw error
	}
	return result.data || result
}

function parseXmlStrict(xml, label) {
	const diagnostics = []
	const document = new DOMParser({ errorHandler: {
		warning: message => diagnostics.push(`warning: ${message}`),
		error: message => diagnostics.push(`error: ${message}`),
		fatalError: message => diagnostics.push(`fatal: ${message}`),
	} }).parseFromString(String(xml), 'application/xml')
	assert.deepEqual(diagnostics, [], `${label}: XML diagnostics: ${diagnostics.join(' | ')}`)
	assert.notEqual(document.documentElement?.localName, 'parsererror', `${label}: parsererror root`)
	return document
}

function elements(node, localName) { return Array.from(node?.getElementsByTagName('*') || []).filter(item => item.localName === localName) }
function elementChildren(node) { return Array.from(node?.childNodes || []).filter(item => item.nodeType === 1) }
function directChild(node, localName) { return elementChildren(node).find(item => item.localName === localName) || null }
function relationshipId(node, attribute = 'id') { return node?.getAttributeNS(REL_NS, attribute) || node?.getAttribute(`r:${attribute}`) || '' }
function relationshipRecords(document) {
	return elements(document, 'Relationship').map(node => ({
		Id: node.getAttribute('Id'), Type: node.getAttribute('Type'), Target: node.getAttribute('Target'), TargetMode: node.getAttribute('TargetMode'),
	}))
}
function sourcePartForRelationships(relsPart) {
	if (relsPart === '_rels/.rels') return ''
	const match = relsPart.match(/^(.*)\/_rels\/([^/]+)\.rels$/)
	return match ? path.posix.join(match[1], match[2]) : ''
}
function relationshipPartFor(sourcePart) {
	if (!sourcePart) return '_rels/.rels'
	return path.posix.join(path.posix.dirname(sourcePart), '_rels', `${path.posix.basename(sourcePart)}.rels`)
}
function resolveRelationshipTarget(sourcePart, target) {
	if (String(target || '').startsWith('/')) return String(target).replace(/^\/+/, '')
	return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart || ''), String(target || ''))).replace(/^\/+/, '')
}
function readXfrm(node) {
	const off = directChild(node, 'off') || elements(node, 'off')[0]
	const ext = directChild(node, 'ext') || elements(node, 'ext')[0]
	assert.ok(off && ext, 'transform must contain off/ext')
	return { x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), cx: Number(ext.getAttribute('cx')), cy: Number(ext.getAttribute('cy')) }
}
function nameMatches(actual, wanted) { return actual === wanted || actual.endsWith(`.${wanted}`) || actual.includes(`.${wanted}.`) }
function sectionMapByTitle(sections) { return new Map(sections.map(section => [section.title, section])) }

function contentTypeMaps(document) {
	return {
		defaults: new Map(elements(document, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')])),
		overrides: new Map(elements(document, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')])),
	}
}

async function loadPackage(buffer, state) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${state}/${name}`))
	}
	const internallyReferenced = new Set()
	for (const [name, document] of documents) {
		if (!name.endsWith('.rels')) continue
		const rels = relationshipRecords(document)
		assert.equal(new Set(rels.map(rel => rel.Id)).size, rels.length, `${state}/${name}: duplicate relationship ID`)
		const source = sourcePartForRelationships(name)
		for (const rel of rels.filter(item => item.TargetMode !== 'External')) {
			const target = resolveRelationshipTarget(source, rel.Target)
			assert.ok(nameSet.has(target), `${state}/${name}: dangling ${rel.Id} -> ${target}`)
			internallyReferenced.add(target)
		}
	}
	const types = contentTypeMaps(documents.get('[Content_Types].xml'))
	for (const [part] of types.overrides) assert.ok(nameSet.has(part), `${state}: content-type override targets missing ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml' && !item.endsWith('.rels'))) {
		const ext = path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(types.overrides.has(name) || types.defaults.has(ext), `${state}: no content type for ${name}`)
	}
	for (const media of names.filter(item => item.startsWith('ppt/media/'))) assert.ok(internallyReferenced.has(media), `${state}: orphan media ${media}`)
	return { zip, names, nameSet, documents }
}

function presentationTopology(pkg, state) {
	const presentationPart = 'ppt/presentation.xml'
	const document = pkg.documents.get(presentationPart)
	const rels = relationshipRecords(pkg.documents.get(relationshipPartFor(presentationPart)))
	const relById = new Map(rels.map(rel => [rel.Id, rel]))
	const slideNodes = elements(document, 'sldId').filter(node => node.parentNode?.localName === 'sldIdLst' && node.parentNode?.namespaceURI !== P14_NS)
	const slides = slideNodes.map((node, index) => {
		const id = Number(node.getAttribute('id'))
		const rel = relById.get(relationshipId(node))
		assert.ok(rel && rel.Type === `${REL_TYPE}slide`, `${state}: presentation slide relationship`)
		return { index, id, part: resolveRelationshipTarget(presentationPart, rel.Target) }
	})
	const slideById = new Map(slides.map(slide => [slide.id, slide]))
	const sectionNodes = elements(document, 'section').filter(node => node.namespaceURI === P14_NS)
	const sections = sectionNodes.map(node => {
		const id = node.getAttribute('id')
		assert.match(id, GUID, `${state}: section GUID`)
		const slideIds = elements(node, 'sldId').map(slide => Number(slide.getAttribute('id')))
		assert.ok(slideIds.length >= 1, `${state}: empty serialized section ${node.getAttribute('name')}`)
		for (const slideId of slideIds) assert.ok(slideById.has(slideId), `${state}: section references missing sldId ${slideId}`)
		return { title: node.getAttribute('name'), id, slideIds, slideParts: slideIds.map(slideId => slideById.get(slideId).part) }
	})
	assert.equal(new Set(sections.map(section => section.id)).size, sections.length, `${state}: duplicate section GUID`)
	const membership = sections.flatMap(section => section.slideIds)
	assert.equal(new Set(membership).size, membership.length, `${state}: slide belongs to multiple sections`)
	assert.equal(membership.length, slides.length, `${state}: every slide must belong to exactly one section`)
	return { slides, slideById, sections }
}

function relationshipMap(pkg, slidePart) {
	const relPart = relationshipPartFor(slidePart)
	return new Map(relationshipRecords(pkg.documents.get(relPart)).map(rel => [rel.Id, rel]))
}

function assertZoomPropertyShape(zmPr, namespace, state) {
	assert.match(zmPr.getAttribute('id'), GUID, `${state}: Zoom object GUID`)
	assert.equal(zmPr.hasAttribute('returnToParent'), false, `${state}: section/summary Zoom must not carry returnToParent`)
	const blipFill = directChild(zmPr, 'blipFill')
	const spPr = directChild(zmPr, 'spPr')
	assert.equal(blipFill?.namespaceURI, P166_NS, `${state}: p166:blipFill namespace`)
	assert.equal(spPr?.namespaceURI, P166_NS, `${state}: p166:spPr namespace`)
	assert.equal(zmPr.parentNode?.namespaceURI, namespace, `${state}: Zoom object namespace`)
	return { blipFill, spPr }
}

async function inspectSectionZoom(pkg, presentation, expectation) {
	const state = expectation.state
	const matches = []
	for (const slide of presentation.slides) {
		const document = pkg.documents.get(slide.part)
		for (const node of elements(document, 'sectionZmObj').filter(item => item.namespaceURI === PSEZ_NS)) matches.push({ slide, document, node })
	}
	if (!expectation.sectionZoom) {
		assert.equal(matches.length, 0, `${state}: Section Zoom must be absent`)
		return null
	}
	assert.equal(matches.length, 1, `${state}: exactly one Section Zoom`)
	const { slide, node } = matches[0]
	assert.equal(slide.index, expectation.hostIndex, `${state}: Section Zoom host index`)
	const sectionById = new Map(presentation.sections.map(section => [section.id, section]))
	const target = sectionById.get(node.getAttribute('sectionId'))
	assert.equal(target?.title, expectation.sectionTarget, `${state}: Section Zoom semantic section target`)
	const sectionZm = node.parentNode
	const graphicData = sectionZm.parentNode
	const choice = graphicData.parentNode?.parentNode?.parentNode
	const alternate = choice?.parentNode
	assert.equal(sectionZm?.localName, 'sectionZm', `${state}: psez:sectionZm carrier`)
	assert.equal(sectionZm?.namespaceURI, PSEZ_NS, `${state}: psez namespace`)
	assert.equal(graphicData?.getAttribute('uri'), PSEZ_NS, `${state}: Section Zoom graphicData URI`)
	assert.equal(choice?.localName, 'Choice', `${state}: Section Zoom Choice`)
	assert.equal(choice?.getAttribute('Requires'), 'psez', `${state}: Section Zoom Choice Requires`)
	if (state !== 'powerpoint-roundtrip') assert.equal(choice.getAttribute('xmlns:psez'), PSEZ_NS, `${state}: generated Choice-local psez declaration`)
	assert.equal(alternate?.localName, 'AlternateContent', `${state}: Section Zoom AlternateContent`)
	const fallback = directChild(alternate, 'Fallback')
	const picture = directChild(fallback, 'pic')
	assert.ok(picture, `${state}: Section Zoom picture fallback`)
	const zmPr = directChild(node, 'zmPr')
	const { blipFill } = assertZoomPropertyShape(zmPr, PSEZ_NS, state)
	assert.equal(Number(zmPr.getAttribute('transitionDur')), expectation.sectionTransition, `${state}: Section Zoom transition`)
	const choiceImageRid = relationshipId(elements(blipFill, 'blip')[0], 'embed')
	const fallbackImageRid = relationshipId(elements(picture, 'blip')[0], 'embed')
	const fallbackHyperlink = elements(picture, 'hlinkClick')[0]
	assert.equal(fallbackHyperlink?.getAttribute('action'), 'ppaction://hlinksldjump', `${state}: Section Zoom fallback action`)
	const fallbackSlideRid = relationshipId(fallbackHyperlink)
	const rels = relationshipMap(pkg, slide.part)
	const choiceImageRel = rels.get(choiceImageRid)
	const fallbackImageRel = rels.get(fallbackImageRid)
	const fallbackSlideRel = rels.get(fallbackSlideRid)
	assert.equal(choiceImageRel?.Type, `${REL_TYPE}image`, `${state}: Section Zoom Choice image rel`)
	assert.equal(fallbackImageRel?.Type, `${REL_TYPE}image`, `${state}: Section Zoom fallback image rel`)
	const choiceImagePart = resolveRelationshipTarget(slide.part, choiceImageRel.Target)
	const fallbackImagePart = resolveRelationshipTarget(slide.part, fallbackImageRel.Target)
	assert.equal(choiceImagePart, fallbackImagePart, `${state}: Choice/Fallback must resolve to the same thumbnail part`)
	if (state !== 'powerpoint-roundtrip') assert.equal(choiceImageRid, fallbackImageRid, `${state}: generated Choice/Fallback must share one image relationship`)
	assert.equal(fallbackSlideRel?.Type, `${REL_TYPE}slide`, `${state}: Section Zoom fallback slide rel`)
	assert.equal(resolveRelationshipTarget(slide.part, fallbackSlideRel.Target), target.slideParts[0], `${state}: fallback must target first slide in section`)
	const choiceXfrm = readXfrm(elements(choice, 'xfrm').find(item => item.parentNode?.localName === 'graphicFrame'))
	const fallbackXfrm = readXfrm(elements(picture, 'xfrm')[0])
	assert.deepEqual(fallbackXfrm, choiceXfrm, `${state}: Section Zoom Choice/Fallback geometry`)
	const imageBytes = await pkg.zip.file(choiceImagePart).async('nodebuffer')
	assert.equal(imageBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${state}: Section Zoom PNG signature`)
	return {
		hostPart: slide.part, targetTitle: target.title, targetSectionId: target.id, targetPart: target.slideParts[0],
		fallbackSlideRid, imageRids: [...new Set([choiceImageRid, fallbackImageRid])], imagePart: choiceImagePart,
		transitionDur: Number(zmPr.getAttribute('transitionDur')), geometry: choiceXfrm, thumbnailSha256: sha256(imageBytes),
	}
}

async function inspectSummaryZoom(pkg, presentation, expectation) {
	const state = expectation.state
	const matches = []
	for (const slide of presentation.slides) {
		const document = pkg.documents.get(slide.part)
		for (const node of elements(document, 'summaryZm').filter(item => item.namespaceURI === PSUZ_NS)) matches.push({ slide, document, node })
	}
	if (!expectation.summaryZoom) {
		assert.equal(matches.length, 0, `${state}: Summary Zoom must be absent`)
		assert.equal(presentation.sections.some(section => section.title === expectation.summarySectionTitle), false, `${state}: generated Summary Section must be absent`)
		return null
	}
	assert.equal(matches.length, 1, `${state}: exactly one Summary Zoom`)
	const { slide, node } = matches[0]
	assert.equal(slide.index, expectation.summaryIndex, `${state}: Summary Zoom slide index`)
	const summarySection = presentation.sections.find(section => section.title === expectation.summarySectionTitle)
	assert.ok(summarySection, `${state}: generated Summary Section`)
	assert.deepEqual(summarySection.slideParts, [slide.part], `${state}: Summary Section owns only the summary slide`)
	const graphicData = node.parentNode
	const choice = graphicData.parentNode?.parentNode?.parentNode
	const alternate = choice?.parentNode
	assert.equal(graphicData?.getAttribute('uri'), PSUZ_NS, `${state}: Summary Zoom graphicData URI`)
	assert.equal(choice?.localName, 'Choice', `${state}: Summary Zoom Choice`)
	assert.equal(choice?.getAttribute('Requires'), 'psuz', `${state}: Summary Zoom Choice Requires`)
	if (state !== 'powerpoint-roundtrip') assert.equal(choice.getAttribute('xmlns:psuz'), PSUZ_NS, `${state}: generated Choice-local psuz declaration`)
	assert.equal(alternate?.localName, 'AlternateContent', `${state}: Summary Zoom AlternateContent`)
	const objectNodes = elementChildren(node).filter(item => item.localName === 'summaryZmObj')
	assert.deepEqual(objectNodes.map(item => item.namespaceURI), objectNodes.map(() => PSUZ_NS), `${state}: Summary Zoom object namespaces`)
	assert.equal(objectNodes.length, expectation.summaryTargets.length, `${state}: Summary Zoom item count`)
	assert.equal(elementChildren(node).at(-1)?.localName, 'gridLayout', `${state}: trailing gridLayout marker`)
	const sectionById = new Map(presentation.sections.map(section => [section.id, section]))
	const rels = relationshipMap(pkg, slide.part)
	const fallback = directChild(alternate, 'Fallback')
	const group = directChild(fallback, 'grpSp')
	assert.ok(group, `${state}: Summary Zoom group fallback`)
	const pictures = elementChildren(group).filter(item => item.localName === 'pic')
	assert.equal(pictures.length, objectNodes.length, `${state}: one fallback picture per Summary Zoom object`)
	const items = []
	for (let index = 0; index < objectNodes.length; index += 1) {
		const object = objectNodes[index]
		const target = sectionById.get(object.getAttribute('sectionId'))
		assert.equal(target?.title, expectation.summaryTargets[index], `${state}: Summary Zoom semantic target ${index}`)
		const zmPr = directChild(object, 'zmPr')
		const { blipFill, spPr } = assertZoomPropertyShape(zmPr, PSUZ_NS, state)
		assert.equal(Number(zmPr.getAttribute('transitionDur')), expectation.summaryTransition, `${state}: Summary Zoom transition ${index}`)
		const choiceImageRid = relationshipId(elements(blipFill, 'blip')[0], 'embed')
		const picture = pictures[index]
		const fallbackImageRid = relationshipId(elements(picture, 'blip')[0], 'embed')
		const hyperlink = elements(picture, 'hlinkClick')[0]
		assert.equal(hyperlink?.getAttribute('action'), 'ppaction://hlinksldjump', `${state}: Summary Zoom fallback action ${index}`)
		const slideRid = relationshipId(hyperlink)
		const choiceImageRel = rels.get(choiceImageRid)
		const fallbackImageRel = rels.get(fallbackImageRid)
		const slideRel = rels.get(slideRid)
		assert.equal(choiceImageRel?.Type, `${REL_TYPE}image`, `${state}: Summary Zoom Choice image rel ${index}`)
		assert.equal(fallbackImageRel?.Type, `${REL_TYPE}image`, `${state}: Summary Zoom fallback image rel ${index}`)
		const choicePart = resolveRelationshipTarget(slide.part, choiceImageRel.Target)
		const fallbackPart = resolveRelationshipTarget(slide.part, fallbackImageRel.Target)
		assert.equal(choicePart, fallbackPart, `${state}: Summary Zoom Choice/Fallback image target ${index}`)
		if (state !== 'powerpoint-roundtrip') assert.equal(choiceImageRid, fallbackImageRid, `${state}: generated Summary Zoom shared image relationship ${index}`)
		assert.equal(slideRel?.Type, `${REL_TYPE}slide`, `${state}: Summary Zoom fallback slide rel ${index}`)
		assert.equal(resolveRelationshipTarget(slide.part, slideRel.Target), target.slideParts[0], `${state}: Summary Zoom fallback target ${index}`)
		const bytes = await pkg.zip.file(choicePart).async('nodebuffer')
		assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${state}: Summary Zoom PNG ${index}`)
		items.push({ targetTitle: target.title, targetSectionId: target.id, targetPart: target.slideParts[0], imageRids: [...new Set([choiceImageRid, fallbackImageRid])], imagePart: choicePart, slideRid, transitionDur: Number(zmPr.getAttribute('transitionDur')), tileGeometry: readXfrm(directChild(spPr, 'xfrm')), thumbnailSha256: sha256(bytes) })
	}
	assert.equal(new Set(items.map(item => item.slideRid)).size, items.length, `${state}: each Summary Zoom fallback owns an independent slide relationship`)
	if (state !== 'powerpoint-roundtrip') {
		assert.equal(new Set(items.map(item => item.imageRids[0])).size, items.length, `${state}: generated Summary Zoom items own independent image relationships`)
		assert.equal(new Set(items.map(item => item.imagePart)).size, items.length, `${state}: generated Summary Zoom items own independent image parts`)
	}
	const choiceFrame = readXfrm(elements(choice, 'xfrm').find(item => item.parentNode?.localName === 'graphicFrame'))
	const fallbackFrame = readXfrm(directChild(directChild(group, 'grpSpPr'), 'xfrm'))
	assert.deepEqual(fallbackFrame, choiceFrame, `${state}: Summary Zoom Choice/Fallback frame geometry`)
	return { hostPart: slide.part, summarySectionId: summarySection.id, frameGeometry: choiceFrame, targets: items }
}

async function inspectPackage(buffer, expectation) {
	const pkg = await loadPackage(buffer, expectation.state)
	const presentation = presentationTopology(pkg, expectation.state)
	const sectionZoom = await inspectSectionZoom(pkg, presentation, expectation)
	const summaryZoom = await inspectSummaryZoom(pkg, presentation, expectation)
	return { state: expectation.state, slides: presentation.slides, sections: presentation.sections, sectionZoom, summaryZoom, packageSha256: sha256(buffer), partCount: pkg.names.length }
}

export async function inspectSectionSummaryZoomPackage(source, expectation) {
	const buffer = Buffer.isBuffer(source) ? source : await fs.readFile(source)
	return inspectPackage(buffer, expectation)
}

function publicMetadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'Prove native section navigation without package repair.', remember: 'Section identity, Zoom fallback, and relationship closure remain durable.' },
		visualDesign: { world: 'section navigation proof', framing: 'native interactive carriers', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single deck clock' },
	}
}

function textBlock(name, text, color = '111827') {
	return { kind: 'textBox', name, objectName: name, text, style: { fontFace: 'Aptos', fontSize: 24, color } }
}

const SLIDE_DEFINITIONS = Object.freeze({
	host: { id: 'host', title: 'Navigation', layoutIntent: 'title-only', content: [textBlock('host-label', 'SECTION ZOOM HOST', '1D4ED8')] },
	'overview-1': { id: 'overview-1', title: 'Overview One', layoutIntent: 'title-only', content: [textBlock('overview-one-label', 'OVERVIEW ONE', '0F766E')] },
	'overview-2': { id: 'overview-2', title: 'Overview Two', layoutIntent: 'title-only', content: [textBlock('overview-two-label', 'OVERVIEW TWO', '0F766E')] },
	'details-1': { id: 'details-1', title: 'Details One', layoutIntent: 'title-only', content: [textBlock('details-one-label', 'DETAILS ONE', '7C3AED')] },
	'details-2': { id: 'details-2', title: 'Details Two', layoutIntent: 'title-only', content: [textBlock('details-two-label', 'DETAILS TWO', '7C3AED')] },
})

function fullSpec({
	order = ['host', 'overview-1', 'overview-2', 'details-1', 'details-2'],
	sectionOrder = ['navigation', 'overview', 'details'], sectionZoom = true, sectionTargetId = 'details', sectionTransition = 1600,
	sectionGeometry = { x: 1.2, y: 1.7, w: 4.4, h: 2.5 }, summaryZoom = true,
	summarySectionIds = ['overview', 'details'], summaryTransition = 1400, summarySectionTitle = 'Summary Section',
	title = 'Section and Summary Zoom lifecycle proof',
} = {}) {
	const slides = order.map(id => structuredClone(SLIDE_DEFINITIONS[id]))
	const host = slides.find(slide => slide.id === 'host')
	host.sectionZoom = sectionZoom ? {
		name: NAMES.section, targetSectionId: sectionTargetId, transitionDur: sectionTransition,
		altText: `Native Section Zoom to ${SECTION_TITLES[sectionTargetId] || sectionTargetId}`, bbox: sectionGeometry,
	} : null
	const memberships = {
		navigation: order.filter(id => id === 'host'),
		overview: order.filter(id => id.startsWith('overview-')),
		details: order.filter(id => id.startsWith('details-')),
	}
	return {
		...publicMetadata(title), theme: { name: 'Section Zoom proof', palette: ['F8FAFC', '111827', '0F766E', '7C3AED'], fontFace: 'Aptos' },
		sections: sectionOrder.map(sectionId => ({ id: sectionId, title: SECTION_TITLES[sectionId], slideIds: memberships[sectionId] })),
		slides,
		summaryZoom: summaryZoom ? { name: NAMES.summary, sectionIds: summarySectionIds, summarySectionTitle, transitionDur: summaryTransition, altText: 'Native Summary Zoom navigation' } : null,
	}
}

async function pptxBuffer(entry) { return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false })) }
function normalizedCoreProperties(bytes) {
	const document = parseXmlStrict(bytes.toString('utf8'), 'canonical core properties')
	for (const [namespace, localName] of [[DCTERMS_NS, 'created'], [DCTERMS_NS, 'modified'], [CORE_NS, 'lastPrinted']]) {
		for (const node of Array.from(document.getElementsByTagNameNS(namespace, localName))) node.textContent = ''
	}
	return Buffer.from(new XMLSerializer().serializeToString(document), 'utf8')
}
async function semanticPackageDiff(beforeBuffer, afterBuffer) {
	const [beforeZip, afterZip] = await Promise.all([JSZip.loadAsync(beforeBuffer), JSZip.loadAsync(afterBuffer)])
	const names = [...new Set([...Object.keys(beforeZip.files), ...Object.keys(afterZip.files)])].sort()
	const semanticChanged = []
	for (const name of names) {
		const before = beforeZip.file(name)
		const after = afterZip.file(name)
		if (!before || !after) { if (before || after) semanticChanged.push({ name, reason: 'part-presence' }); continue }
		let [a, b] = await Promise.all([before.async('nodebuffer'), after.async('nodebuffer')])
		if (name === 'docProps/core.xml') { a = normalizedCoreProperties(a); b = normalizedCoreProperties(b) }
		if (sha256(a) !== sha256(b)) semanticChanged.push({ name, before: sha256(a), after: sha256(b) })
	}
	return { semanticPayloadsEqual: semanticChanged.length === 0, semanticChanged }
}
async function writeImmutable(file, bytes) { await fs.writeFile(file, bytes, { flag: 'wx' }) }
async function writeState(outputDir, entry, expectation, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const second = await pptxBuffer(entry)
	const deterministic = await semanticPackageDiff(buffer, second)
	assert.equal(deterministic.semanticPayloadsEqual, true, `${expectation.state}: repeated write changed stable package members: ${JSON.stringify(deterministic.semanticChanged)}`)
	const file = path.join(outputDir, `section-summary-zoom-${expectation.state}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, expectation)
	inspection.repeatedWriteStable = true
	artifacts[expectation.state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { file, buffer, inspection }
}

async function commit(mcp, entry, deckId, spec, commitMode, label) {
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		...(entry ? { deckId, deckVersion: entry.deckVersion } : {}), spec, phase: 'commit', commitMode,
		plan: 'premium', billingConfirmed: true, detail: 'full',
	})
	return dataOf(label, result)
}

function assertExportedSpec(spec) {
	assert.ok(spec.summaryZoom && typeof spec.summaryZoom === 'object', 'export: structured top-level summaryZoom')
	assert.equal(spec.summaryZoom.name, NAMES.summary, 'export: Summary Zoom required name')
	assert.deepEqual(spec.summaryZoom.sectionIds, ['details', 'overview'], 'export: durable Summary Zoom target order')
	assert.equal(spec.summaryZoom.summarySectionTitle, 'Summary Section', 'export: Summary Section title')
	assert.equal(spec.summaryZoom.transitionDur, 1750, 'export: Summary Zoom transition')
	const host = spec.slides.find(slide => slide.id === 'host')
	assert.ok(host, 'export: semantic host slide')
	assert.ok(host.sectionZoom && typeof host.sectionZoom === 'object', 'export: structured per-slide sectionZoom')
	assert.equal(host.sectionZoom.name, NAMES.section, 'export: Section Zoom required name')
	assert.equal(host.sectionZoom.targetSectionId, 'details', 'export: durable Section Zoom semantic target')
	assert.equal(host.sectionZoom.transitionDur, 1900, 'export: Section Zoom transition')
	assert.ok(host.sectionZoom.bbox && host.sectionZoom.bbox.w > 0 && host.sectionZoom.bbox.h > 0, 'export: standard Section Zoom bbox')
	assert.equal(spec.slides.length, 5, 'export: generated Summary Zoom slide must not become authored slide input')
	assert.equal(spec.sections.length, 3, 'export: generated Summary Section must not become authored section input')
	assert.equal((spec.slides || []).flatMap(slide => slide.content || []).some(block => block.kind === 'opaqueNative' && [NAMES.section, NAMES.summary].some(name => nameMatches(String(block.name || block.objectName || ''), name))), false, 'export: authored Zooms must not degrade to opaqueNative')
	assert.doesNotMatch(JSON.stringify(spec), /_summary|_zoom|_slideRid|_rId|rawPackageParts|pptxgenjs|node_modules/i, 'export: private carrier leakage')
}

function portableSpec(spec) {
	return {
		...structuredClone(spec), nativePackagePreservation: false,
		slides: (spec.slides || []).map(slide => {
			const { nativeTimingPreservation, ...portableSlide } = structuredClone(slide)
			return { ...portableSlide, content: (portableSlide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
				const { editHandle, nativePreservation, preservationHandle, ...semantic } = block
				return semantic
			}) }
		}),
	}
}

async function rejectedMutation(mcp, entry, deckId, spec, label) {
	const beforeVersion = entry.deckVersion
	const before = await pptxBuffer(entry)
	let result
	try {
		result = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: beforeVersion, spec, phase: 'commit', commitMode: 'replaceDeck', plan: 'premium', billingConfirmed: true, detail: 'full',
		})
	} catch (error) {
		result = { ok: false, error: { code: error?.code, message: error?.message || String(error) } }
	}
	const after = await pptxBuffer(entry)
	const diff = await semanticPackageDiff(before, after)
	assert.equal(result?.ok, false, `${label}: invalid semantic target must be rejected`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: deckVersion changed`)
	assert.equal(diff.semanticPayloadsEqual, true, `${label}: rejected replacement changed live package: ${JSON.stringify(diff.semanticChanged)}`)
	return { label, rejected: true, diagnostic: JSON.stringify(result).slice(0, 1400), versionUnchanged: true, semanticPackageUnchanged: true }
}

async function directSerializerProbe() {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	pptx.addSection({ title: 'Navigation' })
	pptx.addSection({ title: 'Overview' })
	pptx.addSection({ title: 'Details' })
	const host = pptx.addSlide({ sectionTitle: 'Navigation' })
	host.addText('SECTION ZOOM HOST', { x: 0.8, y: 0.5, w: 5, h: 0.6, fontSize: 24 })
	pptx.addSlide({ sectionTitle: 'Overview' }).addText('OVERVIEW ONE', { x: 1, y: 1, w: 4, h: 1 })
	pptx.addSlide({ sectionTitle: 'Overview' }).addText('OVERVIEW TWO', { x: 1, y: 1, w: 4, h: 1 })
	pptx.addSlide({ sectionTitle: 'Details' }).addText('DETAILS ONE', { x: 1, y: 1, w: 4, h: 1 })
	pptx.addSlide({ sectionTitle: 'Details' }).addText('DETAILS TWO', { x: 1, y: 1, w: 4, h: 1 })
	host.addSectionZoom({ targetSection: 'Details', x: 1.2, y: 1.7, w: 4.4, h: 2.5, transitionDur: 1600, objectName: NAMES.section, altText: 'Native Section Zoom to Details' })
	pptx.addSummaryZoom({ sections: ['Overview', 'Details'], summarySectionTitle: 'Summary Section', transitionDur: 1400, objectName: NAMES.summary, altText: 'Native Summary Zoom navigation' })
	const buffer = Buffer.from(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const topology = await inspectPackage(buffer, { state: 'direct-serializer-probe', hostIndex: 0, sectionZoom: true, sectionTarget: 'Details', sectionTransition: 1600, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Overview', 'Details'], summaryTransition: 1400, summarySectionTitle: 'Summary Section' })
	return { ready: true, packageSha256: sha256(buffer), topology }
}

async function pixelEvidence(files) {
	const evidence = []
	for (const file of files) {
		const image = sharp(file)
		const metadata = await image.metadata()
		const raw = await image.removeAlpha().raw().toBuffer()
		evidence.push({ file: relative(file), width: metadata.width, height: metadata.height, bytesSha256: sha256(await fs.readFile(file)), pixelSha256: sha256(raw) })
	}
	return evidence
}

async function runOfficeProof(inputPath, outputDir, slideCount) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const outputPath = path.join(outputDir, 'section-summary-zoom-savecopyas.pptx')
	const reportPath = path.join(outputDir, 'section-summary-zoom-office-com.json')
	const sourceRenderDir = path.join(outputDir, 'render-source')
	const roundtripRenderDir = path.join(outputDir, 'render-roundtrip')
	await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-section-summary-zoom-unit-v1.ps1'), '-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath, '-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 240000, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', 'PowerPoint COM proof status')
	assert.equal(report.method, 'Presentations.Open2007', 'repair-disabled method')
	assert.equal(report.openAndRepair, false, 'repair-disabled open')
	assert.equal(report.source.SlideCount, slideCount, 'source slide count')
	assert.equal(report.roundtrip.SlideCount, slideCount, 'roundtrip slide count')
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint COM/section semantic snapshot changed after SaveCopyAs/reopen')
	const sourceFiles = (await fs.readdir(sourceRenderDir)).filter(name => name.endsWith('.png')).sort().map(name => path.join(sourceRenderDir, name))
	const roundtripFiles = (await fs.readdir(roundtripRenderDir)).filter(name => name.endsWith('.png')).sort().map(name => path.join(roundtripRenderDir, name))
	assert.equal(sourceFiles.length, slideCount, 'render every generated slide')
	assert.equal(roundtripFiles.length, slideCount, 'render every reopened slide')
	const sourcePixels = await pixelEvidence(sourceFiles)
	const roundtripPixels = await pixelEvidence(roundtripFiles)
	assert.deepEqual(roundtripPixels.map(item => [item.width, item.height, item.pixelSha256]), sourcePixels.map(item => [item.width, item.height, item.pixelSha256]), 'PowerPoint source/reopened slide pixels changed')
	const buffer = await fs.readFile(outputPath)
	return { status: 'PASS', reportFile: relative(reportPath), roundtripFile: relative(outputPath), roundtripSha256: sha256(buffer), sourceRenders: sourcePixels, roundtripRenders: roundtripPixels, report, buffer }
}

export async function probeSectionSummaryZoomRuntime() {
	try { return await directSerializerProbe() }
	catch (error) { return { ready: false, message: error.message, stack: error.stack } }
}

export async function runSectionSummaryZoomUnitProof({ outputDir, office = false } = {}) {
	assert.equal(SECTION_SUMMARY_ZOOM_ROWS.length, 2)
	const directRuntime = await probeSectionSummaryZoomRuntime()
	assert.equal(directRuntime.ready, true, `core serializer dependency: ${JSON.stringify(directRuntime)}`)
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-section-summary-zoom-${timestamp()}-`))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `section-summary-zoom-${Date.now()}`, clientInfo: { name: 'section-summary-zoom-public-verifier', version: '1' }, blackBox: false, __skipDurableOperationLedger: true })
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	const negatives = []
	let entry
	try {
		const created = await commit(mcp, null, null, fullSpec(), 'createNew', 'initial public Section/Summary Zoom commit')
		deckIds.push(created.deckId)
		entry = getDeck(created.deckId)
		await writeState(resolvedOutput, entry, { state: 'initial', hostIndex: 0, sectionZoom: true, sectionTarget: 'Details', sectionTransition: 1600, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Overview', 'Details'], summaryTransition: 1400, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, fullSpec({ sectionTargetId: 'overview', sectionTransition: 1200, sectionGeometry: { x: 5.8, y: 2, w: 3.8, h: 2.2 }, summarySectionIds: ['details'], summaryTransition: 1100, title: 'Updated Section and Summary Zoom' }), 'replaceDeck', 'public Zoom update replacement')
		entry = getDeck(created.deckId)
		await writeState(resolvedOutput, entry, { state: 'updated', hostIndex: 0, sectionZoom: true, sectionTarget: 'Overview', sectionTransition: 1200, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Details'], summaryTransition: 1100, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, fullSpec({ sectionZoom: false, summaryZoom: false, title: 'Reset Section and Summary Zoom' }), 'replaceDeck', 'public Zoom null reset replacement')
		entry = getDeck(created.deckId)
		await writeState(resolvedOutput, entry, { state: 'reset', hostIndex: 0, sectionZoom: false, sectionTarget: null, sectionTransition: 1000, summaryZoom: false, summaryIndex: null, summaryTargets: [], summaryTransition: 1000, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, fullSpec({ sectionTargetId: 'details', sectionTransition: 1900, sectionGeometry: { x: 1, y: 1, w: 3.333, h: 1.875 }, summarySectionIds: ['details', 'overview'], summaryTransition: 1750, title: 'Re-edited Section and Summary Zoom' }), 'replaceDeck', 'public Zoom re-edit replacement')
		entry = getDeck(created.deckId)
		await writeState(resolvedOutput, entry, { state: 'reedited', hostIndex: 0, sectionZoom: true, sectionTarget: 'Details', sectionTransition: 1900, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Details', 'Overview'], summaryTransition: 1750, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		const reorderedSpec = fullSpec({ order: ['details-1', 'details-2', 'host', 'overview-1', 'overview-2'], sectionOrder: ['details', 'navigation', 'overview'], sectionTargetId: 'details', sectionTransition: 1900, sectionGeometry: { x: 1, y: 1, w: 3.333, h: 1.875 }, summarySectionIds: ['details', 'overview'], summaryTransition: 1750, title: 'Reordered Section and Summary Zoom' })
		await commit(mcp, entry, created.deckId, reorderedSpec, 'replaceDeck', 'public slide/section reorder replacement')
		entry = getDeck(created.deckId)
		const reordered = await writeState(resolvedOutput, entry, { state: 'reordered', hostIndex: 2, sectionZoom: true, sectionTarget: 'Details', sectionTransition: 1900, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Details', 'Overview'], summaryTransition: 1750, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, fullSpec({ order: ['details-1', 'details-2', 'host', 'overview-1', 'overview-2'], sectionOrder: ['details', 'navigation', 'overview'], sectionZoom: false, summaryZoom: false, title: 'Deleted Section and Summary Zoom objects' }), 'replaceDeck', 'public Zoom deletion replacement')
		entry = getDeck(created.deckId)
		await writeState(resolvedOutput, entry, { state: 'deleted', hostIndex: 2, sectionZoom: false, sectionTarget: null, sectionTransition: 1000, summaryZoom: false, summaryIndex: null, summaryTargets: [], summaryTransition: 1000, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, reorderedSpec, 'replaceDeck', 'public final re-add replacement')
		entry = getDeck(created.deckId)
		const finalState = await writeState(resolvedOutput, entry, { state: 'final-readded', hostIndex: 2, sectionZoom: true, sectionTarget: 'Details', sectionTransition: 1900, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Details', 'Overview'], summaryTransition: 1750, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		negatives.push(await rejectedMutation(mcp, entry, created.deckId, fullSpec({ sectionTargetId: 'missing-section', title: 'Reject unknown Section Zoom target' }), 'unknown Section Zoom target replacement fails closed'))
		negatives.push(await rejectedMutation(mcp, entry, created.deckId, fullSpec({ summarySectionIds: ['missing-section'], title: 'Reject unknown Summary Zoom target' }), 'unknown Summary Zoom target replacement fails closed'))
		const emptyTarget = fullSpec({ sectionTargetId: 'empty-section', title: 'Reject empty Section Zoom target' })
		emptyTarget.sections.push({ id: 'empty-section', title: 'Empty Section', slideIds: [] })
		negatives.push(await rejectedMutation(mcp, entry, created.deckId, emptyTarget, 'empty Section Zoom target replacement fails closed'))

		const exported = dataOf('current spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' }))
		const exportedFile = path.join(resolvedOutput, 'section-summary-zoom-exported-spec.json')
		await writeImmutable(exportedFile, Buffer.from(`${JSON.stringify(exported.spec, null, 2)}\n`))
		artifacts.exportedSpec = { file: relative(exportedFile), sha256: sha256(await fs.readFile(exportedFile)) }
		assertExportedSpec(exported.spec)
		const portable = portableSpec(exported.spec)
		const portableFile = path.join(resolvedOutput, 'section-summary-zoom-portable-spec.json')
		await writeImmutable(portableFile, Buffer.from(`${JSON.stringify(portable, null, 2)}\n`))
		artifacts.portableSpec = { file: relative(portableFile), sha256: sha256(await fs.readFile(portableFile)) }
		const replay = await commit(mcp, null, null, portable, 'createNew', 'portable Zoom export replay')
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		await writeState(resolvedOutput, replayEntry, { state: 'replayed', hostIndex: 2, sectionZoom: true, sectionTarget: 'Details', sectionTransition: 1900, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Details', 'Overview'], summaryTransition: 1750, summarySectionTitle: 'Summary Section' }, artifacts, lifecycle)

		let officeResult = { status: office ? 'not-run' : 'dependency-gated', reason: office ? 'not-run' : 'Pass --office to run the isolated Microsoft PowerPoint proof.' }
		if (office) {
			officeResult = await runOfficeProof(finalState.file, resolvedOutput, 6)
			officeResult.package = await inspectPackage(officeResult.buffer, { state: 'powerpoint-roundtrip', hostIndex: 2, sectionZoom: true, sectionTarget: 'Details', sectionTransition: 1900, summaryZoom: true, summaryIndex: 5, summaryTargets: ['Details', 'Overview'], summaryTransition: 1750, summarySectionTitle: 'Summary Section' })
			delete officeResult.buffer
		}

		return {
			schemaVersion: 'betterpptx.section-summary-zoom-unit-proof.v1', unitId: SECTION_SUMMARY_ZOOM_UNIT_ID,
			status: officeResult.status === 'PASS' ? 'SECTION_SUMMARY_ZOOM_PACKAGE_AND_OFFICE_VERIFIED' : 'SECTION_SUMMARY_ZOOM_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(), rows: SECTION_SUMMARY_ZOOM_ROWS.map(([id, label]) => ({ id, label })),
			proofBoundary: {
				sectionZoom: 'mc:AlternateContent with psez Choice graphicFrame plus one locked-picture Fallback; sectionId resolves to p14:sectionLst and the fallback slide relationship resolves to that section first slide.',
				summaryZoom: 'A generated summary slide and Summary Section carry one psuz summaryZmObj plus one fallback picture per selected authored section; every section GUID, image relationship, and first-slide jump must close.',
				publicLifecycle: 'Named slides[].sectionZoom(s).targetSectionId and named top-level summaryZoom.sectionIds are the public semantic source over durable sections[].id values. Null removes generated carriers; export omits generated summary slide/section scaffolding and replay regenerates it once.',
				officeCanonicalization: 'Generated checkpoints require each Choice/Fallback pair to share an image relationship and each Summary item to own a distinct image edge/part. After repair-disabled SaveCopyAs/reopen only, PowerPoint may hoist namespaces, split a Choice/Fallback relationship pair, coalesce byte-identical neutral thumbnails across Summary items, and re-layout internal Summary tile transforms when section targets, first-slide fallback edges, outer COM geometry, and rendered pixels remain stable.',
			},
			directRuntime, lifecycle, negatives, office: officeResult, artifacts,
			checks: { xmlParseCrcAndOpcClosure: true, sectionGuidAndFirstSlideBinding: true, exactChoiceFallbackTopology: true, summaryGridAndPerSectionClosure: true, updateNullResetReeditDelete: true, exportPortableReplay: true, reorderRetargetsBySectionIdentity: true, invalidTargetsFailClosedNoMutation: true, repeatedWriteStable: true, repairDisabledOfficeAndPixelRenders: officeResult.status === 'PASS' },
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	if (process.argv.includes('--probe')) {
		console.log(JSON.stringify({ schemaVersion: 'betterpptx.section-summary-zoom-runtime-probe.v1', unitId: SECTION_SUMMARY_ZOOM_UNIT_ID, ...(await probeSectionSummaryZoomRuntime()) }, null, 2))
		return
	}
	const office = process.argv.includes('--office')
	const outputDir = process.env.BETTERPPTX_SECTION_SUMMARY_ZOOM_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-section-summary-zoom-${timestamp()}-`))
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'section-summary-zoom-unit-proof.json')
	let proof
	try { proof = await runSectionSummaryZoomUnitProof({ outputDir, office }) }
	catch (error) {
		proof = { schemaVersion: 'betterpptx.section-summary-zoom-unit-proof.v1', unitId: SECTION_SUMMARY_ZOOM_UNIT_ID, status: error.code || 'SECTION_SUMMARY_ZOOM_PROOF_FAILED', generatedAt: new Date().toISOString(), failure: { message: error.message, stack: error.stack } }
	}
	await writeImmutable(proofPath, Buffer.from(`${JSON.stringify({ ...proof, proofPath: relative(proofPath) }, null, 2)}\n`))
	console.log(JSON.stringify({ ...proof, proofPath: relative(proofPath) }, null, 2))
	if (!String(proof.status || '').includes('VERIFIED')) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) await main()
