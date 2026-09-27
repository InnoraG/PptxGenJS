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
const ZOOM_URI = 'http://schemas.microsoft.com/office/powerpoint/2016/slidezoom'
const PSLZ_NS = ZOOM_URI
const P166_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/6/main'
const DCTERMS_NS = 'http://purl.org/dc/terms/'
const CORE_NS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
const NAMES = Object.freeze({ jump: 'jump-to-slide', zoom: 'native-slide-zoom' })

export const SLIDE_ZOOM_JUMP_UNIT_ID = 'impl-b-3f5d04322d51e076'
export const SLIDE_ZOOM_JUMP_ROWS = Object.freeze([
	['cap_3cbed884e2e57a42232c', 'slide zoom'],
	['cap_f4961a44a304c4d91694', 'jump to slide'],
])

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function timestamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function relative(file) {
	return path.relative(workspaceRoot, file).replaceAll(path.sep, '/')
}

function dataOf(label, result) {
	if (!result?.ok) {
		const error = new Error(`${label} failed: ${JSON.stringify(result)}`)
		error.code = result?.error?.code || 'SLIDE_ZOOM_PUBLIC_CONTRACT_BLOCKED'
		throw error
	}
	return result.data || result
}

function parseXmlStrict(xml, label) {
	const errors = []
	const document = new DOMParser({
		errorHandler: {
			warning: message => errors.push(`warning: ${message}`),
			error: message => errors.push(`error: ${message}`),
			fatalError: message => errors.push(`fatal: ${message}`),
		},
	}).parseFromString(String(xml), 'application/xml')
	assert.deepEqual(errors, [], `${label}: XML parse diagnostics: ${errors.join(' | ')}`)
	assert.notEqual(document.documentElement?.localName, 'parsererror', `${label}: parsererror root`)
	return document
}

function elements(node, localName) {
	return Array.from(node?.getElementsByTagName('*') || []).filter(item => item.localName === localName)
}

function elementChildren(node) {
	return Array.from(node?.childNodes || []).filter(item => item.nodeType === 1)
}

function directChild(node, localName) {
	return elementChildren(node).find(item => item.localName === localName) || null
}

function relationshipId(node, attribute = 'id') {
	return node?.getAttributeNS(REL_NS, attribute) || node?.getAttribute(`r:${attribute}`) || ''
}

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

function nameMatches(actual, wanted) {
	return actual === wanted || actual.endsWith(`.${wanted}`) || actual.includes(`.${wanted}.`)
}

function cNvPrByName(document, wanted) {
	const matches = elements(document, 'cNvPr').filter(node => nameMatches(node.getAttribute('name'), wanted))
	assert.ok(matches.length >= 1, `missing cNvPr ${wanted}`)
	return matches
}

function directHyperlink(carrier) {
	return elementChildren(carrier).find(node => node.localName === 'hlinkClick') || null
}

function readXfrm(node) {
	const off = directChild(node, 'off') || elements(node, 'off')[0]
	const ext = directChild(node, 'ext') || elements(node, 'ext')[0]
	assert.ok(off && ext, 'transform must have offset and extent')
	return {
		x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')),
		cx: Number(ext.getAttribute('cx')), cy: Number(ext.getAttribute('cy')),
	}
}

function publicMetadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'Prove native slide navigation without package repair.', remember: 'Slide identity, Zoom fallback, and relationship closure remain durable.' },
		visualDesign: { world: 'navigation proof', framing: 'native interactive carriers', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single deck clock' },
	}
}

function textBlock(name, text) {
	return { kind: 'textBox', name, objectName: name, text, style: { fontFace: 'Aptos', fontSize: 24, color: '111827' } }
}

function jumpBlock(targetSlideId = 'target-c', tooltip = 'Jump to target C', actionOverride = undefined) {
	return {
		kind: 'textShape', name: NAMES.jump, objectName: NAMES.jump, shapeName: 'roundRect', text: 'Jump to slide',
		style: { fill: { color: '2563EB' }, color: 'FFFFFF', fontSize: 20 },
		action: actionOverride === undefined ? { click: { type: 'slide', targetSlideId, tooltip } } : actionOverride,
	}
}

function zoomBlock(overrides = {}) {
	return {
		kind: 'slideZoom', name: NAMES.zoom, targetSlideId: 'target-c', returnToParent: true,
		transitionDur: 1750, altText: 'Native Slide Zoom to target C', ...overrides,
	}
}


