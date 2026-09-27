// G1 generation black-box adversarial gate. It exercises a cold public-mode
// client and the sanitizer directly; no network, customer asset, or provider call.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { sanitizePublicArtifactName, scrubPublicAvatarDiagnostics, validatePublicAvatarDiagnosticsFromZip } from './blackbox-vocabulary.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
Object.assign(process.env, {
	BETTERPPTX_ASSETS_ROOT: repo,
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_CREDENTIAL_STORE: path.join(os.tmpdir(), `bpx-g1-blackbox-${process.pid}.json`),
})

const blackbox = await import('./blackbox.mjs')
const { callBetterPptxTool } = await import('./engine.mjs')
const context = { sessionId: `g1-adversarial-${process.pid}` }
const banned = /PptxGenJS|node\.js|express|dependency|source code|cwd|pid|execPath|argv|local filesystem|filesystem path|server filesystem|trellis|unirig|flux[-.\s]?(?:1|2|schnell)|klein\s*4b|black-forest-labs|huggingface|modal\s+l40s|\bl40s\b|workers\s+ai|gen:\/\/(?:trellis|flux)\/|liveportrait|musetalk|restoreformer|x-(?:pipeline|enhancement|restoreformer)|p15:isNarration|providerexecution/i
const bannedHits = value => String(value).match(/PptxGenJS|node\.js|express|dependency|source code|cwd|pid|execPath|argv|local filesystem|filesystem path|server filesystem|trellis|unirig|flux[-.\s]?(?:1|2|schnell)|klein\s*4b|black-forest-labs|huggingface|modal\s+l40s|\bl40s\b|workers\s+ai|gen:\/\/(?:trellis|flux)\/|liveportrait|musetalk|restoreformer|x-(?:pipeline|enhancement|restoreformer)|p15:isNarration|providerexecution/gi) || []
let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { if (condition) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) } }
const json = value => JSON.stringify(value)

console.log('G1 GENERATION BLACK-BOX ADVERSARIAL GATE (cold public mode):')
ok('public mode is active', blackbox.isPublicBlackBoxMode() === true)
ok('generic generation tool is allowed', blackbox.isPublicToolAllowed('betterpptx.assets.generate_image') === true)
ok('filesystem introspection tool is blocked', blackbox.isPublicToolAllowed('betterpptx.io.read_file') === false)

const capabilities = await callBetterPptxTool('betterpptx.help.capabilities', { detail: 'full' }, context)
const workflow = await callBetterPptxTool('betterpptx.help.workflow', { detail: 'full' }, context)
const recipe = await callBetterPptxTool('betterpptx.help.tool_recipe', { tool: 'betterpptx.assets.generate_image', detail: 'full' }, context)
const unavailable = await callBetterPptxTool('betterpptx.assets.generate_image', { prompt: 'a controlled abstract visual', capability: 'create' }, context)
const { TOOLS } = await import('./tools.mjs')
const publicCapabilityTool = blackbox.publicToolList(TOOLS).find(tool => tool.name === 'betterpptx.help.capabilities')
const publicProductTools = blackbox.publicToolList(TOOLS)
const publicWorkflowTool = publicProductTools.find(tool => tool.name === 'betterpptx.help.workflow')
const publicDirectorStatusTool = publicProductTools.find(tool => tool.name === 'betterpptx.deck.director_status')
const publicGenerationTool = publicProductTools.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
const primitiveAuthoringNames = publicProductTools.filter(tool => /\.(slide|custom_geometry)\.(add|update|delete|revise|insert|insert_svg|animate_shapes)/i.test(tool.name)).map(tool => tool.name)
ok('capability/help responses contain no implementation vocabulary', !banned.test(json(capabilities)) && !banned.test(json(workflow)) && !banned.test(json(recipe)), JSON.stringify({ capabilities: bannedHits(json(capabilities)), workflow: bannedHits(json(workflow)), recipe: bannedHits(json(recipe)) }))
const publicHelpForbidden = /_synergyPlan|clipTimelines|playScene|animId|engineRoute|compiledAs|nativePackage|nativeTiming|TO_SOURCE|\bbaked\b|\b(?:provider|internal|private)\b|\b(?:cwd|execpath|node_modules|filesystem|file system|local path|server path|repository path)\b|[A-Za-z]:[\\/]/i
const capabilityHelpSchema = publicCapabilityTool?.outputSchema?.properties?.data
const workflowHelpSchema = publicWorkflowTool?.outputSchema?.properties?.data
const capabilityHelpProperties = capabilityHelpSchema?.properties || {}
const workflowHelpProperties = workflowHelpSchema?.properties || {}
const capabilityHelpBytes = Buffer.byteLength(json(capabilities?.data || {}))
const workflowHelpBytes = Buffer.byteLength(json(workflow?.data || {}))
const capabilityHelpSchemaBytes = Buffer.byteLength(json(publicCapabilityTool?.outputSchema || {}))
const workflowHelpSchemaBytes = Buffer.byteLength(json(publicWorkflowTool?.outputSchema || {}))
const capabilityHelpLimit = capabilities?.data?.responseBudget?.configured?.maxBytes
const workflowHelpLimit = workflow?.data?.responseBudget?.configured?.maxBytes
ok('public help responses and schemas are compact and vocabulary-clean',
	Number.isInteger(capabilityHelpLimit) && capabilityHelpBytes <= capabilityHelpLimit &&
	Number.isInteger(workflowHelpLimit) && workflowHelpBytes <= workflowHelpLimit &&
	capabilityHelpSchemaBytes < 30 * 1024 &&
	workflowHelpSchemaBytes < 30 * 1024 &&
	!publicHelpForbidden.test(json(capabilities)) &&
	!publicHelpForbidden.test(json(workflow)) &&
	!publicHelpForbidden.test(json(publicCapabilityTool)) &&
	!publicHelpForbidden.test(json(publicWorkflowTool)),
	JSON.stringify({ capabilityHelpBytes, workflowHelpBytes, capabilityHelpSchemaBytes, workflowHelpSchemaBytes }))
