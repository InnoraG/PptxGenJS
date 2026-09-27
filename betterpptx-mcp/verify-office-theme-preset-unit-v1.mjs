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

import { THEME_GALLERY_PRESETS, resolveLayoutThemeMasterSpec } from './source-api-gallery-presets.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(moduleDir, '..')
const UNIT_ID = 'impl-b-b0d8124a1c74c333'
const ROW = Object.freeze({ id: 'cap_8d27ff2bc65e268f7bc4', label: 'Office Theme -> theme-office-001' })
const THEME_PRESET_ID = 'theme-office-001'
const TEMPLATE_PRESET_ID = 'template-office-baseline-wide-001'
const TEMPLATE_FILE = path.join(moduleDir, 'assets/templates/office-baseline-wide.pptx')
const DEFAULT_LAYOUT = 'Title and Content'
const EXPLICIT_LAYOUT = 'Two Content'
const EXPLICIT_LAYOUT_PRESET_ID = 'layout-office-baseline-wide-004'
const LAYOUT_COUNT = 11
const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const THEME_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.theme+xml'
const SLOTS = Object.freeze(['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'])
const SOURCE_COLORS = Object.freeze({
	dk1: '000000', lt1: 'FFFFFF', dk2: '0E2841', lt2: 'E8E8E8', accent1: '156082', accent2: 'E97132',
	accent3: '196B24', accent4: '0F9ED5', accent5: 'A02B93', accent6: '4EA72E', hlink: '467886', folHlink: '96607D',
})
const EDIT_COLORS = Object.freeze({
	dk1: '111827', lt1: 'F9FAFB', dk2: '1F2937', lt2: 'E5E7EB', accent1: '2563EB', accent2: 'DC2626',
	accent3: '059669', accent4: 'D97706', accent5: '7C3AED', accent6: '0891B2', hlink: '1D4ED8', folHlink: '6D28D9',
})
const FINAL_THEME = Object.freeze({
	fontFace: 'Arial', headFontFace: 'Georgia', bodyFontFace: 'Verdana', lang: 'fr-FR', colorScheme: EDIT_COLORS,
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
		warning: message => errors.push(`warning: ${message}`),
		error: message => errors.push(`error: ${message}`),
		fatalError: message => errors.push(`fatal: ${message}`),
	} }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label}: XML parser errors`)
	assert.notEqual(document.documentElement?.localName, 'parsererror', `${label}: parsererror root`)
	return document
}

const elements = (node, localName) => Array.from(node?.getElementsByTagName('*') || []).filter(item => item.localName === localName)
const children = node => Array.from(node?.childNodes || []).filter(item => item.nodeType === 1)
const relationshipPartFor = part => path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`)
const sourcePartForRelationships = rel => rel === '_rels/.rels' ? '' : path.posix.join(path.posix.dirname(path.posix.dirname(rel)), path.posix.basename(rel, '.rels'))
const resolveTarget = (source, target) => {
	const raw = String(target || '').replaceAll('\\', '/')
	return raw.startsWith('/') ? path.posix.normalize(raw.slice(1)) : path.posix.normalize(path.posix.join(source ? path.posix.dirname(source) : '', raw))
}
const relationships = document => elements(document, 'Relationship').map(node => ({
	Id: node.getAttribute('Id'), Type: node.getAttribute('Type'), Target: node.getAttribute('Target'), TargetMode: node.getAttribute('TargetMode'),
}))
const relsFor = (documents, part) => relationships(documents.get(relationshipPartFor(part)))
const numericPartSort = (a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0)

function colorValue(slot) {
	const child = children(slot)[0]
	if (!child) return null
	if (child.localName === 'sysClr') return child.getAttribute('lastClr') || child.getAttribute('val') || ''
	return child.getAttribute('val') || child.getAttribute('lastClr') || ''
}

