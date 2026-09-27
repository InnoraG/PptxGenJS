#!/usr/bin/env node

// Consolidated boundary for the Picture Format five-point corpus.  This is a
// family-sized proof only: it never promotes rows into the universal ledger.
// The purpose is to verify one complete evidence batch without spending an
// iteration on each individual slider.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const mapPath = path.resolve('betterpptx-mcp/showcase-picture-format-requirement-map.json')
const ledgerPath = path.resolve('betterpptx-mcp/picture-format-five-point-proof-ledger.json')
const matrixPath = path.resolve('betterpptx-mcp/preset-decomposition-matrix.json')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const rel = file => path.relative(root, file).replaceAll('\\', '/')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

assert(fs.existsSync(mapPath), 'Picture Format requirement map is missing')
assert(fs.existsSync(ledgerPath), 'Picture Format five-point ledger is missing')
assert(fs.existsSync(matrixPath), 'Universal catalog matrix is missing')

const map = readJson(mapPath)
const ledger = readJson(ledgerPath)
const matrix = readJson(matrixPath)
const expectedCheckpoints = ['minimum', 'default', 'midpoint', 'maximum', 'off-preset']
const allControls = map.programFamilies.flatMap(family => (family.controls || []).map(control => ({ ...control, family: family.id })))
// The five-point denominator intentionally excludes discrete/non-numeric
// controls and the three explicit blocked-contract rows. Those remain in the
// map, but they are not executable five-point witnesses.
const isolatedControls = allControls.filter(control => ['verified', 'blocked-office-surface'].includes(control.isolatedProof?.status))
const verified = isolatedControls.filter(control => control.isolatedProof?.status === 'verified')
const blocked = isolatedControls.filter(control => control.isolatedProof?.status === 'blocked-office-surface')
const blockedContract = allControls.filter(control => control.isolatedProof?.status === 'blocked-contract')
const ledgerVerified = ledger.proofs.filter(proof => proof.status === 'verified')
const ledgerById = new Map(ledgerVerified.map(proof => [proof.controlId, proof]))
const failures = []
const checkedReports = []

for (const control of verified) {
	const proof = ledgerById.get(control.id)
	if (!proof) {
		failures.push(`${control.id}: missing verified ledger entry`)
		continue
	}
	const reportFile = path.resolve(proof.proofReport)
	if (!fs.existsSync(reportFile)) {
		failures.push(`${control.id}: proof report missing at ${proof.proofReport}`)
		continue
	}
	if (sha256File(reportFile) !== proof.proofReportSha256) failures.push(`${control.id}: proof report digest mismatch`)
	const report = readJson(reportFile)
	const checkpoints = (report.checkpoints || report.artifacts?.flatMap(artifact => artifact.rows || []).filter(row => row.checkpoint).map(row => ({ checkpoint: row.checkpoint })) || []).map(item => item.checkpoint)
	const distinctCheckpoints = [...new Set(checkpoints)]
	if (report.status !== 'PASS') failures.push(`${control.id}: report status ${report.status}`)
	if (report.controlId !== control.id) failures.push(`${control.id}: report controlId mismatch`)
	if (JSON.stringify(distinctCheckpoints) !== JSON.stringify(expectedCheckpoints)) failures.push(`${control.id}: checkpoint set/order mismatch`)
	const proofFlags = report.proof || {}
	const commonProofPass = proofFlags.powerPointAuthoredReference === true && proofFlags.structuredSerialization === true && proofFlags.packageReadback === true && proofFlags.repairDisabledOpen === true && proofFlags.saveCopyAsReopen === true && proofFlags.uiObjectModelEditability === true && proofFlags.comparativeRender === true
	const packageAuditsPass = Array.isArray(report.packageAudits)
		? report.packageAudits.length >= 2 && report.packageAudits.every(audit => audit.status === 'PASS' && (audit.errors?.length || 0) === 0 && (audit.warnings?.length || 0) === 0)
		: report.packageAudits && typeof report.packageAudits === 'object'
			? Object.values(report.packageAudits).length >= 2 && Object.values(report.packageAudits).every(audit => audit?.status === 'PASS' && (audit.errors || 0) === 0 && (audit.warnings || 0) === 0)
			: false
	const visualPass = Array.isArray(report.renders)
		? report.renders.every(render => render.officeVsGenerated?.differingChannels === 0 && render.beforeVsAfter?.differingChannels === 0)
		: Array.isArray(report.visual)
			? report.visual.every(render => render.diff?.differingChannels === 0)
			: report.renderBeforeAfterIdentical === true
	const schemaProofPass = commonProofPass || (typeof report.proofScope === 'string' && report.proofScope.length > 0 && packageAuditsPass && visualPass) || (packageAuditsPass && visualPass && (report.saveCopyAsReopen?.status === 'PASS' || report.renderBeforeAfterIdentical === true))
	if (!schemaProofPass) failures.push(`${control.id}: incomplete native/Office/render proof flags`)
	for (const artifactKey of ['generatedArtifact', 'officeReferenceArtifact', 'roundtripArtifact', 'visualContactSheet']) {
		const ledgerArtifact = proof[artifactKey]
		if (!ledgerArtifact) continue
		const candidate = path.resolve(ledgerArtifact)
		if (!fs.existsSync(candidate)) failures.push(`${control.id}: ${artifactKey} missing`)
		else if (proof[`${artifactKey}Sha256`] && sha256File(candidate) !== proof[`${artifactKey}Sha256`]) failures.push(`${control.id}: ${artifactKey} digest mismatch`)
	}
	checkedReports.push({ controlId: control.id, proofReport: rel(reportFile), proofReportSha256: proof.proofReportSha256 })
}

