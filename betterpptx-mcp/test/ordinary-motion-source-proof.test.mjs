import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'

import { createGovernedAuthoringMotionSourceResolver, governedMotionRestProfileSha256, normalizeGovernedMotionRetargetPolicy } from '../assets/authoring-motion-sources.mjs'
import { resolveGovernedCatalogSources } from '../ir/authoring-motion-catalog.mjs'
import { extractRetargetRestProfile, parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const clone = value => JSON.parse(JSON.stringify(value))
const ordinaryId = 'motion.ordinary.talk'
const policy = { rotationRetargetSpace: 'global', channelPolicy: 'rotation-only', boneNamePolicy: 'mixamo-suffix' }
const worldRootPolicy = { rotationRetargetSpace: 'global', channelPolicy: 'root-motion', boneNamePolicy: 'mixamo-suffix', rootMotionSpace: 'world', rootMotionAnchor: 'start', rootMotionMaxStatures: .35, rootMotionMaxHorizontalStatures: .5 }
// The maintained snapshot may already include valid governed replacements.
// Isolated proof fixtures must start from its restored fallback state, not
// assume the live snapshot still withholds the historical Enumerate source.
const canonicalCatalog = resolveGovernedCatalogSources(
  JSON.parse(fs.readFileSync(new URL('../deploy/model3d-worker/canonical/authoring-motion-catalog.json', import.meta.url))),
  { fingerprint: 'isolated-unresolved-fixture', sources: [] },
)

function clipFixture({ nodes, name = 'talk', start = 0, rawTrs = false } = {}) {
  nodes ||= [{ name: 'mixamorig:Hips', translation: [0, 1, 0], rotation: [0, 0, 0, 1], children: [1] }, { name: 'mixamorig:RightHandIndex1', translation: [0, .1, 0], rotation: [0, 0, 0, 1] }]
  const times = Buffer.alloc(8), rotations = Buffer.alloc(32), vectors = Buffer.alloc(24)
  times.writeFloatLE(start, 0); times.writeFloatLE(2, 4)
  rotations.writeFloatLE(1, 12); rotations.writeFloatLE(Math.sin(.08), 24); rotations.writeFloatLE(Math.cos(.08), 28)
  const bin = Buffer.concat([times, rotations, vectors])
  const channels = []
  for (const [node, value] of nodes.entries()) if (/^mixamorig\d*:/.test(value.name || '')) {
    channels.push({ sampler: 0, target: { node, path: 'rotation' } })
    if (rawTrs) for (const motionPath of ['translation', 'scale']) channels.push({ sampler: 1, target: { node, path: motionPath } })
  }
  return serializeGlb({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes,
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 32 }, { buffer: 0, byteOffset: 40, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 2 }, { bufferView: 1, componentType: 5126, type: 'VEC4', count: 2 }, { bufferView: 2, componentType: 5126, type: 'VEC3', count: 2 }],
    animations: [{ name, samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }, { input: 0, output: 2, interpolation: 'LINEAR' }], channels }],
  }, bin)
}

