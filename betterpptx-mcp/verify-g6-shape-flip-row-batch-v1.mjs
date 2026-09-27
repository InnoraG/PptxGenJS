import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrixRel = 'betterpptx-mcp/preset-decomposition-matrix.json'
const nativeRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/object-flip/20260824T201634Z/object-flip-native-proof.json'
const publicRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/object-flip-public/20260824T201606Z/object-flip-public-proof-v1.json'
const officeRel = 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-shape-flip-mutation/20260826174154Z/g6-office-shape-flip-mutation-proof.json'
const matrix = read(matrixRel)
const native = read(nativeRel)
const pub = read(publicRel)
const office = read(officeRel)
const rows = [
  matrix.catalogRows.find(row => row.id === 'cap_a4d8dddf1aa4493281ce'),
  matrix.catalogRows.find(row => row.id === 'cap_c167b455cc3815bc6e88')
]
if (rows.some(row => !row || row.family !== 'shapes-gradients')) throw new Error('frozen shape flip row identity changed')
const nativeRows = native.generated?.rows || []
const nativeShapeRows = nativeRows.filter(row => row.carrier === 'shape')
const officeControls = office.controls || []
const publicChecks = pub.checks || {}
const common = {
  frozenRowIdentity: rows.every(row => row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial'),
  nativeTypedContract: native.status === 'PASS' && native.controls?.includes('flipH') && native.controls?.includes('flipV') && native.exactDomain?.values?.length === 2 && native.exactDomain.default === false,
  nativeFivePointAndReset: native.planProbe?.valid?.length === 10 && native.planProbe.nullReset === true && native.planProbe.invalidTypeRejected === true && native.planProbe.invalidNumericRejected === true && native.planProbe.carriersForwarded?.shape === true,
  nativePackageReadback: native.proof?.packageIntegrity === true && native.proof?.repairFreePowerPointOpen === true && native.proof?.saveCopyAsReopen === true && native.proof?.retainedNativeFlip === true && native.roundtrip?.rows?.length === 10 && nativeShapeRows.length >= 5,
  officeAuthoredMutation: office.status === 'PASS' && office.checks?.allOfficeAuthoredSetters === true && office.checks?.allSaveCopyAsReopen === true && office.checks?.allRetainedFlipAttributes === true,
  officeVisual: office.checks?.allRenderedNonEmpty === true,
  publicLifecycle: pub.status === 'PASS' && publicChecks.freshPublicSession === true && publicChecks.servedDiscovery === true && publicChecks.catalog === true && publicChecks.catalogParameters === true && publicChecks.initialDryRun === true && publicChecks.initialCommit === true && publicChecks.independentResetReadback === true && publicChecks.reeditDryRun === true && publicChecks.reeditCommit === true && publicChecks.postReeditReadback === true && publicChecks.preview === true && publicChecks.savedArtifact === true && publicChecks.invalidBoundaryRejected === true && publicChecks.noPrivateImplementationLeakage === true && (pub.privateLeakMatches || []).length === 0,
  publicShapeReadback: pub.readback?.reset?.shape?.flipH === null && pub.readback?.reset?.shape?.flipV === null && pub.readback?.reedit?.shape?.flipH === false && pub.readback?.reedit?.shape?.flipV === true
}
const formal = Object.values(common).every(Boolean)
const proof = {
  schemaVersion: 'betterpptx.g6-frozen-catalog-row-batch-proof.v1',
  status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL',
  generatedAt: new Date().toISOString(),
  gate: 'G6',
  batch: { family: 'shapes-gradients', controls: rows.map(row => ({ catalogRowId: row.id, label: row.label })), contribution: formal ? '2/2258' : '0/2258' },
  checks: common,
  witness: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status }, officeMutation: { path: officeRel, sha256: sha(officeRel), status: office.status } },
  retainedCapabilities: ['shared object flipH/flipV typed booleans', 'shape carrier applicability', 'null reset to native false default', 'native/package/readback', 'Office Shape.Flip mutation', 'SaveCopyAs/reopen', 'visual renders', 'fresh public lifecycle', 'no private leakage'],
  interpretation: 'The two shape flip catalog rows are separately bound to the shared shape transform carrier. The Office witness mutates one axis while retaining the other axis, and XML xfrm attributes verify the exact saved state.',
  universalFormalClosure: formal ? '13/2258' : '11/2258'
}
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-shape-flip-row-batch-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, rows: rows.map(row => row.id), universalFormalClosure: proof.universalFormalClosure, checks: common }, null, 2))
if (!formal) process.exitCode = 1
