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

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const modulePath = fileURLToPath(import.meta.url)
const moduleDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(moduleDir, '..')

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const LAYOUT_NAME = 'FOUNDATION_ROLE_ATLAS_LAYOUT'
const MASTER_NAME = 'FOUNDATION_ROLE_ATLAS_MASTER'
const SLIDE_NUMBER_FIELD_ID = '{14141414-2525-4636-8747-585858585858}'
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1ZzWQAAAABJRU5ErkJggg=='
const WAV_DATA = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='

export const FOUNDATION_PLACEHOLDER_UNIT_ID = 'impl-b-a401766c4db63681'
export const FOUNDATION_PLACEHOLDER_ROWS = Object.freeze([
	['cap_081e874a48edb87f19a2', 'header'],
	['cap_08785c644fe82b5ec3f2', 'slideNum'],
	['cap_1202b1a8af7d8070105c', 'slide numbers'],
	['cap_584b523aa9e2d6b7e9e1', 'date'],
	['cap_596f63b0c2b2690a1782', 'media'],
	['cap_c3e72c6bfaf00e553dfe', 'body'],
	['cap_da722df959d0def8e8ee', 'footer'],
	['cap_e41a662c27ece1260561', 'title'],
	['cap_fe790b8581c07ca42a29', 'subtitle'],
])

const ROLES = Object.freeze([
	Object.freeze({ key: 'title', type: 'title', idx: 0, size: 'full', orient: 'horz', hasCustomPrompt: false, x: 0.45, y: 0.25, w: 4.1, h: 0.55, comType: 1 }),
	Object.freeze({ key: 'body', type: 'body', idx: 1, size: 'half', orient: 'vert', hasCustomPrompt: true, x: 0.45, y: 1.1, w: 4.1, h: 1.25, comType: 6 }),
	Object.freeze({ key: 'subtitle', type: 'subTitle', idx: 2, size: 'quarter', orient: 'horz', hasCustomPrompt: false, x: 0.45, y: 2.55, w: 4.1, h: 0.5, comType: 4 }),
	Object.freeze({ key: 'date', type: 'dt', idx: 3, size: 'quarter', orient: 'horz', hasCustomPrompt: true, x: 0.45, y: 6.75, w: 2.0, h: 0.35, comType: 16 }),
	Object.freeze({ key: 'footer', type: 'ftr', idx: 4, size: 'half', orient: 'horz', hasCustomPrompt: false, x: 2.7, y: 6.75, w: 3.8, h: 0.35, comType: 15 }),
	Object.freeze({ key: 'slidenum', type: 'sldNum', idx: 6, size: 'quarter', orient: 'horz', hasCustomPrompt: false, x: 11.25, y: 6.75, w: 1.0, h: 0.35, comType: 13 }),
	Object.freeze({ key: 'media', type: 'media', idx: 7, size: 'half', orient: 'horz', hasCustomPrompt: true, x: 8.0, y: 1.2, w: 2.0, h: 1.8, comType: 10 }),
])

const HEADER_FOOTER_ON = Object.freeze({ date: true, header: true, footer: true, slideNumber: true })
const SLIDE_NUMBER_PROPS = Object.freeze({ x: 11.25, y: 7.1, w: 1.0, h: 0.25, fontFace: 'Aptos', fontSize: 10, color: '334155' })

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function relative(file) {
	return path.relative(workspaceRoot, file).replaceAll(path.sep, '/')
}

function timestamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function unwrap(label, result) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
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

function elements(document, localName) {
	return Array.from(document?.getElementsByTagName('*') || []).filter(node => node.localName === localName)
}

function elementChildren(node) {
	return Array.from(node?.childNodes || []).filter(child => child.nodeType === 1)
}

function firstDescendant(node, localName) {
	return elements(node, localName)[0] || null
}

function ancestor(node, localName) {
	for (let current = node?.parentNode; current; current = current.parentNode) if (current.localName === localName) return current
	return null
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

function relationships(document) {
	return elements(document, 'Relationship').map(node => ({
		Id: node.getAttribute('Id'), Target: node.getAttribute('Target'), Type: node.getAttribute('Type'), TargetMode: node.getAttribute('TargetMode'),
	}))
}

function roleDefinitions(offset = 0) {
	return ROLES.map(role => ({
		name: `role-${role.key}`,
		type: role.type,
		idx: role.idx + offset,
		size: role.size,
		orient: role.orient,
		hasCustomPrompt: role.hasCustomPrompt,
		x: role.x,
		y: role.y,
		w: role.w,
		h: role.h,
		text: `${role.key} placeholder`,
	}))
}

function placeholderObjects(definitions) {
	return definitions.map(item => ({
		placeholder: {
			options: {
				name: item.name, type: item.type, idx: item.idx, sz: item.size,
				orient: item.orient, hasCustomPrompt: item.hasCustomPrompt,
				x: item.x, y: item.y, w: item.w, h: item.h,
			},
			text: item.text,
		},
	}))
}

function bootstrapSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Foundation placeholder-role native package proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'package-integrity reviewers', outcome: 'Freeze native placeholder-role lifecycle behavior.', remember: 'Seven physical roles, header/footer policy, and the slide-number field stay native and repair-free.' },
		visualDesign: { world: 'editorial', framing: 'placeholder-role atlas', tone: 'technical' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		theme: { name: 'Placeholder role proof', palette: ['F8FAFC', '0F172A', '2563EB', '059669', 'D97706'], fontFace: 'Aptos' },
		slides: [{ id: 'bootstrap', title: 'bootstrap', role: 'proof', message: 'bootstrap', layoutIntent: 'title-body', content: [{ kind: 'textBox', name: 'bootstrap', text: 'bootstrap' }] }],
	}
}

