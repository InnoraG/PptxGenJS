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

import { LAYOUT_PRESET_RESOURCE_CONTRACTS } from './layout-preset-contract.mjs'
import { MASTER_PRESET_CONTRACT_ROWS } from './master-preset-contract.mjs'
import { MASTER_GALLERY_PRESETS, resolveLayoutThemeMasterSpec } from './source-api-gallery-presets.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(moduleDir, '..')
const UNIT_ID = 'impl-b-347a7269871e844d'
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const ROWS = Object.freeze([
	Object.freeze({ id: 'cap_710cbe6c18254277368c', label: 'Corporate Reference Wide Master -> master-corporate-reference-wide-001' }),
	Object.freeze({ id: 'cap_79221e7fc1efbeacf05f', label: 'Office Baseline Wide Master -> master-office-baseline-wide-001' }),
])
const CONTENT_TYPES = Object.freeze({
	slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
	layout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
	master: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
	theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
})
const RESOURCE_CASES = Object.freeze([
	Object.freeze({
		key: 'office-baseline-wide', short: 'office', masterPresetId: 'master-office-baseline-wide-001',
		templatePresetId: 'template-office-baseline-wide-001', templateFile: 'assets/templates/office-baseline-wide.pptx',
		defaultLayout: 'Title and Content', explicitLayoutPresetId: 'layout-office-baseline-wide-004', explicitLayout: 'Two Content', layoutCount: 11,
		reviewedRenderSha256: Object.freeze(['c90fc1f5ac78e87fa4d77702a3dffa9d5aaeb63a43bcfa3f83fb1050f5f4d015', '8a57a3239a2c95a872fb77341750a05610e08a8eb74dde00579351c52bbabd75']),
	}),
	Object.freeze({
		key: 'corporate-reference-wide', short: 'corporate', masterPresetId: 'master-corporate-reference-wide-001',
		templatePresetId: 'template-corporate-reference-wide-001', templateFile: 'assets/templates/corporate-layout-reference-wide.pptx',
		defaultLayout: 'CORP_TITLE_CONTENT_SAFE', explicitLayoutPresetId: 'layout-corporate-reference-wide-017', explicitLayout: 'CORP_DASHBOARD_METRICS', layoutCount: 19,
		reviewedRenderSha256: Object.freeze(['27651b5a6891fc8d2c42dbb3cc5de7e666ea7a065830465d835747e94b18893f', '5d6c220fc31a78d939ef40aac1bc97ff83383a784c3ef3f5cfb325eea31d5eed']),
	}),
])

function sha256(value) {
	return crypto.createHash('sha256').update(value).digest('hex')
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
	const raw = String(target || '').replaceAll('\\', '/')
	if (raw.startsWith('/')) return path.posix.normalize(raw.slice(1))
	return path.posix.normalize(path.posix.join(sourcePart ? path.posix.dirname(sourcePart) : '', raw))
}

function relsFor(documents, partName) {
	return relationshipRecords(documents.get(relationshipPartFor(partName)))
}

function relationshipId(node) {
	return node?.getAttribute('r:id') || node?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''
}

function targetById(sourcePart, rels, id) {
	const relationship = rels.find(item => item.Id === id)
	assert.ok(relationship, `${sourcePart}: missing relationship ${id}`)
	return resolveTarget(sourcePart, relationship.Target)
}

function numericPartSort(left, right) {
	return Number(left.match(/(\d+)\.xml$/)?.[1] || 0) - Number(right.match(/(\d+)\.xml$/)?.[1] || 0)
}

function cSldName(document) {
	return elements(document, 'cSld')[0]?.getAttribute('name') || ''
}

function ancestorCarrier(node) {
	let current = node
	while (current && !['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'].includes(current.localName)) current = current.parentNode
	return current
}

function placeholderRecord(carrier) {
	const placeholder = elements(carrier, 'ph')[0]
	if (!placeholder) return null
	return {
		type: placeholder.getAttribute('type') || '', idx: placeholder.getAttribute('idx') || '',
		sz: placeholder.getAttribute('sz') || '', orient: placeholder.getAttribute('orient') || '',
	}
}

function carrierSignature(document) {
	return elements(document, 'cNvPr').map(node => {
		const carrier = ancestorCarrier(node)
		return {
			kind: carrier?.localName || '', id: node.getAttribute('id') || '', name: node.getAttribute('name') || '',
			placeholder: placeholderRecord(carrier), text: elements(carrier, 't').map(item => item.textContent || '').join('\n'),
		}
	})
}

