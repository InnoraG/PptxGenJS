import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')

function baseSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'AI-authored geometry contract',
		layout: 'LAYOUT_WIDE',
			authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			geometryAuthority: 'ai',
			placementPolicy: 'ai-authored-geometry-v1',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: { audience: 'presentation reviewers', outcome: 'prove placement ownership', remember: 'the selected mode is explicit' },
		visualDesign: { world: 'Editorial geometry proof', framing: 'exact native rectangles remain readable' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'single deck clock' },
		slides: [{
			id: 'geometry-proof',
			title: 'AI owns placement',
			role: 'proof',
			message: 'The AI may author exact native rectangles when it selects the explicit geometry mode.',
			layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'headline', text: 'AI owns placement', rect: { x: 0.77, y: 0.41, w: 5.25, h: 0.72 }, style: { fontSize: 34, color: '112233' } },
				{ kind: 'shape', name: 'accent-rule', rect: { x: 0.77, y: 1.35, w: 2.4, h: 0.08 }, style: { fill: { color: '4D88FF' }, line: { transparency: 100 } }, decorative: true },
				{ kind: 'textBox', name: 'body', text: 'Exact body placement remains editable.', options: { x: 7.11, y: 2.02, w: 5.1, h: 1.4 }, style: { fontSize: 20, color: '112233' } },
			],
		}],
	}
}

async function dryRun(spec) {
	const mcp = createMcpToolDispatcher({ sessionId: `ai-authored-geometry-${Date.now()}-${Math.random()}`, blackBox: true })
	return mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
}

test('public discovery exposes only AI-owned composition modes', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `ai-geometry-help-${Date.now()}-${Math.random()}`, blackBox: true })
	const result = await mcp.call('betterpptx.help.capabilities', { detail: 'summary', intent: 'exact AI-authored composition' })
	const data = result.data || result
	const modes = data.authoringPrinciples?.compositionModes || []
	assert.equal(result.ok, true)
	assert.ok(modes.some(mode => mode.id === 'ai-authored-geometry-v1' && mode.geometryAuthority === 'ai' && mode.coordinateSystem === 'inches'))
	assert.ok(modes.some(mode => mode.id === 'visual-reference-pixels-v1' && mode.geometryAuthority === 'ai'))
	assert.ok(modes.every(mode => mode.geometryAuthority === 'ai'))
	assert.ok(!modes.some(mode => mode.id === 'semantic-layout-only'))
	const niceties = data.authoringPrinciples?.powerPointNiceties
	assert.equal(niceties?.input, 'spec.niceties[]')
	assert.match(String(niceties?.geometry || ''), /rect.*pixelFrame/i)
	assert.ok(niceties?.nativeFamilies?.includes('equation'))
	assert.equal(data.authoringPrinciples?.placementPolicy?.forbiddenFieldsApplyTo, 'deactivated-engine-placement')
	assert.ok(data.authoringPrinciples?.placementPolicy?.exactModeAcceptedFields?.includes('rect'))
})

test('visual-reference niceties are expanded before source-pixel conversion', async () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Pixel nicety ordering',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete' },
		visualReference: { schemaVersion: 'betterpptx.visual-reference-reconstruction.v1', mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'reference', title: 'Reference', content: [{ kind: 'textBox', name: 'headline', text: 'Exact', pixelFrame: { x: 160, y: 90, w: 640, h: 90 } }] }],
		niceties: [{ slideId: 'reference', kind: 'shape', name: 'accent', role: 'decorative', decorative: true, shapeName: 'rect', pixelFrame: { x: 160, y: 270, w: 800, h: 18 }, style: { fill: { color: '4D88FF' }, line: { transparency: 100 } }, coherenceReason: 'The accent is part of the observed hierarchy.' }],
	}
	const result = await dryRun(spec)
	assert.equal(result.ok, true, JSON.stringify(result.error || result))
	const objects = (result.data || result).slides[0].objects
	const accent = objects.find(object => String(object.objectName || '').includes('accent'))
	assert.ok(accent, JSON.stringify(objects))
	assert.deepEqual(accent.rect, { x: 1.3333333, y: 2.25, w: 6.6666665, h: 0.15 })
	assert.equal(accent.placementSource, 'author')
})

test('legacy semantic engine placement is rejected for Director-assisted authoring', async () => {
	const spec = baseSpec()
	spec.authoringContract.geometryAuthority = 'engine'
	spec.authoringContract.placementPolicy = 'semantic-layout-only'
	const result = await dryRun(spec)
	assert.equal(result.ok, false)
	assert.equal(result.error?.details?.issues?.[0]?.code, 'ENGINE_GEOMETRY_DEACTIVATED')
})

test('omitted geometry authority fails closed instead of defaulting to engine placement', async () => {
	const spec = baseSpec()
	delete spec.authoringContract.geometryAuthority
	delete spec.authoringContract.placementPolicy
	const result = await dryRun(spec)
	assert.equal(result.ok, false)
	assert.equal(result.error?.details?.issues?.[0]?.code, 'ENGINE_GEOMETRY_DEACTIVATED')
})

test('explicit AI geometry mode preserves exact native object rectangles', async () => {
	const spec = baseSpec()
	const result = await dryRun(spec)
	assert.equal(result.ok, true)
	const data = result.data || result
	assert.equal(data.authoringContract.geometryAuthority, 'ai')
	assert.equal(data.authoringContract.placementPolicy, 'ai-authored-geometry-v1')
	assert.equal(data.authoringContract.geometryPrecision, 'authored-values-preserved-before-native-serialization')
	const objects = data.slides[0].objects
	assert.deepEqual(objects.find(object => object.objectName === 'geometry-proof.headline.title')?.rect, { x: 0.77, y: 0.41, w: 5.25, h: 0.72 })
	assert.deepEqual(objects.find(object => object.objectName === 'geometry-proof.body.textBox')?.rect, { x: 7.11, y: 2.02, w: 5.1, h: 1.4 })
	assert.ok(objects.filter(object => ['geometry-proof.headline.title', 'geometry-proof.accent-rule.shape', 'geometry-proof.body.textBox'].includes(object.objectName)).every(object => object.placementSource === 'author'))
	assert.equal((data.errors || []).length, 0)
})

test('AI geometry mode validates rectangles and still rejects opaque native payloads', async () => {
	const invalid = baseSpec()
	invalid.slides[0].content[0].rect = { x: 1, y: 1, w: 0, h: 1 }
	const invalidResult = await dryRun(invalid)
	assert.equal(invalidResult.ok, false)
	assert.equal(invalidResult.error?.details?.issues?.[0]?.code, 'AI_AUTHORED_GEOMETRY_INVALID')

	const opaque = baseSpec()
	opaque.slides[0].content[0] = { kind: 'opaqueNative', name: 'raw', preservationHandle: 'opaque://public-test', rect: { x: 1, y: 1, w: 4, h: 1 } }
	const opaqueResult = await dryRun(opaque)
	assert.equal(opaqueResult.ok, false)
	assert.equal(opaqueResult.error?.details?.issues?.[0]?.code, 'DIRECTOR_OPAQUE_NATIVE_FORBIDDEN')
})
