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
import {
	LAYOUT_THEME_MASTER_INHERITANCE_ROWS as CONTRACT_ROWS,
	LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID as CONTRACT_UNIT_ID,
} from './layout-theme-master-inheritance-contract.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(moduleDir, '..')
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const CONTENT_TYPES = Object.freeze({
	slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
	layout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
	master: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
	theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
})

export const LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID = CONTRACT_UNIT_ID
export const LAYOUT_THEME_MASTER_INHERITANCE_ROWS = Object.freeze(CONTRACT_ROWS.map(row => Object.freeze([row.id, row.label])))

const NAMES = Object.freeze({
	master: 'InheritanceMaster', replacementMaster: 'ReplacementMaster',
	alpha: 'InheritanceAlpha', beta: 'InheritanceBeta', gamma: 'ReplacementGamma',
})
const GEOMETRY = Object.freeze({
	[NAMES.alpha]: Object.freeze({ x: 0.8, y: 0.62, w: 11.7, h: 0.82 }),
	[NAMES.beta]: Object.freeze({ x: 1.42, y: 0.92, w: 10.4, h: 1.08 }),
	[NAMES.gamma]: Object.freeze({ x: 0.95, y: 0.74, w: 11.25, h: 0.96 }),
})
const THEME = Object.freeze({
	initial: Object.freeze({
		name: 'Inheritance Atlas Theme', head: 'Arial', body: 'Calibri', lang: 'en-US',
		colors: Object.freeze({
			dk1: '111827', lt1: 'F8FAFC', dk2: '1E293B', lt2: 'E2E8F0',
			accent1: '0EA5E9', accent2: '7C3AED', accent3: '65A30D', accent4: 'D97706',
			accent5: 'DB2777', accent6: '0891B2', hlink: '0563C1', folHlink: '954F72',
		}),
	}),
	reedited: Object.freeze({
		name: 'Inheritance Atlas Theme Re-edited', head: 'Georgia', body: 'Verdana', lang: 'fr-FR',
		colors: Object.freeze({
			dk1: '0F172A', lt1: 'FFF7ED', dk2: '292524', lt2: 'FED7AA',
			accent1: 'C026D3', accent2: '0284C7', accent3: '16A34A', accent4: 'EA580C',
			accent5: '7C3AED', accent6: 'E11D48', hlink: '1D4ED8', folHlink: '9333EA',
		}),
	}),
})
const MASTER_COLOR_MAP = Object.freeze({
	bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent2', accent2: 'accent1',
	accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink',
})
const ALPHA_COLOR_MAP = Object.freeze({ ...MASTER_COLOR_MAP, accent1: 'accent3', accent3: 'accent1' })
const BETA_COLOR_MAP = Object.freeze({ ...MASTER_COLOR_MAP, accent1: 'accent5', accent5: 'accent2' })
const SLIDE_COLOR_MAP = Object.freeze({ ...MASTER_COLOR_MAP, accent1: 'accent6', accent6: 'accent1' })
const TEXT_STYLES = Object.freeze({
	title: Object.freeze({ fontFace: 'Georgia', fontSize: 30, color: 'accent1', bold: true, align: 'center' }),
	body: Object.freeze({ fontFace: 'Verdana', fontSize: 16, color: 'tx1', bold: false, italic: false, align: 'left' }),
	other: Object.freeze({ fontFace: 'Arial', fontSize: 12, color: 'accent3', bold: false, italic: true, align: 'right' }),
})
const FIXED_NAMES = Object.freeze({
	master: Object.freeze(['master-fixed-text', 'master-fixed-rect', 'master-fixed-line']),
	replacementMaster: Object.freeze(['replacement-master-fixed-text', 'replacement-master-fixed-rect', 'replacement-master-fixed-line']),
	alpha: Object.freeze(['alpha-fixed-text', 'alpha-fixed-rect', 'alpha-fixed-line']),
	beta: Object.freeze(['beta-fixed-text', 'beta-fixed-rect', 'beta-fixed-line']),
	gamma: Object.freeze(['gamma-fixed-text', 'gamma-fixed-rect', 'gamma-fixed-line']),
})

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function zipMemberDiff(beforeBuffer, afterBuffer) {
	const [beforeZip, afterZip] = await Promise.all([
		JSZip.loadAsync(beforeBuffer, { checkCRC32: true }), JSZip.loadAsync(afterBuffer, { checkCRC32: true }),
	])
	const names = [...new Set([...Object.keys(beforeZip.files), ...Object.keys(afterZip.files)])].sort()
	const changed = []
	const metadataOnly = []
	for (const name of names) {
		const beforeEntry = beforeZip.files[name]
		const afterEntry = afterZip.files[name]
		if (beforeEntry?.dir && afterEntry?.dir) continue
		const before = beforeZip.file(name)
		const after = afterZip.file(name)
		if (!before || !after) {
			changed.push({ name, before: Boolean(before), after: Boolean(after) })
			continue
		}
		const [beforeBytes, afterBytes] = await Promise.all([before.async('nodebuffer'), after.async('nodebuffer')])
		const beforeHash = sha256(beforeBytes)
		const afterHash = sha256(afterBytes)
		if (beforeHash !== afterHash) changed.push({ name, beforeHash, afterHash, beforeBytes: beforeBytes.length, afterBytes: afterBytes.length })
		else if (before.date?.getTime() !== after.date?.getTime()) metadataOnly.push({ name, beforeDate: before.date?.toISOString(), afterDate: after.date?.toISOString() })
	}
	return { changed, metadataOnly, memberPayloadsEqual: changed.length === 0 }
}

function relative(file) {
	return path.relative(workspaceRoot, file).replaceAll(path.sep, '/')
}

function timestamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
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

function children(node) {
	return Array.from(node?.childNodes || []).filter(item => item.nodeType === 1)
}

function directChild(node, localName) {
	return children(node).find(item => item.localName === localName) || null
}

function relationshipRecords(document) {
	return elements(document, 'Relationship').map(node => ({
		Id: node.getAttribute('Id'), Type: node.getAttribute('Type'), Target: node.getAttribute('Target'), TargetMode: node.getAttribute('TargetMode'),
	}))
}

function relationshipPartFor(partName) {
	const directory = path.posix.dirname(partName)
	return path.posix.join(directory, '_rels', `${path.posix.basename(partName)}.rels`)
}

function sourcePartForRelationships(relName) {
	if (relName === '_rels/.rels') return ''
	return path.posix.join(path.posix.dirname(path.posix.dirname(relName)), path.posix.basename(relName, '.rels'))
}

function resolveTarget(sourcePart, target) {
	const base = sourcePart ? path.posix.dirname(sourcePart) : ''
	return path.posix.normalize(path.posix.join(base, String(target || '').replace(/^\/+/, '')))
}

function relsFor(documents, partName) {
	return relationshipRecords(documents.get(relationshipPartFor(partName)))
}

function targetById(sourcePart, rels, id) {
	const rel = rels.find(item => item.Id === id)
	assert.ok(rel, `${sourcePart}: relationship ${id} missing`)
	return resolveTarget(sourcePart, rel.Target)
}

function relationshipId(node) {
	return node?.getAttribute('r:id') || node?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''
}

function cSldName(document) {
	return elements(document, 'cSld')[0]?.getAttribute('name') || ''
}

function shapeByName(document, wanted) {
	const cNvPr = elements(document, 'cNvPr').find(node => {
		const actual = node.getAttribute('name') || ''
		return actual === wanted || actual.endsWith(`.${wanted}`) || actual.includes(wanted)
	})
	assert.ok(cNvPr, `shape ${wanted} missing`)
	let current = cNvPr
	while (current && !['sp', 'pic', 'graphicFrame'].includes(current.localName)) current = current.parentNode
	assert.ok(current, `shape ${wanted} carrier missing`)
	return current
}

function placeholderTuple(shape) {
	const node = elements(shape, 'ph')[0]
	assert.ok(node, 'placeholder marker missing')
	return {
		type: node.getAttribute('type') || '',
		idx: node.hasAttribute('idx') ? Number(node.getAttribute('idx')) : 0,
		size: node.getAttribute('sz') || '',
		orient: node.getAttribute('orient') || '',
	}
}

function xfrmOf(shape) {
	const xfrm = elements(shape, 'xfrm')[0]
	if (!xfrm) return null
	const off = directChild(xfrm, 'off')
	const ext = directChild(xfrm, 'ext')
	if (!off || !ext) return null
	const emu = value => Number(value) / 914400
	return { x: emu(off.getAttribute('x')), y: emu(off.getAttribute('y')), w: emu(ext.getAttribute('cx')), h: emu(ext.getAttribute('cy')) }
}