function themeSignature(document) {
	const font = family => elements(elements(document, family)[0], 'latin')[0]?.getAttribute('typeface') || ''
	const colors = Object.fromEntries(SLOTS.map(slot => [slot, colorValue(elements(document, slot)[0])]))
	const fmt = elements(document, 'fmtScheme')[0]
	return {
		name: document.documentElement?.getAttribute('name') || '',
		colorSchemeName: elements(document, 'clrScheme')[0]?.getAttribute('name') || '',
		fontSchemeName: elements(document, 'fontScheme')[0]?.getAttribute('name') || '',
		majorLatin: font('majorFont'), minorLatin: font('minorFont'), colors,
		formatInventory: Object.fromEntries(['fillStyleLst', 'lnStyleLst', 'effectStyleLst', 'bgFillStyleLst'].map(name => [name, children(elements(fmt, name)[0]).length])),
		hasObjectDefaults: elements(document, 'objectDefaults').length > 0,
		hasExtraColorSchemes: elements(document, 'extraClrSchemeLst').length > 0,
	}
}

function masterLanguageSignature(document) {
	const txStyles = elements(document, 'txStyles')[0]
	const langs = new Set()
	for (const node of elements(txStyles, 'defRPr')) {
		const lang = node.getAttribute('lang')
		if (lang) langs.add(lang)
	}
	return [...langs].sort()
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

async function inspectPackage(buffer, label, { officeRoundtrip = false } = {}) {
	const { names, documents } = await loadPackage(buffer, label)
	const nameSet = new Set(names)
	for (const relName of names.filter(name => name.endsWith('.rels'))) {
		const source = sourcePartForRelationships(relName)
		const records = relationships(documents.get(relName))
		assert.equal(new Set(records.map(item => item.Id)).size, records.length, `${label}/${relName}: duplicate relationship Id`)
		for (const relationship of records.filter(item => String(item.TargetMode).toLowerCase() !== 'external')) {
			const target = resolveTarget(source, relationship.Target)
			assert.ok(nameSet.has(target), `${label}/${relName}: dangling ${relationship.Id} -> ${target}`)
		}
	}
	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${label}: content types missing`)
	const defaults = new Map(elements(contentTypes, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')]))
	const overrides = new Map(elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const part of overrides.keys()) assert.ok(nameSet.has(part), `${label}: orphan content type ${part}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: missing content type for ${name}`)
	}
	const masterParts = names.filter(name => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort(numericPartSort)
	const layoutParts = names.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(numericPartSort)
	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericPartSort)
	const themeParts = names.filter(name => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort(numericPartSort)
	assert.equal(masterParts.length, 1, `${label}: exactly one master`)
	assert.equal(layoutParts.length, LAYOUT_COUNT, `${label}: exact Office layout inventory`)
	if (officeRoundtrip) assert.ok([1, 2].includes(themeParts.length), `${label}: Office may share or split the notes-master theme`)
	else assert.equal(themeParts.length, 1, `${label}: exactly one generated theme`)
	for (const part of themeParts) assert.equal(overrides.get(part), THEME_CONTENT_TYPE, `${label}: theme content type`)
	const masterPart = masterParts[0]
	const masterThemeTargets = relsFor(documents, masterPart).filter(item => item.Type === `${REL_BASE}theme`).map(item => resolveTarget(masterPart, item.Target))
	assert.equal(masterThemeTargets.length, 1, `${label}: master has exactly one theme edge`)
	assert.ok(themeParts.includes(masterThemeTargets[0]), `${label}: master theme exists`)
	const masterLayoutTargets = relsFor(documents, masterPart).filter(item => item.Type === `${REL_BASE}slideLayout`).map(item => resolveTarget(masterPart, item.Target)).sort()
	assert.deepEqual(masterLayoutTargets, [...layoutParts].sort(), `${label}: all layouts are reached by master`)
	for (const layout of layoutParts) {
		const targets = relsFor(documents, layout).filter(item => item.Type === `${REL_BASE}slideMaster`).map(item => resolveTarget(layout, item.Target))
		assert.deepEqual(targets, [masterPart], `${label}/${layout}: exactly one reverse master edge`)
	}
	const layoutNameByPart = new Map(layoutParts.map(part => [part, elements(documents.get(part), 'cSld')[0]?.getAttribute('name') || '']))
	const slideLayoutNames = []
	for (const slide of slideParts) {
		const targets = relsFor(documents, slide).filter(item => item.Type === `${REL_BASE}slideLayout`).map(item => resolveTarget(slide, item.Target))
		assert.equal(targets.length, 1, `${label}/${slide}: one layout edge`)
		assert.ok(layoutNameByPart.has(targets[0]), `${label}/${slide}: layout is in master inventory`)
		slideLayoutNames.push(layoutNameByPart.get(targets[0]))
	}
	const reachedThemes = new Set(masterThemeTargets)
	let officeThemeTopology = 'shared-master-theme'
	if (officeRoundtrip && themeParts.length === 2) {
		const notesMasters = names.filter(name => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(name))
		assert.equal(notesMasters.length, 1, `${label}: split theme needs one notes master`)
		const targets = relsFor(documents, notesMasters[0]).filter(item => item.Type === `${REL_BASE}theme`).map(item => resolveTarget(notesMasters[0], item.Target))
		assert.equal(targets.length, 1, `${label}: notes master has one theme edge`)
		reachedThemes.add(targets[0])
		const notesTheme = themeSignature(documents.get(targets[0]))
		const slideMasterTheme = themeSignature(documents.get(masterThemeTargets[0]))
		if (JSON.stringify(notesTheme) === JSON.stringify(slideMasterTheme)) officeThemeTopology = 'office-notes-theme-split-equal'
		else {
			assert.equal(notesTheme.majorLatin, 'Aptos Display', `${label}: split notes theme retains source major font`)
			assert.equal(notesTheme.minorLatin, 'Aptos', `${label}: split notes theme retains source minor font`)
			assert.deepEqual(notesTheme.colors, SOURCE_COLORS, `${label}: split notes theme retains source colors`)
			assert.deepEqual(notesTheme.formatInventory, slideMasterTheme.formatInventory, `${label}: split notes theme format inventory`)
			assert.equal(notesTheme.hasObjectDefaults, slideMasterTheme.hasObjectDefaults, `${label}: split notes theme object defaults`)
			officeThemeTopology = 'office-notes-theme-split-source-baseline'
		}
	}
	assert.deepEqual([...reachedThemes].sort(), themeParts, `${label}: every theme part is reached; no orphan theme`)
	return {
		label, partCount: names.length, slideCount: slideParts.length, layoutCount: layoutParts.length, masterCount: masterParts.length,
		themeCount: themeParts.length, themePart: masterThemeTargets[0], theme: themeSignature(documents.get(masterThemeTargets[0])),
		masterLanguages: masterLanguageSignature(documents.get(masterPart)), slideLayoutNames, officeThemeTopology,
	}
}

function normalizeCoreXml(bytes, label) {
	const document = parseXmlStrict(bytes.toString('utf8'), label)
	for (const name of ['created', 'modified']) for (const node of elements(document, name)) while (node.firstChild) node.removeChild(node.firstChild)
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
	const [a, b] = await Promise.all([stableMemberSnapshot(before, `${label}-before`), stableMemberSnapshot(after, `${label}-after`)])
	assert.deepEqual(b, a, `${label}: rejected request changed stable package members`)
	return { stableMemberCount: Object.keys(a).length, normalizedOnly: ['docProps/core.xml created', 'docProps/core.xml modified'] }
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove native Office theme lifecycle', remember: 'semantic preset, native theme, inherited master text style' },
		visualDesign: { world: 'blueprint', framing: 'native carrier audit', tone: 'technical' },
		motionTime: { masterClock: 'authored static slides', timingSource: 'static', syncPolicy: 'single static clock' },
		styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	}
}

function baseSelectors() {
	return { themePresetId: THEME_PRESET_ID, template: { templatePresetId: TEMPLATE_PRESET_ID } }
}

function authoredSpec() {
	return {
		...metadata('Office Theme native lifecycle proof'), ...baseSelectors(),
		slides: [
			{ id: 'theme-default', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'default-proof', text: 'Office Theme — default layout' }] },
			{ id: 'theme-explicit', layoutIntent: 'title-only', layoutPresetId: EXPLICIT_LAYOUT_PRESET_ID, content: [{ kind: 'textBox', name: 'explicit-proof', text: 'Office Theme — explicit Two Content layout' }] },
		],
	}
}

function patchSpec(patch) {
	return { ...metadata('Office Theme native lifecycle proof'), template: { templatePresetId: TEMPLATE_PRESET_ID }, slides: [], ...patch }
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function writeImmutable(file, value, encoding = undefined) {
	await fs.writeFile(file, value, { ...(encoding ? { encoding } : {}), flag: 'wx' })
}

function assertTheme(actual, expected, label) {
	assert.equal(actual.majorLatin, expected.majorLatin, `${label}: major Latin theme font`)
	assert.equal(actual.minorLatin, expected.minorLatin, `${label}: minor Latin theme font`)
	assert.deepEqual(actual.colors, expected.colors, `${label}: twelve native theme slots`)
}

function assertSourceFormatCarrier(actual, source, label) {
	assert.deepEqual(actual.formatInventory, source.formatInventory, `${label}: fmtScheme inventory remains intact`)
	assert.equal(actual.hasObjectDefaults, source.hasObjectDefaults, `${label}: objectDefaults presence remains intact`)
	assert.equal(actual.hasExtraColorSchemes, source.hasExtraColorSchemes, `${label}: extra color scheme presence remains intact`)
}

async function checkpoint({ outputDir, entry, name, expectedTheme, sourceTheme, expectedLang, artifacts, lifecycle }) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `office-theme-${name}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPackage(buffer, name)
	assert.deepEqual(inspection.slideLayoutNames, [DEFAULT_LAYOUT, EXPLICIT_LAYOUT], `${name}: slide layout bindings`)
	assertTheme(inspection.theme, expectedTheme, name)
	assertSourceFormatCarrier(inspection.theme, sourceTheme, name)
	if (expectedLang) assert.ok(inspection.masterLanguages.includes(expectedLang), `${name}: master text-style language ${expectedLang}`)
	artifacts[name] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push({ state: name, ...inspection })
	return { file, buffer, inspection }
}

async function commitPatch(mcp, deckId, entry, spec, label) {
	const result = dataOf(label, await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: entry.deckVersion, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	assert.deepEqual(result.unsupportedFindings || [], [], `${label}: unsupported findings`)
	return result
}

function failureText(result) { return JSON.stringify(result) }

async function assertRejectedWithoutMutation({ mcp, deckId, entry, invalidSpec, expected, label }) {
	const beforeVersion = entry.deckVersion
	const before = await pptxBuffer(entry)
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: beforeVersion, spec: invalidSpec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	})
	const diagnostic = failureText(result)
	assert.equal(result?.ok, false, `${label}: invalid request was accepted`)
	assert.match(diagnostic, expected, `${label}: precise diagnostic: ${diagnostic}`)
	assert.equal(entry.deckVersion, beforeVersion, `${label}: deckVersion changed`)
	const after = await pptxBuffer(entry)
	const stable = await assertStableMembers(before, after, label)
	await inspectPackage(after, `${label}-after`)
	return { label, diagnostic: diagnostic.slice(0, 1000), deckVersion: beforeVersion, ...stable }
}

