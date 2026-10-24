// Public endpoint hardening. In black-box mode the MCP surface should expose
// presentation capabilities, not server internals, local paths, or source files.

import { createHash } from 'node:crypto'
import { toolSecuritySchemes } from './auth/tool-security.mjs'
import { compactPublicTool } from './public-schema-compaction.mjs'
import { publicRuntimeValidationError, publicRuntimeValidationMessage } from './public-runtime-validation-error.mjs'

import { canonicalToolName, toolListForNameProfile } from './tools.mjs'
import { SHAPE_FORMATTING_SCHEMA } from './native-formatting-contract.mjs'
import { WORDART_TRANSFORM_PUBLIC_SCHEMA } from './wordart-transform-contract.mjs'
import { TEXT_3D_PUBLIC_SCHEMA } from './wordart-text3d-contract.mjs'
import { TEXT_FILL_PUBLIC_SCHEMA } from './text-fill-contract.mjs'
import { HYPERLINK_PUBLIC_SCHEMA } from './hyperlink-entry-contract.mjs'
import { cuesToSynthesisSegments } from './narration/tts-text.mjs'
import { isPublishedArtifactDownloadPair } from './storage/artifact-store.mjs'
import {
	HEADER_FOOTER_POLICY_SCHEMA,
	LAYOUT_MARGIN_SCHEMA,
	LAYOUT_OWNED_OBJECT_SCHEMA,
	LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA,
	SLIDE_NUMBER_FIELD_SCHEMA,
} from './layout-placeholder-variants-contract.mjs'

const SHAPE_FORMATTING_PUBLIC_SCHEMA = JSON.parse(JSON.stringify(SHAPE_FORMATTING_SCHEMA))
const WORDART_SCHEMA = JSON.parse(JSON.stringify(WORDART_TRANSFORM_PUBLIC_SCHEMA))
const TEXT_3D_SCHEMA = JSON.parse(JSON.stringify(TEXT_3D_PUBLIC_SCHEMA))

const PUBLIC_PRODUCT_NAME = process.env.BETTERPPTX_PUBLIC_PRODUCT || process.env.BETTERPPTX_PUBLIC_BRAND || 'BetterPPTX'

export function isLocalMaintainerMode() {
	return process.env.BETTERPPTX_LOCAL_MAINTAINER === '1'
}

export function isPublicBlackBoxMode() {
	if (isLocalMaintainerMode() && (process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '0' || process.env.BETTERPPTX_BLACK_BOX === '0')) return false
	return process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '1' || process.env.BETTERPPTX_BLACK_BOX === '1'
}

export const PUBLIC_PRODUCT_TOOLS = new Set([
	'price-listing',
	'pricing-listing',
	'payment-methods',
	'make-purchase',
	'betterpptx.help.capabilities',
	'betterpptx.help.workflow',
	'betterpptx.help.tool_recipe',
	'betterpptx.options.catalog',
	'betterpptx.authoring.capabilities',
	'betterpptx.authoring.catalog',
	'betterpptx.auth.status',
	'betterpptx.auth.get_profile',
	'betterpptx.auth.activate_key',
	'betterpptx.billing.explain_plan',
	'betterpptx.billing.portal',
	'betterpptx.billing.payment_options',
	'betterpptx.billing.redeem_promo',
	'betterpptx.operation.status',
	'betterpptx.operation.read_file',
	'betterpptx.operation.recent',
	'betterpptx.billing.estimate',
	'betterpptx.billing.usage_summary',
	'betterpptx.billing.job_status',
	'betterpptx.status',
	'betterpptx.motion.candidates.list',
	'betterpptx.motion.candidates.get',
	'betterpptx.motion.preparation_profiles.list',
	'betterpptx.motion.prepare_variant',
	'betterpptx.chart.recommend',
	'betterpptx.table.recommend',
	'betterpptx.equation.catalog',
	'betterpptx.smartart.catalog',
	'betterpptx.narration.voices',
	'betterpptx.narration.get_voice_timing',
	'betterpptx.avatar.render_job',
	'betterpptx.avatar.job_status',
	'betterpptx.avatar.attach_result',
	'betterpptx.deck.new',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.recent',
	'betterpptx.deck.director_status',
	'betterpptx.deck.define_message_architecture',
	'betterpptx.deck.assign_slide_roles',
	'betterpptx.deck.define_design_system',
	'betterpptx.deck.set_show_settings',
	'betterpptx.deck.define_master',
	'betterpptx.deck.define_layout',
	'betterpptx.deck.autoplay',
	'betterpptx.deck.add_narration',
	'betterpptx.deck.add_avatar_narration',
	'betterpptx.deck.summary',
	'betterpptx.deck.preview',
	'betterpptx.deck.sections',
	'betterpptx.deck.export_spec',
	'betterpptx.spec.export_bundle',
	'betterpptx.bundle.inspect',
	'betterpptx.bundle.import',
	'betterpptx.deck.revise',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_design',
	'betterpptx.deck.validate_accessibility',
	'betterpptx.deck.validate_quality',
	'betterpptx.deck.validate_native_visuals',
	'betterpptx.deck.validate_narration',
	'betterpptx.deck.validate_avatar_narration',
	'betterpptx.deck.save',
	'betterpptx.deck.dispose',
	'betterpptx.deck.open_uploaded',
	'betterpptx.slide.add',
	'betterpptx.slide.set_transition',
	'betterpptx.slide.inspect',
	'betterpptx.slide.preview',
	'betterpptx.slide.update',
	'betterpptx.slide.duplicate',
	'betterpptx.slide.delete',
	'betterpptx.slide.reorder',
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_equation',
	'betterpptx.slide.update_equation',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_smartart',
	'betterpptx.slide.add_image',
	'betterpptx.slide.add_chart',
	'betterpptx.slide.add_table',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_narration',
	'betterpptx.slide.add_avatar_narration',
	'betterpptx.slide.add_model3d',
	'betterpptx.slide.add_freeform',
	'betterpptx.slide.add_ink',
	'betterpptx.slide.add_laser_pointer',
	'betterpptx.slide.add_notes',
	'betterpptx.slide.list_shapes',
	'betterpptx.slide.revise',
	'betterpptx.slide.update_shape',
	'betterpptx.slide.delete_shapes',
	'betterpptx.slide.reorder_shape',
	'betterpptx.slide.update_table',
	'betterpptx.slide.update_chart',
	'betterpptx.slide.update_smartart',
	'betterpptx.slide.update_media',
	'betterpptx.slide.animate_shapes',
	'betterpptx.deck.transform_shapes',
	'betterpptx.deck.set_transitions_all',
	'betterpptx.assets.catalog',
	'betterpptx.assets.search_stock',
	'betterpptx.custom_geometry.catalog',
	'betterpptx.custom_geometry.inspect',
	'betterpptx.custom_geometry.insert',
	'betterpptx.custom_geometry.from_svg',
	'betterpptx.custom_geometry.insert_svg',
	'betterpptx.assets.generate_model3d',
	'betterpptx.assets.generate_rigged3d',
	'betterpptx.sketchfab.search',
	'betterpptx.sketchfab.inspect',
	'betterpptx.sketchfab.import',
])

export const PUBLIC_BLACK_BOX_BLOCKED_TOOLS = new Set([
	'betterpptx.version',
	'betterpptx.deck.load_template',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.analyze_reference',
	'betterpptx.deck.recreate_reference',
	'betterpptx.deck.compare_reference',
	'betterpptx.deck.audit_layouts',
	'betterpptx.deck.inspect_layouts',
	'betterpptx.deck.editability_report',
	'betterpptx.slide.inspect_shapes',
	'betterpptx.slide.passthrough_xml',
	'betterpptx.io.read_file',
	'betterpptx.io.write_file',
	'betterpptx.io.list_dir',
	'betterpptx.io.read_json',
	'betterpptx.fs.find',
	'betterpptx.http.fetch',
	'betterpptx.image.sample_palette',
	'betterpptx.geometry.polygon_to_custgeom',
	'betterpptx.geometry.simplify_path',
	'betterpptx.library.list_xml_groups',
	'betterpptx.library.import_xml_group',
	'betterpptx.deck.list',
])

export const PUBLIC_SPEC_FIRST_TOOLS = new Set([
	'price-listing',
	'pricing-listing',
	'payment-methods',
	'make-purchase',
	'betterpptx.help.capabilities',
	'betterpptx.help.workflow',
	'betterpptx.help.tool_recipe',
	'betterpptx.options.catalog',
	'betterpptx.authoring.capabilities',
	'betterpptx.authoring.catalog',
	'betterpptx.auth.status',
	'betterpptx.auth.get_profile',
	'betterpptx.auth.activate_key',
	'betterpptx.billing.explain_plan',
	'betterpptx.billing.portal',
	'betterpptx.billing.payment_options',
	'betterpptx.billing.redeem_promo',
	'betterpptx.operation.status',
	'betterpptx.operation.read_file',
	'betterpptx.operation.recent',
	'betterpptx.billing.estimate',
	'betterpptx.billing.usage_summary',
	'betterpptx.billing.job_status',
	'betterpptx.status',
	'betterpptx.motion.candidates.list',
	'betterpptx.motion.candidates.get',
	'betterpptx.motion.preparation_profiles.list',
	'betterpptx.motion.prepare_variant',
	'betterpptx.chart.recommend',
	'betterpptx.table.recommend',
	'betterpptx.equation.catalog',
	'betterpptx.smartart.catalog',
	'betterpptx.narration.voices',
	'betterpptx.narration.get_voice_timing',
	// Talking-head video, custom presenter personas and stock 3D models are
	// built by deck.generate_from_spec itself (phase:"resolve" and commit), so
	// their standalone media routes are internal and not listed.
	'betterpptx.assets.upload',
	'betterpptx.assets.inspect',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.recent',
	'betterpptx.deck.director_status',
	'betterpptx.deck.export_spec',
	'betterpptx.spec.export_bundle',
	'betterpptx.bundle.inspect',
	'betterpptx.bundle.import',
	'betterpptx.deck.summary',
	'betterpptx.deck.preview',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_design',
	'betterpptx.deck.validate_accessibility',
	'betterpptx.deck.validate_quality',
	'betterpptx.deck.validate_native_visuals',
	'betterpptx.deck.validate_narration',
	'betterpptx.deck.validate_avatar_narration',
	'betterpptx.deck.save',
	'betterpptx.deck.dispose',
	'betterpptx.deck.open_uploaded',
	'betterpptx.assets.catalog',
	'betterpptx.assets.search_stock',
	'betterpptx.custom_geometry.catalog',
])

export function isPublicSpecFirstOnly() {
	return isPublicBlackBoxMode() && process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY === '1'
}

// JSON-spec is the ONLY authoring path on every AI interface — maintainer, public,
// stdio, HTTP, all of them. Primitive authoring tools and pre-compiler staging
// mutators are never listed or callable. The spec compiler still uses private
// handlers internally, below the MCP dispatch boundary. This is deliberately
// unconditional: no environment variable or maintainer mode can restore the old
// primitive surface.
export function jsonSpecOnlyMode() {
	return true
}