function assertNear(actual, expected, label, tolerance = 0.002) {
	assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`)
}

function assertGeometry(actual, expected, label) {
	assert.ok(actual, `${label}: geometry missing`)
	for (const key of ['x', 'y', 'w', 'h']) assertNear(actual[key], expected[key], `${label}.${key}`)
}

function themeSignature(themeDocument) {
	const latin = node => elements(node, 'latin')[0]?.getAttribute('typeface') || ''
	const major = elements(themeDocument, 'majorFont')[0]
	const minor = elements(themeDocument, 'minorFont')[0]
	const colorScheme = {}
	for (const slot of Object.keys(THEME.initial.colors)) {
		const carrier = elements(themeDocument, slot)[0]
		colorScheme[slot] = (carrier ? children(carrier)[0]?.getAttribute('val') || '' : '').toUpperCase()
	}
	return {
		name: themeDocument.documentElement?.getAttribute('name') || '',
		headFontFace: latin(major), bodyFontFace: latin(minor), colorScheme,
	}
}

function assertChildOrder(document, orderedNames, label) {
	const indexes = children(document.documentElement || document).map(node => node.localName)
	let previous = -1
	for (const name of orderedNames) {
		const index = indexes.indexOf(name)
		if (index < 0) continue
		assert.ok(index > previous, `${label}: ${name} is out of schema order (${indexes.join(', ')})`)
		previous = index
	}
}

function assertNoPrivateLeakage(value, label) {
	const leaked = []
	const visit = (item, itemPath) => {
		if (Array.isArray(item)) return item.forEach((child, index) => visit(child, `${itemPath}[${index}]`))
		if (!item || typeof item !== 'object') return
		for (const [key, child] of Object.entries(item)) {
			if (key.startsWith('_') || ['rawPackageParts', 'nativePreservation', 'preservationHandle'].includes(key)) leaked.push(`${itemPath}.${key}`)
			visit(child, `${itemPath}.${key}`)
		}
	}
	visit(value, '$')
	assert.deepEqual(leaked, [], `${label}: private state leaked`)
}

function baseMetadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove native inheritance', remember: 'theme, master, layout, reset, re-edit' },
		visualDesign: { world: 'blueprint', framing: 'inheritance atlas', tone: 'technical' },
		motionTime: { masterClock: 'authored static slides', timingSource: 'static', syncPolicy: 'single static clock' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	}
}

function placeholder(name, type, idx, geometry, style) {
	return { name, type, idx, size: 'full', orient: 'horz', hasCustomPrompt: false, ...geometry, margin: 0, ...(style ? { style } : {}) }
}

function placeholderStyle(variant) {
	const beta = variant === 'beta' || variant === 'gamma'
	return {
		preset: beta ? 'roundRect' : 'rect',
		fill: { type: 'solid', color: beta ? 'accent5' : 'accent2', transparency: beta ? 18 : 30 },
		line: { type: 'solid', color: beta ? 'accent6' : 'accent4', width: beta ? 1.5 : 0.75 },
		shadow: { type: 'outer', color: '000000', opacity: 0.18, blur: 1.5, angle: 45, distance: 1 },
		fontFace: beta ? 'Verdana' : 'Georgia', fontSize: beta ? 27 : 29,
		color: 'tx1', bold: !beta, italic: beta, align: beta ? 'left' : 'center', valign: 'middle',
		styleRefs: {
			fill: { index: 2, color: beta ? 'accent5' : 'accent2' }, line: { index: 1, color: beta ? 'accent6' : 'accent4' },
			effect: { index: 0, color: 'phClr' }, font: { role: beta ? 'minor' : 'major', color: 'tx1' },
		},
	}
}

function fixedObjects(prefix, color) {
	return [
		{ text: { text: `${prefix.toUpperCase()} FIXED`, options: { x: 0.25, y: 0.15, w: 2.4, h: 0.28, objectName: `${prefix}-fixed-text`, fontFace: 'Arial', fontSize: 8, color } } },
		{ rect: { x: 0.2, y: 7.08, w: 1.05, h: 0.12, objectName: `${prefix}-fixed-rect`, fill: { color }, line: { color, width: 0.5 } } },
		{ line: { x: 1.5, y: 7.14, w: 1.2, h: 0, objectName: `${prefix}-fixed-line`, line: { color, width: 1.25 } } },
	]
}

function themeDefinition(which = 'initial') {
	const theme = THEME[which]
	return {
		name: theme.name, headFontFace: theme.head, bodyFontFace: theme.body,
		fontFace: theme.body, lang: theme.lang, colorScheme: { ...theme.colors },
	}
}

function masterDefinition(name = NAMES.master, which = 'initial', components = true) {
	const replacement = name === NAMES.replacementMaster
	return {
		title: name, name, background: components ? (replacement ? 'FEF3C7' : 'E2E8F0') : null, margin: 0.4,
		headerFooter: { date: false, header: false, footer: false, slideNumber: true },
		objects: components ? fixedObjects(replacement ? 'replacement-master' : 'master', replacement ? 'EA580C' : '0EA5E9') : null,
		placeholders: components ? [placeholder('masterTitle', 'title', 0, { x: 0.72, y: 0.48, w: 11.9, h: 1.16 }, placeholderStyle(replacement ? 'gamma' : 'alpha'))] : null,
		colorMap: components ? { ...MASTER_COLOR_MAP } : null,
		textStyles: components ? structuredClone(TEXT_STYLES) : null,
		...(which === 'reedited' && components ? { margin: 0.46 } : {}),
	}
}

function layoutDefinition(name, masterName = NAMES.master, components = true) {
	const variant = name === NAMES.beta ? 'beta' : name === NAMES.gamma ? 'gamma' : 'alpha'
	const prefix = variant
	const geometry = GEOMETRY[name]
	const bodyGeometry = variant === 'beta'
		? { x: 1.42, y: 2.28, w: 10.4, h: 4.15 }
		: variant === 'gamma' ? { x: 1.1, y: 2.05, w: 11.0, h: 4.4 } : { x: 1.0, y: 1.78, w: 11.3, h: 4.9 }
	return {
		name, width: 13.333333, height: 7.5, type: 'wide', activate: name === NAMES.alpha || name === NAMES.gamma,
		masterName,
		objects: components ? fixedObjects(prefix, variant === 'alpha' ? '65A30D' : variant === 'beta' ? '7C3AED' : 'EA580C') : null,
		placeholders: components ? [
			placeholder('titleSlot', 'title', 0, geometry, placeholderStyle(variant)),
			placeholder('bodySlot', 'body', 1, bodyGeometry, { ...placeholderStyle(variant), preset: 'rect', fontSize: 16 }),
		] : null,
		background: null, margin: 0.25,
		colorMapOverride: components ? { ...(variant === 'alpha' ? ALPHA_COLOR_MAP : variant === 'beta' ? BETA_COLOR_MAP : MASTER_COLOR_MAP) } : null,
	}
}

function inheritedBlock(name, text, role = 'title') {
	return {
		kind: 'textBox', name, objectName: name, role, text,
		placeholderBinding: role === 'title'
			? { name: 'titleSlot', type: 'title', idx: 0, size: 'full', orient: 'horz', hasCustomPrompt: false }
			: { name: 'bodySlot', type: 'body', idx: 1, size: 'full', orient: 'horz', hasCustomPrompt: false },
		altText: `${text} inherited ${role}`,
	}
}

function styleOnlyBlock(name, text) {
	return {
		...inheritedBlock(name, text, 'title'),
		style: {
			fill: { color: '7C3AED', transparency: 0 }, line: { color: 'E11D48', width: 1.25 },
			glow: { color: '65A30D', opacity: 0.35, blur: 2 }, color: '111827', bold: true,
		},
	}
}

export function authoredSpec() {
	return {
		...baseMetadata('Layout theme master inheritance proof'),
		theme: themeDefinition('initial'),
		layouts: [layoutDefinition(NAMES.alpha), layoutDefinition(NAMES.beta)],
		masters: [masterDefinition()],
		layoutContract: {
			allowedLayouts: [NAMES.alpha, NAMES.beta], defaultLayout: NAMES.alpha, strictLayout: true,
			placeholderBindings: {
				title: { name: 'titleSlot', type: 'title', idx: 0, size: 'full' },
				body: { name: 'bodySlot', type: 'body', idx: 1, size: 'full' },
			},
			safeContentAreas: [{ x: 0.55, y: 0.45, w: 12.2, h: 6.55 }],
		},
		slides: [
			{
				id: 'inherit-a', title: 'Alpha inherited slide', layoutIntent: 'title-only', layoutName: NAMES.alpha, masterName: NAMES.master,
				background: null, colorMapOverride: null, showMasterShapes: true, showMasterPhAnim: false,
				content: [inheritedBlock('pure-a', 'ALPHA PURE INHERITANCE')],
			},
			{
				id: 'inherit-b', title: 'Beta inherited slide', layoutIntent: 'title-only', layoutName: NAMES.beta, masterName: NAMES.master,
				background: null, colorMapOverride: { ...SLIDE_COLOR_MAP }, showMasterBackground: false, showMasterPhAnim: true,
				content: [styleOnlyBlock('style-b', 'BETA STYLE ONLY')],
			},
			{
				id: 'inherit-default', title: 'Default inherited slide', layoutIntent: 'title-only', layoutName: NAMES.alpha, masterName: NAMES.master,
				background: null, colorMapOverride: null, showMasterShapes: true, showMasterPhAnim: null,
				content: [inheritedBlock('body-c', 'ALPHA BODY INHERITANCE', 'body')],
			},
		],
	}
}

function patchSpec(state) {
	const reedited = state === 'reedited'
	const theme = reedited ? themeDefinition('reedited') : null
	return {
		...baseMetadata(`Layout theme master inheritance ${state}`),
		theme,
		layoutContract: { strictLayout: reedited ? false : null },
		slides: [{
			id: 'inherit-a', slideIndex: 0, layoutIntent: 'title-only',
			layoutName: reedited ? NAMES.beta : null, masterName: reedited ? NAMES.master : null,
			background: null, colorMapOverride: reedited ? { ...SLIDE_COLOR_MAP } : null,
			showMasterShapes: reedited ? true : null, showMasterPhAnim: reedited ? false : null, content: [],
		}],
	}
}

function expectedLayoutNames(state) {
	return ['reedited', 'component-reedited', 'final-reedited', 'recompiled', 'powerpoint-roundtrip', 'final-office'].includes(state)
		? [NAMES.beta, NAMES.beta, NAMES.alpha]
		: [NAMES.alpha, NAMES.beta, NAMES.alpha]
}

function assertExport(spec, state, { privateLeakage = true } = {}) {
	assert.ok(spec, `${state}: export missing`)
	const first = spec.slides?.find(slide => slide.id === 'inherit-a') || spec.slides?.[0]
	if (state === 'reset') {
		assert.equal(Object.hasOwn(first, 'layoutName'), false, 'reset: layoutName selector must be absent')
		assert.equal(Object.hasOwn(first, 'masterName'), false, 'reset: masterName selector must be absent')
		assert.ok(spec.theme === null || spec.theme?.headFontFace == null, 'reset: headFontFace readback')
		assert.ok(spec.theme === null || spec.theme?.bodyFontFace == null, 'reset: bodyFontFace readback')
		assert.ok(spec.theme === null || spec.theme?.lang == null, 'reset: theme language readback')
		assert.equal(spec.layoutContract?.strictLayout, null, 'reset: strictLayout readback')
	} else {
		assert.equal(first.layoutName, NAMES.beta, `${state}: re-edited layoutName`)
		assert.equal(first.masterName, NAMES.master, `${state}: re-edited masterName`)
		assert.equal(spec.theme?.headFontFace, THEME.reedited.head, `${state}: re-edited head font`)
		assert.equal(spec.theme?.bodyFontFace, THEME.reedited.body, `${state}: re-edited body font`)
		assert.equal(spec.theme?.fontFace, THEME.reedited.body, `${state}: re-edited default font role`)
		assert.equal(spec.theme?.lang, THEME.reedited.lang, `${state}: re-edited language`)
		assert.equal(spec.theme?.name, THEME.reedited.name, `${state}: re-edited theme name`)
		assert.deepEqual(spec.theme?.colorScheme, THEME.reedited.colors, `${state}: all twelve theme colors`)
		const master = spec.masters?.find(item => (item.title || item.name) === NAMES.master)
		assert.ok(master, `${state}: authored master readback`)
		assert.deepEqual(master.colorMap, MASTER_COLOR_MAP, `${state}: master color map readback`)
		assert.deepEqual(master.textStyles, TEXT_STYLES, `${state}: master text styles readback`)
		assert.equal(master.objects?.length, 3, `${state}: master fixed objects readback`)
		for (const name of FIXED_NAMES.master) assert.ok(JSON.stringify(master.objects).includes(name), `${state}: master object ${name}`)
		for (const [layoutName, expectedMap, fixed] of [
			[NAMES.alpha, ALPHA_COLOR_MAP, FIXED_NAMES.alpha], [NAMES.beta, BETA_COLOR_MAP, FIXED_NAMES.beta],
		]) {
			const layout = spec.layouts?.find(item => item.name === layoutName)
			assert.ok(layout, `${state}: layout ${layoutName} readback`)
			assert.deepEqual(layout.colorMapOverride, expectedMap, `${state}: ${layoutName} color map override`)
			assert.equal(layout.objects?.length, 3, `${state}: ${layoutName} fixed objects readback`)
			assert.equal(layout.placeholders?.length, 2, `${state}: ${layoutName} styled placeholders readback`)
			for (const name of fixed) assert.ok(JSON.stringify(layout.objects).includes(name), `${state}: layout object ${name}`)
		}
		assert.equal(first.showMasterShapes, true, `${state}: canonical showMasterShapes readback`)
		assert.equal(first.showMasterBackground, true, `${state}: showMasterBackground alias readback`)
		assert.equal(first.showMasterPhAnim, false, `${state}: showMasterPhAnim readback`)
		assert.deepEqual(first.colorMapOverride, SLIDE_COLOR_MAP, `${state}: slide color map override readback`)
		for (const [index, expectedName] of ['pure-a', 'style-b', 'body-c'].entries()) {
			const slide = spec.slides?.[index]
			assert.equal(slide?.content?.length, 1, `${state}: slide ${index + 1} must export only its authored placeholder content`)
			assert.ok(String(slide.content[0]?.objectName || '').includes(expectedName), `${state}: slide ${index + 1} authored object identity`)
		}
	}
	if (privateLeakage) assertNoPrivateLeakage(spec, state)
}

async function inspectPackage(buffer, state) {
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
		assert.equal(new Set(rels.map(item => item.Id)).size, rels.length, `${state}/${name}: duplicate relationship id`)
		const source = sourcePartForRelationships(name)
		for (const rel of rels.filter(item => item.TargetMode !== 'External')) {
			const target = resolveTarget(source, rel.Target)
			assert.ok(nameSet.has(target), `${state}/${name}: dangling ${rel.Id} -> ${target}`)
		}
	}

	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${state}: content types missing`)
	const defaults = new Map(elements(contentTypes, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')]))
	const overrides = new Map(elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const [part] of overrides) assert.ok(nameSet.has(part), `${state}: override targets missing part ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${state}: ${name} has no content type`)
	}

	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort()
	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort()
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort()
	const themeParts = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort()
	assert.equal(slideParts.length, 3, `${state}: slide count`)
	assert.equal(masterParts.length, 1, `${state}: authored physical master count`)
	assert.ok(layoutParts.length >= 2, `${state}: at least two layouts`)
	assert.ok(themeParts.length >= 1, `${state}: theme part`)
	for (const part of slideParts) assert.equal(overrides.get(part), CONTENT_TYPES.slide, `${state}: slide content type`)
	for (const part of layoutParts) assert.equal(overrides.get(part), CONTENT_TYPES.layout, `${state}: layout content type`)
	for (const part of masterParts) assert.equal(overrides.get(part), CONTENT_TYPES.master, `${state}: master content type`)
	for (const part of themeParts) assert.equal(overrides.get(part), CONTENT_TYPES.theme, `${state}: theme content type`)
	assert.equal(names.filter(name => /^ppt\/media\//.test(name)).length, 0, `${state}: no orphan media in fixed text/rect/line atlas`)
	for (const part of slideParts) assertChildOrder(documents.get(part), ['cSld', 'clrMapOvr', 'transition', 'timing', 'extLst'], `${state}/${part}`)
	for (const part of layoutParts) assertChildOrder(documents.get(part), ['cSld', 'clrMapOvr', 'hf', 'extLst'], `${state}/${part}`)
	for (const part of masterParts) assertChildOrder(documents.get(part), ['cSld', 'clrMap', 'sldLayoutIdLst', 'hf', 'txStyles', 'extLst'], `${state}/${part}`)
	for (const part of themeParts) assertChildOrder(documents.get(part), ['themeElements', 'objectDefaults', 'extraClrSchemeLst', 'extLst'], `${state}/${part}`)
	for (const part of [...slideParts, ...layoutParts, ...masterParts]) {
		for (const [index, shape] of elements(documents.get(part), 'sp').entries()) {
			assertChildOrder(shape, ['nvSpPr', 'spPr', 'style', 'txBody'], `${state}/${part}/sp[${index + 1}]`)
			const nv = directChild(shape, 'nvSpPr')
			if (nv) assertChildOrder(nv, ['cNvPr', 'cNvSpPr', 'nvPr'], `${state}/${part}/sp[${index + 1}]/nvSpPr`)
			const spPr = directChild(shape, 'spPr')
			if (spPr) assertChildOrder(spPr, ['xfrm', 'prstGeom', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'ln', 'effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'], `${state}/${part}/sp[${index + 1}]/spPr`)
		}
		for (const [index, shape] of elements(documents.get(part), 'cxnSp').entries()) {
			assertChildOrder(shape, ['nvCxnSpPr', 'spPr', 'style'], `${state}/${part}/cxnSp[${index + 1}]`)
			const nv = directChild(shape, 'nvCxnSpPr')
			if (nv) assertChildOrder(nv, ['cNvPr', 'cNvCxnSpPr', 'nvPr'], `${state}/${part}/cxnSp[${index + 1}]/nvCxnSpPr`)
		}
	}

	const layoutNames = new Map(layoutParts.map(part => [part, cSldName(documents.get(part))]))
	const layoutByName = new Map([...layoutNames].map(([part, name]) => [name, part]))
	for (const wanted of [NAMES.alpha, NAMES.beta]) assert.ok(layoutByName.has(wanted), `${state}: layout ${wanted} missing`)
	const masterPart = masterParts[0]
	assert.equal(cSldName(documents.get(masterPart)), NAMES.master, `${state}: physical master semantic name`)
	const presentationPart = 'ppt/presentation.xml'
	const presentationRels = relsFor(documents, presentationPart)
	const presentationMasterTargets = presentationRels.filter(rel => rel.Type === `${REL_BASE}slideMaster`).map(rel => resolveTarget(presentationPart, rel.Target))
	assert.deepEqual(presentationMasterTargets, [masterPart], `${state}: presentation master graph`)

	const masterRels = relsFor(documents, masterPart)
	const masterLayoutTargets = masterRels.filter(rel => rel.Type === `${REL_BASE}slideLayout`).map(rel => resolveTarget(masterPart, rel.Target)).sort()
	const listedLayoutTargets = elements(documents.get(masterPart), 'sldLayoutId').map(node => targetById(masterPart, masterRels, relationshipId(node))).sort()
	assert.deepEqual(listedLayoutTargets, masterLayoutTargets, `${state}: master layout list/rels agreement`)
	for (const layoutPart of layoutParts) {
		const layoutRels = relsFor(documents, layoutPart)
		const masterTargets = layoutRels.filter(rel => rel.Type === `${REL_BASE}slideMaster`).map(rel => resolveTarget(layoutPart, rel.Target))
		assert.deepEqual(masterTargets, [masterPart], `${state}: ${layoutPart} must bind the single master`)
		assert.ok(masterLayoutTargets.includes(layoutPart), `${state}: master must list ${layoutPart}`)
	}
	const masterThemeRels = masterRels.filter(rel => rel.Type === `${REL_BASE}theme`)
	assert.equal(masterThemeRels.length, 1, `${state}: one theme edge per master`)
	const masterThemeTarget = resolveTarget(masterPart, masterThemeRels[0].Target)
	assert.ok(themeParts.includes(masterThemeTarget), `${state}: master theme target`)
	for (const name of FIXED_NAMES.master) shapeByName(documents.get(masterPart), name)
	const masterColorMap = elements(documents.get(masterPart), 'clrMap')[0]
	assert.ok(masterColorMap, `${state}: master clrMap`)
	for (const [key, value] of Object.entries(MASTER_COLOR_MAP)) assert.equal(masterColorMap.getAttribute(key), value, `${state}: master clrMap@${key}`)
	const txStyles = elements(documents.get(masterPart), 'txStyles')[0]
	assert.ok(txStyles, `${state}: master txStyles`)
	for (const [family, style, align] of [
		['titleStyle', TEXT_STYLES.title, 'ctr'], ['bodyStyle', TEXT_STYLES.body, 'l'], ['otherStyle', TEXT_STYLES.other, 'r'],
	]) {
		const node = directChild(txStyles, family)
		assert.ok(node, `${state}: master ${family}`)
		assert.equal(children(node).filter(child => /^lvl\d+pPr$/.test(child.localName)).length, 9, `${state}: ${family} has nine levels`)
		const level = directChild(node, 'lvl1pPr')
		assert.equal(level?.getAttribute('algn'), align, `${state}: ${family} alignment`)
		const defRPr = directChild(level, 'defRPr')
		assert.ok(defRPr, `${state}: ${family} defRPr`)
		assert.equal(defRPr.getAttribute('lang'), state === 'initial' || state === 'reset' ? THEME.initial.lang : THEME.reedited.lang, `${state}: ${family} inherited language`)
		assert.equal(Number(defRPr.getAttribute('sz')), Math.round(style.fontSize * 100), `${state}: ${family} font size`)
		if (typeof style.bold === 'boolean') assert.ok(style.bold ? defRPr.getAttribute('b') === '1' : ['', '0'].includes(defRPr.getAttribute('b')), `${state}: ${family} bold`)
		if (typeof style.italic === 'boolean') assert.ok(style.italic ? defRPr.getAttribute('i') === '1' : ['', '0'].includes(defRPr.getAttribute('i')), `${state}: ${family} italic`)
		assert.equal(directChild(defRPr, 'latin')?.getAttribute('typeface'), style.fontFace, `${state}: ${family} font face`)
		assert.equal(elements(defRPr, 'schemeClr')[0]?.getAttribute('val'), style.color, `${state}: ${family} color role`)
	}
	for (const [layoutName, fixedNames, expectedMap] of [
		[NAMES.alpha, FIXED_NAMES.alpha, ALPHA_COLOR_MAP], [NAMES.beta, FIXED_NAMES.beta, BETA_COLOR_MAP],
	]) {
		const part = layoutByName.get(layoutName)
		for (const name of fixedNames) shapeByName(documents.get(part), name)
		const override = elements(documents.get(part), 'overrideClrMapping')[0]
		assert.ok(override, `${state}: ${layoutName} overrideClrMapping`)
		for (const [key, value] of Object.entries(expectedMap)) assert.equal(override.getAttribute(key), value, `${state}: ${layoutName} overrideClrMapping@${key}`)
		const titlePlaceholder = elements(documents.get(part), 'sp').find(shape => {
			const ph = elements(shape, 'ph')[0]
			return ph && (ph.getAttribute('type') || '') === 'title'
		})
		assert.ok(titlePlaceholder, `${state}: ${layoutName} styled title placeholder`)
		const spPr = directChild(titlePlaceholder, 'spPr')
		assert.ok(spPr && directChild(spPr, 'solidFill'), `${state}: ${layoutName} placeholder fill`)
		assert.ok(spPr && directChild(spPr, 'ln'), `${state}: ${layoutName} placeholder line`)
		assert.ok(spPr && directChild(spPr, 'effectLst'), `${state}: ${layoutName} placeholder effect`)
	}

	const expectedNames = expectedLayoutNames(state)
	const slideBindings = []
	const inheritedGeometry = []
	for (const [index, slidePart] of slideParts.entries()) {
		const slideRels = relsFor(documents, slidePart)
		const layoutTargets = slideRels.filter(rel => rel.Type === `${REL_BASE}slideLayout`).map(rel => resolveTarget(slidePart, rel.Target))
		assert.equal(layoutTargets.length, 1, `${state}: ${slidePart} exactly one layout edge`)
		const layoutPart = layoutTargets[0]
		const actualName = layoutNames.get(layoutPart)
		assert.equal(actualName, expectedNames[index], `${state}: slide ${index + 1} layout binding`)
		const expectedShape = [
			{ name: 'pure-a', type: 'title', idx: 0, geometry: GEOMETRY[actualName], pure: true },
			{ name: 'style-b', type: 'title', idx: 0, geometry: GEOMETRY[actualName], styleOnly: true },
			{ name: 'body-c', type: 'body', idx: 1, geometry: { x: 1.0, y: 1.78, w: 11.3, h: 4.9 }, pure: true },
		][index]
		const slideShape = shapeByName(documents.get(slidePart), expectedShape.name)
		const tuple = placeholderTuple(slideShape)
		assert.equal(tuple.type, expectedShape.type, `${state}: ${expectedShape.name} placeholder type`)
		assert.equal(tuple.idx, expectedShape.idx, `${state}: ${expectedShape.name} placeholder idx`)
		const slideGeometry = xfrmOf(slideShape)
		const layoutShape = elements(documents.get(layoutPart), 'sp').find(shape => {
			const ph = elements(shape, 'ph')[0]
			return ph && (ph.getAttribute('type') || '') === expectedShape.type && (!ph.hasAttribute('idx') ? expectedShape.idx === 0 : Number(ph.getAttribute('idx')) === expectedShape.idx)
		})
		assert.ok(layoutShape, `${state}: ${actualName} ${expectedShape.type} placeholder`)
		const layoutGeometry = xfrmOf(layoutShape)
		assertGeometry(layoutGeometry, expectedShape.geometry, `${state}: ${actualName} inherited ${expectedShape.type} geometry`)
		assert.equal(slideGeometry, null, `${state}: ${expectedShape.name} must omit local xfrm and inherit geometry`)
		const slideSpPr = directChild(slideShape, 'spPr')
		assert.ok(slideSpPr, `${state}: ${expectedShape.name} spPr`)
		if (expectedShape.pure) {
			assert.equal(Boolean(directChild(slideSpPr, 'prstGeom')), false, `${state}: ${expectedShape.name} pure inherited lane omits local prstGeom`)
			assert.equal(Boolean(directChild(slideSpPr, 'solidFill')), false, `${state}: ${expectedShape.name} pure inherited lane omits local fill`)
			assert.equal(Boolean(directChild(slideSpPr, 'ln')), false, `${state}: ${expectedShape.name} pure inherited lane omits local line`)
		} else {
			assert.equal(Boolean(directChild(slideSpPr, 'prstGeom')), false, `${state}: ${expectedShape.name} style-only lane omits local prstGeom`)
			assert.ok(directChild(slideSpPr, 'solidFill'), `${state}: ${expectedShape.name} style-only lane retains local fill`)
			assert.ok(directChild(slideSpPr, 'ln'), `${state}: ${expectedShape.name} style-only lane retains local line`)
			assert.ok(directChild(slideSpPr, 'effectLst'), `${state}: ${expectedShape.name} style-only lane retains local effect`)
		}
		slideBindings.push({ slide: index + 1, layoutPart, layoutName: actualName })
		inheritedGeometry.push({
			slide: index + 1, shape: expectedShape.name, layoutName: actualName, geometry: layoutGeometry,
			carrierMode: 'native-inherited-geometry',
		})
		assert.equal(elements(documents.get(slidePart), 'bg').length, 0, `${state}: slide ${index + 1} must not flatten master background`)
	}
	const slideTwoRoot = documents.get(slideParts[1]).documentElement
	assert.equal(slideTwoRoot.getAttribute('showMasterSp'), '0', `${state}: showMasterBackground alias writes showMasterSp=0`)
	assert.equal(slideTwoRoot.hasAttribute('showMasterPhAnim'), false, `${state}: explicit true uses the OOXML default for showMasterPhAnim`)
	if (state === 'reset') assert.equal(documents.get(slideParts[0]).documentElement.hasAttribute('showMasterPhAnim'), false, `${state}: null reset clears showMasterPhAnim`)
	else assert.equal(documents.get(slideParts[0]).documentElement.getAttribute('showMasterPhAnim'), '0', `${state}: explicit showMasterPhAnim=false`)
	const slideOverride = elements(documents.get(slideParts[1]), 'overrideClrMapping')[0]
	assert.ok(slideOverride, `${state}: slide color-map override`)
	for (const [key, value] of Object.entries(SLIDE_COLOR_MAP)) assert.equal(slideOverride.getAttribute(key), value, `${state}: slide overrideClrMapping@${key}`)
	assert.ok(elements(documents.get(masterPart), 'bg').length >= 1, `${state}: master background carrier`)

	const signature = themeSignature(documents.get(masterThemeTarget))
	if (state === 'initial') {
		assert.equal(signature.name, THEME.initial.name, `${state}: theme name`)
		assert.equal(signature.headFontFace, THEME.initial.head, `${state}: theme head font`)
		assert.equal(signature.bodyFontFace, THEME.initial.body, `${state}: theme body font`)
		assert.deepEqual(signature.colorScheme, THEME.initial.colors, `${state}: all twelve theme colors`)
	} else if (state !== 'reset') {
		assert.equal(signature.name, THEME.reedited.name, `${state}: theme name`)
		assert.equal(signature.headFontFace, THEME.reedited.head, `${state}: theme head font`)
		assert.equal(signature.bodyFontFace, THEME.reedited.body, `${state}: theme body font`)
		assert.deepEqual(signature.colorScheme, THEME.reedited.colors, `${state}: all twelve theme colors`)
	} else {
		assert.notEqual(signature.headFontFace, THEME.reedited.head, `${state}: reset must not retain re-edited head font`)
		assert.notEqual(signature.colorScheme.accent1, THEME.reedited.colors.accent1, `${state}: reset must not retain re-edited accent1`)
	}

	return {
		state, partCount: names.length, slideCount: slideParts.length, layoutCount: layoutParts.length, masterCount: masterParts.length,
		themeCount: themeParts.length, masterPart, masterThemeTarget, slideBindings, inheritedGeometry, theme: signature,
	}
}

async function inspectStructuralPackage(buffer, state, expectation = {}) {
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
		assert.equal(new Set(rels.map(item => item.Id)).size, rels.length, `${state}/${name}: duplicate relationship id`)
		const source = sourcePartForRelationships(name)
		for (const rel of rels.filter(item => item.TargetMode !== 'External')) {
			const target = resolveTarget(source, rel.Target)
			assert.ok(nameSet.has(target), `${state}/${name}: dangling ${rel.Id} -> ${target}`)
		}
	}
	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${state}: content types missing`)
	const defaults = new Map(elements(contentTypes, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')]))
	const overrides = new Map(elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const [part] of overrides) assert.ok(nameSet.has(part), `${state}: orphan content-type override ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${state}: ${name} has no content type`)
	}
	const numeric = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0)
	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numeric)
	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(numeric)
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort(numeric)
	const themeParts = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort(numeric)
	assert.equal(slideParts.length, expectation.slideCount ?? 3, `${state}: slide count`)
	assert.equal(masterParts.length, 1, `${state}: exactly one physical master`)
	assert.ok(layoutParts.length >= (expectation.minimumLayoutCount ?? 1), `${state}: native layout floor`)
	for (const part of slideParts) assert.equal(overrides.get(part), CONTENT_TYPES.slide, `${state}: ${part} content type`)
	for (const part of layoutParts) assert.equal(overrides.get(part), CONTENT_TYPES.layout, `${state}: ${part} content type`)
	for (const part of masterParts) assert.equal(overrides.get(part), CONTENT_TYPES.master, `${state}: ${part} content type`)
	for (const part of themeParts) assert.equal(overrides.get(part), CONTENT_TYPES.theme, `${state}: ${part} content type`)
	const presentationPart = 'ppt/presentation.xml'
	const masterTargets = relsFor(documents, presentationPart)
		.filter(rel => rel.Type === `${REL_BASE}slideMaster`).map(rel => resolveTarget(presentationPart, rel.Target))
	assert.deepEqual(masterTargets, masterParts, `${state}: presentation reaches every and only physical master`)
	const masterPart = masterParts[0]
	const masterRels = relsFor(documents, masterPart)
	const layoutTargets = masterRels.filter(rel => rel.Type === `${REL_BASE}slideLayout`).map(rel => resolveTarget(masterPart, rel.Target)).sort()
	const listedTargets = elements(documents.get(masterPart), 'sldLayoutId').map(node => targetById(masterPart, masterRels, relationshipId(node))).sort()
	assert.deepEqual(layoutTargets, listedTargets, `${state}: master relationship/list bidirectionality`)
	assert.deepEqual(layoutTargets, [...layoutParts].sort(), `${state}: no orphan or unlisted layout parts`)
	const themeTargets = masterRels.filter(rel => rel.Type === `${REL_BASE}theme`).map(rel => resolveTarget(masterPart, rel.Target))
	assert.equal(themeTargets.length, 1, `${state}: exactly one master theme edge`)
	assert.ok(themeParts.includes(themeTargets[0]), `${state}: master theme target exists`)
	for (const layoutPart of layoutParts) {
		const parents = relsFor(documents, layoutPart).filter(rel => rel.Type === `${REL_BASE}slideMaster`).map(rel => resolveTarget(layoutPart, rel.Target))
		assert.deepEqual(parents, [masterPart], `${state}: ${layoutPart} reverse master edge`)
	}
	const layoutNames = new Map(layoutParts.map(part => [part, cSldName(documents.get(part))]))
	const layoutByName = new Map([...layoutNames].map(([part, name]) => [name, part]))
	for (const wanted of expectation.presentLayouts || []) assert.ok(layoutByName.has(wanted), `${state}: required layout ${wanted}`)
	for (const unwanted of expectation.absentLayouts || []) assert.equal(layoutByName.has(unwanted), false, `${state}: removed layout ${unwanted} survived`)
	if (expectation.masterName !== undefined) assert.equal(cSldName(documents.get(masterPart)), expectation.masterName, `${state}: master semantic name`)
	const slideLayoutNames = []
	for (const slidePart of slideParts) {
		const targets = relsFor(documents, slidePart).filter(rel => rel.Type === `${REL_BASE}slideLayout`).map(rel => resolveTarget(slidePart, rel.Target))
		assert.equal(targets.length, 1, `${state}: ${slidePart} exactly one layout edge`)
		assert.ok(layoutParts.includes(targets[0]), `${state}: ${slidePart} reaches a listed layout`)
		slideLayoutNames.push(layoutNames.get(targets[0]))
	}
	if (expectation.slideLayoutNames) assert.deepEqual(slideLayoutNames, expectation.slideLayoutNames, `${state}: slide layout bindings`)
	const allShapeNames = new Set([...documents].filter(([name]) => /^ppt\/(?:slides|slideLayouts|slideMasters)\/.+\.xml$/.test(name))
		.flatMap(([, document]) => elements(document, 'cNvPr').map(node => node.getAttribute('name') || '')))
	for (const wanted of expectation.presentShapeNames || []) assert.ok(allShapeNames.has(wanted), `${state}: fixed/readback shape ${wanted}`)
	for (const unwanted of expectation.absentShapeNames || []) assert.equal(allShapeNames.has(unwanted), false, `${state}: removed shape ${unwanted} survived`)
	if (expectation.requireNoMedia !== false) assert.equal(names.filter(name => /^ppt\/media\//.test(name)).length, 0, `${state}: orphan media cleanup`)
	for (const part of slideParts) assertChildOrder(documents.get(part), ['cSld', 'clrMapOvr', 'transition', 'timing', 'extLst'], `${state}/${part}`)
	for (const part of layoutParts) assertChildOrder(documents.get(part), ['cSld', 'clrMapOvr', 'hf', 'extLst'], `${state}/${part}`)
	assertChildOrder(documents.get(masterPart), ['cSld', 'clrMap', 'sldLayoutIdLst', 'hf', 'txStyles', 'extLst'], `${state}/${masterPart}`)
	for (const part of [...slideParts, ...layoutParts, ...masterParts]) {
		for (const [index, shape] of elements(documents.get(part), 'sp').entries()) {
			assertChildOrder(shape, ['nvSpPr', 'spPr', 'style', 'txBody'], `${state}/${part}/sp[${index + 1}]`)
			const nv = directChild(shape, 'nvSpPr')
			if (nv) assertChildOrder(nv, ['cNvPr', 'cNvSpPr', 'nvPr'], `${state}/${part}/sp[${index + 1}]/nvSpPr`)
		}
		for (const [index, shape] of elements(documents.get(part), 'cxnSp').entries()) {
			assertChildOrder(shape, ['nvCxnSpPr', 'spPr', 'style'], `${state}/${part}/cxnSp[${index + 1}]`)
			const nv = directChild(shape, 'nvCxnSpPr')
			if (nv) assertChildOrder(nv, ['cNvPr', 'cNvCxnSpPr', 'nvPr'], `${state}/${part}/cxnSp[${index + 1}]/nvCxnSpPr`)
		}
	}
	return {
		state, slideCount: slideParts.length, layoutCount: layoutParts.length, masterCount: masterParts.length, themeCount: themeParts.length,
		masterName: cSldName(documents.get(masterPart)), layoutNames: [...layoutNames.values()], slideLayoutNames,
		shapeNames: [...allShapeNames].filter(Boolean).sort(), partCount: names.length,
	}
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function packageCarrierCounts(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const out = {}
	for (const name of Object.keys(zip.files).filter(item => /^ppt\/(?:slides|slideLayouts|slideMasters)\/.+\.xml$/.test(item))) {
		const document = parseXmlStrict(await zip.file(name).async('string'), `${label}/${name}`)
		out[name] = elements(document, 'cNvPr').length
	}
	return out
}

async function assertStableRepeatedWrite(entry, firstBuffer, label) {
	const secondBuffer = await pptxBuffer(entry)
	assert.deepEqual(await packageCarrierCounts(secondBuffer, `${label}-repeat`), await packageCarrierCounts(firstBuffer, label), `${label}: repeated write changed carrier counts`)
	return { repeatedWriteSha256: sha256(secondBuffer), stableCarrierCounts: true }
}

async function writeState(outputDir, entry, state, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `layout-theme-master-inheritance-${state}.pptx`)
	await fs.writeFile(file, buffer)
	artifacts[state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(await inspectPackage(buffer, state))
	return { file, buffer }
}

async function writeStructuralState(outputDir, entry, state, expectation, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `layout-theme-master-inheritance-${state}.pptx`)
	await fs.writeFile(file, buffer)
	artifacts[state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(await inspectStructuralPackage(buffer, state, expectation))
	return { file, buffer }
}

function patchEnvelope(title, overrides = {}) {
	return { ...baseMetadata(title), slides: [], ...overrides }
}

function blockingFindings(result) {
	const data = result?.data || result || {}
	return [
		...(Array.isArray(data.unsupportedFindings) ? data.unsupportedFindings : []),
		...(Array.isArray(data.unsupported) ? data.unsupported : []),
	].filter(item => item?.blocking !== false)
}

async function assertRejectedWithoutMutation({ mcp, getDeck, invalidSpec, label, expected, deckIds }) {
	const created = dataOf(`${label} fixture`, await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	deckIds.push(created.deckId)
	const entry = getDeck(created.deckId)
	const beforeVersion = entry.deckVersion
	const beforeBuffer = await pptxBuffer(entry)
	const beforeHash = sha256(beforeBuffer)
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId: created.deckId, deckVersion: beforeVersion, spec: invalidSpec,
		phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	})
	const findings = blockingFindings(result)
	const failureText = JSON.stringify(result)
	assert.ok(result?.ok === false || findings.length > 0, `${label}: invalid mutation was accepted: ${failureText}`)
	assert.match(failureText, expected, `${label}: precise fail-closed diagnostic`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: rejected mutation changed deck version`)
	const afterBuffer = await pptxBuffer(entry)
	const afterHash = sha256(afterBuffer)
	if (afterHash !== beforeHash) {
		const memberDiff = await zipMemberDiff(beforeBuffer, afterBuffer)
		assert.fail(`${label}: rejected mutation changed package bytes; before=${beforeHash}; after=${afterHash}; ZIP diff=${JSON.stringify(memberDiff)}`)
	}
	return { label, rejected: true, diagnostic: failureText.slice(0, 500), packageHash: beforeHash }
}