// These are fabricated isolated test evidence records, never production proof.
function fixture({ sourceBuffer = clipFixture(), targetBuffer = clipFixture(), restProfile = extractRetargetRestProfile(targetBuffer), motionIds = [ordinaryId], withProof = true, retarget = policy } = {}) {
  const files = new Map(), reads = []
  const source = { id: 'ordinary-proof-fixture-v1', file: 'ordinary-proof-fixture-v1.glb', sha256: hash(sourceBuffer), bytes: sourceBuffer.length, sourceSlug: 'talk', sourceProvider: 'mixamo', motionIds, retarget: clone(retarget) }
  const proof = {
    schemaVersion: 'betterpptx.authoring-motion-playback-proof.v1', status: 'PASS', renderer: 'native-powerpoint',
    source: { id: source.id, sha256: source.sha256, sourceSlug: source.sourceSlug, sourceProvider: source.sourceProvider, durationMs: 2000 },
    retarget: normalizeGovernedMotionRetargetPolicy(source.retarget),
    targets: [{ identity: 'fixture', targetGlbSha256: hash(targetBuffer), retargetRestProfileSha256: governedMotionRestProfileSha256(restProfile), status: 'PASS', evidence: { pptxSha256: 'a'.repeat(64), videoSha256: 'b'.repeat(64) }, checks: { fullClipPlayback: true, noTPose: true, noExcessiveTorsion: true } }],
  }
  const ledger = { schemaVersion: 'betterpptx.authoring-motion-source-registry.v1', revision: 'fixture-1', sources: [source] }
  const release = { assets: [{ id: source.id, approvalStatus: 'APPROVED', path: `betterpptx-mcp/assets/${source.file}`, sha256: source.sha256, bytes: source.bytes }] }
  const assetPath = name => path.join('proof-fixture-assets', name)
  function publish() { files.set('proof-fixture-registry.json', Buffer.from(JSON.stringify(ledger))); files.set('proof-fixture-release.json', Buffer.from(JSON.stringify(release))) }
  function publishProof({ repin = true } = {}) {
    const bytes = Buffer.from(JSON.stringify(proof))
    files.set(assetPath('proof.json'), bytes)
    if (repin) source.playbackProof = { file: 'proof.json', sha256: hash(bytes) }
    publish()
  }
  files.set(assetPath(source.file), Buffer.from(sourceBuffer))
  if (withProof) publishProof()
  else publish()
  const resolver = createGovernedAuthoringMotionSourceResolver({ assetsDirectory: 'proof-fixture-assets', registryFile: 'proof-fixture-registry.json', releaseFile: 'proof-fixture-release.json', readFile: file => { reads.push(file); if (!files.has(file)) throw new Error('private fixture location must not leak'); return Buffer.from(files.get(file)) } })
  return { files, reads, assetPath, source, proof, ledger, release, publish, publishProof, resolver, targetBuffer, restProfile, options: { targetGlbBuffer: targetBuffer, retargetRestProfile: restProfile } }
}

function rejectsOpaque(run) {
  assert.throws(run, error => error.code === 'AUTHORING_MOTION_SOURCE_INVALID' && !/\.glb|\.json|fixture|assets|sha256|retarget|filesystem|Mixamo|PowerPoint/.test(error.message))
}

test('proof helpers are canonical and bind the optional namespace policy', () => {
  assert.equal(governedMotionRestProfileSha256({ z: [3, { b: 2, a: 1 }], a: 0 }), governedMotionRestProfileSha256({ a: 0, z: [3, { a: 1, b: 2 }] }))
  assert.notEqual(governedMotionRestProfileSha256({ joints: [1, 2] }), governedMotionRestProfileSha256({ joints: [2, 1] }))
  assert.equal(normalizeGovernedMotionRetargetPolicy({ channelPolicy: 'rotation-only', rotationRetargetSpace: 'global' }).boneNamePolicy, 'exact')
  assert.equal(normalizeGovernedMotionRetargetPolicy(policy).boneNamePolicy, 'mixamo-suffix')
  assert.equal(normalizeGovernedMotionRetargetPolicy({ channelPolicy: 'rotation-only', rotationRetargetSpace: 'world-delta', rotationReference: 'first-frame' }).rotationReference, 'first-frame')
  rejectsOpaque(() => normalizeGovernedMotionRetargetPolicy({ channelPolicy: 'rotation-only', rotationRetargetSpace: 'global', rotationReference: 'first-frame' }))
  rejectsOpaque(() => normalizeGovernedMotionRetargetPolicy({ ...policy, library: 'arbitrary' }))
})

test('a release-approved ordinary replacement is withheld without actual hash-bound proof', () => {
  const item = fixture({ withProof: false, motionIds: [ordinaryId, 'motion.ordinary.enumerate'] })
  const sources = item.resolver.sources()
  assert.equal(sources.sources[0].playbackValidation.status, 'MISSING')
  rejectsOpaque(() => item.resolver.selection(ordinaryId, item.options))
  const catalog = resolveGovernedCatalogSources(canonicalCatalog, sources)
  for (const id of item.source.motionIds) assert.equal(catalog.records.find(row => row.motionId === id).selectable, false)
  const held = catalog.records.find(row => row.motionId === 'motion.ordinary.enumerate')
  assert.deepEqual(held.privateEvidence.playbackHold, canonicalCatalog.records.find(row => row.motionId === held.motionId).privateEvidence.playbackHold)
  assert.equal(held.privateEvidence.playbackHoldSupersededBy, undefined)
})

