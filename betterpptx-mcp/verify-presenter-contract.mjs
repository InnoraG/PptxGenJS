#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { presenterContractForSpec, normalizePresenterPolicy, resolvePresenterIdentityForSpec, applyPresenterRepresentationPolicy, presenterExecutionPlanForSpec } from './ir/presenter-contract.mjs'
import { lowerPresenterRuntime } from './ir/presenter-runtime-director.mjs'
import { buildSpecOperationPlan, compactSpecPlan } from './ir/spec-compiler.mjs'

const identity = {
	id: 'demo-presenter',
	portraitAsset: 'asset://portrait/demo-presenter',
	riggedModel: 'gen://rigged3d/demo-presenter',
	poster: 'asset://poster/demo-presenter',
	voice: 'voice://en-US/demo',
	consent: { confirmed: true, scope: 'deck' },
	provenance: { source: 'product-owned' },
}
const policy = normalizePresenterPolicy({ modes: ['3d', 'talkingHead', 'hybrid'], fallback: ['poster', 'audioOnly'], avoidDuplicatePresence: true })
assert.deepEqual(policy.modes, ['3d', 'talkingHead', 'hybrid'])
assert.deepEqual(policy.fallback, ['poster', 'audioOnly'])

const talkingHeadSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Presenter contract fixture',
	presenterIdentity: identity,
	presenterPolicy: policy,
	slides: [{ id: 's1', title: 'Opening', message: 'Welcome', avatarNarration: { script: 'Welcome to the presentation.' } }],
}
const talkingHeadContract = presenterContractForSpec(talkingHeadSpec)
assert.equal(talkingHeadContract.identity.id, 'demo-presenter')
assert.equal(talkingHeadContract.lanes.talkingHead, true)
assert.equal(talkingHeadContract.lanes.native3d, false)
assert.equal(talkingHeadContract.representations[0].mode, 'talkingHead')
assert.equal(talkingHeadContract.ready, true)
assert.equal(talkingHeadContract.timeline.schemaVersion, 'betterpptx.presenter-timeline.v1')
assert.equal(talkingHeadContract.timeline.entries[0].source, 'talkingHead')
assert.equal(talkingHeadContract.timeline.entries[0].script, 'Welcome to the presentation.')
assert.equal(talkingHeadContract.executionPlan.schemaVersion, 'betterpptx.presenter-execution-plan.v1')
assert.equal(talkingHeadContract.executionPlan.entries[0].mode, 'talkingHead')
assert.equal(talkingHeadContract.executionPlan.entries[0].powerPointNative, true)

const materializedAliasSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	presenter: { id: 'host', identity: 'joe', model: 'gen://rigged3d/opaque-joe', poster: 'asset://poster/opaque-joe' },
	presenterPolicy: { modes: ['3d'], fallback: ['poster'] },
	slides: [{ id: 's1', content: [{ kind: 'model3d', name: 'presenter', model: 'gen://rigged3d/opaque-joe' }] }],
}
const materializedAlias = presenterContractForSpec(materializedAliasSpec)
assert.equal(materializedAlias.identity.id, 'joe', 'compact built-in identity alias should survive roster materialization')
assert.equal(materializedAlias.identity.riggedModel, 'gen://rigged3d/opaque-joe')
assert.equal(materializedAlias.identity.poster, 'asset://poster/opaque-joe')
assert.equal(materializedAlias.ready, true)
assert.equal(materializedAlias.executionPlan.motionPolicy, 'full')
assert.ok(!materializedAlias.warnings.some(item => item.code === 'PRESENTER_IDENTITY_MISSING'))

const canonicalWinner = resolvePresenterIdentityForSpec({
	presenterIdentity: { id: 'joe', riggedModel: 'gen://rigged3d/canonical-joe' },
	presenter: { id: 'host', identity: 'louise', model: 'gen://rigged3d/materialized-louise' },
})
assert.equal(canonicalWinner.identity.id, 'joe', 'canonical presenterIdentity must win')
assert.equal(canonicalWinner.identity.riggedModel, 'gen://rigged3d/canonical-joe', 'conflicting alias materialization must not replace the canonical asset')
assert.ok(canonicalWinner.issues.some(item => item.code === 'PRESENTER_IDENTITY_CONFLICT'))
const identityConflictContract = presenterContractForSpec({
	presenterIdentity: { id: 'joe', riggedModel: 'gen://rigged3d/canonical-joe' },
	presenter: { id: 'host', identity: 'louise', model: 'gen://rigged3d/materialized-louise' },
	slides: [{ id: 's1', content: [{ kind: 'model3d', name: 'presenter', model: 'gen://rigged3d/materialized-louise' }] }],
})
assert.equal(identityConflictContract.ready, false)
assert.ok(identityConflictContract.warnings.some(item => item.code === 'PRESENTER_IDENTITY_CONFLICT' && item.severity === 'error'))
const identityConflictPlan = buildSpecOperationPlan({
	schemaVersion: 'betterpptx.deck-spec.v1',
	presenterIdentity: { id: 'joe', riggedModel: 'gen://rigged3d/canonical-joe' },
	presenter: { id: 'host', identity: 'louise', model: 'gen://rigged3d/materialized-louise' },
	slides: [{ id: 's1', content: [{ kind: 'model3d', name: 'presenter', model: 'gen://rigged3d/materialized-louise' }] }],
}, { plan: 'premium' })
assert.ok(identityConflictPlan.errors.some(item => item.code === 'PRESENTER_IDENTITY_CONFLICT' && item.source === 'presenter-contract'), 'identity conflicts must block through the top-level public plan findings')
assert.equal(resolvePresenterIdentityForSpec({ presenter: { id: 'joe', model: 'gen://rigged3d/opaque' } }).identity, null, 'logical presenter.id must not be treated as visible identity')

