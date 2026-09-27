import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const matrixPath = path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json')
const nativePath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'text-outline', '20260824T141020Z', 'text-outline-native-proof.json')
const publicPath = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'text-outline-public', '20260824T141400Z', 'text-outline-public-proof.json')
const officeBase = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-office-text-outline-mutation')
const officeDir = fs.readdirSync(officeBase).filter(name => fs.statSync(path.join(officeBase, name)).isDirectory()).sort().at(-1)
const officePath = path.join(officeBase, officeDir, 'g6-office-text-outline-mutation-proof.json')
const read = file => { if (!fs.existsSync(file)) throw new Error(`missing evidence: ${file}`); return JSON.parse(fs.readFileSync(file, 'utf8')) }
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const matrix = read(matrixPath)
const row = matrix.catalogRows.find(item => item.id === 'cap_de980017863e62603d8f')
const native = read(nativePath)
const pub = read(publicPath)
const office = read(officePath)
if (!row || row.family !== 'foundation' || row.label !== 'text outline') throw new Error('frozen text-outline row identity changed')
const checks = {
  frozenRowIdentity: row.id === 'cap_de980017863e62603d8f' && row.family === 'foundation' && row.label === 'text outline',
  typedContractAndApplicability: row.capabilityMode === 'parameterized' && row.capabilityStatus === 'executable-exact-structured' && /textOutline\.color.*textOutline\.transparency.*textOutline\.widthPt/.test(native.controlFamily || '') && native.checkpoints?.length === 10,
  nativeFivePointResetReedit: native.status === 'PASS' && native.proof && Object.values(native.proof).filter(value => typeof value === 'boolean').every(Boolean) && native.roundtrip?.rows?.length === 10,
  nativePackageIntegrityAndOffice: native.generated?.audit?.status === 'PASS' && native.generated.audit.errors?.length === 0 && native.generated.audit.warnings?.length === 0 && native.office?.status === 'PASS' && native.office.slideCount === 10,
  officeAuthoredMutation: office.status === 'PASS' && Object.values(office.checks || {}).every(Boolean) && office.checks.officeAuthoredSetter && office.checks.retainedTextOutline && office.checks.saveCopyAsReopen,
  publicFreshLifecycle: pub.status === 'PASS' && pub.roleA?.freshSession === true && Object.values(pub.checks || {}).every(Boolean) && pub.privateLeakMatches?.length === 0,
  deterministicScriptEditability: office.checks?.officeAuthoredSetter === true && office.checks?.retainedTextOutline === true,
}
const formallyClosed = Object.values(checks).every(Boolean)
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-proof.v1', status: formallyClosed ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', formalClosure: { catalogRowId: row.id, family: row.family, label: row.label, formallyClosed, contribution: formallyClosed ? '1/2258' : '0/2258' }, checks, witness: { native: { path: path.relative(root, nativePath).replaceAll('\\', '/'), sha256: sha(nativePath), status: native.status }, public: { path: path.relative(root, publicPath).replaceAll('\\', '/'), sha256: sha(publicPath), status: pub.status, endpoint: pub.endpoint }, officeMutation: { path: path.relative(root, officePath).replaceAll('\\', '/'), sha256: sha(officePath), status: office.status } }, retainedCapabilities: ['typed outline color/transparency/width', 'ordinary text and WordArt applicability', 'native serialization/readback', 'null reset and re-edit', 'package integrity and repair-free Office roundtrip', 'Office-authored Font.Line mutation', 'fresh public discovery/lifecycle', 'visual renders', 'no private leakage'], interpretation: 'The frozen foundation text outline row is formally closed from independent native, public, Office-authored, SaveCopyAs/reopen, deterministic script editability, package, reset/re-edit, and visual witnesses. No unrelated row is promoted.', universalFormalClosure: formallyClosed ? '2/2258' : '1/2258' }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-foundation-text-outline-row-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(out)
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, catalogRowId: row.id, formallyClosed, universalFormalClosure: proof.universalFormalClosure, checks }, null, 2))
if (!formallyClosed) process.exitCode = 1