test('valid proof supersedes only the specific historical hold and recomputes actual inventory/fingerprints', () => {
  const item = fixture({ motionIds: [ordinaryId, 'motion.ordinary.enumerate'] })
  const sources = item.resolver.sources(), catalog = resolveGovernedCatalogSources(canonicalCatalog, sources)
  const row = catalog.records.find(row => row.motionId === 'motion.ordinary.enumerate')
  assert.equal(row.selectable, true)
  assert.equal(row.behavior.durationMs, 2000)
  assert.equal(row.privateEvidence.sourceProvider, 'mixamo')
  assert.deepEqual(row.privateEvidence.playbackHold, canonicalCatalog.records.find(record => record.motionId === row.motionId).privateEvidence.playbackHold)
  assert.equal(row.privateEvidence.playbackHoldSupersededBy.playbackProofSha256, item.source.playbackProof.sha256)
  assert.equal(catalog.inventory.selectable, catalog.records.filter(row => row.selectable).length)
  assert.equal(catalog.inventory.notSelectable, catalog.records.filter(row => !row.selectable).length)
  assert.equal(catalog.inventory.selectable, canonicalCatalog.inventory.selectable + 1)
  assert.notEqual(catalog.catalogFingerprint, canonicalCatalog.catalogFingerprint)
  assert.deepEqual(resolveGovernedCatalogSources(catalog, sources), catalog, 'a frozen effective snapshot reapplies the current proof idempotently')
  const removed = resolveGovernedCatalogSources(catalog, { fingerprint: 'removed-source', sources: [] })
  const removedRow = removed.records.find(record => record.motionId === row.motionId)
  assert.equal(removedRow.selectable, false, 'removing a source restores the hold even from a previously frozen proven snapshot')
  assert.equal(removedRow.behavior.durationMs, undefined)
  assert.equal(removedRow.privateEvidence.playbackHoldSupersededBy, undefined)
  assert.equal(removed.inventory.selectable, canonicalCatalog.inventory.selectable)
  assert.equal(removed.catalogFingerprint, canonicalCatalog.catalogFingerprint)
  const laterHold = clone(canonicalCatalog)
  laterHold.records.find(record => record.motionId === row.motionId).privateEvidence.playbackHold.observedAt = '2099-01-01'
  assert.equal(resolveGovernedCatalogSources(laterHold, sources).records.find(record => record.motionId === row.motionId).selectable, false)
  const before = sources.fingerprint
  item.proof.targets[0].evidence.videoSha256 = 'c'.repeat(64); item.publishProof()
  assert.notEqual(item.resolver.sources().fingerprint, before, 'a newly pinned review changes the source/proof cache basis')
})

for (const [label, mutate] of [
  ['source id', item => { item.proof.source.id = 'wrong-source' }],
  ['donor SHA', item => { item.proof.source.sha256 = '0'.repeat(64) }],
  ['source slug', item => { item.proof.source.sourceSlug = 'wrong-clip' }],
  ['duration', item => { item.proof.source.durationMs++ }],
  ['provider', item => { item.proof.source.sourceProvider = 'nvidia-kimodo' }],
  ['retarget policy', item => { item.proof.retarget.boneNamePolicy = 'exact' }],
  ['renderer', item => { item.proof.renderer = 'poster-only' }],
  ['status', item => { item.proof.status = 'PENDING' }],
  ['target status', item => { item.proof.targets[0].status = 'FAIL' }],
  ['full playback', item => { item.proof.targets[0].checks.fullClipPlayback = false }],
  ['T-pose check', item => { item.proof.targets[0].checks.noTPose = false }],
  ['torsion check', item => { item.proof.targets[0].checks.noExcessiveTorsion = false }],
  ['evidence hash', item => { item.proof.targets[0].evidence.videoSha256 = 'not-a-hash' }],
  ['duplicate target', item => { item.proof.targets.push(clone(item.proof.targets[0])) }],
]) test(`a mismatched ${label} cannot authorize an ordinary replacement`, () => {
  const item = fixture(); mutate(item); item.publishProof()
  assert.equal(item.resolver.sources().sources[0].playbackValidation.status, 'INVALID')
  rejectsOpaque(() => item.resolver.selection(ordinaryId, item.options))
})

test('raw native TRS is retained in donor bytes while only the zero-based rotation clock is governed', () => {
  const donor = clipFixture({ rawTrs: true }), item = fixture({ sourceBuffer: donor })
  assert.equal(parseGlb(donor).json.animations[0].channels.length, 6)
  const selection = item.resolver.selection(ordinaryId, item.options)
  assert.ok(selection.library.equals(donor))
  assert.equal(selection.durationMs, 2000)
  assert.equal(selection.channelPolicy, 'rotation-only')
  const positiveOrigin = fixture({ sourceBuffer: clipFixture({ start: 1 / 30, rawTrs: true }) })
  assert.equal(positiveOrigin.resolver.sources().sources[0].playbackValidation.status, 'INVALID')
  rejectsOpaque(() => positiveOrigin.resolver.selection(ordinaryId, positiveOrigin.options))
})

