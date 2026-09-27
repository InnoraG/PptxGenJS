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
const UNIT_ID = 'impl-b-e691a66447bfe6e0'
const ROW = Object.freeze({ id: 'cap_fa5b7e33364aea2a6543', label: 'multiple slide masters' })
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const CONTENT_TYPES = Object.freeze({
	slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
	layout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
	master: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
	theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
})
const MASTER_NAMES = Object.freeze(['Master Alpha', 'Master Beta'])
const LAYOUT_NAMES = Object.freeze(['ALPHA_LAYOUT', 'BETA_LAYOUT'])
const INITIAL_MARKERS = Object.freeze(['master-alpha-v1', 'master-beta-v1'])
const REEDITED_MARKERS = Object.freeze(['master-alpha-v2', 'master-beta-v2'])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const timestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
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

const elements = (node, localName) => Array.from(node?.getElementsByTagName('*') || []).filter(item => item.localName === localName)
const relationships = document => elements(document, 'Relationship').map(node => ({
	Id: node.getAttribute('Id'), Type: node.getAttribute('Type'), Target: node.getAttribute('Target'), TargetMode: node.getAttribute('TargetMode'),
}))
const relationshipPartFor = part => path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`)
const sourcePartForRelationships = rel => rel === '_rels/.rels' ? '' : path.posix.join(path.posix.dirname(path.posix.dirname(rel)), path.posix.basename(rel, '.rels'))
const resolveTarget = (source, target) => {
	const raw = String(target || '').replaceAll('\\', '/')
	return raw.startsWith('/') ? path.posix.normalize(raw.slice(1)) : path.posix.normalize(path.posix.join(source ? path.posix.dirname(source) : '', raw))
}
const relationshipId = node => node?.getAttribute('r:id') || node?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''
const numericPartSort = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0)
const cSldName = document => elements(document, 'cSld')[0]?.getAttribute('name') || ''

async function loadPackage(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort()
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${label}/${name}`))
	}
	return { names, documents }
}

function relsFor(documents, part) {
	return relationships(documents.get(relationshipPartFor(part)))
}

function targetById(documents, sourcePart, id) {
	const rel = relsFor(documents, sourcePart).find(item => item.Id === id)
	assert.ok(rel, `${sourcePart}: missing relationship ${id}`)
	return resolveTarget(sourcePart, rel.Target)
}

function markerNames(document) {
	return elements(document, 'cNvPr').map(node => node.getAttribute('name')).filter(name => /^master-(?:alpha|beta)-v\d+$/.test(name))
}

function assertContentType(overrides, part, expected, label) {
	assert.equal(overrides.get(part), expected, `${label}: ${part} content type`)
}

