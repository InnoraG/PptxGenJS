import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrixRel = 'betterpptx-mcp/preset-decomposition-matrix.json'
const ledgerRel = 'betterpptx-mcp/universal-row-closure-ledger.json'
const nativeRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-connector-line-native/20260827T030621Z/shape-connector-line-native-proof.json'
const publicRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-connector-line-public/20260827T030631Z/shape-connector-line-public-proof-v1.json'
const officeRel = 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-shape-line-controls-mutation/20260827030433Z/g6-office-shape-line-controls-mutation-proof.json'

const matrix = read(matrixRel)
const ledger = read(ledgerRel)
const native = read(nativeRel)
const pub = read(publicRel)
const office = read(officeRel)
const configs = [
  { id: 'cap_69af4fb2d1dc8eb08ea0', label: 'transparency', controlId: 'shapeConnectorLine.transparency', publicParameter: 'lineTransparency', officeKey: 'lineTransparency' },
  { id: 'cap_57d362b1558501191dea', label: 'dash styles', controlId: 'shapeConnectorLine.dashType', publicParameter: 'lineDashType', officeKey: 'lineDashType' },
  { id: 'cap_8f458fb69af8d2919424', label: 'arrow heads', controlId: 'shapeConnectorLine.beginArrowType', publicParameter: 'lineBeginArrowType', officeKey: 'lineBeginArrowType' },
  { id: 'cap_281e77e18d9b2bfaf957', label: 'arrow tails', controlId: 'shapeConnectorLine.endArrowType', publicParameter: 'lineEndArrowType', officeKey: 'lineEndArrowType' },
]
const booleansPass = value => Object.values(value || {}).filter(item => typeof item === 'boolean').every(Boolean)
const nativeProof = native.proof || {}
const publicChecks = pub.checks || {}
const rows = configs.map(cfg => {
  const row = matrix.catalogRows.find(item => item.id === cfg.id)
  const parameter = pub.roleA?.parameters?.[cfg.publicParameter]
  const officeControl = office.controls?.find(item => item.key === cfg.officeKey)
  const checks = {
    frozenRowIdentity: row?.family === 'shapes-gradients' && row.label === cfg.label && row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial',
    typedNativeContract: native.status === 'PASS' && native.contract?.dashType?.length >= 5 && native.contract?.transparencyPercent?.step > 0 && native.contract?.arrowType?.length >= 5,
    nativeSerializationResetReadback: native.status === 'PASS' && booleansPass(nativeProof) && native.rows?.length === 4 && native.roundtrip?.rows?.length === 4 && nativeProof.resetAndReeditBoundary === true,
    nativePackageOfficeVisual: native.generated?.packageAudit?.status === 'PASS' && native.generated.packageAudit.errors?.length === 0 && native.office?.status === 'PASS',
    publicTypedParameter: pub.status === 'PASS' && parameter?.capabilityMode === 'parameterized' && parameter?.capabilityStatus === 'executable-exact-structured' && typeof parameter.semanticPath === 'string' && typeof parameter.reset === 'string',
    publicFreshLifecycle: pub.status === 'PASS' && booleansPass(publicChecks) && (pub.privateLeakMatches || []).length === 0,
    officeAuthoredMutation: office.status === 'PASS' && officeControl?.status === 'PASS' && officeControl.checks?.officeAuthoredSetter === true && officeControl.checks?.saveCopyAsReopen === true && officeControl.checks?.retainedValue === true && officeControl.checks?.renderedFiveNonEmpty === true,
  }
  return { ...cfg, formallyClosed: Object.values(checks).every(Boolean), checks, witnesses: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status, parameter: cfg.publicParameter }, office: { path: officeRel, sha256: sha(officeRel), status: office.status, control: cfg.officeKey, shapeIndex: officeControl?.shapeIndex } } }
})
const formallyClosed = rows.every(row => row.formallyClosed)
const before = ledger.formalClosedRows.length
const alreadyClosed = new Set(ledger.formalClosedRows.map(row => row.catalogRowId))
const newRows = rows.filter(row => row.formallyClosed && !alreadyClosed.has(row.id)).length
const proof = {
  schemaVersion: 'betterpptx.g6-frozen-catalog-row-batch-proof.v1',
  status: formallyClosed ? 'PASS_FORMALLY_CLOSED' : 'FAIL',
  generatedAt: new Date().toISOString(),
  gate: 'G6',
  batch: { family: 'shapes-gradients', name: 'shape and connector line controls', requestedRows: rows.length, formallyClosedRows: rows.filter(row => row.formallyClosed).length, contribution: formallyClosed ? `${newRows}/2258` : '0/2258' },
  checks: { allRowsFormal: formallyClosed, rowCount: rows.length, allNativeContracts: rows.every(row => row.checks.typedNativeContract), allNativePackageOfficeVisual: rows.every(row => row.checks.nativePackageOfficeVisual), allPublicLifecycles: rows.every(row => row.checks.publicFreshLifecycle), allOfficeMutations: rows.every(row => row.checks.officeAuthoredMutation) },
  rows,
  policy: 'Each frozen row is promoted only when its typed native contract, package/PowerPoint reopen, reset/readback, visual, fresh public lifecycle, public reset contract, no-private-leakage, and direct Office-authored mutation witnesses all pass. Arrowhead Office witnesses intentionally use the connector carrier because PowerPoint does not expose those setters on a closed AutoShape.',
  universalFormalClosure: `${before + newRows}/2258`,
}
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-shape-line-controls-row-batch-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, rows: rows.map(row => ({ id: row.id, label: row.label, formallyClosed: row.formallyClosed })), universalFormalClosure: proof.universalFormalClosure, checks: proof.checks }, null, 2))
if (!formallyClosed) process.exitCode = 1
