import assert from 'node:assert/strict'
import Ajv from 'ajv'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const publicRoot = path.join(repoRoot, 'betterpptx-mcp', 'public-authoring-environment')
const skillRoot = path.join(repoRoot, 'betterpptx-mcp', 'skills', 'betterpptx')
const atlasFile = path.join(publicRoot, 'atlas', 'capability-atlas.v1.json')
const casebookFile = path.join(publicRoot, 'casebook', 'casebook-index.v1.json')
const ledgerDevelopmentFile = path.join(publicRoot, 'governance', 'developer-to-public-teaching-gap-ledger.development.json')
const ledgerSchemaFile = path.join(publicRoot, 'governance', 'developer-to-public-teaching-gap-ledger.schema.json')
const ledgerTemplateFile = path.join(publicRoot, 'governance', 'developer-to-public-teaching-gap-ledger.template.json')
const focusedPublicFiles = [
	path.join(publicRoot, 'CAPABILITY_ATLAS.md'),
	path.join(publicRoot, 'CASEBOOK.md'),
	path.join(publicRoot, 'TEACHING_GAP_LEDGER.md'),
	atlasFile,
	casebookFile,
	ledgerDevelopmentFile,
	ledgerSchemaFile,
	ledgerTemplateFile,
	path.join(skillRoot, 'references', 'capability-atlas-and-casebook.md'),
	path.join(skillRoot, 'references', 'portable-json-spec.md'),
]

const atlas = JSON.parse(await fs.readFile(atlasFile, 'utf8'))
const casebook = JSON.parse(await fs.readFile(casebookFile, 'utf8'))
const ledgerDevelopment = JSON.parse(await fs.readFile(ledgerDevelopmentFile, 'utf8'))
const ledgerSchema = JSON.parse(await fs.readFile(ledgerSchemaFile, 'utf8'))
const ledgerTemplate = JSON.parse(await fs.readFile(ledgerTemplateFile, 'utf8'))

const { publicToolList } = await import('../blackbox.mjs')
const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')
const {
	buildBetterPptxPublicEnvironment,
	listPublicTree,
	publicTeachingAssetProjection,
} = await import('../../tools/build-betterpptx-public-environment.mjs')

const publicToolNames = new Set(publicToolList(TOOLS).map(tool => tool.name))
const dispatcher = createMcpToolDispatcher({ sessionId: 'public-teaching-depth-discovery-v1' })
const maxDiscoveryResponseBytes = 30_000
const preferenceKeys = new Set(['rank', 'ranking', 'score', 'weight', 'recommended', 'recommendation'])
const publicResultPreferenceKeys = new Set(['rank', 'ranking', 'score', 'scores', 'recommendation', 'recommendations', 'selectionReason'])
const coordinateKeys = new Set(['x', 'y', 'w', 'h', 'bbox', 'rect', 'points'])
const privateLocationKeys = new Set(['sourcePath', 'filePath', 'repoPath', 'workspacePath', 'serverPath'])
const genericDirectSelectorFields = ['selection.executableId', 'selection.executableValue']
const informationalRouteTools = new Set([
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.validate',
])
const policyProbeArguments = new Map([
	['relationship-and-process', { dataShape: 'process', query: 'workflow', limit: 2, offset: 0 }],
])
const focusedRouteProbes = new Map([
	['betterpptx.chart.recommend', {
		query: 'comparison',
		limit: 2,
		offset: 0,
		galleryLimit: 2,
		styleLimit: 2,
		treatmentLimit: 2,
		format: 'summary',
	}],
	['betterpptx.table.recommend', {
		query: 'comparison',
		limit: 2,
		offset: 0,
		includeNativeStyles: false,
		format: 'summary',
	}],
	['betterpptx.assets.catalog', {
		kind: 'model3d',
		query: 'physical object',
		useCase: 'explain orientation',
		maxResults: 2,
		preferNative: true,
		sizePolicy: 'compact',
	}],
])

function sorted(values) {
	return [...values].sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
}