test('ordinary world-root proof binds the explicit start anchor and finite motion limits', () => {
  const item = fixture({ sourceBuffer: clipFixture({ rawTrs: true }), retarget: worldRootPolicy })
  const selection = item.resolver.selection(ordinaryId, item.options)
  assert.equal(selection.channelPolicy, 'root-motion')
  assert.equal(selection.rootMotionSpace, 'world')
  assert.equal(selection.rootMotionAnchor, 'start')
  assert.equal(selection.rootMotionMaxStatures, .35)
  assert.equal(selection.rootMotionMaxHorizontalStatures, .5)
  item.proof.retarget.rootMotionSpace = 'local'; item.publishProof()
  assert.equal(item.resolver.sources().sources[0].playbackValidation.status, 'INVALID')
  rejectsOpaque(() => item.resolver.selection(ordinaryId, item.options))
  for (const change of [{ rootMotionSpace: 'local' }, { rootMotionAnchor: 'end' }, { rootMotionMaxStatures: Infinity }, { rootMotionMaxHorizontalStatures: -1 }]) {
    const invalid = fixture({ retarget: worldRootPolicy })
    Object.assign(invalid.source.retarget, change); invalid.publish()
    rejectsOpaque(() => invalid.resolver.sources())
  }
})

test('proof authorizes exact tested base bytes and construction-rest profile, not a claimed identity', () => {
  const item = fixture()
  assert.equal(item.resolver.selection(ordinaryId, item.options).playbackProofSha256, item.source.playbackProof.sha256)
  rejectsOpaque(() => item.resolver.selection(ordinaryId))
  rejectsOpaque(() => item.resolver.selection(ordinaryId, { ...item.options, targetGlbBuffer: Buffer.concat([item.targetBuffer, Buffer.from([0])]) }))
  rejectsOpaque(() => item.resolver.selection(ordinaryId, { ...item.options, retargetRestProfile: { ...item.restProfile, additionalField: true } }))
})

test('source/proof bytes and release approval are rechecked after a warm resolution', () => {
  for (const tamper of ['donor', 'proof', 'release']) {
    const item = fixture(), snapshot = item.resolver.sources()
    item.resolver.selection(ordinaryId, item.options)
    item.resolver.selection(ordinaryId, item.options)
    assert.ok(item.reads.filter(file => file === item.assetPath(item.source.file)).length >= 2)
    if (tamper === 'donor') item.files.set(item.assetPath(item.source.file), Buffer.concat([item.files.get(item.assetPath(item.source.file)), Buffer.from([0])]))
    if (tamper === 'proof') item.files.set(item.assetPath('proof.json'), Buffer.concat([item.files.get(item.assetPath('proof.json')), Buffer.from(' ')]))
    if (tamper === 'release') { item.release.assets[0].approvalStatus = 'REVOKED'; item.publish() }
    rejectsOpaque(() => item.resolver.selection(ordinaryId, { ...item.options, expectedSourceFingerprint: snapshot.fingerprint }))
  }
  const item = fixture(), before = item.resolver.sources().fingerprint
  item.ledger.revision = 'fixture-2'; item.publish()
  assert.notEqual(item.resolver.sources().fingerprint, before)
})

test('proofless existing non-ordinary sources retain their exact selection policy', () => {
  const motionId = 'motion.kinetic.superhero-landing', item = fixture({ motionIds: [motionId], withProof: false })
  item.source.retarget = { rotationRetargetSpace: 'global', channelPolicy: 'root-motion', rootMotionAnchor: 'end', rootMotionMaxStatures: .35, rootMotionMaxHorizontalStatures: .5 }
  item.publish()
  const selected = item.resolver.selection(motionId)
  assert.equal(selected.boneNamePolicy, 'exact')
  assert.equal(selected.rootMotionAnchor, 'end')
  assert.equal(selected.rootMotionMaxStatures, .35)
  assert.equal(selected.playbackProofSha256, undefined)
  assert.equal(item.resolver.selection('motion.ordinary.walk'), null)
})

