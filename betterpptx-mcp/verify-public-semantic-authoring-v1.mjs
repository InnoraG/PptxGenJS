#!/usr/bin/env node

// Cold public-client proof: the AI discovers the Authoring Excellence contract,
// compiles one semantic JSON spec, and completes the governed lifecycle without
// importing the engine or using primitive slide mutation.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
// The verifier intentionally creates several independent in-memory adversaries
// in one session. Keep the production default untouched while allowing this
// bounded development proof to reach its later lifecycle assertions.
process.env.BETTERPPTX_SESSION_DECKS_PER_HOUR = '100'
const developmentNoSave = process.argv.includes('--development-no-save')

import http from 'node:http'

const { createMcpToolDispatcher } = await import('./engine.mjs')

const publicDispatcher = createMcpToolDispatcher({
	sessionId: `public-semantic-authoring-${Date.now()}`,
	clientInfo: { name: 'public-semantic-authoring-verifier', version: '1' },
	blackBox: true,
})
let saveCalls = 0
const mcp = {
	async call(name, args) {
		if (name === 'betterpptx.deck.save') saveCalls += 1
		return publicDispatcher.call(name, args)
	},
}

let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail })
	if (condition) pass += 1
	else fail += 1
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const resultData = (label, result) => {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}
const json = value => JSON.stringify(value)
const forbidden = /PptxGenJS|node\.js|express|dependency|source code|cwd|pid|execPath|argv|local filesystem|filesystem path|server filesystem|trellis|unirig|flux[-.\s]?(?:1|2|schnell)|klein\s*4b|black-forest-labs|huggingface|modal\s+l40s|workers\s+ai|liveportrait|musetalk|restoreformer|x-(?:pipeline|enhancement|restoreformer)|providerexecution/i

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Public semantic authoring proof',
	authoringContract: {
		workflow: 'authoring-excellence-director-v1',
		level: 'deterministic',
		coordinateSystem: 'inches',
		layerModel: 'flat-object-array',
		objectIdentity: 'stable-names-required',
	},
	contentStory: {
		audience: 'presentation quality reviewers',
		outcome: 'Prove that a public AI client can author through semantic intent.',
		remember: 'The AI supplies meaning; the engine supplies geometry and package safety.',
	},
	handshake: {
		audience: 'presentation quality reviewers',
		promise: 'Prove governed semantic authorship without delegating design judgment.',
		proof: ['The compiler preserves explicit AI choices and returns factual validation readback.'],
		payoff: 'Reviewers understand the distinction between a pre-commit consistency check and first-time-right evidence.',
		bar: 'The contract is truthful, deterministic, and explicit about the limits of engine validation.',
		commitments: ['ai-design-authority'],
	},
	visualDesign: {
		world: 'Editorial verification sheet',
		framing: 'One clear proof statement on a quiet high-contrast canvas.',
	},
	styleIntent: { artDirection: 'editorial', mode: 'light' },
	motionTime: {
		masterClock: 'authored slide timeline',
		timingSource: 'Authoring Excellence Motion/Time plan',
		syncPolicy: 'Single deck clock governs transitions and narration.',
	},
	layout: 'LAYOUT_WIDE',
	slides: [{
		id: 'public-semantic-proof',
		title: 'Meaning in, geometry out',
		role: 'proof',
		message: 'A public AI client authors semantic intent and receives engine-owned placement.',
		layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'proof-title', text: 'Meaning in, geometry out' },
			{ kind: 'textBox', name: 'proof-body', text: 'Semantic JSON is the only public composition route.', role: 'explanation' },
		],
	}],
	validation: { validateBeforeSave: true, requireAccessibility: true },
}

console.log('PUBLIC SEMANTIC AUTHORING V1 (cold public MCP client):')
const capabilities = resultData('help.capabilities', await mcp.call('betterpptx.help.capabilities', { detail: 'summary', intent: 'semantic authoring proof' }))
const uploadedCapabilities = resultData('uploaded help.capabilities', await mcp.call('betterpptx.help.capabilities', { detail: 'summary', deckType: 'uploaded', intent: 'edit an uploaded presentation' }))
const workflow = resultData('help.workflow', await mcp.call('betterpptx.help.workflow', { detail: 'summary', intent: 'semantic authoring proof' }))
const chartCatalogAlias = resultData('unranked chart catalog alias', await mcp.call('betterpptx.chart.recommend', { limit: 4, format: 'summary' }))
const tableCatalogAlias = resultData('unranked table catalog alias', await mcp.call('betterpptx.table.recommend', { limit: 4, format: 'summary' }))
const smartArtCatalog = resultData('unranked SmartArt catalog', await mcp.call('betterpptx.smartart.catalog', { category: 'process', limit: 4, includeLayouts: true }))
const radialSmartArtCatalog = resultData('Radial Cluster topology catalog', await mcp.call('betterpptx.smartart.catalog', { layoutId: 'urn:microsoft.com/office/officeart/2008/layout/RadialCluster', includeLayouts: true }))
const smartArtCapabilities = resultData('focused SmartArt capabilities', await mcp.call('betterpptx.authoring.capabilities', { family: 'smartart', intent: 'native editable relationship diagram' }))
const motionCapabilities = resultData('focused motion capabilities', await mcp.call('betterpptx.authoring.capabilities', { family: 'motion', intent: 'narration-led semantic motion' }))
const routeMatches = (route, requiredTools) => JSON.stringify(route || []) === JSON.stringify(requiredTools || [])
const expectedVisualReviewLenses = ['communication', 'composition', 'typography', 'colour-and-lighting', 'data-proof', 'native-objects', 'motion-and-timing', 'accessibility', 'technical-integrity', 'beauty']
const advertisedRoutes = [
	...(capabilities.requiredTools || []),
	...(capabilities.optionalTools || []),
	...(uploadedCapabilities.requiredTools || []),
	...(workflow.recommendedFirstCalls || []),
	...(workflow.phases || []).flatMap(phase => phase.tools || []),
]

ok('compact public help is bounded and versioned', capabilities.schemaVersion === 'betterpptx.public-help.v2' && workflow.schemaVersion === 'betterpptx.public-help.v2' && capabilities.detail === 'summary' && workflow.detail === 'summary' && Buffer.byteLength(json(capabilities), 'utf8') <= capabilities.responseBudget?.configured?.maxBytes && Buffer.byteLength(json(workflow), 'utf8') <= workflow.responseBudget?.configured?.maxBytes)
ok('compact capabilities preserve AI design authority and engine execution authority', capabilities.authoringPrinciples?.contractVersion === 'authoring-excellence.public-principles.v2' && capabilities.authoringPrinciples?.designAuthority === 'ai' && capabilities.authoringPrinciples?.engineRole === 'execute-measure-validate-serialize' && capabilities.authoringPrinciples?.decisionAuthority?.aiOwns?.some(item => /exact choices from unranked catalogs/i.test(item)) && capabilities.authoringPrinciples?.decisionAuthority?.engineOwns?.some(item => /final geometry/i.test(item)))
ok('compact capabilities preserve native-first semantic and reference placement guidance',
	/editable PowerPoint objects/i.test(capabilities.authoringPrinciples?.nativeFirstPolicy?.preference || '')
	&& /specific reason/i.test(capabilities.authoringPrinciples?.nativeFirstPolicy?.customException || '')
	&& capabilities.authoringPrinciples?.placementPolicy?.mode === 'semantic-or-visual-reference-pixels'
	&& ['bbox', 'rect', 'x', 'y', 'w', 'h'].every(field => capabilities.authoringPrinciples?.placementPolicy?.forbiddenFields?.includes(field))
	&& capabilities.authoringPrinciples?.placementPolicy?.aiInputs?.includes('layoutIntent')
	&& capabilities.authoringPrinciples?.placementPolicy?.aiInputs?.includes('visualReference + pixelFrame/pixelPoints/pixelPaths when reconstructing an observed reference')
	&& /Use semantic composition normally/i.test(capabilities.authoringPrinciples?.placementPolicy?.rule || '')
	&& /raw PowerPoint bbox\/rect\/x\/y\/w\/h remain forbidden/i.test(capabilities.authoringPrinciples?.placementPolicy?.rule || ''))
