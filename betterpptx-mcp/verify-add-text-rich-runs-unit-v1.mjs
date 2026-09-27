#!/usr/bin/env node

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

export const ADD_TEXT_RICH_RUNS_UNIT_ID = 'impl-b-26c13da769183d70'
export const ADD_TEXT_RICH_RUNS_ROWS = Object.freeze([
	Object.freeze(['cap_abea4eaf2ef3fb790ebc', 'add text']),
	Object.freeze(['cap_cddc41dd90dd55952f32', 'add rich text runs']),
])

const NAMES = Object.freeze({ plain: 'plain-text', rich: 'rich-text', linkTarget: 'link-target' })
const URLS = Object.freeze({
	initial: 'https://example.com/text-rich-runs/initial',
	updated: 'https://example.org/text-rich-runs/updated',
	reedited: 'https://example.net/text-rich-runs/re-edited',
})
const FIELDS = Object.freeze({
	initial: Object.freeze({ id: '{11111111-2222-4333-8444-555555555555}', type: 'slidenum', text: 'Soft field initial' }),
	updated: Object.freeze({ id: '{AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE}', type: 'datetime1', text: 'Soft field updated' }),
	reedited: Object.freeze({ id: '{12345678-9ABC-4DEF-8123-456789ABCDEF}', type: 'datetime2', text: 'Soft field re-edited' }),
})
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const CORE_NS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
const DCTERMS_NS = 'http://purl.org/dc/terms/'

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
	return elements(document, 'Relationship').map(node => ({
		Id: node.getAttribute('Id'),
		Type: node.getAttribute('Type'),
		Target: node.getAttribute('Target'),
		TargetMode: node.getAttribute('TargetMode'),
	}))
}

function sourcePartForRelationships(relsPart) {
	if (relsPart === '_rels/.rels') return ''
	return path.posix.join(path.posix.dirname(path.posix.dirname(relsPart)), path.posix.basename(relsPart, '.rels'))
}

function relationshipPartFor(partName) {
	return path.posix.join(path.posix.dirname(partName), '_rels', `${path.posix.basename(partName)}.rels`)
}

function resolveTarget(sourcePart, target) {
	const base = sourcePart ? path.posix.dirname(sourcePart) : ''
	return path.posix.normalize(path.posix.join(base, String(target || '').replace(/^\/+/, '')))
}

function relationshipId(node) {
	return node?.getAttribute('r:id')
		|| node?.getAttributeNS(REL_BASE.replace(/\/$/, ''), 'id')
		|| ''
}

function nameMatches(actual, wanted) {
	return actual === wanted || actual.endsWith(`.${wanted}`) || actual.includes(`.${wanted}.`) || actual.includes(wanted)
}

function topLevelShapes(document) {
	const spTree = elements(document, 'spTree')[0]
	return elementChildren(spTree).filter(node => node.localName === 'sp')
}

function carrierName(carrier) {
	return elements(carrier, 'cNvPr')[0]?.getAttribute('name') || ''
}

function carrierByName(document, wanted) {
	return topLevelShapes(document).find(carrier => nameMatches(carrierName(carrier), wanted)) || null
}

function textOf(node) {
	return elements(node, 't').map(item => item.textContent || '').join('')
}

function textNode(node, value) {
	return elements(node, 't').find(item => item.textContent === value) || null
}

function runProperties(textElement) {
	const carrier = textElement?.parentNode
	return directChild(carrier, 'rPr')
}

function fillColor(rPr) {
	return elements(rPr, 'srgbClr')[0]?.getAttribute('val') || ''
}

function shapeSlide(slideParts, documents, wanted) {
	const part = slideParts.find(candidate => carrierByName(documents.get(candidate), wanted))
	return part ? { part, document: documents.get(part), carrier: carrierByName(documents.get(part), wanted) } : null
}

