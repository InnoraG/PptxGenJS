import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrix = read('betterpptx-mcp/preset-decomposition-matrix.json')
const nativeRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-framing-native/20260824T204700Z/image-framing-native-proof.json'
const publicRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/image-framing-public/20260824T204518Z/image-framing-public-proof-v1.json'
const officeRel = 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-office-picture-crop-mutation/20260826164603Z/g6-office-picture-crop-mutation-proof.json'
const row = matrix.catalogRows.find(item => item.id === 'cap_b39ba8fc1a63b00cb72e')
const native = read(nativeRel), pub = read(publicRel), office = read(officeRel)
if (!row || row.family !== 'media-images-avatar' || row.label !== 'crop') throw new Error('frozen media crop row identity changed')
const checks = {
  frozenRowIdentity: row.capabilityMode === 'preset-plus-parameters' && row.capabilityStatus === 'structured-partial',
  typedNativeContract: native.status === 'PASS' && native.contract?.surface === 'imageFraming' && native.contract?.parameter === 'framingMode' && native.contract?.values?.length === 3,
  nativePackageVisual: native.packageCorpus?.failures === 0 && native.office?.powerPointReopen === true && native.office?.repairFree === true && native.visual?.renderedSlides === 3 && native.visual?.distinctRenderHashes === true,
  publicFreshLifecycle: pub.status === 'PASS' && pub.roleA?.freshSession === true && Object.values(pub.checks || {}).every(Boolean) && (pub.privateLeakMatches || []).length === 0,
  officeAuthoredMutation: office.status === 'PASS' && office.checks?.officeAuthoredSetter === true && office.checks?.saveCopyAsReopen === true && office.checks?.retainedCropLeft === true && office.checks?.renderedFiveNonEmpty === true,
  deterministicEditability: office.checks?.officeAuthoredSetter === true && office.checks?.retainedCropLeft === true
}
const formallyClosed = Object.values(checks).every(Boolean)
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-proof.v1', status: formallyClosed ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', formalClosure: { catalogRowId: row.id, family: row.family, label: row.label, formallyClosed, contribution: formallyClosed ? '1/2258' : '0/2258' }, checks, witness: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status }, officeMutation: { path: officeRel, sha256: sha(officeRel), status: office.status } }, retainedCapabilities: ['semantic contain/cover/crop framing', 'native srcRect/stretch/fillRect serialization', 'reset/re-edit/readback', 'Office PictureFormat.CropLeft mutation', 'SaveCopyAs/reopen', 'visual renders', 'fresh public lifecycle', 'no private leakage'], interpretation: 'The media-images-avatar crop row is formally closed by independent native, public, and direct Office crop witnesses. Transparency remains a separate row and is not promoted by this proof.', universalFormalClosure: formallyClosed ? '9/2258' : '8/2258' }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-media-crop-row-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, catalogRowId: row.id, formallyClosed, universalFormalClosure: proof.universalFormalClosure, checks }, null, 2))
if (!formallyClosed) process.exitCode = 1