function fullSpec({ order = ['host-a', 'target-b', 'target-c'], jump = true, jumpAction = undefined, zoom = true, zoomOverrides = {}, title = 'Slide Zoom and jump lifecycle proof' } = {}) {
	const targetId = zoomOverrides.targetSlideId || 'target-c'
	const targetLabel = targetId === 'target-b' ? 'B' : targetId === 'target-c' ? 'C' : targetId
	const definitions = {
		'host-a': {
			id: 'host-a', title: 'Host navigation slide', layoutIntent: 'title-only', content: [
				...(jump ? [jumpBlock(targetId, `Jump to target ${targetLabel}`, jumpAction)] : []),
				...(zoom ? [zoomBlock(zoomOverrides)] : []),
			],
		},
		'target-b': { id: 'target-b', title: 'Target B', layoutIntent: 'title-only', content: [textBlock('target-b-label', 'TARGET B')] },
		'target-c': { id: 'target-c', title: 'Target C', layoutIntent: 'title-only', content: [textBlock('target-c-label', 'TARGET C')] },
	}
	return { ...publicMetadata(title), theme: { name: 'Slide navigation proof', palette: ['F8FAFC', '111827', '2563EB', '7C3AED'], fontFace: 'Aptos' }, slides: order.map(id => structuredClone(definitions[id])) }
}

function patchSpec({ jumpAction, zoomPatch, title }) {
	const content = []
	if (jumpAction !== undefined) content.push({ kind: 'textShape', name: NAMES.jump, objectName: NAMES.jump, patch: { action: jumpAction } })
	if (zoomPatch !== undefined) content.push({ kind: 'slideZoom', name: NAMES.zoom, patch: zoomPatch })
	return { ...publicMetadata(title || 'Slide navigation sparse patch'), slides: [{ id: 'host-a', slideIndex: 0, layoutIntent: 'title-only', content }] }
}

