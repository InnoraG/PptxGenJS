import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import { applyCatalogTruth } from '../capability-truth.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import {
	TEXT_AUTHORING_ENTRY_CONTRACT,
	TEXT_AUTHORING_ENTRY_ROWS,
	TEXT_AUTHORING_ENTRY_UNIT_ID,
	textAuthoringEntryCapabilityContractForEntry,
} from '../text-authoring-entry-contract.mjs'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)

function specWith(text) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Text entry contract',
		layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic',
			coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required',
		},
		contentStory: { audience: 'authors', outcome: 'Prove native editable text.', remember: 'Plain and rich text share one public entry.' },
		visualDesign: { world: 'editorial', framing: 'one text box', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
		slides: [{
			id: 'proof', title: 'Text entry', message: 'Native text', layoutIntent: 'title-body',
			content: [{ kind: 'textBox', name: 'copy', text, style: { fontFace: 'Aptos', fontSize: 18, fit: 'shrink' } }],
		}],
	}
}

test('unit freezes exactly the plain-text and rich-run public entry rows', () => {
	assert.equal(TEXT_AUTHORING_ENTRY_UNIT_ID, 'impl-b-26c13da769183d70')
	assert.equal(TEXT_AUTHORING_ENTRY_CONTRACT.unitId, TEXT_AUTHORING_ENTRY_UNIT_ID)
	assert.deepEqual(TEXT_AUTHORING_ENTRY_ROWS.map(row => row.id), [
		'cap_abea4eaf2ef3fb790ebc',
		'cap_cddc41dd90dd55952f32',
	])
	for (const row of TEXT_AUTHORING_ENTRY_ROWS) {
		const contract = textAuthoringEntryCapabilityContractForEntry(row)
		assert.equal(contract.runtimeReady, true)
		assert.equal(contract.capabilityStatus, 'executable-exact-structured')
		assert.ok(contract.overrideFields.includes('slides[].content[].text'))
	}
})

test('capability truth and public discovery expose exact executable selections', () => {
	for (const row of TEXT_AUTHORING_ENTRY_ROWS) {
		const truth = applyCatalogTruth({ ...row, family: 'layouts-themes-masters', sourceKind: 'capability-row' })
		assert.equal(truth.capabilityStatus, 'executable-exact-structured')
		assert.equal(truth.capabilityMode, 'parameterized')
	}
	const entries = publicBaselineCatalog({ family: 'layouts-themes-masters', limit: 500 }).entries
	for (const row of TEXT_AUTHORING_ENTRY_ROWS) {
		const entry = entries.find(item => item.id === row.id)
		assert.ok(entry, `missing public catalog row ${row.id}`)
		assert.equal(entry.capabilityStatus, 'executable-exact-structured')
		assert.equal(entry.selection.semanticPath, row.semanticPath)
		assert.equal(entry.selection.executableValue, row.executableValue)
	}
})

test('deck schema accepts plain strings and closed rich runs', () => {
	assert.equal(validateDeck(specWith('Plain Unicode text')), true, JSON.stringify(validateDeck.errors))
	const rich = specWith([
		{ text: 'First ', options: { bold: true, inline: true } },
		{ text: 'second', options: { italic: true, color: '336699', softBreakBefore: true } },
	])
	assert.equal(validateDeck(rich), true, JSON.stringify(validateDeck.errors))
	const invalid = structuredClone(rich)
	invalid.slides[0].content[0].text[0].options.privateXml = '<a:rPr/>'
	assert.equal(validateDeck(invalid), false)
})

test('compiler lowers plain and rich text through one native add_text path with textual accessibility', () => {
	const plain = buildSpecOperationPlan(specWith('Plain Unicode text'), { plan: 'premium' })
	const rich = buildSpecOperationPlan(specWith([
		{ text: 'First ', options: { bold: true, inline: true } },
		{ text: 'second', options: { italic: true, color: '336699', softBreakBefore: true } },
	]), { plan: 'premium' })
	for (const compiled of [plain, rich]) assert.deepEqual(compiled.errors, [])
	const plainOp = plain.operations.find(item => item.tool === 'betterpptx.slide.add_text' && item.objectName.includes('copy'))
	const richOp = rich.operations.find(item => item.tool === 'betterpptx.slide.add_text' && item.objectName.includes('copy'))
	assert.equal(plainOp.args.text, 'Plain Unicode text')
	assert.ok(Array.isArray(richOp.args.text))
	assert.equal(richOp.args.text[0].options.bold, true)
	assert.equal(richOp.args.text[1].options.softBreakBefore, true)
	assert.equal(typeof richOp.args.options.altText, 'string')
	assert.equal(richOp.args.options.altText, 'First second')
})
