#!/usr/bin/env node
import { createMcpToolDispatcher } from './engine.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '1'

function fail(message, detail = {}) {
	console.error('CAPABILITIES ROUTER V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

async function main() {
	const context = { sessionId: `verify-capabilities-router-${Date.now()}` }
	const mcp = createMcpToolDispatcher({ ...context, clientInfo: { name: 'capabilities-router-verifier', version: '1' }, blackBox: true })
	const call = (name, args = {}) => mcp.call(name, args)
	const capabilities = okResult('help.capabilities', await call('betterpptx.help.capabilities', {
		intent: 'Create a repair-free executive decision deck with native chart evidence.',
		detail: 'full',
	}, context))
	for (const key of ['recommendedMode', 'whyBetterPptx', 'requiredTools', 'optionalTools', 'avoid', 'examples', 'nextAction']) {
		if (capabilities[key] === undefined) fail(`capabilities missing ${key}.`, capabilities)
	}
	if (capabilities.recommendedMode !== 'mcp-authoring-excellence-json-spec' || capabilities.authoringSurface !== 'mcp-generate-from-spec-only') fail('capabilities chose wrong public authoring surface for a new deck.', capabilities)
	if (capabilities.authoringApi?.contractVersion !== 'authoring-excellence.api.v1' || capabilities.authoringPrinciples?.worldInputMapping?.contractVersion !== 'authoring-excellence.world-inputs.v1' || !/styleIntent\.artDirection selects/.test(capabilities.authoringPrinciples?.worldInputMapping?.operational || '')) fail('capabilities did not expose the versioned Authoring Excellence API/world-input mapping.', capabilities)
	if (!capabilities.requiredTools.includes('betterpptx.deck.generate_from_spec')) fail('capabilities did not recommend semantic compiler.', capabilities)
	if (!capabilities.avoid.some(item => /low-level markup passthrough/i.test(item))) fail('capabilities avoid guidance missing low-level passthrough warning.', capabilities)
	if (!capabilities.specCapabilityMatrix?.specNative?.some(item => /media/.test(item.kind))) fail('capabilities did not advertise the deterministic spec capability matrix.', capabilities.specCapabilityMatrix)

	const compileExamples = capabilities.examples.filter(item => item.tool === 'betterpptx.deck.generate_from_spec')
	if (!compileExamples.length) fail('capabilities returned no generate_from_spec examples.', capabilities)
	for (const [index, example] of compileExamples.entries()) {
		const payload = example.payload
		if (!payload?.spec) fail('example payload is incomplete.', example)
		const dry = okResult(`example ${index + 1} dryRun`, await call('betterpptx.deck.generate_from_spec', {
			...payload,
			dryRun: true,
		}, context))
		if (dry.dryRun !== true || !dry.planDigest || dry.slideCount < 1) fail('capability example did not dry-run cleanly.', dry)
	}

	// The local maintainer transport must teach an AI the same semantic
	// decision contract as the public black-box surface.  It may add local
	// asset diagnostics, but it must never fall back to the legacy inventory
	// without authoringPrinciples/authoringApi.
	process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	const localMcp = createMcpToolDispatcher({
		sessionId: `verify-local-capabilities-router-${Date.now()}`,
		clientInfo: { name: 'local-capabilities-router-verifier', version: '1' },
	})
	const localCapabilities = okResult('local help.capabilities', await localMcp.call('betterpptx.help.capabilities', {
		intent: 'Create a repair-free executive decision deck with native chart evidence.',
		 detail: 'full',
	}))
	const contractFields = [
		'authoringPrinciples',
		'authoringApi',
		'specCapabilityMatrix',
		'recommendedWorkflow',
	]
	for (const key of contractFields) {
		if (localCapabilities[key] === undefined) fail(`local capabilities missing ${key}.`, localCapabilities)
	}
	if (localCapabilities.authoringApi?.contractVersion !== 'authoring-excellence.api.v1' || localCapabilities.authoringPrinciples?.worldInputMapping?.contractVersion !== capabilities.authoringPrinciples?.worldInputMapping?.contractVersion) fail('local capabilities did not expose the same versioned Authoring Excellence/world-input contract.', localCapabilities)
	if (localCapabilities.authoringPrinciples?.decisionGuide?.contractVersion !== capabilities.authoringPrinciples?.decisionGuide?.contractVersion) fail('local/public decision-guide contracts diverged.', { public: capabilities.authoringPrinciples?.decisionGuide?.contractVersion, local: localCapabilities.authoringPrinciples?.decisionGuide?.contractVersion })
	const publicDecisionStages = (capabilities.authoringPrinciples?.decisionGuide?.orderedDecisions || []).map(item => item.stage)
	const localDecisionStages = (localCapabilities.authoringPrinciples?.decisionGuide?.orderedDecisions || []).map(item => item.stage)
	if (JSON.stringify(localDecisionStages) !== JSON.stringify(publicDecisionStages)) fail('local/public decision order diverged.', { public: publicDecisionStages, local: localDecisionStages })
	if (JSON.stringify(localCapabilities.authoringPrinciples?.decisionGuide?.correctionPolicy?.forbiddenInputs) !== JSON.stringify(capabilities.authoringPrinciples?.decisionGuide?.correctionPolicy?.forbiddenInputs)) fail('local/public decision-guide forbidden-input policy diverged.', { public: capabilities.authoringPrinciples?.decisionGuide?.correctionPolicy?.forbiddenInputs, local: localCapabilities.authoringPrinciples?.decisionGuide?.correctionPolicy?.forbiddenInputs })
	if (localCapabilities.authoringApi?.coordinatePolicy?.mode !== capabilities.authoringApi?.coordinatePolicy?.mode) fail('local/public coordinate policy diverged.', { public: capabilities.authoringApi?.coordinatePolicy, local: localCapabilities.authoringApi?.coordinatePolicy })
	if (JSON.stringify(localCapabilities.authoringApi?.forbiddenInputs) !== JSON.stringify(capabilities.authoringApi?.forbiddenInputs)) fail('local/public forbidden-input policy diverged.', { public: capabilities.authoringApi?.forbiddenInputs, local: localCapabilities.authoringApi?.forbiddenInputs })

	console.log('CAPABILITIES ROUTER V1 VERIFY: PASS')
	console.log(JSON.stringify({
		mode: capabilities.recommendedMode,
		requiredTools: capabilities.requiredTools.length,
		examples: compileExamples.length,
		localContract: localCapabilities.authoringApi.contractVersion,
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
