#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { PUBLIC_SEMANTIC_VERSION, TOOL_SCHEMA_VERSION } from './public-manifest.mjs'

const value = flag => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1] }
const endpoint = new URL(value('--mcp-url') || 'https://betterpptx.tail070c3a.ts.net/mcp')
const bearerToken = value('--bearer-token') || process.env.BETTERPPTX_TEST_HTTP_TOKEN
const outputDir = path.resolve(value('--outdir') || '.codex-tmp/live-creative-contract-v1')
await mkdir(outputDir, { recursive: true })
const report = { schemaVersion: 'betterpptx.live-creative-contract.v1', endpointOrigin: endpoint.origin, startedAt: new Date().toISOString(), status: 'RUNNING', checks: [] }
const pass = (id, evidence = {}) => report.checks.push({ id, status: 'PASS', ...evidence })
const client = new Client({ name: 'betterpptx-live-creative-contract', version: '1' }, { capabilities: {} })
const transport = new StreamableHTTPClientTransport(endpoint, {
	requestInit: { headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {} },
})
const decks = new Set()

function parsed(result) {
	if (result?.structuredContent) return result.structuredContent
	const text = result?.content?.find(item => item.type === 'text')?.text || ''
	if (/sign in to betterpptx/i.test(text)) {
		const error = new Error('Protected live authoring requires an authenticated supported-client session or --bearer-token.')
		error.code = 'AUTH_REQUIRED'
		throw error
	}
	try { return JSON.parse(text || '{}') } catch {
		return { ok: false, error: { code: 'NON_JSON_TOOL_RESULT', message: text || 'Tool returned no structured result.' } }
	}
}
async function raw(name, args = {}) { return parsed(await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 })) }
async function call(name, args = {}) {
	const result = await raw(name, args)
	assert.equal(result?.ok, true, `${name}: ${JSON.stringify(result?.error || result)}`)
	return result.data || result
}

const simpleSpec = title => ({
	schemaVersion: 'betterpptx.deck-spec.v1', title,
	authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
	slides: [{ id: 'one', title, content: [{ kind: 'textBox', name: 'headline', text: title, rect: { x: 0.8, y: 0.8, w: 9.5, h: 0.8 } }] }],
})

