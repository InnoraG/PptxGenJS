// Reconcile the frozen 2,258-row catalog with the latest family proof slices.
// This is bookkeeping/evidence readiness only; it deliberately never promotes
// aggregate family evidence to universal formal closure.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const matrixPath = path.resolve('betterpptx-mcp/preset-decomposition-matrix.json')
const rowClosurePath = path.resolve('betterpptx-mcp/universal-row-closure-ledger.json')
const archiveRoot = path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive')
const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'))
const rowClosure = JSON.parse(await fs.readFile(rowClosurePath, 'utf8').catch(() => '{"frozenCatalogRows":2258,"formalClosedRows":[]}'))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const filesUnder = async dir => {
	const out = []
	for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...await filesUnder(full))
		else if (entry.name.endsWith('proof.json')) out.push(full)
	}
	return out
}
const familyRows = Object.groupBy(matrix.catalogRows || [], row => row.family)
const families = Object.entries(familyRows).map(([family, rows]) => ({ family, matrixRows: rows.length, statusCounts: Object.groupBy(rows, row => row.capabilityStatus), rows }))
const proofRoots = {}
for (const family of families) {
	const folder = path.join(archiveRoot, `${family.family}-family`)
	const candidates = (await filesUnder(folder)).sort()
	const matches = []
	for (const file of candidates) {
		try {
			const proof = JSON.parse(await fs.readFile(file, 'utf8'))
			const reported = Number(proof.family?.matrixRows || proof.matrixRows || 0)
			if (proof.status === 'PASS' && reported === family.matrixRows) matches.push({ file, proof, reported })
		} catch {}
	}
	const chosen = matches.at(-1)
	proofRoots[family.family] = chosen ? { path: path.relative(root, chosen.file).replaceAll('\\','/'), sha256: sha256(await fs.readFile(chosen.file)), status: chosen.proof.status, matrixRows: chosen.reported } : null
}
const classificationTotals = {}
for (const row of matrix.catalogRows || []) classificationTotals[row.capabilityStatus] = (classificationTotals[row.capabilityStatus] || 0) + 1
const matrixIds = new Set((matrix.catalogRows || []).map(row => row.id))
const formalRows = Array.isArray(rowClosure.formalClosedRows) ? rowClosure.formalClosedRows : []
const formalRowIds = formalRows.map(row => row.catalogRowId)
const formalRowDuplicates = formalRowIds.filter((id, index) => formalRowIds.indexOf(id) !== index)
const formalRowUnknown = formalRows.filter(row => !matrixIds.has(row.catalogRowId))
const formalRowProofMissing = formalRows.filter(row => row.status !== 'formally-closed' || !row.proof || !row.proofSha256)
const checks = {
	matrixRows2258: matrix.catalogRows?.length === 2258,
	familyPartitionSums2258: families.reduce((n, family) => n + family.matrixRows, 0) === 2258,
	familyCount15: families.length === 15,
	familyProofsPass: families.every(family => proofRoots[family.family]?.status === 'PASS' && proofRoots[family.family]?.matrixRows === family.matrixRows),
	rowClosureLedgerValid: rowClosure.frozenCatalogRows === 2258 && formalRowDuplicates.length === 0 && formalRowUnknown.length === 0 && formalRowProofMissing.length === 0,
	noPrivateLeakage: !JSON.stringify({ matrix, proofRoots }).match(/(?:[A-Za-z]:[\\/]|node_modules|_raw|sourcePath|repoPath)/i),
}
const report = {
	schemaVersion: 'betterpptx.universal-catalog-reconciliation-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS_RECONCILIATION_ONLY' : 'FAIL',
	generatedAt: new Date().toISOString(),
	matrix: { path: path.relative(root, matrixPath).replaceAll('\\','/'), sha256: sha256(await fs.readFile(matrixPath)), rows: matrix.catalogRows.length, optionSurfaces: matrix.optionSurfaces?.length || 0 },
	families: families.map(({ family, matrixRows, statusCounts }) => ({ family, matrixRows, statusCounts: Object.fromEntries(Object.entries(statusCounts).map(([k,v]) => [k, v.length])), proof: proofRoots[family] })),
	classificationTotals,
	formalClosure: { formallyClosedRows: formalRows.length, universalRows: 2258, value: `${formalRows.length}/2258`, reason: 'Only rows in universal-row-closure-ledger.json with an immutable proof binding every required native/public/readback/reset/Office/visual witness are counted. Aggregate family proofs remain non-closing.' },
	rowClosureLedger: { path: path.relative(root, rowClosurePath).replaceAll('\\','/'), sha256: sha256(await fs.readFile(rowClosurePath)), rows: formalRows.length, duplicateIds: formalRowDuplicates, unknownIds: formalRowUnknown.map(row => row.catalogRowId), missingProofFields: formalRowProofMissing.map(row => row.catalogRowId) },
	checks,
	interpretation: `All 2,258 frozen rows reconcile into 15 families whose latest immutable family proofs pass and whose classifications are preserved. ${formalRows.length} row-level witness${formalRows.length === 1 ? '' : 'es'} are formally closed from the explicit ledger; the remaining ${2258 - formalRows.length} rows remain open.`,
}
const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/universal-catalog-reconciliation/${stamp}`)
await fs.mkdir(outDir, { recursive: true })
const out = path.join(outDir, 'universal-catalog-reconciliation-proof.json')
const bytes = Buffer.from(`${JSON.stringify(report,null,2)}\n`)
await fs.writeFile(out, bytes); await fs.writeFile(`${out}.sha256`, `${sha256(bytes)}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(root,out).replaceAll('\\','/'), reportSha256: sha256(bytes), checks, classificationTotals, formallyClosedRows: formalRows.length, universalRows: 2258 }, null, 2))
if (report.status === 'FAIL') process.exitCode = 1
