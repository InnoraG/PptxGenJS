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
const UNIT_ID = 'impl-b-dd9d9170d70c8ce8'
const ROW = Object.freeze({ id: 'cap_ec04790e0410160fc4c3', label: 'add hyperlink' })
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const TARGETS = Object.freeze(['_blank', '_self', '_parent', '_top'])
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const NAMES = Object.freeze({ shape: 'hyperlink-shape-url', run: 'hyperlink-run-url', picture: 'hyperlink-picture-url', jump: 'hyperlink-slide-jump' })
const STATES = Object.freeze({
	initial: Object.freeze({
		shape: { url: 'https://example.com/hyperlink-shape-initial', tooltip: 'Initial shape URL', target: '_blank' },
		run: { url: 'https://example.com/hyperlink-run-initial', tooltip: 'Initial run URL', target: '_self' },
		picture: { url: 'https://example.com/hyperlink-picture-initial', tooltip: 'Initial picture URL', target: '_top' },
		jump: { slide: 3, tooltip: 'Initial internal target' }, jumpTargetPart: 'ppt/slides/slide3.xml',
	}),
	updated: Object.freeze({
		shape: { url: 'https://example.com/hyperlink-shape-updated', tooltip: 'Updated shape URL', target: '_parent' },
		run: { url: 'mailto:proof@example.com', tooltip: 'Updated run email', target: '_blank' },
		picture: { url: 'tel:+15550100', tooltip: 'Updated picture phone', target: '_self' },
		jump: { slide: 2, tooltip: 'Updated internal target' }, jumpTargetPart: 'ppt/slides/slide2.xml',
	}),
	reedited: Object.freeze({
		shape: { url: 'https://example.com/hyperlink-shape-final', tooltip: 'Final shape URL', target: '_blank' },
		run: { url: 'https://example.com/hyperlink-run-final', tooltip: 'Final run URL', target: '_parent' },
		picture: { url: 'https://example.com/hyperlink-picture-final', tooltip: 'Final picture URL', target: '_top' },
		jump: { slide: 3, tooltip: 'Final internal target' }, jumpTargetPart: 'ppt/slides/slide3.xml',
	}),
	reordered: Object.freeze({
		shape: { url: 'https://example.com/hyperlink-shape-final', tooltip: 'Final shape URL', target: '_blank' },
		run: { url: 'https://example.com/hyperlink-run-final', tooltip: 'Final run URL', target: '_parent' },
		picture: { url: 'https://example.com/hyperlink-picture-final', tooltip: 'Final picture URL', target: '_top' },
		jump: { slide: 2, tooltip: 'Final internal target' }, jumpTargetPart: 'ppt/slides/slide2.xml',
	}),
})

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
		warning: message => errors.push(`warning: ${message}`), error: message => errors.push(`error: ${message}`), fatalError: message => errors.push(`fatal: ${message}`),
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
const relationshipId = node => node.getAttribute('r:id') || node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''

function ancestor(node, names) {
	let current = node
	while (current && !names.includes(current.localName)) current = current.parentNode
	return current
}

function carrierName(node) {
	const carrier = ancestor(node, ['sp', 'pic', 'graphicFrame', 'cxnSp'])
	const nativeName = elements(carrier, 'cNvPr')[0]?.getAttribute('name') || ''
	for (const semanticName of Object.values(NAMES)) {
		if (nativeName === semanticName || nativeName.includes(`.${semanticName}.`)) return semanticName
	}
	return nativeName
}

function hyperlinkRecords(document, rels, slidePart) {
	return elements(document, 'hlinkClick').map(node => {
		const id = relationshipId(node)
		const rel = rels.find(item => item.Id === id)
		assert.ok(rel, `${slidePart}: hyperlink carrier ${id} has no relationship`)
		const run = ancestor(node, ['rPr'])
		return {
			carrier: carrierName(node), lane: run ? 'run' : (ancestor(node, ['pic']) ? 'picture' : 'object'),
			id, tooltip: node.getAttribute('tooltip') || '', target: node.getAttribute('tgtFrame') || '', action: node.getAttribute('action') || '',
			relType: rel.Type, relTarget: rel.Target, targetMode: rel.TargetMode || '',
			resolvedTarget: String(rel.TargetMode).toLowerCase() === 'external' ? rel.Target : resolveTarget(slidePart, rel.Target),
		}
	})
}

