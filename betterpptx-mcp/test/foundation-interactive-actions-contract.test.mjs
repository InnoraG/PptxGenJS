import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import {
	ACTION_BUTTON_SHAPE_NAMES,
	INTERACTIVE_ACTIONS_CONTRACT,
	INTERACTIVE_ACTIONS_LIFECYCLE,
	INTERACTIVE_ACTION_ROWS,
	INTERACTIVE_ACTION_ROW_IDS,
	normalizeCustomShows,
	normalizeInteractiveActions,
	powerpointActionUri,
} from '../interactive-actions-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)

function baseSpec(overrides = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Interactive actions contract',
		layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [
			{ id: 's1', title: 'Actions', layoutIntent: 'title-only', content: [] },
			{ id: 's2', title: 'Target', layoutIntent: 'title-only', content: [] },
		],
		...overrides,
	}
}

test('the generated unit is partitioned into its exact eight rows and reuses the twelve native action-button geometries', () => {
	assert.equal(INTERACTIVE_ACTION_ROWS.length, 8)
	assert.equal(new Set(INTERACTIVE_ACTION_ROW_IDS).size, 8)
	assert.deepEqual(INTERACTIVE_ACTIONS_CONTRACT.rowIds, INTERACTIVE_ACTION_ROW_IDS)
	assert.equal(ACTION_BUTTON_SHAPE_NAMES.length, 12)
	assert.equal(new Set(ACTION_BUTTON_SHAPE_NAMES).size, 12)
	assert.ok(ACTION_BUTTON_SHAPE_NAMES.every(name => name.startsWith('actionButton')))
	assert.equal(INTERACTIVE_ACTIONS_CONTRACT.runtimeReady, true)
	assert.equal(INTERACTIVE_ACTIONS_CONTRACT.capabilityMode, 'parameterized')
	assert.equal(INTERACTIVE_ACTIONS_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(INTERACTIVE_ACTIONS_CONTRACT.publicSchema.additionalProperties, false)
	assert.equal(INTERACTIVE_ACTIONS_LIFECYCLE.action.null, 'clear both click and hover action settings')
})

test('deck schema accepts the closed action/custom-show vocabulary and rejects unsafe variants', () => {
	const valid = baseSpec({
		customShows: [{ name: 'Details', id: 7, slides: ['s2', 's1'] }],
		slides: [
			{
				id: 's1', title: 'Actions', layoutIntent: 'title-only', content: [{
					kind: 'shape', name: 'go', shapeName: 'actionButtonHome', text: 'Go',
					action: {
						click: { type: 'customShow', customShow: 'Details', showAndReturn: true, tooltip: 'Open details' },
						hover: { type: 'url', url: 'https://example.test/actions', sound: { source: 'asset://sounds/hover.wav', format: 'wav', name: 'Hover' } },
					},
				}],
			},
			{ id: 's2', title: 'Target', layoutIntent: 'title-only', content: [] },
		],
	})
	assert.equal(validateDeck(valid), true, JSON.stringify(validateDeck.errors))
	assert.equal(validateDeck(baseSpec({ customShows: null })), true, JSON.stringify(validateDeck.errors))

	const unsafeAction = structuredClone(valid)
	unsafeAction.slides[0].content[0].action.hover.url = 'ppaction://program'
	assert.equal(validateDeck(unsafeAction), false)
	const unsafeSound = structuredClone(valid)
	unsafeSound.slides[0].content[0].action.hover.sound.format = 'mp3'
	assert.equal(validateDeck(unsafeSound), false)
	const unsafeReturn = structuredClone(valid)
	unsafeReturn.slides[0].content[0].action.click.showAndReturn = false
	assert.equal(validateDeck(unsafeReturn), false)
	const unknown = structuredClone(valid)
	unknown.slides[0].content[0].action.click.rawAction = 'ppaction://macro?name=Unsafe'
	assert.equal(validateDeck(unknown), false)
})

test('custom shows get deterministic unsigned ids and retain ordered semantic slide ids', () => {
	const shows = normalizeCustomShows([
		{ name: 'Auto zero', slides: ['s2', 's1'] },
		{ name: 'Explicit', id: 4, slides: ['s1'] },
		{ name: 'Auto one', slides: ['s2'] },
	], [{ id: 's1' }, { id: 's2' }])
	assert.deepEqual(shows, [
		{ name: 'Auto zero', id: 0, slides: ['s2', 's1'] },
		{ name: 'Explicit', id: 4, slides: ['s1'] },
		{ name: 'Auto one', id: 1, slides: ['s2'] },
	])
	assert.throws(() => normalizeCustomShows([{ name: 'A', slides: ['missing'] }], [{ id: 's1' }]), /same spec/)
	assert.throws(() => normalizeCustomShows([{ name: 'A', slides: ['s1'] }, { name: 'a', slides: ['s1'] }], [{ id: 's1' }]), /unique.*case-insensitive/)
})

test('normalization resolves exact targets and emits only the finite safe PowerPoint action URI set', () => {
	const context = {
		slides: [{ id: 's1' }, { id: 's2' }],
		customShows: [{ name: 'Details', id: 9, slides: ['s2'] }],
	}
	const actions = normalizeInteractiveActions({
		click: { type: 'customShow', customShow: 'details', showAndReturn: true },
		hover: { type: 'slide', targetSlideId: 's2', endSound: false },
	}, context)
	assert.deepEqual(actions, {
		click: { type: 'customShow', customShow: 'Details', customShowId: 9, showAndReturn: true },
		hover: { type: 'slide', targetSlideId: 's2', targetSlide: 2, endSound: false },
	})
	assert.equal(powerpointActionUri(actions.click), 'ppaction://customshow?id=9&return=true')
	assert.equal(powerpointActionUri(actions.hover), 'ppaction://hlinksldjump')
	for (const [jump, uri] of [
		['firstSlide', 'ppaction://hlinkshowjump?jump=firstslide'],
		['lastSlide', 'ppaction://hlinkshowjump?jump=lastslide'],
		['lastSlideViewed', 'ppaction://hlinkshowjump?jump=lastslideviewed'],
		['nextSlide', 'ppaction://hlinkshowjump?jump=nextslide'],
		['previousSlide', 'ppaction://hlinkshowjump?jump=previousslide'],
	]) assert.equal(powerpointActionUri({ type: 'jump', jump }), uri)
	assert.equal(powerpointActionUri({ type: 'endShow' }), 'ppaction://hlinkshowjump?jump=endshow')
	assert.equal(powerpointActionUri({ type: 'none', sound: { source: 'tone.wav', format: 'wav' } }), 'ppaction://noaction')
	assert.throws(() => normalizeInteractiveActions({ type: 'url', url: 'ppaction://program' }, context), /https, mailto, or tel/)
	assert.throws(() => normalizeInteractiveActions({ type: 'customShow', customShow: 'Details', showAndReturn: false }, context), /showAndReturn must be true/)
	assert.throws(() => normalizeInteractiveActions({ type: 'none' }, context), /requires sound or endSound/)
})

test('compiler preserves independent click/hover actions, custom-show topology, reset state, and action-button geometry', () => {
	const spec = baseSpec({
		customShows: [{ name: 'Details', slides: ['s2', 's1'] }],
		slides: [
			{
				id: 's1', title: 'Actions', layoutIntent: 'title-only', content: [
					{
						kind: 'shape', name: 'button', shapeName: 'actionButtonHome', text: 'Details',
						action: {
							click: { type: 'customShow', customShow: 'Details', showAndReturn: true },
							hover: { type: 'url', url: 'https://example.test', sound: { source: 'asset://tone.wav', format: 'wav' } },
						},
					},
					{ kind: 'textBox', name: 'reset', text: 'Reset', action: null },
				],
			},
			{ id: 's2', title: 'Target', layoutIntent: 'title-only', content: [] },
		],
	})
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	const customShows = plan.operations.find(operation => operation.tool === 'betterpptx.deck.set_custom_shows')
	assert.deepEqual(customShows.args.customShows, [{ name: 'Details', id: 0, slides: ['s2', 's1'], slideIndexes: [1, 0] }])
	const button = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_shape' && operation.objectName.includes('.button.'))
	assert.equal(button.args.shapeName, 'actionButtonHome')
	assert.deepEqual(button.args.options.interactiveActions, {
		click: { type: 'customShow', customShow: 'Details', customShowId: 0, showAndReturn: true },
		hover: { type: 'url', url: 'https://example.test', sound: { source: 'asset://tone.wav', format: 'wav' } },
	})
	const reset = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_text' && operation.objectName.includes('.reset.'))
	assert.equal(reset.args.options.interactiveActions, null)

	const clearPlan = buildSpecOperationPlan(baseSpec({ customShows: null }), { dryRun: true, plan: 'premium' })
	assert.deepEqual(clearPlan.operations.find(operation => operation.tool === 'betterpptx.deck.set_custom_shows').args, { customShows: null })
})

test('compiler fails closed when a public action targets media playback or unresolved topology', () => {
	const mediaSource = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
	assert.throws(() => buildSpecOperationPlan(baseSpec({
		slides: [{
			id: 's1', title: 'Media', layoutIntent: 'title-only', content: [{
				kind: 'media', name: 'media', mediaOptions: { type: 'audio', source: mediaSource, extn: 'wav' },
				action: { type: 'endShow' },
			}],
		}, { id: 's2', title: 'Target', layoutIntent: 'title-only', content: [] }],
	}), { dryRun: true, plan: 'premium' }), /cannot be combined with media playback/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({
		slides: [{ id: 's1', title: 'Missing show', layoutIntent: 'title-only', content: [{ kind: 'shape', name: 'go', action: { type: 'customShow', customShow: 'Missing', showAndReturn: true } }] }],
	}), { dryRun: true, plan: 'premium' }), /same spec's customShows array/)
})
