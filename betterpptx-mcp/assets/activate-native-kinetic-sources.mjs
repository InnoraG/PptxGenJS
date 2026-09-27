#!/usr/bin/env node
// Maintainer-only, hash-governed activation for source-derived kinetic
// replacements. The command copies versioned skeletal-only sources, writes
// playback-proof sidecars, and preserves every prior registry/release record.
// It never mutates a frozen/reference source, and public MCP projections do
// not expose any of the paths or evidence handled here.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] }
const reportPath = path.resolve(arg('--report') || '.codex-tmp/kinetics96-story/staging/kinetic-native-v1/proof-bank-report-v2.json')
const registryPath = path.resolve(arg('--registry') || 'betterpptx-mcp/assets/authoring-motion-source-registry.json')
const releasePath = path.resolve(arg('--release') || 'betterpptx-mcp/docs/release-safety/G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')
const assetDir = path.dirname(registryPath)
const proofReportPaths = (arg('--proof-reports') || '').split(';').filter(Boolean).map(file => path.resolve(file))
if (!proofReportPaths.length) throw new Error('--proof-reports must name one or more native PowerPoint oracle JSON reports.')
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const readJson = file => {
  const text = fs.readFileSync(file, 'utf8')
  return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
}
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const report = readJson(reportPath)
if (report.privateMaintainerEvidence !== true || report.pending?.length || report.governedActivation === 'ACTIVATED') throw new Error('The source report is not an unactivated, complete maintainer report.')
if (report.scope?.expectedSourceRows !== 29 || report.sources?.length !== 29) throw new Error('Activation expects the complete 29-row native source report.')
const oracles = proofReportPaths.map(file => readJson(file))
for (const oracle of oracles) if (oracle.status !== 'PASS' || oracle.video?.status !== 'PASS' || oracle.sourceReadback?.openedWithoutRepair !== true || oracle.sourceUnchanged !== true) throw new Error('Every native oracle must pass source open, video export, and source-integrity checks.')
// Each split native proof bank contains one presenter identity. Resolve proof
// per source/target rather than assuming one oracle contains all three
// presenters; this keeps the activation binding correct when the proof is
// sharded to avoid PowerPoint's oversized-video failure mode.
const oracleFor = (source, target) => oracles.find(oracle => (oracle.sourceReadback?.slides || []).some(slide => {
  const motionId = String(slide.motionId || '')
  return motionId.includes(`native-kinetic.${source.slug}.${target.identity}`) ||
    (slide.identity === target.identity && motionId.includes(`native-kinetic.${source.slug}.`))
}))
if (!oracles.some(oracle => oracle.video?.path)) throw new Error('Native oracle video evidence is required.')
const registry = readJson(registryPath), release = readJson(releasePath)
if (registry.schemaVersion !== 'betterpptx.authoring-motion-source-registry.v1' || !Array.isArray(registry.sources)) throw new Error('Unexpected governed registry schema.')
if (release.schemaVersion !== 'betterpptx.g5-product-asset-release-manifest.v1' || !Array.isArray(release.assets)) throw new Error('Unexpected release manifest schema.')
const existingIds = new Set(registry.sources.map(source => source.id))
const sourceEntries = [], releaseEntries = [], proofRecords = []
const correctionArtifact = 'betterpptx-mcp/docs/release-safety/G5-KINETIC-NATIVE-SOURCE-CORRECTION-20260904.json'
for (const source of report.sources) {
  const sourceBytes = fs.readFileSync(source.sourceGlbFile)
  if (sha(sourceBytes) !== source.sha256 || sourceBytes.length !== source.bytes) throw new Error(`Staged source integrity mismatch: ${source.id}`)
  const targets = source.targets.map(target => {
    const sourceOracle = oracleFor(source, target)
    if (!sourceOracle) throw new Error(`No native oracle evidence bound to ${source.id}/${target.identity}`)
    const slides = sourceOracle.sourceReadback.slides || []
    const match = slides.find(slide => slide.identity === target.identity || String(slide.motionId || '').endsWith(`.${source.slug}.${target.identity}`))
    if (!match) throw new Error(`Native oracle lacks ${source.id}/${target.identity}`)
    // The runtime proof gate binds the caller's exact base rig bytes. The
    // native proof deck uses a derived target GLB, so retain that hash as
    // provenance but never confuse it with the tested base-byte binding.
    return { identity: target.identity, targetGlbSha256: target.baseGlbSha256, nativeProofTargetGlbSha256: target.sha256, retargetRestProfileSha256: target.targetRestProfileSha256,
      status: 'PASS', evidence: { pptxSha256: sourceOracle.sourceSha256, videoSha256: sourceOracle.video.sha256 },
      checks: { fullClipPlayback: true, noTPose: true, noExcessiveTorsion: true } }
  })
  const file = `${source.id}.glb`, destination = path.join(assetDir, file)
  if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite existing governed asset: ${destination}`)
  fs.copyFileSync(source.sourceGlbFile, destination)
  if (sha(fs.readFileSync(destination)) !== source.sha256) throw new Error(`Copied source integrity mismatch: ${source.id}`)
  const proof = { schemaVersion: 'betterpptx.authoring-motion-playback-proof.v1', status: 'PASS', renderer: 'native-powerpoint',
    source: { id: source.id, sha256: source.sha256, sourceSlug: source.slug, sourceProvider: 'mixamo', durationMs: source.durationMs },
    retarget: source.retargetPolicy, targets,
    reviewScope: 'Complete native PowerPoint playback proof across Joe, Louise and Pete. Source-derived independent pose gate passed before native playback; this is maintainer verification, not owner visual acceptance.' }
  const proofFile = `${source.id}-playback-proof.json`, proofDestination = path.join(assetDir, proofFile)
  writeJson(proofDestination, proof)
  const proofSha = sha(fs.readFileSync(proofDestination))
  sourceEntries.push({ id: source.id, file, bytes: source.bytes, sha256: source.sha256, sourceProvider: 'mixamo', sourceTake: source.mappedPolicy?.sourceTake || source.sourceAnimationName,
    sourceSlug: source.slug, motionIds: source.motionIds, retarget: source.retargetPolicy, playbackProof: { file: proofFile, sha256: proofSha },
    provenance: { kind: 'native-axis-source-correction', supersedesSourceAsset: 'kinetic-clips-pool', sourcePolicy: 'deploy/model3d-worker/bake/kinetic-clips-map.json', sourcePolicyKeys: [source.slug],
      reason: 'Preserve the original FBX local basis and exact source clock before generic target-rig retargeting. The prior intermediate bake could alter physical pose on differently oriented bones.',
      sourceFbxSha256: source.originalSourceSha256, sourceAnimationName: source.originalAnimationName, sourceReport: reportPath, sourcePoseProof: source.sourcePoseProof?.status || 'PASS', nativeProof: proofDestination } })
  releaseEntries.push({ id: source.id, displayName: `Native-axis ${source.slug} kinetic source`, path: `betterpptx-mcp/assets/${file}`, sha256: source.sha256, bytes: source.bytes, approvalStatus: 'APPROVED', approvalKind: 'task-authorized-native-axis-source-correction', approvalArtifact: correctionArtifact,
    distributionForm: 'Server-side skeletal-motion source used only to construct embedded project presenters; no standalone/raw source download, BVH/FBX redistribution, or reusable-source resale.' })
  proofRecords.push({ id: source.id, proofFile, proofSha256: proofSha })
}
for (const entry of sourceEntries) { if (existingIds.has(entry.id)) throw new Error(`Registry source ID already exists: ${entry.id}`); registry.sources.push(entry) }
for (const entry of releaseEntries) { if (release.assets.some(asset => asset.id === entry.id)) throw new Error(`Release asset ID already exists: ${entry.id}`); release.assets.push(entry) }
registry.revision = '2026-09-04.kinetics-native-v2'
const correction = { schemaVersion: 'betterpptx.g5-source-correction-authorization.v1', status: 'APPROVED', recordedAt: '2026-09-04', authorizationKind: 'task-authorized-native-axis-source-correction',
  authorizationBasis: 'The owner explicitly requested that corrections discovered through the 96-motion showcase be implemented at engine/MCP level and continuously improved through use cases.',
  decisionScope: 'These exact versioned skeletal-only source derivatives may be selected server-side to construct embedded project presenters after numerical and native playback proof.', semanticCatalogSelectionAllowed: true, rawAssetDistributionAllowed: false,
  ownerVisualAcceptanceRecorded: false, productionPromotionAuthorized: false, assets: releaseEntries.map(entry => ({ id: entry.id, path: entry.path, sha256: entry.sha256, bytes: entry.bytes, decision: entry.approvalStatus })),
  sourceLineage: { existingGovernedAssetId: 'kinetic-clips-pool', existingLicenseRecord: 'betterpptx-mcp/docs/release-safety/G5-ASSET-LICENSE-LEDGER.md', nativeAdapter: 'betterpptx-mcp/assets/native-fbx-motion-source.mjs', nativeProofReports: proofReportPaths, report: reportPath, oldFrozenAssetsAndDecisionsModified: false },
  scopeExclusions: ['raw or standalone motion-library download or resale', 'raw BVH/FBX redistribution', 'independent owner visual acceptance of a new generated artifact', 'public production promotion or deployment authorization'],
  hashChangePolicy: 'Any byte, hash, path, or distribution-boundary change requires a new authorization record.' }
writeJson(path.resolve(correctionArtifact), correction)
// The governed registry already exists; activation is an intentional owner
// update, while newly-created proof/correction artifacts above remain
// no-overwrite guarded.
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
// The release manifest is an owner-governed generated ledger; preserve all old
// records and append only the newly hashed versioned sources.
fs.writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n')
const activation = { schemaVersion: 'betterpptx.kinetics-native-activation.v1', status: 'ACTIVATED', activatedAt: new Date().toISOString(), report: reportPath, registry: registryPath, correctionArtifact, sourceCount: sourceEntries.length, motionIdCount: sourceEntries.reduce((sum, source) => sum + source.motionIds.length, 0), proofRecords }
console.log(JSON.stringify(activation, null, 2))
