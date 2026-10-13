import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {deriveSourceReviewKinematics,validateSourceReviewKinematics} from './motion-source-kinematics.mjs'

export const SOURCE_MOVEMENT_TIMELINE_SCHEMA='betterpptx.source-sampled-movement-timeline.v1'
export const MOVEMENT_LANDMARKS=Object.freeze(['rootJoint','chest','head','leftHand','rightHand'])
const frames=['source-world','root-translation-removed']
const fail=()=>{throw Object.assign(new Error('Source movement timing evidence is unavailable.'),{code:'SOURCE_MOVEMENT_TIMELINE_INVALID'})}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')

// Derive only from the already-authorized dense samples, retaining source timing.
// Per-edge travel supports explicit AI-owned thresholds without semantic labels.
export function deriveSourceMovementTimeline(measurement,input){
 const geometry=deriveSourceReviewKinematics(measurement,input)
 if(input.sourceKinematics&&!isDeepStrictEqual(geometry,input.sourceKinematics))fail()
 const samples=measurement.frames,landmarks={}
 for(const joint of MOVEMENT_LANDMARKS){
  const key=joint==='rootJoint'?'root':joint,points=samples.map(f=>f.positions[key]),relative=samples.map(f=>f.positions[key].map((v,i)=>v-f.positions.root[i]))
  const travel=values=>values.slice(1).map((p,i)=>distance(p,values[i])/geometry.referenceSpan)
  landmarks[joint]={sourceWorld:travel(points),rootTranslationRemoved:travel(relative)}
 }
 return validateSourceMovementTimeline({schemaVersion:SOURCE_MOVEMENT_TIMELINE_SCHEMA,sourceSha256:geometry.sourceSha256,measurementArtifactSha256:geometry.measurementArtifactSha256,clock:geometry.clock,referenceSpan:geometry.referenceSpan,frameStart:geometry.provenance.frameStart,frameTimesMs:samples.map(f=>f.atMs),landmarks},input.sourceSha256,input.sourceObservation,geometry)
}

export function validateSourceMovementTimeline(value,sourceSha256,observation,kinematics){
 const geometry=validateSourceReviewKinematics(kinematics,sourceSha256,observation)
 if(!exact(value,['schemaVersion','sourceSha256','measurementArtifactSha256','clock','referenceSpan','frameStart','frameTimesMs','landmarks'])||value.schemaVersion!==SOURCE_MOVEMENT_TIMELINE_SCHEMA||value.sourceSha256!==sourceSha256||value.measurementArtifactSha256!==geometry.measurementArtifactSha256||!isDeepStrictEqual(value.clock,geometry.clock)||value.referenceSpan!==geometry.referenceSpan||value.frameStart!==geometry.provenance.frameStart||!exact(value.landmarks,MOVEMENT_LANDMARKS))fail()
 const times=value.frameTimesMs,n=value.clock.frameCount
 if(!Array.isArray(times)||n<2||n>30000||times.length!==n||times[0]!==0)fail()
 for(let i=0;i<n;i++)if(!Object.hasOwn(times,i)||!nonnegative(times[i])||Math.abs(times[i]-i*1000/value.clock.fps)>0.000001||i&&times[i]<=times[i-1])fail()
 if(Math.abs(times.at(-1)-value.clock.durationMs)>0.000001)fail()
 for(const joint of MOVEMENT_LANDMARKS){
  const row=value.landmarks[joint],key=joint==='rootJoint'?'root':joint
  if(!exact(row,['sourceWorld','rootTranslationRemoved']))fail()
  for(const [frame,metric]of [['sourceWorld','sampledPathShoulderSpans'],['rootTranslationRemoved','rootRelativeSampledPathShoulderSpans']]){
   const steps=row[frame];if(!Array.isArray(steps)||steps.length!==n-1)fail()
   for(let i=0;i<steps.length;i++)if(!Object.hasOwn(steps,i)||!nonnegative(steps[i]))fail()
   if(joint==='rootJoint'&&frame==='rootTranslationRemoved'&&steps.some(v=>v!==0))fail()
   const expected=geometry.landmarks[key][metric],sum=steps.reduce((a,b)=>a+b,0)
   if(Math.abs(sum-expected)>1e-9*Math.max(1,expected))fail()
  }
 }
 return structuredClone(value)
}