async function runNegativeMutationGates({ mcp, getDeck, deckIds }) {
	const cases = [
		{
			label: 'missing layout binding', expected: /not present|not found|unsupported|layoutBinding/i,
			spec: patchEnvelope('Missing layout gate', { slides: [{ id: 'inherit-a', slideIndex: 0, layoutIntent: 'title-only', layoutName: 'MissingLayout', masterName: NAMES.master, content: [] }] }),
		},
		{
			label: 'missing layout parent master', expected: /does not match|not defined|master/i,
			spec: patchEnvelope('Missing master gate', { layouts: [layoutDefinition(NAMES.alpha, 'MissingMaster'), layoutDefinition(NAMES.beta, 'MissingMaster')] }),
		},
		{
			label: 'conflicting slide parent', expected: /conflict|must agree|parent master/i,
			spec: patchEnvelope('Conflicting parent gate', { slides: [{ id: 'inherit-a', slideIndex: 0, layoutIntent: 'title-only', layoutName: NAMES.alpha, masterName: NAMES.replacementMaster, content: [] }] }),
		},
		{
			label: 'self layout parent', expected: /self|peer layout/i,
			spec: patchEnvelope('Self parent gate', { layouts: [layoutDefinition(NAMES.alpha, NAMES.alpha), layoutDefinition(NAMES.beta)] }),
		},
		{
			label: 'peer layout parent', expected: /self|peer layout/i,
			spec: patchEnvelope('Peer parent gate', { layouts: [layoutDefinition(NAMES.alpha, NAMES.beta), layoutDefinition(NAMES.beta)] }),
		},
		{
			label: 'duplicate authored layout', expected: /duplicate/i,
			spec: patchEnvelope('Duplicate layout gate', { layouts: [layoutDefinition(NAMES.alpha), layoutDefinition(NAMES.alpha)] }),
		},
		{
			label: 'duplicate authored master', expected: /duplicate/i,
			spec: patchEnvelope('Duplicate master gate', { masters: [masterDefinition(), masterDefinition()] }),
		},
	]
	const results = []
	for (const item of cases) results.push(await assertRejectedWithoutMutation({ mcp, getDeck, invalidSpec: item.spec, label: item.label, expected: item.expected, deckIds }))
	return results
}

