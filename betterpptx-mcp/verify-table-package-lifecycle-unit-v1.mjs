#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(moduleDir, '..')
const UNIT_ID = 'impl-c-4e199c49def769be'
const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table'
const TABLE_STYLES_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles'
const HYPERLINK_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'
const TABLE_STYLES_CT = 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const EXACT_ROW_IDS = Object.freeze([
	'cap_0010a7eb966a574baaf8', 'cap_0bffe8922225e9f4f3d8', 'cap_111220387a883a13753e', 'cap_17f3a11cf9ebd6988d04',
	'cap_1cb5da39d688888484ba', 'cap_20cefb5d08c033b612c9', 'cap_2354d3d6d186bec09123', 'cap_237353e8971be80ae480',
	'cap_2ca4bbe301ef24f4f901', 'cap_39871cde076f7a632f8e', 'cap_3d149c9bd7e7c05ff618', 'cap_45d3ef15d0c8f3bd351a',
	'cap_51166b5c51aa04aeb8f1', 'cap_545e011ee0c1955df5c1', 'cap_5608c1160ed73eaf80b9', 'cap_5bcde4dab1a7144ee4e2',
	'cap_627e01978779d65cabfd', 'cap_68ace672e8b2207e6478', 'cap_75c015304dddd9716682', 'cap_78d7054309b8cae8df6f',
	'cap_806540abb2faf5032fa9', 'cap_9308b96c6aff9f332470', 'cap_9362acb62bf4ff1a9749', 'cap_9da64058f1e76a681171',
	'cap_ab127f714169b6207621', 'cap_ace72de86e34a5eec265', 'cap_ad0ee90aed2b640300fd', 'cap_ad8baa39fdaa0240291d',
	'cap_b675db7e27154591598f', 'cap_b743faa2600dec989a25', 'cap_ba180b917e3aaae9069b', 'cap_c5843d6ad97de6524ddc',
	'cap_c8e9b67485f20b96edd1', 'cap_df25f7d004ec4229f34b', 'cap_e789cb693646d8756df7', 'cap_f758c15c037787b916bd',
])
const INITIAL = Object.freeze([
	{
		objectName: 'table-mixed-merges-v1', stylePresetId: 'table-style-017',
		flags: { headerRow: true, totalRow: false, firstColumn: true, lastColumn: false, bandedRows: true, bandedColumns: false },
		rows: 4, columns: 4, hMerge: true, vMerge: true, richText: 'Board source', hyperlink: 'https://example.com/table-proof',
	},
	{
		objectName: 'table-design-flags-v1', stylePresetId: 'table-style-050',
		flags: { headerRow: true, totalRow: true, firstColumn: false, lastColumn: true, bandedRows: false, bandedColumns: true },
		rows: 4, columns: 4, hMerge: false, vMerge: false, richText: null, hyperlink: null,
	},
])
const EDITED = Object.freeze([
	{
		objectName: 'table-mixed-merges-v1', stylePresetId: 'table-style-024',
		flags: { headerRow: false, totalRow: true, firstColumn: false, lastColumn: true, bandedRows: false, bandedColumns: true },
		rows: 4, columns: 4, hMerge: true, vMerge: true, richText: 'Updated source', hyperlink: 'https://example.com/table-proof-v2',
	},
	{
		objectName: 'table-design-flags-v1', stylePresetId: null,
		flags: { headerRow: null, totalRow: null, firstColumn: null, lastColumn: null, bandedRows: null, bandedColumns: null },
		rows: 4, columns: 4, hMerge: false, vMerge: false, richText: null, hyperlink: null,
	},
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const relative = file => path.relative(workspaceRoot, file).replaceAll(path.sep, '/')

function dataOf(label, result) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function parseXmlStrict(xml, label) {
	const errors = []
	const document = new DOMParser({ errorHandler: {
		warning: message => errors.push(`warning: ${message}`),
		error: message => errors.push(`error: ${message}`),
		fatalError: message => errors.push(`fatal: ${message}`),
	} }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label}: XML parser errors`)
	assert.notEqual(document.documentElement?.localName, 'parsererror', `${label}: parsererror root`)
	return document
}

const elements = (node, localName) => Array.from(node?.getElementsByTagName('*') || []).filter(item => !localName || item.localName === localName)
const children = (node, localName) => Array.from(node?.childNodes || []).filter(item => item.nodeType === 1 && (!localName || item.localName === localName))
const relationshipPartFor = part => path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`)
const sourcePartForRelationships = rel => rel === '_rels/.rels' ? '' : path.posix.join(path.posix.dirname(path.posix.dirname(rel)), path.posix.basename(rel, '.rels'))
const resolveTarget = (source, target) => {
	const normalized = String(target || '').replaceAll('\\', '/')
	return normalized.startsWith('/') ? path.posix.normalize(normalized.slice(1)) : path.posix.normalize(path.posix.join(source ? path.posix.dirname(source) : '', normalized))
}
const numericPartSort = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0)
const relRows = document => elements(document, 'Relationship').map(node => ({
	Id: node.getAttribute('Id'), Type: node.getAttribute('Type'), Target: node.getAttribute('Target'), TargetMode: node.getAttribute('TargetMode'),
}))

async function packageDocuments(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort()
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${label}/${name}`))
	}
	return { zip, names, nameSet: new Set(names), documents }
}

function contentTypes(documents) {
	const document = documents.get('[Content_Types].xml')
	assert.ok(document, '[Content_Types].xml missing')
	const defaults = elements(document, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')])
	const overrides = elements(document, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')])
	assert.equal(new Set(defaults.map(([extension]) => extension)).size, defaults.length, 'duplicate content-type default')
	assert.equal(new Set(overrides.map(([part]) => part)).size, overrides.length, 'duplicate content-type override')
	return { defaults: new Map(defaults), overrides: new Map(overrides) }
}

function auditOpcClosure(pkg, label) {
	const { defaults, overrides } = contentTypes(pkg.documents)
	for (const part of overrides.keys()) assert.ok(pkg.nameSet.has(part), `${label}: orphan content-type override ${part}`)
	for (const name of pkg.names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: ${name} has no content type`)
	}
	for (const relName of pkg.names.filter(name => name.endsWith('.rels'))) {
		const source = sourcePartForRelationships(relName)
		const rows = relRows(pkg.documents.get(relName))
		assert.equal(new Set(rows.map(item => item.Id)).size, rows.length, `${label}/${relName}: duplicate relationship Id`)
		for (const row of rows.filter(item => String(item.TargetMode).toLowerCase() !== 'external')) {
			const target = resolveTarget(source, row.Target)
			assert.ok(pkg.nameSet.has(target), `${label}/${relName}: dangling ${row.Id} -> ${target}`)
		}
	}
	return { defaults, overrides }
}

