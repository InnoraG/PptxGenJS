#!/usr/bin/env node
// Authoring-v3 semantic contract gate: catalog -> AI IDs -> exact presenter
// bundle -> slide-level semantic motion -> black-box-safe readback.

import { authoringMotionCatalog, resolveAuthoringMotionSelectionForCatalog } from './ir/authoring-motion-catalog.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'
import { publicBaselineCatalog } from './public-baseline-catalog.mjs'
import { unavailableMotionCatalogFixture } from './test/fixtures/unavailable-motion-catalog.mjs'

const failures = []
let passed = 0
function ok(label, condition, detail = '') {
	if (condition) {
		passed += 1
		console.log(`PASS ${label}`)
	} else {
		failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
		console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
	}
}

function baseSpec(selectedMotionIds, motionId = selectedMotionIds[0]) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Authoring motion semantic contract',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'product leaders', outcome: 'understand exact motion authoring', remember: 'the AI chooses IDs and the engine executes exactly' },
		visualDesign: { world: 'luxe', framing: 'native 3D presenter beside proof content' },
		presenter: { id: 'host', identity: 'joe' },
		motionTime: {
			masterClock: 'narration-text',
			timingSource: 'authored narration',
			syncPolicy: 'one narration-led clock',
			kineticSelection: { presenters: [{ presenterId: 'host', selectedMotionIds }] },
		},
		slides: [{
			id: 'proof', title: 'Exact semantic motion', role: 'proof', layoutIntent: 'title-body',
			message: 'The selected public motion ID becomes one native editable presenter scene.',
			narration: { script: 'Now reveal the exact semantic motion selected for this proof.' },
			presenterMotion: { presenterId: 'host', motionId, narrationCue: 'reveal the exact semantic motion' },
			content: [{ kind: 'body', name: 'proof-copy', text: 'Exact ID. Exact bundle. No substitution.' }],
		}],
	}
}

function expectCode(spec, code) {
	try {
		buildSpecOperationPlan(spec)
		return { ok: false, detail: 'no error' }
	} catch (error) {
		return { ok: error?.code === code, detail: `${error?.code}: ${error?.message}` }
	}
}

const catalog = authoringMotionCatalog({ refresh: true })
const selectable = catalog.records.filter(row => row.selectable).map(row => row.motionId)
const mixed = ['motion.ordinary.talk', 'motion.kinetic.magical-reveal', 'motion.kinetic.victory-jump']
const spec = baseSpec(mixed, 'motion.kinetic.magical-reveal')
const first = buildSpecOperationPlan(spec)
const second = buildSpecOperationPlan(spec)
const readback = first.authoringContracts.motionSelection
const gesture = first.appliedDefaults.presenter.gestures?.[0]
const privateModelOperation = first.operations.find(operation => operation.tool === 'betterpptx.slide.add_model3d')
const narrationOperation = first.operations.find(operation => operation.tool === 'betterpptx.slide.add_narration')

ok('public authoring catalog exposes the 56 currently executable Mixamo motion IDs', publicBaselineCatalog({ family: 'presenter-motion', limit: 500 }).pagination.total === 56)
ok('full catalog view accounts for all 96 currently executable rows', (() => {
	const result = publicBaselineCatalog({ family: 'presenter-motion', includePlanned: true, limit: 500 })
	return result.pagination.total === 96
		&& result.entries.filter(entry => entry.selectable).length === 56
		&& result.entries.filter(entry => entry.selectable === false).length === 40
})())
ok('semantic selection readback preserves exact ordered AI IDs', readback.selectionAuthority === 'AI' && readback.presenters[0].noSilentSubstitution === true && JSON.stringify(readback.presenters[0].selectedMotionIds) === JSON.stringify(mixed), JSON.stringify(readback))
ok('bundle budget is distinct from catalog size', readback.presenters[0].bundleBudget.used === 3 && readback.presenters[0].bundleBudget.maximum === 18 && readback.presenters[0].bundleBudget.remaining === 15, JSON.stringify(readback.presenters[0].bundleBudget))
ok('slide-level public readback uses semantic motion ID and narration cue only', gesture.motionId === 'motion.kinetic.magical-reveal' && gesture.from === 'author' && gesture.narrationCue === 'reveal the exact semantic motion' && !Object.hasOwn(gesture, 'animId'), JSON.stringify(gesture))
ok('presenter motion cue binds the existing native scene to the narration phrase clock', narrationOperation?.args?.cues?.some(cue => cue.bindExistingPresenterMotion === true && cue.atPhrase === 'reveal the exact semantic motion' && cue.anchorMethod === 'duration-proportional-script-position' && cue.target === 'presenter' && cue.motionId === 'motion.kinetic.magical-reveal'), JSON.stringify(narrationOperation?.args?.cues))
ok('private execution still resolves one valid native scene slot', Number.isInteger(privateModelOperation?.args?.options?.scene?.animId) && privateModelOperation.args.options.scene.animId >= 0 && privateModelOperation.args.options.scene.animId < 18, JSON.stringify(privateModelOperation?.args?.options?.scene))
ok('repeated semantic compilation is deterministic', first.planDigest === second.planDigest && readback.presenters[0].bundleHandle === second.authoringContracts.motionSelection.presenters[0].bundleHandle)