async function loadPackage(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort()
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${label}/${name}`))
	return { zip, names, documents }
}

async function inspectPackage(buffer, label, expected = null) {
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
	const defaults = new Set(elements(contentTypes, 'Default').map(node => node.getAttribute('Extension').toLowerCase()))
	const overrides = new Set(elements(contentTypes, 'Override').map(node => node.getAttribute('PartName').replace(/^\//, '')))
	for (const part of overrides) assert.ok(nameSet.has(part), `${label}: orphan content-type override ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: missing content type for ${name}`)
	}
	const slidePart = 'ppt/slides/slide1.xml'
	const slideDocument = documents.get(slidePart)
	assert.ok(slideDocument, `${label}: source slide missing`)
	const rels = relationships(documents.get(relationshipPartFor(slidePart)))
	const records = hyperlinkRecords(slideDocument, rels, slidePart)
	const ownedRels = rels.filter(item => [`${REL_BASE}hyperlink`, `${REL_BASE}slide`].includes(item.Type) && records.some(record => record.id === item.Id))
	assert.equal(ownedRels.length, records.length, `${label}: every owned navigation relationship has one carrier`)
	for (const rel of rels.filter(item => item.Type === `${REL_BASE}hyperlink`)) {
		assert.equal(rel.TargetMode, 'External', `${label}: URL hyperlink must be external`)
		assert.ok(records.some(record => record.id === rel.Id), `${label}: orphan external hyperlink relationship ${rel.Id}`)
	}
	if (expected === null) {
		assert.equal(records.length, 0, `${label}: no hyperlink carriers`)
		assert.equal(rels.filter(item => item.Type === `${REL_BASE}hyperlink`).length, 0, `${label}: no orphan hyperlink relationships`)
		return { label, partCount: names.length, hyperlinkCarriers: 0, hyperlinkRelationships: 0, records: [] }
	}
	assert.equal(records.length, 4, `${label}: four hyperlink carriers`)
	const byName = new Map(records.map(item => [item.carrier, item]))
	for (const [name, lane] of [[NAMES.shape, 'object'], [NAMES.run, 'run'], [NAMES.picture, 'picture'], [NAMES.jump, 'object']]) {
		assert.ok(byName.has(name), `${label}: ${name} carrier`)
		assert.equal(byName.get(name).lane, lane, `${label}: ${name} native lane`)
	}
	for (const [name, key] of [[NAMES.shape, 'shape'], [NAMES.run, 'run'], [NAMES.picture, 'picture']]) {
		const record = byName.get(name)
		const value = expected[key]
		assert.equal(record.relType, `${REL_BASE}hyperlink`, `${label}/${name}: external relationship type`)
		assert.equal(record.targetMode, 'External', `${label}/${name}: external target mode`)
		assert.equal(record.relTarget, value.url, `${label}/${name}: URL relationship target`)
		assert.equal(record.tooltip, value.tooltip, `${label}/${name}: tooltip`)
		assert.equal(record.target, value.target, `${label}/${name}: target frame`)
		assert.equal(record.action, '', `${label}/${name}: URL hyperlink has no slide-jump action`)
	}
	const jump = byName.get(NAMES.jump)
	assert.equal(jump.relType, `${REL_BASE}slide`, `${label}: internal relationship type`)
	assert.equal(jump.targetMode, '', `${label}: internal relationship has no TargetMode`)
	assert.equal(jump.resolvedTarget, expected.jumpTargetPart, `${label}: internal relationship target`)
	assert.equal(jump.tooltip, expected.jump.tooltip, `${label}: internal tooltip`)
	assert.equal(jump.target, '', `${label}: internal link has no target frame`)
	assert.equal(jump.action, 'ppaction://hlinksldjump', `${label}: internal slide-jump action`)
	return { label, partCount: names.length, hyperlinkCarriers: records.length, hyperlinkRelationships: ownedRels.length, records }
}

function normalizeCoreXml(bytes, label) {
	const document = parseXmlStrict(bytes.toString('utf8'), label)
	for (const name of ['created', 'modified']) for (const node of elements(document, name)) while (node.firstChild) node.removeChild(node.firstChild)
	return Buffer.from(new XMLSerializer().serializeToString(document), 'utf8')
}

async function stableSnapshot(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const result = {}
	for (const name of Object.keys(zip.files).filter(item => !zip.files[item].dir).sort()) {
		let bytes = await zip.file(name).async('nodebuffer')
		if (name === 'docProps/core.xml') bytes = normalizeCoreXml(bytes, `${label}/${name}`)
		result[name] = sha256(bytes)
	}
	return result
}

async function assertNoMutation(before, after, label) {
	const [a, b] = await Promise.all([stableSnapshot(before, `${label}-before`), stableSnapshot(after, `${label}-after`)])
	assert.deepEqual(b, a, `${label}: stable package members changed`)
	return { stableMemberCount: Object.keys(a).length, normalizedOnly: ['docProps/core.xml created', 'docProps/core.xml modified'] }
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'prove native hyperlinks', remember: 'carrier and relationship ownership stay closed' },
		visualDesign: { world: 'native hyperlink proof', framing: 'four link carriers', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light', density: 'focused' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
	}
}

function hyperlinkBlocks(state) {
	return [
		{ kind: 'shape', name: NAMES.shape, objectName: NAMES.shape, shape: 'roundRect', hyperlink: state.shape, altText: 'External shape hyperlink', style: { fill: { color: 'DBEAFE' }, line: { color: '2563EB' } } },
		{ kind: 'textBox', name: NAMES.run, objectName: NAMES.run, text: [{ text: 'External run hyperlink', options: { fontSize: 24, color: '1D4ED8', underline: { style: 'sng' }, hyperlink: state.run } }] },
		{ kind: 'image', name: NAMES.picture, objectName: NAMES.picture, altText: 'External picture hyperlink', source: { kind: 'inline', data: PNG_DATA, format: 'png' }, pictureAdjuncts: { hyperlink: state.picture } },
		{ kind: 'textBox', name: NAMES.jump, objectName: NAMES.jump, text: 'Jump to target slide', hyperlink: state.jump, style: { fontSize: 24, color: '047857' } },
	]
}

function authoredSpec(state = STATES.initial) {
	return {
		...metadata('Add hyperlink lifecycle proof'),
		slides: [
			{ id: 'hyperlink-source', title: 'Native hyperlink carriers', layoutIntent: 'title-only', content: hyperlinkBlocks(state) },
			{ id: 'hyperlink-middle', title: 'Middle slide', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'middle-label', text: 'Middle slide' }] },
			{ id: 'hyperlink-target', title: 'Internal target', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'target-label', text: 'Internal hyperlink target' }] },
		],
	}
}

function patchBlocks(state) {
	return [
		{ kind: 'shape', name: NAMES.shape, objectName: NAMES.shape, patch: { hyperlink: state?.shape ?? null } },
		{ kind: 'textBox', name: NAMES.run, objectName: NAMES.run, patch: { text: state ? [{ text: 'External run hyperlink', options: { fontSize: 24, color: '1D4ED8', underline: { style: 'sng' }, hyperlink: state.run } }] : [{ text: 'External run hyperlink', options: { hyperlink: null } }] } },
		{ kind: 'image', name: NAMES.picture, objectName: NAMES.picture, patch: { pictureAdjuncts: { hyperlink: state?.picture ?? null } } },
		{ kind: 'textBox', name: NAMES.jump, objectName: NAMES.jump, patch: { hyperlink: state?.jump ?? null } },
	]
}

function patchSpec(title, blocks = [], extra = {}) {
	return { ...metadata(title), slides: [{ id: 'hyperlink-source', slideIndex: 0, layoutIntent: 'title-only', content: blocks }], ...extra }
}

async function pptxBuffer(entry) { return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false })) }
async function writeImmutable(file, value, encoding = undefined) { await fs.writeFile(file, value, { ...(encoding ? { encoding } : {}), flag: 'wx' }) }

async function checkpoint(outputDir, entry, name, expected, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `add-hyperlink-${name}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, name, expected)
	artifacts[name] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { file, buffer, inspection }
}

