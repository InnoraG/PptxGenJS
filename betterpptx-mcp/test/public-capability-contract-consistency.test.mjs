import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'

const { publicToolList } = await import('../blackbox.mjs')
const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')
const { publicCapabilityOverview, PUBLIC_MOTION_CAPABILITY_CONTRACT } = await import('../authoring-capability-registry.mjs')
const { PRESENTER_PERFORMANCE_CONTRACT, PRESENTER_PERFORMANCE_LIMITS, PRESENTER_PERFORMANCE_SCHEMA, normalizePresenterPerformance } = await import('../presenter-performance-contract.mjs')
const { validatedPresenterPerformanceRecipe } = await import('../ir/presenter-performance-composer.mjs')

const dispatcher = createMcpToolDispatcher({ sessionId: 'public-capability-contract-consistency' })

function walk(value, visit, path = []) {
	if (!value || typeof value !== 'object') return undefined
	const found = visit(value, path)
	if (found !== undefined) return found
	if (Array.isArray(value)) {
		for (const [index, child] of value.entries()) {
			const result = walk(child, visit, [...path, index])
			if (result !== undefined) return result
		}
		return undefined
	}
	for (const [key, child] of Object.entries(value)) {
		const result = walk(child, visit, [...path, key])
		if (result !== undefined) return result
	}
	return undefined
}

function servedPerformanceSchema() {
	const tool = publicToolList(TOOLS, { fullSchemas: true }).find(row => row.name === 'betterpptx.deck.generate_from_spec')
	assert.ok(tool, 'public generate_from_spec must be served')
	const result = walk(tool.inputSchema, value => {
		const properties = value?.properties
		if (!properties?.actions || !properties?.transforms || !properties?.fps) return undefined
		if (properties.actions.maxItems !== PRESENTER_PERFORMANCE_LIMITS.maximumActions) return undefined
		if (properties.transforms.maxItems !== PRESENTER_PERFORMANCE_LIMITS.maximumTransformKeyframes) return undefined
		return value
	})
	assert.ok(result, 'served generate_from_spec schema must expose presenterPerformance')
	return result
}

function basePerformance(overrides = {}) {
	return {
		actions: [{ id: 'action-1', motionId: 'motion.ordinary.idle', durationMs: 1000 }],
		...overrides,
	}
}

test('registry, overview, recipe, served schema, normalizer, and composer share presenter limits', async () => {
	assert.deepEqual(PRESENTER_PERFORMANCE_CONTRACT.limits, PRESENTER_PERFORMANCE_LIMITS)
	assert.deepEqual(PUBLIC_MOTION_CAPABILITY_CONTRACT.continuousPerformance.limits, PRESENTER_PERFORMANCE_LIMITS)

	const overview = publicCapabilityOverview({ includeReadiness: false })
	assert.deepEqual(overview.motion.continuousPerformance.limits, PRESENTER_PERFORMANCE_LIMITS)
	assert.deepEqual(overview.motion.continuousPerformance.sampling.range, PRESENTER_PERFORMANCE_LIMITS.fpsRange)

	const recipeResult = await dispatcher.call('betterpptx.help.tool_recipe', { surface: 'animation', detail: 'full' })
	assert.equal(recipeResult.ok, true, JSON.stringify(recipeResult.error || recipeResult))
	const recipe = recipeResult.data
	assert.equal(recipe.detail, 'full')
	assert.deepEqual(recipe.recipes[0].presenterPerformance.limits, PRESENTER_PERFORMANCE_LIMITS)
	assert.deepEqual(recipe.recipes[0].presenterPerformance.sampling.range, PRESENTER_PERFORMANCE_LIMITS.fpsRange)

	const served = servedPerformanceSchema()
	assert.deepEqual(served, PRESENTER_PERFORMANCE_SCHEMA)
	assert.equal(served.properties.actions.maxItems, PRESENTER_PERFORMANCE_LIMITS.maximumActions)
	assert.equal(served.properties.actions.items.properties.durationMs.minimum, PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[0])
	assert.equal(served.properties.actions.items.properties.durationMs.maximum, PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1])
	assert.equal(served.properties.blendMs.maximum, PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs)
	assert.equal(served.properties.transforms.maxItems, PRESENTER_PERFORMANCE_LIMITS.maximumTransformKeyframes)
	assert.equal(served.properties.travel.maxItems, PRESENTER_PERFORMANCE_LIMITS.maximumTravelKeyframes)
	assert.equal(served.properties.interactions.maxItems, PRESENTER_PERFORMANCE_LIMITS.maximumInteractions)
	assert.equal(served.properties.fps.minimum, PRESENTER_PERFORMANCE_LIMITS.fpsRange[0])
	assert.equal(served.properties.fps.maximum, PRESENTER_PERFORMANCE_LIMITS.fpsRange[1])

	assert.equal(normalizePresenterPerformance(basePerformance({ blendMs: PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs })).blendMs, PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs)
	assert.equal(validatedPresenterPerformanceRecipe(basePerformance({ blendMs: PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs })).blendMs, PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs)
	assert.equal(normalizePresenterPerformance(basePerformance({ fps: PRESENTER_PERFORMANCE_LIMITS.fpsRange[1] })).fps, PRESENTER_PERFORMANCE_LIMITS.fpsRange[1])
	assert.equal(validatedPresenterPerformanceRecipe(basePerformance({ fps: PRESENTER_PERFORMANCE_LIMITS.fpsRange[1] })).fps, PRESENTER_PERFORMANCE_LIMITS.fpsRange[1])

	const atDurationBoundary = { actions: [{ id: 'a', motionId: 'motion.ordinary.idle', durationMs: PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1] }, { id: 'b', motionId: 'motion.ordinary.talk', durationMs: PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1] }] }
	assert.equal(normalizePresenterPerformance(atDurationBoundary).durationMs, PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs)
	assert.equal(validatedPresenterPerformanceRecipe(atDurationBoundary).durationMs, PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs)
})