test('world-delta interaction fixtures still require matching native proof and bind the exact rotation policy', () => {
  const motionId = 'motion.interaction.agree-nod', retarget = { rotationRetargetSpace: 'world-delta', channelPolicy: 'rotation-only', boneNamePolicy: 'exact' }
  const missing = fixture({ motionIds: [motionId], retarget, withProof: false })
  assert.equal(missing.resolver.sources().sources[0].playbackValidation.status, 'MISSING')
  rejectsOpaque(() => missing.resolver.selection(motionId, missing.options))
  assert.equal(resolveGovernedCatalogSources(canonicalCatalog, missing.resolver.sources()).records.find(row => row.motionId === motionId).selectable, false)
  const valid = fixture({ motionIds: [motionId], retarget })
  assert.equal(valid.resolver.selection(motionId, valid.options).rotationRetargetSpace, 'world-delta')
  valid.proof.retarget.rotationRetargetSpace = 'global'; valid.publishProof()
  assert.equal(valid.resolver.sources().sources[0].playbackValidation.status, 'INVALID')
  rejectsOpaque(() => valid.resolver.selection(motionId, valid.options))
  for (const filter of [{ includeBones: ['mixamorig:Hips'] }, { excludeBones: ['mixamorig:Hips'] }]) rejectsOpaque(() => normalizeGovernedMotionRetargetPolicy({ ...retarget, ...filter }))
})