function themeSignature(document) {
	const typeface = family => elements(elements(document, family)[0], 'latin')[0]?.getAttribute('typeface') || ''
	const colors = {}
	for (const slot of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
		const child = elementChildren(elements(document, slot)[0])[0]
		colors[slot] = child ? { kind: child.localName, value: child.getAttribute('val') || child.getAttribute('lastClr') || '' } : null
	}
	return { name: document.documentElement?.getAttribute('name') || '', majorLatin: typeface('majorFont'), minorLatin: typeface('minorFont'), colors }
}

function scaffoldSignature(documents, layoutParts, masterPart, themePart) {
	const layouts = Object.fromEntries(layoutParts.map(part => {
		const document = documents.get(part)
		const root = document.documentElement
		return [cSldName(document), {
			matchingName: root.getAttribute('matchingName') || '', type: root.getAttribute('type') || '',
			preserve: root.getAttribute('preserve') || '', userDrawn: root.getAttribute('userDrawn') || '',
			showMasterSp: root.getAttribute('showMasterSp') || '', showMasterPhAnim: root.getAttribute('showMasterPhAnim') || '',
			carriers: carrierSignature(document),
		}]
	}))
	return {
		master: { name: cSldName(documents.get(masterPart)), carriers: carrierSignature(documents.get(masterPart)) },
		layouts,
		theme: themeSignature(documents.get(themePart)),
	}
}

function officeCanonicalScaffoldSignature(signature) {
	const result = structuredClone(signature)
	const normalizeCarriers = carriers => {
		for (const carrier of carriers || []) {
			if (carrier.placeholder?.type === 'dt') carrier.text = '__DYNAMIC_DATE_PLACEHOLDER__'
			if (carrier.placeholder?.type === 'sldNum') carrier.text = '__DYNAMIC_SLIDE_NUMBER_PLACEHOLDER__'
		}
	}
	normalizeCarriers(result.master?.carriers)
	for (const layout of Object.values(result.layouts || {})) normalizeCarriers(layout.carriers)
	return result
}