export function isPublicToolAllowed(name) {
	const canonical = canonicalToolName(name)
	if (['price-listing', 'pricing-listing', 'payment-methods', 'make-purchase', 'betterpptx.billing.job_status'].includes(canonical) &&
		process.env.BETTERPPTX_MONETIZED_MCP_ENABLED !== '1') return false
	// Enforced in ALL modes: only the json-spec authoring + lifecycle/validation/
	// discovery surface is available to any AI client.
	return PUBLIC_SPEC_FIRST_TOOLS.has(canonical)
}

export function assertPublicToolAllowed(name) {
	if (!isPublicToolAllowed(name)) {
		throw new Error('Authoring is json-spec only on this interface: build and compile a deck with betterpptx.deck.generate_from_spec. Primitive slide/deck tools are not exposed.')
	}
}

// Sanitizing the full tool inventory costs ~1.5 s, and every tools/list,
// /health and discovery response needs it. The result depends only on the
// tool array, the options, and BETTERPPTX_* configuration, so memoize on those.
const publicToolListCache = new WeakMap()

function publicToolListCacheKey(options) {
	const env = Object.keys(process.env).filter(name => name.startsWith('BETTERPPTX_')).sort().map(name => `${name}=${process.env[name]}`)
	return JSON.stringify([Boolean(options.fullSchemas), options.toolNameProfile || '', env])
}

export function publicToolList(tools, options = {}) {
	let byKey = publicToolListCache.get(tools)
	if (!byKey) publicToolListCache.set(tools, byKey = new Map())
	const key = publicToolListCacheKey(options)
	if (!byKey.has(key)) byKey.set(key, buildPublicToolList(tools, options))
	return byKey.get(key)
}

function buildPublicToolList(tools, options) {
	const filtered = tools.filter(t => isPublicToolAllowed(t.name))
	const visibleTools = isPublicBlackBoxMode() ? filtered.map(sanitizePublicTool) : filtered
	const authenticatedTools = isPublicBlackBoxMode() || process.env.BETTERPPTX_AUTH === 'oauth'
		? visibleTools.map(tool => {
			const securitySchemes = toolSecuritySchemes(canonicalToolName(tool.name))
			return { ...tool, securitySchemes, _meta: { ...tool._meta, securitySchemes } }
		}) : visibleTools
	// tools/list advertises bounded schemas; options.fullSchemas returns the
	// complete public contract for on-demand lookup (help.tool_recipe schemaFor).
	const advertised = options.fullSchemas ? authenticatedTools : authenticatedTools.map(compactPublicTool)
	return toolListForNameProfile(advertised, options.toolNameProfile)
}

export function toPublicToolName(name) {
	return String(name || '')
}

export function toInternalToolName(name) {
	return canonicalToolName(name)
}

export function isLegacyPublicToolName(name) {
	return false
}

// Every rewrite rule below requires at least one of these substrings, so any
// string with no trigger can skip the full replace chain (the common case for
// object names, digests, ids, and other response payload strings).
const SANITIZE_TRIGGER = /polar|dodo|mcp|self-contained|pptx engine|ooxml|office math|raw xml|gltf|glb|rasterfile|disk|absolute|cwd|server|filesystem|local file|catalog|token-friendly|transitions|inventor|ledger|matrix|preset|option name|source policy|frozen reference|decypher|comparator|text boxes|uploaded or existing|endpoint health|maintainer-local|source code|PPTX_ULTIMATE_DECYPHER_TOOL|engine\.mjs|spec-compiler|node_modules|dist[\\/]node|src[\\/]|gen:|flux|klein|black[-\\s]?forest[-\\s]?labs|huggingface|modal|l40s|workers[\\s-]+ai|dependenc(?:y|ies)|express(?:ive)?|primitive|restoreformer|liveportrait|musetalk|x-pipeline|x-enhancement|x-restoreformer|providerexecution|raw headers?/i

function normalizedPublicKey(key) {
	return String(key || '').replace(/[_-]/g, '').toLowerCase()
}

function isHiddenPublicKey(key, hiddenKeys) {
	if (hiddenKeys.has(key)) return true
	const normalized = normalizedPublicKey(key)
	if ([...hiddenKeys].some(candidate => normalizedPublicKey(candidate) === normalized)) return true
	// Providers and runtime provenance are private even when an adapter changes its
	// spelling (model_revision, providerName, gpu_type, etc.). Keep opaque asset
	// handles separate; those are handled explicitly by the result sanitizer.
	if (/^(provider|runner|host|gputype|gpuseconds|coldstart|license|licenses|spdx|commercialuse|attributionrequired|reviewstatus|provenance|sourcepolicy|workdir|rawxml)/.test(normalized)) return true
	// Opaque model assets and public native Model 3D View selectors are part of
	// the documented authoring contract. Keep them while continuing to suppress
	// provider/model provenance fields such as model, modelRevision, and modelName.
	if (normalized.startsWith('model') && !['modelasset', 'model3dviewpresetid'].includes(normalized)) return true
	return false
}

export function publicCatalogAssetHandle(value, kind = 'asset') {
	const safeKind = String(kind || 'asset').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'asset'
	const digest = createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32)
	return `asset://catalog/${safeKind}/${digest}`
}

