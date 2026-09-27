import assert from 'node:assert/strict'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'
import { ensureDefaultPresenterRegistered } from './assets/default-presenter-roster.mjs'
import { getCachedGeneratedRigged3d } from './assets/model3d-gen-providers.mjs'

function spec({ title, objective, preset, identity = 'auto', presenter = true }) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title,
		audience: 'verification',
		objective,
		styleIntent: { preset },
		theme: { name: 'Verify', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		...(presenter ? { presenter: { identity } } : {}),
		sections: [{ id: 'main', title: 'Main', slideIds: ['s1', 's2'] }],
		slides: [
			{ id: 's1', title: 'Welcome', role: 'opener', message: 'Welcome', layoutIntent: 'title-body', narration: 'Welcome everyone.', content: [{ kind: 'title', name: 'title', text: 'Welcome' }] },
			{ id: 's2', title: 'Three priorities', role: 'content', message: 'Priorities', layoutIntent: 'title-body', narration: 'First, second, and third.', content: [{ kind: 'title', name: 'title', text: 'Three priorities' }] },
		],
	}
}

function presenterModel(plan) {
	const operation = plan.operations.find(item => JSON.stringify(item).includes('gen://rigged3d/'))
	return operation?.args?.options?.glbFile || operation?.args?.options?.modelAsset || operation?.args?.glbFile || JSON.stringify(operation)
}

function identityNeutralOperations(plan) {
	const assetKeys = new Set(['modelAsset', 'glbFile', 'glbBase64', 'posterAsset', 'posterFile', 'previewBase64'])
	return JSON.parse(JSON.stringify(plan.operations, (key, value) => {
		if (assetKeys.has(key)) return `<${key}:identity-asset>`
		if (typeof value === 'string' && value.startsWith('gen://rigged3d/')) return 'gen://rigged3d/<identity>'
		return value
	}))
}

const warm = buildSpecOperationPlan(spec({ title: 'Community wellness', objective: 'Educate nurses about patient care', preset: 'warm-keynote' }), { plan: 'premium' })
const technical = buildSpecOperationPlan(spec({ title: 'Engineering security operations', objective: 'Explain developer data infrastructure', preset: 'command-center' }), { plan: 'premium' })
assert.equal(warm.appliedDefaults.presenter.identity, 'louise')
assert.equal(technical.appliedDefaults.presenter.identity, 'joe')

const joe = buildSpecOperationPlan(spec({ title: 'Neutral', objective: 'Explain', preset: 'slate-pro', identity: 'joe' }), { plan: 'premium' })
const louise = buildSpecOperationPlan(spec({ title: 'Neutral', objective: 'Explain', preset: 'slate-pro', identity: 'louise' }), { plan: 'premium' })
assert.notEqual(presenterModel(joe), presenterModel(louise))
assert.deepEqual(joe.appliedDefaults.presenter.gestures, louise.appliedDefaults.presenter.gestures)
assert.deepEqual(identityNeutralOperations(joe), identityNeutralOperations(louise), 'identity swap must preserve timing, camera, placement, animation, and Morph operations')
assert.ok(JSON.stringify(joe.operations).includes('"ay":0'), 'Joe fallback must use the measured front-facing zero-degree native yaw')
assert.ok(JSON.stringify(louise.operations).includes('"ay":0'), 'Louise fallback must use the measured front-facing zero-degree native yaw')
assert.equal(joe.appliedDefaults.presenter.gestures[0].intent, 'greet')
assert.equal(Object.prototype.hasOwnProperty.call(joe.appliedDefaults.presenter.gestures[0], 'animId'), false, 'public presenter planning must remain semantic; baked animation ids are engine-owned')
assert.equal(joe.appliedDefaults.presenter.selection.reason, 'explicit author choice')
assert.equal(joe.appliedDefaults.presenter.selection.mode, 'explicit')
assert.equal(warm.appliedDefaults.presenter.selection.mode, 'auto-fallback')
assert.equal(Object.hasOwn(warm.appliedDefaults.presenter.selection, 'scores'), false, 'public compatibility readback must not expose aesthetic presenter scoring')
assert.ok(warm.warnings.some(item => item.code === 'AI_PRESENTER_IDENTITY_REQUIRED_FOR_CERTIFICATION' && item.severity === 'warning'), 'legacy specs may execute but must label auto identity non-certifying')
const directorAuto = buildSpecOperationPlan({
	...spec({ title: 'Director auto compatibility', objective: 'Explain', preset: 'slate-pro' }),
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
}, { plan: 'premium' })
assert.ok(directorAuto.errors.some(item => item.code === 'AI_PRESENTER_IDENTITY_REQUIRED_FOR_CERTIFICATION' && item.severity === 'error'), 'Director/FTR authoring must block the compatibility identity fallback')
const directorExact = buildSpecOperationPlan({
	...spec({ title: 'Director exact presenter', objective: 'Explain', preset: 'slate-pro', identity: 'joe' }),
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
}, { plan: 'premium' })
assert.equal(directorExact.errors.some(item => item.code === 'AI_PRESENTER_IDENTITY_REQUIRED_FOR_CERTIFICATION'), false, 'an explicit AI presenter identity remains certifying')

const louiseAsset = ensureDefaultPresenterRegistered('louise')
const louiseCached = getCachedGeneratedRigged3d(louiseAsset.hash)
assert.equal(louiseCached?.manifest?.materialProfile, 'mixamo-dielectric-strict-matte')
assert.equal(louiseCached?.manifest?.materialProfileVersion, 'mixamo-dielectric-v4')
assert.equal(louiseCached?.manifest?.staticPoseClipName, '00_idle')
assert.ok(louiseCached?.manifest?.materialProfileMaterials?.every(material => material.metallicFactor === 0 && material.roughnessFactor === 1 && material.hasMetallicRoughnessTexture === false && material.hasSpecularExtension === false))

const personalizedHandle = 'gen://rigged3d/12345678'
const personalized = buildSpecOperationPlan({ ...spec({ title: 'Custom', objective: 'Explain', preset: 'slate-pro' }), presenter: { model: personalizedHandle } }, { plan: 'premium' })
assert.ok(personalized.operations.some(operation => JSON.stringify(operation).includes(personalizedHandle)))
const off = buildSpecOperationPlan(spec({ title: 'No presenter', objective: 'Explain', preset: 'slate-pro', presenter: false }), { plan: 'premium' })
assert.equal(off.appliedDefaults.presenter.active, undefined)
assert.equal(off.operations.some(operation => JSON.stringify(operation).includes('gen://rigged3d/')), false)

console.log(JSON.stringify({ ok: true, autoWarm: warm.appliedDefaults.presenter.identity, autoTechnical: technical.appliedDefaults.presenter.identity, joeModel: presenterModel(joe), louiseModel: presenterModel(louise), identitySwapInvariant: ['gesture', 'timing', 'camera', 'placement', 'animation', 'morph'] }, null, 2))
