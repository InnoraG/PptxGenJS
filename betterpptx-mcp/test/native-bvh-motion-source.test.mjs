import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { Group, Quaternion, Vector3 } from 'three'
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js'
import { nativeBvhMotionSource } from '../assets/native-bvh-motion-source.mjs'
import { parseGlb, serializeGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'
import { sampleObjectSkeletalMotion, sampleGlbSkeletalMotion, compareSkeletalMotionPoses } from '../assets/skeletal-motion-pose-proof.mjs'

const roles={root:'Hips',head:'Head',leftFoot:'LeftFoot',rightFoot:'RightFoot',leftShoulder:'LeftArm',rightShoulder:'RightArm',leftElbow:'LeftForeArm',rightElbow:'RightForeArm',leftHand:'LeftHand',rightHand:'RightHand'}
const hierarchy=`HIERARCHY
ROOT Hips
{
 OFFSET 0 100 0
 CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
 JOINT Head
 {
  OFFSET 0 80 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  End Site
  {
   OFFSET 0 10 0
  }
 }
 JOINT LeftFoot
 {
  OFFSET 10 -100 0
  CHANNELS 3 Zrotation Xrotation Yrotation
 }
 JOINT RightFoot
 {
  OFFSET -10 -100 0
  CHANNELS 3 Zrotation Xrotation Yrotation
 }
 JOINT LeftArm
 {
  OFFSET 20 60 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  JOINT LeftForeArm
  {
   OFFSET 35 0 0
   CHANNELS 3 Zrotation Xrotation Yrotation
   JOINT LeftHand
   {
    OFFSET 30 0 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
     OFFSET 10 0 0
    }
   }
  }
 }
 JOINT RightArm
 {
  OFFSET -20 60 0
  CHANNELS 3 Zrotation Xrotation Yrotation
  JOINT RightForeArm
  {
   OFFSET -35 0 0
   CHANNELS 3 Zrotation Xrotation Yrotation
   JOINT RightHand
   {
    OFFSET -30 0 0
    CHANNELS 3 Zrotation Xrotation Yrotation
   }
  }
 }
}`
function fixture({flip=false}={}) {
  const frames=Array.from({length:7},(_,i)=>[i*3,i*2,-i,...[flip?i*60:0,0,0],0,i*4,i*3,0,0,0,0,0,0,-60-i*2,5,i*3,0,0,-35-i*2,0,0,0,60+i*2,-5,-i*3,0,0,35+i*2,0,0,0].join(' '))
  return Buffer.from(`${hierarchy}\nMOTION\nFrames: 7\nFrame Time: 0.1\n${frames.join('\n')}\n`)
}
function originalSamples(bytes,landmarks=roles,unitScale=.01){const parsed=new BVHLoader().parse(bytes.toString()),object=new Group();object.scale.setScalar(unitScale);object.add(parsed.skeleton.bones[0]);object.animations=[parsed.clip];object.updateMatrixWorld(true);return sampleObjectSkeletalMotion(object,{landmarks,sampleRateHz:30})}
function convertedSamples(buffer,landmarks=roles){return sampleGlbSkeletalMotion(buffer,{animationIndex:0,landmarks,sampleRateHz:30})}
function accessorRows(parsed, accessorIndex) {
  const accessor = parsed.json.accessors[accessorIndex], view = parsed.json.bufferViews[accessor.bufferView]
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type]
  const stride = view.byteStride || width * 4
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
  return Array.from({ length: accessor.count }, (_, index) => Array.from({ length: width }, (_, axis) => parsed.bin.readFloatLE(start + index * stride + axis * 4)))
}
function quaternionAngle(a,b){const norm=row=>row.map(value=>value/Math.hypot(...row));a=norm(a);b=norm(b);return 2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,value,index)=>sum+value*b[index],0))))*180/Math.PI}

