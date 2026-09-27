import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import {
	ANIMATION_AUTHORING_OPERATION_CONTRACT,
	ANIMATION_AUTHORING_OPERATION_ROW_ID,
	animationAuthoringOperationCapabilityContractForEntry,
	validateAnimationAuthoringOperationArgs,
} from '../animation-authoring-operation-contract.mjs'

const entry = {
	id: ANIMATION_AUTHORING_OPERATION_ROW_ID,
	sourceKind: 'capability-row',
	category: 'Slide Authoring',
	family: 'motion-transitions-morph',
	label: 'add animation',
	implemented: true,
}

test('Slide Authoring add animation is an exact typed operation aggregate', () => {
	assert.equal(animationAuthoringOperationCapabilityContractForEntry(entry), ANIMATION_AUTHORING_OPERATION_CONTRACT)
	const truth = applyCatalogTruth(entry)
	assert.equal(truth.capabilityMode, 'parameterized')
	assert.equal(truth.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(truth.componentOwnership, ['motionOrTransitionEffect', 'timing', 'animationTarget'])
	assert.ok(truth.overrideFields.includes('animation.motionPathData'))
	assert.ok(truth.resetBehavior.component.includes('null'))
	assert.ok(truth.precedence.length >= 3)
})

test('add animation contract validates native selectors, typed timing, targeting, and null reset', () => {
	const value = validateAnimationAuthoringOperationArgs({
		animation: { type: 'entrance', effect: 'fadeIn', durationMs: 650, delayMs: 120, trigger: 'afterPrevious' },
		names: ['headline', 'body'],
		staggerMs: 80,
	})
	assert.equal(value.animation.effect, 'fade')
	assert.equal(value.animation.duration, 650)
	assert.equal(value.animation.delay, 120)
	assert.throws(() => validateAnimationAuthoringOperationArgs({ animation: { type: 'entrance', effect: 'fade' }, privatePath: 'C:\\secret' }), /not part of the public add animation contract/)
	assert.throws(() => validateAnimationAuthoringOperationArgs({ animation: { type: 'entrance', effect: 'fade' }, indices: [-1] }), /non-negative integer/)
	assert.throws(() => validateAnimationAuthoringOperationArgs({ animation: null }), /one animation object/)
})

test('semantic deck animation lowers to the exact native animation operation', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Animation aggregate proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove add animation', remember: 'typed animation remains editable' },
		visualDesign: { world: 'blueprint', framing: 'one animated object' },
		motionTime: { masterClock: 'static', timingSource: 'authored animation timing', syncPolicy: 'one static visual clock' },
		slides: [{ id: 's', title: 'Animation', message: 'Typed animation', layoutIntent: 'title-only', content: [{ kind: 'text', name: 'headline', text: 'Animate me' }], timeline: [{ objectName: 'headline', type: 'entrance', effect: 'fly', trigger: 'afterPrevious', durationMs: 500 }] }],
	}
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.animate_shapes')
	assert.ok(operation)
	assert.equal(operation.args.animation.effect, 'fly')
	assert.equal(operation.args.animation.duration, 500)
})