export function publicSourceMovementTimeline(value){
 return {schemaVersion:SOURCE_MOVEMENT_TIMELINE_SCHEMA,evidenceId:'evidence_'+digest(value).slice(0,32),basis:{coordinateSpace:'source-motion-space',unit:'measured-shoulder-spans',timeUnit:'milliseconds',sampling:'every-integer-frame',reference:'same-source median shoulder-origin span',clock:structuredClone(value.clock),continuousPath:'not-established',physicalUnits:'unverified',rootRelativeRoot:'zero-by-definition; not evidence of source immobility'},frameStart:value.frameStart,frameTimesMs:[...value.frameTimesMs],landmarks:structuredClone(value.landmarks),qualification:{semanticAction:'unqualified',owningHand:'unqualified',holdPhase:'unqualified',nativePlayback:'unqualified'}}
}

const speedBoundSchema={type:'object',additionalProperties:false,required:['landmark'],anyOf:[{required:['minimumStepSpeedShoulderSpansPerSecond']},{required:['maximumStepSpeedShoulderSpansPerSecond']}],properties:{landmark:{type:'string',enum:MOVEMENT_LANDMARKS},minimumStepSpeedShoulderSpansPerSecond:{type:'number',minimum:0},maximumStepSpeedShoulderSpansPerSecond:{type:'number',minimum:0}}}
export const MOTION_WINDOW_REQUIREMENTS_SCHEMA={type:'object',additionalProperties:false,required:['minimumDurationMs','frame'],oneOf:[{required:['landmarks','maximumStepSpeedShoulderSpansPerSecond'],not:{required:['speedBounds']}},{required:['speedBounds'],not:{anyOf:[{required:['landmarks']},{required:['maximumStepSpeedShoulderSpansPerSecond']}]}}],properties:{landmarks:{type:'array',minItems:1,maxItems:5,uniqueItems:true,items:{type:'string',enum:MOVEMENT_LANDMARKS}},maximumStepSpeedShoulderSpansPerSecond:{type:'number',minimum:0},speedBounds:{type:'array',minItems:1,maxItems:5,items:speedBoundSchema,description:'Distinct landmarks with explicit inclusive minimum and/or maximum per-edge speeds. Every bound must hold on every edge; use different bounds for an active hand and quieter body. Thresholds are AI-authored assumptions, not semantic phase labels.'},minimumDurationMs:{type:'number',exclusiveMinimum:0},frame:{type:'string',enum:frames}},description:'Find maximal source-sampled intervals with explicit per-edge landmark speed and duration constraints. Choose a shared maximum or separate speedBounds. Geometry does not qualify an action, owning hand, gesture hold or prepared/native playback.'}
export function validateMotionWindowRequirements(value){
 const invalid=()=>{throw Object.assign(new Error('Motion window checks require a shared maximum or distinct landmark speed bounds, an explicit source frame and positive duration.'),{code:'MOTION_WINDOW_REQUIREMENTS_INVALID'})}
 if(!value||!nonnegative(value.minimumDurationMs)||value.minimumDurationMs===0||!frames.includes(value.frame))invalid()
 if(Object.hasOwn(value,'speedBounds')){
  if(!exact(value,['speedBounds','minimumDurationMs','frame'])||!Array.isArray(value.speedBounds)||value.speedBounds.length<1||value.speedBounds.length>5)invalid()
  const seen=new Set()
  for(const bound of Array.from(value.speedBounds)){
   if(!bound||typeof bound!=='object'||Array.isArray(bound))invalid()
   const keys=Reflect.ownKeys(bound),allowed=['landmark','minimumStepSpeedShoulderSpansPerSecond','maximumStepSpeedShoulderSpansPerSecond']
   if(!Object.hasOwn(bound,'landmark')||!MOVEMENT_LANDMARKS.includes(bound.landmark)||seen.has(bound.landmark)||keys.some(k=>!allowed.includes(k))||keys.length<2)invalid()
   for(const key of allowed.slice(1))if(Object.hasOwn(bound,key)&&!nonnegative(bound[key]))invalid()
   if(bound.minimumStepSpeedShoulderSpansPerSecond!==undefined&&bound.maximumStepSpeedShoulderSpansPerSecond!==undefined&&bound.minimumStepSpeedShoulderSpansPerSecond>bound.maximumStepSpeedShoulderSpansPerSecond)invalid()
   seen.add(bound.landmark)
  }
 }else if(!exact(value,['landmarks','maximumStepSpeedShoulderSpansPerSecond','minimumDurationMs','frame'])||!Array.isArray(value.landmarks)||value.landmarks.length<1||value.landmarks.length>5||Array.from(value.landmarks).some(j=>!MOVEMENT_LANDMARKS.includes(j))||new Set(value.landmarks).size!==value.landmarks.length||!nonnegative(value.maximumStepSpeedShoulderSpansPerSecond))invalid()
 return structuredClone(value)
}