const policyConflictSpec = {
	...materializedAliasSpec,
	motionPolicy: 'full',
	accessibility: { reducedMotion: true },
}
const policyConflictContract = presenterContractForSpec(policyConflictSpec)
assert.equal(policyConflictContract.executionPlan.motionPolicy, 'full', 'explicit motionPolicy must propagate to presenter execution')
assert.ok(policyConflictContract.warnings.some(item => item.code === 'MOTION_POLICY_CONFLICT' && item.severity === 'error'))
const policyConflictRuntime = lowerPresenterRuntime({ contract: policyConflictContract, operations: [{ slideId: 's1', tool: 'betterpptx.slide.add_model3d', args: { options: { modelAsset: 'gen://rigged3d/opaque-joe' } } }] })
assert.equal(policyConflictRuntime.motionPolicy, 'full', 'runtime must report the same effective policy as the presenter contract')
const policyConflictPlan = buildSpecOperationPlan(policyConflictSpec, { plan: 'premium' })
assert.ok(policyConflictPlan.errors.some(item => item.code === 'MOTION_POLICY_CONFLICT' && item.source === 'presenter-contract'), 'motion-policy conflicts must block through the top-level public plan findings')

const duplicateSpec = {
	...talkingHeadSpec,
	slides: [{
		id: 's1',
		title: 'Duplicate',
		content: [{ kind: 'model3d', name: 'presenter', model: identity.riggedModel }],
		avatarNarration: { script: 'The presenter speaks.' },
	}],
}
const duplicateContract = presenterContractForSpec(duplicateSpec)
assert.equal(duplicateContract.representations[0].mode, 'hybrid')
assert.equal(duplicateContract.representations[0].duplicatePresence, false, 'hybrid is explicitly allowed by policy')

const noHybrid = presenterContractForSpec({
	...duplicateSpec,
	presenterPolicy: { modes: ['3d', 'talkingHead'], fallback: ['poster'], avoidDuplicatePresence: true },
})
assert.equal(noHybrid.representations[0].duplicatePresence, true)
assert.equal(noHybrid.ready, false)

const selected = applyPresenterRepresentationPolicy({
	...duplicateSpec,
	presenter: { model: identity.riggedModel },
	presenterPolicy: { modes: ['3d', 'talkingHead'], avoidDuplicatePresence: true },
})
assert.equal(selected.slides[0].avatarNarration.enabled, false, '3D-first policy should suppress an implicit duplicate talking head')

const plan = buildSpecOperationPlan(talkingHeadSpec, { plan: 'premium' })
assert.equal(plan.presenterContract.identity.id, 'demo-presenter')
assert.equal(plan.presenterContract.lanes.talkingHead, true)
const compact = compactSpecPlan(plan, 'summary')
assert.equal(compact.data.presenterContract.schemaVersion, 'betterpptx.presenter-contract.v1')
assert.equal(compact.data.presenterContract.representations[0].mode, 'talkingHead')
assert.equal(compact.data.presenterContract.timeline.entries[0].source, 'talkingHead')
assert.equal(plan.presenterContract.executionPlan.entries[0].mode, 'talkingHead')
assert.equal(plan.presenterRuntime.schemaVersion, 'betterpptx.presenter-runtime-director.v1')
assert.equal(plan.presenterRuntime.status, 'ready')
assert.equal(plan.presenterRuntime.entries[0].status, 'lowered')

const staticPlan = presenterExecutionPlanForSpec(talkingHeadSpec, { motionPolicy: 'static' })
assert.equal(staticPlan.entries[0].mode, 'poster')
assert.equal(staticPlan.entries[0].fallback, true)

const threeDSpec = {
	...talkingHeadSpec,
	slides: [{ id: 's1', title: '3D', content: [{ kind: 'model3d', name: 'presenter', model: identity.riggedModel }], narration: { script: 'The native presenter speaks.' } }],
	presenterPolicy: { modes: ['3d', 'talkingHead'], fallback: ['audioOnly'], avoidDuplicatePresence: true },
}
const threeDPlan = presenterExecutionPlanForSpec(threeDSpec)
assert.equal(threeDPlan.entries[0].mode, '3d')
assert.equal(threeDPlan.entries[0].native3d, true)
assert.equal(threeDPlan.entries[0].talkingHead, false)

