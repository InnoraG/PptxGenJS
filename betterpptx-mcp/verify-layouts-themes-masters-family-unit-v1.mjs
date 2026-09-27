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

import { runLayoutThemeMasterInheritanceProof } from './verify-layout-theme-master-inheritance-unit-v1.mjs'
import { runMasterPresetSelectorProof } from './verify-master-preset-selectors-unit-v1.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(moduleDir, '..')
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'

export const LAYOUTS_THEMES_MASTERS_FAMILY_UNIT_ID = 'impl-b-26ea0c88fdeb335a'
export const LAYOUTS_THEMES_MASTERS_FAMILY_ROWS = Object.freeze([
	Object.freeze({ id: 'cap_d35d4ae0cb2a0a5f78db', label: 'Layouts, themes, and masters' }),
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
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

function relationshipRecords(document) {
	return elements(document, 'Relationship').map(node => ({
		id: node.getAttribute('Id'), type: node.getAttribute('Type'), target: node.getAttribute('Target'), mode: node.getAttribute('TargetMode'),
	}))
}

function sourcePartForRelationships(relName) {
	if (relName === '_rels/.rels') return ''
	return path.posix.join(path.posix.dirname(path.posix.dirname(relName)), path.posix.basename(relName, '.rels'))
}

function relPart(partName) {
	return path.posix.join(path.posix.dirname(partName), '_rels', `${path.posix.basename(partName)}.rels`)
}

function resolveTarget(sourcePart, target) {
	return path.posix.normalize(path.posix.join(sourcePart ? path.posix.dirname(sourcePart) : '', String(target || '').replace(/^\/+/, '')))
}

function relationshipId(node) {
	return node?.getAttribute('r:id') || node?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''
}

async function packageSnapshot(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const docs = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		docs.set(name, parseXml(await zip.file(name).async('string'), `${label}/${name}`))
	}
	for (const [name, document] of docs) {
		if (!name.endsWith('.rels')) continue
		const rels = relationshipRecords(document)
		assert.equal(new Set(rels.map(item => item.id)).size, rels.length, `${label}/${name}: duplicate relationship IDs`)
		const source = sourcePartForRelationships(name)
		for (const rel of rels.filter(item => item.mode !== 'External')) {
			assert.ok(nameSet.has(resolveTarget(source, rel.target)), `${label}/${name}: dangling ${rel.id}`)
		}
	}
	const contentTypes = docs.get('[Content_Types].xml')
	assert.ok(contentTypes, `${label}: [Content_Types].xml missing`)
	const defaults = new Set(elements(contentTypes, 'Default').map(node => node.getAttribute('Extension').toLowerCase()))
	const overrides = new Map(elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const [part] of overrides) assert.ok(nameSet.has(part), `${label}: orphan content-type override ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: ${name} lacks a content type`)
	}
	const numeric = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0)
	const slides = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numeric)
	const layouts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(numeric)
	const masters = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort(numeric)
	const themes = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort(numeric)
	assert.ok(slides.length >= 1, `${label}: no slides`)
	assert.ok(layouts.length >= 1, `${label}: no layouts`)
	assert.ok(masters.length >= 1, `${label}: no masters`)
	assert.ok(themes.length >= 1, `${label}: no themes`)
	const relsFor = part => relationshipRecords(docs.get(relPart(part)))
	const presentationRels = relsFor('ppt/presentation.xml')
	const presentationMasterTargets = presentationRels.filter(rel => rel.type === `${REL_BASE}slideMaster`).map(rel => resolveTarget('ppt/presentation.xml', rel.target)).sort()
	assert.deepEqual(presentationMasterTargets, [...masters].sort(), `${label}: presentation/master graph closure`)
	const layoutNames = new Map(layouts.map(part => [part, elements(docs.get(part), 'cSld')[0]?.getAttribute('name') || '']))
	for (const master of masters) {
		const rels = relsFor(master)
		const layoutTargets = rels.filter(rel => rel.type === `${REL_BASE}slideLayout`).map(rel => resolveTarget(master, rel.target)).sort()
		const listed = elements(docs.get(master), 'sldLayoutId').map(node => {
			const id = relationshipId(node)
			const rel = rels.find(item => item.id === id)
			assert.ok(rel, `${label}/${master}: listed layout ${id} lacks relationship`)
			return resolveTarget(master, rel.target)
		}).sort()
		assert.deepEqual(listed, layoutTargets, `${label}/${master}: layout list/relationship mismatch`)
		const themeTargets = rels.filter(rel => rel.type === `${REL_BASE}theme`).map(rel => resolveTarget(master, rel.target))
		assert.equal(themeTargets.length, 1, `${label}/${master}: exactly one theme relationship`)
		assert.ok(themes.includes(themeTargets[0]), `${label}/${master}: theme target missing`)
	}
	const ownedLayouts = new Set()
	for (const layout of layouts) {
		const parents = relsFor(layout).filter(rel => rel.type === `${REL_BASE}slideMaster`).map(rel => resolveTarget(layout, rel.target))
		assert.equal(parents.length, 1, `${label}/${layout}: exactly one master relationship`)
		assert.ok(masters.includes(parents[0]), `${label}/${layout}: missing master target`)
		ownedLayouts.add(layout)
	}
	for (const master of masters) {
		for (const rel of relsFor(master).filter(item => item.type === `${REL_BASE}slideLayout`)) ownedLayouts.delete(resolveTarget(master, rel.target))
	}
	assert.deepEqual([...ownedLayouts], [], `${label}: orphan layout parts`)
	const slideLayoutNames = []
	for (const slide of slides) {
		const targets = relsFor(slide).filter(rel => rel.type === `${REL_BASE}slideLayout`).map(rel => resolveTarget(slide, rel.target))
		assert.equal(targets.length, 1, `${label}/${slide}: exactly one layout relationship`)
		assert.ok(layouts.includes(targets[0]), `${label}/${slide}: layout target missing`)
		slideLayoutNames.push(layoutNames.get(targets[0]))
	}
	const shapeNames = []
	for (const part of [...masters, ...layouts, ...slides]) shapeNames.push(...elements(docs.get(part), 'cNvPr').map(node => node.getAttribute('name')).filter(Boolean))
	return { zip, names, docs, slides, layouts, masters, themes, layoutNames: [...layoutNames.values()], slideLayoutNames, shapeNames }
}