async function tableStyleMap() {
	const catalog = JSON.parse(await fs.readFile(path.join(moduleDir, 'table-style-catalog.json'), 'utf8'))
	assert.equal(catalog.styleCount, catalog.styles.length)
	return new Map(catalog.styles.map(style => [style.publicId, style.nativeId]))
}

function markerPresent(document, marker) {
	return elements(document, 'cNvPr').some(node => {
		const name = node.getAttribute('name')
		return name === marker || name.includes(`.${marker}.table`)
	})
}

function tableNodes(document) {
	return elements(document, 'graphicData')
		.filter(node => node.getAttribute('uri') === TABLE_URI)
		.flatMap(node => children(node, 'tbl'))
}

function cellText(table) {
	return elements(table, 't').map(node => node.textContent || '').join('')
}

function assertFlag(tblPr, xmlName, expected, label, allowNormalizedReset = false) {
	if (expected === null || expected === undefined) {
		if (allowNormalizedReset && tblPr.getAttribute(xmlName) === '0') return
		assert.equal(tblPr.hasAttribute(xmlName), false, `${label}: ${xmlName} reset removes authored override`)
		return
	}
	if (allowNormalizedReset && expected === false && !tblPr.hasAttribute(xmlName)) return
	assert.equal(tblPr.getAttribute(xmlName), expected ? '1' : '0', `${label}: ${xmlName}`)
}

