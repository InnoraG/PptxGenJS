import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSpecOperationPlan, compactSpecPlan } from '../ir/spec-compiler.mjs'

Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering',
})

function minimalSpec(validation) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Validation intent readback',
		authoringContract: {
			workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off',
			verificationMode: 'complete', geometryAuthority: 'ai',
			placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches',
		},
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		...(validation === undefined ? {} : { validation }),
		slides: [{
			id: 'intent', title: 'Validation intent',
			content: [{ kind: 'title', name: 'headline', text: 'Validation intent', rect: { x: 0.8, y: 1, w: 11.5, h: 1 }, style: { fontSize: 32 } }],
		}],
	}
}

function uncompiledFindings(result) {
	return (result.warnings || []).filter(issue => issue.code === 'SPEC_FIELD_NOT_COMPILED')
}

for (const detail of ['summary', 'full']) {
	test(`supported validation declaration has phase-aware ${detail} evidence without a repair finding`, () => {
		const authoredIntent = { validateBeforeSave: true, requireAccessibility: true }
		const result = compactSpecPlan(buildSpecOperationPlan(minimalSpec(authoredIntent)), detail)
		assert.equal(result.ok, true)
		assert.deepEqual(uncompiledFindings(result), [])
		const readback = result.data.appliedDefaults.validation
		assert.deepEqual(readback.authoredIntent, authoredIntent)
		assert.equal(readback.compile.status, 'passed')
		assert.equal(readback.compile.evidenceScope, 'compiled-plan-only')
		assert.equal(readback.commit.declarationRunsValidation, false)
		assert.equal(readback.beforeSave.status, 'not-evaluated')
		assert.equal(readback.beforeSave.tool, 'betterpptx.deck.validate_quality')
		assert.equal(readback.beforeSave.currentVersionRequired, true)
		assert.equal(readback.beforeSave.accessibilityRequired, true)
		assert.deepEqual(readback.uncompiledFields, [])
		assert.equal('fix' in readback, false)
		assert.equal('next' in readback, false)
		assert.doesNotMatch(JSON.stringify(result), /Run validate_design after commit/)
	})
}

test('false, empty, and absent validation declarations cannot disable required save gates or alter operations', () => {
	const baseline = buildSpecOperationPlan(minimalSpec())
	for (const declaration of [undefined, {}, { validateBeforeSave: false, requireAccessibility: false, previewBeforeSave: false }]) {
		const plan = buildSpecOperationPlan(minimalSpec(declaration))
		assert.deepEqual(plan.operations, baseline.operations)
		assert.deepEqual(plan.appliedDefaults.validation.authoredIntent, declaration || {})
		assert.equal(plan.appliedDefaults.validation.clientMayDisableRequiredValidation, false)
		assert.equal(plan.appliedDefaults.validation.beforeSave.required, true)
		assert.equal(plan.appliedDefaults.validation.beforeSave.accessibilityRequired, true)
		assert.deepEqual(uncompiledFindings(plan), [])
	}
})

test('preview declarations do not override either deployment policy or claim a preview occurred', () => {
	const previous = process.env.BETTERPPTX_VERIFICATION_POLICY
	try {
		for (const policy of ['production-non-rendering', 'release-powerpoint']) {
			process.env.BETTERPPTX_VERIFICATION_POLICY = policy
			for (const requested of [true, false]) {
				const plan = buildSpecOperationPlan(minimalSpec({ previewBeforeSave: requested }))
				assert.deepEqual(uncompiledFindings(plan), [])
				const preview = plan.appliedDefaults.validation.preview
				assert.equal(preview.requestedBeforeSave, requested)
				assert.equal(preview.policy, policy)
				assert.equal(preview.requiredForSave, policy === 'release-powerpoint')
				assert.equal(preview.declarationOverridesPolicy, false)
				assert.equal(preview.status, 'not-evaluated')
			}
		}
	} finally {
		process.env.BETTERPPTX_VERIFICATION_POLICY = previous
	}
})