ok('compact capabilities preserve semantic data-proof requirements', ['verified:true', 'evidenceSource', 'accessible summary or altText'].every(item => capabilities.authoringPrinciples?.dataProof?.required?.includes(item)) && /Do not invent evidence/i.test(capabilities.authoringPrinciples?.dataProof?.rule || ''))
ok('compact capabilities define truthful first-save FTR and complete preview binding', capabilities.authoringPrinciples?.firstTimeRight?.contractVersion === 'authoring-excellence.first-time-right.v2' && capabilities.authoringPrinciples?.firstTimeRight?.attemptBoundary?.startsAt === 'first betterpptx.deck.save call' && /authoring room/i.test(capabilities.authoringPrinciples?.firstTimeRight?.attemptBoundary?.preSaveAuthoringRoom || '') && /exactly one first save/i.test(capabilities.authoringPrinciples?.firstTimeRight?.attemptBoundary?.passingSaveRule || '') && /batches of at most 12/i.test(capabilities.authoringPrinciples?.firstTimeRight?.releaseCall?.preview || '') && /stable idempotencyKey/i.test(capabilities.authoringPrinciples?.firstTimeRight?.releaseCall?.save || '') && /same idempotencyKey/i.test(capabilities.authoringPrinciples?.firstTimeRight?.releaseCall?.retry || '') && capabilities.authoringPrinciples?.firstTimeRight?.visualReview?.contactSheetIsSufficient === false && routeMatches(capabilities.authoringPrinciples?.firstTimeRight?.visualReview?.lenses, expectedVisualReviewLenses))
ok('compact capabilities preserve the governed semantic lifecycle', capabilities.authoringApi?.contractVersion === 'authoring-excellence.public-api.v2' && capabilities.authoringApi?.compose?.tool === 'betterpptx.deck.generate_from_spec' && capabilities.authoringApi?.compose?.specSchema === 'betterpptx.deck-spec.v1' && routeMatches(capabilities.authoringApi?.compose?.phases?.map(phase => phase.id), ['dryRun', 'resolve', 'commit']) && capabilities.authoringApi?.compose?.phases?.find(phase => phase.id === 'resolve')?.mutatesDeck === false && capabilities.authoringApi?.requiredDomains?.contentStory?.includes('audience') && capabilities.authoringApi?.requiredDomains?.visualDesign?.includes('world') && capabilities.authoringApi?.requiredDomains?.motionTime?.includes('masterClock') && capabilities.authoringApi?.correctionLoop?.some(item => /run dryRun again/i.test(item)))
ok('compact workflow starts with discovery and reaches verification without primitive authoring', workflow.recommendedMode === 'mcp-authoring-excellence-json-spec' && workflow.authoringSurface === 'mcp-generate-from-spec-only' && workflow.capabilityDiscovery?.tool === 'betterpptx.help.capabilities' && workflow.phases?.some(phase => phase.key === 'spec-compilation' && phase.tools?.includes('betterpptx.deck.generate_from_spec')) && workflow.phases?.some(phase => phase.key === 'verification' && phase.exitCriteria?.some(item => /complete:true/i.test(item))) && routeMatches(workflow.routing?.selected, capabilities.requiredTools) && !/betterpptx\.slide\.(?:add|update|delete|reorder|animate|set_)/i.test(json(workflow)))
ok('uploaded compact help exposes preservation-first public routing', uploadedCapabilities.deckType === 'uploaded' && ['betterpptx.deck.open_uploaded', 'betterpptx.deck.summary', 'betterpptx.deck.export_spec', 'betterpptx.deck.generate_from_spec'].every(tool => uploadedCapabilities.requiredTools?.includes(tool)) && uploadedCapabilities.nextAction?.recommendedTool === 'betterpptx.deck.open_uploaded')
ok('progressive discovery routes focused needs to public catalogs', capabilities.progressiveDiscovery?.some(item => item.tool === 'betterpptx.help.tool_recipe') && capabilities.progressiveDiscovery?.some(item => item.tool === 'betterpptx.authoring.catalog') && capabilities.progressiveDiscovery?.some(item => item.tool === 'betterpptx.options.catalog') && advertisedRoutes.length > 0 && advertisedRoutes.every(name => /^betterpptx\.[a-z0-9_.]+$/.test(name)))
ok('chart, table, and SmartArt catalog surfaces are unranked and AI-owned', chartCatalogAlias.contractVersion === 'betterpptx.unranked-chart-catalog.v1' && chartCatalogAlias.unranked === true && chartCatalogAlias.selectionAuthority === 'ai' && chartCatalogAlias.presets?.length > 0 && chartCatalogAlias.presets.every(item => item?.id && !Object.hasOwn(item, 'score') && !Object.hasOwn(item, 'selectionReason')) && chartCatalogAlias.selectedPlan === null && tableCatalogAlias.contractVersion === 'betterpptx.unranked-table-catalog.v1' && tableCatalogAlias.unranked === true && tableCatalogAlias.selectionAuthority === 'ai' && tableCatalogAlias.presets?.length > 0 && tableCatalogAlias.presets.every(item => item?.id && !Object.hasOwn(item, 'score') && !Object.hasOwn(item, 'selectionReason')) && tableCatalogAlias.selectedPlan === null && smartArtCatalog.contractVersion === 'betterpptx.unranked-smartart-catalog.v1' && smartArtCatalog.unranked === true && smartArtCatalog.selectionAuthority === 'ai' && smartArtCatalog.layouts?.length > 0 && !Object.hasOwn(smartArtCatalog, 'recommendation'))
ok('SmartArt catalog exposes executable native node topology', radialSmartArtCatalog.layouts?.length === 1 && radialSmartArtCatalog.layouts[0]?.applicability?.nodeModel === 'single-root-with-children' && radialSmartArtCatalog.layouts[0]?.applicability?.children === 'required' && radialSmartArtCatalog.layouts[0]?.applicability?.topologyContract?.requiredTopLevelNodes === 1 && radialSmartArtCatalog.layouts[0]?.applicability?.topologyContract?.maxChildren === 7)
ok('focused SmartArt capability keeps native selection with the AI', smartArtCapabilities.schemaVersion === 'betterpptx.authoring-capability-catalog.v1' && smartArtCapabilities.principle?.aiIsDesignMaster === true && smartArtCapabilities.principle?.catalogDoesNotSelect === true && smartArtCapabilities.resolution?.status === 'CAPABILITY_RESOLVED' && smartArtCapabilities.resolution?.capability?.id === 'smartart' && smartArtCapabilities.resolution?.selection?.selectionAuthority === 'AI' && smartArtCapabilities.resolution?.selection?.catalogRole === 'exposure-only')
ok('focused motion capability exposes factual limits without selecting a treatment', motionCapabilities.schemaVersion === 'betterpptx.authoring-capability-catalog.v1' && motionCapabilities.principle?.aiIsDesignMaster === true && motionCapabilities.principle?.catalogDoesNotSelect === true && motionCapabilities.resolution?.capability?.id === 'motion-transitions-morph' && motionCapabilities.resolution?.capability?.evidence?.trackedMotionRows === 96 && motionCapabilities.resolution?.capability?.evidence?.executableMotionRows === 56 && motionCapabilities.resolution?.capability?.evidence?.unavailableMotionRows === 40 && motionCapabilities.resolution?.capability?.evidence?.dedicatedInteractionStatus === 'NOT_EXECUTABLE' && motionCapabilities.resolution?.capability?.evidence?.maximumPerPresenterBundle === 18 && motionCapabilities.resolution?.selection?.variantChoice?.includes('AI-selected exact variant'))

const findPublicKeys = (value, key, path = '', found = []) => {
	if (Array.isArray(value)) value.forEach((child, index) => findPublicKeys(child, key, `${path}[${index}]`, found))
	else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => {
		if (childKey === key) found.push(`${path}.${childKey}`)
		findPublicKeys(child, key, `${path}.${childKey}`, found)
	})
	return found
}