function inspectInlineTable(table, slideDocument, slideRelationships, wanted, nativeStyles, label) {
	const tblPr = children(table, 'tblPr')[0]
	const grid = children(table, 'tblGrid')[0]
	const rows = children(table, 'tr')
	assert.ok(tblPr, `${label}: a:tblPr missing`)
	assert.ok(grid, `${label}: a:tblGrid missing`)
	assert.equal(rows.length, wanted.rows, `${label}: row count`)
	const columns = children(grid, 'gridCol')
	assert.equal(columns.length, wanted.columns, `${label}: grid column count`)
	assert.ok(columns.every(node => Number(node.getAttribute('w')) > 0), `${label}: positive grid widths`)
	assert.ok(rows.every(node => Number(node.getAttribute('h')) >= 0), `${label}: non-negative row heights`)
	assert.ok(rows.every(node => children(node, 'tc').length === wanted.columns), `${label}: every expanded row matches the declared grid`)

	const flagNames = { headerRow: 'firstRow', totalRow: 'lastRow', firstColumn: 'firstCol', lastColumn: 'lastCol', bandedRows: 'bandRow', bandedColumns: 'bandCol' }
	for (const [publicName, xmlName] of Object.entries(flagNames)) assertFlag(tblPr, xmlName, wanted.flags[publicName], label, wanted.allowNormalizedReset)
	const styleNode = children(tblPr, 'tableStyleId')[0]
	if (wanted.ignoreStyle) {
		// PowerPoint may assign its default style while normalizing a deliberately
		// style-free authored table. Either form is a valid repaired-free package.
	} else if (wanted.stylePresetId) {
		assert.ok(styleNode, `${label}: tableStyleId missing`)
		assert.equal(styleNode.textContent, nativeStyles.get(wanted.stylePresetId), `${label}: native table style selection`)
	} else {
		assert.equal(styleNode, undefined, `${label}: stale table style survives selector reset`)
	}

	const cells = rows.flatMap(row => children(row, 'tc'))
	const hMerges = cells.filter(node => node.getAttribute('hMerge') === '1')
	const vMerges = cells.filter(node => node.getAttribute('vMerge') === '1')
	assert.equal(hMerges.length > 0, wanted.hMerge, `${label}: hMerge topology`)
	assert.equal(vMerges.length > 0, wanted.vMerge, `${label}: vMerge topology`)
	if (wanted.hMerge) assert.ok(cells.some(node => node.getAttribute('gridSpan') === '2'), `${label}: colspan anchor`)
	if (wanted.vMerge) assert.ok(cells.some(node => node.getAttribute('rowSpan') === '2'), `${label}: rowspan anchor`)
	assert.ok(cells.some(node => {
		const tcPr = children(node, 'tcPr')[0]
		return tcPr && (elements(tcPr, 'solidFill').length > 0 || ['marL', 'marR', 'marT', 'marB'].some(attr => tcPr.hasAttribute(attr)))
	}), `${label}: explicit cell formatting carrier`)

	const text = cellText(table)
	if (wanted.richText) {
		assert.ok(text.includes(wanted.richText), `${label}: rich text content`)
		assert.ok(elements(table, 'r').length >= 2, `${label}: rich run carriers`)
	}
	const clicks = elements(table, 'hlinkClick')
	if (!wanted.hyperlink) {
		assert.equal(clicks.length, 0, `${label}: no table hyperlink expected`)
	} else {
		assert.equal(clicks.length, 1, `${label}: one run-level hyperlink`)
		const relationshipId = clicks[0].getAttributeNS(REL_NS, 'id') || clicks[0].getAttribute('r:id')
		const relationship = slideRelationships.find(row => row.Id === relationshipId)
		assert.ok(relationship, `${label}: hyperlink relationship exists`)
		assert.equal(relationship.Type, HYPERLINK_REL, `${label}: hyperlink relationship type`)
		assert.equal(relationship.TargetMode, 'External', `${label}: external hyperlink target mode`)
		assert.equal(relationship.Target, wanted.hyperlink, `${label}: hyperlink target`)
	}

	const cNvPr = elements(slideDocument, 'cNvPr')
	const ids = cNvPr.map(node => node.getAttribute('id'))
	assert.ok(ids.every(id => /^\d+$/.test(id)), `${label}: every cNvPr id is numeric`)
	assert.equal(new Set(ids).size, ids.length, `${label}: cNvPr ids are unique within the slide`)
	return { rows: rows.length, columns: columns.length, hMergeCells: hMerges.length, vMergeCells: vMerges.length, richRunCount: elements(table, 'r').length, hyperlinkCount: clicks.length }
}