async function loadPackage(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort()
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${label}/${name}`))
	}
	return { zip, names, documents }
}

async function inspectPackage(buffer, state, resource, sourceSignature = null, expectedSlideLayouts = null, officeRoundtrip = false) {
	const { names, documents } = await loadPackage(buffer, state)
	const nameSet = new Set(names)
	for (const name of names.filter(item => item.endsWith('.rels'))) {
		const sourcePart = sourcePartForRelationships(name)
		const relationships = relationshipRecords(documents.get(name))
		assert.equal(new Set(relationships.map(item => item.Id)).size, relationships.length, `${state}/${name}: duplicate relationship Id`)
		for (const relationship of relationships.filter(item => String(item.TargetMode).toLowerCase() !== 'external')) {
			const target = resolveTarget(sourcePart, relationship.Target)
			assert.ok(nameSet.has(target), `${state}/${name}: dangling ${relationship.Id} -> ${target}`)
		}
	}
	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${state}: [Content_Types].xml missing`)
	const defaults = new Map(elements(contentTypes, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')]))
	const overrides = new Map(elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const part of overrides.keys()) assert.ok(nameSet.has(part), `${state}: orphan content-type override ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${state}: ${name} has no content type declaration`)
	}
	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericPartSort)
	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(numericPartSort)
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort(numericPartSort)
	const themeParts = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort(numericPartSort)
	assert.equal(masterParts.length, 1, `${state}: exactly one physical slide master`)
	assert.equal(layoutParts.length, resource.layoutCount, `${state}: exact native layout count`)
	if (officeRoundtrip) assert.ok([1, 2].includes(themeParts.length), `${state}: Office may retain one shared theme or split a notes-master theme`)
	else assert.equal(themeParts.length, 1, `${state}: exactly one theme part`)
	for (const part of slideParts) assert.equal(overrides.get(part), CONTENT_TYPES.slide, `${state}: ${part} content type`)
	for (const part of layoutParts) assert.equal(overrides.get(part), CONTENT_TYPES.layout, `${state}: ${part} content type`)
	for (const part of masterParts) assert.equal(overrides.get(part), CONTENT_TYPES.master, `${state}: ${part} content type`)
	for (const part of themeParts) assert.equal(overrides.get(part), CONTENT_TYPES.theme, `${state}: ${part} content type`)
	const presentationPart = 'ppt/presentation.xml'
	const presentationMasterTargets = relsFor(documents, presentationPart)
		.filter(item => item.Type === `${REL_BASE}slideMaster`).map(item => resolveTarget(presentationPart, item.Target)).sort()
	assert.deepEqual(presentationMasterTargets, masterParts, `${state}: presentation reaches every and only master`)
	const masterPart = masterParts[0]
	const masterRels = relsFor(documents, masterPart)
	const masterLayoutTargets = masterRels.filter(item => item.Type === `${REL_BASE}slideLayout`).map(item => resolveTarget(masterPart, item.Target)).sort()
	const masterListedTargets = elements(documents.get(masterPart), 'sldLayoutId')
		.map(node => targetById(masterPart, masterRels, relationshipId(node))).sort()
	assert.deepEqual(masterLayoutTargets, masterListedTargets, `${state}: master layout relationships and list disagree`)
	assert.deepEqual(masterLayoutTargets, [...layoutParts].sort(), `${state}: orphan or unlisted layout`)
	const masterThemeTargets = masterRels.filter(item => item.Type === `${REL_BASE}theme`).map(item => resolveTarget(masterPart, item.Target))
	assert.equal(masterThemeTargets.length, 1, `${state}: master must reach exactly one theme`)
	assert.ok(themeParts.includes(masterThemeTargets[0]), `${state}: master theme target exists`)
	let officeThemeTopology = null
	if (officeRoundtrip && themeParts.length === 2) {
		const notesMasterParts = names.filter(name => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(name)).sort(numericPartSort)
		assert.equal(notesMasterParts.length, 1, `${state}: split notes theme requires exactly one notes master`)
		const presentationNotesTargets = relsFor(documents, presentationPart)
			.filter(item => item.Type === `${REL_BASE}notesMaster`).map(item => resolveTarget(presentationPart, item.Target))
		assert.deepEqual(presentationNotesTargets, notesMasterParts, `${state}: presentation must reach the notes master`)
		const notesThemeTargets = relsFor(documents, notesMasterParts[0])
			.filter(item => item.Type === `${REL_BASE}theme`).map(item => resolveTarget(notesMasterParts[0], item.Target))
		assert.equal(notesThemeTargets.length, 1, `${state}: notes master must reach exactly one theme`)
		const reachedThemes = [...new Set([...masterThemeTargets, ...notesThemeTargets])].sort()
		assert.deepEqual(reachedThemes, [...themeParts].sort(), `${state}: no orphan Office-created theme`)
		assert.deepEqual(themeSignature(documents.get(notesThemeTargets[0])), themeSignature(documents.get(masterThemeTargets[0])), `${state}: split notes theme remains semantically equal to the master theme`)
		officeThemeTopology = { mode: 'office-notes-theme-split', masterTheme: masterThemeTargets[0], notesTheme: notesThemeTargets[0] }
	} else if (officeRoundtrip) {
		officeThemeTopology = { mode: 'shared-theme', masterTheme: masterThemeTargets[0] }
	}
	for (const layoutPart of layoutParts) {
		const parentTargets = relsFor(documents, layoutPart)
			.filter(item => item.Type === `${REL_BASE}slideMaster`).map(item => resolveTarget(layoutPart, item.Target))
		assert.deepEqual(parentTargets, [masterPart], `${state}: ${layoutPart} reverse master edge`)
	}
	const layoutNameByPart = new Map(layoutParts.map(part => [part, cSldName(documents.get(part))]))
	assert.equal(new Set(layoutNameByPart.values()).size, resource.layoutCount, `${state}: unique layout names`)
	assert.ok([...layoutNameByPart.values()].includes(resource.defaultLayout), `${state}: default layout exists`)
	assert.ok([...layoutNameByPart.values()].includes(resource.explicitLayout), `${state}: explicit proof layout exists`)
	const slideLayoutNames = []
	for (const slidePart of slideParts) {
		const layoutTargets = relsFor(documents, slidePart)
			.filter(item => item.Type === `${REL_BASE}slideLayout`).map(item => resolveTarget(slidePart, item.Target))
		assert.equal(layoutTargets.length, 1, `${state}: ${slidePart} exactly one layout binding`)
		assert.ok(layoutNameByPart.has(layoutTargets[0]), `${state}: ${slidePart} layout is listed by master`)
		slideLayoutNames.push(layoutNameByPart.get(layoutTargets[0]))
	}
	if (expectedSlideLayouts) assert.deepEqual(slideLayoutNames, expectedSlideLayouts, `${state}: slide layout binding names`)
	const signature = scaffoldSignature(documents, layoutParts, masterPart, masterThemeTargets[0])
	if (sourceSignature) {
		const comparableActual = officeRoundtrip ? officeCanonicalScaffoldSignature(signature) : signature
		const comparableSource = officeRoundtrip ? officeCanonicalScaffoldSignature(sourceSignature) : sourceSignature
		assert.deepEqual(comparableActual, comparableSource, `${state}: bundled master/layout/theme carriers changed`)
	}
	return {
		state, partCount: names.length, slideCount: slideParts.length, masterCount: masterParts.length,
		layoutCount: layoutParts.length, themeCount: themeParts.length, slideLayoutNames,
		layoutNames: [...layoutNameByPart.values()], signature, officeThemeTopology,
	}
}