function baseSpec(templatePath) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Layouts themes masters imported-carrier proof', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove native carrier package safety', remember: 'master, layout, theme, and relationships remain closed' },
		visualDesign: { world: 'blueprint', framing: 'native carrier package proof', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		template: { path: templatePath, preserveLayouts: true, enforceLayoutPolicy: false },
		slides: [
			{ id: 'carrier-a', title: 'Carrier A', layoutIntent: 'title-only', layoutName: 'HeldoutAlt', content: [{ kind: 'textBox', name: 'carrier-a-title', role: 'title', text: 'Imported carrier A' }] },
			{ id: 'carrier-b', title: 'Carrier B', layoutIntent: 'title-only', layoutName: 'HeldoutWide', content: [{ kind: 'textBox', name: 'carrier-b-title', role: 'title', text: 'Imported carrier B' }] },
		],
	}
}

function patchSpec(title, templateCarriers, edits = undefined) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title,
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'exercise native carrier lifecycle', remember: 'package graph remains closed' },
		visualDesign: { world: 'blueprint', framing: 'native carrier lifecycle', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		slides: [], patchPlan: { templateCarriers, ...(edits ? { edits } : {}) },
	}
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function writeArtifact(outputDir, name, buffer, artifacts) {
	const file = path.join(outputDir, name)
	await fs.writeFile(file, buffer, { flag: 'wx' })
	artifacts[name] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	return file
}

async function targetBytes(snapshot, part) {
	return snapshot.zip.file(part)?.async('nodebuffer') || null
}

function normalizeCoreProperties(bytes) {
	const document = parseXml(bytes.toString('utf8'), 'semantic-package/docProps/core.xml')
	for (const localName of ['created', 'modified']) {
		for (const node of elements(document, localName)) {
			while (node.firstChild) node.removeChild(node.firstChild)
			node.appendChild(document.createTextNode('2000-01-01T00:00:00Z'))
		}
	}
	return Buffer.from(new XMLSerializer().serializeToString(document), 'utf8')
}

function corePropertySnapshot(bytes) {
	const document = parseXml(bytes.toString('utf8'), 'semantic-package/core-properties-snapshot')
	return Object.fromEntries(Array.from(document.documentElement?.childNodes || [])
		.filter(node => node.nodeType === 1)
		.map(node => [node.localName, String(node.textContent || '')]))
}