async function inspectPackage(buffer, label, expectedMarkers, { officeRoundtrip = false } = {}) {
	const { names, documents } = await loadPackage(buffer, label)
	const nameSet = new Set(names)
	for (const relName of names.filter(name => name.endsWith('.rels'))) {
		const source = sourcePartForRelationships(relName)
		const records = relationships(documents.get(relName))
		assert.equal(new Set(records.map(item => item.Id)).size, records.length, `${label}/${relName}: duplicate relationship Id`)
		for (const rel of records.filter(item => String(item.TargetMode).toLowerCase() !== 'external')) {
			const target = resolveTarget(source, rel.Target)
			assert.ok(nameSet.has(target), `${label}/${relName}: dangling ${rel.Id} -> ${target}`)
		}
	}

	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${label}: [Content_Types].xml missing`)
	const defaultRecords = elements(contentTypes, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')])
	const overrideRecords = elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')])
	assert.equal(new Set(defaultRecords.map(([extension]) => extension)).size, defaultRecords.length, `${label}: duplicate content-type default extension`)
	assert.equal(new Set(overrideRecords.map(([part]) => part)).size, overrideRecords.length, `${label}: duplicate content-type override`)
	const defaults = new Map(defaultRecords)
	const overrides = new Map(overrideRecords)
	for (const part of overrides.keys()) assert.ok(nameSet.has(part), `${label}: orphan content-type override ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: ${name} has no content type declaration`)
	}

	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericPartSort)
	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(numericPartSort)
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort(numericPartSort)
	const themeParts = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort(numericPartSort)
	assert.equal(slideParts.length, 2, `${label}: exact slide count`)
	assert.equal(masterParts.length, 2, `${label}: exactly two physical slide masters`)
	assert.ok(layoutParts.length >= 2, `${label}: at least two native layouts`)
	if (officeRoundtrip) assert.ok([2, 3].includes(themeParts.length), `${label}: two master themes plus optional Office notes-master split`)
	else assert.equal(themeParts.length, 2, `${label}: exactly one theme part per physical master`)
	for (const part of slideParts) assertContentType(overrides, part, CONTENT_TYPES.slide, label)
	for (const part of layoutParts) assertContentType(overrides, part, CONTENT_TYPES.layout, label)
	for (const part of masterParts) assertContentType(overrides, part, CONTENT_TYPES.master, label)
	for (const part of themeParts) assertContentType(overrides, part, CONTENT_TYPES.theme, label)

	const presentationPart = 'ppt/presentation.xml'
	const presentation = documents.get(presentationPart)
	const presentationRels = relsFor(documents, presentationPart)
	const presentationMasterTargets = presentationRels.filter(item => item.Type === `${REL_BASE}slideMaster`).map(item => resolveTarget(presentationPart, item.Target)).sort(numericPartSort)
	const masterIdNodes = elements(presentation, 'sldMasterId')
	const listedMasterTargets = masterIdNodes.map(node => targetById(documents, presentationPart, relationshipId(node)))
	assert.deepEqual(presentationMasterTargets, masterParts, `${label}: presentation reaches every and only physical master`)
	assert.deepEqual(listedMasterTargets, masterParts, `${label}: ordered sldMasterIdLst and presentation relationships disagree`)
	const masterIds = masterIdNodes.map(node => BigInt(node.getAttribute('id')))
	assert.equal(new Set(masterIds.map(String)).size, 2, `${label}: unique master numeric IDs`)
	assert.ok(masterIds[0] < masterIds[1], `${label}: ordered increasing master numeric IDs`)

	const layoutOwner = new Map()
	const reachedThemes = new Set()
	const masterRecords = []
	const allMarkers = []
	const globalLayoutIds = []
	for (const masterPart of masterParts) {
		const document = documents.get(masterPart)
		const rels = relsFor(documents, masterPart)
		const relatedLayouts = rels.filter(item => item.Type === `${REL_BASE}slideLayout`).map(item => resolveTarget(masterPart, item.Target)).sort(numericPartSort)
		const layoutIdNodes = elements(document, 'sldLayoutId')
		const listedLayouts = layoutIdNodes.map(node => targetById(documents, masterPart, relationshipId(node))).sort(numericPartSort)
		globalLayoutIds.push(...layoutIdNodes.map(node => node.getAttribute('id')))
		assert.ok(relatedLayouts.length >= 1, `${label}: ${masterPart} owns at least one layout`)
		assert.deepEqual(listedLayouts, relatedLayouts, `${label}: ${masterPart} relationship/list layout closure`)
		for (const layoutPart of relatedLayouts) {
			assert.ok(layoutParts.includes(layoutPart), `${label}: ${masterPart} targets a real layout`)
			assert.equal(layoutOwner.has(layoutPart), false, `${label}: ${layoutPart} is owned by more than one master`)
			layoutOwner.set(layoutPart, masterPart)
		}
		const masterThemes = rels.filter(item => item.Type === `${REL_BASE}theme`).map(item => resolveTarget(masterPart, item.Target))
		assert.equal(masterThemes.length, 1, `${label}: ${masterPart} reaches exactly one theme`)
		assert.ok(themeParts.includes(masterThemes[0]), `${label}: ${masterPart} theme exists`)
		reachedThemes.add(masterThemes[0])
		const markers = markerNames(document)
		allMarkers.push(...markers)
		masterRecords.push({ part: masterPart, name: cSldName(document), layoutParts: relatedLayouts, themePart: masterThemes[0], markers })
	}
	assert.equal(layoutOwner.size, layoutParts.length, `${label}: no orphan or multiply-owned layout`)
	assert.equal(new Set(globalLayoutIds).size, globalLayoutIds.length, `${label}: slide-layout numeric IDs are unique across all physical masters`)
	assert.equal(new Set([...masterIds.map(String), ...globalLayoutIds]).size, masterIds.length + globalLayoutIds.length, `${label}: master and layout numeric IDs are unique presentation-wide`)
	assert.equal(new Set(masterRecords.map(item => item.themePart)).size, masterParts.length, `${label}: every physical master owns a distinct theme part`)
	assert.deepEqual([...allMarkers].sort(), [...expectedMarkers].sort(), `${label}: exact master re-edit markers`)

	const layoutNameByPart = new Map()
	for (const layoutPart of layoutParts) {
		const document = documents.get(layoutPart)
		const name = cSldName(document)
		layoutNameByPart.set(layoutPart, name)
		const reverse = relsFor(documents, layoutPart).filter(item => item.Type === `${REL_BASE}slideMaster`).map(item => resolveTarget(layoutPart, item.Target))
		assert.deepEqual(reverse, [layoutOwner.get(layoutPart)], `${label}: ${layoutPart} reverse edge matches master owner`)
	}
	for (const expected of LAYOUT_NAMES) assert.ok([...layoutNameByPart.values()].includes(expected), `${label}: authored layout ${expected} exists`)
	const authoredLayoutParts = Object.fromEntries(LAYOUT_NAMES.map(name => [name, [...layoutNameByPart].find(([, value]) => value === name)?.[0]]))
	assert.ok(authoredLayoutParts.ALPHA_LAYOUT, `${label}: ALPHA_LAYOUT part`)
	assert.ok(authoredLayoutParts.BETA_LAYOUT, `${label}: BETA_LAYOUT part`)
	assert.notEqual(layoutOwner.get(authoredLayoutParts.ALPHA_LAYOUT), layoutOwner.get(authoredLayoutParts.BETA_LAYOUT), `${label}: authored layouts bind different physical masters`)
	const alphaOwner = masterRecords.find(item => item.part === layoutOwner.get(authoredLayoutParts.ALPHA_LAYOUT))
	const betaOwner = masterRecords.find(item => item.part === layoutOwner.get(authoredLayoutParts.BETA_LAYOUT))
	assert.deepEqual(alphaOwner?.markers, [expectedMarkers[0]], `${label}: ALPHA_LAYOUT binds the Alpha physical master`)
	assert.deepEqual(betaOwner?.markers, [expectedMarkers[1]], `${label}: BETA_LAYOUT binds the Beta physical master`)

	const slideLayouts = []
	for (const slidePart of slideParts) {
		const targets = relsFor(documents, slidePart).filter(item => item.Type === `${REL_BASE}slideLayout`).map(item => resolveTarget(slidePart, item.Target))
		assert.equal(targets.length, 1, `${label}: ${slidePart} reaches exactly one layout`)
		assert.ok(layoutOwner.has(targets[0]), `${label}: ${slidePart} layout is master-owned`)
		slideLayouts.push(layoutNameByPart.get(targets[0]))
	}
	assert.deepEqual(slideLayouts, LAYOUT_NAMES, `${label}: slides select layouts from different masters`)

	if (officeRoundtrip) {
		for (const notesMasterPart of names.filter(name => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(name))) {
			for (const target of relsFor(documents, notesMasterPart).filter(item => item.Type === `${REL_BASE}theme`).map(item => resolveTarget(notesMasterPart, item.Target))) reachedThemes.add(target)
		}
	}
	assert.deepEqual([...reachedThemes].sort(numericPartSort), themeParts, `${label}: no orphan master/notes theme`)

	return {
		label, partCount: names.length, slideCount: slideParts.length, masterCount: masterParts.length,
		layoutCount: layoutParts.length, themeCount: themeParts.length, slideLayouts, masterRecords,
		layoutOwners: Object.fromEntries([...layoutOwner]), authoredLayoutParts,
	}
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'prove multiple physical masters', remember: 'each slide retains its selected master lineage' },
		visualDesign: { world: 'two-master package proof', framing: 'split native inheritance graph', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light', density: 'focused' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
	}
}

function masterDefinition(name, marker, color, x) {
	return {
		title: name, name, background: { color: name.endsWith('Alpha') ? 'F8FAFC' : 'FFF7ED' },
		objects: [{ rect: { x, y: 0.2, w: 0.35, h: 7.05, fill: { color }, line: { color }, objectName: marker } }],
	}
}

function layoutDefinitions() {
	return [
		{ name: 'ALPHA_LAYOUT', width: 13.333, height: 7.5, masterName: 'Master Alpha', activate: true, objects: [{ text: { text: 'ALPHA', options: { x: 0.65, y: 0.25, w: 2, h: 0.4, fontSize: 18, color: '1D4ED8', bold: true, objectName: 'alpha-layout-label' } } }] },
		{ name: 'BETA_LAYOUT', width: 13.333, height: 7.5, masterName: 'Master Beta', activate: false, objects: [{ text: { text: 'BETA', options: { x: 0.65, y: 0.25, w: 2, h: 0.4, fontSize: 18, color: 'C2410C', bold: true, objectName: 'beta-layout-label' } } }] },
	]
}

function authoredSpec(markers = INITIAL_MARKERS) {
	return {
		...metadata('Multiple slide masters lifecycle proof'),
		masters: [
			masterDefinition(MASTER_NAMES[0], markers[0], markers === INITIAL_MARKERS ? '2563EB' : '1D4ED8', 0.18),
			masterDefinition(MASTER_NAMES[1], markers[1], markers === INITIAL_MARKERS ? 'EA580C' : 'C2410C', 12.8),
		],
		layouts: layoutDefinitions(),
		slides: [
			{ id: 'alpha-slide', title: 'Alpha lineage', layoutIntent: 'title-only', layoutName: 'ALPHA_LAYOUT', masterName: 'Master Alpha', content: [{ kind: 'textBox', name: 'alpha-slide-title', text: 'Slide bound to Master Alpha', style: { fontSize: 26, color: '1E3A8A' } }] },
			{ id: 'beta-slide', title: 'Beta lineage', layoutIntent: 'title-only', layoutName: 'BETA_LAYOUT', masterName: 'Master Beta', content: [{ kind: 'textBox', name: 'beta-slide-title', text: 'Slide bound to Master Beta', style: { fontSize: 26, color: '9A3412' } }] },
		],
	}
}

function reeditSpec() {
	return {
		...metadata('Multiple slide masters re-edit proof'),
		masters: authoredSpec(REEDITED_MARKERS).masters,
		layouts: layoutDefinitions(),
		slides: [
			{ id: 'alpha-slide', slideIndex: 0, title: 'Alpha lineage', layoutIntent: 'title-only', layoutName: 'ALPHA_LAYOUT', masterName: 'Master Alpha', content: [] },
			{ id: 'beta-slide', slideIndex: 1, title: 'Beta lineage', layoutIntent: 'title-only', layoutName: 'BETA_LAYOUT', masterName: 'Master Beta', content: [] },
		],
	}
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function writeImmutable(file, value, encoding = undefined) {
	await fs.writeFile(file, value, { ...(encoding ? { encoding } : {}), flag: 'wx' })
}

async function checkpoint(outputDir, entry, name, expectedMarkers, artifacts, lifecycle, options = {}) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `multiple-slide-masters-${name}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, name, expectedMarkers, options)
	artifacts[name] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { file, buffer, inspection }
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

