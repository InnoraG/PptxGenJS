#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTHORING_LAYOUT_INTENTS, AUTHORING_LAYOUT_INTENT_ALIASES } from './ir/layout-engine.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.join(__dirname, 'ir', 'deck-spec.v1.json')
const examplesDir = path.join(__dirname, 'ir', 'examples')
const policyPath = path.join(__dirname, 'ir', 'versioning-policy.md')
const SCHEMA_VERSION = 'betterpptx.deck-spec.v1'

function assertLayoutVocabularyParity(schema) {
	const schemaValues = new Set(schema?.$defs?.slide?.properties?.layoutIntent?.enum || [])
	const expected = new Set([...AUTHORING_LAYOUT_INTENTS, ...Object.keys(AUTHORING_LAYOUT_INTENT_ALIASES)])
	const missing = [...expected].filter(value => !schemaValues.has(value))
	const extra = [...schemaValues].filter(value => !expected.has(value))
	if (missing.length || extra.length) fail('Deck-spec layoutIntent vocabulary drifted from the live Director vocabulary.', { missing, extra, expected: [...expected], schema: [...schemaValues] })
}

function fail(message, detail = {}) {
	console.error('DECK SPEC V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function warn(code, message, at) {
	return { code, message, at }
}

function isObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value)
}

function stableHandle(deckId, slideId, objectName, schemaVersion = SCHEMA_VERSION) {
	return crypto.createHash('sha256').update(`${deckId}|${slideId}|${objectName}|${schemaVersion}`).digest('hex').slice(0, 20)
}

function generatedNames(spec) {
	const warnings = []
	const names = []
	for (const slide of spec.slides || []) {
		for (const block of slide.content || []) {
			const blockName = block.name || `block.${slide.content.indexOf(block) + 1}`
			if (!block.name) warnings.push(warn('UNSTABLE_HANDLE', 'Block is missing a stable name.', `${slide.id}.content`))
			const blockObjectName = `${slide.id}.${blockName}.${block.kind}`
			names.push({
				slideId: slide.id,
				objectName: blockObjectName,
				editHandle: stableHandle('verify-deck', slide.id, blockObjectName)
			})
			const items = Array.isArray(block.items) ? block.items : []
			for (let index = 0; index < items.length; index += 1) {
				const item = items[index]
				const itemName = item.name || String(index + 1)
				if (!item.name) warnings.push(warn('UNSTABLE_HANDLE', 'List item is missing a stable name.', `${slide.id}.${blockName}.items[${index}]`))
				const objectName = `${slide.id}.${blockName}.item.${itemName}`
				names.push({
					slideId: slide.id,
					objectName,
					editHandle: stableHandle('verify-deck', slide.id, objectName)
				})
			}
		}
	}
	return { names, warnings }
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value))
}

function extractUnknownTopLevelFields(schema, spec) {
	const known = new Set(Object.keys(schema.properties || {}))
	return Object.keys(spec).filter(key => !known.has(key))
}

