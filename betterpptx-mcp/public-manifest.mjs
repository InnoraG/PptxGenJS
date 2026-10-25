/**
 * Public tool-manifest identity. Status, initialize, and health must report the
 * same facts as tools/list so hosts can detect a stale cached schema.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { publicToolList } from './blackbox.mjs'
import { TOOLS } from './tools.mjs'
import { publicMcpProtocolManifest } from './mcp-v2/protocol.mjs'
import { publicCapabilityOverview, publicCapabilityRegistryMetadata } from './authoring-capability-registry.mjs'
import { publicControlRegistryMetadata } from './authoring-control-registry.mjs'
import { publicVerificationPolicy } from './verification-policy.mjs'

// Increment whenever the server-advertised public tool records change,
// including descriptions or metadata covered by PUBLIC_TOOL_SCHEMA_DIGEST_COVERAGE.
// The capability registry has its own independent revision and digest.
export const TOOL_SCHEMA_VERSION = '2026-10-25.1'
const PACKAGE_SEMANTIC_VERSION = String(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || '').trim()
const CONFIGURED_SEMANTIC_VERSION = String(process.env.BETTERPPTX_PUBLIC_VERSION || '').trim()
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(PACKAGE_SEMANTIC_VERSION)) {
	throw new Error(`BetterPPTX package.json contains an invalid semantic release version: ${PACKAGE_SEMANTIC_VERSION || '(empty)'}`)
}
if (CONFIGURED_SEMANTIC_VERSION && CONFIGURED_SEMANTIC_VERSION !== PACKAGE_SEMANTIC_VERSION) {
	throw new Error(`BETTERPPTX_PUBLIC_VERSION (${CONFIGURED_SEMANTIC_VERSION}) must match package.json (${PACKAGE_SEMANTIC_VERSION}). Update the release version at its authoritative package source.`)
}
export const PUBLIC_SEMANTIC_VERSION = PACKAGE_SEMANTIC_VERSION
export const PUBLIC_SCHEMA_CHANGE = Object.freeze({
	previousToolSchemaVersion: '2026-10-23.2',
	compatibility: 'breaking',
	changes: [
		'betterpptx.narration.synthesize is renamed betterpptx.narration.get_voice_timing; the previous name still resolves but is no longer listed.',
		'Talking-head video, custom presenter personas and stock 3-D models are built by betterpptx.deck.generate_from_spec: slides[].avatarNarration and the new presenter.persona.fromImages render during phase:"resolve", and model3d blocks resolve a stock query at commit. betterpptx.avatar.render_job, avatar.job_status, avatar.attach_result, assets.generate_model3d and assets.generate_rigged3d are no longer public tools.',
		'Identity media rendered through phase:"resolve" draws on the same rolling identity-media allowance as the former standalone routes.',
	],
})
export const PUBLIC_CAPABILITY_DIGEST_COVERAGE = 'Canonical SHA-256 over all stable public family fields and contracts, extended layers, persona terminology/contracts, motion, narration, and combined examples; live readiness and measured inventories are excluded.'
export const PUBLIC_TOOL_SCHEMA_DIGEST_COVERAGE = 'Canonical SHA-256 over each server-advertised public tool record: name, title, description, inputSchema, outputSchema, and public tool metadata.'

export function advertisedPublicTools(options = {}) {
	return publicToolList(TOOLS, options)
}

// The public tool/capability manifest is immutable for the lifetime of a
// server process.  Rebuilding it on every /health and / response made a cold
// public process spend several seconds (and sometimes tens of seconds) before
// replying to a connector preflight.  Cache by the only input that changes the
// published surface so Role-A clients get deterministic discovery latency.
const publicManifestCache = new Map()

export function publicCapabilityDigest(tools = advertisedPublicTools()) {
	const canonical = value => {
		if (Array.isArray(value)) return value.map(canonical)
		if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
		return value
	}
	const payload = tools
		.map(tool => canonical(tool))
		.sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')))
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function publicBuildIdentity(tools, capabilityRegistry, controlRegistry) {
	return `bpptx_build_${createHash('sha256').update(JSON.stringify({
		semanticVersion: PUBLIC_SEMANTIC_VERSION,
		toolSchemaVersion: TOOL_SCHEMA_VERSION,
		advertisedToolSchemaDigest: publicCapabilityDigest(tools),
		capabilityContentDigest: capabilityRegistry.capabilityContentDigest,
		capabilityControlDigest: controlRegistry.capabilityControlDigest,
	})).digest('hex')}`
}

export function publicRuntimeManifest(options = {}) {
	const cacheKey = String(options.toolNameProfile || '')
	const cached = publicManifestCache.get(cacheKey)
	if (cached) return cached
	const tools = advertisedPublicTools(options)
	const capabilityRegistry = publicCapabilityRegistryMetadata()
	const controlRegistry = publicControlRegistryMetadata()
	const observedAt = new Date().toISOString()
	const upload = tools.find(tool => tool.name === 'betterpptx.assets.upload')
	const inspect = tools.find(tool => tool.name === 'betterpptx.assets.inspect')
	const recipe = tools.find(tool => tool.name === 'betterpptx.help.tool_recipe')
	const uploadProps = upload?.inputSchema?.properties || {}
	const accepts = ['file', 'data', 'url'].filter(key => Boolean(uploadProps[key]))
	const advertisedToolSchemaDigest = publicCapabilityDigest(tools)
	const buildIdentity = publicBuildIdentity(tools, capabilityRegistry, controlRegistry)
	const configuredSourceDigest = String(process.env.BETTERPPTX_BUILD_SOURCE_DIGEST || '').trim().toLowerCase()
	const manifest = {
		semanticVersion: PUBLIC_SEMANTIC_VERSION,
		toolSchemaVersion: TOOL_SCHEMA_VERSION,
		schemaChange: PUBLIC_SCHEMA_CHANGE,
		buildIdentity,
		sourceIdentity: /^[0-9a-f]{64}$/.test(configuredSourceDigest)
			? { status: 'attested', digest: configuredSourceDigest }
			: { status: 'not-attested', digest: null },
		capabilityContentDigest: capabilityRegistry.capabilityContentDigest,
		capabilityControlDigest: controlRegistry.capabilityControlDigest,
		controlRegistryVersion: controlRegistry.registryVersion,
		authoringLessonCount: controlRegistry.lessonCount,
		capabilityContentDigestCoverage: PUBLIC_CAPABILITY_DIGEST_COVERAGE,
		advertisedToolSchemaDigest,
		advertisedToolSchemaDigestCoverage: PUBLIC_TOOL_SCHEMA_DIGEST_COVERAGE,
		verificationPolicy: publicVerificationPolicy(),
		observedAt,
		capabilityDiscovery: publicCapabilityDiscovery(options),
		cache: {
			scope: 'server-process',
			key: String(options.toolNameProfile || ''),
			staleCheck: 'Compare semanticVersion, toolSchemaVersion, capabilityContentDigest, capabilityControlDigest, and advertisedToolSchemaDigest with a fresh tools/list response.',
		},
		uploadAvailable: Boolean(upload && uploadProps.file && uploadProps.data && uploadProps.url),
		inspectAvailable: Boolean(inspect),
		visualReferenceRecipeAvailable: Boolean(recipe),
		htmlConversionRecipeAvailable: Boolean(recipe),
		authoringRoutes: {
			principal: 'visualReference-ai',
			secondary: 'htmlConversion-secondary',
			g6bAiReconstructionEligible: ['visualReference-ai'],
		},
		uploadSchema: {
			file: Boolean(uploadProps.file),
			data: Boolean(uploadProps.data),
			url: Boolean(uploadProps.url),
			connectorFileParam: Array.isArray(upload?._meta?.['openai/fileParams'])
				&& upload._meta['openai/fileParams'].includes('file'),
			accepts,
		},
		mcpProtocol: publicMcpProtocolManifest(),
	}
	publicManifestCache.set(cacheKey, manifest)
	return manifest
}

export function publicServerVersion() {
	const manifest = publicRuntimeManifest()
	return `${manifest.semanticVersion}+${manifest.toolSchemaVersion}`
}

export const IMPLEMENTED_VISUAL_CAPABILITIES = Object.freeze([
	'parameterized-native-visual-primitives',
	'native-atmosphere-decomposition',
	'native-visual-fidelity-ledger',
	'picture-corrections-duotone-grayscale',
	'picture-adjustments-brightness-contrast-grayscale-duotone',
	'picture-saturation-temperature-recolor-real-sharpness',
	'picture-artistic-effects-all-persistent-sliders-parameterized',
	'native-shape-effect-list-blur-shadow-glow-reflection-softedge-filloverlay',
	'native-picture-effect-list-shadow-glow-reflection-softedge',
	'native-picture-effect-list-blur-filloverlay-powerpoint-reopen-certified',
	'native-picture-border-and-3d',
	'native-picture-transparency-top-level-and-adjustment-group',
	'native-preset-texture-fills',
	'generated-tile-textures',
	'native-media-caption-tracks',
	'native-webvtt-captions',
	'closed-caption-track-authoring',
])

export const NOT_PURSUED_CAPABILITIES = Object.freeze([
	'native-effect-graph-authoring',
	'background-removal-live-picture-effect',
])

export const PLANNED_CAPABILITIES = Object.freeze([
	'minimal-unsupported-effect-asset-synthesis',
	'powerpoint-native-visual-reopen-validation',
	'powerpoint-timing-tree-reopen',
	'animated-slideshow-capture',
	'host-loaded-tool-census',
])

export function publicCapabilityDiscovery(options = {}) {
	const published = advertisedPublicTools(options)
	const overview = publicCapabilityOverview({ includeReadiness: false, compact: true })
	const registry = overview.registry
	const controlRegistry = publicControlRegistryMetadata()
	const familyMap = overview.families.map(family => ({
		id: family.id,
		label: family.label,
		status: family.status,
		summary: family.summary,
		implementation: family.implementation,
		publicTools: family.publicTools,
	}))
	return {
		schemaVersion: 'betterpptx.capability-discovery.v2',
		semanticVersion: PUBLIC_SEMANTIC_VERSION,
		toolSchemaVersion: TOOL_SCHEMA_VERSION,
		schemaChange: PUBLIC_SCHEMA_CHANGE,
		buildIdentity: publicBuildIdentity(published, registry, controlRegistry),
		capabilityContentDigest: registry.capabilityContentDigest,
		capabilityControlDigest: controlRegistry.capabilityControlDigest,
		controlRegistryVersion: controlRegistry.registryVersion,
		authoringLessonCount: controlRegistry.lessonCount,
		capabilityContentDigestCoverage: PUBLIC_CAPABILITY_DIGEST_COVERAGE,
		advertisedToolSchemaDigest: publicCapabilityDigest(published),
		advertisedToolSchemaDigestCoverage: PUBLIC_TOOL_SCHEMA_DIGEST_COVERAGE,
		observedAt: new Date().toISOString(),
		discoverWith: 'betterpptx.help.capabilities',
		inventory: {
			registeredFamilyCount: registry.familyCount,
			serverAdvertisedToolCount: published.length,
			callerAuthorizedToolCount: null,
			connectorObservedToolCount: null,
		},
		visibility: {
			serverAdvertised: true,
			callerAuthorized: 'unknown-until-auth-status',
			connectorObserved: 'unknown-until-tools-list',
			cache: 'caller caches are valid only while both public digests match',
		},
		authorization: {
			status: 'not-observed',
			checkWith: 'betterpptx.auth.status',
			note: 'Tool visibility is server-advertised; entitlement and caller-specific execution rights are reported by the authorization check.',
		},
		familyMap,
		personaCapabilities: overview.personaCapabilities,
		contentRepresentation: overview.contentRepresentation,
		extendedLayers: overview.extendedLayers.map(layer => ({ id: layer.id, label: layer.label, includes: layer.includes })),
		motion: { family: 'motion-transitions-morph', firstClass: true, discoverWith: 'betterpptx.authoring.catalog', recipe: { tool: 'betterpptx.help.tool_recipe', request: { surface: 'animation', detail: 'full' } } },
		narration: { family: 'media-images-avatar', firstClass: true, discoverWith: 'betterpptx.narration.voices', readiness: ['catalog', 'synthesis-runtime', 'environment-mode', 'production-approval', 'caller-authorized'] },
		verificationPolicy: publicVerificationPolicy(),
		callableTools: published.map(tool => tool.name),
		implementedCapabilities: [...IMPLEMENTED_VISUAL_CAPABILITIES],
		notPursuedCapabilities: [...NOT_PURSUED_CAPABILITIES],
		note: 'This public inventory describes product capabilities only. Runtime and service component details are intentionally unavailable. Current runtime readiness is reported only by the focused capability call that checks it.',
	}
}