function defineCarrier(pptx, name, definitions, { master = false, reset = false } = {}) {
	const common = {
		headerFooter: reset ? null : { ...HEADER_FOOTER_ON },
		slideNumber: reset ? null : { ...SLIDE_NUMBER_PROPS },
	}
	if (master) {
		pptx.defineSlideMaster({ title: name, objects: placeholderObjects(definitions), ...common })
		const carrier = [...pptx.slideLayouts].reverse().find(item => item?._name === name)
		assert.ok(carrier, `native master carrier ${name} was not materialized`)
		carrier._betterpptxCarrierKind = 'master'
		return carrier
	}
	pptx.defineLayout({ name, width: 13.333333, height: 7.5, placeholders: definitions, ...common })
	const carrier = [...pptx.slideLayouts].reverse().find(item => item?._name === name)
	assert.ok(carrier, `native layout carrier ${name} was not materialized`)
	return carrier
}


function redefineCarrier(pptx, name, definitions, reset = false, { master = false } = {}) {
	if (master) {
		pptx.defineSlideMaster({
			title: name, placeholders: definitions,
			headerFooter: reset ? null : { ...HEADER_FOOTER_ON },
			slideNumber: reset ? null : { ...SLIDE_NUMBER_PROPS },
		})
		return
	}
	pptx.defineLayout({
		name, width: 13.333333, height: 7.5, placeholders: definitions,
		headerFooter: reset ? null : { ...HEADER_FOOTER_ON },
		slideNumber: reset ? null : { ...SLIDE_NUMBER_PROPS },
	})
}

function clearBootstrap(pptx) {
	pptx._slides = []
	pptx._sections = []
}

function addSlideAtlas(pptx, roles = ROLES) {
	const slide = pptx.addSlide(LAYOUT_NAME)
	// This verifier authors the native slide directly after bootstrap. Mirror the
	// engine's public slide.add bookkeeping so export_spec emits the exact
	// resource binding instead of treating the native layout as an unnamed import.
	slide._betterpptxLayoutName = LAYOUT_NAME
	slide.background = { color: 'F8FAFC' }
	for (const role of roles.filter(item => item.key !== 'media')) {
		const text = role.key === 'slidenum'
			? [{ text: '1', options: { field: { id: SLIDE_NUMBER_FIELD_ID, type: 'slidenum' }, fontFace: 'Aptos', fontSize: 11 } }]
			: `${role.key} slide carrier`
		slide.addText(text, {
			x: role.x, y: role.y, w: role.w, h: role.h,
			objectName: `slide-${role.key}`,
			fontFace: 'Aptos', fontSize: 12, color: '0F172A',
			placeholder: `role-${role.key}`,
			phType: role.type, phIdx: role.idx, phSz: role.size, phOrient: role.orient, phHasCustomPrompt: role.hasCustomPrompt,
		})
	}
	const media = roles.find(item => item.key === 'media')
	if (media) slide.addMedia({
		type: 'audio', data: WAV_DATA, extn: 'wav', cover: PNG_DATA,
		x: media.x, y: media.y, w: media.w, h: media.h,
		objectName: 'slide-media',
		placeholder: `role-${media.key}`,
		phType: media.type, phIdx: media.idx, phSz: media.size, phOrient: media.orient, phHasCustomPrompt: media.hasCustomPrompt,
		_authoredMediaSource: { kind: 'inline', data: WAV_DATA },
		_authoredMediaCover: { kind: 'inline', data: PNG_DATA },
	})
	if (media) {
		const mediaObject = objectByName(slide, 'slide-media')
		Object.assign(mediaObject.options, {
			placeholder: `role-${media.key}`, phType: media.type, phIdx: media.idx, phSz: media.size,
			phOrient: media.orient, phHasCustomPrompt: media.hasCustomPrompt,
		})
	}
	return slide
}

function objectByName(slide, name) {
	const matches = (slide._slideObjects || []).filter(item => item?.options?.objectName === name)
	assert.equal(matches.length, 1, `expected one native object ${name}`)
	return matches[0]
}

function bindSlideRoles(slide, offset = 0) {
	for (const role of ROLES) {
		const object = objectByName(slide, `slide-${role.key}`)
		Object.assign(object.options, {
			placeholder: `role-${role.key}`,
			phType: role.type, phIdx: role.idx + offset, phSz: role.size,
			phOrient: role.orient, phHasCustomPrompt: role.hasCustomPrompt,
		})
	}
}

function resetSlideRoles(slide) {
	for (const role of ROLES) {
		const object = objectByName(slide, `slide-${role.key}`)
		for (const key of [
			'phType', '_phType', '_placeholderType',
			'phIdx', '_phIdx', '_placeholderIdx',
			'phSz', '_phSz', '_placeholderSz',
			'phOrient', '_phOrient', '_placeholderOrient',
			'phHasCustomPrompt', '_phHasCustomPrompt', '_placeholderHasCustomPrompt',
			'placeholder',
		]) delete object.options[key]
	}
}