const eighteen = buildSpecOperationPlan(baseSpec(selectable.slice(0, 18), selectable[17]))
ok('exact 18-ID authoring selection compiles', eighteen.authoringContracts.motionSelection.presenters[0].bundleBudget.remaining === 0)
const nineteen = expectCode(baseSpec(selectable.slice(0, 19), selectable[0]), 'MOTION_BUNDLE_LIMIT_EXCEEDED')
ok('nineteenth ID fails before deck mutation', nineteen.ok, nineteen.detail)
const unknown = expectCode(baseSpec(['motion.unknown.nope']), 'MOTION_ID_UNKNOWN')
ok('unknown semantic ID fails explicitly', unknown.ok, unknown.detail)
const plannedId = selectable[0]
const unavailableSpec = baseSpec([plannedId])
const planned = resolveAuthoringMotionSelectionForCatalog(unavailableMotionCatalogFixture(catalog, plannedId), unavailableSpec.motionTime.kineticSelection.presenters[0].selectedMotionIds)
ok('the compiler selection gate rejects a controlled unavailable spec selection', !planned.ok && planned.errors.some(error => error.code === 'MOTION_NOT_EXECUTABLE'), JSON.stringify(planned.errors))
const enumerate = buildSpecOperationPlan(baseSpec(['motion.ordinary.enumerate']))
ok('the separately proven Enumerate replacement compiles without substitution', enumerate.authoringContracts.motionSelection.presenters[0].selectedMotionIds[0] === 'motion.ordinary.enumerate' && enumerate.authoringContracts.motionSelection.presenters[0].noSilentSubstitution === true)
const duplicate = expectCode(baseSpec([selectable[0], selectable[0]]), 'MOTION_ID_DUPLICATE')
ok('duplicate semantic ID fails explicitly', duplicate.ok, duplicate.detail)
const notSelected = expectCode(baseSpec([selectable[0]], selectable[1]), 'MOTION_NOT_IN_BUNDLE')
ok('slide cannot invoke a motion absent from its bundle', notSelected.ok, notSelected.detail)
const unresolvedCueSpec = baseSpec([selectable[0]])
unresolvedCueSpec.slides[0].presenterMotion.narrationCue = 'phrase that is absent'
const unresolvedCue = expectCode(unresolvedCueSpec, 'NARRATION_CUE_ANCHOR_UNRESOLVED')
ok('presenter motion phrase cue must exist in authored narration', unresolvedCue.ok, unresolvedCue.detail)
const missingCueAnchorSpec = baseSpec([selectable[0]])
missingCueAnchorSpec.slides[0].presenterMotion.narrationCue = { target: 'presenter' }
const missingCueAnchor = expectCode(missingCueAnchorSpec, 'NARRATION_CUE_ANCHOR_UNRESOLVED')
ok('presenter motion cue without an anchor fails closed', missingCueAnchor.ok, missingCueAnchor.detail)
const zeroCueSpec = baseSpec([selectable[0]])
zeroCueSpec.slides[0].presenterMotion.narrationCue = { atMs: 0, objectName: 'compatibility-alias' }
const zeroCue = buildSpecOperationPlan(zeroCueSpec).operations.find(operation => operation.tool === 'betterpptx.slide.add_narration')?.args?.cues?.find(cue => cue.bindExistingPresenterMotion === true)
ok('presenter motion keeps explicit atMs:0 and canonicalizes objectName to its bound target', zeroCue?.atMs === 0 && zeroCue?.target === 'presenter' && !Object.hasOwn(zeroCue || {}, 'objectName'), JSON.stringify(zeroCue))
const missingNarrationSpec = baseSpec([selectable[0]])
delete missingNarrationSpec.slides[0].narration
const missingNarration = expectCode(missingNarrationSpec, 'MOTION_NARRATION_REQUIRED')
ok('presenter motion cue cannot create a competing clock without narration', missingNarration.ok, missingNarration.detail)
const invalidAtMsSpec = baseSpec([selectable[0]])
invalidAtMsSpec.slides[0].presenterMotion.narrationCue = { atMs: 'not-a-number' }
const invalidAtMs = expectCode(invalidAtMsSpec, 'MOTION_NARRATION_CUE_INVALID')
ok('presenter motion millisecond cue must be finite and non-negative', invalidAtMs.ok, invalidAtMs.detail)