const publicSafeFixture = structuredClone(spec)
publicSafeFixture.title = 'Public evidence and timing fixture'
publicSafeFixture.handshake = {
	audience: 'public reviewers',
	promise: 'Connect sourced proof to an actionable implication.',
	proof: ['Three verified stages and three verified outcome measures.'],
	payoff: 'Reviewers can distinguish measured evidence from author synthesis.',
	bar: 'Every data-bearing item is explicit about its evidence source.',
	commitments: ['verified-claims'],
}
publicSafeFixture.slides = [
	{
		id: 'timeline',
		title: 'Evidence accumulates in stages',
		role: 'process',
		message: 'Three sourced stages make the argument inspectable.',
		layoutIntent: 'process-flow',
		narration: {
			script: 'Evidence arrives in three stages.',
			voiceId: 'en_US-ljspeech-high',
			cues: [{ atPhrase: 'three stages', target: 'missing-proof-target', type: 'emphasis', effect: 'pulse' }],
		},
		content: [
			{ kind: 'title', name: 'timeline-title', text: 'Evidence accumulates in stages' },
			{
				kind: 'process',
				name: 'timeline-proof',
				items: [
					{ name: 'observe', label: 'Observe', text: 'Measure the current state.', verified: true, evidenceSource: 'Public benchmark A' },
					{ name: 'compare', label: 'Compare', text: 'Test the alternatives.', verified: true, evidenceSource: 'Public benchmark B' },
					{ name: 'decide', label: 'Decide', text: 'Choose with safeguards.', verified: true, evidenceSource: 'Public benchmark C' },
				],
			},
		],
	},
	{
		id: 'implications',
		title: 'The implication is measurable',
		role: 'proof',
		message: 'Three measures bound the recommendation.',
		layoutIntent: 'metric-grid',
		content: [
			{ kind: 'title', name: 'implications-title', text: 'The implication is measurable' },
			{
				kind: 'metric-grid',
				name: 'implication-metrics',
				items: [
					{ name: 'reach', label: 'Reach', value: '42%', verified: true, evidenceSource: 'Public benchmark D' },
					{ name: 'speed', label: 'Speed', value: '2.1×', verified: true, evidenceSource: 'Public benchmark E' },
					{ name: 'risk', label: 'Risk', value: '−18%', verified: true, evidenceSource: 'Public benchmark F' },
				],
			},
		],
	},
]
const publicTimelineItems = publicSafeFixture.slides.find(slide => slide.id === 'timeline').content.find(block => block.kind === 'process').items
const publicMetricItems = publicSafeFixture.slides.find(slide => slide.id === 'implications').content.find(block => block.kind === 'metric-grid').items
ok('local public fixture carries explicit semantic proof without private provenance', publicTimelineItems.length === 3 && publicMetricItems.length === 3 && [...publicTimelineItems, ...publicMetricItems].every(item => item.verified === true && typeof item.evidenceSource === 'string' && item.evidenceSource.length > 0) && ![...publicTimelineItems, ...publicMetricItems].some(item => Object.hasOwn(item, 'provenance')))

const publicPayloads = [capabilities, workflow, uploadedCapabilities, chartCatalogAlias, tableCatalogAlias, smartArtCatalog, smartArtCapabilities, motionCapabilities]
const publicProvenanceKeys = publicPayloads.flatMap(value => findPublicKeys(value, 'provenance'))
ok('public discovery payloads contain no private provenance keys or vocabulary', publicProvenanceKeys.length === 0 && publicPayloads.every(value => !forbidden.test(json(value))), publicProvenanceKeys.slice(0, 8).join(', '))

const unsafeProofSpec = structuredClone(publicSafeFixture)
unsafeProofSpec.slides.find(slide => slide.id === 'timeline').content.find(block => block.kind === 'process').items[0].evidenceSource = 'PUBLIC_PROOF_PRIVATE_PATH_SENTINEL'
const unsafeProofDryRun = await mcp.call('betterpptx.deck.generate_from_spec', { spec: unsafeProofSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
ok('public dry-run does not echo path-like semantic proof text', !json(unsafeProofDryRun).includes('PUBLIC_PROOF_PRIVATE_PATH_SENTINEL'))
const windowsPathProofSpec = structuredClone(publicSafeFixture)
windowsPathProofSpec.slides.find(slide => slide.id === 'timeline').content.find(block => block.kind === 'process').items[0].evidenceSource = 'D:\\private\\secret\\source.json'
const windowsPathProofDryRun = await mcp.call('betterpptx.deck.generate_from_spec', { spec: windowsPathProofSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
ok('public dry-run does not echo Windows paths in semantic proof', !json(windowsPathProofDryRun).includes('D:\\private\\secret\\source.json') && !json(windowsPathProofDryRun).includes('source.json'))
const proofFamilies = [
	{ name: 'chart-panel', block: { kind: 'chart-panel', name: 'chart', chartType: 'bar', data: [{ name: 'Series', labels: ['A'], values: [1] }] } },
	{ name: 'table-panel', block: { kind: 'table-panel', name: 'table', rows: [[{ text: 'Metric' }], [{ text: '1' }]] } },
	{ name: 'stat', block: { kind: 'stat', name: 'stat', value: '1', label: 'metric' } },
	{ name: 'kpi', block: { kind: 'kpi', name: 'kpi', value: '1', label: 'kpi' } },
	{ name: 'smartart', block: { kind: 'smartart', name: 'smartart', nodes: [{ text: 'One' }] } },
	{ name: 'diagram', block: { kind: 'diagram', name: 'diagram', nodes: [{ text: 'One' }] } },
	{ name: 'metric-grid', block: { kind: 'metric-grid', name: 'metrics', items: [{ name: 'one', label: 'One', value: '1' }] } },
	{ name: 'timeline', block: { kind: 'timeline', name: 'timeline', items: [{ name: 'one', label: 'One', text: 'First' }] } },
	{ name: 'process', block: { kind: 'process', name: 'process', items: [{ name: 'one', label: 'One', text: 'First' }] } },
	{ name: 'comparison-dataRef', block: { kind: 'comparison', name: 'comparison', dataRef: 'options', items: [{ name: 'a', label: 'A', text: 'One' }, { name: 'b', label: 'B', text: 'Two' }] } },
]
const familySpec = structuredClone(spec)
familySpec.title = 'Public proof families'
familySpec.slides[0].content = [{ kind: 'title', name: 'proof-title', text: 'Proof families' }, ...proofFamilies.map(family => structuredClone(family.block))]
const unverifiedFamilies = resultData('unverified data-family dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: familySpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' }))
const verifiedFamilySpec = structuredClone(familySpec)
for (const verifiedBlock of verifiedFamilySpec.slides[0].content.slice(1)) {
	if (Array.isArray(verifiedBlock.items) && verifiedBlock.items.length > 0) {
		for (const item of verifiedBlock.items) { item.verified = true; item.evidenceSource = 'public-verifier-fixture' }
	} else {
		verifiedBlock.verified = true
		verifiedBlock.evidenceSource = 'public-verifier-fixture'
	}
}
const verifiedFamilies = resultData('verified data-family dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: verifiedFamilySpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' }))
const unverifiedFamilyWarnings = (unverifiedFamilies.warnings || []).filter(item => item.code === 'UNVERIFIED_DATA')
const verifiedFamilyWarnings = (verifiedFamilies.warnings || []).filter(item => item.code === 'UNVERIFIED_DATA')
const proofFamilyResults = proofFamilies.map(family => ({ name: family.name, unverified: unverifiedFamilyWarnings.some(item => String(item.objectName || '').toLowerCase().includes(family.name.split('-')[0])), verified: verifiedFamilyWarnings.length === 0 }))
ok('public dry-run enforces semantic proof across all data families', proofFamilyResults.length === proofFamilies.length && proofFamilyResults.every(item => item.unverified && item.verified), JSON.stringify(proofFamilyResults))
const compositeReadabilitySpec = structuredClone(spec)
compositeReadabilitySpec.title = 'Composite readability adversary'
compositeReadabilitySpec.slides[0] = {
	...compositeReadabilitySpec.slides[0],
	id: 'composite-readability',
	layoutIntent: 'three-column',
	content: [
		{ kind: 'title', name: 'composite-title', text: 'Composite text must remain readable' },
		{ kind: 'table-panel', name: 'narrow-table', verified: true, evidenceSource: 'public-verifier-fixture', rows: [['A deliberately long label that cannot fit a half-inch authored column at presentation size.', 'Wide']], tableOptions: { fontSize: 8, colW: [0.5, 5.5], rowH: [0.5] } },
		{ kind: 'smartart', name: 'small-smartart', verified: true, evidenceSource: 'public-verifier-fixture', style: { fontSize: 8 }, nodes: [{ text: 'One' }, { text: 'Two' }] },
		{ kind: 'metric-grid', name: 'metric-role-probe', verified: true, evidenceSource: 'public-verifier-fixture', items: [{ name: 'probe', label: 'Evidence', value: '15%', text: 'Window · owner' }] },
	],
}
compositeReadabilitySpec.slides.push({
	id: 'process-role-readability',
	title: 'Process labels use the diagram floor',
	message: 'Default semantic process labels are diagram copy, not body paragraphs.',
	role: 'process',
	layoutIntent: 'process-flow',
	content: [
		{ kind: 'title', name: 'process-role-title', text: 'Process labels use the diagram floor' },
		{ kind: 'process', name: 'process-role-probe', verified: true, evidenceSource: 'public-verifier-fixture', items: [{ name: 'one', label: 'Control', text: 'Identity and telemetry' }, { name: 'two', label: 'Prove', text: 'Recovery rehearsal' }, { name: 'three', label: 'Release', text: 'Board decision' }] },
	],
})
const compositeReadabilityDryRun = resultData('composite readability dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: compositeReadabilitySpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' }))
const compositeReadabilityFindings = compositeReadabilityDryRun.warnings || []
ok('public dry-run exposes actionable table and SmartArt text blockers', compositeReadabilityFindings.some(item => item.code === 'TEXT_OVERFLOW_RISK' && String(item.objectName || '').includes('narrow-table')) && ['narrow-table', 'small-smartart'].every(name => compositeReadabilityFindings.some(item => item.code === 'SMALL_TEXT_READABILITY_RISK' && String(item.objectName || '').includes(name))))
const radialTopologySpec = structuredClone(spec)
radialTopologySpec.title = 'Native SmartArt topology adversary'
radialTopologySpec.slides[0] = {
	...radialTopologySpec.slides[0],
	id: 'radial-topology',
	title: 'One center with related influences',
	layoutIntent: 'process-flow',
	content: [
		{ kind: 'title', name: 'radial-title', text: 'One center with related influences' },
		{ kind: 'smartart', name: 'radial', mode: 'native', layout: 'relationship', layoutId: 'urn:microsoft.com/office/officeart/2008/layout/RadialCluster', style: { textColorRole: 'onDark' }, nodes: [{ text: 'Center' }, { text: 'One' }, { text: 'Two' }, { text: 'Three' }], verified: true, evidenceSource: 'public-verifier-fixture', altText: 'Radial relationship topology probe.' },
	],
}
const flatRadialResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: radialTopologySpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
const flatRadialFinding = (flatRadialResult?.error?.details?.errors || []).find(item => item.code === 'SMARTART_NODE_TOPOLOGY_INVALID')
ok('public dry-run blocks native SmartArt nodes that would be invisible', flatRadialResult?.ok === false && flatRadialFinding?.severity === 'error' && flatRadialFinding?.evidence?.failure === 'top-level-node-count' && flatRadialFinding?.evidence?.engineAction === 'block-before-commit' && /children/i.test(flatRadialFinding?.fix || '') && flatRadialResult?.error?.next_actions?.[0]?.type === 'correct_smartart_node_topology')
const nestedRadialSpec = structuredClone(radialTopologySpec)
nestedRadialSpec.slides[0].content[1].nodes = [{ text: 'Center', children: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }] }]
const nestedRadialDryRun = resultData('nested Radial Cluster dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: nestedRadialSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' }))
ok('public dry-run accepts executable Radial Cluster hierarchy', !(nestedRadialDryRun.warnings || []).some(item => item.code === 'SMARTART_NODE_TOPOLOGY_INVALID'))

