const FREE_TOOL_RE = /\.(capabilities|version|status|voices|list|summary|inspect|inspect_layouts|editability_report|validate|validate_design|validate_narration|list_shapes|inspect_shapes|read_file|read_json|list_dir|find|catalog|recommend|sample_palette|list_xml_groups|polygon_to_custgeom|simplify_path|fetch|explain_plan|portal)$/

const FREE_TOOLS = new Set([
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
	'betterpptx.narration.synthesize',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_model3d',
])

export function classifyBillingTool(name) {
	const tool = String(name || '')
	if (!tool) return { category: 'free', billable: false, mode: 'free', reason: 'missing-tool-name' }
	if (FREE_TOOLS.has(tool) || tool.startsWith('betterpptx.auth.') || tool.startsWith('betterpptx.billing.') || FREE_TOOL_RE.test(tool)) {
		return { category: 'free', billable: false, mode: 'free', reason: 'control-or-readonly' }
	}
	if (CHECKPOINT_TOOLS.has(tool)) return { category: 'checkpoint', billable: true, mode: 'deck.save', reason: 'value-delivery-checkpoint' }
	if (HEAVY_TOOLS.has(tool)) return { category: 'heavy', billable: true, mode: 'immediate-heavy', reason: 'resource-heavy-operation' }
	if (/^betterpptx\.(deck|slide|shape|table|chart|smartart|media|image|io|library)\./.test(tool)) {
		return { category: 'draft-accrual', billable: false, mode: 'draft-accrual', reason: 'ordinary-edit-loop' }
	}
	return { category: 'free', billable: false, mode: 'free', reason: 'unclassified-safe-default' }
}

export function isBillingDryRunEnabled() {
	return process.env.BETTERPPTX_BILLING_DRY_RUN === '1' || process.env.BETTERPPTX_BILLING_SHADOW_MODE === '1'
}