function objectName(item = {}) {
	const value = Object.values(item).find(entry => entry && typeof entry === 'object') || item
	return value?.objectName || value?.options?.objectName || ''
}

function assertExportedSpec(spec, expectedMarkers, label) {
	assert.equal(spec.masters?.length, 2, `${label}: two exported masters`)
	assert.deepEqual(spec.masters.map(item => item.title || item.name), MASTER_NAMES, `${label}: master order and names`)
	assert.deepEqual(spec.masters.map(item => objectName(item.objects?.[0])), expectedMarkers, `${label}: master object re-edit state`)
	for (const [layoutName, masterName] of LAYOUT_NAMES.map((name, index) => [name, MASTER_NAMES[index]])) {
		const layout = spec.layouts?.find(item => item.name === layoutName)
		assert.ok(layout, `${label}: ${layoutName} exported`)
		assert.equal(layout.masterName, masterName, `${label}: ${layoutName} masterName`)
	}
	assert.deepEqual(spec.slides?.map(item => item.layoutName), LAYOUT_NAMES, `${label}: slide layout selectors`)
	assert.deepEqual(spec.slides?.map(item => item.masterName), MASTER_NAMES, `${label}: slide master selectors`)
}

async function runOfficeProof(inputPath, outputPath, reportPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const sourceRenderDir = outputPath.replace(/\.pptx$/i, '-generated-renders')
	const roundtripRenderDir = outputPath.replace(/\.pptx$/i, '-reopened-renders')
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-multiple-slide-masters-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.source.SlideCount, 2)
	assert.equal(report.source.DesignCount, 2, 'PowerPoint sees two physical designs/masters')
	assert.equal(report.roundtrip.DesignCount, 2, 'PowerPoint reopened deck sees two physical designs/masters')
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint master/layout/slide snapshot changed after SaveCopyAs/reopen')
	assert.deepEqual(report.source.Slides.map(item => item.LayoutName), LAYOUT_NAMES, 'PowerPoint slide layout selections')
	for (const [index, marker] of REEDITED_MARKERS.entries()) {
		assert.ok(report.source.Designs[index]?.MasterShapeNames?.includes(marker), `PowerPoint source design ${index + 1} retains ${marker}`)
		assert.ok(report.roundtrip.Designs[index]?.MasterShapeNames?.includes(marker), `PowerPoint reopened design ${index + 1} retains ${marker}`)
	}
	const renderEvidence = []
	for (const name of ['slide-1.png', 'slide-2.png']) {
		const generated = path.join(sourceRenderDir, name)
		const reopened = path.join(roundtripRenderDir, name)
		const [a, b] = await Promise.all([fs.readFile(generated), fs.readFile(reopened)])
		assert.equal(sha256(b), sha256(a), `${name}: PowerPoint render changed after SaveCopyAs/reopen`)
		renderEvidence.push({
			slide: Number(name.match(/\d+/)?.[0]),
			generated: { file: relative(generated), bytes: a.length, sha256: sha256(a) },
			reopened: { file: relative(reopened), bytes: b.length, sha256: sha256(b) }, exactPngBytesEqual: true,
		})
	}
	return { ...report, renderEvidence }
}