test('native BVH conversion preserves ordered noncommuting arm rotations, offsets, translation and last-sample clock',()=>{
  const bytes=fixture(),before=Buffer.from(bytes),result=nativeBvhMotionSource(bytes,{animationName:'arm-gesture',unitScale:.01})
  assert.deepEqual(bytes,before)
  const proof=compareSkeletalMotionPoses(originalSamples(bytes),convertedSamples(result.buffer),{landmarkEnvelopeTolerance:1e-6,heightEnvelopeTolerance:1e-6})
  assert.equal(proof.status,'PASS',JSON.stringify(proof.failures))
  assert.equal(result.report.outputDurationMs,600);assert.equal(result.report.declaredCaptureSpanMs,700.0000000000001)
  assert.equal(result.report.animationResampling,false);assert.equal(result.report.automaticBoneOrientation,false)
  const parsed=parseGlb(result.buffer),names=parsed.json.nodes.map(node=>node.name)
  assert.equal(new Set(names).size,names.length)
  assert.equal(parsed.json.animations[0].name,'arm-gesture')
})

test('native BVH conversion keeps deliberate inversion instead of clamping the pose',()=>{
  const bytes=fixture({flip:true}),converted=nativeBvhMotionSource(bytes,{animationName:'flip',unitScale:.01})
  const proof=compareSkeletalMotionPoses(originalSamples(bytes),convertedSamples(converted.buffer),{landmarkEnvelopeTolerance:1e-6,heightEnvelopeTolerance:1e-6})
  assert.equal(proof.status,'PASS');assert(proof.source.invertedSampleCount>0);assert.equal(proof.candidate.invertedSampleCount,proof.source.invertedSampleCount)
})

test('explicit semantic naming changes identities only and preserves unmapped hierarchy',()=>{
  const bytes=fixture(),map=Object.fromEntries(Object.values(roles).map(name=>[name,`presenter:${name}`])),result=nativeBvhMotionSource(bytes,{animationName:'mapped',unitScale:.01,boneNameMap:map})
  const mapped=Object.fromEntries(Object.entries(roles).map(([role,name])=>[role,map[name]])),proof=compareSkeletalMotionPoses(originalSamples(bytes),convertedSamples(result.buffer,mapped),{landmarkEnvelopeTolerance:1e-6,heightEnvelopeTolerance:1e-6})
  assert.equal(proof.status,'PASS');assert.equal(result.report.namesExplicitlyMapped,10);assert.equal(result.report.originalNamesPreserved,false)
  assert.equal(result.report.unmappedHierarchyPreserved,true)
})

test('invalid BVH options, counts, hierarchy, channels, mapping and non-finite inputs fail closed',()=>{
  const bytes=fixture(),options={animationName:'test'}
  for(const input of [Buffer.from('bad'),Buffer.from(bytes.toString().replace('Frames: 7','Frames: 8')),Buffer.from(bytes.toString().replace('Zrotation Xrotation Yrotation','Zrotation Xrotation Qrotation')),Buffer.from(bytes.toString().replace('OFFSET 0 100 0','OFFSET 0 NaN 0')),Buffer.from(bytes.toString().replace('JOINT Head','JOINT Hips')),Buffer.from(bytes.toString().replace('MOTION','EXTRA MOTION')),Buffer.from(bytes.toString().replace('0.1','0'))])assert.throws(()=>nativeBvhMotionSource(input,options),error=>error.code==='NATIVE_BVH_SOURCE_INVALID')
  for(const override of [{unexpected:true},{unitScale:0},{unitScale:-1},{maximumInputBytes:1},{boneNameMap:{absent:'Head'}},{boneNameMap:{Head:'LeftArm'}}])assert.throws(()=>nativeBvhMotionSource(bytes,{...options,...override}),error=>error.code==='NATIVE_BVH_SOURCE_INVALID')
})

