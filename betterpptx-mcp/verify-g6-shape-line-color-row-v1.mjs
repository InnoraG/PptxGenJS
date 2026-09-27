import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrixRel = 'betterpptx-mcp/preset-decomposition-matrix.json'
const ledgerRel = 'betterpptx-mcp/universal-row-closure-ledger.json'
const nativeRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-line-color-native/20260827T031730Z/shape-line-color-native-proof.json'
const publicRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-connector-line-public/20260827T030631Z/shape-connector-line-public-proof-v1.json'
const officeRel = 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-shape-line-color-mutation/20260827031638Z/g6-office-shape-line-color-mutation-proof.json'
const matrix = read(matrixRel); const ledger = read(ledgerRel); const native = read(nativeRel); const pub = read(publicRel); const office = read(officeRel)
const row = matrix.catalogRows.find(item => item.id === 'cap_308a8f434225efca1a24')
const parameter = pub.roleA?.parameters?.lineColor
const officeRow = office.row || {}
const publicChecks = pub.checks || {}
const booleansPass = value => Object.values(value || {}).filter(item => typeof item === 'boolean').every(Boolean)
const checks = {
  frozenRowIdentity: row?.family === 'shapes-gradients' && row.label === 'line color' && row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial',
  typedNativeContract: native.status === 'PASS' && native.contract?.colorType === 'hex-or-theme' && native.contract?.carriers?.includes('shape') && native.contract?.carriers?.includes('connector'),
  nativeSerializationResetReadback: native.status === 'PASS' && native.proof?.typedNativeSerialization === true && native.proof?.packageIntegrity === true && native.proof?.repairFreePowerPointOpen === true && native.proof?.saveCopyAsReopen === true && native.proof?.retainedLineColor === true,
  publicTypedParameter: pub.status === 'PASS' && parameter?.capabilityMode === 'parameterized' && parameter?.capabilityStatus === 'executable-exact-structured' && parameter?.semanticPath === 'style.line.color' && typeof parameter.reset === 'string',
  publicFreshLifecycle: pub.status === 'PASS' && booleansPass(publicChecks) && (pub.privateLeakMatches || []).length === 0,
  officeAuthoredMutation: office.status === 'PASS' && officeRow.frozenCatalogId === 'cap_308a8f434225efca1a24' && office.checks?.officeAuthoredSetter === true && office.checks?.saveCopyAsReopen === true && office.checks?.retainedLineColor === true && office.checks?.renderedFiveNonEmpty === true,
}
const formallyClosed = Object.values(checks).every(Boolean)
const before = ledger.formalClosedRows.length; const alreadyClosed = new Set(ledger.formalClosedRows.map(item => item.catalogRowId)); const contribution = formallyClosed && !alreadyClosed.has(row?.id) ? 1 : 0
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-proof.v1', status: formallyClosed ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', formalClosure: { catalogRowId: row?.id, family: row?.family, label: row?.label, formallyClosed, contribution: `${contribution}/2258` }, checks, witness: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status, parameter: 'lineColor' }, officeMutation: { path: officeRel, sha256: sha(officeRel), status: office.status, control: officeRow.officeCarrier } }, retainedCapabilities: ['shape and connector line color', 'typed hex/theme color carrier', 'null/type:none reset boundary', 'native package and PowerPoint reopen', 'Office Shape.Line.ForeColor.RGB mutation', 'SaveCopyAs/reopen', 'visual renders', 'fresh public lifecycle', 'no private leakage'], universalFormalClosure: `${before + contribution}/2258` }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'; const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp); fs.mkdirSync(outDir, { recursive: true }); const out = path.join(outDir, 'g6-shape-line-color-row-proof.json'); fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n'); const reportSha256 = sha(path.relative(root, out)); console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, catalogRowId: row?.id, formallyClosed, universalFormalClosure: proof.universalFormalClosure, checks }, null, 2)); if (!formallyClosed) process.exitCode = 1