export async function runMultipleSlideMastersProof({ outputDir, office = false } = {}) {
	const resolvedOutput = outputDir ? path.resolve(outputDir) : await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-multiple-slide-masters-'))
	if (outputDir) await fs.mkdir(resolvedOutput, { recursive: false })
	assert.deepEqual(await fs.readdir(resolvedOutput), [], `Output directory must be new and empty: ${resolvedOutput}`)
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `multiple-slide-masters-${Date.now()}`, clientInfo: { name: 'multiple-slide-masters-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true,
	})
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	let officeCheckpoint = null
	try {
		const created = dataOf('create two-master deck', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		await checkpoint(resolvedOutput, entry, 'initial', INITIAL_MARKERS, artifacts, lifecycle)

		const reedited = dataOf('re-edit two masters', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId, deckVersion: entry.deckVersion, spec: reeditSpec(), phase: 'commit', commitMode: 'patch',
			plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		assert.deepEqual(reedited.unsupportedFindings || [], [], 're-edit has no unsupported findings')
		const finalCheckpoint = await checkpoint(resolvedOutput, entry, 're-edited', REEDITED_MARKERS, artifacts, lifecycle)

		const exported = dataOf('export two-master spec', await mcp.call('betterpptx.deck.export_spec', {
			deckId: created.deckId, mode: 'current', download: false, detail: 'full',
		})).spec
		assertExportedSpec(exported, REEDITED_MARKERS, 'export')
		const exportPath = path.join(resolvedOutput, 'multiple-slide-masters-exported-spec.json')
		await writeImmutable(exportPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
		artifacts.exportedSpec = { file: relative(exportPath), sha256: sha256(await fs.readFile(exportPath)) }

		const replay = dataOf('portable two-master recompile', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: portableSpec(exported), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		await checkpoint(resolvedOutput, replayEntry, 'recompiled', REEDITED_MARKERS, artifacts, lifecycle)
		const replayExport = dataOf('replay export', await mcp.call('betterpptx.deck.export_spec', {
			deckId: replay.deckId, mode: 'current', download: false, detail: 'full',
		})).spec
		assertExportedSpec(replayExport, REEDITED_MARKERS, 'replay export')

		if (office) {
			const outputPath = path.join(resolvedOutput, 'multiple-slide-masters-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'multiple-slide-masters-office-com.json')
			const report = await runOfficeProof(finalCheckpoint.file, outputPath, reportPath)
			const roundtripBuffer = await fs.readFile(outputPath)
			const packageInspection = await inspectPackage(roundtripBuffer, 'powerpoint-roundtrip', REEDITED_MARKERS, { officeRoundtrip: true })
			officeCheckpoint = {
				reportFile: relative(reportPath), roundtripFile: relative(outputPath), roundtripSha256: sha256(roundtripBuffer),
				package: packageInspection, renderEvidence: report.renderEvidence, source: report.source, roundtrip: report.roundtrip,
			}
			artifacts.officeRoundtrip = { file: relative(outputPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
		}

		return {
			schemaVersion: 'betterpptx.multiple-slide-masters-unit-proof.v1', unitId: UNIT_ID, row: ROW,
			status: office ? 'MULTIPLE_SLIDE_MASTERS_PACKAGE_AND_OFFICE_VERIFIED' : 'MULTIPLE_SLIDE_MASTERS_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(),
			checks: {
				twoPhysicalMastersAndOrderedPresentationEntries: true,
				presentationMasterRelationshipClosure: true, masterLayoutAndThemeRelationshipClosure: true,
				layoutReverseMasterClosure: true, slideLayoutSelectionAcrossBothMasters: true,
				contentTypeCrcAndXmlClosure: true, createAndReeditWithoutStaleMasterObjects: true,
				exportAndPortableRecompile: true, powerPointOpen2007SaveCopyAsReopen: Boolean(officeCheckpoint),
				powerPointTwoDesignReadback: Boolean(officeCheckpoint?.source?.DesignCount === 2 && officeCheckpoint?.roundtrip?.DesignCount === 2),
				postOfficePackageClosure: Boolean(officeCheckpoint),
				generatedAndReopenedRenderEquality: Boolean(officeCheckpoint?.renderEvidence?.every(item => item.exactPngBytesEqual)),
			},
			proofBoundary: {
				inScope: 'new authoring of two ordered physical slide masters, master-owned native layouts, slides selected across both master lineages, master re-edit replacement, public spec export/recompile, strict OPC relationship/content-type closure, and PowerPoint design/readback/render roundtrip',
				outOfScope: 'imported opaque multi-master relationship-rich carriers (covered by verify-multimaster-carrier-v1 and verify-multimaster-relationship-edge-fixture-v1), master deletion with live descendants, more than two-master stress/performance limits, and VBA/add-in supplied designs',
			},
			lifecycle, office: officeCheckpoint || { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_MULTIPLE_MASTERS_OFFICE=1.' },
			artifacts,
			manualVisualInspection: officeCheckpoint
				? { status: 'required', evidence: officeCheckpoint.renderEvidence, instruction: 'Inspect both generated and reopened slide PNGs at original size before durable promotion.' }
				: { status: 'dependency-gated', reason: 'PowerPoint renders require --office.' },
			blockers: [], proofPath: relative(path.join(resolvedOutput, 'multiple-slide-masters-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const configured = process.env.BETTERPPTX_MULTIPLE_MASTERS_OUTPUT
	const outputDir = configured ? path.resolve(configured) : path.join(workspaceRoot, 'validation-output', `multiple-slide-masters-${timestamp()}-${crypto.randomUUID()}`)
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_MULTIPLE_MASTERS_OFFICE === '1'
	let result
	try { result = await runMultipleSlideMastersProof({ outputDir, office }) }
	catch (error) {
		result = {
			schemaVersion: 'betterpptx.multiple-slide-masters-unit-proof.v1', unitId: UNIT_ID, row: ROW,
			status: 'MULTIPLE_SLIDE_MASTERS_PRODUCTION_BLOCKED', generatedAt: new Date().toISOString(),
			blockers: [{ message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }],
			proofPath: relative(path.join(outputDir, 'multiple-slide-masters-unit-proof.json')),
		}
	}
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'multiple-slide-masters-unit-proof.json')
	await writeImmutable(proofPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify({ ...result, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2))
	if (result.status === 'MULTIPLE_SLIDE_MASTERS_PRODUCTION_BLOCKED') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