function redactEmbeddedLocalReferences(value) {
	return String(value)
		.replace(/\bfile:\/\/[^\s"'<>]+/gi, '[private resource]')
		.replace(/(?<![A-Za-z0-9+.-])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]+/g, '[private resource]')
		.replace(/(^|[\s("'=])\/(?:srv|app|tmp|home|Users|usr|var|opt|mnt|workspace|workspaces|root)\/[^\s"'<>)]*/g, '$1[private resource]')
}

function sanitizeStringForPublic(value) {
	// The local registry retains compatibility descriptions for maintainers. At
	// the public boundary, every construction/editing reference must point back
	// to the governed semantic compiler and implementation-specific vocabulary
	// must collapse to a product capability.
	let text = redactEmbeddedLocalReferences(publicRuntimeValidationMessage(value))
		.replace(/\bPptxGenJS\b/gi, 'the presentation service')
		.replace(/\bpptx\.validate\([^\r\n]*?\)/gi, 'betterpptx.deck.validate_quality')
		.replace(/\b(?:betterpptx\.)?deck\.new\b/gi, 'betterpptx.deck.generate_from_spec')
		.replace(/\b(?:betterpptx\.)?slide\.(?:add|update|revise|delete|reorder|animate|set_transition)[a-z0-9_.]*/gi, 'betterpptx.deck.generate_from_spec')
		.replace(/\b(?:betterpptx\.)?custom_geometry\.(?:insert|insert_svg)\b/gi, 'betterpptx.deck.generate_from_spec')
		.replace(/model3d:\/\/(?:microsoft-stock|sketchfab|open-3d(?:-quality)?|khronos|premium|reference)\/[a-z0-9._~:/%-]+/gi, match => publicCatalogAssetHandle(match, 'model3d'))
		.replace(/\bsvgpath\b/gi, 'the vector-path converter')
		.replace(/\bMeshy\s*(?:→|->|to)\s*Mixamo\b/gi, 'the managed 3D generation route')
		.replace(/\b(?:Meshy|Mixamo)\b/gi, 'managed 3D service')
		.replace(/\bSketchfab\b/gi, 'public 3D catalog')
		.replace(/\b(?:Openverse|Pexels|Pixabay)\b/gi, 'licensed visual catalog')
		.replace(/\bFreesound\b/gi, 'licensed audio catalog')
		.replace(/\b(?:ElevenLabs|Polly)\b/gi, 'managed narration service')
		.replace(/\bBaker\b/g, 'the managed motion service')
		.replace(/\bself-hosted\s+(?:single-image\s+)?PoC(?:\/flow-test)?\b/gi, 'non-production route')
		.replace(/\bPoC\/flow-test\b/gi, 'non-production route')
		.replace(/\bprivate\s+(?:independent\s+)?semantic-quality review\b/gi, 'independent semantic-quality review')
		.replace(/\bprivate repair worker\b/gi, 'bounded repair review')
		.replace(/\bclipMap\b/g, 'semantic motion map')
		.replace(/\b_synergyPlan\b/gi, 'semantic interaction plan')
		.replace(/\bclipTimelines\b/gi, 'semantic timing plan')
		.replace(/\bplayScene\b/gi, 'presenter scene')
		.replace(/\bengineRoute\b/gi, 'execution route')
		.replace(/\bcompiledAs\b/gi, 'realized as')
		.replace(/\bnativePackage\b/gi, 'presentation package')
		.replace(/\bnativeTiming\b/gi, 'presentation timing')
		.replace(/\bTO_SOURCE\b/g, 'NOT_AVAILABLE')
		.replace(/\bproviderExecution[a-z0-9_]*\b/gi, 'service operation')
		.replace(/\b(?:sourceXmlPath|packagePath)\b/gi, 'internal resource reference')
	if (/\bopaqueNative(?: preservation blocks?| block)?\b/i.test(text)) {
		return text.replace(/\bopaqueNative(?: preservation blocks?| block)?\b/gi, 'raw native-preservation blocks')
	}
	if (/\braw XML\b/i.test(text)) {
		return text.replace(/\braw XML\b/gi, 'low-level markup')
	}
	if (!SANITIZE_TRIGGER.test(text)) return text
	return text
		.replace(/\bPolar\.sh or Dodo Payments\b/gi, 'the payment provider')
		.replace(/\bPolar or Dodo\b/gi, 'the payment provider')
		.replace(/\bPolar\/Dodo\b/gi, 'the payment provider')
		.replace(/\bPolar\b/g, 'payment provider')
		.replace(/\bDodo Payments\b/g, 'payment provider')
		.replace(/\bDodo\b/g, 'payment provider')
		.replace(/(?<![A-Za-z0-9_])gen:\/\/(?:trellis|unirig|flux|modal|black[-.]forest[-.]labs|huggingface|workers[-.]?ai)(?:\/|:)[^\s"'<>]*/gi, 'opaque asset handle')
		.replace(/\bFLUX(?:[.\s-]?(?:1|2))?(?:[.\s-]?(?:Schnell|Klein))?(?:[.\s-]?(?:4B|9B))?\b/gi, 'image-generation model')
		.replace(/\bblack[-\s]?forest[-\s]?labs\b/gi, 'model publisher')
		.replace(/\bHugging[\s-]?Face\b/gi, 'model registry')
		.replace(/\bWorkers[\s-]+AI\b/gi, 'managed compute service')
		.replace(/\bModal\b/gi, 'private compute service')
		.replace(/\bL40S\b/gi, 'GPU')
		.replace(/\bmodel provider\b/gi, 'image service')
		.replace(/\bdependenc(?:y|ies)\b/gi, match => match.toLowerCase() === 'dependencies' ? 'service components' : 'service component')
		.replace(/\bexpress intent\b/gi, 'describe intent')
		.replace(/\bexpressive\b/gi, 'clear')
		.replace(/\bExpress\.js\b/gi, 'web service')
		.replace(/\bExpress\s+(?:server|framework|app|middleware)\b/gi, 'web service')
		.replace(/\bexpress\b/gi, 'describe')
		.replace(/\bsource code\b/gi, 'implementation details')
		.replace(/\bMCP session\b/gi, 'current session')
		.replace(/\bMCP server\b/gi, 'presentation service')
		.replace(/\bUltimate decypher model export failed\b/gi, 'Presentation analysis failed')
		.replace(/\bUltimate decypher failed\b/gi, 'Presentation analysis failed')
		.replace(/\bPPTX_ULTIMATE_DECYPHER_TOOL(?:\.mjs)?\b/gi, 'the presentation analysis service')
		.replace(/\bwas not found in the current project or package root\b/gi, 'is currently unavailable')
		.replace(/\bengine\.mjs\b/gi, 'the presentation service')
		.replace(/\bspec-compiler\.mjs\b/gi, 'the spec compiler')
		.replace(/\bnode_modules\b/gi, 'service internals')
		.replace(/\bdist[\\/]node\b/gi, 'service internals')
		.replace(/\bsrc[\\/]/gi, '')
		.replace(/\bself-contained\b/gi, 'full-featured')
		.replace(/\bPPTX engine\b/gi, 'PPTX feature set')
		.replace(/\bnative OOXML chart\b/gi, 'presentation chart')
		.replace(/\bnative Office Math XML\b/gi, 'editable equation format')
		.replace(/\braw XML\b/gi, 'low-level markup')
		.replace(/\bbinary glTF \(\.glb\)\b/gi, '3D model')
		.replace(/\bglTF \(\.glb\)\b/gi, '3D model')
		.replace(/\bGLB\b/g, '3D model')
		.replace(/\bglbFile\b/g, 'modelAsset')
		.replace(/\brasterFile\b/g, 'posterAsset')
		.replace(/\braw OOXML\b/gi, 'advanced package markup')
		.replace(/\bOOXML\b/g, 'package markup')
		.replace(/\bSave deck to disk\b/gi, 'Save deck')
		.replace(/\bwrite the \.pptx to disk\b/gi, 'export the .pptx')
		.replace(/\bReturns absolute file path plus\b/gi, 'Returns a download link plus')
		.replace(/\bor absolute path\b/gi, '')
		.replace(/\bin CWD\b/gi, 'in the default output area')
		.replace(/\bCWD\b/g, 'default output area')
		.replace(/\bserver-side path\b/gi, 'opaque asset handle')
		.replace(/\bserver-side\b/gi, 'by the service')
		.replace(/\bserver filesystem path is required or exposed\b/gi, 'local file path is required')
		.replace(/\bno local file path is required\b/gi, 'uploaded bytes are used directly')
		.replace(/\bserver filesystem\b/gi, 'local file storage')
		.replace(/\bFilesystem path\b/g, 'Opaque asset reference')
		.replace(/\blocal filesystem\b/gi, 'server internals')
		.replace(/\bReturn a compact catalog\b/gi, 'Return a concise summary')
		.replace(/\bReturn token-friendly canonical option values, safe aliases, and correction guidance[^.]*\./gi, 'Return concise guidance for presentation options.')
		.replace(/\bAll \d+\+ PowerPoint transitions[^.]*\./gi, 'Presentation transitions with timing controls.')
		.replace(/\b\d+-layout PowerPoint catalog\b/gi, 'PowerPoint SmartArt authoring')
		.replace(/\bfull-catalog-authoring\b/gi, 'available')
		.replace(/\bfull feature inventories?\b/gi, 'capability summaries')
		.replace(/\bcapability ledger\b/gi, 'capability summary')
		.replace(/\bcoverage matrix\b/gi, 'capability summary')
		.replace(/\bpreset ID map\b/gi, 'preset guidance')
		.replace(/\binternal option names?\b/gi, 'presentation options')
		.replace(/\bsource policy\b/gi, 'selection guidance')
		.replace(/\bmatrix artifact paths?\b/gi, 'service internals')
		.replace(/\bfrozen reference\b/gi, 'reference material')
		.replace(/\bdecypher\b/gi, 'analysis')
		.replace(/\bcomparator\b/gi, 'validator')
		.replace(/\bUse text boxes, shapes, images, WordArt, Text3D, 3D models\/3D model, and shape-built SmartArt for the strongest Morph results\./gi, 'Use related visual objects when they naturally serve the story.')
		.replace(/\bPrefer text boxes, shapes, images, WordArt, Text3D, 3D models\/3D model, and shape-built SmartArt only when they naturally serve the deck\./gi, 'Prefer related visual objects only when they naturally serve the deck.')
		.replace(/\bFor uploaded or existing decks, do not add banners, badges, 3D, WordArt, Text3D, SmartArt, charts, or decorative panels merely to satisfy preview coverage\./gi, 'For uploaded or existing decks, do not add decorative objects merely to satisfy preview coverage.')
		.replace(/\bReturn endpoint health and capacity\. Public endpoints return black-box service readiness only; maintainer-local diagnostics may include deeper runtime freshness details\./gi, 'Return service readiness.')
		.replace(/\bMaintainer-local diagnostic option; public endpoints ignore or redact implementation details\./gi, 'Optional diagnostic flag; public responses stay generic.')
		.replace(/\bprimitive-direct\b/gi, 'direct authoring')
		.replace(/\bslide primitives?\b/gi, 'compiled JSON-spec operations')
		.replace(/\bdeck primitives?\b/gi, 'compiled JSON-spec operations')
		.replace(/\bprimitive tool call sequence\b/gi, 'debugging sequence')
		.replace(/\bprimitive handlers?\b/gi, 'engine compilation handlers')
		.replace(/\bpublic primitives?\b/gi, 'the governed JSON-spec compiler')
		.replace(/\bprimitive workflows?\b/gi, 'JSON-spec workflows')
		.replace(/\bprimitive rebuild\b/gi, 'governed JSON-spec rebuild')
		.replace(/\bprimitive authoring\b/gi, 'low-level authoring')
		.replace(/\bprimitive operation\b/gi, 'compiled operation')
		.replace(/\bprimitive\b/gi, 'low-level operation')
		.replace(/\bopaqueNative(?: preservation blocks?| block)?\b/gi, 'raw native-preservation blocks')
		.replace(/\bRestoreFormer\+\+/gi, 'avatar quality enhancement')
		.replace(/\bLivePortrait\b/gi, 'avatar animation service')
		.replace(/\bMuseTalk\b/gi, 'lip-sync service')
		.replace(/\bliveportrait[-+ ]musetalk(?:[-+ ]commercial)?(?:[-+ ]restoreformer[-+ ]?pp)?\b/gi, 'avatar rendering service')
		.replace(/\bX-(?:Pipeline|Enhancement|RestoreFormer-(?:Seconds|Segments))\b/gi, 'internal processing header')
}

function sanitizeSchema(value) {
	if (typeof value === 'string') return sanitizeStringForPublic(value)
	if (!value || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(sanitizeSchema)
	const hiddenSchemaKeys = new Set([
		'path',
		'filePath',
		'localPath',
		'downloadPath',
		'assetPath',
		'privateAssetPath',
		'root',
		'outputDir',
		'saveToPath',
		'pptxPath',
		'templatePath',
		'sourcePath',
		'imagePath',
		'glbFile',
		'rasterFile',
		'provider',
		'model',
		'runner',
		'host',
		'gpuType',
		'gpuSeconds',
		'coldStart',
		'license',
		'licenses',
		'spdx',
		'commercialUse',
		'attributionRequired',
		'reviewStatus',
		'tags',
		'capabilityLedger',
		'coverageMatrix',
		'featureInventory',
		'featureMatrix',
		'optionRegistry',
		'presetIdMap',
		'catalogMetadata',
		'catalogContext',
		'catalogResultIndex',
		'resultIndex',
		'sourcePolicy',
		'provenance',
		'searchTokens',
		'categoryAliases',
		'rawTags',
		'nodeNames',
		'morphPreviewCoverage',
		'previewFeatures',
		'preferredObjectKinds',
		'morphFriendlyObjects',
		'includeCandidates',
		'allowUnreviewedVoices',
		'includeEnvironment',
		'includeGitStatus',
		'includeCallPlan',
		'billingOverride',
		'generatedByPrimitiveHandlers',
		'committedObjects',
		'enableIterateEngine',
		'pipeline',
		'avatarPipeline',
		'enhancement',
		'enhancementHeader',
		'restoration',
		'pipelineHeader',
		'xPipeline',
		'xEnhancement',
		'xRestoreformerSeconds',
		'xRestoreformerSegments',
		'restoreFormerSeconds',
		'restoreFormerSegments',
		'providerExecutionId',
		'providerExecutionIds',
		'providerExecutionCount',
		'headers',
		'responseHeaders',
		'rawHeaders',
		'bundleHandle',
		'catalogFingerprint',
		'motionIdToAnimId',
		'sourceSlug',
		'privateEvidence',
		'transplant',
		'engineRoute',
		'compiledAs',
		'nativePackage',
		'nativeTiming',
		'clipTimelines',
		'playScene',
		'animId',
		'framePos',
		'TO_SOURCE',
	])
	const out = {}
	for (const [key, child] of Object.entries(value)) {
		if (isHiddenPublicKey(key, hiddenSchemaKeys)) continue
		out[key] = sanitizeSchema(child)
	}
	return clarifyPublicSchema(out)
}

const NUMBER_OR_PERCENT = {
	description: 'Position or size value: number in inches, or a percentage string such as "50%".',
	oneOf: [
		{ type: 'number', description: 'Value in inches.' },
		{ type: 'string', pattern: '^\\d+(\\.\\d+)?%$', description: 'Percentage value such as "50%".' },
	],
}

const COLOR = { type: 'string', description: 'RGB hex colour without "#", for example "1F2937".' }

const GRADIENT_STOP = {
	type: 'object',
	description: 'Gradient stop. Canonical position is a 0–100 percent value; nested gradient.stops input may also use normalized 0–1 values.',
	properties: {
		color: COLOR,
		position: { type: 'number', minimum: 0, maximum: 100, description: 'Stop position as a percentage from 0 to 100. Step is 0.001 percentage points.' },
		transparency: { type: 'number', minimum: 0, maximum: 100, description: 'Transparency percentage from 0 to 100. Step is 0.001 percentage points.' },
	},
	additionalProperties: true,
}

const GRADIENT_RECT = {
	type: 'object',
	description: 'Gradient rectangle in percentage units. l/t/r/b are independent 0–100 values with 0.001-point steps.',
	properties: {
		l: { type: 'number', minimum: 0, maximum: 100, description: 'Left offset percentage.' },
		t: { type: 'number', minimum: 0, maximum: 100, description: 'Top offset percentage.' },
		r: { type: 'number', minimum: 0, maximum: 100, description: 'Right offset percentage.' },
		b: { type: 'number', minimum: 0, maximum: 100, description: 'Bottom offset percentage.' },
	},
	additionalProperties: false,
}

const PATTERN_SCHEMA = {
	type: 'object',
	description: 'Native PowerPoint pattern fill. Preset is a selector; foreground and background are independent colors.',
	properties: {
		preset: { type: 'string', description: 'Native pattern selector such as pct20, dkUpDiag, dotGrid, or lgCheck.' },
		foreground: COLOR,
		background: COLOR,
	},
	additionalProperties: false,
}

const TEXTURE_PLACEMENT_SCHEMA = {
	type: 'object',
	description: 'Native texture/picture placement controls. Use an opaque public asset handle, generated recipe, or native texture selector as the source.',
	properties: {
		mode: { type: 'string', enum: ['tile', 'stretch'], description: 'Tile or stretch the native texture.' },
		scaleX: { type: 'number', minimum: 0, maximum: 2, description: 'Horizontal tile multiplier; 0.00001 step.' },
		scaleY: { type: 'number', minimum: 0, maximum: 2, description: 'Vertical tile multiplier; 0.00001 step.' },
		offsetX: { type: 'number', minimum: -100, maximum: 100, description: 'Horizontal tile offset in inches; 0.0001-inch step.' },
		offsetY: { type: 'number', minimum: -100, maximum: 100, description: 'Vertical tile offset in inches; 0.0001-inch step.' },
		alignment: { type: 'string', enum: ['tl', 't', 'tr', 'l', 'ctr', 'r', 'bl', 'b', 'br'], description: 'Native tile alignment.' },
		flip: { type: 'string', enum: ['none', 'x', 'y', 'xy'], description: 'Native tile flip.' },
		rotateWithShape: { type: 'boolean', description: 'Whether the texture coordinate system rotates with the shape; native default is true.' },
	},
	additionalProperties: false,
}

const TEXTURE_SCHEMA = {
	type: 'object',
	description: 'Native picture/texture fill. Source is an opaque public asset handle, generated recipe, or native preset selector; placement remains independently editable.',
	properties: {
		source: { type: 'object', description: 'Opaque source descriptor with kind asset, generated, or nativePreset.', additionalProperties: true },
		placement: TEXTURE_PLACEMENT_SCHEMA,
		mode: { type: 'string', enum: ['tile', 'stretch'], description: 'Placement mode alias.' },
		scaleX: { type: 'number', minimum: 0, maximum: 2, description: 'Horizontal tile multiplier alias.' },
		scaleY: { type: 'number', minimum: 0, maximum: 2, description: 'Vertical tile multiplier alias.' },
		offsetX: { type: 'number', minimum: -100, maximum: 100, description: 'Horizontal offset in inches alias.' },
		offsetY: { type: 'number', minimum: -100, maximum: 100, description: 'Vertical offset in inches alias.' },
		alignment: { type: 'string', enum: ['tl', 't', 'tr', 'l', 'ctr', 'r', 'bl', 'b', 'br'], description: 'Alignment alias.' },
		flip: { type: 'string', enum: ['none', 'x', 'y', 'xy'], description: 'Flip alias.' },
		rotateWithShape: { type: 'boolean', description: 'Rotation alias.' },
		transparency: { type: 'number', minimum: 0, maximum: 100, description: 'Texture transparency percentage; 0.001-point step.' },
	},
	additionalProperties: true,
}

const FILL_SCHEMA = {
	type: 'object',
	description: 'Fill style. Use { color } for a solid fill or gradient fields for a gradient fill.',
	properties: {
		color: COLOR,
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		type: { type: 'string', enum: ['solid', 'gradient', 'pattern', 'texture', 'picture'], description: 'Fill type.' },
		gradientStops: { type: 'array', items: GRADIENT_STOP, description: 'Gradient stops.' },
		gradientAngle: { type: 'number', minimum: 0, maximum: 360, description: 'Linear gradient angle in degrees; 0.001-degree step.' },
		gradientDirection: { type: 'string', enum: ['linear', 'circle', 'rect', 'shape'], description: 'Gradient direction/path. radial is accepted as an intent alias for circle.' },
		gradientFlip: { type: 'string', enum: ['none', 'x', 'y', 'xy'], description: 'Gradient tile flip mode.' },
		rotateGradientWithShape: { type: 'boolean', description: 'Whether the gradient rotates with its containing shape; native default is true.' },
		fillToRect: GRADIENT_RECT,
		tileRect: GRADIENT_RECT,
		pattern: PATTERN_SCHEMA,
		texture: TEXTURE_SCHEMA,
	},
	additionalProperties: true,
}

const TEXT_FILL_SCHEMA = JSON.parse(JSON.stringify(TEXT_FILL_PUBLIC_SCHEMA))

const TEXT_OUTLINE_SCHEMA = {
	type: 'object',
	description: 'Text character outline, independent from the containing text-box shape line. Transparency is a 0–100 percent value with a 0.001-point step; widthPt is a 0–100 point value with a 0.001-point step.',
	properties: {
		color: COLOR,
		transparency: { type: 'number', minimum: 0, maximum: 100, description: 'Text outline transparency percentage from 0 to 100; 0.001-point step.' },
		widthPt: { type: 'number', minimum: 0, maximum: 100, description: 'Text outline width in points from 0 to 100; 0.001-point step.' },
	},
	additionalProperties: false,
}

const LINE_SCHEMA = {
	type: 'object',
	description: 'Line or border style.',
	properties: {
		color: COLOR,
		width: { type: 'number', description: 'Line width in points.' },
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		dash: { type: 'string', description: 'Dash style such as "dash" or "dot".' },
		beginArrowType: { type: 'string', description: 'Optional starting arrow style.' },
		endArrowType: { type: 'string', description: 'Optional ending arrow style.' },
	},
	additionalProperties: true,
}

const SHADOW_SCHEMA = {
	type: 'object',
	description: 'Shadow effect.',
	properties: {
		type: { type: 'string', description: 'Shadow type or preset.' },
		color: COLOR,
		opacity: { type: 'number', description: 'Opacity percentage.' },
		blur: { type: 'number', description: 'Blur radius.' },
		angle: { type: 'number', description: 'Shadow angle in degrees.' },
		distance: { type: 'number', description: 'Shadow distance.' },
	},
	additionalProperties: true,
}

const EFFECT_SCHEMA = {
	type: 'object',
	description: 'Visual effect options.',
	properties: {
		color: COLOR,
		size: { type: 'number', description: 'Effect size.' },
		opacity: { type: 'number', description: 'Opacity percentage.' },
		blur: { type: 'number', description: 'Blur radius.' },
		distance: { type: 'number', description: 'Distance or offset.' },
	},
	additionalProperties: true,
}

const TEXT_HYPERLINK_SCHEMA = JSON.parse(JSON.stringify(HYPERLINK_PUBLIC_SCHEMA))

const TEXT_FIELD_SCHEMA = {
	oneOf: [
		{ type: 'null' },
		{ type: 'object', required: ['type'], properties: { id: { type: 'string', pattern: '^\\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\}$' }, type: { type: 'string', minLength: 1, maxLength: 128 } }, additionalProperties: false },
	],
	description: 'Native DrawingML text field. The optional GUID is normalized or generated deterministically before serialization.',
}

const TEXT_BULLET_SCHEMA = {
	oneOf: [
		{ type: 'boolean' },
		{ type: 'null' },
		{
			type: 'object',
			properties: {
				type: { type: ['string', 'null'], enum: ['bullet', 'number', null] },
				glyph: { type: ['string', 'null'], enum: ['DEFAULT', 'CHECK', 'STAR', 'TRIANGLE', null], description: 'Named native glyph; maps to U+2022, U+2713, U+2605, or U+25B6.' },
				characterCode: { type: ['string', 'null'], pattern: '^[0-9A-Fa-f]{4}$' },
				numberType: { type: ['string', 'null'] }, style: { type: ['string', 'null'] },
				numberStartAt: { type: ['integer', 'null'], minimum: 1, maximum: 32767 }, startAt: { oneOf: [{ type: 'integer', minimum: 1, maximum: 32767 }, { type: 'string', pattern: '^[1-9][0-9]{0,4}$' }, { type: 'null' }] },
				indent: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 }, marginPt: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 },
				color: { oneOf: [COLOR, { type: 'null' }] }, font: { type: ['string', 'null'] }, fontSize: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 }, none: { type: ['boolean', 'null'] },
			},
			additionalProperties: false,
		},
	],
}

export const TEXT_RUN_OPTIONS_SCHEMA = {
	type: 'object',
	properties: {
		fontFace: { type: ['string', 'null'], minLength: 1, maxLength: 256 },
		fontFaceComplexScript: { type: ['string', 'null'], minLength: 1, maxLength: 256, description: 'Complex-script a:cs typeface, independent from the Latin face.' },
		fontSize: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400 },
		color: { oneOf: [COLOR, { type: 'null' }] }, transparency: { type: ['number', 'null'], minimum: 0, maximum: 100 },
		bold: { type: ['boolean', 'null'] }, italic: { type: ['boolean', 'null'] }, underline: { type: ['boolean', 'string', 'object', 'null'] },
		strike: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['sngStrike', 'dblStrike'] }, { type: 'null' }] }, highlight: { oneOf: [COLOR, { type: 'null' }] },
		baseline: { type: ['number', 'null'], minimum: -100, maximum: 100, multipleOf: 0.001, description: 'Exact numeric baseline percentage at native 0.001 precision; mutually exclusive with superscript/subscript.' },
		superscript: { type: ['boolean', 'null'] }, subscript: { type: ['boolean', 'null'] }, charSpacing: { type: ['number', 'null'], minimum: -100, maximum: 100, multipleOf: 0.01 },
		lang: { type: ['string', 'null'], minLength: 1, maxLength: 35 }, rtl: { type: ['boolean', 'null'], description: 'Run-level bidirectional flag.' }, rtlMode: { type: ['boolean', 'null'], description: 'Paragraph-level right-to-left mode.' },
		align: { type: ['string', 'null'], enum: ['left', 'center', 'right', 'justify', null] }, breakLine: { type: ['boolean', 'null'] }, softBreakBefore: { type: ['boolean', 'null'], description: 'Insert a native soft line break before this run without creating a paragraph.' }, inline: { type: ['boolean', 'null'], description: 'Compatibility hint; softBreakBefore is canonical.' },
		bullet: TEXT_BULLET_SCHEMA, indent: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 }, hanging: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 }, indentLevel: { type: ['integer', 'null'], minimum: 0, maximum: 8 },
		lineSpacing: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 }, lineSpacingMultiple: { type: ['number', 'null'], minimum: 0, maximum: 9.99 }, paraSpaceBefore: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 }, paraSpaceAfter: { type: ['number', 'null'], minimum: 0, maximum: 400, multipleOf: 0.01 },
		tabStops: { oneOf: [{ type: 'null' }, { type: 'array', maxItems: 32, items: { type: 'object', required: ['position'], properties: { position: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.01 }, alignment: { type: 'string', enum: ['l', 'r', 'ctr', 'dec'] } }, additionalProperties: false } }] },
		hyperlink: TEXT_HYPERLINK_SCHEMA, field: TEXT_FIELD_SCHEMA,
		textFill: TEXT_FILL_SCHEMA, textOutline: { oneOf: [TEXT_OUTLINE_SCHEMA, { type: 'null' }] }, outline: { type: ['object', 'null'] }, textShadow: { oneOf: [SHADOW_SCHEMA, { type: 'null' }] }, textGlow: { oneOf: [EFFECT_SCHEMA, { type: 'null' }] }, glow: { oneOf: [EFFECT_SCHEMA, { type: 'null' }] }, textReflection: { oneOf: [EFFECT_SCHEMA, { type: 'null' }] }, reflection: { oneOf: [EFFECT_SCHEMA, { type: 'null' }] }, text3D: { oneOf: [TEXT_3D_SCHEMA, { type: 'null' }] },
	},
	additionalProperties: false,
}

