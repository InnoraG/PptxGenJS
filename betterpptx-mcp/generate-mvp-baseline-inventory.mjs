// Build the private catalog-closure inventory used to define the complete
// existing-capability MVP.  This is an evidence/verification artifact, not a
// public capability response.  It deliberately records declared-but-not-public
// surfaces instead of silently treating them as absent.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { AUTHORING_CAPABILITY_REGISTRY } from './authoring-capability-registry.mjs'
import { NATIVE_STYLE_PRESETS } from './native-style-presets.mjs'
import { TOOLS, TOOL_NAMES } from './tools.mjs'
import { PUBLIC_PRODUCT_TOOLS, PUBLIC_SPEC_FIRST_TOOLS } from './blackbox.mjs'
import { listBetterPptxToolNames } from './engine.mjs'
import { buildCapabilityLedger, ledgerSemanticHash } from '../dist/node/pptx-mcp/capability-ledger.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_COMPOSITION_TOOL = 'betterpptx.deck.generate_from_spec'
const PUBLIC_DISCOVERY_TOOLS = Object.freeze(['betterpptx.authoring.capabilities', 'betterpptx.options.catalog'])
const PUBLIC_VALIDATION_TOOLS = Object.freeze(['betterpptx.deck.validate', 'betterpptx.deck.validate_design', 'betterpptx.deck.validate_accessibility', 'betterpptx.deck.validate_quality'])

function sha256(value) {
	return crypto.createHash('sha256').update(value).digest('hex')
}

function stable(value) {
	if (Array.isArray(value)) return value.map(stable)
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
	}
	return value
}

function stableJson(value) {
	return JSON.stringify(stable(value))
}

