import {createHash} from 'node:crypto'

export const SOURCE_KINEMATICS_SCHEMA='betterpptx.source-sampled-kinematics.v1'
export const SOURCE_NATIVE_LANDMARK_MEASUREMENT_SCHEMA='betterpptx.private-source-landmark-measurement.v1'
const joints=['root','chest','head','leftHand','rightHand']
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)
const fail=()=>{throw Object.assign(new Error('Source movement evidence is unavailable.'),{code:'SOURCE_KINEMATICS_INVALID'})}
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k))
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x))
const polyline=points=>points.slice(1).reduce((n,p,i)=>n+distance(p,points[i]),0)

// Trusted metadata derivation from an already bound dense measurement. No imports,
// raw-source reads, physical-unit inference or semantic qualification occur here.
export function deriveSourceReviewKinematics(measurement,{sourceSha256,measurementArtifactSha256,sourceObservation}={}){
 const native=measurement?.schemaVersion===SOURCE_NATIVE_LANDMARK_MEASUREMENT_SCHEMA
 if((!native&&measurement?.schemaVersion!=='e15-private-dense-source.v1')||measurement.status!=='PASS'||!hash(sourceSha256)||!hash(measurementArtifactSha256)||measurement.source?.actualSha256!==sourceSha256||measurement.coordinateFrame?.positions!=='SOURCE_WORLD')fail()
 if(native&&(measurement.coordinateFrame.basis!=='SOURCE_NATIVE_CONVENTION'||measurement.coordinateFrame.basisSignCalibrated!==false||measurement.coordinateFrame.slideProjectionCalibrated!==false))fail()
 const clock=sourceObservation?.clock,frames=measurement.frames,timeline=measurement.timeline
 if(!clock||!Array.isArray(frames)||frames.length<2||frames.length!==clock.sampleCount||frames.length!==clock.frameCount||timeline?.sampling!=='EVERY_INTEGER_FRAME'||timeline.durationMs!==clock.durationMs||timeline.fps!==clock.fps||timeline.frameCount!==clock.frameCount)fail()
 for(const [i,f]of frames.entries()){
  if(f.frame!==timeline.startFrame+i||!finite(f.atMs)||Math.abs(f.atMs-i*1000/clock.fps)>0.000001||i&&f.atMs<=frames[i-1].atMs||[...joints,'leftShoulder','rightShoulder'].some(j=>!vector(f.positions?.[j])))fail()
 }
 if(frames[0].atMs!==0||Math.abs(frames.at(-1).atMs-clock.durationMs)>0.000001)fail()
 const spans=frames.map(f=>distance(f.positions.leftShoulder,f.positions.rightShoulder)).sort((a,b)=>a-b)
 if(spans.some(span=>span<=0)||timeline.endFrame!==timeline.startFrame+frames.length-1)fail()
 const mid=Math.floor(spans.length/2),referenceSpan=spans.length%2?spans[mid]:(spans[mid-1]+spans[mid])/2
 if(!finite(referenceSpan)||referenceSpan<=0)fail()
 const landmarks=Object.fromEntries(joints.map(j=>{
  const points=frames.map(f=>f.positions[j]),relative=frames.map(f=>f.positions[j].map((v,i)=>v-f.positions.root[i]))
  return [j,{sampledPathShoulderSpans:polyline(points)/referenceSpan,netDisplacementShoulderSpans:distance(points[0],points.at(-1))/referenceSpan,rootRelativeSampledPathShoulderSpans:polyline(relative)/referenceSpan}]
 }))
 const provenance={adapterSha256:measurement.adapterSha256,rigRestSha256:measurement.rig?.restIdentitySha256,frameStart:timeline.startFrame,frameEnd:timeline.endFrame,landmarkNames:Object.fromEntries([...joints,'leftShoulder','rightShoulder'].map(j=>[j,measurement.rig?.resolvedBones?.[j]])),coordinateFrame:{...measurement.coordinateFrame}}
 return validateSourceReviewKinematics({schemaVersion:SOURCE_KINEMATICS_SCHEMA,sourceSha256,measurementArtifactSha256,clock:{...clock},provenance,referenceSpan,landmarks},sourceSha256,sourceObservation)
}

export function validateSourceReviewKinematics(value,sourceSha256,observation){
 if(!exact(value,['schemaVersion','sourceSha256','measurementArtifactSha256','clock','provenance','referenceSpan','landmarks'])||value.schemaVersion!==SOURCE_KINEMATICS_SCHEMA||value.sourceSha256!==sourceSha256||!hash(value.sourceSha256)||!hash(value.measurementArtifactSha256)||!finite(value.referenceSpan)||value.referenceSpan<=0||!exact(value.clock,Object.keys(observation.clock))||Object.entries(observation.clock).some(([k,v])=>value.clock[k]!==v)||!exact(value.landmarks,joints))fail()
 const p=value.provenance
 if(!exact(p,['adapterSha256','rigRestSha256','frameStart','frameEnd','landmarkNames','coordinateFrame'])||!hash(p.adapterSha256)||!hash(p.rigRestSha256)||!Number.isSafeInteger(p.frameStart)||!Number.isSafeInteger(p.frameEnd)||p.frameEnd-p.frameStart+1!==value.clock.frameCount||!exact(p.landmarkNames,[...joints,'leftShoulder','rightShoulder'])||Object.values(p.landmarkNames).some(name=>typeof name!=='string'||!name||name.length>256)||!exact(p.coordinateFrame,['positions','basis','basisSignCalibrated','slideProjectionCalibrated'])||p.coordinateFrame.positions!=='SOURCE_WORLD'||!['ACTOR_GEOMETRIC_CONVENTION','SOURCE_NATIVE_CONVENTION'].includes(p.coordinateFrame.basis)||typeof p.coordinateFrame.basisSignCalibrated!=='boolean'||typeof p.coordinateFrame.slideProjectionCalibrated!=='boolean')fail()
 if(p.coordinateFrame.basis==='SOURCE_NATIVE_CONVENTION'&&(p.coordinateFrame.basisSignCalibrated||p.coordinateFrame.slideProjectionCalibrated))fail()
 for(const landmark of Object.values(value.landmarks))if(!exact(landmark,['sampledPathShoulderSpans','netDisplacementShoulderSpans','rootRelativeSampledPathShoulderSpans'])||Object.values(landmark).some(v=>!finite(v))||landmark.netDisplacementShoulderSpans>landmark.sampledPathShoulderSpans+1e-9)fail()
 return structuredClone(value)
}

export function publicSourceReviewKinematics(value){
 const evidenceId='evidence_'+createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32)
 const {root,...other}=value.landmarks
 return {schemaVersion:SOURCE_KINEMATICS_SCHEMA,evidenceId,basis:{coordinateSpace:'source-motion-space',unit:'measured-shoulder-spans',reference:'median distance between sampled left and right shoulder origins',sampling:'every-integer-frame',clock:{...value.clock},physicalUnits:'unverified',continuousPath:'not-established',rootRelativeFrame:'source axes with root translation removed; body rotation remains'},landmarks:structuredClone({rootJoint:root,...other}),limitation:'Sampled polyline distances divided by the same source’s median shoulder span. These are dimensionless geometric comparisons, not meters, body height, continuous path bounds, anatomical facing, slide direction, action ownership or a qualified hold.'}
}
