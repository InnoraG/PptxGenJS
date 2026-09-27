import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import {
	LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT,
	LAYOUT_THEME_MASTER_INHERITANCE_PUBLIC_SCHEMA,
	LAYOUT_THEME_MASTER_INHERITANCE_ROW_IDS,
	LAYOUT_THEME_MASTER_INHERITANCE_ROWS,
	LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID,
	layoutThemeMasterInheritanceCapabilityContractForEntry,
} from '../layout-theme-master-inheritance-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)
const validatePublicContract = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(structuredClone(LAYOUT_THEME_MASTER_INHERITANCE_PUBLIC_SCHEMA))

const colorScheme = {
	dk1: '111827', lt1: 'F8FAFC', dk2: '1E293B', lt2: 'E2E8F0',
	accent1: 'C026D3', accent2: '0891B2', accent3: '65A30D', accent4: 'D97706',
	accent5: '7C3AED', accent6: 'DB2777', hlink: '0563C1', folHlink: '954F72',
}
const masterColorMap = {
	bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent2', accent2: 'accent1',
	accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink',
}

function baseSpec(overrides = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native inheritance contract', layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		theme: { name: 'Contract Theme', headFontFace: 'Georgia', bodyFontFace: 'Verdana', lang: 'fr-FR', colorScheme },
		masters: [{
			title: 'ContractMaster', background: 'E2E8F0', colorMap: masterColorMap,
			textStyles: {
				title: { fontFace: 'Georgia', fontSize: 30, color: 'accent1', bold: true, align: 'center' },
				body: { fontFace: 'Verdana', fontSize: 16, color: 'tx1', bold: false },
				other: { fontFace: null, fontSize: 12, color: 'accent3', italic: true },
			},
			objects: [
				{ text: { text: 'MASTER MARK', options: { x: 0.25, y: 0.15, w: 2.2, h: 0.25, fontSize: 8, color: 'accent2' } } },
				{ rect: { x: 0.2, y: 7.1, w: 1.1, h: 0.1, fill: { color: 'accent1' }, line: { color: 'accent1' } } },
				{ line: { x: 1.5, y: 7.15, w: 1.2, h: 0, line: { color: 'accent2', width: 1 } } },
			],
			placeholders: [{
				name: 'masterTitle', type: 'title', idx: 0, hasCustomPrompt: false, x: 0.8, y: 0.7, w: 11.7, h: 1.1,
				style: { preset: 'roundRect', fill: { type: 'solid', color: 'accent1', transparency: 22 }, line: { type: 'solid', color: 'accent2', width: 1.25 }, fontFace: 'Georgia', fontSize: 30, color: 'tx1', bold: true, align: 'center', valign: 'middle', styleRefs: { fill: { index: 2, color: 'accent1' }, line: { index: 1, color: 'accent2' }, effect: { index: 0, color: 'phClr' }, font: { role: 'major', color: 'tx1' } } },
			}],
		}],
		layouts: [{
			name: 'ContractLayout', width: 13.333333, height: 7.5, masterName: 'ContractMaster',
			colorMapOverride: { ...masterColorMap, accent1: 'accent3' },
			objects: [{ text: { text: 'LAYOUT MARK', options: { x: 10.5, y: 7.05, w: 2, h: 0.25, fontSize: 8, color: 'accent3' } } }],
			placeholders: [{ name: 'titleSlot', type: 'title', idx: 0, hasCustomPrompt: false, x: 1, y: 1, w: 11, h: 1, style: { fill: { type: 'solid', color: 'accent2', transparency: 35 }, line: { type: 'solid', color: 'accent4', width: 0.75 }, fontFace: null, fontSize: 28, color: 'accent1', bold: false, italic: true, align: 'left', valign: 'top' } }],
		}],
		layoutContract: { placeholderBindings: { title: { name: 'titleSlot', type: 'title', idx: 0 } } },
		slides: [
			{ id: 's1', title: 'Inherited', layoutIntent: 'title-only', layoutName: 'ContractLayout', masterName: 'ContractMaster', background: null, colorMapOverride: null, showMasterShapes: false, showMasterBackground: false, showMasterPhAnim: false, content: [{ kind: 'textBox', name: 'hero', role: 'title', text: 'INHERITED' }] },
			{ id: 's2', title: 'Style only', layoutIntent: 'title-only', layoutName: 'ContractLayout', masterName: 'ContractMaster', content: [{ kind: 'textBox', name: 'styledHero', role: 'title', text: 'STYLE ONLY', style: { fill: { color: 'accent5', transparency: 0 } } }] },
		],
		...overrides,
	}
}