async function inspectPptx(buffer, label, expected, { officeNormalized = false } = {}) {
	const pkg = await packageDocuments(buffer, label)
	const { overrides } = auditOpcClosure(pkg, label)
	const nativeStyles = await tableStyleMap()
	assert.equal(overrides.get('ppt/tableStyles.xml'), TABLE_STYLES_CT, `${label}: tableStyles content type`)
	const tableStyles = pkg.documents.get('ppt/tableStyles.xml')
	assert.ok(tableStyles, `${label}: tableStyles.xml missing`)
	assert.equal(tableStyles.documentElement?.localName, 'tblStyleLst', `${label}: tableStyles root`)
	const presentationRels = relRows(pkg.documents.get('ppt/_rels/presentation.xml.rels'))
	const styleRelationships = presentationRels.filter(row => row.Type === TABLE_STYLES_REL)
	assert.equal(styleRelationships.length, 1, `${label}: exactly one presentation tableStyles relationship`)
	assert.equal(resolveTarget('ppt/presentation.xml', styleRelationships[0].Target), 'ppt/tableStyles.xml', `${label}: tableStyles relationship target`)
	const tableNamedParts = pkg.names.filter(name => /(?:^|\/)tables?[^/]*\.(?:xml|rels)$/i.test(name) && name !== 'ppt/tableStyles.xml')
	assert.deepEqual(tableNamedParts, [], `${label}: native tables must remain inline; no orphan table parts`)

	const slideParts = pkg.names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericPartSort)
	assert.equal(slideParts.length, expected.length, `${label}: slide count`)
	const rows = []
	for (let index = 0; index < expected.length; index++) {
		const wanted = expected[index]
		const slidePart = slideParts[index]
		const slideDocument = pkg.documents.get(slidePart)
		assert.ok(markerPresent(slideDocument, wanted.objectName), `${label}: ${slidePart} retains ${wanted.objectName}`)
		const tables = tableNodes(slideDocument)
		assert.equal(tables.length, 1, `${label}: ${slidePart} has one inline table`)
		const slideRelationships = relRows(pkg.documents.get(relationshipPartFor(slidePart)))
		const actualWanted = officeNormalized
			? { ...wanted, allowNormalizedReset: true, ...(wanted.stylePresetId === null ? { ignoreStyle: true } : {}) }
			: wanted
		rows.push({ slide: index + 1, objectName: wanted.objectName, ...inspectInlineTable(tables[0], slideDocument, slideRelationships, actualWanted, nativeStyles, `${label}/${slidePart}`) })
	}
	return { label, partCount: pkg.names.length, tables: rows, tableStylesRelationshipCount: styleRelationships.length }
}

async function inspectDeletedPptx(buffer, label, slideCount) {
	const pkg = await packageDocuments(buffer, label)
	const { overrides } = auditOpcClosure(pkg, label)
	assert.equal(overrides.get('ppt/tableStyles.xml'), TABLE_STYLES_CT, `${label}: global tableStyles content type remains valid`)
	const slideParts = pkg.names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericPartSort)
	assert.equal(slideParts.length, slideCount, `${label}: slides retained after object deletion`)
	for (const slidePart of slideParts) {
		assert.equal(tableNodes(pkg.documents.get(slidePart)).length, 0, `${label}: ${slidePart} table removed`)
		const relationships = relRows(pkg.documents.get(relationshipPartFor(slidePart)))
		assert.equal(relationships.filter(row => row.Type === HYPERLINK_REL).length, 0, `${label}: ${slidePart} table hyperlink relationship removed`)
	}
	return { label, partCount: pkg.names.length, slideCount, tableCount: 0, tableHyperlinkRelationshipCount: 0 }
}

function classifyTableRow(label) {
	if (label.startsWith('Table Styles:')) return 'designRecipes'
	if (['tableStyles.xml', 'complex table preservation', 'grid topology preservation', 'native table style IDs'].includes(label)) return 'packageAndPreservation'
	if (/merge|span/i.test(label)) return 'mergeTopology'
	if (['row heights', 'column widths', 'margins', 'borders', 'transparent borders', 'fills'].includes(label)) return 'cellAndGeometry'
	if (['text cells', 'rich text cells', 'hyperlinks'].includes(label)) return 'cellContent'
	if (['auto paging', 'table-to-slides', 'repeated headers'].includes(label)) return 'pagination'
	return 'authoringSurface'
}

