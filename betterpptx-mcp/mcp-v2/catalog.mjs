import { advertisedPublicTools, publicRuntimeManifest, publicServerVersion } from '../public-manifest.mjs'
import { BETTERPPTX_PRODUCT, BETTERPPTX_SERVER_NAME } from '../branding.mjs'
import { publicBillingUrls } from '../billing/checkout.mjs'
import { publicGalleryResources } from '../public-gallery.mjs'

export function mcpV2ServerInfo() {
	return {
		name: BETTERPPTX_SERVER_NAME,
		title: BETTERPPTX_PRODUCT,
		version: publicServerVersion(),
	}
}

export function mcpV2Capabilities() {
	return {
		tools: { listChanged: true },
		resources: { listChanged: true },
		prompts: { listChanged: true },
	}
}

export function mcpV2Instructions(text) {
	return String(text || [
		`${BETTERPPTX_PRODUCT} creates, edits, narrates, animates, validates, and exports polished PowerPoint (.pptx) presentations.`,
		'Canonical first discovery is betterpptx.help.capabilities; its compact response includes the complete family index, authority boundaries, and focused learning path.',
		'The public tools and returned contracts are sufficient in clients that cannot load a bundled skill. A host slide skill is not a substitute for a BetterPPTX-generated artifact.',
		'Use ai-sovereign-v1 by default so the consuming AI owns story, composition, visual language, exact selections, and creative acceptance. Director assistance is optional.',
		'The sole authoring call is betterpptx.deck.generate_from_spec.',
		'Public discovery is anonymous; protected authoring, account operations and private downloads require verified account sign-in. Caller-supplied identity headers are not credentials.',
		'Discover capabilities, dry-run the JSON spec, estimate the exact phase:"commit" request, pass its complete quoteBinding unchanged to commit, validate, then separately save and return the download link. A dry-run quote does not authorize commit.',
		'If a tool returns REQUIRES_UPGRADE, keep valid work and offer activation or a free-safe fallback. Never silently skip a requested premium feature.',
	].join('\n'))
}

export function mcpV2ToolScopes(tools = advertisedPublicTools()) {
	const names = tools.map(tool => String(tool.name || '')).filter(Boolean)
	return [
		'mcp:discover',
		'mcp:tools',
		'mcp:resources',
		'mcp:prompts',
		'tools:execute',
		...names.map(name => `tools:${name}`),
	]
}

export function publicPromptCatalog() {
	return [
		{
			name: 'authoring-excellence',
			title: 'Author a finished presentation',
			description: 'Governed JSON-spec workflow for creating or revising a polished PowerPoint deck.',
			arguments: [
				{ name: 'intent', description: 'What the presentation must accomplish for the audience.', required: true },
				{ name: 'deckType', description: 'new, uploaded, or auto.', required: false },
			],
		},
		{
			name: 'upgrade-and-continue',
			title: 'Resolve a premium or credit gate',
			description: 'Human confirmation path when a presentation feature requires Premium or credits.',
			arguments: [
				{ name: 'feature', description: 'The gated feature the user asked for.', required: false },
			],
		},
		{
			name: 'narrated-presentation',
			title: 'Build a narrated slideshow',
			description: 'Voice, cue, caption, and validation sequence for a spoken presentation.',
			arguments: [
				{ name: 'intent', description: 'The spoken story the audience should hear.', required: true },
			],
		},
		{
			name: 'uploaded-deck-revision',
			title: 'Revise an uploaded PowerPoint',
			description: 'Import uploaded bytes, inspect, then compile every intended change through generate_from_spec.',
			arguments: [
				{ name: 'intent', description: 'What should change in the existing deck.', required: true },
			],
		},
	]
}

function promptMessage(text) {
	return [{ role: 'user', content: { type: 'text', text } }]
}