function normalizeCoreXml(bytes, label) {
	const document = parseXmlStrict(bytes.toString('utf8'), label)
	for (const localName of ['created', 'modified']) {
		for (const node of elements(document, localName)) {
			while (node.firstChild) node.removeChild(node.firstChild)
		}
	}
	return Buffer.from(new XMLSerializer().serializeToString(document), 'utf8')
}

async function stableMemberSnapshot(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const snapshot = {}
	for (const name of Object.keys(zip.files).filter(item => !zip.files[item].dir).sort()) {
		let bytes = await zip.file(name).async('nodebuffer')
		if (name === 'docProps/core.xml') bytes = normalizeCoreXml(bytes, `${label}/${name}`)
		snapshot[name] = sha256(bytes)
	}
	return snapshot
}

async function assertStableMembers(before, after, label) {
	const [beforeSnapshot, afterSnapshot] = await Promise.all([
		stableMemberSnapshot(before, `${label}-before`), stableMemberSnapshot(after, `${label}-after`),
	])
	assert.deepEqual(afterSnapshot, beforeSnapshot, `${label}: rejected request changed stable package members`)
	return { stableMemberCount: Object.keys(beforeSnapshot).length, normalizedOnly: ['docProps/core.xml created', 'docProps/core.xml modified'] }
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove native master selection', remember: 'master, layouts, theme, relationships' },
		visualDesign: { world: 'blueprint', framing: 'native carrier audit', tone: 'technical' },
		motionTime: { masterClock: 'authored static slides', timingSource: 'static', syncPolicy: 'single static clock' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	}
}

function authoredSpec(resource) {
	return {
		...metadata(`Master selector proof — ${resource.short}`),
		masterPresetId: resource.masterPresetId,
		slides: [
			{
				id: `${resource.short}-default`, layoutIntent: 'title-only',
				content: [{ kind: 'textBox', name: 'default-note', text: `${resource.short} default native layout` }],
			},
			{
				id: `${resource.short}-explicit`, layoutIntent: 'title-only', layoutPresetId: resource.explicitLayoutPresetId,
				content: [{ kind: 'textBox', name: 'explicit-note', text: `${resource.short} explicit native layout` }],
			},
		],
	}
}

function patchSpec(resource, mode) {
	const base = { ...metadata(`Master selector proof — ${resource.short}`), slides: [] }
	if (mode === 'reset') {
		return {
			...base, masterPresetId: resource.masterPresetId,
			slides: [{ id: `${resource.short}-explicit`, slideIndex: 1, layoutPresetId: null, content: [] }],
		}
	}
	if (mode === 'reedit') {
		return {
			...base, masterPresetId: resource.masterPresetId,
			slides: [{ id: `${resource.short}-explicit`, slideIndex: 1, layoutPresetId: resource.explicitLayoutPresetId, content: [] }],
		}
	}
	throw new Error(`Unknown patch mode ${mode}`)
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function writeImmutable(file, value, encoding = undefined) {
	await fs.writeFile(file, value, { ...(encoding ? { encoding } : {}), flag: 'wx' })
}

async function writeCheckpoint(outputDir, entry, name, resource, sourceSignature, expectedLayouts, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `master-preset-${resource.short}-${name}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, `${resource.short}-${name}`, resource, sourceSignature, expectedLayouts)
	artifacts[`${resource.short}-${name}`] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { file, buffer, inspection }
}

async function commitPatch(mcp, deckId, entry, resource, mode) {
	const result = dataOf(`${resource.short} ${mode}`, await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: entry.deckVersion, spec: patchSpec(resource, mode), phase: 'commit', commitMode: 'patch',
		plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	assert.deepEqual(result.unsupportedFindings || [], [], `${resource.short} ${mode}: unsupported findings`)
	return result
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

function failureText(result) {
	return JSON.stringify(result)
}

async function assertRejectedWithoutMutation({ mcp, deckId, entry, resource, invalidSpec, expected, label }) {
	const beforeVersion = entry.deckVersion
	const beforeBuffer = await pptxBuffer(entry)
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: beforeVersion, spec: invalidSpec, phase: 'commit', commitMode: 'patch',
		plan: 'premium', billingConfirmed: true, detail: 'full',
	})
	const diagnostic = failureText(result)
	assert.equal(result?.ok, false, `${label}: invalid selector was accepted: ${diagnostic}`)
	assert.match(diagnostic, expected, `${label}: precise fail-closed diagnostic`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: rejected selector changed deck version`)
	const afterBuffer = await pptxBuffer(entry)
	const stable = await assertStableMembers(beforeBuffer, afterBuffer, label)
	await inspectPackage(afterBuffer, `${resource.short}-${label}-after`, resource, null, [resource.defaultLayout, resource.explicitLayout])
	return { label, rejected: true, deckVersion: beforeVersion, diagnostic: diagnostic.slice(0, 1000), ...stable }
}