async function commitPatch(mcp, deckId, entry, spec, label) {
	const result = dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: entry.deckVersion, spec, phase: 'commit', commitMode: 'patch',
		plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	assert.deepEqual(result.unsupportedFindings || [], [], `${label}: unsupported findings`)
	return result
}

function componentResetSpec() {
	return patchEnvelope('Inheritance component reset', {
		masters: [masterDefinition(NAMES.master, 'reedited', false)],
		layouts: [layoutDefinition(NAMES.alpha, NAMES.master, false), layoutDefinition(NAMES.beta, NAMES.master, false)],
	})
}

function componentReeditSpec() {
	return patchEnvelope('Inheritance component re-edit', {
		theme: themeDefinition('reedited'), masters: [masterDefinition(NAMES.master, 'reedited', true)],
		layouts: [layoutDefinition(NAMES.alpha), layoutDefinition(NAMES.beta)],
	})
}

function emptyCollectionsSpec(mode) {
	const value = mode === 'null' ? null : []
	return patchEnvelope(`Inheritance collection ${mode}`, {
		...(mode === 'null' ? { theme: null } : {}), layouts: value, masters: value,
		slides: [0, 1, 2].map((slideIndex, index) => ({
			id: ['inherit-a', 'inherit-b', 'inherit-default'][index], slideIndex, layoutIntent: 'title-only',
			layoutName: null, masterName: null, colorMapOverride: null, showMasterShapes: null, showMasterPhAnim: null, content: [],
		})),
	})
}