function contentTypeMaps(document) {
	return {
		defaults: new Map(elements(document, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')])),
		overrides: new Map(elements(document, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')])),
	}
}

function baseMetadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'Prove editable native plain text and mixed rich runs.', remember: 'Run semantics and relationship ownership survive lifecycle edits.' },
		visualDesign: { world: 'Editorial native text proof', framing: 'Two native text boxes', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
	}
}

function richRuns(state) {
	const field = FIELDS[state]
	return [
		{ text: 'Hard-A', options: { breakLine: true, bold: true, italic: false, fontFace: 'Aptos', fontSize: 22, color: state === 'reedited' ? '7C3AED' : 'C2410C' } },
		{ text: 'Hard-B\u00A0NBSP', options: { italic: true, fontFace: 'Aptos', fontSize: 20 } },
		{ text: field.text, options: { softBreakBefore: true, field: { id: field.id, type: field.type }, hyperlink: { url: URLS[state], tooltip: `${state} external link` } } },
		{ text: ' Internal link ', options: { inline: true, underline: { style: 'sng' }, hyperlink: { slide: 2, tooltip: `${state} internal link` } } },
	]
}

function proofSpec() {
	return {
		...baseMetadata('Add text and rich runs lifecycle proof'),
		theme: { name: 'Text rich runs proof', palette: ['F8FAFC', '111827', 'C2410C', '2563EB'], fontFace: 'Aptos' },
		slides: [
			{
				id: 'text-proof', title: 'Plain text and mixed native runs', layoutIntent: 'title-only',
				content: [
					{ kind: 'textBox', name: NAMES.plain, objectName: NAMES.plain, text: 'Plain text initial', style: { fontFace: 'Aptos', fontSize: 26, color: '111827', bold: false, margin: 0.04 } },
					{ kind: 'textBox', name: NAMES.rich, objectName: NAMES.rich, text: richRuns('initial'), style: { fontFace: 'Aptos', fontSize: 20, color: '111827', margin: 0.06, breakLine: false } },
				],
			},
			{ id: 'link-target-slide', title: 'Internal hyperlink target', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: NAMES.linkTarget, objectName: NAMES.linkTarget, text: 'Internal target', style: { fontFace: 'Aptos', fontSize: 28 } }] },
		],
	}
}

function patchSpec(title, plainPatch, richPatch) {
	return {
		...baseMetadata(title), slides: [{
			id: 'text-proof', slideIndex: 0, layoutIntent: 'title-only', content: [
				{ kind: 'textBox', name: NAMES.plain, objectName: NAMES.plain, patch: plainPatch },
				{ kind: 'textBox', name: NAMES.rich, objectName: NAMES.rich, patch: richPatch },
			],
		}],
	}
}

function expectationFor(state, overrides = {}) {
	const values = {
		initial: { plain: 'Plain text initial', richState: 'initial', links: true },
		updated: { plain: 'Plain text updated', richState: 'updated', links: true },
		reset: { plain: '', richText: '', links: false },
		reedited: { plain: 'Plain text re-edited', richState: 'reedited', links: true },
		recompiled: { plain: 'Plain text re-edited', richState: 'reedited', links: true },
	}
	return { state, ...values[state], ...overrides }
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
	const [beforeZip, afterZip] = await Promise.all([
		JSZip.loadAsync(beforeBuffer, { checkCRC32: true }), JSZip.loadAsync(afterBuffer, { checkCRC32: true }),
	])
	const names = [...new Set([...Object.keys(beforeZip.files), ...Object.keys(afterZip.files)])].sort()
	const changed = []
	const semanticChanged = []
	for (const name of names) {
		const before = beforeZip.file(name)
		const after = afterZip.file(name)
		if (!before || !after) {
			if (before || after) {
				const change = { name, before: Boolean(before), after: Boolean(after) }
				changed.push(change)
				semanticChanged.push(change)
			}
			continue
		}
		const [beforeBytes, afterBytes] = await Promise.all([before.async('nodebuffer'), after.async('nodebuffer')])
		if (sha256(beforeBytes) === sha256(afterBytes)) continue
		const raw = { name, beforeHash: sha256(beforeBytes), afterHash: sha256(afterBytes) }
		changed.push(raw)
		const beforeSemantic = name === 'docProps/core.xml' ? sha256(normalizedCoreProperties(beforeBytes)) : raw.beforeHash
		const afterSemantic = name === 'docProps/core.xml' ? sha256(normalizedCoreProperties(afterBytes)) : raw.afterHash
		if (beforeSemantic !== afterSemantic) semanticChanged.push({ ...raw, beforeSemantic, afterSemantic })
	}
	return {
		memberPayloadsEqual: changed.length === 0,
		semanticPayloadsEqual: semanticChanged.length === 0,
		comparisonPolicy: { coreProperties: 'canonicalize only dcterms:created, dcterms:modified, and cp:lastPrinted', allOtherMembers: 'exact uncompressed member bytes' },
		changed, semanticChanged,
	}
}