function assertExport(exported, resource, label) {
	assert.equal(exported.template?.templatePresetId, resource.templatePresetId, `${label}: template selector recovery`)
	assert.equal(exported.masterPresetId, resource.masterPresetId, `${label}: exact master selector recovery`)
	assert.equal(exported.slides?.length, 2, `${label}: slide count`)
	assert.deepEqual(exported.slides.map(slide => slide.layoutName), [resource.defaultLayout, resource.explicitLayout], `${label}: effective layout names`)
}

function normalizeOfficeSnapshot(snapshot) {
	return {
		SlideCount: snapshot.SlideCount, DesignCount: snapshot.DesignCount,
		Master: snapshot.Master, Layouts: snapshot.Layouts, Slides: snapshot.Slides,
	}
}

function assertOfficeSnapshot(snapshot, resource, label) {
	assert.equal(snapshot.SlideCount, 2, `${label}: slide count`)
	assert.equal(snapshot.DesignCount, 1, `${label}: one PowerPoint design/master`)
	assert.equal(snapshot.Layouts.length, resource.layoutCount, `${label}: native layout count`)
	assert.deepEqual(snapshot.Slides.map(slide => slide.LayoutName), [resource.defaultLayout, resource.explicitLayout], `${label}: slide layout bindings`)
	assert.ok(snapshot.Layouts.some(layout => layout.Name === resource.defaultLayout), `${label}: default layout exists`)
	assert.ok(snapshot.Layouts.some(layout => layout.Name === resource.explicitLayout), `${label}: explicit layout exists`)
	assert.ok(Number(snapshot.Master.ShapeCount) > 0, `${label}: master shapes survived`)
	for (const layout of snapshot.Layouts) {
		assert.ok(Number(layout.ShapeCount) > 0, `${label}: ${layout.Name} shapes survived`)
		assert.ok(Number(layout.PlaceholderCount) >= 0, `${label}: ${layout.Name} placeholder count readable`)
	}
}

async function runOfficeProof(inputPath, outputPath, reportPath, resource) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const sourceRenderDir = outputPath.replace(/\.pptx$/i, '-generated-renders')
	const roundtripRenderDir = outputPath.replace(/\.pptx$/i, '-reopened-renders')
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-master-preset-selectors-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.saveCopyAs, true)
	assert.equal(report.reopened, true)
	assertOfficeSnapshot(report.source, resource, `${resource.short} Office source`)
	assertOfficeSnapshot(report.roundtrip, resource, `${resource.short} Office roundtrip`)
	assert.deepEqual(normalizeOfficeSnapshot(report.roundtrip), normalizeOfficeSnapshot(report.source), `${resource.short}: Office source/roundtrip semantic equality`)
	const [sourceNames, roundtripNames] = await Promise.all([fs.readdir(sourceRenderDir), fs.readdir(roundtripRenderDir)])
	const pngNames = names => names.filter(name => name.toLowerCase().endsWith('.png')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
	assert.deepEqual(pngNames(sourceNames), ['slide-1.png', 'slide-2.png'], `${resource.short}: generated PowerPoint render inventory`)
	assert.deepEqual(pngNames(roundtripNames), ['slide-1.png', 'slide-2.png'], `${resource.short}: reopened PowerPoint render inventory`)
	const renderEvidence = []
	for (const name of pngNames(sourceNames)) {
		const sourceFile = path.join(sourceRenderDir, name)
		const roundtripFile = path.join(roundtripRenderDir, name)
		const [sourceBytes, roundtripBytes] = await Promise.all([fs.readFile(sourceFile), fs.readFile(roundtripFile)])
		const sourceHash = sha256(sourceBytes)
		const roundtripHash = sha256(roundtripBytes)
		assert.equal(roundtripHash, sourceHash, `${resource.short}/${name}: PowerPoint-rendered pixels changed after SaveCopyAs/reopen`)
		assert.equal(sourceHash, resource.reviewedRenderSha256[renderEvidence.length], `${resource.short}/${name}: render no longer matches the manually inspected frozen visual baseline`)
		renderEvidence.push({
			slide: Number(name.match(/(\d+)/)?.[1] || 0), layoutName: report.source.Slides[renderEvidence.length]?.LayoutName || '',
			generated: { file: relative(sourceFile), bytes: sourceBytes.length, sha256: sourceHash },
			reopened: { file: relative(roundtripFile), bytes: roundtripBytes.length, sha256: roundtripHash },
			exactPngBytesEqual: true, reviewedBaselineMatch: true,
		})
	}
	return { ...report, renderEvidence }
}

