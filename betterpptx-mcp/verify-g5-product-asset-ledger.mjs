// G5 release-build guard for product-bundled binary assets.
// Development runs are report-only; a release invocation passes --strict and
// fails closed on missing files, hash/size drift, missing rows, or pending owner approval.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const manifestPath = path.join(here, 'docs/release-safety/G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')
const reportPath = path.join(here, 'outputs/g5-product-asset-ledger-report.json')
const strict = process.argv.includes('--strict')

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const issues = []
const seen = new Set()
const assets = Array.isArray(manifest.assets) ? manifest.assets : []
if (manifest.schemaVersion !== 'betterpptx.g5-product-asset-release-manifest.v1') {
	issues.push({ code: 'MANIFEST_SCHEMA', message: 'Unexpected G5 product-asset manifest schema.' })
}
if (!manifest.policy?.requiredForRelease || !Array.isArray(manifest.policy?.approvedStatuses)) {
	issues.push({ code: 'MANIFEST_POLICY', message: 'Manifest does not declare a release approval policy.' })
}

const checks = []
for (const asset of assets) {
	const id = String(asset?.id || '')
	if (!id || seen.has(id)) {
		issues.push({ code: 'DUPLICATE_OR_MISSING_ID', id })
		continue
	}
	seen.add(id)
	const relative = String(asset?.path || '')
	const absolute = path.resolve(repo, relative)
	if (!absolute.startsWith(repo + path.sep)) {
		issues.push({ code: 'PATH_OUTSIDE_REPO', id, path: relative })
		continue
	}
	let actualHash = null
	let actualBytes = null
	try {
		const bytes = await fs.readFile(absolute)
		actualBytes = bytes.length
		actualHash = crypto.createHash('sha256').update(bytes).digest('hex')
	} catch (error) {
		issues.push({ code: 'ASSET_MISSING', id, path: relative, message: error?.message || String(error) })
	}
	if (actualHash && actualHash !== String(asset.sha256 || '').toLowerCase()) {
		issues.push({ code: 'HASH_MISMATCH', id, expected: asset.sha256, actual: actualHash })
	}
	if (actualBytes != null && actualBytes !== Number(asset.bytes)) {
		issues.push({ code: 'BYTE_SIZE_MISMATCH', id, expected: asset.bytes, actual: actualBytes })
	}
	const approved = manifest.policy.approvedStatuses.includes(asset.approvalStatus)
	if (!approved) issues.push({ code: 'OWNER_APPROVAL_PENDING', id, approvalStatus: asset.approvalStatus })
	let approvalArtifactStatus = approved ? 'MISSING' : 'NOT_REQUIRED_WHILE_PENDING'
	if (approved) {
		const artifactRelative = String(asset.approvalArtifact || '')
		const artifactAbsolute = path.resolve(repo, artifactRelative)
		if (!artifactRelative) {
			issues.push({ code: 'APPROVAL_ARTIFACT_MISSING', id })
		} else if (!artifactAbsolute.startsWith(repo + path.sep)) {
			issues.push({ code: 'APPROVAL_ARTIFACT_OUTSIDE_REPO', id, approvalArtifact: artifactRelative })
		} else {
			try {
				const artifactText = await fs.readFile(artifactAbsolute, 'utf8')
				approvalArtifactStatus = 'PRESENT'
				if (path.extname(artifactAbsolute).toLowerCase() === '.json') {
					const decision = JSON.parse(artifactText)
					const decisionRow = Array.isArray(decision.assets) ? decision.assets.find(row => row.id === id) : null
					const decisionMatches = decision.status === 'APPROVED'
						&& decisionRow?.decision === 'APPROVED'
						&& String(decisionRow?.sha256 || '').toLowerCase() === String(asset.sha256 || '').toLowerCase()
						&& Number(decisionRow?.bytes) === Number(asset.bytes)
					if (!decisionMatches) {
						approvalArtifactStatus = 'DECISION_MISMATCH'
						issues.push({ code: 'APPROVAL_DECISION_MISMATCH', id, approvalArtifact: artifactRelative })
					} else approvalArtifactStatus = 'HASH_BOUND_DECISION_PASS'
				}
			} catch (error) {
				approvalArtifactStatus = 'UNREADABLE'
				issues.push({ code: 'APPROVAL_ARTIFACT_UNREADABLE', id, approvalArtifact: artifactRelative, message: error?.message || String(error) })
			}
		}
	}
	checks.push({ id, path: relative, hash: actualHash, bytes: actualBytes, approvalStatus: asset.approvalStatus, approvalArtifact: asset.approvalArtifact || null, approvalArtifactStatus, status: approved && approvalArtifactStatus !== 'MISSING' && approvalArtifactStatus !== 'UNREADABLE' && approvalArtifactStatus !== 'DECISION_MISMATCH' && actualHash === String(asset.sha256 || '').toLowerCase() && actualBytes === Number(asset.bytes) ? 'PASS' : 'OPEN' })
}

const report = {
	schemaVersion: 'betterpptx.g5-product-asset-ledger-report.v1',
	manifest: path.relative(process.cwd(), manifestPath).replaceAll('\\', '/'),
	strict,
	scanned: checks.length,
	issues,
	checks,
	releaseReady: issues.length === 0,
	status: issues.length === 0 ? 'PASS' : 'OPEN_OWNER_OR_ASSET_GATES',
}
await fs.mkdir(path.dirname(reportPath), { recursive: true })
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (strict && !report.releaseReady) process.exitCode = 1