function deleteSlidePatchSpec(slideId, slideIndex) {
	return { ...publicMetadata(`Reject deletion of live target ${slideId}`), slides: [{ id: slideId, slideIndex, delete: true, content: [] }] }
}

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
	for (const [name, document] of documents) {
		if (!name.endsWith('.rels')) continue
		const rels = relationshipRecords(document)
		assert.equal(new Set(rels.map(item => item.Id)).size, rels.length, `${state}/${name}: duplicate relationship ID`)
		const source = sourcePartForRelationships(name)
		for (const rel of rels.filter(item => item.TargetMode !== 'External')) {
			const target = resolveRelationshipTarget(source, rel.Target)
			assert.ok(nameSet.has(target), `${state}/${name}: dangling ${rel.Id} -> ${target}`)
		}
	}
	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${state}: missing [Content_Types].xml`)
	const { defaults, overrides } = contentTypeMaps(contentTypes)
	for (const part of overrides.keys()) assert.ok(nameSet.has(part), `${state}: content-type override targets absent part ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${state}: ${name} has no content type`)
	}
	const related = new Set()
	for (const [name, document] of documents) {
		if (!name.endsWith('.rels')) continue
		const source = sourcePartForRelationships(name)
		for (const rel of relationshipRecords(document).filter(item => item.TargetMode !== 'External')) related.add(resolveRelationshipTarget(source, rel.Target))
	}
	for (const mediaPart of names.filter(name => name.startsWith('ppt/media/'))) assert.ok(related.has(mediaPart), `${state}: orphan media ${mediaPart}`)
	return { zip, names, nameSet, documents, defaults, overrides }
}

function presentationSlideMap(pkg, state) {
	const presentation = pkg.documents.get('ppt/presentation.xml')
	const relDocument = pkg.documents.get('ppt/_rels/presentation.xml.rels')
	assert.ok(presentation && relDocument, `${state}: presentation carrier/rels`)
	const relMap = new Map(relationshipRecords(relDocument).map(rel => [rel.Id, rel]))
	const slides = elements(presentation, 'sldId').map((node, index) => {
		const rel = relMap.get(relationshipId(node))
		assert.ok(rel && rel.Type === `${REL_TYPE}slide`, `${state}: presentation slide relationship ${index}`)
		return { index, sldId: Number(node.getAttribute('id')), part: resolveRelationshipTarget('ppt/presentation.xml', rel.Target) }
	})
	return slides
}

function slidePart(index) {
	return `ppt/slides/slide${index + 1}.xml`
}

function assertJumpCarrier(document, rels, hostPart, expectedTargetPart, state, expected) {
	const candidates = cNvPrByName(document, NAMES.jump)
	const objectCarrier = candidates.find(node => directHyperlink(node)) || candidates[0]
	const link = directHyperlink(objectCarrier)
	if (!expected) {
		assert.equal(link, null, `${state}: jump action carrier must be reset/absent`)
		return null
	}
	assert.ok(link, `${state}: jump a:hlinkClick`)
	assert.equal(link.getAttribute('action'), 'ppaction://hlinksldjump', `${state}: jump action URI`)
	const rid = relationshipId(link)
	assert.ok(rid, `${state}: jump relationship ID`)
	const rel = rels.find(item => item.Id === rid)
	assert.ok(rel, `${state}: jump relationship exists`)
	assert.equal(rel.Type, `${REL_TYPE}slide`, `${state}: jump relationship type`)
	assert.equal(rel.TargetMode, '', `${state}: jump relationship is internal`)
	assert.equal(resolveRelationshipTarget(hostPart, rel.Target), expectedTargetPart, `${state}: jump target`)
	return rid
}

function zoomSemanticSignature(pkg, { state, hostIndex, targetIndex, expectedZoom, expectedJump, returnToParent, transitionDur }) {
	const hostPart = slidePart(hostIndex)
	const targetPart = slidePart(targetIndex)
	const document = pkg.documents.get(hostPart)
	const relDocument = pkg.documents.get(relationshipPartFor(hostPart))
	assert.ok(document && relDocument, `${state}: host slide and relationships`)
	const rels = relationshipRecords(relDocument)
	const jumpRid = assertJumpCarrier(document, rels, hostPart, targetPart, state, expectedJump)
	const alternates = elements(document, 'AlternateContent')
	if (!expectedZoom) {
		assert.equal(alternates.length, 0, `${state}: Slide Zoom carrier must be absent`)
		const zoomMedia = rels.filter(rel => rel.Type === `${REL_TYPE}image`).map(rel => resolveRelationshipTarget(hostPart, rel.Target))
		assert.deepEqual(zoomMedia, [], `${state}: stale Slide Zoom image relationship`)
		return { state, hostPart, targetPart, jumpRid, zoom: null }
	}
	assert.equal(alternates.length, 1, `${state}: exactly one mc:AlternateContent`)
	const alternate = alternates[0]
	const choice = directChild(alternate, 'Choice')
	const fallback = directChild(alternate, 'Fallback')
	assert.ok(choice && fallback, `${state}: separate Choice and Fallback`)
	assert.equal(choice.getAttribute('Requires'), 'pslz', `${state}: Choice Requires`)
	const graphicFrame = directChild(choice, 'graphicFrame')
	const fallbackPicture = directChild(fallback, 'pic')
	assert.ok(graphicFrame && fallbackPicture, `${state}: Choice graphicFrame and Fallback picture`)
	const graphicData = elements(graphicFrame, 'graphicData')[0]
	assert.equal(graphicData?.getAttribute('uri'), ZOOM_URI, `${state}: Slide Zoom graphicData URI`)
	const zoomObject = elements(graphicData, 'sldZmObj')[0]
	const zoomProperties = elements(zoomObject, 'zmPr')[0]
	assert.ok(zoomObject && zoomProperties, `${state}: pslz:sldZmObj/zmPr`)
	assert.equal(zoomObject.namespaceURI, PSLZ_NS, `${state}: sldZmObj namespace`)
	if (state !== 'powerpoint-roundtrip') assert.equal(choice.getAttribute('xmlns:pslz'), PSLZ_NS, `${state}: generated Choice-local pslz namespace`)
	assert.equal(zoomObject.getAttribute('cId'), '0', `${state}: cId`)
	const slideMap = presentationSlideMap(pkg, state)
	const target = slideMap.find(item => item.part === targetPart)
	assert.ok(target, `${state}: target presentation slide identity`)
	assert.equal(Number(zoomObject.getAttribute('sldId')), target.sldId, `${state}: Zoom sldId must bind presentation-level identity`)
	assert.match(zoomProperties.getAttribute('id'), /^\{[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\}$/, `${state}: Zoom GUID`)
	const returnAttribute = zoomProperties.getAttribute('returnToParent')
	const effectiveReturnToParent = returnAttribute === '' ? true : ['1', 'true'].includes(returnAttribute.toLowerCase())
	if (state !== 'powerpoint-roundtrip') assert.notEqual(returnAttribute, '', `${state}: generated returnToParent must be explicit`)
	assert.equal(effectiveReturnToParent, Boolean(returnToParent), `${state}: effective returnToParent`)
	assert.equal(Number(zoomProperties.getAttribute('transitionDur')), transitionDur, `${state}: transitionDur`)
	const choiceBlipFill = elementChildren(zoomProperties).find(node => node.localName === 'blipFill')
	const choiceSpPr = elementChildren(zoomProperties).find(node => node.localName === 'spPr')
	assert.equal(choiceBlipFill?.namespaceURI, P166_NS, `${state}: p166:blipFill namespace`)
	assert.equal(choiceSpPr?.namespaceURI, P166_NS, `${state}: p166:spPr namespace`)
	const choiceImageRid = relationshipId(elements(choiceBlipFill, 'blip')[0], 'embed')
	const fallbackImageRid = relationshipId(elements(fallbackPicture, 'blip')[0], 'embed')
	assert.ok(choiceImageRid && fallbackImageRid, `${state}: Choice/Fallback image relationships`)
	if (state !== 'powerpoint-roundtrip') assert.equal(choiceImageRid, fallbackImageRid, `${state}: generated Choice/Fallback must share one image relationship ID`)
	const choiceCarrier = elements(graphicFrame, 'cNvPr')[0]
	const fallbackCarrier = elements(fallbackPicture, 'cNvPr')[0]
	assert.ok(choiceCarrier && fallbackCarrier, `${state}: Choice/Fallback cNvPr`)
	for (const attribute of ['id', 'name', 'descr']) assert.equal(fallbackCarrier.getAttribute(attribute), choiceCarrier.getAttribute(attribute), `${state}: Choice/Fallback ${attribute}`)
	assert.ok(nameMatches(choiceCarrier.getAttribute('name'), NAMES.zoom), `${state}: zoom object name`)
	const fallbackLink = directHyperlink(fallbackCarrier)
	assert.ok(fallbackLink, `${state}: Fallback hyperlink`)
	assert.equal(fallbackLink.getAttribute('action'), 'ppaction://hlinksldjump', `${state}: Fallback action URI`)
	const fallbackSlideRid = relationshipId(fallbackLink)
	assert.ok(fallbackSlideRid && fallbackSlideRid !== jumpRid, `${state}: Fallback has an independent slide relationship`)
	const relationshipMap = new Map(rels.map(rel => [rel.Id, rel]))
	const imageRel = relationshipMap.get(choiceImageRid)
	const fallbackImageRel = relationshipMap.get(fallbackImageRid)
	const fallbackSlideRel = relationshipMap.get(fallbackSlideRid)
	assert.equal(imageRel?.Type, `${REL_TYPE}image`, `${state}: image relationship type`)
	assert.equal(fallbackImageRel?.Type, `${REL_TYPE}image`, `${state}: Fallback image relationship type`)
	assert.equal(fallbackSlideRel?.Type, `${REL_TYPE}slide`, `${state}: Fallback slide relationship type`)
	assert.equal(resolveRelationshipTarget(hostPart, fallbackSlideRel.Target), targetPart, `${state}: Fallback target`)
	const imagePart = resolveRelationshipTarget(hostPart, imageRel.Target)
	assert.equal(resolveRelationshipTarget(hostPart, fallbackImageRel.Target), imagePart, `${state}: Choice/Fallback image relationships must resolve to the same PNG part`)
	assert.ok(pkg.nameSet.has(imagePart), `${state}: thumbnail part exists`)
	const imageType = pkg.overrides.get(imagePart) || pkg.defaults.get(path.posix.extname(imagePart).slice(1).toLowerCase())
	assert.equal(imageType, 'image/png', `${state}: thumbnail content type`)
	const choiceXfrm = readXfrm(elements(graphicFrame, 'xfrm')[0])
	const fallbackXfrm = readXfrm(elements(elements(fallbackPicture, 'spPr')[0], 'xfrm')[0])
	assert.deepEqual(fallbackXfrm, choiceXfrm, `${state}: Choice/Fallback geometry`)
	assert.ok(choiceXfrm.cx > 0 && choiceXfrm.cy > 0, `${state}: positive Zoom geometry`)
	const internalXfrm = readXfrm(elements(choiceSpPr, 'xfrm')[0])
	assert.equal(internalXfrm.x, 0, `${state}: internal Zoom x origin`)
	assert.equal(internalXfrm.y, 0, `${state}: internal Zoom y origin`)
	assert.equal(internalXfrm.cx, choiceXfrm.cx, `${state}: internal Zoom width`)
	assert.equal(internalXfrm.cy, choiceXfrm.cy, `${state}: internal Zoom height`)
	const thumbnailBytesPromise = pkg.zip.file(imagePart).async('nodebuffer')
	return {
		state, hostPart, targetPart, jumpRid,
		zoom: {
			sldId: target.sldId, fallbackSlideRid, imageRid: choiceImageRid, imageRids: [...new Set([choiceImageRid, fallbackImageRid])], imagePart,
			returnToParent: returnToParent ? 1 : 0, transitionDur, geometry: choiceXfrm,
			guid: zoomProperties.getAttribute('id'), thumbnailBytesPromise,
		},
	}
}

async function inspectPackage(buffer, expectation) {
	const pkg = await loadPackage(buffer, expectation.state)
	const signature = zoomSemanticSignature(pkg, expectation)
	if (signature.zoom) {
		const bytes = await signature.zoom.thumbnailBytesPromise
		delete signature.zoom.thumbnailBytesPromise
		assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${expectation.state}: PNG signature`)
		signature.zoom.thumbnailSha256 = sha256(bytes)
	}
	return { ...signature, packageSha256: sha256(buffer), partCount: pkg.names.length }
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

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

