import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

function fail(message) {
	throw new Error(message)
}

function parseArgs(argv) {
	const args = {}
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index]
		const value = argv[index + 1]
		if (!key?.startsWith('--') || value == null) fail(`Expected --key value arguments; received ${key || '<empty>'}.`)
		args[key.slice(2)] = value
	}
	return args
}

function run(command) {
	const result = spawnSync(command, {
		cwd: repo,
		encoding: 'utf8',
		shell: true,
		maxBuffer: 64 * 1024 * 1024,
	})
	const output = `${result.stdout || ''}${result.stderr || ''}`
	if (result.status !== 0) fail(`Freeze gate failed (${command}):\n${output}`)
	return {
		command,
		status: 'PASS',
		outputSha256: sha256(Buffer.from(output, 'utf8')),
		outputBytes: Buffer.byteLength(output),
	}
}

function git(...args) {
	const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', shell: false })
	if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
	return String(result.stdout || '').trim()
}

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function relative(filePath) {
	return path.relative(repo, filePath).replaceAll('\\', '/')
}

function insideRepo(input, label) {
	const absolute = path.resolve(repo, input)
	if (absolute !== repo && !absolute.startsWith(`${repo}${path.sep}`)) fail(`${label} must remain inside the isolated repository.`)
	return absolute
}

async function readJson(filePath) {
	return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function artifact(filePath) {
	const bytes = await fs.readFile(filePath)
	return {
		path: relative(filePath),
		bytes: bytes.length,
		sha256: sha256(bytes),
	}
}

async function listFiles(root, predicate = () => true) {
	const files = []
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const absolute = path.join(root, entry.name)
		if (entry.isDirectory()) files.push(...await listFiles(absolute, predicate))
		else if (entry.isFile() && predicate(absolute)) files.push(absolute)
	}
	return files.sort((a, b) => relative(a).localeCompare(relative(b)))
}

function assert(condition, message) {
	if (!condition) fail(message)
}

const args = parseArgs(process.argv.slice(2))
for (const required of ['implementation-sha', 'atlas-dir', 'portfolio-dir', 'narration-dir', 'powerpoint-dir', 'output']) {
	if (!args[required]) fail(`Missing required --${required}.`)
}

const implementationSha = args['implementation-sha'].toLowerCase()
assert(/^[0-9a-f]{40}$/.test(implementationSha), 'Implementation SHA must be a full 40-character commit hash.')
assert(git('rev-parse', `${implementationSha}^{commit}`).toLowerCase() === implementationSha, 'Implementation commit could not be resolved exactly.')
assert(git('rev-parse', 'HEAD').toLowerCase() === implementationSha, 'Freeze must run with the reviewed implementation commit checked out as HEAD.')
assert(git('status', '--porcelain=v1', '--untracked-files=all') === '', 'Freeze requires a clean isolated implementation worktree.')

const approvedG5Ancestry = '448bbaa42b99a1c58f46802cbc76d6275bc8e5b0'
const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', approvedG5Ancestry, implementationSha], { cwd: repo, shell: false })
assert(ancestry.status === 0, 'The implementation commit does not descend from the isolated hash-bound G5 approval integration point.')

const atlasDir = insideRepo(args['atlas-dir'], 'Atlas directory')
const portfolioDir = insideRepo(args['portfolio-dir'], 'Portfolio directory')
const narrationDir = insideRepo(args['narration-dir'], 'Narration directory')
const powerpointDir = insideRepo(args['powerpoint-dir'], 'PowerPoint oracle directory')
const outputPath = insideRepo(args.output, 'Evidence output')

const gateRuns = []
for (const command of [
	'node betterpptx-mcp/verify-authoring-motion-catalog.mjs',
	'node betterpptx-mcp/verify-authoring-motion-bundle.mjs',
	'node betterpptx-mcp/verify-authoring-motion-spec-v1.mjs',
	'node betterpptx-mcp/verify-public-authoring-motion-v1.mjs',
	'node betterpptx-mcp/verify-public-semantic-authoring-v1.mjs',
	'node --test betterpptx-mcp/test/authoring-capability-registry.test.mjs',
	'node betterpptx-mcp/verify-authoring-motion-narration-sync.mjs',
	'node betterpptx-mcp/verify-mvp-baseline-public-contract.mjs',
	'node betterpptx-mcp/verify-g5-product-asset-ledger.mjs --strict',
	'npx tsc --noEmit',
	'git diff --check',
]) gateRuns.push(run(command))

