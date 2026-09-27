import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const SOURCE_MANIFEST_PATH = 'betterpptx-mcp/cloud-cost-metrology-source-manifest.json'

export const REQUIRED_SOURCE_PATHS = Object.freeze([
	'deploy/gcp/deploy-mcp-metrology.ps1',
	'deploy/gcp/build-mcp-metrology-from-git.ps1',
	'deploy/gcp/reviewed-cloud-prices-us-central1.json',
	'betterpptx-mcp/cloud-cost-metrology-source-manifest.json',
	'betterpptx-mcp/verify-cloud-cost-source-manifest.mjs',
	'betterpptx-mcp/run-cloud-cost-metrology-suite.mjs',
	'betterpptx-mcp/logger.mjs',
	'betterpptx-mcp/run-cost-metrology-harness.mjs',
	'betterpptx-mcp/reconcile-cost-metrology.mjs',
	'betterpptx-mcp/export-cloud-run-metrology-logs.mjs',
	'betterpptx-mcp/export-cloud-monitoring-summary.mjs',
	'betterpptx-mcp/export-bigquery-billing-summary.mjs',
	'betterpptx-mcp/export-cloud-run-deploy-metadata.mjs',
	'betterpptx-mcp/export-git-provenance.mjs',
	'betterpptx-mcp/fetch-cloud-cost-catalog.mjs',
	'betterpptx-mcp/preview-runtime-rate-card.mjs',
	'betterpptx-mcp/verify-zero-payment-cloud-cost-harness.mjs',
	'betterpptx-mcp/verify-cloud-cost-pipeline.mjs',
	'betterpptx-mcp/billing/cost-model.mjs',
	'betterpptx-mcp/billing/charging-matrix.mjs',
	'tools/build-charging-matrix.mjs',
	'plans/zero-payment-cloud-run-cost-metrology-executor-plan-2026-06-18.md',
])

function slash(value) {
	return String(value || '').replace(/\\/g, '/')
}

function repoRoot() {
	const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
	if (result.status !== 0) return process.cwd()
	return result.stdout.trim() || process.cwd()
}

function gitStatusFor(paths, { cwd }) {
	const result = spawnSync('git', ['status', '--short', '--', ...paths], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
	if (result.status !== 0) {
		throw new Error(`git status failed: ${result.stderr || result.error?.message}`)
	}
	const map = new Map()
	for (const line of String(result.stdout || '').split(/\r?\n/).filter(Boolean)) {
		const status = line.slice(0, 2)
		const file = slash(line.slice(3).trim())
		map.set(file, status)
	}
	return map
}

export function verifySourceManifest({ manifestFile = SOURCE_MANIFEST_PATH, matrixGrade = false } = {}) {
	const root = repoRoot()
	const resolved = path.resolve(root, manifestFile)
	const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'))
	assert.equal(manifest.schemaVersion, 'betterpptx.cloud-cost-source-manifest.v1')
	assert.equal(manifest.generatedFor, 'zero-payment-cloud-run-cost-metrology')
	assert(Array.isArray(manifest.requiredFiles), 'requiredFiles must be an array')
	const manifestPaths = manifest.requiredFiles.map(entry => slash(entry.path))
	const duplicatePaths = manifestPaths.filter((file, index) => manifestPaths.indexOf(file) !== index)
	assert.deepEqual(duplicatePaths, [], 'source manifest must not contain duplicate paths')
	assert.deepEqual([...manifestPaths].sort(), [...REQUIRED_SOURCE_PATHS].sort(), 'source manifest paths must match verifier-required paths')
	for (const entry of manifest.requiredFiles) {
		assert(entry.role && typeof entry.role === 'string', `${entry.path} must describe its role`)
		const absolute = path.resolve(root, entry.path)
		assert(fs.existsSync(absolute), `${entry.path} must exist`)
	}
	const status = gitStatusFor(manifestPaths, { cwd: root })
	const fileStatuses = manifestPaths.map(file => ({
		path: file,
		gitStatus: status.get(file) || 'clean',
	}))
	const dirty = fileStatuses.filter(entry => entry.gitStatus !== 'clean')
	if (matrixGrade) {
		if (dirty.length) {
			const error = new Error(`matrix-grade source manifest must be clean after commit; dirty files=${dirty.length}`)
			error.code = 'SOURCE_MANIFEST_DIRTY'
			error.details = { dirtyFileCount: dirty.length, dirtyFiles: dirty.slice(0, 50) }
			throw error
		}
	}
	return {
		ok: true,
		manifestFile: slash(path.relative(root, resolved)),
		requiredFileCount: manifestPaths.length,
		dirtyFileCount: dirty.length,
		fileStatuses,
		matrixGrade,
	}
}

function parseArgs(argv) {
	const out = { manifestFile: SOURCE_MANIFEST_PATH, matrixGrade: false }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--manifest') out.manifestFile = argv[++index]
		else if (arg === '--matrix-grade') out.matrixGrade = true
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help) {
		console.log('Usage: node betterpptx-mcp/verify-cloud-cost-source-manifest.mjs [--manifest path] [--matrix-grade]')
		process.exit(0)
	}
	try {
		const result = verifySourceManifest(args)
		console.log(`CLOUD COST SOURCE MANIFEST: PASS files=${result.requiredFileCount} dirty=${result.dirtyFileCount} matrixGrade=${result.matrixGrade}`)
	} catch (error) {
		console.error(`CLOUD COST SOURCE MANIFEST FAILED: ${error.code || ''} ${error.message}`)
		process.exit(1)
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