ok('public help schemas advertise the compact progressive authoring contract',
	capabilityHelpSchema?.additionalProperties === false &&
	workflowHelpSchema?.additionalProperties === false &&
	capabilityHelpSchema?.required?.includes('authoringPrinciples') &&
	capabilityHelpSchema?.required?.includes('authoringApi') &&
	capabilityHelpSchema?.required?.includes('progressiveDiscovery') &&
	capabilityHelpProperties.authoringPrinciples?.properties?.designAuthority?.enum?.includes('ai') &&
	capabilityHelpProperties.authoringPrinciples?.properties?.engineRole?.enum?.includes('execute-measure-validate-serialize') &&
	capabilityHelpProperties.authoringPrinciples?.properties?.decisionAuthority?.properties?.aiOwns?.type === 'array' &&
	capabilityHelpProperties.authoringPrinciples?.properties?.placementPolicy?.properties?.mode?.enum?.includes('semantic-or-visual-reference-pixels') &&
	capabilityHelpProperties.authoringPrinciples?.properties?.firstTimeRight?.properties?.contractVersion?.enum?.includes('authoring-excellence.first-time-right.v2') &&
	capabilityHelpProperties.authoringPrinciples?.properties?.firstTimeRight?.properties?.visualReview?.properties?.contractVersion?.enum?.includes('authoring-excellence.visual-review.v2') &&
	capabilityHelpProperties.authoringPrinciples?.properties?.firstTimeRight?.properties?.visualReview?.properties?.lenses?.minItems === 10 &&
	capabilityHelpProperties.authoringApi?.properties?.compose?.properties?.tool?.enum?.includes('betterpptx.deck.generate_from_spec') &&
	capabilityHelpProperties.authoringApi?.properties?.compose?.properties?.phases?.items?.properties?.id?.enum?.join(',') === 'dryRun,resolve,commit' &&
	capabilityHelpProperties.progressiveDiscovery?.items?.properties?.tool?.pattern === '^betterpptx\\.' &&
	capabilityHelpProperties.examples?.items?.properties?.payload?.type === 'object' &&
	workflowHelpSchema?.required?.includes('authoritySummary') &&
	workflowHelpSchema?.required?.includes('capabilityDiscovery') &&
	workflowHelpSchema?.required?.includes('phases') &&
	workflowHelpProperties.authoritySummary?.properties?.designAuthority?.enum?.includes('ai') &&
	workflowHelpProperties.capabilityDiscovery?.properties?.tool?.enum?.includes('betterpptx.help.capabilities') &&
	workflowHelpProperties.phases?.minItems === 5 &&
	workflowHelpProperties.phases?.maxItems === 5 &&
	!Object.hasOwn(workflowHelpProperties, 'authoringPrinciples') &&
	!Object.hasOwn(workflowHelpProperties, 'authoringApi') &&
	!Object.hasOwn(workflowHelpProperties, 'specCapabilityMatrix') &&
	publicCapabilityTool?.outputSchema?.properties?.error?.properties?.code?.type === 'string' &&
	publicCapabilityTool?.outputSchema?.properties?.error?.properties?.recoverable?.type === 'boolean' &&
	publicCapabilityTool?.outputSchema?.properties?.error?.properties?.next_actions?.type === 'array' &&
	publicCapabilityTool?.outputSchema?.properties?.error?.properties?.retry_safe?.type === 'boolean' &&
	publicCapabilityTool?.outputSchema?.properties?.error?.properties?.artifact_state?.type === 'string',
	JSON.stringify({ capability: capabilityHelpSchema, workflow: workflowHelpSchema }))