async function sourceResourceInspection(resource) {
	const file = path.join(moduleDir, resource.templateFile)
	const buffer = await fs.readFile(file)
	const inspected = await inspectPackage(buffer, `${resource.short}-bundled-source`, { ...resource, layoutCount: resource.layoutCount }, null, null)
	return { file, buffer, inspected }
}

function assertRegistryContract() {
	assert.equal(ROWS.length, 2)
	assert.equal(new Set(ROWS.map(row => row.id)).size, 2)
	assert.equal(MASTER_GALLERY_PRESETS.length, 2)
	assert.equal(MASTER_PRESET_CONTRACT_ROWS.length, 2)
	for (const resource of RESOURCE_CASES) {
		const contract = LAYOUT_PRESET_RESOURCE_CONTRACTS[resource.key]
		const masterContract = MASTER_PRESET_CONTRACT_ROWS.find(item => item.id === resource.masterPresetId)
		assert.ok(contract, `${resource.short}: layout resource contract`)
		assert.ok(masterContract, `${resource.short}: master selector contract`)
		assert.equal(contract.masterId, resource.masterPresetId)
		assert.equal(contract.templatePresetId, resource.templatePresetId)
		assert.equal(contract.defaultLayout, resource.defaultLayout)
		assert.equal(masterContract.templatePresetId, resource.templatePresetId)
		assert.equal(masterContract.defaultLayout, resource.defaultLayout)
		const resolved = resolveLayoutThemeMasterSpec({ masterPresetId: resource.masterPresetId, slides: [] })
		assert.equal(resolved.template?.templatePresetId, resource.templatePresetId)
		assert.equal(resolved.template?.defaultLayout, resource.defaultLayout)
		assert.equal(resolved.template?.preserveLayouts, true)
		assert.equal(resolved.template?.strictLayout, true)
		assert.throws(
			() => resolveLayoutThemeMasterSpec({ masterPresetId: null, slides: [] }),
			/non-null bundled master preset IDs/i,
			`${resource.short}: master resource removal must use replace/create rather than an in-place null reset`,
		)
	}
}

