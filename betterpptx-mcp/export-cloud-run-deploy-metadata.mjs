import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
	assertCloudRunReady,
	assertMatrixGradeSourceProvenance,
	assertSharedStoreEnv,
	cloudBuildSourceKind,
} from './run-cloud-cost-metrology-suite.mjs'

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function gcloudJson(args, { maxBuffer = 128 * 1024 * 1024 } = {}) {
	const result = spawnSync('gcloud', [...args, '--format=json'], { encoding: 'utf8', maxBuffer })
	if (result.status !== 0) {
		throw new Error(`gcloud ${args.join(' ')} failed (exit ${result.status}): ${result.stderr || result.error?.message}`)
	}
	return JSON.parse(result.stdout || '{}')
}

function envMap(container = {}) {
	const out = {}
	for (const entry of container.env || []) {
		if (!entry?.name) continue
		if (Object.hasOwn(entry, 'value')) out[entry.name] = entry.value
		else if (entry.valueFrom) out[entry.name] = '<valueFrom>'
	}
	return out
}

function firstContainer(service = {}) {
	return service?.spec?.template?.spec?.containers?.[0] || {}
}

function serviceReadyCondition(service = {}) {
	return (service?.status?.conditions || []).find(condition => condition?.type === 'Ready') || null
}

function serviceImageDigest({ service = {}, build = {}, explicitImageDigest = '' } = {}) {
	const explicit = String(explicitImageDigest || '').trim()
	if (explicit) return explicit
	const image = String(firstContainer(service).image || '').trim()
	if (/^.+@sha256:[0-9a-f]{64}$/i.test(image)) return image.replace(/^.+@/, '')
	const digest = String(build?.results?.images?.[0]?.digest || '').trim()
	return digest
}

function sourceImageTag({ service = {}, build = {}, explicitImageTag = '' } = {}) {
	const explicit = String(explicitImageTag || '').trim()
	if (explicit) return explicit
	const image = String(firstContainer(service).image || '').trim()
	if (image) return image
	return String(build?.images?.[0] || build?.results?.images?.[0]?.name || '').trim()
}

function buildGitCommit({ build = {}, provenance = {} } = {}) {
	return String(
		provenance.gitCommit
		|| provenance.commitSha
		|| build?.source?.repoSource?.commitSha
		|| build?.sourceProvenance?.resolvedRepoSource?.commitSha
		|| build?.substitutions?.COMMIT_SHA
		|| build?.substitutions?.REVISION_ID
		|| build?.source?.gitSource?.revision
		|| build?.sourceProvenance?.resolvedGitSource?.revision
		|| build?.source?.connectedRepository?.revision
		|| build?.sourceProvenance?.resolvedConnectedRepository?.revision
		|| ''
	).trim()
}

function safeFileStem(value, fallback = 'service') {
	const raw = String(value || fallback).trim().toLowerCase()
	const safe = raw.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
	return safe || fallback
}

export function buildDeployMetadata({
	project = '',
	region = '',
	serviceName = '',
	runId = '',
	topology = '',
	build = null,
	service = null,
	provenance = {},
	matrixGrade = true,
} = {}) {
	if (!service) throw new Error('buildDeployMetadata requires Cloud Run service metadata.')
	const container = firstContainer(service)
	const env = envMap(container)
	const imageDigest = serviceImageDigest({ service, build, explicitImageDigest: provenance.imageDigest })
	const imageTag = sourceImageTag({ service, build, explicitImageTag: provenance.imageTag })
	const buildKind = build ? cloudBuildSourceKind(build) : String(provenance.cloudBuildSourceKind || 'unknown')
	const latestReadyRevisionName = service?.status?.latestReadyRevisionName || ''
	const latestCreatedRevisionName = service?.status?.latestCreatedRevisionName || ''
	const readyCondition = serviceReadyCondition(service)
	const sourceProvenance = {
		schemaVersion: 'betterpptx.cloud-run-source-provenance.v1',
		generatedAt: new Date().toISOString(),
		project,
		region,
		service: serviceName || service?.metadata?.name || '',
		runId,
		gitRemote: provenance.gitRemote || '',
		gitRef: provenance.gitRef || '',
		gitCommit: buildGitCommit({ build, provenance }),
		gitTreeClean: provenance.gitTreeClean === true,
		cloudBuildId: provenance.cloudBuildId || build?.id || '',
		cloudBuildSourceKind: buildKind,
		imageTag,
		imageDigest,
		deployedRevision: latestReadyRevisionName || latestCreatedRevisionName,
	}
	const deployMetadata = {
		schemaVersion: 'betterpptx.cloud-run-deploy-metadata.v1',
		generatedAt: new Date().toISOString(),
		project,
		region,
		service: serviceName || service?.metadata?.name || '',
		runId,
		topology: topology || service?.metadata?.labels?.betterpptx_topology || service?.spec?.template?.metadata?.labels?.betterpptx_topology || '',
		url: service?.status?.url || '',
		latestReadyRevisionName,
		latestCreatedRevisionName,
		ready: readyCondition ? readyCondition.status === 'True' : false,
		readyCondition,
		image: container.image || '',
		imageDigest,
		containerConcurrency: service?.spec?.template?.spec?.containerConcurrency ?? null,
		labels: service?.metadata?.labels || {},
		templateLabels: service?.spec?.template?.metadata?.labels || {},
		annotations: {
			maxScale: service?.spec?.template?.metadata?.annotations?.['autoscaling.knative.dev/maxScale'] || service?.metadata?.annotations?.['run.googleapis.com/maxScale'] || '',
			minScale: service?.spec?.template?.metadata?.annotations?.['autoscaling.knative.dev/minScale'] || '',
			startupCpuBoost: service?.spec?.template?.metadata?.annotations?.['run.googleapis.com/startup-cpu-boost'] || '',
			cpuThrottling: service?.spec?.template?.metadata?.annotations?.['run.googleapis.com/cpu-throttling'] || '',
		},
		env: Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('BETTERPPTX_'))),
		sourceProvenance,
	}
	if (matrixGrade) {
		assertCloudRunReady(service)
		assertSharedStoreEnv({ env, requireArtifactBucket: true })
		assertMatrixGradeSourceProvenance({ build: build || {}, provenance: sourceProvenance })
	}
	return { sourceProvenance, deployMetadata, cloudBuildMetadata: build || null }
}

