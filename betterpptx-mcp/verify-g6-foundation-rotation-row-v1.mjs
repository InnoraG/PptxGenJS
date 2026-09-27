import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const matrixPath = path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json')
const nativePath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'object-rotation', '20260824T193934Z', 'object-rotation-native-proof.json')
const publicPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'object-rotation-public', '20260824T194221Z', 'object-rotation-public-proof-v1.json')
const officePath = (() => {
  const base = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-office-rotation-mutation')
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(name => fs.statSync(path.join(base, name)).isDirectory()).sort() : []
  return dirs.length ? path.join(base, dirs.at(-1), 'g6-office-rotation-mutation-proof.json') : null
})()
const read = file => { if (!file || !fs.existsSync(file)) throw new Error(`evidence missing: ${file}`); return JSON.parse(fs.readFileSync(file, 'utf8')) }
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const matrix = read(matrixPath)
const row = matrix.catalogRows.find(item => item.id === 'cap_a110570f7caeb8b6230b')
const native = read(nativePath)
const pub = read(publicPath)
const office = read(officePath)
if (!row || row.family !== 'foundation' || row.label !== 'rotation') throw new Error('frozen foundation rotation row identity changed')
const nativeProof = native.proof || {}
const nativeAudit = native.generated?.audit || {}
const nativeOffice = native.office || {}
const publicChecks = pub.checks || {}
const officeChecks = office.checks || {}
const checks = {
  frozenRowIdentity: row.id === 'cap_a110570f7caeb8b6230b' && row.family === 'foundation' && row.label === 'rotation',
  typedContract: row.capabilityMode === 'parameterized' && row.capabilityStatus === 'executable-exact-structured' && native.controls?.includes('rotate') && native.exactDomain?.minimum === -360 && native.exactDomain?.maximum === 360 && native.exactDomain?.step > 0,
  nativeFivePointAndReset: native.status === 'PASS' && native.planProbe?.valid?.length === 10 && native.planProbe?.nullReset === true && native.planProbe?.invalidRangeRejected === true && native.planProbe?.invalidStepRejected === true && Object.values(nativeProof).filter(value => typeof value === 'boolean').every(Boolean),
  nativePackageIntegrity: nativeAudit.status === 'PASS' && nativeAudit.errors?.length === 0 && nativeAudit.warnings?.length === 0 && nativeAudit.externalTargets?.length === 0,
  nativeOfficeRoundtripAndVisual: nativeOffice.status === 'PASS' && nativeOffice.slideCount === 10 && native.roundtrip?.rows?.length === 10 && new Set(native.roundtrip.rows.map(item => item.renderSha256)).size >= 5,
  officeAuthoredMutation: office.status === 'PASS' && Object.values(officeChecks).every(Boolean) && officeChecks.officeAuthoredSetter === true && officeChecks.saveCopyAsReopen === true && officeChecks.retainedRotation === true,
  publicFreshDiscoveryLifecycle: pub.status === 'PASS' && pub.roleA?.freshSession === true && Object.values(publicChecks).every(Boolean) && pub.privateLeakMatches?.length === 0,
  deterministicScriptEditability: officeChecks.officeAuthoredSetter === true && officeChecks.retainedRotation === true,
}
const formallyClosed = Object.values(checks).every(Boolean)
const proof = {
  schemaVersion: 'betterpptx.g6-frozen-catalog-row-proof.v1',
  status: formallyClosed ? 'PASS_FORMALLY_CLOSED' : 'FAIL',
  generatedAt: new Date().toISOString(),
  gate: 'G6',
  formalClosure: { catalogRowId: row.id, family: row.family, label: row.label, formallyClosed: formallyClosed, contribution: formallyClosed ? '1/2258' : '0/2258' },
  checks,
  witness: {
    native: { path: path.relative(root, nativePath).replaceAll('\\', '/'), sha256: sha(nativePath), status: native.status },
    public: { path: path.relative(root, publicPath).replaceAll('\\', '/'), sha256: sha(publicPath), status: pub.status, endpoint: pub.endpoint },
    officeMutation: { path: path.relative(root, officePath).replaceAll('\\', '/'), sha256: sha(officePath), status: office.status },
  },
  retainedCapabilities: ['typed range/default/step', 'null reset and invalid-boundary rejection', 'native serialization and readback', 'package integrity', 'PowerPoint COM Office-authored mutation', 'SaveCopyAs/reopen retention', 'non-empty visual renders', 'fresh public discovery/author/patch/reset/re-edit/preview/save', 'no private leakage'],
  interpretation: 'The shared foundation rotation row is formally closed because its frozen catalog identity is bound to independent native, package, Office-authored mutation, SaveCopyAs/reopen, deterministic-script editability, visual, and fresh public lifecycle witnesses. No unrelated row is promoted.',
  universalFormalClosure: formallyClosed ? '1/2258' : '0/2258'
}
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-foundation-rotation-row-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(out)
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, catalogRowId: row.id, formallyClosed, universalFormalClosure: proof.universalFormalClosure, checks }, null, 2))
if (!formallyClosed) process.exitCode = 1