test('contract freezes exactly the six canonical rows and the one-physical-master boundary', () => {
	assert.equal(LAYOUT_THEME_MASTER_INHERITANCE_UNIT_ID, 'impl-b-d35240484bb536ac')
	assert.equal(LAYOUT_THEME_MASTER_INHERITANCE_ROWS.length, 6)
	assert.equal(new Set(LAYOUT_THEME_MASTER_INHERITANCE_ROW_IDS).size, 6)
	assert.deepEqual(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.rowIds, LAYOUT_THEME_MASTER_INHERITANCE_ROW_IDS)
	assert.equal(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.runtimeReady, true)
	assert.match(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.scope, /one newly authored physical slide master/)
	assert.ok(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.componentOwnership.length >= 4)
	assert.ok(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.overrideFields.length >= 12)
	assert.ok(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.precedence.length >= 4)
	assert.ok(LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.legalCombinations.length >= 4)
	for (const row of LAYOUT_THEME_MASTER_INHERITANCE_ROWS) assert.equal(layoutThemeMasterInheritanceCapabilityContractForEntry(row), LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT)
	assert.equal(layoutThemeMasterInheritanceCapabilityContractForEntry({ id: 'cap_multiple_slide_masters' }), null)
})

test('public discovery keeps the six inheritance rows exact and exposes multiple masters through its separate exact contract', async () => {
	const { publicBaselineCatalog } = await import('../public-baseline-catalog.mjs')
	const entries = publicBaselineCatalog({ family: 'layouts-themes-masters', includePlanned: true, limit: 500 }).entries
	const byId = new Map(entries.map(entry => [entry.id, entry]))
	for (const row of LAYOUT_THEME_MASTER_INHERITANCE_ROWS) {
		const entry = byId.get(row.id)
		assert.ok(entry, `missing public row ${row.id}`)
		assert.equal(entry.capabilityMode, 'parameterized')
		assert.equal(entry.capabilityStatus, 'executable-exact-structured')
		assert.equal(entry.selection.executableValue, row.label)
		assert.equal(entry.selection.semanticPath, row.semanticPath)
		assert.ok(entry.componentOwnership.length >= 4)
		assert.ok(entry.overrideFields.length >= 12)
	}
	const multiple = entries.find(entry => String(entry.label).trim().toLowerCase() === 'multiple slide masters')
	assert.ok(multiple)
	assert.equal(multiple.capabilityStatus, 'executable-exact-structured')
})

test('deck schema accepts multiple masters while the narrow inheritance public schema retains its one-master boundary', () => {
	const valid = baseSpec()
	assert.equal(validateDeck(valid), true, JSON.stringify(validateDeck.errors))
	assert.equal(validatePublicContract({ theme: valid.theme, layouts: valid.layouts, masters: valid.masters, slideBinding: { layoutName: 'ContractLayout', masterName: 'ContractMaster', background: null, colorMapOverride: null, showMasterShapes: false, showMasterBackground: false, showMasterPhAnim: false } }), true, JSON.stringify(validatePublicContract.errors))
	for (const invalid of [
		baseSpec({ theme: { ...valid.theme, privateThemePart: 'ppt/theme/theme1.xml' } }),
		baseSpec({ layouts: [{ ...valid.layouts[0], sourcePart: 'ppt/slideLayouts/slideLayout1.xml' }] }),
	]) {
		assert.equal(validateDeck(invalid), false)
	}
	assert.equal(validateDeck(baseSpec({ masters: [...valid.masters, { title: 'SecondMaster' }] })), true, JSON.stringify(validateDeck.errors))
	assert.equal(validatePublicContract({ theme: valid.theme, layouts: valid.layouts, masters: [...valid.masters, { title: 'SecondMaster' }] }), false)
	assert.equal(validatePublicContract({ theme: valid.theme, layouts: [{ ...valid.layouts[0], sourcePart: 'ppt/slideLayouts/slideLayout1.xml' }], masters: valid.masters }), false)
	assert.equal(validatePublicContract({ theme: valid.theme, layouts: valid.layouts, masters: [{ ...valid.masters[0], objects: [{ chart: { type: 'bar' } }] }] }), false)
	assert.equal(validatePublicContract({ theme: valid.theme, layouts: [{ ...valid.layouts[0], objects: [{ rect: { x: 0, y: 0, w: 1, h: 1, privateNativeXml: '<p:sp/>' } }] }], masters: valid.masters }), false)
})

