import { createHash } from 'node:crypto'
import { parseGlb, serializeGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'
import { matchMixamoMotionBoneNames } from './mixamo-motion-bone-names.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const rootFields = ['rootMotionSpace', 'rootMotionAnchor', 'rootMotionMaxStatures', 'rootMotionMaxHorizontalStatures']

function replacementPolicy(replacement) {
  const channelPolicy = replacement.channelPolicy || 'rotation-only'
  if (channelPolicy === 'rotation-only') {
    if (rootFields.some(field => replacement[field] !== undefined)) throw new Error('Root travel controls require an explicit root-motion replacement.')
    return { channelPolicy, rotationRetargetSpace: 'global' }
  }
  if (channelPolicy !== 'root-motion' || replacement.rootMotionSpace !== 'world' || replacement.rootMotionAnchor !== 'start'
    || !Number.isFinite(replacement.rootMotionMaxStatures) || replacement.rootMotionMaxStatures <= 0 || replacement.rootMotionMaxStatures > 4
    || !Number.isFinite(replacement.rootMotionMaxHorizontalStatures) || replacement.rootMotionMaxHorizontalStatures <= 0 || replacement.rootMotionMaxHorizontalStatures > 4) {
    throw new Error('A grounded replacement requires explicit world-space, start-anchored, bounded Hips travel.')
  }
  return { channelPolicy, rotationRetargetSpace: 'global', ...Object.fromEntries(rootFields.map(field => [field, replacement[field]])) }
}

/**
 * Replace named motions without rebuilding an approved presenter's appearance,
 * stopped posture, or other animations. Donors are retargeted directly from
 * their own rest axes using the destination's original construction profile.
 * This is a maintainer-side asset operation, not a public authoring surface.
 *
 * The existing binary is retained verbatim; only the new animation accessors
 * are appended. This deliberately does not run a geometry/texture optimizer.
 */
export function replacePresenterMotionClips(sourceBuffer, replacements, { targetRestProfile } = {}) {
  if (!targetRestProfile?.nodes || typeof targetRestProfile.nodes !== 'object') {
    throw new Error('Named motion replacement requires the original construction rest profile; the stopped display pose is not a bind pose.')
  }
  if (!Array.isArray(replacements) || replacements.length === 0) {
    throw new Error('At least one named motion replacement is required.')
  }
  const source = Buffer.from(sourceBuffer)
  const matchedDonors = replacements.map(replacement => {
    const matched = matchMixamoMotionBoneNames(replacement.library, source)
    return { ...replacement, library: matched.buffer, boneNameMatch: matched.report, policy: replacementPolicy(replacement) }
  })
  const before = parseGlb(source)
  const originalAnimations = before.json.animations || []
  const originalNames = originalAnimations.map(animation => animation.name)
  if (new Set(originalNames).size !== originalNames.length) throw new Error('The source contains ambiguous duplicate animation names.')
  const replacingNames = replacements.map(replacement => replacement.clipName)
  if (new Set(replacingNames).size !== replacingNames.length) throw new Error('A motion may only be replaced once in one revision.')
  for (const name of replacingNames) {
    if (!originalNames.includes(name)) throw new Error(`The named motion does not exist in the approved source: ${name}`)
  }
  if ((before.json.bufferViews || []).some(view => !(view.byteLength > 0))) {
    throw new Error('The source contains an invalid empty buffer view; repair it separately before a preservation-only replacement.')
  }
  const destinationNames = new Set((before.json.nodes || []).map(node => node.name).filter(Boolean))
  const donorCoverage = matchedDonors.map(replacement => {
    const donor = parseGlb(replacement.library)
    const animation = (donor.json.animations || []).find(item => item.name === replacement.sourceSlug)
    if (!animation) throw new Error(`The exact donor animation is missing: ${replacement.sourceSlug}`)
    const names = (animation.channels || []).filter(channel => channel.target?.path === 'rotation')
      .map(channel => donor.json.nodes?.[channel.target.node]?.name)
    if (!names.length || names.some(name => !name || !destinationNames.has(name))) {
      throw new Error(`Donor rotation target coverage is incomplete for ${replacement.clipName}; missing: ${names.filter(name => !name || !destinationNames.has(name)).join(', ')}`)
    }
    if (new Set(names).size !== names.length) throw new Error(`The donor contains duplicate rotation targets for ${replacement.clipName}.`)
    const rootTranslations = animation.channels.filter(channel => channel.target.path === 'translation' && donor.json.nodes[channel.target.node]?.name === 'mixamorig:Hips')
    if (replacement.policy.channelPolicy === 'root-motion' && rootTranslations.length !== 1) throw new Error(`The donor must contain exactly one Hips translation for ${replacement.clipName}.`)
    return { clipName: replacement.clipName, rotationTargets: names, count: names.length, rootTranslations: replacement.policy.channelPolicy === 'root-motion' ? 1 : 0 }
  })

  const result = transplantMotionSet(source, matchedDonors.map((replacement, index) => ({
    motionId: replacement.clipName,
    sourceSlug: replacement.sourceSlug,
    outputSlug: replacement.clipName,
    library: replacement.library,
    libraryKey: replacement.libraryKey || `replacement-${index}`,
    ...replacement.policy,
  })), {
    targetRestProfile,
    channelPolicy: 'rotation-only',
    rotationRetargetSpace: 'global',
    animationBoundaryBlendMs: 0,
  })
  const after = parseGlb(result.glb)
  if (!after.bin.subarray(0, before.bin.length).equals(before.bin)) throw new Error('Motion replacement altered existing binary data.')
  for (const key of Object.keys(before.json)) {
    if (['animations', 'accessors', 'bufferViews', 'buffers'].includes(key)) continue
    if (!same(before.json[key], after.json[key])) throw new Error(`Motion replacement altered the presenter's ${key}.`)
  }
  if (!same(before.json.accessors, after.json.accessors.slice(0, before.json.accessors.length))) throw new Error('Motion replacement altered existing accessors.')
  if (!same(before.json.bufferViews, after.json.bufferViews.slice(0, before.json.bufferViews.length))) throw new Error('Motion replacement altered existing buffer views.')
  if (result.retargetValidation.length !== replacements.length || result.retargetValidation.some(row => row.status !== 'PASS' || row.maxParityErrorDegrees > 0.01 || row.boundaryBlendMs !== 0)) {
    throw new Error('A donor failed direct, rest-aware rotation parity.')
  }
  const byName = new Map(replacements.map((replacement, index) => [replacement.clipName, {
    ...after.json.animations[index], name: replacement.clipName,
  }]))
  after.json.animations = originalAnimations.map(animation => byName.get(animation.name) || animation)
  if (!same(after.json.animations.map(animation => animation.name), originalNames)) throw new Error('Motion replacement changed clip order.')
  for (const animation of after.json.animations) {
    if (byName.has(animation.name)) {
      const coverage = donorCoverage.find(row => row.clipName === animation.name)
      const expectedTargets = coverage.rotationTargets
      const rotations = animation.channels.filter(channel => channel.target.path === 'rotation')
      const translations = animation.channels.filter(channel => channel.target.path === 'translation' && after.json.nodes[channel.target.node]?.name === 'mixamorig:Hips')
      if (!rotations.length || translations.length !== coverage.rootTranslations || animation.channels.length !== rotations.length + translations.length) throw new Error(`Motion replacement emitted unsupported channels for ${animation.name}.`)
      const actualTargets = rotations.map(channel => after.json.nodes[channel.target.node].name)
      if (!same(actualTargets, expectedTargets)) throw new Error(`Motion replacement dropped or reordered donor rotation targets for ${animation.name}.`)
    }
  }
  const buffer = serializeGlb(after.json, after.bin)
  return {
    buffer,
    report: {
      schemaVersion: 'betterpptx.named-presenter-motion-replacement.v1',
      sourceSha256: digest(source),
      outputSha256: digest(buffer),
      sourceBytes: source.length,
      outputBytes: buffer.length,
      replacedClipNames: [...replacingNames],
      preservedClipNames: originalNames.filter(name => !byName.has(name)),
      originalBinaryPrefixExact: true,
      originalAccessorsExact: true,
      originalBufferViewsExact: true,
      appearanceAndStoppedPostureExact: true,
      motionPolicies: matchedDonors.map(replacement => ({ clipName: replacement.clipName, ...replacement.policy })),
      donorCoverage,
      boneNameMatching: matchedDonors.map(replacement => ({ clipName: replacement.clipName, ...replacement.boneNameMatch })),
      boundaryBlendMs: 0,
      retargetValidation: result.retargetValidation,
      transplant: result.report,
    },
  }
}