function rolledTarget(buffer) {
  const parsed=parseGlb(buffer),json=structuredClone(parsed.json),parents=Array(json.nodes.length).fill(-1),basis=[]
  json.nodes.forEach((node,index)=>(node.children||[]).forEach(child=>parents[child]=index))
  for(const [index,node]of json.nodes.entries()){
    const angle=node.name.includes('Arm')?Math.PI/2:node.name.includes('Hand')?Math.PI:0
    basis[index]=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle)
    const parent=parents[index],parentBasis=parent<0?new Quaternion():basis[parent]
    node.translation=new Vector3().fromArray(node.translation).applyQuaternion(parentBasis.clone().invert()).toArray()
    node.rotation=parentBasis.clone().invert().multiply(basis[index]).toArray()
  }
  return serializeGlb(json,parsed.bin)
}

test('explicit world-delta preserves forward elbows and hands across rolled target bases; bone-frame negative control fails',()=>{
  const source=nativeBvhMotionSource(fixture(),{animationName:'arm-gesture',unitScale:.01}).buffer,target=rolledTarget(source),before=Buffer.from(target)
  const selection={motionId:'gesture',sourceSlug:'arm-gesture',library:source,channelPolicy:'rotation-only'}
  const fixed=transplantMotionSet(target,[{...selection,rotationRetargetSpace:'world-delta'}]),legacy=transplantMotionSet(target,[{...selection,rotationRetargetSpace:'global'}])
  const sourceSamples=convertedSamples(source),fixedSamples=convertedSamples(fixed.glb)
  const proof=compareSkeletalMotionPoses(sourceSamples,fixedSamples,{landmarkEnvelopeTolerance:1e-6,heightEnvelopeTolerance:1e-6})
  assert.equal(proof.status,'PASS',JSON.stringify(proof.failures))
  assert.equal(compareSkeletalMotionPoses(sourceSamples,convertedSamples(legacy.glb),{landmarkEnvelopeTolerance:.1,heightEnvelopeTolerance:.1}).status,'FAIL')
  for(const [index,frame]of fixedSamples.frames.entries())for(const side of ['left','right']){
    const arm=frame[`${side}Elbow`].map((value,axis)=>value-frame[`${side}Shoulder`][axis]),hand=frame[`${side}Hand`].map((value,axis)=>value-frame[`${side}Elbow`][axis])
    assert(arm[1]<-.15,`${side} upper arm must point down at ${index}`);assert(hand[2]>.1,`${side} forearm must point forward at ${index}`)
  }
  assert.deepEqual(target,before);assert.equal(fixed.retargetValidation[0].rotationRetargetSpace,'world-delta')
  assert.equal(fixed.retargetValidation[0].boundaryBlendMs,0)
  const option=transplantMotionSet(target,[selection],{rotationRetargetSpace:'world-delta'})
  assert.deepEqual(option.glb,fixed.glb)
})

test('explicit first-frame world-delta reference removes captured source baseline and starts at destination rest',()=>{
  const source=nativeBvhMotionSource(fixture(),{animationName:'arm-gesture'}).buffer,target=rolledTarget(source)
  const result=transplantMotionSet(target,[{motionId:'gesture',sourceSlug:'arm-gesture',library:source,rotationRetargetSpace:'world-delta',rotationReference:'first-frame'}])
  const parsed=parseGlb(result.glb),animation=parsed.json.animations[0]
  let changed=false
  for(const channel of animation.channels.filter(item=>item.target.path==='rotation')){
    const node=parsed.json.nodes[channel.target.node], rows=accessorRows(parsed,animation.samplers[channel.sampler].output)
    const rest=node.rotation || [0,0,0,1]
    assert(quaternionAngle(rows[0],rest)<1e-4,`${node.name} first key must equal destination rest`)
    if(rows.slice(1).some(row=>quaternionAngle(row,rest)>1e-3)) changed=true
  }
  assert.equal(changed,true,'the first-frame reference must retain temporal motion on at least one mapped joint')
  assert.equal(result.retargetValidation[0].rotationReference,'first-frame')
  assert.equal(result.retargetValidation[0].sourceReferenceTimeSeconds,0)
  assert.throws(()=>transplantMotionSet(target,[{motionId:'gesture',sourceSlug:'arm-gesture',library:source,rotationRetargetSpace:'global',rotationReference:'first-frame'}]),error=>error.code==='MOTION_ROTATION_REFERENCE_UNSUPPORTED')
})

