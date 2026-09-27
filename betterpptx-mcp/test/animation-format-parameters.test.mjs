import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { ANIMATION_FORMAT_EFFECTS, ANIMATION_FORMAT_PARAMETERS, listOptionCatalog, validateAnimationFormatOptions } from '../option-registry.mjs'

const baseSpec = timeline => ({
	 schemaVersion: 'betterpptx.deck-spec.v1', title: 'Animation format parameter contract',
	 authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	 contentStory: { audience: 'presentation authors', outcome: 'prove typed native animation controls', remember: 'animation sliders remain editable' },
	 visualDesign: { world: 'blueprint', framing: 'one native animation proof object' },
	 motionTime: { masterClock: 'static', timingSource: 'authored animation timing', syncPolicy: 'one static visual clock' },
	 slides: [{ id: 's', title: 'Animation formatting', message: 'Native animation controls remain editable.', layoutIntent: 'title-only', content: [{ kind: 'text', name: 'body', text: 'Animation proof' }], timeline }],
})

test('animationPreset catalog exposes the full native effect union and typed parameters', () => {
	const surface = listOptionCatalog({ surface: 'animationPreset', format: 'full' }).surfaces[0]
	assert.equal(surface.capabilityMode, 'preset-plus-parameters')
	assert.equal(surface.capabilityStatus, 'structured-partial')
	assert.equal(surface.canonical.length, ANIMATION_FORMAT_EFFECTS.length)
	assert.equal(surface.canonical.length, 166)
	assert.equal(surface.parameters.length, ANIMATION_FORMAT_PARAMETERS.length)
	for (const id of ['duration', 'delay', 'trigger', 'direction', 'sequence', 'repeatCount', 'motionPathData', 'scale', 'rotation', 'color', 'mediaCommand']) assert.ok(surface.parameters.some(item => item.id === id), id)
	assert.equal(surface.parameters.find(item => item.id === 'repeatCount').capabilityStatus, 'native-structured-generic')
	assert.equal(surface.parameters.find(item => item.id === 'autoReverse').capabilityStatus, 'native-structured-generic')
})

test('animation selectors and millisecond aliases reach the native animation operation', () => {
	const plan = buildSpecOperationPlan(baseSpec([{ objectName: 'body', type: 'entrance', effect: 'fly', direction: 'fromLeft', trigger: 'afterPrevious', durationMs: 650, delayMs: 120 }]), { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.animate_shapes')
	assert.ok(operation)
	assert.equal(operation.args.animation.effect, 'fly')
	assert.equal(operation.args.animation.duration, 650)
	assert.equal(operation.args.animation.delay, 120)
	assert.equal(operation.args.animation.durationMs, undefined)
	assert.equal(operation.args.animation.delayMs, undefined)
	assert.equal(operation.args.animation.direction, 'fromLeft')
})

test('animation bounds, enums, and unsupported effects reject before mutation', () => {
	assert.equal(validateAnimationFormatOptions({ type: 'entrance', effect: 'fadeIn', durationMs: 440, delayMs: 40 }).duration, 440)
	assert.equal(validateAnimationFormatOptions({ type: 'emphasis', effect: 'pulse', repeatCount: 'indefinite' }).repeatCount, 'indefinite')
	assert.throws(() => validateAnimationFormatOptions({ type: 'entrance', effect: 'fade', duration: 86400001 }), /duration/)
	assert.throws(() => validateAnimationFormatOptions({ type: 'entrance', effect: 'fade', delay: -1 }), /delay/)
	assert.throws(() => validateAnimationFormatOptions({ type: 'entrance', effect: 'fade', trigger: 'never' }), /trigger/)
	assert.throws(() => validateAnimationFormatOptions({ type: 'entrance', effect: 'fade', repeatCount: 0 }), /repeatCount/)
	assert.throws(() => validateAnimationFormatOptions({ type: 'entrance', effect: 'not-a-native-effect' }), /native effect/)
	assert.equal(validateAnimationFormatOptions({ type: 'media', effect: 'mediaplay', mediaCommand: ' PLAYFROM(2) ' }).mediaCommand, 'playFrom(2.0)')
	assert.equal(validateAnimationFormatOptions({ type: 'media', effect: 'mediapause', mediaCommand: 'togglepause' }).mediaCommand, 'togglePause')
	for (const command of ['playFrom(-1)', 'playFrom(1)&stop', 'playFrom("1")', 'launchCalculator']) {
		assert.throws(() => validateAnimationFormatOptions({ type: 'media', effect: 'mediaplay', mediaCommand: command }), /mediaCommand/)
	}
})

test('repeatCount and autoReverse remain explicit in the semantic operation plan', () => {
	const plan = buildSpecOperationPlan(baseSpec([{ objectName: 'body', type: 'emphasis', effect: 'pulse', repeatCount: 3, autoReverse: true }]), { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.animate_shapes')
	assert.equal(operation.args.animation.repeatCount, 3)
	assert.equal(operation.args.animation.autoReverse, true)
})