const threeDCompiled = buildSpecOperationPlan(threeDSpec, { plan: 'premium' })
assert.equal(threeDCompiled.presenterRuntime.status, 'ready')
assert.equal(threeDCompiled.presenterRuntime.entries[0].mode, '3d')
assert.equal(threeDCompiled.presenterRuntime.entries[0].status, 'lowered')

const explicitTalkingHeadWithoutOperation = buildSpecOperationPlan({
	...talkingHeadSpec,
	slides: [{ id: 's1', title: 'Explicit lane', presenterMode: 'talkingHead', narration: { script: 'The voice remains accessible.' } }],
}, { plan: 'premium' })
assert.equal(explicitTalkingHeadWithoutOperation.presenterRuntime.status, 'blocked')
assert.ok(explicitTalkingHeadWithoutOperation.errors.some(error => error.code === 'PRESENTER_RUNTIME_LANE_NOT_LOWERED'))

// Full lane corpus: every authored/fallback representation must be explicit,
// deterministic, and either lower to a PowerPoint-native operation or remain a
// deliberate inactive fallback. This is a plan/lowering check, not a claim of
// visual quality or provider execution.
const laneCorpus = []
function verifyLane(id, spec, options, operations, expectedMode) {
	const executionPlan = presenterExecutionPlanForSpec(spec, options)
	const entry = executionPlan.entries[0]
	assert.equal(entry.mode, expectedMode, id)
	const runtime = lowerPresenterRuntime({ contract: { executionPlan }, operations })
	assert.equal(runtime.status, 'ready', id)
	assert.equal(runtime.entries[0].status, entry.active ? 'lowered' : 'fallback-planned', id)
	laneCorpus.push({ id, mode: entry.mode, active: entry.active, runtimeStatus: runtime.status })
}

verifyLane('talking-head', talkingHeadSpec, {}, [{ slideId: 's1', tool: 'betterpptx.slide.add_avatar_narration', args: { avatarAsset: identity.portraitAsset } }], 'talkingHead')
verifyLane('native-3d', threeDSpec, {}, [{ slideId: 's1', tool: 'betterpptx.slide.add_model3d', args: { options: { modelAsset: identity.riggedModel } } }], '3d')
verifyLane('hybrid', {
	...talkingHeadSpec,
	presenterPolicy: { modes: ['3d', 'talkingHead', 'hybrid'], fallback: ['poster', 'audioOnly'], avoidDuplicatePresence: true },
	slides: [{ id: 's1', presenterMode: 'hybrid', avatarNarration: { script: 'Hybrid presenter.' }, content: [{ kind: 'model3d', name: 'presenter', model: identity.riggedModel }] }],
}, {}, [
	{ slideId: 's1', tool: 'betterpptx.slide.add_avatar_narration', args: { avatarAsset: identity.portraitAsset } },
	{ slideId: 's1', tool: 'betterpptx.slide.add_model3d', args: { options: { modelAsset: identity.riggedModel } } },
], 'hybrid')
verifyLane('poster-fallback', talkingHeadSpec, { motionPolicy: 'static' }, [], 'poster')
verifyLane('audio-only-fallback', {
	presenterIdentity: { id: identity.id },
	presenterPolicy: { modes: ['3d'], fallback: ['audioOnly'], avoidDuplicatePresence: true },
	slides: [{ id: 's1', presenterMode: '3d', narration: { script: 'Audio fallback.' } }],
}, {}, [], 'audioOnly')
verifyLane('absent', {
	presenterIdentity: identity,
	presenterPolicy: policy,
	slides: [{ id: 's1', message: 'No presenter on this slide.' }],
}, {}, [], 'absent')

const presenterReport = {
	schemaVersion: 'betterpptx.presenter-contract-verification.v1',
	status: 'PASS',
	checks: ['shared-timeline', 'talking-head-native-media', 'native-3d-lane', 'hybrid-lane', 'static-poster-fallback', 'audio-only-fallback', 'absent-lane', 'duplicate-policy', 'runtime-lowering', 'runtime-fail-closed', 'full-lane-corpus'],
	runtimeDirector: {
		status: 'PASS',
		schemaVersion: 'betterpptx.presenter-runtime-director.v1',
		validatedModes: ['talkingHead', '3d', 'hybrid', 'poster', 'audioOnly', 'absent'],
		failClosedExplicitLane: true,
		laneCorpus,
		operationLowering: 'PowerPoint-native operation references are required for every active lane',
	},
	plannedModes: [...new Set([
	talkingHeadContract.executionPlan.entries[0].mode,
	staticPlan.entries[0].mode,
	threeDPlan.entries[0].mode,
	...laneCorpus.map(item => item.mode),
	])],
}
const presenterReportPath = path.resolve('betterpptx-mcp/outputs/presenter-contract-report.json')
await fs.mkdir(path.dirname(presenterReportPath), { recursive: true })
await fs.writeFile(presenterReportPath, JSON.stringify(presenterReport, null, 2) + '\n')

console.log('PRESENTER CONTRACT VERIFY: PASS')