const publicGenerationDataSchema = publicGenerationTool?.outputSchema?.properties?.data?.properties || {}
const publicSlideReadbackSchema = publicGenerationDataSchema.slides?.items?.properties || {}
const publicObjectReadbackSchema = publicSlideReadbackSchema.objects?.items?.properties || {}
const publicAppliedDefaultsSlideSchema = publicGenerationDataSchema.appliedDefaults?.properties?.slides?.items?.properties || {}
const publicFindingSchema = publicGenerationDataSchema.warnings?.items?.properties || {}
const missingFixedRuntimeKeys = (value, schema, path = 'root', missing = []) => {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !schema || typeof schema !== 'object') return missing
	const properties = schema.properties || {}
	for (const [key, child] of Object.entries(value)) {
		if (!(key in properties)) {
			if (schema.additionalProperties !== true) missing.push(`${path}.${key}`)
			continue
		}
		missingFixedRuntimeKeys(child, properties[key], `${path}.${key}`, missing)
	}
	return missing
}
const capabilityDataSchema = publicCapabilityTool?.outputSchema?.properties?.data
const workflowDataSchema = publicWorkflowTool?.outputSchema?.properties?.data
const fixedHelpSchemaGaps = [
	...missingFixedRuntimeKeys(capabilities?.data, capabilityDataSchema, 'capabilities.data'),
	...missingFixedRuntimeKeys(workflow?.data, workflowDataSchema, 'workflow.data'),
]
ok('public help schemas advertise every fixed runtime field', fixedHelpSchemaGaps.length === 0, fixedHelpSchemaGaps.slice(0, 12).join(', '))
ok('public help schemas require the compact authority and correction contract',
	capabilityDataSchema?.required?.includes('authoringPrinciples') &&
	capabilityDataSchema?.required?.includes('authoringApi') &&
	capabilityDataSchema?.required?.includes('progressiveDiscovery') &&
	capabilityDataSchema?.properties?.authoringPrinciples?.required?.includes('decisionAuthority') &&
	capabilityDataSchema?.properties?.authoringPrinciples?.required?.includes('placementPolicy') &&
	capabilityDataSchema?.properties?.authoringPrinciples?.required?.includes('firstTimeRight') &&
	capabilityDataSchema?.properties?.authoringPrinciples?.properties?.firstTimeRight?.required?.includes('visualReview') &&
	capabilityDataSchema?.properties?.authoringApi?.required?.includes('compose') &&
	capabilityDataSchema?.properties?.authoringApi?.required?.includes('requiredDomains') &&
	capabilityDataSchema?.properties?.authoringApi?.required?.includes('readbackOrder') &&
	capabilityDataSchema?.properties?.authoringApi?.required?.includes('correctionLoop'),
	JSON.stringify({ principles: capabilityDataSchema?.properties?.authoringPrinciples?.required, api: capabilityDataSchema?.properties?.authoringApi?.required }))
ok('public workflow schema references capability discovery without duplicating the authority payload',
	workflowDataSchema?.required?.includes('capabilityDiscovery') &&
	workflowDataSchema?.required?.includes('authoritySummary') &&
	workflowDataSchema?.required?.includes('phases') &&
	workflowDataSchema?.properties?.capabilityDiscovery?.properties?.tool?.enum?.includes('betterpptx.help.capabilities') &&
	!Object.hasOwn(workflowDataSchema?.properties || {}, 'authoringPrinciples') &&
	!Object.hasOwn(workflowDataSchema?.properties || {}, 'authoringApi') &&
	!Object.hasOwn(workflowDataSchema?.properties || {}, 'specCapabilityMatrix'),
	JSON.stringify(workflowDataSchema))