test('unsupported validation requirements and other uncompiled fields retain individual findings', () => {
	const spec = minimalSpec({ validateBeforeSave: true, requireAccessibility: true, minDesignScore: 99, customGate: true })
	spec.costPolicy = { maximum: 1 }
	spec.resolutionPolicy = { mode: 'locked-only' }
	const plan = buildSpecOperationPlan(spec)
	const fields = uncompiledFindings(plan).map(issue => issue.field)
	assert.deepEqual(fields, ['validation.minDesignScore', 'validation.customGate', 'costPolicy', 'resolutionPolicy'])
	assert.deepEqual(plan.appliedDefaults.validation.uncompiledFields, ['validation.minDesignScore', 'validation.customGate'])
	assert.deepEqual(plan.appliedDefaults.validation.authoredIntent, { validateBeforeSave: true, requireAccessibility: true })
	assert.ok(uncompiledFindings(plan).every(issue => issue.fix))
	assert.ok(uncompiledFindings(plan).filter(issue => issue.field.startsWith('validation.')).every(issue => issue.evidence.appliedBy === 'not-compiled'))
})

test('existing scoped readability, font, and morph policies are not misreported as uncompiled intent', () => {
	const plan = buildSpecOperationPlan(minimalSpec({
		validateBeforeSave: true, readabilityPolicy: 'projection',
		fontPolicy: { mode: 'substitute-and-warn' }, morphPolicy: { unmatched: 'warn', fallback: 'fade' },
	}))
	assert.deepEqual(uncompiledFindings(plan), [])
	assert.deepEqual(plan.appliedDefaults.validation.scopedPolicyFields, ['readabilityPolicy', 'fontPolicy', 'morphPolicy'])
})

test('malformed validation declarations fail before being reported as supported', () => {
	for (const validation of [null, [], 'true', { validateBeforeSave: 'true' }, { requireAccessibility: 1 }, { previewBeforeSave: null }]) {
		assert.throws(() => buildSpecOperationPlan(minimalSpec(validation)), /validation(?:\.[a-zA-Z]+)? must be (?:an object|a boolean)/)
	}
})

test('supported intent does not hide genuine native argument rejection', () => {
	const spec = minimalSpec({ validateBeforeSave: true, requireAccessibility: true })
	spec.slides[0].content[0].text = [{ text: 'Invalid underline', options: { underline: 'unsupported-underline' } }]
	assert.throws(() => buildSpecOperationPlan(spec), /underline/i)
})

test('public dryRun and commit retain compile-only evidence and require current-version quality validation', async () => {
	const { createMcpToolDispatcher, currentVersionValidationVerification, getDeck } = await import('../engine.mjs')
	const { TOOLS } = await import('../tools.mjs')
	const schema = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec').outputSchema
	assert.equal(schema.properties.data.properties.appliedDefaults.additionalProperties, true)
	const mcp = createMcpToolDispatcher({ sessionId: `validation-readback-${Date.now()}`, blackBox: true })
	const spec = minimalSpec({ validateBeforeSave: true, requireAccessibility: true })
	let deckId
	try {
		const dry = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', detail: 'summary' })
		assert.equal(dry.ok, true, JSON.stringify(dry.error))
		const dryData = dry.data || dry
		assert.equal(dryData.mutationFree, true)
		assert.equal(dryData.deckId, undefined)
		assert.deepEqual(uncompiledFindings(dryData), [])
		assert.equal(dryData.appliedDefaults.validation.beforeSave.status, 'not-evaluated')
		const committed = await mcp.call('betterpptx.deck.generate_from_spec', {
			spec, phase: 'commit', commitMode: 'createNew', detail: 'full', validateAfterCompile: true,
		})
		assert.equal(committed.ok, true, JSON.stringify(committed.error))
		const data = committed.data || committed
		deckId = data.deckId
		assert.ok(deckId)
		assert.ok(data.validation, 'explicit validateAfterCompile should still return its limited validation result')
		assert.deepEqual(data.appliedDefaults.validation, dryData.appliedDefaults.validation)
		assert.deepEqual(uncompiledFindings(data), [])
		assert.equal(currentVersionValidationVerification(getDeck(deckId)).complete, false)
		const save = await mcp.call('betterpptx.deck.save', { deckId, idempotencyKey: 'validation-intent-not-quality-evidence' })
		assert.equal(save.ok, false)
		assert.equal(save.error.code, 'CURRENT_VERSION_VALIDATION_REQUIRED')
		assert.equal(save.error.artifact_state, 'not_saved')
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