export function exportDeployMetadata({
	project,
	region = 'us-central1',
	service,
	buildId = '',
	runId = '',
	topology = '',
	outDir = '',
	sourceProvenanceOut = '',
	deployMetadataOut = '',
	cloudBuildMetadataOut = '',
	buildInputFile = '',
	serviceInputFile = '',
	matrixGrade = true,
	provenance = {},
} = {}) {
	const build = buildInputFile
		? readJson(buildInputFile)
		: (buildId ? gcloudJson(['builds', 'describe', buildId, `--project=${project}`]) : null)
	const serviceJson = serviceInputFile
		? readJson(serviceInputFile)
		: gcloudJson(['run', 'services', 'describe', service, `--project=${project}`, `--region=${region}`])
	const result = buildDeployMetadata({
		project,
		region,
		serviceName: service,
		runId,
		topology,
		build,
		service: serviceJson,
		provenance: { ...provenance, cloudBuildId: buildId || provenance.cloudBuildId },
		matrixGrade,
	})
	const base = outDir ? path.resolve(outDir) : process.cwd()
	const topologyStem = safeFileStem(result.deployMetadata.topology || topology, 'service')
	const sourceFile = sourceProvenanceOut || path.join(base, 'source-provenance.json')
	const deployFile = deployMetadataOut || path.join(base, `${topologyStem}-deploy-metadata.json`)
	const buildFile = cloudBuildMetadataOut || path.join(base, 'cloud-build-metadata.json')
	writeJson(sourceFile, result.sourceProvenance)
	writeJson(deployFile, result.deployMetadata)
	if (result.cloudBuildMetadata) writeJson(buildFile, result.cloudBuildMetadata)
	return { ...result, files: { sourceProvenance: sourceFile, deployMetadata: deployFile, cloudBuildMetadata: result.cloudBuildMetadata ? buildFile : null } }
}

function parseArgs(argv) {
	const out = {
		project: '',
		region: 'us-central1',
		service: '',
		buildId: '',
		runId: '',
		topology: '',
		outDir: '',
		buildInputFile: '',
		serviceInputFile: '',
		matrixGrade: true,
		provenance: {},
	}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--project') out.project = String(argv[++index] || '')
		else if (arg === '--region') out.region = String(argv[++index] || '')
		else if (arg === '--service') out.service = String(argv[++index] || '')
		else if (arg === '--build-id') out.buildId = String(argv[++index] || '')
		else if (arg === '--run-id') out.runId = String(argv[++index] || '')
		else if (arg === '--topology') out.topology = String(argv[++index] || '')
		else if (arg === '--out-dir') out.outDir = path.resolve(argv[++index])
		else if (arg === '--build-input-file') out.buildInputFile = path.resolve(argv[++index])
		else if (arg === '--service-input-file') out.serviceInputFile = path.resolve(argv[++index])
		else if (arg === '--exploratory') out.matrixGrade = false
		else if (arg === '--git-remote') out.provenance.gitRemote = String(argv[++index] || '')
		else if (arg === '--git-ref') out.provenance.gitRef = String(argv[++index] || '')
		else if (arg === '--git-commit') out.provenance.gitCommit = String(argv[++index] || '')
		else if (arg === '--git-tree-clean') out.provenance.gitTreeClean = true
		else if (arg === '--image-digest') out.provenance.imageDigest = String(argv[++index] || '')
		else if (arg === '--image-tag') out.provenance.imageTag = String(argv[++index] || '')
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.project || !args.service || !args.outDir) {
		console.log('Usage: node betterpptx-mcp/export-cloud-run-deploy-metadata.mjs --project P --region R --service S --out-dir DIR [--build-id ID] [--run-id ID] [--topology ROLE] [--git-remote URL --git-ref REF --git-commit SHA --git-tree-clean] [--build-input-file build.json --service-input-file service.json] [--exploratory]')
		process.exit(args.help ? 0 : 2)
	}
	try {
		const result = exportDeployMetadata(args)
		console.log(`DEPLOY METADATA: ready=${result.deployMetadata.ready} source=${result.sourceProvenance.cloudBuildSourceKind} imageDigest=${result.sourceProvenance.imageDigest || 'missing'} out=${args.outDir}`)
	} catch (error) {
		console.error(`DEPLOY METADATA FAILED: ${error.code || ''} ${error.message}`)
		process.exit(1)
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
