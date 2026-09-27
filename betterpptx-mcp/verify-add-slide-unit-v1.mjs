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
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(moduleDir, '..')
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const CONTENT_TYPES = Object.freeze({
	slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
	layout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
	master: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
	notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
	notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
	theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
})
const NAMES = Object.freeze({ master: 'AddSlideMaster', alpha: 'AddSlideAlpha', beta: 'AddSlideBeta' })

export const ADD_SLIDE_UNIT_ID = 'impl-b-7291f4091e2c2f56'
export const ADD_SLIDE_ROWS = Object.freeze([
	Object.freeze({ id: 'cap_d3e8dd4cef35a9b5dc30', label: 'add slide' }),
])

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const relative = file => path.relative(workspaceRoot, file).replaceAll(path.sep, '/')
const timestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

function dataOf(label, result) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function parseXml(xml, label) {
	const errors = []
	const document = new DOMParser({
		errorHandler: {
			warning: message => errors.push(`warning: ${message}`),
			error: message => errors.push(`error: ${message}`),
			fatalError: message => errors.push(`fatal: ${message}`),
		},
	}).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label}: XML parse errors`)
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
		id: node.getAttribute('Id'), type: node.getAttribute('Type'), target: node.getAttribute('Target'), mode: node.getAttribute('TargetMode'),
	}))
}

function relationshipId(node) {
	return node?.getAttribute('r:id') || node?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''
}

function relationshipPartFor(partName) {
	return path.posix.join(path.posix.dirname(partName), '_rels', `${path.posix.basename(partName)}.rels`)
}

function sourcePartForRelationships(relName) {
	if (relName === '_rels/.rels') return ''
	return path.posix.join(path.posix.dirname(path.posix.dirname(relName)), path.posix.basename(relName, '.rels'))
}

function resolveTarget(sourcePart, target) {
	return path.posix.normalize(path.posix.join(sourcePart ? path.posix.dirname(sourcePart) : '', String(target || '').replace(/^\/+/, '')))
}

function numericPartSort(a, b) {
	return Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0)
}

function assertChildOrder(node, orderedNames, label) {
	const actual = children(node?.documentElement || node).map(item => item.localName)
	let previous = -1
	for (const name of orderedNames) {
		const index = actual.indexOf(name)
		if (index < 0) continue
		assert.ok(index > previous, `${label}: ${name} is out of schema order (${actual.join(', ')})`)
		previous = index
	}
}

function baseMetadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove native slide lifecycle safety', remember: 'slide identity, order, layout, notes, and policy remain closed' },
		visualDesign: { world: 'blueprint', framing: 'native add-slide proof', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
	}
}

function fixedObjects(prefix, color) {
	return [
		{ rect: { x: 0.18, y: 0.18, w: 0.16, h: 7.0, objectName: `${prefix}-rail`, fill: { color }, line: { color } } },
		{ text: { text: prefix.toUpperCase(), options: { x: 11.2, y: 7.08, w: 1.8, h: 0.2, objectName: `${prefix}-label`, fontFace: 'Arial', fontSize: 7, color } } },
	]
}

function layoutDefinition(name, color, activate = false) {
	return {
		name, width: 13.333333, height: 7.5, type: 'wide', activate, masterName: NAMES.master,
		objects: fixedObjects(name.toLowerCase(), color), background: null, margin: 0.3,
		placeholders: [{ name: 'titleSlot', type: 'title', idx: 0, size: 'full', orient: 'horz', hasCustomPrompt: false, x: 0.85, y: 0.7, w: 11.6, h: 1.1, margin: 0 }],
	}
}

function slideSpec(id, title, layoutName, options = {}) {
	return {
		id, title, layoutIntent: 'title-only', layoutName, masterName: NAMES.master,
		...(Object.prototype.hasOwnProperty.call(options, 'hidden') ? { hidden: options.hidden } : {}),
		...(Object.prototype.hasOwnProperty.call(options, 'showMasterShapes') ? { showMasterShapes: options.showMasterShapes } : {}),
		...(Object.prototype.hasOwnProperty.call(options, 'transition') ? { transition: options.transition } : {}),
		...(Object.prototype.hasOwnProperty.call(options, 'notes') ? { notes: options.notes } : {}),
		content: [{
			kind: 'textBox', name: `${id}-sentinel`, role: 'title', text: title, altText: `${id} lifecycle sentinel`,
			placeholderBinding: { name: 'titleSlot', type: 'title', idx: 0, size: 'full', orient: 'horz', hasCustomPrompt: false },
		}],
	}
}

function initialSpec() {
	return {
		...baseMetadata('Add slide native lifecycle proof'),
		theme: { name: 'Add Slide Proof Theme', headFontFace: 'Arial', bodyFontFace: 'Calibri', fontFace: 'Calibri', lang: 'en-US', colorScheme: { dk1: '111827', lt1: 'F8FAFC', dk2: '1E293B', lt2: 'E2E8F0', accent1: '0284C7', accent2: '7C3AED', accent3: '16A34A', accent4: 'EA580C', accent5: 'DB2777', accent6: '0891B2', hlink: '0563C1', folHlink: '954F72' } },
		masters: [{ title: NAMES.master, name: NAMES.master, background: 'F8FAFC', objects: fixedObjects('master', '0F766E'), placeholders: null }],
		layouts: [layoutDefinition(NAMES.alpha, '0284C7', true), layoutDefinition(NAMES.beta, '7C3AED')],
		layoutContract: { allowedLayouts: [NAMES.alpha, NAMES.beta], defaultLayout: NAMES.alpha, strictLayout: true },
		slides: [
			slideSpec('alpha', 'ALPHA ORIGINAL', NAMES.alpha, { hidden: false, showMasterShapes: true, transition: { type: 'fade' }, notes: 'Alpha authored notes.' }),
			slideSpec('beta', 'BETA ORIGINAL', NAMES.beta, { hidden: true, showMasterShapes: false, transition: { type: 'push' }, notes: 'Beta authored notes.' }),
			slideSpec('gamma', 'GAMMA ORIGINAL', NAMES.alpha, { hidden: false, showMasterShapes: true, notes: 'Gamma authored notes.' }),
		],
	}
}

function patchEnvelope(title, slides = [], edits = undefined) {
	return { ...baseMetadata(title), slides, ...(edits ? { edits } : {}) }
}

function appendSpec() {
	const slide = slideSpec('epsilon', 'EPSILON APPENDED', NAMES.beta, {
		hidden: false, showMasterShapes: true, transition: { type: 'wipe' }, notes: 'Epsilon appended notes.',
	})
	slide.content[0].editHandle = 'epsilon-title-edit'
	return {
		...baseMetadata('Append epsilon slide'),
		slides: [slide],
	}
}

function policyPatch(slideIndex, id, values) {
	return patchEnvelope(`Patch ${id}`, [{ id, slideIndex, layoutIntent: 'title-only', content: [], ...values }])
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

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function writeArtifact(outputDir, name, bytes, artifacts) {
	const file = path.join(outputDir, name)
	await fs.writeFile(file, bytes, { flag: 'wx' })
	artifacts[name] = { file: relative(file), bytes: bytes.length, sha256: sha256(bytes) }
	return file
}

function normalizeCoreProperties(bytes) {
	const document = parseXml(bytes.toString('utf8'), 'stable-package/docProps/core.xml')
	for (const localName of ['created', 'modified']) {
		for (const node of elements(document, localName)) {
			while (node.firstChild) node.removeChild(node.firstChild)
			node.appendChild(document.createTextNode('2000-01-01T00:00:00Z'))
		}
	}
	return Buffer.from(new XMLSerializer().serializeToString(document), 'utf8')
}

async function stableMemberDiff(beforeBuffer, afterBuffer) {
	const [beforeZip, afterZip] = await Promise.all([JSZip.loadAsync(beforeBuffer, { checkCRC32: true }), JSZip.loadAsync(afterBuffer, { checkCRC32: true })])
	const beforeNames = Object.keys(beforeZip.files).filter(name => !beforeZip.files[name].dir).sort()
	const afterNames = Object.keys(afterZip.files).filter(name => !afterZip.files[name].dir).sort()
	if (JSON.stringify(beforeNames) !== JSON.stringify(afterNames)) return { changed: [{ name: '[package inventory]', before: beforeNames, after: afterNames }], stableMemberCount: beforeNames.length }
	const changed = []
	for (const name of beforeNames) {
		let [before, after] = await Promise.all([beforeZip.file(name).async('nodebuffer'), afterZip.file(name).async('nodebuffer')])
		if (name === 'docProps/core.xml') { before = normalizeCoreProperties(before); after = normalizeCoreProperties(after) }
		if (!before.equals(after)) changed.push({ name, beforeSha256: sha256(before), afterSha256: sha256(after) })
	}
	return { changed, stableMemberCount: beforeNames.length }
}

async function inspectPackage(buffer, label, expectation = {}) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) documents.set(name, parseXml(await zip.file(name).async('string'), `${label}/${name}`))
	for (const [name, document] of documents) {
		if (!name.endsWith('.rels')) continue
		const rels = relationshipRecords(document)
		assert.equal(new Set(rels.map(rel => rel.id)).size, rels.length, `${label}/${name}: duplicate relationship IDs`)
		const source = sourcePartForRelationships(name)
		for (const rel of rels.filter(item => item.mode !== 'External')) assert.ok(nameSet.has(resolveTarget(source, rel.target)), `${label}/${name}: dangling ${rel.id}`)
	}
	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${label}: [Content_Types].xml missing`)
	const defaults = new Set(elements(contentTypes, 'Default').map(node => node.getAttribute('Extension').toLowerCase()))
	const overrides = new Map(elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const [part] of overrides) assert.ok(nameSet.has(part), `${label}: orphan content-type override ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: ${name} lacks a content type`)
	}
	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericPartSort)
	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(numericPartSort)
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort(numericPartSort)
	const notesParts = names.filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).sort(numericPartSort)
	const notesMasters = names.filter(name => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(name)).sort(numericPartSort)
	const themeParts = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort(numericPartSort)
	assert.equal(slideParts.length, expectation.slideCount, `${label}: slide count`)
	assert.ok(layoutParts.length >= 2, `${label}: named layouts`)
	assert.equal(masterParts.length, 1, `${label}: one authored physical master`)
	assert.ok(themeParts.length >= 1, `${label}: theme parts`)
	assert.equal(notesParts.length, slideParts.length, `${label}: always-on notes part per slide`)
	assert.equal(notesMasters.length, 1, `${label}: exactly one notes master`)
	for (const [parts, type] of [[slideParts, CONTENT_TYPES.slide], [layoutParts, CONTENT_TYPES.layout], [masterParts, CONTENT_TYPES.master], [notesParts, CONTENT_TYPES.notesSlide], [notesMasters, CONTENT_TYPES.notesMaster], [themeParts, CONTENT_TYPES.theme]]) {
		for (const part of parts) assert.equal(overrides.get(part), type, `${label}: content type for ${part}`)
	}
	const relsFor = part => relationshipRecords(documents.get(relationshipPartFor(part)))
	const presentationPart = 'ppt/presentation.xml'
	const presentation = documents.get(presentationPart)
	const presentationRels = relsFor(presentationPart)
	const slideRels = presentationRels.filter(rel => rel.type === `${REL_BASE}slide`)
	assert.equal(slideRels.length, slideParts.length, `${label}: presentation slide relationship count`)
	const sldIds = elements(presentation, 'sldId')
	assert.equal(sldIds.length, slideParts.length, `${label}: p:sldId list count`)
	const numericIds = sldIds.map(node => Number(node.getAttribute('id')))
	assert.equal(new Set(numericIds).size, numericIds.length, `${label}: unique p:sldId identities`)
	assert.ok(numericIds.every(id => Number.isInteger(id) && id >= 256), `${label}: legal p:sldId range`)
	const orderedSlideParts = sldIds.map(node => {
		const rid = relationshipId(node)
		const rel = slideRels.find(item => item.id === rid)
		assert.ok(rel, `${label}: p:sldId ${rid} lacks a relationship`)
		return resolveTarget(presentationPart, rel.target)
	})
	assert.deepEqual([...orderedSlideParts].sort(), [...slideParts].sort(), `${label}: slide list/relationship/part closure`)
	const layoutNames = new Map(layoutParts.map(part => [part, elements(documents.get(part), 'cSld')[0]?.getAttribute('name') || '']))
	const allOwnedNotes = new Set()
	const slides = []
	for (let index = 0; index < orderedSlideParts.length; index++) {
		const part = orderedSlideParts[index]
		const document = documents.get(part)
		assertChildOrder(document, ['cSld', 'clrMapOvr', 'transition', 'timing', 'extLst'], `${label}/${part}`)
		const rels = relsFor(part)
		const layouts = rels.filter(rel => rel.type === `${REL_BASE}slideLayout`).map(rel => resolveTarget(part, rel.target))
		assert.equal(layouts.length, 1, `${label}/${part}: exactly one slideLayout edge`)
		assert.ok(layoutParts.includes(layouts[0]), `${label}/${part}: layout target exists`)
		const noteTargets = rels.filter(rel => rel.type === `${REL_BASE}notesSlide`).map(rel => resolveTarget(part, rel.target))
		assert.equal(noteTargets.length, 1, `${label}/${part}: exactly one notesSlide edge`)
		assert.ok(notesParts.includes(noteTargets[0]), `${label}/${part}: notesSlide target exists`)
		assert.equal(allOwnedNotes.has(noteTargets[0]), false, `${label}: notesSlide shared by two slides`)
		allOwnedNotes.add(noteTargets[0])
		const noteRels = relsFor(noteTargets[0])
		assert.deepEqual(noteRels.filter(rel => rel.type === `${REL_BASE}slide`).map(rel => resolveTarget(noteTargets[0], rel.target)), [part], `${label}/${noteTargets[0]}: reverse owning slide edge`)
		assert.equal(noteRels.filter(rel => rel.type === `${REL_BASE}notesMaster`).length, 1, `${label}/${noteTargets[0]}: exactly one notes master edge`)
		const cNvPrIds = elements(document, 'cNvPr').map(node => Number(node.getAttribute('id')))
		assert.equal(new Set(cNvPrIds).size, cNvPrIds.length, `${label}/${part}: unique cNvPr ids`)
		assert.ok(cNvPrIds.every(id => Number.isInteger(id) && id > 0), `${label}/${part}: legal cNvPr ids`)
		const namesOnSlide = elements(document, 'cNvPr').map(node => node.getAttribute('name')).filter(Boolean)
		const text = elements(document, 't').map(node => node.textContent || '').join('\n')
		const notesText = elements(documents.get(noteTargets[0]), 't').map(node => node.textContent || '').join('\n')
		const transition = directChild(document.documentElement, 'transition')
		slides.push({
			index, part, pSldId: numericIds[index], hidden: document.documentElement.getAttribute('show') === '0', layoutName: layoutNames.get(layouts[0]),
			showMasterShapes: document.documentElement.getAttribute('showMasterSp') !== '0', hasTransition: Boolean(transition),
			transitionKind: transition ? children(transition)[0]?.localName || '' : '', names: namesOnSlide, text, notesText,
		})
	}
	assert.deepEqual([...allOwnedNotes].sort(), [...notesParts].sort(), `${label}: no orphan notesSlide parts`)
	if (expectation.order) {
		assert.deepEqual(slides.map(slide => expectation.order.find(id => slide.text.includes(expectation.titles?.[id] || `${id.toUpperCase()} `)) || null), expectation.order, `${label}: semantic slide order`)
	}
	if (expectation.layouts) assert.deepEqual(slides.map(slide => slide.layoutName), expectation.layouts, `${label}: layout bindings`)
	if (expectation.hidden) assert.deepEqual(slides.map(slide => slide.hidden), expectation.hidden, `${label}: hidden carriers`)
	if (expectation.masterShapes) assert.deepEqual(slides.map(slide => slide.showMasterShapes), expectation.masterShapes, `${label}: showMasterSp carriers`)
	if (expectation.transition) assert.deepEqual(slides.map(slide => slide.hasTransition), expectation.transition, `${label}: transition carriers`)
	for (const [id, text] of Object.entries(expectation.notes || {})) {
		const slide = slides.find(item => item.text.includes(expectation.titles?.[id] || `${id.toUpperCase()} `))
		assert.ok(slide?.notesText.includes(text), `${label}: ${id} notes text; actual=${JSON.stringify(slide?.notesText || '')}`)
	}
	return { label, partCount: names.length, slideCount: slides.length, layoutCount: layoutParts.length, masterCount: masterParts.length, notesSlideCount: notesParts.length, notesMasterCount: notesMasters.length, pSldIds: numericIds, slides }
}