async function inventoryRows() {
	const matrix = JSON.parse(await fs.readFile(path.join(moduleDir, 'preset-decomposition-matrix.json'), 'utf8'))
	const byId = new Map(matrix.catalogRows.map(row => [row.id, row]))
	const rows = EXACT_ROW_IDS.map(id => {
		const row = byId.get(id)
		assert.ok(row, `inventory row missing: ${id}`)
		assert.equal(row.family, 'tables', `${id}: family`)
		return { id, label: row.label, classification: classifyTableRow(row.label), componentOwnership: row.componentOwnership, declaredOverrideFields: row.declaredOverrideFields }
	})
	assert.equal(rows.length, 36)
	assert.equal(new Set(rows.map(row => row.id)).size, 36)
	const counts = Object.fromEntries([...new Set(rows.map(row => row.classification))].sort().map(classification => [classification, rows.filter(row => row.classification === classification).length]))
	return { unit: { id: UNIT_ID, family: 'tables', fanOutRows: rows.length, componentOwnership: ['conditionalStyleFlags', 'tableStyle'] }, counts, rows }
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'prove native table package lifecycle', remember: 'styles, rich cells, merges, and links remain editable and repair-free' },
		visualDesign: { world: 'table package proof', framing: 'one native table per slide', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light', density: 'focused' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
	}
}

function initialRows() {
	return [
		['Area', 'Evidence', 'Owner', 'State'],
		[{ text: [{ text: 'Board ', options: { bold: true } }, { text: 'source', options: { color: '2563EB', underline: true, hyperlink: { url: 'https://example.com/table-proof', tooltip: 'Open table source' } } }], options: { colspan: 2, fill: { color: 'DBEAFE' }, margin: [0.08, 0.12, 0.08, 0.12], border: { color: '60A5FA', pt: 1 } } }, 'Mina', 'Ready'],
		[{ text: 'Revenue', options: { rowspan: 2, fill: { color: 'DCFCE7' }, valign: 'middle', bold: true } }, '$4.2M', 'Finance', 'On plan'],
		['118%', 'Growth', 'Watch'],
	]
}

function editedRows() {
	return [
		['Area', 'Evidence', 'Owner', 'State'],
		[{ text: [{ text: 'Updated ', options: { bold: true, color: '7C3AED' } }, { text: 'source', options: { underline: true, hyperlink: { url: 'https://example.com/table-proof-v2', tooltip: 'Open updated table source' } } }], options: { colspan: 2, fill: { color: 'EDE9FE' }, margin: [0.06, 0.14, 0.06, 0.14], border: { color: '8B5CF6', pt: 1.25 } } }, 'Asha', 'Approved'],
		[{ text: 'Pipeline', options: { rowspan: 2, fill: { color: 'FEF3C7' }, valign: 'middle', bold: true } }, '$8.4M', 'Sales', 'Ahead'],
		['126%', 'Growth', 'On plan'],
	]
}

function authoredSpec() {
	return {
		...metadata('Native table package lifecycle'),
		slides: [
			{ id: 'mixed-merges', title: 'Mixed merge topology', message: 'Rich text and links survive native merges.', layoutIntent: 'title-only', content: [{ kind: 'table-panel', name: INITIAL[0].objectName, objectName: INITIAL[0].objectName, rows: initialRows(), tableOptions: { tableStylePresetId: INITIAL[0].stylePresetId, ...INITIAL[0].flags, colW: [2.2, 2.1, 1.6, 1.6], rowH: [0.46, 0.62, 0.5, 0.5], fontSize: 12, margin: 0.08 } }] },
			{ id: 'design-flags', title: 'Table Design flags', message: 'Native conditional regions remain independently authored.', layoutIntent: 'title-only', content: [{ kind: 'table-panel', name: INITIAL[1].objectName, objectName: INITIAL[1].objectName, rows: [['Metric', 'Q1', 'Q2', 'Total'], ['ARR', '3.4', '4.2', '7.6'], ['NRR', '116%', '118%', '117%'], ['Total', '4.6', '5.5', '10.1']], tableOptions: { tableStylePresetId: INITIAL[1].stylePresetId, ...INITIAL[1].flags, colW: [2.1, 1.7, 1.7, 1.8], rowH: [0.46, 0.48, 0.48, 0.52], margin: 0.09 } }] },
		],
	}
}

