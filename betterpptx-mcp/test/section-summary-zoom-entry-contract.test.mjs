import assert from 'node:assert/strict'
import test from 'node:test'

import {
	PRESENTATION_SECTION_SCHEMA,
	SECTION_SUMMARY_ZOOM_ROWS,
	SECTION_ZOOM_SCHEMA,
	SUMMARY_ZOOM_SCHEMA,
	normalizeSectionSummaryZoomSpec,
	sectionSummaryZoomCapabilityContractForEntry,
} from '../section-summary-zoom-entry-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

function baseSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Section and Summary Zoom contract proof',
		layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'single' },
		sections: [
			{ id: 'navigation', title: 'Navigation', slideIds: ['host'] },
			{ id: 'details', title: 'Details', slideIds: ['details-1'] },
		],
		slides: [
			{ id: 'host', title: 'Host', layoutIntent: 'title-only', content: [], sectionZoom: { name: 'section-zoom', targetSectionId: 'details', transitionDur: 0 } },
			{ id: 'details-1', title: 'Details', layoutIntent: 'title-only', content: [] },
		],
		summaryZoom: { name: 'summary-zoom', sectionIds: ['details', 'navigation'], transitionDur: 0 },
	}
}

test('Section and Summary Zoom rows expose separate exact closed contracts', () => {
	assert.deepEqual(SECTION_SUMMARY_ZOOM_ROWS.map(row => row.id), ['cap_5adc3514c23e1839a324', 'cap_8955ad9479da6e1f4185'])
	for (const row of SECTION_SUMMARY_ZOOM_ROWS) {
		const contract = sectionSummaryZoomCapabilityContractForEntry(row)
		assert.equal(contract.runtimeReady, true)
		assert.equal(contract.capabilityStatus, 'executable-exact-structured')
		assert.equal(contract.publicSchema.additionalProperties, false)
	}
	assert.equal(PRESENTATION_SECTION_SCHEMA.additionalProperties, false)
	assert.equal(SECTION_ZOOM_SCHEMA.properties.patch.additionalProperties, false)
	assert.equal(SUMMARY_ZOOM_SCHEMA.properties.patch.additionalProperties, false)
})

test('public catalog exposes both Zoom rows as exact executable semantic selectors', () => {
	const byId = new Map(publicBaselineCatalog({ family: 'foundation', includePlanned: true, limit: 500 }).entries.map(entry => [entry.id, entry]))
	for (const row of SECTION_SUMMARY_ZOOM_ROWS) {
		const entry = byId.get(row.id)
		assert.equal(entry.capabilityStatus, 'executable-exact-structured')
		assert.equal(entry.selection.semanticKind, row.semanticKind)
		assert.equal(entry.selection.executableValue, row.executableValue)
	}
})

test('normalizer requires durable unique section and Zoom targets while preserving zero', () => {
	const normalized = normalizeSectionSummaryZoomSpec(baseSpec())
	assert.equal(normalized.slides[0].sectionZoom.targetSectionId, 'details')
	assert.equal(normalized.slides[0].sectionZoom.transitionDur, 0)
	assert.deepEqual(normalized.summaryZoom.sectionIds, ['details', 'navigation'])
	assert.equal(normalized.summaryZoom.transitionDur, 0)
	const duplicate = baseSpec()
	duplicate.sections[1].id = 'navigation'
	assert.throws(() => normalizeSectionSummaryZoomSpec(duplicate), /duplicate section id/)
	const missing = baseSpec()
	missing.slides[0].sectionZoom.targetSectionId = 'missing'
	assert.throws(() => normalizeSectionSummaryZoomSpec(missing), /existing semantic section/)
	const missingSummary = baseSpec()
	missingSummary.summaryZoom.sectionIds = ['missing']
	assert.throws(() => normalizeSectionSummaryZoomSpec(missingSummary), /missing semantic section/)
})

test('legacy enabled flags remain typed and preserve missing-target diagnostics', () => {
	const spec = baseSpec()
	spec.slides[0].sectionZoom = { name: 'section-zoom', enabled: true }
	const normalized = normalizeSectionSummaryZoomSpec(spec)
	assert.equal(normalized.slides[0].sectionZoom.enabled, true)
	assert.throws(() => normalizeSectionSummaryZoomSpec({ ...spec, slides: [{ ...spec.slides[0], sectionZoom: { name: 'section-zoom', enabled: 'yes' } }, spec.slides[1]] }), /enabled must be a boolean/)
	const disabled = normalizeSectionSummaryZoomSpec({ ...baseSpec(), summaryZoom: { name: 'summary-zoom', enabled: false } })
	assert.equal(disabled.summaryZoom.enabled, false)
})

test('compiler resolves semantic section ids to native indexes without leaking title selectors', () => {
	const plan = buildSpecOperationPlan(baseSpec(), { dryRun: true, plan: 'premium' })
	const section = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_section_zoom')
	assert.equal(section.args.options.targetSection, 2)
	assert.equal(section.args.options.targetSectionId, 'details')
	assert.equal(section.args.options.transitionDur, 0)
	const summary = plan.operations.find(operation => operation.tool === 'betterpptx.deck.add_summary_zoom')
	assert.deepEqual(summary.args.options.sections, [2, 1])
	assert.deepEqual(summary.args.options.sectionIds, ['details', 'navigation'])
	assert.equal(summary.args.options.transitionDur, 0)
})

test('sparse patches defer live section existence to the engine and emit no create operations', () => {
	const spec = baseSpec()
	delete spec.sections
	spec.slides = [{ id: 'host', title: 'Host', layoutIntent: 'title-only', content: [], sectionZoom: { name: 'section-zoom', patch: { targetSectionId: 'outside-sparse-spec', transitionDur: null, thumbnailDataUri: null, bbox: null } } }]
	spec.summaryZoom = { name: 'summary-zoom', patch: { sectionIds: ['outside-sparse-spec'], transitionDur: null, thumbnailDataUri: null } }
	const normalized = normalizeSectionSummaryZoomSpec(spec, { patchMode: true })
	assert.equal(normalized.slides[0].sectionZoom.patch.targetSectionId, 'outside-sparse-spec')
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium', patchMode: true })
	assert.equal(plan.operations.some(operation => operation.tool === 'betterpptx.slide.add_section_zoom'), false)
	assert.equal(plan.operations.some(operation => operation.tool === 'betterpptx.deck.add_summary_zoom'), false)
})