export const RICH_TEXT_SCHEMA = {
	oneOf: [
		{ type: 'string', maxLength: 1048576 },
		{ type: 'array', minItems: 1, maxItems: 10000, items: { type: 'object', required: ['text'], properties: { text: { type: ['string', 'number'] }, options: TEXT_RUN_OPTIONS_SCHEMA }, additionalProperties: false } },
	],
	description: 'Plain text or closed typed native rich-text runs. Use breakLine for a paragraph and softBreakBefore for Shift+Enter.',
}

const TRANSITION_SCHEMA = {
	type: 'object',
	description: 'Slide transition.',
	properties: {
		type: { type: 'string', description: 'Transition type such as "fade", "push", "wipe", or "morph".' },
		option: { type: 'string', description: 'Transition option, for example Morph uses "byObject", "byWord", or "byChar".' },
		direction: { type: 'string', description: 'Direction such as left, right, up, down, in, or out.' },
		speed: { type: 'string', enum: ['slow', 'medium', 'fast'], description: 'Transition speed.' },
		duration: { type: 'number', description: 'Duration in milliseconds.' },
		p14dur: { type: 'number', description: 'PowerPoint transition duration in milliseconds.' },
		advanceOnClick: { type: 'boolean', description: 'Advance when clicked.' },
		advanceAfterTime: { type: 'number', description: 'Auto-advance delay in milliseconds.' },
	},
	additionalProperties: true,
}