function expectedRoleTuples(offset = 0, excluded = []) {
	const omitted = new Set(excluded)
	return Object.fromEntries(ROLES.filter(role => !omitted.has(role.key)).map(role => [role.key, {
		type: role.type, idx: role.idx + offset, size: role.size,
		orient: role.orient, hasCustomPrompt: role.hasCustomPrompt,
	}]))
}

function placeholderTuple(shape) {
	const ph = firstDescendant(shape, 'ph')
	if (!ph) return null
	return {
		type: ph.getAttribute('type') || '',
		idx: ph.hasAttribute('idx') ? Number(ph.getAttribute('idx')) : 0,
		size: ph.getAttribute('sz') || 'full',
		orient: ph.getAttribute('orient') || 'horz',
		hasCustomPrompt: ['1', 'true'].includes(String(ph.getAttribute('hasCustomPrompt')).toLowerCase()),
	}
}

function topLevelShapes(document) {
	const spTree = firstDescendant(document, 'spTree')
	return elementChildren(spTree).filter(node => ['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'].includes(node.localName))
}

function shapeName(shape) {
	return firstDescendant(shape, 'cNvPr')?.getAttribute('name') || ''
}

function findShape(document, expectedName) {
	return topLevelShapes(document).find(shape => shapeName(shape) === expectedName) || null
}

function recordGap(blockers, code, operation) {
	try { operation() }
	catch (error) { blockers.push({ code, message: error.message }) }
}

function assertNamedTuples(document, prefix, expected, state, blockers, codePrefix, names = {}) {
	for (const [key, tuple] of Object.entries(expected)) {
		const expectedName = names[key] || `${prefix}${key}`
		recordGap(blockers, `${codePrefix}_${key.toUpperCase()}`, () => {
			const shape = findShape(document, expectedName)
			assert.ok(shape, `${state}: expected carrier ${expectedName}`)
			assert.deepEqual(placeholderTuple(shape), tuple, `${state}: exact p:ph tuple for ${expectedName}`)
		})
	}
}

function assertNoAuthoredHeaderPlaceholder(document, label) {
	const invalid = elements(document, 'ph').filter(node => ['hdr', 'header'].includes(node.getAttribute('type')))
	assert.equal(invalid.length, 0, `${label}: header must be represented by p:hf@hdr, never a physical p:ph carrier`)
}

function assertNoNamedPlaceholders(document, prefix, state, { shapesRemain = true } = {}) {
	for (const role of ROLES) {
		const shape = findShape(document, `${prefix}${role.key}`)
		if (!shapesRemain) {
			assert.ok(!shape, `${state}: reset must remove carrier shape ${prefix}${role.key}`)
			continue
		}
		assert.ok(shape, `${state}: reset must preserve editable shape ${prefix}${role.key}`)
		assert.equal(placeholderTuple(shape), null, `${state}: reset must remove p:ph from ${prefix}${role.key}`)
	}
}

function assertHf(document, expected, label) {
	const hf = elements(document, 'hf')[0] || null
	if (!expected) {
		assert.ok(!hf, `${label}: p:hf must be absent after null reset`)
		return
	}
	assert.ok(hf, `${label}: p:hf missing`)
	const attr = name => expected === 'office-default-true' ? (hf.getAttribute(name) || '1') : hf.getAttribute(name)
	if (expected === 'all-off') {
		assert.deepEqual({ sldNum: attr('sldNum'), hdr: attr('hdr'), ftr: attr('ftr'), dt: attr('dt') },
			{ sldNum: '0', hdr: '0', ftr: '0', dt: '0' }, `${label}: exact all-off p:hf reset policy`)
		return
	}
	assert.deepEqual({ sldNum: attr('sldNum'), hdr: attr('hdr'), ftr: attr('ftr'), dt: attr('dt') },
		{ sldNum: '1', hdr: '1', ftr: '1', dt: '1' }, `${label}: exact p:hf policy`)
}

function assertFields(document, label) {
	for (const field of elements(document, 'fld')) {
		assert.equal(field.getAttribute('type'), 'slidenum', `${label}: field type`)
		assert.match(field.getAttribute('id'), /^\{[0-9A-Fa-f-]{36}\}$/, `${label}: field GUID`)
		assert.deepEqual(elementChildren(field).map(node => node.localName), ['rPr', 't'], `${label}: field child order`)
	}
}

async function zipText(zip, name) {
	const entry = zip.file(name)
	return entry ? entry.async('string') : ''
}

function findCarrierPart(documents, carrierName) {
	const matches = [...documents.entries()].filter(([name, document]) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)
		&& elements(document, 'cSld')[0]?.getAttribute('name') === carrierName)
	assert.equal(matches.length, 1, `expected exactly one package carrier named ${carrierName}`)
	return matches[0]
}