function reeditSpec() {
	return {
		...metadata('Native table package lifecycle re-edit'),
		slides: [
			{ id: 'mixed-merges', slideIndex: 0, layoutIntent: 'title-only', content: [{ kind: 'table-panel', name: EDITED[0].objectName, objectName: EDITED[0].objectName, tableOptions: { tableStylePresetId: EDITED[0].stylePresetId }, patch: { rows: editedRows(), optionsPatch: { tableStylePresetId: EDITED[0].stylePresetId, ...EDITED[0].flags, colW: [2.35, 2.05, 1.55, 1.55], rowH: [0.44, 0.66, 0.52, 0.52] } } }] },
			{ id: 'design-flags', slideIndex: 1, layoutIntent: 'title-only', content: [{ kind: 'table-panel', name: EDITED[1].objectName, objectName: EDITED[1].objectName, tableOptions: { tableStylePresetId: INITIAL[1].stylePresetId }, patch: { optionsPatch: { tableStylePresetId: null, tableStyleId: null, ...EDITED[1].flags } } }] },
		],
	}
}

function deleteSpec() {
	return {
		...metadata('Native table package lifecycle delete'),
		slides: EDITED.map((table, slideIndex) => ({ id: slideIndex ? 'design-flags' : 'mixed-merges', slideIndex, layoutIntent: 'title-only', content: [{ kind: 'table-panel', name: table.objectName, objectName: table.objectName, delete: true }] })),
	}
}

function portableSpec(exported) {
	const result = structuredClone(exported)
	delete result.nativePackagePreservation
	for (const slide of result.slides || []) {
		delete slide.nativeTimingPreservation
		slide.content = (slide.content || []).filter(item => item.kind !== 'opaqueNative').map(item => {
			const { editHandle, nativePreservation, preservationHandle, ...portable } = item
			return portable
		})
	}
	return result
}

function tableBlocks(spec) {
	return (spec.slides || []).map(slide => (slide.content || []).find(item => item.kind === 'table-panel'))
}

function assertExportedSpec(spec) {
	const tables = tableBlocks(spec)
	assert.equal(tables.length, 2)
	assert.ok(tables.every(Boolean), 'export: one table block per slide')
	assert.equal(tables[0].tableStylePresetId, EDITED[0].stylePresetId, 'export: semantic style selector')
	assert.equal(tables[0].tableOptions.headerRow, false, 'export: explicit false conditional flag')
	assert.equal(tables[0].tableOptions.totalRow, true, 'export: explicit true conditional flag')
	assert.equal(Object.prototype.hasOwnProperty.call(tables[1], 'tableStylePresetId'), false, 'export: reset style selector omitted')
	assert.equal(Object.prototype.hasOwnProperty.call(tables[1], 'tableStyleId'), false, 'export: stale native selector omitted')
	for (const field of Object.keys(EDITED[1].flags)) assert.equal(Object.prototype.hasOwnProperty.call(tables[1].tableOptions || {}, field), false, `export: reset ${field} omitted`)
	const rich = tables[0].rows[1][0]
	assert.ok(Array.isArray(rich.text), 'export: rich cell text remains a run array')
	assert.deepEqual(rich.text.map(run => run.text), ['Updated ', 'source'], 'export: rich run boundaries')
	assert.equal(rich.text[1].options.hyperlink.url, EDITED[0].hyperlink, 'export: run-level hyperlink')
	assert.equal(rich.options.colspan, 2, 'export: colspan anchor')
	assert.equal(tables[0].rows[2][0].options.rowspan, 2, 'export: rowspan anchor')
	assert.equal(tables[0].rows.every(row => row.every(cell => !cell?._hmerge && !cell?._vmerge)), true, 'export: generated merge continuations do not leak')
	return tables
}

function tableStateSignature(entry) {
	return JSON.stringify(entry.pptx.slides.map(slide => slide._slideObjects.filter(object => object._type === 'table').map(object => ({
		objectName: object.options?.objectName,
		options: object.options,
		rows: object.arrTabRows,
	}))))
}

async function writeImmutable(file, value, encoding = undefined) {
	await fs.writeFile(file, value, { ...(encoding ? { encoding } : {}), flag: 'wx' })
}

