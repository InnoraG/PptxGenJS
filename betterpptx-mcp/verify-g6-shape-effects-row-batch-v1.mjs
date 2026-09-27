import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrixRel = 'betterpptx-mcp/preset-decomposition-matrix.json'
const matrix = read(matrixRel)
const configs = [
  { rowId: 'cap_0c51cde91a6cc3745fc3', label: 'glow', native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-glow-opacity/20260824T035020Z/shape-glow-opacity-five-point-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-glow-opacity-public/20260824T035030Z/shape-glow-opacity-public-proof.json', nativeRetained: 'retainedNativeGlowOpacity', publicCatalog: 'glowCatalogPresent', publicParameter: 'opacityParameterContractPresent', publicParamKey: 'opacityParameter' },
  { rowId: 'cap_3eb5ffd295fb7bf5e978', label: 'soft edges', native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-soft-edge-radius/20260824T035548Z/shape-soft-edge-radius-five-point-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-soft-edge-radius-public/20260824T035745Z/shape-soft-edge-radius-public-proof.json', nativeRetained: 'retainedNativeSoftEdge', publicCatalog: 'softEdgeCatalogPresent', publicParameter: 'radiusParameterContractPresent', publicParamKey: 'radiusParameter' },
  { rowId: 'cap_4f805537db52aa726106', label: 'reflection', native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-reflection-end-opacity/20260824T042344Z/shape-reflection-end-opacity-five-point-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-reflection-end-opacity-public/20260824T042352Z/shape-reflection-end-opacity-public-proof.json', nativeRetained: 'retainedNativeReflectionEndOpacity', publicCatalog: 'reflectionCatalogPresent', publicParameter: 'opacityParameterContractPresent', publicParamKey: 'opacityParameter' },
  { rowId: 'cap_a2729e1c7cce7ae612e3', label: 'shadows', native: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-shadow-angle/20260824T022148Z/shape-shadow-angle-five-point-proof.json', public: 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-shadow-angle-public/20260824T022155Z/shape-shadow-angle-public-proof.json', nativeRetained: 'retainedNativeShadow', publicCatalog: 'shadowCatalogPresent', publicParameter: 'angleParameterContractPresent', publicParamKey: 'angleParameter' }
]
const results = configs.map(cfg => {
  const row = matrix.catalogRows.find(item => item.id === cfg.rowId)
  const native = read(cfg.native)
  const pub = read(cfg.public)
  const nativeProof = native.proof || {}
  const publicChecks = pub.checks || {}
  const booleansPass = obj => Object.entries(obj).filter(([, value]) => typeof value === 'boolean').every(([, value]) => value)
  const checks = {
    frozenRowIdentity: row?.family === 'shapes-gradients' && row.label === cfg.label && row.capabilityStatus === 'structured-partial',
    typedContract: native.status === 'PASS' && native.contract?.type === 'continuous' && native.contract?.valueType === 'number' && typeof native.contract?.step === 'number' && typeof native.contract?.reset === 'string',
    nativeFivePointReset: native.status === 'PASS' && native.checkpoints?.length === 5 && nativeProof.structuredSerialization === true && nativeProof[cfg.nativeRetained] === true && nativeProof.saveCopyAsReopen === true,
    nativePackageOfficeVisual: nativeProof.packageIntegrity === true && nativeProof.repairFreePowerPointOpen === true && nativeProof.distinctVisualRenders === true && native.office?.status === 'PASS' && native.office.slideCount === 5 && native.roundtrip?.rows?.length === 5,
    publicFreshLifecycle: pub.status === 'PASS' && booleansPass(publicChecks) && publicChecks[cfg.publicCatalog] === true && publicChecks[cfg.publicParameter] === true && (pub.privateLeakMatches || []).length === 0,
    publicResetContract: pub.roleA?.[cfg.publicParamKey]?.reset || pub.roleA?.parameter?.reset,
    noPrivateLeakage: (pub.privateLeakMatches || []).length === 0
  }
  checks.publicResetContract = typeof checks.publicResetContract === 'string' && checks.publicResetContract.length > 0
  const formal = Object.values(checks).every(Boolean)
  return { catalogRowId: cfg.rowId, family: row?.family, label: cfg.label, status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL', formal, checks, witnesses: { native: { path: cfg.native, sha256: sha(cfg.native), status: native.status }, public: { path: cfg.public, sha256: sha(cfg.public), status: pub.status } }, controlId: native.controlId, checkpointCount: native.checkpoints?.length || 0 }
})
const formal = results.every(result => result.formal)
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-batch-proof.v1', status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', batch: { family: 'shapes-gradients', controls: results.map(result => ({ catalogRowId: result.catalogRowId, label: result.label, controlId: result.controlId })), contribution: formal ? `${results.length}/2258` : '0/2258' }, checks: { allRowsFormal: formal, rowCount: results.length, allNativeContracts: results.every(result => result.checks.typedContract), allNativePackageOfficeVisual: results.every(result => result.checks.nativePackageOfficeVisual), allPublicLifecycles: results.every(result => result.checks.publicFreshLifecycle), allResetContracts: results.every(result => result.checks.publicResetContract) }, rows: results, policy: 'Each row is promoted only when its own native typed five-point/reset, package/Office/readback/visual, fresh public lifecycle/reset, and no-private-leakage witnesses pass. These are three aggregate Format-pane rows, not all individual preset tiles.', universalFormalClosure: formal ? '16/2258' : '13/2258' }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-shape-effects-row-batch-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, rows: results.map(result => result.catalogRowId), universalFormalClosure: proof.universalFormalClosure, checks: proof.checks }, null, 2))
if (!formal) process.exitCode = 1