async function inspectPackage(buffer, expectation, blockers) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels') || item === '[Content_Types].xml')) {
		documents.set(name, parseXmlStrict(await zipText(zip, name), `${expectation.state}:${name}`))
	}

	const relationshipIds = new Map()
	for (const relsPart of names.filter(name => name.endsWith('.rels'))) {
		const sourcePart = sourcePartForRelationships(relsPart)
		const rels = relationships(documents.get(relsPart))
		assert.equal(new Set(rels.map(rel => rel.Id)).size, rels.length, `${expectation.state}: duplicate relationship IDs in ${relsPart}`)
		for (const rel of rels) {
			if (rel.TargetMode === 'External') continue
			const target = resolveRelationshipTarget(sourcePart, rel.Target)
			assert.ok(nameSet.has(target), `${expectation.state}: dangling ${relsPart} ${rel.Id} -> ${target}`)
		}
		relationshipIds.set(sourcePart, new Set(rels.map(rel => rel.Id)))
	}
	for (const [sourcePart, document] of documents) {
		if (!sourcePart.endsWith('.xml') || sourcePart === '[Content_Types].xml') continue
		const ids = relationshipIds.get(sourcePart) || new Set()
		for (const node of Array.from(document.getElementsByTagName('*'))) {
			for (const attribute of Array.from(node.attributes || [])) {
				if (attribute.namespaceURI !== REL_NS && !String(attribute.name).startsWith('r:')) continue
				if (!attribute.value) continue
				assert.ok(ids.has(attribute.value), `${expectation.state}: ${sourcePart} carrier ${attribute.name}=${attribute.value} has no relationship`)
			}
		}
	}

	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${expectation.state}: [Content_Types].xml missing`)
	const defaults = new Set(elements(contentTypes, 'Default').map(node => node.getAttribute('Extension').toLowerCase()))
	const overrides = new Set(elements(contentTypes, 'Override').map(node => node.getAttribute('PartName').replace(/^\//, '')))
	for (const override of overrides) assert.ok(nameSet.has(override), `${expectation.state}: content-type override target missing ${override}`)
	for (const name of names) {
		if (name === '[Content_Types].xml') continue
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${expectation.state}: ${name} has no content type`)
	}

	const reachable = new Set()
	const queue = []
	for (const rel of relationships(documents.get('_rels/.rels'))) {
		if (rel.TargetMode === 'External') continue
		const target = resolveRelationshipTarget('', rel.Target)
		reachable.add(target); queue.push(target)
	}
	while (queue.length) {
		const sourcePart = queue.shift()
		const relDocument = documents.get(relationshipPartFor(sourcePart))
		if (!relDocument) continue
		for (const rel of relationships(relDocument)) {
			if (rel.TargetMode === 'External') continue
			const target = resolveRelationshipTarget(sourcePart, rel.Target)
			if (!reachable.has(target)) { reachable.add(target); queue.push(target) }
		}
	}
	const critical = names.filter(name => /^ppt\/(?:slideLayouts|slideMasters|theme|media)\//.test(name) && !name.endsWith('.rels'))
	for (const part of critical) assert.ok(reachable.has(part), `${expectation.state}: ownerless critical package part ${part}`)

	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name))
	const themeParts = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name))
	const mediaParts = names.filter(name => /^ppt\/media\//.test(name) && !name.endsWith('.rels'))
	assert.deepEqual({ layouts: layoutParts.length, masters: masterParts.length, themes: themeParts.length }, expectation.counts,
		`${expectation.state}: stable layout/master/theme carrier counts`)
	if (expectation.mediaCount !== undefined) assert.equal(mediaParts.length, expectation.mediaCount, `${expectation.state}: media orphan cleanup`)

	for (const part of [...layoutParts, ...masterParts, ...names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))]) {
		const ids = elements(documents.get(part), 'cNvPr').map(node => node.getAttribute('id')).filter(Boolean)
		assert.equal(ids.length, new Set(ids).size, `${expectation.state}: duplicate cNvPr IDs in ${part}`)
		assertFields(documents.get(part), `${expectation.state}:${part}`)
	}

	const [layoutPart, layoutDocument] = findCarrierPart(documents, LAYOUT_NAME)
	const [masterCarrierPart, masterCarrierDocument] = findCarrierPart(documents, MASTER_NAME)
	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
	assert.equal(slideParts.length, 1, `${expectation.state}: expected one slide`)
	const slidePart = slideParts[0]
	const slideDocument = documents.get(slidePart)
	assertNoAuthoredHeaderPlaceholder(layoutDocument, `${expectation.state}:layout`)
	assertNoAuthoredHeaderPlaceholder(masterCarrierDocument, `${expectation.state}:master-carrier`)
	assertNoAuthoredHeaderPlaceholder(slideDocument, `${expectation.state}:slide`)

	if (expectation.reset) {
		assertNoNamedPlaceholders(layoutDocument, 'Placeholder role-', `${expectation.state}:layout`, { shapesRemain: false })
		assertNoNamedPlaceholders(masterCarrierDocument, 'Placeholder role-', `${expectation.state}:master-carrier`, { shapesRemain: false })
		assertNoNamedPlaceholders(slideDocument, 'slide-', `${expectation.state}:slide`)
	} else {
		assertNamedTuples(layoutDocument, 'Placeholder role-', expectation.carrierTuples, `${expectation.state}:layout`, blockers, 'LAYOUT_PH')
		assertNamedTuples(masterCarrierDocument, 'Placeholder role-', expectation.carrierTuples, `${expectation.state}:master-carrier`, blockers, 'MASTER_PH')
		assertNamedTuples(slideDocument, 'slide-', expectation.slideTuples, `${expectation.state}:slide`, blockers, 'SLIDE_PH', expectation.slideNames)
	}
	assertHf(layoutDocument, expectation.hf, `${expectation.state}:layout`)
	assertHf(masterCarrierDocument, expectation.hf, `${expectation.state}:master-carrier`)
	for (const masterPart of masterParts) {
		recordGap(blockers, 'PHYSICAL_MASTER_HEADER_FOOTER_RESET', () => assertHf(documents.get(masterPart), expectation.masterHf, `${expectation.state}:${masterPart}`))
	}

	const slideFieldShape = findShape(slideDocument, expectation.slideNames?.slidenum || 'slide-slidenum')
	if (!expectation.deleted?.includes('slidenum')) {
		assert.ok(slideFieldShape, `${expectation.state}: slide-number field carrier missing`)
		const fields = elements(slideFieldShape, 'fld')
		assert.equal(fields.length, 1, `${expectation.state}: slide-number carrier must contain one a:fld`)
		assert.equal(fields[0].getAttribute('id'), SLIDE_NUMBER_FIELD_ID, `${expectation.state}: authored slide-number field GUID`)
	}
	for (const deleted of expectation.deleted || []) assert.ok(!findShape(slideDocument, `slide-${deleted}`), `${expectation.state}: deleted slide carrier ${deleted} remains`)

	const slideRels = relationships(documents.get(relationshipPartFor(slidePart)))
	const layoutRel = slideRels.find(rel => rel.Type.endsWith('/slideLayout'))
	assert.ok(layoutRel, `${expectation.state}: slide has no slideLayout relationship`)
	assert.equal(resolveRelationshipTarget(slidePart, layoutRel.Target), layoutPart, `${expectation.state}: slide must remain bound to ${LAYOUT_NAME}`)

	const privateText = (await Promise.all(names.filter(name => name.endsWith('.xml') || name.endsWith('.rels')).map(name => zipText(zip, name)))).join('\n')
	assert.doesNotMatch(privateText, /(?:[A-Za-z]:\\|file:\/\/|\/Users\/|\/home\/|\.codex(?:\/|\\)|node_modules(?:\/|\\))/i, `${expectation.state}: private path leaked into package`)

	return {
		state: expectation.state,
		sha256: sha256(buffer),
		parts: names.length,
		carrierParts: { layout: layoutPart, masterAuthoringCarrier: masterCarrierPart, physicalMasters: masterParts },
		counts: { layouts: layoutParts.length, masters: masterParts.length, themes: themeParts.length, media: mediaParts.length },
		fields: [...documents.entries()].filter(([name]) => /^(?:ppt\/(?:slides|slideLayouts|slideMasters)\/)/.test(name)).reduce((sum, [, document]) => sum + elements(document, 'fld').length, 0),
	}
}