function assertRichTextCarriers(richCarrier, expectation, slideRelationships, slidePart, nameSet, blockers) {
	const txBody = directChild(richCarrier, 'txBody')
	const hyperlinkCarriers = elements(richCarrier, 'hlinkClick')
	const ownedIds = hyperlinkCarriers.map(relationshipId)
	assert.ok(ownedIds.every(Boolean), `${expectation.state}: hyperlink carrier missing r:id`)
	assert.equal(new Set(ownedIds).size, ownedIds.length, `${expectation.state}: duplicate hyperlink carrier r:id`)
	const ownedRelationships = ownedIds.map(id => slideRelationships.find(rel => rel.Id === id))
	assert.ok(ownedRelationships.every(Boolean), `${expectation.state}: dangling hyperlink carrier`)
	const externalHyperlinks = slideRelationships.filter(rel => rel.Type === `${REL_BASE}hyperlink`)
	assert.ok(externalHyperlinks.every(rel => ownedIds.includes(rel.Id)), `${expectation.state}: stale unowned external hyperlink relationship`)
	if (!expectation.links && expectation.richText === '' && !txBody) {
		assert.equal(hyperlinkCarriers.length, 0, `${expectation.state}: null reset retained hyperlink carrier`)
		assert.equal(externalHyperlinks.length, 0, `${expectation.state}: null reset retained hyperlink relationship`)
		return { paragraphs: 0, runs: 0, fields: 0, hyperlinkCarriers: 0, hyperlinkRelationships: 0, emptyTextBodyOmitted: true }
	}
	assert.ok(txBody, `${expectation.state}: rich text p:txBody missing`)
	assert.deepEqual(elementChildren(txBody).slice(0, 2).map(node => node.localName), ['bodyPr', 'lstStyle'], `${expectation.state}: p:txBody child order`)
	const paragraphs = elementChildren(txBody).filter(node => node.localName === 'p')
	assert.ok(paragraphs.length >= 1, `${expectation.state}: rich text paragraph missing`)

	if (!expectation.links) {
		assert.equal(textOf(richCarrier), expectation.richText, `${expectation.state}: reset text`)
		assert.equal(elements(richCarrier, 'fld').length, 0, `${expectation.state}: reset retained field`)
		assert.equal(elements(richCarrier, 'br').length, 0, `${expectation.state}: reset retained soft break`)
		assert.equal(hyperlinkCarriers.length, 0, `${expectation.state}: reset retained hyperlink carrier`)
		assert.equal(externalHyperlinks.length, 0, `${expectation.state}: reset retained hyperlink relationship`)
		for (const rPr of elements(richCarrier, 'rPr')) {
			for (const attribute of ['b', 'i', 'baseline']) assert.ok(!rPr.hasAttribute(attribute), `${expectation.state}: reset retained ${attribute}`)
		}
		return { paragraphs: paragraphs.length, runs: elements(richCarrier, 'r').length, fields: 0, hyperlinkCarriers: 0, hyperlinkRelationships: 0 }
	}

	const state = expectation.richState
	const field = FIELDS[state]
	const hardA = paragraphs.find(item => textOf(item).includes('Hard-A'))
	const mixed = paragraphs.find(item => textOf(item).includes('Hard-B\u00A0NBSP'))
	assert.ok(hardA && !textOf(hardA).includes('Hard-B'), `${expectation.state}: hard break must create a separate a:p`)
	assert.ok(mixed, `${expectation.state}: mixed paragraph text`)
	if (!expectation.officeNormalized) assert.ok(textOf(mixed).includes(field.text), `${expectation.state}: authored field display text in mixed paragraph`)
	assert.ok(elements(mixed, 'br').length >= 1, `${expectation.state}: soft break must remain a:br inside the paragraph`)
	const hardText = textNode(richCarrier, 'Hard-A')
	const hardRPr = runProperties(hardText)
	assert.equal(hardRPr?.getAttribute('b'), '1', `${expectation.state}: bold run`)
	assert.equal(hardRPr?.getAttribute('i'), '0', `${expectation.state}: explicit italic=false run`)
	assert.equal(fillColor(hardRPr), state === 'reedited' ? '7C3AED' : 'C2410C', `${expectation.state}: rich run color`)
	const hardB = textNode(richCarrier, 'Hard-B\u00A0NBSP')
	assert.equal(runProperties(hardB)?.getAttribute('i'), '1', `${expectation.state}: italic run`)
	const internalText = textNode(richCarrier, ' Internal link ')
	assert.equal(internalText?.textContent, ' Internal link ', `${expectation.state}: leading/trailing run spaces`)
	const cNvPr = elements(richCarrier, 'cNvPr')[0]
	assert.ok(String(cNvPr?.getAttribute('descr') || '').includes('Hard-A'), `${expectation.state}: derived rich-run alt text must be textual`)
	assert.doesNotMatch(String(cNvPr?.getAttribute('descr') || ''), /\[object Object\]/, `${expectation.state}: rich-run alt text must not stringify objects`)

	const fields = elements(richCarrier, 'fld')
	assert.equal(fields.length, 1, `${expectation.state}: field cardinality`)
	assert.equal(fields[0].getAttribute('id'), field.id, `${expectation.state}: field GUID`)
	assert.equal(fields[0].getAttribute('type'), field.type, `${expectation.state}: field type`)
	assert.deepEqual(elementChildren(fields[0]).map(node => node.localName), ['rPr', 't'], `${expectation.state}: field child order`)
	if (expectation.officeNormalized) assert.ok(textOf(fields[0]).length > 0, `${expectation.state}: PowerPoint recalculated field text must remain non-empty`)
	else assert.equal(textOf(fields[0]), field.text, `${expectation.state}: field display text`)

	assert.equal(hyperlinkCarriers.length, 2, `${expectation.state}: external and internal hyperlink carriers`)
	assert.equal(externalHyperlinks.length, 1, `${expectation.state}: external hyperlink relationship cardinality`)
	assert.equal(externalHyperlinks[0].Target, URLS[state], `${expectation.state}: external hyperlink target`)
	assert.equal(externalHyperlinks[0].TargetMode, 'External', `${expectation.state}: external hyperlink TargetMode`)
	const internal = ownedRelationships.find(rel => rel.Type === `${REL_BASE}slide`)
	assert.ok(internal, `${expectation.state}: internal slide hyperlink relationship`)
	assert.ok(nameSet.has(resolveTarget(slidePart, internal.Target)), `${expectation.state}: internal slide hyperlink target closure`)
	const internalCarrier = hyperlinkCarriers.find(node => relationshipId(node) === internal.Id)
	assert.equal(internalCarrier?.getAttribute('action'), 'ppaction://hlinksldjump', `${expectation.state}: internal hyperlink action`)
	return { paragraphs: paragraphs.length, runs: elements(richCarrier, 'r').length, fields: fields.length, hyperlinkCarriers: hyperlinkCarriers.length, hyperlinkRelationships: ownedRelationships.length }
}

