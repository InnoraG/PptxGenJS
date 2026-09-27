import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const evidenceDir = path.join(here, 'evidence', 'authoring-augmentation')

const { createMcpToolDispatcher } = await import('./engine.mjs')
const { advertisedPublicTools, publicRuntimeManifest } = await import('./public-manifest.mjs')
const { publicControlRegistryMetadata } = await import('./authoring-control-registry.mjs')
const { publicMcpProtocolManifest } = await import('./mcp-v2/protocol.mjs')

function sha256(value) {
	return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
}

function git(...args) {
	try { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
	catch { return null }
}

const dispatcher = createMcpToolDispatcher({ sessionId: `authoring-baseline-${Date.now()}` })
const manifest = publicRuntimeManifest()
const tools = advertisedPublicTools()
const helpResult = await dispatcher.call('betterpptx.help.capabilities', { detail: 'summary', intent: 'premium product reveal with no paid assets' })
const help = helpResult.data || helpResult
const authResult = await dispatcher.call('betterpptx.auth.status', {})
const auth = authResult.data || authResult

const probes = {}
for (const surface of ['niceties', 'layered-motion', 'Text3D']) {
	const result = await dispatcher.call('betterpptx.help.tool_recipe', { surface, detail: 'full' })
	const data = result.data || result
	probes[`recipe:${surface}`] = { ok: result.ok === true, unknownSurfaces: data.unknownSurfaces || [], recipeCount: data.recipes?.length || 0 }
}

const lesson = (await dispatcher.call('betterpptx.authoring.catalog', { view: 'lesson', lessonId: 'dimensional-typography' })).data
const lessonCompile = await dispatcher.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', dryRun: true, commitMode: 'createNew', detail: 'summary', spec: lesson.minimalSpec })
probes['lesson:dimensional-typography'] = { ok: lessonCompile.ok === true, errorCode: lessonCompile.error?.code || null }

const packageJson = JSON.parse(await readFile(path.join(here, 'package.json'), 'utf8'))
const dirty = git('status', '--porcelain=v1') || ''
const report = {
	schemaVersion: 'betterpptx.public-authoring-baseline-evidence.v1',
	observedAt: new Date().toISOString(),
	scope: {
		boundary: 'local-public-black-box-dispatcher',
		deployedEndpointObserved: false,
		reason: 'No owner-authorized deployed endpoint was supplied to this audit process. Local public schemas and handlers were exercised; deployment parity remains a separate gate.',
		hostExposedInventory: 'unknown-unless-the-receiving-host-reports-tools-list',
	},
	identity: {
		packageVersion: packageJson.version,
		publicSemanticVersion: manifest.semanticVersion,
		toolSchemaVersion: manifest.toolSchemaVersion,
		gitCommit: git('rev-parse', 'HEAD'),
		gitTreeState: dirty ? 'dirty' : 'clean',
		workingTreeDigest: sha256(dirty),
	},
	protocol: publicMcpProtocolManifest(),
	digests: {
		capabilityContentDigest: manifest.capabilityContentDigest,
		capabilityControlDigest: manifest.capabilityControlDigest,
		advertisedToolSchemaDigest: manifest.advertisedToolSchemaDigest,
		recipeExampleDigest: publicControlRegistryMetadata().capabilityControlDigest,
	},
	inventory: {
		serverRegisteredToolCount: tools.length,
		serverRegisteredTools: tools.map(tool => tool.name),
		callerAuthorizedToolCount: auth?.authorization?.authorizedTools?.length ?? null,
		hostExposedToolCount: null,
		familyCount: manifest.capabilityDiscovery.inventory.registeredFamilyCount,
		lessonCount: manifest.authoringLessonCount,
	},
	payload: {
		helpStructuredBytes: Buffer.byteLength(JSON.stringify(help), 'utf8'),
		helpEstimatedTokens: help.responseBudget?.estimatedTokens ?? null,
		protocolEnvelopeBytes: null,
		receivingModelTokens: null,
		note: 'Structured bytes are measured locally. Connector duplication and receiving-model tokens require host instrumentation and are not inferred.',
	},
	probes,
}

await mkdir(evidenceDir, { recursive: true })
const output = path.join(evidenceDir, 'public-authoring-baseline.json')
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ output, observedAt: report.observedAt, identity: report.identity, payload: report.payload, probes }, null, 2))