async function stableMemberDiff(beforeBuffer, afterBuffer) {
	const [beforeZip, afterZip] = await Promise.all([
		JSZip.loadAsync(beforeBuffer, { checkCRC32: true }), JSZip.loadAsync(afterBuffer, { checkCRC32: true }),
	])
	const beforeNames = Object.keys(beforeZip.files).filter(name => !beforeZip.files[name].dir).sort()
	const afterNames = Object.keys(afterZip.files).filter(name => !afterZip.files[name].dir).sort()
	assert.deepEqual(afterNames, beforeNames, 'rejected mutation changed package inventory')
	const changed = []
	for (const name of beforeNames) {
		let [before, after] = await Promise.all([beforeZip.file(name).async('nodebuffer'), afterZip.file(name).async('nodebuffer')])
		if (name === 'docProps/core.xml') {
			before = normalizeCoreProperties(before)
			after = normalizeCoreProperties(after)
		}
		if (!before.equals(after)) changed.push({
			name, beforeSha256: sha256(before), afterSha256: sha256(after),
			...(name === 'docProps/core.xml' ? { beforeProperties: corePropertySnapshot(await beforeZip.file(name).async('nodebuffer')), afterProperties: corePropertySnapshot(await afterZip.file(name).async('nodebuffer')) } : {}),
		})
	}
	return { changed, stableMemberCount: beforeNames.length }
}