async function checkpoint(outputDir, entry, name, expected, artifacts, lifecycle) {
	const before = tableStateSignature(entry)
	const first = Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
	const afterFirst = tableStateSignature(entry)
	const second = Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
	const afterSecond = tableStateSignature(entry)
	assert.equal(afterFirst, before, `${name}: serialization must not mutate table state`)
	assert.equal(afterSecond, before, `${name}: repeated serialization must not mutate table state`)
	assert.equal(second.equals(first), true, `${name}: repeated serialization must be byte-stable`)
	const file = path.join(outputDir, `table-package-${name}.pptx`)
	await writeImmutable(file, second)
	const inspection = await inspectPptx(second, name, expected)
	artifacts[name] = { file: relative(file), bytes: second.length, sha256: sha256(second) }
	lifecycle.push({ ...inspection, repeatedWrite: { stateStable: true, bytesStable: true, sha256: sha256(second) } })
	return { file, buffer: second, inspection }
}

async function runOfficeProof(inputPath, outputPath, reportPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const sourceRenderDir = outputPath.replace(/\.pptx$/i, '-generated-renders')
	const roundtripRenderDir = outputPath.replace(/\.pptx$/i, '-reopened-renders')
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-table-package-lifecycle-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.source.SlideCount, 2)
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint table snapshot changed after SaveCopyAs/reopen')
	assert.deepEqual(report.source.Slides.map(slide => slide.TableCount), [1, 1], 'PowerPoint sees one table per slide')
	assert.deepEqual(report.source.Slides.map(slide => [slide.Tables[0]?.Rows, slide.Tables[0]?.Columns]), [[4, 4], [4, 4]], 'PowerPoint sees each expanded 4x4 grid')
	const renderEvidence = []
	for (let slide = 1; slide <= 2; slide++) {
		const source = path.join(sourceRenderDir, `slide-${slide}.png`)
		const reopened = path.join(roundtripRenderDir, `slide-${slide}.png`)
		const [a, b] = await Promise.all([fs.readFile(source), fs.readFile(reopened)])
		assert.equal(sha256(b), sha256(a), `slide-${slide}: PowerPoint render changed after SaveCopyAs/reopen`)
		renderEvidence.push({ slide, source: { file: relative(source), bytes: a.length, sha256: sha256(a) }, reopened: { file: relative(reopened), bytes: b.length, sha256: sha256(b) }, exactPngBytesEqual: true })
	}
	return { ...report, renderEvidence }
}