test('compiler orders structure then master then layouts and preserves null/empty lifecycle controls', () => {
	assert.throws(
		() => buildSpecOperationPlan(baseSpec({ slides: [{ ...baseSpec().slides[0], showMasterShapes: false, showMasterBackground: true }] }), { plan: 'premium' }),
		/showMasterShapes and showMasterBackground must agree/,
	)
	const create = buildSpecOperationPlan(baseSpec(), { plan: 'premium' })
	const tools = create.operations.map(operation => operation.tool)
	const structureIndex = tools.indexOf('betterpptx.deck.set_layout_theme_structure')
	const masterIndex = tools.indexOf('betterpptx.deck.define_master')
	const layoutIndex = tools.indexOf('betterpptx.deck.define_layout')
	assert.ok(structureIndex >= 0 && structureIndex < masterIndex && masterIndex < layoutIndex)
	const structure = create.operations[structureIndex].args
	assert.equal(structure.masters.length, 1)
	assert.equal(structure.layouts.length, 1)
	assert.equal(structure.theme.colorScheme.accent1, 'C026D3')
	assert.deepEqual(structure.masters[0].colorMap, masterColorMap)
	assert.equal(structure.masters[0].objects.length, 3)
	assert.equal(structure.masters[0].placeholders[0].style.styleRefs.font.role, 'major')
	assert.equal(structure.masters[0].textStyles.body.bold, false)
	assert.equal(structure.layouts[0].colorMapOverride.accent1, 'accent3')
	const inheritedTitle = create.operations.find(operation => operation.tool === 'betterpptx.slide.add_text' && operation.args.text === 'INHERITED')
	assert.equal(inheritedTitle.args.options._nativePlaceholderInheritance, true)
	assert.equal(inheritedTitle.args.options._omitTransform, true)
	assert.equal(inheritedTitle.args.options._emptySpPr, true)
	assert.equal(Object.hasOwn(inheritedTitle.args.options, 'x'), false)
	const styleOnlyTitle = create.operations.find(operation => operation.tool === 'betterpptx.slide.add_text' && operation.args.text === 'STYLE ONLY')
	assert.equal(styleOnlyTitle.args.options._nativePlaceholderInheritance, true)
	assert.equal(styleOnlyTitle.args.options._omitTransform, true)
	assert.equal(styleOnlyTitle.args.options._omitShapePrstGeom, true)
	assert.equal(Object.hasOwn(styleOnlyTitle.args.options, '_emptySpPr'), false)
	assert.equal(Object.hasOwn(create.operations.find(operation => operation.tool === 'betterpptx.slide.add').args, 'background'), true)
	assert.equal(create.operations.find(operation => operation.tool === 'betterpptx.slide.add').args.background, null)
	const firstSlideAdd = create.operations.find(operation => operation.tool === 'betterpptx.slide.add')
	assert.equal(firstSlideAdd.args.showMasterShapes, false)
	assert.equal(Object.hasOwn(firstSlideAdd.args, 'showMasterBackground'), false)
	assert.equal(firstSlideAdd.args.showMasterPhAnim, false)
	assert.equal(firstSlideAdd.args.colorMapOverride, null)
	const localReset = baseSpec()
	localReset.slides[1] = { ...localReset.slides[1], content: [{ ...localReset.slides[1].content[0], bbox: null, style: null }] }
	assert.equal(validateDeck(localReset), true, JSON.stringify(validateDeck.errors))
	const resetTitle = buildSpecOperationPlan(localReset, { plan: 'premium' }).operations.find(operation => operation.tool === 'betterpptx.slide.add_text' && operation.args.text === 'STYLE ONLY')
	assert.equal(resetTitle.args.options._nativePlaceholderInheritance, true)
	assert.equal(resetTitle.args.options._omitTransform, true)
	assert.equal(resetTitle.args.options._emptySpPr, true)
	assert.equal(Object.hasOwn(resetTitle.args.options, '_omitShapePrstGeom'), false)

	const reset = buildSpecOperationPlan(baseSpec({ theme: null, layouts: [], masters: [], slides: [] }), { plan: 'premium', patchMode: true })
	const resetStructure = reset.operations.find(operation => operation.tool === 'betterpptx.deck.set_layout_theme_structure')
	assert.deepEqual(resetStructure.args, { theme: null, layouts: [], masters: [] })
})
