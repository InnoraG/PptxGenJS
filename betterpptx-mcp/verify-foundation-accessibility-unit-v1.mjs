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
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const run = promisify(execFile)
const modulePath = fileURLToPath(import.meta.url)
const moduleDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(moduleDir, '..')

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const DECORATIVE_NS = 'http://schemas.microsoft.com/office/drawing/2017/decorative'
const DECORATIVE_EXT_URI = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}'
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1ZzWQAAAABJRU5ErkJggg=='
const WAV_DATA = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
const HYPERLINK_URL = 'https://example.com/foundation-accessibility?proof=package'
const SENSITIVE_SHAPE_NAME = 'a11y-shape A&B <proof>'

export const FOUNDATION_ACCESSIBILITY_UNIT_ID = 'impl-b-6ad69911ea1aa096'
export const FOUNDATION_ACCESSIBILITY_ROWS = Object.freeze([
	['cap_ef7b3b1a537a10ac184a', 'alt text'],
	['cap_8e691379b8b5964663b4', 'cNvPr order'],
	['cap_398b22465851fc2680fc', 'decorative flags'],
	['cap_a67c11cc24fa67a6e7af', 'description metadata'],
	['cap_f724e5d80366597563d8', 'isDecorative'],
	['cap_59726c62407ac38d69df', 'object sequence'],
	['cap_46b36f6476d662b201ef', 'reading order'],
	['cap_780fe48fe3bff8e5fa33', 'screen-reader-safe decorative graphics'],
	['cap_1e64c974b4c219c00c45', 'screen-reader-safe hidden graphics'],
	['cap_bbb1e96f4e9046a0bf90', 'title metadata'],
])

const OBJECTS = Object.freeze([
	Object.freeze({ name: 'a11y-text', kind: 'text', spid: 10 }),
	Object.freeze({ name: SENSITIVE_SHAPE_NAME, kind: 'shape', spid: 20 }),
	Object.freeze({ name: 'a11y-connector', kind: 'connector', spid: 30 }),
	Object.freeze({ name: 'a11y-picture', kind: 'image', spid: 40 }),
	Object.freeze({ name: 'a11y-table', kind: 'table', spid: 50 }),
	Object.freeze({ name: 'a11y-chart', kind: 'chart', spid: 60 }),
	Object.freeze({ name: 'a11y-media', kind: 'media', spid: 70 }),
	Object.freeze({ name: 'a11y-group', kind: 'group', spid: 80 }),
])

const INITIAL_ORDER = Object.freeze(OBJECTS.map(item => item.name))
const REORDERED_ORDER = Object.freeze([
	'a11y-group', 'a11y-text', SENSITIVE_SHAPE_NAME, 'a11y-connector',
	'a11y-table', 'a11y-chart', 'a11y-media', 'a11y-picture',
])
const DELETED_NAMES = Object.freeze(['a11y-picture', 'a11y-chart', 'a11y-media', 'a11y-group'])
const SURVIVOR_ORDER = Object.freeze(REORDERED_ORDER.filter(name => !DELETED_NAMES.includes(name)))
const GROUP_CHILDREN = Object.freeze(['a11y-group-child-one', 'a11y-group-child-two'])

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function timestamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function relative(file) {
	return path.relative(workspaceRoot, file).replaceAll(path.sep, '/')
}

function unwrap(label, result) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}

function initialSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Foundation accessibility native package proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
			layerModel: 'flat-object-array', objectIdentity: 'stable-names-required',
		},
		contentStory: {
			audience: 'package-integrity reviewers',
			outcome: 'Prove native accessibility metadata and reading order survive lifecycle edits.',
			remember: 'Accessibility metadata remains native, editable, relationship-safe, and repair-free.',
		},
		visualDesign: { world: 'editorial', framing: 'A mixed native accessibility atlas', tone: 'technical' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		theme: { name: 'Accessibility proof', palette: ['F8FAFC', '0F172A', '2563EB', '059669', 'D97706'], fontFace: 'Aptos' },
		slides: [{
			id: 'accessibility-atlas', title: 'Accessibility atlas', role: 'proof',
			message: 'Native metadata, sequence, relationships, and deletion cleanup.', layoutIntent: 'title-body',
			content: [{ kind: 'textBox', name: 'bootstrap', text: 'bootstrap' }],
		}],
	}
}

function metadataFor(name, state) {
	if (state === 'initial' || state === 'reordered') {
		return {
			title: `Initial title <${name}> & metadata`,
			descr: `Initial description for ${name}: native & screen-reader ready.`,
			decorative: false,
		}
	}
	if (state === 'metadata-reset' || state === 'false-reset') {
		return { title: null, descr: null, decorative: false }
	}
	if (state === 'decorative-hidden') {
		return {
			title: null,
			descr: null,
			decorative: name === SENSITIVE_SHAPE_NAME || name === 'a11y-picture',
		}
	}
	return {
		title: `Re-edited title for ${name}`,
		descr: `Re-edited description for ${name}; meaningful after reset.`,
		decorative: false,
	}
}

function accessibilityOptions(name, state = 'initial') {
	const metadata = metadataFor(name, state)
	return {
		accessibilityTitle: metadata.title,
		altText: metadata.descr,
		isDecorative: metadata.decorative,
	}
}