export async function runTablePackageLifecycleProof({ outputDir, office = false } = {}) {
	const inventory = await inventoryRows()
	const resolvedOutput = outputDir ? path.resolve(outputDir) : await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-table-package-lifecycle-'))
	if (outputDir) await fs.mkdir(resolvedOutput, { recursive: false })
	assert.deepEqual(await fs.readdir(resolvedOutput), [], `Output directory must be new and empty: ${resolvedOutput}`)
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `table-package-${Date.now()}`, clientInfo: { name: 'table-package-verifier', version: '1' }, blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	let officeCheckpoint = null
	try {
		const created = dataOf('create table deck', await mcp.call('betterpptx.deck.generate_from_spec', { spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		await checkpoint(resolvedOutput, entry, 'initial', INITIAL, artifacts, lifecycle)

		dataOf('public JSON-spec table re-edit/reset', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId, deckVersion: entry.deckVersion, spec: reeditSpec(), phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		const reedited = await checkpoint(resolvedOutput, entry, 're-edited', EDITED, artifacts, lifecycle)

		const exported = dataOf('export table spec', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSpec(exported)
		const exportPath = path.join(resolvedOutput, 'table-package-exported-spec.json')
		await writeImmutable(exportPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
		artifacts.exportedSpec = { file: relative(exportPath), sha256: sha256(await fs.readFile(exportPath)) }

		const replay = dataOf('portable table recompile', await mcp.call('betterpptx.deck.generate_from_spec', { spec: portableSpec(exported), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(replay.deckId)
		await checkpoint(resolvedOutput, getDeck(replay.deckId), 'recompiled', EDITED, artifacts, lifecycle)
		const replayExport = dataOf('recompiled table export', await mcp.call('betterpptx.deck.export_spec', { deckId: replay.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSpec(replayExport)

		dataOf('delete native tables', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId, deckVersion: entry.deckVersion, spec: deleteSpec(), phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		const beforeDeleteWrite = tableStateSignature(entry)
		const deletedBuffer = Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
		assert.equal(tableStateSignature(entry), beforeDeleteWrite, 'delete checkpoint serialization is state-stable')
		const deletedFile = path.join(resolvedOutput, 'table-package-deleted.pptx')
		await writeImmutable(deletedFile, deletedBuffer)
		artifacts.deleted = { file: relative(deletedFile), bytes: deletedBuffer.length, sha256: sha256(deletedBuffer) }
		lifecycle.push(await inspectDeletedPptx(deletedBuffer, 'deleted', 2))

		if (office) {
			const outputPath = path.join(resolvedOutput, 'table-package-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'table-package-office-com.json')
			const report = await runOfficeProof(reedited.file, outputPath, reportPath)
			const roundtripBuffer = await fs.readFile(outputPath)
			officeCheckpoint = {
				reportFile: relative(reportPath), roundtripFile: relative(outputPath), roundtripSha256: sha256(roundtripBuffer),
				package: await inspectPptx(roundtripBuffer, 'powerpoint-roundtrip', EDITED, { officeNormalized: true }),
				source: report.source, roundtrip: report.roundtrip, renderEvidence: report.renderEvidence,
			}
			artifacts.officeRoundtrip = { file: relative(outputPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
		}

		return {
			schemaVersion: 'betterpptx.table-package-lifecycle-unit-proof.v1', unitId: UNIT_ID,
			status: office ? 'TABLE_PACKAGE_LIFECYCLE_AND_OFFICE_VERIFIED' : 'TABLE_PACKAGE_LIFECYCLE_VERIFIED_OFFICE_GATED', generatedAt: new Date().toISOString(),
			inventory,
			checks: {
				exact36RowsInventoried: true, inlineTableXmlAndGlobalTableStylesClosure: true, strictXmlOpcCrcClosure: true,
				mixedMergeGridClosure: true, repeatedWriteStateAndByteStability: true, richRunAndHyperlinkClosure: true,
				selectorReplacementAndComponentReset: true, exportAndPortableRecompile: true, deleteAndRelationshipCleanup: true,
				powerPointOpen2007SaveCopyAsReopen: Boolean(officeCheckpoint), postOfficePackageClosure: Boolean(officeCheckpoint),
				generatedAndReopenedRenderEquality: Boolean(officeCheckpoint?.renderEvidence?.every(item => item.exactPngBytesEqual)),
			},
			lifecycle, office: officeCheckpoint || { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_TABLE_PACKAGE_OFFICE=1.' }, artifacts,
			manualVisualInspection: officeCheckpoint ? { status: 'required', evidence: officeCheckpoint.renderEvidence, instruction: 'Inspect both generated and reopened table slide PNGs at original size before promotion.' } : { status: 'dependency-gated', reason: 'PowerPoint renders require --office.' },
			blockers: [], proofPath: relative(path.join(resolvedOutput, 'table-package-lifecycle-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const explicitOutput = process.env.BETTERPPTX_TABLE_PACKAGE_OUTPUT
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_TABLE_PACKAGE_OFFICE === '1'
	const outputDir = explicitOutput ? path.resolve(explicitOutput) : path.join(os.tmpdir(), `betterpptx-table-package-lifecycle-${crypto.randomUUID()}`)
	try {
		const report = await runTablePackageLifecycleProof({ outputDir, office })
		const proofPath = path.join(outputDir, 'table-package-lifecycle-unit-proof.json')
		const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
		await writeImmutable(proofPath, bytes)
		process.stdout.write(`${JSON.stringify({ ...report, proofPath: relative(proofPath), proofSha256: sha256(bytes) }, null, 2)}\n`)
	} catch (error) {
		await fs.mkdir(outputDir, { recursive: true })
		const proofPath = path.join(outputDir, 'table-package-lifecycle-unit-proof.json')
		const report = { schemaVersion: 'betterpptx.table-package-lifecycle-unit-proof.v1', unitId: UNIT_ID, status: 'TABLE_PACKAGE_LIFECYCLE_BLOCKED', generatedAt: new Date().toISOString(), blockers: [{ message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }], proofPath: relative(proofPath) }
		const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
		await fs.writeFile(proofPath, bytes, { flag: 'wx' }).catch(() => {})
		process.stdout.write(`${JSON.stringify({ ...report, proofSha256: sha256(bytes) }, null, 2)}\n`)
		process.exitCode = 1
	}
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await main()
