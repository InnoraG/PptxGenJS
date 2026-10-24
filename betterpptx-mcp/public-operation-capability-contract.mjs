// Public MCP operations are executable product commands, not persistent PPTX
// authoring fields. Keep them visible and routable without counting them as
// exact/partial saved-package capability rows.

import { createHash } from 'node:crypto'

const HOST_COMMAND = 'host-command-not-persistent-style'
const NOT_APPLICABLE_RESET = Object.freeze({
	component: 'not-applicable',
	full: 'not-applicable',
	nullBehavior: 'not-applicable',
})

export const CONDITIONAL_COMMERCE_OPERATION_NAMES = Object.freeze([
	'price-listing',
	'pricing-listing',
	'payment-methods',
	'make-purchase',
])

export const CONDITIONAL_JOB_OPERATION_NAMES = Object.freeze([
	'betterpptx.billing.job_status',
])

export const CANONICAL_FOUNDATION_OPERATION_NAMES = Object.freeze([
	'betterpptx.assets.catalog',
	'betterpptx.assets.inspect',
	'betterpptx.assets.search_stock',
	'betterpptx.assets.upload',
	'betterpptx.auth.activate_key',
	'betterpptx.auth.get_profile',
	'betterpptx.auth.status',
	'betterpptx.authoring.capabilities',
	'betterpptx.authoring.catalog',
	'betterpptx.billing.estimate',
	'betterpptx.billing.explain_plan',
	'betterpptx.billing.payment_options',
	'betterpptx.billing.portal',
	'betterpptx.billing.redeem_promo',
	'betterpptx.billing.usage_summary',
	'betterpptx.custom_geometry.catalog',
	'betterpptx.deck.director_status',
	'betterpptx.deck.dispose',
	'betterpptx.deck.export_spec',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.preview',
	'betterpptx.deck.recent',
	'betterpptx.deck.save',
	'betterpptx.deck.summary',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_accessibility',
	'betterpptx.deck.validate_design',
	'betterpptx.deck.validate_narration',
	'betterpptx.deck.validate_native_visuals',
	'betterpptx.deck.validate_quality',
	'betterpptx.help.capabilities',
	'betterpptx.help.tool_recipe',
	'betterpptx.help.workflow',
	'betterpptx.narration.get_voice_timing',
	'betterpptx.operation.recent',
	'betterpptx.operation.read_file',
	'betterpptx.operation.status',
	'betterpptx.options.catalog',
	'betterpptx.status',
])

export const FOUNDATION_PUBLIC_OPERATION_NAMES = Object.freeze([
	...CANONICAL_FOUNDATION_OPERATION_NAMES,
	...CONDITIONAL_COMMERCE_OPERATION_NAMES,
	...CONDITIONAL_JOB_OPERATION_NAMES,
])

const operationNames = new Set(FOUNDATION_PUBLIC_OPERATION_NAMES)
const conditionalNames = new Set([
	...CONDITIONAL_COMMERCE_OPERATION_NAMES,
	...CONDITIONAL_JOB_OPERATION_NAMES,
])
const opaqueRowId = name => `cap_${createHash('sha256').update(`tool:${name}`).digest('hex').slice(0, 20)}`

export const FOUNDATION_PUBLIC_OPERATION_ROW_IDS = Object.freeze(
	FOUNDATION_PUBLIC_OPERATION_NAMES.map(opaqueRowId).sort(),
)

function contractFor(name) {
	const conditional = conditionalNames.has(name)
	return Object.freeze({
		id: conditional ? 'conditionalCommercePublicOperation' : 'canonicalFoundationPublicOperation',
		schemaVersion: 'betterpptx.public-operation-capability.v1',
		capabilityMode: 'discrete',
		capabilityStatus: HOST_COMMAND,
		runtimeReady: true,
		componentOwnership: Object.freeze(['publicOperation']),
		overrideFields: Object.freeze([]),
		resetBehavior: NOT_APPLICABLE_RESET,
		precedence: Object.freeze(['public tool schema', 'public dispatcher policy', 'opaque product result']),
		legalCombinations: Object.freeze(['discover or invoke the operation independently of persisted slide styling']),
		applicability: Object.freeze([
			conditional
				? 'available only when the service owner enables the compatibility commerce surface'
				: 'available on the public spec-first operation surface subject to normal entitlement and service policy',
		]),
		limitation: 'This command can create, inspect, validate, retrieve, or dispose product state, but it is not itself serialized as a PowerPoint style or authoring field.',
	})
}

export function publicOperationCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'public-tool' || entry.family !== 'foundation') return null
	const name = String(entry.label || '')
	return operationNames.has(name) ? contractFor(name) : null
}