async function inspectPackage(buffer, expectation, blockers = []) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${expectation.state}/${name}`))
	}
	for (const [relPart, document] of documents) {
		if (!relPart.endsWith('.rels')) continue
		const relationships = relationshipRecords(document)
		assert.equal(new Set(relationships.map(rel => rel.Id)).size, relationships.length, `${expectation.state}: ${relPart} duplicate relationship IDs`)
		const source = sourcePartForRelationships(relPart)
		for (const relationship of relationships.filter(rel => rel.TargetMode !== 'External')) {
			const target = resolveTarget(source, relationship.Target)
			assert.ok(nameSet.has(target), `${expectation.state}: ${relPart} dangling ${relationship.Id} -> ${target}`)
		}
	}
	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${expectation.state}: [Content_Types].xml missing`)
	const { defaults, overrides } = contentTypeMaps(contentTypes)
	for (const part of overrides.keys()) assert.ok(nameSet.has(part), `${expectation.state}: content-type override target missing ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${expectation.state}: ${name} has no content type`)
	}
	assert.equal(names.filter(name => /^ppt\/embeddings\//i.test(name)).length, 0, `${expectation.state}: native text must not create embedded packages`)
	assert.equal(names.filter(name => /^ppt\/media\//i.test(name)).length, 0, `${expectation.state}: native text must not create media parts`)

	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
	assert.equal(slideParts.length, 2, `${expectation.state}: slide count`)
	const plain = shapeSlide(slideParts, documents, NAMES.plain)
	const rich = shapeSlide(slideParts, documents, NAMES.rich)
	assert.ok(plain && rich, `${expectation.state}: plain/rich text carriers missing`)
	assert.equal(plain.part, rich.part, `${expectation.state}: proof text carriers must share slide`)
	for (const [label, item] of [['plain', plain], ['rich', rich]]) {
		assert.equal(item.carrier.localName, 'sp', `${expectation.state}: ${label} carrier must be p:sp`)
		if (expectation.links || expectation.plain || expectation.richText) assert.ok(directChild(item.carrier, 'txBody'), `${expectation.state}: ${label} p:txBody`)
		assert.equal(elements(item.carrier, 'graphicData').length, 0, `${expectation.state}: ${label} must not become a graphic frame`)
	}
	assert.equal(textOf(plain.carrier), expectation.plain, `${expectation.state}: plain text content`)
	assert.equal(elements(plain.carrier, 'fld').length, 0, `${expectation.state}: plain text must not become a field`)
	assert.equal(elements(plain.carrier, 'hlinkClick').length, 0, `${expectation.state}: plain text must not own rich-run hyperlinks`)
	const slideRelationships = relationshipRecords(documents.get(relationshipPartFor(rich.part)))
	const richInspection = assertRichTextCarriers(rich.carrier, expectation, slideRelationships, rich.part, nameSet, blockers)
	return {
		state: expectation.state, packageSha256: sha256(buffer), partCount: names.length, slideCount: slideParts.length,
		plainCarrier: 'p:sp/p:txBody', richCarrier: 'p:sp/p:txBody', ...richInspection,
	}
}

async function writeImmutable(file, bytes) {
	await fs.writeFile(file, bytes, { flag: 'wx' })
}

async function writeState(outputDir, entry, expectation, blockers, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `add-text-rich-runs-${expectation.state}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, expectation, blockers)
	artifacts[expectation.state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { buffer, file, inspection }
}

async function commitPatch(mcp, entry, spec, label) {
	const beforeVersion = entry.deckVersion
	const committed = dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId: entry.deckId, deckVersion: beforeVersion, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	assert.ok(entry.deckVersion > beforeVersion, `${label}: deckVersion did not advance`)
	return committed
}

function exportedBlock(spec, wanted) {
	return (spec?.slides || []).flatMap(slide => slide.content || []).find(block => nameMatches(String(block.name || block.objectName || ''), wanted))
}

function assertExportedSpec(spec) {
	const plain = exportedBlock(spec, NAMES.plain)
	const rich = exportedBlock(spec, NAMES.rich)
	assert.ok(plain && rich, 'export: plain/rich blocks missing')
	assert.equal(plain.text, 'Plain text re-edited', 'export: plain text')
	assert.ok(Array.isArray(rich.text), 'export: rich text must remain run array')
	const fieldRun = rich.text.find(run => run.options?.field)
	const external = rich.text.find(run => run.options?.hyperlink?.url)
	const internal = rich.text.find(run => run.options?.hyperlink?.slide)
	assert.deepEqual(fieldRun?.options?.field, { id: FIELDS.reedited.id, type: FIELDS.reedited.type }, 'export: field readback')
	assert.equal(external?.options?.hyperlink?.url, URLS.reedited, 'export: external hyperlink')
	assert.equal(internal?.options?.hyperlink?.slide, 2, 'export: internal hyperlink')
	assert.equal(rich.text.some(run => run.options?.breakLine === true), true, 'export: hard break')
	assert.equal(rich.text.some(run => run.options?.softBreakBefore === true), true, 'export: soft break')
	const serialized = JSON.stringify(spec)
	assert.doesNotMatch(serialized, /_rId|_rawRpr|standaloneBreakParagraph|nativePackagePreservation|rawPackageParts/, 'export: private carrier leakage')
}

function portableSpec(spec) {
	const opaque = (spec.slides || []).flatMap(slide => slide.content || []).filter(block => block.kind === 'opaqueNative')
	assert.ok(opaque.every(block => nameMatches(String(block.objectName || block.name || ''), 'slide-title')), 'export: only engine-owned slide-title scaffolds may remain opaque')
	return {
		...structuredClone(spec), nativePackagePreservation: false,
		slides: (spec.slides || []).map(slide => {
			const { nativeTimingPreservation, ...portableSlide } = structuredClone(slide)
			return {
				...portableSlide,
				content: (portableSlide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
					const { nativePreservation, preservationHandle, editHandle, ...semanticBlock } = block
					return semanticBlock
				}),
			}
		}),
	}
}

async function mutationGate({ mcp, entry, label, code, args, expected }) {
	const beforeVersion = entry.deckVersion
	const beforeBuffer = await pptxBuffer(entry)
	let result
	try { result = await mcp.call('betterpptx.deck.generate_from_spec', args(beforeVersion)) }
	catch (error) { result = { ok: false, error: { code: error?.code, message: error?.message || String(error) } } }
	const afterBuffer = await pptxBuffer(entry)
	const diff = await semanticPackageDiff(beforeBuffer, afterBuffer)
	const diagnostic = JSON.stringify(result)
	const rejected = result?.ok === false
	const dryRun = args(beforeVersion).phase === 'dryRun'
	const expectedOutcome = dryRun ? result?.ok === true : rejected && expected.test(diagnostic)
	const passed = expectedOutcome && entry.deckVersion === beforeVersion && diff.semanticPayloadsEqual
	return {
		label, code, passed, dryRun, rejected, diagnosticMatches: dryRun ? true : expected.test(diagnostic),
		versionUnchanged: entry.deckVersion === beforeVersion, semanticPackageUnchanged: diff.semanticPayloadsEqual,
		beforeVersion, afterVersion: entry.deckVersion, diagnostic: diagnostic.slice(0, 1200), packageDiff: diff,
	}
}

async function runPackageAudit(filePath) {
	const result = await run(process.execPath, [path.join(workspaceRoot, 'tools', 'audit-pptx-package-integrity.mjs'), filePath], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 120000 })
	const report = JSON.parse(result.stdout)
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.deepEqual(report.errors || [], [], JSON.stringify(report))
	return report
}

function normalizeOfficeSnapshot(snapshot) {
	return {
		SlideCount: Number(snapshot.SlideCount), Hyperlinks: snapshot.Hyperlinks,
		Slides: (snapshot.Slides || []).map(slide => ({ Index: Number(slide.Index), Shapes: slide.Shapes })),
	}
}

function officeShape(snapshot, wanted) {
	return (snapshot.Slides || []).flatMap(slide => slide.Shapes || []).find(shape => nameMatches(String(shape.Name || ''), wanted))
}

function assertOfficeSnapshot(snapshot, label) {
	assert.equal(Number(snapshot.SlideCount), 2, `${label}: slide count`)
	const plain = officeShape(snapshot, NAMES.plain)
	const rich = officeShape(snapshot, NAMES.rich)
	assert.ok(plain && rich, `${label}: text shapes`)
	assert.equal(plain.HasText, true, `${label}: plain HasText`)
	assert.equal(String(plain.Text), 'Plain text re-edited', `${label}: plain text`)
	assert.equal(rich.HasText, true, `${label}: rich HasText`)
	for (const marker of ['Hard-A', 'Hard-B\u00A0NBSP', 'Internal link']) assert.ok(String(rich.Text).includes(marker), `${label}: rich marker ${marker}`)
	assert.ok(String(rich.Text).endsWith(' Internal link '), `${label}: leading/trailing rich-run spaces`)
	assert.ok(Number(rich.ParagraphCount) >= 2, `${label}: hard paragraph count`)
	const hyperlinks = snapshot.Hyperlinks || []
	assert.equal(hyperlinks.length, 2, `${label}: PowerPoint hyperlink count`)
	assert.ok(hyperlinks.some(item => item.Address === URLS.reedited), `${label}: external hyperlink accessibility`)
	assert.ok(hyperlinks.some(item => String(item.SubAddress || '').length > 0), `${label}: internal hyperlink accessibility`)
	return normalizeOfficeSnapshot(snapshot)
}

async function runOfficeProof(inputPath, outputPath, reportPath, blockers) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	try {
		await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-add-text-rich-runs-unit-v1.ps1'), '-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 180000, windowsHide: true })
		const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
		assert.equal(report.status, 'PASS')
		assert.equal(report.method, 'Presentations.Open2007')
		assert.equal(report.openAndRepair, false)
		assert.equal(report.saveCopyAs, true)
		assert.equal(report.reopened, true)
		const source = assertOfficeSnapshot(report.source, 'PowerPoint source')
		const roundtrip = assertOfficeSnapshot(report.roundtrip, 'PowerPoint roundtrip')
		assert.deepEqual(roundtrip, source, 'PowerPoint semantic snapshot changed after SaveCopyAs/reopen')
		return report
	} catch (error) {
		blockers.push({ code: 'POWERPOINT_TEXT_OPEN2007_SAVECOPYAS_REOPEN', stage: 'office', message: error?.message || String(error) })
		return { status: 'FAIL', reason: error?.message || String(error) }
	}
}

export async function runAddTextRichRunsProof({ outputDir, office = false } = {}) {
	assert.equal(ADD_TEXT_RICH_RUNS_ROWS.length, 2)
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-add-text-rich-runs-'))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `add-text-rich-runs-${Date.now()}`, clientInfo: { name: 'add-text-rich-runs-verifier', version: '1' }, blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const deckIds = []
	const blockers = []
	const artifacts = {}
	const lifecycle = []
	try {
		const created = dataOf('initial public spec', await mcp.call('betterpptx.deck.generate_from_spec', { spec: proofSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		entry.deckId = created.deckId
		await writeState(resolvedOutput, entry, expectationFor('initial'), blockers, artifacts, lifecycle)

		await commitPatch(mcp, entry, patchSpec('Updated text and rich runs', { text: 'Plain text updated', fontSize: 30 }, { text: richRuns('updated'), fontSize: 21 }), 'public update patch')
		await writeState(resolvedOutput, entry, expectationFor('updated'), blockers, artifacts, lifecycle)

		await commitPatch(mcp, entry, patchSpec('Reset text and rich runs', { text: null, fontFace: null, fontSize: null, color: null, bold: null, italic: null }, { text: null, fontFace: null, fontSize: null, color: null, bold: null, italic: null }), 'public patch.text=null reset')
		await writeState(resolvedOutput, entry, expectationFor('reset'), blockers, artifacts, lifecycle)

		await commitPatch(mcp, entry, patchSpec('Re-edited text and rich runs', { text: 'Plain text re-edited', fontFace: 'Aptos', fontSize: 25, color: '1D4ED8' }, { text: richRuns('reedited'), fontFace: 'Aptos', fontSize: 20, color: '111827' }), 'public re-edit patch')
		const finalState = await writeState(resolvedOutput, entry, expectationFor('reedited'), blockers, artifacts, lifecycle)

		const repeated = await pptxBuffer(entry)
		const repeatedPath = path.join(resolvedOutput, 'add-text-rich-runs-repeated-write.pptx')
		await writeImmutable(repeatedPath, repeated)
		const deterministic = await semanticPackageDiff(finalState.buffer, repeated)
		if (!deterministic.semanticPayloadsEqual) blockers.push({ code: 'TEXT_REPEATED_WRITE_SEMANTIC_DRIFT', stage: 'determinism', message: JSON.stringify(deterministic.semanticChanged) })
		artifacts.reedited.repeatedWrite = { sha256: sha256(repeated), ...deterministic }
		artifacts.repeatedWrite = { file: relative(repeatedPath), bytes: repeated.length, sha256: sha256(repeated) }

		const dryRunGate = await mutationGate({
			mcp, entry, label: 'valid public patch dry-run', code: 'TEXT_DRY_RUN_MUTATED_DECK', expected: /./,
			args: deckVersion => ({ deckId: entry.deckId, deckVersion, spec: patchSpec('Dry-run text patch', { text: 'Dry run only' }, { text: richRuns('updated') }), phase: 'dryRun', commitMode: 'patch', plan: 'premium', detail: 'full' }),
		})
		if (!dryRunGate.passed) blockers.push({ code: dryRunGate.code, stage: 'no-mutation', message: JSON.stringify(dryRunGate) })
		const rejectedGate = await mutationGate({
			mcp, entry, label: 'conflicting rich-run hyperlink rejection', code: 'TEXT_REJECTED_PATCH_MUTATED_DECK', expected: /hyperlink|exactly one|url|slide/i,
			args: deckVersion => ({ deckId: entry.deckId, deckVersion, spec: patchSpec('Invalid rich hyperlink patch', { text: 'Plain text re-edited' }, { text: [{ text: 'Invalid link', options: { hyperlink: { url: 'https://example.com/invalid', slide: 2 } } }] }), phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full' }),
		})
		if (!rejectedGate.passed) blockers.push({ code: rejectedGate.code, stage: 'no-mutation', message: JSON.stringify(rejectedGate) })

		const exported = dataOf('current spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: entry.deckId, mode: 'current', detail: 'full' })).spec
		assertExportedSpec(exported)
		const exportedPath = path.join(resolvedOutput, 'add-text-rich-runs-exported-spec.json')
		await writeImmutable(exportedPath, `${JSON.stringify(exported, null, 2)}\n`)
		artifacts.exportedSpec = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }
		const portable = portableSpec(exported)
		const portablePath = path.join(resolvedOutput, 'add-text-rich-runs-portable-spec.json')
		await writeImmutable(portablePath, `${JSON.stringify(portable, null, 2)}\n`)
		artifacts.portableSpec = { file: relative(portablePath), sha256: sha256(await fs.readFile(portablePath)) }
		const replay = dataOf('exported portable spec recompile', await mcp.call('betterpptx.deck.generate_from_spec', { spec: portable, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		replayEntry.deckId = replay.deckId
		const replayState = await writeState(resolvedOutput, replayEntry, expectationFor('recompiled'), blockers, artifacts, lifecycle)

		artifacts.finalPackageAudit = await runPackageAudit(finalState.file)
		artifacts.recompiledPackageAudit = await runPackageAudit(replayState.file)
		let officeResult = { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_ADD_TEXT_RICH_RUNS_OFFICE=1.' }
		if (office) {
			const roundtripPath = path.join(resolvedOutput, 'add-text-rich-runs-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'add-text-rich-runs-office-com.json')
			officeResult = await runOfficeProof(finalState.file, roundtripPath, reportPath, blockers)
			if (officeResult.status === 'PASS') {
				const roundtripBuffer = await fs.readFile(roundtripPath)
				officeResult.packageInspection = await inspectPackage(roundtripBuffer, expectationFor('reedited', { state: 'powerpoint-roundtrip', officeNormalized: true }), blockers)
				artifacts.officeRoundtrip = { file: relative(roundtripPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer), packageInspection: officeResult.packageInspection }
				artifacts.officeReport = { file: relative(reportPath), sha256: sha256(await fs.readFile(reportPath)) }
				artifacts.officePackageAudit = await runPackageAudit(roundtripPath)
			}
		}

		const uniqueBlockers = [...new Map(blockers.map(item => [`${item.code}|${item.stage}|${item.message}`, item])).values()]
		return {
			schemaVersion: 'betterpptx.add-text-rich-runs-unit-proof.v1', unitId: ADD_TEXT_RICH_RUNS_UNIT_ID,
			status: uniqueBlockers.length ? 'ADD_TEXT_RICH_RUNS_PRODUCTION_BLOCKED' : officeResult.status === 'PASS' ? 'ADD_TEXT_RICH_RUNS_PACKAGE_AND_OFFICE_VERIFIED' : 'ADD_TEXT_RICH_RUNS_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(), rows: ADD_TEXT_RICH_RUNS_ROWS.map(([id, label]) => ({ id, label })),
			boundary: {
				inScope: ['plain string text', 'mixed a:r runs', 'hard a:p breaks', 'soft a:br breaks', 'a:fld GUID/type/display text', 'external and internal run hyperlinks', 'run/body style reset and re-edit', 'export/recompile'],
				outOfScope: ['broad raw txBody passthrough', 'embedded fonts', 'WordArt and text effects', 'table-cell rich text', 'imported unmodeled paragraph/run children'],
				fieldOfficeRule: 'PowerPoint may recalculate a:fld display text; id, type, child order, non-empty display, surrounding runs, and hyperlink topology remain mandatory.',
				drawingMlWhitespaceRule: 'The exact a:t node value and PowerPoint source/roundtrip text are authoritative; xml:space is optional for DrawingML text when those spaces are retained.',
			},
			checks: {
				xmlParseCrcRelationshipAndContentTypeClosure: true, nativeTextCreatesNoMediaOrEmbeddedParts: true,
				plainAndMixedRichRunCarriers: true, hardSoftBreakAndNbspSemantics: true, fieldAndHyperlinkClosure: true,
				updateResetReedit: true, exportRecompile: true, deterministicRepeatedWrite: deterministic.semanticPayloadsEqual,
				dryRunNoMutation: dryRunGate.passed, rejectedPatchNoMutation: rejectedGate.passed,
				powerPointOpen2007SaveCopyAsReopen: officeResult.status === 'PASS', postOfficePackageInspection: officeResult.status === 'PASS' && Boolean(officeResult.packageInspection),
			},
			blockers: uniqueBlockers, mutationGates: [dryRunGate, rejectedGate], lifecycle, office: officeResult, artifacts,
			proofPath: relative(path.join(resolvedOutput, 'add-text-rich-runs-unit-proof.json')),
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
	const configured = cliValue('--output-dir') || process.env.BETTERPPTX_ADD_TEXT_RICH_RUNS_OUTPUT
	const outputDir = configured ? path.resolve(configured) : await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-add-text-rich-runs-${timestamp()}-`))
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_ADD_TEXT_RICH_RUNS_OFFICE === '1'
	const allowBlockers = process.argv.includes('--allow-blockers') || process.env.BETTERPPTX_ADD_TEXT_RICH_RUNS_ALLOW_BLOCKERS === '1'
	await fs.mkdir(outputDir, { recursive: true })
	let result
	try { result = await runAddTextRichRunsProof({ outputDir, office }) }
	catch (error) {
		result = { schemaVersion: 'betterpptx.add-text-rich-runs-unit-proof.v1', unitId: ADD_TEXT_RICH_RUNS_UNIT_ID, status: 'ADD_TEXT_RICH_RUNS_PRODUCTION_BLOCKED', generatedAt: new Date().toISOString(), blockers: [{ code: 'VERIFIER_FAILURE', stage: 'top-level', message: error?.stack || error?.message || String(error) }], proofPath: relative(path.join(outputDir, 'add-text-rich-runs-unit-proof.json')) }
	}
	const proofPath = path.join(outputDir, 'add-text-rich-runs-unit-proof.json')
	const proofPayloadSha256 = sha256(Buffer.from(JSON.stringify(result), 'utf8'))
	const final = { ...result, proofPayloadSha256 }
	await writeImmutable(proofPath, `${JSON.stringify(final, null, 2)}\n`)
	process.stdout.write(`${JSON.stringify(final, null, 2)}\n`)
	if (result.status.includes('BLOCKED') && !allowBlockers) process.exitCode = 1
}

if (path.resolve(process.argv[1] || '') === modulePath) main().catch(error => { console.error(error); process.exitCode = 1 })
