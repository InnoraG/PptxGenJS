import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const modulePath = fileURLToPath(import.meta.url)
const moduleDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(moduleDir, '..')

export const LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID = 'impl-b-bd9036f7a7458201'
export const LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROWS = Object.freeze([
	Object.freeze(['cap_adb7f3edf5645381f0f6', 'chart']),
	Object.freeze(['cap_ba389c82d344c0610bab', 'showMasterShapes']),
	Object.freeze(['cap_d8cf7ea86a8ff0992e12', 'table']),
])

const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const REL_TYPES = Object.freeze({
	chart: `${REL_BASE}chart`,
	package: `${REL_BASE}package`,
	layout: `${REL_BASE}slideLayout`,
	master: `${REL_BASE}slideMaster`,
	chartStyle: 'http://schemas.microsoft.com/office/2011/relationships/chartStyle',
	chartColorStyle: 'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle',
})
const CONTENT_TYPES = Object.freeze({
	chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
	chartStyle: 'application/vnd.ms-office.chartstyle+xml',
	chartColorStyle: 'application/vnd.ms-office.chartcolorstyle+xml',
	tableStyles: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml',
})
const NAMES = Object.freeze({
	master: 'GraphicPlaceholderMaster',
	layout: 'GraphicPlaceholderLayout',
	chartSlot: 'chartSlot',
	tableSlot: 'tableSlot',
	chart: 'placeholder-chart',
	table: 'placeholder-table',
	emptyMarker: 'empty-slide-marker',
	hiddenMarker: 'hidden-master-shapes-marker',
	masterMark: 'graphic-placeholder-master-mark',
})
const PLACEHOLDERS = Object.freeze({
	chart: Object.freeze({ name: NAMES.chartSlot, type: 'chart', idx: 10, x: 0.65, y: 1.15, w: 5.8, h: 4.9 }),
	table: Object.freeze({ name: NAMES.tableSlot, type: 'tbl', idx: 11, x: 6.9, y: 1.15, w: 5.78, h: 4.9 }),
})

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
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
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
	}).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label}: XML parser errors`)
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

function relationshipRecords(document) {
	if (!document) return []
	return elements(document, 'Relationship').map(node => ({
		Id: node.getAttribute('Id'),
		Type: node.getAttribute('Type'),
		Target: node.getAttribute('Target'),
		TargetMode: node.getAttribute('TargetMode'),
	}))
}

function relationshipPartFor(partName) {
	return path.posix.join(path.posix.dirname(partName), '_rels', `${path.posix.basename(partName)}.rels`)
}

function sourcePartForRelationships(relsPart) {
	if (relsPart === '_rels/.rels') return ''
	return path.posix.join(path.posix.dirname(path.posix.dirname(relsPart)), path.posix.basename(relsPart, '.rels'))
}

function resolveTarget(sourcePart, target) {
	const base = sourcePart ? path.posix.dirname(sourcePart) : ''
	return path.posix.normalize(path.posix.join(base, String(target || '').replace(/^\/+/, '')))
}

function relsFor(documents, partName) {
	return relationshipRecords(documents.get(relationshipPartFor(partName)))
}

function relationshipId(node) {
	return node?.getAttribute('r:id')
		|| node?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
		|| ''
}

function cSldName(document) {
	return elements(document, 'cSld')[0]?.getAttribute('name') || ''
}

function topLevelCarriers(document) {
	const spTree = elements(document, 'spTree')[0]
	return elementChildren(spTree).filter(node => ['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'].includes(node.localName))
}

function carrierName(carrier) {
	return elements(carrier, 'cNvPr')[0]?.getAttribute('name') || ''
}

function nameMatches(actual, wanted) {
	return actual === wanted || actual.endsWith(`.${wanted}`) || actual.includes(`.${wanted}.`) || actual.includes(wanted)
}

function carrierByName(document, wanted) {
	return topLevelCarriers(document).find(carrier => nameMatches(carrierName(carrier), wanted)) || null
}

function placeholderTuple(carrier) {
	const node = elements(carrier, 'ph')[0]
	if (!node) return null
	return {
		type: node.getAttribute('type') || '',
		idx: node.hasAttribute('idx') ? Number(node.getAttribute('idx')) : 0,
		size: node.getAttribute('sz') || '',
		orient: node.getAttribute('orient') || '',
	}
}

function graphicKind(carrier) {
	if (carrier?.localName !== 'graphicFrame') return ''
	const uri = elements(carrier, 'graphicData')[0]?.getAttribute('uri') || ''
	if (uri.endsWith('/chart') || elements(carrier, 'chart').length) return 'chart'
	if (uri.endsWith('/table') || elements(carrier, 'tbl').length) return 'table'
	return uri
}

function xfrmInches(carrier) {
	const xfrm = elements(carrier, 'xfrm')[0]
	const off = directChild(xfrm, 'off')
	const ext = directChild(xfrm, 'ext')
	if (!off || !ext) return null
	const inches = value => Number(value) / 914400
	return { x: inches(off.getAttribute('x')), y: inches(off.getAttribute('y')), w: inches(ext.getAttribute('cx')), h: inches(ext.getAttribute('cy')) }
}

function assertNear(actual, expected, label, tolerance = 0.003) {
	assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${label}: expected ${expected}, received ${actual}`)
}

function assertGeometry(actual, expected, label) {
	assert.ok(actual, `${label}: missing geometry`)
	for (const key of ['x', 'y', 'w', 'h']) assertNear(actual[key], expected[key], `${label}.${key}`)
}

function recordGap(blockers, code, stage, operation) {
	try {
		operation()
		return true
	} catch (error) {
		blockers.push({ code, stage, message: error?.message || String(error) })
		return false
	}
}

async function recordGapAsync(blockers, code, stage, operation) {
	try {
		await operation()
		return true
	} catch (error) {
		blockers.push({ code, stage, message: error?.message || String(error) })
		return false
	}
}

function baseMetadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title,
		layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'package reviewers', outcome: 'prove native graphic placeholders', remember: 'layout definitions, populated frames, visibility, and package closure' },
		visualDesign: { world: 'blueprint', framing: 'placeholder atlas', tone: 'technical' },
		motionTime: { masterClock: 'authored static slides', timingSource: 'static', syncPolicy: 'single static clock' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	}
}

function placeholderDefinition(definition) {
	return {
		...definition,
		size: 'full', orient: 'horz', hasCustomPrompt: false, margin: 0,
		text: definition.type === 'chart' ? 'Insert chart' : 'Insert table',
	}
}

function masterDefinition() {
	return {
		title: NAMES.master,
		name: NAMES.master,
		background: 'F8FAFC',
		objects: [{ text: { text: 'MASTER GRAPHIC PLACEHOLDER PROOF', options: { x: 0.2, y: 0.12, w: 3.2, h: 0.25, objectName: NAMES.masterMark, fontFace: 'Aptos', fontSize: 7, color: '2563EB' } } }],
		placeholders: [],
	}
}

function layoutDefinition(placeholders = [placeholderDefinition(PLACEHOLDERS.chart), placeholderDefinition(PLACEHOLDERS.table)]) {
	return {
		name: NAMES.layout,
		width: 13.333333,
		height: 7.5,
		type: 'wide',
		activate: true,
		masterName: NAMES.master,
		background: null,
		objects: [],
		placeholders,
	}
}

