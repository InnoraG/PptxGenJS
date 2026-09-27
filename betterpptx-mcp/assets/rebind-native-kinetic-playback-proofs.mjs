#!/usr/bin/env node
// Maintainer-only repair for the first native-kinetic activation. The initial
// activation recorded the derived proof-deck GLB hash as targetGlbSha256. The
// runtime contract intentionally binds the caller's exact base presenter GLB;
// this command rebinds the sidecars to that base hash while retaining the
// derived proof-deck hash as private provenance. Source bytes are not changed.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] }
const reportPath = path.resolve(arg('--report') || '.codex-tmp/kinetics96-story/staging/kinetic-native-v1/proof-bank-report-v2.json')
const registryPath = path.resolve(arg('--registry') || 'betterpptx-mcp/assets/authoring-motion-source-registry.json')
const releasePath = path.resolve(arg('--release') || 'betterpptx-mcp/docs/release-safety/G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')
const correctionPath = path.resolve(arg('--correction') || 'betterpptx-mcp/docs/release-safety/G5-KINETIC-NATIVE-PROOF-REBIND-20260904.json')
const assetDir = path.dirname(registryPath)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const readJson = file => {
  const text = fs.readFileSync(file, 'utf8')
  return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
}
const writeNewJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const sourceReport = readJson(reportPath)
const registry = readJson(registryPath)
const release = readJson(releasePath)
if (sourceReport.privateMaintainerEvidence !== true || sourceReport.sources?.length !== 29 || sourceReport.pending?.length) throw new Error('Expected the complete, unactivated native v2 source report.')
if (registry.schemaVersion !== 'betterpptx.authoring-motion-source-registry.v1' || !Array.isArray(registry.sources)) throw new Error('Unexpected governed registry schema.')
if (release.schemaVersion !== 'betterpptx.g5-product-asset-release-manifest.v1' || !Array.isArray(release.assets)) throw new Error('Unexpected release manifest schema.')
if (fs.existsSync(correctionPath)) throw new Error(`Refusing to overwrite correction record: ${correctionPath}`)

const sourceById = new Map(sourceReport.sources.map(source => [source.id, source]))
const changes = []
for (const sourceEntry of registry.sources.filter(source => sourceById.has(source.id))) {
  const source = sourceById.get(sourceEntry.id)
  const sourcePath = path.join(assetDir, sourceEntry.file)
  const sourceBytes = fs.readFileSync(sourcePath)
  if (sha256(sourceBytes) !== sourceEntry.sha256 || sourceEntry.sha256 !== source.sha256 || sourceBytes.length !== source.bytes) throw new Error(`Source bytes changed before proof rebind: ${sourceEntry.id}`)
  const proofRef = sourceEntry.playbackProof
  if (!proofRef?.file || !/^[a-z0-9][a-z0-9._-]*\.json$/.test(proofRef.file)) throw new Error(`Missing playback proof reference: ${sourceEntry.id}`)
  const proofPath = path.join(assetDir, proofRef.file)
  const proof = readJson(proofPath)
  const targetsByIdentity = new Map(source.targets.map(target => [target.identity, target]))
  if (proof.status !== 'PASS' || proof.source?.id !== source.id || proof.targets?.length !== source.targets.length) throw new Error(`Unexpected proof shape: ${sourceEntry.id}`)
  const fixedTargets = proof.targets.map(target => {
    const staged = targetsByIdentity.get(target.identity)
    if (!staged || !/^[a-f0-9]{64}$/.test(staged.baseGlbSha256) || !/^[a-f0-9]{64}$/.test(staged.sha256)) throw new Error(`Missing staged base/derived target hashes: ${sourceEntry.id}/${target.identity}`)
    return { ...target, targetGlbSha256: staged.baseGlbSha256, nativeProofTargetGlbSha256: staged.sha256 }
  })
  if (new Set(fixedTargets.map(target => target.identity)).size !== source.targets.length) throw new Error(`Duplicate proof identities: ${sourceEntry.id}`)
  const fixedProof = {
    ...proof,
    targets: fixedTargets,
    bindingCorrection: {
      kind: 'base-presenter-glb-binding',
      recordedAt: '2026-09-04',
      reason: 'The runtime proof contract checks the exact caller base presenter bytes; the native proof-deck GLB remains provenance only.',
      sourceBytesUnchanged: true,
      correctionArtifact: 'betterpptx-mcp/docs/release-safety/G5-KINETIC-NATIVE-PROOF-REBIND-20260904.json',
    },
  }
  const proofBytes = Buffer.from(JSON.stringify(fixedProof, null, 2) + '\n')
  changes.push({ sourceEntry, source, proofPath, oldProofSha256: proofRef.sha256, fixedProof, proofBytes, proofSha256: sha256(proofBytes) })
}
if (changes.length !== 29) throw new Error(`Expected 29 proof rebinds, found ${changes.length}.`)

