import assert from 'node:assert/strict'
import test from 'node:test'
import {
	authoringCompletenessForSpec,
	artDirectionInfo,
	gradientPolicyForArtDirection,
	DEFAULT_ART_DIRECTION,
} from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const baseSpec = (extra = {}) => ({
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Completeness policy fixture',
	layout: 'LAYOUT_WIDE',
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
	styleIntent: { artDirection: 'luxe' },
	slides: [{
		id: 's1',
		title: 'A complete semantic default',
		message: 'The engine should execute the AI-selected coherent world.',
		content: [{ kind: 'title', name: 'title', text: 'A complete semantic default' }],
	}],
	...extra,
})

test('an explicit AI World executes with complete treatment', () => {
	assert.equal(DEFAULT_ART_DIRECTION, 'luxe')
	const plan = buildSpecOperationPlan(baseSpec())
	assert.equal(plan.appliedDefaults.artDirection, 'luxe')
	assert.equal(plan.appliedDefaults.mode, 'dark')
	assert.equal(plan.appliedDefaults.gradientPolicy.world, 'luxe')
	assert.equal(plan.appliedDefaults.completeness.requestedTier, null)
	assert.equal(plan.appliedDefaults.completeness.effectiveTier, 'complete')
	assert.equal(plan.appliedDefaults.completeness.source, 'engine-default')
	assert.equal(plan.appliedDefaults.decisionSummary.world.completenessTier, 'complete')
	assert.equal(plan.authoringContracts.completeness.requestedTier, null)
	assert.equal(plan.authoringContracts.completeness.effectiveTier, 'complete')
	assert.equal(plan.authoringContracts.completeness.source, 'engine-default')
	assert.equal(plan.authoringContracts.composition.worldSelection.selectionStatus, 'ai-selected')
	assert.equal(plan.authoringContracts.composition.worldSelection.certificationEligible, true)
	assert.equal(Object.hasOwn(plan.authoringContracts.composition.worldSelection, 'rankedCandidates'), false)
})

test('an omitted World uses a labeled non-certifying compatibility fallback', () => {
	assert.equal(artDirectionInfo({}).key, 'luxe')
	assert.equal(artDirectionInfo({}).mode, 'dark')
	assert.equal(gradientPolicyForArtDirection({}).expected, true)
	const plan = buildSpecOperationPlan(baseSpec({ styleIntent: undefined }))
	assert.equal(plan.appliedDefaults.artDirection, 'luxe')
	assert.equal(plan.authoringContracts.composition.worldSelection.selectionStatus, 'legacy-compatibility-fallback')
	assert.equal(plan.authoringContracts.composition.worldSelection.certificationEligible, false)
	assert.ok(plan.warnings.some(item => item.code === 'AI_ART_DIRECTION_REQUIRED_FOR_CERTIFICATION'))
})

test('balanced and minimal are explicit author exceptions', () => {
	const balanced = authoringCompletenessForSpec({ authoringContract: { completeness: { tier: 'balanced' } } })
	assert.equal(balanced.requestedTier, 'balanced')
	assert.equal(balanced.effectiveTier, 'balanced')
	assert.equal(balanced.source, 'authoringContract.completeness')
	const minimal = authoringCompletenessForSpec({ authoringContract: { completeness: { tier: 'minimal' } } })
	assert.equal(minimal.requestedTier, 'minimal')
	assert.equal(minimal.effectiveTier, 'minimal')
	assert.equal(minimal.source, 'authoringContract.completeness')
	assert.equal(authoringCompletenessForSpec({ styleIntent: { completeness: 'rich' } }).effectiveTier, 'complete')
	const plan = buildSpecOperationPlan(baseSpec({ authoringContract: { workflow: 'authoring-excellence-director-v1', completeness: { tier: 'minimal', reason: 'owner-approved minimal reproduction' } } }))
	assert.equal(plan.appliedDefaults.completeness.requestedTier, 'minimal')
	assert.equal(plan.appliedDefaults.completeness.effectiveTier, 'minimal')
	assert.equal(plan.appliedDefaults.completeness.source, 'authoringContract.completeness')
	assert.equal(plan.appliedDefaults.decisionSummary.world.completenessTier, 'minimal')
})

test('complete policy records safe downgrade boundaries instead of inventing rich assets', () => {
	const policy = authoringCompletenessForSpec({})
	assert.ok(policy.preferenceOrder.includes('native-3d-when-a-meaningful-model-or-presenter-is-authored'))
	assert.ok(policy.lastResortRules.some(rule => rule.includes('no-presenter')))
	assert.ok(policy.forbiddenShortcuts.includes('empty decorative shapes'))
	assert.ok(policy.forbiddenShortcuts.includes('hand-authored bounding boxes'))
})