function portableSpec(spec) {
	const value = structuredClone(spec)
	delete value.nativePackagePreservation
	for (const slide of value.slides || []) {
		delete slide.nativeTimingPreservation
		slide.content = (slide.content || []).filter(item => item.kind !== 'opaqueNative').map(item => {
			const { editHandle, nativePreservation, preservationHandle, ...portable } = item
			return portable
		})
	}
	return value
}

function assertExportedSelectors(spec, { preset = true, theme = undefined } = {}, label) {
	assert.equal(spec.template?.templatePresetId, TEMPLATE_PRESET_ID, `${label}: template resource identity`)
	if (preset) assert.equal(spec.themePresetId, THEME_PRESET_ID, `${label}: theme preset identity`)
	else assert.equal(Object.prototype.hasOwnProperty.call(spec, 'themePresetId'), false, `${label}: theme preset is omitted`)
	if (theme === null) assert.equal(Object.prototype.hasOwnProperty.call(spec, 'theme'), false, `${label}: full reset omits authored theme`)
	else if (theme) assert.deepEqual(spec.theme, theme, `${label}: authored theme fields`)
}

function oleRgbHex(value) {
	const number = Number(value) >>> 0
	return [number & 255, (number >>> 8) & 255, (number >>> 16) & 255].map(item => item.toString(16).padStart(2, '0')).join('').toUpperCase()
}