const castSpec = {
	...baseSpec(['motion.ordinary.talk']),
	title: 'Per-presenter semantic bundle proof',
	presenter: undefined,
	presenters: { cast: [{ id: 'joeHost', identity: 'joe' }, { id: 'louiseHost', identity: 'louise' }] },
	motionTime: {
		masterClock: 'narration-text', timingSource: 'authored narration', syncPolicy: 'one narration-led clock',
		kineticSelection: { presenters: [
			{ presenterId: 'joeHost', selectedMotionIds: ['motion.ordinary.talk', 'motion.kinetic.magical-reveal'] },
			{ presenterId: 'louiseHost', selectedMotionIds: ['motion.ordinary.present', 'motion.kinetic.victory-jump'] },
		] },
	},
	slides: [{
		id: 'cast-proof', title: 'Two exact presenter bundles', role: 'proof', layoutIntent: 'title-body', message: 'Each AI-selected cast member keeps an independent 18-motion budget.',
		narration: { script: 'Joe explains first. Louise presents next, with enough words to carry both gestures.' },
		scene: [
			{ actor: 'joeHost', motionId: 'motion.ordinary.talk', narrationCue: 'Joe explains' },
			{ actor: 'louiseHost', motionId: 'motion.ordinary.present', narrationCue: 'Louise presents' },
		],
		content: [{ kind: 'body', name: 'cast-proof-copy', text: 'Two identities. Two exact semantic bundles. One narration master clock.' }],
	}],
}
const castPlan = buildSpecOperationPlan(castSpec)
const castReadback = castPlan.authoringContracts.motionSelection.presenters
const castModels = castPlan.operations.filter(operation => operation.tool === 'betterpptx.slide.add_model3d')
const castCues = castPlan.operations.find(operation => operation.tool === 'betterpptx.slide.add_narration')?.args?.cues || []
ok('two presenters receive independent exact semantic bundles and budgets', castReadback.length === 2 && castReadback.every(item => item.bundleBudget.used === 2 && item.bundleBudget.maximum === 18 && item.noSilentSubstitution === true), JSON.stringify(castReadback))
ok('cast scene resolves one valid private native slot per model instance', castModels.length === 2 && castModels.every(operation => Number.isInteger(operation.args?.options?.scene?.animId) && operation.args.options.scene.animId >= 0 && operation.args.options.scene.animId < 18), JSON.stringify(castModels.map(operation => operation.args?.options?.scene)))
ok('cast motions bind independently to authored narration phrases', castCues.filter(cue => cue.bindExistingPresenterMotion === true).length === 2 && castCues.some(cue => cue.target === 'joeHost' && cue.atPhrase === 'Joe explains') && castCues.some(cue => cue.target === 'louiseHost' && cue.atPhrase === 'Louise presents'), JSON.stringify(castCues))

console.log(`AUTHORING MOTION SPEC GATE: ${passed} passed, ${failures.length} failed`)
if (failures.length) {
	console.error(failures.join('\n'))
	process.exitCode = 1
}