async function commitPatch(mcp, deckId, entry, spec, label) {
	const result = dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: entry.deckVersion, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full' }))
	assert.deepEqual(result.unsupportedFindings || [], [], `${label}: unsupported findings`)
	return result
}

async function commitAppend(mcp, deckId, entry, spec, label) {
	const result = dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: entry.deckVersion, spec, phase: 'commit', commitMode: 'append', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	assert.deepEqual(result.unsupportedFindings || [], [], `${label}: unsupported findings`)
	return result
}

async function rejectedWithoutMutation(mcp, entry, deckId, spec, expected, label, options = {}) {
	const beforeVersion = entry.deckVersion
	const before = await pptxBuffer(entry)
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: options.deckVersion ?? beforeVersion, spec, phase: 'commit', commitMode: options.commitMode || 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	})
	const diagnostic = JSON.stringify(result)
	const payload = result?.data || result || {}
	const blocking = [...(Array.isArray(payload.unsupportedFindings) ? payload.unsupportedFindings : []), ...(Array.isArray(payload.unsupported) ? payload.unsupported : [])].filter(item => item?.blocking !== false)
	assert.ok(result?.ok === false || blocking.length > 0, `${label}: invalid mutation was accepted`)
	assert.match(diagnostic, expected, `${label}: precise fail-closed diagnostic`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: deckVersion changed`)
	const after = await pptxBuffer(entry)
	const diff = await stableMemberDiff(before, after)
	assert.deepEqual(diff.changed, [], `${label}: rejected mutation changed stable package members`)
	return { label, diagnostic: diagnostic.slice(0, 900), deckVersion: beforeVersion, beforePackageSha256: sha256(before), afterPackageSha256: sha256(after), ...diff }
}

function exportedSlideSignature(spec) {
	return (spec.slides || []).map(slide => ({
		id: slide.id, layoutName: slide.layoutName || null, masterName: slide.masterName || null,
		hidden: slide.hidden === true, showMasterShapes: slide.showMasterShapes !== false,
		hasTransition: Boolean(slide.transition), notes: String(slide.notes || ''),
		contentCount: (slide.content || []).length,
	}))
}

async function runOfficeProof(inputPath, outputPath, reportPath, sourceRenderDir, roundtripRenderDir) {
	await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-add-slide-unit-v1.ps1'), '-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath, '-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir], { cwd: workspaceRoot, timeout: 240000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.saveCopyAs, true)
	assert.equal(report.reopened, true)
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint source/roundtrip semantic snapshot')
	const sourcePngs = (await fs.readdir(sourceRenderDir)).filter(name => name.endsWith('.png')).sort()
	const roundtripPngs = (await fs.readdir(roundtripRenderDir)).filter(name => name.endsWith('.png')).sort()
	assert.equal(sourcePngs.length, report.source.SlideCount, 'source render count')
	assert.deepEqual(roundtripPngs, sourcePngs, 'roundtrip render inventory')
	const renders = []
	for (const name of sourcePngs) {
		const [source, roundtrip] = await Promise.all([fs.readFile(path.join(sourceRenderDir, name)), fs.readFile(path.join(roundtripRenderDir, name))])
		assert.equal(sha256(roundtrip), sha256(source), `${name}: SaveCopyAs/reopen render changed`)
		renders.push({ name, sourceSha256: sha256(source), roundtripSha256: sha256(roundtrip), exactPngBytesEqual: true })
	}
	return { report, renders }
}

export async function runAddSlideProof({ outputDir, office = false } = {}) {
	assert.equal(ADD_SLIDE_UNIT_ID, 'impl-b-7291f4091e2c2f56')
	assert.deepEqual(ADD_SLIDE_ROWS, [{ id: 'cap_d3e8dd4cef35a9b5dc30', label: 'add slide' }])
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-add-slide-unit-'))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `add-slide-unit-${Date.now()}`, clientInfo: { name: 'add-slide-unit-verifier', version: '1' }, blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	try {
		const authored = initialSpec()
		authored.slides.push(slideSpec('delta', 'DELTA ORIGINAL', NAMES.beta, { hidden: false, showMasterShapes: true, transition: { type: 'wipe' }, notes: 'Delta authored notes.' }))
		const created = dataOf('create initial slides', await mcp.call('betterpptx.deck.generate_from_spec', { spec: authored, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		let buffer = await pptxBuffer(entry)
		await writeArtifact(resolvedOutput, 'add-slide-initial.pptx', buffer, artifacts)
		lifecycle.push(await inspectPackage(buffer, 'initial', { slideCount: 4, layouts: [NAMES.alpha, NAMES.beta, NAMES.alpha, NAMES.beta], hidden: [false, true, false, false], masterShapes: [true, false, true, true], transition: [true, true, false, true], notes: { alpha: 'Alpha authored notes.', beta: 'Beta authored notes.', gamma: 'Gamma authored notes.', delta: 'Delta authored notes.' }, titles: { alpha: 'ALPHA ORIGINAL', beta: 'BETA ORIGINAL', gamma: 'GAMMA ORIGINAL', delta: 'DELTA ORIGINAL' } }))

		const appendResult = await commitAppend(mcp, created.deckId, entry, appendSpec(), 'append epsilon through public commitMode append')
		assert.ok((appendResult.committedObjects || []).length > 0, 'append committed-object readback')
		assert.ok(appendResult.committedObjects.every(item => item.slideIndex === 4), 'append committed-object indices use the existing slide-count offset')
		assert.equal(entry.semanticHandles?.['epsilon-title-edit']?.slideIndex, 4, 'append semantic handle uses the existing slide-count offset')
		buffer = await pptxBuffer(entry)
		await writeArtifact(resolvedOutput, 'add-slide-appended.pptx', buffer, artifacts)
		const appended = await inspectPackage(buffer, 'appended', {
			slideCount: 5,
			layouts: [NAMES.alpha, NAMES.beta, NAMES.alpha, NAMES.beta, NAMES.beta],
			hidden: [false, true, false, false, false],
			masterShapes: [true, false, true, true, true],
			transition: [true, true, false, true, true],
			notes: { epsilon: 'Epsilon appended notes.' }, titles: { epsilon: 'EPSILON APPENDED' },
		})
		assert.deepEqual(appended.slides.map(slide => slide.text.includes('EPSILON APPENDED')), [false, false, false, false, true], 'append content must land only on the new slide')
		assert.deepEqual(appended.slides.map(slide => slide.notesText.includes('Epsilon appended notes.')), [false, false, false, false, true], 'append notes must land only on the new slide')
		assert.equal(entry.pptx.slides[4]?._betterpptxSemanticId, 'epsilon', 'append semantic identity lands on the new slide')
		lifecycle.push(appended)
		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Delete appended epsilon', [], { deleteSlides: [4] }), 'delete appended epsilon')
		buffer = await pptxBuffer(entry)
		await writeArtifact(resolvedOutput, 'add-slide-append-cleaned.pptx', buffer, artifacts)
		const appendCleaned = await inspectPackage(buffer, 'append-cleaned', { slideCount: 4, layouts: [NAMES.alpha, NAMES.beta, NAMES.alpha, NAMES.beta] })
		assert.ok(appendCleaned.slides.every(slide => !slide.text.includes('EPSILON APPENDED') && !slide.notesText.includes('Epsilon appended notes.')), 'append deletion must remove content and notes ownership')
		lifecycle.push(appendCleaned)

		await commitPatch(mcp, created.deckId, entry, policyPatch(3, 'delta', { layoutName: NAMES.alpha, masterName: NAMES.master, hidden: true, showMasterShapes: false, transition: { type: 'fade' }, notes: 'Delta updated notes.' }), 'update delta slide')
		await commitPatch(mcp, created.deckId, entry, policyPatch(3, 'delta', { layoutName: null, masterName: null, hidden: null, showMasterShapes: null, transition: null, notes: null }), 'reset delta slide')
		await commitPatch(mcp, created.deckId, entry, policyPatch(3, 'delta', { layoutName: NAMES.beta, masterName: NAMES.master, hidden: false, showMasterShapes: true, transition: { type: 'wipe' }, notes: 'Delta final notes.' }), 're-edit delta slide')
		buffer = await pptxBuffer(entry)
		await writeArtifact(resolvedOutput, 'add-slide-reedited.pptx', buffer, artifacts)
		lifecycle.push(await inspectPackage(buffer, 'reedited', { slideCount: 4, layouts: [NAMES.alpha, NAMES.beta, NAMES.alpha, NAMES.beta], hidden: [false, true, false, false], masterShapes: [true, false, true, true], transition: [true, true, false, true], notes: { delta: 'Delta final notes.' }, titles: { delta: 'DELTA ORIGINAL' } }))

		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Duplicate delta', [], { duplicateSlides: { slideIndex: 3, id: 'delta-copy', title: 'DELTA COPY' } }), 'duplicate delta with new semantic identity')
		buffer = await pptxBuffer(entry)
		await writeArtifact(resolvedOutput, 'add-slide-duplicated.pptx', buffer, artifacts)
		const duplicated = await inspectPackage(buffer, 'duplicated', { slideCount: 5 })
		assert.equal(new Set(duplicated.pSldIds).size, 5, 'duplicate receives a fresh package slide identity')
		lifecycle.push(duplicated)

		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Reorder slides', [], { reorderSlides: { order: [3, 1, 4, 0, 2] } }), 'reorder slides')
		buffer = await pptxBuffer(entry)
		await writeArtifact(resolvedOutput, 'add-slide-reordered.pptx', buffer, artifacts)
		lifecycle.push(await inspectPackage(buffer, 'reordered', { slideCount: 5, layouts: [NAMES.beta, NAMES.beta, NAMES.beta, NAMES.alpha, NAMES.alpha] }))

		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Delete duplicate', [], { deleteSlides: [2] }), 'delete duplicate')
		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Delete original delta', [], { deleteSlides: [0] }), 'delete original delta')
		buffer = await pptxBuffer(entry)
		await writeArtifact(resolvedOutput, 'add-slide-deleted.pptx', buffer, artifacts)
		lifecycle.push(await inspectPackage(buffer, 'deleted', { slideCount: 3, layouts: [NAMES.beta, NAMES.alpha, NAMES.alpha] }))

		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Re-add delta by semantic duplicate', [], { duplicateSlides: { slideIndex: 2, id: 'delta', title: 'DELTA RE-ADDED' } }), 're-add delta with unique semantic identity')
		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Re-edit re-added delta', [{
			id: 'delta', slideIndex: 3, layoutIntent: 'title-only', layoutName: NAMES.beta, masterName: NAMES.master,
			hidden: false, showMasterShapes: true, transition: { type: 'wipe' }, notes: 'Delta re-added notes.',
			content: [{ kind: 'textBox', name: 'gamma-sentinel', patch: { text: 'DELTA RE-ADDED' } }],
		}]), 're-edit re-added delta')
		await commitPatch(mcp, created.deckId, entry, patchEnvelope('Final reorder', [], { reorderSlides: { order: [0, 3, 1, 2] } }), 'final reorder')
		buffer = await pptxBuffer(entry)
		const finalPath = await writeArtifact(resolvedOutput, 'add-slide-final.pptx', buffer, artifacts)
		lifecycle.push(await inspectPackage(buffer, 'final', { slideCount: 4, layouts: [NAMES.beta, NAMES.beta, NAMES.alpha, NAMES.alpha], hidden: [true, false, false, false], masterShapes: [false, true, true, true], transition: [true, true, true, false], notes: { delta: 'Delta re-added notes.' }, titles: { delta: 'DELTA RE-ADDED' } }))
		const repeated = await pptxBuffer(entry)
		const deterministic = await stableMemberDiff(buffer, repeated)
		assert.deepEqual(deterministic.changed, [], 'repeated write changed stable package members')

		const negativeMutationGates = []
		negativeMutationGates.push(await rejectedWithoutMutation(mcp, entry, created.deckId, policyPatch(0, 'beta', { layoutName: 'MissingAddSlideLayout', masterName: NAMES.master }), /not present|not found|layout/i, 'unknown layout patch'))
		negativeMutationGates.push(await rejectedWithoutMutation(mcp, entry, created.deckId, policyPatch(0, 'beta', { showMasterShapes: false, showMasterBackground: true }), /must agree/i, 'conflicting master-shape aliases'))
		negativeMutationGates.push(await rejectedWithoutMutation(mcp, entry, created.deckId, patchEnvelope('Invalid reorder', [], { reorderSlides: { order: [0, 0, 2, 3] } }), /permutation|order/i, 'invalid reorder permutation'))
		negativeMutationGates.push(await rejectedWithoutMutation(mcp, entry, created.deckId, patchEnvelope('Delete every slide', [], { deleteSlides: [0, 1, 2, 3] }), /every slide|invalid presentation/i, 'delete every slide'))
		negativeMutationGates.push(await rejectedWithoutMutation(mcp, entry, created.deckId, patchEnvelope('Duplicate existing semantic ID', [], { duplicateSlides: { slideIndex: 0, id: 'alpha', title: 'DUPLICATE ID' } }), /already exists|duplicate|semantic slide ID/i, 'duplicate semantic ID'))
		negativeMutationGates.push(await rejectedWithoutMutation(mcp, entry, created.deckId, policyPatch(0, 'beta', { transition: { type: 'not-a-transition' } }), /transition|unsupported|invalid/i, 'invalid transition'))
		negativeMutationGates.push(await rejectedWithoutMutation(mcp, entry, created.deckId, policyPatch(0, 'beta', { hidden: false }), /version|stale|conflict/i, 'stale deck version', { deckVersion: Math.max(0, entry.deckVersion - 1) }))

		const exported = dataOf('export current spec', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		const exportedSignature = exportedSlideSignature(exported)
		assert.equal(exportedSignature.length, 4, 'exported slide count')
		assert.equal(new Set(exportedSignature.map(slide => slide.id)).size, 4, 'exported semantic slide IDs are unique')
		assert.deepEqual(exportedSignature.map(slide => slide.id), ['beta', 'delta', 'alpha', 'gamma'], 'exported semantic order')
		assert.deepEqual(exportedSignature.map(slide => slide.layoutName), [NAMES.beta, NAMES.beta, NAMES.alpha, NAMES.alpha], 'exported layout bindings')
		const exportedPath = path.join(resolvedOutput, 'add-slide-exported-spec.json')
		await fs.writeFile(exportedPath, `${JSON.stringify(exported, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
		artifacts['add-slide-exported-spec.json'] = { file: relative(exportedPath), bytes: (await fs.stat(exportedPath)).size, sha256: sha256(await fs.readFile(exportedPath)) }

		const replay = dataOf('replay exported spec', await mcp.call('betterpptx.deck.generate_from_spec', { spec: portableSpec(exported), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		const replayExport = dataOf('export replay', await mcp.call('betterpptx.deck.export_spec', { deckId: replay.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assert.deepEqual(exportedSlideSignature(replayExport), exportedSignature, 'export/replay semantic slide equality')
		const replayBuffer = await pptxBuffer(replayEntry)
		await writeArtifact(resolvedOutput, 'add-slide-recompiled.pptx', replayBuffer, artifacts)
		lifecycle.push(await inspectPackage(replayBuffer, 'recompiled', { slideCount: 4, layouts: [NAMES.beta, NAMES.beta, NAMES.alpha, NAMES.alpha], hidden: [true, false, false, false], masterShapes: [false, true, true, true], transition: [true, true, true, false] }))

		let officeEvidence = { status: 'dependency-gated', reason: 'Pass --office to run repair-disabled PowerPoint Open2007/SaveCopyAs/reopen and render proof.' }
		if (office) {
			const roundtripPath = path.join(resolvedOutput, 'add-slide-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'add-slide-office-com.json')
			const sourceRenderDir = path.join(resolvedOutput, 'add-slide-generated-renders')
			const roundtripRenderDir = path.join(resolvedOutput, 'add-slide-reopened-renders')
			const officeResult = await runOfficeProof(finalPath, roundtripPath, reportPath, sourceRenderDir, roundtripRenderDir)
			const roundtripBuffer = await fs.readFile(roundtripPath)
			const roundtripPackage = await inspectPackage(roundtripBuffer, 'office-roundtrip', { slideCount: 4, layouts: [NAMES.beta, NAMES.beta, NAMES.alpha, NAMES.alpha], hidden: [true, false, false, false], masterShapes: [false, true, true, true], transition: [true, true, true, false] })
			officeEvidence = { status: 'PASS', ...officeResult, package: roundtripPackage, roundtrip: { file: relative(roundtripPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }, reportFile: relative(reportPath) }
			artifacts['add-slide-office-savecopyas.pptx'] = officeEvidence.roundtrip
			artifacts['add-slide-office-com.json'] = { file: relative(reportPath), bytes: (await fs.stat(reportPath)).size, sha256: sha256(await fs.readFile(reportPath)) }
		}

		return {
			schemaVersion: 'betterpptx.add-slide-unit-proof.v1', unitId: ADD_SLIDE_UNIT_ID,
			status: officeEvidence.status === 'PASS' ? 'ADD_SLIDE_PACKAGE_AND_OFFICE_VERIFIED' : 'ADD_SLIDE_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(), rows: ADD_SLIDE_ROWS, blockers: [],
			checks: {
				xmlParseCrcAndOpcClosure: true, slideIdListRelationshipPartAndOrderClosure: true, uniqueLegalPackageSlideIds: true,
				layoutMasterThemeAndContentTypeClosure: true, alwaysOnNotesOwnershipAndCleanup: true, hiddenShowMasterShapesAndTransitionNativeCarriers: true,
				createAppendUpdateNullResetReeditDuplicateReorderDeleteReadd: true, appendedContentNotesAndSemanticIdentityLandOnlyOnNewSlide: true,
				appendCommittedObjectAndSemanticHandleIndicesUseExistingSlideCountOffset: true,
				appendDeleteRelationshipAndNotesCleanup: true, rejectedMutationsPreserveDeckVersionAndStablePackage: negativeMutationGates.length === 7,
				deterministicRepeatedWriteExceptCoreTimestamps: deterministic.changed.length === 0, exportReplaySemanticIdentityOrderAndPolicy: true,
				powerPointRepairDisabledOpen2007SaveCopyAsReopenAndRender: officeEvidence.status === 'PASS',
			},
			proofBoundary: {
				covered: ['public JSON-spec createNew and commitMode append add-slide paths', 'append slide-index remapping for content, notes, semantic handles, and identity', 'slide policy patch/null-reset/re-edit', 'package-native slide IDs/order/visibility', 'layout/master/theme and notes relationship closure', 'duplicate with explicit unique ID/title, reorder, delete, and semantic re-add cleanup', 'public export/replay', 'seven rejected-mutation immutability gates', 'PowerPoint COM and render proof when --office is enabled'],
				notClaimed: ['custom shows, sections, Zoom, hyperlinks, media, charts, tables, comments, and arbitrary imported raw-package slide relationships are owned by their focused units'],
			},
			negativeMutationGates, deterministic, exportedSignature, lifecycle, office: officeEvidence, artifacts,
			proofPath: relative(path.join(resolvedOutput, 'add-slide-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_ADD_SLIDE_OFFICE === '1'
	const explicit = process.env.BETTERPPTX_ADD_SLIDE_OUTPUT || process.env.BETTERPPTX_VALIDATION_OUTPUT
	const outputDir = explicit ? path.resolve(explicit) : path.join(os.tmpdir(), `betterpptx-add-slide-unit-${timestamp()}`)
	let proof
	try {
		proof = await runAddSlideProof({ outputDir, office })
	} catch (error) {
		proof = { schemaVersion: 'betterpptx.add-slide-unit-proof.v1', unitId: ADD_SLIDE_UNIT_ID, status: 'BLOCKED', generatedAt: new Date().toISOString(), rows: ADD_SLIDE_ROWS, blockers: [{ code: error?.code || 'VERIFIER_FAILED', message: String(error?.message || error), stack: String(error?.stack || '') }], proofPath: relative(path.join(outputDir, 'add-slide-unit-proof.json')) }
	}
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'add-slide-unit-proof.json')
	await fs.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
	process.stdout.write(`${JSON.stringify({ ...proof, proofFile: proofPath, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2)}\n`)
	if (proof.status === 'BLOCKED') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