export function getPublicPrompt(name, args = {}) {
	const intent = String(args.intent || 'Create a finished audience-ready presentation.').trim()
	const deckType = String(args.deckType || 'auto').trim() || 'auto'
	const feature = String(args.feature || 'a premium presentation feature').trim()
	if (name === 'authoring-excellence') {
		return {
			description: 'Authoring Excellence JSON-spec construction path.',
			messages: promptMessage([
				`User intent: ${intent}`,
				`Deck type: ${deckType}`,
				'Use BetterPPTX as an expressive governed compiler; the consuming AI remains the creative author.',
				'1) Call betterpptx.help.capabilities with the user intent, then inspect one relevant control page or lesson when useful.',
				'2) Compose one ai-sovereign-v1 JSON spec. Use Director assistance only when deliberately selected.',
				'3) Call betterpptx.deck.generate_from_spec with dryRun:true and resolve every contract issue.',
				'4) Estimate the exact phase:"commit" generate_from_spec request with the final spec and prepared media; pass the complete issued quoteBinding unchanged to that same commit request.',
				'5) Validate package, design, accessibility, narration when present, and quality, then separately call betterpptx.deck.save.',
				'Return the download link. Do not expose private implementation details.',
			].join('\n')),
		}
	}
	if (name === 'upgrade-and-continue') {
		return {
			description: 'Premium/credit confirmation without discarding valid work.',
			messages: promptMessage([
				`Gated feature: ${feature}`,
				'If a tool returned REQUIRES_UPGRADE or QUOTA_EXCEEDED, keep valid work so far.',
				'Offer checkout through betterpptx.billing.portal or the host elicitation URL.',
				'When the user pastes a checkout key, call betterpptx.auth.activate_key, then retry the identical spec.',
				'If the user declines, keep the free-safe result and explain the omitted premium feature. Never silently skip a requested premium feature.',
			].join('\n')),
		}
	}
	if (name === 'narrated-presentation') {
		return {
			description: 'Narrated deck construction path.',
			messages: promptMessage([
				`Spoken intent: ${intent}`,
				'Use the narrated quality profile. Discover voices through capabilities/status, then write narration cues in the JSON spec.',
				'Do not silently downgrade a narrated request to silent slides.',
				'Validate with betterpptx.deck.validate_design profile "narrated" and betterpptx.deck.validate_narration before save.',
			].join('\n')),
		}
	}
	if (name === 'uploaded-deck-revision') {
		return {
			description: 'Uploaded-deck revision path.',
			messages: promptMessage([
				`Revision intent: ${intent}`,
				'Call betterpptx.deck.open_uploaded with the user file bytes, inspect through read-only tools, then express every intended change in one Authoring Excellence JSON spec.',
				'Compile through betterpptx.deck.generate_from_spec. Do not recreate the deck from scratch unless the user asked for a replacement.',
			].join('\n')),
		}
	}
	return null
}

export function publicResourceCatalog() {
	return [
		{
			uri: 'betterpptx://status',
			name: 'service-status',
			title: 'Service status',
			description: 'Current BetterPPTX runtime identity, plan, and capability digest.',
			mimeType: 'application/json',
		},
		{
			uri: 'betterpptx://capabilities',
			name: 'authoring-capabilities',
			title: 'Authoring capabilities',
			description: 'Compact Authoring Excellence contract and recommended call sequence.',
			mimeType: 'application/json',
		},
		{
			uri: 'betterpptx://auth',
			name: 'auth-status',
			title: 'Account and plan status',
			description: 'Free/premium/credit state for the current installer identity.',
			mimeType: 'application/json',
		},
		{
			uri: 'betterpptx://protocol',
			name: 'mcp-protocol',
			title: 'MCP protocol support',
			description: 'Supported MCP protocol versions and discovery method.',
			mimeType: 'application/json',
		},
		...publicGalleryResources(),
	]
}

export function checkoutUrlForInstall(installHash = '') {
	return publicBillingUrls({ installHash, feature: 'premium' }).checkoutUrl || publicBillingUrls({}).pricingUrl
}

export function runtimeStatusResource() {
	return publicRuntimeManifest()
}