async function runOfficeProof(inputPath, outputPath, reportPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const sourceRenderDir = outputPath.replace(/\.pptx$/i, '-generated-renders')
	const roundtripRenderDir = outputPath.replace(/\.pptx$/i, '-reopened-renders')
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-office-theme-preset-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', sourceRenderDir, '-RoundtripRenderDir', roundtripRenderDir,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.source.SlideCount, 2)
	assert.equal(report.source.DesignCount, 1)
	assert.equal(report.source.LayoutCount, LAYOUT_COUNT)
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint COM semantic snapshot changed after SaveCopyAs/reopen')
	assert.equal(report.source.Theme.MajorLatin, FINAL_THEME.headFontFace)
	assert.equal(report.source.Theme.MinorLatin, FINAL_THEME.bodyFontFace)
	assert.deepEqual(Object.fromEntries(Object.entries(report.source.Theme.Colors).map(([key, value]) => [key, oleRgbHex(value)])), EDIT_COLORS)
	const renderEvidence = []
	for (const name of ['slide-1.png', 'slide-2.png']) {
		const generated = path.join(sourceRenderDir, name)
		const reopened = path.join(roundtripRenderDir, name)
		const [a, b] = await Promise.all([fs.readFile(generated), fs.readFile(reopened)])
		assert.equal(sha256(b), sha256(a), `${name}: rendered pixels changed after SaveCopyAs/reopen`)
		renderEvidence.push({ slide: Number(name.match(/\d+/)?.[0]), generated: { file: relative(generated), sha256: sha256(a), bytes: a.length }, reopened: { file: relative(reopened), sha256: sha256(b), bytes: b.length }, exactPngBytesEqual: true })
	}
	return { ...report, renderEvidence }
}