function chartBlock(binding = true) {
	return {
		kind: 'chart-panel', name: NAMES.chart, chartType: 'bar',
		data: [{ name: 'Readiness', labels: ['Initial', 'Updated'], values: [42, 84] }],
		chartOptions: {
			chartGalleryVariant: 1, chartStyleId: 1, chartStyleModernId: 101, chartColorStyleId: 10,
			showLegend: false, showValue: true, showTitle: true, title: 'Placeholder chart',
		},
		...(binding ? { placeholderBinding: { name: NAMES.chartSlot, type: 'chart', idx: PLACEHOLDERS.chart.idx, size: 'full', orient: 'horz', hasCustomPrompt: false } } : {}),
	}
}

function tableBlock(binding = true) {
	return {
		kind: 'table-panel', name: NAMES.table,
		header: ['State', 'Carrier'], rows: [['Initial', 'Inline table'], ['Updated', 'Native graphicFrame']],
		tableOptions: { fontFace: 'Aptos', fontSize: 12, margin: 0.08 },
		...(binding ? { placeholderBinding: { name: NAMES.tableSlot, type: 'table', idx: PLACEHOLDERS.table.idx, size: 'full', orient: 'horz', hasCustomPrompt: false } } : {}),
	}
}

export function authoredGraphicPlaceholderSpec() {
	return {
		...baseMetadata('Layout graphic placeholder visibility proof'),
		theme: { name: 'Graphic placeholder proof', headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', fontFace: 'Aptos', lang: 'en-US' },
		masters: [masterDefinition()],
		layouts: [layoutDefinition()],
		layoutContract: {
			allowedLayouts: [NAMES.layout], defaultLayout: NAMES.layout, strictLayout: true,
			placeholderBindings: {
				chart: { name: NAMES.chartSlot, type: 'chart', idx: PLACEHOLDERS.chart.idx },
				table: { name: NAMES.tableSlot, type: 'table', idx: PLACEHOLDERS.table.idx },
			},
		},
		slides: [
			{
				id: 'empty-placeholders', title: 'Empty layout placeholder carriers', layoutIntent: 'title-only',
				layoutName: NAMES.layout, masterName: NAMES.master, showMasterShapes: true,
				content: [{ kind: 'textBox', name: NAMES.emptyMarker, text: 'EMPTY PLACEHOLDER CARRIERS', region: 'footer' }],
			},
			{
				id: 'populated-placeholders', title: 'Populated chart and table placeholders', layoutIntent: 'title-only',
				layoutName: NAMES.layout, masterName: NAMES.master, showMasterShapes: true,
				content: [chartBlock(true), tableBlock(true)],
			},
			{
				id: 'hidden-master-shapes', title: 'Master shapes suppressed', layoutIntent: 'title-only',
				layoutName: NAMES.layout, masterName: NAMES.master, showMasterShapes: false,
				content: [{ kind: 'textBox', name: NAMES.hiddenMarker, text: 'DISPLAY MASTER SHAPES = FALSE', region: 'body' }],
			},
		],
	}
}

function portableSpec(value) {
	const visit = item => {
		if (Array.isArray(item)) return item.map(visit)
		if (!item || typeof item !== 'object') return item
		const out = {}
		for (const [key, child] of Object.entries(item)) {
			if (key.startsWith('_') || ['nativePackagePreservation', 'nativePreservation', 'preservationHandle', 'editHandle', 'rawPackageParts', 'rawPresentationFonts'].includes(key)) continue
			out[key] = visit(child)
		}
		return out
	}
	const clone = visit(value)
	clone.slides = (clone.slides || []).map(slide => ({ ...slide, content: (slide.content || []).filter(block => block.kind !== 'opaqueNative') }))
	return clone
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function chartWorkbookMembers(zip) {
	const members = new Set()
	const relParts = Object.keys(zip.files).filter(name => /^ppt\/charts\/_rels\/[^/]+\.xml\.rels$/i.test(name))
	for (const relPart of relParts) {
		const document = parseXmlStrict(await zip.file(relPart).async('string'), relPart)
		const sourcePart = sourcePartForRelationships(relPart)
		for (const relationship of relationshipRecords(document)) {
			if (relationship.Type !== REL_TYPES.package || relationship.TargetMode === 'External') continue
			const target = resolveTarget(sourcePart, relationship.Target)
			if (/^ppt\/embeddings\/.*\.(?:xlsx|xlsm)$/i.test(target)) members.add(target)
		}
	}
	return members
}

async function zipMemberDiff(beforeBuffer, afterBuffer) {
	const [beforeZip, afterZip] = await Promise.all([
		JSZip.loadAsync(beforeBuffer, { checkCRC32: true }), JSZip.loadAsync(afterBuffer, { checkCRC32: true }),
	])
	const [beforeChartWorkbooks, afterChartWorkbooks] = await Promise.all([
		chartWorkbookMembers(beforeZip), chartWorkbookMembers(afterZip),
	])
	const volatileChartWorkbooks = new Set(
		[...beforeChartWorkbooks].filter(name => afterChartWorkbooks.has(name)),
	)
	const names = [...new Set([...Object.keys(beforeZip.files), ...Object.keys(afterZip.files)])].sort()
	const changed = []
	const semanticChanged = []
	const volatileOnly = []
	const metadataOnly = []
	for (const name of names) {
		const before = beforeZip.file(name)
		const after = afterZip.file(name)
		if (!before && !after) continue
		if (!before || !after) {
			const membershipChange = { name, before: Boolean(before), after: Boolean(after) }
			changed.push(membershipChange)
			semanticChanged.push(membershipChange)
			continue
		}
		const [beforeBytes, afterBytes] = await Promise.all([before.async('nodebuffer'), after.async('nodebuffer')])
		if (sha256(beforeBytes) !== sha256(afterBytes)) {
			const rawChange = { name, beforeHash: sha256(beforeBytes), afterHash: sha256(afterBytes) }
			changed.push(rawChange)
			const [beforeSemantic, afterSemantic] = await Promise.all([
				semanticPartHash(name, beforeBytes, volatileChartWorkbooks),
				semanticPartHash(name, afterBytes, volatileChartWorkbooks),
			])
			if (beforeSemantic === afterSemantic) volatileOnly.push(rawChange)
			else semanticChanged.push({ ...rawChange, beforeSemantic, afterSemantic })
		}
		else if (before.date?.getTime() !== after.date?.getTime()) metadataOnly.push(name)
	}
	return {
		memberPayloadsEqual: changed.length === 0,
		semanticPayloadsEqual: semanticChanged.length === 0,
		comparisonPolicy: {
			coreProperties: 'canonicalize dcterms:created, dcterms:modified, and cp:lastPrinted text only',
			embeddedChartWorkbooks: 'exclude opaque workbook bytes only when the member is the unchanged internal package target of a chart relationship in both packages; audit edge, target, content type, chart formulas/caches, and presence separately',
			allOtherMembers: 'exact uncompressed member bytes',
		},
		changed, semanticChanged, volatileOnly, metadataOnly,
	}
}

function normalizedCoreProperties(bytes) {
	const document = parseXmlStrict(bytes.toString('utf8'), 'canonical core properties')
	const timestamps = [
		['http://purl.org/dc/terms/', 'created'],
		['http://purl.org/dc/terms/', 'modified'],
		['http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'lastPrinted'],
	]
	for (const [namespace, localName] of timestamps) {
		for (const node of Array.from(document.getElementsByTagNameNS(namespace, localName))) node.textContent = ''
	}
	return Buffer.from(new XMLSerializer().serializeToString(document), 'utf8')
}

async function semanticPartHash(name, bytes, volatileChartWorkbooks) {
	if (volatileChartWorkbooks.has(name)) {
		// ExcelJS rewrites chart workbooks with volatile package metadata on every
		// presentation save. This verifier audits the chart XML formulas/caches,
		// relationship target, content type, and workbook presence separately; the
		// opaque embedded workbook bytes are therefore the one excluded member.
		return 'KNOWN_NONDETERMINISTIC_EMBEDDED_CHART_WORKBOOK'
	}
	if (name === 'docProps/core.xml') return sha256(normalizedCoreProperties(bytes))
	return sha256(bytes)
}

function slideDocumentWithName(slideParts, documents, wanted) {
	const part = slideParts.find(candidate => carrierByName(documents.get(candidate), wanted))
	return part ? { part, document: documents.get(part) } : null
}

function contentTypeMaps(document) {
	return {
		defaults: new Map(elements(document, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')])),
		overrides: new Map(elements(document, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')])),
	}
}

function tableCellTexts(tableCarrier) {
	return elements(tableCarrier, 'tc').map(cell => elements(cell, 't').map(node => node.textContent || '').join(''))
}

async function inspectPackage(buffer, expectation, blockers) {
	const state = expectation.state
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${state}/${name}`))
	}
	for (const [relPart, document] of documents) {
		if (!relPart.endsWith('.rels')) continue
		const rels = relationshipRecords(document)
		assert.equal(new Set(rels.map(item => item.Id)).size, rels.length, `${state}/${relPart}: duplicate relationship Id`)
		const source = sourcePartForRelationships(relPart)
		for (const rel of rels.filter(item => item.TargetMode !== 'External')) {
			const target = resolveTarget(source, rel.Target)
			assert.ok(nameSet.has(target), `${state}/${relPart}: dangling ${rel.Id} -> ${target}`)
		}
	}

	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${state}: [Content_Types].xml missing`)
	const { defaults, overrides } = contentTypeMaps(contentTypes)
	for (const part of overrides.keys()) assert.ok(nameSet.has(part), `${state}: override targets missing part ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${state}: ${name} has no content type`)
	}

	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name))
	const chartParts = names.filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name))
	const workbookParts = names.filter(name => /^ppt\/embeddings\/.+\.(?:xlsx|xlsm)$/i.test(name))
	const styleParts = names.filter(name => overrides.get(name) === CONTENT_TYPES.chartStyle)
	const colorParts = names.filter(name => overrides.get(name) === CONTENT_TYPES.chartColorStyle)
	const stylePayloadParts = names.filter(name => documents.get(name)?.documentElement?.localName === 'chartStyle')
	const colorPayloadParts = names.filter(name => documents.get(name)?.documentElement?.localName === 'colorStyle')
	for (const part of stylePayloadParts) assert.equal(overrides.get(part), CONTENT_TYPES.chartStyle, `${state}: ${part} chart style content type`)
	for (const part of colorPayloadParts) assert.equal(overrides.get(part), CONTENT_TYPES.chartColorStyle, `${state}: ${part} chart color-style content type`)
	const chartTopologies = new Map()
	const assertChartOwnedTopology = chartPart => {
		if (chartTopologies.has(chartPart)) return chartTopologies.get(chartPart)
		const chartRels = relsFor(documents, chartPart)
		const packageRels = chartRels.filter(rel => rel.Type === REL_TYPES.package)
		const styleRels = chartRels.filter(rel => rel.Type === REL_TYPES.chartStyle)
		const colorRels = chartRels.filter(rel => rel.Type === REL_TYPES.chartColorStyle)
		assert.equal(packageRels.length, 1, `${state}: ${chartPart} must own exactly one workbook package edge`)
		assert.ok(styleRels.length <= 1, `${state}: ${chartPart} duplicate chart style edges`)
		assert.ok(colorRels.length <= 1, `${state}: ${chartPart} duplicate chart color-style edges`)
		const workbookPart = resolveTarget(chartPart, packageRels[0].Target)
		assert.ok(workbookParts.includes(workbookPart), `${state}: ${chartPart} workbook target`)
		let topology
		if (expectation.allowPowerPointStyleCanonicalization) {
			assert.equal(styleRels.length, colorRels.length, `${state}: PowerPoint must preserve or remove chart style/color edges as a pair`)
			topology = styleRels.length === 0 ? 'chart-workbook-office-canonicalized' : 'chart-workbook-style-color'
		} else {
			assert.equal(styleRels.length, 1, `${state}: ${chartPart} chart style edge missing`)
			assert.equal(colorRels.length, 1, `${state}: ${chartPart} chart color-style edge missing`)
			topology = 'chart-workbook-style-color'
		}
		if (topology === 'chart-workbook-style-color') {
			const stylePart = resolveTarget(chartPart, styleRels[0].Target)
			const colorPart = resolveTarget(chartPart, colorRels[0].Target)
			assert.ok(nameSet.has(stylePart), `${state}: ${chartPart} style target`)
			assert.ok(nameSet.has(colorPart), `${state}: ${chartPart} color target`)
			assert.equal(overrides.get(stylePart), CONTENT_TYPES.chartStyle, `${state}: ${chartPart} style content type`)
			assert.equal(overrides.get(colorPart), CONTENT_TYPES.chartColorStyle, `${state}: ${chartPart} color-style content type`)
		}
		chartTopologies.set(chartPart, topology)
		return topology
	}
	assert.equal(slideParts.length, expectation.slideCount ?? 3, `${state}: slide count`)
	assert.equal(masterParts.length, 1, `${state}: exactly one authored physical master`)
	assert.ok(layoutParts.length >= 1, `${state}: layout part missing`)

	const layoutPart = layoutParts.find(part => cSldName(documents.get(part)) === NAMES.layout)
	assert.ok(layoutPart, `${state}: named layout ${NAMES.layout} missing`)
	const layoutDocument = documents.get(layoutPart)
	for (const definition of Object.values(PLACEHOLDERS)) {
		const carriers = topLevelCarriers(layoutDocument).filter(carrier => {
			const tuple = placeholderTuple(carrier)
			return tuple?.type === definition.type && tuple.idx === definition.idx
		})
		assert.equal(carriers.length, 1, `${state}: layout ${definition.type}/${definition.idx} tuple cardinality`)
		assert.equal(carriers[0].localName, 'sp', `${state}: empty layout ${definition.type} placeholder must be p:sp`)
		assert.ok(nameMatches(carrierName(carriers[0]), definition.name), `${state}: layout ${definition.type} placeholder name`)
		assertGeometry(xfrmInches(carriers[0]), definition, `${state}: layout ${definition.type} placeholder geometry`)
	}
	assert.equal(relsFor(documents, layoutPart).filter(rel => rel.Type === REL_TYPES.chart).length, 0, `${state}: empty layout placeholders must not create chart edges`)

	const emptySlide = slideDocumentWithName(slideParts, documents, NAMES.emptyMarker)
	assert.ok(emptySlide, `${state}: empty-placeholder slide missing`)
	for (const definition of Object.values(PLACEHOLDERS)) {
		const inherited = topLevelCarriers(emptySlide.document).filter(carrier => {
			const tuple = placeholderTuple(carrier)
			return tuple?.type === definition.type && tuple.idx === definition.idx
		})
		assert.equal(inherited.length, 1, `${state}: empty slide ${definition.type}/${definition.idx} placeholder cardinality`)
		assert.equal(inherited[0].localName, 'sp', `${state}: empty slide ${definition.type} placeholder must remain p:sp`)
	}
	assert.equal(topLevelCarriers(emptySlide.document).filter(carrier => ['chart', 'table'].includes(graphicKind(carrier))).length, 0, `${state}: empty slide must not materialize chart/table graphic frames`)

	const populated = slideDocumentWithName(slideParts, documents, NAMES.chart) || slideDocumentWithName(slideParts, documents, NAMES.table)
	if (expectation.expectObjects === false) {
		assert.equal(populated, null, `${state}: deleted chart/table objects must be absent`)
		assert.equal(chartParts.length, 0, `${state}: deleted chart must leave no chart parts`)
		assert.equal(workbookParts.length, 0, `${state}: deleted chart must leave no workbook parts`)
		assert.equal(styleParts.length, 0, `${state}: deleted chart must leave no style parts`)
		assert.equal(colorParts.length, 0, `${state}: deleted chart must leave no color parts`)
	} else {
		assert.ok(populated, `${state}: populated slide missing`)
		const chartCarrier = carrierByName(populated.document, NAMES.chart)
		const tableCarrier = carrierByName(populated.document, NAMES.table)
		assert.ok(chartCarrier, `${state}: chart carrier missing`)
		assert.ok(tableCarrier, `${state}: table carrier missing`)
		assert.equal(chartCarrier.localName, 'graphicFrame', `${state}: populated chart must be p:graphicFrame`)
		assert.equal(tableCarrier.localName, 'graphicFrame', `${state}: populated table must be p:graphicFrame`)
		assert.equal(graphicKind(chartCarrier), 'chart', `${state}: chart graphicData URI`)
		assert.equal(graphicKind(tableCarrier), 'table', `${state}: table graphicData URI`)
		assert.ok(elements(tableCarrier, 'tbl').length === 1, `${state}: table must be inline a:tbl`)
		assert.deepEqual(tableCellTexts(tableCarrier).slice(0, 4), ['State', 'Carrier', 'Initial', 'Inline table'], `${state}: table cell content`)

		const chartTuple = placeholderTuple(chartCarrier)
		const tableTuple = placeholderTuple(tableCarrier)
		if (expectation.requireBindings) {
			recordGap(blockers, 'CHART_GRAPHICFRAME_PLACEHOLDER_BINDING', state, () => assert.deepEqual(chartTuple && { type: chartTuple.type, idx: chartTuple.idx }, { type: 'chart', idx: PLACEHOLDERS.chart.idx }, `${state}: populated chart p:ph tuple`))
			recordGap(blockers, 'TABLE_GRAPHICFRAME_PLACEHOLDER_BINDING', state, () => assert.deepEqual(tableTuple && { type: tableTuple.type, idx: tableTuple.idx }, { type: 'tbl', idx: PLACEHOLDERS.table.idx }, `${state}: populated table p:ph tuple`))
			for (const definition of Object.values(PLACEHOLDERS)) {
				recordGap(blockers, `NO_DUPLICATE_EMPTY_${definition.type.toUpperCase()}_PLACEHOLDER`, state, () => {
					const duplicates = topLevelCarriers(populated.document).filter(carrier => carrier.localName === 'sp' && placeholderTuple(carrier)?.type === definition.type && placeholderTuple(carrier)?.idx === definition.idx)
					assert.equal(duplicates.length, 0, `${state}: populated ${definition.type} must suppress its empty p:sp carrier`)
				})
			}
		} else {
			assert.equal(chartTuple, null, `${state}: reset chart binding must omit p:ph`)
			assert.equal(tableTuple, null, `${state}: reset table binding must omit p:ph`)
		}

		const slideRels = relsFor(documents, populated.part)
		const chartNode = elements(chartCarrier, 'chart')[0]
		const chartRid = relationshipId(chartNode)
		assert.ok(chartRid, `${state}: chart r:id missing`)
		const chartRel = slideRels.find(rel => rel.Id === chartRid)
		assert.ok(chartRel, `${state}: chart relationship missing`)
		assert.equal(chartRel.Type, REL_TYPES.chart, `${state}: chart relationship type`)
		const chartPart = resolveTarget(populated.part, chartRel.Target)
		assert.ok(chartParts.includes(chartPart), `${state}: chart target part`)
		assert.equal(overrides.get(chartPart), CONTENT_TYPES.chart, `${state}: chart content type override`)
		assertChartOwnedTopology(chartPart)
		assert.equal(slideRels.filter(rel => /\/table$/i.test(rel.Type)).length, 0, `${state}: inline table must not create a table relationship`)
		assert.equal(elements(tableCarrier, 'chart').length, 0, `${state}: table must not reference a chart part`)
		assert.equal(Array.from(tableCarrier.getElementsByTagName('*')).filter(node => relationshipId(node)).length, 0, `${state}: inline table must not own package relationship ids`)
	}

	for (const chartPart of chartParts) {
		assertChartOwnedTopology(chartPart)
		const incoming = []
		for (const [relPart, document] of documents) {
			if (!relPart.endsWith('.rels')) continue
			const source = sourcePartForRelationships(relPart)
			for (const rel of relationshipRecords(document).filter(rel => rel.TargetMode !== 'External')) {
				if (resolveTarget(source, rel.Target) === chartPart) incoming.push({ relPart, type: rel.Type })
			}
		}
		assert.ok(incoming.some(item => item.type === REL_TYPES.chart), `${state}: orphan chart part ${chartPart}`)
	}
	if (expectation.allowPowerPointStyleCanonicalization && chartParts.length > 0) {
		const topologies = new Set(chartTopologies.values())
		assert.equal(topologies.size, 1, `${state}: PowerPoint chart topology must be consistently preserved or canonicalized`)
		if (topologies.has('chart-workbook-office-canonicalized')) {
			assert.equal(stylePayloadParts.length, 0, `${state}: canonicalized package retained chart style parts`)
			assert.equal(colorPayloadParts.length, 0, `${state}: canonicalized package retained chart color-style parts`)
			assert.equal(styleParts.length, 0, `${state}: canonicalized package retained chart style content-type overrides`)
			assert.equal(colorParts.length, 0, `${state}: canonicalized package retained chart color-style content-type overrides`)
		}
	}
	for (const part of [...workbookParts, ...styleParts, ...colorParts]) {
		const incoming = []
		for (const chartPart of chartParts) {
			for (const rel of relsFor(documents, chartPart)) if (resolveTarget(chartPart, rel.Target) === part) incoming.push({ chartPart, type: rel.Type })
		}
		assert.ok(incoming.length > 0, `${state}: orphan chart-owned part ${part}`)
	}
	assert.equal(overrides.get('ppt/tableStyles.xml'), CONTENT_TYPES.tableStyles, `${state}: tableStyles content type`)

	const expectedVisibility = expectation.visibility || [true, true, false]
	assert.equal(expectedVisibility.length, slideParts.length, `${state}: visibility expectation cardinality`)
	for (const [index, expected] of expectedVisibility.entries()) {
		const root = documents.get(slideParts[index]).documentElement
		if (expected) assert.ok(!root.hasAttribute('showMasterSp') || root.getAttribute('showMasterSp') === '1', `${state}: slide ${index + 1} showMasterShapes=true/default`)
		else assert.equal(root.getAttribute('showMasterSp'), '0', `${state}: slide ${index + 1} showMasterShapes=false`)
	}

	return {
		state,
		partCount: names.length,
		slideCount: slideParts.length,
		layoutCount: layoutParts.length,
		masterCount: masterParts.length,
		chartParts: chartParts.length,
		workbookParts: workbookParts.length,
		chartStyleParts: styleParts.length,
		chartColorStyleParts: colorParts.length,
		chartPackageTopology: chartParts.length === 0 ? 'none' : [...new Set(chartTopologies.values())][0],
		tableParts: names.filter(name => /\/tables?\//i.test(name)).length,
		packageSha256: sha256(buffer),
	}
}

async function writeImmutable(file, bytes) {
	await fs.writeFile(file, bytes, { flag: 'wx' })
}

async function writeState(outputDir, entry, state, expectation, blockers, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `layout-graphic-placeholder-visibility-${state}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, { ...expectation, state }, blockers)
	artifacts[state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { buffer, file, inspection }
}

function actualObjectName(entry, slideIndex, wanted) {
	const names = (entry.pptx.slides[slideIndex]?._slideObjects || []).map(object => object?.options?.objectName).filter(Boolean)
	const found = names.find(name => nameMatches(String(name), wanted))
	assert.ok(found, `slide ${slideIndex + 1}: object ${wanted} missing; available: ${names.join(', ')}`)
	return found
}

async function commitPatch(mcp, entry, spec, label) {
	const beforeVersion = entry.deckVersion
	const result = dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId: entry.deckId, deckVersion: beforeVersion, spec,
		phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	assert.ok(entry.deckVersion > beforeVersion, `${label}: deckVersion did not advance`)
	return result
}

function reorderDirectShape(slide, objectName, position) {
	const objects = slide?._slideObjects || []
	const index = objects.findIndex(object => object?.options?.objectName === objectName)
	assert.ok(index >= 0, `direct reorder target ${objectName} missing`)
	const [object] = objects.splice(index, 1)
	objects.splice(position === 'back' ? 0 : objects.length, 0, object)
}

async function runPackageAudit(filePath) {
	const result = await run(process.execPath, [path.join(workspaceRoot, 'tools', 'audit-pptx-package-integrity.mjs'), filePath], {
		cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 120000,
	})
	const report = JSON.parse(result.stdout)
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.deepEqual(report.errors || [], [], JSON.stringify(report))
	return report
}

function patchEnvelope(title, overrides = {}) {
	return { ...baseMetadata(title), slides: [], ...overrides }
}

function blockingFindings(result) {
	const data = result?.data || result || {}
	return [...(data.unsupportedFindings || []), ...(data.unsupported || [])].filter(item => item?.blocking !== false)
}

async function negativeMutationCase({ mcp, getDeck, deckIds, label, code, expected, attempt }) {
	const created = dataOf(`${label} fixture`, await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: authoredGraphicPlaceholderSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	deckIds.push(created.deckId)
	const entry = getDeck(created.deckId)
	const beforeVersion = entry.deckVersion
	const beforeBuffer = await pptxBuffer(entry)
	const beforeHash = sha256(beforeBuffer)
	let result
	try {
		result = await attempt({ mcp, entry, deckId: created.deckId, deckVersion: beforeVersion })
	} catch (error) {
		result = { ok: false, error: { code: error?.code, message: error?.message || String(error) } }
	}
	const findings = blockingFindings(result)
	const diagnostic = JSON.stringify(result)
	const rejected = result?.ok === false || findings.length > 0
	const afterBuffer = await pptxBuffer(entry)
	const afterHash = sha256(afterBuffer)
	const versionUnchanged = entry.deckVersion === beforeVersion
	const rawPackageUnchanged = afterHash === beforeHash
	const packageDiff = rawPackageUnchanged ? { memberPayloadsEqual: true, semanticPayloadsEqual: true, changed: [], semanticChanged: [], volatileOnly: [], metadataOnly: [] } : await zipMemberDiff(beforeBuffer, afterBuffer)
	const semanticPackageUnchanged = packageDiff.semanticPayloadsEqual
	const diagnosticMatches = expected.test(diagnostic)
	const passed = rejected && versionUnchanged && semanticPackageUnchanged && diagnosticMatches
	return {
		label, code, passed, rejected, versionUnchanged, rawPackageUnchanged, semanticPackageUnchanged, diagnosticMatches,
		beforeVersion, afterVersion: entry.deckVersion, beforeHash, afterHash,
		diagnostic: diagnostic.slice(0, 1000),
		...(rawPackageUnchanged ? {} : { zipDiff: packageDiff }),
	}
}

function publicObjectPatchAttempt({ mcp, deckId, deckVersion, title, objectName, patch }) {
	return mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		spec: patchEnvelope(title, { slides: [{
			id: 'populated-placeholders', slideIndex: 1, layoutIntent: 'title-only',
			content: [{ kind: 'shape', name: objectName, patch }],
		}] }),
	})
}

async function runNegativeMutationGates({ mcp, getDeck, deckIds, blockers }) {
	const cases = [
		{
			label: 'chart object cannot bind to table placeholder', code: 'FAIL_CLOSED_CHART_TO_TABLE_TYPE_MISMATCH', expected: /chart|table|tbl|placeholder|type|mismatch/i,
			attempt: ({ mcp, entry, deckId, deckVersion }) => publicObjectPatchAttempt({ mcp, deckId, deckVersion, title: 'Chart to table mismatch', objectName: actualObjectName(entry, 1, NAMES.chart), patch: { placeholderBinding: { name: NAMES.tableSlot, type: 'table', idx: PLACEHOLDERS.table.idx } } }),
		},
		{
			label: 'table object cannot bind to chart placeholder', code: 'FAIL_CLOSED_TABLE_TO_CHART_TYPE_MISMATCH', expected: /chart|table|tbl|placeholder|type|mismatch/i,
			attempt: ({ mcp, entry, deckId, deckVersion }) => publicObjectPatchAttempt({ mcp, deckId, deckVersion, title: 'Table to chart mismatch', objectName: actualObjectName(entry, 1, NAMES.table), patch: { placeholderBinding: { name: NAMES.chartSlot, type: 'chart', idx: PLACEHOLDERS.chart.idx } } }),
		},
		{
			label: 'missing placeholder name cannot bind', code: 'FAIL_CLOSED_MISSING_PLACEHOLDER_BINDING', expected: /missing|not present|not found|placeholder|binding/i,
			attempt: ({ mcp, entry, deckId, deckVersion }) => publicObjectPatchAttempt({ mcp, deckId, deckVersion, title: 'Missing placeholder binding', objectName: actualObjectName(entry, 1, NAMES.chart), patch: { placeholderBinding: { name: 'MissingChartSlot', type: 'chart', idx: 99 } } }),
		},
		{
			label: 'conflicting placeholder type aliases', code: 'FAIL_CLOSED_PLACEHOLDER_ALIAS_CONFLICT', expected: /aliases|agree|conflict/i,
			attempt: ({ mcp, entry, deckId, deckVersion }) => publicObjectPatchAttempt({ mcp, deckId, deckVersion, title: 'Placeholder alias conflict', objectName: actualObjectName(entry, 1, NAMES.chart), patch: { placeholderBinding: { name: NAMES.chartSlot, type: 'chart', phType: 'tbl', idx: PLACEHOLDERS.chart.idx } } }),
		},
		{
			label: 'conflicting showMasterShapes aliases', code: 'FAIL_CLOSED_SHOW_MASTER_SHAPES_ALIAS_CONFLICT', expected: /showMasterShapes|showMasterBackground|agree|conflict/i,
			attempt: ({ mcp, deckId, deckVersion }) => mcp.call('betterpptx.deck.generate_from_spec', {
				deckId, deckVersion, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
				spec: patchEnvelope('Visibility alias conflict', { slides: [{ id: 'empty-placeholders', slideIndex: 0, layoutIntent: 'title-only', showMasterShapes: false, showMasterBackground: true, content: [] }] }),
			}),
		},
		{
			label: 'duplicate chart placeholder tuple', code: 'FAIL_CLOSED_DUPLICATE_PLACEHOLDER_TUPLE', expected: /duplicate|placeholder|idx|tuple/i,
			attempt: ({ mcp, deckId, deckVersion }) => mcp.call('betterpptx.deck.generate_from_spec', {
				deckId, deckVersion, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
				spec: patchEnvelope('Duplicate tuple conflict', { layouts: [layoutDefinition([
					placeholderDefinition(PLACEHOLDERS.chart),
					placeholderDefinition({ ...PLACEHOLDERS.chart, name: 'duplicateChartSlot', x: 1.2 }),
					placeholderDefinition(PLACEHOLDERS.table),
				])] }),
			}),
		},
		{
			label: 'duplicate authored master', code: 'FAIL_CLOSED_DUPLICATE_AUTHORED_MASTER', expected: /duplicate|master/i,
			attempt: ({ mcp, deckId, deckVersion }) => mcp.call('betterpptx.deck.generate_from_spec', {
				deckId, deckVersion, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
				spec: patchEnvelope('Duplicate master conflict', { masters: [masterDefinition(), masterDefinition()] }),
			}),
		},
	]
	const results = []
	for (const item of cases) {
		const result = await negativeMutationCase({ mcp, getDeck, deckIds, ...item })
		results.push(result)
		if (!result.passed) blockers.push({ code: item.code, stage: 'fail-closed-no-mutation', message: `${item.label}: ${result.diagnostic}; versionUnchanged=${result.versionUnchanged}; rawPackageUnchanged=${result.rawPackageUnchanged}; semanticPackageUnchanged=${result.semanticPackageUnchanged}` })
	}
	return results
}

function assertExportReadback(spec) {
	assert.ok(spec, 'exported spec missing')
	assert.equal(spec.masters?.length, 1, 'exported spec authored master count')
	const layout = (spec.layouts || []).find(item => item.name === NAMES.layout)
	assert.ok(layout, 'exported named layout missing')
	for (const definition of Object.values(PLACEHOLDERS)) {
		const placeholder = (layout.placeholders || []).find(item => item.name === definition.name || (item.type === (definition.type === 'tbl' ? 'table' : definition.type) && Number(item.idx) === definition.idx))
		assert.ok(placeholder, `exported ${definition.type} placeholder definition missing`)
		assert.equal(Number(placeholder.idx), definition.idx, `exported ${definition.type} idx`)
	}
	const populated = (spec.slides || []).find(slide => (slide.content || []).some(block => nameMatches(String(block.name || block.objectName || ''), NAMES.chart)))
	assert.ok(populated, 'exported populated slide missing')
	for (const [name, expected] of [[NAMES.chart, { type: 'chart', idx: PLACEHOLDERS.chart.idx }], [NAMES.table, { type: 'table', idx: PLACEHOLDERS.table.idx }]]) {
		const block = (populated.content || []).find(item => nameMatches(String(item.name || item.objectName || ''), name))
		assert.ok(block, `exported block ${name} missing`)
		assert.deepEqual(block.placeholderBinding && { type: block.placeholderBinding.type, idx: Number(block.placeholderBinding.idx) }, expected, `exported ${name} placeholderBinding`)
	}
	const hidden = (spec.slides || []).find(slide => (slide.content || []).some(block => nameMatches(String(block.name || block.objectName || ''), NAMES.hiddenMarker)))
	assert.equal(hidden?.showMasterShapes ?? hidden?.showMasterBackground, false, 'exported showMasterShapes=false')
}

function normalizeOfficeSnapshot(snapshot) {
	return {
		SlideCount: snapshot.SlideCount,
		Layouts: (snapshot.Layouts || []).map(layout => ({ Name: layout.Name, Shapes: layout.Shapes })),
		Slides: (snapshot.Slides || []).map(slide => ({ Index: slide.Index, LayoutName: slide.LayoutName, DisplayMasterShapes: slide.DisplayMasterShapes, Shapes: slide.Shapes })),
	}
}

function officeShape(container, wanted) {
	return (container?.Shapes || []).find(shape => nameMatches(String(shape.Name || ''), wanted))
}

function assertOfficeSnapshot(snapshot, label) {
	assert.equal(snapshot.SlideCount, 3, `${label}: slide count`)
	const layout = (snapshot.Layouts || []).find(item => item.Name === NAMES.layout)
	assert.ok(layout, `${label}: named layout`)
	const layoutChart = officeShape(layout, NAMES.chartSlot)
	const layoutTable = officeShape(layout, NAMES.tableSlot)
	assert.equal(Number(layoutChart?.PlaceholderType), 8, `${label}: layout chart PlaceholderFormat.Type`)
	assert.equal(Number(layoutTable?.PlaceholderType), 12, `${label}: layout table PlaceholderFormat.Type`)
	assert.deepEqual((snapshot.Slides || []).map(slide => slide.DisplayMasterShapes), [true, true, false], `${label}: DisplayMasterShapes`)
	const populated = (snapshot.Slides || []).find(slide => officeShape(slide, NAMES.chart) || officeShape(slide, NAMES.table))
	assert.ok(populated, `${label}: populated slide`)
	const chart = officeShape(populated, NAMES.chart)
	const table = officeShape(populated, NAMES.table)
	assert.equal(chart?.HasChart, true, `${label}: HasChart`)
	assert.ok(Number(chart?.ChartSeriesCount) >= 1, `${label}: chart data accessibility`)
	assert.equal(Number(chart?.PlaceholderType), 8, `${label}: populated chart PlaceholderFormat.Type`)
	assert.equal(table?.HasTable, true, `${label}: HasTable`)
	assert.equal(Number(table?.TableRows), 3, `${label}: table row count`)
	assert.equal(Number(table?.TableColumns), 2, `${label}: table column count`)
	assert.equal(String(table?.FirstDataCellText), 'Initial', `${label}: table content accessibility`)
	assert.equal(Number(table?.PlaceholderType), 12, `${label}: populated table PlaceholderFormat.Type`)
	return normalizeOfficeSnapshot(snapshot)
}

async function runOfficeProof(inputPath, outputPath, reportPath, blockers) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	try {
		await run('powershell.exe', [
			'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-layout-graphic-placeholder-visibility-unit-v1.ps1'),
			'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 180000, windowsHide: true })
		const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
		assert.equal(report.status, 'PASS')
		assert.equal(report.method, 'Presentations.Open2007')
		assert.equal(report.openAndRepair, false)
		assert.equal(report.saveCopyAs, true)
		assert.equal(report.reopened, true)
		let source
		let roundtrip
		recordGap(blockers, 'POWERPOINT_SOURCE_SEMANTICS', 'office-source', () => { source = assertOfficeSnapshot(report.source, 'PowerPoint source') })
		recordGap(blockers, 'POWERPOINT_ROUNDTRIP_SEMANTICS', 'office-roundtrip', () => { roundtrip = assertOfficeSnapshot(report.roundtrip, 'PowerPoint roundtrip') })
		if (source && roundtrip) recordGap(blockers, 'POWERPOINT_SAVECOPYAS_SEMANTIC_STABILITY', 'office-roundtrip', () => assert.deepEqual(roundtrip, source, 'PowerPoint semantic snapshot changed after SaveCopyAs/reopen'))
		return report
	} catch (error) {
		blockers.push({ code: 'POWERPOINT_OPEN2007_SAVECOPYAS_REOPEN', stage: 'office', message: error?.message || String(error) })
		return { status: 'FAIL', reason: error?.message || String(error) }
	}
}

export async function runLayoutGraphicPlaceholderVisibilityProof({ outputDir, office = false } = {}) {
	assert.equal(LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROWS.length, 3)
	assert.equal(new Set(LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROWS.map(([id]) => id)).size, 3)
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layout-graphic-placeholder-visibility-'))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const { createMcpToolDispatcher, getDeck, handleUpdateShapeForTest, handleDeleteShapesForTest } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `layout-graphic-placeholder-visibility-${Date.now()}`,
		clientInfo: { name: 'layout-graphic-placeholder-visibility-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true,
	})
	const deckIds = []
	const blockers = []
	const artifacts = {}
	const lifecycle = []
	try {
		const committed = dataOf('initial public-spec commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: authoredGraphicPlaceholderSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(committed.deckId)
		const entry = getDeck(committed.deckId)
		entry.deckId = committed.deckId
		const initial = await writeState(resolvedOutput, entry, 'initial-public-spec', { requireBindings: true }, blockers, artifacts, lifecycle)

		let chartName = actualObjectName(entry, 1, NAMES.chart)
		let tableName = actualObjectName(entry, 1, NAMES.table)
		dataOf('internal direct chart placeholder binding', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: chartName }, patch: { placeholderBinding: { name: NAMES.chartSlot, type: 'chart', idx: PLACEHOLDERS.chart.idx, size: 'full', orient: 'horz', hasCustomPrompt: false } } }))
		dataOf('internal direct table placeholder binding', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: tableName }, patch: { placeholderBinding: { name: NAMES.tableSlot, type: 'table', idx: PLACEHOLDERS.table.idx, size: 'full', orient: 'horz', hasCustomPrompt: false } } }))
		await writeState(resolvedOutput, entry, 'direct-bound', { requireBindings: true }, blockers, artifacts, lifecycle)

		dataOf('internal chart metadata update', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: chartName }, patch: { altText: 'Updated chart placeholder proof' } }))
		dataOf('internal table metadata update', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: tableName }, patch: { altText: 'Updated table placeholder proof' } }))
		await writeState(resolvedOutput, entry, 'updated', { requireBindings: true }, blockers, artifacts, lifecycle)

		dataOf('internal reset chart placeholder binding', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: chartName }, patch: { placeholderBinding: null } }))
		dataOf('internal reset table placeholder binding', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: tableName }, patch: { placeholderBinding: null } }))
		await writeState(resolvedOutput, entry, 'binding-reset', { requireBindings: false }, blockers, artifacts, lifecycle)

		dataOf('internal re-add chart placeholder binding', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: chartName }, patch: { placeholderBinding: { name: NAMES.chartSlot, type: 'chart', idx: PLACEHOLDERS.chart.idx } } }))
		dataOf('internal re-add table placeholder binding', await handleUpdateShapeForTest({ deckId: entry.deckId, slideIndex: 1, target: { objectName: tableName }, patch: { placeholderBinding: { name: NAMES.tableSlot, type: 'table', idx: PLACEHOLDERS.table.idx } } }))
		await writeState(resolvedOutput, entry, 'binding-readded', { requireBindings: true }, blockers, artifacts, lifecycle)

		reorderDirectShape(entry.pptx.slides[1], tableName, 'back')
		reorderDirectShape(entry.pptx.slides[1], chartName, 'front')
		await writeState(resolvedOutput, entry, 'shape-reordered', { requireBindings: true }, blockers, artifacts, lifecycle)

		await commitPatch(mcp, entry, patchEnvelope('Duplicate populated slide', { edits: { duplicateSlides: { slideIndex: 1 } } }), 'JSON-spec duplicate populated slide')
		await writeState(resolvedOutput, entry, 'slide-duplicated', { requireBindings: true, slideCount: 4, visibility: [true, true, false, true] }, blockers, artifacts, lifecycle)
		await commitPatch(mcp, entry, patchEnvelope('Reorder duplicated slide', { edits: { reorderSlides: { order: [0, 3, 1, 2] } } }), 'JSON-spec reorder duplicated slide')
		await writeState(resolvedOutput, entry, 'slide-reordered', { requireBindings: true, slideCount: 4, visibility: [true, true, true, false] }, blockers, artifacts, lifecycle)
		await commitPatch(mcp, entry, patchEnvelope('Delete duplicated slide', { edits: { deleteSlides: [1] } }), 'JSON-spec delete duplicated slide')
		await writeState(resolvedOutput, entry, 'duplicate-deleted', { requireBindings: true }, blockers, artifacts, lifecycle)

		chartName = actualObjectName(entry, 1, NAMES.chart)
		tableName = actualObjectName(entry, 1, NAMES.table)
		dataOf('internal delete populated chart and table', await handleDeleteShapesForTest({ deckId: entry.deckId, slideIndex: 1, targets: [{ objectName: chartName }, { objectName: tableName }] }))
		await writeState(resolvedOutput, entry, 'objects-deleted', { expectObjects: false }, blockers, artifacts, lifecycle)

		entry.pptx.slides[1].addChart('bar', [{ name: 'Readiness', labels: ['Reset', 'Re-added'], values: [0, 100] }], {
			objectName: NAMES.chart, x: PLACEHOLDERS.chart.x, y: PLACEHOLDERS.chart.y, w: PLACEHOLDERS.chart.w, h: PLACEHOLDERS.chart.h,
			placeholder: NAMES.chartSlot, phType: 'chart', phIdx: PLACEHOLDERS.chart.idx,
			chartGalleryVariant: 1, chartStyleId: 1, chartStyleModernId: 101, chartColorStyleId: 10, showLegend: false, showValue: true,
		})
		entry.pptx.slides[1].addTable([['State', 'Carrier'], ['Initial', 'Inline table'], ['Updated', 'Inline table']], {
			objectName: NAMES.table, x: PLACEHOLDERS.table.x, y: PLACEHOLDERS.table.y, w: PLACEHOLDERS.table.w, h: PLACEHOLDERS.table.h,
			placeholder: NAMES.tableSlot, phType: 'tbl', phIdx: PLACEHOLDERS.table.idx, fontFace: 'Aptos', fontSize: 12,
		})
		const finalState = await writeState(resolvedOutput, entry, 'final-readded', { requireBindings: true }, blockers, artifacts, lifecycle)

		const repeated = await pptxBuffer(entry)
		const deterministic = await zipMemberDiff(finalState.buffer, repeated)
		recordGap(blockers, 'DETERMINISTIC_REPEATED_WRITE', 'final-readded', () => assert.equal(deterministic.semanticPayloadsEqual, true, `repeated write changed semantic ZIP payloads: ${JSON.stringify(deterministic.semanticChanged)}`))
		artifacts['final-readded'].repeatedWrite = { sha256: sha256(repeated), ...deterministic }

		const negativeMutationGates = await runNegativeMutationGates({ mcp, getDeck, deckIds, blockers })

		const exported = dataOf('current-spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'current', detail: 'full' })).spec
		recordGap(blockers, 'EXPORT_GRAPHIC_PLACEHOLDER_READBACK', 'export', () => assertExportReadback(exported))
		const exportedPath = path.join(resolvedOutput, 'layout-graphic-placeholder-visibility-exported-spec.json')
		await writeImmutable(exportedPath, `${JSON.stringify(exported, null, 2)}\n`)
		artifacts.currentSpec = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }
		const portable = portableSpec(exported)
		const portablePath = path.join(resolvedOutput, 'layout-graphic-placeholder-visibility-portable-spec.json')
		await writeImmutable(portablePath, `${JSON.stringify(portable, null, 2)}\n`)
		artifacts.portableSpec = { file: relative(portablePath), sha256: sha256(await fs.readFile(portablePath)) }
		let replayState = null
		await recordGapAsync(blockers, 'EXPORT_RECOMPILE', 'recompile', async () => {
			const replay = dataOf('exported-spec recompile', await mcp.call('betterpptx.deck.generate_from_spec', {
				spec: portable, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
			}))
			deckIds.push(replay.deckId)
			const replayEntry = getDeck(replay.deckId)
			replayEntry.deckId = replay.deckId
			replayState = await writeState(resolvedOutput, replayEntry, 'recompiled', { requireBindings: true }, blockers, artifacts, lifecycle)
		})

		artifacts.finalPackageAudit = await runPackageAudit(finalState.file)
		let officeResult = { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_OFFICE=1.' }
		if (office) {
			const roundtripPath = path.join(resolvedOutput, 'layout-graphic-placeholder-visibility-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'layout-graphic-placeholder-visibility-office-com.json')
			officeResult = await runOfficeProof(finalState.file, roundtripPath, reportPath, blockers)
			if (officeResult.status === 'PASS') {
				const roundtripBuffer = await fs.readFile(roundtripPath)
				const officePackageInspection = await inspectPackage(roundtripBuffer, {
					state: 'powerpoint-roundtrip', requireBindings: true, allowPowerPointStyleCanonicalization: true,
				}, blockers)
				officeResult.packageInspection = officePackageInspection
				artifacts.officeRoundtrip = { file: relative(roundtripPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer), packageInspection: officePackageInspection }
				artifacts.officeReport = { file: relative(reportPath), sha256: sha256(await fs.readFile(reportPath)) }
				artifacts.officePackageAudit = await runPackageAudit(roundtripPath)
			}
		}

		const uniqueBlockers = [...new Map(blockers.map(item => [`${item.code}|${item.stage}|${item.message}`, item])).values()]
		return {
			schemaVersion: 'betterpptx.layout-graphic-placeholder-visibility-unit-proof.v1',
			unitId: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID,
			status: uniqueBlockers.length
				? 'LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_PRODUCTION_BLOCKED'
				: officeResult.status === 'PASS'
					? 'LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_PACKAGE_AND_OFFICE_VERIFIED'
					: 'LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(),
			rows: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROWS.map(([id, label]) => ({ id, label })),
			contract: {
				authoredMasterScope: 'one physical master with multiple layouts; imported multi-master preservation is a separate capability',
				chartCarrier: 'p:graphicFrame/p:nvGraphicFramePr/p:nvPr/p:ph plus c:chart relationship',
				tableCarrier: 'p:graphicFrame/p:nvGraphicFramePr/p:nvPr/p:ph plus inline a:tbl and no table-part relationship',
				showMasterShapesCarrier: 'p:sld@showMasterSp',
				packageComparison: {
					coreProperties: 'canonicalize only created/modified/lastPrinted timestamps',
					embeddedChartWorkbooks: 'exclude volatile bytes while retaining target/content-type/formula/cache/presence audits',
					allOtherPptxMembers: 'byte-identical, including slides, layouts, masters, chart XML, table XML, relationships, and content types',
				},
				officeChartCanonicalization: 'generated/source checkpoints require chart+workbook+style+color; PowerPoint SaveCopyAs may return chart+workbook only when style/color relationships, parts, and content-type overrides are all removed together and COM semantics are unchanged',
			},
			checks: {
				xmlParseCrcAndOpcClosure: true,
				relationshipAndContentTypeClosure: true,
				emptyLayoutAndSlidePlaceholdersRemainShapes: true,
				chartWorkbookStyleColorClosure: lifecycle.some(item => item.chartParts > 0),
				inlineTableHasNoTablePartEdge: true,
				resetReaddUpdateDuplicateReorderDelete: true,
				orphanCleanupAfterDelete: lifecycle.some(item => item.state === 'objects-deleted' && item.chartParts === 0 && item.workbookParts === 0),
				exportRecompileAttempted: true,
				deterministicRepeatedWritePayloads: deterministic.semanticPayloadsEqual,
				rawByteStableRepeatedWrites: deterministic.memberPayloadsEqual,
				failClosedNoMutationCases: negativeMutationGates.filter(item => item.passed).length,
				failClosedNoMutationRequired: negativeMutationGates.length,
				powerPointOpen2007SaveCopyAsReopen: officeResult.status === 'PASS',
				postOfficePackageInspection: officeResult.status === 'PASS',
			},
			blockers: uniqueBlockers,
			negativeMutationGates,
			lifecycle,
			office: officeResult,
			artifacts,
			proofPath: relative(path.join(resolvedOutput, 'layout-graphic-placeholder-visibility-unit-proof.json')),
			...(replayState ? { replayPackageSha256: replayState.inspection.packageSha256 } : {}),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

function cliValue(flag) {
	const index = process.argv.indexOf(flag)
	return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
	const configured = cliValue('--output-dir') || process.env.BETTERPPTX_LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_OUTPUT
	const outputDir = configured ? path.resolve(configured) : await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-layout-graphic-placeholder-visibility-${timestamp()}-`))
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_OFFICE === '1'
	const allowBlockers = process.argv.includes('--allow-blockers') || process.env.BETTERPPTX_LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ALLOW_BLOCKERS === '1'
	await fs.mkdir(outputDir, { recursive: true })
	let result
	try {
		result = await runLayoutGraphicPlaceholderVisibilityProof({ outputDir, office })
	} catch (error) {
		result = {
			schemaVersion: 'betterpptx.layout-graphic-placeholder-visibility-unit-proof.v1',
			unitId: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID,
			status: 'LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_PRODUCTION_BLOCKED',
			generatedAt: new Date().toISOString(),
			rows: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROWS.map(([id, label]) => ({ id, label })),
			blockers: [{ code: error?.code || 'VERIFIER_EXECUTION_FAILURE', stage: 'verifier', message: error?.message || String(error), stack: error?.stack || null }],
			proofPath: relative(path.join(outputDir, 'layout-graphic-placeholder-visibility-unit-proof.json')),
		}
	}
	const proofPath = path.join(outputDir, 'layout-graphic-placeholder-visibility-unit-proof.json')
	await writeImmutable(proofPath, `${JSON.stringify(result, null, 2)}\n`)
	console.log(JSON.stringify({ ...result, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2))
	if (result.status === 'LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_PRODUCTION_BLOCKED' && !allowBlockers) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) await main()