const expectedGenerationReadbackFields = ['schemaVersion', 'ok', 'phase', 'dryRun', 'mutationFree', 'compilerVersion', 'layoutEngineVersion', 'specDigest', 'planDigest', 'title', 'slideCount', 'objectCount', 'operationCount', 'resolution', 'billing', 'requiresUpgrade', 'entitlement', 'capabilityMatrix', 'authoringContract', 'authoringContracts', 'appliedDefaults', 'visualDirection', 'timingSpine', 'narrationTimeline', 'lockedSpec', 'lockedSpecPatch', 'resolvedAssets', 'presenterContract', 'presenterRuntime', 'slides', 'layoutRecommendations', 'warnings', 'errors', 'next', 'handshake', 'operations', 'artifacts']
ok('public generation schema advertises every fixed readback field', expectedGenerationReadbackFields.every(field => Object.hasOwn(publicGenerationDataSchema, field)) && publicGenerationDataSchema.slides?.items?.properties?.placeholderBinding?.type?.includes?.('object') && publicGenerationDataSchema.slides?.items?.properties?.objects?.items?.properties?.placementSource?.enum?.includes('engine'), expectedGenerationReadbackFields.filter(field => !Object.hasOwn(publicGenerationDataSchema, field)).join(', '))
ok('public generation schema types engine authoring contracts', publicGenerationDataSchema.authoringContracts?.properties?.avatarFrame?.properties?.shape?.enum?.includes('ellipse') && publicGenerationDataSchema.authoringContracts?.properties?.composition?.properties?.geometryAuthority?.enum?.includes('engine') && publicGenerationDataSchema.authoringContracts?.additionalProperties === false, JSON.stringify(publicGenerationDataSchema.authoringContracts))
ok('public generation schema types the Director domain contract', publicGenerationDataSchema.authoringContract?.properties?.workflow?.enum?.includes('authoring-excellence-director-v1') && publicGenerationDataSchema.authoringContract?.properties?.geometryAuthority?.enum?.includes('engine') && publicGenerationDataSchema.authoringContract?.properties?.placementPolicy?.enum?.includes('semantic-layout-only') && publicGenerationDataSchema.authoringContract?.additionalProperties === false, JSON.stringify(publicGenerationDataSchema.authoringContract))
const requestedCompletenessTierTypes = publicGenerationDataSchema.authoringContracts?.properties?.completeness?.properties?.requestedTier?.type
ok('public generation schema preserves omitted AI completeness choice as nullable readback', Array.isArray(requestedCompletenessTierTypes) && requestedCompletenessTierTypes.length === 2 && requestedCompletenessTierTypes.includes('string') && requestedCompletenessTierTypes.includes('null'), JSON.stringify(requestedCompletenessTierTypes))
ok('public generation schema types the narration timing spine', publicGenerationDataSchema.timingSpine?.properties?.slides?.items?.properties?.governedBy?.enum?.includes('narration (text is master)') && publicGenerationDataSchema.timingSpine?.properties?.slides?.items?.properties?.governedBy?.enum?.includes('authored slide timing') && publicGenerationDataSchema.timingSpine?.properties?.slides?.items?.properties?.dwellMs?.type?.includes('null') && publicGenerationDataSchema.timingSpine?.additionalProperties === false, JSON.stringify(publicGenerationDataSchema.timingSpine))
ok('public generation schema types the resolve/locked/commit measured-audio narration timeline', publicGenerationDataSchema.narrationTimeline?.required?.join(',') === 'phase,source,note,slides' && publicGenerationDataSchema.narrationTimeline?.properties?.phase?.enum?.includes('resolve') && publicGenerationDataSchema.narrationTimeline?.properties?.phase?.enum?.includes('lockedDryRun') && publicGenerationDataSchema.narrationTimeline?.properties?.source?.enum?.includes('resolved-audio') && publicGenerationDataSchema.narrationTimeline?.properties?.source?.enum?.includes('locked-audio') && publicGenerationDataSchema.narrationTimeline?.properties?.slides?.items?.required?.includes('realDurationMs') && publicGenerationDataSchema.narrationTimeline?.properties?.slides?.items?.properties?.realDurationMs?.type === 'number' && publicGenerationDataSchema.narrationTimeline?.properties?.slides?.items?.properties?.beats?.items?.properties?.autoSyncedBuild?.type === 'boolean' && publicGenerationDataSchema.narrationTimeline?.properties?.slides?.items?.properties?.beats?.items?.properties?.anchorMethod?.type === 'string' && publicGenerationDataSchema.narrationTimeline?.properties?.slides?.items?.properties?.segments?.items?.properties?.gapBeforeMs?.type === 'number' && /measured audio/i.test(publicGenerationDataSchema.narrationTimeline?.description || '') && /not word-level audio alignment/i.test(publicGenerationDataSchema.narrationTimeline?.description || ''), JSON.stringify(publicGenerationDataSchema.narrationTimeline))
ok('public generation schema types the locked-media handoff', publicGenerationDataSchema.lockedSpec?.type?.includes('object') && /pass.*lockedDryRun|commit/i.test(publicGenerationDataSchema.lockedSpec?.description || '') && publicGenerationDataSchema.lockedSpecPatch?.items?.properties?.op?.enum?.includes('merge') && publicGenerationDataSchema.resolvedAssets?.items?.properties?.segments?.type === 'array' && publicGenerationDataSchema.resolvedAssets?.items?.properties?.lockedAudio?.properties?.handle?.type === 'string', JSON.stringify({ lockedSpec: publicGenerationDataSchema.lockedSpec, lockedSpecPatch: publicGenerationDataSchema.lockedSpecPatch, resolvedAssets: publicGenerationDataSchema.resolvedAssets }))
ok('public generation schema types the AI/MCP handshake', publicGenerationDataSchema.handshake?.properties?.declared?.properties?.bar?.type?.includes('null') && publicGenerationDataSchema.handshake?.properties?.checks?.items?.properties?.status?.enum?.includes('gap') && publicGenerationDataSchema.handshake?.properties?.consistent?.type === 'boolean' && publicGenerationDataSchema.handshake?.additionalProperties === false, JSON.stringify(publicGenerationDataSchema.handshake))
ok('public generation output schema advertises the correction/readback contract',
	publicGenerationDataSchema.warnings?.type === 'array' &&
	publicGenerationDataSchema.errors?.type === 'array' &&
	publicGenerationDataSchema.layoutRecommendations?.type === 'object' &&
	publicGenerationDataSchema.appliedDefaults?.type === 'object' &&
	publicGenerationDataSchema.timingSpine?.type?.includes?.('object') &&
	publicGenerationDataSchema.next?.type?.includes?.('object') &&
	publicSlideReadbackSchema.objects?.type === 'array' &&
	publicObjectReadbackSchema.placementSource?.enum?.includes('engine') &&
	publicObjectReadbackSchema.placementIntentSource?.enum?.includes('author-semantic-region') &&
	publicObjectReadbackSchema.rect?.description?.includes('readback only') &&
	publicFindingSchema.reason?.type === 'string' &&
	publicFindingSchema.fix?.type === 'string' &&
	publicFindingSchema.evidence?.type === 'object' &&
	/semantic spec changes/.test(publicGenerationDataSchema.errors?.description || '') &&
	/evidence/.test(publicGenerationDataSchema.warnings?.description || ''),
	JSON.stringify({ publicGenerationDataSchema, publicSlideReadbackSchema, publicObjectReadbackSchema, publicFindingSchema }))
ok('public generation schema types visual-balance readback in every plan surface',
	publicSlideReadbackSchema.visualBalance?.properties?.densityRatio?.type === 'number' &&
	publicSlideReadbackSchema.visualBalance?.properties?.status?.enum?.includes('underfilled') &&
	publicSlideReadbackSchema.visualBalance?.additionalProperties === false &&
	publicAppliedDefaultsSlideSchema.visualBalance?.properties?.densityRatio?.type === 'number' &&
	publicAppliedDefaultsSlideSchema.visualBalance?.properties?.arrangementApplied?.type === 'boolean' &&
	publicAppliedDefaultsSlideSchema.visualBalance?.properties?.regions?.additionalProperties?.properties?.density?.type === 'number' &&
	publicAppliedDefaultsSlideSchema.visualBalance?.properties?.regions?.additionalProperties?.properties?.blocks?.items?.type === 'string' &&
	publicAppliedDefaultsSlideSchema.visualBalance?.properties?.status?.enum?.includes('imbalanced') &&
	publicAppliedDefaultsSlideSchema.visualBalance?.additionalProperties === false,
	JSON.stringify({ slide: publicSlideReadbackSchema.visualBalance, appliedDefaults: publicAppliedDefaultsSlideSchema.visualBalance }))
