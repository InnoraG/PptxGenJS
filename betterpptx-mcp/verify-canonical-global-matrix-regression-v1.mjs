// Freeze the catalog/visual-surface reconciliation as one regression proof.
// This catches stale derived matrices before they can block a family batch.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { NATIVE_VISUAL_SURFACES } from './ir/native-visual-primitives.mjs'
import { publicBaselineCatalog } from './public-baseline-catalog.mjs'

const root = path.resolve('.')
const matrixPath = path.resolve('betterpptx-mcp/preset-decomposition-matrix.json')
const rowClosurePath = path.resolve('betterpptx-mcp/universal-row-closure-ledger.json')
const matrixBytes = fs.readFileSync(matrixPath)
const matrix = JSON.parse(matrixBytes)
const rowClosure = JSON.parse(fs.readFileSync(rowClosurePath, 'utf8'))
const formallyClosedRows = Array.isArray(rowClosure.formalClosedRows) ? rowClosure.formalClosedRows.length : 0
const local = publicBaselineCatalog({ includePlanned: true, offset: 0, limit: 500 })
const rows = []
for (let offset = 0; offset < local.pagination.total; offset += 500) rows.push(...publicBaselineCatalog({ includePlanned: true, offset, limit: 500 }).entries)
const matrixIds = new Set((matrix.optionSurfaces || []).map(surface => surface.id))
const liveIds = new Set(NATIVE_VISUAL_SURFACES.map(surface => surface.id))
const matrixSha256 = crypto.createHash('sha256').update(matrixBytes).digest('hex')
const testRun = spawnSync(process.execPath, ['--test', 'betterpptx-mcp/test/g0-capability-truth.test.mjs', 'betterpptx-mcp/test/mvp-baseline-inventory.test.mjs'], { cwd: root, encoding: 'utf8' })
const combinedOutput = `${testRun.stdout || ''}${testRun.stderr || ''}`
const checks = {
	matrixRows: matrix.counts?.catalogRows === 2258 && matrix.catalogRows?.length === 2258,
	matrixSurfaceCount: matrix.counts?.optionSurfaces === NATIVE_VISUAL_SURFACES.length && matrix.optionSurfaces?.length === NATIVE_VISUAL_SURFACES.length,
	liveSurfaceIdsMatch: matrixIds.size === liveIds.size && [...liveIds].every(id => matrixIds.has(id)),
	liveCatalogRows: rows.length === 2258 && local.catalogClosure?.classificationComplete === true,
	noPrivateLeakage: !JSON.stringify(matrix).match(/_raw|node_modules|[A-Za-z]:[\\/]|sourcePath|repoPath/),
	focusedRegression: testRun.status === 0,
}
const evidence = {
	schemaVersion: 'betterpptx.canonical-global-matrix-regression-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
	matrix: { path: path.relative(root, matrixPath).replaceAll('\\', '/'), sha256: matrixSha256, catalogRows: matrix.catalogRows.length, optionSurfaces: matrix.optionSurfaces.length },
	live: { visualSurfaceCount: NATIVE_VISUAL_SURFACES.length, ids: [...liveIds].sort(), servedCatalogRows: rows.length, catalogFingerprint: local.catalogFingerprint },
	checks,
	focusedTests: { command: 'node --test betterpptx-mcp/test/g0-capability-truth.test.mjs betterpptx-mcp/test/mvp-baseline-inventory.test.mjs', exitCode: testRun.status, outputSha256: crypto.createHash('sha256').update(combinedOutput).digest('hex'), outputTail: combinedOutput.split(/\r?\n/).slice(-8).join('\n') },
	rowClosure: { path: path.relative(root, rowClosurePath).replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(rowClosurePath)).digest('hex'), formallyClosedRows, universalRows: matrix.catalogRows.length, value: `${formallyClosedRows}/${matrix.catalogRows.length}` },
	interpretation: `The derived ${matrix.catalogRows.length}-row matrix and live native visual surface registry are synchronized at ${NATIVE_VISUAL_SURFACES.length} surfaces. Focused catalog truth and MVP inventory tests pass. This closes bookkeeping/regression integrity only; universal formal capability closure is ${formallyClosedRows}/${matrix.catalogRows.length}.`,
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/global-parameter-baseline-regression/${stamp}`)
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'global-parameter-baseline-regression-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (evidence.status !== 'PASS') process.exitCode = 1