test('authoritative presenter boundaries fail consistently before execution', () => {
	const tooMuchBlend = basePerformance({ blendMs: PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs + 1 })
	assert.throws(() => normalizePresenterPerformance(tooMuchBlend), /blendMs.*2000|2000.*blendMs/i)
	assert.throws(() => validatedPresenterPerformanceRecipe(tooMuchBlend), /blendMs.*2000|2000.*blendMs/i)

	const tooManyTransforms = basePerformance({
		actions: [{ id: 'a', motionId: 'motion.ordinary.idle', durationMs: 13000 }],
		transforms: Array.from({ length: PRESENTER_PERFORMANCE_LIMITS.maximumTransformKeyframes + 1 }, (_, atMs) => ({ atMs, yawDegrees: 0 })),
	})
	assert.throws(() => normalizePresenterPerformance(tooManyTransforms), /at most 128/i)
	assert.throws(() => validatedPresenterPerformanceRecipe(tooManyTransforms), /at most 128/i)

	const tooManyInteractions = basePerformance({
		interactions: Array.from({ length: PRESENTER_PERFORMANCE_LIMITS.maximumInteractions + 1 }, (_, index) => ({ actionId: 'action-1', verb: 'point-at', target: `target-${index}` })),
	})
	assert.throws(() => normalizePresenterPerformance(tooManyInteractions), /at most 32/i)

	for (const value of [PRESENTER_PERFORMANCE_LIMITS.fpsRange[1] + 1, PRESENTER_PERFORMANCE_LIMITS.fpsRange[0] - 1]) {
		assert.throws(() => normalizePresenterPerformance(basePerformance({ fps: value })), /fps.*from/i)
		assert.throws(() => validatedPresenterPerformanceRecipe(basePerformance({ fps: value })), /fps.*from/i)
	}
	assert.throws(() => normalizePresenterPerformance(basePerformance({ blendMs: PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs + 1 })), /from 0 to 2000/i)
	assert.throws(() => validatedPresenterPerformanceRecipe(basePerformance({ actions: [{ id: 'a', motionId: 'motion.ordinary.idle', durationMs: PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1] + 1 }] })), /60000/i)
	assert.throws(() => normalizePresenterPerformance({ actions: Array.from({ length: 3 }, (_, index) => ({ id: `a-${index}`, motionId: `motion.test.${index}`, durationMs: 50000 })) }), /120000/i)
})