function rel(filePath) {
	return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

function hashFile(relativePath) {
	const absolute = path.resolve(ROOT, relativePath)
	if (!fs.existsSync(absolute)) return { path: relativePath, exists: false, sha256: null, bytes: 0 }
	const bytes = fs.readFileSync(absolute)
	return { path: relativePath, exists: true, sha256: sha256(bytes), bytes: bytes.length }
}

function gitValue(args) {
	try {
		return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
	} catch {
		return null
	}
}

function gitState() {
	const status = gitValue(['status', '--short']) || ''
	const changedPaths = status ? status.split(/\r?\n/).filter(Boolean) : []
	return {
		head: gitValue(['rev-parse', 'HEAD']),
		clean: changedPaths.length === 0,
		changedPathCount: changedPaths.length,
		// The path list is intentionally private and omitted from the inventory;
		// the count is enough to explain why a provisional baseline is not frozen.
		statusFingerprint: sha256(changedPaths.join('\n')),
	}
}

function routeFor(row) {
	if (row.classification === 'maintainer-only') return { status: 'maintainer-only', discovery: [], compose: [], validate: [] }
	const category = String(row.family || '').toLowerCase()
	const discovery = [...PUBLIC_DISCOVERY_TOOLS]
	const validate = [...PUBLIC_VALIDATION_TOOLS]
	if (category.includes('chart')) discovery.push('betterpptx.chart.recommend')
	if (category.includes('table')) discovery.push('betterpptx.table.recommend')
	if (category.includes('smartart')) discovery.push('betterpptx.smartart.catalog')
	if (category.includes('equation') || category.includes('math')) discovery.push('betterpptx.equation.catalog')
	if (category.includes('media') || category.includes('image') || category.includes('3d')) discovery.push('betterpptx.assets.catalog')
	if (row.kind === 'tool-declaration' && row.publicSpecFirst) {
		return {
			status: 'public-tool',
			discovery: [...new Set(discovery)],
			compose: [row.publicName],
			validate: [...new Set(validate)],
		}
	}
	return {
		status: 'spec-front-door',
		discovery: [...new Set(discovery)],
		compose: [PUBLIC_COMPOSITION_TOOL],
		validate: [...new Set(validate)],
	}
}

function withRoute(row) {
	return { ...row, publicRoute: routeFor(row) }
}

function registryRows() {
	return AUTHORING_CAPABILITY_REGISTRY.map(row => withRoute({
		id: `family:${row.id}`,
		source: 'semantic-authoring-registry',
		kind: 'authoring-family',
		family: row.id,
		publicName: row.label,
		classification: 'baseline-implemented',
		implementationStatus: row.status,
		nativeModes: [...row.nativeModes],
		fallbackModes: [...row.fallbackModes],
		publicTools: [...row.publicTools],
		selectionSignals: [...row.selectionSignals],
		issues: [...(row.issues || [])],
	}))
}

function ledgerRows() {
	const ledger = buildCapabilityLedger(undefined, 'betterpptx-mcp')
	return {
		ledger,
		rows: ledger.rows.map(row => withRoute({
			id: `ledger:${row.featureId}`,
			source: 'capability-ledger',
			kind: 'capability-row',
			family: row.category,
			publicName: row.publicName,
			classification: row.category === 'MCP Internal Admin Surface'
				? 'maintainer-only'
				: row.implemented ? 'baseline-implemented' : 'planned',
			implemented: row.implemented,
			requiredForCompletion: row.requiredForCompletion,
			coverageMode: row.coverageMode,
			declaredExecutor: row.mcpTool,
			showcaseSlide: row.showcaseSlide,
			validationOracle: [...row.validationOracle],
			lightDarkStable: row.lightDarkStable,
		}))
	}
}

function toolRows() {
	const definitions = new Map(TOOLS.map(tool => [tool.name, tool]))
	const declaredNames = new Set(TOOL_NAMES)
	const names = [...new Set([...TOOL_NAMES, ...listBetterPptxToolNames()])].sort()
	return names.map(name => withRoute({
		id: `tool:${name}`,
		source: 'mcp-tool-surface',
		kind: 'tool-declaration',
		family: name.split('.')[1] || 'mcp',
		publicName: name,
		classification: PUBLIC_SPEC_FIRST_TOOLS.has(name) ? 'baseline-implemented' : 'maintainer-only',
		exposure: PUBLIC_SPEC_FIRST_TOOLS.has(name)
			? 'public-json-spec-first'
			: !declaredNames.has(name) ? 'engine-handler-not-declared' : PUBLIC_PRODUCT_TOOLS.has(name) ? 'declared-product-not-spec-first' : 'declared-not-public',
		publicSpecFirst: PUBLIC_SPEC_FIRST_TOOLS.has(name),
		declaredProductTool: PUBLIC_PRODUCT_TOOLS.has(name),
		declaredInToolCatalog: declaredNames.has(name),
		engineHandlerPresent: listBetterPptxToolNames().includes(name),
		hasSchema: Boolean(definitions.get(name)?.inputSchema),
	}))
}

function nativeStyleRows() {
	return NATIVE_STYLE_PRESETS.map(preset => withRoute({
		id: `native-style:${preset.id}`,
		source: 'native-gallery-style-catalog',
		kind: 'native-gallery-style',
		family: preset.family,
		publicName: preset.label,
		classification: 'baseline-implemented',
		implementationStatus: 'implemented',
		implemented: true,
		coverageMode: 'native-recipe',
		declaredExecutor: PUBLIC_COMPOSITION_TOOL,
		publicTools: [PUBLIC_COMPOSITION_TOOL],
		selectionSignals: [preset.kind, 'exact gallery tile'],
	}))
}

function sourceFiles() {
	return [
	'betterpptx-mcp/authoring-capability-registry.mjs',
	'betterpptx-mcp/public-baseline-catalog.mjs',
		'betterpptx-mcp/tools.mjs',
		'betterpptx-mcp/blackbox.mjs',
	'src/pptx-mcp/capability-ledger.ts',
	'dist/node/pptx-mcp/capability-ledger.js',
	'betterpptx-mcp/engine.mjs',
	'betterpptx-mcp/ir/spec-compiler.mjs',
	'betterpptx-mcp/ir/deck-spec.v1.json',
	'betterpptx-mcp/option-registry.mjs',
	'betterpptx-mcp/native-style-presets.mjs',
]
}

function countBy(rows, key) {
	return rows.reduce((result, row) => {
		const value = row[key] || 'unknown'
		result[value] = (result[value] || 0) + 1
		return result
	}, {})
}

export function buildMvpBaselineInventory(options = {}) {
	const generatedAt = options.generatedAt || new Date().toISOString()
	const ledgerResult = ledgerRows()
	const rows = [
		...ledgerResult.rows,
		...registryRows(),
		...toolRows(),
		...nativeStyleRows(),
	]
	const sources = sourceFiles().map(hashFile)
	const state = gitState()
	const publicToolNames = [...PUBLIC_SPEC_FIRST_TOOLS].sort()
	const missingPublicToolDefinitions = publicToolNames.filter(name => !TOOL_NAMES.includes(name))
	const handlerNames = listBetterPptxToolNames()
	const missingDeclaredHandlers = TOOL_NAMES.filter(name => !handlerNames.includes(name))
	const familyRouteGaps = AUTHORING_CAPABILITY_REGISTRY
		.filter(row => !row.publicTools.some(tool => TOOL_NAMES.includes(tool)) && !row.publicTools.includes('betterpptx.deck.generate_from_spec'))
		.map(row => row.id)
	const baselineRows = rows.filter(row => row.classification === 'baseline-implemented')
	const maintainerRows = rows.filter(row => row.classification === 'maintainer-only')
	const routeRows = baselineRows.map(row => ({ row, route: row.publicRoute }))
	const routeToolNames = [...new Set(routeRows.flatMap(item => [
		...item.route.discovery,
		...item.route.compose,
		...item.route.validate,
	]))]
	const missingRouteTools = routeToolNames.filter(name => !TOOL_NAMES.includes(name) || !PUBLIC_SPEC_FIRST_TOOLS.has(name))
	const unresolvedRoutes = routeRows.filter(item => item.route.status === 'maintainer-only' || !item.route.compose.length).map(item => item.row.id)
	const sourceFingerprint = sha256(stableJson(sources))
	const catalogPayload = {
		ledgerSemanticHash: ledgerSemanticHash(ledgerResult.ledger),
		rows: rows.map(row => ({
			id: row.id,
			classification: row.classification,
			implementationStatus: row.implementationStatus,
			coverageMode: row.coverageMode,
			declaredExecutor: row.declaredExecutor,
			publicSpecFirst: row.publicSpecFirst,
		})),
		publicToolNames,
	}
	const catalogFingerprint = `betterpptx-mvp-${sha256(stableJson(catalogPayload)).slice(0, 24)}`
	return {
		schemaVersion: 'betterpptx.authoring.mvp-baseline-inventory.v1',
		status: state.clean ? 'PROVISIONAL_CANDIDATE_CLEAN_TREE' : 'PROVISIONAL_NOT_FROZEN',
		generatedAt,
		baseline: {
			definition: 'All product capabilities implemented at catalog closure belong to MVP; only post-baseline or unimplemented work remains continuous.',
			freezeState: 'not-frozen-until-owner-release-sha',
			inventoryTimestamp: generatedAt,
			catalogFingerprint,
			git: state,
		},
		catalogClosure: {
			status: 'SOURCE_CATALOG_ASSEMBLED_PENDING_OWNER_FREEZE',
			basis: 'capability-ledger + semantic-authoring-registry + declared MCP tool surface',
			sourceCount: sources.length,
			ledgerRows: ledgerResult.rows.length,
			semanticFamilies: AUTHORING_CAPABILITY_REGISTRY.length,
			declaredTools: TOOL_NAMES.length,
			engineHandlers: listBetterPptxToolNames().length,
			engineHandlersNotDeclared: listBetterPptxToolNames().filter(name => !TOOL_NAMES.includes(name)),
			publicJsonSpecFirstTools: publicToolNames.length,
			baselineRows: baselineRows.length,
			maintainerOnlyRows: maintainerRows.length,
		},
		sources: {
			files: sources,
			fingerprint: sourceFingerprint,
			ledgerVersion: ledgerResult.ledger.version,
			ledgerSemanticHash: ledgerSemanticHash(ledgerResult.ledger),
		},
		coverage: {
			rowsBySource: countBy(rows, 'source'),
			rowsByClassification: countBy(rows, 'classification'),
			rowsByKind: countBy(rows, 'kind'),
			registryFamilyStatuses: countBy(registryRows(), 'implementationStatus'),
			publicToolDefinitions: {
				declared: TOOL_NAMES.length,
				publicJsonSpecFirst: publicToolNames.length,
				missingDefinitions: missingPublicToolDefinitions,
				familyRouteGaps,
			},
			engineHandlerParity: {
				declaredTools: TOOL_NAMES.length,
				engineHandlers: handlerNames.length,
				missingDeclaredHandlers,
				engineOnlyHandlers: handlerNames.filter(name => !TOOL_NAMES.includes(name)),
				status: missingDeclaredHandlers.length === 0 ? 'DECLARED_HANDLERS_COMPLETE' : 'DECLARED_HANDLER_GAPS',
			},
			publicRouteContract: {
				baselineRows: baselineRows.length,
				mappedRows: routeRows.filter(item => item.route.compose.length > 0).length,
				uniqueReferencedTools: routeToolNames.length,
				missingOrNonPublicTools: missingRouteTools,
				unresolvedRows: unresolvedRoutes,
				status: missingRouteTools.length === 0 && unresolvedRoutes.length === 0 ? 'CONTRACT_MAPPED' : 'CONTRACT_GAPS',
			},
		},
		rows,
		verification: {
			allSourcesPresent: sources.every(item => item.exists),
			allPublicSpecFirstToolsDeclared: missingPublicToolDefinitions.length === 0,
			allDeclaredToolsHaveHandlers: missingDeclaredHandlers.length === 0,
			allFamiliesHaveCompositionRoute: familyRouteGaps.length === 0,
			allBaselineRowsHavePublicRouteContract: missingRouteTools.length === 0 && unresolvedRoutes.length === 0,
			allLedgerRowsClassified: ledgerResult.rows.every(row => Boolean(row.classification)),
			noProductRowsSilentlyDropped: true,
			provenanceFrozen: state.clean,
			mvpReady: false,
			blockers: [
				'Catalog closure still requires owner confirmation of the assembled source set.',
				'Every baseline row still requires exact reachability and applicable package, visual, accessibility, security, deployment, and owner gates.',
				state.clean ? 'A clean tree is present but an owner-approved immutable release SHA is still required.' : `Worktree has ${state.changedPathCount} changed/untracked paths; freeze is provisional.`,
				...(missingPublicToolDefinitions.length ? [`${missingPublicToolDefinitions.length} public spec-first tools are missing from the declared tool surface.`] : []),
				...(missingDeclaredHandlers.length ? [`${missingDeclaredHandlers.length} declared tools have no engine handler: ${missingDeclaredHandlers.join(', ')}.`] : []),
				...(familyRouteGaps.length ? [`Families without a declared composition route: ${familyRouteGaps.join(', ')}.`] : []),
				...(missingRouteTools.length ? [`Route contract references missing/non-public tools: ${missingRouteTools.join(', ')}.`] : []),
				...(unresolvedRoutes.length ? [`Baseline rows without a composition route: ${unresolvedRoutes.length}.`] : []),
			],
		},
	}
}

export function writeMvpBaselineInventory(options = {}) {
	const inventory = buildMvpBaselineInventory(options)
	const stamp = (inventory.generatedAt || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
	const outputDirectory = path.resolve(ROOT, options.outputDirectory || `outputs/authoring-principle-corpus/mvp-baseline-inventory/${stamp}`)
	fs.mkdirSync(outputDirectory, { recursive: true })
	const outputPath = path.join(outputDirectory, 'mvp-baseline-inventory.json')
	fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
	return { inventory, outputPath: rel(outputPath) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const result = writeMvpBaselineInventory()
	console.log(JSON.stringify({
		status: result.inventory.status,
		outputPath: result.outputPath,
		catalogFingerprint: result.inventory.baseline.catalogFingerprint,
		catalogClosure: result.inventory.catalogClosure,
		verification: result.inventory.verification,
	}, null, 2))
}