const ANIMATION_SCHEMA = {
	type: 'object',
	description: 'Animation to apply to existing or newly created objects.',
	properties: {
		type: { type: 'string', enum: ['entrance', 'exit', 'emphasis', 'motion', 'media'], description: 'Animation category.' },
		effect: { type: 'string', description: 'Effect name such as fade, fly, wipe, zoom, spin, or growShrink.' },
		trigger: { type: 'string', enum: ['onClick', 'withPrevious', 'afterPrevious'], description: 'Animation trigger.' },
		duration: { type: 'number', description: 'Duration in milliseconds.' },
		delay: { type: 'number', description: 'Delay in milliseconds.' },
		direction: { type: 'string', description: 'Effect direction when applicable.' },
		order: { type: 'number', description: 'Animation order on the slide.' },
	},
	additionalProperties: true,
}

const SIZING_SCHEMA = {
	type: 'object',
	description: 'Image sizing policy.',
	properties: {
		type: { type: 'string', enum: ['contain', 'cover', 'crop'], description: 'How the image fits its box.' },
		x: NUMBER_OR_PERCENT,
		y: NUMBER_OR_PERCENT,
		w: NUMBER_OR_PERCENT,
		h: NUMBER_OR_PERCENT,
	},
	additionalProperties: true,
}

const PICTURE_COLOR_ENDPOINT_SCHEMA = {
	oneOf: [
		{ type: 'string', description: 'Hex, named/preset, or opaque Office color token.' },
		{
			type: 'object',
			description: 'One editable DrawingML color endpoint plus continuous transforms.',
			properties: {
				color: { type: 'string' },
				scheme: { type: 'string', enum: ['tx1', 'tx2', 'bg1', 'bg2', 'dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink', 'phClr'] },
				preset: { type: 'string' },
				tint: { type: 'number', minimum: 0, maximum: 1, multipleOf: 0.00001, description: 'Tint, normalized 0..1, step 0.00001; default 0.' },
				shade: { type: 'number', minimum: 0, maximum: 1, multipleOf: 0.00001, description: 'Shade, normalized 0..1, step 0.00001; default 0.' },
				saturation: { type: 'number', minimum: 0, maximum: 4, multipleOf: 0.00001, description: 'Endpoint saturation multiplier 0..4, step 0.00001; default 1.' },
				saturationMultiplier: { type: 'number', minimum: 0, maximum: 4, multipleOf: 0.00001, description: 'Alias for saturation.' },
				opacity: { type: 'number', minimum: 0, maximum: 1, multipleOf: 0.00001, description: 'Endpoint opacity normalized 0..1, step 0.00001; default 1.' },
			},
			additionalProperties: false,
		},
	],
}
const PICTURE_COLOR_MAPPING_SCHEMA = {
	type: 'object',
	description: 'Two-endpoint editable picture color mapping.',
	properties: {
		dark: PICTURE_COLOR_ENDPOINT_SCHEMA,
		light: PICTURE_COLOR_ENDPOINT_SCHEMA,
	},
	required: ['dark', 'light'],
	additionalProperties: false,
}
const ARTISTIC_EFFECT_SCHEMA = {
	oneOf: [
		{ type: 'null', description: 'Remove the artistic effect and restore the native picture.' },
		{ type: 'string', description: 'Canonical artistic effect id from the live catalog.' },
		{
			type: 'object',
			description: 'Canonical effect id plus every applicable persistent slider leaf from the live catalog.',
			properties: { type: { type: 'string' }, id: { type: 'string' }, parameters: { type: 'object', additionalProperties: true } },
			additionalProperties: true,
		},
	],
}

const IMAGE_ADJUSTMENTS_SCHEMA = {
	oneOf: [
		{ type: 'null', description: 'Remove all authored Picture Format corrections and restore native defaults.' },
		{
			type: 'object',
			description: 'Editable Picture Format correction controls. Steps are exact native serialization precision.',
			properties: {
				brightness: { type: 'number', minimum: -1, maximum: 1, multipleOf: 0.00001, description: 'Brightness, -1..1 normalized; 0.00001 native DrawingML step; default 0.' },
				contrast: { type: 'number', minimum: -1, maximum: 1, multipleOf: 0.00001, description: 'Contrast, -1..1 normalized; 0.00001 native DrawingML step; default 0.' },
				sharpness: { type: 'number', minimum: -1, maximum: 1, multipleOf: 0.00001, description: 'Sharpen/soften, -1..1 normalized; 0.00001 native DrawingML step; default 0.' },
				saturation: { type: 'number', minimum: 0, maximum: 4, multipleOf: 0.00001, description: 'Saturation multiplier, 0..4; 0.00001 native DrawingML step; default 1.' },
				temperature: { type: 'number', minimum: 1500, maximum: 11500, multipleOf: 1, description: 'Color temperature, 1500..11500 Kelvin; 1-Kelvin native step; default 6500.' },
				transparency: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.001, description: 'Picture transparency, 0..100 percent; 0.001 percentage-point native step; default 0.' },
				colorMode: { type: 'string', enum: ['normal', 'grayscale', 'duotone', 'recolor'], description: 'Picture color mapping mode.' },
				duotone: PICTURE_COLOR_MAPPING_SCHEMA,
				recolor: PICTURE_COLOR_MAPPING_SCHEMA,
				artisticEffect: ARTISTIC_EFFECT_SCHEMA,
			},
			additionalProperties: true,
		},
	],
}

const TARGET_SCHEMA = {
	type: 'object',
	description: 'Object selector from slide.list_shapes.',
	properties: {
		objectName: { type: 'string', description: 'Stable objectName returned by slide.list_shapes.' },
		index: { type: 'number', description: 'Zero-based object index returned by slide.list_shapes.' },
	},
	additionalProperties: false,
}