export async function runMasterPresetSelectorProof({ outputDir, office = false } = {}) {
	assertRegistryContract()
	const resolvedOutput = outputDir
		? path.resolve(outputDir)
		: await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-master-preset-selectors-'))
	if (outputDir) await fs.mkdir(resolvedOutput, { recursive: false })
	const existing = await fs.readdir(resolvedOutput)
	assert.deepEqual(existing, [], `Output directory must be new and empty: ${resolvedOutput}`)
	const sourceInspections = Object.fromEntries(await Promise.all(RESOURCE_CASES.map(async resource => {
		const source = await sourceResourceInspection(resource)
		return [resource.key, source]
	})))
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `master-preset-selectors-${Date.now()}`,
		clientInfo: { name: 'master-preset-selectors-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true,
	})
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	const negativeMutationGates = []
	const officeCheckpoints = []
	try {
		for (const resource of RESOURCE_CASES) {
			const source = sourceInspections[resource.key]
			const committed = dataOf(`${resource.short} initial commit`, await mcp.call('betterpptx.deck.generate_from_spec', {
				spec: authoredSpec(resource), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
			}))
			deckIds.push(committed.deckId)
			const entry = getDeck(committed.deckId)
			assert.equal(entry._betterpptxTemplatePresetId, resource.templatePresetId, `${resource.short}: runtime resource identity`)
			await writeCheckpoint(resolvedOutput, entry, 'initial', resource, source.inspected.signature, [resource.defaultLayout, resource.explicitLayout], artifacts, lifecycle)

			await commitPatch(mcp, committed.deckId, entry, resource, 'reset')
			await writeCheckpoint(resolvedOutput, entry, 'reset', resource, source.inspected.signature, [resource.defaultLayout, resource.defaultLayout], artifacts, lifecycle)
			const resetExport = dataOf(`${resource.short} reset export`, await mcp.call('betterpptx.deck.export_spec', {
				deckId: committed.deckId, mode: 'current', download: false, detail: 'full',
			})).spec
			assert.equal(resetExport.template?.templatePresetId, resource.templatePresetId, `${resource.short}: same-resource reset retains source resource`)

			await commitPatch(mcp, committed.deckId, entry, resource, 'reedit')
			const finalState = await writeCheckpoint(resolvedOutput, entry, 'final', resource, source.inspected.signature, [resource.defaultLayout, resource.explicitLayout], artifacts, lifecycle)

			const other = RESOURCE_CASES.find(item => item.key !== resource.key)
			negativeMutationGates.push(await assertRejectedWithoutMutation({
				mcp, deckId: committed.deckId, entry, resource, label: `${resource.short}-null-master`, expected: /non-null bundled master preset IDs|replace the deck/i,
				invalidSpec: { ...metadata(`Master selector proof — ${resource.short}`), masterPresetId: null, slides: [] },
			}))
			negativeMutationGates.push(await assertRejectedWithoutMutation({
				mcp, deckId: committed.deckId, entry, resource, label: `${resource.short}-cross-resource-master`, expected: /different template resources|cannot change|cross.resource/i,
				invalidSpec: { ...metadata(`Master selector proof — ${resource.short}`), masterPresetId: other.masterPresetId, slides: [] },
			}))
			negativeMutationGates.push(await assertRejectedWithoutMutation({
				mcp, deckId: committed.deckId, entry, resource, label: `${resource.short}-unknown-master`, expected: /unknown layout\/theme\/master gallery preset/i,
				invalidSpec: { ...metadata(`Master selector proof — ${resource.short}`), masterPresetId: 'master-does-not-exist-999', slides: [] },
			}))
			negativeMutationGates.push(await assertRejectedWithoutMutation({
				mcp, deckId: committed.deckId, entry, resource, label: `${resource.short}-mixed-resource-selectors`, expected: /different template resources/i,
				invalidSpec: {
					...metadata(`Master selector proof — ${resource.short}`), masterPresetId: resource.masterPresetId,
					slides: [{ id: `${resource.short}-explicit`, slideIndex: 1, layoutPresetId: other.explicitLayoutPresetId, content: [] }],
				},
			}))

			const exported = dataOf(`${resource.short} final export`, await mcp.call('betterpptx.deck.export_spec', {
				deckId: committed.deckId, mode: 'current', download: false, detail: 'full',
			})).spec
			const exportedPath = path.join(resolvedOutput, `master-preset-${resource.short}-exported-spec.json`)
			await writeImmutable(exportedPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
			artifacts[`${resource.short}-exported-spec`] = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }
			const replay = dataOf(`${resource.short} portable recompile`, await mcp.call('betterpptx.deck.generate_from_spec', {
				spec: portableSpec(exported), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
			}))
			assertExport(exported, resource, `${resource.short} export`)
			deckIds.push(replay.deckId)
			const replayEntry = getDeck(replay.deckId)
			assert.equal(replayEntry._betterpptxTemplatePresetId, resource.templatePresetId, `${resource.short}: recompiled resource identity`)
			await writeCheckpoint(resolvedOutput, replayEntry, 'recompiled', resource, source.inspected.signature, [resource.defaultLayout, resource.explicitLayout], artifacts, lifecycle)
			const replayExport = dataOf(`${resource.short} replay export`, await mcp.call('betterpptx.deck.export_spec', {
				deckId: replay.deckId, mode: 'current', download: false, detail: 'full',
			})).spec
			assertExport(replayExport, resource, `${resource.short} replay export`)

			if (office) {
				const outputPath = path.join(resolvedOutput, `master-preset-${resource.short}-office-savecopyas.pptx`)
				const reportPath = path.join(resolvedOutput, `master-preset-${resource.short}-office-com.json`)
				const report = await runOfficeProof(finalState.file, outputPath, reportPath, resource)
				const roundtripBuffer = await fs.readFile(outputPath)
				const packageInspection = await inspectPackage(roundtripBuffer, `${resource.short}-office-roundtrip`, resource, source.inspected.signature, [resource.defaultLayout, resource.explicitLayout], true)
				officeCheckpoints.push({
					resourceKey: resource.key, status: report.status, reportFile: relative(reportPath), roundtripFile: relative(outputPath),
					roundtripSha256: sha256(roundtripBuffer), renderEvidence: report.renderEvidence, package: packageInspection,
				})
				artifacts[`${resource.short}-office-roundtrip`] = { file: relative(outputPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
				for (const render of report.renderEvidence) {
					artifacts[`${resource.short}-generated-render-slide-${render.slide}`] = render.generated
					artifacts[`${resource.short}-reopened-render-slide-${render.slide}`] = render.reopened
				}
			}
		}

		return {
			schemaVersion: 'betterpptx.master-preset-selectors-unit-proof.v1', unitId: UNIT_ID,
			status: office
				? 'MASTER_PRESET_SELECTORS_PACKAGE_AND_OFFICE_VERIFIED'
				: 'MASTER_PRESET_SELECTORS_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(), rows: ROWS,
			checks: {
				registryAndResourceResolution: true, xmlParseAndOpcClosure: true, relationshipAndContentTypeClosure: true,
				exactOnePhysicalMasterAndOneMasterThemePerGeneratedResource: true, exactNativeLayoutInventories: true,
				sourceCarrierSemanticPreservation: true, slideToLayoutToMasterToThemeClosure: true,
				masterNullFailClosedAndSameResourceReselection: true, exportAndPortableRecompile: true,
				failClosedNoMutationNullUnknownMixedAndCrossResource: negativeMutationGates.length === 8,
				powerPointOpen2007SaveCopyAsReopen: office && officeCheckpoints.length === 2,
				officeNotesMasterThemeCanonicalizationClosed: office && officeCheckpoints.every(item => ['shared-theme', 'office-notes-theme-split'].includes(item.package?.officeThemeTopology?.mode)),
				representativeGeneratedAndReopenedPowerPointRenders: office && officeCheckpoints.every(item => item.renderEvidence?.length === 2 && item.renderEvidence.every(render => render.exactPngBytesEqual && render.reviewedBaselineMatch)),
			},
			proofBoundary: {
				inScope: 'exact bundled one-master resource selection, all native layouts and placeholders/fixed carriers, theme and relationship graph, same-resource reselection, per-slide layout null reset, portable export/recompile, fail-closed selector errors, and representative PowerPoint renders',
				outOfScope: 'masterPresetId:null, master-resource removal, multi-master synthesis, and cross-resource in-place migration; immutable master replacement/removal requires a full replace/create workflow',
			},
			visualInspection: office ? {
				status: 'PASS', reviewedAt: '2026-08-28',
				method: 'Microsoft PowerPoint slide.Export at 1600x900; all four generated images were inspected individually at original size, then frozen by SHA-256; reopened renders must be byte-identical to those reviewed baselines.',
				observations: [
					'Office default and Two Content descendants render as clean native canvases with the authored proof labels visible and unclipped.',
					'Corporate default and dashboard descendants retain the native navy header, teal brand geometry, footer system, and authored proof labels without a SaveCopyAs visual change.',
					'The generated and reopened PNG bytes are identical for both slides in both resources.',
				],
				evidence: officeCheckpoints.flatMap(item => item.renderEvidence || []),
			} : { status: 'dependency-gated', reason: 'PowerPoint render inspection requires --office.' },
			blockers: [], negativeMutationGates, sourceResources: Object.fromEntries(RESOURCE_CASES.map(resource => [resource.key, {
				file: relative(sourceInspections[resource.key].file), sha256: sha256(sourceInspections[resource.key].buffer),
				masterCount: sourceInspections[resource.key].inspected.masterCount, layoutCount: sourceInspections[resource.key].inspected.layoutCount,
				themeCount: sourceInspections[resource.key].inspected.themeCount, layoutNames: sourceInspections[resource.key].inspected.layoutNames,
			}])), lifecycle,
			office: office ? { status: 'PASS', checkpoints: officeCheckpoints } : { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_MASTER_PRESET_OFFICE=1.' },
			artifacts, proofPath: relative(path.join(resolvedOutput, 'master-preset-selectors-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const configured = process.env.BETTERPPTX_MASTER_PRESET_OUTPUT
	const outputDir = configured
		? path.resolve(configured)
		: path.join(workspaceRoot, 'validation-output', `master-preset-selectors-${timestamp()}-${crypto.randomUUID()}`)
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_MASTER_PRESET_OFFICE === '1'
	let result
	try {
		result = await runMasterPresetSelectorProof({ outputDir, office })
	} catch (error) {
		result = {
			schemaVersion: 'betterpptx.master-preset-selectors-unit-proof.v1', unitId: UNIT_ID,
			status: 'MASTER_PRESET_SELECTORS_PRODUCTION_BLOCKED', generatedAt: new Date().toISOString(), rows: ROWS,
			blockers: [{ message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }],
			proofPath: relative(path.join(outputDir, 'master-preset-selectors-unit-proof.json')),
		}
	}
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'master-preset-selectors-unit-proof.json')
	await writeImmutable(proofPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify({ ...result, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2))
	if (result.status === 'MASTER_PRESET_SELECTORS_PRODUCTION_BLOCKED') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