const stagedPresenterSpec = structuredClone(spec)
stagedPresenterSpec.presenter = { identity: 'joe', stage: 'right', stageTreatment: 'floor-ellipse', onSlides: 'all', choreography: 'subtle' }
const stagedPresenterDryRun = resultData('AI-selected presenter stage dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: stagedPresenterSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' }))
const stagedPresenterObjects = stagedPresenterDryRun.slides?.[0]?.objects || []
const stagedPresenterIndex = stagedPresenterObjects.findIndex(item => item.objectName === 'presenter')
const stagedFloor = stagedPresenterObjects[stagedPresenterIndex - 1]
const stagedPresenterPass = stagedPresenterIndex > 0 && stagedFloor?.objectName === 'public-semantic-proof.presenter-stage-floor' && stagedFloor?.role === 'decorative' && stagedFloor?.placementSource === 'engine' && stagedFloor?.placementIntentSource === 'engine-proposal' && stagedPresenterObjects[stagedPresenterIndex]?.placementSource === 'engine' && stagedPresenterDryRun.appliedDefaults?.presenter?.stage === 'right' && stagedPresenterDryRun.appliedDefaults?.presenter?.stageTreatment?.id === 'floor-ellipse' && stagedPresenterDryRun.appliedDefaults?.presenter?.stageTreatment?.source === 'author'
ok('public dry-run executes the exact AI-selected presenter stage treatment', stagedPresenterPass, stagedPresenterPass ? '' : json({ objects: stagedPresenterObjects, presenter: stagedPresenterDryRun.appliedDefaults?.presenter }))

const invalidStageTreatmentSpec = structuredClone(stagedPresenterSpec)
invalidStageTreatmentSpec.presenter.stageTreatment = 'auto-beautify'
const invalidStageTreatmentResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: invalidStageTreatmentSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' })
const invalidStageTreatmentFinding = invalidStageTreatmentResult?.error?.details?.errors?.find(item => item.code === 'PRESENTER_STAGE_TREATMENT_INVALID')
const invalidStageTreatmentPass = invalidStageTreatmentResult?.ok === false && invalidStageTreatmentFinding?.requested === 'auto-beautify' && invalidStageTreatmentFinding?.supported?.join(',') === 'none,floor-ellipse' && /none or floor-ellipse/i.test(invalidStageTreatmentFinding?.fix || '') && invalidStageTreatmentResult?.error?.recoverable === true && invalidStageTreatmentResult?.error?.retry_safe === true && invalidStageTreatmentResult?.error?.next_actions?.[0]?.type === 'choose_presenter_stage_treatment'
ok('invalid presenter stage treatment fails closed with an actionable public correction', invalidStageTreatmentPass, invalidStageTreatmentPass ? '' : json(invalidStageTreatmentResult))

const invalidDirectorSpec = structuredClone(spec)
invalidDirectorSpec.slides[0].content[0].bbox = { x: 1, y: 1, w: 4, h: 1 }
const invalidDirectorResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: invalidDirectorSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
const invalidDirectorIssues = invalidDirectorResult?.error?.details?.issues || invalidDirectorResult?.data?.errors || invalidDirectorResult?.errors || []
const invalidDirectorIssue = invalidDirectorIssues.find(item => item.code === 'DIRECTOR_ENGINE_PLACEMENT_REQUIRED')
ok('invalid Director input exposes actionable correction evidence', invalidDirectorResult?.ok === false && typeof invalidDirectorIssue?.reason === 'string' && typeof invalidDirectorIssue?.fix === 'string' && invalidDirectorIssue?.evidence?.code === 'DIRECTOR_ENGINE_PLACEMENT_REQUIRED' && !forbidden.test(json(invalidDirectorResult)))

const visibleCaptionSpec = structuredClone(spec)
visibleCaptionSpec.slides[0].narration = { script: 'The spoken script belongs in native narration and speaker notes.', timeline: { captions: [{ atMs: 0, text: 'Do not render this subtitle.' }] } }
const visibleCaptionResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: visibleCaptionSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
const visibleCaptionIssues = visibleCaptionResult?.error?.details?.issues || visibleCaptionResult?.data?.errors || visibleCaptionResult?.errors || []
const visibleCaptionIssue = visibleCaptionIssues.find(item => item.code === 'NON_NATIVE_CAPTION_FIELD_REMOVED')
ok('overlay caption fields are rejected only when explicitly submitted', visibleCaptionResult?.ok === false && visibleCaptionIssue?.evidence?.code === 'NON_NATIVE_CAPTION_FIELD_REMOVED' && /closedCaptionTracks/i.test(visibleCaptionIssue?.fix || visibleCaptionIssue?.message || ''))

const ordinaryNarrationSpec = structuredClone(spec)
ordinaryNarrationSpec.slides[0].narration = { text: 'The spoken script belongs in native narration and speaker notes.', synthesizeAudio: true, preserveInNotes: true, voiceId: 'en_US-ljspeech-high' }
const ordinaryNarrationResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: ordinaryNarrationSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
const ordinaryNarrationIssues = ordinaryNarrationResult?.error?.details?.issues || ordinaryNarrationResult?.data?.errors || ordinaryNarrationResult?.errors || []
ok('ordinary narration is not treated as overlay captions', !ordinaryNarrationIssues.some(item => item.code === 'NON_NATIVE_CAPTION_FIELD_REMOVED' || item.code === 'DIRECTOR_VISIBLE_CAPTIONS_REMOVED') && !/DIRECTOR_VISIBLE_CAPTIONS_REMOVED/.test(json(ordinaryNarrationResult)))

const missingSpecResult = await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', commitMode: 'createNew' })
const missingSpecFinding = missingSpecResult?.error?.details?.errors?.[0]
ok('early spec errors expose the declared correction contract', missingSpecResult?.ok === false && missingSpecFinding?.code === 'SPEC_REQUIRED' && typeof missingSpecFinding?.message === 'string' && typeof missingSpecFinding?.reason === 'string' && typeof missingSpecFinding?.fix === 'string' && missingSpecFinding?.evidence?.scope === 'spec-error' && !forbidden.test(json(missingSpecResult)))
ok('early spec errors expose an explicit public next action', missingSpecResult?.error?.recoverable === true && missingSpecResult?.error?.next_actions?.[0]?.type === 'provide_spec' && missingSpecResult?.error?.next_actions?.[0]?.tool === 'betterpptx.deck.generate_from_spec' && missingSpecResult?.error?.retry_safe === true)