export const GENERIC_OPTIONS_SCHEMA = {
	type: 'object',
	description: 'Common object options. Extra presentation-specific fields are allowed.',
	properties: {
		x: NUMBER_OR_PERCENT,
		y: NUMBER_OR_PERCENT,
		w: NUMBER_OR_PERCENT,
		h: NUMBER_OR_PERCENT,
		objectName: { type: 'string', description: 'Stable name used for later edits, animation targeting, and Morph matching.' },
		...SHAPE_FORMATTING_PUBLIC_SCHEMA.properties,
		fill: FILL_SCHEMA,
		textFill: TEXT_FILL_SCHEMA,
		textOutline: TEXT_OUTLINE_SCHEMA,
		underline: {
			oneOf: [
				{ type: 'boolean' },
				{ type: 'null' },
				{ type: 'string', enum: ['dash', 'dashHeavy', 'dashLong', 'dashLongHeavy', 'dbl', 'dotDash', 'dotDashHeavy', 'dotDotDash', 'dotDotDashHeavy', 'dotted', 'dottedHeavy', 'heavy', 'none', 'sng', 'wavy', 'wavyDbl', 'wavyHeavy'] },
				{ type: 'object', properties: { style: { type: 'string', enum: ['dash', 'dashHeavy', 'dashLong', 'dashLongHeavy', 'dbl', 'dotDash', 'dotDashHeavy', 'dotDotDash', 'dotDotDashHeavy', 'dotted', 'dottedHeavy', 'heavy', 'none', 'sng', 'wavy', 'wavyDbl', 'wavyHeavy'] }, color: COLOR }, additionalProperties: false },
			],
			description: 'Native run underline style. true means single; false/null/omitted restores the native default. The compiler also accepts the historical library typo dotDashHeave and normalizes it to dotDashHeavy.',
		},
		charSpacing: { type: 'number', minimum: -100, maximum: 100, multipleOf: 0.01, description: 'Character spacing in points, from -100 (tighter) to 100 (looser); 0.01-point step; null/omitted resets the native run override.' },
		lineSpacing: { type: 'number', minimum: 0, maximum: 400, multipleOf: 0.01, description: 'Absolute paragraph line spacing in points; 0.01-point step; takes precedence over lineSpacingMultiple.' },
		lineSpacingMultiple: { type: 'number', minimum: 0, maximum: 9.99, multipleOf: 0.00001, description: 'Relative paragraph line spacing multiple; 0.00001 step; ignored when lineSpacing points is authored.' },
		paraSpaceBefore: { type: 'number', minimum: 0, maximum: 400, multipleOf: 0.01, description: 'Paragraph spacing before in points; 0.01-point step; null/omitted resets only the before leaf.' },
		paraSpaceAfter: { type: 'number', minimum: 0, maximum: 400, multipleOf: 0.01, description: 'Paragraph spacing after in points; 0.01-point step; null/omitted resets only the after leaf.' },
		indent: { type: 'number', minimum: 0, maximum: 400, multipleOf: 0.01, description: 'Paragraph left indentation in points; 0.01-point step; serialized as a:pPr/@marL.' },
		hanging: { type: 'number', minimum: 0, maximum: 400, multipleOf: 0.01, description: 'Paragraph hanging indentation in points; 0.01-point step; serialized as a negative a:pPr/@indent.' },
		indentLevel: { type: 'integer', minimum: 0, maximum: 8, description: 'Native paragraph/list level; integer 0 through 8.' },
		bullet: TEXT_BULLET_SCHEMA,
		tabStops: { oneOf: [{ type: 'null' }, { type: 'array', maxItems: 32, items: { type: 'object', required: ['position'], properties: { position: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.01, description: 'Tab position in inches.' }, alignment: { type: 'string', enum: ['l', 'r', 'ctr', 'dec'] } }, additionalProperties: false } }], description: 'Native paragraph tab stops; null/omitted resets the tab list.' },
		line: LINE_SCHEMA,
		shadow: SHADOW_SCHEMA,
		glow: EFFECT_SCHEMA,
		reflection: EFFECT_SCHEMA,
		softEdges: EFFECT_SCHEMA,
		wordArt: WORDART_SCHEMA,
		text3D: TEXT_3D_SCHEMA,
		animation: ANIMATION_SCHEMA,
		rotate: { oneOf: [{ type: 'number', minimum: -360, maximum: 360, multipleOf: 0.000016666666666666667 }, { type: 'null' }], description: 'Native 2-D object rotation in degrees, signed -360..360 at the DrawingML 1/60000-degree serializer step; null/omitted removes the authored rotation and restores the native 0-degree default.' },
		flipH: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Native horizontal object-frame reflection; null/omitted removes the authored flipH attribute and restores the false default.' },
		flipV: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Native vertical object-frame reflection; null/omitted removes the authored flipV attribute and restores the false default.' },
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		color: { oneOf: [COLOR, { type: 'null' }] },
		fontFace: { type: ['string', 'null'], description: 'Font family for text; null restores inherited/default typography.' },
		fontFaceComplexScript: { type: ['string', 'null'], description: 'Independent complex-script a:cs typeface; null restores inherited/default complex-script typography.' },
		fontSize: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400, description: 'Font size in points; null restores inherited/default typography.' },
		bold: { type: ['boolean', 'null'], description: 'Use bold text; null restores inherited/default emphasis.' },
		italic: { type: ['boolean', 'null'], description: 'Use italic text; null restores inherited/default emphasis.' },
		baseline: { type: ['number', 'null'], minimum: -100, maximum: 100, multipleOf: 0.001, description: 'Exact numeric baseline percentage at native 0.001 precision; mutually exclusive with superscript/subscript.' },
		rtl: { type: ['boolean', 'null'], description: 'Run-level bidirectional flag.' },
		softBreakBefore: { type: ['boolean', 'null'], description: 'Insert a native soft break before a rich run.' },
		hyperlink: TEXT_HYPERLINK_SCHEMA,
		field: TEXT_FIELD_SCHEMA,
		strike: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['sngStrike', 'dblStrike'] }, { type: 'null' }], description: 'Run strike-through; supports single or double strike.' },
		highlight: { oneOf: [COLOR, { type: 'null' }], description: 'Run highlight color.' },
		superscript: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Run superscript.' },
		subscript: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Run subscript.' },
		align: { oneOf: [{ type: 'string', enum: ['left', 'center', 'right', 'justify'] }, { type: 'null' }], description: 'Horizontal paragraph alignment; null removes the authored paragraph override.' },
		rtlMode: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Paragraph right-to-left mode; null removes the authored rtl override.' },
		lang: { oneOf: [{ type: 'string', minLength: 1, maxLength: 35 }, { type: 'null' }], description: 'Run language as a BCP-47 tag, for example en-US or fr-CA; null removes the authored language override.' },
		valign: { oneOf: [{ type: 'string', enum: ['top', 'middle', 'bottom'] }, { type: 'null' }], description: 'Vertical text anchoring: top, middle, or bottom; null/omitted restores the native/default anchor.' },
		margin: { oneOf: [{ type: 'number', minimum: 0, maximum: 100, multipleOf: 0.01 }, { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.01 } }, { type: 'null' }], description: 'Text-box inset in points: one scalar for all sides or [top,right,bottom,left]; 0.01-point step; null/omitted resets the bodyPr insets.' },
		fit: { oneOf: [{ type: 'string', enum: ['none', 'shrink', 'resize'] }, { type: 'null' }], description: 'Native text fit mode: none, shrink on overflow, or resize shape to fit; null resets the explicit autofit child.' },
		wrap: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Native bodyPr wrapping: true/square, false/none, or null to remove the explicit wrap override.' },
		vert: { oneOf: [{ type: 'string', enum: ['eaVert', 'horz', 'mongolianVert', 'vert', 'vert270', 'wordArtVert', 'wordArtVertRtl'] }, { type: 'null' }], description: 'Native text direction/bodyPr vertical mode; null resets the explicit direction.' },
		sizing: { oneOf: [SIZING_SCHEMA, { type: 'null' }], description: 'Image framing policy: contain, cover, or crop; null/omitted restores native fill behaviour.' },
		imageAdjustments: IMAGE_ADJUSTMENTS_SCHEMA,
		accessibilityTitle: { oneOf: [{ type: 'string', minLength: 1, maxLength: 4096 }, { type: 'null' }], description: 'Direct-tool accessibility title, independent of a chart or SmartArt visible title; null resets it. JSON deck specs use content[].title.' },
		altText: { oneOf: [{ type: 'string', minLength: 1, maxLength: 4096 }, { type: 'null' }], description: 'Accessible alternative text; null resets it.' },
		isDecorative: { type: ['boolean', 'null'], description: 'Direct-tool native screen-reader decorative state; false persists and null resets. JSON deck specs use content[].decorative.' },
	},
	additionalProperties: true,
}

const BACKGROUND_SCHEMA = {
	type: 'object',
	description: 'Slide background.',
	properties: {
		color: COLOR,
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		type: { type: 'string', enum: ['solid', 'gradient', 'pattern', 'texture', 'image', 'picture'], description: 'Background type.' },
		gradientStops: { type: 'array', items: GRADIENT_STOP, description: 'Gradient stops.' },
		gradientAngle: { type: 'number', minimum: 0, maximum: 360, description: 'Linear gradient angle in degrees; 0.001-degree step.' },
		gradientDirection: { type: 'string', enum: ['linear', 'circle', 'rect', 'shape'], description: 'Gradient direction/path.' },
		gradientFlip: { type: 'string', enum: ['none', 'x', 'y', 'xy'], description: 'Gradient tile flip mode.' },
		rotateGradientWithShape: { type: 'boolean', description: 'Whether the gradient rotates with the slide background coordinate system.' },
		fillToRect: GRADIENT_RECT,
		tileRect: GRADIENT_RECT,
		pattern: PATTERN_SCHEMA,
		texture: TEXTURE_SCHEMA,
		data: { type: 'string', description: 'Inline image data URL for an image background.' },
		url: { type: 'string', description: 'Remote image URL for an image background.' },
	},
	additionalProperties: true,
}

const TTS_SCHEMA = {
	type: 'object',
	description: 'Narration voice defaults.',
	properties: {
		voice: { type: 'string', description: 'Voice identifier.' },
		lang: { type: 'string', description: 'Language code.' },
		speaker: { type: 'number', description: 'Speaker index for multi-speaker voices.' },
		lengthScale: { type: 'number', description: 'Speech speed control.' },
		noiseScale: { type: 'number', description: 'Voice variation control.' },
		noiseWScale: { type: 'number', description: 'Phoneme variation control.' },
	},
	additionalProperties: true,
}

const TABLE_OPERATION_SCHEMA = {
	type: 'object',
	description: 'Table edit operation.',
	properties: {
		op: { type: 'string', description: 'Operation name such as setCell, patchCell, addRow, deleteRow, addColumn, or deleteColumn.' },
		row: { type: 'number', description: 'Zero-based row index.' },
		col: { type: 'number', description: 'Zero-based column index.' },
		text: { type: 'string', description: 'Replacement cell text.' },
		options: GENERIC_OPTIONS_SCHEMA,
		patch: GENERIC_OPTIONS_SCHEMA,
		index: { type: 'number', description: 'Insertion or deletion index.' },
		cells: { type: 'array', description: 'Row or column cell values.' },
	},
	additionalProperties: true,
}

const CHART_SERIES_SCHEMA = {
	type: 'object',
	description: 'Chart series data.',
	properties: {
		name: { type: 'string', description: 'Series name.' },
		labels: { type: 'array', items: { type: 'string' }, description: 'Category labels.' },
		values: { type: 'array', items: { type: 'number' }, description: 'Numeric values.' },
		categories: { type: 'array', items: { type: 'string' }, description: 'Alternative category labels.' },
		x: { type: 'array', items: { type: 'number' }, description: 'X values for scatter/bubble charts.' },
		y: { type: 'array', items: { type: 'number' }, description: 'Y values for scatter/bubble charts.' },
		sizes: { type: 'array', items: { type: 'number' }, description: 'Bubble sizes.' },
	},
	additionalProperties: true,
}

function clarifiedSchemaForKey(key) {
	switch (key) {
		case 'background': return BACKGROUND_SCHEMA
		case 'transition':
		case 'defaultTransition': return TRANSITION_SCHEMA
		case 'animation': return ANIMATION_SCHEMA
		case 'options':
		case 'textOptions':
		case 'optionsPatch':
		case 'patch':
		case 'fillToRect': return GENERIC_OPTIONS_SCHEMA
		case 'fill': return FILL_SCHEMA
		case 'textFill': return TEXT_FILL_SCHEMA
		case 'line':
		case 'border': return LINE_SCHEMA
		case 'shadow': return SHADOW_SCHEMA
		case 'glow':
		case 'reflection':
		case 'softEdges': return EFFECT_SCHEMA
		case 'sizing': return SIZING_SCHEMA
		case 'imageAdjustments': return IMAGE_ADJUSTMENTS_SCHEMA
		case 'target': return TARGET_SCHEMA
		case 'tts': return TTS_SCHEMA
		case 'autoplay':
			return { type: 'object', description: 'Autoplay settings.', properties: { paddingMs: { type: 'number', description: 'Padding after each slide in milliseconds.' }, mode: { type: 'string', description: 'Autoplay mode.' }, loop: { type: 'boolean', description: 'Loop the show.' } }, additionalProperties: true }
		case 'audio':
			return { type: 'object', description: 'Audio input.', properties: { data: { type: 'string', description: 'Inline audio data URL or base64.' }, durationMs: { type: 'number', description: 'Audio duration in milliseconds.' }, extn: { type: 'string', description: 'Audio extension such as wav or mp3.' } }, additionalProperties: true }
		case 'playback':
			return { type: 'object', description: 'Media playback settings.', properties: { command: { type: 'string', description: 'Playback command such as play, pause, or stop.' }, trigger: { type: 'string', description: 'Playback trigger.' }, delay: { type: 'number', description: 'Delay in milliseconds.' }, duration: { type: 'number', description: 'Duration in milliseconds.' }, volume: { type: 'number', description: 'Playback volume.' } }, additionalProperties: true }
		case 'setCell':
		case 'patchCell':
			return TABLE_OPERATION_SCHEMA
		case 'addRow':
		case 'deleteRow':
		case 'addColumn':
		case 'deleteColumn':
			return TABLE_OPERATION_SCHEMA
		case 'slideNumber':
			return { type: 'object', description: 'Slide number display settings.', properties: { enabled: { type: 'boolean', description: 'Show slide number.' }, x: NUMBER_OR_PERCENT, y: NUMBER_OR_PERCENT, w: NUMBER_OR_PERCENT, h: NUMBER_OR_PERCENT, fontSize: { type: 'number', description: 'Font size.' }, color: COLOR }, additionalProperties: true }
		default:
			return null
	}
}