async function writeImmutable(file, bytes) {
	await fs.writeFile(file, bytes, { flag: 'wx' })
}

async function writeState(outputDir, entry, expectation, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const second = await pptxBuffer(entry)
	const deterministic = await semanticPackageDiff(buffer, second)
	assert.equal(deterministic.semanticPayloadsEqual, true, `${expectation.state}: repeated write changed stable package members: ${JSON.stringify(deterministic.semanticChanged)}`)
	const file = path.join(outputDir, `slide-zoom-jump-${expectation.state}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, expectation)
	inspection.repeatedWriteStable = true
	artifacts[expectation.state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { file, buffer, inspection }
}

async function commit(mcp, entry, deckId, spec, commitMode, label) {
	const beforeVersion = entry?.deckVersion
	const data = dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', {
		...(entry ? { deckId, deckVersion: entry.deckVersion } : {}), spec,
		phase: 'commit', commitMode, plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	if (entry && commitMode === 'patch') assert.ok(entry.deckVersion > beforeVersion, `${label}: deck version did not advance`)
	return data
}

function exportedBlock(spec, name) {
	const matches = (spec?.slides || []).flatMap(slide => slide.content || []).filter(block => nameMatches(String(block.name || block.objectName || ''), name))
	assert.equal(matches.length, 1, `export: expected one ${name} block`)
	return matches[0]
}

function assertExportedSpec(spec) {
	const jump = exportedBlock(spec, NAMES.jump)
	const zoom = exportedBlock(spec, NAMES.zoom)
	assert.deepEqual(jump.action, { click: { type: 'slide', targetSlideId: 'target-c', tooltip: 'Jump to target C' } }, 'export: durable jump target identity')
	assert.equal(zoom.kind, 'slideZoom', 'export: structured Slide Zoom kind')
	assert.equal(zoom.targetSlideId, 'target-c', 'export: durable Zoom target identity')
	assert.equal(zoom.returnToParent, true, 'export: returnToParent')
	assert.equal(zoom.transitionDur, 1750, 'export: transitionDur')
	assert.equal(zoom.altText, 'Native Slide Zoom to target C', 'export: altText')
	assert.ok(zoom.bbox && zoom.bbox.w > 0 && zoom.bbox.h > 0, 'export: standard bbox readback')
	assert.equal((spec.slides || []).flatMap(slide => slide.content || []).some(block => block.kind === 'opaqueNative' && nameMatches(String(block.name || block.objectName || ''), NAMES.zoom)), false, 'export: newly authored Slide Zoom must not degrade to opaqueNative')
	assert.doesNotMatch(JSON.stringify(spec), /_zoom|_slideRid|_rId|rawPackageParts|pptxgenjs|node_modules/i, 'export: private carrier leakage')
}

function portableSpec(spec) {
	return {
		...structuredClone(spec), nativePackagePreservation: false,
		slides: (spec.slides || []).map(slide => {
			const { nativeTimingPreservation, ...portableSlide } = structuredClone(slide)
			return {
				...portableSlide,
				content: (portableSlide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
					const { editHandle, nativePreservation, preservationHandle, ...semantic } = block
					return semantic
				}),
			}
		}),
	}
}

async function rejectedMutation(mcp, entry, deckId, spec, label, commitMode = 'replaceDeck') {
	const beforeVersion = entry.deckVersion
	const before = await pptxBuffer(entry)
	let result
	try {
		result = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: beforeVersion, spec, phase: 'commit', commitMode,
			plan: 'premium', billingConfirmed: true, detail: 'full',
		})
	} catch (error) {
		result = { ok: false, error: { code: error?.code, message: error?.message || String(error) } }
	}
	const after = await pptxBuffer(entry)
	const diff = await semanticPackageDiff(before, after)
	assert.equal(result?.ok, false, `${label}: invalid target must be rejected`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: deckVersion changed`)
	assert.equal(diff.semanticPayloadsEqual, true, `${label}: rejected mutation changed package: ${JSON.stringify(diff.semanticChanged)}`)
	return { label, rejected: true, diagnostic: JSON.stringify(result).slice(0, 1200), versionUnchanged: true, semanticPackageUnchanged: true }
}