const correction = {
  schemaVersion: 'betterpptx.g5-source-correction-authorization.v1',
  status: 'APPROVED',
  recordedAt: '2026-09-04',
  authorizationKind: 'task-authorized-proof-binding-correction',
  authorizationBasis: 'The owner explicitly requested that corrections discovered through the 96-motion showcase be implemented at engine/MCP level and continuously improved through use cases.',
  decisionScope: 'The exact existing 29 native-axis source bytes remain selectable server-side. This record authorizes only the proof-sidecar binding correction from derived proof-deck hashes to tested base presenter GLB hashes.',
  semanticCatalogSelectionAllowed: true,
  rawAssetDistributionAllowed: false,
  ownerVisualAcceptanceRecorded: false,
  productionPromotionAuthorized: false,
  sourceBytesUnchanged: true,
  assets: changes.map(change => ({
    id: change.sourceEntry.id,
    path: `betterpptx-mcp/assets/${change.sourceEntry.file}`,
    sha256: change.sourceEntry.sha256,
    bytes: change.sourceEntry.bytes,
    proofFile: change.sourceEntry.playbackProof.file,
    priorProofSha256: change.oldProofSha256,
    correctedProofSha256: change.proofSha256,
    decision: 'APPROVED',
    distributionBoundary: 'Server-side skeletal-motion source used only to construct embedded project presenters; no standalone/raw library download, BVH/FBX redistribution, or reusable-source resale.',
  })),
  sourceLineage: {
    privateRegistry: 'betterpptx-mcp/assets/authoring-motion-source-registry.json',
    nativeSourceReport: reportPath,
    priorCorrectionArtifact: 'betterpptx-mcp/docs/release-safety/G5-KINETIC-NATIVE-SOURCE-CORRECTION-20260904.json',
    correction: 'Rebind playback proofs to exact tested base presenter bytes; preserve each native proof-deck GLB hash as private evidence. No source, target, or frozen/reference bytes were replaced.',
    oldFrozenAssetsAndDecisionsModified: false,
  },
  scopeExclusions: ['raw or standalone motion-library download or resale', 'raw BVH/FBX redistribution', 'independent owner visual acceptance of a new generated artifact', 'public production promotion or deployment authorization'],
  hashChangePolicy: 'Any byte, hash, path, or distribution-boundary change requires a new authorization record.',
}

// All validation is complete before any governed bytes are written.
writeNewJson(correctionPath, correction)
for (const change of changes) {
  fs.writeFileSync(change.proofPath, change.proofBytes)
  change.sourceEntry.playbackProof.sha256 = change.proofSha256
  change.sourceEntry.provenance = { ...change.sourceEntry.provenance, proofBindingCorrectionArtifact: correctionPath }
  const approval = release.assets.find(asset => asset.id === change.sourceEntry.id)
  if (!approval) throw new Error(`Missing release asset approval: ${change.sourceEntry.id}`)
  approval.approvalArtifact = 'betterpptx-mcp/docs/release-safety/G5-KINETIC-NATIVE-PROOF-REBIND-20260904.json'
}
registry.revision = '2026-09-04.kinetics-native-v2.1'
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
fs.writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n')
console.log(JSON.stringify({ schemaVersion: 'betterpptx.kinetics-native-proof-rebind.v1', status: 'PASS', sourceCount: changes.length, sourceBytesUnchanged: true, registryRevision: registry.revision, correctionPath, proofSha256: changes.map(change => ({ id: change.sourceEntry.id, sha256: change.proofSha256 })) }, null, 2))