function replacementSpec() {
	return patchEnvelope('Inheritance replacement collection', {
		theme: themeDefinition('reedited'), masters: [masterDefinition(NAMES.replacementMaster, 'reedited', true)],
		layouts: [layoutDefinition(NAMES.gamma, NAMES.replacementMaster, true)],
		slides: [0, 1, 2].map((slideIndex, index) => ({
			id: ['inherit-a', 'inherit-b', 'inherit-default'][index], slideIndex, layoutIntent: 'title-only',
			layoutName: NAMES.gamma, masterName: NAMES.replacementMaster, background: null,
			colorMapOverride: index === 1 ? { ...SLIDE_COLOR_MAP } : null,
			showMasterShapes: index !== 1, showMasterPhAnim: index === 1, content: [],
		})),
	})
}

function finalReaddSpec() {
	return patchEnvelope('Inheritance final re-add', {
		theme: themeDefinition('reedited'), masters: [masterDefinition(NAMES.master, 'reedited', true)],
		layouts: [layoutDefinition(NAMES.alpha), layoutDefinition(NAMES.beta)],
		slides: [
			{ id: 'inherit-a', slideIndex: 0, layoutIntent: 'title-only', layoutName: NAMES.beta, masterName: NAMES.master, background: null, colorMapOverride: { ...SLIDE_COLOR_MAP }, showMasterShapes: true, showMasterPhAnim: false, content: [] },
			{ id: 'inherit-b', slideIndex: 1, layoutIntent: 'title-only', layoutName: NAMES.beta, masterName: NAMES.master, background: null, colorMapOverride: { ...SLIDE_COLOR_MAP }, showMasterBackground: false, showMasterPhAnim: true, content: [] },
			{ id: 'inherit-default', slideIndex: 2, layoutIntent: 'title-only', layoutName: NAMES.alpha, masterName: NAMES.master, background: null, colorMapOverride: null, showMasterShapes: true, showMasterPhAnim: null, content: [] },
		],
	})
}