async function directSerializerProbe() {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const host = pptx.addSlide()
	host.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 0.6, w: 2.5, h: 0.8, objectName: NAMES.jump, text: 'Jump', hyperlink: { slide: 3 } })
	host.addZoom({ targetSlide: 3, x: 1.1, y: 2, w: 4.2, h: 2.4, objectName: NAMES.zoom, altText: 'Native Slide Zoom to target C', returnToParent: true, transitionDur: 1750 })
	pptx.addSlide().addText('TARGET B', { x: 1, y: 1, w: 3, h: 1 })
	pptx.addSlide().addText('TARGET C', { x: 1, y: 1, w: 3, h: 1 })
	const buffer = Buffer.from(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const inspection = await inspectPackage(buffer, { state: 'direct-serializer-probe', hostIndex: 0, targetIndex: 2, expectedZoom: true, expectedJump: true, returnToParent: true, transitionDur: 1750 })
	return { ready: true, packageSha256: sha256(buffer), topology: inspection }
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

async function runOfficeProof(inputPath, outputDir) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const outputPath = path.join(outputDir, 'slide-zoom-jump-savecopyas.pptx')
	const reportPath = path.join(outputDir, 'slide-zoom-jump-office-com.json')
	const sourceRenderDir = path.join(outputDir, 'render-source')
	const roundtripRenderDir = path.join(outputDir, 'render-roundtrip')
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-slide-zoom-jump-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir,
	], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 240000, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', 'PowerPoint COM proof status')
	assert.equal(report.method, 'Presentations.Open2007', 'repair-disabled method')
	assert.equal(report.openAndRepair, false, 'repair-disabled open')
	assert.equal(report.source.SlideCount, 3, 'source slide count')
	assert.equal(report.roundtrip.SlideCount, 3, 'roundtrip slide count')
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint COM semantic snapshot changed after SaveCopyAs/reopen')
	const sourceFiles = (await fs.readdir(sourceRenderDir)).filter(name => name.endsWith('.png')).sort().map(name => path.join(sourceRenderDir, name))
	const roundtripFiles = (await fs.readdir(roundtripRenderDir)).filter(name => name.endsWith('.png')).sort().map(name => path.join(roundtripRenderDir, name))
	assert.equal(sourceFiles.length, 3, 'render every generated slide')
	assert.equal(roundtripFiles.length, 3, 'render every reopened slide')
	const sourcePixels = await pixelEvidence(sourceFiles)
	const roundtripPixels = await pixelEvidence(roundtripFiles)
	assert.deepEqual(roundtripPixels.map(item => [item.width, item.height, item.pixelSha256]), sourcePixels.map(item => [item.width, item.height, item.pixelSha256]), 'PowerPoint source/reopened slide pixels changed')
	const buffer = await fs.readFile(outputPath)
	return {
		status: 'PASS', reportFile: relative(reportPath), roundtripFile: relative(outputPath), roundtripSha256: sha256(buffer),
		sourceRenders: sourcePixels, roundtripRenders: roundtripPixels, report, buffer,
	}
}

