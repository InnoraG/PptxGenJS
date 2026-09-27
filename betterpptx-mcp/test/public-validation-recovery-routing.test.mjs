import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, currentVersionValidationVerification, getDeck } = await import('../engine.mjs')
const { isPublicToolAllowed } = await import('../blackbox.mjs')
const { TOOLS } = await import('../tools.mjs')

const PUBLIC_SEMANTIC_CORRECTION_TOOL = 'betterpptx.deck.generate_from_spec'
const KNOWN_TOOL_NAMES = new Set(TOOLS.map(tool => tool.name))
const BLOCKED_RECOVERY_TOOLS = new Set([
	'betterpptx.deck.revise',
	'betterpptx.slide.revise',
	'betterpptx.slide.add',
	'betterpptx.deck.define_message_architecture',
	'betterpptx.deck.assign_slide_roles',
	'betterpptx.deck.define_design_system',
])

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function collectPublicToolReferences(value, path = '$', references = []) {
	if (Array.isArray(value)) {
		value.forEach((item, index) => collectPublicToolReferences(item, `${path}[${index}]`, references))
		return references
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) collectPublicToolReferences(child, `${path}.${key}`, references)
		return references
	}
	if (typeof value !== 'string') return references
	for (const match of value.matchAll(/\bbetterpptx\.[a-z0-9_.-]+\b/gi)) {
		if (KNOWN_TOOL_NAMES.has(match[0])) references.push({ path, tool: match[0] })
	}
	return references
}

function assertPublicRecoveryRoutes(label, result) {
	const references = collectPublicToolReferences(result)
	const blocked = references.filter(item => BLOCKED_RECOVERY_TOOLS.has(item.tool) || !isPublicToolAllowed(item.tool))
	assert.deepEqual(blocked, [], `${label} exposed blocked or non-allowlisted recovery routes:\n${JSON.stringify(blocked, null, 2)}`)
	return references
}

function routingProbeSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Public validation recovery routing probe',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: {
			audience: 'public validation clients',
			outcome: 'Recover from findings through semantic authoring only.',
			remember: 'Validation corrections return to the governed JSON spec.',
		},
		handshake: {
			audience: 'public validation clients',
			promise: 'Expose actionable public-safe validation recovery.',
			proof: ['Every correction route is callable on the public spec-first surface.'],
			bar: 'No finding recommends a blocked primitive mutation tool.',
		},
		visualDesign: { world: 'Sparse editorial proof', framing: 'One compact semantic statement.' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		slides: [{
			id: 'routing-probe',
			title: 'Semantic recovery only',
			message: 'Findings return to the semantic spec compiler.',
			layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'routing-probe-title', text: 'Semantic recovery only' },
				{ kind: 'textBox', name: 'routing-probe-body', text: 'Revise meaning, then let the engine resolve geometry.' },
			],
		}],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
}

test('public validation findings and next actions never recommend blocked mutation tools', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `public-validation-routing-${Date.now()}`,
		clientInfo: { name: 'public-validation-routing-test', version: '1' },
		blackBox: true,
	})
	let deckId = null
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: routingProbeSpec(),
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'free',
			detail: 'full',
		}))
		deckId = committed.deckId

		// Corrupt only the in-memory fixture so each public read-only validator has
		// actionable findings to return. Production clients still see and use only
		// the public dispatcher results below.
		const entry = getDeck(deckId)
		const slide = entry.pptx.slides[0]
		delete slide._betterpptxTitle
		for (const obj of slide._slideObjects || []) {
			if (!obj?.options) continue
			delete obj.options.objectName
			obj.options.fontSize = 12
			obj.options.y = 2
		}
		const offSlideObject = (slide._slideObjects || []).find(obj => obj?.options)
		assert.ok(offSlideObject, 'fixture did not materialize an editable slide object')
		offSlideObject.options.x = 20

		const validation = dataOf(await mcp.call('betterpptx.deck.validate', { deckId }))
		const design = dataOf(await mcp.call('betterpptx.deck.validate_design', { deckId, profile: 'modern' }))
		const accessibility = dataOf(await mcp.call('betterpptx.deck.validate_accessibility', { deckId }))
		const quality = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId, profile: 'modern' }))

		assert.ok(validation.findings?.length > 0, JSON.stringify(validation))
		assert.ok(design.issues?.length > 0, JSON.stringify(design))
		assert.ok(accessibility.findings?.length > 0, JSON.stringify(accessibility))
		assert.ok((quality.blockingIssues?.length || 0) + (quality.warnings?.length || 0) > 0, JSON.stringify(quality))
		assert.equal(accessibility.passed, false)
		assert.equal(quality.ok, false, 'a failed required validator must fail the aggregate current-version gate')
		assert.ok(quality.blockingIssues?.some(item => item.gate === 'accessibility'), JSON.stringify(quality.blockingIssues || []))
		const verification = currentVersionValidationVerification(entry)
		assert.equal(verification.complete, false)
		assert.equal(verification.checks.accessibility, false)

		for (const finding of validation.findings) assert.equal(finding.recommendedTool, PUBLIC_SEMANTIC_CORRECTION_TOOL)
		for (const finding of design.issues) assert.equal(finding.recommendedTool, PUBLIC_SEMANTIC_CORRECTION_TOOL)
		for (const finding of accessibility.findings) assert.equal(finding.recommendedTool, PUBLIC_SEMANTIC_CORRECTION_TOOL)
		assert.equal(accessibility.next?.recommendedTool, PUBLIC_SEMANTIC_CORRECTION_TOOL)

		const references = {
			validate: assertPublicRecoveryRoutes('deck.validate', validation).length,
			design: assertPublicRecoveryRoutes('deck.validate_design', design).length,
			accessibility: assertPublicRecoveryRoutes('deck.validate_accessibility', accessibility).length,
			quality: assertPublicRecoveryRoutes('deck.validate_quality', quality).length,
		}
		assert.ok(Object.values(references).every(count => count > 0), JSON.stringify(references))
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