function portableSpec(spec) {
	const clone = structuredClone(spec)
	delete clone.nativePackagePreservation
	for (const slide of clone.slides || []) {
		delete slide.nativeTimingPreservation
		slide.content = (slide.content || []).filter(item => item.kind !== 'opaqueNative').map(item => {
			const { editHandle, nativePreservation, preservationHandle, ...portable } = item
			return portable
		})
	}
	return clone
}

function normalizeOffice(snapshot) {
	return {
		SlideCount: snapshot.SlideCount,
		Theme: snapshot.Theme,
		Master: snapshot.Master,
		Layouts: snapshot.Layouts,
		Slides: snapshot.Slides.map(slide => ({
			Index: slide.Index, LayoutName: slide.LayoutName, MasterName: slide.MasterName,
			FollowMasterBackground: slide.FollowMasterBackground, DisplayMasterShapes: slide.DisplayMasterShapes,
			Shapes: slide.Shapes.map(shape => ({
				Name: shape.Name, Left: shape.Left, Top: shape.Top, Width: shape.Width, Height: shape.Height,
				FontName: shape.FontName, FontColorRgb: shape.FontColorRgb, FillVisible: shape.FillVisible, FillRgb: shape.FillRgb,
				LineVisible: shape.LineVisible, LineRgb: shape.LineRgb, LineWeight: shape.LineWeight,
				ShadowVisible: shape.ShadowVisible, GlowRadius: shape.GlowRadius, PlaceholderType: shape.PlaceholderType,
				ZOrderPosition: shape.ZOrderPosition, AlternativeText: shape.AlternativeText,
			})),
		})),
	}
}

