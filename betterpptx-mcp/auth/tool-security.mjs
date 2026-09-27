// Shared authentication policy for transport enforcement and client discovery.
// A read-only tool is not necessarily public: private deck/account reads require login.
const PUBLIC_DISCOVERY = new Set([
	'betterpptx.status', 'betterpptx.auth.status',
	'betterpptx.help.capabilities', 'betterpptx.help.workflow', 'betterpptx.help.tool_recipe',
	'betterpptx.options.catalog', 'betterpptx.authoring.capabilities', 'betterpptx.authoring.catalog',
	'betterpptx.billing.explain_plan', 'betterpptx.chart.recommend', 'betterpptx.table.recommend',
	'betterpptx.equation.catalog', 'betterpptx.smartart.catalog', 'betterpptx.custom_geometry.catalog',
])

export function anonymousToolAllowed(canonicalName) { return PUBLIC_DISCOVERY.has(canonicalName) }

export function toolSecuritySchemes(canonicalName) {
	const oauth = { type: 'oauth2', scopes: ['betterpptx'] }
	return anonymousToolAllowed(canonicalName) ? [{ type: 'noauth' }, oauth] : [oauth]
}