const catalogPath = path.join(here, 'deploy/model3d-worker/canonical/authoring-motion-catalog.json')
const catalogSchemaPath = path.join(here, 'deploy/model3d-worker/canonical/authoring-motion-catalog.schema.json')
const catalog = await readJson(catalogPath)
assert(catalog.schemaVersion === 'betterpptx.authoring-motion-catalog.v1', 'Unexpected canonical catalog schema.')
assert(catalog.catalogVersion === '2026-08-15.1', 'Unexpected canonical catalog version.')
assert(catalog.inventory?.total === 96 && catalog.inventory?.selectable === 48 && catalog.inventory?.notSelectable === 48, 'Canonical catalog accounting drifted from 96/48/48.')
assert(catalog.bundleCeiling === 18, 'Presenter deployment bundle ceiling must remain 18.')

const atlasReportPath = path.join(atlasDir, 'report.json')
const portfolioReportPath = path.join(portfolioDir, 'portfolio-report.json')
const narrationReportPath = path.join(narrationDir, 'report.json')
const powerpointReportPath = path.join(powerpointDir, 'powerpoint-oracle-report.json')
const equivalencePath = path.join(powerpointDir, 'playback-package-equivalence.json')
const inheritedAnalysisPath = path.join(powerpointDir, 'inherited-motion-frame-analysis.json')
const videoPath = path.join(powerpointDir, 'authoring-v3-native-motion-playback-sample.mp4')

const atlasReport = await readJson(atlasReportPath)
const portfolioReport = await readJson(portfolioReportPath)
const narrationReport = await readJson(narrationReportPath)
const powerpointReport = await readJson(powerpointReportPath)
const equivalence = await readJson(equivalencePath)
const inheritedAnalysis = await readJson(inheritedAnalysisPath)

assert(atlasReport.status === 'PASS' && atlasReport.executableMotionCount === 48 && atlasReport.bundleCeiling === 18, 'Atlas report is not the 48-motion / 18-per-shard passing proof.')
assert(portfolioReport.status === 'PASS_PENDING_POWERPOINT_ORACLE' && portfolioReport.scenarios?.length === 7, 'Cold-AI portfolio report is not the expected seven-scenario package proof.')
assert(portfolioReport.choiceAuthority === 'AI client' && portfolioReport.engineRole === 'exact executor only', 'Cold-AI portfolio authority boundary drifted.')
assert(narrationReport.status === 'PASS' && narrationReport.checks?.every(check => check.status === 'PASS'), 'Narration-master-clock proof is not fully green.')
assert(powerpointReport.status === 'PASS' && powerpointReport.checks?.every(check => check.status === 'PASS'), 'Final PowerPoint oracle report is not fully green.')
assert(powerpointReport.presentations?.length === 8 && powerpointReport.presentations.every(item => item.repairMode !== true && item.sourceUnchanged === true), 'PowerPoint did not prove all eight immutable source decks repair-free.')
assert(equivalence.status === 'PASS' && equivalence.specimenSlidesCompared === 48 && equivalence.normalizedSpecimenMismatches?.length === 0 && equivalence.exactPartMismatches?.length === 0, 'Corrected atlas is not package-bound to the full 48-motion playback proof.')
assert(inheritedAnalysis.status === 'PASS' && inheritedAnalysis.pairCount === 48 && inheritedAnalysis.visiblyChangedCount === 48, 'Full native playback analysis is not 48/48.')
assert(powerpointReport.video?.statusCode === 3 && powerpointReport.video?.bytes > 100000, 'PowerPoint native video evidence did not complete.')

const atlasPptx = await listFiles(atlasDir, file => path.extname(file).toLowerCase() === '.pptx')
const portfolioPptx = await listFiles(portfolioDir, file => path.extname(file).toLowerCase() === '.pptx')
const narrationPptx = await listFiles(narrationDir, file => path.extname(file).toLowerCase() === '.pptx')
assert(atlasPptx.length === 1, 'Freeze requires exactly one atlas PPTX.')
assert(portfolioPptx.length === 7, 'Freeze requires exactly seven cold-AI portfolio PPTX files.')
assert(narrationPptx.length === 1, 'Freeze requires exactly one narration synchronization PPTX.')