function assertNoPrivateLeakage(spec) {
	const leaked = []
	const visit = (value, valuePath) => {
		if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${valuePath}[${index}]`))
		if (!value || typeof value !== 'object') return
		for (const [key, child] of Object.entries(value)) {
			if (key.startsWith('_') || ['rawPackageParts', 'rawPresentationFonts'].includes(key)) leaked.push(`${valuePath}.${key}`)
			visit(child, `${valuePath}.${key}`)
		}
	}
	visit(spec, 'spec')
	assert.deepEqual(leaked, [], `exported spec leaked private fields: ${leaked.join(', ')}`)
	assert.doesNotMatch(JSON.stringify(spec), /(?:[A-Za-z]:\\|file:\/\/|\/Users\/|\/home\/|\.codex(?:\/|\\)|node_modules(?:\/|\\))/i, 'exported spec leaked private path')
}

function assertExportedDefinitions(spec) {
	const layout = (spec.layouts || []).find(item => item.name === LAYOUT_NAME)
	const master = (spec.masters || []).find(item => item.title === MASTER_NAME)
	assert.ok(layout, `current-spec export missing layout ${LAYOUT_NAME}`)
	assert.ok(master, `current-spec export missing master ${MASTER_NAME}`)
	const semanticType = type => ({ subTitle: 'subtitle', dt: 'date', ftr: 'footer', sldNum: 'slideNum', hdr: 'header' }[type] || type)
	for (const [label, carrier] of [['layout', layout], ['master', master]]) {
		assert.deepEqual((carrier.placeholders || []).map(item => ({ name: item.name, type: item.type, idx: item.idx })),
			roleDefinitions().map(item => ({ name: item.name, type: semanticType(item.type), idx: item.idx })), `${label}: canonical semantic placeholder readback`)
		assert.deepEqual(carrier.headerFooter, HEADER_FOOTER_ON, `${label}: header/footer readback`)
		assert.ok(carrier.slideNumber, `${label}: slide-number properties readback`)
	}
	const slideBlocks = spec.slides.flatMap(slide => slide.content || [])
	assert.ok(!slideBlocks.some(item => item.name === 'slide-header' || item.objectName === 'slide-header'),
		'current-spec export must not contain a physical slide header carrier')
	for (const role of ROLES) {
		const block = slideBlocks.find(item => item.name === `slide-${role.key}` || item.objectName === `slide-${role.key}`)
		assert.ok(block, `current-spec export missing slide-${role.key}`)
		const placeholder = block.placeholderBinding || block.placeholder || block.pictureAdjuncts?.placeholder || block.mediaOptions?.placeholder
		assert.deepEqual(placeholder && { type: placeholder.type, idx: placeholder.idx }, { type: semanticType(role.type), idx: role.idx },
			`current-spec export placeholder binding for slide-${role.key}`)
	}
}

function portableSpec(value) {
	const visit = item => {
		if (Array.isArray(item)) return item.map(visit)
		if (!item || typeof item !== 'object') return item
		const out = {}
		for (const [key, child] of Object.entries(item)) {
			if (key.startsWith('_') || ['nativePackagePreservation', 'nativePreservation', 'preservationHandle', 'editHandle', 'rawPackageParts', 'rawPresentationFonts'].includes(key)) continue
			if (key === 'kind' && child === 'opaqueNative') continue
			if (['altText', 'accessibilityTitle'].includes(key) && child === '') continue
			out[key] = visit(child)
		}
		return out
	}
	const cloned = visit(value)
	cloned.slides = (cloned.slides || []).map(slide => ({
		...slide,
		content: (slide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
			if (block.altText !== undefined || !Array.isArray(block.text)) return block
			const text = block.text.map(run => typeof run === 'string' ? run : run?.text || '').join('').trim()
			return text ? { ...block, altText: text } : block
		}),
	}))
	return cloned
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
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

function normalizeOfficeSnapshot(snapshot) {
	return JSON.parse(JSON.stringify(snapshot))
}

function officeLayout(snapshot, name) {
	return (snapshot.CustomLayouts || []).find(item => item.Name === name || item.MatchingName === name) || null
}

function officeShape(container, name) {
	return (container?.Shapes || []).find(item => item.Name === name || item.Name === `Placeholder ${name}`) || null
}

function assertOfficeSnapshot(snapshot, label, blockers, roles = ROLES) {
	assert.equal(snapshot.SlideCount, 1, `${label}: slide count`)
	const slide = snapshot.Slides[0]
	assert.equal(slide.LayoutName, LAYOUT_NAME, `${label}: slide layout binding`)
	const layout = officeLayout(snapshot, LAYOUT_NAME)
	const masterCarrier = officeLayout(snapshot, MASTER_NAME)
	assert.ok(layout, `${label}: custom layout ${LAYOUT_NAME}`)
	assert.ok(masterCarrier, `${label}: authored master carrier ${MASTER_NAME}`)
	for (const role of roles) {
		for (const [scope, carrier, name] of [
			['layout', layout, `role-${role.key}`],
			['master-carrier', masterCarrier, `role-${role.key}`],
			['slide', slide, `slide-${role.key}`],
		]) {
			recordGap(blockers, `OFFICE_${scope.toUpperCase()}_${role.key.toUpperCase()}`, () => {
				const shape = officeShape(carrier, name)
				assert.ok(shape, `${label}: ${scope} COM shape ${name}`)
				assert.equal(Number(shape.PlaceholderType), role.comType, `${label}: ${scope} COM PlaceholderFormat.Type for ${name}`)
			})
		}
	}
	return { layoutShapes: layout.Shapes.length, masterCarrierShapes: masterCarrier.Shapes.length, slideShapes: slide.Shapes.length }
}

async function runOfficeProof(inputPath, outputPath, reportPath, blockers, roles = ROLES) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'PowerPoint COM requires Windows.' }
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-foundation-placeholder-roles-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
	], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 180000, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS')
	assert.equal(report.method, 'Presentations.Open2007')
	assert.equal(report.openAndRepair, false)
	assert.equal(report.saveCopyAs, true)
	assert.equal(report.reopened, true)
	const source = assertOfficeSnapshot(report.source, 'PowerPoint source', blockers, roles)
	const roundtrip = assertOfficeSnapshot(report.roundtrip, 'PowerPoint roundtrip', blockers, roles)
	assert.deepEqual(roundtrip, source, 'PowerPoint role carrier counts changed after SaveCopyAs/reopen')
	assert.deepEqual(normalizeOfficeSnapshot(report.roundtrip), normalizeOfficeSnapshot(report.source), 'PowerPoint semantic snapshot changed after SaveCopyAs/reopen')
	return report
}

export async function runFoundationPlaceholderRolesProof({ outputDir, office = false, allowBlockers = false } = {}) {
	assert.equal(FOUNDATION_PLACEHOLDER_ROWS.length, 9)
	assert.equal(new Set(FOUNDATION_PLACEHOLDER_ROWS.map(([id]) => id)).size, 9)
	assert.equal(ROLES.length, 7)
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-foundation-placeholder-roles-'))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const blockers = []
	const lifecycle = []
	const artifacts = {}
	const counts = { layouts: 3, masters: 1, themes: 1 }
	const { createMcpToolDispatcher, getDeck, handleDeleteShapesForTest } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `foundation-placeholder-roles-${Date.now()}`,
		clientInfo: { name: 'foundation-placeholder-package-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true,
	})
	const committed = unwrap('bootstrap commit', await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: bootstrapSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
	}))
	const entry = getDeck(committed.deckId)
	const pptx = entry.pptx
	clearBootstrap(pptx)
	defineCarrier(pptx, LAYOUT_NAME, roleDefinitions())
	defineCarrier(pptx, MASTER_NAME, roleDefinitions(), { master: true })
	entry.authoredLayouts = [{ name: LAYOUT_NAME }]
	entry.authoredMasters = [{ title: MASTER_NAME }]
	pptx.layout = LAYOUT_NAME
	const slide = addSlideAtlas(pptx)

	const writeState = async (state, expectation) => {
		process.stderr.write(`[foundation-placeholder-proof] serializing ${state}\n`)
		const buffer = await pptxBuffer(entry)
		process.stderr.write(`[foundation-placeholder-proof] inspecting ${state}\n`)
		const file = path.join(resolvedOutput, `foundation-placeholder-roles-${state}.pptx`)
		await fs.writeFile(file, buffer)
		const inspection = await inspectPackage(buffer, { state, counts, ...expectation }, blockers)
		lifecycle.push(inspection)
		artifacts[state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
		return { buffer, file, inspection }
	}

	await writeState('initial', {
		carrierTuples: expectedRoleTuples(), slideTuples: expectedRoleTuples(), hf: true, masterHf: true, mediaCount: 2,
	})

	redefineCarrier(pptx, LAYOUT_NAME, roleDefinitions(10))
	redefineCarrier(pptx, MASTER_NAME, roleDefinitions(10), false, { master: true })
	bindSlideRoles(slide, 10)
	await writeState('updated', {
		carrierTuples: expectedRoleTuples(10), slideTuples: expectedRoleTuples(10), hf: true, masterHf: true, mediaCount: 2,
	})

	redefineCarrier(pptx, LAYOUT_NAME, [], true)
	redefineCarrier(pptx, MASTER_NAME, [], true, { master: true })
	resetSlideRoles(slide)
	await writeState('reset', { reset: true, hf: false, masterHf: 'all-off', mediaCount: 2 })

	redefineCarrier(pptx, LAYOUT_NAME, roleDefinitions())
	redefineCarrier(pptx, MASTER_NAME, roleDefinitions(), false, { master: true })
	bindSlideRoles(slide)
	const reedited = await writeState('reedited', {
		carrierTuples: expectedRoleTuples(), slideTuples: expectedRoleTuples(), hf: true, masterHf: true, mediaCount: 2,
	})

	const exported = unwrap('current-spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
	recordGap(blockers, 'EXPORT_PRIVATE_LEAKAGE', () => assertNoPrivateLeakage(exported.spec))
	recordGap(blockers, 'EXPORT_PLACEHOLDER_READBACK', () => assertExportedDefinitions(exported.spec))
	const exportedPath = path.join(resolvedOutput, 'foundation-placeholder-roles-exported-spec.json')
	await fs.writeFile(exportedPath, `${JSON.stringify(exported.spec, null, 2)}\n`, 'utf8')
	const portable = portableSpec(exported.spec)
	const portablePath = path.join(resolvedOutput, 'foundation-placeholder-roles-portable-spec.json')
	await fs.writeFile(portablePath, `${JSON.stringify(portable, null, 2)}\n`, 'utf8')
	artifacts.exportedSpec = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }
	artifacts.portableSpec = { file: relative(portablePath), sha256: sha256(await fs.readFile(portablePath)) }

	try {
		const replay = unwrap('current-spec recompile', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: portable, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		const replayEntry = getDeck(replay.deckId)
		const replayBuffer = await pptxBuffer(replayEntry)
		const replayPath = path.join(resolvedOutput, 'foundation-placeholder-roles-recompiled.pptx')
		await fs.writeFile(replayPath, replayBuffer)
		const replaySlideNames = Object.fromEntries(ROLES.map(role => [
			role.key,
			role.key === 'media' ? 'slide-media' : `slide-1.slide-${role.key}.textBox`,
		]))
		lifecycle.push(await inspectPackage(replayBuffer, {
			state: 'recompiled', counts, carrierTuples: expectedRoleTuples(), slideTuples: expectedRoleTuples(), slideNames: replaySlideNames,
			hf: true, masterHf: true, mediaCount: 2,
		}, blockers))
		artifacts.recompiled = { file: relative(replayPath), bytes: replayBuffer.length, sha256: sha256(replayBuffer) }
	} catch (error) {
		blockers.push({ code: 'CURRENT_SPEC_RECOMPILE', message: error.message })
	}

	let officeResult = { status: 'dependency-gated', reason: 'Set BETTERPPTX_FOUNDATION_PLACEHOLDER_OFFICE=1 to run PowerPoint Open2007/SaveCopyAs/reopen.' }
	if (office) {
		const roundtripPath = path.join(resolvedOutput, 'foundation-placeholder-roles-reedited-savecopyas.pptx')
		const officeReportPath = path.join(resolvedOutput, 'foundation-placeholder-roles-office-com.json')
		try {
			officeResult = await runOfficeProof(reedited.file, roundtripPath, officeReportPath, blockers)
			const roundtripBuffer = await fs.readFile(roundtripPath)
			officeResult.package = await inspectPackage(roundtripBuffer, {
				state: 'powerpoint-roundtrip', counts: { ...counts, themes: 2 }, carrierTuples: expectedRoleTuples(), slideTuples: expectedRoleTuples(), hf: 'office-default-true', masterHf: 'office-default-true', mediaCount: 2,
			}, blockers)
			officeResult.roundtripFile = relative(roundtripPath)
			officeResult.roundtripSha256 = sha256(roundtripBuffer)
			officeResult.reportFile = relative(officeReportPath)
			artifacts.officeRoundtrip = { file: relative(roundtripPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
		} catch (error) {
			let failureReport = null
			try { failureReport = JSON.parse(await fs.readFile(officeReportPath, 'utf8')) } catch {}
			officeResult = { status: 'FAIL', reportFile: relative(officeReportPath), failure: failureReport || { message: error.message } }
			blockers.push({
				code: 'OFFICE_OPEN2007_SEVEN_ROLE_ATLAS',
				message: `${failureReport?.stage || 'PowerPoint'}: ${failureReport?.message || error.message}`,
			})
		}
	}

	for (const name of ['slide-media', 'slide-slidenum', 'slide-footer']) {
		await handleDeleteShapesForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: name } })
	}
	const deleted = await writeState('deleted', {
		carrierTuples: expectedRoleTuples(), slideTuples: expectedRoleTuples(0, ['media', 'slidenum', 'footer']), hf: true, masterHf: true,
		mediaCount: 0, deleted: ['media', 'slidenum', 'footer'],
	})

	const finalAudit = await runPackageAudit(reedited.file)
	const deletedAudit = await runPackageAudit(deleted.file)
	let roundtripAudit = null
	if (officeResult.status === 'PASS') roundtripAudit = await runPackageAudit(path.resolve(workspaceRoot, officeResult.roundtripFile))

	const dedupedBlockers = [...new Map(blockers.map(item => [`${item.code}:${item.message}`, item])).values()]
	const status = dedupedBlockers.length
		? 'FOUNDATION_PLACEHOLDER_ROLES_PRODUCTION_BLOCKED'
		: (officeResult.status === 'PASS' ? 'FOUNDATION_PLACEHOLDER_ROLES_PACKAGE_AND_OFFICE_VERIFIED' : 'FOUNDATION_PLACEHOLDER_ROLES_PACKAGE_VERIFIED_OFFICE_GATED')
	const result = {
		schemaVersion: 'betterpptx.foundation-placeholder-roles-unit-proof.v1',
		unitId: FOUNDATION_PLACEHOLDER_UNIT_ID,
		status,
		rows: FOUNDATION_PLACEHOLDER_ROWS.map(([id, label]) => ({ id, label })),
		roles: ROLES.map(role => ({ key: role.key, type: role.type, idx: role.idx, comType: role.comType })),
		checks: {
			xmlParseAndOpcClosure: true,
			relationshipAndContentTypeClosure: true,
			exactPlaceholderTuples: !dedupedBlockers.some(item => /_PH_/.test(item.code)),
			headerFooterAndSlideNumberFields: !dedupedBlockers.some(item => item.code.includes('HEADER_FOOTER')),
			stableCarrierCounts: true,
			exportRecompile: Boolean(artifacts.recompiled),
			resetReeditDelete: true,
			mediaOrphanCleanup: deleted.inspection.counts.media === 0,
			powerPointOpen2007SaveCopyAsReopen: officeResult.status === 'PASS',
		},
		blockers: dedupedBlockers,
		lifecycle,
		packageAudits: { reedited: finalAudit, deleted: deletedAudit, ...(roundtripAudit ? { roundtrip: roundtripAudit } : {}) },
		office: officeResult,
		artifacts,
	}
	if (dedupedBlockers.length && !allowBlockers) {
		const error = new Error(`${dedupedBlockers[0].code}: ${dedupedBlockers[0].message}`)
		error.code = status
		error.details = result
		throw error
	}
	return result
}

async function main() {
	const outputDir = process.env.BETTERPPTX_FOUNDATION_PLACEHOLDER_OUTPUT
		? path.resolve(process.env.BETTERPPTX_FOUNDATION_PLACEHOLDER_OUTPUT)
		: path.join(workspaceRoot, 'validation-output', 'foundation-placeholder-roles-unit', timestamp())
	const office = process.env.BETTERPPTX_FOUNDATION_PLACEHOLDER_OFFICE === '1' || process.argv.includes('--office')
	const allowBlockers = process.env.BETTERPPTX_FOUNDATION_PLACEHOLDER_ALLOW_BLOCKERS === '1' || process.argv.includes('--allow-blockers')
	await fs.mkdir(outputDir, { recursive: true })
	try {
		const result = await runFoundationPlaceholderRolesProof({ outputDir, office, allowBlockers })
		const proofPath = path.join(outputDir, 'foundation-placeholder-roles-unit-proof.json')
		const proof = { ...result, proofPath: relative(proofPath) }
		await fs.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
		console.log(JSON.stringify(proof, null, 2))
	} catch (error) {
		const proofPath = path.join(outputDir, 'foundation-placeholder-roles-unit-proof.json')
		const failure = {
			...(error.details || {}),
			status: error.code || 'FOUNDATION_PLACEHOLDER_ROLES_PROOF_FAILED',
			failure: error.message,
			proofPath: relative(proofPath),
		}
		await fs.writeFile(proofPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8')
		console.error(JSON.stringify(failure, null, 2))
		process.exitCode = 1
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) await main()