function officeShape(snapshot, slideIndex, needle) {
	const slide = snapshot.Slides.find(item => item.Index === slideIndex)
	assert.ok(slide, `Office slide ${slideIndex} missing`)
	const shape = slide.Shapes.find(item => String(item.Name || '').includes(needle))
	assert.ok(shape, `Office shape ${needle} missing on slide ${slideIndex}`)
	return shape
}

function assertOfficeSnapshot(snapshot, label, expected) {
	assert.equal(snapshot.SlideCount, 3, `${label}: slide count`)
	assert.deepEqual(snapshot.Slides.map(slide => slide.LayoutName), expected.layouts, `${label}: effective layout names`)
	assert.deepEqual([...new Set(snapshot.Slides.map(slide => slide.MasterName))], [expected.master], `${label}: one effective named master`)
	assert.equal(snapshot.Master?.Name, expected.master, `${label}: master readback name`)
	for (const slide of snapshot.Slides) assert.equal(slide.FollowMasterBackground, true, `${label}: slide ${slide.Index} follows master background`)
	assert.deepEqual(snapshot.Slides.map(slide => slide.DisplayMasterShapes), [true, false, true], `${label}: showMasterShapes/showMasterBackground alias readback`)
	for (const [index, name] of ['pure-a', 'style-b', 'body-c'].entries()) {
		const shape = officeShape(snapshot, index + 1, name)
		const layout = expected.layouts[index]
		const expectedGeometry = index === 2
			? (layout === NAMES.gamma ? { x: 1.1, y: 2.05, w: 11.0, h: 4.4 } : { x: 1.0, y: 1.78, w: 11.3, h: 4.9 })
			: GEOMETRY[layout]
		for (const [key, officeKey] of Object.entries({ x: 'Left', y: 'Top', w: 'Width', h: 'Height' })) {
			assertNear(shape[officeKey], expectedGeometry[key] * 72, `${label}: ${name}.${officeKey}`, 0.3)
		}
		const expectedPlaceholderFont = layout === NAMES.alpha ? THEME.reedited.head : THEME.reedited.body
		const expectedThemeToken = layout === NAMES.alpha ? '+mj-lt' : '+mn-lt'
		assert.ok([expectedPlaceholderFont, expectedThemeToken].includes(shape.FontName), `${label}: ${name} effective placeholder/theme font ${shape.FontName}`)
		if (name === 'style-b') {
			assert.equal(shape.FillVisible, true, `${label}: style-only fill visible`)
			assert.equal(shape.LineVisible, true, `${label}: style-only line visible`)
			assert.ok(shape.GlowRadius > 0, `${label}: style-only glow effective`)
		}
	}
	const masterFixed = expected.master === NAMES.replacementMaster ? FIXED_NAMES.replacementMaster : FIXED_NAMES.master
	for (const name of masterFixed) assert.ok(snapshot.Master.Shapes.some(shape => String(shape.Name).includes(name)), `${label}: master fixed object ${name}`)
	for (const layoutName of new Set(expected.layouts)) {
		const layout = snapshot.Layouts.find(item => item.Name === layoutName)
		assert.ok(layout, `${label}: COM layout ${layoutName}`)
		const fixed = layoutName === NAMES.gamma ? FIXED_NAMES.gamma : layoutName === NAMES.beta ? FIXED_NAMES.beta : FIXED_NAMES.alpha
		for (const name of fixed) assert.ok(layout.Shapes.some(shape => String(shape.Name).includes(name)), `${label}: ${layoutName} fixed object ${name}`)
	}
	assert.ok([THEME.reedited.head, '+mj-lt', ''].includes(snapshot.Theme?.MajorLatin || ''), `${label}: theme major Latin`)
	assert.ok([THEME.reedited.body, '+mn-lt', ''].includes(snapshot.Theme?.MinorLatin || ''), `${label}: theme minor Latin`)
	assert.ok([THEME.reedited.name, ''].includes(snapshot.Theme?.Name || ''), `${label}: theme name`)
}

async function runOfficeProof(inputPath, outputPath, reportPath, expected) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-layout-theme-master-inheritance-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.saveCopyAs, true)
	assert.equal(report.reopened, true)
	assertOfficeSnapshot(report.source, 'Office source', expected)
	assertOfficeSnapshot(report.roundtrip, 'Office roundtrip', expected)
	assert.deepEqual(normalizeOffice(report.roundtrip), normalizeOffice(report.source), 'Office semantic source/roundtrip readback')
	return report
}

