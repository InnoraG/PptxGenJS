// Deployment-selected verification policy for the public authoring surface.
//
// This module deliberately has no client-controlled inputs.  A specification
// may request a preview, but it may not turn a non-qualified build into a
// production-qualified build by selecting a weaker policy.

export const VERIFICATION_POLICY_SCHEMA_VERSION = 'betterpptx.verification-policy.v1'
export const GENERATED_IMAGE_POLICY_SCHEMA_VERSION = 'betterpptx.generated-image-policy.v2'

export const VERIFICATION_POLICIES = Object.freeze({
	RELEASE_POWERPOINT: 'release-powerpoint',
	PRODUCTION_NON_RENDERING: 'production-non-rendering',
})

function normalized(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function deploymentStage(env = process.env) {
	return normalized(env.BETTERPPTX_DEPLOYMENT_STAGE || env.BETTERPPTX_ENV)
}

function generatedImagesDisabled(env = process.env) {
	const policy = normalized(env.BETTERPPTX_GENERATED_IMAGE_POLICY)
	const explicit = normalized(env.BETTERPPTX_DISABLE_GENERATED_IMAGES || env.BETTERPPTX_GENERATED_IMAGES_DISABLED)
	return policy === 'disabled' || ['1', 'true', 'yes', 'on'].includes(explicit)
}

export function publicGeneratedImagePolicy({ env = process.env } = {}) {
	const stage = deploymentStage(env)
	return {
		schemaVersion: GENERATED_IMAGE_POLICY_SCHEMA_VERSION,
		available: false,
		executableNow: false,
		productionAvailable: false,
		environmentMode: stage || 'unknown',
		selectionSource: 'product-policy-retired',
		clientMayOverride: false,
		materialization: 'retired',
		rendererDependency: 'none',
		runtimeReadiness: 'not-applicable',
		intentRule: 'Generate or edit imagery in the AI client, then upload it or use an authorized supplied/stock asset. BetterPPTX handles framing, crop, effects, accessibility, animation, and packaging.',
		nextAction: { tool: 'betterpptx.assets.upload', reason: 'Upload the AI-client-generated or user-supplied image and reference its opaque asset handle in the deck specification.' },
	}
}

export function generatedImageUnavailableInProductionError({ env = process.env } = {}) {
	const policy = publicGeneratedImagePolicy({ env })
	if (policy.productionAvailable) return null
	const error = new Error('Server-side generic image generation is retired. Generate or edit the image in the AI client, then upload it or use an approved supplied/stock asset.')
	error.code = 'IMAGE_GENERATION_RETIRED'
	error.details = {
		status: 'blocked',
		feature: 'generated-image-assets',
		productionAvailable: policy.productionAvailable,
		materialization: policy.materialization,
		intentRule: policy.intentRule,
		nextAction: policy.nextAction,
	}
	return error
}

function previewInfrastructureAvailable(env = process.env) {
	const explicitlyEnabled = String(env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW || '') === '1'
	return process.platform === 'win32' && (String(env.BETTERPPTX_LOCAL_MAINTAINER || '') === '1' || explicitlyEnabled)
}

export function resolveVerificationPolicy(env = process.env) {
	const explicit = normalized(env.BETTERPPTX_VERIFICATION_POLICY)
	const deploymentStageValue = deploymentStage(env)
	const validExplicit = explicit === VERIFICATION_POLICIES.RELEASE_POWERPOINT || explicit === VERIFICATION_POLICIES.PRODUCTION_NON_RENDERING
	const selected = validExplicit
		? explicit
		: deploymentStageValue === 'production' || deploymentStageValue === 'prod'
			? VERIFICATION_POLICIES.PRODUCTION_NON_RENDERING
			: VERIFICATION_POLICIES.RELEASE_POWERPOINT
	const configurationStatus = explicit && !validExplicit ? 'invalid-explicit-policy-safe-defaulted' : 'valid'
	return {
		policy: selected,
		environmentMode: deploymentStageValue || (selected === VERIFICATION_POLICIES.PRODUCTION_NON_RENDERING ? 'production' : 'release'),
		selectionSource: validExplicit ? 'deployment-configuration' : deploymentStageValue ? 'deployment-stage' : 'safe-default',
		configurationStatus,
		clientMayOverride: false,
	}
}

export function publicVerificationPolicy({ env = process.env, previewAvailable = previewInfrastructureAvailable(env) } = {}) {
	const resolved = resolveVerificationPolicy(env)
	const release = resolved.policy === VERIFICATION_POLICIES.RELEASE_POWERPOINT
	return {
		schemaVersion: VERIFICATION_POLICY_SCHEMA_VERSION,
		policy: resolved.policy,
		environmentMode: resolved.environmentMode,
		selectionSource: resolved.selectionSource,
		configurationStatus: resolved.configurationStatus,
		clientMayOverride: false,
		rendererRequiredForSave: release,
		nonRenderingValidationRequired: !release,
		releaseQualificationRequired: release,
		previewAvailable: Boolean(previewAvailable),
		previewRole: release ? 'required-for-save-and-release-qualification' : 'release-qualification-only',
		saveRule: release
			? 'Save requires current-version deterministic validation plus a complete PowerPoint preview of the exact frozen package.'
			: 'Save requires current-version deterministic package, media, timing, accessibility, and selection validation; hosted PowerPoint preview is intentionally not required in production.',
		evidenceRule: release
			? 'The published package must be byte-identical to the completely previewed frozen package.'
			: 'The delivered package is bound to the exact non-rendering validation evidence and is explicitly recorded as not rendered by PowerPoint.',
	}
}

export { previewInfrastructureAvailable }
