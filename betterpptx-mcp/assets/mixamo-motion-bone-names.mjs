import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const suffix = name => /^mixamorig\d*:(.+)$/.exec(String(name || ''))?.[1] || null

function incompatible(message) {
  const error = new Error(message)
  error.code = 'MOTION_BONE_NAME_MAPPING_INVALID'
  return error
}

/**
 * Match source-only Mixamo namespaces to the exact names on an existing rig.
 * Mixamo increments the namespace independently on downloads. Some approved
 * rigs have canonical body names but retain numbered names on their fingers.
 * A bone's unique suffix identifies the same joint; no transform, node index,
 * animation value, destination name, or skinning data is changed here.
 */
export function matchMixamoMotionBoneNames(libraryBuffer, targetBuffer) {
  const original = Buffer.from(libraryBuffer)
  const library = parseGlb(original)
  const target = parseGlb(targetBuffer)
  const targetBySuffix = new Map()
  for (const node of target.json.nodes || []) {
    const key = suffix(node.name)
    if (!key) continue
    if (targetBySuffix.has(key)) throw incompatible('The presenter contains ambiguous joint identities; this motion cannot be matched safely.')
    targetBySuffix.set(key, node.name)
  }
  const seenSource = new Set()
  const aliases = []
  for (const node of library.json.nodes || []) {
    const key = suffix(node.name)
    if (!key) continue
    if (seenSource.has(key)) throw incompatible('The motion contains ambiguous joint identities; it cannot be matched safely.')
    seenSource.add(key)
    const destinationName = targetBySuffix.get(key)
    if (!destinationName) throw incompatible('The motion and presenter skeletons cannot be matched without dropping joints.')
    if (node.name !== destinationName) {
      aliases.push({ from: node.name, to: destinationName })
      node.name = destinationName
    }
  }
  if (!seenSource.size) throw incompatible('The motion does not contain a supported named skeleton.')
  const buffer = aliases.length ? serializeGlb(library.json, library.bin) : original
  return {
    buffer,
    report: {
      policy: 'mixamo-suffix',
      sourceJoints: seenSource.size,
      renamedSourceNodes: aliases.length,
      aliases,
      sourceBinaryExact: true,
      targetUntouched: true,
    },
  }
}
