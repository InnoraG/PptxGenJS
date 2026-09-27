import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveNative3dPipeline, publicProductionNative3dLicense } from '../ir/native3d-policy.mjs'

test('production mode requires the Meshy → Mixamo multi-view route', () => {
	assert.deepEqual(resolveNative3dPipeline({ production: true, personalized: false }), {
		ok: false,
		code: 'NATIVE3D_PRODUCTION_REQUIRES_MESHY_MIXAMO',
		message: 'Production native 3D requires 1–4 ordered full-body views for the Meshy → Mixamo pipeline; the self-hosted single-image route is PoC/flow-test only.',
	})
})

test('deployed production environment rejects the self-hosted route even without a production flag', () => {
	assert.deepEqual(resolveNative3dPipeline({ environmentMode: 'production', personalized: false }), {
		ok: false,
		code: 'NATIVE3D_PRODUCTION_REQUIRES_MESHY_MIXAMO',
		message: 'Production native 3D requires 1–4 ordered full-body views for the Meshy → Mixamo pipeline; the self-hosted single-image route is PoC/flow-test only.',
	})
})

test('production personalized route requires explicit owner clearance', () => {
	assert.deepEqual(resolveNative3dPipeline({ production: true, personalized: true, providerConfigured: true }), {
		ok: false,
		code: 'NATIVE3D_PRODUCTION_OWNER_CLEARANCE_REQUIRED',
		message: 'Production personalized native 3D is disabled until the owner records the Meshy plan/order, input consent, Mixamo end-use boundary, and live acceptance decision.',
	})
})

test('production personalized route requires a configured Meshy provider after owner clearance', () => {
	assert.deepEqual(resolveNative3dPipeline({ production: true, personalized: true, ownerCleared: true }), {
		ok: false,
		code: 'NATIVE3D_PRODUCTION_PROVIDER_NOT_CONFIGURED',
		message: 'Production personalized native 3D requires an owner-configured Meshy provider account; the self-hosted PoC route cannot substitute for it.',
	})
})

test('production personalized route opens only with owner clearance and provider', () => {
	assert.deepEqual(resolveNative3dPipeline({ production: true, personalized: true, ownerCleared: true, providerConfigured: true }), {
		ok: true,
		production: true,
		pipeline: 'meshy-mixamo-production',
	})
})

test('personalized multi-view input resolves to production Meshy → Mixamo', () => {
	assert.deepEqual(resolveNative3dPipeline({ personalized: true }), { ok: true, production: true, pipeline: 'meshy-mixamo-production' })
})

test('single-image input remains explicitly PoC when production is not requested', () => {
	assert.deepEqual(resolveNative3dPipeline({ personalized: false }), { ok: true, production: false, pipeline: 'self-hosted-poc' })
})

test('personalized production result stays provider-gated until owner clearance', () => {
	assert.deepEqual(publicProductionNative3dLicense(), {
		type: 'provider-gated',
		commercialUse: 'conditional',
		attributionRequired: null,
		notice: 'Production native 3D uses the Meshy → Mixamo route. Commercial/resale use is conditional on the owner-approved provider plan/order, input-consent record, integrated PowerPoint end-use boundary, and live release gate.',
	})
})