function validateExample(schema, spec, fileName) {
	const layoutIntents = new Set(schema.$defs.slide.properties.layoutIntent.enum)
	const blockKinds = new Set(schema.$defs.contentBlock.properties.kind.enum)
	const errors = []
	const warnings = []
	const slideIds = new Set()
	const assetNames = new Set((spec.assets || []).map(asset => asset.name))
	const dataNames = new Set((spec.data || []).map(data => data.name))
	const topUnknown = extractUnknownTopLevelFields(schema, spec)
	for (const field of topUnknown) warnings.push(warn('UNKNOWN_FIELD', 'Unknown top-level field is accepted in v1 but should be surfaced to clients.', field))

	if (!isObject(spec)) errors.push('Spec must be an object.')
	if (spec.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}.`)
	if (!spec.title || typeof spec.title !== 'string') errors.push('title must be a non-empty string.')
	if (!Array.isArray(spec.slides) || !spec.slides.length) errors.push('slides must be a non-empty array.')
	if (!Array.isArray(spec.sections)) errors.push('sections must be present as an array.')
	if (!Array.isArray(spec.assets)) errors.push('assets must be present as an array.')
	if (!Array.isArray(spec.data)) errors.push('data must be present as an array.')
	if (!isObject(spec.validation)) errors.push('validation must be present as an object.')
	if (!isObject(spec.authoringContract)) errors.push('authoringContract must be present as an object.')
	if (spec.authoringContract && spec.authoringContract.textPolicy && !/textShape/i.test(String(spec.authoringContract.textPolicy))) {
		errors.push('authoringContract.textPolicy must teach textBox/textShape vs geometry-only shape.')
	}

	for (const asset of spec.assets || []) {
		if (!asset.name) errors.push(`${fileName}: asset is missing name.`)
		if (asset.handle && /(C:\\|\/Users\/|\/tmp\/|node_modules|\.mjs|\.ts|git|repo|pid|cwd)/i.test(String(asset.handle))) {
			errors.push(`${fileName}: asset handle leaks implementation detail: ${asset.name}`)
		}
	}

	for (const data of spec.data || []) {
		if (!data.name) errors.push(`${fileName}: data source is missing name.`)
		if (!data.provenance || data.verified !== true) warnings.push(warn('UNVERIFIED_DATA', 'Data source is missing provenance or verified=true.', `data.${data.name || '?'}`))
		for (const series of data.series || []) {
			if (!series.name) errors.push(`${fileName}: data series is missing stable name.`)
		}
	}

	for (const section of spec.sections || []) {
		for (const slideId of section.slideIds || []) {
			if (!spec.slides.some(slide => slide.id === slideId)) errors.push(`${fileName}: section ${section.id} references missing slide ${slideId}.`)
		}
	}

	for (const slide of spec.slides || []) {
		if (!slide.id) errors.push(`${fileName}: slide is missing id.`)
		if (slideIds.has(slide.id)) errors.push(`${fileName}: duplicate slide id ${slide.id}.`)
		slideIds.add(slide.id)
		if (!/^[A-Za-z0-9._:-]+$/.test(String(slide.id || ''))) errors.push(`${fileName}: invalid slide id ${slide.id}.`)
		if (!slide.title) errors.push(`${fileName}: slide ${slide.id} is missing title.`)
		if (!layoutIntents.has(slide.layoutIntent)) errors.push(`${fileName}: slide ${slide.id} uses unknown layoutIntent ${slide.layoutIntent}.`)
		if (!Array.isArray(slide.content)) errors.push(`${fileName}: slide ${slide.id} content must be an array.`)
		const blockNames = new Set()
		for (const block of slide.content || []) {
			if (!blockKinds.has(block.kind)) errors.push(`${fileName}: slide ${slide.id} has unknown block kind ${block.kind}.`)
			if (!block.name) errors.push(`${fileName}: slide ${slide.id} block ${block.kind} is missing stable name.`)
			if (block.kind === 'shape' && String(block.text || '').trim()) {
				errors.push(`${fileName}: slide ${slide.id} block ${block.name} uses shape text; use textShape or textBox.`)
			}
			if (blockNames.has(block.name)) errors.push(`${fileName}: slide ${slide.id} duplicate block name ${block.name}.`)
			blockNames.add(block.name)
			if (block.dataRef && !dataNames.has(block.dataRef)) errors.push(`${fileName}: slide ${slide.id} block ${block.name} references missing data ${block.dataRef}.`)
			if (block.assetRef && !assetNames.has(block.assetRef)) errors.push(`${fileName}: slide ${slide.id} block ${block.name} references missing asset ${block.assetRef}.`)
			const dataBearing = block.dataRef || block.dataSource || ['chart-panel', 'table-panel'].includes(block.kind)
			if (dataBearing && (!block.provenance || block.verified !== true)) {
				warnings.push(warn('UNVERIFIED_DATA', 'Data-bearing block is missing provenance or verified=true.', `${slide.id}.${block.name}`))
			}
			const itemNames = new Set()
			for (const [index, item] of (block.items || []).entries()) {
				if (!item.name) errors.push(`${fileName}: slide ${slide.id} block ${block.name} item ${index + 1} is missing stable name.`)
				if (itemNames.has(item.name)) errors.push(`${fileName}: slide ${slide.id} block ${block.name} duplicate item name ${item.name}.`)
				itemNames.add(item.name)
				if ((item.value !== undefined || item.trend !== undefined || item.dataSource) && (!item.provenance || item.verified !== true)) {
					warnings.push(warn('UNVERIFIED_DATA', 'Data-bearing list item is missing provenance or verified=true.', `${slide.id}.${block.name}.${item.name || index}`))
				}
			}
		}
	}

	return { errors, warnings }
}

function assertHandleChurnStable(spec, fileName) {
	const targetSlide = spec.slides.find(slide => (slide.content || []).some(block => Array.isArray(block.items) && block.items.length >= 2))
	if (!targetSlide) return
	const targetBlock = targetSlide.content.find(block => Array.isArray(block.items) && block.items.length >= 2)
	const before = new Map(generatedNames(spec).names.map(item => [item.objectName, item.editHandle]))
	const mutated = cloneJson(spec)
	const mutatedSlide = mutated.slides.find(slide => slide.id === targetSlide.id)
	const mutatedBlock = mutatedSlide.content.find(block => block.name === targetBlock.name)
	mutatedBlock.items.splice(1, 0, {
		name: 'inserted-verifier-item',
		text: 'Verifier inserted named sibling.',
		provenance: 'Verifier synthetic input',
		verified: true
	})
	const after = new Map(generatedNames(mutated).names.map(item => [item.objectName, item.editHandle]))
	for (const item of targetBlock.items) {
		const objectName = `${targetSlide.id}.${targetBlock.name}.item.${item.name}`
		if (before.get(objectName) !== after.get(objectName)) {
			fail('Named sibling handle changed after inserting another named sibling.', { fileName, objectName })
		}
	}
}

async function main() {
	const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'))
	assertLayoutVocabularyParity(schema)
	if (schema.$id !== 'https://betterpptx.example/schemas/deck-spec.v1.json') fail('Unexpected schema id.', { id: schema.$id })
	if (schema.properties.schemaVersion.const !== SCHEMA_VERSION) fail('Unexpected schemaVersion const.', { schemaVersion: schema.properties.schemaVersion.const })
	if (schema.additionalProperties !== true) fail('Schema must allow additive v1 unknown fields.')
	if (!schema.properties.authoringContract) fail('Schema is missing authoringContract.')
	const presenterStageTreatment = schema.properties.presenter?.properties?.stageTreatment
	if (presenterStageTreatment?.enum?.join(',') !== 'none,floor-ellipse' || presenterStageTreatment?.default !== 'none') {
		fail('Schema presenter.stageTreatment vocabulary drifted from the public unranked contract.', { presenterStageTreatment })
	}
	const blockKinds = schema.$defs.contentBlock.properties.kind.enum
	for (const requiredKind of ['textBox', 'textShape', 'shape', 'media', 'ink', 'laser', 'narration', 'customGeometry']) {
		if (!blockKinds.includes(requiredKind)) fail('Schema is missing required object kind.', { requiredKind, blockKinds })
	}

	const policy = await fs.readFile(policyPath, 'utf8')
	for (const required of ['UNSTABLE_HANDLE', 'UNVERIFIED_DATA', 'SHAPE_TEXT_FORBIDDEN', 'capability matrix', 'additive only', 'opaque handles']) {
		if (!policy.includes(required)) fail('Versioning policy is missing required text.', { required })
	}

	const files = (await fs.readdir(examplesDir)).filter(name => name.endsWith('.v1.json')).sort()
	const expected = new Set(['creation-executive.v1.json', 'editing-existing.v1.json', 'reference-recreation.v1.json', 'template-use.v1.json'])
	for (const name of expected) if (!files.includes(name)) fail('Missing golden example.', { name })

	let warningCount = 0
	for (const fileName of files) {
		const spec = JSON.parse(await fs.readFile(path.join(examplesDir, fileName), 'utf8'))
		const { errors, warnings } = validateExample(schema, spec, fileName)
		if (errors.length) fail('Golden example validation failed.', { fileName, errors, warnings })
		warningCount += warnings.length
		assertHandleChurnStable(spec, fileName)
	}

	const unknownFieldSpec = JSON.parse(await fs.readFile(path.join(examplesDir, 'creation-executive.v1.json'), 'utf8'))
	unknownFieldSpec.futureCompilerHint = { acceptedInV1: true }
	const unknownFieldResult = validateExample(schema, unknownFieldSpec, 'synthetic-unknown-field')
	if (!unknownFieldResult.warnings.some(item => item.code === 'UNKNOWN_FIELD')) fail('Unknown field behavior did not produce a warning.')

	const unstable = cloneJson(unknownFieldSpec)
	delete unstable.slides[1].content[1].items[1].name
	const unstableWarnings = generatedNames(unstable).warnings
	if (!unstableWarnings.some(item => item.code === 'UNSTABLE_HANDLE')) fail('Missing-name synthetic fixture did not produce UNSTABLE_HANDLE.')

	const unverified = cloneJson(unknownFieldSpec)
	delete unverified.data[0].provenance
	unverified.data[0].verified = false
	const unverifiedResult = validateExample(schema, unverified, 'synthetic-unverified-data')
	if (!unverifiedResult.warnings.some(item => item.code === 'UNVERIFIED_DATA')) fail('Missing-provenance synthetic fixture did not produce UNVERIFIED_DATA.')

	console.log('DECK SPEC V1 VERIFY: PASS')
	console.log(JSON.stringify({
		schemaVersion: SCHEMA_VERSION,
		examples: files.length,
		goldenWarnings: warningCount,
		stabilityFixture: 'passed',
		unknownFieldFixture: 'warned',
		unverifiedDataFixture: 'warned'
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