export function sourceMovementWindows(timeline,requirements){
 const request=validateMotionWindowRequirements(requirements)
 if(!timeline)return {state:'unknown',request,reason:'Source sampled movement timeline has not been published for this candidate.',holdPhaseQualification:'unqualified'}
 if(timeline.schemaVersion!==SOURCE_MOVEMENT_TIMELINE_SCHEMA)fail()
 const key=request.frame==='source-world'?'sourceWorld':'rootTranslationRemoved',times=timeline.frameTimesMs,all=[]
 const bounds=request.speedBounds??request.landmarks.map(landmark=>({landmark,maximumStepSpeedShoulderSpansPerSecond:request.maximumStepSpeedShoulderSpansPerSecond}))
 const speed=(joint,i)=>timeline.landmarks[joint][key][i]/((times[i+1]-times[i])/1000)
 let start=null
 const close=end=>{
  if(start===null)return
  const durationMs=times[end]-times[start]
  if(durationMs>=request.minimumDurationMs){
   const movement=Object.fromEntries(bounds.map(({landmark:j})=>{const speeds=Array.from({length:end-start},(_,k)=>speed(j,start+k));return [j,{sampledPathShoulderSpans:timeline.landmarks[j][key].slice(start,end).reduce((a,b)=>a+b,0),maximumStepSpeedShoulderSpansPerSecond:Math.max(...speeds),...(request.speedBounds?{minimumStepSpeedShoulderSpansPerSecond:Math.min(...speeds)}:{})}]}))
   all.push({startFrame:timeline.frameStart+start,endFrame:timeline.frameStart+end,startMs:times[start],endMs:times[end],durationMs,sampleCount:end-start+1,movement})
  }
  start=null
 }
 for(let i=0;i<times.length-1;i++){
  if(bounds.every(bound=>{const observed=speed(bound.landmark,i);return nonnegative(observed)&&(bound.minimumStepSpeedShoulderSpansPerSecond===undefined||observed>=bound.minimumStepSpeedShoulderSpansPerSecond)&&(bound.maximumStepSpeedShoulderSpansPerSecond===undefined||observed<=bound.maximumStepSpeedShoulderSpansPerSecond)})){if(start===null)start=i}
  else close(i)
 }
 close(times.length-1)
 return {state:all.length?'measured-windows':'no-measured-window',request,evidenceId:timeline.evidenceId,clock:structuredClone(timeline.basis.clock),unit:'measured-shoulder-spans',scope:'source-sampled-geometry-only',windows:all.slice(0,20),windowCount:all.length,windowsTruncated:all.length>20,holdPhaseQualification:'unqualified',owningHandQualification:'unqualified',preparedTargetTiming:'not-established',continuousPath:'not-established',interpretation:request.frame==='root-translation-removed'?'Root translation is removed; body rotation remains. rootJoint travel is zero by definition. These intervals are not qualified gesture holds.':'Every selected landmark satisfies the per-edge speed threshold on the retained source samples. These intervals are not qualified gesture holds.'}
}