function clearBootstrapSlide(slide) {
	slide._slideObjects = []
	slide._rels = []
	slide._relsMedia = []
	slide._relsChart = []
	slide._animations = []
	slide._rawRels = []
	delete slide._rawTimingXml
	delete slide._nativeTimingManifest
}

function installMixedAtlas(entry) {
	const pptx = entry.pptx
	const slide = pptx.slides[0]
	clearBootstrapSlide(slide)
	slide.background = { color: 'F8FAFC' }

	slide.addText('Meaningful text object', {
		x: 0.45, y: 0.35, w: 2.2, h: 0.55, objectName: 'a11y-text', spid: 10,
		fontFace: 'Aptos', fontSize: 16, color: '0F172A',
		...accessibilityOptions('a11y-text'),
	})
	slide.addShape('roundRect', {
		x: 3.0, y: 0.3, w: 2.2, h: 0.7, objectName: SENSITIVE_SHAPE_NAME, spid: 20,
		fill: { color: 'DBEAFE' }, line: { color: '2563EB', width: 1 },
		hyperlink: { url: HYPERLINK_URL, tooltip: 'Accessibility package proof' },
		...accessibilityOptions(SENSITIVE_SHAPE_NAME),
	})
	slide.addConnector({
		x: 2.65, y: 0.65, w: 0.35, h: 0, objectName: 'a11y-connector', spid: 30,
		connectorType: 'straightConnector1', startShapeId: 10, startConnectionIndex: 3,
		endShapeId: 20, endConnectionIndex: 1, line: { color: '334155', width: 1.5, endArrowType: 'triangle' },
		...accessibilityOptions('a11y-connector'),
	})
	slide.addImage({
		data: PNG_DATA, x: 5.55, y: 0.25, w: 1.35, h: 1.05, objectName: 'a11y-picture', spid: 40,
		hyperlink: { url: `${HYPERLINK_URL}&object=picture`, tooltip: 'Picture proof' },
		_authoredImageSource: { kind: 'inline', data: PNG_DATA },
		...accessibilityOptions('a11y-picture'),
	})
	slide.addTable([
		['Carrier', 'Expected'], ['title', 'native'], ['descr', 'native'],
	], {
		x: 0.45, y: 1.55, w: 4.4, h: 1.55, objectName: 'a11y-table', spid: 50,
		border: { type: 'solid', color: 'CBD5E1', pt: 1 }, fontFace: 'Aptos', fontSize: 11,
		...accessibilityOptions('a11y-table'),
	})
	slide.addChart(pptx.ChartType?.bar || 'bar', [{
		name: 'Coverage', labels: ['Metadata', 'Order'], values: [8, 8],
	}], {
		x: 5.2, y: 1.55, w: 3.25, h: 2.2, objectName: 'a11y-chart', spid: 60,
		showLegend: false, showTitle: false,
		...accessibilityOptions('a11y-chart'),
	})
	slide.addMedia({
		type: 'audio', data: WAV_DATA, extn: 'wav', cover: PNG_DATA,
		x: 8.75, y: 1.6, w: 1.0, h: 1.0, objectName: 'a11y-media', spid: 70,
		_authoredMediaSource: { kind: 'inline', data: WAV_DATA },
		_authoredMediaCover: { kind: 'inline', data: PNG_DATA },
		...accessibilityOptions('a11y-media'),
	})
	slide.addGroup({
		x: 8.8, y: 3.15, w: 3.3, h: 1.5, objectName: 'a11y-group', spid: 80,
		children: [
			{ kind: 'shape', shape: 'rect', x: 0, y: 0, w: 1.25, h: 0.75, objectName: 'a11y-group-child-one', fill: { color: 'D1FAE5' }, line: { color: '059669' } },
			{ kind: 'shape', shape: 'ellipse', x: 1.65, y: 0.25, w: 1.15, h: 0.75, objectName: 'a11y-group-child-two', fill: { color: 'FEF3C7' }, line: { color: 'D97706' } },
		],
		...accessibilityOptions('a11y-group'),
	})

	slide.addAnimation('a11y-text', { type: 'entrance', effect: 'fade', trigger: 'onClick', duration: 250, spid: 10 })
	slide.addAnimation('a11y-media', { type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(0)', trigger: 'onClick', spid: 70 })
	return slide
}

function objectByName(slide, name) {
	const matches = (slide._slideObjects || []).filter(object => object?.options?.objectName === name)
	assert.equal(matches.length, 1, `expected one native object named ${name}`)
	return matches[0]
}

function reorderNativeObject(slide, name, toIndex) {
	const objects = slide._slideObjects || []
	const fromIndex = objects.findIndex(object => object?.options?.objectName === name)
	assert.ok(fromIndex >= 0, `native reorder target ${name} missing`)
	const [moving] = objects.splice(fromIndex, 1)
	const bounded = Math.max(0, Math.min(Number(toIndex), objects.length))
	objects.splice(bounded, 0, moving)
}

function applyAccessibilityState(slide, state) {
	for (const descriptor of OBJECTS) {
		const object = objectByName(slide, descriptor.name)
		const metadata = metadataFor(descriptor.name, state)
		object.options.accessibilityTitle = metadata.title
		object.options.altText = metadata.descr
		object.options.isDecorative = metadata.decorative
		if (object.connector && object.connector !== object.options) Object.assign(object.connector, object.options)
		if (object.group && object.group !== object.options) Object.assign(object.group, object.options)
		if (object.chartRid) {
			const rel = (slide._relsChart || []).find(item => Number(item.rId) === Number(object.chartRid))
			if (rel?.opts) {
				rel.opts.accessibilityTitle = metadata.title
				rel.opts.altText = metadata.descr
				rel.opts.isDecorative = metadata.decorative
			}
		}
	}
}

function expectedCarriers(state, nameMap = null, names = OBJECTS.map(item => item.name)) {
	return Object.fromEntries(names.map(originalName => [
		nameMap?.[originalName] || originalName,
		metadataFor(originalName, state),
	]))
}

function parseXmlStrict(xml, label) {
	const errors = []
	const document = new DOMParser({
		errorHandler: {
			warning: () => {},
			error: message => errors.push(String(message)),
			fatalError: message => errors.push(String(message)),
		},
	}).parseFromString(String(xml), 'application/xml')
	assert.ok(document?.documentElement, `${label}: missing XML root`)
	assert.equal(errors.length, 0, `${label}: XML parse errors: ${errors.join('; ')}`)
	assert.notEqual(document.documentElement.localName, 'parsererror', `${label}: parsererror root`)
	return document
}

function elementChildren(node) {
	return Array.from(node?.childNodes || []).filter(child => child.nodeType === 1)
}

function elementsByLocalName(node, localName) {
	return Array.from(node?.getElementsByTagNameNS?.('*', localName) || [])
}

function firstDescendant(node, localName) {
	return elementsByLocalName(node, localName)[0] || null
}

function relationshipsFromDocument(document) {
	return elementsByLocalName(document, 'Relationship').map(node => ({
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
	const value = String(target || '')
	if (value.startsWith('/')) return value.replace(/^\/+/, '')
	return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart || ''), value)).replace(/^\/+/, '')
}

function cNvPrByName(document, name) {
	return elementsByLocalName(document, 'cNvPr').find(node => node.getAttribute('name') === name) || null
}

function directObjectNames(spTree) {
	const objectKinds = new Set(['sp', 'cxnSp', 'pic', 'graphicFrame', 'grpSp', 'contentPart', 'AlternateContent'])
	return elementChildren(spTree)
		.filter(node => objectKinds.has(node.localName))
		.map(node => firstDescendant(node, 'cNvPr')?.getAttribute('name') || '')
		.filter(Boolean)
}

function groupChildNames(document, groupName) {
	const groupNode = elementsByLocalName(document, 'grpSp').find(node => firstDescendant(node, 'cNvPr')?.getAttribute('name') === groupName)
	if (!groupNode) return null
	const childKinds = new Set(['sp', 'cxnSp', 'pic', 'graphicFrame', 'grpSp'])
	return elementChildren(groupNode)
		.filter(node => childKinds.has(node.localName))
		.map(node => firstDescendant(node, 'cNvPr')?.getAttribute('name') || '')
		.filter(Boolean)
}

function decorativeValue(cNvPr, label) {
	const extLists = elementChildren(cNvPr).filter(node => node.localName === 'extLst')
	assert.ok(extLists.length <= 1, `${label}: cNvPr must contain at most one extLst`)
	const matching = extLists.flatMap(extList => elementChildren(extList))
		.filter(node => node.localName === 'ext' && node.getAttribute('uri') === DECORATIVE_EXT_URI)
	assert.ok(matching.length <= 1, `${label}: duplicate decorative extension`)
	if (!matching.length) return null
	const carriers = elementsByLocalName(matching[0], 'decorative').filter(node => node.namespaceURI === DECORATIVE_NS)
	assert.equal(carriers.length, 1, `${label}: decorative extension must contain exactly one adec:decorative`)
	const value = carriers[0].getAttribute('val')
	assert.ok(['0', '1', 'false', 'true'].includes(String(value).toLowerCase()), `${label}: invalid decorative boolean ${value}`)
	return ['1', 'true'].includes(String(value).toLowerCase())
}

function assertCnvPrChildOrder(document, state) {
	for (const node of elementsByLocalName(document, 'cNvPr')) {
		const children = elementChildren(node)
		const names = children.map(child => child.localName)
		const extIndex = names.indexOf('extLst')
		assert.equal(names.lastIndexOf('extLst'), extIndex, `${state}: ${node.getAttribute('name')} has duplicate extLst`)
		if (extIndex >= 0) assert.equal(extIndex, names.length - 1, `${state}: ${node.getAttribute('name')} extLst must be the final cNvPr child`)
		for (const hyperlinkName of ['hlinkClick', 'hlinkHover']) {
			const index = names.indexOf(hyperlinkName)
			if (index >= 0 && extIndex >= 0) assert.ok(index < extIndex, `${state}: ${hyperlinkName} must precede extLst`)
		}
	}
}

function assertPrivateDataAbsent(serialized, state, { allowDataUri = false } = {}) {
	assert.doesNotMatch(serialized, /(?:[A-Za-z]:\\|file:\/\/|\/Users\/|\/home\/|\.codex(?:\/|\\)|node_modules(?:\/|\\))/i, `${state}: private filesystem detail leaked`)
	if (!allowDataUri) assert.doesNotMatch(serialized, /data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,/i, `${state}: data URI leaked into XML metadata`)
}

async function zipText(zip, name) {
	const entry = zip.file(name)
	return entry ? entry.async('string') : ''
}

async function inspectPackage(buffer, expectation) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels') || item === '[Content_Types].xml')) {
		documents.set(name, parseXmlStrict(await zipText(zip, name), `${expectation.state}:${name}`))
	}

	const relationshipSets = new Map()
	for (const relsPart of names.filter(name => name.endsWith('.rels'))) {
		const rels = relationshipsFromDocument(documents.get(relsPart))
		assert.equal(new Set(rels.map(rel => rel.Id)).size, rels.length, `${expectation.state}: duplicate relationship IDs in ${relsPart}`)
		const sourcePart = sourcePartForRelationships(relsPart)
		for (const rel of rels) {
			if (rel.TargetMode === 'External') continue
			const target = resolveRelationshipTarget(sourcePart, rel.Target)
			assert.ok(nameSet.has(target), `${expectation.state}: dangling ${relsPart} ${rel.Id} -> ${target}`)
		}
		relationshipSets.set(sourcePart, new Set(rels.map(rel => rel.Id)))
	}

	for (const [sourcePart, document] of documents) {
		if (!sourcePart.endsWith('.xml') || sourcePart === '[Content_Types].xml') continue
		const ids = relationshipSets.get(sourcePart) || new Set()
		for (const element of Array.from(document.getElementsByTagName('*'))) {
			for (const attribute of Array.from(element.attributes || [])) {
				if (attribute.namespaceURI !== REL_NS && !String(attribute.name).startsWith('r:')) continue
				if (!attribute.value) continue
				assert.ok(ids.has(attribute.value), `${expectation.state}: ${sourcePart} carrier ${attribute.name}=${attribute.value} has no relationship`)
			}
		}
	}

	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${expectation.state}: [Content_Types].xml missing`)
	const defaults = new Map(elementsByLocalName(contentTypes, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')]))
	const overrides = new Map(elementsByLocalName(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const override of overrides.keys()) assert.ok(nameSet.has(override), `${expectation.state}: content-type override target missing ${override}`)
	for (const name of names) {
		if (name === '[Content_Types].xml') continue
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${expectation.state}: ${name} has no content type`)
	}

	const reachable = new Set()
	const queue = []
	for (const rel of relationshipsFromDocument(documents.get('_rels/.rels'))) {
		if (rel.TargetMode === 'External') continue
		const target = resolveRelationshipTarget('', rel.Target)
		if (!reachable.has(target)) { reachable.add(target); queue.push(target) }
	}
	while (queue.length) {
		const sourcePart = queue.shift()
		const relsDocument = documents.get(relationshipPartFor(sourcePart))
		if (!relsDocument) continue
		for (const rel of relationshipsFromDocument(relsDocument)) {
			if (rel.TargetMode === 'External') continue
			const target = resolveRelationshipTarget(sourcePart, rel.Target)
			if (!reachable.has(target)) { reachable.add(target); queue.push(target) }
		}
	}
	const criticalParts = names.filter(name => /^(?:ppt\/(?:media|charts|embeddings|diagrams|tags)\/)/.test(name) && !name.endsWith('.rels'))
	for (const part of criticalParts) assert.ok(reachable.has(part), `${expectation.state}: ownerless critical package part ${part}`)

	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
	assert.equal(slideParts.length, 1, `${expectation.state}: expected one slide`)
	const slidePart = slideParts[0]
	const slideDocument = documents.get(slidePart)
	const spTree = firstDescendant(slideDocument, 'spTree')
	assert.ok(spTree, `${expectation.state}: p:spTree missing`)
	const cNvPrNodes = elementsByLocalName(spTree, 'cNvPr')
	const ids = cNvPrNodes.map(node => node.getAttribute('id')).filter(Boolean)
	assert.equal(ids.length, new Set(ids).size, `${expectation.state}: duplicate cNvPr IDs`)
	assert.ok(ids.every(id => /^\d+$/.test(id)), `${expectation.state}: non-numeric cNvPr ID`)
	assertCnvPrChildOrder(slideDocument, expectation.state)

	const actualOrder = directObjectNames(spTree)
	if (expectation.orderMode === 'relative') {
		const expectedSet = new Set(expectation.order)
		assert.deepEqual(actualOrder.filter(name => expectedSet.has(name)), expectation.order, `${expectation.state}: relative object/reading order`)
		for (const name of expectation.order) assert.ok(actualOrder.includes(name), `${expectation.state}: missing ordered object ${name}`)
	} else {
		assert.deepEqual(actualOrder, expectation.order, `${expectation.state}: exact object/reading order`)
	}

	for (const [name, expected] of Object.entries(expectation.carriers || {})) {
		const cNvPr = cNvPrByName(slideDocument, name)
		assert.ok(cNvPr, `${expectation.state}: cNvPr missing for ${name}`)
		assert.equal(cNvPr.hasAttribute('title') ? cNvPr.getAttribute('title') : null, expected.title, `${expectation.state}: ${name} title`)
		assert.equal(cNvPr.hasAttribute('descr') ? cNvPr.getAttribute('descr') : null, expected.descr, `${expectation.state}: ${name} descr`)
		assert.equal(decorativeValue(cNvPr, `${expectation.state}:${name}`), expected.decorative, `${expectation.state}: ${name} adec decorative`)
	}

	if (expectation.groupName) {
		assert.deepEqual(groupChildNames(slideDocument, expectation.groupName), expectation.groupChildren, `${expectation.state}: nested group order`)
	}
	for (const deleted of expectation.deletedNames || []) assert.equal(cNvPrByName(slideDocument, deleted), null, `${expectation.state}: deleted object ${deleted} remains`)

	const slideIds = new Set(ids)
	for (const target of elementsByLocalName(slideDocument, 'spTgt')) {
		assert.ok(slideIds.has(target.getAttribute('spid')), `${expectation.state}: timing target ${target.getAttribute('spid')} does not exist`)
	}
	for (const target of [...elementsByLocalName(slideDocument, 'stCxn'), ...elementsByLocalName(slideDocument, 'endCxn')]) {
		assert.ok(slideIds.has(target.getAttribute('id')), `${expectation.state}: connector target ${target.getAttribute('id')} does not exist`)
	}

	const mediaParts = names.filter(name => name.startsWith('ppt/media/') && !name.endsWith('.rels'))
	const chartParts = names.filter(name => /^ppt\/charts\/(?:chart|style|colors)/.test(name) && !name.endsWith('.rels'))
	if (expectation.criticalCounts?.media !== undefined) assert.equal(mediaParts.length, expectation.criticalCounts.media, `${expectation.state}: media orphan cleanup`)
	if (expectation.criticalCounts?.charts !== undefined) assert.equal(chartParts.length, expectation.criticalCounts.charts, `${expectation.state}: chart orphan cleanup`)

	const textual = await Promise.all(names.filter(name => name.endsWith('.xml') || name.endsWith('.rels')).map(name => zipText(zip, name)))
	assertPrivateDataAbsent(textual.join('\n'), expectation.state)
	return {
		state: expectation.state,
		sha256: sha256(buffer),
		parts: names.length,
		objectOrder: actualOrder,
		cNvPrIds: ids,
		mediaParts: mediaParts.length,
		chartParts: chartParts.length,
		timingTargets: elementsByLocalName(slideDocument, 'spTgt').length,
		connectorTargets: elementsByLocalName(slideDocument, 'stCxn').length + elementsByLocalName(slideDocument, 'endCxn').length,
		criticalParts: criticalParts.length,
	}
}