ok('public generation schema types unranked selected-layout feasibility readback', publicGenerationDataSchema.layoutRecommendations?.required?.includes('slides') && publicGenerationDataSchema.layoutRecommendations?.required?.includes('unranked') && publicGenerationDataSchema.layoutRecommendations?.properties?.selectionAuthority?.enum?.includes('ai') && publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.required?.includes('slideIndex') && publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.required?.includes('selectionStatus') && publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.properties?.proposals?.maxItems === 1 && !Object.hasOwn(publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.properties?.proposals?.items?.properties || {}, 'score') && !Object.hasOwn(publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.properties?.proposals?.items?.properties || {}, 'why') && publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.properties?.proposals?.items?.properties?.regions?.type === 'object' && publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.properties?.proposals?.items?.properties?.assignment?.type === 'object' && publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.properties?.proposals?.items?.properties?.assignmentRects?.type === 'object' && publicGenerationDataSchema.layoutRecommendations?.properties?.slides?.items?.properties?.proposals?.items?.properties?.assignmentRects?.additionalProperties?.properties?.w?.type === 'number' && publicGenerationDataSchema.layoutRecommendations?.properties?.confirmVia?.type === 'string', JSON.stringify(publicGenerationDataSchema.layoutRecommendations))
ok('public generation schema types semantic presenter readback', publicGenerationDataSchema.presenterContract?.properties?.policy?.type === 'object' && publicGenerationDataSchema.presenterContract?.properties?.timeline?.type === 'object' && publicGenerationDataSchema.presenterContract?.properties?.executionPlan?.type === 'object' && publicGenerationDataSchema.presenterContract?.properties?.executionPlan?.properties?.entries?.items?.properties?.talkingHead?.type === 'boolean' && publicGenerationDataSchema.presenterRuntime?.properties?.entries?.type === 'array' && publicGenerationDataSchema.presenterContract?.properties?.warnings?.items?.properties?.message?.type === 'string' && publicGenerationDataSchema.presenterContract?.properties?.warnings?.items?.properties?.reason?.type === 'string' && publicGenerationDataSchema.presenterContract?.properties?.warnings?.items?.properties?.fix?.type === 'string' && publicGenerationDataSchema.presenterContract?.properties?.warnings?.items?.properties?.evidence?.type === 'object' && publicGenerationDataSchema.presenterContract?.additionalProperties === false && publicGenerationDataSchema.presenterContract?.properties?.executionPlan?.additionalProperties === false && publicGenerationDataSchema.presenterRuntime?.additionalProperties === false && !Object.hasOwn(publicGenerationDataSchema.presenterContract?.properties || {}, 'powerPointNative') && !Object.hasOwn(publicGenerationDataSchema.presenterRuntime?.properties || {}, 'operationRefs'), JSON.stringify({ presenterContract: publicGenerationDataSchema.presenterContract, presenterRuntime: publicGenerationDataSchema.presenterRuntime }))
ok('public Director status schema is engine-neutral',
	publicDirectorStatusTool?.outputSchema?.properties?.data?.properties?.readyForAuthoring?.description?.includes('governed Director') === true &&
	!('readyForPrimitives' in (publicDirectorStatusTool?.outputSchema?.properties?.data?.properties || {})) &&
	!/primitive/i.test(json(publicDirectorStatusTool)),
	JSON.stringify(publicDirectorStatusTool))
ok('public deterministic example uses semantic stage names',
	!/primitive-instantiation|primitive-direct/i.test(json(capabilities)),
	json(capabilities?.data?.examples?.[0]?.payload?.spec?.authoringContract?.directorStages))
ok('public workflow guidance stays semantic',
	!/\bprimitive(?:-direct)?\b/i.test(json(workflow)),
	json(workflow))
ok('public help uses progressive discovery instead of embedding the full capability matrix',
	!Object.hasOwn(capabilities?.data || {}, 'specCapabilityMatrix') &&
	!Object.hasOwn(workflow?.data || {}, 'specCapabilityMatrix') &&
	capabilities?.data?.capabilityIndex?.some(row => row.composeWith === 'betterpptx.deck.generate_from_spec') &&
	capabilities?.data?.progressiveDiscovery?.some(row => row.tool === 'betterpptx.authoring.catalog') &&
	capabilities?.data?.progressiveDiscovery?.some(row => row.tool === 'betterpptx.options.catalog') &&
	workflow?.data?.capabilityDiscovery?.tool === 'betterpptx.help.capabilities',
	JSON.stringify({ capabilityIndex: capabilities?.data?.capabilityIndex, progressiveDiscovery: capabilities?.data?.progressiveDiscovery, workflowDiscovery: workflow?.data?.capabilityDiscovery }))
