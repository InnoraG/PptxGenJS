import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrix = read('betterpptx-mcp/preset-decomposition-matrix.json')
const nativeRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/object-rotation/20260824T193934Z/object-rotation-native-proof.json'
const publicRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/object-rotation-public/20260824T194221Z/object-rotation-public-proof-v1.json'
const officeRel = 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-rotation-mutation/20260826161743Z/g6-office-rotation-mutation-proof.json'
const row = matrix.catalogRows.find(item => item.id === 'cap_7c17e40fcac63b5357e6')
const native = read(nativeRel), pub = read(publicRel), office = read(officeRel)
if (!row || row.family !== 'shapes-gradients' || row.label !== 'rotation') throw new Error('frozen shapes rotation row identity changed')
const np = native.proof || {}, nc = native.generated?.audit || {}, pc = pub.checks || {}, oc = office.checks || {}
const checks = {
  frozenRowIdentity: row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial',
  typedContract: native.status === 'PASS' && native.controls?.includes('rotate') && native.exactDomain?.minimum === -360 && native.exactDomain?.maximum === 360 && native.exactDomain?.step > 0,
  nativeFivePointReset: native.status === 'PASS' && native.planProbe?.valid?.length === 10 && native.planProbe?.nullReset === true && native.planProbe?.invalidRangeRejected === true && native.planProbe?.invalidStepRejected === true && Object.values(np).filter(value => typeof value === 'boolean').every(Boolean),
  nativePackage: nc.status === 'PASS' && nc.errors?.length === 0 && nc.warnings?.length === 0 && nc.externalTargets?.length === 0,
  nativeOfficeVisual: native.office?.status === 'PASS' && native.office.slideCount === 10 && native.roundtrip?.rows?.length === 10 && new Set(native.roundtrip.rows.map(item => item.renderSha256)).size >= 5,
  officeAuthoredMutation: office.status === 'PASS' && Object.values(oc).every(Boolean) && oc.officeAuthoredSetter === true && oc.saveCopyAsReopen === true && oc.retainedRotation === true,
  publicFreshLifecycle: pub.status === 'PASS' && pub.roleA?.freshSession === true && Object.values(pc).every(Boolean) && (pub.privateLeakMatches || []).length === 0,
  deterministicEditability: oc.officeAuthoredSetter === true && oc.retainedRotation === true
}
const formallyClosed = Object.values(checks).every(Boolean)
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-proof.v1', status: formallyClosed ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', formalClosure: { catalogRowId: row.id, family: row.family, label: row.label, formallyClosed, contribution: formallyClosed ? '1/2258' : '0/2258' }, checks, witness: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status }, officeMutation: { path: officeRel, sha256: sha(officeRel), status: office.status } }, retainedCapabilities: ['shape carrier rotation', 'typed range/step/null reset', 'native/package/readback', 'Office-authored Shape.Rotation mutation', 'SaveCopyAs/reopen', 'visual renders', 'fresh public lifecycle', 'no private leakage'], interpretation: 'The shapes-gradients rotation row is separately bound to the shape applicability of the shared object rotation carrier.', universalFormalClosure: formallyClosed ? '10/2258' : '9/2258' }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-shapes-rotation-row-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, catalogRowId: row.id, formallyClosed, universalFormalClosure: proof.universalFormalClosure, checks }, null, 2))
if (!formallyClosed) process.exitCode = 1
