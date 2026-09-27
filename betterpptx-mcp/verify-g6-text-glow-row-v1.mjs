import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')
const matrixRel = 'betterpptx-mcp/preset-decomposition-matrix.json'
const nativeRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-glow-radius/20260824T010734Z/text-glow-radius-five-point-proof.json'
const publicRel = 'outputs/authoring-principle-corpus/global-extended-option-five-point/text-glow-radius-public/20260824T011527Z/text-glow-radius-public-proof.json'
const matrix = read(matrixRel)
const native = read(nativeRel)
const pub = read(publicRel)
const row = matrix.catalogRows.find(item => item.id === 'cap_40334e5ee6cf200090f4')
const nativeProof = native.proof || {}
const publicChecks = pub.checks || {}
const checks = {
  frozenRowIdentity: row?.family === 'foundation' && row.label === 'text glow' && row.capabilityStatus === 'executable-exact-structured',
  typedFivePointContract: native.status === 'PASS' && native.controlId === 'text.effects.glow.radiusPt' && native.checkpoints?.length === 5 && native.checkpoints[0]?.expectedRawRadius === null,
  nativePackageReadback: nativeProof.structuredSerialization === true && nativeProof.packageIntegrity === true && nativeProof.repairFreePowerPointOpen === true && nativeProof.saveCopyAsReopen === true && nativeProof.retainedNativeTextGlow === true,
  officeVisual: native.office?.status === 'PASS' && native.office.slideCount === 5 && nativeProof.visualRenders?.length === 5 && new Set(nativeProof.visualRenders).size >= 4,
  publicLifecycle: pub.status === 'PASS' && Object.values(publicChecks).every(Boolean) && publicChecks.glowCatalogExposesTypedParameters === true && (pub.privateLeakMatches || []).length === 0,
  nativeReset: native.checkpoints[0]?.value === 0 && native.checkpoints[0]?.expectedRawRadius === null,
  noPrivateLeakage: (pub.privateLeakMatches || []).length === 0
}
const formal = Object.values(checks).every(Boolean)
const proof = { schemaVersion: 'betterpptx.g6-frozen-catalog-row-proof.v1', status: formal ? 'PASS_FORMALLY_CLOSED' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', formalClosure: { catalogRowId: row?.id, family: row?.family, label: row?.label, formallyClosed: formal, contribution: formal ? '1/2258' : '0/2258' }, checks, witness: { native: { path: nativeRel, sha256: sha(nativeRel), status: native.status }, public: { path: publicRel, sha256: sha(publicRel), status: pub.status } }, retainedCapabilities: ['text glow radius continuous slider', 'five-point native serialization', 'zero/null reset', 'package integrity', 'repair-free Office SaveCopyAs/reopen', 'visual renders', 'fresh public lifecycle', 'no private leakage'], interpretation: 'The foundation text glow row is bound to the independently proven native text-glow radius carrier. The zero checkpoint is the explicit null/reset state; Office roundtrip and rendered checkpoints provide the editable visual witness.', universalFormalClosure: formal ? '18/2258' : '17/2258' }
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'g6-frozen-catalog-row', stamp)
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'g6-text-glow-row-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = sha(path.relative(root, out))
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, catalogRowId: row?.id, universalFormalClosure: proof.universalFormalClosure, checks }, null, 2))
if (!formal) process.exitCode = 1