try {
	await client.connect(transport)
	const tools = await client.listTools()
	const generate = tools.tools.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	assert.ok(generate.inputSchema.properties.alternativeAuthorization)
	const publicAuthoringContractSchema = generate.outputSchema?.properties?.data?.properties?.authoringContract?.properties
	assert.deepEqual(publicAuthoringContractSchema?.geometryAuthority?.enum, ['ai'])
	assert.ok(!publicAuthoringContractSchema?.placementPolicy?.enum?.includes('semantic-layout-only'))
	pass('typed-alternative-authorization-contract')

	const help = await call('betterpptx.help.capabilities', { detail: 'summary', intent: 'exact AI-authored composition' })
	assert.equal(help.capabilityDiscovery?.semanticVersion, PUBLIC_SEMANTIC_VERSION)
	assert.equal(help.capabilityDiscovery?.toolSchemaVersion, TOOL_SCHEMA_VERSION)
	const compositionModes = help.authoringPrinciples?.compositionModes || []
	assert.ok(compositionModes.length >= 2)
	assert.ok(compositionModes.every(mode => mode.geometryAuthority === 'ai'))
	assert.ok(!compositionModes.some(mode => mode.id === 'semantic-layout-only'))
	pass('ai-only-geometry-discovery', { compositionModes: compositionModes.map(mode => mode.id) })

	const legacySemantic = simpleSpec('Rejected legacy semantic placement')
	legacySemantic.authoringContract.geometryAuthority = 'engine'
	legacySemantic.authoringContract.placementPolicy = 'semantic-layout-only'
	const legacyResult = await raw('betterpptx.deck.generate_from_spec', { spec: legacySemantic, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	assert.equal(legacyResult.ok, false)
	assert.equal(legacyResult.error?.details?.issues?.[0]?.code, 'ENGINE_GEOMETRY_DEACTIVATED')
	pass('legacy-engine-geometry-rejected')

	const sovereignGeometry = await call('betterpptx.deck.generate_from_spec', { spec: simpleSpec('Sovereign exact geometry'), phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	assert.equal(sovereignGeometry.authoringContract.geometryAuthority, 'ai')
	assert.equal(sovereignGeometry.appliedDefaults?.layout?.enginePlacedObjects, 0)
	assert.ok((sovereignGeometry.slides?.[0]?.objects || []).every(object => object.placementSource === 'author'))
	pass('sovereign-ai-geometry-live')

	const directorSpec = simpleSpec('Director exact geometry')
	directorSpec.authoringContract = { workflow: 'authoring-excellence-director-v1', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' }
	directorSpec.contentStory = { audience: 'reviewers', outcome: 'verify geometry authority', remember: 'Director cannot place objects' }
	directorSpec.visualDesign = { world: 'Editorial proof', framing: 'AI-authored exact composition' }
	directorSpec.motionTime = { masterClock: 'static', timingSource: 'authored', syncPolicy: 'single clock' }
	const directorGeometry = await call('betterpptx.deck.generate_from_spec', { spec: directorSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	assert.equal(directorGeometry.authoringContract.geometryAuthority, 'ai')
	assert.equal(directorGeometry.appliedDefaults?.layout?.enginePlacedObjects, 0)
	assert.ok((directorGeometry.slides?.[0]?.objects || []).every(object => object.placementSource === 'author'))
	pass('director-ai-geometry-live')

	const scoped = await call('betterpptx.authoring.catalog', { view: 'controls', intent: 'Editable typography only. No tables. No presenter. No animation.', limit: 25, offset: 0 })
	assert.ok(scoped.interpretation.relevantFamilies.includes('wordart-text3d'))
	assert.ok(!scoped.interpretation.matchedIntents.includes('animated-table'))
	assert.ok(!scoped.controls.some(control => control.family === 'tables' || control.family === 'presenter-motion' || control.family === 'motion-transitions-morph'))
	pass('clause-aware-negation')

	const material = await call('betterpptx.authoring.catalog', { view: 'controls', intent: 'text3D material', limit: 20, offset: 0 })
	const materialControl = material.controls.find(control => control.id === 'text3DShape.material' || control.jsonPath === 'options.text3D.material')
	assert.ok(materialControl)
	assert.ok(materialControl.matchReasons)
	pass('atomic-material-discovery', { controlId: materialControl.id, jsonPath: materialControl.jsonPath })

	const lessonResult = await call('betterpptx.authoring.catalog', { view: 'lesson', lessonId: 'dimensional-typography' })
	const lesson = lessonResult.lesson || lessonResult
	assert.ok(lesson?.minimalSpec)
	const dry = await call('betterpptx.deck.generate_from_spec', { spec: lesson.minimalSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'free', validationMode: 'strict', detail: 'full' })
	assert.ok(!JSON.stringify(dry.errors || []).includes('TEXT3D_ROTATION_NORMALIZED'))
	pass('equivalent-angle-strict-dry-run')

	const committed = await call('betterpptx.deck.generate_from_spec', { spec: lesson.minimalSpec, phase: 'commit', commitMode: 'createNew', plan: 'free', validationMode: 'strict', validateAfterCompile: true, detail: 'full' })
	decks.add(committed.deckId)
	assert.equal(committed.validation?.valid, true)
	const native = await call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId })
	assert.ok(native.nativeRepresentation.nativeObjects > 0)
	assert.equal(native.atmosphereReadback.coverageStatus, 'not-applicable')
	assert.equal(native.atmosphereReadback.perceptualVerification.status, 'not-performed')
	assert.equal(native.authoritativePowerPointReopen.status, 'not-requested')
	assert.ok(native.featureRealizationLedger.controls.some(control => control.controlId === 'text3D.rotationY' && control.requested === -10 && control.normalized === 350))
	pass('honest-native-feature-realization', { nativeObjects: native.nativeRepresentation.nativeObjects, selectedControls: native.featureRealizationLedger.selectedControlCount })

	const chartLessonResult = await call('betterpptx.authoring.catalog', { view: 'lesson', lessonId: 'chart-emphasis' })
	const chartLesson = chartLessonResult.lesson || chartLessonResult
	const chartCommitted = await call('betterpptx.deck.generate_from_spec', { spec: chartLesson.minimalSpec, phase: 'commit', commitMode: 'createNew', plan: 'free', validationMode: 'strict', validateAfterCompile: true, detail: 'full' })
	decks.add(chartCommitted.deckId)
	const chartAudit = await call('betterpptx.deck.validate_native_visuals', { deckId: chartCommitted.deckId })
	const pointControl = chartAudit.featureRealizationLedger.controls.find(control => control.controlId === 'chart.dataPointColors')
	assert.equal(pointControl?.verificationLevel, 'structurally-validated')
	assert.deepEqual(pointControl?.serializationEvidence?.packagePoints, [
		{ index: 0, color: '64748B' },
		{ index: 1, color: '64748B' },
		{ index: 2, color: '64748B' },
		{ index: 3, color: '22C55E' },
	])
	pass('native-chart-point-realization', { controlId: pointControl.controlId, packagePoints: pointControl.serializationEvidence.packagePoints })

	const replacement = simpleSpec('Atomic revision replacement')
	const replaced = await call('betterpptx.deck.generate_from_spec', { deckId: committed.deckId, deckVersion: committed.deckVersion, spec: replacement, phase: 'commit', commitMode: 'replaceDeck', plan: 'free', detail: 'full' })
	assert.equal(replaced.deckSession.deckVersion, replaced.deckVersion)
	assert.equal(replaced.specProvenance.submitted.deckVersion, replaced.deckVersion)
	assert.equal(replaced.specProvenance.effectivePrecompile.deckVersion, replaced.deckVersion)
	const summary = await call('betterpptx.deck.summary', { deckId: committed.deckId })
	assert.equal(summary.deckVersion, replaced.deckVersion)
	pass('atomic-replace-revision', { deckVersion: replaced.deckVersion })

	const downgradeSpec = {
		...simpleSpec('Alternative required'),
		slides: [
			{ id: 's1', title: 'One', content: [{ kind: 'textBox', name: 'one', text: 'One', rect: { x: 1, y: 1, w: 3, h: 1 } }] },
			{ id: 's2', title: 'Two', content: [{ kind: 'textBox', name: 'two', text: 'Two', rect: { x: 1, y: 1, w: 3, h: 1 } }] },
			{ id: 's3', title: 'Three', content: [{ kind: 'wordart', name: 'premium-wordart', text: 'THREE', rect: { x: 1, y: 1, w: 5, h: 1.2 }, transform: 'textArchUp', wordArtStylePresetId: 'wordart-style-001' }] },
		],
	}
	const refused = await raw('betterpptx.deck.generate_from_spec', { spec: downgradeSpec, phase: 'commit', commitMode: 'createNew', plan: 'free' })
	if (refused.ok === false) {
		assert.equal(refused.error?.code, 'ALTERNATIVE_AUTHORIZATION_REQUIRED')
		assert.equal(refused.error?.details?.artifactState, 'not-created')
		assert.match(refused.error?.details?.proposal?.proposalDigest || '', /^[0-9a-f]{64}$/)
		pass('no-silent-downgrade', { outcome: 'explicit-alternative-required' })
	} else {
		const unchanged = refused.data || refused
		decks.add(unchanged.deckId)
		assert.equal(unchanged.freemiumEmission, undefined)
		const unchangedAudit = await call('betterpptx.deck.validate_native_visuals', { deckId: unchanged.deckId })
		assert.ok(unchangedAudit.packageAudit.objectEvidence.some(item => item.objectName.includes('premium-wordart')), JSON.stringify(unchangedAudit.packageAudit.objectEvidence.map(item => item.objectName)))
		pass('no-silent-downgrade', { outcome: 'authored-control-executed-unchanged' })
	}

	const healthResponse = await fetch(new URL('/health', endpoint.origin))
	assert.equal(healthResponse.ok, true)
	const health = await healthResponse.json()
	assert.equal(health.semanticVersion, PUBLIC_SEMANTIC_VERSION)
	assert.equal(health.toolSchemaVersion, TOOL_SCHEMA_VERSION)
	assert.match(health.buildIdentity || '', /^bpptx_build_[0-9a-f]{64}$/)
	assert.match(health.capabilityControlDigest || '', /^[0-9a-f]{64}$/)
	pass('immutable-public-build-identity', { buildIdentity: health.buildIdentity, sourceIdentity: health.sourceIdentity, capabilityControlDigest: health.capabilityControlDigest })
	report.status = 'PASS'
} catch (error) {
	if (error.code === 'AUTH_REQUIRED' && !bearerToken) {
		report.status = 'AUTH_REQUIRED'
		report.blocker = { code: error.code, message: error.message }
		pass('protected-authoring-boundary', { authenticatedExecutionPerformed: false })
	} else {
		report.status = 'FAIL'
		report.error = { name: error.name, message: error.message, stack: error.stack }
		throw error
	}
} finally {
	for (const deckId of decks) await raw('betterpptx.deck.dispose', { deckId }).catch(() => {})
	report.completedAt = new Date().toISOString()
	await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
	await client.close().catch(() => {})
	console.log(JSON.stringify({ status: report.status, report: path.join(outputDir, 'report.json'), checks: report.checks.length }, null, 2))
}