async function commitPatch(mcp, deckId, entry, spec, label) {
	return dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: entry.deckVersion, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
}

async function rejectedWithoutMutation({ mcp, deckId, entry, spec, expected, label }) {
	const beforeVersion = entry.deckVersion
	const before = await pptxBuffer(entry)
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: beforeVersion, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	})
	const diagnostic = JSON.stringify(result)
	assert.equal(result?.ok, false, `${label}: invalid request accepted`)
	assert.match(diagnostic, expected, `${label}: precise diagnostic`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: deckVersion changed`)
	const after = await pptxBuffer(entry)
	return { label, diagnostic: diagnostic.slice(0, 1000), deckVersion: beforeVersion, ...(await assertNoMutation(before, after, label)) }
}

function portableSpec(spec) {
	const value = structuredClone(spec)
	delete value.nativePackagePreservation
	for (const slide of value.slides || []) {
		delete slide.nativeTimingPreservation
		slide.content = (slide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
			const { editHandle, nativePreservation, preservationHandle, ...portable } = block
			return portable
		})
	}
	return value
}

function findBlock(spec, name) { return (spec.slides || []).flatMap(slide => slide.content || []).find(block => block.name === name || block.objectName === name) }

function assertExport(spec, expected, label) {
	const shape = findBlock(spec, NAMES.shape)
	const run = findBlock(spec, NAMES.run)
	const picture = findBlock(spec, NAMES.picture)
	const jump = findBlock(spec, NAMES.jump)
	assert.deepEqual(shape?.hyperlink, expected.shape, `${label}: shape hyperlink`)
	assert.deepEqual(run?.text?.[0]?.options?.hyperlink, expected.run, `${label}: run hyperlink`)
	assert.deepEqual(picture?.imageOptions?.pictureAdjuncts?.hyperlink || picture?.pictureAdjuncts?.hyperlink, expected.picture, `${label}: picture hyperlink`)
	assert.deepEqual(jump?.hyperlink, expected.jump, `${label}: internal hyperlink uses current slide number`)
}

async function runOfficeProof(inputPath, outputPath, reportPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const sourceRenderDir = outputPath.replace(/\.pptx$/i, '-generated-renders')
	const roundtripRenderDir = outputPath.replace(/\.pptx$/i, '-reopened-renders')
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-add-hyperlink-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.source.SlideCount, 3)
	assert.equal(report.source.Hyperlinks.length, 4, 'PowerPoint source sees four hyperlinks')
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint hyperlink snapshot changed after SaveCopyAs/reopen')
	const addresses = report.source.Hyperlinks.map(item => item.Address).filter(Boolean).sort()
	assert.deepEqual(addresses, [STATES.reordered.picture.url, STATES.reordered.run.url, STATES.reordered.shape.url].sort(), 'PowerPoint external hyperlink addresses')
	assert.equal(report.source.Hyperlinks.filter(item => !item.Address && item.SubAddress).length, 1, 'PowerPoint sees one internal slide jump')
	const renderEvidence = []
	for (const name of ['slide-1.png', 'slide-2.png', 'slide-3.png']) {
		const aFile = path.join(sourceRenderDir, name)
		const bFile = path.join(roundtripRenderDir, name)
		const [a, b] = await Promise.all([fs.readFile(aFile), fs.readFile(bFile)])
		assert.equal(sha256(b), sha256(a), `${name}: render changed after SaveCopyAs/reopen`)
		renderEvidence.push({ slide: Number(name.match(/\d+/)?.[0]), generated: { file: relative(aFile), bytes: a.length, sha256: sha256(a) }, reopened: { file: relative(bFile), bytes: b.length, sha256: sha256(b) }, exactPngBytesEqual: true })
	}
	return { ...report, renderEvidence }
}

export async function runAddHyperlinkProof({ outputDir, office = false } = {}) {
	const resolvedOutput = outputDir ? path.resolve(outputDir) : await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-add-hyperlink-'))
	if (outputDir) await fs.mkdir(resolvedOutput, { recursive: false })
	assert.deepEqual(await fs.readdir(resolvedOutput), [], `Output directory must be new and empty: ${resolvedOutput}`)
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `add-hyperlink-${Date.now()}`, clientInfo: { name: 'add-hyperlink-verifier', version: '1' }, blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	const negativeMutationGates = []
	let officeCheckpoint = null
	try {
		const created = dataOf('create', await mcp.call('betterpptx.deck.generate_from_spec', { spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		await checkpoint(resolvedOutput, entry, 'initial', STATES.initial, artifacts, lifecycle)

		await commitPatch(mcp, created.deckId, entry, patchSpec('Updated hyperlink proof', patchBlocks(STATES.updated)), 'update')
		await checkpoint(resolvedOutput, entry, 'updated', STATES.updated, artifacts, lifecycle)

		await commitPatch(mcp, created.deckId, entry, patchSpec('Reset hyperlink proof', patchBlocks(null)), 'reset')
		await checkpoint(resolvedOutput, entry, 'reset', null, artifacts, lifecycle)

		await commitPatch(mcp, created.deckId, entry, patchSpec('Re-edited hyperlink proof', patchBlocks(STATES.reedited)), 're-edit')
		await checkpoint(resolvedOutput, entry, 're-edited', STATES.reedited, artifacts, lifecycle)

		await commitPatch(mcp, created.deckId, entry, { ...metadata('Reordered hyperlink proof'), slides: [], patchPlan: { reorderSlides: { fromIndex: 2, toIndex: 1 } } }, 'target reorder')
		const reordered = await checkpoint(resolvedOutput, entry, 'reordered', STATES.reordered, artifacts, lifecycle)

		const malformed = [
			{ label: 'url-and-slide', expected: /exactly one|url or slide/i, value: { url: 'https://example.com/both', slide: 2 } },
			{ label: 'target-on-slide', expected: /target.*slide|target frame.*url/i, value: { slide: 2, target: '_blank' } },
			{ label: 'out-of-range-slide', expected: /slide.*range|existing slide|out of range/i, value: { slide: 99 } },
			{ label: 'unsafe-url', expected: /https|mailto|tel|unsafe|scheme/i, value: { url: 'file:///C:/unsafe.exe' } },
			{ label: 'invalid-target-frame', expected: /target|_blank|_self|_parent|_top/i, value: { url: 'https://example.com/frame', target: 'javascript:evil' } },
			{ label: 'oversize-tooltip', expected: /tooltip|max|1024|4096/i, value: { url: 'https://example.com/tooltip', tooltip: 'x'.repeat(5000) } },
		]
		for (const item of malformed) negativeMutationGates.push(await rejectedWithoutMutation({
			mcp, deckId: created.deckId, entry, label: item.label, expected: item.expected,
			spec: patchSpec(`Invalid ${item.label}`, [{ kind: 'shape', name: NAMES.shape, objectName: NAMES.shape, patch: { hyperlink: item.value } }]),
		}))
		negativeMutationGates.push(await rejectedWithoutMutation({
			mcp, deckId: created.deckId, entry, label: 'delete-live-target', expected: /target|hyperlink|retarget|clear/i,
			spec: { ...metadata('Invalid target deletion'), slides: [{ id: 'hyperlink-target', slideIndex: 1, delete: true, content: [] }] },
		}))

		const exported = dataOf('export', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExport(exported, STATES.reordered, 'export')
		const exportPath = path.join(resolvedOutput, 'add-hyperlink-exported-spec.json')
		await writeImmutable(exportPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
		artifacts.exportedSpec = { file: relative(exportPath), sha256: sha256(await fs.readFile(exportPath)) }
		const replay = dataOf('portable replay', await mcp.call('betterpptx.deck.generate_from_spec', { spec: portableSpec(exported), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		await checkpoint(resolvedOutput, replayEntry, 'recompiled', STATES.reordered, artifacts, lifecycle)
		assertExport(dataOf('replay export', await mcp.call('betterpptx.deck.export_spec', { deckId: replay.deckId, mode: 'current', download: false, detail: 'full' })).spec, STATES.reordered, 'replay export')

		const [repeatA, repeatB] = await Promise.all([pptxBuffer(entry), pptxBuffer(entry)])
		await assertNoMutation(repeatA, repeatB, 'deterministic repeated write')

		await commitPatch(mcp, created.deckId, entry, patchSpec('Delete hyperlink objects', Object.values(NAMES).map(name => ({ kind: 'shape', name, objectName: name, delete: true }))), 'delete hyperlink objects')
		await checkpoint(resolvedOutput, entry, 'deleted', null, artifacts, lifecycle)

		if (office) {
			const outputPath = path.join(resolvedOutput, 'add-hyperlink-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'add-hyperlink-office-com.json')
			const report = await runOfficeProof(reordered.file, outputPath, reportPath)
			const roundtripBuffer = await fs.readFile(outputPath)
			const packageInspection = await inspectPackage(roundtripBuffer, 'powerpoint-roundtrip', STATES.reordered)
			officeCheckpoint = { reportFile: relative(reportPath), roundtripFile: relative(outputPath), roundtripSha256: sha256(roundtripBuffer), package: packageInspection, renderEvidence: report.renderEvidence }
			artifacts.officeRoundtrip = { file: relative(outputPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
		}

		return {
			schemaVersion: 'betterpptx.add-hyperlink-unit-proof.v1', unitId: UNIT_ID, row: ROW,
			status: office ? 'ADD_HYPERLINK_PACKAGE_AND_OFFICE_VERIFIED' : 'ADD_HYPERLINK_PACKAGE_VERIFIED_OFFICE_GATED', generatedAt: new Date().toISOString(),
			checks: {
				xmlCrcOpcAndContentTypeClosure: true, runShapePictureAndInternalJumpCarriers: true, externalAndInternalRelationshipSemantics: true,
				tooltipAndTargetFrameSerialization: true, updateResetReeditDeleteCleanup: true, semanticTargetRetargetAcrossReorder: true,
				exportReplayAndDeterministicWrite: true, invalidAndTargetDeletionNoMutation: negativeMutationGates.length === 7,
				powerPointOpen2007SaveCopyAsReopen: Boolean(officeCheckpoint), officeComClickSemantics: Boolean(officeCheckpoint),
				postOfficePackageClosure: Boolean(officeCheckpoint), generatedAndReopenedRenderEquality: Boolean(officeCheckpoint?.renderEvidence?.every(item => item.exactPngBytesEqual)),
			},
			proofBoundary: {
				inScope: 'safe external https/mailto/tel and internal slide hyperlinks on native shape, text-run, picture, and whole-text-box carriers; tooltip and four safe tgtFrame values; lifecycle cleanup, reorder retarget, portable replay, package closure, and PowerPoint click-semantics readback',
				outOfScope: 'hover Action Settings, custom-show/run-program/macro actions, arbitrary target-frame names, external-link execution, and hyperlink authoring inside imported master/layout raw carriers',
			},
			lifecycle, negativeMutationGates, office: officeCheckpoint || { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_ADD_HYPERLINK_OFFICE=1.' }, artifacts,
			manualVisualInspection: officeCheckpoint ? { status: 'required', evidence: officeCheckpoint.renderEvidence, instruction: 'Inspect all generated and reopened slide PNGs at original size before durable promotion; links are validated by package and COM rather than followed.' } : { status: 'dependency-gated', reason: 'PowerPoint renders require --office.' },
			blockers: [], proofPath: relative(path.join(resolvedOutput, 'add-hyperlink-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const configured = process.env.BETTERPPTX_ADD_HYPERLINK_OUTPUT
	const outputDir = configured ? path.resolve(configured) : path.join(workspaceRoot, 'validation-output', `add-hyperlink-${timestamp()}-${crypto.randomUUID()}`)
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_ADD_HYPERLINK_OFFICE === '1'
	let result
	try { result = await runAddHyperlinkProof({ outputDir, office }) }
	catch (error) {
		result = { schemaVersion: 'betterpptx.add-hyperlink-unit-proof.v1', unitId: UNIT_ID, row: ROW, status: 'ADD_HYPERLINK_PRODUCTION_BLOCKED', generatedAt: new Date().toISOString(), blockers: [{ message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }], proofPath: relative(path.join(outputDir, 'add-hyperlink-unit-proof.json')) }
	}
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'add-hyperlink-unit-proof.json')
	await writeImmutable(proofPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify({ ...result, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2))
	if (result.status === 'ADD_HYPERLINK_PRODUCTION_BLOCKED') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
