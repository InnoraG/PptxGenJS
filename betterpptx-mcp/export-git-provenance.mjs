import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { CostHarnessError } from './run-cloud-cost-metrology-suite.mjs'

function git(args, { cwd = process.cwd(), optional = false } = {}) {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
	if (result.status !== 0 && !optional) {
		throw new Error(`git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr || result.error?.message}`)
	}
	return { ok: result.status === 0, stdout: String(result.stdout || '').trim(), stderr: String(result.stderr || '').trim() }
}

function statusEntries(statusText) {
	return String(statusText || '')
		.split(/\r?\n/)
		.map(line => line.trimEnd())
		.filter(Boolean)
}

export function summarizeGitProvenance({
	cwd = process.cwd(),
	remote = 'betterpptx-mcp',
	ref = '',
	matrixGrade = true,
	expectedRemoteUrl = '',
} = {}) {
	const root = git(['rev-parse', '--show-toplevel'], { cwd }).stdout
	const commit = git(['rev-parse', 'HEAD'], { cwd: root }).stdout
	const branchResult = git(['symbolic-ref', '--short', 'HEAD'], { cwd: root, optional: true })
	const branch = branchResult.ok ? branchResult.stdout : ''
	const selectedRef = ref || branch || commit
	const remoteUrlResult = git(['remote', 'get-url', remote], { cwd: root, optional: true })
	const remoteUrl = remoteUrlResult.ok ? remoteUrlResult.stdout : ''
	const upstreamResult = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: root, optional: true })
	const status = statusEntries(git(['status', '--short'], { cwd: root }).stdout)
	const changed = status.map(line => ({ status: line.slice(0, 2), path: line.slice(3) }))
	const gitTreeClean = changed.length === 0
	const result = {
		schemaVersion: 'betterpptx.git-provenance.v1',
		generatedAt: new Date().toISOString(),
		repoRoot: root,
		gitRemoteName: remote,
		gitRemote: remoteUrl,
		gitRef: selectedRef,
		gitBranch: branch,
		gitUpstream: upstreamResult.ok ? upstreamResult.stdout : null,
		gitCommit: commit,
		gitTreeClean,
		changedFileCount: changed.length,
		changedFiles: changed,
		matrixGrade,
	}
	if (expectedRemoteUrl && remoteUrl !== expectedRemoteUrl) {
		result.expectedRemoteUrl = expectedRemoteUrl
		result.remoteMatchesExpected = false
	} else if (expectedRemoteUrl) {
		result.expectedRemoteUrl = expectedRemoteUrl
		result.remoteMatchesExpected = true
	}
	if (matrixGrade) {
		if (!/^[0-9a-f]{40}$/i.test(commit)) {
			throw new CostHarnessError('GIT_COMMIT_INVALID', 'Matrix-grade metrology requires a 40-character git commit SHA.', { commit })
		}
		if (!remoteUrl) {
			throw new CostHarnessError('GIT_REMOTE_MISSING', `Matrix-grade metrology requires git remote ${remote}.`, { remote })
		}
		if (expectedRemoteUrl && remoteUrl !== expectedRemoteUrl) {
			throw new CostHarnessError('GIT_REMOTE_MISMATCH', 'Matrix-grade metrology git remote does not match expected deploy source.', { remote, remoteUrl, expectedRemoteUrl })
		}
		if (!gitTreeClean) {
			throw new CostHarnessError('GIT_TREE_NOT_CLEAN', 'Matrix-grade metrology requires a clean git tree before build/deploy.', { changedFileCount: changed.length, changedFiles: changed.slice(0, 50) })
		}
	}
	return result
}

export function exportGitProvenance({ cwd = process.cwd(), remote = 'betterpptx-mcp', ref = '', outFile, matrixGrade = true, expectedRemoteUrl = '' } = {}) {
	if (!outFile) throw new Error('outFile is required')
	const summary = summarizeGitProvenance({ cwd, remote, ref, matrixGrade, expectedRemoteUrl })
	fs.mkdirSync(path.dirname(outFile), { recursive: true })
	fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
	return summary
}

function parseArgs(argv) {
	const out = { cwd: process.cwd(), remote: 'betterpptx-mcp', ref: '', out: '', matrixGrade: true, expectedRemoteUrl: '' }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--cwd') out.cwd = path.resolve(argv[++index])
		else if (arg === '--remote') out.remote = String(argv[++index] || '')
		else if (arg === '--ref') out.ref = String(argv[++index] || '')
		else if (arg === '--out') out.out = path.resolve(argv[++index])
		else if (arg === '--expected-remote-url') out.expectedRemoteUrl = String(argv[++index] || '')
		else if (arg === '--exploratory') out.matrixGrade = false
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.out) {
		console.log('Usage: node betterpptx-mcp/export-git-provenance.mjs --out verification/preflight-git-provenance.json [--remote betterpptx-mcp] [--ref branch] [--expected-remote-url URL] [--exploratory]')
		process.exit(args.help ? 0 : 2)
	}
	try {
		const result = exportGitProvenance({ ...args, outFile: args.out })
		console.log(`GIT PROVENANCE: commit=${result.gitCommit} clean=${result.gitTreeClean} changed=${result.changedFileCount} out=${args.out}`)
	} catch (error) {
		console.error(`GIT PROVENANCE FAILED: ${error.code || ''} ${error.message}`)
		process.exit(1)
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