function mergeSchema(base, replacement) {
	return {
		...replacement,
		description: base.description || replacement.description,
		required: base.required || replacement.required,
	}
}

function clarifyPublicSchema(schema, key = '') {
	if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
	if (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length === 0 && !schema.description) {
		return { ...schema, description: 'This tool takes no arguments.', additionalProperties: false }
	}
	const replacement = clarifiedSchemaForKey(key)
	if (replacement && schema.type === 'object' && (!schema.properties || Object.keys(schema.properties).length === 0)) {
		return mergeSchema(schema, replacement)
	}
	if (schema.type === 'object' && schema.properties) {
		const props = {}
		for (const [childKey, child] of Object.entries(schema.properties)) props[childKey] = clarifyPublicSchema(child, childKey)
		return { ...schema, properties: props }
	}
	if (schema.items) {
		const itemReplacement = key === 'operations' ? TABLE_OPERATION_SCHEMA
			: (key === 'variants' ? TRANSITION_SCHEMA : null)
			|| (key === 'chartMulti' || key === 'data' ? CHART_SERIES_SCHEMA : null)
		return { ...schema, items: itemReplacement ? mergeSchema(schema.items || {}, itemReplacement) : clarifyPublicSchema(schema.items, key) }
	}
	return schema
}

function sanitizePublicTool(tool) {
	const clone = JSON.parse(JSON.stringify(tool))
	clone.name = toPublicToolName(clone.name)
	clone.description = sanitizeStringForPublic(clone.description || '').replace(/raw\s+XML/gi, 'low-level markup')
	if (clone.title) clone.title = sanitizeStringForPublic(clone.title)
	if (clone.inputSchema) clone.inputSchema = sanitizeSchema(clone.inputSchema)
	if (clone.outputSchema) clone.outputSchema = sanitizeSchema(clone.outputSchema)
	if (clone.annotations) clone.annotations = sanitizeSchema(clone.annotations)
	if (tool._meta && typeof tool._meta === 'object') clone._meta = JSON.parse(JSON.stringify(tool._meta))
	const properties = clone.inputSchema?.properties || {}
	if (clone.name === 'betterpptx.slide.add_text' && properties.text) {
		properties.text = JSON.parse(JSON.stringify(RICH_TEXT_SCHEMA))
	}
	if (clone.name === 'betterpptx.deck.define_layout') {
		clone.inputSchema.additionalProperties = false
		properties.placeholders = {
			oneOf: [{ type: 'null' }, { type: 'array', items: JSON.parse(JSON.stringify(LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA)) }],
			description: 'First-class placeholder component. Omit to preserve, null to restore the source/inherited component, or pass [] to author an empty component.',
		}
		properties.objects = { oneOf: [{ type: 'null' }, { type: 'array', items: JSON.parse(JSON.stringify(LAYOUT_OWNED_OBJECT_SCHEMA)) }] }
		properties.margin = JSON.parse(JSON.stringify(LAYOUT_MARGIN_SCHEMA))
		properties.slideNumber = JSON.parse(JSON.stringify(SLIDE_NUMBER_FIELD_SCHEMA))
		properties.headerFooter = JSON.parse(JSON.stringify(HEADER_FOOTER_POLICY_SCHEMA))
	}
	if (clone.name === 'betterpptx.deck.define_master' && properties.master?.properties) {
		const master = properties.master
		master.additionalProperties = false
		master.properties.placeholders = {
			oneOf: [{ type: 'null' }, { type: 'array', items: JSON.parse(JSON.stringify(LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA)) }],
			description: 'First-class placeholder component. Omit to preserve, null to restore the source/inherited component, or pass [] to author an empty component.',
		}
		master.properties.objects = { oneOf: [{ type: 'null' }, { type: 'array', items: JSON.parse(JSON.stringify(LAYOUT_OWNED_OBJECT_SCHEMA)) }] }
		master.properties.background = { type: ['object', 'string', 'null'] }
		master.properties.margin = JSON.parse(JSON.stringify(LAYOUT_MARGIN_SCHEMA))
		master.properties.slideNumber = JSON.parse(JSON.stringify(SLIDE_NUMBER_FIELD_SCHEMA))
		master.properties.headerFooter = JSON.parse(JSON.stringify(HEADER_FOOTER_POLICY_SCHEMA))
	}
	if (clone.name === 'betterpptx.assets.catalog') {
		clone.description = 'Return an unranked inventory of presentation assets as opaque handles. The AI chooses an exact handle and places it only through betterpptx.deck.generate_from_spec; BetterPPTX does not choose the visual treatment.'
		if (properties.kind) {
			properties.kind.enum = ['model3d', 'shapeScene', 'customGeometry']
			properties.kind.description = 'Optional semantic asset category. Omit it to inspect all public 3D and editable custom-geometry choices.'
		}
		if (properties.useCase) properties.useCase.description = 'Optional slide or story context used to filter relevant factual matches without selecting one for the AI.'
		if (properties.aiContext) properties.aiContext.description = 'Optional broader deck context used to filter relevant factual matches without aesthetic ranking.'
		if (properties.preferNative) properties.preferNative.description = 'When true, list editable native-compatible assets before non-native alternatives; the AI still chooses the exact handle.'
	}
	if (clone.name === 'betterpptx.assets.search_stock') {
		clone.description = 'Search commercially usable stock photos, illustrations, vectors, video, or audio and return durable public media handles with the author and license facts needed for responsible use. Put an AI-selected handle only in the corresponding semantic deck-spec block.'
		if (properties.perPage) properties.perPage.description = 'Maximum results requested from each available licensed-media catalog.'
	}
	if (clone.name === 'betterpptx.custom_geometry.catalog') {
		clone.description = 'Return an unranked inventory of editable custom geometry as opaque handles. Put the AI-selected handle on a semantic kind:"customGeometry" block and compile it through betterpptx.deck.generate_from_spec; do not author points or coordinates.'
		for (const key of ['sceneHandle', 'slideNumber', 'slide', 'minPoints', 'maxPoints', 'format']) delete properties[key]
		properties.collectionHandle = { type: 'string', description: 'Optional opaque shapeScene://public collection handle returned by betterpptx.assets.catalog.' }
		if (properties.useCase) properties.useCase.description = 'Optional story context used to filter relevant shapes without selecting one for the AI.'
	}
	if (clone.name === 'betterpptx.assets.generate_model3d') {
		clone.description = 'Resolve an AI-selected, commercially compatible 3D asset and return an opaque handle for a semantic kind:"model3d" block. The AI chooses the subject and exact catalog candidate; placement is compiled through betterpptx.deck.generate_from_spec.'
		for (const key of ['w', 'h', 'assetSource']) delete properties[key]
		if (properties.query) properties.query.description = 'Optional explicit object search text combined with the story context for catalog selection.'
		if (properties.sizePolicy) properties.sizePolicy.description = '3D asset size policy for presentation portability.'
		if (properties.searchLimit) properties.searchLimit.description = 'Maximum compatible public-catalog candidates considered when the local catalog has no strong match.'
	}
	if (clone.name === 'betterpptx.assets.generate_rigged3d') {
		clone.description = 'Rigged persona generation is a partial, experimental route for creating a new personalized 3D character. Check stage readiness and obtain explicit experimental authorization before use; a callable route is not production readiness, and an output is not a selectable 3D presenter until rigging, motion compatibility, packaging, and approval evidence succeeds.'
		for (const key of ['production', 'force']) delete properties[key]
		properties.experimentalConfirmed = { type: 'boolean', const: true, description: 'Required explicit opt-in for the experimental rigged-persona route. This does not grant production approval or bypass identity, asset, cost, or release gates.' }
		if (properties.rig) properties.rig.description = 'Request skeleton and skin-weight generation for the experimental persona route. Downstream deformation and motion-compatibility evidence is still required.'
		if (properties.perform) properties.perform.description = 'Request experimental presenter gesture clips; this does not establish native 3D-presenter compatibility or production approval.'
		if (properties.quality) properties.quality.description = 'Choose a deck-portable or higher-detail asset profile.'
	}
	return clone
}

export const PUBLIC_BLACK_BOX_PATH_KEYS = new Set([
	'path',
	'filePath',
	// a bare download name is fine; a LOCAL-PATH-LIKE fileName must never address the host fs
	'fileName',
	'root',
	'outputDir',
	'saveToPath',
	'pptxPath',
	'templatePath',
	'sourcePath',
	'imagePath',
	'glbFile',
	'rasterFile',
	'modelAsset',
	'posterAsset',
	'cover',
])

function isPublicPathKey(key) {
	const normalized = normalizedPublicKey(key)
	return [...PUBLIC_BLACK_BOX_PATH_KEYS].some(candidate => normalizedPublicKey(candidate) === normalized)
}

function isOpaqueAssetRef(value) {
	return /^(asset:\/\/(?:generated|catalog)\/|model3d:\/\/|stock:\/\/|audio:\/\/|video:\/\/|texture:\/\/)/i.test(String(value || ''))
}

function isInlineOrRemoteRef(value) {
	const s = String(value || '')
	return /^data:/i.test(s) || /^https?:\/\//i.test(s)
}

function isLocalPathLike(value) {
	const s = String(value || '').trim()
	if (!s) return false
	if (isOpaqueAssetRef(s) || isInlineOrRemoteRef(s)) return false
	return /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || s.includes('..\\') || s.includes('../')
}

function assertNoPublicLocalPathArgsNode(value, trail) {
	if (value == null) return
	if (Array.isArray(value)) {
		value.forEach((item, i) => assertNoPublicLocalPathArgsNode(item, trail.concat(String(i))))
		return
	}
	if (typeof value !== 'object') return
	for (const [key, child] of Object.entries(value)) {
		const nextTrail = trail.concat(key)
		if (normalizedPublicKey(key) === 'authoredspecliterals') {
			throw new Error('Internal result provenance cannot be supplied as authoring input.')
		}
		if (typeof child === 'string' && isPublicPathKey(key) && isLocalPathLike(child)) {
			throw new Error(`Local resource references are not available on this endpoint (${nextTrail.join('.')}).`)
		}
		assertNoPublicLocalPathArgsNode(child, nextTrail)
	}
}

export function assertNoPublicLocalPathArgs(value, trail = []) {
	if (!isPublicBlackBoxMode() || value == null) return
	assertNoPublicLocalPathArgsNode(value, trail)
}