test('real interaction originals retain native arm poses through source conversion',t=>{
  const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),run=path.join(repo,'outputs/kimodo/betterpptx-authoring-v3-quality-001-final-expanded/betterpptx-authoring-v3-quality-001')
  if(!fs.existsSync(run)){t.skip('Original retained provenance corpus is not present; synthetic arm/basis regressions remain unconditional.');return}
  const map=JSON.parse(fs.readFileSync(path.join(repo,'betterpptx-mcp/deploy/model3d-worker/kimodo/soma77-bonemap.json'))).map
  const selectedRoles=Object.fromEntries(Object.entries(roles).map(([role,name])=>[role,map[`mixamorig:${name}`]]))
  for(const [folder,expected]of [['15-greet_bow',4167],['16-agree_nod',2767],['17-disagree_shake',2767]]){
    const original=fs.readFileSync(path.join(run,folder,'selected.bvh')),converted=nativeBvhMotionSource(original,{animationName:folder,unitScale:.01})
    assert.equal(converted.report.outputDurationMs,expected)
    const proof=compareSkeletalMotionPoses(originalSamples(original,selectedRoles),convertedSamples(converted.buffer,selectedRoles),{landmarkEnvelopeTolerance:1e-6,heightEnvelopeTolerance:1e-6})
    assert.equal(proof.status,'PASS',JSON.stringify(proof.failures))
  }
})

test('world-delta rejects unmodeled basis, partial hierarchy and mixed interpolation instead of dropping them',()=>{
  const source=nativeBvhMotionSource(fixture(),{animationName:'arm-gesture'}).buffer,target=rolledTarget(source)
  const selection={motionId:'gesture',sourceSlug:'arm-gesture',library:source,rotationRetargetSpace:'world-delta'}
  for(const filter of [{includeBones:['LeftHand']},{excludeBones:['LeftArm']}])assert.throws(()=>transplantMotionSet(target,[{...selection,...filter}]),error=>error.code==='MOTION_WORLD_DELTA_FILTER_UNSUPPORTED')
  const parsed=parseGlb(target)
  for(const scale of [[1,2,1],[1,1.0002,1],[-1,-1,-1],[1,0,1]]){
    const json=structuredClone(parsed.json);json.nodes.find(node=>node.name==='LeftArm').scale=scale
    assert.throws(()=>transplantMotionSet(serializeGlb(json,parsed.bin),[selection]),error=>error.code==='MOTION_WORLD_DELTA_BASIS_INVALID')
  }
  const imported=structuredClone(parsed.json);imported.nodes.find(node=>node.name==='LeftArm').scale=[1,1.00002,1]
  const tolerated=transplantMotionSet(serializeGlb(imported,parsed.bin),[selection])
  assert.deepEqual(parseGlb(tolerated.glb).json.nodes.find(node=>node.name==='LeftArm').scale,[1,1.00002,1],'Imported scale roundoff is preserved exactly, never normalized away.')
  const input=parseGlb(source),json=structuredClone(input.json),animation=json.animations[0],channel=animation.channels.find(channel=>channel.target.path==='rotation')
  animation.samplers[channel.sampler].interpolation='STEP'
  assert.throws(()=>transplantMotionSet(target,[{...selection,library:serializeGlb(json,input.bin)}]),error=>error.code==='MOTION_WORLD_DELTA_INTERPOLATION_INVALID')
})