const g5ManifestPath = path.join(here, 'docs/release-safety/G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')
const g5DecisionPath = path.join(here, 'docs/release-safety/G5-BUNDLE-OWNER-DECISION-20260814.json')
const g5Manifest = await readJson(g5ManifestPath)
const g5Decision = await readJson(g5DecisionPath)
assert(g5Decision.status === 'APPROVED' && g5Decision.assets?.length === 3, 'Hash-bound G5 owner decision is not present.')
assert(g5Manifest.assets?.length === 4 && g5Manifest.assets.every(row => row.approvalStatus === 'APPROVED'), 'G5 product manifest is not fully approved.')

const publicContractFiles = [
	path.join(here, 'tools.mjs'),
	path.join(here, 'blackbox.mjs'),
	path.join(here, 'public-baseline-catalog.mjs'),
	path.join(here, 'authoring-capability-registry.mjs'),
	path.join(here, 'ir/deck-spec.v1.json'),
]

const manifest = {
	schemaVersion: 'betterpptx.authoring-v3-motion-mvp-evidence.v1',
	status: 'TECHNICAL_MVP_FROZEN_NOT_PUBLICLY_ENABLED',
	frozenAt: new Date().toISOString(),
	implementation: {
		commitSha: implementationSha,
		treeSha: git('rev-parse', `${implementationSha}^{tree}`),
		branch: git('branch', '--show-current'),
		g5ApprovalAncestryCommit: approvedG5Ancestry,
		cleanAtFreeze: true,
	},
	productDoctrine: {
		selectionAuthority: 'AI client',
		engineRole: 'exact executor only',
		catalogIsNotCappedAt18: true,
		maximumMotionsPerPresenterBundle: 18,
		narrationIsMasterClock: true,
		noRanking: true,
		noSilentSubstitution: true,
	},
	catalog: {
		schemaVersion: catalog.schemaVersion,
		catalogVersion: catalog.catalogVersion,
		internalEvidenceFingerprint: catalog.catalogFingerprint,
		fingerprintIsPublic: false,
		inventory: catalog.inventory,
		canonicalLedger: await artifact(catalogPath),
		canonicalSchema: await artifact(catalogSchemaPath),
	},
	proof: {
		atlas: {
			artifact: await artifact(atlasPptx[0]),
			report: await artifact(atlasReportPath),
			slides: 49,
			selectableMotions: 48,
			shards: atlasReport.shards.map(shard => shard.count),
		},
		coldAiPortfolio: {
			report: await artifact(portfolioReportPath),
			scenarios: portfolioReport.scenarios.map(scenario => ({ scenarioId: scenario.scenarioId, finalSelectedMotionIds: scenario.finalSelectedMotionIds, bundleBudget: scenario.bundleBudget })),
			artifacts: await Promise.all(portfolioPptx.map(artifact)),
		},
		narrationMasterClock: {
			report: await artifact(narrationReportPath),
			artifact: await artifact(narrationPptx[0]),
		},
		powerPoint: {
			version: powerpointReport.powerPoint,
			report: await artifact(powerpointReportPath),
			packageEquivalence: await artifact(equivalencePath),
			fullPlaybackAnalysis: await artifact(inheritedAnalysisPath),
			visiblyChanged: inheritedAnalysis.visiblyChangedCount,
			video: await artifact(videoPath),
			videoSampleSlides: powerpointReport.video.sampleSlides,
			repairFreePresentations: powerpointReport.presentations.length,
		},
	},
	publicContractSources: await Promise.all(publicContractFiles.map(artifact)),
	governance: {
		g5ProductManifest: await artifact(g5ManifestPath),
		g5OwnerDecision: await artifact(g5DecisionPath),
		approvedProductAssetCount: g5Manifest.assets.length,
		distributionBoundary: 'Server-side use in generated presentation projects only; no standalone/raw asset download or reusable-source resale.',
	},
	gates: gateRuns,
	continuousCatalogTrain: {
		unbakedKineticRows: 29,
		dedicatedInteractionRowsToSource: 18,
		implementedPlaybackHeldRows: ['motion.ordinary.enumerate'],
		futureRowsAreMonotonic: true,
	},
	explicitlyNotApprovedByThisFreeze: [
		'G1 delivery candidates',
		'G4 live deployment, rotation, rollback, or break-glass evidence',
		'public enablement or production launch',
		'raw or reusable-source resale',
		'the 18 dedicated authoring-v3 interaction rows',
	],
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ status: manifest.status, output: relative(outputPath), implementationSha, catalog: manifest.catalog.inventory, gates: gateRuns.length }, null, 2))