const starterSpec = capabilities?.data?.examples?.[0]?.payload?.spec
ok('public starter example preserves semantic placement and the Director contract',
	starterSpec?.authoringContract?.workflow === 'authoring-excellence-director-v1' &&
	starterSpec?.slides?.every(slide => slide.layoutIntent && slide.message) &&
	starterSpec?.slides?.every(slide => (slide.content || []).every(item => item.name)) &&
	!/"(?:bbox|rect|x|y|w|h)"\s*:/.test(json(starterSpec)),
	JSON.stringify(starterSpec))
ok('public tool list exposes no primitive authoring front door', primitiveAuthoringNames.length === 0, primitiveAuthoringNames.join(', '))
ok('public tool surface contains no implementation primitive vocabulary',
	!(/\bprimitive\b/i.test(json(publicProductTools)) || /includeCallPlan|billingOverride|generatedByPrimitiveHandlers|committedObjects/i.test(json(publicGenerationTool))),
	JSON.stringify(publicGenerationTool))
ok('primary generation schema teaches semantic image annotation placement',
	/nativeAnnotations/.test(publicGenerationTool?.inputSchema?.properties?.spec?.description || '') &&
	/image-aware/.test(publicGenerationTool?.inputSchema?.properties?.spec?.description || '') &&
	/never provide annotation coordinates/.test(publicGenerationTool?.inputSchema?.properties?.spec?.description || '') &&
	!(/coordinateMode/.test(publicGenerationTool?.inputSchema?.properties?.spec?.description || '')),
	JSON.stringify(publicGenerationTool))
const publicGenerationSchemaText = json(publicGenerationTool?.inputSchema)
ok('public generation schema teaches semantic data proof without private provenance',
	/evidenceSource/.test(publicGenerationSchemaText) &&
	!/verified:true plus provenance|data provenance/i.test(json(publicGenerationTool)),
	JSON.stringify(publicGenerationTool))
const compactPrinciples = capabilities?.data?.authoringPrinciples
const compactApi = capabilities?.data?.authoringApi
const expectedVisualLenses = ['communication', 'composition', 'typography', 'colour-and-lighting', 'data-proof', 'native-objects', 'motion-and-timing', 'accessibility', 'technical-integrity', 'beauty']
ok('compact semantic authoring principles preserve AI design authority',
	compactPrinciples?.contractVersion === 'authoring-excellence.public-principles.v2' &&
	compactPrinciples?.designAuthority === 'ai' &&
	compactPrinciples?.engineRole === 'execute-measure-validate-serialize' &&
	compactPrinciples?.decisionAuthority?.aiOwns?.some(item => /narrative arc/i.test(item)) &&
	compactPrinciples?.decisionAuthority?.aiOwns?.some(item => /exact choices/i.test(item)) &&
	compactPrinciples?.decisionAuthority?.aiOwns?.some(item => /release acceptance/i.test(item)) &&
	compactPrinciples?.decisionAuthority?.engineOwns?.some(item => /final geometry/i.test(item)) &&
	compactPrinciples?.decisionAuthority?.engineOwns?.some(item => /package-safe serialization/i.test(item)) &&
	compactPrinciples?.nativeFirstPolicy?.selectionRule?.includes('Catalog order is not a recommendation') &&
	compactPrinciples?.placementPolicy?.mode === 'semantic-or-visual-reference-pixels' &&
	compactPrinciples?.placementPolicy?.forbiddenFields?.includes('bbox') &&
	compactPrinciples?.placementPolicy?.forbiddenFields?.includes('x') &&
	compactPrinciples?.dataProof?.required?.includes('verified:true') &&
	compactPrinciples?.firstTimeRight?.attemptBoundary?.startsAt === 'first betterpptx.deck.save call' &&
	compactPrinciples?.firstTimeRight?.visualReview?.contractVersion === 'authoring-excellence.visual-review.v2' &&
	compactPrinciples?.firstTimeRight?.visualReview?.contactSheetIsSufficient === false &&
	compactPrinciples?.firstTimeRight?.visualReview?.lenses?.join(',') === expectedVisualLenses.join(','),
	JSON.stringify(compactPrinciples))
ok('compact authoring API is directly discoverable and actionable',
	compactApi?.contractVersion === 'authoring-excellence.public-api.v2' &&
	compactApi?.compose?.tool === 'betterpptx.deck.generate_from_spec' &&
	compactApi?.compose?.specSchema === 'betterpptx.deck-spec.v1' &&
	compactApi?.compose?.workflow === 'authoring-excellence-director-v1' &&
	compactApi?.compose?.phases?.find(phase => phase.id === 'dryRun')?.mutatesDeck === false &&
	compactApi?.compose?.phases?.find(phase => phase.id === 'resolve')?.mutatesDeck === false &&
	compactApi?.compose?.phases?.find(phase => phase.id === 'commit')?.mutatesDeck === true &&
	compactApi?.requiredDomains?.contentStory?.includes('audience') &&
	compactApi?.requiredDomains?.visualDesign?.includes('world') &&
	compactApi?.requiredDomains?.motionTime?.includes('masterClock') &&
	compactApi?.readbackOrder?.some(item => /errors and warnings/i.test(item)) &&
	compactApi?.correctionLoop?.some(item => /change only story/i.test(item)) &&
	workflow?.data?.authoritySummary?.designAuthority === 'ai' &&
	workflow?.data?.capabilityDiscovery?.tool === 'betterpptx.help.capabilities',
	JSON.stringify({ compactApi, workflow: workflow?.data }))
