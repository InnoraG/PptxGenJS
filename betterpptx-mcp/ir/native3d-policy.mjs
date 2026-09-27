// Product routing policy for the native-3D presenter lane.
// Personalized multi-view authoring is the production Meshy → Mixamo path;
// the self-hosted generator is retained only for explicit PoC/flow testing.
export function resolveNative3dPipeline({ personalized = false, production = false, environmentMode = '', ownerCleared = false, providerConfigured = false } = {}) {
	const requestedProduction = Boolean(production) || String(environmentMode || '').trim().toLowerCase() === 'production'
	if (requestedProduction && !personalized) {
		return {
			ok: false,
			code: 'NATIVE3D_PRODUCTION_REQUIRES_MESHY_MIXAMO',
			message: 'Production native 3D requires 1–4 ordered full-body views for the Meshy → Mixamo pipeline; the self-hosted single-image route is PoC/flow-test only.',
		}
	}
	if (requestedProduction && personalized && !ownerCleared) {
		return {
			ok: false,
			code: 'NATIVE3D_PRODUCTION_OWNER_CLEARANCE_REQUIRED',
			message: 'Production personalized native 3D is disabled until the owner records the Meshy plan/order, input consent, Mixamo end-use boundary, and live acceptance decision.',
		}
	}
	if (requestedProduction && personalized && !providerConfigured) {
		return {
			ok: false,
			code: 'NATIVE3D_PRODUCTION_PROVIDER_NOT_CONFIGURED',
			message: 'Production personalized native 3D requires an owner-configured Meshy provider account; the self-hosted PoC route cannot substitute for it.',
		}
	}
	return {
		ok: true,
		production: requestedProduction || Boolean(personalized),
		pipeline: personalized ? 'meshy-mixamo-production' : 'self-hosted-poc',
	}
}

// Public result facts for the native-3D lane deliberately remain conditional:
// provider account plan/order, input rights, Mixamo end-use limits, and live
// acceptance are owner gates. This prevents a personalized result from being
// mislabeled as universally resale-cleared before those records exist.
export function publicProductionNative3dLicense() {
	return {
		type: 'provider-gated',
		commercialUse: 'conditional',
		attributionRequired: null,
		notice: 'Production native 3D uses the Meshy → Mixamo route. Commercial/resale use is conditional on the owner-approved provider plan/order, input-consent record, integrated PowerPoint end-use boundary, and live release gate.',
	}
}
