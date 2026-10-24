import { isFreePublicationBillingProfile } from './security-policy.mjs'

const FREE_TOOL_RE = /\.(capabilities|version|status|voices|job_status|list|summary|inspect|inspect_layouts|editability_report|analyze_reference|compare_reference|validate|validate_design|validate_accessibility|validate_narration|validate_avatar_narration|list_shapes|inspect_shapes|read_file|read_json|list_dir|find|catalog|recommend|sample_palette|list_xml_groups|polygon_to_custgeom|simplify_path|from_svg|fetch|explain_plan|portal)$/

const FREE_TOOLS = new Set([
	'price-listing',
	'pricing-listing',
	'payment-methods',
	'make-purchase',
	'betterpptx.auth.status',
	'betterpptx.auth.activate_key',
	'betterpptx.billing.explain_plan',
	'betterpptx.billing.portal',
	'betterpptx.help.capabilities',
	'betterpptx.version',
	'betterpptx.status',
])

const CHECKPOINT_TOOLS = new Set([
	'betterpptx.deck.save',
])

const HEAVY_TOOLS = new Set([
	'betterpptx.deck.open_existing',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.load_template',
	'betterpptx.deck.transform_shapes',
	'betterpptx.deck.add_narration',
	'betterpptx.slide.add_narration',
	'betterpptx.narration.get_voice_timing',
	'betterpptx.avatar.render_job',
	'betterpptx.deck.add_avatar_narration',
	'betterpptx.slide.add_avatar_narration',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_model3d',
	// Generated-image and generated-rigged3D operations are real external compute. They must
	// never fall through the safe-default free classifier merely because assets.* is otherwise
	// a discovery namespace.
	'betterpptx.assets.generate_image',
	'betterpptx.assets.generate_rigged3d',
	// SERVER/SERVICE cost only (the 3D content is free-licensed): the live archive download +
	// extract/convert of an external model is a real egress+CPU op. Previously these fell to
	// unclassified-safe-default=free, so the expensive import was unpriced while the cheap
	// placement (slide.add_model3d) was billed — an inverted gap. Search/inspect/catalog stay
	// free (cheap metadata). Content licensing never enters the price; only server/service does.
	'betterpptx.assets.generate_model3d',
	'betterpptx.sketchfab.import',
])

// Pricing does not grant access: engine ownership and actual-byte checks remain.
function existingModelInsertion(args = {}) {
 const options = args.options && typeof args.options === 'object' ? args.options : {}
 const handle = options.modelAsset ?? args.modelAsset
 const raw = ['glbFile', 'glbData', 'glbBase64', 'glbBuffer', 'modelUrl', 'url', 'path', 'data', 'filePath']
 if (raw.some(key => args[key] != null || options[key] != null)) return false
 return typeof handle === 'string' && (/^gen:\/\/(?:trellis\/)?rigged3d\/[a-f0-9]{8,64}$/.test(handle) || /^model3d:\/\/microsoft-stock\/[a-f0-9]{16}\/[a-zA-Z0-9_-]+$/.test(handle))
}

export function classifyBillingTool(name, args = {}) {
	const tool = String(name || '')
	if (!tool) return { category: 'free', billable: false, mode: 'free', reason: 'missing-tool-name' }
	if (FREE_TOOLS.has(tool) || tool.startsWith('betterpptx.auth.') || tool.startsWith('betterpptx.billing.') || FREE_TOOL_RE.test(tool)) {
		return { category: 'free', billable: false, mode: 'free', reason: 'control-or-readonly' }
	}
	if (CHECKPOINT_TOOLS.has(tool)) return { category: 'checkpoint', billable: true, mode: 'deck.save', reason: 'value-delivery-checkpoint' }
	if (tool === 'betterpptx.slide.add_model3d' && isFreePublicationBillingProfile() && existingModelInsertion(args)) return { category: 'draft-accrual', billable: false, mode: 'draft-accrual', reason: 'existing-model-free-authoring' }
	if (HEAVY_TOOLS.has(tool)) return { category: 'heavy', billable: true, mode: 'immediate-heavy', reason: 'resource-heavy-operation' }
	if (/^betterpptx\.(deck|slide|shape|table|chart|smartart|media|image|io|library|custom_geometry)\./.test(tool)) {
		return { category: 'draft-accrual', billable: false, mode: 'draft-accrual', reason: 'ordinary-edit-loop' }
	}
	return { category: 'free', billable: false, mode: 'free', reason: 'unclassified-safe-default' }
}

export function isBillingDryRunEnabled() {
	return process.env.BETTERPPTX_BILLING_DRY_RUN === '1' || process.env.BETTERPPTX_BILLING_SHADOW_MODE === '1'
}