const specRecipe = await callBetterPptxTool('betterpptx.help.tool_recipe', { tool: 'betterpptx.deck.generate_from_spec', detail: 'full' }, context)
const specRecipeJson = json(specRecipe)
const specRecipeFields = specRecipe?.data?.recipes?.flatMap(item => item.sequence || []).flatMap(step => step.semanticFields || []) || []
ok('semantic recipe does not instruct authored geometry',
	!specRecipeJson.includes('bbox/rect') &&
	specRecipeFields.includes('slides[].layoutIntent') &&
	specRecipeFields.includes('content[].region') &&
	specRecipeFields.includes('content[].arrange'), specRecipeJson)
ok('generation failure stays generic when no private credential is configured', unavailable?.ok === false && !banned.test(json(unavailable)))
const coordinateRegionSpec = capabilities?.data?.examples?.[0]?.payload?.spec
	? JSON.parse(JSON.stringify(capabilities.data.examples[0].payload.spec))
	: null
if (coordinateRegionSpec?.slides?.[0]) {
	coordinateRegionSpec.slides[0].regionPlan = { hero: { x: 1, y: 1, w: 4, h: 2 } }
}
const coordinateRegionResult = coordinateRegionSpec
	? await callBetterPptxTool('betterpptx.deck.generate_from_spec', { dryRun: true, detail: 'full', spec: coordinateRegionSpec }, context)
	: null