const missingZoomSpec = structuredClone(spec)
missingZoomSpec.slides[0].sectionZoom = { name: 'missing-section-zoom', enabled: true }
const missingZoomDryRun = resultData('missing zoom target dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: missingZoomSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full' }))
const missingZoomFinding = (missingZoomDryRun.warnings || []).find(item => item.code === 'ZOOM_TARGET_MISSING')
ok('missing semantic zoom target exposes actionable correction evidence', typeof missingZoomFinding?.reason === 'string' && typeof missingZoomFinding?.fix === 'string' && missingZoomFinding?.evidence?.selector === 'targetSection')
const fixtureAuthoringDryRun = resultData('local public fixture actionable dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: publicSafeFixture, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full' }))
const fixtureFindings = [...(fixtureAuthoringDryRun.warnings || []), ...(fixtureAuthoringDryRun.errors || [])]
ok('public dry-run findings carry the declared message shape', fixtureFindings.length > 0 && fixtureFindings.every(item => typeof item.message === 'string' && item.message.length > 0 && typeof item.reason === 'string' && typeof item.fix === 'string' && item.evidence && typeof item.evidence === 'object'))
const timingFindings = fixtureFindings.filter(item => ['NARRATION_TOO_SHORT_FOR_CONTENT', 'NARRATION_LONG_FOR_BUILD', 'NARRATION_CUE_TARGET_MISSING'].includes(item.code))
ok('public timing findings carry the shared correction contract', timingFindings.length > 0 && timingFindings.every(item => typeof item.message === 'string' && typeof item.reason === 'string' && typeof item.fix === 'string' && item.evidence && typeof item.evidence === 'object'))

const dryRun = resultData('generate_from_spec dryRun', await mcp.call('betterpptx.deck.generate_from_spec', {
	spec,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
}))
ok('dry-run is mutation-free', dryRun.dryRun === true && dryRun.mutationFree === true && !dryRun.deckId)
ok('dry-run returns deterministic engine readback', typeof dryRun.planDigest === 'string' && dryRun.planDigest.length > 10 && Array.isArray(dryRun.slides) && dryRun.slides.length === 1)
const objectiveBlockerCodes = new Set(['TEXT_OVERFLOW_RISK', 'SMALL_TEXT_READABILITY_RISK', 'LOW_TEXT_CONTRAST', 'OFF_SLIDE_OBJECT', 'VISUAL_OFF_SLIDE', 'UNVERIFIED_DATA', 'COMPOSITE_TEXT_FIT_UNRESOLVED'])
ok('public happy-path dry-run has zero objective first-pass blockers', [...(dryRun.errors || []), ...(dryRun.warnings || [])].every(item => !objectiveBlockerCodes.has(item.code)))
ok('generation readback exposes executable theme-synchronised text colours', dryRun.appliedDefaults?.typographicColor?.contractVersion === 'authoring-excellence.typographic-color.v1' && dryRun.appliedDefaults?.typographicColor?.decisionAuthority === 'AI' && ['primary', 'secondary', 'accent', 'displayAccent', 'proof', 'caution', 'onDark', 'onLight'].every(role => /^[0-9A-F]{6}$/.test(String(dryRun.appliedDefaults?.typographicColor?.roles?.[role]?.color || ''))) && new Set(['primary', 'secondary', 'accent', 'displayAccent', 'proof', 'caution'].map(role => dryRun.appliedDefaults.typographicColor.roles[role].color)).size >= 4)
ok('generation readback returns the AI spatial-authoring contract', dryRun.authoringContracts?.avatarFrame?.shape === 'ellipse' && dryRun.authoringContracts?.avatarFrame?.crop === 'centered-cover' && dryRun.authoringContracts?.composition?.geometryAuthority === 'engine' && dryRun.authoringContracts?.composition?.placementPolicy === 'semantic-layout-only' && dryRun.authoringContracts?.composition?.spatialDecisionAuthority === 'ai' && dryRun.authoringContracts?.composition?.spatialConflictPolicy === 'report-only' && dryRun.authoringContracts?.composition?.textVisualOverlap === 'report-only')
ok('generation readback returns the Director domain contract', dryRun.authoringContract?.workflow === 'authoring-excellence-director-v1' && dryRun.authoringContract?.geometryAuthority === 'engine' && dryRun.authoringContract?.placementPolicy === 'semantic-layout-only' && dryRun.authoringContract?.rawNativePreservationPolicy === 'forbidden-in-director-spec' && dryRun.authoringContract?.objectIdentity === 'stable-names-required')
ok('generation readback returns the narration timing spine', dryRun.timingSpine?.slides?.length === 1 && dryRun.timingSpine.slides[0]?.governedBy === 'narration (text is master)' && dryRun.timingSpine.slides[0]?.timingSource === 'estimate' && typeof dryRun.timingSpine.slides[0]?.narrationMs === 'number' && typeof dryRun.timingSpine.slides[0]?.visualComfortMs === 'number' && typeof dryRun.timingSpine.slides[0]?.visualFits === 'boolean')
ok('generation readback returns a truthful pre-save handshake', dryRun.handshake?.contractVersion === 'authoring-excellence.handshake.v2' && dryRun.handshake?.scope === 'pre-save-factual-consistency-only' && dryRun.handshake?.declaredBrief === true && dryRun.handshake?.consistent === true && dryRun.handshake?.certifiesFirstTimeRight === false && dryRun.handshake?.firstTimeRightContractVersion === 'authoring-excellence.first-time-right.v2' && dryRun.handshake?.declared?.promise === spec.handshake.promise && Array.isArray(dryRun.handshake?.checks) && typeof dryRun.handshake?.gaps === 'number' && /not a taste grade or first-time-right certificate/i.test(dryRun.handshake?.note || '') && /first deck\.save artifact/i.test(dryRun.handshake?.note || ''))
ok('generation readback preserves explicit AI World authority without ranking', dryRun.authoringContracts?.composition?.worldSelection?.selectionStatus === 'ai-selected' && dryRun.authoringContracts?.composition?.worldSelection?.selectedWorld === 'editorial' && dryRun.authoringContracts?.composition?.worldSelection?.certificationEligible === true && !Object.hasOwn(dryRun.authoringContracts?.composition?.worldSelection || {}, 'rankedCandidates') && !/richnessScore|fitScore|selectionRole/.test(json(dryRun.authoringContracts?.composition?.worldSelection || {})))

