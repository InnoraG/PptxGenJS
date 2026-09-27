import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrixRel = 'betterpptx-mcp/preset-decomposition-matrix.json'
const nativeRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-fill-transparency/20260824T135131Z/text-fill-transparency-native-proof.json'
const publicRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-fill-transparency-public/20260824T135048Z/text-fill-transparency-public-proof.json'
const matrix = read(matrixRel)
const native = read(nativeRel)
const pub = read(publicRel)
const row = matrix.catalogRows.find(item => item.id === 'cap_4f8e8c0ca3de5ee67a59')
const checks = {
  frozenRowIdentity: row?.family === 'foundation' && row.label === 'text fill' && row.capabilityStatus === 'executable-exact-structured',
  typedFivePointContract: native.status === 'PASS' && native.controlFamily === 'textFill.transparency' && native.checkpoints?.length === 10 && native.controls?.includes('textFill.transparency'),
  nativePackageReadback: native.proof?.typedCompilerMapping === true && native.proof?.packageIntegrity === true && native.proof?.repairFreePowerPointOpen === true && native.proof?.saveCopyAsReopen === true && native.proof?.retainedNativeTextRunAlpha === true && native.proof?.resetAndReedit === true,
  officeVisual: native.office?.status === 'PASS' && native.office.slideCount === 10 && native.proof?.visualRenders?.length === 10,
  publicLifecycle: pub.status === 'PASS' && Object.values(pub.checks || {}).every(Boolean) && pub.checks.textFillCatalog === true && pub.checks.textFillRange === true && pub.checks.componentResetReadback === true && pub.checks.sparsePatchReadback === true && pub.checks.postReeditPlainReadback === true && pub.checks.postReeditWordArtReadback === true,
  publicResetContract: typeof pub.roleA?.parameter?.reset === 'string' && pub.roleA.parameter.reset.includes('null'),
  noPrivateLeakage: (pub.privateLeakMatches || []).length === 0
}
const formal = Object.values(checks).every(Boolean)
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-proof.v1', status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', formalClosure: { catalogRowId: row?.id, family: row?.family, label: row?.label, formallyClosed: formal, contribution: formal ? '1/2258' : '0/2258' }, checks, witness: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status } }, retainedCapabilities: ['text fill/transparency continuous slider', 'plain text and WordArt carriers', 'component/full reset and sparse re-edit', 'native/package/readback', 'repair-free Office SaveCopyAs/reopen', 'visual renders', 'fresh public lifecycle', 'no private leakage'], interpretation: 'The foundation text fill row is bound to the independently proven text-fill transparency carrier. The public proof supplies explicit reset and sparse re-edit readback for both plain text and WordArt.', universalFormalClosure: formal ? '19/2258' : '18/2258' }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-text-fill-row-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, catalogRowId: row?.id, universalFormalClosure: proof.universalFormalClosure, checks }, null, 2))
if (!formal) process.exitCode = 1