for (const [retarget, motionId] of [[policy, ordinaryId], [worldRootPolicy, ordinaryId], [{ rotationRetargetSpace: 'world-delta', channelPolicy: 'rotation-only', boneNamePolicy: 'mixamo-suffix' }, 'motion.interaction.agree-nod']]) test(`actual ${retarget.rotationRetargetSpace}/${retarget.channelPolicy} materializer maps mixed joint names and revalidates proof before its warm cache hit`, async () => {
  const targetBuffer = fs.readFileSync(new URL('../assets/default-presenter-louise.glb', import.meta.url))
  const restBuffer = fs.readFileSync(new URL('../assets/presenter-source-louise-static.glb', import.meta.url))
  const nodes = clone(parseGlb(restBuffer).json.nodes).map(node => { delete node.mesh; delete node.skin; if (node.name) node.name = node.name.replace(/^mixamorig\d*:/, 'mixamorig:'); return node })
  const sourceBuffer = clipFixture({ nodes, rawTrs: true }), restProfile = extractRetargetRestProfile(restBuffer)
  const item = fixture({ sourceBuffer, targetBuffer, restProfile, retarget, motionIds: [motionId] })
  let freezeSelection = false, lastSelection
  const runtime = {
    resolver: item.resolver, governedMotionRestProfileSha256,
    resolve(ids) {
      if (freezeSelection) return lastSelection
      lastSelection = runtime.catalogResolver(ids)
      return lastSelection
    },
  }
  const key = `__motionProofFixture_${randomUUID()}`, prefix = `motion-proof-fixture:${key}/`
  const providerUrl = new URL(`../assets/model3d-gen-providers.mjs?proof-fixture=${key}`, import.meta.url).href
  const catalogUrl = new URL(`../ir/authoring-motion-catalog.mjs?proof-fixture=${key}`, import.meta.url).href
  globalThis[key] = runtime
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === providerUrl && specifier === './authoring-motion-sources.mjs') return { url: `${prefix}source`, shortCircuit: true }
      if (context.parentURL === providerUrl && specifier === '../ir/authoring-motion-catalog.mjs') return { url: `${prefix}catalog`, shortCircuit: true }
      if (context.parentURL === catalogUrl && specifier === '../assets/authoring-motion-sources.mjs') return { url: `${prefix}source`, shortCircuit: true }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      if (url.startsWith(prefix)) return { format: 'module', shortCircuit: true, source: `const runtime = globalThis[${JSON.stringify(key)}]; ${url.endsWith('/source') ? 'export const governedAuthoringMotionSelection = (...args) => runtime.resolver.selection(...args); export const governedAuthoringMotionSources = () => runtime.resolver.sources(); export const governedMotionRestProfileSha256 = runtime.governedMotionRestProfileSha256; export const isMotionSourceProviderActive = provider => provider === \'mixamo\'; export const motionSourceProviderPolicy = () => ({ version: \'fixture\', activeProviders: [\'mixamo\'], quarantinedProviders: [\'nvidia-kimodo\'], mode: \'mixamo-only\' });' : 'export const resolveAuthoringMotionSelection = ids => runtime.resolve(ids);'}` }
      return nextLoad(url, context)
    },
  })
  try {
    const catalog = await import(catalogUrl)
    runtime.catalogResolver = catalog.resolveAuthoringMotionSelection
    const publicCatalog = catalog.publicAuthoringMotionCatalog({ family: 'motion', includePlanned: true, limit: 500 })
    assert.equal(publicCatalog.motions.find(row => row.id === motionId).behavior.durationMs, 2000)
    const publicJson = JSON.stringify(publicCatalog)
    for (const privateValue of ['privateEvidence', 'sourceSlug', 'sourceProvider', 'playbackProof', 'resolvedSource', item.source.file, item.source.id, item.source.sha256, item.source.playbackProof.sha256, 'proof-fixture-assets']) assert.ok(!publicJson.includes(privateValue), `public catalog omits ${privateValue}`)
    const provider = await import(providerUrl)
    const options = { baseGlbBase64: targetBuffer.toString('base64'), baseHash: 'unchanged-caller-handle', retargetRestProfile: restProfile, selectedMotionIds: [motionId] }
    const first = provider.materializeAuthoringMotionPresenter(options), cached = provider.materializeAuthoringMotionPresenter(options)
    assert.equal(first.cached, false); assert.equal(cached.cached, true); assert.equal(cached.handle, first.handle)
    const output = provider.getCachedGeneratedRigged3d(first.hash), parsed = parseGlb(Buffer.from(output.glbBase64, 'base64')), original = parseGlb(targetBuffer)
    assert.deepEqual(parsed.json.nodes, original.json.nodes)
    assert.deepEqual(parsed.json.skins, original.json.skins)
    assert.deepEqual(parsed.json.meshes, original.json.meshes)
    const expectedRotations = parseGlb(sourceBuffer).json.animations[0].channels.filter(channel => channel.target.path === 'rotation').length
    assert.ok(expectedRotations >= 50)
    assert.equal(parsed.json.animations[0].channels.filter(channel => channel.target.path === 'rotation').length, expectedRotations)
    const nonRotations = parsed.json.animations[0].channels.filter(channel => channel.target.path !== 'rotation')
    assert.deepEqual(nonRotations.map(channel => ({ path: channel.target.path, bone: parsed.json.nodes[channel.target.node].name })), retarget.channelPolicy === 'root-motion' ? [{ path: 'translation', bone: 'mixamorig:Hips' }] : [])
    assert.equal(output.manifest.transplant[0].rootMotionSpace, retarget.channelPolicy === 'root-motion' ? 'world' : undefined, 'the explicit world-root path is executed, not silently ignored')
    assert.ok(parsed.json.animations[0].channels.some(channel => /RightHandIndex1$/.test(parsed.json.nodes[channel.target.node].name)))
    assert.equal(output.manifest.articulationConstraints, undefined)
    assert.equal(output.manifest.motionStabilization, undefined)
    assert.equal(output.manifest.retargetValidation[0].rotationRetargetSpace, retarget.rotationRetargetSpace)
    assert.equal(first.contacts[0].durationMs, 2000)
    rejectsOpaque(() => provider.materializeAuthoringMotionPresenter({ ...options, baseGlbBase64: Buffer.concat([targetBuffer, Buffer.from([0])]).toString('base64') }))
    rejectsOpaque(() => provider.materializeAuthoringMotionPresenter({ ...options, retargetRestProfile: { ...restProfile, proofMismatch: true } }))
    freezeSelection = true
    const proofBytes = item.files.get(item.assetPath('proof.json'))
    item.files.set(item.assetPath('proof.json'), Buffer.concat([proofBytes, Buffer.from(' ')]))
    rejectsOpaque(() => provider.materializeAuthoringMotionPresenter(options))
    item.files.set(item.assetPath('proof.json'), proofBytes)
    item.files.set(item.assetPath(item.source.file), Buffer.concat([sourceBuffer, Buffer.from([0])]))
    rejectsOpaque(() => provider.materializeAuthoringMotionPresenter(options))
    item.files.set(item.assetPath(item.source.file), sourceBuffer)
    freezeSelection = false
    item.proof.targets[0].evidence.videoSha256 = 'c'.repeat(64); item.publishProof()
    const newlyReviewed = provider.materializeAuthoringMotionPresenter(options)
    assert.equal(newlyReviewed.cached, false)
    assert.notEqual(newlyReviewed.handle, first.handle)
  } finally { hooks.deregister(); delete globalThis[key] }
})
