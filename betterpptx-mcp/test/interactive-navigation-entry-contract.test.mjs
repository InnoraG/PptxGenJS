import assert from 'node:assert/strict'
import test from 'node:test'

import {
	INTERACTIVE_NAVIGATION_ROWS,
	SLIDE_ZOOM_BLOCK_SCHEMA,
	interactiveNavigationCapabilityContractForEntry,
	normalizeSlideZoomBlock,
} from '../interactive-navigation-entry-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

function baseSpec(content = []) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Slide navigation entry proof',
		layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'single' },
		slides: [
			{ id: 'host', title: 'Host', layoutIntent: 'title-only', content },
			{ id: 'target', title: 'Target', layoutIntent: 'title-only', content: [] },
		],
	}
}

test('slide zoom and ordinary jump expose two exact, non-aliased public contracts', () => {
	assert.deepEqual(INTERACTIVE_NAVIGATION_ROWS.map(row => row.id), [
		'cap_3cbed884e2e57a42232c',
		'cap_f4961a44a304c4d91694',
	])
	const zoom = interactiveNavigationCapabilityContractForEntry(INTERACTIVE_NAVIGATION_ROWS[0])
	const jump = interactiveNavigationCapabilityContractForEntry(INTERACTIVE_NAVIGATION_ROWS[1])
	for (const contract of [zoom, jump]) {
		assert.equal(contract.runtimeReady, true)
		assert.equal(contract.capabilityStatus, 'executable-exact-structured')
		assert.equal(contract.publicSchema.additionalProperties, false)
	}
	assert.notEqual(INTERACTIVE_NAVIGATION_ROWS[0].semanticPath, INTERACTIVE_NAVIGATION_ROWS[1].semanticPath)
	assert.equal(SLIDE_ZOOM_BLOCK_SCHEMA.properties.patch.additionalProperties, false)
})

test('full creation resolves an exact semantic target while sparse patches defer live-deck existence checks', () => {
	const slides = baseSpec().slides
	assert.deepEqual(
		normalizeSlideZoomBlock({ kind: 'slideZoom', name: 'zoom', targetSlideId: 'target', returnToParent: false, transitionDur: 0 }, { slides, sourceSlideId: 'host' }),
		{ kind: 'slideZoom', name: 'zoom', targetSlideId: 'target', returnToParent: false, transitionDur: 0 },
	)
	assert.deepEqual(
		normalizeSlideZoomBlock({ kind: 'slideZoom', name: 'zoom', patch: { targetSlideId: 'outside-sparse-spec', bbox: null, thumbnailDataUri: null } }, { slides: [{ id: 'host' }], sourceSlideId: 'host' }),
		{ kind: 'slideZoom', name: 'zoom', patch: { targetSlideId: 'outside-sparse-spec', bbox: null, thumbnailDataUri: null } },
	)
	assert.throws(() => normalizeSlideZoomBlock({ kind: 'slideZoom', name: 'zoom' }, { slides, sourceSlideId: 'host' }), /required when creating/)
	assert.throws(() => normalizeSlideZoomBlock({ kind: 'slideZoom', name: 'zoom', targetSlideId: 'missing' }, { slides, sourceSlideId: 'host' }), /existing semantic slide/)
	assert.throws(() => normalizeSlideZoomBlock({ kind: 'slideZoom', name: 'zoom', patch: { targetSlideId: null } }, { slides, sourceSlideId: 'host' }), /cannot be reset/)
	assert.throws(() => normalizeSlideZoomBlock({ kind: 'slideZoom', name: 'zoom', patch: { bbox: null, rect: null } }, { slides, sourceSlideId: 'host' }), /both bbox and rect/)
})

test('compiler lowers native Slide Zoom independently from the ordinary jump action carrier', () => {
	const plan = buildSpecOperationPlan(baseSpec([
		{ kind: 'textShape', name: 'jump', text: 'Jump', action: { click: { type: 'slide', targetSlideId: 'target' } } },
		{ kind: 'slideZoom', name: 'zoom', targetSlideId: 'target', returnToParent: false, transitionDur: 0 },
	]), { dryRun: true, plan: 'premium' })
	const zoom = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_zoom')
	assert.equal(zoom.args.options.targetSlide, 2)
	assert.equal(zoom.args.options.targetSlideId, 'target')
	assert.equal(zoom.args.options.returnToParent, false)
	assert.equal(zoom.args.options.transitionDur, 0)
	const jump = plan.operations.find(operation => operation.args?.options?.interactiveActions?.click?.type === 'slide')
	assert.equal(jump.args.options.interactiveActions.click.targetSlide, 2)
	assert.equal(jump.args.options.interactiveActions.click.targetSlideId, 'target')
	assert.notEqual(jump.tool, zoom.tool)
})

test('a patch-only Slide Zoom block compiles without inventing a target or an add operation', () => {
	const sparse = baseSpec([{ kind: 'slideZoom', name: 'zoom', patch: { returnToParent: null, transitionDur: null, thumbnailDataUri: null, bbox: null } }])
	sparse.slides = [sparse.slides[0]]
	const plan = buildSpecOperationPlan(sparse, { dryRun: true, plan: 'premium' })
	assert.equal(plan.operations.some(operation => operation.tool === 'betterpptx.slide.add_zoom'), false)
})