const PUBLIC_BLACK_BOX_RESULT_HIDDEN_KEYS = new Set([
	'path',
	'filePath',
	'localPath',
	'downloadPath',
	'assetPath',
	'privateAssetPath',
	'root',
	'outputDir',
	'saveToPath',
	'pptxPath',
	'templatePath',
	'sourcePath',
	'sourceXmlPath',
	'imagePath',
	'glbFile',
	'rasterFile',
	'workDir',
	'packagePassthrough',
	'timingPassthrough',
	'rawXmlBytes',
	'relsAdded',
	'rawIndex',
	'provider',
	'model',
	'runner',
	'host',
	'gpuType',
	'gpuSeconds',
	'coldStart',
	'license',
	'licenses',
	'spdx',
	'commercialUse',
	'attributionRequired',
	'reviewStatus',
	'tags',
	'capabilityLedger',
	'coverageMatrix',
	'featureInventory',
	'featureMatrix',
	'optionRegistry',
	'presetIdMap',
	'catalog',
	'catalogMetadata',
	'catalogContext',
	'catalogResultIndex',
	'resultIndex',
	'sourcePolicy',
	'provenance',
	'searchTokens',
	'categoryAliases',
	'rawTags',
	'nodeNames',
	'matchScore',
	'morphPreviewCoverage',
	'previewFeatures',
	'preferredObjectKinds',
	'morphFriendlyObjects',
	'stack',
	'pipeline',
	'avatarPipeline',
	'enhancement',
	'enhancementHeader',
	'restoration',
	'pipelineHeader',
	'xPipeline',
	'xEnhancement',
	'xRestoreformerSeconds',
	'xRestoreformerSegments',
	'restoreFormerSeconds',
	'restoreFormerSegments',
	'providerExecutionId',
	'providerExecutionIds',
	'providerExecutionCount',
	'generatedByPrimitiveHandlers',
	'primitive',
	'powerPointNative',
	'native3d',
	// Presenter/interaction realization remains a private engine concern. Public
	// readback carries semantic intent and timing, never baked clip maps or solved
	// geometry coordinates.
	'clipMap',
	'contactMap',
	'clipDurations',
	'animId',
	'framePos',
	'bboxFrom',
	'operationRefs',
	'committedObjects',
	'headers',
	'responseHeaders',
	'rawHeaders',
	'bundleHandle',
	'catalogFingerprint',
	'motionIdToAnimId',
	'sourceSlug',
	'privateEvidence',
	'transplant',
	'engineRoute',
	'compiledAs',
	'nativePackage',
	'nativeTiming',
	'clipTimelines',
	'playScene',
	'TO_SOURCE',
	// Public clients can inspect product capabilities and route eligibility, but
	// never build fingerprints, package vocabulary, or private proof ledgers.
	'buildSha',
	'publicBuild',
	'capabilityDigest',
	'toolsRegistered',
	'registeredToolCount',
	'registeredOnServer',
	'publishedByMcp',
	'loadedByHost',
	'callableNow',
	'serializer',
	'ledgerSemanticHash',
	'mcpEngineProof',
	'publicSpecFirstTools',
	'catalogClosure',
])

function sanitizePublicEditHandle(handle) {
	if (typeof handle === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(handle)) return handle
	const selectors = Array.isArray(handle?.stableSelectors)
		? handle.stableSelectors.filter(item => /^objectName:|^index:/i.test(String(item || '')))
		: []
	return {
		stableSelectors: selectors,
		targetHint: 'Use target { objectName } when available; otherwise use the zero-based index returned by list_shapes.',
	}
}

// Only the server can register this provenance, after normal input validation.
// It is not a serialized flag or a special client-supplied property. Snapshot the
// submitted literals so a later server mutation cannot gain the same privilege.
const AUTHORED_SPEC_RESULT_SOURCES = new WeakMap()
const AUTHORED_LITERAL_EXCLUDED_BRANCHES = new Set([
	'resolution', 'metadata', 'diagnostics', 'audit', 'lockedAudio', 'lockedMedia',
	'lockedVideo', 'lockedPoster', 'lockedTemplate', 'layoutContract',
].map(normalizedPublicKey))

function authoredLiteralCanBePreserved(value) {
	// Resource aliases that reveal a private catalog/provider still use the normal
	// opaque-handle projection. Inline media are not duplicated in provenance.
	return !/^(?:data:|file:\/\/|model3d:\/\/(?:microsoft-stock|sketchfab|open-3d(?:-quality)?|khronos|premium|reference)\/|gen:\/\/(?:trellis|unirig|flux|modal|black[-.]forest[-.]labs|huggingface|workers[-.]?ai)(?:\/|:))/i.test(value)
}

function authoredResultChild(source, key) {
	if (typeof source === 'string' && key === 'script') return source
	if (!source || typeof source !== 'object') return undefined
	if (AUTHORED_LITERAL_EXCLUDED_BRANCHES.has(normalizedPublicKey(key))) return undefined
	if (Object.prototype.hasOwnProperty.call(source, key)) return source[key]
	// Explicit speech cues and script[] are public aliases for narration segments.
	// The resolver may materialize those aliases; they still carry authored words,
	// not server provenance. The cue converter refuses partial/visual-only scripts.
	if (key === 'segments') {
		if (Array.isArray(source.script)) return source.script.map(segment => typeof segment === 'string' ? { script: segment } : segment)
		return cuesToSynthesisSegments(source.cues ?? source.timing?.cues, { script: source.script || source.text || '' }) || undefined
	}
	return undefined
}

function snapshotAuthoredLiterals(value, parentKey = '') {
	if (typeof value === 'string') return authoredLiteralCanBePreserved(value) ? value : undefined
	if (!value || typeof value !== 'object') return undefined
	if (Array.isArray(value)) {
		const items = value.map(child => snapshotAuthoredLiterals(child, parentKey) ?? null)
		return items.some(child => child !== null) ? items : undefined
	}
	const out = {}
	for (const [key, child] of Object.entries(value)) {
		if (key.startsWith('_') || AUTHORED_LITERAL_EXCLUDED_BRANCHES.has(normalizedPublicKey(key)) || isHiddenPublicKey(key, PUBLIC_BLACK_BOX_RESULT_HIDDEN_KEYS)) continue
		const literal = snapshotAuthoredLiterals(child, key)
		if (literal !== undefined) out[key] = literal
	}
	return Object.keys(out).length ? out : undefined
}

// Internal clone/persistence helpers retain provenance, not an exemption flag.
// The snapshot contains only authored literals, never inline media or resolved
// provider data. Public result sanitation strips private persistence carriers.
export function authoredSpecLiteralSnapshot(value) {
	const source = value && typeof value === 'object' ? AUTHORED_SPEC_RESULT_SOURCES.get(value) : undefined
	return source ? JSON.parse(JSON.stringify(source)) : null
}

export function copyAuthoredSpecResultProvenance(source, target, depth = 0) {
	if (!source || !target || typeof source !== 'object' || typeof target !== 'object' || depth > 4) return target
	const literals = AUTHORED_SPEC_RESULT_SOURCES.get(source)
	if (literals) AUTHORED_SPEC_RESULT_SOURCES.set(target, literals)
	for (const key of ['lockedSpec', 'result', 'data']) {
		if (source[key] && target[key]) copyAuthoredSpecResultProvenance(source[key], target[key], depth + 1)
	}
	return target
}

function sanitizePublicResultNode(value, options = {}, parentKey = '', authoredSource) {
	if (value == null) return value
	if (parentKey === 'error') {
		const validationError = publicRuntimeValidationError(value)
		if (validationError) return sanitizePublicResultNode(validationError, options, parentKey)
	}
	const registeredSource = typeof value === 'object' ? AUTHORED_SPEC_RESULT_SOURCES.get(value) : undefined
	const source = registeredSource ?? authoredSource
	if (Array.isArray(value)) {
		const out = value.map((item, index) => sanitizePublicResultNode(item, options, parentKey, Array.isArray(source) ? source[index] : undefined))
		if (registeredSource) AUTHORED_SPEC_RESULT_SOURCES.set(out, registeredSource)
		return out
	}
	if (typeof value !== 'object') {
		if (typeof value === 'string' && isLocalPathLike(value)) return undefined
		if (typeof value === 'string' && value === source && authoredLiteralCanBePreserved(value)) {
			return redactEmbeddedLocalReferences(value)
		}
		if (typeof value === 'string') return sanitizeStringForPublic(value)
		return value
	}
	const out = {}
	// An issued download is an exact resource identifier, not provider prose.
	// Preserve only the store-attested URL/basename pair, never an entire result
	// object or arbitrary HTTPS/provider URL. All sibling metadata stays scrubbed.
	const publishedDownload = isPublishedArtifactDownloadPair(value.downloadUrl, value.downloadName)
	for (const [key, child] of Object.entries(value)) {
		if (key.startsWith('_')) continue
		const publicModel3dFamilyCount = normalizedPublicKey(parentKey) === 'familycounts'
			&& normalizedPublicKey(key) === 'model3d'
			&& typeof child === 'number'
		if (isHiddenPublicKey(key, PUBLIC_BLACK_BOX_RESULT_HIDDEN_KEYS)
			&& !(options.allowCatalog === true && key === 'catalog')
			&& !publicModel3dFamilyCount) {
			if (!(['model', 'modelAsset', 'posterAsset', 'cover'].includes(key) && typeof child === 'string' && isOpaqueAssetRef(child))) continue
		}
		if (key === 'editHandle') {
			out[key] = sanitizePublicEditHandle(child)
			continue
		}
		if (key === 'stableSelectors' && Array.isArray(child)) {
			out[key] = child.filter(item => /^objectName:|^index:/i.test(String(item || '')))
			continue
		}
		const sanitized = publishedDownload && (key === 'downloadUrl' || key === 'downloadName')
			? child : sanitizePublicResultNode(child, options, key, authoredResultChild(source, key))
		if (sanitized !== undefined) out[key] = sanitized
	}
	if (registeredSource) AUTHORED_SPEC_RESULT_SOURCES.set(out, registeredSource)
	return out
}

// Maintainer-only provenance bridge for a validated generate_from_spec handoff.
// Hidden keys, local paths, and un-authored resolver metadata are still scrubbed.
// Repeated result-envelope sanitation preserves only these same exact literals.
export function sanitizePublicAuthoredSpec(value, authorSubmittedSpec) {
	if (!isPublicBlackBoxMode() || value == null) return value
	if (!value || typeof value !== 'object' || Array.isArray(value) || !authorSubmittedSpec || typeof authorSubmittedSpec !== 'object' || Array.isArray(authorSubmittedSpec)) {
		throw new Error('Authored-spec result provenance requires two spec objects.')
	}
	AUTHORED_SPEC_RESULT_SOURCES.set(value, snapshotAuthoredLiterals(authorSubmittedSpec) || {})
	return sanitizePublicResultNode(value)
}

export function sanitizePublicResult(value) {
	if (!isPublicBlackBoxMode() || value == null) return value
	return sanitizePublicResultNode(value)
}

// The compatibility-named chart.recommend tool is an unranked catalog filter:
// its entries are already projected through public catalog DTOs and carry opaque
// ids rather than package provenance. Preserve that sanitized catalog while
// keeping the generic `catalog` key hidden on all other tools.
export function sanitizePublicChartRecommendResult(value) {
	if (!isPublicBlackBoxMode() || value == null) return value
	return sanitizePublicResultNode(value, { allowCatalog: true })
}