async function assertRejectedWithoutMutation(mcp, entry, deckId, spec, expected, label) {
	const beforeVersion = entry.deckVersion
	const before = await pptxBuffer(entry)
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: beforeVersion, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	})
	const diagnostic = JSON.stringify(result)
	const payload = result?.data || result || {}
	const blocking = [
		...(Array.isArray(payload.unsupportedFindings) ? payload.unsupportedFindings : []),
		...(Array.isArray(payload.unsupported) ? payload.unsupported : []),
	].filter(item => item?.blocking !== false)
	const summary = JSON.stringify({ ok: result?.ok, deckVersion: payload.deckVersion, patchResults: payload.patchResults, unsupportedFindings: payload.unsupportedFindings })
	assert.ok(result?.ok === false || blocking.length > 0, `${label}: invalid carrier mutation was accepted: ${summary}`)
	assert.match(diagnostic, expected, `${label}: precise fail-closed diagnostic`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: deck version changed`)
	const after = await pptxBuffer(entry)
	const stable = await stableMemberDiff(before, after)
	assert.deepEqual(stable.changed, [], `${label}: rejected mutation changed stable package members`)
	return { label, diagnostic: diagnostic.slice(0, 800), beforePackageSha256: sha256(before), afterPackageSha256: sha256(after), deckVersion: beforeVersion, ...stable }
}

async function latestHeldoutFixture() {
	const root = path.join(workspaceRoot, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'template-layout-heldout-native')
	const dirs = (await fs.readdir(root, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort().reverse()
	for (const directory of dirs) {
		const candidate = path.join(root, directory, 'heldout-source-template.pptx')
		if (await fs.access(candidate).then(() => true).catch(() => false)) return candidate
	}
	throw new Error('HELDOUT_TEMPLATE_FIXTURE_REQUIRED: no heldout-source-template.pptx was found')
}

async function runOfficeProof(inputPath, outputPath, reportPath, sourceRenderDir, roundtripRenderDir) {
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-layouts-themes-masters-family-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.saveCopyAs, true)
	assert.equal(report.reopened, true)
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint source/roundtrip semantic snapshot')
	const sourcePngs = (await fs.readdir(sourceRenderDir)).filter(name => name.endsWith('.png')).sort()
	const roundtripPngs = (await fs.readdir(roundtripRenderDir)).filter(name => name.endsWith('.png')).sort()
	assert.deepEqual(sourcePngs, ['slide-1.png', 'slide-2.png'])
	assert.deepEqual(roundtripPngs, sourcePngs)
	const renders = []
	for (const name of sourcePngs) {
		const [source, roundtrip] = await Promise.all([fs.readFile(path.join(sourceRenderDir, name)), fs.readFile(path.join(roundtripRenderDir, name))])
		assert.equal(sha256(roundtrip), sha256(source), `${name}: SaveCopyAs/reopen render changed`)
		renders.push({ name, sourceSha256: sha256(source), roundtripSha256: sha256(roundtrip), exactPngBytesEqual: true })
	}
	return { report, renders }
}

async function runImportedCarrierProof({ outputDir, office }) {
	await fs.mkdir(outputDir, { recursive: false })
	const fixture = await latestHeldoutFixture()
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `layouts-themes-masters-family-${Date.now()}`,
		clientInfo: { name: 'layouts-themes-masters-family-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true,
	})
	const artifacts = {}
	const deckIds = []
	try {
		const created = dataOf('imported carrier create', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: baseSpec(fixture), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		const initialBuffer = await pptxBuffer(entry)
		const initialPath = await writeArtifact(outputDir, 'family-imported-carrier-initial.pptx', initialBuffer, artifacts)
		const initial = await packageSnapshot(initialBuffer, 'imported-initial')
		assert.ok(initial.layoutNames.includes('HeldoutAlt') && initial.layoutNames.includes('HeldoutWide'), 'held-out layout names')
		const masterPart = initial.masters[0]
		const altPart = initial.layouts.find((part, index) => initial.layoutNames[index] === 'HeldoutAlt')
		assert.ok(masterPart && altPart, 'target carrier parts')
		const initialMasterXml = await targetBytes(initial, masterPart)
		const initialMasterRels = await targetBytes(initial, relPart(masterPart))
		const initialAltXml = await targetBytes(initial, altPart)
		const initialAltRels = await targetBytes(initial, relPart(altPart))

		const editOperations = [
			{ name: 'slideMaster1', kind: 'master', objects: [{ rect: { x: 0.35, y: 0.35, w: 0.18, h: 4.8, fill: { color: '14532D' }, line: { color: '166534' }, objectName: 'family-master-edited-rail' } }], background: { color: 'ECFDF5' } },
			{ name: 'HeldoutAlt', objects: [{ rect: { x: 0.55, y: 0.55, w: 8.2, h: 0.18, fill: { color: '7C3AED' }, line: { color: '5B21B6', width: 1.25 }, objectName: 'family-layout-edited-rule' } }], background: { color: 'F5F3FF' }, margin: null },
		]
		const edited = dataOf('imported carrier edit', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId, deckVersion: entry.deckVersion, spec: patchSpec('Imported carrier edit', editOperations),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		assert.ok(edited.patchResults?.some(item => item?.carrier?.kind === 'master' && item?.carrier?.mode === 'native-edit'), 'master native-edit readback')
		assert.ok(edited.patchResults?.some(item => item?.carrier?.name === 'HeldoutAlt' && item?.carrier?.mode === 'native-edit'), 'layout native-edit readback')
		const editedBuffer = await pptxBuffer(entry)
		await writeArtifact(outputDir, 'family-imported-carrier-edited.pptx', editedBuffer, artifacts)
		const editedPackage = await packageSnapshot(editedBuffer, 'imported-edited')
		assert.ok(editedPackage.shapeNames.includes('family-master-edited-rail'), 'master edit serialized')
		assert.ok(editedPackage.shapeNames.includes('family-layout-edited-rule'), 'layout edit serialized')

		const reset = dataOf('imported carrier reset', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId, deckVersion: entry.deckVersion,
			spec: patchSpec('Imported carrier reset', [{ name: 'slideMaster1', kind: 'master', reset: true }, { name: 'HeldoutAlt', reset: true }]),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		assert.equal(reset.patchResults?.filter(item => item?.carrier?.mode === 'reset-to-source').length, 2, 'both carriers reset')
		const resetBuffer = await pptxBuffer(entry)
		await writeArtifact(outputDir, 'family-imported-carrier-reset.pptx', resetBuffer, artifacts)
		const resetPackage = await packageSnapshot(resetBuffer, 'imported-reset')
		assert.equal(resetPackage.shapeNames.includes('family-master-edited-rail'), false)
		assert.equal(resetPackage.shapeNames.includes('family-layout-edited-rule'), false)
		assert.deepEqual(await targetBytes(resetPackage, masterPart), initialMasterXml, 'master XML exact reset')
		assert.deepEqual(await targetBytes(resetPackage, relPart(masterPart)), initialMasterRels, 'master relationships exact reset')
		assert.deepEqual(await targetBytes(resetPackage, altPart), initialAltXml, 'layout XML exact reset')
		assert.deepEqual(await targetBytes(resetPackage, relPart(altPart)), initialAltRels, 'layout relationships exact reset')

		dataOf('imported carrier re-edit', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId, deckVersion: entry.deckVersion, spec: patchSpec('Imported carrier re-edit', [...editOperations].reverse()),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		const finalBuffer = await pptxBuffer(entry)
		const finalPath = await writeArtifact(outputDir, 'family-imported-carrier-final.pptx', finalBuffer, artifacts)
		const finalPackage = await packageSnapshot(finalBuffer, 'imported-final')
		assert.ok(finalPackage.shapeNames.includes('family-master-edited-rail') && finalPackage.shapeNames.includes('family-layout-edited-rule'))

		const exported = dataOf('imported carrier export', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assert.ok(exported?.slides?.length === 2, 'imported carrier export slide count')
		const replay = dataOf('imported carrier replay', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exported, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(replay.deckId)
		const replayBuffer = await pptxBuffer(getDeck(replay.deckId))
		await writeArtifact(outputDir, 'family-imported-carrier-replay.pptx', replayBuffer, artifacts)
		const replayPackage = await packageSnapshot(replayBuffer, 'imported-replay')
		assert.deepEqual(replayPackage.slideLayoutNames, finalPackage.slideLayoutNames, 'portable replay layout bindings')

		let officeEvidence = { status: 'dependency-gated', reason: 'Pass --office to run PowerPoint Open2007/SaveCopyAs/reopen and render proof.' }
		if (office) {
			const outputPath = path.join(outputDir, 'family-imported-carrier-office-savecopyas.pptx')
			const reportPath = path.join(outputDir, 'family-imported-carrier-office-com.json')
			const sourceRenderDir = path.join(outputDir, 'family-imported-carrier-generated-renders')
			const roundtripRenderDir = path.join(outputDir, 'family-imported-carrier-reopened-renders')
			const result = await runOfficeProof(finalPath, outputPath, reportPath, sourceRenderDir, roundtripRenderDir)
			const roundtripBuffer = await fs.readFile(outputPath)
			const roundtripPackage = await packageSnapshot(roundtripBuffer, 'imported-office-roundtrip')
			assert.ok(roundtripPackage.shapeNames.includes('family-master-edited-rail') && roundtripPackage.shapeNames.includes('family-layout-edited-rule'))
			officeEvidence = { status: 'PASS', ...result, roundtrip: { file: relative(outputPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) } }
		}

		const negativeMutationGates = []
		negativeMutationGates.push(await assertRejectedWithoutMutation(
			mcp, entry, created.deckId,
			patchSpec('Unknown carrier rejection', [{ name: 'MissingCarrier', kind: 'master', reset: true }]),
			/not editable|not found|unknown|missing/i, 'unknown template master carrier',
		))
		negativeMutationGates.push(await assertRejectedWithoutMutation(
			mcp, entry, created.deckId,
			patchSpec('Unknown layout carrier rejection', [{ name: 'MissingLayoutCarrier', objects: [{ rect: { x: 0.5, y: 0.5, w: 1, h: 1, objectName: 'must-not-exist' } }] }]),
			/not editable|not found|unknown|missing/i, 'unknown template layout carrier',
		))

		return {
			status: office ? 'IMPORTED_TEMPLATE_CARRIER_PACKAGE_AND_OFFICE_VERIFIED' : 'IMPORTED_TEMPLATE_CARRIER_PACKAGE_VERIFIED_OFFICE_GATED',
			fixture: { file: relative(fixture), sha256: sha256(await fs.readFile(fixture)) },
			checks: {
				xmlParseAndOpcClosure: true, relationshipAndContentTypeClosure: true,
				nativeMasterAndLayoutSparseEdit: true, exactSourceReset: true, reverseOrderReedit: true,
				exportReplayBindings: true, failClosedNoMutationUnknownMasterResetAndLayoutEdit: negativeMutationGates.length === 2,
				powerPointOpen2007SaveCopyAsReopenAndRender: officeEvidence.status === 'PASS',
			},
			negativeMutationGates, office: officeEvidence, artifacts,
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

function validateCanonicalInventory(manifest) {
	const unit = manifest.workUnits?.find(item => item.id === LAYOUTS_THEMES_MASTERS_FAMILY_UNIT_ID)
	assert.ok(unit, 'canonical unit missing')
	assert.equal(unit.family, 'layouts-themes-masters')
	assert.deepEqual(unit.rowIds, LAYOUTS_THEMES_MASTERS_FAMILY_ROWS.map(row => row.id))
	assert.deepEqual(unit.representativeLabels, LAYOUTS_THEMES_MASTERS_FAMILY_ROWS.map(row => row.label))
	return unit
}

export async function runLayoutsThemesMastersFamilyProof({ outputDir, office = false } = {}) {
	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-layouts-themes-masters-family-'))
	if (outputDir) await fs.mkdir(resolvedOutput, { recursive: false })
	assert.deepEqual(await fs.readdir(resolvedOutput), [], `Output directory must be new and empty: ${resolvedOutput}`)
	const manifest = JSON.parse(await fs.readFile(path.join(moduleDir, 'implementation-gap-manifest.json'), 'utf8'))
	const unit = validateCanonicalInventory(manifest)
	const inheritance = await runLayoutThemeMasterInheritanceProof({ outputDir: path.join(resolvedOutput, 'authored-inheritance'), office })
	assert.match(inheritance.status, office ? /PACKAGE_AND_OFFICE_VERIFIED$/ : /PACKAGE_VERIFIED_OFFICE_GATED$/)
	assert.deepEqual(inheritance.blockers, [])
	const presets = await runMasterPresetSelectorProof({ outputDir: path.join(resolvedOutput, 'bundled-selectors'), office })
	assert.match(presets.status, office ? /PACKAGE_AND_OFFICE_VERIFIED$/ : /PACKAGE_VERIFIED_OFFICE_GATED$/)
	assert.deepEqual(presets.blockers, [])
	const imported = await runImportedCarrierProof({ outputDir: path.join(resolvedOutput, 'imported-carriers'), office })
	const status = office
		? 'LAYOUTS_THEMES_MASTERS_FAMILY_PACKAGE_AND_OFFICE_VERIFIED'
		: 'LAYOUTS_THEMES_MASTERS_FAMILY_PACKAGE_VERIFIED_OFFICE_GATED'
	return {
		schemaVersion: 'betterpptx.layouts-themes-masters-family-unit-proof.v1', unitId: LAYOUTS_THEMES_MASTERS_FAMILY_UNIT_ID,
		status, generatedAt: new Date().toISOString(), rows: LAYOUTS_THEMES_MASTERS_FAMILY_ROWS,
		canonicalInventory: {
			wave: unit.wave, sourceCapabilityStatusAtRun: unit.sourceCapabilityStatus,
			declaredOverrideFields: unit.declaredOverrideFields, componentOwnership: unit.componentOwnership,
		},
		checks: {
			canonicalSingleRowInventory: true,
			authoredThemeMasterLayoutCreateResetReeditReplaceDeleteReaddReorderExportReplay: true,
			bundledTemplateMasterAndLayoutSelection: true,
			importedRelationshipBearingTemplateCarrierEditResetReeditExportReplay: true,
			opcXmlRelationshipContentTypeClosureAcrossAllLanes: true,
			failClosedNoMutationAcrossBindingsSelectorsAndCarriers: true,
			powerPointRepairDisabledOpen2007SaveCopyAsReopen: office,
		},
		proofBoundary: {
			inScope: 'newly authored one-master theme/layout inheritance; bundled immutable one-master template/master/layout selection; imported relationship-bearing master/layout sparse edits and exact reset; lifecycle topology changes, portable replay, immutable rejection, OPC closure, and PowerPoint roundtrip',
			outOfScope: 'new synthesis of more than one authored physical master, exhaustive Office gallery capture, and arbitrary unsupported raw template payload authorship; imported multi-master preservation remains a separate preservation lane',
		},
		blockers: [], childProofs: { inheritance, presets, imported },
		proofPath: relative(path.join(resolvedOutput, 'layouts-themes-masters-family-unit-proof.json')),
	}
}

async function main() {
	const configured = process.env.BETTERPPTX_LAYOUTS_THEMES_MASTERS_OUTPUT
	const outputDir = configured ? path.resolve(configured) : path.join(os.tmpdir(), `betterpptx-layouts-themes-masters-family-${timestamp()}-${crypto.randomUUID()}`)
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_LAYOUTS_THEMES_MASTERS_OFFICE === '1'
	let result
	try {
		result = await runLayoutsThemesMastersFamilyProof({ outputDir, office })
	} catch (error) {
		result = {
			schemaVersion: 'betterpptx.layouts-themes-masters-family-unit-proof.v1', unitId: LAYOUTS_THEMES_MASTERS_FAMILY_UNIT_ID,
			status: 'LAYOUTS_THEMES_MASTERS_FAMILY_PRODUCTION_BLOCKED', generatedAt: new Date().toISOString(), rows: LAYOUTS_THEMES_MASTERS_FAMILY_ROWS,
			blockers: [{ message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }],
			proofPath: relative(path.join(outputDir, 'layouts-themes-masters-family-unit-proof.json')),
		}
	}
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'layouts-themes-masters-family-unit-proof.json')
	await fs.writeFile(proofPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
	console.log(JSON.stringify({ ...result, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2))
	if (result.status === 'LAYOUTS_THEMES_MASTERS_FAMILY_PRODUCTION_BLOCKED') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
