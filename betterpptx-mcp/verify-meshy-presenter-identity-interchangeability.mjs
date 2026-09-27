import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerLocalRigged3d } from './assets/model3d-gen-providers.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const output = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'release-gates', 'meshy-presenter-identity-interchangeability-20260718.json')

function baseSpec(presenter) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Neutral identity interchangeability proof',
		audience: 'verification',
		objective: 'Explain the same authored story with interchangeable native 3D presenters',
		styleIntent: { preset: 'slate-pro' },
		theme: { name: 'Verify', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		presenter,
		sections: [{ id: 'main', title: 'Main', slideIds: ['s1', 's2'] }],
		slides: [
			{ id: 's1', title: 'Welcome', role: 'opener', message: 'Welcome', layoutIntent: 'title-body', narration: 'Welcome everyone.', content: [{ kind: 'title', name: 'title', text: 'Welcome' }] },
			{ id: 's2', title: 'Three priorities', role: 'content', message: 'Priorities', layoutIntent: 'title-body', narration: 'First, second, and third.', content: [{ kind: 'title', name: 'title', text: 'Three priorities' }] },
		],
	}
}

function presenterModel(plan) {
	const operation = plan.operations.find(item => JSON.stringify(item).includes('gen://rigged3d/'))
	return operation?.args?.options?.glbFile || operation?.args?.options?.modelAsset || operation?.args?.glbFile || null
}

function identityNeutralOperations(plan) {
	const assetKeys = new Set(['modelAsset', 'glbFile', 'glbBase64', 'posterAsset', 'posterFile', 'previewBase64'])
	return JSON.parse(JSON.stringify(plan.operations, (key, value) => {
		if (assetKeys.has(key)) return `<${key}:identity-asset>`
		// Meshy and the built-in roster can have different measured body extents. The
		// native PowerPoint viewport is an asset-fit calibration, not choreography.
		if (key === 'objViewport') return '<asset-fit-viewport>'
		// The full baked playScene length is measured from each identity's actual
		// clip payload. It may legitimately differ (for example, the corrected
		// Joe/Louise enumerate bake is 6.633s while the frozen Mixamo bank is
		// 1.167s), while authored slide timing, delay, clip intent, and camera stay
		// invariant. Normalize only this asset-dependent measurement; preserve every
		// other animation field so accidental choreography drift still fails.
		if (key === 'animation' && Array.isArray(value)) {
			return value.map(item => item && item.effect === 'playScene' && item.duration !== undefined
				? { ...item, duration: '<asset-measured-clip-duration>' }
				: item)
		}
		if (typeof value === 'string' && value.startsWith('gen://rigged3d/')) return 'gen://rigged3d/<identity>'
		return value
	}))
}

function modelOptions(plan) {
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_model3d')
	return operation?.args?.options || null
}

function digest(value) {
	return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').toUpperCase()
}

const productionHybrid = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'production-hybrid-proof.glb')
const productionManifest = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'live-meshy-acceptance-20260718', 'fixture-mock-acquisition', 'manifest.json')
assert.equal(fs.existsSync(productionHybrid), true, `missing ${productionHybrid}`)
assert.equal(fs.existsSync(productionManifest), true, `missing ${productionManifest}`)
const hybridBytes = fs.readFileSync(productionHybrid)
const hybridManifest = JSON.parse(fs.readFileSync(productionManifest, 'utf8').replace(/^\uFEFF/, ''))
const registeredPersonalized = registerLocalRigged3d({
	glbBase64: hybridBytes.toString('base64'),
	glbBytes: hybridBytes.length,
	manifest: hybridManifest,
	clipMap: hybridManifest.clipMap,
	basisKey: 'meshy-presenter-identity-interchangeability:production-hybrid-proof',
})

const identities = {
	personalizedMeshy: buildSpecOperationPlan(baseSpec({ model: registeredPersonalized.handle }), { plan: 'premium' }),
	joe: buildSpecOperationPlan(baseSpec({ identity: 'joe' }), { plan: 'premium' }),
	louise: buildSpecOperationPlan(baseSpec({ identity: 'louise' }), { plan: 'premium' }),
}

const names = Object.keys(identities)
const neutralPlans = Object.fromEntries(names.map(name => [name, identityNeutralOperations(identities[name])]))
const neutralDigests = Object.fromEntries(names.map(name => [name, digest(neutralPlans[name])]))
const gestures = Object.fromEntries(names.map(name => [name, identities[name].appliedDefaults.presenter.gestures]))

for (const name of names) {
	assert.ok(presenterModel(identities[name]), `${name} must lower to a rigged 3D model operation`)
	assert.deepEqual(gestures[name], gestures.personalizedMeshy, `${name} must preserve the gesture plan`)
	assert.deepEqual(neutralPlans[name], neutralPlans.personalizedMeshy, `${name} must preserve the identity-neutral operation plan`)
}
const choreographyKeys = ['x', 'y', 'w', 'h', 'camera', 'trans', 'ambientLight', 'ptLights', 'scene', 'animation']
const choreography = Object.fromEntries(names.map(name => [name, Object.fromEntries(choreographyKeys.map(key => {
		const value = modelOptions(identities[name])?.[key]
		if (key !== 'animation' || !Array.isArray(value)) return [key, value]
		return [key, value.map(item => item && item.effect === 'playScene' && item.duration !== undefined
			? { ...item, duration: '<asset-measured-clip-duration>' }
			: item)]
	}))]))
for (const name of names) assert.deepEqual(choreography[name], choreography.personalizedMeshy, `${name} must preserve camera, placement, and animation execution`)
assert.equal(new Set(names.map(name => presenterModel(identities[name]))).size, 3, 'each identity must resolve to a distinct model handle')

const report = {
	schemaVersion: 'betterpptx.meshy-presenter-identity-interchangeability.v1',
	status: 'PASS',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	networkAttempted: false,
	providerRequests: 0,
	contract: {
		personalizedMeshy: registeredPersonalized.handle,
		fallbacks: ['joe', 'louise'],
		identityNeutralFields: ['gesture', 'slide timing', 'animation intent/delay', 'camera', 'placement', 'content pairing', 'Morph'],
		assetMeasuredFields: ['playScene duration'],
		assetFitFields: ['objViewport'],
	},
	personalizedAsset: {
		path: productionHybrid,
		sha256: crypto.createHash('sha256').update(hybridBytes).digest('hex').toUpperCase(),
		bytes: hybridBytes.length,
		manifest: productionManifest,
		clipMapSource: 'Meshy hybrid manifest → frozen Mixamo semantic map',
	},
	identities: Object.fromEntries(names.map(name => [name, {
		modelHandle: presenterModel(identities[name]),
		gesturePlan: gestures[name],
		identityNeutralOperationSha256: neutralDigests[name],
	}])),
	checks: [
		{ id: 'all-three-identities-lower-to-native-3d', status: 'PASS' },
		{ id: 'identity-neutral-operation-plan-equal-except-asset-fit-viewport', status: 'PASS' },
		{ id: 'gesture-timing-camera-placement-animation-morph-invariant', status: 'PASS' },
		{ id: 'distinct-visible-identity-handle-per-choice', status: 'PASS' },
	],
	interpretation: 'The personalized Meshy model replaces only the visible identity asset. The premium authoring plan, canonical Mixamo clip selection, timing, camera, placement, content pairing, and Morph continuity remain unchanged.',
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