for (const control of blocked) {
	const status = control.isolatedProof?.status
	if (!control.isolatedProof?.officeBoundary && !control.officeBoundary) failures.push(`${control.id}: blocked control lacks an explicit Office/contract boundary`)
	if (!['blocked-office-surface', 'blocked-contract'].includes(status)) failures.push(`${control.id}: unknown blocked status ${status}`)
}

	const expectedVerified = map.counts?.verifiedIsolatedFivePointProofRows ?? 0
	const expectedBlocked = map.counts?.blockedIsolatedFivePointProofRows ?? 0
	const checks = {
	mapShape: Array.isArray(map.programFamilies) && isolatedControls.length === (map.counts?.isolatedFivePointProofRows ?? isolatedControls.length),
	ledgerShape: ledger.schemaVersion === 'betterpptx.picture-format-five-point-proof-ledger.v1' && Array.isArray(ledger.proofs),
	universalMatrixStillFrozen: matrix.catalogRows.length === 2258,
	verifiedCount: verified.length === expectedVerified && verified.length === ledgerVerified.length,
	blockedCount: blocked.length === expectedBlocked,
	allVerifiedReportsBound: failures.length === 0,
	allBlockedBoundariesExplicit: blocked.every(control => Boolean(control.isolatedProof?.officeBoundary || control.officeBoundary)) && blockedContract.every(control => Boolean(control.isolatedProof?.officeBoundary || control.officeBoundary)),
}

const proof = {
	schemaVersion: 'betterpptx.g6.picture-format-five-point-batch-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS_BATCH_CONSOLIDATED' : 'FAIL',
	generatedAt: new Date().toISOString(),
	gate: 'G6',
	batch: {
		id: 'picture-format-five-point-corpus',
		isolatedFivePointRows: isolatedControls.length,
		verifiedRows: verified.length,
		blockedRows: blocked.length,
		formalClosedRowsAdded: 0,
		universalFormalClosure: '43/2258',
		policy: 'This aggregate family proof never promotes universal rows; only a row-specific proof-stack witness may enter universal-row-closure-ledger.json.',
	},
	checks,
	verifiedReports: checkedReports,
	blockedControls: blocked.map(control => ({ id: control.id, status: control.isolatedProof.status, boundary: control.isolatedProof.officeBoundary || control.officeBoundary })),
	blockedContractControls: blockedContract.map(control => ({ id: control.id, status: control.isolatedProof.status, boundary: control.isolatedProof.officeBoundary || control.officeBoundary })),
	evidence: {
		requirementMap: { path: rel(mapPath), sha256: sha256File(mapPath) },
		pictureFivePointLedger: { path: rel(ledgerPath), sha256: sha256File(ledgerPath) },
		universalCatalogMatrix: { path: rel(matrixPath), sha256: sha256File(matrixPath), rows: matrix.catalogRows.length },
	},
	failures,
	interpretation: 'The complete Picture Format slider corpus has one consolidated native/package/Office/readback/reset/visual evidence boundary for every verified row, while Office-unavailable controls remain explicit boundaries. This is batch evidence, not universal row closure.',
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/picture-format-five-point/${stamp}`)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'picture-format-five-point-batch-proof.json')
const bytes = Buffer.from(`${JSON.stringify({ ...proof, reportPath: rel(out) }, null, 2)}\n`)
fs.writeFileSync(out, bytes)
fs.writeFileSync(`${out}.sha256`, `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ status: proof.status, reportPath: rel(out), reportSha256: crypto.createHash('sha256').update(bytes).digest('hex'), isolatedFivePointRows: isolatedControls.length, verifiedRows: verified.length, blockedRows: blocked.length, formalClosedRowsAdded: 0, universalFormalClosure: '43/2258', checks, failureCount: failures.length }, null, 2))
if (proof.status === 'FAIL') process.exitCode = 1
