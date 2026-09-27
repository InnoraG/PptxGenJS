import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { validateTransitionFormatOptions } from '../option-registry.mjs'
import {
	TRANSITION_AUTHORING_OPERATION_CONTRACT,
	TRANSITION_AUTHORING_OPERATION_ROW_IDS,
	transitionAuthoringOperationCapabilityContractForEntry,
	validateTransitionAuthoringOperationArgs,
} from '../transition-authoring-operation-contract.mjs'

test('focused and semantic transition rows share one exact typed contract', () => {
	const focused = { id: TRANSITION_AUTHORING_OPERATION_ROW_IDS.addWithTransition, sourceKind: 'capability-row', category: 'MCP Product Surface', family: 'layouts-themes-masters', label: 'betterpptx-mcp.slide.add_with_transition', implemented: true }
	const semantic = { id: TRANSITION_AUTHORING_OPERATION_ROW_IDS.addTransition, sourceKind: 'capability-row', category: 'Slide Authoring', family: 'motion-transitions-morph', label: 'add transition', implemented: true }
	for (const entry of [focused, semantic]) {
		assert.equal(transitionAuthoringOperationCapabilityContractForEntry(entry), TRANSITION_AUTHORING_OPERATION_CONTRACT)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
	}
	assert.deepEqual(TRANSITION_AUTHORING_OPERATION_CONTRACT.parameterCatalog, [
		'type', 'speed', 'duration', 'advanceOnClick', 'advanceAfterTime', 'direction', 'throughBlack', 'splitDirection', 'pattern', 'spokes', 'clockwise', 'zoomFrom', 'option', 'invX', 'invY', 'p14dur',
	])
})

test('transition operation validates family options, null reset, and public boundaries', () => {
	const value = validateTransitionAuthoringOperationArgs({ transition: { type: 'morph', option: 'byObject', durationMs: 700, advanceOnClick: false }, outputName: 'transition-proof' })
	assert.equal(value.transition.type, 'morph')
	assert.equal(value.transition.durationMs, 700)
	assert.deepEqual(validateTransitionAuthoringOperationArgs({ transition: null }), { transition: null })
	assert.throws(() => validateTransitionAuthoringOperationArgs({ transition: { type: 'wheel', spokes: 0 } }), /spokes/)
	assert.throws(() => validateTransitionAuthoringOperationArgs({ transition: { type: 'fade' }, sourcePath: 'C:\\secret' }), /not part of the public transition operation contract/)
	assert.throws(() => validateTransitionFormatOptions({ type: 'morph', option: 'never' }), /option/)
})

test('semantic slide transition lowers to the native add operation', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Transition aggregate proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'prove add transition', remember: 'typed transition remains editable' },
		visualDesign: { world: 'blueprint', framing: 'one transitioning slide' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' },
		slides: [{ id: 's', title: 'Transition', message: 'Typed transition', layoutIntent: 'title-only', transition: { type: 'morph', option: 'byWord', durationMs: 800 }, content: [{ kind: 'text', name: 'body', text: 'Transition me' }] }],
	}
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add')
	assert.ok(operation)
	assert.equal(operation.args.transition.type, 'morph')
	assert.equal(operation.args.transition.option, 'byWord')
	assert.equal(operation.args.transition.duration, 800)
})