ok('public Director rejects coordinate-bearing region plans', coordinateRegionResult?.ok === false && !banned.test(json(coordinateRegionResult)), json(coordinateRegionResult))
const coordinateAnnotationSpec = coordinateRegionSpec ? JSON.parse(JSON.stringify(coordinateRegionSpec)) : null
if (coordinateAnnotationSpec?.slides?.[0]) {
	coordinateAnnotationSpec.slides[0].content = [{
		kind: 'image', name: 'annotated-image', region: 'body',
		visualIntent: { mode: 'generate', concept: 'semantic teaching illustration', nativeAnnotations: { labels: [{ text: 'FACT', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] } },
	}]
}
const coordinateAnnotationResult = coordinateAnnotationSpec
	? await callBetterPptxTool('betterpptx.deck.generate_from_spec', { dryRun: true, detail: 'full', spec: coordinateAnnotationSpec }, context)
	: null
ok('public Director rejects coordinate-bearing image annotations', coordinateAnnotationResult?.ok === false && !banned.test(json(coordinateAnnotationResult)), json(coordinateAnnotationResult))

let pathRejected = false
try { blackbox.assertNoPublicLocalPathArgs({ outputDir: 'C:\\private\\secrets', image: { path: 'C:\\private\\human.png' } }) } catch { pathRejected = true }
ok('public path-bearing arguments fail closed', pathRejected)

const fakeTools = [
	{ name: 'betterpptx.assets.generate_image', description: 'Flux.2 model provider from C:\\private\\engine.mjs', inputSchema: { type: 'object', properties: { provider: { type: 'string' }, sourcePath: { type: 'string' }, outputDir: { type: 'string' }, prompt: { type: 'string' }, runtime: { type: 'object', properties: { providerName: { type: 'string' }, model_revision: { type: 'string' }, localPath: { type: 'string' }, execution: { type: 'object', properties: { gpu_type: { type: 'string' }, privateAssetPath: { type: 'string' } } } } } } } },
	{ name: 'betterpptx.io.read_file', description: 'read source code', inputSchema: { type: 'object' } },
]
const publicTools = blackbox.publicToolList(fakeTools)
const publicGeneration = publicTools.find(tool => tool.name === 'betterpptx.assets.generate_image')
ok('public tool filtering removes introspection tools', publicTools.length === 1 && publicTools[0]?.name === 'betterpptx.assets.generate_image')
ok('public generation schema removes provider/path fields', publicGeneration && !/provider|sourcePath|outputDir|Flux|engine\.mjs/i.test(json(publicGeneration)), json(publicGeneration))

const publicSchemaText = json(publicGeneration)
ok('nested public schema removes renamed runtime/provider/path fields', publicGeneration && !/providerName|model_revision|localPath|gpu_type|privateAssetPath/i.test(publicSchemaText), publicSchemaText)

const sanitized = blackbox.sanitizePublicResult({ provider: 'private-provider', model: 'private-model', sourcePath: 'C:\\private\\engine.mjs', license: { commercialUse: 'allowed' }, clipMap: { greet: 1 }, contactMap: { 1: 420 }, clipDurations: { 1: 900 }, animId: 1, framePos: { x: 1, y: 2 }, bboxFrom: 'calibration', handle: 'gen://image/abc123', note: 'PPTX_ULTIMATE_DECYPHER_TOOL and server filesystem' })
ok('result sanitizer removes private fields and rewrites internal strings', !/private-provider|private-model|engine\.mjs|server filesystem|PPTX_ULTIMATE_DECYPHER_TOOL/i.test(json(sanitized)) && sanitized.handle === 'gen://image/abc123', json(sanitized))
ok('result sanitizer hides baked presenter and solved-geometry internals', !Object.hasOwn(sanitized, 'clipMap') && !Object.hasOwn(sanitized, 'contactMap') && !Object.hasOwn(sanitized, 'clipDurations') && !Object.hasOwn(sanitized, 'animId') && !Object.hasOwn(sanitized, 'framePos') && !Object.hasOwn(sanitized, 'bboxFrom'), json(sanitized))
const sanitizedModelSelection = blackbox.sanitizePublicResult({ model: 'private-model', selectors: { model3dViewPresetId: 'model3d-view-012' } })
ok('result sanitizer preserves the documented native Model 3D View selector', sanitizedModelSelection?.selectors?.model3dViewPresetId === 'model3d-view-012' && !Object.hasOwn(sanitizedModelSelection, 'model'), json(sanitizedModelSelection))
const sanitizedOpaqueModel = blackbox.sanitizePublicResult({ model: 'model3d://microsoft-stock/example', selectors: { model3dViewPresetId: 'model3d-view-012' } })
ok('result sanitizer preserves an opaque public native 3-D asset reference',
	/^asset:\/\/catalog\/model3d\/[a-f0-9]{32}$/i.test(sanitizedOpaqueModel?.model || '') &&
	sanitizedOpaqueModel?.selectors?.model3dViewPresetId === 'model3d-view-012',
	json(sanitizedOpaqueModel))
ok('sanitized response has no banned generation-stack vocabulary', !banned.test(json(sanitized)))

const sanitizedAvatar = blackbox.sanitizePublicResult({
	'X-Pipeline': 'liveportrait-musetalk-commercial',
	'X-Enhancement': 'restoreformer++',
	'X-Restoreformer-Seconds': 2.4,
	pipeline: 'private-avatar-pipeline',
	downloadName: 'liveportrait-musetalk-restoreformer++-canary.pptx',
	note: 'Current promoted production canary uses RestoreFormer++.',
	handle: 'gen://video/avatar123',
})
ok('public avatar diagnostics and implementation pipeline fields are removed or rewritten', !banned.test(json(sanitizedAvatar)) && !/X-Pipeline|X-Enhancement|pipeline/i.test(json(sanitizedAvatar)) && sanitizedAvatar.handle === 'gen://video/avatar123', json(sanitizedAvatar))

const nestedSanitized = blackbox.sanitizePublicResult({
	result: [{
		metadata: {
			ProviderName: 'private-provider',
			model_revision: 'private-model-revision',
			localPath: 'D:\\private\\worker.mjs',
			'X-Pipeline': 'liveportrait-musetalk-commercial',
		},
		artifact: {
			fileName: 'liveportrait-musetalk-restoreformer++-canary.pptx',
			download: 'gen://video/avatar123',
		},
		notes: ['RestoreFormer++ was used in a private staging canary.'],
	}],
	download: { downloadName: 'liveportrait-musetalk-restoreformer++-canary.pptx' },
})
const sanitizedArtifactName = sanitizePublicArtifactName('liveportrait-musetalk-restoreformer++-canary.pptx')
ok('recursive public result sanitization covers nested arrays, metadata, and filenames',
	!banned.test(json(nestedSanitized)) &&
	!/ProviderName|model_revision|localPath|X-Pipeline|pipeline|private-provider|private-model-revision|worker\.mjs/i.test(json(nestedSanitized)) &&
	nestedSanitized.result?.[0]?.artifact?.download === 'gen://video/avatar123' &&
	sanitizedArtifactName === 'presentation.pptx', JSON.stringify({ nestedSanitized, sanitizedArtifactName }))

const packageProbe = new JSZip()
packageProbe.file('ppt/slides/slide1.xml', '<p:sld><a:t>X-Pipeline: liveportrait-musetalk-commercial</a:t><a:t>RestoreFormer++</a:t><a:t>providerExecutionId: run-123</a:t><a:t>executionId=run-456</a:t></p:sld>')
packageProbe.file('ppt/notesSlides/notesSlide1.xml', '<p:notes><a:t>X-Enhancement: restoreformer++</a:t></p:notes>')
packageProbe.file('ppt/charts/chart1.xml', '<c:chart><c:v>liveportrait-musetalk-restoreformer++</c:v></c:chart>')
const packageBefore = await validatePublicAvatarDiagnosticsFromZip(packageProbe)
const packageScrubHits = await scrubPublicAvatarDiagnostics(packageProbe)
const packageAfter = await validatePublicAvatarDiagnosticsFromZip(packageProbe)
const metadataProbe = new JSZip()
metadataProbe.file('docProps/core.xml', '<cp:coreProperties><cp:keywords>providerExecutionId: run-789</cp:keywords></cp:coreProperties>')
const metadataResult = await validatePublicAvatarDiagnosticsFromZip(metadataProbe)
ok('package-boundary avatar diagnostics are detected, scrubbed, and revalidated',
	!packageBefore.ok && packageBefore.issueCount >= 3 && Object.keys(packageScrubHits).length === 3 && packageAfter.ok &&
	!metadataResult.ok && metadataResult.issues.some(issue => issue.scope === 'package text'),
	JSON.stringify({ before: packageBefore.issueCount, scrubbed: packageScrubHits, after: packageAfter.issueCount, metadata: metadataResult }))

const report = { schemaVersion: 'betterpptx.g1-blackbox-adversarial.v1', publicMode: true, network: false, customerImages: false, externalAi: false, checks: pass, failures: fail }
fs.writeFileSync(path.join(repo, 'betterpptx-mcp', 'outputs', 'g1-blackbox-adversarial-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
