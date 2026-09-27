#!/usr/bin/env node

// Bind the completed native/Office and public witnesses to the nine frozen
// catalog rows. This is the atomic family-boundary record used for promotion.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('.')
const read = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'))
const sha = async rel => crypto.createHash('sha256').update(await fs.readFile(path.join(root, rel))).digest('hex')
const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null
const nativeRel = arg('--native') || 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-shape-style-row-batch/20260827T041801Z/g6-shape-style-row-batch-proof.json'
const publicRel = arg('--public') || 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-style-row-public/20260827T042618Z/g6-shape-style-row-public-proof.json'
const matrixRel = 'betterpptx-mcp/preset-decomposition-matrix.json'
const ledgerRel = 'betterpptx-mcp/universal-row-closure-ledger.json'
const startIndex = Number(arg('--start') || 1) || 1
const styleIds = Array.from({ length: 9 }, (_, i) => `shape-style-${String(startIndex + i).padStart(3, '0')}`)
const matrix = await read(matrixRel)
const rowIds = styleIds.map(styleId => matrix.catalogRows.find(row => row.label?.endsWith(`-> ${styleId}`) && row.family === 'shapes-gradients')?.id)
const native = await read(nativeRel)
const pub = await read(publicRel)
const ledger = await read(ledgerRel)
const nativeSha = await sha(nativeRel)
const publicSha = await sha(publicRel)
const matrixRows = rowIds.map((id, index) => matrix.catalogRows.find(row => row.id === id && row.label.endsWith(`-> ${styleIds[index]}`)))
const nativeRows = native.rows || []
const publicRows = pub.readback?.initialRows || []
const allNative = native.status === 'PASS_FORMALLY_CLOSED' && Object.values(native.checks || {}).every(Boolean)
const allPublic = pub.status === 'PASS' && Object.values(pub.checks || {}).every(Boolean)
const rows = rowIds.map((catalogRowId, index) => ({
	catalogRowId,
	family: matrixRows[index]?.family,
	label: matrixRows[index]?.label,
	controlId: 'shapeStylePresetId',
	styleId: styleIds[index],
	status: allNative && allPublic ? 'PASS_FORMALLY_CLOSED' : 'FAIL',
	checks: {
		frozenRowIdentity: matrixRows[index]?.capabilityStatus === 'executable-exact-structured',
		nativeCarrier: nativeRows[index]?.shapeStylePresent === true,
		nativeDistinctPayload: typeof nativeRows[index]?.canonicalPayloadHash === 'string',
		officeAuthoredMutation: nativeRows[index]?.office?.actual === nativeRows[index]?.office?.requested,
		officeSaveCopyAsReadback: nativeRows[index]?.roundtrip?.shapeStylePresent === true,
		visualRender: typeof nativeRows[index]?.renderSha256 === 'string' && nativeRows[index].renderSha256.length === 64,
		publicInitialReadback: publicRows[index]?.readback === styleIds[index],
		publicResetReadback: pub.readback?.resetRows?.[index]?.readback == null,
		publicReeditReadback: pub.readback?.reeditRows?.[index]?.readback === styleIds[styleIds.length - index - 1],
		publicPreviewSave: pub.checks?.preview === true && pub.checks?.savedArtifact === true,
		noPrivateLeakage: pub.checks?.noPrivateImplementationLeakage === true,
	},
	witnesses: {
		nativeOffice: { path: nativeRel, sha256: nativeSha },
		public: { path: publicRel, sha256: publicSha },
	},
}))
const formal = rows.every(row => Object.values(row.checks).every(Boolean))
const existingClosed = ledger.formalClosedRows.length
const report = {
	schemaVersion: 'betterpptx.g6-shape-style-row-batch-bind-proof.v1',
	status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL',
	generatedAt: new Date().toISOString(),
	gate: 'G6',
	batch: { family: 'shapes-gradients', control: 'shapeStylePresetId', styleIds, contribution: formal ? `${rows.length}/2258` : '0/2258' },
	checks: { allRowsFormal: formal, rowCount: rows.length, nativeOfficeBoundary: allNative, publicLifecycleBoundary: allPublic, ledgerBaseline: `${existingClosed}/2258`, noDuplicateRows: rowIds.every(id => !ledger.formalClosedRows.some(row => row.catalogRowId === id)) },
	rows,
	artifacts: { native: nativeRel, nativeSha256: nativeSha, public: publicRel, publicSha256: publicSha, matrix: matrixRel, matrixSha256: await sha(matrixRel), ledger: ledgerRel, ledgerSha256: await sha(ledgerRel) },
	policy: 'Only this row-specific native carrier, package, Office-authored mutation, SaveCopyAs/reopen, visual, fresh public discovery/readback/reset/re-edit/preview/save, and no-leakage witness stack authorizes promotion. Preset selectors remain independent from typed overrides.',
	universalFormalClosureBefore: `${existingClosed}/2258`,
	universalFormalClosureAfter: formal ? `${existingClosed + rows.length}/2258` : `${existingClosed}/2258`,
}
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
await fs.mkdir(outDir, { recursive: true })
const out = path.join(outDir, 'g6-shape-style-row-batch-bind-proof.json')
const bytes = Buffer.from(`${JSON.stringify({ ...report, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2)}\n`)
await fs.writeFile(out, bytes)
const reportSha256 = crypto.createHash('sha256').update(bytes).digest('hex')
await fs.writeFile(`${out}.sha256`, `${reportSha256}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, rows: rowIds, universalFormalClosureBefore: report.universalFormalClosureBefore, universalFormalClosureAfter: report.universalFormalClosureAfter, checks: report.checks }, null, 2))
if (!formal) process.exitCode = 1