export async function runLayoutThemeMasterInheritanceProof({ outputDir, office = false } = {}) {
	assert.equal(LAYOUT_THEME_MASTER_INHERITANCE_ROWS.length, 6)
	assert.equal(new Set(LAYOUT_THEME_MASTER_INHERITANCE_ROWS.map(([id]) => id)).size, 6)
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layout-theme-master-inheritance-'))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `layout-theme-master-inheritance-${Date.now()}`,
		clientInfo: { name: 'layout-theme-master-inheritance-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true,
	})
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	try {
		const committed = dataOf('initial commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(committed.deckId)
		const entry = getDeck(committed.deckId)
		const initialState = await writeState(resolvedOutput, entry, 'initial', artifacts, lifecycle)
		Object.assign(artifacts.initial, await assertStableRepeatedWrite(entry, initialState.buffer, 'initial'))
		let negativeMutationGates = []

		await commitPatch(mcp, committed.deckId, entry, patchSpec('reset'), 'reset patch')
		await writeState(resolvedOutput, entry, 'reset', artifacts, lifecycle)
		const resetExport = dataOf('reset export', await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'current', detail: 'full' })).spec
		assertExport(resetExport, 'reset')

		await commitPatch(mcp, committed.deckId, entry, patchSpec('reedited'), 're-edit patch')
		await writeState(resolvedOutput, entry, 'reedited', artifacts, lifecycle)

		await commitPatch(mcp, committed.deckId, entry, patchEnvelope('Duplicate slide proof', { edits: { duplicateSlides: { slideIndex: 0 } } }), 'duplicate slide')
		await writeStructuralState(resolvedOutput, entry, 'slide-duplicated', {
			slideCount: 4, presentLayouts: [NAMES.alpha, NAMES.beta], masterName: NAMES.master,
			presentShapeNames: [...FIXED_NAMES.master, ...FIXED_NAMES.alpha, ...FIXED_NAMES.beta],
		}, artifacts, lifecycle)
		await commitPatch(mcp, committed.deckId, entry, patchEnvelope('Reorder slide proof', { edits: { reorderSlides: { order: [3, 1, 2, 0] } } }), 'reorder slides')
		await writeStructuralState(resolvedOutput, entry, 'slide-reordered', {
			slideCount: 4, presentLayouts: [NAMES.alpha, NAMES.beta], masterName: NAMES.master,
			slideLayoutNames: [NAMES.beta, NAMES.beta, NAMES.alpha, NAMES.beta],
		}, artifacts, lifecycle)
		await commitPatch(mcp, committed.deckId, entry, patchEnvelope('Delete slide proof', { edits: { deleteSlides: [3] } }), 'delete duplicated slide')
		await writeStructuralState(resolvedOutput, entry, 'slide-deleted', {
			slideCount: 3, presentLayouts: [NAMES.alpha, NAMES.beta], masterName: NAMES.master,
			slideLayoutNames: [NAMES.beta, NAMES.beta, NAMES.alpha],
		}, artifacts, lifecycle)

		await commitPatch(mcp, committed.deckId, entry, componentResetSpec(), 'component null reset')
		await writeStructuralState(resolvedOutput, entry, 'component-reset', {
			presentLayouts: [NAMES.alpha, NAMES.beta], masterName: NAMES.master,
			absentShapeNames: [...FIXED_NAMES.master, ...FIXED_NAMES.alpha, ...FIXED_NAMES.beta, 'masterTitle', 'titleSlot', 'bodySlot'],
		}, artifacts, lifecycle)
		await commitPatch(mcp, committed.deckId, entry, componentReeditSpec(), 'component re-edit')
		await writeState(resolvedOutput, entry, 'component-reedited', artifacts, lifecycle)

		await commitPatch(mcp, committed.deckId, entry, emptyCollectionsSpec('empty'), 'empty collection reset')
		await writeStructuralState(resolvedOutput, entry, 'collections-empty', {
			absentLayouts: [NAMES.alpha, NAMES.beta, NAMES.gamma],
			absentShapeNames: [...FIXED_NAMES.master, ...FIXED_NAMES.alpha, ...FIXED_NAMES.beta, ...FIXED_NAMES.gamma],
		}, artifacts, lifecycle)

		await commitPatch(mcp, committed.deckId, entry, replacementSpec(), 'replacement collection')
		const replacementState = await writeStructuralState(resolvedOutput, entry, 'replacement', {
			presentLayouts: [NAMES.gamma], absentLayouts: [NAMES.alpha, NAMES.beta], masterName: NAMES.replacementMaster,
			slideLayoutNames: [NAMES.gamma, NAMES.gamma, NAMES.gamma],
			presentShapeNames: [...FIXED_NAMES.replacementMaster, ...FIXED_NAMES.gamma],
			absentShapeNames: [...FIXED_NAMES.master, ...FIXED_NAMES.alpha, ...FIXED_NAMES.beta],
		}, artifacts, lifecycle)

		await commitPatch(mcp, committed.deckId, entry, emptyCollectionsSpec('null'), 'null collection reset')
		await writeStructuralState(resolvedOutput, entry, 'collections-null', {
			absentLayouts: [NAMES.alpha, NAMES.beta, NAMES.gamma],
			absentShapeNames: [...FIXED_NAMES.master, ...FIXED_NAMES.replacementMaster, ...FIXED_NAMES.alpha, ...FIXED_NAMES.beta, ...FIXED_NAMES.gamma],
		}, artifacts, lifecycle)
		await commitPatch(mcp, committed.deckId, entry, finalReaddSpec(), 'final re-add')
		const finalState = await writeState(resolvedOutput, entry, 'final-reedited', artifacts, lifecycle)
		Object.assign(artifacts['final-reedited'], await assertStableRepeatedWrite(entry, finalState.buffer, 'final-reedited'))
		negativeMutationGates = await runNegativeMutationGates({ mcp, getDeck, deckIds })

		const exported = dataOf('final export', await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'current', detail: 'full' })).spec
		assertExport(exported, 'final-reedited')
		const exportedPath = path.join(resolvedOutput, 'layout-theme-master-inheritance-exported-spec.json')
		const portable = portableSpec(exported)
		await fs.writeFile(exportedPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
		artifacts.currentSpec = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }

		const replay = dataOf('recompile', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: portable, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(replay.deckId)
		const replayExport = dataOf('recompile export', await mcp.call('betterpptx.deck.export_spec', { deckId: replay.deckId, mode: 'current', detail: 'full' })).spec
		assertExport(replayExport, 'recompiled')
		await writeState(resolvedOutput, getDeck(replay.deckId), 'recompiled', artifacts, lifecycle)

		let officeResult = { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_LAYOUT_THEME_MASTER_INHERITANCE_OFFICE=1.', checkpoints: [] }
		if (office) {
			const checkpoints = []
			for (const checkpoint of [
				{ name: 'replacement', state: replacementState, layouts: [NAMES.gamma, NAMES.gamma, NAMES.gamma], master: NAMES.replacementMaster, structural: true },
				{ name: 'final', state: finalState, layouts: [NAMES.beta, NAMES.beta, NAMES.alpha], master: NAMES.master, structural: false },
			]) {
				const roundtripPath = path.join(resolvedOutput, `layout-theme-master-inheritance-${checkpoint.name}-savecopyas.pptx`)
				const reportPath = path.join(resolvedOutput, `layout-theme-master-inheritance-${checkpoint.name}-office-com.json`)
				const report = await runOfficeProof(checkpoint.state.file, roundtripPath, reportPath, checkpoint)
				const roundtripBuffer = await fs.readFile(roundtripPath)
				const packageResult = checkpoint.structural
					? await inspectStructuralPackage(roundtripBuffer, `${checkpoint.name}-office`, { slideLayoutNames: checkpoint.layouts, masterName: checkpoint.master })
					: await inspectPackage(roundtripBuffer, 'final-office')
				checkpoints.push({ ...report, package: packageResult, roundtripFile: relative(roundtripPath), roundtripSha256: sha256(roundtripBuffer), reportFile: relative(reportPath) })
				artifacts[`${checkpoint.name}OfficeRoundtrip`] = { file: relative(roundtripPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
			}
			officeResult = { status: 'PASS', checkpoints }
		}

		return {
			schemaVersion: 'betterpptx.layout-theme-master-inheritance-unit-proof.v1',
			unitId: LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID,
			status: officeResult.status === 'PASS'
				? 'LAYOUT_THEME_MASTER_INHERITANCE_PACKAGE_AND_OFFICE_VERIFIED'
				: 'LAYOUT_THEME_MASTER_INHERITANCE_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(),
			rows: LAYOUT_THEME_MASTER_INHERITANCE_ROWS.map(([id, label]) => ({ id, label })),
			checks: {
				xmlParseAndOpcClosure: true,
				relationshipAndContentTypeClosure: true,
				oneMasterTwoNamedLayoutsThreeSlides: true,
				graphCardinalityAndBidirectionality: true,
				geometryStyleAndThemeInheritance: true,
				fixedObjectsPlaceholderStyleAndTextStyleReadback: true,
				failClosedNoMutationInvalidBindings: negativeMutationGates.length === 7,
				componentAndCollectionNullEmptyReplaceReadd: true,
				duplicateReorderDeleteAndOrphanCleanup: true,
				stableCarrierCountsAcrossRepeatedWrites: true,
				resetReeditExportRecompile: true,
				importedOneMasterRawPreservation: 'separate imported-template preservation lane; not duplicated by this authored-carrier verifier',
				powerPointOpen2007SaveCopyAsReopen: officeResult.status === 'PASS',
			},
			blockers: [], negativeMutationGates, lifecycle, office: officeResult, artifacts,
			proofPath: relative(path.join(resolvedOutput, 'layout-theme-master-inheritance-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const configured = process.env.BETTERPPTX_LAYOUT_THEME_MASTER_INHERITANCE_OUTPUT
	const outputDir = configured ? path.resolve(configured) : await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-layout-theme-master-inheritance-${timestamp()}-`))
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_LAYOUT_THEME_MASTER_INHERITANCE_OFFICE === '1'
	let result
	try {
		result = await runLayoutThemeMasterInheritanceProof({ outputDir, office })
	} catch (error) {
		result = {
			schemaVersion: 'betterpptx.layout-theme-master-inheritance-unit-proof.v1', unitId: LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID,
			status: 'LAYOUT_THEME_MASTER_INHERITANCE_PRODUCTION_BLOCKED', generatedAt: new Date().toISOString(),
			rows: LAYOUT_THEME_MASTER_INHERITANCE_ROWS.map(([id, label]) => ({ id, label })),
			blockers: [{ message: error?.message || String(error), stack: error?.stack || null }],
			proofPath: relative(path.join(outputDir, 'layout-theme-master-inheritance-unit-proof.json')),
		}
	}
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'layout-theme-master-inheritance-unit-proof.json')
	await fs.writeFile(proofPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify({ ...result, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2))
	if (result.status === 'LAYOUT_THEME_MASTER_INHERITANCE_PRODUCTION_BLOCKED') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