// Resolve-stage timing proof uses a local deterministic WAV responder so the cold client can
// exercise the real lock path without depending on a provider deployment or external network.
const resolveProbeWav = () => {
	const bytes = Buffer.alloc(44 + 22050)
	bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + 22050, 4); bytes.write('WAVE', 8)
	bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(22050, 24); bytes.writeUInt32LE(44100, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36); bytes.writeUInt32LE(22050, 40)
	return bytes
}
const resolveProbeServer = http.createServer((req, res) => {
	if (req.method === 'POST') { res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(resolveProbeWav()); return }
	res.writeHead(200, { 'content-type': 'application/json' }); res.end('[]')
})
await new Promise(resolve => resolveProbeServer.listen(0, '127.0.0.1', resolve))
const previousResolveEnv = {
	provider: process.env.BETTERPPTX_TTS_PROVIDER,
	url: process.env.BETTERPPTX_TTS_URL,
	maintainer: process.env.BETTERPPTX_LOCAL_MAINTAINER,
}
process.env.BETTERPPTX_TTS_PROVIDER = 'piper-http'
process.env.BETTERPPTX_TTS_URL = `http://127.0.0.1:${resolveProbeServer.address().port}`
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
const resolveProbeSpec = structuredClone(spec)
resolveProbeSpec.title = 'Public resolve timing proof'
resolveProbeSpec.slides[0].narration = {
	segments: [
		{ script: 'First measured sentence.', gapAfterMs: 300 },
		{ script: 'Second measured sentence.', cues: [{ atPhrase: 'Second', target: 'proof-body', type: 'emphasis', effect: 'pulse' }] },
	],
	segmentGapMs: 200,
	paddingMs: 400,
}
let resolveProbe = null
try {
	resolveProbe = resultData('resolve narration timing probe', await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: resolveProbeSpec,
		phase: 'resolve',
		commitMode: 'createNew',
		plan: 'premium',
		billingConfirmed: true,
		detail: 'full',
	}))
} catch (error) {
	ok('resolve returns measured narration timing before commit', false, String(error?.message || error))
	ok('resolve locks every narrated segment for the next phase', false, String(error?.message || error))
}
if (resolveProbe) {
	const resolvedTimeline = resolveProbe.narrationTimeline
	const resolvedSlide = resolvedTimeline?.slides?.[0]
	const lockedSegments = resolveProbe.lockedSpec?.slides?.[0]?.narration?.segments || []
	ok('resolve returns measured narration timing before commit', resolveProbe.phase === 'resolve' && resolveProbe.mutationFree === true && resolveProbe.timingSpine?.slides?.[0]?.timingSource === 'locked-audio' && typeof resolveProbe.timingSpine?.slides?.[0]?.dwellMs === 'number' && resolvedTimeline?.phase === 'resolve' && resolvedTimeline?.source === 'resolved-audio' && resolvedSlide?.realDurationMs > 0 && resolvedSlide?.segmented === true && resolvedSlide?.segments?.length === 2 && resolvedSlide.segments[1]?.gapBeforeMs === 200 && resolvedSlide?.beats?.some(beat => beat.target === 'proof-body' && beat.atMs >= 0 && beat.anchorMethod === 'duration-proportional-script-position'))
	ok('resolve locks every narrated segment for the next phase', lockedSegments.length === 2 && lockedSegments.every(segment => segment.audio?.durationMs === 500 && /^asset:\/\/locked\/audio\//.test(segment.lockedAudio?.handle || '')) && resolveProbe.resolvedAssets?.[0]?.segments?.length === 2)
	const lockedProbe = resultData('public locked-spec reproducibility probe', await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: resolveProbe.lockedSpec,
		phase: 'lockedDryRun',
		commitMode: 'createNew',
		plan: 'premium',
		detail: 'full',
	}))
	ok('public locked media handoff reproduces its advertised digests and mutation-free timeline', lockedProbe.resolution?.required === false && lockedProbe.mutationFree === true && lockedProbe.timingSpine?.slides?.[0]?.timingSource === 'locked-audio' && lockedProbe.narrationTimeline?.phase === 'lockedDryRun' && lockedProbe.narrationTimeline?.source === 'locked-audio' && JSON.stringify(lockedProbe.narrationTimeline?.slides) === JSON.stringify(resolveProbe.narrationTimeline?.slides) && resolveProbe.lockedSpecDigest === lockedProbe.lockedSpecDigest && resolveProbe.lockedPlanDigest === lockedProbe.lockedPlanDigest)
}
resolveProbeServer.close()
for (const [key, value] of Object.entries(previousResolveEnv)) {
	const envKey = key === 'provider' ? 'BETTERPPTX_TTS_PROVIDER' : key === 'url' ? 'BETTERPPTX_TTS_URL' : 'BETTERPPTX_LOCAL_MAINTAINER'
	if (value === undefined) delete process.env[envKey]
	else process.env[envKey] = value
}
const publicProofHandshakeSpec = structuredClone(spec)
publicProofHandshakeSpec.handshake = { audience: 'reviewers', promise: 'Prove the result with evidence', proof: ['verified metric'], bar: 'clear and credible', commitments: ['proof'] }
publicProofHandshakeSpec.slides[0].content.push({ kind: 'stat', name: 'verified-proof-stat', value: '42', label: 'verified metric', verified: true, evidenceSource: 'Public benchmark' })
const publicProofHandshakeDryRun = resultData('public proof handshake dry-run', await mcp.call('betterpptx.deck.generate_from_spec', { spec: publicProofHandshakeSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' }))
ok('handshake accepts the public evidenceSource proof contract', publicProofHandshakeDryRun.handshake?.consistent === true && publicProofHandshakeDryRun.handshake?.checks?.some(check => check.kind === 'commitment:verified-claims' && check.status === 'consistent'))
ok('public generation readback hides internal representation fields', findPublicKeys(dryRun, 'primitive').length === 0 && findPublicKeys(dryRun, 'generatedByPrimitiveHandlers').length === 0 && findPublicKeys(dryRun, 'powerPointNative').length === 0 && findPublicKeys(dryRun, 'native3d').length === 0 && findPublicKeys(dryRun, 'operationRefs').length === 0)
const mismatchSpec = structuredClone(spec)
mismatchSpec.slides[0].layoutIntent = 'image-left-copy-right'
mismatchSpec.slides[0].content = [
	{ kind: 'title', name: 'proof-title', text: 'Missing proof' },
	{ kind: 'textBox', name: 'proof-body', text: 'This intentionally omits the image proof block.' },
]
const mismatchDryRun = resultData('mismatch generate_from_spec dryRun', await mcp.call('betterpptx.deck.generate_from_spec', {
	spec: mismatchSpec,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
}))
const mismatch = (mismatchDryRun.warnings || []).find(item => item.code === 'LAYOUT_INTENT_CONTENT_MISMATCH')
ok('public dry-run exposes semantic balance correction evidence', mismatch?.severity === 'warning' && mismatch?.reason && mismatch?.fix && mismatch?.evidence?.expected === 'image/image-feature' && Array.isArray(mismatch?.suggestions) && mismatch.suggestions.includes('title-body'))
const layoutRecommendations = mismatchDryRun.layoutRecommendations
const firstLayoutProposal = layoutRecommendations?.slides?.[0]?.proposals?.[0]
const firstReadbackRegion = firstLayoutProposal?.regions && Object.values(firstLayoutProposal.regions)[0]
const proposalsHaveReadback = (layoutRecommendations?.slides || []).flatMap(slide => slide.proposals || []).every(proposal => {
	const region = proposal.regions && Object.values(proposal.regions)[0]
	const assignmentRects = proposal.assignmentRects || {}
	const assignmentsJoin = Object.entries(proposal.assignment || {}).filter(([, assignment]) => assignment !== 'explicit-rect').every(([name]) => {
		const rect = assignmentRects[name]
		return rect && ['x', 'y', 'w', 'h'].every(key => typeof rect[key] === 'number') && rect.w > 0 && rect.h > 0
	})
	return region && ['x', 'y', 'w', 'h'].every(key => typeof region[key] === 'number') && proposal.assignment && typeof proposal.assignment === 'object' && assignmentsJoin
})
ok('selected-layout feasibility exposes typed unranked engine readback without authoring geometry', layoutRecommendations?.contractVersion === 'authoring-excellence.layout-feasibility.v1' && layoutRecommendations?.selectionAuthority === 'ai' && layoutRecommendations?.unranked === true && Number.isInteger(layoutRecommendations?.slides?.[0]?.slideIndex) && layoutRecommendations?.slides?.every(slide => slide.proposals?.length === 1 && slide.unranked === true && slide.proposals[0]?.status === 'selected-intent-factual-readback' && !Object.hasOwn(slide.proposals[0], 'score') && !Object.hasOwn(slide.proposals[0], 'why')) && typeof firstLayoutProposal?.layoutIntent === 'string' && firstReadbackRegion && ['x', 'y', 'w', 'h'].every(key => typeof firstReadbackRegion[key] === 'number') && proposalsHaveReadback && layoutRecommendations?.confirmVia?.includes('Never author rect/bbox/x/y/w/h'))
const misassignedSpec = structuredClone(spec)
misassignedSpec.slides[0].layoutIntent = 'image-left-copy-right'
misassignedSpec.slides[0].content = [
	{ kind: 'title', name: 'proof-title', text: 'Misassigned semantic regions' },
	{ kind: 'image-feature', name: 'proof-image', image: 'data:image/png;base64,iVBORw0KGgo=', region: 'left' },
	{ kind: 'textBox', name: 'proof-copy', text: 'Both substantive blocks were pinned to the left.', region: 'left' },
]
const misassignedDryRun = await mcp.call('betterpptx.deck.generate_from_spec', {
	spec: misassignedSpec,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
})
const misassignedWarnings = misassignedDryRun?.error?.details?.warnings || misassignedDryRun?.data?.warnings || misassignedDryRun?.warnings || []
const underfilled = misassignedWarnings.find(item => item.code === 'LAYOUT_REGION_UNDERFILLED')
ok('public dry-run exposes region-underfill correction evidence', (misassignedDryRun?.ok === true || misassignedDryRun?.ok === undefined) && underfilled?.severity === 'warning' && underfilled?.reason && underfilled?.fix && underfilled?.evidence?.occupancy?.right?.area === 0 && misassignedDryRun?.data?.slides?.[0]?.visualBalance?.status === 'underfilled' && misassignedDryRun?.data?.slides?.[0]?.visualBalance?.densityRatio >= 10)
const imbalancedSpec = structuredClone(spec)
imbalancedSpec.slides[0].layoutIntent = 'image-left-copy-right'
imbalancedSpec.slides[0].content = [
	{ kind: 'title', name: 'proof-title', text: 'Imbalanced semantic regions' },
	{ kind: 'image-feature', name: 'proof-image', image: 'data:image/png;base64,iVBORw0KGgo=', region: 'left' },
	{ kind: 'textBox', name: 'copy-one', text: 'First explanation block.', region: 'right' },
	{ kind: 'textBox', name: 'copy-two', text: 'Second explanation block.', region: 'right' },
	{ kind: 'textBox', name: 'copy-three', text: 'Third explanation block.', region: 'right' },
]
const imbalancedDryRun = await mcp.call('betterpptx.deck.generate_from_spec', {
	spec: imbalancedSpec,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
})
const imbalancedWarnings = imbalancedDryRun?.error?.details?.warnings || imbalancedDryRun?.data?.warnings || imbalancedDryRun?.warnings || []
const imbalance = imbalancedWarnings.find(item => item.code === 'LAYOUT_BALANCE_IMBALANCE')
ok('public dry-run does not misclassify a stacked explanation lane as severe imbalance', !imbalance && ['balanced', 'review'].includes(imbalancedDryRun?.data?.slides?.[0]?.visualBalance?.status))
const imbalancedObjects = (imbalancedDryRun?.data || imbalancedDryRun)?.slides?.[0]?.objects || []
const semanticObject = imbalancedObjects.find(object => String(object.objectName || '').includes('copy-one'))
ok('public readback separates semantic intent from geometry authority', semanticObject?.placementSource === 'engine' && semanticObject?.placementIntentSource === 'author-semantic-region' && imbalancedDryRun?.data?.slides?.[0]?.visualBalance?.contractVersion === 'authoring-excellence.visual-balance.v1' && ['balanced', 'review', 'imbalanced', 'underfilled', 'not-applicable'].includes(imbalancedDryRun?.data?.slides?.[0]?.visualBalance?.status) && imbalancedDryRun?.data?.slides?.[0]?.visualBalance?.regions?.left?.blocks?.includes('proof-image') && imbalancedDryRun?.data?.slides?.[0]?.visualBalance?.regions?.right?.blocks?.includes('copy-one') && imbalancedDryRun?.data?.appliedDefaults?.slides?.[0]?.visualBalance?.contractVersion === 'authoring-excellence.visual-balance.v1')
const decisionSummary = imbalancedDryRun?.data?.appliedDefaults?.decisionSummary
ok('public readback exposes a compact AI decision summary', decisionSummary?.schemaVersion === 'authoring-excellence.decision-summary.v1' && ['ready', 'review', 'blocked'].includes(decisionSummary.status) && typeof decisionSummary.world?.mode === 'string' && decisionSummary.layout?.engineOwned === true && Array.isArray(decisionSummary.layout?.correctionLevers) && decisionSummary.timing?.masterClock === 'narration-text' && decisionSummary.presenter?.engineOwnsChoreography === true && Array.isArray(decisionSummary.quality?.warningCodes) && Array.isArray(decisionSummary.nextActions) && decisionSummary.correctionLoop?.repeat?.includes('phase:"dryRun"'))
ok('decision summary keeps geometry and private implementation out of the AI correction surface', !/(?:["'](?:bbox|rect|filePath|provider)["']\s*:|filesystem|engine\.mjs|PptxGenJS)/i.test(json(decisionSummary)))
const proofLedReviewSpec = structuredClone(spec)
proofLedReviewSpec.slides[0].layoutIntent = 'image-left-copy-right'
proofLedReviewSpec.slides[0].content = [
	{ kind: 'title', name: 'proof-led-title', text: 'Proof-led review' },
	{ kind: 'image-feature', name: 'proof-hero', image: 'data:image/png;base64,iVBORw0KGgo=', region: 'right' },
	{ kind: 'callout', name: 'proof-explanation', text: 'A concise explanation keeps the buyer oriented.', region: 'left' },
	{ kind: 'callout', name: 'proof-callout', text: 'One bounded next step.', region: 'left' },
]
const proofLedReviewDryRun = await mcp.call('betterpptx.deck.generate_from_spec', {
	spec: proofLedReviewSpec,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
})
const proofLedData = proofLedReviewDryRun?.data || proofLedReviewDryRun
const proofLedDecision = proofLedData?.appliedDefaults?.decisionSummary
const proofLedBalance = proofLedData?.slides?.[0]?.visualBalance
const proofLedWarnings = proofLedData?.warnings || []
ok('moderate proof-led skew is an inspectable review, not an automatic rebalance verdict', proofLedBalance?.status === 'review' && !proofLedWarnings.some(item => item.code === 'LAYOUT_BALANCE_IMBALANCE') && proofLedDecision?.nextActions?.some(action => action.key === 'review-semantic-balance') && !proofLedDecision?.nextActions?.some(action => action.key === 'rebalance-semantic-layout'))
const blankShapeSpec = structuredClone(spec)
blankShapeSpec.slides[0].content = [
	{ kind: 'title', name: 'proof-title', text: 'Blank geometry diagnostic' },
	{ kind: 'shape', name: 'blank-panel', shapeName: 'roundRect' },
]
const blankShapeDryRun = resultData('blank shape generate_from_spec dryRun', await mcp.call('betterpptx.deck.generate_from_spec', {
	spec: blankShapeSpec,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
}))
const emptyShape = (blankShapeDryRun.warnings || []).find(item => item.code === 'EMPTY_GEOMETRY_SHAPE')
ok('public dry-run exposes empty-geometry correction evidence', emptyShape?.severity === 'warning' && emptyShape?.reason && emptyShape?.fix && emptyShape?.evidence?.name === 'blank-panel')

const committed = resultData('generate_from_spec commit', await mcp.call('betterpptx.deck.generate_from_spec', {
	spec,
	phase: 'commit',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
}))
const deckId = committed.deckId
const deckVersion = committed.deckVersion
ok('commit creates a governed deck only after semantic compilation', typeof deckId === 'string' && deckId.startsWith('deck_') && Number.isInteger(deckVersion))
const quality = resultData('deck.validate_quality', await mcp.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'modern' }))
ok('quality gate passes for the public semantic deck', quality.ok === true && Array.isArray(quality.failed) && quality.failed.length === 0)
ok('quality gate returns measurable readability evidence without replacing visual judgment', quality.designValidation?.readability?.contractVersion === 'authoring-excellence.readability.v1' && quality.designValidation?.readability?.manualVisualReviewRequired === true && typeof quality.designValidation?.readability?.measurements?.textObjects === 'number' && typeof quality.designValidation?.readability?.measurements?.manualContrastReviewObjects === 'number' && /full-slide AI review remains mandatory/i.test(quality.designValidation?.note || ''))
ok('readability evidence excludes the invisible accessibility title placeholder', !(quality.designValidation?.readability?.findings?.smallText || []).some(item => item.objectName === 'slide-title'))
const compositeCommitted = resultData('composite readability commit', await mcp.call('betterpptx.deck.generate_from_spec', { spec: compositeReadabilitySpec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'full' }))
const compositeQuality = resultData('composite readability quality', await mcp.call('betterpptx.deck.validate_quality', { deckId: compositeCommitted.deckId, deckVersion: compositeCommitted.deckVersion, profile: 'modern' }))
	const compositeSmallText = compositeQuality.designValidation?.readability?.findings?.smallText || []
	ok('postcommit quality traverses native SmartArt and table-cell typography', ['narrow-table', 'small-smartart'].every(name => compositeSmallText.some(item => String(item.objectName || '').includes(name) && item.actualPt === 8)))
	ok('postcommit quality classifies metric-card runs as data labels', !compositeSmallText.some(item => String(item.objectName || '').includes('metric-role-probe')))
	ok('postcommit quality classifies process steps as diagram labels', !compositeSmallText.some(item => String(item.objectName || '').includes('process-role-probe')))
	await mcp.call('betterpptx.deck.dispose', { deckId: compositeCommitted.deckId, deckVersion: compositeCommitted.deckVersion })
	const metricContrastSpec = structuredClone(spec)
	metricContrastSpec.title = 'Per-run contrast adversary'
	metricContrastSpec.visualDesign = { world: 'Blueprint contrast probe', framing: 'One dark metric card with a deliberately low-contrast value run.' }
	metricContrastSpec.styleIntent = { artDirection: 'blueprint', mode: 'dark' }
	metricContrastSpec.theme = { name: 'Contrast probe', palette: ['0B1120', '0E7490', '22D3EE', 'F59E0B', 'F8FAFC'] }
	metricContrastSpec.slides[0] = {
		...metricContrastSpec.slides[0],
		id: 'per-run-contrast',
		layoutIntent: 'metric-grid',
		content: [
			{ kind: 'title', name: 'contrast-title', text: 'Every rich-text run needs contrast proof' },
			{ kind: 'metric-grid', name: 'mixed-contrast-metric', style: { color: '111111' }, verified: true, evidenceSource: 'public-verifier-fixture', items: [{ name: 'probe', label: 'Readable label', value: 'Hidden value', text: 'Readable detail' }] },
		],
	}
	metricContrastSpec.slides.push({
		id: 'native-theme-fill-contrast',
		title: 'Native theme fills must govern contrast evidence',
		message: 'The native outline style renders a light lt1 fill, so explicit dark text is readable even on a dark deck canvas.',
		role: 'proof',
		layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'native-fill-title', text: 'Native theme fills must govern contrast evidence' },
			{ kind: 'textShape', name: 'native-fill-probe', shapeName: 'roundRect', shapeStylePresetId: 'shape-style-002', style: { color: '0B1220' }, text: 'Dark text on the native lt1 surface remains readable.' },
		],
	})
	const metricContrastCommitted = resultData('per-run contrast commit', await mcp.call('betterpptx.deck.generate_from_spec', { spec: metricContrastSpec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'full' }))
	const metricContrastQuality = resultData('per-run contrast quality', await mcp.call('betterpptx.deck.validate_quality', { deckId: metricContrastCommitted.deckId, deckVersion: metricContrastCommitted.deckVersion, profile: 'modern' }))
	const perRunLowContrast = metricContrastQuality.designValidation?.readability?.findings?.lowContrast || []
	ok('postcommit quality evaluates every nonempty rich-text run', perRunLowContrast.some(item => String(item.objectName || '').includes('mixed-contrast-metric') && item.runIndex === 1 && item.foreground === '111111'))
	ok('postcommit quality resolves native theme fill references before measuring contrast', !perRunLowContrast.some(item => String(item.objectName || '').includes('native-fill-probe')))
	await mcp.call('betterpptx.deck.dispose', { deckId: metricContrastCommitted.deckId, deckVersion: metricContrastCommitted.deckVersion })
const qualityFindings = [...(quality.blockingIssues || []), ...(quality.warnings || [])]
ok('quality-gate findings carry the declared message and correction contract', qualityFindings.length > 0 && qualityFindings.every(item => typeof item.message === 'string' && item.message.length > 0 && typeof item.reason === 'string' && item.reason.length > 0 && typeof item.fix === 'string' && item.fix.length > 0 && item.evidence && typeof item.evidence === 'object'))
const lowMotionFinding = qualityFindings.find(item => item.code === 'LOW_MOTION_COVERAGE')
ok('non-narrated motion guidance stays semantic', lowMotionFinding && /meaningful story objects/i.test(lowMotionFinding.fix || '') && !/discussed by narration/i.test(lowMotionFinding.fix || ''))
const qualityPrivateVocabulary = /PptxGenJS|node\.js|\bexpress\b|\bdependency\b|source code|cwd|pid|execPath|argv|local filesystem|filesystem path|server filesystem|trellis|unirig|flux[-.\s]?(?:1|2|schnell)|klein\s*4b|black-forest-labs|huggingface|modal\s+l40s|workers\s+ai|liveportrait|musetalk|restoreformer|x-(?:pipeline|enhancement|restoreformer)|providerexecution/i
const qualityJson = json(quality)
const qualityPublicSafe = {
	vocabulary: !qualityPrivateVocabulary.test(qualityJson),
	path: !/(?:^|["'\s])(?:[A-Za-z]:\\|\/(?:home|tmp|outputs)\/)/i.test(qualityJson),
	providerKeys: findPublicKeys(quality, 'provider').length === 0,
	pipelineKeys: findPublicKeys(quality, 'pipeline').length === 0,
	filePathKeys: findPublicKeys(quality, 'filePath').length === 0,
}
ok('public quality findings remain black-box safe', Object.values(qualityPublicSafe).every(Boolean), JSON.stringify(qualityPublicSafe))
if (developmentNoSave) {
	const disposed = resultData('development deck.dispose', await mcp.call('betterpptx.deck.dispose', { deckId, deckVersion }))
	ok('development verifier honors the zero-save boundary', (disposed.disposed === true || disposed.ok === true) && saveCalls === 0)
} else {
	const slideCount = Number(committed.slideCount || spec.slides.length)
	let remainingSlideIndexes = Array.from({ length: slideCount }, (_value, index) => index)
	let previewPackageSha256 = null
	let previewValidationEvidenceSha256 = null
	let finalPreview = null
	let previewBatchCount = 0
	while (remainingSlideIndexes.length > 0) {
		const requestedSlideIndexes = remainingSlideIndexes.slice(0, 12)
		const preview = resultData(`deck.preview batch ${previewBatchCount + 1}`, await mcp.call('betterpptx.deck.preview', {
			deckId,
			deckVersion,
			slides: requestedSlideIndexes,
		}))
		if (!previewPackageSha256) previewPackageSha256 = preview.packageSha256
		if (!previewValidationEvidenceSha256) previewValidationEvidenceSha256 = preview.validationEvidenceSha256
		if (
			!previewPackageSha256 ||
			preview.packageSha256 !== previewPackageSha256 ||
			!previewValidationEvidenceSha256 ||
			preview.validationEvidenceSha256 !== previewValidationEvidenceSha256 ||
			preview.validationVerification?.complete !== true ||
			preview.validationVerification?.verifiedDeckVersion !== deckVersion ||
			preview.batchLimit !== 12 ||
			(preview.renderedSlideIndexes || []).length > 12 ||
			json(preview.renderedSlideIndexes || []) !== json(requestedSlideIndexes)
		) {
			throw new Error(`deck.preview lost the bounded frozen-package contract: ${json(preview)}`)
		}
		const nextRemaining = preview.remainingSlideIndexes || []
		if (nextRemaining.length >= remainingSlideIndexes.length && nextRemaining.length > 0) {
			throw new Error(`deck.preview made no cumulative progress: ${json(preview)}`)
		}
		remainingSlideIndexes = nextRemaining
		finalPreview = preview
		previewBatchCount += 1
		if (previewBatchCount > Math.ceil(slideCount / 12) + 1) throw new Error('deck.preview exceeded the bounded batch count.')
	}
	if (
		finalPreview?.complete !== true ||
		(finalPreview?.remainingSlideIndexes || []).length !== 0 ||
		(finalPreview?.previewedSlideIndexes || []).length !== slideCount
	) {
		throw new Error(`deck.preview did not cover every slide: ${json(finalPreview)}`)
	}

	const releaseIdempotencyKey = 'public-semantic-authoring-release-v1'
	const saved = resultData('deck.save', await mcp.call('betterpptx.deck.save', {
		deckId,
		deckVersion,
		fileName: 'public-semantic-authoring-proof.pptx',
		outputFormat: 'pptx',
		idempotencyKey: releaseIdempotencyKey,
	}))
	ok('save returns only public-safe artifact metadata', saveCalls === 1 && typeof saved.bytes === 'number' && saved.bytes > 0 && saved.packageSha256 === previewPackageSha256 && saved.previewVerification?.packageSha256 === previewPackageSha256 && saved.previewVerification?.validationEvidenceSha256 === previewValidationEvidenceSha256 && saved.previewVerification?.complete === true && (saved.previewVerification?.remainingSlideIndexes || []).length === 0 && !saved.path && !saved.outputDir && !forbidden.test(json(saved)))
	ok('save does not expose server filesystem details', !/([A-Za-z]:\\|\/home\/|\/tmp\/|\\outputs\\|\/outputs\/)/i.test(json(saved)))
	const disposed = resultData('deck.dispose', await mcp.call('betterpptx.deck.dispose', { deckId, deckVersion: saved.deckVersion || deckVersion }))
	ok('public lifecycle disposes the governed deck', disposed.disposed === true || disposed.ok === true)
}

const report = { schemaVersion: 'betterpptx.public-semantic-authoring-v1', status: fail === 0 ? 'PASS' : 'FAIL', checks: checks.length, passed: pass, failures: fail, saveCalls, contract: capabilities.authoringApi?.contractVersion, planDigest: dryRun.planDigest }
console.log(JSON.stringify(report, null, 2))
assertNoFailure()

function assertNoFailure() {
	if (fail !== 0) {
		console.error(`FAILED: ${pass} passed, ${fail} failed`)
		process.exit(1)
	}
	console.log(`PASSED: ${pass} passed, ${fail} failed`)
}