export async function probeSlideZoomJumpRuntime() {
	try { return await directSerializerProbe() }
	catch (error) { return { ready: false, message: error.message, stack: error.stack } }
}

export async function runSlideZoomJumpUnitProof({ outputDir, office = false } = {}) {
	assert.equal(SLIDE_ZOOM_JUMP_ROWS.length, 2)
	const directRuntime = await probeSlideZoomJumpRuntime()
	assert.equal(directRuntime.ready, true, `core serializer dependency: ${JSON.stringify(directRuntime)}`)
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-slide-zoom-jump-${timestamp()}-`))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `slide-zoom-jump-${Date.now()}`, clientInfo: { name: 'slide-zoom-jump-public-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true,
	})
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	const negatives = []
	try {
		const created = await commit(mcp, null, null, fullSpec(), 'createNew', 'initial public Slide Zoom commit')
		deckIds.push(created.deckId)
		let entry = getDeck(created.deckId)
		assert.ok(entry, 'committed deck entry')
		await writeState(resolvedOutput, entry, { state: 'initial', hostIndex: 0, targetIndex: 2, expectedZoom: true, expectedJump: true, returnToParent: true, transitionDur: 1750 }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, patchSpec({
			title: 'Retarget navigation to B',
			jumpAction: { click: { type: 'slide', targetSlideId: 'target-b', tooltip: 'Jump to target B' } },
			zoomPatch: { targetSlideId: 'target-b', returnToParent: false, transitionDur: 1200, altText: 'Native Slide Zoom to target B', bbox: { x: 5.2, y: 2.1, w: 4.4, h: 2.5 } },
		}), 'patch', 'retarget patch')
		await writeState(resolvedOutput, entry, { state: 'updated', hostIndex: 0, targetIndex: 1, expectedZoom: true, expectedJump: true, returnToParent: false, transitionDur: 1200 }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, patchSpec({
			title: 'Reset local navigation options', jumpAction: null,
			zoomPatch: { returnToParent: null, transitionDur: null, thumbnailDataUri: null, bbox: null },
		}), 'patch', 'component reset patch')
		await writeState(resolvedOutput, entry, { state: 'reset-options', hostIndex: 0, targetIndex: 1, expectedZoom: true, expectedJump: false, returnToParent: false, transitionDur: 1000 }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, patchSpec({
			title: 'Re-edit navigation to C', jumpAction: { click: { type: 'slide', targetSlideId: 'target-c', tooltip: 'Jump to target C' } },
			zoomPatch: { targetSlideId: 'target-c', returnToParent: true, transitionDur: 1750, altText: 'Native Slide Zoom to target C' },
		}), 'patch', 're-edit patch')
		const reedited = await writeState(resolvedOutput, entry, { state: 'reedited', hostIndex: 0, targetIndex: 2, expectedZoom: true, expectedJump: true, returnToParent: true, transitionDur: 1750 }, artifacts, lifecycle)
		negatives.push(await rejectedMutation(mcp, entry, created.deckId, deleteSlidePatchSpec('target-c', 2), 'delete live target fails closed for Zoom and jump', 'patch'))
		negatives.push(await rejectedMutation(mcp, entry, created.deckId, patchSpec({ title: 'Unknown Zoom target', zoomPatch: { targetSlideId: 'missing-slide' } }), 'unknown Zoom target patch fails closed', 'patch'))
		negatives.push(await rejectedMutation(mcp, entry, created.deckId, patchSpec({ title: 'Unknown jump target', jumpAction: { click: { type: 'slide', targetSlideId: 'missing-slide' } } }), 'unknown jump target patch fails closed', 'patch'))

		const exported = dataOf('current spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' }))
		assertExportedSpec(exported.spec)
		const portable = portableSpec(exported.spec)
		const exportedPath = path.join(resolvedOutput, 'slide-zoom-jump-exported-spec.json')
		const portablePath = path.join(resolvedOutput, 'slide-zoom-jump-portable-spec.json')
		await writeImmutable(exportedPath, `${JSON.stringify(exported.spec, null, 2)}\n`)
		await writeImmutable(portablePath, `${JSON.stringify(portable, null, 2)}\n`)
		artifacts.exportedSpec = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }
		artifacts.portableSpec = { file: relative(portablePath), sha256: sha256(await fs.readFile(portablePath)) }

		const replay = await commit(mcp, null, null, portable, 'createNew', 'portable export recompile')
		deckIds.push(replay.deckId)
		await writeState(resolvedOutput, getDeck(replay.deckId), { state: 'recompiled', hostIndex: 0, targetIndex: 2, expectedZoom: true, expectedJump: true, returnToParent: true, transitionDur: 1750 }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, fullSpec({ order: ['target-c', 'host-a', 'target-b'], title: 'Reordered durable slide identities' }), 'replaceDeck', 'reorder replaceDeck')
		entry = getDeck(created.deckId)
		await writeState(resolvedOutput, entry, { state: 'reordered', hostIndex: 1, targetIndex: 0, expectedZoom: true, expectedJump: true, returnToParent: true, transitionDur: 1750 }, artifacts, lifecycle)

		await commit(mcp, entry, created.deckId, fullSpec({ zoom: false, title: 'Delete Slide Zoom block' }), 'replaceDeck', 'delete zoom block')
		entry = getDeck(created.deckId)
		await writeState(resolvedOutput, entry, { state: 'zoom-deleted', hostIndex: 0, targetIndex: 2, expectedZoom: false, expectedJump: true, returnToParent: false, transitionDur: 1000 }, artifacts, lifecycle)

		let officeResult = { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_SLIDE_ZOOM_JUMP_OFFICE=1.' }
		if (office) {
			officeResult = await runOfficeProof(reedited.file, resolvedOutput)
			officeResult.package = await inspectPackage(officeResult.buffer, { state: 'powerpoint-roundtrip', hostIndex: 0, targetIndex: 2, expectedZoom: true, expectedJump: true, returnToParent: true, transitionDur: 1750 })
			delete officeResult.buffer
		}

		return {
			schemaVersion: 'betterpptx.slide-zoom-jump-unit-proof.v1', unitId: SLIDE_ZOOM_JUMP_UNIT_ID,
			status: officeResult.status === 'PASS' ? 'SLIDE_ZOOM_JUMP_PACKAGE_AND_OFFICE_VERIFIED' : 'SLIDE_ZOOM_JUMP_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(), rows: SLIDE_ZOOM_JUMP_ROWS.map(([id, label]) => ({ id, label })),
			proofBoundary: {
				jump: 'p:cNvPr/a:hlinkClick with ppaction://hlinksldjump plus an internal slide relationship.',
				slideZoom: 'mc:AlternateContent with independent pslz Choice graphicFrame and fallback p:pic; both share one PNG image relationship and the fallback owns its own internal slide relationship.',
				targetIdentity: 'Public targetSlideId is durable. The compiler resolves the current slide index and presentation p:sldId after reorder; deleting a referenced target fails closed.',
				officeCanonicalization: 'Generated checkpoints require explicit returnToParent and one shared Choice/Fallback image relationship. After repair-disabled SaveCopyAs/reopen only, PowerPoint may omit true returnToParent (the schema default is true), hoist namespace declarations, and split or renumber Choice/Fallback image relationships when both still resolve to the same PNG part; target identity, effective flags, topology, geometry, COM semantics, and rendered pixels must remain stable.',
			},
			directRuntime, lifecycle, negatives, office: officeResult, artifacts,
			checks: {
				xmlParseCrcAndOpcClosure: true, jumpAndFallbackRelationshipsAreIndependent: true,
				choiceFallbackImageTargetAndGeometry: true, presentationSlideIdBinding: true,
				updateNullResetReeditDeleteCleanup: true, exportPortableReplay: true,
				reorderRetargetsBySemanticIdentity: true, deletedAndUnknownTargetsFailClosedNoMutation: true,
				repeatedWriteStable: true, repairDisabledOfficeAndPixelRenders: officeResult.status === 'PASS',
			},
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	if (process.argv.includes('--probe')) {
		console.log(JSON.stringify({ schemaVersion: 'betterpptx.slide-zoom-jump-runtime-probe.v1', unitId: SLIDE_ZOOM_JUMP_UNIT_ID, ...(await probeSlideZoomJumpRuntime()) }, null, 2))
		return
	}
	const configured = String(process.env.BETTERPPTX_SLIDE_ZOOM_JUMP_OUTPUT || '').trim()
	const outputDir = configured ? path.resolve(configured) : await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-slide-zoom-jump-${timestamp()}-`))
	await fs.mkdir(outputDir, { recursive: true })
	const office = process.argv.includes('--office') || ['1', 'true', 'yes'].includes(String(process.env.BETTERPPTX_SLIDE_ZOOM_JUMP_OFFICE || '').trim().toLowerCase())
	let proof
	try { proof = await runSlideZoomJumpUnitProof({ outputDir, office }) }
	catch (error) {
		proof = { schemaVersion: 'betterpptx.slide-zoom-jump-unit-proof.v1', unitId: SLIDE_ZOOM_JUMP_UNIT_ID, status: error.code || 'SLIDE_ZOOM_JUMP_PROOF_FAILED', failure: { message: error.message, stack: error.stack } }
	}
	const proofPath = path.join(outputDir, 'slide-zoom-jump-unit-proof.json')
	await writeImmutable(proofPath, `${JSON.stringify({ ...proof, proofPath: relative(proofPath) }, null, 2)}\n`)
	console.log(JSON.stringify({ ...proof, proofPath: relative(proofPath) }, null, 2))
	if (!String(proof.status).includes('VERIFIED')) process.exitCode = 1
}

if (path.resolve(process.argv[1] || '') === modulePath) await main()
