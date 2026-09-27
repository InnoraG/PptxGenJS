import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'
import { createMcpToolDispatcher, getDeck } from '../engine.mjs'

const sourceTemplate = 'outputs/authoring-principle-corpus/global-extended-option-five-point/theme-master-layout-native/20260825T193206Z/theme-master-layout-native.pptx'
const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
delete schema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(schema)

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

test('template import materializes every authored slide-layout carrier', async () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Template layout import proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove template import', remember: 'every layout remains editable' },
		visualDesign: { world: 'blueprint', framing: 'template import' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		layouts: [{ name: 'EditorialWide', width: 13.333333, height: 7.5, placeholders: [{ name: 'heroTitle', type: 'title', idx: 0, x: 0.7, y: 0.55, w: 12, h: 0.8 }] }],
		masters: [{ title: 'Editorial Master', placeholders: [{ name: 'heroTitle', type: 'title', idx: 1, x: 0.7, y: 0.55, w: 12, h: 0.8 }] }],
		layoutContract: { allowedLayouts: ['EditorialWide', 'Editorial Master'], defaultLayout: 'EditorialWide', strictLayout: true },
		template: { path: sourceTemplate, preserveLayouts: true, enforceLayoutPolicy: false },
		slides: [{ id: 'template-slide', title: 'Template import', layoutIntent: 'title-only', layoutName: 'EditorialWide', masterName: 'Editorial Master', content: [{ kind: 'textBox', name: 'title', role: 'title', text: 'Every authored layout remains available.' }] }],
	}
	assert.equal(fs.existsSync(sourceTemplate), true)
	const dispatcher = createMcpToolDispatcher({ role: 'builder', transport: 'test' })
	const result = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false })
	assert.equal(result.ok, true, JSON.stringify(result.error || result))
	const deckId = result.data.deckId
	const entry = getDeck(deckId)
	const carriers = result.data.templateApplied.nativeTemplateLayouts
	assert.equal(result.data.templateApplied.nativeLayoutCount, 3)
	assert.equal(carriers.length, 3)
	assert.deepEqual(carriers.map(item => item.number), [1, 2, 3])
	assert.equal(result.data.templateApplied.nativeTemplateMasters.length, 1)
	assert.equal(result.data.templateApplied.nativeTemplateMasters[0].placeholderCount, 1)
	assert.equal(result.data.templateApplied.nativeTemplateMasters[0].slideNumber.type, 'sldNum')
	assert.equal(carriers[0].background.color, 'bg1')
	assert.equal(carriers[2].slideNumber.type, 'sldNum')
	assert.equal(result.data.templateApplied.templateRelationshipBindings[0].layoutNumber, 2)
	assert.equal(result.data.templateApplied.templateRelationshipBindings[0].relationshipId, 'rId1')
	assert.deepEqual(entry.pptx.slideLayouts.slice(0, carriers.length).map(layout => layout._name), carriers.map(item => item.name))
	assert.equal(entry.pptx.LAYOUTS.DEFAULT._templateBackground.color, 'bg1')
	assert.equal(entry.pptx.masterSlide._templateSlideNumber.type, 'sldNum')
	assert.equal(entry.pptx.slides[0]._rawSlideLayoutNumber, 2)
	assert.equal(entry.pptx.slides[0]._templateLayoutName, 'EditorialWide')
})

test('imported theme, master, layouts, and slide bindings export as closed relationship-independent semantic state', async () => {
	assert.equal(fs.existsSync(sourceTemplate), true)
	const dispatcher = createMcpToolDispatcher({ role: 'builder', transport: 'test' })
	const committed = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', {
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Imported inheritance projection proof',
			authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
			contentStory: { audience: 'presentation authors', outcome: 'project native inheritance', remember: 'semantic identities survive relationship renumbering' },
			visualDesign: { world: 'blueprint', framing: 'template import' },
			motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
			template: { path: sourceTemplate, preserveLayouts: true, enforceLayoutPolicy: false },
			slides: [{
				id: 'imported-slide', title: 'Imported semantic projection', layoutIntent: 'title-only', layoutName: 'EditorialWide',
				content: [{ kind: 'textBox', name: 'title', role: 'title', text: 'Imported identities remain portable.' }],
			}],
		},
		phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false,
	}))
	const exported = dataOf(await dispatcher.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' })).spec
	assert.equal(validateDeck(exported), true, JSON.stringify(validateDeck.errors))
	assert.equal(exported.masters.length, 1)
	assert.equal(exported.layouts.length, 3)
	assert.ok(exported.theme?.headFontFace)
	assert.ok(exported.theme?.bodyFontFace)
	assert.equal(exported.slides[0].layoutName, 'EditorialWide')
	assert.equal(exported.slides[0].masterName, exported.masters[0].title)
	assert.equal(exported.layouts.find(layout => layout.name === 'EditorialWide')?.masterName, exported.masters[0].title)
	const inheritanceJson = JSON.stringify({ theme: exported.theme, masters: exported.masters, layouts: exported.layouts, slides: exported.slides.map(slide => ({ layoutName: slide.layoutName, masterName: slide.masterName })) })
	for (const forbidden of ['sourcePart', 'relationshipId', 'sourceMasterPart', 'rId', 'slideMaster1.xml', 'slideLayout1.xml']) {
		assert.equal(inheritanceJson.includes(forbidden), false, `export leaked ${forbidden}`)
	}
	const replayed = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', {
		spec: exported, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false,
	}))
	assert.ok(replayed.deckId)
})