export function evaluateMotionWindowCatalog(entries,requirements,{offset=0,referenceLimit=20}={}){
 const request=validateMotionWindowRequirements(requirements),matches=[],counts={considered:entries.length,measuredWindowMatches:0,totalMatchingWindows:0,noMeasuredWindow:0,unknown:0,requestedPropertiesAndWindowsSatisfied:0,requestedPropertiesUnknownWithWindows:0,requestedPropertiesUnmetWithWindows:0},resultSetId='motion-window-query_'+createHash('sha256').update(JSON.stringify({request,entries:entries.map(e=>[e.id,e.measurements?.sourceMovementTimeline?.evidenceId??null,e.selectable===true,e.requirementFit??null])})).digest('hex').slice(0,32)
 for(const [catalogOffset,entry]of entries.entries()){
  const result=sourceMovementWindows(entry.measurements?.sourceMovementTimeline,request)
  if(result.state==='unknown'){counts.unknown++;continue}
  if(result.state==='no-measured-window'){counts.noMeasuredWindow++;continue}
  counts.measuredWindowMatches++
  counts.totalMatchingWindows+=result.windowCount
  const requestedFitStatus=entry.requirementFit?.status||'not-requested'
  if(requestedFitStatus==='requirements-satisfied'||requestedFitStatus==='not-requested')counts.requestedPropertiesAndWindowsSatisfied++
  else if(requestedFitStatus==='review-required')counts.requestedPropertiesUnknownWithWindows++
  else counts.requestedPropertiesUnmetWithWindows++
  matches.push({catalogId:entry.id,catalogOffset,evidenceId:result.evidenceId,matchingWindowCount:result.windowCount,windowDetailsTruncated:result.windowsTruncated,executionAvailable:entry.selectable===true,requestedFitStatus,qualificationScope:'source-sampled-geometry-only'})
 }
 const remaining=matches.filter(reference=>reference.catalogOffset>=offset),references=remaining.slice(0,referenceLimit)
 return {request,scope:'filtered-catalog',status:matches.length?'measured-window-matches':'no-measured-window-match',resultSetId,counts,windowMatchReferences:references,windowMatchReferencesTruncated:remaining.length>references.length,referenceScope:'at-or-after-page-offset',matchedBeforeOffset:matches.length-remaining.length,nextMatchReferenceOffset:remaining[referenceLimit]?.catalogOffset??null,referenceNavigation:'Keep the same family, query, motion requirements and window requirements; require the same resultSetId before reusing offsets. Request the reference catalogOffset for its card or nextMatchReferenceOffset for the next reference group.',automaticSelection:false,selectionAuthority:'ai',holdPhaseQualification:'unqualified',owningHandQualification:'unqualified',preparedTargetTiming:'not-established'}
}

export function motionComparisonWindows(page,catalog,requirements){
 const request=validateMotionWindowRequirements(requirements),byId=new Map(catalog.entries.map(e=>[e.id,e])),next=structuredClone(page)
 for(const card of next.candidates)card.sourceMovementWindows=sourceMovementWindows(byId.get(card.catalogId)?.measurements?.sourceMovementTimeline,request)
 next.motionWindowQuery=catalog.motionWindowQuery?structuredClone(catalog.motionWindowQuery):{request,scope:'returned-candidates-only',automaticSelection:false,holdPhaseQualification:'unqualified'}
 return next
}