function assertPrivateStateIsNotExported(spec) {
	const leaked = []
	const visit = (value, valuePath) => {
		if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${valuePath}[${index}]`))
		if (!value || typeof value !== 'object') return
		for (const [key, item] of Object.entries(value)) {
			const childPath = `${valuePath}.${key}`
			if (key.startsWith('_') || ['rawPackageParts', 'rawPresentationFonts'].includes(key)) leaked.push(childPath)
			visit(item, childPath)
		}
	}
	visit(spec, 'spec')
	assert.deepEqual(leaked, [], `exported spec leaked private fields: ${leaked.join(', ')}`)
	assertPrivateDataAbsent(JSON.stringify(spec), 'current-spec export', { allowDataUri: true })
}

function findBlockByName(blocks, name) {
	const matches = blocks.filter(block => block?.name === name || block?.objectName === name || String(block?.name || block?.objectName || '').endsWith(`.${name}`))
	assert.equal(matches.length, 1, `current-spec export expected one block for ${name}`)
	return matches[0]
}

function assertCurrentSpecAccessibility(spec) {
	assertPrivateStateIsNotExported(spec)
	const blocks = spec.slides.flatMap(slide => slide.content || [])
	for (const descriptor of OBJECTS.filter(item => item.kind !== 'group')) {
		const block = findBlockByName(blocks, descriptor.name)
		if (descriptor.name === SENSITIVE_SHAPE_NAME) {
			assert.equal(block.name ?? block.objectName, SENSITIVE_SHAPE_NAME, 'XML-sensitive objectName must export once-decoded without entity text')
		}
		const expected = metadataFor(descriptor.name, 'reedited')
		assert.equal(block.title, expected.title, `${descriptor.name}: exported title`)
		assert.equal(block.altText, expected.descr, `${descriptor.name}: exported altText`)
		assert.equal(block.decorative, false, `${descriptor.name}: exported decorative false`)
		if (Object.prototype.hasOwnProperty.call(block, 'hiddenFromAccessibility')) assert.equal(block.hiddenFromAccessibility, false, `${descriptor.name}: exported hidden false`)
	}
	const groupBlock = findBlockByName(blocks, 'a11y-group')
	assert.ok(['group', 'opaqueNative'].includes(groupBlock.kind), `group export must be semantic or narrowly preserved, got ${groupBlock.kind}`)
	return { blocks, groupKind: groupBlock.kind }
}

function portableSpec(spec) {
	return {
		...spec,
		nativePackagePreservation: false,
		slides: spec.slides.map(slide => {
			const { nativeTimingPreservation, ...portableSlide } = slide
			return {
				...portableSlide,
				content: (slide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
					const { editHandle, nativePreservation, preservationHandle, ...semanticBlock } = block
					return semanticBlock
				}),
			}
		}),
	}
}

function replayNameMap(slide, originalNames) {
	return Object.fromEntries(originalNames.map(original => {
		const descriptor = OBJECTS.find(item => item.name === original)
		const expectedEditHandle = descriptor ? `spid:${descriptor.spid}` : null
		const safeOriginal = original.replace(/[^A-Za-z0-9._:-]/g, '-')
		const available = (slide._slideObjects || []).map(object => String(object?.options?.objectName || '')).filter(Boolean)
		const names = (slide._slideObjects || []).filter(object => {
			const name = String(object?.options?.objectName || '')
			return name === original || name.endsWith(`.${original}`) || name.includes(`.${original}.`)
				|| name === safeOriginal || name.endsWith(`.${safeOriginal}`) || name.includes(`.${safeOriginal}.`)
				|| (expectedEditHandle && object?.options?.editHandle === expectedEditHandle)
		}).map(object => String(object?.options?.objectName || ''))
		assert.equal(names.length, 1, `recompiled deck expected one native object for ${original}; got ${names.join(', ')}; available: ${available.join(' | ')}`)
		return [original, names[0]]
	}))
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function runPackageAudit(filePath) {
	const result = await run(process.execPath, [path.join(workspaceRoot, 'tools', 'audit-pptx-package-integrity.mjs'), filePath], {
		cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 120000,
	})
	const audit = JSON.parse(result.stdout)
	assert.equal(audit.status, 'PASS', JSON.stringify(audit))
	assert.deepEqual(audit.errors || [], [], JSON.stringify(audit))
	return audit
}

function snapshotShapes(snapshot) {
	assert.equal(snapshot.SlideCount, 1, 'PowerPoint snapshot slide count')
	return [...(snapshot.Slides?.[0]?.Shapes || [])].sort((a, b) => Number(a.ZOrderPosition) - Number(b.ZOrderPosition))
}

function assertOfficeSnapshot(snapshot, label) {
	const shapes = snapshotShapes(snapshot)
	assert.deepEqual(shapes.map(shape => shape.Name), REORDERED_ORDER, `${label}: PowerPoint Name/ZOrderPosition order`)
	for (const descriptor of OBJECTS) {
		const shape = shapes.find(item => item.Name === descriptor.name)
		assert.ok(shape, `${label}: missing COM shape ${descriptor.name}`)
		const expected = metadataFor(descriptor.name, 'reedited')
		assert.equal(shape.Title, expected.title, `${label}: ${descriptor.name} COM Title`)
		assert.equal(shape.AlternativeText, expected.descr, `${label}: ${descriptor.name} COM AlternativeText`)
		assert.equal(Number(shape.Decorative), 0, `${label}: ${descriptor.name} COM Decorative`)
		assert.ok(Number(shape.Type) >= 0, `${label}: ${descriptor.name} COM Type`)
	}
	const group = shapes.find(shape => shape.Name === 'a11y-group')
	assert.deepEqual((group.GroupItems || []).sort((a, b) => Number(a.ZOrderPosition) - Number(b.ZOrderPosition)).map(item => item.Name), GROUP_CHILDREN, `${label}: COM group item order`)
	return shapes
}

async function runOfficeProof(inputPath, outputPath, reportPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-foundation-accessibility-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
	], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 180000, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS')
	assert.equal(report.method, 'Presentations.Open2007')
	assert.equal(report.openAndRepair, false)
	assert.equal(report.saveCopyAs, true)
	assert.equal(report.reopened, true)
	const sourceShapes = assertOfficeSnapshot(report.source, 'PowerPoint source open')
	const roundtripShapes = assertOfficeSnapshot(report.roundtrip, 'PowerPoint SaveCopyAs reopen')
	assert.deepEqual(roundtripShapes, sourceShapes, 'PowerPoint semantic accessibility snapshot changed after SaveCopyAs/reopen')
	return report
}

export async function probeFoundationAccessibilityRuntime() {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addShape('rect', {
		x: 1, y: 1, w: 1, h: 1, objectName: 'accessibility-runtime-probe',
		accessibilityTitle: 'Probe title', altText: 'Probe description', isDecorative: false,
	})
	const buffer = Buffer.from(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const document = parseXmlStrict(xml, 'runtime-probe')
	const carrier = cNvPrByName(document, 'accessibility-runtime-probe')
	const result = {
		accessibilityTitle: carrier?.getAttribute('title') === 'Probe title',
		altText: carrier?.getAttribute('descr') === 'Probe description',
		isDecorative: carrier ? decorativeValue(carrier, 'runtime-probe') === false : false,
	}
	return { ...result, ready: Object.values(result).every(Boolean) }
}

export async function runFoundationAccessibilityUnitProof({ outputDir, office = false, allowDependencyGate = false } = {}) {
	assert.equal(FOUNDATION_ACCESSIBILITY_ROWS.length, 10)
	assert.equal(new Set(FOUNDATION_ACCESSIBILITY_ROWS.map(([id]) => id)).size, 10)
	const runtime = await probeFoundationAccessibilityRuntime()
	if (!runtime.ready) {
		const result = {
			schemaVersion: 'betterpptx.foundation-accessibility-unit-proof.v1',
			unitId: FOUNDATION_ACCESSIBILITY_UNIT_ID,
			status: 'FOUNDATION_ACCESSIBILITY_RUNTIME_DEPENDENCY_GATED',
			runtime,
			reason: 'dist does not yet serialize accessibilityTitle, altText, and explicit false isDecorative together on p:cNvPr.',
		}
		if (allowDependencyGate) return result
		const error = new Error(result.reason)
		error.code = result.status
		error.details = result
		throw error
	}

	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-foundation-accessibility-'))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const {
		createMcpToolDispatcher,
		getDeck,
		handleDeleteShapesForTest,
	} = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `foundation-accessibility-${Date.now()}`,
		clientInfo: { name: 'foundation-accessibility-package-verifier', version: '1' },
		blackBox: false,
		__skipDurableOperationLedger: true,
	})
	const deckIds = []
	const lifecycle = []
	const buffers = new Map()
	try {
		const committed = unwrap('initial commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: initialSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		deckIds.push(committed.deckId)
		const entry = getDeck(committed.deckId)
		const slide = installMixedAtlas(entry)

		let buffer = await pptxBuffer(entry)
		buffers.set('initial', buffer)
		lifecycle.push(await inspectPackage(buffer, {
			state: 'initial', order: INITIAL_ORDER, carriers: expectedCarriers('initial'), groupName: 'a11y-group', groupChildren: GROUP_CHILDREN,
		}))

		reorderNativeObject(slide, 'a11y-group', 0)
		reorderNativeObject(slide, 'a11y-picture', slide._slideObjects.length)
		buffer = await pptxBuffer(entry)
		buffers.set('reordered', buffer)
		lifecycle.push(await inspectPackage(buffer, {
			state: 'reordered', order: REORDERED_ORDER, carriers: expectedCarriers('reordered'), groupName: 'a11y-group', groupChildren: GROUP_CHILDREN,
		}))

		applyAccessibilityState(slide, 'metadata-reset')
		buffer = await pptxBuffer(entry)
		buffers.set('metadata-reset', buffer)
		lifecycle.push(await inspectPackage(buffer, {
			state: 'metadata-reset', order: REORDERED_ORDER, carriers: expectedCarriers('metadata-reset'), groupName: 'a11y-group', groupChildren: GROUP_CHILDREN,
		}))

		applyAccessibilityState(slide, 'decorative-hidden')
		buffer = await pptxBuffer(entry)
		buffers.set('decorative-hidden', buffer)
		lifecycle.push(await inspectPackage(buffer, {
			state: 'decorative-hidden', order: REORDERED_ORDER, carriers: expectedCarriers('decorative-hidden'), groupName: 'a11y-group', groupChildren: GROUP_CHILDREN,
		}))

		applyAccessibilityState(slide, 'false-reset')
		buffer = await pptxBuffer(entry)
		buffers.set('false-reset', buffer)
		lifecycle.push(await inspectPackage(buffer, {
			state: 'false-reset', order: REORDERED_ORDER, carriers: expectedCarriers('false-reset'), groupName: 'a11y-group', groupChildren: GROUP_CHILDREN,
		}))

		applyAccessibilityState(slide, 'reedited')
		const finalBuffer = await pptxBuffer(entry)
		buffers.set('reedited', finalBuffer)
		lifecycle.push(await inspectPackage(finalBuffer, {
			state: 'reedited', order: REORDERED_ORDER, carriers: expectedCarriers('reedited'), groupName: 'a11y-group', groupChildren: GROUP_CHILDREN,
		}))

		const exported = unwrap('current-spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		const exportReadback = assertCurrentSpecAccessibility(exported.spec)
		const exportedSpecPath = path.join(resolvedOutput, 'foundation-accessibility-exported-spec.json')
		const portableCurrentSpec = portableSpec(exported.spec)
		const portableSpecPath = path.join(resolvedOutput, 'foundation-accessibility-portable-spec.json')
		await fs.writeFile(exportedSpecPath, `${JSON.stringify(exported.spec, null, 2)}\n`, 'utf8')
		await fs.writeFile(portableSpecPath, `${JSON.stringify(portableCurrentSpec, null, 2)}\n`, 'utf8')
		const replay = unwrap('current-spec recompile', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: portableCurrentSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		const knownNames = new Set(OBJECTS.map(item => item.name))
		const replayOriginalNames = portableCurrentSpec.slides.flatMap(currentSlide => currentSlide.content || [])
			.map(block => block?.name ?? block?.objectName).filter(name => knownNames.has(name))
		const expectedReplayNames = REORDERED_ORDER.filter(name => name !== 'a11y-group' || exportReadback.groupKind === 'group')
		assert.deepEqual(replayOriginalNames, expectedReplayNames,
			'portable current-spec must retain every semantically supported object in reading order; only a genuinely opaque group may be excluded')
		const nameMap = replayNameMap(replayEntry.pptx.slides[0], replayOriginalNames)
		const replayBuffer = await pptxBuffer(replayEntry)
		buffers.set('recompiled', replayBuffer)
		const replayOrder = replayOriginalNames.map(name => nameMap[name])
		lifecycle.push(await inspectPackage(replayBuffer, {
			state: 'recompiled', order: replayOrder, orderMode: 'relative', carriers: expectedCarriers('reedited', nameMap, replayOriginalNames),
			...(nameMap['a11y-group'] ? { groupName: nameMap['a11y-group'], groupChildren: GROUP_CHILDREN } : {}),
		}))

		for (const name of DELETED_NAMES) {
			await handleDeleteShapesForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: name } })
		}
		const deletedBuffer = await pptxBuffer(entry)
		buffers.set('deleted', deletedBuffer)
		lifecycle.push(await inspectPackage(deletedBuffer, {
			state: 'deleted', order: SURVIVOR_ORDER, carriers: expectedCarriers('reedited', null, SURVIVOR_ORDER),
			deletedNames: DELETED_NAMES, criticalCounts: { media: 0, charts: 0 },
		}))

		const files = {}
		for (const [state, stateBuffer] of buffers) {
			const file = path.join(resolvedOutput, `foundation-accessibility-${state}.pptx`)
			await fs.writeFile(file, stateBuffer)
			files[state] = { file: relative(file), bytes: stateBuffer.length, sha256: sha256(stateBuffer) }
		}
		const finalAudit = await runPackageAudit(path.join(resolvedOutput, 'foundation-accessibility-reedited.pptx'))
		const deletedAudit = await runPackageAudit(path.join(resolvedOutput, 'foundation-accessibility-deleted.pptx'))

		let officeResult = { status: 'dependency-gated', reason: 'Set BETTERPPTX_FOUNDATION_ACCESSIBILITY_OFFICE=1 to run PowerPoint Open2007/SaveCopyAs/reopen.' }
		if (office) {
			const roundtripPath = path.join(resolvedOutput, 'foundation-accessibility-reedited-savecopyas.pptx')
			const officeReportPath = path.join(resolvedOutput, 'foundation-accessibility-office-com.json')
			officeResult = await runOfficeProof(path.join(resolvedOutput, 'foundation-accessibility-reedited.pptx'), roundtripPath, officeReportPath)
			const roundtripBuffer = await fs.readFile(roundtripPath)
			officeResult.package = await inspectPackage(roundtripBuffer, {
				state: 'powerpoint-savecopyas-reopen', order: REORDERED_ORDER, carriers: expectedCarriers('reedited'), groupName: 'a11y-group', groupChildren: GROUP_CHILDREN,
			})
			officeResult.packageAudit = await runPackageAudit(roundtripPath)
			officeResult.roundtripFile = relative(roundtripPath)
			officeResult.roundtripSha256 = sha256(roundtripBuffer)
			officeResult.reportFile = relative(officeReportPath)
		}

		return {
			schemaVersion: 'betterpptx.foundation-accessibility-unit-proof.v1',
			unitId: FOUNDATION_ACCESSIBILITY_UNIT_ID,
			status: officeResult.status === 'PASS'
				? 'FOUNDATION_ACCESSIBILITY_PACKAGE_AND_OFFICE_VERIFIED'
				: 'FOUNDATION_ACCESSIBILITY_PACKAGE_VERIFIED_OFFICE_DEPENDENCY_GATED',
			generatedAt: new Date().toISOString(),
			rows: FOUNDATION_ACCESSIBILITY_ROWS.map(([id, label]) => ({ id, label })),
			runtime,
			checks: {
				xmlParseAndOpcClosure: true,
				uniqueIdsAndCarrierChildOrder: true,
				titleDescriptionDecorativeExact: true,
				topLevelAndNestedReadingOrder: true,
				connectorAndTimingTargetsClosed: true,
				relationshipContentTypeAndOrphanCleanup: true,
				metadataResetDecorativeFalseResetReedit: true,
				currentSpecExportRecompile: true,
				privateStateAndFilesystemLeakageAbsent: true,
				powerPointOpen2007SaveCopyAsReopen: officeResult.status === 'PASS',
			},
			lifecycle,
			exportReadback: { groupKind: exportReadback.groupKind, replayedObjects: replayOriginalNames },
			packageAudits: { reedited: finalAudit, deleted: deletedAudit },
			office: officeResult,
			files: {
				...files,
				currentSpec: { file: relative(exportedSpecPath), sha256: sha256(await fs.readFile(exportedSpecPath)) },
				portableSpec: { file: relative(portableSpecPath), sha256: sha256(await fs.readFile(portableSpecPath)) },
			},
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	if (process.argv.includes('--probe')) {
		const runtime = await probeFoundationAccessibilityRuntime()
		console.log(JSON.stringify({
			schemaVersion: 'betterpptx.foundation-accessibility-runtime-probe.v1',
			unitId: FOUNDATION_ACCESSIBILITY_UNIT_ID,
			status: runtime.ready ? 'FOUNDATION_ACCESSIBILITY_RUNTIME_READY' : 'FOUNDATION_ACCESSIBILITY_RUNTIME_DEPENDENCY_GATED',
			runtime,
		}, null, 2))
		return
	}
	const configured = String(process.env.BETTERPPTX_FOUNDATION_ACCESSIBILITY_OUTPUT || '').trim()
	const outputDir = configured ? path.resolve(configured) : await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-foundation-accessibility-${timestamp()}-`))
	const office = ['1', 'true', 'yes'].includes(String(process.env.BETTERPPTX_FOUNDATION_ACCESSIBILITY_OFFICE || '').trim().toLowerCase())
	const result = await runFoundationAccessibilityUnitProof({ outputDir, office })
	const proofPath = path.join(outputDir, 'foundation-accessibility-unit-proof.json')
	await fs.writeFile(proofPath, `${JSON.stringify({ ...result, proofPath: relative(proofPath) }, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify({ ...result, proofPath: relative(proofPath) }, null, 2))
}

if (path.resolve(process.argv[1] || '') === modulePath) {
	main().catch(error => {
		console.error(error?.stack || error)
		if (error?.details) console.error(JSON.stringify(error.details, null, 2))
		process.exitCode = 1
	})
}
