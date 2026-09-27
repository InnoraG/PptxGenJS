// Maintainer-only original BVH conversion. No canonical skeleton bake, bone
// reorientation, pose filtering, resampling, source mutation or registry writes.
import { createHash } from 'node:crypto'
import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'
import { nativeMotionObjectToGlb } from './native-fbx-motion-source.mjs'

const fail = message => Object.assign(new Error(message), { code: 'NATIVE_BVH_SOURCE_INVALID' })
const requireThat = (condition, message) => { if (!condition) throw fail(message) }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const CHANNELS = new Set(['Xposition','Yposition','Zposition','Xrotation','Yrotation','Zrotation'])

/**
 * Convert one BVH take in its original world-axis skeletal basis. BVH offsets
 * and Euler channel order are authoritative. Bone names may be explicitly
 * mapped to a destination's semantic IDs; unmapped bones/hierarchy are retained.
 * The motion endpoint is (frames - 1) * frameTime, not frames * frameTime.
 * @param {Uint8Array} input Original UTF-8 BVH bytes.
 * @param {{animationName:string,unitScale?:number,boneNameMap?:Record<string,string>,maximumInputBytes?:number}} options
 */
export function nativeBvhMotionSource(input, options = {}) {
  requireThat(input instanceof Uint8Array, 'Original BVH bytes are required.')
  requireThat(options && typeof options === 'object' && !Array.isArray(options)
    && Object.keys(options).every(key => ['animationName','unitScale','boneNameMap','maximumInputBytes'].includes(key)), 'Unknown BVH conversion options are unsupported.')
  const { animationName, unitScale = 1, boneNameMap = {}, maximumInputBytes = 32 * 1024 * 1024 } = options
  requireThat(Number.isSafeInteger(maximumInputBytes) && maximumInputBytes > 0 && maximumInputBytes <= 128 * 1024 * 1024
    && input.length > 0 && input.length <= maximumInputBytes, 'BVH input must be nonempty and within the explicit resource bound.')
  requireThat(Number.isFinite(unitScale) && unitScale >= 1e-6 && unitScale <= 1e6, 'BVH unitScale must be finite and positive within supported bounds.')
  requireThat(boneNameMap && typeof boneNameMap === 'object' && !Array.isArray(boneNameMap)
    && Object.entries(boneNameMap).every(([from,to]) => from.length > 0 && typeof to === 'string' && to.length > 0 && to.trim() === to), 'Bone names require an explicit nonempty source-to-output map.')
  const bytes = Buffer.from(input), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const tokens = text.trim().split(/\s+/), names = new Set(), outputNames = new Set(), bones = []
  let cursor = 0, totalChannels = 0, endSites = 0
  const take = expected => {
    const token = tokens[cursor++]
    requireThat(token !== undefined && (expected === undefined || token === expected), `BVH syntax requires ${expected || 'another token'}.`)
    return token
  }
  const number = () => { const token = take(), value = Number(token); requireThat(Number.isFinite(value), 'BVH numeric values must be finite.'); return value }
  const integer = (minimum,maximum) => { const value = number(); requireThat(Number.isSafeInteger(value) && value >= minimum && value <= maximum, 'BVH integer field exceeds supported bounds.'); return value }
  const readBone = (kind, depth) => {
    requireThat(depth <= 128 && bones.length < 1000, 'BVH hierarchy exceeds supported bounds.')
    const end = kind === 'End'
    if (end) take('Site')
    const name = end ? `source-end-site-${endSites++}` : take()
    requireThat(end || (!names.has(name) && name.length <= 160), 'BVH named joints must have unambiguous bounded identities.')
    if (!end) names.add(name)
    const outputName = end ? name : Object.hasOwn(boneNameMap,name) ? boneNameMap[name] : name
    requireThat(!outputNames.has(outputName), 'Mapped BVH identities collide.')
    outputNames.add(outputName)
    take('{'); take('OFFSET')
    const bone = new Bone(); bone.name = `source-bone-${String(bones.length).padStart(4,'0')}`; bone.userData.originalName = outputName
    bone.position.set(number(),number(),number())
    const record = { bone, sourceName: end ? null : name, outputName, channels:[], positions:[], rotations:[], end }
    bones.push(record)
    if (!end) {
      take('CHANNELS'); const count = integer(0,6)
      for (let index=0;index<count;index++) {
        const channel = take()
        requireThat(CHANNELS.has(channel) && !record.channels.includes(channel), 'BVH channels must be supported and unique per joint.')
        record.channels.push(channel)
      }
      totalChannels += count
    }
    while (tokens[cursor] !== '}') {
      requireThat(!end, 'BVH End Site cannot contain children.')
      const child = take(); requireThat(child === 'JOINT' || child === 'End', 'BVH requires a JOINT, End Site or closing brace.')
      bone.add(readBone(child,depth+1))
    }
    take('}')
    return bone
  }
  take('HIERARCHY'); take('ROOT'); const rootBone = readBone('ROOT',0)
  requireThat(Object.keys(boneNameMap).every(name => names.has(name)), 'Every explicit bone mapping must identify an existing source joint.')
  take('MOTION'); take('Frames:'); const frameCount = integer(2,100000)
  take('Frame'); take('Time:'); const frameTime = number()
  requireThat(frameTime > 0 && (frameCount-1)*frameTime <= 3600 && totalChannels > 0
    && frameCount*totalChannels <= 12000000, 'BVH clock or channel resources exceed supported bounds.')
  requireThat(tokens.length-cursor === frameCount*totalChannels, 'BVH frame data must exactly match the declared frame/channel counts.')
  const axes = { X:new Vector3(1,0,0), Y:new Vector3(0,1,0), Z:new Vector3(0,0,1) }, turn = new Quaternion(), times = []
  for (let frame=0;frame<frameCount;frame++) {
    times.push(frame*frameTime)
    for (const record of bones) {
      if (record.end) continue
      const position = record.bone.position.clone(), rotation = new Quaternion()
      for (const channel of record.channels) {
        const value = number(), axis = channel[0]
        if (channel.endsWith('position')) position[axis.toLowerCase()] += value
        else rotation.multiply(turn.setFromAxisAngle(axes[axis],value*Math.PI/180))
      }
      record.positions.push(...position.toArray()); record.rotations.push(...rotation.toArray())
    }
  }
  const tracks = bones.filter(record => !record.end).flatMap(record => [
    new VectorKeyframeTrack(`${record.bone.name}.position`,times,record.positions),
    new QuaternionKeyframeTrack(`${record.bone.name}.quaternion`,times,record.rotations),
  ])
  const object = new Group(); object.name = 'source-native-bvh-frame'; object.scale.setScalar(unitScale); object.add(rootBone)
  object.animations = [new AnimationClip('native-bvh-take',-1,tracks)]; object.updateMatrixWorld(true)
  const result = nativeMotionObjectToGlb(object,{animationName})
  return { buffer:result.buffer, report:{ ...result.report, sourceFormat:'BVH', sourceBytes:bytes.length, sourceSha256:sha256(bytes),
    unitScale, boneNameMap:{...boneNameMap}, namesExplicitlyMapped:Object.keys(boneNameMap).length,
    originalNamesPreserved:Object.keys(boneNameMap).length === 0, unmappedHierarchyPreserved:true,
    declaredFrameCount:frameCount, declaredFrameTimeSeconds:frameTime,
    sourceSampleEndpointMs:(frameCount-1)*frameTime*1000, declaredCaptureSpanMs:frameCount*frameTime*1000,
    timePolicy:'Original key endpoint (frameCount-1)*frameTime; no synthetic final frame or hold is added.',
    retargetPolicyHint:'World-axis source: use explicit world-delta rotation retargeting after confirming the source and destination share world axes.',
  } }
}
