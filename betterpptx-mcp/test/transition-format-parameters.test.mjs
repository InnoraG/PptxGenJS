import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { listOptionCatalog, TRANSITION_FORMAT_PARAMETERS, validateTransitionFormatOptions } from '../option-registry.mjs'
import { resolveTransitionPreset } from '../source-api-gallery-presets.mjs'

const baseSpec = transition => ({
	 schemaVersion: 'betterpptx.deck-spec.v1', title: 'Transition format parameter contract',
	 authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	 contentStory: { audience: 'presentation authors', outcome: 'prove typed native transition controls', remember: 'transition sliders remain editable' },
	 visualDesign: { world: 'blueprint', framing: 'one native transition proof object' },
	 motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' },
	 slides: [{ id: 's', title: 'Transition formatting', message: 'Native transition controls remain editable.', layoutIntent: 'title-only', transition, content: [{ kind: 'text', name: 'body', text: 'Transition proof' }] }],
})

test('transitionPreset catalog exposes gallery selectors and every native extended control', () => {
	const surface = listOptionCatalog({ surface: 'transitionPreset', format: 'full' }).surfaces[0]
	assert.equal(surface.capabilityMode, 'preset-plus-parameters')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.canonical.length, 49)
	assert.equal(surface.parameters.length, TRANSITION_FORMAT_PARAMETERS.length)
	assert.ok(surface.parameters.some(item => item.id === 'duration'))
	assert.ok(surface.parameters.some(item => item.id === 'p14dur'))
	assert.ok(surface.parameters.some(item => item.id === 'advanceAfterTime'))
})

test('transition selectors and sliders reach the native slide operation', () => {
	const plan = buildSpecOperationPlan(baseSpec({
		transitionPresetId: 'transition-ribbon-004', speed: 'fast', durationMs: 900,
		advanceOnClick: false, advanceAfterTime: 6000, direction: 'left',
	}), { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add')
	assert.equal(operation.args.transition.type, 'push')
	assert.equal(operation.args.transition.speed, 'fast')
	assert.equal(operation.args.transition.duration, 900)
	assert.equal(operation.args.transition.durationMs, undefined)
	assert.equal(operation.args.transition.advanceOnClick, false)
	assert.equal(operation.args.transition.advanceAfterTime, 6000)
	assert.equal(operation.args.transition.direction, 'left')
})

test('transition bounds and unsupported families reject before mutation', () => {
	assert.throws(() => validateTransitionFormatOptions({ type: 'fade', duration: 86400001 }), /duration/)
	assert.throws(() => validateTransitionFormatOptions({ type: 'wheel', spokes: 0 }), /spokes/)
	assert.throws(() => validateTransitionFormatOptions({ type: 'fade', advanceOnClick: 'yes' }), /advanceOnClick/)
	assert.throws(() => validateTransitionFormatOptions({ type: 'not-a-transition' }), /type/)
	assert.throws(() => validateTransitionFormatOptions({ transitionPresetId: 'transition-ribbon-999' }), /transition gallery preset/)
	assert.deepEqual(resolveTransitionPreset({ type: 'fade', durationMs: 440 }), { type: 'fade', duration: 440 })
})