function objectKeys(value, rows = []) {
	if (Array.isArray(value)) {
		for (const child of value) objectKeys(child, rows)
		return rows
	}
	if (!value || typeof value !== 'object') return rows
	for (const [key, child] of Object.entries(value)) {
		rows.push(key)
		objectKeys(child, rows)
	}
	return rows
}

function stringValues(value, rows = []) {
	if (typeof value === 'string') rows.push(value)
	else if (Array.isArray(value)) {
		for (const child of value) stringValues(child, rows)
	} else if (value && typeof value === 'object') {
		for (const child of Object.values(value)) stringValues(child, rows)
	}
	return rows
}

function clone(value) {
	return JSON.parse(JSON.stringify(value))
}

function responseBytes(value) {
	return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function assertBoundedResponse(tool, value) {
	const bytes = responseBytes(value)
	assert.ok(bytes <= maxDiscoveryResponseBytes, `${tool} returned ${bytes} bytes; cap is ${maxDiscoveryResponseBytes}`)
}

function assertBlackBoxResult(tool, value, { allowCatalogGeometry = false, allowInstructionalRecommendation = false } = {}) {
	const keys = objectKeys(value)
	const selectionKeys = keys.filter(key => publicResultPreferenceKeys.has(key))
	if (allowInstructionalRecommendation) {
		assert.deepEqual(selectionKeys.filter(key => key !== 'recommendation'), [], `${tool} returned a design-selection field`)
	} else {
		assert.deepEqual(selectionKeys, [], `${tool} returned a design-selection field`)
	}
	if (!allowCatalogGeometry) assert.deepEqual(keys.filter(key => coordinateKeys.has(key)), [], `${tool} returned authored coordinates`)
	assert.deepEqual(keys.filter(key => privateLocationKeys.has(key)), [], `${tool} returned a private location`)
}

function directSelectorValues(row) {
	return [row.selection?.executableId, row.selection?.executableValue]
		.filter(value => typeof value === 'string' && value.length > 0)
}

function assertFocusedBoundedFollowUp(tool, args) {
	assert.ok(args && Object.keys(args).length > 0, `${tool} follow-up has no focused arguments`)
	const bound = [args.limit, args.maxResults, args.perPage]
		.find(value => Number.isFinite(Number(value)))
	assert.ok(Number(bound) >= 1 && Number(bound) <= 8, `${tool} follow-up is not bounded to 1-8 results`)
	const focus = [args.query, args.family, args.category, args.dataShape, args.kind, args.intent, args.useCase]
		.find(value => typeof value === 'string' && value.trim().length > 0)
	assert.ok(focus, `${tool} follow-up has no focused query, family, topology, kind, intent, or use case`)
}

async function callDiscovery(tool, args) {
	const result = await dispatcher.call(tool, args)
	assert.equal(result?.ok, true, `${tool}: ${JSON.stringify(result?.error || result)}`)
	const data = result.data || result
	assertBoundedResponse(tool, data)
	return data
}

test('public capability atlas remains factual, unranked, selector-bound, and evidence-honest', () => {
	assert.equal(atlas.schemaVersion, 'betterpptx-public-capability-atlas.v1')
	assert.equal(atlas.ordering, 'entry-id-lexicographic-only')
	assert.equal(atlas.truth.creativeAuthority, 'ai')
	assert.equal(atlas.truth.catalogSemantics, 'unranked-factual-inventory-with-route-only-rows')
	assert.equal(atlas.truth.renderEvidence, 'planned-none-accepted')
	assert.match(atlas.truth.selectorRule, /may name a public follow-up tool or a semantic spec destination, and it is never the selector/)
	assert.match(atlas.truth.selectorRule, /only for a selectorless row and only when it supports a focused bounded request/)
	assert.match(atlas.truth.progressiveDiscoveryRule, /smallest supported page/)
	assert.ok(atlas.entries.length >= 6)
	assert.deepEqual(atlas.entries.map(entry => entry.id), sorted(atlas.entries.map(entry => entry.id)))

	for (const entry of atlas.entries) {
		assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		assert.ok(entry.communicationFunctions.length > 0)
		assert.ok(publicToolNames.has(entry.discovery.tool), `Atlas tool is not public: ${entry.discovery.tool}`)
		assert.ok([
			'live-public-contract',
			'live-generic-catalog-route',
			'live-specialized-catalog-exact-selector',
			'opaque-handle',
		].includes(entry.selectorBinding.type))
		assert.ok(entry.discovery.resultContract?.kind)
		assert.notEqual(Boolean(entry.discovery.arguments), Boolean(entry.discovery.argumentsPolicy), `${entry.id} must define arguments or an arguments policy, not both`)
		if (entry.discovery.arguments) assert.ok(Object.keys(entry.discovery.arguments).length > 0, `${entry.id} has an empty discovery request`)
		if (entry.discovery.argumentsPolicy) assert.ok(Object.keys(entry.discovery.argumentsPolicy).length > 0, `${entry.id} has an empty discovery policy`)
		if (entry.discovery.tool === 'betterpptx.authoring.catalog') {
			assert.equal(entry.discovery.arguments.includePlanned, false)
			assert.equal(entry.discovery.arguments.offset, 0)
			assert.ok(entry.discovery.arguments.limit >= 1 && entry.discovery.arguments.limit <= 8)
			assert.ok(entry.discovery.arguments.family)
			assert.equal(entry.discovery.resultContract.kind, 'generic-authoring-catalog-page')
			assert.deepEqual(entry.discovery.resultContract.directSelectorFields, genericDirectSelectorFields)
			assert.equal(entry.discovery.resultContract.routeField, 'route.exactSelection')
			assert.equal(entry.selectorBinding.type, 'live-generic-catalog-route')
		}
		assert.ok(entry.nativeEditableFacts.rule.length > 20)
		assert.equal(entry.renderEvidence.status, 'planned')
		assert.deepEqual(entry.renderEvidence.caseIds, [])
		assert.ok(entry.constraints.length > 0)
		assert.ok(entry.combinationPattern.length > 20)
		assert.ok(entry.counterexample.length > 20)
	}

	const smartArtEntry = atlas.entries.find(entry => entry.id === 'relationship-and-process')
	assert.equal(smartArtEntry.discovery.tool, 'betterpptx.smartart.catalog')
	assert.equal(smartArtEntry.discovery.arguments, undefined)
	assert.equal(smartArtEntry.discovery.argumentsPolicy.limit, 2)
	assert.equal(smartArtEntry.discovery.argumentsPolicy.offset, 0)
	assert.ok(smartArtEntry.discovery.argumentsPolicy.dataShape)
	assert.ok(smartArtEntry.discovery.argumentsPolicy.query)
	const imageEntry = atlas.entries.find(entry => entry.id === 'image-led-narrative')
	assert.equal(imageEntry.discovery.argumentsPolicy.perPage, 2)

	const keys = objectKeys(atlas)
	assert.deepEqual(keys.filter(key => preferenceKeys.has(key)), [])
	assert.deepEqual(keys.filter(key => coordinateKeys.has(key)), [])
	assert.deepEqual(keys.filter(key => privateLocationKeys.has(key)), [])
})

test('every executable atlas discovery is progressive, size-bounded, and truthful about selectors versus routes', async () => {
	const executable = atlas.entries.filter(entry => entry.discovery.arguments)
	const policyOnly = atlas.entries.filter(entry => entry.discovery.argumentsPolicy)
	assert.ok(executable.length >= 9)
	assert.deepEqual(policyOnly.map(entry => entry.id), ['image-led-narrative', 'relationship-and-process'])
	assert.equal(policyOnly[0].discovery.tool, 'betterpptx.assets.search_stock')
	assert.equal(policyOnly[1].discovery.tool, 'betterpptx.smartart.catalog')

	const discoveries = [
		...executable.map(entry => ({ entry, arguments: entry.discovery.arguments })),
		...policyOnly
			.filter(entry => policyProbeArguments.has(entry.id))
			.map(entry => ({ entry, arguments: policyProbeArguments.get(entry.id) })),
	]
	const routeToolsToProbe = new Set()
	const instructedFollowUps = []
	let directSelectorRows = 0
	let directEquationSelectorRows = 0
	let selectorlessRows = 0

	for (const { entry, arguments: args } of discoveries) {
		assert.ok(Object.keys(args).length > 0, `${entry.id} attempted empty discovery`)
		const data = await callDiscovery(entry.discovery.tool, args)
		assertBlackBoxResult(entry.discovery.tool, data)

		switch (entry.discovery.resultContract.kind) {
			case 'public-capability-contract': {
				assert.ok(data.capabilities?.length > 0)
				assert.equal(data.principle?.aiIsDesignMaster, true)
				assert.deepEqual(entry.discovery.resultContract.selectorFields, [])
				break
			}
			case 'generic-authoring-catalog-page': {
				assert.ok(data.entries?.length > 0)
				assert.ok(data.entries.length <= args.limit)
				assert.equal(data.pagination?.limit, args.limit)
				assert.equal(data.pagination?.offset, args.offset)
				assert.equal(data.principle?.catalogDoesNotSelect, true)
				for (const row of data.entries) {
					assert.ok(row.selection?.semanticKind, `${entry.id}:${row.id} lacks a semantic kind`)
					assert.ok(row.route?.exactSelection, `${entry.id}:${row.id} lacks public route semantics`)
					const selectors = directSelectorValues(row)
					assert.ok(selectors.length <= 1, `${entry.id}:${row.id} exposes ambiguous direct selectors`)
					const route = row.route.exactSelection
					if (selectors.length === 1) {
						directSelectorRows += 1
						if (route === 'betterpptx.equation.catalog') directEquationSelectorRows += 1
						assert.equal(row.status, 'implemented', `${entry.id}:${row.id} exposes a selector without implemented status`)
						assert.equal(row.implemented, true)
						assert.match(selectors[0], /^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
						assert.notEqual(route, selectors[0], `${entry.id}:${row.id} confuses the route with the selector`)
						if (row.selectable !== undefined) assert.equal(row.selectable, true)
					} else {
						selectorlessRows += 1
						assert.notEqual(row.selectable, true, `${entry.id}:${row.id} is selectorless but marked selectable`)
					}

					if (route.startsWith('betterpptx.')) {
						assert.ok(publicToolNames.has(route), `${entry.id}:${row.id} routes to a non-public tool`)
						if (selectors.length === 0) {
							const followUpArgs = focusedRouteProbes.get(route)
							if (followUpArgs) {
								assertFocusedBoundedFollowUp(route, followUpArgs)
								routeToolsToProbe.add(route)
								instructedFollowUps.push({ tool: route, entryId: entry.id, rowId: row.id, arguments: followUpArgs })
							} else {
								assert.ok(informationalRouteTools.has(route), `${entry.id}:${row.id} has no selector and no focused bounded public discovery route`)
							}
						}
					} else {
						assert.equal(selectors.length, 1, `${entry.id}:${row.id} exposes a semantic field route without an executable value`)
						assert.equal(row.route.status, 'spec-front-door')
						assert.match(route, /^[A-Za-z][A-Za-z0-9.[\]]+$/)
					}
				}
				break
			}
			case 'opaque-handle-catalog': {
				assert.ok(data.assets?.length > 0)
				assert.ok(data.assets.length <= args.limit)
				assert.ok(data.assets.every(asset => /^customShape:\/\/public\/[a-f0-9]{32}$/.test(asset.handle)))
				assert.ok(data.assets.every(asset => asset.nativeEditable === true))
				break
			}
			case 'specialized-id-catalog': {
				assert.equal(data.unranked, true)
				assert.equal(data.selectedPlan, null)
				assert.equal(data.pagination?.limit, args.limit)
				assert.ok(data.layouts?.length > 0 && data.layouts.length <= args.limit)
				for (const collection of [data.layouts, data.quickStyles, data.colors]) {
					assert.ok(collection.length > 0)
					assert.ok(collection.every(item => typeof item.id === 'string' && item.id.length > 0))
				}
				break
			}
			default:
				assert.fail(`Unknown atlas result contract: ${entry.discovery.resultContract.kind}`)
		}
	}

	assert.ok(directSelectorRows > 0, 'bounded generic pages did not exercise an explicit selector row')
	assert.ok(directEquationSelectorRows > 0, 'bounded equation discovery did not exercise its direct selectors')
	assert.ok(selectorlessRows > 0, 'bounded generic pages did not exercise an informational route-only row')
	assert.ok(instructedFollowUps.length > 0)
	assert.ok(instructedFollowUps.every(followUp => !followUp.tool.includes('equation.catalog')), 'direct equation selectors triggered an unbounded route call')
	for (const followUp of instructedFollowUps) assertFocusedBoundedFollowUp(followUp.tool, followUp.arguments)
	assert.throws(
		() => assertFocusedBoundedFollowUp('betterpptx.equation.catalog', {}),
		/follow-up has no focused arguments|follow-up is not bounded/,
	)
	assert.throws(
		() => assertFocusedBoundedFollowUp('betterpptx.equation.catalog', { query: 'matrix' }),
		/follow-up is not bounded/,
	)
	assert.deepEqual([...routeToolsToProbe].sort(), [
		'betterpptx.assets.catalog',
		'betterpptx.chart.recommend',
		'betterpptx.table.recommend',
	])

	for (const tool of [...routeToolsToProbe].sort()) {
		const followUpArgs = focusedRouteProbes.get(tool)
		assertFocusedBoundedFollowUp(tool, followUpArgs)
		const data = await callDiscovery(tool, followUpArgs)
		assertBlackBoxResult(tool, data, {
			allowCatalogGeometry: tool === 'betterpptx.table.recommend',
			allowInstructionalRecommendation: tool === 'betterpptx.assets.catalog',
		})
		if (tool === 'betterpptx.chart.recommend' || tool === 'betterpptx.table.recommend') {
			assert.equal(data.unranked, true)
			assert.equal(data.selectedPlan, null)
			assert.ok(data.presets?.length > 0)
			assert.ok(data.presets.every(preset => typeof preset.id === 'string' && preset.id.length > 0))
		}
		if (tool === 'betterpptx.chart.recommend') {
			assert.equal(data.selectionManifestContract.capability, 'chart')
			assert.ok(data.selectionManifestContract.selectorKeys.includes('chartPresetId'))
			assert.equal(data.selectionManifestContract.selectorKeys.includes('chartType'), false)
			assert.ok(data.selectionManifestContract.contentFieldsNotSelectors.includes('chartType'))
			assert.ok(data.presets.every(preset => preset.selectionManifestSelectors?.chartPresetId === preset.id))
			for (const collection of [data.catalog.galleryTiles, data.catalog.stylePresets, data.catalog.treatmentPresets]) {
				assert.ok(collection.every(item => typeof item.id === 'string' && item.id.length > 0))
			}
		}
		if (tool === 'betterpptx.table.recommend') {
			assert.equal(data.selectionManifestContract.capability, 'table')
			assert.ok(data.selectionManifestContract.selectorKeys.includes('tableStylePresetId'))
		}
		if (tool === 'betterpptx.assets.catalog') {
			assert.equal(data.catalogGuide?.policy, 'unranked-ai-selection')
			assert.match(data.recommendation, /choose one .* yourself/i)
			assert.ok(data.assets?.length > 0 && data.assets.length <= focusedRouteProbes.get(tool).maxResults)
			assert.ok(data.assets.every(asset => /^asset:\/\/catalog\/model3d\/[a-f0-9]{32}$/.test(asset.handle)))
		}
	}
})

test('casebook is communication-problem indexed and does not fabricate accepted work', () => {
	assert.equal(casebook.schemaVersion, 'betterpptx-public-casebook-index.v1')
	assert.equal(casebook.organization, 'communication-problem')
	assert.equal(casebook.truth.acceptedCaseCount, 0)
	assert.equal(casebook.truth.developmentCandidateCount, 4)
	assert.equal(casebook.truth.status, 'planned-evidence-lanes-with-withheld-candidates')
	assert.deepEqual(casebook.acceptedCases, [])
	assert.equal(casebook.communicationProblems.length, 6)
	assert.deepEqual(
		casebook.communicationProblems.map(problem => problem.id),
		sorted(casebook.communicationProblems.map(problem => problem.id)),
	)
	for (const problem of casebook.communicationProblems) {
		assert.equal(problem.state, 'planned-evidence-needed')
		assert.deepEqual(problem.acceptedCaseIds, [])
		assert.ok(problem.question.endsWith('?'))
		assert.ok(problem.requiredProof.length >= 4)
	}
	assert.equal(casebook.developmentCandidates.length, 4)
	assert.deepEqual(
		casebook.developmentCandidates.map(candidate => candidate.id),
		sorted(casebook.developmentCandidates.map(candidate => candidate.id)),
	)
	const problemIds = new Set(casebook.communicationProblems.map(problem => problem.id))
	for (const candidate of casebook.developmentCandidates) {
		assert.equal(candidate.state, 'withheld-development-candidate')
		assert.ok(problemIds.has(candidate.communicationProblemId))
		assert.equal(candidate.evidence.currentPublicManifestSha256, null)
		assert.match(candidate.promotionRequirement, /^fresh-current-public-replay/)
		assert.ok(candidate.limitations.length >= 3)
		assert.ok(candidate.transferableLesson.length > 40)
		for (const [key, value] of Object.entries(candidate.evidence)) {
			if (key.endsWith('Sha256') && value !== null) assert.match(value, /^[0-9a-f]{64}$/, `${candidate.id}.${key}`)
		}
	}
	assert.deepEqual(objectKeys(casebook).filter(key => preferenceKeys.has(key)), [])
})

test('teaching-gap schema validates truth state, forward proof, verified state, and release binding', () => {
	const schemaVersion = 'betterpptx-developer-public-teaching-gap-ledger.v1'
	const ajv = new Ajv({ allErrors: true, jsonPointers: true })
	const validateLedger = ajv.compile(ledgerSchema)
	const assertValidLedger = (value, label) => {
		const valid = validateLedger(value)
		assert.equal(valid, true, `${label}: ${JSON.stringify(validateLedger.errors)}`)
	}
	const assertInvalidLedger = (value, label) => {
		const valid = validateLedger(value)
		assert.equal(valid, false, `${label} unexpectedly passed schema validation`)
		assert.ok(validateLedger.errors?.length > 0, `${label} failed without validation errors`)
	}
	assert.equal(ledgerSchema.type, 'object')
	assert.equal(ledgerSchema.additionalProperties, false)
	assert.equal(ledgerSchema.properties.schemaVersion.const, schemaVersion)
	assert.ok(ledgerSchema.allOf.length >= 4)
	assert.equal(ledgerSchema.$defs.entry.additionalProperties, false)
	assert.ok(ledgerSchema.$defs.entry.allOf.length >= 3)
	assert.equal(ledgerSchema.$defs.entry.properties.originEvidence.minItems, 1)
	assert.equal(ledgerSchema.$defs.entry.properties.sealedPromptMaterialPresent.const, false)
	assert.equal(ledgerSchema.$defs.entry.properties.privateDetailsPresent.const, false)
	assert.ok(ledgerSchema.$defs.entry.required.includes('generalizedLesson'))
	assert.ok(ledgerSchema.$defs.entry.required.includes('forwardTest'))
	assert.ok(ledgerSchema.$defs.entry.required.includes('releaseBinding'))
	assert.equal(ledgerSchema.$defs.entry.properties.releaseBinding.oneOf.length, 2)

	assert.deepEqual(ledgerTemplate, {
		schemaVersion,
		isTemplate: true,
		truthState: 'empty-template-no-promoted-lessons',
		entries: [],
	})
	assertValidLedger(ledgerTemplate, 'empty template')
	assert.equal(ledgerDevelopment.schemaVersion, schemaVersion)
	assert.equal(ledgerDevelopment.isTemplate, false)
	assert.equal(ledgerDevelopment.truthState, 'development-evidence-ledger')
	assert.equal(ledgerDevelopment.entries.length, 10)
	assert.deepEqual(sorted(ledgerDevelopment.entries.map(entry => entry.gapId)), [
		'ai-design-authority-engine-execution',
		'all-family-extended-parameter-contracts',
		'atlas-casebook-evidence-honesty',
		'first-save-preview-freeze',
		'native-image-adjustments-corrections-contract',
		'native-image-color-artistic-contract',
		'native-image-framing-contract',
		'native-object-flip-contract',
		'native-object-rotation-contract',
		'semantic-only-black-box-authoring',
	])
	for (const entry of ledgerDevelopment.entries) {
		assert.ok(['target-implemented', 'forward-test-pending'].includes(entry.state))
		assert.notEqual(entry.state, 'verified')
		assert.ok(entry.generalizedLesson.length >= 20)
		assert.ok(entry.originEvidence.length > 0)
		assert.ok(entry.originEvidence.every(evidence => /^[0-9a-f]{64}$/.test(evidence.sha256)))
		if (entry.forwardTest.state === 'planned') {
			assert.equal(entry.forwardTest.resultEvidenceSha256, null)
		} else {
			assert.ok(['verified', 'passed'].includes(entry.forwardTest.state))
			assert.match(entry.forwardTest.resultEvidenceSha256 || '', /^[0-9a-f]{64}$/)
		}
		assert.deepEqual(entry.releaseBinding, { manifestSha256: null, publicRevision: null })
		assert.equal(entry.sealedPromptMaterialPresent, false)
		assert.equal(entry.privateDetailsPresent, false)
	}
	assertValidLedger(ledgerDevelopment, 'development ledger')

	const verifiedEntry = clone(ledgerDevelopment.entries[0])
	verifiedEntry.state = 'verified'
	verifiedEntry.forwardTest = {
		...verifiedEntry.forwardTest,
		state: 'passed',
		resultEvidenceSha256: 'a'.repeat(64),
	}
	verifiedEntry.releaseBinding = {
		manifestSha256: 'b'.repeat(64),
		publicRevision: 'c'.repeat(40),
	}
	assertValidLedger({
		schemaVersion,
		isTemplate: false,
		truthState: 'release-bound-evidence-ledger',
		entries: [verifiedEntry],
	}, 'verified release-bound ledger')

	assertInvalidLedger({ ...clone(ledgerTemplate), entries: [clone(ledgerDevelopment.entries[0])] }, 'populated empty template')
	assertInvalidLedger({ ...clone(ledgerTemplate), isTemplate: false }, 'empty-template truth with false template flag')
	assertInvalidLedger({ ...clone(ledgerDevelopment), isTemplate: true }, 'development truth with true template flag')

	const verifiedWithoutProof = clone(ledgerDevelopment)
	verifiedWithoutProof.entries[0].state = 'verified'
	assertInvalidLedger(verifiedWithoutProof, 'verified entry without passed proof or release binding')

	const unboundRelease = clone(ledgerDevelopment)
	unboundRelease.truthState = 'release-bound-evidence-ledger'
	assertInvalidLedger(unboundRelease, 'release-bound truth with unverified and unbound entries')

	const manifestOnlyBinding = clone(ledgerDevelopment)
	manifestOnlyBinding.entries[0].releaseBinding = {
		manifestSha256: 'e'.repeat(64),
		publicRevision: null,
	}
	assertInvalidLedger(manifestOnlyBinding, 'manifest-only release binding')

	const revisionOnlyBinding = clone(ledgerDevelopment)
	revisionOnlyBinding.entries[0].releaseBinding = {
		manifestSha256: null,
		publicRevision: 'f'.repeat(40),
	}
	assertInvalidLedger(revisionOnlyBinding, 'revision-only release binding')

	for (const state of ['planned', 'failed']) {
		const nonpassedWithHash = clone(ledgerDevelopment)
		nonpassedWithHash.entries[0].forwardTest.state = state
		nonpassedWithHash.entries[0].forwardTest.resultEvidenceSha256 = 'd'.repeat(64)
		assertInvalidLedger(nonpassedWithHash, `${state} forward test with result evidence`)
	}

	const passedWithoutHash = clone(ledgerDevelopment)
	passedWithoutHash.entries[0].forwardTest.state = 'passed'
	assertInvalidLedger(passedWithoutHash, 'passed forward test without result evidence')

	for (const reference of stringValues(ledgerSchema).filter(value => value.startsWith('#'))) {
		assert.match(reference, /^#\//, `Ledger schema reference is not local: ${reference}`)
	}
})

test('focused teaching artifacts contain no secret, private-location, direct-authoring, or implementation surface', async () => {
	const combined = (await Promise.all(focusedPublicFiles.map(file => fs.readFile(file, 'utf8')))).join('\n')
	const forbidden = [
		/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
		/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{16,}\b/,
		/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
		/\b[A-Za-z]:[\\/]/,
		/\\\\[A-Za-z0-9._$ -]+\\/,
		/https?:\/\//i,
		/\b(?:deck\.new|slide\.(?:add|update|delete|reorder)|custom_geometry\.insert)\b/i,
		/\b(?:PptxGenJS|node_modules|engineRoute|nativePackage|provider|sourcePath|repoPath|workspacePath)\b/i,
	]
	for (const pattern of forbidden) assert.doesNotMatch(combined, pattern)
})

test('public skill teaches a cold AI to accept and preserve an attached JSON spec', async () => {
	const skill = await fs.readFile(path.join(skillRoot, 'SKILL.md'), 'utf8')
	const guide = await fs.readFile(path.join(skillRoot, 'references', 'portable-json-spec.md'), 'utf8')
	assert.match(skill, /attaches a `\.json` or `\.betterpptx-spec\.json`/)
	assert.match(skill, /kind:"jsonSpec"/)
	assert.match(skill, /opaque `specHandle`/)
	assert.match(guide, /presentation source code, not disposable tool input/)
	assert.match(guide, /mode:"authoredInput"/)
	assert.match(guide, /mode:"effectivePrecompile"/)
	assert.match(guide, /private by default/)
	assert.match(guide, /without explicit permission/)
	assert.doesNotMatch(guide, /\b(?:deck\.new|slide\.(?:add|update|delete|reorder)|custom_geometry\.insert)\b/i)
})

test('teaching assets are explicit in the manifest and deterministic across two fresh projections', async () => {
	const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-teaching-depth-first-'))
	const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-teaching-depth-second-'))
	try {
		const first = await buildBetterPptxPublicEnvironment({ targetRoot: firstRoot, releaseState: 'development' })
		const second = await buildBetterPptxPublicEnvironment({ targetRoot: secondRoot, releaseState: 'development' })
		assert.deepEqual(await listPublicTree(secondRoot), await listPublicTree(firstRoot))
		assert.deepEqual(second.manifest.teachingAssets, first.manifest.teachingAssets)
		assert.deepEqual(first.manifest.teachingAssets, await publicTeachingAssetProjection(firstRoot))
		assert.deepEqual(Object.keys(first.manifest.teachingAssets), [
			'schemaVersion',
			'capabilityAtlas',
			'casebookIndex',
			'teachingGapLedgerDevelopment',
			'teachingGapLedgerSchema',
			'teachingGapLedgerTemplate',
		])
		for (const artifact of Object.values(first.manifest.teachingAssets).filter(value => value && typeof value === 'object')) {
			assert.match(artifact.sha256, /^[0-9a-f]{64}$/)
			assert.ok(artifact.bytes > 0)
		}
	} finally {
		await fs.rm(firstRoot, { recursive: true, force: true })
		await fs.rm(secondRoot, { recursive: true, force: true })
	}
})