function assertRegistryContract() {
	const preset = THEME_GALLERY_PRESETS.find(item => item.id === THEME_PRESET_ID)
	assert.ok(preset, 'Office theme preset is registered')
	assert.equal(preset.kind, 'theme')
	assert.equal(preset.scope.resourceId, TEMPLATE_PRESET_ID)
	const resolved = resolveLayoutThemeMasterSpec({ themePresetId: THEME_PRESET_ID, slides: [] })
	assert.equal(resolved.template?.templatePresetId, TEMPLATE_PRESET_ID)
	assert.equal(resolved.template?.defaultLayout, DEFAULT_LAYOUT)
	assert.throws(() => resolveLayoutThemeMasterSpec({ themePresetId: 'master-office-baseline-wide-001', slides: [] }), /must identify a theme gallery preset/i)
}

export async function runOfficeThemePresetProof({ outputDir, office = false } = {}) {
	assertRegistryContract()
	const resolvedOutput = outputDir ? path.resolve(outputDir) : await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-office-theme-preset-'))
	if (outputDir) await fs.mkdir(resolvedOutput, { recursive: false })
	assert.deepEqual(await fs.readdir(resolvedOutput), [], `Output directory must be new and empty: ${resolvedOutput}`)
	const sourceBuffer = await fs.readFile(TEMPLATE_FILE)
	const sourceInspection = await inspectPackage(sourceBuffer, 'bundled-office-source')
	assertTheme(sourceInspection.theme, { majorLatin: 'Aptos Display', minorLatin: 'Aptos', colors: SOURCE_COLORS }, 'bundled-office-source')
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `office-theme-preset-${Date.now()}`, clientInfo: { name: 'office-theme-preset-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true,
	})
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	const negativeMutationGates = []
	let officeCheckpoint = null
	try {
		const created = dataOf('initial create', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		assert.equal(entry._betterpptxTemplatePresetId, TEMPLATE_PRESET_ID, 'runtime template resource identity')
		assert.equal(entry._betterpptxThemePresetId, THEME_PRESET_ID, 'runtime theme preset identity')
		await checkpoint({ outputDir: resolvedOutput, entry, name: 'initial', expectedTheme: sourceInspection.theme, sourceTheme: sourceInspection.theme, expectedLang: 'en-US', artifacts, lifecycle })

		const firstEdit = { fontFace: 'Arial', lang: 'de-DE', colorScheme: EDIT_COLORS }
		await commitPatch(mcp, created.deckId, entry, patchSpec({ themePresetId: THEME_PRESET_ID, theme: firstEdit }), 'font/color/lang edit')
		await checkpoint({ outputDir: resolvedOutput, entry, name: 'edited', expectedTheme: { majorLatin: 'Arial', minorLatin: 'Arial', colors: EDIT_COLORS }, sourceTheme: sourceInspection.theme, expectedLang: 'de-DE', artifacts, lifecycle })

		await commitPatch(mcp, created.deckId, entry, patchSpec({ themePresetId: THEME_PRESET_ID, theme: { headFontFace: 'Georgia', bodyFontFace: 'Verdana' } }), 'sparse re-edit')
		await checkpoint({ outputDir: resolvedOutput, entry, name: 're-edited', expectedTheme: { majorLatin: 'Georgia', minorLatin: 'Verdana', colors: EDIT_COLORS }, sourceTheme: sourceInspection.theme, expectedLang: 'de-DE', artifacts, lifecycle })

		const nullColors = Object.fromEntries(SLOTS.map(slot => [slot, null]))
		const componentReset = { fontFace: null, headFontFace: null, bodyFontFace: null, lang: null, colorScheme: nullColors }
		await commitPatch(mcp, created.deckId, entry, patchSpec({ themePresetId: THEME_PRESET_ID, theme: componentReset }), 'component null reset')
		await checkpoint({ outputDir: resolvedOutput, entry, name: 'component-reset', expectedTheme: sourceInspection.theme, sourceTheme: sourceInspection.theme, expectedLang: 'en-US', artifacts, lifecycle })
		const componentExport = dataOf('component reset export', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSelectors(componentExport, { preset: true, theme: componentReset }, 'component reset export')

		await commitPatch(mcp, created.deckId, entry, patchSpec({ themePresetId: THEME_PRESET_ID, theme: null }), 'full authored-theme reset')
		await checkpoint({ outputDir: resolvedOutput, entry, name: 'full-reset', expectedTheme: sourceInspection.theme, sourceTheme: sourceInspection.theme, expectedLang: 'en-US', artifacts, lifecycle })
		const resetExport = dataOf('full reset export', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSelectors(resetExport, { preset: true, theme: null }, 'full reset export')

		await commitPatch(mcp, created.deckId, entry, patchSpec({ themePresetId: THEME_PRESET_ID, theme: FINAL_THEME }), 'preset re-add and re-edit')
		const finalState = await checkpoint({ outputDir: resolvedOutput, entry, name: 'final', expectedTheme: { majorLatin: FINAL_THEME.headFontFace, minorLatin: FINAL_THEME.bodyFontFace, colors: EDIT_COLORS }, sourceTheme: sourceInspection.theme, expectedLang: FINAL_THEME.lang, artifacts, lifecycle })

		for (const gate of [
			{ label: 'null-theme-preset', expected: /non-null bundled theme preset IDs|replace|createNew/i, spec: patchSpec({ themePresetId: null }) },
			{ label: 'unknown-theme-preset', expected: /unknown layout\/theme\/master gallery preset/i, spec: patchSpec({ themePresetId: 'theme-does-not-exist-999' }) },
			{ label: 'wrong-kind-theme-preset', expected: /must identify a theme gallery preset/i, spec: patchSpec({ themePresetId: 'master-office-baseline-wide-001' }) },
			{ label: 'cross-resource-template', expected: /different template resources|cross.resource|cannot change/i, spec: { ...patchSpec({ themePresetId: THEME_PRESET_ID }), template: { templatePresetId: 'template-corporate-reference-wide-001' } } },
			{ label: 'invalid-theme-color', expected: /color|hex|pattern|schema/i, spec: patchSpec({ themePresetId: THEME_PRESET_ID, theme: { colorScheme: { accent1: 'NOTHEX' } } }) },
			{ label: 'invalid-theme-font', expected: /fontFace|minLength|non.empty|fewer than|schema/i, spec: patchSpec({ themePresetId: THEME_PRESET_ID, theme: { headFontFace: '' } }) },
			{ label: 'invalid-theme-language', expected: /lang|pattern|BCP|schema/i, spec: patchSpec({ themePresetId: THEME_PRESET_ID, theme: { lang: 'not_a_lang' } }) },
		]) negativeMutationGates.push(await assertRejectedWithoutMutation({ mcp, deckId: created.deckId, entry, invalidSpec: gate.spec, expected: gate.expected, label: gate.label }))

		const staleVersion = entry.deckVersion - 1
		const beforeStale = await pptxBuffer(entry)
		const stale = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId, deckVersion: staleVersion, spec: patchSpec({ themePresetId: THEME_PRESET_ID, theme: { lang: 'it-IT' } }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		})
		assert.equal(stale?.ok, false, 'stale deckVersion rejected')
		assert.match(failureText(stale), /deck.?version|stale|conflict/i)
		const afterStale = await pptxBuffer(entry)
		negativeMutationGates.push({ label: 'stale-deck-version', diagnostic: failureText(stale).slice(0, 1000), ...(await assertStableMembers(beforeStale, afterStale, 'stale-deck-version')) })

		const [repeatA, repeatB] = await Promise.all([pptxBuffer(entry), pptxBuffer(entry)])
		await assertStableMembers(repeatA, repeatB, 'deterministic-repeated-write')

		const exported = dataOf('final export', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSelectors(exported, { preset: true, theme: FINAL_THEME }, 'final export')
		const exportedPath = path.join(resolvedOutput, 'office-theme-exported-spec.json')
		await writeImmutable(exportedPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
		artifacts.exportedSpec = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }
		const replay = dataOf('portable replay', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: portableSpec(exported), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		assert.equal(replayEntry._betterpptxThemePresetId, THEME_PRESET_ID, 'replay theme preset identity')
		await checkpoint({ outputDir: resolvedOutput, entry: replayEntry, name: 'recompiled', expectedTheme: { majorLatin: FINAL_THEME.headFontFace, minorLatin: FINAL_THEME.bodyFontFace, colors: EDIT_COLORS }, sourceTheme: sourceInspection.theme, expectedLang: FINAL_THEME.lang, artifacts, lifecycle })
		const replayExport = dataOf('replay export', await mcp.call('betterpptx.deck.export_spec', { deckId: replay.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSelectors(replayExport, { preset: true, theme: FINAL_THEME }, 'replay export')

		if (office) {
			const outputPath = path.join(resolvedOutput, 'office-theme-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'office-theme-office-com.json')
			const report = await runOfficeProof(finalState.file, outputPath, reportPath)
			const roundtripBuffer = await fs.readFile(outputPath)
			const packageInspection = await inspectPackage(roundtripBuffer, 'office-roundtrip', { officeRoundtrip: true })
			assertTheme(packageInspection.theme, { majorLatin: FINAL_THEME.headFontFace, minorLatin: FINAL_THEME.bodyFontFace, colors: EDIT_COLORS }, 'office-roundtrip')
			assert.ok(packageInspection.masterLanguages.includes(FINAL_THEME.lang), 'office-roundtrip: master language retained')
			officeCheckpoint = { reportFile: relative(reportPath), roundtripFile: relative(outputPath), roundtripSha256: sha256(roundtripBuffer), package: packageInspection, renderEvidence: report.renderEvidence }
			artifacts.officeRoundtrip = { file: relative(outputPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
		}

		return {
			schemaVersion: 'betterpptx.office-theme-preset-unit-proof.v1', unitId: UNIT_ID, row: ROW,
			status: office ? 'OFFICE_THEME_PRESET_PACKAGE_AND_OFFICE_VERIFIED' : 'OFFICE_THEME_PRESET_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(),
			checks: {
				registryAndResourceScope: true, xmlCrcAndOpcClosure: true, relationshipAndContentTypeClosure: true,
				masterThemeAndLayoutGraphClosure: true, nativeThemeAndMasterLanguageCarriers: true, updateComponentResetFullResetAndReedit: true,
				exportAndPortableReplay: true, deterministicRepeatedWrite: true, failClosedNoMutation: negativeMutationGates.length === 8,
				powerPointOpen2007SaveCopyAsReopen: Boolean(officeCheckpoint), officeComThemeEquality: Boolean(officeCheckpoint),
				officePostPackageClosure: Boolean(officeCheckpoint), generatedAndReopenedRenderEquality: Boolean(officeCheckpoint?.renderEvidence?.every(item => item.exactPngBytesEqual)),
			},
			proofBoundary: {
				inScope: 'resource-scoped theme-office-001 selection on template-office-baseline-wide-001; native theme color/font and master text-language carriers; update, sparse re-edit, component null reset, theme:null source reset, re-edit, export/replay, deterministic write, invalid no-mutation, and repair-disabled Office roundtrip',
				outOfScope: 'themePresetId:null, cross-resource in-place migration, and multi-master themes. The selector owns a native resource carrier; selector removal or resource migration requires immutable replace/create.',
			},
			source: { file: relative(TEMPLATE_FILE), bytes: sourceBuffer.length, sha256: sha256(sourceBuffer), inspection: sourceInspection },
			negativeMutationGates, lifecycle, office: officeCheckpoint || { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_OFFICE_THEME_PRESET_OFFICE=1.' }, artifacts,
			manualVisualInspection: officeCheckpoint ? { status: 'required', evidence: officeCheckpoint.renderEvidence, instruction: 'Inspect both generated and reopened slide PNGs at original size before promoting this proof to durable-ready.' } : { status: 'dependency-gated', reason: 'PowerPoint renders require --office.' },
			blockers: [], proofPath: relative(path.join(resolvedOutput, 'office-theme-preset-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const configured = process.env.BETTERPPTX_OFFICE_THEME_PRESET_OUTPUT
	const outputDir = configured ? path.resolve(configured) : path.join(workspaceRoot, 'validation-output', `office-theme-preset-${timestamp()}-${crypto.randomUUID()}`)
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_OFFICE_THEME_PRESET_OFFICE === '1'
	let result
	try {
		result = await runOfficeThemePresetProof({ outputDir, office })
	} catch (error) {
		result = {
			schemaVersion: 'betterpptx.office-theme-preset-unit-proof.v1', unitId: UNIT_ID, row: ROW,
			status: 'OFFICE_THEME_PRESET_PRODUCTION_BLOCKED', generatedAt: new Date().toISOString(),
			blockers: [{ message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }],
			proofPath: relative(path.join(outputDir, 'office-theme-preset-unit-proof.json')),
		}
	}
	await fs.mkdir(outputDir, { recursive: true })
	const proofPath = path.join(outputDir, 'office-theme-preset-unit-proof.json')
	await writeImmutable(proofPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify({ ...result, proofSha256: sha256(await fs.readFile(proofPath)) }, null, 2))
	if (result.status === 'OFFICE_THEME_PRESET_PRODUCTION_BLOCKED') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
