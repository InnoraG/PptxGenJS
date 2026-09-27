import test from 'node:test'
import assert from 'node:assert/strict'
import { listAuthoringCapabilities, publicAuthoringCapabilityCatalog, publicCapabilityOverview, resolveAuthoringCapability } from '../authoring-capability-registry.mjs'

test('registry exposes all umbrella families without private implementation paths', () => {
	const catalog = publicAuthoringCapabilityCatalog()
	assert.equal(catalog.status, 'PUBLIC_SEMANTIC_CATALOG')
	assert.equal(catalog.capabilities.length, 11)
	const serialized = JSON.stringify(catalog)
	assert.doesNotMatch(serialized, /(?:^|[^A-Za-z0-9_])(?:[A-Za-z]:[\\/]|node:fs|pptxgen\.es|provider[_-]?key)/i)
	assert.equal(catalog.principle.aiIsDesignMaster, true)
	assert.equal(catalog.principle.engineOwnsRulesSafetySerialization, true)
	const layout = catalog.capabilities.find(capability => capability.id === 'layouts-themes-masters')
	assert.ok(layout)
	assert.doesNotMatch(JSON.stringify(layout), /solve placement|engine solves placement|semantic mode|semantic layout or exact native geometry/i)
	assert.match(JSON.stringify(layout), /AI-authored exact geometry/)
})

test('chart subtypes resolve through the type-specific chart family', () => {
	const result = resolveAuthoringCapability({ family: 'funnel', intent: 'ranked stages' })
	assert.equal(result.status, 'CAPABILITY_RESOLVED')
	assert.equal(result.capability.id, 'charts')
	assert.equal(result.selection.variantChoice.includes('AI-selected exact variant'), true)
	assert.equal(result.selection.selectionAuthority, 'AI')
})

test('unknown opaque modes fail closed with a semantic correction', () => {
	const result = resolveAuthoringCapability({ family: 'shapes', mode: 'opaqueNative' })
	assert.equal(result.status, 'UNSUPPORTED_MODE')
	assert.match(result.correction, /nativeModes|fallbackModes/i)
})

test('family filtering remains deterministic', () => {
	const rows = listAuthoringCapabilities({ family: 'wordart' })
	assert.equal(rows.length, 1)
	assert.equal(rows[0].id, 'wordart-text3d')
})

test('motion catalog exposes explicit AI-authored presenter layering', () => {
	const overview = publicCapabilityOverview({ includeReadiness: false })
	assert.deepEqual(overview.motion.layering.modes, ['presenter-behind-targets'])
	assert.equal(overview.motion.layering.carrier, 'slides[].presenterPerformance.layering')
	assert.match(overview.motion.layering.rule, /AI chooses/i)
	assert.match(overview.motion.layering.rule, /never infers/i)
})
